// ui.js
// Responsável por toda a manipulação do DOM e renderização da interface.
// ARQUITETURA REVISADA: Inclui formulários inline para todas as observações e sub-observações.

// --- MÓDULOS ---
import { formatDateForDisplay, formatDateToISO, timeElapsed, calculateMilestones } from './utils.js'; // <-- MELHORIA DE ARQUITETURA: Importa a nova função de cálculo
import { MILESTONES } from './config.js';

// --- Funções Utilitárias Específicas da UI ---

/**
 * Verifica se uma data de prazo já expirou.
 * @param {Date} date - O objeto Date do prazo.
 * @returns {boolean} - True se a data já passou.
 */
function isDateExpired(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) return false;
    const now = new Date();
    // Compara apenas as datas, ignorando a hora, usando UTC para consistência.
    const todayUTCStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return date.getTime() < todayUTCStart.getTime();
}

/**
 * (VERSÃO FINAL COM MELHORIA IMPLEMENTADA)
 * Gera o HTML para a lista de observações de um alvo,
 * diferenciando entre observações, sub-alvos e suas próprias sub-observações.
 * @param {Array<object>} observations - O array de observações.
 * @param {string} parentTargetId - O ID do alvo principal ao qual estas observações pertencem.
 * @param {object} dailyTargetsData - Dados dos alvos diários para verificar status.
 * @returns {string} - A string HTML da lista de observações.
 */
// PONTO DE MUDANÇA (PRIORIDADE 1)
function createObservationsHTML(observations, parentTargetId, dailyTargetsData = {}) {
    if (!Array.isArray(observations) || observations.length === 0) return '';
    
    // ORDENAÇÃO INVERTIDA: Exibe os mais recentes primeiro
    const sorted = [...observations].sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
    
    let html = `<div class="observations">`;

    sorted.forEach((obs) => {
        // Encontra o índice original para manter a integridade dos data-attributes
        const originalIndex = observations.indexOf(obs);
        const sanitizedText = (obs.text || '').replace(/</g, "<").replace(/>/g, ">");
        
        if (obs.isSubTarget) {
            // ----- RENDERIZA COMO UM SUB-ALVO -----
            const isResolved = obs.subTargetStatus === 'resolved';
            
            const subTargetId = `${parentTargetId}_${originalIndex}`;
            const hasBeenPrayedToday = (dailyTargetsData.completed || []).some(t => t.targetId === subTargetId);

            const prayButtonText = hasBeenPrayedToday ? '✓ Orado!' : 'Orei!';
            const prayButtonClass = `btn pray-button ${hasBeenPrayedToday ? 'prayed' : ''}`;
            const prayButtonDisabled = hasBeenPrayedToday ? 'disabled' : '';

            const subTargetPrayButton = `<button class="${prayButtonClass}" data-action="pray-sub-target" data-id="${parentTargetId}" data-obs-index="${originalIndex}" ${prayButtonDisabled}>${prayButtonText}</button>`;

            const hasSubObservations = Array.isArray(obs.subObservations) && obs.subObservations.length > 0;
            const demoteButtonDisabled = hasSubObservations ? 'disabled' : '';
            const demoteButtonTitle = hasSubObservations ? 'Não é possível reverter um sub-alvo que já possui observações.' : 'Reverter para observação comum';

            const subTargetActions = !isResolved ? `
                <button class="btn-small" data-action="add-sub-observation" data-id="${parentTargetId}" data-obs-index="${originalIndex}">+ Observação</button>
                <button class="btn-small resolve" data-action="resolve-sub-target" data-id="${parentTargetId}" data-obs-index="${originalIndex}">Marcar Respondido</button>
            ` : `<span class="resolved-tag">Respondido</span>`;

            let subObservationsHTML = '';
            if (hasSubObservations) {
                subObservationsHTML += '<div class="sub-observations-list">';
                // Também inverte a ordem das sub-observações
                const sortedSubObs = [...obs.subObservations].sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
                
                sortedSubObs.forEach(subObs => {
                    const sanitizedSubText = (subObs.text || '').replace(/</g, "<").replace(/>/g, ">");
                    subObservationsHTML += `
                        <div class="sub-observation-item">
                            <strong>${formatDateForDisplay(subObs.date)}:</strong> ${sanitizedSubText}
                        </div>`;
                });
                subObservationsHTML += '</div>';
            }

            html += `
                <div class="observation-item sub-target ${isResolved ? 'resolved' : ''}">
                    <div class="sub-target-header">
                        <span class="sub-target-title">${obs.subTargetTitle}</span>
                        <div class="observation-actions">
                           ${subTargetActions}
                           <button class="btn-small demote" data-action="demote-sub-target" data-id="${parentTargetId}" data-obs-index="${originalIndex}" ${demoteButtonDisabled} title="${demoteButtonTitle}">Reverter</button>
                        </div>
                    </div>
                    <p><em>${sanitizedText} (Origem: observação de ${formatDateForDisplay(obs.date)})</em></p>
                    <div class="target-actions" style="margin-top: 10px;">
                        ${!isResolved ? subTargetPrayButton : ''}
                    </div>
                    ${subObservationsHTML}
                </div>`;
        } else {
            // ----- RENDERIZA COMO UMA OBSERVAÇÃO NORMAL -----
            html += `
                <div class="observation-item">
                    <p><strong>${formatDateForDisplay(obs.date)}:</strong> ${sanitizedText}</p>
                    <div class="observation-actions">
                        <button class="btn-small promote" data-action="promote-observation" data-id="${parentTargetId}" data-obs-index="${originalIndex}">Promover a Sub-Alvo</button>
                    </div>
                </div>`;
        }
    });

    return html + `</div>`;
}


// --- Template Engine de Alvos (Refatoração Arquitetônica) ---

/**
 * Cria o HTML para um único alvo com base em uma configuração.
 * @param {object} target - O objeto do alvo de oração.
 * @param {object} config - Configurações de exibição e ações.
 * @param {object} dailyTargetsData - Dados dos alvos diários para verificar status.
 * @returns {string} - O HTML do elemento do alvo.
 */
function createTargetHTML(target, config = {}, dailyTargetsData = {}) {
    const hasSubTargets = Array.isArray(target.observations) && target.observations.some(obs => obs.isSubTarget);
    const subTargetIndicatorIcon = hasSubTargets ? `<span class="sub-target-indicator" title="Este alvo contém sub-alvos">🔗</span>` : '';

    const creationTag = config.showCreationDate ? `<span class="creation-date-tag">Iniciado em: ${formatDateForDisplay(target.date)}</span>` : '';
    const categoryTag = config.showCategory && target.category ? `<span class="category-tag">${target.category}</span>` : '';
    const deadlineTag = config.showDeadline && target.hasDeadline && target.deadlineDate ? `<span class="deadline-tag ${isDateExpired(target.deadlineDate) ? 'expired' : ''}">Prazo: ${formatDateForDisplay(target.deadlineDate)}</span>` : '';
    const resolvedTag = config.showResolvedDate && target.resolved && target.resolutionDate ? `<span class="resolved-tag">Respondido em: ${formatDateForDisplay(target.resolutionDate)}</span>` : '';

    const detailsPara = config.showDetails ? `<p class="target-details">${target.details || 'Sem Detalhes'}</p>` : '';
    const elapsedTimePara = config.showElapsedTime ? `<p><strong>Tempo Decorrido:</strong> ${timeElapsed(target.date)}</p>` : '';
    const archivedDatePara = config.showArchivedDate && target.archivedDate ? `<p><strong>Data Arquivamento:</strong> ${formatDateForDisplay(target.archivedDate)}</p>` : '';
    const timeToResolutionPara = config.showTimeToResolution && target.date && target.resolutionDate ? `<p><strong>Tempo para Resposta:</strong> ${timeElapsed(target.date, target.resolutionDate)}</p>` : '';

    // INÍCIO DA MODIFICAÇÃO: Lógica do botão "Orei!" movida para cá
    let mainActionHTML = '';
    if (config.showPrayButton) {
        const hasBeenPrayedToday = (dailyTargetsData.completed || []).some(t => t.id === target.id);
        const prayButtonText = hasBeenPrayedToday ? '✓ Orado!' : 'Orei!';
        const prayButtonClass = `btn pray-button ${hasBeenPrayedToday ? 'prayed' : ''}`;
        const prayButtonDisabled = hasBeenPrayedToday ? 'disabled' : '';
        const prayAction = config.isPriorityPanel ? 'pray-priority' : 'pray';

        mainActionHTML = `
            <div class="target-main-action">
                <button class="${prayButtonClass}" data-action="${prayAction}" data-id="${target.id}" ${prayButtonDisabled}>${prayButtonText}</button>
            </div>
        `;
    }
    // FIM DA MODIFICAÇÃO

    let actionsHTML = '';
    if (config.showActions) {
        // A lógica do botão de orar foi removida daqui e agora está em 'mainActionHTML'
        const priorityButtonClass = `btn toggle-priority ${target.isPriority ? 'is-priority' : ''}`;
        const priorityButtonText = target.isPriority ? 'Remover Prioridade' : 'Marcar Prioridade';

        const resolveButton = config.showResolveButton ? `<button class="btn resolved" data-action="resolve" data-id="${target.id}">Respondido</button>` : '';
        const resolveArchivedButton = config.showResolveArchivedButton ? `<button class="btn resolved" data-action="resolve-archived" data-id="${target.id}">Respondido</button>` : '';
        const archiveButton = config.showArchiveButton ? `<button class="btn archive" data-action="archive" data-id="${target.id}">Arquivar</button>` : '';
        const togglePriorityButton = config.showTogglePriorityButton ? `<button class="${priorityButtonClass}" data-action="toggle-priority" data-id="${target.id}">${priorityButtonText}</button>` : '';
        const addObservationButton = config.showAddObservationButton ? `<button class="btn add-observation" data-action="toggle-observation" data-id="${target.id}">Observação</button>` : '';
        const editDeadlineButton = config.showEditDeadlineButton ? `<button class="btn edit-deadline" data-action="edit-deadline" data-id="${target.id}">Editar Prazo</button>` : '';
        const editCategoryButton = config.showEditCategoryButton ? `<button class="btn edit-category" data-action="edit-category" data-id="${target.id}">Editar Categoria</button>` : '';
        const deleteButton = config.showDeleteButton ? `<button class="btn delete" data-action="delete-archived" data-id="${target.id}">Excluir</button>` : '';
        
        // ==========================================================================================
        // ===== ALTERAÇÃO SOLICITADA: O botão de download agora usa a nova ação e texto em PDF. =====
        // ==========================================================================================
        const downloadButton = config.showDownloadButton ? `<button class="btn download" data-action="download-target-pdf" data-id="${target.id}">Download (.pdf)</button>` : '';

        actionsHTML = `<div class="target-actions">
            ${resolveButton} ${archiveButton} ${togglePriorityButton} ${addObservationButton} 
            ${editDeadlineButton} ${editCategoryButton} ${resolveArchivedButton} ${deleteButton} ${downloadButton}
        </div>`;
    }

    const observationsHTML = config.showObservations ? createObservationsHTML(target.observations, target.id, dailyTargetsData) : '';
    
    const formsHTML = config.showForms ? `
        <div id="observationForm-${target.id}" class="add-observation-form" style="display:none;"></div>
        <div id="editDeadlineForm-${target.id}" class="edit-deadline-form" style="display:none;"></div>
        <div id="editCategoryForm-${target.id}" class="edit-category-form" style="display:none;"></div>` : '';

    // INÍCIO DA MODIFICAÇÃO: O template de retorno agora inclui o 'mainActionHTML' na nova posição
    return `
        <h3>${subTargetIndicatorIcon} ${creationTag} ${categoryTag} ${deadlineTag} ${resolvedTag} ${target.title || 'Sem Título'}</h3>
        ${detailsPara}
        ${mainActionHTML}
        ${elapsedTimePara}
        ${archivedDatePara}
        ${timeToResolutionPara}
        ${observationsHTML}
        ${actionsHTML}
        ${formsHTML}
    `;
    // FIM DA MODIFICAÇÃO
}


// --- Funções de Renderização de Listas de Alvos (Refatoradas) ---

export function renderPriorityTargets(allActiveTargets, dailyTargetsData) {
    const container = document.getElementById('priorityTargetsList');
    const section = document.getElementById('prioritySection');
    if (!container || !section) return;

    const priorityTargets = allActiveTargets.filter(target => target.isPriority);

    if (priorityTargets.length === 0) {
        section.style.display = 'block';
        container.innerHTML = `<p class="empty-message">Nenhum alvo prioritário definido. Você pode marcar um alvo como prioritário na lista de 'Ver Todos os Alvos'.</p>`;
        return;
    }

    section.style.display = 'block';
    container.innerHTML = ''; 

    const config = {
        showCreationDate: true,
        showCategory: true,
        showDeadline: true,
        showDetails: true,
        showObservations: true,
        showActions: true,
        showPrayButton: true,
        isPriorityPanel: true
    };
    
    priorityTargets.forEach(target => {
        const div = document.createElement("div");
        div.className = "target priority-target-item target-fade-in"; // PONTO DE MUDANÇA (PRIORIDADE 2.b)
        div.dataset.targetId = target.id;
        div.innerHTML = createTargetHTML(target, config, dailyTargetsData);
        container.appendChild(div);
    });
}

export function renderTargets(targets, total, page, perPage, dailyTargetsData) {
    const container = document.getElementById('targetList');
    container.innerHTML = '';
    if (targets.length === 0) {
        container.innerHTML = '<p>Nenhum alvo de oração encontrado com os filtros atuais.</p>';
    } else {
        // =========================================================================================
        // ===== ALTERAÇÃO SOLICITADA: Adicionado 'showDownloadButton: true' para alvos ativos. =====
        // =========================================================================================
        const config = {
            showCreationDate: true, showCategory: true, showDeadline: true, showDetails: true,
            showElapsedTime: true, showObservations: true, showActions: true,
            showResolveButton: true, showArchiveButton: true, showTogglePriorityButton: true,
            showAddObservationButton: true, showEditDeadlineButton: true, showEditCategoryButton: true,
            showDownloadButton: true, // <--- ADICIONADO
            showForms: true, showPrayButton: false
        };
        targets.forEach(target => {
            const div = document.createElement("div");
            div.className = "target";
            div.dataset.targetId = target.id;
            div.innerHTML = createTargetHTML(target, config, dailyTargetsData);
            container.appendChild(div);
        });
    }
    renderPagination('mainPanel', page, total, perPage);
}

export function renderArchivedTargets(targets, total, page, perPage, dailyTargetsData) {
    const container = document.getElementById('archivedList');
    container.innerHTML = '';
    if (targets.length === 0) {
        container.innerHTML = '<p>Nenhum alvo arquivado encontrado.</p>';
    } else {
        targets.forEach(target => {
            const div = document.createElement("div");
            div.className = `target archived ${target.resolved ? 'resolved' : ''}`;
            div.dataset.targetId = target.id;
            
            // O botão de download já estava habilitado aqui, a alteração no 'createTargetHTML'
            // irá atualizar automaticamente o texto e a ação.
            const config = {
                showCreationDate: true,
                showCategory: true,
                showResolvedDate: true,
                showDetails: true,
                showArchivedDate: true,
                showObservations: true,
                showActions: true,
                showResolveArchivedButton: !target.resolved,
                showAddObservationButton: true,
                showDeleteButton: true,
                showDownloadButton: true,
                showForms: true
            };
            div.innerHTML = createTargetHTML(target, config, dailyTargetsData);
            container.appendChild(div);
        });
    }
    renderPagination('archivedPanel', page, total, perPage);
}

export function renderResolvedTargets(targets, total, page, perPage) {
    const container = document.getElementById('resolvedList');
    container.innerHTML = '';
    if (targets.length === 0) {
        container.innerHTML = '<p>Nenhum alvo respondido encontrado.</p>';
    } else {
        // ========================================================================================================
        // ===== ALTERAÇÃO SOLICITADA: Adicionado 'showActions' e 'showDownloadButton' para alvos respondidos. =====
        // ========================================================================================================
        const config = {
            showCategory: true,
            showResolvedDate: true,
            showTimeToResolution: true,
            showObservations: true,
            showActions: true, // <--- ADICIONADO (necessário para o container de ações)
            showDownloadButton: true // <--- ADICIONADO
        };
        targets.forEach(target => {
            const div = document.createElement("div");
            div.className = 'target resolved';
            div.dataset.targetId = target.id;
            div.innerHTML = createTargetHTML(target, config);
            container.appendChild(div);
        });
    }
    renderPagination('resolvedPanel', page, total, perPage);
}

// PONTO DE MUDANÇA (PRIORIDADE 1 e 2.b)
export function renderDailyTargets(pending, completed, dailyTargetsData) {
    const container = document.getElementById("dailyTargets");
    container.innerHTML = '';

    if (pending.length === 0 && completed.length === 0) {
        container.innerHTML = "<p>Nenhum alvo de oração selecionado para hoje.</p>";
        return;
    }

    if (pending.length > 0) {
        const config = {
            showCreationDate: true, showCategory: true, showDeadline: true, showDetails: true,
            showObservations: true, showActions: true, showPrayButton: true
        };
        pending.forEach(target => {
            const div = document.createElement("div");
            div.className = 'target target-fade-in'; // Adiciona classe para animação
            div.dataset.targetId = target.id;
            div.innerHTML = createTargetHTML(target, config, dailyTargetsData);
            container.appendChild(div);
        });
    } else if (completed.length > 0) {
        container.innerHTML = "<p>Você já orou por todos os alvos de hoje!</p>";
        displayCompletionPopup();
    }

    if (completed.length > 0) {
        const separator = document.createElement('hr');
        separator.className = 'section-separator';
        const completedTitle = document.createElement('h3');
        completedTitle.textContent = "Concluídos Hoje";
        completedTitle.style.textAlign = 'center';
        container.appendChild(separator);
        container.appendChild(completedTitle);

        completed.forEach(target => {
            const div = document.createElement("div");
            const isSub = target.isSubTarget;
            div.className = 'target completed-target target-fade-in'; // Adiciona classe para animação
            div.dataset.targetId = target.id || target.targetId;
            // A lógica no 'firestore-service' agora garante que 'target.title' está correto
            div.innerHTML = `<h3>${isSub ? '↳ ' : ''}${target.title || 'Alvo concluído'}</h3>`;
            container.appendChild(div);
        });
    }
}

// --- Funções de Componentes de UI ---

export function renderPagination(panelId, currentPage, totalItems, itemsPerPage) {
    const paginationDiv = document.getElementById(`pagination-${panelId}`);
    if (!paginationDiv) return;

    const totalPages = Math.ceil(totalItems / itemsPerPage);
    if (totalPages <= 1) {
        paginationDiv.style.display = 'none';
        return;
    }

    paginationDiv.style.display = 'flex';
    paginationDiv.innerHTML = `
        <a href="#" class="page-link ${currentPage <= 1 ? 'disabled' : ''}" data-page="${currentPage - 1}" data-panel="${panelId}">« Anterior</a>
        <span>Página ${currentPage} de ${totalPages}</span>
        <a href="#" class="page-link ${currentPage >= totalPages ? 'disabled' : ''}" data-page="${currentPage + 1}" data-panel="${panelId}">Próxima »</a>
    `;
}

/**
 * (VERSÃO ATUALIZADA - PRIORIDADES 1 E 2 APLICADAS)
 * Atualiza toda a interface de perseverança, incluindo a barra de progresso
 * e os novos ícones de marcos cumulativos, com a lógica de cálculo refatorada.
 * @param {object} data - O objeto com os dados de perseverança { consecutiveDays, recordDays }.
 * @param {boolean} isNewRecord - Flag para ativar a animação de novo recorde.
 */
export function updatePerseveranceUI(data, isNewRecord = false) {
    const { consecutiveDays = 0, recordDays = 0 } = data;
    const progressBar = document.getElementById('perseveranceProgressBar');
    const currentDaysEl = document.getElementById('currentDaysText');
    const recordDaysEl = document.getElementById('recordDaysText');
    const perseveranceSection = document.getElementById('perseveranceSection');
    const iconsContainer = document.getElementById('milestoneIconsArea');

    if (!progressBar || !currentDaysEl || !recordDaysEl || !perseveranceSection || !iconsContainer) return;

    perseveranceSection.style.display = 'block';

    // 1. Lógica da Barra de Progresso (Inalterada)
    const percentage = recordDays > 0 ? Math.min((consecutiveDays / recordDays) * 100, 100) : 0;
    progressBar.style.width = `${percentage}%`;
    currentDaysEl.textContent = consecutiveDays;
    recordDaysEl.textContent = recordDays;

    if (isNewRecord) {
        progressBar.classList.add('new-record-animation');
        setTimeout(() => progressBar.classList.remove('new-record-animation'), 2000);
    }
    
    // 2. LÓGICA REFINADA: Chama a função de cálculo e renderiza o resultado
    // A lógica de negócio foi movida para utils.js (Melhoria de Arquitetura - Prioridade 2)
    const achievedMilestones = calculateMilestones(consecutiveDays);

    // Limpa a área de ícones antes de renderizar os novos
    iconsContainer.innerHTML = '';

    // Renderiza os ícones calculados
    if (achievedMilestones.length > 0) {
        achievedMilestones.forEach(ms => {
            const group = document.createElement('div');
            group.className = 'milestone-group';

            const iconSpan = document.createElement('span');
            iconSpan.className = 'milestone-icon';
            iconSpan.textContent = ms.icon;
            
            group.appendChild(iconSpan);

            if (ms.count > 1) {
                const counterSpan = document.createElement('span');
                counterSpan.className = 'milestone-counter';
                counterSpan.textContent = `x${ms.count}`;
                group.appendChild(counterSpan);
            }
            
            iconsContainer.appendChild(group);
        });
    } else {
        iconsContainer.innerHTML = '<span class="milestone-legend" style="font-size: 1em;">Continue para conquistar seu primeiro marco! 🌱</span>';
    }

    // Lógica da Coroa (Recorde) mantida
    if (recordDays > 0 && consecutiveDays >= recordDays) {
        const crownIcon = document.createElement('span');
        crownIcon.className = 'milestone-icon'; // Reutiliza estilo para consistência
        crownIcon.textContent = '👑';
        iconsContainer.insertAdjacentElement('afterbegin', crownIcon);
    }
}


export function updateWeeklyChart(data) {
    const { interactions = {} } = data;
    const now = new Date();

    const localDayOfWeek = now.getDay(); 
    const utcDayOfWeek = now.getUTCDay(); 
    
    const firstDayOfWeek = new Date(now);
    firstDayOfWeek.setDate(now.getDate() - localDayOfWeek);
    firstDayOfWeek.setHours(0, 0, 0, 0);

    for (let i = 0; i < 7; i++) { 
        const dayTick = document.getElementById(`day-${i}`);
        if (!dayTick) continue;

        const dayContainer = dayTick.parentElement;
        if (dayContainer) dayContainer.classList.remove('current-day-container');
        dayTick.className = 'day-tick'; 

        if (i === localDayOfWeek) {
            dayTick.classList.add('current-day');
            if (dayContainer) dayContainer.classList.add('current-day-container');
        }

        const currentTickDate = new Date(firstDayOfWeek);
        currentTickDate.setDate(firstDayOfWeek.getDate() + i);
        
        const dateStringUTC = `${currentTickDate.getUTCFullYear()}-${String(currentTickDate.getUTCMonth() + 1).padStart(2, '0')}-${String(currentTickDate.getUTCDate()).padStart(2, '0')}`;

        if (interactions[dateStringUTC]) {
            dayTick.classList.add('active'); 
        } 
        else if (i < utcDayOfWeek) { 
            dayTick.classList.add('inactive'); 
        }
    }
}

export function resetPerseveranceUI() {
    updatePerseveranceUI({ consecutiveDays: 0, recordDays: 0 });
    const perseveranceSection = document.getElementById('perseveranceSection');
    if(perseveranceSection) perseveranceSection.style.display = 'none';
}

export function resetWeeklyChart() {
    updateWeeklyChart({});
}

export function showPanel(panelId) {
    const allPanels = ['appContent', 'dailySection', 'mainPanel', 'archivedPanel', 'resolvedPanel', 'authSection', 'prioritySection'];
    const mainMenuElements = ['mainMenu', 'secondaryMenu'];
    const dailyRelatedElements = ['weeklyPerseveranceChart', 'perseveranceSection', 'sectionSeparator'];

    [...allPanels, ...mainMenuElements, ...dailyRelatedElements].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    const panelEl = document.getElementById(panelId);
    if (panelEl) panelEl.style.display = 'block';

    if (panelId !== 'authSection') {
        mainMenuElements.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'block';
        });
    }
    if (panelId === 'dailySection') {
        dailyRelatedElements.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'block';
        });
        const priorityEl = document.getElementById('prioritySection');
        if(priorityEl) priorityEl.style.display = 'block';
    }
}

export function toggleAddObservationForm(targetId) {
    const formDiv = document.getElementById(`observationForm-${targetId}`);
    if (!formDiv) return;
    const isVisible = formDiv.style.display === 'block';

    document.getElementById(`editDeadlineForm-${targetId}`).style.display = 'none';
    document.getElementById(`editCategoryForm-${targetId}`).style.display = 'none';

    if (isVisible) {
        formDiv.style.display = 'none';
        formDiv.innerHTML = '';
    } else {
        formDiv.innerHTML = `
            <textarea id="observationText-${targetId}" placeholder="Nova observação..." rows="3" style="width: 95%;"></textarea>
            <input type="date" id="observationDate-${targetId}" style="width: 95%;">
            <button class="btn" data-action="save-observation" data-id="${targetId}" style="background-color: #7cb17c;">Salvar Observação</button>
            <button class="btn cancel-btn" onclick="document.getElementById('observationForm-${targetId}').style.display='none';" style="background-color: #f44336;">Cancelar</button>
        `;
        document.getElementById(`observationDate-${targetId}`).value = formatDateToISO(new Date());
        formDiv.style.display = 'block';
        formDiv.querySelector('textarea')?.focus();
    }
}

export function toggleEditDeadlineForm(targetId, currentDeadline) {
    const formDiv = document.getElementById(`editDeadlineForm-${targetId}`);
    if (!formDiv) return;
    const isVisible = formDiv.style.display === 'block';

    document.getElementById(`observationForm-${targetId}`).style.display = 'none';
    document.getElementById(`editCategoryForm-${targetId}`).style.display = 'none';

    if (isVisible) {
        formDiv.style.display = 'none';
        formDiv.innerHTML = '';
    } else {
        const currentDateValue = currentDeadline ? formatDateToISO(currentDeadline) : '';
        formDiv.innerHTML = `
            <label for="deadlineInput-${targetId}">Novo Prazo:</label>
            <input type="date" id="deadlineInput-${targetId}" value="${currentDateValue}">
            <div class="form-actions">
                <button class="btn save-deadline-btn" data-action="save-deadline" data-id="${targetId}">Salvar</button>
                <button class="btn remove-deadline-btn" data-action="remove-deadline" data-id="${targetId}">Remover Prazo</button>
                <button class="btn cancel-deadline-btn" data-action="edit-deadline" data-id="${targetId}">Cancelar</button>
            </div>
        `;
        formDiv.style.display = 'block';
        formDiv.querySelector('input')?.focus();
    }
}

export function toggleEditCategoryForm(targetId, currentCategory) {
    const formDiv = document.getElementById(`editCategoryForm-${targetId}`);
    if (!formDiv) return;
    const isVisible = formDiv.style.display === 'block';

    document.getElementById(`observationForm-${targetId}`).style.display = 'none';
    document.getElementById(`editDeadlineForm-${targetId}`).style.display = 'none';
    
    if (isVisible) {
        formDiv.style.display = 'none';
        formDiv.innerHTML = '';
    } else {
        const categories = ["Família", "Pessoal", "Igreja", "Trabalho", "Sonho", "Profético", "Promessas", "Esposa", "Filhas", "Ministério de Intercessão", "Outros"];
        const optionsHTML = categories.map(cat => 
            `<option value="${cat}" ${cat === currentCategory ? 'selected' : ''}>${cat}</option>`
        ).join('');

        formDiv.innerHTML = `
            <label for="categorySelect-${targetId}">Nova Categoria:</label>
            <select id="categorySelect-${targetId}" style="width: 95%;">
                <option value="">-- Nenhuma --</option>
                ${optionsHTML}
            </select>
            <button class="btn save-category-btn" data-action="save-category" data-id="${targetId}">Salvar Categoria</button>
            <button class="btn cancel-category-btn" onclick="document.getElementById('editCategoryForm-${targetId}').style.display='none';">Cancelar</button>
        `;
        formDiv.style.display = 'block';
        formDiv.querySelector('select')?.focus();
    }
}

/**
 * Exibe ou oculta o formulário para adicionar uma observação a um sub-alvo.
 * @param {string} targetId - O ID do alvo principal.
 * @param {boolean} isArchived - Se o alvo principal está arquivado.
 * @param {number} obsIndex - O índice do sub-alvo (a observação promovida).
 */
export function toggleSubObservationForm(targetId, isArchived, obsIndex) {
    const formDiv = document.getElementById(`subObservationForm-${targetId}-${obsIndex}`);
    if (!formDiv) return;
    const isVisible = formDiv.style.display === 'block';

    if (isVisible) {
        formDiv.style.display = 'none';
        formDiv.innerHTML = '';
    } else {
        formDiv.innerHTML = `
            <textarea id="subObsText-${targetId}-${obsIndex}" placeholder="Nova observação para o sub-alvo..." rows="2" style="width: 95%;"></textarea>
            <button class="btn" data-action="save-sub-observation" data-id="${targetId}" data-obs-index="${obsIndex}" style="background-color: #7cb17c;">Salvar</button>
            <button class="btn cancel-btn" onclick="document.getElementById('subObservationForm-${targetId}-${obsIndex}').style.display='none';" style="background-color: #f44336;">Cancelar</button>
        `;
        formDiv.style.display = 'block';
        formDiv.querySelector('textarea')?.focus();
    }
}

export function showExpiredTargetsToast(expiredTargets) {
    const toast = document.getElementById('expiredToast');
    const messageEl = document.getElementById('expiredToastMessage');
    const closeBtn = document.getElementById('closeExpiredToast');

    if (!toast || !messageEl || !closeBtn || expiredTargets.length === 0) {
        return;
    }
    
    const count = expiredTargets.length;
    messageEl.textContent = `Você tem ${count} alvo${count > 1 ? 's' : ''} com prazo vencido!`;
    
    toast.classList.remove('hidden');
    
    closeBtn.onclick = () => {
        toast.classList.add('hidden');
    };
    
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 8000); 
}

export function toggleManualTargetModal(show) {
    const modal = document.getElementById('manualTargetModal');
    if (modal) {
        modal.style.display = show ? 'flex' : 'none';
        if (!show) document.getElementById('manualTargetSearchInput').value = '';
    }
}

export function renderManualSearchResults(results, allTargets, searchTerm = '') {
    const container = document.getElementById('manualTargetSearchResults');
    container.innerHTML = '';

    if (searchTerm.trim() === '' && allTargets.length > 0) {
        container.innerHTML = '<p>Digite para buscar entre seus alvos ativos.</p>';
        return;
    }
    
    if (results.length === 0) {
        container.innerHTML = '<p>Nenhum alvo encontrado com esse termo.</p>';
        return;
    }

    results.forEach(target => {
        const item = document.createElement('div');
        item.className = 'manual-target-item';
        item.dataset.action = 'select-manual-target'; 
        item.dataset.id = target.id;
        item.innerHTML = `
            <h4 data-action="select-manual-target" data-id="${target.id}">${target.title}</h4>
            <span data-action="select-manual-target" data-id="${target.id}">${target.details || 'Sem detalhes.'}</span>
        `;
        container.appendChild(item);
    });
}

export function toggleDateRangeModal(show) {
    const modal = document.getElementById('dateRangeModal');
    if (modal) {
        modal.style.display = show ? 'flex' : 'none';
        if (show) {
            const today = new Date();
            const lastMonth = new Date();
            lastMonth.setMonth(today.getMonth() - 1);
            document.getElementById('endDate').value = formatDateToISO(today);
            document.getElementById('startDate').value = formatDateToISO(lastMonth);
        }
    }
}

export function toggleCategoryModal(show, allTargets = []) {
    const modal = document.getElementById('categorySelectionModal');
    if (modal) {
        modal.style.display = show ? 'flex' : 'none';
        if (show) {
            const container = document.getElementById('categoryCheckboxesContainer');
            container.innerHTML = '';
            
            const categories = [...new Set(allTargets.map(t => t.category).filter(Boolean))];
            if (categories.length === 0) {
                container.innerHTML = '<p>Nenhuma categoria encontrada nos seus alvos.</p>';
            } else {
                categories.sort().forEach(category => {
                    container.innerHTML += `
                        <div class="category-checkbox-item">
                            <input type="checkbox" id="cat-${category}" value="${category}" checked>
                            <label for="cat-${category}">${category}</label>
                        </div>
                    `;
                });
            }
        }
    }
}

export function generateViewHTML(targets, pageTitle, selectedCategories = []) {
    const groupedTargets = {};
    const useGrouping = selectedCategories.length > 0;

    if (useGrouping) {
        // Inicializa os grupos com as categorias selecionadas para manter a ordem
        for (const category of selectedCategories.sort()) {
            groupedTargets[category] = [];
        }
        // Adiciona um grupo para alvos sem categoria, se necessário
        if (targets.some(t => !t.category)) {
            groupedTargets['Sem Categoria'] = [];
        }
    }

    for (const target of targets) {
        if (useGrouping) {
            const category = target.category || 'Sem Categoria';
            if (groupedTargets[category]) {
                groupedTargets[category].push(target);
            }
        } else {
            // Se não for para agrupar, todos vão para um grupo genérico
            if (!groupedTargets['all']) groupedTargets['all'] = [];
            groupedTargets['all'].push(target);
        }
    }

    let bodyContent = '';
    const categoriesToRender = useGrouping ? Object.keys(groupedTargets) : ['all'];

    for (const category of categoriesToRender) {
        if (groupedTargets[category] && groupedTargets[category].length > 0) {
            if (useGrouping) {
                bodyContent += `<h2 class="category-title">${category}</h2>`;
            }
            bodyContent += groupedTargets[category].map(target => `
                <div class="target-view-item">
                    <h3>${target.title}</h3>
                    <p><strong>Detalhes:</strong> ${target.details || 'N/A'}</p>
                    <p><strong>Data de Criação:</strong> ${formatDateForDisplay(target.date)}</p>
                    ${target.observations && target.observations.length > 0 ? '<h4>Observações:</h4>' + createObservationsHTML(target.observations, target.id) : ''}
                </div>
            `).join('<hr class="view-separator-light">');
        }
    }
    
    if (bodyContent === '') {
        bodyContent = '<p>Nenhum alvo encontrado para os filtros selecionados.</p>';
    }

    return `
        <!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${pageTitle}</title>
        <style>
            body { font-family: 'Playfair Display', serif; margin: 20px; line-height: 1.6; color: #333; }
            .header { text-align: center; border-bottom: 2px solid #654321; padding-bottom: 10px; margin-bottom: 25px; display: flex; justify-content: space-between; align-items: center; }
            h1 { color: #333; margin: 0; flex-grow: 1; }
            h2.category-title { font-size: 1.5em; color: #654321; border-bottom: 1px solid #e29420; padding-bottom: 5px; margin-top: 30px; }
            h3 { margin-bottom: 5px; color: #7a5217; }
            h4 { margin-top: 15px; margin-bottom: 5px; color: #444; }
            p { margin: 4px 0; color: #555; }
            .target-view-item { margin-bottom: 15px; padding: 10px; border: 1px solid #f0f0f0; border-radius: 4px; background-color: #fdfdfd; }
            .observations { margin-top: 10px; padding-left: 15px; border-left: 2px solid #eee; }
            .observation-item { font-size: 0.9em; }
            .view-separator-light { border: 0; border-top: 1px solid #eee; margin: 15px 0; }
            .print-button { padding: 10px 18px; font-size: 14px; background-color: #7a5217; color: white; border: none; border-radius: 5px; cursor: pointer; transition: background-color 0.3s; }
            .print-button:hover { background-color: #5f4012; }
            @media print { .no-print { display: none !important; } }
        </style>
        </head><body>
            <div class="header no-print">
                 <button class="print-button" onclick="window.print()">Imprimir Relatório</button>
                 <h1>${pageTitle}</h1>
                 <div style="width: 140px;"></div>
            </div>
            <div class="report-content">${bodyContent}</div>
        </body></html>
    `;
}

export function generatePerseveranceReportHTML(data) {
    const MILESTONES_REPORT = [
        { name: "Semente da Perseverança", days: 7, icon: "🌱" },
        { name: "Chama da Devoção", days: 15, icon: "🔥" },
        { name: "Estrela da Fidelidade", days: 30, icon: "⭐" },
        { name: "Árvore da Constância", days: 100, icon: "🌳" },
        { name: "Diamante da Oração", days: 300, icon: "💎" },
        { name: "Sol da Eternidade", days: 1000, icon: "☀️" },
    ];

    let milestonesHTML = '';
    if (data.consecutiveDays > 0) {
        MILESTONES_REPORT.forEach(milestone => {
            if (data.consecutiveDays >= milestone.days) {
                milestonesHTML += `<li class="achieved">${milestone.icon} ${milestone.name} (${milestone.days} dias) - <strong>Atingido!</strong></li>`;
            } else {
                milestonesHTML += `<li class="pending">${milestone.icon} ${milestone.name} (${milestone.days} dias) - Faltam ${milestone.days - data.consecutiveDays} dia(s).</li>`;
            }
        });
    } else {
        milestonesHTML = '<li>Nenhuma sequência ativa para exibir marcos.</li>';
    }

    let historyHTML = '';
    if (data.interactionDates && data.interactionDates.length > 0) {
        historyHTML = data.interactionDates.map(dateStr => {
            const date = new Date(dateStr + 'T12:00:00Z');
            return `<li>${date.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</li>`;
        }).join('');
    } else {
        historyHTML = '<li>Nenhuma interação registrada na semana atual.</li>';
    }

    return `
        <!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Relatório de Perseverança Pessoal</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f4f7f6; color: #333; }
            .container { max-width: 750px; margin: 25px auto; padding: 20px 30px; background-color: #fff; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
            h1 { text-align: center; color: #2c3e50; border-bottom: 2px solid #e29420; padding-bottom: 15px; margin-bottom: 25px; }
            h2 { color: #34495e; border-bottom: 1px solid #eaeaea; padding-bottom: 8px; margin-top: 30px; }
            .section { margin-bottom: 25px; }
            .stat-item { font-size: 1.1em; margin-bottom: 12px; }
            .stat-item strong { color: #e29420; min-width: 150px; display: inline-block; }
            ul { list-style-type: none; padding-left: 0; }
            li { background-color: #fdfdfd; border-left: 4px solid #ccc; margin-bottom: 8px; padding: 12px 15px; border-radius: 4px; transition: all 0.2s ease; }
            li:hover { transform: translateX(5px); box-shadow: 0 2px 5px rgba(0,0,0,0.05); }
            li.achieved { border-left-color: #27ae60; }
            li.achieved strong { color: #27ae60; }
            li.pending { border-left-color: #bdc3c7; opacity: 0.8; }
        </style>
        </head><body>
        <div class="container">
            <h1>Relatório de Perseverança Pessoal</h1>
            <div class="section">
                <h2>Resumo Geral</h2>
                <div class="stat-item"><strong>Sequência Atual:</strong> ${data.consecutiveDays} dia(s) consecutivos</div>
                <div class="stat-item"><strong>Recorde Pessoal:</strong> ${data.recordDays} dia(s)</div>
                <div class="stat-item"><strong>Última Interação:</strong> ${data.lastInteractionDate}</div>
            </div>
            <div class="section">
                <h2>Marcos da Sequência Atual</h2>
                <ul>${milestonesHTML}</ul>
            </div>
            <div class="section">
                <h2>Interações Recentes (Semana Atual)</h2>
                <ul>${historyHTML}</ul>
            </div>
        </div>
        </body></html>
    `;
}

export function generateInteractionReportHTML(allTargets, interactionMap) {
    const reportData = allTargets.map(target => ({
        title: target.title,
        category: target.category || 'Sem Categoria',
        creationDate: formatDateForDisplay(target.date),
        count: interactionMap.get(target.id) || 0,
        status: target.resolved ? 'Respondido' : (target.archived ? 'Arquivado' : 'Ativo')
    }));

    reportData.sort((a, b) => b.count - a.count);

    let tableRowsHTML = reportData.map(item => `
        <tr>
            <td>${item.title}</td>
            <td class="center">${item.count}</td>
            <td>${item.category}</td>
            <td>${item.creationDate}</td>
            <td class="status-${item.status.toLowerCase()}">${item.status}</td>
        </tr>
    `).join('');

    if (reportData.length === 0) {
        tableRowsHTML = '<tr><td colspan="5">Nenhum alvo encontrado para gerar o relatório.</td></tr>';
    }

    return `
        <!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Relatório de Interação por Alvo</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 20px; background-color: #f9f9f9; color: #333; }
            h1 { text-align: center; color: #2c3e50; border-bottom: 2px solid #e29420; padding-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
            th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #ddd; }
            th { background-color: #e29420; color: white; }
            tr:nth-child(even) { background-color: #fdfdfd; }
            tr:hover { background-color: #f1f1f1; }
            .center { text-align: center; font-weight: bold; font-size: 1.1em; }
            .status-ativo { color: #2980b9; font-weight: bold; }
            .status-arquivado { color: #7f8c8d; }
            .status-respondido { color: #27ae60; font-weight: bold; }
        </style>
        </head><body>
            <h1>Relatório de Interação por Alvo</h1>
            <table>
                <thead>
                    <tr>
                        <th>Título do Alvo</th>
                        <th class="center">Interações</th>
                        <th>Categoria</th>
                        <th>Data de Criação</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRowsHTML}
                </tbody>
            </table>
        </body></html>
    `;
}

export function displayCompletionPopup() {
    const popup = document.getElementById('completionPopup');
    const verses = [
        "“Entrega o teu caminho ao Senhor; confia nele, e ele tudo fará.” - Salmos 37:5",
        "“Orai sem cessar.” - 1 Tessalonicenses 5:17",
        "“Pedi, e dar-se-vos-á; buscai, e encontrareis; batei, e abrir-se-vos-á.” - Mateus 7:7"
    ];
    if (popup) {
        popup.style.display = 'flex';
        const popupVerseEl = popup.querySelector('#popupVerse');
        if (popupVerseEl) {
            popupVerseEl.textContent = verses[Math.floor(Math.random() * verses.length)];
        }
        const closeButton = popup.querySelector('#closePopup');
        if (closeButton) {
            closeButton.onclick = () => popup.style.display = 'none';
        }
    }
}

export function updateAuthUI(user, message = '', isError = false) {
    const authStatus = document.getElementById('authStatus');
    const btnLogout = document.getElementById('btnLogout');
    const emailPasswordAuthForm = document.getElementById('emailPasswordAuthForm');
    const authStatusContainer = document.querySelector('.auth-status-container');
    const passwordResetMessageDiv = document.getElementById('passwordResetMessage');

    if (user) {
        authStatusContainer.style.display = 'flex';
        btnLogout.style.display = 'inline-block';
        emailPasswordAuthForm.style.display = 'none';
        authStatus.textContent = `Autenticado: ${user.email}`;
        passwordResetMessageDiv.style.display = 'none';
    } else {
        authStatusContainer.style.display = 'none';
        btnLogout.style.display = 'none';
        emailPasswordAuthForm.style.display = 'block';
        
        if (message) {
            passwordResetMessageDiv.textContent = message;
            passwordResetMessageDiv.style.color = isError ? "red" : "green";
            passwordResetMessageDiv.style.display = "block";
        } else {
            passwordResetMessageDiv.style.display = 'none';
        }
    }
}
