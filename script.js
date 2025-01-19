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
    renderTargets();
    renderArchivedTargets();
    renderResolvedTargets();
    refreshDailyTargets();

    // Mostrar as seções principais
    document.querySelector('.daily-section').style.display = 'block';
    document.querySelector('.buttons').style.display = 'block';
    document.querySelector('.form-section').style.display = 'block';
    document.getElementById('mainPanel').style.display = 'block';
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
            <button onclick="openObservationModal(${index + startIndex})" class="btn update">Atualizar</button>
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

// ==== INÍCIO SEÇÃO - EVENT LISTENERS ====
document.getElementById('setLoginButton').addEventListener('click', () => {
    const login = document.getElementById('loginInput').value.trim();
    if (login) {
        setLogin(login);
    } else {
        alert("Por favor, insira um login válido.");
    }
});

const exportDataButton = document.getElementById("exportData");
exportDataButton.addEventListener("click", exportData);

const importDataInput = document.getElementById("importData");
importDataInput.addEventListener("change", (event) => {
    importData(event.target.files[0]);
});

const resetDataButton = document.getElementById("resetData");
resetDataButton.addEventListener("click", resetData);

const viewArchivedButton = document.getElementById("viewArchivedButton");
const viewResolvedButton = document.getElementById("viewResolvedButton");
const backToMainButton = document.getElementById("backToMainButton");
const mainPanel = document.getElementById("mainPanel");
const dailySection = document.getElementById("dailySection");
const archivedPanel = document.getElementById("archivedPanel");
const resolvedPanel = document.getElementById("resolvedPanel");

viewArchivedButton.addEventListener("click", () => {
    mainPanel.style.display = "none";
    dailySection.style.display = "none";
    archivedPanel.style.display = "block";
    resolvedPanel.style.display = "none";
    viewArchivedButton.style.display = "none";
    viewResolvedButton.style.display = "inline-block";
    backToMainButton.style.display = "inline-block";
    currentArchivedPage = 1;
    renderArchivedTargets();
});

viewResolvedButton.addEventListener("click", () => {
    mainPanel.style.display = "none";
    dailySection.style.display = "none";
    archivedPanel.style.display = "none";
    resolvedPanel.style.display = "block";
    viewArchivedButton.style.display = "inline-block";
    viewResolvedButton.style.display = "none";
    backToMainButton.style.display = "inline-block";
    currentResolvedPage = 1;
    renderResolvedTargets();
});

backToMainButton.addEventListener("click", () => {
    mainPanel.style.display = "block";
    dailySection.style.display = "block";
    archivedPanel.style.display = "none";
    resolvedPanel.style.display = "none";
    viewArchivedButton.style.display = "inline-block";
    viewResolvedButton.style.display = "inline-block";
    backToMainButton.style.display = "none";
    currentPage = 1;
});

const copyDailyButton = document.getElementById("copyDaily");
copyDailyButton.addEventListener("click", function () {
    const dailyTargetsElement = document.getElementById("dailyTargets");
    if (!dailyTargetsElement) {
        alert("Não foi possível encontrar os alvos diários para copiar.");
        return;
    }

    const dailyTargetsText = Array.from(dailyTargetsElement.children).map(div => {
        const title = div.querySelector('h3')?.textContent || '';
        const details = div.querySelector('p:nth-of-type(1)')?.textContent || '';
        const timeElapsed = div.querySelector('p:nth-of-type(2)')?.textContent || '';

        const observations = Array.from(div.querySelectorAll('p'))
            .slice(2)
            .map(p => p.textContent)
            .join('\n');

        let result = `${title}\n${details}\n${timeElapsed}`;
        if (observations) {
            result += `\nObservações:\n${observations}`;
        }
        return result;
    }).join('\n\n---\n\n');

    navigator.clipboard.writeText(dailyTargetsText).then(() => {
        alert('Alvos diários copiados para a área de transferência!');
    }, (err) => {
        console.error('Erro ao copiar texto: ', err);
        alert('Não foi possível copiar os alvos diários, por favor tente novamente.');
    });
});

document.getElementById('generateViewButton').addEventListener('click', generateViewHTML);
document.getElementById('viewDaily').addEventListener('click', generateDailyViewHTML);
document.getElementById("viewResolvedViewButton").addEventListener("click", () => {
    dateRangeModal.style.display = "block";
    startDateInput.value = '';
    endDateInput.value = '';
});
closeDateRangeModalButton.addEventListener("click", () => {
    dateRangeModal.style.display = "none";
});
generateResolvedViewButton.addEventListener("click", () => {
    const startDate = startDateInput.value;
    const endDate = endDateInput.value;
    const today = new Date();
    const formattedToday = formatDateToISO(today);
    const adjustedEndDate = endDate || formattedToday;

    generateResolvedViewHTML(startDate, adjustedEndDate);
    dateRangeModal.style.display = "none";
});
cancelDateRangeButton.addEventListener("click", () => {
    dateRangeModal.style.display = "none";
});
// ==== FIM SEÇÃO - EVENT LISTENERS ====

// ==== INÍCIO SEÇÃO - FUNÇÕES DO MODAL ====
let currentTargetIndex = null;

const modal = document.getElementById("observationModal");
const closeModalButton = document.getElementById("closeModal");
const saveObservationButton = document.getElementById("saveObservation");
const newObservationInput = document.getElementById("newObservation");
const observationDateInput = document.getElementById("observationDate");
const observationHistoryDiv = document.getElementById("observationHistory");

// Função para formatar a data no formato DD/MM/YYYY
function formatDateFixed(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Adicionar +1 ao mês (base zero)
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

function openObservationModal(index) {
    console.log("openObservationModal chamado com index:", index);
    currentTargetIndex = index;
    modal.style.display = "block";
    newObservationInput.value = "";
    observationDateInput.value = ""; // Limpar o campo de data
    renderObservationHistory(index);
}

closeModalButton.addEventListener("click", () => {
    console.log("closeModalButton clicado");
    modal.style.display = "none";
});

window.onclick = function (event) {
    if (event.target == modal) {
        console.log("Modal fechado clicando fora");
        modal.style.display = "none";
    }
}

saveObservationButton.addEventListener("click", () => {
    console.log("saveObservationButton clicado. currentTargetIndex:", currentTargetIndex);
    if (currentTargetIndex === null) {
        console.log("currentTargetIndex é nulo. Retornando.");
        return;
    }

    const observationText = newObservationInput.value.trim();
    const observationDateValue = observationDateInput.value; // Pegar o valor do campo de data
    console.log("Texto da observação:", observationText);
    if (observationText !== "") {
        let observationDate;
        if (observationDateValue) {
            observationDate = new Date(observationDateValue);
        } else {
            observationDate = new Date();
        }
        const formattedDate = formatDateFixed(observationDate); // Usando a função corrigida

        const newObservation = {
            date: formattedDate, // Usar a data formatada corretamente
            observation: observationText,
        };

        console.log("Nova observação:", newObservation);
        prayerTargets[currentTargetIndex].observations.push(newObservation);
        localStorage.setItem(localStorageKeyPrefix + "prayerTargets", JSON.stringify(prayerTargets));
        newObservationInput.value = "";
        observationDateInput.value = ""; // Limpar o campo de data
        renderObservationHistory(currentTargetIndex);
    } else {
        console.log("Texto da observação está vazio.");
    }
});

function renderObservationHistory(index) {
    console.log("renderObservationHistory chamado com index:", index);
    observationHistoryDiv.innerHTML = "";
    const target = prayerTargets[index];
    console.log("Target:", target);
    if (target) {
        const initialObsDiv = document.createElement("div");
        initialObsDiv.innerHTML = `<p><strong>${formatDateForDisplay(target.date)}:</strong> ${target.details}</p>`;
        observationHistoryDiv.appendChild(initialObsDiv);
        if (target.observations) {
            console.log("Observações:", target.observations);
            target.observations.forEach((obs, obsIndex) => {
                console.log("Renderizando observação", obsIndex, ":", obs);
                const obsDiv = document.createElement("div");
                obsDiv.innerHTML = `<p><strong>${formatDateForDisplay(obs.date)}:</strong> ${obs.observation}</p>`;
                observationHistoryDiv.appendChild(obsDiv);
            });
        }
    } else {
        console.log("Target é nulo ou indefinido para o index:", index);
    }
}
// ==== FIM SEÇÃO - FUNÇÕES DO MODAL ====


// ==== INÍCIO SEÇÃO - GERAÇÃO DE VISUALIZAÇÃO (HTML) ====
// Função para gerar o HTML com os alvos ativos
function generateViewHTML() {
    let htmlContent = `<!DOCTYPE html>
  <html lang="pt-BR">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Alvos de Oração</title>
      <style>
        body {
            font-family: 'Playfair Display', serif;
            margin: 10px; 
            padding: 10px;
            background-color: #f9f9f9;
            color: #333;
            font-size: 16px; 
        }
h1 {
        text-align: center;
        color: #333;
        margin-bottom: 20px;
        font-size: 2.5em;
    }
    h2 {
        color: #555;
        font-size: 1.75em;
        margin-bottom: 10px;
    }
    div {
        margin-bottom: 20px;
        padding: 15px;
        border: 1px solid #ddd;
        border-radius: 5px;
        background-color: #fff;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    p {
        margin: 5px 0; 
    }
    hr {
        margin-top: 30px;
        margin-bottom: 30px;
        border: 0;
        border-top: 1px solid #ddd;
    }
    @media (max-width: 768px) {
        body {
            font-size: 14px; 
        }
        h1 {
            font-size: 2em;
        }
        h2 {
            font-size: 1.5em;
        }
    }
</style>
  </head>
  <body>
  <h1>Alvos de Oração</h1>`;
    if (prayerTargets.length === 0) {
        htmlContent += '<p>Nenhum alvo de oração cadastrado.</p>';
    } else {
        prayerTargets.forEach(target => {
            const formattedDate = formatDateForDisplay(target.date);
            const time = timeElapsed(target.date);
            htmlContent += `
      <div>
          <h2>${target.title}</h2>
          <p>${target.details}</p>
          <p><strong>Data de Cadastro:</strong> ${formattedDate}</p>
          <p><strong>Tempo Decorrido:</strong> ${time}</p>
    `;
            if (target.observations && target.observations.length > 0) {
                htmlContent += `<h3>Observações:</h3>`;
                target.observations.forEach(obs => {
                    htmlContent += `<p><strong>${formatDateForDisplay(obs.date)}:</strong> ${obs.observation}</p>`;
                });
            }
            htmlContent += '</div><hr>';
        });
    }

    htmlContent += `</body></html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const now = new Date();
    const filename = `Alvos de oração geral até o dia ${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}.html`;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// Função para gerar o HTML com os alvos do dia
function generateDailyViewHTML() {
    let htmlContent = `<!DOCTYPE html>
  <html lang="pt-BR">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Alvos de Oração do Dia</title>
      <style>
        body {
            font-family: 'Playfair Display', serif;
            margin: 10px; 
            padding: 10px;
            background-color: #f9f9f9;
            color: #333;
            font-size: 16px; 
        }
h1 {
        text-align: center;
        color: #333;
        margin-bottom: 20px;
        font-size: 2.5em;
    }
    h2 {
        color: #555;
        font-size: 1.75em;
        margin-bottom: 10px;
    }
    div {
        margin-bottom: 20px;
        padding: 15px;
        border: 1px solid #ddd;
        border-radius: 5px;
        background-color: #fff;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    p {
        margin: 5px 0; 
    }
    hr {
        margin-top: 30px;
        margin-bottom: 30px;
        border: 0;
        border-top: 1px solid #ddd;
    }
    @media (max-width: 768px) {
        body {
            font-size: 14px; 
        }
        h1 {
            font-size: 2em;
        }
        h2 {
            font-size: 1.5em;
        }
    }
</style>
  </head>
  <body>
  <h1>Alvos de Oração do Dia</h1>`;
    const dailyTargetsElement = document.getElementById("dailyTargets");
    if (!dailyTargetsElement || dailyTargetsElement.children.length === 0) {
        htmlContent += '<p>Nenhum alvo de oração do dia disponível.</p>';
    } else {
        Array.from(dailyTargetsElement.children).forEach(div => {
            const title = div.querySelector('h3')?.textContent || '';
            const details = div.querySelector('p:nth-of-type(1)')?.textContent || '';
            const timeElapsed = div.querySelector('p:nth-of-type(2)')?.textContent || '';

            const observations = Array.from(div.querySelectorAll('h4 + p'))
                .map(p => p.textContent)
                .join('\n');

            htmlContent += `
            <div>
                <h2>${title}</h2>
                <p>${details}</p>
                <p>${timeElapsed}</p>
        `;
            if (observations) {
                htmlContent += `<h4>Observações:</h4><p>${observations}</p>`;
            }
            htmlContent += `</div><hr>`;
        });
    }

    htmlContent += `</body></html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const now = new Date();
    const filename = `Alvos de oração do dia ${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}.html`;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function generateResolvedViewHTML(startDate, endDate) {
    const filteredResolvedTargets = resolvedTargets.filter(target => {
        if (!target.resolved) return false;

        const dateParts = target.archivedDate.split('/');
        if (dateParts.length !== 3) {
            console.error("Formato de archivedDate inválido:", target.archivedDate);
            return false;
        }

        const resolvedDateObj = new Date(dateParts[2], dateParts[1] - 1, dateParts[0]);

        const startDateObj = startDate ? new Date(startDate) : null;
        const endDateObj = endDate ? new Date(endDate) : null;

        if (startDateObj && resolvedDateObj < startDateObj) return false;
        if (endDateObj) {
            endDateObj.setHours(23, 59, 59);
            if (resolvedDateObj > endDateObj) return false;
        }

        return true;
    });

    let htmlContent = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Alvos Respondidos</title>
    <style>
        body {
            font-family: 'Playfair Display', serif;
            margin: 10px;
            padding: 10px;
            background-color: #f9f9f9;
            color: #333;
            font-size: 16px;
        }
        h1 {
            text-align: center;
            color: #333;
            margin-bottom: 20px;
            font-size: 2.5em;
        }
        h2 {
            color: #555;
            font-size: 1.75em;
            margin-bottom: 10px;
        }
        div {
            margin-bottom: 20px;
            padding: 15px;
            border: 1px solid #ddd;
            border-radius: 5px;
            background-color: #fff;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        p {
            margin: 5px 0;
        }
        hr {
            margin-top: 30px;
            margin-bottom: 30px;
            border: 0;
            border-top: 1px solid #ddd;
        }
        @media (max-width: 768px) {
            body {
                font-size: 14px;
            }
            h1 {
                font-size: 2em;
            }
            h2 {
                font-size: 1.5em;
            }
        }
    </style>
</head>
<body>
<h1>Alvos Respondidos</h1>`;

    if (filteredResolvedTargets.length === 0) {
        htmlContent += '<p>Nenhum alvo respondido encontrado para o período selecionado.</p>';
    } else {
        filteredResolvedTargets.forEach(target => {
            const formattedDate = formatDateForDisplay(target.date);
            const formattedArchivedDate = target.archivedDate;
            htmlContent += `
            <div>
                <h2>${target.title}</h2>
                <p>${target.details}</p>
                <p><strong>Data Original:</strong> ${formattedDate}</p>
                <p><strong>Data de Resolução:</strong> ${formattedArchivedDate}</p> 
            </div><hr>
        `;
        });
    }

    htmlContent += `</body></html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const now = new Date();
    const filename = `Alvos Respondidos - ${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}.html`;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
// ==== FIM SEÇÃO - GERAÇÃO DE VISUALIZAÇÃO (HTML) ====

// ==== INÍCIO SEÇÃO - FUNÇÕES DE BUSCA ====
function filterTargets(targets, searchTerm) {
    if (!searchTerm) return targets;
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    return targets.filter(target =>
        target.title.toLowerCase().includes(lowerCaseSearchTerm) ||
        target.details.toLowerCase().includes(lowerCaseSearchTerm) ||
        (target.observations && target.observations.some(obs => obs.observation.toLowerCase().includes(lowerCaseSearchTerm)))
    );
}

function handleSearchMain(event) {
    currentSearchTermMain = event.target.value;
    currentPage = 1;
    renderTargets();
}

function handleSearchArchived(event) {
    currentSearchTermArchived = event.target.value;
    currentArchivedPage = 1;
    renderArchivedTargets();
}

function handleSearchResolved(event) {
    currentSearchTermResolved = event.target.value;
    currentResolvedPage = 1;
    renderResolvedTargets();
}

// Atualizar os alvos diários
function refreshDailyTargets() {
    const dailyTargets = document.getElementById("dailyTargets");
    dailyTargets.innerHTML = "";
    const dailyTargetsCount = Math.min(prayerTargets.length, 10); // Mostrar até 10 alvos

    // Filtrar alvos que não foram exibidos recentemente
    let availableTargets = prayerTargets.filter(target => !lastDisplayedTargets.includes(target));

    // Se todos os alvos foram exibidos, reseta o histórico
    if (availableTargets.length === 0) {
        lastDisplayedTargets = [];
        availableTargets = prayerTargets.slice(); // Cria uma cópia da array para evitar modificação direta
    }

    // Seleciona aleatoriamente os alvos
    const shuffledTargets = availableTargets.sort(() => 0.5 - Math.random());
    const selectedTargets = shuffledTargets.slice(0, dailyTargetsCount);

    // Atualizar o histórico de exibição
    lastDisplayedTargets = [...lastDisplayedTargets, ...selectedTargets].slice(-prayerTargets.length);

    selectedTargets.forEach((target) => {
        const dailyDiv = document.createElement("div");
        dailyDiv.classList.add("target");

        // Construindo o HTML para incluir título, detalhes e tempo decorrido
        let contentHTML = `
            <h3>${target.title}</h3>
            <p>${target.details}</p> <!-- Inclui os detalhes (observações originais) -->
            <p><strong>Tempo Decorrido:</strong> ${timeElapsed(target.date)}</p>
        `;

        // Adicionando observações, se existirem
        if (target.observations && target.observations.length > 0) {
            contentHTML += `<h4>Observações:</h4>`;
            target.observations.forEach(obs => {
                contentHTML += `<p><strong>${formatDateForDisplay(obs.date)}:</strong> ${obs.observation}</p>`;
            });
        }

        dailyDiv.innerHTML = contentHTML;
        dailyTargets.appendChild(dailyDiv);
    });
}

// ==== FIM SEÇÃO - FUNÇÕES DE BUSCA ====

// DATE RANGE MODAL
const dateRangeModal = document.getElementById("dateRangeModal");
const closeDateRangeModalButton = document.getElementById("closeDateRangeModal");
const generateResolvedViewButton = document.getElementById("generateResolvedView");
const cancelDateRangeButton = document.getElementById("cancelDateRange");
const startDateInput = document.getElementById("startDate");
const endDateInput = document.getElementById("endDate");

window.addEventListener("click", (event) => {
    if (event.target === dateRangeModal) {
        dateRangeModal.style.display = "none";
    }
});
