// --- START OF FILE state.js ---

export let prayerTargets = [];
export let archivedTargets = [];
export let resolvedTargets = [];
export let lastDisplayedTargets = [];
export let currentPage = 1;
export let currentArchivedPage = 1;
export let currentResolvedPage = 1;
export const targetsPerPage = 10;
export let currentSearchTermMain = '';
export let currentSearchTermArchived = '';
export let currentSearchTermResolved = '';
export let showDeadlineOnly = false;
export let currentDailyTargets = []; // Holds IDs of targets currently in the daily list

export let perseveranceData = {
    consecutiveDays: 0,
    lastInteractionDate: null,
    recordDays: 0 
};
export let previousRecordDays = 0;

export const MILESTONE_DAYS = {
    seed: 7,
    flame: 15,
    star: 30
};

export let weeklyPrayerData = {
    weekId: null,
    interactions: {}
};

export const predefinedCategories = [
    "Família", "Pessoal", "Igreja", "Trabalho", "Sonho",
    "Profético", "Promessas", "Esposa", "Filhas", "Ministério de Intercessão", "Outros"
];

// Funções "Setters" para modificar o estado de forma controlada
export function setPrayerTargets(targets) { prayerTargets = targets; }
export function setArchivedTargets(targets) { archivedTargets = targets; }
export function setResolvedTargets(targets) { resolvedTargets = targets; }
export function setLastDisplayedTargets(targets) { lastDisplayedTargets = targets; }
export function setCurrentPage(page) { currentPage = page; }
export function setCurrentArchivedPage(page) { currentArchivedPage = page; }
export function setCurrentResolvedPage(page) { currentResolvedPage = page; }
export function setCurrentSearchTermMain(term) { currentSearchTermMain = term; }
export function setCurrentSearchTermArchived(term) { currentSearchTermArchived = term; }
export function setCurrentSearchTermResolved(term) { currentSearchTermResolved = term; }
export function setShowDeadlineOnly(value) { showDeadlineOnly = value; }
export function setCurrentDailyTargets(ids) { currentDailyTargets = ids; }
export function setPerseveranceData(data) { perseveranceData = data; }
export function setPreviousRecordDays(days) { previousRecordDays = days; }
export function setWeeklyPrayerData(data) { weeklyPrayerData = data; }

// Funções "Getters" e de manipulação de estado
export const findTargetById = (targetId) => {
    return prayerTargets.find(t => t.id === targetId) || archivedTargets.find(t => t.id === targetId);
};