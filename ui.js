// ui.js
// Responsável por toda a manipulação do DOM e renderização da interface.

// --- Funções Utilitárias de Formatação ---

/**
 * Formata um objeto Date para exibição ao usuário (ex: 27/10/2023).
 * *** MELHORIA APLICADA: Usa toLocaleDateString para respeitar o fuso horário local do usuário. ***
 * @param {Date} date - Objeto Date a ser formatado.
 * @returns {string} - A data formatada para a localidade do usuário.
 */
function formatDateForDisplay(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) return 'Data Inválida';
    // Converte para a string de data local do usuário, o que é mais intuitivo.
    return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

/**
 * Formata um objeto Date para o formato ISO (YYYY-MM-DD) para uso em inputs <input type="date">.
 * *** MELHORIA APLICADA: Usa métodos UTC para manter consistência com a lógica do back-end. ***
 * @param {Date} date - Objeto Date a ser formatado.
 * @returns {string} - A data no formato YYYY-MM-DD.
 */
function formatDateToISO(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
        const today = new Date();
        const year = today.getUTCFullYear();
        const month = String(today.getUTCMonth() + 1).padStart(2, '0');
        const day = String(today.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
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
        const sanitizedText = (obs.text || '').replace(/</g, "&lt;").replace(/>/g, "&gt;");
        html += `<p class="observation-item"><strong>${formatDateForDisplay(obs.date)}:</strong> ${sanitizedText}</p>`;
    });
    return html + `</div>`;
}

// --- Funções de Renderização de Listas de Alvos ---

/**
 * --- MODIFICADO ---
 * Renderiza os alvos prioritários, agora incluindo a lista de observações.
 */
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

    const completedTodayIds = new Set((dailyTargetsData.completed || []).map(t => t.id));

    priorityTargets.forEach(target => {
        const div = document.createElement("div");
        div.className = "target priority-target-item";
        div.dataset.targetId = target.id;

        const hasBeenPrayedToday = completedTodayIds.has(target.id);
        const buttonText = hasBeenPrayedToday ? '✓ Orado!' : 'Orei!';
        const buttonClass = `btn pray-button ${hasBeenPrayedToday ? 'prayed' : ''}`;
        const buttonDisabled = hasBeenPrayedToday ? 'disabled' : '';

        const categoryTag = target.category ? `<span class="category-tag">${target.category}</span>` : '';
        const deadlineTag = target.hasDeadline && target.deadlineDate ? `<span class="deadline-tag ${isDateExpired(target.deadlineDate) ? 'expired' : ''}">Prazo: ${formatDateForDisplay(target.deadlineDate)}</span>` : '';
        
        div.innerHTML = `
            <h3>${categoryTag} ${deadlineTag} ${target.title || 'Sem Título'}</h3>
            <p class="target-details">${target.details || 'Sem Detalhes'}</p>
            <p><strong>Criado há:</strong> ${timeElapsed(target.date)}</p>
            ${createObservationsHTML(target.observations)} 
            <div class="priority-target-actions">
                 <button class="${buttonClass}" data-action="pray-priority" data-id="${target.id}" ${buttonDisabled}>${buttonText}</button>
            </div>
        `;
        container.appendChild(div);
    });
}


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
            
            const priorityButtonClass = `btn toggle-priority ${target.isPriority ? 'is-priority' : ''}`;
            const priorityButtonText = target.isPriority ? 'Remover Prioridade' : 'Marcar Prioridade';

            div.innerHTML = `
                <h3>${categoryTag} ${deadlineTag} ${target.title || 'Sem Título'}</h3>
                <p class="target-details">${target.details || 'Sem Detalhes'}</p>
                <p><strong>Data Criação:</strong> ${formatDateForDisplay(target.date)}</p>
                <p><strong>Tempo Decorrido:</strong> ${timeElapsed(target.date)}</p>
                ${createObservationsHTML(target.observations)}
                <div class="target-actions">
                    <button class="btn resolved" data-action="resolve" data-id="${target.id}">Respondido</button>
                    <button class="btn archive" data-action="archive" data-id="${target.id}">Arquivar</button>
                    <button class="${priorityButtonClass}" data-action="toggle-priority" data-id="${target.id}">${priorityButtonText}</button>
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
                    <button class="btn download" data-action="download-archived" data-id="${target.id}">Download (.txt)</button>
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

            const categoryTag = target.category ? `<span class="category-tag">${target.category}</span>` : '';
            const deadlineTag = target.hasDeadline && target.deadlineDate ? `<span class="deadline-tag ${isDateExpired(target.deadlineDate) ? 'expired' : ''}">Prazo: ${formatDateForDisplay(target.deadlineDate)}</span>` : '';

            div.innerHTML = `
                <h3>${categoryTag} ${deadlineTag} ${target.title}</h3>
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
    });

    if (recordDays > 0 && consecutiveDays >= recordDays) {
        if (crownIcon) crownIcon.classList.add('achieved');
    }

    Object.keys(MILESTONES).forEach(key => {
        const icon = document.querySelector(`.milestone-icon[data-milestone="${key}"]`);
        if (icon && consecutiveDays >= MILESTONES[key]) {
            icon.classList.add('achieved');
        }
    });
    
    if (starContainer) {
        starContainer.innerHTML = '';
        if (consecutiveDays >= MILESTONES.star) {
            const numStars = Math.floor(consecutiveDays / MILESTONES.star);
            for (let i = 0; i < numStars && i < 3; i++) { // Limita a 3 estrelas para não poluir
                const star = document.createElement('span');
                star.className = 'milestone-icon achieved';
                star.dataset.milestone = 'star';
                star.innerHTML = '⭐';
                starContainer.appendChild(star);
            }
        }
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

// --- Funções de UI de Painéis, Formulários e Modais ---

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
        // Quando o painel diário é exibido, o de prioridade também deve tentar ser exibido.
        // A função `renderPriorityTargets` cuidará de escondê-lo ou mostrar a mensagem de vazio.
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
        const currentDateValue = formatDateToISO(currentDeadline);
        formDiv.innerHTML = `
            <label for="deadlineInput-${targetId}">Novo Prazo:</label>
            <input type="date" id="deadlineInput-${targetId}" value="${currentDateValue}" style="width: 95%;">
            <button class="btn save-deadline-btn" data-action="save-deadline" data-id="${targetId}">Salvar Prazo</button>
            <button class="btn cancel-deadline-btn" onclick="document.getElementById('editDeadlineForm-${targetId}').style.display='none';">Cancelar</button>
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
    const MILESTONES = [
        { name: "Semente da Perseverança", days: 7, icon: "🌱" },
        { name: "Chama da Devoção", days: 15, icon: "🔥" },
        { name: "Estrela da Fidelidade", days: 30, icon: "⭐" },
        { name: "Árvore da Constância", days: 100, icon: "🌳" },
        { name: "Diamante da Oração", days: 365, icon: "💎" },
        { name: "Sol da Eternidade", days: 1000, icon: "☀️" },
    ];

    let milestonesHTML = '';
    if (data.consecutiveDays > 0) {
        MILESTONES.forEach(milestone => {
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