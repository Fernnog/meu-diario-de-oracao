// ui.js
// Responsável por toda a manipulação do DOM e renderização da interface.

// Idealmente, as funções de formatação viriam de um 'utils.js'
// Para simplicidade, elas estão aqui por enquanto.
function formatDateForDisplay(date) {
    if (!(date instanceof Date) || isNaN(date)) return 'Data Inválida';
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function timeElapsed(date) {
    if (!(date instanceof Date) || isNaN(date)) return 'Tempo desconhecido';
    const seconds = Math.floor((new Date() - date) / 1000);
    // ... lógica de conversão para minutos, horas, dias ... (simplificado)
    return `${Math.floor(seconds / 86400)} dias`;
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

/**
 * Renderiza a lista de alvos de oração ativos no painel principal.
 * @param {Array} targetsToDisplay - Array de alvos a serem exibidos na página atual.
 * @param {number} totalFilteredTargets - Total de alvos após a filtragem.
 * @param {number} currentPage - A página atual.
 * @param {number} targetsPerPage - Itens por página.
 */
export function renderTargets(targetsToDisplay, totalFilteredTargets, currentPage, targetsPerPage) {
    console.log(`[UI] Renderizando ${targetsToDisplay.length} de ${totalFilteredTargets} alvos ativos.`);
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
                const isExpired = new Date() > target.deadlineDate;
                deadlineTag = `<span class="deadline-tag ${isExpired ? 'expired' : ''}">Prazo: ${formatDateForDisplay(target.deadlineDate)}</span>`;
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

    renderPagination('mainPanel', currentPage, totalFilteredTargets, targetsPerPage);
}

// Funções renderArchivedTargets e renderResolvedTargets seriam similares
export function renderArchivedTargets(targets, total, page, perPage) { /* ... */ }
export function renderResolvedTargets(targets, total, page, perPage) { /* ... */ }

export function renderDailyTargets(pendingTargets, completedTargets) {
    console.log(`[UI] Renderizando alvos do dia: ${pendingTargets.length} pendentes, ${completedTargets.length} concluídos.`);
    const dailyTargetsDiv = document.getElementById("dailyTargets");
    dailyTargetsDiv.innerHTML = '<p>Carregando...</p>'; // Placeholder
    // ... lógica completa de renderização ...
    if (pendingTargets.length === 0 && completedTargets.length > 0) {
        displayCompletionPopup();
    }
}

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

// --- Funções de UI de Perseverança ---

export function updatePerseveranceUI(perseveranceData) { /* ... */ }
export function updateWeeklyChart(weeklyData) { /* ... */ }
export function resetPerseveranceUI() { /* ... */ }
export function resetWeeklyChart() { /* ... */ }

// --- Funções de UI de Painéis e Modais ---

/**
 * Exibe um painel específico e esconde os outros.
 * @param {string} panelIdToShow - O ID do painel a ser exibido.
 */
export function showPanel(panelIdToShow) {
    console.log(`[UI] Exibindo painel: ${panelIdToShow}`);
    const allPanels = ['appContent', 'dailySection', 'mainPanel', 'archivedPanel', 'resolvedPanel', 'authSection'];
    const dailyRelatedElements = ['weeklyPerseveranceChart', 'perseveranceSection', 'sectionSeparator'];

    allPanels.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    
    // Oculta os menus e separadores por padrão
    document.getElementById('mainMenu').style.display = 'none';
    document.getElementById('secondaryMenu').style.display = 'none';
    dailyRelatedElements.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    // Exibe o painel solicitado
    const panelToShowElement = document.getElementById(panelIdToShow);
    if (panelToShowElement) {
        panelToShowElement.style.display = 'block';
    }

    // Lógica para exibir os menus e elementos relacionados
    if (panelIdToShow !== 'authSection') {
        document.getElementById('mainMenu').style.display = 'block';
        document.getElementById('secondaryMenu').style.display = 'block';
    }
    if (panelIdToShow === 'dailySection') {
        dailyRelatedElements.forEach(id => {
            const el = document.getElementById(id);
            if(el) el.style.display = 'block';
        });
    }
}

export function toggleAddObservation(targetId) {
    console.log(`[UI] Alternando formulário de observação para o alvo: ${targetId}`);
    const formDiv = document.getElementById(`observationForm-${targetId}`);
    if (!formDiv) return;
    const isVisible = formDiv.style.display === 'block';

    document.getElementById(`editDeadlineForm-${targetId}`).style.display = 'none';
    document.getElementById(`editCategoryForm-${targetId}`).style.display = 'none';

    formDiv.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) {
        // Se precisar preencher o form, fazemos aqui
        formDiv.innerHTML = `
            <textarea placeholder="Nova observação..."></textarea>
            <input type="date">
            <button data-action="save-observation" data-id="${targetId}">Salvar</button>
        `;
        formDiv.querySelector('textarea')?.focus();
    }
}

export function displayCompletionPopup() { /* ... */ }
