// --- START OF FILE ui.js ---

import * as State from './state.js';
import * as Utils from './utils.js';

// --- MAIN RENDER FUNCTIONS ---
export function renderTargets() {
    const targetListDiv = document.getElementById('targetList');
    targetListDiv.innerHTML = '';
    let filteredAndPagedTargets = [...State.prayerTargets];

    if (State.currentSearchTermMain) filteredAndPagedTargets = filterTargets(filteredAndPagedTargets, State.currentSearchTermMain);
    if (State.showDeadlineOnly) filteredAndPagedTargets = filteredAndPagedTargets.filter(target => target.hasDeadline && target.deadlineDate);
    if (document.getElementById('showExpiredOnlyMain')?.checked) filteredAndPagedTargets = filteredAndPagedTargets.filter(target => target.hasDeadline && target.deadlineDate && Utils.isDateExpired(target.deadlineDate));

    // Sorting logic remains here as it's a presentation concern
    if (State.showDeadlineOnly || document.getElementById('showExpiredOnlyMain')?.checked) {
        filteredAndPagedTargets.sort((a, b) => (a.deadlineDate?.getTime() || Infinity) - (b.deadlineDate?.getTime() || Infinity));
    } else {
        filteredAndPagedTargets.sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
    }

    const startIndex = (State.currentPage - 1) * State.targetsPerPage;
    const targetsToDisplay = filteredAndPagedTargets.slice(startIndex, startIndex + State.targetsPerPage);
    State.setLastDisplayedTargets(targetsToDisplay);

    if (targetsToDisplay.length === 0) {
        targetListDiv.innerHTML = '<p>Nenhum alvo de oração encontrado com os filtros atuais.</p>';
    } else {
        targetsToDisplay.forEach(target => {
            if (!target || !target.id) return;
            targetListDiv.appendChild(createTargetElement(target, 'main'));
        });
    }
    renderPagination('mainPanel', State.currentPage, filteredAndPagedTargets.length, State.setCurrentPage, renderTargets);
}

export function renderArchivedTargets() {
    const archivedListDiv = document.getElementById('archivedList');
    archivedListDiv.innerHTML = '';
    let filteredTargets = [...State.archivedTargets];

    if (State.currentSearchTermArchived) {
        filteredTargets = filterTargets(filteredTargets, State.currentSearchTermArchived);
    }
    
    const startIndex = (State.currentArchivedPage - 1) * State.targetsPerPage;
    const targetsToDisplay = filteredTargets.slice(startIndex, startIndex + State.targetsPerPage);

    if (targetsToDisplay.length === 0) {
        archivedListDiv.innerHTML = '<p>Nenhum alvo arquivado encontrado.</p>';
    } else {
        targetsToDisplay.forEach(target => {
            if (!target || !target.id) return;
            archivedListDiv.appendChild(createTargetElement(target, 'archived'));
        });
    }
    renderPagination('archivedPanel', State.currentArchivedPage, filteredTargets.length, State.setCurrentArchivedPage, renderArchivedTargets);
}

export function renderResolvedTargets() {
    const resolvedListDiv = document.getElementById('resolvedList');
    resolvedListDiv.innerHTML = '';
    let filteredTargets = [...State.resolvedTargets];

    if (State.currentSearchTermResolved) {
        filteredTargets = filterTargets(filteredTargets, State.currentSearchTermResolved);
    }

    filteredTargets.sort((a, b) => (b.resolutionDate?.getTime() || 0) - (a.resolutionDate?.getTime() || 0));

    const startIndex = (State.currentResolvedPage - 1) * State.targetsPerPage;
    const targetsToDisplay = filteredTargets.slice(startIndex, startIndex + State.targetsPerPage);

    if (targetsToDisplay.length === 0) {
        resolvedListDiv.innerHTML = '<p>Nenhum alvo respondido encontrado.</p>';
    } else {
        targetsToDisplay.forEach(target => {
            if (!target || !target.id) return;
            resolvedListDiv.appendChild(createTargetElement(target, 'resolved'));
        });
    }
    renderPagination('resolvedPanel', State.currentResolvedPage, filteredTargets.length, State.setCurrentResolvedPage, renderResolvedTargets);
}


// --- UI HELPERS & ELEMENT CREATORS ---
function createTargetElement(target, context) { // context can be 'main', 'archived', 'resolved', 'daily'
    const targetDiv = document.createElement("div");
    targetDiv.classList.add("target");
    targetDiv.dataset.targetId = target.id;

    const categoryTag = target.category ? `<span class="category-tag">${target.category}</span>` : '';
    let deadlineTag = '';
    if (target.hasDeadline && target.deadlineDate) {
        const formattedDeadline = Utils.formatDateForDisplay(target.deadlineDate);
        deadlineTag = `<span class="deadline-tag ${Utils.isDateExpired(target.deadlineDate) ? 'expired' : ''}">Prazo: ${formattedDeadline}</span>`;
    }
    
    let specialTag = '';
    if (context === 'archived' || context === 'resolved') {
        if (target.resolved && target.resolutionDate) {
            specialTag = `<span class="resolved-tag">Respondido em: ${Utils.formatDateForDisplay(target.resolutionDate)}</span>`;
        }
        targetDiv.classList.add("archived");
        if (target.resolved) targetDiv.classList.add("resolved");
    }

    targetDiv.innerHTML = `
        <h3>${categoryTag} ${specialTag} ${deadlineTag} ${target.title || 'Sem Título'}</h3>
        <p class="target-details">${target.details || 'Sem Detalhes'}</p>
        <p><strong>Data Criação:</strong> ${Utils.formatDateForDisplay(target.date)}</p>
        <p><strong>Tempo Decorrido:</strong> ${Utils.timeElapsed(target.date)}</p>
        ${renderObservations(target.observations)}
        <div class="target-actions">
            ${getContextualButtons(target, context)}
        </div>
        <div id="observationForm-${target.id}" class="add-observation-form" style="display:none;"></div>
        <div id="editDeadlineForm-${target.id}" class="edit-deadline-form" style="display:none;"></div>
        <div id="editCategoryForm-${target.id}" class="edit-category-form" style="display:none;"></div>
    `;
    renderObservationForm(target.id);
    return targetDiv;
}

function getContextualButtons(target, context) {
    const commonButtons = `
        <button class="add-observation btn" onclick="window.App.toggleAddObservation('${target.id}')">Observação</button>
        <button class="edit-category btn" onclick="window.App.editCategory('${target.id}')">Editar Categoria</button>
    `;
    switch (context) {
        case 'main':
            return `
                <button class="resolved btn" onclick="window.App.markAsResolved('${target.id}')">Respondido</button>
                <button class="archive btn" onclick="window.App.archiveTarget('${target.id}')">Arquivar</button>
                ${target.hasDeadline ? `<button class="edit-deadline btn" onclick="window.App.editDeadline('${target.id}')">Editar Prazo</button>` : ''}
                ${commonButtons}
            `;
        case 'archived':
            return `
                <button class="delete btn" onclick="window.App.deleteArchivedTarget('${target.id}')">Excluir Permanentemente</button>
                ${commonButtons}
            `;
        case 'resolved':
            return commonButtons;
        default:
            return '';
    }
}

function renderObservations(observations) {
    if (!Array.isArray(observations) || observations.length === 0) return '<div class="observations"></div>';
    
    let observationsHTML = `<div class="observations">`;
    observations.forEach(obs => {
        if (!obs || !obs.date) return;
        observationsHTML += `<p class="observation-item"><strong>${Utils.formatDateForDisplay(obs.date)}:</strong> ${obs.text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`;
    });
    observationsHTML += `</div>`;
    return observationsHTML;
}

function renderPagination(panelId, currentPage, totalItems, setPageCallback, renderCallback) {
    const paginationDiv = document.getElementById(`pagination-${panelId}`);
    if (!paginationDiv) return;
    paginationDiv.innerHTML = '';
    const totalPages = Math.ceil(totalItems / State.targetsPerPage);

    if (totalPages <= 1) {
        paginationDiv.style.display = 'none';
        return;
    }
    paginationDiv.style.display = 'flex';

    const prevLink = document.createElement('a');
    prevLink.href = '#';
    prevLink.innerHTML = '« Anterior';
    prevLink.classList.add('page-link');
    if (currentPage <= 1) {
        prevLink.classList.add('disabled');
    } else {
        prevLink.addEventListener('click', (event) => {
            event.preventDefault();
            setPageCallback(currentPage - 1);
            renderCallback();
            document.getElementById(panelId)?.scrollIntoView({ behavior: 'smooth' });
        });
    }
    paginationDiv.appendChild(prevLink);

    paginationDiv.appendChild(document.createElement('span')).textContent = `Página ${currentPage} de ${totalPages}`;

    const nextLink = document.createElement('a');
    nextLink.href = '#';
    nextLink.innerHTML = 'Próxima »';
    nextLink.classList.add('page-link');
    if (currentPage >= totalPages) {
        nextLink.classList.add('disabled');
    } else {
        nextLink.addEventListener('click', (event) => {
            event.preventDefault();
            setPageCallback(currentPage + 1);
            renderCallback();
            document.getElementById(panelId)?.scrollIntoView({ behavior: 'smooth' });
        });
    }
    paginationDiv.appendChild(nextLink);
}

function filterTargets(targets, searchTerm) {
    if (!searchTerm) return targets;
    const lowerSearchTerm = searchTerm.toLowerCase();
    return targets.filter(target => {
        if (!target) return false;
        return (target.title?.toLowerCase().includes(lowerSearchTerm) ||
                target.details?.toLowerCase().includes(lowerSearchTerm) ||
                target.category?.toLowerCase().includes(lowerSearchTerm) ||
                (Array.isArray(target.observations) && target.observations.some(obs => obs?.text?.toLowerCase().includes(lowerSearchTerm)))
        );
    });
}

// --- FORMS & MODALS UI ---
export function toggleAddObservation(targetId) {
    const formDiv = document.getElementById(`observationForm-${targetId}`);
    if (!formDiv) return;
    const isVisible = formDiv.style.display === 'block';

    // Hide other forms
    document.getElementById(`editDeadlineForm-${targetId}`)?.style.display = 'none';
    document.getElementById(`editCategoryForm-${targetId}`)?.style.display = 'none';

    formDiv.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) formDiv.querySelector('textarea')?.focus();
}

export function renderObservationForm(targetId) {
    const formDiv = document.getElementById(`observationForm-${targetId}`);
    if (!formDiv) return;
    formDiv.innerHTML = `
        <textarea id="observationText-${targetId}" placeholder="Nova observação..." rows="3" style="width: 95%; margin-bottom: 5px;"></textarea>
        <input type="date" id="observationDate-${targetId}" value="${Utils.formatDateToISO(new Date())}" style="width: 95%; margin-bottom: 5px;">
        <button class="btn" onclick="window.App.saveObservation('${targetId}')" style="background-color: #7cb17c;">Salvar Observação</button>
    `;
}

export function editDeadline(targetId) {
    const target = State.prayerTargets.find(t => t.id === targetId);
    if (!target) return;
    const editFormContainer = document.getElementById(`editDeadlineForm-${targetId}`);
    if (!editFormContainer) return;

    // Hide other forms
    document.getElementById(`observationForm-${targetId}`)?.style.display = 'none';
    document.getElementById(`editCategoryForm-${targetId}`)?.style.display = 'none';

    if (editFormContainer.style.display === 'block') {
        editFormContainer.style.display = 'none';
        return;
    }

    const currentDeadlineISO = target.deadlineDate ? Utils.formatDateToISO(target.deadlineDate) : '';
    editFormContainer.innerHTML = `
        <div style="background-color: #f0f0f0; padding: 10px; margin-top: 10px; border-radius: 5px; border: 1px solid #ccc;">
            <label for="editDeadlineInput-${targetId}" style="display: block; margin-bottom: 5px;">Novo Prazo (deixe em branco para remover):</label>
            <input type="date" id="editDeadlineInput-${targetId}" value="${currentDeadlineISO}" style="width: calc(100% - 22px);">
            <div style="margin-top: 10px; text-align: right;">
                 <button class="btn save-deadline-btn" onclick="window.App.saveEditedDeadline('${targetId}')">Salvar</button>
                 <button class="btn cancel-deadline-btn" onclick="window.App.cancelEditDeadline('${targetId}')">Cancelar</button>
            </div>
        </div>`;
    editFormContainer.style.display = 'block';
    editFormContainer.querySelector('input')?.focus();
}

export function cancelEditDeadline(targetId) {
    const editFormContainer = document.getElementById(`editDeadlineForm-${targetId}`);
    if (editFormContainer) editFormContainer.style.display = 'none';
}

export function editCategory(targetId) {
    const target = State.findTargetById(targetId);
    if (!target) return;
    const editFormContainer = document.getElementById(`editCategoryForm-${targetId}`);
    if (!editFormContainer) return;

    // Hide other forms
    document.getElementById(`observationForm-${targetId}`)?.style.display = 'none';
    document.getElementById(`editDeadlineForm-${targetId}`)?.style.display = 'none';
    
    if (editFormContainer.style.display === 'block') {
        editFormContainer.style.display = 'none';
        return;
    }

    let optionsHTML = '<option value="">-- Remover Categoria --</option>' +
        State.predefinedCategories.map(cat => `<option value="${cat}" ${target.category === cat ? 'selected' : ''}>${cat}</option>`).join('');

    editFormContainer.innerHTML = `
        <div style="background-color: #f0f0f0; padding: 10px; margin-top: 10px; border-radius: 5px; border: 1px solid #ccc;">
            <label for="editCategorySelect-${targetId}" style="display: block; margin-bottom: 5px;">Nova Categoria:</label>
            <select id="editCategorySelect-${targetId}" style="width: calc(100% - 22px); margin-bottom: 10px;">${optionsHTML}</select>
            <div style="margin-top: 10px; text-align: right;">
                 <button class="btn save-category-btn" onclick="window.App.saveEditedCategory('${targetId}')">Salvar</button>
                 <button class="btn cancel-category-btn" onclick="window.App.cancelEditCategory('${targetId}')">Cancelar</button>
            </div>
        </div>`;
    editFormContainer.style.display = 'block';
    editFormContainer.querySelector('select')?.focus();
}

export function cancelEditCategory(targetId) {
    const editFormContainer = document.getElementById(`editCategoryForm-${targetId}`);
    if (editFormContainer) editFormContainer.style.display = 'none';
}

export function showPanel(panelIdToShow) {
    ['appContent', 'dailySection', 'mainPanel', 'archivedPanel', 'resolvedPanel', 'weeklyPerseveranceChart', 'perseveranceSection', 'sectionSeparator'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    const panelToShowElement = document.getElementById(panelIdToShow);
    if (panelToShowElement) panelToShowElement.style.display = 'block';

    if (panelIdToShow === 'dailySection') {
        ['weeklyPerseveranceChart', 'perseveranceSection', 'sectionSeparator'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'block';
        });
    }
}

// --- DAILY TARGETS UI ---
export function renderDailyTargetsUI(dailyData) {
    const dailyTargetsDiv = document.getElementById("dailyTargets");
    dailyTargetsDiv.innerHTML = '';
    
    if (!dailyData || !Array.isArray(dailyData.targets) || dailyData.targets.length === 0) {
        dailyTargetsDiv.innerHTML = "<p>Nenhum alvo de oração selecionado para hoje.</p>";
        displayRandomVerse();
        return;
    }

    State.setCurrentDailyTargets(dailyData.targets.map(t => t.targetId));

    const pending = dailyData.targets.filter(t => !t.completed);
    const completed = dailyData.targets.filter(t => t.completed);

    const getDetails = (id) => State.prayerTargets.find(t => t.id === id);

    if (pending.length > 0) {
        pending.forEach(t => {
            const details = getDetails(t.targetId);
            if (details) dailyTargetsDiv.appendChild(createDailyTargetElement(details, false));
        });
    } else {
        dailyTargetsDiv.innerHTML = "<p>Você já orou por todos os alvos de hoje!</p>";
        displayCompletionPopup();
    }

    if (completed.length > 0) {
        if (pending.length > 0 || dailyTargetsDiv.innerHTML.includes("todos os alvos de hoje")) {
             dailyTargetsDiv.appendChild(document.createElement('hr'));
        }
        const completedTitle = document.createElement('h3');
        completedTitle.textContent = "Concluídos Hoje";
        completedTitle.style.cssText = 'color:#777; text-align:center;';
        dailyTargetsDiv.appendChild(completedTitle);
        completed.forEach(t => {
            const details = getDetails(t.targetId);
            if (details) dailyTargetsDiv.appendChild(createDailyTargetElement(details, true));
        });
    }
    displayRandomVerse();
}

function createDailyTargetElement(target, isCompleted) {
    const dailyDiv = document.createElement("div");
    dailyDiv.classList.add("target");
    if (isCompleted) dailyDiv.classList.add("completed-target");
    dailyDiv.dataset.targetId = target.id;

    const categoryTag = target.category ? `<span class="category-tag">${target.category}</span>` : '';
    let deadlineTag = '';
    if (target.hasDeadline && target.deadlineDate) {
        deadlineTag = `<span class="deadline-tag ${Utils.isDateExpired(target.deadlineDate) ? 'expired' : ''} ${isCompleted ? 'completed' : ''}">${Utils.formatDateForDisplay(target.deadlineDate)}</span>`;
    }

    dailyDiv.innerHTML = `
        <h3>${categoryTag} ${deadlineTag ? `Prazo: ${deadlineTag}` : ''} ${target.title}</h3>
        <p class="target-details">${target.details}</p>
        <p><strong>Data Criação:</strong> ${Utils.formatDateForDisplay(target.date)}</p>
        <p><strong>Tempo Decorrido:</strong> ${Utils.timeElapsed(target.date)}</p>
        ${renderObservations(target.observations)}
    `;

    if (!isCompleted) {
        const prayButton = document.createElement("button");
        prayButton.textContent = "Orei!";
        prayButton.classList.add("pray-button", "btn");
        prayButton.onclick = async () => {
            prayButton.disabled = true;
            prayButton.textContent = "Orado!";
            await window.App.handleOreiClick(target.id);
        };
        const heading = dailyDiv.querySelector('h3');
        heading.insertAdjacentElement('afterend', prayButton);
    }
    return dailyDiv;
}


// --- PERSEVERANCE UI ---
export function updatePerseveranceUI(isNewRecord = false) {
    const { consecutiveDays, recordDays } = State.perseveranceData;
    const percentage = recordDays > 0 ? Math.min((consecutiveDays / recordDays) * 100, 100) : 0;
    
    document.getElementById('perseveranceProgressBar').style.width = `${percentage}%`;
    document.getElementById('currentDaysText').textContent = consecutiveDays;
    document.getElementById('recordDaysText').textContent = recordDays;
    document.getElementById('recordCrown').classList.toggle('visible', recordDays > 0);
    
    if (isNewRecord) {
        const bar = document.getElementById('perseveranceProgressBar');
        bar.classList.add('new-record-animation');
        setTimeout(() => bar.classList.remove('new-record-animation'), 2000);
    }
    updateMilestoneMarkers(consecutiveDays);
}

function updateMilestoneMarkers(currentDays) {
    // This function's logic is primarily visual and self-contained, so it stays here.
    // ... (the original implementation of updateMilestoneMarkers can be pasted here) ...
    const iconArea = document.getElementById('milestoneIconsArea');
    if (!iconArea) return;

    const allIcons = iconArea.querySelectorAll('.milestone-icon');
    allIcons.forEach(icon => {
        icon.style.display = 'none';
        icon.classList.remove('achieved');
    });
    document.getElementById('starContainer').innerHTML = '';
    
    const crownEl = document.getElementById('recordCrown');
    if (crownEl) {
        crownEl.style.display = State.perseveranceData.recordDays > 0 ? 'inline-block' : 'none';
        crownEl.classList.toggle('visible', currentDays > 0 && currentDays === State.perseveranceData.recordDays);
    }
    
    if (currentDays === 0) return;

    let remainingDays = currentDays;
    if (remainingDays >= 1000) {
        iconArea.querySelector('[data-milestone="sun"]').style.display = 'inline-block';
        iconArea.querySelector('[data-milestone="sun"]').classList.add('achieved');
    } else if (remainingDays >= 365) {
        iconArea.querySelector('[data-milestone="diamond"]').style.display = 'inline-block';
        iconArea.querySelector('[data-milestone="diamond"]').classList.add('achieved');
        const numStars = Math.floor((remainingDays - 365) / 30);
        if (numStars > 0) document.getElementById('starContainer').innerHTML = '⭐'.repeat(numStars);
        remainingDays = (remainingDays - 365) % 30;
    } else if (remainingDays >= 100) {
        iconArea.querySelector('[data-milestone="tree"]').style.display = 'inline-block';
        iconArea.querySelector('[data-milestone="tree"]').classList.add('achieved');
        const numStars = Math.floor((remainingDays - 100) / 30);
        if (numStars > 0) document.getElementById('starContainer').innerHTML = '⭐'.repeat(numStars);
        remainingDays = (remainingDays - 100) % 30;
    } else {
        const numStars = Math.floor(remainingDays / 30);
        if (numStars > 0) document.getElementById('starContainer').innerHTML = '⭐'.repeat(numStars);
        remainingDays %= 30;
    }

    if (remainingDays >= 15) {
        iconArea.querySelector('[data-milestone="flame"]').style.display = 'inline-block';
        iconArea.querySelector('[data-milestone="flame"]').classList.add('achieved');
    } else if (remainingDays >= 7) {
        iconArea.querySelector('[data-milestone="seed"]').style.display = 'inline-block';
        iconArea.querySelector('[data-milestone="seed"]').classList.add('achieved');
    }
}

export function resetPerseveranceUI() {
    State.setPerseveranceData({ consecutiveDays: 0, lastInteractionDate: null, recordDays: 0 });
    State.setWeeklyPrayerData({ weekId: Utils.getWeekIdentifier(new Date()), interactions: {} });
    updatePerseveranceUI();
    resetWeeklyChart();
}

export function updateWeeklyChart() {
    const today = new Date();
    const todayDayOfWeek = today.getDay();
    const firstDayOfWeek = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() - todayDayOfWeek));
    const { interactions } = State.weeklyPrayerData;

    for (let i = 0; i < 7; i++) {
        const dayTick = document.getElementById(`day-${i}`);
        if (!dayTick) continue;
        
        const currentTickDate = new Date(firstDayOfWeek);
        currentTickDate.setUTCDate(firstDayOfWeek.getUTCDate() + i);
        const dateString = Utils.formatDateToISO(currentTickDate);
        
        dayTick.classList.remove('active', 'inactive', 'current-day');
        dayTick.parentElement.classList.remove('current-day-container');

        if (dateString === Utils.formatDateToISO(today)) {
            dayTick.classList.add('current-day');
            dayTick.parentElement.classList.add('current-day-container');
            if (interactions[dateString]) dayTick.classList.add('active');
        } else if (currentTickDate < today) {
            dayTick.classList.toggle('active', !!interactions[dateString]);
            dayTick.classList.toggle('inactive', !interactions[dateString]);
        }
    }
}

export function resetWeeklyChart() {
    for (let i = 0; i < 7; i++) {
        const dayTick = document.getElementById(`day-${i}`);
        if (dayTick) {
            dayTick.classList.remove('active', 'inactive', 'current-day');
            dayTick.parentElement.classList.remove('current-day-container');
        }
    }
}

// --- POPUPS & VERSES ---
export function displayRandomVerse() {
    const verses = [ "“Entrega o teu caminho ao Senhor; confia nele, e ele tudo fará.” - Salmos 37:5", /* ... outros versículos ... */ "“Clama a mim, e responder-te-ei, e anunciar-te-ei coisas grandes e ocultas, que não sabes.” - Jeremias 33:3" ];
    const verseDisplay = document.getElementById('dailyVerses');
    if (verseDisplay) verseDisplay.textContent = verses[Math.floor(Math.random() * verses.length)];
}

export function displayCompletionPopup() {
    const verses = [ "“Entrega o teu caminho ao Senhor; confia nele, e ele tudo fará.” - Salmos 37:5", /* ... outros versículos ... */ "“Clama a mim, e responder-te-ei, e anunciar-te-ei coisas grandes e ocultas, que não sabes.” - Jeremias 33:3" ];
    const popup = document.getElementById('completionPopup');
    if (popup) {
        popup.style.display = 'flex';
        popup.querySelector('#popupVerse').textContent = verses[Math.floor(Math.random() * verses.length)];
    }
}

// --- VIEW GENERATORS ---
export function generateViewHTML(targetsToInclude, pageTitle) {
    let viewHTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${pageTitle}</title><style>/* ... CSS from original file ... */</style></head><body><h1>${pageTitle}</h1>`;
    if (!Array.isArray(targetsToInclude) || targetsToInclude.length === 0) {
        viewHTML += "<p style='text-align:center;'>Nenhum alvo para exibir.</p>";
    } else {
        targetsToInclude.forEach(target => {
            if (target?.id) viewHTML += generateTargetViewHTML(target, false);
        });
    }
    viewHTML += `</body></html>`;
    const viewTab = window.open('', '_blank');
    viewTab.document.write(viewHTML);
    viewTab.document.close();
}

function generateTargetViewHTML(target, isCompletedView) {
    const completedClass = isCompletedView ? 'completed-target' : '';
    let deadlineTag = '';
    if (target.hasDeadline && target.deadlineDate) {
        const formattedDeadline = Utils.formatDateForDisplay(target.deadlineDate);
        deadlineTag = `<span class="deadline-tag ${Utils.isDateExpired(target.deadlineDate) ? 'expired' : ''}">Prazo: ${formattedDeadline}</span>`;
    }
    return `
         <div class="target ${completedClass}">
             <h3>${target.category ? `<span class="category-tag">${target.category}</span>` : ''} ${deadlineTag} ${target.title}</h3>
             <p class="target-details">${target.details}</p>
             <p><strong>Data Criação:</strong> ${Utils.formatDateForDisplay(target.date)}</p>
             <p><strong>Tempo Decorrido:</strong> ${Utils.timeElapsed(target.date)}</p>
             ${renderObservations(target.observations)}
         </div>`;
}

// ... other generate...HTML functions can be moved here similarly ...