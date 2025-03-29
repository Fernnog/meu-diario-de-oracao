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

// === Variáveis Globais para orei.js ===
let currentReportPage = 1;
const itemsPerPage = 10;
let allTargetsForReport = []; // Armazenará todos os alvos (ativos e arquivados)
let filteredTargetsForReport = []; // Alvos filtrados para exibição na lista principal
let zeroInteractionTargets = []; // Alvos para a nova seção

// =============================================
// === Funções Utilitárias (Incluídas aqui) ===
// =============================================

/**
 * Creates a Date object representing UTC midnight from a YYYY-MM-DD string.
 * Returns null if the string is invalid.
 */
function createUTCDate(dateString) {
    if (!dateString || typeof dateString !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        // console.warn("[createUTCDate] Invalid date string format provided:", dateString);
        return null;
    }
    // Creates a Date object interpreted as UTC midnight
    const date = new Date(dateString + 'T00:00:00Z');
    // Double check if the parsing resulted in a valid date
    if (isNaN(date.getTime())) {
        // console.warn("[createUTCDate] Failed to parse date string to valid UTC Date:", dateString);
        return null;
    }
    return date;
}

/**
 * Formats a date input (Date object, Timestamp, string) into YYYY-MM-DD (UTC).
 * Defaults to today if input is invalid.
 */
function formatDateToISO(date) {
    let dateToFormat;
    if (date instanceof Timestamp) {
        dateToFormat = date.toDate();
    } else if (date instanceof Date && !isNaN(date)) {
        dateToFormat = date;
    } else if (typeof date === 'string') {
        dateToFormat = new Date(date); // Try parsing string (might be local time)
    }

    // Ensure we have a valid Date object before proceeding
    if (!(dateToFormat instanceof Date) || isNaN(dateToFormat.getTime())) {
        // console.warn("formatDateToISO received invalid date, defaulting to today:", date);
        dateToFormat = new Date();
    }

    // Use UTC components to avoid timezone shifts in the output string
    const year = dateToFormat.getUTCFullYear();
    const month = String(dateToFormat.getUTCMonth() + 1).padStart(2, '0');
    const day = String(dateToFormat.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Formats a date input (Date, Timestamp, valid string) into DD/MM/YYYY using UTC components.
 * Returns 'Data Inválida' on failure.
 */
function formatDateForDisplay(dateInput) {
    // console.log('[formatDateForDisplay] Received input:', dateInput, '| Type:', typeof dateInput);

    if (!dateInput) {
        // console.log('[formatDateForDisplay] Input is null or undefined.');
        return 'Data Inválida';
    }

    let dateToFormat;
    if (dateInput instanceof Timestamp) {
        // console.log('[formatDateForDisplay] Input is Timestamp.');
        dateToFormat = dateInput.toDate();
    } else if (dateInput instanceof Date && !isNaN(dateInput)) {
        // console.log('[formatDateForDisplay] Input is already valid Date.');
        dateToFormat = dateInput;
    } else if (typeof dateInput === 'string') {
        // console.log('[formatDateForDisplay] Input is string. Attempting to parse.');
        dateToFormat = new Date(dateInput); // Try parsing (e.g., ISO string)
    } else {
        // console.warn("[formatDateForDisplay] Input is unexpected type:", typeof dateInput);
        return 'Data Inválida';
    }

    if (!dateToFormat || isNaN(dateToFormat.getTime())) {
        // console.log('[formatDateForDisplay] Conversion resulted in invalid Date.');
        return 'Data Inválida';
    }

    // Use UTC methods for display to reflect the stored calendar date
    const day = String(dateToFormat.getUTCDate()).padStart(2, '0');
    const month = String(dateToFormat.getUTCMonth() + 1).padStart(2, '0'); // getUTCMonth is 0-indexed
    const year = dateToFormat.getUTCFullYear();
    const formattedDate = `${day}/${month}/${year}`;
    // console.log('[formatDateForDisplay] Formatting successful (UTC components):', formattedDate);
    return formattedDate;
}

/**
 * Calculates time elapsed from a past Date object until now.
 * Returns a human-readable string (e.g., "5 min", "2 dias").
 */
function timeElapsed(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
        return 'Data Inválida';
    }
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

/**
 * Checks if a given Date object (representing UTC midnight) is before the start of today (UTC).
 * Used to determine if a deadline has passed.
 */
function isDateExpired(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) return false;

    const now = new Date();
    // Create a Date object representing the start of today in UTC
    const todayUTCStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    // Deadline is expired if its timestamp is strictly less than the start of today's timestamp
    return date.getTime() < todayUTCStart.getTime();
}

/**
 * Converts Firestore Timestamps within an array of target objects to JS Date objects.
 * Handles nested observations arrays as well.
 */
function rehydrateTargets(targets) {
    // console.log('[rehydrateTargets] Starting rehydration for', targets.length, 'targets.');
    return targets.map((target) => {
        const rehydratedTarget = { ...target };
        const fieldsToConvert = ['date', 'deadlineDate', 'lastPresentedDate', 'resolutionDate', 'archivedDate']; // Added archivedDate just in case
        fieldsToConvert.forEach(field => {
            const originalValue = rehydratedTarget[field];
            if (originalValue instanceof Timestamp) {
                rehydratedTarget[field] = originalValue.toDate();
            } else if (originalValue instanceof Date && !isNaN(originalValue)) {
                // Already a valid Date, do nothing
                rehydratedTarget[field] = originalValue;
            } else if (originalValue === null || originalValue === undefined) {
                rehydratedTarget[field] = null;
            } else {
                // Attempt to parse if it's a string or other type, set to null if invalid
                try {
                    const parsedDate = new Date(originalValue);
                    rehydratedTarget[field] = !isNaN(parsedDate.getTime()) ? parsedDate : null;
                } catch (e) {
                    rehydratedTarget[field] = null;
                }
                // if (rehydratedTarget[field] === null && originalValue !== null) {
                //     console.warn(`[rehydrateTargets] Invalid date value for field '${field}'. Original:`, originalValue);
                // }
            }
        });

        // Process observations array
        if (rehydratedTarget.observations && Array.isArray(rehydratedTarget.observations)) {
            rehydratedTarget.observations = rehydratedTarget.observations.map(obs => {
                let obsDateFinal = null;
                if (obs.date instanceof Timestamp) {
                    obsDateFinal = obs.date.toDate();
                } else if (obs.date instanceof Date && !isNaN(obs.date)) {
                    obsDateFinal = obs.date;
                } else if (obs.date) {
                    try {
                        const parsedObsDate = new Date(obs.date);
                        if (!isNaN(parsedObsDate.getTime())) obsDateFinal = parsedObsDate;
                    } catch (e) { /* ignore parse error */ }
                }
                return { ...obs, date: obsDateFinal };
            });
        } else {
            rehydratedTarget.observations = [];
        }

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
        let providerType = 'E-mail/Senha'; // Default
        if (user.providerData[0]?.providerId === 'google.com') {
            providerType = 'Google';
        }
        authStatus.textContent = `Autenticado: ${user.email} (via ${providerType})`;
        btnLogout.style.display = 'inline-block';
        if (mainMenu) mainMenu.style.display = 'block'; // Ou 'flex'
        if (mainMenuSeparator) mainMenuSeparator.style.display = 'block';
        // Não mostramos os containers aqui ainda, esperamos o loadPerseveranceReport
        loadPerseveranceReport(user.uid); // Carrega dados SÓ QUANDO autenticado
    } else {
        authStatus.textContent = "Nenhum usuário autenticado. Faça login na página inicial.";
        btnLogout.style.display = 'none';
        if (mainMenu) mainMenu.style.display = 'none';
        if (mainMenuSeparator) mainMenuSeparator.style.display = 'none';
        reportContainers.forEach(c => c.style.display = 'none'); // Esconde containers
        // Limpa as listas
        document.getElementById('zeroInteractionList').innerHTML = '';
        document.getElementById('reportList').innerHTML = '';
        document.getElementById('pagination').innerHTML = '';
    }
}

// Listener principal de autenticação
onAuthStateChanged(auth, (user) => {
    updateAuthUIReport(user);
});

// Função de Logout
document.getElementById('btnLogoutReport')?.addEventListener('click', () => {
    signOut(auth).then(() => {
        console.log("Usuário deslogado.");
        // UI será atualizada pelo onAuthStateChanged
        window.location.href = 'index.html'; // Redireciona
    }).catch((error) => {
        console.error("Erro ao sair:", error);
    });
});
// === FIM Lógica de Autenticação ===


// === Carregamento e Renderização do Relatório ===

async function loadPerseveranceReport(userId) {
    console.log(`Carregando relatório para ${userId}`);
    // Mostra placeholders enquanto carrega
    document.getElementById('zeroInteractionSection').style.display = 'block';
    document.getElementById('mainReportContainer').style.display = 'block';
    document.getElementById('zeroInteractionList').innerHTML = '<p>Carregando alvos sem interação...</p>';
    document.getElementById('reportList').innerHTML = '<p>Carregando relatório principal...</p>';

    try {
        // 1. Buscar todos os alvos (ativos e arquivados)
        await fetchAllTargetsForReport(userId);

        // 2. Processar e renderizar a lista de "Sem Interação"
        await processAndRenderZeroInteraction(userId);

        // 3. Processar e renderizar a lista principal com filtros (começa com Ativos)
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

// Busca todos os alvos (ativos e arquivados)
async function fetchAllTargetsForReport(userId) {
    allTargetsForReport = [];
    try {
        const activeTargetsRef = collection(db, "users", userId, "prayerTargets");
        const activeSnapshot = await getDocs(query(activeTargetsRef, orderBy("date", "desc")));
        const activeRaw = [];
        activeSnapshot.forEach(doc => activeRaw.push({ ...doc.data(), id: doc.id, status: 'ativo' }));

        const archivedTargetsRef = collection(db, "users", userId, "archivedTargets");
        const archivedSnapshot = await getDocs(query(archivedTargetsRef, orderBy("date", "desc")));
        const archivedRaw = [];
        archivedSnapshot.forEach(doc => {
            const data = doc.data();
            // Adiciona archivedDate fictício se não existir, para ordenação (usar data de criação como fallback)
            const archiveSortDate = data.resolutionDate || data.archivedDate || data.date;
            archivedRaw.push({ ...data, id: doc.id, status: data.resolved ? 'respondido' : 'arquivado', archiveSortDate: archiveSortDate });
        });

        // Combina e Rehidrata
        allTargetsForReport = rehydrateTargets([...activeRaw, ...archivedRaw]);
        console.log(`Total de alvos (ativos e arquivados) carregados: ${allTargetsForReport.length}`);
    } catch (error) {
        console.error("Erro ao buscar alvos para o relatório:", error);
        throw error;
    }
}

// Processa e renderiza a seção "Sem Interação"
async function processAndRenderZeroInteraction(userId) {
    const zeroInteractionListDiv = document.getElementById('zeroInteractionList');
    zeroInteractionListDiv.innerHTML = '<p>Processando interações...</p>';
    zeroInteractionTargets = [];

    const activeTargets = allTargetsForReport.filter(t => t.status === 'ativo');
    if (activeTargets.length === 0) {
        zeroInteractionListDiv.innerHTML = '<p>Nenhum alvo ativo encontrado.</p>';
        return;
    }

    // Obtém o mês atual no formato YYYY-MM (importante usar UTC para consistência com Firestore se necessário, mas aqui local deve funcionar)
    const now = new Date();
    const currentMonthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    console.log("Verificando interações para o mês:", currentMonthYear);

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
            //console.log(`Alvo: ${target.title}, Interação em ${currentMonthYear}? ${hasInteractionThisMonth}`);
            if (!hasInteractionThisMonth) {
                return target; // Retorna o alvo se NÃO houve interação
            }
        } catch (error) {
            console.error(`Erro ao verificar cliques para ${target.id}:`, error);
        }
        return null; // Retorna null se houve interação ou erro
    });

    const results = await Promise.all(promises);
    zeroInteractionTargets = results.filter(target => target !== null); // Filtra os não nulos

    console.log(`Alvos sem interação encontrados em ${currentMonthYear}: ${zeroInteractionTargets.length}`);
    renderZeroInteractionList(zeroInteractionTargets);
}


// Renderiza a lista da seção "Sem Interação"
function renderZeroInteractionList(targets) {
    const listDiv = document.getElementById('zeroInteractionList');
    listDiv.innerHTML = '';

    if (targets.length === 0) {
        listDiv.innerHTML = '<p>Ótimo! Todos os alvos ativos tiveram interação este mês.</p>';
        return;
    }

    // Ordena por data de criação (mais antigo primeiro)
    targets.sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));

    targets.forEach(target => {
        const itemDiv = document.createElement('div');
        itemDiv.classList.add('report-item', 'zero-interaction-item');
        itemDiv.innerHTML = `
            <h3>${target.title || 'Sem Título'}</h3>
            <p>Criado em: ${formatDateForDisplay(target.date)} (${timeElapsed(target.date)} atrás)</p>
            ${target.details ? `<p><i>${target.details.substring(0, 100)}${target.details.length > 100 ? '...' : ''}</i></p>` : ''}
            <p class="no-interaction-alert">Nenhuma interação ('Orei!') registrada em ${new Date().toLocaleString('pt-BR', { month: 'long' })}.</p>
        `;
        listDiv.appendChild(itemDiv);
    });
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
            // Considerar busca em observações se necessário
            // const obsMatch = target.observations?.some(obs => obs.text?.toLowerCase().includes(searchTerm));
            if (!titleMatch && !detailsMatch /* && !obsMatch */) return false;
        }
        return true;
    });

    // Ordena por data descendente (data de criação para ativos, data de arquivamento/resolução para outros)
    filteredTargetsForReport.sort((a, b) => {
        // Usamos a data de criação como fallback geral se outras não existirem
        const dateA = a.archiveSortDate || a.date || 0;
        const dateB = b.archiveSortDate || b.date || 0;
        return (dateB instanceof Date ? dateB.getTime() : 0) - (dateA instanceof Date ? dateA.getTime() : 0);
    });

    currentReportPage = 1;
    renderMainReportList();
}

// Renderiza a lista principal paginada
function renderMainReportList() {
    const reportListDiv = document.getElementById('reportList');
    reportListDiv.innerHTML = '';

    const startIndex = (currentReportPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const itemsToDisplay = filteredTargetsForReport.slice(startIndex, endIndex);

    if (itemsToDisplay.length === 0) {
        reportListDiv.innerHTML = '<p>Nenhum alvo encontrado com os filtros selecionados.</p>';
    } else {
        itemsToDisplay.forEach(target => {
            const itemDiv = document.createElement('div');
            itemDiv.classList.add('report-item');
            let statusLabel = '';
            switch (target.status) {
                case 'ativo': statusLabel = '<span class="status-tag status-ativo">Ativo</span>'; break;
                case 'arquivado': statusLabel = '<span class="status-tag status-arquivado">Arquivado</span>'; break;
                case 'respondido': statusLabel = '<span class="status-tag status-respondido">Respondido</span>'; break;
            }

            // Define qual data mostrar com base no status
            let dateToShow = target.date; // Data de criação por padrão
            let dateLabel = "Criado em";
            if (target.status === 'respondido' && target.resolutionDate) {
                dateToShow = target.resolutionDate;
                dateLabel = "Respondido em";
            } else if (target.status === 'arquivado' && target.archivedDate) { // Usar archivedDate se existir
                dateToShow = target.archivedDate;
                dateLabel = "Arquivado em";
            }
             // Se for arquivado/respondido mas não tiver data específica, mostra data de criação
             else if ((target.status === 'arquivado' || target.status === 'respondido') && !dateToShow) {
                 dateToShow = target.date;
                 dateLabel = `Criado em`; // Indica que é a data de criação
             }


            itemDiv.innerHTML = `
                <h3>${statusLabel} ${target.title || 'Sem Título'}</h3>
                <p>${dateLabel}: ${formatDateForDisplay(dateToShow)} (${timeElapsed(target.date)} desde criação)</p>
                ${target.details ? `<p><i>${target.details.substring(0, 150)}${target.details.length > 150 ? '...' : ''}</i></p>` : ''}
            `;
            reportListDiv.appendChild(itemDiv);
        });
    }

    renderReportPagination();
}

// Renderiza a paginação para a lista principal
function renderReportPagination() {
    const paginationDiv = document.getElementById('pagination');
    paginationDiv.innerHTML = '';
    const totalItems = filteredTargetsForReport.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);

    if (totalPages <= 1) {
        paginationDiv.style.display = 'none';
        return;
    } else {
         paginationDiv.style.display = 'flex'; // Garante que a paginação seja visível
    }

    // Botão Anterior
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
                 window.scrollTo(0, document.getElementById('mainReportContainer').offsetTop); // Scroll para o topo da lista
            }
        });
        paginationDiv.appendChild(prevLink);
    }

    // Indicador de Página
    const pageIndicator = document.createElement('span');
    pageIndicator.textContent = ` Página ${currentReportPage} de ${totalPages} `;
    pageIndicator.style.margin = "0 10px"; // Espaçamento
    paginationDiv.appendChild(pageIndicator);


    // Botão Próximo
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
                 window.scrollTo(0, document.getElementById('mainReportContainer').offsetTop); // Scroll para o topo da lista
            }
        });
        paginationDiv.appendChild(nextLink);
    }
}

// === Event Listeners para Filtros e Busca ===
document.getElementById('searchReport')?.addEventListener('input', applyFiltersAndRenderMainReport);
document.getElementById('filterAtivo')?.addEventListener('change', applyFiltersAndRenderMainReport);
document.getElementById('filterArquivado')?.addEventListener('change', applyFiltersAndRenderMainReport);
document.getElementById('filterRespondido')?.addEventListener('change', applyFiltersAndRenderMainReport);

// === Navegação ===
document.getElementById('backToMainButton')?.addEventListener('click', () => {
    window.location.href = 'index.html';
});

// Listeners para botões de filtro rápido
document.getElementById('viewAllTargetsButton')?.addEventListener('click', () => {
    document.getElementById('filterAtivo').checked = true;
    document.getElementById('filterArquivado').checked = true;
    document.getElementById('filterRespondido').checked = true;
    applyFiltersAndRenderMainReport();
});
document.getElementById('viewArchivedButton')?.addEventListener('click', () => {
    document.getElementById('filterAtivo').checked = false;
    document.getElementById('filterArquivado').checked = true;
    document.getElementById('filterRespondido').checked = false; // Mostra APENAS arquivados
    applyFiltersAndRenderMainReport();
});
document.getElementById('viewResolvedButton')?.addEventListener('click', () => {
    document.getElementById('filterAtivo').checked = false;
    document.getElementById('filterArquivado').checked = false; // Não marca arquivado
    document.getElementById('filterRespondido').checked = true; // Mostra APENAS respondidos
    applyFiltersAndRenderMainReport();
});

// === Inicialização ===
// A inicialização principal é feita pelo onAuthStateChanged.
