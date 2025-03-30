// --- START OF FILE script.js (COMPLETO E CORRIGIDO) ---

// Importações do Firebase v9 (SDK Modular)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-analytics.js";
import {
    getAuth,
    onAuthStateChanged,
    signOut,
    GoogleAuthProvider,
    signInWithPopup
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import {
    getFirestore,
    collection,
    doc,
    addDoc,
    getDoc,
    setDoc,
    getDocs,
    deleteDoc,
    updateDoc,
    query,
    where,
    orderBy,
    Timestamp // Importa Timestamp
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// Configuração do Firebase (substitua pelos seus dados)
const firebaseConfig = {
  apiKey: "AIzaSyDnwmV7Xms2PyAZJDQQ_upjQkldoVkF_tk", // Atenção: Expor a chave API no lado do cliente é normal, mas configure regras de segurança no Firestore/Auth.
  authDomain: "meu-diario-de-oracao.firebaseapp.com",
  projectId: "meu-diario-de-oracao",
  storageBucket: "meu-diario-de-oracao.appspot.com",
  messagingSenderId: "718315400702",
  appId: "1:718315400702:web:eaabc0bfbf6b88e6a5e4af",
  measurementId: "G-G0838BBW07"
};

// Inicialização do Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// ==== Variáveis Globais ====
let currentUser = null; // Armazena o objeto do usuário autenticado
let prayerTargets = []; // Array para armazenar os alvos de oração ativos
let archivedTargets = []; // Array para armazenar os alvos arquivados
let currentFilter = 'all'; // Filtro atual ('all', 'active', 'expired', 'archived', 'resolved')
let currentSort = 'date_desc'; // Ordenação atual
let currentEditTargetId = null; // ID do alvo sendo editado
let currentPresentTargetIndex = -1; // Índice do alvo sendo apresentado no modo "Apresentação"
let presentedTargetsList = []; // Lista de alvos para o modo "Apresentação"

// **NOVO/ATUALIZADO:** Dados de Perseverança com Log de Confirmação
let perseveranceData = {
    consecutiveDays: 0,
    lastInteractionDate: null, // Armazenará a data da última confirmação (Date object)
    recordDays: 0,
    confirmationLog: [] // Array de strings YYYY-MM-DD das confirmações
};

// =============================================
// === FUNÇÕES UTILITÁRIAS COMPLETAS ===
// =============================================

// Cria um objeto Date UTC a partir de uma string YYYY-MM-DD
function createUTCDate(dateString) {
    if (!dateString || typeof dateString !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return null;
    // Adiciona T00:00:00Z para garantir interpretação como UTC meia-noite
    const date = new Date(dateString + 'T00:00:00Z');
    // Verifica se a data é válida após a criação
    if (isNaN(date.getTime())) return null;
    return date;
}

// Formata um objeto Date (ou Timestamp) para string YYYY-MM-DD (usando UTC)
function formatDateToISO(date) {
    let dateToFormat;
    if (date instanceof Timestamp) dateToFormat = date.toDate();
    else if (date instanceof Date && !isNaN(date)) dateToFormat = date;
    else dateToFormat = new Date(); // Default para agora se inválido

    if (isNaN(dateToFormat.getTime())) dateToFormat = new Date(); // Double check

    // Usa métodos UTC para consistência
    const year = dateToFormat.getUTCFullYear();
    const month = String(dateToFormat.getUTCMonth() + 1).padStart(2, '0');
    const day = String(dateToFormat.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Formata um objeto Date (ou Timestamp) para DD/MM/YYYY (usando UTC para exibição)
function formatDateForDisplay(dateInput) {
    if (!dateInput) return 'Data Inválida';
    let dateToFormat;
    if (dateInput instanceof Timestamp) dateToFormat = dateInput.toDate();
    else if (dateInput instanceof Date && !isNaN(dateInput)) dateToFormat = dateInput;
    else {
        // Tenta parsear se for string ou número, interpretando como UTC
        try {
             let potentialDate;
             // Lida com string ISO com 'T' ou espaço
             if (typeof dateInput === 'string' && (dateInput.includes('T') || dateInput.includes(' '))) {
                  potentialDate = new Date(dateInput);
             } else {
                 // Assume YYYY-MM-DD ou similar como local, força UTC
                 potentialDate = new Date(dateInput + 'T00:00:00Z');
             }

            if (!isNaN(potentialDate.getTime())) {
                dateToFormat = potentialDate;
            } else {
                return 'Data Inválida'; // Fallback
            }
        } catch (e) {
             return 'Data Inválida';
        }
    }
    // Formata usando métodos UTC
    const day = String(dateToFormat.getUTCDate()).padStart(2, '0');
    const month = String(dateToFormat.getUTCMonth() + 1).padStart(2, '0');
    const year = dateToFormat.getUTCFullYear();
    return `${day}/${month}/${year}`;
}

// Calcula o tempo decorrido desde uma data
function timeElapsed(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) return 'Data Inválida';
    const now = new Date();
    let diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diffInSeconds < 0) diffInSeconds = 0; // Não mostra tempo futuro
    if (diffInSeconds < 60) return `${diffInSeconds} seg`;
    let diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes} min`;
    let diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} hr`;
    let diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 30) return `${diffInDays} dias`;
    let diffInMonths = Math.floor(diffInDays / 30.44); // Média de dias no mês
    if (diffInMonths < 12) return `${diffInMonths} meses`;
    let diffInYears = Math.floor(diffInDays / 365.25); // Considera anos bissextos
    return `${diffInYears} anos`;
}

// Verifica se uma data de prazo expirou (comparando apenas a parte da data UTC)
function isDateExpired(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) return false;
    const now = new Date();
    // Obtém o início do dia UTC atual
    const todayUTCStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    // Obtém o início do dia UTC da data fornecida
    const dateUTCStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    // Retorna true se a data for anterior ao dia de hoje (em UTC)
    return dateUTCStart < todayUTCStart;
}

// **NOVO:** Helper para obter o início da semana (Domingo 00:00:00) de uma data
function getStartOfWeek(date) {
    const dt = new Date(date); // Clona a data para não modificar a original
    const dayOfWeek = dt.getDay(); // 0=Domingo, 1=Segunda, ..., 6=Sábado
    dt.setDate(dt.getDate() - dayOfWeek); // Retrocede para o Domingo
    dt.setHours(0, 0, 0, 0); // Zera a hora para comparações de data apenas
    return dt;
}

// Rehidrata os dados do Firestore, convertendo Timestamps para Dates
// Garante que campos de data sejam objetos Date ou null
function rehydrateTargets(targets) {
     return targets.map((target) => {
        if (!target) return null; // Pula alvos nulos/inválidos
        const rehydratedTarget = { ...target };
        const fieldsToConvert = ['date', 'deadlineDate', 'lastPresentedDate', 'resolutionDate', 'archivedDate'];

        fieldsToConvert.forEach(field => {
            const originalValue = rehydratedTarget[field];
            if (originalValue instanceof Timestamp) {
                rehydratedTarget[field] = originalValue.toDate();
            } else if (originalValue instanceof Date && !isNaN(originalValue)) {
                // Já é um Date válido, mantém
                rehydratedTarget[field] = originalValue;
            } else if (originalValue === null || originalValue === undefined) {
                rehydratedTarget[field] = null; // Mantém null/undefined
            } else {
                // Tenta parsear outros tipos (ex: strings de dados antigos)
                try {
                    const parsedDate = new Date(originalValue);
                    rehydratedTarget[field] = !isNaN(parsedDate.getTime()) ? parsedDate : null;
                } catch (e) {
                    console.warn(`Não foi possível parsear campo de data '${field}' para alvo ${target.id}:`, originalValue);
                    rehydratedTarget[field] = null;
                 }
            }
        });

        // Rehidrata datas das observações
        if (rehydratedTarget.observations && Array.isArray(rehydratedTarget.observations)) {
            rehydratedTarget.observations = rehydratedTarget.observations.map(obs => {
                 if (!obs) return null; // Pula observações nulas/inválidas
                 let obsDateFinal = null;
                 if (obs.date instanceof Timestamp) obsDateFinal = obs.date.toDate();
                 else if (obs.date instanceof Date && !isNaN(obs.date)) obsDateFinal = obs.date;
                 else if (obs.date) { // Tenta parsear se não for Date ou Timestamp
                    try {
                       const parsedObsDate = new Date(obs.date);
                       if (!isNaN(parsedObsDate.getTime())) obsDateFinal = parsedObsDate;
                    } catch(e) { /* ignora erro de parse */ }
                 }
                 return { ...obs, date: obsDateFinal }; // Retorna obs com data corrigida ou null
            }).filter(obs => obs !== null); // Remove observações que ficaram nulas
        } else {
            rehydratedTarget.observations = []; // Garante que seja um array vazio se inválido/ausente
        }

        return rehydratedTarget; // Retorna o alvo rehidratado
    }).filter(target => target !== null); // Remove alvos que ficaram nulos
}


// =============================================
// === FIM FUNÇÕES UTILITÁRIAS               ===
// =============================================


// =============================================
// === AUTENTICAÇÃO & UI AUTH                ===
// =============================================

// Monitora mudanças no estado de autenticação
onAuthStateChanged(auth, (user) => {
    const loadingIndicator = document.getElementById('loadingIndicator');
    const authSection = document.getElementById('authSection');
    const appContent = document.getElementById('appContent'); // Container principal do app

    if (user) {
        // Usuário está logado
        console.log("Usuário autenticado:", user.uid, user.email);
        currentUser = user; // Armazena globalmente
        updateAuthUI(user);
        if (appContent) appContent.style.display = 'block'; // Mostra o conteúdo do app
        if (authSection) authSection.style.display = 'none'; // Esconde a seção de login
        loadInitialData(user.uid); // Carrega dados do usuário (alvos, perseverança)
        if (loadingIndicator) loadingIndicator.style.display = 'none'; // Esconde loading
    } else {
        // Usuário está deslogado
        console.log("Nenhum usuário autenticado.");
        currentUser = null;
        updateAuthUI(null);
        if (appContent) appContent.style.display = 'none'; // Esconde o conteúdo do app
        if (authSection) authSection.style.display = 'block'; // Mostra a seção de login
        resetUI(); // Limpa a UI
        if (loadingIndicator) loadingIndicator.style.display = 'none'; // Esconde loading
    }
});

// Atualiza a interface de autenticação
function updateAuthUI(user) {
    const authStatus = document.getElementById('authStatus');
    const btnLogout = document.getElementById('btnLogout');
    const perseveranceSection = document.getElementById('perseveranceSection'); // Mostra/esconde perseverança

    if (user && authStatus && btnLogout && perseveranceSection) {
        let providerType = 'E-mail/Senha'; // Default assumido, ajuste se usar outros métodos
        if (user.providerData[0]?.providerId === 'google.com') {
            providerType = 'Google';
        }
        authStatus.textContent = `Logado como: ${user.email || user.displayName} (via ${providerType})`;
        btnLogout.style.display = 'inline-block';
        perseveranceSection.style.display = 'block'; // Mostra seção de perseverança
    } else if (authStatus && btnLogout && perseveranceSection) {
        authStatus.textContent = "Você não está logado.";
        btnLogout.style.display = 'none';
        perseveranceSection.style.display = 'none'; // Esconde seção de perseverança
    }
}

// Função de Login com Google
async function signInWithGoogle() {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;
        console.log("Login com Google bem-sucedido:", user.displayName);
        // O onAuthStateChanged cuidará do resto (atualizar UI, carregar dados)
    } catch (error) {
        console.error("Erro no login com Google:", error.code, error.message);
        alert(`Erro no login com Google: ${error.message}`);
        // Tratar erros específicos como 'popup_closed_by_user' se necessário
    }
}

// Função de Logout
async function logout() {
    try {
        await signOut(auth);
        console.log("Logout bem-sucedido.");
        // O onAuthStateChanged cuidará da atualização da UI e limpeza
    } catch (error) {
        console.error("Erro ao fazer logout:", error);
        alert("Erro ao tentar sair. Tente novamente.");
    }
}

// Limpa a interface do usuário (listas, filtros, etc.) ao deslogar
function resetUI() {
    prayerTargets = [];
    archivedTargets = [];
    const targetList = document.getElementById('targetList');
    const archivedTargetList = document.getElementById('archivedTargetList');
    const filterButtons = document.querySelectorAll('.filter-btn');
    const sortSelect = document.getElementById('sortOptions');

    if (targetList) targetList.innerHTML = '';
    if (archivedTargetList) archivedTargetList.innerHTML = '';
    filterButtons.forEach(btn => btn.classList.remove('active'));
    document.querySelector('.filter-btn[data-filter="all"]')?.classList.add('active'); // Reset filter UI
    if (sortSelect) sortSelect.value = 'date_desc'; // Reset sort UI
    currentFilter = 'all';
    currentSort = 'date_desc';
    currentEditTargetId = null;
    currentPresentTargetIndex = -1;
    presentedTargetsList = [];

    // Limpa dados de perseverança LOCALMENTE e reseta UI de perseverança
    perseveranceData = { consecutiveDays: 0, lastInteractionDate: null, recordDays: 0, confirmationLog: [] };
    resetPerseveranceUI(); // Chama a função que limpa a barra e o quadro
}

// =============================================
// === FIM AUTENTICAÇÃO & UI AUTH            ===
// =============================================


// =============================================
// === CARREGAMENTO DE DADOS INICIAIS        ===
// =============================================

// Carrega dados iniciais (alvos e perseverança) após login
async function loadInitialData(userId) {
    console.log(`[loadInitialData] Carregando dados para usuário ${userId}`);
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) loadingIndicator.style.display = 'block'; // Mostra loading

    try {
        // Carrega alvos ativos E arquivados em paralelo
        const [activeLoaded, archivedLoaded] = await Promise.all([
            loadPrayerTargets(userId),
            loadArchivedTargets(userId)
        ]);

        // Carrega dados de perseverança
        await loadPerseveranceData(userId);

        // Renderiza a lista após todos os dados carregados
        filterAndRenderTargets();

        console.log("[loadInitialData] Dados carregados com sucesso.");

    } catch (error) {
        console.error("[loadInitialData] Erro ao carregar dados:", error);
        alert("Erro ao carregar seus dados. Verifique sua conexão e tente recarregar a página.");
        // Poderia mostrar uma mensagem de erro mais permanente na UI
    } finally {
        if (loadingIndicator) loadingIndicator.style.display = 'none'; // Esconde loading
    }
}

// Carrega alvos de oração ativos do Firestore
async function loadPrayerTargets(userId) {
    console.log(`[loadPrayerTargets] Buscando alvos ativos para ${userId}`);
    const targetsRef = collection(db, "users", userId, "prayerTargets");
    // Ordena por data de criação descendente (mais recentes primeiro) por padrão no backend
    const q = query(targetsRef, orderBy("date", "desc"));
    try {
        const querySnapshot = await getDocs(q);
        const targetsRaw = querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        prayerTargets = rehydrateTargets(targetsRaw); // Reidrata os dados
        console.log(`[loadPrayerTargets] ${prayerTargets.length} alvos ativos carregados.`);
        return true; // Indica sucesso
    } catch (error) {
        console.error("[loadPrayerTargets] Erro ao carregar alvos ativos:", error);
        prayerTargets = []; // Limpa em caso de erro
        // Não renderiza aqui, loadInitialData cuida disso
        throw error; // Re-lança o erro para ser pego por loadInitialData
    }
}

// Carrega alvos arquivados do Firestore
async function loadArchivedTargets(userId) {
    console.log(`[loadArchivedTargets] Buscando alvos arquivados para ${userId}`);
    const archivedRef = collection(db, "users", userId, "archivedTargets");
    // Ordena por data de arquivamento descendente (mais recentes primeiro)
    const q = query(archivedRef, orderBy("archivedDate", "desc"));
    try {
        const querySnapshot = await getDocs(q);
        const archivedRaw = querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        archivedTargets = rehydrateTargets(archivedRaw); // Reidrata os dados
        console.log(`[loadArchivedTargets] ${archivedTargets.length} alvos arquivados carregados.`);
        return true; // Indica sucesso
    } catch (error) {
        console.error("[loadArchivedTargets] Erro ao carregar alvos arquivados:", error);
        archivedTargets = []; // Limpa em caso de erro
        throw error; // Re-lança o erro
    }
}

// =============================================
// === FIM CARREGAMENTO DE DADOS             ===
// =============================================


// =============================================
// === GERENCIAMENTO DE ALVOS (CRUD)         ===
// =============================================

// Adiciona um novo alvo de oração
async function addPrayerTarget(event) {
    event.preventDefault(); // Previne recarregamento da página
    if (!currentUser) { alert("Erro: Usuário não autenticado."); return; }

    const titleInput = document.getElementById('targetTitle');
    const detailsInput = document.getElementById('targetDetails');
    const dateInput = document.getElementById('targetDate');
    const deadlineInput = document.getElementById('targetDeadline');

    const title = titleInput.value.trim();
    const details = detailsInput.value.trim();
    const dateString = dateInput.value; // YYYY-MM-DD
    const deadlineString = deadlineInput.value; // YYYY-MM-DD ou vazio

    if (!title) { alert("Por favor, insira um título para o alvo."); return; }
    if (!dateString) { alert("Por favor, selecione a data de início."); return; }

    // Cria objetos Date UTC a partir das strings
    const date = createUTCDate(dateString);
    const deadlineDate = deadlineString ? createUTCDate(deadlineString) : null;

    if (!date) { alert("Data de início inválida."); return; }
    if (deadlineString && !deadlineDate) { alert("Data limite inválida."); return; }
    if (deadlineDate && deadlineDate < date) { alert("A data limite não pode ser anterior à data de início."); return; }

    const newTarget = {
        title: title,
        details: details,
        date: Timestamp.fromDate(date), // Salva como Timestamp no Firestore
        deadlineDate: deadlineDate ? Timestamp.fromDate(deadlineDate) : null,
        lastPresentedDate: null, // Data da última apresentação (para ciclo)
        resolved: false, // Indica se foi marcado como respondido
        resolutionDate: null, // Data da resolução
        archivedDate: null, // Data de arquivamento (usado na coleção de arquivados)
        observations: [] // Array para armazenar observações { text: string, date: Timestamp }
        // Não precisa de userId aqui, pois está na estrutura da coleção
    };

    try {
        const targetsRef = collection(db, "users", currentUser.uid, "prayerTargets");
        const docRef = await addDoc(targetsRef, newTarget);
        console.log("Alvo adicionado com ID:", docRef.id);

        // Adiciona localmente para atualização imediata da UI
        // Converte Timestamps de volta para Date para consistência local
        const newTargetLocal = {
            ...newTarget,
            id: docRef.id,
            date: newTarget.date.toDate(),
            deadlineDate: newTarget.deadlineDate ? newTarget.deadlineDate.toDate() : null
        };
        prayerTargets.unshift(newTargetLocal); // Adiciona no início (mais recente)

        closeModal('addTargetModal'); // Fecha o modal
        filterAndRenderTargets(); // Re-renderiza a lista
        resetTargetForm(); // Limpa o formulário

    } catch (error) {
        console.error("Erro ao adicionar alvo:", error);
        alert("Erro ao salvar o alvo. Tente novamente.");
    }
}

// Abre o modal de edição com os dados do alvo
function openEditModal(targetId) {
    currentEditTargetId = targetId;
    // Encontra o alvo (pode estar na lista ativa ou arquivada, mas edição geralmente é em ativos)
    const target = prayerTargets.find(t => t.id === targetId) || archivedTargets.find(t => t.id === targetId);

    if (!target) {
        console.error("Alvo não encontrado para edição:", targetId);
        alert("Erro: Alvo não encontrado.");
        return;
    }

    // Preenche o formulário de edição
    document.getElementById('editTargetTitle').value = target.title || '';
    document.getElementById('editTargetDetails').value = target.details || '';
    // Formata as datas (Date objects) para YYYY-MM-DD para os inputs type="date"
    document.getElementById('editTargetDate').value = target.date ? formatDateToISO(target.date) : '';
    document.getElementById('editTargetDeadline').value = target.deadlineDate ? formatDateToISO(target.deadlineDate) : '';
    document.getElementById('editTargetResolved').checked = target.resolved || false;
    // Preenche data de resolução se existir e estiver resolvido
    document.getElementById('editTargetResolutionDate').value = (target.resolved && target.resolutionDate) ? formatDateToISO(target.resolutionDate) : '';
    document.getElementById('editTargetResolutionDate').disabled = !target.resolved; // Habilita/desabilita campo

    // Preenche observações
    renderObservations('editTargetObservationsList', target.observations || []);

    openModal('editTargetModal');
}

// Salva as alterações do alvo editado
async function saveEditedTarget(event) {
    event.preventDefault();
    if (!currentUser || !currentEditTargetId) { alert("Erro: Não foi possível salvar as alterações."); return; }

    const targetRef = doc(db, "users", currentUser.uid, "prayerTargets", currentEditTargetId);
    // Tenta buscar em arquivados também se não achar nos ativos (embora edição deva ser em ativos)
    const archivedTargetRef = doc(db, "users", currentUser.uid, "archivedTargets", currentEditTargetId);
    let targetOriginRef = targetRef; // Assume que está nos ativos
    let targetOriginList = prayerTargets;

    // Verifica se o alvo existe na lista local (ativos ou arquivados)
    let targetIndex = prayerTargets.findIndex(t => t.id === currentEditTargetId);
    if (targetIndex === -1) {
        targetIndex = archivedTargets.findIndex(t => t.id === currentEditTargetId);
        if (targetIndex !== -1) {
            targetOriginRef = archivedTargetRef; // Alvo está nos arquivados
            targetOriginList = archivedTargets;
            console.warn("Tentando editar um alvo que parece estar arquivado:", currentEditTargetId);
             // Idealmente, edição deveria reativar ou ser feita apenas em ativos.
             // Por ora, permite a edição nos arquivados, mas isso pode ser revisto.
        } else {
             console.error("Alvo não encontrado localmente para salvar edição:", currentEditTargetId);
             alert("Erro: Alvo não encontrado para salvar.");
             closeModal('editTargetModal');
             return;
        }
    }


    const title = document.getElementById('editTargetTitle').value.trim();
    const details = document.getElementById('editTargetDetails').value.trim();
    const dateString = document.getElementById('editTargetDate').value;
    const deadlineString = document.getElementById('editTargetDeadline').value;
    const resolved = document.getElementById('editTargetResolved').checked;
    const resolutionDateString = document.getElementById('editTargetResolutionDate').value;

    if (!title) { alert("O título não pode ficar em branco."); return; }
    if (!dateString) { alert("A data de início é obrigatória."); return; }

    const date = createUTCDate(dateString);
    const deadlineDate = deadlineString ? createUTCDate(deadlineString) : null;
    let resolutionDate = null;
    if (resolved) {
        if (!resolutionDateString) {
            alert("Se o alvo está resolvido, por favor, informe a data da resolução.");
            return;
        }
        resolutionDate = createUTCDate(resolutionDateString);
        if (!resolutionDate) {
             alert("Data de resolução inválida.");
             return;
        }
    }


    if (!date) { alert("Data de início inválida."); return; }
    if (deadlineString && !deadlineDate) { alert("Data limite inválida."); return; }
    if (deadlineDate && deadlineDate < date) { alert("A data limite não pode ser anterior à data de início."); return; }
    if (resolved && resolutionDate && resolutionDate < date) { alert("A data de resolução não pode ser anterior à data de início."); return; }


    const updatedData = {
        title: title,
        details: details,
        date: Timestamp.fromDate(date),
        deadlineDate: deadlineDate ? Timestamp.fromDate(deadlineDate) : null,
        resolved: resolved,
        resolutionDate: resolved && resolutionDate ? Timestamp.fromDate(resolutionDate) : null
        // Observações são tratadas separadamente (add/delete)
        // Não atualiza lastPresentedDate ou archivedDate aqui
    };

    try {
        await updateDoc(targetOriginRef, updatedData); // Atualiza no Firestore
        console.log("Alvo atualizado com sucesso:", currentEditTargetId);

        // Atualiza o objeto na lista local (prayerTargets ou archivedTargets)
        const targetLocal = targetOriginList[targetIndex];
        targetLocal.title = title;
        targetLocal.details = details;
        targetLocal.date = date; // Atualiza com objeto Date local
        targetLocal.deadlineDate = deadlineDate;
        targetLocal.resolved = resolved;
        targetLocal.resolutionDate = resolutionDate;
        // As observações já foram atualizadas localmente pelas funções add/deleteObservation

        closeModal('editTargetModal');
        filterAndRenderTargets(); // Re-renderiza as listas

    } catch (error) {
        console.error("Erro ao atualizar alvo:", error);
        alert("Erro ao salvar as alterações. Tente novamente.");
    } finally {
        currentEditTargetId = null; // Limpa o ID de edição
    }
}

// Adiciona uma observação a um alvo (chamado pelo modal de edição)
async function addObservation() {
    if (!currentUser || !currentEditTargetId) return;

    const observationInput = document.getElementById('newObservationText');
    const observationText = observationInput.value.trim();
    if (!observationText) { alert("Digite o texto da observação."); return; }

    const newObservation = {
        text: observationText,
        date: Timestamp.now() // Usa o timestamp atual do servidor
    };

    // Determina se o alvo está em 'prayerTargets' ou 'archivedTargets'
    let targetRef;
    let targetList;
    let targetIndex = prayerTargets.findIndex(t => t.id === currentEditTargetId);
    if (targetIndex !== -1) {
        targetRef = doc(db, "users", currentUser.uid, "prayerTargets", currentEditTargetId);
        targetList = prayerTargets;
    } else {
        targetIndex = archivedTargets.findIndex(t => t.id === currentEditTargetId);
        if (targetIndex !== -1) {
            targetRef = doc(db, "users", currentUser.uid, "archivedTargets", currentEditTargetId);
            targetList = archivedTargets;
        } else {
            console.error("Alvo não encontrado para adicionar observação:", currentEditTargetId);
            alert("Erro: Alvo não encontrado.");
            return;
        }
    }

    // Recupera observações existentes localmente
    const target = targetList[targetIndex];
    const currentObservations = Array.isArray(target.observations) ? target.observations : [];

    // Cria a observação local com Date object para UI imediata
    const newObservationLocal = {
        text: newObservation.text,
        date: newObservation.date.toDate(), // Converte para Date local
        // Poderia adicionar um ID temporário se a remoção precisasse ser feita antes do save
    };

    // Atualiza localmente PRIMEIRO para feedback rápido
    const updatedObservationsLocal = [...currentObservations, newObservationLocal];
    target.observations = updatedObservationsLocal; // Atualiza o array no objeto local

    // Re-renderiza a lista de observações no modal
    renderObservations('editTargetObservationsList', updatedObservationsLocal);
    observationInput.value = ''; // Limpa o input

    // Atualiza no Firestore em segundo plano
    try {
        // Pega as observações locais (com Date objects) e converte datas de volta para Timestamps para salvar
        const observationsToSave = updatedObservationsLocal.map(obs => ({
             text: obs.text,
             // Converte Date de volta para Timestamp ou mantém se já for (importante!)
             date: obs.date instanceof Date ? Timestamp.fromDate(obs.date) : obs.date
        }));

        await updateDoc(targetRef, { observations: observationsToSave });
        console.log("Observação adicionada ao Firestore para:", currentEditTargetId);
        // filterAndRenderTargets(); // Opcional: Re-renderizar a lista principal se a observação for visível lá
    } catch (error) {
        console.error("Erro ao adicionar observação no Firestore:", error);
        alert("Erro ao salvar a observação. A observação pode não ter sido salva permanentemente.");
        // Poderia tentar reverter a adição local ou marcar a observação como não salva
        // Por simplicidade, apenas logamos o erro.
         target.observations = currentObservations; // Reverte a alteração local em caso de erro
         renderObservations('editTargetObservationsList', currentObservations); // Renderiza de novo sem a obs
    }
}


// Remove uma observação (pelo índice no array local)
async function deleteObservation(index) {
    if (!currentUser || !currentEditTargetId || index < 0) return;

    // Determina a referência e a lista correta
    let targetRef;
    let targetList;
    let targetIndex = prayerTargets.findIndex(t => t.id === currentEditTargetId);
    if (targetIndex !== -1) {
        targetRef = doc(db, "users", currentUser.uid, "prayerTargets", currentEditTargetId);
        targetList = prayerTargets;
    } else {
        targetIndex = archivedTargets.findIndex(t => t.id === currentEditTargetId);
        if (targetIndex !== -1) {
            targetRef = doc(db, "users", currentUser.uid, "archivedTargets", currentEditTargetId);
            targetList = archivedTargets;
        } else {
            console.error("Alvo não encontrado para remover observação:", currentEditTargetId);
            return;
        }
    }

    const target = targetList[targetIndex];
    const currentObservations = Array.isArray(target.observations) ? target.observations : [];

    if (index >= currentObservations.length) {
        console.error("Índice de observação inválido para remoção:", index);
        return;
    }

    // Guarda a observação que será removida para possível reversão
    const removedObservation = currentObservations[index];

    // Remove localmente PRIMEIRO
    const updatedObservationsLocal = currentObservations.filter((_, i) => i !== index);
    target.observations = updatedObservationsLocal;

    // Re-renderiza a lista de observações no modal
    renderObservations('editTargetObservationsList', updatedObservationsLocal);

    // Atualiza no Firestore em segundo plano
    try {
        // Converte datas de volta para Timestamps para salvar
         const observationsToSave = updatedObservationsLocal.map(obs => ({
             text: obs.text,
             date: obs.date instanceof Date ? Timestamp.fromDate(obs.date) : obs.date
         }));
        await updateDoc(targetRef, { observations: observationsToSave });
        console.log("Observação removida do Firestore para:", currentEditTargetId, "Índice:", index);
    } catch (error) {
        console.error("Erro ao remover observação no Firestore:", error);
        alert("Erro ao remover a observação. A alteração pode não ter sido salva.");
        // Reverte a alteração local em caso de erro
        target.observations = [...updatedObservationsLocal.slice(0, index), removedObservation, ...updatedObservationsLocal.slice(index)];
        renderObservations('editTargetObservationsList', target.observations);
    }
}

// Marca um alvo como Respondido
async function markAsResolved(targetId) {
    if (!currentUser) return;
    const targetIndex = prayerTargets.findIndex(t => t.id === targetId);
    if (targetIndex === -1) { console.error("Alvo ativo não encontrado para marcar como resolvido:", targetId); return; }

    const target = prayerTargets[targetIndex];
    const resolutionDate = Timestamp.now(); // Data atual como resolução

    try {
        const targetRef = doc(db, "users", currentUser.uid, "prayerTargets", targetId);
        await updateDoc(targetRef, {
            resolved: true,
            resolutionDate: resolutionDate
        });
        console.log("Alvo marcado como resolvido:", targetId);

        // Atualiza localmente
        target.resolved = true;
        target.resolutionDate = resolutionDate.toDate();

        filterAndRenderTargets(); // Re-renderiza
    } catch (error) {
        console.error("Erro ao marcar alvo como resolvido:", error);
        alert("Erro ao marcar como resolvido.");
    }
}

// Arquiva um alvo (move da coleção ativa para arquivada)
async function archiveTarget(targetId) {
    if (!currentUser) return;
    const targetIndex = prayerTargets.findIndex(t => t.id === targetId);
    if (targetIndex === -1) { console.error("Alvo ativo não encontrado para arquivar:", targetId); return; }

    const targetToArchive = prayerTargets[targetIndex];
    const archiveDate = Timestamp.now(); // Data atual do arquivamento

    // Cria o objeto para a coleção de arquivados
    const archivedData = {
        ...targetToArchive, // Copia todos os dados existentes
        // Converte datas locais (Date) de volta para Timestamp para salvar no Firestore
        date: targetToArchive.date instanceof Date ? Timestamp.fromDate(targetToArchive.date) : targetToArchive.date,
        deadlineDate: targetToArchive.deadlineDate instanceof Date ? Timestamp.fromDate(targetToArchive.deadlineDate) : targetToArchive.deadlineDate,
        lastPresentedDate: targetToArchive.lastPresentedDate instanceof Date ? Timestamp.fromDate(targetToArchive.lastPresentedDate) : targetToArchive.lastPresentedDate,
        resolutionDate: targetToArchive.resolutionDate instanceof Date ? Timestamp.fromDate(targetToArchive.resolutionDate) : targetToArchive.resolutionDate,
        // Adiciona a data de arquivamento
        archivedDate: archiveDate,
        // Converte datas das observações de volta para Timestamp
        observations: (targetToArchive.observations || []).map(obs => ({
            text: obs.text,
            date: obs.date instanceof Date ? Timestamp.fromDate(obs.date) : obs.date
        }))
    };
    // Remove o ID, pois ele será o ID do novo documento na coleção de arquivados
    delete archivedData.id;

    const targetRef = doc(db, "users", currentUser.uid, "prayerTargets", targetId);
    const archivedRef = doc(db, "users", currentUser.uid, "archivedTargets", targetId); // Usa o mesmo ID na coleção de arquivados

    try {
        // 1. Adiciona à coleção de arquivados usando setDoc com o mesmo ID
        await setDoc(archivedRef, archivedData);
        console.log("Alvo adicionado aos arquivados:", targetId);

        // 2. Remove da coleção ativa
        await deleteDoc(targetRef);
        console.log("Alvo removido dos ativos:", targetId);

        // 3. Atualiza listas locais
        const [archivedTarget] = prayerTargets.splice(targetIndex, 1); // Remove de ativos
        // Adiciona aos arquivados locais (já reidratado, mas atualiza archivedDate)
        archivedTarget.archivedDate = archiveDate.toDate(); // Atualiza data de arquivamento local
        archivedTargets.unshift(archivedTarget); // Adiciona no início da lista de arquivados

        filterAndRenderTargets(); // Re-renderiza
    } catch (error) {
        console.error("Erro ao arquivar alvo:", error);
        alert("Erro ao arquivar o alvo. A operação pode não ter sido concluída.");
        // Idealmente, teria uma transação aqui para garantir atomicidade
        // Em caso de falha parcial, recarregar os dados pode ser necessário
        await loadInitialData(currentUser.uid); // Recarrega tudo em caso de erro
    }
}

// Restaura um alvo arquivado (move de volta para a coleção ativa)
async function unarchiveTarget(targetId) {
    if (!currentUser) return;
    const targetIndex = archivedTargets.findIndex(t => t.id === targetId);
    if (targetIndex === -1) { console.error("Alvo arquivado não encontrado para restaurar:", targetId); return; }

    const targetToRestore = archivedTargets[targetIndex];

    // Prepara dados para a coleção ativa (remove archivedDate)
    const restoredData = { ...targetToRestore };
    // Converte datas locais (Date) de volta para Timestamp para salvar no Firestore
    restoredData.date = restoredData.date instanceof Date ? Timestamp.fromDate(restoredData.date) : restoredData.date;
    restoredData.deadlineDate = restoredData.deadlineDate instanceof Date ? Timestamp.fromDate(restoredData.deadlineDate) : restoredData.deadlineDate;
    restoredData.lastPresentedDate = restoredData.lastPresentedDate instanceof Date ? Timestamp.fromDate(restoredData.lastPresentedDate) : restoredData.lastPresentedDate;
    restoredData.resolutionDate = restoredData.resolutionDate instanceof Date ? Timestamp.fromDate(restoredData.resolutionDate) : restoredData.resolutionDate;
    restoredData.observations = (restoredData.observations || []).map(obs => ({
        text: obs.text,
        date: obs.date instanceof Date ? Timestamp.fromDate(obs.date) : obs.date
    }));

    // Remove o campo archivedDate antes de mover de volta
    delete restoredData.archivedDate;
    delete restoredData.id; // Remove ID para adicionar

    const archivedRef = doc(db, "users", currentUser.uid, "archivedTargets", targetId);
    const targetRef = doc(db, "users", currentUser.uid, "prayerTargets", targetId); // Usa o mesmo ID

    try {
        // 1. Adiciona de volta à coleção ativa usando setDoc com o mesmo ID
        await setDoc(targetRef, restoredData);
        console.log("Alvo adicionado de volta aos ativos:", targetId);

        // 2. Remove da coleção de arquivados
        await deleteDoc(archivedRef);
        console.log("Alvo removido dos arquivados:", targetId);

        // 3. Atualiza listas locais
        const [restoredTarget] = archivedTargets.splice(targetIndex, 1); // Remove dos arquivados locais
        restoredTarget.archivedDate = null; // Limpa data de arquivamento local
        prayerTargets.unshift(restoredTarget); // Adiciona aos ativos locais

        filterAndRenderTargets(); // Re-renderiza

    } catch (error) {
        console.error("Erro ao restaurar alvo:", error);
        alert("Erro ao restaurar o alvo. A operação pode não ter sido concluída.");
        // Recarrega tudo em caso de erro
        await loadInitialData(currentUser.uid);
    }
}

// Exclui um alvo permanentemente (geralmente da lista de arquivados)
async function deleteTargetPermanently(targetId) {
    if (!currentUser) return;

    // Verifica se o alvo está nos arquivados primeiro
    let targetRef = doc(db, "users", currentUser.uid, "archivedTargets", targetId);
    let targetList = archivedTargets;
    let targetIndex = targetList.findIndex(t => t.id === targetId);
    let sourceCollectionName = "archivedTargets";

    // Se não encontrar nos arquivados, verifica nos ativos (menos comum excluir direto dos ativos)
    if (targetIndex === -1) {
        targetRef = doc(db, "users", currentUser.uid, "prayerTargets", targetId);
        targetList = prayerTargets;
        targetIndex = targetList.findIndex(t => t.id === targetId);
        sourceCollectionName = "prayerTargets";
    }

    if (targetIndex === -1) {
        console.error("Alvo não encontrado para exclusão permanente:", targetId);
        alert("Erro: Alvo não encontrado para excluir.");
        return;
    }

    const targetTitle = targetList[targetIndex].title || "Sem título";

    // Confirmação do usuário
    if (!confirm(`Tem certeza que deseja excluir permanentemente o alvo "${targetTitle}"?\n\nEsta ação não pode ser desfeita!`)) {
        return;
    }

    try {
        await deleteDoc(targetRef);
        console.log("Alvo excluído permanentemente de", sourceCollectionName, ":", targetId);

        // Remove da lista local correspondente
        targetList.splice(targetIndex, 1);

        // **IMPORTANTE:** Excluir também os dados de cliques associados
        await deleteClickCountData(targetId);

        filterAndRenderTargets(); // Re-renderiza a lista de onde foi removido

    } catch (error) {
        console.error("Erro ao excluir alvo permanentemente:", error);
        alert("Erro ao excluir o alvo. Tente novamente.");
    }
}

// Função auxiliar para excluir dados de contagem de cliques
async function deleteClickCountData(targetId) {
    if (!currentUser) return; // Precisa do usuário para referência, mas a coleção não é aninhada
    console.log(`[deleteClickCountData] Tentando excluir contagem de cliques para ${targetId}`);
    try {
        const clickCountRef = doc(db, "prayerClickCounts", targetId); // Referência direta ao documento
        await deleteDoc(clickCountRef);
        console.log(`[deleteClickCountData] Contagem de cliques para ${targetId} excluída com sucesso.`);
    } catch (error) {
        // Não impede a exclusão do alvo principal, mas loga o erro
        console.error(`[deleteClickCountData] Erro ao excluir contagem de cliques para ${targetId}:`, error);
        // Poderia notificar o usuário se a exclusão dos cliques falhar, mas não é crítico.
    }
}


// Limpa o formulário de adicionar alvo
function resetTargetForm() {
    const form = document.getElementById('addTargetForm');
    if (form) form.reset();
    // Define a data padrão para hoje
    const dateInput = document.getElementById('targetDate');
    if (dateInput) dateInput.value = formatDateToISO(new Date());
}

// Habilita/desabilita campo de data de resolução baseado no checkbox
function toggleResolutionDateField() {
    const resolvedCheckbox = document.getElementById('editTargetResolved');
    const resolutionDateInput = document.getElementById('editTargetResolutionDate');
    if (resolvedCheckbox && resolutionDateInput) {
        resolutionDateInput.disabled = !resolvedCheckbox.checked;
        if (!resolvedCheckbox.checked) {
            resolutionDateInput.value = ''; // Limpa a data se desmarcar
        } else if (!resolutionDateInput.value) {
            // Se marcar e estiver vazio, preenche com hoje como sugestão
            resolutionDateInput.value = formatDateToISO(new Date());
        }
    }
}

// =============================================
// === FIM GERENCIAMENTO DE ALVOS            ===
// =============================================


// =============================================
// === RENDERIZAÇÃO & FILTRAGEM/ORDENAÇÃO    ===
// =============================================

// Filtra e ordena os alvos com base nas seleções atuais e renderiza
function filterAndRenderTargets() {
    console.log(`[filterAndRenderTargets] Filtro: ${currentFilter}, Ordenação: ${currentSort}`);
    let itemsToRender = [];
    const now = new Date(); // Para filtro de expirados

    // 1. Filtragem
    switch (currentFilter) {
        case 'active':
            itemsToRender = prayerTargets.filter(t => !t.resolved && (!t.deadlineDate || t.deadlineDate >= now || !isDateExpired(t.deadlineDate)));
            break;
        case 'expired':
            itemsToRender = prayerTargets.filter(t => !t.resolved && t.deadlineDate && isDateExpired(t.deadlineDate));
            break;
        case 'resolved':
            // Mostra resolvidos tanto de ativos quanto arquivados
            itemsToRender = [...prayerTargets, ...archivedTargets].filter(t => t.resolved);
            break;
        case 'archived':
            itemsToRender = archivedTargets.filter(t => !t.resolved); // Mostra apenas arquivados não resolvidos
            break;
        case 'all_archived': // Adicionado para ver todos arquivados (incluindo resolvidos)
             itemsToRender = [...archivedTargets];
             break;
        case 'all':
        default:
            // Por padrão (ou 'all'), mostra todos os ativos (não resolvidos/não arquivados)
            itemsToRender = prayerTargets.filter(t => !t.resolved);
            break;
    }

    // 2. Ordenação
    itemsToRender.sort((a, b) => {
        // Fallback para data de criação se a data primária de ordenação for inválida/nula
        const dateA = a.date instanceof Date ? a.date.getTime() : 0;
        const dateB = b.date instanceof Date ? b.date.getTime() : 0;
        const deadlineA = a.deadlineDate instanceof Date ? a.deadlineDate.getTime() : Infinity; // Sem prazo = fim da lista
        const deadlineB = b.deadlineDate instanceof Date ? b.deadlineDate.getTime() : Infinity;
        const titleA = a.title?.toLowerCase() || '';
        const titleB = b.title?.toLowerCase() || '';
        // Data de resolução (se aplicável ao filtro)
        const resolutionDateA = a.resolutionDate instanceof Date ? a.resolutionDate.getTime() : 0;
        const resolutionDateB = b.resolutionDate instanceof Date ? b.resolutionDate.getTime() : 0;
         // Data de arquivamento (se aplicável ao filtro)
         const archivedDateA = a.archivedDate instanceof Date ? a.archivedDate.getTime() : 0;
         const archivedDateB = b.archivedDate instanceof Date ? b.archivedDate.getTime() : 0;


        switch (currentSort) {
            case 'date_asc':
                return dateA - dateB;
            case 'date_desc':
                return dateB - dateA;
            case 'deadline_asc':
                // Trata casos sem prazo corretamente (vão para o final)
                if (deadlineA === Infinity && deadlineB === Infinity) return dateA - dateB; // Desempate pela data de criação
                if (deadlineA === Infinity) return 1; // a (sem prazo) vem depois
                if (deadlineB === Infinity) return -1; // b (sem prazo) vem depois
                return deadlineA - deadlineB; // Ordena por prazo
            case 'deadline_desc':
                 // Trata casos sem prazo corretamente (vão para o início ou fim dependendo da visão)
                 // Aqui, sem prazo vem primeiro na ordem desc (mais longe)
                 if (deadlineA === Infinity && deadlineB === Infinity) return dateB - dateA; // Desempate pela data de criação desc
                 if (deadlineA === Infinity) return -1; // a (sem prazo) vem antes
                 if (deadlineB === Infinity) return 1; // b (sem prazo) vem antes
                 return deadlineB - deadlineA; // Ordena por prazo desc
            case 'title_asc':
                return titleA.localeCompare(titleB);
            case 'title_desc':
                return titleB.localeCompare(titleA);
            case 'resolution_date_desc': // Relevante para filtro 'resolved'
                 return (resolutionDateB || archivedDateB || dateB) - (resolutionDateA || archivedDateA || dateA); // Usa fallback
             case 'archived_date_desc': // Relevante para filtros de arquivados
                 return (archivedDateB || resolutionDateB || dateB) - (archivedDateA || resolutionDateA || dateA); // Usa fallback
            default:
                return dateB - dateA; // Default: data desc
        }
    });

    // 3. Renderiza a lista filtrada e ordenada
    renderTargetList(itemsToRender);

    // 4. Atualiza UI dos botões de filtro/ordenação
    updateFilterSortUI();
}


// Renderiza a lista de alvos no DOM
function renderTargetList(targets) {
    const targetListDiv = document.getElementById('targetList');
    const archivedTargetListDiv = document.getElementById('archivedTargetList'); // Assume que existe
    const noTargetsMessage = document.getElementById('noTargetsMessage');
    const noArchivedTargetsMessage = document.getElementById('noArchivedTargetsMessage'); // Assume que existe
    const archivedSection = document.getElementById('archivedSection'); // Container da lista arquivada

    if (!targetListDiv || !archivedTargetListDiv || !noTargetsMessage || !noArchivedTargetsMessage || !archivedSection) {
        console.error("Elementos da UI para listas de alvos não encontrados.");
        return;
    }

    // Limpa ambas as listas antes de renderizar
    targetListDiv.innerHTML = '';
    archivedTargetListDiv.innerHTML = '';

    // Separa os itens que devem ir para a lista principal e para a lista de arquivados
    const mainListItems = [];
    const archivedListItems = [];

    targets.forEach(target => {
        if (currentFilter === 'archived' || currentFilter === 'all_archived' || (currentFilter === 'resolved' && target.archivedDate)) {
             // Se o filtro for especificamente de arquivados, ou
             // se for filtro de resolvidos E o item tiver data de arquivamento
             archivedListItems.push(target);
        } else if (currentFilter !== 'archived' && currentFilter !== 'all_archived') {
             // Qualquer outro filtro que não seja especificamente de arquivados vai para a lista principal
             mainListItems.push(target);
        }
    });


    // Renderiza a lista principal (ativos ou outros filtros não-arquivados)
    if (mainListItems.length > 0) {
        mainListItems.forEach(target => {
            const itemDiv = createTargetElement(target, false); // false = não é arquivado
            targetListDiv.appendChild(itemDiv);
        });
        noTargetsMessage.style.display = 'none';
    } else {
        // Mostra mensagem apenas se o filtro NÃO for um de arquivados
        if (currentFilter !== 'archived' && currentFilter !== 'all_archived') {
            noTargetsMessage.textContent = getNoItemsMessage(currentFilter);
            noTargetsMessage.style.display = 'block';
        } else {
            noTargetsMessage.style.display = 'none'; // Esconde se o filtro é de arquivados
        }
    }


    // Renderiza a lista de arquivados (se houver itens ou se o filtro for de arquivados)
    if (archivedListItems.length > 0 || currentFilter === 'archived' || currentFilter === 'all_archived') {
         archivedSection.style.display = 'block'; // Mostra a seção de arquivados
         if (archivedListItems.length > 0) {
             archivedListItems.forEach(target => {
                const itemDiv = createTargetElement(target, true); // true = é arquivado
                archivedTargetListDiv.appendChild(itemDiv);
             });
             noArchivedTargetsMessage.style.display = 'none';
         } else {
             // Mostra mensagem se o filtro for de arquivados e não houver itens
              noArchivedTargetsMessage.textContent = getNoItemsMessage(currentFilter);
              noArchivedTargetsMessage.style.display = 'block';
         }
    } else {
         archivedSection.style.display = 'none'; // Esconde a seção de arquivados
    }

}


// Cria o elemento HTML para um único alvo
function createTargetElement(target, isArchivedView) {
    if (!target || !target.id) return document.createElement('div'); // Retorna div vazia se inválido

    const itemDiv = document.createElement('div');
    itemDiv.classList.add('target-item');
    itemDiv.dataset.targetId = target.id; // Adiciona ID para referência

    // Adiciona classes de estado
    if (target.resolved) itemDiv.classList.add('resolved');
    if (target.deadlineDate && isDateExpired(target.deadlineDate) && !target.resolved) itemDiv.classList.add('expired');
    if (isArchivedView) itemDiv.classList.add('archived-item-view'); // Classe específica se está na lista de arquivados


    // --- Conteúdo do Item ---
    let contentHTML = `<h3>${target.title || 'Sem Título'}</h3>`;
    contentHTML += `<p class="target-date">Criado em: ${formatDateForDisplay(target.date)} (${timeElapsed(target.date)})</p>`;

    if (target.deadlineDate) {
        contentHTML += `<p class="target-deadline ${isDateExpired(target.deadlineDate) && !target.resolved ? 'text-danger' : ''}">
                            Prazo: ${formatDateForDisplay(target.deadlineDate)}
                       </p>`;
    }

    if (target.resolved && target.resolutionDate) {
        contentHTML += `<p class="target-resolution text-success">Resolvido em: ${formatDateForDisplay(target.resolutionDate)}</p>`;
    } else if (target.resolved) {
         contentHTML += `<p class="target-resolution text-success">Resolvido (data não informada)</p>`;
    }

     if (isArchivedView && target.archivedDate) {
        contentHTML += `<p class="target-archived-date">Arquivado em: ${formatDateForDisplay(target.archivedDate)}</p>`;
    }

    if (target.details) {
        contentHTML += `<p class="target-details"><i>${target.details.substring(0, 150)}${target.details.length > 150 ? '...' : ''}</i></p>`;
    }

    // Última observação (se houver)
    if (Array.isArray(target.observations) && target.observations.length > 0) {
        // Ordena para pegar a mais recente (assumindo que 'date' é Date object ou null)
        const sortedObservations = [...target.observations].sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
        const lastObs = sortedObservations[0];
        if (lastObs && lastObs.text) {
             contentHTML += `<p class="target-last-observation"><i>Última Obs (${formatDateForDisplay(lastObs.date)}): ${lastObs.text.substring(0,100)}${lastObs.text.length > 100 ? '...' : ''}</i></p>`;
        }
    }


    // --- Botões de Ação ---
    contentHTML += `<div class="target-actions">`;

    if (isArchivedView) {
        // Ações para itens na lista de arquivados
        contentHTML += `<button class="btn btn-sm btn-success" onclick="window.unarchiveTarget('${target.id}')" title="Restaurar Alvo"><i class="fas fa-undo"></i> Restaurar</button>`;
        contentHTML += `<button class="btn btn-sm btn-danger" onclick="window.deleteTargetPermanently('${target.id}')" title="Excluir Permanentemente"><i class="fas fa-trash-alt"></i> Excluir</button>`;
        // Opcional: Botão de editar mesmo arquivado (pode precisar reativar antes)
        contentHTML += `<button class="btn btn-sm btn-secondary" onclick="window.openEditModal('${target.id}')" title="Ver/Editar Detalhes"><i class="fas fa-edit"></i> Detalhes</button>`;

    } else {
        // Ações para itens na lista principal (ativos)
        contentHTML += `<button class="btn btn-sm btn-primary btn-pray" onclick="window.registerPrayer('${target.id}', this)" title="Marcar como 'Orei por este alvo hoje'"><i class="fas fa-praying-hands"></i> Orei!</button>`;
        contentHTML += `<button class="btn btn-sm btn-info" onclick="window.openEditModal('${target.id}')" title="Editar Alvo"><i class="fas fa-edit"></i> Editar</button>`;
        if (!target.resolved) {
             contentHTML += `<button class="btn btn-sm btn-success" onclick="window.markAsResolved('${target.id}')" title="Marcar como Respondido"><i class="fas fa-check-circle"></i> Resolvido</button>`;
             contentHTML += `<button class="btn btn-sm btn-warning" onclick="window.archiveTarget('${target.id}')" title="Arquivar Alvo"><i class="fas fa-archive"></i> Arquivar</button>`;
        } else {
            // Se já resolvido, talvez botão para desarquivar se for o caso, ou apenas arquivar
             contentHTML += `<button class="btn btn-sm btn-warning" onclick="window.archiveTarget('${target.id}')" title="Arquivar Alvo Resolvido"><i class="fas fa-archive"></i> Arquivar</button>`;
        }
    }

    contentHTML += `</div>`; // Fim target-actions

    itemDiv.innerHTML = contentHTML;
    return itemDiv;
}


// Renderiza a lista de observações no modal de edição
function renderObservations(listElementId, observations) {
    const listDiv = document.getElementById(listElementId);
    if (!listDiv) return;
    listDiv.innerHTML = ''; // Limpa

    if (!Array.isArray(observations) || observations.length === 0) {
        listDiv.innerHTML = '<p>Nenhuma observação registrada.</p>';
        return;
    }

    // Ordena por data descendente (mais recentes primeiro)
    const sortedObservations = [...observations].sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));

    const ul = document.createElement('ul');
    ul.classList.add('list-group', 'list-group-flush'); // Usa classes Bootstrap para estilizar

    sortedObservations.forEach((obs, index) => {
        const originalIndex = observations.indexOf(obs); // Encontra o índice original para a função delete

        const li = document.createElement('li');
        li.classList.add('list-group-item', 'd-flex', 'justify-content-between', 'align-items-start');

        li.innerHTML = `
            <div class="ms-2 me-auto">
                <div class="fw-bold">${formatDateForDisplay(obs.date)}</div>
                ${obs.text || 'Observação sem texto.'}
            </div>
            <button type="button" class="btn btn-sm btn-outline-danger" onclick="window.deleteObservation(${originalIndex})" title="Remover Observação">
                 <i class="fas fa-times"></i>
             </button>
        `;
        ul.appendChild(li);
    });

    listDiv.appendChild(ul);
}

// Retorna a mensagem apropriada para quando não há itens na lista
function getNoItemsMessage(filter) {
    switch (filter) {
        case 'active': return "Nenhum alvo ativo no momento.";
        case 'expired': return "Nenhum alvo ativo com prazo expirado.";
        case 'resolved': return "Nenhum alvo marcado como resolvido.";
        case 'archived': return "Nenhum alvo arquivado (e não resolvido).";
        case 'all_archived': return "Nenhum alvo na lista de arquivados.";
        case 'all':
        default: return "Você ainda não adicionou nenhum alvo de oração ativo.";
    }
}

// Atualiza a classe 'active' nos botões de filtro e o valor do select de ordenação
function updateFilterSortUI() {
    // Filtros
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === currentFilter);
    });
    // Ordenação
    const sortSelect = document.getElementById('sortOptions');
    if (sortSelect) {
        sortSelect.value = currentSort;
    }
}

// Define o filtro atual e re-renderiza
function setFilter(filter) {
    currentFilter = filter;
    console.log("Filtro definido para:", currentFilter);
    // Ajusta opções de ordenação disponíveis/padrão baseado no filtro
     const sortSelect = document.getElementById('sortOptions');
     if (sortSelect) {
         // Se filtrar por resolvidos ou arquivados, talvez mudar ordenação padrão
         if (filter === 'resolved' && currentSort !== 'resolution_date_desc') {
              currentSort = 'resolution_date_desc';
              sortSelect.value = currentSort;
         } else if ((filter === 'archived' || filter === 'all_archived') && currentSort !== 'archived_date_desc') {
              currentSort = 'archived_date_desc';
              sortSelect.value = currentSort;
         } else if (filter !== 'resolved' && filter !== 'archived' && filter !== 'all_archived' && (currentSort === 'resolution_date_desc' || currentSort === 'archived_date_desc')) {
             // Se voltar para filtros não-arquivados/resolvidos, volta pra ordenação padrão por data
              currentSort = 'date_desc';
              sortSelect.value = currentSort;
         }
     }

    filterAndRenderTargets();
}

// Define a ordenação atual e re-renderiza
function setSort(sort) {
    currentSort = sort;
    console.log("Ordenação definida para:", currentSort);
    filterAndRenderTargets();
}

// =============================================
// === FIM RENDERIZAÇÃO & FILTRAGEM          ===
// =============================================


// =============================================
// === PERSEVERANÇA (BARRA & QUADRO SEMANAL) ===
// =============================================

// **ATUALIZADO:** Carrega dados de perseverança do Firestore
async function loadPerseveranceData(userId) {
    console.log(`[loadPerseveranceData] Carregando perseverança para ${userId}`);
    const perseveranceDocRef = doc(db, "perseveranceData", userId);
    try {
        const docSnap = await getDoc(perseveranceDocRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            // Reidrata dados com cuidado, convertendo Timestamp e validando log
            perseveranceData.consecutiveDays = Number(data.consecutiveDays) || 0;
            perseveranceData.recordDays = Number(data.recordDays) || 0;
            // Converte Timestamp para Date, ou mantém null
            perseveranceData.lastInteractionDate = data.lastInteractionDate instanceof Timestamp
                ? data.lastInteractionDate.toDate()
                : null;
            // **NOVO:** Carrega e VALIDA o log de confirmação
            perseveranceData.confirmationLog = Array.isArray(data.confirmationLog)
                ? data.confirmationLog.filter(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) // Garante strings YYYY-MM-DD
                : []; // Garante que seja um array vazio se inválido/ausente
            console.log('[loadPerseveranceData] Dados carregados:', JSON.stringify(perseveranceData));

        } else {
            console.log("[loadPerseveranceData] Nenhum dado encontrado, inicializando localmente.");
            // Inicializa localmente com log vazio se não houver dados no Firestore
            perseveranceData = { consecutiveDays: 0, lastInteractionDate: null, recordDays: 0, confirmationLog: [] };
            // Opcional: Salvar estado inicial no Firestore se desejado
            // await updatePerseveranceFirestore(userId, perseveranceData);
        }
        updatePerseveranceUI(); // Atualiza a barra de progresso E o quadro semanal

    } catch (error) {
        console.error("[loadPerseveranceData] Erro ao carregar dados de perseverança:", error);
        // Reseta dados locais e UI em caso de erro
        perseveranceData = { consecutiveDays: 0, lastInteractionDate: null, recordDays: 0, confirmationLog: [] };
        updatePerseveranceUI(); // Atualiza UI com dados resetados
    }
}

// **ATUALIZADO:** Confirma a perseverança para o dia atual
async function confirmPerseverance() {
    if (!currentUser) { alert("Erro: Usuário não autenticado."); return; }
    const userId = currentUser.uid;

    const today = new Date();
    const todayStr = formatDateToISO(today); // Formato YYYY-MM-DD para o log
    const todayDatePart = createUTCDate(todayStr); // Objeto Date representando hoje 00:00 UTC

    // **NOVA VERIFICAÇÃO:** Checa se a data de hoje JÁ está no log
    if (perseveranceData.confirmationLog.includes(todayStr)) {
        console.log('[confirmPerseverance] Perseverança já confirmada hoje.');
        alert(`Perseverança já confirmada para hoje (${formatDateForDisplay(today)})!\nDias consecutivos: ${perseveranceData.consecutiveDays}.\nRecorde: ${perseveranceData.recordDays} dias.`);
        return; // Impede múltiplas confirmações no mesmo dia
    }

    // --- Lógica para dias CONSECUTIVOS (baseada em lastInteractionDate) - MANTIDA ---
    let lastInteractionDatePart = null;
    if (perseveranceData.lastInteractionDate instanceof Date && !isNaN(perseveranceData.lastInteractionDate)) {
        // Obtém apenas a parte da data (UTC) da última interação para comparação
        lastInteractionDatePart = createUTCDate(formatDateToISO(perseveranceData.lastInteractionDate));
    }

    let isConsecutive = false;
    if (lastInteractionDatePart && todayDatePart) {
        // Calcula o dia anterior a hoje (em UTC)
        const expectedYesterdayDatePart = new Date(todayDatePart.getTime() - 24 * 60 * 60 * 1000);
        // Compara se a última interação foi exatamente no dia anterior
        if (lastInteractionDatePart.getTime() === expectedYesterdayDatePart.getTime()) {
            isConsecutive = true;
        }
    }
    console.log(`[confirmPerseverance] É consecutivo? ${isConsecutive}`);

    // --- Atualiza dados de perseverança (consecutivos, recorde, última interação) ---
    const previousConsecutiveDays = perseveranceData.consecutiveDays || 0;
    perseveranceData.consecutiveDays = isConsecutive ? previousConsecutiveDays + 1 : 1; // Reseta para 1 se não for consecutivo
    perseveranceData.lastInteractionDate = today; // Armazena o timestamp COMPLETO da confirmação de hoje
    perseveranceData.recordDays = Math.max(perseveranceData.recordDays || 0, perseveranceData.consecutiveDays); // Atualiza recorde

    // --- NOVO: Atualiza o LOG de confirmação ---
    // Adiciona a data de hoje (YYYY-MM-DD) ao log (verificação dupla por segurança)
    if (!perseveranceData.confirmationLog.includes(todayStr)) {
         perseveranceData.confirmationLog.push(todayStr);
    }
    // Mantém apenas as últimas N datas (ex: 14 dias) - opcional mas recomendado
    const logLimit = 14;
    if (perseveranceData.confirmationLog.length > logLimit) {
        // Pega os últimos 'logLimit' elementos
        perseveranceData.confirmationLog = perseveranceData.confirmationLog.slice(-logLimit);
    }
    // Ordena o log (opcional, mas ajuda na depuração e leitura)
    perseveranceData.confirmationLog.sort();

    console.log('[confirmPerseverance] Dados de perseverança atualizados:', JSON.stringify(perseveranceData));

    // --- Salva no Firestore e atualiza UI ---
    try {
        await updatePerseveranceFirestore(userId, perseveranceData); // Passa o objeto completo atualizado
        console.log('[confirmPerseverance] Firestore atualizado. Atualizando UI.');
        updatePerseveranceUI(); // Atualiza barra E quadro semanal
        alert(`Perseverança confirmada!\nDias consecutivos: ${perseveranceData.consecutiveDays}.\nRecorde: ${perseveranceData.recordDays} dias.`);
    } catch (error) {
        console.error("[confirmPerseverance] Erro ao atualizar Firestore:", error);
        alert("Erro ao salvar dados de perseverança. Sua confirmação pode não ter sido registrada.");
        // Poderia tentar reverter as alterações locais aqui se o save falhar
    }
}


// **ATUALIZADO:** Salva os dados de perseverança (incluindo o log) no Firestore
async function updatePerseveranceFirestore(userId, data) {
    const perseveranceDocRef = doc(db, "perseveranceData", userId);
    // Prepara dados para Firestore, garantindo tipos corretos
    const dataToSave = {
        consecutiveDays: data.consecutiveDays || 0,
        // Converte Date de volta para Timestamp, ou null se inválido/ausente
        lastInteractionDate: data.lastInteractionDate instanceof Date && !isNaN(data.lastInteractionDate)
            ? Timestamp.fromDate(data.lastInteractionDate)
            : null,
        recordDays: data.recordDays || 0,
        // Garante que confirmationLog é um array de strings antes de salvar
        confirmationLog: Array.isArray(data.confirmationLog)
            ? data.confirmationLog.filter(d => typeof d === 'string') // Garante que são strings
            : []
    };
    // Usa setDoc com merge:true para criar ou atualizar o documento
    await setDoc(perseveranceDocRef, dataToSave, { merge: true });
    console.log("[updatePerseveranceFirestore] Dados de perseverança salvos para", userId);
}


// **ATUALIZADO:** Atualiza a UI de perseverança (barra E quadro semanal)
function updatePerseveranceUI() {
    console.log('[updatePerseveranceUI] Atualizando barra de progresso e quadro semanal.');

    // --- Atualiza Barra de Progresso (baseada em dias CONSECUTIVOS) ---
    const consecutiveDays = perseveranceData.consecutiveDays || 0;
    const targetDays = 30; // Meta para a barra (ex: 30 dias)
    const percentage = Math.min(Math.max(0, (consecutiveDays / targetDays) * 100), 100); // % entre 0 e 100
    const progressBar = document.getElementById('perseveranceProgressBar');
    const percentageDisplay = document.getElementById('perseverancePercentage');

    if (progressBar && percentageDisplay) {
        progressBar.style.width = `${percentage}%`;
        progressBar.setAttribute('aria-valuenow', consecutiveDays);
        percentageDisplay.textContent = `${consecutiveDays} dia${consecutiveDays !== 1 ? 's' : ''}`;
    } else {
        console.warn("Elementos da UI de perseverança (barra/percentual) não encontrados.");
    }

    // --- Chama a NOVA função para atualizar o Quadro Semanal (baseada no LOG) ---
    updateWeeklyChartBasedOnLog();
}

// **NOVA FUNÇÃO:** Atualiza o quadro semanal baseado no LOG de confirmações
function updateWeeklyChartBasedOnLog() {
    console.log('[updateWeeklyChartBasedOnLog] Atualizando quadro baseado no log:', perseveranceData.confirmationLog);
    const today = new Date();
    const startOfWeek = getStartOfWeek(today); // Obtém o Domingo da semana ATUAL

    // O log contém as datas YYYY-MM-DD das confirmações
    const currentWeekConfirmationDates = perseveranceData.confirmationLog || [];

    // Itera pelos 7 dias da semana (0=Domingo, 1=Segunda, ..., 6=Sábado)
    for (let i = 0; i < 7; i++) {
        // ***** CORREÇÃO 1: Usar template literals (backticks) *****
        const dayTick = document.getElementById(`day-${i}`); // Pega o elemento do dia (ex: day-0)
        if (dayTick) {
            // Calcula a data correspondente ao dia 'i' da SEMANA ATUAL
            const chartDay = new Date(startOfWeek);
            chartDay.setDate(startOfWeek.getDate() + i);
            const chartDayStr = formatDateToISO(chartDay); // Formata para YYYY-MM-DD

            // Verifica se a data calculada (chartDayStr) existe no log de confirmações
            if (currentWeekConfirmationDates.includes(chartDayStr)) {
                dayTick.classList.add('active'); // Marca como ativo se houve confirmação nesse dia
                // console.log(`[updateWeeklyChartBasedOnLog] Dia ${i} (${chartDayStr}) está ATIVO.`);
            } else {
                dayTick.classList.remove('active'); // Garante que está inativo se não houve confirmação
                // console.log(`[updateWeeklyChartBasedOnLog] Dia ${i} (${chartDayStr}) está INATIVO.`);
            }
        } else {
             // console.warn(`[updateWeeklyChartBasedOnLog] Elemento day-${i} não encontrado.`);
        }
    }
}

// Reseta APENAS o quadro semanal (remove todas as marcas 'active')
function resetWeeklyChart() {
    console.log('[resetWeeklyChart] Resetando todos os ticks do quadro semanal.');
    for (let i = 0; i < 7; i++) {
        // ***** CORREÇÃO 1 (Aplicada aqui também por consistência): Usar template literals *****
        const dayTick = document.getElementById(`day-${i}`);
        if (dayTick) {
            dayTick.classList.remove('active');
        }
    }
}

// Reseta TODA a UI de perseverança (barra e quadro) para o estado inicial
function resetPerseveranceUI() {
    const progressBar = document.getElementById('perseveranceProgressBar');
    const percentageDisplay = document.getElementById('perseverancePercentage');
    if (progressBar && percentageDisplay) {
        progressBar.style.width = `0%`;
        progressBar.setAttribute('aria-valuenow', 0);
        percentageDisplay.textContent = `0 dias`;
    }
    resetWeeklyChart(); // Garante que o quadro semanal também seja resetado
}


// =============================================
// === FIM PERSEVERANÇA                      ===
// =============================================


// =============================================
// === REGISTRO DE ORAÇÃO ('Orei!')          ===
// =============================================

// Registra um clique de oração para um alvo específico
async function registerPrayer(targetId, buttonElement) {
    if (!currentUser) { alert("Faça login para registrar sua oração."); return; }

    console.log(`[registerPrayer] Registrando oração para ${targetId}`);
    // Desabilita o botão temporariamente para evitar cliques múltiplos
    if (buttonElement) buttonElement.disabled = true;

    const now = new Date();
    const clickTimestamp = Timestamp.fromDate(now); // Timestamp para Firestore
    // Chave para mapa mensal: YYYY-MM
    const currentMonthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    // Chave para mapa anual: YYYY
    const currentYear = now.getFullYear().toString();

    const clickCountsRef = doc(db, "prayerClickCounts", targetId); // Coleção separada para contagens

    try {
        // Tenta ler o documento atual para incrementar
        const docSnap = await getDoc(clickCountsRef);
        let newTotalClicks = 1;
        let monthlyClicks = { [currentMonthYear]: 1 };
        let yearlyClicks = { [currentYear]: 1 };

        if (docSnap.exists()) {
            const data = docSnap.data();
            newTotalClicks = (data.totalClicks || 0) + 1;
            // Incrementa o mês atual, inicializando se necessário
            monthlyClicks = data.monthlyClicks || {};
            monthlyClicks[currentMonthYear] = (monthlyClicks[currentMonthYear] || 0) + 1;
            // Incrementa o ano atual, inicializando se necessário
            yearlyClicks = data.yearlyClicks || {};
            yearlyClicks[currentYear] = (yearlyClicks[currentYear] || 0) + 1;
        }

        // Prepara os dados para salvar/atualizar
        const dataToSave = {
            targetId: targetId, // Guarda referência ao alvo
            userId: currentUser.uid, // Guarda referência ao usuário (bom para regras de segurança)
            totalClicks: newTotalClicks,
            monthlyClicks: monthlyClicks,
            yearlyClicks: yearlyClicks,
            lastClickTimestamp: clickTimestamp // Guarda o timestamp do último clique
        };

        // Usa setDoc com merge: true para criar ou atualizar o documento de contagem
        await setDoc(clickCountsRef, dataToSave, { merge: true });

        console.log(`[registerPrayer] Oração registrada com sucesso para ${targetId}. Total: ${newTotalClicks}`);
        // Feedback visual temporário no botão
        if (buttonElement) {
            buttonElement.innerHTML = '<i class="fas fa-check"></i> Registrado!';
            buttonElement.classList.add('btn-success'); // Muda cor temporariamente
            buttonElement.classList.remove('btn-primary');
             // Reabilita e volta ao normal após um tempo
             setTimeout(() => {
                 buttonElement.innerHTML = '<i class="fas fa-praying-hands"></i> Orei!';
                 buttonElement.classList.remove('btn-success');
                 buttonElement.classList.add('btn-primary');
                 buttonElement.disabled = false;
             }, 1500); // 1.5 segundos de feedback
        }

        // **IMPORTANTE:** Chama a confirmação de perseverança GERAL do dia
        // Isso garante que a barra/quadro sejam atualizados mesmo clicando em 'Orei!'
        await confirmPerseverance();

    } catch (error) {
        console.error(`[registerPrayer] Erro ao registrar oração para ${targetId}:`, error);
        alert("Erro ao registrar sua oração. Tente novamente.");
        // Reabilita o botão em caso de erro
        if (buttonElement) {
             buttonElement.disabled = false;
             buttonElement.innerHTML = '<i class="fas fa-praying-hands"></i> Orei!'; // Restaura texto original
        }
    }
}

// =============================================
// === FIM REGISTRO DE ORAÇÃO                ===
// =============================================


// =============================================
// === MODO APRESENTAÇÃO                     ===
// =============================================

// Inicia o modo de apresentação
function startPresentationMode() {
    // Filtra apenas alvos ATIVOS e NÃO RESOLVIDOS para apresentação
    presentedTargetsList = prayerTargets.filter(target => !target.resolved);

    // Ordena por 'lastPresentedDate' ascendente (os não apresentados ou mais antigos primeiro)
    // nulls first, then by date ascending
    presentedTargetsList.sort((a, b) => {
        const dateA = a.lastPresentedDate instanceof Date ? a.lastPresentedDate.getTime() : -Infinity; // null/undefined vem antes
        const dateB = b.lastPresentedDate instanceof Date ? b.lastPresentedDate.getTime() : -Infinity;
        if (dateA !== dateB) return dateA - dateB;
        // Desempate pela data de criação (mais antigos primeiro)
        return (a.date?.getTime() || 0) - (b.date?.getTime() || 0);
    });


    if (presentedTargetsList.length === 0) {
        alert("Não há alvos ativos para apresentar no momento.");
        return;
    }

    currentPresentTargetIndex = 0; // Começa pelo primeiro da lista ordenada
    displayCurrentPresentationTarget();
    openModal('presentationModal');
}

// Exibe o alvo atual no modal de apresentação
function displayCurrentPresentationTarget() {
    const modalBody = document.getElementById('presentationBody');
    const modalTitle = document.getElementById('presentationModalLabel'); // Assume que o título do modal tem este ID
    const targetCounter = document.getElementById('presentationCounter'); // Span para contador

    if (!modalBody || !modalTitle || !targetCounter) { console.error("Elementos do modal de apresentação não encontrados."); return; }

    if (currentPresentTargetIndex < 0 || currentPresentTargetIndex >= presentedTargetsList.length) {
        modalBody.innerHTML = '<p>Fim da apresentação.</p>';
        modalTitle.textContent = "Apresentação Concluída";
        targetCounter.textContent = '';
        // Opcional: Desabilitar botão "Próximo"
        document.getElementById('nextTargetButton').disabled = true;
        return;
    }

     // Habilita botão "Próximo" caso estivesse desabilitado
     document.getElementById('nextTargetButton').disabled = false;


    const target = presentedTargetsList[currentPresentTargetIndex];

    modalTitle.textContent = `Apresentando: ${target.title || 'Sem Título'}`;
    targetCounter.textContent = `(${currentPresentTargetIndex + 1} de ${presentedTargetsList.length})`; // Atualiza contador

    let contentHTML = `<h2>${target.title || 'Sem Título'}</h2>`;
    contentHTML += `<p><strong>Criado em:</strong> ${formatDateForDisplay(target.date)} (${timeElapsed(target.date)})</p>`;
    if (target.deadlineDate) {
        contentHTML += `<p><strong>Prazo:</strong> ${formatDateForDisplay(target.deadlineDate)}</p>`;
    }
    if (target.details) {
        contentHTML += `<p><strong>Detalhes:</strong><br>${target.details.replace(/\n/g, '<br>')}</p>`; // Mantém quebras de linha
    }

    // Exibe observações, se houver
     if (Array.isArray(target.observations) && target.observations.length > 0) {
         contentHTML += `<h4>Observações:</h4><ul>`;
         // Ordena por data descendente para exibição
         const sortedObservations = [...target.observations].sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
         sortedObservations.forEach(obs => {
             contentHTML += `<li><strong>${formatDateForDisplay(obs.date)}:</strong> ${obs.text}</li>`;
         });
         contentHTML += `</ul>`;
     }

    modalBody.innerHTML = contentHTML;
}

// Avança para o próximo alvo na apresentação e marca o atual como apresentado
async function nextPresentationTarget() {
    if (!currentUser) return;
    if (currentPresentTargetIndex < 0 || currentPresentTargetIndex >= presentedTargetsList.length) return; // Já terminou

    const presentedTarget = presentedTargetsList[currentPresentTargetIndex];
    const nowTimestamp = Timestamp.now();

    // Marca o alvo ATUAL como apresentado no Firestore
    try {
        const targetRef = doc(db, "users", currentUser.uid, "prayerTargets", presentedTarget.id);
        await updateDoc(targetRef, {
            lastPresentedDate: nowTimestamp
        });
        console.log(`Alvo ${presentedTarget.id} marcado como apresentado.`);
        // Atualiza localmente também
        const targetInMainList = prayerTargets.find(t => t.id === presentedTarget.id);
        if (targetInMainList) {
            targetInMainList.lastPresentedDate = nowTimestamp.toDate();
        }
    } catch (error) {
        console.error(`Erro ao marcar alvo ${presentedTarget.id} como apresentado:`, error);
        // Continua mesmo se falhar em marcar, para não travar a apresentação
    }

    // Avança para o próximo
    currentPresentTargetIndex++;
    displayCurrentPresentationTarget(); // Exibe o próximo ou a mensagem de fim
}

// Fecha o modal de apresentação e reseta o estado
function closePresentationMode() {
    closeModal('presentationModal');
    currentPresentTargetIndex = -1;
    presentedTargetsList = [];
    filterAndRenderTargets(); // Re-renderiza lista principal para refletir 'lastPresentedDate' na ordenação se necessário
}


// =============================================
// === FIM MODO APRESENTAÇÃO                 ===
// =============================================


// =============================================
// === MODAL HANDLING                        ===
// =============================================

// Abre um modal pelo ID
function openModal(modalId) {
    const modalElement = document.getElementById(modalId);
    if (modalElement) {
        // Cria e mostra o modal Bootstrap 5
        const modalInstance = new bootstrap.Modal(modalElement);
        modalInstance.show();

        // Adiciona um listener para limpar o formulário ou estado quando o modal for fechado
         modalElement.addEventListener('hidden.bs.modal', () => {
             if (modalId === 'addTargetModal') {
                 resetTargetForm();
             }
             if (modalId === 'editTargetModal') {
                  currentEditTargetId = null; // Limpa ID de edição ao fechar
                  // Limpa lista de observações no modal para não mostrar as do alvo anterior
                  const obsList = document.getElementById('editTargetObservationsList');
                  if(obsList) obsList.innerHTML = '';
                  // Poderia resetar outros campos do form de edição se necessário
             }
             if (modalId === 'presentationModal') {
                 // A limpeza já é feita em closePresentationMode, mas garante
                 currentPresentTargetIndex = -1;
                 presentedTargetsList = [];
             }
             // Remove o backdrop manualmente se ele persistir (bug ocasional do Bootstrap?)
             const backdrop = document.querySelector('.modal-backdrop');
             if (backdrop) {
                 try {
                    backdrop.parentNode.removeChild(backdrop);
                 } catch (e) { /* Ignore if already removed */ }
             }
             // Garante que o scroll do body seja restaurado
              document.body.classList.remove('modal-open'); // Garante remoção da classe
             document.body.style.overflow = 'auto';
             document.body.style.paddingRight = ''; // Remove padding adicionado pelo Bootstrap
         }, { once: true }); // Executa o listener apenas uma vez após o fechamento

    } else {
        console.error("Modal não encontrado:", modalId);
    }
}

// Fecha um modal pelo ID
function closeModal(modalId) {
    const modalElement = document.getElementById(modalId);
    if (modalElement) {
        const modalInstance = bootstrap.Modal.getInstance(modalElement);
        if (modalInstance) {
            modalInstance.hide();
        } else {
             // Fallback se a instância não for encontrada
             modalElement.classList.remove('show');
             modalElement.style.display = 'none';
             modalElement.setAttribute('aria-hidden', 'true');
             modalElement.removeAttribute('aria-modal');
             modalElement.removeAttribute('role');
             // Remove backdrop manualmente
             const backdrop = document.querySelector('.modal-backdrop');
              if (backdrop) {
                 try {
                    backdrop.parentNode.removeChild(backdrop);
                 } catch (e) { /* Ignore */ }
             }
             document.body.classList.remove('modal-open');
             document.body.style.overflow = 'auto';
             document.body.style.paddingRight = '';
        }
    }
}

// =============================================
// === FIM MODAL HANDLING                    ===
// =============================================


// =============================================
// === EVENT LISTENERS GLOBAIS               ===
// =============================================

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM totalmente carregado e parseado.");

    // Botões de Autenticação
    const btnGoogleLogin = document.getElementById('btnGoogleLogin');
    const btnLogout = document.getElementById('btnLogout');
    if (btnGoogleLogin) btnGoogleLogin.addEventListener('click', signInWithGoogle);
    if (btnLogout) btnLogout.addEventListener('click', logout);

    // Botão Adicionar Alvo (abre modal)
    const addTargetButton = document.getElementById('addTargetButton');
    if (addTargetButton) addTargetButton.addEventListener('click', () => openModal('addTargetModal'));

    // Formulário Adicionar Alvo
    const addTargetForm = document.getElementById('addTargetForm');
    if (addTargetForm) addTargetForm.addEventListener('submit', addPrayerTarget);

    // Formulário Editar Alvo
    const editTargetForm = document.getElementById('editTargetForm');
    if (editTargetForm) editTargetForm.addEventListener('submit', saveEditedTarget);

    // Checkbox Resolvido no Modal de Edição
    const editResolvedCheckbox = document.getElementById('editTargetResolved');
    if (editResolvedCheckbox) editResolvedCheckbox.addEventListener('change', toggleResolutionDateField);

    // Botão Adicionar Observação
    const addObservationButton = document.getElementById('addObservationButton');
    if (addObservationButton) addObservationButton.addEventListener('click', addObservation);

    // Botões de Filtro
    document.querySelectorAll('.filter-btn').forEach(button => {
        button.addEventListener('click', () => setFilter(button.dataset.filter));
    });

    // Select de Ordenação
    const sortOptions = document.getElementById('sortOptions');
    if (sortOptions) sortOptions.addEventListener('change', (e) => setSort(e.target.value));

    // Botão Confirmar Perseverança (Listener aqui em vez de onclick no HTML)
    const confirmPerseveranceButton = document.getElementById('confirmPerseveranceButton');
    if (confirmPerseveranceButton) confirmPerseveranceButton.addEventListener('click', confirmPerseverance);
    // **NOTA:** Se você MANTIVER o onclick="confirmPerseverance()" no HTML, a linha abaixo é necessária.
    // Se remover o onclick do HTML e usar o listener acima, a linha abaixo NÃO é necessária.
    // Por segurança e compatibilidade com onclick, vamos expor globalmente.

     // Botão Iniciar Apresentação
     const startPresentationButton = document.getElementById('startPresentationButton');
     if (startPresentationButton) startPresentationButton.addEventListener('click', startPresentationMode);

     // Botão Próximo Alvo (Modo Apresentação)
     const nextTargetButton = document.getElementById('nextTargetButton');
     if (nextTargetButton) nextTargetButton.addEventListener('click', nextPresentationTarget);

     // Botão Fechar (Modo Apresentação - no rodapé do modal)
     const closePresentationButton = document.getElementById('closePresentationButton');
      if (closePresentationButton) closePresentationButton.addEventListener('click', closePresentationMode);

      // Adiciona listeners para fechar modais clicando no 'X' (data-bs-dismiss="modal")
      // O Bootstrap já cuida disso, mas o listener 'hidden.bs.modal' adicionado em openModal()
      // faz a limpeza necessária após o fechamento.

    // --- ***** CORREÇÃO 2: Expor funções globais necessárias para onclick="" ***** ---
    window.openEditModal = openEditModal;
    window.registerPrayer = registerPrayer;
    window.markAsResolved = markAsResolved;
    window.archiveTarget = archiveTarget;
    window.unarchiveTarget = unarchiveTarget;
    window.deleteTargetPermanently = deleteTargetPermanently;
    window.deleteObservation = deleteObservation;
    window.confirmPerseverance = confirmPerseverance; // <-- ADICIONADO PARA O BOTÃO FUNCIONAR

    // Define a data padrão no formulário de adicionar
    resetTargetForm();

    // A inicialização da autenticação e carregamento de dados é feita pelo onAuthStateChanged
    console.log("Listeners de eventos configurados.");
});

// =============================================
// === FIM EVENT LISTENERS                   ===
// =============================================

// --- END OF FILE script.js (COMPLETO E CORRIGIDO) ---