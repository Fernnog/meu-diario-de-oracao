// --- START OF FILE firestore-service.js ---

import { auth, db } from './firebase-config.js';
import { collection, doc, setDoc, getDocs, updateDoc, deleteDoc, query, where, orderBy, getDoc, addDoc, increment, Timestamp, writeBatch, runTransaction } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { rehydrateTargets, formatDateToISO, getWeekIdentifier } from './utils.js';
import * as State from './state.js';

// --- FETCH FUNCTIONS ---
export async function fetchPrayerTargets(uid) {
    const targetsRef = collection(db, "users", uid, "prayerTargets");
    const targetsSnapshot = await getDocs(query(targetsRef, orderBy("date", "desc")));
    console.log(`[Service] Found ${targetsSnapshot.size} active targets for user ${uid}`);
    const rawTargets = targetsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    return rehydrateTargets(rawTargets);
}

export async function fetchArchivedTargets(uid) {
    const archivedRef = collection(db, "users", uid, "archivedTargets");
    const archivedSnapshot = await getDocs(query(archivedRef, orderBy("archivedDate", "desc")));
    console.log(`[Service] Found ${archivedSnapshot.size} archived targets for user ${uid}`);
    const rawArchived = archivedSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    return rehydrateTargets(rawArchived);
}

export async function fetchResolvedTargetsByDateRange(uid, startDate, endDate) {
    const startUTC = new Date(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate());
    const endNextDay = new Date(endDate);
    endNextDay.setUTCDate(endDate.getUTCDate() + 1);
    const endUTCStartOfNextDay = new Date(endNextDay.getUTCFullYear(), endNextDay.getUTCMonth(), endNextDay.getUTCDate());

    const startTimestamp = Timestamp.fromDate(startUTC);
    const endTimestamp = Timestamp.fromDate(endUTCStartOfNextDay); 

    const archivedRef = collection(db, "users", uid, "archivedTargets");
    const q = query(archivedRef,
        where("resolved", "==", true),
        where("resolutionDate", ">=", startTimestamp),
        where("resolutionDate", "<", endTimestamp),
        orderBy("resolutionDate", "desc")
    );
    const querySnapshot = await getDocs(q);
    const rawTargets = querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    return rehydrateTargets(rawTargets);
}

// --- WRITE/UPDATE FUNCTIONS ---
export async function saveNewPrayerTarget(targetData) {
    const uid = auth.currentUser.uid;
    return await addDoc(collection(db, "users", uid, "prayerTargets"), targetData);
}

export async function resolveTarget(userId, targetData) {
    const targetId = targetData.id;
    const resolutionDate = Timestamp.fromDate(new Date());
    const activeTargetRef = doc(db, "users", userId, "prayerTargets", targetId);
    const archivedTargetRef = doc(db, "users", userId, "archivedTargets", targetId);

    const archivedData = {
        ...targetData,
        date: targetData.date ? Timestamp.fromDate(targetData.date) : null,
        deadlineDate: targetData.deadlineDate ? Timestamp.fromDate(targetData.deadlineDate) : null,
        lastPrayedDate: targetData.lastPrayedDate ? Timestamp.fromDate(targetData.lastPrayedDate) : null,
        observations: Array.isArray(targetData.observations) ? targetData.observations.map(obs => ({
            ...obs,
            date: obs.date ? Timestamp.fromDate(obs.date) : null
        })) : [],
        resolved: true,
        archived: true,
        resolutionDate: resolutionDate,
        archivedDate: resolutionDate
    };
    delete archivedData.id;

    const batch = writeBatch(db);
    batch.delete(activeTargetRef);
    batch.set(archivedTargetRef, archivedData);
    await batch.commit();
    return { ...archivedData, id: targetId };
}

export async function archiveTarget(userId, targetData) {
    const targetId = targetData.id;
    const archiveTimestamp = Timestamp.fromDate(new Date());
    const activeTargetRef = doc(db, "users", userId, "prayerTargets", targetId);
    const archivedTargetRef = doc(db, "users", userId, "archivedTargets", targetId);
    
    const archivedData = {
        ...targetData,
        date: targetData.date ? Timestamp.fromDate(targetData.date) : null,
        deadlineDate: targetData.deadlineDate ? Timestamp.fromDate(targetData.deadlineDate) : null,
        lastPrayedDate: targetData.lastPrayedDate ? Timestamp.fromDate(targetData.lastPrayedDate) : null,
        observations: Array.isArray(targetData.observations) ? targetData.observations.map(obs => ({
            ...obs,
            date: obs.date ? Timestamp.fromDate(obs.date) : null
        })) : [],
        resolved: false,
        archived: true,
        archivedDate: archiveTimestamp,
    };
    delete archivedData.id;

    const batch = writeBatch(db);
    batch.delete(activeTargetRef);
    batch.set(archivedTargetRef, archivedData);
    await batch.commit();
    return { ...archivedData, id: targetId };
}

export async function deleteArchivedTarget(userId, targetId) {
    const archivedTargetRef = doc(db, "users", userId, "archivedTargets", targetId);
    const clickCountsRef = doc(db, "prayerClickCounts", targetId);
    
    const batch = writeBatch(db);
    batch.delete(archivedTargetRef);
    batch.delete(clickCountsRef);
    await batch.commit();
}

export async function saveObservation(userId, targetId, newObservation) {
    const target = State.findTargetById(targetId);
    if (!target) throw new Error("Target not found in local state.");

    const collectionName = target.archived ? "archivedTargets" : "prayerTargets";
    const targetRef = doc(db, "users", userId, collectionName, targetId);

    const targetDocSnap = await getDoc(targetRef);
    if (!targetDocSnap.exists()) throw new Error("Target document does not exist in Firestore.");

    const currentData = targetDocSnap.data();
    const currentObservations = currentData.observations || [];
    currentObservations.push(newObservation);
    currentObservations.sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));

    await updateDoc(targetRef, { observations: currentObservations });
}

export async function updateDeadline(userId, targetId, newDeadlineTimestamp, newHasDeadline) {
    const targetRef = doc(db, "users", userId, "prayerTargets", targetId);
    await updateDoc(targetRef, {
        deadlineDate: newDeadlineTimestamp,
        hasDeadline: newHasDeadline
    });
}

export async function updateCategory(userId, targetId, newCategoryValue) {
    const target = State.findTargetById(targetId);
    if (!target) throw new Error("Target not found in local state.");
    
    const collectionName = target.archived ? "archivedTargets" : "prayerTargets";
    const targetRef = doc(db, "users", userId, collectionName, targetId);
    
    await updateDoc(targetRef, {
        category: newCategoryValue || null
    });
}

// --- DAILY TARGETS & PERSEVERANCE ---
export async function getOrCreateDailyDoc(userId, todayStr) {
    const dailyDocId = `${userId}_${todayStr}`;
    const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);
    const dailySnapshot = await getDoc(dailyRef);

    if (!dailySnapshot.exists() || !dailySnapshot.data()?.targets) {
        console.log(`[Service] Daily document for ${dailyDocId} not found, generating.`);
        const dailyTargetsData = await generateDailyTargets(userId, todayStr);
        await setDoc(dailyRef, dailyTargetsData);
        return dailyTargetsData;
    } else {
        return dailySnapshot.data();
    }
}

async function generateDailyTargets(userId, dateStr) {
    console.log(`[Service] Generating daily targets for ${userId} on ${dateStr}`);
    const availableTargets = State.prayerTargets.filter(t => t && t.id && !t.archived && !t.resolved);
    if (availableTargets.length === 0) {
        return { userId, date: dateStr, targets: [] };
    }
    
    // (Logic from the original file is preserved here)
    const today = new Date(dateStr + 'T00:00:00Z');
    let pool = [...availableTargets]; 
    const historyDays = 7;
    const completedInHistory = new Set(); 
    for (let i = 1; i <= historyDays; i++) {
        const pastDate = new Date(today.getTime() - i * 86400000);
        const pastDateStr = formatDateToISO(pastDate);
        const pastDocId = `${userId}_${pastDateStr}`;
        try {
            const pastSnap = await getDoc(doc(db, "dailyPrayerTargets", pastDocId));
            if (pastSnap.exists()) {
                pastSnap.data().targets?.forEach(t => {
                    if (t?.targetId && t.completed === true) completedInHistory.add(t.targetId);
                });
            }
        } catch (err) {
            console.warn(`[Service] Error fetching history for ${pastDateStr}:`, err);
        }
    }
    
    pool = pool.filter(target => !completedInHistory.has(target.id));

    if (pool.length === 0 && availableTargets.length > 0) {
        pool = [...availableTargets].sort((a, b) => (a.lastPrayedDate?.getTime() || 0) - (b.lastPrayedDate?.getTime() || 0));
    } else if (pool.length > 0) {
        pool.sort((a, b) => (a.lastPrayedDate?.getTime() || 0) - (b.lastPrayedDate?.getTime() || 0));
    }

    const maxDailyTargets = 10;
    const selectedTargets = pool.slice(0, Math.min(maxDailyTargets, pool.length));
    const targetsForFirestore = selectedTargets.map(target => ({ targetId: target.id, completed: false }));

    return { userId, date: dateStr, targets: targetsForFirestore };
}

export async function refreshDailyTargets(userId, todayStr) {
    const dailyDocId = `${userId}_${todayStr}`;
    const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);
    const newTargetsData = await generateDailyTargets(userId, todayStr);
    await setDoc(dailyRef, newTargetsData);
    return newTargetsData;
}

export async function addManualTargetToDailyList(userId, targetId) {
    const todayStr = formatDateToISO(new Date());
    const dailyDocId = `${userId}_${todayStr}`;
    const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);

    await runTransaction(db, async (transaction) => {
        const dailyDocSnap = await transaction.get(dailyRef);
        if (!dailyDocSnap.exists()) {
            throw new Error("Documento diário não encontrado. Tente recarregar a página.");
        }
        let currentTargetsArray = dailyDocSnap.data().targets || [];
        if (currentTargetsArray.some(t => t?.targetId === targetId)) {
            throw new Error("Target already in list."); // This will be caught in the UI
        }
        const newTargetEntry = { targetId: targetId, completed: false, manuallyAdded: true };
        const updatedTargetsArray = [...currentTargetsArray, newTargetEntry];
        transaction.update(dailyRef, { targets: updatedTargetsArray });
    });
}

export async function processOreiClick(userId, targetId) {
    const todayStr = formatDateToISO(new Date());
    const dailyDocId = `${userId}_${todayStr}`;
    const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);
    const clickCountsRef = doc(db, "prayerClickCounts", targetId);
    const weeklyDocRef = doc(db, "weeklyInteractions", userId);
    const perseveranceDocRef = doc(db, "perseveranceData", userId);
    const activeTargetRef = doc(db, "users", userId, "prayerTargets", targetId);

    const now = new Date();
    const nowTimestamp = Timestamp.fromDate(now);
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const year = now.getFullYear().toString();
    const weekId = getWeekIdentifier(now);
    const todayUTCStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const batch = writeBatch(db);
    let newPerseveranceData = { ...State.perseveranceData };
    let newWeeklyData = { ...State.weeklyPrayerData };
    let newRecordAchieved = false;

    // --- Daily Doc Update ---
    const dailySnap = await getDoc(dailyRef);
    if (dailySnap.exists()) {
        const dailyData = dailySnap.data();
        const updatedTargets = dailyData.targets.map(t => 
            (t && t.targetId === targetId) ? { ...t, completed: true } : t
        );
        batch.update(dailyRef, { targets: updatedTargets });
    }

    // --- Perseverance Update ---
    const lastInteractionDate = State.perseveranceData.lastInteractionDate;
    if (!lastInteractionDate || todayUTCStart.getTime() > lastInteractionDate.getTime()) {
        const expectedYesterday = new Date(todayUTCStart.getTime() - 86400000);
        const isConsecutive = lastInteractionDate && lastInteractionDate.getTime() === expectedYesterday.getTime();
        
        const newConsecutiveDays = isConsecutive ? (State.perseveranceData.consecutiveDays || 0) + 1 : 1;
        const newRecordDays = Math.max(State.perseveranceData.recordDays || 0, newConsecutiveDays);
        if (newRecordDays > (State.perseveranceData.recordDays || 0)) {
            newRecordAchieved = true;
        }

        newPerseveranceData = {
            consecutiveDays: newConsecutiveDays,
            lastInteractionDate: todayUTCStart,
            recordDays: newRecordDays
        };
        batch.set(perseveranceDocRef, { 
            ...newPerseveranceData,
            lastInteractionDate: Timestamp.fromDate(todayUTCStart)
        }, { merge: true });
    }

    // --- Weekly Chart Update ---
    if (State.weeklyPrayerData.weekId !== weekId) {
        newWeeklyData = { weekId: weekId, interactions: { [todayStr]: true } };
        batch.set(weeklyDocRef, { userId, ...newWeeklyData });
    } else if (!State.weeklyPrayerData.interactions[todayStr]) {
        newWeeklyData.interactions[todayStr] = true;
        batch.update(weeklyDocRef, { [`interactions.${todayStr}`]: true });
    }

    // --- Other Updates ---
    batch.set(clickCountsRef, {
        targetId, userId,
        totalClicks: increment(1),
        [`monthlyClicks.${yearMonth}`]: increment(1),
        [`yearlyClicks.${year}`]: increment(1)
    }, { merge: true });

    batch.update(activeTargetRef, { lastPrayedDate: nowTimestamp });

    await batch.commit();

    return { newPerseveranceData, newWeeklyData, newRecordAchieved };
}

export async function loadPerseveranceData(userId) {
    const perseveranceDocRef = doc(db, "perseveranceData", userId);
    const docSnap = await getDoc(perseveranceDocRef);
    if (docSnap.exists()) {
        const [hydrated] = rehydrateTargets([{...docSnap.data()}]);
        return {
            lastInteractionDate: hydrated.lastInteractionDate,
            consecutiveDays: Number(hydrated.consecutiveDays) || 0,
            recordDays: Number(hydrated.recordDays) || 0,
        };
    }
    return { consecutiveDays: 0, lastInteractionDate: null, recordDays: 0 };
}

export async function loadWeeklyPrayerData(userId) {
    const weeklyDocRef = doc(db, "weeklyInteractions", userId);
    const docSnap = await getDoc(weeklyDocRef);
    const today = new Date();
    const currentWeekId = getWeekIdentifier(today);

    if (docSnap.exists()) {
        const loadedData = docSnap.data();
        if (loadedData.weekId === currentWeekId) {
            return { weekId: loadedData.weekId, interactions: loadedData.interactions || {} };
        }
    }
    // If doc doesn't exist or week is old, create a new one
    const newWeeklyData = { weekId: currentWeekId, interactions: {} };
    await setDoc(weeklyDocRef, { userId, ...newWeeklyData });
    return newWeeklyData;
}