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
let lastDisplayedTargets = []; // Mantido, mas não usado para Visualização Geral
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
    // console.log('[formatDateForDisplay] Received input:', dateInput, '| Type:', typeof dateInput); // Debugging

    if (!dateInput) {
        // console.log('[formatDateForDisplay] Input is null or undefined. Returning Invalid Date.'); // Debugging
        return 'Data Inválida';
    }

    let dateToFormat;
    if (dateInput instanceof Timestamp) {
        // console.log('[formatDateForDisplay] Input is Timestamp. Converting to Date.'); // Debugging
        dateToFormat = dateInput.toDate();
    } else if (dateInput instanceof Date && !isNaN(dateInput.getTime())) { // Added validity check
        // console.log('[formatDateForDisplay] Input is already a valid Date.'); // Debugging
        dateToFormat = dateInput;
    } else {
        if (typeof dateInput === 'string') {
            // console.log('[formatDateForDisplay] Input is string. Attempting to parse.'); // Debugging
            dateToFormat = new Date(dateInput);
        } else {
            console.warn("[formatDateForDisplay] Input is unexpected type:", typeof dateInput, dateInput, ". Returning Invalid Date.");
            return 'Data Inválida';
        }
    }

    if (!dateToFormat || isNaN(dateToFormat.getTime())) {
        // console.log('[formatDateForDisplay] Conversion resulted in invalid Date object. Returning Invalid Date.'); // Debugging
        return 'Data Inválida';
    }

    const day = String(dateToFormat.getUTCDate()).padStart(2, '0');
    const month = String(dateToFormat.getUTCMonth() + 1).padStart(2, '0'); // getUTCMonth is 0-indexed
    const year = dateToFormat.getUTCFullYear();
    const formattedDate = `${day}/${month}/${year}`;
    // console.log('[formatDateForDisplay] Formatting successful using UTC components. Returning:', formattedDate); // Debugging
    return formattedDate;
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
    // console.log('[rehydrateTargets] Starting rehydration for', targets.length, 'targets.'); // Debugging
    return targets.map((target, index) => {
        const rehydratedTarget = { ...target };

        const fieldsToConvert = ['date', 'deadlineDate', 'lastPresentedDate', 'resolutionDate', 'archivedDate']; // Added archivedDate
        fieldsToConvert.forEach(field => {
            const originalValue = rehydratedTarget[field];
            if (originalValue instanceof Timestamp) {
                rehydratedTarget[field] = originalValue.toDate();
            } else if (originalValue instanceof Date && !isNaN(originalValue.getTime())) { // Added validity check
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
            rehydratedTarget.observations = rehydratedTarget.observations.map(obs => {
                let obsDateFinal = null;
                if (obs.date instanceof Timestamp) obsDateFinal = obs.date.toDate();
                else if (obs.date instanceof Date && !isNaN(obs.date.getTime())) obsDateFinal = obs.date; // Added validity check
                else if (obs.date) {
                   try {
                      const parsedObsDate = new Date(obs.date);
                      if (!isNaN(parsedObsDate.getTime())) obsDateFinal = parsedObsDate;
                   } catch(e) { /* ignore */ }
                }
                return { ...obs, date: obsDateFinal };
            });
        } else rehydratedTarget.observations = [];
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
    const passwordResetMessageDiv = document.getElementById('passwordResetMessage');

    if (user) {
        authStatusContainer.style.display = 'flex';
        btnLogout.style.display = 'inline-block';
        emailPasswordAuthForm.style.display = 'none';
        passwordResetMessageDiv.style.display = 'none'; // Esconde msg de reset ao logar

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
        // Não limpa a mensagem de reset aqui, pode ser útil
    }
}

async function signUpWithEmailPassword() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const passwordResetMessageDiv = document.getElementById('passwordResetMessage');
    passwordResetMessageDiv.style.display = 'none'; // Esconde msg de reset
    try {
        await createUserWithEmailAndPassword(auth, email, password);
        alert("Cadastro realizado com sucesso!");
    } catch (error) {
        console.error("Erro ao cadastrar com e-mail/senha:", error);
        passwordResetMessageDiv.textContent = "Erro ao cadastrar: " + error.message;
        passwordResetMessageDiv.style.color = "red";
        passwordResetMessageDiv.style.display = "block";
    }
}

async function signInWithEmailPassword() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const passwordResetMessageDiv = document.getElementById('passwordResetMessage');
    passwordResetMessageDiv.style.display = 'none'; // Esconde msg de reset
    try {
        await signInWithEmailAndPassword(auth, email, password);
        // UI update happens via onAuthStateChanged
    } catch (error) {
        console.error("Erro ao entrar com e-mail/senha:", error);
        passwordResetMessageDiv.textContent = "Erro ao entrar: " + error.message;
        passwordResetMessageDiv.style.color = "red";
        passwordResetMessageDiv.style.display = "block";
    }
}

async function resetPassword() {
    const email = document.getElementById('email').value;
    const passwordResetMessageDiv = document.getElementById('passwordResetMessage');
    if (!email) {
        passwordResetMessageDiv.textContent = "Por favor, insira seu e-mail para redefinir a senha.";
        passwordResetMessageDiv.style.color = "orange";
        passwordResetMessageDiv.style.display = "block";
        return;
    }
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
        document.getElementById('appContent').style.display = 'none'; // Esconde form
        document.getElementById('dailySection').style.display = 'block'; // Mostra seção diária por padrão
        document.getElementById('sectionSeparator').style.display = 'block';
        document.getElementById('mainPanel').style.display = 'none'; // Esconde painéis de listas
        document.getElementById('archivedPanel').style.display = 'none';
        document.getElementById('resolvedPanel').style.display = 'none';
        document.getElementById('weeklyPerseveranceChart').style.display = 'block';
        document.getElementById('perseveranceSection').style.display = 'block';

        try {
            // Carrega dados em paralelo para otimizar
            await Promise.all([
                fetchPrayerTargets(uid),
                fetchArchivedTargets(uid),
                loadPerseveranceData(uid) // Carrega dados de perseverança
            ]);

            // Processa dados dependentes após carregamento inicial
            resolvedTargets = archivedTargets.filter(target => target.resolved);
            checkExpiredDeadlines(); // Verifica prazos

            // Renderiza painéis (mas eles começam escondidos)
            renderTargets();
            renderArchivedTargets();
            renderResolvedTargets();

            // Carrega e renderiza alvos diários (que fica visível por padrão)
            await loadDailyTargets();

        } catch (error) {
             console.error("[loadData] Error during data loading process:", error);
             alert("Ocorreu um erro ao carregar seus dados. Por favor, recarregue a página.");
             // Reset UI state in case of error
             document.getElementById('dailyTargets').innerHTML = "<p>Erro ao carregar.</p>";
             document.getElementById('dailyVerses').textContent = '';
             resetPerseveranceUI();
         }
    } else {
        console.log("[loadData] No user authenticated. Clearing data and UI.");
        // Esconde tudo exceto autenticação
        document.getElementById('appContent').style.display = 'none';
        document.getElementById('dailySection').style.display = 'none';
        document.getElementById('sectionSeparator').style.display = 'none';
        document.getElementById('mainPanel').style.display = 'none';
        document.getElementById('archivedPanel').style.display = 'none';
        document.getElementById('resolvedPanel').style.display = 'none';
        document.getElementById('weeklyPerseveranceChart').style.display = 'none';
        document.getElementById('perseveranceSection').style.display = 'none';

        // Limpa dados locais
        prayerTargets = [];
        archivedTargets = [];
        resolvedTargets = [];
        lastDisplayedTargets = [];
        renderTargets(); // Limpa as listas na UI
        renderArchivedTargets();
        renderResolvedTargets();
        document.getElementById("dailyTargets").innerHTML = ""; // Limpa alvos diários
        document.getElementById('dailyVerses').textContent = '';
        resetPerseveranceUI(); // Reseta UI de perseverança
    }
}

async function fetchPrayerTargets(uid) {
    prayerTargets = []; // Limpa antes de buscar
    const targetsRef = collection(db, "users", uid, "prayerTargets");
    try {
        const targetsSnapshot = await getDocs(query(targetsRef, orderBy("date", "desc")));
        console.log(`[fetchPrayerTargets] Found ${targetsSnapshot.size} active targets for user ${uid}`);
        const rawTargets = targetsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        prayerTargets = rehydrateTargets(rawTargets);
        console.log("[fetchPrayerTargets] Final rehydrated prayerTargets count:", prayerTargets.length);
    } catch (error) {
        console.error(`[fetchPrayerTargets] Error fetching active targets for user ${uid}:`, error);
        prayerTargets = []; // Garante que está vazio em caso de erro
        throw error; // Re-lança o erro para ser pego pelo loadData
    }
}

async function fetchArchivedTargets(uid) {
    archivedTargets = []; // Limpa antes de buscar
    const archivedRef = collection(db, "users", uid, "archivedTargets");
    try {
        // Ordena por archivedDate descendente (mais recentemente arquivado primeiro), ou data de criação como fallback
        const archivedSnapshot = await getDocs(query(archivedRef, orderBy("archivedDate", "desc"), orderBy("date", "desc")));
        console.log(`[fetchArchivedTargets] Found ${archivedSnapshot.size} archived targets for user ${uid}`);
        const rawArchived = archivedSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        archivedTargets = rehydrateTargets(rawArchived);
        console.log("[fetchArchivedTargets] Final rehydrated archivedTargets count:", archivedTargets.length);
    } catch (error) {
        console.error(`[fetchArchivedTargets] Error fetching archived targets for user ${uid}:`, error);
        archivedTargets = []; // Garante que está vazio em caso de erro
        throw error; // Re-lança o erro
    }
}

// --- Renderização ---
function renderTargets() {
    const targetListDiv = document.getElementById('targetList');
    targetListDiv.innerHTML = '';
    let filteredAndPagedTargets = [...prayerTargets];

    // Aplica Filtros
    if (currentSearchTermMain) {
        filteredAndPagedTargets = filterTargets(filteredAndPagedTargets, currentSearchTermMain);
    }
    if (showDeadlineOnly) {
        filteredAndPagedTargets = filteredAndPagedTargets.filter(target => target.hasDeadline && target.deadlineDate);
    }
    const showExpiredOnlyMainCheckbox = document.getElementById('showExpiredOnlyMain');
    if (showExpiredOnlyMainCheckbox && showExpiredOnlyMainCheckbox.checked) {
        filteredAndPagedTargets = filteredAndPagedTargets.filter(target => target.hasDeadline && target.deadlineDate instanceof Date && isDateExpired(target.deadlineDate));
    }

    // Ordena
     if (showDeadlineOnly || (showExpiredOnlyMainCheckbox && showExpiredOnlyMainCheckbox.checked)) {
        // Ordena por prazo ascendente (mais próximo primeiro)
        filteredAndPagedTargets.sort((a, b) => {
            const dateA = a.deadlineDate instanceof Date && !isNaN(a.deadlineDate) ? a.deadlineDate.getTime() : Infinity;
            const dateB = b.deadlineDate instanceof Date && !isNaN(b.deadlineDate) ? b.deadlineDate.getTime() : Infinity;
            if (dateA !== dateB) return dateA - dateB;
            // Fallback por data de criação descendente se prazos iguais ou ambos infinitos
            const creationA = a.date instanceof Date && !isNaN(a.date) ? a.date.getTime() : 0;
            const creationB = b.date instanceof Date && !isNaN(b.date) ? b.date.getTime() : 0;
            return creationB - creationA;
        });
    } else {
        // Ordenação padrão por data de criação descendente (mais recente primeiro)
        filteredAndPagedTargets.sort((a, b) => {
             const creationA = a.date instanceof Date && !isNaN(a.date) ? a.date.getTime() : 0;
             const creationB = b.date instanceof Date && !isNaN(b.date) ? b.date.getTime() : 0;
             return creationB - creationA;
         });
    }

    // Pagina
    const startIndex = (currentPage - 1) * targetsPerPage;
    const endIndex = startIndex + targetsPerPage;
    const targetsToDisplay = filteredAndPagedTargets.slice(startIndex, endIndex);
    lastDisplayedTargets = targetsToDisplay; // Atualiza para visualização geral (se não for usar prayerTargets)

    // Renderiza
    if (targetsToDisplay.length === 0) {
        if (currentPage > 1 && filteredAndPagedTargets.length > 0) { // Se não na pag 1 mas há itens
            currentPage = Math.ceil(filteredAndPagedTargets.length / targetsPerPage); // Vai para última pág
            renderTargets(); // Re-renderiza na última página
            return;
        } else {
            targetListDiv.innerHTML = `<p style="text-align:center; color:#777; margin-top: 20px;">${currentSearchTermMain || showDeadlineOnly || (showExpiredOnlyMainCheckbox && showExpiredOnlyMainCheckbox.checked) ? 'Nenhum alvo encontrado com os filtros aplicados.' : 'Nenhum alvo de oração ativo. Adicione um novo!'}</p>`;
        }
    } else {
        targetsToDisplay.forEach((target) => {
             if (!target || !target.id) {
                 console.warn("[renderTargets] Skipping rendering of invalid target:", target);
                 return;
             }
            const targetDiv = document.createElement("div");
            targetDiv.classList.add("target");
            targetDiv.dataset.targetId = target.id; // Guarda ID

            const formattedDate = formatDateForDisplay(target.date);
            const elapsed = timeElapsed(target.date);
            let deadlineTag = '';
            if (target.hasDeadline && target.deadlineDate instanceof Date) {
                const formattedDeadline = formatDateForDisplay(target.deadlineDate);
                deadlineTag = `<span class="deadline-tag ${isDateExpired(target.deadlineDate) ? 'expired' : ''}">Prazo: ${formattedDeadline}</span>`;
            }

            const observations = Array.isArray(target.observations) ? target.observations : [];

            targetDiv.innerHTML = `
                <h3>${deadlineTag} ${target.title || 'Sem Título'}</h3>
                <p>${target.details || '<i>Sem Detalhes</i>'}</p>
                <p><small><strong>Data:</strong> ${formattedDate} | <strong>Tempo Decorrido:</strong> ${elapsed}</small></p>
                ${renderObservations(observations, false, target.id)} <!-- Pass ID, inicia não expandido -->
                <div class="target-actions" style="margin-top: 10px;">
                    <button class="resolved btn" onclick="markAsResolved('${target.id}')">Respondido</button>
                    <button class="archive btn" onclick="archiveTarget('${target.id}')">Arquivar</button>
                    <button class="add-observation btn" onclick="toggleAddObservation('${target.id}')">Observação</button>
                    ${target.hasDeadline ? `<button class="edit-deadline btn" onclick="editDeadline('${target.id}')">Editar Prazo</button>` : `<button class="edit-deadline btn" onclick="addDeadline('${target.id}')">Adic. Prazo</button>`}
                </div>
                <div id="observationForm-${target.id}" class="add-observation-form" style="display:none;"></div>
                <!-- Observation list content handled by renderObservations -->
            `;
            targetListDiv.appendChild(targetDiv);
            renderObservationForm(target.id); // Renderiza form de observação escondido
        });
    }

    renderPagination('mainPanel', currentPage, filteredAndPagedTargets);
}

function renderArchivedTargets() {
    const archivedListDiv = document.getElementById('archivedList');
    archivedListDiv.innerHTML = '';
    let filteredAndPagedArchivedTargets = [...archivedTargets];

    // Filtra por pesquisa
    if (currentSearchTermArchived) {
        filteredAndPagedArchivedTargets = filterTargets(filteredAndPagedArchivedTargets, currentSearchTermArchived);
    }

    // Ordena por data de arquivamento desc (mais recente primeiro) ou data de criação como fallback
     filteredAndPagedArchivedTargets.sort((a, b) => {
        const dateA = a.archivedDate instanceof Date ? a.archivedDate.getTime() : (a.date instanceof Date ? a.date.getTime() : 0);
        const dateB = b.archivedDate instanceof Date ? b.archivedDate.getTime() : (b.date instanceof Date ? b.date.getTime() : 0);
        return dateB - dateA;
     });


    const startIndex = (currentArchivedPage - 1) * targetsPerPage;
    const endIndex = startIndex + targetsPerPage;
    const targetsToDisplay = filteredAndPagedArchivedTargets.slice(startIndex, endIndex);

    if (targetsToDisplay.length === 0) {
         if (currentArchivedPage > 1 && filteredAndPagedArchivedTargets.length > 0) {
            currentArchivedPage = Math.ceil(filteredAndPagedArchivedTargets.length / targetsPerPage);
            renderArchivedTargets();
            return;
         } else {
            archivedListDiv.innerHTML = `<p style="text-align:center; color:#777; margin-top: 20px;">${currentSearchTermArchived ? 'Nenhum alvo arquivado encontrado com o termo pesquisado.' : 'Nenhum alvo arquivado.'}</p>`;
         }
    } else {
        targetsToDisplay.forEach((target) => {
             if (!target || !target.id) return;
            const archivedDiv = document.createElement("div");
            archivedDiv.classList.add("target", "archived"); // Classe base + específica
            archivedDiv.dataset.targetId = target.id;

            const formattedCreationDate = formatDateForDisplay(target.date);
            const formattedArchivedDate = target.archivedDate ? formatDateForDisplay(target.archivedDate) : 'Data Indisponível';
            const observations = Array.isArray(target.observations) ? target.observations : [];

            archivedDiv.innerHTML = `
                <h3>${target.title || 'Sem Título'} ${target.resolved ? '(Respondido)' : ''}</h3>
                <p>${target.details || '<i>Sem Detalhes</i>'}</p>
                <p><small><strong>Criado em:</strong> ${formattedCreationDate} | <strong>Arquivado em:</strong> ${formattedArchivedDate}</small></p>
                ${renderObservations(observations, false, target.id)} <!-- Inicia não expandido -->
                <div class="target-actions" style="margin-top: 10px;">
                     <button class="unarchive btn" onclick="unarchiveTarget('${target.id}')" style="background-color: #5bc0de;">Restaurar</button>
                    <button class="delete btn" onclick="deleteArchivedTarget('${target.id}')" style="background-color: #c9302c;">Excluir Perm.</button>
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
    let filteredAndPagedResolvedTargets = [...resolvedTargets]; // Usa a lista já filtrada

    // Filtra por pesquisa
    if (currentSearchTermResolved) {
        filteredAndPagedResolvedTargets = filterTargets(filteredAndPagedResolvedTargets, currentSearchTermResolved);
    }

    // Ordena por data de resolução desc (mais recente primeiro)
     filteredAndPagedResolvedTargets.sort((a, b) => {
        const dateA = a.resolutionDate instanceof Date ? a.resolutionDate.getTime() : 0;
        const dateB = b.resolutionDate instanceof Date ? b.resolutionDate.getTime() : 0;
        return dateB - dateA;
     });

    const startIndex = (currentResolvedPage - 1) * targetsPerPage;
    const endIndex = startIndex + targetsPerPage;
    const targetsToDisplay = filteredAndPagedResolvedTargets.slice(startIndex, endIndex);

    if (targetsToDisplay.length === 0) {
         if (currentResolvedPage > 1 && filteredAndPagedResolvedTargets.length > 0) {
             currentResolvedPage = Math.ceil(filteredAndPagedResolvedTargets.length / targetsPerPage);
             renderResolvedTargets();
             return;
         } else {
             resolvedListDiv.innerHTML = `<p style="text-align:center; color:#777; margin-top: 20px;">${currentSearchTermResolved ? 'Nenhum alvo respondido encontrado com o termo pesquisado.' : 'Nenhum alvo marcado como respondido.'}</p>`;
         }
    } else {
        targetsToDisplay.forEach((target) => {
            if (!target || !target.id) return;
            const resolvedDiv = document.createElement("div");
            resolvedDiv.classList.add("target", "resolved"); // Classe base + específica
            resolvedDiv.dataset.targetId = target.id;

            const formattedResolutionDate = target.resolutionDate ? formatDateForDisplay(target.resolutionDate) : 'Data Indisponível';
            const formattedCreationDate = formatDateForDisplay(target.date);
            let totalTime = 'N/A';
            if (target.date instanceof Date && target.resolutionDate instanceof Date) {
                 let diffInSeconds = Math.floor((target.resolutionDate.getTime() - target.date.getTime()) / 1000);
                 if (diffInSeconds < 0) diffInSeconds = 0;
                 // Reutiliza timeElapsed para calcular, mas formata diferente se necessário
                 if (diffInSeconds < 86400) totalTime = timeElapsed(target.date); // Se menos de 1 dia, usa formato padrão
                 else totalTime = `${Math.floor(diffInSeconds / 86400)} dias`; // Se 1 dia ou mais, mostra em dias
            }
            const observations = Array.isArray(target.observations) ? target.observations : [];

            resolvedDiv.innerHTML = `
                <h3>${target.title || 'Sem Título'} (Respondido)</h3>
                <p>${target.details || '<i>Sem Detalhes</i>'}</p>
                <p><small><strong>Criado em:</strong> ${formattedCreationDate} | <strong>Respondido em:</strong> ${formattedResolutionDate} | <strong>Tempo Total:</strong> ${totalTime}</small></p>
                ${renderObservations(observations, false, target.id)} <!-- Inicia não expandido -->
                 <div class="target-actions" style="margin-top: 10px;">
                    <button class="delete btn" onclick="deleteArchivedTarget('${target.id}')" style="background-color: #c9302c;">Excluir Perm.</button>
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
        paginationDiv.style.justifyContent = 'center'; // Centraliza os links
        paginationDiv.style.marginTop = '20px'; // Espaço acima
    }

    // Lógica de quais páginas mostrar (simplificada: primeira, anterior, atual, próxima, última)
    let linksHTML = '';

    // Botão Primeira Página e Anterior
    if (page > 1) {
        linksHTML += `<a href="#" class="page-link" data-page="1" data-panel="${panelId}" title="Primeira Página">««</a>`;
        linksHTML += `<a href="#" class="page-link" data-page="${page - 1}" data-panel="${panelId}" title="Página Anterior">« Anterior</a>`;
    } else {
         linksHTML += `<span class="page-link disabled" title="Primeira Página">««</span>`;
         linksHTML += `<span class="page-link disabled" title="Página Anterior">« Anterior</span>`;
    }

    // Indicador de Página Atual
    linksHTML += `<span style="margin: 0 10px; padding: 8px 5px; color: #555;">Página ${page} de ${totalPages}</span>`;

    // Botão Próxima e Última Página
    if (page < totalPages) {
        linksHTML += `<a href="#" class="page-link" data-page="${page + 1}" data-panel="${panelId}" title="Próxima Página">Próxima »</a>`;
        linksHTML += `<a href="#" class="page-link" data-page="${totalPages}" data-panel="${panelId}" title="Última Página">»»</a>`;
    } else {
         linksHTML += `<span class="page-link disabled" title="Próxima Página">Próxima »</span>`;
         linksHTML += `<span class="page-link disabled" title="Última Página">»»</span>`;
    }


    paginationDiv.innerHTML = linksHTML;

    // Adiciona event listeners aos links ativos
    paginationDiv.querySelectorAll('.page-link:not(.disabled)').forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            const targetPage = parseInt(event.target.dataset.page);
            const targetPanel = event.target.dataset.panel;
            handlePageChange(targetPanel, targetPage);
        });
    });

    // Estilo básico para links desabilitados
     paginationDiv.querySelectorAll('.page-link.disabled').forEach(span => {
         span.style.color = '#aaa';
         span.style.cursor = 'default';
         span.style.backgroundColor = '#eee';
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
    // Rola suavemente para o topo do painel
    const panelElement = document.getElementById(panelId);
    if (panelElement) {
        // Tenta rolar para o topo do painel, considerando o cabeçalho fixo se houver
        const headerHeight = document.querySelector('.top-bar')?.offsetHeight || 0; // Ajuste se tiver cabeçalho fixo
        const panelTop = panelElement.getBoundingClientRect().top + window.pageYOffset - headerHeight - 10; // 10px de margem
        window.scrollTo({ top: panelTop, behavior: 'smooth' });
    }
}


// --- Adição/Edição/Arquivamento ---
document.getElementById("prayerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) { alert("Você precisa estar logado para adicionar um alvo."); return; }
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
        // Validação: Prazo não pode ser antes da data de criação
        if (deadlineDateUTC.getTime() < dateUTC.getTime()) {
             alert("O Prazo de Validade não pode ser anterior à Data de criação.");
             return;
         }
    }

    const target = {
        title: title,
        details: details,
        date: Timestamp.fromDate(dateUTC),
        hasDeadline: hasDeadline,
        deadlineDate: deadlineDateUTC ? Timestamp.fromDate(deadlineDateUTC) : null,
        archived: false,
        resolved: false,
        archivedDate: null, // Data de arquivamento
        resolutionDate: null, // Data de resolução
        lastPresentedDate: null, // Data da última vez que apareceu nos diários
        observations: [],
        userId: uid // Adiciona userId para regras/queries futuras
    };

    try {
        const targetsCollectionRef = collection(db, "users", uid, "prayerTargets");
        const docRef = await addDoc(targetsCollectionRef, target);

        // Adiciona ao estado local (já reidratado)
        const newLocalTarget = rehydrateTargets([{ ...target, id: docRef.id }])[0];
        prayerTargets.unshift(newLocalTarget); // Adiciona no início
        prayerTargets.sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0)); // Mantém ordenado

        document.getElementById("prayerForm").reset(); // Limpa formulário
        document.getElementById('deadlineContainer').style.display = 'none'; // Esconde campo de prazo
        document.getElementById('date').value = formatDateToISO(new Date()); // Reseta data para hoje

        showPanel('mainPanel'); // Mostra painel principal
        currentPage = 1; // Vai para a primeira página
        renderTargets(); // Re-renderiza
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
    if (targetIndex === -1) { alert("Erro: Alvo ativo não encontrado para marcar como resolvido."); return; }

    const targetData = prayerTargets[targetIndex];
    const nowTimestamp = Timestamp.fromDate(new Date()); // Data/hora atual

    const activeTargetRef = doc(db, "users", userId, "prayerTargets", targetId);
    const archivedTargetRef = doc(db, "users", userId, "archivedTargets", targetId);

    try {
        // Prepara dados para arquivar, convertendo Datas locais para Timestamps
        const archivedData = {
            ...targetData,
            date: targetData.date instanceof Date ? Timestamp.fromDate(targetData.date) : targetData.date, // Garante Timestamp
            deadlineDate: targetData.deadlineDate instanceof Date ? Timestamp.fromDate(targetData.deadlineDate) : targetData.deadlineDate, // Garante Timestamp ou null
            observations: Array.isArray(targetData.observations) ? targetData.observations.map(obs => ({
                ...obs,
                date: obs.date instanceof Date ? Timestamp.fromDate(obs.date) : obs.date // Garante Timestamp
            })) : [],
            resolved: true,     // Marcado como resolvido
            archived: true,     // Marcado como arquivado
            resolutionDate: nowTimestamp, // Data da resolução
            archivedDate: nowTimestamp   // Data do arquivamento (mesma da resolução neste caso)
        };
        // Remove ID do objeto a ser salvo (já está no nome do doc)
        delete archivedData.id;

        // Usa batch para garantir atomicidade
        const batch = writeBatch(db);
        batch.delete(activeTargetRef); // Deleta do ativo
        batch.set(archivedTargetRef, archivedData); // Cria/Sobrescreve no arquivado
        await batch.commit();

        // Atualiza Estado Local
        prayerTargets.splice(targetIndex, 1); // Remove do local ativo
        const newArchivedLocal = rehydrateTargets([{ ...archivedData, id: targetId }])[0]; // Reidrata para local
        archivedTargets.unshift(newArchivedLocal); // Adiciona no início do local arquivado
        archivedTargets.sort((a, b) => (b.archivedDate?.getTime() || b.date?.getTime() || 0) - (a.archivedDate?.getTime() || a.date?.getTime() || 0)); // Reordena arquivados
        resolvedTargets = archivedTargets.filter(t => t.resolved); // Recalcula resolvidos
        resolvedTargets.sort((a, b) => (b.resolutionDate?.getTime() || 0) - (a.resolutionDate?.getTime() || 0)); // Reordena resolvidos

        // Re-renderiza
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
    if (targetIndex === -1) { alert("Erro: Alvo ativo não encontrado para arquivar."); return; }

    const targetData = prayerTargets[targetIndex];
    const nowTimestamp = Timestamp.fromDate(new Date()); // Data/hora atual

    const activeTargetRef = doc(db, "users", userId, "prayerTargets", targetId);
    const archivedTargetRef = doc(db, "users", userId, "archivedTargets", targetId);

    try {
        // Prepara dados, convertendo Datas para Timestamps
        const archivedData = {
             ...targetData,
             date: targetData.date instanceof Date ? Timestamp.fromDate(targetData.date) : targetData.date,
             deadlineDate: targetData.deadlineDate instanceof Date ? Timestamp.fromDate(targetData.deadlineDate) : targetData.deadlineDate,
             observations: Array.isArray(targetData.observations) ? targetData.observations.map(obs => ({
                 ...obs,
                 date: obs.date instanceof Date ? Timestamp.fromDate(obs.date) : obs.date
             })) : [],
             resolved: false, // Garante que não está resolvido ao apenas arquivar
             archived: true,
             archivedDate: nowTimestamp, // Data do arquivamento
             resolutionDate: null // Garante que não tem data de resolução
         };
        delete archivedData.id;

        const batch = writeBatch(db);
        batch.delete(activeTargetRef);
        batch.set(archivedTargetRef, archivedData);
        await batch.commit();

        // Atualiza Estado Local
        prayerTargets.splice(targetIndex, 1);
        const newArchivedLocal = rehydrateTargets([{...archivedData, id: targetId}])[0];
        archivedTargets.unshift(newArchivedLocal);
        archivedTargets.sort((a, b) => (b.archivedDate?.getTime() || b.date?.getTime() || 0) - (a.archivedDate?.getTime() || a.date?.getTime() || 0));
        resolvedTargets = archivedTargets.filter(t => t.resolved); // Recalcula resolvidos (não deve mudar aqui)

        // Re-renderiza
        renderTargets();
        renderArchivedTargets();
        renderResolvedTargets(); // Re-renderiza resolvidos caso a lógica mude
        alert('Alvo arquivado com sucesso!');
    } catch (error) {
        console.error("Error archiving target: ", error);
        alert("Erro ao arquivar alvo: " + error.message);
    }
};

window.unarchiveTarget = async function(targetId) {
    const user = auth.currentUser;
    if (!user) { alert("Erro: Usuário não autenticado."); return; }
    const userId = user.uid;

    const targetIndex = archivedTargets.findIndex(t => t.id === targetId);
    if (targetIndex === -1) { alert("Erro: Alvo arquivado não encontrado para restaurar."); return; }

    const targetData = archivedTargets[targetIndex];

    // Não permitir restaurar alvos resolvidos diretamente, deve ser outra ação?
    // Ou permitir e remover o status 'resolved'? Vamos permitir e remover status resolved.
    // if (targetData.resolved) {
    //     alert("Alvos respondidos não podem ser simplesmente restaurados. Considere criar um novo alvo se necessário.");
    //     return;
    // }

    const activeTargetRef = doc(db, "users", userId, "prayerTargets", targetId);
    const archivedTargetRef = doc(db, "users", userId, "archivedTargets", targetId);

    try {
        // Prepara dados para voltar a ser ativo
        const activeData = {
             ...targetData,
             date: targetData.date instanceof Date ? Timestamp.fromDate(targetData.date) : targetData.date,
             deadlineDate: targetData.deadlineDate instanceof Date ? Timestamp.fromDate(targetData.deadlineDate) : targetData.deadlineDate,
             observations: Array.isArray(targetData.observations) ? targetData.observations.map(obs => ({
                 ...obs,
                 date: obs.date instanceof Date ? Timestamp.fromDate(obs.date) : obs.date
             })) : [],
             resolved: false, // Remove status resolvido ao restaurar
             archived: false, // Não está mais arquivado
             archivedDate: null, // Remove data de arquivamento
             resolutionDate: null // Remove data de resolução
         };
        delete activeData.id;

        const batch = writeBatch(db);
        batch.delete(archivedTargetRef); // Deleta do arquivado
        batch.set(activeTargetRef, activeData); // Cria/Sobrescreve no ativo
        await batch.commit();

        // Atualiza Estado Local
        archivedTargets.splice(targetIndex, 1); // Remove do local arquivado
        const newActiveLocal = rehydrateTargets([{...activeData, id: targetId}])[0];
        prayerTargets.unshift(newActiveLocal); // Adiciona no início do local ativo
        prayerTargets.sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0)); // Reordena ativos
        resolvedTargets = archivedTargets.filter(t => t.resolved); // Recalcula resolvidos

        // Re-renderiza
        renderTargets();
        renderArchivedTargets();
        renderResolvedTargets();
        alert('Alvo restaurado para a lista de ativos!');
    } catch (error) {
        console.error("Error unarchiving target: ", error);
        alert("Erro ao restaurar alvo: " + error.message);
    }
};


window.deleteArchivedTarget = async function(targetId) {
     const user = auth.currentUser;
     if (!user) { alert("Erro: Usuário não autenticado."); return; }
     const userId = user.uid;

     const targetTitle = archivedTargets.find(t => t.id === targetId)?.title || `ID ${targetId}`;
     if (!confirm(`Tem certeza que deseja excluir permanentemente o alvo "${targetTitle}"? Esta ação não pode ser desfeita.`)) return;

     const archivedTargetRef = doc(db, "users", userId, "archivedTargets", targetId);
     const clickCountsRef = doc(db, "prayerClickCounts", targetId); // Referência para contagem de cliques

     try {
         const batch = writeBatch(db);
         batch.delete(archivedTargetRef); // Deleta o alvo arquivado
         // Opcional: Deletar contagem de cliques associada? Pode ser útil manter histórico.
         // batch.delete(clickCountsRef); // Descomente para deletar contagem
         await batch.commit();

         // Atualiza Estado Local
         const targetIndex = archivedTargets.findIndex(t => t.id === targetId);
         if (targetIndex !== -1) archivedTargets.splice(targetIndex, 1);
         resolvedTargets = archivedTargets.filter(target => target.resolved); // Recalcula resolvidos

         // Re-renderiza as listas afetadas
         renderArchivedTargets();
         renderResolvedTargets();
         alert(`Alvo "${targetTitle}" excluído permanentemente!`);
     } catch (error) {
         console.error("Error deleting archived target: ", error);
         alert("Erro ao excluir alvo arquivado: " + error.message);
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
         // Garante que a data padrão seja hoje ao abrir
         try {
             document.getElementById(`observationDate-${targetId}`).value = formatDateToISO(new Date());
         } catch (e) { console.error("Error setting default obs date:", e); }
    }
};

function renderObservationForm(targetId) {
    const formDiv = document.getElementById(`observationForm-${targetId}`);
    if (!formDiv) return;
    // Cria o HTML do formulário
    formDiv.innerHTML = `
        <textarea id="observationText-${targetId}" placeholder="Nova observação..." rows="3" style="width: calc(100% - 22px); margin-bottom: 10px;"></textarea>
        <input type="date" id="observationDate-${targetId}" style="width: calc(100% - 22px); margin-bottom: 10px;">
        <div style="text-align: right;">
             <button class="btn" onclick="saveObservation('${targetId}')" style="background-color: #5cb85c; margin-right: 5px;">Salvar</button>
             <button class="btn" onclick="toggleAddObservation('${targetId}')" style="background-color: #f0ad4e;">Cancelar</button>
        </div>
    `;
    // Define a data padrão como hoje (redundante com toggleAddObservation, mas seguro)
    try {
        document.getElementById(`observationDate-${targetId}`).value = formatDateToISO(new Date());
    } catch (e) { console.error("Error setting initial obs date:", e); }
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

    // Encontra o alvo nas listas locais e obtém a referência do Firestore
    let targetRef;
    let targetList;
    let targetIndex = prayerTargets.findIndex(t => t.id === targetId);
    let targetSource = 'active'; // Para saber qual lista re-renderizar

    if (targetIndex !== -1) {
        targetRef = doc(db, "users", userId, "prayerTargets", targetId);
        targetList = prayerTargets;
    } else {
        targetIndex = archivedTargets.findIndex(t => t.id === targetId);
        if (targetIndex !== -1) {
            targetRef = doc(db, "users", userId, "archivedTargets", targetId);
            targetList = archivedTargets;
            targetSource = 'archived';
        } else {
            alert("Erro: Alvo não encontrado para adicionar observação."); return;
        }
    }

    const newObservation = {
        text: observationText,
        date: Timestamp.fromDate(observationDateUTC), // Guarda Timestamp no Firestore
        id: generateUniqueId(), // ID único para a observação
        // targetId: targetId // Pode ser útil, mas já está no documento pai
    };

    try {
        // Atualiza Firestore usando updateDoc e lendo o valor atual
        const targetDocSnap = await getDoc(targetRef);
        if (!targetDocSnap.exists()) {
            throw new Error("Documento do alvo não existe no Firestore.");
        }
        const currentData = targetDocSnap.data();
        const currentObservations = currentData.observations || [];

        // Adiciona a nova observação (com Timestamp)
        currentObservations.push(newObservation);
        // Ordena as observações no Firestore por data descendente antes de salvar
        currentObservations.sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));

        await updateDoc(targetRef, { observations: currentObservations });

        // Atualiza Dados Locais
        const currentTargetLocal = targetList[targetIndex];
        if (!currentTargetLocal.observations || !Array.isArray(currentTargetLocal.observations)) {
            currentTargetLocal.observations = [];
        }
        // Adiciona observação reidratada (com objeto Date) ao estado local
        currentTargetLocal.observations.push({
            ...newObservation,
            date: newObservation.date.toDate() // Converte Timestamp para Date localmente
        });
        // Ordena array local também
        currentTargetLocal.observations.sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));

        // Re-renderiza a lista correta
        if (targetSource === 'active') {
            renderTargets();
        } else { // targetSource === 'archived'
            renderArchivedTargets();
            // Se o alvo também estiver na lista de resolvidos, re-renderiza ela também
            if (resolvedTargets.some(rt => rt.id === targetId)) {
                renderResolvedTargets();
            }
        }

        // Esconde o formulário após salvar
        toggleAddObservation(targetId);
        // Limpa o textarea (a data será resetada na próxima vez que abrir)
        document.getElementById(`observationText-${targetId}`).value = '';

    } catch (error) {
        console.error("Error saving observation:", error);
        alert("Erro ao salvar observação: " + error.message);
    }
};

// **Função renderObservations ATUALIZADA para não mostrar links na visualização estática**
function renderObservations(observations, isExpanded = false, targetId = null) {
    const container = document.createElement('div');
    container.classList.add('observations');

    if (!Array.isArray(observations) || observations.length === 0) {
        container.innerHTML = '<p><i>Nenhuma observação registrada.</i></p>';
        return container.outerHTML; // Retorna o HTML do container
    }

    // Ordena observações por data descendente (mais recente primeiro)
    observations.sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));

    const displayCount = isExpanded ? observations.length : 1; // Mostra 1 ou todas
    const visibleObservations = observations.slice(0, displayCount);
    const remainingCount = observations.length - displayCount;

    // Adiciona um título se houver observações
    container.innerHTML = '<h4 style="margin-bottom: 5px; color: #666;">Observações:</h4>';

    visibleObservations.forEach(observation => {
        if (!observation || !observation.date || !observation.text) return; // Pula inválida
        const formattedDate = formatDateForDisplay(observation.date);
        const p = document.createElement('p');
        p.classList.add('observation-item');
        p.style.fontSize = '0.9em'; // Tamanho menor para observações
        p.style.marginLeft = '10px'; // Leve indentação
        p.innerHTML = `<strong style="color: #31708f;">${formattedDate}:</strong> ${observation.text || ''}`;
        container.appendChild(p);
    });

    // Adiciona link "Ver mais/menos" APENAS se targetId for fornecido (não na visualização estática)
    if (targetId !== null) {
        if (!isExpanded && remainingCount > 0) {
            const toggleLink = document.createElement('a');
            toggleLink.href = '#';
            toggleLink.classList.add('observations-toggle');
            toggleLink.textContent = `Ver mais ${remainingCount} observaç${remainingCount > 1 ? 'ões' : 'ão'}`;
            toggleLink.style.marginLeft = '10px'; // Indenta o link também
            toggleLink.onclick = (event) => {
                event.preventDefault();
                window.toggleObservations(targetId, event);
            };
            container.appendChild(toggleLink);
        } else if (isExpanded && observations.length > 1) { // Mostra "Ver menos" apenas se estava expandido e tinha mais de 1
             const toggleLink = document.createElement('a');
             toggleLink.href = '#';
             toggleLink.classList.add('observations-toggle');
             toggleLink.textContent = 'Ver menos observações';
             toggleLink.style.marginLeft = '10px';
             toggleLink.onclick = (event) => {
                 event.preventDefault();
                 window.toggleObservations(targetId, event);
             };
             container.appendChild(toggleLink);
        }
    }

    return container.outerHTML; // Retorna o HTML completo do container
}

window.toggleObservations = function(targetId, event) {
    if (event) event.preventDefault();
    // Encontra o container do alvo (pode estar em main, archived ou resolved)
    const targetDiv = document.querySelector(`.target[data-target-id="${targetId}"]`);
    if (!targetDiv) { console.warn("Target div not found for toggle:", targetId); return; }
    const observationsContainer = targetDiv.querySelector('.observations');
    if (!observationsContainer) { console.warn("Observations container not found for toggle:", targetId); return; }

    // Verifica se está expandido procurando pelo link "Ver menos"
    const isExpanded = observationsContainer.querySelector('.observations-toggle')?.textContent.includes('Ver menos');

    // Encontra os dados do alvo nas listas locais
    const targetData = prayerTargets.find(t => t.id === targetId) ||
                       archivedTargets.find(t => t.id === targetId); // Inclui resolvidos

    if (!targetData) { console.warn("Target data not found for toggle:", targetId); return; }

    // Re-renderiza a seção de observações com o estado invertido
    const newObservationsHTML = renderObservations(targetData.observations || [], !isExpanded, targetId);
    observationsContainer.outerHTML = newObservationsHTML; // Substitui o container antigo pelo novo
};

// --- Prazos (Deadlines) ---
document.getElementById('hasDeadline').addEventListener('change', function() {
    document.getElementById('deadlineContainer').style.display = this.checked ? 'block' : 'none';
    if (this.checked) {
        // Define data padrão do prazo como hoje, se não houver valor
        const deadlineInput = document.getElementById('deadlineDate');
        if (!deadlineInput.value) {
            deadlineInput.value = formatDateToISO(new Date());
        }
    }
});

function handleDeadlineFilterChange() {
    showDeadlineOnly = document.getElementById('showDeadlineOnly').checked;
    currentPage = 1; // Volta para a primeira página ao mudar filtro
    renderTargets();
}

function handleExpiredOnlyMainChange() {
    currentPage = 1; // Volta para a primeira página
    renderTargets();
}

function checkExpiredDeadlines() {
    // Apenas para log ou futuras notificações, a renderização cuida da classe 'expired'
    const expiredCount = prayerTargets.filter(target =>
        target.hasDeadline && target.deadlineDate instanceof Date && isDateExpired(target.deadlineDate)
    ).length;
    if (expiredCount > 0) {
        console.log(`[checkExpiredDeadlines] Found ${expiredCount} expired deadline(s) among active targets.`);
        // Poderia adicionar uma notificação visual aqui se desejado
    }
}

// Função para abrir o formulário de ADIÇÃO de prazo (quando não tem)
window.addDeadline = function(targetId) {
     editDeadline(targetId); // Reutiliza a mesma lógica de formulário
     // Poderia pré-selecionar uma data futura aqui se desejado
};

// Função para abrir o formulário de EDIÇÃO de prazo
window.editDeadline = function(targetId) {
    const target = prayerTargets.find(t => t.id === targetId);
    if (!target) { alert("Alvo não encontrado."); return; }
    const targetDiv = document.querySelector(`.target[data-target-id="${targetId}"]`);
    if (!targetDiv) return;

    // Remove formulário existente se houver (toggle)
    const existingEditForm = targetDiv.querySelector('.edit-deadline-form');
    if (existingEditForm) {
        existingEditForm.remove();
        return;
    }

    // Formata a data atual do prazo (se existir) para o input date
    let currentDeadlineISO = '';
    if (target.deadlineDate instanceof Date && !isNaN(target.deadlineDate)) {
        currentDeadlineISO = formatDateToISO(target.deadlineDate);
    } else {
        // Se não tem prazo, sugere hoje como padrão
        currentDeadlineISO = formatDateToISO(new Date());
    }

    // Cria o HTML do formulário
    const formHTML = `
        <div class="edit-deadline-form" style="background-color: #f0f0f0; padding: 10px; margin-top: 10px; border-radius: 5px; display: flex; align-items: center; gap: 10px;">
            <label for="editDeadlineDate-${targetId}" style="margin: 0;">Novo Prazo:</label>
            <input type="date" id="editDeadlineDate-${targetId}" value="${currentDeadlineISO}" style="margin: 0; flex-grow: 1;">
            <button class="btn" onclick="saveEditedDeadline('${targetId}')" style="background-color: #4CAF50; margin:0;">Salvar</button>
            <button class="btn" onclick="cancelEditDeadline('${targetId}')" style="background-color: #f44336; margin:0;">Cancelar</button>
            ${target.hasDeadline ? `<button class="btn" onclick="removeDeadline('${targetId}')" style="background-color: #777; margin:0;" title="Remover Prazo">✖</button>` : ''}
        </div>
    `;

    // Insere o formulário após a div de ações
    const actionsDiv = targetDiv.querySelector('.target-actions');
    if (actionsDiv) {
         actionsDiv.insertAdjacentHTML('afterend', formHTML);
         document.getElementById(`editDeadlineDate-${targetId}`)?.focus(); // Foca no input de data
    } else {
         targetDiv.insertAdjacentHTML('beforeend', formHTML); // Fallback
    }
};

window.saveEditedDeadline = async function(targetId) {
    const newDeadlineInput = document.getElementById(`editDeadlineDate-${targetId}`);
    if (!newDeadlineInput) return;
    const newDeadlineValue = newDeadlineInput.value; // Formato YYYY-MM-DD

    if (!newDeadlineValue) {
        alert("Selecione uma data para o prazo.");
        return;
    }

    const newDeadlineUTC = createUTCDate(newDeadlineValue);
    if (!newDeadlineUTC) {
        alert("Data do prazo inválida.");
        return;
    }

    // Validação: Prazo não pode ser antes da data de criação
    const target = prayerTargets.find(t => t.id === targetId);
     if (target && target.date instanceof Date && newDeadlineUTC.getTime() < target.date.getTime()) {
         alert("O Prazo de Validade não pode ser anterior à Data de criação do alvo.");
         return;
     }

    const newDeadlineTimestamp = Timestamp.fromDate(newDeadlineUTC);
    await updateDeadlineInFirestoreAndLocal(targetId, newDeadlineTimestamp, true); // Salva Timestamp, hasDeadline = true
    cancelEditDeadline(targetId); // Fecha o formulário
};

window.removeDeadline = async function(targetId) {
     if (!confirm("Tem certeza que deseja remover o prazo deste alvo?")) return;
     await updateDeadlineInFirestoreAndLocal(targetId, null, false); // Salva null, hasDeadline = false
     cancelEditDeadline(targetId); // Fecha o formulário
};

async function updateDeadlineInFirestoreAndLocal(targetId, newDeadlineTimestamp, newHasDeadline) {
     const user = auth.currentUser;
     if (!user) { alert("Usuário não autenticado."); return; }
     const userId = user.uid;
     const targetRef = doc(db, "users", userId, "prayerTargets", targetId);

     try {
         await updateDoc(targetRef, {
             deadlineDate: newDeadlineTimestamp, // Guarda Timestamp ou null
             hasDeadline: newHasDeadline
         });

         // Atualiza estado local
         const targetIndex = prayerTargets.findIndex(target => target.id === targetId);
         if (targetIndex !== -1) {
             prayerTargets[targetIndex].deadlineDate = newDeadlineTimestamp ? newDeadlineTimestamp.toDate() : null; // Guarda Date ou null
             prayerTargets[targetIndex].hasDeadline = newHasDeadline;
         }

         renderTargets(); // Re-renderiza a lista de ativos
         alert(`Prazo ${newHasDeadline ? 'atualizado' : 'removido'} com sucesso!`);
     } catch (error) {
         console.error(`Error updating deadline for ${targetId}:`, error);
         alert("Erro ao atualizar prazo: " + error.message);
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
        document.getElementById('dailyVerses').textContent = ''; // Limpa versículo
        return;
    }

    const today = new Date();
    const todayStr = formatDateToISO(today); // YYYY-MM-DD (UTC)
    const dailyDocId = `${userId}_${todayStr}`;
    const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);

    try {
        let dailyTargetsData;
        const dailySnapshot = await getDoc(dailyRef);

        if (!dailySnapshot.exists() || !dailySnapshot.data()?.targets ) { // Se não existe ou não tem 'targets'
            console.log(`[loadDailyTargets] Daily document for ${dailyDocId} not found or invalid, generating new targets.`);
            dailyTargetsData = await generateDailyTargets(userId, todayStr);
            if (dailyTargetsData && dailyTargetsData.targets) { // Verifica se a geração foi bem-sucedida
                await setDoc(dailyRef, dailyTargetsData);
                console.log(`[loadDailyTargets] Daily document ${dailyDocId} created/updated successfully.`);
            } else {
                 console.error("[loadDailyTargets] Failed to generate valid daily targets.");
                 document.getElementById("dailyTargets").innerHTML = "<p>Erro ao gerar alvos diários.</p>";
                 return;
            }
        } else {
            dailyTargetsData = dailySnapshot.data();
            console.log(`[loadDailyTargets] Daily document ${dailyDocId} loaded from Firestore.`);
        }

        // Validação extra dos dados carregados/gerados
        if (!dailyTargetsData || !Array.isArray(dailyTargetsData.targets)) {
            console.error("[loadDailyTargets] Invalid daily targets data structure:", dailyTargetsData);
            document.getElementById("dailyTargets").innerHTML = "<p>Erro: Dados dos alvos diários inválidos.</p>";
            return;
        }

        // Separa IDs pendentes e concluídos
        const pendingTargetIds = dailyTargetsData.targets.filter(t => t && t.targetId && !t.completed).map(t => t.targetId);
        const completedTargetIds = dailyTargetsData.targets.filter(t => t && t.targetId && t.completed).map(t => t.targetId);

        console.log(`[loadDailyTargets] Pending: ${pendingTargetIds.length}, Completed: ${completedTargetIds.length}`);

        const allTargetIds = [...pendingTargetIds, ...completedTargetIds];
        if (allTargetIds.length === 0) {
            document.getElementById("dailyTargets").innerHTML = "<p>Nenhum alvo de oração para hoje.</p>";
            displayRandomVerse();
            return;
        }

        // Busca detalhes dos alvos nas listas locais (ativos e arquivados)
        const allTargetsLocal = [...prayerTargets, ...archivedTargets]; // Combina para busca
        const targetsToDisplayDetails = allTargetsLocal.filter(t => t && t.id && allTargetIds.includes(t.id));

        // Separa detalhes dos pendentes e concluídos
        const pendingTargetsDetails = targetsToDisplayDetails.filter(t => pendingTargetIds.includes(t.id));
        const completedTargetsDetails = targetsToDisplayDetails.filter(t => completedTargetIds.includes(t.id));

        renderDailyTargets(pendingTargetsDetails, completedTargetsDetails);
        displayRandomVerse();

    } catch (error) {
        console.error("[loadDailyTargets] General error loading daily targets:", error);
        document.getElementById("dailyTargets").innerHTML = "<p>Erro ao carregar alvos diários. Tente recarregar a página.</p>";
    }
}

async function generateDailyTargets(userId, dateStr) { // dateStr is YYYY-MM-DD UTC
    try {
        // Usa a lista local de alvos ativos (já reidratada)
        const availableTargets = prayerTargets.filter(t => t && t.id && !t.archived); // Garante que só pega ativos

        if (availableTargets.length === 0) {
            console.log("[generateDailyTargets] No active targets found to generate daily list.");
            return { userId, date: dateStr, targets: [] };
        }

        // Busca alvos concluídos no dia anterior para exclusão do pool inicial
        const todayUTC = createUTCDate(dateStr);
        if (!todayUTC) throw new Error("Could not parse today's date string.");

        const yesterdayUTC = new Date(todayUTC.getTime() - 24 * 60 * 60 * 1000);
        const yesterdayStr = formatDateToISO(yesterdayUTC);
        const yesterdayDocId = `${userId}_${yesterdayStr}`;
        const yesterdayRef = doc(db, "dailyPrayerTargets", yesterdayDocId);
        let completedYesterdayIds = new Set(); // Usar Set para eficiência

        try {
            const yesterdaySnap = await getDoc(yesterdayRef);
            if (yesterdaySnap.exists()) {
                const yesterdayData = yesterdaySnap.data();
                if (yesterdayData && Array.isArray(yesterdayData.targets)) {
                    yesterdayData.targets.forEach(t => {
                        if (t && t.targetId && t.completed) completedYesterdayIds.add(t.targetId);
                    });
                }
            }
        } catch (error) {
            console.warn("[generateDailyTargets] Error fetching previous day's targets:", error);
        }

        // Cria o pool inicial: todos os ativos que NÃO foram concluídos ontem
        let pool = availableTargets.filter(target => !completedYesterdayIds.has(target.id));

        // Lógica de Reinício do Ciclo: Se o pool ficou vazio E todos os ativos foram concluídos ontem
        if (pool.length === 0 && availableTargets.length > 0 && availableTargets.every(t => completedYesterdayIds.has(t.id))) {
             console.log("[generateDailyTargets] All active targets completed the cycle. Restarting with all actives.");
             pool = [...availableTargets]; // Reinicia o pool com todos os ativos
        } else if (pool.length === 0) {
             console.log("[generateDailyTargets] No available targets in the pool for today (either none exist or all were completed yesterday and cycle not complete).");
             return { userId, date: dateStr, targets: [] }; // Nenhum alvo para hoje
        }

        // Embaralha o pool e seleciona até 10
        const shuffledPool = pool.sort(() => 0.5 - Math.random());
        const selectedTargets = shuffledPool.slice(0, 10); // Pega no máximo 10

        // Mapeia para o formato do Firestore
        const targetsForFirestore = selectedTargets.map(target => ({
            targetId: target.id,
            completed: false
        }));

        // Opcional: Atualiza 'lastPresentedDate' nos alvos selecionados
        await updateLastPresentedDates(userId, selectedTargets);

        console.log(`[generateDailyTargets] Generated ${targetsForFirestore.length} daily targets for ${userId} on ${dateStr}.`);
        return { userId, date: dateStr, targets: targetsForFirestore };

    } catch (error) {
        console.error("[generateDailyTargets] Error generating daily targets:", error);
        // Retorna estrutura válida vazia em caso de erro grave
        return { userId, date: dateStr, targets: [] };
    }
}

async function updateLastPresentedDates(userId, selectedTargets) {
    if (!selectedTargets || selectedTargets.length === 0) return;
    const batch = writeBatch(db);
    const nowTimestamp = Timestamp.fromDate(new Date());
    selectedTargets.forEach(target => {
        if (target && target.id) {
            // Atualiza apenas em 'prayerTargets' (ativos)
            const targetRef = doc(db, "users", userId, "prayerTargets", target.id);
            batch.update(targetRef, { lastPresentedDate: nowTimestamp });

            // Atualiza também no estado local para consistência imediata
            const localTargetIndex = prayerTargets.findIndex(t => t.id === target.id);
            if (localTargetIndex !== -1) {
                prayerTargets[localTargetIndex].lastPresentedDate = nowTimestamp.toDate();
            }
        }
    });
    try {
        await batch.commit();
        console.log(`[updateLastPresentedDates] Updated lastPresentedDate for ${selectedTargets.length} targets.`);
    } catch (error) {
        // Não trava a aplicação se isso falhar, mas loga o erro
        console.error("[updateLastPresentedDates] Error updating lastPresentedDate:", error);
    }
}

function renderDailyTargets(pendingTargets, completedTargets) {
    const dailyTargetsDiv = document.getElementById("dailyTargets");
    dailyTargetsDiv.innerHTML = ''; // Limpa antes de renderizar

    if (pendingTargets.length === 0 && completedTargets.length === 0) {
        dailyTargetsDiv.innerHTML = "<p style='text-align: center; color: #777;'>Nenhum alvo de oração selecionado para hoje.</p>";
        return;
    }

    // Renderiza Pendentes
    pendingTargets.forEach((target) => {
        if (!target || !target.id) return; // Segurança extra
        const dailyDiv = createTargetElement(target, false); // Cria elemento (não completado)
        addPrayButtonFunctionality(dailyDiv, target.id); // Adiciona botão "Orei!"
        dailyTargetsDiv.appendChild(dailyDiv);
    });

    // Separador e Título para Concluídos (se houver)
    if (completedTargets.length > 0) {
        if (pendingTargets.length > 0) { // Adiciona separador só se tinha pendentes
             const separator = document.createElement('hr');
             separator.style.borderColor = '#eee';
             separator.style.margin = '20px 0';
             dailyTargetsDiv.appendChild(separator);
        }
         const completedTitle = document.createElement('h3');
         completedTitle.textContent = "Concluídos Hoje";
         completedTitle.style.cssText = 'text-align:center; color:#777; font-size:1.1em; margin-top:15px; margin-bottom: 10px;';
         dailyTargetsDiv.appendChild(completedTitle);

        // Renderiza Concluídos
        completedTargets.forEach((target) => {
             if (!target || !target.id) return; // Segurança
            const dailyDiv = createTargetElement(target, true); // Cria elemento (completado)
            // Não adiciona botão "Orei!" para os já concluídos
            dailyTargetsDiv.appendChild(dailyDiv);
        });
    }

    // Mostra popup de conclusão se TODOS os alvos do dia foram concluídos
    if (pendingTargets.length === 0 && (completedTargets.length > 0)) {
        // Verifica se a popup já foi mostrada hoje (usando localStorage, por exemplo)
        const todayStr = formatDateToISO(new Date());
        if (localStorage.getItem('completionPopupShown') !== todayStr) {
             displayCompletionPopup();
             localStorage.setItem('completionPopupShown', todayStr); // Marca como mostrada
         }
    }
}

// Cria o elemento HTML para um alvo (usado em Alvos Diários)
function createTargetElement(target, isCompleted) {
    const dailyDiv = document.createElement("div");
    dailyDiv.classList.add("target"); // Classe base
    if (isCompleted) dailyDiv.classList.add("completed-target"); // Classe se concluído
    dailyDiv.dataset.targetId = target.id; // Guarda ID

    // Tag de Prazo (se aplicável)
    const deadlineTag = target.hasDeadline && target.deadlineDate instanceof Date
        ? `<span class="deadline-tag ${isDateExpired(target.deadlineDate) ? 'expired' : ''} ${isCompleted ? 'completed' : ''}" style="font-size: 0.8em;">Prazo: ${formatDateForDisplay(target.deadlineDate)}</span>`
        : '';

    // Observações (renderiza sem links "Ver mais/menos" aqui)
    const observationsHTML = renderObservations(target.observations || [], true, null); // Força expansão, ID null

    // Monta HTML interno
    dailyDiv.innerHTML = `
        <h3 style="display: flex; align-items: center; flex-wrap: wrap; gap: 5px;">
            ${deadlineTag}
            <span style="flex-grow: 1;">${target.title || 'Título Indisponível'}</span>
        </h3>
        <p>${target.details || '<i>Detalhes Indisponíveis</i>'}</p>
        <p><small><strong>Criado em:</strong> ${formatDateForDisplay(target.date)} | <strong>Tempo:</strong> ${timeElapsed(target.date)}</small></p>
        ${observationsHTML}
    `;
    return dailyDiv;
}

// Adiciona botão "Orei!" e sua funcionalidade
function addPrayButtonFunctionality(dailyDiv, targetId) {
    const prayButton = document.createElement("button");
    prayButton.textContent = "Orei!";
    prayButton.classList.add("pray-button", "btn"); // Adiciona classe 'btn' para estilo base
    prayButton.style.cssText = `
        position: absolute;
        top: 10px; /* Ajuste conforme necessário */
        right: 10px; /* Ajuste conforme necessário */
        padding: 8px 12px;
        font-size: 1em; /* Tamanho do botão */
        /* Estilos do botão 'Orei!' definidos em styles.css serão aplicados */
    `;
    dailyDiv.style.position = 'relative'; // Necessário para posicionar o botão absoluto

    prayButton.onclick = async () => {
        const user = auth.currentUser;
        if (!user) { alert("Erro: Usuário não autenticado."); return; }
        const userId = user.uid;
        const todayStr = formatDateToISO(new Date());
        const dailyDocId = `${userId}_${todayStr}`;
        const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);

        prayButton.disabled = true; // Desabilita enquanto processa
        prayButton.textContent = "Orado!";
        prayButton.style.backgroundColor = '#aaa'; // Cinza enquanto desabilitado

        try {
            const dailySnap = await getDoc(dailyRef);
            if (!dailySnap.exists()) {
                 throw new Error("Documento diário não encontrado ao marcar 'Orei!'.");
             }
            const dailyData = dailySnap.data();
            let targetUpdated = false;
            // Atualiza o status 'completed' no array de targets
            const updatedTargets = dailyData.targets.map(t => {
                if (t.targetId === targetId) {
                    if (!t.completed) { // Marca como concluído apenas se não estava
                        targetUpdated = true;
                        return { ...t, completed: true };
                    }
                }
                return t;
            });

            if (targetUpdated) {
                 await updateDoc(dailyRef, { targets: updatedTargets });
                 await updateClickCounts(userId, targetId); // Atualiza estatísticas de clique
                 loadDailyTargets(); // Re-renderiza a seção diária para mover o item
             } else {
                 console.warn(`Target ${targetId} já estava marcado como concluído ou não encontrado.`);
                 // Se não houve mudança, apenas reabilita o botão (ou mantém desabilitado)
                 prayButton.textContent = "Orado!"; // Mantém como orado
             }

        } catch (error) {
            console.error("Error registering 'Orei!':", error);
            alert("Erro ao registrar oração: " + error.message);
            // Reabilita botão em caso de erro
            prayButton.disabled = false;
            prayButton.textContent = "Orei!";
             prayButton.style.backgroundColor = ''; // Volta à cor original
        }
    };
     // Adiciona o botão ao início da div do alvo
     dailyDiv.insertBefore(prayButton, dailyDiv.firstChild);
}


async function updateClickCounts(userId, targetId) {
     const clickCountsRef = doc(db, "prayerClickCounts", targetId);
     const now = new Date();
     // Estatísticas baseadas na data/hora local do navegador
     const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
     const year = now.getFullYear().toString();
     const todayStr = formatDateToISO(now); // YYYY-MM-DD local

     try {
         // Usa setDoc com merge:true para criar ou atualizar o documento de contagem
         await setDoc(clickCountsRef, {
             targetId: targetId, // Redundante mas útil para queries
             userId: userId,     // Id do usuário dono do alvo
             totalClicks: increment(1), // Incrementa total
             lastClickTimestamp: Timestamp.fromDate(now), // Guarda timestamp do último clique
             [`monthlyClicks.${yearMonth}`]: increment(1), // Incrementa contador mensal aninhado
             [`yearlyClicks.${year}`]: increment(1),     // Incrementa contador anual aninhado
             [`dailyClicks.${todayStr}`]: increment(1)      // Incrementa contador diário aninhado
         }, { merge: true }); // merge:true é crucial aqui

         console.log(`[updateClickCounts] Click count updated for target ${targetId}.`);
     } catch (error) {
         console.error(`[updateClickCounts] Error updating click count for target ${targetId}:`, error);
         // Não trava a aplicação, mas registra o erro
     }
 }


// --- Perseverança ---
async function loadPerseveranceData(userId) {
     console.log(`[loadPerseveranceData] Loading for user ${userId}`);
    const perseveranceDocRef = doc(db, "perseveranceData", userId);
    try {
        const docSnap = await getDoc(perseveranceDocRef);
        if (docSnap.exists() && docSnap.data()) { // Verifica se existe e tem dados
            const data = docSnap.data();
            perseveranceData = {
                 consecutiveDays: Number(data.consecutiveDays) || 0,
                 lastInteractionDate: data.lastInteractionDate instanceof Timestamp ? data.lastInteractionDate.toDate() : null, // Converte Timestamp
                 recordDays: Number(data.recordDays) || 0
             };
        } else {
            // Se não existe, inicializa localmente (será criado no primeiro 'confirm')
            perseveranceData = { consecutiveDays: 0, lastInteractionDate: null, recordDays: 0 };
            console.log("[loadPerseveranceData] No perseverance data found, initializing locally.");
        }
        updatePerseveranceUI(); // Atualiza a UI com os dados carregados/inicializados
    } catch (error) {
        console.error("[loadPerseveranceData] Error loading perseverance data:", error);
        // Em caso de erro, reseta localmente e na UI
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

    // Verifica se a última interação NÃO foi hoje
    if (!lastInteractionUTCStart || todayUTCStart.getTime() > lastInteractionUTCStart.getTime()) {
         let isConsecutive = false;
         // Verifica se a última interação foi ontem
         if (lastInteractionUTCStart) {
             const expectedYesterdayUTCStart = new Date(todayUTCStart.getTime() - 24 * 60 * 60 * 1000);
             if (lastInteractionUTCStart.getTime() === expectedYesterdayUTCStart.getTime()) {
                 isConsecutive = true;
             }
         }

         // Atualiza dias consecutivos
         perseveranceData.consecutiveDays = isConsecutive ? (perseveranceData.consecutiveDays || 0) + 1 : 1;
         // Atualiza data da última interação para hoje (UTC start)
         perseveranceData.lastInteractionDate = todayUTCStart;
         // Atualiza recorde se necessário
         perseveranceData.recordDays = Math.max(perseveranceData.recordDays || 0, perseveranceData.consecutiveDays);

         try {
            await updatePerseveranceFirestore(userId, perseveranceData); // Salva no Firestore
            updatePerseveranceUI(); // Atualiza a UI
            alert(`Perseverança confirmada! Dias consecutivos: ${perseveranceData.consecutiveDays}. Recorde: ${perseveranceData.recordDays}`);
         } catch (error) {
              console.error("[confirmPerseverance] Error updating Firestore:", error);
              alert("Erro ao salvar dados de perseverança: " + error.message);
              // Reverter estado local em caso de erro? Ou tentar de novo? Por ora, mantém estado local atualizado.
         }
    } else {
        // Já confirmado hoje
        alert(`Perseverança já confirmada para hoje (${formatDateForDisplay(today)})!`);
    }
}

async function updatePerseveranceFirestore(userId, data) {
    const perseveranceDocRef = doc(db, "perseveranceData", userId);
    // Converte Date local para Timestamp antes de salvar
     const dataToSave = {
         consecutiveDays: data.consecutiveDays || 0,
         // Salva Timestamp ou null
         lastInteractionDate: data.lastInteractionDate instanceof Date ? Timestamp.fromDate(data.lastInteractionDate) : null,
         recordDays: data.recordDays || 0
     };
    // Usa setDoc com merge:true para criar ou atualizar
    await setDoc(perseveranceDocRef, dataToSave, { merge: true });
    console.log("[updatePerseveranceFirestore] Perseverance data saved.");
}

function updatePerseveranceUI() {
     const consecutiveDays = perseveranceData.consecutiveDays || 0;
    const targetDays = 30; // Meta de 30 dias
    const percentage = Math.min((consecutiveDays / targetDays) * 100, 100);

    const progressBar = document.getElementById('perseveranceProgressBar');
    const percentageDisplay = document.getElementById('perseverancePercentage');
    const confirmButton = document.getElementById('confirmPerseveranceButton');

    if (progressBar && percentageDisplay) {
        progressBar.style.width = `${percentage}%`;
        progressBar.textContent = ''; // Remove texto interno da barra se houver
        percentageDisplay.textContent = `${consecutiveDays}`; // Mostra número de dias
        // Atualiza cor da barra (opcional)
        if (percentage < 33) progressBar.style.backgroundColor = '#f0ad4e'; // Laranja
        else if (percentage < 66) progressBar.style.backgroundColor = '#5bc0de'; // Azul claro
        else progressBar.style.backgroundColor = '#3CB371'; // Verde (padrão)
    }

    // Desabilita/habilita botão de confirmar
     if (confirmButton) {
         const today = new Date();
         const todayUTCStartMs = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
         let lastInteractionUTCStartMs = null;
         if (perseveranceData.lastInteractionDate instanceof Date) {
             lastInteractionUTCStartMs = Date.UTC(perseveranceData.lastInteractionDate.getUTCFullYear(), perseveranceData.lastInteractionDate.getUTCMonth(), perseveranceData.lastInteractionDate.getUTCDate());
         }

         if (lastInteractionUTCStartMs === todayUTCStartMs) {
             confirmButton.disabled = true;
             confirmButton.textContent = "Confirmado Hoje";
             confirmButton.style.backgroundColor = '#aaa';
         } else {
             confirmButton.disabled = false;
             confirmButton.textContent = "Confirmar Perseverança";
             confirmButton.style.backgroundColor = ''; // Usa cor padrão do CSS
         }
     }

    updateWeeklyChart(); // Atualiza gráfico semanal
}

function resetPerseveranceUI() {
    const progressBar = document.getElementById('perseveranceProgressBar');
    const percentageDisplay = document.getElementById('perseverancePercentage');
    const confirmButton = document.getElementById('confirmPerseveranceButton');

    if (progressBar && percentageDisplay) {
        progressBar.style.width = `0%`;
        percentageDisplay.textContent = `0`; // Reseta dias
        progressBar.style.backgroundColor = '#3CB371'; // Cor padrão
    }
    if (confirmButton) {
        confirmButton.disabled = false; // Habilita botão por padrão (onAuthStateChanged cuida se não logado)
        confirmButton.textContent = "Confirmar Perseverança";
        confirmButton.style.backgroundColor = '';
    }
    resetWeeklyChart();
}

function updateWeeklyChart() {
    const today = new Date();
    const todayUTCStartMs = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    let lastInteractionUTCStartMs = null;

    if (perseveranceData.lastInteractionDate instanceof Date && !isNaN(perseveranceData.lastInteractionDate)) {
        const li = perseveranceData.lastInteractionDate;
        lastInteractionUTCStartMs = Date.UTC(li.getUTCFullYear(), li.getUTCMonth(), li.getUTCDate());
    }

    const consecutiveDays = perseveranceData.consecutiveDays || 0;

    for (let i = 0; i < 7; i++) { // Itera pelos últimos 7 dias (0 = hoje, 1 = ontem, ...)
        const dayToCheck = new Date(today);
        dayToCheck.setUTCDate(today.getUTCDate() - i); // Define o dia para verificar (em UTC)
        const dayUTCStartMs = Date.UTC(dayToCheck.getUTCFullYear(), dayToCheck.getUTCMonth(), dayToCheck.getUTCDate());

        // Obtém o elemento do dia da semana (0=Dom, 1=Seg, ...) LOCAL
        const dayOfWeek = dayToCheck.getDay(); // Usa getDay() para mapear corretamente para o ID do elemento
        const dayTick = document.getElementById(`day-${dayOfWeek}`);

        if (dayTick) {
            // Verifica se houve interação NESSE dia específico da semana nos últimos 'consecutiveDays'
             // A lógica aqui precisa ser mais robusta. A forma simples é marcar apenas o último dia.
             // Para marcar a sequência, precisaríamos buscar o histórico ou assumir que a sequência é válida.
             // Vamos manter a lógica simples: marcar ATIVO se for o último dia de interação.

             if (lastInteractionUTCStartMs !== null && dayUTCStartMs === lastInteractionUTCStartMs) {
                dayTick.classList.add('active');
             } else {
                 dayTick.classList.remove('active');
             }

             // Lógica alternativa (experimental) para marcar sequência:
             // const daysAgo = (todayUTCStartMs - dayUTCStartMs) / (24*60*60*1000);
             // if (lastInteractionUTCStartMs === todayUTCStartMs && daysAgo < consecutiveDays) {
             //     dayTick.classList.add('active'); // Marca se hoje teve interação e o dia está dentro da sequência
             // } else {
             //      dayTick.classList.remove('active');
             // }
        }
    }
}


function resetWeeklyChart() {
    for (let i = 0; i < 7; i++) {
        document.getElementById(`day-${i}`)?.classList.remove('active');
    }
}

// --- Visualizações e Filtros ---

// **Função generateViewHTML ATUALIZADA para usar prayerTargets e incluir CSS**
function generateViewHTML(targetsToInclude = prayerTargets) { // <-- USA prayerTargets por padrão
    console.log(`[generateViewHTML] Generating view for ${targetsToInclude.length} active targets.`);

    // =======================================================================
    // ==== INÍCIO: COPIE O CSS DO SEU ARQUIVO visualizacao_geral_exemplo.html AQUI ====
    // =======================================================================
    const cssStyles = `
        <style>
            /* ================================================= */
            /* === COLOQUE O SEU CSS DA VISUALIZAÇÃO AQUI === */
            /* Exemplo básico: */
            body { font-family: sans-serif; margin: 20px; background-color: #f8f8f8; color: #333; }
            .view-container { max-width: 900px; margin: auto; background: white; padding: 20px; box-shadow: 0 0 10px rgba(0,0,0,0.1); border-radius: 8px; }
            h1 { text-align: center; color: #654321; border-bottom: 2px solid #e29420; padding-bottom: 10px; }
            .quote { text-align: center; font-style: italic; color: #777; margin-bottom: 25px; }
            .target { border: 1px solid #ddd; padding: 15px; margin-bottom: 15px; border-radius: 5px; background-color: #fff; position: relative; }
            .target h3 { margin-top: 0; color: #654321; display: flex; align-items: center; flex-wrap: wrap; gap: 10px;}
            .target p { margin: 5px 0; line-height: 1.5; }
            .deadline-tag { background-color: #f9c784; color: #333; padding: 3px 8px; border-radius: 4px; font-size: 0.8em; font-weight: bold; }
            .deadline-tag.expired { background-color: #d9534f; color: white; }
            .observations { margin-top: 10px; padding-top: 10px; border-top: 1px dashed #eee; }
            .observations h4 { margin-bottom: 5px; color: #555; }
            .observations p { font-size: 0.95em; color: #444; margin-left: 15px; }
            .observations strong { color: #0056b3; } /* Data da observação */
            .no-targets { text-align: center; color: #888; font-size: 1.1em; padding: 30px; }
            hr { border: none; border-top: 1px solid #eee; margin: 25px 0; }
             /* Adapte ou substitua completamente pelo seu CSS */
            /* ================================================= */
        </style>
    `;
    // =======================================================================
    // ==== FIM: CSS ====
    // =======================================================================

    let viewHTML = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Visualização Geral - Alvos de Oração Ativos</title>
            ${cssStyles}
        </head>
        <body>
            <div class="view-container">
                <h1>Meus Alvos de Oração Ativos</h1>
                <p class="quote">“Orai sem cessar.” - 1 Tessalonicenses 5:17</p>
    `;

    // Filtra apenas os ativos (redundante se targetsToInclude já for prayerTargets, mas seguro)
    const activeTargets = targetsToInclude.filter(t => t && t.id && !t.archived);

    if (activeTargets.length === 0) {
        console.log("[generateViewHTML] No active targets to display.");
        viewHTML += "<p class='no-targets'>Nenhum alvo de oração ativo para exibir.</p>";
    } else {
        // Ordena por data de criação descendente (mais recente primeiro) para a visualização
        activeTargets.sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));

        activeTargets.forEach(target => {
            viewHTML += generateTargetViewHTML(target, true); // Chama helper, FORÇA observações expandidas
        });
    }

    viewHTML += `
            </div>
        </body>
        </html>
    `;

    // Abrir em nova aba
    try {
        const viewTab = window.open('', '_blank');
        if (viewTab) {
            viewTab.document.write(viewHTML);
            viewTab.document.close(); // Importante para finalizar carregamento
            console.log("[generateViewHTML] View generated successfully in new tab.");
        } else {
            console.error("[generateViewHTML] Failed to open new tab (popup blocked?).");
            alert('Não foi possível abrir a nova aba. Verifique se o seu navegador está bloqueando pop-ups e tente novamente.');
        }
    } catch (error) {
        console.error("[generateViewHTML] Error opening or writing to new tab:", error);
        alert('Ocorreu um erro ao gerar a visualização: ' + error.message);
    }
}


// **Função generateTargetViewHTML ATUALIZADA para receber parâmetro de expansão**
function generateTargetViewHTML(target, forceExpandObservations = false) {
     if (!target || !target.id) return ''; // Retorna string vazia se alvo inválido

     const formattedDate = formatDateForDisplay(target.date);
     const elapsed = timeElapsed(target.date);
     let deadlineTag = '';
     // Verifica se tem prazo E se a data é válida
     if (target.hasDeadline && target.deadlineDate instanceof Date && !isNaN(target.deadlineDate)) {
         const formattedDeadline = formatDateForDisplay(target.deadlineDate);
         const expired = isDateExpired(target.deadlineDate); // isDateExpired já espera Date
         deadlineTag = `<span class="deadline-tag ${expired ? 'expired' : ''}">Prazo: ${formattedDeadline}</span>`;
     }
     const observations = Array.isArray(target.observations) ? target.observations : [];
     // Renderiza observações: Usa o parâmetro forceExpandObservations e passa ID=null
     const observationsHTML = renderObservations(observations, forceExpandObservations, null);

     // Monta o HTML do alvo
     return `
         <div class="target">
             <h3>${deadlineTag} ${target.title || 'Sem Título'}</h3>
             <p>${target.details || '<i>Sem Detalhes</i>'}</p>
             <p><small><strong>Data Criação:</strong> ${formattedDate} | <strong>Tempo Decorrido:</strong> ${elapsed}</small></p>
             ${observationsHTML}
         </div>
     `;
}


function generateDailyViewHTML() {
    let viewHTML = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <title>Visualização - Alvos do Dia</title>
            <style>
                /* CSS Básico para a visualização diária (similar ao generateViewHTML) */
                body { font-family: sans-serif; margin: 20px; background-color: #f8f8f8; color: #333; }
                .view-container { max-width: 900px; margin: auto; background: white; padding: 20px; box-shadow: 0 0 10px rgba(0,0,0,0.1); border-radius: 8px; }
                h1, h2 { text-align: center; color: #654321; }
                h1 { border-bottom: 2px solid #e29420; padding-bottom: 10px; }
                h2 { margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px; }
                .target { border: 1px solid #ddd; padding: 15px; margin-bottom: 15px; border-radius: 5px; background-color: #fff; position: relative; }
                .target.completed-target { border-left: 5px solid #9cbe4a; background-color: #f9fff0; } /* Estilo concluído */
                .target h3 { margin-top: 0; color: #654321; display: flex; align-items: center; flex-wrap: wrap; gap: 10px;}
                .target p { margin: 5px 0; line-height: 1.5; }
                .deadline-tag { background-color: #f9c784; color: #333; padding: 3px 8px; border-radius: 4px; font-size: 0.8em; font-weight: bold; }
                .deadline-tag.expired { background-color: #d9534f; color: white; }
                .observations { margin-top: 10px; padding-top: 10px; border-top: 1px dashed #eee; }
                .observations h4 { margin-bottom: 5px; color: #555; }
                .observations p { font-size: 0.95em; color: #444; margin-left: 15px; }
                .observations strong { color: #0056b3; }
                .no-targets { text-align: center; color: #888; padding: 20px; }
            </style>
        </head>
        <body>
            <div class="view-container">
                <h1>Alvos de Oração do Dia (${formatDateForDisplay(new Date())})</h1>
    `;

    const dailyTargetsDiv = document.getElementById('dailyTargets');
    let pendingCount = 0;
    let completedCount = 0;
    const allTargetsLocal = [...prayerTargets, ...archivedTargets]; // Busca em ambos

    if (dailyTargetsDiv) {
        viewHTML += `<h2>Pendentes</h2>`;
        const pendingDivs = dailyTargetsDiv.querySelectorAll('.target:not(.completed-target)');
        pendingDivs.forEach(div => {
            const targetId = div.dataset.targetId;
            const targetData = allTargetsLocal.find(t => t.id === targetId);
            if (targetData) {
                pendingCount++;
                viewHTML += generateTargetViewHTML(targetData, true); // Força expansão
            }
        });
        if (pendingCount === 0) viewHTML += "<p class='no-targets'>Nenhum alvo pendente.</p>";

        viewHTML += `<h2>Concluídos Hoje</h2>`;
        const completedDivs = dailyTargetsDiv.querySelectorAll('.target.completed-target');
        completedDivs.forEach(div => {
             const targetId = div.dataset.targetId;
             const targetData = allTargetsLocal.find(t => t.id === targetId);
             if (targetData) {
                 completedCount++;
                 // Adiciona classe completed ao gerar HTML estático
                 let targetHTML = generateTargetViewHTML(targetData, true);
                 // Adiciona a classe manualmente se a função auxiliar não o fizer
                 targetHTML = targetHTML.replace('<div class="target">', '<div class="target completed-target">');
                 viewHTML += targetHTML;
             }
        });
        if (completedCount === 0) viewHTML += "<p class='no-targets'>Nenhum alvo concluído hoje.</p>";
    } else {
        viewHTML += "<p class='no-targets'>Erro: Seção de alvos diários não encontrada na página.</p>";
    }

    viewHTML += `
            </div>
        </body>
        </html>
    `;
     // Open tab logic
     try {
        const viewTab = window.open('', '_blank');
        if (viewTab) { viewTab.document.write(viewHTML); viewTab.document.close(); }
        else { alert('Não foi possível abrir a nova aba. Verifique bloqueadores de pop-up.'); }
    } catch(error) {
        alert('Erro ao gerar visualização diária: ' + error.message);
    }
}

// Gera HTML para visualização de Respondidos (com filtros de data)
async function generateResolvedViewHTML(startDate, endDate) { // Recebe Date objects
    const user = auth.currentUser;
    if (!user) { alert("Você precisa estar logado."); return; }
    const uid = user.uid;

    // Converte datas locais para Timestamps UTC para a query
    const startUTC = new Date(Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()));
    const endNextDay = new Date(endDate);
    endNextDay.setUTCDate(endDate.getUTCDate() + 1); // Dia seguinte para limite superior
    const endUTCStartOfNextDay = new Date(Date.UTC(endNextDay.getFullYear(), endNextDay.getMonth(), endNextDay.getUTCDate()));

    const startTimestamp = Timestamp.fromDate(startUTC);
    const endTimestamp = Timestamp.fromDate(endUTCStartOfNextDay);

    const archivedRef = collection(db, "users", uid, "archivedTargets");
    const q = query(archivedRef,
                    where("resolved", "==", true),
                    where("resolutionDate", ">=", startTimestamp), // Maior ou igual ao início do dia de início
                    where("resolutionDate", "<", endTimestamp),   // Menor que o início do dia seguinte ao fim
                    orderBy("resolutionDate", "desc")); // Ordena por data de resolução

    let filteredResolvedTargets = [];
    try {
        const querySnapshot = await getDocs(q);
        const rawTargets = querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        filteredResolvedTargets = rehydrateTargets(rawTargets); // Reidrata
    } catch (error) {
        console.error("Error fetching resolved targets for view:", error);
        alert("Erro ao buscar alvos respondidos no período selecionado."); return;
    }

    // Monta o HTML
    let viewHTML = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <title>Visualização - Alvos Respondidos</title>
            <style>
                /* CSS similar ao generateViewHTML, ajuste conforme necessário */
                body { font-family: sans-serif; margin: 20px; background-color: #f8f8f8; color: #333; }
                .view-container { max-width: 900px; margin: auto; background: white; padding: 20px; box-shadow: 0 0 10px rgba(0,0,0,0.1); border-radius: 8px; }
                h1 { text-align: center; color: #654321; border-bottom: 2px solid #e29420; padding-bottom: 10px; }
                h2 { text-align: center; color: #777; font-size: 1.1em; margin-bottom: 25px; }
                .target { border: 1px solid #ddd; padding: 15px; margin-bottom: 15px; border-radius: 5px; background-color: #eaffea; border-left: 5px solid #9cbe4a; } /* Estilo respondido */
                .target h3 { margin-top: 0; color: #3c763d; } /* Verde escuro para título respondido */
                .target p { margin: 5px 0; line-height: 1.5; }
                .observations { margin-top: 10px; padding-top: 10px; border-top: 1px dashed #ccc; }
                .observations h4 { margin-bottom: 5px; color: #555; }
                .observations p { font-size: 0.95em; color: #444; margin-left: 15px; }
                .observations strong { color: #0056b3; }
                .no-targets { text-align: center; color: #888; font-size: 1.1em; padding: 30px; }
            </style>
        </head>
        <body>
            <div class="view-container">
                <h1>Alvos de Oração Respondidos</h1>
                <h2>Período: ${formatDateForDisplay(startDate)} a ${formatDateForDisplay(endDate)}</h2>
    `;

     if (filteredResolvedTargets.length === 0) {
         viewHTML += "<p class='no-targets'>Nenhum alvo respondido encontrado neste período.</p>";
     } else {
        filteredResolvedTargets.forEach(target => {
            // Reusa a função auxiliar, mas poderia ter uma específica para resolvidos se necessário
            viewHTML += generateTargetViewHTMLForResolved(target); // Usa helper específico
        });
    }
    viewHTML += `
            </div>
        </body>
        </html>
    `;
    // Open tab logic
    try {
        const viewTab = window.open('', '_blank');
        if (viewTab) { viewTab.document.write(viewHTML); viewTab.document.close(); }
        else { alert('Não foi possível abrir a nova aba. Verifique bloqueadores de pop-up.'); }
     } catch(error) {
         alert('Erro ao gerar visualização de respondidos: ' + error.message);
     }
}

// Helper específico para gerar HTML de alvos na visualização de Respondidos
function generateTargetViewHTMLForResolved(target) {
     if (!target || !target.id) return '';
     const formattedResolutionDate = target.resolutionDate ? formatDateForDisplay(target.resolutionDate) : 'Data Indisponível';
     const formattedCreationDate = formatDateForDisplay(target.date);
     let totalTime = 'N/A';
     if (target.date instanceof Date && target.resolutionDate instanceof Date) {
         let diffInSeconds = Math.floor((target.resolutionDate.getTime() - target.date.getTime()) / 1000);
         if (diffInSeconds < 0) diffInSeconds = 0;
         // Formatação simples de tempo total
         if (diffInSeconds < 60) totalTime = `${diffInSeconds} seg`;
         else if (diffInSeconds < 3600) totalTime = `${Math.floor(diffInSeconds / 60)} min`;
         else if (diffInSeconds < 86400) totalTime = `${Math.floor(diffInSeconds / 3600)} hr`;
         else totalTime = `${Math.floor(diffInSeconds / 86400)} dias`;
     }
     const observations = Array.isArray(target.observations) ? target.observations : [];
     const observationsHTML = renderObservations(observations, true, null); // Força expansão, ID null

     return `
         <div class="target resolved">
             <h3>${target.title || 'Sem Título'}</h3>
             <p>${target.details || '<i>Sem Detalhes</i>'}</p>
             <p><small><strong>Criado:</strong> ${formattedCreationDate} | <strong>Respondido:</strong> ${formattedResolutionDate} | <strong>Tempo:</strong> ${totalTime}</small></p>
             ${observationsHTML}
         </div>
     `;
}

// Filtra alvos por termo de busca (título, detalhes, observações)
function filterTargets(targets, searchTerm) {
    if (!searchTerm) return targets;
    const lowerSearchTerm = searchTerm.toLowerCase();
    return targets.filter(target => {
         if (!target) return false; // Ignora alvos inválidos
         const titleMatch = target.title && target.title.toLowerCase().includes(lowerSearchTerm);
         const detailsMatch = target.details && target.details.toLowerCase().includes(lowerSearchTerm);
         // Busca também nas observações
         const observationMatch = Array.isArray(target.observations) &&
              target.observations.some(obs => obs && obs.text && obs.text.toLowerCase().includes(lowerSearchTerm));
        return titleMatch || detailsMatch || observationMatch;
    });
}

// Handlers para inputs de busca
function handleSearchMain(event) { currentSearchTermMain = event.target.value; currentPage = 1; renderTargets(); }
function handleSearchArchived(event) { currentSearchTermArchived = event.target.value; currentArchivedPage = 1; renderArchivedTargets(); }
function handleSearchResolved(event) { currentSearchTermResolved = event.target.value; currentResolvedPage = 1; renderResolvedTargets(); }

// Mostra o painel correto e esconde os outros
function showPanel(panelIdToShow) {
    const allPanels = ['appContent', 'dailySection', 'mainPanel', 'archivedPanel', 'resolvedPanel'];
    const headerElements = ['weeklyPerseveranceChart', 'perseveranceSection'];
    const separators = ['sectionSeparator'];

    // Esconde todos os painéis principais e separadores
    allPanels.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    separators.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
     // Esconde elementos do cabeçalho por padrão
     headerElements.forEach(id => {
         const el = document.getElementById(id);
         if (el) el.style.display = 'none';
     });

    // Mostra o painel solicitado
    const panelToShowElement = document.getElementById(panelIdToShow);
    if (panelToShowElement) {
        panelToShowElement.style.display = 'block';
    } else {
        console.error(`Panel with ID ${panelIdToShow} not found.`);
        // Mostra painel padrão (dailySection) como fallback
        document.getElementById('dailySection').style.display = 'block';
        panelIdToShow = 'dailySection';
    }


    // Mostra elementos relacionados SE estiver mostrando dailySection
    if (panelIdToShow === 'dailySection') {
        headerElements.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'block';
        });
        document.getElementById('sectionSeparator').style.display = 'block';
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
        popup.style.display = 'flex'; // Usa flex para centralizar conteúdo
        const popupVerseElement = popup.querySelector('#popupVerse');
        if (popupVerseElement) {
            const randomIndex = Math.floor(Math.random() * verses.length);
            popupVerseElement.textContent = verses[randomIndex];
        }
        // Fecha popup após alguns segundos (opcional)
        // setTimeout(() => {
        //     if (popup.style.display === 'flex') popup.style.display = 'none';
        // }, 5000); // Fecha após 5 segundos
    }
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("[DOMContentLoaded] DOM fully loaded. Setting up listeners.");
    // Define data padrão no formulário
    try {
        const dateInput = document.getElementById('date');
        if (dateInput) dateInput.value = formatDateToISO(new Date());
    } catch (e) { console.error("Error setting default date:", e); }

    // Listener principal de autenticação
    onAuthStateChanged(auth, (user) => loadData(user));

    // Inputs de busca
    document.getElementById('searchMain')?.addEventListener('input', handleSearchMain);
    document.getElementById('searchArchived')?.addEventListener('input', handleSearchArchived);
    document.getElementById('searchResolved')?.addEventListener('input', handleSearchResolved);

    // Checkboxes de filtro
    document.getElementById('showDeadlineOnly')?.addEventListener('change', handleDeadlineFilterChange);
    document.getElementById('showExpiredOnlyMain')?.addEventListener('change', handleExpiredOnlyMainChange);

    // Botões de Autenticação
    document.getElementById('btnEmailSignUp')?.addEventListener('click', signUpWithEmailPassword);
    document.getElementById('btnEmailSignIn')?.addEventListener('click', signInWithEmailPassword);
    document.getElementById('btnForgotPassword')?.addEventListener('click', resetPassword);
    document.getElementById('btnLogout')?.addEventListener('click', () => signOut(auth));

    // Botões de Ação Principal
    document.getElementById('confirmPerseveranceButton')?.addEventListener('click', confirmPerseverance);
    document.getElementById("viewReportButton")?.addEventListener('click', () => window.location.href = 'orei.html');
    document.getElementById("refreshDaily")?.addEventListener("click", async () => {
        const user = auth.currentUser;
        if (!user) { alert("Você precisa estar logado para atualizar."); return; }
        if (confirm("Atualizar a lista de alvos do dia? Novos alvos aleatórios serão selecionados.")) {
            const userId = user.uid;
            const todayStr = formatDateToISO(new Date());
            const dailyDocId = `${userId}_${todayStr}`;
            const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);
            try {
                console.log("[Refresh Daily] Generating new targets...");
                const newTargetsData = await generateDailyTargets(userId, todayStr);
                await setDoc(dailyRef, newTargetsData); // Sobrescreve lista do dia
                await loadDailyTargets(); // Recarrega e re-renderiza a seção
                alert("Alvos do dia atualizados!");
            } catch (error) {
                console.error("Error refreshing daily targets:", error);
                alert("Erro ao atualizar alvos diários: " + error.message);
            }
        }
     });
     document.getElementById("copyDaily")?.addEventListener("click", () => {
        const dailyTargetsDiv = document.getElementById('dailyTargets');
        let textToCopy = `Alvos de Oração Pendentes (${formatDateForDisplay(new Date())}):\n\n`;
        let count = 0;
        if (!dailyTargetsDiv) return;
        const targetDivs = dailyTargetsDiv.querySelectorAll('.target:not(.completed-target)'); // Apenas pendentes
        targetDivs.forEach((div) => {
            const titleElement = div.querySelector('h3 span'); // Pega o span dentro do h3
            const titleText = titleElement ? titleElement.textContent.trim() : 'Sem Título';
            const detailsElement = div.querySelector('p:nth-of-type(1)'); // Primeiro parágrafo como detalhes
            const detailsText = detailsElement ? detailsElement.textContent.trim() : 'Sem Detalhes';
            count++;
            textToCopy += `${count}. ${titleText}\n   ${detailsText || ''}\n\n`;
        });
        if (count > 0) {
            navigator.clipboard.writeText(textToCopy.trim())
               .then(() => alert(`${count} alvo(s) pendente(s) copiados para a área de transferência!`))
               .catch(err => {
                   console.error('Falha ao copiar:', err);
                   prompt("Falha ao copiar automaticamente. Copie manualmente abaixo:", textToCopy.trim());
               });
        } else { alert('Nenhum alvo pendente para copiar.'); }
     });
     document.getElementById('generateViewButton')?.addEventListener('click', () => generateViewHTML()); // Usa prayerTargets
     document.getElementById('viewDaily')?.addEventListener('click', generateDailyViewHTML);
     document.getElementById("viewResolvedViewButton")?.addEventListener("click", () => {
         const modal = document.getElementById("dateRangeModal");
         if (modal) modal.style.display = "block";
         // Define datas padrão no modal (ex: último mês)
         const endDateInput = document.getElementById("endDate");
         const startDateInput = document.getElementById("startDate");
         if (endDateInput && startDateInput) {
             const today = new Date();
             endDateInput.value = formatDateToISO(today);
             const lastMonth = new Date();
             lastMonth.setMonth(today.getMonth() - 1);
             startDateInput.value = formatDateToISO(lastMonth);
         }
     });
     document.getElementById('closePopup')?.addEventListener('click', () => {
         const popup = document.getElementById('completionPopup');
         if (popup) popup.style.display = 'none';
     });

     // Botões de Navegação entre Painéis
    document.getElementById('viewAllTargetsButton')?.addEventListener('click', () => { showPanel('mainPanel'); currentPage = 1; renderTargets(); });
    document.getElementById('addNewTargetButton')?.addEventListener('click', () => showPanel('appContent'));
    document.getElementById("viewArchivedButton")?.addEventListener("click", () => { showPanel('archivedPanel'); currentArchivedPage = 1; renderArchivedTargets(); });
    document.getElementById("viewResolvedButton")?.addEventListener("click", () => { showPanel('resolvedPanel'); currentResolvedPage = 1; renderResolvedTargets(); });
    document.getElementById("backToMainButton")?.addEventListener("click", () => showPanel('dailySection')); // Volta para Alvos Diários

    // Lógica do Modal de Intervalo de Datas
    const dateRangeModal = document.getElementById("dateRangeModal");
    document.getElementById("closeDateRangeModal")?.addEventListener("click", () => { if (dateRangeModal) dateRangeModal.style.display = "none"; });
    document.getElementById("generateResolvedView")?.addEventListener("click", () => {
        const startDateValue = document.getElementById("startDate").value;
        const endDateValue = document.getElementById("endDate").value;
        if (startDateValue && endDateValue) {
            // Converte YYYY-MM-DD para Date objects (interpreta como local)
            const start = new Date(startDateValue + 'T00:00:00'); // Adiciona T00:00:00 para evitar problemas de fuso local
            const end = new Date(endDateValue + 'T00:00:00');
             if (isNaN(start.getTime()) || isNaN(end.getTime())) { alert("Datas inválidas selecionadas."); return; }
             if (start > end) { alert("A Data de Início não pode ser posterior à Data de Fim."); return; }
            generateResolvedViewHTML(start, end); // Passa objetos Date
            if (dateRangeModal) dateRangeModal.style.display = "none"; // Fecha modal
        } else { alert("Por favor, selecione as datas de início e fim."); }
    });
    document.getElementById("cancelDateRange")?.addEventListener("click", () => { if (dateRangeModal) dateRangeModal.style.display = "none"; });
    // Fecha modal se clicar fora dele
    window.addEventListener('click', (event) => { if (event.target == dateRangeModal) dateRangeModal.style.display = "none"; });

    console.log("Event listeners set up.");
});
