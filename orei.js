import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-analytics.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getFirestore, collection, doc, getDocs, query, orderBy, getDoc, Timestamp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

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
let zeroInteractionTargets = [];

// =============================================
// === Funções Utilitárias (Completas) ===
// =============================================

function createUTCDate(dateString) {
    if (!dateString || typeof dateString !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return null;
    const date = new Date(dateString + 'T00:00:00Z');
    if (isNaN(date.getTime())) return null;
    return date;
}

function formatDateToISO(date) {
    let dateToFormat;
    if (date instanceof Timestamp) dateToFormat = date.toDate();
    else if (date instanceof Date && !isNaN(date)) dateToFormat = date;
    else dateToFormat = new Date();

    if (isNaN(dateToFormat.getTime())) dateToFormat = new Date();

    const year = dateToFormat.getUTCFullYear();
    const month = String(dateToFormat.getUTCMonth() + 1).padStart(2, '0');
    const day = String(dateToFormat.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

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

function isDateExpired(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) return false;
    const now = new Date();
    const todayUTCStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return date.getTime() < todayUTCStart.getTime();
}

function rehydrateTargets(targets) {
     return targets.map((target) => {
        const rehydratedTarget = { ...target };
        const fieldsToConvert = ['date', 'deadlineDate', 'lastPresentedDate', 'resolutionDate', 'archivedDate'];
        fieldsToConvert.forEach(field => {
            const originalValue = rehydratedTarget[field];
            if (originalValue instanceof Timestamp) {
                rehydratedTarget[field] = originalValue.toDate();
            } else if (originalValue instanceof Date && !isNaN(originalValue)) {
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
                else if (obs.date instanceof Date && !isNaN(obs.date)) obsDateFinal = obs.date;
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
// =============================================
// === FIM Funções Utilitárias               ===
// =============================================


// === Lógica de Autenticação ===
function updateAuthUIReport(user) {
    const authStatus = document.getElementById('authStatusReport');
    const btnLogout = document.getElementById('btnLogoutReport');
    const mainMenu = document.getElementById('mainMenu');
    const mainMenuSeparator = document.getElementById('mainMenuSeparator');
    const reportContainers = document.querySelectorAll('.report-container, .zero-interaction-section');

    if (user) {
        let providerType = 'E-mail/Senha';
        if (user.providerData[0]?.providerId === 'google.com') providerType = 'Google';
        authStatus.textContent = `Autenticado: ${user.email} (via ${providerType})`;
        btnLogout.style.display = 'inline-block';
        if (mainMenu) mainMenu.style.display = 'block';
        if (mainMenuSeparator) mainMenuSeparator.style.display = 'block';
        loadPerseveranceReport(user.uid);
    } else {
        authStatus.textContent = "Nenhum usuário autenticado. Faça login na página inicial.";
        btnLogout.style.display = 'none';
        if (mainMenu) mainMenu.style.display = 'none';
        if (mainMenuSeparator) mainMenuSeparator.style.display = 'none';
        reportContainers.forEach(c => c.style.display = 'none');
        document.getElementById('zeroInteractionList').innerHTML = '';
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


// === Carregamento e Renderização do Relatório ===

async function loadPerseveranceReport(userId) {
    console.log(`Carregando relatório para ${userId}`);
    document.getElementById('zeroInteractionSection').style.display = 'block';
    document.getElementById('mainReportContainer').style.display = 'block';
    document.getElementById('zeroInteractionList').innerHTML = '<p>Carregando alvos sem interação...</p>';
    document.getElementById('reportList').innerHTML = '<p>Carregando relatório principal...</p>';

    try {
        await fetchAllTargetsForReport(userId);
        await processAndRenderZeroInteraction(userId);

        // Define filtros iniciais (ex: Ativos) e renderiza o relatório principal
        document.getElementById('filterAtivo').checked = true;
        document.getElementById('filterArquivado').checked = false;
        document.getElementById('filterRespondido').checked = false;
        applyFiltersAndRenderMainReport();

    } catch (error) {
        console.error("Erro ao carregar dados do relatório:", error);
        document.getElementById('zeroInteractionList').innerHTML = '<p class="error-message">Erro ao carregar alvos sem interação.</p>';
        document.getElementById('reportList').innerHTML = '<p class="error-message">Erro ao carregar relatório principal.</p>';
    }
}

async function fetchAllTargetsForReport(userId) {
    allTargetsForReport = [];
    try {
        const activeTargetsRef = collection(db, "users", userId, "prayerTargets");
        const activeSnapshot = await getDocs(query(activeTargetsRef, orderBy("date", "desc")));
        const activeRaw = activeSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, status: 'ativo' }));

        const archivedTargetsRef = collection(db, "users", userId, "archivedTargets");
        const archivedSnapshot = await getDocs(query(archivedTargetsRef, orderBy("date", "desc")));
        const archivedRaw = archivedSnapshot.docs.map(doc => {
            const data = doc.data();
            const archiveSortDate = data.resolutionDate || data.archivedDate || data.date;
            return { ...data, id: doc.id, status: data.resolved ? 'respondido' : 'arquivado', archiveSortDate: archiveSortDate };
        });

        allTargetsForReport = rehydrateTargets([...activeRaw, ...archivedRaw]);
        console.log(`Total de alvos carregados: ${allTargetsForReport.length}`);
    } catch (error) {
        console.error("Erro ao buscar alvos para o relatório:", error);
        throw error;
    }
}

async function processAndRenderZeroInteraction(userId) {
    const zeroInteractionListDiv = document.getElementById('zeroInteractionList');
    zeroInteractionListDiv.innerHTML = '<p>Processando interações...</p>';
    zeroInteractionTargets = [];

    const activeTargets = allTargetsForReport.filter(t => t.status === 'ativo');
    if (activeTargets.length === 0) {
        zeroInteractionListDiv.innerHTML = '<p>Nenhum alvo ativo encontrado.</p>';
        return;
    }

    const now = new Date();
    const currentMonthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const promises = activeTargets.map(async (target) => {
        try {
            const clickCountsRef = doc(db, "prayerClickCounts", target.id);
            const clickSnap = await getDoc(clickCountsRef);
            let hasInteractionThisMonth = false;
            if (clickSnap.exists()) {
                const clickData = clickSnap.data();
                if (clickData.monthlyClicks && clickData.monthlyClicks[currentMonthYear] > 0) {
                    hasInteractionThisMonth = true;
                }
            }
            if (!hasInteractionThisMonth) return target;
        } catch (error) {
            console.error(`Erro ao verificar cliques para ${target.id}:`, error);
        }
        return null;
    });

    const results = await Promise.all(promises);
    zeroInteractionTargets = results.filter(target => target !== null);

    renderZeroInteractionList(zeroInteractionTargets); // <-- Chamada movida para após o loop
}

// --- MODIFICADO --- Renderiza APENAS os nomes na seção "Sem Interação"
function renderZeroInteractionList(targets) {
    const listDiv = document.getElementById('zeroInteractionList');
    listDiv.innerHTML = ''; // Limpa

    if (targets.length === 0) {
        listDiv.innerHTML = '<p>Ótimo! Todos os alvos ativos tiveram interação este mês.</p>';
        return;
    }

    // Cria uma lista não ordenada (ul)
    const ul = document.createElement('ul');
    ul.classList.add('zero-interaction-name-list'); // Adiciona classe para estilização opcional

    // Ordena por data de criação (mais antigo primeiro)
    targets.sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));

    targets.forEach(target => {
        const li = document.createElement('li');
        li.textContent = target.title || 'Sem Título'; // Mostra apenas o título
        ul.appendChild(li);
    });

    listDiv.appendChild(ul); // Adiciona a lista ao container
}


// Aplica filtros e renderiza a lista principal do relatório
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
            const observationMatch = Array.isArray(target.observations) &&
                 target.observations.some(obs => obs && obs.text && obs.text.toLowerCase().includes(searchTerm));
            // Modificado para incluir busca em observações
            if (!titleMatch && !detailsMatch && !observationMatch) return false;
        }
        return true;
    });

    filteredTargetsForReport.sort((a, b) => {
        const dateA = a.archiveSortDate || a.date || 0;
        const dateB = b.archiveSortDate || b.date || 0;
        return (dateB instanceof Date ? dateB.getTime() : 0) - (dateA instanceof Date ? dateA.getTime() : 0);
    });

    currentReportPage = 1;
    renderMainReportList();
}

// --- MODIFICADO --- Renderiza a lista principal com DADOS DE PERSEVERANÇA (Cliques)
function renderMainReportList() {
    const reportListDiv = document.getElementById('reportList');
    reportListDiv.innerHTML = ''; // Limpa a lista antes de renderizar

    const startIndex = (currentReportPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const itemsToDisplay = filteredTargetsForReport.slice(startIndex, endIndex);

    if (itemsToDisplay.length === 0) {
        reportListDiv.innerHTML = '<p>Nenhum alvo encontrado com os filtros selecionados.</p>';
        renderReportPagination(); // Renderiza paginação vazia se necessário
        return; // Sai da função
    }

    itemsToDisplay.forEach(target => {
        const itemDiv = document.createElement('div');
        // ******** INÍCIO DA CORREÇÃO VISUAL ********
        itemDiv.classList.add('report-item'); // NÃO adiciona mais a classe de status aqui
        // ******** FIM DA CORREÇÃO VISUAL ********
        itemDiv.dataset.targetId = target.id; // Guarda o ID para buscar cliques

        let statusLabel = '';
        switch (target.status) {
            case 'ativo': statusLabel = '<span class="status-tag status-ativo">Ativo</span>'; break;
            case 'arquivado': statusLabel = '<span class="status-tag status-arquivado">Arquivado</span>'; break;
            case 'respondido': statusLabel = '<span class="status-tag status-respondido">Respondido</span>'; break;
        }

        let dateToShow = target.date;
        let dateLabel = "Criado em";
        if (target.status === 'respondido' && target.resolutionDate) {
            dateToShow = target.resolutionDate; dateLabel = "Respondido em";
        } else if (target.status === 'arquivado' && target.archivedDate) {
            dateToShow = target.archivedDate; dateLabel = "Arquivado em";
        } else if ((target.status === 'arquivado' || target.status === 'respondido')) {
             dateToShow = target.date; dateLabel = `Criado em`;
         }

        // Renderiza observações (pode precisar da função renderObservations de script.js se for complexo)
        let observationsHTML = '';
        if (Array.isArray(target.observations) && target.observations.length > 0) {
             // Simplificado: Mostra a última observação ou uma mensagem
             const lastObservation = target.observations.sort((a,b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0))[0];
             if (lastObservation && lastObservation.text) {
                  observationsHTML = `<p><i>Última Obs: ${lastObservation.text.substring(0, 100)}${lastObservation.text.length > 100 ? '...' : ''}</i></p>`;
             }
        }

        itemDiv.innerHTML = `
            <h3>${statusLabel} ${target.title || 'Sem Título'}</h3>
            <p>${dateLabel}: ${formatDateForDisplay(dateToShow)} (${timeElapsed(target.date)} desde criação)</p>
            ${target.details ? `<p><i>${target.details.substring(0, 150)}${target.details.length > 150 ? '...' : ''}</i></p>` : ''}
            ${observationsHTML} {/* Inclui o HTML das observações simplificado */}
            <div class="click-stats">
                <p>Perseverança (Cliques 'Orei!'):</p>
                <ul>
                    <li>Total: <span id="clicks-total-${target.id}">...</span></li>
                    <li>Este Mês: <span id="clicks-month-${target.id}">...</span></li>
                    <li>Este Ano: <span id="clicks-year-${target.id}">...</span></li>
                    {/* <li>Última Oração: <span id="clicks-last-${target.id}">...</span></li> */}
                </ul>
            </div>
        `;
        reportListDiv.appendChild(itemDiv);

        // Busca e exibe os dados de cliques para este alvo
        fetchAndDisplayClickCount(target.id, itemDiv);
    });

    renderReportPagination(); // Renderiza a paginação após os itens
}


// --- NOVO --- Busca e exibe os dados de cliques para um alvo específico
async function fetchAndDisplayClickCount(targetId, itemDiv) {
    const totalSpan = itemDiv.querySelector(`#clicks-total-${targetId}`);
    const monthSpan = itemDiv.querySelector(`#clicks-month-${targetId}`);
    const yearSpan = itemDiv.querySelector(`#clicks-year-${targetId}`);
    // const lastSpan = itemDiv.querySelector(`#clicks-last-${targetId}`); // Se for adicionar data da última

    if (!totalSpan || !monthSpan || !yearSpan) return; // Sai se os elementos não existirem

    try {
        const clickCountsRef = doc(db, "prayerClickCounts", targetId);
        const clickSnap = await getDoc(clickCountsRef);

        if (clickSnap.exists()) {
            const data = clickSnap.data();
            const now = new Date();
            const currentMonthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const currentYear = now.getFullYear().toString();

            totalSpan.textContent = data.totalClicks || 0;
            monthSpan.textContent = data.monthlyClicks?.[currentMonthYear] || 0; // Acesso ao mapa aninhado
            yearSpan.textContent = data.yearlyClicks?.[currentYear] || 0;     // Acesso ao mapa aninhado
            // Para data da última oração, precisaríamos armazenar um timestamp no `prayerClickCounts`
            // lastSpan.textContent = data.lastClickTimestamp ? formatDateForDisplay(data.lastClickTimestamp) : 'Nenhuma';

        } else {
            // Se não existe documento de cliques, assume 0 para tudo
            totalSpan.textContent = '0';
            monthSpan.textContent = '0';
            yearSpan.textContent = '0';
            // lastSpan.textContent = 'Nenhuma';
        }
    } catch (error) {
        console.error(`Erro ao buscar cliques para ${targetId}:`, error);
        totalSpan.textContent = 'Erro';
        monthSpan.textContent = 'Erro';
        yearSpan.textContent = 'Erro';
        // lastSpan.textContent = 'Erro';
    }
}


// Renderiza a paginação para a lista principal
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
                 window.scrollTo(0, document.getElementById('mainReportContainer').offsetTop - 20); // Scroll suave
            }
        });
        paginationDiv.appendChild(prevLink);
    }

    const pageIndicator = document.createElement('span');
    pageIndicator.textContent = ` Página ${currentReportPage} de ${totalPages} `;
    pageIndicator.style.margin = "0 10px";
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
                 window.scrollTo(0, document.getElementById('mainReportContainer').offsetTop - 20); // Scroll suave
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

document.getElementById('viewAllTargetsButton')?.addEventListener('click', () => {
    document.getElementById('filterAtivo').checked = true;
    document.getElementById('filterArquivado').checked = true;
    document.getElementById('filterRespondido').checked = true;
    applyFiltersAndRenderMainReport();
});
document.getElementById('viewArchivedButton')?.addEventListener('click', () => {
    document.getElementById('filterAtivo').checked = false;
    document.getElementById('filterArquivado').checked = true;
    document.getElementById('filterRespondido').checked = false;
    applyFiltersAndRenderMainReport();
});
document.getElementById('viewResolvedButton')?.addEventListener('click', () => {
    document.getElementById('filterAtivo').checked = false;
    document.getElementById('filterArquivado').checked = false;
    document.getElementById('filterRespondido').checked = true;
    applyFiltersAndRenderMainReport();
});

// === Inicialização ===
// Controlada pelo onAuthStateChanged
