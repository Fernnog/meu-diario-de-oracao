import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-analytics.js';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js'; // Import GoogleAuthProvider and signInWithPopup, REMOVE email/password methods
import { getFirestore, collection, doc, getDocs, query, where, getDoc, Timestamp } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyA-j6VX_hZHLcVrW6-KMXf2BvHelyq3yGU",
  authDomain: "alvos-de-oracao.firebaseapp.com",
  projectId: "alvos-de-oracao",
  storageBucket: "alvos-de-oracao.firebasestorage.app",
  messagingSenderId: "303318178934",
  appId: "1:303318178934:web:19ff045c501b5907435357",
  measurementId: "G-RCDW5SR4LZ"
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
const targetsPerPage = 10; // Defina quantos alvos por página

// ==== FUNÇÕES UTILITÁRIAS (Reaproveitando formatDateForDisplay de script.js para consistência) ====
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
    if (dateString instanceof Timestamp) { // Handle Firebase Timestamp
        dateString = dateString.toDate(); // Convert Timestamp to Date object for formatting
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
        // User signed in with Google!
        const user = userCredential.user;
        loadReportData(user.uid); // Load data for the logged-in user
    } catch (error) {
        console.error("Erro ao entrar com o Google:", error);
        alert("Erro ao entrar com o Google: " + error.message);
    }
}
// ==== END GOOGLE SIGN-IN FUNCTION ====

// ==== UI UPDATE FOR AUTHENTICATION STATE ====
function updateAuthUI(user) {
    const btnGoogleLogin = document.getElementById('btnGoogleLoginReport'); // Google Login button in report page
    const btnLogout = document.getElementById('btnLogoutReport'); // Logout button in report page
    const authStatus = document.getElementById('authStatusReport'); // Auth status display in report page
    const authStatusContainer = document.querySelector('.auth-status-container-report'); // Auth status container in report page


    if (user) {
        authStatus.textContent = "Usuário autenticado: " + user.email + " (via Google)";
        authStatusContainer.style.display = 'flex'; // Show auth status container
        btnLogout.style.display = 'inline-block'; // Show logout button
        btnGoogleLogin.style.display = 'none'; // Hide Google Login button after login

    } else {
        authStatus.textContent = "Nenhum usuário autenticado";
        authStatusContainer.style.display = 'block'; // Ensure container is visible
        btnLogout.style.display = 'none'; // Hide logout button
        btnGoogleLogin.style.display = 'inline-block'; // Show Google Login button for login
    }
}
// ==== END UI UPDATE FOR AUTHENTICATION STATE ====


async function loadReportData(userId) {
    currentUserId = userId;
    await fetchPrayerTargets(userId);
    await fetchArchivedTargets(userId);
    await fetchClickCounts(userId);
    mergeTargetsAndClicks();
    renderReport(); // Renderiza a página inicial
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


    // Paginação: Calcular índices e fatiar o array
    const startIndex = (currentPage - 1) * targetsPerPage;
    const endIndex = startIndex + targetsPerPage;
    const targetsToDisplay = filteredTargets.slice(startIndex, endIndex);


    if (targetsToDisplay.length === 0) {
        reportList.innerHTML = '<p>Nenhum alvo encontrado.</p>';
        renderPagination(); // Renderiza a paginação mesmo sem alvos (para mostrar "Página 1")
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

    renderPagination(); // Renderiza a paginação
}


// Função para renderizar a paginação
function renderPagination() {
    const paginationContainer = document.getElementById('pagination');
    paginationContainer.innerHTML = ''; // Limpa a paginação anterior

    const totalPages = Math.ceil(filteredTargets.length / targetsPerPage);

    if (totalPages <= 1) {
        return; // Não mostra paginação se tiver apenas uma página
    }

    for (let i = 1; i <= totalPages; i++) {
        const pageLink = document.createElement('a');
        pageLink.href = '#';
        pageLink.textContent = i;
        pageLink.classList.add('page-link');
        if (i === currentPage) {
            pageLink.classList.add('active'); // Adiciona classe para a página atual
        }

        pageLink.addEventListener('click', (event) => {
            event.preventDefault();
            currentPage = i;
            renderReport(); // Re-renderiza o relatório com a nova página
        });

        paginationContainer.appendChild(pageLink);
    }
}


// Event listeners (mantidos e corrigidos)
document.getElementById('searchReport').addEventListener('input', (event) => {
    currentSearchTermReport = event.target.value;
     currentPage = 1; // Reseta para a primeira página ao pesquisar
    renderReport();
});

document.getElementById('filterAtivo').addEventListener('change', () => {
    currentPage = 1; // Reseta para a primeira página ao mudar filtros
    renderReport();
});
document.getElementById('filterArquivado').addEventListener('change', () => {
     currentPage = 1;// Reseta para a primeira página ao mudar filtros
    renderReport();
});
document.getElementById('filterRespondido').addEventListener('change', () => {
    currentPage = 1;// Reseta para a primeira página ao mudar filtros
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

// ==== GOOGLE LOGIN BUTTON EVENT LISTENER ====
document.getElementById('btnGoogleLoginReport').addEventListener('click', signInWithGoogle);

// ==== LOGOUT BUTTON EVENT LISTENER ====
document.getElementById('btnLogoutReport').addEventListener('click', async () => {
    try {
        await signOut(auth);
        updateAuthUI(null); // Update UI to logged out state
        renderReport(); // Re-render the report (or clear it)
    } catch (error) {
        console.error("Erro ao sair:", error);
        alert("Erro ao sair.");
    }
});


window.onload = () => {
    onAuthStateChanged(auth, (user) => {
        updateAuthUI(user); // Update auth UI on page load
        if (user) {
            console.log("Usuário autenticado em orei.js:", user.uid); // ADICIONE ESTA LINHA
            loadReportData(user.uid);
        } else {
            console.log("Usuário não autenticado em orei.js"); // ADICIONE ESTA LINHA
            // User is not logged in, decide what to show.
            // For example, show a message or redirect to login page.
            // For now, let's just clear the report data.
            prayerTargets = [];
            archivedTargets = [];
            allTargets = [];
            filteredTargets = [];
            renderReport(); // Renderiza um relatório vazio ou mensagem de login
        }
    });
};