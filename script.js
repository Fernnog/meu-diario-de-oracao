// Variáveis globais
let prayerTargets = [];
let archivedTargets = [];
let resolvedTargets = [];
let localStorageKeyPrefix = '';
let lastDisplayedTargets = []; // Lista para rastrear alvos exibidos recentemente
let currentPage = 1; // Current page of targets
let currentArchivedPage = 1; // Current page of archived targets
let currentResolvedPage = 1; // Current page of resolved targets
const targetsPerPage = 10; // Number of targets per page
let currentSearchTermMain = '';
let currentSearchTermArchived = '';
let currentSearchTermResolved = '';

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
    // Add event listeners for search inputs
    document.getElementById('searchMain').addEventListener('input', handleSearchMain);
    document.getElementById('searchArchived').addEventListener('input', handleSearchArchived);
    document.getElementById('searchResolved').addEventListener('input', handleSearchResolved);
};

// Definir o login ao clicar no botão
document.getElementById('setLoginButton').addEventListener('click', () => {
    const login = document.getElementById('loginInput').value.trim();
    if (login) {
        setLogin(login);
    } else {
        alert("Por favor, insira um login válido.");
    }
});

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

// Function to format date to DD/MM/YYYY
function formatDate(dateString) {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

// Function to filter targets
function filterTargets(targets, searchTerm) {
    if (!searchTerm) return targets;
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    return targets.filter(target =>
        target.title.toLowerCase().includes(lowerCaseSearchTerm) ||
        target.details.toLowerCase().includes(lowerCaseSearchTerm) ||
        (target.observations && target.observations.some(obs => obs.observation.toLowerCase().includes(lowerCaseSearchTerm)))
    );
}

// Renderizar alvos principais
function renderTargets() {
    const targetList = document.getElementById("targetList");
    targetList.innerHTML = "";
    const filteredTargets = filterTargets(prayerTargets, currentSearchTermMain);
    const startIndex = (currentPage - 1) * targetsPerPage;
    const endIndex = startIndex + targetsPerPage;
    const targetsToDisplay = filteredTargets.slice(startIndex, endIndex);

    targetsToDisplay.forEach((target, index) => {
        const formattedDate = formatDate(target.date);
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
        const formattedDate = formatDate(target.date);
        const formattedArchivedDate = formatDate(target.archivedDate);
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
        const formattedDate = formatDate(target.date);
        // A data já está formatada, então apenas a usamos diretamente
        const resolvedDate = target.archivedDate;
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

// Adicionar alvo
const form = document.getElementById("prayerForm");
form.addEventListener("submit", (e) => {
    e.preventDefault();
    const newTarget = {
        title: document.getElementById("title").value,
        details: document.getElementById("details").value,
        date: document.getElementById("date").value,
        resolved: false,
        observations: [] // Initialize empty array for observations
    };
    prayerTargets.push(newTarget);
    localStorage.setItem(localStorageKeyPrefix + "prayerTargets", JSON.stringify(prayerTargets));
    currentPage = 1;
    renderTargets();
    form.reset();
    refreshDailyTargets(); // Atualizar os alvos diários
});

// Marcar como Respondido
function markAsResolved(index) {
    const formattedDate = formatDate(new Date()); // Formatando a data atual
    prayerTargets[index].resolved = true;
    prayerTargets[index].archivedDate = formattedDate; // Usando a data formatada
    archivedTargets.push(prayerTargets[index]);
    resolvedTargets.push(prayerTargets[index]);
    prayerTargets.splice(index, 1);
    updateStorage();
    currentPage = 1;
    renderTargets();
    refreshDailyTargets(); // Atualizar os alvos diários
}

// Arquivar Alvo
function archiveTarget(index) {
    const formattedDate = formatDate(new Date()); // Formatando a data atual
    prayerTargets[index].archivedDate = formattedDate; // Usando a data formatada
    archivedTargets.push(prayerTargets[index]);
    prayerTargets.splice(index, 1);
    updateStorage();
    currentPage = 1;
    renderTargets();
    refreshDailyTargets(); // Atualizar os alvos diários
}

// Atualizar LocalStorage
function updateStorage() {
    localStorage.setItem(localStorageKeyPrefix + "prayerTargets", JSON.stringify(prayerTargets));
    localStorage.setItem(localStorageKeyPrefix + "archivedTargets", JSON.stringify(archivedTargets));
    resolvedTargets = archivedTargets.filter(target => target.resolved);
}

// Exportar dados para arquivo JSON
const exportDataButton = document.getElementById("exportData");
exportDataButton.addEventListener("click", exportData);

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
const importDataInput = document.getElementById("importData");
importDataInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
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

            // Combinar todas as listas para verificação de duplicados
            const allTargets = [...prayerTargets, ...archivedTargets];

            // Filtrar duplicados
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
            refreshDailyTargets(); // Atualizar os alvos diários
        } catch (error) {
            alert("Erro ao importar dados. Certifique-se de que é um arquivo válido.");
        }
    };
    reader.readAsText(file);
});

// Resetar todos os dados
const resetDataButton = document.getElementById("resetData");
resetDataButton.addEventListener("click", () => {
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
        refreshDailyTargets(); // Atualizar os alvos diários
        alert("Todos os alvos foram resetados.");
    }
});

// Switch para Exibição dos Painéis
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
                contentHTML += `<p><strong>${formatDate(obs.date)}:</strong> ${obs.observation}</p>`;
            });
        }

        dailyDiv.innerHTML = contentHTML;
        dailyTargets.appendChild(dailyDiv);
    });
}

// Função para copiar os alvos diários
const copyDailyButton = document.getElementById("copyDaily");

copyDailyButton.addEventListener("click", function () {
    const dailyTargetsElement = document.getElementById("dailyTargets");
    if (!dailyTargetsElement) {
        alert("Não foi possível encontrar os alvos diários para copiar.");
        return;
    }

    const dailyTargetsText = Array.from(dailyTargetsElement.children).map(div => {
        const title = div.querySelector('h3')?.textContent || '';
        const details = div.querySelector('p:nth-of-type(1)')?.textContent || ''; // Ajuste aqui para pegar os detalhes
        const timeElapsed = div.querySelector('p:nth-of-type(2)')?.textContent || ''; // E aqui para o tempo decorrido
        
        // Coletar observações, se houver
        const observations = Array.from(div.querySelectorAll('p'))
            .slice(2) // Ignora os parágrafos de título, detalhes e tempo decorrido
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

// MODAL FUNCTIONALITY

let currentTargetIndex = null; // To keep track of the target being updated

// Get the modal elements
const modal = document.getElementById("observationModal");
const closeModalButton = document.getElementById("closeModal");
const saveObservationButton = document.getElementById("saveObservation");
const newObservationInput = document.getElementById("newObservation");
const observationHistoryDiv = document.getElementById("observationHistory");

// Function to open modal
function openObservationModal(index) {
    currentTargetIndex = index;
    modal.style.display = "block";
    newObservationInput.value = "";
    renderObservationHistory(index);
}

// Function to close modal
closeModalButton.addEventListener("click", () => {
    modal.style.display = "none";
});

// Function to close modal when clicking outside
window.onclick = function (event) {
    if (event.target == modal) {
        modal.style.display = "none";
    }
}
// Function to save observation
saveObservationButton.addEventListener("click", () => {
    if (currentTargetIndex === null) return;

    const observationText = newObservationInput.value.trim();
    if (observationText !== "") {
        const now = new Date();
        const formattedDate = now.toLocaleDateString(); // Only date
        const newObservation = {
            date: formattedDate,
            observation: observationText,
        };
        prayerTargets[currentTargetIndex].observations.push(newObservation);
        localStorage.setItem(localStorageKeyPrefix + "prayerTargets", JSON.stringify(prayerTargets));
        newObservationInput.value = ""; // Clear input
        renderObservationHistory(currentTargetIndex); // refresh modal history
    }
});

// Function to render observation history
function renderObservationHistory(index) {
    observationHistoryDiv.innerHTML = "";
    const target = prayerTargets[index];
    if (target) {
        // Display initial target date and description like other observations
        const initialObsDiv = document.createElement("div");
        initialObsDiv.innerHTML = `<p><strong>${formatDate(target.date)}:</strong> ${target.details}</p>`;
        observationHistoryDiv.appendChild(initialObsDiv);
        if (target.observations) {
            target.observations.forEach((obs) => {
                const obsDiv = document.createElement("div");
                obsDiv.innerHTML = `<p><strong>${formatDate(obs.date)}:</strong> ${obs.observation}</p>`;
                observationHistoryDiv.appendChild(obsDiv);
            });
        }
    }
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
            pageLink.classList.add('active'); // add the current page class
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

// Event listener para o novo botão "Gerar Visualização Geral"
document.getElementById('generateViewButton').addEventListener('click', generateViewHTML);

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
            margin: 10px; /* Margem menor para melhor ajuste em telas pequenas */
            padding: 10px;
            background-color: #f9f9f9;
            color: #333;
            font-size: 16px; /* Tamanho de fonte base */
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
            margin: 5px 0; /* Reduz a margem vertical dos parágrafos */
        }

        hr {
            margin-top: 30px;
            margin-bottom: 30px;
            border: 0;
            border-top: 1px solid #ddd;
        }

        /* Media query para telas menores */
        @media (max-width: 768px) {
            body {
                font-size: 14px; /* Reduz o tamanho da fonte em telas menores */
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
            const formattedDate = formatDate(target.date);
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
                    htmlContent += `<p><strong>${formatDate(obs.date)}:</strong> ${obs.observation}</p>`;
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
            margin: 10px; /* Margem menor para melhor ajuste em telas pequenas */
            padding: 10px;
            background-color: #f9f9f9;
            color: #333;
            font-size: 16px; /* Tamanho de fonte base */
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
            margin: 5px 0; /* Reduz a margem vertical dos parágrafos */
        }

        hr {
            margin-top: 30px;
            margin-bottom: 30px;
            border: 0;
            border-top: 1px solid #ddd;
        }

        /* Media query para telas menores */
        @media (max-width: 768px) {
            body {
                font-size: 14px; /* Reduz o tamanho da fonte em telas menores */
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
            
            // Coletar observações, se houver
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

// Vincular a função ao botão "Visualizar Alvos do Dia"
document.getElementById('viewDaily').addEventListener('click', generateDailyViewHTML);

// DATE RANGE MODAL
const dateRangeModal = document.getElementById("dateRangeModal");
const closeDateRangeModalButton = document.getElementById("closeDateRangeModal");
const generateResolvedViewButton = document.getElementById("generateResolvedView");
const cancelDateRangeButton = document.getElementById("cancelDateRange");
const startDateInput = document.getElementById("startDate");
const endDateInput = document.getElementById("endDate");

// Function to open date range modal
document.getElementById("viewResolvedViewButton").addEventListener("click", () => {
    dateRangeModal.style.display = "block";
    // Reset the input fields
    startDateInput.value = '';
    endDateInput.value = '';
});

// Function to close date range modal
closeDateRangeModalButton.addEventListener("click", () => {
    dateRangeModal.style.display = "none";
});

// Function to close date range modal when clicking outside
window.addEventListener("click", (event) => {
    if (event.target === dateRangeModal) {
        dateRangeModal.style.display = "none";
    }
});

// Function to generate resolved view HTML
generateResolvedViewButton.addEventListener("click", () => {
    const startDate = startDateInput.value;
    const endDate = endDateInput.value;

    // Convert empty end date to today's date
    const today = new Date();
    const formattedToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const adjustedEndDate = endDate || formattedToday;

    generateResolvedViewHTML(startDate, adjustedEndDate);
    dateRangeModal.style.display = "none";
});

// Function to cancel date range selection
cancelDateRangeButton.addEventListener("click", () => {
    dateRangeModal.style.display = "none";
});

function generateResolvedViewHTML(startDate, endDate) {
    // Filtrar os alvos respondidos com base no período
    const filteredResolvedTargets = resolvedTargets.filter(target => {
        if (!target.resolved) return false;

        // Verifica se a archivedDate está no formato esperado
        const dateParts = target.archivedDate.split('/');
        if (dateParts.length !== 3) {
            console.error("Formato de archivedDate inválido:", target.archivedDate);
            return false; // Ou tratar o erro de outra forma, como exibir uma mensagem
        }

        const resolvedDateObj = new Date(dateParts[2], dateParts[1] - 1, dateParts[0]);

        const startDateObj = startDate ? new Date(startDate) : null;
        const endDateObj = endDate ? new Date(endDate) : null;

        if (startDateObj && resolvedDateObj < startDateObj) return false;
        if (endDateObj) {
            endDateObj.setHours(23, 59, 59); // Ajuste para incluir todo o dia final
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
            const formattedDate = formatDate(target.date);
            const formattedArchivedDate = target.archivedDate; // Já está formatada
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
