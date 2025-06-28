// firestore-service.js
// Responsabilidade: Conter todas as funções que interagem com o banco de dados Firestore.
// Este módulo é a "Camada de Acesso a Dados" da aplicação.

// --- MÓDULOS ---
import { db } from './firebase-config.js';
import {
    collection,
    query,
    orderBy,
    getDocs,
    getDoc,
    doc,
    setDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    writeBatch,
    Timestamp,
    where // Importar 'where' para a query de contagem
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
        // Converte todos os campos de primeiro nível que são Timestamps
        for (const key in rehydrated) {
            if (rehydrated[key] instanceof Timestamp) {
                rehydrated[key] = rehydrated[key].toDate();
            }
        }
        // Converte Timestamps dentro do array de observações
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
 * Obtém a data atual no formato string YYYY-MM-DD, utilizando o padrão UTC.
 * *** MELHORIA APLICADA: Usa métodos UTC para evitar problemas de fuso horário na lógica. ***
 * @param {Date} date - O objeto de data a ser formatado.
 * @returns {string} - A data formatada.
 */
function getISODateString(date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
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

    const shuffled = [...availableTargets].sort(() => 0.5 - Math.random());
    const selectedTargets = shuffled.slice(0, 10);

    const targetsForFirestore = selectedTargets.map(target => ({
        targetId: target.id,
        completed: false
    }));

    return { userId: uid, date: dateStr, targets: targetsForFirestore };
}

// --- FUNÇÕES DE SERVIÇO EXPORTADAS ---

// --- CRUD BÁSICO DE ALVOS ---

export async function addNewPrayerTarget(uid, targetData) {
    const targetsRef = collection(db, "users", uid, "prayerTargets");
    const dataToSave = {
        ...targetData,
        date: Timestamp.fromDate(targetData.date),
        deadlineDate: targetData.hasDeadline && targetData.deadlineDate ? Timestamp.fromDate(targetData.deadlineDate) : null,
        createdAt: Timestamp.now()
    };
    await addDoc(targetsRef, dataToSave);
}

export async function fetchPrayerTargets(uid) {
    const targetsRef = collection(db, "users", uid, "prayerTargets");
    const q = query(targetsRef, orderBy("date", "desc"));
    const snapshot = await getDocs(q);
    const rawData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    return rehydrateTargets(rawData);
}

export async function fetchArchivedTargets(uid) {
    const archivedRef = collection(db, "users", uid, "archivedTargets");
    const q = query(archivedRef, orderBy("archivedDate", "desc"));
    const snapshot = await getDocs(q);
    const rawData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    return rehydrateTargets(rawData);
}


// --- CARREGAMENTO DE DADOS PARA UI ---

export async function loadPerseveranceData(uid) {
    const docRef = doc(db, "perseveranceData", uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const [rehydratedData] = rehydrateTargets([docSnap.data()]);
        return rehydratedData;
    } else {
        return { consecutiveDays: 0, recordDays: 0, lastInteractionDate: null };
    }
}

export async function loadWeeklyPrayerData(uid) {
    const docRef = doc(db, "weeklyInteractions", uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return docSnap.data();
    } else {
        return { weekId: null, interactions: {} };
    }
}

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
        } else {
            dailyData = dailySnapshot.data();
        }

        if (!dailyData || !Array.isArray(dailyData.targets)) {
            return { pending: [], completed: [], targetIds: [] };
        }

        const targetIds = dailyData.targets.map(t => t.targetId);
        const completedIds = new Set(dailyData.targets.filter(t => t.completed).map(t => t.targetId));
        
        const pending = allActiveTargets.filter(t => targetIds.includes(t.id) && !completedIds.has(t.id));
        const completed = allActiveTargets.filter(t => completedIds.has(t.id));

        return { pending, completed, targetIds };

    } catch (error) {
        console.error("[Service] Erro ao carregar/gerar alvos do dia:", error);
        return { pending: [], completed: [], targetIds: [] };
    }
}


// --- AÇÕES DO USUÁRIO ---

export async function forceGenerateDailyTargets(uid, allActiveTargets) {
    const todayStr = getISODateString(new Date());
    const dailyDocId = `${uid}_${todayStr}`;
    const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);
    const dailyData = await generateDailyTargets(uid, todayStr, allActiveTargets);
    await setDoc(dailyRef, dailyData);
}

export async function addManualTargetToDailyList(uid, targetId) {
    const todayStr = getISODateString(new Date());
    const dailyDocId = `${uid}_${todayStr}`;
    const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);

    const dailySnapshot = await getDoc(dailyRef);
    if (!dailySnapshot.exists()) throw new Error("Não há uma lista diária para adicionar.");
    
    const dailyData = dailySnapshot.data();
    if (dailyData.targets.some(t => t.targetId === targetId)) throw new Error("Este alvo já está na lista do dia.");

    dailyData.targets.push({ targetId, completed: false, manuallyAdded: true });
    await updateDoc(dailyRef, { targets: dailyData.targets });
}

export async function updateDailyTargetStatus(uid, targetId, completedStatus) {
    const todayStr = getISODateString(new Date());
    const dailyDocId = `${uid}_${todayStr}`;
    const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);
    
    const dailySnapshot = await getDoc(dailyRef);
    if (!dailySnapshot.exists()) throw new Error("Documento diário não encontrado.");

    const dailyData = dailySnapshot.data();
    const targetIndex = dailyData.targets.findIndex(t => t.targetId === targetId);
    
    if (targetIndex !== -1) {
        dailyData.targets[targetIndex].completed = completedStatus;
    } else {
        dailyData.targets.push({ targetId, completed: completedStatus });
    }
    await updateDoc(dailyRef, { targets: dailyData.targets });
}

export async function recordUserInteraction(uid, currentPerseveranceData, currentWeeklyData) {
    const today = new Date();
    const todayStr = getISODateString(today);
    let isNewRecord = false;

    // --- LÓGICA DE STREAK (PERSEVERANÇA) ---
    const perseveranceRef = doc(db, "perseveranceData", uid);
    const { consecutiveDays, recordDays, lastInteractionDate } = currentPerseveranceData;
    const lastDateStr = lastInteractionDate ? getISODateString(lastInteractionDate) : null;

    // Só executa a lógica de atualização se a última interação não foi hoje
    if (lastDateStr !== todayStr) {
        
        // *** CORREÇÃO DEFINITIVA APLICADA AQUI ***
        // Lógica de cálculo de "ontem" 100% baseada em UTC.
        const yesterday = new Date(today);
        yesterday.setUTCDate(today.getUTCDate() - 1);
        const yesterdayStr = getISODateString(yesterday);
        
        const isConsecutive = (lastDateStr === yesterdayStr);
        let newConsecutive = isConsecutive ? (consecutiveDays || 0) + 1 : 1;
        const newRecord = Math.max(recordDays || 0, newConsecutive);
        
        if (newRecord > (recordDays || 0)) {
            isNewRecord = true;
        }

        // Atualiza o documento no Firestore
        await setDoc(perseveranceRef, {
            consecutiveDays: newConsecutive,
            recordDays: newRecord,
            lastInteractionDate: Timestamp.fromDate(today)
        }, { merge: true });
    }

    // --- LÓGICA SEMANAL (já estava correta, mantida) ---
    const weeklyRef = doc(db, "weeklyInteractions", uid);
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    const dayOfWeek = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayOfWeek);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    const weekId = `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
    
    let updatedWeekly = { ...currentWeeklyData };
    if (updatedWeekly.weekId !== weekId) {
        updatedWeekly = { weekId: weekId, interactions: {} };
    }
    if (!updatedWeekly.interactions[todayStr]) {
        updatedWeekly.interactions[todayStr] = true;
        await setDoc(weeklyRef, updatedWeekly, { merge: true });
    }

    return { isNewRecord };
}

// --- CICLO DE VIDA E ATUALIZAÇÕES GRANULARES DO ALVO ---

export async function archiveTarget(uid, target) {
    const batch = writeBatch(db);
    const oldRef = doc(db, "users", uid, "prayerTargets", target.id);
    const newRef = doc(db, "users", uid, "archivedTargets", target.id);
    const dataToArchive = { ...target, archived: true, archivedDate: Timestamp.now() };
    delete dataToArchive.id;
    batch.set(newRef, dataToArchive);
    batch.delete(oldRef);
    await batch.commit();
}

export async function markAsResolved(uid, target) {
    const batch = writeBatch(db);
    const oldRef = doc(db, "users", uid, "prayerTargets", target.id);
    const newRef = doc(db, "users", uid, "archivedTargets", target.id);
    const dataToResolve = { 
        ...target, 
        resolved: true, 
        resolutionDate: Timestamp.now(),
        archived: true,
        archivedDate: Timestamp.now()
    };
    delete dataToResolve.id;
    batch.set(newRef, dataToResolve);
    batch.delete(oldRef);
    await batch.commit();
}

export async function deleteArchivedTarget(uid, targetId) {
    const docRef = doc(db, "users", uid, "archivedTargets", targetId);
    await deleteDoc(docRef);
}

export async function updateTargetField(uid, targetId, isArchived, fieldData) {
    const collectionName = isArchived ? "archivedTargets" : "prayerTargets";
    const docRef = doc(db, "users", uid, collectionName, targetId);
    const dataToUpdate = { ...fieldData };
    if (dataToUpdate.deadlineDate instanceof Date) {
        dataToUpdate.deadlineDate = Timestamp.fromDate(dataToUpdate.deadlineDate);
    }
    await updateDoc(docRef, dataToUpdate);
}

export async function addObservationToTarget(uid, targetId, isArchived, observation) {
    const collectionName = isArchived ? "archivedTargets" : "prayerTargets";
    const docRef = doc(db, "users", uid, collectionName, targetId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const targetData = docSnap.data();
        const observations = targetData.observations || [];
        const observationToSave = { ...observation, date: Timestamp.fromDate(observation.date) };
        observations.push(observationToSave);
        await updateDoc(docRef, { observations: observations });
    } else {
        throw new Error("Alvo não encontrado.");
    }
}

/**
 * Busca todos os documentos de oração diária de um usuário e conta as interações concluídas para cada alvo.
 * Esta função é mais otimizada, consultando apenas os documentos do usuário.
 * @param {string} uid - ID do usuário.
 * @returns {Promise<Map<string, number>>} - Uma promessa que resolve para um Map onde a chave é o ID do alvo e o valor é a contagem de interações.
 */
export async function fetchInteractionCounts(uid) {
    console.log(`[Service] Buscando contagem de interações para o usuário ${uid}`);
    const interactionMap = new Map();
    
    // Consulta otimizada: busca apenas documentos cujo campo 'userId' corresponde ao UID do usuário logado.
    const dailyTargetsCollection = collection(db, "dailyPrayerTargets");
    const q = query(dailyTargetsCollection, where("userId", "==", uid));
    
    const snapshot = await getDocs(q);

    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.targets && Array.isArray(data.targets)) {
            data.targets.forEach(target => {
                if (target.completed && target.targetId) {
                    const currentCount = interactionMap.get(target.targetId) || 0;
                    interactionMap.set(target.targetId, currentCount + 1);
                }
            });
        }
    });

    console.log(`[Service] Contagem de interações concluída. Encontradas interações para ${interactionMap.size} alvos.`);
    return interactionMap;
}
