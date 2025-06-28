// firestore-service.js
// Responsabilidade: Conter todas as funções que interagem com o banco de dados Firestore.
// Este módulo é a "Camada de Acesso a Dados" da aplicação.

// --- MÓDULOS ---
// Importa a instância 'db' do nosso arquivo de configuração central.
import { db } from './firebase-config.js';
// Importa as funções do Firestore que vamos utilizar.
import {
    collection,
    query,
    orderBy,
    getDocs,
    getDoc,
    doc,
    setDoc,
    Timestamp
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// --- FUNÇÕES AUXILIARES INTERNAS ---

/**
 * Converte dados brutos do Firestore para um formato utilizável no front-end,
 * principalmente convertendo Timestamps do Firebase para objetos Date do JavaScript.
 * @param {Array} rawData - Um array de documentos do Firestore.
 * @returns {Array} - Um array de objetos com as datas devidamente formatadas.
 */
function rehydrateTargets(rawData) {
    return rawData.map(targetData => {
        const rehydrated = { ...targetData };
        for (const key in rehydrated) {
            if (rehydrated[key] instanceof Timestamp) {
                rehydrated[key] = rehydrated[key].toDate();
            }
        }
        if (Array.isArray(rehydrated.observations)) {
            rehydrated.observations = rehydrated.observations.map(obs => {
                if (obs.date instanceof Timestamp) {
                    return { ...obs, date: obs.date.toDate() };
                }
                return obs;
            });
        }
        return rehydrated;
    });
}

/**
 * Obtém a data atual no formato string YYYY-MM-DD.
 * @param {Date} date - O objeto de data a ser formatado.
 * @returns {string} - A data formatada.
 */
function getISODateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Gera uma nova lista de alvos para o dia se nenhuma existir.
 * @param {string} uid - ID do usuário.
 * @param {string} dateStr - A data no formato YYYY-MM-DD.
 * @param {Array} availableTargets - Lista de alvos ativos para escolher.
 * @returns {object} - O objeto de dados a ser salvo no Firestore.
 */
async function generateDailyTargets(uid, dateStr, availableTargets) {
    console.log(`[Service] Gerando novos alvos do dia para ${dateStr}`);
    if (availableTargets.length === 0) {
        return { userId: uid, date: dateStr, targets: [] };
    }

    // Lógica simples: embaralha e pega os 10 primeiros.
    // Pode ser substituída por uma lógica mais complexa (e.g., priorizar menos orados).
    const shuffled = [...availableTargets].sort(() => 0.5 - Math.random());
    const selectedTargets = shuffled.slice(0, 10);

    const targetsForFirestore = selectedTargets.map(target => ({
        targetId: target.id,
        completed: false
    }));

    return { userId: uid, date: dateStr, targets: targetsForFirestore };
}

// --- FUNÇÕES DE SERVIÇO EXPORTADAS ---

/**
 * Busca todos os alvos de oração ativos de um usuário.
 * @param {string} uid - ID do usuário.
 * @returns {Promise<Array>} - Uma promessa que resolve para um array de alvos.
 */
export async function fetchPrayerTargets(uid) {
    const targetsRef = collection(db, "users", uid, "prayerTargets");
    const q = query(targetsRef, orderBy("date", "desc"));
    const snapshot = await getDocs(q);
    console.log(`[Service] Found ${snapshot.size} active targets for user ${uid}`);
    const rawData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    return rehydrateTargets(rawData);
}

/**
 * Busca todos os alvos arquivados de um usuário.
 * @param {string} uid - ID do usuário.
 * @returns {Promise<Array>} - Uma promessa que resolve para um array de alvos arquivados.
 */
export async function fetchArchivedTargets(uid) {
    const archivedRef = collection(db, "users", uid, "archivedTargets");
    const q = query(archivedRef, orderBy("archivedDate", "desc"));
    const snapshot = await getDocs(q);
    console.log(`[Service] Found ${snapshot.size} archived targets for user ${uid}`);
    const rawData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    return rehydrateTargets(rawData);
}

/**
 * Carrega os dados de perseverança (dias consecutivos) de um usuário.
 * @param {string} uid - ID do usuário.
 * @returns {Promise<object>} - Uma promessa que resolve para o objeto de dados de perseverança.
 */
export async function loadPerseveranceData(uid) {
    const docRef = doc(db, "perseveranceData", uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        console.log("[Service] Perseverance data loaded.");
        const [rehydratedData] = rehydrateTargets([docSnap.data()]);
        return rehydratedData;
    } else {
        console.log("[Service] No perseverance data found, returning default.");
        return { consecutiveDays: 0, recordDays: 0, lastInteractionDate: null };
    }
}

/**
 * Carrega os dados de interação da semana atual de um usuário.
 * @param {string} uid - ID do usuário.
 * @returns {Promise<object>} - Uma promessa que resolve para o objeto de dados da semana.
 */
export async function loadWeeklyPrayerData(uid) {
    const docRef = doc(db, "weeklyInteractions", uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        console.log("[Service] Weekly data loaded.");
        return docSnap.data();
    } else {
        console.log("[Service] No weekly data found, returning default.");
        return { weekId: null, interactions: {} };
    }
}

/**
 * Carrega a lista de alvos do dia para um usuário.
 * Se não existir, gera uma nova, salva no Firestore e a retorna.
 * @param {string} uid - ID do usuário.
 * @param {Array} allActiveTargets - Lista de todos os alvos ativos para gerar a lista se necessário.
 * @returns {Promise<object>} - Um objeto com as listas { pending: [], completed: [], targetIds: [] }.
 */
export async function loadDailyTargets(uid, allActiveTargets) {
    const todayStr = getISODateString(new Date());
    const dailyDocId = `${uid}_${todayStr}`;
    const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);

    try {
        const dailySnapshot = await getDoc(dailyRef);
        let dailyData;

        if (!dailySnapshot.exists() || !dailySnapshot.data()?.targets) {
            dailyData = await generateDailyTargets(uid, todayStr, allActiveTargets);
            await setDoc(dailyRef, dailyData);
            console.log(`[Service] Novo documento diário gerado e salvo para ${dailyDocId}.`);
        } else {
            dailyData = dailySnapshot.data();
            console.log(`[Service] Documento diário ${dailyDocId} carregado do Firestore.`);
        }

        if (!dailyData || !Array.isArray(dailyData.targets)) {
            console.error("[Service] Estrutura de dados diários inválida:", dailyData);
            return { pending: [], completed: [], targetIds: [] };
        }

        const targetIds = dailyData.targets.map(t => t.targetId);
        const completedIds = new Set(dailyData.targets.filter(t => t.completed).map(t => t.targetId));
        
        const pending = allActiveTargets.filter(t => targetIds.includes(t.id) && !completedIds.has(t.id));
        const completed = allActiveTargets.filter(t => completedIds.has(t.id));

        return { pending, completed, targetIds };

    } catch (error) {
        console.error("[Service] Erro ao carregar/gerar alvos do dia:", error);
        return { pending: [], completed: [], targetIds: [] }; // Retorna um estado seguro.
    }
}
