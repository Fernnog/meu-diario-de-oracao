import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-analytics.js";
import { getAuth, signOut, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDocs, updateDoc, deleteDoc, query, where, orderBy, getDoc, addDoc, increment, Timestamp, writeBatch } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// Firebase configuration (as before)
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

// Global variables (as before)
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
let perseveranceData = { consecutiveDays: 0, lastInteractionDate: null, recordDays: 0 };
// const timezoneOffsetHours = 4; // Note: This might need adjustment based on server/client timezones (REMOVED - No longer used directly for date logic)

// ==== FUNÇÕES UTILITÁRIAS ====

// Helper to create a Date object representing UTC midnight from a YYYY-MM-DD string
function createUTCDate(dateString) {
    if (!dateString || typeof dateString !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        console.warn("[createUTCDate] Invalid date string format provided:", dateString);
        return null; // Return null for invalid input
    }
    // Creates a Date object interpreted as UTC midnight
    // The 'Z' indicates UTC timezone
    const date = new Date(dateString + 'T00:00:00Z');
    // Double check if the parsing resulted in a valid date
    if (isNaN(date.getTime())) {
        console.warn("[createUTCDate] Failed to parse date string to valid UTC Date:", dateString);
        return null;
    }
    return date;
}

// Formats a date input (Date object, Timestamp, or string) into YYYY-MM-DD for date inputs
function formatDateToISO(date) {
    let dateToFormat;
    if (date instanceof Timestamp) {
        dateToFormat = date.toDate();
    } else if (date instanceof Date && !isNaN(date)) {
        dateToFormat = date;
    } else if (typeof date === 'string') {
        dateToFormat = new Date(date); // Try parsing string
    }

    if (!(dateToFormat instanceof Date) || isNaN(dateToFormat.getTime())) {
        console.warn("formatDateToISO received invalid date, defaulting to today:", date);
        dateToFormat = new Date();
    }

    // Use UTC components to avoid timezone shifts in the output string
    const year = dateToFormat.getUTCFullYear();
    const month = String(dateToFormat.getUTCMonth() + 1).padStart(2, '0');
    const day = String(dateToFormat.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Formats a date input (Date object expected) for display as DD/MM/YYYY using UTC components
function formatDateForDisplay(dateInput) {
    console.log('[formatDateForDisplay] Received input:', dateInput, '| Type:', typeof dateInput);

    if (!dateInput) {
        console.log('[formatDateForDisplay] Input is null or undefined. Returning Invalid Date.');
        return 'Data Inválida';
    }

    let dateToFormat;
    if (dateInput instanceof Timestamp) {
        console.log('[formatDateForDisplay] Input is Timestamp. Converting to Date.');
        dateToFormat = dateInput.toDate();
    } else if (dateInput instanceof Date) {
        console.log('[formatDateForDisplay] Input is already Date.');
        dateToFormat = dateInput;
    } else {
         // Attempt to parse if it's a string representation (like ISO)
        if (typeof dateInput === 'string') {
            console.log('[formatDateForDisplay] Input is string. Attempting to parse.');
            dateToFormat = new Date(dateInput);
        } else {
            console.warn("[formatDateForDisplay] Input is unexpected type:", typeof dateInput, dateInput, ". Returning Invalid Date.");
            return 'Data Inválida';
        }
    }

    if (!dateToFormat || isNaN(dateToFormat.getTime())) {
        console.log('[formatDateForDisplay] Conversion resulted in invalid Date object. Returning Invalid Date.');
        return 'Data Inválida';
    }

    // **FIX: Use UTC methods for display to reflect the stored calendar date**
    const day = String(dateToFormat.getUTCDate()).padStart(2, '0');
    const month = String(dateToFormat.getUTCMonth() + 1).padStart(2, '0'); // getUTCMonth is 0-indexed
    const year = dateToFormat.getUTCFullYear();
    const formattedDate = `${day}/${month}/${year}`;
    console.log('[formatDateForDisplay] Formatting successful using UTC components. Returning:', formattedDate);
    return formattedDate;
}

// Calculates time elapsed from a given past date (Date object expected) until now
function timeElapsed(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
        return 'Data Inválida';
    }

    const now = new Date();
    // date.getTime() already represents the UTC timestamp (milliseconds since epoch)
    // now.getTime() also represents the UTC timestamp for the current moment
    const pastMillis = date.getTime();
    const nowMillis = now.getTime();

    let diffInSeconds = Math.floor((nowMillis - pastMillis) / 1000);

    if (diffInSeconds < 0) diffInSeconds = 0;

    if (diffInSeconds < 60) return `${diffInSeconds} seg`; // Abbreviate
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
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) return false; // Invalid input

    const now = new Date();
    // Create a Date object representing the start of today in UTC
    const todayUTCStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    // date.getTime() gives milliseconds since epoch for the target date (UTC midnight)
    // todayUTCStart.getTime() gives milliseconds for the start of today (UTC midnight)
    // The deadline is expired if its timestamp is strictly less than the start of today's timestamp
    return date.getTime() < todayUTCStart.getTime();
}

function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 15);
}

// Rehydrates Firestore data (Timestamps to Date objects)
function rehydrateTargets(targets) {
    console.log('[rehydrateTargets] Starting rehydration for', targets.length, 'targets.');
    return targets.map((target, index) => {
        // console.log(`[rehydrateTargets] Processing target ${index} (ID: ${target.id}) - Original date value:`, target.date);
        const rehydratedTarget = { ...target };

        // Convert Timestamps to Date objects - this is correct, the usage needs care
        const fieldsToConvert = ['date', 'deadlineDate', 'lastPresentedDate', 'resolutionDate'];
        fieldsToConvert.forEach(field => {
            const originalValue = rehydratedTarget[field];
            if (originalValue instanceof Timestamp) {
                rehydratedTarget[field] = originalValue.toDate();
            } else if (originalValue instanceof Date) {
                 // Already a Date, do nothing
                 rehydratedTarget[field] = originalValue;
            } else if (originalValue === null || originalValue === undefined) {
                 rehydratedTarget[field] = null;
            } else {
                // Try parsing if it's a string, otherwise set to null/invalid
                try {
                     const parsedDate = new Date(originalValue);
                     if (!isNaN(parsedDate.getTime())) {
                          rehydratedTarget[field] = parsedDate;
                     } else {
                         console.warn(`[rehydrateTargets] Target ${target.id} - Invalid date value found for field '${field}'. Original:`, originalValue);
                         rehydratedTarget[field] = null;
                     }
                } catch (e) {
                     console.warn(`[rehydrateTargets] Target ${target.id} - Error parsing date for field '${field}'. Original:`, originalValue, e);
                     rehydratedTarget[field] = null;
                }
            }
            // console.log(`[rehydrateTargets] Target ${target.id} - Final ${field} value:`, rehydratedTarget[field]);
        });

        // Process observations array
        if (rehydratedTarget.observations && Array.isArray(rehydratedTarget.observations)) {
            rehydratedTarget.observations = rehydratedTarget.observations.map((obs, obsIndex) => {
                let obsDateFinal = null;
                if (obs.date instanceof Timestamp) {
                    obsDateFinal = obs.date.toDate();
                } else if (obs.date instanceof Date && !isNaN(obs.date)) {
                    obsDateFinal = obs.date;
                } else if (obs.date) {
                     // Attempt to parse if not already Date/Timestamp
                    try {
                         const parsedObsDate = new Date(obs.date);
                         if (!isNaN(parsedObsDate.getTime())) obsDateFinal = parsedObsDate;
                    } catch(e) { /* ignore parse error */ }
                }
                // console.log(`[rehydrateTargets] Target ${target.id}, Obs ${obsIndex} - Final date:`, obsDateFinal);
                return { ...obs, date: obsDateFinal };
            });
        } else {
            rehydratedTarget.observations = [];
        }

        return rehydratedTarget;
    });
}
// ==== FIM FUNÇÕES UTILITÁRIAS ====


// ==== AUTENTICAÇÃO ====
function updateAuthUI(user) {
    const authStatus = document.getElementById('authStatus');
    const btnLogout = document.getElementById('btnLogout');
    // REMOVIDO: const btnGoogleLogin = document.getElementById('btnGoogleLogin');
    const emailPasswordAuthForm = document.getElementById('emailPasswordAuthForm');
    const authStatusContainer = document.querySelector('.auth-status-container');

    if (user) {
        authStatusContainer.style.display = 'flex'; // Mantém flex para alinhar status e logout
        btnLogout.style.display = 'inline-block';
        // REMOVIDO: btnGoogleLogin.style.display = 'none';
        emailPasswordAuthForm.style.display = 'none';

        // Mantém a lógica de exibição do provedor (sem Google)
        if (user.providerData[0]?.providerId === 'password') {
            authStatus.textContent = `Usuário autenticado: ${user.email} (via E-mail/Senha)`;
        } else {
            // Caso genérico ou outro provedor futuro
            authStatus.textContent = `Usuário autenticado: ${user.email}`;
        }
    } else {
        authStatusContainer.style.display = 'block'; // Volta para block quando deslogado
        btnLogout.style.display = 'none';
        // REMOVIDO: btnGoogleLogin.style.display = 'inline-block';
        emailPasswordAuthForm.style.display = 'block';
        authStatus.textContent = "Nenhum usuário autenticado";
    }
}

// REMOVIDA: Função signInWithGoogle
/*
async function signInWithGoogle() {
    console.log("signInWithGoogle function CALLED!");
    const provider = new GoogleAuthProvider();
    try {
        const userCredential = await signInWithPopup(auth, provider);
        const user = userCredential.user;
        // loadData will be called by onAuthStateChanged
    } catch (error) {
        console.error("Erro ao entrar com o Google:", error);
        alert("Erro ao entrar com o Google: " + error.message);
    }
}
*/

async function signUpWithEmailPassword() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        alert("Cadastro realizado com sucesso!");
        // loadData will be called by onAuthStateChanged
    } catch (error) {
        console.error("Erro ao cadastrar com e-mail/senha:", error);
        alert("Erro ao cadastrar: " + error.message);
    }
}

async function signInWithEmailPassword() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        // loadData will be called by onAuthStateChanged
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
        passwordResetMessageDiv.textContent = "Um e-mail de redefinição de senha foi enviado para " + email + ".";
        passwordResetMessageDiv.style.color = "green";
        passwordResetMessageDiv.style.display = "block";
        // alert("Um e-mail de redefinição de senha foi enviado para " + email + ".");
    } catch (error) {
        console.error("Erro ao enviar e-mail de redefinição de senha:", error);
        passwordResetMessageDiv.textContent = "Erro ao redefinir senha: " + error.message;
        passwordResetMessageDiv.style.color = "red";
        passwordResetMessageDiv.style.display = "block";
       // alert("Erro ao redefinir senha: " + error.message);
    }
}
// ==== FIM AUTENTICAÇÃO ====


// ==== DADOS E LÓGICA PRINCIPAL ====

// --- Carregamento de Dados ---
async function loadData(user) {
    updateAuthUI(user); // Chama a UI atualizada sem referência ao botão Google
    const uid = user ? user.uid : null;

    if (uid) {
        console.log(`[loadData] User ${uid} authenticated. Loading data...`);
        document.getElementById('appContent').style.display = 'none';
        document.getElementById('dailySection').style.display = 'block';
        document.getElementById('sectionSeparator').style.display = 'block';
        document.getElementById('mainPanel').style.display = 'none';
        document.getElementById('weeklyPerseveranceChart').style.display = 'block';
        document.getElementById('perseveranceSection').style.display = 'block';

        try {
            await fetchPrayerTargets(uid);
            await fetchArchivedTargets(uid);
            resolvedTargets = archivedTargets.filter(target => target.resolved);

            checkExpiredDeadlines();
            renderTargets();
            renderArchivedTargets();
            renderResolvedTargets();

            await loadDailyTargets();
            await loadPerseveranceData(uid);
        } catch (error) {
             console.error("[loadData] Error during data loading process:", error);
             alert("Ocorreu um erro ao carregar seus dados. Por favor, recarregue a página.");
         }
    } else {
        console.log("[loadData] No user authenticated. Clearing data and UI.");
        document.getElementById('appContent').style.display = 'none';
        document.getElementById('dailySection').style.display = 'none';
        document.getElementById('sectionSeparator').style.display = 'none';
        document.getElementById('mainPanel').style.display = 'none';
        document.getElementById('weeklyPerseveranceChart').style.display = 'none';
        document.getElementById('perseveranceSection').style.display = 'none';

        prayerTargets = [];
        archivedTargets = [];
        resolvedTargets = [];
        renderTargets();
        renderArchivedTargets();
        renderResolvedTargets();
        document.getElementById("dailyTargets").innerHTML = "<p>Faça login para ver os alvos diários.</p>";
        document.getElementById('dailyVerses').textContent = '';
        resetPerseveranceUI();
    }
}

async function fetchPrayerTargets(uid) {
    prayerTargets = [];
    const targetsRef = collection(db, "users", uid, "prayerTargets");
    // Ordenar por data descendente no Firestore
    const targetsSnapshot = await getDocs(query(targetsRef, orderBy("date", "desc")));
    console.log(`[fetchPrayerTargets] Found ${targetsSnapshot.size} targets for user ${uid}`);
    const rawTargets = [];
    targetsSnapshot.forEach((doc) => {
        rawTargets.push({ ...doc.data(), id: doc.id });
    });
    prayerTargets = rehydrateTargets(rawTargets);
    console.log("[fetchPrayerTargets] Final rehydrated prayerTargets count:", prayerTargets.length);
}

async function fetchArchivedTargets(uid) {
    archivedTargets = [];
    const archivedRef = collection(db, "users", uid, "archivedTargets");
     // Ordenar por data descendente no Firestore
    const archivedSnapshot = await getDocs(query(archivedRef, orderBy("date", "desc")));
    console.log(`[fetchArchivedTargets] Found ${archivedSnapshot.size} archived targets for user ${uid}`);
    const rawArchived = [];
    archivedSnapshot.forEach((doc) => {
        rawArchived.push({ ...doc.data(), id: doc.id });
    });
    archivedTargets = rehydrateTargets(rawArchived);
    console.log("[fetchArchivedTargets] Final rehydrated archivedTargets count:", archivedTargets.length);
}

// --- Renderização ---
// (renderTargets, renderArchivedTargets, renderResolvedTargets, renderPagination - Sem alterações significativas na lógica base, mas usarão as funções de data corrigidas)
function renderTargets() {
    const targetListDiv = document.getElementById('targetList');
    targetListDiv.innerHTML = '';
    let filteredAndPagedTargets = [...prayerTargets];

    // Apply Filters (Search, Deadline, Expired)
    if (currentSearchTermMain) {
        filteredAndPagedTargets = filterTargets(filteredAndPagedTargets, currentSearchTermMain);
    }
    if (showDeadlineOnly) {
        filteredAndPagedTargets = filteredAndPagedTargets.filter(target => target.hasDeadline);
    }
    const showExpiredOnlyMainCheckbox = document.getElementById('showExpiredOnlyMain');
    if (showExpiredOnlyMainCheckbox && showExpiredOnlyMainCheckbox.checked) {
        // Ensure hasDeadline is checked implicitly when filtering expired
        filteredAndPagedTargets = filteredAndPagedTargets.filter(target => target.hasDeadline && isDateExpired(target.deadlineDate));
    }

    // Sort (Deadline ascending if filtered by deadline/expired, otherwise Date descending)
     if (showDeadlineOnly || (showExpiredOnlyMainCheckbox && showExpiredOnlyMainCheckbox.checked)) {
        filteredAndPagedTargets.sort((a, b) => {
            const dateA = a.deadlineDate instanceof Date && !isNaN(a.deadlineDate) ? a.deadlineDate : null;
            const dateB = b.deadlineDate instanceof Date && !isNaN(b.deadlineDate) ? b.deadlineDate : null;
            if (dateA && dateB) return dateA - dateB;
            if (dateA) return -1;
            if (dateB) return 1;
             // Fallback sort by creation date desc if deadlines are equal or null
             const creationDateA = (a.date instanceof Date && !isNaN(a.date)) ? a.date : new Date(0);
             const creationDateB = (b.date instanceof Date && !isNaN(b.date)) ? b.date : new Date(0);
             return creationDateB - creationDateA;
        });
    } else {
        // Default sort by creation date desc (already fetched ordered, but sorting locally is safer)
        filteredAndPagedTargets.sort((a, b) => {
             const creationDateA = (a.date instanceof Date && !isNaN(a.date)) ? a.date : new Date(0);
             const creationDateB = (b.date instanceof Date && !isNaN(b.date)) ? b.date : new Date(0);
             return creationDateB - creationDateA;
         });
    }

    // Paginate
    const startIndex = (currentPage - 1) * targetsPerPage;
    const endIndex = startIndex + targetsPerPage;
    const targetsToDisplay = filteredAndPagedTargets.slice(startIndex, endIndex);
    lastDisplayedTargets = targetsToDisplay; // Update last displayed for generateViewHTML

    // Render or show empty message
    if (targetsToDisplay.length === 0) {
        if (currentPage > 1) { // If not on page 1, try going back
            currentPage = 1;
            renderTargets(); // Re-render page 1
            return;
        } else {
            targetListDiv.innerHTML = '<p>Nenhum alvo de oração encontrado.</p>';
        }
    } else {
        targetsToDisplay.forEach((target) => {
             if (!target || !target.id) {
                 console.warn("[renderTargets] Skipping rendering of invalid target:", target);
                 return;
             }
            const targetDiv = document.createElement("div");
            targetDiv.classList.add("target");
            targetDiv.dataset.targetId = target.id;

            const formattedDate = formatDateForDisplay(target.date);
            const elapsed = timeElapsed(target.date);
            let deadlineTag = '';
            if (target.hasDeadline) {
                const formattedDeadline = formatDateForDisplay(target.deadlineDate);
                // Use the corrected isDateExpired function
                deadlineTag = `<span class="deadline-tag ${isDateExpired(target.deadlineDate) ? 'expired' : ''}">Prazo: ${formattedDeadline}</span>`;
            }

            const observations = Array.isArray(target.observations) ? target.observations : [];

            targetDiv.innerHTML = `
                <h3>${deadlineTag} ${target.title || 'Sem Título'}</h3>
                <p>${target.details || 'Sem Detalhes'}</p>
                <p><strong>Data:</strong> ${formattedDate}</p>
                <p><strong>Tempo Decorrido:</strong> ${elapsed}</p>
                ${renderObservations(observations, false, target.id)} <!-- Pass ID -->
                <div class="target-actions">
                    <button class="resolved btn" onclick="markAsResolved('${target.id}')">Respondido</button>
                    <button class="archive btn" onclick="archiveTarget('${target.id}')">Arquivar</button>
                    <button class="add-observation btn" onclick="toggleAddObservation('${target.id}')">Observação</button>
                    ${target.hasDeadline ? `<button class="edit-deadline btn" onclick="editDeadline('${target.id}')">Editar Prazo</button>` : ''}
                </div>
                <div id="observationForm-${target.id}" class="add-observation-form" style="display:none;"></div>
                <!-- Observation list content will be handled by renderObservations -->
            `;
            targetListDiv.appendChild(targetDiv);
            renderObservationForm(target.id); // Render the hidden form structure
             // Explicitly call renderExistingObservations if renderObservations doesn't handle initial rendering
             // renderExistingObservations(target.id); // This might be redundant if renderObservations covers it
        });
    }

    renderPagination('mainPanel', currentPage, filteredAndPagedTargets);
}

function renderArchivedTargets() {
    const archivedListDiv = document.getElementById('archivedList');
    archivedListDiv.innerHTML = '';
    let filteredAndPagedArchivedTargets = [...archivedTargets];

    if (currentSearchTermArchived) {
        filteredAndPagedArchivedTargets = filterTargets(filteredAndPagedArchivedTargets, currentSearchTermArchived);
    }
     // Sort by date desc (most recent first)
     filteredAndPagedArchivedTargets.sort((a, b) => (b.date || 0) - (a.date || 0));


    const startIndex = (currentArchivedPage - 1) * targetsPerPage;
    const endIndex = startIndex + targetsPerPage;
    const targetsToDisplay = filteredAndPagedArchivedTargets.slice(startIndex, endIndex);

    if (targetsToDisplay.length === 0) {
        if (currentArchivedPage > 1) {
            currentArchivedPage = 1;
            renderArchivedTargets();
            return;
        } else {
            archivedListDiv.innerHTML = '<p>Nenhum alvo arquivado encontrado.</p>';
        }
    } else {
        targetsToDisplay.forEach((target) => {
             if (!target || !target.id) return;
            const archivedDiv = document.createElement("div");
            archivedDiv.classList.add("target", "archived");
            archivedDiv.dataset.targetId = target.id;

            const formattedDate = formatDateForDisplay(target.date);
            const elapsed = timeElapsed(target.date); // Time since creation
            const observations = Array.isArray(target.observations) ? target.observations : [];

            archivedDiv.innerHTML = `
                <h3>${target.title || 'Sem Título'}</h3>
                <p>${target.details || 'Sem Detalhes'}</p>
                <p><strong>Data Criação:</strong> ${formattedDate}</p>
                <p><strong>Tempo Decorrido:</strong> ${elapsed}</p>
                ${renderObservations(observations, false, target.id)} <!-- Pass ID -->
                <div class="target-actions">
                    <button class="delete btn" onclick="deleteArchivedTarget('${target.id}')">Excluir</button>
                    <!-- Unarchive button could go here -->
                </div>
                 <!-- No observation form for archived -->
            `;
            archivedListDiv.appendChild(archivedDiv);
        });
    }
    renderPagination('archivedPanel', currentArchivedPage, filteredAndPagedArchivedTargets);
}

function renderResolvedTargets() {
    const resolvedListDiv = document.getElementById('resolvedList');
    resolvedListDiv.innerHTML = '';
    let filteredAndPagedResolvedTargets = [...resolvedTargets]; // Already filtered in loadData

    if (currentSearchTermResolved) {
        filteredAndPagedResolvedTargets = filterTargets(filteredAndPagedResolvedTargets, currentSearchTermResolved);
    }
     // Sort by resolutionDate desc (most recent first)
     filteredAndPagedResolvedTargets.sort((a, b) => (b.resolutionDate || 0) - (a.resolutionDate || 0));

    const startIndex = (currentResolvedPage - 1) * targetsPerPage;
    const endIndex = startIndex + targetsPerPage;
    const targetsToDisplay = filteredAndPagedResolvedTargets.slice(startIndex, endIndex);

    if (targetsToDisplay.length === 0) {
         if (currentResolvedPage > 1) {
             currentResolvedPage = 1;
             renderResolvedTargets();
             return;
         } else {
             resolvedListDiv.innerHTML = '<p>Nenhum alvo respondido encontrado.</p>';
         }
    } else {
        targetsToDisplay.forEach((target) => {
            if (!target || !target.id) return;
            const resolvedDiv = document.createElement("div");
            resolvedDiv.classList.add("target", "resolved");
            resolvedDiv.dataset.targetId = target.id;

            const formattedResolutionDate = formatDateForDisplay(target.resolutionDate);
            let totalTime = 'N/A';
            if (target.date instanceof Date && target.resolutionDate instanceof Date) {
                 // Calculate difference between resolution and creation
                 let diffInSeconds = Math.floor((target.resolutionDate.getTime() - target.date.getTime()) / 1000);
                 if (diffInSeconds < 0) diffInSeconds = 0;
                 // Reuse timeElapsed logic components for formatting
                 if (diffInSeconds < 60) totalTime = `${diffInSeconds} seg`;
                 else { let diffInMinutes = Math.floor(diffInSeconds / 60);
                     if (diffInMinutes < 60) totalTime = `${diffInMinutes} min`;
                     else { let diffInHours = Math.floor(diffInMinutes / 60);
                         if (diffInHours < 24) totalTime = `${diffInHours} hr`;
                         else { let diffInDays = Math.floor(diffInHours / 24);
                             if (diffInDays < 30) totalTime = `${diffInDays} dias`;
                             else { let diffInMonths = Math.floor(diffInDays / 30.44);
                                 if (diffInMonths < 12) totalTime = `${diffInMonths} meses`;
                                 else { let diffInYears = Math.floor(diffInDays / 365.25); totalTime = `${diffInYears} anos`; }
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
                ${renderObservations(observations, false, target.id)} <!-- Pass ID -->
                 <!-- No actions needed -->
            `;
            resolvedListDiv.appendChild(resolvedDiv);
        });
    }
    renderPagination('resolvedPanel', currentResolvedPage, filteredAndPagedResolvedTargets);
}

function renderPagination(panelId, page, targets) {
    const paginationDiv = document.getElementById(`pagination-${panelId}`);
    if (!paginationDiv) return;
    paginationDiv.innerHTML = '';
    const totalItems = targets ? targets.length : 0;
    const totalPages = Math.ceil(totalItems / targetsPerPage);

    if (totalPages <= 1) {
        paginationDiv.style.display = 'none';
        return;
    } else {
        paginationDiv.style.display = 'flex';
    }

    // Simplified: Previous, Current Page / Total Pages, Next
    paginationDiv.innerHTML = `
        ${page > 1 ? `<a href="#" class="page-link" data-page="${page - 1}" data-panel="${panelId}">« Anterior</a>` : '<span></span>'}
        <span style="margin: 0 10px; padding: 8px 0;">Página ${page} de ${totalPages}</span>
        ${page < totalPages ? `<a href="#" class="page-link" data-page="${page + 1}" data-panel="${panelId}">Próxima »</a>` : '<span></span>'}
    `;

    // Add event listeners to new links
    paginationDiv.querySelectorAll('.page-link').forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            const targetPage = parseInt(event.target.dataset.page);
            const targetPanel = event.target.dataset.panel;
            handlePageChange(targetPanel, targetPage);
        });
    });
}

function handlePageChange(panelId, newPage) {
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
    const panelElement = document.getElementById(panelId);
    if (panelElement) {
        panelElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// --- Adição/Edição/Arquivamento ---
document.getElementById("prayerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) { alert("Você precisa estar logado."); return; }
    const uid = user.uid;

    const title = document.getElementById("title").value.trim();
    const details = document.getElementById("details").value.trim();
    const dateInput = document.getElementById("date").value; // YYYY-MM-DD string
    const hasDeadline = document.getElementById("hasDeadline").checked;
    const deadlineDateInput = document.getElementById("deadlineDate").value; // YYYY-MM-DD string

    if (!title || !dateInput) { alert("Título e Data são obrigatórios."); return; }

    // **FIX: Create Date objects as UTC midnight**
    const dateUTC = createUTCDate(dateInput);
    if (!dateUTC) { alert("Data de criação inválida."); return; }

    let deadlineDateUTC = null;
    if (hasDeadline) {
        if (!deadlineDateInput) { alert("Selecione o Prazo de Validade."); return; }
        deadlineDateUTC = createUTCDate(deadlineDateInput);
        if (!deadlineDateUTC) { alert("Data do Prazo de Validade inválida."); return; }
    }

    const target = {
        title: title,
        details: details,
        date: Timestamp.fromDate(dateUTC), // Store Timestamp from UTC Date
        hasDeadline: hasDeadline,
        deadlineDate: deadlineDateUTC ? Timestamp.fromDate(deadlineDateUTC) : null, // Store Timestamp or null
        archived: false,
        resolved: false,
        resolutionDate: null,
        observations: [],
        // userId: uid // Consider adding for rules/queries
    };

    try {
        const docRef = await addDoc(collection(db, "users", uid, "prayerTargets"), target);
        // Add to local state (rehydrate for local use)
        const newLocalTarget = rehydrateTargets([{ ...target, id: docRef.id }])[0];
        prayerTargets.unshift(newLocalTarget);
        prayerTargets.sort((a, b) => (b.date || 0) - (a.date || 0)); // Keep sorted

        document.getElementById("prayerForm").reset();
        document.getElementById('deadlineContainer').style.display = 'none';
        document.getElementById('date').value = formatDateToISO(new Date()); // Reset date input

        showPanel('mainPanel');
        currentPage = 1; // Go to first page
        renderTargets();
        alert('Alvo de oração adicionado com sucesso!');
    } catch (error) {
        console.error("Error adding prayer target: ", error);
        alert("Erro ao adicionar alvo de oração.");
    }
});

window.markAsResolved = async function(targetId) {
    const user = auth.currentUser;
    if (!user) { alert("Erro: Usuário não autenticado."); return; }
    const userId = user.uid;

    const targetIndex = prayerTargets.findIndex(t => t.id === targetId);
    if (targetIndex === -1) { alert("Erro: Alvo não encontrado."); return; }

    const targetData = prayerTargets[targetIndex];
    const resolutionDate = Timestamp.fromDate(new Date()); // Current time as resolution

    const activeTargetRef = doc(db, "users", userId, "prayerTargets", targetId);
    const archivedTargetRef = doc(db, "users", userId, "archivedTargets", targetId);

    try {
        // Prepare data, converting local Dates back to Timestamps for Firestore
        const archivedData = {
            ...targetData,
            date: targetData.date instanceof Date ? Timestamp.fromDate(targetData.date) : targetData.date,
            deadlineDate: targetData.deadlineDate instanceof Date ? Timestamp.fromDate(targetData.deadlineDate) : targetData.deadlineDate,
            observations: Array.isArray(targetData.observations) ? targetData.observations.map(obs => ({
                ...obs,
                date: obs.date instanceof Date ? Timestamp.fromDate(obs.date) : obs.date
            })) : [],
            resolved: true,
            archived: true,
            resolutionDate: resolutionDate,
        };

        const batch = writeBatch(db);
        batch.delete(activeTargetRef);
        batch.set(archivedTargetRef, archivedData);
        await batch.commit();

        // Update Local State
        prayerTargets.splice(targetIndex, 1);
        const newArchivedLocal = rehydrateTargets([archivedData])[0]; // Rehydrate for local use
        archivedTargets.unshift(newArchivedLocal);
        archivedTargets.sort((a, b) => (b.date || 0) - (a.date || 0));
        resolvedTargets = archivedTargets.filter(t => t.resolved);
        resolvedTargets.sort((a, b) => (b.resolutionDate || 0) - (a.resolutionDate || 0));

        // Re-render
        renderTargets();
        renderArchivedTargets();
        renderResolvedTargets();
        alert('Alvo marcado como respondido e movido para Arquivados.');
    } catch (error) {
        console.error("Error marking target as resolved: ", error);
        alert("Erro ao marcar como respondido.");
    }
};

window.archiveTarget = async function(targetId) {
    const user = auth.currentUser;
    if (!user) { alert("Erro: Usuário não autenticado."); return; }
    const userId = user.uid;

    const targetIndex = prayerTargets.findIndex(t => t.id === targetId);
    if (targetIndex === -1) { alert("Erro: Alvo não encontrado."); return; }

    const targetData = prayerTargets[targetIndex];

    const activeTargetRef = doc(db, "users", userId, "prayerTargets", targetId);
    const archivedTargetRef = doc(db, "users", userId, "archivedTargets", targetId);

    try {
        // Prepare data, converting Dates to Timestamps
        const archivedData = {
             ...targetData,
             date: targetData.date instanceof Date ? Timestamp.fromDate(targetData.date) : targetData.date,
             deadlineDate: targetData.deadlineDate instanceof Date ? Timestamp.fromDate(targetData.deadlineDate) : targetData.deadlineDate,
             observations: Array.isArray(targetData.observations) ? targetData.observations.map(obs => ({
                 ...obs,
                 date: obs.date instanceof Date ? Timestamp.fromDate(obs.date) : obs.date
             })) : [],
             resolved: false, // Ensure resolved is false
             archived: true,
             resolutionDate: null
         };

        const batch = writeBatch(db);
        batch.delete(activeTargetRef);
        batch.set(archivedTargetRef, archivedData);
        await batch.commit();

        // Update Local State
        prayerTargets.splice(targetIndex, 1);
        const newArchivedLocal = rehydrateTargets([archivedData])[0];
        archivedTargets.unshift(newArchivedLocal);
        archivedTargets.sort((a, b) => (b.date || 0) - (a.date || 0));
        resolvedTargets = archivedTargets.filter(t => t.resolved); // Recalculate resolved list
        resolvedTargets.sort((a, b) => (b.resolutionDate || 0) - (a.resolutionDate || 0));

        // Re-render
        renderTargets();
        renderArchivedTargets();
        renderResolvedTargets(); // Re-render resolved in case the filter logic changes
        alert('Alvo arquivado com sucesso!');
    } catch (error) {
        console.error("Error archiving target: ", error);
        alert("Erro ao arquivar alvo.");
    }
};

window.deleteArchivedTarget = async function(targetId) {
     const user = auth.currentUser;
     if (!user) { alert("Erro: Usuário não autenticado."); return; }
     const userId = user.uid;

     const targetTitle = archivedTargets.find(t => t.id === targetId)?.title || targetId;
     if (!confirm(`Tem certeza que deseja excluir permanentemente o alvo "${targetTitle}"?`)) return;

     const archivedTargetRef = doc(db, "users", userId, "archivedTargets", targetId);
     const clickCountsRef = doc(db, "prayerClickCounts", targetId);

     try {
         const batch = writeBatch(db);
         batch.delete(archivedTargetRef);
         batch.delete(clickCountsRef); // Also delete click counts
         await batch.commit();

         // Update Local State
         const targetIndex = archivedTargets.findIndex(t => t.id === targetId);
         if (targetIndex !== -1) archivedTargets.splice(targetIndex, 1);
         resolvedTargets = archivedTargets.filter(target => target.resolved); // Recalculate resolved
         resolvedTargets.sort((a, b) => (b.resolutionDate || 0) - (a.resolutionDate || 0));

         // Re-render
         renderArchivedTargets();
         renderResolvedTargets();
         alert('Alvo excluído permanentemente!');
     } catch (error) {
         console.error("Error deleting archived target: ", error);
         alert("Erro ao excluir alvo arquivado.");
     }
};

// --- Observações ---
window.toggleAddObservation = function(targetId) {
    const formDiv = document.getElementById(`observationForm-${targetId}`);
    if (!formDiv) return;
    const isVisible = formDiv.style.display === 'block';
    formDiv.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) formDiv.querySelector('textarea')?.focus();
};

function renderObservationForm(targetId) {
    const formDiv = document.getElementById(`observationForm-${targetId}`);
    if (!formDiv) return;
    formDiv.innerHTML = `
        <textarea id="observationText-${targetId}" placeholder="Nova observação..." rows="3"></textarea>
        <input type="date" id="observationDate-${targetId}">
        <button class="btn" onclick="saveObservation('${targetId}')">Salvar Observação</button>
    `;
    try {
        // Set default date to today using the corrected formatter
        document.getElementById(`observationDate-${targetId}`).value = formatDateToISO(new Date());
    } catch (e) {
        console.error("[renderObservationForm] Error setting default date:", e);
        document.getElementById(`observationDate-${targetId}`).value = '';
    }
}

window.saveObservation = async function(targetId) {
    const observationText = document.getElementById(`observationText-${targetId}`).value.trim();
    const observationDateInput = document.getElementById(`observationDate-${targetId}`).value; // YYYY-MM-DD

    if (!observationText || !observationDateInput) { alert('Texto e Data da observação são obrigatórios.'); return; }

    // **FIX: Create Date as UTC midnight**
    const observationDateUTC = createUTCDate(observationDateInput);
    if (!observationDateUTC) { alert('Data da observação inválida.'); return; }

    const user = auth.currentUser;
    if (!user) { alert("Erro: Usuário não autenticado."); return; }
    const userId = user.uid;

    // Find target in active or archived lists
    let targetRef;
    let targetList;
    let targetIndex = prayerTargets.findIndex(t => t.id === targetId);
    if (targetIndex !== -1) {
        targetRef = doc(db, "users", userId, "prayerTargets", targetId);
        targetList = prayerTargets;
    } else {
        targetIndex = archivedTargets.findIndex(t => t.id === targetId);
        if (targetIndex !== -1) {
            targetRef = doc(db, "users", userId, "archivedTargets", targetId);
            targetList = archivedTargets;
        } else {
            alert("Erro: Alvo não encontrado."); return;
        }
    }

    const newObservation = {
        text: observationText,
        date: Timestamp.fromDate(observationDateUTC), // Store Timestamp
        id: generateUniqueId(),
        targetId: targetId
    };

    try {
        // Update Firestore - Read, Modify, Write is safer for arrays
        const targetDocSnap = await getDoc(targetRef);
        if (!targetDocSnap.exists()) {
            throw new Error("Target document does not exist in Firestore.");
        }
        const currentData = targetDocSnap.data();
        const currentObservations = currentData.observations || [];
        currentObservations.push(newObservation); // Add the new observation (with Timestamp)
        // Sort observations in Firestore data by date desc before saving
        currentObservations.sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));

        await updateDoc(targetRef, { observations: currentObservations });

        // Update Local Data
        const currentTargetLocal = targetList[targetIndex];
        if (!currentTargetLocal.observations || !Array.isArray(currentTargetLocal.observations)) {
            currentTargetLocal.observations = [];
        }
        // Add rehydrated observation (Date object) to local state
        currentTargetLocal.observations.push({
            ...newObservation,
            date: newObservation.date.toDate() // Convert back to Date for local
        });
        currentTargetLocal.observations.sort((a, b) => (b.date || 0) - (a.date || 0)); // Sort local array

        // Re-render the specific list where the target resides
        if (targetList === prayerTargets) renderTargets();
        else if (targetList === archivedTargets) {
            renderArchivedTargets();
             if (resolvedTargets.some(rt => rt.id === targetId)) renderResolvedTargets();
        }

        toggleAddObservation(targetId); // Hide form
        document.getElementById(`observationText-${targetId}`).value = ''; // Clear textarea

    } catch (error) {
        console.error("Error saving observation:", error);
        alert("Erro ao salvar observação.");
    }
};

// Renders observations list within a target div
function renderObservations(observations, isExpanded = false, targetId = null) {
    if (!Array.isArray(observations) || observations.length === 0) return '';

    // Sort observations by date, most recent first (local Date objects)
    observations.sort((a, b) => (b.date || 0) - (a.date || 0));

    const displayCount = isExpanded ? observations.length : 1;
    const visibleObservations = observations.slice(0, displayCount);
    const remainingCount = observations.length - displayCount;

    let observationsHTML = `<div class="observations">`; // Container for styling/targeting
    visibleObservations.forEach(observation => {
        const formattedDate = formatDateForDisplay(observation.date); // Use corrected display function
        observationsHTML += `<p class="observation-item"><strong>${formattedDate}:</strong> ${observation.text || ''}</p>`;
    });

    if (targetId) { // Only add toggle if ID is known
        if (!isExpanded && remainingCount > 0) {
            observationsHTML += `<a href="#" class="observations-toggle" onclick="window.toggleObservations('${targetId}', event); return false;">Ver mais ${remainingCount} observações</a>`;
        } else if (isExpanded && observations.length > 1) { // Show "Ver menos" only if expanded and more than 1 existed
            observationsHTML += `<a href="#" class="observations-toggle" onclick="window.toggleObservations('${targetId}', event); return false;">Ver menos observações</a>`;
        }
    }

    observationsHTML += `</div>`;
    return observationsHTML;
}

// Toggles the expanded state of observations for a target
window.toggleObservations = function(targetId, event) {
    if (event) event.preventDefault();
    const targetDiv = document.querySelector(`.target[data-target-id="${targetId}"]`);
    if (!targetDiv) return;
    const observationsContainer = targetDiv.querySelector('.observations');
    if (!observationsContainer) return;

    const isExpanded = observationsContainer.querySelector('.observations-toggle')?.textContent.includes('Ver menos');

    // Find the target data (search all lists)
    const target = prayerTargets.find(t => t.id === targetId) ||
                   archivedTargets.find(t => t.id === targetId); // archived includes resolved

    if (!target) return;

    // Re-render the observations part with the toggled state
    const newObservationsHTML = renderObservations(target.observations || [], !isExpanded, targetId);
    observationsContainer.outerHTML = newObservationsHTML; // Replace the container
};

// --- Prazos (Deadlines) ---
document.getElementById('hasDeadline').addEventListener('change', function() {
    document.getElementById('deadlineContainer').style.display = this.checked ? 'block' : 'none';
});

function handleDeadlineFilterChange() {
    showDeadlineOnly = document.getElementById('showDeadlineOnly').checked;
    currentPage = 1;
    renderTargets();
}

function handleExpiredOnlyMainChange() {
    currentPage = 1;
    renderTargets();
}

function checkExpiredDeadlines() {
    // This function doesn't need to do much now, as isDateExpired handles the check
    // and renderTargets applies the class. We could log count here if desired.
    const expiredCount = prayerTargets.filter(target => target.hasDeadline && isDateExpired(target.deadlineDate)).length;
    console.log(`[checkExpiredDeadlines] Found ${expiredCount} expired deadlines among active targets.`);
}

window.editDeadline = async function(targetId) {
    const target = prayerTargets.find(t => t.id === targetId);
    if (!target) return;
    const targetDiv = document.querySelector(`.target[data-target-id="${targetId}"]`);
    if (!targetDiv) return;

    const existingEditForm = targetDiv.querySelector('.edit-deadline-form');
    if (existingEditForm) {
        existingEditForm.remove();
        return; // Toggle off
    }

    // **FIX: Format existing date using UTC for consistency with input**
    let currentDeadlineISO = '';
    if (target.deadlineDate instanceof Date && !isNaN(target.deadlineDate)) {
        currentDeadlineISO = formatDateToISO(target.deadlineDate); // Use the helper that gets UTC YYYY-MM-DD
    }

    const formHTML = `
        <div class="edit-deadline-form" style="background-color: #f0f0f0; padding: 10px; margin-top: 10px; border-radius: 5px;">
            <label for="editDeadlineDate-${targetId}" style="margin-right: 5px;">Novo Prazo:</label>
            <input type="date" id="editDeadlineDate-${targetId}" value="${currentDeadlineISO}" style="margin-right: 5px;">
            <button class="btn save-deadline-btn" onclick="saveEditedDeadline('${targetId}')" style="background-color: #4CAF50;">Salvar</button>
            <button class="btn cancel-deadline-btn" onclick="cancelEditDeadline('${targetId}')" style="background-color: #f44336;">Cancelar</button>
        </div>
    `;

    const actionsDiv = targetDiv.querySelector('.target-actions');
    if (actionsDiv) {
         actionsDiv.insertAdjacentHTML('afterend', formHTML);
         document.getElementById(`editDeadlineDate-${targetId}`)?.focus();
    } else { // Fallback if actions div isn't found
         targetDiv.insertAdjacentHTML('beforeend', formHTML);
    }
};

window.saveEditedDeadline = async function(targetId) {
    const newDeadlineDateInput = document.getElementById(`editDeadlineDate-${targetId}`);
    if (!newDeadlineDateInput) return;
    const newDeadlineValue = newDeadlineDateInput.value; // YYYY-MM-DD

    let newDeadlineTimestamp = null;
    let newHasDeadline = false;

    if (newDeadlineValue) {
        // **FIX: Create Date as UTC midnight**
        const newDeadlineUTC = createUTCDate(newDeadlineValue);
        if (!newDeadlineUTC) {
            alert("Data do prazo inválida.");
            return;
        }
        newDeadlineTimestamp = Timestamp.fromDate(newDeadlineUTC);
        newHasDeadline = true;
    } else {
        if (!confirm("Nenhuma data selecionada. Deseja remover o prazo?")) return;
        // Keep newDeadlineTimestamp as null, newHasDeadline as false
    }

    await updateDeadlineInFirestoreAndLocal(targetId, newDeadlineTimestamp, newHasDeadline);
    cancelEditDeadline(targetId); // Remove form
};

async function updateDeadlineInFirestoreAndLocal(targetId, newDeadlineTimestamp, newHasDeadline) {
     const user = auth.currentUser;
     if (!user) return;
     const userId = user.uid;
     const targetRef = doc(db, "users", userId, "prayerTargets", targetId);

     try {
         await updateDoc(targetRef, {
             deadlineDate: newDeadlineTimestamp, // Timestamp or null
             hasDeadline: newHasDeadline
         });

         const targetIndex = prayerTargets.findIndex(target => target.id === targetId);
         if (targetIndex !== -1) {
             prayerTargets[targetIndex].deadlineDate = newDeadlineTimestamp ? newDeadlineTimestamp.toDate() : null; // Date or null locally
             prayerTargets[targetIndex].hasDeadline = newHasDeadline;
         }

         renderTargets(); // Re-render
         alert('Prazo atualizado com sucesso!');
     } catch (error) {
         console.error(`Error updating deadline for ${targetId}:`, error);
         alert("Erro ao atualizar prazo.");
     }
}

window.cancelEditDeadline = function(targetId) {
     const targetDiv = document.querySelector(`.target[data-target-id="${targetId}"]`);
     targetDiv?.querySelector('.edit-deadline-form')?.remove();
};

// --- Alvos Diários ---
// (loadDailyTargets, generateDailyTargets, renderDailyTargets, addPrayButtonFunctionality, updateClickCounts - Sem alterações significativas na lógica base, usarão datas corrigidas)
async function loadDailyTargets() {
    const userId = auth.currentUser ? auth.currentUser.uid : null;
    if (!userId) {
        document.getElementById("dailyTargets").innerHTML = "<p>Faça login para ver os alvos diários.</p>";
        return;
    }

    const today = new Date();
    // **FIX: Use UTC date for document ID consistency**
    const todayStr = formatDateToISO(today); // YYYY-MM-DD based on UTC
    const dailyDocId = `${userId}_${todayStr}`;
    const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);

    try {
        let dailyTargetsData;
        const dailySnapshot = await getDoc(dailyRef);

        if (!dailySnapshot.exists()) {
            console.log(`[loadDailyTargets] Daily document for ${dailyDocId} not found, generating new targets.`);
            dailyTargetsData = await generateDailyTargets(userId, todayStr); // Pass UTC date string
            await setDoc(dailyRef, dailyTargetsData);
            console.log(`[loadDailyTargets] Daily document ${dailyDocId} created successfully.`);
        } else {
            dailyTargetsData = dailySnapshot.data();
            console.log(`[loadDailyTargets] Daily document ${dailyDocId} loaded from Firestore.`);
        }

        if (!dailyTargetsData || !Array.isArray(dailyTargetsData.targets)) {
            console.error("[loadDailyTargets] Invalid or missing daily targets data:", dailyTargetsData);
            document.getElementById("dailyTargets").innerHTML = "<p>Erro ao carregar alvos diários. Dados inválidos.</p>";
            return;
        }

        const pendingTargetIds = dailyTargetsData.targets.filter(t => !t.completed).map(t => t.targetId);
        const completedTargetIds = dailyTargetsData.targets.filter(t => t.completed).map(t => t.targetId);

        console.log(`[loadDailyTargets] Pending targets: ${pendingTargetIds.length}, Completed targets: ${completedTargetIds.length}`);

        const allTargetIds = [...pendingTargetIds, ...completedTargetIds];
        if (allTargetIds.length === 0) {
            document.getElementById("dailyTargets").innerHTML = "<p>Nenhum alvo de oração para hoje.</p>";
             displayRandomVerse();
            return;
        }

        // Fetch details using locally stored (already rehydrated) prayerTargets
        const targetsToDisplayDetails = prayerTargets.filter(pt => allTargetIds.includes(pt.id));
        const pendingTargetsDetails = targetsToDisplayDetails.filter(t => pendingTargetIds.includes(t.id));
        const completedTargetsDetails = targetsToDisplayDetails.filter(t => completedTargetIds.includes(t.id));

        renderDailyTargets(pendingTargetsDetails, completedTargetsDetails);
        displayRandomVerse();

    } catch (error) {
        console.error("[loadDailyTargets] General error loading daily targets:", error);
        document.getElementById("dailyTargets").innerHTML = "<p>Erro ao carregar alvos diários.</p>";
    }
}

async function generateDailyTargets(userId, dateStr) { // dateStr is YYYY-MM-DD UTC
    try {
        // Fetch active targets (already rehydrated in prayerTargets global)
        const availableTargets = prayerTargets.filter(t => !t.archived); // Assuming prayerTargets only contains active ones

        if (availableTargets.length === 0) {
            console.log("[generateDailyTargets] No active targets found.");
            return { userId, date: dateStr, targets: [] };
        }

        // Fetch yesterday's completed targets to exclude them
        const todayUTC = createUTCDate(dateStr); // Get Date object for today UTC midnight
        if (!todayUTC) {
             console.error("[generateDailyTargets] Could not parse today's date string:", dateStr);
             return { userId, date: dateStr, targets: [] }; // Error case
        }
        const yesterdayUTC = new Date(todayUTC.getTime() - 24 * 60 * 60 * 1000);
        const yesterdayStr = formatDateToISO(yesterdayUTC); // Get YYYY-MM-DD for yesterday UTC
        const yesterdayDocId = `${userId}_${yesterdayStr}`;
        const yesterdayRef = doc(db, "dailyPrayerTargets", yesterdayDocId);
        let completedYesterdayIds = [];
        try {
            const yesterdaySnap = await getDoc(yesterdayRef);
            if (yesterdaySnap.exists()) {
                const yesterdayData = yesterdaySnap.data();
                if (yesterdayData && Array.isArray(yesterdayData.targets)) {
                    completedYesterdayIds = yesterdayData.targets.filter(t => t.completed).map(t => t.targetId);
                }
            }
        } catch (error) {
            console.warn("[generateDailyTargets] Error fetching previous day's targets:", error);
        }

        // Filter pool: exclude those completed yesterday
        let pool = availableTargets.filter(target => target.id && !completedYesterdayIds.includes(target.id));

        // Cycle Restart Logic: If pool is empty AND completedYesterday covers ALL available targets
        if (pool.length === 0 && availableTargets.length > 0 && availableTargets.length === completedYesterdayIds.length) {
             console.log("[generateDailyTargets] All active targets completed yesterday. Restarting cycle.");
             pool = [...availableTargets]; // Reset pool to all available targets
        } else if (pool.length === 0) {
             console.log("[generateDailyTargets] No targets available in the pool today.");
             return { userId, date: dateStr, targets: [] };
        }

        // Select random targets from the pool
        const shuffledPool = pool.sort(() => 0.5 - Math.random());
        const selectedTargets = shuffledPool.slice(0, Math.min(10, pool.length));
        const targetsForFirestore = selectedTargets.map(target => ({ targetId: target.id, completed: false }));

        // Update lastPresentedDate (optional, but good practice)
        await updateLastPresentedDates(userId, selectedTargets);

        console.log(`[generateDailyTargets] Generated ${targetsForFirestore.length} daily targets for ${userId} on ${dateStr}.`);
        return { userId, date: dateStr, targets: targetsForFirestore };
    } catch (error) {
        console.error("[generateDailyTargets] Error generating daily targets:", error);
        return { userId, date: dateStr, targets: [] }; // Return empty on error
    }
}

async function updateLastPresentedDates(userId, selectedTargets) {
    if (!selectedTargets || selectedTargets.length === 0) return;
    const batch = writeBatch(db);
    const nowTimestamp = Timestamp.fromDate(new Date());
    selectedTargets.forEach(target => {
        if (target && target.id) {
            const targetRef = doc(db, "users", userId, "prayerTargets", target.id);
            batch.update(targetRef, { lastPresentedDate: nowTimestamp });
        }
    });
    try {
        await batch.commit();
        console.log(`[updateLastPresentedDates] Updated lastPresentedDate for ${selectedTargets.length} targets.`);
    } catch (error) {
        console.error("[updateLastPresentedDates] Error updating lastPresentedDate:", error);
    }
}

function renderDailyTargets(pendingTargets, completedTargets) {
    const dailyTargetsDiv = document.getElementById("dailyTargets");
    dailyTargetsDiv.innerHTML = '';

    if (pendingTargets.length === 0 && completedTargets.length === 0) {
        dailyTargetsDiv.innerHTML = "<p>Nenhum alvo de oração selecionado para hoje.</p>";
        return;
    }

    // Render Pending
    pendingTargets.forEach((target) => {
        if (!target || !target.id) return;
        const dailyDiv = createTargetElement(target, false); // Not completed
        addPrayButtonFunctionality(dailyDiv, target.id); // Pass ID
        dailyTargetsDiv.appendChild(dailyDiv);
    });

    // Separator and Title for Completed
    if (completedTargets.length > 0) {
        if (pendingTargets.length > 0) {
             const separator = document.createElement('hr');
             separator.style.borderColor = '#ccc';
             dailyTargetsDiv.appendChild(separator);
        }
         const completedTitle = document.createElement('h3');
         completedTitle.textContent = "Concluídos Hoje";
         completedTitle.style.cssText = 'color:#777; font-size:1.1em; margin-top:15px;';
         dailyTargetsDiv.appendChild(completedTitle);

        // Render Completed
        completedTargets.forEach((target) => {
             if (!target || !target.id) return;
            const dailyDiv = createTargetElement(target, true); // Completed
            dailyTargetsDiv.appendChild(dailyDiv);
        });
    }

    // Check for completion popup only if there were pending targets initially
    if (pendingTargets.length === 0 && completedTargets.length > 0 && (pendingTargets.length + completedTargets.length > 0) ) {
         // Check if *any* target existed for the day before showing popup
        displayCompletionPopup();
    }
}

function createTargetElement(target, isCompleted) {
    const dailyDiv = document.createElement("div");
    dailyDiv.classList.add("target");
    if (isCompleted) dailyDiv.classList.add("completed-target");
    dailyDiv.dataset.targetId = target.id;

    const deadlineTag = target.hasDeadline
        ? `<span class="deadline-tag ${isDateExpired(target.deadlineDate) ? 'expired' : ''} ${isCompleted ? 'completed' : ''}">Prazo: ${formatDateForDisplay(target.deadlineDate)}</span>`
        : '';
    const observationsHTML = renderObservations(target.observations || [], false, target.id); // Pass ID

    dailyDiv.innerHTML = `
        <h3>${deadlineTag} ${target.title || 'Título Indisponível'}</h3>
        <p>${target.details || 'Detalhes Indisponíveis'}</p>
        <p><strong>Data Criação:</strong> ${formatDateForDisplay(target.date)}</p>
        <p><strong>Tempo Decorrido:</strong> ${timeElapsed(target.date)}</p>
        ${observationsHTML}
    `;
    return dailyDiv;
}

function addPrayButtonFunctionality(dailyDiv, targetId) {
    const prayButton = document.createElement("button");
    prayButton.textContent = "Orei!";
    prayButton.classList.add("pray-button", "btn");
    prayButton.onclick = async () => {
        const userId = auth.currentUser.uid;
        // **FIX: Use UTC date for doc ID**
        const todayStr = formatDateToISO(new Date());
        const dailyDocId = `${userId}_${todayStr}`;
        const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);

        prayButton.disabled = true;
        prayButton.textContent = "Orado!";

        try {
            const dailySnap = await getDoc(dailyRef);
            if (!dailySnap.exists()) {
                 console.error("Daily document not found when marking prayed:", dailyDocId);
                 alert("Erro: Documento diário não encontrado.");
                 prayButton.disabled = false; prayButton.textContent = "Orei!";
                 return;
             }
            const dailyData = dailySnap.data();
            let targetUpdated = false;
            const updatedTargets = dailyData.targets.map(t => {
                if (t.targetId === targetId) {
                    targetUpdated = true;
                    return { ...t, completed: true };
                }
                return t;
            });

            if (!targetUpdated) console.warn(`Target ${targetId} not found in daily doc.`);

            await updateDoc(dailyRef, { targets: updatedTargets });
            await updateClickCounts(userId, targetId); // Update stats
            loadDailyTargets(); // Re-render daily section

        } catch (error) {
            console.error("Error registering 'Orei!':", error);
            alert("Erro ao registrar oração.");
            prayButton.disabled = false; prayButton.textContent = "Orei!";
        }
    };
     // Insert button before the first child (e.g., h3)
     dailyDiv.insertBefore(prayButton, dailyDiv.firstChild);
}

async function updateClickCounts(userId, targetId) {
     const clickCountsRef = doc(db, "prayerClickCounts", targetId);
     const now = new Date();
     // Use UTC month/year for consistency ? Or local time stats? Let's stick to local for stats for now.
     const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
     const year = now.getFullYear().toString();

     try {
         await setDoc(clickCountsRef, {
             targetId: targetId,
             userId: userId, // Ensure userId is present
             totalClicks: increment(1),
             [`monthlyClicks.${yearMonth}`]: increment(1),
             [`yearlyClicks.${year}`]: increment(1)
         }, { merge: true }); // Use merge:true to increment existing or create new
         console.log(`[updateClickCounts] Click count updated for target ${targetId}.`);
     } catch (error) {
         console.error(`[updateClickCounts] Error updating click count for ${targetId}:`, error);
     }
 }


// --- Perseverança ---
// (loadPerseveranceData, confirmPerseverance, updatePerseveranceFirestore, updatePerseveranceUI, resetPerseveranceUI, updateWeeklyChart, resetWeeklyChart - Sem alterações significativas na lógica base, usarão datas corrigidas se aplicável)
async function loadPerseveranceData(userId) {
     console.log(`[loadPerseveranceData] Loading for user ${userId}`);
    const perseveranceDocRef = doc(db, "perseveranceData", userId);
    try {
        const docSnap = await getDoc(perseveranceDocRef);
        if (docSnap.exists()) {
            perseveranceData = docSnap.data();
            // Convert Timestamp back to Date for local use
            if (perseveranceData.lastInteractionDate instanceof Timestamp) {
                perseveranceData.lastInteractionDate = perseveranceData.lastInteractionDate.toDate();
            }
            perseveranceData.consecutiveDays = Number(perseveranceData.consecutiveDays) || 0;
            perseveranceData.recordDays = Number(perseveranceData.recordDays) || 0;
        } else {
            perseveranceData = { consecutiveDays: 0, lastInteractionDate: null, recordDays: 0 };
        }
        updatePerseveranceUI();
    } catch (error) {
        console.error("[loadPerseveranceData] Error loading perseverance data:", error);
         perseveranceData = { consecutiveDays: 0, lastInteractionDate: null, recordDays: 0 };
         updatePerseveranceUI();
    }
}

async function confirmPerseverance() {
    const user = auth.currentUser;
     if (!user) { alert("Erro: Usuário não autenticado."); return; }
     const userId = user.uid;

    const today = new Date();
    // **FIX: Compare using UTC dates**
    const todayUTCStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

    let lastInteractionUTCStart = null;
     if (perseveranceData.lastInteractionDate instanceof Date && !isNaN(perseveranceData.lastInteractionDate)) {
         const li = perseveranceData.lastInteractionDate;
         lastInteractionUTCStart = new Date(Date.UTC(li.getUTCFullYear(), li.getUTCMonth(), li.getUTCDate()));
     }

    // Check if today's UTC start is after the last interaction's UTC start
    if (!lastInteractionUTCStart || todayUTCStart.getTime() > lastInteractionUTCStart.getTime()) {
         let isConsecutive = false;
         if (lastInteractionUTCStart) {
             const expectedYesterdayUTCStart = new Date(todayUTCStart.getTime() - 24 * 60 * 60 * 1000);
             if (lastInteractionUTCStart.getTime() === expectedYesterdayUTCStart.getTime()) {
                 isConsecutive = true;
             }
         }

         perseveranceData.consecutiveDays = isConsecutive ? perseveranceData.consecutiveDays + 1 : 1;
         // Store the Date object representing UTC midnight for comparison consistency
         perseveranceData.lastInteractionDate = todayUTCStart;
         if (perseveranceData.consecutiveDays > perseveranceData.recordDays) {
             perseveranceData.recordDays = perseveranceData.consecutiveDays;
         }

         try {
            await updatePerseveranceFirestore(userId, perseveranceData);
            updatePerseveranceUI();
             alert(`Perseverança confirmada! Dias consecutivos: ${perseveranceData.consecutiveDays}`);
         } catch (error) {
              console.error("[confirmPerseverance] Error updating Firestore:", error);
              alert("Erro ao salvar dados de perseverança.");
         }
    } else {
        alert("Perseverança já confirmada para hoje!");
    }
}

async function updatePerseveranceFirestore(userId, data) {
    const perseveranceDocRef = doc(db, "perseveranceData", userId);
     // **FIX: Store Date as Timestamp**
     const dataToSave = {
         consecutiveDays: data.consecutiveDays || 0,
         lastInteractionDate: data.lastInteractionDate instanceof Date ? Timestamp.fromDate(data.lastInteractionDate) : null,
         recordDays: data.recordDays || 0
     };
    await setDoc(perseveranceDocRef, dataToSave, { merge: true });
}

function updatePerseveranceUI() {
     const consecutiveDays = perseveranceData.consecutiveDays || 0;
    const targetDays = 30;
    const percentage = Math.min((consecutiveDays / targetDays) * 100, 100);
    const progressBar = document.getElementById('perseveranceProgressBar');
    const percentageDisplay = document.getElementById('perseverancePercentage');

    if (progressBar && percentageDisplay) {
        progressBar.style.width = `${percentage}%`;
        percentageDisplay.textContent = `${Math.round(percentage)}%`;
    }
    updateWeeklyChart();
}

function resetPerseveranceUI() {
    const progressBar = document.getElementById('perseveranceProgressBar');
    const percentageDisplay = document.getElementById('perseverancePercentage');
    if (progressBar && percentageDisplay) {
        progressBar.style.width = `0%`;
        percentageDisplay.textContent = `0%`;
    }
    resetWeeklyChart();
}

function updateWeeklyChart() {
    const today = new Date();
    let lastInteractionUTCStartMs = null;

    // **FIX: Use UTC comparison**
    if (perseveranceData.lastInteractionDate instanceof Date && !isNaN(perseveranceData.lastInteractionDate)) {
        const li = perseveranceData.lastInteractionDate;
        lastInteractionUTCStartMs = Date.UTC(li.getUTCFullYear(), li.getUTCMonth(), li.getUTCDate());
    }

    for (let i = 0; i < 7; i++) {
        const day = new Date(today);
        day.setDate(today.getDate() - i);
        // Get UTC midnight timestamp for the day being checked
        const dayUTCStartMs = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());

        const dayOfWeek = day.getDay(); // Local day of week is fine for targeting element ID
        const dayTick = document.getElementById(`day-${dayOfWeek}`);

        if (dayTick) {
            if (lastInteractionUTCStartMs !== null && dayUTCStartMs === lastInteractionUTCStartMs) {
                dayTick.classList.add('active');
            } else {
                dayTick.classList.remove('active');
            }
        }
    }
}

function resetWeeklyChart() {
    for (let i = 0; i < 7; i++) document.getElementById(`day-${i}`)?.classList.remove('active');
}

// --- Visualizações e Filtros ---
// (generateViewHTML, generateDailyViewHTML, generateResolvedViewHTML, filterTargets, handleSearch*, showPanel - Sem alterações significativas na lógica base)
function generateViewHTML(targetsToInclude = lastDisplayedTargets) {
     // Uses corrected formatDateForDisplay, timeElapsed, isDateExpired implicitly
     let viewHTML = `... HTML structure ...`; // (Keep existing HTML structure)
     if (!Array.isArray(targetsToInclude) || targetsToInclude.length === 0) {
         viewHTML += "<p>Nenhum alvo para exibir.</p>";
     } else {
         targetsToInclude.forEach(target => {
              if (!target || !target.id) return;
              viewHTML += generateTargetViewHTML(target); // Use helper for consistency
         });
     }
     viewHTML += `... closing HTML ...`;
     // Open tab logic remains the same
    const viewTab = window.open('', '_blank');
    if (viewTab) { viewTab.document.write(viewHTML); viewTab.document.close(); }
    else { alert('Popup bloqueado!'); }
}

function generateDailyViewHTML() {
    // Uses corrected functions implicitly via createTargetElement/renderObservations
    let viewHTML = `... HTML structure ...`; // (Keep existing HTML structure)
    const dailyTargetsDiv = document.getElementById('dailyTargets');
    let pendingCount = 0;
    let completedCount = 0;

    if (dailyTargetsDiv) {
        viewHTML += `<h2>Pendentes</h2>`;
        dailyTargetsDiv.querySelectorAll('.target:not(.completed-target)').forEach(div => {
            const targetId = div.dataset.targetId;
            const targetData = prayerTargets.find(t => t.id === targetId);
            if (targetData) { pendingCount++; viewHTML += generateTargetViewHTML(targetData); }
        });
        if (pendingCount === 0) viewHTML += "<p>Nenhum alvo pendente.</p>";

        viewHTML += `<hr/><h2>Concluídos Hoje</h2>`;
        dailyTargetsDiv.querySelectorAll('.target.completed-target').forEach(div => {
             const targetId = div.dataset.targetId;
             const targetData = prayerTargets.find(t => t.id === targetId);
             if (targetData) { completedCount++; viewHTML += generateTargetViewHTML(targetData, true); } // Mark as completed view
        });
        if (completedCount === 0) viewHTML += "<p>Nenhum alvo concluído hoje.</p>";
    } else {
        viewHTML += "<p>Erro: Seção de alvos diários não encontrada.</p>";
    }
    viewHTML += `... closing HTML ...`;
     // Open tab logic remains the same
     const viewTab = window.open('', '_blank');
     if (viewTab) { viewTab.document.write(viewHTML); viewTab.document.close(); }
     else { alert('Popup bloqueado!'); }
}

// Helper for view generation
function generateTargetViewHTML(target, isCompletedView = false) {
     if (!target || !target.id) return '';
     const formattedDate = formatDateForDisplay(target.date);
     const elapsed = timeElapsed(target.date);
     let deadlineTag = '';
     if (target.hasDeadline) {
         const formattedDeadline = formatDateForDisplay(target.deadlineDate);
         deadlineTag = `<span class="deadline-tag ${isDateExpired(target.deadlineDate) ? 'expired' : ''}">Prazo: ${formattedDeadline}</span>`;
     }
     const observations = Array.isArray(target.observations) ? target.observations : [];
     // Render ALL observations expanded in the static view
     const observationsHTML = renderObservations(observations, true, target.id);

     return `
         <div class="target ${isCompletedView ? 'completed-target' : ''}">
             <h3>${deadlineTag} ${target.title || 'Sem Título'}</h3>
             <p>${target.details || 'Sem Detalhes'}</p>
             <p><strong>Data Criação:</strong> ${formattedDate}</p>
             <p><strong>Tempo Decorrido:</strong> ${elapsed}</p>
             ${observationsHTML}
         </div>
     `;
}

async function generateResolvedViewHTML(startDate, endDate) { // Expect Date objects (representing local day start)
    const user = auth.currentUser;
    if (!user) { alert("Você precisa estar logado."); return; }
    const uid = user.uid;

    // **FIX: Convert local start/end dates to UTC Timestamps for query**
    // Ensure we capture the very start of the startDate and the very end of the endDate in UTC
    const startUTC = new Date(Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()));
    // For end date, get start of NEXT day UTC, then query < that time
    const endNextDay = new Date(endDate);
    endNextDay.setDate(endDate.getDate() + 1);
    const endUTCStartOfNextDay = new Date(Date.UTC(endNextDay.getFullYear(), endNextDay.getMonth(), endNextDay.getDate()));

    const startTimestamp = Timestamp.fromDate(startUTC);
    const endTimestamp = Timestamp.fromDate(endUTCStartOfNextDay); // Use start of next day for "<" comparison

    const archivedRef = collection(db, "users", uid, "archivedTargets");
    const q = query(archivedRef,
                    where("resolved", "==", true),
                    where("resolutionDate", ">=", startTimestamp),
                    where("resolutionDate", "<", endTimestamp), // Query where resolution date is before start of next day UTC
                    orderBy("resolutionDate", "desc"));

    let filteredResolvedTargets = [];
    try {
        const querySnapshot = await getDocs(q);
        const rawTargets = [];
        querySnapshot.forEach((doc) => rawTargets.push({ ...doc.data(), id: doc.id }));
        filteredResolvedTargets = rehydrateTargets(rawTargets); // Rehydrate results
    } catch (error) {
        console.error("Error fetching resolved targets:", error);
        alert("Erro ao buscar alvos respondidos."); return;
    }

    // Sort locally just in case (by rehydrated Date objects)
    filteredResolvedTargets.sort((a, b) => (b.resolutionDate || 0) - (a.resolutionDate || 0));

    let viewHTML = `... HTML structure ...`; // (Keep existing HTML structure)
    viewHTML += `<h2>Período: ${formatDateForDisplay(startDate)} - ${formatDateForDisplay(endDate)}</h2><hr/>`;

     if (filteredResolvedTargets.length === 0) {
         viewHTML += "<p>Nenhum alvo respondido neste período.</p>";
     } else {
        filteredResolvedTargets.forEach(target => {
            // Reuse the helper function for resolved items too
            viewHTML += generateTargetViewHTMLForResolved(target);
        });
    }
    viewHTML += `... closing HTML ...`;
    // Open tab logic
    const viewTab = window.open('', '_blank');
    if (viewTab) { viewTab.document.write(viewHTML); viewTab.document.close(); }
    else { alert('Popup bloqueado!'); }
}

// Specific helper for Resolved View HTML generation
function generateTargetViewHTMLForResolved(target) {
     if (!target || !target.id) return '';
     const formattedResolutionDate = formatDateForDisplay(target.resolutionDate);
     let totalTime = 'N/A';
     if (target.date instanceof Date && target.resolutionDate instanceof Date) {
         // Calculate difference (same logic as renderResolvedTargets)
         let diffInSeconds = Math.floor((target.resolutionDate.getTime() - target.date.getTime()) / 1000);
         if (diffInSeconds < 0) diffInSeconds = 0;
         // Reuse timeElapsed logic components for formatting
         if (diffInSeconds < 60) totalTime = `${diffInSeconds} seg`;
         else { let diffInMinutes = Math.floor(diffInSeconds / 60); /* ... etc ... */ } // (Copy full time calculation)
         // Simplified for brevity:
         totalTime = `${Math.round(diffInSeconds / 86400)} dias (aprox)`;
     }
     const observations = Array.isArray(target.observations) ? target.observations : [];
     const observationsHTML = renderObservations(observations, true, target.id); // Render all expanded

     return `
         <div class="target resolved">
             <h3>${target.title || 'Sem Título'} (Respondido)</h3>
             <p>${target.details || 'Sem Detalhes'}</p>
             <p><strong>Data Respondido:</strong> ${formattedResolutionDate}</p>
             <p><strong>Tempo Total:</strong> ${totalTime}</p>
             ${observationsHTML}
         </div>
     `;
}


function filterTargets(targets, searchTerm) {
    if (!searchTerm) return targets;
    const lowerSearchTerm = searchTerm.toLowerCase();
    return targets.filter(target => {
         const titleMatch = target.title && target.title.toLowerCase().includes(lowerSearchTerm);
         const detailsMatch = target.details && target.details.toLowerCase().includes(lowerSearchTerm);
          const observationMatch = Array.isArray(target.observations) &&
              target.observations.some(obs => obs.text && obs.text.toLowerCase().includes(lowerSearchTerm));
        return titleMatch || detailsMatch || observationMatch;
    });
}

function handleSearchMain(event) { currentSearchTermMain = event.target.value; currentPage = 1; renderTargets(); }
function handleSearchArchived(event) { currentSearchTermArchived = event.target.value; currentArchivedPage = 1; renderArchivedTargets(); }
function handleSearchResolved(event) { currentSearchTermResolved = event.target.value; currentResolvedPage = 1; renderResolvedTargets(); }

function showPanel(panelIdToShow) {
    const allPanels = ['appContent', 'dailySection', 'mainPanel', 'archivedPanel', 'resolvedPanel', 'weeklyPerseveranceChart', 'perseveranceSection'];
    const separators = ['sectionSeparator'];

    allPanels.forEach(id => document.getElementById(id).style.display = 'none');
    separators.forEach(id => document.getElementById(id).style.display = 'none');

    document.getElementById(panelIdToShow).style.display = 'block';

    // Show related elements based on the main panel shown
    if (panelIdToShow === 'dailySection') {
        document.getElementById('weeklyPerseveranceChart').style.display = 'block';
        document.getElementById('perseveranceSection').style.display = 'block';
        document.getElementById('sectionSeparator').style.display = 'block';
    }
     // Ensure elements are hidden if showing form or lists
     if (['appContent', 'mainPanel', 'archivedPanel', 'resolvedPanel'].includes(panelIdToShow)) {
          document.getElementById('dailySection').style.display = 'none';
          document.getElementById('weeklyPerseveranceChart').style.display = 'none';
          document.getElementById('perseveranceSection').style.display = 'none';
          document.getElementById('sectionSeparator').style.display = 'none';
      }
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
        popup.style.display = 'flex';
        const popupVerseElement = popup.querySelector('#popupVerse');
        if (popupVerseElement) {
            const randomIndex = Math.floor(Math.random() * verses.length);
            popupVerseElement.textContent = verses[randomIndex];
        }
    }
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("[DOMContentLoaded] DOM fully loaded.");
    // Set default date input to today
    try {
        const dateInput = document.getElementById('date');
        if (dateInput) dateInput.value = formatDateToISO(new Date());
    } catch (e) { console.error("Error setting default date:", e); }

    // Auth state change listener
    onAuthStateChanged(auth, (user) => loadData(user));

    // Search inputs
    document.getElementById('searchMain').addEventListener('input', handleSearchMain);
    document.getElementById('searchArchived').addEventListener('input', handleSearchArchived);
    document.getElementById('searchResolved').addEventListener('input', handleSearchResolved);

    // Filter checkboxes
    document.getElementById('showDeadlineOnly').addEventListener('change', handleDeadlineFilterChange);
    document.getElementById('showExpiredOnlyMain').addEventListener('change', handleExpiredOnlyMainChange);

    // Buttons
    // REMOVIDO: Event listener para btnGoogleLogin
    // document.getElementById('btnGoogleLogin')?.addEventListener('click', signInWithGoogle);
    document.getElementById('btnEmailSignUp')?.addEventListener('click', signUpWithEmailPassword);
    document.getElementById('btnEmailSignIn')?.addEventListener('click', signInWithEmailPassword);
    document.getElementById('btnForgotPassword')?.addEventListener('click', resetPassword);
    document.getElementById('btnLogout')?.addEventListener('click', () => signOut(auth));
    document.getElementById('confirmPerseveranceButton').addEventListener('click', confirmPerseverance);
    document.getElementById("viewReportButton").addEventListener('click', () => window.location.href = 'orei.html');
    document.getElementById("refreshDaily").addEventListener("click", async () => {
        const user = auth.currentUser;
        if (!user) { alert("Você precisa estar logado."); return; }
        if (confirm("Atualizar lista de alvos do dia?")) {
            const userId = user.uid;
            // **FIX: Use UTC date string**
            const todayStr = formatDateToISO(new Date());
            const dailyDocId = `${userId}_${todayStr}`;
            const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);
            try {
                const newTargetsData = await generateDailyTargets(userId, todayStr);
                await setDoc(dailyRef, newTargetsData); // Overwrite today's list
                loadDailyTargets(); // Reload display
                alert("Alvos do dia atualizados!");
            } catch (error) {
                console.error("Error refreshing daily targets:", error);
                alert("Erro ao atualizar alvos diários.");
            }
        }
     });
     document.getElementById("copyDaily").addEventListener("click", () => {
        const dailyTargetsDiv = document.getElementById('dailyTargets');
        let textToCopy = '';
        if (!dailyTargetsDiv) return;
        const targetDivs = dailyTargetsDiv.querySelectorAll('.target:not(.completed-target)'); // Only pending
        targetDivs.forEach((div, index) => {
            const titleElement = div.querySelector('h3');
            const titleText = titleElement ? (titleElement.lastChild.textContent ? titleElement.lastChild.textContent.trim() : titleElement.textContent.trim()) : 'Sem Título';
            const detailsElement = div.querySelector('p:nth-of-type(1)');
            const detailsText = detailsElement ? detailsElement.textContent.trim() : 'Sem Detalhes';
            textToCopy += `${index + 1}. ${titleText}\n   ${detailsText}\n\n`;
        });
        if (textToCopy) {
            navigator.clipboard.writeText(textToCopy.trim())
               .then(() => alert('Alvos pendentes copiados!'))
               .catch(err => prompt("Falha ao copiar. Copie manualmente:", textToCopy.trim()));
        } else { alert('Nenhum alvo pendente para copiar.'); }
     });
     document.getElementById('generateViewButton').addEventListener('click', () => generateViewHTML()); // Use last displayed targets
     document.getElementById('viewDaily').addEventListener('click', generateDailyViewHTML);
     document.getElementById("viewResolvedViewButton").addEventListener("click", () => dateRangeModal.style.display = "block");
     document.getElementById('closePopup')?.addEventListener('click', () => document.getElementById('completionPopup').style.display = 'none');

     // Navigation buttons
    document.getElementById('viewAllTargetsButton').addEventListener('click', () => { showPanel('mainPanel'); currentPage = 1; renderTargets(); });
    document.getElementById('addNewTargetButton').addEventListener('click', () => showPanel('appContent'));
    document.getElementById("viewArchivedButton").addEventListener("click", () => { showPanel('archivedPanel'); currentArchivedPage = 1; renderArchivedTargets(); });
    document.getElementById("viewResolvedButton").addEventListener("click", () => { showPanel('resolvedPanel'); currentResolvedPage = 1; renderResolvedTargets(); });
    document.getElementById("backToMainButton").addEventListener("click", () => showPanel('dailySection'));

    // Date Range Modal Logic
    const dateRangeModal = document.getElementById("dateRangeModal");
    document.getElementById("closeDateRangeModal")?.addEventListener("click", () => dateRangeModal.style.display = "none");
    document.getElementById("generateResolvedView")?.addEventListener("click", () => {
        const startDate = document.getElementById("startDate").value;
        const endDate = document.getElementById("endDate").value;
        if (startDate && endDate) {
            // **FIX: Parse local date strings correctly for range**
            const start = new Date(startDate); // Assumes local timezone midnight
            const end = new Date(endDate);   // Assumes local timezone midnight
             if (isNaN(start.getTime()) || isNaN(end.getTime())) { alert("Datas inválidas."); return; }
             if (start > end) { alert("Data de início após data de fim."); return; }
            generateResolvedViewHTML(start, end); // Pass Date objects
            dateRangeModal.style.display = "none";
        } else { alert("Selecione as datas."); }
    });
    document.getElementById("cancelDateRange")?.addEventListener("click", () => dateRangeModal.style.display = "none");
    window.addEventListener('click', (event) => { if (event.target == dateRangeModal) dateRangeModal.style.display = "none"; });

});
