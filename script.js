// ==== INÍCIO SEÇÃO - VARIÁVEIS GLOBAIS ====
let prayerTargets = [];
let archivedTargets = [];
let resolvedTargets = [];
let localStorageKeyPrefix = '';
let lastDisplayedTargets = [];
let currentPage = 1;
let currentArchivedPage = 1;
let currentResolvedPage = 1;
const targetsPerPage = 10;
let currentSearchTermMain = '';
let currentSearchTermArchived = '';
let currentSearchTermResolved = '';
// ==== FIM SEÇÃO - VARIÁVEIS GLOBAIS ====

// ==== INÍCIO SEÇÃO - FUNÇÕES UTILITÁRIAS ====
// Função para formatar data para o formato ISO (YYYY-MM-DD)
function formatDateToISO(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Função para formatar data para exibição (DD/MM/YYYY)
function formatDateForDisplay(dateString) {
    if (!dateString || dateString.includes('NaN')) return 'Data Inválida';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Data Inválida';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

// Função para calcular o tempo decorrido
function timeElapsed(date) {
    const now = new Date();
    const targetDate = new Date(date);
    const elapsed = now - targetDate;

    const days = Math.floor(elapsed / (1000 * 60 * 60 * 24));

    if (days < 7) {
        return `${days} dia(s)`;
    }
    const weeks = Math.floor(days / 7);
    return `${weeks} semana(s)`;
}
// ==== FIM SEÇÃO - FUNÇÕES UTILITÁRIAS ====

// ==== INÍCIO SEÇÃO - INICIALIZAÇÃO E LOGIN ====
// Função para definir o login e carregar os dados correspondentes
function setLogin(login) {
    localStorage.setItem('currentLogin', login);
    loadData();
}

// Função para carregar os dados correspondentes ao login atual
function loadData() {
    const login = localStorage.getItem('currentLogin');
    if (!login) {
        alert("Por favor, defina um login.");
        return;
    }

    // Atualizar o login global
    localStorageKeyPrefix = login + '_';

    // Carregar os dados do localStorage
    prayerTargets = JSON.parse(localStorage.getItem(localStorageKeyPrefix + "prayerTargets")) || [];
    archivedTargets = JSON.parse(localStorage.getItem(localStorageKeyPrefix + "archivedTargets")) || [];
    resolvedTargets = archivedTargets.filter(target => target.resolved);

    // Renderizar os dados
    renderArchivedTargets();
    renderResolvedTargets();
    refreshDailyTargets();

    // Mostrar as seções principais
    document.querySelector('.daily-section').style.display = 'block';
    document.querySelector('.form-section').style.display = 'block';
    document.querySelector('.daily-buttons-container').style.display = 'flex';
    document.getElementById('mainPanel').style.display = 'none';
}

// Inicializar o login e carregar os dados ao carregar a página
window.onload = function () {
    const savedLogin = localStorage.getItem('currentLogin');
    if (savedLogin) {
        document.getElementById('loginInput').value = savedLogin;
        loadData();
    }
    document.getElementById('searchMain').addEventListener('input', handleSearchMain);
    document.getElementById('searchArchived').addEventListener('input', handleSearchArchived);
    document.getElementById('searchResolved').addEventListener('input', handleSearchResolved);
     document.getElementById('viewAllTargetsButton').addEventListener('click', () => {
        toggleSection('mainPanel');
    });
};
// ==== FIM SEÇÃO - INICIALIZAÇÃO E LOGIN ====

// ==== INÍCIO SEÇÃO - FUNÇÕES DE RENDERIZAÇÃO ====
// Renderizar alvos principais
function renderTargets() {
    const targetList = document.getElementById("targetList");
    targetList.innerHTML = "";
    const filteredTargets = filterTargets(prayerTargets, currentSearchTermMain);
    const startIndex = (currentPage - 1) * targetsPerPage;
    const endIndex = startIndex + targetsPerPage;
    const targetsToDisplay = filteredTargets.slice(startIndex, endIndex);

    targetsToDisplay.forEach((target, index) => {
        const formattedDate = formatDateForDisplay(target.date);
        const targetDiv = document.createElement("div");
        targetDiv.classList.add("target");
        targetDiv.innerHTML = `
            <h3>${target.title}</h3>
            <p>${target.details}</p>
            <p><strong>Data:</strong> ${formattedDate}</p>
            <p><strong>Tempo Decorrido:</strong> ${timeElapsed(target.date)}</p>
            <p><strong>Status:</strong> Pendente</p>
            <button onclick="markAsResolved(${index + startIndex})" class="btn resolved">Marcar como Respondido</button>
            <button onclick="archiveTarget(${index + startIndex})" class="btn archive">Arquivar</button>
            <button onclick="toggleAddObservation(${index + startIndex})" class="btn add-observation">Adicionar Observação</button>
            <div class="add-observation-form" style="display: none;">
                <textarea placeholder="Escreva aqui a nova observação"></textarea>
                <input type="date" >
                <button onclick="saveObservation(${index + startIndex})" class="btn">Salvar Observação</button>
            </div>
            <div class="observations-list">
                ${renderObservations(target.observations)}
            </div>
        `;
        targetList.appendChild(targetDiv);
    });
    renderPagination('mainPanel', currentPage, filteredTargets);
}

// Renderizar alvos arquivados
function renderArchivedTargets() {
    const archivedList = document.getElementById("archivedList");
    archivedList.innerHTML = "";
    const filteredTargets = filterTargets(archivedTargets, currentSearchTermArchived);
    const startIndex = (currentArchivedPage - 1) * targetsPerPage;
    const endIndex = startIndex + targetsPerPage;
    const targetsToDisplay = filteredTargets.slice(startIndex, endIndex);

    targetsToDisplay.forEach((target) => {
        const formattedDate = formatDateForDisplay(target.date);
        const formattedArchivedDate = formatDateForDisplay(target.archivedDate);
        const archivedDiv = document.createElement("div");
        archivedDiv.classList.add("target");
        archivedDiv.innerHTML = `
            <h3>${target.title}</h3>
            <p>${target.details}</p>
            <p><strong>Data Original:</strong> ${formattedDate}</p>
             <p><strong>Tempo Decorrido:</strong> ${timeElapsed(target.date)}</p>
             <p><strong>Status:</strong> ${target.resolved ? "Respondido" : "Arquivado"}</p>
             <p><strong>Data de Arquivo:</strong> ${formattedArchivedDate}</p>
        `;
        archivedList.appendChild(archivedDiv);
    });
    renderPagination('archivedPanel', currentArchivedPage, filteredTargets);
}

// Renderizar alvos respondidos
function renderResolvedTargets() {
    const resolvedList = document.getElementById("resolvedList");
    resolvedList.innerHTML = "";
    const filteredTargets = filterTargets(resolvedTargets, currentSearchTermResolved);
    const startIndex = (currentResolvedPage - 1) * targetsPerPage;
    const endIndex = startIndex + targetsPerPage;
    const targetsToDisplay = filteredTargets.slice(startIndex, endIndex);

    targetsToDisplay.forEach((target) => {
        const formattedDate = formatDateForDisplay(target.date);
        const resolvedDate = formatDateForDisplay(target.archivedDate);
        const resolvedDiv = document.createElement("div");
        resolvedDiv.classList.add("target", "resolved");
        resolvedDiv.innerHTML = `
            <h3>${target.title}</h3>
            <p>${target.details}</p>
            <p><strong>Data Original:</strong> ${formattedDate}</p>
             <p><strong>Tempo Decorrido:</strong> ${timeElapsed(target.date)}</p>
            <p><strong>Status:</strong> Respondido</p>
            <p><strong>Data de Resolução:</strong> ${resolvedDate}</p>
        `;
        resolvedList.appendChild(resolvedDiv);
    });
    renderPagination('resolvedPanel', currentResolvedPage, filteredTargets);
}

// Função para renderizar a paginação
function renderPagination(panelId, page, targets) {
    const totalPages = Math.ceil(targets.length / targetsPerPage);
    let paginationDiv = document.getElementById("pagination-" + panelId);
    if (!paginationDiv) {
        paginationDiv = document.createElement("div");
        paginationDiv.id = "pagination-" + panelId;
        document.getElementById(panelId).appendChild(paginationDiv);
    }
    paginationDiv.innerHTML = ""; // Limpa a paginação anterior

    if (totalPages <= 1) {
        paginationDiv.style.display = 'none';
        return;
    }
    paginationDiv.style.display = 'flex';
    paginationDiv.style.justifyContent = 'center';
    paginationDiv.style.margin = '10px 0';

    for (let i = 1; i <= totalPages; i++) {
        const pageLink = document.createElement("a");
        pageLink.href = "#";
        pageLink.textContent = i;
        pageLink.classList.add("page-link");
        if (i === page) {
            pageLink.classList.add('active');
        }
        pageLink.addEventListener("click", (event) => {
            event.preventDefault();
            if (panelId === 'mainPanel') {
                currentPage = i;
                renderTargets();
            } else if (panelId === 'archivedPanel') {
                currentArchivedPage = i;
                renderArchivedTargets();
            } else if (panelId === 'resolvedPanel') {
                currentResolvedPage = i;
                renderResolvedTargets();
            }

        });
        paginationDiv.appendChild(pageLink);
    }
}

// Renderizar as observações de um alvo
function renderObservations(observations) {
    if (!observations || observations.length === 0) return '';

    let observationsHTML = '<h4>Observações:</h4>';
    observations.forEach(obs => {
        observationsHTML += `<p><strong>${formatDateForDisplay(obs.date)}:</strong> ${obs.observation}</p>`;
    });
    return observationsHTML;
}

// Alternar a exibição do formulário de adição de observação
function toggleAddObservation(index) {
    const formIndex = index - (currentPage -1) * targetsPerPage;
    const form = document.getElementsByClassName('add-observation-form')[formIndex];
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

// Salvar a observação
function saveObservation(index) {
    const targetIndex = index;
    const formIndex = index - (currentPage -1) * targetsPerPage;
    const form = document.getElementsByClassName('add-observation-form')[formIndex];
    const textarea = form.querySelector('textarea');
    const dateInput = form.querySelector('input[type="date"]');
    const observationText = textarea.value.trim();
    const observationDateValue = dateInput.value;

    if (observationText !== "") {
        let observationDate;
        if (observationDateValue) {
            observationDate = observationDateValue;
        } else {
            observationDate = formatDateToISO(new Date());
        }

        const newObservation = {
            date: observationDate,
            observation: observationText,
        };

        prayerTargets[targetIndex].observations.push(newObservation);
        localStorage.setItem(localStorageKeyPrefix + "prayerTargets", JSON.stringify(prayerTargets));

        // Renderizar novamente o alvo para atualizar as observações
        renderTargets();

        // Limpar o campo de texto e a data e ocultar o formulário
        textarea.value = "";
        dateInput.value = "";
        form.style.display = "none";

    } else {
        alert("Por favor, insira o texto da observação.");
    }
}
// ==== FIM SEÇÃO - FUNÇÕES DE RENDERIZAÇÃO ====

// ==== INÍCIO SEÇÃO - MANIPULAÇÃO DE DADOS ====
// Adicionar alvo
const form = document.getElementById("prayerForm");
form.addEventListener("submit", (e) => {
    e.preventDefault();
    const newTarget = {
        title: document.getElementById("title").value,
        details: document.getElementById("details").value,
        date: formatDateToISO(new Date(document.getElementById("date").value)),
        resolved: false,
        observations: []
    };
    prayerTargets.push(newTarget);
    localStorage.setItem(localStorageKeyPrefix + "prayerTargets", JSON.stringify(prayerTargets));
    currentPage = 1;
    renderTargets();
    form.reset();
    refreshDailyTargets();
});

// Marcar como Respondido
function markAsResolved(index) {
    const formattedDate = formatDateToISO(new Date());
    prayerTargets[index].resolved = true;
    prayerTargets[index].archivedDate = formattedDate;
    archivedTargets.push(prayerTargets[index]);
    resolvedTargets.push(prayerTargets[index]);
    prayerTargets.splice(index, 1);
    updateStorage();
    currentPage = 1;
    renderTargets();
    refreshDailyTargets();
}

// Arquivar Alvo
function archiveTarget(index) {
    const formattedDate = formatDateToISO(new Date());
    prayerTargets[index].archivedDate = formattedDate;
    archivedTargets.push(prayerTargets[index]);
    prayerTargets.splice(index, 1);
    updateStorage();
    currentPage = 1;
    renderTargets();
    refreshDailyTargets();
}

// Atualizar LocalStorage
function updateStorage() {
    localStorage.setItem(localStorageKeyPrefix + "prayerTargets", JSON.stringify(prayerTargets));
    localStorage.setItem(localStorageKeyPrefix + "archivedTargets", JSON.stringify(archivedTargets));
    resolvedTargets = archivedTargets.filter(target => target.resolved);
}

// Exportar dados para arquivo JSON
function exportData() {
    const login = localStorage.getItem('currentLogin');
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const filename = `${login}_${year}${month}${day}.json`;

    const data = { login: localStorage.getItem('currentLogin'), prayerTargets, archivedTargets };
    const dataStr = JSON.stringify(data, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// Importar dados de arquivo JSON
function importData(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const importedData = JSON.parse(e.target.result);
            const importedLogin = importedData.login;
            const newPrayerTargets = importedData.prayerTargets || [];
            const newArchivedTargets = importedData.archivedTargets || [];

            const currentLogin = localStorage.getItem('currentLogin');

            if (importedLogin !== currentLogin) {
                if (!confirm(`O login do arquivo importado (${importedLogin}) não corresponde ao login atual (${currentLogin}). Deseja continuar?`)) {
                    return;
                }
            }

            const allTargets = [...prayerTargets, ...archivedTargets];

            const isDuplicate = (target) => allTargets.some(item => item.title === target.title && item.date === target.date);

            newPrayerTargets.forEach(target => {
                if (!isDuplicate(target)) {
                    prayerTargets.push(target);
                }
            });

            newArchivedTargets.forEach(target => {
                if (!isDuplicate(target)) {
                    archivedTargets.push(target);
                }
            });

            updateStorage();
            renderTargets();
            renderArchivedTargets();
            renderResolvedTargets();
            refreshDailyTargets();
        } catch (error) {
            alert("Erro ao importar dados. Certifique-se de que é um arquivo válido.");
        }
    };
    reader.readAsText(file);
}

// Resetar todos os dados
function resetData() {
    if (confirm("Tem certeza de que deseja resetar todos os alvos? Esta ação não pode ser desfeita.")) {
        if (confirm("Você gostaria de exportar os alvos antes de resetar?")) {
            exportData();
        }

        prayerTargets = [];
        archivedTargets = [];
        resolvedTargets = [];
        updateStorage();
        renderTargets();
        renderArchivedTargets();
        renderResolvedTargets();
        refreshDailyTargets();
        alert("Todos os alvos foram resetados.");
    }
}
// ==== FIM SEÇÃO - MANIPULAÇÃO DE DADOS ====
