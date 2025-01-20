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
