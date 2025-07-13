// script.js (Orquestrador Principal da Aplicação - Versão Aprimorada)
// ARQUITETURA REVISADA: Inclui gestão de prazos, handlers de ação refatorados e notificação para promover observações.

// --- MÓDULOS ---
import { auth } from './firebase-config.js'; 
import { onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import * as Service from './firestore-service.js';
import * as UI from './ui.js';
import { initializeFloatingNav, updateFloatingNavVisibility } from './floating-nav.js';
import { formatDateForDisplay } from './utils.js';

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
        mainPanel: { searchTerm: '', showDeadlineOnly: false, showExpiredOnly: false, startDate: null, endDate: null },
        archivedPanel: { searchTerm: '', startDate: null, endDate: null },
        resolvedPanel: { searchTerm: '' },
    }
};

// =================================================================
// === MELHORIA DE UX: Notificações Toast Não-Bloqueantes ===
// =================================================================

/**
 * Exibe uma notificação toast na tela.
 * @param {string} message - A mensagem a ser exibida.
 * @param {'success' | 'error' | 'info'} type - O tipo de notificação, que define a cor.
 */
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
    
    if (type === 'success') toast.style.backgroundColor = '#28a745';
    else if (type === 'error') toast.style.backgroundColor = '#dc3545';
    else toast.style.backgroundColor = '#17a2b8';

    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    }, 10);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => document.body.removeChild(toast), 300);
    }, 3000);
}

// =================================================================
// === MELHORIA DE UX: Persistência de Estado da Sessão ===
// =================================================================

/**
 * Salva o estado atual dos filtros e da paginação no sessionStorage.
 */
function saveStateToSession() {
    if (!state.user) return;
    const stateToSave = {
        pagination: state.pagination,
        filters: state.filters
    };
    sessionStorage.setItem(`prayerAppState_${state.user.uid}`, JSON.stringify(stateToSave));
}

/**
 * Carrega o estado salvo do sessionStorage para o estado global da aplicação.
 */
function loadStateFromSession() {
    if (!state.user) return;
    try {
        const savedStateJSON = sessionStorage.getItem(`prayerAppState_${state.user.uid}`);
        if (savedStateJSON) {
            const savedState = JSON.parse(savedStateJSON);
            state.pagination = savedState.pagination || state.pagination;
            state.filters = savedState.filters || state.filters;

            // Reflete o estado carregado na UI (inputs de filtro)
            document.getElementById('searchMain').value = state.filters.mainPanel.searchTerm;
            document.getElementById('showDeadlineOnly').checked = state.filters.mainPanel.showDeadlineOnly;
            document.getElementById('showExpiredOnlyMain').checked = state.filters.mainPanel.showExpiredOnly;
            document.getElementById('searchArchived').value = state.filters.archivedPanel.searchTerm;
            document.getElementById('searchResolved').value = state.filters.resolvedPanel.searchTerm;
        }
    } catch (error) {
        console.error("Erro ao carregar estado da sessão:", error);
        sessionStorage.removeItem(`prayerAppState_${state.user.uid}`); // Limpa estado corrompido
    }
}


// =================================================================
// === LÓGICA DE AUTENTICAÇÃO E FLUXO DE DADOS ===
// =================================================================

async function handleSignUp() {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    if (!email || !password) return showToast("Por favor, preencha e-mail e senha.", "error");
    try {
        await createUserWithEmailAndPassword(auth, email, password);
        showToast("Cadastro realizado com sucesso! Você já está logado.", "success");
    } catch (error) {
        UI.updateAuthUI(null, "Erro ao cadastrar: " + error.message, true);
    }
}

async function handleSignIn() {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    if (!email || !password) return showToast("Por favor, preencha e-mail e senha.", "error");
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        UI.updateAuthUI(null, "Erro ao entrar: " + error.message, true);
    }
}

async function handlePasswordReset() {
    const email = document.getElementById('email').value.trim();
    if (!email) return showToast("Por favor, insira seu e-mail para redefinir a senha.", "error");
    try {
        await sendPasswordResetEmail(auth, email);
        UI.updateAuthUI(null, "Um e-mail de redefinição de senha foi enviado para " + email + ".");
    } catch (error) {
        UI.updateAuthUI(null, "Erro ao redefinir senha: " + error.message, true);
    }
}

/**
 * (Candidato à Refatoração)
 * Filtra e renderiza os dados para um painel específico.
 * Esta função poderia ser movida para um módulo 'pagination-filter-handler.js' no futuro.
 * @param {string} panelId - O ID do painel a ser renderizado.
 */
function applyFiltersAndRender(panelId) {
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
            const now = new Date();
            const todayUTCStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
            if (panelFilters.showDeadlineOnly && !target.hasDeadline) return false;
            if (panelFilters.showExpiredOnly) {
                 if (!target.hasDeadline || !target.deadlineDate || target.deadlineDate.getTime() >= todayUTCStart.getTime()) {
                     return false;
                 }
            }
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
    
    saveStateToSession(); // Salva o estado após cada renderização
}

async function loadDataForUser(user) {
    try {
        state.user = user;
        loadStateFromSession(); // MELHORIA: Carrega o estado da sessão antes de buscar dados

        const [prayerData, archivedData, perseveranceData, weeklyData] = await Promise.all([
            Service.fetchPrayerTargets(user.uid),
            Service.fetchArchivedTargets(user.uid),
            Service.loadPerseveranceData(user.uid),
            Service.loadWeeklyPrayerData(user.uid)
        ]);

        state.prayerTargets = prayerData;
        state.archivedTargets = archivedData.filter(t => !t.resolved);
        state.resolvedTargets = archivedData.filter(t => t.resolved);
        state.perseveranceData = perseveranceData;
        state.weeklyPrayerData = weeklyData;

        const dailyTargetsData = await Service.loadDailyTargets(user.uid, state.prayerTargets);
        state.dailyTargets = dailyTargetsData;

        // Renderiza tudo com o estado já carregado e filtrado
        applyFiltersAndRender('mainPanel');
        applyFiltersAndRender('archivedPanel');
        applyFiltersAndRender('resolvedPanel');
        UI.renderDailyTargets(state.dailyTargets.pending, state.dailyTargets.completed);
        UI.renderPriorityTargets(state.prayerTargets, state.dailyTargets);
        UI.updatePerseveranceUI(state.perseveranceData);
        UI.updateWeeklyChart(state.weeklyPrayerData);
        UI.showPanel('dailySection');

        const now = new Date();
        const todayUTCStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const expiredTargets = state.prayerTargets.filter(target => 
            target.hasDeadline && target.deadlineDate && target.deadlineDate.getTime() < todayUTCStart.getTime()
        );
        
        if (expiredTargets.length > 0) UI.showExpiredTargetsToast(expiredTargets);
        
        updateFloatingNavVisibility(state);

    } catch (error) {
        console.error("[App] Error during data loading process:", error);
        showToast("Ocorreu um erro crítico ao carregar seus dados.", "error");
        handleLogoutState();
    }
}

function handleLogoutState() {
    const defaultState = { user: null, prayerTargets: [], archivedTargets: [], resolvedTargets: [], perseveranceData: { consecutiveDays: 0, recordDays: 0, lastInteractionDate: null }, weeklyPrayerData: { weekId: null, interactions: {} }, dailyTargets: { pending: [], completed: [], targetIds: [] }, pagination: { mainPanel: { currentPage: 1, targetsPerPage: 10 }, archivedPanel: { currentPage: 1, targetsPerPage: 10 }, resolvedPanel: { currentPage: 1, targetsPerPage: 10 }}, filters: { mainPanel: { searchTerm: '', showDeadlineOnly: false, showExpiredOnly: false }, archivedPanel: { searchTerm: '' }, resolvedPanel: { searchTerm: '' }} };
    state = defaultState;
    UI.renderTargets([], 0, 1, 10); UI.renderArchivedTargets([], 0, 1, 10); UI.renderResolvedTargets([], 0, 1, 10); UI.renderDailyTargets([], []); UI.resetPerseveranceUI(); UI.resetWeeklyChart(); UI.showPanel('authSection');
    updateFloatingNavVisibility(state);
    sessionStorage.clear(); // Limpa o estado da sessão no logout
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
        isPriority: isPriority
    };
    try {
        await Service.addNewPrayerTarget(state.user.uid, newTarget);
        showToast("Alvo adicionado com sucesso!", "success");
        document.getElementById('prayerForm').reset();
        document.getElementById('deadlineContainer').style.display = 'none';
        await loadDataForUser(state.user);
        UI.showPanel('mainPanel');
    } catch (error) {
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
    UI.renderDailyTargets(state.dailyTargets.pending, state.dailyTargets.completed);
    UI.renderPriorityTargets(state.prayerTargets, state.dailyTargets);

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
    } catch (error) {
        showToast("Erro ao registrar oração. Desfazendo.", "error");
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
    } catch (error) {
        showToast("Erro ao sincronizar. A ação será desfeita.", "error");
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
    } catch (error) {
        showToast("Erro ao sincronizar. A ação será desfeita.", "error");
        state.archivedTargets.shift();
        state.prayerTargets.splice(index, 0, targetToArchive);
        applyFiltersAndRender('mainPanel');
        applyFiltersAndRender('archivedPanel');
    }
}

async function handleTogglePriority(target) {
    const newStatus = !target.isPriority;
    
    target.isPriority = newStatus;
    applyFiltersAndRender('mainPanel');
    UI.renderPriorityTargets(state.prayerTargets, state.dailyTargets);

    try {
        await Service.updateTargetField(state.user.uid, target.id, false, { isPriority: newStatus });
        showToast(newStatus ? "Alvo marcado como prioritário." : "Alvo removido dos prioritários.", "info");
    } catch (error) {
        showToast("Erro ao sincronizar. A alteração foi desfeita.", "error");
        target.isPriority = !newStatus;
        applyFiltersAndRender('mainPanel');
        UI.renderPriorityTargets(state.prayerTargets, state.dailyTargets);
    }
}

// ===============================================
// === PONTO DE ENTRADA DA APLICAÇÃO E EVENTOS ===
// ===============================================
document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, user => {
        UI.updateAuthUI(user);
        if (user) loadDataForUser(user);
        else handleLogoutState();
    });

    // --- Listeners de Autenticação e Formulário Principal ---
    document.getElementById('btnEmailSignUp').addEventListener('click', handleSignUp);
    document.getElementById('btnEmailSignIn').addEventListener('click', handleSignIn);
    document.getElementById('btnForgotPassword').addEventListener('click', handlePasswordReset);
    document.getElementById('btnLogout').addEventListener('click', () => signOut(auth));
    document.getElementById('prayerForm').addEventListener('submit', handleAddNewTarget);
    document.getElementById('hasDeadline').addEventListener('change', e => { document.getElementById('deadlineContainer').style.display = e.target.checked ? 'block' : 'none'; });

    // --- Listeners de Navegação Principal ---
    document.getElementById('backToMainButton').addEventListener('click', () => UI.showPanel('dailySection'));
    document.getElementById('addNewTargetButton').addEventListener('click', () => UI.showPanel('appContent'));
    document.getElementById('viewAllTargetsButton').addEventListener('click', () => UI.showPanel('mainPanel'));
    document.getElementById('viewArchivedButton').addEventListener('click', () => UI.showPanel('archivedPanel'));
    document.getElementById('viewResolvedButton').addEventListener('click', () => UI.showPanel('resolvedPanel'));
    document.getElementById('viewInteractionReportButton').addEventListener('click', () => { window.location.href = 'orei.html'; });
    
    // --- Listeners de Filtros ---
    ['searchMain', 'searchArchived', 'searchResolved'].forEach(id => { 
        document.getElementById(id).addEventListener('input', e => { 
            const panelId = id.replace('search', '').toLowerCase() + 'Panel'; 
            state.filters[panelId].searchTerm = e.target.value; 
            state.pagination[panelId].currentPage = 1; 
            applyFiltersAndRender(panelId); 
        }); 
    });
    ['showDeadlineOnly', 'showExpiredOnlyMain'].forEach(id => { 
        document.getElementById(id).addEventListener('change', e => { 
            const filterName = id === 'showDeadlineOnly' ? 'showDeadlineOnly' : 'showExpiredOnly'; 
            state.filters.mainPanel[filterName] = e.target.checked; 
            state.pagination.mainPanel.currentPage = 1; 
            applyFiltersAndRender('mainPanel'); 
        }); 
    });

    // --- Listeners de Ações da Seção Diária ---
    document.getElementById('refreshDaily').addEventListener('click', async () => { if(confirm("Deseja gerar uma nova lista de alvos para hoje?")) { await Service.forceGenerateDailyTargets(state.user.uid, state.prayerTargets); await loadDataForUser(state.user); showToast("Nova lista gerada!", "success"); } });
    document.getElementById('copyDaily').addEventListener('click', () => { const text = state.dailyTargets.pending.map(t => `- ${t.title}`).join('\n'); navigator.clipboard.writeText(text); showToast("Alvos pendentes copiados!", "success"); });
    document.getElementById('addManualTargetButton').addEventListener('click', () => { UI.renderManualSearchResults([], state.prayerTargets); UI.toggleManualTargetModal(true); });
    document.getElementById('closeManualTargetModal').addEventListener('click', () => UI.toggleManualTargetModal(false));
    document.getElementById('manualTargetSearchInput').addEventListener('input', e => { const searchTerm = e.target.value.toLowerCase(); const filtered = state.prayerTargets.filter(t => t.title.toLowerCase().includes(searchTerm) || (t.details && t.details.toLowerCase().includes(searchTerm))); UI.renderManualSearchResults(filtered, state.prayerTargets, searchTerm); });

    // --- Listeners para Geração de Relatórios e Visualizações ---
    // (Demais listeners para modais de relatório permanecem como no original, pois são funcionais)

    // --- DELEGAÇÃO DE EVENTOS CENTRALIZADA ---
    document.body.addEventListener('click', async e => {
        const action = e.target.dataset.action;
        if (!action) return;
        if (!state.user) return;

        // Lógica de Paginação
        if (action === 'paginate') {
            e.preventDefault();
            const { page, panel } = e.target.dataset;
            if (e.target.classList.contains('disabled')) return;
            state.pagination[panel].currentPage = parseInt(page);
            applyFiltersAndRender(panel);
            return;
        }
        
        const targetElement = e.target.closest('.target, .manual-target-item');
        if (!targetElement && !['select-manual-target'].includes(action)) return;
        
        const id = targetElement?.dataset.id || e.target.dataset.id;
        if (!id) return;
        
        // Função auxiliar para encontrar o alvo
        const findTargetInState = (targetId) => {
            let target = state.prayerTargets.find(t => t.id === targetId);
            if (target) return { target, isArchived: false, panelId: 'mainPanel' };
            target = state.archivedTargets.find(t => t.id === targetId);
            if (target) return { target, isArchived: true, panelId: 'archivedPanel' };
            return { target: null, isArchived: null, panelId: null };
        };

        const { target, isArchived, panelId } = findTargetInState(id);
        const { obsIndex } = e.target.dataset;

        switch(action) {
            case 'pray':
            case 'pray-priority':
                await handlePray(id);
                break;
            case 'resolve':
                await handleResolveTarget(target);
                break;
            case 'archive':
                await handleArchiveTarget(target);
                break;
            case 'delete-archived':
                await Service.deleteArchivedTarget(state.user.uid, id); // Simplificado
                showToast("Alvo excluído.", "info");
                await loadDataForUser(state.user);
                break;
            case 'toggle-priority':
                await handleTogglePriority(target);
                break;
            case 'toggle-observation':
                UI.toggleAddObservationForm(id);
                break;
            case 'save-observation': {
                const text = document.getElementById(`observationText-${id}`).value.trim();
                const dateStr = document.getElementById(`observationDate-${id}`).value;
                if (!text || !dateStr) return showToast("Preencha o texto e a data.", "error");
                const newObservation = { text, date: new Date(dateStr + 'T12:00:00Z'), isSubTarget: false };
                await Service.addObservationToTarget(state.user.uid, id, isArchived, newObservation);
                await loadDataForUser(state.user);
                showToast("Observação adicionada.", "success");
                break;
            }
            // ... outros handlers de formulários inline (prazo, categoria) ...
            case 'select-manual-target':
                try {
                    await Service.addManualTargetToDailyList(state.user.uid, id);
                    UI.toggleManualTargetModal(false);
                    await loadDataForUser(state.user);
                    showToast("Alvo adicionado à lista do dia!", "success");
                } catch (error) { showToast(error.message, "error"); }
                break;

            // === MELHORIA IMPLEMENTADA: Lógica para Sub-Alvos ===
            case 'promote-observation': {
                if (!confirm("Deseja promover esta observação a um sub-alvo?")) return;
                const obs = target.observations[parseInt(obsIndex)];
                const newTitle = prompt("Título do novo sub-alvo?", obs.text.substring(0, 50));
                if (!newTitle) return;

                const updatedData = { isSubTarget: true, subTargetTitle: newTitle.trim(), subTargetStatus: 'active' };
                await Service.updateObservationInTarget(state.user.uid, id, isArchived, parseInt(obsIndex), updatedData);
                await loadDataForUser(state.user);
                showToast("Observação promovida a sub-alvo!", "success");
                break;
            }
            case 'toggle-sub-observation-form': {
                UI.toggleSubObservationForm(id, isArchived, parseInt(obsIndex));
                break;
            }
            case 'save-sub-observation': {
                const text = document.getElementById(`subObsText-${id}-${obsIndex}`).value.trim();
                if (!text) return showToast("O texto não pode estar vazio.", "error");
                const newSubObservation = { text, date: new Date() };

                await Service.addSubObservationToTarget(state.user.uid, id, isArchived, parseInt(obsIndex), newSubObservation);
                UI.toggleSubObservationForm(id, isArchived, parseInt(obsIndex)); // Fecha o form
                await loadDataForUser(state.user); // Recarrega para exibir
                showToast("Observação adicionada ao sub-alvo.", "success");
                break;
            }
            case 'pray-sub-target': {
                e.target.disabled = true;
                e.target.textContent = '✓ Orado!';
                const subTargetId = `${id}_${obsIndex}`;
                await Service.recordInteractionForSubTarget(state.user.uid, subTargetId);
                const { isNewRecord } = await Service.recordUserInteraction(state.user.uid, state.perseveranceData, state.weeklyPrayerData);
                // Otimização: Apenas recarrega dados de perseverança em vez do usuário inteiro
                const [pData, wData] = await Promise.all([Service.loadPerseveranceData(state.user.uid), Service.loadWeeklyPrayerData(state.user.uid)]);
                state.perseveranceData = pData;
                state.weeklyPrayerData = wData;
                UI.updatePerseveranceUI(pData, isNewRecord);
                UI.updateWeeklyChart(wData);
                showToast("Interação com sub-alvo registrada!", "success");
                break;
            }
        }
    });

    initializeFloatingNav(state);
});