import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-analytics.js";
import { getAuth, signOut, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDocs, updateDoc, deleteDoc, query, where, orderBy, getDoc, addDoc, increment, Timestamp, writeBatch, runTransaction } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDnwmV7Xms2PyAZJDQQ_upjQkldoVkF_tk", // ATENÇÃO: Substitua pela sua chave real se estiver usando este código.
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
    lastInteractionDate: null, // Date of the *last day* an "Orei!" click updated the streak (armazenado como o início do dia UTC)
    recordDays: 0 // NOVO: Campo para o recorde de dias consecutivos
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

// ==== UTILITY FUNCTIONS (REESCRITAS PARA MAIOR ROBUSTEZ) ====

function getWeekIdentifier(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

// Converte um valor (Timestamp, string, Date) para um objeto Date válido ou null
function convertToDate(value) {
    if (!value) {
        return null;
    }
    if (value instanceof Timestamp) {
        return value.toDate();
    }
    if (value instanceof Date) {
        return !isNaN(value.getTime()) ? value : null;
    }
    if (typeof value === 'string') {
        const parsedDate = new Date(value);
        return !isNaN(parsedDate.getTime()) ? parsedDate : null;
    }
    return null;
}

function formatDateToISO(date) {
    const validDate = convertToDate(date);
    if (!validDate) {
        // Fallback para hoje se a data for inválida, útil para inputs de data
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    const year = validDate.getUTCFullYear();
    const month = String(validDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(validDate.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}


function formatDateForDisplay(date) {
    const validDate = convertToDate(date);
    if (!validDate) {
        return 'Data Inválida';
    }
    const day = String(validDate.getUTCDate()).padStart(2, '0');
    const month = String(validDate.getUTCMonth() + 1).padStart(2, '0');
    const year = validDate.getUTCFullYear();
    return `${day}/${month}/${year}`;
}

function timeElapsed(date) {
    const validDate = convertToDate(date);
    if (!validDate) { return 'Tempo desconhecido'; }

    const now = new Date();
    let diffInSeconds = Math.floor((now.getTime() - validDate.getTime()) / 1000);
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
    const validDate = convertToDate(date);
    if (!validDate) return false;
    const now = new Date();
    const todayUTCStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return validDate.getTime() < todayUTCStart.getTime();
}

function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 15);
}

// Rehydrates Firestore data (Timestamps to Date objects) - FUNÇÃO CRÍTICA CORRIGIDA
function rehydrateTargets(targets) {
    return targets.map(target => {
        const rehydrated = { ...target };

        // Converte todos os campos de data conhecidos
        const dateFields = ['date', 'deadlineDate', 'lastPrayedDate', 'resolutionDate', 'archivedDate', 'lastInteractionDate'];
        dateFields.forEach(field => {
            rehydrated[field] = convertToDate(rehydrated[field]);
        });

        // Garante que as observações e suas datas sejam válidas
        if (Array.isArray(rehydrated.observations)) {
            rehydrated.observations = rehydrated.observations
                .map(obs => ({
                    ...obs,
                    date: convertToDate(obs.date)
                }))
                .filter(obs => obs.date) // Remove observações com data inválida
                .sort((a, b) => b.date.getTime() - a.date.getTime());
        } else {
            rehydrated.observations = [];
        }

        return rehydrated;
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
        authStatusContainer.style.display = 'none'; 
        btnLogout.style.display = 'none';
        emailPasswordAuthForm.style.display = 'block'; 
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
        document.getElementById('appContent').style.display = 'none';
        document.getElementById('dailySection').style.display = 'block';
        document.getElementById('sectionSeparator').style.display = 'block';
        document.getElementById('mainPanel').style.display = 'none';
        document.getElementById('archivedPanel').style.display = 'none';
        document.getElementById('resolvedPanel').style.display = 'none';
        document.getElementById('weeklyPerseveranceChart').style.display = 'block';
        document.getElementById('perseveranceSection').style.display = 'block';

        try {
            await loadPerseveranceData(uid); // Carrega dados de perseverança primeiro
            await fetchPrayerTargets(uid);
            await fetchArchivedTargets(uid);
            resolvedTargets = archivedTargets.filter(target => target.resolved);
            checkExpiredDeadlines();
            renderTargets();
            renderArchivedTargets();
            renderResolvedTargets();
            await loadDailyTargets();
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
        document.getElementById('appContent').style.display = 'none';
        document.getElementById('dailySection').style.display = 'none';
        document.getElementById('sectionSeparator').style.display = 'none';
        document.getElementById('mainPanel').style.display = 'none';
        document.getElementById('archivedPanel').style.display = 'none';
        document.getElementById('resolvedPanel').style.display = 'none';
        document.getElementById('weeklyPerseveranceChart').style.display = 'none';
        document.getElementById('perseveranceSection').style.display = 'none';
        prayerTargets = []; archivedTargets = []; resolvedTargets = []; currentDailyTargets = [];
        renderTargets(); renderArchivedTargets(); renderResolvedTargets();
        document.getElementById("dailyTargets").innerHTML = "<p>Faça login para ver os alvos diários.</p>";
        document.getElementById('dailyVerses').textContent = '';
        resetPerseveranceUI(); 
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
    const archivedSnapshot = await getDocs(query(archivedRef, orderBy("date", "desc"))); 
    console.log(`[fetchArchivedTargets] Found ${archivedSnapshot.size} archived targets for user ${uid}`);
    const rawArchived = archivedSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    archivedTargets = rehydrateTargets(rawArchived);
    archivedTargets.sort((a, b) => {
        const dateA = a.archivedDate instanceof Date ? a.archivedDate.getTime() : 0;
        const dateB = b.archivedDate instanceof Date ? b.archivedDate.getTime() : 0;
        return dateB - dateA;
    });
    console.log("[fetchArchivedTargets] Rehydrated and sorted archivedTargets count:", archivedTargets.length);
}

// --- Rendering ---
function renderTargets() {
    const targetListDiv = document.getElementById('targetList');
    targetListDiv.innerHTML = '';
    let filteredAndPagedTargets = [...prayerTargets];

    if (currentSearchTermMain) filteredAndPagedTargets = filterTargets(filteredAndPagedTargets, currentSearchTermMain);
    if (showDeadlineOnly) filteredAndPagedTargets = filteredAndPagedTargets.filter(target => target.hasDeadline && target.deadlineDate);
    const showExpiredOnlyMainCheckbox = document.getElementById('showExpiredOnlyMain');
    if (showExpiredOnlyMainCheckbox?.checked) filteredAndPagedTargets = filteredAndPagedTargets.filter(target => target.hasDeadline && target.deadlineDate && isDateExpired(target.deadlineDate));

     if (showDeadlineOnly || showExpiredOnlyMainCheckbox?.checked) {
        filteredAndPagedTargets.sort((a, b) => {
            const dateA = a.deadlineDate ? a.deadlineDate.getTime() : Infinity;
            const dateB = b.deadlineDate ? b.deadlineDate.getTime() : Infinity;
            if (dateA !== dateB) return dateA - dateB; 
             const creationDateA = a.date ? a.date.getTime() : 0;
             const creationDateB = b.date ? b.date.getTime() : 0;
             return creationDateB - creationDateA; 
        });
    } else {
        filteredAndPagedTargets.sort((a, b) => {
             const creationDateA = a.date ? a.date.getTime() : 0;
             const creationDateB = b.date ? b.date.getTime() : 0;
             return creationDateB - creationDateA;
         });
    }

    const startIndex = (currentPage - 1) * targetsPerPage;
    const endIndex = startIndex + targetsPerPage;
    const targetsToDisplay = filteredAndPagedTargets.slice(startIndex, endIndex);
    lastDisplayedTargets = targetsToDisplay; 

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
                <p class="target-details">${target.details || 'Sem Detalhes'}</p>
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
            renderObservationForm(target.id); 
        });
    }
    renderPagination('mainPanel', currentPage, filteredAndPagedTargets);
}

function renderArchivedTargets() {
    const archivedListDiv = document.getElementById('archivedList');
    archivedListDiv.innerHTML = '';
    let filteredAndPagedArchived = [...archivedTargets]; 

    if (currentSearchTermArchived) filteredAndPagedArchived = filterTargets(filteredAndPagedArchived, currentSearchTermArchived);

    const startIndex = (currentArchivedPage - 1) * targetsPerPage;
    const endIndex = startIndex + targetsPerPage;
    const targetsToDisplay = filteredAndPagedArchived.slice(startIndex, endIndex);

    if (targetsToDisplay.length === 0) {
        if (filteredAndPagedArchived.length > 0 && currentArchivedPage > 1) {
             currentArchivedPage = 1; renderArchivedTargets(); return;
        } else archivedListDiv.innerHTML = '<p>Nenhum alvo arquivado encontrado.</p>';
    } else {
        targetsToDisplay.forEach((target) => {
             if (!target || !target.id) return;
            const archivedDiv = document.createElement("div");
            archivedDiv.classList.add("target", "archived");
            if (target.resolved) archivedDiv.classList.add("resolved"); 
            archivedDiv.dataset.targetId = target.id;

            const formattedCreationDate = formatDateForDisplay(target.date);
            const formattedArchivedDate = target.archivedDate ? formatDateForDisplay(target.archivedDate) : 'N/A';
            const elapsedCreation = timeElapsed(target.date);

            let categoryTag = '';
            if (target.category) {
                categoryTag = `<span class="category-tag">${target.category}</span>`;
            }

            let resolvedTag = '';
            if (target.resolved && target.resolutionDate) {
                resolvedTag = `<span class="resolved-tag">Respondido em: ${formatDateForDisplay(target.resolutionDate)}</span>`;
            } else if (target.resolved) {
                 resolvedTag = `<span class="resolved-tag">Respondido</span>`;
            }

            const observations = Array.isArray(target.observations) ? target.observations : [];
            archivedDiv.innerHTML = `
                <h3>${categoryTag} ${resolvedTag} ${target.title || 'Sem Título'}</h3>
                <p class="target-details">${target.details || 'Sem Detalhes'}</p>
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
    let filteredAndPagedResolved = [...resolvedTargets];

    if (currentSearchTermResolved) filteredAndPagedResolved = filterTargets(filteredAndPagedResolved, currentSearchTermResolved);

    filteredAndPagedResolved.sort((a, b) => {
        const dateA = a.resolutionDate ? a.resolutionDate.getTime() : 0;
        const dateB = b.resolutionDate ? b.resolutionDate.getTime() : 0;
        return dateB - dateA; 
    });


    const startIndex = (currentResolvedPage - 1) * targetsPerPage;
    const endIndex = startIndex + targetsPerPage;
    const targetsToDisplay = filteredAndPagedResolved.slice(startIndex, endIndex);

    if (targetsToDisplay.length === 0) {
         if (filteredAndPagedResolved.length > 0 && currentResolvedPage > 1) {
             currentResolvedPage = 1; renderResolvedTargets(); return;
         } else resolvedListDiv.innerHTML = '<p>Nenhum alvo respondido encontrado.</p>';
    } else {
        targetsToDisplay.forEach((target) => {
            if (!target || !target.id) return;
            const resolvedDiv = document.createElement("div");
            resolvedDiv.classList.add("target", "resolved"); 
            resolvedDiv.dataset.targetId = target.id;

            const formattedResolutionDate = formatDateForDisplay(target.resolutionDate);
            let totalTime = 'N/A';
            if (target.date && target.resolutionDate) {
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

            let categoryTag = '';
            if (target.category) {
                categoryTag = `<span class="category-tag">${target.category}</span>`;
            }

            const observations = Array.isArray(target.observations) ? target.observations : [];
            resolvedDiv.innerHTML = `
                <h3>${categoryTag} ${target.title || 'Sem Título'} (Respondido)</h3>
                <p class="target-details">${target.details || 'Sem Detalhes'}</p>
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

    const prevLink = document.createElement('a');
    prevLink.href = '#';
    prevLink.innerHTML = '« Anterior';
    prevLink.classList.add('page-link');
    if (currentPageVariable <= 1) { prevLink.classList.add('disabled'); }
    else { prevLink.addEventListener('click', (event) => { event.preventDefault(); handlePageChange(panelId, currentPageVariable - 1); }); }
    paginationDiv.appendChild(prevLink);

    const pageIndicator = document.createElement('span');
    pageIndicator.textContent = `Página ${currentPageVariable} de ${totalPages}`;
    paginationDiv.appendChild(pageIndicator);

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

    // Usando new Date() que já considera o fuso horário local ao pegar do input type=date
    const dateLocal = new Date(dateInput + 'T00:00:00');
    if (isNaN(dateLocal.getTime())) { alert("Data de criação inválida."); return; }

    let deadlineDateLocal = null;
    if (hasDeadline) {
        if (!deadlineDateInput) { alert("Selecione o Prazo de Validade."); return; }
        deadlineDateLocal = new Date(deadlineDateInput + 'T00:00:00');
        if (isNaN(deadlineDateLocal.getTime())) { alert("Data do Prazo de Validade inválida."); return; }
        if (deadlineDateLocal.getTime() < dateLocal.getTime()) { alert("O Prazo de Validade não pode ser anterior à Data de Criação."); return; }
    }

    const target = {
        title: title,
        details: details,
        date: Timestamp.fromDate(dateLocal),
        hasDeadline: hasDeadline,
        deadlineDate: deadlineDateLocal ? Timestamp.fromDate(deadlineDateLocal) : null,
        category: category || null,
        archived: false,
        resolved: false,
        resolutionDate: null,
        observations: [],
        userId: uid,
        lastPrayedDate: null 
    };

    try {
        const docRef = await addDoc(collection(db, "users", uid, "prayerTargets"), target);
        const newLocalTarget = rehydrateTargets([{ ...target, id: docRef.id }])[0];
        prayerTargets.unshift(newLocalTarget); 
        prayerTargets.sort((a, b) => (b.date ? b.date.getTime() : 0) - (a.date ? a.date.getTime() : 0));

        document.getElementById("prayerForm").reset();
        document.getElementById('deadlineContainer').style.display = 'none';
        document.getElementById('categorySelect').value = ''; 
        document.getElementById('date').value = formatDateToISO(new Date()); 
        showPanel('mainPanel'); currentPage = 1; renderTargets(); 
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
    const resolutionDate = Timestamp.fromDate(new Date()); 
    const activeTargetRef = doc(db, "users", userId, "prayerTargets", targetId);
    const archivedTargetRef = doc(db, "users", userId, "archivedTargets", targetId);
    try {
        const archivedData = {
            ...targetData, 
            date: targetData.date ? Timestamp.fromDate(targetData.date) : null,
            deadlineDate: targetData.deadlineDate ? Timestamp.fromDate(targetData.deadlineDate) : null,
            lastPrayedDate: targetData.lastPrayedDate ? Timestamp.fromDate(targetData.lastPrayedDate) : null,
            observations: Array.isArray(targetData.observations) ? targetData.observations.map(obs => ({
                ...obs,
                date: obs.date ? Timestamp.fromDate(obs.date) : null
            })) : [],
            resolved: true,
            archived: true,
            resolutionDate: resolutionDate,
            archivedDate: resolutionDate 
         };
        delete archivedData.id; 
        
        const batch = writeBatch(db);
        batch.delete(activeTargetRef); 
        batch.set(archivedTargetRef, archivedData); 
        await batch.commit();

        prayerTargets.splice(targetIndex, 1); 
        const newArchivedLocal = rehydrateTargets([{ ...archivedData, id: targetId }])[0]; 
        archivedTargets.unshift(newArchivedLocal); 

        archivedTargets.sort((a, b) => (b.archivedDate ? b.archivedDate.getTime() : 0) - (a.archivedDate ? a.archivedDate.getTime() : 0));
        resolvedTargets = archivedTargets.filter(t => t.resolved);
        resolvedTargets.sort((a, b) => (b.resolutionDate ? b.resolutionDate.getTime() : 0) - (a.resolutionDate ? a.resolutionDate.getTime() : 0));

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
    const archiveTimestamp = Timestamp.fromDate(new Date()); 
    const activeTargetRef = doc(db, "users", userId, "prayerTargets", targetId);
    const archivedTargetRef = doc(db, "users", userId, "archivedTargets", targetId);
    try {
         const archivedData = {
            ...targetData,
             date: targetData.date ? Timestamp.fromDate(targetData.date) : null,
             deadlineDate: targetData.deadlineDate ? Timestamp.fromDate(targetData.deadlineDate) : null,
             lastPrayedDate: targetData.lastPrayedDate ? Timestamp.fromDate(targetData.lastPrayedDate) : null,
             observations: Array.isArray(targetData.observations) ? targetData.observations.map(obs => ({
                 ...obs,
                 date: obs.date ? Timestamp.fromDate(obs.date) : null
                })) : [],
             resolved: false, 
             archived: true,
             archivedDate: archiveTimestamp, 
         };
        delete archivedData.id;
        
        const batch = writeBatch(db);
        batch.delete(activeTargetRef);
        batch.set(archivedTargetRef, archivedData);
        await batch.commit();

        prayerTargets.splice(targetIndex, 1);
        const newArchivedLocal = rehydrateTargets([{ ...archivedData, id: targetId }])[0];
        archivedTargets.unshift(newArchivedLocal);
        archivedTargets.sort((a, b) => (b.archivedDate ? b.archivedDate.getTime() : 0) - (a.archivedDate ? a.archivedDate.getTime() : 0));
        resolvedTargets = archivedTargets.filter(t => t.resolved); 

        renderTargets();
        renderArchivedTargets();
        renderResolvedTargets(); 
        alert('Alvo arquivado com sucesso!');
    } catch (error) { console.error("Error archiving target: ", error); alert("Erro ao arquivar alvo: " + error.message); }
};

window.deleteArchivedTarget = async function(targetId) {
     const user = auth.currentUser; if (!user) { alert("Erro: Usuário não autenticado."); return; }
     const userId = user.uid;
     const targetTitle = archivedTargets.find(t => t.id === targetId)?.title || targetId;
     if (!confirm(`Tem certeza que deseja excluir PERMANENTEMENTE o alvo arquivado "${targetTitle}"? Esta ação não pode ser desfeita.`)) return;
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
         resolvedTargets.sort((a, b) => (b.resolutionDate ? b.resolutionDate.getTime() : 0) - (a.resolutionDate ? a.resolutionDate.getTime() : 0));

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

    const deadlineForm = document.getElementById(`editDeadlineForm-${targetId}`);
    const categoryForm = document.getElementById(`editCategoryForm-${targetId}`);
    if(deadlineForm) deadlineForm.style.display = 'none';
    if(categoryForm) categoryForm.style.display = 'none';

    formDiv.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) {
        formDiv.querySelector('textarea')?.focus();
        const dateInput = formDiv.querySelector(`#observationDate-${targetId}`);
        if (dateInput && !dateInput.value) dateInput.value = formatDateToISO(new Date());
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
    document.getElementById(`observationDate-${targetId}`).value = formatDateToISO(new Date());
}

window.saveObservation = async function(targetId) {
    const observationText = document.getElementById(`observationText-${targetId}`)?.value.trim();
    const observationDateInput = document.getElementById(`observationDate-${targetId}`)?.value;
    if (!observationText || !observationDateInput) { alert('Texto e Data da observação são obrigatórios.'); return; }
    
    const observationDateLocal = new Date(observationDateInput + 'T00:00:00');
    if (isNaN(observationDateLocal.getTime())) { alert('Data da observação inválida.'); return; }

    const user = auth.currentUser; if (!user) { alert("Erro: Usuário não autenticado."); return; }
    const userId = user.uid;
    let targetRef, targetList, targetIndex = -1, isArchived = false, isResolved = false;

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
            alert("Erro: Alvo não encontrado.");
            return;
        }
    }

    const newObservation = {
        text: observationText,
        date: Timestamp.fromDate(observationDateLocal), 
        id: generateUniqueId(), 
        targetId: targetId 
    };

    try {
        const targetDocSnap = await getDoc(targetRef);
        if (!targetDocSnap.exists()) throw new Error("Target document does not exist in Firestore.");

        const currentData = targetDocSnap.data();
        const currentObservations = currentData.observations || []; 
        currentObservations.push(newObservation); 

        currentObservations.sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));

        await updateDoc(targetRef, { observations: currentObservations });

        const currentTargetLocal = targetList[targetIndex];
        if (!Array.isArray(currentTargetLocal.observations)) currentTargetLocal.observations = [];
        currentTargetLocal.observations.push({ ...newObservation, date: newObservation.date.toDate() });
        currentTargetLocal.observations.sort((a, b) => (b.date ? b.date.getTime() : 0) - (a.date ? a.date.getTime() : 0));

        if (isArchived) {
            renderArchivedTargets(); 
            if (isResolved) {
                renderResolvedTargets(); 
            }
        } else {
            renderTargets(); 
            if (document.getElementById('dailyTargets').querySelector(`.target[data-target-id="${targetId}"]`)) {
                 await loadDailyTargets();
             }
        }

        toggleAddObservation(targetId); 
        document.getElementById(`observationText-${targetId}`).value = ''; 

    } catch (error) { console.error("Error saving observation:", error); alert("Erro ao salvar observação: " + error.message); }
};

function renderObservations(observations, isExpanded = false, targetId = null) {
    if (!Array.isArray(observations) || observations.length === 0) return '<div class="observations"></div>';
    
    observations.sort((a, b) => (b.date ? b.date.getTime() : 0) - (a.date ? a.date.getTime() : 0));
    
    const visibleObservations = observations; 

    let observationsHTML = `<div class="observations">`;
    visibleObservations.forEach(observation => {
        if (!observation || !observation.date) return; 
        const formattedDate = formatDateForDisplay(observation.date);
        const text = observation.text || '(Observação vazia)';
        observationsHTML += `<p class="observation-item"><strong>${formattedDate}:</strong> ${text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`;
    });
    
    observationsHTML += `</div>`;
    return observationsHTML;
}

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
    const expiredCount = prayerTargets.filter(target => target.hasDeadline && target.deadlineDate && target.deadlineDate.getTime() < todayUTCStart.getTime()).length;
    console.log(`[checkExpiredDeadlines] Found ${expiredCount} expired deadlines among active targets.`);
}

window.editDeadline = function(targetId) {
    const target = prayerTargets.find(t => t.id === targetId); if (!target) { alert("Erro: Alvo não encontrado ou não é ativo."); return; }
    const targetDiv = document.querySelector(`.target[data-target-id="${targetId}"]`); if (!targetDiv) return;
    const editFormContainer = document.getElementById(`editDeadlineForm-${targetId}`); if (!editFormContainer) return;
    const isVisible = editFormContainer.style.display === 'block';

    const obsForm = document.getElementById(`observationForm-${targetId}`);
    const categoryForm = document.getElementById(`editCategoryForm-${targetId}`);
    if(obsForm) obsForm.style.display = 'none';
    if(categoryForm) categoryForm.style.display = 'none';

    if (isVisible) { editFormContainer.style.display = 'none'; return; }

    let currentDeadlineISO = '';
    if (target.deadlineDate) {
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
        const newDeadlineLocal = new Date(newDeadlineValue + 'T00:00:00');
        if (isNaN(newDeadlineLocal.getTime())) { alert("Data do prazo inválida."); return; }
        const target = prayerTargets.find(t => t.id === targetId);
         if (target && target.date && newDeadlineLocal.getTime() < target.date.getTime()) {
            alert("O Prazo de Validade não pode ser anterior à Data de Criação."); return;
         }
        newDeadlineTimestamp = Timestamp.fromDate(newDeadlineLocal);
        newHasDeadline = true;
    } else {
        if (!confirm("Nenhuma data selecionada. Tem certeza que deseja remover o prazo?")) return;
    }

    await updateDeadlineInFirestoreAndLocal(targetId, newDeadlineTimestamp, newHasDeadline);
    cancelEditDeadline(targetId); 
};

async function updateDeadlineInFirestoreAndLocal(targetId, newDeadlineTimestamp, newHasDeadline) {
     const user = auth.currentUser; if (!user) { alert("Erro: Usuário não autenticado."); return; }
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
         editFormContainer.style.display = 'none';
         editFormContainer.innerHTML = ''; 
     }
};


// --- Category Editing ---
window.editCategory = function(targetId) {
    let target = prayerTargets.find(t => t.id === targetId) || archivedTargets.find(t => t.id === targetId);
    if (!target) { alert("Erro: Alvo não encontrado."); return; }

    const targetDiv = document.querySelector(`.target[data-target-id="${targetId}"]`);
    if (!targetDiv) return;
    const editFormContainer = document.getElementById(`editCategoryForm-${targetId}`);
    if (!editFormContainer) { console.error(`Edit form container not found for ${targetId}`); return; }

    const isVisible = editFormContainer.style.display === 'block';

    const obsForm = document.getElementById(`observationForm-${targetId}`);
    const deadlineForm = document.getElementById(`editDeadlineForm-${targetId}`);
    if(obsForm) obsForm.style.display = 'none';
    if(deadlineForm) deadlineForm.style.display = 'none';

    if (isVisible) {
        editFormContainer.style.display = 'none'; 
        return;
    }

    let optionsHTML = '<option value="">-- Remover Categoria --</option>'; 
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
    const newCategoryValue = newCategorySelect.value; 

    const user = auth.currentUser;
    if (!user) { alert("Erro: Usuário não autenticado."); return; }
    const userId = user.uid;

    let targetRef;
    let targetList;
    let targetIndex = -1;
    let isArchived = false;
    let isResolved = false;

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
        await updateDoc(targetRef, {
            category: newCategoryValue || null 
        });

        targetList[targetIndex].category = newCategoryValue || null;

        if (isArchived) {
            renderArchivedTargets();
            if (isResolved) {
                renderResolvedTargets(); 
            }
        } else {
            renderTargets(); 
             if (document.getElementById('dailyTargets').querySelector(`.target[data-target-id="${targetId}"]`)) {
                 console.log("Target was in daily list, refreshing daily targets.");
                 await loadDailyTargets();
             }
        }

        alert('Categoria atualizada com sucesso!');
        cancelEditCategory(targetId); 

    } catch (error) {
        console.error(`Error updating category for ${targetId}:`, error);
        alert("Erro ao atualizar categoria: " + error.message);
    }
};

window.cancelEditCategory = function(targetId) {
    const editFormContainer = document.getElementById(`editCategoryForm-${targetId}`);
    if (editFormContainer) {
        editFormContainer.style.display = 'none';
        editFormContainer.innerHTML = ''; 
    }
};
// --- End Category Editing ---


// --- Daily Targets ---
async function loadDailyTargets() {
    const userId = auth.currentUser ? auth.currentUser.uid : null;
    if (!userId) { document.getElementById("dailyTargets").innerHTML = "<p>Faça login para ver os alvos diários.</p>"; currentDailyTargets = []; return; }
    const todayStr = formatDateToISO(new Date()); 
    const dailyDocId = `${userId}_${todayStr}`;
    const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);
    const dailyTargetsDiv = document.getElementById("dailyTargets");
    dailyTargetsDiv.innerHTML = '<p>Carregando alvos do dia...</p>'; 
    currentDailyTargets = []; 

    try {
        let dailyTargetsData; const dailySnapshot = await getDoc(dailyRef);
        if (!dailySnapshot.exists() || !dailySnapshot.data()?.targets) { 
            console.log(`[loadDailyTargets] Daily document for ${dailyDocId} not found or invalid, generating.`);
            dailyTargetsData = await generateDailyTargets(userId, todayStr);
            await setDoc(dailyRef, dailyTargetsData); 
            console.log(`[loadDailyTargets] Daily document ${dailyDocId} created.`);
        } else {
            dailyTargetsData = dailySnapshot.data();
            console.log(`[loadDailyTargets] Daily document ${dailyDocId} loaded.`);
        }

        if (!dailyTargetsData || !Array.isArray(dailyTargetsData.targets)) {
            console.error("[loadDailyTargets] Invalid daily data structure after load/generate:", dailyTargetsData);
            dailyTargetsDiv.innerHTML = "<p>Erro ao carregar alvos diários (dados inválidos).</p>";
            displayRandomVerse();
            currentDailyTargets = []; 
            return;
        }

        currentDailyTargets = dailyTargetsData.targets.map(t => t?.targetId).filter(id => id);
        console.log(`[loadDailyTargets] Current daily target IDs:`, currentDailyTargets);

        const pendingTargetIds = dailyTargetsData.targets.filter(t => t && t.targetId && !t.completed).map(t => t.targetId);
        const completedTargetIds = dailyTargetsData.targets.filter(t => t && t.targetId && t.completed).map(t => t.targetId);
        console.log(`[loadDailyTargets] Pending IDs: ${pendingTargetIds.length}, Completed IDs: ${completedTargetIds.length}`);

        const allTargetIds = [...pendingTargetIds, ...completedTargetIds];
        if (allTargetIds.length === 0) {
            dailyTargetsDiv.innerHTML = "<p>Nenhum alvo de oração selecionado para hoje.</p>";
            displayRandomVerse();
            return; 
        }

        const targetsToDisplayDetails = prayerTargets.filter(pt => pt && pt.id && allTargetIds.includes(pt.id));

        const pendingTargetsDetails = targetsToDisplayDetails.filter(t => pendingTargetIds.includes(t.id));
        const completedTargetsDetails = targetsToDisplayDetails.filter(t => completedTargetIds.includes(t.id));

        console.log(`[loadDailyTargets] Pending Details: ${pendingTargetsDetails.length}, Completed Details: ${completedTargetsDetails.length}`);

        renderDailyTargets(pendingTargetsDetails, completedTargetsDetails);
        displayRandomVerse();

    } catch (error) {
        console.error("[loadDailyTargets] Error:", error);
        dailyTargetsDiv.innerHTML = "<p>Erro ao carregar alvos diários. Tente recarregar a página.</p>";
        displayRandomVerse(); 
        currentDailyTargets = []; 
    }
}

async function generateDailyTargets(userId, dateStr) {
    console.log(`[generateDailyTargets] Generating for ${userId} on ${dateStr}`);
    try {
        const availableTargets = prayerTargets.filter(t => t && t.id && !t.archived && !t.resolved);
        if (availableTargets.length === 0) {
            console.log("[generateDailyTargets] No active targets available.");
            return { userId, date: dateStr, targets: [] };
        }

        const today = new Date(dateStr + 'T00:00:00Z');

        let pool = [...availableTargets]; 

        const historyDays = 7;
        const completedInHistory = new Set(); 
        for (let i = 1; i <= historyDays; i++) {
            const pastDate = new Date(today.getTime() - i * 86400000);
            const pastDateStr = formatDateToISO(pastDate);
            const pastDocId = `${userId}_${pastDateStr}`;
            try {
                const pastSnap = await getDoc(doc(db, "dailyPrayerTargets", pastDocId));
                if (pastSnap.exists()) {
                    const pastData = pastSnap.data();
                    if (pastData?.targets && Array.isArray(pastData.targets)) {
                        pastData.targets.forEach(t => {
                            if (t && t.targetId && t.completed === true) {
                                completedInHistory.add(t.targetId);
                            }
                        });
                    }
                }
            } catch (err) {
                console.warn(`[generateDailyTargets] Error fetching history for ${pastDateStr}:`, err);
            }
        }
        console.log(`[generateDailyTargets] Targets COMPLETED in the last ${historyDays} days:`, completedInHistory.size);

        pool = pool.filter(target => !completedInHistory.has(target.id));
        console.log(`[generateDailyTargets] Pool size after filtering recent completions: ${pool.length}`);

        if (pool.length === 0 && availableTargets.length > 0) {
            console.log("[generateDailyTargets] Pool empty after completion filter, resetting pool to all available targets.");
            pool = [...availableTargets];
             pool.sort((a, b) => {
                 const dateA = a.lastPrayedDate ? a.lastPrayedDate.getTime() : 0; 
                 const dateB = b.lastPrayedDate ? b.lastPrayedDate.getTime() : 0;
                 return dateA - dateB; 
             });
        } else if (pool.length > 0) {
             pool.sort((a, b) => {
                 const dateA = a.lastPrayedDate ? a.lastPrayedDate.getTime() : 0; 
                 const dateB = b.lastPrayedDate ? b.lastPrayedDate.getTime() : 0;
                 return dateA - dateB; 
             });
         }

        const maxDailyTargets = 10;
        const selectedTargets = pool.slice(0, Math.min(maxDailyTargets, pool.length));

        const targetsForFirestore = selectedTargets.map(target => ({ targetId: target.id, completed: false }));

        console.log(`[generateDailyTargets] Generated ${targetsForFirestore.length} targets for ${dateStr}.`);
        return { userId: userId, date: dateStr, targets: targetsForFirestore };

    } catch (error) {
        console.error("[generateDailyTargets] Unexpected Error:", error);
        return { userId: userId, date: dateStr, targets: [] }; 
    }
}

function renderDailyTargets(pendingTargets, completedTargets) {
    const dailyTargetsDiv = document.getElementById("dailyTargets");
    dailyTargetsDiv.innerHTML = ''; 

    if (pendingTargets.length === 0 && completedTargets.length === 0) {
        dailyTargetsDiv.innerHTML = "<p>Nenhum alvo de oração selecionado para hoje.</p>";
        return;
    }

    if (pendingTargets.length > 0) {
        pendingTargets.forEach((target) => {
            if (!target || !target.id) return;
            const dailyDiv = createTargetElement(target, false); 
            addPrayButtonFunctionality(dailyDiv, target.id); 
            dailyTargetsDiv.appendChild(dailyDiv);
        });
    } else if (completedTargets.length > 0) {
        dailyTargetsDiv.innerHTML = "<p>Você já orou por todos os alvos de hoje!</p>";
    }

    if (completedTargets.length > 0) {
        if (pendingTargets.length > 0 || dailyTargetsDiv.innerHTML.includes("todos os alvos de hoje")) {
             const separator = document.createElement('hr');
             separator.style.cssText = 'border: none; border-top: 1px solid #eee; margin-top:20px; margin-bottom:15px;';
             dailyTargetsDiv.appendChild(separator);
         }
         const completedTitle = document.createElement('h3');
         completedTitle.textContent = "Concluídos Hoje";
         completedTitle.style.cssText = 'color:#777; font-size:1.1em; margin-top:15px; margin-bottom:10px; text-align: center;'; 
         dailyTargetsDiv.appendChild(completedTitle);

        completedTargets.forEach((target) => {
             if (!target || !target.id) return;
            const dailyDiv = createTargetElement(target, true); 
            dailyTargetsDiv.appendChild(dailyDiv);
        });
    }

    if (pendingTargets.length === 0 && completedTargets.length > 0) {
        displayCompletionPopup();
    }
}


function createTargetElement(target, isCompleted) {
    const dailyDiv = document.createElement("div");
    dailyDiv.classList.add("target");
    if (isCompleted) dailyDiv.classList.add("completed-target");
    dailyDiv.dataset.targetId = target.id;

    let categoryTag = '';
    if (target.category) {
        categoryTag = `<span class="category-tag">${target.category}</span>`;
    }

    let deadlineTag = '';
    if (target.hasDeadline && target.deadlineDate) {
        deadlineTag = `<span class="deadline-tag ${isDateExpired(target.deadlineDate) ? 'expired' : ''} ${isCompleted ? 'completed' : ''}">${formatDateForDisplay(target.deadlineDate)}</span>`;
    }

    const observationsHTML = renderObservations(target.observations || [], false, target.id);

    dailyDiv.innerHTML = `
        <h3>${categoryTag} ${deadlineTag ? `Prazo: ${deadlineTag}` : ''} ${target.title || 'Título Indisponível'}</h3>
        <p class="target-details">${target.details || 'Detalhes Indisponíveis'}</p>
        <p><strong>Data Criação:</strong> ${formatDateForDisplay(target.date)}</p>
        <p><strong>Tempo Decorrido:</strong> ${timeElapsed(target.date)}</p>
        ${observationsHTML}`; 
    return dailyDiv;
}

function addPrayButtonFunctionality(dailyDiv, targetId) {
    const prayButton = document.createElement("button");
    prayButton.textContent = "Orei!";
    prayButton.classList.add("pray-button", "btn");
    prayButton.dataset.targetId = targetId; 

    prayButton.onclick = async () => {
        const user = auth.currentUser; if (!user) { alert("Erro: Usuário não autenticado."); return; }
        const userId = user.uid; const todayStr = formatDateToISO(new Date()); const dailyDocId = `${userId}_${todayStr}`;
        const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);

        prayButton.disabled = true;
        prayButton.textContent = "Orado!";
        prayButton.style.opacity = 0.6;

        try {
            const dailySnap = await getDoc(dailyRef);
            if (!dailySnap.exists()) {
                console.error("Daily doc not found during 'Orei!' click:", dailyDocId);
                alert("Erro: Documento diário não encontrado. Tente recarregar.");
                prayButton.disabled = false; prayButton.textContent = "Orei!"; prayButton.style.opacity = 1;
                return;
            }

            const dailyData = dailySnap.data();
            let targetUpdatedInDaily = false;

            const updatedTargets = dailyData.targets.map(t => {
                if (t && t.targetId === targetId) {
                    targetUpdatedInDaily = true;
                    return { ...t, completed: true };
                }
                return t;
            });

            if (!targetUpdatedInDaily) {
                console.warn(`Target ${targetId} not found in daily doc ${dailyDocId} during 'Orei!' click.`);
            }

             await updateClickCounts(userId, targetId, targetUpdatedInDaily, updatedTargets, dailyRef);

            await loadDailyTargets();

        } catch (error) {
            console.error("Error registering 'Orei!':", error);
            alert("Erro ao registrar oração: " + error.message);
            prayButton.disabled = false; prayButton.textContent = "Orei!"; prayButton.style.opacity = 1;
        }
    };

     const heading = dailyDiv.querySelector('h3');
     if (heading && heading.nextSibling) {
         dailyDiv.insertBefore(prayButton, heading.nextSibling); 
     } else if (heading) {
         dailyDiv.appendChild(prayButton); 
     } else if (dailyDiv.firstChild) {
          dailyDiv.insertBefore(prayButton, dailyDiv.firstChild); 
     } else {
         dailyDiv.appendChild(prayButton); 
     }
}

async function updateClickCounts(userId, targetId, targetUpdatedInDaily, updatedDailyTargets, dailyRef) {
     const clickCountsRef = doc(db, "prayerClickCounts", targetId);
     const weeklyDocRef = doc(db, "weeklyInteractions", userId);
     const perseveranceDocRef = doc(db, "perseveranceData", userId);
     const activeTargetRef = doc(db, "users", userId, "prayerTargets", targetId);

     const now = new Date();
     const nowTimestamp = Timestamp.fromDate(now); 

     const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
     const year = now.getFullYear().toString();
     const todayUTCStr = formatDateToISO(now); 
     const weekId = getWeekIdentifier(now); 
     const todayUTCStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())); 

     const batch = writeBatch(db);
     
     // --- Perseverance Update Logic (MODIFICADO E CORRIGIDO) ---
     let lastInteractionUTCStart = null;
     if (perseveranceData.lastInteractionDate) {
         const liDate = convertToDate(perseveranceData.lastInteractionDate); // Garante que é um objeto Date
         if (liDate) {
            lastInteractionUTCStart = new Date(Date.UTC(liDate.getUTCFullYear(), liDate.getUTCMonth(), liDate.getUTCDate()));
         }
     }

     if (!lastInteractionUTCStart || todayUTCStart.getTime() > lastInteractionUTCStart.getTime()) {
         console.log(`[updateClickCounts] First 'Orei!' interaction for ${todayUTCStr} relevant to streak. Updating perseverance.`);
         let newConsecutiveDays;
         let isConsecutiveStreak = false;

         if (lastInteractionUTCStart) {
             const expectedYesterdayUTCStart = new Date(todayUTCStart.getTime() - 86400000); // 24 * 60 * 60 * 1000 ms
             if (lastInteractionUTCStart.getTime() === expectedYesterdayUTCStart.getTime()) {
                 isConsecutiveStreak = true;
             }
         }

         if (isConsecutiveStreak) {
             newConsecutiveDays = (perseveranceData.consecutiveDays || 0) + 1;
         } else {
             newConsecutiveDays = 1; // Reseta se não for consecutivo ou se for a primeira vez
         }
         
         const newRecordDays = Math.max(perseveranceData.recordDays || 0, newConsecutiveDays);

         // Atualiza o objeto local
         perseveranceData.consecutiveDays = newConsecutiveDays;
         perseveranceData.lastInteractionDate = todayUTCStart; // Armazena o início do dia UTC
         perseveranceData.recordDays = newRecordDays;
         
         batch.set(perseveranceDocRef, { 
             userId: userId, 
             consecutiveDays: newConsecutiveDays,
             lastInteractionDate: Timestamp.fromDate(todayUTCStart), // Salva o Timestamp do início do dia UTC
             recordDays: newRecordDays
         }, { merge: true });
         
         updatePerseveranceUI(); // Atualiza a UI imediatamente após a lógica local
     } else {
         console.log(`[updateClickCounts] Subsequent 'Orei!' click for ${todayUTCStr}. Perseverance streak unchanged for this click.`);
     }

    // --- Weekly Chart Update Logic ---
    if (weeklyPrayerData.weekId !== weekId) { 
        console.log(`[updateClickCounts] Week changed from ${weeklyPrayerData.weekId} to ${weekId}. Resetting weekly data.`);
        weeklyPrayerData = {
            weekId: weekId,
            interactions: { [todayUTCStr]: true }
        };
        batch.set(weeklyDocRef, { userId, ...weeklyPrayerData });
    } else if (!weeklyPrayerData.interactions[todayUTCStr]) {
        weeklyPrayerData.interactions[todayUTCStr] = true;
        batch.update(weeklyDocRef, { [`interactions.${todayUTCStr}`]: true });
        console.log(`[updateClickCounts] Marked ${todayUTCStr} as interacted for week ${weekId}.`);
    }
    updateWeeklyChart();


     batch.set(clickCountsRef, {
         targetId: targetId,
         userId: userId,
         totalClicks: increment(1),
         [`monthlyClicks.${yearMonth}`]: increment(1),
         [`yearlyClicks.${year}`]: increment(1)
        }, { merge: true });

     batch.update(activeTargetRef, { lastPrayedDate: nowTimestamp });

     if (targetUpdatedInDaily) {
         batch.update(dailyRef, { targets: updatedDailyTargets });
     }

     try {
         await batch.commit();
         console.log(`[updateClickCounts] Batch committed successfully for ${targetId}.`);

         const targetIndexLocal = prayerTargets.findIndex(t => t.id === targetId);
         if (targetIndexLocal !== -1) {
             prayerTargets[targetIndexLocal].lastPrayedDate = now; 
             console.log(`[updateClickCounts] Local lastPrayedDate updated for ${targetId}`);
         } else {
             console.warn(`[updateClickCounts] Target ${targetId} not found in local prayerTargets array after batch commit.`);
         }

         } catch (error) {
         console.error(`[updateClickCounts] Error committing batch for target ${targetId}:`, error);
         throw error; 
     }
 }


// --- Perseverance (Progress Bar and Weekly Chart) ---

async function loadPerseveranceData(userId) {
    console.log(`[loadPerseveranceData] Loading PROGRESS BAR data for user ${userId}`);
    const perseveranceDocRef = doc(db, "perseveranceData", userId);
    try {
        const docSnap = await getDoc(perseveranceDocRef);
        if (docSnap.exists()) {
            const rawData = docSnap.data();
            // Usamos a função rehydrateTargets para converter Timestamps,
            // especialmente para lastInteractionDate.
            const [hydratedPerseverance] = rehydrateTargets([{...rawData}]);
            
            perseveranceData.lastInteractionDate = hydratedPerseverance.lastInteractionDate ? convertToDate(hydratedPerseverance.lastInteractionDate) : null;
            perseveranceData.consecutiveDays = Number(hydratedPerseverance.consecutiveDays) || 0;
            perseveranceData.recordDays = Number(hydratedPerseverance.recordDays) || 0; // Carrega o recorde
            console.log("[loadPerseveranceData] Progress bar data loaded:", perseveranceData);
        } else {
            console.log(`[loadPerseveranceData] No progress bar data found for ${userId}. Initializing locally.`);
            perseveranceData = { consecutiveDays: 0, lastInteractionDate: null, recordDays: 0 };
        }
        updatePerseveranceUI(); 
        await loadWeeklyPrayerData(userId); 

    } catch (error) {
        console.error("[loadPerseveranceData] Error loading progress bar data:", error);
         perseveranceData = { consecutiveDays: 0, lastInteractionDate: null, recordDays: 0 }; 
         updatePerseveranceUI(); 
         try { await loadWeeklyPrayerData(userId); }
         catch (weeklyError) {
            console.error("[loadPerseveranceData] Error loading weekly data after bar error:", weeklyError);
             weeklyPrayerData = { weekId: getWeekIdentifier(new Date()), interactions: {} };
             resetWeeklyChart(); 
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
            if (loadedData.weekId === currentWeekId) {
                weeklyPrayerData = {
                    weekId: loadedData.weekId,
                    interactions: loadedData.interactions || {} 
                };
                console.log("[loadWeeklyPrayerData] Weekly chart data loaded for current week:", weeklyPrayerData);
            } else {
                console.log(`[loadWeeklyPrayerData] Week changed from ${loadedData.weekId} to ${currentWeekId}. Resetting weekly data.`);
                weeklyPrayerData = { weekId: currentWeekId, interactions: {} };
                await setDoc(weeklyDocRef, { userId: userId, ...weeklyPrayerData }); 
                console.log(`[loadWeeklyPrayerData] Reset weekly data saved for new week.`);
            }
        } else {
            console.log(`[loadWeeklyPrayerData] No weekly data found. Initializing for ${currentWeekId}.`);
            weeklyPrayerData = { weekId: currentWeekId, interactions: {} };
            await setDoc(weeklyDocRef, { userId: userId, ...weeklyPrayerData }); 
            console.log(`[loadWeeklyPrayerData] Initial weekly data saved.`);
        }
        updateWeeklyChart(); 

    } catch (error) {
        console.error("[loadWeeklyPrayerData] Error loading/initializing weekly chart data:", error);
         weeklyPrayerData = { weekId: getWeekIdentifier(new Date()), interactions: {} };
         resetWeeklyChart(); 
    }
}


function updatePerseveranceUI() {
     const consecutiveDays = perseveranceData.consecutiveDays || 0;
     const recordDays = perseveranceData.recordDays || 0;
     
     // O denominador da barra será o recorde. Se o recorde for 0, usamos 1 para evitar divisão por zero,
     // mas a barra estará em 0% de qualquer forma.
     const displayRecordForBar = Math.max(recordDays, 1); 
     const percentage = recordDays > 0 ? Math.min((consecutiveDays / recordDays) * 100, 100) : 0;
     // Se recordDays for 0, a porcentagem será 0. Se consecutiveDays > recordDays (o que não deve acontecer
     // se a lógica de atualização do recorde estiver correta), limitamos a 100%.

     const progressBar = document.getElementById('perseveranceProgressBar');
     const percentageDisplay = document.getElementById('perseverancePercentage');
     const barContainer = document.querySelector('.perseverance-bar-container'); 

     if (progressBar && percentageDisplay && barContainer) {
         progressBar.style.width = `${percentage}%`;
         // O texto exibirá: Dias Consecutivos Atuais / Recorde de Dias
         percentageDisplay.textContent = `${consecutiveDays} / ${recordDays} dias`;
         barContainer.title = `Progresso atual: ${consecutiveDays} de ${recordDays} dias consecutivos (Recorde: ${recordDays} dias).`;
     } else {
          console.warn("[updatePerseveranceUI] Could not find all progress bar elements.");
     }
     console.log("[updatePerseveranceUI] Progress bar UI updated.");
 }

function resetPerseveranceUI() {
    const progressBar = document.getElementById('perseveranceProgressBar');
    const percentageDisplay = document.getElementById('perseverancePercentage');
    const barContainer = document.querySelector('.perseverance-bar-container');
    if (progressBar && percentageDisplay && barContainer) {
        progressBar.style.width = `0%`;
        percentageDisplay.textContent = `0 / 0 dias`; // Exibe 0/0 ao resetar
        barContainer.title = 'Nenhum progresso de perseverança ainda.'; 
    }
    perseveranceData = { consecutiveDays: 0, lastInteractionDate: null, recordDays: 0 }; // Reseta o recorde local
    console.log("[resetPerseveranceUI] Progress bar data and UI reset.");

    weeklyPrayerData = { weekId: getWeekIdentifier(new Date()), interactions: {} };
    resetWeeklyChart(); 
    console.log("[resetPerseveranceUI] Weekly chart data and UI reset.");
}

function updateWeeklyChart() {
    const today = new Date();
    const todayDayOfWeek = today.getDay(); // 0 for Sunday, ..., 6 for Saturday
    const todayUTCReference = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));

    const firstDayOfWeek = new Date(todayUTCReference);
    firstDayOfWeek.setUTCDate(todayUTCReference.getUTCDate() - todayDayOfWeek);

    const interactions = weeklyPrayerData.interactions || {};
    const currentWeekId = weeklyPrayerData.weekId || getWeekIdentifier(today);
    console.log("[updateWeeklyChart] Updating for week:", currentWeekId, "Interactions:", interactions);

    for (let i = 0; i < 7; i++) { // i = 0 (Sun) to 6 (Sat)
        const dayTick = document.getElementById(`day-${i}`);
        if (!dayTick) continue;

        const dayContainer = dayTick.parentElement;
        const currentTickDateUTC = new Date(firstDayOfWeek);
        currentTickDateUTC.setUTCDate(firstDayOfWeek.getUTCDate() + i);
        const dateStringUTC = formatDateToISO(currentTickDateUTC);

        dayTick.classList.remove('active', 'inactive', 'current-day');
        if (dayContainer) dayContainer.classList.remove('current-day-container');

        if (currentTickDateUTC.getTime() === todayUTCReference.getTime()) {
            dayTick.classList.add('current-day');
            if (dayContainer) dayContainer.classList.add('current-day-container');
            if (interactions[dateStringUTC] === true) {
                dayTick.classList.add('active');
            }
        }
        else if (currentTickDateUTC.getTime() < todayUTCReference.getTime()) {
            if (interactions[dateStringUTC] === true) {
                dayTick.classList.add('active');
            } else {
                dayTick.classList.add('inactive');
            }
        }
    }
}

function resetWeeklyChart() {
    for (let i = 0; i < 7; i++) {
        const dayTick = document.getElementById(`day-${i}`);
        if (dayTick) {
            dayTick.classList.remove('active', 'inactive', 'current-day');
            const dayContainer = dayTick.parentElement;
            if (dayContainer) {
                dayContainer.classList.remove('current-day-container');
            }
        }
    }
    console.log("[resetWeeklyChart] Weekly chart ticks and containers visually cleared.");
}


// --- Views and Filters ---

function generateViewHTML(targetsToInclude = lastDisplayedTargets, pageTitle = "Alvos de Oração (Visão Atual)") {
    let viewHTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${pageTitle}</title><style>body{font-family: sans-serif; margin: 20px; line-height: 1.5;} .target{border: 1px solid #ccc; padding: 15px; margin-bottom: 15px; border-radius: 5px; background-color: #fff;} h1{text-align:center; color: #333;} h3{margin-top:0; margin-bottom: 5px; color: #444; display: flex; align-items: center; flex-wrap: wrap; gap: 5px;} p { margin: 4px 0; color: #555;} .target-details, .observation-item { text-align: justify; } strong{color: #333;} .deadline-tag{background-color: #ffcc00; color: #333; padding: 3px 8px; border-radius: 4px; font-size: 0.8em; display: inline-block; border: 1px solid #e6b800;} .deadline-tag.expired{background-color: #ff6666; color: #fff; border-color: #ff4d4d;} .category-tag { background-color: #C71585; color: #fff; padding: 3px 8px; border-radius: 4px; font-size: 0.8em; font-weight: bold; display: inline-block; border: 1px solid #A01069; vertical-align: middle;} .observations { margin-top: 10px; padding-left: 15px; border-left: 2px solid #eee;} .observation-item{margin-left: 0; font-size: 0.9em; color: #555; padding-left: 0; border-left: none; margin-bottom: 5px;} .resolved{background-color:#eaffea; border-left: 5px solid #9cbe4a;} .completed-target{opacity: 0.8; border-left: 5px solid #b0b0b0;} .completed-target .category-tag { background-color: #e0e0e0; color: #757575; border-color: #bdbdbd; } .completed-target .deadline-tag { background-color: #e0e0e0; color: #999; border-color: #bdbdbd; } .target h3 .category-tag, .target h3 .deadline-tag { flex-shrink: 0; } </style></head><body><h1>${pageTitle}</h1>`;
    if (!Array.isArray(targetsToInclude) || targetsToInclude.length === 0) {
        viewHTML += "<p style='text-align:center;'>Nenhum alvo para exibir nesta visualização.</p>";
    } else {
        targetsToInclude.forEach(target => {
            if (target?.id) viewHTML += generateTargetViewHTML(target, false); 
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
    let viewHTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Alvos do Dia</title><style>body{font-family: sans-serif; margin: 20px; line-height: 1.5;} .target{border: 1px solid #ccc; padding: 15px; margin-bottom: 15px; border-radius: 5px; background-color: #fff;} h1, h2 {text-align:center; color: #333;} h2 { margin-top: 25px; border-bottom: 1px solid #eee; padding-bottom: 5px;} h3{margin-top:0; margin-bottom: 5px; color: #444; display: flex; align-items: center; flex-wrap: wrap; gap: 5px;} p { margin: 4px 0; color: #555;} .target-details, .observation-item { text-align: justify; } strong{color: #333;} .deadline-tag{background-color: #ffcc00; color: #333; padding: 3px 8px; border-radius: 4px; font-size: 0.8em; display: inline-block; border: 1px solid #e6b800;} .deadline-tag.expired{background-color: #ff6666; color: #fff; border-color: #ff4d4d;} .category-tag { background-color: #C71585; color: #fff; padding: 3px 8px; border-radius: 4px; font-size: 0.8em; font-weight: bold; display: inline-block; border: 1px solid #A01069; vertical-align: middle;} .observations { margin-top: 10px; padding-left: 15px; border-left: 2px solid #eee;} .observation-item{margin-left: 0; font-size: 0.9em; color: #555; padding-left: 0; border-left: none; margin-bottom: 5px;} .completed-target{background-color:#f0f0f0 !important; border-left: 5px solid #9cbe4a;} .completed-target .category-tag { background-color: #e0e0e0; color: #757575; border-color: #bdbdbd; } .completed-target .deadline-tag { background-color: #e0e0e0; color: #999; border-color: #bdbdbd; } .target h3 .category-tag, .target h3 .deadline-tag { flex-shrink: 0; } </style></head><body><h1>Alvos do Dia</h1>`;
    const dailyTargetsDiv = document.getElementById('dailyTargets');
    let pendingCount = 0;
    let completedCount = 0;

    if (dailyTargetsDiv) {
        viewHTML += `<h2>Pendentes</h2>`;
        const pendingDivs = dailyTargetsDiv.querySelectorAll('.target:not(.completed-target)');
        if (pendingDivs.length > 0) {
            pendingDivs.forEach(div => {
                const targetId = div.dataset.targetId;
                const targetData = prayerTargets.find(t => t.id === targetId);
                if (targetData) {
                    pendingCount++;
                    viewHTML += generateTargetViewHTML(targetData, false); 
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
                 const targetData = prayerTargets.find(t => t.id === targetId); 
                 if (targetData) {
                    completedCount++;
                    viewHTML += generateTargetViewHTML(targetData, true); 
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

function generateTargetViewHTML(target, isCompletedView = false) {
     if (!target?.id) return ''; 
     const formattedDate = formatDateForDisplay(target.date);
     const elapsed = timeElapsed(target.date);

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
     const observationsHTML = renderObservations(observations, true, target.id); 

     const completedClass = isCompletedView ? 'completed-target' : '';

     return `
         <div class="target ${completedClass}" data-target-id="${target.id}">
             <h3>${categoryTag} ${deadlineTag} ${target.title || 'Sem Título'}</h3>
             <p class="target-details">${target.details || 'Sem Detalhes'}</p>
             <p><strong>Data Criação:</strong> ${formattedDate}</p>
             <p><strong>Tempo Decorrido:</strong> ${elapsed}</p>
             ${observationsHTML}
         </div>`;
}


async function generateResolvedViewHTML(startDate, endDate) {
    const user = auth.currentUser; if (!user) { alert("Você precisa estar logado."); return; } const uid = user.uid;

    const startUTC = new Date(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate());
    const endNextDay = new Date(endDate);
    endNextDay.setUTCDate(endDate.getUTCDate() + 1);
    const endUTCStartOfNextDay = new Date(endNextDay.getUTCFullYear(), endNextDay.getUTCMonth(), endNextDay.getUTCDate());

    const startTimestamp = Timestamp.fromDate(startUTC);
    const endTimestamp = Timestamp.fromDate(endUTCStartOfNextDay); 

    console.log(`[generateResolvedViewHTML] Querying resolved targets between: ${startUTC.toISOString()} and ${endUTCStartOfNextDay.toISOString()}`);

    const archivedRef = collection(db, "users", uid, "archivedTargets");
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
        filteredResolvedTargets = rehydrateTargets(rawTargets); 
        console.log(`[generateResolvedViewHTML] Found ${filteredResolvedTargets.length} resolved targets in the period.`);
    } catch (error) {
        console.error("Error fetching resolved targets for view:", error);
        alert("Erro ao buscar alvos respondidos no período selecionado: " + error.message);
        return;
    }

    let viewHTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Alvos Respondidos (${formatDateForDisplay(startDate)} - ${formatDateForDisplay(endDate)})</title><style>body{font-family: sans-serif; margin: 20px; line-height: 1.5;} .target{border: 1px solid #ccc; padding: 15px; margin-bottom: 15px; border-radius: 5px; background-color: #eaffea; border-left: 5px solid #9cbe4a;} h1, h2 {text-align:center; color: #333;} h2 { margin-top: 5px; margin-bottom: 20px; font-size: 1.2em; color: #555;} h3{margin-top:0; margin-bottom: 5px; color: #444; display: flex; align-items: center; flex-wrap: wrap; gap: 5px;} p { margin: 4px 0; color: #555;} .target-details, .observation-item { text-align: justify; } strong{color: #333;} .category-tag { background-color: #C71585; color: #fff; padding: 3px 8px; border-radius: 4px; font-size: 0.8em; font-weight: bold; display: inline-block; border: 1px solid #A01069; vertical-align: middle;} .observations { margin-top: 10px; padding-left: 15px; border-left: 2px solid #c3e6cb;} .observation-item{margin-left: 0; font-size: 0.9em; color: #555; padding-left: 0; border-left: none; margin-bottom: 5px;} hr { border: 0; border-top: 1px solid #ccc; margin: 20px 0; } .target h3 .category-tag { flex-shrink: 0; } </style></head><body><h1>Alvos Respondidos</h1>`;
    viewHTML += `<h2>Período: ${formatDateForDisplay(startDate)} a ${formatDateForDisplay(endDate)}</h2><hr/>`;

     if (filteredResolvedTargets.length === 0) {
         viewHTML += "<p style='text-align:center;'>Nenhum alvo respondido encontrado neste período.</p>";
     } else {
         filteredResolvedTargets.forEach(target => {
             viewHTML += generateTargetViewHTMLForResolved(target);
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

function generateTargetViewHTMLForResolved(target) {
     if (!target?.id) return '';
     const formattedResolutionDate = formatDateForDisplay(target.resolutionDate);
     let totalTime = 'N/A';
     if (target.date && target.resolutionDate) {
         let diffInSeconds = Math.floor((target.resolutionDate.getTime() - target.date.getTime()) / 1000); if (diffInSeconds < 0) diffInSeconds = 0;
         if (diffInSeconds < 60) totalTime = `${diffInSeconds} seg`;
         else { let diffInMinutes = Math.floor(diffInSeconds / 60); if (diffInMinutes < 60) totalTime = `${diffInMinutes} min`;
             else { let diffInHours = Math.floor(diffInMinutes / 60); if (diffInHours < 24) totalTime = `${diffInHours} hr`;
                 else { let diffInDays = Math.floor(diffInHours / 24); if (diffInDays < 30) totalTime = `${diffInDays} dias`;
                     else { let diffInMonths = Math.floor(diffInDays / 30.44); if (diffInMonths < 12) totalTime = `${diffInMonths} meses`;
                         else { let diffInYears = Math.floor(diffInDays / 365.25); totalTime = `${diffInYears} anos`; }}}}}
     }

     let categoryTag = '';
     if (target.category) {
         categoryTag = `<span class="category-tag">${target.category}</span>`;
     }

     const observations = Array.isArray(target.observations) ? target.observations : [];
     const observationsHTML = renderObservations(observations, true, target.id); 

     return `
         <div class="target resolved"> 
             <h3>${categoryTag} ${target.title || 'Sem Título'} (Respondido)</h3>
             <p class="target-details">${target.details || 'Sem Detalhes'}</p>
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
        if (!target) return false; 
         const titleMatch = target.title?.toLowerCase().includes(lowerSearchTerm);
         const detailsMatch = target.details?.toLowerCase().includes(lowerSearchTerm);
         const categoryMatch = target.category?.toLowerCase().includes(lowerSearchTerm); 
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
    const dailyRelatedElements = ['weeklyPerseveranceChart', 'perseveranceSection', 'sectionSeparator']; 

    allPanels.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.style.display = 'none';
    });

    dailyRelatedElements.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.style.display = 'none';
    });

    const panelToShowElement = document.getElementById(panelIdToShow);
    if(panelToShowElement) {
        panelToShowElement.style.display = 'block';
    } else {
        console.warn(`Panel ${panelIdToShow} not found.`);
    }

    if (panelIdToShow === 'dailySection') {
        dailyRelatedElements.forEach(id => {
            const el = document.getElementById(id);
            if(el) el.style.display = 'block';
        });
    }
    console.log(`Showing panel: ${panelIdToShow}`);
}

// --- Verses and Popups ---
const verses = [ 
    "“Entrega o teu caminho ao Senhor; confia nele, e ele tudo fará.” - Salmos 37:5", "“Não andeis ansiosos por coisa alguma; antes em tudo sejam os vossos pedidos conhecidos diante de Deus pela oração e súplica com ações de graças; e a paz de Deus, que excede todo o entendimento, guardará os vossos corações e os vossos pensamentos em Cristo Jesus.” - Filipenses 4:6-7", "“Orai sem cessar.” - 1 Tessalonicenses 5:17", "“Confessai, pois, os vossos pecados uns aos outros, e orai uns aos outros, para serdes curados. Muito pode, por sua eficácia, a súplica do justo.” - Tiago 5:16", "“E tudo quanto pedirdes em meu nome, eu o farei, para que o Pai seja glorificado no Filho.” - João 14:13", "“Pedi, e dar-se-vos-á; buscai, e encontrareis; batei, e abrir-se-vos-á. Pois todo o que pede, recebe; e quem busca, encontra; e a quem bate, abrir-se-lhe-á.” - Mateus 7:7-8", "“Se vós, pois, sendo maus, sabeis dar boas dádivas aos vossos filhos, quanto mais vosso Pai celestial dará o Espírito Santo àqueles que lho pedirem?” - Lucas 11:13", "“Este é o dia que o Senhor fez; regozijemo-nos e alegremo-nos nele.” - Salmos 118:24", "“Antes de clamarem, eu responderei; ainda não estarão falando, e eu já terei ouvido.” - Isaías 65:24", "“Clama a mim, e responder-te-ei, e anunciar-te-ei coisas grandes e ocultas, que não sabes.” - Jeremias 33:3"
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

// --- Manual Addition of Target to Daily List ---

function openManualTargetModal() {
    const modal = document.getElementById('manualTargetModal');
    const searchInput = document.getElementById('manualTargetSearchInput');
    const resultsDiv = document.getElementById('manualTargetSearchResults');
    if (!modal || !searchInput || !resultsDiv) {
        console.error("Manual target addition modal elements not found.");
        return;
    }

    searchInput.value = ''; 
    resultsDiv.innerHTML = '<p>Digite algo para buscar...</p>'; 
    modal.style.display = 'block';
    searchInput.focus();
}

async function handleManualTargetSearch() {
    const searchInput = document.getElementById('manualTargetSearchInput');
    const resultsDiv = document.getElementById('manualTargetSearchResults');
    const searchTerm = searchInput.value.toLowerCase().trim();

    if (searchTerm.length < 2) { 
        resultsDiv.innerHTML = '<p>Digite pelo menos 2 caracteres...</p>';
        return;
    }

    resultsDiv.innerHTML = '<p>Buscando...</p>';

    const filteredActiveTargets = prayerTargets.filter(target => {
        if (!target || target.archived || target.resolved) return false; 
        const titleMatch = target.title?.toLowerCase().includes(searchTerm);
        const detailsMatch = target.details?.toLowerCase().includes(searchTerm);
        const categoryMatch = target.category?.toLowerCase().includes(searchTerm);
        return titleMatch || detailsMatch || categoryMatch;
    });

    const targetsNotInDailyList = filteredActiveTargets.filter(target => !currentDailyTargets.includes(target.id));

    renderManualSearchResults(targetsNotInDailyList);
}

function renderManualSearchResults(targets) {
    const resultsDiv = document.getElementById('manualTargetSearchResults');
    resultsDiv.innerHTML = ''; 

    if (targets.length === 0) {
        resultsDiv.innerHTML = '<p>Nenhum alvo ativo encontrado ou todos já estão na lista do dia.</p>';
        return;
    }

    targets.forEach(target => {
        const itemDiv = document.createElement('div');
        itemDiv.classList.add('manual-target-item');
        itemDiv.onclick = () => selectManualTarget(target.id, target.title); 

        let categoryInfo = target.category ? `[${target.category}] ` : '';
        let detailsSnippet = target.details ? `- ${target.details.substring(0, 50)}...` : '';

        itemDiv.innerHTML = `
            <h4>${target.title || 'Sem Título'}</h4>
            <span>${categoryInfo}${formatDateForDisplay(target.date)} ${detailsSnippet}</span>
        `;
        resultsDiv.appendChild(itemDiv);
    });
}

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
        await runTransaction(db, async (transaction) => {
            const dailyDocSnap = await transaction.get(dailyRef);
            let currentTargetsArray = [];

            if (dailyDocSnap.exists()) {
                currentTargetsArray = dailyDocSnap.data().targets || [];
            } else {
                console.warn(`[selectManualTarget] Daily document ${dailyDocId} does not exist during transaction!`);
                throw new Error("Documento diário não encontrado. Tente recarregar a página.");
            }

            const alreadyExists = currentTargetsArray.some(t => t?.targetId === targetId);
            if (alreadyExists) {
                alert(`"${targetTitle || targetId}" já está na lista de hoje.`);
                console.log(`[selectManualTarget] Target ${targetId} already in list.`);
                return; 
            }

            const newTargetEntry = {
                targetId: targetId,
                completed: false,
                manuallyAdded: true 
            };
            const updatedTargetsArray = [...currentTargetsArray, newTargetEntry];

            transaction.update(dailyRef, { targets: updatedTargetsArray });
            console.log(`[selectManualTarget] Target ${targetId} added to daily doc via transaction.`);
        });

        alert(`"${targetTitle || targetId}" adicionado à lista do dia!`);
        if (modal) modal.style.display = 'none'; 

        await loadDailyTargets();

    } catch (error) {
        console.error("Error adding manual target to daily list:", error);
        alert("Erro ao adicionar alvo manual: " + error.message);
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

    checkboxesContainer.innerHTML = '';

    predefinedCategories.forEach(category => {
        const checkboxId = `category-${category.replace(/\s+/g, '-')}`; 
        const div = document.createElement('div');
        div.classList.add('category-checkbox-item'); 

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = checkboxId;
        checkbox.value = category;
        checkbox.name = 'selectedCategories';

        const label = document.createElement('label');
        label.htmlFor = checkboxId;
        label.textContent = category;

        div.appendChild(checkbox);
        div.appendChild(label);
        checkboxesContainer.appendChild(div);
    });

    modal.style.display = 'block';
}

function generateCategoryFilteredView() {
    const modal = document.getElementById('categorySelectionModal');
    const checkboxesContainer = document.getElementById('categoryCheckboxesContainer');
    if (!checkboxesContainer || !modal) return;

    const selectedCheckboxes = checkboxesContainer.querySelectorAll('input[name="selectedCategories"]:checked');
    const selectedCategories = Array.from(selectedCheckboxes).map(cb => cb.value);

    if (selectedCategories.length === 0) {
        alert("Por favor, selecione pelo menos uma categoria.");
        return;
    }

    const filteredTargets = prayerTargets.filter(target => {
        return !target.archived && !target.resolved && target.category && selectedCategories.includes(target.category);
    });

    filteredTargets.sort((a, b) => {
        const catCompare = (a.category || '').localeCompare(b.category || '');
        if (catCompare !== 0) return catCompare;
        const dateA = a.date ? a.date.getTime() : 0;
        const dateB = b.date ? b.date.getTime() : 0;
        return dateB - dateA; 
    });

    const pageTitle = `Alvos por Categoria: ${selectedCategories.join(', ')}`;
    generateViewHTML(filteredTargets, pageTitle);

    modal.style.display = 'none';
}


// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("[DOMContentLoaded] DOM fully loaded. Setting up listeners.");
    
    const dateInput = document.getElementById('date');
    if (dateInput) dateInput.value = formatDateToISO(new Date()); 

    onAuthStateChanged(auth, (user) => loadData(user));

    document.getElementById('searchMain')?.addEventListener('input', handleSearchMain);
    document.getElementById('searchArchived')?.addEventListener('input', handleSearchArchived);
    document.getElementById('searchResolved')?.addEventListener('input', handleSearchResolved);
    document.getElementById('showDeadlineOnly')?.addEventListener('change', handleDeadlineFilterChange);
    document.getElementById('showExpiredOnlyMain')?.addEventListener('change', handleExpiredOnlyMainChange);

    document.getElementById('btnEmailSignUp')?.addEventListener('click', signUpWithEmailPassword);
    document.getElementById('btnEmailSignIn')?.addEventListener('click', signInWithEmailPassword);
    document.getElementById('btnForgotPassword')?.addEventListener('click', resetPassword);
    document.getElementById('btnLogout')?.addEventListener('click', () => {
        signOut(auth).catch(error => console.error("Logout error:", error));
    });

    document.getElementById("viewReportButton")?.addEventListener('click', () => window.location.href = 'orei.html');

    document.getElementById("refreshDaily")?.addEventListener("click", async () => {
        const user = auth.currentUser; if (!user) { alert("Você precisa estar logado."); return; }
        if (confirm("Gerar nova lista de alvos para hoje? Isso substituirá a lista atual, incluindo os que já foram marcados como 'Orado'.")) {
            const userId = user.uid; const todayStr = formatDateToISO(new Date()); const dailyDocId = `${userId}_${todayStr}`;
            const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);
            document.getElementById("dailyTargets").innerHTML = '<p>Gerando nova lista...</p>'; 
            try {
                const newTargetsData = await generateDailyTargets(userId, todayStr); 
                await setDoc(dailyRef, newTargetsData); 
                await loadDailyTargets(); 
                alert("Nova lista de alvos do dia gerada!");
            } catch (error) {
                console.error("Error refreshing daily targets:", error);
                alert("Erro ao gerar nova lista de alvos: " + error.message);
                await loadDailyTargets(); 
            }
        }
     });
     document.getElementById("copyDaily")?.addEventListener("click", () => {
        const dailyTargetsDiv = document.getElementById('dailyTargets');
        let textToCopy = 'Alvos Pendentes Hoje:\n\n';
        let count = 0;
        if (!dailyTargetsDiv) return;
        const targetDivs = dailyTargetsDiv.querySelectorAll('.target:not(.completed-target)'); 
        targetDivs.forEach((div) => {
            const titleElement = div.querySelector('h3');
            let titleText = 'Sem Título';
            if(titleElement && titleElement.lastChild && titleElement.lastChild.nodeType === Node.TEXT_NODE) {
                 titleText = titleElement.lastChild.textContent.trim();
            } else if (titleElement) {
                titleText = titleElement.textContent.replace(/Prazo:.*?\d{2}\/\d{2}\/\d{4}/, '').trim(); 
                predefinedCategories.forEach(cat => titleText = titleText.replace(cat, '')); 
                titleText = titleText.trim() || 'Sem Título';
            }

            const detailsElement = div.querySelector('p.target-details'); 
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

    document.getElementById("addManualTargetButton")?.addEventListener('click', () => {
        const user = auth.currentUser;
        if (!user) { alert("Você precisa estar logado para adicionar alvos."); return; }
        openManualTargetModal();
    });

     document.getElementById('generateViewButton')?.addEventListener('click', () => generateViewHTML(lastDisplayedTargets)); 
     document.getElementById('generateCategoryViewButton')?.addEventListener('click', openCategorySelectionModal); 
     document.getElementById('viewDaily')?.addEventListener('click', generateDailyViewHTML);
     document.getElementById("viewResolvedViewButton")?.addEventListener("click", () => {
         const modal = document.getElementById("dateRangeModal");
         if(modal) {
            modal.style.display = "block";
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

    document.getElementById('backToMainButton')?.addEventListener('click', () => showPanel('dailySection'));
    document.getElementById('addNewTargetButton')?.addEventListener('click', () => showPanel('appContent'));
    document.getElementById('viewAllTargetsButton')?.addEventListener('click', () => { showPanel('mainPanel'); currentPage = 1; renderTargets(); });
    document.getElementById("viewArchivedButton")?.addEventListener("click", () => { showPanel('archivedPanel'); currentArchivedPage = 1; renderArchivedTargets(); });
    document.getElementById("viewResolvedButton")?.addEventListener("click", () => { showPanel('resolvedPanel'); currentResolvedPage = 1; renderResolvedTargets(); });

    const dateRangeModal = document.getElementById("dateRangeModal");
    document.getElementById("closeDateRangeModal")?.addEventListener("click", () => {if(dateRangeModal) dateRangeModal.style.display = "none"});
    document.getElementById("generateResolvedView")?.addEventListener("click", () => {
        const startDateStr = document.getElementById("startDate").value;
        const endDateStr = document.getElementById("endDate").value;
        if (startDateStr && endDateStr) {
            const start = new Date(startDateStr + 'T00:00:00Z'); // Usar Z para UTC
            const end = new Date(endDateStr + 'T00:00:00Z');   // Usar Z para UTC
             if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                 alert("Datas inválidas selecionadas.");
                 return;
             }
             if (start > end) {
                 alert("A data de início não pode ser posterior à data de fim.");
                 return;
             }
            generateResolvedViewHTML(start, end); 
            if(dateRangeModal) dateRangeModal.style.display = "none"; 
        } else {
            alert("Por favor, selecione as datas de início e fim.");
        }
    });
    document.getElementById("cancelDateRange")?.addEventListener("click", () => {if(dateRangeModal) dateRangeModal.style.display = "none"});

    const manualTargetModal = document.getElementById("manualTargetModal");
    document.getElementById("closeManualTargetModal")?.addEventListener("click", () => { if(manualTargetModal) manualTargetModal.style.display = "none" });
    document.getElementById("manualTargetSearchInput")?.addEventListener('input', handleManualTargetSearch);

    const categoryModal = document.getElementById('categorySelectionModal');
    document.getElementById('closeCategoryModal')?.addEventListener('click', () => { if(categoryModal) categoryModal.style.display = 'none'; });
    document.getElementById('cancelCategoryView')?.addEventListener('click', () => { if(categoryModal) categoryModal.style.display = 'none'; });
    document.getElementById('confirmCategoryView')?.addEventListener('click', generateCategoryFilteredView);


    window.addEventListener('click', (event) => {
        if (event.target == dateRangeModal) {
            dateRangeModal.style.display = "none";
        }
        if (event.target == manualTargetModal) {
            manualTargetModal.style.display = "none";
        }
        if (event.target == categoryModal) {
             categoryModal.style.display = "none";
        }
    });

}); 

// Expondo funções globalmente para onclicks no HTML
window.markAsResolved = markAsResolved;
window.archiveTarget = archiveTarget;
window.deleteArchivedTarget = deleteArchivedTarget;
window.toggleAddObservation = toggleAddObservation;
window.saveObservation = saveObservation;
window.editDeadline = editDeadline;
window.saveEditedDeadline = saveEditedDeadline;
window.cancelEditDeadline = cancelEditDeadline;
window.editCategory = editCategory;
window.saveEditedCategory = saveEditedCategory;
window.cancelEditCategory = cancelEditCategory;
window.openManualTargetModal = openManualTargetModal;
window.handleManualTargetSearch = handleManualTargetSearch;
window.selectManualTarget = selectManualTarget;
