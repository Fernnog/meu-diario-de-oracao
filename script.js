// script.js (Orquestrador Principal da Aplicação - CORRIGIDO)

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
    console.log(`[App] Aplicando filtros e renderizando para o painel: ${panelId}`);
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
            target.title.toLowerCase().includes(searchTerm) ||
            (target.details && target.details.toLowerCase().includes(searchTerm)) ||
            (target.category && target.category.toLowerCase().includes(searchTerm)) ||
            (target.observations && target.observations.some(obs => obs.text.toLowerCase().includes(searchTerm)));
        
        if (!matchesSearch) return false;

        // Filtros específicos do painel principal
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
    UI.showPanel('dailySection');
    
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
        
        // Renderizar tudo com os dados frescos
        applyFiltersAndRender('mainPanel');
        applyFiltersAndRender('archivedPanel');
        applyFiltersAndRender('resolvedPanel');

        UI.renderDailyTargets(state.dailyTargets.pending, state.dailyTargets.completed);
        UI.updatePerseveranceUI(state.perseveranceData);
        UI.updateWeeklyChart(state.weeklyPrayerData);

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
        date: new Date(document.getElementById('date').value + 'T12:00:00Z'), // Use UTC-like time
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
        document.getElementById('deadlineContainer').style.display = 'none'; // Reset deadline view
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
        
        // Recarrega os dados que mudaram
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

    // --- Listeners de Eventos Globais ---
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
    
    // Botões da seção diária
    document.getElementById('refreshDaily').addEventListener('click', handleRefreshDaily);
    document.getElementById('copyDaily').addEventListener('click', handleCopyDaily);
    document.getElementById('viewDaily').addEventListener('click', handleViewDaily);
    document.getElementById('addManualTargetButton').addEventListener('click', handleOpenManualAddModal);

    // *** CORREÇÃO: Listener do checkbox de prazo ***
    document.getElementById('hasDeadline').addEventListener('change', (e) => {
        document.getElementById('deadlineContainer').style.display = e.target.checked ? 'block' : 'none';
    });

    // *** CORREÇÃO: Listeners para busca e filtros ***
    ['searchMain', 'searchArchived', 'searchResolved'].forEach(id => {
        document.getElementById(id).addEventListener('input', (e) => {
            const panelId = id === 'searchMain' ? 'mainPanel' : (id === 'searchArchived' ? 'archivedPanel' : 'resolvedPanel');
            state.filters[panelId].searchTerm = e.target.value;
            state.pagination[panelId].currentPage = 1; // Reset page on new search
            applyFiltersAndRender(panelId);
        });
    });

    ['showDeadlineOnly', 'showExpiredOnlyMain'].forEach(id => {
        document.getElementById(id).addEventListener('change', (e) => {
            const filterName = id === 'showDeadlineOnly' ? 'showDeadlineOnly' : 'showExpiredOnly';
            state.filters.mainPanel[filterName] = e.target.checked;
            state.pagination.mainPanel.currentPage = 1; // Reset page on filter change
            applyFiltersAndRender('mainPanel');
        });
    });

    // Modal de adição manual
    document.getElementById('closeManualTargetModal').addEventListener('click', () => UI.toggleManualTargetModal(false));
    document.getElementById('manualTargetSearchInput').addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filtered = state.prayerTargets.filter(t => 
            t.title.toLowerCase().includes(searchTerm) || 
            (t.details && t.details.toLowerCase().includes(searchTerm))
        );
        UI.renderManualSearchResults(filtered, state.prayerTargets, searchTerm);
    });

    // Delegação de Eventos para ações dinâmicas
    document.body.addEventListener('click', async (e) => {
        const { action, id, page, panel } = e.target.dataset;
        if (!action && !page) return; // Se não houver ação ou paginação, sair

        // Ações de paginação
        if (page && panel) {
            e.preventDefault();
            state.pagination[panel].currentPage = parseInt(page);
            applyFiltersAndRender(panel);
            return;
        }
        
        if (!id || !state.user) return; // Ações a partir daqui precisam de id e usuário

        switch(action) {
            case 'pray':
                await handlePray(id);
                break;
            case 'select-manual-target':
                try {
                    await Service.addManualTargetToDailyList(state.user.uid, id);
                    UI.toggleManualTargetModal(false);
                    await loadDataForUser(state.user);
                    alert("Alvo adicionado à lista do dia!");
                } catch (error) {
                    console.error("Erro ao adicionar alvo manualmente:", error);
                    alert(error.message);
                }
                break;
            // Outras ações como 'resolve', 'archive' podem ser adicionadas aqui
            // Exemplo:
            // case 'archive':
            //     if (confirm("Tem certeza que deseja arquivar este alvo?")) {
            //         const targetToArchive = state.prayerTargets.find(t => t.id === id);
            //         if (targetToArchive) {
            //             await Service.archiveTarget(state.user.uid, targetToArchive);
            //             await loadDataForUser(state.user); // Recarrega os dados
            //         }
            //     }
            //     break;
        }
    });
});
