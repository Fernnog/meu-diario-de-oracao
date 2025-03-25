import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';
import { getFirestore, collection, doc, setDoc, getDoc, updateDoc, deleteDoc } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';

document.addEventListener('DOMContentLoaded', () => {
    // Seleção de elementos do DOM (mantém como antes)
    const formPlano = document.getElementById('form-plano');
    const listaPlanos = document.getElementById('lista-planos');
    const periodicidadeSelect = document.getElementById('periodicidade');
    const diasSemanaSelecao = document.getElementById('dias-semana-selecao');
    const definirPorDatasRadio = document.getElementById('definir-por-datas');
    const definirPorDiasRadio = document.getElementById('definir-por-dias');
    const periodoPorDatasDiv = document.getElementById('periodo-por-datas');
    const periodoPorDiasDiv = document.getElementById('periodo-por-dias');
    const exportarPlanosBtn = document.getElementById('exportar-planos');
    const importarPlanosBtn = document.getElementById('importar-planos-botao');
    const importarPlanosInput = document.getElementById('importar-planos');
    const limparDadosBtn = document.getElementById('limpar-dados');
    const novoPlanoBtn = document.getElementById('novo-plano');
    const inicioBtn = document.getElementById('inicio');
    const cadastroPlanoSection = document.getElementById('cadastro-plano');
    const planosLeituraSection = document.getElementById('planos-leitura');
    const exportarAgendaBtn = document.getElementById('exportar-agenda');
    const paginadorPlanosDiv = document.getElementById('paginador-planos');
    const inicioCadastroBtn = document.getElementById('inicio-cadastro');
    const loginButton = document.getElementById('login-button');
    const logoutButton = document.getElementById('logout-button');
    const syncFirebaseButton = document.getElementById('sync-firebase');

    // Configurações do Firebase (substitua pelos valores do seu projeto - MANTENHA COMO ANTES)
    const firebaseConfig = {
        apiKey: "AIzaSyCzLjQrE3KhneuwZZXIost5oghVjOTmZQE", // Substitua com a sua API Key real
        authDomain: "plano-leitura.firebaseapp.com", // Substitua com o seu Auth Domain real
        projectId: "plano-leitura", // Substitua com o seu Project ID real
        storageBucket: "plano-leitura.firebasestorage.app", // Substitua com o seu Storage Bucket real
        messagingSenderId: "589137978493", // Substitua com o seu Messaging Sender ID real
        appId: "1:589137978493:web:f7305bca602383fe14bd14" // Substitua com o seu App ID real
    };

    // Inicializar o Firebase (mantém como antes)
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);

    // Variáveis globais (mantém como antes)
    let user = null;
    let planos = [];
    let planoEditandoIndex = -1;

    // Função para inicializar a autenticação e carregar dados (MODIFICADA para carregar planos do Firebase)
    function initApp() {
        initAuth();
        carregarPlanosSalvos((planosCarregados) => {
            planos = planosCarregados || [];
            renderizarPlanos();
        });
    }

    // Função para inicializar a autenticação (mantém como antes)
    function initAuth() {
        onAuthStateChanged(auth, (currentUser) => {
            user = currentUser;
            if (user) {
                // Usuário está logado
                loginButton.style.display = 'none';
                logoutButton.style.display = 'block';
                syncFirebaseButton.style.display = 'none'; // Esconde o botão de sincronizar, já que agora é automático
            } else {
                // Usuário não está logado
                loginButton.style.display = 'block';
                logoutButton.style.display = 'none';
                syncFirebaseButton.style.display = 'none';
                planos = []; // Garante que a lista de planos esteja vazia para usuários deslogados
                renderizarPlanos();
            }
        });
    }

    // Função para fazer login com Google (mantém como antes)
    function login() {
        const provider = new GoogleAuthProvider();
        signInWithPopup(auth, provider)
            .then((result) => {
                console.log('Usuário logado:', result.user);
                carregarPlanosSalvos((planosCarregados) => {
                    planos = planosCarregados || [];
                    renderizarPlanos();
                });
            })
            .catch((error) => {
                console.error('Erro ao fazer login:', error);
                alert('Erro ao fazer login. Tente novamente.');
            });
    }

    // Função para fazer logout (MODIFICADA para limpar planos locais na memória)
    function logout() {
        signOut(auth)
            .then(() => {
                console.log('Usuário deslogado');
                planos = []; // Limpa os planos locais na memória
                renderizarPlanos();
            })
            .catch((error) => {
                console.error('Erro ao fazer logout:', error);
                alert('Erro ao fazer logout. Tente novamente.');
            });
    }

    // Carrega planos do Firebase Firestore (MODIFICADA para buscar do Firestore e converter datas)
    function carregarPlanosSalvos(callback) {
        if (!user) {
            console.log('Usuário não logado, retornando planos vazios.');
            if (callback) callback([]);
            return [];
        }

        const userId = user.uid;
        const docRef = doc(db, 'users', userId);

        getDoc(docRef)
            .then((docSnap) => {
                let planosDoFirestore = [];
                if (docSnap.exists()) {
                    planosDoFirestore = docSnap.data().planos || [];
                    planosDoFirestore = planosDoFirestore.map(plano => {
                        return {
                            ...plano,
                            dataInicio: plano.dataInicio ? new Date(plano.dataInicio) : null,
                            dataFim: plano.dataFim ? new Date(plano.dataFim) : null,
                            diasPlano: plano.diasPlano ? plano.diasPlano.map(dia => ({
                                ...dia,
                                data: dia.data ? new Date(dia.data) : null
                            })) : []
                        };
                    });
                } else {
                    console.log("Nenhum plano encontrado no Firestore para este usuário. Criando documento inicial.");
                    setDoc(docRef, { planos: [] });
                }
                console.log('Planos carregados do Firestore:', planosDoFirestore);
                if (callback) callback(planosDoFirestore);
                return planosDoFirestore;
            })
            .catch((error) => {
                console.error('Erro ao carregar planos do Firestore:', error);
                alert('Erro ao carregar planos do Firebase. Consulte o console para detalhes.');
                if (callback) callback([]);
                return [];
            });
    }

    // Salva planos no Firebase Firestore (MODIFICADA para salvar no Firestore e converter datas para string)
    function salvarPlanos(planosParaSalvar, callback) {
        if (!user) {
            console.error('Usuário não logado, não é possível salvar no Firebase.');
            alert('Você precisa estar logado para salvar os planos.');
            if (callback) callback(false);
            return false;
        }

        const userId = user.uid;
        const docRef = doc(db, 'users', userId);

        const planosParaFirestore = planosParaSalvar.map(plano => {
            return {
                ...plano,
                dataInicio: plano.dataInicio ? plano.dataInicio.toISOString() : null,
                dataFim: plano.dataFim ? plano.dataFim.toISOString() : null,
                diasPlano: plano.diasPlano ? plano.diasPlano.map(dia => ({
                    ...dia,
                    data: dia.data ? dia.data.toISOString() : null
                })) : []
            };
        });

        setDoc(docRef, { planos: planosParaFirestore })
            .then(() => {
                console.log('Planos salvos no Firebase Firestore com sucesso!');
                if (callback) callback(true);
                return true;
            })
            .catch((error) => {
                console.error('Erro ao salvar planos no Firestore:', error);
                alert('Erro ao salvar planos no Firebase. Consulte o console para detalhes.');
                if (callback) callback(false);
                return false;
            });
    }

    // Renderizar planos (mantém como antes)
    function renderizarPlanos() {
        paginadorPlanosDiv.innerHTML = '';
        listaPlanos.innerHTML = planos.length === 0 ? '<p>Nenhum plano de leitura cadastrado ainda.</p>' : '';

        const paginador = document.getElementById('paginador-planos');
        if (paginador.classList.contains('hidden')) {
            paginador.classList.remove('hidden');
        }

        if (planos.length > 0) {
            const paginador = document.createElement('div');
            paginador.className = 'paginador';
            planos.forEach((plano, index) => {
                const linkPaginador = document.createElement('a');
                linkPaginador.href = `#plano-${index}`;
                linkPaginador.textContent = index + 1;
                paginadorPlanosDiv.appendChild(linkPaginador);
            });
        }

        planos.forEach((plano, index) => {
            const progressoPercentual = (plano.paginasLidas / plano.totalPaginas) * 100;
            const diasAtrasados = verificarAtraso(plano);
            const avisoAtrasoHTML = diasAtrasados > 0 ? `
                <div class="aviso-atraso" id="aviso-atraso-${index}">
                    <p>⚠️ Plano com atraso de ${diasAtrasados} dia(s)!</p>
                    <div class="acoes-dados">
                        <button onclick="mostrarOpcoesRecalculo(${index})">Recalcular Plano</button>
                    </div>
                 </div>` : '';

            const planoDiv = document.createElement('div');
            planoDiv.classList.add('plano-leitura');
            planoDiv.id = `plano-${index}`;
            planoDiv.innerHTML = `
                <div class="plano-header">
                    <h3><span class="plano-numero"> ${index + 1}. </span>${plano.titulo}</h3>
                    <div>
                        <button onclick="editarPlano(${index})">Editar</button>
                        <button onclick="excluirPlano(${index})">Excluir</button>
                    </div>
                </div>
                ${avisoAtrasoHTML}
                <div class="progresso-container">
                    <div class="barra-progresso" style="width: ${progressoPercentual}%"></div>
                </div>
                <p>${plano.paginasLidas} de ${plano.totalPaginas} páginas lidas (${progressoPercentual.toFixed(0)}%)</p>
                <div class="dias-leitura">${renderizarDiasLeitura(plano.diasPlano, index)}</div>
            `;
            listaPlanos.appendChild(planoDiv);
        });
        togglePaginatorVisibility();
    }

    // Verificar Atraso e Renderizar Dias Leitura (mantém como antes)
    function verificarAtraso(plano) { /* ... mesmo código ... */ }
    function renderizarDiasLeitura(diasPlano, planoIndex) { /* ... mesmo código ... */ }

    // Marcar dia lido (MODIFICADA para usar salvarPlanos com callback)
    window.marcarDiaLido = function(planoIndex, diaIndex, lido) {
        planos[planoIndex].diasPlano[diaIndex].lido = lido;
        atualizarPaginasLidas(planoIndex);
        salvarPlanos(planos, (salvoComSucesso) => { // Usa salvarPlanos com callback
            if (salvoComSucesso) {
                console.log('Progresso de leitura salvo no Firebase.');
            } else {
                console.error('Falha ao salvar progresso de leitura no Firebase.');
            }
            renderizarPlanos(); // Renderiza APÓS o callback do salvamento (independente do sucesso/falha, para refletir o estado local)
        });

        const diaLeituraElement = document.getElementById(`dia-${planoIndex}-${diaIndex}`).parentElement;
        if (lido) {
            diaLeituraElement.classList.add('lido');
        } else {
            diaLeituraElement.classList.remove('lido');
        }
    };

    // Atualizar Paginas Lidas, Editar Plano, Mostrar/Fechar Recalculo, Solicitar Nova Data/Paginas (mantém como antes)
    function atualizarPaginasLidas(planoIndex) { /* ... mesmo código ... */ }
    window.editarPlano = function(index) { /* ... mesmo código ... */ };
    window.mostrarOpcoesRecalculo = function(index) { /* ... mesmo código ... */ };
    window.fecharAvisoRecalculo = function(index) { /* ... mesmo código ... */ };
    window.solicitarNovaDataFim = function(index) { /* ... mesmo código ... */ };
    window.solicitarPaginasPorDia = function(index) { /* ... mesmo código ... */ };
    function calcularNovaDataFimPorPaginasDia(plano, paginasPorDia) { /* ... mesmo código ... */ }

    // Recalcular Plano (MODIFICADAS para usar salvarPlanos com callback)
    window.recalcularPlanoPeriodoOriginal = function(index) {
        recalcularPlanoPeriodoOriginalFunction(index); // Chama a função auxiliar para lógica de recalculo
    };

    const recalcularPlanoPeriodoOriginalFunction = function(index) { // Função auxiliar para conter a lógica de recalculo
        const plano = planos[index];
        // ... (lógica de recalculo do planoPeriodoOriginal - MESMO CÓDIGO DE ANTES) ...
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const firstNotLidoIndex = plano.diasPlano.findIndex(dia => !dia.lido);
        if (firstNotLidoIndex === -1) { alert("Plano já concluído."); return; }
        let paginasLidasAteAgora = plano.diasPlano.slice(0, firstNotLidoIndex).reduce((sum, dia) => sum + (dia.lido ? dia.paginas : 0), 0);
        const paginasRestantes = plano.totalPaginas - paginasLidasAteAgora;
        const diasRestantes = plano.diasPlano.slice(firstNotLidoIndex);
        if (diasRestantes.length === 0) { alert("Não há dias restantes no plano para recalcular."); return; }
        const paginasPorDia = Math.floor(paginasRestantes / diasRestantes.length);
        const resto = paginasRestantes % diasRestantes.length;
        let paginaAtual;
        if (firstNotLidoIndex === 0) { paginaAtual = plano.paginaInicio; } else { paginaAtual = plano.diasPlano[firstNotLidoIndex - 1].paginaFimDia + 1; }
        diasRestantes.forEach((dia, i) => {
            const paginasDia = i < resto ? paginasPorDia + 1 : paginasPorDia;
            dia.paginaInicioDia = paginaAtual; dia.paginaFimDia = paginaAtual + paginasDia - 1; dia.paginas = paginasDia; paginaAtual = dia.paginaFimDia + 1;
        });
        atualizarPaginasLidas(index);
        salvarPlanos(planos, (salvoComSucesso) => { // Usa salvarPlanos com callback
            if (salvoComSucesso) {
                console.log('Plano recalculado e salvo no Firebase.');
            } else {
                console.error('Falha ao salvar plano recalculado no Firebase.');
            }
            renderizarPlanos(); // Renderiza APÓS o callback
        });
    };

    window.recalcularPlanoPaginasPorDia = function(index, paginasPorDia) {
        recalcularPlanoPaginasPorDiaFunction(index, paginasPorDia); // Chama função auxiliar
    };

    const recalcularPlanoPaginasPorDiaFunction = function(index, paginasPorDia) { // Função auxiliar para lógica de recalculo
        const plano = planos[index];
        if (paginasPorDia <= 0) { alert("Número de páginas por dia deve ser maior que zero."); return; }
        const novaDataFim = calcularNovaDataFimPorPaginasDia(plano, paginasPorDia);
        if (novaDataFim <= plano.dataInicio) { alert("Com essa quantidade de páginas por dia, a nova data de fim não pode ser antes da data de início."); return; }
        const diasParaAdicionar = Math.ceil((novaDataFim - plano.dataFim) / (1000 * 60 * 60 * 24));
        if (diasParaAdicionar <= 0) { alert("A nova data de fim não estende o plano atual."); return; }
        recalcularPlanoNovaData(index, novaDataFim);
    };

    // Excluir Plano (MODIFICADA para usar salvarPlanos com callback)
    window.excluirPlano = function(index) {
        if (confirm("Tem certeza que deseja excluir este plano?")) {
            planos.splice(index, 1);
            salvarPlanos(planos, (salvoComSucesso) => { // Usa salvarPlanos com callback
                if (salvoComSucesso) {
                    console.log('Plano excluído e alteração salva no Firebase.');
                } else {
                    console.error('Falha ao salvar exclusão do plano no Firebase.');
                }
                renderizarPlanos(); // Renderiza APÓS o callback
            });
        }
    };

    // Salvar e Carregar Planos Localmente (REMOVIDAS - NÃO USAMOS MAIS localStorage)
    // function salvarPlanosLocal(planos) { /* ... REMOVIDA ... */ }
    // function carregarPlanosSalvosLocal() { /* ... REMOVIDA ... */ }

    // Submissão do formulário (MODIFICADA para usar salvarPlanos com callback)
    formPlano.addEventListener('submit', function(event) {
        event.preventDefault();

        const titulo = document.getElementById('titulo-livro').value;
        const paginaInicio = parseInt(document.getElementById('pagina-inicio').value);
        const paginaFim = parseInt(document.getElementById('pagina-fim').value);
        let dataInicio, dataFim;

        if (paginaFim < paginaInicio) { alert("A página de fim deve ser maior ou igual à página de início."); return; }

        if (definirPorDatasRadio.checked) {
            dataInicio = new Date(document.getElementById('data-inicio').value);
            dataFim = new Date(document.getElementById('data-fim').value);
            if (dataFim <= dataInicio) { alert("A data de fim deve ser posterior à data de início."); return; }
        } else {
            dataInicio = new Date(document.getElementById('data-inicio-dias').value);
            const numeroDias = parseInt(document.getElementById('numero-dias').value);
            if (isNaN(numeroDias) || numeroDias < 1) { alert("Número de dias inválido."); return; }
            dataFim = new Date(dataInicio);
            dataFim.setDate(dataInicio.getDate() + numeroDias - 1);
        }

        const periodicidade = periodicidadeSelect.value;
        const diasSemana = periodicidade === 'semanal' ? Array.from(document.querySelectorAll('input[name="dia-semana"]:checked')).map(cb => parseInt(cb.value)) : [];
        if (periodicidade === 'semanal' && diasSemana.length === 0) { alert("Selecione pelo menos um dia da semana."); return; }

        const plano = criarPlanoLeitura(titulo, paginaInicio, paginaFim, dataInicio, dataFim, periodicidade, diasSemana);
        if (plano) {
            if (planoEditandoIndex > -1) {
                planos[planoEditandoIndex] = plano;
                planoEditandoIndex = -1;
                formPlano.querySelector('button[type="submit"]').textContent = 'Salvar Plano';
            } else {
                planos.push(plano);
            }
            salvarPlanos(planos, (salvoComSucesso) => { // Usa salvarPlanos com callback
                if (salvoComSucesso) {
                    console.log('Novo plano salvo no Firebase e renderizado.');
                    formPlano.reset();
                    periodoPorDatasDiv.style.display = 'block';
                    periodoPorDiasDiv.style.display = 'none';
                    definirPorDatasRadio.checked = true;
                    definirPorDiasRadio.checked = false;
                    diasSemanaSelecao.style.display = 'none';
                    inicioBtn.click();
                } else {
                    console.error('Falha ao salvar novo plano no Firebase.');
                    alert('Falha ao salvar plano. Tente novamente.'); // Feedback de erro para o usuário
                }
            });
        }
    });

    // Criar Plano de Leitura (mantém como antes)
    function criarPlanoLeitura(titulo, paginaInicio, paginaFim, dataInicio, dataFim, periodicidade, diasSemana) { /* ... mesmo código ... */ }

    // Exportar/Importar JSON e Limpar Dados (funcionalidades MANTIDAS - exportar/importar JSON e limpar dados LOCALMENTE)
    exportarPlanosBtn.addEventListener('click', function() { /* ... mesmo código exportar JSON ... */ });
    importarPlanosBtn.addEventListener('click', () => importarPlanosInput.click());
    importarPlanosInput.addEventListener('change', function(event) { /* ... mesmo código importar JSON ... */ });
    limparDadosBtn.addEventListener('click', function() {
        if (confirm("Tem certeza que deseja limpar todos os dados LOCALMENTE (JSON)? Isso NÃO afetará os dados no Firebase se você estiver logado.")) {
            planos = []; // Limpa os planos na memória (apenas para a sessão atual)
            renderizarPlanos(); // Renderiza a lista vazia
            alert('Dados locais (JSON) limpos. Os dados no Firebase (se logado) não foram afetados.');
        }
    });

    // Exportar para Agenda (ICS) (mantém como antes)
    exportarAgendaBtn.addEventListener('click', () => { /* ... mesmo código exportar agenda ... */ });
    function exportarParaAgenda(plano) { /* ... mesmo código exportarParaAgenda ... */ }
    function gerarICS(plano, horarioInicio, horarioFim) { /* ... mesmo código gerarICS ... */ }
    function downloadICSFile(icsContent, planoTitulo) { /* ... mesmo código downloadICSFile ... */ }

    // Paginator Visibility (mantém como antes)
    function togglePaginatorVisibility() { /* ... mesmo código togglePaginatorVisibility ... */ }
    window.addEventListener('scroll', togglePaginatorVisibility);
    window.addEventListener('resize', togglePaginatorVisibility);
    const originalRenderizarPlanos = renderizarPlanos;
    renderizarPlanos = function() { originalRenderizarPlanos(); togglePaginatorVisibility(); };

    // Distribuir Páginas e Recalcular Plano Nova Data (mantém como antes)
    function distribuirPaginasPlano(plano) { /* ... mesmo código distribuirPaginasPlano ... */ }
    function recalcularPlanoNovaData(index, novaDataFim) { /* ... mesmo código recalcularPlanoNovaData ... */ }

    // Inicializar a aplicação (mantém como antes)
    initApp();

    // Eventos de clique para login e logout (mantém como antes)
    loginButton.addEventListener('click', login);
    logoutButton.addEventListener('click', logout);
    syncFirebaseButton.addEventListener('click', () => syncWithFirebase(renderizarPlanos)); // Botão de sincronizar agora é obsoleto, mas mantido no HTML
});
