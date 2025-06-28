// script.js (agora atuando como o orquestrador principal, app.js)

// --- MÓDULOS ---
import { auth, onAuthStateChanged, signOut } from './firebase.js';
import * as Service from './firestore-service.js';
import * as UI from './ui.js';
import * as AuthUI from './auth-ui.js'; // Novo módulo para UI de autenticação

// --- ESTADO DA APLICAÇÃO ---
// Em um projeto maior, isso iria para seu próprio módulo (state.js)
let state = {
    prayerTargets: [],
    archivedTargets: [],
    resolvedTargets: [],
    perseveranceData: {},
    weeklyPrayerData: {},
    dailyTargets: {
        pending: [],
        completed: []
    },
    pagination: {
        main: { currentPage: 1, targetsPerPage: 10 },
        archived: { currentPage: 1, targetsPerPage: 10 },
        resolved: { currentPage: 1, targetsPerPage: 10 },
    },
    filters: {
        main: { searchTerm: '', showDeadlineOnly: false, showExpiredOnly: false },
        archived: { searchTerm: '' },
        resolved: { searchTerm: '' },
    }
};

// --- FUNÇÃO PRINCIPAL DE CARREGAMENTO ---

/**
 * Ponto de entrada principal após a verificação de autenticação.
 * Carrega todos os dados necessários para o usuário ou limpa a UI se deslogado.
 * @param {object|null} user - O objeto de usuário do Firebase ou null.
 */
async function loadData(user) {
    if (user) {
        console.log(`[App] User ${user.uid} authenticated. Loading data...`);
        UI.showPanel('dailySection'); // Mostra um painel de carregamento inicial
        
        try {
            // Carrega todos os dados em paralelo para mais eficiência
            const [prayerData, archivedData, perseveranceData, weeklyData, dailyTargetsData] = await Promise.all([
                Service.fetchPrayerTargets(user.uid),
                Service.fetchArchivedTargets(user.uid),
                Service.loadPerseveranceData(user.uid),
                Service.loadWeeklyPrayerData(user.uid),
                Service.loadDailyTargets(user.uid) // Assumindo que o serviço pode precisar dos alvos ativos
            ]);

            // Atualiza o estado global
            state.prayerTargets = prayerData;
            state.archivedTargets = archivedData;
            state.resolvedTargets = archivedData.filter(t => t.resolved);
            state.perseveranceData = perseveranceData;
            state.weeklyPrayerData = weeklyData;
            state.dailyTargets = dailyTargetsData;

            // Renderiza todas as seções com os dados do estado
            applyFiltersAndRender('main');
            applyFiltersAndRender('archived');
            applyFiltersAndRender('resolved');
            UI.renderDailyTargets(state.dailyTargets.pending, state.dailyTargets.completed);
            UI.updatePerseveranceUI(state.perseveranceData);
            UI.updateWeeklyChart(state.weeklyPrayerData);

        } catch (error) {
            console.error("[App] Error during data loading process:", error);
            alert("Ocorreu um erro ao carregar seus dados. Por favor, recarregue a página.");
            handleLogoutState(); // Reseta a UI em caso de erro grave
        }
    } else {
        console.log("[App] No user authenticated. Clearing UI.");
        handleLogoutState();
    }
}

/**
 * Limpa o estado e a UI para a visão de usuário deslogado.
 */
function handleLogoutState() {
    // Reseta o estado
    state = {
        prayerTargets: [],
        archivedTargets: [],
        resolvedTargets: [],
        //... reseta todo o objeto state
        pagination: { main: { currentPage: 1, targetsPerPage: 10 }, /*...*/ },
        filters: { main: { searchTerm: '', /*...*/ } },
    };

    // Limpa a UI passando arrays vazios
    UI.renderTargets([], 0, 1, 10);
    UI.renderArchivedTargets([], 0, 1, 10);
    UI.renderResolvedTargets([], 0, 1, 10);
    UI.renderDailyTargets([], []);
    UI.resetPerseveranceUI();
    UI.resetWeeklyChart();
    
    UI.showPanel('authSection'); // Mostra a seção de autenticação
}

// --- FILTROS E RENDERIZAÇÃO ---

/**
 * Aplica os filtros e a paginação atuais a uma lista de alvos.
 * @param {string} panelType - 'main', 'archived', ou 'resolved'.
 */
function applyFiltersAndRender(panelType) {
    const { searchTerm } = state.filters[panelType];
    const { currentPage, targetsPerPage } = state.pagination[panelType];
    
    let sourceData = [];
    if (panelType === 'main') sourceData = state.prayerTargets;
    else if (panelType === 'archived') sourceData = state.archivedTargets;
    else if (panelType === 'resolved') sourceData = state.resolvedTargets;

    // 1. Aplicar filtro de busca
    let filteredData = sourceData;
    if (searchTerm) {
        const lowerSearchTerm = searchTerm.toLowerCase();
        filteredData = sourceData.filter(target => 
            target.title?.toLowerCase().includes(lowerSearchTerm) ||
            target.details?.toLowerCase().includes(lowerSearchTerm) ||
            target.category?.toLowerCase().includes(lowerSearchTerm)
        );
    }
    
    // 2. Aplicar outros filtros (apenas para o painel principal)
    if (panelType === 'main') {
        const { showDeadlineOnly, showExpiredOnly } = state.filters.main;
        if (showDeadlineOnly) {
            filteredData = filteredData.filter(t => t.hasDeadline && t.deadlineDate);
        }
        if (showExpiredOnly) {
            filteredData = filteredData.filter(t => t.hasDeadline && t.deadlineDate && new Date() > t.deadlineDate);
        }
    }
    
    // 3. Ordenar (opcional, pode ser feito no serviço)
    // ...

    // 4. Paginar
    const totalFiltered = filteredData.length;
    const startIndex = (currentPage - 1) * targetsPerPage;
    const pagedData = filteredData.slice(startIndex, startIndex + targetsPerPage);

    // 5. Renderizar
    if (panelType === 'main') {
        UI.renderTargets(pagedData, totalFiltered, currentPage, targetsPerPage);
    } else if (panelType === 'archived') {
        UI.renderArchivedTargets(pagedData, totalFiltered, currentPage, targetsPerPage);
    } else if (panelType === 'resolved') {
        UI.renderResolvedTargets(pagedData, totalFiltered, currentPage, targetsPerPage);
    }
}

// --- EVENT LISTENERS ---

document.addEventListener('DOMContentLoaded', () => {
    console.log("[App] DOM fully loaded. Initializing...");

    // Listener principal de autenticação
    onAuthStateChanged(auth, user => {
        AuthUI.updateAuthUI(user);
        loadData(user);
    });

    // --- Listeners de Autenticação ---
    document.getElementById('btnEmailSignUp').addEventListener('click', AuthUI.handleSignUp);
    document.getElementById('btnEmailSignIn').addEventListener('click', AuthUI.handleSignIn);
    document.getElementById('btnForgotPassword').addEventListener('click', AuthUI.handlePasswordReset);
    document.getElementById('btnLogout').addEventListener('click', () => signOut(auth));

    // --- Listeners de Navegação/Painéis ---
    document.getElementById('backToMainButton').addEventListener('click', () => UI.showPanel('dailySection'));
    document.getElementById('addNewTargetButton').addEventListener('click', () => UI.showPanel('appContent'));
    document.getElementById('viewAllTargetsButton').addEventListener('click', () => UI.showPanel('mainPanel'));
    document.getElementById('viewArchivedButton').addEventListener('click', () => UI.showPanel('archivedPanel'));
    document.getElementById('viewResolvedButton').addEventListener('click', () => UI.showPanel('resolvedPanel'));

    // --- Listeners de Filtros ---
    document.getElementById('searchMain').addEventListener('input', (e) => {
        state.filters.main.searchTerm = e.target.value;
        state.pagination.main.currentPage = 1;
        applyFiltersAndRender('main');
    });
    // Adicionar listeners para os outros inputs de busca e checkboxes de filtro...

    // --- Delegação de Eventos para Ações nos Alvos ---
    // Em vez de onclick no HTML, usamos um único listener no container
    document.getElementById('targetList').addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        const targetId = e.target.dataset.id;
        if (!action || !targetId) return;

        // Lógica para chamar as funções de serviço (Service.archiveTarget, etc.)
        // e depois recarregar os dados ou atualizar o estado e a UI.
        switch (action) {
            case 'resolve':
                // await Service.markAsResolved(auth.currentUser.uid, targetId);
                // loadData(auth.currentUser);
                break;
            case 'archive':
                // Lógica de arquivamento...
                break;
            case 'toggle-observation':
                UI.toggleAddObservation(targetId);
                break;
            // ... outros casos
        }
    });

    // Adicionar delegação de eventos para 'archivedList', 'resolvedList', 'dailyTargets' etc.
});
