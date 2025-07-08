--- START OF FILE orei.js ---
// orei.js (VERSÃO COMPLETA E REATORADA)
// Responsabilidade: Renderizar o relatório de perseverança, consumindo
// os serviços centralizados de autenticação e dados.

// --- MÓDULOS ---
import { initializeAuth, handleSignOut } from './auth.js';
import { fetchAllTargetsForReport, fetchInteractionCounts } from './firestore-service.js';
import { formatDateForDisplay, timeElapsed } from './utils.js'; // <-- MELHORIA APLICADA

// === Variáveis Globais de Estado ===
let currentReportPage = 1;
const itemsPerPage = 10;
let allTargetsForReport = [];
let filteredTargetsForReport = [];

// =============================================
// === Funções Utilitárias da Página ===
// REMOVIDO: Bloco de funções duplicadas foi removido e importado do utils.js
// =============================================

// =============================================
// === Lógica de Autenticação (Consumindo auth.js) ===
// =============================================

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

// =================================================================
// === Carregamento e Renderização do Relatório ===
// =================================================================

async function loadPerseveranceReport(userId) {
    console.log(`[Report Page] Carregando relatório para ${userId}`);
    document.getElementById('mainReportContainer').style.display = 'block';
    document.getElementById('reportList').innerHTML = '<p>Carregando relatório...</p>';

    try {
        // OTIMIZAÇÃO: Usando as funções centralizadas do 'firestore-service.js'
        const [targets, interactionCounts] = await Promise.all([
            fetchAllTargetsForReport(userId),
            fetchInteractionCounts(userId)
        ]);

        allTargetsForReport = targets.map(target => ({
            ...target,
            interactionCount: interactionCounts.get(target.id) || 0
        }));

        // Resetar e aplicar filtros iniciais
        document.getElementById('filterAtivo').checked = true;
        document.getElementById('filterArquivado').checked = false;
        document.getElementById('filterRespondido').checked = false;
        applyFiltersAndRenderMainReport();

    } catch (error) {
        console.error("[Report Page] Erro ao carregar dados do relatório:", error);
        document.getElementById('reportList').innerHTML = '<p class="error-message">Erro ao carregar o relatório.</p>';
    }
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
             return titleMatch || detailsMatch || categoryMatch;
        }
        return true;
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
        const categoryTag = target.category ? `<span class="category-tag">${target.category}</span>` : '';
        
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
    }
    paginationDiv.style.display = 'flex';

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

// =================================================================
// === Event Listeners e Ponto de Entrada ===
// =================================================================
document.addEventListener('DOMContentLoaded', () => {
    // Inicializa a autenticação e define o que fazer quando o estado do usuário mudar
    initializeAuth(updateAuthUIReport);

    // Listener para o botão de logout
    document.getElementById('btnLogoutReport')?.addEventListener('click', () => {
        handleSignOut()
            .then(() => {
                console.log("Usuário deslogado com sucesso.");
                window.location.href = 'index.html';
            })
            .catch((error) => console.error("Erro ao sair:", error));
    });

    // Listeners para os filtros da página
    document.getElementById('searchReport')?.addEventListener('input', applyFiltersAndRenderMainReport);
    document.getElementById('filterAtivo')?.addEventListener('change', applyFiltersAndRenderMainReport);
    document.getElementById('filterArquivado')?.addEventListener('change', applyFiltersAndRenderMainReport);
    document.getElementById('filterRespondido')?.addEventListener('change', applyFiltersAndRenderMainReport);

    // Listener para o botão de voltar
    document.getElementById('backToMainButton')?.addEventListener('click', () => window.location.href = 'index.html');
});
--- END OF FILE orei.js ---