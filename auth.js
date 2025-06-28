// --- START OF FILE auth.js ---
// Responsabilidade: Conter as funções que interagem diretamente com o serviço Firebase Auth.
// Este módulo não deve manipular o DOM diretamente.

import { auth } from './firebase-config.js';
import { 
    signOut, 
    onAuthStateChanged, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    sendPasswordResetEmail 
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";

/**
 * Inicializa o listener de estado de autenticação.
 * Esta função é o ponto de entrada principal para saber se um usuário está logado ou não.
 * @param {function} onUserAuthenticated - Callback a ser executado quando o estado de autenticação muda. Recebe o objeto 'user' ou 'null'.
 */
export function initializeAuth(onUserAuthenticated) {
    onAuthStateChanged(auth, (user) => {
        onUserAuthenticated(user);
    });
}

/**
 * Cadastra um novo usuário usando e-mail e senha.
 * @param {string} email - O e-mail do usuário.
 * @param {string} password - A senha do usuário.
 * @returns {Promise<import("firebase/auth").UserCredential>} - Uma promessa que resolve com as credenciais do usuário em caso de sucesso.
 * @throws {Error} - Lança um erro em caso de falha no cadastro.
 */
export async function signUpWithEmailPassword(email, password) {
    return await createUserWithEmailAndPassword(auth, email, password);
}

/**
 * Autentica um usuário existente com e-mail e senha.
 * @param {string} email - O e-mail do usuário.
 * @param {string} password - A senha do usuário.
 * @returns {Promise<import("firebase/auth").UserCredential>} - Uma promessa que resolve com as credenciais do usuário em caso de sucesso.
 * @throws {Error} - Lança um erro em caso de falha na autenticação.
 */
export async function signInWithEmailPassword(email, password) {
    return await signInWithEmailAndPassword(auth, email, password);
}

/**
 * Envia um e-mail para redefinição de senha.
 * @param {string} email - O e-mail para o qual o link de redefinição será enviado.
 * @returns {Promise<void>} - Uma promessa que resolve quando o e-mail é enviado.
 * @throws {Error} - Lança um erro se o e-mail não for válido ou houver outro problema.
 */
export async function resetPassword(email) {
    if (!email) {
        throw new Error("O e-mail é obrigatório para redefinir a senha.");
    }
    return await sendPasswordResetEmail(auth, email);
}

/**
 * Desconecta o usuário atualmente autenticado.
 * @returns {Promise<void>} - Uma promessa que resolve quando o logout é concluído.
 * @throws {Error} - Lança um erro se houver falha no logout.
 */
export async function handleSignOut() {
    return await signOut(auth);
}
