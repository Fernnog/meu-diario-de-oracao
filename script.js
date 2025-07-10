// script.js (Orquestrador Principal da Aplicação - Completo e Final)
// VERSÃO APRIMORADA: Inclui atualizações otimistas para uma melhor experiência do usuário e a nova lógica para gerenciar sub-alvos e sub-observações.

// --- MÓDULOS ---
import { auth } from './firebase-config.js'; 
import { onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import * as Service from './firestore-service.js';
import * as UI from './ui.js';
import { initializeFloatingNav, updateFloatingNavVisibility } from './floating-nav.js';

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

// --- LÓGICA DE AUTENTICAÇÃO ---
async function handleSignUp() {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    if (!email || !password) {
        alert("Por favor, preencha e-mail e senha.");
        return;
    }
    try {
        await createUserWithEmailAndPassword(auth, email, password);
        alert("Cadastro realizado com sucesso! Você já está logado.");
    } catch (error) {
        console.error("Erro ao cadastrar:", error);
        UI.updateAuthUI(null, "Erro ao cadastrar: " + error.message, true);
    }
}
async function handleSignIn() {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    if (!email || !password) {
        alert("Por favor, preencha e-mail e senha.");
        return;
    }
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        console.error("Erro ao entrar:", error);
        UI.updateAuthUI(null, "Erro ao entrar: " + error.message, true);
    }
}
async function handlePasswordReset() {
    const email = document.getElementById('email').value.trim();
    if (!email) {
        alert("Por favor, insira seu e-mail para redefinir a senha.");
        return;
    }
    try {
        await sendPasswordResetEmail(auth, email);
        UI.updateAuthUI(null, "Um e-mail de redefinição de senha foi enviado para " + email + ".");
    } catch (error) {
        console.error("Erro ao redefinir senha:", error);
        UI.updateAuthUI(null, "Erro ao redefinir senha: " + error.message, true);
    }
}

// --- FLUXO DE DADOS E RENDERIZAÇÃO ---
function applyFiltersAndRender(panelId) {
    const panelState = state.pagination[panelId];
    const panelFilters = state.filters[panelId];
    let sourceData = [];

    if (panelId === 'mainPanel') sourceData = state.prayerTargets;
    if (panelId === 'archivedPanel') sourceData = state.archivedTargets;
    if (panelId === 'resolvedPanel') sourceData = state.resolvedTargets;

    let filteredData = sourceData.filter(target => {
        // Filtro de Texto
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

        // Filtros específicos do Painel Principal
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
        
        // Filtro por Período de Criação
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
        
        if (expiredTargets.length > 0) {
            UI.showExpiredTargetsToast(expiredTargets);
        }
        
        updateFloatingNavVisibility(state);

    } catch (error) {
        console.error("[App] Error during data loading process:", error);
        alert("Ocorreu um erro crítico ao carregar seus dados.");
        handleLogoutState();
    }
}
function handleLogoutState() {
    state = { user: null, prayerTargets: [], archivedTargets: [], resolvedTargets: [], perseveranceData: { consecutiveDays: 0, recordDays: 0, lastInteractionDate: null }, weeklyPrayerData: { weekId: null, interactions: {} }, dailyTargets: { pending: [], completed: [], targetIds: [] }, pagination: { mainPanel: { currentPage: 1, targetsPerPage: 10 }, archivedPanel: { currentPage: 1, targetsPerPage: 10 }, resolvedPanel: { currentPage: 1, targetsPerPage: 10 }}, filters: { mainPanel: { searchTerm: '', showDeadlineOnly: false, showExpiredOnly: false, startDate: null, endDate: null }, archivedPanel: { searchTerm: '', startDate: null, endDate: null }, resolvedPanel: { searchTerm: '' }} };
    UI.renderTargets([], 0, 1, 10); UI.renderArchivedTargets([], 0, 1, 10); UI.renderResolvedTargets([], 0, 1, 10); UI.renderDailyTargets([], []); UI.resetPerseveranceUI(); UI.resetWeeklyChart(); UI.showPanel('authSection');
    updateFloatingNavVisibility(state);
}

// --- MANIPULADORES DE AÇÕES ---
async function handleAddNewTarget(event) {
    event.preventDefault();
    if (!state.user) return alert("Você precisa estar logado.");
    const title = document.getElementById('title').value.trim();
    if (!title) return alert("O título é obrigatório.");
    const hasDeadline = document.getElementById('hasDeadline').checked;
    const deadlineValue = document.getElementById('deadlineDate').value;
    if (hasDeadline && !deadlineValue) return alert("Selecione uma data para o prazo.");
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
        alert("Alvo adicionado com sucesso!");
        document.getElementById('prayerForm').reset();
        document.getElementById('deadlineContainer').style.display = 'none';
        await loadDataForUser(state.user);
        UI.showPanel('mainPanel');
    } catch (error) {
        console.error("Erro ao adicionar novo alvo:", error);
        alert("Falha ao adicionar alvo: " + error.message);
    }
}

async function handlePray(targetId) {
    const targetToPray = state.prayerTargets.find(t => t.id === targetId);
    if (!targetToPray) return;
    if (state.dailyTargets.completed.some(t => t.id === targetId)) return;

    // --- MELHORIA: UI Otimista ---
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
        console.error("Erro ao processar 'Orei!':", error);
        alert("Ocorreu um erro ao registrar sua oração. A ação será desfeita.");
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

async function handleRefreshDaily() {
    if (!state.user) return;
    if (confirm("Gerar uma nova lista de alvos para hoje?")) {
        try {
            await Service.forceGenerateDailyTargets(state.user.uid, state.prayerTargets);
            await loadDataForUser(state.user); 
            alert("Nova lista de alvos do dia gerada!");
        } catch (error) { console.error(error); alert("Não foi possível gerar a lista."); }
    }
}

function handleCopyDaily() {
    if (state.dailyTargets.pending.length === 0) return alert("Não há alvos pendentes para copiar.");
    const textToCopy = "Alvos Pendentes:\n\n" + state.dailyTargets.pending.map(t => `- ${t.title}: ${t.details || 'Sem detalhes.'}`).join("\n");
    navigator.clipboard.writeText(textToCopy).then(() => alert("Alvos pendentes copiados!")).catch(err => alert("Erro ao copiar."));
}

function handleViewDaily() {
    const allDailyTargets = [...state.dailyTargets.pending, ...state.dailyTargets.completed];
    if (allDailyTargets.length === 0) return alert("Não há alvos para visualizar hoje.");
    const htmlContent = UI.generateViewHTML(allDailyTargets, "Alvos de Oração do Dia");
    const newWindow = window.open(); newWindow.document.write(htmlContent); newWindow.document.close();
}

function handleOpenManualAddModal() {
    UI.renderManualSearchResults([], state.prayerTargets); UI.toggleManualTargetModal(true);
}

// --- MANIPULADORES DAS AÇÕES DE VISUALIZAÇÃO/RELATÓRIO ---
function handleGenerateCurrentView() {
    const allTargets = [...state.prayerTargets, ...state.archivedTargets, ...state.resolvedTargets];
    if (allTargets.length === 0) return alert("Não há alvos para visualizar.");
    const htmlContent = UI.generateViewHTML(allTargets, "Visualização Completa dos Alvos de Oração");
    const newWindow = window.open(); newWindow.document.write(htmlContent); newWindow.document.close();
}

function handleGenerateCategoryView() {
    const allTargets = [...state.prayerTargets, ...state.archivedTargets, ...state.resolvedTargets]; UI.toggleCategoryModal(true, allTargets);
}

function handleGenerateResolvedViewByPeriod() {
    UI.toggleDateRangeModal(true);
}

function handleGeneratePerseveranceReport() {
    const { consecutiveDays, recordDays, lastInteractionDate } = state.perseveranceData;
    const interactionDates = Object.keys(state.weeklyPrayerData.interactions || {}).sort((a, b) => new Date(b) - new Date(a));
    const reportData = { consecutiveDays, recordDays, lastInteractionDate: lastInteractionDate ? new Date(lastInteractionDate).toLocaleDateString('pt-BR') : 'Nenhuma interação registrada', interactionDates };
    const htmlContent = UI.generatePerseveranceReportHTML(reportData);
    const newWindow = window.open(); newWindow.document.write(htmlContent); newWindow.document.close();
}

async function handleGenerateInteractionReport() {
    if (!state.user) return;
    alert("Gerando relatório de interação por alvo. Isso pode levar alguns segundos...");
    try {
        const interactionMap = await Service.fetchInteractionCounts(state.user.uid);
        const allTargets = [...state.prayerTargets, ...state.archivedTargets, ...state.resolvedTargets];
        const htmlContent = UI.generateInteractionReportHTML(allTargets, interactionMap);
        const newWindow = window.open(); newWindow.document.write(htmlContent); newWindow.document.close();
    } catch (error) {
        console.error("Erro ao gerar relatório de interação:", error);
        alert("Ocorreu um erro ao gerar o relatório.");
    }
}

// --- PONTO DE ENTRADA DA APLICAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, user => {
        UI.updateAuthUI(user);
        if (user) { 
            loadDataForUser(user);
        } else { 
            handleLogoutState();
        }
    });

    // Listeners de Autenticação e Navegação Principal
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
    
    // Listeners da Seção Diária e Relatórios
    document.getElementById('refreshDaily').addEventListener('click', handleRefreshDaily);
    document.getElementById('copyDaily').addEventListener('click', handleCopyDaily);
    document.getElementById('viewDaily').addEventListener('click', handleViewDaily);
    document.getElementById('addManualTargetButton').addEventListener('click', handleOpenManualAddModal);
    document.getElementById('generateViewButton').addEventListener('click', handleGenerateCurrentView);
    document.getElementById('generateCategoryViewButton').addEventListener('click', handleGenerateCategoryView);
    document.getElementById('viewResolvedViewButton').addEventListener('click', handleGenerateResolvedViewByPeriod);
    document.getElementById('viewPerseveranceReportButton').addEventListener('click', handleGeneratePerseveranceReport);
    document.getElementById('viewInteractionReportButton').addEventListener('click', () => { window.location.href = 'orei.html'; });

    // Listeners dos Modais e Filtros
    document.getElementById('closeDateRangeModal').addEventListener('click', () => UI.toggleDateRangeModal(false));
    document.getElementById('cancelDateRange').addEventListener('click', () => UI.toggleDateRangeModal(false));
    document.getElementById('generateResolvedView').addEventListener('click', () => {
        const startDate = document.getElementById('startDate').value; const endDate = document.getElementById('endDate').value;
        if (!startDate || !endDate) return alert("Selecione as datas.");
        const start = new Date(startDate + "T00:00:00Z"); const end = new Date(endDate + "T23:59:59Z");
        const filtered = state.resolvedTargets.filter(t => t.resolutionDate >= start && t.resolutionDate <= end);
        const htmlContent = UI.generateViewHTML(filtered, `Respondidos de ${start.toLocaleDateString('pt-BR')} a ${end.toLocaleDateString('pt-BR')}`);
        const newWindow = window.open(); newWindow.document.write(htmlContent); newWindow.document.close();
        UI.toggleDateRangeModal(false);
    });
    document.getElementById('closeCategoryModal').addEventListener('click', () => UI.toggleCategoryModal(false));
    document.getElementById('cancelCategoryView').addEventListener('click', () => UI.toggleCategoryModal(false));
    document.getElementById('confirmCategoryView').addEventListener('click', () => {
        const selectedCategories = Array.from(document.querySelectorAll('#categoryCheckboxesContainer input:checked')).map(cb => cb.value);
        if (selectedCategories.length === 0) return alert("Selecione ao menos uma categoria.");
        const allTargets = [...state.prayerTargets, ...state.archivedTargets, ...state.resolvedTargets];
        const filtered = allTargets.filter(t => selectedCategories.includes(t.category));
        const htmlContent = UI.generateViewHTML(filtered, `Visualização por Categoria(s): ${selectedCategories.join(', ')}`);
        const newWindow = window.open(); newWindow.document.write(htmlContent); newWindow.document.close();
        UI.toggleCategoryModal(false);
    });
    document.getElementById('hasDeadline').addEventListener('change', e => {
        document.getElementById('deadlineContainer').style.display = e.target.checked ? 'block' : 'none';
    });
    ['searchMain', 'searchArchived', 'searchResolved'].forEach(id => {
        document.getElementById(id).addEventListener('input', e => {
            const panelId = id.replace('search', '').toLowerCase() + 'Panel';
            state.filters[panelId].searchTerm = e.target.value;
            state.pagination[panelId].currentPage = 1; applyFiltersAndRender(panelId);
        });
    });
    ['showDeadlineOnly', 'showExpiredOnlyMain'].forEach(id => {
        document.getElementById(id).addEventListener('change', e => {
            const filterName = id === 'showDeadlineOnly' ? 'showDeadlineOnly' : 'showExpiredOnly';
            state.filters.mainPanel[filterName] = e.target.checked;
            state.pagination.mainPanel.currentPage = 1; applyFiltersAndRender('mainPanel');
        });
    });
    document.getElementById('closeManualTargetModal').addEventListener('click', () => UI.toggleManualTargetModal(false));
    document.getElementById('manualTargetSearchInput').addEventListener('input', e => {
        const searchTerm = e.target.value.toLowerCase();
        const filtered = state.prayerTargets.filter(t => t.title.toLowerCase().includes(searchTerm) || (t.details && t.details.toLowerCase().includes(searchTerm)));
        UI.renderManualSearchResults(filtered, state.prayerTargets, searchTerm);
    });

    // --- DELEGAÇÃO DE EVENTOS PARA AÇÕES DINÂMICAS (INCLUINDO LÓGICA DE SUB-ALVOS) ---
    document.body.addEventListener('click', async e => {
        const { action, id, page, panel, obsIndex } = e.target.dataset;
        if (!state.user && action) return; // Protege ações se o usuário não estiver logado

        // --- LÓGICA DE PAGINAÇÃO ---
        if (page && panel) {
            e.preventDefault();
            if (e.target.classList.contains('disabled')) return;
            state.pagination[panel].currentPage = parseInt(page);
            applyFiltersAndRender(panel);
            return;
        }
        
        // --- FUNÇÃO AUXILIAR PARA ENCONTRAR ALVO NO ESTADO LOCAL ---
        const findTargetInState = (targetId) => {
            let target = state.prayerTargets.find(t => t.id === targetId);
            if (target) return { target, isArchived: false, panelId: 'mainPanel' };
            target = state.archivedTargets.find(t => t.id === targetId);
            if (target) return { target, isArchived: true, panelId: 'archivedPanel' };
            target = state.resolvedTargets.find(t => t.id === targetId);
            if (target) return { target, isArchived: true, panelId: 'resolvedPanel' };
            return { target: null, isArchived: null, panelId: null };
        };

        // --- LÓGICA PARA AÇÕES DE SUB-ALVO (TRATADAS ANTES DO SWITCH PRINCIPAL) ---
        const subTargetActions = ['promote-observation', 'resolve-sub-target', 'demote-sub-target'];
        if (subTargetActions.includes(action)) {
            const observationIndex = parseInt(obsIndex);
            if (isNaN(observationIndex) || !id) return;

            const { target, isArchived, panelId } = findTargetInState(id);
            if (!target || !target.observations || !target.observations[observationIndex]) return;

            const originalObservation = JSON.parse(JSON.stringify(target.observations[observationIndex]));
            let updatedObservationData = {};

            if (action === 'promote-observation') {
                const subTargetTitle = prompt("Digite um título para este novo sub-alvo:", originalObservation.text.substring(0, 50));
                if (!subTargetTitle) return; // Usuário cancelou
                updatedObservationData = { isSubTarget: true, subTargetTitle, subTargetStatus: 'pending' };
            } else if (action === 'resolve-sub-target') {
                updatedObservationData = { subTargetStatus: 'resolved' };
            } else if (action === 'demote-sub-target') {
                if (!confirm("Tem certeza que deseja reverter este sub-alvo para uma observação comum?")) return;
                updatedObservationData = { isSubTarget: false, subTargetTitle: undefined, subTargetStatus: undefined, subObservations: undefined };
            }
            
            // UI Otimista
            Object.assign(target.observations[observationIndex], updatedObservationData);
            applyFiltersAndRender(panelId);

            try {
                await Service.updateObservationInTarget(state.user.uid, id, isArchived, observationIndex, updatedObservationData);
            } catch (error) {
                console.error(`Falha ao executar a ação '${action}':`, error);
                alert("Ocorreu um erro ao sincronizar com o servidor. A alteração será desfeita.");
                target.observations[observationIndex] = originalObservation;
                applyFiltersAndRender(panelId);
            }
            return; // Encerra o fluxo aqui
        }
        
        // --- LÓGICA PARA AÇÕES PRINCIPAIS E SUB-OBSERVAÇÕES (SWITCH) ---
        if (!action || !id) return;

        const { target, isArchived, panelId } = findTargetInState(id);
        if (!target && !['select-manual-target'].includes(action)) return;

        switch(action) {
            case 'pray':
            case 'pray-priority':
                await handlePray(id);
                break;

            case 'select-manual-target':
                try {
                    await Service.addManualTargetToDailyList(state.user.uid, id);
                    UI.toggleManualTargetModal(false);
                    await loadDataForUser(state.user);
                    alert("Alvo adicionado!");
                } catch (error) {
                    console.error(error);
                    alert(error.message);
                }
                break;
            
            case 'add-sub-observation': {
                const observationIndex = parseInt(e.target.dataset.obsIndex);
                const text = prompt("Digite a nova observação para este sub-alvo:");
                if (!text || text.trim() === '') return;
            
                const { target: currentTarget, isArchived: currentIsArchived, panelId: currentPanelId } = findTargetInState(id);
                if (!currentTarget) return;
            
                const newSubObservation = { text: text.trim(), date: new Date() };
            
                // UI Otimista
                const subTarget = currentTarget.observations[observationIndex];
                if (!Array.isArray(subTarget.subObservations)) {
                    subTarget.subObservations = [];
                }
                subTarget.subObservations.push(newSubObservation);
                applyFiltersAndRender(currentPanelId);
            
                try {
                    await Service.addSubObservationToTarget(state.user.uid, id, currentIsArchived, observationIndex, newSubObservation);
                } catch (error) {
                    console.error("Falha ao adicionar sub-observação:", error);
                    alert("Erro ao salvar. A alteração será desfeita.");
                    subTarget.subObservations.pop();
                    applyFiltersAndRender(currentPanelId);
                }
                break;
            }

            case 'resolve': {
                if (!confirm("Marcar como respondido?")) return;
                const index = state.prayerTargets.findIndex(t => t.id === id);
                if (index === -1) return;
                
                const [targetToResolve] = state.prayerTargets.splice(index, 1);
                targetToResolve.resolved = true;
                targetToResolve.resolutionDate = new Date();
                state.resolvedTargets.unshift(targetToResolve);

                applyFiltersAndRender('mainPanel');
                applyFiltersAndRender('resolvedPanel');

                try {
                    await Service.markAsResolved(state.user.uid, targetToResolve);
                } catch (error) {
                    alert("Erro ao sincronizar. A ação será desfeita.");
                    state.resolvedTargets.shift();
                    state.prayerTargets.splice(index, 0, targetToResolve);
                    applyFiltersAndRender('mainPanel');
                    applyFiltersAndRender('resolvedPanel');
                }
                break;
            }

            case 'archive': {
                if (!confirm("Arquivar este alvo?")) return;
                const index = state.prayerTargets.findIndex(t => t.id === id);
                if (index === -1) return;

                const [targetToArchive] = state.prayerTargets.splice(index, 1);
                targetToArchive.archived = true;
                targetToArchive.archivedDate = new Date();
                state.archivedTargets.unshift(targetToArchive);

                applyFiltersAndRender('mainPanel');
                applyFiltersAndRender('archivedPanel');

                try {
                    await Service.archiveTarget(state.user.uid, targetToArchive);
                } catch (error) {
                    alert("Erro ao sincronizar. A ação será desfeita.");
                    state.archivedTargets.shift();
                    state.prayerTargets.splice(index, 0, targetToArchive);
                    applyFiltersAndRender('mainPanel');
                    applyFiltersAndRender('archivedPanel');
                }
                break;
            }

            case 'delete-archived': {
                if (!confirm("EXCLUIR PERMANENTEMENTE? Esta ação não pode ser desfeita.")) return;
                const index = state.archivedTargets.findIndex(t => t.id === id);
                if (index === -1) return;
            
                const [deletedTarget] = state.archivedTargets.splice(index, 1);
                applyFiltersAndRender('archivedPanel');
            
                try {
                    await Service.deleteArchivedTarget(state.user.uid, id);
                } catch (error) {
                    alert("Erro ao sincronizar. O item será restaurado na lista.");
                    state.archivedTargets.splice(index, 0, deletedTarget);
                    applyFiltersAndRender('archivedPanel');
                }
                break;
            }
            
            case 'toggle-observation': UI.toggleAddObservationForm(id); break;
            case 'save-observation': { 
                const text = document.getElementById(`observationText-${id}`).value.trim(); 
                const dateStr = document.getElementById(`observationDate-${id}`).value; 
                if (!text || !dateStr) return alert("Preencha o texto e a data."); 
                const newObservation = { text, date: new Date(dateStr + 'T12:00:00Z'), isSubTarget: false }; 
                if (!target.observations) target.observations = [];
                target.observations.push(newObservation);
                UI.toggleAddObservationForm(id);
                applyFiltersAndRender(panelId);

                try {
                    await Service.addObservationToTarget(state.user.uid, id, isArchived, newObservation); 
                } catch(error) {
                    alert("Falha ao salvar observação. A alteração será desfeita.");
                    target.observations.pop();
                    applyFiltersAndRender(panelId);
                }
                break; 
            }
            
            // --- INÍCIO DA LÓGICA CORRIGIDA E COMPLETA PARA GERENCIAMENTO DE PRAZOS ---
            case 'edit-deadline': 
                // Ação de abrir o formulário, passando o prazo atual (ou undefined)
                UI.toggleEditDeadlineForm(id, target?.deadlineDate); 
                break;
            
            case 'save-deadline': { 
                const newDeadlineStr = document.getElementById(`deadlineInput-${id}`).value; 
                
                // Cenário 1: REMOVER o prazo
                if (!newDeadlineStr) {
                    if (!target.hasDeadline) { // Se já não tinha prazo, não faz nada
                        UI.toggleEditDeadlineForm(id);
                        return;
                    }
                    if (confirm("Você deixou a data em branco. Deseja remover o prazo deste alvo?")) {
                        const oldDeadline = target.deadlineDate;
                        target.deadlineDate = null;
                        target.hasDeadline = false;
                        
                        UI.toggleEditDeadlineForm(id);
                        applyFiltersAndRender(panelId);

                        try {
                            await Service.updateTargetField(state.user.uid, id, isArchived, { deadlineDate: null, hasDeadline: false }); 
                        } catch(error) {
                            alert("Falha ao remover o prazo. A alteração será desfeita.");
                            target.deadlineDate = oldDeadline;
                            target.hasDeadline = true;
                            applyFiltersAndRender(panelId);
                        }
                    }
                    return; // Sai da função após o bloco de remoção
                }

                // Cenário 2 e 3: ADICIONAR ou EDITAR o prazo
                const newDeadlineDate = new Date(newDeadlineStr + 'T12:00:00Z'); 
                const oldDeadline = target.deadlineDate;
                const oldHasDeadline = target.hasDeadline;

                // Atualização otimista do estado local
                target.deadlineDate = newDeadlineDate;
                target.hasDeadline = true; // Garante que a flag esteja correta
                UI.toggleEditDeadlineForm(id); // Fecha o formulário
                applyFiltersAndRender(panelId); // Re-renderiza a UI com os novos dados

                try {
                    // Persiste a mudança no Firestore
                    await Service.updateTargetField(state.user.uid, id, isArchived, { deadlineDate: newDeadlineDate, hasDeadline: true }); 
                } catch(error) {
                    alert("Falha ao salvar prazo. A alteração será desfeita.");
                    // Reverte a mudança no estado local em caso de erro
                    target.deadlineDate = oldDeadline;
                    target.hasDeadline = oldHasDeadline;
                    applyFiltersAndRender(panelId);
                }
                break; 
            }
            // --- FIM DA LÓGICA CORRIGIDA PARA GERENCIAMENTO DE PRAZOS ---
            
            case 'edit-category': UI.toggleEditCategoryForm(id, target?.category); break;
            case 'save-category': { 
                const newCategory = document.getElementById(`categorySelect-${id}`).value; 
                const oldCategory = target.category;
                target.category = newCategory;
                UI.toggleEditCategoryForm(id);
                applyFiltersAndRender(panelId);

                try {
                    await Service.updateTargetField(state.user.uid, id, isArchived, { category: newCategory }); 
                } catch(error) {
                    alert("Falha ao salvar categoria. A alteração será desfeita.");
                    target.category = oldCategory;
                    applyFiltersAndRender(panelId);
                }
                break; 
            }
            
            case 'toggle-priority': {
                const newStatus = !target.isPriority;
                target.isPriority = newStatus;
                applyFiltersAndRender('mainPanel');
                UI.renderPriorityTargets(state.prayerTargets, state.dailyTargets);

                try {
                    await Service.updateTargetField(state.user.uid, id, false, { isPriority: newStatus });
                } catch (error) {
                    alert("Erro ao sincronizar. A alteração foi desfeita.");
                    target.isPriority = !newStatus;
                    applyFiltersAndRender('mainPanel');
                    UI.renderPriorityTargets(state.prayerTargets, state.dailyTargets);
                }
                break;
            }
        }
    });

    initializeFloatingNav(state);
});