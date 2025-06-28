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
 * Adiciona um novo alvo de oração para um usuário.
 * @param {string} uid - ID do usuário.
 * @param {object} targetData - Objeto com os dados do alvo (datas como objetos Date do JS).
 */
export async function addNewPrayerTarget(uid, targetData) {
    console.log('[Service] Adicionando novo alvo para o usuário:', uid);
    const targetsRef = collection(db, "users", uid, "prayerTargets");
    
    // Converte datas do JS para Timestamps do Firestore antes de salvar
    const dataToSave = {
        ...targetData,
        date: Timestamp.fromDate(targetData.date),
        deadlineDate: targetData.deadlineDate ? Timestamp.fromDate(targetData.deadlineDate) : null,
        createdAt: Timestamp.now() // Adiciona um campo de data de criação
    };
    await addDoc(targetsRef, dataToSave);
    console.log('[Service] Novo alvo adicionado com sucesso.');
}


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

/**
 * Atualiza o status de um alvo na lista diária.
 * @param {string} uid - ID do usuário.
 * @param {string} targetId - ID do alvo a ser atualizado.
 * @param {boolean} completedStatus - O novo status de conclusão.
 */
export async function updateDailyTargetStatus(uid, targetId, completedStatus) {
    const todayStr = getISODateString(new Date());
    const dailyDocId = `${uid}_${todayStr}`;
    const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);
    console.log(`[Service] Atualizando status do alvo ${targetId} para ${completedStatus} no doc ${dailyDocId}`);
    
    const dailySnapshot = await getDoc(dailyRef);
    if (!dailySnapshot.exists()) {
        throw new Error("Documento diário não encontrado para atualização.");
    }

    const dailyData = dailySnapshot.data();
    const targetIndex = dailyData.targets.findIndex(t => t.targetId === targetId);
    
    if (targetIndex === -1) {
        // Se o alvo não estiver na lista, pode ter sido adicionado manualmente. Adicione-o.
        dailyData.targets.push({ targetId: targetId, completed: completedStatus });
    } else {
        dailyData.targets[targetIndex].completed = completedStatus;
    }
    await updateDoc(dailyRef, { targets: dailyData.targets });
}

/**
 * Registra uma interação do usuário e atualiza os dados de perseverança e semanais.
 * @param {string} uid - ID do usuário.
 * @param {object} currentPerseveranceData - Dados de perseverança atuais do estado.
 * @param {object} currentWeeklyData - Dados semanais atuais do estado.
 * @returns {Promise<{isNewRecord: boolean}>} - Retorna se um novo recorde foi batido.
 */
export async function recordUserInteraction(uid, currentPerseveranceData, currentWeeklyData) {
    const todayStr = getISODateString(new Date());
    let isNewRecord = false;

    // --- Lógica de Perseverança (Streak) ---
    const perseveranceRef = doc(db, "perseveranceData", uid);
    const { consecutiveDays = 0, recordDays = 0, lastInteractionDate } = currentPerseveranceData;
    const lastDateStr = lastInteractionDate ? getISODateString(lastInteractionDate) : null;
    
    if (lastDateStr !== todayStr) {
        const today = new Date(todayStr);
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        const yesterdayStr = getISODateString(yesterday);
        
        let newConsecutive = (lastDateStr === yesterdayStr) ? consecutiveDays + 1 : 1;
        const newRecord = Math.max(recordDays, newConsecutive);
        
        if (newRecord > recordDays) {
            isNewRecord = true;
        }

        const updatedPerseverance = {
            consecutiveDays: newConsecutive,
            recordDays: newRecord,
            lastInteractionDate: Timestamp.fromDate(new Date())
        };
        await setDoc(perseveranceRef, updatedPerseverance, { merge: true });
        console.log('[Service] Dados de perseverança atualizados.', updatedPerseverance);
    }

    // --- Lógica de Interação Semanal ---
    const weeklyRef = doc(db, "weeklyInteractions", uid);
    const d = new Date();
    const dayNum = d.getDay() || 7;
    d.setDate(d.getDate() + 4 - dayNum);
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    const weekId = `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;

    let updatedWeekly = { ...currentWeeklyData };
    if (updatedWeekly.weekId !== weekId) {
        updatedWeekly = { weekId: weekId, interactions: {} };
    }
    if (!updatedWeekly.interactions[todayStr]) {
        updatedWeekly.interactions[todayStr] = true;
        await setDoc(weeklyRef, updatedWeekly, { merge: true });
        console.log('[Service] Interação semanal registrada.', updatedWeekly);
    }

    return { isNewRecord };
}


// --- Funções de Ciclo de Vida do Alvo ---

/**
 * Move um alvo ativo para a coleção de arquivados.
 * @param {string} uid - ID do usuário.
 * @param {object} target - O objeto alvo completo.
 */
export async function archiveTarget(uid, target) {
    const batch = writeBatch(db);
    const oldRef = doc(db, "users", uid, "prayerTargets", target.id);
    const newRef = doc(db, "users", uid, "archivedTargets", target.id);

    const dataToArchive = { ...target, archived: true, archivedDate: Timestamp.now() };
    delete dataToArchive.id; // Não armazena o id dentro do documento

    batch.set(newRef, dataToArchive);
    batch.delete(oldRef);

    await batch.commit();
    console.log(`[Service] Alvo ${target.id} arquivado.`);
}

/**
 * Marca um alvo como resolvido e o move para arquivados.
 * @param {string} uid - ID do usuário.
 * @param {object} target - O objeto alvo completo.
 */
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
    console.log(`[Service] Alvo ${target.id} marcado como respondido e arquivado.`);
}

/**
 * Exclui permanentemente um alvo da coleção de arquivados.
 * @param {string} uid - ID do usuário.
 * @param {string} targetId - ID do alvo a ser excluído.
 */
export async function deleteArchivedTarget(uid, targetId) {
    const docRef = doc(db, "users", uid, "archivedTargets", targetId);
    await deleteDoc(docRef);
    console.log(`[Service] Alvo arquivado ${targetId} excluído permanentemente.`);
}
