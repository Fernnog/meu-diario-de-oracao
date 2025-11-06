// script.js (Orquestrador Principal da Aplicação - Versão Refatorada)
// ARQUITETURA ATUALIZADA: Delega a lógica de ações para um módulo dedicado (action-handler.js).

// --- MÓDulos ---
import * as Auth from './auth.js';
import * as Service from './firestore-service.js';
import * as UI from './ui.js';
import { initializeFloatingNav, updateFloatingNavVisibility } from './floating-nav.js';
import { formatDateForDisplay, generateAndDownloadPdf } from './utils.js';
import * as GoogleDriveService from './google-drive-service.js';
import { updateDriveStatusUI } from './ui.js';
import { APP_VERSION, CHANGELOG } from './config.js';
import * as ActionHandler from './action-handler.js'; // NOVO: Módulo para a lógica de ações

/**
 * Configura um ou mais textareas para crescerem automaticamente em altura.
 * @param {string} selector - Um seletor CSS para os textareas.
 */
function setupAutoGrowTextarea(selector) {
    document.body.addEventListener('input', (event) => {
        if (event.target.matches(selector)) {
            const textarea = event.target;
            textarea.style.height = 'auto'; // Reseta a altura para recalcular
            textarea.style.overflowY = 'hidden'; // Oculta a barra de rolagem temporariamente
            
            // Define a nova altura com base no conteúdo
            const newHeight = textarea.scrollHeight;
            textarea.style.height = `${newHeight}px`;

            // Mostra a barra de rolagem apenas se a altura máxima for atingida
            if (textarea.scrollHeight > textarea.clientHeight) {
                textarea.style.overflowY = 'auto';
            }
        }
    });
}

// --- ESTADO DA APLICAÇÃO ---
let state = {
    user: null,
    prayerTargets: [],
    archivedTargets: [],
    resolvedTargets: [],
    perseveranceData: { consecutiveDays: 0, recordDays: 0, lastInteractionDate: null },
    weeklyPrayerData: { weekId: null, interactions: {} },
    dailyTargets: { pending: [], completed: [], targetIds: [] },
    pagination: {
        mainPanel: { currentPage: 1, targetsPerPage: 10 },
        archivedPanel: { currentPage: 1, targetsPerPage: 10 },
        resolvedPanel: { currentPage: 1, targetsPerPage: 10 },
    },
    filters: {
        mainPanel: { searchTerm: '', showDeadlineOnly: false, showExpiredOnly: false, startDate: null, endDate: null, activeCategory: null },
        archivedPanel: { searchTerm: '', startDate: null, endDate: null },
        resolvedPanel: { searchTerm: '' },
    },
    isDriveEnabled: false
};

// --- FUNÇÃO AUXILIAR DE DATA ---
/**
 * Obtém a data no formato string YYYY-MM-DD, utilizando o padrão UTC.
 * @param {Date} date - O objeto de data a ser formatado.
 * @returns {string} - A data formatada.
 */
function getISODateString(date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// --- LÓGICA DE SINCRONIZAÇÃO COM GOOGLE DRIVE (COM DEBOUNCE) ---

// Mapa para guardar os temporizadores do debounce para cada alvo
const syncDebounceTimers = new Map();

// Função auxiliar para encontrar o alvo em qualquer lista do estado (usada localmente pela sincronização)
const findTargetInStateForSync = (targetId) => {
    let target = state.prayerTargets.find(t => t.id === targetId);
    if (target) return { target, isArchived: false, panelId: 'mainPanel' };
    target = state.archivedTargets.find(t => t.id === targetId);
    if (target) return { target, isArchived: true, panelId: 'archivedPanel' };
    target = state.resolvedTargets.find(t => t.id === targetId);
    if (target) return { target, isArchived: true, panelId: 'resolvedPanel' };
    return { target: null, isArchived: null, panelId: null };
};

/**
 * Função central para sincronizar um alvo específico com o Google Drive.
 * @param {string} targetId - O ID do alvo a ser sincronizado.
 */
async function syncTarget(targetId) {
    if (!state.isDriveEnabled) {
        console.warn("[Sync] Sincronização abortada: o serviço do Drive não está habilitado.");
        return;
    }

    const { target, isArchived, panelId } = findTargetInStateForSync(targetId);
    if (!target) {
        console.error("syncTarget: Alvo não encontrado no estado para o ID:", targetId);
        return;
    }

    try {
        target.driveStatus = 'syncing';
        delete target.driveErrorMessage;
        applyFiltersAndRender(panelId);

        const result = await GoogleDriveService.backupTargetToDrive(target, target.googleDocId);

        if (result.success && result.docId !== target.googleDocId) {
            await Service.updateTargetField(state.user.uid, targetId, isArchived, { googleDocId: result.docId });
            target.googleDocId = result.docId;
        }
        
        target.driveStatus = 'synced';
        console.log(`Alvo '${target.title}' sincronizado com sucesso.`);

    } catch (error) {
    console.error(`%c[App] Erro CRÍTICO ao sincronizar o alvo '${target.title}'.`, 'color: red; font-weight: bold;');
    console.error('Objeto do Erro:', error);
    target.driveStatus = 'error';
    UI.showToast(`Erro ao sincronizar "${target.title}" com o Drive.`, "error");
} finally {
    applyFiltersAndRender(panelId);
}
}

/**
 * Solicita uma sincronização para um alvo, aplicando um debounce.
 * @param {string} targetId - O ID do alvo a ser sincronizado.
 */
function requestSync(targetId) {
    if (syncDebounceTimers.has(targetId)) {
        clearTimeout(syncDebounceTimers.get(targetId));
    }

    console.log(`[Debounce] Sincronização para o alvo ${targetId} agendada em 2 segundos.`);
    const timer = setTimeout(() => {
        console.log(`[Debounce] Executando sincronização para o alvo ${targetId}.`);
        syncTarget(targetId);
        syncDebounceTimers.delete(targetId);
    }, 2000);

    syncDebounceTimers.set(targetId, timer);
}

async function handleForceSync() {
    if (!state.isDriveEnabled) {
        UI.showToast("Conecte-se ao Google Drive para forçar a sincronização.", "error");
        return;
    }
    
    if (!confirm("Deseja forçar a sincronização de todos os alvos com o Google Drive agora? Isso pode levar um momento.")) return;

    const forceSyncButton = document.getElementById('forceDriveSyncButton');
    forceSyncButton.disabled = true;

    UI.updateDriveStatusUI('syncing', 'Iniciando sincronização...');
    UI.showToast("Iniciando sincronização manual completa...", "info");

    const allTargetsToSync = [...state.prayerTargets, ...state.archivedTargets, ...state.resolvedTargets];
    allTargetsToSync.forEach(t => {
        t.driveStatus = 'pending';
        delete t.driveErrorMessage;
    });
    
    applyFiltersAndRender('mainPanel');
    applyFiltersAndRender('archivedPanel');
    applyFiltersAndRender('resolvedPanel');

    let hasErrors = false;
    try {
        for (let i = 0; i < allTargetsToSync.length; i++) {
            const target = allTargetsToSync[i];
            UI.updateDriveStatusUI('syncing', `Sincronizando ${i + 1} de ${allTargetsToSync.length}...`);
            await new Promise(resolve => setTimeout(resolve, 200)); 
            await syncTarget(target.id);
            if (target.driveStatus === 'error') {
                hasErrors = true;
            }
        }
        
        if (hasErrors) {
            UI.showToast("Sincronização concluída com alguns erros.", "error");
        } else {
            UI.showToast("Sincronização manual concluída com sucesso!", "success");
        }

    } catch (error) {
        console.error("Erro inesperado durante a sincronização em massa:", error);
        UI.showToast("Ocorreu um erro inesperado durante a sincronização.", "error");
        UI.updateDriveStatusUI('error', 'Falha na Sincronização');
        hasErrors = true;
    } finally {
        if (hasErrors) {
            UI.updateDriveStatusUI('error', 'Falha em um ou mais itens');
        } else {
            UI.updateDriveStatusUI('connected');
        }
        forceSyncButton.disabled = false;
    }
}

/**
 * Verifica se todos os alvos prioritários foram concluídos e atualiza a UI.
 */
function checkAndCollapsePriorityPanel() {
    if (!state.user || !state.prayerTargets.length) {
        UI.updatePriorityPanelState(false);
        return;
    }

    const priorityTargets = state.prayerTargets.filter(t => t.isPriority);
    if (priorityTargets.length === 0) {
        UI.updatePriorityPanelState(false);
        return;
    }

    const completedTargetIds = new Set(state.dailyTargets.completed.map(t => t.id || t.targetId));
    
    const allPrioritiesCompleted = priorityTargets.every(pTarget => 
        completedTargetIds.has(pTarget.id)
    );

    UI.updatePriorityPanelState(allPrioritiesCompleted);
}

// =================================================================
// === LÓGICA DE AUTENTICAÇÃO E FLUXO DE DADOS ===
// =================================================================

async function handleGoogleSignIn() {
    try {
        console.log("[App] Iniciando o fluxo de login com Google...");
        const { user, accessToken } = await Auth.signInWithGoogle();

        if (accessToken) {
            console.log('%c[App] Access Token recebido com sucesso.', 'color: green; font-weight: bold;', accessToken);
        } else {
            console.error('%c[App] Access Token NÃO foi recebido do Firebase Auth.', 'color: red; font-weight: bold;');
            return;
        }
        
        if (user && accessToken) {
            console.log("[App] Login com Google bem-sucedido. Usuário:", user.uid);
            UI.showToast("Autenticado com Google. Inicializando o serviço do Drive...", "info");
            
            console.log("[App] Tentando inicializar o GoogleDriveService...");
            const initialized = await GoogleDriveService.initializeDriveService(accessToken);
            
            if (initialized) {
                console.log("[App] GoogleDriveService INICIALIZADO com sucesso.");
                state.isDriveEnabled = true;
                UI.updateDriveStatusUI('connected');
                UI.showToast("Conexão com Google Drive estabelecida!", "success");
                if (state.user) {
                   await loadDataForUser(state.user);
                }
            } else {
                 console.error("[App] Falha na inicialização do GoogleDriveService, mas sem erro lançado.");
            }
        }
    } catch (error) {
        console.error("[App] Erro CRÍTICO no fluxo de login com Google ou na inicialização do Drive:", error);
        UI.showToast(error.message, "error");
        UI.updateDriveStatusUI('error');
        state.isDriveEnabled = false;
    }
}

function applyFiltersAndRender(panelId) {
    if (!panelId || !state.pagination[panelId] || !state.filters[panelId]) return;

    const panelState = state.pagination[panelId];
    const panelFilters = state.filters[panelId];
    let sourceData = [];

    if (panelId === 'mainPanel') sourceData = state.prayerTargets;
    if (panelId === 'archivedPanel') sourceData = state.archivedTargets;
    if (panelId === 'resolvedPanel') sourceData = state.resolvedTargets;

    let filteredData = sourceData.filter(target => {
        const searchTerm = panelFilters.searchTerm.toLowerCase();
        const matchesSearch = searchTerm === '' ||
            (target.title && target.title.toLowerCase().includes(searchTerm)) ||
            (target.details && target.details.toLowerCase().includes(searchTerm)) ||
            (target.category && target.category.toLowerCase().includes(searchTerm)) ||
            (target.observations && target.observations.some(obs =>
                (obs.text && obs.text.toLowerCase().includes(searchTerm)) ||
                (obs.subTargetTitle && obs.subTargetTitle.toLowerCase().includes(searchTerm))
            ));
        if (!matchesSearch) return false;

        if (panelId === 'mainPanel') {
            const activeCategory = panelFilters.activeCategory;
            if (activeCategory && target.category !== activeCategory) {
                return false;
            }
            
            const now = new Date();
            const todayUTCStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
            if (panelFilters.showDeadlineOnly && !target.hasDeadline) return false;
            if (panelFilters.showExpiredOnly) {
                if (!target.hasDeadline || !target.deadlineDate || target.deadlineDate.getTime() >= todayUTCStart.getTime()) {
                    return false;
                }
            }
        }
        
        if (panelFilters.startDate) {
            const startDate = new Date(panelFilters.startDate + 'T00:00:00Z');
            if (target.date < startDate) return false;
        }
        if (panelFilters.endDate) {
            const endDate = new Date(panelFilters.endDate + 'T23:59:59Z');
            if (target.date > endDate) return false;
        }

        return true;
    });

    const { currentPage, targetsPerPage } = panelState;
    const startIndex = (currentPage - 1) * targetsPerPage;
    const paginatedData = filteredData.slice(startIndex, startIndex + targetsPerPage);

    switch (panelId) {
        case 'mainPanel': UI.renderTargets(paginatedData, filteredData.length, currentPage, targetsPerPage); break;
        case 'archivedPanel': UI.renderArchivedTargets(paginatedData, filteredData.length, currentPage, targetsPerPage); break;
        case 'resolvedPanel': UI.renderResolvedTargets(paginatedData, filteredData.length, currentPage, targetsPerPage); break;
    }
}

async function loadDataForUser(user) {
    try {
        const [prayerData, archivedData, perseveranceData, weeklyData] = await Promise.all([
            Service.fetchPrayerTargets(user.uid),
            Service.fetchArchivedTargets(user.uid),
            Service.loadPerseveranceData(user.uid),
            Service.loadWeeklyPrayerData(user.uid)
        ]);

        if (perseveranceData.lastInteractionDate) {
            const today = new Date();
            const yesterday = new Date();
            yesterday.setUTCDate(today.getUTCDate() - 1);

            const todayStr = getISODateString(today);
            const yesterdayStr = getISODateString(yesterday);
            const lastDateStr = getISODateString(perseveranceData.lastInteractionDate);

            if (lastDateStr !== todayStr && lastDateStr !== yesterdayStr) {
                await Service.resetConsecutiveDays(user.uid);
                perseveranceData.consecutiveDays = 0;
                UI.showToast("Sua sequência de perseverança foi reiniciada por inatividade.", "info");
            }
        }

        state.user = user;
        state.prayerTargets = prayerData.map(t => ({ ...t, driveStatus: 'pending' }));
        const allArchived = archivedData.map(t => ({ ...t, driveStatus: 'pending' }));
        state.archivedTargets = allArchived.filter(t => !t.resolved);
        state.resolvedTargets = allArchived.filter(t => t.resolved);
        
        const activeCategories = [...new Set(state.prayerTargets.map(t => t.category).filter(Boolean))];
        UI.renderCategoryFilters('mainCategoryFilters', activeCategories);
        
        state.perseveranceData = perseveranceData;
        state.weeklyPrayerData = weeklyData;
        const dailyTargetsData = await Service.loadDailyTargets(user.uid, state.prayerTargets);
        state.dailyTargets = dailyTargetsData;

        applyFiltersAndRender('mainPanel');
        applyFiltersAndRender('archivedPanel');
        applyFiltersAndRender('resolvedPanel');
        UI.renderDailyTargets(state.dailyTargets.pending, state.dailyTargets.completed);
        UI.renderPriorityTargets(state.prayerTargets, state.dailyTargets);
        UI.updatePerseveranceUI(state.perseveranceData);
        UI.updateWeeklyChart(state.weeklyPrayerData);
        UI.showPanel('dailySection');

        if (state.isDriveEnabled) {
            console.log('[App] Iniciando sincronização em massa para todos os alvos...');
            UI.showToast('Iniciando sincronização com o Google Drive...', 'info');
            handleForceSync();
        } else {
            UI.updateDriveStatusUI('disconnected');
        }
        
        const now = new Date();
        const todayUTCStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const expiredTargets = state.prayerTargets.filter(target =>
            target.hasDeadline && target.deadlineDate && target.deadlineDate.getTime() < todayUTCStart.getTime()
        );
        if (expiredTargets.length > 0) {
            UI.showExpiredTargetsToast(expiredTargets);
        }
        updateFloatingNavVisibility(state);

        UI.updateVersionInfo(APP_VERSION);

        checkAndCollapsePriorityPanel();

    } catch (error) {
        console.error("[App] Error during data loading process:", error);
        UI.showToast("Ocorreu um erro crítico ao carregar seus dados.", "error");
        handleLogoutState();
    } finally {
        UI.hideSplashScreen();
    }
}

function handleLogoutState() {
    state = { user: null, prayerTargets: [], archivedTargets: [], resolvedTargets: [], perseveranceData: { consecutiveDays: 0, recordDays: 0, lastInteractionDate: null }, weeklyPrayerData: { weekId: null, interactions: {} }, dailyTargets: { pending: [], completed: [], targetIds: [] }, pagination: { mainPanel: { currentPage: 1, targetsPerPage: 10 }, archivedPanel: { currentPage: 1, targetsPerPage: 10 }, resolvedPanel: { currentPage: 1, targetsPerPage: 10 }}, filters: { mainPanel: { searchTerm: '', showDeadlineOnly: false, showExpiredOnly: false, startDate: null, endDate: null, activeCategory: null }, archivedPanel: { searchTerm: '', startDate: null, endDate: null }, resolvedPanel: { searchTerm: '' }}, isDriveEnabled: false };
    UI.renderTargets([], 0, 1, 10); UI.renderArchivedTargets([], 0, 1, 10); UI.renderResolvedTargets([], 0, 1, 10); UI.renderDailyTargets([], []); UI.resetPerseveranceUI(); UI.resetWeeklyChart(); UI.showPanel('authSection');
    UI.updateDriveStatusUI('disconnected');
    updateFloatingNavVisibility(state);
}

async function handleAddNewTarget(event) {
    event.preventDefault();
    if (!state.user) return UI.showToast("Você precisa estar logado.", "error");
    const title = document.getElementById('title').value.trim();
    if (!title) return UI.showToast("O título é obrigatório.", "error");
    const hasDeadline = document.getElementById('hasDeadline').checked;
    const deadlineValue = document.getElementById('deadlineDate').value;
    if (hasDeadline && !deadlineValue) return UI.showToast("Selecione uma data para o prazo.", "error");
    const isPriority = document.getElementById('isPriority').checked;

    const newTarget = {
        title: title,
        details: document.getElementById('details').value.trim(),
        date: new Date(document.getElementById('date').value + 'T12:00:00Z'),
        hasDeadline: hasDeadline,
        deadlineDate: hasDeadline ? new Date(deadlineValue + 'T12:00:00Z') : null,
        category: document.getElementById('categorySelect').value,
        observations: [],
        resolved: false,
        isPriority: isPriority,
        googleDocId: null 
    };
    try {
        await Service.addNewPrayerTarget(state.user.uid, newTarget);
        UI.showToast("Alvo adicionado com sucesso!", "success");
        document.getElementById('prayerForm').reset();
        document.getElementById('deadlineContainer').style.display = 'none';

        await loadDataForUser(state.user);
        
        const newTargetInState = state.prayerTargets.find(t => t.title === newTarget.title && !t.googleDocId);

        if (newTargetInState) {
            console.log(`[App] Disparando sincronização IMEDIATA para o novo alvo ID: ${newTargetInState.id}`);
            await syncTarget(newTargetInState.id);
        } else {
            console.error("[App] Não foi possível encontrar o alvo recém-criado no estado para iniciar a sincronização.");
        }

        UI.showPanel('mainPanel');
    } catch (error) {
        console.error("Erro ao adicionar novo alvo:", error);
        UI.showToast("Falha ao adicionar alvo: " + error.message, "error");
    }
}

// =================================================================
// === Handlers de Ação Dedicados (Exceções que permanecem aqui) ===
// =================================================================

async function handlePray(targetId) {
    const targetToPray = state.prayerTargets.find(t => t.id === targetId);
    if (!targetToPray || state.dailyTargets.completed.some(t => t.id === targetId)) return;

    const targetIndex = state.dailyTargets.pending.findIndex(t => t.id === targetId);
    if (targetIndex > -1) {
        const [movedTarget] = state.dailyTargets.pending.splice(targetIndex, 1);
        state.dailyTargets.completed.push(movedTarget);
    } else {
        state.dailyTargets.completed.push(targetToPray);
    }
    UI.renderDailyTargets(state.dailyTargets.pending, state.dailyTargets.completed);
    UI.renderPriorityTargets(state.prayerTargets, state.dailyTargets);
    
    UI.showToast(`Oração por "${targetToPray.title}" registrada!`, "success");

    try {
        await Service.updateDailyTargetStatus(state.user.uid, targetId, true);
        const { isNewRecord } = await Service.recordUserInteraction(state.user.uid, state.perseveranceData, state.weeklyPrayerData);
        const [perseveranceData, weeklyData] = await Promise.all([
            Service.loadPerseveranceData(state.user.uid),
            Service.loadWeeklyPrayerData(state.user.uid)
        ]);
        state.perseveranceData = perseveranceData;
        state.weeklyPrayerData = weeklyData;
        UI.updatePerseveranceUI(state.perseveranceData, isNewRecord);
        UI.updateWeeklyChart(state.weeklyPrayerData);

        if (targetToPray.isPriority) {
            const priorityTargets = state.prayerTargets.filter(t => t.isPriority);
            const allPriorityPrayed = priorityTargets.every(p =>
                state.dailyTargets.completed.some(c => c.id === p.id)
            );
            if (allPriorityPrayed) {
                setTimeout(() => {
                    UI.showToast("Parabéns! Você orou por todos os seus alvos prioritários de hoje!", "info");
                }, 500);
            }
        }
    } catch (error) {
        console.error("Erro ao processar 'Orei!':", error);
        UI.showToast("Erro ao registrar oração. Desfazendo.", "error");
        const completedIndex = state.dailyTargets.completed.findIndex(t => t.id === targetId);
        if (completedIndex > -1) {
            const [revertedTarget] = state.dailyTargets.completed.splice(completedIndex, 1);
            if (state.dailyTargets.targetIds.includes(targetId)) {
                 state.dailyTargets.pending.unshift(revertedTarget);
            }
        }
        UI.renderDailyTargets(state.dailyTargets.pending, state.dailyTargets.completed);
        UI.renderPriorityTargets(state.prayerTargets, state.dailyTargets);
    }
}

// ===============================================
// === PONTO DE ENTRADA DA APLICAÇÃO E EVENTOS ===
// ===============================================
document.addEventListener('DOMContentLoaded', () => {
    Auth.initializeAuth(async (user) => {
        if (user) {
            UI.updateAuthUI(user);
            try {
                await loadDataForUser(user);
            } catch (error) {
                console.error("[App] Erro crítico durante o carregamento dos dados. Revertendo para o estado de logout.", error);
                handleLogoutState();
            }
        } else {
            UI.updateAuthUI(null);
            handleLogoutState();
            UI.hideSplashScreen();
        }
    });

    // --- Listeners de Ações Gerais ---
    document.getElementById('btnConnectDrive').addEventListener('click', handleGoogleSignIn);
    document.getElementById('btnGoogleSignIn').addEventListener('click', handleGoogleSignIn);
    document.getElementById('btnLogout').addEventListener('click', () => Auth.handleSignOut());
    document.getElementById('prayerForm').addEventListener('submit', handleAddNewTarget);
    document.getElementById('backToMainButton').addEventListener('click', () => UI.showPanel('dailySection'));
    document.getElementById('addNewTargetButton').addEventListener('click', () => UI.showPanel('appContent'));
    document.getElementById('viewAllTargetsButton').addEventListener('click', () => UI.showPanel('mainPanel'));
    document.getElementById('viewArchivedButton').addEventListener('click', () => UI.showPanel('archivedPanel'));
    document.getElementById('viewResolvedButton').addEventListener('click', () => UI.showPanel('resolvedPanel'));
    document.getElementById('forceDriveSyncButton').addEventListener('click', handleForceSync);
    
    // --- Listeners da Seção Diária, Relatórios, Modais e Filtros ---
    document.getElementById('refreshDaily').addEventListener('click', async () => { if(confirm("Deseja gerar uma nova lista de alvos para hoje? A lista atual será substituída.")) { await Service.forceGenerateDailyTargets(state.user.uid, state.prayerTargets); await loadDataForUser(state.user); UI.showToast("Nova lista gerada!", "success"); } });
    document.getElementById('copyDaily').addEventListener('click', () => { const text = state.dailyTargets.pending.map(t => `- ${t.title}`).join('\n'); navigator.clipboard.writeText(text); UI.showToast("Alvos pendentes copiados!", "success"); });
    document.getElementById('viewDaily').addEventListener('click', () => { const allTargets = [...state.dailyTargets.pending, ...state.dailyTargets.completed]; const html = UI.generateViewHTML(allTargets, "Alvos do Dia"); const newWindow = window.open(); newWindow.document.write(html); newWindow.document.close(); });
    
    document.getElementById('addManualTargetButton').addEventListener('click', () => {
        const dailyTargetIds = new Set(state.dailyTargets.targetIds || []);
        const availableTargets = state.prayerTargets.filter(target => !dailyTargetIds.has(target.id));
        const suggestedTargets = [...availableTargets].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 3);
        const categories = [...new Set(availableTargets.map(t => t.category).filter(Boolean))];
        UI.renderManualSearchResults([], '', suggestedTargets, categories);
        UI.toggleManualTargetModal(true);
    });

    document.getElementById('generateViewButton').addEventListener('click', () => { const html = UI.generateViewHTML(state.prayerTargets, "Visualização de Alvos Ativos"); const newWindow = window.open(); newWindow.document.write(html); newWindow.document.close(); });
    document.getElementById('generateCategoryViewButton').addEventListener('click', () => { const allTargets = [...state.prayerTargets, ...state.archivedTargets, ...state.resolvedTargets]; UI.toggleCategoryModal(true, allTargets); });
    document.getElementById('viewResolvedViewButton').addEventListener('click', () => { UI.toggleDateRangeModal(true); });
    
    document.getElementById('viewPerseveranceReportButton').addEventListener('click', () => { 
        const reportData = { 
            ...state.perseveranceData, 
            lastInteractionDate: state.perseveranceData.lastInteractionDate ? formatDateForDisplay(state.perseveranceData.lastInteractionDate) : "Nenhuma",
            interactionDates: Object.keys(state.weeklyPrayerData.interactions || {}) 
        }; 
        const html = UI.generatePerseveranceReportHTML(reportData); 
        const newWindow = window.open(); 
        newWindow.document.write(html); 
        newWindow.document.close(); 
    });

    document.getElementById('viewInteractionReportButton').addEventListener('click', () => { window.location.href = 'orei.html'; });
    document.getElementById('closeDateRangeModal').addEventListener('click', () => UI.toggleDateRangeModal(false));
    document.getElementById('cancelDateRange').addEventListener('click', () => UI.toggleDateRangeModal(false));

    document.getElementById('generateResolvedView').addEventListener('click', () => { 
        const startDate = new Date(document.getElementById('startDate').value + 'T00:00:00Z'); 
        const endDate = new Date(document.getElementById('endDate').value + 'T23:59:59Z'); 
        const filtered = state.resolvedTargets.filter(t => t.resolutionDate >= startDate && t.resolutionDate <= endDate); 
        const html = UI.generateViewHTML(filtered, `Alvos Respondidos de ${formatDateForDisplay(startDate)} a ${formatDateForDisplay(endDate)}`);
        const newWindow = window.open(); 
        newWindow.document.write(html); 
        newWindow.document.close(); 
        UI.toggleDateRangeModal(false); 
    });
    
    document.getElementById('closeCategoryModal').addEventListener('click', () => UI.toggleCategoryModal(false));
    document.getElementById('cancelCategoryView').addEventListener('click', () => UI.toggleCategoryModal(false));
    
    document.getElementById('confirmCategoryView').addEventListener('click', () => {
        const selectedCategories = Array.from(document.querySelectorAll('#categoryCheckboxesContainer input:checked')).map(cb => cb.value);
        const allTargets = [...state.prayerTargets, ...state.archivedTargets, ...state.resolvedTargets];
        const filtered = allTargets.filter(t => selectedCategories.includes(t.category));
        const html = UI.generateViewHTML(filtered, "Visualização por Categorias Selecionadas", selectedCategories);
        const newWindow = window.open();
        newWindow.document.write(html);
        newWindow.document.close();
        UI.toggleCategoryModal(false);
    });

    document.getElementById('hasDeadline').addEventListener('change', e => { document.getElementById('deadlineContainer').style.display = e.target.checked ? 'block' : 'none'; });
    ['searchMain', 'searchArchived', 'searchResolved'].forEach(id => { document.getElementById(id).addEventListener('input', e => { const panelId = id.replace('search', '').toLowerCase() + 'Panel'; state.filters[panelId].searchTerm = e.target.value; state.pagination[panelId].currentPage = 1; applyFiltersAndRender(panelId); }); });
    ['showDeadlineOnly', 'showExpiredOnlyMain'].forEach(id => { document.getElementById(id).addEventListener('change', e => { const filterName = id === 'showDeadlineOnly' ? 'showDeadlineOnly' : 'showExpiredOnly'; state.filters.mainPanel[filterName] = e.target.checked; state.pagination.mainPanel.currentPage = 1; applyFiltersAndRender('mainPanel'); }); });
    document.getElementById('closeManualTargetModal').addEventListener('click', () => UI.toggleManualTargetModal(false));
    
    let manualSearchDebounceTimer;
    document.getElementById('manualTargetSearchInput').addEventListener('input', e => {
        clearTimeout(manualSearchDebounceTimer);
        manualSearchDebounceTimer = setTimeout(() => {
            const searchTerm = e.target.value.toLowerCase();
            const dailyTargetIds = new Set(state.dailyTargets.targetIds || []);
            const availableTargets = state.prayerTargets.filter(target => !dailyTargetIds.has(target.id));
            const categories = [...new Set(availableTargets.map(t => t.category).filter(Boolean))];
            
            if (searchTerm.trim() === '') {
                const suggestedTargets = availableTargets.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 3);
                UI.renderManualSearchResults([], searchTerm, suggestedTargets, categories);
            } else {
                const filtered = availableTargets.filter(t => t.title.toLowerCase().includes(searchTerm) || (t.details && t.details.toLowerCase().includes(searchTerm)) || (t.category && t.category.toLowerCase().includes(searchTerm)));
                UI.renderManualSearchResults(filtered, searchTerm, [], categories);
            }
        }, 300);
    });

    document.getElementById('versionInfo').addEventListener('click', () => UI.showChangelogModal(APP_VERSION, CHANGELOG));
    document.getElementById('closeChangelogModal').addEventListener('click', () => UI.toggleChangelogModal(false));

    setupAutoGrowTextarea('textarea');

    // --- DELEGAÇÃO DE EVENTOS CENTRALIZADA (REATORADA) ---
    document.body.addEventListener('click', async e => {
        const { action, id, page, panel } = e.target.dataset;
        if (!state.user && action) return;

        if (page && panel) {
            e.preventDefault();
            if (e.target.classList.contains('disabled')) return;
            state.pagination[panel].currentPage = parseInt(page);
            applyFiltersAndRender(panel);
            return;
        }

        if (action === 'filter-manual-by-category') {
            const category = e.target.dataset.category;
            const searchInput = document.getElementById('manualTargetSearchInput');
            searchInput.value = category;
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            return;
        }

        if (action === 'filter-main-by-category') {
            const category = e.target.dataset.category;
            const currentFilter = state.filters.mainPanel.activeCategory;
            if (category === currentFilter) {
                state.filters.mainPanel.activeCategory = null;
                e.target.classList.remove('active');
            } else {
                state.filters.mainPanel.activeCategory = category;
                document.querySelectorAll('#mainCategoryFilters .category-filter-pill').forEach(pill => pill.classList.remove('active'));
                e.target.classList.add('active');
            }
            state.pagination.mainPanel.currentPage = 1;
            applyFiltersAndRender('mainPanel');
            return;
        }
        
        if (!action) return;

        // Ações especiais que são tratadas localmente
        if (action === 'pray' || action === 'pray-priority') {
            await handlePray(id);
            checkAndCollapsePriorityPanel();
            return;
        }

        // Delegar todas as outras ações ao novo handler
        ActionHandler.handleAction({
            action,
            id,
            eventTarget: e.target,
            state,
            applyFiltersAndRender,
            requestSync,
            checkAndCollapsePriorityPanel
        });
    });

    initializeFloatingNav(state);
});
