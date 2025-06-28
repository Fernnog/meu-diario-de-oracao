// script.js (Orquestrador Principal da Aplicação)

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
        // O listener onAuthStateChanged cuidará do resto.
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

// --- FLUXO DE DADOS PRINCIPAL ---

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

    UI.renderTargets([], 0, 1, 10, 'mainPanel');
    UI.renderArchivedTargets([], 0, 1, 10, 'archivedPanel');
    UI.renderResolvedTargets([], 0, 1, 10, 'resolvedPanel');
    UI.renderDailyTargets([], []);
    UI.resetPerseveranceUI();
    UI.resetWeeklyChart();
    
    UI.showPanel('authSection');
}

// --- MANIPULADORES DE AÇÕES ---

async function handleAddNewTarget(event) {
    event.preventDefault();
    if (!state.user) {
        alert("Você precisa estar logado para adicionar um alvo.");
        return;
    }

    const title = document.getElementById('title').value.trim();
    if (!title) {
        alert("O título é obrigatório.");
        return;
    }

    const newTarget = {
        title: title,
        details: document.getElementById('details').value.trim(),
        date: new Date(document.getElementById('date').value + 'T00:00:00'),
        hasDeadline: document.getElementById('hasDeadline').checked,
        deadlineDate: document.getElementById('hasDeadline').checked ? new Date(document.getElementById('deadlineDate').value + 'T00:00:00') : null,
        category: document.getElementById('categorySelect').value,
        observations: [],
        resolved: false,
        resolutionDate: null,
        archived: false,
        archivedDate: null,
    };

    try {
        await Service.addNewPrayerTarget(state.user.uid, newTarget);
        alert("Alvo adicionado com sucesso!");
        document.getElementById('prayerForm').reset();
        await loadDataForUser(state.user); // Recarrega todos os dados
        UI.showPanel('mainPanel'); // Mostra a lista de alvos
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

        // Recarregar dados essenciais para UI
        const [perseveranceData, weeklyData, dailyTargetsData] = await Promise.all([
            Service.loadPerseveranceData(state.user.uid),
            Service.loadWeeklyPrayerData(state.user.uid),
            Service.loadDailyTargets(state.user.uid, state.prayerTargets)
        ]);

        state.perseveranceData = perseveranceData;
        state.weeklyPrayerData = weeklyData;
        state.dailyTargets = dailyTargetsData;

        // Atualizar UI
        UI.renderDailyTargets(state.dailyTargets.pending, state.dailyTargets.completed);
        UI.updatePerseveranceUI(state.perseveranceData, isNewRecord);
        UI.updateWeeklyChart(state.weeklyPrayerData);
        
    } catch (error) {
        console.error("Erro ao processar 'Orei!':", error);
        alert("Ocorreu um erro ao registrar sua oração.");
        if (button) button.disabled = false;
    }
}

// --- FILTROS, PAGINAÇÃO E RENDERIZAÇÃO ---

function applyFiltersAndRender(panelId) {
    // ... (código existente)
}

function handlePageChange(panelId, newPage) {
    // ... (código existente)
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

    // Autenticação
    document.getElementById('btnEmailSignUp').addEventListener('click', handleSignUp);
    document.getElementById('btnEmailSignIn').addEventListener('click', handleSignIn);
    document.getElementById('btnForgotPassword').addEventListener('click', handlePasswordReset);
    document.getElementById('btnLogout').addEventListener('click', () => signOut(auth).catch(err => console.error("Logout error", err)));

    // Adicionar novo alvo
    document.getElementById('prayerForm').addEventListener('submit', handleAddNewTarget);

    // Navegação entre painéis
    document.getElementById('backToMainButton').addEventListener('click', () => UI.showPanel('dailySection'));
    document.getElementById('addNewTargetButton').addEventListener('click', () => UI.showPanel('appContent'));
    document.getElementById('viewAllTargetsButton').addEventListener('click', () => UI.showPanel('mainPanel'));
    document.getElementById('viewArchivedButton').addEventListener('click', () => UI.showPanel('archivedPanel'));
    document.getElementById('viewResolvedButton').addEventListener('click', () => UI.showPanel('resolvedPanel'));

    // Botões da seção diária (com funcionalidade de placeholder)
    document.getElementById('refreshDaily').addEventListener('click', () => alert('Funcionalidade "Atualizar Alvos do Dia" ainda não implementada.'));
    document.getElementById('copyDaily').addEventListener('click', () => alert('Funcionalidade "Copiar Alvos Pendentes" ainda não implementada.'));
    document.getElementById('viewDaily').addEventListener('click', () => alert('Funcionalidade "Visualizar Detalhes do Dia" ainda não implementada.'));
    document.getElementById('addManualTargetButton').addEventListener('click', () => alert('Funcionalidade "Adicionar Alvo Manualmente" ainda não implementada.'));

    // Filtros de busca
    document.getElementById('searchMain').addEventListener('input', e => {
        state.filters.mainPanel.searchTerm = e.target.value;
        state.pagination.mainPanel.currentPage = 1;
        applyFiltersAndRender('mainPanel');
    });
    // Adicionar listeners para outros inputs de busca aqui...

    // Delegação de Eventos para ações dinâmicas
    document.body.addEventListener('click', async (e) => {
        const { action, id, panel, page } = e.target.dataset;

        if (panel && page && !e.target.classList.contains('disabled')) {
            handlePageChange(panel, parseInt(page));
            return;
        }

        if (action && id) {
            const uid = state.user?.uid;
            if (!uid) return;

            switch(action) {
                // CORREÇÃO: Adicionando o case para a ação 'pray'
                case 'pray':
                    await handlePray(id);
                    break;
                case 'resolve':
                    // Lógica existente...
                    break;
                case 'archive':
                    // Lógica existente...
                    break;
                case 'delete-archived':
                    // Lógica existente...
                    break;
                case 'toggle-observation':
                    UI.toggleAddObservationForm(id);
                    break;
            }
        }
    });
});
