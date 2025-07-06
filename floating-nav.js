// Em script.js, dentro da função loadDataForUser(user)
// ... (após as chamadas de UI.renderDailyTargets e UI.renderPriorityTargets)

UI.renderDailyTargets(state.dailyTargets.pending, state.dailyTargets.completed);
UI.renderPriorityTargets(state.prayerTargets, state.dailyTargets);

// ... outras chamadas ...

// ATUALIZAÇÃO NECESSÁRIA:
// Informa ao navegador flutuante sobre os novos alvos no DOM.
updateTargetAnchors();

// Atualiza a visibilidade do navegador flutuante com base no novo estado
updateFloatingNavVisibility(state);