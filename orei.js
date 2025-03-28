import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-analytics.js";
import { getAuth, signOut, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDocs, updateDoc, deleteDoc, query, where, orderBy, getDoc, addDoc, increment, Timestamp, writeBatch, FieldValue } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js"; // Adicionado FieldValue se for usar arrayUnion/arrayRemove no futuro

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
const timezoneOffsetHours = 4; // Note: This might need adjustment based on server/client timezones

// ==== FUNÇÕES UTILITÁRIAS ====
function formatDateToISO(date) {
    // Ensure input is a valid Date object
    if (!(date instanceof Date) || isNaN(date.getTime())) {
        // Return today's date in ISO format or handle error as appropriate
        console.warn("formatDateToISO received invalid date, defaulting to today:", date);
        date = new Date();
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// VERSÃO CORRIGIDA com LOGS
function formatDateForDisplay(dateInput) {
    // LOG ADICIONADO no início
    // console.log('[formatDateForDisplay] Received input:', dateInput, '| Type:', typeof dateInput);

    // 1. Se não houver valor ou for inválido inicialmente
    if (!dateInput) {
        // console.log('[formatDateForDisplay] Input is null or undefined. Returning Invalid Date.'); // LOG ADICIONADO
        return 'Data Inválida';
    }

    let dateToFormat;

    // 2. Se for um Timestamp do Firebase, converter para Date
    if (dateInput instanceof Timestamp) {
        // console.log('[formatDateForDisplay] Input is Timestamp. Converting to Date.'); // LOG ADICIONADO
        dateToFormat = dateInput.toDate();
    }
    // 3. Se já for um objeto Date
    else if (dateInput instanceof Date) {
        // console.log('[formatDateForDisplay] Input is already Date.'); // LOG ADICIONADO
        dateToFormat = dateInput;
    }
    // 4. Se for uma string, tentar converter para Date
    else if (typeof dateInput === 'string') {
        // console.log('[formatDateForDisplay] Input is string. Checking for invalid content.'); // LOG ADICIONADO
        // Verificar strings explicitamente inválidas antes de criar o objeto Date
        if (dateInput.includes('Invalid Date') || dateInput.includes('NaN')) {
            // console.log('[formatDateForDisplay] String includes Invalid Date or NaN. Returning Invalid Date.'); // LOG ADICIONADO
            return 'Data Inválida';
        }
         // console.log('[formatDateForDisplay] String seems valid. Creating Date object from string.'); // LOG ADICIONADO
        dateToFormat = new Date(dateInput);
    }
    // 5. Se for outro tipo não esperado
    else {
        console.warn("[formatDateForDisplay] Input is unexpected type:", typeof dateInput, dateInput, ". Returning Invalid Date."); // LOG MODIFICADO
        return 'Data Inválida';
    }

    // 6. Verificar se a conversão resultou em uma data válida
    if (!dateToFormat || isNaN(dateToFormat.getTime())) {
         // console.log('[formatDateForDisplay] Conversion resulted in invalid Date object. Returning Invalid Date.'); // LOG ADICIONADO
        return 'Data Inválida';
    }

    // 7. Formatar a data válida
    const day = String(dateToFormat.getDate()).padStart(2, '0');
    const month = String(dateToFormat.getMonth() + 1).padStart(2, '0'); // Month is 0-indexed
    const year = dateToFormat.getFullYear();
    const formattedDate = `${day}/${month}/${year}`;
     // console.log('[formatDateForDisplay] Formatting successful. Returning:', formattedDate); // LOG ADICIONADO
    return formattedDate;
}

function timeElapsed(date) {
    if (!date) return 'Data Inválida';
    const now = new Date();
    // Garante que 'date' seja um objeto Date, seja vindo de Timestamp.toDate() ou new Date()
    const pastDate = (date instanceof Timestamp) ? date.toDate() : (date instanceof Date ? date : new Date(date));

    if (isNaN(pastDate.getTime())) return 'Data Inválida'; // Verifica se a data é válida

    let diffInSeconds = Math.floor((now - pastDate) / 1000);

    if (diffInSeconds < 0) diffInSeconds = 0; // Evita tempos negativos se houver pequena dessincronia

    if (diffInSeconds < 60) return `${diffInSeconds} segundos`;
    let diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes} minutos`;
    let diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} horas`;
    let diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 30) return `${diffInDays} dias`;
    let diffInMonths = Math.floor(diffInDays / 30.44); // Média de dias por mês
    if (diffInMonths < 12) return `${diffInMonths} meses`;
    let diffInYears = Math.floor(diffInDays / 365.25); // Considera anos bissextos
    return `${diffInYears} anos`;
}


function isDateExpired(dateStringOrDate) {
    if (!dateStringOrDate) return false;

    let deadline;
    if (dateStringOrDate instanceof Timestamp) {
        deadline = dateStringOrDate.toDate();
    } else if (dateStringOrDate instanceof Date) {
        deadline = dateStringOrDate;
    } else {
        // Tenta criar a data, mas se for string 'YYYY-MM-DD', considera o início do dia local
        // A conversão new Date('YYYY-MM-DD') pode ser UTC ou local dependendo do browser,
        // mas como estamos comparando com `now` (local), a abordagem de pegar o Date
        // que representa meia-noite local (vindo de rehydrateTargets) é a mais consistente.
        deadline = new Date(dateStringOrDate); // Se for string, pode ter problemas de timezone aqui
                                                // Idealmente, a data já vem como objeto Date (meia-noite local)
    }

    if (isNaN(deadline.getTime())) return false; // Data inválida

    const now = new Date();
    // Compara diretamente as datas. Se deadline representa meia-noite local do dia X,
    // e now é qualquer hora no dia X+1 ou posterior, a condição será verdadeira.
    // Para comparar apenas o dia, ignorando a hora:
    const deadlineDayStart = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
    const nowDayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return deadlineDayStart < nowDayStart;
}

function generateUniqueId() {
    // Combina timestamp com parte aleatória para maior unicidade
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 15);
}


// VERSÃO COM LOGS
function rehydrateTargets(targets) {
    // console.log('[rehydrateTargets] Starting rehydration for', targets.length, 'targets.'); // LOG ADICIONADO
    return targets.map((target, index) => {
        // console.log(`[rehydrateTargets] Processing target ${index} (ID: ${target.id}) - Original date value:`, target.date); // LOG ADICIONADO
        // console.log(`[rehydrateTargets] Target ${target.id} - typeof date:`, typeof target.date); // LOG ADICIONADO
        // console.log(`[rehydrateTargets] Target ${target.id} - date instanceof Timestamp:`, target.date instanceof Timestamp); // LOG ADICIONADO
        // console.log(`[rehydrateTargets] Target ${target.id} - date instanceof Date:`, target.date instanceof Date); // LOG ADICIONADO

        const rehydratedTarget = { ...target };

        // --- Depuração da Data Principal ---
        let originalDate = rehydratedTarget.date; // Guarda o valor original para log
        try {
            if (originalDate) {
                 if (originalDate instanceof Timestamp) {
                    // console.log(`[rehydrateTargets] Target ${target.id} - Converting date from Timestamp`);
                    rehydratedTarget.date = originalDate.toDate(); // Converte UTC para Date local
                } else if (originalDate instanceof Date) {
                    // console.log(`[rehydrateTargets] Target ${target.id} - Date is already a Date object.`);
                    // Não faz nada, já é Date
                     rehydratedTarget.date = originalDate;
                } else {
                    // console.log(`[rehydrateTargets] Target ${target.id} - Attempting to convert date from other type:`, typeof originalDate);
                    // Tenta converter (pode ter problemas de timezone se for string 'YYYY-MM-DD')
                    rehydratedTarget.date = new Date(originalDate);
                }
                if (isNaN(rehydratedTarget.date?.getTime())) { // Verifica se a conversão resultou em inválido
                     // console.warn(`[rehydrateTargets] Target ${target.id} - Date conversion resulted in Invalid Date. Original:`, originalDate);
                    rehydratedTarget.date = null;
                }
            } else {
                 // console.log(`[rehydrateTargets] Target ${target.id} - Date is initially null or undefined.`);
                rehydratedTarget.date = null; // Ou new Date() se fizer mais sentido
            }
        } catch (error) {
             console.error(`[rehydrateTargets] Error processing date for target ${target.id}. Original value:`, originalDate, error);
             rehydratedTarget.date = null; // Define como null em caso de erro
        }
        // console.log(`[rehydrateTargets] Target ${target.id} - Final date value:`, rehydratedTarget.date); // LOG ADICIONADO


        // --- Depuração de deadlineDate (similar à data principal) ---
        let originalDeadline = rehydratedTarget.deadlineDate;
         try {
            if (originalDeadline) {
                 if (originalDeadline instanceof Timestamp) {
                     // console.log(`[rehydrateTargets] Target ${target.id} - Converting deadlineDate from Timestamp`);
                    rehydratedTarget.deadlineDate = originalDeadline.toDate();
                } else if (originalDeadline instanceof Date) {
                     // console.log(`[rehydrateTargets] Target ${target.id} - deadlineDate is already Date.`);
                     rehydratedTarget.deadlineDate = originalDeadline;
                } else {
                     // console.log(`[rehydrateTargets] Target ${target.id} - Attempting to convert deadlineDate from other type:`, typeof originalDeadline);
                    rehydratedTarget.deadlineDate = new Date(originalDeadline);
                }
                if (isNaN(rehydratedTarget.deadlineDate?.getTime())) {
                     // console.warn(`[rehydrateTargets] Target ${target.id} - deadlineDate conversion resulted in Invalid Date. Original:`, originalDeadline);
                    rehydratedTarget.deadlineDate = null;
                }
            } else {
                 rehydratedTarget.deadlineDate = null;
            }
        } catch (error) {
             console.error(`[rehydrateTargets] Error processing deadlineDate for target ${target.id}. Original value:`, originalDeadline, error);
             rehydratedTarget.deadlineDate = null;
        }
         // console.log(`[rehydrateTargets] Target ${target.id} - Final deadlineDate value:`, rehydratedTarget.deadlineDate); // LOG ADICIONADO

        // --- Depuração de lastPresentedDate (similar) ---
         let originalLastPresented = rehydratedTarget.lastPresentedDate;
         try {
            if (originalLastPresented) {
                 if (originalLastPresented instanceof Timestamp) {
                      // console.log(`[rehydrateTargets] Target ${target.id} - Converting lastPresentedDate from Timestamp`);
                     rehydratedTarget.lastPresentedDate = originalLastPresented.toDate();
                 } else if (originalLastPresented instanceof Date) {
                      // console.log(`[rehydrateTargets] Target ${target.id} - lastPresentedDate is already Date.`);
                      rehydratedTarget.lastPresentedDate = originalLastPresented;
                 } else {
                      // console.log(`[rehydrateTargets] Target ${target.id} - Attempting to convert lastPresentedDate from other type:`, typeof originalLastPresented);
                     rehydratedTarget.lastPresentedDate = new Date(originalLastPresented);
                 }
                 if (isNaN(rehydratedTarget.lastPresentedDate?.getTime())) {
                      // console.warn(`[rehydrateTargets] Target ${target.id} - lastPresentedDate conversion resulted in Invalid Date. Original:`, originalLastPresented);
                     rehydratedTarget.lastPresentedDate = null;
                 }
             } else {
                 rehydratedTarget.lastPresentedDate = null;
             }
         } catch (error) {
              console.error(`[rehydrateTargets] Error processing lastPresentedDate for target ${target.id}. Original value:`, originalLastPresented, error);
              rehydratedTarget.lastPresentedDate = null;
         }
          // console.log(`[rehydrateTargets] Target ${target.id} - Final lastPresentedDate value:`, rehydratedTarget.lastPresentedDate); // LOG ADICIONADO


        // --- Depuração das Observações ---
        if (rehydratedTarget.observations && Array.isArray(rehydratedTarget.observations)) {
            rehydratedTarget.observations = rehydratedTarget.observations.map((obs, obsIndex) => {
                // console.log(`[rehydrateTargets] Target ${target.id} - Processing observation ${obsIndex}. Original date:`, obs.date); // LOG ADICIONADO
                 let obsDateOriginal = obs.date;
                 let obsDateFinal = null;
                 try {
                    if (obsDateOriginal) {
                         if (obsDateOriginal instanceof Timestamp) {
                             obsDateFinal = obsDateOriginal.toDate();
                         } else if (obsDateOriginal instanceof Date) {
                             obsDateFinal = obsDateOriginal; // Already a Date
                         } else {
                             obsDateFinal = new Date(obsDateOriginal);
                         }
                         if (isNaN(obsDateFinal?.getTime())) {
                             // console.warn(`[rehydrateTargets] Target ${target.id}, Obs ${obsIndex} - Date conversion resulted in Invalid Date. Original:`, obsDateOriginal);
                             obsDateFinal = null;
                         }
                     }
                } catch (error) {
                    console.error(`[rehydrateTargets] Error processing observation date for target ${target.id}, Obs ${obsIndex}. Original:`, obsDateOriginal, error);
                    obsDateFinal = null;
                }
                 // console.log(`[rehydrateTargets] Target ${target.id}, Obs ${obsIndex} - Final date:`, obsDateFinal); // LOG ADICIONADO
                return { ...obs, date: obsDateFinal };
            });
        } else {
            rehydratedTarget.observations = [];
        }

        return rehydratedTarget;
    });
}
// ==== FIM FUNÇÕES UTILITÁRIAS ====


// ==== MODIFIED FUNCTION: updateAuthUI (SUPORTA AMBOS OS METODOS DE AUTENTICAÇÃO) ====
function updateAuthUI(user) {
    const authStatus = document.getElementById('authStatus');
    const btnLogout = document.getElementById('btnLogout');
    const btnGoogleLogin = document.getElementById('btnGoogleLogin');
    const emailPasswordAuthForm = document.getElementById('emailPasswordAuthForm');
    const authStatusContainer = document.querySelector('.auth-status-container');

    if (user) {
        authStatusContainer.style.display = 'flex';
        btnLogout.style.display = 'inline-block';
        btnGoogleLogin.style.display = 'none'; // Esconde o botão de login Google após o login
        emailPasswordAuthForm.style.display = 'none'; // Esconde o form de email/senha

        if (user.providerData[0].providerId === 'google.com') {
            authStatus.textContent = `Usuário autenticado: ${user.email} (via Google)`;
        } else if (user.providerData[0].providerId === 'password') {
            authStatus.textContent = `Usuário autenticado: ${user.email} (via E-mail/Senha)`;
        } else {
            authStatus.textContent = `Usuário autenticado: ${user.email}`; // Caso geral
        }
    } else {
        authStatusContainer.style.display = 'block';
        btnLogout.style.display = 'none';
        btnGoogleLogin.style.display = 'inline-block'; // Mostra o botão de login Google para fazer login
        emailPasswordAuthForm.style.display = 'block'; // Mostra o form de email/senha
        authStatus.textContent = "Nenhum usuário autenticado";
    }
}

// ==== MODIFIED FUNCTION: signInWithGoogle (DEBUGGING CONSOLE LOGS ADDED) ====
async function signInWithGoogle() {
    console.log("signInWithGoogle function CALLED!"); // ADDED: Debugging log
    const provider = new GoogleAuthProvider();
    try {
        const userCredential = await signInWithPopup(auth, provider);
        // User signed in with Google!
        const user = userCredential.user;
        loadData(user); // Load data for the logged-in user
    } catch (error) {
        console.error("Erro ao entrar com o Google:", error);
        console.error("Error Object:", error); // ADDED: Log full error object
        alert("Erro ao entrar com o Google: " + error.message);
    }
}

// ==== NEW FUNCTION: signUpWithEmailPassword ====
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

// ==== NEW FUNCTION: signInWithEmailPassword ====
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

// ==== NEW FUNCTION: resetPassword ====
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


// ==== ENHANCED FUNCTION: generateDailyTargets ====
async function generateDailyTargets(userId, dateStr) {
    try {
        // Buscar alvos ativos
        const activeTargetsQuery = query(
            collection(db, "users", userId, "prayerTargets")
            // Não precisamos filtrar por archived aqui, pois eles estão em outra coleção
        );
        const activeTargetsSnapshot = await getDocs(activeTargetsQuery);
        let availableTargets = [];
        activeTargetsSnapshot.forEach(doc => {
             // Check if target has valid data before adding
            const targetData = doc.data();
            if (targetData && targetData.title) { // Basic check
                 availableTargets.push({ ...targetData, id: doc.id });
            } else {
                console.warn(`[generateDailyTargets] Skipping target ${doc.id} due to potentially invalid data.`);
            }
        });

        // It's crucial to rehydrate *before* filtering to ensure dates are Date objects
        availableTargets = rehydrateTargets(availableTargets);

        if (availableTargets.length === 0) {
            console.log("[generateDailyTargets] No active targets found or valid after rehydration.");
            return { userId, date: dateStr, targets: [] };
        }

        // Buscar alvos concluídos no dia anterior
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
            console.warn("[generateDailyTargets] Error fetching previous day's targets (might be first day):", error);
            // Non-blocking error
        }


        // Filtrar alvos disponíveis, excluindo os concluídos ontem
        const pool = availableTargets.filter(target => target.id && !completedYesterday.includes(target.id));

        if (pool.length === 0) {
            // If the pool is empty *after* excluding yesterday's, maybe all were done yesterday.
            // Check if the total number of active targets is equal to the number completed yesterday.
            // If so, regenerate from the full list (restart cycle).
            if (availableTargets.length > 0 && availableTargets.length === completedYesterday.length) {
                 console.log("[generateDailyTargets] All active targets were completed yesterday. Restarting cycle.");
                 const shuffledFullPool = availableTargets.sort(() => 0.5 - Math.random());
                 const selectedTargets = shuffledFullPool.slice(0, Math.min(10, availableTargets.length));
                 const targets = selectedTargets.map(target => ({ targetId: target.id, completed: false }));
                 await updateLastPresentedDates(userId, selectedTargets);
                 return { userId, date: dateStr, targets };
            } else {
                console.log("[generateDailyTargets] No targets available in the pool after filtering yesterday's completed ones.");
                return { userId, date: dateStr, targets: [] }; // Return empty list if pool is empty and cycle shouldn't restart
            }
        }

        // Seleção aleatória de até 10 alvos do pool filtrado
        const shuffledPool = pool.sort(() => 0.5 - Math.random());
        const selectedTargets = shuffledPool.slice(0, Math.min(10, pool.length));
        const targets = selectedTargets.map(target => ({ targetId: target.id, completed: false }));

        // Atualizar lastPresentedDate em batch
        await updateLastPresentedDates(userId, selectedTargets);

        console.log(`[generateDailyTargets] Generated ${targets.length} daily targets for ${userId} on ${dateStr}.`);
        return { userId, date: dateStr, targets };
    } catch (error) {
        console.error("[generateDailyTargets] General error generating daily targets:", error);
        return { userId, date: dateStr, targets: [] }; // Return empty on error
    }
}

// Helper function to update lastPresentedDate
async function updateLastPresentedDates(userId, selectedTargets) {
    if (!selectedTargets || selectedTargets.length === 0) return;

    const batch = writeBatch(db);
    const nowTimestamp = Timestamp.fromDate(new Date());

    selectedTargets.forEach(target => {
        if (target && target.id) { // Ensure target and target.id are valid
            const targetRef = doc(db, "users", userId, "prayerTargets", target.id);
            batch.update(targetRef, { lastPresentedDate: nowTimestamp });
        } else {
             console.warn("[updateLastPresentedDates] Skipping update for invalid target:", target);
        }
    });

    try {
        await batch.commit();
        console.log(`[updateLastPresentedDates] Updated lastPresentedDate for ${selectedTargets.length} targets.`);
    } catch (error) {
        console.error("[updateLastPresentedDates] Error committing batch update for lastPresentedDate:", error);
        // Decide how to handle commit errors - potentially log and continue
    }
}


// ==== MODIFIED FUNCTION: loadDailyTargets ====
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

        if (!dailySnapshot.exists()) {
            console.log(`[loadDailyTargets] Daily document for ${dailyDocId} not found, generating new targets.`);
            // Generate new targets for today
            dailyTargetsData = await generateDailyTargets(userId, todayStr);

            // Save the newly generated targets to Firestore
            try {
                await setDoc(dailyRef, dailyTargetsData);
                console.log(`[loadDailyTargets] Daily document ${dailyDocId} created successfully.`);
            } catch (error) {
                console.error("[loadDailyTargets] Error saving new daily document to Firestore:", error);
                document.getElementById("dailyTargets").innerHTML = "<p>Erro ao salvar alvos diários. Verifique o console.</p>";
                return; // Stop if saving fails
            }
        } else {
            dailyTargetsData = dailySnapshot.data();
            console.log(`[loadDailyTargets] Daily document ${dailyDocId} loaded from Firestore.`);
        }

        // Validate the loaded or generated data
        if (!dailyTargetsData || !Array.isArray(dailyTargetsData.targets)) {
            console.error("[loadDailyTargets] Invalid or missing daily targets data:", dailyTargetsData);
            document.getElementById("dailyTargets").innerHTML = "<p>Erro ao carregar alvos diários. Dados inválidos.</p>";
             // Attempt to regenerate if data is invalid? Or just show error?
             // For now, show error. Consider regeneration logic if needed.
            return;
        }

        // Separate pending and completed targets for rendering
        const pendingTargetIds = dailyTargetsData.targets.filter(t => !t.completed).map(t => t.targetId);
        const completedTargetIds = dailyTargetsData.targets.filter(t => t.completed).map(t => t.targetId);

        console.log(`[loadDailyTargets] Pending targets: ${pendingTargetIds.length}, Completed targets: ${completedTargetIds.length}`);

        // Fetch full target details only for the IDs in today's list
        const allTargetIds = [...pendingTargetIds, ...completedTargetIds];
        if (allTargetIds.length === 0) {
            document.getElementById("dailyTargets").innerHTML = "<p>Nenhum alvo de oração para hoje.</p>";
             displayRandomVerse();
            return;
        }

        // Fetch details for targets needed for display from the locally stored prayerTargets
        const targetsToDisplayDetails = prayerTargets.filter(pt => allTargetIds.includes(pt.id));

        // Map details back to pending and completed lists
        const pendingTargetsDetails = targetsToDisplayDetails.filter(t => pendingTargetIds.includes(t.id));
        const completedTargetsDetails = targetsToDisplayDetails.filter(t => completedTargetIds.includes(t.id));


        renderDailyTargets(pendingTargetsDetails, completedTargetsDetails); // Pass full details
        displayRandomVerse();

    } catch (error) {
        console.error("[loadDailyTargets] General error loading daily targets:", error);
        document.getElementById("dailyTargets").innerHTML = "<p>Erro ao carregar alvos diários. Verifique o console.</p>";
    }
}


// Helper function to render daily targets
function renderDailyTargets(pendingTargets, completedTargets) {
    const dailyTargetsDiv = document.getElementById("dailyTargets");
    dailyTargetsDiv.innerHTML = ''; // Clear previous content

    if (pendingTargets.length === 0 && completedTargets.length === 0) {
        dailyTargetsDiv.innerHTML = "<p>Nenhum alvo de oração selecionado para hoje.</p>";
        return;
    }

    // Render Pending Targets
    pendingTargets.forEach((target) => {
        if (!target || !target.id) return; // Skip invalid targets
        const dailyDiv = createTargetElement(target, false); // Not completed
        addPrayButtonFunctionality(dailyDiv, target.id); // Pass target ID
        dailyTargetsDiv.appendChild(dailyDiv);
    });

    // Add separator if both pending and completed exist
    if (pendingTargets.length > 0 && completedTargets.length > 0) {
         const separator = document.createElement('hr');
         separator.style.borderColor = '#ccc';
         dailyTargetsDiv.appendChild(separator);

         const completedTitle = document.createElement('h3');
         completedTitle.textContent = "Concluídos Hoje";
         completedTitle.style.color = '#777';
         completedTitle.style.fontSize = '1.1em';
         dailyTargetsDiv.appendChild(completedTitle);
    } else if (pendingTargets.length === 0 && completedTargets.length > 0) {
         const completedTitle = document.createElement('h3');
         completedTitle.textContent = "Concluídos Hoje";
         completedTitle.style.color = '#777';
         completedTitle.style.fontSize = '1.1em';
         dailyTargetsDiv.appendChild(completedTitle);
    }


    // Render Completed Targets
    completedTargets.forEach((target) => {
         if (!target || !target.id) return; // Skip invalid targets
        const dailyDiv = createTargetElement(target, true); // Completed
        dailyTargetsDiv.appendChild(dailyDiv);
    });

    // Check if all are done *after* rendering
    if (pendingTargets.length === 0 && completedTargets.length > 0) {
        displayCompletionPopup();
    }
}

// Helper to create target HTML element
function createTargetElement(target, isCompleted) {
    const dailyDiv = document.createElement("div");
    dailyDiv.classList.add("target");
    if (isCompleted) {
        dailyDiv.classList.add("completed-target"); // Add specific class for completed styling
    }
    dailyDiv.dataset.targetId = target.id; // Store ID for button functionality

    let deadlineTag = '';
    if (target.hasDeadline) {
        try {
            const formattedDeadline = formatDateForDisplay(target.deadlineDate);
            deadlineTag = `<span class="deadline-tag ${isDateExpired(target.deadlineDate) ? 'expired' : ''} ${isCompleted ? 'completed' : ''}">Prazo: ${formattedDeadline}</span>`;
        } catch(e) {
             console.error(`Error formatting deadline for daily target ${target.id}:`, e);
             deadlineTag = `<span class="deadline-tag error">Erro no Prazo</span>`;
        }
    }

    // Ensure observations are handled correctly (using rehydrated data)
    const observationsHTML = renderObservations(target.observations || [], false, target.id); // Pass targetId

    let formattedCreationDate = 'Inválida';
    let timeElapsedStr = 'Inválido';
    try { formattedCreationDate = formatDateForDisplay(target.date); } catch(e) {}
    try { timeElapsedStr = timeElapsed(target.date); } catch(e) {}

    dailyDiv.innerHTML = `
        <h3>${deadlineTag} ${target.title || 'Título Indisponível'}</h3>
        <p>${target.details || 'Detalhes Indisponíveis'}</p>
        <p><strong>Data Criação:</strong> ${formattedCreationDate}</p>
        <p><strong>Tempo Decorrido:</strong> ${timeElapsedStr}</p>
        ${observationsHTML}
    `;
    return dailyDiv;
}


// ==== MODIFIED FUNCTION: addPrayButtonFunctionality ====
function addPrayButtonFunctionality(dailyDiv, targetId) { // Accept targetId
    const prayButton = document.createElement("button");
    prayButton.textContent = "Orei!";
    prayButton.classList.add("pray-button", "btn"); // Add btn class for consistency
    prayButton.onclick = async () => {
        // const targetId = dailyDiv.dataset.targetId; // Get ID from the element dataset
        const userId = auth.currentUser.uid;
        const todayStr = formatDateToISO(new Date());
        const dailyDocId = `${userId}_${todayStr}`;
        const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);

        prayButton.disabled = true; // Disable button immediately to prevent double clicks
        prayButton.textContent = "Orado!"; // Change text

        try {
            const dailySnap = await getDoc(dailyRef);
            if (!dailySnap.exists()) {
                 // This case should ideally not happen if loadDailyTargets ran correctly
                 console.error("[addPrayButtonFunctionality] Daily document not found when trying to mark as prayed:", dailyDocId);
                 alert("Erro: Documento diário não encontrado. Tente recarregar.");
                 prayButton.disabled = false; // Re-enable button
                 prayButton.textContent = "Orei!";
                 return;
             }

            const dailyData = dailySnap.data();
            // Find the specific target and mark it completed
            let targetUpdated = false;
            const updatedTargets = dailyData.targets.map(t => {
                if (t.targetId === targetId) {
                    targetUpdated = true;
                    return { ...t, completed: true };
                }
                return t;
            });

            if (!targetUpdated) {
                 console.warn(`[addPrayButtonFunctionality] Target ID ${targetId} not found in daily document ${dailyDocId}.`);
                 // Optionally re-enable button or just proceed
             }

            // Update the document in Firestore
            await updateDoc(dailyRef, { targets: updatedTargets });
            console.log(`[addPrayButtonFunctionality] Target ${targetId} marked as completed for ${todayStr}.`);

            // Update click counts (no changes needed here)
            await updateClickCounts(userId, targetId);


            // Re-render the daily targets section immediately for visual feedback
            loadDailyTargets(); // This will re-fetch and re-render


        } catch (error) {
            console.error("[addPrayButtonFunctionality] Error registering 'Orei!':", error);
            alert("Erro ao registrar oração.");
            prayButton.disabled = false; // Re-enable button on error
            prayButton.textContent = "Orei!";
        }
    };
    // Insert button before the first child (usually the h3 title)
     if (dailyDiv.firstChild) {
         dailyDiv.insertBefore(prayButton, dailyDiv.firstChild);
     } else {
         dailyDiv.appendChild(prayButton); // Fallback if div is empty
     }
}

// Helper function to update click counts
async function updateClickCounts(userId, targetId) {
     const clickCountsRef = doc(db, "prayerClickCounts", targetId); // Use targetId as doc ID
     const now = new Date();
     const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
     const year = now.getFullYear().toString();

     try {
         const docSnap = await getDoc(clickCountsRef);

         if (docSnap.exists()) {
             // Document exists, increment counts
             await updateDoc(clickCountsRef, {
                 totalClicks: increment(1),
                 [`monthlyClicks.${yearMonth}`]: increment(1),
                 [`yearlyClicks.${year}`]: increment(1),
                 // Optionally update userId if it's missing or different?
                 // userId: userId // Uncomment if you want to ensure userId is always present
             });
         } else {
             // Document doesn't exist, create it
             await setDoc(clickCountsRef, {
                 targetId: targetId, // Store targetId within the document too
                 userId: userId, // Store the user ID who initiated clicks
                 totalClicks: 1,
                 monthlyClicks: { [yearMonth]: 1 },
                 yearlyClicks: { [year]: 1 }
             });
         }
         console.log(`[updateClickCounts] Click count updated for target ${targetId}.`);
     } catch (error) {
         console.error(`[updateClickCounts] Error updating click count for target ${targetId}:`, error);
         // Decide if this error should be shown to the user
     }
 }


// Initial load and authentication (as before, but loadDailyTargets instead of refreshDailyTargets)
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
            await fetchPrayerTargets(uid); // Fetches and rehydrates prayerTargets
            await fetchArchivedTargets(uid); // Fetches and rehydrates archivedTargets
            resolvedTargets = archivedTargets.filter(target => target.resolved).sort((a, b) => { // Sort resolved targets
                const dateA = (a.resolutionDate instanceof Date && !isNaN(a.resolutionDate)) ? a.resolutionDate : new Date(0);
                const dateB = (b.resolutionDate instanceof Date && !isNaN(b.resolutionDate)) ? b.resolutionDate : new Date(0);
                return dateB - dateA;
            });

            checkExpiredDeadlines(); // Checks deadlines on the rehydrated prayerTargets
            renderTargets(); // Renders main list
            renderArchivedTargets(); // Renders archived list
            renderResolvedTargets(); // Renders resolved list

            await loadDailyTargets(); // Load daily targets using new logic (depends on prayerTargets being loaded)
            await loadPerseveranceData(uid);
        } catch (error) {
             console.error("[loadData] Error during data loading process:", error);
             // Show a user-friendly error message?
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
        // Clear daily targets section explicitly for logged-out state
        document.getElementById("dailyTargets").innerHTML = "<p>Faça login para ver os alvos diários.</p>";
        document.getElementById('dailyVerses').textContent = ''; // Clear verse
        resetPerseveranceUI();
    }
}

// VERSÃO COM LOGS
async function fetchPrayerTargets(uid) {
    prayerTargets = []; // Reset local array
    const targetsRef = collection(db, "users", uid, "prayerTargets");
    const targetsSnapshot = await getDocs(query(targetsRef, orderBy("date", "desc")));

    // console.log(`[fetchPrayerTargets] Found ${targetsSnapshot.size} targets for user ${uid}`);

    const rawTargets = []; // Temporary array for raw data
    targetsSnapshot.forEach((doc) => {
        const targetData = { ...doc.data(), id: doc.id };
        // LOG MODIFICADO/ADICIONADO
        // console.log(`[fetchPrayerTargets] Raw data for target ${doc.id}:`, JSON.stringify(targetData));
        // console.log(`[fetchPrayerTargets] Type of date for target ${doc.id}:`, typeof targetData.date, targetData.date instanceof Timestamp ? 'Is Timestamp' : 'Is NOT Timestamp');
        rawTargets.push(targetData);
    });

    // LOG ADICIONADO antes de rehidratar
    // console.log('[fetchPrayerTargets] Data before rehydration:', JSON.stringify(rawTargets.map(t => ({ id: t.id, date: t.date }))));

    try {
        prayerTargets = rehydrateTargets(rawTargets); // Rehydrate the fetched data
        // console.log('[fetchPrayerTargets] Data AFTER rehydration:', JSON.stringify(prayerTargets.map(t => ({ id: t.id, date: t.date?.toISOString() })))); // Log rehydrated dates as ISO strings
    } catch (error) {
        console.error("[fetchPrayerTargets] Error during rehydrateTargets:", error);
        // Handle error - maybe set prayerTargets to an empty array or raw data?
        prayerTargets = []; // Safest option is likely an empty array if rehydration fails
    }
    // console.log("[fetchPrayerTargets] Final rehydrated prayerTargets count:", prayerTargets.length); // Log final count
}


async function fetchArchivedTargets(uid) {
    archivedTargets = []; // Reset local array
    const archivedRef = collection(db, "users", uid, "archivedTargets");
    const archivedSnapshot = await getDocs(query(archivedRef, orderBy("date", "desc")));

    // console.log(`[fetchArchivedTargets] Found ${archivedSnapshot.size} archived targets for user ${uid}`);

    const rawArchived = [];
    archivedSnapshot.forEach((doc) => {
        const archivedData = { ...doc.data(), id: doc.id };
        // console.log(`[fetchArchivedTargets] Raw data for archived target ${doc.id}:`, JSON.stringify(archivedData));
        // Basic check for timestamp (can be expanded like in fetchPrayerTargets if needed)
         if (archivedData.date && !(archivedData.date instanceof Timestamp)) {
             // console.warn(`[fetchArchivedTargets] Archived Target ${doc.id} date is not a Timestamp, will attempt parse in rehydrate.`);
         }
        rawArchived.push(archivedData);
    });

     // console.log('[fetchArchivedTargets] Archived data before rehydration:', JSON.stringify(rawArchived.map(t => ({ id: t.id, date: t.date }))));

    try {
        archivedTargets = rehydrateTargets(rawArchived); // Rehydrate using the same function
        // console.log('[fetchArchivedTargets] Archived data AFTER rehydration:', JSON.stringify(archivedTargets.map(t => ({ id: t.id, date: t.date?.toISOString() }))));
    } catch(error) {
         console.error("[fetchArchivedTargets] Error during rehydrateTargets for archived items:", error);
         archivedTargets = []; // Reset on error
    }
    // console.log("[fetchArchivedTargets] Final rehydrated archivedTargets count:", archivedTargets.length);
}


window.onload = () => {
    onAuthStateChanged(auth, (user) => {
        loadData(user);
    });
    document.getElementById('searchMain').addEventListener('input', handleSearchMain);
    document.getElementById('searchArchived').addEventListener('input', handleSearchArchived);
    document.getElementById('searchResolved').addEventListener('input', handleSearchResolved);
    document.getElementById('showDeadlineOnly').addEventListener('change', handleDeadlineFilterChange);
    document.getElementById('showExpiredOnlyMain').addEventListener('change', handleExpiredOnlyMainChange);
    document.getElementById('confirmPerseveranceButton').addEventListener('click', confirmPerseverance);
    document.getElementById("viewReportButton").addEventListener('click', () => { window.location.href = 'orei.html'; });
    const btnGoogleLogin = document.getElementById('btnGoogleLogin');
    if (btnGoogleLogin) { btnGoogleLogin.addEventListener('click', signInWithGoogle); }

    // ==== NEW EVENT LISTENERS ====
    const btnEmailSignUp = document.getElementById('btnEmailSignUp');
    if (btnEmailSignUp) { btnEmailSignUp.addEventListener('click', signUpWithEmailPassword); }
    const btnEmailSignIn = document.getElementById('btnEmailSignIn');
    if (btnEmailSignIn) { btnEmailSignIn.addEventListener('click', signInWithEmailPassword); }
    const btnForgotPassword = document.getElementById('btnForgotPassword');
    if (btnForgotPassword) { btnForgotPassword.addEventListener('click', resetPassword); }
    document.getElementById('btnLogout').addEventListener('click', () => {
        signOut(auth)
            .then(() => console.log("User signed out."))
            .catch(error => console.error("Sign out error:", error));
        // loadData(null) will be called by onAuthStateChanged
    });
    document.getElementById("refreshDaily").addEventListener("click", async () => {
        const user = auth.currentUser;
        if (!user) {
            alert("Você precisa estar logado para atualizar os alvos.");
            return;
        }
        if (confirm("Tem certeza que deseja atualizar os alvos do dia? Isso irá gerar uma nova lista aleatória para hoje.")) {
            const userId = user.uid;
            const todayStr = formatDateToISO(new Date());
            const dailyDocId = `${userId}_${todayStr}`;
            const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);

            try {
                console.log("[refreshDaily] User confirmed refresh. Generating new targets...");
                // Generate new targets (generateDailyTargets handles selection logic)
                const newTargetsData = await generateDailyTargets(userId, todayStr);
                // Overwrite today's document with the new list
                await setDoc(dailyRef, newTargetsData);
                console.log("[refreshDaily] New daily targets saved. Reloading daily section...");
                loadDailyTargets(); // Reload to display the new list
                alert("Alvos do dia atualizados!");
            } catch (error) {
                console.error("[refreshDaily] Error refreshing daily targets:", error);
                alert("Erro ao atualizar alvos diários. Verifique o console.");
            }
        }
     });
};


// VERSÃO COM LOGS
function renderTargets() {
    const targetListDiv = document.getElementById('targetList');
    targetListDiv.innerHTML = '';

    let filteredAndPagedTargets = [...prayerTargets];

    // Filter by search term
    if (currentSearchTermMain) {
        filteredAndPagedTargets = filterTargets(filteredAndPagedTargets, currentSearchTermMain);
    }

    // Filter by deadline and expired status
    if (showDeadlineOnly) {
        filteredAndPagedTargets = filteredAndPagedTargets.filter(target => target.hasDeadline);
    }
    const showExpiredOnlyMainCheckbox = document.getElementById('showExpiredOnlyMain');
    if (showExpiredOnlyMainCheckbox && showExpiredOnlyMainCheckbox.checked) {
        filteredAndPagedTargets = filteredAndPagedTargets.filter(target => target.hasDeadline && isDateExpired(target.deadlineDate));
    }

    // Sort by deadline if deadline filter is active, otherwise by date
    if (showDeadlineOnly || (showExpiredOnlyMainCheckbox && showExpiredOnlyMainCheckbox.checked)) {
        filteredAndPagedTargets.sort((a, b) => {
            // Ensure dates are valid Date objects before comparing
            const dateA = (a.deadlineDate instanceof Date && !isNaN(a.deadlineDate)) ? a.deadlineDate : null;
            const dateB = (b.deadlineDate instanceof Date && !isNaN(b.deadlineDate)) ? b.deadlineDate : null;

            if (dateA && dateB) return dateA - dateB; // Sort by deadline asc
            if (dateA) return -1; // a has deadline, b doesn't
            if (dateB) return 1;  // b has deadline, a doesn't
            // If neither has a valid deadline, sort by creation date desc (newest first)
             const creationDateA = (a.date instanceof Date && !isNaN(a.date)) ? a.date : new Date(0); // Fallback for sorting
             const creationDateB = (b.date instanceof Date && !isNaN(b.date)) ? b.date : new Date(0);
             return creationDateB - creationDateA;
        });
    } else {
        // Default sort by creation date, newest first
        filteredAndPagedTargets.sort((a, b) => {
             const creationDateA = (a.date instanceof Date && !isNaN(a.date)) ? a.date : new Date(0);
             const creationDateB = (b.date instanceof Date && !isNaN(b.date)) ? b.date : new Date(0);
             return creationDateB - creationDateA;
         });
    }


    const startIndex = (currentPage - 1) * targetsPerPage;
    const endIndex = startIndex + targetsPerPage;
    const targetsToDisplay = filteredAndPagedTargets.slice(startIndex, endIndex);
    lastDisplayedTargets = targetsToDisplay;

    // console.log(`[renderTargets] Rendering ${targetsToDisplay.length} targets for page ${currentPage}`); // LOG ADICIONADO

    if (targetsToDisplay.length === 0 && currentPage > 1) {
        // console.log('[renderTargets] No targets to display on this page, going back to page 1.'); // LOG ADICIONADO
        currentPage = 1;
        renderTargets(); // Re-render on the first page
        return;
    }
     if (targetsToDisplay.length === 0 && filteredAndPagedTargets.length > 0) {
         // This case shouldn't happen with the logic above, but as a fallback
         // console.warn("[renderTargets] No targets to display, but filtered list is not empty. Check pagination/filtering.");
         targetListDiv.innerHTML = '<p>Nenhum alvo encontrado para esta página ou filtro.</p>';
         renderPagination('mainPanel', currentPage, filteredAndPagedTargets); // Render pagination even if empty
         return;
     }
      if (targetsToDisplay.length === 0 && filteredAndPagedTargets.length === 0) {
         // console.log("[renderTargets] No targets found matching current filters.");
         targetListDiv.innerHTML = '<p>Nenhum alvo de oração encontrado.</p>';
         renderPagination('mainPanel', currentPage, filteredAndPagedTargets); // Render empty pagination
         return;
     }

    targetsToDisplay.forEach((target) => {
        if (!target || !target.id) {
             console.warn("[renderTargets] Skipping rendering of invalid target:", target);
             return; // Skip this iteration if target is invalid
         }

        const targetDiv = document.createElement("div");
        targetDiv.classList.add("target");
        targetDiv.dataset.targetId = target.id;

        // LOG ADICIONADO - Antes de chamar formatDateForDisplay e timeElapsed
        // console.log(`[renderTargets] Preparing to format dates for target ${target.id}. Date value:`, target.date, '| Deadline value:', target.deadlineDate);

        // Use try-catch blocks for robustness during rendering
        let formattedDate = 'Erro ao formatar';
        let formattedDeadline = 'Erro ao formatar';
        let elapsed = 'Erro ao calcular';
        let deadlineTag = '';

        try {
            formattedDate = formatDateForDisplay(target.date);
        } catch (e) { console.error(`Error formatting date for ${target.id}:`, e); }

        try {
             elapsed = timeElapsed(target.date);
        } catch (e) { console.error(`Error calculating timeElapsed for ${target.id}:`, e); }

         try {
            if (target.hasDeadline) {
                formattedDeadline = formatDateForDisplay(target.deadlineDate);
                deadlineTag = `<span class="deadline-tag ${isDateExpired(target.deadlineDate) ? 'expired' : ''}">Prazo: ${formattedDeadline}</span>`;
            }
        } catch (e) {
             console.error(`Error formatting deadline for ${target.id}:`, e);
             deadlineTag = target.hasDeadline ? `<span class="deadline-tag error">Erro no Prazo</span>` : '';
        }


        // Ensure observations is an array before rendering
        const observations = Array.isArray(target.observations) ? target.observations : [];

        targetDiv.innerHTML = `
            <h3>${deadlineTag} ${target.title || 'Sem Título'}</h3>
            <p>${target.details || 'Sem Detalhes'}</p>
            <p><strong>Data:</strong> ${formattedDate}</p>
            <p><strong>Tempo Decorrido:</strong> ${elapsed}</p>
            ${renderObservations(observations, false, target.id)} <!-- Passa targetId -->
            <div class="target-actions">
                <button class="resolved btn" onclick="markAsResolved('${target.id}')">Respondido</button>
                <button class="archive btn" onclick="archiveTarget('${target.id}')">Arquivar</button>
                <button class="add-observation btn" onclick="toggleAddObservation('${target.id}')">Observação</button>
                ${target.hasDeadline ? `<button class="edit-deadline btn" onclick="editDeadline('${target.id}')">Editar Prazo</button>` : ''}
            </div>
            <div id="observationForm-${target.id}" class="add-observation-form" style="display:none;"></div>
            <div id="observations-${target.id}" class="observations-list" style="display:block;"></div> <!-- DEIXAR display:block para o conteúdo aparecer-->
        `;
        targetListDiv.appendChild(targetDiv);
        renderObservationForm(target.id);
        renderExistingObservations(target.id); // Ensure this uses the 'observations' array e renderiza no div correto
    });

    renderPagination('mainPanel', currentPage, filteredAndPagedTargets);
}


function renderArchivedTargets() {
    const archivedListDiv = document.getElementById('archivedList');
    archivedListDiv.innerHTML = '';
    let filteredAndPagedArchivedTargets = [...archivedTargets]; // Use rehydrated archivedTargets

    if (currentSearchTermArchived) {
        filteredAndPagedArchivedTargets = filterTargets(filteredAndPagedArchivedTargets, currentSearchTermArchived);
    }
    // Sort by date desc
    filteredAndPagedArchivedTargets.sort((a, b) => {
        const dateA = (a.date instanceof Date && !isNaN(a.date)) ? a.date : new Date(0);
        const dateB = (b.date instanceof Date && !isNaN(b.date)) ? b.date : new Date(0);
        return dateB - dateA;
    });

    const startIndex = (currentArchivedPage - 1) * targetsPerPage;
    const endIndex = startIndex + targetsPerPage;
    const targetsToDisplay = filteredAndPagedArchivedTargets.slice(startIndex, endIndex);

    // console.log(`[renderArchivedTargets] Rendering ${targetsToDisplay.length} archived targets for page ${currentArchivedPage}`);

    if (targetsToDisplay.length === 0 && currentArchivedPage > 1) {
        currentArchivedPage = 1;
        renderArchivedTargets();
        return;
    }
     if (targetsToDisplay.length === 0) {
         archivedListDiv.innerHTML = '<p>Nenhum alvo arquivado encontrado.</p>';
         renderPagination('archivedPanel', currentArchivedPage, filteredAndPagedArchivedTargets);
         return;
     }

    targetsToDisplay.forEach((target) => {
         if (!target || !target.id) {
             console.warn("[renderArchivedTargets] Skipping rendering of invalid archived target:", target);
             return;
         }
        const archivedDiv = document.createElement("div");
        archivedDiv.classList.add("target", "archived"); // Add 'archived' class
        archivedDiv.dataset.targetId = target.id;

        let formattedDate = 'Erro';
        let elapsed = 'Erro';
        try { formattedDate = formatDateForDisplay(target.date); } catch (e) { console.error("Error formatting archived date:", e); }
        try { elapsed = timeElapsed(target.date); } catch (e) { console.error("Error calculating archived timeElapsed:", e); }

        const observations = Array.isArray(target.observations) ? target.observations : [];

        archivedDiv.innerHTML = `
            <h3>${target.title || 'Sem Título'}</h3>
            <p>${target.details || 'Sem Detalhes'}</p>
            <p><strong>Data Arquivado/Criado:</strong> ${formattedDate}</p> <!-- Clarify date context -->
            <p><strong>Tempo Decorrido:</strong> ${elapsed}</p>
            <div id="observations-${target.id}" class="observations-list" style="display:block;"></div> <!-- Div para observações -->
            <div class="target-actions">
                <button class="delete btn" onclick="deleteArchivedTarget('${target.id}')">Excluir</button>
                <!-- <button class="add-observation btn" onclick="toggleAddObservation('${target.id}')">Observação</button> --> <!-- Pode adicionar observação em arquivado? -->
            </div>
             <!-- <div id="observationForm-${target.id}" class="add-observation-form" style="display:none;"></div> --> <!-- Formulário de observação se permitido -->
        `;
        archivedListDiv.appendChild(archivedDiv);
         // Renderiza observações existentes
         renderExistingObservations(target.id, false); // Passa false para não expandir inicialmente
         // renderObservationForm(target.id); // Renderiza form se permitido
    });
    renderPagination('archivedPanel', currentArchivedPage, filteredAndPagedArchivedTargets);
}

function renderResolvedTargets() {
    const resolvedListDiv = document.getElementById('resolvedList');
    resolvedListDiv.innerHTML = '';
    let filteredAndPagedResolvedTargets = [...resolvedTargets]; // Use global resolvedTargets

    if (currentSearchTermResolved) {
        filteredAndPagedResolvedTargets = filterTargets(filteredAndPagedResolvedTargets, currentSearchTermResolved);
    }
     // Sort by resolutionDate desc (most recent first)
     filteredAndPagedResolvedTargets.sort((a, b) => {
         const dateA = (a.resolutionDate instanceof Date && !isNaN(a.resolutionDate)) ? a.resolutionDate : new Date(0);
         const dateB = (b.resolutionDate instanceof Date && !isNaN(b.resolutionDate)) ? b.resolutionDate : new Date(0);
         return dateB - dateA;
     });

    const startIndex = (currentResolvedPage - 1) * targetsPerPage;
    const endIndex = startIndex + targetsPerPage;
    const targetsToDisplay = filteredAndPagedResolvedTargets.slice(startIndex, endIndex);

     // console.log(`[renderResolvedTargets] Rendering ${targetsToDisplay.length} resolved targets for page ${currentResolvedPage}`);

     if (targetsToDisplay.length === 0 && currentResolvedPage > 1) {
        currentResolvedPage = 1;
        renderResolvedTargets();
        return;
    }
    if (targetsToDisplay.length === 0) {
        resolvedListDiv.innerHTML = '<p>Nenhum alvo respondido encontrado.</p>';
        renderPagination('resolvedPanel', currentResolvedPage, filteredAndPagedResolvedTargets);
        return;
    }

    targetsToDisplay.forEach((target) => {
         if (!target || !target.id) {
             console.warn("[renderResolvedTargets] Skipping rendering of invalid resolved target:", target);
             return;
         }
        const resolvedDiv = document.createElement("div");
        resolvedDiv.classList.add("target", "resolved"); // Add 'resolved' class
        resolvedDiv.dataset.targetId = target.id;

        let formattedResolutionDate = 'Erro';
        let totalTime = 'Erro';
         try { formattedResolutionDate = formatDateForDisplay(target.resolutionDate); } catch (e) { console.error("Error formatting resolution date:", e); }
         try {
             // Calculate total time from creation to resolution
             const creationDate = (target.date instanceof Date && !isNaN(target.date)) ? target.date : null;
             const resolutionDate = (target.resolutionDate instanceof Date && !isNaN(target.resolutionDate)) ? target.resolutionDate : null;
             if (creationDate && resolutionDate) {
                 // Use timeElapsed logic but with resolutionDate as 'now'
                 let diffInSeconds = Math.floor((resolutionDate - creationDate) / 1000);
                 if (diffInSeconds < 0) diffInSeconds = 0;
                 if (diffInSeconds < 60) totalTime = `${diffInSeconds} segundos`;
                 else { let diffInMinutes = Math.floor(diffInSeconds / 60);
                     if (diffInMinutes < 60) totalTime = `${diffInMinutes} minutos`;
                     else { let diffInHours = Math.floor(diffInMinutes / 60);
                         if (diffInHours < 24) totalTime = `${diffInHours} horas`;
                         else { let diffInDays = Math.floor(diffInHours / 24);
                             if (diffInDays < 30) totalTime = `${diffInDays} dias`;
                             else { let diffInMonths = Math.floor(diffInDays / 30.44);
                                 if (diffInMonths < 12) totalTime = `${diffInMonths} meses`;
                                 else { let diffInYears = Math.floor(diffInDays / 365.25); totalTime = `${diffInYears} anos`; }
                             }
                         }
                     }
                 }
             } else {
                 totalTime = "Datas inválidas";
             }
         } catch (e) { console.error("Error calculating total time for resolved:", e); }

        const observations = Array.isArray(target.observations) ? target.observations : [];

        resolvedDiv.innerHTML = `
            <h3>${target.title || 'Sem Título'} (Respondido)</h3>
            <p>${target.details || 'Sem Detalhes'}</p>
            <p><strong>Data Respondido:</strong> ${formattedResolutionDate}</p>
            <p><strong>Tempo Total (Criação -> Resposta):</strong> ${totalTime}</p>
            <div id="observations-${target.id}" class="observations-list" style="display:block;"></div> <!-- Div para observações -->
             <!-- No actions needed usually for resolved items -->
        `;
        resolvedListDiv.appendChild(resolvedDiv);
         renderExistingObservations(target.id, false); // Renderiza observações
    });
    renderPagination('resolvedPanel', currentResolvedPage, filteredAndPagedResolvedTargets);
}

function renderPagination(panelId, page, targets) {
    const paginationDiv = document.getElementById(`pagination-${panelId}`);
    if (!paginationDiv) {
        // console.warn(`[renderPagination] Pagination container 'pagination-${panelId}' not found.`);
        return; // Exit if the pagination div is not found
    }

    paginationDiv.innerHTML = '';
    const totalItems = targets ? targets.length : 0;
    const totalPages = Math.ceil(totalItems / targetsPerPage);

    // console.log(`[renderPagination] Panel: ${panelId}, Current Page: ${page}, Total Items: ${totalItems}, Total Pages: ${totalPages}`);

    if (totalPages <= 1) {
        paginationDiv.style.display = 'none'; // Hide pagination if only one page or empty
        return;
    } else {
        paginationDiv.style.display = 'flex'; // Show pagination if more than one page
    }

    // Add Previous button
    if (page > 1) {
        const prevLink = document.createElement('a');
        prevLink.href = '#';
        prevLink.textContent = '« Anterior';
        prevLink.classList.add('page-link');
        prevLink.addEventListener('click', (event) => {
            event.preventDefault();
            handlePageChange(panelId, page - 1);
        });
        paginationDiv.appendChild(prevLink);
    }

    // Add Page number links (simplified logic for brevity, could add ellipsis for many pages)
    const maxPagesToShow = 5; // Max number links to show directly
    let startPage = Math.max(1, page - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

     // Adjust if we are near the end
     if (endPage - startPage + 1 < maxPagesToShow) {
         startPage = Math.max(1, endPage - maxPagesToShow + 1);
     }

     if (startPage > 1) {
        const firstLink = document.createElement('a');
        firstLink.href = '#';
        firstLink.textContent = '1';
        firstLink.classList.add('page-link');
        firstLink.addEventListener('click', (event) => {
            event.preventDefault(); handlePageChange(panelId, 1);
        });
        paginationDiv.appendChild(firstLink);
        if (startPage > 2) {
            const ellipsis = document.createElement('span');
            ellipsis.textContent = '...';
             ellipsis.style.margin = '0 5px';
             ellipsis.style.padding = '8px 0';
            paginationDiv.appendChild(ellipsis);
        }
     }


    for (let i = startPage; i <= endPage; i++) {
        const pageLink = document.createElement('a');
        pageLink.href = '#';
        pageLink.textContent = i;
        pageLink.classList.add('page-link');
        if (i === page) {
            pageLink.classList.add('active');
        }
        pageLink.addEventListener('click', (event) => {
            event.preventDefault();
            handlePageChange(panelId, i);
        });
        paginationDiv.appendChild(pageLink);
    }

     if (endPage < totalPages) {
         if (endPage < totalPages - 1) {
             const ellipsis = document.createElement('span');
             ellipsis.textContent = '...';
             ellipsis.style.margin = '0 5px';
             ellipsis.style.padding = '8px 0';
             paginationDiv.appendChild(ellipsis);
         }
         const lastLink = document.createElement('a');
         lastLink.href = '#';
         lastLink.textContent = totalPages;
         lastLink.classList.add('page-link');
         lastLink.addEventListener('click', (event) => {
             event.preventDefault(); handlePageChange(panelId, totalPages);
         });
         paginationDiv.appendChild(lastLink);
     }


    // Add Next button
    if (page < totalPages) {
        const nextLink = document.createElement('a');
        nextLink.href = '#';
        nextLink.textContent = 'Próxima »';
        nextLink.classList.add('page-link');
        nextLink.addEventListener('click', (event) => {
            event.preventDefault();
            handlePageChange(panelId, page + 1);
        });
        paginationDiv.appendChild(nextLink);
    }
}

// Helper function to handle page changes
function handlePageChange(panelId, newPage) {
    // console.log(`[handlePageChange] Panel: ${panelId}, Changing to page: ${newPage}`);
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
     // Scroll to the top of the list after page change for better UX
     const panelElement = document.getElementById(panelId);
     if (panelElement) {
         panelElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
     }
}


function renderObservations(observations, isExpanded = false, targetId = null) { // Added targetId
     // Ensure observations is an array
    if (!Array.isArray(observations)) {
        return ''; // Return empty string if not an array
    }
    if (observations.length === 0) return '';

    // Sort observations by date, most recent first
    observations.sort((a, b) => {
        const dateA = (a.date instanceof Date && !isNaN(a.date)) ? a.date : new Date(0);
        const dateB = (b.date instanceof Date && !isNaN(b.date)) ? b.date : new Date(0);
        return dateB - dateA; // Most recent first
    });


    const displayCount = isExpanded ? observations.length : 1; // Show only the latest one by default
    const visibleObservations = observations.slice(0, displayCount);
    const remainingCount = observations.length - displayCount;

    let observationsHTML = `<div class="observations">`; // Wrapper div
    visibleObservations.forEach(observation => {
        let formattedDate = 'Data Inválida';
        try { formattedDate = formatDateForDisplay(observation.date); } catch(e) { console.error("Error formatting observation date:", e)}
        observationsHTML += `<p class="observation-item"><strong>${formattedDate}:</strong> ${observation.text || ''}</p>`; // Add default for text
    });

     // Use targetId for the toggle function call
    if (targetId) {
        if (!isExpanded && remainingCount > 0) {
             // Use a unique ID for the toggle link if needed, or rely on onclick context
            observationsHTML += `<a href="#" class="observations-toggle" onclick="window.toggleObservations('${targetId}', event); return false;">Ver mais ${remainingCount} observações</a>`;
        } else if (isExpanded && observations.length > 1) { // Mostra "Ver menos" apenas se expandido E houver mais de uma obs
            observationsHTML += `<a href="#" class="observations-toggle" onclick="window.toggleObservations('${targetId}', event); return false;">Ver menos observações</a>`;
        }
    } else {
         console.warn("[renderObservations] targetId not provided, toggle links will not work correctly.");
     }

    observationsHTML += `</div>`; // Close wrapper div
    return observationsHTML;
}

// Make toggleObservations globally accessible and handle event
window.toggleObservations = function(targetId, event) {
    if (event) event.preventDefault(); // Prevent default link behavior

    // console.log(`[toggleObservations] Toggling for target ${targetId}`);
    const targetDiv = document.querySelector(`.target[data-target-id="${targetId}"]`);
    if (!targetDiv) {
        console.error(`[toggleObservations] Target div not found for ID: ${targetId}`);
        return;
    }
    // Find the observations container *inside the correct list div*
    const observationsListDiv = targetDiv.querySelector(`#observations-${targetId}`);
    if (!observationsListDiv) {
         console.error(`[toggleObservations] Observations list div #observations-${targetId} not found within target div.`);
         return;
     }

    // Determine if currently expanded by checking the link text within the list div
    const toggleLink = observationsListDiv.querySelector('.observations-toggle');
    const isExpanded = toggleLink?.textContent.includes('Ver menos');

    // Find the correct target data (search all lists)
    const target = prayerTargets.find(t => t.id === targetId) ||
                   archivedTargets.find(t => t.id === targetId) ||
                   resolvedTargets.find(t => t.id === targetId);

    if (!target) {
        console.error(`[toggleObservations] Target data not found for ID: ${targetId}`);
        return;
    }

    // Re-render the observations part inside the correct div with the toggled state
    renderExistingObservations(targetId, !isExpanded); // Call helper to re-render content of the list div

    // console.log(`[toggleObservations] Re-rendered observations for ${targetId}. Expanded: ${!isExpanded}`);
};


window.toggleAddObservation = function(targetId) {
    const formDiv = document.getElementById(`observationForm-${targetId}`);
    if (!formDiv) {
         console.error(`[toggleAddObservation] Observation form div not found for ID: ${targetId}`);
         return;
     }
    const isVisible = formDiv.style.display === 'block';
    formDiv.style.display = isVisible ? 'none' : 'block';
    // console.log(`[toggleAddObservation] Form for ${targetId} visibility set to ${isVisible ? 'none' : 'block'}.`);
     // Focus the textarea when showing the form
     if (!isVisible) {
         const textarea = formDiv.querySelector(`textarea`);
         if (textarea) textarea.focus();
     }
}

function renderObservationForm(targetId) {
    const formDiv = document.getElementById(`observationForm-${targetId}`);
    if (!formDiv) return;
    formDiv.innerHTML = `
        <textarea id="observationText-${targetId}" placeholder="Nova observação..." rows="3"></textarea>
        <input type="date" id="observationDate-${targetId}">
        <button class="btn" onclick="saveObservation('${targetId}')">Salvar Observação</button>
    `;
    // Pre-fill date with today's date
    try {
        document.getElementById(`observationDate-${targetId}`).value = formatDateToISO(new Date());
    } catch(e) {
         console.error("[renderObservationForm] Error setting default date:", e);
         // Optionally set to empty string or handle error
         document.getElementById(`observationDate-${targetId}`).value = '';
     }
}

// ========================================================================
// =========>>>>> FUNÇÃO saveObservation COM CORREÇÃO <<<<<================
// ========================================================================
window.saveObservation = async function(targetId) {
    const observationText = document.getElementById(`observationText-${targetId}`).value.trim();
    const observationDateInput = document.getElementById(`observationDate-${targetId}`).value; // Formato "YYYY-MM-DD"

    if (!observationText) {
        alert('Por favor, insira o texto da observação.');
        return;
    }
    // Validação da data de observação
    if (!observationDateInput || isNaN(new Date(observationDateInput.replace(/-/g, '/')).getTime())) {
         alert('Data da observação inválida.');
         return;
     }

    // *** CORREÇÃO: Criar Date como meia-noite LOCAL ***
    const [obsYear, obsMonth, obsDay] = observationDateInput.split('-').map(Number);
    const observationDate = new Date(obsYear, obsMonth - 1, obsDay); // month-1

    const user = auth.currentUser;
    if (!user) {
        alert("Erro: Usuário não autenticado.");
        return;
    }
    const userId = user.uid;

    // Determine if the target is in prayerTargets or archivedTargets
    let targetRef;
    let targetList; // Referência ao array local (prayerTargets ou archivedTargets)
    let targetCollectionName; // Nome da coleção Firestore ('prayerTargets' ou 'archivedTargets')

    let targetIndex = prayerTargets.findIndex(t => t.id === targetId);
    if (targetIndex !== -1) {
        targetCollectionName = "prayerTargets";
        targetRef = doc(db, "users", userId, targetCollectionName, targetId);
        targetList = prayerTargets;
        // console.log(`[saveObservation] Target ${targetId} found in active targets.`);
    } else {
        targetIndex = archivedTargets.findIndex(t => t.id === targetId);
        if (targetIndex !== -1) {
            targetCollectionName = "archivedTargets";
            targetRef = doc(db, "users", userId, targetCollectionName, targetId);
            targetList = archivedTargets; // Aponta para o array local correto
            // console.log(`[saveObservation] Target ${targetId} found in archived targets.`);
        } else {
            alert("Erro: Alvo não encontrado para adicionar observação.");
            console.error(`[saveObservation] Target ${targetId} not found in active or archived lists.`);
            return;
        }
    }

    // Nova observação para Firestore (com Timestamp)
    const newObservationFirestore = {
        text: observationText,
        date: Timestamp.fromDate(observationDate), // Salva Timestamp da meia-noite local
        id: generateUniqueId(),
        targetId: targetId
    };

     // Nova observação para estado local (com objeto Date)
     const newObservationLocal = {
        ...newObservationFirestore,
        date: observationDate // Usa o objeto Date local
    };

    // console.log(`[saveObservation] Saving observation for target ${targetId}:`, newObservationFirestore);

    try {
        // CORREÇÃO: Usar leitura/modificação/escrita para o array no Firestore

        // 1. Obter dados atuais do Firestore
        const targetDoc = await getDoc(targetRef);
        let currentObservationsFirestore = [];
        if (targetDoc.exists()) {
            const data = targetDoc.data();
            // Garante que 'observations' seja um array
            currentObservationsFirestore = Array.isArray(data.observations) ? data.observations : [];
        } else {
            // Se o documento não existe (improvável, mas possível), começamos com array vazio
            console.warn(`[saveObservation] Document ${targetId} in ${targetCollectionName} not found. Will create/overwrite observations array.`);
        }

        // 2. Adicionar a nova observação (com Timestamp) ao array do Firestore
        currentObservationsFirestore.push(newObservationFirestore);

        // 3. Ordenar o array do Firestore (opcional, mas bom para consistência)
         currentObservationsFirestore.sort((a, b) => {
             // Assume que 'date' é um Timestamp
             const timeA = a.date ? a.date.toMillis() : 0;
             const timeB = b.date ? b.date.toMillis() : 0;
             return timeB - timeA; // Mais recentes primeiro
         });

        // 4. Atualizar o documento no Firestore com o array completo
        await updateDoc(targetRef, {
            observations: currentObservationsFirestore
        });

        // --- Update Local State (no array global 'prayerTargets' ou 'archivedTargets') ---
        // Encontra o alvo no array local correto (targetList)
        const localTargetIndex = targetList.findIndex(t => t.id === targetId);
        if (localTargetIndex !== -1) {
            const localTarget = targetList[localTargetIndex];
            // Garante que observations exista como array
            if (!localTarget.observations || !Array.isArray(localTarget.observations)) {
                localTarget.observations = [];
            }
            // Adiciona a nova observação LOCAL (com objeto Date)
            localTarget.observations.push(newObservationLocal);
            // Ordena o array local
            localTarget.observations.sort((a, b) => {
                 const dateA = (a.date instanceof Date && !isNaN(a.date)) ? a.date : new Date(0);
                 const dateB = (b.date instanceof Date && !isNaN(b.date)) ? b.date : new Date(0);
                return dateB - dateA; // Mais recentes primeiro
            });
        } else {
             // Isso não deveria acontecer se a lógica inicial estiver correta
             console.error(`[saveObservation] Target ${targetId} not found in local list ('targetList') after Firestore update.`);
         }


        console.log(`[saveObservation] Observation saved successfully for ${targetId}.`);

        // --- Re-render relevant sections ---
         if (targetList === prayerTargets) {
             renderTargets(); // Re-render a lista principal
         } else if (targetList === archivedTargets) {
             renderArchivedTargets(); // Re-render arquivados
              // Re-render resolvidos SE o alvo arquivado também estiver na lista de resolvidos
              if (resolvedTargets.some(rt => rt.id === targetId)) {
                  renderResolvedTargets();
              }
         }

        toggleAddObservation(targetId); // Esconde o formulário
        document.getElementById(`observationText-${targetId}`).value = ''; // Limpa o texto
        // *** CORREÇÃO: Resetar data da observação para hoje ***
        try {
            document.getElementById(`observationDate-${targetId}`).value = formatDateToISO(new Date());
        } catch(e) {
            console.error("[saveObservation] Error resetting observation date input:", e);
            document.getElementById(`observationDate-${targetId}`).value = '';
        }

    } catch (error) {
        console.error("[saveObservation] Error saving observation:", error);
        alert("Erro ao salvar observação. Verifique o console.");
    }
}
// ========================================================================
// ========================================================================


// Modified renderExistingObservations to potentially take context
function renderExistingObservations(targetId, isExpanded = false) {
     const observationsListDiv = document.getElementById(`observations-${targetId}`);
     if (!observationsListDiv) {
         // console.warn(`[renderExistingObservations] Observations list div 'observations-${targetId}' not found.`);
         return;
     }
     observationsListDiv.innerHTML = ''; // Limpa conteúdo anterior

    // Find target in appropriate list based on context if needed, or search all
    const target = prayerTargets.find(t => t.id === targetId) ||
                   archivedTargets.find(t => t.id === targetId); // includes resolved

    if (!target || !Array.isArray(target.observations) || target.observations.length === 0) {
        observationsListDiv.style.display = 'none'; // Hide if no observations
        return;
    }

    // Sort observations by date, most recent first (redundant if sorted in save/renderObservations, but safe)
    const sortedObservations = [...target.observations].sort((a, b) => {
         const dateA = (a.date instanceof Date && !isNaN(a.date)) ? a.date : new Date(0);
         const dateB = (b.date instanceof Date && !isNaN(b.date)) ? b.date : new Date(0);
         return dateB - dateA;
    });

    // Renderiza o HTML das observações usando renderObservations
    observationsListDiv.innerHTML = renderObservations(sortedObservations, isExpanded, targetId);

    observationsListDiv.style.display = 'block'; // Garante que o container esteja visível se tiver conteúdo

}


function handleDeadlineFilterChange() {
    showDeadlineOnly = document.getElementById('showDeadlineOnly').checked;
    currentPage = 1;
    // console.log(`[handleDeadlineFilterChange] Show deadline only set to: ${showDeadlineOnly}`);
    renderTargets();
}

function handleExpiredOnlyMainChange() {
    currentPage = 1;
     const isChecked = document.getElementById('showExpiredOnlyMain').checked;
     // console.log(`[handleExpiredOnlyMainChange] Show expired only set to: ${isChecked}`);
    renderTargets();
}

document.getElementById('hasDeadline').addEventListener('change', function() {
    const deadlineContainer = document.getElementById('deadlineContainer');
    deadlineContainer.style.display = this.checked ? 'block' : 'none';
});


// ========================================================================
// =========>>>>> EVENT LISTENER prayerForm COM CORREÇÃO <<<<<=============
// ========================================================================
document.getElementById("prayerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    // console.log("[prayerForm] Submit event triggered.");

    const user = auth.currentUser;
    if (!user) {
        alert("Você precisa estar logado para adicionar alvos.");
        console.warn("[prayerForm] Attempted to add target while logged out.");
        return;
    }
    const uid = user.uid;

    const title = document.getElementById("title").value.trim();
    const details = document.getElementById("details").value.trim();
    const dateInput = document.getElementById("date").value; // Formato "YYYY-MM-DD"
    const hasDeadline = document.getElementById("hasDeadline").checked;

    if (!title) {
        alert("Por favor, insira um título para o alvo.");
        return;
    }
    // Validação básica da data de criação
    if (!dateInput || isNaN(new Date(dateInput.replace(/-/g, '/')).getTime())) {
        alert("Data de criação inválida.");
        return;
    }

    // *** CORREÇÃO: Criar Date como meia-noite LOCAL ***
    const [year, month, day] = dateInput.split('-').map(Number);
    // new Date(year, monthIndex, day) cria meia-noite LOCAL
    const dateLocal = new Date(year, month - 1, day); // month-1 porque os meses são 0-indexados
    const dateTimestamp = Timestamp.fromDate(dateLocal); // Timestamp para Firestore

    let deadlineDateLocal = null; // Objeto Date local
    let deadlineTimestamp = null; // Timestamp para Firestore
    if (hasDeadline) {
        const deadlineDateInput = document.getElementById("deadlineDate").value;
        if (!deadlineDateInput || isNaN(new Date(deadlineDateInput.replace(/-/g, '/')).getTime())) {
            alert("Data do prazo de validade inválida.");
            return;
        }
        // *** CORREÇÃO: Criar Date como meia-noite LOCAL ***
        const [dlYear, dlMonth, dlDay] = deadlineDateInput.split('-').map(Number);
        deadlineDateLocal = new Date(dlYear, dlMonth - 1, dlDay); // month-1
        deadlineTimestamp = Timestamp.fromDate(deadlineDateLocal); // Cria Timestamp do objeto Date local
    }

    // Objeto 'target' para Firestore
    const target = {
        title: title,
        details: details,
        date: dateTimestamp, // Salva o Timestamp equivalente à meia-noite local
        hasDeadline: hasDeadline,
        deadlineDate: deadlineTimestamp, // Salva o Timestamp ou null
        archived: false,
        resolved: false,
        resolutionDate: null,
        observations: [], // Start with empty array
        // userId: uid // Descomente se quiser adicionar userId
    };

     // console.log("[prayerForm] Creating new target object:", target);

    try {
        const docRef = await addDoc(collection(db, "users", uid, "prayerTargets"), target);
        // console.log("[prayerForm] Target added to Firestore with ID: ", docRef.id);

        // --- Update Local State ---
        // *** CORREÇÃO: Usar os objetos Date locais criados ***
        const newLocalTarget = {
            ...target, // Inclui title, details, hasDeadline, archived, resolved, resolutionDate
            id: docRef.id,
            date: dateLocal, // USA O OBJETO 'dateLocal'
            deadlineDate: deadlineDateLocal, // USA O OBJETO 'deadlineDateLocal' (ou null)
            observations: [] // Garante que observations seja um array vazio
        };
        prayerTargets.unshift(newLocalTarget); // Add to the beginning of the local array
        // Re-sort localmente
        prayerTargets.sort((a, b) => {
            const dateA = (a.date instanceof Date && !isNaN(a.date)) ? a.date : new Date(0);
            const dateB = (b.date instanceof Date && !isNaN(b.date)) ? b.date : new Date(0);
            return dateB - dateA; // Mais recentes primeiro
        });

        // console.log("[prayerForm] Target added to local state.");

        // --- UI Updates ---
        document.getElementById("prayerForm").reset();
         document.getElementById('deadlineContainer').style.display = 'none'; // Hide deadline field again
        // *** CORREÇÃO: Usar formatDateToISO para definir data padrão ***
        try {
             document.getElementById('date').value = formatDateToISO(new Date());
        } catch (e) {
            console.error("Error resetting date input:", e);
            document.getElementById('date').value = ''; // Fallback
        }

        // Navigate or Re-render
        document.getElementById('appContent').style.display = 'none'; // Hide form
        document.getElementById('mainPanel').style.display = 'block'; // Show list
        currentPage = 1; // Go to the first page to see the new target
        renderTargets(); // Re-render the main list

        alert('Alvo de oração adicionado com sucesso!');

    } catch (error) {
        console.error("[prayerForm] Error adding prayer target: ", error);
        alert("Erro ao adicionar alvo de oração. Verifique o console.");
    }
});
// ========================================================================
// ========================================================================

window.markAsResolved = async function(targetId) {
    const user = auth.currentUser;
    if (!user) {
        alert("Erro: Usuário não autenticado.");
        return;
    }
    const userId = user.uid;

    // console.log(`[markAsResolved] Attempting to mark target ${targetId} as resolved.`);

    const targetIndex = prayerTargets.findIndex(t => t.id === targetId);
    if (targetIndex === -1) {
        alert("Erro: Alvo não encontrado na lista ativa.");
        console.error(`[markAsResolved] Target ${targetId} not found in local prayerTargets array.`);
        return;
    }

    const targetData = prayerTargets[targetIndex];
    const resolutionDateTimestamp = Timestamp.fromDate(new Date()); // Use Timestamp for Firestore
    const resolutionDateLocal = resolutionDateTimestamp.toDate(); // Date object for local state

    // Firestore transaction: Delete from active, Add to archived
    const activeTargetRef = doc(db, "users", userId, "prayerTargets", targetId);
    const archivedTargetRef = doc(db, "users", userId, "archivedTargets", targetId);

    try {
        // Prepare data for archived collection (convert local Dates back to Timestamps)
        const archivedDataFirestore = {
            ...targetData,
             date: targetData.date instanceof Date ? Timestamp.fromDate(targetData.date) : targetData.date,
             deadlineDate: targetData.deadlineDate instanceof Date ? Timestamp.fromDate(targetData.deadlineDate) : targetData.deadlineDate,
             observations: Array.isArray(targetData.observations) ? targetData.observations.map(obs => ({
                 ...obs,
                 date: obs.date instanceof Date ? Timestamp.fromDate(obs.date) : obs.date
             })) : [],
            resolved: true,
            archived: true, // Mark as archived as well
            resolutionDate: resolutionDateTimestamp,
        };
        // Remove 'id' before saving to Firestore if it exists from local state merge
        delete archivedDataFirestore.id;


        // Use a batch write for atomicity
        const batch = writeBatch(db);
        batch.delete(activeTargetRef);
        batch.set(archivedTargetRef, archivedDataFirestore);
        await batch.commit();

        // console.log(`[markAsResolved] Target ${targetId} moved from active to archived (resolved) in Firestore.`);

        // --- Update Local State ---
        // 1. Remove from prayerTargets
        prayerTargets.splice(targetIndex, 1);

        // 2. Add to archivedTargets (using Date objects)
        const newArchivedLocal = {
            ...targetData, // Keep original local data (already has Dates)
            id: targetId,   // Ensure ID is present
            resolved: true,
            archived: true,
            resolutionDate: resolutionDateLocal, // Use local Date object
        };
        archivedTargets.unshift(newArchivedLocal); // Add to beginning
        // Sort archivedTargets by creation date desc
        archivedTargets.sort((a, b) => {
            const dateA = (a.date instanceof Date && !isNaN(a.date)) ? a.date : new Date(0);
            const dateB = (b.date instanceof Date && !isNaN(b.date)) ? b.date : new Date(0);
            return dateB - dateA;
        });

        // 3. Update resolvedTargets (filter from the updated archivedTargets)
        resolvedTargets = archivedTargets.filter(target => target.resolved);
        // Sort resolvedTargets by resolution date desc
        resolvedTargets.sort((a, b) => {
            const dateA = (a.resolutionDate instanceof Date && !isNaN(a.resolutionDate)) ? a.resolutionDate : new Date(0);
            const dateB = (b.resolutionDate instanceof Date && !isNaN(b.resolutionDate)) ? b.resolutionDate : new Date(0);
            return dateB - dateA;
        });

        // console.log("[markAsResolved] Local state updated.");

        // --- Re-render UI ---
        renderTargets();
        renderArchivedTargets();
        renderResolvedTargets();

        alert('Alvo marcado como respondido e movido para Arquivados.');

    } catch (error) {
        console.error("[markAsResolved] Error marking target as resolved: ", error);
        alert("Erro ao marcar como respondido. Verifique o console.");
        // Consider rolling back UI changes if optimistic updates were used
    }
}

window.archiveTarget = async function(targetId) {
     const user = auth.currentUser;
     if (!user) { alert("Erro: Usuário não autenticado."); return; }
     const userId = user.uid;

     // console.log(`[archiveTarget] Attempting to archive target ${targetId}.`);

    const targetIndex = prayerTargets.findIndex(t => t.id === targetId);
     if (targetIndex === -1) {
         alert("Erro: Alvo não encontrado na lista ativa.");
         console.error(`[archiveTarget] Target ${targetId} not found in local prayerTargets array.`);
         return;
     }

     const targetData = prayerTargets[targetIndex];

     // Firestore transaction: Delete from active, Add to archived
     const activeTargetRef = doc(db, "users", userId, "prayerTargets", targetId);
     const archivedTargetRef = doc(db, "users", userId, "archivedTargets", targetId);

     try {
         // Prepare data for archived collection (convert Dates to Timestamps)
         const archivedDataFirestore = {
             ...targetData,
             date: targetData.date instanceof Date ? Timestamp.fromDate(targetData.date) : targetData.date,
             deadlineDate: targetData.deadlineDate instanceof Date ? Timestamp.fromDate(targetData.deadlineDate) : targetData.deadlineDate,
             observations: Array.isArray(targetData.observations) ? targetData.observations.map(obs => ({
                 ...obs,
                 date: obs.date instanceof Date ? Timestamp.fromDate(obs.date) : obs.date
             })) : [],
             resolved: false, // Explicitly not resolved
             archived: true,
             resolutionDate: null // No resolution date
         };
         delete archivedDataFirestore.id; // Remove ID before saving

         // Use a batch write
         const batch = writeBatch(db);
         batch.delete(activeTargetRef);
         batch.set(archivedTargetRef, archivedDataFirestore);
         await batch.commit();

         // console.log(`[archiveTarget] Target ${targetId} moved from active to archived in Firestore.`);

         // --- Update Local State ---
         // 1. Remove from prayerTargets
         prayerTargets.splice(targetIndex, 1);

         // 2. Add to archivedTargets (using local Date objects)
          const newArchivedLocal = {
             ...targetData, // Keep local data with Date objects
             id: targetId,   // Ensure ID
             resolved: false,
             archived: true,
             resolutionDate: null,
         };
         archivedTargets.unshift(newArchivedLocal);
         // Sort archived by creation date
         archivedTargets.sort((a, b) => {
            const dateA = (a.date instanceof Date && !isNaN(a.date)) ? a.date : new Date(0);
            const dateB = (b.date instanceof Date && !isNaN(b.date)) ? b.date : new Date(0);
            return dateB - dateA;
         });

         // 3. Update resolvedTargets (it shouldn't contain this one)
         resolvedTargets = archivedTargets.filter(target => target.resolved).sort((a, b) => {
            const dateA = (a.resolutionDate instanceof Date && !isNaN(a.resolutionDate)) ? a.resolutionDate : new Date(0);
            const dateB = (b.resolutionDate instanceof Date && !isNaN(b.resolutionDate)) ? b.resolutionDate : new Date(0);
            return dateB - dateA;
         });


         // console.log("[archiveTarget] Local state updated.");

         // --- Re-render UI ---
         renderTargets();
         renderArchivedTargets();
         renderResolvedTargets(); // Re-render resolved as its source (archived) changed

         alert('Alvo arquivado com sucesso!');

     } catch (error) {
         console.error("[archiveTarget] Error archiving target: ", error);
         alert("Erro ao arquivar alvo. Verifique o console.");
     }
}

window.deleteArchivedTarget = async function(targetId) {
     const user = auth.currentUser;
     if (!user) { alert("Erro: Usuário não autenticado."); return; }
     const userId = user.uid;

     // console.log(`[deleteArchivedTarget] Attempting to delete archived target ${targetId}.`);

     // Find target title for confirmation message
     const targetToDelete = archivedTargets.find(t => t.id === targetId);
     const targetTitle = targetToDelete ? targetToDelete.title : targetId;

     // Confirm before deleting
     if (!confirm(`Tem certeza que deseja excluir permanentemente o alvo "${targetTitle}"? Esta ação não pode ser desfeita.`)) {
         // console.log("[deleteArchivedTarget] Deletion cancelled by user.");
         return;
     }

     const targetIndex = archivedTargets.findIndex(t => t.id === targetId);
     // Proceed even if not found locally, try deleting from Firestore

     const archivedTargetRef = doc(db, "users", userId, "archivedTargets", targetId);
     // Also consider deleting associated click counts
      const clickCountsRef = doc(db, "prayerClickCounts", targetId);

     try {
         // Use batch for multiple deletes
         const batch = writeBatch(db);
         batch.delete(archivedTargetRef);
         // Delete click counts document if it exists
         const clickSnap = await getDoc(clickCountsRef);
         if (clickSnap.exists()) {
            batch.delete(clickCountsRef);
            console.log(`[deleteArchivedTarget] Will delete associated click counts for ${targetId}.`);
         }

         await batch.commit();

         console.log(`[deleteArchivedTarget] Target ${targetId} (and possibly clicks) deleted from Firestore.`);

         // --- Update Local State ---
         if (targetIndex !== -1) {
             archivedTargets.splice(targetIndex, 1);
         }
          // Update resolvedTargets if it was resolved
         resolvedTargets = archivedTargets.filter(target => target.resolved).sort((a, b) => {
            const dateA = (a.resolutionDate instanceof Date && !isNaN(a.resolutionDate)) ? a.resolutionDate : new Date(0);
            const dateB = (b.resolutionDate instanceof Date && !isNaN(b.resolutionDate)) ? b.resolutionDate : new Date(0);
            return dateB - dateA;
         });

         // console.log("[deleteArchivedTarget] Local state updated.");

         // --- Re-render UI ---
         renderArchivedTargets();
         renderResolvedTargets(); // Re-render in case it was resolved

         alert('Alvo excluído permanentemente!');

     } catch (error) {
         console.error("[deleteArchivedTarget] Error deleting archived target: ", error);
         alert("Erro ao excluir alvo arquivado. Verifique o console.");
     }
}

document.addEventListener('DOMContentLoaded', () => {
    // console.log("[DOMContentLoaded] DOM fully loaded and parsed.");
    try {
        const todayISO = formatDateToISO(new Date());
        const dateInput = document.getElementById('date');
        if (dateInput) {
            dateInput.value = todayISO;
             // console.log("[DOMContentLoaded] Set default date input value to:", todayISO);
        } else {
             console.warn("[DOMContentLoaded] Date input element not found.");
         }
    } catch (e) {
        console.error("[DOMContentLoaded] Error setting default date:", e);
    }
});

// --- Navigation Button Event Listeners ---
document.getElementById('viewAllTargetsButton').addEventListener('click', () => {
    // console.log("[Navigation] View All Targets clicked.");
    showPanel('mainPanel');
    currentPage = 1; // Reset to first page
    renderTargets();
});

document.getElementById('addNewTargetButton').addEventListener('click', () => {
    // console.log("[Navigation] Add New Target clicked.");
    showPanel('appContent'); // Show the form section
    // Reset form and set default date when showing
    const form = document.getElementById('prayerForm');
    if (form) form.reset();
    const deadlineContainer = document.getElementById('deadlineContainer');
    if(deadlineContainer) deadlineContainer.style.display = 'none';
    try {
        const dateInput = document.getElementById('date');
        if(dateInput) dateInput.value = formatDateToISO(new Date());
    } catch(e) { console.error("Error setting date on Add New:", e); }
});

document.getElementById("viewArchivedButton").addEventListener("click", () => {
    // console.log("[Navigation] View Archived clicked.");
    showPanel('archivedPanel');
    currentArchivedPage = 1; // Reset to first page
    renderArchivedTargets();
});

document.getElementById("viewResolvedButton").addEventListener("click", () => {
    // console.log("[Navigation] View Resolved clicked.");
    showPanel('resolvedPanel');
    currentResolvedPage = 1; // Reset to first page
    renderResolvedTargets();
});

document.getElementById("backToMainButton").addEventListener("click", () => {
    // console.log("[Navigation] Back to Main (Daily View) clicked.");
     showPanel('dailySection'); // Show daily section as the 'main' view now
     // Optionally re-render daily targets if needed, but loadData usually handles it
     // loadDailyTargets();
});

// Helper function to manage panel visibility
function showPanel(panelIdToShow) {
    const panels = [
        'authSection', // Include auth section if it should be hidden after login
        'appContent', 'dailySection', 'mainPanel', 'archivedPanel', 'resolvedPanel',
        'weeklyPerseveranceChart', 'perseveranceSection'
    ];
    const separators = ['sectionSeparator']; // Add other separators if any
    const menu = document.getElementById('mainMenu'); // Main menu bar

    // console.log(`[showPanel] Showing panel: ${panelIdToShow}`);

    const user = auth.currentUser;

    panels.forEach(panelId => {
        const element = document.getElementById(panelId);
        if (element) {
             if (panelId === 'authSection') {
                 // Show auth section only if no user is logged in
                 element.style.display = user ? 'none' : 'flex'; // Use flex if needed, else block
             } else if (panelId === panelIdToShow) {
                 // Show the target panel if user is logged in
                 element.style.display = user ? 'block' : 'none';
                 // Special handling for daily view components
                 if (panelIdToShow === 'dailySection') {
                     const weekly = document.getElementById('weeklyPerseveranceChart');
                     const pers = document.getElementById('perseveranceSection');
                     const sep = document.getElementById('sectionSeparator');
                     if (weekly) weekly.style.display = user ? 'block' : 'none';
                     if (pers) pers.style.display = user ? 'block' : 'none';
                     if (sep) sep.style.display = user ? 'block' : 'none';
                 }
             } else {
                 // Hide other panels
                 element.style.display = 'none';
             }
        } else {
            // console.warn(`[showPanel] Element with ID ${panelId} not found.`);
        }
    });

     // Hide separators if not showing daily view
     if (panelIdToShow !== 'dailySection') {
         separators.forEach(sepId => {
             const element = document.getElementById(sepId);
             if (element) element.style.display = 'none';
         });
         // Also explicitly hide weekly/perseverance if not in daily view
         const weekly = document.getElementById('weeklyPerseveranceChart');
         const pers = document.getElementById('perseveranceSection');
         if(weekly) weekly.style.display = 'none';
         if(pers) pers.style.display = 'none';
     }

     // Show/Hide main menu based on login state
     if(menu) {
        menu.style.display = user ? 'block' : 'none';
     }
}


// --- Other Button Event Listeners ---

document.getElementById("copyDaily").addEventListener("click", function () {
    // console.log("[copyDaily] Copy button clicked.");
    const dailyTargetsDiv = document.getElementById('dailyTargets');
    let textToCopy = '';
    if (!dailyTargetsDiv) {
         console.error("[copyDaily] dailyTargets div not found.");
         alert('Erro ao encontrar alvos diários para copiar.');
         return;
     }

    // Select only targets that are NOT completed today
    const targetDivs = dailyTargetsDiv.querySelectorAll('.target:not(.completed-target)'); // Select only non-completed targets
    // console.log(`[copyDaily] Found ${targetDivs.length} pending targets to copy.`);

    targetDivs.forEach((div, index) => {
        const titleElement = div.querySelector('h3');
        // Get text content excluding the deadline tag if present
        const titleText = titleElement ? (titleElement.lastChild?.textContent ? titleElement.lastChild.textContent.trim() : titleElement.textContent.trim()) : 'Sem Título';


        // Assume details is the first <p> after h3. Might need adjustment if structure changes.
        let detailsText = 'Sem Detalhes';
        let pElement = titleElement?.nextElementSibling;
        while (pElement && pElement.tagName !== 'P') {
            pElement = pElement.nextElementSibling;
        }
        if (pElement) {
            detailsText = pElement.textContent.trim();
        }


        textToCopy += `${index + 1}. ${titleText}\n   ${detailsText}\n\n`;
    });

    if (textToCopy) {
        navigator.clipboard.writeText(textToCopy.trim()).then(() => {
            // console.log('[copyDaily] Text copied to clipboard.');
            alert('Alvos diários pendentes copiados para a área de transferência!');
        }).catch(err => {
            console.error('[copyDaily] Failed to copy text: ', err);
            alert('Falha ao copiar alvos diários.');
            // Fallback: Display text in a textarea for manual copying
             prompt("Não foi possível copiar automaticamente. Copie manualmente o texto abaixo:", textToCopy.trim());
        });
    } else {
        // console.log('[copyDaily] No pending daily targets to copy.');
        alert('Nenhum alvo diário pendente para copiar.');
    }
});


document.getElementById('generateViewButton').addEventListener('click', () => generateViewHTML()); // Call without args uses lastDisplayedTargets
document.getElementById('viewDaily').addEventListener('click', generateDailyViewHTML);

document.getElementById("viewResolvedViewButton").addEventListener("click", () => {
    // console.log("[viewResolvedViewButton] Clicked. Showing date range modal.");
    dateRangeModal.style.display = "block";
    // Reset dates?
     document.getElementById("startDate").value = '';
     document.getElementById("endDate").value = '';
});

const dateRangeModal = document.getElementById("dateRangeModal");
const closeDateRangeModalButton = document.getElementById("closeDateRangeModal");
const generateResolvedViewButton = document.getElementById("generateResolvedView");
const cancelDateRangeButton = document.getElementById("cancelDateRange");
const startDateInput = document.getElementById("startDate");
const endDateInput = document.getElementById("endDate");

if (closeDateRangeModalButton) {
    closeDateRangeModalButton.addEventListener("click", () => {
        // console.log("[DateRangeModal] Close button clicked.");
        dateRangeModal.style.display = "none";
    });
}
if (generateResolvedViewButton) {
    generateResolvedViewButton.addEventListener("click", () => {
        // console.log("[DateRangeModal] Generate button clicked.");
        const startDateStr = startDateInput.value;
        const endDateStr = endDateInput.value;

        if (startDateStr && endDateStr) {
            // *** CORREÇÃO: Criar Dates como meia-noite LOCAL ***
            const [startYear, startMonth, startDay] = startDateStr.split('-').map(Number);
            const start = new Date(startYear, startMonth - 1, startDay);

            const [endYear, endMonth, endDay] = endDateStr.split('-').map(Number);
            // Para incluir o dia final inteiro, criamos a data do dia seguinte e usamos <
            // Ou criamos a data final com hora 23:59:59. Vamos usar a segunda abordagem.
            const end = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999); // Fim do dia local

             if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                 alert("Datas inválidas selecionadas.");
                 return;
             }
             if (start > end) {
                 alert("A data de início não pode ser posterior à data de fim.");
                 return;
             }

            // console.log(`[DateRangeModal] Generating resolved view for ${startDateStr} to ${endDateStr}`);
            generateResolvedViewHTML(start, end); // Pass Date objects (local midnight start, local end of day end)
            dateRangeModal.style.display = "none";
        } else {
            alert("Por favor, selecione as datas de início e fim.");
        }
    });
}
if (cancelDateRangeButton) {
    cancelDateRangeButton.addEventListener("click", () => {
        // console.log("[DateRangeModal] Cancel button clicked.");
        dateRangeModal.style.display = "none";
    });
}

// Close modal if clicked outside
window.addEventListener('click', (event) => {
    if (event.target == dateRangeModal) {
        // console.log("[DateRangeModal] Clicked outside modal.");
        dateRangeModal.style.display = "none";
    }
});


document.getElementById("viewReportButton").addEventListener('click', () => {
    // console.log("[viewReportButton] Navigating to orei.html");
    window.location.href = 'orei.html';
});

function generateViewHTML(targetsToInclude = lastDisplayedTargets) { // Use last displayed by default
     // console.log(`[generateViewHTML] Generating view for ${targetsToInclude.length} targets.`);
    let viewHTML = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Visualização - Alvos de Oração</title>
            <link rel="stylesheet" href="styles.css"> <!-- Link to your styles -->
            <style>
                /* Add specific print/view styles here if needed */
                body { background-color: white; font-family: 'Times New Roman', serif; }
                .view-html-container { max-width: 800px; margin: 20px auto; padding: 10px; border: none; box-shadow: none; }
                 hr { border-top: 1px solid #ccc; margin: 15px 0; }
                 h1, h2, h3 { font-family: 'Playfair Display', serif; }
                 .target { border: none; padding: 0 0 15px 0; margin-bottom: 15px; border-bottom: 1px solid #eee; page-break-inside: avoid; } /* Evita quebra dentro do alvo */
                 .target:last-child { border-bottom: none; }
                 .deadline-tag { font-weight: normal; font-size: 0.9em; background-color: #ffcc00; color: #333; padding: 2px 6px; border-radius: 3px; margin-right: 5px;}
                 .deadline-tag.expired { background-color: #ff6666; color: #fff;}
                 .observations { margin-top: 5px; }
                 .observations p { margin-left: 15px; font-style: italic; margin: 2px 0; }
                 .observations-toggle { display: none; } /* Oculta toggle na visualização */
                 .target-actions { display: none; } /* Hide buttons in view */
                 @media print {
                     body { font-size: 10pt; } /* Tamanho menor para impressão */
                     .view-html-container { margin: 0; max-width: 100%; padding: 0; }
                     .target { border-bottom: 1px dotted #ccc; } /* Linha pontilhada na impressão */
                 }
            </style>
        </head>
        <body>
            <div class="view-html-container">
                <h1>Alvos de Oração</h1>
                <p>Gerado em: ${formatDateForDisplay(new Date())} ${new Date().toLocaleTimeString()}</p>
                <hr/>
    `;

    if (!Array.isArray(targetsToInclude) || targetsToInclude.length === 0) {
        viewHTML += "<p>Nenhum alvo para exibir.</p>";
    } else {
         // Ordena para a visualização (mais recentes primeiro, por exemplo)
         const sortedTargets = [...targetsToInclude].sort((a, b) => {
            const dateA = (a.date instanceof Date && !isNaN(a.date)) ? a.date : new Date(0);
            const dateB = (b.date instanceof Date && !isNaN(b.date)) ? b.date : new Date(0);
            return dateB - dateA;
         });

        sortedTargets.forEach(target => {
             if (!target || !target.id) return; // Skip invalid

             // Usa a função helper para gerar o HTML do alvo
             viewHTML += generateTargetViewHTML(target, false); // Passa false para não marcar como 'completed'
        });
    }

    viewHTML += `
            </div>
            <script>
                // Script mínimo para visualização (toggle não funcional aqui)
                 window.toggleObservations = function(targetId, event) {
                     if (event) event.preventDefault();
                     // console.log('Toggle requested for', targetId, 'in static view.');
                 };
            </script>
        </body>
        </html>
    `;

    const viewTab = window.open('', '_blank');
    if (viewTab) {
        viewTab.document.write(viewHTML);
        viewTab.document.close();
         // console.log('[generateViewHTML] View generated in new tab.');
    } else {
        console.error('[generateViewHTML] Popup blocked.');
        alert('Popup bloqueado! Por favor, permita popups para este site para visualizar o HTML gerado.');
    }
}


function generateDailyViewHTML() {
    // console.log("[generateDailyViewHTML] Generating daily view.");
    let viewHTML = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Visualização - Alvos Diários</title>
            <link rel="stylesheet" href="styles.css">
            <style>
                 body { background-color: white; font-family: 'Times New Roman', serif; }
                 .view-html-container { max-width: 800px; margin: 20px auto; padding: 10px; border: none; box-shadow: none;}
                 hr { border-top: 1px solid #ccc; margin: 15px 0; }
                 h1, h2, h3 { font-family: 'Playfair Display', serif; }
                 .target { border: none; padding: 0 0 15px 0; margin-bottom: 15px; border-bottom: 1px solid #eee; page-break-inside: avoid; }
                 .target:last-child { border-bottom: none; }
                 .daily-verse { text-align: center; font-style: italic; margin-bottom: 20px; color: #555; }
                 .completed-target { opacity: 0.7; border-left: 3px solid #ccc; padding-left: 10px; } /* Style completed differently */
                 .deadline-tag { font-weight: normal; font-size: 0.9em; background-color: #ffcc00; color: #333; padding: 2px 6px; border-radius: 3px; margin-right: 5px;}
                 .deadline-tag.expired { background-color: #ff6666; color: #fff;}
                 .observations { margin-top: 5px; }
                 .observations p { margin-left: 15px; font-style: italic; margin: 2px 0; }
                 .observations-toggle { display: none; } /* Oculta toggle */
                 .target-actions, .pray-button { display: none; } /* Hide buttons */
                  @media print {
                     body { font-size: 10pt; }
                     .view-html-container { margin: 0; max-width: 100%; padding: 0; }
                     .target { border-bottom: 1px dotted #ccc; }
                 }
            </style>
        </head>
        <body>
            <div class="view-html-container">
                <h1>Alvos de Oração do Dia</h1>
                 <p>Data: ${formatDateForDisplay(new Date())}</p>
                <div class="daily-verse">${document.getElementById('dailyVerses')?.textContent || ''}</div>
                <hr/>
                <h2>Pendentes</h2>
    `;

    const dailyTargetsDiv = document.getElementById('dailyTargets');
    let pendingCount = 0;
    let completedCount = 0;

    if (dailyTargetsDiv) {
        const pendingDivs = dailyTargetsDiv.querySelectorAll('.target:not(.completed-target)');
        pendingDivs.forEach(div => {
            const targetId = div.dataset.targetId;
            const targetData = prayerTargets.find(t => t.id === targetId); // Get full data
            if (targetData) {
                pendingCount++;
                viewHTML += generateTargetViewHTML(targetData); // Use helper
            }
        });

        if (pendingCount === 0) {
            viewHTML += "<p>Nenhum alvo pendente para hoje.</p>";
        }

        viewHTML += `<hr/><h2>Concluídos Hoje</h2>`;

        const completedDivs = dailyTargetsDiv.querySelectorAll('.target.completed-target');
        completedDivs.forEach(div => {
             const targetId = div.dataset.targetId;
             const targetData = prayerTargets.find(t => t.id === targetId); // Get full data
             if (targetData) {
                 completedCount++;
                 viewHTML += generateTargetViewHTML(targetData, true); // Use helper, mark as completed
             }
        });

         if (completedCount === 0) {
             viewHTML += "<p>Nenhum alvo concluído hoje.</p>";
         }

    } else {
        viewHTML += "<p>Erro: Não foi possível encontrar a seção de alvos diários.</p>";
    }

    viewHTML += `
            </div>
             <script>
                 window.toggleObservations = function(targetId, event) { if (event) event.preventDefault(); };
            </script>
        </body>
        </html>
    `;

    const viewTab = window.open('', '_blank');
    if (viewTab) {
        viewTab.document.write(viewHTML);
        viewTab.document.close();
        // console.log('[generateDailyViewHTML] Daily view generated.');
    } else {
        console.error('[generateDailyViewHTML] Popup blocked.');
        alert('Popup blocked! Por favor, permita popups para este site.');
    }
}

// Helper for generating single target HTML in views
function generateTargetViewHTML(target, isCompletedView = false) {
     if (!target || !target.id) return ''; // Skip invalid

     let formattedDate = 'Inválida';
     let elapsed = 'Inválido';
     let deadlineTag = '';
     try { formattedDate = formatDateForDisplay(target.date); } catch(e){}
     try { elapsed = timeElapsed(target.date); } catch(e){}
     try {
         if (target.hasDeadline && target.deadlineDate) { // Verifica se deadlineDate existe
             const formattedDeadline = formatDateForDisplay(target.deadlineDate);
             deadlineTag = `<span class="deadline-tag ${isDateExpired(target.deadlineDate) ? 'expired' : ''}">Prazo: ${formattedDeadline}</span>`;
         }
     } catch(e){}
     const observations = Array.isArray(target.observations) ? target.observations : [];

     return `
         <div class="target ${isCompletedView ? 'completed-target' : ''}">
             <h3>${deadlineTag} ${target.title || 'Sem Título'}</h3>
             <p>${target.details || 'Sem Detalhes'}</p>
             <p><strong>Data Criação:</strong> ${formattedDate}</p>
             <p><strong>Tempo Decorrido:</strong> ${elapsed}</p>
             ${renderObservations(observations, true, target.id)} <!-- Render all observations expanded -->
         </div>
     `; // Pass targetId
}


async function generateResolvedViewHTML(startDate, endDate) { // Expect Date objects (local midnight start, local end of day end)
    const user = auth.currentUser;
    if (!user) {
        alert("Você precisa estar logado para gerar esta visualização.");
        return;
    }
    const uid = user.uid;
    // console.log(`[generateResolvedViewHTML] Generating view for user ${uid} from ${startDate.toISOString()} to ${endDate.toISOString()}`);

    // Convert local start/end dates to Timestamps for Firestore query
    const startTimestamp = Timestamp.fromDate(startDate);
    const endTimestamp = Timestamp.fromDate(endDate);

    const archivedRef = collection(db, "users", uid, "archivedTargets");
    // Query for resolved targets within the date range based on resolutionDate
    const q = query(archivedRef,
                    where("resolved", "==", true),
                    where("resolutionDate", ">=", startTimestamp),
                    where("resolutionDate", "<=", endTimestamp), // <= works because endTimestamp includes 23:59:59.999
                    orderBy("resolutionDate", "desc") // Order by resolution date
                   );

    let filteredResolvedTargets = [];
    try {
        const querySnapshot = await getDocs(q);
        // console.log(`[generateResolvedViewHTML] Firestore query returned ${querySnapshot.size} resolved targets.`);
        querySnapshot.forEach((doc) => {
            // Rehydrate immediately after fetching for the view
             const rawData = { ...doc.data(), id: doc.id };
             const rehydrated = rehydrateTargets([rawData])[0]; // Rehydrate single item
             if (rehydrated) {
                filteredResolvedTargets.push(rehydrated);
             }
        });
    } catch (error) {
        console.error("[generateResolvedViewHTML] Error fetching resolved targets from Firestore:", error);
        alert("Erro ao buscar alvos respondidos. Verifique o console.");
        return;
    }

    // Sort again locally just in case Firestore ordering had issues (unlikely but safe)
     filteredResolvedTargets.sort((a, b) => {
         const dateA = (a.resolutionDate instanceof Date && !isNaN(a.resolutionDate)) ? a.resolutionDate : new Date(0);
         const dateB = (b.resolutionDate instanceof Date && !isNaN(b.resolutionDate)) ? b.resolutionDate : new Date(0);
         return dateB - dateA; // Most recent first
     });


    let viewHTML = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Visualização - Alvos Respondidos</title>
            <link rel="stylesheet" href="styles.css">
             <style>
                 body { background-color: white; font-family: 'Times New Roman', serif; }
                 .view-html-container { max-width: 800px; margin: 20px auto; padding: 10px; border: none; box-shadow: none; }
                 hr { border-top: 1px solid #ccc; margin: 15px 0; }
                 h1, h2, h3 { font-family: 'Playfair Display', serif; }
                 .target { border: none; padding: 0 0 15px 0; margin-bottom: 15px; border-bottom: 1px solid #eee; page-break-inside: avoid; }
                 .target:last-child { border-bottom: none; }
                 .observations { margin-top: 5px; }
                 .observations p { margin-left: 15px; font-style: italic; margin: 2px 0; }
                 .observations-toggle { display: none; } /* Oculta toggle */
                 @media print {
                     body { font-size: 10pt; }
                     .view-html-container { margin: 0; max-width: 100%; padding: 0; }
                     .target { border-bottom: 1px dotted #ccc; }
                 }
            </style>
        </head>
        <body>
            <div class="view-html-container">
                <h1>Alvos de Oração Respondidos</h1>
                <h2>Período: ${formatDateForDisplay(startDate)} - ${formatDateForDisplay(endDate)}</h2>
                 <p>Gerado em: ${formatDateForDisplay(new Date())} ${new Date().toLocaleTimeString()}</p>
                <hr/>
    `;

     if (filteredResolvedTargets.length === 0) {
         viewHTML += "<p>Nenhum alvo respondido encontrado neste período.</p>";
     } else {
        filteredResolvedTargets.forEach(target => {
             if (!target || !target.id) return;

             let formattedResolutionDate = 'Inválida';
             let totalTime = 'Inválido';
             try { formattedResolutionDate = formatDateForDisplay(target.resolutionDate); } catch (e) {}
              try {
                 const creationDate = (target.date instanceof Date && !isNaN(target.date)) ? target.date : null;
                 const resolutionDate = (target.resolutionDate instanceof Date && !isNaN(target.resolutionDate)) ? target.resolutionDate : null;
                 if (creationDate && resolutionDate) {
                    // Reutiliza a função timeElapsed para calcular a diferença
                    totalTime = timeElapsed({ // Simula a chamada passando a data de criação
                        getTime: () => creationDate.getTime(), // para timeElapsed
                        toDate: () => creationDate // para timeElapsed
                    }, resolutionDate); // Passa a data de resolução como 'agora' implícito
                    // Ajusta a função timeElapsed para aceitar um segundo argumento opcional 'now'
                    totalTime = adjustedTimeElapsed(creationDate, resolutionDate);

                 } else { totalTime = "Datas inválidas"; }
             } catch (e) { console.error("Error calculating total time:", e);}
             const observations = Array.isArray(target.observations) ? target.observations : [];

            viewHTML += `
                <div class="target resolved">
                    <h3>${target.title || 'Sem Título'} (Respondido)</h3>
                    <p>${target.details || 'Sem Detalhes'}</p>
                    <p><strong>Data Respondido:</strong> ${formattedResolutionDate}</p>
                    <p><strong>Tempo Total (Criação -> Resposta):</strong> ${totalTime}</p>
                    ${renderObservations(observations, true, target.id)} <!-- Render all observations -->
                </div>
            `; // Pass targetId
        });
    }

    viewHTML += `
            </div>
             <script>
                 window.toggleObservations = function(targetId, event) { if (event) event.preventDefault(); };
            </script>
        </body>
        </html>
    `;

    const viewTab = window.open('', '_blank');
    if (viewTab) {
        viewTab.document.write(viewHTML);
        viewTab.document.close();
         // console.log('[generateResolvedViewHTML] Resolved view generated.');
    } else {
        console.error('[generateResolvedViewHTML] Popup blocked.');
        alert('Popup blocked! Por favor, permita popups.');
    }
}
// Função ajustada para calcular tempo entre duas datas
function adjustedTimeElapsed(startDate, endDate) {
    if (!startDate || !endDate || isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return 'Datas Inválidas';
    }

    let diffInSeconds = Math.floor((endDate - startDate) / 1000);
    if (diffInSeconds < 0) diffInSeconds = 0;

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


function filterTargets(targets, searchTerm) {
    if (!searchTerm) return targets; // Return all if no search term
    const lowerSearchTerm = searchTerm.toLowerCase();
    return targets.filter(target => {
         // Ensure target and its properties exist before trying to access them
         const titleMatch = target.title && target.title.toLowerCase().includes(lowerSearchTerm);
         const detailsMatch = target.details && target.details.toLowerCase().includes(lowerSearchTerm);
         // Check observations too
          const observationMatch = target.observations && Array.isArray(target.observations) &&
              target.observations.some(obs => obs.text && obs.text.toLowerCase().includes(lowerSearchTerm));

        return titleMatch || detailsMatch || observationMatch;
    });
}

function handleSearchMain(event) {
    currentSearchTermMain = event.target.value;
    currentPage = 1; // Reset page when search changes
    // console.log(`[handleSearchMain] Search term: "${currentSearchTermMain}"`);
    renderTargets();
}

function handleSearchArchived(event) {
    currentSearchTermArchived = event.target.value;
    currentArchivedPage = 1; // Reset page
    // console.log(`[handleSearchArchived] Search term: "${currentSearchTermArchived}"`);
    renderArchivedTargets();
}
function handleSearchResolved(event) {
    currentSearchTermResolved = event.target.value;
    currentResolvedPage = 1; // Reset page
    // console.log(`[handleSearchResolved] Search term: "${currentSearchTermResolved}"`);
    renderResolvedTargets();
}

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
         // console.log("[displayRandomVerse] Displayed verse:", verses[randomIndex]);
    }
}

// Removed checkIfAllPrayersDone as logic moved to renderDailyTargets/loadDailyTargets
// function checkIfAllPrayersDone() { ... }

function displayCompletionPopup() {
    const popup = document.getElementById('completionPopup');
    if (popup) {
        // console.log("[displayCompletionPopup] Displaying completion popup.");
        popup.style.display = 'flex'; // Use flex to center content easily
        const popupVerseElement = popup.querySelector('#popupVerse');
        if (popupVerseElement) {
            const randomIndex = Math.floor(Math.random() * verses.length);
            popupVerseElement.textContent = verses[randomIndex];
        }
        // Automatically close after a few seconds?
         // setTimeout(() => {
         //     if (popup.style.display === 'flex') {
         //         popup.style.display = 'none';
         //         console.log("[displayCompletionPopup] Auto-closing popup.");
         //     }
         // }, 5000); // Close after 5 seconds
    }
}

// Ensure event listener is attached correctly
const closePopupButton = document.getElementById('closePopup');
if (closePopupButton) {
    closePopupButton.addEventListener('click', () => {
        const popup = document.getElementById('completionPopup');
        if (popup) {
            popup.style.display = 'none';
             // console.log("[closePopup] Popup closed by user.");
        }
    });
} else {
     console.warn("Close popup button ('closePopup') not found.");
}

// generateReport function seems unused based on UI buttons, can be removed or kept for future use
/*
async function generateReport() { ... }
function displayReportModal(reportText){ ... }
*/

// hideTargets seems unused, replaced by showPanel logic
// function hideTargets(){ ... }

function checkExpiredDeadlines() {
     // console.log("[checkExpiredDeadlines] Checking for expired deadlines...");
    let expiredCount = 0;
    prayerTargets.forEach(target => {
        if (target.hasDeadline && target.deadlineDate && isDateExpired(target.deadlineDate)) { // Verifica se deadlineDate existe
            expiredCount++;
            // The 'expired' class is added during rendering in renderTargets
            // console.log(`[checkExpiredDeadlines] Target ${target.id} deadline is expired.`);
        }
    });
     // console.log(`[checkExpiredDeadlines] Found ${expiredCount} expired deadlines.`);
     // No direct DOM manipulation needed here, renderTargets handles the visual indication.
}

async function loadPerseveranceData(userId) {
     // console.log(`[loadPerseveranceData] Loading for user ${userId}`);
    const perseveranceDocRef = doc(db, "perseveranceData", userId);
    try {
        const docSnap = await getDoc(perseveranceDocRef);

        if (docSnap.exists()) {
            perseveranceData = docSnap.data();
            // console.log("[loadPerseveranceData] Data found:", perseveranceData);
            // Convert lastInteractionDate back to Date object if it's a Timestamp
            if (perseveranceData.lastInteractionDate instanceof Timestamp) {
                perseveranceData.lastInteractionDate = perseveranceData.lastInteractionDate.toDate();
                 // console.log("[loadPerseveranceData] Converted lastInteractionDate to Date:", perseveranceData.lastInteractionDate);
            } else if (perseveranceData.lastInteractionDate && typeof perseveranceData.lastInteractionDate === 'string') {
                 // Handle case where it might have been stored as string incorrectly
                 perseveranceData.lastInteractionDate = new Date(perseveranceData.lastInteractionDate);
                 // console.log("[loadPerseveranceData] Parsed lastInteractionDate from string:", perseveranceData.lastInteractionDate);
             } else if (perseveranceData.lastInteractionDate && typeof perseveranceData.lastInteractionDate.toDate === 'function') { // Firebase < v9 might store differently
                 perseveranceData.lastInteractionDate = perseveranceData.lastInteractionDate.toDate();
             } else if (perseveranceData.lastInteractionDate && !isNaN(new Date(perseveranceData.lastInteractionDate).getTime())) { // Try parsing if it's a parsable string/number
                perseveranceData.lastInteractionDate = new Date(perseveranceData.lastInteractionDate);
             } else {
                 perseveranceData.lastInteractionDate = null; // Ensure it's null if invalid
             }


              // Ensure consecutiveDays and recordDays are numbers
             perseveranceData.consecutiveDays = Number(perseveranceData.consecutiveDays) || 0;
             perseveranceData.recordDays = Number(perseveranceData.recordDays) || 0;

        } else {
            // console.log("[loadPerseveranceData] No perseverance document found, initializing defaults.");
            // Initialize default data if document doesn't exist
            perseveranceData = { consecutiveDays: 0, lastInteractionDate: null, recordDays: 0 };
            // Optionally create the document now?
             // await setDoc(perseveranceDocRef, { ...perseveranceData, lastInteractionDate: null }); // Store null initially
        }
        updatePerseveranceUI();
    } catch (error) {
        console.error("[loadPerseveranceData] Error loading perseverance data:", error);
        // Reset to default on error?
         perseveranceData = { consecutiveDays: 0, lastInteractionDate: null, recordDays: 0 };
         updatePerseveranceUI(); // Update UI with defaults on error
    }
}

async function confirmPerseverance() {
    const user = auth.currentUser;
     if (!user) { alert("Erro: Usuário não autenticado."); return; }
     const userId = user.uid;

     // console.log("[confirmPerseverance] Button clicked.");

    const today = new Date();
    // Get date part only, ignoring time, in local timezone
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    let lastInteractionDatePart = null;
     // Ensure perseveranceData.lastInteractionDate is a valid Date object before comparing
     if (perseveranceData.lastInteractionDate instanceof Date && !isNaN(perseveranceData.lastInteractionDate)) {
         // Get date part only of the last interaction
         lastInteractionDatePart = new Date(
             perseveranceData.lastInteractionDate.getFullYear(),
             perseveranceData.lastInteractionDate.getMonth(),
             perseveranceData.lastInteractionDate.getDate()
         );
          // console.log("[confirmPerseverance] Last interaction date (Date part only):", lastInteractionDatePart);
     } else {
          // console.log("[confirmPerseverance] No valid last interaction date found.");
     }


    if (!lastInteractionDatePart || todayDate.getTime() > lastInteractionDatePart.getTime()) {
         // console.log("[confirmPerseverance] New interaction day detected.");
         let isConsecutive = false;
         if (lastInteractionDatePart) {
             // Check if today is exactly one day after the last interaction
             const expectedYesterday = new Date(todayDate.getTime() - 24 * 60 * 60 * 1000);
             if (lastInteractionDatePart.getTime() === expectedYesterday.getTime()) {
                 isConsecutive = true;
                 // console.log("[confirmPerseverance] Interaction is consecutive.");
             } else {
                  // console.log("[confirmPerseverance] Interaction is NOT consecutive (gap detected).");
             }
         } else {
              // console.log("[confirmPerseverance] First interaction recorded.");
         }

         if (isConsecutive) {
             perseveranceData.consecutiveDays += 1;
         } else {
             // Reset streak if not consecutive or first time
             perseveranceData.consecutiveDays = 1;
         }

         perseveranceData.lastInteractionDate = todayDate; // Update last interaction to today

         if (perseveranceData.consecutiveDays > perseveranceData.recordDays) {
             perseveranceData.recordDays = perseveranceData.consecutiveDays;
             // console.log("[confirmPerseverance] New record streak:", perseveranceData.recordDays);
         }

         // console.log("[confirmPerseverance] Updating data - Consecutive:", perseveranceData.consecutiveDays, "Last Interaction:", perseveranceData.lastInteractionDate);
         try {
            await updatePerseveranceFirestore(userId, perseveranceData);
            updatePerseveranceUI();
             alert(`Perseverança confirmada! Dias consecutivos: ${perseveranceData.consecutiveDays}`);
         } catch (error) {
              console.error("[confirmPerseverance] Error updating Firestore:", error);
              alert("Erro ao salvar dados de perseverança.");
              // Should we revert local data on error?
         }
    } else {
        // console.log("[confirmPerseverance] Perseverance already confirmed for today.");
        alert("Perseverança já confirmada para hoje!");
    }
}


async function updatePerseveranceFirestore(userId, data) {
    const perseveranceDocRef = doc(db, "perseveranceData", userId);
     // console.log("[updatePerseveranceFirestore] Saving to Firestore:", data);
     // Ensure lastInteractionDate is stored as Timestamp or null
     const dataToSave = {
         consecutiveDays: data.consecutiveDays || 0,
         lastInteractionDate: data.lastInteractionDate instanceof Date ? Timestamp.fromDate(data.lastInteractionDate) : null,
         recordDays: data.recordDays || 0
     };
    await setDoc(perseveranceDocRef, dataToSave, { merge: true }); // Use merge to avoid overwriting other fields if any
     // console.log("[updatePerseveranceFirestore] Save complete.");
}

function updatePerseveranceUI() {
     const consecutiveDays = perseveranceData.consecutiveDays || 0;
    const targetDays = 30; // Target for 100%
    const percentage = Math.min((consecutiveDays / targetDays) * 100, 100);
    const progressBar = document.getElementById('perseveranceProgressBar');
    const percentageDisplay = document.getElementById('perseverancePercentage');

    if (progressBar && percentageDisplay) {
        progressBar.style.width = `${percentage}%`;
        percentageDisplay.textContent = `${Math.round(percentage)}%`;
         // console.log(`[updatePerseveranceUI] Progress bar updated to ${percentage}% (${consecutiveDays} days).`);
    } else {
         console.warn("[updatePerseveranceUI] Progress bar or percentage display element not found.");
     }

    updateWeeklyChart(); // Update the weekly ticks as well
}

function resetPerseveranceUI() {
    const progressBar = document.getElementById('perseveranceProgressBar');
    const percentageDisplay = document.getElementById('perseverancePercentage');
    if (progressBar && percentageDisplay) {
        progressBar.style.width = `0%`;
        percentageDisplay.textContent = `0%`;
         // console.log("[resetPerseveranceUI] UI reset.");
    }
    resetWeeklyChart();
}

window.editDeadline = async function(targetId) {
    // console.log(`[editDeadline] Editing deadline for target ${targetId}`);
    const target = prayerTargets.find(t => t.id === targetId);
    if (!target) {
        console.error(`[editDeadline] Target ${targetId} not found.`);
        return;
    }

    const targetDiv = document.querySelector(`.target[data-target-id="${targetId}"]`);
    if (!targetDiv) {
        console.error(`[editDeadline] Target div for ${targetId} not found.`);
        return;
    }

    // Check if an edit form already exists and remove it (toggle behavior)
    const existingEditForm = targetDiv.querySelector('.edit-deadline-form');
    if (existingEditForm) {
        // console.log(`[editDeadline] Closing existing edit form for ${targetId}`);
        existingEditForm.remove();
        return; // Exit to just toggle off the form
    }

    // Format current deadline for input field (use ISO format 'YYYY-MM-DD')
    let currentDeadlineISO = '';
     if (target.deadlineDate instanceof Date && !isNaN(target.deadlineDate)) {
         try {
             currentDeadlineISO = formatDateToISO(target.deadlineDate);
         } catch (e) {
             console.error("Error formatting current deadline:", e);
         }
     }
     // console.log(`[editDeadline] Current deadline ISO for input: ${currentDeadlineISO}`);

    const formHTML = `
        <div class="edit-deadline-form" style="background-color: #f0f0f0; padding: 10px; margin-top: 10px; border-radius: 5px;">
            <label for="editDeadlineDate-${targetId}" style="margin-right: 5px;">Novo Prazo:</label>
            <input type="date" id="editDeadlineDate-${targetId}" value="${currentDeadlineISO}" style="margin-right: 5px;">
            <button class="btn save-deadline-btn" onclick="saveEditedDeadline('${targetId}')" style="background-color: #4CAF50;">Salvar</button>
            <button class="btn cancel-deadline-btn" onclick="cancelEditDeadline('${targetId}')" style="background-color: #f44336;">Cancelar</button>
        </div>
    `;

    // Insert the form after the target actions div
    const actionsDiv = targetDiv.querySelector('.target-actions');
    if (actionsDiv) {
         actionsDiv.insertAdjacentHTML('afterend', formHTML);
         // console.log(`[editDeadline] Edit form added for ${targetId}`);
         // Focus the date input
         document.getElementById(`editDeadlineDate-${targetId}`)?.focus();
    } else {
         console.error(`[editDeadline] Actions div not found for target ${targetId}, cannot insert form.`);
         // Fallback: append to targetDiv?
          targetDiv.insertAdjacentHTML('beforeend', formHTML);
     }
}


// ========================================================================
// =========>>>>> FUNÇÃO saveEditedDeadline COM CORREÇÃO <<<<<=============
// ========================================================================
window.saveEditedDeadline = async function(targetId) {
     // console.log(`[saveEditedDeadline] Saving deadline for target ${targetId}`);
    const newDeadlineDateInput = document.getElementById(`editDeadlineDate-${targetId}`);
    if (!newDeadlineDateInput) {
         console.error(`[saveEditedDeadline] Date input not found for ${targetId}`);
         return;
     }
     const newDeadlineValue = newDeadlineDateInput.value; // Formato "YYYY-MM-DD"

     let newDeadlineDateLocal = null; // Variável para o objeto Date local
     let newDeadlineTimestamp = null; // Variável para o Timestamp Firestore
     let newHasDeadline = false;

    if (!newDeadlineValue) {
        // Permitir limpar o prazo
        // console.log(`[saveEditedDeadline] No date selected, attempting to clear deadline for ${targetId}.`);
        if (!confirm("Nenhuma data selecionada. Deseja remover o prazo deste alvo?")) {
            // console.log(`[saveEditedDeadline] Deadline clear cancelled by user.`);
            cancelEditDeadline(targetId); // Remove o formulário
            return;
        }
        // newDeadlineDateLocal e newDeadlineTimestamp permanecem null, newHasDeadline é false

    } else {
         // Data selecionada, validar e criar
         if (isNaN(new Date(newDeadlineValue.replace(/-/g, '/')).getTime())) {
            alert("Por favor, selecione uma data válida.");
            return;
        }
        // *** CORREÇÃO: Criar Date como meia-noite LOCAL ***
        const [dlYear, dlMonth, dlDay] = newDeadlineValue.split('-').map(Number);
        newDeadlineDateLocal = new Date(dlYear, dlMonth - 1, dlDay); // month - 1
        newDeadlineTimestamp = Timestamp.fromDate(newDeadlineDateLocal); // Cria Timestamp
        newHasDeadline = true;
        // console.log(`[saveEditedDeadline] New deadline date: ${newDeadlineValue}, Local Date: ${newDeadlineDateLocal}, Timestamp:`, newDeadlineTimestamp);
    }

    // Passar o objeto Date LOCAL (ou null) para a função de atualização
    await updateDeadlineInFirestoreAndLocal(targetId, newDeadlineTimestamp, newHasDeadline, newDeadlineDateLocal);

    // Remover o formulário de edição
    cancelEditDeadline(targetId);
}
// ========================================================================
// ========================================================================


// ========================================================================
// =========>>>>> FUNÇÃO updateDeadline... COM CORREÇÃO <<<<<==============
// ========================================================================
// Helper to update Firestore and local state for deadline
async function updateDeadlineInFirestoreAndLocal(targetId, newDeadlineTimestamp, newHasDeadline, localDate = null) { // Adicionado localDate
     const user = auth.currentUser;
     if (!user) { console.error("User not logged in."); return; }
     const userId = user.uid;
     const targetRef = doc(db, "users", userId, "prayerTargets", targetId);

     try {
         await updateDoc(targetRef, {
             deadlineDate: newDeadlineTimestamp, // Salva Timestamp ou null
             hasDeadline: newHasDeadline
         });
         // console.log(`[updateDeadlineInFirestoreAndLocal] Firestore deadline updated for ${targetId}.`);

         // Update local prayerTargets array
         const targetIndex = prayerTargets.findIndex(target => target.id === targetId);
         if (targetIndex !== -1) {
             prayerTargets[targetIndex].deadlineDate = localDate; // *** USA O OBJETO Date local passado ***
             prayerTargets[targetIndex].hasDeadline = newHasDeadline;
             // console.log(`[updateDeadlineInFirestoreAndLocal] Local target ${targetId} deadline updated.`);
         } else {
              console.warn(`[updateDeadlineInFirestoreAndLocal] Target ${targetId} not found in local array after Firestore update.`);
         }

         renderTargets(); // Re-render targets to show updated deadline
         alert('Prazo atualizado com sucesso!');

     } catch (error) {
         console.error(`[updateDeadlineInFirestoreAndLocal] Error updating deadline for ${targetId}:`, error);
         alert("Erro ao atualizar prazo. Verifique o console.");
     }
}
// ========================================================================
// ========================================================================


window.cancelEditDeadline = function(targetId) {
     // console.log(`[cancelEditDeadline] Cancelling/removing edit form for ${targetId}`);
     const targetDiv = document.querySelector(`.target[data-target-id="${targetId}"]`);
        if (targetDiv) {
            const editForm = targetDiv.querySelector('.edit-deadline-form');
            if (editForm) {
                editForm.remove();
                 // console.log(`[cancelEditDeadline] Edit form removed for ${targetId}`);
            } else {
                 // console.log(`[cancelEditDeadline] No edit form found to remove for ${targetId}`);
             }
        } else {
             console.warn(`[cancelEditDeadline] Target div not found for ${targetId}`);
         }
}

// Função isValidDate removida pois a validação foi incorporada diretamente
// function isValidDate(dateString) { ... }

// convertToISO seems unused now, formatDateToISO is used instead.
// function convertToISO(dateString) { ... }

// Function to update the weekly chart
function updateWeeklyChart() {
    // console.log("[updateWeeklyChart] Updating chart...");
    const today = new Date();
    const lastInteraction = perseveranceData.lastInteractionDate;
    let lastInteractionDatePart = null;

     // Get the date part of the last interaction if it exists and is valid
     if (lastInteraction instanceof Date && !isNaN(lastInteraction)) {
         lastInteractionDatePart = new Date(lastInteraction.getFullYear(), lastInteraction.getMonth(), lastInteraction.getDate()).getTime();
         // console.log("[updateWeeklyChart] Last interaction date part (ms):", lastInteractionDatePart);
     } else {
          // console.log("[updateWeeklyChart] No valid last interaction date.");
     }


    for (let i = 0; i < 7; i++) {
        const day = new Date(today);
        day.setDate(today.getDate() - i); // Get date for each of the last 7 days
        const dayDatePart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();

        const dayOfWeek = day.getDay(); // 0 for Sunday, 1 for Monday, etc.
        const dayTickId = `day-${dayOfWeek}`;
        const dayTick = document.getElementById(dayTickId);

        if (dayTick) {
             // Check if the date part of this day matches the date part of the last interaction
            if (lastInteractionDatePart !== null && dayDatePart === lastInteractionDatePart) {
                dayTick.classList.add('active');
                 // console.log(`[updateWeeklyChart] Day ${dayOfWeek} (Date: ${day.toLocaleDateString()}) is ACTIVE.`);
            } else {
                dayTick.classList.remove('active');
                 // console.log(`[updateWeeklyChart] Day ${dayOfWeek} (Date: ${day.toLocaleDateString()}) is inactive.`);
            }
        } else {
             console.warn(`[updateWeeklyChart] Day tick element not found for ID: ${dayTickId}`);
         }
    }
}


function resetWeeklyChart() {
     // console.log("[resetWeeklyChart] Resetting chart ticks.");
    for (let i = 0; i < 7; i++) {
        const dayTickId = `day-${i}`;
        const dayTick = document.getElementById(dayTickId);
        if (dayTick) {
            dayTick.classList.remove('active');
        }
    }
}
