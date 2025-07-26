// firestore-service.js (VERSÃO FINAL E COMPLETA)
// Responsabilidade: Centralizar toda a comunicação com o Firebase Firestore.
// Este módulo lida com a busca, adição e atualização de dados,
// incluindo a lógica para campos aninhados como observações e sub-observações.

import { db } from './firebase-config.js';
import { 
    collection, 
    doc, 
    getDocs, 
    getDoc, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    setDoc, 
    writeBatch,
    query,
    orderBy,
    where,
    Timestamp
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";

// --- Funções Principais de Busca de Dados ---

/**
 * Busca todos os alvos de oração ativos de um usuário.
 * @param {string} userId - O ID do usuário.
 * @returns {Promise<Array<object>>} - Uma promessa que resolve com um array de alvos.
 */
export async function fetchPrayerTargets(userId) {
    const targetsCol = collection(db, 'users', userId, 'prayerTargets');
    const q = query(targetsCol, orderBy("date", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), date: doc.data().date.toDate(), deadlineDate: doc.data().deadlineDate?.toDate() }));
}

/**
 * Busca todos os alvos arquivados (incluindo respondidos) de um usuário.
 * @param {string} userId - O ID do usuário.
 * @returns {Promise<Array<object>>} - Uma promessa que resolve com um array de alvos arquivados.
 */
export async function fetchArchivedTargets(userId) {
    const archivedCol = collection(db, 'users', userId, 'archivedTargets');
    const q = query(archivedCol, orderBy("archivedDate", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), date: doc.data().date.toDate(), resolutionDate: doc.data().resolutionDate?.toDate(), archivedDate: doc.data().archivedDate?.toDate() }));
}

// --- Funções de Manipulação de Alvos ---

/**
 * Adiciona um novo alvo de oração ao Firestore.
 * @param {string} userId - O ID do usuário.
 * @param {object} targetData - Os dados do novo alvo.
 * @returns {Promise<void>}
 */
export async function addNewPrayerTarget(userId, targetData) {
    const targetsCol = collection(db, 'users', userId, 'prayerTargets');
    await addDoc(targetsCol, targetData);
}

/**
 * Marca um alvo como resolvido, movendo-o para a coleção de arquivados.
 * @param {string} userId - O ID do usuário.
 * @param {object} target - O objeto do alvo a ser resolvido.
 * @returns {Promise<void>}
 */
export async function markAsResolved(userId, target) {
    const batch = writeBatch(db);
    const oldDocRef = doc(db, 'users', userId, 'prayerTargets', target.id);
    const newDocRef = doc(db, 'users', userId, 'archivedTargets', target.id);
    
    const dataToMove = { ...target };
    delete dataToMove.id; // Não salvar o ID dentro do documento
    dataToMove.archivedDate = new Date(); // Adiciona data de arquivamento
    
    batch.set(newDocRef, dataToMove);
    batch.delete(oldDocRef);
    
    await batch.commit();
}

/**
 * Arquiva um alvo, movendo-o para a coleção de arquivados.
 * @param {string} userId - O ID do usuário.
 * @param {object} target - O objeto do alvo a ser arquivado.
 * @returns {Promise<void>}
 */
export async function archiveTarget(userId, target) {
    const batch = writeBatch(db);
    const oldDocRef = doc(db, 'users', userId, 'prayerTargets', target.id);
    const newDocRef = doc(db, 'users', userId, 'archivedTargets', target.id);

    const dataToMove = { ...target };
    delete dataToMove.id;

    batch.set(newDocRef, dataToMove);
    batch.delete(oldDocRef);

    await batch.commit();
}

/**
 * Exclui permanentemente um alvo da coleção de arquivados.
 * @param {string} userId - O ID do usuário.
 * @param {string} targetId - O ID do alvo a ser excluído.
 * @returns {Promise<void>}
 */
export async function deleteArchivedTarget(userId, targetId) {
    const docRef = doc(db, 'users', userId, 'archivedTargets', targetId);
    await deleteDoc(docRef);
}

/**
 * Atualiza campos específicos de um alvo.
 * @param {string} userId - O ID do usuário.
 * @param {string} targetId - O ID do alvo.
 * @param {boolean} isArchived - Se o alvo está na coleção de arquivados.
 * @param {object} fieldsToUpdate - Um objeto com os campos e valores a serem atualizados.
 * @returns {Promise<void>}
 */
export async function updateTargetField(userId, targetId, isArchived, fieldsToUpdate) {
    const collectionName = isArchived ? 'archivedTargets' : 'prayerTargets';
    const docRef = doc(db, 'users', userId, collectionName, targetId);
    await updateDoc(docRef, fieldsToUpdate);
}

// --- Funções de Manipulação de Observações (PRINCIPAL E ANINHADAS) ---

/**
 * Adiciona uma nova observação a um alvo.
 * @param {string} userId - O ID do usuário.
 * @param {string} targetId - O ID do alvo.
 * @param {boolean} isArchived - Se o alvo está arquivado.
 * @param {object} observation - A nova observação a ser adicionada.
 * @returns {Promise<void>}
 */
export async function addObservationToTarget(userId, targetId, isArchived, observation) {
    const collectionName = isArchived ? 'archivedTargets' : 'prayerTargets';
    const docRef = doc(db, 'users', userId, collectionName, targetId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        const targetData = docSnap.data();
        const observations = targetData.observations || [];
        observations.push(observation);
        await updateDoc(docRef, { observations: observations });
    }
}

/**
 * Atualiza uma observação/sub-alvo existente dentro de um alvo.
 * @param {string} userId - ID do usuário.
 * @param {string} targetId - ID do alvo principal.
 * @param {boolean} isArchived - Se o alvo está arquivado.
 * @param {number} obsIndex - O índice da observação/sub-alvo a ser atualizada.
 * @param {object} updatedData - Os dados a serem atualizados.
 * @returns {Promise<void>}
 */
export async function updateObservationInTarget(userId, targetId, isArchived, obsIndex, updatedData) {
    const collectionName = isArchived ? 'archivedTargets' : 'prayerTargets';
    const docRef = doc(db, 'users', userId, collectionName, targetId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        const targetData = docSnap.data();
        const observations = targetData.observations || [];
        if (observations[obsIndex]) {
            Object.assign(observations[obsIndex], updatedData);
            await updateDoc(docRef, { observations: observations });
        } else {
            throw new Error("Índice de observação inválido.");
        }
    }
}

/**
 * Adiciona uma sub-observação a um sub-alvo (observação promovida).
 * @param {string} userId - ID do usuário.
 * @param {string} targetId - ID do alvo principal.
 * @param {boolean} isArchived - Se o alvo está arquivado.
 * @param {number} obsIndex - O índice do sub-alvo pai.
 * @param {object} newSubObservation - A nova sub-observação.
 * @returns {Promise<void>}
 */
export async function addSubObservationToTarget(userId, targetId, isArchived, obsIndex, newSubObservation) {
    const collectionName = isArchived ? 'archivedTargets' : 'prayerTargets';
    const docRef = doc(db, 'users', userId, collectionName, targetId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const targetData = docSnap.data();
        const observations = targetData.observations || [];
        if (observations[obsIndex] && observations[obsIndex].isSubTarget) {
            if (!Array.isArray(observations[obsIndex].subObservations)) {
                observations[obsIndex].subObservations = [];
            }
            observations[obsIndex].subObservations.push(newSubObservation);
            await updateDoc(docRef, { observations });
        }
    }
}

/**
 * **(NOVA FUNÇÃO)**
 * Atualiza uma sub-observação específica dentro de um alvo.
 * @param {string} userId - ID do usuário.
 * @param {string} targetId - ID do alvo principal.
 * @param {boolean} isArchived - Se o alvo está arquivado.
 * @param {number} obsIndex - O índice da observação/sub-alvo pai.
 * @param {number} subObsIndex - O índice da sub-observação a ser atualizada.
 * @param {object} updatedData - Os dados a serem atualizados na sub-observação.
 * @returns {Promise<void>}
 */
export async function updateSubObservationInTarget(userId, targetId, isArchived, obsIndex, subObsIndex, updatedData) {
    const collectionName = isArchived ? 'archivedTargets' : 'prayerTargets';
    const docRef = doc(db, 'users', userId, collectionName, targetId);

    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
        throw new Error("Documento não encontrado para atualizar sub-observação.");
    }

    const targetData = docSnap.data();
    const observations = targetData.observations || [];
    const originalSubObs = observations[obsIndex]?.subObservations;

    if (originalSubObs && originalSubObs[subObsIndex]) {
        // Encontra a sub-observação original pelo timestamp para garantir a atualização correta
        const subObsToUpdate = originalSubObs[subObsIndex];
        Object.assign(subObsToUpdate, updatedData); // Mescla os dados
    } else {
        throw new Error("Índice de sub-observação inválido.");
    }
    
    return await updateDoc(docRef, { observations: observations });
}


// --- Funções de Perseverança e Dados Diários ---

/**
 * Carrega os dados de perseverança de um usuário.
 * @param {string} userId - O ID do usuário.
 * @returns {Promise<object>} - Dados de perseverança.
 */
export async function loadPerseveranceData(userId) {
    const docRef = doc(db, 'perseveranceData', userId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
        return {
            ...data,
            lastInteractionDate: data.lastInteractionDate?.toDate()
        };
    }
    return { consecutiveDays: 0, recordDays: 0, lastInteractionDate: null };
}

/**
 * Carrega os dados de interação da semana atual.
 * @param {string} userId - O ID do usuário.
 * @returns {Promise<object>}
 */
export async function loadWeeklyPrayerData(userId) {
    const docRef = doc(db, 'weeklyInteractions', userId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return docSnap.data();
    }
    return { weekId: null, interactions: {} };
}

/**
 * Registra uma interação do usuário, atualizando a perseverança e os dados semanais.
 * @param {string} userId - ID do usuário.
 * @param {object} currentData - Dados atuais de perseverança.
 * @param {object} weeklyData - Dados atuais da semana.
 * @returns {Promise<{isNewRecord: boolean}>}
 */
export async function recordUserInteraction(userId, currentData, weeklyData) {
    const now = new Date();
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const todayKey = todayUTC.toISOString().split('T')[0];

    let { consecutiveDays, recordDays, lastInteractionDate } = currentData;
    let isNewRecord = false;

    if (!lastInteractionDate || lastInteractionDate.getTime() !== todayUTC.getTime()) {
        const yesterdayUTC = new Date(todayUTC);
        yesterdayUTC.setDate(todayUTC.getDate() - 1);
        
        if (lastInteractionDate && lastInteractionDate.getTime() === yesterdayUTC.getTime()) {
            consecutiveDays++;
        } else {
            consecutiveDays = 1;
        }

        if (consecutiveDays > recordDays) {
            recordDays = consecutiveDays;
            isNewRecord = true;
        }

        const perseveranceRef = doc(db, 'perseveranceData', userId);
        await setDoc(perseveranceRef, { consecutiveDays, recordDays, lastInteractionDate: todayUTC });

        const weeklyRef = doc(db, 'weeklyInteractions', userId);
        const startOfWeek = new Date(todayUTC);
        startOfWeek.setDate(startOfWeek.getDate() - todayUTC.getUTCDay());
        const weekId = startOfWeek.toISOString().split('T')[0];

        if (weeklyData.weekId !== weekId) {
            weeklyData.interactions = {};
            weeklyData.weekId = weekId;
        }
        weeklyData.interactions[todayKey] = true;
        await setDoc(weeklyRef, weeklyData);
    }
    
    return { isNewRecord };
}

/**
 * Carrega ou gera os alvos do dia para o usuário.
 * @param {string} userId - ID do usuário.
 * @param {Array<object>} allActiveTargets - Lista de todos os alvos ativos.
 * @returns {Promise<{pending: Array, completed: Array, targetIds: Array}>}
 */
export async function loadDailyTargets(userId, allActiveTargets) {
    const today = new Date().toISOString().split('T')[0];
    const docId = `${userId}_${today}`;
    const docRef = doc(db, 'dailyPrayerTargets', docId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        const data = docSnap.data();
        const pending = allActiveTargets.filter(t => data.targetIds.includes(t.id) && !data.completed.includes(t.id));
        const completed = allActiveTargets.filter(t => data.completed.includes(t.id));
        return { pending, completed, targetIds: data.targetIds };
    } else {
        return await forceGenerateDailyTargets(userId, allActiveTargets);
    }
}

/**
 * Força a geração de uma nova lista de alvos para o dia.
 * @param {string} userId - ID do usuário.
 * @param {Array<object>} allActiveTargets - Lista de todos os alvos ativos.
 * @returns {Promise<{pending: Array, completed: Array, targetIds: Array}>}
 */
export async function forceGenerateDailyTargets(userId, allActiveTargets) {
    const today = new Date().toISOString().split('T')[0];
    const docId = `${userId}_${today}`;
    const docRef = doc(db, 'dailyPrayerTargets', docId);

    let selectedTargets = [...allActiveTargets].sort(() => 0.5 - Math.random());
    const targetIds = selectedTargets.slice(0, 10).map(t => t.id);
    
    await setDoc(docRef, { targetIds, completed: [] });
    
    const pending = allActiveTargets.filter(t => targetIds.includes(t.id));
    return { pending, completed: [], targetIds };
}

/**
 * Atualiza o status de um alvo diário (de pendente para completo).
 * @param {string} userId - ID do usuário.
 * @param {string} targetId - ID do alvo.
 * @param {boolean} isCompleted - Se o alvo foi concluído.
 * @returns {Promise<void>}
 */
export async function updateDailyTargetStatus(userId, targetId, isCompleted) {
    const today = new Date().toISOString().split('T')[0];
    const docId = `${userId}_${today}`;
    const docRef = doc(db, 'dailyPrayerTargets', docId);

    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
        const completed = data.completed || [];
        if (isCompleted && !completed.includes(targetId)) {
            completed.push(targetId);
        }
        await updateDoc(docRef, { completed });
    }
}

/**
 * Adiciona manualmente um alvo à lista do dia.
 * @param {string} userId - ID do usuário.
 * @param {string} targetId - ID do alvo a ser adicionado.
 * @returns {Promise<void>}
 */
export async function addManualTargetToDailyList(userId, targetId) {
    const today = new Date().toISOString().split('T')[0];
    const docId = `${userId}_${today}`;
    const docRef = doc(db, 'dailyPrayerTargets', docId);

    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.targetIds.includes(targetId)) {
            throw new Error("Este alvo já está na sua lista de hoje.");
        }
        const newTargetIds = [...data.targetIds, targetId];
        await updateDoc(docRef, { targetIds: newTargetIds });
    }
}

/**
 * Registra uma interação específica para um sub-alvo.
 * @param {string} userId - ID do usuário.
 * @param {string} subTargetId - ID composto do sub-alvo (targetId_obsIndex).
 * @returns {Promise<void>}
 */
export async function recordInteractionForSubTarget(userId, subTargetId) {
    const today = new Date().toISOString().split('T')[0];
    const docId = `${userId}_${today}`;
    const docRef = doc(db, 'dailyPrayerTargets', docId);

    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
        const completedSubTargets = data.completedSubTargets || [];
        if (!completedSubTargets.includes(subTargetId)) {
            completedSubTargets.push(subTargetId);
            await updateDoc(docRef, { completedSubTargets });
        }
    }
}


// --- Funções para a Página de Relatório (orei.js) ---

/**
 * Busca todos os alvos (ativos, arquivados, respondidos) para o relatório.
 * @param {string} userId - O ID do usuário.
 * @returns {Promise<Array<object>>}
 */
export async function fetchAllTargetsForReport(userId) {
    const activeTargets = await fetchPrayerTargets(userId);
    const archivedAndResolved = await fetchArchivedTargets(userId);

    const allTargets = [
        ...activeTargets.map(t => ({ ...t, status: 'ativo' })),
        ...archivedAndResolved.map(t => ({ ...t, status: t.resolved ? 'respondido' : 'arquivado' }))
    ];

    allTargets.sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
    return allTargets;
}

/**
 * Busca a contagem de interações (orações) para cada alvo.
 * @param {string} userId - O ID do usuário.
 * @returns {Promise<Map<string, number>>}
 */
export async function fetchInteractionCounts(userId) {
    const interactionMap = new Map();
    const dailyTargetsRef = collection(db, 'dailyPrayerTargets');
    const q = query(dailyTargetsRef, where('__name__', '>=', userId), where('__name__', '<', userId + '\uffff'));
    
    const snapshot = await getDocs(q);
    snapshot.forEach(doc => {
        const data = doc.data();
        const completed = data.completed || [];
        completed.forEach(targetId => {
            interactionMap.set(targetId, (interactionMap.get(targetId) || 0) + 1);
        });
    });

    return interactionMap;
}
