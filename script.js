import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-analytics.js";
import { getAuth, signOut, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDocs, updateDoc, deleteDoc, query, where, orderBy, getDoc, addDoc, increment, Timestamp, writeBatch, runTransaction } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDnwmV7Xms2PyAZJDQQ_upjQkldoVkF_tk",
  authDomain: "meu-diario-de-oracao.firebaseapp.com",
  projectId: "meu-diario-de-oracao",
  storageBucket: "meu-diario-de-oracao.firebasestorage.app",
  messagingSenderId: "718315400702",
  appId: "1:718315400702:web:eaabc0bfbf6b88e6a5e4af",
  measurementId: "G-G0838BBW07"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);

// Global variables
let prayerTargets = [];
let archivedTargets = [];
let resolvedTargets = [];
let lastDisplayedTargets = [];
let currentPage = 1;
let currentArchivedPage = 1;
let currentResolvedPage = 1;
const targetsPerPage = 10;
let currentSearchTermMain = '';
let currentSearchTermArchived = '';
let currentSearchTermResolved = '';
let showDeadlineOnly = false;
let currentDailyTargets = []; // Holds IDs of targets currently in the daily list

// Data for the PROGRESS BAR (Consecutive Days)
let perseveranceData = {
    consecutiveDays: 0,
    lastInteractionDate: null, // Date of the *last day* an "Orei!" click updated the streak
    recordDays: 0
};

// Data for the WEEKLY CHART (Daily Interactions)
let weeklyPrayerData = {
    weekId: null,
    interactions: {}
};

// Predefined list of categories
const predefinedCategories = ["Família", "Pessoal", "Igreja", "Trabalho", "Sonho", "Profético", "Promessas", "Outros"];

// ==== UTILITY FUNCTIONS ====

// Function to get the ISO week identifier (Year-W##) for a date
function getWeekIdentifier(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

// Helper to create a Date object representing UTC midnight from a YYYY-MM-DD string
function createUTCDate(dateString) {
    if (!dateString || typeof dateString !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        return null;
    }
    const date = new Date(dateString + 'T00:00:00Z');
    if (isNaN(date.getTime())) {
        return null;
    }
    return date;
}

// Formats a date input (Date object, Timestamp, or string) into YYYY-MM-DD for date inputs (using UTC)
function formatDateToISO(date) {
    let dateToFormat;
    if (date instanceof Timestamp) {
        dateToFormat = date.toDate();
    } else if (date instanceof Date && !isNaN(date)) {
        dateToFormat = date;
    } else if (typeof date === 'string') {
        dateToFormat = new Date(date.includes('T') || date.includes('Z') ? date : date + 'T00:00:00Z');
    }

    if (!(dateToFormat instanceof Date) || isNaN(dateToFormat.getTime())) {
        dateToFormat = new Date();
    }

    const year = dateToFormat.getUTCFullYear();
    const month = String(dateToFormat.getUTCMonth() + 1).padStart(2, '0');
    const day = String(dateToFormat.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}


// Formats a date input (Date object expected) for display as DD/MM/YYYY using UTC components
function formatDateForDisplay(dateInput) {
    if (!dateInput) { return 'Data Inválida'; }
    let dateToFormat;
    if (dateInput instanceof Timestamp) { dateToFormat = dateInput.toDate(); }
    else if (dateInput instanceof Date && !isNaN(dateInput)) { dateToFormat = dateInput; }
    else {
        if (typeof dateInput === 'string') {
            dateToFormat = new Date(dateInput.includes('T') || dateInput.includes('Z') ? dateInput : dateInput + 'T00:00:00Z');
         }
        else { return 'Data Inválida'; }
    }
    if (!dateToFormat || isNaN(dateToFormat.getTime())) { return 'Data Inválida'; }
    const day = String(dateToFormat.getUTCDate()).padStart(2, '0');
    const month = String(dateToFormat.getUTCMonth() + 1).padStart(2, '0');
    const year = dateToFormat.getUTCFullYear();
    const formattedDate = `${day}/${month}/${year}`;
    return formattedDate;
}

// Calculates time elapsed from a given past date (Date object expected) until now
function timeElapsed(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) { return 'Data Inválida'; }
    const now = new Date();
    const pastMillis = date.getTime();
    const nowMillis = now.getTime();
    let diffInSeconds = Math.floor((nowMillis - pastMillis) / 1000);
    if (diffInSeconds < 0) diffInSeconds = 0;
    if (diffInSeconds < 60) return `${diffInSeconds} seg`;
    let diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes} min`;
    let diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} hr`;
    let diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 30) return `${diffInDays} dias`;
    let diffInMonths = Math.floor(diffInDays / 30.44);
    if (diffInMonths < 12) return `${diffInMonths} meses`;
    let diffInYears = Math.floor(diffInDays / 365.25);
    return `${diffInYears} anos`;
}

// Checks if a given date (Date object expected, representing UTC midnight) is before the start of today (UTC)
function isDateExpired(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) return false;
    const now = new Date();
    const todayUTCStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return date.getTime() < todayUTCStart.getTime();
}

function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 15);
}

// Rehydrates Firestore data (Timestamps to Date objects)
function rehydrateTargets(targets) {
    return targets.map((target) => {
        const rehydratedTarget = { ...target };
        const fieldsToConvert = ['date', 'deadlineDate', 'lastPresentedDate', 'resolutionDate', 'archivedDate'];

        fieldsToConvert.forEach(field => {
            const originalValue = rehydratedTarget[field];
            if (originalValue instanceof Timestamp) {
                rehydratedTarget[field] = originalValue.toDate();
            } else if (originalValue instanceof Date && !isNaN(originalValue)) {
                /* Already Date */
            } else if (originalValue === null || originalValue === undefined) {
                rehydratedTarget[field] = null;
            } else if (typeof originalValue === 'string' && /^\d{4}-\d{2}-\d{2}/.test(originalValue)) { // Check if it's a date string
                try {
                    const parsedDate = new Date(originalValue.includes('T') || originalValue.includes('Z') ? originalValue : originalValue + 'T00:00:00Z');
                    rehydratedTarget[field] = !isNaN(parsedDate.getTime()) ? parsedDate : null;
                } catch (e) { rehydratedTarget[field] = null; }
            } else if (field !== 'category') { // Ignore category here
                 rehydratedTarget[field] = null;
            }
        });

        // Ensure category is string or null
        rehydratedTarget.category = typeof rehydratedTarget.category === 'string' ? rehydratedTarget.category : null;

        if (rehydratedTarget.observations && Array.isArray(rehydratedTarget.observations)) {
            rehydratedTarget.observations = rehydratedTarget.observations.map(obs => {
                let obsDateFinal = null;
                if (obs.date instanceof Timestamp) obsDateFinal = obs.date.toDate();
                else if (obs.date instanceof Date && !isNaN(obs.date)) obsDateFinal = obs.date;
                else if (typeof obs.date === 'string') {
                    try {
                         const parsedObsDate = new Date(obs.date.includes('T') || obs.date.includes('Z') ? obs.date : obs.date + 'T00:00:00Z');
                         if (!isNaN(parsedObsDate.getTime())) obsDateFinal = parsedObsDate;
                     } catch(e) { /* ignore */ }
                }
                return { ...obs, date: obsDateFinal };
            }).sort((a, b) => (b.date instanceof Date ? b.date.getTime() : 0) - (a.date instanceof Date ? a.date.getTime() : 0));
        } else {
            rehydratedTarget.observations = [];
        }
        return rehydratedTarget;
    });
}
// ==== END UTILITY FUNCTIONS ====


// ==== AUTHENTICATION ====
function updateAuthUI(user) {
    const authStatus = document.getElementById('authStatus');
    const btnLogout = document.getElementById('btnLogout');
    const emailPasswordAuthForm = document.getElementById('emailPasswordAuthForm');
    const authStatusContainer = document.querySelector('.auth-status-container');

    if (user) {
        authStatusContainer.style.display = 'flex';
        btnLogout.style.display = 'inline-block';
        emailPasswordAuthForm.style.display = 'none';
        let providerType = 'desconhecido';
        if (user.providerData[0]?.providerId === 'password') providerType = 'E-mail/Senha';
        else if (user.providerData[0]?.providerId === 'google.com') providerType = 'Google';
        authStatus.textContent = `Autenticado: ${user.email} (via ${providerType})`;
    } else {
        authStatusContainer.style.display = 'none'; // Hide status container when logged out
        btnLogout.style.display = 'none';
        emailPasswordAuthForm.style.display = 'block'; // Show login form
        document.getElementById('passwordResetMessage').style.display = 'none';
    }
}

async function signUpWithEmailPassword() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const passwordResetMessageDiv = document.getElementById('passwordResetMessage');
    passwordResetMessageDiv.style.display = "none";
    try {
        await createUserWithEmailAndPassword(auth, email, password);
        alert("Cadastro realizado com sucesso! Você já está logado.");
    } catch (error) {
        console.error("Erro ao cadastrar com e-mail/senha:", error);
        alert("Erro ao cadastrar: " + error.message);
    }
}

async function signInWithEmailPassword() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const passwordResetMessageDiv = document.getElementById('passwordResetMessage');
    passwordResetMessageDiv.style.display = "none";
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        console.error("Erro ao entrar com e-mail/senha:", error);
        alert("Erro ao entrar: " + error.message);
    }
}

async function resetPassword() {
    const email = document.getElementById('email').value;
    if (!email) {
        alert("Por favor, insira seu e-mail para redefinir a senha.");
        return;
    }
    const passwordResetMessageDiv = document.getElementById('passwordResetMessage');
    try {
        await sendPasswordResetEmail(auth, email);
        passwordResetMessageDiv.textContent = "Um e-mail de redefinição de senha foi enviado para " + email + ". Verifique sua caixa de entrada e spam.";
        passwordResetMessageDiv.style.color = "green";
        passwordResetMessageDiv.style.display = "block";
    } catch (error) {
        console.error("Erro ao enviar e-mail de redefinição:", error);
        passwordResetMessageDiv.textContent = "Erro ao redefinir senha: " + error.message;
        passwordResetMessageDiv.style.color = "red";
        passwordResetMessageDiv.style.display = "block";
    }
}
// ==== END AUTHENTICATION ====


// ==== MAIN DATA AND LOGIC ====

// --- Data Loading ---
async function loadData(user) {
    updateAuthUI(user);
    const uid = user ? user.uid : null;

    if (uid) {
        console.log(`[loadData] User ${uid} authenticated. Loading data...`);
        // Show relevant sections
        document.getElementById('appContent').style.display = 'none';
        document.getElementById('dailySection').style.display = 'block';
        document.getElementById('sectionSeparator').style.display = 'block';
        document.getElementById('mainPanel').style.display = 'none';
        document.getElementById('archivedPanel').style.display = 'none';
        document.getElementById('resolvedPanel').style.display = 'none';
        document.getElementById('weeklyPerseveranceChart').style.display = 'block';
        document.getElementById('perseveranceSection').style.display = 'block';

        try {
            // Load bar and chart data (loadPerseveranceData calls loadWeeklyPrayerData)
            await loadPerseveranceData(uid);

            // Load targets
            await fetchPrayerTargets(uid);
            await fetchArchivedTargets(uid);
            resolvedTargets = archivedTargets.filter(target => target.resolved);

            checkExpiredDeadlines();

            // Initial render (panels hidden, but data is ready)
            renderTargets();
            renderArchivedTargets();
            renderResolvedTargets();

            // Load daily targets last
            await loadDailyTargets();

            // Show the initial view
            showPanel('dailySection');

        } catch (error) {
             console.error("[loadData] Error during data loading process:", error);
             alert("Ocorreu um erro ao carregar seus dados. Por favor, recarregue a página ou tente fazer login novamente.");
             resetPerseveranceUI();
             prayerTargets = []; archivedTargets = []; resolvedTargets = []; currentDailyTargets = [];
             renderTargets(); renderArchivedTargets(); renderResolvedTargets();
             document.getElementById("dailyTargets").innerHTML = "<p>Erro ao carregar dados. Faça login novamente.</p>";
         }
    } else {
        console.log("[loadData] No user authenticated. Clearing data and UI.");
        // Hide all app content sections
        document.getElementById('appContent').style.display = 'none';
        document.getElementById('dailySection').style.display = 'none';
        document.getElementById('sectionSeparator').style.display = 'none';
        document.getElementById('mainPanel').style.display = 'none';
        document.getElementById('archivedPanel').style.display = 'none';
        document.getElementById('resolvedPanel').style.display = 'none';
        document.getElementById('weeklyPerseveranceChart').style.display = 'none';
        document.getElementById('perseveranceSection').style.display = 'none';

        // Clear local data
        prayerTargets = []; archivedTargets = []; resolvedTargets = []; currentDailyTargets = [];
        renderTargets(); renderArchivedTargets(); renderResolvedTargets();
        document.getElementById("dailyTargets").innerHTML = "<p>Faça login para ver os alvos diários.</p>";
        document.getElementById('dailyVerses').textContent = '';
        resetPerseveranceUI(); // Resets bar AND chart UI/local data
    }
}

async function fetchPrayerTargets(uid) {
    prayerTargets = [];
    const targetsRef = collection(db, "users", uid, "prayerTargets");
    const targetsSnapshot = await getDocs(query(targetsRef, orderBy("date", "desc")));
    console.log(`[fetchPrayerTargets] Found ${targetsSnapshot.size} active targets for user ${uid}`);
    const rawTargets = targetsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    prayerTargets = rehydrateTargets(rawTargets);
    console.log("[fetchPrayerTargets] Rehydrated active prayerTargets count:", prayerTargets.length);
}

async function fetchArchivedTargets(uid) {
    archivedTargets = [];
    const archivedRef = collection(db, "users", uid, "archivedTargets");
    const archivedSnapshot = await getDocs(query(archivedRef, orderBy("date", "desc"))); // Order by creation date, could be archivedDate
    console.log(`[fetchArchivedTargets] Found ${archivedSnapshot.size} archived targets for user ${uid}`);
    const rawArchived = archivedSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    archivedTargets = rehydrateTargets(rawArchived);
    // Sort locally by archive date (or creation if null) - most recent first
    archivedTargets.sort((a, b) => {
        const dateA = a.archivedDate instanceof Date ? a.archivedDate.getTime() : (a.date instanceof Date ? a.date.getTime() : 0);
        const dateB = b.archivedDate instanceof Date ? b.archivedDate.getTime() : (b.date instanceof Date ? b.date.getTime() : 0);
        return dateB - dateA;
    });
    console.log("[fetchArchivedTargets] Rehydrated and sorted archivedTargets count:", archivedTargets.length);
}

// --- Rendering ---
function renderTargets() {
    const targetListDiv = document.getElementById('targetList');
    targetListDiv.innerHTML = '';
    let filteredAndPagedTargets = [...prayerTargets];

    // Filters
    if (currentSearchTermMain) filteredAndPagedTargets = filterTargets(filteredAndPagedTargets, currentSearchTermMain);
    if (showDeadlineOnly) filteredAndPagedTargets = filteredAndPagedTargets.filter(target => target.hasDeadline && target.deadlineDate);
    const showExpiredOnlyMainCheckbox = document.getElementById('showExpiredOnlyMain');
    if (showExpiredOnlyMainCheckbox?.checked) filteredAndPagedTargets = filteredAndPagedTargets.filter(target => target.hasDeadline && target.deadlineDate && isDateExpired(target.deadlineDate));

    // Sorting
     if (showDeadlineOnly || showExpiredOnlyMainCheckbox?.checked) {
        // Sort by deadline first (earliest first), then by creation date (newest first)
        filteredAndPagedTargets.sort((a, b) => {
            const dateA = a.deadlineDate instanceof Date && !isNaN(a.deadlineDate) ? a.deadlineDate.getTime() : Infinity;
            const dateB = b.deadlineDate instanceof Date && !isNaN(b.deadlineDate) ? b.deadlineDate.getTime() : Infinity;
            if (dateA !== dateB) return dateA - dateB; // Sort by deadline ascending
             const creationDateA = (a.date instanceof Date && !isNaN(a.date)) ? a.date.getTime() : 0;
             const creationDateB = (b.date instanceof Date && !isNaN(b.date)) ? b.date.getTime() : 0;
             return creationDateB - creationDateA; // Then by creation date descending
        });
    } else {
        // Default sort: newest creation date first
        filteredAndPagedTargets.sort((a, b) => {
             const creationDateA = (a.date instanceof Date && !isNaN(a.date)) ? a.date.getTime() : 0;
             const creationDateB = (b.date instanceof Date && !isNaN(b.date)) ? b.date.getTime() : 0;
             return creationDateB - creationDateA;
         });
    }

    // Pagination
    const startIndex = (currentPage - 1) * targetsPerPage;
    const endIndex = startIndex + targetsPerPage;
    const targetsToDisplay = filteredAndPagedTargets.slice(startIndex, endIndex);
    lastDisplayedTargets = targetsToDisplay;

    // Render
    if (targetsToDisplay.length === 0) {
        if (filteredAndPagedTargets.length > 0 && currentPage > 1) {
            currentPage = 1; renderTargets(); return;
        } else targetListDiv.innerHTML = '<p>Nenhum alvo de oração encontrado com os filtros atuais.</p>';
    } else {
        targetsToDisplay.forEach((target) => {
             if (!target || !target.id) { console.warn("[renderTargets] Skipping invalid target:", target); return; }
            const targetDiv = document.createElement("div");
            targetDiv.classList.add("target");
            targetDiv.dataset.targetId = target.id;
            const formattedDate = formatDateForDisplay(target.date);
            const elapsed = timeElapsed(target.date);

            // Create category tag (if exists)
            let categoryTag = '';
            if (target.category) {
                categoryTag = `<span class="category-tag">${target.category}</span>`;
            }

            let deadlineTag = '';
            if (target.hasDeadline && target.deadlineDate) {
                const formattedDeadline = formatDateForDisplay(target.deadlineDate);
                deadlineTag = `<span class="deadline-tag ${isDateExpired(target.deadlineDate) ? 'expired' : ''}">Prazo: ${formattedDeadline}</span>`;
            }
            const observations = Array.isArray(target.observations) ? target.observations : [];
            targetDiv.innerHTML = `
                <h3>${categoryTag} ${deadlineTag} ${target.title || 'Sem Título'}</h3>
                <p>${target.details || 'Sem Detalhes'}</p>
                <p><strong>Data Criação:</strong> ${formattedDate}</p>
                <p><strong>Tempo Decorrido:</strong> ${elapsed}</p>
                ${renderObservations(observations, false, target.id)}
                <div class="target-actions">
                    <button class="resolved btn" onclick="markAsResolved('${target.id}')">Respondido</button>
                    <button class="archive btn" onclick="archiveTarget('${target.id}')">Arquivar</button>
                    <button class="add-observation btn" onclick="toggleAddObservation('${target.id}')">Observação</button>
                    ${target.hasDeadline ? `<button class="edit-deadline btn" onclick="editDeadline('${target.id}')">Editar Prazo</button>` : ''}
                    <button class="edit-category btn" onclick="editCategory('${target.id}')">Editar Categoria</button>
                </div>
                <div id="observationForm-${target.id}" class="add-observation-form" style="display:none;"></div>
                <div id="editDeadlineForm-${target.id}" class="edit-deadline-form" style="display:none;"></div>
                <div id="editCategoryForm-${target.id}" class="edit-category-form" style="display:none;"></div>
                `;
            targetListDiv.appendChild(targetDiv);
            renderObservationForm(target.id); // Populate observation form if needed
        });
    }
    renderPagination('mainPanel', currentPage, filteredAndPagedTargets);
}

function renderArchivedTargets() {
    const archivedListDiv = document.getElementById('archivedList');
    archivedListDiv.innerHTML = '';
    let filteredAndPagedArchived = [...archivedTargets]; // Use list already sorted in fetch

    if (currentSearchTermArchived) filteredAndPagedArchived = filterTargets(filteredAndPagedArchived, currentSearchTermArchived);

    // Pagination
    const startIndex = (currentArchivedPage - 1) * targetsPerPage;
    const endIndex = startIndex + targetsPerPage;
    const targetsToDisplay = filteredAndPagedArchived.slice(startIndex, endIndex);

    // Render
    if (targetsToDisplay.length === 0) {
        if (filteredAndPagedArchived.length > 0 && currentArchivedPage > 1) {
             currentArchivedPage = 1; renderArchivedTargets(); return;
        } else archivedListDiv.innerHTML = '<p>Nenhum alvo arquivado encontrado.</p>';
    } else {
        targetsToDisplay.forEach((target) => {
             if (!target || !target.id) return;
            const archivedDiv = document.createElement("div");
            archivedDiv.classList.add("target", "archived");
            if (target.resolved) archivedDiv.classList.add("resolved"); // Add class if also resolved
            archivedDiv.dataset.targetId = target.id;

            const formattedCreationDate = formatDateForDisplay(target.date);
            const formattedArchivedDate = target.archivedDate ? formatDateForDisplay(target.archivedDate) : 'N/A';
            const elapsedCreation = timeElapsed(target.date);

            // Create category tag (if exists)
            let categoryTag = '';
            if (target.category) {
                categoryTag = `<span class="category-tag">${target.category}</span>`;
            }

            // Create resolved tag if applicable
            let resolvedTag = '';
            if (target.resolved && target.resolutionDate) {
                resolvedTag = `<span class="resolved-tag">Respondido em: ${formatDateForDisplay(target.resolutionDate)}</span>`;
            } else if (target.resolved) {
                 resolvedTag = `<span class="resolved-tag">Respondido</span>`;
            }

            const observations = Array.isArray(target.observations) ? target.observations : [];
            archivedDiv.innerHTML = `
                <h3>${categoryTag} ${resolvedTag} ${target.title || 'Sem Título'}</h3>
                <p>${target.details || 'Sem Detalhes'}</p>
                <p><strong>Data Criação:</strong> ${formattedCreationDate}</p>
                <p><strong>Data Arquivamento:</strong> ${formattedArchivedDate}</p>
                <p><strong>Tempo Decorrido (Criação):</strong> ${elapsedCreation}</p>
                ${renderObservations(observations, false, target.id)}
                <div class="target-actions">
                    <button class="delete btn" onclick="deleteArchivedTarget('${target.id}')">Excluir Permanentemente</button>
                    <button class="add-observation btn" onclick="toggleAddObservation('${target.id}')">Observação</button>
                    <button class="edit-category btn" onclick="editCategory('${target.id}')">Editar Categoria</button>
                </div>
                 <div id="observationForm-${target.id}" class="add-observation-form" style="display:none;"></div>
                 <div id="editCategoryForm-${target.id}" class="edit-category-form" style="display:none;"></div>
                 `;
            archivedListDiv.appendChild(archivedDiv);
            renderObservationForm(target.id);
        });
    }
    renderPagination('archivedPanel', currentArchivedPage, filteredAndPagedArchived);
}

function renderResolvedTargets() {
    const resolvedListDiv = document.getElementById('resolvedList');
    resolvedListDiv.innerHTML = '';
    // Use `resolvedTargets` list which was filtered and sorted in loadData/markAsResolved
    let filteredAndPagedResolved = [...resolvedTargets];

    if (currentSearchTermResolved) filteredAndPagedResolved = filterTargets(filteredAndPagedResolved, currentSearchTermResolved);

    // Sort (should already be sorted by resolutionDate, but ensure)
    filteredAndPagedResolved.sort((a, b) => {
        const dateA = a.resolutionDate instanceof Date ? a.resolutionDate.getTime() : 0;
        const dateB = b.resolutionDate instanceof Date ? b.resolutionDate.getTime() : 0;
        return dateB - dateA; // Most recent first
    });


    // Pagination
    const startIndex = (currentResolvedPage - 1) * targetsPerPage;
    const endIndex = startIndex + targetsPerPage;
    const targetsToDisplay = filteredAndPagedResolved.slice(startIndex, endIndex);

    // Render
    if (targetsToDisplay.length === 0) {
         if (filteredAndPagedResolved.length > 0 && currentResolvedPage > 1) {
             currentResolvedPage = 1; renderResolvedTargets(); return;
         } else resolvedListDiv.innerHTML = '<p>Nenhum alvo respondido encontrado.</p>';
    } else {
        targetsToDisplay.forEach((target) => {
            if (!target || !target.id) return;
            const resolvedDiv = document.createElement("div");
            resolvedDiv.classList.add("target", "resolved"); // Add both classes
            resolvedDiv.dataset.targetId = target.id;

            const formattedResolutionDate = formatDateForDisplay(target.resolutionDate);
            let totalTime = 'N/A';
            if (target.date instanceof Date && target.resolutionDate instanceof Date) {
                 let diffInSeconds = Math.floor((target.resolutionDate.getTime() - target.date.getTime()) / 1000);
                 if (diffInSeconds < 0) diffInSeconds = 0;
                 if (diffInSeconds < 60) totalTime = `${diffInSeconds} seg`;
                 else { let diffInMinutes = Math.floor(diffInSeconds / 60);
                     if (diffInMinutes < 60) totalTime = `${diffInMinutes} min`;
                     else { let diffInHours = Math.floor(diffInMinutes / 60);
                         if (diffInHours < 24) totalTime = `${diffInHours} hr`;
                         else { let diffInDays = Math.floor(diffInHours / 24);
                             if (diffInDays < 30) totalTime = `${diffInDays} dias`;
                             else { let diffInMonths = Math.floor(diffInDays / 30.44);
                                 if (diffInMonths < 12) totalTime = `${diffInMonths} meses`;
                                 else { let diffInYears = Math.floor(diffInDays / 365.25); totalTime = `${diffInYears} anos`; }}}}}
            }

            // Create category tag (if exists)
            let categoryTag = '';
            if (target.category) {
                categoryTag = `<span class="category-tag">${target.category}</span>`;
            }

            const observations = Array.isArray(target.observations) ? target.observations : [];
            resolvedDiv.innerHTML = `
                <h3>${categoryTag} ${target.title || 'Sem Título'} (Respondido)</h3>
                <p>${target.details || 'Sem Detalhes'}</p>
                <p><strong>Data Criação:</strong> ${formatDateForDisplay(target.date)}</p>
                <p><strong>Data Respondido:</strong> ${formattedResolutionDate}</p>
                <p><strong>Tempo Total (Criação -> Resposta):</strong> ${totalTime}</p>
                ${renderObservations(observations, false, target.id)}
                 <div class="target-actions">
                    <button class="add-observation btn" onclick="toggleAddObservation('${target.id}')">Observação</button>
                    <button class="edit-category btn" onclick="editCategory('${target.id}')">Editar Categoria</button>
                </div>
                 <div id="observationForm-${target.id}" class="add-observation-form" style="display:none;"></div>
                 <div id="editCategoryForm-${target.id}" class="edit-category-form" style="display:none;"></div>
                 `;
            resolvedListDiv.appendChild(resolvedDiv);
            renderObservationForm(target.id);
        });
    }
    renderPagination('resolvedPanel', currentResolvedPage, filteredAndPagedResolved);
}


function renderPagination(panelId, currentPageVariable, targetsArray) {
    const paginationDiv = document.getElementById(`pagination-${panelId}`);
    if (!paginationDiv) return;
    paginationDiv.innerHTML = '';
    const totalItems = targetsArray.length;
    const totalPages = Math.ceil(totalItems / targetsPerPage);

    if (totalPages <= 1) { paginationDiv.style.display = 'none'; return; }
    else paginationDiv.style.display = 'flex';

    // Previous Button
    const prevLink = document.createElement('a');
    prevLink.href = '#';
    prevLink.innerHTML = '« Anterior';
    prevLink.classList.add('page-link');
    if (currentPageVariable <= 1) { prevLink.classList.add('disabled'); }
    else { prevLink.addEventListener('click', (event) => { event.preventDefault(); handlePageChange(panelId, currentPageVariable - 1); }); }
    paginationDiv.appendChild(prevLink);

    // Page Indicator
    const pageIndicator = document.createElement('span');
    pageIndicator.textContent = `Página ${currentPageVariable} de ${totalPages}`;
    paginationDiv.appendChild(pageIndicator);

    // Next Button
    const nextLink = document.createElement('a');
    nextLink.href = '#';
    nextLink.innerHTML = 'Próxima »';
    nextLink.classList.add('page-link');
    if (currentPageVariable >= totalPages) { nextLink.classList.add('disabled'); }
    else { nextLink.addEventListener('click', (event) => { event.preventDefault(); handlePageChange(panelId, currentPageVariable + 1); }); }
    paginationDiv.appendChild(nextLink);
}


function handlePageChange(panelId, newPage) {
    if (panelId === 'mainPanel') currentPage = newPage;
    else if (panelId === 'archivedPanel') currentArchivedPage = newPage;
    else if (panelId === 'resolvedPanel') currentResolvedPage = newPage;

    // Render the corresponding panel
    if (panelId === 'mainPanel') renderTargets();
    else if (panelId === 'archivedPanel') renderArchivedTargets();
    else if (panelId === 'resolvedPanel') renderResolvedTargets();

    const panelElement = document.getElementById(panelId);
    if (panelElement) panelElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// --- Add/Edit/Archive ---
document.getElementById("prayerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) { alert("Você precisa estar logado."); return; }
    const uid = user.uid;
    const title = document.getElementById("title").value.trim();
    const details = document.getElementById("details").value.trim();
    const dateInput = document.getElementById("date").value;
    const hasDeadline = document.getElementById("hasDeadline").checked;
    const deadlineDateInput = document.getElementById("deadlineDate").value;
    const category = document.getElementById("categorySelect").value;

    if (!title || !dateInput) { alert("Título e Data Criação são obrigatórios."); return; }

    const dateUTC = createUTCDate(dateInput);
    if (!dateUTC) { alert("Data de criação inválida."); return; }
    let deadlineDateUTC = null;
    if (hasDeadline) {
        if (!deadlineDateInput) { alert("Selecione o Prazo de Validade."); return; }
        deadlineDateUTC = createUTCDate(deadlineDateInput);
        if (!deadlineDateUTC) { alert("Data do Prazo de Validade inválida."); return; }
        if (deadlineDateUTC.getTime() < dateUTC.getTime()) { alert("O Prazo de Validade não pode ser anterior à Data de Criação."); return; }
    }

    const target = {
        title: title,
        details: details,
        date: Timestamp.fromDate(dateUTC),
        hasDeadline: hasDeadline,
        deadlineDate: deadlineDateUTC ? Timestamp.fromDate(deadlineDateUTC) : null,
        category: category || null,
        archived: false,
        resolved: false,
        resolutionDate: null,
        observations: [],
        userId: uid,
        lastPresentedDate: null
    };

    try {
        const docRef = await addDoc(collection(db, "users", uid, "prayerTargets"), target);
        const newLocalTarget = rehydrateTargets([{ ...target, id: docRef.id }])[0];
        prayerTargets.unshift(newLocalTarget); // Add to beginning
        // Re-sort local list
        prayerTargets.sort((a, b) => (b.date instanceof Date ? b.date.getTime() : 0) - (a.date instanceof Date ? a.date.getTime() : 0));

        document.getElementById("prayerForm").reset();
        document.getElementById('deadlineContainer').style.display = 'none';
        document.getElementById('categorySelect').value = ''; // Clear category select
        document.getElementById('date').value = formatDateToISO(new Date()); // Reset date
        showPanel('mainPanel'); currentPage = 1; renderTargets(); // Show main panel and render
        alert('Alvo de oração adicionado com sucesso!');
    } catch (error) { console.error("Error adding prayer target: ", error); alert("Erro ao adicionar alvo: " + error.message); }
});

window.markAsResolved = async function(targetId) {
    const user = auth.currentUser; if (!user) { alert("Erro: Usuário não autenticado."); return; }
    const userId = user.uid;
    const targetIndex = prayerTargets.findIndex(t => t.id === targetId);
    if (targetIndex === -1) { alert("Erro: Alvo não encontrado na lista ativa."); return; }
    const targetData = prayerTargets[targetIndex];
    if (!confirm(`Marcar o alvo "${targetData.title || targetId}" como respondido? Ele será movido para Arquivados.`)) return;
    const resolutionDate = Timestamp.fromDate(new Date()); // Use current date for resolution and archiving
    const activeTargetRef = doc(db, "users", userId, "prayerTargets", targetId);
    const archivedTargetRef = doc(db, "users", userId, "archivedTargets", targetId);
    try {
        // Prepare data for archiving, converting local Dates to Firestore Timestamps
        const archivedData = {
            ...targetData, // Copy existing fields
            date: targetData.date instanceof Date ? Timestamp.fromDate(targetData.date) : targetData.date, // Convert creation date
            deadlineDate: targetData.deadlineDate instanceof Date ? Timestamp.fromDate(targetData.deadlineDate) : targetData.deadlineDate, // Convert deadline
            observations: Array.isArray(targetData.observations) ? targetData.observations.map(obs => ({
                ...obs,
                date: obs.date instanceof Date ? Timestamp.fromDate(obs.date) : obs.date // Convert observation dates
            })) : [],
            resolved: true,
            archived: true,
            resolutionDate: resolutionDate,
            archivedDate: resolutionDate // Archive date is the same as resolution date
         };
        delete archivedData.id; // Remove ID from object to be saved (Firestore uses doc ID)
        delete archivedData.status; // Remove 'status' field if it exists locally

        // Use a batch for atomicity
        const batch = writeBatch(db);
        batch.delete(activeTargetRef); // Delete from active collection
        batch.set(archivedTargetRef, archivedData); // Create/Overwrite in archived collection
        await batch.commit();

        // Update local lists
        prayerTargets.splice(targetIndex, 1); // Remove from local active list
        const newArchivedLocal = rehydrateTargets([{ ...archivedData, id: targetId }])[0]; // Rehydrate for local use
        archivedTargets.unshift(newArchivedLocal); // Add to beginning of local archived list

        // Re-sort archived and update resolved
        archivedTargets.sort((a, b) => (b.archivedDate instanceof Date ? b.archivedDate.getTime() : 0) - (a.archivedDate instanceof Date ? a.archivedDate.getTime() : 0));
        resolvedTargets = archivedTargets.filter(t => t.resolved);
        resolvedTargets.sort((a, b) => (b.resolutionDate instanceof Date ? b.resolutionDate.getTime() : 0) - (a.resolutionDate instanceof Date ? a.resolutionDate.getTime() : 0));

        // Re-render affected lists
        renderTargets();
        renderArchivedTargets();
        renderResolvedTargets();
        alert('Alvo marcado como respondido e movido para Arquivados.');
    } catch (error) { console.error("Error marking target as resolved: ", error); alert("Erro ao marcar como respondido: " + error.message); }
};

window.archiveTarget = async function(targetId) {
    const user = auth.currentUser; if (!user) { alert("Erro: Usuário não autenticado."); return; }
    const userId = user.uid;
    const targetIndex = prayerTargets.findIndex(t => t.id === targetId);
    if (targetIndex === -1) { alert("Erro: Alvo não encontrado na lista ativa."); return; }
    const targetData = prayerTargets[targetIndex];
    if (!confirm(`Arquivar o alvo "${targetData.title || targetId}"? Ele será movido para Arquivados.`)) return;
    const archiveTimestamp = Timestamp.fromDate(new Date()); // Current date for archiving
    const activeTargetRef = doc(db, "users", userId, "prayerTargets", targetId);
    const archivedTargetRef = doc(db, "users", userId, "archivedTargets", targetId);
    try {
         // Prepare data for archiving, converting Dates to Timestamps
         const archivedData = {
            ...targetData,
             date: targetData.date instanceof Date ? Timestamp.fromDate(targetData.date) : targetData.date,
             deadlineDate: targetData.deadlineDate instanceof Date ? Timestamp.fromDate(targetData.deadlineDate) : targetData.deadlineDate,
             observations: Array.isArray(targetData.observations) ? targetData.observations.map(obs => ({
                 ...obs,
                 date: obs.date instanceof Date ? Timestamp.fromDate(obs.date) : obs.date
                })) : [],
             resolved: false, // Not resolved, just archived
             archived: true,
             archivedDate: archiveTimestamp, // Set archive date
             // resolutionDate remains as it was (likely null)
         };
        delete archivedData.id;
        delete archivedData.status;

        // Use batch
        const batch = writeBatch(db);
        batch.delete(activeTargetRef);
        batch.set(archivedTargetRef, archivedData);
        await batch.commit();

        // Update local lists
        prayerTargets.splice(targetIndex, 1);
        const newArchivedLocal = rehydrateTargets([{ ...archivedData, id: targetId }])[0];
        archivedTargets.unshift(newArchivedLocal);
        archivedTargets.sort((a, b) => (b.archivedDate instanceof Date ? b.archivedDate.getTime() : 0) - (a.archivedDate instanceof Date ? a.archivedDate.getTime() : 0));
        resolvedTargets = archivedTargets.filter(t => t.resolved); // Update resolved (although this one isn't resolved)

        // Re-render
        renderTargets();
        renderArchivedTargets();
        renderResolvedTargets(); // Re-render resolved in case order changes anything visually
        alert('Alvo arquivado com sucesso!');
    } catch (error) { console.error("Error archiving target: ", error); alert("Erro ao arquivar alvo: " + error.message); }
};

window.deleteArchivedTarget = async function(targetId) {
     const user = auth.currentUser; if (!user) { alert("Erro: Usuário não autenticado."); return; }
     const userId = user.uid;
     const targetTitle = archivedTargets.find(t => t.id === targetId)?.title || targetId;
     if (!confirm(`Tem certeza que deseja excluir PERMANENTEMENTE o alvo arquivado "${targetTitle}"? Esta ação não pode ser desfeita.`)) return;
     const archivedTargetRef = doc(db, "users", userId, "archivedTargets", targetId);
     const clickCountsRef = doc(db, "prayerClickCounts", targetId); // Reference for click counts
     try {
         // Use batch to delete both documents
         const batch = writeBatch(db);
         batch.delete(archivedTargetRef); // Delete archived target
         batch.delete(clickCountsRef); // Delete associated click count (if exists)
         await batch.commit();

         // Update local lists
         const targetIndex = archivedTargets.findIndex(t => t.id === targetId);
         if (targetIndex !== -1) archivedTargets.splice(targetIndex, 1);
         resolvedTargets = archivedTargets.filter(target => target.resolved); // Update resolved
         resolvedTargets.sort((a, b) => (b.resolutionDate instanceof Date ? b.resolutionDate.getTime() : 0) - (a.resolutionDate instanceof Date ? a.resolutionDate.getTime() : 0));

         // Re-render
         renderArchivedTargets();
         renderResolvedTargets();
         alert('Alvo excluído permanentemente!');
     } catch (error) { console.error("Error deleting archived target: ", error); alert("Erro ao excluir alvo arquivado: " + error.message); }
};


// --- Observations ---
window.toggleAddObservation = function(targetId) {
    const formDiv = document.getElementById(`observationForm-${targetId}`);
    if (!formDiv) return;
    const isVisible = formDiv.style.display === 'block';

    // Hide other open forms in the same target
    const deadlineForm = document.getElementById(`editDeadlineForm-${targetId}`);
    const categoryForm = document.getElementById(`editCategoryForm-${targetId}`);
    if(deadlineForm) deadlineForm.style.display = 'none';
    if(categoryForm) categoryForm.style.display = 'none';

    // Show/hide observation form
    formDiv.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) {
        formDiv.querySelector('textarea')?.focus();
        try {
            const dateInput = formDiv.querySelector(`#observationDate-${targetId}`);
            if (dateInput && !dateInput.value) dateInput.value = formatDateToISO(new Date());
        } catch (e) { /* ignore */ }
    }
};

function renderObservationForm(targetId) {
    const formDiv = document.getElementById(`observationForm-${targetId}`);
    if (!formDiv) return;
    formDiv.innerHTML = `
        <textarea id="observationText-${targetId}" placeholder="Nova observação..." rows="3" style="width: 95%; margin-bottom: 5px;"></textarea>
        <input type="date" id="observationDate-${targetId}" style="width: 95%; margin-bottom: 5px;">
        <button class="btn" onclick="saveObservation('${targetId}')" style="background-color: #7cb17c;">Salvar Observação</button>
    `;
    try { document.getElementById(`observationDate-${targetId}`).value = formatDateToISO(new Date()); }
    catch (e) { document.getElementById(`observationDate-${targetId}`).value = ''; }
}

window.saveObservation = async function(targetId) {
    const observationText = document.getElementById(`observationText-${targetId}`)?.value.trim();
    const observationDateInput = document.getElementById(`observationDate-${targetId}`)?.value;
    if (!observationText || !observationDateInput) { alert('Texto e Data da observação são obrigatórios.'); return; }
    const observationDateUTC = createUTCDate(observationDateInput);
    if (!observationDateUTC) { alert('Data da observação inválida.'); return; }
    const user = auth.currentUser; if (!user) { alert("Erro: Usuário não autenticado."); return; }
    const userId = user.uid;
    let targetRef, targetList, targetIndex = -1, isArchived = false, isResolved = false;

    // Look for target in active list
    targetIndex = prayerTargets.findIndex(t => t.id === targetId);
    if (targetIndex !== -1) {
        targetRef = doc(db, "users", userId, "prayerTargets", targetId);
        targetList = prayerTargets;
    } else {
        // Look for target in archived list
        targetIndex = archivedTargets.findIndex(t => t.id === targetId);
        if (targetIndex !== -1) {
            targetRef = doc(db, "users", userId, "archivedTargets", targetId);
            targetList = archivedTargets;
            isArchived = true;
            isResolved = archivedTargets[targetIndex].resolved; // Check if also resolved
        } else {
            alert("Erro: Alvo não encontrado.");
            return;
        }
    }

    const newObservation = {
        text: observationText,
        date: Timestamp.fromDate(observationDateUTC), // Save as Timestamp
        id: generateUniqueId(), // Generate unique ID for observation
        targetId: targetId // Keep reference to parent target
    };

    try {
        const targetDocSnap = await getDoc(targetRef);
        if (!targetDocSnap.exists()) throw new Error("Target document does not exist in Firestore.");

        const currentData = targetDocSnap.data();
        const currentObservations = currentData.observations || []; // Get existing observations or empty array
        currentObservations.push(newObservation); // Add the new one

        // Sort observations in Firestore by date (most recent first)
        currentObservations.sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));

        // Update document in Firestore with updated observations array
        await updateDoc(targetRef, { observations: currentObservations });

        // Update local object
        const currentTargetLocal = targetList[targetIndex];
        if (!Array.isArray(currentTargetLocal.observations)) currentTargetLocal.observations = [];
        // Add the new rehydrated observation (with Date object)
        currentTargetLocal.observations.push({ ...newObservation, date: newObservation.date.toDate() });
        // Sort locally as well
        currentTargetLocal.observations.sort((a, b) => (b.date instanceof Date ? b.date.getTime() : 0) - (a.date instanceof Date ? a.date.getTime() : 0));

        // Re-render appropriate lists
        if (isArchived) {
            renderArchivedTargets(); // Render archived
            if (isResolved) {
                renderResolvedTargets(); // Render resolved as well
            }
        } else {
            renderTargets(); // Render active
             // If it was in the daily list, update that too
            if (document.getElementById('dailyTargets').querySelector(`.target[data-target-id="${targetId}"]`)) {
                 await loadDailyTargets();
             }
        }

        toggleAddObservation(targetId); // Hide the form
        document.getElementById(`observationText-${targetId}`).value = ''; // Clear text field

    } catch (error) { console.error("Error saving observation:", error); alert("Erro ao salvar observação: " + error.message); }
};

function renderObservations(observations, isExpanded = false, targetId = null) {
    if (!Array.isArray(observations) || observations.length === 0) return '<div class="observations"></div>';
    // Sort locally before displaying (should already be sorted, but ensures)
    observations.sort((a, b) => (b.date instanceof Date ? b.date.getTime() : 0) - (a.date instanceof Date ? a.date.getTime() : 0));
    const displayCount = isExpanded ? observations.length : 1; // Show 1 by default, or all if expanded
    const visibleObservations = observations.slice(0, displayCount);
    const remainingCount = observations.length - displayCount;

    let observationsHTML = `<div class="observations">`;
    visibleObservations.forEach(observation => {
        if (!observation || !observation.date) return; // Skip invalid observations
        const formattedDate = formatDateForDisplay(observation.date);
        const text = observation.text || '(Observação vazia)';
        // Basic HTML sanitization would be ideal here in production
        observationsHTML += `<p class="observation-item"><strong>${formattedDate}:</strong> ${text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`;
    });

    // Add link to see more/less if there's more than 1 observation
    if (targetId && observations.length > 1) {
        if (!isExpanded && remainingCount > 0) {
            observationsHTML += `<a href="#" class="observations-toggle" onclick="window.toggleObservations('${targetId}', event); return false;">Ver mais ${remainingCount} observaç${remainingCount > 1 ? 'ões' : 'ão'}</a>`;
        } else if (isExpanded) {
            observationsHTML += `<a href="#" class="observations-toggle" onclick="window.toggleObservations('${targetId}', event); return false;">Ver menos observações</a>`;
        }
    }
    observationsHTML += `</div>`;
    return observationsHTML;
}

window.toggleObservations = function(targetId, event) {
    if (event) event.preventDefault();
    const targetDiv = document.querySelector(`.target[data-target-id="${targetId}"]`); if (!targetDiv) return;
    const observationsContainer = targetDiv.querySelector('.observations'); if (!observationsContainer) return;
    const isCurrentlyExpanded = observationsContainer.querySelector('.observations-toggle')?.textContent.includes('Ver menos');

    // Find target locally
    const target = prayerTargets.find(t => t.id === targetId) || archivedTargets.find(t => t.id === targetId); if (!target) return;

    // Render observation HTML in the new state (expanded or not)
    const newObservationsHTML = renderObservations(target.observations || [], !isCurrentlyExpanded, targetId);
    observationsContainer.outerHTML = newObservationsHTML; // Replace old container with new one
};


// --- Deadlines ---
document.getElementById('hasDeadline').addEventListener('change', function() {
    document.getElementById('deadlineContainer').style.display = this.checked ? 'block' : 'none';
    if (!this.checked) document.getElementById('deadlineDate').value = '';
});

function handleDeadlineFilterChange() { showDeadlineOnly = document.getElementById('showDeadlineOnly').checked; currentPage = 1; renderTargets(); }
function handleExpiredOnlyMainChange() { currentPage = 1; renderTargets(); }

function checkExpiredDeadlines() {
    const now = new Date();
    const todayUTCStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const expiredCount = prayerTargets.filter(target => target.hasDeadline && target.deadlineDate instanceof Date && !isNaN(target.deadlineDate) && target.deadlineDate.getTime() < todayUTCStart.getTime()).length;
    console.log(`[checkExpiredDeadlines] Found ${expiredCount} expired deadlines among active targets.`);
    // Could update a UI badge here if desired
}

window.editDeadline = function(targetId) {
    const target = prayerTargets.find(t => t.id === targetId); if (!target) { alert("Erro: Alvo não encontrado ou não é ativo."); return; }
    const targetDiv = document.querySelector(`.target[data-target-id="${targetId}"]`); if (!targetDiv) return;
    const editFormContainer = document.getElementById(`editDeadlineForm-${targetId}`); if (!editFormContainer) return;
    const isVisible = editFormContainer.style.display === 'block';

    // Hide other open forms in the same target
    const obsForm = document.getElementById(`observationForm-${targetId}`);
    const categoryForm = document.getElementById(`editCategoryForm-${targetId}`);
    if(obsForm) obsForm.style.display = 'none';
    if(categoryForm) categoryForm.style.display = 'none';

    // Show/hide deadline form
    if (isVisible) { editFormContainer.style.display = 'none'; return; }

    let currentDeadlineISO = '';
    if (target.deadlineDate instanceof Date && !isNaN(target.deadlineDate)) {
        currentDeadlineISO = formatDateToISO(target.deadlineDate);
    }

    editFormContainer.innerHTML = `
        <div style="background-color: #f0f0f0; padding: 10px; margin-top: 10px; border-radius: 5px; border: 1px solid #ccc;">
            <label for="editDeadlineInput-${targetId}" style="margin-right: 5px; display: block; margin-bottom: 5px;">Novo Prazo (deixe em branco para remover):</label>
            <input type="date" id="editDeadlineInput-${targetId}" value="${currentDeadlineISO}" style="margin-right: 5px; width: calc(100% - 22px);">
            <div style="margin-top: 10px; text-align: right;">
                 <button class="btn save-deadline-btn" onclick="saveEditedDeadline('${targetId}')">Salvar Prazo</button>
                 <button class="btn cancel-deadline-btn" onclick="cancelEditDeadline('${targetId}')">Cancelar</button>
            </div>
        </div>`;
    editFormContainer.style.display = 'block';
    document.getElementById(`editDeadlineInput-${targetId}`)?.focus();
};

window.saveEditedDeadline = async function(targetId) {
    const newDeadlineDateInput = document.getElementById(`editDeadlineInput-${targetId}`); if (!newDeadlineDateInput) return;
    const newDeadlineValue = newDeadlineDateInput.value;
    let newDeadlineTimestamp = null; let newHasDeadline = false;

    if (newDeadlineValue) {
        const newDeadlineUTC = createUTCDate(newDeadlineValue);
        if (!newDeadlineUTC) { alert("Data do prazo inválida."); return; }
        const target = prayerTargets.find(t => t.id === targetId);
         // Validation: Deadline cannot be before creation
         if (target && target.date instanceof Date && newDeadlineUTC.getTime() < target.date.getTime()) {
            alert("O Prazo de Validade não pode ser anterior à Data de Criação."); return;
         }
        newDeadlineTimestamp = Timestamp.fromDate(newDeadlineUTC);
        newHasDeadline = true;
    } else {
        // Confirm if user is removing the deadline
        if (!confirm("Nenhuma data selecionada. Tem certeza que deseja remover o prazo?")) return;
    }

    // Update in Firestore and locally
    await updateDeadlineInFirestoreAndLocal(targetId, newDeadlineTimestamp, newHasDeadline);
    cancelEditDeadline(targetId); // Hide form after saving
};

async function updateDeadlineInFirestoreAndLocal(targetId, newDeadlineTimestamp, newHasDeadline) {
     const user = auth.currentUser; if (!user) { alert("Erro: Usuário não autenticado."); return; }
     const userId = user.uid;
     const targetRef = doc(db, "users", userId, "prayerTargets", targetId); // Only edit deadlines on active targets
     try {
         await updateDoc(targetRef, {
             deadlineDate: newDeadlineTimestamp, // Save Timestamp or null
             hasDeadline: newHasDeadline
         });

         // Update locally
         const targetIndex = prayerTargets.findIndex(target => target.id === targetId);
         if (targetIndex !== -1) {
             prayerTargets[targetIndex].deadlineDate = newDeadlineTimestamp ? newDeadlineTimestamp.toDate() : null;
             prayerTargets[targetIndex].hasDeadline = newHasDeadline;
         }

         renderTargets(); // Re-render main list
         alert('Prazo atualizado com sucesso!');
     } catch (error) {
        console.error(`Error updating deadline for ${targetId}:`, error);
        alert("Erro ao atualizar prazo: " + error.message);
     }
}

window.cancelEditDeadline = function(targetId) {
     const editFormContainer = document.getElementById(`editDeadlineForm-${targetId}`);
     if (editFormContainer) {
         editFormContainer.style.display = 'none';
         editFormContainer.innerHTML = ''; // Clear content
     }
};


// --- Category Editing ---
window.editCategory = function(targetId) {
    // Find target in relevant lists (active or archived)
    let target = prayerTargets.find(t => t.id === targetId) || archivedTargets.find(t => t.id === targetId);
    if (!target) { alert("Erro: Alvo não encontrado."); return; }

    const targetDiv = document.querySelector(`.target[data-target-id="${targetId}"]`);
    if (!targetDiv) return;
    const editFormContainer = document.getElementById(`editCategoryForm-${targetId}`);
    if (!editFormContainer) { console.error(`Edit form container not found for ${targetId}`); return; }

    const isVisible = editFormContainer.style.display === 'block';

    // Hide other open edit forms in the same target
    const obsForm = document.getElementById(`observationForm-${targetId}`);
    const deadlineForm = document.getElementById(`editDeadlineForm-${targetId}`);
    if(obsForm) obsForm.style.display = 'none';
    if(deadlineForm) deadlineForm.style.display = 'none';

    // Show/hide category form
    if (isVisible) {
        editFormContainer.style.display = 'none'; // Hide if already visible
        return;
    }

    // Create select options dynamically
    let optionsHTML = '<option value="">-- Remover Categoria --</option>'; // Option to remove
    predefinedCategories.forEach(cat => {
        const selected = target.category === cat ? 'selected' : '';
        optionsHTML += `<option value="${cat}" ${selected}>${cat}</option>`;
    });

    editFormContainer.innerHTML = `
        <div style="background-color: #f0f0f0; padding: 10px; margin-top: 10px; border-radius: 5px; border: 1px solid #ccc;">
            <label for="editCategorySelect-${targetId}" style="margin-right: 5px; display: block; margin-bottom: 5px;">Nova Categoria:</label>
            <select id="editCategorySelect-${targetId}" style="width: calc(100% - 22px); margin-bottom: 10px;">
                ${optionsHTML}
            </select>
            <div style="margin-top: 10px; text-align: right;">
                 <button class="btn save-category-btn" onclick="saveEditedCategory('${targetId}')">Salvar Categoria</button>
                 <button class="btn cancel-category-btn" onclick="cancelEditCategory('${targetId}')">Cancelar</button>
            </div>
        </div>`;
    editFormContainer.style.display = 'block';
    document.getElementById(`editCategorySelect-${targetId}`)?.focus();
};

window.saveEditedCategory = async function(targetId) {
    const newCategorySelect = document.getElementById(`editCategorySelect-${targetId}`);
    if (!newCategorySelect) return;
    const newCategoryValue = newCategorySelect.value; // Can be "" to remove

    const user = auth.currentUser;
    if (!user) { alert("Erro: Usuário não autenticado."); return; }
    const userId = user.uid;

    let targetRef;
    let targetList;
    let targetIndex = -1;
    let isArchived = false;
    let isResolved = false;

    // Check active list
    targetIndex = prayerTargets.findIndex(t => t.id === targetId);
    if (targetIndex !== -1) {
        targetRef = doc(db, "users", userId, "prayerTargets", targetId);
        targetList = prayerTargets;
    } else {
        // Check archived list
        targetIndex = archivedTargets.findIndex(t => t.id === targetId);
        if (targetIndex !== -1) {
            targetRef = doc(db, "users", userId, "archivedTargets", targetId);
            targetList = archivedTargets;
            isArchived = true;
            isResolved = archivedTargets[targetIndex].resolved; // Check if also in resolved
        } else {
            alert("Erro: Alvo não encontrado para atualização.");
            return;
        }
    }

    try {
        await updateDoc(targetRef, {
            category: newCategoryValue || null // Save null if "" is selected
        });

        // Update local object
        targetList[targetIndex].category = newCategoryValue || null;

        // Re-render appropriate list(s)
        if (isArchived) {
            renderArchivedTargets();
            if (isResolved) {
                renderResolvedTargets(); // Re-render resolved too if edited target was there
            }
        } else {
            renderTargets(); // Re-render active
             // If edited target was in daily list, update daily too
             if (document.getElementById('dailyTargets').querySelector(`.target[data-target-id="${targetId}"]`)) {
                 console.log("Target was in daily list, refreshing daily targets.");
                 await loadDailyTargets();
             }
        }

        alert('Categoria atualizada com sucesso!');
        cancelEditCategory(targetId); // Hide form

    } catch (error) {
        console.error(`Error updating category for ${targetId}:`, error);
        alert("Erro ao atualizar categoria: " + error.message);
    }
};

window.cancelEditCategory = function(targetId) {
    const editFormContainer = document.getElementById(`editCategoryForm-${targetId}`);
    if (editFormContainer) {
        editFormContainer.style.display = 'none';
        editFormContainer.innerHTML = ''; // Clear content
    }
};
// --- End Category Editing ---


// --- Daily Targets ---
async function loadDailyTargets() {
    const userId = auth.currentUser ? auth.currentUser.uid : null;
    if (!userId) { document.getElementById("dailyTargets").innerHTML = "<p>Faça login para ver os alvos diários.</p>"; currentDailyTargets = []; return; }
    const today = new Date(); const todayStr = formatDateToISO(today); const dailyDocId = `${userId}_${todayStr}`;
    const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);
    const dailyTargetsDiv = document.getElementById("dailyTargets");
    dailyTargetsDiv.innerHTML = '<p>Carregando alvos do dia...</p>'; // Initial feedback
    currentDailyTargets = []; // Reset local list before loading

    try {
        let dailyTargetsData; const dailySnapshot = await getDoc(dailyRef);
        if (!dailySnapshot.exists() || !dailySnapshot.data()?.targets) { // Check if exists and has targets property
            console.log(`[loadDailyTargets] Daily document for ${dailyDocId} not found or invalid, generating.`);
            dailyTargetsData = await generateDailyTargets(userId, todayStr);
            await setDoc(dailyRef, dailyTargetsData); // Save the newly generated document
            console.log(`[loadDailyTargets] Daily document ${dailyDocId} created.`);
        } else {
            dailyTargetsData = dailySnapshot.data();
            console.log(`[loadDailyTargets] Daily document ${dailyDocId} loaded.`);
        }

        // Validate if loaded data is valid
        if (!dailyTargetsData || !Array.isArray(dailyTargetsData.targets)) {
            console.error("[loadDailyTargets] Invalid daily data structure after load/generate:", dailyTargetsData);
            dailyTargetsDiv.innerHTML = "<p>Erro ao carregar alvos diários (dados inválidos).</p>";
            displayRandomVerse();
            currentDailyTargets = []; // Ensure it's empty on error
            return;
        }

        // Populate currentDailyTargets with IDs from the day
        currentDailyTargets = dailyTargetsData.targets.map(t => t?.targetId).filter(id => id);
        console.log(`[loadDailyTargets] Current daily target IDs:`, currentDailyTargets);

        const pendingTargetIds = dailyTargetsData.targets.filter(t => t && t.targetId && !t.completed).map(t => t.targetId);
        const completedTargetIds = dailyTargetsData.targets.filter(t => t && t.targetId && t.completed).map(t => t.targetId);
        console.log(`[loadDailyTargets] Pending IDs: ${pendingTargetIds.length}, Completed IDs: ${completedTargetIds.length}`);

        const allTargetIds = [...pendingTargetIds, ...completedTargetIds];
        if (allTargetIds.length === 0) {
            dailyTargetsDiv.innerHTML = "<p>Nenhum alvo de oração selecionado para hoje.</p>";
            displayRandomVerse();
            return; // currentDailyTargets is already empty
        }

        // Fetch details of active targets that are in the daily list
        const targetsToDisplayDetails = prayerTargets.filter(pt => pt && pt.id && allTargetIds.includes(pt.id));

        // Separate details into pending and completed
        const pendingTargetsDetails = targetsToDisplayDetails.filter(t => pendingTargetIds.includes(t.id));
        const completedTargetsDetails = targetsToDisplayDetails.filter(t => completedTargetIds.includes(t.id));

        console.log(`[loadDailyTargets] Pending Details: ${pendingTargetsDetails.length}, Completed Details: ${completedTargetsDetails.length}`);

        renderDailyTargets(pendingTargetsDetails, completedTargetsDetails);
        displayRandomVerse();

    } catch (error) {
        console.error("[loadDailyTargets] Error:", error);
        dailyTargetsDiv.innerHTML = "<p>Erro ao carregar alvos diários. Tente recarregar a página.</p>";
        displayRandomVerse(); // Show verse even on error
        currentDailyTargets = []; // Clear on error
    }
}

async function generateDailyTargets(userId, dateStr) {
    console.log(`[generateDailyTargets] Generating for ${userId} on ${dateStr}`);
    try {
        // Consider only valid active targets
        const availableTargets = prayerTargets.filter(t => t && t.id && !t.archived && !t.resolved);
        if (availableTargets.length === 0) {
            console.log("[generateDailyTargets] No active targets available.");
            return { userId, date: dateStr, targets: [] };
        }

        const todayUTC = createUTCDate(dateStr);
        if (!todayUTC) {
            console.error("[generateDailyTargets] Invalid dateStr:", dateStr);
            return { userId, date: dateStr, targets: [] };
        }

        // --- Selection Logic (Cycle and Exclusion) ---
        let pool = [...availableTargets]; // Start with all active

        // Fetch data from last N days to avoid close repetition (e.g., 7 days)
        const historyDays = 7;
        const presentedInHistory = new Set();
        for (let i = 1; i <= historyDays; i++) {
            const pastDate = new Date(todayUTC.getTime() - i * 86400000);
            const pastDateStr = formatDateToISO(pastDate);
            const pastDocId = `${userId}_${pastDateStr}`;
            try {
                const pastSnap = await getDoc(doc(db, "dailyPrayerTargets", pastDocId));
                if (pastSnap.exists()) {
                    const pastData = pastSnap.data();
                    if (pastData?.targets && Array.isArray(pastData.targets)) {
                        pastData.targets.forEach(t => { if (t && t.targetId) presentedInHistory.add(t.targetId); });
                    }
                }
            } catch (err) {
                console.warn(`[generateDailyTargets] Error fetching history for ${pastDateStr}:`, err);
            }
        }
        console.log(`[generateDailyTargets] Targets presented in the last ${historyDays} days:`, presentedInHistory.size);

        // Filter initial pool to remove recently presented ones
        pool = pool.filter(target => !presentedInHistory.has(target.id));
        console.log(`[generateDailyTargets] Pool size after filtering recent history: ${pool.length}`);

        // If pool is empty after filtering history, reset with ALL active targets
        if (pool.length === 0 && availableTargets.length > 0) {
            console.log("[generateDailyTargets] Pool empty after history filter, resetting pool to all available targets.");
            pool = [...availableTargets];
            // Optional: Prioritize those not presented longest ago
            pool.sort((a, b) => {
                 const dateA = a.lastPresentedDate instanceof Date ? a.lastPresentedDate.getTime() : 0;
                 const dateB = b.lastPresentedDate instanceof Date ? b.lastPresentedDate.getTime() : 0;
                 return dateA - dateB; // Earliest date (oldest) first
             });
        } else if (pool.length > 0) {
             // Sort remaining pool by lastPresentedDate (oldest first)
             pool.sort((a, b) => {
                 const dateA = a.lastPresentedDate instanceof Date ? a.lastPresentedDate.getTime() : 0;
                 const dateB = b.lastPresentedDate instanceof Date ? b.lastPresentedDate.getTime() : 0;
                 return dateA - dateB; // Present oldest first
             });
             // Or shuffle for total randomness within the filtered pool:
             // pool.sort(() => 0.5 - Math.random());
         }

        // Select up to 10 targets
        const maxDailyTargets = 10;
        const selectedTargets = pool.slice(0, Math.min(maxDailyTargets, pool.length));

        // Prepare for Firestore
        const targetsForFirestore = selectedTargets.map(target => ({ targetId: target.id, completed: false }));

        // Update lastPresentedDate in background (no await)
        updateLastPresentedDates(userId, selectedTargets).catch(err => console.error("[generateDailyTargets] BG error updating lastPresented:", err));

        console.log(`[generateDailyTargets] Generated ${targetsForFirestore.length} targets for ${dateStr}.`);
        return { userId: userId, date: dateStr, targets: targetsForFirestore };

    } catch (error) {
        console.error("[generateDailyTargets] Unexpected Error:", error);
        return { userId: userId, date: dateStr, targets: [] }; // Return empty on severe error
    }
}


async function updateLastPresentedDates(userId, selectedTargets) {
    if (!selectedTargets || selectedTargets.length === 0) return;
    const batch = writeBatch(db);
    const nowTimestamp = Timestamp.fromDate(new Date());
    let updatedCount = 0;
    selectedTargets.forEach(target => {
        if (target?.id) {
            batch.update(doc(db, "users", userId, "prayerTargets", target.id), { lastPresentedDate: nowTimestamp });
            // Update locally too
            const localTargetIndex = prayerTargets.findIndex(pt => pt.id === target.id);
            if (localTargetIndex !== -1) {
                 prayerTargets[localTargetIndex].lastPresentedDate = nowTimestamp.toDate();
            }
            updatedCount++;
        }
    });
    try {
        if (updatedCount > 0) {
            await batch.commit();
            console.log(`[updateLastPresentedDates] Updated lastPresentedDate for ${updatedCount} targets.`);
        }
    }
    catch (error) { console.error("[updateLastPresentedDates] Error committing batch:", error); }
}

function renderDailyTargets(pendingTargets, completedTargets) {
    const dailyTargetsDiv = document.getElementById("dailyTargets");
    dailyTargetsDiv.innerHTML = ''; // Clear before rendering

    if (pendingTargets.length === 0 && completedTargets.length === 0) {
        dailyTargetsDiv.innerHTML = "<p>Nenhum alvo de oração selecionado para hoje.</p>";
        return;
    }

    // Render Pending
    if (pendingTargets.length > 0) {
        pendingTargets.forEach((target) => {
            if (!target || !target.id) return;
            const dailyDiv = createTargetElement(target, false); // false = not completed
            addPrayButtonFunctionality(dailyDiv, target.id); // Add "Orei!" button
            dailyTargetsDiv.appendChild(dailyDiv);
        });
    } else if (completedTargets.length > 0) {
        // Message if no pending but there are completed
        dailyTargetsDiv.innerHTML = "<p>Você já orou por todos os alvos de hoje!</p>";
    }

    // Render Completed (if any)
    if (completedTargets.length > 0) {
        // Add separator if needed
        if (pendingTargets.length > 0 || dailyTargetsDiv.innerHTML.includes("todos os alvos de hoje")) {
             const separator = document.createElement('hr');
             separator.style.cssText = 'border: none; border-top: 1px solid #eee; margin-top:20px; margin-bottom:15px;';
             dailyTargetsDiv.appendChild(separator);
         }
         // Title for completed
         const completedTitle = document.createElement('h3');
         completedTitle.textContent = "Concluídos Hoje";
         completedTitle.style.cssText = 'color:#777; font-size:1.1em; margin-top:15px; margin-bottom:10px; text-align: center;'; // Centered
         dailyTargetsDiv.appendChild(completedTitle);

        // Render completed items
        completedTargets.forEach((target) => {
             if (!target || !target.id) return;
            const dailyDiv = createTargetElement(target, true); // true = completed
            dailyTargetsDiv.appendChild(dailyDiv);
        });
    }

    // Show completion popup if no more pending
    if (pendingTargets.length === 0 && completedTargets.length > 0) {
        displayCompletionPopup();
    }
}


function createTargetElement(target, isCompleted) {
    const dailyDiv = document.createElement("div");
    dailyDiv.classList.add("target");
    if (isCompleted) dailyDiv.classList.add("completed-target");
    dailyDiv.dataset.targetId = target.id;

    // Create category tag (if exists)
    let categoryTag = '';
    if (target.category) {
        categoryTag = `<span class="category-tag">${target.category}</span>`;
    }

    // Create deadline tag (if exists)
    let deadlineTag = '';
    if (target.hasDeadline && target.deadlineDate) {
        deadlineTag = `<span class="deadline-tag ${isDateExpired(target.deadlineDate) ? 'expired' : ''} ${isCompleted ? 'completed' : ''}">${formatDateForDisplay(target.deadlineDate)}</span>`;
    }

    // Render observations (only most recent by default)
    const observationsHTML = renderObservations(target.observations || [], false, target.id);

    dailyDiv.innerHTML = `
        <h3>${categoryTag} ${deadlineTag ? `Prazo: ${deadlineTag}` : ''} ${target.title || 'Título Indisponível'}</h3>
        <p>${target.details || 'Detalhes Indisponíveis'}</p>
        <p><strong>Data Criação:</strong> ${formatDateForDisplay(target.date)}</p>
        <p><strong>Tempo Decorrido:</strong> ${timeElapsed(target.date)}</p>
        ${observationsHTML}`; // Include observations
    return dailyDiv;
}

function addPrayButtonFunctionality(dailyDiv, targetId) {
    const prayButton = document.createElement("button");
    prayButton.textContent = "Orei!";
    prayButton.classList.add("pray-button", "btn");
    prayButton.dataset.targetId = targetId; // Store ID on button

    prayButton.onclick = async () => {
        const user = auth.currentUser; if (!user) { alert("Erro: Usuário não autenticado."); return; }
        const userId = user.uid; const todayStr = formatDateToISO(new Date()); const dailyDocId = `${userId}_${todayStr}`;
        const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);

        // Disable button immediately to prevent double clicks
        prayButton.disabled = true;
        prayButton.textContent = "Orado!";
        prayButton.style.opacity = 0.6;

        try {
            // Read current daily document
            const dailySnap = await getDoc(dailyRef);
            if (!dailySnap.exists()) {
                console.error("Daily doc not found during 'Orei!' click:", dailyDocId);
                alert("Erro: Documento diário não encontrado. Tente recarregar.");
                // Re-enable button on read error
                prayButton.disabled = false; prayButton.textContent = "Orei!"; prayButton.style.opacity = 1;
                return;
            }

            const dailyData = dailySnap.data();
            let targetUpdated = false;

            // Map targets, marking the clicked one as completed: true
            const updatedTargets = dailyData.targets.map(t => {
                if (t && t.targetId === targetId) {
                    targetUpdated = true;
                    return { ...t, completed: true };
                }
                return t;
            });

            if (!targetUpdated) {
                console.warn(`Target ${targetId} not found in daily doc ${dailyDocId} during 'Orei!' click.`);
                // Even if not found (could be an error), proceed to register the click
            }

             // --- Update Firestore ---
             // 1. Update daily document with target marked as complete (if found)
             if (targetUpdated) {
                 await updateDoc(dailyRef, { targets: updatedTargets });
             }

             // 2. Update click counts, weekly data, and perseverance bar
             await updateClickCounts(userId, targetId); // This function handles all of that now

            // --- Update UI ---
            // Reload and re-render daily list to reflect the change
            await loadDailyTargets();

        } catch (error) {
            console.error("Error registering 'Orei!':", error);
            alert("Erro ao registrar oração: " + error.message);
            // Re-enable button on write/processing error
            prayButton.disabled = false; prayButton.textContent = "Orei!"; prayButton.style.opacity = 1;
        }
    };

     // Add button to the target div, right after the H3
     const heading = dailyDiv.querySelector('h3');
     if (heading && heading.nextSibling) {
         dailyDiv.insertBefore(prayButton, heading.nextSibling); // Insert after h3
     } else if (heading) {
         dailyDiv.appendChild(prayButton); // If nothing after h3
     } else if (dailyDiv.firstChild) {
          dailyDiv.insertBefore(prayButton, dailyDiv.firstChild); // If no h3, insert at beginning
     } else {
         dailyDiv.appendChild(prayButton); // If div is empty
     }
}


async function updateClickCounts(userId, targetId) {
     // --- References ---
     const clickCountsRef = doc(db, "prayerClickCounts", targetId);
     const weeklyDocRef = doc(db, "weeklyInteractions", userId);
     const perseveranceDocRef = doc(db, "perseveranceData", userId); // Ref for bar data
     const now = new Date();

     // --- Time Data ---
     const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
     const year = now.getFullYear().toString();
     const todayUTCStr = formatDateToISO(now); // YYYY-MM-DD
     const weekId = getWeekIdentifier(now); // YYYY-W##
     const todayUTCStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())); // Start of UTC day

     // --- Flags and Data to Save ---
     let needsPerseveranceUpdate = false;
     let dataToSaveForPerseverance = {};
     let weeklyDataNeedsUpdate = false;

     // --- PERSEVERANCE BAR Update Logic ---
     // Check if last recorded interaction was *before* the start of today (UTC)
     let lastInteractionUTCStart = null;
     if (perseveranceData.lastInteractionDate instanceof Date && !isNaN(perseveranceData.lastInteractionDate)) {
         const li = perseveranceData.lastInteractionDate;
         lastInteractionUTCStart = new Date(Date.UTC(li.getUTCFullYear(), li.getUTCMonth(), li.getUTCDate()));
     }

     // If no previous date OR previous date is from a day before today
     if (!lastInteractionUTCStart || todayUTCStart.getTime() > lastInteractionUTCStart.getTime()) {
         needsPerseveranceUpdate = true; // Mark to save to Firestore
         console.log(`[updateClickCounts] First 'Orei!' interaction detected for ${todayUTCStr}. Updating perseverance bar.`);

         let isConsecutive = false;
         if (lastInteractionUTCStart) {
             // Check if last interaction was exactly the previous day
             const expectedYesterdayUTCStart = new Date(todayUTCStart.getTime() - 86400000); // Subtract 24h
             if (lastInteractionUTCStart.getTime() === expectedYesterdayUTCStart.getTime()) {
                 isConsecutive = true;
                 console.log("[updateClickCounts] Consecutive day detected.");
             } else {
                 console.log("[updateClickCounts] Not a consecutive day.");
             }
         } else {
              console.log("[updateClickCounts] No previous interaction date found, starting streak at 1.");
         }

         // Calculate new consecutive days and record
         const newConsecutiveDays = isConsecutive ? (perseveranceData.consecutiveDays || 0) + 1 : 1;
         const newRecordDays = Math.max(perseveranceData.recordDays || 0, newConsecutiveDays);

         // Update local data IMMEDIATELY for UI
         perseveranceData.consecutiveDays = newConsecutiveDays;
         perseveranceData.lastInteractionDate = todayUTCStart; // Save date of UTC day start
         perseveranceData.recordDays = newRecordDays;

         // Prepare data for Firestore (using Timestamp)
         dataToSaveForPerseverance = {
             consecutiveDays: newConsecutiveDays,
             lastInteractionDate: Timestamp.fromDate(todayUTCStart),
             recordDays: newRecordDays
         };

         // Update bar UI IMMEDIATELY
         updatePerseveranceUI();

     } else {
         console.log(`[updateClickCounts] Subsequent 'Orei!' click for ${todayUTCStr}. Bar already updated today.`);
     }

     // --- WEEKLY CHART Update Logic ---
     weeklyPrayerData.interactions = weeklyPrayerData.interactions || {}; // Ensure exists
     // If week changed or no data for today
     if (weeklyPrayerData.weekId !== weekId || weeklyPrayerData.interactions[todayUTCStr] !== true) {
         // If week changed, reset interactions
         if (weeklyPrayerData.weekId !== weekId) {
             console.log(`[updateClickCounts] Week changed from ${weeklyPrayerData.weekId} to ${weekId}. Resetting weekly data.`);
             weeklyPrayerData.interactions = {};
             weeklyPrayerData.weekId = weekId;
         }
         // Mark today as interacted (if not already)
         if(weeklyPrayerData.interactions[todayUTCStr] !== true) {
             weeklyPrayerData.interactions[todayUTCStr] = true;
             weeklyDataNeedsUpdate = true; // Mark to save to Firestore
             console.log(`[updateClickCounts] Marked ${todayUTCStr} as interacted for week ${weekId}.`);
         }
     }

     // --- Save to Firestore ---
     try {
         // 1. Save Click Counts (every time 'Orei!' is clicked)
         // Use set with merge: true to create/update and increment nested fields
         await setDoc(clickCountsRef, {
             targetId: targetId,
             userId: userId,
             totalClicks: increment(1),
             [`monthlyClicks.${yearMonth}`]: increment(1), // Increment current month counter
             [`yearlyClicks.${year}`]: increment(1)       // Increment current year counter
            }, { merge: true });
         console.log(`[updateClickCounts] Click count updated for ${targetId}.`);

         // 2. Save Weekly Chart Data (if needed)
         if (weeklyDataNeedsUpdate) {
             // Use set with merge: false to overwrite document with current week's data
             await setDoc(weeklyDocRef, {
                 userId: userId, // Add userId for reference
                 weekId: weeklyPrayerData.weekId,
                 interactions: weeklyPrayerData.interactions
                }, { merge: false });
             console.log(`[updateClickCounts] Weekly interaction data updated for week ${weeklyPrayerData.weekId}.`);
         }
         // Update chart UI (always, as local data was already updated)
         updateWeeklyChart();

         // 3. Save Perseverance Bar Data (if needed)
         if (needsPerseveranceUpdate && Object.keys(dataToSaveForPerseverance).length > 0) {
             // Use set with merge: true to create/update perseverance fields
             await setDoc(perseveranceDocRef, { userId: userId, ...dataToSaveForPerseverance } , { merge: true });
             console.log(`[updateClickCounts] Perseverance bar data updated in Firestore.`);
             // Bar UI was already updated earlier when needsPerseveranceUpdate was detected
         }

     } catch (error) {
         console.error(`[updateClickCounts] Error during Firestore updates for target ${targetId}:`, error);
         // Try to update UIs even on save error, based on local data
         updateWeeklyChart();
         // Don't re-update bar UI here, as local change was already made
     }
 }


// --- Perseverance (Progress Bar and Weekly Chart) ---

async function loadPerseveranceData(userId) {
    console.log(`[loadPerseveranceData] Loading PROGRESS BAR data for user ${userId}`);
    const perseveranceDocRef = doc(db, "perseveranceData", userId);
    try {
        const docSnap = await getDoc(perseveranceDocRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            // Convert Timestamp to Date and ensure numeric types
            perseveranceData.lastInteractionDate = data.lastInteractionDate instanceof Timestamp ? data.lastInteractionDate.toDate() : null;
            perseveranceData.consecutiveDays = Number(data.consecutiveDays) || 0;
            perseveranceData.recordDays = Number(data.recordDays) || 0;
            console.log("[loadPerseveranceData] Progress bar data loaded:", perseveranceData);
        } else {
            console.log(`[loadPerseveranceData] No progress bar data found for ${userId}. Initializing locally.`);
            perseveranceData = { consecutiveDays: 0, lastInteractionDate: null, recordDays: 0 };
        }
        updatePerseveranceUI(); // Update bar UI with loaded/initialized data
        await loadWeeklyPrayerData(userId); // Load chart data next

    } catch (error) {
        console.error("[loadPerseveranceData] Error loading progress bar data:", error);
         perseveranceData = { consecutiveDays: 0, lastInteractionDate: null, recordDays: 0 }; // Reset locally on error
         updatePerseveranceUI(); // Update UI with reset data
         // Try loading weekly data anyway
         try { await loadWeeklyPrayerData(userId); }
         catch (weeklyError) {
            console.error("[loadPerseveranceData] Error loading weekly data after bar error:", weeklyError);
             weeklyPrayerData = { weekId: getWeekIdentifier(new Date()), interactions: {} };
             resetWeeklyChart(); // Reset weekly UI if it also fails
         }
    }
}

async function loadWeeklyPrayerData(userId) {
    console.log(`[loadWeeklyPrayerData] Loading WEEKLY CHART data for user ${userId}`);
    const weeklyDocRef = doc(db, "weeklyInteractions", userId);
    try {
        const docSnap = await getDoc(weeklyDocRef);
        const today = new Date(); const currentWeekId = getWeekIdentifier(today);

        if (docSnap.exists()) {
            const loadedData = docSnap.data();
            // Check if stored week is the current week
            if (loadedData.weekId === currentWeekId) {
                weeklyPrayerData = {
                    weekId: loadedData.weekId,
                    interactions: loadedData.interactions || {} // Ensure interactions is an object
                };
                console.log("[loadWeeklyPrayerData] Weekly chart data loaded for current week:", weeklyPrayerData);
            } else {
                // If week changed, reset local data and save to Firestore
                console.log(`[loadWeeklyPrayerData] Week changed from ${loadedData.weekId} to ${currentWeekId}. Resetting weekly data.`);
                weeklyPrayerData = { weekId: currentWeekId, interactions: {} };
                await setDoc(weeklyDocRef, { userId: userId, ...weeklyPrayerData }, { merge: false }); // Overwrite with new week
                console.log(`[loadWeeklyPrayerData] Reset weekly data saved for new week.`);
            }
        } else {
            // If document doesn't exist, initialize locally and save to Firestore
            console.log(`[loadWeeklyPrayerData] No weekly data found. Initializing for ${currentWeekId}.`);
            weeklyPrayerData = { weekId: currentWeekId, interactions: {} };
            await setDoc(weeklyDocRef, { userId: userId, ...weeklyPrayerData }); // Create document
            console.log(`[loadWeeklyPrayerData] Initial weekly data saved.`);
        }
        updateWeeklyChart(); // Update chart UI with correct data

    } catch (error) {
        console.error("[loadWeeklyPrayerData] Error loading/initializing weekly chart data:", error);
         // On error, initialize locally with current week
         weeklyPrayerData = { weekId: getWeekIdentifier(new Date()), interactions: {} };
         resetWeeklyChart(); // Reset UI visually
    }
}


// Updates ONLY the progress BAR UI
function updatePerseveranceUI() {
     const consecutiveDays = perseveranceData.consecutiveDays || 0;
     const recordDays = perseveranceData.recordDays || 0;
     const targetDays = 30; // Goal days
     const percentage = Math.min((consecutiveDays / targetDays) * 100, 100); // Calculate percentage (max 100)

     const progressBar = document.getElementById('perseveranceProgressBar');
     const percentageDisplay = document.getElementById('perseverancePercentage');
     const barContainer = document.querySelector('.perseverance-bar-container'); // For tooltip

     if (progressBar && percentageDisplay && barContainer) {
         progressBar.style.width = `${percentage}%`;
         percentageDisplay.textContent = `${consecutiveDays} / ${targetDays} dias`;
         // Update tooltip with progress and record
         barContainer.title = `Progresso: ${Math.round(percentage)}% (${consecutiveDays} dias consecutivos)\nRecorde: ${recordDays} dias`;
     } else {
          console.warn("[updatePerseveranceUI] Could not find all progress bar elements.");
     }
     console.log("[updatePerseveranceUI] Progress bar UI updated.");
 }

// Resets BOTH local data structures and related UIs
function resetPerseveranceUI() {
    // Bar
    const progressBar = document.getElementById('perseveranceProgressBar');
    const percentageDisplay = document.getElementById('perseverancePercentage');
    const barContainer = document.querySelector('.perseverance-bar-container');
    if (progressBar && percentageDisplay && barContainer) {
        progressBar.style.width = `0%`;
        percentageDisplay.textContent = `0 / 30 dias`;
        barContainer.title = ''; // Clear tooltip
    }
    perseveranceData = { consecutiveDays: 0, lastInteractionDate: null, recordDays: 0 };
    console.log("[resetPerseveranceUI] Progress bar data and UI reset.");

    // Chart
    weeklyPrayerData = { weekId: getWeekIdentifier(new Date()), interactions: {} };
    resetWeeklyChart(); // Reset chart UI
    console.log("[resetPerseveranceUI] Weekly chart data and UI reset.");
}

// Updates ONLY the weekly CHART UI
function updateWeeklyChart() {
    const today = new Date();
    const currentDayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ... 6 = Saturday

    // Calculate start of week (Sunday) in UTC
    const firstDayOfWeek = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - currentDayOfWeek));
    firstDayOfWeek.setUTCHours(0, 0, 0, 0); // Ensure it's midnight UTC

    const interactions = weeklyPrayerData.interactions || {}; // Ensure it's an object
    const currentWeekId = weeklyPrayerData.weekId || getWeekIdentifier(today); // Use stored weekId or calculate
    console.log("[updateWeeklyChart] Checking interactions for week:", currentWeekId, "Data:", interactions);

    // Iterate through 7 days of the week (0 to 6)
    for (let i = 0; i < 7; i++) {
        const dayTick = document.getElementById(`day-${i}`); // Get day element (day-0, day-1, ...)
        if (!dayTick) continue; // Skip if element doesn't exist

        // Calculate UTC date for current day in loop
        const currentDayInLoop = new Date(firstDayOfWeek);
        currentDayInLoop.setUTCDate(firstDayOfWeek.getUTCDate() + i); // Add 'i' days to first day of week

        // Format date as YYYY-MM-DD to check in interactions
        const dateStringUTC = formatDateToISO(currentDayInLoop);

        // Check if interaction exists for this date in the current week
        if (interactions[dateStringUTC] === true) {
            dayTick.classList.add('active'); // Add 'active' class if interaction occurred
        } else {
            dayTick.classList.remove('active'); // Remove 'active' class if not
        }
    }
}

// Visually clears chart ticks
function resetWeeklyChart() {
    for (let i = 0; i < 7; i++) {
        const dayTick = document.getElementById(`day-${i}`);
        if (dayTick) dayTick.classList.remove('active');
    }
    console.log("[resetWeeklyChart] Weekly chart ticks visually cleared.");
}


// --- Views and Filters ---
function generateViewHTML(targetsToInclude = lastDisplayedTargets) {
    let viewHTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Visualização de Alvos</title><style>body{font-family: sans-serif; margin: 20px; line-height: 1.5;} .target{border: 1px solid #ccc; padding: 15px; margin-bottom: 15px; border-radius: 5px; background-color: #fff;} h1{text-align:center; color: #333;} h3{margin-top:0; margin-bottom: 5px; color: #444; display: flex; align-items: center; flex-wrap: wrap; gap: 5px;} p { margin: 4px 0; color: #555;} strong{color: #333;} .deadline-tag{background-color: #ffcc00; color: #333; padding: 3px 8px; border-radius: 4px; font-size: 0.8em; display: inline-block; border: 1px solid #e6b800;} .deadline-tag.expired{background-color: #ff6666; color: #fff; border-color: #ff4d4d;} .category-tag { background-color: #C71585; color: #fff; padding: 3px 8px; border-radius: 4px; font-size: 0.8em; font-weight: bold; display: inline-block; border: 1px solid #A01069; vertical-align: middle;} .observations { margin-top: 10px; padding-left: 15px; border-left: 2px solid #eee;} .observation-item{margin-left: 0; font-size: 0.9em; color: #555; padding-left: 0; border-left: none; margin-bottom: 5px;} .resolved{background-color:#eaffea; border-left: 5px solid #9cbe4a;} .completed-target{opacity: 0.8; border-left: 5px solid #b0b0b0;} .completed-target .category-tag { background-color: #e0e0e0; color: #757575; border-color: #bdbdbd; } .completed-target .deadline-tag { background-color: #e0e0e0; color: #999; border-color: #bdbdbd; } .target h3 .category-tag, .target h3 .deadline-tag { flex-shrink: 0; } </style></head><body><h1>Alvos de Oração (Visão Atual)</h1>`;
    if (!Array.isArray(targetsToInclude) || targetsToInclude.length === 0) {
        viewHTML += "<p style='text-align:center;'>Nenhum alvo para exibir na visão atual.</p>";
    } else {
        targetsToInclude.forEach(target => {
            if (target?.id) viewHTML += generateTargetViewHTML(target, false); // false = not completed view
        });
    }
    viewHTML += `</body></html>`;
    const viewTab = window.open('', '_blank');
    if (viewTab) {
        viewTab.document.write(viewHTML);
        viewTab.document.close();
    } else {
        alert('Seu navegador bloqueou a abertura de uma nova aba. Por favor, permita pop-ups para este site.');
    }
}

function generateDailyViewHTML() {
    let viewHTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Alvos do Dia</title><style>body{font-family: sans-serif; margin: 20px; line-height: 1.5;} .target{border: 1px solid #ccc; padding: 15px; margin-bottom: 15px; border-radius: 5px; background-color: #fff;} h1, h2 {text-align:center; color: #333;} h2 { margin-top: 25px; border-bottom: 1px solid #eee; padding-bottom: 5px;} h3{margin-top:0; margin-bottom: 5px; color: #444; display: flex; align-items: center; flex-wrap: wrap; gap: 5px;} p { margin: 4px 0; color: #555;} strong{color: #333;} .deadline-tag{background-color: #ffcc00; color: #333; padding: 3px 8px; border-radius: 4px; font-size: 0.8em; display: inline-block; border: 1px solid #e6b800;} .deadline-tag.expired{background-color: #ff6666; color: #fff; border-color: #ff4d4d;} .category-tag { background-color: #C71585; color: #fff; padding: 3px 8px; border-radius: 4px; font-size: 0.8em; font-weight: bold; display: inline-block; border: 1px solid #A01069; vertical-align: middle;} .observations { margin-top: 10px; padding-left: 15px; border-left: 2px solid #eee;} .observation-item{margin-left: 0; font-size: 0.9em; color: #555; padding-left: 0; border-left: none; margin-bottom: 5px;} .completed-target{background-color:#f0f0f0 !important; border-left: 5px solid #9cbe4a;} .completed-target .category-tag { background-color: #e0e0e0; color: #757575; border-color: #bdbdbd; } .completed-target .deadline-tag { background-color: #e0e0e0; color: #999; border-color: #bdbdbd; } .target h3 .category-tag, .target h3 .deadline-tag { flex-shrink: 0; } </style></head><body><h1>Alvos do Dia</h1>`;
    const dailyTargetsDiv = document.getElementById('dailyTargets');
    let pendingCount = 0;
    let completedCount = 0;

    if (dailyTargetsDiv) {
        viewHTML += `<h2>Pendentes</h2>`;
        const pendingDivs = dailyTargetsDiv.querySelectorAll('.target:not(.completed-target)');
        if (pendingDivs.length > 0) {
            pendingDivs.forEach(div => {
                const targetId = div.dataset.targetId;
                // Find target in local data (active, since only active go to daily)
                const targetData = prayerTargets.find(t => t.id === targetId);
                if (targetData) {
                    pendingCount++;
                    viewHTML += generateTargetViewHTML(targetData, false); // false = not completed
                } else {
                    console.warn(`Target data not found for pending daily ID: ${targetId}`);
                }
            });
        }
        if (pendingCount === 0) viewHTML += "<p style='text-align:center;'>Nenhum alvo pendente.</p>";

        viewHTML += `<hr style='margin: 25px 0;'/><h2>Concluídos Hoje</h2>`;
        const completedDivs = dailyTargetsDiv.querySelectorAll('.target.completed-target');
         if (completedDivs.length > 0) {
             completedDivs.forEach(div => {
                 const targetId = div.dataset.targetId;
                 const targetData = prayerTargets.find(t => t.id === targetId); // Still look in active
                 if (targetData) {
                    completedCount++;
                    viewHTML += generateTargetViewHTML(targetData, true); // true = completed
                 } else {
                    console.warn(`Target data not found for completed daily ID: ${targetId}`);
                 }
             });
         }
        if (completedCount === 0) viewHTML += "<p style='text-align:center;'>Nenhum alvo concluído hoje.</p>";

    } else {
        viewHTML += "<p style='text-align:center; color: red;'>Erro: Seção de alvos diários não encontrada na página.</p>";
    }
    viewHTML += `</body></html>`;
     const viewTab = window.open('', '_blank');
     if (viewTab) {
        viewTab.document.write(viewHTML);
        viewTab.document.close();
     } else {
        alert('Seu navegador bloqueou a abertura de uma nova aba. Por favor, permita pop-ups para este site.');
     }
}

// Helper function to generate HTML for ONE target for views
function generateTargetViewHTML(target, isCompletedView = false) {
     if (!target?.id) return ''; // Return empty string if target is invalid
     const formattedDate = formatDateForDisplay(target.date);
     const elapsed = timeElapsed(target.date);

     // Create category tag
     let categoryTag = '';
     if (target.category) {
         categoryTag = `<span class="category-tag">${target.category}</span>`;
     }

     // Create deadline tag
     let deadlineTag = '';
     if (target.hasDeadline && target.deadlineDate) {
        const formattedDeadline = formatDateForDisplay(target.deadlineDate);
        deadlineTag = `<span class="deadline-tag ${isDateExpired(target.deadlineDate) ? 'expired' : ''}">Prazo: ${formattedDeadline}</span>`;
     }

     // Render ALL observations for the view
     const observations = Array.isArray(target.observations) ? target.observations : [];
     const observationsHTML = renderObservations(observations, true, target.id); // true = expanded

     // Define CSS class if it's a completed target view (for daily view)
     const completedClass = isCompletedView ? 'completed-target' : '';

     // Build target HTML
     return `
         <div class="target ${completedClass}" data-target-id="${target.id}">
             <h3>${categoryTag} ${deadlineTag} ${target.title || 'Sem Título'}</h3>
             <p>${target.details || 'Sem Detalhes'}</p>
             <p><strong>Data Criação:</strong> ${formattedDate}</p>
             <p><strong>Tempo Decorrido:</strong> ${elapsed}</p>
             ${observationsHTML}
         </div>`;
}


async function generateResolvedViewHTML(startDate, endDate) {
    const user = auth.currentUser; if (!user) { alert("Você precisa estar logado."); return; } const uid = user.uid;

    // Create UTC dates for query
    const startUTC = new Date(Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()));
    const endNextDay = new Date(endDate); endNextDay.setUTCDate(endDate.getUTCDate() + 1); // Get next day
    const endUTCStartOfNextDay = new Date(Date.UTC(endNextDay.getFullYear(), endNextDay.getMonth(), endNextDay.getDate())); // Midnight of next day

    // Create Timestamps for Firestore query
    const startTimestamp = Timestamp.fromDate(startUTC);
    const endTimestamp = Timestamp.fromDate(endUTCStartOfNextDay); // Query up to < midnight of next day

    console.log(`[generateResolvedViewHTML] Querying resolved targets between: ${startUTC.toISOString()} and ${endUTCStartOfNextDay.toISOString()}`);

    const archivedRef = collection(db, "users", uid, "archivedTargets");
    // Query: search in archived, where resolved=true, resolutionDate >= start, resolutionDate < end, order by resolutionDate desc
    const q = query(archivedRef,
        where("resolved", "==", true),
        where("resolutionDate", ">=", startTimestamp),
        where("resolutionDate", "<", endTimestamp),
        orderBy("resolutionDate", "desc")
    );

    let filteredResolvedTargets = [];
    try {
        const querySnapshot = await getDocs(q);
        const rawTargets = querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        filteredResolvedTargets = rehydrateTargets(rawTargets); // Convert Timestamps to Dates
        console.log(`[generateResolvedViewHTML] Found ${filteredResolvedTargets.length} resolved targets in the period.`);
    } catch (error) {
        console.error("Error fetching resolved targets for view:", error);
        alert("Erro ao buscar alvos respondidos no período selecionado: " + error.message);
        return;
    }

    // Generate view HTML
    let viewHTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Alvos Respondidos (${formatDateForDisplay(startDate)} - ${formatDateForDisplay(endDate)})</title><style>body{font-family: sans-serif; margin: 20px; line-height: 1.5;} .target{border: 1px solid #ccc; padding: 15px; margin-bottom: 15px; border-radius: 5px; background-color: #eaffea; border-left: 5px solid #9cbe4a;} h1, h2 {text-align:center; color: #333;} h2 { margin-top: 5px; margin-bottom: 20px; font-size: 1.2em; color: #555;} h3{margin-top:0; margin-bottom: 5px; color: #444; display: flex; align-items: center; flex-wrap: wrap; gap: 5px;} p { margin: 4px 0; color: #555;} strong{color: #333;} .category-tag { background-color: #C71585; color: #fff; padding: 3px 8px; border-radius: 4px; font-size: 0.8em; font-weight: bold; display: inline-block; border: 1px solid #A01069; vertical-align: middle;} .observations { margin-top: 10px; padding-left: 15px; border-left: 2px solid #c3e6cb;} .observation-item{margin-left: 0; font-size: 0.9em; color: #555; padding-left: 0; border-left: none; margin-bottom: 5px;} hr { border: 0; border-top: 1px solid #ccc; margin: 20px 0; } .target h3 .category-tag { flex-shrink: 0; } </style></head><body><h1>Alvos Respondidos</h1>`;
    viewHTML += `<h2>Período: ${formatDateForDisplay(startDate)} a ${formatDateForDisplay(endDate)}</h2><hr/>`;

     if (filteredResolvedTargets.length === 0) {
         viewHTML += "<p style='text-align:center;'>Nenhum alvo respondido encontrado neste período.</p>";
     } else {
         // Iterate over found targets and generate HTML for each
         filteredResolvedTargets.forEach(target => {
             viewHTML += generateTargetViewHTMLForResolved(target);
         });
     }

    viewHTML += `</body></html>`;

    // Open in new tab
    const viewTab = window.open('', '_blank');
    if (viewTab) {
        viewTab.document.write(viewHTML);
        viewTab.document.close();
    } else {
        alert('Seu navegador bloqueou a abertura de uma nova aba. Por favor, permita pop-ups para este site.');
    }
}

// Helper function to generate HTML for ONE RESOLVED target for the view
function generateTargetViewHTMLForResolved(target) {
     if (!target?.id) return '';
     const formattedResolutionDate = formatDateForDisplay(target.resolutionDate);
     let totalTime = 'N/A';
     if (target.date instanceof Date && target.resolutionDate instanceof Date) {
         let diffInSeconds = Math.floor((target.resolutionDate.getTime() - target.date.getTime()) / 1000); if (diffInSeconds < 0) diffInSeconds = 0;
         if (diffInSeconds < 60) totalTime = `${diffInSeconds} seg`;
         else { let diffInMinutes = Math.floor(diffInSeconds / 60); if (diffInMinutes < 60) totalTime = `${diffInMinutes} min`;
             else { let diffInHours = Math.floor(diffInMinutes / 60); if (diffInHours < 24) totalTime = `${diffInHours} hr`;
                 else { let diffInDays = Math.floor(diffInHours / 24); if (diffInDays < 30) totalTime = `${diffInDays} dias`;
                     else { let diffInMonths = Math.floor(diffInDays / 30.44); if (diffInMonths < 12) totalTime = `${diffInMonths} meses`;
                         else { let diffInYears = Math.floor(diffInDays / 365.25); totalTime = `${diffInYears} anos`; }}}}}
     }

     // Create category tag
     let categoryTag = '';
     if (target.category) {
         categoryTag = `<span class="category-tag">${target.category}</span>`;
     }

     // Render ALL observations
     const observations = Array.isArray(target.observations) ? target.observations : [];
     const observationsHTML = renderObservations(observations, true, target.id); // true = expanded

     return `
         <div class="target resolved"> {/* Resolved class applied */}
             <h3>${categoryTag} ${target.title || 'Sem Título'} (Respondido)</h3>
             <p>${target.details || 'Sem Detalhes'}</p>
             <p><strong>Data Criação:</strong> ${formatDateForDisplay(target.date)}</p>
             <p><strong>Data Respondido:</strong> ${formattedResolutionDate}</p>
             <p><strong>Tempo Total (Criação -> Resposta):</strong> ${totalTime}</p>
             ${observationsHTML}
         </div>`;
}


function filterTargets(targets, searchTerm) {
    if (!searchTerm) return targets;
    const lowerSearchTerm = searchTerm.toLowerCase();
    return targets.filter(target => {
        if (!target) return false; // Add check if target is valid
         // Check title, details, category, and observations
         const titleMatch = target.title?.toLowerCase().includes(lowerSearchTerm);
         const detailsMatch = target.details?.toLowerCase().includes(lowerSearchTerm);
         const categoryMatch = target.category?.toLowerCase().includes(lowerSearchTerm); // Filter by category
         const observationMatch = Array.isArray(target.observations) &&
             target.observations.some(obs => obs?.text?.toLowerCase().includes(lowerSearchTerm));
        return titleMatch || detailsMatch || categoryMatch || observationMatch;
    });
}
function handleSearchMain(event) { currentSearchTermMain = event.target.value; currentPage = 1; renderTargets(); }
function handleSearchArchived(event) { currentSearchTermArchived = event.target.value; currentArchivedPage = 1; renderArchivedTargets(); }
function handleSearchResolved(event) { currentSearchTermResolved = event.target.value; currentResolvedPage = 1; renderResolvedTargets(); }

function showPanel(panelIdToShow) {
    const allPanels = ['appContent', 'dailySection', 'mainPanel', 'archivedPanel', 'resolvedPanel'];
    const dailyRelatedElements = ['weeklyPerseveranceChart', 'perseveranceSection', 'sectionSeparator']; // Elements shown with 'dailySection'

    // Hide all main panels
    allPanels.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.style.display = 'none';
    });

    // Hide daily-related elements by default
    dailyRelatedElements.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.style.display = 'none';
    });

    // Show requested panel
    const panelToShow = document.getElementById(panelIdToShow);
    if(panelToShow) {
        panelToShow.style.display = 'block';
    } else {
        console.warn(`Panel ${panelIdToShow} not found.`);
    }

    // If showing daily section, also show related elements
    if (panelIdToShow === 'dailySection') {
        dailyRelatedElements.forEach(id => {
            const el = document.getElementById(id);
            if(el) el.style.display = 'block';
        });
    }
    console.log(`Showing panel: ${panelIdToShow}`);
}

// --- Verses and Popups ---
const verses = [ // Array of verses
    "“Entrega o teu caminho ao Senhor; confia nele, e ele tudo fará.” - Salmos 37:5", "“Não andeis ansiosos por coisa alguma; antes em tudo sejam os vossos pedidos conhecidos diante de Deus pela oração e súplica com ações de graças; e a paz de Deus, que excede todo o entendimento, guardará os vossos corações e os vossos pensamentos em Cristo Jesus.” - Filipenses 4:6-7", "“Orai sem cessar.” - 1 Tessalonicenses 5:17", "“Confessai, pois, os vossos pecados uns aos outros, e orai uns pelos outros, para serdes curados. Muito pode, por sua eficácia, a súplica do justo.” - Tiago 5:16", "“E tudo quanto pedirdes em meu nome, eu o farei, para que o Pai seja glorificado no Filho.” - João 14:13", "“Pedi, e dar-se-vos-á; buscai, e encontrareis; batei, e abrir-se-vos-á. Pois todo o que pede, recebe; e quem busca, encontra; e a quem bate, abrir-se-lhe-á.” - Mateus 7:7-8", "“Se vós, pois, sendo maus, sabeis dar boas dádivas aos vossos filhos, quanto mais vosso Pai celestial dará o Espírito Santo àqueles que lho pedirem?” - Lucas 11:13", "“Este é o dia que o Senhor fez; regozijemo-nos e alegremo-nos nele.” - Salmos 118:24", "“Antes de clamarem, eu responderei; ainda não estarão falando, e eu já terei ouvido.” - Isaías 65:24", "“Clama a mim, e responder-te-ei, e anunciar-te-ei coisas grandes e ocultas, que não sabes.” - Jeremias 33:3"
];
function displayRandomVerse() {
    const verseDisplay = document.getElementById('dailyVerses');
    if (verseDisplay) {
        const randomIndex = Math.floor(Math.random() * verses.length);
        verseDisplay.textContent = verses[randomIndex];
    }
}
function displayCompletionPopup() {
    const popup = document.getElementById('completionPopup');
    if (popup) {
        popup.style.display = 'flex'; // Use flex to center content
        const popupVerseElement = popup.querySelector('#popupVerse');
        if (popupVerseElement) {
            const randomIndex = Math.floor(Math.random() * verses.length);
            popupVerseElement.textContent = verses[randomIndex];
        }
    }
}

// --- Manual Addition of Target to Daily List ---

// Opens the modal and prepares the search
function openManualTargetModal() {
    const modal = document.getElementById('manualTargetModal');
    const searchInput = document.getElementById('manualTargetSearchInput');
    const resultsDiv = document.getElementById('manualTargetSearchResults');
    if (!modal || !searchInput || !resultsDiv) {
        console.error("Manual target addition modal elements not found.");
        return;
    }

    searchInput.value = ''; // Clear previous search
    resultsDiv.innerHTML = '<p>Digite algo para buscar...</p>'; // Initial message
    modal.style.display = 'block';
    searchInput.focus();
}

// Handles search as user types
async function handleManualTargetSearch() {
    const searchInput = document.getElementById('manualTargetSearchInput');
    const resultsDiv = document.getElementById('manualTargetSearchResults');
    const searchTerm = searchInput.value.toLowerCase().trim();

    if (searchTerm.length < 2) { // Start searching after 2 chars
        resultsDiv.innerHTML = '<p>Digite pelo menos 2 caracteres...</p>';
        return;
    }

    resultsDiv.innerHTML = '<p>Buscando...</p>';

    // Filter ACTIVE targets matching search term
    const filteredActiveTargets = prayerTargets.filter(target => {
        if (!target || target.archived || target.resolved) return false; // Ensure active
        const titleMatch = target.title?.toLowerCase().includes(searchTerm);
        const detailsMatch = target.details?.toLowerCase().includes(searchTerm);
        const categoryMatch = target.category?.toLowerCase().includes(searchTerm);
        return titleMatch || detailsMatch || categoryMatch;
    });

    // Filter out targets ALREADY in the current daily list (uses global variable)
    const targetsNotInDailyList = filteredActiveTargets.filter(target => !currentDailyTargets.includes(target.id));

    renderManualSearchResults(targetsNotInDailyList);
}

// Renders search results in the modal
function renderManualSearchResults(targets) {
    const resultsDiv = document.getElementById('manualTargetSearchResults');
    resultsDiv.innerHTML = ''; // Clear previous results

    if (targets.length === 0) {
        resultsDiv.innerHTML = '<p>Nenhum alvo ativo encontrado ou todos já estão na lista do dia.</p>';
        return;
    }

    targets.forEach(target => {
        const itemDiv = document.createElement('div');
        itemDiv.classList.add('manual-target-item');
        itemDiv.onclick = () => selectManualTarget(target.id, target.title); // Pass ID and title

        let categoryInfo = target.category ? `[${target.category}] ` : '';
        let detailsSnippet = target.details ? `- ${target.details.substring(0, 50)}...` : '';

        itemDiv.innerHTML = `
            <h4>${target.title || 'Sem Título'}</h4>
            <span>${categoryInfo}${formatDateForDisplay(target.date)} ${detailsSnippet}</span>
        `;
        resultsDiv.appendChild(itemDiv);
    });
}

// Called when a target is selected in the modal
async function selectManualTarget(targetId, targetTitle) {
    if (!confirm(`Adicionar "${targetTitle || targetId}" à lista de oração de hoje?`)) {
        return;
    }

    const user = auth.currentUser;
    if (!user) { alert("Você precisa estar logado."); return; }
    const userId = user.uid;
    const todayStr = formatDateToISO(new Date());
    const dailyDocId = `${userId}_${todayStr}`;
    const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);
    const modal = document.getElementById('manualTargetModal');

    console.log(`[selectManualTarget] Attempting to add ${targetId} to daily doc ${dailyDocId}`);

    try {
        // Use Transaction for safety (atomic read and write)
        await runTransaction(db, async (transaction) => {
            const dailyDocSnap = await transaction.get(dailyRef);
            let currentTargetsArray = [];

            if (dailyDocSnap.exists()) {
                currentTargetsArray = dailyDocSnap.data().targets || [];
            } else {
                // If daily doc doesn't exist, something is wrong as loadDailyTargets should create it.
                // Alerting is safer than trying to create it here.
                console.warn(`[selectManualTarget] Daily document ${dailyDocId} does not exist during transaction!`);
                throw new Error("Documento diário não encontrado. Tente recarregar a página.");
            }

            // Check if already exists in list (safe redundancy)
            const alreadyExists = currentTargetsArray.some(t => t?.targetId === targetId);
            if (alreadyExists) {
                alert(`"${targetTitle || targetId}" já está na lista de hoje.`);
                console.log(`[selectManualTarget] Target ${targetId} already in list.`);
                return; // Exit transaction without writing
            }

            // Add the new target
            const newTargetEntry = {
                targetId: targetId,
                completed: false,
                manuallyAdded: true // Mark as manually added
            };
            const updatedTargetsArray = [...currentTargetsArray, newTargetEntry];

            // Update the document in the transaction
            transaction.update(dailyRef, { targets: updatedTargetsArray });
            console.log(`[selectManualTarget] Target ${targetId} added to daily doc via transaction.`);
        });

        // Transaction successful
        alert(`"${targetTitle || targetId}" adicionado à lista do dia!`);
        if (modal) modal.style.display = 'none'; // Close modal

        // Update UI by reloading daily targets
        await loadDailyTargets();

    } catch (error) {
        console.error("Error adding manual target to daily list:", error);
        alert("Erro ao adicionar alvo manual: " + error.message);
        // Keep modal open on error for user to retry or cancel.
    }
}


// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("[DOMContentLoaded] DOM fully loaded. Setting up listeners.");
    try {
        const dateInput = document.getElementById('date');
        if (dateInput) dateInput.value = formatDateToISO(new Date()); // Set default date in form
    } catch (e) {
        console.error("Error setting default date:", e);
    }

    // Observe authentication state changes
    onAuthStateChanged(auth, (user) => loadData(user));

    // Search & Filter Listeners
    document.getElementById('searchMain')?.addEventListener('input', handleSearchMain);
    document.getElementById('searchArchived')?.addEventListener('input', handleSearchArchived);
    document.getElementById('searchResolved')?.addEventListener('input', handleSearchResolved);
    document.getElementById('showDeadlineOnly')?.addEventListener('change', handleDeadlineFilterChange);
    document.getElementById('showExpiredOnlyMain')?.addEventListener('change', handleExpiredOnlyMainChange);

    // Auth Button Listeners
    document.getElementById('btnEmailSignUp')?.addEventListener('click', signUpWithEmailPassword);
    document.getElementById('btnEmailSignIn')?.addEventListener('click', signInWithEmailPassword);
    document.getElementById('btnForgotPassword')?.addEventListener('click', resetPassword);
    document.getElementById('btnLogout')?.addEventListener('click', () => {
        signOut(auth).catch(error => console.error("Logout error:", error));
    });

    // Report Button Listener
    document.getElementById("viewReportButton")?.addEventListener('click', () => window.location.href = 'orei.html');

    // Daily Section Button Listeners
    document.getElementById("refreshDaily")?.addEventListener("click", async () => {
        const user = auth.currentUser; if (!user) { alert("Você precisa estar logado."); return; }
        if (confirm("Gerar nova lista de alvos para hoje? Isso substituirá a lista atual, incluindo os que já foram marcados como 'Orado'.")) {
            const userId = user.uid; const todayStr = formatDateToISO(new Date()); const dailyDocId = `${userId}_${todayStr}`;
            const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);
            document.getElementById("dailyTargets").innerHTML = '<p>Gerando nova lista...</p>'; // Feedback
            try {
                const newTargetsData = await generateDailyTargets(userId, todayStr); // Generate new list
                await setDoc(dailyRef, newTargetsData); // Save (overwrite) in Firestore
                await loadDailyTargets(); // Reload and render new list
                alert("Nova lista de alvos do dia gerada!");
            } catch (error) {
                console.error("Error refreshing daily targets:", error);
                alert("Erro ao gerar nova lista de alvos: " + error.message);
                await loadDailyTargets(); // Try reloading old list on error
            }
        }
     });
     document.getElementById("copyDaily")?.addEventListener("click", () => {
        const dailyTargetsDiv = document.getElementById('dailyTargets');
        let textToCopy = 'Alvos Pendentes Hoje:\n\n';
        let count = 0;
        if (!dailyTargetsDiv) return;
        const targetDivs = dailyTargetsDiv.querySelectorAll('.target:not(.completed-target)'); // Get only pending
        targetDivs.forEach((div) => {
            // Extract title (considering preceding tags)
            const titleElement = div.querySelector('h3');
            let titleText = 'Sem Título';
            if(titleElement && titleElement.lastChild && titleElement.lastChild.nodeType === Node.TEXT_NODE) {
                 titleText = titleElement.lastChild.textContent.trim();
            } else if (titleElement) {
                // Fallback if no direct text (can happen if only tags)
                titleText = titleElement.textContent.replace(/Prazo:.*?\d{2}\/\d{2}\/\d{4}/, '').trim(); // Try removing deadline if exists
                predefinedCategories.forEach(cat => titleText = titleText.replace(cat, '')); // Try removing category
                titleText = titleText.trim() || 'Sem Título';
            }

            const detailsElement = div.querySelector('p:nth-of-type(1)'); // Get first paragraph as detail
            const detailsText = detailsElement ? detailsElement.textContent.trim() : 'Sem Detalhes';
            count++;
            textToCopy += `${count}. ${titleText}\n   ${detailsText}\n\n`;
        });
        if (count > 0) {
            navigator.clipboard.writeText(textToCopy.trim())
                .then(() => alert(`${count} alvo(s) pendente(s) copiado(s) para a área de transferência!`))
                .catch(err => {
                    console.error('Falha ao copiar para clipboard:', err);
                    prompt("Não foi possível copiar automaticamente. Copie manualmente abaixo:", textToCopy.trim());
                });
        } else {
            alert('Nenhum alvo pendente para copiar.');
        }
     });

    // Listener for Manual Add Button
    document.getElementById("addManualTargetButton")?.addEventListener('click', () => {
        const user = auth.currentUser;
        if (!user) { alert("Você precisa estar logado para adicionar alvos."); return; }
        openManualTargetModal();
    });

     // View Generation Button Listeners
     document.getElementById('generateViewButton')?.addEventListener('click', () => generateViewHTML(lastDisplayedTargets)); // Use last rendered list in active panel
     document.getElementById('viewDaily')?.addEventListener('click', generateDailyViewHTML);
     document.getElementById("viewResolvedViewButton")?.addEventListener("click", () => {
         const modal = document.getElementById("dateRangeModal");
         if(modal) {
            modal.style.display = "block";
            // Fill default dates (today and 30 days ago)
            const today = new Date();
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(today.getDate() - 30);
            const endDateInput = document.getElementById("endDate");
            const startDateInput = document.getElementById("startDate");
            if(endDateInput) endDateInput.value = formatDateToISO(today);
            if(startDateInput) startDateInput.value = formatDateToISO(thirtyDaysAgo);
         }
     });
     document.getElementById('closePopup')?.addEventListener('click', () => {
        const popup = document.getElementById('completionPopup');
        if(popup) popup.style.display = 'none';
     });

     // Navigation Button Listeners
    document.getElementById('backToMainButton')?.addEventListener('click', () => showPanel('dailySection'));
    document.getElementById('addNewTargetButton')?.addEventListener('click', () => showPanel('appContent'));
    document.getElementById('viewAllTargetsButton')?.addEventListener('click', () => { showPanel('mainPanel'); currentPage = 1; renderTargets(); });
    document.getElementById("viewArchivedButton")?.addEventListener("click", () => { showPanel('archivedPanel'); currentArchivedPage = 1; renderArchivedTargets(); });
    document.getElementById("viewResolvedButton")?.addEventListener("click", () => { showPanel('resolvedPanel'); currentResolvedPage = 1; renderResolvedTargets(); });

    // Date Range Modal Listeners
    const dateRangeModal = document.getElementById("dateRangeModal");
    document.getElementById("closeDateRangeModal")?.addEventListener("click", () => {if(dateRangeModal) dateRangeModal.style.display = "none"});
    document.getElementById("generateResolvedView")?.addEventListener("click", () => {
        const startDateStr = document.getElementById("startDate").value;
        const endDateStr = document.getElementById("endDate").value;
        if (startDateStr && endDateStr) {
            // Convert strings to Date objects (considers local, but uses UTC in function)
            const start = new Date(startDateStr + 'T00:00:00');
            const end = new Date(endDateStr + 'T00:00:00');
             if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                 alert("Datas inválidas selecionadas.");
                 return;
             }
             if (start > end) {
                 alert("A data de início não pode ser posterior à data de fim.");
                 return;
             }
            generateResolvedViewHTML(start, end); // Call function that uses UTC
            if(dateRangeModal) dateRangeModal.style.display = "none"; // Close modal
        } else {
            alert("Por favor, selecione as datas de início e fim.");
        }
    });
    document.getElementById("cancelDateRange")?.addEventListener("click", () => {if(dateRangeModal) dateRangeModal.style.display = "none"});

    // Manual Target Modal Listeners
    const manualTargetModal = document.getElementById("manualTargetModal");
    document.getElementById("closeManualTargetModal")?.addEventListener("click", () => { if(manualTargetModal) manualTargetModal.style.display = "none" });
    // Listener for search input
    document.getElementById("manualTargetSearchInput")?.addEventListener('input', handleManualTargetSearch);

    // Close modals if clicked outside
    window.addEventListener('click', (event) => {
        if (event.target == dateRangeModal) {
            dateRangeModal.style.display = "none";
        }
        if (event.target == manualTargetModal) {
            manualTargetModal.style.display = "none";
        }
    });

}); // End of DOMContentLoaded

// --- Add global functions to window for HTML inline onclick access ---
// (Needed because script is type="module")
window.markAsResolved = markAsResolved;
window.archiveTarget = archiveTarget;
window.deleteArchivedTarget = deleteArchivedTarget;
window.toggleAddObservation = toggleAddObservation;
window.saveObservation = saveObservation;
window.toggleObservations = toggleObservations;
window.editDeadline = editDeadline;
window.saveEditedDeadline = saveEditedDeadline;
window.cancelEditDeadline = cancelEditDeadline;
window.editCategory = editCategory;
window.saveEditedCategory = saveEditedCategory;
window.cancelEditCategory = cancelEditCategory;
// Add new functions to window
window.openManualTargetModal = openManualTargetModal;
window.handleManualTargetSearch = handleManualTargetSearch;
window.selectManualTarget = selectManualTarget;
