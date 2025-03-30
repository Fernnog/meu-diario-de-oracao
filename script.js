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
let dailyDisplayedTargetIds = new Set(); // *** NOVO: Guarda IDs exibidos no dia (random + manual) ***

// ==== FUNÇÕES UTILITÁRIAS ====

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

function formatDateForDisplay(dateInput) {
    // console.log('[formatDateForDisplay] Received input:', dateInput, '| Type:', typeof dateInput); // Keep for debugging if needed

    if (!dateInput) {
        // console.log('[formatDateForDisplay] Input is null or undefined. Returning Invalid Date.');
        return 'Data Inválida';
    }

    let dateToFormat;
    if (dateInput instanceof Timestamp) {
        // console.log('[formatDateForDisplay] Input is Timestamp. Converting to Date.');
        dateToFormat = dateInput.toDate();
    } else if (dateInput instanceof Date) {
        // console.log('[formatDateForDisplay] Input is already Date.');
        dateToFormat = dateInput;
    } else {
        if (typeof dateInput === 'string') {
            // console.log('[formatDateForDisplay] Input is string. Attempting to parse.');
            dateToFormat = new Date(dateInput);
        } else {
            console.warn("[formatDateForDisplay] Input is unexpected type:", typeof dateInput, dateInput, ". Returning Invalid Date.");
            return 'Data Inválida';
        }
    }

    if (!dateToFormat || isNaN(dateToFormat.getTime())) {
        // console.log('[formatDateForDisplay] Conversion resulted in invalid Date object. Returning Invalid Date.');
        return 'Data Inválida';
    }

    const day = String(dateToFormat.getUTCDate()).padStart(2, '0');
    const month = String(dateToFormat.getUTCMonth() + 1).padStart(2, '0');
    const year = dateToFormat.getUTCFullYear();
    const formattedDate = `${day}/${month}/${year}`;
    // console.log('[formatDateForDisplay] Formatting successful using UTC components. Returning:', formattedDate);
    return formattedDate;
}


function formatDateForFilename(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
        date = new Date();
    }
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
}

function timeElapsed(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
        return 'Data Inválida';
    }

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

function rehydrateTargets(targets) {
    // console.log('[rehydrateTargets] Starting rehydration for', targets.length, 'targets.');
    return targets.map((target, index) => {
        const rehydratedTarget = { ...target };
        const fieldsToConvert = ['date', 'deadlineDate', 'lastPresentedDate', 'resolutionDate', 'archivedDate'];
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

    // Seleciona os menus e separadores
    const mainMenu = document.getElementById('mainMenu');
    const mainMenuActions = document.getElementById('mainMenuActions');
    const menuSeparatorDark = document.getElementById('menuSeparatorDark');
    const menuSeparatorBottom = document.getElementById('menuSeparatorBottom');
    // (Mantenha as outras seleções como estavam: perseveranceSection, weeklyChart, sectionSeparator)
    const perseveranceSection = document.getElementById('perseveranceSection');
    const weeklyChart = document.getElementById('weeklyPerseveranceChart');
    const sectionSeparator = document.getElementById('sectionSeparator'); // Separador principal antes do conteúdo diário


    if (user) {
        authStatusContainer.style.display = 'flex';
        btnLogout.style.display = 'inline-block';
        emailPasswordAuthForm.style.display = 'none';

        // Mostrar menus e separadores relacionados
        if (mainMenu) mainMenu.style.display = 'block'; // Ou 'flex' dependendo do CSS
        if (mainMenuActions) mainMenuActions.style.display = 'block'; // Ou 'flex'
        if (menuSeparatorDark) menuSeparatorDark.style.display = 'block';
        if (menuSeparatorBottom) menuSeparatorBottom.style.display = 'block';

        // Mostrar seções de perseverança e separador principal (se aplicável)
        if (perseveranceSection) perseveranceSection.style.display = 'block';
        if (weeklyChart) weeklyChart.style.display = 'block';
        if (sectionSeparator) sectionSeparator.style.display = 'block';

        let providerType = user.providerData[0]?.providerId === 'password' ? 'E-mail/Senha' : 'Outro';
        authStatus.textContent = `Autenticado: ${user.email} (${providerType})`;

    } else {
        authStatusContainer.style.display = 'block';
        btnLogout.style.display = 'none';
        emailPasswordAuthForm.style.display = 'block';
        authStatus.textContent = "Nenhum usuário autenticado";

        // Esconder menus e separadores
        if (mainMenu) mainMenu.style.display = 'none';
        if (mainMenuActions) mainMenuActions.style.display = 'none';
        if (menuSeparatorDark) menuSeparatorDark.style.display = 'none';
        if (menuSeparatorBottom) menuSeparatorBottom.style.display = 'none';

        // Esconder seções que exigem login
        if (perseveranceSection) perseveranceSection.style.display = 'none';
        if (weeklyChart) weeklyChart.style.display = 'none';
        if (sectionSeparator) sectionSeparator.style.display = 'none';

        // Limpar/ocultar conteúdo principal
        document.getElementById('appContent').style.display = 'none';
        document.getElementById('dailySection').style.display = 'none';
        document.getElementById('mainPanel').style.display = 'none';
        document.getElementById('archivedPanel').style.display = 'none';
        document.getElementById('resolvedPanel').style.display = 'none';
        const dailyTargetsDiv = document.getElementById("dailyTargets");
        if(dailyTargetsDiv) dailyTargetsDiv.innerHTML = "<p>Faça login para ver os alvos diários.</p>";
        const dailyVerses = document.getElementById('dailyVerses');
        if(dailyVerses) dailyVerses.textContent = '';
        resetPerseveranceUI();
        prayerTargets = [];
        archivedTargets = [];
        resolvedTargets = [];
        renderTargets();
        renderArchivedTargets();
        renderResolvedTargets();
    }
}

async function signUpWithEmailPassword() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    try {
        await createUserWithEmailAndPassword(auth, email, password);
        alert("Cadastro realizado com sucesso!");
        document.getElementById('passwordResetMessage').style.display = 'none'; // Hide reset message
    } catch (error) {
        console.error("Erro ao cadastrar com e-mail/senha:", error);
        alert("Erro ao cadastrar: " + error.message);
    }
}

async function signInWithEmailPassword() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    try {
        await signInWithEmailAndPassword(auth, email, password);
        // loadData será chamado pelo onAuthStateChanged
        document.getElementById('passwordResetMessage').style.display = 'none'; // Hide reset message
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
        passwordResetMessageDiv.textContent = "E-mail de redefinição enviado para " + email + ". Verifique sua caixa de entrada e spam.";
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
    updateAuthUI(user); // Atualiza a UI de autenticação e visibilidade de seções
    const uid = user ? user.uid : null;

    if (uid) {
        console.log(`[loadData] User ${uid} authenticated. Loading data...`);
        // A visibilidade inicial das seções agora é controlada em updateAuthUI

        try {
            await fetchPrayerTargets(uid);
            await fetchArchivedTargets(uid);
            resolvedTargets = archivedTargets.filter(target => target.resolved);

            checkExpiredDeadlines();
            renderTargets(); // Renderiza painel principal (pode estar oculto inicialmente)
            renderArchivedTargets(); // Renderiza arquivados
            renderResolvedTargets(); // Renderiza resolvidos

            // Carrega dados diários e de perseverança
            await loadDailyTargets(); // Isso exibirá a dailySection se houver dados
            await loadPerseveranceData(uid); // Isso exibirá as seções de perseverança << MODIFICADO

            // Garante que a seção diária seja exibida por padrão após o login/carregamento
             if (document.getElementById('dailySection').style.display !== 'block') {
                  showPanel('dailySection');
             }


        } catch (error) {
             console.error("[loadData] Error during data loading process:", error);
             alert("Ocorreu um erro ao carregar seus dados. Por favor, recarregue a página.");
             // Esconder painéis em caso de erro grave
             showPanel(''); // Esconde todos os painéis principais
         }
    } else {
        console.log("[loadData] No user authenticated. UI handled by updateAuthUI.");
        // Limpeza de dados e UI já é feita em updateAuthUI(null)
    }
}


async function fetchPrayerTargets(uid) {
    prayerTargets = [];
    const targetsRef = collection(db, "users", uid, "prayerTargets");
    const targetsSnapshot = await getDocs(query(targetsRef, orderBy("date", "desc")));
    console.log(`[fetchPrayerTargets] Found ${targetsSnapshot.size} active targets for user ${uid}`);
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
    if (!targetListDiv) return; // Sai se o elemento não existir
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
            if (dateA && dateB) return dateA - dateB; // Sort by deadline ascending
            if (dateA) return -1; // Targets with deadline first
            if (dateB) return 1;
             // Fallback to creation date descending if deadlines are equal or absent
             const creationDateA = (a.date instanceof Date && !isNaN(a.date)) ? a.date.getTime() : 0;
             const creationDateB = (b.date instanceof Date && !isNaN(b.date)) ? b.date.getTime() : 0;
             return creationDateB - creationDateA;
        });
    } else {
        // Default sort: creation date descending
        filteredAndPagedTargets.sort((a, b) => {
             const creationDateA = (a.date instanceof Date && !isNaN(a.date)) ? a.date.getTime() : 0;
             const creationDateB = (b.date instanceof Date && !isNaN(b.date)) ? b.date.getTime() : 0;
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
        if (currentPage > 1) { // If on a page > 1 with no results, go back to page 1
            currentPage = 1; renderTargets(); return;
        } else {
            targetListDiv.innerHTML = '<p>Nenhum alvo de oração encontrado com os filtros atuais.</p>';
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
                    <button class="resolved btn" onclick="window.markAsResolved('${target.id}')">Respondido</button>
                    <button class="archive btn" onclick="window.archiveTarget('${target.id}')">Arquivar</button>
                    <button class="add-observation btn" onclick="window.toggleAddObservation('${target.id}')">Observação</button>
                    ${target.hasDeadline ? `<button class="edit-deadline btn" onclick="window.editDeadline('${target.id}')">Editar Prazo</button>` : ''}
                </div>
                <div id="observationForm-${target.id}" class="add-observation-form" style="display:none;"></div>
            `;
            targetListDiv.appendChild(targetDiv);
            renderObservationForm(target.id); // Render the (hidden) form structure
        });
    }

    renderPagination('mainPanel', currentPage, filteredAndPagedTargets);
}


function renderArchivedTargets() {
    const archivedListDiv = document.getElementById('archivedList');
    if (!archivedListDiv) return;
    archivedListDiv.innerHTML = '';
    let filteredAndPagedArchivedTargets = [...archivedTargets];

    if (currentSearchTermArchived) {
        filteredAndPagedArchivedTargets = filterTargets(filteredAndPagedArchivedTargets, currentSearchTermArchived);
    }
     // Sort by archivedDate descending (primary), fallback to creation date descending
     filteredAndPagedArchivedTargets.sort((a, b) => {
        const dateA = a.archivedDate instanceof Date ? a.archivedDate.getTime() : (a.date instanceof Date ? a.date.getTime() : 0);
        const dateB = b.archivedDate instanceof Date ? b.archivedDate.getTime() : (b.date instanceof Date ? b.date.getTime() : 0);
        return dateB - dateA;
     });

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
            archivedDiv.classList.add("target", "archived");
             if(target.resolved) archivedDiv.classList.add("resolved");
            archivedDiv.dataset.targetId = target.id;

            const formattedDate = formatDateForDisplay(target.date);
            const observations = Array.isArray(target.observations) ? target.observations : [];
            const resolutionDateStr = target.resolved && target.resolutionDate ? `Respondido em: ${formatDateForDisplay(target.resolutionDate)}` : '';
            const archivedDateStr = target.archivedDate ? `Arquivado em: ${formatDateForDisplay(target.archivedDate)}` : '';
            const statusText = [resolutionDateStr, archivedDateStr].filter(Boolean).join(' | '); // Join with separator if both exist

            archivedDiv.innerHTML = `
                <h3>${target.title || 'Sem Título'} ${target.resolved ? '<span class="resolved-indicator">(Respondido)</span>' : ''}</h3>
                <p>${target.details || 'Sem Detalhes'}</p>
                <p><strong>Data Criação:</strong> ${formattedDate}</p>
                 ${statusText ? `<p><strong>Status:</strong> ${statusText}</p>` : ''}
                ${renderObservations(observations, false, target.id)}
                <div class="target-actions">
                    <button class="delete btn" onclick="window.deleteArchivedTarget('${target.id}')">Excluir</button>
                    ${!target.resolved ? `<button class="resolved btn" onclick="window.markArchivedAsResolved('${target.id}')">Marcar Respondido</button>` : ''}
                    <!-- <button class="unarchive btn" onclick="window.unarchiveTarget('${target.id}')">Desarquivar</button> --> <!-- Add if needed -->
                </div>
                 <div id="observationForm-${target.id}" class="add-observation-form" style="display:none;"></div>
            `;
            archivedListDiv.appendChild(archivedDiv);
            renderObservationForm(target.id); // Render hidden form
        });
    }
    renderPagination('archivedPanel', currentArchivedPage, filteredAndPagedArchivedTargets);
}

function renderResolvedTargets() {
    const resolvedListDiv = document.getElementById('resolvedList');
    if (!resolvedListDiv) return;
    resolvedListDiv.innerHTML = '';
    let filteredAndPagedResolvedTargets = [...resolvedTargets];

    if (currentSearchTermResolved) {
        filteredAndPagedResolvedTargets = filterTargets(filteredAndPagedResolvedTargets, currentSearchTermResolved);
    }
     // Sort by resolution date descending
     filteredAndPagedResolvedTargets.sort((a, b) => {
         const dateA = a.resolutionDate instanceof Date ? a.resolutionDate.getTime() : 0;
         const dateB = b.resolutionDate instanceof Date ? b.resolutionDate.getTime() : 0;
         return dateB - dateA;
     });

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
            resolvedDiv.classList.add("target", "resolved");
            resolvedDiv.dataset.targetId = target.id;

            const formattedResolutionDate = formatDateForDisplay(target.resolutionDate);
            let totalTime = 'N/A';
            if (target.date instanceof Date && target.resolutionDate instanceof Date) {
                 totalTime = timeElapsed(target.date, target.resolutionDate); // Use timeElapsed for consistency
            }
            const observations = Array.isArray(target.observations) ? target.observations : [];

            resolvedDiv.innerHTML = `
                <h3>${target.title || 'Sem Título'} <span class="resolved-indicator">(Respondido)</span></h3>
                <p>${target.details || 'Sem Detalhes'}</p>
                <p><strong>Data Criação:</strong> ${formatDateForDisplay(target.date)}</p>
                <p><strong>Data Respondido:</strong> ${formattedResolutionDate}</p>
                <p><strong>Tempo Total:</strong> ${totalTime}</p>
                ${renderObservations(observations, false, target.id)}
                <div class="target-actions">
                   <button class="delete btn" onclick="window.deleteArchivedTarget('${target.id}')">Excluir</button>
                   <!-- <button class="unmark-resolved btn" onclick="window.unmarkResolved('${target.id}')">Desmarcar</button> --> <!-- Add if needed -->
                </div>
                 <div id="observationForm-${target.id}" class="add-observation-form" style="display:none;"></div>
            `;
            resolvedListDiv.appendChild(resolvedDiv);
            renderObservationForm(target.id); // Render hidden form
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
        paginationDiv.style.display = 'flex'; // Use flex for centering defined in styles.css
    }

    // Previous Button
    if (page > 1) {
        const prevLink = document.createElement('a');
        prevLink.href = '#';
        prevLink.textContent = '« Anterior';
        prevLink.classList.add('page-link');
        prevLink.dataset.page = page - 1;
        prevLink.dataset.panel = panelId;
        paginationDiv.appendChild(prevLink);
    } else {
         paginationDiv.appendChild(document.createElement('span')); // Placeholder for alignment
    }

    // Page Indicator
    const pageIndicator = document.createElement('span');
    pageIndicator.textContent = `Página ${page} de ${totalPages}`;
    pageIndicator.style.margin = "0 10px"; // Keep margin
    pageIndicator.style.padding = "8px 0"; // Add padding for vertical alignment
    paginationDiv.appendChild(pageIndicator);

    // Next Button
     if (page < totalPages) {
        const nextLink = document.createElement('a');
        nextLink.href = '#';
        nextLink.textContent = 'Próxima »';
        nextLink.classList.add('page-link');
        nextLink.dataset.page = page + 1;
        nextLink.dataset.panel = panelId;
        paginationDiv.appendChild(nextLink);
    } else {
        paginationDiv.appendChild(document.createElement('span')); // Placeholder for alignment
    }

    // Add event listeners after elements are in the DOM
    paginationDiv.querySelectorAll('.page-link').forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            const targetPage = parseInt(event.target.dataset.page);
            const targetPanel = event.target.dataset.panel;
            handlePageChange(targetPanel, targetPage);
             // Scroll to the top of the specific panel
             const panelElement = document.getElementById(targetPanel);
             if (panelElement) {
                 panelElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
             }
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
    // Scrolling is now handled within the pagination event listener
}

// --- Adição/Edição/Arquivamento ---
// Note: Attaching event listener moved to DOMContentLoaded for reliability
async function handlePrayerFormSubmit(e) {
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
        archivedDate: null,
        resolved: false,
        resolutionDate: null,
        observations: [],
        // lastPresentedDate: null, // Initialize if needed for sorting/logic later
    };

    try {
        const docRef = await addDoc(collection(db, "users", uid, "prayerTargets"), target);
        const newLocalTarget = rehydrateTargets([{ ...target, id: docRef.id }])[0];
        prayerTargets.unshift(newLocalTarget); // Add to the beginning
        prayerTargets.sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0)); // Ensure sorted

        document.getElementById("prayerForm").reset();
        document.getElementById('deadlineContainer').style.display = 'none';
        try { // Set default date again
           document.getElementById('date').value = formatDateToISO(new Date());
        } catch(e){ console.error("Error resetting date input:", e); }


        showPanel('mainPanel'); // Show the main list after adding
        currentPage = 1; // Go to first page
        renderTargets(); // Re-render the list
        alert('Alvo de oração adicionado com sucesso!');
    } catch (error) {
        console.error("Error adding prayer target: ", error);
        alert("Erro ao adicionar alvo de oração.");
    }
}

window.markAsResolved = async function(targetId) {
    const user = auth.currentUser;
    if (!user) { alert("Erro: Usuário não autenticado."); return; }
    const userId = user.uid;

    const targetIndex = prayerTargets.findIndex(t => t.id === targetId);
    if (targetIndex === -1) { alert("Erro: Alvo ativo não encontrado."); return; }

    const targetData = prayerTargets[targetIndex];
    const resolutionDate = Timestamp.fromDate(new Date());
    const archivedDate = Timestamp.fromDate(new Date()); // Mark as archived at the same time

    const activeTargetRef = doc(db, "users", userId, "prayerTargets", targetId);
    const archivedTargetRef = doc(db, "users", userId, "archivedTargets", targetId);

    try {
        // Prepare data for the archived collection, converting Dates back to Timestamps
        const archivedData = {
            ...targetData,
            date: targetData.date instanceof Date ? Timestamp.fromDate(targetData.date) : targetData.date,
            deadlineDate: targetData.deadlineDate instanceof Date ? Timestamp.fromDate(targetData.deadlineDate) : targetData.deadlineDate,
            lastPresentedDate: targetData.lastPresentedDate instanceof Date ? Timestamp.fromDate(targetData.lastPresentedDate) : targetData.lastPresentedDate, // Handle if exists
            observations: Array.isArray(targetData.observations) ? targetData.observations.map(obs => ({
                ...obs,
                date: obs.date instanceof Date ? Timestamp.fromDate(obs.date) : obs.date
            })) : [],
            resolved: true,
            archived: true, // Explicitly set archived flag
            resolutionDate: resolutionDate,
            archivedDate: archivedDate,
        };
        // Remove local properties not needed in Firestore or potentially problematic
        delete archivedData.id;


        const batch = writeBatch(db);
        batch.delete(activeTargetRef);
        batch.set(archivedTargetRef, archivedData); // Use set to create/overwrite in archived
        await batch.commit();

        // Update Local State
        prayerTargets.splice(targetIndex, 1); // Remove from active list
        const newArchivedLocal = rehydrateTargets([{...archivedData, id: targetId}])[0]; // Rehydrate with ID
        archivedTargets.unshift(newArchivedLocal); // Add to archived list
        archivedTargets.sort((a, b) => (b.archivedDate?.getTime() || b.date?.getTime() || 0) - (a.archivedDate?.getTime() || a.date?.getTime() || 0)); // Sort archived

        resolvedTargets = archivedTargets.filter(t => t.resolved); // Recalculate resolved list
        resolvedTargets.sort((a, b) => (b.resolutionDate?.getTime() || 0) - (a.resolutionDate?.getTime() || 0)); // Sort resolved

        renderTargets(); // Re-render active list
        renderArchivedTargets(); // Re-render archived list
        renderResolvedTargets(); // Re-render resolved list
        alert('Alvo marcado como respondido e movido para Arquivados.');
    } catch (error) {
        console.error("Error marking target as resolved: ", error);
        alert("Erro ao marcar como respondido.");
    }
};

window.markArchivedAsResolved = async function(targetId) {
    const user = auth.currentUser;
    if (!user) { alert("Erro: Usuário não autenticado."); return; }
    const userId = user.uid;

    const targetIndex = archivedTargets.findIndex(t => t.id === targetId && !t.resolved);
    if (targetIndex === -1) { alert("Erro: Alvo arquivado não encontrado ou já está respondido."); return; }

    const targetData = archivedTargets[targetIndex];
    const resolutionDate = Timestamp.fromDate(new Date());

    const archivedTargetRef = doc(db, "users", userId, "archivedTargets", targetId);

    try {
        await updateDoc(archivedTargetRef, {
            resolved: true,
            resolutionDate: resolutionDate
        });

        // Update Local State
        archivedTargets[targetIndex].resolved = true;
        archivedTargets[targetIndex].resolutionDate = resolutionDate.toDate();

        resolvedTargets = archivedTargets.filter(t => t.resolved);
        resolvedTargets.sort((a, b) => (b.resolutionDate?.getTime() || 0) - (a.resolutionDate?.getTime() || 0));

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
    if (targetIndex === -1) { alert("Erro: Alvo ativo não encontrado."); return; }

    const targetData = prayerTargets[targetIndex];
    const archivedDate = Timestamp.fromDate(new Date());

    const activeTargetRef = doc(db, "users", userId, "prayerTargets", targetId);
    const archivedTargetRef = doc(db, "users", userId, "archivedTargets", targetId);

    try {
        const archivedData = {
             ...targetData,
             date: targetData.date instanceof Date ? Timestamp.fromDate(targetData.date) : targetData.date,
             deadlineDate: targetData.deadlineDate instanceof Date ? Timestamp.fromDate(targetData.deadlineDate) : targetData.deadlineDate,
             lastPresentedDate: targetData.lastPresentedDate instanceof Date ? Timestamp.fromDate(targetData.lastPresentedDate) : targetData.lastPresentedDate,
             observations: Array.isArray(targetData.observations) ? targetData.observations.map(obs => ({
                 ...obs,
                 date: obs.date instanceof Date ? Timestamp.fromDate(obs.date) : obs.date
             })) : [],
             resolved: false, // Ensure resolved is false when just archiving
             archived: true,  // Set archived flag
             archivedDate: archivedDate,
             resolutionDate: null // Ensure resolutionDate is null
         };
         delete archivedData.id; // Remove local ID property before saving

        const batch = writeBatch(db);
        batch.delete(activeTargetRef);
        batch.set(archivedTargetRef, archivedData);
        await batch.commit();

        // Update Local State
        prayerTargets.splice(targetIndex, 1);
        const newArchivedLocal = rehydrateTargets([{ ...archivedData, id: targetId}])[0];
        archivedTargets.unshift(newArchivedLocal);
        archivedTargets.sort((a, b) => (b.archivedDate?.getTime() || b.date?.getTime() || 0) - (a.archivedDate?.getTime() || a.date?.getTime() || 0));
        // Resolved list remains unchanged by simple archiving
        resolvedTargets = archivedTargets.filter(t => t.resolved); // Recalculate just in case sorting changes
        resolvedTargets.sort((a, b) => (b.resolutionDate?.getTime() || 0) - (a.resolutionDate?.getTime() || 0));

        renderTargets();
        renderArchivedTargets();
        // No need to renderResolvedTargets unless its source data changed
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
     if (!confirm(`Tem certeza que deseja excluir permanentemente o alvo "${targetTitle}"? Esta ação não pode ser desfeita e removerá também o histórico de cliques.`)) return;

     const archivedTargetRef = doc(db, "users", userId, "archivedTargets", targetId);
     const clickCountsRef = doc(db, "prayerClickCounts", targetId); // Reference click counts doc

     try {
         const batch = writeBatch(db);
         batch.delete(archivedTargetRef);
         batch.delete(clickCountsRef); // Delete click counts associated with the target

         await batch.commit();

         // Update Local State
         const targetIndex = archivedTargets.findIndex(t => t.id === targetId);
         if (targetIndex !== -1) archivedTargets.splice(targetIndex, 1);

         resolvedTargets = archivedTargets.filter(target => target.resolved); // Recalculate resolved
         resolvedTargets.sort((a, b) => (b.resolutionDate?.getTime() || 0) - (a.resolutionDate?.getTime() || 0));

         // Re-render lists
         renderArchivedTargets();
         renderResolvedTargets();
         alert('Alvo e histórico de cliques excluídos permanentemente!');
     } catch (error) {
         console.error("Error deleting archived target and clicks: ", error);
         alert("Erro ao excluir alvo arquivado.");
     }
};

// --- Observações ---
window.toggleAddObservation = function(targetId) {
    const formDiv = document.getElementById(`observationForm-${targetId}`);
    if (!formDiv) return;
    const isVisible = formDiv.style.display === 'block';
    formDiv.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) {
         formDiv.querySelector('textarea')?.focus();
          // Set default date when opening
          const dateInput = formDiv.querySelector('input[type="date"]');
          if(dateInput && !dateInput.value) { // Only set if empty
               try {
                   dateInput.value = formatDateToISO(new Date());
               } catch(e) { console.error("Error setting default observation date:", e); }
          }
    }
};

function renderObservationForm(targetId) {
    const formDiv = document.getElementById(`observationForm-${targetId}`);
    if (!formDiv) return;
    // Only render structure; date is set when toggled open
    formDiv.innerHTML = `
        <textarea id="observationText-${targetId}" placeholder="Nova observação..." rows="3"></textarea>
        <input type="date" id="observationDate-${targetId}">
        <button class="btn" onclick="window.saveObservation('${targetId}')">Salvar Observação</button>
    `;
}

window.saveObservation = async function(targetId) {
    const observationText = document.getElementById(`observationText-${targetId}`)?.value.trim();
    const observationDateInput = document.getElementById(`observationDate-${targetId}`)?.value;

    if (!observationText || !observationDateInput) { alert('Texto e Data da observação são obrigatórios.'); return; }

    const observationDateUTC = createUTCDate(observationDateInput);
    if (!observationDateUTC) { alert('Data da observação inválida.'); return; }

    const user = auth.currentUser;
    if (!user) { alert("Erro: Usuário não autenticado."); return; }
    const userId = user.uid;

    let targetRef;
    let targetList; // Reference to the local array (prayerTargets or archivedTargets)
    let targetIndexInList = -1;

    // Find target in active list first
    targetIndexInList = prayerTargets.findIndex(t => t.id === targetId);
    if (targetIndexInList !== -1) {
        targetRef = doc(db, "users", userId, "prayerTargets", targetId);
        targetList = prayerTargets;
    } else {
        // If not active, find in archived list
        targetIndexInList = archivedTargets.findIndex(t => t.id === targetId);
        if (targetIndexInList !== -1) {
            targetRef = doc(db, "users", userId, "archivedTargets", targetId);
            targetList = archivedTargets;
        } else {
            alert("Erro: Alvo não encontrado para adicionar observação."); return;
        }
    }

    const newObservation = {
        text: observationText,
        date: Timestamp.fromDate(observationDateUTC),
        id: generateUniqueId(), // Simple unique ID for the observation itself
        targetId: targetId // Link back to the target
    };

    try {
        // Get current observations from Firestore
        const targetDocSnap = await getDoc(targetRef);
        if (!targetDocSnap.exists()) {
            throw new Error("Documento do alvo não existe no Firestore.");
        }
        const currentData = targetDocSnap.data();
        const currentObservationsFirestore = currentData.observations || [];

        // Add new observation and sort (Firestore expects Timestamps)
        currentObservationsFirestore.push(newObservation);
        currentObservationsFirestore.sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0)); // Sort by Timestamp seconds

        // Update Firestore document
        await updateDoc(targetRef, { observations: currentObservationsFirestore });

        // Update Local State
        const currentTargetLocal = targetList[targetIndexInList];
        if (!currentTargetLocal.observations || !Array.isArray(currentTargetLocal.observations)) {
            currentTargetLocal.observations = [];
        }
        // Add rehydrated observation (with Date object) to local array
        currentTargetLocal.observations.push({
            ...newObservation,
            date: newObservation.date.toDate() // Convert Timestamp to Date for local state
        });
        currentTargetLocal.observations.sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0)); // Sort local by Date milliseconds

        // Re-render the panel where the target resides
        if (targetList === prayerTargets) {
            renderTargets();
        } else if (targetList === archivedTargets) {
            renderArchivedTargets();
            // If the target is also resolved, re-render resolved panel too
            if (resolvedTargets.some(rt => rt.id === targetId)) {
                renderResolvedTargets();
            }
        }

        // Also re-render daily targets if the modified target is currently displayed there
        const dailyTargetDiv = document.querySelector(`#dailyTargets .target[data-target-id="${targetId}"]`);
         if (dailyTargetDiv) {
             console.log("Target is in daily list, refreshing its observations display.");
             const observationsContainer = dailyTargetDiv.querySelector('.observations');
             if(observationsContainer){
                  const isExpanded = observationsContainer.querySelector('.observations-toggle')?.textContent.includes('Ver menos');
                  observationsContainer.outerHTML = renderObservations(currentTargetLocal.observations, isExpanded, targetId);
             } else {
                  // If container didn't exist, add it (edge case)
                  dailyTargetDiv.insertAdjacentHTML('beforeend', renderObservations(currentTargetLocal.observations, false, targetId));
             }
         }


        toggleAddObservation(targetId); // Close the form
        document.getElementById(`observationText-${targetId}`).value = ''; // Clear text area
        document.getElementById(`observationDate-${targetId}`).value = ''; // Clear date input

    } catch (error) {
        console.error("Error saving observation:", error);
        alert("Erro ao salvar observação.");
    }
};

function renderObservations(observations, isExpanded = false, targetId = null) {
    if (!Array.isArray(observations) || observations.length === 0) return '<div class="observations" data-target-id="' + targetId + '"></div>'; // Return empty container with ID

    // Sort by Date object's time (descending)
    observations.sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));

    const displayCount = isExpanded ? observations.length : 1; // Show 1 by default, all if expanded
    const visibleObservations = observations.slice(0, displayCount);
    const remainingCount = observations.length - displayCount;

    let observationsHTML = `<div class="observations" data-target-id="${targetId}">`; // Add targetId for easier selection
    if (observations.length > 0) observationsHTML += `<h4>Observações:</h4>`; // Add title if there are observations

    visibleObservations.forEach(observation => {
        if (!observation || !observation.date) return; // Skip invalid observations
        const formattedDate = formatDateForDisplay(observation.date);
        observationsHTML += `<p class="observation-item"><strong>${formattedDate}:</strong> ${observation.text || ''}</p>`;
    });

    // Add toggle link logic
    if (targetId && observations.length > 1) { // Only show toggle if more than 1 observation
        if (!isExpanded && remainingCount > 0) {
            observationsHTML += `<a href="#" class="observations-toggle" onclick="window.toggleObservations('${targetId}', event); return false;">Ver mais ${remainingCount} observações</a>`;
        } else if (isExpanded) { // Always show "Ver menos" if expanded and more than 1 total
            observationsHTML += `<a href="#" class="observations-toggle" onclick="window.toggleObservations('${targetId}', event); return false;">Ver menos observações</a>`;
        }
    }

    observationsHTML += `</div>`;
    return observationsHTML;
}

window.toggleObservations = function(targetId, event) {
    if (event) event.preventDefault();

    // Find the specific observations container using the data attribute
    const observationsContainer = document.querySelector(`.observations[data-target-id="${targetId}"]`);
    if (!observationsContainer) { console.warn("Observations container not found for toggle:", targetId); return; }

    // Find the parent target div (might be in main, archived, resolved, or daily panel)
    const targetDiv = observationsContainer.closest('.target');
    if (!targetDiv) { console.warn("Parent target div not found for toggle:", targetId); return; }

    const isCurrentlyExpanded = observationsContainer.querySelector('.observations-toggle')?.textContent.includes('Ver menos');

    // Find the target data (search all relevant local lists)
    const targetData = prayerTargets.find(t => t.id === targetId) ||
                       archivedTargets.find(t => t.id === targetId) || // Check archived (includes resolved)
                       null; // Add other lists if necessary

    if (!targetData) { console.warn("Target data not found for toggle:", targetId); return; }

    // Re-render the observations section with the opposite expanded state
    const newObservationsHTML = renderObservations(targetData.observations || [], !isCurrentlyExpanded, targetId);
    observationsContainer.outerHTML = newObservationsHTML; // Replace the entire observations div
};


// --- Prazos (Deadlines) ---
// Listener moved to DOMContentLoaded
function handleDeadlineCheckboxChange() {
    document.getElementById('deadlineContainer').style.display = this.checked ? 'block' : 'none';
    if (this.checked) {
         // Set default deadline date if checkbox is checked and date is empty
         const deadlineInput = document.getElementById('deadlineDate');
         if (!deadlineInput.value) {
             try {
                 deadlineInput.value = formatDateToISO(new Date());
             } catch(e) { console.error("Error setting default deadline date:", e); }
         }
    }
}

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
    // Could update a badge or indicator here if needed
}

window.editDeadline = async function(targetId) {
    const target = prayerTargets.find(t => t.id === targetId);
    if (!target) { alert("Alvo ativo não encontrado para editar prazo."); return;}
    const targetDiv = document.querySelector(`#mainPanel .target[data-target-id="${targetId}"]`); // Ensure we select from the main panel
    if (!targetDiv) return;

    // Close any other open edit forms in the main panel
     targetDiv.parentElement.querySelectorAll('.edit-deadline-form').forEach(form => form.remove());


    const existingEditForm = targetDiv.querySelector('.edit-deadline-form');
    if (existingEditForm) { // If clicking again on the same target, close its form
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
            <button class="btn save-deadline-btn" onclick="window.saveEditedDeadline('${targetId}')" style="background-color: #4CAF50;">Salvar</button>
            <button class="btn cancel-deadline-btn" onclick="window.cancelEditDeadline('${targetId}')" style="background-color: #f44336;">Cancelar</button>
        </div>
    `;

    const actionsDiv = targetDiv.querySelector('.target-actions');
    if (actionsDiv) {
         actionsDiv.insertAdjacentHTML('afterend', formHTML); // Insert form after the action buttons
    } else {
         targetDiv.insertAdjacentHTML('beforeend', formHTML); // Fallback if no actions div
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
        // If date is cleared, confirm removal
        if (!confirm("Nenhuma data selecionada. Deseja remover o prazo deste alvo?")) return;
        // newDeadlineTimestamp remains null, newHasDeadline remains false
    }

    await updateDeadlineInFirestoreAndLocal(targetId, newDeadlineTimestamp, newHasDeadline);
    cancelEditDeadline(targetId); // Close the form after saving
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

         // Update local state
         const targetIndex = prayerTargets.findIndex(target => target.id === targetId);
         if (targetIndex !== -1) {
             prayerTargets[targetIndex].deadlineDate = newDeadlineTimestamp ? newDeadlineTimestamp.toDate() : null;
             prayerTargets[targetIndex].hasDeadline = newHasDeadline;
         }

         renderTargets(); // Re-render main panel to show changes

          // Also re-render daily targets if the modified target is currently displayed there
         const dailyTargetDiv = document.querySelector(`#dailyTargets .target[data-target-id="${targetId}"]`);
         if (dailyTargetDiv) {
             // Find the updated target data locally
             const updatedTargetData = prayerTargets.find(t => t.id === targetId);
              if(updatedTargetData){
                  // Re-create the element with updated data
                  const isCompleted = dailyTargetDiv.classList.contains('completed-target');
                  const isManual = dailyTargetDiv.dataset.isManual === "true";
                  const newDailyDiv = createTargetElement(updatedTargetData, isCompleted);
                  if(isManual) newDailyDiv.classList.add("manually-added"); // Re-add manual class if needed
                  if(isManual) newDailyDiv.dataset.isManual = "true";

                  // Replace the old div with the new one
                  dailyTargetDiv.replaceWith(newDailyDiv);

                  // Re-attach the "Orei!" button if it wasn't completed
                  if (!isCompleted) {
                       addPrayButtonFunctionality(newDailyDiv, targetId, isManual);
                  }
              } else {
                   console.warn("Could not find updated target data locally for daily view refresh.");
                   loadDailyTargets(); // Fallback to full reload if local data is inconsistent
              }
         }
         alert('Prazo atualizado com sucesso!');
     } catch (error) {
         console.error(`Error updating deadline for ${targetId}:`, error);
         alert("Erro ao atualizar prazo.");
     }
}

window.cancelEditDeadline = function(targetId) {
     const form = document.getElementById(`editDeadlineDate-${targetId}`)?.closest('.edit-deadline-form');
     form?.remove();
};

// --- Alvos Diários ---
async function loadDailyTargets() {
    dailyDisplayedTargetIds.clear(); // *** Limpa o set ao (re)carregar ***
    const userId = auth.currentUser ? auth.currentUser.uid : null;
    const dailyTargetsDiv = document.getElementById("dailyTargets"); // Get container element
    if (!dailyTargetsDiv) { console.error("Daily targets container not found."); return; } // Check if container exists

    if (!userId) {
        dailyTargetsDiv.innerHTML = "<p>Faça login para ver os alvos diários.</p>";
        showPanel(''); // Hide panels if user logs out while viewing daily
        return;
    }

    // Ensure the daily section is visible if we are loading targets for a logged-in user
    showPanel('dailySection');

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
            if (dailyTargetsData && dailyTargetsData.targets) {
                 // Check if prayerTargets are loaded before trying to setDoc (avoid race condition)
                 if(prayerTargets.length > 0 || (await fetchPrayerTargets(userId), prayerTargets.length > 0)){
                      await setDoc(dailyRef, dailyTargetsData);
                      console.log(`[loadDailyTargets] Daily document ${dailyDocId} created successfully.`);
                 } else {
                      console.error("[loadDailyTargets] Active targets not available for generating daily list.");
                      dailyTargetsDiv.innerHTML = "<p>Erro: Falha ao carregar alvos ativos para gerar a lista diária.</p>";
                      return;
                 }
            } else {
                 console.warn("[loadDailyTargets] Failed to generate daily targets, possibly no active targets.");
                 // Don't show error, just empty state handled later
             }
        } else {
            dailyTargetsData = dailySnapshot.data();
            console.log(`[loadDailyTargets] Daily document ${dailyDocId} loaded from Firestore.`);
            if (!Array.isArray(dailyTargetsData.targets)) {
                 console.warn(`[loadDailyTargets] Daily document ${dailyDocId} exists but 'targets' array is missing or invalid. Regenerating.`);
                 dailyTargetsData = await generateDailyTargets(userId, todayStr);
                 // Ensure targets are available before saving regenerated list
                  if(prayerTargets.length > 0 || (await fetchPrayerTargets(userId), prayerTargets.length > 0)){
                     await setDoc(dailyRef, dailyTargetsData);
                 } else {
                      console.error("[loadDailyTargets] Active targets not available for regenerating daily list.");
                      dailyTargetsDiv.innerHTML = "<p>Erro: Falha ao carregar alvos ativos para regenerar a lista diária.</p>";
                       return;
                  }
             }
        }

        // Ensure prayerTargets are loaded before proceeding
        if (prayerTargets.length === 0) {
            console.log("[loadDailyTargets] Active targets not yet loaded, fetching...");
            await fetchPrayerTargets(userId);
            if (prayerTargets.length === 0) {
                console.log("[loadDailyTargets] No active prayer targets found after fetch.");
                 dailyTargetsDiv.innerHTML = "<p>Você ainda não cadastrou nenhum alvo de oração ativo.</p>";
                 displayRandomVerse();
                 return; // Exit if still no active targets
            }
        }

        if (!dailyTargetsData || !Array.isArray(dailyTargetsData.targets)) {
            console.log("[loadDailyTargets] No valid daily targets data found or generated.");
             dailyTargetsDiv.innerHTML = "<p>Nenhum alvo de oração selecionado para hoje. Adicione alvos ou aguarde o ciclo.</p>";
             displayRandomVerse();
             return; // Exit if no daily targets data
        }

        // Populate the display set with IDs from the Firestore document
        dailyTargetsData.targets.forEach(t => dailyDisplayedTargetIds.add(t.targetId));

        const pendingTargetIds = dailyTargetsData.targets.filter(t => !t.completed).map(t => t.targetId);
        const completedTargetIds = dailyTargetsData.targets.filter(t => t.completed).map(t => t.targetId);

        console.log(`[loadDailyTargets] Pending random: ${pendingTargetIds.length}, Completed random: ${completedTargetIds.length}`);

        const allRandomTargetIds = [...pendingTargetIds, ...completedTargetIds];
        if (allRandomTargetIds.length === 0) {
            dailyTargetsDiv.innerHTML = "<p>Nenhum alvo de oração selecionado aleatoriamente para hoje.</p>";
             // We might still have manually added ones from previous interaction, don't return yet
        }

        // Fetch details ONLY from the locally stored ACTIVE prayerTargets
        const activePrayerTargets = prayerTargets; // Use the already loaded active targets
        const targetsToDisplayDetails = activePrayerTargets.filter(pt => pt && pt.id && allRandomTargetIds.includes(pt.id));

        // Handle inconsistencies (target in daily doc but not in local active list -> likely archived/deleted)
        const foundIds = targetsToDisplayDetails.map(t => t.id);
        const missingIds = allRandomTargetIds.filter(id => !foundIds.includes(id));
        if (missingIds.length > 0) {
             console.warn(`[loadDailyTargets] Targets ${missingIds.join(', ')} found in daily doc but not in local active list. They might be archived/deleted.`);
             // Optionally: Clean up the daily doc here by removing these missing IDs
         }

        const pendingTargetsDetails = targetsToDisplayDetails.filter(t => pendingTargetIds.includes(t.id));
        const completedTargetsDetails = targetsToDisplayDetails.filter(t => completedTargetIds.includes(t.id));

        renderDailyTargets(pendingTargetsDetails, completedTargetsDetails); // Render only the random targets first
        displayRandomVerse();

    } catch (error) {
        console.error("[loadDailyTargets] General error loading daily targets:", error);
        dailyTargetsDiv.innerHTML = "<p>Erro ao carregar alvos diários.</p>";
    }
}


async function generateDailyTargets(userId, dateStr) {
    try {
        // Ensure active targets are loaded (use global prayerTargets)
        if (prayerTargets.length === 0) {
            console.log("[generateDailyTargets] Active targets not loaded, fetching...");
            await fetchPrayerTargets(userId); // Fetch if not already loaded
        }

        const availableTargets = prayerTargets.filter(t => t && t.id && !t.archived && !t.resolved);

        if (availableTargets.length === 0) {
            console.log("[generateDailyTargets] No active targets found to generate list.");
            return { userId, date: dateStr, targets: [] }; // Return empty structure
        }

        // Fetch yesterday's completed targets (Firestore Timestamps)
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
                    completedYesterdayIds = yesterdayData.targets
                        .filter(t => t.completed && t.targetId) // Ensure completed and has ID
                        .map(t => t.targetId);
                }
            }
        } catch (error) {
            console.warn("[generateDailyTargets] Error fetching previous day's targets:", error);
            // Continue even if yesterday's data fails to load
        }

        // Filter pool: exclude those completed yesterday
        let pool = availableTargets.filter(target => !completedYesterdayIds.includes(target.id));

        // Cycle Restart Logic
        if (pool.length === 0 && availableTargets.length > 0) {
             console.log("[generateDailyTargets] Pool empty (all completed yesterday or no pending). Restarting cycle.");
             pool = [...availableTargets]; // Reset pool to all available active targets
        } else if (pool.length === 0) {
             console.log("[generateDailyTargets] No targets available in the pool today (after exclusion or empty list).");
             return { userId, date: dateStr, targets: [] };
        }

        // Select random targets (up to 10)
        const shuffledPool = pool.sort(() => 0.5 - Math.random());
        const maxTargets = 10;
        const selectedTargets = shuffledPool.slice(0, Math.min(maxTargets, pool.length));
        const targetsForFirestore = selectedTargets.map(target => ({ targetId: target.id, completed: false }));

        // Update lastPresentedDate (async, don't wait)
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

    // Create refs first
    const refs = selectedTargets
        .map(target => (target && target.id ? doc(db, "users", userId, "prayerTargets", target.id) : null))
        .filter(ref => ref !== null); // Filter out null refs if any target was invalid

     if (refs.length === 0) return; // No valid refs to update

     // Update in batch
    refs.forEach(targetRef => {
         batch.update(targetRef, { lastPresentedDate: nowTimestamp });
     });

    try {
        await batch.commit();
        console.log(`[updateLastPresentedDates] Updated lastPresentedDate for ${refs.length} targets.`);
    } catch (error) {
        console.error("[updateLastPresentedDates] Error updating lastPresentedDate (non-critical):", error);
         // Attempt to update individually if batch fails? Or just log.
         // Individual updates might be better if some targets get archived between generation and this update.
         // Let's stick to batch for now for performance, but be aware of this potential issue.
    }
}

function renderDailyTargets(pendingTargets, completedTargets) {
    const dailyTargetsDiv = document.getElementById("dailyTargets");
    if (!dailyTargetsDiv) return;
    dailyTargetsDiv.innerHTML = ''; // Clear previous content

    let hasRenderedContent = false;

    // Render Pending Targets (from random selection)
    if (pendingTargets.length > 0) {
        hasRenderedContent = true;
        pendingTargets.forEach((target) => {
            if (!target || !target.id) { console.warn("Skipping invalid pending target:", target); return; }
            const dailyDiv = createTargetElement(target, false); // isCompleted = false
            addPrayButtonFunctionality(dailyDiv, target.id, false); // isManual = false
            dailyTargetsDiv.appendChild(dailyDiv);
        });
    }

    // Separator and Title for Completed Targets (only if there are completed ones)
    if (completedTargets.length > 0) {
        hasRenderedContent = true;
        if (pendingTargets.length > 0) { // Add separator only if pending existed
            const separator = document.createElement('hr');
            separator.className = 'daily-separator';
            dailyTargetsDiv.appendChild(separator);
        }
        const completedTitle = document.createElement('h3');
        completedTitle.textContent = "Concluídos Hoje (Seleção Automática)";
        completedTitle.className = 'completed-title';
        dailyTargetsDiv.appendChild(completedTitle);

        // Render Completed Targets (from random selection)
        completedTargets.forEach((target) => {
            if (!target || !target.id) { console.warn("Skipping invalid completed target:", target); return; }
            const dailyDiv = createTargetElement(target, true); // isCompleted = true
            dailyTargetsDiv.appendChild(dailyDiv);
        });
    }

    // Display message if absolutely no random targets were rendered
    if (!hasRenderedContent) {
         dailyTargetsDiv.innerHTML = "<p>Nenhum alvo selecionado aleatoriamente para hoje.</p>";
    }

    // Completion popup logic remains, checks for pending targets *currently* in the DOM
     const remainingPending = dailyTargetsDiv.querySelectorAll('.target:not(.completed-target)');
     if (remainingPending.length === 0 && dailyDisplayedTargetIds.size > 0) { // Check if any targets were displayed at all
         // Check if the popup isn't already shown (avoid multiple popups on quick clicks)
          const popup = document.getElementById('completionPopup');
          if (popup && popup.style.display !== 'flex') {
               displayCompletionPopup();
          }
     }
}

function createTargetElement(target, isCompleted) {
    const dailyDiv = document.createElement("div");
    dailyDiv.classList.add("target"); // Base class
    if (isCompleted) dailyDiv.classList.add("completed-target");
    dailyDiv.dataset.targetId = target.id; // Store ID

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
        <div class="target-actions daily-actions">
           <!-- "Orei!" button will be added here by addPrayButtonFunctionality -->
           <!-- Other daily actions could go here -->
        </div>
    `;
    // REMOVED: Button addition is now external in addPrayButtonFunctionality
    return dailyDiv;
}


// *** MODIFICADA: Aceita isManual ***
function addPrayButtonFunctionality(dailyDiv, targetId, isManual = false) {
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

        // Disable button immediately
        prayButton.disabled = true;
        prayButton.textContent = "Orado!";
        prayButton.style.backgroundColor = "#ccc"; // Visually indicate disabled state

        try {
            // --- Conditional Firestore Update ---
            if (!isManual) {
                console.log(`[Orei!] Alvo aleatório ${targetId} clicado. Tentando atualizar Firestore dailyPrayerTargets.`);
                // Try to update the Firestore document ONLY if it's NOT a manual target
                try {
                    const dailySnap = await getDoc(dailyRef);
                    if (dailySnap.exists()) {
                        const dailyData = dailySnap.data();
                        let targetUpdatedInDoc = false;
                        if (Array.isArray(dailyData.targets)) {
                            const updatedTargets = dailyData.targets.map(t => {
                                if (t.targetId === targetId) {
                                    targetUpdatedInDoc = true;
                                    return { ...t, completed: true }; // Mark as completed
                                }
                                return t;
                            });

                            if (targetUpdatedInDoc) {
                                await updateDoc(dailyRef, { targets: updatedTargets });
                                console.log(`[Orei!] Firestore dailyPrayerTargets atualizado para ${targetId}.`);
                            } else {
                                console.warn(`[Orei!] Alvo aleatório ${targetId} não encontrado no doc diário ${dailyDocId}. Não foi atualizado no Firestore.`);
                            }
                        } else {
                            console.error("[Orei!] Formato inválido dos alvos no doc diário:", dailyDocId);
                        }
                    } else {
                        console.warn(`[Orei!] Doc diário não encontrado ${dailyDocId}. Não foi possível marcar ${targetId} como concluído no Firestore.`);
                        // This might happen if the doc wasn't created yet or was deleted.
                    }
                } catch (firestoreError) {
                     console.error(`[Orei!] Erro ao atualizar Firestore dailyPrayerTargets para ${targetId}:`, firestoreError);
                     // Non-fatal, proceed with click count and UI update
                 }
            } else {
                console.log(`[Orei!] Alvo manual ${targetId} clicado. Pulando atualização do Firestore dailyPrayerTargets.`);
            }
            // --- End Conditional Firestore Update ---

            // Update click counts ALWAYS (for both manual and random)
            await updateClickCounts(userId, targetId);

            // Update UI ALWAYS
            dailyDiv.classList.add("completed-target");
             // Remove a classe manual se existir, para consistência visual após clique
             if(isManual) dailyDiv.classList.remove("manually-added");
            prayButton.remove(); // Remove the button

            // Check if this was the last PENDING target in the view
            const dailyTargetsContainer = document.getElementById('dailyTargets');
            const remainingPending = dailyTargetsContainer?.querySelectorAll('.target:not(.completed-target)');

            // Show completion popup if no more pending targets are visible
            if (remainingPending && remainingPending.length === 0) {
                // Don't visually move manual items to the completed section
                 // If it was NOT manual, move it visually (optional, but helps separate)
                 if (!isManual) {
                      const completedTitle = dailyTargetsContainer.querySelector('.completed-title');
                      const separator = dailyTargetsContainer.querySelector('.daily-separator');
                      if (completedTitle) {
                          dailyTargetsContainer.insertBefore(dailyDiv, completedTitle.nextSibling); // Insert after title
                      } else {
                          // If no completed section existed, create it
                          if (!separator && dailyTargetsContainer.children.length > 0) { // Add separator only if other items exist
                              const newSeparator = document.createElement('hr');
                              newSeparator.className = 'daily-separator';
                              dailyTargetsContainer.appendChild(newSeparator);
                          }
                           const newCompletedTitle = document.createElement('h3');
                           newCompletedTitle.textContent = "Concluídos Hoje (Seleção Automática)";
                           newCompletedTitle.className = 'completed-title';
                           dailyTargetsContainer.appendChild(newCompletedTitle);
                           dailyTargetsContainer.appendChild(dailyDiv); // Append target after new title
                      }
                 }

                // Check if popup is already visible to avoid duplicates
                const popup = document.getElementById('completionPopup');
                 if (popup && popup.style.display !== 'flex') {
                    displayCompletionPopup();
                 }
            }

        } catch (error) {
            console.error("Erro geral ao registrar 'Orei!':", error);
            alert("Erro ao registrar oração.");
            // Re-enable the button on error
            prayButton.disabled = false;
            prayButton.textContent = "Orei!";
            prayButton.style.backgroundColor = ""; // Reset style
        }
    };

     // Find the actions container within the target div to add the button
     const actionsContainer = dailyDiv.querySelector('.target-actions.daily-actions');
     if (actionsContainer) {
         actionsContainer.prepend(prayButton); // Add button to the actions container
     } else {
          // Fallback: add button before the first child if no specific container
          dailyDiv.insertBefore(prayButton, dailyDiv.firstChild);
          console.warn("Could not find .target-actions.daily-actions container, adding button at the top.", dailyDiv);
     }
}

// --- SUBSTITUA ESTA FUNÇÃO NO SEU script.js MAIS RECENTE --- // (ESTA É A VERSÃO CORRETA QUE JÁ ESTAVA NO SEU CÓDIGO)
async function updateClickCounts(userId, targetId) {
    const clickCountsRef = doc(db, "prayerClickCounts", targetId);
    const now = new Date();
    // Gera a chave ANO-MES (ex: "2023-10") para o mapa mensal
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    // Gera a chave ANO (ex: "2023") para o mapa anual
    const year = now.getFullYear().toString();

    try {
        // 1. Verifica se o documento de contagem para este alvo já existe
        const docSnap = await getDoc(clickCountsRef);

        if (docSnap.exists()) {
            // 2. Se existe, usa updateDoc com notação de ponto para incrementar
            //    os campos corretamente dentro dos mapas existentes.
            console.log(`[updateClickCounts] Document exists for ${targetId}. Updating with dot notation.`);
            await updateDoc(clickCountsRef, {
                totalClicks: increment(1),
                [`monthlyClicks.${yearMonth}`]: increment(1), // Notação de ponto para incrementar chave no mapa
                [`yearlyClicks.${year}`]: increment(1),       // Notação de ponto para incrementar chave no mapa
                lastClickTimestamp: Timestamp.fromDate(now), // Atualiza sempre
                userId: userId // Garante que o userId está atualizado
            });
            console.log(`[updateClickCounts] Updated counts for ${targetId}.`);

        } else {
            // 3. Se não existe, usa setDoc para criar o documento
            //    inicializando os mapas com o valor 1 para o mês/ano atual.
            console.log(`[updateClickCounts] Document NOT found for ${targetId}. Creating with initial maps.`);
            await setDoc(clickCountsRef, {
                targetId: targetId,
                userId: userId,
                totalClicks: 1, // Valor inicial
                monthlyClicks: { [yearMonth]: 1 }, // Cria o mapa com a chave e valor inicial
                yearlyClicks: { [year]: 1 },       // Cria o mapa com a chave e valor inicial
                lastClickTimestamp: Timestamp.fromDate(now)
            });
            // Note: Não precisamos de { merge: true } aqui porque estamos criando um novo documento.
            console.log(`[updateClickCounts] Created new counts document for ${targetId}.`);
        }
    } catch (error) {
        console.error(`[updateClickCounts] Error updating click count for ${targetId}:`, error);
        // Não fatal, apenas loga o erro.
    }
}

function searchActiveTargetsForManualAdd(searchTerm) {
    const resultsContainer = document.getElementById('manualTargetResults');
    if (!resultsContainer) return;
    resultsContainer.innerHTML = ''; // Limpa resultados anteriores
    const lowerSearchTerm = searchTerm.toLowerCase().trim();

    if (lowerSearchTerm.length < 2) { // Só busca com 2+ caracteres
        resultsContainer.innerHTML = '<p style="text-align: center; color: #aaa; font-size: 0.85em;">Digite ao menos 2 letras...</p>';
        return;
    }

    // Filtra apenas os alvos ATIVOS (da lista local prayerTargets)
    const activeTargets = prayerTargets.filter(t => t && t.id && !t.archived && !t.resolved);

    const filtered = activeTargets.filter(target =>
        (target.title && target.title.toLowerCase().includes(lowerSearchTerm)) ||
        (target.details && target.details.toLowerCase().includes(lowerSearchTerm))
        // Poderia adicionar busca em observações se desejado
    );

    if (filtered.length === 0) {
        resultsContainer.innerHTML = '<p style="text-align: center; color: #888; font-size: 0.9em;">Nenhum alvo ativo encontrado.</p>';
    } else {
        // Limita a exibição (ex: 10 resultados)
        filtered.slice(0, 10).forEach(target => {
            const isAlreadyDisplayed = dailyDisplayedTargetIds.has(target.id); // Verifica se já está na tela
            const item = document.createElement('div');
            item.classList.add('result-item');
            item.innerHTML = `
                <span>${target.title || 'Sem Título'}</span>
                <button class="btn add-manual-btn" data-target-id="${target.id}" ${isAlreadyDisplayed ? 'disabled title="Este alvo já está na lista de hoje"' : 'title="Adicionar à lista de hoje"'}>
                    ${isAlreadyDisplayed ? 'Na Lista' : '+ Adicionar'}
                </button>
            `;
            // Adiciona listener apenas se o botão não estiver desabilitado
            if (!isAlreadyDisplayed) {
                item.querySelector('button').addEventListener('click', () => addManualTargetToDailyView(target.id));
            }
            resultsContainer.appendChild(item);
        });
    }
}

// *** NOVA FUNÇÃO: Adiciona alvo manual à visualização diária ***
function addManualTargetToDailyView(targetId) {
    const dailyTargetsDiv = document.getElementById("dailyTargets");
    if (!dailyTargetsDiv) return;

    // Re-verifica se já está na tela (segurança extra)
    if (dailyDisplayedTargetIds.has(targetId)) {
        alert("Este alvo já foi adicionado à lista de hoje.");
        // Opcional: remover o resultado da busca ou apenas manter botão desabilitado
        const button = document.querySelector(`#manualTargetResults button[data-target-id="${targetId}"]`);
        if(button) { button.disabled = true; button.textContent = 'Na Lista'; }
        return;
    }

    // Encontra os dados do alvo na lista local de alvos ativos
    const targetData = prayerTargets.find(t => t.id === targetId);

    if (!targetData) {
        console.error("Dados do alvo manual não encontrados localmente:", targetId);
        alert("Erro: Não foi possível encontrar os dados completos deste alvo.");
        return;
    }

    // Cria o elemento HTML para o alvo (como pendente)
    const dailyDiv = createTargetElement(targetData, false);
    dailyDiv.classList.add("manually-added"); // Adiciona classe CSS opcional
    dailyDiv.dataset.isManual = "true"; // Marca como manual para lógica do "Orei!"

    // Adiciona o botão "Orei!" específico, passando isManual = true
    addPrayButtonFunctionality(dailyDiv, targetId, true);

    // Adiciona o elemento à lista visível (ex: no início dos pendentes)
    const firstCompleted = dailyTargetsDiv.querySelector('.completed-target');
    if(firstCompleted){
         dailyTargetsDiv.insertBefore(dailyDiv, firstCompleted); // Insere antes dos concluídos
    } else {
         dailyTargetsDiv.appendChild(dailyDiv); // Adiciona ao final se não houver concluídos
    }


    // Adiciona ao controle de exibição para evitar duplicatas
    dailyDisplayedTargetIds.add(targetId);

    // Limpa a busca e atualiza os resultados (desabilitando o botão do alvo adicionado)
    document.getElementById('searchManualTargetInput').value = '';
    // Re-executa a busca com string vazia para limpar/atualizar a lista de resultados
    searchActiveTargetsForManualAdd('');
}


// --- Perseverança --- << INÍCIO DAS FUNÇÕES MODIFICADAS >>
async function loadPerseveranceData(userId) {
     console.log(`[loadPerseveranceData] Loading for user ${userId}`);
    const perseveranceDocRef = doc(db, "perseveranceData", userId);
    try {
        const docSnap = await getDoc(perseveranceDocRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            // Rehydrate data carefully
            perseveranceData.consecutiveDays = Number(data.consecutiveDays) || 0;
            perseveranceData.recordDays = Number(data.recordDays) || 0;
            perseveranceData.lastInteractionDate = data.lastInteractionDate instanceof Timestamp
                ? data.lastInteractionDate.toDate() // Convert Timestamp to Date
                : null;
            console.log('[loadPerseveranceData] Loaded data:', JSON.stringify(perseveranceData)); // Log loaded data

        } else {
             console.log("[loadPerseveranceData] No perseverance data found, initializing.");
            perseveranceData = { consecutiveDays: 0, lastInteractionDate: null, recordDays: 0 };
             // Optionally save initial data to Firestore here if desired
             // await updatePerseveranceFirestore(userId, perseveranceData);
        }
        updatePerseveranceUI();
    } catch (error) {
        console.error("[loadPerseveranceData] Error loading perseverance data:", error);
         // Reset local data on error
         perseveranceData = { consecutiveDays: 0, lastInteractionDate: null, recordDays: 0 };
         updatePerseveranceUI(); // Update UI with reset data
    }
}

async function confirmPerseverance() {
    const user = auth.currentUser;
     if (!user) { alert("Erro: Usuário não autenticado."); return; }
     const userId = user.uid;

    const today = new Date(); // Use local time for "today"
    // Get the date part (year, month, day) of today in local time
    const todayDatePart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    let lastInteractionDatePart = null;
     if (perseveranceData.lastInteractionDate instanceof Date && !isNaN(perseveranceData.lastInteractionDate)) {
         const li = perseveranceData.lastInteractionDate;
         // Get the date part of the last interaction in local time
         lastInteractionDatePart = new Date(li.getFullYear(), li.getMonth(), li.getDate());
     }
     console.log(`[confirmPerseverance] Today Date Part: ${todayDatePart.toISOString().split('T')[0]}, Last Interaction Date Part: ${lastInteractionDatePart ? lastInteractionDatePart.toISOString().split('T')[0] : 'null'}`);


     // Check if interaction already happened today (comparing only date parts)
    if (lastInteractionDatePart && todayDatePart.getTime() === lastInteractionDatePart.getTime()) {
         console.log('[confirmPerseverance] Already confirmed today.');
         alert(`Perseverança já confirmada para hoje (${formatDateForDisplay(today)})! Dias consecutivos: ${perseveranceData.consecutiveDays}. Recorde: ${perseveranceData.recordDays} dias.`);
         return; // Already confirmed today
     }

     // Calculate if it's consecutive
     let isConsecutive = false;
     if (lastInteractionDatePart) {
         const expectedYesterdayDatePart = new Date(todayDatePart.getTime() - 24 * 60 * 60 * 1000);
         if (lastInteractionDatePart.getTime() === expectedYesterdayDatePart.getTime()) {
             isConsecutive = true;
         }
     }
     console.log(`[confirmPerseverance] Is Consecutive: ${isConsecutive}`);

     // Store previous day count for logging
     const previousConsecutiveDays = perseveranceData.consecutiveDays || 0;

     // Update perseverance data
     perseveranceData.consecutiveDays = isConsecutive ? previousConsecutiveDays + 1 : 1;
     perseveranceData.lastInteractionDate = today; // Store the full timestamp of today's confirmation
     perseveranceData.recordDays = perseveranceData.recordDays || 0;
     if (perseveranceData.consecutiveDays > perseveranceData.recordDays) {
         perseveranceData.recordDays = perseveranceData.consecutiveDays;
     }
      console.log('[confirmPerseverance] Updated perseveranceData:', JSON.stringify(perseveranceData));

     // Save to Firestore and update UI
     try {
        await updatePerseveranceFirestore(userId, perseveranceData);
        console.log('[confirmPerseverance] Firestore updated. Now updating UI.');
        updatePerseveranceUI(); // Update progress bar and weekly chart
         alert(`Perseverança confirmada! Dias consecutivos: ${perseveranceData.consecutiveDays}. Recorde: ${perseveranceData.recordDays} dias.`);
     } catch (error) {
          console.error("[confirmPerseverance] Error updating Firestore:", error);
          alert("Erro ao salvar dados de perseverança.");
          // Consider how to handle save failure - maybe revert local state? For now, local state remains updated.
     }
}


async function updatePerseveranceFirestore(userId, data) {
    const perseveranceDocRef = doc(db, "perseveranceData", userId);
    // Prepare data for Firestore, converting Date back to Timestamp
     const dataToSave = {
         consecutiveDays: data.consecutiveDays || 0,
         lastInteractionDate: data.lastInteractionDate instanceof Date ? Timestamp.fromDate(data.lastInteractionDate) : null,
         recordDays: data.recordDays || 0
     };
    await setDoc(perseveranceDocRef, dataToSave, { merge: true }); // merge:true prevents overwriting other potential fields
     console.log("[updatePerseveranceFirestore] Perseverance data saved for", userId);
}


function updatePerseveranceUI() {
     console.log('[updatePerseveranceUI] Updating progress bar and weekly chart.'); // Log entry
     const consecutiveDays = perseveranceData.consecutiveDays || 0;
    const targetDays = 30;
    const percentage = Math.min(Math.max(0, (consecutiveDays / targetDays) * 100), 100);
    const progressBar = document.getElementById('perseveranceProgressBar');
    const percentageDisplay = document.getElementById('perseverancePercentage');

    if (progressBar && percentageDisplay) {
        progressBar.style.width = `${percentage}%`;
        percentageDisplay.textContent = `${consecutiveDays} dia${consecutiveDays !== 1 ? 's' : ''}`; // Show exact days
    } else {
        console.warn("Perseverance UI elements (bar/percentage) not found.");
    }
    updateWeeklyChart(); // Update the visual week chart based on new data
}

function resetPerseveranceUI() {
    const progressBar = document.getElementById('perseveranceProgressBar');
    const percentageDisplay = document.getElementById('perseverancePercentage');
    if (progressBar && percentageDisplay) {
        progressBar.style.width = `0%`;
        percentageDisplay.textContent = `0 dias`;
    }
    resetWeeklyChart();
}

// --- Função updateWeeklyChart REFINADA com LOGS ---
function updateWeeklyChart() {
    console.log('[updateWeeklyChart] Starting update. Current perseveranceData:', JSON.stringify(perseveranceData));
    const today = new Date(); // Current local date
    let lastInteractionDatePartMs = null;

    // Get the date part (at midnight local time) of the last interaction
    if (perseveranceData.lastInteractionDate instanceof Date && !isNaN(perseveranceData.lastInteractionDate)) {
        const li = perseveranceData.lastInteractionDate;
        lastInteractionDatePartMs = new Date(li.getFullYear(), li.getMonth(), li.getDate()).getTime();
        console.log(`[updateWeeklyChart] Last Interaction Date Part MS: ${lastInteractionDatePartMs} (${new Date(lastInteractionDatePartMs).toISOString()})`);
    } else {
        console.log('[updateWeeklyChart] No valid last interaction date found.');
    }

    const currentDayOfWeek = today.getDay(); // 0=Sun, 6=Sat
    const todayDatePartMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime(); // Midnight today
    const consecutiveDays = perseveranceData.consecutiveDays || 0;

    console.log(`[updateWeeklyChart] Today: ${today.toISOString()}, Today Date Part MS: ${todayDatePartMs}, DayOfWeek: ${currentDayOfWeek}, Consecutive: ${consecutiveDays}`);

    for (let i = 0; i < 7; i++) { // Loop through day ticks (day-0 to day-6)
         const dayTick = document.getElementById(`day-${i}`);
         if (dayTick) {
             // Calculate the date for this slot in the chart (local time)
             const dayDifference = i - currentDayOfWeek;
             const chartDay = new Date(today);
             chartDay.setDate(today.getDate() + dayDifference);
             const chartDayDatePartMs = new Date(chartDay.getFullYear(), chartDay.getMonth(), chartDay.getDate()).getTime();

             let shouldBeActive = false;

             // Check if the last interaction is valid and there's a streak
             if (lastInteractionDatePartMs !== null && consecutiveDays > 0) {
                 // Calculate how many days ago the chart slot's date was (relative to today's midnight)
                 const daysAgoChartSlot = Math.round((todayDatePartMs - chartDayDatePartMs) / (1000 * 60 * 60 * 24));

                 // Calculate how many days ago the last interaction date was (relative to today's midnight)
                 const daysAgoLastInteraction = Math.round((todayDatePartMs - lastInteractionDatePartMs) / (1000 * 60 * 60 * 24));

                 // The chart slot should be active if its date falls within the consecutive streak ending on the last interaction day.
                 // The streak includes days from 'daysAgoLastInteraction' up to 'daysAgoLastInteraction + consecutiveDays - 1'.
                 // So, daysAgoChartSlot must be >= daysAgoLastInteraction AND < daysAgoLastInteraction + consecutiveDays.
                 if (daysAgoChartSlot >= daysAgoLastInteraction && daysAgoChartSlot < (daysAgoLastInteraction + consecutiveDays)) {
                     shouldBeActive = true;
                 }
                 // Log calculation details for this specific tick
                 console.log(`[updateWeeklyChart] Slot ${i} (${chartDay.toISOString().split('T')[0]}): chartMs=${chartDayDatePartMs}, daysAgoSlot=${daysAgoChartSlot}, daysAgoLastInt=${daysAgoLastInteraction}, consecutive=${consecutiveDays} => ShouldBeActive=${shouldBeActive}`);

             } else {
                 // Log if no streak or invalid date
                  console.log(`[updateWeeklyChart] Slot ${i} (${chartDay.toISOString().split('T')[0]}): No valid streak or last interaction date. ShouldBeActive=false`);
             }


             // Update the class for styling
             if (shouldBeActive) {
                 dayTick.classList.add('active');
             } else {
                 dayTick.classList.remove('active');
             }
         } else {
             console.warn(`[updateWeeklyChart] Day tick element day-${i} not found.`);
         }
    }
    console.log('[updateWeeklyChart] Finished update.');
}


function resetWeeklyChart() {
    console.log('[resetWeeklyChart] Resetting all ticks.'); // Log reset
    for (let i = 0; i < 7; i++) {
        const dayTick = document.getElementById(`day-${i}`);
        if (dayTick) {
            dayTick.classList.remove('active');
        }
    }
}
// --- Perseverança --- << FIM DAS FUNÇÕES MODIFICADAS >>


// --- Visualizações e Filtros ---

function generateViewHTML(targetsToInclude = lastDisplayedTargets) {
    let randomVerse = '';
    if (typeof verses !== 'undefined' && Array.isArray(verses) && verses.length > 0) {
        const randomIndex = Math.floor(Math.random() * verses.length);
        randomVerse = verses[randomIndex];
    } else {
        console.warn("Array 'verses' não encontrada ou vazia.");
    }

    let viewHTML = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Alvos de Oração - Visualização Filtrada</title>
            <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap">
            <style>
                body { font-family: 'Playfair Display', serif; margin: 20px; background-color: #f9f9f9; color: #333; }
                h1, h2 { text-align: center; color: #333; }
                .target { border: 1px solid #ddd; border-radius: 5px; background-color: #fff; padding: 15px; margin-bottom: 15px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: left; }
                .target h3 { margin-top: 0; font-size: 1.3em; color: #444; }
                .target p { margin: 5px 0; line-height: 1.5; }
                .deadline-tag { background-color: #ffcc00; color: #333; padding: 3px 8px; border-radius: 4px; font-size: 0.8em; margin-right: 8px; display: inline-block; }
                .deadline-tag.expired { background-color: #ff6666; color: #fff; }
                .observations { margin-top: 10px; padding-top: 10px; border-top: 1px dotted #eee; }
                .observations h4 { margin-top: 0; margin-bottom: 5px; font-size: 1em; color: #666; }
                .observation-item { font-size: 0.9em; color: #555; margin-bottom: 5px; padding-left: 10px; }
                .observation-item strong { color: #333; }
                hr { border: 0; border-top: 1px solid #ccc; margin: 20px 0; }
                .verse-container { text-align: center; font-style: italic; color: #555; margin-top: 15px; margin-bottom: 25px; padding: 10px; border-top: 1px dashed #ccc; border-bottom: 1px dashed #ccc; }
                 /* Print styles */
                 @media print {
                    body { background-color: #fff; margin: 10px; font-size: 10pt; } /* Adjust print font size */
                    .target { box-shadow: none; border: 1px solid #ccc; page-break-inside: avoid; }
                    .verse-container { border: none; }
                    h1, h2 { font-size: 14pt; }
                    h3 { font-size: 12pt; }
                    button, input, hr, .page-link, .pagination, .main-menu { display: none !important; } /* Hide non-content elements */
                    .no-print { display: none !important; } /* Add class="no-print" to elements to hide */
                }
            </style>
        </head>
        <body>
            <h1>Meus Alvos de Oração - Visualização</h1>
            <h2>Gerado em: ${formatDateForDisplay(new Date())}</h2>
            ${randomVerse ? `<div class="verse-container">${randomVerse}</div>` : ''}
            <hr>
    `;

    if (!Array.isArray(targetsToInclude) || targetsToInclude.length === 0) {
        viewHTML += "<p>Nenhum alvo para exibir (Verifique os filtros aplicados no painel anterior).</p>";
    } else {
        // Sort targets by date descending for the view
        targetsToInclude.sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
        targetsToInclude.forEach(target => {
             if (!target || !target.id) return;
             viewHTML += generateTargetViewHTML(target); // Use helper
        });
    }

    viewHTML += `
        </body>
        </html>
    `;

    // Download Logic
    try {
        const filenameDate = formatDateForFilename(new Date());
        const filename = `Alvos_Oracao_${filenameDate}.html`;

        const blob = new Blob([viewHTML], { type: 'text/html;charset=utf-8' });
        const link = document.createElement("a");

        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.style.display = 'none';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);

        console.log(`[generateViewHTML] Download do arquivo '${filename}' iniciado.`);

    } catch (error) {
        console.error("[generateViewHTML] Erro ao gerar ou baixar o arquivo:", error);
        alert("Ocorreu um erro ao tentar gerar o arquivo para download.");
        // Fallback: Open in new tab if download fails?
        // const viewTab = window.open('', '_blank');
        // if (viewTab) { viewTab.document.write(viewHTML); viewTab.document.close(); }
        // else { alert('Popup bloqueado! Habilite popups para este site.'); }
    }
}

function generateTargetViewHTML(target) { // Helper for static views
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
     const observationsHTML = renderObservationsForView(observations);

     return `
         <div class="target">
             <h3>${deadlineTag} ${target.title || 'Sem Título'}</h3>
             <p>${target.details || 'Sem Detalhes'}</p>
             <p><strong>Data Criação:</strong> ${formattedDate}</p>
             <p><strong>Tempo Decorrido:</strong> ${elapsed}</p>
             ${observationsHTML}
         </div>
     `;
}

function renderObservationsForView(observations) { // Specific helper for static views
    if (!Array.isArray(observations) || observations.length === 0) return '';
    observations.sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0)); // Sort by date desc

    let observationsHTML = `<div class="observations"><h4>Observações:</h4>`;
    observations.forEach(observation => {
         if (!observation || !observation.date) return; // Skip invalid
        const formattedDate = formatDateForDisplay(observation.date);
        observationsHTML += `<p class="observation-item"><strong>${formattedDate}:</strong> ${observation.text || ''}</p>`;
    });
    observationsHTML += `</div>`;
    return observationsHTML;
}


function generateDailyViewHTML() {
    const dailyTargetsDiv = document.getElementById('dailyTargets');
    if (!dailyTargetsDiv) {
         alert("Erro: Seção de alvos diários não encontrada.");
         return;
     }

     let viewHTML = `
         <!DOCTYPE html>
         <html lang="pt-BR">
         <head>
             <meta charset="UTF-8">
             <meta name="viewport" content="width=device-width, initial-scale=1.0">
             <title>Alvos de Oração - Visualização Diária</title>
             <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap">
             <style>
                 /* Reusing styles from generateViewHTML */
                 body { font-family: 'Playfair Display', serif; margin: 20px; background-color: #f9f9f9; color: #333; }
                 h1, h2, h3 { text-align: center; color: #333; }
                 .target { border: 1px solid #ddd; border-radius: 5px; background-color: #fff; padding: 15px; margin-bottom: 15px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: left; }
                 .target.completed-target { background-color: #f0f0f0; border-left: 3px solid #9cbe4a; opacity: 0.7; } /* Style completed */
                 .target.manually-added:not(.completed-target) { background-color: #e3f2fd; border-left: 3px solid #90caf9; } /* Style manually added */
                 .target h3 { margin-top: 0; font-size: 1.3em; color: #444; }
                 .target p { margin: 5px 0; line-height: 1.5; }
                 .deadline-tag { background-color: #ffcc00; color: #333; padding: 3px 8px; border-radius: 4px; font-size: 0.8em; margin-right: 8px; display: inline-block; }
                 .deadline-tag.expired { background-color: #ff6666; color: #fff; }
                 .observations { margin-top: 10px; padding-top: 10px; border-top: 1px dotted #eee; }
                 .observations h4 { margin-top: 0; margin-bottom: 5px; font-size: 1em; color: #666; }
                 .observation-item { font-size: 0.9em; color: #555; margin-bottom: 5px; padding-left: 10px; }
                 .observation-item strong { color: #333; }
                 hr { border: 0; border-top: 1px solid #ccc; margin: 20px 0; }
                 /* Print styles */
                 @media print {
                     body { background-color: #fff; margin: 10px; font-size: 10pt; }
                     .target { box-shadow: none; border: 1px solid #ccc; page-break-inside: avoid; opacity: 1 !important; background-color: #fff !important; border-left: none !important; } /* Reset visual styles for print */
                     h1, h2 { font-size: 14pt; }
                     h3 { font-size: 12pt; }
                     hr { display: none !important; }
                 }
             </style>
         </head>
         <body>
             <h1>Alvos de Oração do Dia</h1>
             <h2>${formatDateForDisplay(new Date())}</h2>
             <hr>
     `;
    let pendingCount = 0;
    let completedCount = 0;

     // Seleciona todos os targets dentro de #dailyTargets
     const allDailyTargetDivs = dailyTargetsDiv.querySelectorAll('.target');

     if (allDailyTargetDivs.length === 0) {
         viewHTML += "<p>Nenhum alvo exibido hoje.</p>";
     } else {
         viewHTML += `<h3>Pendentes</h3>`;
         allDailyTargetDivs.forEach(div => {
             if (!div.classList.contains('completed-target')) {
                 const targetId = div.dataset.targetId;
                 // Find target data (check active first, then archived for safety)
                 const targetData = prayerTargets.find(t => t.id === targetId) || archivedTargets.find(t => t.id === targetId);
                 if (targetData) {
                     pendingCount++;
                     // Adiciona a classe manual se estava presente
                      let targetHTML = generateTargetViewHTML(targetData);
                      if (div.classList.contains('manually-added')) {
                           targetHTML = targetHTML.replace('<div class="target">', '<div class="target manually-added">');
                      }
                      viewHTML += targetHTML;
                 }
             }
         });
         if (pendingCount === 0) viewHTML += "<p>Nenhum alvo pendente.</p>";

         viewHTML += `<hr/><h3>Concluídos Hoje</h3>`;
         allDailyTargetDivs.forEach(div => {
             if (div.classList.contains('completed-target')) {
                 const targetId = div.dataset.targetId;
                 const targetData = prayerTargets.find(t => t.id === targetId) || archivedTargets.find(t => t.id === targetId);
                 if (targetData) {
                      completedCount++;
                      // Adiciona a classe completed
                      let targetHTML = generateTargetViewHTML(targetData);
                      targetHTML = targetHTML.replace('<div class="target">', '<div class="target completed-target">');
                      viewHTML += targetHTML;
                 }
             }
         });
         if (completedCount === 0) viewHTML += "<p>Nenhum alvo concluído hoje.</p>";
     }

    viewHTML += `
        </body>
        </html>
    `;
     const viewTab = window.open('', '_blank');
     if (viewTab) { viewTab.document.write(viewHTML); viewTab.document.close(); }
     else { alert('Popup bloqueado! Habilite popups para este site.'); }
}

async function generateResolvedViewHTML(startDate, endDate) { // Expect Date objects
    const user = auth.currentUser;
    if (!user) { alert("Você precisa estar logado."); return; }
    const uid = user.uid;

    // Convert start/end dates (local midnight) to UTC Timestamps for Firestore query
    const startUTC = new Date(Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()));
    // For end date, query up to the start of the *next* day UTC
    const endNextDayUTC = new Date(Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() + 1));

    const startTimestamp = Timestamp.fromDate(startUTC);
    const endTimestamp = Timestamp.fromDate(endNextDayUTC); // Use start of next day for '<' comparison

    const archivedRef = collection(db, "users", uid, "archivedTargets");
    // Query based on resolutionDate range
    const q = query(archivedRef,
                    where("resolved", "==", true),
                    where("resolutionDate", ">=", startTimestamp),
                    where("resolutionDate", "<", endTimestamp), // Target date is BEFORE start of next day
                    orderBy("resolutionDate", "desc")); // Order by resolution date

    let filteredResolvedTargets = [];
    try {
        const querySnapshot = await getDocs(q);
        const rawTargets = [];
        querySnapshot.forEach((doc) => rawTargets.push({ ...doc.data(), id: doc.id }));
        filteredResolvedTargets = rehydrateTargets(rawTargets); // Convert Timestamps to Dates
        console.log(`[generateResolvedViewHTML] Found ${filteredResolvedTargets.length} resolved targets in the period.`);
    } catch (error) {
        console.error("Error fetching resolved targets:", error);
        alert("Erro ao buscar alvos respondidos no período selecionado."); return;
    }

    // Sort again locally just to be sure (Firestore order should be correct)
    filteredResolvedTargets.sort((a, b) => (b.resolutionDate?.getTime() || 0) - (a.resolutionDate?.getTime() || 0));

    let viewHTML = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Alvos Respondidos - ${formatDateForDisplay(startDate)} a ${formatDateForDisplay(endDate)}</title>
            <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap">
             <style>
                 /* Reuse styles */
                 body { font-family: 'Playfair Display', serif; margin: 20px; background-color: #f9f9f9; color: #333; }
                 h1, h2 { text-align: center; color: #333; }
                 .target { border: 1px solid #ddd; border-radius: 5px; background-color: #eaffea; padding: 15px; margin-bottom: 15px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: left; }
                 .target h3 { margin-top: 0; font-size: 1.3em; color: #38761d; }
                 .target p { margin: 5px 0; line-height: 1.5; }
                 .observations { margin-top: 10px; padding-top: 10px; border-top: 1px dotted #c3e6cb; }
                 .observations h4 { margin-top: 0; margin-bottom: 5px; font-size: 1em; color: #666; }
                 .observation-item { font-size: 0.9em; color: #555; margin-bottom: 5px; padding-left: 10px; }
                 .observation-item strong { color: #333; }
                 hr { border: 0; border-top: 1px solid #ccc; margin: 20px 0; }
                 /* Print styles */
                  @media print {
                     body { background-color: #fff; margin: 10px; font-size: 10pt; }
                     .target { box-shadow: none; border: 1px solid #ccc; page-break-inside: avoid; background-color: #fff !important; }
                     h1, h2 { font-size: 14pt; }
                     h3 { font-size: 12pt; }
                     hr { display: none !important; }
                 }
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
            viewHTML += generateTargetViewHTMLForResolved(target); // Use specific helper
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

function generateTargetViewHTMLForResolved(target) { // Specific helper for Resolved View
     if (!target || !target.id) return '';
     const formattedResolutionDate = formatDateForDisplay(target.resolutionDate);
     let totalTime = 'N/A';
     if (target.date instanceof Date && target.resolutionDate instanceof Date) {
          // Calculate time difference more simply using timeElapsed logic
         const diffInMs = target.resolutionDate.getTime() - target.date.getTime();
         if (diffInMs >= 0) {
             let diffInSeconds = Math.floor(diffInMs / 1000);
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
     }
     const observations = Array.isArray(target.observations) ? target.observations : [];
     const observationsHTML = renderObservationsForView(observations);

     return `
         <div class="target resolved">
             <h3>${target.title || 'Sem Título'} (Respondido)</h3>
             <p>${target.details || 'Sem Detalhes'}</p>
             <p><strong>Data Criação:</strong> ${formatDateForDisplay(target.date)}</p>
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
        if (!target) return false; // Skip null/undefined targets
         const titleMatch = target.title && target.title.toLowerCase().includes(lowerSearchTerm);
         const detailsMatch = target.details && target.details.toLowerCase().includes(lowerSearchTerm);
          const observationMatch = Array.isArray(target.observations) &&
              target.observations.some(obs => obs && obs.text && obs.text.toLowerCase().includes(lowerSearchTerm));
        return titleMatch || detailsMatch || observationMatch;
    });
}

function handleSearchMain(event) { currentSearchTermMain = event.target.value; currentPage = 1; renderTargets(); }
function handleSearchArchived(event) { currentSearchTermArchived = event.target.value; currentArchivedPage = 1; renderArchivedTargets(); }
function handleSearchResolved(event) { currentSearchTermResolved = event.target.value; currentResolvedPage = 1; renderResolvedTargets(); }

function showPanel(panelIdToShow) {
    // Define all panels and related elements that might need hiding/showing
    const allPanels = [
        'appContent',         // Form section
        'dailySection',       // Daily targets section
        'mainPanel',          // Active targets list
        'archivedPanel',      // Archived targets list
        'resolvedPanel',      // Resolved targets list
        // 'deadlinePanel',   // Deadline list (if you re-enable it)
        'weeklyPerseveranceChart',
        'perseveranceSection'
    ];
    const separators = ['sectionSeparator']; // Add IDs of separators if needed

    // Hide all panels and separators initially
    allPanels.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.style.display = 'none';
    });
    separators.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.style.display = 'none';
    });

    // Show the requested panel if an ID was provided
    if (panelIdToShow) {
        const panelToShowElement = document.getElementById(panelIdToShow);
        if (panelToShowElement) {
            // Use 'block' for most sections, 'flex' might be needed if the section uses flexbox internally
            panelToShowElement.style.display = (panelIdToShow === 'dailySection' || panelIdToShow === 'perseveranceSection') ? 'block' : 'block';
             console.log(`Showing panel: ${panelIdToShow}`);
        } else {
            console.error(`Panel with ID ${panelIdToShow} not found.`);
            return; // Exit if the requested panel doesn't exist
        }
    } else {
         console.log("Hiding all main content panels.");
         return; // Exit if no panel ID was given (used to hide all)
    }


    // --- Logic to show related elements based on the main panel ---

    // If showing Daily Section, also show Perseverance chart/bar and separator
    if (panelIdToShow === 'dailySection') {
        const chart = document.getElementById('weeklyPerseveranceChart');
        const section = document.getElementById('perseveranceSection');
        const separator = document.getElementById('sectionSeparator');
        if (chart) chart.style.display = 'block';
        if (section) section.style.display = 'block';
        if (separator) separator.style.display = 'block';
    }
    // If showing ANY panel *other* than daily, ensure daily *related* items are hidden
    else if (['appContent', 'mainPanel', 'archivedPanel', 'resolvedPanel'].includes(panelIdToShow)) {
        const chart = document.getElementById('weeklyPerseveranceChart');
        const section = document.getElementById('perseveranceSection');
        const separator = document.getElementById('sectionSeparator');
        // Ensure dailySection itself is also hidden if showing one of these lists/forms
        const dailySect = document.getElementById('dailySection');
        if (dailySect) dailySect.style.display = 'none';
        if (chart) chart.style.display = 'none';
        if (section) section.style.display = 'none';
        if (separator) separator.style.display = 'none';
    }

     // Update active button state (optional visual feedback)
     const menuButtons = document.querySelectorAll('#mainMenu button');
     menuButtons.forEach(button => {
         button.classList.remove('active-button-style'); // Remove active style from all
         // Add active style based on which panel is shown
         if ((panelIdToShow === 'dailySection' && button.id === 'backToMainButton') ||
             (panelIdToShow === 'appContent' && button.id === 'addNewTargetButton') ||
             (panelIdToShow === 'mainPanel' && button.id === 'viewAllTargetsButton') ||
             (panelIdToShow === 'archivedPanel' && button.id === 'viewArchivedButton') ||
             (panelIdToShow === 'resolvedPanel' && button.id === 'viewResolvedButton')) {
             button.classList.add('active-button-style');
         }
     });

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
    if (verseDisplay && verses.length > 0) {
        const randomIndex = Math.floor(Math.random() * verses.length);
        verseDisplay.textContent = verses[randomIndex];
    } else if (verseDisplay) {
        verseDisplay.textContent = ""; // Clear if no verses available
    }
}

function displayCompletionPopup() {
    const popup = document.getElementById('completionPopup');
    if (popup) {
        popup.style.display = 'flex';
        const popupVerseElement = popup.querySelector('#popupVerse');
        if (popupVerseElement && verses.length > 0) {
            const randomIndex = Math.floor(Math.random() * verses.length);
            popupVerseElement.textContent = verses[randomIndex];
        } else if (popupVerseElement) {
             popupVerseElement.textContent = "“Orai sem cessar.” - 1 Tessalonicenses 5:17"; // Default fallback
        }
    }
}

// --- Event Listeners ---
// Wrap initialization in DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    console.log("[DOMContentLoaded] DOM fully loaded. Setting up listeners.");

    // Set default creation date for new targets
    try {
        const dateInput = document.getElementById('date');
        if (dateInput) dateInput.value = formatDateToISO(new Date());
    } catch (e) { console.error("Error setting default date:", e); }

    // Firebase Auth State Change Listener
    onAuthStateChanged(auth, (user) => {
        console.log("[onAuthStateChanged] Auth state changed. User:", user ? user.uid : 'null');
        loadData(user); // Load data or clear UI based on user state
    });

    // Search inputs
    document.getElementById('searchMain')?.addEventListener('input', handleSearchMain);
    document.getElementById('searchArchived')?.addEventListener('input', handleSearchArchived);
    document.getElementById('searchResolved')?.addEventListener('input', handleSearchResolved);

     // *** NOVO: Listener para busca manual ***
    document.getElementById('searchManualTargetInput')?.addEventListener('input', (e) => {
        searchActiveTargetsForManualAdd(e.target.value);
    });


    // Filter checkboxes
    document.getElementById('showDeadlineOnly')?.addEventListener('change', handleDeadlineFilterChange);
    document.getElementById('showExpiredOnlyMain')?.addEventListener('change', handleExpiredOnlyMainChange);
    document.getElementById('hasDeadline')?.addEventListener('change', handleDeadlineCheckboxChange); // Listener for deadline checkbox


    // Auth Buttons
    document.getElementById('btnEmailSignUp')?.addEventListener('click', signUpWithEmailPassword);
    document.getElementById('btnEmailSignIn')?.addEventListener('click', signInWithEmailPassword);
    document.getElementById('btnForgotPassword')?.addEventListener('click', resetPassword);
    document.getElementById('btnLogout')?.addEventListener('click', () => {
        signOut(auth).catch(error => console.error("Logout error:", error));
    });

    // Main Form Submit
    document.getElementById("prayerForm")?.addEventListener("submit", handlePrayerFormSubmit);

    // Action Buttons
    document.getElementById('confirmPerseveranceButton')?.addEventListener('click', confirmPerseverance); // MODIFICADO
    document.getElementById("viewReportButton")?.addEventListener('click', () => window.location.href = 'orei.html');
    document.getElementById("refreshDaily")?.addEventListener("click", async () => {
        const user = auth.currentUser;
        if (!user) { alert("Você precisa estar logado."); return; }
        if (confirm("Atualizar lista de alvos do dia? Isso gerará uma nova seleção aleatória para hoje, mantendo os concluídos.")) {
            const userId = user.uid;
            const todayStr = formatDateToISO(new Date());
            const dailyDocId = `${userId}_${todayStr}`;
            const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);
            const dailyTargetsDiv = document.getElementById("dailyTargets");
            if (dailyTargetsDiv) dailyTargetsDiv.innerHTML = "<p>Atualizando alvos do dia...</p>"; // Feedback

            try {
                // Fetch current completed IDs before regenerating
                let completedTodayIds = [];
                const currentSnap = await getDoc(dailyRef);
                if (currentSnap.exists()){
                    const currentData = currentSnap.data();
                    if(Array.isArray(currentData.targets)){
                        completedTodayIds = currentData.targets.filter(t => t.completed).map(t => t.targetId);
                    }
                }

                console.log("Refreshing daily targets, preserving completed:", completedTodayIds);
                const newTargetsData = await generateDailyTargets(userId, todayStr); // Regenerate pool

                if(newTargetsData && newTargetsData.targets) {
                    // Mark previously completed ones as completed in the new list
                    newTargetsData.targets = newTargetsData.targets.map(t => {
                        if(completedTodayIds.includes(t.targetId)){
                            return {...t, completed: true};
                        }
                        return t;
                    });
                    // Save the updated list (regenerated pool + preserved completions)
                    await setDoc(dailyRef, newTargetsData);
                    await loadDailyTargets(); // Reload display with the refreshed list
                    alert("Alvos do dia atualizados!");
                } else {
                     alert("Não foi possível gerar novos alvos diários (talvez não haja mais alvos ativos).");
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
        // Copy ALL targets shown (pending first, then completed)
        const targetDivs = dailyTargetsDiv.querySelectorAll('.target');
        if (targetDivs.length === 0) {
            alert('Nenhum alvo na lista para copiar.');
            return;
        }
        textToCopy += `Alvos de Oração (${formatDateForDisplay(new Date())}):\n\n--- PENDENTES ---\n`;
        let pendingAdded = false;
        targetDivs.forEach((div) => {
            if (!div.classList.contains('completed-target')){
                pendingAdded = true;
                const titleElement = div.querySelector('h3');
                const titleText = titleElement ? (Array.from(titleElement.childNodes).filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent.trim()).join(' ') || 'Sem Título') : 'Sem Título';
                const detailsElement = div.querySelector('p:nth-of-type(1)'); // Assumes first <p> is details
                const detailsText = detailsElement ? detailsElement.textContent.trim() : 'Sem Detalhes';
                textToCopy += ` • ${titleText}\n   ${detailsText}\n`;
            }
        });
        if(!pendingAdded) textToCopy += "(Nenhum)\n";

        textToCopy += `\n--- CONCLUÍDOS HOJE ---\n`;
        let completedAdded = false;
        targetDivs.forEach((div) => {
             if (div.classList.contains('completed-target')){
                 completedAdded = true;
                 const titleElement = div.querySelector('h3');
                 const titleText = titleElement ? (Array.from(titleElement.childNodes).filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent.trim()).join(' ') || 'Sem Título') : 'Sem Título';
                 const detailsElement = div.querySelector('p:nth-of-type(1)');
                 const detailsText = detailsElement ? detailsElement.textContent.trim() : 'Sem Detalhes';
                 textToCopy += ` ✓ ${titleText}\n   ${detailsText}\n`;
             }
         });
        if(!completedAdded) textToCopy += "(Nenhum)\n";

        navigator.clipboard.writeText(textToCopy.trim())
           .then(() => alert('Alvos do dia copiados para a área de transferência!'))
           .catch(err => {
               console.error("Clipboard copy failed:", err);
               // Fallback: Show in prompt
               prompt("Falha ao copiar. Copie manualmente:", textToCopy.trim());
           });
     });
     document.getElementById('generateViewButton')?.addEventListener('click', () => generateViewHTML(lastDisplayedTargets)); // Use last displayed targets from MAIN panel
     document.getElementById('viewDaily')?.addEventListener('click', generateDailyViewHTML); // Visualizar alvos do dia
     document.getElementById("viewResolvedViewButton")?.addEventListener("click", () => {
        const dateRangeModal = document.getElementById("dateRangeModal");
        if (!dateRangeModal) return;
        // Set default dates for modal
        const today = new Date();
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const startDateInput = document.getElementById("startDate");
        const endDateInput = document.getElementById("endDate");
        if(startDateInput) startDateInput.value = formatDateToISO(firstDayOfMonth);
        if(endDateInput) endDateInput.value = formatDateToISO(today);
        dateRangeModal.style.display = "block";
     });
     document.getElementById('closePopup')?.addEventListener('click', () => {
         const popup = document.getElementById('completionPopup');
         if (popup) popup.style.display = 'none';
     });

     // Navigation buttons -> Use showPanel to manage visibility
    document.getElementById('viewAllTargetsButton')?.addEventListener('click', () => showPanel('mainPanel'));
    document.getElementById('addNewTargetButton')?.addEventListener('click', () => showPanel('appContent'));
    document.getElementById("viewArchivedButton")?.addEventListener("click", () => showPanel('archivedPanel'));
    document.getElementById("viewResolvedButton")?.addEventListener("click", () => showPanel('resolvedPanel'));
    document.getElementById("backToMainButton")?.addEventListener("click", () => showPanel('dailySection')); // Goes back to daily view

    // Date Range Modal Logic
    const dateRangeModal = document.getElementById("dateRangeModal");
    document.getElementById("closeDateRangeModal")?.addEventListener("click", () => { if(dateRangeModal) dateRangeModal.style.display = "none"; });
    document.getElementById("generateResolvedView")?.addEventListener("click", () => {
        const startDateStr = document.getElementById("startDate")?.value;
        const endDateStr = document.getElementById("endDate")?.value;
        if (startDateStr && endDateStr && dateRangeModal) {
            // Parse as local dates, function will handle UTC conversion for query
            const start = new Date(startDateStr + 'T00:00:00'); // Assume local time start
            const end = new Date(endDateStr + 'T23:59:59');     // Assume local time end of day
             if (isNaN(start.getTime()) || isNaN(end.getTime())) { alert("Datas inválidas."); return; }
             if (start > end) { alert("Data de início não pode ser após a data de fim."); return; }
            generateResolvedViewHTML(start, end); // Pass Date objects
            dateRangeModal.style.display = "none";
        } else { alert("Por favor, selecione as datas de início e fim."); }
    });
    document.getElementById("cancelDateRange")?.addEventListener("click", () => {if(dateRangeModal) dateRangeModal.style.display = "none"; });
    window.addEventListener('click', (event) => { if (dateRangeModal && event.target == dateRangeModal) dateRangeModal.style.display = "none"; });

    console.log("[DOMContentLoaded] Setup complete.");
}); // End of DOMContentLoaded

// Make functions globally accessible if called directly via onclick
window.markAsResolved = markAsResolved;
window.archiveTarget = archiveTarget;
window.deleteArchivedTarget = deleteArchivedTarget;
window.markArchivedAsResolved = markArchivedAsResolved;
window.toggleAddObservation = toggleAddObservation;
window.saveObservation = saveObservation;
window.toggleObservations = toggleObservations;
window.editDeadline = editDeadline;
window.saveEditedDeadline = saveEditedDeadline;
window.cancelEditDeadline = cancelEditDeadline;
// Note: addPrayButtonFunctionality and others called internally don't need to be window globals
