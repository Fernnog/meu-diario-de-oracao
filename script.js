// script.js (Orquestrador Principal da Aplicação)

// --- MÓDULOS ---
// Importa a instância 'auth' do seu arquivo de configuração do Firebase.
import { auth } from './firebase-config.js'; 
// Importa as funções específicas de autenticação que vamos usar.
import { onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
// Importa seus módulos personalizados. O '*' importa todas as funções exportadas como um objeto.
import * as Service from './firestore-service.js';
import * as UI from './ui.js';

// --- ESTADO DA APLICAÇÃO ---
// Um objeto central para guardar todos os dados dinâmicos da aplicação.
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
        alert("Erro ao cadastrar: " + error.message);
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
        // O listener onAuthStateChanged cuidará do resto.
    } catch (error) {
        console.error("Erro ao entrar:", error);
        alert("Erro ao entrar: " + error.message);
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

// --- FLUXO DE DADOS PRINCIPAL ---

async function loadDataForUser(user) {
    console.log(`[App] User ${user.uid} authenticated. Loading data...`);
    UI.showPanel('dailySection'); // Mostra um painel inicial enquanto carrega
    
    try {
        // Carrega dados essenciais em paralelo
        const [prayerData, archivedData, perseveranceData, weeklyData] = await Promise.all([
            Service.fetchPrayerTargets(user.uid),
            Service.fetchArchivedTargets(user.uid),
            Service.loadPerseveranceData(user.uid),
            Service.loadWeeklyPrayerData(user.uid)
        ]);

        // Atualiza o estado da aplicação
        state.user = user;
        state.prayerTargets = prayerData;
        state.archivedTargets = archivedData;
        state.resolvedTargets = archivedData.filter(t => t.resolved);
        state.perseveranceData = perseveranceData;
        state.weeklyPrayerData = weeklyData;

        // Carrega dados que dependem de outros (alvos do dia dependem dos alvos ativos)
        const dailyTargetsData = await Service.loadDailyTargets(user.uid, state.prayerTargets);
        state.dailyTargets = dailyTargetsData;

        // Renderiza todas as seções da UI com os dados atualizados
        applyFiltersAndRender('mainPanel');
        applyFiltersAndRender('archivedPanel');
        applyFiltersAndRender('resolvedPanel');
        UI.renderDailyTargets(state.dailyTargets.pending, state.dailyTargets.completed);
        UI.updatePerseveranceUI(state.perseveranceData);
        UI.updateWeeklyChart(state.weeklyPrayerData);

    } catch (error) {
        console.error("[App] Error during data loading process:", error);
        alert("Ocorreu um erro crítico ao carregar seus dados. Por favor, recarregue a página.");
        handleLogoutState(); // Reseta a UI para um estado seguro
    }
}

function handleLogoutState() {
    console.log("[App] No user authenticated or logout occurred. Clearing UI.");
    // Reseta o objeto de estado para os valores iniciais
    state = {
        user: null, prayerTargets: [], archivedTargets: [], resolvedTargets: [],
        perseveranceData: { consecutiveDays: 0, recordDays: 0 },
        weeklyPrayerData: { weekId: null, interactions: {} },
        dailyTargets: { pending: [], completed: [], targetIds: [] },
        pagination: { mainPanel: { currentPage: 1, targetsPerPage: 10 }, archivedPanel: { currentPage: 1, targetsPerPage: 10 }, resolvedPanel: { currentPage: 1, targetsPerPage: 10 }},
        filters: { mainPanel: { searchTerm: '', showDeadlineOnly: false, showExpiredOnly: false }, archivedPanel: { searchTerm: '' }, resolvedPanel: { searchTerm: '' }}
    };

    // Limpa todas as seções da UI
    UI.renderTargets([], 0, 1, 10);
    UI.renderArchivedTargets([], 0, 1, 10);
    UI.renderResolvedTargets([], 0, 1, 10);
    UI.renderDailyTargets([], []);
    UI.resetPerseveranceUI();
    UI.resetWeeklyChart();
    
    // Mostra o painel de autenticação
    UI.showPanel('authSection');
}

// --- LÓGICA DE FILTROS, PAGINAÇÃO E RENDERIZAÇÃO ---

function applyFiltersAndRender(panelId) {
    const { searchTerm } = state.filters[panelId];
    const { currentPage, targetsPerPage } = state.pagination[panelId];
    
    let sourceData = [];
    if (panelId === 'mainPanel') sourceData = state.prayerTargets;
    else if (panelId === 'archivedPanel') sourceData = state.archivedTargets;
    else if (panelId === 'resolvedPanel') sourceData = state.resolvedTargets;

    // Lógica de filtragem...
    let filteredData = sourceData;
    if (searchTerm) {
        const lowerTerm = searchTerm.toLowerCase();
        filteredData = sourceData.filter(target =>
            target.title?.toLowerCase().includes(lowerTerm) ||
            target.details?.toLowerCase().includes(lowerTerm)
        );
    }
    
    const totalFiltered = filteredData.length;
    const startIndex = (currentPage - 1) * targetsPerPage;
    const pagedData = filteredData.slice(startIndex, startIndex + targetsPerPage);

    const renderFunction = {
        mainPanel: UI.renderTargets,
        archivedPanel: UI.renderArchivedTargets,
        resolvedPanel: UI.renderResolvedTargets,
    }[panelId];
    
    renderFunction(pagedData, totalFiltered, currentPage, targetsPerPage);
}

function handlePageChange(panelId, newPage) {
    if (state.pagination[panelId] && newPage > 0) {
        state.pagination[panelId].currentPage = newPage;
        applyFiltersAndRender(panelId);
        document.getElementById(panelId).scrollIntoView({ behavior: 'smooth' });
    }
}

// --- PONTO DE ENTRADA DA APLICAÇÃO ---

document.addEventListener('DOMContentLoaded', () => {
    console.log("[App] DOM fully loaded. Initializing...");

    // O listener de autenticação é o gatilho principal da aplicação
    onAuthStateChanged(auth, user => {
        UI.updateAuthUI(user);
        if (user) {
            loadDataForUser(user);
        } else {
            handleLogoutState();
        }
    });

    // --- Listeners de Eventos Globais ---

    // Autenticação
    document.getElementById('btnEmailSignUp').addEventListener('click', handleSignUp);
    document.getElementById('btnEmailSignIn').addEventListener('click', handleSignIn);
    document.getElementById('btnForgotPassword').addEventListener('click', handlePasswordReset);
    document.getElementById('btnLogout').addEventListener('click', () => signOut(auth));

    // Navegação entre painéis
    document.getElementById('backToMainButton').addEventListener('click', () => UI.showPanel('dailySection'));
    document.getElementById('addNewTargetButton').addEventListener('click', () => UI.showPanel('appContent'));
    document.getElementById('viewAllTargetsButton').addEventListener('click', () => UI.showPanel('mainPanel'));
    document.getElementById('viewArchivedButton').addEventListener('click', () => UI.showPanel('archivedPanel'));
    document.getElementById('viewResolvedButton').addEventListener('click', () => UI.showPanel('resolvedPanel'));

    // Filtros de busca
    document.getElementById('searchMain').addEventListener('input', e => {
        state.filters.mainPanel.searchTerm = e.target.value;
        handlePageChange('mainPanel', 1);
    });
    // Adicionar listeners para os outros inputs de busca aqui...

    // Delegação de Eventos para ações dinâmicas (paginação, ações em alvos)
    document.body.addEventListener('click', async (e) => {
        const { action, id, panel, page } = e.target.dataset;

        // Manipulador para paginação
        if (panel && page && !e.target.classList.contains('disabled')) {
            handlePageChange(panel, parseInt(page));
            return;
        }

        // Manipulador para outras ações
        if (action && id) {
            const uid = state.user?.uid;
            if (!uid) return; // Proteção para garantir que o usuário está logado

            switch(action) {
                case 'resolve':
                    if (confirm('Marcar este alvo como respondido?')) {
                        const targetToResolve = state.prayerTargets.find(t => t.id === id);
                        await Service.markAsResolved(uid, targetToResolve);
                        loadDataForUser(state.user); // Recarrega tudo para consistência
                    }
                    break;
                case 'archive':
                    if (confirm('Arquivar este alvo?')) {
                        const targetToArchive = state.prayerTargets.find(t => t.id === id);
                        await Service.archiveTarget(uid, targetToArchive);
                        loadDataForUser(state.user);
                    }
                    break;
                case 'delete-archived':
                    if (confirm('Excluir este alvo permanentemente?')) {
                        await Service.deleteArchivedTarget(uid, id);
                        loadDataForUser(state.user);
                    }
                    break;
                case 'toggle-observation':
                    UI.toggleAddObservationForm(id);
                    break;
                // Adicionar casos para 'save-observation', 'edit-deadline', etc.
            }
        }
    });
});
