import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-analytics.js';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';
import { getFirestore, collection, doc, getDocs, query, where, getDoc, Timestamp } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';

// Your web app's Firebase configuration
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

let prayerTargets = [];
let archivedTargets = [];
let clickCountsData = {};
let currentUserId = null;
let allTargets = [];
let filteredTargets = [];
let currentSearchTermReport = '';

// Variáveis para paginação
let currentPage = 1;
const targetsPerPage = 10;

// ==== FUNÇÕES UTILITÁRIAS ====
function formatDateToISO(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDateForDisplay(dateString) {
    if (dateString instanceof Date) {
        dateString = dateString;
    }
    if (dateString instanceof Timestamp) {
        dateString = dateString.toDate();
    }
    if (!dateString || dateString.includes('NaN')) return 'Data Inválida';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Data Inválida';
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}
// ==== FIM FUNÇÕES UTILITÁRIAS ====

// ==== GOOGLE SIGN-IN FUNCTION ====
async function signInWithGoogle() {
    const provider = new GoogleAuthProvider();
    try {
        const userCredential = await signInWithPopup(auth, provider);
        const user = userCredential.user;
        loadReportData(user.uid);
    } catch (error) {
        console.error("Erro ao entrar com o Google:", error);
        alert("Erro ao entrar com o Google: " + error.message);
    }
}
// ==== END GOOGLE SIGN-IN FUNCTION ====

// ==== UI UPDATE FOR AUTHENTICATION STATE ====
function updateAuthUI(user) {
    const btnGoogleLogin = document.getElementById('btnGoogleLoginReport');
    const btnLogout = document.getElementById('btnLogoutReport');
    const authStatus = document.getElementById('authStatusReport');
    const authStatusContainer = document.querySelector('.auth-status-container-report');

    if (user) {
        authStatus.textContent = "Usuário autenticado: " + user.email + " (via Google)";
        authStatusContainer.style.display = 'flex';
        btnLogout.style.display = 'inline-block';
        btnGoogleLogin.style.display = 'none';
    } else {
        authStatus.textContent = "Nenhum usuário autenticado";
        authStatusContainer.style.display = 'block';
        btnLogout.style.display = 'none';
        btnGoogleLogin.style.display = 'inline-block';
    }
}
// ==== END UI UPDATE FOR AUTHENTICATION STATE ====

async function loadReportData(userId) {
    currentUserId = userId;
    await fetchPrayerTargets(userId);
    await fetchArchivedTargets(userId);
    await fetchClickCounts(userId);
    mergeTargetsAndClicks();
    renderReport();
}

async function fetchPrayerTargets(userId) {
    prayerTargets = [];
    const targetsRef = collection(db, "users", userId, "prayerTargets");
    const targetsSnapshot = await getDocs(targetsRef);
    console.log("fetchPrayerTargets - userId:", userId); // ADICIONE ESTA LINHA
    targetsSnapshot.forEach((doc) => {
        prayerTargets.push({ ...doc.data(), id: doc.id, status: 'Ativo' });
    });
    console.log("fetchPrayerTargets - prayerTargets:", prayerTargets); // ADICIONE ESTA LINHA
}

async function fetchArchivedTargets(userId) {
    archivedTargets = [];
    const archivedRef = collection(db, "users", userId, "archivedTargets");
    const archivedSnapshot = await getDocs(archivedRef);
    console.log("fetchArchivedTargets - userId:", userId); // ADICIONE ESTA LINHA
    archivedSnapshot.forEach((doc) => {
        archivedTargets.push({ ...doc.data(), id: doc.id, status: doc.data().resolved ? 'Respondido' : 'Arquivado' });
    });
    console.log("fetchArchivedTargets - archivedTargets:", archivedTargets); // ADICIONE ESTA LINHA
}

async function fetchClickCounts(userId) {
    clickCountsData = {};
    const clickCountsRef = collection(db, "prayerClickCounts");
    const q = query(clickCountsRef, where("userId", "==", userId));
    const snapshot = await getDocs(q);
    console.log("fetchClickCounts - userId:", userId); // ADICIONE ESTA LINHA
    snapshot.forEach((doc) => {
        clickCountsData[doc.data().targetId] = doc.data();
    });
    console.log("fetchClickCounts - clickCountsData:", clickCountsData); // ADICIONE ESTA LINHA
}

function mergeTargetsAndClicks() {
    allTargets = [...prayerTargets, ...archivedTargets];
    console.log("mergeTargetsAndClicks - allTargets:", allTargets); // ADICIONE ESTA LINHA
}

function renderReport() {
    const reportList = document.getElementById('reportList');
    reportList.innerHTML = '';
    console.log("renderReport - allTargets antes da filtragem:", allTargets); // ADICIONE ESTA LINHA

    const searchTerm = currentSearchTermReport.toLowerCase();
    const filterAtivo = document.getElementById('filterAtivo').checked;
    const filterArquivado = document.getElementById('filterArquivado').checked;
    const filterRespondido = document.getElementById('filterRespondido').checked;

    filteredTargets = allTargets.filter(target => {
        const textMatch = target.title.toLowerCase().includes(searchTerm) ||
                           target.details.toLowerCase().includes(searchTerm);
        const statusMatches = (filterAtivo && target.status === 'Ativo') ||
                              (filterArquivado && target.status === 'Arquivado') ||
                              (filterRespondido && target.status === 'Respondido');
        return textMatch && statusMatches;
    });
    console.log("renderReport - filteredTargets após a filtragem:", filteredTargets); // ADICIONE ESTA LINHA

    const startIndex = (currentPage - 1) * targetsPerPage;
    const endIndex = startIndex + targetsPerPage;
    const targetsToDisplay = filteredTargets.slice(startIndex, endIndex);

    if (targetsToDisplay.length === 0) {
        reportList.innerHTML = '<p>Nenhum alvo encontrado.</p>';
        renderPagination();
        return;
    }

    targetsToDisplay.forEach(target => {
        const targetClickData = clickCountsData[target.id] || { totalClicks: 0, monthlyClicks: {}, yearlyClicks: {} };
        const totalClicks = targetClickData.totalClicks || 0;

        const now = new Date();
        const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const currentYear = now.getFullYear().toString();

        const monthlyClicks = targetClickData.monthlyClicks?.[currentYearMonth] || 0;
        const yearlyClicks = targetClickData.yearlyClicks?.[currentYear] || 0;

        const reportItemDiv = document.createElement('div');
        reportItemDiv.classList.add('report-item');
        reportItemDiv.innerHTML = `
            <h3>${target.title}</h3>
            <p><strong>Status:</strong> ${target.status}</p>
            <p><strong>Total de Orações:</strong> ${totalClicks}</p>
            <p><strong>Orações no Mês Corrente:</strong> ${monthlyClicks}</p>
            <p><strong>Orações no Ano Corrente:</strong> ${yearlyClicks}</p>
        `;
        reportList.appendChild(reportItemDiv);
    });

    renderPagination();
}

function renderPagination() {
    const paginationContainer = document.getElementById('pagination');
    paginationContainer.innerHTML = '';

    const totalPages = Math.ceil(filteredTargets.length / targetsPerPage);

    if (totalPages <= 1) {
        return;
    }

    for (let i = 1; i <= totalPages; i++) {
        const pageLink = document.createElement('a');
        pageLink.href = '#';
        pageLink.textContent = i;
        pageLink.classList.add('page-link');
        if (i === currentPage) {
            pageLink.classList.add('active');
        }

        pageLink.addEventListener('click', (event) => {
            event.preventDefault();
            currentPage = i;
            renderReport();
        });

        paginationContainer.appendChild(pageLink);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, (user) => {
        updateAuthUI(user);
        if (user) {
            console.log("Usuário autenticado em orei.js:", user.uid);
            loadReportData(user.uid);
        } else {
            console.log("Usuário não autenticado em orei.js");
            prayerTargets = [];
            archivedTargets = [];
            allTargets = [];
            filteredTargets = [];
            renderReport();
        }
    });

    document.getElementById('searchReport').addEventListener('input', (event) => {
        currentSearchTermReport = event.target.value;
        currentPage = 1;
        renderReport();
    });

    document.getElementById('filterAtivo').addEventListener('change', () => {
        currentPage = 1;
        renderReport();
    });
    document.getElementById('filterArquivado').addEventListener('change', () => {
        currentPage = 1;
        renderReport();
    });
    document.getElementById('filterRespondido').addEventListener('change', () => {
        currentPage = 1;
        renderReport();
    });

    document.getElementById('backToMainButton').addEventListener('click', () => {
        window.location.href = 'index.html';
    });

    document.getElementById('viewAllTargetsButton').addEventListener('click', () => {
        window.location.href = 'index.html#mainPanel';
    });

    document.getElementById('viewArchivedButton').addEventListener('click', () => {
        window.location.href = 'index.html#archivedPanel';
    });

    document.getElementById('viewResolvedButton').addEventListener('click', () => {
        window.location.href = 'index.html#resolvedPanel';
    });

    document.getElementById('btnGoogleLoginReport').addEventListener('click', signInWithGoogle);

    document.getElementById('btnLogoutReport').addEventListener('click', async () => {
        try {
            await signOut(auth);
            updateAuthUI(null);
            renderReport();
        } catch (error) {
            console.error("Erro ao sair:", error);
            alert("Erro ao sair.");
        }
    });
});
