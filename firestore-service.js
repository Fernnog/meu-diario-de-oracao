// firestore-service.js
// Responsabilidade: Centralizar toda a comunicação com o Firebase Firestore.

import { db } from './firebase-config.js';
import {
    collection,
    doc,
    addDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    getDoc,
    query,
    orderBy,
    writeBatch,
    Timestamp,
    serverTimestamp,
    increment,
    runTransaction
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// --- Funções de Leitura de Dados (Fetch) ---

/**
 * Busca todos os alvos de oração ativos de um usuário.
 * @param {string} userId - O ID do usuário.
 * @returns {Promise<Array<object>>} - Uma lista de alvos ativos.
 */
export async function fetchPrayerTargets(userId) {
    const targetsCol = collection(db, 'users', userId, 'prayerTargets');
    const q = query(targetsCol, orderBy('date', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), date: doc.data().date.toDate(), deadlineDate: doc.data().deadlineDate?.toDate() }));
}

/**
 * Busca todos os alvos arquivados e respondidos de um usuário.
 * @param {string} userId - O ID do usuário.
 * @returns {Promise<Array<object>>} - Uma lista de alvos arquivados/respondidos.
 */
export async function fetchArchivedTargets(userId) {
    const archivedCol = collection(db, 'users', userId, 'archivedTargets');
    const q = query(archivedCol, orderBy('archivedDate', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), date: doc.data().date.toDate(), deadlineDate: doc.data().deadlineDate?.toDate(), resolutionDate: doc.data().resolutionDate?.toDate(), archivedDate: doc.data().archivedDate?.toDate() }));
}

/**
 * Carrega os dados de perseverança de um usuário.
 * @param {string} userId - O ID do usuário.
 * @returns {Promise<object>} - Os dados de perseverança.
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
 * @returns {Promise<object>} - Os dados de oração da semana.
 */
export async function loadWeeklyPrayerData(userId) {
    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    const weekId = `${startOfWeek.getUTCFullYear()}-${startOfWeek.getUTCMonth()}-${startOfWeek.getUTCDate()}`;
    const docRef = doc(db, 'weeklyInteractions', userId, 'weeks', weekId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return { weekId, ...docSnap.data() };
    }
    return { weekId, interactions: {} };
}

/**
 * Carrega ou gera a lista de alvos para o dia.
 * @param {string} userId - O ID do usuário.
 * @param {Array<object>} allActiveTargets - Lista de todos os alvos ativos.
 * @returns {Promise<object>} - A lista de alvos do dia.
 */
export async function loadDailyTargets(userId, allActiveTargets) {
    const todayStr = new Date().toISOString().split('T')[0];
    const docId = `${userId}_${todayStr}`;
    const docRef = doc(db, 'dailyPrayerTargets', docId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        const data = docSnap.data();
        const pending = allActiveTargets.filter(t => data.pending.includes(t.id));
        const completed = allActiveTargets.filter(t => data.completed.includes(t.id));
        return { pending, completed, targetIds: [...data.pending, ...data.completed] };
    } else {
        return await forceGenerateDailyTargets(userId, allActiveTargets);
    }
}

/**
 * Força a geração de uma nova lista de alvos diários.
 * @param {string} userId - O ID do usuário.
 * @param {Array<object>} allActiveTargets - Lista de todos os alvos ativos.
 * @returns {Promise<object>} - A nova lista de alvos do dia.
 */
export async function forceGenerateDailyTargets(userId, allActiveTargets) {
    const shuffled = [...allActiveTargets].sort(() => 0.5 - Math.random());
    const selectedTargets = shuffled.slice(0, 10);
    const selectedIds = selectedTargets.map(t => t.id);

    const todayStr = new Date().toISOString().split('T')[0];
    const docId = `${userId}_${todayStr}`;
    const docRef = doc(db, 'dailyPrayerTargets', docId);

    await updateDoc(docRef, { pending: selectedIds, completed: [] }).catch(async (error) => {
        if (error.code === 'not-found') {
            await addDoc(collection(db, 'dailyPrayerTargets'), { _id: docId, pending: selectedIds, completed: [] });
        }
    });

    return { pending: selectedTargets, completed: [], targetIds: selectedIds };
}

// --- Funções de Escrita de Dados (CUD) ---

/**
 * Adiciona um novo alvo de oração ao Firestore.
 * @param {string} userId - O ID do usuário.
 * @param {object} targetData - Os dados do novo alvo.
 * @returns {Promise<void>}
 */
export async function addNewPrayerTarget(userId, targetData) {
    const targetsCol = collection(db, 'users', userId, 'prayerTargets');
    await addDoc(targetsCol, { ...targetData, createdAt: serverTimestamp() });
}

/**
 * Atualiza um campo específico de um alvo.
 * @param {string} userId - O ID do usuário.
 * @param {string} targetId - O ID do alvo.
 * @param {boolean} isArchived - Se o alvo está arquivado.
 * @param {object} fieldsToUpdate - Objeto com os campos e valores a serem atualizados.
 * @returns {Promise<void>}
 */
export async function updateTargetField(userId, targetId, isArchived, fieldsToUpdate) {
    const collectionName = isArchived ? 'archivedTargets' : 'prayerTargets';
    const docRef = doc(db, 'users', userId, collectionName, targetId);
    await updateDoc(docRef, fieldsToUpdate);
}

/**
 * Move um alvo da coleção de ativos para arquivados.
 * @param {string} userId - O ID do usuário.
 * @param {object} target - O objeto do alvo a ser arquivado.
 * @returns {Promise<void>}
 */
export async function archiveTarget(userId, target) {
    const batch = writeBatch(db);
    const oldRef = doc(db, 'users', userId, 'prayerTargets', target.id);
    const newRef = doc(db, 'users', userId, 'archivedTargets', target.id);

    const { id, ...dataToMove } = target;
    batch.set(newRef, { ...dataToMove, archivedDate: serverTimestamp() });
    batch.delete(oldRef);
    await batch.commit();
}

/**
 * Marca um alvo como respondido, movendo-o para arquivados.
 * @param {string} userId - O ID do usuário.
 * @param {object} target - O objeto do alvo a ser resolvido.
 * @returns {Promise<void>}
 */
export async function markAsResolved(userId, target) {
    const batch = writeBatch(db);
    const oldRef = doc(db, 'users', userId, 'prayerTargets', target.id);
    const newRef = doc(db, 'users', userId, 'archivedTargets', target.id);

    const { id, ...dataToMove } = target;
    batch.set(newRef, { ...dataToMove, resolved: true, resolutionDate: serverTimestamp(), archivedDate: serverTimestamp() });
    batch.delete(oldRef);
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

// --- Funções de Manipulação de Observações ---

/**
 * Adiciona uma observação a um alvo.
 * @param {string} userId - O ID do usuário.
 * @param {string} targetId - O ID do alvo.
 * @param {boolean} isArchived - Se o alvo está arquivado.
 * @param {object} observationData - A nova observação.
 * @returns {Promise<void>}
 */
export async function addObservationToTarget(userId, targetId, isArchived, observationData) {
    const collectionName = isArchived ? 'archivedTargets' : 'prayerTargets';
    const docRef = doc(db, 'users', userId, collectionName, targetId);
    const docSnap = await getDoc(docRef);
    const existingObservations = docSnap.data().observations || [];
    await updateDoc(docRef, {
        observations: [...existingObservations, observationData]
    });
}

/**
 * Atualiza uma observação existente em um alvo.
 * @param {string} userId - O ID do usuário.
 * @param {string} targetId - O ID do alvo.
 * @param {boolean} isArchived - Se o alvo está arquivado.
 * @param {number} obsIndex - O índice da observação a ser atualizada.
 * @param {object} updatedData - Os dados a serem mesclados na observação.
 * @returns {Promise<void>}
 */
export async function updateObservationInTarget(userId, targetId, isArchived, obsIndex, updatedData) {
    const collectionName = isArchived ? 'archivedTargets' : 'prayerTargets';
    const docRef = doc(db, 'users', userId, collectionName, targetId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) throw new Error("Documento não encontrado.");

    const targetData = docSnap.data();
    const observations = targetData.observations || [];
    if (observations[obsIndex]) {
        Object.assign(observations[obsIndex], updatedData);
    } else {
        throw new Error("Índice de observação inválido.");
    }
    await updateDoc(docRef, { observations });
}

/**
 * Adiciona uma sub-observação a um sub-alvo (observação promovida).
 * @param {string} userId - O ID do usuário.
 * @param {string} targetId - O ID do alvo principal.
 * @param {boolean} isArchived - Se o alvo está arquivado.
 * @param {number} obsIndex - O índice do sub-alvo pai.
 * @param {object} subObservationData - A nova sub-observação.
 * @returns {Promise<void>}
 */
export async function addSubObservationToTarget(userId, targetId, isArchived, obsIndex, subObservationData) {
    const collectionName = isArchived ? 'archivedTargets' : 'prayerTargets';
    const docRef = doc(db, 'users', userId, collectionName, targetId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) throw new Error("Documento não encontrado.");

    const targetData = docSnap.data();
    const observations = targetData.observations || [];
    if (observations[obsIndex] && observations[obsIndex].isSubTarget) {
        if (!Array.isArray(observations[obsIndex].subObservations)) {
            observations[obsIndex].subObservations = [];
        }
        observations[obsIndex].subObservations.push(subObservationData);
    } else {
        throw new Error("Sub-alvo não encontrado para adicionar observação.");
    }
    await updateDoc(docRef, { observations });
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

    // Encontra a sub-observação correta usando os índices
    const subObservation = observations[obsIndex]?.subObservations?.[subObsIndex];

    if (subObservation) {
        // Mescla os dados antigos com os novos
        Object.assign(subObservation, updatedData);
    } else {
        throw new Error("Índice de sub-observação inválido.");
    }
    
    // Atualiza o campo 'observations' inteiro no documento
    return await updateDoc(docRef, { observations: observations });
}

// --- Funções de Lógica de Negócio e Interação ---

/**
 * Registra a interação de um usuário, atualizando a perseverança.
 * @param {string} userId - O ID do usuário.
 * @param {object} currentPerseveranceData - Os dados de perseverança atuais.
 * @param {object} currentWeeklyData - Os dados da semana atuais.
 * @returns {Promise<{isNewRecord: boolean}>}
 */
export async function recordUserInteraction(userId, currentPerseveranceData, currentWeeklyData) {
    const today = new Date();
    const todayStr = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;
    const { lastInteractionDate } = currentPerseveranceData;

    let isNewRecord = false;
    const perseveranceRef = doc(db, 'perseveranceData', userId);
    
    await runTransaction(db, async (transaction) => {
        const perseveranceSnap = await transaction.get(perseveranceRef);
        let { consecutiveDays = 0, recordDays = 0 } = perseveranceSnap.exists() ? perseveranceSnap.data() : {};
        
        const lastDate = lastInteractionDate ? new Date(lastInteractionDate) : null;
        if (lastDate) {
            const yesterday = new Date(today);
            yesterday.setUTCDate(today.getUTCDate() - 1);
            if (lastDate.getUTCFullYear() === yesterday.getUTCFullYear() && lastDate.getUTCMonth() === yesterday.getUTCMonth() && lastDate.getUTCDate() === yesterday.getUTCDate()) {
                consecutiveDays++;
            } else if (lastDate.getUTCFullYear() !== today.getUTCFullYear() || lastDate.getUTCMonth() !== today.getUTCMonth() || lastDate.getUTCDate() !== today.getUTCDate()) {
                consecutiveDays = 1;
            }
        } else {
            consecutiveDays = 1;
        }

        if (consecutiveDays > recordDays) {
            recordDays = consecutiveDays;
            isNewRecord = true;
        }
        transaction.set(perseveranceRef, { consecutiveDays, recordDays, lastInteractionDate: Timestamp.fromDate(today) }, { merge: true });
    });

    const weeklyRef = doc(db, 'weeklyInteractions', userId, 'weeks', currentWeeklyData.weekId);
    await updateDoc(weeklyRef, { [`interactions.${todayStr}`]: true }).catch(async (err) => {
        if(err.code === 'not-found') await addDoc(collection(db, 'weeklyInteractions', userId, 'weeks'), { _id: currentWeeklyData.weekId, interactions: { [todayStr]: true } });
    });

    return { isNewRecord };
}


/**
 * Atualiza o status de um alvo na lista diária.
 * @param {string} userId - O ID do usuário.
 * @param {string} targetId - O ID do alvo.
 * @param {boolean} isCompleted - Se o alvo foi concluído.
 * @returns {Promise<void>}
 */
export async function updateDailyTargetStatus(userId, targetId, isCompleted) {
    const todayStr = new Date().toISOString().split('T')[0];
    const docId = `${userId}_${todayStr}`;
    const docRef = doc(db, 'dailyPrayerTargets', docId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        const data = docSnap.data();
        const pending = new Set(data.pending || []);
        const completed = new Set(data.completed || []);
        
        if (isCompleted) {
            if (pending.has(targetId)) {
                pending.delete(targetId);
                completed.add(targetId);
            }
        } else {
            if (completed.has(targetId)) {
                completed.delete(targetId);
                pending.add(targetId);
            }
        }
        await updateDoc(docRef, { pending: Array.from(pending), completed: Array.from(completed) });
    }
}

/**
 * Adiciona manualmente um alvo à lista diária.
 * @param {string} userId - O ID do usuário.
 * @param {string} targetId - O ID do alvo a ser adicionado.
 * @returns {Promise<void>}
 */
export async function addManualTargetToDailyList(userId, targetId) {
    const todayStr = new Date().toISOString().split('T')[0];
    const docId = `${userId}_${todayStr}`;
    const docRef = doc(db, 'dailyPrayerTargets', docId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) throw new Error("Lista diária não encontrada.");
    
    const data = docSnap.data();
    if (data.pending.includes(targetId) || data.completed.includes(targetId)) {
        throw new Error("Este alvo já está na lista de hoje.");
    }

    await updateDoc(docRef, { pending: [...data.pending, targetId] });
}


// --- Funções para Relatórios ---

/**
 * Busca todos os alvos (ativos e arquivados) para o relatório.
 * @param {string} userId - O ID do usuário.
 * @returns {Promise<Array<object>>} - Uma lista completa de alvos.
 */
export async function fetchAllTargetsForReport(userId) {
    const prayerTargets = await fetchPrayerTargets(userId);
    const archivedTargets = await fetchArchivedTargets(userId);
    return [...prayerTargets.map(t => ({...t, status: 'ativo'})), ...archivedTargets.map(t => ({...t, status: t.resolved ? 'respondido' : 'arquivado'}))];
}

/**
 * Busca as contagens de interação para cada alvo.
 * @param {string} userId - O ID do usuário.
 * @returns {Promise<Map<string, number>>} - Um mapa de ID do alvo para contagem.
 */
export async function fetchInteractionCounts(userId) {
    // Esta é uma implementação simplificada. Uma real exigiria uma coleção de "interações".
    // Por enquanto, vamos simular com base nos sub-alvos.
    const interactionCounts = new Map();
    const allTargets = await fetchAllTargetsForReport(userId);

    allTargets.forEach(target => {
        let count = 0;
        if(target.observations) {
            target.observations.forEach(obs => {
                if(obs.isSubTarget && obs.interactionCount) {
                    count += obs.interactionCount;
                }
            });
        }
        interactionCounts.set(target.id, count);
    });
    return interactionCounts;
}

/**
 * Registra uma interação com um sub-alvo.
 * @param {string} userId - O ID do usuário.
 * @param {string} subTargetId - O ID do sub-alvo no formato 'targetId_obsIndex'.
 * @returns {Promise<void>}
 */
export async function recordInteractionForSubTarget(userId, subTargetId) {
    const [targetId, obsIndexStr] = subTargetId.split('_');
    const obsIndex = parseInt(obsIndexStr, 10);
    
    // Precisamos determinar se o alvo está na coleção ativa ou arquivada
    let targetDocRef = doc(db, 'users', userId, 'prayerTargets', targetId);
    let targetSnap = await getDoc(targetDocRef);
    let isArchived = false;

    if (!targetSnap.exists()) {
        targetDocRef = doc(db, 'users', userId, 'archivedTargets', targetId);
        targetSnap = await getDoc(targetDocRef);
        isArchived = true;
        if (!targetSnap.exists()) {
            throw new Error("Alvo pai do sub-alvo não encontrado.");
        }
    }

    const observations = targetSnap.data().observations;
    const currentCount = observations[obsIndex].interactionCount || 0;
    observations[obsIndex].interactionCount = currentCount + 1;

    await updateDoc(targetDocRef, { observations });
}
