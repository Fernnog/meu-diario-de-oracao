// --- START OF FILE utils.js ---

import { Timestamp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

export function getWeekIdentifier(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function convertToDate(value) {
    if (!value) {
        return null;
    }
    if (value instanceof Timestamp) {
        return value.toDate();
    }
    if (value instanceof Date) {
        return !isNaN(value.getTime()) ? value : null;
    }
    if (typeof value === 'string') {
        const parsedDate = new Date(value);
        return !isNaN(parsedDate.getTime()) ? parsedDate : null;
    }
    return null;
}

export function formatDateToISO(date) {
    const validDate = convertToDate(date);
    if (!validDate) {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    const year = validDate.getUTCFullYear();
    const month = String(validDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(validDate.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function formatDateForDisplay(date) {
    const validDate = convertToDate(date);
    if (!validDate) {
        return 'Data Inválida';
    }
    const day = String(validDate.getUTCDate()).padStart(2, '0');
    const month = String(validDate.getUTCMonth() + 1).padStart(2, '0');
    const year = validDate.getUTCFullYear();
    return `${day}/${month}/${year}`;
}

export function timeElapsed(date) {
    const validDate = convertToDate(date);
    if (!validDate) { return 'Tempo desconhecido'; }

    const now = new Date();
    let diffInSeconds = Math.floor((now.getTime() - validDate.getTime()) / 1000);
    if (diffInSeconds < 0) diffInSeconds = 0;

    if (diffInSeconds < 60) return `${diffInSeconds} seg`;
    let diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes} min`;
    let diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} hr`;
    let diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 30) return `${diffInDays} dias`;
    let diffInMonths = Math.floor(diffInDays / 30.44);
    if (diffInMonths < 12) return `${diffInMonths} meses`;
    let diffInYears = Math.floor(diffInDays / 365.25);
    return `${diffInYears} anos`;
}

export function isDateExpired(date) {
    const validDate = convertToDate(date);
    if (!validDate) return false;
    const now = new Date();
    const todayUTCStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return validDate.getTime() < todayUTCStart.getTime();
}

export function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 15);
}

export function rehydrateTargets(targets) {
    return targets.map(target => {
        const rehydrated = { ...target };
        const dateFields = ['date', 'deadlineDate', 'lastPrayedDate', 'resolutionDate', 'archivedDate', 'lastInteractionDate'];
        dateFields.forEach(field => {
            rehydrated[field] = convertToDate(rehydrated[field]);
        });
        if (Array.isArray(rehydrated.observations)) {
            rehydrated.observations = rehydrated.observations
                .map(obs => ({
                    ...obs,
                    date: convertToDate(obs.date)
                }))
                .filter(obs => obs.date) 
                .sort((a, b) => b.date.getTime() - a.date.getTime());
        } else {
            rehydrated.observations = [];
        }
        return rehydrated;
    });
}