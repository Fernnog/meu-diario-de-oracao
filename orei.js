import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-analytics.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getFirestore, collection, doc, getDocs, query, orderBy, getDoc, Timestamp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDnwmV7Xms2PyAZJDQQ_upjQkldoVkF_tk", // Atenção: Expor a chave API no lado do cliente é normal, mas configure regras de segurança no Firestore/Auth.
  authDomain: "meu-diario-de-oracao.firebaseapp.com",
  projectId: "meu-diario-de-oracao",
  storageBucket: "meu-diario-de-oracao.appspot.com", // Corrigido: terminação comum é appspot.com
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
    else dateToFormat = new Date(); // Default to now if invalid

    if (isNaN(dateToFormat.getTime())) dateToFormat = new Date(); // Double check

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
        // Attempt to parse if it's a string or number, use UTC methods
        try {
             let potentialDate;
             // Handle potential ISO string with 'Z' or offset correctly for UTC interpretation
             if (typeof dateInput === 'string' && (dateInput.includes('T') || dateInput.includes(' '))) {
                  potentialDate = new Date(dateInput); // Let Date constructor parse ISO-like strings
             } else {
                 // Assume YYYY-MM-DD or other simple formats might be local, force UTC interpretation
                 potentialDate = new Date(dateInput + 'T00:00:00Z');
             }

            if (!isNaN(potentialDate.getTime())) {
                dateToFormat = potentialDate;
            } else {
                // Final fallback if parsing still fails
                return 'Data Inválida';
            }
        } catch (e) {
             return 'Data Inválida';
        }
    }
    // Always format using UTC methods to match input logic
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
    let diffInMonths = Math.floor(diffInDays / 30.44); // Average month length
    if (diffInMonths < 12) return `${diffInMonths} meses`;
    let diffInYears = Math.floor(diffInDays / 365.25); // Account for leap years
    return `${diffInYears} anos`;
}

function isDateExpired(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) return false;
    const now = new Date();
    // Compare based on UTC date parts to avoid timezone issues with 'today'
    const todayUTCStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const dateUTCStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    return dateUTCStart < todayUTCStart;
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
                // Already a Date object, keep it
                rehydratedTarget[field] = originalValue;
            } else if (originalValue === null || originalValue === undefined) {
                // Keep null/undefined as is
                rehydratedTarget[field] = null;
            } else {
                // Try to parse other types (like strings from older data)
                try {
                    const parsedDate = new Date(originalValue);
                    rehydratedTarget[field] = !isNaN(parsedDate.getTime()) ? parsedDate : null;
                } catch (e) {
                    console.warn(`Could not parse date field '${field}' for target ${target.id}:`, originalValue);
                    rehydratedTarget[field] = null;
                 }
            }
        });
        // Rehydrate observation dates
        if (rehydratedTarget.observations && Array.isArray(rehydratedTarget.observations)) {
            rehydratedTarget.observations = rehydratedTarget.observations.map(obs => {
                let obsDateFinal = null;
                if (obs.date instanceof Timestamp) obsDateFinal = obs.date.toDate();
                else if (obs.date instanceof Date && !isNaN(obs.date)) obsDateFinal = obs.date;
                else if (obs.date) { // Try parsing if it's not already a Date or Timestamp
                   try {
                      const parsedObsDate = new Date(obs.date);
                      if (!isNaN(parsedObsDate.getTime())) obsDateFinal = parsedObsDate;
                   } catch(e) { /* ignore parse error */ }
                }
                return { ...obs, date: obsDateFinal };
            });
        } else {
            rehydratedTarget.observations = []; // Ensure it's an empty array if missing or invalid
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
    const zeroInteractionSection = document.getElementById('zeroInteractionSection');
    const mainReportContainer = document.getElementById('mainReportContainer');

    if (user) {
        let providerType = 'E-mail/Senha';
        if (user.providerData[0]?.providerId === 'google.com') providerType = 'Google';
        authStatus.textContent = `Autenticado: ${user.email} (via ${providerType})`;
        btnLogout.style.display = 'inline-block';
        if (mainMenu) mainMenu.style.display = 'block'; // Or 'flex' depending on CSS
        if (mainMenuSeparator) mainMenuSeparator.style.display = 'block';

        // Load report data ONLY if authenticated
        loadPerseveranceReport(user.uid);

    } else {
        authStatus.textContent = "Nenhum usuário autenticado. Faça login na página inicial.";
        btnLogout.style.display = 'none';
        if (mainMenu) mainMenu.style.display = 'none';
        if (mainMenuSeparator) mainMenuSeparator.style.display = 'none';

        // Hide report sections and clear lists
        if(zeroInteractionSection) zeroInteractionSection.style.display = 'none';
        if(mainReportContainer) mainReportContainer.style.display = 'none';
        const zeroList = document.getElementById('zeroInteractionList');
        const reportList = document.getElementById('reportList');
        const pagination = document.getElementById('pagination');
        if(zeroList) zeroList.innerHTML = '';
        if(reportList) reportList.innerHTML = '';
        if(pagination) pagination.innerHTML = '';

        // Reset global data arrays
        allTargetsForReport = [];
        filteredTargetsForReport = [];
        zeroInteractionTargets = [];
    }
}

onAuthStateChanged(auth, (user) => {
    updateAuthUIReport(user);
});

document.getElementById('btnLogoutReport')?.addEventListener('click', () => {
    signOut(auth).then(() => {
        console.log("Usuário deslogado.");
        // Redirect to index.html after logout from report page
        window.location.href = 'index.html';
    }).catch((error) => {
        console.error("Erro ao sair:", error);
    });
});
// === FIM Lógica de Autenticação ===


// === Carregamento e Renderização do Relatório ===

async function loadPerseveranceReport(userId) {
    console.log(`[loadPerseveranceReport] Carregando relatório para ${userId}`);
    const zeroInteractionSection = document.getElementById('zeroInteractionSection');
    const mainReportContainer = document.getElementById('mainReportContainer');
    const zeroInteractionListDiv = document.getElementById('zeroInteractionList');
    const reportListDiv = document.getElementById('reportList');

    // Show containers and loading messages
    if(zeroInteractionSection) zeroInteractionSection.style.display = 'block';
    if(mainReportContainer) mainReportContainer.style.display = 'block';
    if(zeroInteractionListDiv) zeroInteractionListDiv.innerHTML = '<p>Carregando alvos sem interação...</p>';
    if(reportListDiv) reportListDiv.innerHTML = '<p>Carregando relatório principal...</p>';

    try {
        await fetchAllTargetsForReport(userId);
        await processAndRenderZeroInteraction(userId);

        // Define filtros iniciais (ex: Ativos) e renderiza o relatório principal
        const filterAtivo = document.getElementById('filterAtivo');
        const filterArquivado = document.getElementById('filterArquivado');
        const filterRespondido = document.getElementById('filterRespondido');
        if(filterAtivo) filterAtivo.checked = true;
        if(filterArquivado) filterArquivado.checked = false;
        if(filterRespondido) filterRespondido.checked = false;

        applyFiltersAndRenderMainReport(); // Apply default filters and render

    } catch (error) {
        console.error("Erro ao carregar dados do relatório:", error);
        if(zeroInteractionListDiv) zeroInteractionListDiv.innerHTML = '<p class="error-message">Erro ao carregar alvos sem interação.</p>';
        if(reportListDiv) reportListDiv.innerHTML = '<p class="error-message">Erro ao carregar relatório principal.</p>';
    }
}

async function fetchAllTargetsForReport(userId) {
    allTargetsForReport = []; // Reset before fetching
    try {
        const activeTargetsRef = collection(db, "users", userId, "prayerTargets");
        const activeSnapshot = await getDocs(query(activeTargetsRef, orderBy("date", "desc")));
        const activeRaw = activeSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, status: 'ativo' }));

        const archivedTargetsRef = collection(db, "users", userId, "archivedTargets");
        // Sort archived by a composite date: resolution first, then archive, then creation
        const archivedSnapshot = await getDocs(query(archivedTargetsRef)); // Fetch all first
        let archivedRaw = archivedSnapshot.docs.map(doc => {
            const data = doc.data();
            // Determine sort date: resolution > archived > creation
            let sortDateSource = data.resolutionDate || data.archivedDate || data.date;
             // Convert Timestamps to milliseconds for reliable sorting if needed, or let rehydrate handle it
            // Ensure we handle cases where dates might be null
            let sortDate = null;
            if (sortDateSource instanceof Timestamp) {
                 sortDate = sortDateSource.toDate();
            } else if (sortDateSource instanceof Date) {
                 sortDate = sortDateSource;
            } // Add parsing logic if needed for older string dates

            return {
                ...data,
                id: doc.id,
                status: data.resolved ? 'respondido' : 'arquivado',
                // Store the resolved Date object for sorting
                archiveSortDate: sortDate
             };
        });

         // Sort the raw archived array *after* determining the sort date
         archivedRaw.sort((a, b) => {
             const timeA = a.archiveSortDate instanceof Date ? a.archiveSortDate.getTime() : 0;
             const timeB = b.archiveSortDate instanceof Date ? b.archiveSortDate.getTime() : 0;
             return timeB - timeA; // Descending order (most recent first)
         });


        // Combine and rehydrate
        allTargetsForReport = rehydrateTargets([...activeRaw, ...archivedRaw]);
        console.log(`[fetchAllTargetsForReport] Total de alvos carregados e reidratados: ${allTargetsForReport.length}`);

    } catch (error) {
        console.error("Erro ao buscar alvos para o relatório:", error);
        throw error; // Re-throw to be caught by loadPerseveranceReport
    }
}

async function processAndRenderZeroInteraction(userId) {
    const zeroInteractionListDiv = document.getElementById('zeroInteractionList');
    if (!zeroInteractionListDiv) return; // Safety check
    zeroInteractionListDiv.innerHTML = '<p>Processando interações...</p>';
    zeroInteractionTargets = []; // Reset

    // Filter only currently active targets from the combined list
    const activeTargets = allTargetsForReport.filter(t => t.status === 'ativo');
    if (activeTargets.length === 0) {
        zeroInteractionListDiv.innerHTML = '<p>Nenhum alvo ativo encontrado.</p>';
        return;
    }

    const now = new Date();
    const currentMonthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    console.log(`[processAndRenderZeroInteraction] Verificando interações para o mês: ${currentMonthYear}`);

    const promises = activeTargets.map(async (target) => {
        if (!target || !target.id) return null; // Skip invalid targets
        try {
            const clickCountsRef = doc(db, "prayerClickCounts", target.id);
            const clickSnap = await getDoc(clickCountsRef);
            let hasInteractionThisMonth = false;
            if (clickSnap.exists()) {
                const clickData = clickSnap.data();
                // Check if the monthlyClicks map exists and has an entry for the current month
                if (clickData.monthlyClicks && clickData.monthlyClicks[currentMonthYear] > 0) {
                    hasInteractionThisMonth = true;
                }
            }
            // If NO interaction this month, return the target
            if (!hasInteractionThisMonth) {
                // console.log(`   - Target ${target.title} (${target.id}) SEM interação este mês.`);
                return target;
             } else {
                 // console.log(`   - Target ${target.title} (${target.id}) COM interação este mês.`);
                 return null; // Has interaction, filter it out
             }
        } catch (error) {
            console.error(`Erro ao verificar cliques para ${target.id} (${target.title}):`, error);
             return null; // Treat as error, don't include in zero list
        }
    });

    try {
        const results = await Promise.all(promises);
        // Filter out the null results (targets with interaction or errors)
        zeroInteractionTargets = results.filter(target => target !== null);
        console.log(`[processAndRenderZeroInteraction] Encontrados ${zeroInteractionTargets.length} alvos sem interação este mês.`);
        renderZeroInteractionList(zeroInteractionTargets);
    } catch (error) {
        console.error("[processAndRenderZeroInteraction] Erro no processamento Promise.all:", error);
        zeroInteractionListDiv.innerHTML = '<p class="error-message">Erro ao processar interações dos alvos.</p>';
    }
}

// --- Renderiza APENAS os nomes na seção "Sem Interação" ---
function renderZeroInteractionList(targets) {
    const listDiv = document.getElementById('zeroInteractionList');
    listDiv.innerHTML = ''; // Limpa

    if (!Array.isArray(targets)) {
        console.error("[renderZeroInteractionList] Input 'targets' is not an array.");
        listDiv.innerHTML = '<p class="error-message">Erro interno ao exibir lista.</p>';
        return;
    }

    if (targets.length === 0) {
        listDiv.innerHTML = '<p>Ótimo! Todos os alvos ativos tiveram interação (clique "Orei!") este mês.</p>';
        return;
    }

    const ul = document.createElement('ul');
    ul.classList.add('zero-interaction-name-list');

    // Sort targets by creation date ascending (oldest first)
    targets.sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));

    targets.forEach(target => {
        const li = document.createElement('li');
        li.textContent = target.title || 'Sem Título';
        ul.appendChild(li);
    });

    listDiv.appendChild(ul);
}


// --- Aplica filtros e renderiza a lista principal do relatório ---
function applyFiltersAndRenderMainReport() {
    const searchTerm = document.getElementById('searchReport')?.value.toLowerCase() || '';
    const showAtivo = document.getElementById('filterAtivo')?.checked || false;
    const showArquivado = document.getElementById('filterArquivado')?.checked || false;
    const showRespondido = document.getElementById('filterRespondido')?.checked || false;

    filteredTargetsForReport = allTargetsForReport.filter(target => {
        if (!target) return false; // Skip invalid entries

        // 1. Filter by Status Checkboxes
        const statusMatch = (showAtivo && target.status === 'ativo') ||
                           (showArquivado && target.status === 'arquivado') ||
                           (showRespondido && target.status === 'respondido');
        if (!statusMatch) return false;

        // 2. Filter by Search Term (if provided)
        if (searchTerm) {
            const titleMatch = target.title?.toLowerCase().includes(searchTerm);
            const detailsMatch = target.details?.toLowerCase().includes(searchTerm);
            // Check observations safely
            const observationMatch = Array.isArray(target.observations) &&
                 target.observations.some(obs => obs && obs.text && obs.text.toLowerCase().includes(searchTerm));
            // Must match at least one field if search term is present
            if (!titleMatch && !detailsMatch && !observationMatch) return false;
        }

        // If passed all filters, include it
        return true;
    });

    // Sort the filtered results (descending by appropriate date)
    filteredTargetsForReport.sort((a, b) => {
        // Use archiveSortDate (resolution > archived > creation) if available, otherwise creation date
        const dateA = a.archiveSortDate instanceof Date ? a.archiveSortDate : (a.date instanceof Date ? a.date : null);
        const dateB = b.archiveSortDate instanceof Date ? b.archiveSortDate : (b.date instanceof Date ? b.date : null);
        const timeA = dateA ? dateA.getTime() : 0;
        const timeB = dateB ? dateB.getTime() : 0;
        return timeB - timeA; // Descending order
    });

    currentReportPage = 1; // Reset to first page after filtering/sorting
    renderMainReportList(); // Render the filtered & sorted list
}

// --- Renderiza a lista principal com DADOS DE PERSEVERANÇA (Cliques) ---
function renderMainReportList() {
    const reportListDiv = document.getElementById('reportList');
    if (!reportListDiv) return; // Safety check
    reportListDiv.innerHTML = ''; // Clear previous items

    const startIndex = (currentReportPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const itemsToDisplay = filteredTargetsForReport.slice(startIndex, endIndex);

    if (itemsToDisplay.length === 0) {
        if (currentReportPage > 1) { // If not on page 1, maybe went past last page
            currentReportPage = Math.max(1, Math.ceil(filteredTargetsForReport.length / itemsPerPage)); // Go to last valid page or 1
            renderMainReportList(); // Re-render the correct page
        } else {
            reportListDiv.innerHTML = '<p>Nenhum alvo encontrado com os filtros selecionados.</p>';
        }
        renderReportPagination(); // Render pagination even if no items (might show page 1 of 0)
        return;
    }

    itemsToDisplay.forEach(target => {
        if (!target || !target.id) { console.warn("Skipping invalid target in renderMainReportList:", target); return; }

        const itemDiv = document.createElement('div');
        itemDiv.classList.add('report-item'); // Base class for styling
        // Add status-specific class for potential background/border styling via CSS if needed later
        // itemDiv.classList.add(`status-${target.status}`); // Example: adds status-ativo, status-arquivado etc.
        itemDiv.dataset.targetId = target.id;

        let statusLabel = '';
        switch (target.status) {
            case 'ativo': statusLabel = '<span class="status-tag status-ativo">Ativo</span>'; break;
            case 'arquivado': statusLabel = '<span class="status-tag status-arquivado">Arquivado</span>'; break;
            case 'respondido': statusLabel = '<span class="status-tag status-respondido">Respondido</span>'; break;
        }

        // Determine which date to show and its label based on status
        let dateToShow = target.date; // Default to creation date
        let dateLabel = "Criado em";
        if (target.status === 'respondido' && target.resolutionDate) {
            dateToShow = target.resolutionDate; dateLabel = "Respondido em";
        } else if (target.status === 'arquivado' && target.archivedDate) {
            dateToShow = target.archivedDate; dateLabel = "Arquivado em";
        }
        // For archived/resolved, also show time since creation for context
        const timeSinceCreation = timeElapsed(target.date);


        // Get last observation safely
        let observationsHTML = '';
        if (Array.isArray(target.observations) && target.observations.length > 0) {
             // Sort observations by date descending to find the latest
             const sortedObservations = [...target.observations].sort((a,b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
             const lastObservation = sortedObservations[0];
             if (lastObservation && lastObservation.text) {
                  const obsTextShort = lastObservation.text.substring(0, 100) + (lastObservation.text.length > 100 ? '...' : '');
                  const obsDateFormatted = formatDateForDisplay(lastObservation.date);
                  observationsHTML = `<p><i>Última Obs (${obsDateFormatted}): ${obsTextShort}</i></p>`;
             }
        }

        // HTML structure with corrected comments
        itemDiv.innerHTML = `
            <h3>${statusLabel} ${target.title || 'Sem Título'}</h3>
            <p>${dateLabel}: ${formatDateForDisplay(dateToShow)} (${timeSinceCreation} desde criação)</p>
            ${target.details ? `<p><i>${target.details.substring(0, 150)}${target.details.length > 150 ? '...' : ''}</i></p>` : ''}
            ${observationsHTML} <!-- Display last observation summary -->
            <div class="click-stats">
                <p>Perseverança (Cliques 'Orei!'):</p>
                <ul>
                    <li>Total: <span id="clicks-total-${target.id}">...</span></li>
                    <li>Este Mês: <span id="clicks-month-${target.id}">...</span></li>
                    <li>Este Ano: <span id="clicks-year-${target.id}">...</span></li>
                    <!-- <li>Última Oração: <span id="clicks-last-${target.id}">...</span></li> --> <!-- Commented out, fetch if needed -->
                </ul>
            </div>
        `;
        reportListDiv.appendChild(itemDiv);

        // Fetch and display the click counts for this specific target
        fetchAndDisplayClickCount(target.id, itemDiv);
    });

    renderReportPagination(); // Update pagination based on the filtered list
}


// --- Busca e exibe os dados de cliques para um alvo específico ---
async function fetchAndDisplayClickCount(targetId, itemDiv) {
    // Find the specific span elements within the itemDiv passed as argument
    const totalSpan = itemDiv.querySelector(`#clicks-total-${targetId}`);
    const monthSpan = itemDiv.querySelector(`#clicks-month-${targetId}`);
    const yearSpan = itemDiv.querySelector(`#clicks-year-${targetId}`);
    // const lastSpan = itemDiv.querySelector(`#clicks-last-${targetId}`); // Uncomment if using last click

    // If any span is missing, we can't update, so return early.
    if (!totalSpan || !monthSpan || !yearSpan /*|| !lastSpan*/) {
         console.warn(`Missing click count spans for target ${targetId}`);
         return;
     }

    try {
        const clickCountsRef = doc(db, "prayerClickCounts", targetId);
        const clickSnap = await getDoc(clickCountsRef);

        if (clickSnap.exists()) {
            const data = clickSnap.data();
            const now = new Date();
            // Key for monthly map: YYYY-MM
            const currentMonthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            // Key for yearly map: YYYY
            const currentYear = now.getFullYear().toString();

            // Update spans with data, using 0 as default if fields are missing
            totalSpan.textContent = data.totalClicks || 0;
            monthSpan.textContent = (data.monthlyClicks && data.monthlyClicks[currentMonthYear]) || 0;
            yearSpan.textContent = (data.yearlyClicks && data.yearlyClicks[currentYear]) || 0;

            // Optionally display last click date
            // if (lastSpan && data.lastClickTimestamp instanceof Timestamp) {
            //     lastSpan.textContent = formatDateForDisplay(data.lastClickTimestamp.toDate());
            // } else if (lastSpan) {
            //     lastSpan.textContent = 'N/A';
            // }

        } else {
            // If the document doesn't exist, set all counts to 0
            totalSpan.textContent = '0';
            monthSpan.textContent = '0';
            yearSpan.textContent = '0';
            // if(lastSpan) lastSpan.textContent = 'N/A';
        }
    } catch (error) {
        console.error(`Erro ao buscar cliques para ${targetId}:`, error);
        // Display 'Error' in spans if fetching fails
        totalSpan.textContent = 'Erro';
        monthSpan.textContent = 'Erro';
        yearSpan.textContent = 'Erro';
        // if(lastSpan) lastSpan.textContent = 'Erro';
    }
}


// --- Renderiza a paginação para a lista principal ---
function renderReportPagination() {
    const paginationDiv = document.getElementById('pagination');
    if(!paginationDiv) return; // Safety check

    paginationDiv.innerHTML = ''; // Clear previous pagination
    const totalItems = filteredTargetsForReport.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);

    // Hide pagination if only one page or no items
    if (totalPages <= 1) {
        paginationDiv.style.display = 'none';
        return;
    } else {
        // Ensure it's displayed if there are multiple pages
         paginationDiv.style.display = 'flex'; // Use flex for alignment styles in CSS
    }

    // Previous Button
    if (currentReportPage > 1) {
        const prevLink = document.createElement('a');
        prevLink.href = '#';
        prevLink.textContent = '« Anterior';
        prevLink.classList.add('page-link');
        prevLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (currentReportPage > 1) {
                currentReportPage--;
                renderMainReportList(); // Re-render the list for the new page
                 // Scroll to the top of the report container for better UX
                 document.getElementById('mainReportContainer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
        paginationDiv.appendChild(prevLink);
    } else {
         // Add a placeholder span for alignment if on the first page
         const placeholder = document.createElement('span');
         placeholder.style.visibility = 'hidden'; // Keep space but invisible
         placeholder.classList.add('page-link'); // Use same class for size/padding
         placeholder.textContent = '« Anterior'; // Match text length for spacing
         paginationDiv.appendChild(placeholder);
    }


    // Page Indicator (e.g., "Página 2 de 5")
    const pageIndicator = document.createElement('span');
    pageIndicator.textContent = ` Página ${currentReportPage} de ${totalPages} `;
    pageIndicator.style.margin = "0 10px"; // Add some horizontal spacing
    paginationDiv.appendChild(pageIndicator);

    // Next Button
    if (currentReportPage < totalPages) {
        const nextLink = document.createElement('a');
        nextLink.href = '#';
        nextLink.textContent = 'Próxima »';
        nextLink.classList.add('page-link');
        nextLink.addEventListener('click', (e) => {
            e.preventDefault();
             if (currentReportPage < totalPages) {
                currentReportPage++;
                renderMainReportList(); // Re-render the list for the new page
                 // Scroll to the top of the report container
                 document.getElementById('mainReportContainer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
        paginationDiv.appendChild(nextLink);
    } else {
         // Add a placeholder span for alignment if on the last page
         const placeholder = document.createElement('span');
         placeholder.style.visibility = 'hidden';
         placeholder.classList.add('page-link');
         placeholder.textContent = 'Próxima »';
         paginationDiv.appendChild(placeholder);
    }
}

// === Event Listeners ===
// Input listeners trigger filtering immediately
document.getElementById('searchReport')?.addEventListener('input', applyFiltersAndRenderMainReport);
document.getElementById('filterAtivo')?.addEventListener('change', applyFiltersAndRenderMainReport);
document.getElementById('filterArquivado')?.addEventListener('change', applyFiltersAndRenderMainReport);
document.getElementById('filterRespondido')?.addEventListener('change', applyFiltersAndRenderMainReport);

// Button listeners for navigation and predefined filters
document.getElementById('backToMainButton')?.addEventListener('click', () => window.location.href = 'index.html');

document.getElementById('viewAllTargetsButton')?.addEventListener('click', () => {
    // Select all status checkboxes and apply filters
    const filterAtivo = document.getElementById('filterAtivo');
    const filterArquivado = document.getElementById('filterArquivado');
    const filterRespondido = document.getElementById('filterRespondido');
    if(filterAtivo) filterAtivo.checked = true;
    if(filterArquivado) filterArquivado.checked = true;
    if(filterRespondido) filterRespondido.checked = true;
    applyFiltersAndRenderMainReport();
});
document.getElementById('viewArchivedButton')?.addEventListener('click', () => {
    // Select only Arquivado checkbox and apply filters
    const filterAtivo = document.getElementById('filterAtivo');
    const filterArquivado = document.getElementById('filterArquivado');
    const filterRespondido = document.getElementById('filterRespondido');
    if(filterAtivo) filterAtivo.checked = false;
    if(filterArquivado) filterArquivado.checked = true;
    if(filterRespondido) filterRespondido.checked = false;
    applyFiltersAndRenderMainReport();
});
document.getElementById('viewResolvedButton')?.addEventListener('click', () => {
    // Select only Respondido checkbox and apply filters
    const filterAtivo = document.getElementById('filterAtivo');
    const filterArquivado = document.getElementById('filterArquivado');
    const filterRespondido = document.getElementById('filterRespondido');
    if(filterAtivo) filterAtivo.checked = false;
    if(filterArquivado) filterArquivado.checked = false;
    if(filterRespondido) filterRespondido.checked = true;
    applyFiltersAndRenderMainReport();
});

// === Inicialização ===
// A inicialização principal (carregamento de dados) é controlada pelo onAuthStateChanged.
// Quando o estado de autenticação muda, updateAuthUIReport é chamado,
// e se houver um usuário, loadPerseveranceReport é acionado.