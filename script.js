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

// Global variables (as before, with additions)
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
// --- MODIFICADO --- Estrutura de perseveranceData inclui agora weeklyInteractions e weekId
let perseveranceData = {
    consecutiveDays: 0,
    lastInteractionDate: null,
    recordDays: 0,
    weeklyInteractions: {}, // Mapa para dias interagidos na semana
    weekId: null           // Identificador da semana atual (ex: '2023-W44')
};
let currentWeekIdentifier = null; // --- NOVO --- Armazena localmente o ID da semana atual

// ==== FUNÇÕES UTILITÁRIAS ====

// --- NOVO --- Função para obter o identificador da semana ISO (Ano-W##) para uma data
function getWeekIdentifier(date) {
    // Cria uma cópia para não modificar a data original
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    // Ajusta para ISO 8601 onde Domingo é 7
    const dayNum = d.getUTCDay() || 7;
    // Define a data para a Quinta-feira da semana (ISO 8601 week date)
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    // Pega o primeiro dia do ano
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    // Calcula o número da semana
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
        dateToFormat = new Date(date);
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
    // Removido console.log para reduzir ruído
    // console.log('[formatDateForDisplay] Received input:', dateInput, '| Type:', typeof dateInput);
    if (!dateInput) { return 'Data Inválida'; }
    let dateToFormat;
    if (dateInput instanceof Timestamp) { dateToFormat = dateInput.toDate(); }
    else if (dateInput instanceof Date && !isNaN(dateInput)) { dateToFormat = dateInput; } // Modificado para !isNaN
    else {
        if (typeof dateInput === 'string') { dateToFormat = new Date(dateInput); }
        else { console.warn("[formatDateForDisplay] Input is unexpected type:", typeof dateInput, dateInput); return 'Data Inválida'; }
    }
    if (!dateToFormat || isNaN(dateToFormat.getTime())) { return 'Data Inválida'; }
    const day = String(dateToFormat.getUTCDate()).padStart(2, '0');
    const month = String(dateToFormat.getUTCMonth() + 1).padStart(2, '0');
    const year = dateToFormat.getUTCFullYear();
    const formattedDate = `${day}/${month}/${year}`;
    // Removido console.log para reduzir ruído
    // console.log('[formatDateForDisplay] Formatting successful using UTC components. Returning:', formattedDate);
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
    // Removido console.log para reduzir ruído
    // console.log('[rehydrateTargets] Starting rehydration for', targets.length, 'targets.');
    return targets.map((target, index) => {
        const rehydratedTarget = { ...target };
        const fieldsToConvert = ['date', 'deadlineDate', 'lastPresentedDate', 'resolutionDate', 'archivedDate'];
        fieldsToConvert.forEach(field => {
            const originalValue = rehydratedTarget[field];
            if (originalValue instanceof Timestamp) { rehydratedTarget[field] = originalValue.toDate(); }
            else if (originalValue instanceof Date && !isNaN(originalValue)) { /* Already Date, do nothing */ }
            else if (originalValue === null || originalValue === undefined) { rehydratedTarget[field] = null; }
            else {
                try {
                    const parsedDate = new Date(originalValue);
                    rehydratedTarget[field] = !isNaN(parsedDate.getTime()) ? parsedDate : null;
                } catch (e) { rehydratedTarget[field] = null; }
            }
        });
        if (rehydratedTarget.observations && Array.isArray(rehydratedTarget.observations)) {
            rehydratedTarget.observations = rehydratedTarget.observations.map(obs => {
                let obsDateFinal = null;
                if (obs.date instanceof Timestamp) obsDateFinal = obs.date.toDate();
                else if (obs.date instanceof Date && !isNaN(obs.date)) obsDateFinal = obs.date;
                else if (obs.date) {
                   try { const parsedObsDate = new Date(obs.date); if (!isNaN(parsedObsDate.getTime())) obsDateFinal = parsedObsDate; } catch(e) { /* ignore */ }
                }
                return { ...obs, date: obsDateFinal };
            });
        } else { rehydratedTarget.observations = []; }
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
        if (user.providerData[0]?.providerId === 'password') { authStatus.textContent = `Usuário autenticado: ${user.email} (via E-mail/Senha)`; }
        else { authStatus.textContent = `Usuário autenticado: ${user.email}`; }
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
        await createUserWithEmailAndPassword(auth, email, password);
        alert("Cadastro realizado com sucesso!");
    } catch (error) { console.error("Erro ao cadastrar com e-mail/senha:", error); alert("Erro ao cadastrar: " + error.message); }
}

async function signInWithEmailPassword() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    try { await signInWithEmailAndPassword(auth, email, password); }
    catch (error) { console.error("Erro ao entrar com e-mail/senha:", error); alert("Erro ao entrar: " + error.message); }
}

async function resetPassword() {
    const email = document.getElementById('email').value;
    if (!email) { alert("Por favor, insira seu e-mail para redefinir a senha."); return; }
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
        document.getElementById('weeklyPerseveranceChart').style.display = 'block'; // Garante que quadro é visível
        document.getElementById('perseveranceSection').style.display = 'block';   // Garante que barra é visível

        try {
            // Carrega dados de perseverança PRIMEIRO para ter weekId e weeklyInteractions
            await loadPerseveranceData(uid); // <--- CHAMADA CORRIGIDA AQUI
            // Depois carrega os alvos
            await fetchPrayerTargets(uid);
            await fetchArchivedTargets(uid);
            resolvedTargets = archivedTargets.filter(target => target.resolved);

            checkExpiredDeadlines();
            renderTargets();
            renderArchivedTargets();
            renderResolvedTargets();

            await loadDailyTargets(); // Carrega alvos diários por último

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
        resetPerseveranceUI(); // Reseta barra E quadro
    }
}

async function fetchPrayerTargets(uid) {
    prayerTargets = [];
    const targetsRef = collection(db, "users", uid, "prayerTargets");
    const targetsSnapshot = await getDocs(query(targetsRef, orderBy("date", "desc")));
    console.log(`[fetchPrayerTargets] Found ${targetsSnapshot.size} targets for user ${uid}`);
    const rawTargets = [];
    targetsSnapshot.forEach((doc) => { rawTargets.push({ ...doc.data(), id: doc.id }); });
    prayerTargets = rehydrateTargets(rawTargets);
    // Removido console.log para reduzir ruído
    // console.log("[fetchPrayerTargets] Final rehydrated prayerTargets count:", prayerTargets.length);
}

async function fetchArchivedTargets(uid) {
    archivedTargets = [];
    const archivedRef = collection(db, "users", uid, "archivedTargets");
    const archivedSnapshot = await getDocs(query(archivedRef, orderBy("date", "desc")));
    console.log(`[fetchArchivedTargets] Found ${archivedSnapshot.size} archived targets for user ${uid}`);
    const rawArchived = [];
    archivedSnapshot.forEach((doc) => { rawArchived.push({ ...doc.data(), id: doc.id }); });
    archivedTargets = rehydrateTargets(rawArchived);
    // Removido console.log para reduzir ruído
    // console.log("[fetchArchivedTargets] Final rehydrated archivedTargets count:", archivedTargets.length);
}

// --- Renderização ---
function renderTargets() {
    const targetListDiv = document.getElementById('targetList');
    targetListDiv.innerHTML = '';
    let filteredAndPagedTargets = [...prayerTargets];

    // Filtros
    if (currentSearchTermMain) { filteredAndPagedTargets = filterTargets(filteredAndPagedTargets, currentSearchTermMain); }
    if (showDeadlineOnly) { filteredAndPagedTargets = filteredAndPagedTargets.filter(target => target.hasDeadline); }
    const showExpiredOnlyMainCheckbox = document.getElementById('showExpiredOnlyMain');
    if (showExpiredOnlyMainCheckbox && showExpiredOnlyMainCheckbox.checked) {
        filteredAndPagedTargets = filteredAndPagedTargets.filter(target => target.hasDeadline && isDateExpired(target.deadlineDate));
    }

    // Ordenação
     if (showDeadlineOnly || (showExpiredOnlyMainCheckbox && showExpiredOnlyMainCheckbox.checked)) {
        filteredAndPagedTargets.sort((a, b) => {
            const dateA = a.deadlineDate instanceof Date && !isNaN(a.deadlineDate) ? a.deadlineDate : null;
            const dateB = b.deadlineDate instanceof Date && !isNaN(b.deadlineDate) ? b.deadlineDate : null;
            if (dateA && dateB) return dateA - dateB; if (dateA) return -1; if (dateB) return 1;
             const creationDateA = (a.date instanceof Date && !isNaN(a.date)) ? a.date : new Date(0);
             const creationDateB = (b.date instanceof Date && !isNaN(b.date)) ? b.date : new Date(0);
             return creationDateB - creationDateA; // Mais recente primeiro como fallback
        });
    } else {
        filteredAndPagedTargets.sort((a, b) => {
             const creationDateA = (a.date instanceof Date && !isNaN(a.date)) ? a.date : new Date(0);
             const creationDateB = (b.date instanceof Date && !isNaN(b.date)) ? b.date : new Date(0);
             return creationDateB - creationDateA; // Padrão: Mais recente primeiro
         });
    }

    // Paginação
    const startIndex = (currentPage - 1) * targetsPerPage;
    const endIndex = startIndex + targetsPerPage;
    const targetsToDisplay = filteredAndPagedTargets.slice(startIndex, endIndex);
    lastDisplayedTargets = targetsToDisplay;

    // Renderização
    if (targetsToDisplay.length === 0) {
        if (currentPage > 1) { currentPage = 1; renderTargets(); return; }
        else { targetListDiv.innerHTML = '<p>Nenhum alvo de oração encontrado.</p>'; }
    } else {
        targetsToDisplay.forEach((target) => {
             if (!target || !target.id) { console.warn("[renderTargets] Skipping rendering of invalid target:", target); return; }
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
                <div id="observationForm-${target.id}" class="add-observation-form" style="display:none;"></div>`;
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
    if (currentSearchTermArchived) { filteredAndPagedArchivedTargets = filterTargets(filteredAndPagedArchivedTargets, currentSearchTermArchived); }
    filteredAndPagedArchivedTargets.sort((a, b) => (b.date instanceof Date ? b.date.getTime() : 0) - (a.date instanceof Date ? a.date.getTime() : 0)); // Mais recentes primeiro
    const startIndex = (currentArchivedPage - 1) * targetsPerPage;
    const endIndex = startIndex + targetsPerPage;
    const targetsToDisplay = filteredAndPagedArchivedTargets.slice(startIndex, endIndex);

    if (targetsToDisplay.length === 0) {
        if (currentArchivedPage > 1) { currentArchivedPage = 1; renderArchivedTargets(); return; }
        else { archivedListDiv.innerHTML = '<p>Nenhum alvo arquivado encontrado.</p>'; }
    } else {
        targetsToDisplay.forEach((target) => {
             if (!target || !target.id) return;
            const archivedDiv = document.createElement("div");
            archivedDiv.classList.add("target", "archived");
            archivedDiv.dataset.targetId = target.id;
            const formattedDate = formatDateForDisplay(target.date);
            const elapsed = timeElapsed(target.date);
            const observations = Array.isArray(target.observations) ? target.observations : [];
            archivedDiv.innerHTML = `
                <h3>${target.title || 'Sem Título'}</h3>
                <p>${target.details || 'Sem Detalhes'}</p>
                <p><strong>Data Criação:</strong> ${formattedDate}</p>
                <p><strong>Tempo Decorrido:</strong> ${elapsed}</p>
                ${renderObservations(observations, false, target.id)}
                <div class="target-actions">
                    <button class="delete btn" onclick="deleteArchivedTarget('${target.id}')">Excluir</button>
                </div>`;
            archivedListDiv.appendChild(archivedDiv);
        });
    }
    renderPagination('archivedPanel', currentArchivedPage, filteredAndPagedArchivedTargets);
}

function renderResolvedTargets() {
    const resolvedListDiv = document.getElementById('resolvedList');
    resolvedListDiv.innerHTML = '';
    let filteredAndPagedResolvedTargets = [...resolvedTargets]; // Já filtrado em loadData
    if (currentSearchTermResolved) { filteredAndPagedResolvedTargets = filterTargets(filteredAndPagedResolvedTargets, currentSearchTermResolved); }
    filteredAndPagedResolvedTargets.sort((a, b) => (b.resolutionDate instanceof Date ? b.resolutionDate.getTime() : 0) - (a.resolutionDate instanceof Date ? a.resolutionDate.getTime() : 0)); // Mais recentes primeiro
    const startIndex = (currentResolvedPage - 1) * targetsPerPage;
    const endIndex = startIndex + targetsPerPage;
    const targetsToDisplay = filteredAndPagedResolvedTargets.slice(startIndex, endIndex);

    if (targetsToDisplay.length === 0) {
         if (currentResolvedPage > 1) { currentResolvedPage = 1; renderResolvedTargets(); return; }
         else { resolvedListDiv.innerHTML = '<p>Nenhum alvo respondido encontrado.</p>'; }
    } else {
        targetsToDisplay.forEach((target) => {
            if (!target || !target.id) return;
            const resolvedDiv = document.createElement("div");
            resolvedDiv.classList.add("target", "resolved");
            resolvedDiv.dataset.targetId = target.id;
            const formattedResolutionDate = formatDateForDisplay(target.resolutionDate);
            let totalTime = 'N/A';
            if (target.date instanceof Date && target.resolutionDate instanceof Date) {
                 let diffInSeconds = Math.floor((target.resolutionDate.getTime() - target.date.getTime()) / 1000);
                 if (diffInSeconds < 0) diffInSeconds = 0;
                 if (diffInSeconds < 60) totalTime = `${diffInSeconds} seg`; else { let diffInMinutes = Math.floor(diffInSeconds / 60);
                     if (diffInMinutes < 60) totalTime = `${diffInMinutes} min`; else { let diffInHours = Math.floor(diffInMinutes / 60);
                         if (diffInHours < 24) totalTime = `${diffInHours} hr`; else { let diffInDays = Math.floor(diffInHours / 24);
                             if (diffInDays < 30) totalTime = `${diffInDays} dias`; else { let diffInMonths = Math.floor(diffInDays / 30.44);
                                 if (diffInMonths < 12) totalTime = `${diffInMonths} meses`; else { let diffInYears = Math.floor(diffInDays / 365.25); totalTime = `${diffInYears} anos`; }
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
                ${renderObservations(observations, false, target.id)}`;
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

    if (totalPages <= 1) { paginationDiv.style.display = 'none'; return; }
    else { paginationDiv.style.display = 'flex'; }

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
    if (panelId === 'mainPanel') { currentPage = newPage; renderTargets(); }
    else if (panelId === 'archivedPanel') { currentArchivedPage = newPage; renderArchivedTargets(); }
    else if (panelId === 'resolvedPanel') { currentResolvedPage = newPage; renderResolvedTargets(); }
    const panelElement = document.getElementById(panelId);
    if (panelElement) { panelElement.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
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
        title: title, details: details, date: Timestamp.fromDate(dateUTC),
        hasDeadline: hasDeadline, deadlineDate: deadlineDateUTC ? Timestamp.fromDate(deadlineDateUTC) : null,
        archived: false, resolved: false, resolutionDate: null, observations: [], userId: uid
    };
    try {
        const docRef = await addDoc(collection(db, "users", uid, "prayerTargets"), target);
        const newLocalTarget = rehydrateTargets([{ ...target, id: docRef.id }])[0];
        prayerTargets.unshift(newLocalTarget);
        prayerTargets.sort((a, b) => (b.date instanceof Date ? b.date.getTime() : 0) - (a.date instanceof Date ? a.date.getTime() : 0)); // Sort local array
        document.getElementById("prayerForm").reset();
        document.getElementById('deadlineContainer').style.display = 'none';
        document.getElementById('date').value = formatDateToISO(new Date());
        showPanel('mainPanel'); currentPage = 1; renderTargets();
        alert('Alvo de oração adicionado com sucesso!');
    } catch (error) { console.error("Error adding prayer target: ", error); alert("Erro ao adicionar alvo de oração."); }
});

window.markAsResolved = async function(targetId) {
    const user = auth.currentUser;
    if (!user) { alert("Erro: Usuário não autenticado."); return; }
    const userId = user.uid;
    const targetIndex = prayerTargets.findIndex(t => t.id === targetId);
    if (targetIndex === -1) { alert("Erro: Alvo não encontrado."); return; }
    const targetData = prayerTargets[targetIndex];
    const resolutionDate = Timestamp.fromDate(new Date());
    const activeTargetRef = doc(db, "users", userId, "prayerTargets", targetId);
    const archivedTargetRef = doc(db, "users", userId, "archivedTargets", targetId);
    try {
        const archivedData = { ...targetData,
            date: targetData.date instanceof Date ? Timestamp.fromDate(targetData.date) : targetData.date,
            deadlineDate: targetData.deadlineDate instanceof Date ? Timestamp.fromDate(targetData.deadlineDate) : targetData.deadlineDate,
            observations: Array.isArray(targetData.observations) ? targetData.observations.map(obs => ({ ...obs, date: obs.date instanceof Date ? Timestamp.fromDate(obs.date) : obs.date })) : [],
            resolved: true, archived: true, resolutionDate: resolutionDate };
        const batch = writeBatch(db);
        batch.delete(activeTargetRef);
        batch.set(archivedTargetRef, archivedData);
        await batch.commit();
        prayerTargets.splice(targetIndex, 1);
        const newArchivedLocal = rehydrateTargets([archivedData])[0];
        archivedTargets.unshift(newArchivedLocal);
        archivedTargets.sort((a, b) => (b.date instanceof Date ? b.date.getTime() : 0) - (a.date instanceof Date ? a.date.getTime() : 0));
        resolvedTargets = archivedTargets.filter(t => t.resolved);
        resolvedTargets.sort((a, b) => (b.resolutionDate instanceof Date ? b.resolutionDate.getTime() : 0) - (a.resolutionDate instanceof Date ? a.resolutionDate.getTime() : 0));
        renderTargets(); renderArchivedTargets(); renderResolvedTargets();
        alert('Alvo marcado como respondido e movido para Arquivados.');
    } catch (error) { console.error("Error marking target as resolved: ", error); alert("Erro ao marcar como respondido."); }
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
        const archivedData = { ...targetData,
             date: targetData.date instanceof Date ? Timestamp.fromDate(targetData.date) : targetData.date,
             deadlineDate: targetData.deadlineDate instanceof Date ? Timestamp.fromDate(targetData.deadlineDate) : targetData.deadlineDate,
             observations: Array.isArray(targetData.observations) ? targetData.observations.map(obs => ({ ...obs, date: obs.date instanceof Date ? Timestamp.fromDate(obs.date) : obs.date })) : [],
             resolved: false, archived: true, resolutionDate: null };
        const batch = writeBatch(db);
        batch.delete(activeTargetRef);
        batch.set(archivedTargetRef, archivedData);
        await batch.commit();
        prayerTargets.splice(targetIndex, 1);
        const newArchivedLocal = rehydrateTargets([archivedData])[0];
        archivedTargets.unshift(newArchivedLocal);
        archivedTargets.sort((a, b) => (b.date instanceof Date ? b.date.getTime() : 0) - (a.date instanceof Date ? a.date.getTime() : 0));
        resolvedTargets = archivedTargets.filter(t => t.resolved);
        resolvedTargets.sort((a, b) => (b.resolutionDate instanceof Date ? b.resolutionDate.getTime() : 0) - (a.resolutionDate instanceof Date ? a.resolutionDate.getTime() : 0));
        renderTargets(); renderArchivedTargets(); renderResolvedTargets();
        alert('Alvo arquivado com sucesso!');
    } catch (error) { console.error("Error archiving target: ", error); alert("Erro ao arquivar alvo."); }
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
         batch.delete(clickCountsRef);
         await batch.commit();
         const targetIndex = archivedTargets.findIndex(t => t.id === targetId);
         if (targetIndex !== -1) archivedTargets.splice(targetIndex, 1);
         resolvedTargets = archivedTargets.filter(target => target.resolved);
         resolvedTargets.sort((a, b) => (b.resolutionDate instanceof Date ? b.resolutionDate.getTime() : 0) - (a.resolutionDate instanceof Date ? a.resolutionDate.getTime() : 0));
         renderArchivedTargets(); renderResolvedTargets();
         alert('Alvo excluído permanentemente!');
     } catch (error) { console.error("Error deleting archived target: ", error); alert("Erro ao excluir alvo arquivado."); }
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
        <button class="btn" onclick="saveObservation('${targetId}')">Salvar Observação</button>`;
    try { document.getElementById(`observationDate-${targetId}`).value = formatDateToISO(new Date()); }
    catch (e) { console.error("[renderObservationForm] Error setting default date:", e); document.getElementById(`observationDate-${targetId}`).value = ''; }
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
    let targetRef; let targetList;
    let targetIndex = prayerTargets.findIndex(t => t.id === targetId);
    if (targetIndex !== -1) { targetRef = doc(db, "users", userId, "prayerTargets", targetId); targetList = prayerTargets; }
    else {
        targetIndex = archivedTargets.findIndex(t => t.id === targetId);
        if (targetIndex !== -1) { targetRef = doc(db, "users", userId, "archivedTargets", targetId); targetList = archivedTargets; }
        else { alert("Erro: Alvo não encontrado."); return; }
    }
    const newObservation = { text: observationText, date: Timestamp.fromDate(observationDateUTC), id: generateUniqueId(), targetId: targetId };
    try {
        const targetDocSnap = await getDoc(targetRef);
        if (!targetDocSnap.exists()) { throw new Error("Target document does not exist in Firestore."); }
        const currentData = targetDocSnap.data();
        const currentObservations = currentData.observations || [];
        currentObservations.push(newObservation);
        currentObservations.sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));
        await updateDoc(targetRef, { observations: currentObservations });
        const currentTargetLocal = targetList[targetIndex];
        if (!currentTargetLocal.observations || !Array.isArray(currentTargetLocal.observations)) { currentTargetLocal.observations = []; }
        currentTargetLocal.observations.push({ ...newObservation, date: newObservation.date.toDate() });
        currentTargetLocal.observations.sort((a, b) => (b.date instanceof Date ? b.date.getTime() : 0) - (a.date instanceof Date ? a.date.getTime() : 0));
        if (targetList === prayerTargets) renderTargets();
        else if (targetList === archivedTargets) {
            renderArchivedTargets();
             if (resolvedTargets.some(rt => rt.id === targetId)) renderResolvedTargets();
        }
        toggleAddObservation(targetId);
        document.getElementById(`observationText-${targetId}`).value = '';
    } catch (error) { console.error("Error saving observation:", error); alert("Erro ao salvar observação."); }
};

function renderObservations(observations, isExpanded = false, targetId = null) {
    if (!Array.isArray(observations) || observations.length === 0) return '';
    observations.sort((a, b) => (b.date instanceof Date ? b.date.getTime() : 0) - (a.date instanceof Date ? a.date.getTime() : 0));
    const displayCount = isExpanded ? observations.length : 1;
    const visibleObservations = observations.slice(0, displayCount);
    const remainingCount = observations.length - displayCount;
    let observationsHTML = `<div class="observations">`;
    visibleObservations.forEach(observation => {
        const formattedDate = formatDateForDisplay(observation.date);
        observationsHTML += `<p class="observation-item"><strong>${formattedDate}:</strong> ${observation.text || ''}</p>`;
    });
    if (targetId) {
        if (!isExpanded && remainingCount > 0) { observationsHTML += `<a href="#" class="observations-toggle" onclick="window.toggleObservations('${targetId}', event); return false;">Ver mais ${remainingCount} observações</a>`; }
        else if (isExpanded && observations.length > 1) { observationsHTML += `<a href="#" class="observations-toggle" onclick="window.toggleObservations('${targetId}', event); return false;">Ver menos observações</a>`; }
    }
    observationsHTML += `</div>`;
    return observationsHTML;
}

window.toggleObservations = function(targetId, event) {
    if (event) event.preventDefault();
    const targetDiv = document.querySelector(`.target[data-target-id="${targetId}"]`);
    if (!targetDiv) return;
    const observationsContainer = targetDiv.querySelector('.observations');
    if (!observationsContainer) return;
    const isExpanded = observationsContainer.querySelector('.observations-toggle')?.textContent.includes('Ver menos');
    const target = prayerTargets.find(t => t.id === targetId) || archivedTargets.find(t => t.id === targetId);
    if (!target) return;
    const newObservationsHTML = renderObservations(target.observations || [], !isExpanded, targetId);
    observationsContainer.outerHTML = newObservationsHTML;
};

// --- Prazos (Deadlines) ---
document.getElementById('hasDeadline').addEventListener('change', function() {
    document.getElementById('deadlineContainer').style.display = this.checked ? 'block' : 'none';
});

function handleDeadlineFilterChange() { showDeadlineOnly = document.getElementById('showDeadlineOnly').checked; currentPage = 1; renderTargets(); }
function handleExpiredOnlyMainChange() { currentPage = 1; renderTargets(); }
function checkExpiredDeadlines() {
    const expiredCount = prayerTargets.filter(target => target.hasDeadline && isDateExpired(target.deadlineDate)).length;
    console.log(`[checkExpiredDeadlines] Found ${expiredCount} expired deadlines among active targets.`);
}

window.editDeadline = async function(targetId) {
    const target = prayerTargets.find(t => t.id === targetId); if (!target) return;
    const targetDiv = document.querySelector(`.target[data-target-id="${targetId}"]`); if (!targetDiv) return;
    const existingEditForm = targetDiv.querySelector('.edit-deadline-form');
    if (existingEditForm) { existingEditForm.remove(); return; }
    let currentDeadlineISO = '';
    if (target.deadlineDate instanceof Date && !isNaN(target.deadlineDate)) { currentDeadlineISO = formatDateToISO(target.deadlineDate); }
    const formHTML = `
        <div class="edit-deadline-form" style="background-color: #f0f0f0; padding: 10px; margin-top: 10px; border-radius: 5px;">
            <label for="editDeadlineDate-${targetId}" style="margin-right: 5px;">Novo Prazo:</label>
            <input type="date" id="editDeadlineDate-${targetId}" value="${currentDeadlineISO}" style="margin-right: 5px;">
            <button class="btn save-deadline-btn" onclick="saveEditedDeadline('${targetId}')" style="background-color: #4CAF50;">Salvar</button>
            <button class="btn cancel-deadline-btn" onclick="cancelEditDeadline('${targetId}')" style="background-color: #f44336;">Cancelar</button>
        </div>`;
    const actionsDiv = targetDiv.querySelector('.target-actions');
    if (actionsDiv) { actionsDiv.insertAdjacentHTML('afterend', formHTML); document.getElementById(`editDeadlineDate-${targetId}`)?.focus(); }
    else { targetDiv.insertAdjacentHTML('beforeend', formHTML); }
};

window.saveEditedDeadline = async function(targetId) {
    const newDeadlineDateInput = document.getElementById(`editDeadlineDate-${targetId}`); if (!newDeadlineDateInput) return;
    const newDeadlineValue = newDeadlineDateInput.value;
    let newDeadlineTimestamp = null; let newHasDeadline = false;
    if (newDeadlineValue) {
        const newDeadlineUTC = createUTCDate(newDeadlineValue);
        if (!newDeadlineUTC) { alert("Data do prazo inválida."); return; }
        newDeadlineTimestamp = Timestamp.fromDate(newDeadlineUTC); newHasDeadline = true;
    } else { if (!confirm("Nenhuma data selecionada. Deseja remover o prazo?")) return; }
    await updateDeadlineInFirestoreAndLocal(targetId, newDeadlineTimestamp, newHasDeadline);
    cancelEditDeadline(targetId);
};

async function updateDeadlineInFirestoreAndLocal(targetId, newDeadlineTimestamp, newHasDeadline) {
     const user = auth.currentUser; if (!user) return;
     const userId = user.uid; const targetRef = doc(db, "users", userId, "prayerTargets", targetId);
     try {
         await updateDoc(targetRef, { deadlineDate: newDeadlineTimestamp, hasDeadline: newHasDeadline });
         const targetIndex = prayerTargets.findIndex(target => target.id === targetId);
         if (targetIndex !== -1) {
             prayerTargets[targetIndex].deadlineDate = newDeadlineTimestamp ? newDeadlineTimestamp.toDate() : null;
             prayerTargets[targetIndex].hasDeadline = newHasDeadline;
         }
         renderTargets(); alert('Prazo atualizado com sucesso!');
     } catch (error) { console.error(`Error updating deadline for ${targetId}:`, error); alert("Erro ao atualizar prazo."); }
}

window.cancelEditDeadline = function(targetId) {
     const targetDiv = document.querySelector(`.target[data-target-id="${targetId}"]`);
     targetDiv?.querySelector('.edit-deadline-form')?.remove();
};

// --- Alvos Diários ---
async function loadDailyTargets() {
    const userId = auth.currentUser ? auth.currentUser.uid : null;
    if (!userId) { document.getElementById("dailyTargets").innerHTML = "<p>Faça login para ver os alvos diários.</p>"; return; }
    const today = new Date(); const todayStr = formatDateToISO(today); const dailyDocId = `${userId}_${todayStr}`;
    const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);
    try {
        let dailyTargetsData; const dailySnapshot = await getDoc(dailyRef);
        if (!dailySnapshot.exists()) {
            console.log(`[loadDailyTargets] Daily document for ${dailyDocId} not found, generating new targets.`);
            dailyTargetsData = await generateDailyTargets(userId, todayStr);
            await setDoc(dailyRef, dailyTargetsData);
            console.log(`[loadDailyTargets] Daily document ${dailyDocId} created successfully.`);
        } else { dailyTargetsData = dailySnapshot.data(); console.log(`[loadDailyTargets] Daily document ${dailyDocId} loaded from Firestore.`); }
        if (!dailyTargetsData || !Array.isArray(dailyTargetsData.targets)) {
            console.error("[loadDailyTargets] Invalid or missing daily targets data:", dailyTargetsData);
            document.getElementById("dailyTargets").innerHTML = "<p>Erro ao carregar alvos diários. Dados inválidos.</p>"; return;
        }
        const pendingTargetIds = dailyTargetsData.targets.filter(t => !t.completed).map(t => t.targetId);
        const completedTargetIds = dailyTargetsData.targets.filter(t => t.completed).map(t => t.targetId);
        console.log(`[loadDailyTargets] Pending targets: ${pendingTargetIds.length}, Completed targets: ${completedTargetIds.length}`);
        const allTargetIds = [...pendingTargetIds, ...completedTargetIds];
        if (allTargetIds.length === 0) { document.getElementById("dailyTargets").innerHTML = "<p>Nenhum alvo de oração para hoje.</p>"; displayRandomVerse(); return; }
        // Busca detalhes nos alvos já carregados e rehidratados
        const targetsToDisplayDetails = prayerTargets.filter(pt => allTargetIds.includes(pt.id));
        const pendingTargetsDetails = targetsToDisplayDetails.filter(t => pendingTargetIds.includes(t.id));
        const completedTargetsDetails = targetsToDisplayDetails.filter(t => completedTargetIds.includes(t.id));
        renderDailyTargets(pendingTargetsDetails, completedTargetsDetails); displayRandomVerse();
    } catch (error) { console.error("[loadDailyTargets] General error loading daily targets:", error); document.getElementById("dailyTargets").innerHTML = "<p>Erro ao carregar alvos diários.</p>"; }
}

async function generateDailyTargets(userId, dateStr) {
    try {
        const availableTargets = prayerTargets.filter(t => !t.archived);
        if (availableTargets.length === 0) { console.log("[generateDailyTargets] No active targets found."); return { userId, date: dateStr, targets: [] }; }
        const todayUTC = createUTCDate(dateStr);
        if (!todayUTC) { console.error("[generateDailyTargets] Could not parse today's date string:", dateStr); return { userId, date: dateStr, targets: [] }; }
        const yesterdayUTC = new Date(todayUTC.getTime() - 24 * 60 * 60 * 1000);
        const yesterdayStr = formatDateToISO(yesterdayUTC);
        const yesterdayDocId = `${userId}_${yesterdayStr}`;
        const yesterdayRef = doc(db, "dailyPrayerTargets", yesterdayDocId);
        let completedYesterdayIds = [];
        try {
            const yesterdaySnap = await getDoc(yesterdayRef);
            if (yesterdaySnap.exists()) {
                const yesterdayData = yesterdaySnap.data();
                if (yesterdayData && Array.isArray(yesterdayData.targets)) { completedYesterdayIds = yesterdayData.targets.filter(t => t.completed).map(t => t.targetId); }
            }
        } catch (error) { console.warn("[generateDailyTargets] Error fetching previous day's targets:", error); }
        let pool = availableTargets.filter(target => target.id && !completedYesterdayIds.includes(target.id));
        if (pool.length === 0 && availableTargets.length > 0 && availableTargets.length === completedYesterdayIds.length) {
             console.log("[generateDailyTargets] All active targets completed yesterday. Restarting cycle."); pool = [...availableTargets];
        } else if (pool.length === 0) { console.log("[generateDailyTargets] No targets available in the pool today."); return { userId, date: dateStr, targets: [] }; }
        const shuffledPool = pool.sort(() => 0.5 - Math.random());
        const selectedTargets = shuffledPool.slice(0, Math.min(10, pool.length));
        const targetsForFirestore = selectedTargets.map(target => ({ targetId: target.id, completed: false }));
        await updateLastPresentedDates(userId, selectedTargets);
        console.log(`[generateDailyTargets] Generated ${targetsForFirestore.length} daily targets for ${userId} on ${dateStr}.`);
        return { userId, date: dateStr, targets: targetsForFirestore };
    } catch (error) { console.error("[generateDailyTargets] Error generating daily targets:", error); return { userId, date: dateStr, targets: [] }; }
}

async function updateLastPresentedDates(userId, selectedTargets) {
    if (!selectedTargets || selectedTargets.length === 0) return;
    const batch = writeBatch(db); const nowTimestamp = Timestamp.fromDate(new Date());
    selectedTargets.forEach(target => {
        if (target && target.id) { const targetRef = doc(db, "users", userId, "prayerTargets", target.id); batch.update(targetRef, { lastPresentedDate: nowTimestamp }); }
    });
    try { await batch.commit(); console.log(`[updateLastPresentedDates] Updated lastPresentedDate for ${selectedTargets.length} targets.`); }
    catch (error) { console.error("[updateLastPresentedDates] Error updating lastPresentedDate:", error); }
}

function renderDailyTargets(pendingTargets, completedTargets) {
    const dailyTargetsDiv = document.getElementById("dailyTargets"); dailyTargetsDiv.innerHTML = '';
    if (pendingTargets.length === 0 && completedTargets.length === 0) { dailyTargetsDiv.innerHTML = "<p>Nenhum alvo de oração selecionado para hoje.</p>"; return; }
    pendingTargets.forEach((target) => {
        if (!target || !target.id) return;
        const dailyDiv = createTargetElement(target, false);
        addPrayButtonFunctionality(dailyDiv, target.id);
        dailyTargetsDiv.appendChild(dailyDiv);
    });
    if (completedTargets.length > 0) {
        if (pendingTargets.length > 0) { const separator = document.createElement('hr'); separator.style.borderColor = '#ccc'; dailyTargetsDiv.appendChild(separator); }
         const completedTitle = document.createElement('h3'); completedTitle.textContent = "Concluídos Hoje"; completedTitle.style.cssText = 'color:#777; font-size:1.1em; margin-top:15px;'; dailyTargetsDiv.appendChild(completedTitle);
        completedTargets.forEach((target) => {
             if (!target || !target.id) return;
            const dailyDiv = createTargetElement(target, true); dailyTargetsDiv.appendChild(dailyDiv);
        });
    }
    if (pendingTargets.length === 0 && completedTargets.length > 0) { displayCompletionPopup(); }
}

function createTargetElement(target, isCompleted) {
    const dailyDiv = document.createElement("div");
    dailyDiv.classList.add("target");
    if (isCompleted) dailyDiv.classList.add("completed-target");
    dailyDiv.dataset.targetId = target.id;
    const deadlineTag = target.hasDeadline ? `<span class="deadline-tag ${isDateExpired(target.deadlineDate) ? 'expired' : ''} ${isCompleted ? 'completed' : ''}">Prazo: ${formatDateForDisplay(target.deadlineDate)}</span>` : '';
    const observationsHTML = renderObservations(target.observations || [], false, target.id);
    dailyDiv.innerHTML = `
        <h3>${deadlineTag} ${target.title || 'Título Indisponível'}</h3>
        <p>${target.details || 'Detalhes Indisponíveis'}</p>
        <p><strong>Data Criação:</strong> ${formatDateForDisplay(target.date)}</p>
        <p><strong>Tempo Decorrido:</strong> ${timeElapsed(target.date)}</p>
        ${observationsHTML}`;
    return dailyDiv;
}

function addPrayButtonFunctionality(dailyDiv, targetId) {
    const prayButton = document.createElement("button");
    prayButton.textContent = "Orei!"; prayButton.classList.add("pray-button", "btn");
    prayButton.onclick = async () => {
        const user = auth.currentUser; if (!user) return; const userId = user.uid;
        const todayStr = formatDateToISO(new Date()); const dailyDocId = `${userId}_${todayStr}`;
        const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);
        prayButton.disabled = true; prayButton.textContent = "Orado!";
        try {
            const dailySnap = await getDoc(dailyRef);
            if (!dailySnap.exists()) { console.error("Daily document not found when marking prayed:", dailyDocId); alert("Erro: Documento diário não encontrado."); prayButton.disabled = false; prayButton.textContent = "Orei!"; return; }
            const dailyData = dailySnap.data(); let targetUpdated = false;
            const updatedTargets = dailyData.targets.map(t => { if (t.targetId === targetId) { targetUpdated = true; return { ...t, completed: true }; } return t; });
            if (!targetUpdated) console.warn(`Target ${targetId} not found in daily doc.`);
            await updateDoc(dailyRef, { targets: updatedTargets });
            await updateClickCounts(userId, targetId); // Atualiza contagem E interação semanal
            loadDailyTargets(); // Re-renderiza seção diária
        } catch (error) { console.error("Error registering 'Orei!':", error); alert("Erro ao registrar oração."); prayButton.disabled = false; prayButton.textContent = "Orei!"; }
    };
     dailyDiv.insertBefore(prayButton, dailyDiv.firstChild);
}

// --- MODIFICADO --- updateClickCounts agora também trata da interação semanal
async function updateClickCounts(userId, targetId) {
     const clickCountsRef = doc(db, "prayerClickCounts", targetId);
     const now = new Date();
     const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
     const year = now.getFullYear().toString();

     try {
         // Atualiza contadores de cliques (como antes)
         await setDoc(clickCountsRef, {
             targetId: targetId, userId: userId, totalClicks: increment(1),
             [`monthlyClicks.${yearMonth}`]: increment(1), [`yearlyClicks.${year}`]: increment(1)
         }, { merge: true });
         console.log(`[updateClickCounts] Click count updated for target ${targetId}.`);

         // --- LÓGICA DO QUADRO SEMANAL (ADICIONADA/MODIFICADA AQUI) ---
         const todayUTCStr = formatDateToISO(now); // YYYY-MM-DD UTC
         const weekId = getWeekIdentifier(now);     // Semana atual

         // Assegura que os dados locais de perseverança estão inicializados
         perseveranceData.weeklyInteractions = perseveranceData.weeklyInteractions || {};
         perseveranceData.weekId = perseveranceData.weekId || weekId;

         // Prepara dados para salvar no Firestore
         const dataToSaveForPerseverance = {};

         // Verifica se a semana mudou
         if (perseveranceData.weekId !== weekId) {
             console.log(`[updateClickCounts] Week changed during interaction from ${perseveranceData.weekId} to ${weekId}. Clearing old weekly data.`);
             perseveranceData.weeklyInteractions = {}; // Limpa mapa local
             perseveranceData.weekId = weekId;         // Atualiza ID local
             dataToSaveForPerseverance.weeklyInteractions = {}; // Marca para limpar no Firestore
             dataToSaveForPerseverance.weekId = weekId;         // Marca para atualizar no Firestore
         }

         // Marca o dia atual como interagido no mapa local e prepara para salvar
         if (perseveranceData.weeklyInteractions[todayUTCStr] !== true) {
             perseveranceData.weeklyInteractions[todayUTCStr] = true;
             dataToSaveForPerseverance.weeklyInteractions = perseveranceData.weeklyInteractions; // Marca para salvar o mapa atualizado
             // Garante que weekId seja salvo se weeklyInteractions for modificado
             if (!dataToSaveForPerseverance.weekId) {
                 dataToSaveForPerseverance.weekId = perseveranceData.weekId;
             }
         }

         // Salva as atualizações de perseverança (se houver alguma)
         if (Object.keys(dataToSaveForPerseverance).length > 0) {
             await updatePerseveranceFirestore(userId, dataToSaveForPerseverance);
         }

         // Atualiza o quadro visualmente IMEDIATAMENTE após a interação
         updateWeeklyChart();
         // --- FIM LÓGICA DO QUADRO SEMANAL ---

     } catch (error) {
         console.error(`[updateClickCounts] Error updating click count or weekly interaction for ${targetId}:`, error);
         // Não reverter a UI aqui, pois o clique pode ter sido registrado mesmo com erro na parte semanal
     }
 }


// --- Perseverança ---

// --- MODIFICADO --- loadPerseveranceData agora trata weekId e weeklyInteractions E SALVA A LIMPEZA
async function loadPerseveranceData(userId) {
    console.log(`[loadPerseveranceData] Loading for user ${userId}`);
    const perseveranceDocRef = doc(db, "perseveranceData", userId);
    let shouldSaveWeekChange = false; // Flag para indicar se a mudança de semana precisa ser salva

    try {
        const docSnap = await getDoc(perseveranceDocRef);
        const today = new Date();
        const weekId = getWeekIdentifier(today); // Identificador da semana atual

        if (docSnap.exists()) {
            perseveranceData = docSnap.data();
            // Conversão de Timestamp para Date (barra de progresso)
            if (perseveranceData.lastInteractionDate instanceof Timestamp) {
                perseveranceData.lastInteractionDate = perseveranceData.lastInteractionDate.toDate();
            }
            // Garante que números sejam números
            perseveranceData.consecutiveDays = Number(perseveranceData.consecutiveDays) || 0;
            perseveranceData.recordDays = Number(perseveranceData.recordDays) || 0;

            // --- LÓGICA DO QUADRO SEMANAL ---
            // Verifica se os dados semanais são da semana atual, senão limpa
            if (perseveranceData.weekId !== weekId) {
                console.log(`[loadPerseveranceData] Week changed from ${perseveranceData.weekId} to ${weekId}. Clearing weekly interactions.`);
                perseveranceData.weeklyInteractions = {}; // Limpa interações da semana passada localmente
                perseveranceData.weekId = weekId;         // Atualiza o ID da semana localmente
                shouldSaveWeekChange = true; // MARCA que precisamos salvar esta limpeza
            } else {
                 // Garante que weeklyInteractions exista como objeto
                perseveranceData.weeklyInteractions = perseveranceData.weeklyInteractions || {};
            }
            // --- FIM LÓGICA DO QUADRO SEMANAL ---

        } else {
            // Se não existe, inicializa tudo
            console.log(`[loadPerseveranceData] No perseverance data found for ${userId}. Initializing.`);
            perseveranceData = {
                consecutiveDays: 0, lastInteractionDate: null, recordDays: 0,
                weeklyInteractions: {}, weekId: weekId
            };
            // Não precisa marcar para salvar, pois será criado na primeira interação
        }
        currentWeekIdentifier = perseveranceData.weekId; // Atualiza a variável global

        // --- CORREÇÃO: Salva a mudança de semana (limpeza) imediatamente ---
        if (shouldSaveWeekChange) {
            console.log("[loadPerseveranceData] Saving week change (cleared interactions and new weekId) to Firestore.");
            // Cria um objeto APENAS com os campos a serem atualizados devido à mudança de semana
            const weekChangeData = {
                weeklyInteractions: {}, // Salva o mapa vazio
                weekId: perseveranceData.weekId // Salva o novo ID da semana
            };
            try {
                await updatePerseveranceFirestore(userId, weekChangeData);
                console.log("[loadPerseveranceData] Week change saved successfully.");
            } catch (saveError) {
                console.error("[loadPerseveranceData] Failed to save week change to Firestore:", saveError);
                // Considerar como lidar com erro de salvamento aqui. Talvez alertar o usuário?
                // Por enquanto, a lógica local foi atualizada, mas o Firestore pode estar dessincronizado.
            }
        }
        // --- FIM DA CORREÇÃO ---

        // ATUALIZA A BARRA DE PROGRESSO (Independente do quadro)
        updatePerseveranceUI();

        // ATUALIZA O QUADRO SEMANAL (Independente da barra)
        // Agora lê os dados locais que foram corretamente inicializados ou limpos
        updateWeeklyChart();

    } catch (error) {
        console.error("[loadPerseveranceData] Error loading perseverance data:", error);
         // Estado de erro seguro
         perseveranceData = { consecutiveDays: 0, lastInteractionDate: null, recordDays: 0, weeklyInteractions: {}, weekId: getWeekIdentifier(new Date()) };
         currentWeekIdentifier = perseveranceData.weekId;
         updatePerseveranceUI(); // Tenta atualizar UI mesmo em erro
         updateWeeklyChart();    // Tenta atualizar UI mesmo em erro
    }
}


// Função para o botão "Confirmar Perseverança" (pode ou não afetar o quadro semanal)
async function confirmPerseverance() {
    const user = auth.currentUser; if (!user) { alert("Erro: Usuário não autenticado."); return; }
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
             if (lastInteractionUTCStart.getTime() === expectedYesterdayUTCStart.getTime()) { isConsecutive = true; }
         }
         perseveranceData.consecutiveDays = isConsecutive ? perseveranceData.consecutiveDays + 1 : 1;
         perseveranceData.lastInteractionDate = todayUTCStart; // Armazena Date UTC
         if (perseveranceData.consecutiveDays > perseveranceData.recordDays) { perseveranceData.recordDays = perseveranceData.consecutiveDays; }

         // Prepara dados para salvar (barra de progresso)
         const dataToSave = {
             consecutiveDays: perseveranceData.consecutiveDays,
             lastInteractionDate: Timestamp.fromDate(perseveranceData.lastInteractionDate), // Converte para Timestamp
             recordDays: perseveranceData.recordDays
         };

         // --- OPCIONAL: Marcar interação semanal AQUI também? ---
         /* Se descomentar, clicar em "Confirmar Perseverança" também acenderá o dia no quadro
         const todayUTCStr = formatDateToISO(todayUTCStart);
         const weekId = getWeekIdentifier(todayUTCStart);
         perseveranceData.weeklyInteractions = perseveranceData.weeklyInteractions || {};
         perseveranceData.weekId = perseveranceData.weekId || weekId;
         if (perseveranceData.weekId !== weekId) {
             console.log(`[confirmPerseverance] Week changed. Clearing old weekly data.`);
             perseveranceData.weeklyInteractions = {};
             perseveranceData.weekId = weekId;
             dataToSave.weeklyInteractions = {}; // Marca para limpar
             dataToSave.weekId = weekId;         // Marca para atualizar
         }
         if (perseveranceData.weeklyInteractions[todayUTCStr] !== true) {
             perseveranceData.weeklyInteractions[todayUTCStr] = true;
             dataToSave.weeklyInteractions = perseveranceData.weeklyInteractions; // Marca para salvar
             if (!dataToSave.weekId) dataToSave.weekId = perseveranceData.weekId; // Garante salvar weekId
         }
         */
         // --- FIM OPCIONAL ---

         try {
            await updatePerseveranceFirestore(userId, dataToSave);
            updatePerseveranceUI(); // Atualiza barra
            // updateWeeklyChart(); // <<== DESCOMENTE esta linha SE DESCOMENTOU O BLOCO OPCIONAL ACIMA
            alert(`Perseverança confirmada! Dias consecutivos: ${perseveranceData.consecutiveDays}`);
         } catch (error) { console.error("[confirmPerseverance] Error updating Firestore:", error); alert("Erro ao salvar dados de perseverança."); }
    } else { alert("Perseverança já confirmada para hoje!"); }
}

// --- MODIFICADO --- updatePerseveranceFirestore aceita objeto parcial e usa merge
async function updatePerseveranceFirestore(userId, data) {
    const perseveranceDocRef = doc(db, "perseveranceData", userId);
    const dataToSave = {}; // Cria um objeto vazio para os dados a serem salvos

    // Mapeia apenas os campos fornecidos em 'data' para 'dataToSave'
    if (data.hasOwnProperty('consecutiveDays')) dataToSave.consecutiveDays = data.consecutiveDays;
    // Converte Date para Timestamp SOMENTE se for um Date válido
    if (data.hasOwnProperty('lastInteractionDate')) {
        if (data.lastInteractionDate instanceof Date && !isNaN(data.lastInteractionDate)) {
             dataToSave.lastInteractionDate = Timestamp.fromDate(data.lastInteractionDate);
        } else if (data.lastInteractionDate instanceof Timestamp || data.lastInteractionDate === null) {
             dataToSave.lastInteractionDate = data.lastInteractionDate; // Aceita Timestamp ou null
        }
    }
    if (data.hasOwnProperty('recordDays')) dataToSave.recordDays = data.recordDays;
    if (data.hasOwnProperty('weeklyInteractions')) dataToSave.weeklyInteractions = data.weeklyInteractions || {}; // Garante que seja objeto
    if (data.hasOwnProperty('weekId')) dataToSave.weekId = data.weekId;

    // Evita escrita desnecessária se nada foi fornecido
    if (Object.keys(dataToSave).length === 0) {
        console.warn("[updatePerseveranceFirestore] No valid data provided to save.");
        return;
    }

    try {
        await setDoc(perseveranceDocRef, dataToSave, { merge: true }); // Usa merge: true
        console.log("[updatePerseveranceFirestore] Data saved:", Object.keys(dataToSave));
    } catch (error) {
        console.error("[updatePerseveranceFirestore] Error saving data:", error);
        // Considerar lançar o erro ou tratar de outra forma
        throw error; // Lança o erro para que a função chamadora possa saber
    }
}


// --- MODIFICADO --- updatePerseveranceUI NÃO chama mais updateWeeklyChart
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
    // A chamada para updateWeeklyChart foi removida daqui
}

// --- MODIFICADO --- resetPerseveranceUI também reseta dados e UI do quadro semanal
function resetPerseveranceUI() {
    const progressBar = document.getElementById('perseveranceProgressBar');
    const percentageDisplay = document.getElementById('perseverancePercentage');
    if (progressBar && percentageDisplay) {
        progressBar.style.width = `0%`;
        percentageDisplay.textContent = `0%`;
    }
    // Reseta dados locais de perseverança (incluindo semanais)
    perseveranceData = {
        consecutiveDays: 0, lastInteractionDate: null, recordDays: 0,
        weeklyInteractions: {}, weekId: getWeekIdentifier(new Date())
    };
    currentWeekIdentifier = perseveranceData.weekId;
    // Limpa visualmente os ticks do quadro
    resetWeeklyChart();
}

// --- REESCRITO --- updateWeeklyChart lê weeklyInteractions da semana atual
function updateWeeklyChart() {
    const today = new Date();
    // getDay() retorna 0 para Domingo, 1 para Segunda... 6 para Sábado (perfeito para nosso índice 0-6)
    const currentDayOfWeek = today.getDay();

    // Encontra o Domingo da semana atual
    const firstDayOfWeek = new Date(today);
    firstDayOfWeek.setUTCDate(today.getUTCDate() - currentDayOfWeek); // Subtrai dias para chegar ao Domingo (em UTC)
    firstDayOfWeek.setUTCHours(0, 0, 0, 0); // Zera a hora para consistência

    // Pega as interações da semana atual (ou um objeto vazio)
    const interactions = perseveranceData.weeklyInteractions || {};
    console.log("[updateWeeklyChart] Checking interactions for week:", perseveranceData.weekId, "Data:", interactions);

    // Itera pelos 7 dias (índice 0 = Dom, 1 = Seg, ..., 6 = Sáb)
    for (let i = 0; i < 7; i++) {
        const dayTick = document.getElementById(`day-${i}`);
        if (!dayTick) continue; // Pula se o elemento HTML não for encontrado

        // Calcula a data UTC para o dia 'i' da semana atual
        const currentDay = new Date(firstDayOfWeek);
        currentDay.setUTCDate(firstDayOfWeek.getUTCDate() + i);

        // Formata a data para YYYY-MM-DD (chave do nosso mapa)
        const dateStringUTC = formatDateToISO(currentDay);

        // Verifica se existe uma entrada 'true' para esta data no mapa
        if (interactions[dateStringUTC] === true) {
            dayTick.classList.add('active');
            // console.log(`[updateWeeklyChart] Day ${i} (${dateStringUTC}) is ACTIVE.`);
        } else {
            dayTick.classList.remove('active');
            // console.log(`[updateWeeklyChart] Day ${i} (${dateStringUTC}) is INACTIVE.`);
        }
    }
}

// --- NOVO ou Ajustado --- Função para limpar visualmente os ticks do quadro
function resetWeeklyChart() {
    for (let i = 0; i < 7; i++) {
        const dayTick = document.getElementById(`day-${i}`);
        if (dayTick) {
            dayTick.classList.remove('active');
        }
    }
    console.log("[resetWeeklyChart] Weekly chart ticks visually cleared.");
}


// --- Visualizações e Filtros ---
function generateViewHTML(targetsToInclude = lastDisplayedTargets) {
     let viewHTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Visualização de Alvos</title><style>body{font-family: sans-serif; margin: 20px;} .target{border: 1px solid #ccc; padding: 15px; margin-bottom: 15px; border-radius: 5px;} h3{margin-top:0;} .deadline-tag{background-color: #ffcc00; color: #333; padding: 3px 8px; border-radius: 4px; font-size: 0.8em; margin-right: 5px;} .deadline-tag.expired{background-color: #ff6666; color: #fff;} .observation-item{margin-left: 15px; font-size: 0.9em; color: #555; border-left: 2px solid #eee; padding-left: 10px;} .resolved{background-color:#eaffea; border-left: 5px solid #9cbe4a;} .completed-target{opacity: 0.7; border-left: 5px solid #aaa;}</style></head><body><h1>Alvos de Oração</h1>`;
     if (!Array.isArray(targetsToInclude) || targetsToInclude.length === 0) { viewHTML += "<p>Nenhum alvo para exibir.</p>"; }
     else { targetsToInclude.forEach(target => { if (target && target.id) viewHTML += generateTargetViewHTML(target); }); }
     viewHTML += `</body></html>`;
    const viewTab = window.open('', '_blank');
    if (viewTab) { viewTab.document.write(viewHTML); viewTab.document.close(); }
    else { alert('Popup bloqueado!'); }
}

function generateDailyViewHTML() {
    let viewHTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Alvos do Dia</title><style>body{font-family: sans-serif; margin: 20px;} .target{border: 1px solid #ccc; padding: 15px; margin-bottom: 15px; border-radius: 5px;} h3{margin-top:0;} .deadline-tag{background-color: #ffcc00; color: #333; padding: 3px 8px; border-radius: 4px; font-size: 0.8em; margin-right: 5px;} .deadline-tag.expired{background-color: #ff6666; color: #fff;} .observation-item{margin-left: 15px; font-size: 0.9em; color: #555; border-left: 2px solid #eee; padding-left: 10px;} .completed-target{background-color:#f0f0f0; border-left: 5px solid #9cbe4a;}</style></head><body><h1>Alvos do Dia</h1>`;
    const dailyTargetsDiv = document.getElementById('dailyTargets');
    let pendingCount = 0; let completedCount = 0;
    if (dailyTargetsDiv) {
        viewHTML += `<h2>Pendentes</h2>`;
        dailyTargetsDiv.querySelectorAll('.target:not(.completed-target)').forEach(div => {
            const targetId = div.dataset.targetId; const targetData = prayerTargets.find(t => t.id === targetId);
            if (targetData) { pendingCount++; viewHTML += generateTargetViewHTML(targetData); }
        });
        if (pendingCount === 0) viewHTML += "<p>Nenhum alvo pendente.</p>";
        viewHTML += `<hr/><h2>Concluídos Hoje</h2>`;
        dailyTargetsDiv.querySelectorAll('.target.completed-target').forEach(div => {
             const targetId = div.dataset.targetId; const targetData = prayerTargets.find(t => t.id === targetId);
             if (targetData) { completedCount++; viewHTML += generateTargetViewHTML(targetData, true); }
        });
        if (completedCount === 0) viewHTML += "<p>Nenhum alvo concluído hoje.</p>";
    } else { viewHTML += "<p>Erro: Seção de alvos diários não encontrada.</p>"; }
    viewHTML += `</body></html>`;
     const viewTab = window.open('', '_blank');
     if (viewTab) { viewTab.document.write(viewHTML); viewTab.document.close(); }
     else { alert('Popup bloqueado!'); }
}

function generateTargetViewHTML(target, isCompletedView = false) {
     if (!target || !target.id) return '';
     const formattedDate = formatDateForDisplay(target.date); const elapsed = timeElapsed(target.date); let deadlineTag = '';
     if (target.hasDeadline) { const formattedDeadline = formatDateForDisplay(target.deadlineDate); deadlineTag = `<span class="deadline-tag ${isDateExpired(target.deadlineDate) ? 'expired' : ''}">Prazo: ${formattedDeadline}</span>`; }
     const observations = Array.isArray(target.observations) ? target.observations : [];
     const observationsHTML = renderObservations(observations, true, target.id); // Mostra todas expandidas
     return `
         <div class="target ${isCompletedView ? 'completed-target' : ''}">
             <h3>${deadlineTag} ${target.title || 'Sem Título'}</h3>
             <p>${target.details || 'Sem Detalhes'}</p>
             <p><strong>Data Criação:</strong> ${formattedDate}</p>
             <p><strong>Tempo Decorrido:</strong> ${elapsed}</p>
             ${observationsHTML}
         </div>`;
}

async function generateResolvedViewHTML(startDate, endDate) { // Espera Date objects locais
    const user = auth.currentUser; if (!user) { alert("Você precisa estar logado."); return; }
    const uid = user.uid;
    const startUTC = new Date(Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()));
    const endNextDay = new Date(endDate); endNextDay.setDate(endDate.getDate() + 1);
    const endUTCStartOfNextDay = new Date(Date.UTC(endNextDay.getFullYear(), endNextDay.getMonth(), endNextDay.getDate()));
    const startTimestamp = Timestamp.fromDate(startUTC); const endTimestamp = Timestamp.fromDate(endUTCStartOfNextDay);
    const archivedRef = collection(db, "users", uid, "archivedTargets");
    const q = query(archivedRef, where("resolved", "==", true), where("resolutionDate", ">=", startTimestamp), where("resolutionDate", "<", endTimestamp), orderBy("resolutionDate", "desc"));
    let filteredResolvedTargets = [];
    try {
        const querySnapshot = await getDocs(q); const rawTargets = [];
        querySnapshot.forEach((doc) => rawTargets.push({ ...doc.data(), id: doc.id }));
        filteredResolvedTargets = rehydrateTargets(rawTargets);
    } catch (error) { console.error("Error fetching resolved targets:", error); alert("Erro ao buscar alvos respondidos."); return; }
    filteredResolvedTargets.sort((a, b) => (b.resolutionDate instanceof Date ? b.resolutionDate.getTime() : 0) - (a.resolutionDate instanceof Date ? a.resolutionDate.getTime() : 0));

    let viewHTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Alvos Respondidos</title><style>body{font-family: sans-serif; margin: 20px;} .target{border: 1px solid #ccc; padding: 15px; margin-bottom: 15px; border-radius: 5px;} h3{margin-top:0;} .observation-item{margin-left: 15px; font-size: 0.9em; color: #555; border-left: 2px solid #eee; padding-left: 10px;} .resolved{background-color:#eaffea; border-left: 5px solid #9cbe4a;}</style></head><body><h1>Alvos Respondidos</h1>`;
    viewHTML += `<h2>Período: ${formatDateForDisplay(startDate)} - ${formatDateForDisplay(endDate)}</h2><hr/>`;
     if (filteredResolvedTargets.length === 0) { viewHTML += "<p>Nenhum alvo respondido neste período.</p>"; }
     else { filteredResolvedTargets.forEach(target => { viewHTML += generateTargetViewHTMLForResolved(target); }); }
    viewHTML += `</body></html>`;
    const viewTab = window.open('', '_blank');
    if (viewTab) { viewTab.document.write(viewHTML); viewTab.document.close(); }
    else { alert('Popup bloqueado!'); }
}

function generateTargetViewHTMLForResolved(target) {
     if (!target || !target.id) return '';
     const formattedResolutionDate = formatDateForDisplay(target.resolutionDate); let totalTime = 'N/A';
     if (target.date instanceof Date && target.resolutionDate instanceof Date) {
         let diffInSeconds = Math.floor((target.resolutionDate.getTime() - target.date.getTime()) / 1000);
         if (diffInSeconds < 0) diffInSeconds = 0;
         // Cálculo de tempo (igual ao renderResolvedTargets)
         if (diffInSeconds < 60) totalTime = `${diffInSeconds} seg`; else { let diffInMinutes = Math.floor(diffInSeconds / 60);
             if (diffInMinutes < 60) totalTime = `${diffInMinutes} min`; else { let diffInHours = Math.floor(diffInMinutes / 60);
                 if (diffInHours < 24) totalTime = `${diffInHours} hr`; else { let diffInDays = Math.floor(diffInHours / 24);
                     if (diffInDays < 30) totalTime = `${diffInDays} dias`; else { let diffInMonths = Math.floor(diffInDays / 30.44);
                         if (diffInMonths < 12) totalTime = `${diffInMonths} meses`; else { let diffInYears = Math.floor(diffInDays / 365.25); totalTime = `${diffInYears} anos`; }}}}}
     }
     const observations = Array.isArray(target.observations) ? target.observations : [];
     const observationsHTML = renderObservations(observations, true, target.id); // Mostra todas expandidas
     return `
         <div class="target resolved">
             <h3>${target.title || 'Sem Título'} (Respondido)</h3>
             <p>${target.details || 'Sem Detalhes'}</p>
             <p><strong>Data Respondido:</strong> ${formattedResolutionDate}</p>
             <p><strong>Tempo Total:</strong> ${totalTime}</p>
             ${observationsHTML}
         </div>`;
}


function filterTargets(targets, searchTerm) {
    if (!searchTerm) return targets; const lowerSearchTerm = searchTerm.toLowerCase();
    return targets.filter(target => {
         const titleMatch = target.title && target.title.toLowerCase().includes(lowerSearchTerm);
         const detailsMatch = target.details && target.details.toLowerCase().includes(lowerSearchTerm);
         const observationMatch = Array.isArray(target.observations) && target.observations.some(obs => obs.text && obs.text.toLowerCase().includes(lowerSearchTerm));
        return titleMatch || detailsMatch || observationMatch;
    });
}

function handleSearchMain(event) { currentSearchTermMain = event.target.value; currentPage = 1; renderTargets(); }
function handleSearchArchived(event) { currentSearchTermArchived = event.target.value; currentArchivedPage = 1; renderArchivedTargets(); }
function handleSearchResolved(event) { currentSearchTermResolved = event.target.value; currentResolvedPage = 1; renderResolvedTargets(); }

function showPanel(panelIdToShow) {
    const allPanels = ['appContent', 'dailySection', 'mainPanel', 'archivedPanel', 'resolvedPanel', 'weeklyPerseveranceChart', 'perseveranceSection'];
    const separators = ['sectionSeparator'];
    allPanels.forEach(id => { const el = document.getElementById(id); if(el) el.style.display = 'none'; });
    separators.forEach(id => { const el = document.getElementById(id); if(el) el.style.display = 'none'; });
    const panelToShow = document.getElementById(panelIdToShow);
    if(panelToShow) panelToShow.style.display = 'block';

    // Mostra/Esconde elementos relacionados
    const dailySection = document.getElementById('dailySection');
    const weeklyChart = document.getElementById('weeklyPerseveranceChart');
    const perseveranceSection = document.getElementById('perseveranceSection');
    const sectionSeparator = document.getElementById('sectionSeparator');

    if (panelIdToShow === 'dailySection') {
        if(weeklyChart) weeklyChart.style.display = 'block';
        if(perseveranceSection) perseveranceSection.style.display = 'block';
        if(sectionSeparator) sectionSeparator.style.display = 'block';
    } else if (['appContent', 'mainPanel', 'archivedPanel', 'resolvedPanel'].includes(panelIdToShow)) {
        if(dailySection) dailySection.style.display = 'none';
        if(weeklyChart) weeklyChart.style.display = 'none';
        if(perseveranceSection) perseveranceSection.style.display = 'none';
        if(sectionSeparator) sectionSeparator.style.display = 'none';
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
    if (verseDisplay) { const randomIndex = Math.floor(Math.random() * verses.length); verseDisplay.textContent = verses[randomIndex]; }
}

function displayCompletionPopup() {
    const popup = document.getElementById('completionPopup');
    if (popup) {
        popup.style.display = 'flex'; const popupVerseElement = popup.querySelector('#popupVerse');
        if (popupVerseElement) { const randomIndex = Math.floor(Math.random() * verses.length); popupVerseElement.textContent = verses[randomIndex]; }
    }
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("[DOMContentLoaded] DOM fully loaded.");
    try { const dateInput = document.getElementById('date'); if (dateInput) dateInput.value = formatDateToISO(new Date()); }
    catch (e) { console.error("Error setting default date:", e); }

    onAuthStateChanged(auth, (user) => loadData(user));

    document.getElementById('searchMain')?.addEventListener('input', handleSearchMain);
    document.getElementById('searchArchived')?.addEventListener('input', handleSearchArchived);
    document.getElementById('searchResolved')?.addEventListener('input', handleSearchResolved);
    document.getElementById('showDeadlineOnly')?.addEventListener('change', handleDeadlineFilterChange);
    document.getElementById('showExpiredOnlyMain')?.addEventListener('change', handleExpiredOnlyMainChange);
    document.getElementById('btnEmailSignUp')?.addEventListener('click', signUpWithEmailPassword);
    document.getElementById('btnEmailSignIn')?.addEventListener('click', signInWithEmailPassword);
    document.getElementById('btnForgotPassword')?.addEventListener('click', resetPassword);
    document.getElementById('btnLogout')?.addEventListener('click', () => signOut(auth));
    document.getElementById('confirmPerseveranceButton')?.addEventListener('click', confirmPerseverance);
    document.getElementById("viewReportButton")?.addEventListener('click', () => window.location.href = 'orei.html');
    document.getElementById("refreshDaily")?.addEventListener("click", async () => {
        const user = auth.currentUser; if (!user) { alert("Você precisa estar logado."); return; }
        if (confirm("Atualizar lista de alvos do dia?")) {
            const userId = user.uid; const todayStr = formatDateToISO(new Date()); const dailyDocId = `${userId}_${todayStr}`;
            const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);
            try {
                const newTargetsData = await generateDailyTargets(userId, todayStr);
                await setDoc(dailyRef, newTargetsData); loadDailyTargets(); alert("Alvos do dia atualizados!");
            } catch (error) { console.error("Error refreshing daily targets:", error); alert("Erro ao atualizar alvos diários."); }
        }
     });
     document.getElementById("copyDaily")?.addEventListener("click", () => {
        const dailyTargetsDiv = document.getElementById('dailyTargets'); let textToCopy = ''; if (!dailyTargetsDiv) return;
        const targetDivs = dailyTargetsDiv.querySelectorAll('.target:not(.completed-target)');
        targetDivs.forEach((div, index) => {
            const titleElement = div.querySelector('h3'); const titleText = titleElement ? (titleElement.lastChild.textContent ? titleElement.lastChild.textContent.trim() : titleElement.textContent.trim()) : 'Sem Título';
            const detailsElement = div.querySelector('p:nth-of-type(1)'); const detailsText = detailsElement ? detailsElement.textContent.trim() : 'Sem Detalhes';
            textToCopy += `${index + 1}. ${titleText}\n   ${detailsText}\n\n`;
        });
        if (textToCopy) { navigator.clipboard.writeText(textToCopy.trim()).then(() => alert('Alvos pendentes copiados!')).catch(err => prompt("Falha ao copiar. Copie manualmente:", textToCopy.trim())); }
        else { alert('Nenhum alvo pendente para copiar.'); }
     });
     document.getElementById('generateViewButton')?.addEventListener('click', () => generateViewHTML());
     document.getElementById('viewDaily')?.addEventListener('click', generateDailyViewHTML);
     document.getElementById("viewResolvedViewButton")?.addEventListener("click", () => { const modal = document.getElementById("dateRangeModal"); if(modal) modal.style.display = "block"; });
     document.getElementById('closePopup')?.addEventListener('click', () => { const popup = document.getElementById('completionPopup'); if(popup) popup.style.display = 'none'; });

     // Navigation buttons
    document.getElementById('viewAllTargetsButton')?.addEventListener('click', () => { showPanel('mainPanel'); currentPage = 1; renderTargets(); });
    document.getElementById('addNewTargetButton')?.addEventListener('click', () => showPanel('appContent'));
    document.getElementById("viewArchivedButton")?.addEventListener("click", () => { showPanel('archivedPanel'); currentArchivedPage = 1; renderArchivedTargets(); });
    document.getElementById("viewResolvedButton")?.addEventListener("click", () => { showPanel('resolvedPanel'); currentResolvedPage = 1; renderResolvedTargets(); });
    document.getElementById("backToMainButton")?.addEventListener("click", () => showPanel('dailySection')); // Volta para a seção diária (página inicial)

    // Date Range Modal Logic
    const dateRangeModal = document.getElementById("dateRangeModal");
    document.getElementById("closeDateRangeModal")?.addEventListener("click", () => {if(dateRangeModal) dateRangeModal.style.display = "none"});
    document.getElementById("generateResolvedView")?.addEventListener("click", () => {
        const startDateStr = document.getElementById("startDate").value;
        const endDateStr = document.getElementById("endDate").value;
        if (startDateStr && endDateStr) {
            // Parse as local dates, will be converted to UTC for query in generateResolvedViewHTML
            const start = new Date(startDateStr + 'T00:00:00'); // Assume local midnight start
            const end = new Date(endDateStr + 'T00:00:00');     // Assume local midnight start
             if (isNaN(start.getTime()) || isNaN(end.getTime())) { alert("Datas inválidas."); return; }
             if (start > end) { alert("Data de início após data de fim."); return; }
            generateResolvedViewHTML(start, end); // Pass Date objects
            if(dateRangeModal) dateRangeModal.style.display = "none";
        } else { alert("Selecione as datas."); }
    });
    document.getElementById("cancelDateRange")?.addEventListener("click", () => {if(dateRangeModal) dateRangeModal.style.display = "none"});
    window.addEventListener('click', (event) => { if (event.target == dateRangeModal) dateRangeModal.style.display = "none"; });

});