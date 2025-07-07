import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-analytics.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getFirestore, collection, doc, getDocs, query, orderBy, where, Timestamp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);

// === Variáveis Globais ===
let currentReportPage = 1;
const itemsPerPage = 10;
let allTargetsForReport = [];
let filteredTargetsForReport = [];

// =============================================
// === Funções Utilitárias ===
// =============================================
function formatDateForDisplay(dateInput) {
    if (!dateInput) return 'Data Inválida';
    let dateToFormat;
    if (dateInput instanceof Timestamp) dateToFormat = dateInput.toDate();
    else if (dateInput instanceof Date && !isNaN(dateInput)) dateToFormat = dateInput;
    else {
        dateToFormat = new Date(dateInput);
        if (isNaN(dateToFormat.getTime())) return 'Data Inválida';
    }
    const day = String(dateToFormat.getUTCDate()).padStart(2, '0');
    const month = String(dateToFormat.getUTCMonth() + 1).padStart(2, '0');
    const year = dateToFormat.getUTCFullYear();
    return `${day}/${month}/${year}`;
}

function timeElapsed(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) return 'Data Inválida';
    const now = new Date();
    let diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
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

function rehydrateTargets(targets) {
     return targets.map((target) => {
        const rehydratedTarget = { ...target };
        const fieldsToConvert = ['date', 'deadlineDate', 'lastPresentedDate', 'resolutionDate', 'archivedDate'];
        fieldsToConvert.forEach(field => {
            if (rehydratedTarget[field] instanceof Timestamp) {
                rehydratedTarget[field] = rehydratedTarget[field].toDate();
            }
        });
        return rehydratedTarget;
    });
}
// =============================================
// === FIM Funções Utilitárias ===
// =============================================

// === Lógica de Autenticação ===
function updateAuthUIReport(user) {
    const authStatus = document.getElementById('authStatusReport');
    const btnLogout = document.getElementById('btnLogoutReport');
    const mainMenu = document.getElementById('mainMenu');
    const mainMenuSeparator = document.getElementById('mainMenuSeparator');
    const mainReportContainer = document.getElementById('mainReportContainer');

    if (user) {
        authStatus.textContent = `Autenticado: ${user.email}`;
        btnLogout.style.display = 'inline-block';
        if (mainMenu) mainMenu.style.display = 'flex';
        if (mainMenuSeparator) mainMenuSeparator.style.display = 'block';
        loadPerseveranceReport(user.uid);
    } else {
        authStatus.textContent = "Nenhum usuário autenticado. Faça login na página inicial.";
        btnLogout.style.display = 'none';
        if (mainMenu) mainMenu.style.display = 'none';
        if (mainMenuSeparator) mainMenuSeparator.style.display = 'none';
        if (mainReportContainer) mainReportContainer.style.display = 'none';
        document.getElementById('reportList').innerHTML = '';
        document.getElementById('pagination').innerHTML = '';
    }
}

onAuthStateChanged(auth, (user) => {
    updateAuthUIReport(user);
});

document.getElementById('btnLogoutReport')?.addEventListener('click', () => {
    signOut(auth).then(() => {
        console.log("Usuário deslogado.");
        window.location.href = 'index.html';
    }).catch((error) => {
        console.error("Erro ao sair:", error);
    });
});
// === FIM Lógica de Autenticação ===


// === Carregamento e Renderização do Relatório (COM OTIMIZAÇÃO N+1) ===

async function loadPerseveranceReport(userId) {
    console.log(`Carregando relatório para ${userId}`);
    document.getElementById('mainReportContainer').style.display = 'block';
    document.getElementById('reportList').innerHTML = '<p>Carregando relatório...</p>';

    try {
        // OTIMIZAÇÃO: Buscar todos os dados necessários em paralelo
        const [targets, interactionCounts] = await Promise.all([
            fetchAllTargetsForReport(userId),
            fetchInteractionCounts(userId)
        ]);

        // Juntar os dados no lado do cliente
        allTargetsForReport = targets.map(target => ({
            ...target,
            interactionCount: interactionCounts.get(target.id) || 0
        }));

        document.getElementById('filterAtivo').checked = true;
        document.getElementById('filterArquivado').checked = false;
        document.getElementById('filterRespondido').checked = false;
        applyFiltersAndRenderMainReport();

    } catch (error) {
        console.error("Erro ao carregar dados do relatório:", error);
        document.getElementById('reportList').innerHTML = '<p class="error-message">Erro ao carregar relatório principal.</p>';
    }
}

async function fetchAllTargetsForReport(userId) {
    try {
        const activeTargetsRef = collection(db, "users", userId, "prayerTargets");
        const activeSnapshot = await getDocs(query(activeTargetsRef, orderBy("date", "desc")));
        const activeRaw = activeSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, status: 'ativo' }));

        const archivedTargetsRef = collection(db, "users", userId, "archivedTargets");
        const archivedSnapshot = await getDocs(query(archivedTargetsRef, orderBy("archivedDate", "desc")));
        const archivedRaw = archivedSnapshot.docs.map(doc => {
            const data = doc.data();
            return { ...data, id: doc.id, status: data.resolved ? 'respondido' : 'arquivado' };
        });

        const allTargets = rehydrateTargets([...activeRaw, ...archivedRaw]);
        console.log(`Total de alvos carregados: ${allTargets.length}`);
        return allTargets;
    } catch (error) {
        console.error("Erro ao buscar alvos para o relatório:", error);
        throw error;
    }
}

/**
 * (NOVA FUNÇÃO OTIMIZADA) Busca todas as interações de um usuário de uma vez.
 * @param {string} uid - ID do usuário.
 * @returns {Promise<Map<string, number>>} - Um Map onde a chave é o ID do alvo e o valor é a contagem.
 */
async function fetchInteractionCounts(uid) {
    console.log(`[Report Page] Buscando contagem de interações para o usuário ${uid}`);
    const interactionMap = new Map();
    
    const dailyTargetsCollection = collection(db, "dailyPrayerTargets");
    const q = query(dailyTargetsCollection, where("userId", "==", uid));
    
    const snapshot = await getDocs(q);

    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.targets && Array.isArray(data.targets)) {
            data.targets.forEach(target => {
                if (target.completed && target.targetId) {
                    const currentCount = interactionMap.get(target.targetId) || 0;
                    interactionMap.set(target.targetId, currentCount + 1);
                }
            });
        }
    });

    console.log(`[Report Page] Contagem de interações concluída para ${interactionMap.size} alvos.`);
    return interactionMap;
}

function applyFiltersAndRenderMainReport() {
    const searchTerm = document.getElementById('searchReport').value.toLowerCase();
    const showAtivo = document.getElementById('filterAtivo').checked;
    const showArquivado = document.getElementById('filterArquivado').checked;
    const showRespondido = document.getElementById('filterRespondido').checked;

    filteredTargetsForReport = allTargetsForReport.filter(target => {
        const statusMatch = (showAtivo && target.status === 'ativo') ||
                           (showArquivado && target.status === 'arquivado') ||
                           (showRespondido && target.status === 'respondido');
        if (!statusMatch) return false;

        if (searchTerm) {
             const titleMatch = target.title?.toLowerCase().includes(searchTerm);
             const detailsMatch = target.details?.toLowerCase().includes(searchTerm);
             const categoryMatch = target.category?.toLowerCase().includes(searchTerm);
             if (!titleMatch && !detailsMatch && !categoryMatch) return false;
        }
        return true;
    });

    // Ordenação mais robusta
    filteredTargetsForReport.sort((a, b) => {
        const dateA = a.resolutionDate || a.archivedDate || a.date || 0;
        const dateB = b.resolutionDate || b.archivedDate || b.date || 0;
        return (dateB instanceof Date ? dateB.getTime() : 0) - (dateA instanceof Date ? dateA.getTime() : 0);
    });

    currentReportPage = 1;
    renderMainReportList();
}

function renderMainReportList() {
    const reportListDiv = document.getElementById('reportList');
    reportListDiv.innerHTML = '';

    const startIndex = (currentReportPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const itemsToDisplay = filteredTargetsForReport.slice(startIndex, endIndex);

    if (itemsToDisplay.length === 0) {
        reportListDiv.innerHTML = '<p>Nenhum alvo encontrado com os filtros selecionados.</p>';
        renderReportPagination();
        return;
    }

    itemsToDisplay.forEach(target => {
        const itemDiv = document.createElement('div');
        itemDiv.classList.add('report-item');
        itemDiv.dataset.targetId = target.id;

        const statusTag = `<span class="status-tag status-${target.status}">${target.status}</span>`;
        const categoryTag = target.category ? `<span class="category-tag" style="background-color: #C71585; color: #fff; padding: 2px 6px; border-radius: 3px; font-size: 0.7em;">${target.category}</span>` : '';
        
        let dateToShow = target.date;
        let dateLabel = "Criado em";
        if (target.status === 'respondido' && target.resolutionDate) {
            dateToShow = target.resolutionDate; dateLabel = "Respondido em";
        } else if (target.status === 'arquivado' && target.archivedDate) {
            dateToShow = target.archivedDate; dateLabel = "Arquivado em";
        }

        itemDiv.innerHTML = `
            <h3>${statusTag} ${categoryTag} ${target.title || 'Sem Título'}</h3>
            <p>${dateLabel}: ${formatDateForDisplay(dateToShow)} (${timeElapsed(target.date)} desde criação)</p>
            ${target.details ? `<p><i>${target.details.substring(0, 150)}${target.details.length > 150 ? '...' : ''}</i></p>` : ''}
            <div class="click-stats">
                <p>Total de Interações Registradas:</p>
                <ul>
                    <li>Total: <span>${target.interactionCount}</span></li>
                </ul>
            </div>
        `;
        reportListDiv.appendChild(itemDiv);
    });

    renderReportPagination();
}

function renderReportPagination() {
    const paginationDiv = document.getElementById('pagination');
    paginationDiv.innerHTML = '';
    const totalItems = filteredTargetsForReport.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);

    if (totalPages <= 1) {
        paginationDiv.style.display = 'none'; return;
    } else {
         paginationDiv.style.display = 'flex';
    }

    if (currentReportPage > 1) {
        const prevLink = document.createElement('a');
        prevLink.href = '#';
        prevLink.textContent = '« Anterior';
        prevLink.classList.add('page-link');
        prevLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (currentReportPage > 1) {
                currentReportPage--;
                renderMainReportList();
                window.scrollTo(0, document.getElementById('mainReportContainer').offsetTop - 20);
            }
        });
        paginationDiv.appendChild(prevLink);
    }

    const pageIndicator = document.createElement('span');
    pageIndicator.textContent = ` Página ${currentReportPage} de ${totalPages} `;
    paginationDiv.appendChild(pageIndicator);

    if (currentReportPage < totalPages) {
        const nextLink = document.createElement('a');
        nextLink.href = '#';
        nextLink.textContent = 'Próxima »';
        nextLink.classList.add('page-link');
        nextLink.addEventListener('click', (e) => {
            e.preventDefault();
             if (currentReportPage < totalPages) {
                currentReportPage++;
                renderMainReportList();
                window.scrollTo(0, document.getElementById('mainReportContainer').offsetTop - 20);
            }
        });
        paginationDiv.appendChild(nextLink);
    }
}

// === Event Listeners ===
document.getElementById('searchReport')?.addEventListener('input', applyFiltersAndRenderMainReport);
document.getElementById('filterAtivo')?.addEventListener('change', applyFiltersAndRenderMainReport);
document.getElementById('filterArquivado')?.addEventListener('change', applyFiltersAndRenderMainReport);
document.getElementById('filterRespondido')?.addEventListener('change', applyFiltersAndRenderMainReport);
document.getElementById('backToMainButton')?.addEventListener('click', () => window.location.href = 'index.html');