// ui.js
// Responsável por toda a manipulação do DOM e renderização da interface.

// --- Funções Utilitárias de Formatação ---

function formatDateForDisplay(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) return 'Data Inválida';
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();
    return `${day}/${month}/${year}`;
}

function formatDateToISO(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
        const today = new Date();
        return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    }
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function timeElapsed(startDate, endDate = new Date()) {
    if (!startDate || !(startDate instanceof Date) || isNaN(startDate.getTime())) return 'Tempo desconhecido';
    let diffInSeconds = Math.floor((endDate.getTime() - startDate.getTime()) / 1000);
    if (diffInSeconds < 0) diffInSeconds = 0;

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
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) return false;
    const now = new Date();
    const todayUTCStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return date.getTime() < todayUTCStart.getTime();
}

function createObservationsHTML(observations) {
    if (!Array.isArray(observations) || observations.length === 0) return '';
    const sorted = [...observations].sort((a, b) => b.date.getTime() - a.date.getTime());
    let html = `<div class="observations">`;
    sorted.forEach(obs => {
        const sanitizedText = (obs.text || '').replace(/</g, "<").replace(/>/g, ">");
        html += `<p class="observation-item"><strong>${formatDateForDisplay(obs.date)}:</strong> ${sanitizedText}</p>`;
    });
    return html + `</div>`;
}

// --- Funções de Renderização de Listas de Alvos ---

export function renderTargets(targets, total, page, perPage) {
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
            const deadlineTag = target.hasDeadline && target.deadlineDate ? `<span class="deadline-tag ${isDateExpired(target.deadlineDate) ? 'expired' : ''}">Prazo: ${formatDateForDisplay(target.deadlineDate)}</span>` : '';
            div.innerHTML = `
                <h3>${categoryTag} ${deadlineTag} ${target.title || 'Sem Título'}</h3>
                <p class="target-details">${target.details || 'Sem Detalhes'}</p>
                <p><strong>Data Criação:</strong> ${formatDateForDisplay(target.date)}</p>
                <p><strong>Tempo Decorrido:</strong> ${timeElapsed(target.date)}</p>
                ${createObservationsHTML(target.observations)}
                <div class="target-actions">
                    <button class="btn resolved" data-action="resolve" data-id="${target.id}">Respondido</button>
                    <button class="btn archive" data-action="archive" data-id="${target.id}">Arquivar</button>
                    <button class="btn add-observation" data-action="toggle-observation" data-id="${target.id}">Observação</button>
                    ${target.hasDeadline ? `<button class="btn edit-deadline" data-action="edit-deadline" data-id="${target.id}">Editar Prazo</button>` : ''}
                    <button class="btn edit-category" data-action="edit-category" data-id="${target.id}">Editar Categoria</button>
                </div>
                <div id="observationForm-${target.id}" class="add-observation-form" style="display:none;"></div>
                <div id="editDeadlineForm-${target.id}" class="edit-deadline-form" style="display:none;"></div>
                <div id="editCategoryForm-${target.id}" class="edit-category-form" style="display:none;"></div>
            `;
            container.appendChild(div);
        });
    }
    renderPagination('mainPanel', page, total, perPage);
}

export function renderArchivedTargets(targets, total, page, perPage) {
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
            const resolvedTag = target.resolved && target.resolutionDate ? `<span class="resolved-tag">Respondido em: ${formatDateForDisplay(target.resolutionDate)}</span>` : '';
            div.innerHTML = `
                <h3>${categoryTag} ${resolvedTag} ${target.title || 'Sem Título'}</h3>
                <p class="target-details">${target.details || 'Sem Detalhes'}</p>
                <p><strong>Data Arquivamento:</strong> ${formatDateForDisplay(target.archivedDate)}</p>
                ${createObservationsHTML(target.observations)}
                <div class="target-actions">
                    <button class="btn delete" data-action="delete-archived" data-id="${target.id}">Excluir</button>
                    <button class="btn add-observation" data-action="toggle-observation" data-id="${target.id}">Observação</button>
                </div>
                <div id="observationForm-${target.id}" class="add-observation-form" style="display:none;"></div>
                <div id="editDeadlineForm-${target.id}" class="edit-deadline-form" style="display:none;"></div>
                <div id="editCategoryForm-${target.id}" class="edit-category-form" style="display:none;"></div>
            `;
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
        targets.forEach(target => {
            const div = document.createElement("div");
            div.className = 'target resolved';
            div.dataset.targetId = target.id;
            const categoryTag = target.category ? `<span class="category-tag">${target.category}</span>` : '';
            const timeToResolution = target.date && target.resolutionDate ? timeElapsed(target.date, target.resolutionDate) : 'N/A';
            div.innerHTML = `
                <h3>${categoryTag} ${target.title || 'Sem Título'}</h3>
                <p><strong>Data Respondido:</strong> ${formatDateForDisplay(target.resolutionDate)}</p>
                <p><strong>Tempo para Resposta:</strong> ${timeToResolution}</p>
                ${createObservationsHTML(target.observations)}
            `;
            container.appendChild(div);
        });
    }
    renderPagination('resolvedPanel', page, total, perPage);
}

export function renderDailyTargets(pending, completed) {
    const container = document.getElementById("dailyTargets");
    container.innerHTML = '';

    if (pending.length === 0 && completed.length === 0) {
        container.innerHTML = "<p>Nenhum alvo de oração selecionado para hoje.</p>";
        return;
    }

    if (pending.length > 0) {
        pending.forEach(target => {
            const div = document.createElement("div");
            div.className = 'target';
            div.dataset.targetId = target.id;
            div.innerHTML = `
                <h3>${target.title}</h3>
                <p class="target-details">${target.details || 'Sem detalhes.'}</p>
                ${createObservationsHTML(target.observations)}
                <button class="pray-button btn" data-action="pray" data-id="${target.id}">Orei!</button>
            `;
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
            div.className = 'target completed-target';
            div.dataset.targetId = target.id;
            div.innerHTML = `<h3>${target.title}</h3>`;
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

export function updatePerseveranceUI(data, isNewRecord = false) {
    const { consecutiveDays = 0, recordDays = 0 } = data;
    const progressBar = document.getElementById('perseveranceProgressBar');
    const currentDaysEl = document.getElementById('currentDaysText');
    const recordDaysEl = document.getElementById('recordDaysText');
    const perseveranceSection = document.getElementById('perseveranceSection');

    if (!progressBar || !currentDaysEl || !recordDaysEl || !perseveranceSection) return;

    perseveranceSection.style.display = 'block';

    const percentage = recordDays > 0 ? Math.min((consecutiveDays / recordDays) * 100, 100) : 0;
    progressBar.style.width = `${percentage}%`;
    currentDaysEl.textContent = consecutiveDays;
    recordDaysEl.textContent = recordDays;

    if (isNewRecord) {
        progressBar.classList.add('new-record-animation');
        setTimeout(() => progressBar.classList.remove('new-record-animation'), 2000);
    }
    
    const MILESTONES = { sun: 1000, diamond: 365, tree: 100, star: 30, flame: 15, seed: 7 };
    const crownIcon = document.getElementById('recordCrown');
    const starContainer = document.getElementById('starContainer');

    document.querySelectorAll('.milestone-icon, .record-crown').forEach(icon => {
        icon.classList.remove('achieved');
        icon.style.display = 'none';
    });
    if (starContainer) starContainer.innerHTML = '';

    if (recordDays > 0 && consecutiveDays >= recordDays) {
        if (crownIcon) {
            crownIcon.classList.add('achieved');
            crownIcon.style.display = 'inline-block';
        }
    }

    if (consecutiveDays >= MILESTONES.sun) document.querySelector('.milestone-icon[data-milestone="sun"]').style.display = 'inline-block';
    if (consecutiveDays >= MILESTONES.diamond) document.querySelector('.milestone-icon[data-milestone="diamond"]').style.display = 'inline-block';
    if (consecutiveDays >= MILESTONES.tree) document.querySelector('.milestone-icon[data-milestone="tree"]').style.display = 'inline-block';
    if (consecutiveDays >= MILESTONES.flame) document.querySelector('.milestone-icon[data-milestone="flame"]').style.display = 'inline-block';
    if (consecutiveDays >= MILESTONES.seed) document.querySelector('.milestone-icon[data-milestone="seed"]').style.display = 'inline-block';
    
    if (starContainer && consecutiveDays >= MILESTONES.star) {
        const numStars = Math.floor(consecutiveDays / MILESTONES.star);
        for (let i = 0; i < numStars && i < 3; i++) { // Limita a 3 estrelas para não poluir
            const star = document.createElement('span');
            star.className = 'milestone-icon achieved';
            star.dataset.milestone = 'star';
            star.innerHTML = '⭐';
            star.style.display = 'inline-block';
            starContainer.appendChild(star);
        }
    }
}

export function updateWeeklyChart(data) {
    const { interactions = {} } = data;
    const today = new Date();
    const todayDayOfWeek = today.getDay(); 
    const firstDayOfWeek = new Date(today);
    firstDayOfWeek.setDate(today.getDate() - todayDayOfWeek);

    for (let i = 0; i < 7; i++) {
        const dayTick = document.getElementById(`day-${i}`);
        if (!dayTick) continue;

        const dayContainer = dayTick.parentElement;
        if (dayContainer) dayContainer.classList.remove('current-day-container');

        const currentTickDate = new Date(firstDayOfWeek);
        currentTickDate.setDate(firstDayOfWeek.getDate() + i);
        const dateString = `${currentTickDate.getFullYear()}-${String(currentTickDate.getMonth() + 1).padStart(2, '0')}-${String(currentTickDate.getDate()).padStart(2, '0')}`;
        
        dayTick.className = 'day-tick';
        
        if (i === todayDayOfWeek) {
            dayTick.classList.add('current-day');
            if (dayContainer) dayContainer.classList.add('current-day-container');
        }
        
        if (interactions[dateString]) {
            dayTick.classList.add('active');
        } else if (i < todayDayOfWeek) {
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

// --- Funções de UI de Painéis, Formulários e Modais ---

export function showPanel(panelId) {
    const allPanels = ['appContent', 'dailySection', 'mainPanel', 'archivedPanel', 'resolvedPanel', 'authSection'];
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
            <button class="btn cancel-btn" data-action="toggle-observation" data-id="${targetId}" style="background-color: #f44336;">Cancelar</button>
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
        const currentDateValue = formatDateToISO(currentDeadline);
        formDiv.innerHTML = `
            <label for="deadlineInput-${targetId}">Novo Prazo:</label>
            <input type="date" id="deadlineInput-${targetId}" value="${currentDateValue}" style="width: 95%;">
            <button class="btn save-deadline-btn" data-action="save-deadline" data-id="${targetId}">Salvar Prazo</button>
            <button class="btn cancel-deadline-btn" data-action="edit-deadline" data-id="${targetId}">Cancelar</button>
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
            <button class="btn cancel-category-btn" data-action="edit-category" data-id="${targetId}">Cancelar</button>
        `;
        formDiv.style.display = 'block';
        formDiv.querySelector('select')?.focus();
    }
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

export function generateViewHTML(targets, pageTitle) {
    let bodyContent = targets.map(target => `
        <div class="target-view-item">
            <h3>${target.title}</h3>
            <p><strong>Detalhes:</strong> ${target.details || 'N/A'}</p>
            <p><strong>Categoria:</strong> ${target.category || 'N/A'}</p>
            <p><strong>Data de Criação:</strong> ${formatDateForDisplay(target.date)}</p>
            ${target.observations && target.observations.length > 0 ? '<h4>Observações:</h4>' + createObservationsHTML(target.observations) : ''}
        </div>
    `).join('<hr class="view-separator">');

    return `
        <!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${pageTitle}</title>
        <style>
            body { font-family: sans-serif; margin: 20px; line-height: 1.6; color: #333; }
            h1 { text-align: center; color: #333; border-bottom: 2px solid #eee; padding-bottom: 10px; }
            h3 { margin-bottom: 5px; color: #0056b3; }
            h4 { margin-top: 15px; margin-bottom: 5px; color: #444; }
            p { margin: 4px 0; color: #555; }
            .target-view-item { margin-bottom: 15px; padding-bottom: 10px; }
            .observations { margin-top: 10px; padding-left: 15px; border-left: 2px solid #eee; }
            .observation-item { font-size: 0.9em; }
            .view-separator { border: 0; border-top: 1px solid #ccc; margin: 20px 0; }
        </style>
        </head><body><h1>${pageTitle}</h1>${bodyContent}</body></html>
    `;
}

export function generatePerseveranceReportHTML(data) {
    return `
        <!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Relatório de Perseverança</title>
        <style>
            body { font-family: sans-serif; margin: 20px; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
            h1 { text-align: center; color: #333; border-bottom: 2px solid #eee; padding-bottom: 10px; }
            .stat { margin-bottom: 15px; font-size: 1.2em; }
            .stat-label { font-weight: bold; color: #0056b3; }
            .stat-value { color: #555; }
        </style>
        </head><body>
        <div class="container">
            <h1>Relatório de Perseverança</h1>
            <div class="stat">
                <span class="stat-label">Sequência Atual:</span>
                <span class="stat-value">${data.consecutiveDays} dia(s) consecutivos</span>
            </div>
            <div class="stat">
                <span class="stat-label">Recorde Pessoal:</span>
                <span class="stat-value">${data.recordDays} dia(s)</span>
            </div>
            <div class="stat">
                <span class="stat-label">Última Interação:</span>
                <span class="stat-value">${data.lastInteractionDate}</span>
            </div>
        </div>
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
