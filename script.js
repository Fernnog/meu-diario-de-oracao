import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-analytics.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDocs, updateDoc, deleteDoc, query, where, orderBy, getDoc, increment } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

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


    // Configurações do Firebase (substitua pelos valores do seu projeto)
    const firebaseConfig = {
        apiKey: "AIzaSyCzLjQrE3KhneuwZZXIost5oghVjOTmZQE",
        authDomain: "plano-leitura.firebaseapp.com",
        projectId: "plano-leitura",
        storageBucket: "plano-leitura.firebasestorage.app",
        messagingSenderId: "589137978493",
        appId: "1:589137978493:web:f7305bca602383fe14bd14"
    };

    // Inicializar o Firebase
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);

    // Variáveis globais
    let user = null;
    let planos = []; // Inicializa planos como um array vazio aqui
    let planoEditandoIndex = -1;

    // Função para inicializar a autenticação e carregar dados
    function initApp() {
        initAuth();
    }

    // Função para inicializar a autenticação
    function initAuth() {
        onAuthStateChanged(auth, (currentUser) => {
            user = currentUser;
            if (user) {
                // Usuário está logado
                loginButton.style.display = 'none';
                logoutButton.style.display = 'block';
                syncFirebaseButton.style.display = 'block';
                // Sincronizar automaticamente ao logar e depois renderizar os planos
                syncWithFirebase(() => {
                    renderizarPlanos();
                });
            } else {
                // Usuário não está logado
                loginButton.style.display = 'block';
                logoutButton.style.display = 'none';
                syncFirebaseButton.style.display = 'none';
                // Carregar planos locais se não estiver logado
                planos = carregarPlanosSalvos() || [];
                renderizarPlanos();
            }
        });
    }

    // Função para fazer login com Google
    function login() {
        const provider = new GoogleAuthProvider();
        signInWithPopup(auth, provider)
            .then((result) => {
                console.log('Usuário logado:', result.user);
            })
            .catch((error) => {
                console.error('Erro ao fazer login:', error);
                alert('Erro ao fazer login. Tente novamente.');
            });
    }

    // Função para fazer logout
    function logout() {
        signOut(auth)
            .then(() => {
                console.log('Usuário deslogado');
                // Limpar planos locais ao deslogar para evitar confusão
                planos = [];
                localStorage.removeItem('planosLeitura');
                renderizarPlanos(); // Renderiza a tela inicial novamente
            })
            .catch((error) => {
                console.error('Erro ao fazer logout:', error);
                alert('Erro ao fazer logout. Tente novamente.');
            });
    }

    // Função para sincronizar com o Firebase
    function syncWithFirebase(callback) {
        if (!user) {
            alert('Você precisa estar logado para sincronizar com o Firebase.');
            return;
        }

        const userId = user.uid;
        const docRef = doc(db, 'users', userId);

        // Obter os dados locais
        const localData = carregarPlanosSalvos() || [];

        // Obter os dados do Firestore
        getDoc(docRef)
            .then((docSnap) => {
                if (docSnap.exists()) {
                    const cloudData = docSnap.data().planos || []; // Pega o array de planos do documento
                    // Fundir ou substituir dados conforme necessário. Aqui, vamos substituir completamente os locais pelos da nuvem.
                    planos = cloudData;
                    salvarPlanosLocal(planos); // Atualiza localStorage com dados da nuvem
                    if (callback) callback();
                    alert('Planos sincronizados com sucesso do Firebase.');
                } else {
                    // Se não existe documento no Firestore, cria com os dados locais atuais
                    uploadPlanosParaFirebase(callback);
                }
            })
            .catch((error) => {
                console.error('Erro ao obter dados do Firestore:', error);
                alert('Erro ao sincronizar com o Firebase. Tente novamente.');
            });
    }

    function uploadPlanosParaFirebase(callback) {
        if (!user) {
            alert('Você precisa estar logado para sincronizar com o Firebase.');
            return;
        }

        const userId = user.uid;
        const docRef = doc(db, 'users', userId);
        const localPlanos = carregarPlanosSalvos() || [];

        setDoc(docRef, { planos: localPlanos }) // Salva um objeto com a chave 'planos' e o array de planos
            .then(() => {
                console.log('Planos sincronizados com o Firebase com sucesso!');
                if (callback) callback();
                alert('Planos sincronizados e salvos no Firebase.');
            })
            .catch((error) => {
                console.error('Erro ao salvar dados no Firestore:', error);
                alert('Erro ao sincronizar com o Firebase. Tente novamente.');
            });
    }


    // Renderizar planos ao carregar a página e/ou após sincronização
    function renderizarPlanos() {
        // Limpa o paginador e a lista de planos
        paginadorPlanosDiv.innerHTML = '';
        listaPlanos.innerHTML = planos.length === 0 ? '<p>Nenhum plano de leitura cadastrado ainda.</p>' : '';

        // Reset paginator visibility before rendering new plans - Garante que o paginador comece visível
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
            // Recalcula o progresso e atraso para cada plano
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
            planoDiv.id = `plano-${index}`; // Adiciona ID para o paginador
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

        togglePaginatorVisibility(); // Call to set initial paginator visibility - Garante que a visibilidade seja verificada após renderizar
    }

    // Verifica atrasos no plano
    function verificarAtraso(plano) {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        return plano.diasPlano.reduce((count, dia) => {
            const dataDia = new Date(dia.data);
            dataDia.setHours(0, 0, 0, 0);
            return count + (dataDia < hoje && !dia.lido ? 1 : 0);
        }, 0);
    }

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

    // Marca um dia como lido
    window.marcarDiaLido = function(planoIndex, diaIndex, lido) {
        planos[planoIndex].diasPlano[diaIndex].lido = lido;
        atualizarPaginasLidas(planoIndex);
        salvarPlanos(planos);
        if (user) { // Sincroniza com Firebase após marcar como lido
            uploadPlanosParaFirebase();
        }

        // Adiciona/remove a classe 'lido' ao elemento pai (div.dia-leitura)
        const diaLeituraElement = document.getElementById(`dia-${planoIndex}-${diaIndex}`).parentElement;
        if (lido) {
            diaLeituraElement.classList.add('lido');
        } else {
            diaLeituraElement.classList.remove('lido');
        }

        renderizarPlanos(); // Renderiza após atualizar as classes
    };

    // Atualiza o total de páginas lidas
    function atualizarPaginasLidas(planoIndex) {
        planos[planoIndex].paginasLidas = planos[planoIndex].diasPlano.reduce((sum, dia) =>
            sum + (dia.lido ? dia.paginas : 0), 0);
    }

    // Edita um plano existente
    window.editarPlano = function(index) {
        planoEditandoIndex = index;
        const plano = planos[index];
        document.getElementById('titulo-livro').value = plano.titulo;
        document.getElementById('pagina-inicio').value = plano.paginaInicio;
        document.getElementById('pagina-fim').value = plano.paginaFim;
        if (plano.definicaoPeriodo === 'datas') {
            definirPorDatasRadio.checked = true;
            definirPorDiasRadio.checked = false;
            periodoPorDatasDiv.style.display = 'block';
            periodoPorDiasDiv.style.display = 'none';
            document.getElementById('data-inicio').valueAsDate = new Date(plano.dataInicio);
            document.getElementById('data-fim').valueAsDate = new Date(plano.dataFim);
        } else {
            definirPorDatasRadio.checked = false;
            definirPorDiasRadio.checked = true;
            periodoPorDatasDiv.style.display = 'none';
            periodoPorDiasDiv.style.display = 'block';
            document.getElementById('data-inicio-dias').valueAsDate = new Date(plano.dataInicio);
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
        novoPlanoBtn.click(); // Simula clique no botão "Novo" para ir para a tela de cadastro
    };

    window.mostrarOpcoesRecalculo = function(index) {
        const plano = planos[index];
        const avisoAtrasoDiv = document.getElementById(`aviso-atraso-${index}`);
        avisoAtrasoDiv.innerHTML = `
            <p>⚠️ Plano com atraso. Escolha como recalcular:</p>
            <div class="acoes-dados">
                <button onclick="recalcularPlanoPeriodoOriginal(${index})">Redistribuir no Período Original</button>
            </div>
            <div class="acoes-dados">
                <button onclick="solicitarNovaDataFim(${index})">Definir Nova Data Limite</button>
                <button onclick="solicitarPaginasPorDia(${index})">Páginas por Dia</button>
            </div>
            <button onclick="fecharAvisoRecalculo(${index})">Cancelar</button>
        `;
    };

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

    window.solicitarNovaDataFim = function(index) {
        const novaDataFimInput = prompt("Digite a nova data de fim para o plano (formato YYYY-MM-DD):");
        if (novaDataFimInput) {
            const novaDataFim = new Date(novaDataFimInput);
            if (isNaN(novaDataFim)) {
                alert("Data inválida. Use o formato YYYY-MM-DD.");
                return;
            }
            recalcularPlanoNovaData(index, novaDataFim);
        }
    };

    window.solicitarPaginasPorDia = function(index) {
        const paginasPorDiaInput = prompt("Digite o número de páginas que você pretende ler por dia:");
        if (paginasPorDiaInput) {
            const paginasPorDia = parseInt(paginasPorDiaInput);
            if (isNaN(paginasPorDia) || paginasPorDia <= 0) {
                alert("Por favor, insira um número válido de páginas por dia (maior que zero).");
                return;
            }
            recalcularPlanoPaginasPorDia(index, paginasPorDia);
        }
    };

    function calcularNovaDataFimPorPaginasDia(plano, paginasPorDia) {
        const paginasRestantes = plano.totalPaginas - plano.paginasLidas;
        const diasNecessarios = Math.ceil(paginasRestantes / paginasPorDia);
        const novaDataFim = new Date(); // Começa a partir de hoje
        novaDataFim.setDate(novaDataFim.getDate() + diasNecessarios -1); // Subtrai 1 porque conta o dia de hoje
        return novaDataFim;
    }

    // Recalcula um plano atrasado
    window.recalcularPlanoPeriodoOriginal = function(index) {
        const plano = planos[index];

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);


        // Encontra o índice do primeiro dia não lido para começar o recalculo a partir dali
        const firstNotLidoIndex = plano.diasPlano.findIndex(dia => !dia.lido);
        if (firstNotLidoIndex === -1) {
            alert("Plano já concluído.");
            return;
        }

        let paginasLidasAteAgora = plano.diasPlano.slice(0, firstNotLidoIndex).reduce((sum, dia) =>
        sum + (dia.lido ? dia.paginas : 0), 0);
        const paginasRestantes = plano.totalPaginas - paginasLidasAteAgora;

        const diasRestantes = plano.diasPlano.slice(firstNotLidoIndex);

        if (diasRestantes.length === 0) {
            alert("Não há dias restantes no plano para recalcular.");
            return; // Aborta o recalculo se não houver dias restantes
        }

        const paginasPorDia = Math.floor(paginasRestantes / diasRestantes.length);
        const resto = paginasRestantes % diasRestantes.length;

        let paginaAtual;
        if (firstNotLidoIndex === 0) {
            paginaAtual = plano.paginaInicio;
        } else {
            paginaAtual = plano.diasPlano[firstNotLidoIndex - 1].paginaFimDia + 1;
        }


        diasRestantes.forEach((dia, i) => {
            const paginasDia = i < resto ? paginasPorDia + 1 : paginasPorDia;
            dia.paginaInicioDia = paginaAtual;
            dia.paginaFimDia = paginaAtual + paginasDia - 1;
            dia.paginas = paginasDia;
            paginaAtual = dia.paginaFimDia + 1;
        });

        atualizarPaginasLidas(index);

        salvarPlanos(planos);
        if (user) { // Sincroniza com Firebase após recalcular
            uploadPlanosParaFirebase();
        }
        renderizarPlanos();
    };

    // Recalcula o plano com base em páginas por dia
    window.recalcularPlanoPaginasPorDia = function(index, paginasPorDia) {
        const plano = planos[index];

        if (paginasPorDia <= 0) {
            alert("Número de páginas por dia deve ser maior que zero.");
            return;
        }

        const novaDataFim = calcularNovaDataFimPorPaginasDia(plano, paginasPorDia);

        if (novaDataFim <= plano.dataInicio) {
            alert("Com essa quantidade de páginas por dia, a nova data de fim não pode ser antes da data de início.");
            return;
        }

        const diasParaAdicionar = Math.ceil((novaDataFim - plano.dataFim) / (1000 * 60 * 60 * 24));

        if (diasParaAdicionar <= 0) {
             alert("A nova data de fim não estende o plano atual.");
             return;
        }

        recalcularPlanoNovaData(index, novaDataFim);
    };


    // Exclui um plano
    window.excluirPlano = function(index) {
        if (confirm("Tem certeza que deseja excluir este plano?")) {
            planos.splice(index, 1);
            salvarPlanos(planos);
            if (user) { // Sincroniza com Firebase após excluir
                uploadPlanosParaFirebase();
            }
            renderizarPlanos();
        }
    };

    // Salva planos no localStorage
    function salvarPlanosLocal(planos) {
        localStorage.setItem('planosLeitura', JSON.stringify(planos));
    }

    // Carrega planos do localStorage
    function carregarPlanosSalvos() {
        const planosSalvos = localStorage.getItem('planosLeitura');
        if (!planosSalvos) return null;
        const planos = JSON.parse(planosSalvos);
        return planos.map(plano => {
            plano.dataInicio = new Date(plano.dataInicio);
            plano.dataFim = new Date(plano.dataFim);
            plano.diasPlano = plano.diasPlano.map(dia => {
                dia.data = new Date(dia.data);
                return dia;
            });
            return plano;
        });
    }

    // Salva planos localmente ou no Firebase dependendo do estado de login
    function salvarPlanos(planosParaSalvar) {
        if (user) {
            uploadPlanosParaFirebase(); // Sincroniza com Firebase se usuário logado
        } else {
            salvarPlanosLocal(planosParaSalvar); // Salva localmente se não logado
        }
    }


    // Submissão do formulário
    formPlano.addEventListener('submit', function(event) {
        event.preventDefault();

        const titulo = document.getElementById('titulo-livro').value;
        const paginaInicio = parseInt(document.getElementById('pagina-inicio').value);
        const paginaFim = parseInt(document.getElementById('pagina-fim').value);
        let dataInicio, dataFim;

        // Validação das páginas
        if (paginaFim < paginaInicio) {
            alert("A página de fim deve ser maior ou igual à página de início.");
            return;
        }

        // Determina as datas com base no método de definição
        if (definirPorDatasRadio.checked) {
            dataInicio = new Date(document.getElementById('data-inicio').value);
            dataFim = new Date(document.getElementById('data-fim').value);
            if (dataFim <= dataInicio) {
                alert("A data de fim deve ser posterior à data de início.");
                return;
            }
        } else {
            dataInicio = new Date(document.getElementById('data-inicio-dias').value);
            const numeroDias = parseInt(document.getElementById('numero-dias').value);
            if (isNaN(numeroDias) || numeroDias < 1) {
                alert("Número de dias inválido.");
                return;
            }
            dataFim = new Date(dataInicio);
            dataFim.setDate(dataInicio.getDate() + numeroDias - 1);
        }

        const periodicidade = periodicidadeSelect.value;
        const diasSemana = periodicidade === 'semanal' ?
            Array.from(document.querySelectorAll('input[name="dia-semana"]:checked')).map(cb => parseInt(cb.value)) : [];

        if (periodicidade === 'semanal' && diasSemana.length === 0) {
            alert("Selecione pelo menos um dia da semana.");
            return;
        }

        // Cria ou atualiza o plano
        const plano = criarPlanoLeitura(titulo, paginaInicio, paginaFim, dataInicio, dataFim, periodicidade, diasSemana);
        if (plano) {
            if (planoEditandoIndex > -1) {
                planos[planoEditandoIndex] = plano;
                planoEditandoIndex = -1;
                formPlano.querySelector('button[type="submit"]').textContent = 'Salvar Plano';
            } else {
                planos.push(plano);
            }
            salvarPlanos(planos); // Salva no localStorage ou Firebase dependendo do login
            renderizarPlanos();
            formPlano.reset();
            periodoPorDatasDiv.style.display = 'block';
            periodoPorDiasDiv.style.display = 'none';
            definirPorDatasRadio.checked = true;
            definirPorDiasRadio.checked = false;
            diasSemanaSelecao.style.display = 'none';
            inicioBtn.click(); // Simula clique no botão "Início" para voltar para a tela de planos
        }
    });

    // Função para criar um plano de leitura
    function criarPlanoLeitura(titulo, paginaInicio, paginaFim, dataInicio, dataFim, periodicidade, diasSemana) {
        const totalPaginas = paginaFim - paginaInicio + 1;
        let dataAtual = new Date(dataInicio);
        dataAtual.setHours(0, 0, 0, 0);
        const diasPlano = [];

        while (dataAtual <= dataFim) {
            const diaSemana = dataAtual.getDay();
            if (periodicidade === 'diario' || (periodicidade === 'semanal' && diasSemana.includes(diaSemana))) {
                diasPlano.push({
                    data: new Date(dataAtual),
                    paginaInicioDia: 0,
                    paginaFimDia: 0,
                    paginas: 0,
                    lido: false
                });
            }
            dataAtual.setDate(dataAtual.getDate() + 1);
        }

        if (diasPlano.length === 0) {
            alert("Não há dias de leitura válidos no período selecionado.");
            return null;
        }

        const paginasPorDia = Math.floor(totalPaginas / diasPlano.length);
        const resto = totalPaginas % diasPlano.length;
        let paginaAtual = paginaInicio;

        diasPlano.forEach((dia, index) => {
            const paginasDia = index < resto ? paginasPorDia + 1 : paginasPorDia;
            dia.paginaInicioDia = paginaAtual;
            dia.paginaFimDia = paginaAtual + paginasDia - 1;
            dia.paginas = paginasDia;
            paginaAtual = dia.paginaFimDia + 1;
        });

        return {
            id: Date.now(),
            titulo,
            paginaInicio,
            paginaFim,
            totalPaginas,
            dataInicio,
            dataFim,
            periodicidade,
            diasSemana,
            diasPlano,
            paginasLidas: 0
        };
    }


    // Exporta planos para JSON
    exportarPlanosBtn.addEventListener('click', function() {
        const jsonString = JSON.stringify(planos, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;

        // Formatação da data e hora
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const fileName = `${year}${month}${day}_${hours}${minutes}_Plano de leitura de livros.json`;


        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
    });

    // Importa planos de JSON
    importarPlanosBtn.addEventListener('click', () => importarPlanosInput.click());
    importarPlanosInput.addEventListener('change', function(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const novosPlanos = JSON.parse(e.target.result);
                planos = novosPlanos.map(plano => ({
                    ...plano,
                    dataInicio: new Date(plano.dataInicio),
                    dataFim: new Date(plano.dataFim),
                    diasPlano: plano.diasPlano.map(dia => ({
                        ...dia,
                        data: new Date(dia.data)
                    }))
                }));
                salvarPlanos(planos);
                renderizarPlanos();
            } catch (error) {
                alert("Erro ao importar o arquivo JSON.");
            }
        };
        reader.readAsText(file);
    });

    // Limpa todos os dados
    limparDadosBtn.addEventListener('click', function() {
        if (confirm("Tem certeza que deseja limpar todos os dados?")) {
            planos = [];
            localStorage.removeItem('planosLeitura');
            if (user) { // Limpa também no Firebase ao limpar dados localmente
                uploadPlanosParaFirebase(); // Envia um array de planos vazio para o Firebase
            }
            renderizarPlanos();
        }
     });

    exportarAgendaBtn.addEventListener('click', () => {
        const planoIndex = prompt("Digite o número do plano que deseja exportar para a agenda (começando do 1):") - 1;
        if (planoIndex >= 0 && planoIndex < planos.length) {
            exportarParaAgenda(planos[planoIndex]);
        } else if (planoIndex !== null) {
            alert("Índice de plano inválido.");
        }
    });

    function exportarParaAgenda(plano) {
        const horarioInicio = prompt("Digite o horário de início dos eventos (formato HH:MM):");
        const horarioFim = prompt("Digite o horário de fim dos eventos (formato HH:MM):");

        if (!horarioInicio || !horarioFim) {
            alert("Horários de início e fim são necessários para exportar para a agenda.");
            return;
        }

        if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(horarioInicio) || !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(horarioFim)) {
            alert("Formato de horário inválido. Use HH:MM (ex: 09:00 ou 19:30).");
            return;
        }

        const eventosICS = gerarICS(plano, horarioInicio, horarioFim);
        downloadICSFile(eventosICS, plano.titulo);
    }

    function gerarICS(plano, horarioInicio, horarioFim) {
        let calendarICS = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Seu Organizador de Plano de Leitura//NONSGML v1.0//EN\r\n`;

        calendarICS += `BEGIN:VEVENT\r\n`; // Iniciar um único evento VEVENT para toda a recorrência
        calendarICS += `UID:${plano.id}@gerenciador-planos-leitura-recorrente\r\n`; // UID único para o evento recorrente

        // Data de Início do Evento (primeiro dia do plano)
        const dataInicioISO = plano.diasPlano[0].data.toISOString().slice(0, 10).replace(/-/g, "");
        const inicioEvento = `${dataInicioISO}T${horarioInicio.replace(/:/g, "")}00`;
        calendarICS += `DTSTART:${inicioEvento}\r\n`;

        // Data de Fim do Evento (fim do horário no primeiro dia)
        const fimEventoPrimeiroDia = `${dataInicioISO}T${horarioFim.replace(/:/g, "")}00`;
        calendarICS += `DTEND:${fimEventoPrimeiroDia}\r\n`;

        // Valarme para lembrete de 15 minutos antes
        calendarICS += `BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:Lembrete de leitura\r\nTRIGGER:-PT15M\r\nEND:VALARM\r\n`;

        // Regra de Recorrência (RRULE)
        let rrule = 'RRULE:';
        if (plano.periodicidade === 'diario') {
            rrule += 'FREQ=DAILY';
        } else if (plano.periodicidade === 'semanal') {
            rrule += 'FREQ=WEEKLY;BYDAY=';
            const diasSemanaAbreviados = plano.diasSemana.map(diaIndex => {
                const diasAbreviados = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']; // Domingo a Sábado em inglês abreviado
                return diasAbreviados[diaIndex];
            }).join(',');
            rrule += diasSemanaAbreviados;
        }

        // Data UNTIL (Data de Fim da Recorrência)
        const dataFimISO = plano.dataFim.toISOString().slice(0, 10).replace(/-/g, "");
        rrule += `;UNTIL=${dataFimISO}T235959Z`; // Termina no último segundo do dia final (UTC)
        calendarICS += rrule + '\r\n';


        calendarICS += `SUMMARY:Leitura: ${plano.titulo} - Páginas (ver detalhes)\r\n`; // Resumo genérico para o evento recorrente
        calendarICS += `DESCRIPTION:Plano de leitura do livro "${plano.titulo}". Acesse o plano em: <a href="https://fernnog.github.io/Plano-leitura-livros/">Gerenciador de Planos de Leitura</a>\r\n\r\n`;

        // Adicionar detalhes dos dias de leitura na descrição (opcional, mas útil)
        plano.diasPlano.forEach(dia => {
            calendarICS += `- ${dia.data.toLocaleDateString('pt-BR')} - Páginas ${dia.paginaInicioDia} a ${dia.paginaFimDia}\r\n`;
        });
        calendarICS += `\r\nAbra o Gerenciador de Planos de Leitura para mais detalhes.\r\n`;
        calendarICS += `LOCATION:Sua casa ou local de leitura preferido\r\n`;
        calendarICS += `END:VEVENT\r\n`; // Fim do evento VEVENT único

        calendarICS += `END:VCALENDAR\r\n`;
        return calendarICS;
    }

    function downloadICSFile(icsContent, planoTitulo) {
        const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${planoTitulo.replace(/[^a-z0-9]/gi, '_')}_leitura_agenda.ics`;
        a.click();
        URL.revokeObjectURL(url);
    }

    function togglePaginatorVisibility() {
        const paginador = document.getElementById('paginador-planos');
        if (!paginador) return; // Exit if paginator element doesn't exist
        const planos = document.querySelectorAll('.plano-leitura');
        if (!planos || planos.length === 0) {
            if (paginador.classList.contains('hidden')) {
                paginador.classList.remove('hidden');
            }
            return; // No plans, ensure paginator is visible (or not hidden) and exit
        }
        const ultimoPlano = planos[planos.length - 1];
        if (!ultimoPlano) return; // Exit if last plan element doesn't exist

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

    function distribuirPaginasPlano(plano) {
        const totalPaginas = plano.paginaFim - plano.paginaInicio + 1;
        const diasPlano = plano.diasPlano;

        if (diasPlano.length === 0) {
            alert("Não há dias de leitura válidos no período selecionado.");
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

        // Recalcula paginas lidas após redistribuição, mantendo o status 'lido'
        plano.paginasLidas = 0; // Reset para recalcular corretamente
        plano.diasPlano.forEach(dia => {
            if (dia.lido) plano.paginasLidas += dia.paginas;
        });
    }

    // Recalcula o plano com base em uma nova data final
    function recalcularPlanoNovaData(index, novaDataFim) {
        const planoOriginal = planos[index];
        const diasLidosCount = planoOriginal.diasPlano.filter(dia => dia.lido).length;
        const primeiroDiaNaoLidoIndex = planoOriginal.diasPlano.findIndex(dia => !dia.lido);


        // Mantém dias já lidos, remove os não lidos e calcula novos dias até a novaDataFim
        const novosDiasPlano = planoOriginal.diasPlano.slice(0, primeiroDiaNaoLidoIndex === -1 ? planoOriginal.diasPlano.length : primeiroDiaNaoLidoIndex);
        let dataAtual = novosDiasPlano.length > 0 ? new Date(novosDiasPlano[novosDiasPlano.length - 1].data) : new Date(planoOriginal.dataInicio); // Inicia do último dia lido + 1 ou da data de início original
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
            alert("Não há dias de leitura válidos no novo período selecionado.");
            return;
        }


        const paginasRestantes = planoOriginal.totalPaginas - planoOriginal.paginasLidas;
        const paginasPorDia = Math.floor(paginasRestantes / (novosDiasPlano.length - diasLidosCount)); // Distribui as páginas restantes pelos novos dias
        const resto = paginasRestantes % (novosDiasPlano.length - diasLidosCount);
        let paginaInicioProximoDia = planoOriginal.paginaInicio + planoOriginal.paginasLidas;


         novosDiasPlano.forEach((dia, index) => {
             if (index >= diasLidosCount) {
                 const paginasDia = index < diasLidosCount + resto ? paginasPorDia + 1 : paginasPorDia;
                 dia.paginaInicioDia = paginaInicioProximoDia;
                 dia.paginaFimDia = paginaInicioProximoDia + paginasDia - 1;
                 dia.paginas = paginasDia;
                 paginaInicioProximoDia = dia.paginaFimDia + 1;
             } else {
                 dia.paginaInicioDia = planoOriginal.diasPlano[index].paginaInicioDia; // Mantém os valores originais para dias lidos
                 dia.paginaFimDia = planoOriginal.diasPlano[index].paginaFimDia;
                 dia.paginas = planoOriginal.diasPlano[index].paginas;
             }
         });


        planos[index].dataFim = novaDataFim;
        planos[index].diasPlano = novosDiasPlano;
        distribuirPaginasPlano(planos[index]); // Redistribui as páginas pelo novo período
        atualizarPaginasLidas(index);
        salvarPlanos(planos);
        renderizarPlanos();
    }

    // Inicializar a aplicação
    initApp();

    // Eventos de clique para login e logout
    loginButton.addEventListener('click', login);
    logoutButton.addEventListener('click', logout);
    syncFirebaseButton.addEventListener('click', () => syncWithFirebase(renderizarPlanos));
});
