// --- START OF FILE auth.js ---

import { auth } from './firebase-config.js';
import { signOut, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";

export function initializeAuth(onUserAuthenticated) {
    onAuthStateChanged(auth, (user) => {
        updateAuthUI(user);
        onUserAuthenticated(user);
    });
}

export function updateAuthUI(user) {
    const authStatus = document.getElementById('authStatus');
    const btnLogout = document.getElementById('btnLogout');
    const emailPasswordAuthForm = document.getElementById('emailPasswordAuthForm');
    const authStatusContainer = document.querySelector('.auth-status-container');

    if (user) {
        authStatusContainer.style.display = 'flex';
        btnLogout.style.display = 'inline-block';
        emailPasswordAuthForm.style.display = 'none';
        let providerType = 'desconhecido';
        if (user.providerData[0]?.providerId === 'password') providerType = 'E-mail/Senha';
        else if (user.providerData[0]?.providerId === 'google.com') providerType = 'Google';
        authStatus.textContent = `Autenticado: ${user.email} (via ${providerType})`;
    } else {
        authStatusContainer.style.display = 'none'; 
        btnLogout.style.display = 'none';
        emailPasswordAuthForm.style.display = 'block'; 
        document.getElementById('passwordResetMessage').style.display = 'none';
    }
}

export async function signUpWithEmailPassword() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const passwordResetMessageDiv = document.getElementById('passwordResetMessage');
    passwordResetMessageDiv.style.display = "none";
    try {
        await createUserWithEmailAndPassword(auth, email, password);
        alert("Cadastro realizado com sucesso! Você já está logado.");
    } catch (error) {
        console.error("Erro ao cadastrar com e-mail/senha:", error);
        alert("Erro ao cadastrar: " + error.message);
    }
}

export async function signInWithEmailPassword() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const passwordResetMessageDiv = document.getElementById('passwordResetMessage');
    passwordResetMessageDiv.style.display = "none";
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        console.error("Erro ao entrar com e-mail/senha:", error);
        alert("Erro ao entrar: " + error.message);
    }
}

export async function resetPassword() {
    const email = document.getElementById('email').value;
    if (!email) {
        alert("Por favor, insira seu e-mail para redefinir a senha.");
        return;
    }
    const passwordResetMessageDiv = document.getElementById('passwordResetMessage');
    try {
        await sendPasswordResetEmail(auth, email);
        passwordResetMessageDiv.textContent = "Um e-mail de redefinição de senha foi enviado para " + email + ". Verifique sua caixa de entrada e spam.";
        passwordResetMessageDiv.style.color = "green";
        passwordResetMessageDiv.style.display = "block";
    } catch (error) {
        console.error("Erro ao enviar e-mail de redefinição:", error);
        passwordResetMessageDiv.textContent = "Erro ao redefinir senha: " + error.message;
        passwordResetMessageDiv.style.color = "red";
        passwordResetMessageDiv.style.display = "block";
    }
}

export function handleSignOut() {
    signOut(auth).catch(error => console.error("Logout error:", error));
}