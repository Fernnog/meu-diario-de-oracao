import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-analytics.js";
import { getAuth, signOut, onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDocs, updateDoc, deleteDoc, query, where, orderBy, getDoc, increment, Timestamp, writeBatch } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// Firebase configuration (as before)
const firebaseConfig = {
    apiKey: "AIzaSyA-j6VX_hZHLcVrW6-KMXf2BvHelyq3yGU",
    authDomain: "alvos-de-oracao.firebaseapp.com",
    projectId: "alvos-de-oracao",
    storageBucket: "alvos-de-oracao.firebasestorage.app",
    messagingSenderId: "303318178934",
    appId: "1:303318178934:web:19ff045c501b5907435357",
    measurementId: "G-RCDW5SR4LZ"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);

// Global variables (as before)
let prayerTargets = [];
let archivedTargets = [];
let resolvedTargets = [];
let lastDisplayedTargets = [];
let currentPage = 1;
let currentArchivedPage = 1;
let currentResolvedPage = 1;
const targetsPerPage = 10;
let currentSearchTermMain = '';
let currentSearchTermArchived = '';
let currentSearchTermResolved = '';
let showDeadlineOnly = false;
let perseveranceData = { consecutiveDays: 0, lastInteractionDate: null, recordDays: 0 };
const timezoneOffsetHours = 4;

// Utility functions (as before)
function formatDateToISO(date) { /* ... */ }
function formatDateForDisplay(dateString) { /* ... */ }
function timeElapsed(date) { /* ... */ }
function isDateExpired(dateString) { /* ... */ }
function generateUniqueId() { /* ... */ }
function rehydrateTargets(targets) { /* ... */ }
function updateAuthUI(user) { /* ... */ }

// ==== MODIFIED FUNCTION: signInWithGoogle (DEBUGGING CONSOLE LOGS ADDED) ====
async function signInWithGoogle() {
    console.log("signInWithGoogle function CALLED!"); // ADDED: Debugging log
    const provider = new GoogleAuthProvider();
    try {
        const userCredential = await signInWithPopup(auth, provider);
        // User signed in with Google!
        const user = userCredential.user;
        loadData(user); // Load data for the logged-in user
    } catch (error) {
        console.error("Erro ao entrar com o Google:", error);
        console.error("Error Object:", error); // ADDED: Log full error object
        alert("Erro ao entrar com o Google: " + error.message);
    }
}

// ==== ENHANCED FUNCTION: generateDailyTargets ====
async function generateDailyTargets(userId, dateStr) {
    try {
        const activeTargetsQuery = query(
            collection(db, "users", userId, "prayerTargets"),
            where("archived", "!=", true) // Assuming you have an 'archived' field, adjust if needed
        );
        const activeTargetsSnapshot = await getDocs(activeTargetsQuery);
        let availableTargets = [];
        activeTargetsSnapshot.forEach(doc => {
            availableTargets.push({...doc.data(), id: doc.id});
        });
        availableTargets = rehydrateTargets(availableTargets);

        if (availableTargets.length === 0) {
            return { userId, date: dateStr, targets: [] };
        }

        // Prioritize less recently presented targets
        availableTargets.sort((a, b) => {
            const dateA = a.lastPresentedDate ? a.lastPresentedDate.toDate() : new Date(0); // Treat null as oldest
            const dateB = b.lastPresentedDate ? b.lastPresentedDate.toDate() : new Date(0);
            return dateA - dateB;
        });

        const selectedTargets = availableTargets.slice(0, Math.min(10, availableTargets.length));
        const targets = [];

        // Batch update to efficiently update lastPresentedDate for all selected targets
        const batch = writeBatch(db);
        selectedTargets.forEach(target => {
            const targetRef = doc(db, "users", userId, "prayerTargets", target.id);
            batch.update(targetRef, { lastPresentedDate: Timestamp.fromDate(new Date()) });
            targets.push({ targetId: target.id, completed: false });
        });
        await batch.commit();

        return { userId, date: dateStr, targets };

    } catch (error) {
        console.error("Error generating daily targets:", error);
        alert("Erro ao gerar alvos diários. Verifique o console.");
        return { userId, date: dateStr, targets: [] }; // Return empty targets to avoid further errors
    }
}

// ==== MODIFIED FUNCTION: loadDailyTargets ====
async function loadDailyTargets() {
    const userId = auth.currentUser ? auth.currentUser.uid : null;
    if (!userId) {
        document.getElementById("dailyTargets").innerHTML = "<p>Faça login para ver os alvos diários.</p>";
        return;
    }

    const today = new Date();
    const todayStr = formatDateToISO(today);
    const dailyDocId = `${userId}_${todayStr}`;
    const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);

    try {
        const dailySnapshot = await getDoc(dailyRef);
        let dailyTargetsData;

        if (!dailySnapshot.exists()) {
            // First access of the day: generate and save daily targets
            dailyTargetsData = await generateDailyTargets(userId, todayStr);
            await setDoc(dailyRef, dailyTargetsData);
        } else {
            dailyTargetsData = dailySnapshot.data();
        }

        const pendingTargets = dailyTargetsData.targets.filter(t => !t.completed);
        const completedTargets = dailyTargetsData.targets.filter(t => t.completed);

        renderDailyTargets(pendingTargets, completedTargets); // Pass both pending and completed
        displayRandomVerse();

    } catch (error) {
        console.error("Error loading daily targets:", error);
        alert("Erro ao carregar alvos diários. Verifique o console.");
        document.getElementById("dailyTargets").innerHTML = "<p>Erro ao carregar alvos diários.</p>";
    }
}


// ==== MODIFIED FUNCTION: renderDailyTargets ====
function renderDailyTargets(pendingTargets, completedTargets) {
    const dailyTargetsDiv = document.getElementById("dailyTargets");
    const completedDailyTargetsDiv = document.getElementById("completedDailyTargets"); // Get the completed targets div

    dailyTargetsDiv.innerHTML = "";
    completedDailyTargetsDiv.innerHTML = ""; // Clear completed targets section

    if (pendingTargets.length === 0 && completedTargets.length === 0) {
        dailyTargetsDiv.innerHTML = "<p>Nenhum alvo de oração para hoje.</p>";
        return;
    }

    if (pendingTargets.length === 0) {
        dailyTargetsDiv.innerHTML = "<p>Todos os alvos do dia foram concluídos!</p>";
        displayCompletionPopup();
    }

    pendingTargets.forEach((dailyTarget, index) => {
        const target = prayerTargets.find(t => t.id === dailyTarget.targetId);
        if (!target) return;

        const dailyDiv = document.createElement("div");
        dailyDiv.classList.add("target");
        dailyDiv.dataset.targetId = target.id;

        const deadlineTag = target.hasDeadline
            ? `<span class="deadline-tag ${isDateExpired(target.deadlineDate) ? 'expired' : ''}">Prazo: ${formatDateForDisplay(target.deadlineDate)}</span>`
            : '';
        dailyDiv.innerHTML = `
            <h3>${deadlineTag} ${target.title}</h3>
            <p>${target.details}</p>
            <p><strong>Tempo Decorrido:</strong> ${timeElapsed(target.date)}</p>
            ${renderObservations(target.observations, false)}
        `;
        dailyTargetsDiv.appendChild(dailyDiv);
        addPrayButtonFunctionality(dailyDiv, index);
    });


    if (completedTargets.length > 0) {
        completedDailyTargetsDiv.style.display = 'block'; // Show completed section if there are completed targets
        completedDailyTargetsDiv.innerHTML += "<h3>Concluídos Hoje</h3>"; // Re-add the heading
        completedTargets.forEach((dailyTarget) => {
            const target = prayerTargets.find(t => t.id === dailyTarget.targetId);
            if (!target) return;

            const completedDiv = document.createElement("div");
            completedDiv.classList.add("target", "completed-target"); // Add class for styling completed targets
            completedDiv.innerHTML = `
                <h3>${target.title} (Concluído Hoje)</h3>
                <p>${target.details}</p>
                <p><strong>Data:</strong> ${formatDateForDisplay(target.date)}</p>
                <p><strong>Tempo Decorrido:</strong> ${timeElapsed(target.date)}</p>
                ${renderObservations(target.observations, false)}
            `;
            completedDailyTargetsDiv.appendChild(completedDiv);
        });
    } else {
        completedDailyTargetsDiv.style.display = 'none'; // Hide if no completed targets
        completedDailyTargetsDiv.innerHTML = ""; // Ensure heading is also cleared when hiding
    }
}


// ==== MODIFIED FUNCTION: addPrayButtonFunctionality ====
function addPrayButtonFunctionality(dailyDiv, targetIndex) {
    const prayButton = document.createElement("button");
    prayButton.textContent = "Orei!";
    prayButton.classList.add("pray-button");
    prayButton.onclick = async () => {
        const targetId = dailyDiv.dataset.targetId;
        const userId = auth.currentUser.uid;
        const todayStr = formatDateToISO(new Date());
        const dailyDocId = `${userId}_${todayStr}`;
        const dailyRef = doc(db, "dailyPrayerTargets", dailyDocId);

        try {
            const dailySnap = await getDoc(dailyRef);
            if (!dailySnap.exists()) throw new Error("Documento diário não encontrado.");

            const dailyData = dailySnap.data();
            const updatedTargets = dailyData.targets.map(t =>
                t.targetId === targetId ? { ...t, completed: true } : t
            );

            await updateDoc(dailyRef, { targets: updatedTargets });
            loadDailyTargets(); // Re-render daily targets to reflect completion

            // Update click count (as before)
            const clickCountsRef = doc(db, "prayerClickCounts", targetId);
            const now = new Date();
            const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const year = now.getFullYear().toString();

            const docSnap = await getDoc(clickCountsRef);
            if (docSnap.exists()) {
                await updateDoc(clickCountsRef, {
                    totalClicks: increment(1),
                    [`monthlyClicks.${yearMonth}`]: increment(1),
                    [`yearlyClicks.${year}`]: increment(1)
                });
            } else {
                await setDoc(clickCountsRef, {
                    targetId,
                    userId,
                    totalClicks: 1,
                    monthlyClicks: { [yearMonth]: 1 },
                    yearlyClicks: { [year]: 1 }
                });
            }
        } catch (error) {
            console.error("Erro ao registrar 'Orei!':", error);
            alert("Erro ao registrar oração. Verifique o console.");
        }
    };
    dailyDiv.insertBefore(prayButton, dailyDiv.firstChild);
}

// Initial load and authentication (as before, but loadDailyTargets instead of refreshDailyTargets)
async function loadData(user) {
    updateAuthUI(user);
    if (user) {
        document.getElementById('appContent').style.display = 'none';
        document.getElementById('dailySection').style.display = 'block';
        document.getElementById('sectionSeparator').style.display = 'block';
        document.getElementById('mainPanel').style.display = 'none';
        document.getElementById('weeklyPerseveranceChart').style.display = 'block';
        document.getElementById('perseveranceSection').style.display = 'block';

        await fetchPrayerTargets(user.uid);
        await fetchArchivedTargets(user.uid);
        resolvedTargets = archivedTargets.filter(target => target.resolved);
        checkExpiredDeadlines();
        renderTargets();
        renderArchivedTargets();
        renderResolvedTargets();
        await loadDailyTargets(); // Load daily targets using new logic
        await loadPerseveranceData(user.uid);
    } else {
        document.getElementById('appContent').style.display = 'none';
        document.getElementById('dailySection').style.display = 'none';
        document.getElementById('sectionSeparator').style.display = 'none';
        document.getElementById('mainPanel').style.display = 'none';
        document.getElementById('weeklyPerseveranceChart').style.display = 'none';
        document.getElementById('perseveranceSection').style.display = 'none';

        prayerTargets = [];
        archivedTargets = [];
        resolvedTargets = [];
        renderTargets();
        renderArchivedTargets();
        renderResolvedTargets();
        await loadDailyTargets(); // Still load daily targets (will show login message)
        resetPerseveranceUI();
    }
}

async function fetchPrayerTargets(uid) {
    prayerTargets = [];
    const targetsRef = collection(db, "users", uid, "prayerTargets");
    const targetsSnapshot = await getDocs(query(targetsRef, orderBy("date", "desc"))); // Ordenar por data
    targetsSnapshot.forEach((doc) => {
        const targetData = {...doc.data(), id: doc.id};
        console.log("Data fetched from Firestore for target ID:", doc.id, "Date (Timestamp):", targetData.date); //Log Timestamp from Firestore
        prayerTargets.push(targetData);
    });
    prayerTargets = rehydrateTargets(prayerTargets);
    console.log("Rehydrated Prayer Targets:", prayerTargets); // Log after rehydration
}
async function fetchArchivedTargets(uid) { /* ... */ }


window.onload = () => {
    onAuthStateChanged(auth, (user) => {
        loadData(user);
    });
    document.getElementById('searchMain').addEventListener('input', handleSearchMain);
    document.getElementById('searchArchived').addEventListener('input', handleSearchArchived);
    document.getElementById('searchResolved').addEventListener('input', handleSearchResolved);
    document.getElementById('showDeadlineOnly').addEventListener('change', handleDeadlineFilterChange);
    document.getElementById('showExpiredOnlyMain').addEventListener('change', handleExpiredOnlyMainChange);
    document.getElementById('confirmPerseveranceButton').addEventListener('click', confirmPerseverance);
    document.getElementById("viewReportButton").addEventListener('click', () => { window.location.href = 'orei.html'; });
    const btnGoogleLogin = document.getElementById('btnGoogleLogin');
    if (btnGoogleLogin) { btnGoogleLogin.addEventListener('click', signInWithGoogle); }
};


function renderTargets() { /* ... */ }
function renderArchivedTargets() { /* ... */ }
function renderResolvedTargets() { /* ... */ }
function renderPagination(panelId, page, targets) { /* ... */ }
function renderObservations(observations, isExpanded = false) { /* ... */ }
window.toggleObservations = function(targetId) { /* ... */ }
function toggleAddObservation(targetId) { /* ... */ }
async function saveObservation(targetId) { /* ... */ }
function handleDeadlineFilterChange() { /* ... */ }
function handleExpiredOnlyMainChange() { /* ... */ }
document.getElementById('hasDeadline').addEventListener('change', function() { /* ... */ });
document.getElementById("prayerForm").addEventListener("submit", async (e) => { /* ... */ });
async function markAsResolved(targetId) { /* ... */ }
async function archiveTarget(targetId) { /* ... */ }
async function deleteArchivedTarget(targetId) { /* ... */ }
document.addEventListener('DOMContentLoaded', () => { /* ... */ });
document.getElementById('viewAllTargetsButton').addEventListener('click', () => { /* ... */ });
document.getElementById('addNewTargetButton').addEventListener('click', () => { /* ... */ });
const viewArchivedButton = document.getElementById("viewArchivedButton");
const viewResolvedButton = document.getElementById("viewResolvedButton");
const backToMainButton = document.getElementById("backToMainButton");
const mainPanel = document.getElementById("mainPanel");
const dailySection = document.getElementById("dailySection");
const archivedPanel = document.getElementById("archivedPanel");
const resolvedPanel = document.getElementById("resolvedPanel");
const appContent = document.getElementById("appContent");
const weeklyPerseveranceChart = document.getElementById("weeklyPerseveranceChart");
const perseveranceSection = document.getElementById("perseveranceSection");
viewArchivedButton.addEventListener("click", () => { /* ... */ });
viewResolvedButton.addEventListener("click", () => { /* ... */ });
backToMainButton.addEventListener("click", () => { /* ... */ });
document.getElementById("copyDaily").addEventListener("click", function () { /* ... */ });
document.getElementById('generateViewButton').addEventListener('click', generateViewHTML);
document.getElementById('viewDaily').addEventListener('click', generateDailyViewHTML);
document.getElementById("viewResolvedViewButton").addEventListener("click", () => { /* ... */ });
const dateRangeModal = document.getElementById("dateRangeModal");
const closeDateRangeModalButton = document.getElementById("closeDateRangeModal");
const generateResolvedViewButton = document.getElementById("generateResolvedView");
const cancelDateRangeButton = document.getElementById("cancelDateRange");
const startDateInput = document.getElementById("startDate");
const endDateInput = document.getElementById("endDate");
closeDateRangeModalButton.addEventListener("click", () => { /* ... */ });
generateResolvedViewButton.addEventListener("click", () => { /* ... */ });
cancelDateRangeButton.addEventListener("click", () => { /* ... */ });
document.getElementById("viewReportButton").addEventListener('click', () => { /* ... */ });
function generateViewHTML() { /* ... */ }
function generateDailyViewHTML() { /* ... */ }
function generateResolvedViewHTML(startDate, endDate) { /* ... */ }
function filterTargets(targets, searchTerm) { /* ... */ }
function handleSearchMain(event) { /* ... */ }
function handleSearchArchived(event) { /* ... */ }
function handleSearchResolved(event) { /* ... */ }
const verses = [ /* ... */ ];
function displayRandomVerse() { /* ... */ }
function checkIfAllPrayersDone() { /* ... */ }
function displayCompletionPopup() { /* ... */ }
document.getElementById('closePopup').addEventListener('click', () => { /* ... */ });
async function generateReport() { /* ... */ }
function displayReportModal(reportText){ /* ... */ }
function hideTargets(){ /* ... */ }
function checkExpiredDeadlines() { /* ... */ }
async function loadPerseveranceData(userId) { /* ... */ }
async function confirmPerseverance() { /* ... */ }
async function updatePerseveranceFirestore(userId, data) { /* ... */ }
function updatePerseveranceUI() { /* ... */ }
function resetPerseveranceUI() { /* ... */ }
async function editDeadline(targetId) { /* ... */ }
function isValidDate(dateString) { /* ... */ }
function convertToISO(dateString) { /* ... */ }
