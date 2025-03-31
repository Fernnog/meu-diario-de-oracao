import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-analytics.js";
import { getAuth, signOut, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDocs, updateDoc, deleteDoc, query, where, orderBy, getDoc, addDoc, increment, Timestamp, writeBatch } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

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

// --- MODIFICADO --- Estrutura de perseveranceData apenas para a BARRA DE PROGRESSO
let perseveranceData = {
    consecutiveDays: 0,
    lastInteractionDate: null, // Data da última confirmação de perseverança (via botão)
    recordDays: 0
};

// --- NOVO --- Estrutura de weeklyPrayerData apenas para o QUADRO SEMANAL
let weeklyPrayerData = {
    weekId: null,           // Identificador da semana atual (ex: '2023-W44')
    interactions: {}        // Mapa para dias interagidos na semana via "Orei!" (ex: {'2023-11-05': true})
};

// ==== FUNÇÕES UTILITÁRIAS ====

// Função para obter o identificador da semana ISO (Ano-W##) para uma data
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
        console.warn("[createUTCDate] Invalid date string format provided:", dateString);
        return null;
    }
    const date = new Date(dateString + 'T00:00:00Z');
    if (isNaN(date.getTime())) {
        console.warn("[createUTCDate] Failed to parse date string to valid UTC Date:", dateString);
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
        // Try parsing string, ensure it's treated as UTC if no timezone info
        dateToFormat = new Date(date.includes('T') || date.includes('Z') ? date : date + 'T00:00:00Z');
    }

    if (!(dateToFormat instanceof Date) || isNaN(dateToFormat.getTime())) {
        console.warn("formatDateToISO received invalid date, defaulting to today:", date);
        dateToFormat = new Date(); // Default to now if invalid
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
             // Try parsing string, ensure it's treated as UTC if no timezone info
            dateToFormat = new Date(dateInput.includes('T') || dateInput.includes('Z') ? dateInput : dateInput + 'T00:00:00Z');
         }
        else { console.warn("[formatDateForDisplay] Input is unexpected type:", typeof dateInput, dateInput); return 'Data Inválida'; }
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
    if (diffInSeconds < 0) diffInSeconds = 0; // Handle potential clock skew
    if (diffInSeconds < 60) return `${diffInSeconds} seg`;
    let diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes} min`;
    let diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} hr`;
    let diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 30) return `${diffInDays} dias`;
    let diffInMonths = Math.floor(diffInDays / 30.44); // Average days in month
    if (diffInMonths < 12) return `${diffInMonths} meses`;
    let diffInYears = Math.floor(diffInDays / 365.25); // Account for leap years
    return `${diffInYears} anos`;
}

// Checks if a given date (Date object expected, representing UTC midnight) is before the start of today (UTC)
function isDateExpired(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) return false;
    const now = new Date();
    // Get the start of today in UTC
    const todayUTCStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    // Compare the deadline date (which should represent UTC midnight) with the start of today UTC
    return date.getTime() < todayUTCStart.getTime();
}

function generateUniqueId() {
    // Simple unique ID generator (consider UUID library for production robustness)
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
                // Already a valid Date object, do nothing
            } else if (originalValue === null || originalValue === undefined) {
                rehydratedTarget[field] = null; // Keep null/undefined as is
            } else if (typeof originalValue === 'string') {
                 // Attempt to parse string dates, assuming UTC if no timezone specified
                try {
                    const parsedDate = new Date(originalValue.includes('T') || originalValue.includes('Z') ? originalValue : originalValue + 'T00:00:00Z');
                    rehydratedTarget[field] = !isNaN(parsedDate.getTime()) ? parsedDate : null;
                } catch (e) {
                    console.warn(`[rehydrateTargets] Could not parse date string for field ${field}:`, originalValue);
                    rehydratedTarget[field] = null;
                }
            } else {
                 // Handle other unexpected types if necessary, or default to null
                 console.warn(`[rehydrateTargets] Unexpected type for date field ${field}:`, typeof originalValue, originalValue);
                 rehydratedTarget[field] = null;
            }
        });

        // Rehydrate observation dates
        if (rehydratedTarget.observations && Array.isArray(rehydratedTarget.observations)) {
            rehydratedTarget.observations = rehydratedTarget.observations.map(obs => {
                let obsDateFinal = null;
                if (obs.date instanceof Timestamp) obsDateFinal = obs.date.toDate();
                else if (obs.date instanceof Date && !isNaN(obs.date)) obsDateFinal = obs.date;
                else if (typeof obs.date === 'string') {
                    try {
                         const parsedObsDate = new Date(obs.date.includes('T') || obs.date.includes('Z') ? obs.date : obs.date + 'T00:00:00Z');
                         if (!isNaN(parsedObsDate.getTime())) obsDateFinal = parsedObsDate;
                     } catch(e) { /* ignore parse error for observation */ }
                }
                return { ...obs, date: obsDateFinal };
            }).sort((a, b) => (b.date instanceof Date ? b.date.getTime() : 0) - (a.date instanceof Date ? a.date.getTime() : 0)); // Sort observations newest first
        } else {
            rehydratedTarget.observations = []; // Ensure it's an array
        }

        return rehydratedTarget;
    });
}
// ==== FIM FUNÇÕES UTILITÁRIAS ====


// ==== AUTENTICAÇÃO ====
function updateAuthUI(user) {
    const authStatus = document.getElementById('authStatus');
    const btnLogout = document.getElementById('btnLogout');
    const emailPasswordAuthForm = document.getElementById('emailPasswordAuthForm');
    const authStatusContainer = document.querySelector('.auth-status-container'); // Container for status + logout

    if (user) {
        // User is signed in
        authStatusContainer.style.display = 'flex'; // Use flex to align status and logout
        btnLogout.style.display = 'inline-block';
        emailPasswordAuthForm.style.display = 'none'; // Hide login form

        // Display user info
        let providerType = 'desconhecido';
        if (user.providerData[0]?.providerId === 'password') {
            providerType = 'E-mail/Senha';
        } else if (user.providerData[0]?.providerId === 'google.com') {
            providerType = 'Google';
        }
        authStatus.textContent = `Autenticado: ${user.email} (via ${providerType})`;

    } else {
        // User is signed out
        authStatusContainer.style.display = 'block'; // Revert to block display if needed, or hide it
        btnLogout.style.display = 'none';
        emailPasswordAuthForm.style.display = 'block'; // Show login form
        authStatus.textContent = "Nenhum usuário autenticado";
        document.getElementById('passwordResetMessage').style.display = 'none'; // Hide reset message on logout
    }
}

async function signUpWithEmailPassword() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const passwordResetMessageDiv = document.getElementById('passwordResetMessage');
    passwordResetMessageDiv.style.display = "none"; // Hide reset message

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
    passwordResetMessageDiv.style.display = "none"; // Hide reset message

    try {
        await signInWithEmailAndPassword(auth, email, password);
        // Auth state change will handle UI update and data loading
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
        console.error("Erro ao enviar e-mail de redefinição de senha:", error);
        passwordResetMessageDiv.textContent = "Erro ao redefinir senha: " + error.message;
        passwordResetMessageDiv.style.color = "red";
        passwordResetMessageDiv.style.display = "block";
    }
}
// ==== FIM AUTENTICAÇÃO ====


// ==== DADOS E LÓGICA PRINCIPAL ====

// --- Carregamento de Dados ---
async function loadData(user) {
    updateAuthUI(user);
    const uid = user ? user.uid : null;

    if (uid) {
        console.log(`[loadData] User ${uid} authenticated. Loading data...`);
        // Show relevant sections
        document.getElementById('appContent').style.display = 'none'; // Hide add form initially
        document.getElementById('dailySection').style.display = 'block';
        document.getElementById('sectionSeparator').style.display = 'block';
        document.getElementById('mainPanel').style.display = 'none'; // Hide panels initially
        document.getElementById('archivedPanel').style.display = 'none';
        document.getElementById('resolvedPanel').style.display = 'none';
        document.getElementById('weeklyPerseveranceChart').style.display = 'block'; // Show weekly chart
        document.getElementById('perseveranceSection').style.display = 'block';   // Show progress bar

        try {
            // Load perseverance bar data FIRST (independent)
            await loadPerseveranceData(uid); // This function now also calls loadWeeklyPrayerData

            // Then load targets
            await fetchPrayerTargets(uid);
            await fetchArchivedTargets(uid);
            resolvedTargets = archivedTargets.filter(target => target.resolved);

            checkExpiredDeadlines(); // Check after loading active targets

            // Initial render (panels hidden, but data is ready)
            renderTargets();
            renderArchivedTargets();
            renderResolvedTargets();

            // Load daily targets last (depends on prayerTargets being loaded)
            await loadDailyTargets();

            // Show the initial view (Daily Section)
            showPanel('dailySection');

        } catch (error) {
             console.error("[loadData] Error during data loading process:", error);
             alert("Ocorreu um erro ao carregar seus dados. Por favor, recarregue a página ou tente fazer login novamente.");
             // Optionally reset UI to a safe state
             resetPerseveranceUI(); // Resets bar AND chart UI/local data
             prayerTargets = []; archivedTargets = []; resolvedTargets = [];
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
        prayerTargets = [];
        archivedTargets = [];
        resolvedTargets = [];
        renderTargets(); // Clear lists visually
        renderArchivedTargets();
        renderResolvedTargets();
        document.getElementById("dailyTargets").innerHTML = "<p>Faça login para ver os alvos diários.</p>";
        document.getElementById('dailyVerses').textContent = '';
        resetPerseveranceUI(); // Resets bar AND chart UI/local data
    }
}

async function fetchPrayerTargets(uid) {
    prayerTargets = [];
    const targetsRef = collection(db, "users", uid, "prayerTargets");
    // Fetch active targets, ordered by creation date descending
    const targetsSnapshot = await getDocs(query(targetsRef, orderBy("date", "desc")));
    console.log(`[fetchPrayerTargets] Found ${targetsSnapshot.size} active targets for user ${uid}`);
    const rawTargets = [];
    targetsSnapshot.forEach((doc) => {
        rawTargets.push({ ...doc.data(), id: doc.id });
    });
    prayerTargets = rehydrateTargets(rawTargets); // Convert Timestamps to Dates
    console.log("[fetchPrayerTargets] Rehydrated active prayerTargets count:", prayerTargets.length);
}

async function fetchArchivedTargets(uid) {
    archivedTargets = [];
    const archivedRef = collection(db, "users", uid, "archivedTargets");
     // Fetch archived targets, ordered by creation date descending (or resolution/archive date if available later)
    const archivedSnapshot = await getDocs(query(archivedRef, orderBy("date", "desc"))); // Consider sorting by archivedDate or resolutionDate later if needed
    console.log(`[fetchArchivedTargets] Found ${archivedSnapshot.size} archived targets for user ${uid}`);
    const rawArchived = [];
    archivedSnapshot.forEach((doc) => {
        rawArchived.push({ ...doc.data(), id: doc.id });
    });
    archivedTargets = rehydrateTargets(rawArchived); // Convert Timestamps to Dates
    console.log("[fetchArchivedTargets] Rehydrated archivedTargets count:", archivedTargets.length);
}

// --- Renderização ---
function renderTargets() {
    const targetListDiv = document.getElementById('targetList');
    targetListDiv.innerHTML = ''; // Clear previous list
    let filteredAndPagedTargets = [...prayerTargets]; // Start with all active targets

    // Apply Filters
    if (currentSearchTermMain) {
        filteredAndPagedTargets = filterTargets(filteredAndPagedTargets, currentSearchTermMain);
    }
    if (showDeadlineOnly) {
        filteredAndPagedTargets = filteredAndPagedTargets.filter(target => target.hasDeadline && target.deadlineDate);
    }
    const showExpiredOnlyMainCheckbox = document.getElementById('showExpiredOnlyMain');
    if (showExpiredOnlyMainCheckbox && showExpiredOnlyMainCheckbox.checked) {
        filteredAndPagedTargets = filteredAndPagedTargets.filter(target => target.hasDeadline && target.deadlineDate && isDateExpired(target.deadlineDate));
    }

    // Apply Sorting
     if (showDeadlineOnly || (showExpiredOnlyMainCheckbox && showExpiredOnlyMainCheckbox.checked)) {
        // Sort by deadline date ascending (earliest deadline first)
        filteredAndPagedTargets.sort((a, b) => {
            const dateA = a.deadlineDate instanceof Date && !isNaN(a.deadlineDate) ? a.deadlineDate.getTime() : Infinity; // Put items without deadline last
            const dateB = b.deadlineDate instanceof Date && !isNaN(b.deadlineDate) ? b.deadlineDate.getTime() : Infinity;
            if (dateA !== dateB) return dateA - dateB;
             // Fallback sort by creation date descending (newest first) if deadlines are same or both invalid
             const creationDateA = (a.date instanceof Date && !isNaN(a.date)) ? a.date.getTime() : 0;
             const creationDateB = (b.date instanceof Date && !isNaN(b.date)) ? b.date.getTime() : 0;
             return creationDateB - creationDateA;
        });
    } else {
        // Default sort: Creation date descending (newest first)
        filteredAndPagedTargets.sort((a, b) => {
             const creationDateA = (a.date instanceof Date && !isNaN(a.date)) ? a.date.getTime() : 0;
             const creationDateB = (b.date instanceof Date && !isNaN(b.date)) ? b.date.getTime() : 0;
             return creationDateB - creationDateA;
         });
    }

    // Apply Pagination
    const startIndex = (currentPage - 1) * targetsPerPage;
    const endIndex = startIndex + targetsPerPage;
    const targetsToDisplay = filteredAndPagedTargets.slice(startIndex, endIndex);
    lastDisplayedTargets = targetsToDisplay; // Keep track of what's currently displayed for Generate View

    // Render Targets
    if (targetsToDisplay.length === 0) {
        if (filteredAndPagedTargets.length > 0 && currentPage > 1) {
            // If on a page > 1 with no results (due to filtering/deletion), go back to page 1
            currentPage = 1;
            renderTargets(); // Re-render on page 1
            return;
        } else {
            targetListDiv.innerHTML = '<p>Nenhum alvo de oração encontrado com os filtros atuais.</p>';
        }
    } else {
        targetsToDisplay.forEach((target) => {
             if (!target || !target.id) {
                 console.warn("[renderTargets] Skipping rendering of invalid target:", target);
                 return; // Skip invalid targets
             }
            const targetDiv = document.createElement("div");
            targetDiv.classList.add("target");
            targetDiv.dataset.targetId = target.id; // Store ID for actions

            const formattedDate = formatDateForDisplay(target.date);
            const elapsed = timeElapsed(target.date);
            let deadlineTag = '';
            if (target.hasDeadline && target.deadlineDate) {
                const formattedDeadline = formatDateForDisplay(target.deadlineDate);
                deadlineTag = `<span class="deadline-tag ${isDateExpired(target.deadlineDate) ? 'expired' : ''}">Prazo: ${formattedDeadline}</span>`;
            }

            const observations = Array.isArray(target.observations) ? target.observations : [];

            targetDiv.innerHTML = `
                <h3>${deadlineTag} ${target.title || 'Sem Título'}</h3>
                <p>${target.details || 'Sem Detalhes'}</p>
                <p><strong>Data Criação:</strong> ${formattedDate}</p>
                <p><strong>Tempo Decorrido:</strong> ${elapsed}</p>
                ${renderObservations(observations, false, target.id)} {/* Initially collapsed */}
                <div class="target-actions">
                    <button class="resolved btn" onclick="markAsResolved('${target.id}')">Respondido</button>
                    <button class="archive btn" onclick="archiveTarget('${target.id}')">Arquivar</button>
                    <button class="add-observation btn" onclick="toggleAddObservation('${target.id}')">Observação</button>
                    ${target.hasDeadline ? `<button class="edit-deadline btn" onclick="editDeadline('${target.id}')">Editar Prazo</button>` : ''}
                </div>
                <div id="observationForm-${target.id}" class="add-observation-form" style="display:none;">
                    ${/* Observation form content will be added by renderObservationForm */''}
                </div>
                <div id="editDeadlineForm-${target.id}" class="edit-deadline-form" style="display:none;">
                     ${/* Deadline edit form content will be added by editDeadline */''}
                 </div>
            `;
            targetListDiv.appendChild(targetDiv);
            renderObservationForm(target.id); // Prepare the form structure even if hidden
        });
    }

    renderPagination('mainPanel', currentPage, filteredAndPagedTargets); // Render pagination controls
}

function renderArchivedTargets() {
    const archivedListDiv = document.getElementById('archivedList');
    archivedListDiv.innerHTML = '';
    let filteredAndPagedArchivedTargets = [...archivedTargets]; // Start with all archived

    // Filter by search term
    if (currentSearchTermArchived) {
        filteredAndPagedArchivedTargets = filterTargets(filteredAndPagedArchivedTargets, currentSearchTermArchived);
    }

    // Sort archived targets (e.g., by creation date descending, newest first)
    filteredAndPagedArchivedTargets.sort((a, b) =>
        (b.date instanceof Date ? b.date.getTime() : 0) - (a.date instanceof Date ? a.date.getTime() : 0)
    );

    // Pagination
    const startIndex = (currentArchivedPage - 1) * targetsPerPage;
    const endIndex = startIndex + targetsPerPage;
    const targetsToDisplay = filteredAndPagedArchivedTargets.slice(startIndex, endIndex);

    // Render
    if (targetsToDisplay.length === 0) {
        if (filteredAndPagedArchivedTargets.length > 0 && currentArchivedPage > 1) {
            currentArchivedPage = 1;
            renderArchivedTargets();
            return;
        } else {
            archivedListDiv.innerHTML = '<p>Nenhum alvo arquivado encontrado.</p>';
        }
    } else {
        targetsToDisplay.forEach((target) => {
             if (!target || !target.id) return; // Skip invalid
            const archivedDiv = document.createElement("div");
            archivedDiv.classList.add("target", "archived"); // Add 'archived' class for styling
            archivedDiv.dataset.targetId = target.id;

            const formattedDate = formatDateForDisplay(target.date);
            const elapsed = timeElapsed(target.date); // Time since creation
            const observations = Array.isArray(target.observations) ? target.observations : [];

            archivedDiv.innerHTML = `
                <h3>${target.title || 'Sem Título'}</h3>
                <p>${target.details || 'Sem Detalhes'}</p>
                <p><strong>Data Criação:</strong> ${formattedDate}</p>
                <p><strong>Tempo Decorrido (Criação):</strong> ${elapsed}</p>
                ${renderObservations(observations, false, target.id)} {/* Initially collapsed */}
                <div class="target-actions">
                    <button class="delete btn" onclick="deleteArchivedTarget('${target.id}')">Excluir Permanentemente</button>
                </div>
                 <div id="observationForm-${target.id}" class="add-observation-form" style="display:none;"></div>`; // Placeholder for obs form
            archivedListDiv.appendChild(archivedDiv);
             renderObservationForm(target.id); // Prepare form
        });
    }
    renderPagination('archivedPanel', currentArchivedPage, filteredAndPagedArchivedTargets);
}

function renderResolvedTargets() {
    const resolvedListDiv = document.getElementById('resolvedList');
    resolvedListDiv.innerHTML = '';
    let filteredAndPagedResolvedTargets = [...resolvedTargets]; // Already filtered in loadData

    // Filter by search term
    if (currentSearchTermResolved) {
        filteredAndPagedResolvedTargets = filterTargets(filteredAndPagedResolvedTargets, currentSearchTermResolved);
    }

    // Sort resolved targets by resolution date descending (most recent first)
    filteredAndPagedResolvedTargets.sort((a, b) =>
        (b.resolutionDate instanceof Date ? b.resolutionDate.getTime() : 0) - (a.resolutionDate instanceof Date ? a.resolutionDate.getTime() : 0)
    );

    // Pagination
    const startIndex = (currentResolvedPage - 1) * targetsPerPage;
    const endIndex = startIndex + targetsPerPage;
    const targetsToDisplay = filteredAndPagedResolvedTargets.slice(startIndex, endIndex);

    // Render
    if (targetsToDisplay.length === 0) {
         if (filteredAndPagedResolvedTargets.length > 0 && currentResolvedPage > 1) {
             currentResolvedPage = 1;
             renderResolvedTargets();
             return;
         } else {
             resolvedListDiv.innerHTML = '<p>Nenhum alvo respondido encontrado.</p>';
         }
    } else {
        targetsToDisplay.forEach((target) => {
            if (!target || !target.id) return; // Skip invalid
            const resolvedDiv = document.createElement("div");
            resolvedDiv.classList.add("target", "resolved"); // Add 'resolved' class for styling
            resolvedDiv.dataset.targetId = target.id;

            const formattedResolutionDate = formatDateForDisplay(target.resolutionDate);
            let totalTime = 'N/A'; // Calculate time from creation to resolution
            if (target.date instanceof Date && target.resolutionDate instanceof Date) {
                 totalTime = timeElapsed(target.date, target.resolutionDate); // Use a modified timeElapsed or calculate here
                 let diffInSeconds = Math.floor((target.resolutionDate.getTime() - target.date.getTime()) / 1000);
                 if (diffInSeconds < 0) diffInSeconds = 0;
                 if (diffInSeconds < 60) totalTime = `${diffInSeconds} seg`;
                 else {
                     let diffInMinutes = Math.floor(diffInSeconds / 60);
                     if (diffInMinutes < 60) totalTime = `${diffInMinutes} min`;
                     else {
                         let diffInHours = Math.floor(diffInMinutes / 60);
                         if (diffInHours < 24) totalTime = `${diffInHours} hr`;
                         else {
                             let diffInDays = Math.floor(diffInHours / 24);
                             if (diffInDays < 30) totalTime = `${diffInDays} dias`;
                             else {
                                 let diffInMonths = Math.floor(diffInDays / 30.44);
                                 if (diffInMonths < 12) totalTime = `${diffInMonths} meses`;
                                 else {
                                     let diffInYears = Math.floor(diffInDays / 365.25); totalTime = `${diffInYears} anos`;
                                 }
                             }
                         }
                     }
                 }
            }

            const observations = Array.isArray(target.observations) ? target.observations : [];

            resolvedDiv.innerHTML = `
                <h3>${target.title || 'Sem Título'} (Respondido)</h3>
                <p>${target.details || 'Sem Detalhes'}</p>
                <p><strong>Data Respondido:</strong> ${formattedResolutionDate}</p>
                <p><strong>Tempo Total (Criação -> Resposta):</strong> ${totalTime}</p>
                ${renderObservations(observations, false, target.id)} {/* Initially collapsed */}
                 <div id="observationForm-${target.id}" class="add-observation-form" style="display:none;"></div>`; // Placeholder for obs form
            resolvedListDiv.appendChild(resolvedDiv);
             renderObservationForm(target.id); // Prepare form
        });
    }
    renderPagination('resolvedPanel', currentResolvedPage, filteredAndPagedResolvedTargets);
}

function renderPagination(panelId, currentPageVariable, targetsArray) {
    const paginationDiv = document.getElementById(`pagination-${panelId}`);
    if (!paginationDiv) {
        console.warn(`Pagination container not found for panel: ${panelId}`);
        return;
    }
    paginationDiv.innerHTML = ''; // Clear previous pagination
    const totalItems = targetsArray.length;
    const totalPages = Math.ceil(totalItems / targetsPerPage);

    if (totalPages <= 1) {
        paginationDiv.style.display = 'none'; // Hide pagination if only one page or less
        return;
    } else {
        paginationDiv.style.display = 'flex'; // Show pagination controls
        paginationDiv.style.justifyContent = 'space-between'; // Space out links and text
        paginationDiv.style.alignItems = 'center';
        paginationDiv.style.marginTop = '20px'; // Add some space above pagination
    }

    // Previous Button
    const prevLink = document.createElement('a');
    prevLink.href = '#';
    prevLink.innerHTML = '&laquo; Anterior'; // Using HTML entity for arrow
    prevLink.classList.add('page-link');
    if (currentPageVariable <= 1) {
        prevLink.classList.add('disabled'); // Style disabled link
        prevLink.style.pointerEvents = 'none';
        prevLink.style.opacity = '0.5';
    } else {
        prevLink.addEventListener('click', (event) => {
            event.preventDefault();
            handlePageChange(panelId, currentPageVariable - 1);
        });
    }
    paginationDiv.appendChild(prevLink);

    // Page Indicator
    const pageIndicator = document.createElement('span');
    pageIndicator.style.margin = '0 10px';
    pageIndicator.style.padding = '8px 0';
    pageIndicator.textContent = `Página ${currentPageVariable} de ${totalPages}`;
    paginationDiv.appendChild(pageIndicator);

    // Next Button
    const nextLink = document.createElement('a');
    nextLink.href = '#';
    nextLink.innerHTML = 'Próxima &raquo;'; // Using HTML entity for arrow
    nextLink.classList.add('page-link');
    if (currentPageVariable >= totalPages) {
        nextLink.classList.add('disabled'); // Style disabled link
        nextLink.style.pointerEvents = 'none';
        nextLink.style.opacity = '0.5';
    } else {
        nextLink.addEventListener('click', (event) => {
            event.preventDefault();
            handlePageChange(panelId, currentPageVariable + 1);
        });
    }
    paginationDiv.appendChild(nextLink);
}


function handlePageChange(panelId, newPage) {
    // Update the correct page variable based on the panelId
    if (panelId === 'mainPanel') {
        currentPage = newPage;
        renderTargets();
    } else if (panelId === 'archivedPanel') {
        currentArchivedPage = newPage;
        renderArchivedTargets();
    } else if (panelId === 'resolvedPanel') {
        currentResolvedPage = newPage;
        renderResolvedTargets();
    }

    // Scroll to the top of the relevant panel after page change
    const panelElement = document.getElementById(panelId);
    if (panelElement) {
        panelElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// --- Adição/Edição/Arquivamento ---
document.getElementById("prayerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) {
        alert("Você precisa estar logado para adicionar um alvo.");
        return;
    }
    const uid = user.uid;

    const title = document.getElementById("title").value.trim();
    const details = document.getElementById("details").value.trim();
    const dateInput = document.getElementById("date").value; // YYYY-MM-DD from input
    const hasDeadline = document.getElementById("hasDeadline").checked;
    const deadlineDateInput = document.getElementById("deadlineDate").value; // YYYY-MM-DD from input

    if (!title || !dateInput) {
        alert("Título e Data de Criação são obrigatórios.");
        return;
    }

    // Convert date strings to UTC Date objects
    const dateUTC = createUTCDate(dateInput);
    if (!dateUTC) {
        alert("Data de criação inválida. Use o formato AAAA-MM-DD.");
        return;
    }

    let deadlineDateUTC = null;
    if (hasDeadline) {
        if (!deadlineDateInput) {
            alert("Se um prazo for definido, a Data do Prazo de Validade é obrigatória.");
            return;
        }
        deadlineDateUTC = createUTCDate(deadlineDateInput);
        if (!deadlineDateUTC) {
            alert("Data do Prazo de Validade inválida. Use o formato AAAA-MM-DD.");
            return;
        }
        // Optional: Validate deadline is not before creation date
        if (deadlineDateUTC.getTime() < dateUTC.getTime()) {
             alert("O Prazo de Validade não pode ser anterior à Data de Criação.");
             return;
         }
    }

    // Prepare target object for Firestore (using Timestamps)
    const target = {
        title: title,
        details: details,
        date: Timestamp.fromDate(dateUTC), // Store as Timestamp
        hasDeadline: hasDeadline,
        deadlineDate: deadlineDateUTC ? Timestamp.fromDate(deadlineDateUTC) : null, // Store as Timestamp or null
        archived: false,
        resolved: false,
        resolutionDate: null,
        observations: [],
        userId: uid, // Store user ID for potential future rules/queries
        lastPresentedDate: null // Initialize lastPresentedDate
    };

    try {
        // Add to Firestore
        const docRef = await addDoc(collection(db, "users", uid, "prayerTargets"), target);
        console.log("Target added with ID: ", docRef.id);

        // Create local representation (rehydrated with Date objects)
        const newLocalTarget = rehydrateTargets([{ ...target, id: docRef.id }])[0];

        // Add to local array and re-sort
        prayerTargets.unshift(newLocalTarget); // Add to the beginning
        // Re-sort the local array to maintain order (newest first by default)
        prayerTargets.sort((a, b) => (b.date instanceof Date ? b.date.getTime() : 0) - (a.date instanceof Date ? a.date.getTime() : 0));

        // Reset form and UI
        document.getElementById("prayerForm").reset();
        document.getElementById('deadlineContainer').style.display = 'none'; // Hide deadline input
        document.getElementById('date').value = formatDateToISO(new Date()); // Reset date to today
        showPanel('mainPanel'); // Switch to the main list view
        currentPage = 1; // Go to the first page
        renderTargets(); // Re-render the main list

        alert('Alvo de oração adicionado com sucesso!');

    } catch (error) {
        console.error("Error adding prayer target: ", error);
        alert("Erro ao adicionar alvo de oração: " + error.message);
    }
});

window.markAsResolved = async function(targetId) {
    const user = auth.currentUser;
    if (!user) { alert("Erro: Usuário não autenticado."); return; }
    const userId = user.uid;

    const targetIndex = prayerTargets.findIndex(t => t.id === targetId);
    if (targetIndex === -1) {
        alert("Erro: Alvo não encontrado na lista ativa.");
        return;
    }
    const targetData = prayerTargets[targetIndex];

    // Confirm with the user
    if (!confirm(`Marcar o alvo "${targetData.title || targetId}" como respondido? Ele será movido para Arquivados.`)) {
        return;
    }

    const resolutionDate = Timestamp.fromDate(new Date()); // Use Timestamp for Firestore

    // References to active and archived documents
    const activeTargetRef = doc(db, "users", userId, "prayerTargets", targetId);
    const archivedTargetRef = doc(db, "users", userId, "archivedTargets", targetId);

    try {
        // Prepare data for the archived collection, converting Dates back to Timestamps
        const archivedData = {
            ...targetData,
            date: targetData.date instanceof Date ? Timestamp.fromDate(targetData.date) : targetData.date, // Ensure Timestamp
            deadlineDate: targetData.deadlineDate instanceof Date ? Timestamp.fromDate(targetData.deadlineDate) : targetData.deadlineDate, // Ensure Timestamp or null
            observations: Array.isArray(targetData.observations) ? targetData.observations.map(obs => ({
                ...obs,
                date: obs.date instanceof Date ? Timestamp.fromDate(obs.date) : obs.date // Ensure Timestamp or null
            })) : [],
            resolved: true, // Mark as resolved
            archived: true, // Mark as archived implicitly
            resolutionDate: resolutionDate, // Set resolution date
            archivedDate: resolutionDate // Can set archivedDate to resolutionDate too
        };
        // Remove potentially problematic fields if they exist from spread
        delete archivedData.id; // Don't store the ID within the document data itself usually
        delete archivedData.status; // If status was added locally

        // Use a batch write to delete from active and add to archived atomically
        const batch = writeBatch(db);
        batch.delete(activeTargetRef);       // Delete from prayerTargets
        batch.set(archivedTargetRef, archivedData); // Add to archivedTargets

        await batch.commit();
        console.log(`Target ${targetId} marked as resolved and moved to archived.`);

        // Update local state
        prayerTargets.splice(targetIndex, 1); // Remove from active local array

        const newArchivedLocal = rehydrateTargets([{ ...archivedData, id: targetId }])[0]; // Rehydrate with Dates
        archivedTargets.unshift(newArchivedLocal); // Add to beginning of local archived array
        // Re-sort archived and resolved lists
        archivedTargets.sort((a, b) => (b.date instanceof Date ? b.date.getTime() : 0) - (a.date instanceof Date ? a.date.getTime() : 0));
        resolvedTargets = archivedTargets.filter(t => t.resolved);
        resolvedTargets.sort((a, b) => (b.resolutionDate instanceof Date ? b.resolutionDate.getTime() : 0) - (a.resolutionDate instanceof Date ? a.resolutionDate.getTime() : 0));

        // Re-render relevant lists
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
    const user = auth.currentUser;
    if (!user) { alert("Erro: Usuário não autenticado."); return; }
    const userId = user.uid;

    const targetIndex = prayerTargets.findIndex(t => t.id === targetId);
    if (targetIndex === -1) {
        alert("Erro: Alvo não encontrado na lista ativa.");
        return;
    }
    const targetData = prayerTargets[targetIndex];

     // Confirm with the user
    if (!confirm(`Arquivar o alvo "${targetData.title || targetId}"? Ele será movido para Arquivados.`)) {
        return;
    }

    const archiveTimestamp = Timestamp.fromDate(new Date()); // Use Timestamp for Firestore

    // References
    const activeTargetRef = doc(db, "users", userId, "prayerTargets", targetId);
    const archivedTargetRef = doc(db, "users", userId, "archivedTargets", targetId);

    try {
        // Prepare data for archive, converting Dates to Timestamps
        const archivedData = {
            ...targetData,
             date: targetData.date instanceof Date ? Timestamp.fromDate(targetData.date) : targetData.date,
             deadlineDate: targetData.deadlineDate instanceof Date ? Timestamp.fromDate(targetData.deadlineDate) : targetData.deadlineDate,
             observations: Array.isArray(targetData.observations) ? targetData.observations.map(obs => ({
                 ...obs,
                 date: obs.date instanceof Date ? Timestamp.fromDate(obs.date) : obs.date
             })) : [],
             resolved: false, // Keep resolved as false unless explicitly marked
             archived: true, // Mark as archived
             resolutionDate: targetData.resolutionDate, // Keep existing resolution date if any (should be null here)
             archivedDate: archiveTimestamp // Set archive date
        };
        delete archivedData.id;
        delete archivedData.status;

        // Batch write
        const batch = writeBatch(db);
        batch.delete(activeTargetRef);
        batch.set(archivedTargetRef, archivedData);
        await batch.commit();
        console.log(`Target ${targetId} archived.`);

        // Update local state
        prayerTargets.splice(targetIndex, 1); // Remove from active local

        const newArchivedLocal = rehydrateTargets([{ ...archivedData, id: targetId }])[0];
        archivedTargets.unshift(newArchivedLocal); // Add to local archived
        // Re-sort
        archivedTargets.sort((a, b) => (b.date instanceof Date ? b.date.getTime() : 0) - (a.date instanceof Date ? a.date.getTime() : 0));
        resolvedTargets = archivedTargets.filter(t => t.resolved); // Update resolved list too

        // Re-render
        renderTargets();
        renderArchivedTargets();
        renderResolvedTargets(); // Render resolved in case something changed (unlikely here)

        alert('Alvo arquivado com sucesso!');

    } catch (error) {
        console.error("Error archiving target: ", error);
        alert("Erro ao arquivar alvo: " + error.message);
    }
};

window.deleteArchivedTarget = async function(targetId) {
     const user = auth.currentUser;
     if (!user) { alert("Erro: Usuário não autenticado."); return; }
     const userId = user.uid;

     // Find target title for confirmation message
     const targetTitle = archivedTargets.find(t => t.id === targetId)?.title || targetId;

     if (!confirm(`Tem certeza que deseja excluir PERMANENTEMENTE o alvo arquivado "${targetTitle}"? Esta ação não pode ser desfeita.`)) {
        return;
     }

     const archivedTargetRef = doc(db, "users", userId, "archivedTargets", targetId);
     // Also delete associated click counts if they exist
     const clickCountsRef = doc(db, "prayerClickCounts", targetId);

     try {
         // Use a batch to delete both documents atomically
         const batch = writeBatch(db);
         batch.delete(archivedTargetRef);
         batch.delete(clickCountsRef); // Attempt to delete click counts too

         await batch.commit();
         console.log(`Archived target ${targetId} and its click counts permanently deleted.`);

         // Update local state
         const targetIndex = archivedTargets.findIndex(t => t.id === targetId);
         if (targetIndex !== -1) {
             archivedTargets.splice(targetIndex, 1);
         }
         // Update the resolved list as well
         resolvedTargets = archivedTargets.filter(target => target.resolved);
         resolvedTargets.sort((a, b) => (b.resolutionDate instanceof Date ? b.resolutionDate.getTime() : 0) - (a.resolutionDate instanceof Date ? a.resolutionDate.getTime() : 0));

         // Re-render relevant lists
         renderArchivedTargets();
         renderResolvedTargets();

         alert('Alvo excluído permanentemente!');

     } catch (error) {
         console.error("Error deleting archived target: ", error);
         alert("Erro ao excluir alvo arquivado: " + error.message);
     }
};

// --- Observações ---
window.toggleAddObservation = function(targetId) {
    const formDiv = document.getElementById(`observationForm-${targetId}`);
    if (!formDiv) {
        console.warn(`Observation form div not found for target ${targetId}`);
        return;
    }
    const isVisible = formDiv.style.display === 'block';
    formDiv.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) {
        // Focus the textarea when showing the form
        formDiv.querySelector('textarea')?.focus();
        // Ensure the date is set to today when opening
        try {
            const dateInput = formDiv.querySelector(`#observationDate-${targetId}`);
            if (dateInput && !dateInput.value) { // Only set if empty
                 dateInput.value = formatDateToISO(new Date());
            }
        } catch (e) { console.error("[toggleAddObservation] Error setting default date:", e); }
    }
};

function renderObservationForm(targetId) {
    const formDiv = document.getElementById(`observationForm-${targetId}`);
    if (!formDiv) return; // Should exist from main render functions

    // Populate the innerHTML for the observation form
    formDiv.innerHTML = `
        <textarea id="observationText-${targetId}" placeholder="Nova observação..." rows="3" style="width: 95%; margin-bottom: 5px;"></textarea>
        <input type="date" id="observationDate-${targetId}" style="width: 95%; margin-bottom: 5px;">
        <button class="btn" onclick="saveObservation('${targetId}')" style="background-color: #7cb17c;">Salvar Observação</button>
    `;
    // Set default date when initially rendering the form structure
    try {
        document.getElementById(`observationDate-${targetId}`).value = formatDateToISO(new Date());
    } catch (e) {
        console.error("[renderObservationForm] Error setting default date:", e);
        document.getElementById(`observationDate-${targetId}`).value = ''; // Fallback to empty
    }
}

window.saveObservation = async function(targetId) {
    const observationText = document.getElementById(`observationText-${targetId}`)?.value.trim();
    const observationDateInput = document.getElementById(`observationDate-${targetId}`)?.value;

    if (!observationText || !observationDateInput) {
        alert('Texto e Data da observação são obrigatórios.');
        return;
    }

    const observationDateUTC = createUTCDate(observationDateInput);
    if (!observationDateUTC) {
        alert('Data da observação inválida. Use o formato AAAA-MM-DD.');
        return;
    }

    const user = auth.currentUser;
    if (!user) { alert("Erro: Usuário não autenticado."); return; }
    const userId = user.uid;

    // Determine if the target is in the active or archived list
    let targetRef;
    let targetList; // Reference to the local array (prayerTargets or archivedTargets)
    let targetIndex = prayerTargets.findIndex(t => t.id === targetId);
    let isArchived = false;

    if (targetIndex !== -1) {
        // Target found in active list
        targetRef = doc(db, "users", userId, "prayerTargets", targetId);
        targetList = prayerTargets;
    } else {
        // Target not in active list, check archived list
        targetIndex = archivedTargets.findIndex(t => t.id === targetId);
        if (targetIndex !== -1) {
            // Target found in archived list
            targetRef = doc(db, "users", userId, "archivedTargets", targetId);
            targetList = archivedTargets;
            isArchived = true;
        } else {
            // Target not found anywhere
            alert("Erro: Alvo não encontrado.");
            console.error(`Target with ID ${targetId} not found in local arrays.`);
            return;
        }
    }

    // Prepare new observation object (use Timestamp for Firestore)
    const newObservation = {
        text: observationText,
        date: Timestamp.fromDate(observationDateUTC), // Store as Timestamp
        id: generateUniqueId(), // Generate a unique ID for the observation itself
        targetId: targetId // Link back to the parent target
    };

    try {
        // --- Update Firestore ---
        // Get the current data from Firestore first to safely update the array
        const targetDocSnap = await getDoc(targetRef);
        if (!targetDocSnap.exists()) {
            // This should ideally not happen if the target exists locally, but good to check
            throw new Error("Target document does not exist in Firestore.");
        }

        const currentData = targetDocSnap.data();
        const currentObservations = currentData.observations || []; // Get existing observations or start with empty array

        // Add the new observation
        currentObservations.push(newObservation);

        // Sort observations by date descending (most recent first) based on Timestamp seconds
        currentObservations.sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));

        // Update the document in Firestore with the modified observations array
        await updateDoc(targetRef, { observations: currentObservations });
        console.log(`Observation added to target ${targetId} in Firestore.`);

        // --- Update Local State ---
        const currentTargetLocal = targetList[targetIndex];
        if (!currentTargetLocal.observations || !Array.isArray(currentTargetLocal.observations)) {
            currentTargetLocal.observations = []; // Ensure local observations array exists
        }

        // Add the new observation to local state (rehydrated with Date object)
        const newLocalObservation = { ...newObservation, date: newObservation.date.toDate() };
        currentTargetLocal.observations.push(newLocalObservation);

        // Sort local observations by Date object time descending
        currentTargetLocal.observations.sort((a, b) => (b.date instanceof Date ? b.date.getTime() : 0) - (a.date instanceof Date ? a.date.getTime() : 0));

        // --- Re-render UI ---
        if (isArchived) {
            renderArchivedTargets(); // Re-render the archived list
             // If the target is also in the resolved list, re-render that too
             if (resolvedTargets.some(rt => rt.id === targetId)) {
                 renderResolvedTargets();
             }
        } else {
            renderTargets(); // Re-render the active list
        }

        // --- Reset Form ---
        toggleAddObservation(targetId); // Hide the form
        document.getElementById(`observationText-${targetId}`).value = ''; // Clear the textarea
        // Date will reset to today next time it's opened by toggleAddObservation

    } catch (error) {
        console.error("Error saving observation:", error);
        alert("Erro ao salvar observação: " + error.message);
    }
};

function renderObservations(observations, isExpanded = false, targetId = null) {
    if (!Array.isArray(observations) || observations.length === 0) {
        return '<div class="observations"></div>'; // Return empty container if no observations
    }

    // Ensure observations are sorted (redundant if already sorted, but safe)
    observations.sort((a, b) => (b.date instanceof Date ? b.date.getTime() : 0) - (a.date instanceof Date ? a.date.getTime() : 0));

    const displayCount = isExpanded ? observations.length : 1; // Show 1 or all
    const visibleObservations = observations.slice(0, displayCount);
    const remainingCount = observations.length - displayCount;

    let observationsHTML = `<div class="observations">`; // Container div

    visibleObservations.forEach(observation => {
        // Ensure observation and its properties exist
        if (!observation || !observation.date) return;
        const formattedDate = formatDateForDisplay(observation.date);
        const text = observation.text || '(Observação vazia)'; // Handle empty text
        observationsHTML += `<p class="observation-item"><strong>${formattedDate}:</strong> ${text}</p>`;
    });

    // Add toggle button logic
    if (targetId && observations.length > 1) { // Only show toggle if more than 1 observation
        if (!isExpanded && remainingCount > 0) {
            // Show "Ver mais" button
            observationsHTML += `<a href="#" class="observations-toggle" onclick="window.toggleObservations('${targetId}', event); return false;">Ver mais ${remainingCount} observaç${remainingCount > 1 ? 'ões' : 'ão'}</a>`;
        } else if (isExpanded) {
            // Show "Ver menos" button
            observationsHTML += `<a href="#" class="observations-toggle" onclick="window.toggleObservations('${targetId}', event); return false;">Ver menos observações</a>`;
        }
    }

    observationsHTML += `</div>`; // Close container div
    return observationsHTML;
}

window.toggleObservations = function(targetId, event) {
    if (event) event.preventDefault(); // Prevent default link behavior

    const targetDiv = document.querySelector(`.target[data-target-id="${targetId}"]`);
    if (!targetDiv) {
        console.warn(`Target div not found for toggleObservations: ${targetId}`);
        return;
    }

    const observationsContainer = targetDiv.querySelector('.observations');
    if (!observationsContainer) {
        console.warn(`Observations container not found for toggleObservations: ${targetId}`);
        return;
    }

    // Determine if currently expanded by checking the button text
    const isCurrentlyExpanded = observationsContainer.querySelector('.observations-toggle')?.textContent.includes('Ver menos');

    // Find the target data in the correct local array
    const target = prayerTargets.find(t => t.id === targetId) || archivedTargets.find(t => t.id === targetId);

    if (!target) {
        console.warn(`Target data not found locally for toggleObservations: ${targetId}`);
        return;
    }

    // Re-render the observations section with the opposite expanded state
    const newObservationsHTML = renderObservations(target.observations || [], !isCurrentlyExpanded, targetId);

    // Replace the existing observations container with the new HTML
    observationsContainer.outerHTML = newObservationsHTML;
};


// --- Prazos (Deadlines) ---
document.getElementById('hasDeadline').addEventListener('change', function() {
    // Show/hide the deadline date input based on the checkbox state
    document.getElementById('deadlineContainer').style.display = this.checked ? 'block' : 'none';
    // If hiding, clear the date input value
    if (!this.checked) {
        document.getElementById('deadlineDate').value = '';
    }
});

function handleDeadlineFilterChange() {
    showDeadlineOnly = document.getElementById('showDeadlineOnly').checked;
    currentPage = 1; // Reset to first page when filter changes
    renderTargets();
}
function handleExpiredOnlyMainChange() {
    currentPage = 1; // Reset to first page when filter changes
    renderTargets();
}

// Function to periodically check for expired deadlines (optional, could be run on load)
function checkExpiredDeadlines() {
    const now = new Date();
    const todayUTCStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const expiredCount = prayerTargets.filter(target =>
        target.hasDeadline &&
        target.deadlineDate instanceof Date && // Ensure it's a valid Date
        !isNaN(target.deadlineDate) &&
        target.deadlineDate.getTime() < todayUTCStart.getTime()
    ).length;

    console.log(`[checkExpiredDeadlines] Found ${expiredCount} expired deadlines among active targets.`);
    // Potential UI update here, e.g., showing a notification badge
    // const expiredNotification = document.getElementById('expiredNotification');
    // if (expiredNotification) {
    //     expiredNotification.textContent = expiredCount > 0 ? `(${expiredCount} Vencidos)` : '';
    //     expiredNotification.style.display = expiredCount > 0 ? 'inline' : 'none';
    // }
}


window.editDeadline = function(targetId) { // Removed async as it doesn't await anything here
    const target = prayerTargets.find(t => t.id === targetId);
    if (!target) {
         alert("Erro: Alvo não encontrado para editar prazo.");
         return;
    }
    const targetDiv = document.querySelector(`.target[data-target-id="${targetId}"]`);
    if (!targetDiv) return;

    const editFormContainer = document.getElementById(`editDeadlineForm-${targetId}`);
    if (!editFormContainer) return; // Ensure the container exists

    // Toggle visibility
    const isVisible = editFormContainer.style.display === 'block';
    if (isVisible) {
        editFormContainer.style.display = 'none';
        return; // Hide if already visible
    }

    // Populate and show the form
    let currentDeadlineISO = '';
    if (target.deadlineDate instanceof Date && !isNaN(target.deadlineDate)) {
        currentDeadlineISO = formatDateToISO(target.deadlineDate); // Format existing deadline for input
    }

    editFormContainer.innerHTML = `
        <div style="background-color: #f0f0f0; padding: 10px; margin-top: 10px; border-radius: 5px; border: 1px solid #ccc;">
            <label for="editDeadlineInput-${targetId}" style="margin-right: 5px; display: block; margin-bottom: 5px;">Novo Prazo (deixe em branco para remover):</label>
            <input type="date" id="editDeadlineInput-${targetId}" value="${currentDeadlineISO}" style="margin-right: 5px; width: calc(100% - 22px);">
            <div style="margin-top: 10px;">
                 <button class="btn save-deadline-btn" onclick="saveEditedDeadline('${targetId}')" style="background-color: #4CAF50; margin-right: 5px;">Salvar Prazo</button>
                 <button class="btn cancel-deadline-btn" onclick="cancelEditDeadline('${targetId}')" style="background-color: #f44336;">Cancelar</button>
            </div>
        </div>`;

    editFormContainer.style.display = 'block'; // Show the form
    document.getElementById(`editDeadlineInput-${targetId}`)?.focus(); // Focus the input
};

window.saveEditedDeadline = async function(targetId) {
    const newDeadlineDateInput = document.getElementById(`editDeadlineInput-${targetId}`);
    if (!newDeadlineDateInput) return;

    const newDeadlineValue = newDeadlineDateInput.value; // YYYY-MM-DD string or empty
    let newDeadlineTimestamp = null;
    let newHasDeadline = false;

    if (newDeadlineValue) {
        // User selected a date
        const newDeadlineUTC = createUTCDate(newDeadlineValue);
        if (!newDeadlineUTC) {
            alert("Data do prazo inválida. Use o formato AAAA-MM-DD.");
            return;
        }
         // Optional: Validate against creation date
         const target = prayerTargets.find(t => t.id === targetId);
         if (target && target.date instanceof Date && newDeadlineUTC.getTime() < target.date.getTime()) {
             alert("O Prazo de Validade não pode ser anterior à Data de Criação.");
             return;
         }

        newDeadlineTimestamp = Timestamp.fromDate(newDeadlineUTC); // Convert to Timestamp for Firestore
        newHasDeadline = true;
    } else {
        // User left the date blank - confirm removal
        if (!confirm("Nenhuma data selecionada. Tem certeza que deseja remover o prazo deste alvo?")) {
            return; // User cancelled removal
        }
        // newDeadlineTimestamp remains null, newHasDeadline remains false
    }

    // Update Firestore and local state
    await updateDeadlineInFirestoreAndLocal(targetId, newDeadlineTimestamp, newHasDeadline);

    // Hide the form after saving
    cancelEditDeadline(targetId);
};

async function updateDeadlineInFirestoreAndLocal(targetId, newDeadlineTimestamp, newHasDeadline) {
     const user = auth.currentUser;
     if (!user) { alert("Erro: Usuário não autenticado."); return; }
     const userId = user.uid;
     const targetRef = doc(db, "users", userId, "prayerTargets", targetId);

     try {
         // Update Firestore document
         await updateDoc(targetRef, {
             deadlineDate: newDeadlineTimestamp, // Send Timestamp or null
             hasDeadline: newHasDeadline
         });
         console.log(`Deadline updated in Firestore for target ${targetId}`);

         // Update local state
         const targetIndex = prayerTargets.findIndex(target => target.id === targetId);
         if (targetIndex !== -1) {
             // Convert Timestamp back to Date for local state, or keep null
             prayerTargets[targetIndex].deadlineDate = newDeadlineTimestamp ? newDeadlineTimestamp.toDate() : null;
             prayerTargets[targetIndex].hasDeadline = newHasDeadline;
             console.log(`Deadline updated locally for target ${targetId}`);
         }

         // Re-render the list to show the changes
         renderTargets();
         alert('Prazo atualizado com sucesso!');

     } catch (error) {
         console.error(`Error updating deadline for ${targetId}:`, error);
         alert("Erro ao atualizar prazo: " + error.message);
     }
}

window.cancelEditDeadline = function(targetId) {
     const editFormContainer = document.getElementById(`editDeadlineForm-${targetId}`);
     if (editFormContainer) {
         editFormContainer.style.display = 'none'; // Hide the form
         editFormContainer.innerHTML = ''; // Clear content
     }
};

// --- Alvos Diários ---
async function loadDailyTargets() {
    const userId = auth.currentUser ? auth.currentUser.uid : null;
    if (!userId) {
        document.getElementById("dailyTargets").innerHTML = "<p>Faça login para ver os alvos diários.</p>";
        return;
    }

    const today = new Date();
    const todayStr = formatDateToISO(today); // YYYY-MM-DD format
    const dailyDocId = `${userId}_${todayStr}`; // Unique ID for today's list for this user
    const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);

    try {
        let dailyTargetsData;
        const dailySnapshot = await getDoc(dailyRef);

        if (!dailySnapshot.exists()) {
            // No document for today, generate new targets
            console.log(`[loadDailyTargets] Daily document for ${dailyDocId} not found, generating new targets.`);
            dailyTargetsData = await generateDailyTargets(userId, todayStr);
            // Save the newly generated list to Firestore
            await setDoc(dailyRef, dailyTargetsData);
            console.log(`[loadDailyTargets] Daily document ${dailyDocId} created successfully.`);
        } else {
            // Document exists, load it
            dailyTargetsData = dailySnapshot.data();
            console.log(`[loadDailyTargets] Daily document ${dailyDocId} loaded from Firestore.`);
        }

        // Validate data structure
        if (!dailyTargetsData || !Array.isArray(dailyTargetsData.targets)) {
            console.error("[loadDailyTargets] Invalid or missing daily targets data structure:", dailyTargetsData);
            document.getElementById("dailyTargets").innerHTML = "<p>Erro ao carregar alvos diários. Dados inválidos.</p>";
            return;
        }

        // Separate completed and pending target IDs from today's list
        const pendingTargetIds = dailyTargetsData.targets.filter(t => !t.completed).map(t => t.targetId);
        const completedTargetIds = dailyTargetsData.targets.filter(t => t.completed).map(t => t.targetId);
        console.log(`[loadDailyTargets] Pending: ${pendingTargetIds.length}, Completed: ${completedTargetIds.length}`);

        const allTargetIds = [...pendingTargetIds, ...completedTargetIds];

        if (allTargetIds.length === 0) {
            document.getElementById("dailyTargets").innerHTML = "<p>Nenhum alvo de oração selecionado para hoje.</p>";
            displayRandomVerse();
            return;
        }

        // Fetch details for these targets from the already loaded *active* prayer targets
        // We use the *local* prayerTargets array which is already rehydrated
        const targetsToDisplayDetails = prayerTargets.filter(pt => allTargetIds.includes(pt.id));

        // Split into pending and completed based on the daily list's state
        const pendingTargetsDetails = targetsToDisplayDetails.filter(t => pendingTargetIds.includes(t.id));
        const completedTargetsDetails = targetsToDisplayDetails.filter(t => completedTargetIds.includes(t.id));

        // Render the lists
        renderDailyTargets(pendingTargetsDetails, completedTargetsDetails);
        displayRandomVerse(); // Display a verse

    } catch (error) {
        console.error("[loadDailyTargets] General error loading/generating daily targets:", error);
        document.getElementById("dailyTargets").innerHTML = "<p>Erro ao carregar alvos diários. Tente atualizar a página.</p>";
    }
}

async function generateDailyTargets(userId, dateStr) {
    console.log(`[generateDailyTargets] Generating for ${userId} on ${dateStr}`);
    try {
        // Filter available targets: must be active (not archived/resolved)
        const availableTargets = prayerTargets.filter(t => t && t.id && !t.archived && !t.resolved);

        if (availableTargets.length === 0) {
            console.log("[generateDailyTargets] No active targets found to generate from.");
            return { userId, date: dateStr, targets: [] }; // Return empty list
        }

        // --- Logic to exclude targets completed yesterday ---
        const todayUTC = createUTCDate(dateStr);
        if (!todayUTC) {
            console.error("[generateDailyTargets] Could not parse today's date string:", dateStr);
            return { userId, date: dateStr, targets: [] };
        }
        const yesterdayUTC = new Date(todayUTC.getTime() - 24 * 60 * 60 * 1000); // Subtract one day
        const yesterdayStr = formatDateToISO(yesterdayUTC);
        const yesterdayDocId = `${userId}_${yesterdayStr}`;
        const yesterdayRef = doc(db, "dailyPrayerTargets", yesterdayDocId);
        let completedYesterdayIds = new Set(); // Use a Set for efficient lookup

        try {
            const yesterdaySnap = await getDoc(yesterdayRef);
            if (yesterdaySnap.exists()) {
                const yesterdayData = yesterdaySnap.data();
                if (yesterdayData && Array.isArray(yesterdayData.targets)) {
                    yesterdayData.targets.forEach(t => {
                        if (t.completed && t.targetId) {
                            completedYesterdayIds.add(t.targetId);
                        }
                    });
                     console.log(`[generateDailyTargets] Found ${completedYesterdayIds.size} targets completed yesterday.`);
                }
            }
        } catch (error) {
            // Log error but continue, as failing to get yesterday's data shouldn't block today's generation
            console.warn("[generateDailyTargets] Error fetching previous day's targets:", error);
        }

        // Filter out targets completed yesterday
        let pool = availableTargets.filter(target => !completedYesterdayIds.has(target.id));
        console.log(`[generateDailyTargets] Pool size after excluding yesterday's completed: ${pool.length}`);

        // Handle cycle reset: if the pool is empty *but* there were available targets,
        // it means all available targets were completed yesterday. Reset the pool.
        if (pool.length === 0 && availableTargets.length > 0 && availableTargets.length === completedYesterdayIds.size) {
             console.log("[generateDailyTargets] All active targets completed yesterday. Restarting cycle with all active targets.");
             pool = [...availableTargets]; // Reset pool to all available targets
        } else if (pool.length === 0) {
            // Pool is empty and not because of cycle completion (e.g., user added targets today)
            console.log("[generateDailyTargets] No targets available in the pool today (either truly none or newly added). Selecting from all available.");
            pool = [...availableTargets]; // Fallback to using all available if pool calculation leads to zero unexpectedly
             if (pool.length === 0) { // Still zero? Then truly no targets.
                 console.log("[generateDailyTargets] Confirmed no active targets available.");
                 return { userId, date: dateStr, targets: [] };
             }
        }

        // Shuffle the pool and select targets
        const shuffledPool = pool.sort(() => 0.5 - Math.random()); // Simple shuffle
        const maxDailyTargets = 10; // Max number of targets per day
        const selectedTargets = shuffledPool.slice(0, Math.min(maxDailyTargets, pool.length));

        // Format for Firestore document
        const targetsForFirestore = selectedTargets.map(target => ({
            targetId: target.id,
            completed: false // Initially not completed
        }));

        // Update lastPresentedDate for the selected targets (async, but don't necessarily block return)
        updateLastPresentedDates(userId, selectedTargets).catch(err => {
            console.error("[generateDailyTargets] Background error updating lastPresentedDate:", err);
        });

        console.log(`[generateDailyTargets] Generated ${targetsForFirestore.length} daily targets for ${userId} on ${dateStr}.`);
        return { userId: userId, date: dateStr, targets: targetsForFirestore };

    } catch (error) {
        console.error("[generateDailyTargets] Error during generation process:", error);
        // Return empty list in case of error to prevent breaking UI
        return { userId: userId, date: dateStr, targets: [] };
    }
}


async function updateLastPresentedDates(userId, selectedTargets) {
    if (!selectedTargets || selectedTargets.length === 0) return;

    const batch = writeBatch(db);
    const nowTimestamp = Timestamp.fromDate(new Date()); // Use current timestamp

    selectedTargets.forEach(target => {
        if (target && target.id) {
            // Update the lastPresentedDate field in the *active* target document
            const targetRef = doc(db, "users", userId, "prayerTargets", target.id);
            batch.update(targetRef, { lastPresentedDate: nowTimestamp });
        }
    });

    try {
        await batch.commit();
        console.log(`[updateLastPresentedDates] Updated lastPresentedDate for ${selectedTargets.length} targets.`);
    } catch (error) {
        console.error("[updateLastPresentedDates] Error updating lastPresentedDate:", error);
        // Don't block user flow, but log the error
    }
}

function renderDailyTargets(pendingTargets, completedTargets) {
    const dailyTargetsDiv = document.getElementById("dailyTargets");
    dailyTargetsDiv.innerHTML = ''; // Clear previous content

    // Render Pending Targets
    if (pendingTargets.length === 0 && completedTargets.length === 0) {
        dailyTargetsDiv.innerHTML = "<p>Nenhum alvo de oração selecionado para hoje.</p>";
        return; // Nothing more to render
    }

    if (pendingTargets.length > 0) {
         // Optional: Add a sub-header for pending targets if needed
         // const pendingTitle = document.createElement('h3');
         // pendingTitle.textContent = "Para Orar Hoje";
         // pendingTitle.style.cssText = 'color:#555; font-size:1.1em; margin-top:10px; margin-bottom: 5px;';
         // dailyTargetsDiv.appendChild(pendingTitle);

        pendingTargets.forEach((target) => {
            if (!target || !target.id) return; // Skip invalid
            const dailyDiv = createTargetElement(target, false); // false = not completed
            addPrayButtonFunctionality(dailyDiv, target.id); // Add the "Orei!" button
            dailyTargetsDiv.appendChild(dailyDiv);
        });
    } else if (completedTargets.length > 0) {
         // If no pending but there are completed, show a message maybe?
         dailyTargetsDiv.innerHTML = "<p>Você já orou por todos os alvos de hoje!</p>";
    }


    // Render Completed Targets (if any)
    if (completedTargets.length > 0) {
        // Add a separator and title for completed section
        if (pendingTargets.length > 0 || dailyTargetsDiv.innerHTML === "<p>Você já orou por todos os alvos de hoje!</p>") { // Add separator if there were pending OR if the "all done" message is shown
             const separator = document.createElement('hr');
             separator.style.borderColor = '#ccc';
             separator.style.marginTop = '20px';
             separator.style.marginBottom = '15px';
             dailyTargetsDiv.appendChild(separator);
         }
         const completedTitle = document.createElement('h3');
         completedTitle.textContent = "Concluídos Hoje";
         completedTitle.style.cssText = 'color:#777; font-size:1.1em; margin-top:15px; margin-bottom: 5px;'; // Adjusted styles
         dailyTargetsDiv.appendChild(completedTitle);

        completedTargets.forEach((target) => {
             if (!target || !target.id) return; // Skip invalid
            const dailyDiv = createTargetElement(target, true); // true = completed
            // Optional: Add a visual cue like a checkmark or different styling via CSS class '.completed-target'
            dailyTargetsDiv.appendChild(dailyDiv);
        });
    }

    // Show completion popup only if there are no pending targets AND there are completed targets
    if (pendingTargets.length === 0 && completedTargets.length > 0) {
        displayCompletionPopup();
    }
}


function createTargetElement(target, isCompleted) {
    const dailyDiv = document.createElement("div");
    dailyDiv.classList.add("target"); // Base class for styling
    if (isCompleted) {
        dailyDiv.classList.add("completed-target"); // Specific class for completed styling
    }
    dailyDiv.dataset.targetId = target.id; // Store ID

    // Deadline tag (consistent with main list)
    const deadlineTag = (target.hasDeadline && target.deadlineDate)
        ? `<span class="deadline-tag ${isDateExpired(target.deadlineDate) ? 'expired' : ''} ${isCompleted ? 'completed' : ''}">${formatDateForDisplay(target.deadlineDate)}</span>`
        : '';

    // Observations (initially collapsed)
    const observationsHTML = renderObservations(target.observations || [], false, target.id);

    // Basic target info
    dailyDiv.innerHTML = `
        <h3>${deadlineTag ? `Prazo: ${deadlineTag}` : ''} ${target.title || 'Título Indisponível'}</h3>
        <p>${target.details || 'Detalhes Indisponíveis'}</p>
        <p><strong>Data Criação:</strong> ${formatDateForDisplay(target.date)}</p>
        <p><strong>Tempo Decorrido:</strong> ${timeElapsed(target.date)}</p>
        ${observationsHTML}
    `;
    // Note: "Orei!" button is added separately by addPrayButtonFunctionality

    return dailyDiv;
}

function addPrayButtonFunctionality(dailyDiv, targetId) {
    // Create the "Orei!" button
    const prayButton = document.createElement("button");
    prayButton.textContent = "Orei!";
    prayButton.classList.add("pray-button", "btn"); // Add classes for styling
    prayButton.dataset.targetId = targetId; // Associate button with target

    prayButton.onclick = async () => {
        const user = auth.currentUser;
        if (!user) {
            alert("Erro: Usuário não autenticado.");
            return;
        }
        const userId = user.uid;
        const todayStr = formatDateToISO(new Date());
        const dailyDocId = `${userId}_${todayStr}`;
        const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);

        // Disable button immediately to prevent double clicks
        prayButton.disabled = true;
        prayButton.textContent = "Orado!";
        prayButton.style.opacity = 0.6; // Visual feedback

        try {
            // Fetch the current daily document
            const dailySnap = await getDoc(dailyRef);
            if (!dailySnap.exists()) {
                // This should not happen if loadDailyTargets worked, but handle defensively
                console.error("Daily document not found when marking prayed:", dailyDocId);
                alert("Erro: Documento diário não encontrado. Tente atualizar.");
                // Re-enable button on error
                prayButton.disabled = false;
                prayButton.textContent = "Orei!";
                 prayButton.style.opacity = 1;
                return;
            }

            const dailyData = dailySnap.data();
            let targetUpdated = false;

            // Map over the targets array, updating the 'completed' status for the clicked target
            const updatedTargets = dailyData.targets.map(t => {
                if (t.targetId === targetId) {
                    targetUpdated = true;
                    return { ...t, completed: true }; // Mark as completed
                }
                return t; // Keep others as they are
            });

            if (!targetUpdated) {
                // Target ID wasn't found in today's list (should also not happen normally)
                console.warn(`Target ${targetId} not found in daily doc ${dailyDocId} during 'Orei!' click.`);
                // Still proceed to update clicks/weekly interaction, but don't update the daily doc
            }

            // --- Update Firestore ---
             // 1. Update the daily document with the new completion status (if target was found)
             if (targetUpdated) {
                 await updateDoc(dailyRef, { targets: updatedTargets });
                 console.log(`Daily target ${targetId} marked as completed in Firestore.`);
             }

             // 2. Update click counts AND weekly interaction chart data
             await updateClickCounts(userId, targetId); // This handles both counts and weekly chart

            // --- Update UI ---
            // Re-render the daily section to move the item visually
            await loadDailyTargets(); // Reload and re-render the daily list

        } catch (error) {
            console.error("Error registering 'Orei!' click:", error);
            alert("Erro ao registrar oração: " + error.message);
            // Re-enable button on error
            prayButton.disabled = false;
            prayButton.textContent = "Orei!";
            prayButton.style.opacity = 1;
        }
    };

     // Insert the button before the first child (usually the H3 title) of the target div
     if (dailyDiv.firstChild) {
         dailyDiv.insertBefore(prayButton, dailyDiv.firstChild);
     } else {
         dailyDiv.appendChild(prayButton); // Fallback if div is empty
     }
}

// --- MODIFICADO --- updateClickCounts atualiza contagens E dados do QUADRO SEMANAL (`weeklyInteractions`)
async function updateClickCounts(userId, targetId) {
     // Reference for click counts (remains the same)
     const clickCountsRef = doc(db, "prayerClickCounts", targetId);
     const now = new Date();
     const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
     const year = now.getFullYear().toString();

     // Reference for weekly interactions (NEW/MODIFIED)
     const weeklyDocRef = doc(db, "weeklyInteractions", userId);
     const todayUTCStr = formatDateToISO(now); // YYYY-MM-DD for the key
     const weekId = getWeekIdentifier(now);     // YYYY-W## for the week ID

     try {
         // --- PART 1: Update Click Counts (as before) ---
         await setDoc(clickCountsRef, {
             targetId: targetId,
             userId: userId,
             totalClicks: increment(1),
             [`monthlyClicks.${yearMonth}`]: increment(1),
             [`yearlyClicks.${year}`]: increment(1)
             // Consider adding a lastClickTimestamp: Timestamp.fromDate(now) here if needed elsewhere
         }, { merge: true });
         console.log(`[updateClickCounts] Click count updated for target ${targetId}.`);

         // --- PART 2: Update Weekly Interaction Chart Data ---
          // Ensure local data structure exists
         weeklyPrayerData.interactions = weeklyPrayerData.interactions || {};

         // Check if the week has changed since last load/interaction
         if (weeklyPrayerData.weekId !== weekId) {
              console.log(`[updateClickCounts] Week changed during interaction from ${weeklyPrayerData.weekId} to ${weekId}. Clearing old weekly data.`);
              weeklyPrayerData.interactions = {}; // Clear local interactions
              weeklyPrayerData.weekId = weekId;   // Update local week ID
              // Prepare to save the new weekId and cleared interactions to Firestore
         }

         // Mark today as interacted if not already marked in the current week's data
         let weeklyDataNeedsUpdate = false;
         if (weeklyPrayerData.interactions[todayUTCStr] !== true) {
             weeklyPrayerData.interactions[todayUTCStr] = true;
             weeklyDataNeedsUpdate = true; // Mark that Firestore needs updating
             console.log(`[updateClickCounts] Marked ${todayUTCStr} as interacted for week ${weekId}.`);
         }

         // Save to Firestore *only if* the week changed OR today was newly marked
         if (weeklyDataNeedsUpdate || weeklyPrayerData.weekId !== weekId) {
             await setDoc(weeklyDocRef, {
                 weekId: weeklyPrayerData.weekId,         // Save current/new week ID
                 interactions: weeklyPrayerData.interactions // Save the updated interaction map
             }, { merge: false }); // Overwrite with current week's data (or use merge: true if preferred)
             console.log(`[updateClickCounts] Weekly interaction data updated in Firestore for week ${weekId}.`);
         }

         // Update the chart UI immediately
         updateWeeklyChart();

     } catch (error) {
         console.error(`[updateClickCounts] Error updating click count or weekly interaction for ${targetId}:`, error);
         // Don't re-throw usually, log and maybe alert user if critical
         // UI update for chart might still work if local data was updated before error
         updateWeeklyChart(); // Attempt to update chart UI even on error
     }
 }


// --- Perseverança (Barra de Progresso e Quadro Semanal) ---

// --- MODIFICADO --- Loads data ONLY for the progress bar, then calls loadWeeklyPrayerData
async function loadPerseveranceData(userId) {
    console.log(`[loadPerseveranceData] Loading PROGRESS BAR data for user ${userId}`);
    const perseveranceDocRef = doc(db, "perseveranceData", userId);
    try {
        const docSnap = await getDoc(perseveranceDocRef);
        if (docSnap.exists()) {
            perseveranceData = docSnap.data();
            // Convert Timestamp for lastInteractionDate (related to the bar)
            if (perseveranceData.lastInteractionDate instanceof Timestamp) {
                perseveranceData.lastInteractionDate = perseveranceData.lastInteractionDate.toDate();
            }
            // Ensure numbers are numbers
            perseveranceData.consecutiveDays = Number(perseveranceData.consecutiveDays) || 0;
            perseveranceData.recordDays = Number(perseveranceData.recordDays) || 0;
            console.log("[loadPerseveranceData] Progress bar data loaded:", perseveranceData);
        } else {
            // If no doc exists, initialize bar data locally
            console.log(`[loadPerseveranceData] No progress bar data found for ${userId}. Initializing locally.`);
            perseveranceData = { consecutiveDays: 0, lastInteractionDate: null, recordDays: 0 };
            // No need to save initial bar data until first confirmation
        }
        updatePerseveranceUI(); // Update the UI for the progress bar

        // Now, load the data for the weekly chart separately
        await loadWeeklyPrayerData(userId);

    } catch (error) {
        console.error("[loadPerseveranceData] Error loading progress bar data:", error);
         // Reset bar data locally on error
         perseveranceData = { consecutiveDays: 0, lastInteractionDate: null, recordDays: 0 };
         updatePerseveranceUI(); // Update UI to reflect reset state
         // Attempt to load weekly data even if bar fails
         try {
            await loadWeeklyPrayerData(userId);
         } catch (weeklyError) {
            console.error("[loadPerseveranceData] Error loading weekly data after bar error:", weeklyError);
             weeklyPrayerData = { weekId: getWeekIdentifier(new Date()), interactions: {} };
             resetWeeklyChart(); // Reset chart UI too
         }
    }
}

// --- NOVO --- Loads data ONLY for the weekly interaction chart
async function loadWeeklyPrayerData(userId) {
    console.log(`[loadWeeklyPrayerData] Loading WEEKLY CHART data for user ${userId}`);
    const weeklyDocRef = doc(db, "weeklyInteractions", userId); // Use the new collection
    try {
        const docSnap = await getDoc(weeklyDocRef);
        const today = new Date();
        const currentWeekId = getWeekIdentifier(today); // Get current week's ID

        if (docSnap.exists()) {
            weeklyPrayerData = docSnap.data();
             // Ensure interactions is an object
             weeklyPrayerData.interactions = weeklyPrayerData.interactions || {};

            // Check if the loaded data is for the current week
            if (weeklyPrayerData.weekId !== currentWeekId) {
                console.log(`[loadWeeklyPrayerData] Week changed from ${weeklyPrayerData.weekId} to ${currentWeekId}. Resetting interactions.`);
                // Reset interactions for the new week
                weeklyPrayerData = { weekId: currentWeekId, interactions: {} };
                // Save the reset state (new weekId, empty interactions) back to Firestore
                await setDoc(weeklyDocRef, weeklyPrayerData, { merge: false }); // Overwrite previous week's data
                console.log(`[loadWeeklyPrayerData] Reset weekly data saved for ${currentWeekId}.`);
            } else {
                 console.log("[loadWeeklyPrayerData] Weekly chart data loaded for current week:", weeklyPrayerData);
            }
        } else {
            // No document exists, initialize for the current week
            console.log(`[loadWeeklyPrayerData] No weekly data found for ${userId}. Initializing for ${currentWeekId}.`);
            weeklyPrayerData = { weekId: currentWeekId, interactions: {} };
            // Save the initial document to Firestore
            await setDoc(weeklyDocRef, weeklyPrayerData);
            console.log(`[loadWeeklyPrayerData] Initial weekly data saved for ${currentWeekId}.`);
        }
        updateWeeklyChart(); // Update the chart UI with loaded/initialized data

    } catch (error) {
        console.error("[loadWeeklyPrayerData] Error loading weekly chart data:", error);
        // Reset local weekly data on error
         weeklyPrayerData = { weekId: getWeekIdentifier(new Date()), interactions: {} };
         resetWeeklyChart(); // Reset the chart's visual state
    }
}


// --- MODIFICADO --- confirmPerseverance only affects the progress bar data
async function confirmPerseverance() {
    const user = auth.currentUser;
    if (!user) { alert("Erro: Usuário não autenticado."); return; }
    const userId = user.uid;

    const today = new Date();
    // Use UTC start of day for comparison to avoid timezone issues
    const todayUTCStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

    let lastInteractionUTCStart = null;
    // Ensure perseveranceData.lastInteractionDate is a valid Date before converting
    if (perseveranceData.lastInteractionDate instanceof Date && !isNaN(perseveranceData.lastInteractionDate)) {
        const li = perseveranceData.lastInteractionDate;
        lastInteractionUTCStart = new Date(Date.UTC(li.getUTCFullYear(), li.getUTCMonth(), li.getUTCDate()));
    }

    // Check if confirmation already happened today
    if (lastInteractionUTCStart && todayUTCStart.getTime() === lastInteractionUTCStart.getTime()) {
        alert("Perseverança já confirmada para hoje!");
        return;
    }

    // Calculate consecutive days based on *last confirmation date*
    let isConsecutive = false;
    if (lastInteractionUTCStart) {
        const expectedYesterdayUTCStart = new Date(todayUTCStart.getTime() - (24 * 60 * 60 * 1000)); // UTC milliseconds in a day
        if (lastInteractionUTCStart.getTime() === expectedYesterdayUTCStart.getTime()) {
            isConsecutive = true;
        }
    }

    // Update perseverance bar data
    perseveranceData.consecutiveDays = isConsecutive ? (perseveranceData.consecutiveDays || 0) + 1 : 1;
    perseveranceData.lastInteractionDate = todayUTCStart; // Store the UTC Date object locally
    perseveranceData.recordDays = Math.max(perseveranceData.recordDays || 0, perseveranceData.consecutiveDays);

    // Prepare data to save to Firestore (use Timestamp for date)
    const dataToSave = {
        consecutiveDays: perseveranceData.consecutiveDays,
        lastInteractionDate: Timestamp.fromDate(perseveranceData.lastInteractionDate), // Convert Date to Timestamp
        recordDays: perseveranceData.recordDays
    };

    try {
        // Save *only* perseverance bar data to the 'perseveranceData' document
        const perseveranceDocRef = doc(db, "perseveranceData", userId);
        await setDoc(perseveranceDocRef, dataToSave, { merge: true }); // Merge to avoid overwriting unrelated fields if any

        console.log("[confirmPerseverance] Progress bar data updated:", dataToSave);
        updatePerseveranceUI(); // Update the progress bar display
        alert(`Perseverança confirmada! Dias consecutivos: ${perseveranceData.consecutiveDays}`);

    } catch (error) {
        console.error("[confirmPerseverance] Error updating Firestore:", error);
        alert("Erro ao salvar dados de perseverança: " + error.message);
        // Consider reverting local state changes if Firestore update fails?
    }
}

// --- MODIFICADO --- updatePerseveranceFirestore is no longer needed as saving happens in confirmPerseverance
// async function updatePerseveranceFirestore(userId, data) { ... } // REMOVED


// --- MODIFICADO --- updatePerseveranceUI only updates the BAR
function updatePerseveranceUI() {
     const consecutiveDays = perseveranceData.consecutiveDays || 0;
     const recordDays = perseveranceData.recordDays || 0; // Get record for potential display
     const targetDays = 30; // Or make this configurable
     const percentage = Math.min((consecutiveDays / targetDays) * 100, 100);

     const progressBar = document.getElementById('perseveranceProgressBar');
     const percentageDisplay = document.getElementById('perseverancePercentage');
     // Optional: Display record days
     // const recordDisplay = document.getElementById('perseveranceRecord');

     if (progressBar && percentageDisplay) {
         progressBar.style.width = `${percentage}%`;
         percentageDisplay.textContent = `${consecutiveDays} / ${targetDays} dias`; // Show days instead of %
         // Update title attribute for hover info (shows percentage and record)
         progressBar.parentElement.title = `Progresso: ${Math.round(percentage)}% (${consecutiveDays} dias consecutivos)\nRecorde: ${recordDays} dias`;
     }

     // if (recordDisplay) {
     //     recordDisplay.textContent = `Recorde: ${recordDays} dias`;
     // }
     console.log("[updatePerseveranceUI] Progress bar UI updated.");
     // DO NOT call updateWeeklyChart() here.
 }


// --- MODIFICADO --- resetPerseveranceUI resets BOTH local data structures and UI elements
function resetPerseveranceUI() {
    // Reset Progress Bar UI
    const progressBar = document.getElementById('perseveranceProgressBar');
    const percentageDisplay = document.getElementById('perseverancePercentage');
    if (progressBar && percentageDisplay) {
        progressBar.style.width = `0%`;
        percentageDisplay.textContent = `0 / 30 dias`; // Reset text
         progressBar.parentElement.title = ''; // Clear hover title
    }
    // Reset Progress Bar Local Data
    perseveranceData = { consecutiveDays: 0, lastInteractionDate: null, recordDays: 0 };
    console.log("[resetPerseveranceUI] Progress bar data and UI reset.");

    // Reset Weekly Chart Local Data
    weeklyPrayerData = { weekId: getWeekIdentifier(new Date()), interactions: {} };
    // Reset Weekly Chart UI
    resetWeeklyChart(); // Call the dedicated function to clear ticks
    console.log("[resetPerseveranceUI] Weekly chart data and UI reset.");
}

// --- MODIFICADO --- updateWeeklyChart reads from weeklyPrayerData
function updateWeeklyChart() {
    const today = new Date();
    // getDay() returns 0 for Sunday, 1 for Monday... 6 for Saturday
    const currentDayOfWeek = today.getDay(); // 0 = Sunday, ..., 6 = Saturday

    // Calculate the date of the Sunday of the current week (UTC)
    const firstDayOfWeek = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - currentDayOfWeek));
    firstDayOfWeek.setUTCHours(0, 0, 0, 0); // Ensure it's the start of the day

    // Get interactions from the dedicated weekly data structure
    const interactions = weeklyPrayerData.interactions || {};
    console.log("[updateWeeklyChart] Checking interactions for week:", weeklyPrayerData.weekId, "Data:", interactions);

    // Iterate through the 7 days of the week (0 = Sun, 6 = Sat)
    for (let i = 0; i < 7; i++) {
        const dayTick = document.getElementById(`day-${i}`); // Get the tick element by ID (day-0 to day-6)
        if (!dayTick) {
            console.warn(`[updateWeeklyChart] Tick element day-${i} not found.`);
            continue; // Skip if the HTML element doesn't exist
        }

        // Calculate the date for the current day (i) in the loop
        const currentDayInLoop = new Date(firstDayOfWeek);
        currentDayInLoop.setUTCDate(firstDayOfWeek.getUTCDate() + i);

        // Format this date to 'YYYY-MM-DD' to use as a key in the interactions map
        const dateStringUTC = formatDateToISO(currentDayInLoop);

        // Check if there's an interaction recorded for this date
        if (interactions[dateStringUTC] === true) {
            dayTick.classList.add('active'); // Add 'active' class to style the tick
            // console.log(`[updateWeeklyChart] Day ${i} (${dateStringUTC}) is ACTIVE.`);
        } else {
            dayTick.classList.remove('active'); // Remove 'active' class if no interaction
            // console.log(`[updateWeeklyChart] Day ${i} (${dateStringUTC}) is INACTIVE.`);
        }
    }
}

// --- NOVO ou Ajustado --- Function to visually clear chart ticks
function resetWeeklyChart() {
    for (let i = 0; i < 7; i++) {
        const dayTick = document.getElementById(`day-${i}`);
        if (dayTick) {
            dayTick.classList.remove('active'); // Remove active class from all ticks
        }
    }
    console.log("[resetWeeklyChart] Weekly chart ticks visually cleared.");
}


// --- Visualizações e Filtros ---
function generateViewHTML(targetsToInclude = lastDisplayedTargets) {
     // Basic HTML structure with styles
     let viewHTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Visualização de Alvos</title><style>body{font-family: sans-serif; margin: 20px; line-height: 1.5;} .target{border: 1px solid #ccc; padding: 15px; margin-bottom: 15px; border-radius: 5px; background-color: #fff;} h1{text-align:center; color: #333;} h3{margin-top:0; margin-bottom: 5px; color: #444;} p { margin: 4px 0; color: #555;} strong{color: #333;} .deadline-tag{background-color: #ffcc00; color: #333; padding: 3px 8px; border-radius: 4px; font-size: 0.8em; margin-right: 5px; display: inline-block;} .deadline-tag.expired{background-color: #ff6666; color: #fff;} .observations { margin-top: 10px; padding-left: 15px; border-left: 2px solid #eee;} .observation-item{margin-left: 0; font-size: 0.9em; color: #555; padding-left: 0; border-left: none; margin-bottom: 5px;} .resolved{background-color:#eaffea; border-left: 5px solid #9cbe4a;} .completed-target{opacity: 0.8; border-left: 5px solid #b0b0b0;}</style></head><body><h1>Alvos de Oração (Visão Atual)</h1>`;

     if (!Array.isArray(targetsToInclude) || targetsToInclude.length === 0) {
         viewHTML += "<p style='text-align:center;'>Nenhum alvo para exibir na visão atual.</p>";
     } else {
         // Generate HTML for each target provided
         targetsToInclude.forEach(target => {
             if (target && target.id) { // Ensure target is valid
                 viewHTML += generateTargetViewHTML(target, false); // false = not specifically completed view
             }
         });
     }
     viewHTML += `</body></html>`;

     // Open in new tab
    const viewTab = window.open('', '_blank');
    if (viewTab) {
        viewTab.document.write(viewHTML);
        viewTab.document.close(); // Important to finalize rendering
    } else {
        alert('Seu navegador bloqueou a abertura de uma nova aba. Por favor, permita pop-ups para este site.');
    }
}

function generateDailyViewHTML() {
    let viewHTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Alvos do Dia</title><style>body{font-family: sans-serif; margin: 20px; line-height: 1.5;} .target{border: 1px solid #ccc; padding: 15px; margin-bottom: 15px; border-radius: 5px; background-color: #fff;} h1, h2 {text-align:center; color: #333;} h2 { margin-top: 25px; border-bottom: 1px solid #eee; padding-bottom: 5px;} h3{margin-top:0; margin-bottom: 5px; color: #444;} p { margin: 4px 0; color: #555;} strong{color: #333;} .deadline-tag{background-color: #ffcc00; color: #333; padding: 3px 8px; border-radius: 4px; font-size: 0.8em; margin-right: 5px; display: inline-block;} .deadline-tag.expired{background-color: #ff6666; color: #fff;} .observations { margin-top: 10px; padding-left: 15px; border-left: 2px solid #eee;} .observation-item{margin-left: 0; font-size: 0.9em; color: #555; padding-left: 0; border-left: none; margin-bottom: 5px;} .completed-target{background-color:#f0f0f0; border-left: 5px solid #9cbe4a;}</style></head><body><h1>Alvos do Dia</h1>`;

    const dailyTargetsDiv = document.getElementById('dailyTargets');
    let pendingCount = 0;
    let completedCount = 0;

    if (dailyTargetsDiv) {
        // Pending Targets
        viewHTML += `<h2>Pendentes</h2>`;
        const pendingDivs = dailyTargetsDiv.querySelectorAll('.target:not(.completed-target)');
        if (pendingDivs.length > 0) {
             pendingDivs.forEach(div => {
                 const targetId = div.dataset.targetId;
                 // Find the corresponding target data from the main prayerTargets list
                 const targetData = prayerTargets.find(t => t.id === targetId);
                 if (targetData) {
                     pendingCount++;
                     viewHTML += generateTargetViewHTML(targetData, false); // Render as standard target
                 }
             });
        }
        if (pendingCount === 0) {
             viewHTML += "<p style='text-align:center;'>Nenhum alvo pendente para hoje.</p>";
        }

        // Completed Targets
        viewHTML += `<hr style='margin: 25px 0;'/><h2>Concluídos Hoje</h2>`;
        const completedDivs = dailyTargetsDiv.querySelectorAll('.target.completed-target');
         if (completedDivs.length > 0) {
             completedDivs.forEach(div => {
                  const targetId = div.dataset.targetId;
                  const targetData = prayerTargets.find(t => t.id === targetId); // Find in active list still
                  if (targetData) {
                      completedCount++;
                      viewHTML += generateTargetViewHTML(targetData, true); // Render with completed styling hint
                  }
             });
         }
        if (completedCount === 0) {
             viewHTML += "<p style='text-align:center;'>Nenhum alvo concluído hoje.</p>";
        }

    } else {
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

function generateTargetViewHTML(target, isCompletedView = false) {
     if (!target || !target.id) return ''; // Basic validation

     const formattedDate = formatDateForDisplay(target.date);
     const elapsed = timeElapsed(target.date);
     let deadlineTag = '';
     if (target.hasDeadline && target.deadlineDate) {
         const formattedDeadline = formatDateForDisplay(target.deadlineDate);
         deadlineTag = `<span class="deadline-tag ${isDateExpired(target.deadlineDate) ? 'expired' : ''}">Prazo: ${formattedDeadline}</span>`;
     }

     // Get observations, ensuring it's an array
     const observations = Array.isArray(target.observations) ? target.observations : [];
     // Render observations expanded for the view
     const observationsHTML = renderObservations(observations, true, target.id); // Pass true to expand

     // Add class for completed styling if needed
     const completedClass = isCompletedView ? 'completed-target' : '';

     return `
         <div class="target ${completedClass}" data-target-id="${target.id}">
             <h3>${deadlineTag} ${target.title || 'Sem Título'}</h3>
             <p>${target.details || 'Sem Detalhes'}</p>
             <p><strong>Data Criação:</strong> ${formattedDate}</p>
             <p><strong>Tempo Decorrido:</strong> ${elapsed}</p>
             ${observationsHTML}
         </div>`;
}

// --- MODIFIED --- Generate Resolved View Fetches data based on date range
async function generateResolvedViewHTML(startDate, endDate) { // Expects local Date objects
    const user = auth.currentUser;
    if (!user) {
        alert("Você precisa estar logado para gerar esta visualização.");
        return;
    }
    const uid = user.uid;

    // Convert local start/end dates to UTC start-of-day Timestamps for Firestore query
    // Start Date: Use the beginning of the selected day (UTC)
    const startUTC = new Date(Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()));
    // End Date: Use the beginning of the *day after* the selected end date (UTC) to include the whole end day
    const endNextDay = new Date(endDate);
    endNextDay.setDate(endDate.getDate() + 1);
    const endUTCStartOfNextDay = new Date(Date.UTC(endNextDay.getFullYear(), endNextDay.getMonth(), endNextDay.getDate()));

    const startTimestamp = Timestamp.fromDate(startUTC);
    const endTimestamp = Timestamp.fromDate(endUTCStartOfNextDay); // Query up to, but not including, this timestamp

    console.log(`[generateResolvedViewHTML] Querying resolved targets between: ${startUTC.toISOString()} and ${endUTCStartOfNextDay.toISOString()}`);

    // Query the 'archivedTargets' collection
    const archivedRef = collection(db, "users", uid, "archivedTargets");
    const q = query(
        archivedRef,
        where("resolved", "==", true), // Filter for resolved targets
        where("resolutionDate", ">=", startTimestamp), // Resolution date >= start date
        where("resolutionDate", "<", endTimestamp),    // Resolution date < day after end date
        orderBy("resolutionDate", "desc") // Order by most recent resolution date
    );

    let filteredResolvedTargets = [];
    try {
        const querySnapshot = await getDocs(q);
        const rawTargets = [];
        querySnapshot.forEach((doc) => {
            rawTargets.push({ ...doc.data(), id: doc.id });
        });
        // Rehydrate the fetched targets (convert Timestamps to Dates)
        filteredResolvedTargets = rehydrateTargets(rawTargets);
        console.log(`[generateResolvedViewHTML] Found ${filteredResolvedTargets.length} resolved targets in the date range.`);

    } catch (error) {
        console.error("Error fetching resolved targets for view:", error);
        alert("Erro ao buscar alvos respondidos para o período selecionado: " + error.message);
        return; // Stop execution if fetch fails
    }

    // Build the HTML for the new tab
    let viewHTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Alvos Respondidos (${formatDateForDisplay(startDate)} - ${formatDateForDisplay(endDate)})</title><style>body{font-family: sans-serif; margin: 20px; line-height: 1.5;} .target{border: 1px solid #ccc; padding: 15px; margin-bottom: 15px; border-radius: 5px; background-color: #eaffea; border-left: 5px solid #9cbe4a;} h1, h2 {text-align:center; color: #333;} h2 { margin-top: 5px; margin-bottom: 20px; font-size: 1.2em; color: #555;} h3{margin-top:0; margin-bottom: 5px; color: #444;} p { margin: 4px 0; color: #555;} strong{color: #333;} .observations { margin-top: 10px; padding-left: 15px; border-left: 2px solid #c3e6cb;} .observation-item{margin-left: 0; font-size: 0.9em; color: #555; padding-left: 0; border-left: none; margin-bottom: 5px;} hr { border: 0; border-top: 1px solid #ccc; margin: 20px 0; }</style></head><body><h1>Alvos Respondidos</h1>`;
    viewHTML += `<h2>Período: ${formatDateForDisplay(startDate)} - ${formatDateForDisplay(endDate)}</h2><hr/>`;

     if (filteredResolvedTargets.length === 0) {
         viewHTML += "<p style='text-align:center;'>Nenhum alvo respondido encontrado neste período.</p>";
     } else {
         // Generate HTML for each resolved target found
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

function generateTargetViewHTMLForResolved(target) {
     if (!target || !target.id) return ''; // Basic validation

     const formattedResolutionDate = formatDateForDisplay(target.resolutionDate);
     let totalTime = 'N/A'; // Calculate time from creation to resolution

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

     const observations = Array.isArray(target.observations) ? target.observations : [];
     const observationsHTML = renderObservations(observations, true, target.id); // Show observations expanded

     return `
         <div class="target resolved">
             <h3>${target.title || 'Sem Título'} (Respondido)</h3>
             <p>${target.details || 'Sem Detalhes'}</p>
             <p><strong>Data Criação:</strong> ${formatDateForDisplay(target.date)}</p>
             <p><strong>Data Respondido:</strong> ${formattedResolutionDate}</p>
             <p><strong>Tempo Total (Criação -> Resposta):</strong> ${totalTime}</p>
             ${observationsHTML}
         </div>`;
}

// Helper for filtering targets based on search term
function filterTargets(targets, searchTerm) {
    if (!searchTerm) return targets; // Return all if search term is empty
    const lowerSearchTerm = searchTerm.toLowerCase();

    return targets.filter(target => {
         // Check title
         const titleMatch = target.title && target.title.toLowerCase().includes(lowerSearchTerm);
         // Check details
         const detailsMatch = target.details && target.details.toLowerCase().includes(lowerSearchTerm);
         // Check observations
         const observationMatch = Array.isArray(target.observations) && target.observations.some(obs =>
             obs && obs.text && obs.text.toLowerCase().includes(lowerSearchTerm)
         );
        // Return true if any field matches
        return titleMatch || detailsMatch || observationMatch;
    });
}

// Search input handlers
function handleSearchMain(event) {
    currentSearchTermMain = event.target.value;
    currentPage = 1; // Reset to page 1 on search
    renderTargets();
}
function handleSearchArchived(event) {
    currentSearchTermArchived = event.target.value;
    currentArchivedPage = 1; // Reset to page 1 on search
    renderArchivedTargets();
}
function handleSearchResolved(event) {
    currentSearchTermResolved = event.target.value;
    currentResolvedPage = 1; // Reset to page 1 on search
    renderResolvedTargets();
}

// Function to show/hide panels
function showPanel(panelIdToShow) {
    // List all panel IDs that might need hiding/showing
    const allPanels = ['appContent', 'dailySection', 'mainPanel', 'archivedPanel', 'resolvedPanel'];
    // IDs of elements shown only with dailySection
    const dailyRelatedElements = ['weeklyPerseveranceChart', 'perseveranceSection', 'sectionSeparator'];

    // Hide all main panels first
    allPanels.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    // Hide daily-related elements initially
     dailyRelatedElements.forEach(id => {
         const el = document.getElementById(id);
         if (el) el.style.display = 'none';
     });

    // Show the requested panel
    const panelToShow = document.getElementById(panelIdToShow);
    if (panelToShow) {
        panelToShow.style.display = 'block';
        console.log(`Showing panel: ${panelIdToShow}`);
    } else {
         console.warn(`Panel with ID ${panelIdToShow} not found.`);
         // Optionally show a default panel like 'dailySection' if requested one fails
         // document.getElementById('dailySection').style.display = 'block';
         // panelIdToShow = 'dailySection'; // Update the effective panel shown
    }

    // If the daily section is the one being shown, also show its related elements
    if (panelIdToShow === 'dailySection') {
        dailyRelatedElements.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'block';
        });
    }
     // No else needed, as they are hidden by default at the start of the function
}


// --- Versículos e Popups ---
const verses = [
    "“Entrega o teu caminho ao Senhor; confia nele, e ele tudo fará.” - Salmos 37:5",
    "“Não andeis ansiosos por coisa alguma; antes em tudo sejam os vossos pedidos conhecidos diante de Deus pela oração e súplica com ações de graças; e a paz de Deus, que excede todo o entendimento, guardará os vossos corações e os vossos pensamentos em Cristo Jesus.” - Filipenses 4:6-7",
    "“Orai sem cessar.” - 1 Tessalonicenses 5:17",
    "“Confessai, pois, os vossos pecados uns aos outros, e orai uns pelos outros, para serdes curados. Muito pode, por sua eficácia, a súplica do justo.” - Tiago 5:16",
    "“E tudo quanto pedirdes em meu nome, eu o farei, para que o Pai seja glorificado no Filho.” - João 14:13",
    "“Pedi, e dar-se-vos-á; buscai, e encontrareis; batei, e abrir-se-vos-á. Pois todo o que pede, recebe; e quem busca, encontra; e a quem bate, abrir-se-lhe-á.” - Mateus 7:7-8",
    "“Se vós, pois, sendo maus, sabeis dar boas dádivas aos vossos filhos, quanto mais vosso Pai celestial dará o Espírito Santo àqueles que lho pedirem?” - Lucas 11:13",
    "“Este é o dia que o Senhor fez; regozijemo-nos e alegremo-nos nele.” - Salmos 118:24",
    "“Antes de clamarem, eu responderei; ainda não estarão falando, e eu já terei ouvido.” - Isaías 65:24",
    "“Clama a mim, e responder-te-ei, e anunciar-te-ei coisas grandes e ocultas, que não sabes.” - Jeremias 33:3"
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
        popup.style.display = 'flex'; // Use flex to center content vertically/horizontally if needed by CSS
        const popupVerseElement = popup.querySelector('#popupVerse');
        if (popupVerseElement) {
            // Display a random verse in the popup
            const randomIndex = Math.floor(Math.random() * verses.length);
            popupVerseElement.textContent = verses[randomIndex];
        }
    }
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("[DOMContentLoaded] DOM fully loaded. Setting up listeners.");

    // Set default date for new target form
    try {
        const dateInput = document.getElementById('date');
        if (dateInput) {
            dateInput.value = formatDateToISO(new Date());
        }
    } catch (e) {
        console.error("Error setting default date on DOMContentLoaded:", e);
    }

    // Firebase Auth State Change Listener (main entry point after login/logout)
    onAuthStateChanged(auth, (user) => {
        loadData(user); // Load data or clear UI based on auth state
    });

    // Search Inputs
    document.getElementById('searchMain')?.addEventListener('input', handleSearchMain);
    document.getElementById('searchArchived')?.addEventListener('input', handleSearchArchived);
    document.getElementById('searchResolved')?.addEventListener('input', handleSearchResolved);

    // Filter Checkboxes (Main Panel)
    document.getElementById('showDeadlineOnly')?.addEventListener('change', handleDeadlineFilterChange);
    document.getElementById('showExpiredOnlyMain')?.addEventListener('change', handleExpiredOnlyMainChange);

    // Authentication Buttons
    document.getElementById('btnEmailSignUp')?.addEventListener('click', signUpWithEmailPassword);
    document.getElementById('btnEmailSignIn')?.addEventListener('click', signInWithEmailPassword);
    document.getElementById('btnForgotPassword')?.addEventListener('click', resetPassword);
    document.getElementById('btnLogout')?.addEventListener('click', () => {
        signOut(auth).catch(error => console.error("Logout error:", error));
    });

    // Perseverance Button
    document.getElementById('confirmPerseveranceButton')?.addEventListener('click', confirmPerseverance);

    // Report Button (Redirect)
    document.getElementById("viewReportButton")?.addEventListener('click', () => {
        window.location.href = 'orei.html'; // Navigate to the report page
    });

    // Daily Targets Buttons
    document.getElementById("refreshDaily")?.addEventListener("click", async () => {
        const user = auth.currentUser;
        if (!user) { alert("Você precisa estar logado para atualizar."); return; }
        if (confirm("Isso gerará uma nova lista de alvos para hoje, potencialmente diferente da atual. Deseja continuar?")) {
            const userId = user.uid;
            const todayStr = formatDateToISO(new Date());
            const dailyDocId = `${userId}_${todayStr}`;
            const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);
            try {
                console.log("[Refresh Daily] Generating new targets...");
                // Force regeneration
                const newTargetsData = await generateDailyTargets(userId, todayStr);
                // Overwrite existing document for today
                await setDoc(dailyRef, newTargetsData);
                console.log("[Refresh Daily] New targets saved. Reloading list.");
                await loadDailyTargets(); // Reload and render the new list
                alert("Alvos do dia atualizados!");
            } catch (error) {
                console.error("Error refreshing daily targets:", error);
                alert("Erro ao atualizar alvos diários: " + error.message);
            }
        }
     });

     document.getElementById("copyDaily")?.addEventListener("click", () => {
        const dailyTargetsDiv = document.getElementById('dailyTargets');
        let textToCopy = 'Alvos de Oração Pendentes Hoje:\n\n';
        let count = 0;
        if (!dailyTargetsDiv) return;

        // Select only pending targets
        const targetDivs = dailyTargetsDiv.querySelectorAll('.target:not(.completed-target)');

        targetDivs.forEach((div) => {
            const titleElement = div.querySelector('h3');
            // Extract title text carefully, excluding deadline span if present
            const titleText = titleElement ? (titleElement.lastChild.textContent ? titleElement.lastChild.textContent.trim() : titleElement.textContent.trim()) : 'Sem Título';
            const detailsElement = div.querySelector('p:nth-of-type(1)'); // Assuming first <p> is details
            const detailsText = detailsElement ? detailsElement.textContent.trim() : 'Sem Detalhes';
            count++;
            textToCopy += `${count}. ${titleText}\n   ${detailsText}\n\n`;
        });

        if (count > 0) {
            navigator.clipboard.writeText(textToCopy.trim())
                .then(() => alert(`${count} alvo(s) pendente(s) copiado(s) para a área de transferência!`))
                .catch(err => {
                    console.error('Erro ao copiar para a área de transferência: ', err);
                    // Fallback for browsers that might fail
                    prompt("Falha ao copiar automaticamente. Copie manualmente:", textToCopy.trim());
                });
        } else {
            alert('Nenhum alvo pendente para copiar hoje.');
        }
     });

     // View Generation Buttons
     document.getElementById('generateViewButton')?.addEventListener('click', () => generateViewHTML(lastDisplayedTargets)); // View currently displayed on main panel
     document.getElementById('viewDaily')?.addEventListener('click', generateDailyViewHTML); // View daily list
     document.getElementById("viewResolvedViewButton")?.addEventListener("click", () => {
         // Show the date range modal
         const modal = document.getElementById("dateRangeModal");
         if(modal) modal.style.display = "block";
         // Set default dates in modal (e.g., last 30 days)
         const endDateInput = document.getElementById("endDate");
         const startDateInput = document.getElementById("startDate");
         if(endDateInput && startDateInput) {
             const today = new Date();
             const thirtyDaysAgo = new Date();
             thirtyDaysAgo.setDate(today.getDate() - 30);
             endDateInput.value = formatDateToISO(today);
             startDateInput.value = formatDateToISO(thirtyDaysAgo);
         }
     });

     // Popup Close Button
     document.getElementById('closePopup')?.addEventListener('click', () => {
         const popup = document.getElementById('completionPopup');
         if(popup) popup.style.display = 'none';
     });

     // Navigation Buttons (Show Panels)
    document.getElementById('backToMainButton')?.addEventListener('click', () => showPanel('dailySection')); // "Página Inicial" goes to Daily Section
    document.getElementById('addNewTargetButton')?.addEventListener('click', () => showPanel('appContent')); // "Novo" shows the add form
    document.getElementById('viewAllTargetsButton')?.addEventListener('click', () => { showPanel('mainPanel'); currentPage = 1; renderTargets(); }); // "Ver Todos" shows main list
    document.getElementById("viewArchivedButton")?.addEventListener("click", () => { showPanel('archivedPanel'); currentArchivedPage = 1; renderArchivedTargets(); });
    document.getElementById("viewResolvedButton")?.addEventListener("click", () => { showPanel('resolvedPanel'); currentResolvedPage = 1; renderResolvedTargets(); });


    // Date Range Modal Logic (for Resolved View)
    const dateRangeModal = document.getElementById("dateRangeModal");
    document.getElementById("closeDateRangeModal")?.addEventListener("click", () => {if(dateRangeModal) dateRangeModal.style.display = "none"});

    document.getElementById("generateResolvedView")?.addEventListener("click", () => {
        const startDateStr = document.getElementById("startDate").value;
        const endDateStr = document.getElementById("endDate").value;

        if (startDateStr && endDateStr) {
            // Parse dates from input (YYYY-MM-DD) - Treat as local dates
            // The generateResolvedViewHTML function will handle UTC conversion for the query
            const start = new Date(startDateStr + 'T00:00:00'); // Use local time T00:00:00
            const end = new Date(endDateStr + 'T00:00:00');     // Use local time T00:00:00

             if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                 alert("Datas selecionadas inválidas.");
                 return;
             }
             if (start > end) {
                 alert("A data de início não pode ser posterior à data de fim.");
                 return;
             }
            // Call the function to fetch data and generate the view
            generateResolvedViewHTML(start, end); // Pass local Date objects
            if(dateRangeModal) dateRangeModal.style.display = "none"; // Close modal on success
        } else {
            alert("Por favor, selecione as datas de início e fim.");
        }
    });

    document.getElementById("cancelDateRange")?.addEventListener("click", () => {if(dateRangeModal) dateRangeModal.style.display = "none"});

    // Close modal if clicking outside of it
    window.addEventListener('click', (event) => {
        if (event.target == dateRangeModal) {
             dateRangeModal.style.display = "none";
        }
    });

}); // End of DOMContentLoaded
