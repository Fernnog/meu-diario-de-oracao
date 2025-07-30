// --- START OF FILE auth.js ---
// Responsabilidade: Conter as funções que interagem com o Firebase Auth.
// ARQUIVO CONSOLIDADO E CORRIGIDO: Remove duplicatas e adiciona escopos do Drive.

// ETAPA 1: Centralizar TODAS as importações necessárias em um único local no topo do arquivo.
import {
    getAuth,
    signOut,
    onAuthStateChanged,
    createUserWithEmailAndPassword as firebaseCreateUser,
    signInWithEmailAndPassword as firebaseSignIn,
    sendPasswordResetEmail as firebaseSendPasswordReset,
    GoogleAuthProvider,
    signInWithPopup
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";

// Importa a configuração do Firebase
import { app } from './firebase-config.js';

// ETAPA 2: Inicializar o serviço de autenticação UMA ÚNICA VEZ para todo o módulo.
const auth = getAuth(app);

// --- Daqui para baixo, todas as funções exportadas estão limpas e usam as constantes definidas acima ---

/**
 * Inicializa o listener de estado de autenticação.
 * @param {function} onUserAuthenticated - Callback que recebe o objeto 'user' ou 'null'.
 */
export function initializeAuth(onUserAuthenticated) {
    onAuthStateChanged(auth, (user) => {
        onUserAuthenticated(user);
    });
}

/**
 * Cadastra um novo usuário usando e-mail e senha.
 */
export async function signUpWithEmailPassword(email, password) {
    return await firebaseCreateUser(auth, email, password);
}

/**
 * Autentica um usuário existente com e-mail e senha.
 */
export async function signInWithEmailAndPassword(email, password) {
    return await firebaseSignIn(auth, email, password);
}

/**
 * (VERSÃO CORRIGIDA) Autentica um usuário com o Google, solicitando as permissões corretas para o Drive.
 * @returns {Promise<{user: import("firebase/auth").User, accessToken: string}>}
 */
export async function signInWithGoogle() {
    const provider = new GoogleAuthProvider();

    // Adiciona os escopos (permissões) necessários para o Google Drive.
    // 'drive.file' -> Permite acesso apenas aos arquivos criados por este app.
    provider.addScope('https://www.googleapis.com/auth/drive.file');
    // 'drive.appdata' -> Permite acesso à pasta de dados oculta do app. ESSENCIAL PARA A CORREÇÃO.
    provider.addScope('https://www.googleapis.com/auth/drive.appdata');

    try {
        const result = await signInWithPopup(auth, provider);
        
        // Extrai o token de acesso OAuth, que será usado para chamar a API do Drive.
        const credential = GoogleAuthProvider.credentialFromResult(result);
        const accessToken = credential.accessToken;
        const user = result.user;

        console.log("[Auth] Login com Google bem-sucedido. Token de acesso obtido.");
        return { user, accessToken };

    } catch (error) {
        console.error("Erro durante o login com Google:", error);
        if (error.code === 'auth/popup-closed-by-user') {
            throw new Error("A janela de login com o Google foi fechada antes da conclusão.");
        }
        throw new Error("Ocorreu um erro ao tentar fazer login com o Google.");
    }
}

/**
 * Envia um e-mail para redefinição de senha.
 */
export async function resetPassword(email) {
    if (!email) {
        throw new Error("O e-mail é obrigatório para redefinir a senha.");
    }
    return await firebaseSendPasswordReset(auth, email);
}

/**
 * Desconecta o usuário atualmente autenticado.
 */
export async function handleSignOut() {
    return await signOut(auth);
}
