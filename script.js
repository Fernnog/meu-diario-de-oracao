// script.js (Orquestrador Principal da Aplicação - Versão Aprimorada)
// ARQUITETURA REVISADA: Inclui edição inline e handlers de ação refatorados.

// --- MÓDULOS ---
import { auth } from './firebase-config.js'; 
import { onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import * as Service from './firestore-service.js';
import * as UI from './ui.js';
import { initializeFloatingNav, updateFloatingNavVisibility } from './floating-nav.js';
import { formatDateForDisplay, generateAndDownloadPdf } from './utils.js';

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
        setTimeout(() => { document.body.removeChild(toast); }, 300);
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
// === MELHORIA ARQUITETURAL: Handlers de Ação Dedicados ===
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

        if (targetToPray.isPriority) {
            const priorityTargets = state.prayerTargets.filter(t => t.isPriority);
            const allPriorityPrayed = priorityTargets.every(p => state.dailyTargets.completed.some(c => c.id === p.id));
            if (allPriorityPrayed) {
                setTimeout(() => showToast("Parabéns! Você orou por todos os seus alvos prioritários de hoje!", "info"), 500);
            }
        }
    } catch (error) {
        console.error("Erro ao processar 'Orei!':", error);
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

async function handleTargetAction(action, target, isArchived, panelId, obsIndex, subObsIndex, event) {
    const targetId = target.id;
    switch (action) {
        case 'resolve':
            if (!confirm("Marcar como respondido?")) return;
            const resolveIndex = state.prayerTargets.findIndex(t => t.id === targetId);
            if (resolveIndex === -1) return;
            const [targetToResolve] = state.prayerTargets.splice(resolveIndex, 1);
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
                state.prayerTargets.splice(resolveIndex, 0, targetToResolve);
                applyFiltersAndRender('mainPanel');
                applyFiltersAndRender('resolvedPanel');
            }
            break;

        case 'archive':
            if (!confirm("Arquivar este alvo?")) return;
            const archiveIndex = state.prayerTargets.findIndex(t => t.id === targetId);
            if (archiveIndex === -1) return;
            const [targetToArchive] = state.prayerTargets.splice(archiveIndex, 1);
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
                state.prayerTargets.splice(archiveIndex, 0, targetToArchive);
                applyFiltersAndRender('mainPanel');
                applyFiltersAndRender('archivedPanel');
            }
            break;

        case 'delete-archived':
            if (!confirm("EXCLUIR PERMANENTEMENTE? Esta ação não pode ser desfeita.")) return;
            const deleteIndex = state.archivedTargets.findIndex(t => t.id === targetId);
            if (deleteIndex === -1) return;
            const [deletedTarget] = state.archivedTargets.splice(deleteIndex, 1);
            applyFiltersAndRender('archivedPanel');
            try {
                await Service.deleteArchivedTarget(state.user.uid, targetId);
                showToast("Alvo excluído permanentemente.", "info");
            } catch (error) {
                showToast("Erro ao sincronizar. O item será restaurado.", "error");
                state.archivedTargets.splice(deleteIndex, 0, deletedTarget);
                applyFiltersAndRender('archivedPanel');
            }
            break;
    }
}

async function handleFieldUpdateAction(action, target, isArchived, panelId, event) {
    const targetId = target.id;
    let oldData = {};
    let newData = {};

    switch (action) {
        case 'save-title':
            const newTitle = document.getElementById(`input-editTitleForm-${targetId}`).value.trim();
            if (!newTitle) return;
            oldData = { title: target.title };
            newData = { title: newTitle };
            target.title = newTitle;
            break;
        case 'save-details':
            const newDetails = document.getElementById(`input-editDetailsForm-${targetId}`).value.trim();
            oldData = { details: target.details };
            newData = { details: newDetails };
            target.details = newDetails;
            break;
        case 'save-deadline':
            const newDeadlineStr = document.getElementById(`deadlineInput-${targetId}`).value;
            if (!newDeadlineStr) return showToast("Selecione a nova data de prazo.", "error");
            const newDeadlineDate = new Date(newDeadlineStr + 'T12:00:00Z');
            oldData = { deadlineDate: target.deadlineDate, hasDeadline: target.hasDeadline };
            newData = { hasDeadline: true, deadlineDate: newDeadlineDate };
            target.deadlineDate = newDeadlineDate;
            target.hasDeadline = true;
            UI.toggleEditDeadlineForm(target.id, null);
            break;
        case 'remove-deadline':
            if (!confirm("Tem certeza que deseja remover o prazo deste alvo?")) return;
            oldData = { deadlineDate: target.deadlineDate, hasDeadline: target.hasDeadline };
            newData = { hasDeadline: false, deadlineDate: null };
            target.deadlineDate = null;
            target.hasDeadline = false;
            UI.toggleEditDeadlineForm(target.id, null);
            break;
        case 'save-category':
            const newCategory = document.getElementById(`categorySelect-${targetId}`).value;
            oldData = { category: target.category };
            newData = { category: newCategory };
            target.category = newCategory;
            UI.toggleEditCategoryForm(target.id);
            break;
        case 'toggle-priority':
            const newStatus = !target.isPriority;
            oldData = { isPriority: target.isPriority };
            newData = { isPriority: newStatus };
            target.isPriority = newStatus;
            UI.renderPriorityTargets(state.prayerTargets, state.dailyTargets);
            break;
    }

    applyFiltersAndRender(panelId);
    try {
        await Service.updateTargetField(state.user.uid, targetId, isArchived, newData);
        showToast("Alvo atualizado com sucesso!", "success");
    } catch (error) {
        showToast("Falha ao salvar. A alteração foi desfeita.", "error");
        Object.assign(target, oldData); // Reverte para os dados antigos
        applyFiltersAndRender(panelId);
        if (action === 'toggle-priority') UI.renderPriorityTargets(state.prayerTargets, state.dailyTargets);
    }
}

async function handleObservationAction(action, target, isArchived, panelId, obsIndex, subObsIndex, event) {
    const targetId = target.id;
    const obs = target.observations[obsIndex];
    let originalData, updatedData, subObs, newText;

    switch(action) {
        case 'save-observation': // Adiciona uma nova observação
            const text = document.getElementById(`observationText-${targetId}`).value.trim();
            const dateStr = document.getElementById(`observationDate-${targetId}`).value;
            if (!text || !dateStr) return showToast("Preencha o texto e a data.", "error");
            const newObservation = { text, date: new Date(dateStr + 'T12:00:00Z'), isSubTarget: false };
            if (!target.observations) target.observations = [];
            target.observations.push(newObservation);
            UI.toggleAddObservationForm(targetId);
            applyFiltersAndRender(panelId);
            try {
                await Service.addObservationToTarget(state.user.uid, targetId, isArchived, newObservation);
                showToast("Observação adicionada.", "success");
            } catch(error) {
                showToast("Falha ao salvar. A alteração será desfeita.", "error");
                target.observations.pop();
                applyFiltersAndRender(panelId);
            }
            break;
        
        case 'save-observation-edit': // Edita uma observação existente
            newText = document.getElementById(`input-editObservationForm-${targetId}-${obsIndex}`).value.trim();
            if (!newText) return;
            originalData = { text: obs.text };
            updatedData = { text: newText };
            obs.text = newText;
            applyFiltersAndRender(panelId);
            try {
                await Service.updateObservationInTarget(state.user.uid, targetId, isArchived, obsIndex, updatedData);
                showToast("Observação atualizada.", "success");
            } catch (error) {
                obs.text = originalData.text;
                applyFiltersAndRender(panelId);
                showToast("Falha ao atualizar observação.", "error");
            }
            break;

        case 'save-sub-target-title':
            newText = document.getElementById(`input-editSubTargetTitleForm-${targetId}-${obsIndex}`).value.trim();
            if (!newText) return;
            originalData = { subTargetTitle: obs.subTargetTitle };
            updatedData = { subTargetTitle: newText };
            obs.subTargetTitle = newText;
            applyFiltersAndRender(panelId);
            try {
                await Service.updateObservationInTarget(state.user.uid, targetId, isArchived, obsIndex, updatedData);
                showToast("Título do sub-alvo atualizado.", "success");
            } catch (error) {
                obs.subTargetTitle = originalData.subTargetTitle;
                applyFiltersAndRender(panelId);
                showToast("Falha ao atualizar título do sub-alvo.", "error");
            }
            break;

        case 'save-sub-observation':
            subObs = obs.subObservations[subObsIndex];
            newText = document.getElementById(`input-editSubObservationForm-${targetId}-${obsIndex}-${subObsIndex}`).value.trim();
            if (!newText) return;
            originalData = { text: subObs.text };
            updatedData = { text: newText };
            subObs.text = newText;
            applyFiltersAndRender(panelId);
            try {
                await Service.updateSubObservationToTarget(state.user.uid, targetId, isArchived, obsIndex, subObsIndex, updatedData);
                showToast("Observação do sub-alvo atualizada.", "success");
            } catch (error) {
                subObs.text = originalData.text;
                applyFiltersAndRender(panelId);
                showToast("Falha ao atualizar observação do sub-alvo.", "error");
            }
            break;
        
        case 'promote-observation':
             if (!confirm("Deseja promover esta observação a um sub-alvo?")) return;
             const newTitle = prompt("Qual será o título deste novo sub-alvo?", obs.text.substring(0, 50));
             if (!newTitle || newTitle.trim() === '') return showToast("A promoção foi cancelada.", "info");
             
             originalData = { ...obs };
             updatedData = { isSubTarget: true, subTargetTitle: newTitle.trim(), subTargetStatus: 'active', interactionCount: 0, subObservations: [] };
             Object.assign(obs, updatedData);
             applyFiltersAndRender(panelId);
             try {
                 await Service.updateObservationInTarget(state.user.uid, targetId, isArchived, obsIndex, updatedData);
                 showToast("Observação promovida a sub-alvo!", "success");
             } catch (error) {
                 target.observations[obsIndex] = originalData;
                 applyFiltersAndRender(panelId);
                 showToast("Falha ao promover. A alteração foi desfeita.", "error");
             }
             break;
        // ... outros cases de observação como pray-sub-target, demote, etc.
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
    
    // --- Listeners de Seção Diária, Relatórios, etc. ---
    document.getElementById('refreshDaily').addEventListener('click', async () => { if(confirm("Deseja gerar uma nova lista de alvos para hoje? A lista atual será substituída.")) { await Service.forceGenerateDailyTargets(state.user.uid, state.prayerTargets); await loadDataForUser(state.user); showToast("Nova lista gerada!", "success"); } });
    document.getElementById('copyDaily').addEventListener('click', () => { const text = state.dailyTargets.pending.map(t => `- ${t.title}`).join('\n'); navigator.clipboard.writeText(text); showToast("Alvos pendentes copiados!", "success"); });
    document.getElementById('viewDaily').addEventListener('click', () => { const allTargets = [...state.dailyTargets.pending, ...state.dailyTargets.completed]; const html = UI.generateViewHTML(allTargets, "Alvos do Dia"); const newWindow = window.open(); newWindow.document.write(html); newWindow.document.close(); });
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

    // --- DELEGAÇÃO DE EVENTOS CENTRALIZADA E REATORADA ---
    document.body.addEventListener('click', async e => {
        const { action, id, page, panel, obsIndex, subObsIndex } = e.target.dataset;
        if (!state.user && action) return;

        if (page && panel) {
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
            target = state.resolvedTargets.find(t => t.id === targetId);
            if (target) return { target, isArchived: true, panelId: 'resolvedPanel' };
            return { target: null, isArchived: null, panelId: null };
        };
        
        if (!action || !id && !['cancel-edit'].includes(action)) return;

        const { target, isArchived, panelId } = findTargetInState(id);
        if (!target && !['select-manual-target', 'cancel-edit'].includes(action)) return;

        // Roteamento para os handlers refatorados
        const lifecycleActions = ['resolve', 'archive', 'delete-archived'];
        const fieldUpdateActions = ['save-title', 'save-details', 'save-deadline', 'remove-deadline', 'save-category', 'toggle-priority'];
        const observationActions = ['save-observation', 'save-observation-edit', 'save-sub-target-title', 'save-sub-observation', 'promote-observation'];

        if (action === 'pray' || action === 'pray-priority') {
            await handlePray(id);
        } else if (lifecycleActions.includes(action)) {
            await handleTargetAction(action, target, isArchived, panelId, obsIndex, subObsIndex, e);
        } else if (fieldUpdateActions.includes(action)) {
            await handleFieldUpdateAction(action, target, isArchived, panelId, e);
        } else if (observationActions.includes(action)) {
            await handleObservationAction(action, target, isArchived, panelId, obsIndex, subObsIndex, e);
        } else if (action === 'cancel-edit') {
            const form = e.target.closest('.inline-edit-form');
            if (form) {
                form.style.display = 'none';
                form.innerHTML = '';
            }
        } else if (action.startsWith('edit-')) {
            switch(action) {
                case 'edit-title': UI.toggleEditForm('Title', id, { currentValue: target.title }); break;
                case 'edit-details': UI.toggleEditForm('Details', id, { currentValue: target.details }); break;
                case 'edit-observation': UI.toggleEditForm('Observation', id, { currentValue: target.observations[obsIndex].text, obsIndex }); break;
                case 'edit-sub-target-title': UI.toggleEditForm('SubTargetTitle', id, { currentValue: target.observations[obsIndex].subTargetTitle, obsIndex }); break;
                case 'edit-sub-observation': UI.toggleEditForm('SubObservation', id, { currentValue: target.observations[obsIndex].subObservations[subObsIndex].text, obsIndex, subObsIndex }); break;
                case 'edit-deadline': UI.toggleEditDeadlineForm(id, target?.deadlineDate); break;
                case 'edit-category': UI.toggleEditCategoryForm(id, target?.category); break;
            }
        } else if (action === 'toggle-observation') {
             UI.toggleAddObservationForm(id);
        } else if (action === 'download-target-pdf') {
            generateAndDownloadPdf(target);
            showToast(`Gerando PDF para "${target.title}"...`, 'success');
        } else if (action === 'select-manual-target') {
            try {
                await Service.addManualTargetToDailyList(state.user.uid, id);
                UI.toggleManualTargetModal(false);
                await loadDataForUser(state.user);
                showToast("Alvo adicionado à lista do dia!", "success");
            } catch (error) {
                console.error(error);
                showToast(error.message, "error");
            }
        }
    });

    initializeFloatingNav(state);
});
