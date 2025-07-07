// script.js (Orquestrador Principal da Aplicação - Completo e Final)
// VERSÃO APRIMORADA: Inclui atualizações otimistas para uma melhor experiência do usuário.

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
            (target.observations && target.observations.some(obs => obs.text && obs.text.toLowerCase().includes(searchTerm)));
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
        
        // NOVO: Filtro por Período de Criação
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
    // 1. Atualiza o estado e a UI imediatamente.
    const targetIndex = state.dailyTargets.pending.findIndex(t => t.id === targetId);
    if (targetIndex > -1) {
        const [movedTarget] = state.dailyTargets.pending.splice(targetIndex, 1);
        state.dailyTargets.completed.push(movedTarget);
    } else {
        // Se não estava no 'pending', é um alvo prioritário orado pela primeira vez no dia.
        state.dailyTargets.completed.push(targetToPray);
    }
    UI.renderDailyTargets(state.dailyTargets.pending, state.dailyTargets.completed);
    UI.renderPriorityTargets(state.prayerTargets, state.dailyTargets);

    // 2. Tenta sincronizar com o backend.
    try {
        await Service.updateDailyTargetStatus(state.user.uid, targetId, true);
        const { isNewRecord } = await Service.recordUserInteraction(state.user.uid, state.perseveranceData, state.weeklyPrayerData);

        // 3. Em caso de sucesso, atualiza os dados secundários (perseverança, semana).
        const [perseveranceData, weeklyData] = await Promise.all([
            Service.loadPerseveranceData(state.user.uid),
            Service.loadWeeklyPrayerData(state.user.uid)
        ]);
        
        state.perseveranceData = perseveranceData;
        state.weeklyPrayerData = weeklyData;

        UI.updatePerseveranceUI(state.perseveranceData, isNewRecord);
        UI.updateWeeklyChart(state.weeklyPrayerData);

    } catch (error) {
        // 4. Em caso de falha, reverte a UI e o estado.
        console.error("Erro ao processar 'Orei!':", error);
        alert("Ocorreu um erro ao registrar sua oração. A ação será desfeita.");

        const completedIndex = state.dailyTargets.completed.findIndex(t => t.id === targetId);
        if (completedIndex > -1) {
            const [revertedTarget] = state.dailyTargets.completed.splice(completedIndex, 1);
            // Se o alvo pertencia à lista diária original, devolve para 'pending'.
            if (state.dailyTargets.targetIds.includes(targetId)) {
                 state.dailyTargets.pending.unshift(revertedTarget);
            }
        }
        // Re-renderiza para mostrar o estado revertido.
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
    
    // Listeners da Seção Diária
    document.getElementById('refreshDaily').addEventListener('click', handleRefreshDaily);
    document.getElementById('copyDaily').addEventListener('click', handleCopyDaily);
    document.getElementById('viewDaily').addEventListener('click', handleViewDaily);
    document.getElementById('addManualTargetButton').addEventListener('click', handleOpenManualAddModal);

    document.getElementById('generateViewButton').addEventListener('click', handleGenerateCurrentView);
    document.getElementById('generateCategoryViewButton').addEventListener('click', handleGenerateCategoryView);
    document.getElementById('viewResolvedViewButton').addEventListener('click', handleGenerateResolvedViewByPeriod);
    document.getElementById('viewPerseveranceReportButton').addEventListener('click', handleGeneratePerseveranceReport);
    document.getElementById('viewInteractionReportButton').addEventListener('click', handleGenerateInteractionReport);

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

    // O código para filtros de data foi removido do HTML, então os listeners foram removidos daqui para evitar erros.
    // Se a funcionalidade for re-adicionada ao HTML, os listeners devem voltar.

    document.getElementById('closeManualTargetModal').addEventListener('click', () => UI.toggleManualTargetModal(false));
    document.getElementById('manualTargetSearchInput').addEventListener('input', e => {
        const searchTerm = e.target.value.toLowerCase();
        const filtered = state.prayerTargets.filter(t => t.title.toLowerCase().includes(searchTerm) || (t.details && t.details.toLowerCase().includes(searchTerm)));
        UI.renderManualSearchResults(filtered, state.prayerTargets, searchTerm);
    });

    // --- DELEGAÇÃO DE EVENTOS PARA AÇÕES DINÂMICAS (REATORADO PARA UI OTIMISTA) ---
    document.body.addEventListener('click', async e => {
        const { action, id, page, panel } = e.target.dataset;
        if (!state.user && action) return; // Protege ações se o usuário não estiver logado

        if (page && panel) { // Lógica de paginação
            e.preventDefault();
            if (e.target.classList.contains('disabled')) return;
            state.pagination[panel].currentPage = parseInt(page);
            applyFiltersAndRender(panel);
            return;
        }

        if (!action || !id) return; // Se não for uma ação com ID, sai

        const findTargetInState = (targetId) => {
            let target = state.prayerTargets.find(t => t.id === targetId);
            if (target) return { target, isArchived: false };
            target = state.archivedTargets.find(t => t.id === targetId);
            if (target) return { target, isArchived: true };
            target = state.resolvedTargets.find(t => t.id === targetId);
            if (target) return { target, isArchived: true }; // Resolvidos estão na coleção de arquivados
            return { target: null, isArchived: null };
        };
        
        const { target, isArchived } = findTargetInState(id);
        if (!target) return; // Alvo não encontrado no estado local

        // Lógica de UI otimista para ações principais
        switch(action) {
            case 'pray':
            case 'pray-priority':
                await handlePray(id);
                break;

            case 'select-manual-target':
                try {
                    await Service.addManualTargetToDailyList(state.user.uid, id);
                    UI.toggleManualTargetModal(false);
                    await loadDataForUser(state.user); // Precisa recarregar para atualizar a lista diária
                    alert("Alvo adicionado!");
                } catch (error) {
                    console.error(error);
                    alert(error.message);
                }
                break;

            case 'resolve': {
                if (!confirm("Marcar como respondido?")) return;
                const index = state.prayerTargets.findIndex(t => t.id === id);
                if (index === -1) return;
                
                const [targetToResolve] = state.prayerTargets.splice(index, 1);
                targetToResolve.resolved = true;
                targetToResolve.resolutionDate = new Date(); // Data local para UI
                state.resolvedTargets.unshift(targetToResolve);

                applyFiltersAndRender('mainPanel');
                applyFiltersAndRender('resolvedPanel');

                try {
                    await Service.markAsResolved(state.user.uid, targetToResolve);
                } catch (error) {
                    console.error("Falha ao marcar como respondido:", error);
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
                    console.error("Falha ao arquivar:", error);
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
                    console.error("Falha ao excluir:", error);
                    alert("Erro ao sincronizar. O item será restaurado na lista.");
                    state.archivedTargets.splice(index, 0, deletedTarget);
                    applyFiltersAndRender('archivedPanel');
                }
                break;
            }
            
            // Ações que não alteram a lista, apenas o conteúdo de um alvo
            case 'toggle-observation': UI.toggleAddObservationForm(id); break;
            case 'save-observation': { 
                const text = document.getElementById(`observationText-${id}`).value.trim(); 
                const dateStr = document.getElementById(`observationDate-${id}`).value; 
                if (!text || !dateStr) return alert("Preencha o texto e a data."); 
                const newObservation = { text, date: new Date(dateStr + 'T12:00:00Z') }; 
                if (target) { 
                    // UI Otimista para observação
                    if (!target.observations) target.observations = [];
                    target.observations.push(newObservation);
                    UI.toggleAddObservationForm(id); // Fecha o form
                    applyFiltersAndRender(isArchived ? 'archivedPanel' : 'mainPanel');

                    try {
                        await Service.addObservationToTarget(state.user.uid, id, isArchived, newObservation); 
                    } catch(error) {
                        alert("Falha ao salvar observação. A alteração será desfeita.");
                        target.observations.pop(); // Reverte
                        applyFiltersAndRender(isArchived ? 'archivedPanel' : 'mainPanel');
                    }
                } 
                break; 
            }
            case 'edit-deadline': UI.toggleEditDeadlineForm(id, target?.deadlineDate); break;
            case 'save-deadline': { 
                const newDeadlineStr = document.getElementById(`deadlineInput-${id}`).value; 
                if (!newDeadlineStr) return alert("Selecione a nova data."); 
                const newDeadlineDate = new Date(newDeadlineStr + 'T12:00:00Z'); 
                const oldDeadline = target.deadlineDate;
                target.deadlineDate = newDeadlineDate; // UI Otimista
                UI.toggleEditDeadlineForm(id);
                applyFiltersAndRender(isArchived ? 'archivedPanel' : 'mainPanel');

                try {
                    await Service.updateTargetField(state.user.uid, id, isArchived, { deadlineDate: newDeadlineDate }); 
                } catch(error) {
                    alert("Falha ao salvar prazo. A alteração será desfeita.");
                    target.deadlineDate = oldDeadline; // Reverte
                    applyFiltersAndRender(isArchived ? 'archivedPanel' : 'mainPanel');
                }
                break; 
            }
            case 'edit-category': UI.toggleEditCategoryForm(id, target?.category); break;
            case 'save-category': { 
                const newCategory = document.getElementById(`categorySelect-${id}`).value; 
                const oldCategory = target.category;
                target.category = newCategory; // UI Otimista
                UI.toggleEditCategoryForm(id);
                applyFiltersAndRender(isArchived ? 'archivedPanel' : 'mainPanel');

                try {
                    await Service.updateTargetField(state.user.uid, id, isArchived, { category: newCategory }); 
                } catch(error) {
                    alert("Falha ao salvar categoria. A alteração será desfeita.");
                    target.category = oldCategory; // Reverte
                    applyFiltersAndRender(isArchived ? 'archivedPanel' : 'mainPanel');
                }
                break; 
            }
            
            case 'toggle-priority': {
                const newStatus = !target.isPriority;
                target.isPriority = newStatus; // Atualiza estado local

                applyFiltersAndRender('mainPanel'); // Re-renderiza painel principal
                UI.renderPriorityTargets(state.prayerTargets, state.dailyTargets); // Re-renderiza painel de prioridades

                try {
                    await Service.updateTargetField(state.user.uid, id, false, { isPriority: newStatus });
                } catch (error) {
                    console.error("Falha ao atualizar prioridade:", error);
                    alert("Erro ao sincronizar. A alteração foi desfeita.");
                    target.isPriority = !newStatus; // Reverte o estado
                    applyFiltersAndRender('mainPanel');
                    UI.renderPriorityTargets(state.prayerTargets, state.dailyTargets);
                }
                break;
            }
        }
    });

    initializeFloatingNav(state);
});