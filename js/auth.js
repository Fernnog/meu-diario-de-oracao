// --- START OF FILE auth.js ---
// Responsabilidade: Conter as funções que interagem com o Firebase Auth (Somente E-mail/Senha).

import {
    getAuth,
    signOut,
    onAuthStateChanged,
    signInWithEmailAndPassword as firebaseSignIn
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";

import { app } from './firebase-config.js';

const auth = getAuth(app);

export function initializeAuth(onUserAuthenticated) {
    onAuthStateChanged(auth, (user) => {
        onUserAuthenticated(user);
    });
}

export async function signInWithEmailAndPassword(email, password) {
    return await firebaseSignIn(auth, email, password);
}

export async function handleSignOut() {
    return await signOut(auth);
}