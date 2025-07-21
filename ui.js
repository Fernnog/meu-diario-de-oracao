// MODIFICAÇÃO: Função handlePray atualizada com feedback visual (showToast)
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

    // EXIBE O TOAST DE SUCESSO IMEDIATAMENTE
    showToast("Oração registrada!", "success");

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

        // VERIFICA SE TODOS OS PRIORITÁRIOS FORAM CONCLUÍDOS
        // Adicionado para a notificação especial de conclusão dos prioritários
        if (targetToPray.isPriority) {
            const priorityTargets = state.prayerTargets.filter(t => t.isPriority);
            const allPriorityPrayed = priorityTargets.every(p => 
                state.dailyTargets.completed.some(c => c.id === p.id)
            );

            if (allPriorityPrayed) {
                // Atraso de 500ms para não sobrepor o toast anterior
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