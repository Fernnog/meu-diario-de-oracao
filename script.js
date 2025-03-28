import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-analytics.js";
import { getAuth, signOut, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
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
let perseveranceData = { consecutiveDays: 0, lastInteractionDate: null, recordDays: 0 };
// const timezoneOffsetHours = 4; // Não mais necessário com strings

// ==== FUNÇÕES UTILITÁRIAS ====

// **NOVA**: Converte string 'YYYY-MM-DD' para objeto Date (meia-noite local)
function parseLocalDate(dateString) {
    if (!dateString || typeof dateString !== 'string') return null;
    try {
        // Tratamento robusto para evitar problemas com new Date(string)
        const parts = dateString.split('-');
        if (parts.length !== 3) return null;
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10); // 1-based month
        const day = parseInt(parts[2], 10);

        if (isNaN(year) || isNaN(month) || isNaN(day) || month < 1 || month > 12 || day < 1 || day > 31) return null;

        // Cria o objeto Date com meia-noite no fuso horário local
        const dateObj = new Date(year, month - 1, day); // month-1 for 0-based index
        // Verifica se a data criada corresponde aos inputs (evita overflow de mês/dia)
        if (dateObj.getFullYear() === year && dateObj.getMonth() === month - 1 && dateObj.getDate() === day) {
             return dateObj;
        } else {
             // console.warn(`[parseLocalDate] Invalid date components created from string: ${dateString}`);
             return null; // Data inválida resultante
        }
    } catch (e) {
        console.error(`[parseLocalDate] Error parsing date string ${dateString}:`, e);
        return null;
    }
}

// Mantém a função para formatar input 'date' para 'YYYY-MM-DD'
function formatDateToISO(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
        // console.warn("formatDateToISO received invalid date, defaulting to today:", date);
        date = new Date();
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// **MODIFICADA**: Aceita Date, Timestamp ou string 'YYYY-MM-DD'
function formatDateForDisplay(dateInput) {
    let dateToFormat = null;

    if (!dateInput) return 'Data Inválida';

    if (dateInput instanceof Date && !isNaN(dateInput.getTime())) {
        dateToFormat = dateInput;
    } else if (dateInput instanceof Timestamp) {
        dateToFormat = dateInput.toDate(); // Converte Timestamp para Date local
    } else if (typeof dateInput === 'string') {
        dateToFormat = parseLocalDate(dateInput); // Usa a nova função para converter string 'YYYY-MM-DD' para Date local
    }

    if (!dateToFormat || isNaN(dateToFormat.getTime())) {
        // console.warn("[formatDateForDisplay] Could not parse input to valid date:", dateInput);
        return 'Data Inválida';
    }

    // Formata a data válida
    const day = String(dateToFormat.getDate()).padStart(2, '0');
    const month = String(dateToFormat.getMonth() + 1).padStart(2, '0');
    const year = dateToFormat.getFullYear();
    return `${day}/${month}/${year}`;
}

// **MODIFICADA**: Aceita Date, Timestamp ou string 'YYYY-MM-DD'
function timeElapsed(dateInput) {
    let pastDate = null;
    if (!dateInput) return 'Data Inválida';

    if (dateInput instanceof Date && !isNaN(dateInput.getTime())) {
        pastDate = dateInput;
    } else if (dateInput instanceof Timestamp) {
        pastDate = dateInput.toDate();
    } else if (typeof dateInput === 'string') {
        pastDate = parseLocalDate(dateInput); // Usa a nova função para obter Date local
    }

    if (!pastDate || isNaN(pastDate.getTime())) return 'Data Inválida';

    const now = new Date();
    // pastDate representa meia-noite local, now é o momento atual
    let diffInSeconds = Math.floor((now - pastDate) / 1000);

    if (diffInSeconds < 0) diffInSeconds = 0; // Evita tempos negativos

    // Lógica de formatação (inalterada)
    if (diffInSeconds < 60) return `${diffInSeconds} segundos`;
    let diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes} minutos`;
    let diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} horas`;
    let diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 30) return `${diffInDays} dias`;
    let diffInMonths = Math.floor(diffInDays / 30.44); // Média
    if (diffInMonths < 12) return `${diffInMonths} meses`;
    let diffInYears = Math.floor(diffInDays / 365.25); // Considera bissextos
    return `${diffInYears} anos`;
}


// **MODIFICADA**: Aceita Date, Timestamp ou string 'YYYY-MM-DD'
function isDateExpired(dateInput) {
    let deadline = null;
    if (!dateInput) return false;

    if (dateInput instanceof Date && !isNaN(dateInput.getTime())) {
        deadline = dateInput;
    } else if (dateInput instanceof Timestamp) {
        deadline = dateInput.toDate();
    } else if (typeof dateInput === 'string') {
        deadline = parseLocalDate(dateInput); // Usa a nova função
    }

    if (!deadline || isNaN(deadline.getTime())) return false; // Data inválida

    const now = new Date();
    // Compara apenas a parte da data (meia-noite local)
    const deadlineDayStart = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
    const nowDayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // O prazo expira se a meia-noite do dia do prazo for anterior à meia-noite de hoje
    return deadlineDayStart < nowDayStart;
}

function generateUniqueId() {
    // Combina timestamp com parte aleatória para maior unicidade
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 15);
}


// **MODIFICADA**: Simplificada para datas armazenadas como string
function rehydrateTargets(targets) {
    // console.log('[rehydrateTargets] Starting rehydration for', targets.length, 'targets.');
    return targets.map((target, index) => {
        const rehydratedTarget = { ...target };

        // *** CAMPOS 'date', 'deadlineDate' SÃO STRINGS OU NULL - NÃO HÁ CONVERSÃO AQUI ***

        // Trata outros campos que ainda podem ser Timestamp (ex: resolutionDate, lastPresentedDate)
        const fieldsToConvert = ['resolutionDate', 'lastPresentedDate'];
        fieldsToConvert.forEach(fieldName => {
            const originalValue = rehydratedTarget[fieldName];
            try {
                if (originalValue instanceof Timestamp) {
                    rehydratedTarget[fieldName] = originalValue.toDate();
                } else if (originalValue && typeof originalValue === 'object' && typeof originalValue.toDate === 'function') {
                     // Compatibilidade com versões mais antigas do Firebase ou formatos inesperados
                     rehydratedTarget[fieldName] = originalValue.toDate();
                } else if (originalValue && !(originalValue instanceof Date)) {
                    // Tenta converter se for string/número (menos provável para estes campos)
                    const parsedDate = new Date(originalValue);
                    rehydratedTarget[fieldName] = isNaN(parsedDate.getTime()) ? null : parsedDate;
                } else if (!(originalValue instanceof Date)) {
                    // Garante null se não for Date ou conversível válido
                    rehydratedTarget[fieldName] = null;
                }
                // Se já for Date, mantém como está.
            } catch (error) {
                console.error(`[rehydrateTargets] Error processing ${fieldName} for target ${target.id}. Original:`, originalValue, error);
                rehydratedTarget[fieldName] = null;
            }
        });

        // Trata observações: data dentro de obs também é string 'YYYY-MM-DD'
        if (rehydratedTarget.observations && Array.isArray(rehydratedTarget.observations)) {
            rehydratedTarget.observations = rehydratedTarget.observations.map(obs => {
                 // A data já é string 'YYYY-MM-DD', apenas retorna a observação
                 return { ...obs };
            });
        } else {
            rehydratedTarget.observations = [];
        }

        return rehydratedTarget;
    });
}
// ==== FIM FUNÇÕES UTILITÁRIAS ====


// ==== Funções de Autenticação (Inalteradas) ====
function updateAuthUI(user) {
    const authStatus = document.getElementById('authStatus');
    const btnLogout = document.getElementById('btnLogout');
    const btnGoogleLogin = document.getElementById('btnGoogleLogin');
    const emailPasswordAuthForm = document.getElementById('emailPasswordAuthForm');
    const authStatusContainer = document.querySelector('.auth-status-container');
    const authSection = document.getElementById('authSection'); // Container geral da autenticação
    const mainMenu = document.getElementById('mainMenu'); // Container do menu principal

    if (user) {
        // Usuário logado: ajusta exibição do status/logout, esconde forms
        if (authStatusContainer) authStatusContainer.style.display = 'flex';
        if (btnLogout) btnLogout.style.display = 'inline-block';
        if (btnGoogleLogin) btnGoogleLogin.style.display = 'none';
        if (emailPasswordAuthForm) emailPasswordAuthForm.style.display = 'none';
        if (authSection) authSection.style.display = 'none'; // Esconde toda a seção de auth
        if (mainMenu) mainMenu.style.display = 'block'; // Mostra o menu principal

        // Define o texto de status
        if (authStatus) {
            if (user.providerData[0].providerId === 'google.com') {
                authStatus.textContent = `Usuário: ${user.email} (Google)`;
            } else if (user.providerData[0].providerId === 'password') {
                authStatus.textContent = `Usuário: ${user.email} (E-mail)`;
            } else {
                authStatus.textContent = `Usuário: ${user.email}`;
            }
        }
    } else {
        // Usuário deslogado: ajusta exibição do status/login, mostra forms
        if (authStatusContainer) authStatusContainer.style.display = 'block'; // Pode ser block ou flex dependendo do layout desejado
        if (btnLogout) btnLogout.style.display = 'none';
        if (btnGoogleLogin) btnGoogleLogin.style.display = 'inline-block';
        if (emailPasswordAuthForm) emailPasswordAuthForm.style.display = 'block';
        if (authSection) authSection.style.display = 'flex'; // Mostra a seção de auth
        if (mainMenu) mainMenu.style.display = 'none'; // Esconde o menu principal

        if (authStatus) authStatus.textContent = "Nenhum usuário autenticado";
    }
}

async function signInWithGoogle() {
    // console.log("signInWithGoogle function CALLED!");
    const provider = new GoogleAuthProvider();
    try {
        const userCredential = await signInWithPopup(auth, provider);
        const user = userCredential.user;
        loadData(user);
    } catch (error) {
        console.error("Erro ao entrar com o Google:", error);
        // console.error("Error Object:", error);
        alert("Erro ao entrar com o Google: " + error.message);
    }
}

async function signUpWithEmailPassword() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        alert("Cadastro realizado com sucesso!");
        loadData(user);
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
        const user = userCredential.user;
        loadData(user);
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
    try {
        await sendPasswordResetEmail(auth, email);
        alert("Um e-mail de redefinição de senha foi enviado para " + email + ".");
    } catch (error) {
        console.error("Erro ao enviar e-mail de redefinição de senha:", error);
        alert("Erro ao redefinir senha: " + error.message);
    }
}
// ==== FIM Funções de Autenticação ====

// ==== Funções de Alvos Diários (Inalteradas) ====
async function generateDailyTargets(userId, dateStr) {
    try {
        const activeTargetsQuery = query(collection(db, "users", userId, "prayerTargets"));
        const activeTargetsSnapshot = await getDocs(activeTargetsQuery);
        let availableTargets = [];
        activeTargetsSnapshot.forEach(doc => {
            const targetData = doc.data();
            if (targetData && targetData.title) {
                 availableTargets.push({ ...targetData, id: doc.id });
            } else {
                // console.warn(`[generateDailyTargets] Skipping target ${doc.id} due to potentially invalid data.`);
            }
        });

        // Rehydrate (importante para lastPresentedDate etc., embora datas principais sejam strings)
        availableTargets = rehydrateTargets(availableTargets);

        if (availableTargets.length === 0) {
            // console.log("[generateDailyTargets] No active targets found or valid after rehydration.");
            return { userId, date: dateStr, targets: [] };
        }

        // Busca concluídos ontem
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = formatDateToISO(yesterday);
        const yesterdayDocId = `${userId}_${yesterdayStr}`;
        const yesterdayRef = doc(db, "dailyPrayerTargets", yesterdayDocId);
        let completedYesterday = [];
        try {
            const yesterdaySnap = await getDoc(yesterdayRef);
            if (yesterdaySnap.exists()) {
                const yesterdayData = yesterdaySnap.data();
                if (yesterdayData && Array.isArray(yesterdayData.targets)) {
                    completedYesterday = yesterdayData.targets.filter(t => t.completed).map(t => t.targetId);
                }
            }
        } catch (error) {
            console.warn("[generateDailyTargets] Error fetching previous day's targets:", error);
        }

        // Filtra pool
        let pool = availableTargets.filter(target => target.id && !completedYesterday.includes(target.id));

        // Reinicia ciclo se necessário
        if (pool.length === 0 && availableTargets.length > 0) {
            if (availableTargets.length === completedYesterday.length) {
                // console.log("[generateDailyTargets] All active targets completed yesterday. Restarting cycle.");
                pool = availableTargets; // Usa a lista completa novamente
            } else {
                // console.log("[generateDailyTargets] Pool empty, but not all targets were completed yesterday.");
                return { userId, date: dateStr, targets: [] };
            }
        } else if (pool.length === 0) {
             // console.log("[generateDailyTargets] No targets in the pool.");
             return { userId, date: dateStr, targets: [] };
        }

        // Seleciona aleatório
        const shuffledPool = pool.sort(() => 0.5 - Math.random());
        const selectedTargets = shuffledPool.slice(0, Math.min(10, pool.length));
        const targets = selectedTargets.map(target => ({ targetId: target.id, completed: false }));

        await updateLastPresentedDates(userId, selectedTargets); // Atualiza Timestamp

        // console.log(`[generateDailyTargets] Generated ${targets.length} daily targets for ${userId} on ${dateStr}.`);
        return { userId, date: dateStr, targets };
    } catch (error) {
        console.error("[generateDailyTargets] General error:", error);
        return { userId, date: dateStr, targets: [] };
    }
}

async function updateLastPresentedDates(userId, selectedTargets) {
    if (!selectedTargets || selectedTargets.length === 0) return;
    const batch = writeBatch(db);
    const nowTimestamp = Timestamp.fromDate(new Date()); // Sempre usa Timestamp aqui
    selectedTargets.forEach(target => {
        if (target && target.id) {
            const targetRef = doc(db, "users", userId, "prayerTargets", target.id);
            batch.update(targetRef, { lastPresentedDate: nowTimestamp });
        }
    });
    try {
        await batch.commit();
        // console.log(`[updateLastPresentedDates] Updated for ${selectedTargets.length} targets.`);
    } catch (error) {
        console.error("[updateLastPresentedDates] Error committing batch:", error);
    }
}

async function loadDailyTargets() {
    const userId = auth.currentUser ? auth.currentUser.uid : null;
    if (!userId) {
        document.getElementById("dailyTargets").innerHTML = "<p>Faça login para ver os alvos diários.</p>";
        return;
    }

    const todayStr = formatDateToISO(new Date());
    const dailyDocId = `${userId}_${todayStr}`;
    const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);

    try {
        let dailyTargetsData;
        const dailySnapshot = await getDoc(dailyRef);

        if (!dailySnapshot.exists()) {
            // console.log(`[loadDailyTargets] Daily document ${dailyDocId} not found, generating...`);
            dailyTargetsData = await generateDailyTargets(userId, todayStr);
            try {
                await setDoc(dailyRef, dailyTargetsData);
                // console.log(`[loadDailyTargets] Daily document ${dailyDocId} created.`);
            } catch (error) { /* ... */ return; }
        } else {
            dailyTargetsData = dailySnapshot.data();
            // console.log(`[loadDailyTargets] Daily document ${dailyDocId} loaded.`);
        }

        if (!dailyTargetsData || !Array.isArray(dailyTargetsData.targets)) {
            console.error("[loadDailyTargets] Invalid daily targets data:", dailyTargetsData);
            document.getElementById("dailyTargets").innerHTML = "<p>Erro ao carregar alvos diários (dados inválidos).</p>";
            return;
        }

        const pendingTargetIds = dailyTargetsData.targets.filter(t => !t.completed).map(t => t.targetId);
        const completedTargetIds = dailyTargetsData.targets.filter(t => t.completed).map(t => t.targetId);
        // console.log(`[loadDailyTargets] Pending: ${pendingTargetIds.length}, Completed: ${completedTargetIds.length}`);

        const allTargetIds = [...pendingTargetIds, ...completedTargetIds];
        if (allTargetIds.length === 0) {
            document.getElementById("dailyTargets").innerHTML = "<p>Nenhum alvo de oração para hoje.</p>";
             displayRandomVerse();
            return;
        }

        // Busca detalhes dos alvos locais (prayerTargets)
        const targetsToDisplayDetails = prayerTargets.filter(pt => allTargetIds.includes(pt.id));
        const pendingTargetsDetails = targetsToDisplayDetails.filter(t => pendingTargetIds.includes(t.id));
        const completedTargetsDetails = targetsToDisplayDetails.filter(t => completedTargetIds.includes(t.id));

        renderDailyTargets(pendingTargetsDetails, completedTargetsDetails);
        displayRandomVerse();

    } catch (error) {
        console.error("[loadDailyTargets] General error:", error);
        document.getElementById("dailyTargets").innerHTML = "<p>Erro ao carregar alvos diários.</p>";
    }
}

function renderDailyTargets(pendingTargets, completedTargets) {
    const dailyTargetsDiv = document.getElementById("dailyTargets");
    dailyTargetsDiv.innerHTML = '';

    if (pendingTargets.length === 0 && completedTargets.length === 0) {
        dailyTargetsDiv.innerHTML = "<p>Nenhum alvo de oração selecionado para hoje.</p>";
        return;
    }

    pendingTargets.forEach((target) => {
        if (!target || !target.id) return;
        const dailyDiv = createTargetElement(target, false); // Not completed
        addPrayButtonFunctionality(dailyDiv, target.id);
        dailyTargetsDiv.appendChild(dailyDiv);
    });

    if (pendingTargets.length > 0 && completedTargets.length > 0) {
         const separator = document.createElement('hr'); separator.style.borderColor = '#ccc'; dailyTargetsDiv.appendChild(separator);
         const completedTitle = document.createElement('h3'); completedTitle.textContent = "Concluídos Hoje"; completedTitle.style.cssText = 'color:#777; font-size:1.1em;'; dailyTargetsDiv.appendChild(completedTitle);
    } else if (pendingTargets.length === 0 && completedTargets.length > 0) {
         const completedTitle = document.createElement('h3'); completedTitle.textContent = "Concluídos Hoje"; completedTitle.style.cssText = 'color:#777; font-size:1.1em;'; dailyTargetsDiv.appendChild(completedTitle);
    }

    completedTargets.forEach((target) => {
         if (!target || !target.id) return;
        const dailyDiv = createTargetElement(target, true); // Completed
        dailyTargetsDiv.appendChild(dailyDiv);
    });

    if (pendingTargets.length === 0 && completedTargets.length > 0) {
        displayCompletionPopup();
    }
}

function createTargetElement(target, isCompleted) {
    const dailyDiv = document.createElement("div");
    dailyDiv.classList.add("target");
    if (isCompleted) dailyDiv.classList.add("completed-target");
    dailyDiv.dataset.targetId = target.id;

    let deadlineTag = '';
    if (target.hasDeadline && target.deadlineDate) { // Verifica string
        try {
            const formattedDeadline = formatDateForDisplay(target.deadlineDate);
            deadlineTag = `<span class="deadline-tag ${isDateExpired(target.deadlineDate) ? 'expired' : ''} ${isCompleted ? 'completed' : ''}">Prazo: ${formattedDeadline}</span>`;
        } catch(e) { deadlineTag = `<span class="deadline-tag error">Erro</span>`; }
    }

    const observationsHTML = renderObservations(target.observations || [], false, target.id);

    let formattedCreationDate = 'Inválida';
    let timeElapsedStr = 'Inválido';
    try { formattedCreationDate = formatDateForDisplay(target.date); } catch(e) {}
    try { timeElapsedStr = timeElapsed(target.date); } catch(e) {}

    dailyDiv.innerHTML = `
        <h3>${deadlineTag} ${target.title || 'Título Ind.'}</h3>
        <p>${target.details || 'Detalhes Ind.'}</p>
        <p><strong>Criação:</strong> ${formattedCreationDate}</p>
        <p><strong>Decorrido:</strong> ${timeElapsedStr}</p>
        <div id="observations-${target.id}" class="observations-list" style="display:block;">${observationsHTML}</div> <!-- Container para obs -->
    `;
    return dailyDiv;
}

function addPrayButtonFunctionality(dailyDiv, targetId) {
    const prayButton = document.createElement("button");
    prayButton.textContent = "Orei!";
    prayButton.classList.add("pray-button", "btn");
    prayButton.onclick = async () => {
        const userId = auth.currentUser.uid;
        const todayStr = formatDateToISO(new Date());
        const dailyDocId = `${userId}_${todayStr}`;
        const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);

        prayButton.disabled = true; prayButton.textContent = "Orado!";

        try {
            const dailySnap = await getDoc(dailyRef);
            if (!dailySnap.exists()) { /* ... erro ... */ return; }

            const dailyData = dailySnap.data();
            const updatedTargets = dailyData.targets.map(t =>
                t.targetId === targetId ? { ...t, completed: true } : t
            );

            await updateDoc(dailyRef, { targets: updatedTargets });
            // console.log(`[addPrayButtonFunctionality] Target ${targetId} marked completed.`);
            await updateClickCounts(userId, targetId);
            loadDailyTargets(); // Re-render
        } catch (error) {
            console.error("[addPrayButtonFunctionality] Error:", error);
            alert("Erro ao registrar oração.");
            prayButton.disabled = false; prayButton.textContent = "Orei!";
        }
    };
    if (dailyDiv.firstChild) {
         dailyDiv.insertBefore(prayButton, dailyDiv.firstChild);
     } else {
         dailyDiv.appendChild(prayButton);
     }
}

async function updateClickCounts(userId, targetId) {
     const clickCountsRef = doc(db, "prayerClickCounts", targetId);
     const now = new Date();
     const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
     const year = now.getFullYear().toString();
     try {
         const docSnap = await getDoc(clickCountsRef);
         if (docSnap.exists()) {
             await updateDoc(clickCountsRef, {
                 totalClicks: increment(1),
                 [`monthlyClicks.${yearMonth}`]: increment(1),
                 [`yearlyClicks.${year}`]: increment(1),
             });
         } else {
             await setDoc(clickCountsRef, {
                 targetId: targetId, userId: userId, totalClicks: 1,
                 monthlyClicks: { [yearMonth]: 1 }, yearlyClicks: { [year]: 1 }
             });
         }
         // console.log(`[updateClickCounts] Updated for target ${targetId}.`);
     } catch (error) {
         console.error(`[updateClickCounts] Error for target ${targetId}:`, error);
     }
 }
// ==== FIM Funções de Alvos Diários ====


// ==== Funções de Carregamento e Renderização Principal (Inalteradas) ====
async function loadData(user) {
    updateAuthUI(user); // Atualiza UI de autenticação antes de tudo
    const uid = user ? user.uid : null;

    if (uid) {
        // console.log(`[loadData] User ${uid} authenticated. Loading data...`);
        try {
            // Mostra seções principais apenas se logado
            showPanel('dailySection'); // Mostra a visão diária por padrão ao logar

            await fetchPrayerTargets(uid); // Fetches targets (datas são strings)
            await fetchArchivedTargets(uid); // Fetches targets (datas são strings)

            // Filtra e ordena resolvidos (resolutionDate é Date/Timestamp)
            resolvedTargets = archivedTargets.filter(target => target.resolved).sort((a, b) => {
                const dateA = (a.resolutionDate instanceof Date && !isNaN(a.resolutionDate)) ? a.resolutionDate : new Date(0);
                const dateB = (b.resolutionDate instanceof Date && !isNaN(b.resolutionDate)) ? b.resolutionDate : new Date(0);
                return dateB - dateA;
            });

            checkExpiredDeadlines(); // Usa isDateExpired modificada
            // Renderiza listas em background, mesmo que não estejam visíveis inicialmente
            renderTargets();
            renderArchivedTargets();
            renderResolvedTargets();

            await loadDailyTargets(); // Carrega/gera e renderiza alvos diários
            await loadPerseveranceData(uid); // Carrega dados de perseverança
        } catch (error) {
             console.error("[loadData] Error during data loading process:", error);
             alert("Ocorreu um erro ao carregar seus dados. Por favor, recarregue a página.");
             // Esconde painéis em caso de erro grave? Ou mostra mensagem no painel?
             document.getElementById('dailyTargets').innerHTML = "<p>Erro ao carregar dados.</p>";
         }
    } else {
        // console.log("[loadData] No user authenticated. Clearing data and UI.");
        prayerTargets = []; archivedTargets = []; resolvedTargets = []; // Limpa dados locais
        // Limpa as listas na UI
        renderTargets(); renderArchivedTargets(); renderResolvedTargets();
        document.getElementById("dailyTargets").innerHTML = "<p>Faça login para ver os alvos diários.</p>";
        document.getElementById('dailyVerses').textContent = '';
        resetPerseveranceUI();
        showPanel('authSection'); // Garante que a seção de login seja exibida
    }
}

async function fetchPrayerTargets(uid) {
    prayerTargets = [];
    const targetsRef = collection(db, "users", uid, "prayerTargets");
    const targetsSnapshot = await getDocs(query(targetsRef, orderBy("date", "desc"))); // Ordena por string ISO
    const rawTargets = [];
    targetsSnapshot.forEach((doc) => rawTargets.push({ ...doc.data(), id: doc.id }));
    prayerTargets = rehydrateTargets(rawTargets); // Trata outros campos Timestamp/Date
    // console.log("[fetchPrayerTargets] Fetched and rehydrated active targets:", prayerTargets.length);
}

async function fetchArchivedTargets(uid) {
    archivedTargets = [];
    const archivedRef = collection(db, "users", uid, "archivedTargets");
    const archivedSnapshot = await getDocs(query(archivedRef, orderBy("date", "desc")));
    const rawArchived = [];
    archivedSnapshot.forEach((doc) => rawArchived.push({ ...doc.data(), id: doc.id }));
    archivedTargets = rehydrateTargets(rawArchived); // Trata outros campos Timestamp/Date
    // console.log("[fetchArchivedTargets] Fetched and rehydrated archived targets:", archivedTargets.length);
}
// ==== FIM Funções de Carregamento ====


// ==== Funções de Renderização das Listas (Principal, Arquivados, Resolvidos) ====
// **MODIFICADAS** (renderTargets, renderArchivedTargets, renderResolvedTargets)
// Usam as funções utilitárias que agora aceitam strings 'YYYY-MM-DD'
// A lógica interna de filtros, ordenação (por string ISO) e paginação foi ajustada na resposta anterior.
// A estrutura do HTML gerado dentro delas também foi ajustada para usar as funções utilitárias corretas.

function renderTargets() {
    const targetListDiv = document.getElementById('targetList');
    targetListDiv.innerHTML = '';
    let filteredAndPagedTargets = [...prayerTargets];

    // Filtros
    if (currentSearchTermMain) filteredAndPagedTargets = filterTargets(filteredAndPagedTargets, currentSearchTermMain);
    if (showDeadlineOnly) filteredAndPagedTargets = filteredAndPagedTargets.filter(t => t.hasDeadline && t.deadlineDate);
    const showExpiredOnlyMainCheckbox = document.getElementById('showExpiredOnlyMain');
    if (showExpiredOnlyMainCheckbox && showExpiredOnlyMainCheckbox.checked) {
        filteredAndPagedTargets = filteredAndPagedTargets.filter(t => t.hasDeadline && t.deadlineDate && isDateExpired(t.deadlineDate));
    }

    // Ordenação
    if (showDeadlineOnly || (showExpiredOnlyMainCheckbox && showExpiredOnlyMainCheckbox.checked)) {
        filteredAndPagedTargets.sort((a, b) => (a.deadlineDate || "9999-99-99").localeCompare(b.deadlineDate || "9999-99-99")); // Prazos mais próximos primeiro, sem prazo por último
    } else {
        filteredAndPagedTargets.sort((a, b) => (b.date || "").localeCompare(a.date || "")); // Mais recente primeiro
    }

    // Paginação
    const startIndex = (currentPage - 1) * targetsPerPage;
    const endIndex = startIndex + targetsPerPage;
    const targetsToDisplay = filteredAndPagedTargets.slice(startIndex, endIndex);
    lastDisplayedTargets = targetsToDisplay;

    if (targetsToDisplay.length === 0 && currentPage > 1) { currentPage = 1; renderTargets(); return; }
    if (targetsToDisplay.length === 0) { targetListDiv.innerHTML = '<p>Nenhum alvo de oração encontrado.</p>'; renderPagination('mainPanel', currentPage, filteredAndPagedTargets); return; }

    targetsToDisplay.forEach((target) => {
        if (!target || !target.id) return;
        const targetDiv = document.createElement("div");
        targetDiv.classList.add("target");
        targetDiv.dataset.targetId = target.id;

        let formattedDate = 'Inválida', elapsed = 'Inválido', deadlineTag = '';
        try { formattedDate = formatDateForDisplay(target.date); } catch (e) {}
        try { elapsed = timeElapsed(target.date); } catch (e) {}
        try {
            if (target.hasDeadline && target.deadlineDate) {
                formattedDeadline = formatDateForDisplay(target.deadlineDate);
                deadlineTag = `<span class="deadline-tag ${isDateExpired(target.deadlineDate) ? 'expired' : ''}">Prazo: ${formattedDeadline}</span>`;
            }
        } catch (e) { deadlineTag = target.hasDeadline ? `<span class="deadline-tag error">Erro</span>` : ''; }

        const observationsHTML = renderObservations(target.observations || [], false, target.id); // Renderiza inicialmente colapsado

        targetDiv.innerHTML = `
            <h3>${deadlineTag} ${target.title || 'Sem Título'}</h3>
            <p>${target.details || 'Sem Detalhes'}</p>
            <p><strong>Data:</strong> ${formattedDate}</p>
            <p><strong>Tempo Decorrido:</strong> ${elapsed}</p>
            <div id="observations-${target.id}" class="observations-list" style="display:block;">${observationsHTML}</div>
            <div class="target-actions">
                <button class="resolved btn" onclick="markAsResolved('${target.id}')">Respondido</button>
                <button class="archive btn" onclick="archiveTarget('${target.id}')">Arquivar</button>
                <button class="add-observation btn" onclick="toggleAddObservation('${target.id}')">Observação</button>
                ${target.hasDeadline ? `<button class="edit-deadline btn" onclick="editDeadline('${target.id}')">Editar Prazo</button>` : ''}
            </div>
            <div id="observationForm-${target.id}" class="add-observation-form" style="display:none;"></div>
        `;
        targetListDiv.appendChild(targetDiv);
        renderObservationForm(target.id); // Prepara o form de observação (oculto)
        // renderExistingObservations(target.id); // Não precisa chamar aqui, renderObservations já faz o trabalho
    });

    renderPagination('mainPanel', currentPage, filteredAndPagedTargets);
}

function renderArchivedTargets() {
    const archivedListDiv = document.getElementById('archivedList');
    archivedListDiv.innerHTML = '';
    let filteredAndPagedArchivedTargets = [...archivedTargets];

    if (currentSearchTermArchived) filteredAndPagedArchivedTargets = filterTargets(filteredAndPagedArchivedTargets, currentSearchTermArchived);
    filteredAndPagedArchivedTargets.sort((a, b) => (b.date || "").localeCompare(a.date || "")); // Ordena por data string desc

    const startIndex = (currentArchivedPage - 1) * targetsPerPage;
    const endIndex = startIndex + targetsPerPage;
    const targetsToDisplay = filteredAndPagedArchivedTargets.slice(startIndex, endIndex);

    if (targetsToDisplay.length === 0 && currentArchivedPage > 1) { currentArchivedPage = 1; renderArchivedTargets(); return; }
    if (targetsToDisplay.length === 0) { archivedListDiv.innerHTML = '<p>Nenhum alvo arquivado encontrado.</p>'; renderPagination('archivedPanel', currentArchivedPage, filteredAndPagedArchivedTargets); return; }

    targetsToDisplay.forEach((target) => {
        if (!target || !target.id) return;
        const archivedDiv = document.createElement("div");
        archivedDiv.classList.add("target", "archived");
        archivedDiv.dataset.targetId = target.id;

        let formattedDate = 'Inválida', elapsed = 'Inválido';
        try { formattedDate = formatDateForDisplay(target.date); } catch (e) {}
        try { elapsed = timeElapsed(target.date); } catch (e) {}
        const observationsHTML = renderObservations(target.observations || [], false, target.id);

        archivedDiv.innerHTML = `
            <h3>${target.title || 'Sem Título'}</h3>
            <p>${target.details || 'Sem Detalhes'}</p>
            <p><strong>Data Arquivado/Criado:</strong> ${formattedDate}</p>
            <p><strong>Tempo Decorrido:</strong> ${elapsed}</p>
            <div id="observations-${target.id}" class="observations-list" style="display:block;">${observationsHTML}</div>
            <div class="target-actions">
                <button class="delete btn" onclick="deleteArchivedTarget('${target.id}')">Excluir</button>
            </div>
        `;
        archivedListDiv.appendChild(archivedDiv);
        // renderExistingObservations(target.id, false); // Não precisa, renderObservations faz
    });
    renderPagination('archivedPanel', currentArchivedPage, filteredAndPagedArchivedTargets);
}

function renderResolvedTargets() {
    const resolvedListDiv = document.getElementById('resolvedList');
    resolvedListDiv.innerHTML = '';
    let filteredAndPagedResolvedTargets = [...resolvedTargets];

    if (currentSearchTermResolved) filteredAndPagedResolvedTargets = filterTargets(filteredAndPagedResolvedTargets, currentSearchTermResolved);
    // Ordena por resolutionDate (Date)
    filteredAndPagedResolvedTargets.sort((a, b) => {
        const dateA = (a.resolutionDate instanceof Date && !isNaN(a.resolutionDate)) ? a.resolutionDate : new Date(0);
        const dateB = (b.resolutionDate instanceof Date && !isNaN(b.resolutionDate)) ? b.resolutionDate : new Date(0);
        return dateB - dateA;
    });

    const startIndex = (currentResolvedPage - 1) * targetsPerPage;
    const endIndex = startIndex + targetsPerPage;
    const targetsToDisplay = filteredAndPagedResolvedTargets.slice(startIndex, endIndex);

    if (targetsToDisplay.length === 0 && currentResolvedPage > 1) { currentResolvedPage = 1; renderResolvedTargets(); return; }
    if (targetsToDisplay.length === 0) { resolvedListDiv.innerHTML = '<p>Nenhum alvo respondido encontrado.</p>'; renderPagination('resolvedPanel', currentResolvedPage, filteredAndPagedResolvedTargets); return; }

    targetsToDisplay.forEach((target) => {
        if (!target || !target.id) return;
        const resolvedDiv = document.createElement("div");
        resolvedDiv.classList.add("target", "resolved");
        resolvedDiv.dataset.targetId = target.id;

        let formattedResolutionDate = 'Inválida', totalTime = 'Inválido';
        try { formattedResolutionDate = formatDateForDisplay(target.resolutionDate); } catch (e) {}
        try {
            const creationDate = parseLocalDate(target.date); // Converte string p/ Date
            const resolutionDate = target.resolutionDate instanceof Date ? target.resolutionDate : null;
            if(creationDate && resolutionDate) { totalTime = adjustedTimeElapsed(creationDate, resolutionDate); }
            else { totalTime = "Datas inválidas"; }
        } catch (e) { console.error("Error calculating total time:", e); }
        const observationsHTML = renderObservations(target.observations || [], false, target.id);

        resolvedDiv.innerHTML = `
            <h3>${target.title || 'Sem Título'} (Respondido)</h3>
            <p>${target.details || 'Sem Detalhes'}</p>
            <p><strong>Data Respondido:</strong> ${formattedResolutionDate}</p>
            <p><strong>Tempo Total (Criação -> Resposta):</strong> ${totalTime}</p>
            <div id="observations-${target.id}" class="observations-list" style="display:block;">${observationsHTML}</div>
        `;
        resolvedListDiv.appendChild(resolvedDiv);
        // renderExistingObservations(target.id, false); // Não precisa
    });
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

    // Botão Anterior
    if (page > 1) {
        const prevLink = document.createElement('a'); prevLink.href = '#'; prevLink.textContent = '« Anterior'; prevLink.classList.add('page-link');
        prevLink.addEventListener('click', (e) => { e.preventDefault(); handlePageChange(panelId, page - 1); });
        paginationDiv.appendChild(prevLink);
    }

    // Números de Página (simplificado)
    const maxPagesToShow = 5;
    let startPage = Math.max(1, page - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
    if (endPage - startPage + 1 < maxPagesToShow) startPage = Math.max(1, endPage - maxPagesToShow + 1);

    if (startPage > 1) {
        const firstLink = document.createElement('a'); firstLink.href = '#'; firstLink.textContent = '1'; firstLink.classList.add('page-link');
        firstLink.addEventListener('click', (e) => { e.preventDefault(); handlePageChange(panelId, 1); });
        paginationDiv.appendChild(firstLink);
        if (startPage > 2) paginationDiv.appendChild(document.createTextNode(' ... '));
    }

    for (let i = startPage; i <= endPage; i++) {
        const pageLink = document.createElement('a'); pageLink.href = '#'; pageLink.textContent = i; pageLink.classList.add('page-link');
        if (i === page) pageLink.classList.add('active');
        pageLink.addEventListener('click', (e) => { e.preventDefault(); handlePageChange(panelId, i); });
        paginationDiv.appendChild(pageLink);
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) paginationDiv.appendChild(document.createTextNode(' ... '));
        const lastLink = document.createElement('a'); lastLink.href = '#'; lastLink.textContent = totalPages; lastLink.classList.add('page-link');
        lastLink.addEventListener('click', (e) => { e.preventDefault(); handlePageChange(panelId, totalPages); });
        paginationDiv.appendChild(lastLink);
    }

    // Botão Próxima
    if (page < totalPages) {
        const nextLink = document.createElement('a'); nextLink.href = '#'; nextLink.textContent = 'Próxima »'; nextLink.classList.add('page-link');
        nextLink.addEventListener('click', (e) => { e.preventDefault(); handlePageChange(panelId, page + 1); });
        paginationDiv.appendChild(nextLink);
    }
}

function handlePageChange(panelId, newPage) {
    if (panelId === 'mainPanel') { currentPage = newPage; renderTargets(); }
    else if (panelId === 'archivedPanel') { currentArchivedPage = newPage; renderArchivedTargets(); }
    else if (panelId === 'resolvedPanel') { currentResolvedPage = newPage; renderResolvedTargets(); }
    const panelElement = document.getElementById(panelId);
    if (panelElement) panelElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
// ==== FIM Funções de Renderização ====

// ==== Funções de Observação (Com Ajustes) ====
function renderObservations(observations, isExpanded = false, targetId = null) {
    if (!Array.isArray(observations) || observations.length === 0) return '';
    // Ordena por data string desc
    const sortedObservations = [...observations].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    const displayCount = isExpanded ? sortedObservations.length : 1;
    const visibleObservations = sortedObservations.slice(0, displayCount);
    const remainingCount = sortedObservations.length - displayCount;

    let observationsHTML = `<div class="observations">`; // Container interno das observações
    visibleObservations.forEach(obs => {
        let formattedDate = 'Inválida';
        try { formattedDate = formatDateForDisplay(obs.date); } catch (e) {}
        observationsHTML += `<p class="observation-item"><strong>${formattedDate}:</strong> ${obs.text || ''}</p>`;
    });

    // Links de toggle
    if (targetId) {
        if (!isExpanded && remainingCount > 0) {
            observationsHTML += `<a href="#" class="observations-toggle" onclick="window.toggleObservations('${targetId}', event); return false;">Ver mais ${remainingCount} observações</a>`;
        } else if (isExpanded && observations.length > 1) { // Mostra "ver menos" apenas se houver mais de 1 total
            observationsHTML += `<a href="#" class="observations-toggle" onclick="window.toggleObservations('${targetId}', event); return false;">Ver menos observações</a>`;
        }
    }
    observationsHTML += `</div>`;
    return observationsHTML;
}

window.toggleObservations = function(targetId, event) {
    if (event) event.preventDefault();
    const observationsListDiv = document.getElementById(`observations-${targetId}`);
    if (!observationsListDiv) return;
    const toggleLink = observationsListDiv.querySelector('.observations-toggle');
    const isExpanded = toggleLink?.textContent.includes('Ver menos');
    renderExistingObservations(targetId, !isExpanded); // Chama helper para re-renderizar
};

window.toggleAddObservation = function(targetId) {
    const formDiv = document.getElementById(`observationForm-${targetId}`);
    if (!formDiv) return;
    const isVisible = formDiv.style.display === 'block';
    formDiv.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) formDiv.querySelector(`textarea`)?.focus();
}

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
    } catch(e) { document.getElementById(`observationDate-${targetId}`).value = ''; }
}

// **MODIFICADA**: Salva data como string 'YYYY-MM-DD'
window.saveObservation = async function(targetId) {
    const observationText = document.getElementById(`observationText-${targetId}`).value.trim();
    const observationDateInput = document.getElementById(`observationDate-${targetId}`).value; // String 'YYYY-MM-DD'

    if (!observationText) { alert('Insira o texto.'); return; }
    if (!observationDateInput || !/^\d{4}-\d{2}-\d{2}$/.test(observationDateInput) || isNaN(parseLocalDate(observationDateInput)?.getTime())) {
        alert('Data inválida.'); return;
    }

    const user = auth.currentUser; if (!user) { alert("Não autenticado."); return; }
    const userId = user.uid;

    let targetRef, targetList, targetCollectionName;
    let targetIndex = prayerTargets.findIndex(t => t.id === targetId);
    if (targetIndex !== -1) { targetCollectionName = "prayerTargets"; targetList = prayerTargets; }
    else {
        targetIndex = archivedTargets.findIndex(t => t.id === targetId);
        if (targetIndex !== -1) { targetCollectionName = "archivedTargets"; targetList = archivedTargets; }
        else { alert("Alvo não encontrado."); return; }
    }
    targetRef = doc(db, "users", userId, targetCollectionName, targetId);

    const newObservation = { text: observationText, date: observationDateInput, id: generateUniqueId(), targetId: targetId }; // Data como string

    try {
        const targetDoc = await getDoc(targetRef);
        let currentObservations = targetDoc.exists() && Array.isArray(targetDoc.data().observations) ? targetDoc.data().observations : [];
        currentObservations.push(newObservation);
        currentObservations.sort((a, b) => (b.date || "").localeCompare(a.date || "")); // Ordena por string
        await updateDoc(targetRef, { observations: currentObservations });

        // Atualiza local
        const localTarget = targetList[targetIndex];
        if (!localTarget.observations || !Array.isArray(localTarget.observations)) localTarget.observations = [];
        localTarget.observations.push(newObservation); // Adiciona string
        localTarget.observations.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

        // console.log(`[saveObservation] Saved for ${targetId}.`);
        if (targetCollectionName === "prayerTargets") renderTargets();
        else { renderArchivedTargets(); if (resolvedTargets.some(rt => rt.id === targetId)) renderResolvedTargets(); }

        toggleAddObservation(targetId);
        document.getElementById(`observationText-${targetId}`).value = '';
        try { document.getElementById(`observationDate-${targetId}`).value = formatDateToISO(new Date()); } catch(e) {}

    } catch (error) { console.error("Error saving observation:", error); alert("Erro ao salvar."); }
}

// **MODIFICADA**: Re-renderiza o conteúdo do div de observações
function renderExistingObservations(targetId, isExpanded = false) {
     const observationsListDiv = document.getElementById(`observations-${targetId}`);
     if (!observationsListDiv) return;
     const target = prayerTargets.find(t => t.id === targetId) || archivedTargets.find(t => t.id === targetId);
    if (!target || !Array.isArray(target.observations) || target.observations.length === 0) {
        observationsListDiv.innerHTML = ''; observationsListDiv.style.display = 'none'; return;
    }
    // Chama renderObservations para gerar o HTML interno
    observationsListDiv.innerHTML = renderObservations(target.observations, isExpanded, targetId);
    observationsListDiv.style.display = 'block';
}
// ==== FIM Funções de Observação ====


// ==== Handlers de Filtro e Pesquisa (Inalterados) ====
function handleDeadlineFilterChange() { showDeadlineOnly = document.getElementById('showDeadlineOnly').checked; currentPage = 1; renderTargets(); }
function handleExpiredOnlyMainChange() { currentPage = 1; renderTargets(); }
document.getElementById('hasDeadline').addEventListener('change', function() { document.getElementById('deadlineContainer').style.display = this.checked ? 'block' : 'none'; });
function filterTargets(targets, searchTerm) { /* ...código existente... */ }
function handleSearchMain(event) { currentSearchTermMain = event.target.value; currentPage = 1; renderTargets(); }
function handleSearchArchived(event) { currentSearchTermArchived = event.target.value; currentArchivedPage = 1; renderArchivedTargets(); }
function handleSearchResolved(event) { currentSearchTermResolved = event.target.value; currentResolvedPage = 1; renderResolvedTargets(); }
// ==== FIM Handlers ====


// ==== Event Listener do Formulário Principal (Com Ajustes para String) ====
document.getElementById("prayerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const user = auth.currentUser; if (!user) { alert("Não logado."); return; }
    const uid = user.uid;

    const title = document.getElementById("title").value.trim();
    const details = document.getElementById("details").value.trim();
    const dateInput = document.getElementById("date").value; // String 'YYYY-MM-DD'
    const hasDeadline = document.getElementById("hasDeadline").checked;
    const deadlineDateInput = document.getElementById("deadlineDate").value; // String 'YYYY-MM-DD'

    if (!title) { alert("Insira um título."); return; }
    if (!dateInput || !/^\d{4}-\d{2}-\d{2}$/.test(dateInput) || isNaN(parseLocalDate(dateInput)?.getTime())) { alert("Data inválida."); return; }

    let deadlineDateString = null;
    if (hasDeadline) {
        if (!deadlineDateInput || !/^\d{4}-\d{2}-\d{2}$/.test(deadlineDateInput) || isNaN(parseLocalDate(deadlineDateInput)?.getTime())) { alert("Prazo inválido."); return; }
        deadlineDateString = deadlineDateInput;
    }

    const targetDataFirestore = {
        title, details, date: dateInput, hasDeadline, deadlineDate: deadlineDateString, // Salva strings
        archived: false, resolved: false, resolutionDate: null, observations: [], lastPresentedDate: null
    };

    try {
        const docRef = await addDoc(collection(db, "users", uid, "prayerTargets"), targetDataFirestore);
        const newLocalTarget = { ...targetDataFirestore, id: docRef.id }; // Estado local com strings
        prayerTargets.unshift(newLocalTarget);
        prayerTargets.sort((a, b) => (b.date || "").localeCompare(a.date || "")); // Ordena local

        document.getElementById("prayerForm").reset();
        document.getElementById('deadlineContainer').style.display = 'none';
        try { document.getElementById('date').value = formatDateToISO(new Date()); } catch (e) {}
        showPanel('mainPanel'); currentPage = 1; renderTargets();
        alert('Alvo adicionado!');
    } catch (error) { console.error("Error adding target:", error); alert("Erro ao adicionar."); }
});
// ==== FIM Event Listener Formulário Principal ====


// ==== Funções de Marcar/Arquivar/Excluir (Com Ajustes para String) ====
window.markAsResolved = async function(targetId) {
    const user = auth.currentUser; if (!user) { alert("Não logado."); return; }
    const userId = user.uid;
    const targetIndex = prayerTargets.findIndex(t => t.id === targetId);
    if (targetIndex === -1) { alert("Alvo não encontrado."); return; }

    const targetDataLocal = prayerTargets[targetIndex]; // Dados locais (com strings de data)
    const resolutionDateTimestamp = Timestamp.fromDate(new Date()); // Timestamp para Firestore

    const activeTargetRef = doc(db, "users", userId, "prayerTargets", targetId);
    const archivedTargetRef = doc(db, "users", userId, "archivedTargets", targetId);

    try {
        const archivedDataFirestore = { ...targetDataLocal, resolved: true, archived: true, resolutionDate: resolutionDateTimestamp }; // Mantém strings, adiciona TS
        delete archivedDataFirestore.id;
        const batch = writeBatch(db); batch.delete(activeTargetRef); batch.set(archivedTargetRef, archivedDataFirestore); await batch.commit();

        // Atualiza Local
        prayerTargets.splice(targetIndex, 1);
        const newArchivedLocal = { ...targetDataLocal, resolved: true, archived: true, resolutionDate: resolutionDateTimestamp.toDate() }; // Strings + Date de resolução
        archivedTargets.unshift(newArchivedLocal);
        archivedTargets.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        resolvedTargets = archivedTargets.filter(t => t.resolved).sort((a, b) => (b.resolutionDate || 0) - (a.resolutionDate || 0)); // Ordena por Date

        renderTargets(); renderArchivedTargets(); renderResolvedTargets();
        alert('Alvo respondido!');
    } catch (error) { console.error("Error resolving:", error); alert("Erro ao marcar."); }
}

window.archiveTarget = async function(targetId) {
     const user = auth.currentUser; if (!user) { alert("Não logado."); return; }
     const userId = user.uid;
     const targetIndex = prayerTargets.findIndex(t => t.id === targetId);
     if (targetIndex === -1) { alert("Alvo não encontrado."); return; }

     const targetDataLocal = prayerTargets[targetIndex]; // Com strings
     const activeTargetRef = doc(db, "users", userId, "prayerTargets", targetId);
     const archivedTargetRef = doc(db, "users", userId, "archivedTargets", targetId);

     try {
         const archivedDataFirestore = { ...targetDataLocal, resolved: false, archived: true, resolutionDate: null }; // Mantém strings
         delete archivedDataFirestore.id;
         const batch = writeBatch(db); batch.delete(activeTargetRef); batch.set(archivedTargetRef, archivedDataFirestore); await batch.commit();

         // Atualiza Local
         prayerTargets.splice(targetIndex, 1);
         const newArchivedLocal = { ...targetDataLocal, resolved: false, archived: true, resolutionDate: null }; // Com strings
         archivedTargets.unshift(newArchivedLocal);
         archivedTargets.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
         resolvedTargets = archivedTargets.filter(t => t.resolved).sort((a, b) => (b.resolutionDate || 0) - (a.resolutionDate || 0));

         renderTargets(); renderArchivedTargets(); renderResolvedTargets();
         alert('Alvo arquivado!');
     } catch (error) { console.error("Error archiving:", error); alert("Erro ao arquivar."); }
}

window.deleteArchivedTarget = async function(targetId) {
     const user = auth.currentUser; if (!user) { alert("Não logado."); return; }
     const userId = user.uid;
     const targetToDelete = archivedTargets.find(t => t.id === targetId);
     const targetTitle = targetToDelete ? targetToDelete.title : targetId;
     if (!confirm(`Excluir permanentemente "${targetTitle}"?`)) return;

     const targetIndex = archivedTargets.findIndex(t => t.id === targetId);
     const archivedTargetRef = doc(db, "users", userId, "archivedTargets", targetId);
     const clickCountsRef = doc(db, "prayerClickCounts", targetId);

     try {
         const batch = writeBatch(db);
         batch.delete(archivedTargetRef);
         const clickSnap = await getDoc(clickCountsRef); if (clickSnap.exists()) batch.delete(clickCountsRef);
         await batch.commit();

         // Atualiza Local
         if (targetIndex !== -1) archivedTargets.splice(targetIndex, 1);
         resolvedTargets = archivedTargets.filter(t => t.resolved).sort((a, b) => (b.resolutionDate || 0) - (a.resolutionDate || 0));

         renderArchivedTargets(); renderResolvedTargets();
         alert('Alvo excluído!');
     } catch (error) { console.error("Error deleting:", error); alert("Erro ao excluir."); }
}
// ==== FIM Funções de Marcar/Arquivar/Excluir ====


// ==== Event Listener DOMContentLoaded (Inalterado) ====
document.addEventListener('DOMContentLoaded', () => {
    try {
        const dateInput = document.getElementById('date');
        if (dateInput) dateInput.value = formatDateToISO(new Date());
    } catch (e) { console.error("Error setting default date:", e); }
    if (!auth.currentUser) showPanel('authSection');
});
// ==== FIM DOMContentLoaded ====


// ==== Listeners de Navegação e Botões Diversos (Inalterados) ====
document.getElementById('viewAllTargetsButton').addEventListener('click', () => { showPanel('mainPanel'); currentPage = 1; renderTargets(); });
document.getElementById('addNewTargetButton').addEventListener('click', () => {
    showPanel('appContent');
    const form = document.getElementById('prayerForm'); if (form) form.reset();
    const deadlineContainer = document.getElementById('deadlineContainer'); if(deadlineContainer) deadlineContainer.style.display = 'none';
    try { const dateInput = document.getElementById('date'); if(dateInput) dateInput.value = formatDateToISO(new Date()); } catch(e) {}
});
document.getElementById("viewArchivedButton").addEventListener("click", () => { showPanel('archivedPanel'); currentArchivedPage = 1; renderArchivedTargets(); });
document.getElementById("viewResolvedButton").addEventListener("click", () => { showPanel('resolvedPanel'); currentResolvedPage = 1; renderResolvedTargets(); });
document.getElementById("backToMainButton").addEventListener("click", () => { showPanel('dailySection'); });
function showPanel(panelIdToShow) { /* ...código da resposta anterior ... */ } // (A lógica interna não muda)
document.getElementById("copyDaily").addEventListener("click", function () { /* ...código da resposta anterior ... */ });
document.getElementById('generateViewButton').addEventListener('click', () => generateViewHTML());
document.getElementById('viewDaily').addEventListener('click', generateDailyViewHTML);
document.getElementById("viewResolvedViewButton").addEventListener("click", () => { dateRangeModal.style.display = "block"; startDateInput.value = ''; endDateInput.value = ''; });
// Modal listeners (Inalterados, mas generateResolvedViewHTML foi ajustada)
const dateRangeModal = document.getElementById("dateRangeModal");
const closeDateRangeModalButton = document.getElementById("closeDateRangeModal");
const generateResolvedViewButton = document.getElementById("generateResolvedView");
const cancelDateRangeButton = document.getElementById("cancelDateRange");
const startDateInput = document.getElementById("startDate");
const endDateInput = document.getElementById("endDate");
if (closeDateRangeModalButton) closeDateRangeModalButton.addEventListener("click", () => { dateRangeModal.style.display = "none"; });
if (generateResolvedViewButton) generateResolvedViewButton.addEventListener("click", () => {
    const startDateStr = startDateInput.value; const endDateStr = endDateInput.value;
    if (startDateStr && endDateStr) {
        const start = parseLocalDate(startDateStr); // Converte string para Date local
        const endStrParts = endDateStr.split('-').map(Number);
        const end = new Date(endStrParts[0], endStrParts[1] - 1, endStrParts[2], 23, 59, 59, 999); // Fim do dia local
        if (start && !isNaN(end.getTime()) && start <= end) {
            generateResolvedViewHTML(start, end); dateRangeModal.style.display = "none";
        } else alert("Datas inválidas.");
    } else alert("Selecione as datas.");
});
if (cancelDateRangeButton) cancelDateRangeButton.addEventListener("click", () => { dateRangeModal.style.display = "none"; });
window.addEventListener('click', (event) => { if (event.target == dateRangeModal) dateRangeModal.style.display = "none"; });
document.getElementById("viewReportButton").addEventListener('click', () => { window.location.href = 'orei.html'; });
// ==== FIM Listeners Navegação/Diversos ====


// ==== Funções de Geração de HTML para Visualização (Com Ajustes) ====
function generateViewHTML(targetsToInclude = lastDisplayedTargets) {
    let viewHTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Visualização</title><link rel="stylesheet" href="styles.css"><style>/* ... estilos ... */</style></head><body><div class="view-html-container"><h1>Alvos</h1><p>Gerado: ${formatDateForDisplay(new Date())} ${new Date().toLocaleTimeString()}</p><hr/>`;
    if (!Array.isArray(targetsToInclude) || targetsToInclude.length === 0) viewHTML += "<p>Nenhum alvo.</p>";
    else {
        const sortedTargets = [...targetsToInclude].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        sortedTargets.forEach(target => { if (target && target.id) viewHTML += generateTargetViewHTML(target, false); }); // Usa helper
    }
    viewHTML += `</div><script>window.toggleObservations = (id, e) => e.preventDefault();</script></body></html>`;
    const viewTab = window.open('', '_blank'); if (viewTab) { viewTab.document.write(viewHTML); viewTab.document.close(); } else alert('Popup bloqueado!');
}
function generateDailyViewHTML() {
    let viewHTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Alvos Diários</title><link rel="stylesheet" href="styles.css"><style>/* ... estilos ... */</style></head><body><div class="view-html-container"><h1>Alvos Diários</h1><p>Data: ${formatDateForDisplay(new Date())}</p><div class="daily-verse">${document.getElementById('dailyVerses')?.textContent || ''}</div><hr/><h2>Pendentes</h2>`;
    const dailyTargetsDiv = document.getElementById('dailyTargets'); let pendingCount = 0, completedCount = 0;
    if (dailyTargetsDiv) {
        dailyTargetsDiv.querySelectorAll('.target:not(.completed-target)').forEach(div => { const t = prayerTargets.find(pt => pt.id === div.dataset.targetId); if (t) { pendingCount++; viewHTML += generateTargetViewHTML(t); } });
        if (pendingCount === 0) viewHTML += "<p>Nenhum pendente.</p>";
        viewHTML += `<hr/><h2>Concluídos Hoje</h2>`;
        dailyTargetsDiv.querySelectorAll('.target.completed-target').forEach(div => { const t = prayerTargets.find(pt => pt.id === div.dataset.targetId); if (t) { completedCount++; viewHTML += generateTargetViewHTML(t, true); } });
        if (completedCount === 0) viewHTML += "<p>Nenhum concluído.</p>";
    } else viewHTML += "<p>Erro.</p>";
    viewHTML += `</div><script>window.toggleObservations = (id, e) => e.preventDefault();</script></body></html>`;
    const viewTab = window.open('', '_blank'); if (viewTab) { viewTab.document.write(viewHTML); viewTab.document.close(); } else alert('Popup bloqueado!');
}
// **MODIFICADA**: Usa utils ajustadas
function generateTargetViewHTML(target, isCompletedView = false) {
     if (!target || !target.id) return '';
     let formattedDate = 'Inv.', elapsed = 'Inv.', deadlineTag = '';
     try { formattedDate = formatDateForDisplay(target.date); } catch(e){}
     try { elapsed = timeElapsed(target.date); } catch(e){}
     try { if (target.hasDeadline && target.deadlineDate) { const fd = formatDateForDisplay(target.deadlineDate); deadlineTag = `<span class="deadline-tag ${isDateExpired(target.deadlineDate) ? 'expired' : ''}">Prazo: ${fd}</span>`; } } catch(e){}
     const observationsHTML = renderObservations(target.observations || [], true, target.id); // Mostra todas expandidas na visualização

     return `<div class="target ${isCompletedView ? 'completed-target' : ''}"><h3>${deadlineTag} ${target.title || ''}</h3><p>${target.details || ''}</p><p><strong>Criação:</strong> ${formattedDate}</p><p><strong>Decorrido:</strong> ${elapsed}</p><div class="observations-list" style="display:block;">${observationsHTML}</div></div>`;
}
// **MODIFICADA**: Usa utils/helper ajustadas
async function generateResolvedViewHTML(startDate, endDate) { // Recebe Date locais
    const user = auth.currentUser; if (!user) { alert("Não logado."); return; }
    const uid = user.uid;
    const startTimestamp = Timestamp.fromDate(startDate); const endTimestamp = Timestamp.fromDate(endDate);
    const archivedRef = collection(db, "users", uid, "archivedTargets");
    const q = query(archivedRef, where("resolved", "==", true), where("resolutionDate", ">=", startTimestamp), where("resolutionDate", "<=", endTimestamp), orderBy("resolutionDate", "desc"));
    let filteredResolvedTargets = [];
    try {
        const querySnapshot = await getDocs(q);
        querySnapshot.forEach((doc) => { const rehydrated = rehydrateTargets([{ ...doc.data(), id: doc.id }])[0]; if (rehydrated) filteredResolvedTargets.push(rehydrated); });
    } catch (error) { console.error("Error fetching resolved:", error); alert("Erro ao buscar."); return; }

    let viewHTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Alvos Respondidos</title><link rel="stylesheet" href="styles.css"><style>/* ... estilos ... */</style></head><body><div class="view-html-container"><h1>Respondidos</h1><h2>Período: ${formatDateForDisplay(startDate)} - ${formatDateForDisplay(endDate)}</h2><p>Gerado: ${formatDateForDisplay(new Date())} ${new Date().toLocaleTimeString()}</p><hr/>`;
     if (filteredResolvedTargets.length === 0) viewHTML += "<p>Nenhum respondido no período.</p>";
     else {
        filteredResolvedTargets.forEach(target => {
             if (!target || !target.id) return;
             let formattedResDate = 'Inv.', totalTime = 'Inv.';
             try { formattedResDate = formatDateForDisplay(target.resolutionDate); } catch (e) {}
              try { const creationDate = parseLocalDate(target.date); const resolutionDate = target.resolutionDate instanceof Date ? target.resolutionDate : null; if(creationDate && resolutionDate) totalTime = adjustedTimeElapsed(creationDate, resolutionDate); else totalTime = "Datas inválidas"; } catch (e) {}
             const observationsHTML = renderObservations(target.observations || [], true, target.id); // Expandido
            viewHTML += `<div class="target resolved"><h3>${target.title || ''} (Respondido)</h3><p>${target.details || ''}</p><p><strong>Respondido:</strong> ${formattedResDate}</p><p><strong>Tempo Total:</strong> ${totalTime}</p><div class="observations-list" style="display:block;">${observationsHTML}</div></div>`;
        });
    }
    viewHTML += `</div><script>window.toggleObservations = (id, e) => e.preventDefault();</script></body></html>`;
    const viewTab = window.open('', '_blank'); if (viewTab) { viewTab.document.write(viewHTML); viewTab.document.close(); } else alert('Popup bloqueado!');
}
function adjustedTimeElapsed(startDate, endDate) { /* ...código da resposta anterior... */ }
// ==== FIM Funções de Geração de HTML ====


// ==== Funções de Versículos e Popups (Inalteradas) ====
const verses = [ /* ... */ ];
function displayRandomVerse() { /* ... */ }
function displayCompletionPopup() { /* ... */ }
const closePopupButton = document.getElementById('closePopup'); if (closePopupButton) closePopupButton.addEventListener('click', () => { /* ... */ });
// ==== FIM Versículos/Popups ====


// ==== Funções de Prazo e Perseverança (Com Ajustes) ====
function checkExpiredDeadlines() {
    let expiredCount = 0;
    prayerTargets.forEach(target => { if (target.hasDeadline && target.deadlineDate && isDateExpired(target.deadlineDate)) expiredCount++; });
    // console.log(`[checkExpiredDeadlines] Found ${expiredCount} expired deadlines.`);
}
async function loadPerseveranceData(userId) { /* ...código da resposta anterior... */ }
async function confirmPerseverance() { /* ...código da resposta anterior... */ }
async function updatePerseveranceFirestore(userId, data) { /* ...código da resposta anterior... */ }
function updatePerseveranceUI() { /* ...código da resposta anterior... */ }
function resetPerseveranceUI() { /* ...código da resposta anterior... */ }

// **MODIFICADA**: Usa string ou null
window.editDeadline = async function(targetId) {
    const target = prayerTargets.find(t => t.id === targetId); if (!target) return;
    const targetDiv = document.querySelector(`.target[data-target-id="${targetId}"]`); if (!targetDiv) return;
    const existingEditForm = targetDiv.querySelector('.edit-deadline-form'); if (existingEditForm) { existingEditForm.remove(); return; }
    const currentDeadlineISO = target.deadlineDate || ''; // String ou ''
    const formHTML = `<div class="edit-deadline-form" style="background-color:#f0f0f0;padding:10px;margin-top:10px;border-radius:5px;"><label for="editDeadlineDate-${targetId}" style="margin-right:5px;">Novo Prazo:</label><input type="date" id="editDeadlineDate-${targetId}" value="${currentDeadlineISO}" style="margin-right:5px;"><button class="btn" onclick="saveEditedDeadline('${targetId}')">Salvar</button><button class="btn" onclick="cancelEditDeadline('${targetId}')">Cancelar</button></div>`;
    const actionsDiv = targetDiv.querySelector('.target-actions');
    if (actionsDiv) actionsDiv.insertAdjacentHTML('afterend', formHTML); else targetDiv.insertAdjacentHTML('beforeend', formHTML);
    document.getElementById(`editDeadlineDate-${targetId}`)?.focus();
}

// **MODIFICADA**: Salva string ou null
window.saveEditedDeadline = async function(targetId) {
     const newDeadlineValue = document.getElementById(`editDeadlineDate-${targetId}`).value; // String 'YYYY-MM-DD' ou ""
     let newDeadlineString = null, newHasDeadline = false;
    if (!newDeadlineValue) { if (!confirm("Remover o prazo?")) { cancelEditDeadline(targetId); return; } }
    else { if (!/^\d{4}-\d{2}-\d{2}$/.test(newDeadlineValue) || isNaN(parseLocalDate(newDeadlineValue)?.getTime())) { alert("Data inválida."); return; } newDeadlineString = newDeadlineValue; newHasDeadline = true; }
    await updateDeadlineInFirestoreAndLocalString(targetId, newDeadlineString, newHasDeadline); // Usa helper com string
    cancelEditDeadline(targetId);
}

// **NOVA HELPER**: Atualiza com string de data
async function updateDeadlineInFirestoreAndLocalString(targetId, newDeadlineString, newHasDeadline) {
     const user = auth.currentUser; if (!user) return;
     const userId = user.uid; const targetRef = doc(db, "users", userId, "prayerTargets", targetId);
     try {
         await updateDoc(targetRef, { deadlineDate: newDeadlineString, hasDeadline: newHasDeadline }); // Salva string/null
         const targetIndex = prayerTargets.findIndex(t => t.id === targetId);
         if (targetIndex !== -1) { prayerTargets[targetIndex].deadlineDate = newDeadlineString; prayerTargets[targetIndex].hasDeadline = newHasDeadline; } // Atualiza string local
         renderTargets(); alert('Prazo atualizado!');
     } catch (error) { console.error("Error updating deadline:", error); alert("Erro ao atualizar."); }
}

window.cancelEditDeadline = function(targetId) {
     const targetDiv = document.querySelector(`.target[data-target-id="${targetId}"]`);
     const editForm = targetDiv?.querySelector('.edit-deadline-form');
     if (editForm) editForm.remove();
}

// ==== Funções do Gráfico Semanal (Inalteradas) ====
function updateWeeklyChart() { /* ...código da resposta anterior... */ }
function resetWeeklyChart() { /* ...código da resposta anterior... */ }
// ==== FIM Funções Prazo/Perseverança ====

// ==== Inicialização e Listeners Globais ====
window.onload = () => {
    onAuthStateChanged(auth, (user) => {
        loadData(user); // Carrega dados ou mostra tela de login
    });

    // Listeners de pesquisa e filtros (já definidos antes, apenas garantindo que estejam aqui)
    document.getElementById('searchMain').addEventListener('input', handleSearchMain);
    document.getElementById('searchArchived').addEventListener('input', handleSearchArchived);
    document.getElementById('searchResolved').addEventListener('input', handleSearchResolved);
    document.getElementById('showDeadlineOnly').addEventListener('change', handleDeadlineFilterChange);
    document.getElementById('showExpiredOnlyMain').addEventListener('change', handleExpiredOnlyMainChange);
    document.getElementById('confirmPerseveranceButton').addEventListener('click', confirmPerseverance);

    // Listeners de autenticação (já definidos antes)
    const btnGoogleLogin = document.getElementById('btnGoogleLogin'); if (btnGoogleLogin) btnGoogleLogin.addEventListener('click', signInWithGoogle);
    const btnEmailSignUp = document.getElementById('btnEmailSignUp'); if (btnEmailSignUp) btnEmailSignUp.addEventListener('click', signUpWithEmailPassword);
    const btnEmailSignIn = document.getElementById('btnEmailSignIn'); if (btnEmailSignIn) btnEmailSignIn.addEventListener('click', signInWithEmailPassword);
    const btnForgotPassword = document.getElementById('btnForgotPassword'); if (btnForgotPassword) btnForgotPassword.addEventListener('click', resetPassword);
    document.getElementById('btnLogout').addEventListener('click', () => { signOut(auth).catch(e => console.error("Sign out error:", e)); });

    // Listener de refresh diário (já definido antes)
    document.getElementById("refreshDaily").addEventListener("click", async () => {
        const user = auth.currentUser; if (!user) { alert("Não logado."); return; }
        if (confirm("Atualizar alvos do dia? Isso gerará uma nova lista.")) {
            const userId = user.uid; const todayStr = formatDateToISO(new Date());
            const dailyDocId = `${userId}_${todayStr}`; const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);
            try {
                const newTargetsData = await generateDailyTargets(userId, todayStr);
                await setDoc(dailyRef, newTargetsData);
                loadDailyTargets(); alert("Alvos atualizados!");
            } catch (error) { console.error("Error refreshing daily:", error); alert("Erro ao atualizar."); }
        }
     });
};
// ==== FIM Inicialização ====
