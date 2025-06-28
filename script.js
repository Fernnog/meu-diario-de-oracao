// ui.js
// Responsável por toda a manipulação do DOM e renderização da interface.

// --- Funções Utilitárias de Formatação ---

function formatDateForDisplay(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return 'Data Inválida';
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function timeElapsed(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return 'Tempo desconhecido';
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 0) return 'Em breve';
    if (seconds < 60) return `${seconds} seg`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr`;
    const days = Math.floor(hours / 24);
    return `${days} dias`;
}

function isDateExpired(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return false;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return date.getTime() < today.getTime();
}

function createObservationsHTML(observations) {
    if (!Array.isArray(observations) || observations.length === 0) return '<div class="observations"></div>';
    const sorted = [...observations].sort((a, b) => b.date.getTime() - a.date.getTime());
    let html = `<div class="observations">`;
    sorted.forEach(obs => {
        const sanitizedText = (obs.text || '').replace(/</g, "<").replace(/>/g, ">");
        html += `<p class="observation-item"><strong>${formatDateForDisplay(obs.date)}:</strong> ${sanitizedText}</p>`;
    });
    return html + `</div>`;
}

// --- Funções de Renderização de Listas ---

export function renderTargets(targets, total, page, perPage) {
    console.log(`[UI] Renderizando ${targets.length} de ${total} alvos ativos.`);
    const container = document.getElementById('targetList');
    container.innerHTML = '';
    if (targets.length === 0) {
        container.innerHTML = '<p>Nenhum alvo de oração encontrado com os filtros atuais.</p>';
    } else {
        targets.forEach(target => {
            const div = document.createElement("div");
            div.className = "target";
            div.dataset.targetId = target.id;
            const categoryTag = target.category ? `<span class="category-tag">${target.category}</span>` : '';
            const deadlineTag = target.hasDeadline ? `<span class="deadline-tag ${isDateExpired(target.deadlineDate) ? 'expired' : ''}">Prazo: ${formatDateForDisplay(target.deadlineDate)}</span>` : '';
            div.innerHTML = `
                <h3>${categoryTag} ${deadlineTag} ${target.title}</h3>
                <p class="target-details">${target.details}</p>
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
            container.appendChild(div);
        });
    }
    renderPagination('main', page, total, perPage);
}

export function renderArchivedTargets(targets, total, page, perPage) {
    console.log(`[UI] Renderizando ${targets.length} de ${total} alvos arquivados.`);
    const container = document.getElementById('archivedList');
    container.innerHTML = '';
    if (targets.length === 0) {
        container.innerHTML = '<p>Nenhum alvo arquivado encontrado.</p>';
    } else {
        targets.forEach(target => {
            const div = document.createElement("div");
            div.className = `target archived ${target.resolved ? 'resolved' : ''}`;
            div.dataset.targetId = target.id;
            const categoryTag = target.category ? `<span class="category-tag">${target.category}</span>` : '';
            const resolvedTag = target.resolved ? `<span class="resolved-tag">Respondido em: ${formatDateForDisplay(target.resolutionDate)}</span>` : '';
            div.innerHTML = `
                <h3>${categoryTag} ${resolvedTag} ${target.title}</h3>
                <p><strong>Arquivado em:</strong> ${formatDateForDisplay(target.archivedDate)}</p>
                ${createObservationsHTML(target.observations)}
                <div class="target-actions">
                    <button class="delete btn" data-action="delete-archived" data-id="${target.id}">Excluir</button>
                    <button class="add-observation btn" data-action="toggle-observation" data-id="${target.id}">Observação</button>
                </div>
                <div id="observationForm-${target.id}" class="add-observation-form" style="display:none;"></div>
            `;
            container.appendChild(div);
        });
    }
    renderPagination('archived', page, total, perPage);
}

export function renderResolvedTargets(targets, total, page, perPage) {
    console.log(`[UI] Renderizando ${targets.length} de ${total} alvos respondidos.`);
    const container = document.getElementById('resolvedList');
    container.innerHTML = '';
    if (targets.length === 0) {
        container.innerHTML = '<p>Nenhum alvo respondido encontrado.</p>';
    } else {
        // ... Lógica de renderização similar, focada nos detalhes de resolução
    }
    renderPagination('resolved', page, total, perPage);
}

export function renderDailyTargets(pending, completed) {
    console.log(`[UI] Renderizando alvos do dia: ${pending.length} pendentes, ${completed.length} concluídos.`);
    const container = document.getElementById("dailyTargets");
    container.innerHTML = '';
    // ... Lógica de renderização dos alvos do dia, pendentes e concluídos ...
}

// --- Funções de Componentes de UI ---

export function renderPagination(panelType, currentPage, totalItems, itemsPerPage) {
    const paginationDiv = document.getElementById(`pagination-${panelType}Panel`);
    if (!paginationDiv) {
        // Correção para o painel principal que não tem 'Panel' no ID
        const mainPagination = document.getElementById(`pagination-${panelType}`);
        if(mainPagination) mainPagination.innerHTML = ''; else return;
    }
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    if (totalPages <= 1) {
        if(paginationDiv) paginationDiv.style.display = 'none';
        return;
    }
    if(paginationDiv) paginationDiv.style.display = 'flex';
    if(paginationDiv) paginationDiv.innerHTML = `
        <a href="#" class="page-link ${currentPage <= 1 ? 'disabled' : ''}" data-page="${currentPage - 1}" data-panel="${panelType}">« Anterior</a>
        <span>Página ${currentPage} de ${totalPages}</span>
        <a href="#" class="page-link ${currentPage >= totalPages ? 'disabled' : ''}" data-page="${currentPage + 1}" data-panel="${panelType}">Próxima »</a>
    `;
}

export function updatePerseveranceUI(data) { /* ... */ }
export function updateWeeklyChart(data) { /* ... */ }
export function resetPerseveranceUI() { /* ... */ }
export function resetWeeklyChart() { /* ... */ }

// --- Funções de UI de Painéis, Formulários e Modais ---

export function showPanel(panelId) {
    console.log(`[UI] Exibindo painel: ${panelId}`);
    const panels = ['appContent', 'dailySection', 'mainPanel', 'archivedPanel', 'resolvedPanel', 'authSection'];
    const menus = ['mainMenu', 'secondaryMenu'];
    const dailyElements = ['weeklyPerseveranceChart', 'perseveranceSection', 'sectionSeparator'];

    [...panels, ...menus, ...dailyElements].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    const panelEl = document.getElementById(panelId);
    if (panelEl) panelEl.style.display = 'block';

    if (panelId !== 'authSection') {
        menus.forEach(id => document.getElementById(id).style.display = 'block');
    }
    if (panelId === 'dailySection') {
        dailyElements.forEach(id => document.getElementById(id).style.display = 'block');
    }
}

export function toggleAddObservationForm(targetId) {
    const formDiv = document.getElementById(`observationForm-${targetId}`);
    if (!formDiv) return;
    const isVisible = formDiv.style.display === 'block';

    // Fecha outros formulários para o mesmo alvo
    document.getElementById(`editDeadlineForm-${targetId}`).style.display = 'none';
    document.getElementById(`editCategoryForm-${targetId}`).style.display = 'none';

    if (isVisible) {
        formDiv.style.display = 'none';
    } else {
        formDiv.innerHTML = `
            <textarea placeholder="Nova observação..." rows="3"></textarea>
            <input type="date">
            <button class="btn" data-action="save-observation" data-id="${targetId}">Salvar</button>
        `;
        formDiv.style.display = 'block';
    }
}

export function updateAuthUI(user) {
    const authStatus = document.getElementById('authStatus');
    const btnLogout = document.getElementById('btnLogout');
    const emailPasswordAuthForm = document.getElementById('emailPasswordAuthForm');
    const authStatusContainer = document.querySelector('.auth-status-container');

    if (user) {
        authStatusContainer.style.display = 'flex';
        btnLogout.style.display = 'inline-block';
        emailPasswordAuthForm.style.display = 'none';
        authStatus.textContent = `Autenticado: ${user.email}`;
    } else {
        authStatusContainer.style.display = 'none';
        btnLogout.style.display = 'none';
        emailPasswordAuthForm.style.display = 'block';
    }
}
