import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-analytics.js";
import { getAuth, signOut, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
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
const timezoneOffsetHours = 4;

// Utility functions (as before)
function formatDateToISO(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDateForDisplay(dateString) {
    if (dateString instanceof Date) {
        dateString = dateString;
    } else if (typeof dateString === 'string') {
         if (dateString.includes('Invalid Date') || dateString.includes('NaN')) {
            return 'Data Inválida';
        }
    } else if (!dateString) {
        return 'Data Inválida';
    }

    if (dateString instanceof Timestamp) {
        dateString = dateString.toDate();
    }
    if (!dateString || dateString.includes('NaN')) return 'Data Inválida';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Data Inválida';
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

function timeElapsed(date) {
    if (!date) return 'Data Inválida';
    const now = new Date();
    const pastDate = date instanceof Date ? date : new Date(date);
    let diffInSeconds = Math.floor((now - pastDate) / 1000);

    if (diffInSeconds < 60) return `${diffInSeconds} segundos`;
    let diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes} minutos`;
    let diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} horas`;
    let diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 30) return `${diffInDays} dias`;
    let diffInMonths = Math.floor(diffInDays / 30);
    if (diffInMonths < 12) return `${diffInMonths} meses`;
    let diffInYears = Math.floor(diffInMonths / 12);
    return `${diffInYears} anos`;
}

function isDateExpired(dateString) {
    if (!dateString) return false;
    const deadline = new Date(dateString);
    const now = new Date();
    // Set hours, minutes, seconds, and milliseconds to 0 for both dates for accurate day comparison
    deadline.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    return deadline < now;
}

function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

function rehydrateTargets(targets) {
    return targets.map(target => ({
        ...target,
        date: target.date ? target.date.toDate() : new Date(),
        deadlineDate: target.deadlineDate instanceof Timestamp ? target.deadlineDate.toDate() : (target.deadlineDate ? new Date(target.deadlineDate) : null),
        lastPresentedDate: target.lastPresentedDate instanceof Timestamp ? target.lastPresentedDate.toDate() : (target.lastPresentedDate ? new Date(target.lastPresentedDate) : null),
        observations: target.observations ? target.observations.map(obs => ({
            ...obs,
            date: obs.date instanceof Timestamp ? obs.date.toDate() : new Date(obs.date)
        })) : []
    }));
}

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
            collection(db, "users", userId, "prayerTargets"),
            where("archived", "!=", true)
        );
        const activeTargetsSnapshot = await getDocs(activeTargetsQuery);
        let availableTargets = [];
        activeTargetsSnapshot.forEach(doc => {
            availableTargets.push({ ...doc.data(), id: doc.id });
        });
        availableTargets = rehydrateTargets(availableTargets);

        if (availableTargets.length === 0) {
            console.log("generateDailyTargets: Nenhum alvo ativo encontrado.");
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
            completedYesterday = yesterdaySnap.exists()
                ? yesterdaySnap.data().targets.filter(t => t.completed).map(t => t.targetId)
                : [];
        } catch (error) {
            console.warn("generateDailyTargets: Erro ao buscar alvos do dia anterior (pode ser o primeiro dia):", error);
            // Não bloquear a geração de alvos se falhar ao buscar alvos do dia anterior
        }


        // Filtrar alvos disponíveis, excluindo os concluídos ontem
        const pool = availableTargets.filter(target => !completedYesterday.includes(target.id));

        if (pool.length === 0) {
            console.log("generateDailyTargets: Nenhum alvo disponível no pool após filtro de ontem.");
            return { userId, date: dateStr, targets: [] }; // Retorna lista vazia se não houver alvos no pool
        }

        // Seleção aleatória de até 10 alvos
        const shuffledPool = pool.sort(() => 0.5 - Math.random()); // Algoritmo de Fisher-Yates simplificado
        const selectedTargets = shuffledPool.slice(0, Math.min(10, shuffledPool.length));
        const targets = selectedTargets.map(target => ({ targetId: target.id, completed: false }));

        // Atualizar lastPresentedDate em batch
        const batch = writeBatch(db);
        selectedTargets.forEach(target => {
            const targetRef = doc(db, "users", userId, "prayerTargets", target.id);
            batch.update(targetRef, { lastPresentedDate: Timestamp.fromDate(new Date()) });
        });
        try {
            await batch.commit();
        } catch (error) {
            console.error("generateDailyTargets: Erro ao commitar batch de atualização lastPresentedDate:", error);
            // Decidir se deve retornar um erro ou prosseguir. Prosseguindo por agora, mas logando o erro.
        }

        console.log(`generateDailyTargets: Gerados ${targets.length} alvos diários para ${userId} em ${dateStr}.`);
        return { userId, date: dateStr, targets };
    } catch (error) {
        console.error("generateDailyTargets: Erro geral ao gerar alvos diários:", error);
        return { userId, date: dateStr, targets: [] };
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
            console.log(`loadDailyTargets: Documento diário para ${dailyDocId} não existe, gerando novos alvos.`);
            // Verificar se todos os alvos foram concluídos anteriormente
            const activeTargetsQuery = query(
                collection(db, "users", userId, "prayerTargets"),
                where("archived", "!=", true)
            );
            const activeTargetsSnapshot = await getDocs(activeTargetsQuery);
            const totalActive = activeTargetsSnapshot.size;


            let completedCount = 0;
            try {
                const allDailyDocs = await getDocs(collection(db, "dailyPrayerTargets"));
                completedCount = allDailyDocs.docs
                    .filter(doc => doc.id.startsWith(userId))
                    .reduce((sum, doc) => sum + doc.data().targets.filter(t => t.completed).length, 0);
            } catch (error) {
                console.warn("loadDailyTargets: Erro ao contar alvos concluídos anteriormente (pode ser o primeiro uso):", error);
                completedCount = 0; // Assume 0 se houver erro ao contar
            }


            if (completedCount >= totalActive && totalActive > 0) {
                console.log("loadDailyTargets: Reiniciando ciclo de alvos diários - todos os alvos foram apresentados.");
                dailyTargetsData = await generateDailyTargets(userId, todayStr);
            } else {
                dailyTargetsData = await generateDailyTargets(userId, todayStr);
            }

            try {
                await setDoc(dailyRef, dailyTargetsData);
                console.log(`loadDailyTargets: Documento diário ${dailyDocId} criado com sucesso.`);
            } catch (error) {
                console.error("loadDailyTargets: Erro ao salvar documento diário no Firestore:", error);
                document.getElementById("dailyTargets").innerHTML = "<p>Erro ao salvar alvos diários. Verifique o console.</p>";
                return; // Importante retornar para evitar continuar com dados possivelmente inválidos
            }

        } else {
            dailyTargetsData = dailySnapshot.data();
        }

        if (!dailyTargetsData || !dailyTargetsData.targets) {
            console.error("loadDailyTargets: Dados de alvos diários inválidos ou ausentes.");
            document.getElementById("dailyTargets").innerHTML = "<p>Erro ao carregar alvos diários. Dados inválidos.</p>";
            return; // Retorna se os dados forem inválidos
        }


        const pendingTargets = dailyTargetsData.targets.filter(t => !t.completed);
        const completedTargets = dailyTargetsData.targets.filter(t => t.completed);

        renderDailyTargets(pendingTargets, completedTargets);
        displayRandomVerse();

    } catch (error) {
        console.error("loadDailyTargets: Erro geral ao carregar alvos diários:", error);
        document.getElementById("dailyTargets").innerHTML = "<p>Erro ao carregar alvos diários. Verifique o console.</p>";
    }
}


// ==== MODIFIED FUNCTION: addPrayButtonFunctionality ====
function addPrayButtonFunctionality(dailyDiv, targetIndex) {
    const prayButton = document.createElement("button");
    prayButton.textContent = "Orei!";
    prayButton.classList.add("pray-button");
    prayButton.onclick = async () => {
        const targetId = dailyDiv.dataset.targetId;
        const userId = auth.currentUser.uid;
        const todayStr = formatDateToISO(new Date());
        const dailyDocId = `${userId}_${todayStr}`;
        const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);

        try {
            const dailySnap = await getDoc(dailyRef);
            if (!dailySnap.exists()) throw new Error("Documento diário não encontrado.");

            const dailyData = dailySnap.data();
            const updatedTargets = dailyData.targets.map(t =>
                t.targetId === targetId ? { ...t, completed: true } : t
            );

            await updateDoc(dailyRef, { targets: updatedTargets });
            loadDailyTargets(); // Re-renderiza os alvos

            // Atualizar contagem de cliques (mantido como está)
            const clickCountsRef = doc(db, "prayerClickCounts", targetId);
            const now = new Date();
            const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const year = now.getFullYear().toString();

            const docSnap = await getDoc(clickCountsRef);
            if (docSnap.exists()) {
                await updateDoc(clickCountsRef, {
                    totalClicks: increment(1),
                    [`monthlyClicks.${yearMonth}`]: increment(1),
                    [`yearlyClicks.${year}`]: increment(1)
                });
            } else {
                await setDoc(clickCountsRef, {
                    targetId,
                    userId,
                    totalClicks: 1,
                    monthlyClicks: { [yearMonth]: 1 },
                    yearlyClicks: { [year]: 1 }
                });
            }
        } catch (error) {
            console.error("Erro ao registrar 'Orei!':", error);
            alert("Erro ao registrar oração.");
        }
    };
    dailyDiv.insertBefore(prayButton, dailyDiv.firstChild);
}

// Initial load and authentication (as before, but loadDailyTargets instead of refreshDailyTargets)
async function loadData(user) {
    updateAuthUI(user);
    if (user) {
        document.getElementById('appContent').style.display = 'none';
        document.getElementById('dailySection').style.display = 'block';
        document.getElementById('sectionSeparator').style.display = 'block';
        document.getElementById('mainPanel').style.display = 'none';
        document.getElementById('weeklyPerseveranceChart').style.display = 'block';
        document.getElementById('perseveranceSection').style.display = 'block';

        await fetchPrayerTargets(user.uid);
        await fetchArchivedTargets(user.uid);
        resolvedTargets = archivedTargets.filter(target => target.resolved);
        checkExpiredDeadlines();
        renderTargets();
        renderArchivedTargets();
        renderResolvedTargets();
        await loadDailyTargets(); // Load daily targets using new logic
        await loadPerseveranceData(user.uid);
    } else {
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
        await loadDailyTargets(); // Still load daily targets (will show login message)
        resetPerseveranceUI();
    }
}

async function fetchPrayerTargets(uid) {
    prayerTargets = [];
    const targetsRef = collection(db, "users", uid, "prayerTargets");
    const targetsSnapshot = await getDocs(query(targetsRef, orderBy("date", "desc"))); // Ordenar por data
    targetsSnapshot.forEach((doc) => {
        const targetData = {...doc.data(), id: doc.id};
        console.log("Data fetched from Firestore for target ID:", doc.id, "Date (Timestamp):", targetData.date); //Log Timestamp from Firestore
        if (targetData.date && !(targetData.date instanceof Timestamp)) {
            console.warn(`Target ${doc.id} date is not a Timestamp, attempting to parse.`);
            targetData.date = Timestamp.fromDate(new Date(targetData.date));
        }
        prayerTargets.push(targetData);
    });
    prayerTargets = rehydrateTargets(prayerTargets);
    console.log("Rehydrated Prayer Targets:", prayerTargets); // Log after rehydration
}
async function fetchArchivedTargets(uid) {
    archivedTargets = [];
    const archivedRef = collection(db, "users", uid, "archivedTargets");
    const archivedSnapshot = await getDocs(query(archivedRef, orderBy("date", "desc")));
    archivedSnapshot.forEach((doc) => {
        archivedTargets.push({...doc.data(), id: doc.id});
        let archivedData = doc.data();
        if (archivedData.date && !(archivedData.date instanceof Timestamp)) {
            console.warn(`Archived Target ${doc.id} date is not a Timestamp, attempting to parse.`);
            archivedData.date = Timestamp.fromDate(new Date(archivedData.date));
        }
    });
    archivedTargets = rehydrateTargets(archivedTargets);
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
        signOut(auth);
    });
    document.getElementById("refreshDaily").addEventListener("click", async () => {
        if (confirm("Tem certeza que deseja atualizar os alvos do dia? Isso irá redefinir o progresso atual dos alvos diários.")) {
            const userId = auth.currentUser.uid;
            const todayStr = formatDateToISO(new Date());
            const dailyDocId = `${userId}_${todayStr}`;
            const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);

            try {
                const newTargets = await generateDailyTargets(userId, todayStr);
                await setDoc(dailyRef, newTargets, { merge: true });
                loadDailyTargets();
                alert("Alvos do dia atualizados!");
            } catch (error) {
                console.error("Erro ao atualizar alvos diários:", error);
                alert("Erro ao atualizar alvos diários. Verifique o console.");
            }
        }
     });
};


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

    // Sort by deadline if deadline filter is active
    if (showDeadlineOnly || (showExpiredOnlyMainCheckbox && showExpiredOnlyMainCheckbox.checked)) {
        filteredAndPagedTargets.sort((a, b) => {
            const dateA = a.deadlineDate ? new Date(a.deadlineDate) : null;
            const dateB = b.deadlineDate ? new Date(b.deadlineDate) : null;

            if (dateA && dateB) {
                return dateA - dateB; // Sort by deadline if both have deadlines
            }
            if (dateA) return -1; // a has deadline, b doesn't, a comes first
            if (dateB) return 1;  // b has deadline, a doesn't, b comes first
            return 0;             // Neither has deadline, keep original order
        });
    } else {
        // Default sort by date, newest first
        filteredAndPagedTargets.sort((a, b) => new Date(b.date) - new Date(a.date));
    }


    const startIndex = (currentPage - 1) * targetsPerPage;
    const endIndex = startIndex + targetsPerPage;
    const targetsToDisplay = filteredAndPagedTargets.slice(startIndex, endIndex);
    lastDisplayedTargets = targetsToDisplay;

    if (targetsToDisplay.length === 0 && currentPage > 1) {
        currentPage = 1;
        renderTargets(); // Re-render on the first page
        return;
    }

    targetsToDisplay.forEach((target) => {
        const targetDiv = document.createElement("div");
        targetDiv.classList.add("target");
        targetDiv.dataset.targetId = target.id;

        const deadlineTag = target.hasDeadline
            ? `<span class="deadline-tag ${isDateExpired(target.deadlineDate) ? 'expired' : ''}">Prazo: ${formatDateForDisplay(target.deadlineDate)}</span>`
            : '';

        targetDiv.innerHTML = `
            <h3>${deadlineTag} ${target.title}</h3>
            <p>${target.details}</p>
            <p><strong>Data:</strong> ${formatDateForDisplay(target.date)}</p>
            <p><strong>Tempo Decorrido:</strong> ${timeElapsed(target.date)}</p>
            ${renderObservations(target.observations, false)}
            <div class="target-actions">
                <button class="resolved btn" onclick="markAsResolved('${target.id}')">Respondido</button>
                <button class="archive btn" onclick="archiveTarget('${target.id}')">Arquivar</button>
                <button class="add-observation btn" onclick="toggleAddObservation('${target.id}')">Observação</button>
                ${target.hasDeadline ? `<button class="edit-deadline btn" onclick="editDeadline('${target.id}')">Editar Prazo</button>` : ''}
            </div>
            <div id="observationForm-${target.id}" class="add-observation-form" style="display:none;"></div>
            <div id="observations-${target.id}" class="observations-list" style="display:none;"></div>
        `;
        targetListDiv.appendChild(targetDiv);
        renderObservationForm(target.id);
        renderExistingObservations(target.id);
    });

    renderPagination('mainPanel', currentPage, filteredAndPagedTargets);
}

function renderArchivedTargets() {
    const archivedListDiv = document.getElementById('archivedList');
    archivedListDiv.innerHTML = '';
    let filteredAndPagedArchivedTargets = [...archivedTargets];

    if (currentSearchTermArchived) {
        filteredAndPagedArchivedTargets = filterTargets(filteredAndPagedArchivedTargets, currentSearchTermArchived);
    }
    filteredAndPagedArchivedTargets.sort((a, b) => new Date(b.date) - new Date(a.date));

    const startIndex = (currentArchivedPage - 1) * targetsPerPage;
    const endIndex = startIndex + targetsPerPage;
    const targetsToDisplay = filteredAndPagedArchivedTargets.slice(startIndex, endIndex);

    if (targetsToDisplay.length === 0 && currentArchivedPage > 1) {
        currentArchivedPage = 1;
        renderArchivedTargets();
        return;
    }

    targetsToDisplay.forEach((target) => {
        const archivedDiv = document.createElement("div");
        archivedDiv.classList.add("target", "archived");
        archivedDiv.dataset.targetId = target.id;
        archivedDiv.innerHTML = `
            <h3>${target.title}</h3>
            <p>${target.details}</p>
            <p><strong>Data:</strong> ${formatDateForDisplay(target.date)}</p>
            <p><strong>Tempo Decorrido:</strong> ${timeElapsed(target.date)}</p>
            ${renderObservations(target.observations, false)}
            <div class="target-actions">
                <button class="delete btn" onclick="deleteArchivedTarget('${target.id}')">Excluir</button>
            </div>
        `;
        archivedListDiv.appendChild(archivedDiv);
    });
    renderPagination('archivedPanel', currentArchivedPage, filteredAndPagedArchivedTargets);
}

function renderResolvedTargets() {
    const resolvedListDiv = document.getElementById('resolvedList');
    resolvedListDiv.innerHTML = '';
    let filteredAndPagedResolvedTargets = [...resolvedTargets];

    if (currentSearchTermResolved) {
        filteredAndPagedResolvedTargets = filterTargets(filteredAndPagedResolvedTargets, currentSearchTermResolved);
    }
     filteredAndPagedResolvedTargets.sort((a, b) => new Date(b.date) - new Date(a.date));

    const startIndex = (currentResolvedPage - 1) * targetsPerPage;
    const endIndex = startIndex + targetsPerPage;
    const targetsToDisplay = filteredAndPagedResolvedTargets.slice(startIndex, endIndex);

     if (targetsToDisplay.length === 0 && currentResolvedPage > 1) {
        currentResolvedPage = 1;
        renderResolvedTargets();
        return;
    }

    targetsToDisplay.forEach((target) => {
        const resolvedDiv = document.createElement("div");
        resolvedDiv.classList.add("target", "resolved");
        resolvedDiv.dataset.targetId = target.id;
        resolvedDiv.innerHTML = `
            <h3>${target.title} (Respondido)</h3>
            <p>${target.details}</p>
            <p><strong>Data Respondido:</strong> ${formatDateForDisplay(target.resolutionDate)}</p>
            <p><strong>Tempo Total:</strong> ${timeElapsed(target.date)}</p>
            ${renderObservations(target.observations, false)}
        `;
        resolvedListDiv.appendChild(resolvedDiv);
    });
    renderPagination('resolvedPanel', currentResolvedPage, filteredAndPagedResolvedTargets);
}

function renderPagination(panelId, page, targets) {
    const paginationDiv = document.getElementById(`pagination-${panelId}`);
    if (!paginationDiv) return; // Exit if the pagination div is not found

    paginationDiv.innerHTML = '';
    const totalPages = Math.ceil(targets.length / targetsPerPage);
    if (totalPages <= 1) {
        paginationDiv.style.display = 'none'; // Hide pagination if only one page
        return;
    } else {
        paginationDiv.style.display = 'flex'; // Show pagination if more than one page
    }

    for (let i = 1; i <= totalPages; i++) {
        const pageLink = document.createElement('a');
        pageLink.href = '#';
        pageLink.textContent = i;
        pageLink.classList.add('page-link');
        if (i === page) {
            pageLink.classList.add('active');
        }
        pageLink.addEventListener('click', (event) => {
            event.preventDefault();
            if (panelId === 'mainPanel') {
                currentPage = i;
                renderTargets();
            } else if (panelId === 'archivedPanel') {
                currentArchivedPage = i;
                renderArchivedTargets();
            } else if (panelId === 'resolvedPanel') {
                currentResolvedPage = i;
                renderResolvedTargets();
            }
        });
        paginationDiv.appendChild(pageLink);
    }
}

function renderObservations(observations, isExpanded = false) {
    if (!observations || observations.length === 0) return '';
    const displayCount = isExpanded ? observations.length : 2;
    const visibleObservations = observations.slice(0, displayCount);
    const remainingCount = observations.length - displayCount;

    let observationsHTML = `<div class="observations">`;
    visibleObservations.forEach(observation => {
        observationsHTML += `<p class="observation-item"><strong>${formatDateForDisplay(observation.date)}:</strong> ${observation.text}</p>`;
    });

    if (!isExpanded && remainingCount > 0) {
        observationsHTML += `<a href="#" class="observations-toggle" onclick="toggleObservations('${observations[0].targetId}'); return false;">Ver mais ${remainingCount} observações</a>`;
    } else if (isExpanded && observations.length > displayCount) {
        observationsHTML += `<a href="#" class="observations-toggle" onclick="toggleObservations('${observations[0].targetId}'); return false;">Ver menos observações</a>`;
    }
    observationsHTML += `</div>`;
    return observationsHTML;
}

window.toggleObservations = function(targetId) {
    const observationsDiv = document.getElementById(`observations-${targetId}`);
    const targetDiv = document.querySelector(`.target[data-target-id="${targetId}"]`);
    if (!observationsDiv || !targetDiv) return;

    const isExpanded = observationsDiv.style.display === 'block';
    observationsDiv.style.display = isExpanded ? 'none' : 'block';
    const target = prayerTargets.find(t => t.id === targetId) || archivedTargets.find(t => t.id === targetId) || resolvedTargets.find(t => t.id === targetId);

    if (target) {
        targetDiv.innerHTML = `
            <h3>${target.title}</h3>
            <p>${target.details}</p>
            <p><strong>Data:</strong> ${formatDateForDisplay(target.date)}</p>
            <p><strong>Tempo Decorrido:</strong> ${timeElapsed(target.date)}</p>
            ${renderObservations(target.observations, !isExpanded)}
            <div class="target-actions">
                <button class="resolved btn" onclick="markAsResolved('${target.id}')">Respondido</button>
                <button class="archive btn" onclick="archiveTarget('${target.id}')">Arquivar</button>
                <button class="add-observation btn" onclick="toggleAddObservation('${target.id}')">Observação</button>
                 ${target.hasDeadline ? `<button class="edit-deadline btn" onclick="editDeadline('${target.id}')">Editar Prazo</button>` : ''}
            </div>
            <div id="observationForm-${target.id}" class="add-observation-form" style="display:none;"></div>
            <div id="observations-${target.id}" class="observations-list" style="display:block;"></div>
        `;
        renderObservationForm(targetId);
        renderExistingObservations(targetId, !isExpanded);
    }
};

function toggleAddObservation(targetId) {
    const formDiv = document.getElementById(`observationForm-${targetId}`);
    formDiv.style.display = formDiv.style.display === 'none' ? 'block' : 'none';
}

function renderObservationForm(targetId) {
    const formDiv = document.getElementById(`observationForm-${targetId}`);
    if (!formDiv) return;
    formDiv.innerHTML = `
        <textarea id="observationText-${targetId}" placeholder="Nova observação"></textarea>
        <input type="date" id="observationDate-${targetId}">
        <button class="btn" onclick="saveObservation('${targetId}')">Salvar Observação</button>
    `;
    const todayISO = formatDateToISO(new Date());
    document.getElementById(`observationDate-${targetId}`).value = todayISO;
}

async function saveObservation(targetId) {
    const observationText = document.getElementById(`observationText-${targetId}`).value;
    const observationDate = document.getElementById(`observationDate-${targetId}`).value;
    if (!observationText) {
        alert('Por favor, insira uma observação.');
        return;
    }

    const userId = auth.currentUser.uid;
    const targetRef = doc(db, "users", userId, "prayerTargets", targetId);
    const observation = {
        text: observationText,
        date: Timestamp.fromDate(new Date(observationDate)),
        id: generateUniqueId(),
        targetId: targetId
    };

    try {
        await updateDoc(targetRef, {
            observations: increment([{...observation}])
        });
        // Update local prayerTargets array
        const targetIndex = prayerTargets.findIndex(target => target.id === targetId);
        if (targetIndex !== -1) {
            prayerTargets[targetIndex].observations = [...(prayerTargets[targetIndex].observations || []), observation];
        }
        renderTargets();
        renderExistingObservations(targetId);
        toggleAddObservation(targetId); // Hide the form after saving
    } catch (error) {
        console.error("Erro ao salvar observação:", error);
        alert("Erro ao salvar observação. Verifique o console.");
    }
}

function renderExistingObservations(targetId, isExpanded = false) {
    const observationsListDiv = document.getElementById(`observations-${targetId}`);
     if (!observationsListDiv) return;
    observationsListDiv.innerHTML = '';
    const target = prayerTargets.find(t => t.id === targetId) || archivedTargets.find(t => t.id === targetId) || resolvedTargets.find(t => t.id === targetId);
    if (!target || !target.observations) return;

    const displayCount = isExpanded ? target.observations.length : 2;
    const visibleObservations = target.observations.slice(-displayCount); // Show last 'displayCount' observations
    const remainingCount = target.observations.length - displayCount;


    if (visibleObservations.length > 0) {
         visibleObservations.forEach(observation => {
            const obsDiv = document.createElement('div');
            obsDiv.classList.add('observation-item');
            obsDiv.innerHTML = `<p><strong>${formatDateForDisplay(observation.date)}:</strong> ${observation.text}</p>`;
            observationsListDiv.appendChild(obsDiv);
        });
         if (!isExpanded && remainingCount > 0) {
            const toggleLink = document.createElement('a');
            toggleLink.href = '#';
            toggleLink.classList.add('observations-toggle');
            toggleLink.textContent = `Ver mais ${remainingCount} observações`;
            toggleLink.onclick = function() {
                toggleObservations(targetId);
                return false;
            };
            observationsListDiv.appendChild(toggleLink);
        } else if (isExpanded && target.observations.length > displayCount) {
             const toggleLink = document.createElement('a');
            toggleLink.href = '#';
            toggleLink.classList.add('observations-toggle');
            toggleLink.textContent = `Ver menos observações`;
            toggleLink.onclick = function() {
                toggleObservations(targetId);
                return false;
            };
            observationsListDiv.appendChild(toggleLink);
        }
        observationsListDiv.style.display = 'block';
    } else {
        observationsListDiv.style.display = 'none';
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

document.getElementById('hasDeadline').addEventListener('change', function() {
    const deadlineContainer = document.getElementById('deadlineContainer');
    deadlineContainer.style.display = this.checked ? 'block' : 'none';
});

document.getElementById("prayerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = document.getElementById("title").value;
    const details = document.getElementById("details").value;
    const dateInput = document.getElementById("date").value;
    const hasDeadline = document.getElementById("hasDeadline").checked;
    const deadlineDateInput = document.getElementById("deadlineDate").value;

    let deadlineDate = null;
    if (hasDeadline && deadlineDateInput) {
        deadlineDate = deadlineDateInput;
    }

    const date = new Date(dateInput);
    if (isNaN(date)) {
        alert("Data inválida. Por favor, selecione uma data válida.");
        return;
    }

    const uid = auth.currentUser.uid;
    const target = {
        title: title,
        details: details,
        date: Timestamp.fromDate(date),
        hasDeadline: hasDeadline,
        deadlineDate: deadlineDate ? Timestamp.fromDate(new Date(deadlineDate)) : null,
        archived: false,
        resolved: false,
        resolutionDate: null,
        observations: []
    };

    try {
        const docRef = await addDoc(collection(db, "users", uid, "prayerTargets"), target);
        console.log("Alvo de oração adicionado com ID: ", docRef.id);
        document.getElementById("prayerForm").reset();
        document.getElementById('appContent').style.display = 'none';
        document.getElementById('mainPanel').style.display = 'block';
        await fetchPrayerTargets(uid);
        renderTargets();
        alert('Alvo de oração adicionado com sucesso!');
    } catch (error) {
        console.error("Erro ao adicionar alvo de oração: ", error);
        alert("Erro ao adicionar alvo de oração. Verifique o console.");
    }
});

async function markAsResolved(targetId) {
    const userId = auth.currentUser.uid;
    const targetRef = doc(db, "users", userId, "prayerTargets", targetId);
    const resolutionDate = Timestamp.fromDate(new Date());

    try {
        const docSnapshot = await getDoc(targetRef);
        if (docSnapshot.exists()) {
            const targetData = docSnapshot.data();
            await deleteDoc(doc(db, "users", userId, "prayerTargets", targetId));
             await setDoc(doc(db, "users", userId, "archivedTargets", targetId), {
                ...targetData,
                resolved: true,
                archived: true,
                resolutionDate: resolutionDate,
            });
            await fetchPrayerTargets(userId);
            await fetchArchivedTargets(userId);
            resolvedTargets = archivedTargets.filter(target => target.resolved);
            renderTargets();
            renderArchivedTargets();
            renderResolvedTargets();
            alert('Alvo marcado como respondido e movido para Arquivados.');
        } else {
            console.error("Alvo não encontrado para marcar como resolvido.");
            alert("Alvo não encontrado.");
        }

    } catch (error) {
        console.error("Erro ao marcar como resolvido: ", error);
        alert("Erro ao marcar como resolvido. Verifique o console.");
    }
}

async function archiveTarget(targetId) {
    const userId = auth.currentUser.uid;
    const targetRef = doc(db, "users", userId, "prayerTargets", targetId);

    try {
        const docSnapshot = await getDoc(targetRef);
        if (docSnapshot.exists()) {
            const targetData = docSnapshot.data();
            await deleteDoc(doc(db, "users", userId, "prayerTargets", targetId));
            await setDoc(doc(db, "users", userId, "archivedTargets", targetId), {
                ...targetData,
                archived: true,
                resolved: false,
                resolutionDate: null
            });
            await fetchPrayerTargets(userId);
            await fetchArchivedTargets(userId);
            renderTargets();
            renderArchivedTargets();
            alert('Alvo arquivado com sucesso!');
        } else {
            console.error("Alvo não encontrado para arquivar.");
            alert("Alvo não encontrado.");
        }
    } catch (error) {
        console.error("Erro ao arquivar alvo: ", error);
        alert("Erro ao arquivar alvo. Verifique o console.");
    }
}

async function deleteArchivedTarget(targetId) {
    const userId = auth.currentUser.uid;
    try {
        await deleteDoc(doc(db, "users", userId, "archivedTargets", targetId));
        await fetchArchivedTargets(userId);
        archivedTargets = archivedTargets.filter(target => target.archived);
        renderArchivedTargets();
        alert('Alvo excluído permanentemente!');
    } catch (error) {
        console.error("Erro ao excluir alvo arquivado: ", error);
        alert("Erro ao excluir alvo arquivado. Verifique o console.");
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const todayISO = formatDateToISO(new Date());
    document.getElementById('date').value = todayISO;
});

document.getElementById('viewAllTargetsButton').addEventListener('click', () => {
    dailySection.style.display = 'none';
    sectionSeparator.style.display = 'none';
    mainPanel.style.display = 'block';
    archivedPanel.style.display = 'none';
    resolvedPanel.style.display = 'none';
    appContent.style.display = 'none';
    weeklyPerseveranceChart.style.display = 'none';
    perseveranceSection.style.display = 'none';
    currentPage = 1;
    renderTargets();
});

document.getElementById('addNewTargetButton').addEventListener('click', () => {
    appContent.style.display = 'block';
    dailySection.style.display = 'none';
    sectionSeparator.style.display = 'none';
    mainPanel.style.display = 'none';
    archivedPanel.style.display = 'none';
    resolvedPanel.style.display = 'none';
    weeklyPerseveranceChart.style.display = 'none';
    perseveranceSection.style.display = 'none';
});

const viewArchivedButton = document.getElementById("viewArchivedButton");
const viewResolvedButton = document.getElementById("viewResolvedButton");
const backToMainButton = document.getElementById("backToMainButton");
const mainPanel = document.getElementById("mainPanel");
const dailySection = document.getElementById("dailySection");
const archivedPanel = document.getElementById("archivedPanel");
const resolvedPanel = document.getElementById("resolvedPanel");
const appContent = document.getElementById("appContent");
const weeklyPerseveranceChart = document.getElementById("weeklyPerseveranceChart");
const perseveranceSection = document.getElementById("perseveranceSection");

viewArchivedButton.addEventListener("click", () => {
    archivedPanel.style.display = 'block';
    mainPanel.style.display = 'none';
    dailySection.style.display = 'none';
    sectionSeparator.style.display = 'none';
    resolvedPanel.style.display = 'none';
    appContent.style.display = 'none';
    weeklyPerseveranceChart.style.display = 'none';
    perseveranceSection.style.display = 'none';
    currentArchivedPage = 1;
    renderArchivedTargets();
});

viewResolvedButton.addEventListener("click", () => {
    resolvedPanel.style.display = 'block';
    mainPanel.style.display = 'none';
    archivedPanel.style.display = 'none';
    dailySection.style.display = 'none';
    sectionSeparator.style.display = 'none';
    appContent.style.display = 'none';
    weeklyPerseveranceChart.style.display = 'none';
    perseveranceSection.style.display = 'none';
    currentResolvedPage = 1;
    renderResolvedTargets();
});

backToMainButton.addEventListener("click", () => {
    mainPanel.style.display = 'block';
    dailySection.style.display = 'none';
    sectionSeparator.style.display = 'none';
    archivedPanel.style.display = 'none';
    resolvedPanel.style.display = 'none';
    appContent.style.display = 'none';
    weeklyPerseveranceChart.style.display = 'none';
    perseveranceSection.style.display = 'none';
    currentPage = 1;
    renderTargets();
});

document.getElementById("copyDaily").addEventListener("click", function () {
    const dailyTargetsDiv = document.getElementById('dailyTargets');
    let textToCopy = '';
    if (dailyTargetsDiv) {
        const targetDivs = dailyTargetsDiv.querySelectorAll('.target');
        targetDivs.forEach(div => {
            const titleElement = div.querySelector('h3');
            const detailsElement = div.querySelector('p:nth-of-type(1)'); // Details is the first paragraph
            if (titleElement && detailsElement) {
                textToCopy += `${titleElement.textContent.trim()}\n${detailsElement.textContent.trim()}\n\n`;
            }
        });
    }

    if (textToCopy) {
        navigator.clipboard.writeText(textToCopy.trim()).then(() => {
            alert('Alvos diários copiados para a área de transferência!');
        }).catch(err => {
            console.error('Falha ao copiar texto: ', err);
            alert('Falha ao copiar alvos diários para a área de transferência.');
        });
    } else {
        alert('Nenhum alvo diário para copiar.');
    }
});

document.getElementById('generateViewButton').addEventListener('click', generateViewHTML);
document.getElementById('viewDaily').addEventListener('click', generateDailyViewHTML);

document.getElementById("viewResolvedViewButton").addEventListener("click", () => {
    dateRangeModal.style.display = "block";
});

const dateRangeModal = document.getElementById("dateRangeModal");
const closeDateRangeModalButton = document.getElementById("closeDateRangeModal");
const generateResolvedViewButton = document.getElementById("generateResolvedView");
const cancelDateRangeButton = document.getElementById("cancelDateRange");
const startDateInput = document.getElementById("startDate");
const endDateInput = document.getElementById("endDate");

closeDateRangeModalButton.addEventListener("click", () => {
    dateRangeModal.style.display = "none";
});

generateResolvedViewButton.addEventListener("click", () => {
    const startDate = startDateInput.value;
    const endDate = endDateInput.value;
    if (startDate && endDate) {
        generateResolvedViewHTML(startDate, endDate);
        dateRangeModal.style.display = "none";
    } else {
        alert("Por favor, selecione as datas de início e fim.");
    }
});

cancelDateRangeButton.addEventListener("click", () => {
    dateRangeModal.style.display = "none";
});

document.getElementById("viewReportButton").addEventListener('click', () => {
    window.location.href = 'orei.html';
});

function generateViewHTML() {
    let viewHTML = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Visualização Geral dos Alvos de Oração</title>
            <link rel="stylesheet" href="styles.css">
        </head>
        <body>
            <div class="view-html-container">
                <h1>Visualização Geral dos Alvos de Oração</h1>
                <h2>Alvos Ativos</h2>
                <hr/>
    `;

    lastDisplayedTargets.forEach(target => {
        viewHTML += `
            <div>
                <h3>${target.title}</h3>
                <p>${target.details}</p>
                <p><strong>Data:</strong> ${formatDateForDisplay(target.date)}</p>
                <p><strong>Tempo Decorrido:</strong> ${timeElapsed(target.date)}</p>
                ${renderObservations(target.observations, false)}
            </div>
            <hr/>
        `;
    });

    viewHTML += `
            </div>
        </body>
        </html>
    `;

    const viewTab = window.open('', '_blank');
    if (viewTab) {
        viewTab.document.write(viewHTML);
        viewTab.document.close();
    } else {
        alert('Popup blocked! Please allow popups for this site to view the generated HTML.');
    }
}

function generateDailyViewHTML() {
    let viewHTML = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Visualização Diária dos Alvos de Oração</title>
            <link rel="stylesheet" href="styles.css">
        </head>
        <body>
            <div class="view-html-container">
                <h1>Alvos de Oração do Dia</h1>
                <hr/>
    `;

    const dailyTargetsDiv = document.getElementById('dailyTargets');
    if (dailyTargetsDiv) {
        const targetDivs = dailyTargetsDiv.querySelectorAll('.target');
        targetDivs.forEach(div => {
            const titleElement = div.querySelector('h3');
            const detailsElement = div.querySelector('p:nth-of-type(1)');
            const timeElapsedElement = div.querySelector('p:nth-of-type(2)');
            const observationsHTMLContent = renderObservations(prayerTargets.find(t => t.id === div.dataset.targetId)?.observations, false);

            if (titleElement && detailsElement && timeElapsedElement) {
                viewHTML += `
                    <div>
                        <h3>${titleElement.textContent.trim()}</h3>
                        <p>${detailsElement.textContent.trim()}</p>
                        <p>${timeElapsedElement.textContent.trim()}</p>
                        ${observationsHTMLContent}
                    </div>
                    <hr/>
                `;
            }
        });
    }

    viewHTML += `
            </div>
        </body>
        </html>
    `;

    const viewTab = window.open('', '_blank');
    if (viewTab) {
        viewTab.document.write(viewHTML);
        viewTab.document.close();
    } else {
        alert('Popup blocked! Please allow popups for this site to view the generated HTML.');
    }
}

async function generateResolvedViewHTML(startDate, endDate) {
    const uid = auth.currentUser.uid;
    const archivedRef = collection(db, "users", uid, "archivedTargets");
    const q = query(archivedRef, where("resolved", "==", true),
                    where("resolutionDate", ">=", Timestamp.fromDate(new Date(startDate))),
                    where("resolutionDate", "<=", Timestamp.fromDate(new Date(endDate))));

    const querySnapshot = await getDocs(q);
    let filteredResolvedTargets = [];
    querySnapshot.forEach((doc) => {
        filteredResolvedTargets.push({...doc.data(), id: doc.id});
    });
    filteredResolvedTargets = rehydrateTargets(filteredResolvedTargets);


    let viewHTML = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Visualização de Alvos Respondidos</title>
            <link rel="stylesheet" href="styles.css">
        </head>
        <body>
            <div class="view-html-container">
                <h1>Alvos de Oração Respondidos</h1>
                <h2>Período: ${formatDateForDisplay(startDate)} - ${formatDateForDisplay(endDate)}</h2>
                <hr/>
    `;

    filteredResolvedTargets.forEach(target => {
        viewHTML += `
            <div>
                <h3>${target.title} (Respondido)</h3>
                <p>${target.details}</p>
                <p><strong>Data Respondido:</strong> ${formatDateForDisplay(target.resolutionDate)}</p>
                <p><strong>Tempo Total:</strong> ${timeElapsed(target.date)}</p>
                ${renderObservations(target.observations, false)}
            </div>
            <hr/>
        `;
    });

    viewHTML += `
            </div>
        </body>
        </html>
    `;

    const viewTab = window.open('', '_blank');
    if (viewTab) {
        viewTab.document.write(viewHTML);
        viewTab.document.close();
    } else {
        alert('Popup blocked! Please allow popups for this site to view the generated HTML.');
    }
}

function filterTargets(targets, searchTerm) {
    const lowerSearchTerm = searchTerm.toLowerCase();
    return targets.filter(target => {
        return target.title.toLowerCase().includes(lowerSearchTerm) ||
               target.details.toLowerCase().includes(lowerSearchTerm);
    });
}

function handleSearchMain(event) {
    currentSearchTermMain = event.target.value;
    currentPage = 1;
    renderTargets();
}

function handleSearchArchived(event) {
    currentSearchTermArchived = event.target.value;
    currentArchivedPage = 1;
    renderArchivedTargets();
}
function handleSearchResolved(event) {
    currentSearchTermResolved = event.target.value;
    currentResolvedPage = 1;
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
    }
}

function checkIfAllPrayersDone() {
    const dailyTargetsDiv = document.getElementById('dailyTargets');
    if (!dailyTargetsDiv) return false;
    const prayButtons = dailyTargetsDiv.querySelectorAll('.pray-button');
    if (prayButtons.length === 0) return false; // No daily targets

    for (let button of prayButtons) {
        if (!button.disabled) {
            return false; // At least one button is not disabled
        }
    }
    return true; // All pray buttons are disabled
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

document.getElementById('closePopup').addEventListener('click', () => {
    const popup = document.getElementById('completionPopup');
    if (popup) {
        popup.style.display = 'none';
    }
});

async function generateReport() {
    const userId = auth.currentUser.uid;
    const targetsRef = collection(db, "users", userId, "prayerTargets");
    const targetsSnapshot = await getDocs(targetsRef);
    let reportText = "Relatório de Alvos de Oração:\n\n";

    targetsSnapshot.forEach((doc) => {
        const target = doc.data();
        reportText += `Título: ${target.title}\n`;
        reportText += `Detalhes: ${target.details}\n`;
        reportText += `Data: ${formatDateForDisplay(target.date)}\n`;
        reportText += `Tempo Decorrido: ${timeElapsed(target.date)}\n`;
        reportText += `Respondido: ${target.resolved ? 'Sim' : 'Não'}\n`;
        if (target.resolved) {
            reportText += `Data de Resolução: ${formatDateForDisplay(target.resolutionDate)}\n`;
        }
        reportText += "---\n";
    });
    displayReportModal(reportText);
}

function displayReportModal(reportText){
    const reportModal = document.getElementById('reportModal');
    const reportContent = document.getElementById('reportContent');
    const closeReportModalButton = document.getElementById('closeReportModal');

    reportContent.textContent = reportText;
    reportModal.style.display = 'block';

    closeReportModalButton.onclick = function() {
        reportModal.style.display = 'none';
    }

    window.onclick = function(event) {
        if (event.target == reportModal) {
            reportModal.style.display = 'none';
        }
    }
}

function hideTargets(){
    mainPanel.style.display = 'none';
    archivedPanel.style.display = 'none';
    resolvedPanel.style.display = 'none';
    deadlinePanel.style.display = 'none';
}

function checkExpiredDeadlines() {
    prayerTargets.forEach(target => {
        if (target.hasDeadline && isDateExpired(target.deadlineDate)) {
            const targetElement = document.querySelector(`.target[data-target-id="${target.id}"]`);
            if (targetElement) {
                const deadlineTag = targetElement.querySelector('.deadline-tag');
                if (deadlineTag) {
                    deadlineTag.classList.add('expired');
                }
            }
        }
    });
}

async function loadPerseveranceData(userId) {
    const perseveranceDocRef = doc(db, "perseveranceData", userId);
    const docSnap = await getDoc(perseveranceDocRef);

    if (docSnap.exists()) {
        perseveranceData = docSnap.data();
        // Convert lastInteractionDate back to Date object if it's a Timestamp
        if (perseveranceData.lastInteractionDate instanceof Timestamp) {
            perseveranceData.lastInteractionDate = perseveranceData.lastInteractionDate.toDate();
        }
    } else {
        // Initialize default data if document doesn't exist
        perseveranceData = { consecutiveDays: 0, lastInteractionDate: null, recordDays: 0 };
    }
    updatePerseveranceUI();
}

async function confirmPerseverance() {
    const userId = auth.currentUser.uid;
    const today = new Date();
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate()); // Date without time

    let lastInteractionDate = perseveranceData.lastInteractionDate ? new Date(perseveranceData.lastInteractionDate.getFullYear(), perseveranceData.lastInteractionDate.getMonth(), perseveranceData.lastInteractionDate.getDate()) : null;

    if (!lastInteractionDate || todayDate.getTime() > lastInteractionDate.getTime()) {
        let daysToAdd = 1;
        if (lastInteractionDate && todayDate.getTime() === new Date(lastInteractionDate.getTime() + 24 * 60 * 60 * 1000).getTime()) {
            daysToAdd = 1; // Continue streak if clicked the day after
        } else if (todayDate.getTime() > new Date(lastInteractionDate.getTime() + 24 * 60 * 60 * 1000).getTime()) {
             perseveranceData.consecutiveDays = 0; // Reset streak if more than a day has passed
             daysToAdd = 1; // Start new streak
        }

        perseveranceData.consecutiveDays += daysToAdd;
        perseveranceData.lastInteractionDate = todayDate;

        if (perseveranceData.consecutiveDays > perseveranceData.recordDays) {
            perseveranceData.recordDays = perseveranceData.consecutiveDays;
        }

        await updatePerseveranceFirestore(userId, perseveranceData);
        updatePerseveranceUI();
    } else {
        alert("Perseverança já confirmada para hoje!");
    }
}


async function updatePerseveranceFirestore(userId, data) {
    const perseveranceDocRef = doc(db, "perseveranceData", userId);
    await setDoc(perseveranceDocRef, {
        consecutiveDays: data.consecutiveDays,
        lastInteractionDate: Timestamp.fromDate(data.lastInteractionDate),
        recordDays: data.recordDays
    });
}

function updatePerseveranceUI() {
    const percentage = Math.min((perseveranceData.consecutiveDays / 30) * 100, 100);
    const progressBar = document.getElementById('perseveranceProgressBar');
    const percentageDisplay = document.getElementById('perseverancePercentage');
    progressBar.style.width = `${percentage}%`;
    percentageDisplay.textContent = `${Math.round(percentage)}%`;

    updateWeeklyChart();
}

function resetPerseveranceUI() {
    const progressBar = document.getElementById('perseveranceProgressBar');
    const percentageDisplay = document.getElementById('perseverancePercentage');
    progressBar.style.width = `0%`;
    percentageDisplay.textContent = `0%`;
    resetWeeklyChart();
}

async function editDeadline(targetId) {
    const target = prayerTargets.find(t => t.id === targetId);
    if (!target) return;

    const currentDeadline = target.deadlineDate ? formatDateToISO(target.deadlineDate) : '';
    const formHTML = `
        <div class="edit-deadline-form">
            <label for="editDeadlineDate-${targetId}">Novo Prazo:</label>
            <input type="date" id="editDeadlineDate-${targetId}" value="${currentDeadline}">
            <button class="btn save-deadline-btn" onclick="saveEditedDeadline('${targetId}')">Salvar</button>
            <button class="btn cancel-deadline-btn" onclick="cancelEditDeadline('${targetId}')">Cancelar</button>
        </div>
    `;

    const targetDiv = document.querySelector(`.target[data-target-id="${targetId}"]`);
    if (targetDiv) {
        // Check if an edit form already exists and remove it
        const existingEditForm = targetDiv.querySelector('.edit-deadline-form');
        if (existingEditForm) {
            existingEditForm.remove();
            return; // Exit to just toggle off the form if it's already there
        }

        targetDiv.insertAdjacentHTML('beforeend', formHTML);
    }
}


async function saveEditedDeadline(targetId) {
    const newDeadlineDateInput = document.getElementById(`editDeadlineDate-${targetId}`).value;
    if (!isValidDate(newDeadlineDateInput)) {
        alert("Por favor, selecione uma data válida.");
        return;
    }
    const newDeadlineDate = convertToISO(newDeadlineDateInput);

    const userId = auth.currentUser.uid;
    const targetRef = doc(db, "users", userId, "prayerTargets", targetId);

    try {
        await updateDoc(targetRef, {
            deadlineDate: Timestamp.fromDate(new Date(newDeadlineDate)),
            hasDeadline: true // Ensure hasDeadline is true
        });

        // Update local prayerTargets array
        const targetIndex = prayerTargets.findIndex(target => target.id === targetId);
        if (targetIndex !== -1) {
            prayerTargets[targetIndex].deadlineDate = new Date(newDeadlineDate);
            prayerTargets[targetIndex].hasDeadline = true;
        }

        renderTargets(); // Re-render targets to show updated deadline
        alert('Prazo atualizado com sucesso!');

        // Remove the edit form after saving
        const targetDiv = document.querySelector(`.target[data-target-id="${targetId}"]`);
        if (targetDiv) {
            const editForm = targetDiv.querySelector('.edit-deadline-form');
            if (editForm) {
                editForm.remove();
            }
        }


    } catch (error) {
        console.error("Erro ao atualizar prazo:", error);
        alert("Erro ao atualizar prazo. Verifique o console.");
    }
}

function cancelEditDeadline(targetId) {
     const targetDiv = document.querySelector(`.target[data-target-id="${targetId}"]`);
        if (targetDiv) {
            const editForm = targetDiv.querySelector('.edit-deadline-form');
            if (editForm) {
                editForm.remove();
            }
        }
}


function isValidDate(dateString) {
    return !isNaN(new Date(dateString));
}

function convertToISO(dateString) {
    const date = new Date(dateString);
    return date.toISOString().split('T')[0];
}

// Function to update the weekly chart
function updateWeeklyChart() {
    const today = new Date();
    for (let i = 0; i < 7; i++) {
        const day = new Date(today);
        day.setDate(today.getDate() - i); // Get date for each of the last 7 days
        const dayTickId = `day-${day.getDay()}`; // Get day of the week (0 for Sunday, 1 for Monday, etc.)
        const dayTick = document.getElementById(dayTickId);

        if (dayTick) {
            const lastInteraction = perseveranceData.lastInteractionDate;
             if (lastInteraction &&
                day.getDate() === lastInteraction.getDate() &&
                day.getMonth() === lastInteraction.getMonth() &&
                day.getFullYear() === lastInteraction.getFullYear()) {
                dayTick.classList.add('active'); // Add 'active' class if interaction was on this day
            } else {
                dayTick.classList.remove('active'); // Ensure no 'active' class if no interaction
            }
        }
    }
}

function resetWeeklyChart() {
    for (let i = 0; i < 7; i++) {
        const dayTickId = `day-${i}`;
        const dayTick = document.getElementById(dayTickId);
        if (dayTick) {
            dayTick.classList.remove('active');
        }
    }
}
