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
let lastDisplayedTargets = []; // Holds the list currently shown in the active panel for "Gerar Visualização Atual"
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

const predefinedCategories = [
    "Família", "Pessoal", "Igreja", "Trabalho", "Sonho",
    "Profético", "Promessas", "Esposa", "Filhas", "Ministério de Intercessão", "Outros"
];

// ==== UTILITY FUNCTIONS ====

function getWeekIdentifier(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

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


function formatDateForDisplay(dateInput) {
    if (!dateInput) { return 'Data Inválida'; }
    let dateToFormat;
    if (dateInput instanceof Timestamp) { dateToFormat = dateInput.toDate(); }
    else if (dateInput instanceof Date && !isNaN(dateInput)) { dateToFormat = dateInput; }
    else {
        if (typeof dateInput === 'string') {
            // Try parsing as ISO with or without timezone, default to UTC if just YYYY-MM-DD
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
        const fieldsToConvert = ['date', 'deadlineDate', 'lastPrayedDate', 'resolutionDate', 'archivedDate'];

        fieldsToConvert.forEach(field => {
            const originalValue = rehydratedTarget[field];
            if (originalValue instanceof Timestamp) {
                rehydratedTarget[field] = originalValue.toDate();
            } else if (originalValue instanceof Date && !isNaN(originalValue)) {
                // Already a valid Date object, keep it
            } else if (originalValue === null || originalValue === undefined) {
                rehydratedTarget[field] = null;
            } else if (typeof originalValue === 'string' && /^\d{4}-\d{2}-\d{2}/.test(originalValue)) { // Check if it looks like a date string
                try {
                    // Attempt to parse string into Date object (assume UTC if no timezone info)
                    const parsedDate = new Date(originalValue.includes('T') || originalValue.includes('Z') ? originalValue : originalValue + 'T00:00:00Z');
                    rehydratedTarget[field] = !isNaN(parsedDate.getTime()) ? parsedDate : null;
                } catch (e) { rehydratedTarget[field] = null; }
            } else if (field !== 'category') { // Ignore category, set other unexpected types to null
                 rehydratedTarget[field] = null;
            }
        });

        // Ensure category is string or null
        rehydratedTarget.category = typeof rehydratedTarget.category === 'string' ? rehydratedTarget.category : null;

        // Process observations
        if (rehydratedTarget.observations && Array.isArray(rehydratedTarget.observations)) {
            rehydratedTarget.observations = rehydratedTarget.observations.map(obs => {
                let obsDateFinal = null;
                if (obs.date instanceof Timestamp) obsDateFinal = obs.date.toDate();
                else if (obs.date instanceof Date && !isNaN(obs.date)) obsDateFinal = obs.date;
                else if (typeof obs.date === 'string') { // Try parsing observation date string
                    try {
                         const parsedObsDate = new Date(obs.date.includes('T') || obs.date.includes('Z') ? obs.date : obs.date + 'T00:00:00Z');
                         if (!isNaN(parsedObsDate.getTime())) obsDateFinal = parsedObsDate;
                     } catch(e) { /* ignore parse error */ }
                }
                return { ...obs, date: obsDateFinal }; // Ensure observation date is Date or null
            }).sort((a, b) => (b.date instanceof Date ? b.date.getTime() : 0) - (a.date instanceof Date ? a.date.getTime() : 0)); // Sort observations newest first
        } else {
            rehydratedTarget.observations = []; // Ensure observations is an empty array if missing/invalid
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

            // Load targets (active and archived)
            await fetchPrayerTargets(uid);
            await fetchArchivedTargets(uid);
            resolvedTargets = archivedTargets.filter(target => target.resolved); // Filter resolved from archived

            checkExpiredDeadlines(); // Check and log expired deadlines

            // Initial render (panels hidden, but data is ready)
            renderTargets();
            renderArchivedTargets();
            renderResolvedTargets();

            // Load daily targets last (as it might depend on active targets)
            await loadDailyTargets();

            // Show the initial view (Daily Section)
            showPanel('dailySection');

        } catch (error) {
             console.error("[loadData] Error during data loading process:", error);
             alert("Ocorreu um erro ao carregar seus dados. Por favor, recarregue a página ou tente fazer login novamente.");
             resetPerseveranceUI(); // Reset bar/chart UI
             // Clear local data on load error
             prayerTargets = []; archivedTargets = []; resolvedTargets = []; currentDailyTargets = [];
             // Clear display areas
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
        // Clear display areas
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
    // Order by archivedDate descending (most recent first), fallback to creation date if archivedDate is missing
    const archivedSnapshot = await getDocs(query(archivedRef, orderBy("archivedDate", "desc"), orderBy("date", "desc")));
    console.log(`[fetchArchivedTargets] Found ${archivedSnapshot.size} archived targets for user ${uid}`);
    const rawArchived = archivedSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    archivedTargets = rehydrateTargets(rawArchived);
    // Re-sort locally just in case (ensure most recent archive date is first)
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
    lastDisplayedTargets = targetsToDisplay; // Update list used by "Gerar Visualização Atual"

    // Render
    if (targetsToDisplay.length === 0) {
        if (filteredAndPagedTargets.length > 0 && currentPage > 1) {
            // If on a page > 1 with no results (due to filtering), go back to page 1
            currentPage = 1; renderTargets(); return;
        } else targetListDiv.innerHTML = '<p>Nenhum alvo de oração encontrado com os filtros atuais.</p>';
    } else {
        targetsToDisplay.forEach((target) => {
             if (!target || !target.id) { console.warn("[renderTargets] Skipping invalid target:", target); return; }
            const targetDiv = document.createElement("div");
            targetDiv.classList.add("target");
            targetDiv.dataset.targetId = target.id; // Store ID for potential future use
            const formattedDate = formatDateForDisplay(target.date);
            const elapsed = timeElapsed(target.date);

            // Create category tag (if exists)
            let categoryTag = '';
            if (target.category) {
                categoryTag = `<span class="category-tag">${target.category}</span>`;
            }

            // Create deadline tag (if exists)
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
                ${renderObservations(observations, false, target.id)} {/* Pass targetId here */}
                <div class="target-actions">
                    <button class="resolved btn" onclick="window.markAsResolved('${target.id}')">Respondido</button>
                    <button class="archive btn" onclick="window.archiveTarget('${target.id}')">Arquivar</button>
                    <button class="add-observation btn" onclick="window.toggleAddObservation('${target.id}')">Observação</button>
                    ${target.hasDeadline ? `<button class="edit-deadline btn" onclick="window.editDeadline('${target.id}')">Editar Prazo</button>` : ''}
                    <button class="edit-category btn" onclick="window.editCategory('${target.id}')">Editar Categoria</button>
                </div>
                <div id="observationForm-${target.id}" class="add-observation-form" style="display:none;"></div>
                <div id="editDeadlineForm-${target.id}" class="edit-deadline-form" style="display:none;"></div>
                <div id="editCategoryForm-${target.id}" class="edit-category-form" style="display:none;"></div>
                `;
            targetListDiv.appendChild(targetDiv);
            renderObservationForm(target.id); // Pre-render the form structure (hidden)
        });
    }
    renderPagination('mainPanel', currentPage, filteredAndPagedTargets);
}

function renderArchivedTargets() {
    const archivedListDiv = document.getElementById('archivedList');
    archivedListDiv.innerHTML = '';
    let filteredAndPagedArchived = [...archivedTargets]; // Use list already sorted in fetch/local updates

    if (currentSearchTermArchived) filteredAndPagedArchived = filterTargets(filteredAndPagedArchived, currentSearchTermArchived);

    // Pagination
    const startIndex = (currentArchivedPage - 1) * targetsPerPage;
    const endIndex = startIndex + targetsPerPage;
    const targetsToDisplay = filteredAndPagedArchived.slice(startIndex, endIndex);
    lastDisplayedTargets = targetsToDisplay; // Update list used by "Gerar Visualização Atual"

    // Render
    if (targetsToDisplay.length === 0) {
        if (filteredAndPagedArchived.length > 0 && currentArchivedPage > 1) {
             currentArchivedPage = 1; renderArchivedTargets(); return;
        } else archivedListDiv.innerHTML = '<p>Nenhum alvo arquivado encontrado.</p>';
    } else {
        targetsToDisplay.forEach((target) => {
             if (!target || !target.id) return;
            const archivedDiv = document.createElement("div");
            archivedDiv.classList.add("target", "archived"); // Base classes
            if (target.resolved) archivedDiv.classList.add("resolved"); // Add resolved class if applicable
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
                ${renderObservations(observations, false, target.id)} {/* Pass targetId */}
                <div class="target-actions">
                    <button class="delete btn" onclick="window.deleteArchivedTarget('${target.id}')">Excluir Permanentemente</button>
                    <button class="add-observation btn" onclick="window.toggleAddObservation('${target.id}')">Observação</button>
                    <button class="edit-category btn" onclick="window.editCategory('${target.id}')">Editar Categoria</button>
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
    // Use `resolvedTargets` list which was filtered and sorted in loadData/updates
    let filteredAndPagedResolved = [...resolvedTargets];

    if (currentSearchTermResolved) filteredAndPagedResolved = filterTargets(filteredAndPagedResolved, currentSearchTermResolved);

    // Sort (should already be sorted by resolutionDate descending, but double-check)
    filteredAndPagedResolved.sort((a, b) => {
        const dateA = a.resolutionDate instanceof Date ? a.resolutionDate.getTime() : 0;
        const dateB = b.resolutionDate instanceof Date ? b.resolutionDate.getTime() : 0;
        return dateB - dateA; // Most recent first
    });

    // Pagination
    const startIndex = (currentResolvedPage - 1) * targetsPerPage;
    const endIndex = startIndex + targetsPerPage;
    const targetsToDisplay = filteredAndPagedResolved.slice(startIndex, endIndex);
    lastDisplayedTargets = targetsToDisplay; // Update list used by "Gerar Visualização Atual"

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
                ${renderObservations(observations, false, target.id)} {/* Pass targetId */}
                 <div class="target-actions">
                    <button class="add-observation btn" onclick="window.toggleAddObservation('${target.id}')">Observação</button>
                    <button class="edit-category btn" onclick="window.editCategory('${target.id}')">Editar Categoria</button>
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
    // Update the correct page variable based on the panelId
    if (panelId === 'mainPanel') currentPage = newPage;
    else if (panelId === 'archivedPanel') currentArchivedPage = newPage;
    else if (panelId === 'resolvedPanel') currentResolvedPage = newPage;

    // Render the corresponding panel
    if (panelId === 'mainPanel') renderTargets();
    else if (panelId === 'archivedPanel') renderArchivedTargets();
    else if (panelId === 'resolvedPanel') renderResolvedTargets();

    // Scroll to the top of the panel after changing page
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
        // Validate deadline is not before creation date
        if (deadlineDateUTC.getTime() < dateUTC.getTime()) {
            alert("O Prazo de Validade não pode ser anterior à Data de Criação."); return;
        }
    }

    const target = {
        title: title,
        details: details,
        date: Timestamp.fromDate(dateUTC), // Store as Timestamp
        hasDeadline: hasDeadline,
        deadlineDate: deadlineDateUTC ? Timestamp.fromDate(deadlineDateUTC) : null, // Store as Timestamp or null
        category: category || null, // Store category or null
        archived: false,
        resolved: false,
        resolutionDate: null,
        archivedDate: null,
        observations: [], // Initialize observations array
        userId: uid,
        lastPrayedDate: null // Initialize last prayed date
    };

    try {
        const docRef = await addDoc(collection(db, "users", uid, "prayerTargets"), target);
        const newLocalTarget = rehydrateTargets([{ ...target, id: docRef.id }])[0]; // Rehydrate for local use
        prayerTargets.unshift(newLocalTarget); // Add to beginning of local list
        // Re-sort local list by date (newest first)
        prayerTargets.sort((a, b) => (b.date instanceof Date ? b.date.getTime() : 0) - (a.date instanceof Date ? a.date.getTime() : 0));

        document.getElementById("prayerForm").reset(); // Reset form fields
        document.getElementById('deadlineContainer').style.display = 'none'; // Hide deadline input
        document.getElementById('categorySelect').value = ''; // Clear category select
        document.getElementById('date').value = formatDateToISO(new Date()); // Reset date to today
        showPanel('mainPanel'); currentPage = 1; renderTargets(); // Show main panel, go to page 1 and render
        alert('Alvo de oração adicionado com sucesso!');
    } catch (error) {
        console.error("Error adding prayer target: ", error);
        alert("Erro ao adicionar alvo: " + error.message);
    }
});

window.markAsResolved = async function(targetId) {
    const user = auth.currentUser; if (!user) { alert("Erro: Usuário não autenticado."); return; }
    const userId = user.uid;
    const targetIndex = prayerTargets.findIndex(t => t.id === targetId);
    if (targetIndex === -1) { alert("Erro: Alvo não encontrado na lista ativa."); return; }
    const targetData = prayerTargets[targetIndex];
    if (!confirm(`Marcar o alvo "${targetData.title || targetId}" como respondido? Ele será movido para Arquivados.`)) return;
    const nowTimestamp = Timestamp.fromDate(new Date()); // Use current date/time for resolution and archiving

    const activeTargetRef = doc(db, "users", userId, "prayerTargets", targetId);
    const archivedTargetRef = doc(db, "users", userId, "archivedTargets", targetId);

    try {
        // Prepare data for archiving, converting local Dates back to Firestore Timestamps where necessary
        const archivedData = {
            ...targetData, // Copy existing fields
            date: targetData.date instanceof Date ? Timestamp.fromDate(targetData.date) : targetData.date,
            deadlineDate: targetData.deadlineDate instanceof Date ? Timestamp.fromDate(targetData.deadlineDate) : targetData.deadlineDate,
            lastPrayedDate: targetData.lastPrayedDate instanceof Date ? Timestamp.fromDate(targetData.lastPrayedDate) : targetData.lastPrayedDate,
            observations: Array.isArray(targetData.observations) ? targetData.observations.map(obs => ({
                ...obs,
                date: obs.date instanceof Date ? Timestamp.fromDate(obs.date) : obs.date // Convert observation dates
            })) : [],
            resolved: true, // Mark as resolved
            archived: true, // Also mark as archived
            resolutionDate: nowTimestamp, // Set resolution date
            archivedDate: nowTimestamp // Set archive date (same as resolution)
         };
        delete archivedData.id; // Remove ID from object to be saved (Firestore uses doc ID)
        delete archivedData.status; // Remove temporary 'status' field if it exists locally

        // Use a batch write for atomicity (delete from active, set in archived)
        const batch = writeBatch(db);
        batch.delete(activeTargetRef);
        batch.set(archivedTargetRef, archivedData);
        await batch.commit();

        // Update local lists
        prayerTargets.splice(targetIndex, 1); // Remove from local active list
        const newArchivedLocal = rehydrateTargets([{ ...archivedData, id: targetId }])[0]; // Rehydrate for local use
        archivedTargets.unshift(newArchivedLocal); // Add to beginning of local archived list

        // Re-sort archived list by archive date and update resolved list
        archivedTargets.sort((a, b) => (b.archivedDate instanceof Date ? b.archivedDate.getTime() : 0) - (a.archivedDate instanceof Date ? a.archivedDate.getTime() : 0));
        resolvedTargets = archivedTargets.filter(t => t.resolved); // Re-filter resolved list
        resolvedTargets.sort((a, b) => (b.resolutionDate instanceof Date ? b.resolutionDate.getTime() : 0) - (a.resolutionDate instanceof Date ? a.resolutionDate.getTime() : 0)); // Sort resolved by resolution date

        // Re-render affected lists
        renderTargets();
        renderArchivedTargets();
        renderResolvedTargets();
        alert('Alvo marcado como respondido e movido para Arquivados.');
    } catch (error) {
        console.error("Error marking target as resolved: ", error);
        alert("Erro ao marcar como respondido: " + error.message);
    }
};

window.archiveTarget = async function(targetId) {
    const user = auth.currentUser; if (!user) { alert("Erro: Usuário não autenticado."); return; }
    const userId = user.uid;
    const targetIndex = prayerTargets.findIndex(t => t.id === targetId);
    if (targetIndex === -1) { alert("Erro: Alvo não encontrado na lista ativa."); return; }
    const targetData = prayerTargets[targetIndex];
    if (!confirm(`Arquivar o alvo "${targetData.title || targetId}"? Ele será movido para Arquivados.`)) return;
    const nowTimestamp = Timestamp.fromDate(new Date()); // Current date/time for archiving

    const activeTargetRef = doc(db, "users", userId, "prayerTargets", targetId);
    const archivedTargetRef = doc(db, "users", userId, "archivedTargets", targetId);
    try {
         // Prepare data for archiving, converting Dates to Timestamps
         const archivedData = {
            ...targetData,
             date: targetData.date instanceof Date ? Timestamp.fromDate(targetData.date) : targetData.date,
             deadlineDate: targetData.deadlineDate instanceof Date ? Timestamp.fromDate(targetData.deadlineDate) : targetData.deadlineDate,
             lastPrayedDate: targetData.lastPrayedDate instanceof Date ? Timestamp.fromDate(targetData.lastPrayedDate) : targetData.lastPrayedDate,
             observations: Array.isArray(targetData.observations) ? targetData.observations.map(obs => ({
                 ...obs,
                 date: obs.date instanceof Date ? Timestamp.fromDate(obs.date) : obs.date
                })) : [],
             resolved: false, // Not resolved, just archived
             archived: true, // Mark as archived
             archivedDate: nowTimestamp, // Set archive date
             // resolutionDate remains as it was (likely null)
         };
        delete archivedData.id; // Remove ID field
        delete archivedData.status; // Remove temp status

        // Use batch write for atomicity
        const batch = writeBatch(db);
        batch.delete(activeTargetRef);
        batch.set(archivedTargetRef, archivedData);
        await batch.commit();

        // Update local lists
        prayerTargets.splice(targetIndex, 1); // Remove from active
        const newArchivedLocal = rehydrateTargets([{ ...archivedData, id: targetId }])[0]; // Rehydrate
        archivedTargets.unshift(newArchivedLocal); // Add to archived
        // Re-sort archived list
        archivedTargets.sort((a, b) => (b.archivedDate instanceof Date ? b.archivedDate.getTime() : 0) - (a.archivedDate instanceof Date ? a.archivedDate.getTime() : 0));
        resolvedTargets = archivedTargets.filter(t => t.resolved); // Update resolved list (target not resolved, but order might change)

        // Re-render affected lists
        renderTargets();
        renderArchivedTargets();
        renderResolvedTargets();
        alert('Alvo arquivado com sucesso!');
    } catch (error) {
        console.error("Error archiving target: ", error);
        alert("Erro ao arquivar alvo: " + error.message);
    }
};

window.deleteArchivedTarget = async function(targetId) {
     const user = auth.currentUser; if (!user) { alert("Erro: Usuário não autenticado."); return; }
     const userId = user.uid;
     const targetTitle = archivedTargets.find(t => t.id === targetId)?.title || targetId; // Get title for confirmation
     if (!confirm(`Tem certeza que deseja excluir PERMANENTEMENTE o alvo arquivado "${targetTitle}"? Esta ação não pode ser desfeita.`)) return;
     const archivedTargetRef = doc(db, "users", userId, "archivedTargets", targetId);
     const clickCountsRef = doc(db, "prayerClickCounts", targetId); // Also delete click counts

     try {
         // Use batch to delete both documents atomically
         const batch = writeBatch(db);
         batch.delete(archivedTargetRef); // Delete target from archived
         batch.delete(clickCountsRef);    // Delete associated click count document
         await batch.commit();

         // Update local lists
         const targetIndex = archivedTargets.findIndex(t => t.id === targetId);
         if (targetIndex !== -1) archivedTargets.splice(targetIndex, 1); // Remove from local archived
         resolvedTargets = archivedTargets.filter(target => target.resolved); // Update resolved list
         // Re-sort resolved list (if deletion affected it, though unlikely)
         resolvedTargets.sort((a, b) => (b.resolutionDate instanceof Date ? b.resolutionDate.getTime() : 0) - (a.resolutionDate instanceof Date ? a.resolutionDate.getTime() : 0));

         // Re-render affected lists
         renderArchivedTargets();
         renderResolvedTargets();
         alert('Alvo excluído permanentemente!');
     } catch (error) {
         console.error("Error deleting archived target: ", error);
         alert("Erro ao excluir alvo arquivado: " + error.message);
     }
};


// --- Observations ---
window.toggleAddObservation = function(targetId) {
    const formDiv = document.getElementById(`observationForm-${targetId}`);
    if (!formDiv) return;
    const isVisible = formDiv.style.display === 'block';

    // Hide other open forms in the same target div (deadline, category)
    const targetElement = document.querySelector(`.target[data-target-id="${targetId}"]`);
    if (targetElement) {
        const otherForms = targetElement.querySelectorAll('.edit-deadline-form, .edit-category-form');
        otherForms.forEach(form => form.style.display = 'none');
    }

    // Show/hide observation form
    formDiv.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) {
        // When showing, focus the textarea and set default date
        formDiv.querySelector('textarea')?.focus();
        try {
            const dateInput = formDiv.querySelector(`#observationDate-${targetId}`);
            if (dateInput && !dateInput.value) dateInput.value = formatDateToISO(new Date());
        } catch (e) { console.warn("Could not set default observation date:", e); }
    }
};

// Renders the HTML structure for the observation form (initially hidden)
function renderObservationForm(targetId) {
    const formDiv = document.getElementById(`observationForm-${targetId}`);
    if (!formDiv) return;
    formDiv.innerHTML = `
        <textarea id="observationText-${targetId}" placeholder="Nova observação..." rows="3" style="width: 95%; margin-bottom: 5px;"></textarea>
        <input type="date" id="observationDate-${targetId}" style="width: 95%; margin-bottom: 5px;">
        <button class="btn" onclick="window.saveObservation('${targetId}')" style="background-color: #7cb17c;">Salvar Observação</button>
    `;
    // Set default date value when rendering the form structure
    try {
        const dateInput = formDiv.querySelector(`#observationDate-${targetId}`);
        if (dateInput) dateInput.value = formatDateToISO(new Date());
    }
    catch (e) { console.warn("Could not set default observation date on form render:", e); }
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

    // Find the target in either the active or archived list
    targetIndex = prayerTargets.findIndex(t => t.id === targetId);
    if (targetIndex !== -1) {
        targetRef = doc(db, "users", userId, "prayerTargets", targetId);
        targetList = prayerTargets;
    } else {
        targetIndex = archivedTargets.findIndex(t => t.id === targetId);
        if (targetIndex !== -1) {
            targetRef = doc(db, "users", userId, "archivedTargets", targetId);
            targetList = archivedTargets;
            isArchived = true;
            isResolved = archivedTargets[targetIndex].resolved; // Check if it's also in the resolved category
        } else {
            alert("Erro: Alvo não encontrado para adicionar observação.");
            return;
        }
    }

    const newObservation = {
        text: observationText,
        date: Timestamp.fromDate(observationDateUTC), // Save as Firestore Timestamp
        id: generateUniqueId(), // Generate unique ID for the observation
        targetId: targetId // Keep reference to parent target
    };

    try {
        // --- Update Firestore using Transaction for safety ---
        await runTransaction(db, async (transaction) => {
            const targetDocSnap = await transaction.get(targetRef);
            if (!targetDocSnap.exists()) {
                throw new Error("Target document does not exist in Firestore.");
            }
            const currentData = targetDocSnap.data();
            const currentObservations = currentData.observations || []; // Get existing or empty array
            currentObservations.push(newObservation); // Add the new observation

            // Sort observations in the array by date (most recent first) before updating
            currentObservations.sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));

            // Update the document within the transaction
            transaction.update(targetRef, { observations: currentObservations });
        });

        // --- Update Local Data ---
        const currentTargetLocal = targetList[targetIndex];
        if (!Array.isArray(currentTargetLocal.observations)) currentTargetLocal.observations = [];
        // Add the new rehydrated observation (with Date object) to local list
        currentTargetLocal.observations.push({ ...newObservation, date: newObservation.date.toDate() });
        // Sort locally as well
        currentTargetLocal.observations.sort((a, b) => (b.date instanceof Date ? b.date.getTime() : 0) - (a.date instanceof Date ? a.date.getTime() : 0));

        // --- Re-render Appropriate Lists ---
        if (isArchived) {
            renderArchivedTargets(); // Re-render archived panel
            if (isResolved) {
                renderResolvedTargets(); // Re-render resolved panel if target was resolved
            }
        } else {
            renderTargets(); // Re-render active panel
             // If the target was in the daily list, refresh the daily list UI
            if (document.getElementById('dailyTargets').querySelector(`.target[data-target-id="${targetId}"]`)) {
                 await loadDailyTargets();
             }
        }

        // --- UI Cleanup ---
        toggleAddObservation(targetId); // Hide the form
        document.getElementById(`observationText-${targetId}`).value = ''; // Clear text field
        // Reset date field to today
        try { document.getElementById(`observationDate-${targetId}`).value = formatDateToISO(new Date()); } catch (e) { /* ignore */ }

    } catch (error) {
        console.error("Error saving observation:", error);
        alert("Erro ao salvar observação: " + error.message);
    }
};

// *** MODIFIED renderObservations function ***
// Renders the HTML for observations, adding data-target-id to the toggle link
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
        // Basic HTML escaping for display
        const escapedText = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        observationsHTML += `<p class="observation-item"><strong>${formattedDate}:</strong> ${escapedText}</p>`;
    });

    // Add link to see more/less if there's more than 1 observation
    if (targetId && observations.length > 1) {
        if (!isExpanded && remainingCount > 0) {
            // Add data-target-id, remove inline onclick
            observationsHTML += `<a href="#" class="observations-toggle" data-target-id="${targetId}">Ver mais ${remainingCount} observaç${remainingCount > 1 ? 'ões' : 'ão'}</a>`;
        } else if (isExpanded) {
            // Add data-target-id, remove inline onclick
            observationsHTML += `<a href="#" class="observations-toggle" data-target-id="${targetId}">Ver menos observações</a>`;
        }
    }
    observationsHTML += `</div>`;
    return observationsHTML;
}

// *** NEW Function to handle clicks delegated from parent lists ***
function handleObservationToggleClick(event) {
    const toggleLink = event.target.closest('.observations-toggle'); // Find the link clicked or its ancestor

    if (toggleLink) {
        event.preventDefault(); // Prevent default link behavior (e.g., scrolling to top)
        const targetId = toggleLink.dataset.targetId;

        if (!targetId) {
            console.error('Toggle link clicked but missing data-target-id:', toggleLink);
            return;
        }

        // Find the container relative to the clicked link
        const observationsContainer = toggleLink.closest('.observations');
        if (!observationsContainer) {
            console.error('Could not find observations container for toggle link:', toggleLink);
            return;
        }

        // Determine current state based on link text
        const isCurrentlyExpanded = toggleLink.textContent.includes('Ver menos');
        console.log(`Handling toggle for ${targetId}. Currently expanded: ${isCurrentlyExpanded}`);

        // Find target data (active or archived)
        const target = prayerTargets.find(t => t.id === targetId) || archivedTargets.find(t => t.id === targetId);

        if (target) {
            try {
                // Render the observations section with the *opposite* expansion state
                const newObservationsHTML = renderObservations(target.observations || [], !isCurrentlyExpanded, targetId);

                // Replace the existing observations container with the new HTML
                // Using outerHTML replaces the container itself.
                observationsContainer.outerHTML = newObservationsHTML;
                console.log(`Observations updated for ${targetId}. New expanded state: ${!isCurrentlyExpanded}`);

            } catch (error) {
                console.error(`Error rendering/replacing observations for ${targetId}:`, error);
                alert("Ocorreu um erro ao tentar mostrar/ocultar as observações.");
            }
        } else {
            console.error('Target data not found for toggle:', targetId);
            // Optionally alert the user or just log
            // alert("Erro: Não foi possível encontrar os dados do alvo para exibir as observações.");
        }
    }
}

// --- Deadlines ---
document.getElementById('hasDeadline').addEventListener('change', function() {
    document.getElementById('deadlineContainer').style.display = this.checked ? 'block' : 'none';
    if (!this.checked) document.getElementById('deadlineDate').value = ''; // Clear date if unchecked
});

function handleDeadlineFilterChange() { showDeadlineOnly = document.getElementById('showDeadlineOnly').checked; currentPage = 1; renderTargets(); }
function handleExpiredOnlyMainChange() { currentPage = 1; renderTargets(); }

function checkExpiredDeadlines() {
    const now = new Date();
    const todayUTCStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const expiredCount = prayerTargets.filter(target => target.hasDeadline && target.deadlineDate instanceof Date && !isNaN(target.deadlineDate) && target.deadlineDate.getTime() < todayUTCStart.getTime()).length;
    console.log(`[checkExpiredDeadlines] Found ${expiredCount} expired deadlines among active targets.`);
    // Update UI badge if element exists
    const badge = document.getElementById('expiredCountBadge'); // Assume badge element exists
    if (badge) {
        badge.textContent = expiredCount > 0 ? expiredCount : '';
        badge.style.display = expiredCount > 0 ? 'inline' : 'none';
    }
}

window.editDeadline = function(targetId) {
    const target = prayerTargets.find(t => t.id === targetId); if (!target) { alert("Erro: Alvo não encontrado ou não é ativo."); return; }
    const targetDiv = document.querySelector(`.target[data-target-id="${targetId}"]`); if (!targetDiv) return;
    const editFormContainer = document.getElementById(`editDeadlineForm-${targetId}`); if (!editFormContainer) return;
    const isVisible = editFormContainer.style.display === 'block';

    // Hide other open forms in the same target div
    const otherForms = targetDiv.querySelectorAll('.add-observation-form, .edit-category-form');
    otherForms.forEach(form => form.style.display = 'none');

    // Show/hide deadline form
    if (isVisible) { editFormContainer.style.display = 'none'; return; }

    // Get current deadline as ISO string for the input value
    let currentDeadlineISO = '';
    if (target.deadlineDate instanceof Date && !isNaN(target.deadlineDate)) {
        currentDeadlineISO = formatDateToISO(target.deadlineDate);
    }

    editFormContainer.innerHTML = `
        <div style="background-color: #f0f0f0; padding: 10px; margin-top: 10px; border-radius: 5px; border: 1px solid #ccc;">
            <label for="editDeadlineInput-${targetId}" style="margin-right: 5px; display: block; margin-bottom: 5px;">Novo Prazo (deixe em branco para remover):</label>
            <input type="date" id="editDeadlineInput-${targetId}" value="${currentDeadlineISO}" style="margin-right: 5px; width: calc(100% - 22px);">
            <div style="margin-top: 10px; text-align: right;">
                 <button class="btn save-deadline-btn" onclick="window.saveEditedDeadline('${targetId}')">Salvar Prazo</button>
                 <button class="btn cancel-deadline-btn" onclick="window.cancelEditDeadline('${targetId}')">Cancelar</button>
            </div>
        </div>`;
    editFormContainer.style.display = 'block';
    document.getElementById(`editDeadlineInput-${targetId}`)?.focus();
};

window.saveEditedDeadline = async function(targetId) {
    const newDeadlineDateInput = document.getElementById(`editDeadlineInput-${targetId}`); if (!newDeadlineDateInput) return;
    const newDeadlineValue = newDeadlineDateInput.value;
    let newDeadlineTimestamp = null; let newHasDeadline = false;

    if (newDeadlineValue) { // If a date was selected
        const newDeadlineUTC = createUTCDate(newDeadlineValue);
        if (!newDeadlineUTC) { alert("Data do prazo inválida."); return; }
        const target = prayerTargets.find(t => t.id === targetId);
         // Validation: Deadline cannot be before creation date
         if (target && target.date instanceof Date && newDeadlineUTC.getTime() < target.date.getTime()) {
            alert("O Prazo de Validade não pode ser anterior à Data de Criação."); return;
         }
        newDeadlineTimestamp = Timestamp.fromDate(newDeadlineUTC); // Convert to Timestamp
        newHasDeadline = true;
    } else {
        // If date input is empty, confirm removal
        if (!confirm("Nenhuma data selecionada. Tem certeza que deseja remover o prazo?")) return;
        newDeadlineTimestamp = null; // Set to null
        newHasDeadline = false;
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
             prayerTargets[targetIndex].deadlineDate = newDeadlineTimestamp ? newDeadlineTimestamp.toDate() : null; // Convert back to Date or null locally
             prayerTargets[targetIndex].hasDeadline = newHasDeadline;
             console.log(`Local deadline updated for ${targetId}`);
         }

         renderTargets(); // Re-render main list to show changes
         checkExpiredDeadlines(); // Update expired count/badge
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

    // Hide other open edit forms in the same target div
    const otherForms = targetDiv.querySelectorAll('.add-observation-form, .edit-deadline-form');
    otherForms.forEach(form => form.style.display = 'none');

    // Show/hide category form
    if (isVisible) {
        editFormContainer.style.display = 'none'; // Hide if already visible
        return;
    }

    // Create select options dynamically using the updated predefinedCategories
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
                 <button class="btn save-category-btn" onclick="window.saveEditedCategory('${targetId}')">Salvar Categoria</button>
                 <button class="btn cancel-category-btn" onclick="window.cancelEditCategory('${targetId}')">Cancelar</button>
            </div>
        </div>`;
    editFormContainer.style.display = 'block';
    document.getElementById(`editCategorySelect-${targetId}`)?.focus();
};

window.saveEditedCategory = async function(targetId) {
    const newCategorySelect = document.getElementById(`editCategorySelect-${targetId}`);
    if (!newCategorySelect) return;
    const newCategoryValue = newCategorySelect.value; // Can be "" (empty string) to remove

    const user = auth.currentUser;
    if (!user) { alert("Erro: Usuário não autenticado."); return; }
    const userId = user.uid;

    let targetRef;
    let targetList;
    let targetIndex = -1;
    let isArchived = false;
    let isResolved = false;

    // Find target reference and local list
    targetIndex = prayerTargets.findIndex(t => t.id === targetId);
    if (targetIndex !== -1) {
        targetRef = doc(db, "users", userId, "prayerTargets", targetId);
        targetList = prayerTargets;
    } else {
        targetIndex = archivedTargets.findIndex(t => t.id === targetId);
        if (targetIndex !== -1) {
            targetRef = doc(db, "users", userId, "archivedTargets", targetId);
            targetList = archivedTargets;
            isArchived = true;
            isResolved = archivedTargets[targetIndex].resolved;
        } else {
            alert("Erro: Alvo não encontrado para atualização.");
            return;
        }
    }

    try {
        // Update Firestore
        await updateDoc(targetRef, {
            category: newCategoryValue || null // Save null if "" is selected
        });

        // Update local object
        targetList[targetIndex].category = newCategoryValue || null;

        // Re-render appropriate list(s)
        if (isArchived) {
            renderArchivedTargets(); // Render archived list
            if (isResolved) {
                renderResolvedTargets(); // Re-render resolved too if target was there
            }
        } else {
            renderTargets(); // Render active list
             // If edited target was in daily list, refresh daily list UI
             if (document.getElementById('dailyTargets').querySelector(`.target[data-target-id="${targetId}"]`)) {
                 console.log("Target category changed, refreshing daily targets UI.");
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
    if (!userId) {
        document.getElementById("dailyTargets").innerHTML = "<p>Faça login para ver os alvos diários.</p>";
        currentDailyTargets = []; // Ensure local list is empty
        return;
    }
    const today = new Date();
    const todayStr = formatDateToISO(today);
    const dailyDocId = `${userId}_${todayStr}`;
    const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);
    const dailyTargetsDiv = document.getElementById("dailyTargets");
    dailyTargetsDiv.innerHTML = '<p>Carregando alvos do dia...</p>'; // Initial feedback
    currentDailyTargets = []; // Reset local list before loading/generating

    try {
        let dailyTargetsData;
        const dailySnapshot = await getDoc(dailyRef);

        // Check if daily doc exists and has a valid 'targets' array
        if (!dailySnapshot.exists() || !dailySnapshot.data() || !Array.isArray(dailySnapshot.data().targets)) {
            console.log(`[loadDailyTargets] Daily document for ${dailyDocId} not found or invalid, generating.`);
            dailyTargetsData = await generateDailyTargets(userId, todayStr);
            // Only save if generation was successful and returned data
            if (dailyTargetsData) {
                await setDoc(dailyRef, dailyTargetsData); // Save the newly generated document
                console.log(`[loadDailyTargets] Daily document ${dailyDocId} created.`);
            } else {
                console.error("[loadDailyTargets] Failed to generate daily targets data.");
                dailyTargetsDiv.innerHTML = "<p>Erro ao gerar lista de alvos diários.</p>";
                displayRandomVerse();
                return;
            }
        } else {
            dailyTargetsData = dailySnapshot.data();
            console.log(`[loadDailyTargets] Daily document ${dailyDocId} loaded.`);
        }

        // Ensure data structure is valid after load/generate
        if (!dailyTargetsData || !Array.isArray(dailyTargetsData.targets)) {
            console.error("[loadDailyTargets] Invalid daily data structure after load/generate:", dailyTargetsData);
            dailyTargetsDiv.innerHTML = "<p>Erro ao carregar alvos diários (dados inválidos).</p>";
            displayRandomVerse();
            currentDailyTargets = []; // Ensure it's empty on error
            return;
        }

        // Populate currentDailyTargets with IDs from the loaded/generated list
        currentDailyTargets = dailyTargetsData.targets.map(t => t?.targetId).filter(id => id); // Filter out any null/undefined IDs
        console.log(`[loadDailyTargets] Current daily target IDs:`, currentDailyTargets);

        // Separate targets into pending and completed based on the daily document
        const pendingTargetEntries = dailyTargetsData.targets.filter(t => t && t.targetId && !t.completed);
        const completedTargetEntries = dailyTargetsData.targets.filter(t => t && t.targetId && t.completed);

        const pendingTargetIds = pendingTargetEntries.map(t => t.targetId);
        const completedTargetIds = completedTargetEntries.map(t => t.targetId);

        console.log(`[loadDailyTargets] Pending IDs: ${pendingTargetIds.length}, Completed IDs: ${completedTargetIds.length}`);

        const allTargetIds = [...pendingTargetIds, ...completedTargetIds];
        if (allTargetIds.length === 0) {
            dailyTargetsDiv.innerHTML = "<p>Nenhum alvo de oração selecionado para hoje.</p>";
            displayRandomVerse();
            return; // currentDailyTargets is already empty
        }

        // Fetch details ONLY for active targets that are in the daily list
        // It's important to use the main `prayerTargets` list which contains full details
        const targetsToDisplayDetails = prayerTargets.filter(pt => pt && pt.id && allTargetIds.includes(pt.id));

        // Separate full details into pending and completed based on IDs
        const pendingTargetsDetails = targetsToDisplayDetails.filter(t => pendingTargetIds.includes(t.id));
        const completedTargetsDetails = targetsToDisplayDetails.filter(t => completedTargetIds.includes(t.id));

        console.log(`[loadDailyTargets] Pending Details Found: ${pendingTargetsDetails.length}, Completed Details Found: ${completedTargetsDetails.length}`);

        // Render the daily targets UI
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
        // Ensure active targets are loaded and valid before proceeding
        if (!Array.isArray(prayerTargets)) {
            console.error("[generateDailyTargets] Active prayer targets list is not available or invalid.");
            return null; // Indicate failure
        }
        // Consider only valid, non-archived, non-resolved active targets
        const availableTargets = prayerTargets.filter(t => t && t.id && !t.archived && !t.resolved);
        if (availableTargets.length === 0) {
            console.log("[generateDailyTargets] No active targets available.");
            return { userId, date: dateStr, targets: [] }; // Return empty list
        }

        const todayUTC = createUTCDate(dateStr);
        if (!todayUTC) {
            console.error("[generateDailyTargets] Invalid dateStr provided:", dateStr);
            return null; // Indicate failure
        }

        // --- Selection Logic (Cycle and Exclusion based on Completion) ---
        let pool = [...availableTargets]; // Start with all active targets

        // Fetch completion data from last N days to avoid selecting recently *completed* targets
        const historyDays = 7; // How many days back to check for completions
        const completedInHistory = new Set();
        for (let i = 1; i <= historyDays; i++) {
            const pastDate = new Date(todayUTC.getTime() - i * 86400000); // Calculate past date
            const pastDateStr = formatDateToISO(pastDate);
            const pastDocId = `${userId}_${pastDateStr}`;
            try {
                const pastSnap = await getDoc(doc(db, "dailyPrayerTargets", pastDocId));
                if (pastSnap.exists()) {
                    const pastData = pastSnap.data();
                    if (pastData?.targets && Array.isArray(pastData.targets)) {
                        pastData.targets.forEach(t => {
                            // Add target ID to the Set ONLY if it was marked as completed
                            if (t && t.targetId && t.completed === true) {
                                completedInHistory.add(t.targetId);
                            }
                        });
                    }
                }
            } catch (err) {
                // Log warning but continue if history fetching fails for a day
                console.warn(`[generateDailyTargets] Error fetching history for ${pastDateStr}:`, err);
            }
        }
        console.log(`[generateDailyTargets] Targets COMPLETED in the last ${historyDays} days:`, completedInHistory.size);

        // Filter initial pool to remove targets that were COMPLETED recently
        pool = pool.filter(target => !completedInHistory.has(target.id));
        console.log(`[generateDailyTargets] Pool size after filtering recent completions: ${pool.length}`);

        // If the pool becomes empty after filtering completions, reset it with ALL available active targets
        // This ensures that eventually all targets get cycled through again
        if (pool.length === 0 && availableTargets.length > 0) {
            console.log("[generateDailyTargets] Pool empty after completion filter, resetting pool to all available targets.");
            pool = [...availableTargets];
            // Prioritize targets prayed for longest ago (oldest lastPrayedDate first)
             pool.sort((a, b) => {
                 const dateA = a.lastPrayedDate instanceof Date ? a.lastPrayedDate.getTime() : 0; // Treat null/undefined as very old (0)
                 const dateB = b.lastPrayedDate instanceof Date ? b.lastPrayedDate.getTime() : 0;
                 return dateA - dateB; // Sorts ascending (oldest first)
             });
        } else if (pool.length > 0) {
             // If pool is not empty, sort the remaining candidates by lastPrayedDate (oldest first)
             pool.sort((a, b) => {
                 const dateA = a.lastPrayedDate instanceof Date ? a.lastPrayedDate.getTime() : 0;
                 const dateB = b.lastPrayedDate instanceof Date ? b.lastPrayedDate.getTime() : 0;
                 return dateA - dateB; // Sorts ascending (oldest first)
             });
         }

        // Select up to the maximum number of daily targets
        const maxDailyTargets = 10;
        const selectedTargets = pool.slice(0, Math.min(maxDailyTargets, pool.length));

        // Prepare the list for Firestore (only IDs and completion status)
        const targetsForFirestore = selectedTargets.map(target => ({
            targetId: target.id,
            completed: false // Initially not completed
        }));

        // Note: Updating lastPrayedDate is now handled ONLY when "Orei!" is clicked.

        console.log(`[generateDailyTargets] Generated ${targetsForFirestore.length} targets for ${dateStr}.`);
        return { userId: userId, date: dateStr, targets: targetsForFirestore }; // Return the structure for Firestore

    } catch (error) {
        console.error("[generateDailyTargets] Unexpected Error during generation:", error);
        return null; // Indicate failure
    }
}


// Renders the Daily Targets section UI based on pending and completed lists
function renderDailyTargets(pendingTargets, completedTargets) {
    const dailyTargetsDiv = document.getElementById("dailyTargets");
    dailyTargetsDiv.innerHTML = ''; // Clear before rendering

    if (pendingTargets.length === 0 && completedTargets.length === 0) {
        dailyTargetsDiv.innerHTML = "<p>Nenhum alvo de oração selecionado para hoje.</p>";
        return;
    }

    // --- Render Pending Targets ---
    if (pendingTargets.length > 0) {
        pendingTargets.forEach((target) => {
            if (!target || !target.id) return; // Skip invalid data
            const dailyDiv = createTargetElement(target, false); // false = not completed
            addPrayButtonFunctionality(dailyDiv, target.id); // Add "Orei!" button logic
            dailyTargetsDiv.appendChild(dailyDiv);
        });
    } else if (completedTargets.length > 0) {
        // Message if no pending targets but there are completed ones
        dailyTargetsDiv.innerHTML = "<p>Você já orou por todos os alvos de hoje!</p>";
    }

    // --- Render Completed Targets ---
    if (completedTargets.length > 0) {
        // Add separator if needed (if there were pending targets or the "all done" message)
        if (pendingTargets.length > 0 || dailyTargetsDiv.innerHTML.includes("todos os alvos de hoje")) {
             const separator = document.createElement('hr');
             separator.style.cssText = 'border: none; border-top: 1px solid #eee; margin-top:20px; margin-bottom:15px;';
             dailyTargetsDiv.appendChild(separator);
         }
         // Title for completed section
         const completedTitle = document.createElement('h3');
         completedTitle.textContent = "Concluídos Hoje";
         completedTitle.style.cssText = 'color:#777; font-size:1.1em; margin-top:15px; margin-bottom:10px; text-align: center;'; // Centered title
         dailyTargetsDiv.appendChild(completedTitle);

        // Render completed items
        completedTargets.forEach((target) => {
             if (!target || !target.id) return; // Skip invalid data
            const dailyDiv = createTargetElement(target, true); // true = completed
            dailyTargetsDiv.appendChild(dailyDiv);
        });
    }

    // Show completion popup if all targets for the day are completed
    if (pendingTargets.length === 0 && completedTargets.length > 0) {
        displayCompletionPopup();
    }
}

// Creates the HTML div element for a single target in the daily list
function createTargetElement(target, isCompleted) {
    const dailyDiv = document.createElement("div");
    dailyDiv.classList.add("target"); // Base class
    if (isCompleted) dailyDiv.classList.add("completed-target"); // Add class if completed
    dailyDiv.dataset.targetId = target.id; // Store ID

    // Create category tag (if exists)
    let categoryTag = '';
    if (target.category) {
        categoryTag = `<span class="category-tag">${target.category}</span>`;
    }

    // Create deadline tag (if exists)
    let deadlineTag = '';
    if (target.hasDeadline && target.deadlineDate) {
        const deadlineDisplay = formatDateForDisplay(target.deadlineDate);
        // Apply specific classes for styling based on state
        const expiredClass = isDateExpired(target.deadlineDate) ? 'expired' : '';
        const completedClass = isCompleted ? 'completed' : '';
        deadlineTag = `<span class="deadline-tag ${expiredClass} ${completedClass}">Prazo: ${deadlineDisplay}</span>`;
    }

    // Render observations (show only most recent by default, allow toggle)
    // Pass targetId to renderObservations so it can create the toggle link correctly
    const observationsHTML = renderObservations(target.observations || [], false, target.id);

    // Build inner HTML
    dailyDiv.innerHTML = `
        <h3>${categoryTag} ${deadlineTag} ${target.title || 'Título Indisponível'}</h3>
        <p>${target.details || 'Detalhes Indisponíveis'}</p>
        <p><strong>Data Criação:</strong> ${formatDateForDisplay(target.date)}</p>
        <p><strong>Tempo Decorrido:</strong> ${timeElapsed(target.date)}</p>
        ${observationsHTML}`; // Include observations HTML (which might contain the toggle link)
    return dailyDiv;
}

// Adds the "Orei!" button and its click functionality to a daily target div
function addPrayButtonFunctionality(dailyDiv, targetId) {
    const prayButton = document.createElement("button");
    prayButton.textContent = "Orei!";
    prayButton.classList.add("pray-button", "btn");
    prayButton.dataset.targetId = targetId; // Store ID on button for click handler

    prayButton.onclick = async () => {
        const user = auth.currentUser; if (!user) { alert("Erro: Usuário não autenticado."); return; }
        const userId = user.uid; const todayStr = formatDateToISO(new Date()); const dailyDocId = `${userId}_${todayStr}`;
        const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);

        // Disable button immediately to prevent double clicks
        prayButton.disabled = true;
        prayButton.textContent = "Orado!";
        prayButton.style.opacity = 0.6; // Visual feedback

        try {
            // --- Read current daily document ---
            // We need the latest list to update the 'completed' status correctly
            const dailySnap = await getDoc(dailyRef);
            if (!dailySnap.exists()) {
                console.error("Daily doc not found during 'Orei!' click:", dailyDocId);
                alert("Erro: Documento diário não encontrado. Tente recarregar.");
                // Re-enable button on read error
                prayButton.disabled = false; prayButton.textContent = "Orei!"; prayButton.style.opacity = 1;
                return;
            }

            const dailyData = dailySnap.data();
            let targetUpdatedInDaily = false;
            let updatedTargetsArray = []; // This will hold the modified array for Firestore update

            // Ensure the targets array exists before mapping
            if (dailyData?.targets && Array.isArray(dailyData.targets)) {
                 // Map targets, marking the clicked one as completed: true
                 updatedTargetsArray = dailyData.targets.map(t => {
                    if (t && t.targetId === targetId) {
                        targetUpdatedInDaily = true;
                        return { ...t, completed: true }; // Mark as completed
                    }
                    return t; // Return unmodified entry
                });
            } else {
                console.warn(`Invalid or missing targets array in daily doc ${dailyDocId} during 'Orei!' click.`);
                // Proceed to register click stats etc., but log the warning
                updatedTargetsArray = []; // Set to empty to avoid errors later
            }


            if (!targetUpdatedInDaily) {
                console.warn(`Target ${targetId} not found in daily doc ${dailyDocId} during 'Orei!' click. Still registering click.`);
                // Even if not found (could be an error or manually added/removed), proceed to register the click stats etc.
            }

             // --- Update Firestore using the centralized function ---
             // This function now handles: click counts, weekly chart, perseverance bar, AND lastPrayedDate
             await updateClickCountsAndRelatedData(userId, targetId, targetUpdatedInDaily, updatedTargetsArray, dailyRef);

            // --- Update UI ---
            // Reload and re-render the entire daily list to reflect the change accurately
            // This ensures the target moves to the 'Completed' section.
            await loadDailyTargets();

        } catch (error) {
            console.error("Error registering 'Orei!':", error);
            alert("Erro ao registrar oração: " + error.message);
            // Re-enable button on write/processing error to allow retry
            prayButton.disabled = false; prayButton.textContent = "Orei!"; prayButton.style.opacity = 1;
        }
    };

     // --- Add button to the target div ---
     // Try to insert it nicely after the H3 heading
     const heading = dailyDiv.querySelector('h3');
     if (heading && heading.nextSibling) {
         dailyDiv.insertBefore(prayButton, heading.nextSibling); // Insert after h3 if something follows it
     } else if (heading) {
         dailyDiv.appendChild(prayButton); // Append after h3 if it's the last element
     } else if (dailyDiv.firstChild) {
          dailyDiv.insertBefore(prayButton, dailyDiv.firstChild); // If no h3, insert at the very beginning
     } else {
         dailyDiv.appendChild(prayButton); // If div is somehow empty, just append
     }
}


// Centralized function to update data after an "Orei!" click using a WriteBatch
async function updateClickCountsAndRelatedData(userId, targetId, targetUpdatedInDaily, updatedDailyTargetsArray, dailyRef) {
     // --- References ---
     const clickCountsRef = doc(db, "prayerClickCounts", targetId);
     const weeklyDocRef = doc(db, "weeklyInteractions", userId);
     const perseveranceDocRef = doc(db, "perseveranceData", userId);
     const activeTargetRef = doc(db, "users", userId, "prayerTargets", targetId); // Ref to update lastPrayedDate

     const now = new Date();
     const nowTimestamp = Timestamp.fromDate(now); // Timestamp for Firestore

     // --- Time Data ---
     const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM
     const year = now.getFullYear().toString(); // YYYY
     const todayUTCStr = formatDateToISO(now); // YYYY-MM-DD (UTC based)
     const weekId = getWeekIdentifier(now); // YYYY-W## (UTC based)
     const todayUTCStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())); // Start of current UTC day

     // --- Flags and Data for Batch ---
     const batch = writeBatch(db);
     let needsPerseveranceUpdate = false;
     let dataToSaveForPerseverance = {};
     let weeklyDataNeedsUpdate = false;

     // --- PERSEVERANCE BAR Update Logic ---
     // Determines if the bar needs updating based on the last interaction date
     let lastInteractionUTCStart = null;
     if (perseveranceData.lastInteractionDate instanceof Date && !isNaN(perseveranceData.lastInteractionDate)) {
         const li = perseveranceData.lastInteractionDate;
         // Get start of the UTC day for the last interaction
         lastInteractionUTCStart = new Date(Date.UTC(li.getUTCFullYear(), li.getUTCMonth(), li.getUTCDate()));
     }
     // Update if it's the first interaction ever, or the first interaction for *today*
     if (!lastInteractionUTCStart || todayUTCStart.getTime() > lastInteractionUTCStart.getTime()) {
         needsPerseveranceUpdate = true;
         console.log(`[updateClickCounts] First 'Orei!' interaction detected for ${todayUTCStr}. Updating perseverance.`);
         let isConsecutive = false;
         if (lastInteractionUTCStart) {
             // Check if the last interaction was exactly yesterday
             const expectedYesterdayUTCStart = new Date(todayUTCStart.getTime() - 86400000); // 24 hours in milliseconds
             if (lastInteractionUTCStart.getTime() === expectedYesterdayUTCStart.getTime()) {
                 isConsecutive = true;
             }
         }
         // Calculate new consecutive days count
         const newConsecutiveDays = isConsecutive ? (perseveranceData.consecutiveDays || 0) + 1 : 1;
         // Update record if necessary
         const newRecordDays = Math.max(perseveranceData.recordDays || 0, newConsecutiveDays);

         // Update local data IMMEDIATELY for UI responsiveness
         perseveranceData.consecutiveDays = newConsecutiveDays;
         perseveranceData.lastInteractionDate = todayUTCStart; // Store the start of the day
         perseveranceData.recordDays = newRecordDays;

         // Prepare data structure for Firestore batch update
         dataToSaveForPerseverance = {
             consecutiveDays: newConsecutiveDays,
             lastInteractionDate: Timestamp.fromDate(todayUTCStart), // Store Timestamp in Firestore
             recordDays: newRecordDays
         };
         // Add perseverance update to the batch
         batch.set(perseveranceDocRef, { userId: userId, ...dataToSaveForPerseverance }, { merge: true }); // Merge ensures userId isn't overwritten if doc exists
         // Update bar UI IMMEDIATELY based on updated local data
         updatePerseveranceUI();
     } else {
         console.log(`[updateClickCounts] Subsequent 'Orei!' click for ${todayUTCStr}. Bar unchanged.`);
     }

     // --- WEEKLY CHART Update Logic ---
     // Determines if the weekly interaction data needs updating
     weeklyPrayerData.interactions = weeklyPrayerData.interactions || {}; // Ensure interactions map exists
     if (weeklyPrayerData.weekId !== weekId) { // Week has changed since last load/update
         console.log(`[updateClickCounts] Week changed from ${weeklyPrayerData.weekId} to ${weekId}. Resetting weekly data.`);
         weeklyPrayerData.weekId = weekId; // Update local week ID
         weeklyPrayerData.interactions = {}; // Reset interactions for the new week
         weeklyPrayerData.interactions[todayUTCStr] = true; // Mark today as interacted in the new week
         weeklyDataNeedsUpdate = true; // Flag for batch update
     } else if (weeklyPrayerData.interactions[todayUTCStr] !== true) { // Same week, but first interaction recorded for *today*
         weeklyPrayerData.interactions[todayUTCStr] = true; // Mark today as interacted locally
         weeklyDataNeedsUpdate = true; // Flag for batch update
         console.log(`[updateClickCounts] Marked ${todayUTCStr} as interacted for week ${weekId}.`);
     }
     // If weekly data changed locally, add the update to the batch
     if (weeklyDataNeedsUpdate) {
         batch.set(weeklyDocRef, {
             userId: userId,
             weekId: weeklyPrayerData.weekId,
             interactions: weeklyPrayerData.interactions
            }, { merge: false }); // Overwrite the document for the week (or create if new)
     }
     // Update chart UI (always, based on potentially updated local data)
     updateWeeklyChart();


     // --- Add Other Updates to Batch ---

     // 1. Click Counts (always increment using Firestore's increment)
     batch.set(clickCountsRef, {
         targetId: targetId,
         userId: userId,
         totalClicks: increment(1),
         [`monthlyClicks.${yearMonth}`]: increment(1), // Dynamic key for month
         [`yearlyClicks.${year}`]: increment(1)      // Dynamic key for year
        }, { merge: true }); // Merge to ensure fields are added/updated without overwriting others

     // 2. Update lastPrayedDate on the ACTIVE target document in Firestore
     batch.update(activeTargetRef, { lastPrayedDate: nowTimestamp });

     // 3. Update Daily Document (only if the target was found and needs marking as complete)
     if (targetUpdatedInDaily) {
         batch.update(dailyRef, { targets: updatedDailyTargetsArray });
     }

     // (Weekly and Perseverance updates were already added to batch if needed)

     // --- Commit the Batch Write ---
     try {
         await batch.commit();
         console.log(`[updateClickCounts] Batch committed successfully for target ${targetId}.`);

         // --- Update Local lastPrayedDate AFTER successful commit ---
         const targetIndexLocal = prayerTargets.findIndex(t => t.id === targetId);
         if (targetIndexLocal !== -1) {
             prayerTargets[targetIndexLocal].lastPrayedDate = now; // 'now' is already a Date object
             console.log(`[updateClickCounts] Local lastPrayedDate updated for ${targetId}`);
         } else {
             // This might happen if the target was archived/deleted between loading and clicking "Orei!"
             console.warn(`[updateClickCounts] Target ${targetId} not found in local prayerTargets array after batch commit. Cannot update local lastPrayedDate.`);
         }

     } catch (error) {
         console.error(`[updateClickCounts] Error committing batch for target ${targetId}:`, error);
         // Note: UI updates for bar/chart happened *before* commit attempt based on local data.
         // The calling function (addPrayButtonFunctionality) should handle the error (e.g., re-enable button).
         throw error; // Propagate error up
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
            // Optionally, save initial data to Firestore here if desired
            // await setDoc(perseveranceDocRef, { userId: userId, consecutiveDays: 0, recordDays: 0, lastInteractionDate: null });
        }
        updatePerseveranceUI(); // Update bar UI with loaded/initialized data
        await loadWeeklyPrayerData(userId); // Load chart data next

    } catch (error) {
        console.error("[loadPerseveranceData] Error loading progress bar data:", error);
         perseveranceData = { consecutiveDays: 0, lastInteractionDate: null, recordDays: 0 }; // Reset locally on error
         updatePerseveranceUI(); // Update UI with reset data
         // Try loading weekly data anyway, handling its potential error separately
         try { await loadWeeklyPrayerData(userId); }
         catch (weeklyError) {
            console.error("[loadPerseveranceData] Error loading weekly data after bar error:", weeklyError);
             weeklyPrayerData = { weekId: getWeekIdentifier(new Date()), interactions: {} }; // Reset weekly locally
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
                    // Ensure interactions is an object, even if stored incorrectly (fallback to empty map)
                    interactions: (typeof loadedData.interactions === 'object' && loadedData.interactions !== null) ? loadedData.interactions : {}
                };
                console.log("[loadWeeklyPrayerData] Weekly chart data loaded for current week:", weeklyPrayerData);
            } else {
                // If week changed, reset local data and save new week's data to Firestore
                console.log(`[loadWeeklyPrayerData] Week changed from ${loadedData.weekId} to ${currentWeekId}. Resetting weekly data.`);
                weeklyPrayerData = { weekId: currentWeekId, interactions: {} }; // Reset locally
                // Overwrite Firestore document with new week's data (no interactions yet)
                await setDoc(weeklyDocRef, { userId: userId, weekId: currentWeekId, interactions: {} }, { merge: false });
                console.log(`[loadWeeklyPrayerData] Reset weekly data saved for new week.`);
            }
        } else {
            // If document doesn't exist, initialize locally and save to Firestore
            console.log(`[loadWeeklyPrayerData] No weekly data found. Initializing for ${currentWeekId}.`);
            weeklyPrayerData = { weekId: currentWeekId, interactions: {} };
            await setDoc(weeklyDocRef, { userId: userId, weekId: currentWeekId, interactions: {} }); // Create document
            console.log(`[loadWeeklyPrayerData] Initial weekly data saved.`);
        }
        updateWeeklyChart(); // Update chart UI with correct data

    } catch (error) {
        console.error("[loadWeeklyPrayerData] Error loading/initializing weekly chart data:", error);
         // On error, initialize locally with current week as a fallback
         weeklyPrayerData = { weekId: getWeekIdentifier(new Date()), interactions: {} };
         resetWeeklyChart(); // Reset UI visually to reflect no data
    }
}


// Updates ONLY the progress BAR UI based on current `perseveranceData`
function updatePerseveranceUI() {
     const consecutiveDays = perseveranceData.consecutiveDays || 0;
     const recordDays = perseveranceData.recordDays || 0;
     const targetDays = 30; // Goal days for the bar display

     // Calculate percentage, ensuring it doesn't exceed 100%
     const percentage = Math.min((consecutiveDays / targetDays) * 100, 100);

     const progressBar = document.getElementById('perseveranceProgressBar');
     const percentageDisplay = document.getElementById('perseverancePercentage');
     const barContainer = document.querySelector('.perseverance-bar-container'); // For the tooltip

     if (progressBar && percentageDisplay && barContainer) {
         progressBar.style.width = `${percentage}%`;
         percentageDisplay.textContent = `${consecutiveDays} / ${targetDays} dias`;
         // Update tooltip to show current streak and record
         barContainer.title = `Progresso: ${Math.round(percentage)}% (${consecutiveDays} dias consecutivos)\nRecorde: ${recordDays} dias`;
     } else {
          console.warn("[updatePerseveranceUI] Could not find all progress bar elements.");
     }
     console.log("[updatePerseveranceUI] Progress bar UI updated.");
 }

// Resets BOTH local data structures (perseverance, weekly) and their related UIs
function resetPerseveranceUI() {
    // --- Reset Bar ---
    const progressBar = document.getElementById('perseveranceProgressBar');
    const percentageDisplay = document.getElementById('perseverancePercentage');
    const barContainer = document.querySelector('.perseverance-bar-container');
    if (progressBar && percentageDisplay && barContainer) {
        progressBar.style.width = `0%`; // Reset width
        percentageDisplay.textContent = `0 / 30 dias`; // Reset text
        barContainer.title = ''; // Clear tooltip
    }
    // Reset local bar data
    perseveranceData = { consecutiveDays: 0, lastInteractionDate: null, recordDays: 0 };
    console.log("[resetPerseveranceUI] Progress bar data and UI reset.");

    // --- Reset Chart ---
    // Reset local chart data to current week, no interactions
    weeklyPrayerData = { weekId: getWeekIdentifier(new Date()), interactions: {} };
    resetWeeklyChart(); // Reset chart UI (clear ticks)
    console.log("[resetPerseveranceUI] Weekly chart data and UI reset.");
}

// Updates ONLY the weekly CHART UI based on current `weeklyPrayerData`
function updateWeeklyChart() {
    const today = new Date();
    // Get the current day of the week (0 for Sunday, 1 for Monday, ..., 6 for Saturday)
    const currentDayOfWeek = today.getDay();

    // Calculate the start of the current week (Sunday) based on today's date in UTC
    // This ensures consistency regardless of the user's local timezone offset
    const firstDayOfWeek = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - currentDayOfWeek));
    firstDayOfWeek.setUTCHours(0, 0, 0, 0); // Set to midnight UTC on Sunday

    const interactions = weeklyPrayerData.interactions || {}; // Ensure interactions is an object
    const currentWeekId = weeklyPrayerData.weekId || getWeekIdentifier(today); // Use stored weekId or calculate
    console.log("[updateWeeklyChart] Updating chart for week:", currentWeekId, "Interaction Data:", interactions);

    // Iterate through the 7 days of the week (indices 0 to 6)
    for (let i = 0; i < 7; i++) {
        const dayTick = document.getElementById(`day-${i}`); // Get the tick element (e.g., id="day-0" for Sunday)
        if (!dayTick) continue; // Skip if element doesn't exist in HTML

        // Calculate the UTC date for the current day being checked in the loop
        const currentDayInLoop = new Date(firstDayOfWeek);
        currentDayInLoop.setUTCDate(firstDayOfWeek.getUTCDate() + i); // Add 'i' days to the start of the week (Sunday)

        // Format the date as YYYY-MM-DD (UTC) to use as a key in the interactions map
        const dateStringUTC = formatDateToISO(currentDayInLoop);

        // Check if an interaction exists (value is true) for this specific date in the current week's data
        if (interactions[dateStringUTC] === true) {
            dayTick.classList.add('active'); // Add 'active' class to style the tick (e.g., fill color, checkmark)
        } else {
            dayTick.classList.remove('active'); // Remove 'active' class if no interaction recorded for this day
        }
    }
}

// Visually clears all active ticks from the weekly chart UI
function resetWeeklyChart() {
    for (let i = 0; i < 7; i++) {
        const dayTick = document.getElementById(`day-${i}`);
        if (dayTick) dayTick.classList.remove('active'); // Remove the 'active' class
    }
    console.log("[resetWeeklyChart] Weekly chart ticks visually cleared.");
}


// --- Views and Filters ---

// Generates HTML for a view (can be used for Current, Category, Resolved Period views)
// Accepts an array of targets and an optional title for the generated page
function generateViewHTML(targetsToInclude = lastDisplayedTargets, pageTitle = "Alvos de Oração (Visão Atual)") {
    // Basic HTML structure and inline CSS for the view page
    let viewHTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${pageTitle}</title><style>body{font-family: sans-serif; margin: 20px; line-height: 1.5;} .target{border: 1px solid #ccc; padding: 15px; margin-bottom: 15px; border-radius: 5px; background-color: #fff;} h1{text-align:center; color: #333;} h3{margin-top:0; margin-bottom: 5px; color: #444; display: flex; align-items: center; flex-wrap: wrap; gap: 5px;} p { margin: 4px 0; color: #555;} strong{color: #333;} .deadline-tag{background-color: #ffcc00; color: #333; padding: 3px 8px; border-radius: 4px; font-size: 0.8em; display: inline-block; border: 1px solid #e6b800;} .deadline-tag.expired{background-color: #ff6666; color: #fff; border-color: #ff4d4d;} .category-tag { background-color: #C71585; color: #fff; padding: 3px 8px; border-radius: 4px; font-size: 0.8em; font-weight: bold; display: inline-block; border: 1px solid #A01069; vertical-align: middle;} .observations { margin-top: 10px; padding-left: 15px; border-left: 2px solid #eee;} .observation-item{margin-left: 0; font-size: 0.9em; color: #555; padding-left: 0; border-left: none; margin-bottom: 5px;} .resolved{background-color:#eaffea; border-left: 5px solid #9cbe4a;} .completed-target{opacity: 0.8; border-left: 5px solid #b0b0b0;} .completed-target .category-tag { background-color: #e0e0e0; color: #757575; border-color: #bdbdbd; } .completed-target .deadline-tag { background-color: #e0e0e0; color: #999; border-color: #bdbdbd; } .target h3 .category-tag, .target h3 .deadline-tag { flex-shrink: 0; } </style></head><body><h1>${pageTitle}</h1>`;

    if (!Array.isArray(targetsToInclude) || targetsToInclude.length === 0) {
        viewHTML += "<p style='text-align:center;'>Nenhum alvo para exibir nesta visualização.</p>";
    } else {
        // Iterate through the provided targets and generate HTML for each
        targetsToInclude.forEach(target => {
            // Ensure target is valid before generating HTML
            if (target?.id) viewHTML += generateTargetViewHTML(target, false); // false = not the 'completed daily' view style
        });
    }
    viewHTML += `</body></html>`;

    // Open the generated HTML in a new browser tab/window
    const viewTab = window.open('', '_blank');
    if (viewTab) {
        viewTab.document.write(viewHTML);
        viewTab.document.close(); // Important to finalize loading
    } else {
        // Alert user if the popup was blocked
        alert('Seu navegador bloqueou a abertura de uma nova aba. Por favor, permita pop-ups para este site.');
    }
}

// Generates HTML specifically for the "Alvos do Dia" view
function generateDailyViewHTML() {
    // HTML structure and styles specific to the daily view
    let viewHTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Alvos do Dia</title><style>body{font-family: sans-serif; margin: 20px; line-height: 1.5;} .target{border: 1px solid #ccc; padding: 15px; margin-bottom: 15px; border-radius: 5px; background-color: #fff;} h1, h2 {text-align:center; color: #333;} h2 { margin-top: 25px; border-bottom: 1px solid #eee; padding-bottom: 5px;} h3{margin-top:0; margin-bottom: 5px; color: #444; display: flex; align-items: center; flex-wrap: wrap; gap: 5px;} p { margin: 4px 0; color: #555;} strong{color: #333;} .deadline-tag{background-color: #ffcc00; color: #333; padding: 3px 8px; border-radius: 4px; font-size: 0.8em; display: inline-block; border: 1px solid #e6b800;} .deadline-tag.expired{background-color: #ff6666; color: #fff; border-color: #ff4d4d;} .category-tag { background-color: #C71585; color: #fff; padding: 3px 8px; border-radius: 4px; font-size: 0.8em; font-weight: bold; display: inline-block; border: 1px solid #A01069; vertical-align: middle;} .observations { margin-top: 10px; padding-left: 15px; border-left: 2px solid #eee;} .observation-item{margin-left: 0; font-size: 0.9em; color: #555; padding-left: 0; border-left: none; margin-bottom: 5px;} .completed-target{background-color:#f0f0f0 !important; border-left: 5px solid #9cbe4a;} .completed-target .category-tag { background-color: #e0e0e0; color: #757575; border-color: #bdbdbd; } .completed-target .deadline-tag { background-color: #e0e0e0; color: #999; border-color: #bdbdbd; } .target h3 .category-tag, .target h3 .deadline-tag { flex-shrink: 0; } </style></head><body><h1>Alvos do Dia</h1>`;
    const dailyTargetsDiv = document.getElementById('dailyTargets');
    let pendingCount = 0;
    let completedCount = 0;

    if (dailyTargetsDiv) {
        // --- Generate HTML for Pending Targets ---
        viewHTML += `<h2>Pendentes</h2>`;
        const pendingDivs = dailyTargetsDiv.querySelectorAll('.target:not(.completed-target)'); // Select pending targets
        if (pendingDivs.length > 0) {
            pendingDivs.forEach(div => {
                const targetId = div.dataset.targetId;
                // Find target details in the main active list
                const targetData = prayerTargets.find(t => t.id === targetId);
                if (targetData) {
                    pendingCount++;
                    viewHTML += generateTargetViewHTML(targetData, false); // false = not completed style
                } else {
                    console.warn(`Target data not found for pending daily ID: ${targetId}`);
                    viewHTML += `<div class="target"><p style="color:red;">Erro: Dados do alvo pendente (ID: ${targetId}) não encontrados.</p></div>`;
                }
            });
        }
        if (pendingCount === 0) viewHTML += "<p style='text-align:center;'>Nenhum alvo pendente.</p>";

        // --- Generate HTML for Completed Targets ---
        viewHTML += `<hr style='margin: 25px 0;'/><h2>Concluídos Hoje</h2>`;
        const completedDivs = dailyTargetsDiv.querySelectorAll('.target.completed-target'); // Select completed targets
         if (completedDivs.length > 0) {
             completedDivs.forEach(div => {
                 const targetId = div.dataset.targetId;
                 // Find target details in the main active list (they are still active targets)
                 const targetData = prayerTargets.find(t => t.id === targetId);
                 if (targetData) {
                    completedCount++;
                    // Use the specific completed style for daily view
                    viewHTML += generateTargetViewHTML(targetData, true); // true = completed style
                 } else {
                    console.warn(`Target data not found for completed daily ID: ${targetId}`);
                    viewHTML += `<div class="target completed-target"><p style="color:red;">Erro: Dados do alvo concluído (ID: ${targetId}) não encontrados.</p></div>`;
                 }
             });
         }
        if (completedCount === 0) viewHTML += "<p style='text-align:center;'>Nenhum alvo concluído hoje.</p>";

    } else {
        // Error message if the daily targets container wasn't found
        viewHTML += "<p style='text-align:center; color: red;'>Erro: Seção de alvos diários não encontrada na página.</p>";
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

// Helper function to generate HTML for ONE target for the general/category views
// Takes the target data and a flag indicating if it should use the 'completed daily' style
function generateTargetViewHTML(target, isCompletedViewStyle = false) {
     if (!target?.id) return ''; // Return empty string if target is invalid
     const formattedDate = formatDateForDisplay(target.date);
     const elapsed = timeElapsed(target.date);

     // Create category tag HTML
     let categoryTag = '';
     if (target.category) {
         categoryTag = `<span class="category-tag">${target.category}</span>`;
     }

     // Create deadline tag HTML
     let deadlineTag = '';
     if (target.hasDeadline && target.deadlineDate) {
        const formattedDeadline = formatDateForDisplay(target.deadlineDate);
        const expiredClass = isDateExpired(target.deadlineDate) ? 'expired' : '';
        // Use the 'completed' class only if isCompletedViewStyle is true
        const completedClass = isCompletedViewStyle ? 'completed' : '';
        deadlineTag = `<span class="deadline-tag ${expiredClass} ${completedClass}">Prazo: ${formattedDeadline}</span>`;
     }

     // Render ALL observations fully expanded for the view
     const observations = Array.isArray(target.observations) ? target.observations : [];
     // Pass true for isExpanded to show all observations
     const observationsHTML = renderObservations(observations, true, target.id);

     // Define the main CSS class for the target div based on the style flag
     const mainClass = isCompletedViewStyle ? 'target completed-target' : 'target';

     // Build the target HTML string
     return `
         <div class="${mainClass}" data-target-id="${target.id}">
             <h3>${categoryTag} ${deadlineTag} ${target.title || 'Sem Título'}</h3>
             <p>${target.details || 'Sem Detalhes'}</p>
             <p><strong>Data Criação:</strong> ${formattedDate}</p>
             <p><strong>Tempo Decorrido:</strong> ${elapsed}</p>
             ${observationsHTML} {/* Include the fully expanded observations */}
         </div>`;
}


// Fetches resolved targets within a date range and generates an HTML view
async function generateResolvedViewHTML(startDate, endDate) {
    const user = auth.currentUser; if (!user) { alert("Você precisa estar logado."); return; } const uid = user.uid;

    // Create UTC dates for the start and end of the query range
    // Start date is inclusive (midnight UTC)
    const startUTC = new Date(Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0, 0, 0, 0));
    // End date is inclusive, so query up to the start of the *next* day (exclusive)
    const endNextDay = new Date(endDate);
    endNextDay.setUTCDate(endDate.getUTCDate() + 1); // Go to the day after the selected end date
    const endUTCStartOfNextDay = new Date(Date.UTC(endNextDay.getFullYear(), endNextDay.getMonth(), endNextDay.getDate(), 0, 0, 0, 0)); // Midnight UTC of the next day

    // Convert UTC dates to Firestore Timestamps for the query
    const startTimestamp = Timestamp.fromDate(startUTC);
    const endTimestamp = Timestamp.fromDate(endUTCStartOfNextDay);

    console.log(`[generateResolvedViewHTML] Querying resolved targets between: ${startUTC.toISOString()} (inclusive) and ${endUTCStartOfNextDay.toISOString()} (exclusive)`);

    const archivedRef = collection(db, "users", uid, "archivedTargets");
    // Construct the Firestore query:
    const q = query(archivedRef,
        where("resolved", "==", true), // Must be resolved
        where("resolutionDate", ">=", startTimestamp), // Resolution date on or after start date
        where("resolutionDate", "<", endTimestamp), // Resolution date before the start of the next day
        orderBy("resolutionDate", "desc") // Order by resolution date, newest first
    );

    let filteredResolvedTargets = [];
    try {
        const querySnapshot = await getDocs(q);
        const rawTargets = querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        filteredResolvedTargets = rehydrateTargets(rawTargets); // Convert Timestamps to Dates for display logic
        console.log(`[generateResolvedViewHTML] Found ${filteredResolvedTargets.length} resolved targets in the period.`);
    } catch (error) {
        console.error("Error fetching resolved targets for view:", error);
        alert("Erro ao buscar alvos respondidos no período selecionado: " + error.message);
        return; // Exit if fetch fails
    }

    // Generate the view HTML page
    let viewHTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Alvos Respondidos (${formatDateForDisplay(startDate)} - ${formatDateForDisplay(endDate)})</title><style>body{font-family: sans-serif; margin: 20px; line-height: 1.5;} .target{border: 1px solid #ccc; padding: 15px; margin-bottom: 15px; border-radius: 5px; background-color: #eaffea; border-left: 5px solid #9cbe4a;} h1, h2 {text-align:center; color: #333;} h2 { margin-top: 5px; margin-bottom: 20px; font-size: 1.2em; color: #555;} h3{margin-top:0; margin-bottom: 5px; color: #444; display: flex; align-items: center; flex-wrap: wrap; gap: 5px;} p { margin: 4px 0; color: #555;} strong{color: #333;} .category-tag { background-color: #C71585; color: #fff; padding: 3px 8px; border-radius: 4px; font-size: 0.8em; font-weight: bold; display: inline-block; border: 1px solid #A01069; vertical-align: middle;} .observations { margin-top: 10px; padding-left: 15px; border-left: 2px solid #c3e6cb;} .observation-item{margin-left: 0; font-size: 0.9em; color: #555; padding-left: 0; border-left: none; margin-bottom: 5px;} hr { border: 0; border-top: 1px solid #ccc; margin: 20px 0; } .target h3 .category-tag { flex-shrink: 0; } </style></head><body><h1>Alvos Respondidos</h1>`;
    viewHTML += `<h2>Período: ${formatDateForDisplay(startDate)} a ${formatDateForDisplay(endDate)}</h2><hr/>`;

     if (filteredResolvedTargets.length === 0) {
         viewHTML += "<p style='text-align:center;'>Nenhum alvo respondido encontrado neste período.</p>";
     } else {
         // Iterate over found targets and generate HTML for each using a specific helper
         filteredResolvedTargets.forEach(target => {
             viewHTML += generateTargetViewHTMLForResolved(target);
         });
     }

    viewHTML += `</body></html>`;

    // Open the generated HTML in a new tab
    const viewTab = window.open('', '_blank');
    if (viewTab) {
        viewTab.document.write(viewHTML);
        viewTab.document.close();
    } else {
        alert('Seu navegador bloqueou a abertura de uma nova aba. Por favor, permita pop-ups para este site.');
    }
}

// Helper function to generate HTML specifically for ONE RESOLVED target for the period view
function generateTargetViewHTMLForResolved(target) {
     if (!target?.id) return ''; // Skip invalid target data
     const formattedResolutionDate = formatDateForDisplay(target.resolutionDate);
     let totalTime = 'N/A'; // Calculate time from creation to resolution
     if (target.date instanceof Date && target.resolutionDate instanceof Date) {
         let diffInSeconds = Math.floor((target.resolutionDate.getTime() - target.date.getTime()) / 1000); if (diffInSeconds < 0) diffInSeconds = 0;
         if (diffInSeconds < 60) totalTime = `${diffInSeconds} seg`;
         else { let diffInMinutes = Math.floor(diffInSeconds / 60); if (diffInMinutes < 60) totalTime = `${diffInMinutes} min`;
             else { let diffInHours = Math.floor(diffInMinutes / 60); if (diffInHours < 24) totalTime = `${diffInHours} hr`;
                 else { let diffInDays = Math.floor(diffInHours / 24); if (diffInDays < 30) totalTime = `${diffInDays} dias`;
                     else { let diffInMonths = Math.floor(diffInDays / 30.44); if (diffInMonths < 12) totalTime = `${diffInMonths} meses`;
                         else { let diffInYears = Math.floor(diffInDays / 365.25); totalTime = `${diffInYears} anos`; }}}}}
     }

     // Create category tag HTML
     let categoryTag = '';
     if (target.category) {
         categoryTag = `<span class="category-tag">${target.category}</span>`;
     }

     // Render ALL observations expanded for the view
     const observations = Array.isArray(target.observations) ? target.observations : [];
     const observationsHTML = renderObservations(observations, true, target.id); // true = expanded

     // Build the target HTML string with 'resolved' class for styling
     return `
         <div class="target resolved">
             <h3>${categoryTag} ${target.title || 'Sem Título'} (Respondido)</h3>
             <p>${target.details || 'Sem Detalhes'}</p>
             <p><strong>Data Criação:</strong> ${formatDateForDisplay(target.date)}</p>
             <p><strong>Data Respondido:</strong> ${formattedResolutionDate}</p>
             <p><strong>Tempo Total (Criação -> Resposta):</strong> ${totalTime}</p>
             ${observationsHTML} {/* Include expanded observations */}
         </div>`;
}

// Filters an array of targets based on a search term (checks title, details, category, observations)
function filterTargets(targets, searchTerm) {
    if (!searchTerm) return targets; // Return all if no search term
    const lowerSearchTerm = searchTerm.toLowerCase();
    return targets.filter(target => {
        if (!target) return false; // Skip if target data is somehow invalid
         // Check if search term is present in title, details, category, or any observation text
         const titleMatch = target.title?.toLowerCase().includes(lowerSearchTerm);
         const detailsMatch = target.details?.toLowerCase().includes(lowerSearchTerm);
         const categoryMatch = target.category?.toLowerCase().includes(lowerSearchTerm);
         const observationMatch = Array.isArray(target.observations) &&
             target.observations.some(obs => obs?.text?.toLowerCase().includes(lowerSearchTerm));
        // Return true if any field matches
        return titleMatch || detailsMatch || categoryMatch || observationMatch;
    });
}
// Event handlers for search inputs
function handleSearchMain(event) { currentSearchTermMain = event.target.value; currentPage = 1; renderTargets(); }
function handleSearchArchived(event) { currentSearchTermArchived = event.target.value; currentArchivedPage = 1; renderArchivedTargets(); }
function handleSearchResolved(event) { currentSearchTermResolved = event.target.value; currentResolvedPage = 1; renderResolvedTargets(); }

// Controls which main panel/section is visible
function showPanel(panelIdToShow) {
    // List of all major panel IDs
    const allPanels = ['appContent', 'dailySection', 'mainPanel', 'archivedPanel', 'resolvedPanel'];
    // Elements specifically related to the daily section
    const dailyRelatedElements = ['weeklyPerseveranceChart', 'perseveranceSection', 'sectionSeparator'];

    // Hide all main panels first
    allPanels.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.style.display = 'none';
    });

    // Hide daily-related elements by default
    dailyRelatedElements.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.style.display = 'none';
    });

    // Show the requested panel
    const panelToShow = document.getElementById(panelIdToShow);
    if(panelToShow) {
        panelToShow.style.display = 'block';
    } else {
        console.warn(`Panel with ID ${panelIdToShow} not found.`);
    }

    // If showing the daily section, also show its related elements (bar, chart, separator)
    if (panelIdToShow === 'dailySection') {
        dailyRelatedElements.forEach(id => {
            const el = document.getElementById(id);
            if(el) el.style.display = 'block';
        });
    }
    console.log(`Showing panel: ${panelIdToShow}`);
}

// --- Verses and Popups ---
const verses = [ // Array of inspirational verses
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
        popup.style.display = 'flex'; // Use flex to center content vertically/horizontally
        const popupVerseElement = popup.querySelector('#popupVerse');
        // Display a random verse in the popup as well
        if (popupVerseElement) {
            const randomIndex = Math.floor(Math.random() * verses.length);
            popupVerseElement.textContent = verses[randomIndex];
        }
    }
}

// --- Manual Addition of Target to Daily List ---

// Opens the modal for manually adding a target to the daily list
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
    modal.style.display = 'block'; // Show the modal
    searchInput.focus(); // Focus the search input
}

// Handles search input changes in the manual add modal
async function handleManualTargetSearch() {
    const searchInput = document.getElementById('manualTargetSearchInput');
    const resultsDiv = document.getElementById('manualTargetSearchResults');
    const searchTerm = searchInput.value.toLowerCase().trim();

    if (searchTerm.length < 2) { // Only search if 2+ characters are typed
        resultsDiv.innerHTML = '<p>Digite pelo menos 2 caracteres...</p>';
        return;
    }

    resultsDiv.innerHTML = '<p>Buscando...</p>'; // Loading indicator

    // Filter ACTIVE targets matching the search term (using the filterTargets helper)
    const filteredActiveTargets = filterTargets(prayerTargets, searchTerm)
                                   .filter(target => !target.archived && !target.resolved); // Ensure they are active

    // Further filter out targets that are ALREADY in the current daily list
    // Uses the global `currentDailyTargets` which holds IDs from the current daily doc
    const targetsNotInDailyList = filteredActiveTargets.filter(target => !currentDailyTargets.includes(target.id));

    // Render the search results (or message if none found)
    renderManualSearchResults(targetsNotInDailyList);
}

// Renders the search results list inside the manual add modal
function renderManualSearchResults(targets) {
    const resultsDiv = document.getElementById('manualTargetSearchResults');
    resultsDiv.innerHTML = ''; // Clear previous results

    if (targets.length === 0) {
        resultsDiv.innerHTML = '<p>Nenhum alvo ativo encontrado ou todos os correspondentes já estão na lista do dia.</p>';
        return;
    }

    // Create a clickable item for each search result
    targets.forEach(target => {
        const itemDiv = document.createElement('div');
        itemDiv.classList.add('manual-target-item');
        // Attach click handler to select this target
        itemDiv.onclick = () => selectManualTarget(target.id, target.title); // Pass ID and title

        let categoryInfo = target.category ? `[${target.category}] ` : '';
        let detailsSnippet = target.details ? `- ${target.details.substring(0, 50)}...` : ''; // Show snippet

        itemDiv.innerHTML = `
            <h4>${target.title || 'Sem Título'}</h4>
            <span>${categoryInfo}${formatDateForDisplay(target.date)} ${detailsSnippet}</span>
        `;
        resultsDiv.appendChild(itemDiv);
    });
}

// Called when a target is clicked/selected in the manual add modal results
async function selectManualTarget(targetId, targetTitle) {
    if (!confirm(`Adicionar "${targetTitle || targetId}" à lista de oração de hoje?`)) {
        return; // Do nothing if user cancels
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
        // Use a Firestore Transaction for atomic read and write
        await runTransaction(db, async (transaction) => {
            const dailyDocSnap = await transaction.get(dailyRef);
            let currentTargetsArray = [];

            if (dailyDocSnap.exists()) {
                // Ensure the targets array exists and is valid
                currentTargetsArray = (dailyDocSnap.data()?.targets && Array.isArray(dailyDocSnap.data().targets))
                                      ? dailyDocSnap.data().targets
                                      : [];
            } else {
                // This case should ideally not happen if loadDailyTargets works correctly,
                // but handle it defensively.
                console.warn(`[selectManualTarget] Daily document ${dailyDocId} does not exist during transaction! Assuming empty list.`);
                // We could attempt to create it, but reloading might be safer.
                // For now, just proceed assuming an empty list if it doesn't exist.
                 currentTargetsArray = [];
                 // Consider throwing error if doc *must* exist:
                 // throw new Error("Documento diário não encontrado. Tente recarregar a página.");
            }

            // Check if the target is already in the list
            const alreadyExists = currentTargetsArray.some(t => t?.targetId === targetId);
            if (alreadyExists) {
                // Alert user and exit transaction without writing
                alert(`"${targetTitle || targetId}" já está na lista de hoje.`);
                console.log(`[selectManualTarget] Target ${targetId} already in list.`);
                return; // Exit transaction callback
            }

            // Add the new target entry to the array
            const newTargetEntry = {
                targetId: targetId,
                completed: false, // Initially not completed
                manuallyAdded: true // Mark as manually added
            };
            const updatedTargetsArray = [...currentTargetsArray, newTargetEntry];

            // Update the document within the transaction
            // If the doc didn't exist, transaction.set would be needed.
            // Since we assume loadDailyTargets creates it, transaction.update is safer.
            // If doc might not exist, use set with merge:true or handle creation.
            if (dailyDocSnap.exists()){
                transaction.update(dailyRef, { targets: updatedTargetsArray });
            } else {
                // If we decided to allow creation here:
                transaction.set(dailyRef, { userId: userId, date: todayStr, targets: updatedTargetsArray });
                console.log(`[selectManualTarget] Daily document ${dailyDocId} created during transaction.`);
            }
            console.log(`[selectManualTarget] Target ${targetId} added/updated in daily doc via transaction.`);
        });

        // --- Transaction Successful ---
        alert(`"${targetTitle || targetId}" adicionado à lista do dia!`);
        if (modal) modal.style.display = 'none'; // Close modal

        // Update UI by reloading the daily targets list
        await loadDailyTargets();

    } catch (error) {
        console.error("Error adding manual target to daily list:", error);
        alert("Erro ao adicionar alvo manual: " + error.message);
        // Keep modal open on error for user to retry or cancel.
    }
}

// --- Category View Functions ---
function openCategorySelectionModal() {
    const modal = document.getElementById('categorySelectionModal');
    const checkboxesContainer = document.getElementById('categoryCheckboxesContainer');
    if (!modal || !checkboxesContainer) {
        console.error("Category selection modal elements not found.");
        alert("Erro ao abrir a seleção de categorias.");
        return;
    }

    // Clear previous checkboxes
    checkboxesContainer.innerHTML = '';

    // Populate with categories from the predefined list
    predefinedCategories.forEach(category => {
        const checkboxId = `category-sel-${category.replace(/[^a-zA-Z0-9]/g, '-')}`; // Create a more robust ID
        const div = document.createElement('div');
        div.classList.add('category-checkbox-item'); // Add class for styling

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = checkboxId;
        checkbox.value = category;
        checkbox.name = 'selectedCategories'; // Group checkboxes

        const label = document.createElement('label');
        label.htmlFor = checkboxId;
        label.textContent = category;

        div.appendChild(checkbox);
        div.appendChild(label);
        checkboxesContainer.appendChild(div);
    });

    // Show the modal
    modal.style.display = 'block';
}

function generateCategoryFilteredView() {
    const modal = document.getElementById('categorySelectionModal');
    const checkboxesContainer = document.getElementById('categoryCheckboxesContainer');
    if (!checkboxesContainer || !modal) return;

    // Get all checked category checkboxes
    const selectedCheckboxes = checkboxesContainer.querySelectorAll('input[name="selectedCategories"]:checked');
    // Extract the category names (values) from the checked boxes
    const selectedCategories = Array.from(selectedCheckboxes).map(cb => cb.value);

    if (selectedCategories.length === 0) {
        alert("Por favor, selecione pelo menos uma categoria.");
        return;
    }

    // Filter only ACTIVE prayer targets based on selected categories
    const filteredTargets = prayerTargets.filter(target => {
        // Check if target is active AND its category is in the selected list
        return !target.archived && !target.resolved && target.category && selectedCategories.includes(target.category);
    });

    // Sort the filtered targets primarily by category, then by creation date (newest first)
    filteredTargets.sort((a, b) => {
        const catCompare = (a.category || '').localeCompare(b.category || ''); // Compare categories alphabetically
        if (catCompare !== 0) return catCompare; // If categories differ, sort by category
        // If categories are the same, sort by date (newest first)
        const dateA = a.date instanceof Date ? a.date.getTime() : 0;
        const dateB = b.date instanceof Date ? b.date.getTime() : 0;
        return dateB - dateA;
    });

    // Generate the view HTML using the filtered and sorted list
    const pageTitle = `Alvos por Categoria: ${selectedCategories.join(', ')}`;
    generateViewHTML(filteredTargets, pageTitle); // Use the general view generator

    // Close the modal
    modal.style.display = 'none';
}


// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("[DOMContentLoaded] DOM fully loaded. Setting up listeners.");
    try {
        // Set default date in the "Add New Target" form to today
        const dateInput = document.getElementById('date');
        if (dateInput) dateInput.value = formatDateToISO(new Date());
    } catch (e) {
        console.error("Error setting default date:", e);
    }

    // --- Firebase Auth State Listener ---
    // This triggers loadData when auth state changes (login/logout)
    onAuthStateChanged(auth, (user) => loadData(user));

    // --- Search & Filter Listeners ---
    document.getElementById('searchMain')?.addEventListener('input', handleSearchMain);
    document.getElementById('searchArchived')?.addEventListener('input', handleSearchArchived);
    document.getElementById('searchResolved')?.addEventListener('input', handleSearchResolved);
    document.getElementById('showDeadlineOnly')?.addEventListener('change', handleDeadlineFilterChange);
    document.getElementById('showExpiredOnlyMain')?.addEventListener('change', handleExpiredOnlyMainChange);

    // --- Auth Button Listeners ---
    document.getElementById('btnEmailSignUp')?.addEventListener('click', signUpWithEmailPassword);
    document.getElementById('btnEmailSignIn')?.addEventListener('click', signInWithEmailPassword);
    document.getElementById('btnForgotPassword')?.addEventListener('click', resetPassword);
    document.getElementById('btnLogout')?.addEventListener('click', () => {
        signOut(auth).catch(error => console.error("Logout error:", error));
    });

    // --- Report Button Listener ---
    document.getElementById("viewReportButton")?.addEventListener('click', () => window.location.href = 'orei.html');

    // --- Daily Section Button Listeners ---
    document.getElementById("refreshDaily")?.addEventListener("click", async () => {
        const user = auth.currentUser; if (!user) { alert("Você precisa estar logado."); return; }
        if (confirm("Gerar nova lista de alvos para hoje? Isso substituirá a lista atual, incluindo os que já foram marcados como 'Orado'.")) {
            const userId = user.uid; const todayStr = formatDateToISO(new Date()); const dailyDocId = `${userId}_${todayStr}`;
            const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);
            document.getElementById("dailyTargets").innerHTML = '<p>Gerando nova lista...</p>'; // Feedback
            try {
                const newTargetsData = await generateDailyTargets(userId, todayStr); // Generate new list
                if (newTargetsData) {
                    await setDoc(dailyRef, newTargetsData); // Save (overwrite) in Firestore
                    await loadDailyTargets(); // Reload and render new list from Firestore
                    alert("Nova lista de alvos do dia gerada!");
                } else {
                     throw new Error("Falha ao gerar dados da nova lista.");
                }
            } catch (error) {
                console.error("Error refreshing daily targets:", error);
                alert("Erro ao gerar nova lista de alvos: " + error.message);
                await loadDailyTargets(); // Try reloading old/current list on error
            }
        }
     });
     document.getElementById("copyDaily")?.addEventListener("click", () => {
        const dailyTargetsDiv = document.getElementById('dailyTargets');
        let textToCopy = 'Alvos Pendentes Hoje:\n\n';
        let count = 0;
        if (!dailyTargetsDiv) return;
        const targetDivs = dailyTargetsDiv.querySelectorAll('.target:not(.completed-target)'); // Get only pending divs

        targetDivs.forEach((div) => {
            const targetId = div.dataset.targetId;
            // Find the corresponding target data in the main list to get accurate title/details
            const targetData = prayerTargets.find(t => t.id === targetId);
            if (targetData) {
                 const titleText = targetData.title || 'Sem Título';
                 const detailsText = targetData.details || 'Sem Detalhes';
                 count++;
                 textToCopy += `${count}. ${titleText}\n   ${detailsText}\n\n`;
            }
        });

        if (count > 0) {
            navigator.clipboard.writeText(textToCopy.trim())
                .then(() => alert(`${count} alvo(s) pendente(s) copiado(s) para a área de transferência!`))
                .catch(err => {
                    console.error('Falha ao copiar para clipboard:', err);
                    // Fallback for browsers that might block clipboard API
                    prompt("Não foi possível copiar automaticamente. Copie manualmente abaixo:", textToCopy.trim());
                });
        } else {
            alert('Nenhum alvo pendente para copiar.');
        }
     });

    // --- Manual Add Target Button Listener ---
    document.getElementById("addManualTargetButton")?.addEventListener('click', () => {
        const user = auth.currentUser;
        if (!user) { alert("Você precisa estar logado para adicionar alvos."); return; }
        openManualTargetModal(); // Open the modal
    });

    // --- View Generation Button Listeners ---
    document.getElementById('generateViewButton')?.addEventListener('click', () => generateViewHTML(lastDisplayedTargets)); // Use last rendered list in active panel
    document.getElementById('generateCategoryViewButton')?.addEventListener('click', openCategorySelectionModal); // Opens category selection modal
    document.getElementById('viewDaily')?.addEventListener('click', generateDailyViewHTML); // Generates the daily view
    document.getElementById("viewResolvedViewButton")?.addEventListener("click", () => { // Opens date range modal
         const modal = document.getElementById("dateRangeModal");
         if(modal) {
            modal.style.display = "block";
            // Pre-fill default dates (today and 30 days ago)
            const today = new Date();
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(today.getDate() - 30);
            const endDateInput = document.getElementById("endDate");
            const startDateInput = document.getElementById("startDate");
            if(endDateInput) endDateInput.value = formatDateToISO(today);
            if(startDateInput) startDateInput.value = formatDateToISO(thirtyDaysAgo);
         }
     });

     // --- Popup Close Listener ---
     document.getElementById('closePopup')?.addEventListener('click', () => {
        const popup = document.getElementById('completionPopup');
        if(popup) popup.style.display = 'none';
     });

     // --- Main Navigation Button Listeners ---
    document.getElementById('backToMainButton')?.addEventListener('click', () => showPanel('dailySection'));
    document.getElementById('addNewTargetButton')?.addEventListener('click', () => showPanel('appContent'));
    document.getElementById('viewAllTargetsButton')?.addEventListener('click', () => { showPanel('mainPanel'); currentPage = 1; renderTargets(); });
    document.getElementById("viewArchivedButton")?.addEventListener("click", () => { showPanel('archivedPanel'); currentArchivedPage = 1; renderArchivedTargets(); });
    document.getElementById("viewResolvedButton")?.addEventListener("click", () => { showPanel('resolvedPanel'); currentResolvedPage = 1; renderResolvedTargets(); });

    // --- Date Range Modal Listeners ---
    const dateRangeModal = document.getElementById("dateRangeModal");
    document.getElementById("closeDateRangeModal")?.addEventListener("click", () => {if(dateRangeModal) dateRangeModal.style.display = "none"});
    document.getElementById("generateResolvedView")?.addEventListener("click", () => {
        const startDateStr = document.getElementById("startDate").value;
        const endDateStr = document.getElementById("endDate").value;
        if (startDateStr && endDateStr) {
            // Convert strings to Date objects (interpret as local time initially)
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
            // Call the function that handles UTC conversion and generation
            generateResolvedViewHTML(start, end);
            if(dateRangeModal) dateRangeModal.style.display = "none"; // Close modal on success
        } else {
            alert("Por favor, selecione as datas de início e fim.");
        }
    });
    document.getElementById("cancelDateRange")?.addEventListener("click", () => {if(dateRangeModal) dateRangeModal.style.display = "none"});

    // --- Manual Target Modal Listeners ---
    const manualTargetModal = document.getElementById("manualTargetModal");
    document.getElementById("closeManualTargetModal")?.addEventListener("click", () => { if(manualTargetModal) manualTargetModal.style.display = "none" });
    // Add listener for search input within the modal
    document.getElementById("manualTargetSearchInput")?.addEventListener('input', handleManualTargetSearch);

    // --- Category Selection Modal Listeners ---
    const categoryModal = document.getElementById('categorySelectionModal');
    document.getElementById('closeCategoryModal')?.addEventListener('click', () => { if(categoryModal) categoryModal.style.display = 'none'; });
    document.getElementById('cancelCategoryView')?.addEventListener('click', () => { if(categoryModal) categoryModal.style.display = 'none'; });
    document.getElementById('confirmCategoryView')?.addEventListener('click', generateCategoryFilteredView); // Generate view on confirm


    // --- *** Event Delegation Listener for Observation Toggles *** ---
    // Attach listener to parent containers instead of individual links
    document.getElementById('targetList')?.addEventListener('click', handleObservationToggleClick);
    document.getElementById('archivedList')?.addEventListener('click', handleObservationToggleClick);
    document.getElementById('resolvedList')?.addEventListener('click', handleObservationToggleClick);
    document.getElementById('dailyTargets')?.addEventListener('click', handleObservationToggleClick); // Include daily section


    // --- Close Modals on Outside Click ---
    window.addEventListener('click', (event) => {
        if (event.target == dateRangeModal) dateRangeModal.style.display = "none";
        if (event.target == manualTargetModal) manualTargetModal.style.display = "none";
        if (event.target == categoryModal) categoryModal.style.display = "none";
    });

}); // End of DOMContentLoaded


// --- Add functions to window for HTML inline onclick access ---
// (Needed because script is type="module", except for those handled by delegation)
window.markAsResolved = markAsResolved;
window.archiveTarget = archiveTarget;
window.deleteArchivedTarget = deleteArchivedTarget;
window.toggleAddObservation = toggleAddObservation; // Still needed to open the form initially
window.saveObservation = saveObservation;          // Still needed for the form's save button
// window.toggleObservations = toggleObservations; // REMOVED - Handled by delegation now
window.editDeadline = editDeadline;               // Still needed to open the form
window.saveEditedDeadline = saveEditedDeadline;     // Still needed for form's save button
window.cancelEditDeadline = cancelEditDeadline;   // Still needed for form's cancel button
window.editCategory = editCategory;               // Still needed to open the form
window.saveEditedCategory = saveEditedCategory;     // Still needed for form's save button
window.cancelEditCategory = cancelEditCategory;   // Still needed for form's cancel button
// Functions for manual add modal (if needed by any inline handlers, though likely not)
window.openManualTargetModal = openManualTargetModal;
window.handleManualTargetSearch = handleManualTargetSearch;
window.selectManualTarget = selectManualTarget;
// Functions for category selection modal (likely not needed globally)
// window.openCategorySelectionModal = openCategorySelectionModal;
// window.generateCategoryFilteredView = generateCategoryFilteredView;
