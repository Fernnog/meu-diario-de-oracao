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
        mainPanel: { searchTerm: '', showDeadlineOnly: false, showExpiredOnly: false },
        archivedPanel: { searchTerm: '' },
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
// === MELHORIA DE UX: Persistência de Estado de Filtros/Paginação ===
// =================================================================

/**
 * Salva o estado atual dos filtros e da paginação no sessionStorage.
 */
function saveStateToSession() {
    const stateToSave = {
        filters: state.filters,
        pagination: state.pagination
    };
    sessionStorage.setItem('prayerAppSessionState', JSON.stringify(stateToSave));
}

/**
 * Carrega o estado salvo do sessionStorage para o estado da aplicação.
 */
function loadStateFromSession() {
    try {
        const savedStateJSON = sessionStorage.getItem('prayerAppSessionState');
        if (savedStateJSON) {
            const savedState = JSON.parse(savedStateJSON);
            state.filters = { ...state.filters, ...savedState.filters };
            state.pagination = { ...state.pagination, ...savedState.pagination };
        }
    } catch (error) {
        console.error("Erro ao carregar estado da sessão:", error);
        sessionStorage.removeItem('prayerAppSessionState'); // Limpa estado corrompido
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
    loadStateFromSession(); // Carrega o estado da sessão antes de qualquer coisa

    // Atualiza a UI dos filtros com o estado carregado
    document.getElementById('searchMain').value = state.filters.mainPanel.searchTerm;
    document.getElementById('showDeadlineOnly').checked = state.filters.mainPanel.showDeadlineOnly;
    document.getElementById('showExpiredOnlyMain').checked = state.filters.mainPanel.showExpiredOnly;
    document.getElementById('searchArchived').value = state.filters.archivedPanel.searchTerm;
    document.getElementById('searchResolved').value = state.filters.resolvedPanel.searchTerm;

    try {
        const [prayerData, archivedData, perseveranceData, weeklyData] = await Promise.all([
            Service.fetchPrayerTargets(user.uid),
            Service.fetchArchivedTargets(user.uid),
            Service.loadPerseveranceData(user.uid),
            Service.loadWeeklyPrayerData(user.uid)
        ]);
        state.user = user;
        state.prayerTargets = prayerData;
        state.archivedTargets = archivedData.filter(t => !t.resolved);
        state.resolvedTargets = archivedData.filter(t => t.resolved);
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

        const now = new Date();
        const todayUTCStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const expiredTargets = state.prayerTargets.filter(target => 
            target.hasDeadline && target.deadlineDate && target.deadlineDate.getTime() < todayUTCStart.getTime()
        );
        
        if (expiredTargets.length > 0) UI.showExpiredTargetsToast(expiredTargets);
        
        updateFloatingNavVisibility(state);

    } catch (error) {
        showToast("Ocorreu um erro crítico ao carregar seus dados.", "error");
        handleLogoutState();
    }
}
function handleLogoutState() {
    sessionStorage.removeItem('prayerAppSessionState'); // Limpa o estado da sessão no logout
    state = { user: null, prayerTargets: [], archivedTargets: [], resolvedTargets: [], perseveranceData: { consecutiveDays: 0, recordDays: 0, lastInteractionDate: null }, weeklyPrayerData: { weekId: null, interactions: {} }, dailyTargets: { pending: [], completed: [], targetIds: [] }, pagination: { mainPanel: { currentPage: 1, targetsPerPage: 10 }, archivedPanel: { currentPage: 1, targetsPerPage: 10 }, resolvedPanel: { currentPage: 1, targetsPerPage: 10 }}, filters: { mainPanel: { searchTerm: '', showDeadlineOnly: false, showExpiredOnly: false }, archivedPanel: { searchTerm: '' }, resolvedPanel: { searchTerm: '' }} };
    UI.renderTargets([], 0, 1, 10); UI.renderArchivedTargets([], 0, 1, 10); UI.renderResolvedTargets([], 0, 1, 10); UI.renderDailyTargets([], []); UI.resetPerseveranceUI(); UI.resetWeeklyChart(); UI.showPanel('authSection');
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
            if (state.dailyTargets.targetIds.includes(targetId)) state.dailyTargets.pending.unshift(revertedTarget);
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
        showToast("Erro ao sincronizar. O item será restaurado.", "error");
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

    try {
        await Service.addObservationToTarget(state.user.uid, target.id, isArchived, newObservation); 
        showToast("Observação adicionada.", "success");
    } catch(error) {
        showToast("Falha ao salvar. A alteração será desfeita.", "error");
        target.observations.pop();
        applyFiltersAndRender(panelId);
    }
}

async function handleSaveDeadline(target, isArchived, panelId) {
    const newDeadlineStr = document.getElementById(`deadlineInput-${target.id}`).value; 
    if (!newDeadlineStr) return showToast("Selecione a nova data de prazo.", "error"); 
    
    const newDeadlineDate = new Date(newDeadlineStr + 'T12:00:00Z'); 
    const oldDeadlineDate = target.deadlineDate;
    const oldHasDeadline = target.hasDeadline;

    target.deadlineDate = newDeadlineDate;
    target.hasDeadline = true;
    UI.toggleEditDeadlineForm(target.id, null);
    applyFiltersAndRender(panelId);

    try {
        await Service.updateTargetField(state.user.uid, target.id, isArchived, { hasDeadline: true, deadlineDate: newDeadlineDate }); 
        showToast("Prazo atualizado com sucesso!", "success");
    } catch(error) {
        showToast("Falha ao salvar prazo. A alteração foi desfeita.", "error");
        target.deadlineDate = oldDeadlineDate;
        target.hasDeadline = oldHasDeadline;
        applyFiltersAndRender(panelId);
    }
}

async function handleRemoveDeadline(target, isArchived, panelId) {
    if (!confirm("Tem certeza que deseja remover o prazo deste alvo?")) return;

    const oldDeadlineDate = target.deadlineDate;
    const oldHasDeadline = target.hasDeadline;

    target.deadlineDate = null;
    target.hasDeadline = false;
    UI.toggleEditDeadlineForm(target.id, null);
    applyFiltersAndRender(panelId);

    try {
        await Service.updateTargetField(state.user.uid, target.id, isArchived, { hasDeadline: false, deadlineDate: null });
        showToast("Prazo removido.", "info");
    } catch(error) {
        showToast("Falha ao remover prazo. A alteração foi desfeita.", "error");
        target.deadlineDate = oldDeadlineDate;
        target.hasDeadline = oldHasDeadline;
        applyFiltersAndRender(panelId);
    }
}

async function handleSaveCategory(target, isArchived, panelId) {
    const newCategory = document.getElementById(`categorySelect-${target.id}`).value; 
    const oldCategory = target.category;
    
    target.category = newCategory;
    UI.toggleEditCategoryForm(target.id);
    applyFiltersAndRender(panelId);

    try {
        await Service.updateTargetField(state.user.uid, target.id, isArchived, { category: newCategory }); 
        showToast("Categoria atualizada.", "success");
    } catch(error) {
        showToast("Falha ao salvar. A alteração foi desfeita.", "error");
        target.category = oldCategory;
        applyFiltersAndRender(panelId);
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

    document.getElementById('btnEmailSignUp').addEventListener('click', handleSignUp);
    document.getElementById('btnEmailSignIn').addEventListener('click', handleSignIn);
    document.getElementById('btnForgotPassword').addEventListener('click', handlePasswordReset);
    document.getElementById('btnLogout').addEventListener('click', () => signOut(auth));
    document.getElementById('prayerForm').addEventListener('submit', handleAddNewTarget);
    document.getElementById('backToMainButton').addEventListener('click', () => UI.showPanel('dailySection'));
    document.getElementById('addNewTargetButton').addEventListener('click', () => UI.showPanel('appContent'));
    document.getElementById('viewAllTargetsButton').addEventListener('click', () => UI.showPanel('mainPanel'));
    document.getElementById('viewArchivedButton').addEventListener('click', () => UI.showPanel('archivedPanel'));
    document.getElementById('viewResolvedButton').addEventListener('click', () => UI.showPanel('resolvedPanel'));
    
    document.getElementById('refreshDaily').addEventListener('click', async () => { if(confirm("Deseja gerar uma nova lista de alvos para hoje? A lista atual será substituída.")) { await Service.forceGenerateDailyTargets(state.user.uid, state.prayerTargets); await loadDataForUser(state.user); showToast("Nova lista gerada!", "success"); } });
    document.getElementById('copyDaily').addEventListener('click', () => { const text = state.dailyTargets.pending.map(t => `- ${t.title}`).join('\n'); navigator.clipboard.writeText(text); showToast("Alvos pendentes copiados!", "success"); });
    document.getElementById('viewDaily').addEventListener('click', () => { const allTargets = [...state.dailyTargets.pending, ...state.dailyTargets.completed.map(c => state.prayerTargets.find(pt => pt.id === c.id) || c)]; const html = UI.generateViewHTML(allTargets, "Alvos do Dia"); const newWindow = window.open(); newWindow.document.write(html); newWindow.document.close(); });
    document.getElementById('addManualTargetButton').addEventListener('click', () => { UI.renderManualSearchResults([], state.prayerTargets); UI.toggleManualTargetModal(true); });
    document.getElementById('generateViewButton').addEventListener('click', () => { const html = UI.generateViewHTML(state.prayerTargets, "Visualização de Alvos Ativos"); const newWindow = window.open(); newWindow.document.write(html); newWindow.document.close(); });
    document.getElementById('generateCategoryViewButton').addEventListener('click', () => { const allTargets = [...state.prayerTargets, ...state.archivedTargets, ...state.resolvedTargets]; UI.toggleCategoryModal(true, allTargets); });
    document.getElementById('viewResolvedViewButton').addEventListener('click', () => { UI.toggleDateRangeModal(true); });
    
    document.getElementById('viewPerseveranceReportButton').addEventListener('click', () => { const reportData = { ...state.perseveranceData, lastInteractionDate: state.perseveranceData.lastInteractionDate ? formatDateForDisplay(state.perseveranceData.lastInteractionDate) : "Nenhuma", interactionDates: Object.keys(state.weeklyPrayerData.interactions || {}) }; const html = UI.generatePerseveranceReportHTML(reportData); const newWindow = window.open(); newWindow.document.write(html); newWindow.document.close(); });
    document.getElementById('viewInteractionReportButton').addEventListener('click', () => { window.location.href = 'orei.html'; });
    
    document.getElementById('closeDateRangeModal').addEventListener('click', () => UI.toggleDateRangeModal(false));
    document.getElementById('cancelDateRange').addEventListener('click', () => UI.toggleDateRangeModal(false));
    document.getElementById('generateResolvedView').addEventListener('click', () => { const startDate = new Date(document.getElementById('startDate').value + 'T00:00:00Z'); const endDate = new Date(document.getElementById('endDate').value + 'T23:59:59Z'); const filtered = state.resolvedTargets.filter(t => t.resolutionDate >= startDate && t.resolutionDate <= endDate); const html = UI.generateViewHTML(filtered, `Alvos Respondidos de ${formatDateForDisplay(startDate)} a ${formatDateForDisplay(endDate)}`); const newWindow = window.open(); newWindow.document.write(html); newWindow.document.close(); UI.toggleDateRangeModal(false); });
    
    document.getElementById('closeCategoryModal').addEventListener('click', () => UI.toggleCategoryModal(false));
    document.getElementById('cancelCategoryView').addEventListener('click', () => UI.toggleCategoryModal(false));
    document.getElementById('confirmCategoryView').addEventListener('click', () => { const selectedCategories = Array.from(document.querySelectorAll('#categoryCheckboxesContainer input:checked')).map(cb => cb.value); const allTargets = [...state.prayerTargets, ...state.archivedTargets, ...state.resolvedTargets]; const filtered = allTargets.filter(t => selectedCategories.includes(t.category)); const html = UI.generateViewHTML(filtered, "Visualização por Categorias Selecionadas", selectedCategories); const newWindow = window.open(); newWindow.document.write(html); newWindow.document.close(); UI.toggleCategoryModal(false); });

    document.getElementById('hasDeadline').addEventListener('change', e => { document.getElementById('deadlineContainer').style.display = e.target.checked ? 'block' : 'none'; });
    ['searchMain', 'searchArchived', 'searchResolved'].forEach(id => { document.getElementById(id).addEventListener('input', e => { const panelId = id.replace('search', '').toLowerCase() + 'Panel'; state.filters[panelId].searchTerm = e.target.value; state.pagination[panelId].currentPage = 1; applyFiltersAndRender(panelId); }); });
    ['showDeadlineOnly', 'showExpiredOnlyMain'].forEach(id => { document.getElementById(id).addEventListener('change', e => { const filterName = id === 'showDeadlineOnly' ? 'showDeadlineOnly' : 'showExpiredOnly'; state.filters.mainPanel[filterName] = e.target.checked; state.pagination.mainPanel.currentPage = 1; applyFiltersAndRender('mainPanel'); }); });
    document.getElementById('closeManualTargetModal').addEventListener('click', () => UI.toggleManualTargetModal(false));
    document.getElementById('manualTargetSearchInput').addEventListener('input', e => { const searchTerm = e.target.value.toLowerCase(); const filtered = state.prayerTargets.filter(t => t.title.toLowerCase().includes(searchTerm) || (t.details && t.details.toLowerCase().includes(searchTerm))); UI.renderManualSearchResults(filtered, state.prayerTargets, searchTerm); });

    // --- DELEGAÇÃO DE EVENTOS CENTRALIZADA ---
    document.body.addEventListener('click', async e => {
        const { action, id, page, panel, obsIndex } = e.target.dataset;
        if (!state.user && action) return;

        if (page && panel) {
            e.preventDefault();
            if (e.target.classList.contains('disabled')) return;
            state.pagination[panel].currentPage = parseInt(page);
            applyFiltersAndRender(panel);
            return;
        }
        
        const findTargetInState = (targetId) => {
            let target = state.prayerTargets.find(t => t.id === targetId);
            if (target) return { target, isArchived: false, panelId: 'mainPanel' };
            target = state.archivedTargets.find(t => t.id === targetId);
            if (target) return { target, isArchived: true, panelId: 'archivedPanel' };
            return { target: null, isArchived: null, panelId: null };
        };
        
        if (!action || !id) return;

        const { target, isArchived, panelId } = findTargetInState(id);
        if (!target && !['select-manual-target'].includes(action)) return;

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
                await handleDeleteArchivedTarget(id);
                break;
            case 'toggle-observation':
                UI.toggleAddObservationForm(id);
                break;
            case 'save-observation':
                await handleAddObservation(target, isArchived, panelId);
                break;
            case 'edit-deadline': 
                UI.toggleEditDeadlineForm(id, target?.deadlineDate); 
                break;
            case 'save-deadline':
                await handleSaveDeadline(target, isArchived, panelId);
                break;
            case 'remove-deadline':
                await handleRemoveDeadline(target, isArchived, panelId);
                break;
            case 'edit-category':
                UI.toggleEditCategoryForm(id, target?.category);
                break;
            case 'save-category':
                await handleSaveCategory(target, isArchived, panelId);
                break;
            case 'toggle-priority':
                await handleTogglePriority(target);
                break;
            case 'select-manual-target':
                try {
                    await Service.addManualTargetToDailyList(state.user.uid, id);
                    UI.toggleManualTargetModal(false);
                    await loadDataForUser(state.user);
                    showToast("Alvo adicionado à lista do dia!", "success");
                } catch (error) { showToast(error.message, "error"); }
                break;
            case 'promote-observation': {
                if (!confirm("Deseja promover esta observação a um sub-alvo?")) return;
                const newTitle = prompt("Qual será o título deste novo sub-alvo?", target.observations[parseInt(obsIndex)].text.substring(0, 50));
                if (!newTitle || newTitle.trim() === '') return showToast("A promoção foi cancelada pois o título é inválido.", "info");

                const updatedObservationData = { isSubTarget: true, subTargetTitle: newTitle.trim(), subTargetStatus: 'active', interactionCount: 0, subObservations: [] };
                const originalObservation = { ...target.observations[parseInt(obsIndex)] };
                Object.assign(target.observations[parseInt(obsIndex)], updatedObservationData);
                applyFiltersAndRender(panelId);

                try {
                    await Service.updateObservationInTarget(state.user.uid, id, isArchived, parseInt(obsIndex), updatedObservationData);
                    showToast("Observação promovida a sub-alvo!", "success");
                } catch (error) {
                    target.observations[parseInt(obsIndex)] = originalObservation;
                    applyFiltersAndRender(panelId);
                    showToast("Falha ao salvar. A alteração foi desfeita.", "error");
                }
                break;
            }
            case 'pray-sub-target': {
                e.target.disabled = true;
                e.target.textContent = '✓ Orado!';
                e.target.classList.add('prayed');
                const subTargetId = `${id}_${obsIndex}`;
                if (findTargetInState(id).target) state.dailyTargets.completed.push({ targetId: subTargetId, isSubTarget: true, title: findTargetInState(id).target.observations[parseInt(obsIndex)].subTargetTitle });
                
                try {
                    await Service.recordInteractionForSubTarget(state.user.uid, subTargetId);
                    const { isNewRecord } = await Service.recordUserInteraction(state.user.uid, state.perseveranceData, state.weeklyPrayerData);
                    const [pData, wData] = await Promise.all([Service.loadPerseveranceData(state.user.uid), Service.loadWeeklyPrayerData(state.user.uid)]);
                    state.perseveranceData = pData; state.weeklyPrayerData = wData;
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
                if (e.target.disabled || !confirm("Reverter este sub-alvo para uma observação comum?")) return;
                const originalSubTarget = { ...target.observations[parseInt(obsIndex)] };
                const { isSubTarget, subTargetTitle, subTargetStatus, interactionCount, subObservations, ...updatedObservation } = originalSubTarget;
                
                target.observations[parseInt(obsIndex)] = updatedObservation;
                applyFiltersAndRender(panelId);

                try {
                    await Service.updateObservationInTarget(state.user.uid, id, isArchived, parseInt(obsIndex), { isSubTarget: false, subTargetTitle: null, subTargetStatus: null, interactionCount: null, subObservations: null });
                    showToast("Sub-alvo revertido.", "info");
                } catch (error) {
                    target.observations[parseInt(obsIndex)] = originalSubTarget;
                    applyFiltersAndRender(panelId);
                    showToast("Erro ao reverter.", "error");
                }
                break;
            }
            case 'resolve-sub-target': {
                if (!confirm("Marcar este sub-alvo como respondido?")) return;
                const originalSubTarget = { ...target.observations[parseInt(obsIndex)] };
                const updatedObservation = { subTargetStatus: 'resolved' };

                Object.assign(target.observations[parseInt(obsIndex)], updatedObservation);
                applyFiltersAndRender(panelId);

                try {
                    await Service.updateObservationInTarget(state.user.uid, id, isArchived, parseInt(obsIndex), updatedObservation);
                    showToast("Sub-alvo respondido!", "success");
                } catch (error) {
                    target.observations[parseInt(obsIndex)] = originalSubTarget;
                    applyFiltersAndRender(panelId);
                    showToast("Erro ao salvar.", "error");
                }
                break;
            }
            // --- IMPLEMENTAÇÃO DA MELHORIA: Lógica para Formulário Inline de Sub-Observação ---
            case 'toggle-sub-observation-form': {
                UI.toggleSubObservationForm(id, isArchived, parseInt(obsIndex));
                break;
            }
            case 'save-sub-observation': {
                const text = document.getElementById(`subObsText-${id}-${obsIndex}`).value.trim();
                if (!text) return showToast("O texto da observação não pode estar vazio.", "error");

                const newSubObservation = { text: text, date: new Date() };

                const subTarget = target.observations[parseInt(obsIndex)];
                if (!Array.isArray(subTarget.subObservations)) subTarget.subObservations = [];
                subTarget.subObservations.push(newSubObservation);
                applyFiltersAndRender(panelId);

                try {
                    await Service.addSubObservationToTarget(state.user.uid, id, isArchived, parseInt(obsIndex), newSubObservation);
                    showToast("Observação adicionada ao sub-alvo.", "success");
                } catch (error) {
                    subTarget.subObservations.pop();
                    applyFiltersAndRender(panelId);
                    showToast("Erro ao salvar. A alteração foi desfeita.", "error");
                }
                break;
            }
        }
    });

    initializeFloatingNav(state);
});