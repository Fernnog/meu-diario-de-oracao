// --- START OF FILE script.js ---

import { auth } from './firebase-config.js';
import { Timestamp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import * as Utils from './utils.js';
import * as State from './state.js';
import * as Auth from './auth.js';
import * as Service from './firestore-service.js';
import * as UI from './ui.js';

// --- MAIN APPLICATION FLOW ---

async function loadData(user) {
    if (user) {
        console.log(`[App] User ${user.uid} authenticated. Loading data...`);
        UI.showPanel('dailySection');

        try {
            // Fetch data from Firestore
            const [prayerTargets, archivedTargets, perseveranceData, weeklyData] = await Promise.all([
                Service.fetchPrayerTargets(user.uid),
                Service.fetchArchivedTargets(user.uid),
                Service.loadPerseveranceData(user.uid),
                Service.loadWeeklyPrayerData(user.uid)
            ]);

            // Update local state
            State.setPrayerTargets(prayerTargets);
            State.setArchivedTargets(archivedTargets);
            State.setResolvedTargets(archivedTargets.filter(t => t.resolved));
            State.setPerseveranceData(perseveranceData);
            State.setPreviousRecordDays(perseveranceData.recordDays);
            State.setWeeklyPrayerData(weeklyData);

            // Initial Render
            UI.renderTargets();
            UI.renderArchivedTargets();
            UI.renderResolvedTargets();
            UI.updatePerseveranceUI();
            UI.updateWeeklyChart();
            
            // Load daily targets (depends on main targets being loaded first)
            await loadDailyTargets(user.uid);

        } catch (error) {
            console.error("[App] Error during data loading process:", error);
            alert("Ocorreu um erro ao carregar seus dados. Por favor, recarregue a página.");
            handleLogoutState();
        }
    } else {
        console.log("[App] No user authenticated. Clearing UI.");
        handleLogoutState();
    }
}

function handleLogoutState() {
    UI.showPanel('appContent'); // Or hide everything and just show auth form
    document.getElementById('appContent').style.display = 'none';
    document.getElementById('dailySection').style.display = 'none';
    // Clear all state and UI elements
    State.setPrayerTargets([]);
    State.setArchivedTargets([]);
    State.setResolvedTargets([]);
    UI.renderTargets();
    UI.renderArchivedTargets();
    UI.renderResolvedTargets();
    UI.resetPerseveranceUI();
    document.getElementById("dailyTargets").innerHTML = "<p>Faça login para ver os alvos diários.</p>";
}

async function loadDailyTargets(userId) {
    const dailyTargetsDiv = document.getElementById("dailyTargets");
    dailyTargetsDiv.innerHTML = '<p>Carregando alvos do dia...</p>';
    try {
        const todayStr = Utils.formatDateToISO(new Date());
        const dailyData = await Service.getOrCreateDailyDoc(userId, todayStr);
        UI.renderDailyTargetsUI(dailyData);
    } catch (error) {
        console.error("[App] Error loading daily targets:", error);
        dailyTargetsDiv.innerHTML = "<p>Erro ao carregar alvos diários.</p>";
    }
}


// --- EVENT HANDLERS & ACTIONS (Connects UI to Service/State) ---

async function handleAddPrayerTarget(e) {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) { alert("Você precisa estar logado."); return; }
    
    // Get form data...
    const title = document.getElementById("title").value.trim();
    const details = document.getElementById("details").value.trim();
    const dateInput = document.getElementById("date").value;
    const hasDeadline = document.getElementById("hasDeadline").checked;
    const deadlineDateInput = document.getElementById("deadlineDate").value;
    const category = document.getElementById("categorySelect").value;

    if (!title || !dateInput) { alert("Título e Data Criação são obrigatórios."); return; }

    const dateLocal = new Date(dateInput + 'T00:00:00');
    let deadlineDateLocal = null;
    if (hasDeadline) {
        if (!deadlineDateInput) { alert("Selecione o Prazo de Validade."); return; }
        deadlineDateLocal = new Date(deadlineDateInput + 'T00:00:00');
        // Add more validation as needed...
    }

    const targetData = {
        title, details, category: category || null,
        date: Timestamp.fromDate(dateLocal),
        hasDeadline,
        deadlineDate: deadlineDateLocal ? Timestamp.fromDate(deadlineDateLocal) : null,
        archived: false, resolved: false, resolutionDate: null,
        observations: [], userId: user.uid, lastPrayedDate: null
    };

    try {
        const docRef = await Service.saveNewPrayerTarget(targetData);
        const newLocalTarget = Utils.rehydrateTargets([{ ...targetData, id: docRef.id }])[0];
        State.prayerTargets.unshift(newLocalTarget);
        
        document.getElementById("prayerForm").reset();
        UI.showPanel('mainPanel');
        State.setCurrentPage(1);
        UI.renderTargets();
        alert('Alvo de oração adicionado com sucesso!');
    } catch (error) {
        console.error("Error adding prayer target: ", error);
        alert("Erro ao adicionar alvo: " + error.message);
    }
}

async function handleOreiClick(targetId) {
    const user = auth.currentUser;
    if (!user) return;
    try {
        const { newPerseveranceData, newWeeklyData, newRecordAchieved } = await Service.processOreiClick(user.uid, targetId);
        
        // Update local state
        State.setPerseveranceData(newPerseveranceData);
        State.setWeeklyPrayerData(newWeeklyData);
        const targetIndex = State.prayerTargets.findIndex(t => t.id === targetId);
        if (targetIndex !== -1) {
            State.prayerTargets[targetIndex].lastPrayedDate = new Date();
        }

        // Update UI
        UI.updatePerseveranceUI(newRecordAchieved);
        UI.updateWeeklyChart();
        await loadDailyTargets(user.uid); // Reload daily list to show completion

    } catch (error) {
        console.error("Error on 'Orei!' click:", error);
        alert("Erro ao registrar oração: " + error.message);
        // Re-enable button if needed
        const button = document.querySelector(`.pray-button[data-target-id="${targetId}"]`);
        if (button) {
            button.disabled = false;
            button.textContent = "Orei!";
        }
    }
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("[App] DOM fully loaded. Initializing...");

    // Initialize Auth and link it to the main data loading function
    Auth.initializeAuth(loadData);

    // Setup Event Listeners
    document.getElementById('btnEmailSignUp')?.addEventListener('click', Auth.signUpWithEmailPassword);
    document.getElementById('btnEmailSignIn')?.addEventListener('click', Auth.signInWithEmailPassword);
    document.getElementById('btnForgotPassword')?.addEventListener('click', Auth.resetPassword);
    document.getElementById('btnLogout')?.addEventListener('click', Auth.handleSignOut);

    document.getElementById('prayerForm').addEventListener('submit', handleAddPrayerTarget);
    
    // Navigation buttons
    document.getElementById('backToMainButton')?.addEventListener('click', () => UI.showPanel('dailySection'));
    document.getElementById('addNewTargetButton')?.addEventListener('click', () => UI.showPanel('appContent'));
    document.getElementById('viewAllTargetsButton')?.addEventListener('click', () => { UI.showPanel('mainPanel'); State.setCurrentPage(1); UI.renderTargets(); });
    document.getElementById("viewArchivedButton")?.addEventListener("click", () => { UI.showPanel('archivedPanel'); State.setCurrentArchivedPage(1); UI.renderArchivedTargets(); });
    document.getElementById("viewResolvedButton")?.addEventListener("click", () => { UI.showPanel('resolvedPanel'); State.setCurrentResolvedPage(1); UI.renderResolvedTargets(); });
    
    // Search and filter listeners
    document.getElementById('searchMain')?.addEventListener('input', (e) => { State.setCurrentSearchTermMain(e.target.value); State.setCurrentPage(1); UI.renderTargets(); });
    document.getElementById('searchArchived')?.addEventListener('input', (e) => { State.setCurrentSearchTermArchived(e.target.value); State.setCurrentArchivedPage(1); UI.renderArchivedTargets(); });
    document.getElementById('searchResolved')?.addEventListener('input', (e) => { State.setCurrentSearchTermResolved(e.target.value); State.setCurrentResolvedPage(1); UI.renderResolvedTargets(); });
    document.getElementById('showDeadlineOnly')?.addEventListener('change', (e) => { State.setShowDeadlineOnly(e.target.checked); State.setCurrentPage(1); UI.renderTargets(); });
    document.getElementById('showExpiredOnlyMain')?.addEventListener('change', () => { State.setCurrentPage(1); UI.renderTargets(); });
    
    // Daily section buttons
    document.getElementById("refreshDaily")?.addEventListener("click", async () => {
        const user = auth.currentUser;
        if (user && confirm("Gerar nova lista de alvos para hoje?")) {
            await Service.refreshDailyTargets(user.uid, Utils.formatDateToISO(new Date()));
            await loadDailyTargets(user.uid);
        }
    });

    // ... other event listeners for modals, etc.
});

// Expose necessary functions to the global scope for onclick attributes
// This is a bridge between the old HTML and the new modular JS
window.App = {
    handleOreiClick,
    // Add other functions that are called by `onclick` in dynamically generated HTML
    toggleAddObservation: UI.toggleAddObservation,
    editCategory: UI.editCategory,
    cancelEditCategory: UI.cancelEditCategory,
    editDeadline: UI.editDeadline,
    cancelEditDeadline: UI.cancelEditDeadline,

    saveObservation: async (targetId) => { /* logic to get data from form, call service, update state, and re-render */ },
    saveEditedDeadline: async (targetId) => { /* ... */ },
    saveEditedCategory: async (targetId) => { /* ... */ },
    markAsResolved: async (targetId) => { /* ... */ },
    archiveTarget: async (targetId) => { /* ... */ },
    deleteArchivedTarget: async (targetId) => { /* ... */ },
};

// You would need to fully implement the logic for the functions above,
// similar to how handleAddPrayerTarget is implemented:
// 1. Get data from UI
// 2. Call the appropriate Service function
// 3. Update the local State
// 4. Call the appropriate UI render function