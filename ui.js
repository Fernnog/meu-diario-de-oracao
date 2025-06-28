// ui.js
// Responsável por toda a manipulação do DOM e renderização da interface.

// --- Funções Utilitárias de Formatação (Internalizadas para simplicidade) ---
// Em um projeto maior, estas estariam em 'utils.js' e seriam importadas.

function formatDateForDisplay(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return 'Data Inválida';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

function formatDateToISO(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
        const today = new Date();
        return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function timeElapsed(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return 'Tempo desconhecido';
    const diffInSeconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (diffInSeconds < 60) return `${diffInSeconds} seg`;
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes} min`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} hr`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 30) return `${diffInDays} dias`;
    const diffInMonths = Math.floor(diffInDays / 30.44);
    if (diffInMonths < 12) return `${diffInMonths} meses`;
    return `${Math.floor(diffInDays / 365.25)} anos`;
}

function isDateExpired(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return false;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return date.getTime() < today.getTime();
}

/**
 * Cria o HTML para a lista de observações de um alvo.
 * @param {Array} observations - Array de objetos de observação.
 * @returns {string} - O bloco HTML das observações.
 */
function createObservationsHTML(observations) {
    if (!Array.isArray(observations) || observations.length === 0) {
        return '<div class="observations"></div>';
    }
    const sorted = [...observations].sort((a, b) => b.date.getTime() - a.date.getTime());
    let html = `<div class="observations">`;
    sorted.forEach(obs => {
        const sanitizedText = (obs.text || '').replace(/</g, "<").replace(/>/g, ">");
        html += `<p class="observation-item"><strong>${formatDateForDisplay(obs.date)}:</strong> ${sanitizedText}</p>`;
    });
    html += `</div>`;
    return html;
}

// --- Funções de Renderização de Listas de Alvos ---

/**
 * Renderiza a lista de alvos de oração ativos no painel principal.
 */
export function renderTargets(targetsToDisplay, totalFiltered, currentPage, targetsPerPage) {
    console.log(`[UI] Renderizando ${targetsToDisplay.length} de ${totalFiltered} alvos ativos.`);
    const targetListDiv = document.getElementById('targetList');
    targetListDiv.innerHTML = '';

    if (targetsToDisplay.length === 0) {
        targetListDiv.innerHTML = '<p>Nenhum alvo de oração encontrado com os filtros atuais.</p>';
    } else {
        targetsToDisplay.forEach((target) => {
            const targetDiv = document.createElement("div");
            targetDiv.className = "target";
            targetDiv.dataset.targetId = target.id;

            const categoryTag = target.category ? `<span class="category-tag">${target.category}</span>` : '';
            let deadlineTag = '';
            if (target.hasDeadline && target.deadlineDate) {
                deadlineTag = `<span class="deadline-tag ${isDateExpired(target.deadlineDate) ? 'expired' : ''}">Prazo: ${formatDateForDisplay(target.deadlineDate)}</span>`;
            }

            targetDiv.innerHTML = `
                <h3>${categoryTag} ${deadlineTag} ${target.title || 'Sem Título'}</h3>
                <p class="target-details">${target.details || 'Sem Detalhes'}</p>
                <p><strong>Data Criação:</strong> ${formatDateForDisplay(target.date)}</p>
                <p><strong>Tempo Decorrido:</strong> ${timeElapsed(target.date)}</p>
                ${createObservationsHTML(target.observations)}
                <div class="target-actions">
                    <button class="resolved btn" data-action="resolve" data-id="${target.id}">Respondido</button>
                    <button class="archive btn" data-action="archive" data-id="${target.id}">Arquivar</button>
                    <button class="add-observation btn" data-action="toggle-observation" data-id="${target.id}">Observação</button>
                    ${target.hasDeadline ? `<button class="edit-deadline btn" data-action="edit-deadline" data-id="${target.id}">Editar Prazo</button>` : ''}
                    <button class="edit-category btn" data-action="edit-category" data-id="${target.id}">Editar Categoria</button>
                </div>
                <div id="observationForm-${target.id}" class="add-observation-form" style="display:none;"></div>
                <div id="editDeadlineForm-${target.id}" class="edit-deadline-form" style="display:none;"></div>
                <div id="editCategoryForm-${target.id}" class="edit-category-form" style="display:none;"></div>
            `;
            targetListDiv.appendChild(targetDiv);
        });
    }
    renderPagination('mainPanel', currentPage, totalFiltered, targetsPerPage);
}

/**
 * Renderiza a lista de alvos arquivados.
 */
export function renderArchivedTargets(targetsToDisplay, totalFiltered, currentPage, targetsPerPage) {
    console.log(`[UI] Renderizando ${targetsToDisplay.length} de ${totalFiltered} alvos arquivados.`);
    const archivedListDiv = document.getElementById('archivedList');
    archivedListDiv.innerHTML = '';
    
    if (targetsToDisplay.length === 0) {
        archivedListDiv.innerHTML = '<p>Nenhum alvo arquivado encontrado.</p>';
    } else {
        targetsToDisplay.forEach((target) => {
            const archivedDiv = document.createElement("div");
            archivedDiv.className = `target archived ${target.resolved ? 'resolved' : ''}`;
            archivedDiv.dataset.targetId = target.id;
            
            const categoryTag = target.category ? `<span class="category-tag">${target.category}</span>` : '';
            const resolvedTag = target.resolved ? `<span class="resolved-tag">Respondido em: ${formatDateForDisplay(target.resolutionDate)}</span>` : '';

            archivedDiv.innerHTML = `
                <h3>${categoryTag} ${resolvedTag} ${target.title || 'Sem Título'}</h3>
                <p class="target-details">${target.details || 'Sem Detalhes'}</p>
                <p><strong>Data Criação:</strong> ${formatDateForDisplay(target.date)}</p>
                <p><strong>Data Arquivamento:</strong> ${formatDateForDisplay(target.archivedDate)}</p>
                ${createObservationsHTML(target.observations)}
                <div class="target-actions">
                    <button class="delete btn" data-action="delete-archived" data-id="${target.id}">Excluir Permanentemente</button>
                    <button class="add-observation btn" data-action="toggle-observation" data-id="${target.id}">Observação</button>
                    <button class="edit-category btn" data-action="edit-category" data-id="${target.id}">Editar Categoria</button>
                </div>
                <div id="observationForm-${target.id}" class="add-observation-form" style="display:none;"></div>
                <div id="editCategoryForm-${target.id}" class="edit-category-form" style="display:none;"></div>
            `;
            archivedListDiv.appendChild(archivedDiv);
        });
    }
    renderPagination('archivedPanel', currentPage, totalFiltered, targetsPerPage);
}

/**
 * Renderiza a lista de alvos respondidos.
 */
export function renderResolvedTargets(targetsToDisplay, totalFiltered, currentPage, targetsPerPage) {
    console.log(`[UI] Renderizando ${targetsToDisplay.length} de ${totalFiltered} alvos respondidos.`);
    const resolvedListDiv = document.getElementById('resolvedList');
    resolvedListDiv.innerHTML = '';
    
    if (targetsToDisplay.length === 0) {
        resolvedListDiv.innerHTML = '<p>Nenhum alvo respondido encontrado.</p>';
    } else {
        targetsToDisplay.forEach((target) => {
            const resolvedDiv = document.createElement("div");
            resolvedDiv.className = 'target resolved';
            resolvedDiv.dataset.targetId = target.id;
            
            const categoryTag = target.category ? `<span class="category-tag">${target.category}</span>` : '';
            const timeToResolution = target.date && target.resolutionDate ? timeElapsed(target.date, target.resolutionDate) : 'N/A';
            
            resolvedDiv.innerHTML = `
                <h3>${categoryTag} ${target.title || 'Sem Título'} (Respondido)</h3>
                <p class="target-details">${target.details || 'Sem Detalhes'}</p>
                <p><strong>Data Criação:</strong> ${formatDateForDisplay(target.date)}</p>
                <p><strong>Data Respondido:</strong> ${formatDateForDisplay(target.resolutionDate)}</p>
                <p><strong>Tempo Total:</strong> ${timeToResolution}</p>
                ${createObservationsHTML(target.observations)}
                 <div class="target-actions">
                    <button class="add-observation btn" data-action="toggle-observation" data-id="${target.id}">Observação</button>
                    <button class="edit-category btn" data-action="edit-category" data-id="${target.id}">Editar Categoria</button>
                </div>
                 <div id="observationForm-${target.id}" class="add-observation-form" style="display:none;"></div>
                 <div id="editCategoryForm-${target.id}" class="edit-category-form" style="display:none;"></div>
            `;
            resolvedListDiv.appendChild(resolvedDiv);
        });
    }
    renderPagination('resolvedPanel', currentPage, totalFiltered, targetsPerPage);
}

/**
 * Renderiza a lista de alvos do dia.
 */
export function renderDailyTargets(pendingTargets, completedTargets) {
    console.log(`[UI] Renderizando alvos do dia: ${pendingTargets.length} pendentes, ${completedTargets.length} concluídos.`);
    const dailyTargetsDiv = document.getElementById("dailyTargets");
    dailyTargetsDiv.innerHTML = '';

    if (pendingTargets.length === 0 && completedTargets.length === 0) {
        dailyTargetsDiv.innerHTML = "<p>Nenhum alvo de oração selecionado para hoje.</p>";
        return;
    }
    
    // Renderiza pendentes
    if (pendingTargets.length > 0) {
        pendingTargets.forEach(target => {
            // ... cria o elemento do alvo pendente com o botão "Orei!"
        });
    } else {
        dailyTargetsDiv.innerHTML = "<p>Você já orou por todos os alvos de hoje!</p>";
    }

    // Renderiza concluídos
    if (completedTargets.length > 0) {
        // ... cria a seção de concluídos e renderiza os alvos
    }

    if (pendingTargets.length === 0 && completedTargets.length > 0) {
        displayCompletionPopup();
    }
}

// --- Funções de Componentes de UI (Paginação, Perseverança, etc.) ---

/**
 * Renderiza os controles de paginação para um painel.
 */
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

export function updatePerseveranceUI(perseveranceData, isNewRecord = false) {
    const { consecutiveDays = 0, recordDays = 0 } = perseveranceData;
    console.log(`[UI] Atualizando barra de perseverança: ${consecutiveDays} dias, recorde ${recordDays}.`);
    const progressBarFill = document.getElementById('perseveranceProgressBar');
    const currentDaysTextEl = document.getElementById('currentDaysText');
    const recordDaysTextEl = document.getElementById('recordDaysText');
    
    if (progressBarFill && currentDaysTextEl && recordDaysTextEl) {
        const percentage = recordDays > 0 ? Math.min((consecutiveDays / recordDays) * 100, 100) : 0;
        progressBarFill.style.width = `${percentage}%`;
        currentDaysTextEl.textContent = consecutiveDays;
        recordDaysTextEl.textContent = recordDays;

        if (isNewRecord) {
            progressBarFill.classList.add('new-record-animation');
            setTimeout(() => progressBarFill.classList.remove('new-record-animation'), 2000);
        }
    }
}

export function updateWeeklyChart(weeklyData) {
    console.log("[UI] Atualizando gráfico semanal.");
    // ... Lógica para percorrer os dias da semana e adicionar as classes 'active', 'inactive', 'current-day' ...
}

export function resetPerseveranceUI() {
    console.log("[UI] Resetando UI de perseverança.");
    document.getElementById('perseveranceProgressBar').style.width = '0%';
    document.getElementById('currentDaysText').textContent = '0';
    document.getElementById('recordDaysText').textContent = '0';
}

export function resetWeeklyChart() {
    console.log("[UI] Resetando gráfico semanal.");
    for (let i = 0; i < 7; i++) {
        const dayTick = document.getElementById(`day-${i}`);
        if (dayTick) {
            dayTick.className = 'day-tick'; // Reseta para a classe base
        }
    }
}

// --- Funções de UI de Painéis, Formulários e Modais ---

/**
 * Exibe um painel específico e esconde os outros.
 */
export function showPanel(panelIdToShow) {
    console.log(`[UI] Exibindo painel: ${panelIdToShow}`);
    const allPanels = ['appContent', 'dailySection', 'mainPanel', 'archivedPanel', 'resolvedPanel', 'authSection'];
    const mainMenuElements = ['mainMenu', 'secondaryMenu'];
    const dailyRelatedElements = ['weeklyPerseveranceChart', 'perseveranceSection', 'sectionSeparator'];

    allPanels.forEach(id => document.getElementById(id)?.style.setProperty('display', 'none', 'important'));
    mainMenuElements.forEach(id => document.getElementById(id)?.style.setProperty('display', 'none', 'important'));
    dailyRelatedElements.forEach(id => document.getElementById(id)?.style.setProperty('display', 'none', 'important'));

    const panelToShowElement = document.getElementById(panelIdToShow);
    if (panelToShowElement) {
        panelToShowElement.style.display = 'block';
    }

    if (panelIdToShow !== 'authSection') {
        mainMenuElements.forEach(id => document.getElementById(id).style.display = 'block');
    }
    if (panelIdToShow === 'dailySection') {
        dailyRelatedElements.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'block';
        });
    }
}


/**
 * Alterna a visibilidade do formulário de adicionar observação.
 */
export function toggleAddObservation(targetId) {
    console.log(`[UI] Alternando formulário de observação para o alvo: ${targetId}`);
    const formDiv = document.getElementById(`observationForm-${targetId}`);
    if (!formDiv) return;
    const isVisible = formDiv.style.display === 'block';

    document.getElementById(`editDeadlineForm-${targetId}`).style.display = 'none';
    document.getElementById(`editCategoryForm-${targetId}`).style.display = 'none';

    if (isVisible) {
        formDiv.style.display = 'none';
    } else {
        formDiv.innerHTML = `
            <textarea id="observationText-${targetId}" placeholder="Nova observação..." rows="3"></textarea>
            <input type="date" id="observationDate-${targetId}">
            <button class="btn" data-action="save-observation" data-id="${targetId}" style="background-color: #7cb17c;">Salvar Observação</button>
        `;
        document.getElementById(`observationDate-${targetId}`).value = formatDateToISO(new Date());
        formDiv.style.display = 'block';
        formDiv.querySelector('textarea')?.focus();
    }
}

/**
 * Exibe o popup de conclusão de alvos do dia.
 */
export function displayCompletionPopup() {
    console.log('[UI] Exibindo popup de conclusão.');
    const popup = document.getElementById('completionPopup');
    const verses = [ // Idealmente viria de um config.js
        "“Entrega o teu caminho ao Senhor; confia nele, e ele tudo fará.” - Salmos 37:5",
        "“Orai sem cessar.” - 1 Tessalonicenses 5:17"
    ];
    if (popup) {
        popup.style.display = 'flex';
        const popupVerseElement = popup.querySelector('#popupVerse');
        if (popupVerseElement) {
            const randomIndex = Math.floor(Math.random() * verses.length);
            popupVerseElement.textContent = verses[randomIndex];
        }
    }
}

/**
 * Fecha todos os modais abertos.
 */
export function closeAllModals() {
    document.querySelectorAll('.modal').forEach(modal => modal.style.display = 'none');
}

/**
 * Abre um modal específico.
 * @param {string} modalId - O ID do modal a ser aberto.
 */
export function openModal(modalId) {
    closeAllModals(); // Garante que apenas um esteja aberto
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'block';
    }
}
