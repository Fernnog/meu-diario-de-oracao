// script.js (Orquestrador Principal da Aplicação - Versão Final com Sincronização Google Drive e Filtros Diários)
// ARQUITETURA ATUALIZADA: Implementa o fluxo de autenticação, sincronização e filtragem avançada.

// --- MÓDulos ---
import * as Auth from './auth.js';
import * as Service from './firestore-service.js';
import * as UI from './ui.js';
import { initializeFloatingNav, updateFloatingNavVisibility } from './floating-nav.js';
import { formatDateForDisplay, generateAndDownloadPdf } from './utils.js';
import * as GoogleDriveService from './google-drive-service.js';
import { updateDriveStatusUI } from './ui.js';
import { APP_VERSION, CHANGELOG } from './config.js';

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
        // NOVO: Estado para filtros do dia
        dailyPanel: { searchTerm: '', activeCategory: null }
    },
    // Flag para controlar a funcionalidade do Drive
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

// --- FUNÇÃO AUXILIAR DE FILTRO (REFATORAÇÃO - PRIORIDADE 3) ---
/**
 * Verifica se um alvo corresponde a um termo de busca.
 * Centraliza a lógica para evitar repetição nos painéis principais e no diário.
 * @param {object} target - O alvo a ser verificado.
 * @param {string} searchTerm - O termo pesquisado.
 * @returns {boolean} - True se corresponder.
 */
function checkSearchTermMatch(target, searchTerm) {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    
    return (target.title && target.title.toLowerCase().includes(term)) ||
           (target.details && target.details.toLowerCase().includes(term)) ||
           (target.category && target.category.toLowerCase().includes(term)) ||
           (target.observations && target.observations.some(obs =>
               (obs.text && obs.text.toLowerCase().includes(term)) ||
               (obs.subTargetTitle && obs.subTargetTitle.toLowerCase().includes(term))
           ));
}

// --- MELHORIA DE UX: Notificações Toast Não-Bloqueantes ---
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.right = '20px';
    toast.style.padding = '12px 20px';
    toast.style.borderRadius = '5px';
    toast.style.color = 'white';
    toast.style.zIndex = '1050';
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s, transform 0.3s';
    toast.style.transform = 'translateY(20px)';
    if (type === 'success') {
        toast.style.backgroundColor = '#28a745';
    } else if (type === 'error') {
        toast.style.backgroundColor = '#dc3545';
    } else {
        toast.style.backgroundColor = '#17a2b8';
    }
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    }, 10);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => {
            if (document.body.contains(toast)) {
                document.body.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

/**
 * Oculta a splash screen com uma animação de fade-out.
 */
function hideSplashScreen() {
    const splash = document.getElementById('splashScreen');
    if (splash) {
        splash.classList.add('hidden');
    }
}

// --- LÓGICA DE SINCRONIZAÇÃO COM GOOGLE DRIVE (COM DEBOUNCE) ---

// Mapa para guardar os temporizadores do debounce para cada alvo
const syncDebounceTimers = new Map();

// Função auxiliar para encontrar o alvo em qualquer lista do estado
const findTargetInState = (targetId) => {
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

    const { target, isArchived, panelId } = findTargetInState(targetId);
    if (!target) {
        console.error("syncTarget: Alvo não encontrado no estado para o ID:", targetId);
        return;
    }

    try {
        target.driveStatus = 'syncing';
        delete target.driveErrorMessage;
        // Se a edição foi no painel diário, precisamos atualizar ele também
        applyFiltersAndRender(panelId); 
        applyDailyFiltersAndRender(); // Atualiza painel diário se necessário

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
    showToast(`Erro ao sincronizar "${target.title}" com o Drive.`, "error");
} finally {
    applyFiltersAndRender(panelId);
    applyDailyFiltersAndRender(); // Atualiza painel diário
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

/**
 * Handler para forçar a sincronização de todos os alvos.
 */
async function handleForceSync() {
    if (!state.isDriveEnabled) {
        showToast("Conecte-se ao Google Drive para forçar a sincronização.", "error");
        return;
    }
    
    if (!confirm("Deseja forçar a sincronização de todos os alvos com o Google Drive agora? Isso pode levar um momento.")) return;

    const forceSyncButton = document.getElementById('forceDriveSyncButton');
    forceSyncButton.disabled = true;

    UI.updateDriveStatusUI('syncing', 'Iniciando sincronização...');
    showToast("Iniciando sincronização manual completa...", "info");

    const allTargetsToSync = [...state.prayerTargets, ...state.archivedTargets, ...state.resolvedTargets];
    allTargetsToSync.forEach(t => {
        t.driveStatus = 'pending';
        delete t.driveErrorMessage;
    });
    
    applyFiltersAndRender('mainPanel');
    applyFiltersAndRender('archivedPanel');
    applyFiltersAndRender('resolvedPanel');
    applyDailyFiltersAndRender();

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
            showToast("Sincronização concluída com alguns erros.", "error");
        } else {
            showToast("Sincronização manual concluída com sucesso!", "success");
        }

    } catch (error) {
        console.error("Erro inesperado durante a sincronização em massa:", error);
        showToast("Ocorreu um erro inesperado durante a sincronização.", "error");
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
            showToast("Autenticado com Google. Inicializando o serviço do Drive...", "info");
            
            console.log("[App] Tentando inicializar o GoogleDriveService...");
            const initialized = await GoogleDriveService.initializeDriveService(accessToken);
            
            if (initialized) {
                console.log("[App] GoogleDriveService INICIALIZADO com sucesso.");
                state.isDriveEnabled = true;
                UI.updateDriveStatusUI('connected');
                showToast("Conexão com Google Drive estabelecida!", "success");
                if (state.user) {
                   await loadDataForUser(state.user);
                }
            } else {
                 console.error("[App] Falha na inicialização do GoogleDriveService, mas sem erro lançado.");
            }
        }
    } catch (error) {
        console.error("[App] Erro CRÍTICO no fluxo de login com Google ou na inicialização do Drive:", error);
        showToast(error.message, "error");
        UI.updateDriveStatusUI('error');
        state.isDriveEnabled = false;
    }
}

// NOVO: Função para filtrar e renderizar o painel diário
function applyDailyFiltersAndRender() {
    const filters = state.filters.dailyPanel;
    const searchTerm = filters.searchTerm;
    const activeCategory = filters.activeCategory;

    // Função local combinando filtro de texto e categoria
    const filterFn = (target) => {
        // 1. Filtro por Categoria
        if (activeCategory && target.category !== activeCategory) return false;
        
        // 2. Filtro por Texto (usa o helper refatorado)
        return checkSearchTermMatch(target, searchTerm);
    };

    const filteredPending = state.dailyTargets.pending.filter(filterFn);
    const filteredCompleted = state.dailyTargets.completed.filter(filterFn);

    UI.renderDailyTargets(filteredPending, filteredCompleted, state.dailyTargets);
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
        const searchTerm = panelFilters.searchTerm;
        
        // USO DA REFATORAÇÃO (PRIORIDADE 3): Usa helper para verificar correspondência de texto
        if (!checkSearchTermMatch(target, searchTerm)) return false;

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
                showToast("Sua sequência de perseverança foi reiniciada por inatividade.", "info");
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

        // NOVO: Gerar filtros de categoria para o painel do dia
        const allDailyTargets = [...state.dailyTargets.pending, ...state.dailyTargets.completed];
        const dailyCategories = [...new Set(allDailyTargets.map(t => t.category).filter(Boolean))];
        UI.renderCategoryFilters('dailyCategoryFilters', dailyCategories);

        applyFiltersAndRender('mainPanel');
        applyFiltersAndRender('archivedPanel');
        applyFiltersAndRender('resolvedPanel');
        
        // Substituído renderização direta por chamada com filtro para inicializar corretamente
        applyDailyFiltersAndRender();
        
        UI.renderPriorityTargets(state.prayerTargets, state.dailyTargets);
        UI.updatePerseveranceUI(state.perseveranceData);
        UI.updateWeeklyChart(state.weeklyPrayerData);
        UI.showPanel('dailySection');

        if (state.isDriveEnabled) {
            console.log('[App] Iniciando sincronização em massa para todos os alvos...');
            showToast('Iniciando sincronização com o Google Drive...', 'info');
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
        showToast("Ocorreu um erro crítico ao carregar seus dados.", "error");
        handleLogoutState();
    } finally {
        hideSplashScreen();
    }
}

function handleLogoutState() {
    state = { user: null, prayerTargets: [], archivedTargets: [], resolvedTargets: [], perseveranceData: { consecutiveDays: 0, recordDays: 0, lastInteractionDate: null }, weeklyPrayerData: { weekId: null, interactions: {} }, dailyTargets: { pending: [], completed: [], targetIds: [] }, pagination: { mainPanel: { currentPage: 1, targetsPerPage: 10 }, archivedPanel: { currentPage: 1, targetsPerPage: 10 }, resolvedPanel: { currentPage: 1, targetsPerPage: 10 }}, filters: { mainPanel: { searchTerm: '', showDeadlineOnly: false, showExpiredOnly: false, startDate: null, endDate: null, activeCategory: null }, archivedPanel: { searchTerm: '', startDate: null, endDate: null }, resolvedPanel: { searchTerm: '' }, dailyPanel: { searchTerm: '', activeCategory: null } }, isDriveEnabled: false };
    UI.renderTargets([], 0, 1, 10); UI.renderArchivedTargets([], 0, 1, 10); UI.renderResolvedTargets([], 0, 1, 10); UI.renderDailyTargets([], []); UI.resetPerseveranceUI(); UI.resetWeeklyChart(); UI.showPanel('authSection');
    UI.updateDriveStatusUI('disconnected');
    updateFloatingNavVisibility(state);
}

async function handleAddNewTarget(event) {
    event.preventDefault();
    if (!state.user) return showToast("Você precisa estar logado.", "error");
    const title = document.getElementById('title').value.trim();
    if (!title) return showToast("O título é obrigatório.", "error");
    const hasDeadline = document.getElementById('hasDeadline').checked;
    const deadlineValue = document.getElementById('deadlineDate').value;
    if (hasDeadline && !deadlineValue) return showToast("Selecione uma data para o prazo.", "error");
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
        showToast("Alvo adicionado com sucesso!", "success");
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
        showToast("Falha ao adicionar alvo: " + error.message, "error");
    }
}

// =================================================================
// === Handlers de Ação Dedicados ===
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
    // Renderiza com filtros aplicados para não quebrar a view atual
    applyDailyFiltersAndRender();
    UI.renderPriorityTargets(state.prayerTargets, state.dailyTargets);
    
    showToast(`Oração por "${targetToPray.title}" registrada!`, "success");

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
                    showToast("Parabéns! Você orou por todos os seus alvos prioritários de hoje!", "info");
                }, 500);
            }
        }
    } catch (error) {
        console.error("Erro ao processar 'Orei!':", error);
        showToast("Erro ao registrar oração. Desfazendo.", "error");
        const completedIndex = state.dailyTargets.completed.findIndex(t => t.id === targetId);
        if (completedIndex > -1) {
            const [revertedTarget] = state.dailyTargets.completed.splice(completedIndex, 1);
            if (state.dailyTargets.targetIds.includes(targetId)) {
                 state.dailyTargets.pending.unshift(revertedTarget);
            }
        }
        applyDailyFiltersAndRender();
        UI.renderPriorityTargets(state.prayerTargets, state.dailyTargets);
    }
}

async function handleResolveTarget(target) {
    if (!confirm("Marcar como respondido?")) return;
    const index = state.prayerTargets.findIndex(t => t.id === target.id);
    if (index === -1) return;
    
    const [targetToResolve] = state.prayerTargets.splice(index, 1);
    targetToResolve.resolved = true;
    targetToResolve.resolutionDate = new Date();
    state.resolvedTargets.unshift(targetToResolve);
    applyFiltersAndRender('mainPanel');
    applyFiltersAndRender('resolvedPanel');

    try {
        await Service.markAsResolved(state.user.uid, targetToResolve);
        showToast("Alvo marcado como respondido!", "success");
        requestSync(target.id);
    } catch (error) {
        showToast("Erro ao salvar a alteração. A ação será desfeita.", "error");
        state.resolvedTargets.shift();
        state.prayerTargets.splice(index, 0, targetToResolve);
        applyFiltersAndRender('mainPanel');
        applyFiltersAndRender('resolvedPanel');
    }
}

async function handleArchiveTarget(target) {
    if (!confirm("Arquivar este alvo?")) return;
    const index = state.prayerTargets.findIndex(t => t.id === target.id);
    if (index === -1) return;

    const [targetToArchive] = state.prayerTargets.splice(index, 1);
    targetToArchive.archived = true;
    targetToArchive.archivedDate = new Date();
    state.archivedTargets.unshift(targetToArchive);
    applyFiltersAndRender('mainPanel');
    applyFiltersAndRender('archivedPanel');

    try {
        await Service.archiveTarget(state.user.uid, targetToArchive);
        showToast("Alvo arquivado.", "info");
        requestSync(target.id);
    } catch (error) {
        showToast("Erro ao salvar a alteração. A ação será desfeita.", "error");
        state.archivedTargets.shift();
        state.prayerTargets.splice(index, 0, targetToArchive);
        applyFiltersAndRender('mainPanel');
        applyFiltersAndRender('archivedPanel');
    }
}

async function handleDeleteArchivedTarget(targetId) {
    if (!confirm("EXCLUIR PERMANENTEMENTE? Esta ação não pode ser desfeita.")) return;
    const index = state.archivedTargets.findIndex(t => t.id === targetId);
    if (index === -1) return;

    const [deletedTarget] = state.archivedTargets.splice(index, 1);
    applyFiltersAndRender('archivedPanel');

    try {
        await Service.deleteArchivedTarget(state.user.uid, targetId);
        showToast("Alvo excluído permanentemente.", "info");
    } catch (error) {
        showToast("Erro ao excluir. O item será restaurado.", "error");
        state.archivedTargets.splice(index, 0, deletedTarget);
        applyFiltersAndRender('archivedPanel');
    }
}

async function handleAddObservation(target, isArchived, panelId) {
    const text = document.getElementById(`observationText-${target.id}`).value.trim();
    const dateStr = document.getElementById(`observationDate-${target.id}`).value;
    if (!text || !dateStr) return showToast("Preencha o texto e a data.", "error");
    
    const newObservation = { text, date: new Date(dateStr + 'T12:00:00Z'), isSubTarget: false };
    
    if (!target.observations) target.observations = [];
    target.observations.push(newObservation);
    UI.toggleAddObservationForm(target.id);
    applyFiltersAndRender(panelId);
    // Se o alvo também estiver no painel diário, atualiza lá também
    if(state.dailyTargets.pending.find(t => t.id === target.id) || state.dailyTargets.completed.find(t => t.id === target.id)) {
        applyDailyFiltersAndRender();
    }

    try {
        await Service.addObservationToTarget(state.user.uid, target.id, isArchived, newObservation);
        showToast("Observação adicionada.", "success");
        requestSync(target.id); 
    } catch(error) {
        showToast("Falha ao salvar. A alteração será desfeita.", "error");
        target.observations.pop();
        applyFiltersAndRender(panelId);
        applyDailyFiltersAndRender();
    }
}

async function handleSaveCategory(target, isArchived, panelId) {
    const newCategory = document.getElementById(`categorySelect-${target.id}`).value;
    const oldCategory = target.category;
    
    target.category = newCategory;
    UI.toggleEditCategoryForm(target.id);
    applyFiltersAndRender(panelId);
    applyDailyFiltersAndRender(); // Atualiza painel diário se necessário

    try {
        await Service.updateTargetField(state.user.uid, target.id, isArchived, { category: newCategory });
        showToast("Categoria atualizada.", "success");
        requestSync(target.id);
    } catch(error) {
        showToast("Falha ao salvar. A alteração foi desfeita.", "error");
        target.category = oldCategory;
        applyFiltersAndRender(panelId);
        applyDailyFiltersAndRender();
    }
}

async function handleTogglePriority(target) {
    const newStatus = !target.isPriority;
    const oldStatus = target.isPriority;
    
    target.isPriority = newStatus;
    applyFiltersAndRender('mainPanel');
    UI.renderPriorityTargets(state.prayerTargets, state.dailyTargets);

    try {
        await Service.updateTargetField(state.user.uid, target.id, false, { isPriority: newStatus });
        showToast(newStatus ? "Alvo marcado como prioritário." : "Alvo removido dos prioritários.", "info");
        requestSync(target.id);
    } catch (error) {
        showToast("Erro ao salvar. A alteração foi desfeita.", "error");
        target.isPriority = oldStatus;
        applyFiltersAndRender('mainPanel');
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
            hideSplashScreen();
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
    
    document.getElementById('refreshDaily').addEventListener('click', async () => { if(confirm("Deseja gerar uma nova lista de alvos para hoje? A lista atual será substituída.")) { await Service.forceGenerateDailyTargets(state.user.uid, state.prayerTargets); await loadDataForUser(state.user); showToast("Nova lista gerada!", "success"); } });
    document.getElementById('copyDaily').addEventListener('click', () => { const text = state.dailyTargets.pending.map(t => `- ${t.title}`).join('\n'); navigator.clipboard.writeText(text); showToast("Alvos pendentes copiados!", "success"); });
    document.getElementById('viewDaily').addEventListener('click', () => { const allTargets = [...state.dailyTargets.pending, ...state.dailyTargets.completed]; const html = UI.generateViewHTML(allTargets, "Alvos do Dia"); const newWindow = window.open(); newWindow.document.write(html); newWindow.document.close(); });
    
    // NOVO: Listener para busca no painel diário
    document.getElementById('searchDaily').addEventListener('input', e => {
        state.filters.dailyPanel.searchTerm = e.target.value;
        applyDailyFiltersAndRender();
    });

    document.getElementById('addManualTargetButton').addEventListener('click', () => {
        const dailyTargetIds = new Set(state.dailyTargets.targetIds || []);
        const availableTargets = state.prayerTargets.filter(target => !dailyTargetIds.has(target.id));
        
        const suggestedTargets = [...availableTargets]
            .sort((a, b) => b.date.getTime() - a.date.getTime())
            .slice(0, 3);
        
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
                const suggestedTargets = availableTargets
                    .sort((a, b) => b.date.getTime() - a.date.getTime())
                    .slice(0, 3);
                UI.renderManualSearchResults([], searchTerm, suggestedTargets, categories);
            } else {
                const filtered = availableTargets.filter(t => 
                    t.title.toLowerCase().includes(searchTerm) || 
                    (t.details && t.details.toLowerCase().includes(searchTerm)) ||
                    (t.category && t.category.toLowerCase().includes(searchTerm))
                );
                UI.renderManualSearchResults(filtered, searchTerm, [], categories);
            }
        }, 300); 
    });

    document.getElementById('versionInfo').addEventListener('click', () => {
        UI.showChangelogModal(APP_VERSION, CHANGELOG);
    });
    document.getElementById('closeChangelogModal').addEventListener('click', () => UI.toggleChangelogModal(false));

    setupAutoGrowTextarea('textarea');

    // --- DELEGAÇÃO DE EVENTOS CENTRALIZADA ---
    document.body.addEventListener('click', async e => {
        const { action, id, page, panel, obsIndex, subObsIndex } = e.target.dataset;
        if (!state.user && action) return;

        if (page && panel) {
            e.preventDefault();
            if (e.target.classList.contains('disabled')) return;
            state.pagination[panel].currentPage = parseInt(page);
            applyFiltersAndRender(panel);
            return;
        }
        
        if (action === 'cancel-edit') {
            const form = e.target.closest('.inline-edit-form');
            if (form) form.remove();
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

        // NOVO: Handler para filtros de categoria do painel diário
        if (action === 'filter-daily-by-category') {
            const category = e.target.dataset.category;
            const currentFilter = state.filters.dailyPanel.activeCategory;

            if (category === currentFilter) {
                state.filters.dailyPanel.activeCategory = null;
                e.target.classList.remove('active');
            } else {
                state.filters.dailyPanel.activeCategory = category;
                document.querySelectorAll('#dailyCategoryFilters .category-filter-pill').forEach(pill => pill.classList.remove('active'));
                e.target.classList.add('active');
            }
            applyDailyFiltersAndRender();
            return;
        }
        
        if (!action || !id) return;

        const { target, isArchived, panelId } = findTargetInState(id);
        if (!target && !['select-manual-target', 'add-new-observation'].includes(action)) return;

        switch(action) {
            case 'pray':
            case 'pray-priority':
                await handlePray(id);
                checkAndCollapsePriorityPanel();
                break;
            case 'resolve':
                await handleResolveTarget(target);
                break;
            case 'archive':
                await handleArchiveTarget(target);
                break;
            case 'delete-archived':
                await handleDeleteArchivedTarget(id);
                break;
            case 'toggle-observation':
                UI.toggleAddObservationForm(id);
                break;
            case 'toggle-observations': {
                const button = e.target;
                const hiddenContainer = document.getElementById(`hidden-obs-${id}`);
                
                if (hiddenContainer) {
                    const isVisible = hiddenContainer.classList.toggle('visible');
                    if (isVisible) {
                        button.textContent = 'Ver menos';
                    } else {
                        const count = hiddenContainer.children.length;
                        button.textContent = `Ver mais ${count} antigas`;
                    }
                }
                break;
            }
            case 'add-new-observation':
                if (target) await handleAddObservation(target, isArchived, panelId);
                break;
            case 'edit-title':
                if (target) UI.toggleEditForm('Title', id, { currentValue: target.title, saveAction: 'save-title', eventTarget: e.target });
                break;
            case 'edit-details':
                if (target) UI.toggleEditForm('Details', id, { currentValue: target.details, saveAction: 'save-details', eventTarget: e.target });
                break;
            case 'edit-observation':
                if (target && target.observations[obsIndex]) UI.toggleEditForm('Observation', id, { currentValue: target.observations[obsIndex].text, obsIndex, saveAction: 'save-observation', eventTarget: e.target });
                break;
            case 'edit-sub-target-title':
                if (target && target.observations[obsIndex]) UI.toggleEditForm('SubTargetTitle', id, { currentValue: target.observations[obsIndex].subTargetTitle, obsIndex, saveAction: 'save-sub-target-title', eventTarget: e.target });
                break;
            case 'edit-sub-target-details':
                if (target && target.observations[obsIndex]) UI.toggleEditForm('SubTargetDetails', id, { currentValue: target.observations[obsIndex].text, obsIndex, saveAction: 'save-sub-target-details', eventTarget: e.target });
                break;
            case 'edit-sub-observation':
                const subObs = target?.observations[obsIndex]?.subObservations?.[subObsIndex];
                if (subObs) UI.toggleEditForm('SubObservation', id, { currentValue: subObs.text, obsIndex, subObsIndex, saveAction: 'save-sub-observation', eventTarget: e.target });
                break;

            case 'save-title': {
                const form = e.target.closest('.inline-edit-form');
                if (!form || !target) break;
                const newTitle = form.querySelector('input').value.trim();
                if (newTitle === '' || newTitle === target.title) { form.remove(); break; }
                const oldTitle = target.title;
                target.title = newTitle;
                applyFiltersAndRender(panelId);
                applyDailyFiltersAndRender();
                try {
                    await Service.updateTargetField(state.user.uid, id, isArchived, { title: newTitle });
                    showToast("Título atualizado!", "success");
                    requestSync(id);
                } catch (error) {
                    target.title = oldTitle;
                    applyFiltersAndRender(panelId);
                    applyDailyFiltersAndRender();
                    showToast("Falha ao atualizar o título.", "error");
                }
                break;
            }

            case 'save-details': {
                const form = e.target.closest('.inline-edit-form');
                if (!form || !target) break;
                const newDetails = form.querySelector('textarea').value.trim();
                if (newDetails === target.details) { form.remove(); break; }
                const oldDetails = target.details;
                target.details = newDetails;
                applyFiltersAndRender(panelId);
                applyDailyFiltersAndRender();
                try {
                    await Service.updateTargetField(state.user.uid, id, isArchived, { details: newDetails });
                    showToast("Detalhes atualizados!", "success");
                    requestSync(id);
                } catch (error) {
                    target.details = oldDetails;
                    applyFiltersAndRender(panelId);
                    applyDailyFiltersAndRender();
                    showToast("Falha ao atualizar os detalhes.", "error");
                }
                break;
            }
            
            case 'save-observation': {
                const form = e.target.closest('.inline-edit-form');
                if (!form || !target) break;
                const newText = form.querySelector('textarea').value.trim();
                if (newText === '' || newText === target.observations[obsIndex].text) { form.remove(); break; }
                const oldText = target.observations[obsIndex].text;
                target.observations[obsIndex].text = newText;
                applyFiltersAndRender(panelId);
                applyDailyFiltersAndRender();
                try {
                    await Service.updateObservationInTarget(state.user.uid, id, isArchived, obsIndex, { text: newText });
                    showToast("Observação atualizada!", "success");
                    requestSync(id);
                } catch (error) {
                    target.observations[obsIndex].text = oldText;
                    applyFiltersAndRender(panelId);
                    applyDailyFiltersAndRender();
                    showToast("Falha ao atualizar a observação.", "error");
                }
                break;
            }

            case 'save-sub-target-title':
            case 'save-sub-target-details': {
                const form = e.target.closest('.inline-edit-form');
                if (!form || !target) break;
                const newText = form.querySelector('input, textarea').value.trim();
                const obsToUpdate = target.observations[obsIndex];
                const isTitle = action === 'save-sub-target-title';
                const fieldToUpdate = isTitle ? 'subTargetTitle' : 'text';
                if (newText === '' || newText === obsToUpdate[fieldToUpdate]) { form.remove(); break; }
                const oldText = obsToUpdate[fieldToUpdate];
                obsToUpdate[fieldToUpdate] = newText;
                applyFiltersAndRender(panelId);
                applyDailyFiltersAndRender();
                try {
                    await Service.updateObservationInTarget(state.user.uid, id, isArchived, obsIndex, { [fieldToUpdate]: newText });
                    showToast("Sub-alvo atualizado!", "success");
                    requestSync(id);
                } catch (error) {
                    obsToUpdate[fieldToUpdate] = oldText;
                    applyFiltersAndRender(panelId);
                    applyDailyFiltersAndRender();
                    showToast("Falha ao atualizar sub-alvo.", "error");
                }
                break;
            }

            case 'save-sub-observation': {
                const form = e.target.closest('.inline-edit-form');
                if (!form || !target) break;
                const newText = form.querySelector('textarea').value.trim();
                const subObsToUpdate = target.observations[obsIndex].subObservations[subObsIndex];
                if (newText === '' || newText === subObsToUpdate.text) { form.remove(); break; }
                const oldText = subObsToUpdate.text;
                subObsToUpdate.text = newText;
                applyFiltersAndRender(panelId);
                applyDailyFiltersAndRender();
                try {
                    await Service.updateSubObservationInTarget(state.user.uid, id, isArchived, obsIndex, subObsIndex, { text: newText });
                    showToast("Observação do sub-alvo atualizada!", "success");
                    requestSync(id);
                } catch (error) {
                    subObsToUpdate.text = oldText;
                    applyFiltersAndRender(panelId);
                    applyDailyFiltersAndRender();
                    showToast("Falha ao atualizar observação.", "error");
                }
                break;
            }
            
            case 'edit-deadline':
                if (target) UI.toggleEditForm('Deadline', id, { currentValue: target.deadlineDate, saveAction: 'save-deadline', eventTarget: e.target });
                break;

            case 'save-deadline': {
                const form = e.target.closest('.inline-edit-form');
                if (!form || !target) break;
                const newDeadlineStr = form.querySelector('input[type="date"]').value;
                if (!newDeadlineStr) break;
                const newDeadlineDate = new Date(newDeadlineStr + 'T12:00:00Z');
                const oldDeadlineDate = target.deadlineDate;
                const oldHasDeadline = target.hasDeadline;
                target.deadlineDate = newDeadlineDate;
                target.hasDeadline = true;
                applyFiltersAndRender(panelId);
                applyDailyFiltersAndRender();
                try {
                    await Service.updateTargetField(state.user.uid, target.id, isArchived, { hasDeadline: true, deadlineDate: newDeadlineDate });
                    showToast("Prazo atualizado!", "success");
                    requestSync(id);
                } catch(error) {
                    target.deadlineDate = oldDeadlineDate;
                    target.hasDeadline = oldHasDeadline;
                    applyFiltersAndRender(panelId);
                    applyDailyFiltersAndRender();
                    showToast("Falha ao salvar prazo.", "error");
                }
                break;
            }

            case 'remove-deadline': {
                if (!target || !confirm("Tem certeza que deseja remover o prazo deste alvo?")) break;
                const oldDeadlineDate = target.deadlineDate;
                const oldHasDeadline = target.hasDeadline;
                target.deadlineDate = null;
                target.hasDeadline = false;
                applyFiltersAndRender(panelId);
                applyDailyFiltersAndRender();
                try {
                    await Service.updateTargetField(state.user.uid, target.id, isArchived, { hasDeadline: false, deadlineDate: null });
                    showToast("Prazo removido.", "info");
                    requestSync(id);
                } catch(error) {
                    target.deadlineDate = oldDeadlineDate;
                    target.hasDeadline = oldHasDeadline;
                    applyFiltersAndRender(panelId);
                    applyDailyFiltersAndRender();
                    showToast("Falha ao remover prazo.", "error");
                }
                break;
            }

            case 'edit-category':
                UI.toggleEditCategoryForm(id, target?.category);
                break;
            case 'save-category':
                await handleSaveCategory(target, isArchived, panelId);
                break;
            case 'toggle-priority':
                await handleTogglePriority(target);
                break;
            case 'download-target-pdf':
                if (target) { generateAndDownloadPdf(target); showToast(`Gerando PDF para "${target.title}"...`, 'success'); }
                break;
            
            case 'select-manual-target':
                try {
                    const targetToAdd = state.prayerTargets.find(t => t.id === id);
                    if (!targetToAdd) {
                        throw new Error("Alvo selecionado não foi encontrado nos dados locais.");
                    }

                    UI.toggleManualTargetModal(false);
                    showToast("Adicionando alvo à lista do dia...", "info");

                    await Service.addManualTargetToDailyList(state.user.uid, id);
                    
                    state.dailyTargets.targetIds.push(id); 
                    state.dailyTargets.pending.unshift(targetToAdd);
                    
                    // Atualiza filtros para incluir nova categoria se necessário e renderiza
                    const allDailyTargets = [...state.dailyTargets.pending, ...state.dailyTargets.completed];
                    const dailyCategories = [...new Set(allDailyTargets.map(t => t.category).filter(Boolean))];
                    UI.renderCategoryFilters('dailyCategoryFilters', dailyCategories);
                    applyDailyFiltersAndRender();
                    
                    showToast(`"${targetToAdd.title}" foi adicionado ao topo da lista!`, "success");

                } catch (error) {
                    console.error("Erro ao adicionar alvo manualmente:", error);
                    showToast(error.message, "error");
                }
                break;

            case 'promote-observation': {
                if (!confirm("Deseja promover esta observação a um sub-alvo?")) break;
                const newTitle = prompt("Qual será o título deste novo sub-alvo?", target.observations[parseInt(obsIndex)].text.substring(0, 50));
                if (!newTitle || newTitle.trim() === '') break;

                const updatedObservationData = { isSubTarget: true, subTargetTitle: newTitle.trim(), subTargetStatus: 'active', interactionCount: 0, subObservations: [] };
                const originalObservation = { ...target.observations[parseInt(obsIndex)] };
                Object.assign(target.observations[parseInt(obsIndex)], updatedObservationData);
                applyFiltersAndRender(panelId);
                applyDailyFiltersAndRender();
                try {
                    await Service.updateObservationInTarget(state.user.uid, id, isArchived, parseInt(obsIndex), updatedObservationData);
                    showToast("Observação promovida a sub-alvo!", "success");
                    requestSync(id);
                } catch (error) {
                    target.observations[parseInt(obsIndex)] = originalObservation;
                    applyFiltersAndRender(panelId);
                    applyDailyFiltersAndRender();
                    showToast("Falha ao salvar. A alteração foi desfeita.", "error");
                }
                break;
            }
            
            case 'pray-sub-target': {
                try {
                    e.target.disabled = true;
                    e.target.textContent = '✓ Orado!';
                    e.target.classList.add('prayed');
                    
                    const subTargetId = `${id}_${obsIndex}`;
                    
                    const { target: parentTarget } = findTargetInState(id);
                    if (parentTarget) {
                        state.dailyTargets.completed.push({ targetId: subTargetId, isSubTarget: true, title: parentTarget.observations[obsIndex].subTargetTitle });
                    }
                    
                    await Service.recordInteractionForSubTarget(state.user.uid, subTargetId);
                    const { isNewRecord } = await Service.recordUserInteraction(state.user.uid, state.perseveranceData, state.weeklyPrayerData);
                    
                    const [perseveranceData, weeklyData] = await Promise.all([ Service.loadPerseveranceData(state.user.uid), Service.loadWeeklyPrayerData(state.user.uid) ]);
                    state.perseveranceData = perseveranceData;
                    state.weeklyPrayerData = weeklyData;
                    UI.updatePerseveranceUI(state.perseveranceData, isNewRecord);
                    UI.updateWeeklyChart(state.weeklyPrayerData);
                    showToast("Interação com sub-alvo registrada!", "success");
                } catch (error) {
                    showToast("Falha ao registrar interação. Tente novamente.", "error");
                    e.target.disabled = false;
                    e.target.textContent = 'Orei!';
                    e.target.classList.remove('prayed');
                }
                break;
            }

            case 'demote-sub-target': {
                if (!confirm("Tem certeza que deseja reverter este sub-alvo para uma observação comum?")) break;
                const originalSubTarget = { ...target.observations[parseInt(obsIndex)] };
                const updatedObservation = { ...originalSubTarget, isSubTarget: false };
                delete updatedObservation.subTargetTitle; delete updatedObservation.subTargetStatus; delete updatedObservation.interactionCount; delete updatedObservation.subObservations;
                target.observations[parseInt(obsIndex)] = updatedObservation;
                applyFiltersAndRender(panelId);
                applyDailyFiltersAndRender();
                try {
                    await Service.updateObservationInTarget(state.user.uid, id, isArchived, parseInt(obsIndex), updatedObservation);
                    showToast("Sub-alvo revertido para observação.", "info");
                    requestSync(id);
                } catch (error) {
                    target.observations[parseInt(obsIndex)] = originalSubTarget;
                    applyFiltersAndRender(panelId);
                    applyDailyFiltersAndRender();
                    showToast("Erro ao reverter. A alteração foi desfeita.", "error");
                }
                break;
            }

            case 'resolve-sub-target': {
                if (!confirm("Marcar este sub-alvo como respondido?")) break;
                const originalSubTarget = { ...target.observations[parseInt(obsIndex)] };
                const updatedObservation = { subTargetStatus: 'resolved' };
                Object.assign(target.observations[parseInt(obsIndex)], updatedObservation);
                applyFiltersAndRender(panelId);
                applyDailyFiltersAndRender();
                try {
                    await Service.updateObservationInTarget(state.user.uid, id, isArchived, parseInt(obsIndex), updatedObservation);
                    showToast("Sub-alvo marcado como respondido!", "success");
                    requestSync(id);
                } catch (error) {
                    target.observations[parseInt(obsIndex)] = originalSubTarget;
                    applyFiltersAndRender(panelId);
                    applyDailyFiltersAndRender();
                    showToast("Erro ao salvar. A alteração foi desfeita.", "error");
                }
                break;
            }

            case 'add-sub-observation': {
                const text = prompt("Digite a nova observação para este sub-alvo:");
                if (!text || text.trim() === '') break;
                const newSubObservation = { text: text.trim(), date: new Date() };
                const subTarget = target.observations[parseInt(obsIndex)];
                if (!Array.isArray(subTarget.subObservations)) subTarget.subObservations = [];
                subTarget.subObservations.push(newSubObservation);
                applyFiltersAndRender(panelId);
                applyDailyFiltersAndRender();
                try {
                    await Service.addSubObservationToTarget(state.user.uid, id, isArchived, parseInt(obsIndex), newSubObservation);
                    showToast("Observação adicionada ao sub-alvo.", "success");
                    requestSync(id);
                } catch (error) {
                    subTarget.subObservations.pop();
                    applyFiltersAndRender(panelId);
                    applyDailyFiltersAndRender();
                    showToast("Erro ao salvar. A alteração foi desfeita.", "error");
                }
                break;
            }
        }
    });

    initializeFloatingNav(state);
});
