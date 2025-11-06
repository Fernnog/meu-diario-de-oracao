// --- START OF FILE action-handler.js ---
// Responsabilidade: Centralizar a lógica de negócio para todas as ações do usuário
// que ocorrem nos painéis de alvos. Este módulo é chamado pelo orquestrador (script.js).

import * as Service from './firestore-service.js';
import * as UI from './ui.js';
import { generateAndDownloadPdf } from './utils.js';

/**
 * Função auxiliar interna para encontrar o alvo em qualquer lista do estado da aplicação.
 * @param {object} state - O objeto de estado global da aplicação.
 * @param {string} targetId - O ID do alvo a ser encontrado.
 * @returns {{target: object|null, isArchived: boolean|null, panelId: string|null}}
 */
function findTargetInState(state, targetId) {
    let target = state.prayerTargets.find(t => t.id === targetId);
    if (target) return { target, isArchived: false, panelId: 'mainPanel' };

    target = state.archivedTargets.find(t => t.id === targetId);
    if (target) return { target, isArchived: true, panelId: 'archivedPanel' };

    target = state.resolvedTargets.find(t => t.id === targetId);
    if (target) return { target, isArchived: true, panelId: 'resolvedPanel' };

    return { target: null, isArchived: null, panelId: null };
}

/**
 * Processa uma ação do usuário, manipula o estado e interage com os serviços.
 * @param {object} options - Um objeto contendo os detalhes da ação.
 * @param {string} options.action - O nome da ação (ex: 'resolve', 'archive').
 * @param {string} options.id - O ID do alvo relacionado à ação.
 * @param {HTMLElement} options.eventTarget - O elemento que disparou o evento.
 * @param {object} options.state - O objeto de estado completo da aplicação.
 * @param {Function} options.applyFiltersAndRender - A função para re-renderizar painéis.
 * @param {Function} options.requestSync - A função para solicitar a sincronização com o Drive.
 */
export async function handleAction(options) {
    const { action, id, eventTarget, state, applyFiltersAndRender, requestSync } = options;
    const { obsIndex, subObsIndex } = eventTarget.dataset;

    if (!state.user) {
        UI.showToast("Sessão expirada. Faça login novamente.", "error");
        return;
    }

    if (action === 'cancel-edit') {
        const form = eventTarget.closest('.inline-edit-form');
        if (form) form.remove();
        return;
    }
    
    const { target, isArchived, panelId } = findTargetInState(state, id);
    if (!target && !['select-manual-target', 'add-new-observation'].includes(action)) {
        console.warn(`Ação '${action}' não encontrou alvo com ID '${id}'.`);
        return;
    }

    switch (action) {
        case 'resolve':
            if (!confirm("Marcar como respondido?")) return;
            const index = state.prayerTargets.findIndex(t => t.id === target.id);
            if (index === -1) return;
            
            const [targetToResolve] = state.prayerTargets.splice(index, 1);
            targetToResolve.resolved = true;
            targetToResolve.resolutionDate = new Date();
            state.resolvedTargets.unshift(targetToResolve);
            applyFiltersAndRender('mainPanel');
            applyFiltersAndRender('resolvedPanel');

            try {
                await Service.markAsResolved(state.user.uid, targetToResolve);
                UI.showToast("Alvo marcado como respondido!", "success");
                requestSync(target.id);
            } catch (error) {
                UI.showToast("Erro ao salvar. Desfazendo.", "error");
                state.resolvedTargets.shift();
                state.prayerTargets.splice(index, 0, targetToResolve);
                applyFiltersAndRender('mainPanel');
                applyFiltersAndRender('resolvedPanel');
            }
            break;

        case 'archive':
            if (!confirm("Arquivar este alvo?")) return;
            const archiveIndex = state.prayerTargets.findIndex(t => t.id === target.id);
            if (archiveIndex === -1) return;

            const [targetToArchive] = state.prayerTargets.splice(archiveIndex, 1);
            targetToArchive.archived = true;
            targetToArchive.archivedDate = new Date();
            state.archivedTargets.unshift(targetToArchive);
            applyFiltersAndRender('mainPanel');
            applyFiltersAndRender('archivedPanel');

            try {
                await Service.archiveTarget(state.user.uid, targetToArchive);
                UI.showToast("Alvo arquivado.", "info");
                requestSync(target.id);
            } catch (error) {
                UI.showToast("Erro ao salvar. Desfazendo.", "error");
                state.archivedTargets.shift();
                state.prayerTargets.splice(archiveIndex, 0, targetToArchive);
                applyFiltersAndRender('mainPanel');
                applyFiltersAndRender('archivedPanel');
            }
            break;

        case 'delete-archived':
            if (!confirm("EXCLUIR PERMANENTEMENTE? Esta ação não pode ser desfeita.")) return;
            const deleteIndex = state.archivedTargets.findIndex(t => t.id === id);
            if (deleteIndex === -1) return;

            const [deletedTarget] = state.archivedTargets.splice(deleteIndex, 1);
            applyFiltersAndRender('archivedPanel');

            try {
                await Service.deleteArchivedTarget(state.user.uid, id);
                UI.showToast("Alvo excluído permanentemente.", "info");
            } catch (error) {
                UI.showToast("Erro ao excluir. O item foi restaurado.", "error");
                state.archivedTargets.splice(deleteIndex, 0, deletedTarget);
                applyFiltersAndRender('archivedPanel');
            }
            break;

        case 'toggle-observation':
            UI.toggleAddObservationForm(id);
            break;
            
        case 'toggle-observations':
            const button = eventTarget;
            const hiddenContainer = document.getElementById(`hidden-obs-${id}`);
            if (hiddenContainer) {
                const isVisible = hiddenContainer.classList.toggle('visible');
                button.textContent = isVisible ? 'Ver menos' : `Ver mais ${hiddenContainer.children.length} antigas`;
            }
            break;

        case 'add-new-observation':
            const text = document.getElementById(`observationText-${target.id}`).value.trim();
            const dateStr = document.getElementById(`observationDate-${target.id}`).value;
            if (!text || !dateStr) return UI.showToast("Preencha o texto e a data.", "error");
            
            const newObservation = { text, date: new Date(dateStr + 'T12:00:00Z'), isSubTarget: false };
            
            if (!target.observations) target.observations = [];
            target.observations.push(newObservation);
            UI.toggleAddObservationForm(target.id);
            applyFiltersAndRender(panelId);

            try {
                await Service.addObservationToTarget(state.user.uid, target.id, isArchived, newObservation);
                UI.showToast("Observação adicionada.", "success");
                requestSync(target.id);
            } catch(error) {
                UI.showToast("Falha ao salvar. Desfazendo.", "error");
                target.observations.pop();
                applyFiltersAndRender(panelId);
            }
            break;

        case 'edit-title':
        case 'edit-details':
        case 'edit-observation':
        case 'edit-sub-target-title':
        case 'edit-sub-target-details':
        case 'edit-sub-observation':
        case 'edit-deadline':
            const typeMap = {
                'edit-title': { type: 'Title', value: target.title, save: 'save-title' },
                'edit-details': { type: 'Details', value: target.details, save: 'save-details' },
                'edit-observation': { type: 'Observation', value: target.observations[obsIndex].text, save: 'save-observation' },
                'edit-sub-target-title': { type: 'SubTargetTitle', value: target.observations[obsIndex].subTargetTitle, save: 'save-sub-target-title' },
                'edit-sub-target-details': { type: 'SubTargetDetails', value: target.observations[obsIndex].text, save: 'save-sub-target-details' },
                'edit-sub-observation': { type: 'SubObservation', value: target.observations[obsIndex].subObservations[subObsIndex].text, save: 'save-sub-observation' },
                'edit-deadline': { type: 'Deadline', value: target.deadlineDate, save: 'save-deadline' }
            };
            const editConfig = typeMap[action];
            UI.toggleEditForm(editConfig.type, id, { 
                currentValue: editConfig.value, 
                obsIndex, 
                subObsIndex, 
                saveAction: editConfig.save, 
                eventTarget 
            });
            break;

        case 'save-title':
        case 'save-details':
        case 'save-observation':
        case 'save-sub-target-title':
        case 'save-sub-target-details':
        case 'save-sub-observation':
            const form = eventTarget.closest('.inline-edit-form');
            if (!form || !target) break;
            const inputField = form.querySelector('input, textarea');
            const newValue = inputField.value.trim();

            let targetObject, field, oldValue, updatePayload, successMsg, serviceFunc;

            if (action === 'save-title') { targetObject = target; field = 'title'; }
            if (action === 'save-details') { targetObject = target; field = 'details'; }
            if (action === 'save-observation') { targetObject = target.observations[obsIndex]; field = 'text'; }
            if (action === 'save-sub-target-title') { targetObject = target.observations[obsIndex]; field = 'subTargetTitle'; }
            if (action === 'save-sub-target-details') { targetObject = target.observations[obsIndex]; field = 'text'; }
            if (action === 'save-sub-observation') { targetObject = target.observations[obsIndex].subObservations[subObsIndex]; field = 'text'; }

            if (newValue === '' || newValue === targetObject[field]) { form.remove(); break; }
            oldValue = targetObject[field];
            targetObject[field] = newValue;
            applyFiltersAndRender(panelId);

            try {
                updatePayload = { [field]: newValue };
                successMsg = "Item atualizado com sucesso!";
                
                if (action.includes('sub-observation')) {
                    serviceFunc = Service.updateSubObservationInTarget(state.user.uid, id, isArchived, obsIndex, subObsIndex, updatePayload);
                } else if (action.includes('observation') || action.includes('sub-target')) {
                    serviceFunc = Service.updateObservationInTarget(state.user.uid, id, isArchived, obsIndex, updatePayload);
                } else {
                    serviceFunc = Service.updateTargetField(state.user.uid, id, isArchived, updatePayload);
                }
                await serviceFunc;
                UI.showToast(successMsg, "success");
                requestSync(id);
            } catch (error) {
                targetObject[field] = oldValue;
                applyFiltersAndRender(panelId);
                UI.showToast("Falha ao atualizar o item.", "error");
            }
            break;

        case 'save-deadline':
            const deadlineForm = eventTarget.closest('.inline-edit-form');
            if (!deadlineForm || !target) break;
            const newDeadlineStr = deadlineForm.querySelector('input[type="date"]').value;
            if (!newDeadlineStr) break;
            const newDeadlineDate = new Date(newDeadlineStr + 'T12:00:00Z');
            const oldDeadlineDate = target.deadlineDate;
            const oldHasDeadline = target.hasDeadline;
            target.deadlineDate = newDeadlineDate;
            target.hasDeadline = true;
            applyFiltersAndRender(panelId);
            try {
                await Service.updateTargetField(state.user.uid, target.id, isArchived, { hasDeadline: true, deadlineDate: newDeadlineDate });
                UI.showToast("Prazo atualizado!", "success");
                requestSync(id);
            } catch(error) {
                target.deadlineDate = oldDeadlineDate;
                target.hasDeadline = oldHasDeadline;
                applyFiltersAndRender(panelId);
                UI.showToast("Falha ao salvar prazo.", "error");
            }
            break;
            
        case 'remove-deadline':
            if (!target || !confirm("Tem certeza que deseja remover o prazo deste alvo?")) break;
            const oldDeadline = { deadlineDate: target.deadlineDate, hasDeadline: target.hasDeadline };
            target.deadlineDate = null;
            target.hasDeadline = false;
            applyFiltersAndRender(panelId);
            try {
                await Service.updateTargetField(state.user.uid, target.id, isArchived, { hasDeadline: false, deadlineDate: null });
                UI.showToast("Prazo removido.", "info");
                requestSync(id);
            } catch(error) {
                Object.assign(target, oldDeadline);
                applyFiltersAndRender(panelId);
                UI.showToast("Falha ao remover prazo.", "error");
            }
            break;

        case 'edit-category':
            UI.toggleEditCategoryForm(id, target?.category);
            break;

        case 'save-category':
            const newCategory = document.getElementById(`categorySelect-${target.id}`).value;
            const oldCategory = target.category;
            
            target.category = newCategory;
            UI.toggleEditCategoryForm(target.id);
            applyFiltersAndRender(panelId);

            try {
                await Service.updateTargetField(state.user.uid, target.id, isArchived, { category: newCategory });
                UI.showToast("Categoria atualizada.", "success");
                requestSync(target.id);
            } catch(error) {
                UI.showToast("Falha ao salvar. Desfazendo.", "error");
                target.category = oldCategory;
                applyFiltersAndRender(panelId);
            }
            break;

        case 'toggle-priority':
            const newStatus = !target.isPriority;
            const oldStatus = target.isPriority;
            target.isPriority = newStatus;
            applyFiltersAndRender('mainPanel');
            UI.renderPriorityTargets(state.prayerTargets, state.dailyTargets);

            try {
                await Service.updateTargetField(state.user.uid, target.id, false, { isPriority: newStatus });
                UI.showToast(newStatus ? "Marcado como prioritário." : "Removido dos prioritários.", "info");
                requestSync(target.id);
            } catch (error) {
                UI.showToast("Erro ao salvar. Desfazendo.", "error");
                target.isPriority = oldStatus;
                applyFiltersAndRender('mainPanel');
                UI.renderPriorityTargets(state.prayerTargets, state.dailyTargets);
            }
            break;

        case 'download-target-pdf':
            if (target) {
                generateAndDownloadPdf(target);
                UI.showToast(`Gerando PDF para "${target.title}"...`, 'info');
            }
            break;

        case 'select-manual-target':
            try {
                const targetToAdd = state.prayerTargets.find(t => t.id === id);
                if (!targetToAdd) throw new Error("Alvo selecionado não encontrado.");

                UI.toggleManualTargetModal(false);
                UI.showToast("Adicionando alvo à lista do dia...", "info");

                await Service.addManualTargetToDailyList(state.user.uid, id);

                state.dailyTargets.targetIds.push(id); 
                state.dailyTargets.pending.unshift(targetToAdd);

                UI.renderDailyTargets(state.dailyTargets.pending, state.dailyTargets.completed);
                UI.showToast(`"${targetToAdd.title}" foi adicionado ao topo da lista!`, "success");
            } catch (error) {
                console.error("Erro ao adicionar alvo manualmente:", error);
                UI.showToast(error.message, "error");
            }
            break;

        case 'promote-observation':
            if (!confirm("Deseja promover esta observação a um sub-alvo?")) break;
            const newTitle = prompt("Qual o título para este novo sub-alvo?", target.observations[parseInt(obsIndex)].text.substring(0, 50));
            if (!newTitle || newTitle.trim() === '') break;

            const updatedObservationData = { isSubTarget: true, subTargetTitle: newTitle.trim(), subTargetStatus: 'active', interactionCount: 0, subObservations: [] };
            const originalObservation = { ...target.observations[parseInt(obsIndex)] };
            Object.assign(target.observations[parseInt(obsIndex)], updatedObservationData);
            applyFiltersAndRender(panelId);
            try {
                await Service.updateObservationInTarget(state.user.uid, id, isArchived, parseInt(obsIndex), updatedObservationData);
                UI.showToast("Observação promovida a sub-alvo!", "success");
                requestSync(id);
            } catch (error) {
                target.observations[parseInt(obsIndex)] = originalObservation;
                applyFiltersAndRender(panelId);
                UI.showToast("Falha ao salvar. Desfazendo.", "error");
            }
            break;

        case 'pray-sub-target':
            try {
                eventTarget.disabled = true;
                eventTarget.textContent = '✓ Orado!';
                eventTarget.classList.add('prayed');
                
                const subTargetId = `${id}_${obsIndex}`;
                const parentTarget = findTargetInState(state, id).target;
                
                if (parentTarget) {
                    state.dailyTargets.completed.push({ targetId: subTargetId, isSubTarget: true, title: parentTarget.observations[obsIndex].subTargetTitle });
                }
                
                await Service.recordInteractionForSubTarget(state.user.uid, subTargetId);
                const { isNewRecord } = await Service.recordUserInteraction(state.user.uid, state.perseveranceData, state.weeklyPrayerData);
                
                const [perseveranceData, weeklyData] = await Promise.all([ Service.loadPerseveranceData(state.user.uid), Service.loadWeeklyPrayerData(state.user.uid) ]);
                state.perseveranceData = perseveranceData;
                state.weeklyPrayerData = weeklyData;
                UI.updatePerseveranceUI(state.perseveranceData, isNewRecord);
                UI.updateWeeklyChart(state.weeklyPrayerData);
                UI.showToast("Interação com sub-alvo registrada!", "success");
            } catch (error) {
                UI.showToast("Falha ao registrar interação. Tente novamente.", "error");
                eventTarget.disabled = false;
                eventTarget.textContent = 'Orei!';
                eventTarget.classList.remove('prayed');
            }
            break;

        case 'demote-sub-target':
            if (!confirm("Reverter este sub-alvo para uma observação comum?")) break;
            const originalSubTarget = { ...target.observations[parseInt(obsIndex)] };
            const { subTargetTitle, subTargetStatus, interactionCount, subObservations, ...demotedObs } = originalSubTarget;
            demotedObs.isSubTarget = false;
            target.observations[parseInt(obsIndex)] = demotedObs;
            applyFiltersAndRender(panelId);
            try {
                await Service.updateObservationInTarget(state.user.uid, id, isArchived, parseInt(obsIndex), demotedObs);
                UI.showToast("Sub-alvo revertido para observação.", "info");
                requestSync(id);
            } catch (error) {
                target.observations[parseInt(obsIndex)] = originalSubTarget;
                applyFiltersAndRender(panelId);
                UI.showToast("Erro ao reverter. Desfazendo.", "error");
            }
            break;

        case 'resolve-sub-target':
            if (!confirm("Marcar este sub-alvo como respondido?")) break;
            const originalSubTargetStatus = { ...target.observations[parseInt(obsIndex)] };
            const updatedSubTargetData = { subTargetStatus: 'resolved' };
            Object.assign(target.observations[parseInt(obsIndex)], updatedSubTargetData);
            applyFiltersAndRender(panelId);
            try {
                await Service.updateObservationInTarget(state.user.uid, id, isArchived, parseInt(obsIndex), updatedSubTargetData);
                UI.showToast("Sub-alvo marcado como respondido!", "success");
                requestSync(id);
            } catch (error) {
                target.observations[parseInt(obsIndex)] = originalSubTargetStatus;
                applyFiltersAndRender(panelId);
                UI.showToast("Erro ao salvar. Desfazendo.", "error");
            }
            break;

        case 'add-sub-observation':
            const subObsText = prompt("Nova observação para este sub-alvo:");
            if (!subObsText || subObsText.trim() === '') break;
            const newSubObservation = { text: subObsText.trim(), date: new Date() };
            const subTarget = target.observations[parseInt(obsIndex)];
            if (!Array.isArray(subTarget.subObservations)) subTarget.subObservations = [];
            subTarget.subObservations.push(newSubObservation);
            applyFiltersAndRender(panelId);
            try {
                await Service.addSubObservationToTarget(state.user.uid, id, isArchived, parseInt(obsIndex), newSubObservation);
                UI.showToast("Observação adicionada ao sub-alvo.", "success");
                requestSync(id);
            } catch (error) {
                subTarget.subObservations.pop();
                applyFiltersAndRender(panelId);
                UI.showToast("Erro ao salvar. Desfazendo.", "error");
            }
            break;
    }
}
