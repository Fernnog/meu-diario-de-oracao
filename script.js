import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';
import { getFirestore, collection, doc, setDoc, getDoc, updateDoc, deleteDoc } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';

document.addEventListener('DOMContentLoaded', () => {
    // Seleção de elementos do DOM
    const formPlano = document.getElementById('form-plano');
    const listaPlanos = document.getElementById('lista-planos');
    const periodicidadeSelect = document.getElementById('periodicidade');
    const diasSemanaSelecao = document.getElementById('dias-semana-selecao');
    const definirPorDatasRadio = document.getElementById('definir-por-datas');
    const definirPorDiasRadio = document.getElementById('definir-por-dias');
    const periodoPorDatasDiv = document.getElementById('periodo-por-datas');
    const periodoPorDiasDiv = document.getElementById('periodo-por-dias');
    const novoPlanoBtn = document.getElementById('novo-plano');
    const inicioBtn = document.getElementById('inicio');
    const cadastroPlanoSection = document.getElementById('cadastro-plano');
    const planosLeituraSection = document.getElementById('planos-leitura');
    const paginadorPlanosDiv = document.getElementById('paginador-planos');
    const inicioCadastroBtn = document.getElementById('inicio-cadastro');
    // Elementos de autenticação (novos)
    const authFormDiv = document.getElementById('auth-form');
+   const showAuthButton = document.getElementById('show-auth-button');
+   const cancelAuthButton = document.getElementById('cancel-auth-button');
+   const loginEmailButton = document.getElementById('login-email-button');
+   const signupEmailButton = document.getElementById('signup-email-button');
+   const emailLoginInput = document.getElementById('email-login');
+   const passwordLoginInput = document.getElementById('password-login');
+   const logoutButton = document.getElementById('logout-button');
+   const syncFirebaseButton = document.getElementById('sync-firebase');

    // Seleção dos campos de data para gerenciar o atributo required
    const dataInicio = document.getElementById('data-inicio');
    const dataFim = document.getElementById('data-fim');
    const dataInicioDias = document.getElementById('data-inicio-dias');
    const numeroDias = document.getElementById('numero-dias');

    // Variável de controle para impedir o reset do formulário durante a edição
    let preventFormReset = false;

    // Configurações do Firebase
    const firebaseConfig = {
        apiKey: "AIzaSyCzLjQrE3KhneuwZZXIost5oghVjOTmZQE", // Substitua com a sua API Key real
        authDomain: "plano-leitura.firebaseapp.com", // Substitua com o seu Auth Domain real
        projectId: "plano-leitura", // Substitua com o seu Project ID real
        storageBucket: "plano-leitura.firebasestorage.app", // Substitua com o seu Storage Bucket real
        messagingSenderId: "589137978493", // Substitua com o seu Messaging Sender ID real
        appId: "1:589137978493:web:f7305bca602383fe14bd14" // Substitua com o seu App ID real
    };

    // Inicializar o Firebase
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);

    // Variáveis globais
    let user = null;
    let planos = [];
    let planoEditandoIndex = -1;

    // Função para inicializar a aplicação
    function initApp() {
        initAuth();
        carregarPlanosSalvos((planosCarregados) => {
            planos = planosCarregados || [];
            renderizarPlanos();
        });
    }

    // Função para inicializar a autenticação
    function initAuth() {
        onAuthStateChanged(auth, (currentUser) => {
            user = currentUser;
            console.log("Estado de Autenticação Mudou:", user);
            if (user) {
                // Usuário está logado
                authFormDiv.style.display = 'none'; // Esconde o formulário de autenticação
                showAuthButton.style.display = 'none'; // Esconde o botão "Login/Cadastro"
                cancelAuthButton.style.display = 'none'; // Esconde o botão "Cancelar"
                logoutButton.style.display = 'block'; // Mostra o botão "Sair"
                syncFirebaseButton.style.display = 'none'; // Ajusta a visibilidade do botão de sincronização
                carregarPlanosSalvos((planosCarregados) => {
                    planos = planosCarregados || [];
                    renderizarPlanos();
                });
            } else {
                // Usuário não está logado
                authFormDiv.style.display = 'none'; // Esconde o formulário de autenticação
                showAuthButton.style.display = 'block'; // Mostra o botão "Login/Cadastro"
                cancelAuthButton.style.display = 'none'; // Esconde o botão "Cancelar"
                logoutButton.style.display = 'none'; // Esconde o botão "Sair"
                syncFirebaseButton.style.display = 'none'; // Ajusta a visibilidade do botão de sincronização
            }
        });
    }

    // Função para fazer login com email e senha
    function loginWithEmailPassword() {
        const email = emailLoginInput.value;
        const password = passwordLoginInput.value;

        signInWithEmailAndPassword(auth, email, password)
            .then((userCredential) => {
                // Login bem-sucedido
                const user = userCredential.user;
                console.log('Login com email/senha bem-sucedido:', user);
                authFormDiv.style.display = 'none'; // Esconde o formulário de autenticação
                showAuthButton.style.display = 'none'; // Esconde o botão "Login/Cadastro"
                cancelAuthButton.style.display = 'none'; // Esconde o botão "Cancelar"
                logoutButton.style.display = 'block'; // Mostra o botão "Sair"
                syncFirebaseButton.style.display = 'none'; // Ajusta a visibilidade do botão de sincronização
                carregarPlanosSalvos((planosCarregados) => { // Recarrega os planos após o login
                    planos = planosCarregados || [];
                    renderizarPlanos();
                });
            })
            .catch((error) => {
                // Login falhou
                console.error('Erro ao fazer login com email/senha:', error);
                alert('Erro ao fazer login: ' + error.message); // Exibe uma mensagem de erro amigável
            });
    }

    // Função para cadastrar novo usuário com email e senha
    function signupWithEmailPassword() {
        const email = emailLoginInput.value;
        const password = passwordLoginInput.value;

        createUserWithEmailAndPassword(auth, email, password)
            .then((userCredential) => {
                // Cadastro bem-sucedido
                const user = userCredential.user;
                console.log('Cadastro com email/senha bem-sucedido:', user);
                alert('Cadastro realizado com sucesso! Faça login.'); // Informa o usuário para fazer login
                authFormDiv.style.display = 'none'; // Esconde o formulário de autenticação após o cadastro
                showAuthButton.style.display = 'block'; // Mostra o botão "Login/Cadastro" novamente
                cancelAuthButton.style.display = 'none'; // Esconde o botão "Cancelar"
                logoutButton.style.display = 'none'; // Esconde o botão "Sair"
                syncFirebaseButton.style.display = 'none'; // Ajusta a visibilidade do botão de sincronização
            })
            .catch((error) => {
                // Cadastro falhou
                console.error('Erro ao fazer cadastro com email/senha:', error);
                alert('Erro ao cadastrar: ' + error.message); // Exibe uma mensagem de erro amigável
            });
    }

    // Função para fazer logout
    function logout() {
        console.log("Função logout() iniciada");
        signOut(auth)
            .then(() => {
                console.log('Logout bem-sucedido');
                renderizarPlanos();
            })
            .catch((error) => {
                console.error('Erro ao fazer logout:', error);
                alert('Erro ao fazer logout. Tente novamente.');
            });
    }

    // Carrega planos do Firebase Firestore
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
                    console.log("Nenhum plano encontrado. Criando documento inicial.");
                    setDoc(docRef, { planos: [] });
                }
                console.log('Planos carregados do Firestore:', planosDoFirestore);
                if (callback) callback(planosDoFirestore);
                return planosDoFirestore;
            })
            .catch((error) => {
                console.error('Erro ao carregar planos do Firestore:', error);
                alert('Erro ao carregar planos. Consulte o console.');
                if (callback) callback([]);
                return [];
            });
    }

    // Salva planos no Firebase Firestore
    function salvarPlanos(planosParaSalvar, callback) {
        if (!user) {
            console.error('Usuário não logado, não é possível salvar.');
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
                console.log('Planos salvos no Firestore com sucesso!');
                if (callback) callback(true);
                return true;
            })
            .catch((error) => {
                console.error('Erro ao salvar planos no Firestore:', error);
                alert('Erro ao salvar planos. Consulte o console.');
                if (callback) callback(false);
                return false;
            });
    }

    // Função para atualizar os atributos required com base na opção selecionada
    function updateRequiredAttributes() {
        if (definirPorDatasRadio.checked) {
            // Opção "Datas de Início e Fim" selecionada
            dataInicio.required = true;
            dataFim.required = true;
            dataInicioDias.required = false;
            numeroDias.required = false;
        } else {
            // Opção "Data de Início e Número de Dias" selecionada
            dataInicio.required = false;
            dataFim.required = false;
            dataInicioDias.required = true;
            numeroDias.required = true;
        }
    }

    // Chamar a função inicialmente para definir o estado inicial
    updateRequiredAttributes();

    // Renderizar planos na interface
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
                    <h3><span class="plano-numero">${index + 1}. </span>${plano.titulo}</h3>
                    <div>
                        <button class="acoes-dados button" onclick="editarPlano(${index})">Editar</button>
                        <button class="acoes-dados button" onclick="excluirPlano(${index})">Excluir</button>
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

    // Verificar atraso no plano
+   function verificarAtraso(plano) {
+       const hoje = new Date();
+       hoje.setHours(0, 0, 0, 0);
+       return plano.diasPlano.reduce((count, dia) => {
+           const dataDia = new Date(dia.data);
+           dataDia.setHours(0, 0, 0, 0);
+           return count + (dataDia < hoje && !dia.lido ? 1 : 0);
+       }, 0);
+   }

    // Renderizar dias de leitura
    function renderizarDiasLeitura(diasPlano, planoIndex) {
        return diasPlano.map((dia, diaIndex) => {
            const alternadoClass = diaIndex % 2 === 0 ? 'alternado' : '';
            const lidoClass = dia.lido ? 'lido' : '';
            return `<div class="dia-leitura ${alternadoClass} ${lidoClass}">
                        <input type="checkbox" id="dia-${planoIndex}-${diaIndex}" ${dia.lido ? 'checked' : ''} onchange="marcarDiaLido(${planoIndex}, ${diaIndex}, this.checked)">
                        <span>${dia.data.toLocaleDateString('pt-BR')} - Páginas ${dia.paginaInicioDia} a ${dia.paginaFimDia}</span>
                    </div>`;
        }).join('');
    }

    // Marcar dia como lido
    window.marcarDiaLido = function(planoIndex, diaIndex, lido) {
        planos[planoIndex].diasPlano[diaIndex].lido = lido;
        atualizarPaginasLidas(planoIndex);
        salvarPlanos(planos, (salvoComSucesso) => {
            if (salvoComSucesso) {
                console.log('Progresso salvo no Firebase.');
            } else {
                console.error('Falha ao salvar progresso no Firebase.');
            }
            renderizarPlanos();
        });

        const diaLeituraElement = document.getElementById(`dia-${planoIndex}-${diaIndex}`).parentElement;
        if (lido) {
            diaLeituraElement.classList.add('lido');
        } else {
            diaLeituraElement.classList.remove('lido');
        }
    };

    // Atualizar páginas lidas
    function atualizarPaginasLidas(planoIndex) {
        planos[planoIndex].paginasLidas = planos[planoIndex].diasPlano.reduce((sum, dia) =>
            sum + (dia.lido ? dia.paginas : 0), 0);
    }

    // Editar um plano existente
    window.editarPlano = function(index) {
        planoEditandoIndex = index;
        preventFormReset = true; // Impede o reset do formulário ao abrir para edição
        novoPlanoBtn.click(); // Simula o clique no botão "Novo Plano" para exibir o formulário
        preventFormReset = false; // Restaura o comportamento normal do reset para novos planos
        const plano = planos[index];
        document.getElementById('titulo-livro').value = plano.titulo;
        document.getElementById('pagina-inicio').value = plano.paginaInicio;
        document.getElementById('pagina-fim').value = plano.paginaFim;
        if (plano.definicaoPeriodo === 'datas') {
            definirPorDatasRadio.checked = true;
            definirPorDiasRadio.checked = false;
            periodoPorDatasDiv.style.display = 'block';
            periodoPorDiasDiv.style.display = 'none';
            document.getElementById('data-inicio').valueAsDate = plano.dataInicio ? new Date(plano.dataInicio) : null;
            document.getElementById('data-fim').valueAsDate = plano.dataFim ? new Date(plano.dataFim) : null;
        } else {
            definirPorDatasRadio.checked = false;
            definirPorDiasRadio.checked = true;
            periodoPorDatasDiv.style.display = 'none';
            periodoPorDiasDiv.style.display = 'block';
            document.getElementById('data-inicio-dias').valueAsDate = plano.dataInicio ? new Date(plano.dataInicio) : null;
            document.getElementById('numero-dias').value = plano.diasPlano.length;
        }
        periodicidadeSelect.value = plano.periodicidade;
        diasSemanaSelecao.style.display = plano.periodicidade === 'semanal' ? 'block' : 'none';
        if (plano.periodicidade === 'semanal') {
            document.querySelectorAll('input[name="dia-semana"]').forEach(cb => {
                cb.checked = plano.diasSemana.includes(parseInt(cb.value));
            });
        }
        formPlano.querySelector('button[type="submit"]').textContent = 'Salvar Plano';
        updateRequiredAttributes();
    };

    // Mostrar opções de recálculo
    window.mostrarOpcoesRecalculo = function(index) {
        const plano = planos[index];
        const avisoAtrasoDiv = document.getElementById(`aviso-atraso-${index}`);
        avisoAtrasoDiv.innerHTML = `
            <p>⚠️ Plano com atraso. Escolha como recalcular:</p>
            <div class="acoes-dados">
                <button onclick="solicitarNovaDataFim(${index})">Definir Nova Data Limite</button>
                <button onclick="solicitarPaginasPorDia(${index})">Páginas por Dia</button>
            </div>
            <button onclick="fecharAvisoRecalculo(${index})">Cancelar</button>
        `;
    };

    // Fechar aviso de recálculo
    window.fecharAvisoRecalculo = function(index) {
        const plano = planos[index];
        const avisoAtrasoDiv = document.getElementById(`aviso-atraso-${index}`);
        const diasAtrasados = verificarAtraso(plano);
        avisoAtrasoDiv.innerHTML = `
            <p>⚠️ Plano com atraso de ${diasAtrasados} dia(s)!</p>
            <div class="acoes-dados">
                <button onclick="mostrarOpcoesRecalculo(${index})">Recalcular Plano</button>
            </div>
        `;
    };

    // Solicitar nova data de fim
    window.solicitarNovaDataFim = function(index) {
        const novaDataFimInput = prompt("Digite a nova data de fim (YYYY-MM-DD):");
        if (novaDataFimInput) {
            const novaDataFim = new Date(novaDataFimInput);
            if (isNaN(novaDataFim)) {
                alert("Data inválida. Use o formato YYYY-MM-DD.");
                return;
            }
            recalcularPlanoNovaData(index, novaDataFim);
        }
    };

    // Solicitar páginas por dia
    window.solicitarPaginasPorDia = function(index) {
        const paginasPorDiaInput = prompt("Digite o número de páginas por dia:");
        if (paginasPorDiaInput) {
            const paginasPorDia = parseInt(paginasPorDiaInput);
            if (isNaN(paginasPorDia) || paginasPorDia <= 0) {
                alert("Insira um número válido de páginas por dia (maior que zero).");
                return;
            }
            recalcularPlanoPaginasPorDia(index, paginasPorDia);
        }
    };

    // Calcular nova data de fim com base em páginas por dia
    function calcularNovaDataFimPorPaginasDia(plano, paginasPorDia) {
        const paginasRestantes = plano.totalPaginas - plano.paginasLidas;
        const diasNecessarios = Math.ceil(paginasRestantes / paginasPorDia);
        const novaDataFim = new Date();
        novaDataFim.setDate(novaDataFim.getDate() + diasNecessarios - 1);
        return novaDataFim;
    }

    // Recalcular plano com base em páginas por dia
    window.recalcularPlanoPaginasPorDia = function(index, paginasPorDia) {
        const plano = planos[index];
        if (paginasPorDia <= 0) {
            alert("Número de páginas por dia deve ser maior que zero.");
            mostrarOpcoesRecalculo(index); // Volta para as opções de recálculo
            return;
        }

        const novaDataFim = calcularNovaDataFimPorPaginasDia(plano, paginasPorDia);
        if (novaDataFim <= plano.dataInicio) {
            alert("A nova data de fim não pode ser antes da data de início.");
            mostrarOpcoesRecalculo(index); // Volta para as opções de recálculo
            return;
        }

        recalcularPlanoNovaData(index, novaDataFim);
    };

    // Excluir um plano
    window.excluirPlano = function(index) {
        if (confirm("Tem certeza que deseja excluir este plano?")) {
            planos.splice(index, 1);
            salvarPlanos(planos, (salvoComSucesso) => {
                if (salvoComSucesso) {
                    console.log('Plano excluído e salvo no Firebase.');
                }
                renderizarPlanos();
            });
        }
    };

    // Controlar visibilidade do paginador
    function togglePaginatorVisibility() {
        const paginador = document.getElementById('paginador-planos');
        if (!paginador) return;
        const planos = document.querySelectorAll('.plano-leitura');
        if (!planos || planos.length === 0) {
            if (paginador.classList.contains('hidden')) {
                paginador.classList.remove('hidden');
            }
            return;
        }
        const ultimoPlano = planos[planos.length - 1];
        if (!ultimoPlano) return;

        const rect = ultimoPlano.getBoundingClientRect();
        const paginadorHeight = paginador.offsetHeight;
        const windowHeight = window.innerHeight;

        if (rect.bottom <= windowHeight && rect.bottom > windowHeight - paginadorHeight) {
            if (!paginador.classList.contains('hidden')) {
                paginador.classList.add('hidden');
            }
        } else {
            if (paginador.classList.contains('hidden')) {
                paginador.classList.remove('hidden');
            }
        }
    }

    window.addEventListener('scroll', togglePaginatorVisibility);
    window.addEventListener('resize', togglePaginatorVisibility);

    const originalRenderizarPlanos = renderizarPlanos;
    renderizarPlanos = function() {
        originalRenderizarPlanos();
        togglePaginatorVisibility();
    };

    // Distribuir páginas pelo plano
    function distribuirPaginasPlano(plano) {
        const totalPaginas = plano.paginaFim - plano.paginaInicio + 1;
        const diasPlano = plano.diasPlano;

        if (diasPlano.length === 0) {
            alert("Não há dias de leitura válidos no período.");
            return null;
        }

        const paginasPorDia = Math.floor(totalPaginas / diasPlano.length);
        const resto = totalPaginas % diasPlano.length;
        let paginaAtual = plano.paginaInicio;

        diasPlano.forEach((dia, index) => {
            const paginasDia = index < resto ? paginasPorDia + 1 : paginasPorDia;
            dia.paginaInicioDia = paginaAtual;
            dia.paginaFimDia = paginaAtual + paginasDia - 1;
            dia.paginas = paginasDia;
            paginaAtual = dia.paginaFimDia + 1;
        });

        plano.paginasLidas = 0;
        plano.diasPlano.forEach(dia => {
            if (dia.lido) plano.paginasLidas += dia.paginas;
        });
    }

    // Recalcular plano com nova data
    function recalcularPlanoNovaData(index, novaDataFim) {
        const planoOriginal = planos[index];
        const diasLidosCount = planoOriginal.diasPlano.filter(dia => dia.lido).length;
        const primeiroDiaNaoLidoIndex = planoOriginal.diasPlano.findIndex(dia => !dia.lido);

        const novosDiasPlano = planoOriginal.diasPlano.slice(0, primeiroDiaNaoLidoIndex === -1 ? planoOriginal.diasPlano.length : primeiroDiaNaoLidoIndex);
        let dataAtual = novosDiasPlano.length > 0 ? new Date(novosDiasPlano[novosDiasPlano.length - 1].data) : new Date(); // Start from today if no days or from last day + 1
        if (novosDiasPlano.length > 0) {
            dataAtual.setDate(dataAtual.getDate() + 1);
        }

        while (dataAtual <= novaDataFim) {
            const diaSemana = dataAtual.getDay();
            if (planoOriginal.periodicidade === 'diario' || (planoOriginal.periodicidade === 'semanal' && planoOriginal.diasSemana.includes(diaSemana))) {
                novosDiasPlano.push({
                    data: new Date(dataAtual),
                    paginaInicioDia: 0,
                    paginaFimDia: 0,
                    paginas: 0,
                    lido: false
                });
            }
            dataAtual.setDate(dataAtual.getDate() + 1);
        }

        if (novosDiasPlano.length === 0) {
            alert("Não há dias válidos no novo período.");
            return;
        }

        const paginasRestantes = planoOriginal.totalPaginas - planoOriginal.paginasLidas;
        const paginasPorDia = Math.floor(paginasRestantes / (novosDiasPlano.length - diasLidosCount));
        const resto = paginasRestantes % (novosDiasPlano.length - diasLidosCount);
        let paginaInicioProximoDia = planoOriginal.paginaInicio + planoOriginal.paginasLidas; // Mantém o cálculo correto do início

        novosDiasPlano.forEach((dia, index) => {
            if (index >= diasLidosCount) {
                const paginasDia = index < diasLidosCount + resto ? paginasPorDia + 1 : paginasPorDia;
                dia.paginaInicioDia = paginaInicioProximoDia;
                dia.paginaFimDia = paginaInicioProximoDia + paginasDia - 1;
                dia.paginas = paginasDia;
                paginaInicioProximoDia = dia.paginaFimDia + 1;
            } else {
                dia.paginaInicioDia = planoOriginal.diasPlano[index].paginaInicioDia;
                dia.paginaFimDia = planoOriginal.diasPlano[index].paginaFimDia;
                dia.paginas = planoOriginal.diasPlano[index].paginas;
            }
        });

        planos[index].dataFim = novaDataFim;
        planos[index].diasPlano = novosDiasPlano;
        distribuirPaginasPlano(planos[index]);
        atualizarPaginasLidas(index);
        salvarPlanos(planos, (salvoComSucesso) => {
            renderizarPlanos();
        });
    }

    // Gerar dias do plano por datas
    function gerarDiasPlanoPorDatas(dataInicio, dataFim, periodicidade, diasSemana) {
        const dias = [];
        let dataAtual = new Date(dataInicio);
        while (dataAtual <= dataFim) {
            const diaSemana = dataAtual.getDay();
            if (periodicidade === 'diario' || (periodicidade === 'semanal' && diasSemana.includes(diaSemana))) {
                dias.push({
                    data: new Date(dataAtual),
                    paginaInicioDia: 0,
                    paginaFimDia: 0,
                    paginas: 0,
                    lido: false
                });
            }
            dataAtual.setDate(dataAtual.getDate() + 1);
        }
        return dias;
    }

    // Gerar dias do plano por número de dias
    function gerarDiasPlanoPorDias(dataInicio, numeroDias, periodicidade, diasSemana) {
        const dias = [];
        let dataAtual = new Date(dataInicio);
        let diasAdicionados = 0;

        while (diasAdicionados < numeroDias) {
            const diaSemana = dataAtual.getDay();
            if (periodicidade === 'diario' || (periodicidade === 'semanal' && diasSemana.includes(diaSemana))) {
                dias.push({
                    data: new Date(dataAtual),
                    paginaInicioDia: 0,
                    paginaFimDia: 0,
                    paginas: 0,
                    lido: false
                });
                diasAdicionados++;
            }
            dataAtual.setDate(dataAtual.getDate() + 1);
        }
        return dias;
    }

    // Calcular data de fim por dias
    function calcularDataFimPorDias(dataInicio, numeroDias) {
        const dataFim = new Date(dataInicio);
        dataFim.setDate(dataFim.getDate() + numeroDias - 1);
        return dataFim;
    }

    // Eventos de clique para autenticação (novos)
    showAuthButton.addEventListener('click', () => {
        authFormDiv.style.display = 'block'; // Mostra o formulário de autenticação
        showAuthButton.style.display = 'none'; // Esconde o botão "Login/Cadastro"
        cancelAuthButton.style.display = 'block'; // Mostra o botão "Cancelar"
        logoutButton.style.display = 'none'; // Esconde o botão "Sair"
    });

    cancelAuthButton.addEventListener('click', () => {
        authFormDiv.style.display = 'none'; // Esconde o formulário de autenticação
        showAuthButton.style.display = 'block'; // Mostra o botão "Login/Cadastro"
        cancelAuthButton.style.display = 'none'; // Esconde o botão "Cancelar"
        logoutButton.style.display = user ? 'block' : 'none'; // Restaura a visibilidade do botão "Sair" se o usuário estiver logado
    });

    loginEmailButton.addEventListener('click', loginWithEmailPassword); // Evento para login com email/senha
    signupEmailButton.addEventListener('click', signupWithEmailPassword); // Evento para cadastro com email/senha
    logoutButton.addEventListener('click', logout); // Evento para logout
    syncFirebaseButton.addEventListener('click', () => syncWithFirebase(renderizarPlanos)); // Evento para sincronizar com Firebase (se aplicável)

    novoPlanoBtn.addEventListener('click', function() {
        cadastroPlanoSection.style.removeProperty('display'); // Using removeProperty to reset to default 'block'
        cadastroPlanoSection.style.display = 'block';
        planosLeituraSection.style.removeProperty('display'); // Using removeProperty to reset to default 'block'
        planosLeituraSection.style.display = 'none';
        inicioBtn.style.display = 'block';
        novoPlanoBtn.style.display = 'none';
        inicioCadastroBtn.style.display = 'block';
        if (!preventFormReset) { // Adicionado o if para resetar o formulário apenas se não estiver em modo de edição
            formPlano.reset();
            planoEditandoIndex = -1;
        }
        updateRequiredAttributes();
    });

    inicioBtn.addEventListener('click', function() {
        cadastroPlanoSection.style.removeProperty('display'); // Using removeProperty to reset to default 'block'
        cadastroPlanoSection.style.display = 'none';
        planosLeituraSection.style.removeProperty('display'); // Using removeProperty to reset to default 'block'
        planosLeituraSection.style.display = 'block';
        inicioBtn.style.display = 'none';
        novoPlanoBtn.style.display = 'block';
        inicioCadastroBtn.style.display = 'none';
    });

    definirPorDatasRadio.addEventListener('change', function() {
        periodoPorDatasDiv.style.display = 'block';
        periodoPorDiasDiv.style.display = 'none';
        updateRequiredAttributes();
    });

    definirPorDiasRadio.addEventListener('change', function() {
        periodoPorDatasDiv.style.display = 'none';
        periodoPorDiasDiv.style.display = 'block';
        updateRequiredAttributes();
    });

    periodicidadeSelect.addEventListener('change', function() {
        diasSemanaSelecao.style.display = this.value === 'semanal' ? 'block' : 'none';
    });

    // Submissão do formulário de plano de leitura
    formPlano.addEventListener('submit', function(event) {
        event.preventDefault();

        if (!document.getElementById('titulo-livro').value ||
            !document.getElementById('pagina-inicio').value ||
            !document.getElementById('pagina-fim').value ||
            (definirPorDatasRadio.checked && (!document.getElementById('data-inicio').value || !document.getElementById('data-fim').value)) ||
            (definirPorDiasRadio.checked && (!document.getElementById('data-inicio-dias').value || !document.getElementById('numero-dias').value)) ||
            !document.getElementById('periodicidade').value ||
            (periodicidadeSelect.value === 'semanal' && document.querySelectorAll('input[name="dia-semana"]:checked').length === 0)
        ) {
            alert('Preencha todos os campos obrigatórios.');
            return;
        }

        const titulo = document.getElementById('titulo-livro').value;
        const paginaInicio = parseInt(document.getElementById('pagina-inicio').value);
        const paginaFim = parseInt(document.getElementById('pagina-fim').value);
        const definicaoPeriodo = document.querySelector('input[name="definicao-periodo"]:checked').value;
        const dataInicioDatas = document.getElementById('data-inicio').valueAsDate;
        const dataFimDatas = document.getElementById('data-fim').valueAsDate;
        const dataInicioDias = document.getElementById('data-inicio-dias').valueAsDate;
        const numeroDias = parseInt(document.getElementById('numero-dias').value);
        const periodicidade = document.getElementById('periodicidade').value;
        const diasSemana = [];
        document.querySelectorAll('input[name="dia-semana"]:checked').forEach(cb => {
            diasSemana.push(parseInt(cb.value));
        });

        let dataInicio, dataFim, diasPlano = [];
        if (definicaoPeriodo === 'datas') {
            dataInicio = dataInicioDatas;
            dataFim = dataFimDatas;
            diasPlano = gerarDiasPlanoPorDatas(dataInicio, dataFim, periodicidade, diasSemana);
        } else {
            dataInicio = dataInicioDias;
            dataFim = calcularDataFimPorDias(dataInicio, numeroDias);
            diasPlano = gerarDiasPlanoPorDias(dataInicio, numeroDias, periodicidade, diasSemana);
        }

        const novoPlano = {
            id: crypto.randomUUID(),
            titulo: titulo,
            paginaInicio: paginaInicio,
            paginaFim: paginaFim,
            totalPaginas: paginaFim - paginaInicio + 1,
            definicaoPeriodo: definicaoPeriodo,
            dataInicio: dataInicio,
            dataFim: dataFim,
            periodicidade: periodicidade,
            diasSemana: diasSemana,
            diasPlano: diasPlano,
            paginasLidas: 0
        };

        if (planoEditandoIndex !== -1) {
            planos[planoEditandoIndex] = novoPlano;
            planoEditandoIndex = -1;
            formPlano.querySelector('button[type="submit"]').textContent = 'Salvar Plano';
        } else {
            planos.push(novoPlano);
        }

        distribuirPaginasPlano(novoPlano);
        salvarPlanos(planos, (salvoComSucesso) => {
            if (salvoComSucesso) {
                console.log('Plano salvo no Firebase.');
            }
            renderizarPlanos();
        });

        inicioBtn.click();
    });

    // Inicializar a aplicação
    initApp();
});