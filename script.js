// script.js (Orquestrador Principal da Aplicação - Versão com Edição Corrigida e Melhorias)
// ARQUITETURA REVISADA: Inclui gestão de prazos, handlers de ação refatorados e notificação para promover observações.

// --- MÓDULOS ---
import { auth } from './firebase-config.js'; 
import { onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import * as Service from './firestore-service.js';
import * as UI from './ui.js';
import { initializeFloatingNav, updateFloatingNavVisibility } from './floating-nav.js';
import { formatDateForDisplay, generateAndDownloadPdf } from './utils.js'; // <-- MODIFICADO: Importa a nova função de PDF

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
    // Cria o elemento toast
    const toast = document.createElement('div');
    toast.textContent = message;
    
    // Estilos base (injeta o CSS para não depender de alterações no arquivo .css)
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
    
    // Estilos baseados no tipo
    if (type === 'success') {
        toast.style.backgroundColor = '#28a745'; // Verde
    } else if (type === 'error') {
        toast.style.backgroundColor = '#dc3545'; // Vermelho
    } else { // 'info' e outros
        toast.style.backgroundColor = '#17a2b8'; // Azul (pode ser trocado por amarelo se desejado)
    }

    // Adiciona ao corpo e anima a entrada
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    }, 10);

    // Remove o toast após 3 segundos
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 300);
    }, 3000);
}


// =================================================================
// === LÓGICA DE AUTENTICAÇÃO E FLUXO DE DADOS ===
// =================================================================

async function handleSignUp() {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    if (!email || !password) {
        showToast("Por favor, preencha e-mail e senha.", "error");
        return;
    }
    try {
        await createUserWithEmailAndPassword(auth, email, password);
        showToast("Cadastro realizado com sucesso! Você já está logado.", "success");
    } catch (error) {
        console.error("Erro ao cadastrar:", error);
        UI.updateAuthUI(null, "Erro ao cadastrar: " + error.message, true);
    }
}
async function handleSignIn() {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    if (!email || !password) {
        showToast("Por favor, preencha e-mail e senha.", "error");
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
        showToast("Por favor, insira seu e-mail para redefinir a senha.", "error");
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
        showToast("Ocorreu um erro crítico ao carregar seus dados.", "error");
        handleLogoutState();
    }
}
function handleLogoutState() {
    state = { user: null, prayerTargets: [], archivedTargets: [], resolvedTargets: [], perseveranceData: { consecutiveDays: 0, recordDays: 0, lastInteractionDate: null }, weeklyPrayerData: { weekId: null, interactions: {} }, dailyTargets: { pending: [], completed: [], targetIds: [] }, pagination: { mainPanel: { currentPage: 1, targetsPerPage: 10 }, archivedPanel: { currentPage: 1, targetsPerPage: 10 }, resolvedPanel: { currentPage: 1, targetsPerPage: 10 }}, filters: { mainPanel: { searchTerm: '', showDeadlineOnly: false, showExpiredOnly: false, startDate: null, endDate: null }, archivedPanel: { searchTerm: '', startDate: null, endDate: null }, resolvedPanel: { searchTerm: '' }} };
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

    // UI Otimista
    const targetIndex = state.dailyTargets.pending.findIndex(t => t.id === targetId);
    if (targetIndex > -1) {
        const [movedTarget] = state.dailyTargets.pending.splice(targetIndex, 1);
        state.dailyTargets.completed.push(movedTarget);
    } else {
        state.dailyTargets.completed.push(targetToPray);
    }
    UI.renderDailyTargets(state.dailyTargets.pending, state.dailyTargets.completed);
    UI.renderPriorityTargets(state.prayerTargets, state.dailyTargets);
    
    // MELHORIA APLICADA: Feedback visual imediato e personalizado
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

        // MELHORIA APLICADA: Verifica se todos os alvos prioritários foram concluídos
        if (targetToPray.isPriority) {
            const priorityTargets = state.prayerTargets.filter(t => t.isPriority);
            const allPriorityPrayed = priorityTargets.every(p => 
                state.dailyTargets.completed.some(c => c.id === p.id)
            );

            if (allPriorityPrayed) {
                // Atraso para não sobrepor o toast de sucesso
                setTimeout(() => {
                    showToast("Parabéns! Você orou por todos os seus alvos prioritários de hoje!", "info");
                }, 500);
            }
        }
    } catch (error) {
        console.error("Erro ao processar 'Orei!':", error);
        showToast("Erro ao registrar oração. Desfazendo.", "error");
        // Reverte a UI
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

async function handleResolveTarget(target, panelId) {
    if (!confirm("Marcar como respondido?")) return;
    const index = state.prayerTargets.findIndex(t => t.id === target.id);
    if (index === -1) return;
    
    // UI Otimista
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

async function handleArchiveTarget(target, panelId) {
    if (!confirm("Arquivar este alvo?")) return;
    const index = state.prayerTargets.findIndex(t => t.id === target.id);
    if (index === -1) return;

    // UI Otimista
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

    // UI Otimista
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
    
    // UI Otimista
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

    // UI Otimista
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

    // UI Otimista
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
    
    // UI Otimista
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
    
    // UI Otimista
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
        if (user) { 
            loadDataForUser(user);
        } else { 
            handleLogoutState();
        }
    });

    // --- Listeners de Ações Gerais ---
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
    
    // --- Listeners da Seção Diária, Relatórios, Modais e Filtros ---
    document.getElementById('refreshDaily').addEventListener('click', async () => { if(confirm("Deseja gerar uma nova lista de alvos para hoje? A lista atual será substituída.")) { await Service.forceGenerateDailyTargets(state.user.uid, state.prayerTargets); await loadDataForUser(state.user); showToast("Nova lista gerada!", "success"); } });
    document.getElementById('copyDaily').addEventListener('click', () => { const text = state.dailyTargets.pending.map(t => `- ${t.title}`).join('\n'); navigator.clipboard.writeText(text); showToast("Alvos pendentes copiados!", "success"); });
    document.getElementById('viewDaily').addEventListener('click', () => { const allTargets = [...state.dailyTargets.pending, ...state.dailyTargets.completed]; const html = UI.generateViewHTML(allTargets, "Alvos do Dia"); const newWindow = window.open(); newWindow.document.write(html); newWindow.document.close(); });
    document.getElementById('addManualTargetButton').addEventListener('click', () => { UI.renderManualSearchResults([], state.prayerTargets); UI.toggleManualTargetModal(true); });
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
    document.getElementById('manualTargetSearchInput').addEventListener('input', e => { const searchTerm = e.target.value.toLowerCase(); const filtered = state.prayerTargets.filter(t => t.title.toLowerCase().includes(searchTerm) || (t.details && t.details.toLowerCase().includes(searchTerm))); UI.renderManualSearchResults(filtered, state.prayerTargets, searchTerm); });

    // --- DELEGAÇÃO DE EVENTOS CENTRALIZADA ---
    document.body.addEventListener('click', async e => {
        const { action, id, page, panel, obsIndex, subObsIndex } = e.target.dataset;
        if (!state.user && action) return;

        // Lógica de Paginação
        if (page && panel) {
            e.preventDefault();
            if (e.target.classList.contains('disabled')) return;
            state.pagination[panel].currentPage = parseInt(page);
            applyFiltersAndRender(panel);
            return;
        }
        
        // Função auxiliar para encontrar o alvo
        const findTargetInState = (targetId) => {
            let target = state.prayerTargets.find(t => t.id === targetId);
            if (target) return { target, isArchived: false, panelId: 'mainPanel' };
            target = state.archivedTargets.find(t => t.id === targetId);
            if (target) return { target, isArchived: true, panelId: 'archivedPanel' };
            target = state.resolvedTargets.find(t => t.id === targetId);
            if (target) return { target, isArchived: true, panelId: 'resolvedPanel' };
            return { target: null, isArchived: null, panelId: null };
        };
        
        if (!action || !id) {
            // Exceção para o botão de cancelar edição, que não precisa de ID
            if (action === 'cancel-edit') {
                const form = e.target.closest('.inline-edit-form-container');
                if (form) {
                    form.remove();
                }
            }
            return;
        }

        const { target, isArchived, panelId } = findTargetInState(id);
        if (!target && !['select-manual-target', 'cancel-edit'].includes(action)) return;

        // --- Switch de Ações ---
        switch(action) {
            case 'pray':
            case 'pray-priority':
                await handlePray(id);
                break;
            
            case 'resolve':
                await handleResolveTarget(target, panelId);
                break;

            case 'archive':
                await handleArchiveTarget(target, panelId);
                break;
            
            case 'delete-archived':
                await handleDeleteArchivedTarget(id);
                break;

            case 'toggle-observation':
                UI.toggleAddObservationForm(id);
                break;

            // ================================================================================================
            // ===== INÍCIO DA MODIFICAÇÃO: Lógica de edição refatorada e com melhorias de UX. =====
            // ================================================================================================
            case 'edit-title': {
                if (target) UI.toggleEditForm('Title', id, { currentValue: target.title, saveAction: 'save-title' });
                break;
            }

            case 'edit-details': {
                if (target) UI.toggleEditForm('Details', id, { currentValue: target.details, saveAction: 'save-details' });
                break;
            }

            case 'edit-observation': {
                if (target && target.observations[obsIndex]) {
                    UI.toggleEditForm('Observation', id, { 
                        currentValue: target.observations[obsIndex].text, 
                        obsIndex, 
                        saveAction: 'save-observation' 
                    });
                }
                break;
            }
            
            case 'edit-sub-target-title': {
                if (target && target.observations[obsIndex]) {
                    UI.toggleEditForm('SubTargetTitle', id, {
                        currentValue: target.observations[obsIndex].subTargetTitle,
                        obsIndex,
                        saveAction: 'save-sub-target-title'
                    });
                }
                break;
            }

            case 'edit-sub-target-details': {
                if (target && target.observations[obsIndex]) {
                    UI.toggleEditForm('SubTargetDetails', id, {
                        currentValue: target.observations[obsIndex].text,
                        obsIndex,
                        saveAction: 'save-sub-target-details'
                    });
                }
                break;
            }

            case 'edit-sub-observation': {
                const subObs = target?.observations[obsIndex]?.subObservations?.[subObsIndex];
                if (subObs) {
                    UI.toggleEditForm('SubObservation', id, {
                        currentValue: subObs.text,
                        obsIndex,
                        subObsIndex,
                        saveAction: 'save-sub-observation'
                    });
                }
                break;
            }

            case 'save-title': {
                const formContainer = e.target.closest('.inline-edit-form-container');
                const newTitle = formContainer?.querySelector('input')?.value.trim();
                if (!target || !newTitle) break;
                
                // Melhoria de UX: Feedback de salvamento
                const saveButton = e.target;
                saveButton.disabled = true;
                saveButton.textContent = 'Salvando...';

                const oldTitle = target.title;
                target.title = newTitle; // UI Otimista
                applyFiltersAndRender(panelId);
                
                try {
                    await Service.updateTargetField(state.user.uid, id, isArchived, { title: newTitle });
                    showToast("Título atualizado com sucesso!", "success");
                } catch (error) {
                    target.title = oldTitle; // Reverte em caso de erro
                    applyFiltersAndRender(panelId);
                    showToast("Falha ao atualizar o título.", "error");
                }
                break;
            }

            case 'save-details': {
                const formContainer = e.target.closest('.inline-edit-form-container');
                const newDetails = formContainer?.querySelector('textarea')?.value.trim();
                if (!target) break;
                
                // Melhoria de UX: Feedback de salvamento
                const saveButton = e.target;
                saveButton.disabled = true;
                saveButton.textContent = 'Salvando...';

                const oldDetails = target.details;
                target.details = newDetails; // UI Otimista
                applyFiltersAndRender(panelId);

                try {
                    await Service.updateTargetField(state.user.uid, id, isArchived, { details: newDetails });
                    showToast("Detalhes atualizados com sucesso!", "success");
                } catch (error) {
                    target.details = oldDetails; // Reverte
                    applyFiltersAndRender(panelId);
                    showToast("Falha ao atualizar os detalhes.", "error");
                }
                break;
            }
            
            case 'save-observation': {
                const formContainer = e.target.closest('.inline-edit-form-container');
                const newText = formContainer?.querySelector('textarea')?.value.trim();
                if (!target || newText === '') break;

                // Melhoria de UX: Feedback de salvamento
                const saveButton = e.target;
                saveButton.disabled = true;
                saveButton.textContent = 'Salvando...';

                const oldText = target.observations[obsIndex].text;
                target.observations[obsIndex].text = newText; // UI Otimista
                applyFiltersAndRender(panelId);
                
                try {
                    await Service.updateObservationInTarget(state.user.uid, id, isArchived, obsIndex, { text: newText });
                    showToast("Observação atualizada!", "success");
                } catch (error) {
                    target.observations[obsIndex].text = oldText; // Reverte
                    applyFiltersAndRender(panelId);
                    showToast("Falha ao atualizar a observação.", "error");
                }
                break;
            }

            case 'save-sub-target-title':
            case 'save-sub-target-details': {
                const formContainer = e.target.closest('.inline-edit-form-container');
                const input = formContainer?.querySelector('input, textarea');
                const newText = input ? input.value.trim() : '';
                if (!target || newText === '') break;
                
                // Melhoria de UX: Feedback de salvamento
                const saveButton = e.target;
                saveButton.disabled = true;
                saveButton.textContent = 'Salvando...';

                const obsToUpdate = target.observations[obsIndex];
                const isTitle = action === 'save-sub-target-title';
                const fieldToUpdate = isTitle ? 'subTargetTitle' : 'text';
                const oldText = obsToUpdate[fieldToUpdate];
                
                obsToUpdate[fieldToUpdate] = newText; // UI Otimista
                applyFiltersAndRender(panelId);

                try {
                    await Service.updateObservationInTarget(state.user.uid, id, isArchived, obsIndex, { [fieldToUpdate]: newText });
                    showToast("Sub-alvo atualizado!", "success");
                } catch (error) {
                    obsToUpdate[fieldToUpdate] = oldText; // Reverte
                    applyFiltersAndRender(panelId);
                    showToast("Falha ao atualizar sub-alvo.", "error");
                }
                break;
            }

            case 'save-sub-observation': {
                const formContainer = e.target.closest('.inline-edit-form-container');
                const newText = formContainer?.querySelector('textarea')?.value.trim();
                if (!target || newText === '') break;

                // Melhoria de UX: Feedback de salvamento
                const saveButton = e.target;
                saveButton.disabled = true;
                saveButton.textContent = 'Salvando...';

                const subObs = target.observations[obsIndex].subObservations[subObsIndex];
                const oldText = subObs.text;

                subObs.text = newText; // UI Otimista
                applyFiltersAndRender(panelId);

                try {
                    await Service.updateSubObservationInTarget(state.user.uid, id, isArchived, obsIndex, subObsIndex, { text: newText });
                    showToast("Observação do sub-alvo atualizada!", "success");
                } catch (error) {
                    subObs.text = oldText; // Reverte
                    applyFiltersAndRender(panelId);
                    showToast("Falha ao atualizar observação.", "error");
                }
                break;
            }
            // ================================================================================================
            // ===== FIM DA MODIFICAÇÃO =====
            // ================================================================================================

            case 'save-observation': // Este case agora é redundante devido ao acima, mas mantido para segurança.
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

            case 'download-target-pdf': { 
                if (!target) return;
                generateAndDownloadPdf(target);
                showToast(`Gerando PDF para "${target.title}"...`, 'success');
                break;
            }
            
            case 'select-manual-target':
                try {
                    await Service.addManualTargetToDailyList(state.user.uid, id);
                    UI.toggleManualTargetModal(false);
                    await loadDataForUser(state.user);
                    showToast("Alvo adicionado à lista do dia!", "success");
                } catch (error) {
                    console.error(error);
                    showToast(error.message, "error");
                }
                break;

            case 'promote-observation': {
                if (!confirm("Deseja promover esta observação a um sub-alvo?")) return;

                const obs = target.observations[parseInt(obsIndex)];
                const newTitle = prompt("Qual será o título deste novo sub-alvo?", obs.text.substring(0, 50));
                if (!newTitle || newTitle.trim() === '') {
                    showToast("A promoção foi cancelada pois o título é inválido.", "info");
                    return;
                }

                const updatedObservationData = {
                    isSubTarget: true,
                    subTargetTitle: newTitle.trim(),
                    subTargetStatus: 'active',
                    interactionCount: 0,
                    subObservations: []
                };

                const originalObservation = { ...target.observations[parseInt(obsIndex)] };
                Object.assign(target.observations[parseInt(obsIndex)], updatedObservationData);
                applyFiltersAndRender(panelId);

                try {
                    await Service.updateObservationInTarget(state.user.uid, id, isArchived, parseInt(obsIndex), updatedObservationData);
                    showToast("Observação promovida a sub-alvo com sucesso!", "success");
                } catch (error) {
                    console.error("Erro ao promover observação:", error);
                    showToast("Falha ao salvar. A alteração foi desfeita.", "error");
                    target.observations[parseInt(obsIndex)] = originalObservation;
                    applyFiltersAndRender(panelId);
                }
                break;
            }
            
            case 'pray-sub-target': {
                try {
                    // UI Otimista: desabilita o botão imediatamente
                    e.target.disabled = true;
                    e.target.textContent = '✓ Orado!';
                    e.target.classList.add('prayed');
                    
                    const subTargetId = `${id}_${obsIndex}`;
                    
                    // Atualiza o estado localmente para refletir a oração
                    const { target: parentTarget } = findTargetInState(id);
                    if (parentTarget) {
                        state.dailyTargets.completed.push({ targetId: subTargetId, isSubTarget: true });
                    }
                    
                    // Chama os serviços de back-end
                    await Service.recordInteractionForSubTarget(state.user.uid, subTargetId);
                    const { isNewRecord } = await Service.recordUserInteraction(state.user.uid, state.perseveranceData, state.weeklyPrayerData);
                    
                    // Recarrega os dados de perseverança para manter a UI sincronizada
                    const [perseveranceData, weeklyData] = await Promise.all([
                        Service.loadPerseveranceData(state.user.uid),
                        Service.loadWeeklyPrayerData(state.user.uid)
                    ]);
                    state.perseveranceData = perseveranceData;
                    state.weeklyPrayerData = weeklyData;
                    UI.updatePerseveranceUI(state.perseveranceData, isNewRecord);
                    UI.updateWeeklyChart(state.weeklyPrayerData);

                    showToast("Interação com sub-alvo registrada!", "success");

                } catch (error) {
                    console.error("Erro ao registrar interação com sub-alvo:", error);
                    showToast("Falha ao registrar interação. Tente novamente.", "error");
                    // Reverte a UI em caso de erro
                    e.target.disabled = false;
                    e.target.textContent = 'Orei!';
                    e.target.classList.remove('prayed');
                }
                break;
            }

            case 'demote-sub-target': {
                if (e.target.disabled) return;
                if (!confirm("Tem certeza que deseja reverter este sub-alvo para uma observação comum?")) return;

                const originalSubTarget = { ...target.observations[parseInt(obsIndex)] };
                const updatedObservation = { ...originalSubTarget, isSubTarget: false };
                delete updatedObservation.subTargetTitle;
                delete updatedObservation.subTargetStatus;
                delete updatedObservation.interactionCount;
                delete updatedObservation.subObservations;
                
                target.observations[parseInt(obsIndex)] = updatedObservation;
                applyFiltersAndRender(panelId);

                try {
                    await Service.updateObservationInTarget(state.user.uid, id, isArchived, parseInt(obsIndex), updatedObservation);
                    showToast("Sub-alvo revertido para observação.", "info");
                } catch (error) {
                    showToast("Erro ao reverter. A alteração foi desfeita.", "error");
                    target.observations[parseInt(obsIndex)] = originalSubTarget;
                    applyFiltersAndRender(panelId);
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
                    showToast("Sub-alvo marcado como respondido!", "success");
                } catch (error) {
                    showToast("Erro ao salvar. A alteração foi desfeita.", "error");
                    target.observations[parseInt(obsIndex)] = originalSubTarget;
                    applyFiltersAndRender(panelId);
                }
                break;
            }

            case 'add-sub-observation': {
                const text = prompt("Digite a nova observação para este sub-alvo:");
                if (!text || text.trim() === '') return;

                const newSubObservation = { text: text.trim(), date: new Date() };

                const subTarget = target.observations[parseInt(obsIndex)];
                if (!Array.isArray(subTarget.subObservations)) {
                    subTarget.subObservations = [];
                }
                subTarget.subObservations.push(newSubObservation);
                applyFiltersAndRender(panelId);

                try {
                    await Service.addSubObservationToTarget(state.user.uid, id, isArchived, parseInt(obsIndex), newSubObservation);
                    showToast("Observação adicionada ao sub-alvo.", "success");
                } catch (error) {
                    showToast("Erro ao salvar. A alteração foi desfeita.", "error");
                    subTarget.subObservations.pop();
                    applyFiltersAndRender(panelId);
                }
                break;
            }
        }
    });

    initializeFloatingNav(state);
});
