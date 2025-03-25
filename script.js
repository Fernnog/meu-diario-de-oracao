import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';
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

    // Função para inicializar a autenticação e carregar dados
    function initApp() {
        initAuth();
        carregarPlanosSalvos((planosCarregados) => {
            planos = planosCarregados || [];
            renderizarPlanos();
        });
    }

    // Função para inicializar a autenticação - COM SETTIMEOUT PARA TESTE
    function initAuth() {
        onAuthStateChanged(auth, (currentUser) => {
            setTimeout(() => { // ADDED setTimeout (for testing ONLY)
                user = currentUser;
                console.log("Estado de Autenticação Mudou (delayed):", user);
                if (user) {
                    loginButton.style.display = 'none';
                    logoutButton.style.display = 'block';
                    syncFirebaseButton.style.display = 'none';
                } else {
                    loginButton.style.display = 'block';
                    logoutButton.style.display = 'none';
                    syncFirebaseButton.style.display = 'none';
                    // Removido temporariamente planos = []; e renderizarPlanos();
                }
            }, 50); // 50ms delay - adjust if needed, try small values
        });
    }

    // Função para fazer login com Google - COM LOGGING DETALHADO
    function login() {
        console.log("Função login() iniciada"); // Log no início
        const provider = new GoogleAuthProvider();
        signInWithPopup(auth, provider)
            .then((result) => {
                console.log('Login bem-sucedido:', result.user); // Log de sucesso
                carregarPlanosSalvos((planosCarregados) => {
                    planos = planosCarregados || [];
                    renderizarPlanos();
                });
            })
            .catch((error) => {
                console.error('Erro ao fazer login:', error); // Log de erro
                alert('Erro ao fazer login. Tente novamente.');
            });
        console.log("Função login() finalizada"); // Log no final
    }

    // Função para fazer logout - COM LOGGING DETALHADO
    function logout() {
        console.log("Função logout() iniciada"); // Log no início
        signOut(auth)
            .then(() => {
                console.log('Logout bem-sucedido'); // Log de sucesso
                planos = [];
                renderizarPlanos();
            })
            .catch((error) => {
                console.error('Erro ao fazer logout:', error); // Log de erro
                alert('Erro ao fazer logout. Tente novamente.');
            });
        console.log("Função logout() finalizada"); // Log no final
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

    // Salva planos no Firebase Firestore
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

    // Renderizar planos
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

    // Verificar Atraso
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

    // Marcar dia lido
    window.marcarDiaLido = function(planoIndex, diaIndex, lido) {
        planos[planoIndex].diasPlano[diaIndex].lido = lido;
        atualizarPaginasLidas(planoIndex);
        salvarPlanos(planos, (salvoComSucesso) => {
            if (salvoComSucesso) {
                console.log('Progresso de leitura salvo no Firebase.');
            } else {
                console.error('Falha ao salvar progresso de leitura no Firebase.');
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

    // Atualizar Paginas Lidas
    function atualizarPaginasLidas(planoIndex) {
        planos[planoIndex].paginasLidas = planos[planoIndex].diasPlano.reduce((sum, dia) =>
            sum + (dia.lido ? dia.paginas : 0), 0);
    }

    // Editar um plano existente
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

    // Recalcular um plano atrasado
    window.recalcularPlanoPeriodoOriginal = function(index) {
        recalcularPlanoPeriodoOriginalFunction(index);
    };

    const recalcularPlanoPeriodoOriginalFunction = function(index) {
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

        salvarPlanos(planos, (salvoComSucesso) => {
            if (salvoComSucesso) {
                console.log('Plano recalculado e salvo no Firebase.');
            } else {
                console.error('Falha ao salvar plano recalculado no Firebase.');
            }
            renderizarPlanos();
        });
    };

    window.recalcularPlanoPaginasPorDia = function(index, paginasPorDia) {
        recalcularPlanoPaginasPorDiaFunction(index, paginasPorDia);
    };

    const recalcularPlanoPaginasPorDiaFunction = function(index, paginasPorDia) {
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
            salvarPlanos(planos, (salvoComSucesso) => {
                if (salvoComSucesso) {
                    console.log('Plano excluído e alteração salva no Firebase.');
                } else {
                    console.error('Falha ao salvar exclusão do plano no Firebase.');
                }
                renderizarPlanos();
            });
        }
    };

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
                salvarPlanos(planos, (salvoComSucesso) => { // Adicionado callback aqui também, embora menos crítico para importação
                    renderizarPlanos();
                });
            } catch (error) {
                alert("Erro ao importar o arquivo JSON.");
            }
        };
        reader.readAsText(file);
    });

    // Limpa todos os dados LOCALMENTE (JSON)
    limparDadosBtn.addEventListener('click', function() {
        if (confirm("Tem certeza que deseja limpar todos os dados LOCALMENTE (JSON)? Isso NÃO afetará os dados no Firebase se você estiver logado.")) {
            planos = []; // Limpa os planos na memória (apenas para a sessão atual)
            renderizarPlanos(); // Renderiza a lista vazia
            alert('Dados locais (JSON) limpos. Os dados no Firebase (se logado) não foram afetados.');
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

    // Função para distribuir páginas pelo plano
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
        salvarPlanos(planos, (salvoComSucesso) => {
            renderizarPlanos();
        });
    }

    // Funções auxiliares para gerar dias do plano
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

    function gerarDiasPlanoPorDias(dataInicio, numeroDias, periodicidade, diasSemana) {
        const dias = [];
        let dataAtual = new Date(dataInicio);
        for (let i = 0; i < numeroDias; i++) {
            const diaSemana = dataAtual.getDay();
            if (periodicidade === 'diario' || (periodicidade === 'semanal' && diasSemana.includes(diaSemana))) {
                dias.push({
                    data: new Date(dataAtual),
                    paginaInicioDia: 0,
                    paginaFimDia: 0,
                    paginas: 0,
                    lido: false
                });
            } else {
                i--; // Decrementa o contador para compensar dias não selecionados na periodicidade semanal
            }
            dataAtual.setDate(dataAtual.getDate() + 1);
        }
        return dias;
    }

    function calcularDataFimPorDias(dataInicio, numeroDias) {
        const dataFim = new Date(dataInicio);
        dataFim.setDate(dataFim.getDate() + numeroDias - 1);
        return dataFim;
    }


    // Eventos de clique para login e logout
    loginButton.addEventListener('click', login);
    logoutButton.addEventListener('click', logout);
    syncFirebaseButton.addEventListener('click', () => syncWithFirebase(renderizarPlanos));

    // Evento de clique para o botão "Novo Plano"
    novoPlanoBtn.addEventListener('click', function() {
        cadastroPlanoSection.style.display = 'block';
        planosLeituraSection.style.display = 'none';
        inicioBtn.style.display = 'block';
        novoPlanoBtn.style.display = 'none';
        inicioCadastroBtn.style.display = 'block';
        // Limpa o formulário ao iniciar um novo plano (ou editar)
        formPlano.reset();
        planoEditandoIndex = -1; // Reseta o índice de edição para novo plano
        formPlano.querySelector('button[type="submit"]').textContent = 'Salvar Plano'; // Garante que o texto do botão está correto para novo plano
    });

    // Evento de clique para o botão "Início"
    inicioBtn.addEventListener('click', function() {
        planosLeituraSection.style.display = 'block';
        cadastroPlanoSection.style.display = 'none';
        inicioBtn.style.display = 'none';
        novoPlanoBtn.style.display = 'block';
        inicioCadastroBtn.style.display = 'none';
    });

    // Event listeners para mostrar/esconder divs de período e dias da semana
    definirPorDatasRadio.addEventListener('change', function() {
        periodoPorDatasDiv.style.display = 'block';
        periodoPorDiasDiv.style.display = 'none';
    });

    definirPorDiasRadio.addEventListener('change', function() {
        periodoPorDatasDiv.style.display = 'none';
        periodoPorDiasDiv.style.display = 'block';
    });

    periodicidadeSelect.addEventListener('change', function() {
        diasSemanaSelecao.style.display = this.value === 'semanal' ? 'block' : 'none';
    });

    // Event listener para o formulário de plano (SUBMIT) - **ADICIONADO e MELHORADO**
    formPlano.addEventListener('submit', function(event) {
        event.preventDefault(); // Impede o envio padrão do formulário

        // Validação básica dos campos obrigatórios
        if (!document.getElementById('titulo-livro').value ||
            !document.getElementById('pagina-inicio').value ||
            !document.getElementById('pagina-fim').value ||
            (definirPorDatasRadio.checked && (!document.getElementById('data-inicio').value || !document.getElementById('data-fim').value)) ||
            (definirPorDiasRadio.checked && (!document.getElementById('data-inicio-dias').value || !document.getElementById('numero-dias').value)) ||
            !document.getElementById('periodicidade').value ||
            (periodicidadeSelect.value === 'semanal' && document.querySelectorAll('input[name="dia-semana"]:checked').length === 0)
        ) {
            alert('Por favor, preencha todos os campos obrigatórios.'); // Feedback simples, pode ser melhorado
            return; // Impede o envio se a validação falhar
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
        } else { // definicaoPeriodo === 'dias'
            dataInicio = dataInicioDias;
            dataFim = calcularDataFimPorDias(dataInicio, numeroDias);
            diasPlano = gerarDiasPlanoPorDias(dataInicio, numeroDias, periodicidade, diasSemana);
        }

        const novoPlano = {
            id: crypto.randomUUID(), // Gere um UUID para o plano - MELHORIA: UUID para identificação única
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
            planos[planoEditandoIndex] = novoPlano; // Atualiza plano existente
            planoEditandoIndex = -1; // Reseta o índice de edição
            formPlano.querySelector('button[type="submit"]').textContent = 'Salvar Plano'; // Restaura texto do botão
        } else {
            planos.push(novoPlano); // Adiciona novo plano
        }

        distribuirPaginasPlano(novoPlano); // Distribui as páginas pelos dias do plano
        salvarPlanos(planos, (salvoComSucesso) => {
            if (salvoComSucesso) {
                console.log('Plano salvo no Firebase.');
            } else {
                console.error('Falha ao salvar plano no Firebase.');
            }
            renderizarPlanos();
        });


        inicioBtn.click(); // Simula clique no botão "Início" para voltar para a lista de planos
    });
});
