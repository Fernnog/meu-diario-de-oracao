import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-analytics.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDocs, updateDoc, deleteDoc, query, where, orderBy, getDoc, increment } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDUbWB7F_4-tQ8K799wylf36IayGWgBuMU",
    authDomain: "diario-de-oracao-268d3.firebaseapp.com",
    projectId: "diario-de-oracao-268d3",
    storageBucket: "diario-de-oracao-268d3.firebasestorage.app",
    messagingSenderId: "561592831701",
    appId: "1:561592831701:web:2a682317486837fd795c5c",
    measurementId: "G-15YHNK7H2B"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app); // Initialize Firestore

// ==== VARIÁVEIS GLOBAIS ====
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
let perseveranceData = { consecutiveDays: 0, lastInteractionDate: null, recordDays: 0 }; // Track perseverance data locally

// ==== FIM SEÇÃO - VARIÁVEIS GLOBAIS ====

// ==== FUNÇÕES UTILITÁRIAS ====
function formatDateToISO(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDateForDisplay(dateString) {
    if (dateString instanceof Date) {
        dateString = formatDateToISO(dateString);
    }
    if (!dateString || dateString.includes('NaN')) return 'Data Inválida';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Data Inválida';
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

function timeElapsed(date) {
    const now = new Date();
    const targetDate = new Date(date);
    return Math.floor((now - targetDate) / (1000 * 60 * 60 * 24)) < 7
        ? `${Math.floor((now - targetDate) / (1000 * 60 * 60 * 24))} dia(s)`
        : `${Math.floor((now - targetDate) / (1000 * 60 * 60 * 24 * 7))} semana(s)`;
}

function isDateExpired(dateString) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(dateString) < today;
}

function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// ==== FIM SEÇÃO - FUNÇÕES UTILITÁRIAS ====

// ==== FUNÇÕES AUXILIARES ====
function rehydrateTargets(targets) {
    return targets.map(target => {
        if (target.date) target.date = new Date(target.date);
        if (target.archivedDate) target.archivedDate = new Date(target.archivedDate);
        if (target.deadlineDate) target.deadlineDate = new Date(target.deadlineDate);
        if (target.observations) target.observations.forEach(obs => obs.date = new Date(obs.date));
        return target;
    });
}

// ==== FIM SEÇÃO - FUNÇÕES AUXILIARES ====

// ==== FUNÇÃO PARA ATUALIZAR A UI DE AUTENTICAÇÃO ====
function updateAuthUI(user) {
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const btnRegister = document.getElementById('btnRegister');
    const btnLogin = document.getElementById('btnLogin');
    const btnLogout = document.getElementById('btnLogout');
    const btnForgotPasswordContainer = document.getElementById('btnForgotPasswordContainer');
    const authStatus = document.getElementById('authStatus');
    const authStatusContainer = document.querySelector('.auth-status-container'); // Obtém o container

    if (user) {
        authStatus.textContent = "Usuário autenticado: " + user.email;
        authStatusContainer.style.display = 'flex'; // Mostra o container (e seu conteúdo)
        btnLogout.style.display = 'inline-block'; //redundancia proposital, questão de segurança
        emailInput.style.display = 'none';
        passwordInput.style.display = 'none';
        btnRegister.style.display = 'none';
        btnLogin.style.display = 'none';
        btnForgotPasswordContainer.style.display = 'none';

    } else {
        authStatus.textContent = "Nenhum usuário autenticado";
        authStatusContainer.style.display = 'block'; // Certifique-se de que está visível
        btnLogout.style.display = 'none';
        emailInput.style.display = 'block';
        passwordInput.style.display = 'block';
        btnRegister.style.display = 'inline-block';
        btnLogin.style.display = 'inline-block';
        btnForgotPasswordContainer.style.display = 'block';
    }
}

// ==== FIM SEÇÃO - FUNÇÃO PARA ATUALIZAR A UI DE AUTENTICAÇÃO ====

// ==== INICIALIZAÇÃO E LOGIN/AUTENTICAÇÃO ====
async function loadData(user) {
    updateAuthUI(user); // Atualiza a UI de autenticação

    if (user) {
        document.getElementById('appContent').style.display = 'none';
        document.getElementById('dailySection').style.display = 'block';
        document.getElementById('sectionSeparator').style.display = 'block';
        document.getElementById('mainPanel').style.display = 'none';
        document.getElementById('weeklyPerseveranceChart').style.display = 'block'; // Show weekly chart
        document.getElementById('perseveranceSection').style.display = 'block'; // Show perseverance section
        // authSection já é controlado por updateAuthUI

        await fetchPrayerTargets(user.uid);
        await fetchArchivedTargets(user.uid);
        resolvedTargets = archivedTargets.filter(target => target.resolved);

        checkExpiredDeadlines();
        renderTargets();
        renderArchivedTargets();
        renderResolvedTargets();
        refreshDailyTargets();
        await loadPerseveranceData(user.uid); // Load perseverance data

    } else {
        //usuário não logado
        document.getElementById('appContent').style.display = 'none';
        document.getElementById('dailySection').style.display = 'none';
        document.getElementById('sectionSeparator').style.display = 'none';
        document.getElementById('mainPanel').style.display = 'none';
        document.getElementById('weeklyPerseveranceChart').style.display = 'none'; // Hide weekly chart
        document.getElementById('perseveranceSection').style.display = 'none'; // Hide perseverance section
        // authSection já é controlado por updateAuthUI

        prayerTargets = [];
        archivedTargets = [];
        resolvedTargets = [];
        renderTargets();
        renderArchivedTargets();
        renderResolvedTargets();
        refreshDailyTargets();
        resetPerseveranceUI(); // Reset perseverance UI for logged out user

    }
}

async function fetchPrayerTargets(uid) {
    prayerTargets = [];
    const targetsRef = collection(db, "users", uid, "prayerTargets");
    const targetsSnapshot = await getDocs(query(targetsRef, orderBy("date", "desc"))); // Ordenar por data
    targetsSnapshot.forEach((doc) => {
        prayerTargets.push({...doc.data(), id: doc.id});
    });
    prayerTargets = rehydrateTargets(prayerTargets);
}

async function fetchArchivedTargets(uid) {
    archivedTargets = [];
    const archivedRef = collection(db, "users", uid, "archivedTargets");
    const archivedSnapshot = await getDocs(query(archivedRef, orderBy("archivedDate", "desc"))); // Ordenar por data de arquivo
    archivedSnapshot.forEach((doc) => {
        archivedTargets.push({...doc.data(), id: doc.id});
    });
     archivedTargets = rehydrateTargets(archivedTargets);
}


window.onload = () => {
    onAuthStateChanged(auth, (user) => {
        loadData(user); // loadData chama updateAuthUI
    });
    document.getElementById('searchMain').addEventListener('input', handleSearchMain);
    document.getElementById('searchArchived').addEventListener('input', handleSearchArchived);
    document.getElementById('searchResolved').addEventListener('input', handleSearchResolved);
    document.getElementById('showDeadlineOnly').addEventListener('change', handleDeadlineFilterChange);
    document.getElementById('showExpiredOnlyMain').addEventListener('change', handleExpiredOnlyMainChange);
    document.getElementById('confirmPerseveranceButton').addEventListener('click', confirmPerseverance); // Event listener for perseverance button

    // ADICIONAR O EVENT LISTENER DO BOTÃO DE RELATÓRIO AQUI
    document.getElementById("viewReportButton").addEventListener('click', generateReport);
};

// ==== FIM SEÇÃO - INICIALIZAÇÃO E LOGIN/AUTENTICAÇÃO ====

// ==== FUNÇÕES DE RENDERIZAÇÃO ====
function renderTargets() {
  const targetList = document.getElementById("targetList");
  targetList.innerHTML = "";

  let filteredTargets = prayerTargets;
  if (showDeadlineOnly) {
    filteredTargets = filteredTargets.filter(
      (t) => t.hasDeadline && !isDateExpired(t.deadlineDate)
    );
  }
  const showExpiredOnlyMain =
    document.getElementById("showExpiredOnlyMain").checked;
  if (showExpiredOnlyMain) {
    filteredTargets = filteredTargets.filter(
      (t) => t.hasDeadline && isDateExpired(t.deadlineDate)
    );
  }

  filteredTargets = filterTargets(filteredTargets, currentSearchTermMain);

  const startIndex = (currentPage - 1) * targetsPerPage;
  const endIndex = startIndex + targetsPerPage;
  const targetsToDisplay = filteredTargets.slice(startIndex, endIndex);

  targetsToDisplay.forEach((target) => {
    const formattedDate = formatDateForDisplay(target.date);
    const deadlineTag = target.hasDeadline
      ? `<span class="deadline-tag ${
          isDateExpired(target.deadlineDate) ? "expired" : ""
        }">Prazo: ${formatDateForDisplay(target.deadlineDate)}</span>`
      : "";
    const targetDiv = document.createElement("div");
    targetDiv.classList.add("target");
    targetDiv.innerHTML = `
            <h3>${deadlineTag} ${target.title}</h3>
            <p>${target.details}</p>
            <p><strong>Data:</strong> ${formattedDate}</p>
            <p><strong>Tempo Decorrido:</strong> ${timeElapsed(target.date)}</p>
            <p><strong>Status:</strong> Pendente</p>
            <button class="btn resolved">Marcar como Respondido</button>
            <button class="btn archive">Arquivar</button>
            <button class="btn add-observation">Adicionar Observação</button>
            ${
              target.hasDeadline
                ? `<button class="btn edit-deadline">Editar Prazo</button>`
                : ""
            }
            <div class="add-observation-form" data-target-id="${
              target.id
            }" style="display: none;">
                <h4 class="target-title"></h4>
                <textarea placeholder="Escreva aqui a nova observação"></textarea>
                <input type="date" >
                <button class="btn save-observation-btn">Salvar Observação</button>
            </div>
            <div class="observations-list">
                ${renderObservations(target.observations, true)}
            </div>
        `; // isExpanded: true for "Ver Todos os Alvos"
    targetList.appendChild(targetDiv);

    // Adicionando event listeners programaticamente
    const resolvedButton = targetDiv.querySelector(".resolved");
    const archiveButton = targetDiv.querySelector(".archive");
    const addObservationButton = targetDiv.querySelector(".add-observation");
    const editDeadlineButton = targetDiv.querySelector(".edit-deadline");
    const saveObservationBtn = targetDiv.querySelector(".save-observation-btn");

    resolvedButton.addEventListener('click', () => markAsResolved(target.id));
    archiveButton.addEventListener('click', () => archiveTarget(target.id));
    addObservationButton.addEventListener('click', () => toggleAddObservation(target.id));
    if (editDeadlineButton) {
        editDeadlineButton.addEventListener('click', () => editDeadline(target.id));
    }
    saveObservationBtn.addEventListener('click', () => saveObservation(target.id));

  });
  renderPagination("mainPanel", currentPage, filteredTargets);
}

function renderArchivedTargets() {
    const archivedList = document.getElementById("archivedList");
    archivedList.innerHTML = "";
    const filteredTargets = filterTargets(archivedTargets, currentSearchTermArchived);
    const startIndex = (currentArchivedPage - 1) * targetsPerPage;
    const endIndex = startIndex + targetsPerPage;
    const targetsToDisplay = filteredTargets.slice(startIndex, endIndex);

    targetsToDisplay.forEach((target) => {
        const formattedDate = formatDateForDisplay(target.date);
        const formattedArchivedDate = formatDateForDisplay(target.archivedDate);
        const archivedDiv = document.createElement("div");
        archivedDiv.classList.add("target");
        archivedDiv.innerHTML = `
            <h3>${target.title}</h3>
            <p>${target.details}</p>
            <p><strong>Data Original:</strong> ${formattedDate}</p>
            <p><strong>Tempo Decorrido:</strong> ${timeElapsed(target.date)}</p>
            <p><strong>Status:</strong> ${target.resolved ? "Respondido" : "Arquivado"}</p>
            <p><strong>Data de Arquivo:</strong> ${formattedArchivedDate}</p>
             <button class="btn delete">Excluir</button>
        `;
        archivedList.appendChild(archivedDiv);

        // Adicionando event listener para o botão "Excluir"
        const deleteButton = archivedDiv.querySelector(".delete");
        deleteButton.addEventListener('click', () => deleteArchivedTarget(target.id));
    });
    renderPagination('archivedPanel', currentArchivedPage, filteredTargets);
}

function renderResolvedTargets() {
    const resolvedList = document.getElementById("resolvedList");
    resolvedList.innerHTML = "";
    const filteredTargets = filterTargets(resolvedTargets, currentSearchTermResolved);
    const startIndex = (currentResolvedPage - 1) * targetsPerPage;
    const endIndex = startIndex + targetsPerPage;
    const targetsToDisplay = filteredTargets.slice(startIndex, endIndex);

    targetsToDisplay.forEach((target) => {
        const formattedDate = formatDateForDisplay(target.date);
        const resolvedDate = formatDateForDisplay(target.archivedDate);
        const resolvedDiv = document.createElement("div");
        resolvedDiv.classList.add("target", "resolved");
        resolvedDiv.innerHTML = `
            <h3>${target.title}</h3>
            <p>${target.details}</p>
            <p><strong>Data Original:</strong> ${formattedDate}</p>
            <p><strong>Tempo Decorrido:</strong> ${timeElapsed(target.date)}</p>
            <p><strong>Status:</strong> Respondido</p>
            <p><strong>Data de Resolução:</strong> ${resolvedDate}</p>
             <button class="btn delete">Excluir</button>
        `;
        resolvedList.appendChild(resolvedDiv);

        // Adicionando event listener para o botão "Excluir"
        const deleteButton = resolvedDiv.querySelector(".delete");
        deleteButton.addEventListener('click', () => deleteArchivedTarget(target.id));
    });
    renderPagination('resolvedPanel', currentResolvedPage, filteredTargets);
}

function renderPagination(panelId, page, targets) {
    const totalPages = Math.ceil(targets.length / targetsPerPage);
    let paginationDiv = document.getElementById("pagination-" + panelId);
    if (!paginationDiv) {
        paginationDiv = document.createElement("div");
        paginationDiv.id = "pagination-" + panelId;
        document.getElementById(panelId).appendChild(paginationDiv);
    }
    paginationDiv.innerHTML = "";

    if (totalPages <= 1) {
        paginationDiv.style.display = 'none';
        return;
    }
    paginationDiv.style.display = 'flex';
    paginationDiv.style.justifyContent = 'center';
    paginationDiv.style.margin = '10px 0';

    for (let i = 1; i <= totalPages; i++) {
        const pageLink = document.createElement("a");
        pageLink.href = "#";
        pageLink.textContent = i;
        pageLink.classList.add("page-link");
        if (i === page) {
            pageLink.classList.add('active');
        }
        pageLink.addEventListener("click", (event) => {
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
    if (observations.length > 0) {
        const observationsListHTML = observations.map(obs => `<p><strong>${formatDateForDisplay(obs.date)}:</strong> ${obs.observation}</p>`).join('');
        const uniqueId = generateUniqueId(); // Generate a unique ID for each observations section
         return `
             <div class="observations-container">
                 <button class="observations-toggle" data-target-id="${uniqueId}" onclick="toggleObservations('${uniqueId}')">Atualizações</button>
                 <div id="observations-${uniqueId}" class="observations-list-collapsible" style="display: ${isExpanded ? 'block' : 'none'};">
                     ${observationsListHTML}
                 </div>
             </div>
         `;
    }
    return '';
}

window.toggleObservations = function(targetId) { // Make toggleObservations globally accessible
    const observationsDiv = document.getElementById(`observations-${targetId}`);
    observationsDiv.style.display = observationsDiv.style.display === 'none' ? 'block' : 'none';
}

function toggleAddObservation(targetId) {
    const form = document.querySelector(`.add-observation-form[data-target-id="${targetId}"]`);
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
    if (form.style.display === 'block') {
        form.querySelector('.target-title').textContent = `Adicionando observação para: ${prayerTargets.find(t => t.id === targetId).title}`;
    }
}

async function saveObservation(targetId) {
    const form = document.querySelector(`.add-observation-form[data-target-id="${targetId}"]`);
    const textarea = form.querySelector('textarea');
    const dateInput = form.querySelector('input[type="date"]');
    const observationText = textarea.value.trim();
    const observationDateValue = dateInput.value;

    if (observationText !== "") {
        let observationDate = observationDateValue ? observationDateValue : formatDateToISO(new Date(new Date().getTime() + new Date().getTimezoneOffset() * 60000));
        const userId = auth.currentUser.uid;
        const targetRef = doc(db, "users", userId, "prayerTargets", targetId);

        try {
            const targetDoc = await getDoc(targetRef); // Use getDoc here

            if (targetDoc.exists()) {
                const targetData = targetDoc.data();
                let updatedObservations = targetData.observations || [];
                updatedObservations.push({ date: observationDate, observation: observationText });

                await updateDoc(targetRef, { observations: updatedObservations });
                await fetchPrayerTargets(userId); // Refresh targets from Firestore
                renderTargets();
                textarea.value = "";
                dateInput.value = "";
                form.style.display = "none";
            } else {
                console.error("Alvo não encontrado no Firestore para adicionar observação.");
                alert("Erro ao salvar observação. Alvo não encontrado.");
            }
        } catch (error) {
             console.error("Erro ao adicionar observação no Firestore: ", error);
             alert("Erro ao salvar observação. Verifique o console.");
        }
    } else {
        alert("Por favor, insira o texto da observação.");
    }
}


function handleDeadlineFilterChange() {
    showDeadlineOnly = document.getElementById("showDeadlineOnly").checked;
    currentPage = 1;
    renderTargets();
}

function handleExpiredOnlyMainChange() {
    currentPage = 1;
    renderTargets();
}

// ==== FIM SEÇÃO - FUNÇÕES DE RENDERIZAÇÃO ====

// ==== MANIPULAÇÃO DE DADOS ====
document.getElementById('hasDeadline').addEventListener('change', function() {
    document.getElementById('deadlineContainer').style.display = this.checked ? 'block' : 'none';
});

document.getElementById("prayerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const hasDeadline = document.getElementById("hasDeadline").checked;
    const deadlineDate = hasDeadline
        ? formatDateToISO(new Date(document.getElementById("deadlineDate").value + "T00:00:00"))
        : null;

    // Obtém o ID do usuário atual
    const userId = auth.currentUser ? auth.currentUser.uid : null;
    if (!userId) {
        alert("Usuário não autenticado.");
        return; // Impede a continuação se não houver usuário
    }

    const newTarget = {
        title: document.getElementById("title").value,
        details: document.getElementById("details").value,
        date: formatDateToISO(new Date(document.getElementById("date").value + "T00:00:00")),
        resolved: false,
        observations: [],
        hasDeadline: hasDeadline,
        deadlineDate: deadlineDate,
        userId: userId, // Adiciona o userId ao novo alvo
    };

    try {
        const docRef = doc(collection(db, "users", userId, "prayerTargets")); // Firestore auto-generates ID
        await setDoc(docRef, newTarget);
        await fetchPrayerTargets(userId); // Refresh targets from Firestore
        currentPage = 1;
        renderTargets();
        document.getElementById("prayerForm").reset();
        refreshDailyTargets();
    } catch (error) {
        console.error("Erro ao adicionar alvo no Firestore: ", error);
        alert("Erro ao adicionar alvo. Verifique o console.");
    }
});



async function markAsResolved(targetId) {
    try {
        const user = auth.currentUser;
        if (user) {
            const targetRef = doc(db, "users", user.uid, "prayerTargets", targetId);
            const targetDoc = await getDoc(targetRef); // Use getDoc here

             if (targetDoc.exists()) {
                //Não precisa do userId aqui, já estamos na coleção do usuário correto
                const resolvedTargetData = {...targetDoc.data(), resolved: true, archivedDate: formatDateToISO(new Date())};
                const archivedRef = doc(collection(db, "users", user.uid, "archivedTargets")); // Usa o UID do usuário
                await setDoc(archivedRef, resolvedTargetData); // Save to archivedTargets

                await deleteDoc(targetRef); // Delete from prayerTargets
                await fetchPrayerTargets(user.uid);
                await fetchArchivedTargets(user.uid);
                resolvedTargets = archivedTargets.filter(target => target.resolved);

                renderTargets();
                renderArchivedTargets();
                renderResolvedTargets();
                refreshDailyTargets();
            } else {
                console.error("Alvo não encontrado no Firestore para marcar como resolvido.");
                alert("Alvo não encontrado.");
            }
        } else {
            alert("Usuário não autenticado.");
        }
    } catch (error) {
        console.error("Erro ao marcar como resolvido no Firestore: ", error);
        alert("Erro ao marcar como resolvido. Verifique o console.");
    }
}


async function archiveTarget(targetId) {
    try {
        const user = auth.currentUser;
        if (user) {
            const targetRef = doc(db, "users", user.uid, "prayerTargets", targetId);
            const targetDoc = await getDoc(targetRef); // Use getDoc here

            if (targetDoc.exists()) {
                //Não precisa do userId aqui, já estamos na coleção do usuário correto
                 const archivedTargetData = {...targetDoc.data(), archivedDate: formatDateToISO(new Date())};
                const archivedRef = doc(collection(db, "users", user.uid, "archivedTargets"));// Usa o UID do usuário
                await setDoc(archivedRef, archivedTargetData); // Save to archivedTargets

                await deleteDoc(targetRef); // Delete from prayerTargets
                await fetchPrayerTargets(user.uid);
                await fetchArchivedTargets(user.uid);
                renderTargets();
                renderArchivedTargets();
                refreshDailyTargets();
            } else {
                console.error("Alvo não encontrado no Firestore para arquivar.");
                alert("Alvo não encontrado.");
            }
        } else {
            alert("Usuário não autenticado.");
        }
    } catch (error) {
        console.error("Erro ao arquivar no Firestore: ", error);
        alert("Erro ao arquivar. Verifique o console.");
    }
}


async function deleteArchivedTarget(targetId) {
    if (confirm("Tem certeza de que deseja excluir este alvo permanentemente? Esta ação não pode ser desfeita.")) {
        try {
            const user = auth.currentUser;
            if (user) {
                const targetRef = doc(db, "users", user.uid, "archivedTargets", targetId); //Usa UID do usuário
                await deleteDoc(targetRef);
                await fetchArchivedTargets(user.uid);
                resolvedTargets = archivedTargets.filter(target => target.resolved);
                renderArchivedTargets();
                renderResolvedTargets();
            } else {
                alert("Usuário não autenticado.");
            }
        } catch (error) {
            console.error("Erro ao excluir alvo arquivado do Firestore: ", error);
            alert("Erro ao excluir alvo arquivado. Verifique o console.");
        }
    }
}

// ==== FIM SEÇÃO - MANIPULAÇÃO DE DADOS ====

// ==== INÍCIO SEÇÃO - EVENT LISTENERS ====
// Autenticação
document.addEventListener('DOMContentLoaded', () => {
    const btnRegister = document.getElementById('btnRegister');
    const btnLogin = document.getElementById('btnLogin');
    const btnLogout = document.getElementById('btnLogout');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const btnForgotPassword = document.getElementById('btnForgotPassword');
    const passwordResetMessage = document.getElementById('passwordResetMessage');
    const confirmPerseveranceButton = document.getElementById('confirmPerseveranceButton'); // Get the perseverance button

    if (btnRegister) {
        btnRegister.addEventListener('click', async () => {
            const email = emailInput.value;
            const password = passwordInput.value;
            if (!email || !password) { alert("Preencha email e senha para registrar."); return; }
            try {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                loadData(userCredential.user);
            } catch (error) {
                console.error("Erro no registro:", error);
                alert("Erro no registro: " + error.message);
            }
        });
    }

    if (btnLogin) {
        btnLogin.addEventListener('click', async () => {
            const email = emailInput.value;
            const password = passwordInput.value;
            if (!email || !password) { alert("Preencha email e senha para entrar."); return;}
            try {
                const userCredential = await signInWithEmailAndPassword(auth, email, password);
                loadData(userCredential.user);
            } catch (error) {
                console.error("Erro no login:", error);
                alert("Erro no login: " + error.message);
            }
        });
    }

    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            try {
                await signOut(auth);
                loadData(null);
            } catch (error) {
                console.error("Erro ao sair:", error);
            }
        });
    }

    if (btnForgotPassword) {
        btnForgotPassword.addEventListener('click', async () => {
            const email = emailInput.value;
            if (!email) { alert("Por favor, insira seu email para redefinir a senha."); return; }
            try {
                await sendPasswordResetEmail(auth, email);
                passwordResetMessage.textContent = "Email de redefinição enviado. Verifique sua caixa de entrada (e spam).";
                passwordResetMessage.style.display = "block";
                setTimeout(() => { passwordResetMessage.style.display = "none"; }, 5000);
            } catch (error) {
                console.error("Erro ao enviar email de redefinição:", error);
                alert("Erro: " + error.message);
                passwordResetMessage.textContent = "Erro ao enviar email. Tente novamente.";
                passwordResetMessage.style.display = "block";
            }
        });
    }
});

//Navegação
document.getElementById('viewAllTargetsButton').addEventListener('click', () => {
    mainPanel.style.display = "block";
    dailySection.style.display = "none";  archivedPanel.style.display = "none";
    resolvedPanel.style.display = "none"; viewArchivedButton.style.display = "inline-block";
    viewResolvedButton.style.display = "inline-block"; backToMainButton.style.display = "inline-block";
    showDeadlineOnly = false; document.getElementById("showDeadlineOnly").checked = false;
    renderTargets();
});

document.getElementById('addNewTargetButton').addEventListener('click', () => {
    appContent.style.display = "block";
    dailySection.style.display = "none"; mainPanel.style.display = "none"; archivedPanel.style.display = "none"; resolvedPanel.style.display = "none";
    viewArchivedButton.style.display = "inline-block"; viewResolvedButton.style.display = "inline-block"; backToMainButton.style.display = "inline-block";
});


const viewArchivedButton = document.getElementById("viewArchivedButton");
const viewResolvedButton = document.getElementById("viewResolvedButton");
const backToMainButton = document.getElementById("backToMainButton");
const mainPanel = document.getElementById("mainPanel");
const dailySection = document.getElementById("dailySection");
const archivedPanel = document.getElementById("archivedPanel");
const resolvedPanel = document.getElementById("resolvedPanel");
const appContent = document.getElementById("appContent");

viewArchivedButton.addEventListener("click", () => {
    mainPanel.style.display = "none";  dailySection.style.display = "none"; appContent.style.display = "none";
    archivedPanel.style.display = "block"; resolvedPanel.style.display = "none";
    viewArchivedButton.style.display = "none"; viewResolvedButton.style.display = "inline-block";
    backToMainButton.style.display = "inline-block"; currentArchivedPage = 1;
    renderArchivedTargets();
});

viewResolvedButton.addEventListener("click", () => {
    mainPanel.style.display = "none"; dailySection.style.display = "none"; appContent.style.display = "none";
    archivedPanel.style.display = "none"; resolvedPanel.style.display = "block";
    viewArchivedButton.style.display = "inline-block"; viewResolvedButton.style.display = "none";
    backToMainButton.style.display = "inline-block"; currentResolvedPage = 1;
    renderResolvedTargets();
});

backToMainButton.addEventListener("click", () => {
    mainPanel.style.display = "none"; dailySection.style.display = "block"; appContent.style.display = "none";
    archivedPanel.style.display = "none"; resolvedPanel.style.display = "none";
    weeklyPerseveranceChart.style.display = 'block'; // Show weekly chart when going to main page
    perseveranceSection.style.display = "block"; // Show perseverance section when going to main page
    viewArchivedButton.style.display = "inline-block"; viewResolvedButton.style.display = "inline-block";
    backToMainButton.style.display = "none"; hideTargets();
    currentPage = 1;
    loadPerseveranceData(auth.currentUser.uid); // Reload perseverance data when returning to main page
});

document.getElementById("copyDaily").addEventListener("click", function () {
    const dailyTargetsElement = document.getElementById("dailyTargets");
    if (!dailyTargetsElement) { alert("Não foi possível encontrar os alvos diários."); return; }
    const dailyTargetsText = Array.from(dailyTargetsElement.children).map(div => {
        const title = div.querySelector('h3')?.textContent || '';
        const details = div.querySelector('p:nth-of-type(1)')?.textContent || '';
        const timeElapsed = div.querySelector('p:nth-of-type(2)')?.textContent || '';
        const observations = Array.from(div.querySelectorAll('p')).slice(2).map(p => p.textContent).join('\n');
        let result = `${title}\n${details}\n${timeElapsed}`;
        if (observations) result += `\nObservações:\n${observations}`;
        return result;
    }).join('\n\n---\n\n');
    navigator.clipboard.writeText(dailyTargetsText).then(() => {
        alert('Alvos diários copiados!');
    }, (err) => { console.error('Erro ao copiar texto: ', err); alert('Não foi possível copiar.'); });
});

document.getElementById('generateViewButton').addEventListener('click', generateViewHTML);
document.getElementById('viewDaily').addEventListener('click', generateDailyViewHTML);
document.getElementById("viewResolvedViewButton").addEventListener("click", () => {
    dateRangeModal.style.display = "block"; startDateInput.value = ''; endDateInput.value = '';
});

const dateRangeModal = document.getElementById("dateRangeModal");
const closeDateRangeModalButton = document.getElementById("closeDateRangeModal");
const generateResolvedViewButton = document.getElementById("generateResolvedView");
const cancelDateRangeButton = document.getElementById("cancelDateRange");
const startDateInput = document.getElementById("startDate");
const endDateInput = document.getElementById("endDate");

closeDateRangeModalButton.addEventListener("click", () => { dateRangeModal.style.display = "none"; });

generateResolvedViewButton.addEventListener("click", () => {
    const startDate = startDateInput.value;
    const endDate = endDateInput.value;
    const today = new Date();
    const formattedToday = formatDateToISO(today);
    const adjustedEndDate = endDate || formattedToday;
    generateResolvedViewHTML(startDate, adjustedEndDate);
    dateRangeModal.style.display = "none";
});

cancelDateRangeButton.addEventListener("click", () => { dateRangeModal.style.display = "none"; });

// ==== BOTÃO "RELATÓRIO DE PERSEVERANÇA" - EVENT LISTENER ADICIONado ====
document.getElementById("viewReportButton").addEventListener('click', () => {
    window.location.href = 'orei.html'; // Redireciona para a página de relatório
});
// ==== FIM SEÇÃO - EVENT LISTENERS ====

// ==== GERAÇÃO DE VISUALIZAÇÃO (HTML) ====
function generateViewHTML() {
    const verseElement = document.getElementById('dailyVerses');
    const currentVerse = verseElement ? verseElement.textContent : 'Versículo não encontrado.';

    let htmlContent = `<!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width-device-width, initial-scale=1.0">
        <title>Alvos de Oração</title>
        <style>
            body { font-family: 'Playfair Display', serif; margin: 10px; padding: 10px; background-color: #f9f9f9; color: #333; font-size: 16px; }
            h1 { text-align: center; color: #333; margin-bottom: 20px; font-size: 2.5em; }
            h2 { color: #555; font-size: 1.75em; margin-bottom: 10px; }
            div { margin-bottom: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 5px; background-color: #fff; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); }
            p { margin: 5px 0; }
            hr { margin-top: 30px; margin-bottom: 30px; border: 0; border-top: 1px solid #ddd; }
            .verse-container { font-style: italic; text-align: center; margin-bottom: 20px; color: #555; }
            .deadline-tag { background-color: #ffcc00; color: #333; padding: 5px 10px; border-radius: 5px; margin-left: 10px; font-size: 0.8em; }
            .expired { background-color: #ff6666; color: #fff; }
            @media (max-width: 768px) {
                body { font-size: 14px; }
                h1 { font-size: 2em; }
                h2 { font-size: 1.5em; }
            }
        </style>
    </head>
    <body>
        <h1>Alvos de Oração</h1>
        <div class="verse-container">${currentVerse}</div>`;

    if (prayerTargets.length === 0) {
        htmlContent += '<p>Nenhum alvo de oração cadastrado.</p>';
    } else {
        prayerTargets.forEach(target => {
            const formattedDate = formatDateForDisplay(target.date);
            const time = timeElapsed(target.date);
            const deadlineTag = target.hasDeadline ? `<span class="deadline-tag ${isDateExpired(target.deadlineDate) ? 'expired' : ''}">Prazo: ${formatDateForDisplay(target.deadlineDate)}</span>` : '';
            htmlContent += `
            <div>
                <h2>${deadlineTag} ${target.title}</h2>
                <p>${target.details}</p>
                <p><strong>Data de Cadastro:</strong> ${formattedDate}</p>
                <p><strong>Tempo Decorrido:</strong> ${time}</p>
        `;
            if (target.observations && target.observations.length > 0) {
                htmlContent += `<h3>Observações:</h3>`;
                target.observations.forEach(obs => {
                    htmlContent += `<p><strong>${formatDateForDisplay(obs.date)}:</strong> ${obs.observation}</p>`;
                });
            }
            htmlContent += '</div><hr>';
        });
    }

    htmlContent += `</body></html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const now = new Date();
    a.download = `Alvos de oração geral até o dia ${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}.html`;
    a.click();
    URL.revokeObjectURL(url);
}

function generateDailyViewHTML() {
    const verseElement = document.getElementById('dailyVerses');
    const currentVerse = verseElement ? verseElement.textContent : 'Versículo não encontrado.';

    let htmlContent = `<!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width-device-width, initial-scale=1.0">
        <title>Alvos de Oração do Dia</title>
        <style>
            body { font-family: 'Playfair Display', serif; margin: 10px; padding: 10px; background-color: #f9f9f9; color: #333; font-size: 16px;}
            h1 { text-align: center; color: #333; margin-bottom: 20px; font-size: 2.5em; }
            h2 { color: #555; font-size: 1.75em; margin-bottom: 10px; display: inline-block;}
            div { margin-bottom: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 5px; background-color: #fff; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);}
            p { margin: 5px 0; }
            hr { margin-top: 30px; margin-bottom: 30px; border: 0; border-top: 1px solid #ddd;}
            .verse-container { font-style: italic; text-align: center; margin-bottom: 20px; color: #555;}
            .deadline-tag { background-color: #ffcc00; color: #333; padding: 5px 10px; border-radius: 5px; margin-right: 10px; font-size: 0.8em;}
            .title-container { display: flex; align-items: center; justify-content: flex-start; }
            @media (max-width: 768px) {
                body { font-size: 14px; }
                h1 { font-size: 2em; }
                h2 { font-size: 1.5em; }
            }
        </style>
    </head>
    <body>
        <h1>Alvos de Oração do Dia</h1>
        <div class="verse-container">${currentVerse}</div>`;

    const dailyTargetsElement = document.getElementById("dailyTargets");
    if (!dailyTargetsElement || dailyTargetsElement.children.length === 0) {
        htmlContent += '<p>Nenhum alvo de oração do dia disponível.</p>';
    } else {
        Array.from(dailyTargetsElement.children).forEach(div => {
            const deadlineTag = div.querySelector('.deadline-tag')?.outerHTML || '';
            const titleElement = div.querySelector('h3');
            let title = titleElement ? titleElement.textContent.trim() : '';

            const details = div.querySelector('p:nth-of-type(1)')?.textContent || '';
            const timeElapsed = div.querySelector('p:nth-of-type(2)')?.textContent || '';
            const observations = Array.from(div.querySelectorAll('h4 + p'))
                .map(p => p.textContent)
                .join('\n');

            htmlContent += `
            <div>
                <div class="title-container">
                    ${deadlineTag} <h2>${title}</h2>
                </div>
                <p>${details}</p>
                <p>${timeElapsed}</p>
        `;
            if (observations) {
                htmlContent += `<h4>Observações:</h4><p>${observations}</p>`;
            }
            htmlContent += `</div><hr>`;
        });
    }

    htmlContent += `</body></html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const now = new Date();
    a.download = `Alvos de oração do dia ${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}.html`;
    a.click();
    URL.revokeObjectURL(url);
}

function generateResolvedViewHTML(startDate, endDate) {
    const startDateObj = startDate ? new Date(startDate) : null;
    const endDateObj = endDate ? new Date(endDate) : null;

    const filteredResolvedTargets = resolvedTargets.filter(target => {
        if (!target.resolved || !target.archivedDate) return false;

        const resolvedDateObj = new Date(target.archivedDate);

        if (startDateObj && resolvedDateObj < startDateObj) return false;
        if (endDateObj) {
            endDateObj.setHours(23, 59, 59);
            if (resolvedDateObj > endDateObj) return false;
        }

        return true;
    });

    let htmlContent = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Alvos Respondidos</title>
    <style>
        body { font-family: 'Playfair Display', serif; margin: 10px; padding: 10px; background-color: #f9f9f9; color: #333; font-size: 16px; }
        h1 { text-align: center; color: #333; margin-bottom: 20px; font-size: 2.5em; }
        h2 { color: #555; font-size: 1.75em; margin-bottom: 10px; }
        div { margin-bottom: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 5px; background-color: #fff; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); }
        p { margin: 5px 0; }
        hr { margin-top: 30px; margin-bottom: 30px; border: 0; border-top: 1px solid #ddd; }
        @media (max-width: 768px) {
            body { font-size: 14px; }
            h1 { font-size: 2em; }
            h2 { font-size: 1.5em; }
        }
    </style>
</head>
<body>
<h1>Alvos Respondidos</h1>`;

    if (filteredResolvedTargets.length === 0) {
        htmlContent += '<p>Nenhum alvo respondido encontrado para o período selecionado.</p>';
    } else {
        filteredResolvedTargets.forEach(target => {
            const formattedDate = formatDateForDisplay(target.date);
            const formattedArchivedDate = formatDateForDisplay(target.archivedDate); // Formata a data de resolução
            htmlContent += `
            <div>
                <h2>${target.title}</h2>
                <p>${target.details}</p>
                <p><strong>Data Original:</strong> ${formattedDate}</p>
                <p><strong>Data de Resolução:</strong> ${formattedArchivedDate}</p>
            </div><hr>
        `;
        });
    }

    htmlContent += `</body></html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const now = new Date();
    const filename = `Alvos Respondidos - ${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}.html`;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
// ==== FIM SEÇÃO - GERAÇÃO DE VISUALIZAÇÃO (HTML) ====

// ==== INÍCIO SEÇÃO - FUNÇÕES DE BUSCA ====
function filterTargets(targets, searchTerm) {
    if (!searchTerm) return targets;
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    return targets.filter(target =>
        target.title.toLowerCase().includes(lowerCaseSearchTerm) ||
        target.details.toLowerCase().includes(lowerCaseSearchTerm) ||
        (target.observations && target.observations.some(obs => obs.observation.toLowerCase().includes(lowerCaseSearchTerm)))
    );
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
// ==== FIM SEÇÃO - FUNÇÕES DE BUSCA ====

// ==== INÍCIO SEÇÃO - VERSÍCULOS BÍBLICOS ====
const verses = [
    "Mateus 7:7-8: “Peçam, e será dado a vocês; busquem, e encontrarão; batam, e a porta será aberta a vocês. Pois todo o que pede recebe; o que busca encontra; e àquele que bate, a porta será aberta.”",
    "Marcos 11:24: \"Portanto, eu digo a vocês, tudo o que pedirem em oração, creiam que já o receberam, e será de vocês.\"",
    "João 14:13-14: “E eu farei o que vocês pedirem em meu nome, para que o Pai seja glorificado no Filho. O que vocês pedirem em meu nome, eu farei.”",
    "Filipenses 4:6-7: “Não se preocupem com nada, mas em todas as situações, pela oração e petição, com ação de graças, apresentem seus pedidos a Deus. E a paz de Deus, que excede todo o entendimento, guardará os seus corações e as suas mentes em Cristo Jesus.”",
    "1 Tessalonicenses 5:16-18: “Alegrem-se sempre, orem continuamente, deem graças em todas as circunstâncias; pois esta é a vontade de Deus para vocês em Cristo Jesus.”",
    "Tiago 5:13-16: “Há alguém entre vocês que está em apuros? Que ele ore. Há alguém feliz? Que ele cante louvores. Há alguém entre vocês que está doente? Que ele chame os presbíteros da igreja para orar por ele e ungi-lo com óleo em nome do Senhor. E a oração oferecida com fé fará o doente ficar bom; o Senhor o levantará. Se ele pecou, ele será perdoado. Portanto, confessem seus pecados uns aos outros e orem uns pelos outros para que vocês possam ser curados. A oração de um justo é poderosa e eficaz.”",
    "1 João 5:14-15: “Esta é a confiança que temos ao nos aproximarmos de Deus: que se pedirmos qualquer coisa de acordo com a sua vontade, ele nos ouve. E se sabemos que ele nos ouve — tudo o que pedimos — sabemos que temos o que lhe pedimos.”",
    "Efésios 6:18: \"Orem no Espírito em todas as ocasiões com todo tipo de orações e pedidos. Com isso em mente, estejam alertas e sempre continuem a orar por todo o povo do Senhor.\"",
    "1 Timóteo 2:1-2: \"Eu exorto, então, antes de tudo, que petições, orações, intercessões e ações de graças sejam feitas para todos os povos, para reis e todos aqueles em autoridade, para que possamos viver vidas pacíficas e tranquilas em toda a piedade e santidade.\"",
    "2 Crônicas 7:14: “Se o meu povo, que se chama pelo meu nome, se humilhar, e orar, e buscar a minha face, e se desviar dos seus maus caminhos, então ouvirei dos céus, perdoarei os seus pecados, e sararei a sua terra.”",
    "Salmos 34:17: “Os justos clamam, o Senhor os ouve, e os livra de todas as suas angústias.”",
    "Jeremias 33:3: “Clama a mim, e responder-te-ei, e anunciar-te-ei coisas grandes e firmes que não sabes.”",
    "Salmos 145:18-19: “Perto está o Senhor de todos os que o invocam, de todos os que o invocam em verdade. Ele cumprirá o desejo dos que o temem; ouvirá o seu clamor, e os salvará.”",
    "Daniel 9:18: “Inclina, ó Deus meu, os ouvidos, e ouve; abre os olhos, e olha para a nossa desolação, e para a cidade que é chamada pelo teu nome; porque não lançamos as nossas súplicas perante a tua face confiados em nossas justiças, mas em tuas muitas misericórdias.”",
    "Provérbios 15:29: “O Senhor está longe dos perversos, mas ouve a oração dos justos.”",
    "1 Reis 18:37: “Responde-me, Senhor, responde-me, para que este povo saiba que tu, Senhor, és Deus, e que tu fizeste o coração deles voltar para ti.”",
    "Isaías 65:24: “E será que antes que clamem, eu responderei; estando eles ainda falando, eu os ouvirei.”"
];
function displayRandomVerse() {
    const randomIndex = Math.floor(Math.random() * verses.length);
    const verseElement = document.getElementById('dailyVerses');
    verseElement.textContent = verses[randomIndex];
}
// ==== FIM SEÇÃO - VERSÍCULOS BÍBLICOS ====

// ==== INÍCIO SEÇÃO - FUNCIONALIDADE DO BOTÃO "OREI!" ====
function addPrayButtonFunctionality(dailyDiv, targetIndex) {
    const prayButton = document.createElement("button");
    prayButton.textContent = "Orei!";
    prayButton.classList.add("pray-button");
    prayButton.onclick = async () => {
        const targetId = dailyDiv.dataset.targetId;
        const userId = auth.currentUser ? auth.currentUser.uid : null;

        const db = getFirestore(app);
        const clickCountsRef = doc(db, "prayerClickCounts", targetId);

        try {
            const docSnap = await getDoc(clickCountsRef);

            const now = new Date();
            const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const year = now.getFullYear().toString();

            // CORREÇÃO AQUI: Usar chaves dinâmicas CORRETAMENTE:
            const updateData = {
                targetId: targetId,
                userId: userId,
                totalClicks: increment(1),
                monthlyClicks: { [yearMonth]: increment(1) },  // <--- CORRIGIDO!
                yearlyClicks: { [year]: increment(1) }        // <--- CORRIGIDO!
            };


            if (docSnap.exists()) {
                // Documento existe: usar updateDoc com NOTAÇÃO DE PONTO
                await updateDoc(clickCountsRef, {
                    totalClicks: increment(1),
                    [`monthlyClicks.${yearMonth}`]: increment(1), // CORRETO!
                    [`yearlyClicks.${year}`]: increment(1),     // CORRETO!
                    userId: userId // SEMPRE atualiza o userId (boa prática)
                });
            } else {
                // Documento não existe: usar setDoc com merge: true
                await setDoc(clickCountsRef, {
                    targetId: targetId,
                    userId: userId,
                    totalClicks: increment(1),
                    monthlyClicks: { [yearMonth]: 1 }, // Cria com valor inicial 1
                    yearlyClicks: { [year]: 1 }       // Cria com valor inicial 1
                }, { merge: true }); // IMPORTANTE: merge: true
            }

            dailyDiv.remove();
            checkIfAllPrayersDone();
        } catch (error) {
            console.error("Erro ao registrar clique:", error);
            alert("Erro ao registrar clique. Verifique o console.");
        }
    };
    dailyDiv.insertBefore(prayButton, dailyDiv.firstChild);
}

function checkIfAllPrayersDone() {
    const dailyTargets = document.getElementById("dailyTargets");
    if (dailyTargets.children.length === 0) {
        displayCompletionPopup();
    }
}

function displayCompletionPopup() {
    const popup = document.getElementById('completionPopup');
    popup.style.display = 'block';
}

// Adicionando o event listener para fechar o popup
document.getElementById('closePopup').addEventListener('click', () => {
    document.getElementById('completionPopup').style.display = 'none';
});
// ==== FIM SEÇÃO - FUNCIONALIDADE DO BOTÃO "OREI!" ====

// ==== INÍCIO SEÇAO - GERAR RELATÓRIO ====

async function generateReport() {
    const db = getFirestore(app);
	const userId = auth.currentUser ? auth.currentUser.uid : null; //Obtem o id do usuário logado
     if (!userId) {
        alert("Usuário não autenticado. Relatório não pode ser gerado.");
        return;
    }
    const clickCountsRef = collection(db, "prayerClickCounts");
    const q = query(clickCountsRef, where("userId", "==", userId)); //Filtra por userId
    const snapshot = await getDocs(q); //Usa a query 'q'


    if (snapshot.empty) {
        alert("Nenhum dado de clique encontrado.");
        return;
    }

    let report = "Relatório de Cliques no Botão 'Orei!':\n\n";

    snapshot.forEach((doc) => {
        const data = doc.data();
        const targetId = doc.id; // ou data.targetId, dependendo da sua escolha
        const target = prayerTargets.find(t => t.id === targetId);  // Busca o alvo na lista local
        const title = target ? target.title : `Alvo ID: ${targetId}`; // Título ou ID

        report += `Alvo: ${title}\n`;
        report += `  Total de cliques: ${data.totalClicks}\n`;
        report += `  Cliques por Mês:\n`;
        for (const yearMonth in data.monthlyClicks) {
            report += `    ${yearMonth}: ${data.monthlyClicks[yearMonth]}\n`;
        }

            report += `  Cliques por Ano:\n`;
        for (const year in data.yearlyClicks) {
            report += `    ${year}: ${data.yearlyClicks[year]}\n`;
        }

        report += "\n";
    });


    displayReportModal(report); //Chama a função do modal
}

function displayReportModal(reportText){
    const modal = document.createElement('div');
    modal.classList.add('modal');
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close-button" id="closeReportModal">×</span>
            <h2>Relatório de Cliques</h2>
            <pre>${reportText}</pre>
        </div>
    `;
    document.body.appendChild(modal);
    modal.style.display = 'block';

    document.getElementById('closeReportModal').addEventListener('click', () => {
        modal.remove();
    });
}

// ==== FIM SEÇAO - GERAR RELATÓRIO ====

// Atualizar os alvos diários
function refreshDailyTargets() {
    const dailyTargets = document.getElementById("dailyTargets");
    dailyTargets.innerHTML = "";
    const dailyTargetsCount = Math.min(prayerTargets.length, 10); // Mostrar até 10 alvos

    // Filtrar alvos que não foram exibidos recentemente
    let availableTargets = prayerTargets.filter(target => !lastDisplayedTargets.includes(target));

   // Se todos os alvos foram exibidos, reseta o histórico
    if (availableTargets.length === 0) {
        lastDisplayedTargets = [];
        availableTargets = prayerTargets.slice(); // Cria uma cópia da array para evitar modificação direta
    }

    // Seleciona aleatoriamente os alvos
    const shuffledTargets = availableTargets.sort(() => 0.5 - Math.random());
    const selectedTargets = shuffledTargets.slice(0, dailyTargetsCount);

    // Atualizar o histórico de exibição
    lastDisplayedTargets = [...lastDisplayedTargets, ...selectedTargets].slice(-prayerTargets.length);

    selectedTargets.forEach((target, index) => {
        const dailyDiv = document.createElement("div");
        dailyDiv.classList.add("target");
        dailyDiv.dataset.targetId = target.id; // ADICIONA O DATA-TARGET-ID

             // Construindo o HTML para incluir título, detalhes e tempo decorrido, sem a tag de prazo no título
        const deadlineTag = target.hasDeadline ? `<span class="deadline-tag ${isDateExpired(target.deadlineDate) ? 'expired' : ''}">Prazo: ${formatDateForDisplay(target.deadlineDate)}</span>` : '';
        let contentHTML = `
            <h3>${deadlineTag} ${target.title}</h3>
            <p>${target.details}</p> <!-- Inclui os detalhes (observações originais) -->
            <p><strong>Tempo Decorrido:</strong> ${timeElapsed(target.date)}</p>
        `;

        dailyDiv.innerHTML = contentHTML;
        dailyDiv.innerHTML += renderObservations(target.observations, false); // Use renderObservations here! Observations collapsed by default in daily view
        dailyTargets.appendChild(dailyDiv);

        // Adicionar funcionalidade ao botão "Orei!"
        addPrayButtonFunctionality(dailyDiv, index);
    });

    // Exibir versículo aleatório
    displayRandomVerse();
}

async function editDeadline(targetId) {
    const target = prayerTargets.find(t => t.id === targetId);
    if (!target) { console.error("Alvo não encontrado."); return; }

    const currentDeadline = target.deadlineDate ? formatDateForDisplay(target.deadlineDate) : '';
    const newDeadline = prompt("Insira a nova data de prazo de validade (DD/MM/YYYY):", currentDeadline);

    if (newDeadline === null) return;

    if (!isValidDate(newDeadline)) {
        alert("Data inválida. Por favor, use o formato DD/MM/YYYY.");
        return;
    }

    try {
        const user = auth.currentUser;
        if (user) {
            const targetRef = doc(db, "users", user.uid, "prayerTargets", targetId);
            await updateDoc(targetRef, { deadlineDate: convertToISO(newDeadline) });
            await fetchPrayerTargets(user.uid); // Refresh targets from Firestore
            renderTargets();
            alert(`Prazo de validade do alvo "${target.title}" atualizado para ${newDeadline}.`);
        } else {
            alert("Usuário não autenticado.");
        }
    } catch (error) {
        console.error("Erro ao editar prazo no Firestore: ", error);
        alert("Erro ao editar prazo. Verifique o console.");
    }
}


function isValidDate(dateString) {
    const parts = dateString.split('/');
    if (parts.length !== 3) return false;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return false;
    if (month < 1 || month > 12) return false;
    const daysInMonth = new Date(year, month, 0).getDate();
    if (day < 1 || day > daysInMonth) return false;
    return true;
}

function convertToISO(dateString) {
    const parts = dateString.split('/');
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
}

function hideTargets(){
   const targetList = document.getElementById("targetList");
    targetList.innerHTML = "";
}

function checkExpiredDeadlines() {
    const expiredTargets = prayerTargets.filter(target => target.hasDeadline && isDateExpired(target.deadlineDate));
    if (expiredTargets.length > 0) {
        alert('Os seguintes alvos estão com prazo de validade vencido:\n' + expiredTargets.map(target => `- ${target.title}\n`).join(''));
    }
}

// ==== INÍCIO SEÇÃO - BARRA DE PROGRESSO PERSEVERANÇA ====

async function loadPerseveranceData(userId) {
    const perseveranceRef = doc(db, "perseverance", userId);
    const docSnap = await getDoc(perseveranceRef);

    let today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize today's date
    console.log("loadPerseveranceData: Today (normalized):", today); // LOGGING

    let yesterday = new Date(today); // Get today's date
    yesterday.setDate(yesterday.getDate() - 1); // Subtract one day to get yesterday
    yesterday.setHours(0, 0, 0, 0); // Normalize yesterday's date as well
    console.log("loadPerseveranceData: Yesterday (normalized):", yesterday); // LOGGING


    if (docSnap.exists()) {
        perseveranceData = docSnap.data();
        console.log("loadPerseveranceData: Data from Firestore:", perseveranceData); // LOGGING
        if (perseveranceData.lastInteractionDate) {
            let lastInteractionDate = new Date(perseveranceData.lastInteractionDate.toDate()); // Convert Firestore Timestamp to Date
            lastInteractionDate.setHours(0, 0, 0, 0); // Normalize last interaction date
            console.log("loadPerseveranceData: Last Interaction Date (normalized):", lastInteractionDate); // LOGGING

            if (lastInteractionDate.getTime() < yesterday.getTime()) { // Check if last interaction was BEFORE yesterday
                console.log("loadPerseveranceData: Resetting consecutive days - Last interaction before yesterday"); // LOGGING
                perseveranceData.consecutiveDays = 0; // Reset if last interaction was before yesterday
                perseveranceData.lastInteractionDate = null;
                await updatePerseveranceFirestore(userId, perseveranceData); // Update Firestore with reset
            } else {
                console.log("loadPerseveranceData: Keeping consecutive days - Last interaction is yesterday or today"); // LOGGING
            }
        } else {
            console.log("loadPerseveranceData: No lastInteractionDate in Firestore data"); // LOGGING
        }
    } else {
        console.log("loadPerseveranceData: No perseverance document found, initializing data"); // LOGGING
        // Initialize data for new user
        perseveranceData = { userId: userId, consecutiveDays: 0, lastInteractionDate: null, recordDays: 0 };
        await setDoc(perseveranceRef, perseveranceData); // Create new document
    }
    updatePerseveranceUI();
}

async function confirmPerseverance() {
    if (!auth.currentUser) {
        alert("Usuário não autenticado.");
        return;
    }
    const userId = auth.currentUser.uid;
    let today = new Date();
    today.setHours(0, 0, 0, 0);
    console.log("confirmPerseverance: Today (normalized):", today); // LOGGING

    if (perseveranceData.lastInteractionDate) {
        let lastInteractionDate = new Date(perseveranceData.lastInteractionDate.toDate());
        lastInteractionDate.setHours(0, 0, 0, 0);
        console.log("confirmPerseverance: Last Interaction Date (normalized):", lastInteractionDate); // LOGGING

        if (lastInteractionDate.getTime() === today.getTime()) {
            alert("Perseverança já confirmada para hoje!"); // Prevent double click for the same day
            console.log("confirmPerseverance: Already confirmed today"); // LOGGING
            return;
        }
    }

    perseveranceData.consecutiveDays++;
    perseveranceData.lastInteractionDate = today;
    if (perseveranceData.consecutiveDays > perseveranceData.recordDays) {
        perseveranceData.recordDays = perseveranceData.consecutiveDays;
    }

    await updatePerseveranceFirestore(userId, perseveranceData);
    updatePerseveranceUI();
    console.log("confirmPerseverance: Perseverance confirmed, updated data:", perseveranceData); // LOGGING
}


async function updatePerseveranceFirestore(userId, data) {
    const perseveranceRef = doc(db, "perseverance", userId);
    await setDoc(perseveranceRef, data);
}

function updatePerseveranceUI() {
    const progressBar = document.getElementById('perseveranceProgressBar');
    const percentageDisplay = document.getElementById('perseverancePercentage');
    const percentage = Math.min((perseveranceData.consecutiveDays / 30) * 100, 100); // Cap at 100% for UI - BASED ON 30 DAYS NOW

    progressBar.style.width = `${percentage}%`;
    percentageDisplay.textContent = `${Math.floor(percentage)}%`;

    // ==== INÍCIO - Lógica para o Quadro de Dias da Semana ====
    const weeklyChart = document.getElementById('weeklyPerseveranceChart');
    if (perseveranceData && perseveranceData.consecutiveDays > 0) {
        weeklyChart.style.display = 'block'; // Mostrar o quadro se houver perseverança
    } else {
        weeklyChart.style.display = 'none';  // Ocultar se perseverança zerada
    }

    const today = new Date();
    const currentDayOfWeek = today.getDay(); // 0 (Domingo) a 6 (Sábado)

    for (let i = 0; i < 7; i++) {
        const dayTickElement = document.getElementById(`day-${i}`);
        dayTickElement.classList.remove('active'); // Resetar o estado para todos os dias
    }

    for (let i = 0; i < perseveranceData.consecutiveDays && i < 7; i++) {
        const dayIndex = (currentDayOfWeek - i + 7) % 7; // Calcular o índice do dia retroativamente
        const dayTickElement = document.getElementById(`day-${dayIndex}`);
        dayTickElement.classList.add('active'); // Ativar o "tick" para os dias de perseverança
    }
    // ==== FIM - Lógica para o Quadro de Dias da Semana ====
}

function resetPerseveranceUI() {
    const progressBar = document.getElementById('perseveranceProgressBar');
    const percentageDisplay = document.getElementById('perseverancePercentage');

    progressBar.style.width = `0%`;
    percentageDisplay.textContent = `0%`;

    // Reset weekly chart visual state here as well if needed, for example:
    const weeklyChart = document.getElementById('weeklyPerseveranceChart');
    weeklyChart.style.display = 'none'; // Hide the chart when reset
    for (let i = 0; i < 7; i++) {
        const dayTickElement = document.getElementById(`day-${i}`);
        dayTickElement.classList.remove('active');
    }
}


// ==== FIM SEÇÃO - BARRA DE PROGRESSO PERSEVERANÇA ====
