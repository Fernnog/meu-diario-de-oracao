// --- START OF FILE google-drive-service.js ---
// Responsabilidade: Conter toda a lógica de comunicação com a API do Google Drive.
// Este módulo lida com a criação e atualização de backups de alvos.
// VERSÃO ATUALIZADA: Inclui logs de diagnóstico e correção na construção da requisição.

// Flag para garantir que a API do Google só seja carregada uma vez.
let gapiInitialized = false;
// Cache para o ID da pasta do aplicativo, evitando chamadas repetidas à API.
let appFolderId = null;
// Nome da pasta que será criada no Google Drive do usuário.
const FOLDER_NAME = "Meus Alvos de Oração";

/**
 * Carrega e inicializa a biblioteca cliente da API do Google (GAPI).
 * Esta função deve ser chamada na inicialização da aplicação após o login com Google.
 * @param {string} accessToken - O token de acesso OAuth obtido do Firebase Auth.
 * @returns {Promise<boolean>} - Resolve para 'true' se a inicialização for bem-sucedida.
 */
export async function initializeDriveService(accessToken) {
    if (gapiInitialized) {
        // Se já foi inicializado, apenas revalida o token
        gapi.auth.setToken({ access_token: accessToken });
        return true;
    }

    return new Promise((resolve, reject) => {
        // Cria um elemento <script> para carregar a biblioteca GAPI
        const script = document.createElement("script");
        script.src = "https://apis.google.com/js/api.js";
        document.body.appendChild(script);

        script.onload = () => {
            // Após carregar o script, carrega o módulo 'client' do GAPI
            gapi.load('client', async () => {
                try {
                    // Inicializa o cliente com a API do Drive v3
                    await gapi.client.init({
                        'discoveryDocs': ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']
                    });
                    // Define o token de acesso para autorizar as chamadas
                    gapi.auth.setToken({ access_token: accessToken });
                    gapiInitialized = true;
                    resolve(true);
                } catch (error) {
                    // LOG 2: Verificar falha na inicialização do GAPI
                    console.error("%c[Drive Service] Erro ao inicializar o cliente GAPI. Verifique as configurações no Google Console.", 'color: red; font-weight: bold;', error);
                    reject(error);
                }
            });
        };
        script.onerror = () => reject(new Error("Falha ao carregar o script da API do Google."));
    });
}

/**
 * (PRIORIDADE 3 - CORRIGIDO) Constrói o corpo da requisição multipart para a API do Drive.
 * Abstrai a lógica de criação do corpo para evitar duplicação.
 * @param {object} metadata - Os metadados do arquivo (nome, mimeType, etc.).
 * @param {string} fileContent - O conteúdo de texto do arquivo.
 * @returns {{boundary: string, body: string}} - O limite e o corpo da requisição.
 */
function _buildMultipartBody(metadata, fileContent) {
    const boundary = '---------' + Date.now();
    const delimiter = `\r\n--${boundary}`;
    const close_delim = `${delimiter}--`;

    const multipartRequestBody = [
        delimiter,
        'Content-Type: application/json; charset=UTF-8',
        '',
        JSON.stringify(metadata),
        delimiter,
        'Content-Type: text/plain; charset=UTF-8',
        '',
        fileContent,
        close_delim
    ].join('\r\n');

    return { boundary, body: multipartRequestBody };
}


/**
 * (PRIORIDADE 1 - CORRIGIDO COM LOG DE DIAGNÓSTICO) Procura pela pasta da aplicação no Drive ou a cria se não existir.
 * Utiliza a 'appDataFolder' para armazenar um marcador com o ID da pasta visível.
 * @returns {Promise<string>} - O ID da pasta.
 */
async function findOrCreateAppFolder() {
    if (appFolderId) {
        console.log("[Drive Service] Usando ID da pasta em cache:", appFolderId);
        return appFolderId;
    }

    const markerFileName = '.meu-diario-oracao-folder-id';
    const searchMarkerQuery = `name='${markerFileName}' and 'appDataFolder' in parents`;

    let response;
    try {
        // Este é o ponto exato da falha. Vamos envolvê-lo em um try-catch detalhado.
        response = await gapi.client.drive.files.list({
            q: searchMarkerQuery,
            fields: 'files(id, appProperties)',
            spaces: 'appDataFolder'
        });

    } catch (err) {
        // LOG APRIMORADO: Este é o log que resolverá o mistério.
        console.error('%c[Drive Service] FALHA CRÍTICA ao tentar listar arquivos na appDataFolder (findOrCreateAppFolder).', 'color: red; font-weight: bold;');
        
        if (err.result && err.result.error && Array.isArray(err.result.error.errors)) {
            console.error('==================== DIAGNÓSTICO DO ERRO 403 ====================');
            console.error('Mensagem da API:', err.result.error.message);
            console.error('RAZÃO ESPECÍFICA (A PISTA PRINCIPAL):', err.result.error.errors[0].reason);
            console.error('Domínio do Erro:', err.result.error.errors[0].domain);
            console.error('INSTRUÇÃO: Use a "RAZÃO ESPECÍFICA" acima para seguir o guia de verificação no Google Cloud Console. Se for "accessNotConfigured", a API do Drive não está habilitada. Se for "forbidden", verifique a tela de consentimento.');
            console.error('================================================================');
        } else {
            console.error('Detalhes completos do erro (formato não padrão):', err);
        }
        // Re-lança o erro para que a sincronização falhe e a UI seja atualizada.
        throw err;
    }

    // Se o arquivo marcador for encontrado, lê o ID da pasta de suas propriedades
    if (response.result.files && response.result.files.length > 0) {
        const folderId = response.result.files[0].appProperties?.folderId;
        if (folderId) {
            console.log(`[Drive Service] Marcador encontrado. Usando ID da pasta existente: ${folderId}`);
            appFolderId = folderId;
            return appFolderId;
        }
    }
    
    // --- Se o marcador não for encontrado, cria a pasta e o marcador ---
    console.log("[Drive Service] Marcador não encontrado. Criando nova pasta e marcador.");
    
    // 1. Cria a pasta visível para o usuário
    const folderMetadata = {
        'name': FOLDER_NAME,
        'mimeType': 'application/vnd.google-apps.folder'
    };
    const createFolderResponse = await gapi.client.drive.files.create({
        resource: folderMetadata,
        fields: 'id'
    });
    const newFolderId = createFolderResponse.result.id;
    console.log(`[Drive Service] Pasta visível criada com ID: ${newFolderId}`);
    
    // 2. Cria o arquivo marcador na pasta de dados do aplicativo
    const markerMetadata = {
        name: markerFileName,
        parents: ['appDataFolder'], // Importante: define o pai como a pasta oculta
        appProperties: { // Salva o ID da pasta visível como uma propriedade do marcador
            folderId: newFolderId
        }
    };
    await gapi.client.drive.files.create({ resource: markerMetadata });
    console.log("[Drive Service] Arquivo marcador criado com sucesso na appDataFolder.");

    // Armazena em cache e retorna o ID da nova pasta
    appFolderId = newFolderId;
    return appFolderId;
}


/**
 * Formata o conteúdo de um alvo para um formato de texto legível.
 * @param {object} target - O objeto do alvo de oração.
 * @returns {string} - O conteúdo formatado.
 */
function formatTargetForDoc(target) {
    let content = `[Este documento é um backup gerado pela aplicação 'Meus Alvos de Oração']\n\n`;
    content += `TÍTULO: ${target.title}\n`;
    content += `==============================================\n\n`;
    content += `Categoria: ${target.category || 'Não definida'}\n`;
    content += `Data de Criação: ${target.date ? new Date(target.date).toLocaleDateString('pt-BR') : 'N/A'}\n`;
    if (target.hasDeadline && target.deadlineDate) {
        content += `Prazo: ${new Date(target.deadlineDate).toLocaleDateString('pt-BR')}\n`;
    }
    content += `\nDETALHES:\n${target.details || 'Sem detalhes fornecidos.'}\n\n`;
    
    if (target.observations && target.observations.length > 0) {
        content += `-----------------\n`;
        content += `HISTÓRICO DE OBSERVAÇÕES:\n\n`;
        // Ordena as observações da mais antiga para a mais recente
        const sortedObs = [...target.observations].sort((a, b) => new Date(a.date) - new Date(b.date));
        sortedObs.forEach(obs => {
            const obsDate = obs.date ? new Date(obs.date).toLocaleDateString('pt-BR') : 'Data desconhecida';
            content += `[${obsDate}] - ${obs.text}\n`;
        });
    }
    return content;
}

/**
 * (FUNÇÃO PRINCIPAL - COM LOGS) Cria ou atualiza o backup de um alvo no Google Drive.
 * @param {object} target - O objeto completo do alvo.
 * @param {string | null} googleDocId - O ID do documento do Drive se já existir, ou nulo.
 * @returns {Promise<{success: boolean, docId: string}>} - Retorna o status e o ID do documento.
 */
export async function backupTargetToDrive(target, googleDocId = null) {
    if (!gapiInitialized) {
        throw new Error("O serviço do Google Drive não foi inicializado.");
    }

    const fileContent = formatTargetForDoc(target);
    const fileName = `Alvo - ${target.title}`;
    let metadata, path, method;

    if (googleDocId) {
        // --- LÓGICA DE ATUALIZAÇÃO (UPDATE) ---
        metadata = { name: fileName };
        path = `/upload/drive/v3/files/${googleDocId}`;
        method = 'PATCH';
    } else {
        // --- LÓGICA DE CRIAÇÃO (CREATE) ---
        const parentFolderId = await findOrCreateAppFolder();
        metadata = {
            'name': fileName,
            'mimeType': 'application/vnd.google-apps.document', // Cria como um Google Doc
            'parents': [parentFolderId]
        };
        path = '/upload/drive/v3/files';
        method = 'POST';
    }

    const { boundary, body } = _buildMultipartBody(metadata, fileContent);

    // LOG 3: Inspecionar o que está sendo enviado para a API
    console.log(`%c[Drive Service] Preparando para ${method} o alvo: '${target.title}'`, 'color: blue; font-weight: bold;');
    console.log('[Drive Service] Metadados:', metadata);
    console.log('[Drive Service] Corpo da Requisição (Body):', body);

    try {
        const response = await gapi.client.request({
            path: path,
            method: method,
            params: { uploadType: 'multipart', fields: 'id' },
            headers: { 'Content-Type': `multipart/related; boundary="${boundary}"` },
            body: body
        });

        // LOG 4: Analisar a resposta de sucesso
        console.log(`%c[Drive Service] Resposta de SUCESSO da API para '${target.title}'.`, 'color: green; font-weight: bold;', response);
        const docId = response.result.id || googleDocId;
        return { success: true, docId: docId };

    } catch (err) {
        // LOG 4.1: Analisar a resposta de ERRO
        console.error(`%c[Drive Service] A API do Google retornou um ERRO para '${target.title}'.`, 'color: red; font-weight: bold;');
        console.error('Detalhes do erro da API:', err); // Este é o log mais importante!
        throw err; // Re-lança o erro para ser pego pelo script.js
    }
}
