// ui.js
// Responsável por toda a manipulação do DOM e renderização da interface.

// --- IMPORTAÇÕES (Exemplo de como seria) ---
// import { formatDateForDisplay, timeElapsed, isDateExpired, formatDateToISO } from './utils.js';
// import { getPrayerTargets, getArchivedTargets, getResolvedTargets } from './state.js';
// import { predefinedCategories } from './config.js'; // Categorias podem ir para um arquivo de configuração

// ==== Funções Utilitárias de UI (usadas internamente) ====

/**
 * Cria o HTML para a lista de observações de um alvo.
 * @param {Array} observations - Array de objetos de observação.
 * @returns {string} - O bloco HTML das observações.
 */
function createObservationsHTML(observations) {
    if (!Array.isArray(observations) || observations.length === 0) {
        return '<div class="observations"></div>';
    }

    // Garante a ordenação mais recente primeiro
    const sortedObservations = [...observations].sort((a, b) => (b.date ? b.date.getTime() : 0) - (a.date ? a.date.getTime() : 0));

    let observationsHTML = `<div class="observations">`;
    sortedObservations.forEach(obs => {
        if (!obs || !obs.date) return;
        // Assume que formatDateForDisplay viria de utils.js
        const formattedDate = obs.date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const text = obs.text || '(Observação vazia)';
        // Sanitiza o texto para evitar injeção de HTML
        const sanitizedText = text.replace(/</g, "<").replace(/>/g, ">");
        observationsHTML += `<p class="observation-item"><strong>${formattedDate}:</strong> ${sanitizedText}</p>`;
    });
    observationsHTML += `</div>`;
    return observationsHTML;
}

// ==== RENDERIZAÇÃO DE LISTAS DE ALVOS ====

/**
 * Renderiza a lista de alvos de oração ativos no painel principal.
 * @param {Array} targetsToDisplay - Array de alvos a serem exibidos na página atual.
 * @param {number} totalFilteredTargets - Total de alvos após a filtragem, para paginação.
 * @param {number} currentPage - A página atual.
 * @param {number} targetsPerPage - Itens por página.
 */
export function renderTargets(targetsToDisplay, totalFilteredTargets, currentPage, targetsPerPage) {
    console.log(`[UI] Renderizando ${targetsToDisplay.length} alvos ativos.`);
    const targetListDiv = document.getElementById('targetList');
    targetListDiv.innerHTML = '';

    if (targetsToDisplay.length === 0) {
        targetListDiv.innerHTML = '<p>Nenhum alvo de oração encontrado com os filtros atuais.</p>';
    } else {
        targetsToDisplay.forEach((target) => {
            if (!target || !target.id) {
                console.warn("[UI] Tentando renderizar um alvo inválido:", target);
                return;
            }
            const targetDiv = document.createElement("div");
            targetDiv.className = "target";
            targetDiv.dataset.targetId = target.id;

            // Funções de formatação viriam de utils.js
            const formattedDate = target.date.toLocaleDateString('pt-BR');
            const elapsed = `há ${Math.floor((new Date() - target.date) / 86400000)} dias`; // Exemplo simplificado

            const categoryTag = target.category ? `<span class="category-tag">${target.category}</span>` : '';
            
            let deadlineTag = '';
            if (target.hasDeadline && target.deadlineDate) {
                const formattedDeadline = target.deadlineDate.toLocaleDateString('pt-BR');
                const isExpired = new Date() > target.deadlineDate;
                deadlineTag = `<span class="deadline-tag ${isExpired ? 'expired' : ''}">Prazo: ${formattedDeadline}</span>`;
            }

            targetDiv.innerHTML = `
                <h3>${categoryTag} ${deadlineTag} ${target.title || 'Sem Título'}</h3>
                <p class="target-details">${target.details || 'Sem Detalhes'}</p>
                <p><strong>Data Criação:</strong> ${formattedDate}</p>
                <p><strong>Tempo Decorrido:</strong> ${elapsed}</p>
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
    console.log("[UI] Renderização de alvos ativos concluída.");
}


/**
 * Renderiza a lista de alvos arquivados.
 * (Estrutura similar a renderTargets, adaptada para arquivados)
 */
export function renderArchivedTargets(targetsToDisplay, totalFilteredTargets, currentPage, targetsPerPage) {
    console.log(`[UI] Renderizando ${targetsToDisplay.length} alvos arquivados.`);
    const archivedListDiv = document.getElementById('archivedList');
    archivedListDiv.innerHTML = '';
    
    // ... lógica de criação dos elementos ...
    // ... similar a renderTargets, mas com botões e informações de arquivamento ...

    renderPagination('archivedPanel', currentPage, totalFilteredTargets, targetsPerPage);
    console.log("[UI] Renderização de alvos arquivados concluída.");
}

/**
 * Renderiza a lista de alvos respondidos.
 * (Estrutura similar a renderTargets, adaptada para respondidos)
 */
export function renderResolvedTargets(targetsToDisplay, totalFilteredTargets, currentPage, targetsPerPage) {
    console.log(`[UI] Renderizando ${targetsToDisplay.length} alvos respondidos.`);
    const resolvedListDiv = document.getElementById('resolvedList');
    resolvedListDiv.innerHTML = '';

    // ... lógica de criação dos elementos ...
    // ... similar a renderTargets, mas com informações de resolução ...

    renderPagination('resolvedPanel', currentPage, totalFilteredTargets, targetsPerPage);
    console.log("[UI] Renderização de alvos respondidos concluída.");
}

/**
 * Renderiza a lista de alvos do dia.
 * @param {Array} pendingTargets - Alvos pendentes.
 * @param {Array} completedTargets - Alvos já orados no dia.
 */
export function renderDailyTargets(pendingTargets, completedTargets) {
    console.log(`[UI] Renderizando alvos do dia: ${pendingTargets.length} pendentes, ${completedTargets.length} concluídos.`);
    const dailyTargetsDiv = document.getElementById("dailyTargets");
    dailyTargetsDiv.innerHTML = '';

    // ... lógica de criação dos elementos para pendentes e concluídos ...
    // Exibe mensagem de parabéns se todos estiverem concluídos.

    if (pendingTargets.length === 0 && completedTargets.length > 0) {
        displayCompletionPopup();
    }
    console.log("[UI] Renderização de alvos do dia concluída.");
}


// ==== RENDERIZAÇÃO DE COMPONENTES DE UI ====

/**
 * Renderiza os controles de paginação para um painel.
 * @param {string} panelId - ID do painel (ex: 'mainPanel').
 * @param {number} currentPage - A página atual.
 * @param {number} totalItems - Total de itens a serem paginados.
 * @param {number} itemsPerPage - Itens por página.
 */
export function renderPagination(panelId, currentPage, totalItems, itemsPerPage) {
    const paginationDiv = document.getElementById(`pagination-${panelId}`);
    if (!paginationDiv) return;
    paginationDiv.innerHTML = '';
    const totalPages = Math.ceil(totalItems / itemsPerPage);

    if (totalPages <= 1) {
        paginationDiv.style.display = 'none';
        return;
    }
    paginationDiv.style.display = 'flex';

    // Criação dos links "Anterior" e "Próximo"
    // (O listener de clique será adicionado no app.js)
    paginationDiv.innerHTML = `
        <a href="#" class="page-link ${currentPage <= 1 ? 'disabled' : ''}" data-page="${currentPage - 1}" data-panel="${panelId}">« Anterior</a>
        <span>Página ${currentPage} de ${totalPages}</span>
        <a href="#" class="page-link ${currentPage >= totalPages ? 'disabled' : ''}" data-page="${currentPage + 1}" data-panel="${panelId}">Próxima »</a>
    `;
}

/**
 * Atualiza a UI da barra de progresso de perseverança.
 * @param {object} perseveranceData - Objeto com { consecutiveDays, recordDays }.
 * @param {boolean} isNewRecord - Flag para ativar animação de novo recorde.
 */
export function updatePerseveranceUI(perseveranceData, isNewRecord = false) {
    const { consecutiveDays = 0, recordDays = 0 } = perseveranceData;
    console.log(`[UI] Atualizando barra de perseverança: ${consecutiveDays} dias, recorde ${recordDays}. Novo recorde: ${isNewRecord}`);
    
    // ... Lógica para calcular porcentagem e atualizar o width da barra ...
    const progressBarFill = document.getElementById('perseveranceProgressBar');
    // ...
    if (isNewRecord) {
        progressBarFill.classList.add('new-record-animation');
        setTimeout(() => progressBarFill.classList.remove('new-record-animation'), 2000);
    }

    updateMilestoneMarkers(consecutiveDays, recordDays);
}

/**
 * Atualiza os ícones de marco (milestones) de perseverança.
 * @param {number} currentDays - Dias consecutivos atuais.
 * @param {number} recordDays - Recorde de dias.
 */
function updateMilestoneMarkers(currentDays, recordDays) {
    // ... Lógica para mostrar/esconder e ativar os ícones 👑🌱🔥⭐🌳💎☀️ ...
}


/**
 * Atualiza a UI do gráfico de interações semanais.
 * @param {object} weeklyData - Objeto com dados da semana.
 */
export function updateWeeklyChart(weeklyData) {
    console.log("[UI] Atualizando gráfico semanal.");
    // ... Lógica para percorrer os dias da semana e adicionar as classes 'active', 'inactive', 'current-day' ...
}


// --- MANIPULAÇÃO DE PAINÉIS E MODAIS ---

/**
 * Exibe um painel específico e esconde os outros.
 * @param {string} panelIdToShow - O ID do painel a ser exibido.
 */
export function showPanel(panelIdToShow) {
    console.log(`[UI] Exibindo painel: ${panelIdToShow}`);
    const allPanels = ['appContent', 'dailySection', 'mainPanel', 'archivedPanel', 'resolvedPanel'];
    const dailyRelatedElements = ['weeklyPerseveranceChart', 'perseveranceSection', 'sectionSeparator'];

    allPanels.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    dailyRelatedElements.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    const panelToShowElement = document.getElementById(panelIdToShow);
    if (panelToShowElement) {
        panelToShowElement.style.display = 'block';
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
 * @param {string} targetId - O ID do alvo.
 */
export function toggleAddObservation(targetId) {
    console.log(`[UI] Alternando formulário de observação para o alvo: ${targetId}`);
    const formDiv = document.getElementById(`observationForm-${targetId}`);
    if (!formDiv) return;
    const isVisible = formDiv.style.display === 'block';

    // Esconde outros formulários para evitar sobreposição
    document.getElementById(`editDeadlineForm-${targetId}`).style.display = 'none';
    document.getElementById(`editCategoryForm-${targetId}`).style.display = 'none';

    formDiv.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) {
        // Assume que formatDateToISO vem de utils.js
        // formDiv.querySelector(`#observationDate-${targetId}`).value = formatDateToISO(new Date());
        formDiv.querySelector('textarea')?.focus();
    }
}


/**
 * Exibe o popup de conclusão de alvos do dia.
 */
export function displayCompletionPopup() {
    console.log('[UI] Exibindo popup de conclusão.');
    const popup = document.getElementById('completionPopup');
    const verses = [/* Array de versículos */]; // Idealmente viria de um config.js
    if (popup) {
        popup.style.display = 'flex';
        const popupVerseElement = popup.querySelector('#popupVerse');
        if (popupVerseElement) {
            const randomIndex = Math.floor(Math.random() * verses.length);
            popupVerseElement.textContent = verses[randomIndex] || "Parabéns!";
        }
    }
}

/**
 * Atualiza a UI de autenticação (formulário de login vs. status logado).
 * @param {object|null} user - O objeto de usuário do Firebase ou null.
 */
export function updateAuthUI(user) {
    const authStatus = document.getElementById('authStatus');
    const btnLogout = document.getElementById('btnLogout');
    const emailPasswordAuthForm = document.getElementById('emailPasswordAuthForm');
    const authStatusContainer = document.querySelector('.auth-status-container');

    if (user) {
        console.log(`[UI] Atualizando UI para usuário logado: ${user.email}`);
        authStatusContainer.style.display = 'flex';
        btnLogout.style.display = 'inline-block';
        emailPasswordAuthForm.style.display = 'none';
        let providerType = user.providerData[0]?.providerId === 'password' ? 'E-mail/Senha' : 'Google';
        authStatus.textContent = `Autenticado: ${user.email} (via ${providerType})`;
    } else {
        console.log("[UI] Atualizando UI para estado de deslogado.");
        authStatusContainer.style.display = 'none';
        btnLogout.style.display = 'none';
        emailPasswordAuthForm.style.display = 'block';
        document.getElementById('passwordResetMessage').style.display = 'none';
    }
}

// Poderíamos continuar com todas as outras funções de manipulação de UI,
// como renderizar os formulários de edição, modais, etc.
// A estrutura seria a mesma: exportar a função e manter a lógica de DOM contida aqui.
