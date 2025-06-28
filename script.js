// script.js (Orquestrador Principal da Aplicação - Completo)

// --- MÓDULOS ---
import { auth } from './firebase-config.js'; 
import { onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import * as Service from './firestore-service.js';
import * as UI from './ui.js';

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

// --- LÓGICA DE AUTENTICAÇÃO (Interação do Usuário) ---
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

    // 1. Aplicar Filtros
    let filteredData = sourceData.filter(target => {
        const searchTerm = panelFilters.searchTerm.toLowerCase();
        const matchesSearch = searchTerm === '' ||
            (target.title && target.title.toLowerCase().includes(searchTerm)) ||
            (target.details && target.details.toLowerCase().includes(searchTerm)) ||
            (target.category && target.category.toLowerCase().includes(searchTerm)) ||
            (target.observations && target.observations.some(obs => obs.text && obs.text.toLowerCase().includes(searchTerm)));
        
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

    // 2. Aplicar Paginação
    const { currentPage, targetsPerPage } = panelState;
    const startIndex = (currentPage - 1) * targetsPerPage;
    const paginatedData = filteredData.slice(startIndex, startIndex + targetsPerPage);
    
    // 3. Chamar a função de renderização correta da UI
    switch (panelId) {
        case 'mainPanel':
            UI.renderTargets(paginatedData, filteredData.length, currentPage, targetsPerPage);
            break;
        case 'archivedPanel':
            UI.renderArchivedTargets(paginatedData, filteredData.length, currentPage, targetsPerPage);
            break;
        case 'resolvedPanel':
            UI.renderResolvedTargets(paginatedData, filteredData.length, currentPage, targetsPerPage);
            break;
    }
}

async function loadDataForUser(user) {
    console.log(`[App] User ${user.uid} authenticated. Loading data...`);
    
    try {
        const [prayerData, archivedData, perseveranceData, weeklyData] = await Promise.all([
            Service.fetchPrayerTargets(user.uid),
            Service.fetchArchivedTargets(user.uid),
            Service.loadPerseveranceData(user.uid),
            Service.loadWeeklyPrayerData(user.uid)
        ]);

        state.user = user;
        state.prayerTargets = prayerData;
        state.archivedTargets = archivedData;
        state.resolvedTargets = archivedData.filter(t => t.resolved);
        state.perseveranceData = perseveranceData;
        state.weeklyPrayerData = weeklyData;

        const dailyTargetsData = await Service.loadDailyTargets(user.uid, state.prayerTargets);
        state.dailyTargets = dailyTargetsData;
        
        applyFiltersAndRender('mainPanel');
        applyFiltersAndRender('archivedPanel');
        applyFiltersAndRender('resolvedPanel');

        UI.renderDailyTargets(state.dailyTargets.pending, state.dailyTargets.completed);
        UI.updatePerseveranceUI(state.perseveranceData);
        UI.updateWeeklyChart(state.weeklyPrayerData);
        
        UI.showPanel('dailySection');

    } catch (error) {
        console.error("[App] Error during data loading process:", error);
        alert("Ocorreu um erro crítico ao carregar seus dados. Por favor, recarregue a página.");
        handleLogoutState();
    }
}

function handleLogoutState() {
    console.log("[App] No user authenticated or logout occurred. Clearing UI.");
    state = {
        user: null, prayerTargets: [], archivedTargets: [], resolvedTargets: [],
        perseveranceData: { consecutiveDays: 0, recordDays: 0, lastInteractionDate: null },
        weeklyPrayerData: { weekId: null, interactions: {} },
        dailyTargets: { pending: [], completed: [], targetIds: [] },
        pagination: { mainPanel: { currentPage: 1, targetsPerPage: 10 }, archivedPanel: { currentPage: 1, targetsPerPage: 10 }, resolvedPanel: { currentPage: 1, targetsPerPage: 10 }},
        filters: { mainPanel: { searchTerm: '', showDeadlineOnly: false, showExpiredOnly: false }, archivedPanel: { searchTerm: '' }, resolvedPanel: { searchTerm: '' }}
    };

    UI.renderTargets([], 0, 1, 10);
    UI.renderArchivedTargets([], 0, 1, 10);
    UI.renderResolvedTargets([], 0, 1, 10);
    UI.renderDailyTargets([], []);
    UI.resetPerseveranceUI();
    UI.resetWeeklyChart();
    
    UI.showPanel('authSection');
}


// --- MANIPULADORES DE AÇÕES ---
async function handleAddNewTarget(event) {
    event.preventDefault();
    if (!state.user) return alert("Você precisa estar logado para adicionar um alvo.");

    const title = document.getElementById('title').value.trim();
    if (!title) return alert("O título é obrigatório.");

    const hasDeadline = document.getElementById('hasDeadline').checked;
    const deadlineValue = document.getElementById('deadlineDate').value;
    
    if (hasDeadline && !deadlineValue) {
        return alert("Por favor, selecione uma data para o prazo de validade.");
    }
    
    const newTarget = {
        title: title,
        details: document.getElementById('details').value.trim(),
        date: new Date(document.getElementById('date').value + 'T12:00:00Z'),
        hasDeadline: hasDeadline,
        deadlineDate: hasDeadline ? new Date(deadlineValue + 'T12:00:00Z') : null,
        category: document.getElementById('categorySelect').value,
        observations: [],
        resolved: false,
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
    const button = document.querySelector(`.pray-button[data-id="${targetId}"]`);
    if (button) button.disabled = true;

    try {
        await Service.updateDailyTargetStatus(state.user.uid, targetId, true);
        const { isNewRecord } = await Service.recordUserInteraction(state.user.uid, state.perseveranceData, state.weeklyPrayerData);
        
        const [perseveranceData, weeklyData, dailyTargetsData] = await Promise.all([
            Service.loadPerseveranceData(state.user.uid),
            Service.loadWeeklyPrayerData(state.user.uid),
            Service.loadDailyTargets(state.user.uid, state.prayerTargets)
        ]);

        state.perseveranceData = perseveranceData;
        state.weeklyPrayerData = weeklyData;
        state.dailyTargets = dailyTargetsData;

        UI.renderDailyTargets(state.dailyTargets.pending, state.dailyTargets.completed);
        UI.updatePerseveranceUI(state.perseveranceData, isNewRecord);
        UI.updateWeeklyChart(state.weeklyPrayerData);
        
    } catch (error) {
        console.error("Erro ao processar 'Orei!':", error);
        alert("Ocorreu um erro ao registrar sua oração.");
        if (button) button.disabled = false;
    }
}

async function handleRefreshDaily() {
    if (!state.user) return;
    if (confirm("Isso irá gerar uma nova lista de alvos para hoje, substituindo a atual. Deseja continuar?")) {
        try {
            await Service.forceGenerateDailyTargets(state.user.uid, state.prayerTargets);
            await loadDataForUser(state.user); 
            alert("Nova lista de alvos do dia gerada!");
        } catch (error) {
            console.error("Erro ao forçar a geração de alvos diários:", error);
            alert("Não foi possível gerar uma nova lista.");
        }
    }
}

function handleCopyDaily() {
    if (state.dailyTargets.pending.length === 0) {
        return alert("Não há alvos pendentes para copiar.");
    }
    const textToCopy = "Alvos de Oração Pendentes:\n\n" + state.dailyTargets.pending
        .map(t => `- ${t.title}: ${t.details || 'Sem detalhes.'}`)
        .join("\n");
    
    navigator.clipboard.writeText(textToCopy)
        .then(() => alert("Alvos pendentes copiados para a área de transferência!"))
        .catch(err => {
            console.error("Erro ao copiar texto:", err);
            alert("Não foi possível copiar os alvos.");
        });
}

function handleViewDaily() {
    const allDailyTargets = [...state.dailyTargets.pending, ...state.dailyTargets.completed];
    if (allDailyTargets.length === 0) return alert("Não há alvos para visualizar hoje.");
    
    const htmlContent = UI.generateViewHTML(allDailyTargets, "Alvos de Oração do Dia");
    const newWindow = window.open();
    newWindow.document.write(htmlContent);
    newWindow.document.close();
}

function handleOpenManualAddModal() {
    UI.renderManualSearchResults([], state.prayerTargets);
    UI.toggleManualTargetModal(true);
}

// --- MANIPULADORES DAS AÇÕES DE VISUALIZAÇÃO/RELATÓRIO ---
function handleGenerateCurrentView() {
    const allTargets = [...state.prayerTargets, ...state.archivedTargets];
    if (allTargets.length === 0) return alert("Não há alvos para visualizar.");
    const htmlContent = UI.generateViewHTML(allTargets, "Visualização Completa dos Alvos de Oração");
    const newWindow = window.open();
    newWindow.document.write(htmlContent);
    newWindow.document.close();
}

function handleGenerateCategoryView() {
    const allTargets = [...state.prayerTargets, ...state.archivedTargets];
    UI.toggleCategoryModal(true, allTargets);
}

function handleGenerateResolvedViewByPeriod() {
    UI.toggleDateRangeModal(true);
}

function handleGeneratePerseveranceReport() {
    const { consecutiveDays, recordDays, lastInteractionDate } = state.perseveranceData;
    // Pega as datas de interação da semana atual, ordena da mais recente para a mais antiga
    const interactionDates = Object.keys(state.weeklyPrayerData.interactions || {}).sort((a, b) => new Date(b) - new Date(a));

    const reportData = {
        consecutiveDays,
        recordDays,
        lastInteractionDate: lastInteractionDate ? new Date(lastInteractionDate).toLocaleDateString('pt-BR') : 'Nenhuma interação registrada',
        interactionDates, // Passa o array de datas para a função de UI
    };

    const htmlContent = UI.generatePerseveranceReportHTML(reportData);
    const newWindow = window.open();
    newWindow.document.write(htmlContent);
    newWindow.document.close();
}


// --- PONTO DE ENTRADA DA APLICAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("[App] DOM fully loaded. Initializing...");

    onAuthStateChanged(auth, user => {
        UI.updateAuthUI(user);
        if (user) {
            loadDataForUser(user);
        } else {
            handleLogoutState();
        }
    });

    // --- Listeners de Eventos Globais Estáticos ---
    document.getElementById('btnEmailSignUp').addEventListener('click', handleSignUp);
    document.getElementById('btnEmailSignIn').addEventListener('click', handleSignIn);
    document.getElementById('btnForgotPassword').addEventListener('click', handlePasswordReset);
    document.getElementById('btnLogout').addEventListener('click', () => signOut(auth).catch(err => console.error("Logout error", err)));
    document.getElementById('prayerForm').addEventListener('submit', handleAddNewTarget);
    document.getElementById('backToMainButton').addEventListener('click', () => UI.showPanel('dailySection'));
    document.getElementById('addNewTargetButton').addEventListener('click', () => UI.showPanel('appContent'));
    document.getElementById('viewAllTargetsButton').addEventListener('click', () => UI.showPanel('mainPanel'));
    document.getElementById('viewArchivedButton').addEventListener('click', () => UI.showPanel('archivedPanel'));
    document.getElementById('viewResolvedButton').addEventListener('click', () => UI.showPanel('resolvedPanel'));
    
    document.getElementById('refreshDaily').addEventListener('click', handleRefreshDaily);
    document.getElementById('copyDaily').addEventListener('click', handleCopyDaily);
    document.getElementById('viewDaily').addEventListener('click', handleViewDaily);
    document.getElementById('addManualTargetButton').addEventListener('click', handleOpenManualAddModal);

    document.getElementById('generateViewButton').addEventListener('click', handleGenerateCurrentView);
    document.getElementById('generateCategoryViewButton').addEventListener('click', handleGenerateCategoryView);
    document.getElementById('viewResolvedViewButton').addEventListener('click', handleGenerateResolvedViewByPeriod);
    document.getElementById('viewReportButton').addEventListener('click', handleGeneratePerseveranceReport);

    document.getElementById('closeDateRangeModal').addEventListener('click', () => UI.toggleDateRangeModal(false));
    document.getElementById('cancelDateRange').addEventListener('click', () => UI.toggleDateRangeModal(false));
    document.getElementById('generateResolvedView').addEventListener('click', () => {
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;
        if (!startDate || !endDate) return alert("Por favor, selecione as datas de início e fim.");
        
        const start = new Date(startDate + "T00:00:00Z");
        const end = new Date(endDate + "T23:59:59Z");

        const filtered = state.resolvedTargets.filter(t => t.resolutionDate >= start && t.resolutionDate <= end);
        const htmlContent = UI.generateViewHTML(filtered, `Alvos Respondidos de ${start.toLocaleDateString('pt-BR')} a ${end.toLocaleDateString('pt-BR')}`);
        const newWindow = window.open();
        newWindow.document.write(htmlContent);
        newWindow.document.close();
        UI.toggleDateRangeModal(false);
    });

    document.getElementById('closeCategoryModal').addEventListener('click', () => UI.toggleCategoryModal(false));
    document.getElementById('cancelCategoryView').addEventListener('click', () => UI.toggleCategoryModal(false));
    document.getElementById('confirmCategoryView').addEventListener('click', () => {
        const selectedCategories = Array.from(document.querySelectorAll('#categoryCheckboxesContainer input:checked')).map(cb => cb.value);
        if (selectedCategories.length === 0) return alert("Selecione ao menos uma categoria.");

        const filtered = [...state.prayerTargets, ...state.archivedTargets].filter(t => selectedCategories.includes(t.category));
        const htmlContent = UI.generateViewHTML(filtered, `Visualização para Categoria(s): ${selectedCategories.join(', ')}`);
        const newWindow = window.open();
        newWindow.document.write(htmlContent);
        newWindow.document.close();
        UI.toggleCategoryModal(false);
    });

    document.getElementById('hasDeadline').addEventListener('change', (e) => {
        document.getElementById('deadlineContainer').style.display = e.target.checked ? 'block' : 'none';
    });
    ['searchMain', 'searchArchived', 'searchResolved'].forEach(id => {
        document.getElementById(id).addEventListener('input', (e) => {
            const panelId = id === 'searchMain' ? 'mainPanel' : (id === 'searchArchived' ? 'archivedPanel' : 'resolvedPanel');
            state.filters[panelId].searchTerm = e.target.value;
            state.pagination[panelId].currentPage = 1;
            applyFiltersAndRender(panelId);
        });
    });
    ['showDeadlineOnly', 'showExpiredOnlyMain'].forEach(id => {
        document.getElementById(id).addEventListener('change', (e) => {
            const filterName = id === 'showDeadlineOnly' ? 'showDeadlineOnly' : 'showExpiredOnly';
            state.filters.mainPanel[filterName] = e.target.checked;
            state.pagination.mainPanel.currentPage = 1;
            applyFiltersAndRender('mainPanel');
        });
    });
    document.getElementById('closeManualTargetModal').addEventListener('click', () => UI.toggleManualTargetModal(false));
    document.getElementById('manualTargetSearchInput').addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filtered = state.prayerTargets.filter(t => 
            t.title.toLowerCase().includes(searchTerm) || 
            (t.details && t.details.toLowerCase().includes(searchTerm))
        );
        UI.renderManualSearchResults(filtered, state.prayerTargets, searchTerm);
    });

    // --- DELEGAÇÃO DE EVENTOS PARA AÇÕES DINÂMICAS ---
    document.body.addEventListener('click', async (e) => {
        const { action, id, page, panel } = e.target.dataset;
        if (!action && !page) return;

        if (page && panel) {
            e.preventDefault();
            if (e.target.classList.contains('disabled')) return;
            state.pagination[panel].currentPage = parseInt(page);
            applyFiltersAndRender(panel);
            return;
        }
        
        if (!id && action) { // Ações que não precisam de ID mas são delegadas
             if (e.target.closest('.cancel-deadline-btn')) UI.toggleEditDeadlineForm(e.target.dataset.id, null);
             if (e.target.closest('.cancel-category-btn')) UI.toggleEditCategoryForm(e.target.dataset.id, null);
             if (e.target.closest('.cancel-btn')) UI.toggleAddObservationForm(e.target.dataset.id);
             return;
        }
        
        if (!id || !state.user) return;

        const target = state.prayerTargets.find(t => t.id === id) || state.archivedTargets.find(t => t.id === id);

        switch(action) {
            case 'pray': await handlePray(id); break;
            case 'select-manual-target':
                try {
                    await Service.addManualTargetToDailyList(state.user.uid, id);
                    UI.toggleManualTargetModal(false); await loadDataForUser(state.user); alert("Alvo adicionado à lista do dia!");
                } catch (error) { console.error(error); alert(error.message); }
                break;
            case 'resolve':
                if (confirm("Marcar este alvo como respondido? Ele será movido para os arquivados.")) {
                    if (target) { await Service.markAsResolved(state.user.uid, target); await loadDataForUser(state.user); }
                }
                break;
            case 'archive':
                if (confirm("Tem certeza que deseja arquivar este alvo?")) {
                    if (target) { await Service.archiveTarget(state.user.uid, target); await loadDataForUser(state.user); }
                }
                break;
            case 'delete-archived':
                 if (confirm("EXCLUIR PERMANENTEMENTE? Esta ação não pode ser desfeita.")) {
                    if (target) { await Service.deleteArchivedTarget(state.user.uid, id); await loadDataForUser(state.user); }
                }
                break;
            case 'toggle-observation': UI.toggleAddObservationForm(id); break;
            case 'save-observation': {
                const text = document.getElementById(`observationText-${id}`).value.trim();
                const dateStr = document.getElementById(`observationDate-${id}`).value;
                if (!text || !dateStr) return alert("Por favor, preencha o texto e a data da observação.");
                const newObservation = { text, date: new Date(dateStr + 'T12:00:00Z') };
                if (target) { await Service.addObservationToTarget(state.user.uid, id, !!target.archived, newObservation); await loadDataForUser(state.user); }
                break;
            }
            case 'edit-deadline': UI.toggleEditDeadlineForm(id, target?.deadlineDate); break;
            case 'save-deadline': {
                const newDeadlineStr = document.getElementById(`deadlineInput-${id}`).value;
                if (!newDeadlineStr) return alert("Por favor, selecione a nova data do prazo.");
                const newDeadlineDate = new Date(newDeadlineStr + 'T12:00:00Z');
                await Service.updateTargetField(state.user.uid, id, !!target.archived, { deadlineDate: newDeadlineDate });
                await loadDataForUser(state.user);
                break;
            }
            case 'edit-category': UI.toggleEditCategoryForm(id, target?.category); break;
            case 'save-category': {
                const newCategory = document.getElementById(`categorySelect-${id}`).value;
                await Service.updateTargetField(state.user.uid, id, !!target.archived, { category: newCategory });
                await loadDataForUser(state.user);
                break;
            }
        }
    });
});
