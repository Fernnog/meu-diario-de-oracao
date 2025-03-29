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
let lastDisplayedTargets = []; // Armazena os alvos atualmente exibidos no painel principal
let currentPage = 1;
let currentArchivedPage = 1;
let currentResolvedPage = 1;
const targetsPerPage = 10;
let currentSearchTermMain = '';
let currentSearchTermArchived = '';
let currentSearchTermResolved = '';
let showDeadlineOnly = false;
let perseveranceData = { consecutiveDays: 0, lastInteractionDate: null, recordDays: 0 };

// ==== FUNÇÕES UTILITÁRIAS ====

// Helper to create a Date object representing UTC midnight from a YYYY-MM-DD string
function createUTCDate(dateString) {
    if (!dateString || typeof dateString !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        console.warn("[createUTCDate] Invalid date string format provided:", dateString);
        return null; // Return null for invalid input
    }
    const date = new Date(dateString + 'T00:00:00Z');
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

    const day = String(dateToFormat.getUTCDate()).padStart(2, '0');
    const month = String(dateToFormat.getUTCMonth() + 1).padStart(2, '0'); // getUTCMonth is 0-indexed
    const year = dateToFormat.getUTCFullYear();
    const formattedDate = `${day}/${month}/${year}`;
    console.log('[formatDateForDisplay] Formatting successful using UTC components. Returning:', formattedDate);
    return formattedDate;
}

// *** NOVA FUNÇÃO ADICIONADA ***
// Formata a data para o nome do arquivo (DD-MM-AAAA) usando data local
function formatDateForFilename(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
        date = new Date(); // Default to today if invalid
    }
    const day = String(date.getDate()).padStart(2, '0'); // Usa getDate() para dia local
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Usa getMonth() para mês local
    const year = date.getFullYear(); // Usa getFullYear() para ano local
    return `${day}-${month}-${year}`;
}

// Calculates time elapsed from a given past date (Date object expected) until now
function timeElapsed(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
        return 'Data Inválida';
    }

    const now = new Date();
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
    const todayUTCStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    return date.getTime() < todayUTCStart.getTime();
}

function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 15);
}

// Rehydrates Firestore data (Timestamps to Date objects)
function rehydrateTargets(targets) {
    console.log('[rehydrateTargets] Starting rehydration for', targets.length, 'targets.');
    return targets.map((target, index) => {
        const rehydratedTarget = { ...target };
        const fieldsToConvert = ['date', 'deadlineDate', 'lastPresentedDate', 'resolutionDate', 'archivedDate']; // Added archivedDate
        fieldsToConvert.forEach(field => {
            const originalValue = rehydratedTarget[field];
            if (originalValue instanceof Timestamp) {
                rehydratedTarget[field] = originalValue.toDate();
            } else if (originalValue instanceof Date && !isNaN(originalValue)) {
                 rehydratedTarget[field] = originalValue;
            } else if (originalValue === null || originalValue === undefined) {
                 rehydratedTarget[field] = null;
            } else {
                try {
                     const parsedDate = new Date(originalValue);
                     rehydratedTarget[field] = !isNaN(parsedDate.getTime()) ? parsedDate : null;
                } catch (e) { rehydratedTarget[field] = null; }
            }
        });

        if (rehydratedTarget.observations && Array.isArray(rehydratedTarget.observations)) {
            rehydratedTarget.observations = rehydratedTarget.observations.map((obs, obsIndex) => {
                let obsDateFinal = null;
                if (obs.date instanceof Timestamp) {
                    obsDateFinal = obs.date.toDate();
                } else if (obs.date instanceof Date && !isNaN(obs.date)) {
                    obsDateFinal = obs.date;
                } else if (obs.date) {
                    try {
                         const parsedObsDate = new Date(obs.date);
                         if (!isNaN(parsedObsDate.getTime())) obsDateFinal = parsedObsDate;
                    } catch(e) { /* ignore */ }
                }
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
    const emailPasswordAuthForm = document.getElementById('emailPasswordAuthForm');
    const authStatusContainer = document.querySelector('.auth-status-container');

    if (user) {
        authStatusContainer.style.display = 'flex';
        btnLogout.style.display = 'inline-block';
        emailPasswordAuthForm.style.display = 'none';

        if (user.providerData[0]?.providerId === 'password') {
            authStatus.textContent = `Usuário autenticado: ${user.email} (via E-mail/Senha)`;
        } else {
            authStatus.textContent = `Usuário autenticado: ${user.email}`;
        }
    } else {
        authStatusContainer.style.display = 'block';
        btnLogout.style.display = 'none';
        emailPasswordAuthForm.style.display = 'block';
        authStatus.textContent = "Nenhum usuário autenticado";
    }
}

async function signUpWithEmailPassword() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        alert("Cadastro realizado com sucesso!");
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
            showPanel('dailySection'); // Show daily section by default after login
            renderTargets(); // Render main panel content even if hidden initially
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
        document.getElementById('archivedPanel').style.display = 'none'; // Hide other panels too
        document.getElementById('resolvedPanel').style.display = 'none';
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
function renderTargets() {
    const targetListDiv = document.getElementById('targetList');
    targetListDiv.innerHTML = '';
    let filteredAndPagedTargets = [...prayerTargets];

    // Apply Filters
    if (currentSearchTermMain) {
        filteredAndPagedTargets = filterTargets(filteredAndPagedTargets, currentSearchTermMain);
    }
    if (showDeadlineOnly) {
        filteredAndPagedTargets = filteredAndPagedTargets.filter(target => target.hasDeadline);
    }
    const showExpiredOnlyMainCheckbox = document.getElementById('showExpiredOnlyMain');
    if (showExpiredOnlyMainCheckbox && showExpiredOnlyMainCheckbox.checked) {
        filteredAndPagedTargets = filteredAndPagedTargets.filter(target => target.hasDeadline && isDateExpired(target.deadlineDate));
    }

    // Sort
     if (showDeadlineOnly || (showExpiredOnlyMainCheckbox && showExpiredOnlyMainCheckbox.checked)) {
        filteredAndPagedTargets.sort((a, b) => {
            const dateA = a.deadlineDate instanceof Date && !isNaN(a.deadlineDate) ? a.deadlineDate : null;
            const dateB = b.deadlineDate instanceof Date && !isNaN(b.deadlineDate) ? b.deadlineDate : null;
            if (dateA && dateB) return dateA - dateB;
            if (dateA) return -1;
            if (dateB) return 1;
             const creationDateA = (a.date instanceof Date && !isNaN(a.date)) ? a.date : new Date(0);
             const creationDateB = (b.date instanceof Date && !isNaN(b.date)) ? b.date : new Date(0);
             return creationDateB - creationDateA;
        });
    } else {
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

    // Render
    if (targetsToDisplay.length === 0) {
        if (currentPage > 1) {
            currentPage = 1; renderTargets(); return;
        } else {
            targetListDiv.innerHTML = '<p>Nenhum alvo de oração encontrado.</p>';
        }
    } else {
        targetsToDisplay.forEach((target) => {
             if (!target || !target.id) {
                 console.warn("[renderTargets] Skipping rendering of invalid target:", target); return;
             }
            const targetDiv = document.createElement("div");
            targetDiv.classList.add("target");
            targetDiv.dataset.targetId = target.id;

            const formattedDate = formatDateForDisplay(target.date);
            const elapsed = timeElapsed(target.date);
            let deadlineTag = '';
            if (target.hasDeadline) {
                const formattedDeadline = formatDateForDisplay(target.deadlineDate);
                deadlineTag = `<span class="deadline-tag ${isDateExpired(target.deadlineDate) ? 'expired' : ''}">Prazo: ${formattedDeadline}</span>`;
            }
            const observations = Array.isArray(target.observations) ? target.observations : [];

            targetDiv.innerHTML = `
                <h3>${deadlineTag} ${target.title || 'Sem Título'}</h3>
                <p>${target.details || 'Sem Detalhes'}</p>
                <p><strong>Data:</strong> ${formattedDate}</p>
                <p><strong>Tempo Decorrido:</strong> ${elapsed}</p>
                ${renderObservations(observations, false, target.id)}
                <div class="target-actions">
                    <button class="resolved btn" onclick="markAsResolved('${target.id}')">Respondido</button>
                    <button class="archive btn" onclick="archiveTarget('${target.id}')">Arquivar</button>
                    <button class="add-observation btn" onclick="toggleAddObservation('${target.id}')">Observação</button>
                    ${target.hasDeadline ? `<button class="edit-deadline btn" onclick="editDeadline('${target.id}')">Editar Prazo</button>` : ''}
                </div>
                <div id="observationForm-${target.id}" class="add-observation-form" style="display:none;"></div>
            `;
            targetListDiv.appendChild(targetDiv);
            renderObservationForm(target.id);
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
     filteredAndPagedArchivedTargets.sort((a, b) => (b.date || 0) - (a.date || 0));

    const startIndex = (currentArchivedPage - 1) * targetsPerPage;
    const endIndex = startIndex + targetsPerPage;
    const targetsToDisplay = filteredAndPagedArchivedTargets.slice(startIndex, endIndex);

    if (targetsToDisplay.length === 0) {
        if (currentArchivedPage > 1) {
            currentArchivedPage = 1; renderArchivedTargets(); return;
        } else {
            archivedListDiv.innerHTML = '<p>Nenhum alvo arquivado encontrado.</p>';
        }
    } else {
        targetsToDisplay.forEach((target) => {
             if (!target || !target.id) return;
            const archivedDiv = document.createElement("div");
            archivedDiv.classList.add("target", "archived"); // Keep .archived for potential specific styles
             if(target.resolved) archivedDiv.classList.add("resolved"); // Add .resolved if it's also resolved
            archivedDiv.dataset.targetId = target.id;

            const formattedDate = formatDateForDisplay(target.date);
            const elapsed = timeElapsed(target.date);
            const observations = Array.isArray(target.observations) ? target.observations : [];
            const resolutionDateStr = target.resolved && target.resolutionDate ? ` | Respondido em: ${formatDateForDisplay(target.resolutionDate)}` : '';
            const archivedDateStr = target.archivedDate ? ` | Arquivado em: ${formatDateForDisplay(target.archivedDate)}` : ''; // Show archive date if available

            archivedDiv.innerHTML = `
                <h3>${target.title || 'Sem Título'} ${target.resolved ? '(Respondido)' : ''}</h3>
                <p>${target.details || 'Sem Detalhes'}</p>
                <p><strong>Data Criação:</strong> ${formattedDate} ${resolutionDateStr}${archivedDateStr}</p>
                <p><strong>Tempo Decorrido (criação):</strong> ${elapsed}</p>
                ${renderObservations(observations, false, target.id)}
                <div class="target-actions">
                    <button class="delete btn" onclick="deleteArchivedTarget('${target.id}')">Excluir</button>
                    ${!target.resolved ? `<button class="resolved btn" onclick="markArchivedAsResolved('${target.id}')">Marcar Respondido</button>` : ''}
                    <!-- Add unarchive button if needed -->
                </div>
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
     filteredAndPagedResolvedTargets.sort((a, b) => (b.resolutionDate || 0) - (a.resolutionDate || 0));

    const startIndex = (currentResolvedPage - 1) * targetsPerPage;
    const endIndex = startIndex + targetsPerPage;
    const targetsToDisplay = filteredAndPagedResolvedTargets.slice(startIndex, endIndex);

    if (targetsToDisplay.length === 0) {
         if (currentResolvedPage > 1) {
             currentResolvedPage = 1; renderResolvedTargets(); return;
         } else {
             resolvedListDiv.innerHTML = '<p>Nenhum alvo respondido encontrado.</p>';
         }
    } else {
        targetsToDisplay.forEach((target) => {
            if (!target || !target.id) return;
            const resolvedDiv = document.createElement("div");
            resolvedDiv.classList.add("target", "resolved"); // Keep specific class
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
                ${renderObservations(observations, false, target.id)}
                <div class="target-actions">
                   <button class="delete btn" onclick="deleteArchivedTarget('${target.id}')">Excluir</button>
                   <!-- Poderia ter um botão para 'Desmarcar como Respondido' se necessário -->
                </div>
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

    paginationDiv.innerHTML = `
        ${page > 1 ? `<a href="#" class="page-link" data-page="${page - 1}" data-panel="${panelId}">« Anterior</a>` : '<span></span>'}
        <span style="margin: 0 10px; padding: 8px 0;">Página ${page} de ${totalPages}</span>
        ${page < totalPages ? `<a href="#" class="page-link" data-page="${page + 1}" data-panel="${panelId}">Próxima »</a>` : '<span></span>'}
    `;

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
        // Scroll to top of the panel area
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
    const dateInput = document.getElementById("date").value;
    const hasDeadline = document.getElementById("hasDeadline").checked;
    const deadlineDateInput = document.getElementById("deadlineDate").value;

    if (!title || !dateInput) { alert("Título e Data são obrigatórios."); return; }

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
        date: Timestamp.fromDate(dateUTC),
        hasDeadline: hasDeadline,
        deadlineDate: deadlineDateUTC ? Timestamp.fromDate(deadlineDateUTC) : null,
        archived: false,
        archivedDate: null, // Initialize archivedDate
        resolved: false,
        resolutionDate: null,
        observations: [],
    };

    try {
        const docRef = await addDoc(collection(db, "users", uid, "prayerTargets"), target);
        const newLocalTarget = rehydrateTargets([{ ...target, id: docRef.id }])[0];
        prayerTargets.unshift(newLocalTarget);
        prayerTargets.sort((a, b) => (b.date || 0) - (a.date || 0));

        document.getElementById("prayerForm").reset();
        document.getElementById('deadlineContainer').style.display = 'none';
        document.getElementById('date').value = formatDateToISO(new Date());

        showPanel('mainPanel');
        currentPage = 1;
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
    const resolutionDate = Timestamp.fromDate(new Date());
    const archivedDate = Timestamp.fromDate(new Date()); // Also set archivedDate

    const activeTargetRef = doc(db, "users", userId, "prayerTargets", targetId);
    const archivedTargetRef = doc(db, "users", userId, "archivedTargets", targetId);

    try {
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
            archivedDate: archivedDate, // Save archivedDate
        };

        const batch = writeBatch(db);
        batch.delete(activeTargetRef);
        batch.set(archivedTargetRef, archivedData);
        await batch.commit();

        prayerTargets.splice(targetIndex, 1);
        const newArchivedLocal = rehydrateTargets([archivedData])[0];
        archivedTargets.unshift(newArchivedLocal);
        archivedTargets.sort((a, b) => (b.date || 0) - (a.date || 0));
        resolvedTargets = archivedTargets.filter(t => t.resolved);
        resolvedTargets.sort((a, b) => (b.resolutionDate || 0) - (a.resolutionDate || 0));

        renderTargets();
        renderArchivedTargets();
        renderResolvedTargets();
        alert('Alvo marcado como respondido e movido para Arquivados.');
    } catch (error) {
        console.error("Error marking target as resolved: ", error);
        alert("Erro ao marcar como respondido.");
    }
};

// Function to mark an ALREADY ARCHIVED target as resolved
window.markArchivedAsResolved = async function(targetId) {
    const user = auth.currentUser;
    if (!user) { alert("Erro: Usuário não autenticado."); return; }
    const userId = user.uid;

    const targetIndex = archivedTargets.findIndex(t => t.id === targetId && !t.resolved); // Find in archived, ensure not already resolved
    if (targetIndex === -1) { alert("Erro: Alvo arquivado não encontrado ou já está marcado como respondido."); return; }

    const targetData = archivedTargets[targetIndex];
    const resolutionDate = Timestamp.fromDate(new Date()); // Current time as resolution

    const archivedTargetRef = doc(db, "users", userId, "archivedTargets", targetId);

    try {
        // Update only the necessary fields in Firestore
        await updateDoc(archivedTargetRef, {
            resolved: true,
            resolutionDate: resolutionDate
        });

        // Update Local State
        archivedTargets[targetIndex].resolved = true;
        archivedTargets[targetIndex].resolutionDate = resolutionDate.toDate(); // Update local Date

        // Recalculate resolvedTargets list
        resolvedTargets = archivedTargets.filter(t => t.resolved);
        resolvedTargets.sort((a, b) => (b.resolutionDate || 0) - (a.resolutionDate || 0)); // Keep sorted

        // Re-render relevant lists
        renderArchivedTargets();
        renderResolvedTargets();
        alert('Alvo arquivado marcado como respondido.');
    } catch (error) {
        console.error("Error marking archived target as resolved: ", error);
        alert("Erro ao marcar alvo arquivado como respondido.");
    }
};


window.archiveTarget = async function(targetId) {
    const user = auth.currentUser;
    if (!user) { alert("Erro: Usuário não autenticado."); return; }
    const userId = user.uid;

    const targetIndex = prayerTargets.findIndex(t => t.id === targetId);
    if (targetIndex === -1) { alert("Erro: Alvo não encontrado."); return; }

    const targetData = prayerTargets[targetIndex];
    const archivedDate = Timestamp.fromDate(new Date()); // Set current time as archivedDate

    const activeTargetRef = doc(db, "users", userId, "prayerTargets", targetId);
    const archivedTargetRef = doc(db, "users", userId, "archivedTargets", targetId);

    try {
        const archivedData = {
             ...targetData,
             date: targetData.date instanceof Date ? Timestamp.fromDate(targetData.date) : targetData.date,
             deadlineDate: targetData.deadlineDate instanceof Date ? Timestamp.fromDate(targetData.deadlineDate) : targetData.deadlineDate,
             observations: Array.isArray(targetData.observations) ? targetData.observations.map(obs => ({
                 ...obs,
                 date: obs.date instanceof Date ? Timestamp.fromDate(obs.date) : obs.date
             })) : [],
             resolved: false, // Target is only archived, not resolved
             archived: true,
             archivedDate: archivedDate, // Save archivedDate
             resolutionDate: null // Ensure resolutionDate is null
         };

        const batch = writeBatch(db);
        batch.delete(activeTargetRef);
        batch.set(archivedTargetRef, archivedData);
        await batch.commit();

        prayerTargets.splice(targetIndex, 1);
        const newArchivedLocal = rehydrateTargets([archivedData])[0];
        archivedTargets.unshift(newArchivedLocal);
        archivedTargets.sort((a, b) => (b.date || 0) - (a.date || 0));
        // Resolved list doesn't change when just archiving
        resolvedTargets = archivedTargets.filter(t => t.resolved); // Recalculate just in case
        resolvedTargets.sort((a, b) => (b.resolutionDate || 0) - (a.resolutionDate || 0));

        renderTargets();
        renderArchivedTargets();
        // renderResolvedTargets(); // No need to re-render resolved unless data structure changed
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
     if (!confirm(`Tem certeza que deseja excluir permanentemente o alvo "${targetTitle}"? Esta ação não pode ser desfeita.`)) return;

     const archivedTargetRef = doc(db, "users", userId, "archivedTargets", targetId);
     const clickCountsRef = doc(db, "prayerClickCounts", targetId); // Also target click counts doc

     try {
         const batch = writeBatch(db);
         batch.delete(archivedTargetRef);
         // Try deleting click counts, but don't fail if it doesn't exist
         batch.delete(clickCountsRef);

         await batch.commit();

         // Update Local State
         const targetIndex = archivedTargets.findIndex(t => t.id === targetId);
         if (targetIndex !== -1) archivedTargets.splice(targetIndex, 1);
         resolvedTargets = archivedTargets.filter(target => target.resolved);
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
        document.getElementById(`observationDate-${targetId}`).value = formatDateToISO(new Date());
    } catch (e) {
        console.error("[renderObservationForm] Error setting default date:", e);
        document.getElementById(`observationDate-${targetId}`).value = '';
    }
}

window.saveObservation = async function(targetId) {
    const observationText = document.getElementById(`observationText-${targetId}`).value.trim();
    const observationDateInput = document.getElementById(`observationDate-${targetId}`).value;

    if (!observationText || !observationDateInput) { alert('Texto e Data da observação são obrigatórios.'); return; }

    const observationDateUTC = createUTCDate(observationDateInput);
    if (!observationDateUTC) { alert('Data da observação inválida.'); return; }

    const user = auth.currentUser;
    if (!user) { alert("Erro: Usuário não autenticado."); return; }
    const userId = user.uid;

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
        date: Timestamp.fromDate(observationDateUTC),
        id: generateUniqueId(),
        targetId: targetId
    };

    try {
        const targetDocSnap = await getDoc(targetRef);
        if (!targetDocSnap.exists()) {
            throw new Error("Target document does not exist in Firestore.");
        }
        const currentData = targetDocSnap.data();
        const currentObservations = currentData.observations || [];
        currentObservations.push(newObservation);
        currentObservations.sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));

        await updateDoc(targetRef, { observations: currentObservations });

        const currentTargetLocal = targetList[targetIndex];
        if (!currentTargetLocal.observations || !Array.isArray(currentTargetLocal.observations)) {
            currentTargetLocal.observations = [];
        }
        currentTargetLocal.observations.push({
            ...newObservation,
            date: newObservation.date.toDate()
        });
        currentTargetLocal.observations.sort((a, b) => (b.date || 0) - (a.date || 0));

        // Determine which panel is currently visible to re-render only that one if needed
        const activePanelId = ['mainPanel', 'archivedPanel', 'resolvedPanel'].find(id => document.getElementById(id)?.style.display === 'block');

        if (targetList === prayerTargets && activePanelId === 'mainPanel') renderTargets();
        else if (targetList === archivedTargets) {
            if (activePanelId === 'archivedPanel') renderArchivedTargets();
            if (activePanelId === 'resolvedPanel' && resolvedTargets.some(rt => rt.id === targetId)) renderResolvedTargets();
        } else {
            // If the target was updated but its panel is not visible, no immediate re-render needed
            console.log("Observation saved for target in an inactive panel.");
        }

        // Also re-render daily targets if the modified target is currently displayed there
        const dailyTargetDiv = document.querySelector(`#dailyTargets .target[data-target-id="${targetId}"]`);
        if (dailyTargetDiv) {
             console.log("Target is in daily list, reloading daily targets.");
             loadDailyTargets(); // Reload daily targets to reflect observation change
        }


        toggleAddObservation(targetId);
        document.getElementById(`observationText-${targetId}`).value = '';

    } catch (error) {
        console.error("Error saving observation:", error);
        alert("Erro ao salvar observação.");
    }
};

// Renders observations list within a target div
function renderObservations(observations, isExpanded = false, targetId = null) {
    if (!Array.isArray(observations) || observations.length === 0) return '<div class="observations"></div>'; // Return empty container

    observations.sort((a, b) => (b.date || 0) - (a.date || 0));

    const displayCount = isExpanded ? observations.length : 1;
    const visibleObservations = observations.slice(0, displayCount);
    const remainingCount = observations.length - displayCount;

    let observationsHTML = `<div class="observations">`;
    visibleObservations.forEach(observation => {
        const formattedDate = formatDateForDisplay(observation.date);
        observationsHTML += `<p class="observation-item"><strong>${formattedDate}:</strong> ${observation.text || ''}</p>`;
    });

    if (targetId) {
        if (!isExpanded && remainingCount > 0) {
            observationsHTML += `<a href="#" class="observations-toggle" onclick="window.toggleObservations('${targetId}', event); return false;">Ver mais ${remainingCount} observações</a>`;
        } else if (isExpanded && observations.length > 1) {
            observationsHTML += `<a href="#" class="observations-toggle" onclick="window.toggleObservations('${targetId}', event); return false;">Ver menos observações</a>`;
        }
    }

    observationsHTML += `</div>`;
    return observationsHTML;
}

// Toggles the expanded state of observations for a target
window.toggleObservations = function(targetId, event) {
    if (event) event.preventDefault();
    // Find the target div in ANY visible panel or daily section
    const targetDiv = document.querySelector(`.target[data-target-id="${targetId}"]`);
    if (!targetDiv) { console.warn("Target div not found for toggle:", targetId); return; }
    const observationsContainer = targetDiv.querySelector('.observations');
    if (!observationsContainer) { console.warn("Observations container not found for toggle:", targetId); return; }

    const isExpanded = observationsContainer.querySelector('.observations-toggle')?.textContent.includes('Ver menos');

    // Find the target data (search all lists)
    const target = prayerTargets.find(t => t.id === targetId) ||
                   archivedTargets.find(t => t.id === targetId);

    if (!target) { console.warn("Target data not found for toggle:", targetId); return; }

    const newObservationsHTML = renderObservations(target.observations || [], !isExpanded, targetId);
    observationsContainer.outerHTML = newObservationsHTML;
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
        return;
    }

    let currentDeadlineISO = '';
    if (target.deadlineDate instanceof Date && !isNaN(target.deadlineDate)) {
        currentDeadlineISO = formatDateToISO(target.deadlineDate);
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
    } else {
         targetDiv.insertAdjacentHTML('beforeend', formHTML);
    }
    document.getElementById(`editDeadlineDate-${targetId}`)?.focus();
};

window.saveEditedDeadline = async function(targetId) {
    const newDeadlineDateInput = document.getElementById(`editDeadlineDate-${targetId}`);
    if (!newDeadlineDateInput) return;
    const newDeadlineValue = newDeadlineDateInput.value;

    let newDeadlineTimestamp = null;
    let newHasDeadline = false;

    if (newDeadlineValue) {
        const newDeadlineUTC = createUTCDate(newDeadlineValue);
        if (!newDeadlineUTC) {
            alert("Data do prazo inválida."); return;
        }
        newDeadlineTimestamp = Timestamp.fromDate(newDeadlineUTC);
        newHasDeadline = true;
    } else {
        if (!confirm("Nenhuma data selecionada. Deseja remover o prazo deste alvo?")) return;
    }

    await updateDeadlineInFirestoreAndLocal(targetId, newDeadlineTimestamp, newHasDeadline);
    cancelEditDeadline(targetId);
};

async function updateDeadlineInFirestoreAndLocal(targetId, newDeadlineTimestamp, newHasDeadline) {
     const user = auth.currentUser;
     if (!user) return;
     const userId = user.uid;
     const targetRef = doc(db, "users", userId, "prayerTargets", targetId);

     try {
         await updateDoc(targetRef, {
             deadlineDate: newDeadlineTimestamp,
             hasDeadline: newHasDeadline
         });

         const targetIndex = prayerTargets.findIndex(target => target.id === targetId);
         if (targetIndex !== -1) {
             prayerTargets[targetIndex].deadlineDate = newDeadlineTimestamp ? newDeadlineTimestamp.toDate() : null;
             prayerTargets[targetIndex].hasDeadline = newHasDeadline;
         }

         renderTargets(); // Re-render main panel
          // Also re-render daily targets if the modified target is currently displayed there
         const dailyTargetDiv = document.querySelector(`#dailyTargets .target[data-target-id="${targetId}"]`);
         if (dailyTargetDiv) {
              loadDailyTargets();
         }
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
async function loadDailyTargets() {
    const userId = auth.currentUser ? auth.currentUser.uid : null;
    if (!userId) {
        document.getElementById("dailyTargets").innerHTML = "<p>Faça login para ver os alvos diários.</p>";
        return;
    }

    const today = new Date();
    const todayStr = formatDateToISO(today);
    const dailyDocId = `${userId}_${todayStr}`;
    const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);

    try {
        let dailyTargetsData;
        const dailySnapshot = await getDoc(dailyRef);

        if (!dailySnapshot.exists() || !dailySnapshot.data()?.targets) {
            console.log(`[loadDailyTargets] Daily document for ${dailyDocId} not found or invalid, generating new targets.`);
            dailyTargetsData = await generateDailyTargets(userId, todayStr);
            if (dailyTargetsData && dailyTargetsData.targets) { // Check if generation was successful
                 await setDoc(dailyRef, dailyTargetsData);
                 console.log(`[loadDailyTargets] Daily document ${dailyDocId} created successfully.`);
            } else {
                 console.error("[loadDailyTargets] Failed to generate daily targets.");
                 document.getElementById("dailyTargets").innerHTML = "<p>Erro ao gerar alvos diários.</p>";
                 return;
             }
        } else {
            dailyTargetsData = dailySnapshot.data();
            console.log(`[loadDailyTargets] Daily document ${dailyDocId} loaded from Firestore.`);
            // Ensure targets array exists
             if (!Array.isArray(dailyTargetsData.targets)) {
                 console.warn(`[loadDailyTargets] Daily document ${dailyDocId} exists but 'targets' array is missing or invalid. Regenerating.`);
                 dailyTargetsData = await generateDailyTargets(userId, todayStr);
                 await setDoc(dailyRef, dailyTargetsData);
             }
        }

        if (!dailyTargetsData || !Array.isArray(dailyTargetsData.targets)) {
            console.error("[loadDailyTargets] Invalid or missing daily targets data after checks:", dailyTargetsData);
            document.getElementById("dailyTargets").innerHTML = "<p>Erro ao carregar alvos diários. Dados inválidos.</p>";
            return;
        }

        const pendingTargetIds = dailyTargetsData.targets.filter(t => !t.completed).map(t => t.targetId);
        const completedTargetIds = dailyTargetsData.targets.filter(t => t.completed).map(t => t.targetId);

        console.log(`[loadDailyTargets] Pending targets: ${pendingTargetIds.length}, Completed targets: ${completedTargetIds.length}`);

        const allTargetIds = [...pendingTargetIds, ...completedTargetIds];
        if (allTargetIds.length === 0) {
            document.getElementById("dailyTargets").innerHTML = "<p>Nenhum alvo de oração selecionado para hoje. Adicione mais alvos ou aguarde o reinício do ciclo.</p>";
             displayRandomVerse();
            return;
        }

        // Fetch details using locally stored prayerTargets (active only needed here)
        const activePrayerTargets = prayerTargets; // Assuming prayerTargets only holds active ones
        const targetsToDisplayDetails = activePrayerTargets.filter(pt => pt && pt.id && allTargetIds.includes(pt.id));

        // Handle potential inconsistencies (target exists in daily doc but not in active list)
        const foundIds = targetsToDisplayDetails.map(t => t.id);
        const missingIds = allTargetIds.filter(id => !foundIds.includes(id));
        if (missingIds.length > 0) {
             console.warn(`[loadDailyTargets] Targets ${missingIds.join(', ')} found in daily doc but not in local active list. They might be archived.`);
             // Optionally: Clean up the daily doc here if needed, removing references to archived targets
         }


        const pendingTargetsDetails = targetsToDisplayDetails.filter(t => pendingTargetIds.includes(t.id));
        const completedTargetsDetails = targetsToDisplayDetails.filter(t => completedTargetIds.includes(t.id));

        renderDailyTargets(pendingTargetsDetails, completedTargetsDetails);
        displayRandomVerse();

    } catch (error) {
        console.error("[loadDailyTargets] General error loading daily targets:", error);
        document.getElementById("dailyTargets").innerHTML = "<p>Erro ao carregar alvos diários.</p>";
    }
}

async function generateDailyTargets(userId, dateStr) {
    try {
        // Ensure active targets are loaded (should be in prayerTargets global)
        const availableTargets = prayerTargets.filter(t => t && t.id && !t.archived); // Double check ID and not archived

        if (availableTargets.length === 0) {
            console.log("[generateDailyTargets] No active targets found.");
            return { userId, date: dateStr, targets: [] };
        }

        // Fetch yesterday's completed targets
        const todayUTC = createUTCDate(dateStr);
        if (!todayUTC) {
             console.error("[generateDailyTargets] Could not parse today's date string:", dateStr);
             return { userId, date: dateStr, targets: [] };
        }
        const yesterdayUTC = new Date(todayUTC.getTime() - 24 * 60 * 60 * 1000);
        const yesterdayStr = formatDateToISO(yesterdayUTC);
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
        let pool = availableTargets.filter(target => !completedYesterdayIds.includes(target.id));

        // Cycle Restart Logic: If pool is empty, reset to all available targets
        if (pool.length === 0 && availableTargets.length > 0) {
             console.log("[generateDailyTargets] Pool empty or all completed yesterday. Restarting cycle with all active targets.");
             pool = [...availableTargets]; // Reset pool to all available targets
        } else if (pool.length === 0) {
             console.log("[generateDailyTargets] No targets available in the pool today (after exclusion).");
             return { userId, date: dateStr, targets: [] };
        }

        // Select random targets (up to 10)
        const shuffledPool = pool.sort(() => 0.5 - Math.random());
        const maxTargets = 10;
        const selectedTargets = shuffledPool.slice(0, Math.min(maxTargets, pool.length));
        const targetsForFirestore = selectedTargets.map(target => ({ targetId: target.id, completed: false }));

        // Update lastPresentedDate (run in background, don't wait)
        updateLastPresentedDates(userId, selectedTargets);

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
            // Update only if the target still exists in the main collection
             batch.update(targetRef, { lastPresentedDate: nowTimestamp });
        }
    });
    try {
        await batch.commit();
        console.log(`[updateLastPresentedDates] Updated lastPresentedDate for ${selectedTargets.length} targets.`);
    } catch (error) {
        // Log error but don't block execution, it's non-critical
        console.error("[updateLastPresentedDates] Error updating lastPresentedDate (non-critical):", error);
    }
}

function renderDailyTargets(pendingTargets, completedTargets) {
    const dailyTargetsDiv = document.getElementById("dailyTargets");
    dailyTargetsDiv.innerHTML = ''; // Clear previous content

    if (pendingTargets.length === 0 && completedTargets.length === 0) {
        dailyTargetsDiv.innerHTML = "<p>Nenhum alvo de oração selecionado para hoje.</p>";
        return;
    }

    // Render Pending Targets
    pendingTargets.forEach((target) => {
        if (!target || !target.id) { console.warn("Skipping invalid pending target:", target); return; }
        const dailyDiv = createTargetElement(target, false); // isCompleted = false
        addPrayButtonFunctionality(dailyDiv, target.id);
        dailyTargetsDiv.appendChild(dailyDiv);
    });

    // Separator and Title for Completed Targets
    if (completedTargets.length > 0) {
        if (pendingTargets.length > 0) {
            const separator = document.createElement('hr');
            separator.className = 'daily-separator'; // Add class for potential styling
            dailyTargetsDiv.appendChild(separator);
        }
        const completedTitle = document.createElement('h3');
        completedTitle.textContent = "Concluídos Hoje";
        completedTitle.className = 'completed-title'; // Add class for potential styling
        dailyTargetsDiv.appendChild(completedTitle);

        // Render Completed Targets
        completedTargets.forEach((target) => {
            if (!target || !target.id) { console.warn("Skipping invalid completed target:", target); return; }
            const dailyDiv = createTargetElement(target, true); // isCompleted = true
            // No "Orei!" button for completed targets
            dailyTargetsDiv.appendChild(dailyDiv);
        });
    }

    // Check for completion popup only if there were pending targets initially and now there are none
    const initialTotalTargets = pendingTargets.length + completedTargets.length;
    if (pendingTargets.length === 0 && initialTotalTargets > 0) {
        displayCompletionPopup();
    }
}

function createTargetElement(target, isCompleted) {
    const dailyDiv = document.createElement("div");
    dailyDiv.classList.add("target"); // Base class
    if (isCompleted) dailyDiv.classList.add("completed-target"); // Class if completed
    dailyDiv.dataset.targetId = target.id;

    const deadlineTag = target.hasDeadline
        ? `<span class="deadline-tag ${isDateExpired(target.deadlineDate) ? 'expired' : ''} ${isCompleted ? 'completed' : ''}">Prazo: ${formatDateForDisplay(target.deadlineDate)}</span>`
        : '';
    // Render observations initially collapsed, pass targetId for toggling
    const observationsHTML = renderObservations(target.observations || [], false, target.id);

    dailyDiv.innerHTML = `
        <h3>${deadlineTag} ${target.title || 'Título Indisponível'}</h3>
        <p>${target.details || 'Detalhes Indisponíveis'}</p>
        <p><strong>Data Criação:</strong> ${formatDateForDisplay(target.date)}</p>
        <p><strong>Tempo Decorrido:</strong> ${timeElapsed(target.date)}</p>
        ${observationsHTML}
    `;
    // Note: The "Orei!" button is added separately by addPrayButtonFunctionality for pending targets
    return dailyDiv;
}


function addPrayButtonFunctionality(dailyDiv, targetId) {
    const prayButton = document.createElement("button");
    prayButton.textContent = "Orei!";
    prayButton.classList.add("pray-button", "btn");
    prayButton.onclick = async () => {
        const user = auth.currentUser;
        if (!user) { alert("Erro: Usuário não autenticado."); return; }
        const userId = user.uid;

        const todayStr = formatDateToISO(new Date());
        const dailyDocId = `${userId}_${todayStr}`;
        const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);

        prayButton.disabled = true;
        prayButton.textContent = "Orado!";
        prayButton.style.backgroundColor = "#ccc"; // Visually indicate disabled state

        try {
            const dailySnap = await getDoc(dailyRef);
            if (!dailySnap.exists()) {
                 console.error("Daily document not found when marking prayed:", dailyDocId);
                 alert("Erro: Documento diário não encontrado.");
                 prayButton.disabled = false; prayButton.textContent = "Orei!"; prayButton.style.backgroundColor = "";
                 return;
             }
            const dailyData = dailySnap.data();
            let targetUpdated = false;

             if (!Array.isArray(dailyData.targets)) {
                 console.error("Daily document targets array is invalid:", dailyDocId);
                 alert("Erro: Dados diários corrompidos.");
                 prayButton.disabled = false; prayButton.textContent = "Orei!"; prayButton.style.backgroundColor = "";
                 return;
             }

            const updatedTargets = dailyData.targets.map(t => {
                if (t.targetId === targetId) {
                    targetUpdated = true;
                    return { ...t, completed: true };
                }
                return t;
            });

            if (!targetUpdated) console.warn(`Target ${targetId} not found in daily doc ${dailyDocId}.`);

            await updateDoc(dailyRef, { targets: updatedTargets });
            await updateClickCounts(userId, targetId); // Update stats in background

            // Update UI immediately instead of full reload for better UX
            dailyDiv.classList.add("completed-target");
            prayButton.remove(); // Remove the button after clicking

             // Check if this was the last pending target
            const remainingPending = dailyTargetsDiv.querySelectorAll('.target:not(.completed-target)');
             if (remainingPending.length === 0) {
                 // Move the now completed target to the completed section visually
                 const completedTitle = dailyTargetsDiv.querySelector('.completed-title');
                 const separator = dailyTargetsDiv.querySelector('.daily-separator');
                 if (completedTitle) {
                     dailyTargetsDiv.insertBefore(dailyDiv, completedTitle.nextSibling); // Insert after title
                 } else {
                     // If no completed section existed, create it
                     if (!separator) {
                         const newSeparator = document.createElement('hr');
                         newSeparator.className = 'daily-separator';
                         dailyTargetsDiv.appendChild(newSeparator);
                     }
                      const newCompletedTitle = document.createElement('h3');
                      newCompletedTitle.textContent = "Concluídos Hoje";
                      newCompletedTitle.className = 'completed-title';
                      dailyTargetsDiv.appendChild(newCompletedTitle);
                      dailyTargetsDiv.appendChild(dailyDiv); // Append target after new title
                 }
                 displayCompletionPopup(); // Show popup as all are done
             }


        } catch (error) {
            console.error("Error registering 'Orei!':", error);
            alert("Erro ao registrar oração.");
            prayButton.disabled = false; prayButton.textContent = "Orei!"; prayButton.style.backgroundColor = "";
        }
    };
     // Insert pray button within the target div, perhaps before the content
     dailyDiv.insertBefore(prayButton, dailyDiv.firstChild);
}


async function updateClickCounts(userId, targetId) {
     const clickCountsRef = doc(db, "prayerClickCounts", targetId);
     const now = new Date();
     const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
     const year = now.getFullYear().toString();

     try {
         // Use setDoc with merge:true which acts like upsert (update or insert)
         await setDoc(clickCountsRef, {
             targetId: targetId,
             userId: userId, // Store userId for potential rules/queries
             totalClicks: increment(1),
             [`monthlyClicks.${yearMonth}`]: increment(1),
             [`yearlyClicks.${year}`]: increment(1),
             // lastClickTimestamp: Timestamp.fromDate(now) // Optional: track last click time
         }, { merge: true });
         console.log(`[updateClickCounts] Click count updated for target ${targetId}.`);
     } catch (error) {
         console.error(`[updateClickCounts] Error updating click count for ${targetId}:`, error);
         // Non-critical error, maybe log to analytics?
     }
 }

// --- Perseverança ---
async function loadPerseveranceData(userId) {
     console.log(`[loadPerseveranceData] Loading for user ${userId}`);
    const perseveranceDocRef = doc(db, "perseveranceData", userId);
    try {
        const docSnap = await getDoc(perseveranceDocRef);
        if (docSnap.exists()) {
            perseveranceData = docSnap.data();
            if (perseveranceData.lastInteractionDate instanceof Timestamp) {
                perseveranceData.lastInteractionDate = perseveranceData.lastInteractionDate.toDate();
            }
            // Ensure numbers are treated as numbers
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
    const todayUTCStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

    let lastInteractionUTCStart = null;
     if (perseveranceData.lastInteractionDate instanceof Date && !isNaN(perseveranceData.lastInteractionDate)) {
         const li = perseveranceData.lastInteractionDate;
         lastInteractionUTCStart = new Date(Date.UTC(li.getUTCFullYear(), li.getUTCMonth(), li.getUTCDate()));
     }

    if (!lastInteractionUTCStart || todayUTCStart.getTime() > lastInteractionUTCStart.getTime()) {
         let isConsecutive = false;
         if (lastInteractionUTCStart) {
             const expectedYesterdayUTCStart = new Date(todayUTCStart.getTime() - 24 * 60 * 60 * 1000);
             if (lastInteractionUTCStart.getTime() === expectedYesterdayUTCStart.getTime()) {
                 isConsecutive = true;
             }
         }

         perseveranceData.consecutiveDays = isConsecutive ? (perseveranceData.consecutiveDays || 0) + 1 : 1;
         perseveranceData.lastInteractionDate = todayUTCStart; // Store Date object locally
         perseveranceData.recordDays = perseveranceData.recordDays || 0; // Ensure recordDays is a number
         if (perseveranceData.consecutiveDays > perseveranceData.recordDays) {
             perseveranceData.recordDays = perseveranceData.consecutiveDays;
         }

         try {
            await updatePerseveranceFirestore(userId, perseveranceData);
            updatePerseveranceUI();
             alert(`Perseverança confirmada! Dias consecutivos: ${perseveranceData.consecutiveDays}. Recorde: ${perseveranceData.recordDays} dias.`);
         } catch (error) {
              console.error("[confirmPerseverance] Error updating Firestore:", error);
              alert("Erro ao salvar dados de perseverança.");
              // Revert local state if save fails? Maybe not necessary, retry later.
         }
    } else {
        alert(`Perseverança já confirmada para hoje (${formatDateForDisplay(today)})!`);
    }
}

async function updatePerseveranceFirestore(userId, data) {
    const perseveranceDocRef = doc(db, "perseveranceData", userId);
     const dataToSave = {
         consecutiveDays: data.consecutiveDays || 0,
         // Convert Date back to Timestamp for Firestore storage
         lastInteractionDate: data.lastInteractionDate instanceof Date ? Timestamp.fromDate(data.lastInteractionDate) : null,
         recordDays: data.recordDays || 0
     };
    await setDoc(perseveranceDocRef, dataToSave, { merge: true }); // Use merge: true to avoid overwriting unrelated fields if any exist
}


function updatePerseveranceUI() {
     const consecutiveDays = perseveranceData.consecutiveDays || 0;
    const targetDays = 30; // Or make this configurable later
    const percentage = Math.min(Math.max(0, (consecutiveDays / targetDays) * 100), 100); // Ensure 0-100 range
    const progressBar = document.getElementById('perseveranceProgressBar');
    const percentageDisplay = document.getElementById('perseverancePercentage');

    if (progressBar && percentageDisplay) {
        progressBar.style.width = `${percentage}%`;
        percentageDisplay.textContent = `${Math.round(percentage)}%`; // Show rounded percentage
    } else {
        console.warn("Perseverance UI elements not found.");
    }
    updateWeeklyChart(); // Update the visual week chart
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

    if (perseveranceData.lastInteractionDate instanceof Date && !isNaN(perseveranceData.lastInteractionDate)) {
        const li = perseveranceData.lastInteractionDate;
        lastInteractionUTCStartMs = Date.UTC(li.getUTCFullYear(), li.getUTCMonth(), li.getUTCDate());
    }

    // Get the current local day of the week (0=Sun, 6=Sat)
    const currentDayOfWeek = today.getDay();

    // Iterate through the days displayed in the chart (typically Sun-Sat, IDs day-0 to day-6)
    for (let i = 0; i < 7; i++) {
         const dayTick = document.getElementById(`day-${i}`);
         if (dayTick) {
             // Calculate the date for this slot in the chart
             const dayDifference = i - currentDayOfWeek; // How many days ago/ahead this slot is
             const chartDay = new Date(today);
             chartDay.setDate(today.getDate() + dayDifference);

             // Get the UTC midnight timestamp for that chart day
             const chartDayUTCStartMs = Date.UTC(chartDay.getUTCFullYear(), chartDay.getUTCMonth(), chartDay.getUTCDate());

              // Check if we have interaction data and if the last interaction matches this chart day
              const isActive = lastInteractionUTCStartMs !== null && chartDayUTCStartMs <= lastInteractionUTCStartMs;
              // Check further back if needed based on consecutive days
              let shouldBeActive = false;
              if(isActive && perseveranceData.consecutiveDays > 0) {
                 // How many days ago was the last interaction?
                 const daysSinceLastInteraction = Math.round((Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - lastInteractionUTCStartMs) / (1000 * 60 * 60 * 24));
                 // How many days ago is the current chart slot?
                 const daysAgoChartSlot = Math.round((Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - chartDayUTCStartMs) / (1000 * 60 * 60 * 24));

                 // Activate if the chart slot falls within the consecutive range ending on the last interaction day
                 if (daysAgoChartSlot >= daysSinceLastInteraction && daysAgoChartSlot < (daysSinceLastInteraction + perseveranceData.consecutiveDays)) {
                     shouldBeActive = true;
                 }
              }


             if (shouldBeActive) {
                 dayTick.classList.add('active');
             } else {
                 dayTick.classList.remove('active');
             }
         }
    }
}


function resetWeeklyChart() {
    for (let i = 0; i < 7; i++) {
        const dayTick = document.getElementById(`day-${i}`);
        if (dayTick) {
            dayTick.classList.remove('active');
        }
    }
}

// --- Visualizações e Filtros ---

// *** FUNÇÃO MODIFICADA PARA DOWNLOAD ***
// Gera o HTML e dispara o download como arquivo
// *** FUNÇÃO MODIFICADA PARA DOWNLOAD E VERSÍCULO ALEATÓRIO ***
// Gera o HTML e dispara o download como arquivo
function generateViewHTML(targetsToInclude = lastDisplayedTargets) {
    // --- 1. SELECIONAR VERSÍCULO ALEATÓRIO ---
    let randomVerse = ''; // Inicializa vazio
    if (typeof verses !== 'undefined' && Array.isArray(verses) && verses.length > 0) {
        const randomIndex = Math.floor(Math.random() * verses.length);
        randomVerse = verses[randomIndex];
    } else {
        console.warn("Array 'verses' não encontrada ou vazia. Não foi possível adicionar versículo.");
    }
    // --- FIM DA SELEÇÃO ---

    let viewHTML = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Alvos de Oração - Visualização Geral</title>
            <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap">
            <style>
                /* Estilos básicos para a visualização */
                body { font-family: 'Playfair Display', serif; margin: 20px; background-color: #f9f9f9; color: #333; }
                h1, h2 { text-align: center; color: #333; }
                .target { border: 1px solid #ddd; border-radius: 5px; background-color: #fff; padding: 15px; margin-bottom: 15px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: left; }
                .target h3 { margin-top: 0; font-size: 1.3em; color: #444; }
                .target p { margin: 5px 0; line-height: 1.5; }
                .deadline-tag { background-color: #ffcc00; color: #333; padding: 3px 8px; border-radius: 4px; font-size: 0.8em; margin-right: 8px; }
                .deadline-tag.expired { background-color: #ff6666; color: #fff; }
                .observations { margin-top: 10px; padding-top: 10px; border-top: 1px dotted #eee; }
                .observation-item { font-size: 0.9em; color: #555; margin-bottom: 5px; padding-left: 10px; }
                .observation-item strong { color: #333; }
                hr { border: 0; border-top: 1px solid #ccc; margin: 20px 0; }

                /* --- 3. ESTILO OPCIONAL PARA O VERSÍCULO --- */
                .verse-container {
                    text-align: center;
                    font-style: italic;
                    color: #555;
                    margin-top: 15px;
                    margin-bottom: 25px; /* Aumenta espaço antes da lista */
                    padding: 10px;
                    border-top: 1px dashed #ccc;
                    border-bottom: 1px dashed #ccc;
                }
                /* --- FIM DO ESTILO --- */

                @media print { /* Simple print styles */
                  body { background-color: #fff; }
                  .target { box-shadow: none; border: 1px solid #ccc; }
                  .verse-container { border: none; } /* Remove bordas ao imprimir */
                }
            </style>
        </head>
        <body>
            <h1>Meus Alvos de Oração - Visualização Geral</h1>
            <h2>Gerado em: ${formatDateForDisplay(new Date())}</h2>

            <!-- --- 2. INSERIR O VERSÍCULO NO HTML --- -->
            ${randomVerse ? `<div class="verse-container">${randomVerse}</div>` : ''}
            <!-- --- FIM DA INSERÇÃO --- -->

            <hr> {/* Mantém a linha antes dos alvos */}
    `;

    if (!Array.isArray(targetsToInclude) || targetsToInclude.length === 0) {
        viewHTML += "<p>Nenhum alvo para exibir nesta visualização (Verifique os filtros aplicados).</p>";
    } else {
        // Sort targets by date descending for the view
        targetsToInclude.sort((a, b) => (b.date || 0) - (a.date || 0));
        targetsToInclude.forEach(target => {
             if (!target || !target.id) return;
             viewHTML += generateTargetViewHTML(target); // Reutiliza a função auxiliar
        });
    }

    viewHTML += `
        </body>
        </html>
    `;
    // Lógica para Download
    try {
        const filenameDate = formatDateForFilename(new Date()); // Usa a nova função DD-MM-AAAA
        const filename = `Alvos de oração geral até o dia ${filenameDate}.html`;

        const blob = new Blob([viewHTML], { type: 'text/html;charset=utf-8' });
        const link = document.createElement("a");

        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.style.display = 'none'; // Oculta o link

        document.body.appendChild(link); // Adiciona o link ao DOM
        link.click(); // Simula o clique para iniciar o download
        document.body.removeChild(link); // Remove o link do DOM
        URL.revokeObjectURL(link.href); // Libera a memória

        console.log(`[generateViewHTML] Download do arquivo '${filename}' iniciado.`);
        // alert('Download da visualização iniciado!'); // Opcional

    } catch (error) {
        console.error("[generateViewHTML] Erro ao gerar ou baixar o arquivo:", error);
        alert("Ocorreu um erro ao tentar gerar o arquivo para download.");
        // Fallback (abrir em nova aba) removido conforme solicitado para focar no download
    }
}

// Helper for view generation (HTML structure for a single target)
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
     const observationsHTML = renderObservationsForView(observations); // Use specific helper for view

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

// Helper specifically for rendering observations in static views (always expanded)
function renderObservationsForView(observations) {
    if (!Array.isArray(observations) || observations.length === 0) return '';
    observations.sort((a, b) => (b.date || 0) - (a.date || 0)); // Sort by date desc

    let observationsHTML = `<div class="observations"><h4>Observações:</h4>`;
    observations.forEach(observation => {
        const formattedDate = formatDateForDisplay(observation.date);
        observationsHTML += `<p class="observation-item"><strong>${formattedDate}:</strong> ${observation.text || ''}</p>`;
    });
    observationsHTML += `</div>`;
    return observationsHTML;
}


function generateDailyViewHTML() {
    let viewHTML = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Alvos de Oração - Visualização Diária</title>
            <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap">
             <style>
                 /* Reuse styles from generateViewHTML */
                 body { font-family: 'Playfair Display', serif; margin: 20px; background-color: #f9f9f9; color: #333; }
                 h1, h2 { text-align: center; color: #333; }
                 .target { border: 1px solid #ddd; border-radius: 5px; background-color: #fff; padding: 15px; margin-bottom: 15px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: left; }
                 .target.completed-target { background-color: #f0f0f0; border-left: 3px solid #9cbe4a; }
                 .target h3 { margin-top: 0; font-size: 1.3em; color: #444; }
                 .target p { margin: 5px 0; line-height: 1.5; }
                 .deadline-tag { background-color: #ffcc00; color: #333; padding: 3px 8px; border-radius: 4px; font-size: 0.8em; margin-right: 8px; }
                 .deadline-tag.expired { background-color: #ff6666; color: #fff; }
                 .observations { margin-top: 10px; padding-top: 10px; border-top: 1px dotted #eee; }
                  .observation-item { font-size: 0.9em; color: #555; margin-bottom: 5px; padding-left: 10px; }
                  .observation-item strong { color: #333; }
                 hr { border: 0; border-top: 1px solid #ccc; margin: 20px 0; }
                 @media print { body { background-color: #fff; } .target { box-shadow: none; border: 1px solid #ccc; } }
            </style>
        </head>
        <body>
            <h1>Alvos de Oração do Dia</h1>
            <h2>${formatDateForDisplay(new Date())}</h2>
            <hr>
    `;
    const dailyTargetsDiv = document.getElementById('dailyTargets');
    let pendingCount = 0;
    let completedCount = 0;

    if (dailyTargetsDiv) {
        viewHTML += `<h2>Pendentes</h2>`;
        dailyTargetsDiv.querySelectorAll('.target:not(.completed-target)').forEach(div => {
            const targetId = div.dataset.targetId;
            // Find target data in the main list (prayerTargets)
            const targetData = prayerTargets.find(t => t.id === targetId);
            if (targetData) { pendingCount++; viewHTML += generateTargetViewHTML(targetData, false); }
        });
        if (pendingCount === 0) viewHTML += "<p>Nenhum alvo pendente.</p>";

        viewHTML += `<hr/><h2>Concluídos Hoje</h2>`;
        dailyTargetsDiv.querySelectorAll('.target.completed-target').forEach(div => {
             const targetId = div.dataset.targetId;
             const targetData = prayerTargets.find(t => t.id === targetId) || archivedTargets.find(t => t.id === targetId); // Check both lists just in case
             if (targetData) { completedCount++; viewHTML += generateTargetViewHTML(targetData, true); }
        });
        if (completedCount === 0) viewHTML += "<p>Nenhum alvo concluído hoje.</p>";
    } else {
        viewHTML += "<p>Erro: Seção de alvos diários não encontrada.</p>";
    }
    viewHTML += `
        </body>
        </html>
    `;
     // Open tab logic remains the same for this view
     const viewTab = window.open('', '_blank');
     if (viewTab) { viewTab.document.write(viewHTML); viewTab.document.close(); }
     else { alert('Popup bloqueado! Habilite popups para este site.'); }
}

async function generateResolvedViewHTML(startDate, endDate) { // Expect Date objects
    const user = auth.currentUser;
    if (!user) { alert("Você precisa estar logado."); return; }
    const uid = user.uid;

    const startUTC = new Date(Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()));
    const endNextDay = new Date(endDate);
    endNextDay.setDate(endDate.getDate() + 1);
    const endUTCStartOfNextDay = new Date(Date.UTC(endNextDay.getFullYear(), endNextDay.getMonth(), endNextDay.getDate()));

    const startTimestamp = Timestamp.fromDate(startUTC);
    const endTimestamp = Timestamp.fromDate(endUTCStartOfNextDay);

    const archivedRef = collection(db, "users", uid, "archivedTargets");
    const q = query(archivedRef,
                    where("resolved", "==", true),
                    where("resolutionDate", ">=", startTimestamp),
                    where("resolutionDate", "<", endTimestamp),
                    orderBy("resolutionDate", "desc"));

    let filteredResolvedTargets = [];
    try {
        const querySnapshot = await getDocs(q);
        const rawTargets = [];
        querySnapshot.forEach((doc) => rawTargets.push({ ...doc.data(), id: doc.id }));
        filteredResolvedTargets = rehydrateTargets(rawTargets);
    } catch (error) {
        console.error("Error fetching resolved targets:", error);
        alert("Erro ao buscar alvos respondidos."); return;
    }

    filteredResolvedTargets.sort((a, b) => (b.resolutionDate || 0) - (a.resolutionDate || 0));

    let viewHTML = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Alvos Respondidos - ${formatDateForDisplay(startDate)} a ${formatDateForDisplay(endDate)}</title>
            <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap">
             <style>
                 /* Reuse styles from generateViewHTML */
                 body { font-family: 'Playfair Display', serif; margin: 20px; background-color: #f9f9f9; color: #333; }
                 h1, h2 { text-align: center; color: #333; }
                 .target { border: 1px solid #ddd; border-radius: 5px; background-color: #eaffea; /* Light green for resolved */ padding: 15px; margin-bottom: 15px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: left; }
                 .target h3 { margin-top: 0; font-size: 1.3em; color: #38761d; /* Darker green */ }
                 .target p { margin: 5px 0; line-height: 1.5; }
                 .observations { margin-top: 10px; padding-top: 10px; border-top: 1px dotted #c3e6cb; }
                  .observation-item { font-size: 0.9em; color: #555; margin-bottom: 5px; padding-left: 10px; }
                  .observation-item strong { color: #333; }
                 hr { border: 0; border-top: 1px solid #ccc; margin: 20px 0; }
                 @media print { body { background-color: #fff; } .target { box-shadow: none; border: 1px solid #ccc; background-color: #fff; } }
            </style>
        </head>
        <body>
            <h1>Alvos de Oração Respondidos</h1>
            <h2>Período: ${formatDateForDisplay(startDate)} - ${formatDateForDisplay(endDate)}</h2>
            <hr>
    `;

     if (filteredResolvedTargets.length === 0) {
         viewHTML += "<p>Nenhum alvo respondido neste período.</p>";
     } else {
        filteredResolvedTargets.forEach(target => {
            viewHTML += generateTargetViewHTMLForResolved(target);
        });
    }
    viewHTML += `
        </body>
        </html>
    `;
    const viewTab = window.open('', '_blank');
    if (viewTab) { viewTab.document.write(viewHTML); viewTab.document.close(); }
    else { alert('Popup bloqueado! Habilite popups para este site.'); }
}

// Specific helper for Resolved View HTML generation
function generateTargetViewHTMLForResolved(target) {
     if (!target || !target.id) return '';
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
                          else { let diffInYears = Math.floor(diffInDays / 365.25); totalTime = `${diffInYears} anos`; }
                      }
                  }
              }
          }
     }
     const observations = Array.isArray(target.observations) ? target.observations : [];
     const observationsHTML = renderObservationsForView(observations);

     return `
         <div class="target resolved">
             <h3>${target.title || 'Sem Título'} (Respondido)</h3>
             <p>${target.details || 'Sem Detalhes'}</p>
             <p><strong>Data Respondido:</strong> ${formattedResolutionDate}</p>
             <p><strong>Tempo Total (Criação -> Resposta):</strong> ${totalTime}</p>
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
    const separators = ['sectionSeparator']; // Add other separators if needed

    allPanels.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.style.display = 'none';
    });
    separators.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.style.display = 'none';
    });

    const panelToShowElement = document.getElementById(panelIdToShow);
    if (panelToShowElement) {
        panelToShowElement.style.display = 'block'; // Use 'block' or 'flex' depending on the panel's CSS
    } else {
        console.error(`Panel with ID ${panelIdToShow} not found.`);
        return; // Exit if the main panel doesn't exist
    }

    // Show related elements based on the main panel shown
    if (panelIdToShow === 'dailySection') {
        document.getElementById('weeklyPerseveranceChart').style.display = 'block';
        document.getElementById('perseveranceSection').style.display = 'block';
        document.getElementById('sectionSeparator').style.display = 'block';
    }
    // Explicitly hide daily/perseverance sections if showing form or list panels
     else if (['appContent', 'mainPanel', 'archivedPanel', 'resolvedPanel'].includes(panelIdToShow)) {
          document.getElementById('dailySection').style.display = 'none';
          document.getElementById('weeklyPerseveranceChart').style.display = 'none';
          document.getElementById('perseveranceSection').style.display = 'none';
          document.getElementById('sectionSeparator').style.display = 'none';
      }

      // Special case: If showing mainPanel, ensure daily section is hidden
      if(panelIdToShow === 'mainPanel') {
            document.getElementById('dailySection').style.display = 'none';
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
        popup.style.display = 'flex'; // Use flex for potential centering in CSS
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
    try {
        const dateInput = document.getElementById('date');
        if (dateInput) dateInput.value = formatDateToISO(new Date());
    } catch (e) { console.error("Error setting default date:", e); }

    onAuthStateChanged(auth, (user) => loadData(user));

    // Search inputs
    document.getElementById('searchMain')?.addEventListener('input', handleSearchMain);
    document.getElementById('searchArchived')?.addEventListener('input', handleSearchArchived);
    document.getElementById('searchResolved')?.addEventListener('input', handleSearchResolved);

    // Filter checkboxes
    document.getElementById('showDeadlineOnly')?.addEventListener('change', handleDeadlineFilterChange);
    document.getElementById('showExpiredOnlyMain')?.addEventListener('change', handleExpiredOnlyMainChange);

    // Auth Buttons
    document.getElementById('btnEmailSignUp')?.addEventListener('click', signUpWithEmailPassword);
    document.getElementById('btnEmailSignIn')?.addEventListener('click', signInWithEmailPassword);
    document.getElementById('btnForgotPassword')?.addEventListener('click', resetPassword);
    document.getElementById('btnLogout')?.addEventListener('click', () => {
        signOut(auth).catch(error => console.error("Logout error:", error));
    });

    // Action Buttons
    document.getElementById('confirmPerseveranceButton')?.addEventListener('click', confirmPerseverance);
    document.getElementById("viewReportButton")?.addEventListener('click', () => window.location.href = 'orei.html');
    document.getElementById("refreshDaily")?.addEventListener("click", async () => {
        const user = auth.currentUser;
        if (!user) { alert("Você precisa estar logado."); return; }
        if (confirm("Atualizar lista de alvos do dia? Isso gerará uma nova lista aleatória para hoje.")) {
            const userId = user.uid;
            const todayStr = formatDateToISO(new Date());
            const dailyDocId = `${userId}_${todayStr}`;
            const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);
            try {
                console.log("Refreshing daily targets...");
                document.getElementById("dailyTargets").innerHTML = "<p>Atualizando alvos do dia...</p>"; // Feedback
                const newTargetsData = await generateDailyTargets(userId, todayStr);
                if(newTargetsData && newTargetsData.targets) {
                    await setDoc(dailyRef, newTargetsData); // Overwrite today's list
                    await loadDailyTargets(); // Reload display with new list
                    alert("Alvos do dia atualizados!");
                } else {
                     alert("Não foi possível gerar novos alvos diários.");
                     await loadDailyTargets(); // Try to reload previous state
                }
            } catch (error) {
                console.error("Error refreshing daily targets:", error);
                alert("Erro ao atualizar alvos diários.");
                 await loadDailyTargets(); // Try to reload previous state
            }
        }
     });
     document.getElementById("copyDaily")?.addEventListener("click", () => {
        const dailyTargetsDiv = document.getElementById('dailyTargets');
        let textToCopy = '';
        if (!dailyTargetsDiv) return;
        const targetDivs = dailyTargetsDiv.querySelectorAll('.target:not(.completed-target)'); // Only pending
        if (targetDivs.length === 0) {
            alert('Nenhum alvo pendente para copiar.');
            return;
        }
        textToCopy += `Alvos de Oração Pendentes (${formatDateForDisplay(new Date())}):\n\n`;
        targetDivs.forEach((div, index) => {
            const titleElement = div.querySelector('h3');
            // Get text content excluding the deadline span if it exists
            const titleText = titleElement ? (Array.from(titleElement.childNodes).filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent.trim()).join(' ') || 'Sem Título') : 'Sem Título';
            const detailsElement = div.querySelector('p:nth-of-type(1)'); // Assumes first <p> is details
            const detailsText = detailsElement ? detailsElement.textContent.trim() : 'Sem Detalhes';
            textToCopy += `${index + 1}. ${titleText}\n   ${detailsText}\n\n`;
        });
        navigator.clipboard.writeText(textToCopy.trim())
           .then(() => alert('Alvos pendentes copiados para a área de transferência!'))
           .catch(err => {
               console.error("Clipboard copy failed:", err);
               prompt("Falha ao copiar automaticamente. Copie manualmente:", textToCopy.trim());
           });
     });
     document.getElementById('generateViewButton')?.addEventListener('click', () => generateViewHTML(lastDisplayedTargets)); // Use last displayed targets
     document.getElementById('viewDaily')?.addEventListener('click', generateDailyViewHTML);
     document.getElementById("viewResolvedViewButton")?.addEventListener("click", () => {
        // Set default dates for modal
        const today = new Date();
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        document.getElementById("startDate").value = formatDateToISO(firstDayOfMonth);
        document.getElementById("endDate").value = formatDateToISO(today);
        dateRangeModal.style.display = "block";
     });
     document.getElementById('closePopup')?.addEventListener('click', () => document.getElementById('completionPopup').style.display = 'none');

     // Navigation buttons
    document.getElementById('viewAllTargetsButton')?.addEventListener('click', () => { showPanel('mainPanel'); currentPage = 1; renderTargets(); });
    document.getElementById('addNewTargetButton')?.addEventListener('click', () => showPanel('appContent'));
    document.getElementById("viewArchivedButton")?.addEventListener("click", () => { showPanel('archivedPanel'); currentArchivedPage = 1; renderArchivedTargets(); });
    document.getElementById("viewResolvedButton")?.addEventListener("click", () => { showPanel('resolvedPanel'); currentResolvedPage = 1; renderResolvedTargets(); });
    document.getElementById("backToMainButton")?.addEventListener("click", () => showPanel('dailySection')); // Goes back to daily view

    // Date Range Modal Logic
    const dateRangeModal = document.getElementById("dateRangeModal");
    document.getElementById("closeDateRangeModal")?.addEventListener("click", () => dateRangeModal.style.display = "none");
    document.getElementById("generateResolvedView")?.addEventListener("click", () => {
        const startDateStr = document.getElementById("startDate").value;
        const endDateStr = document.getElementById("endDate").value;
        if (startDateStr && endDateStr) {
            // Parse as local dates, as the user selects them in local context
            const start = new Date(startDateStr + 'T00:00:00'); // Assume local midnight start
            const end = new Date(endDateStr + 'T00:00:00');     // Assume local midnight start
             if (isNaN(start.getTime()) || isNaN(end.getTime())) { alert("Datas inválidas."); return; }
             if (start > end) { alert("Data de início não pode ser após a data de fim."); return; }
            generateResolvedViewHTML(start, end); // Pass Date objects
            dateRangeModal.style.display = "none";
        } else { alert("Por favor, selecione as datas de início e fim."); }
    });
    document.getElementById("cancelDateRange")?.addEventListener("click", () => dateRangeModal.style.display = "none");
    window.addEventListener('click', (event) => { if (event.target == dateRangeModal) dateRangeModal.style.display = "none"; });

});
