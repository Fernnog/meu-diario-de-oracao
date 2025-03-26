// Configuração do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyDIXuruqM4M9oA_Rz3PSxVsXM1EEVVbprw",
    authDomain: "escaladeintercessao.firebaseapp.com",
    databaseURL: "https://escaladeintercessao-default-rtdb.firebaseio.com",
    projectId: "escaladeintercessao",
    storageBucket: "escaladeintercessao.firebasestorage.app",
    messagingSenderId: "875628397922",
    appId: "1:875628397922:web:219b624120eb9286e5d83b",
    measurementId: "G-9MGZ364KVZ"
};

// Inicializa o Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();

let membros = [];
let restricoes = [];
let restricoesPermanentes = [];

// Funções Utilitárias
function showTab(tabId) {
    document.querySelectorAll('.tab').forEach(tab => tab.style.display = 'none');
    document.getElementById(tabId).style.display = 'block';
}

function toggleConjuge() {
    document.getElementById('conjugeField').style.display =
        document.getElementById('conjugeParticipa').checked ? 'block' : 'none';
}

function salvarDados() {
    const user = auth.currentUser;
    if (!user) {
        alert('Você precisa estar logado para salvar dados.');
        return;
    }
    const uid = user.uid;
    database.ref('users/' + uid).set({
        membros: membros,
        restricoes: restricoes,
        restricoesPermanentes: restricoesPermanentes
    })
    .then(() => {
        console.log('Dados salvos com sucesso!');
    })
    .catch((error) => {
        console.error('Erro ao salvar dados: ', error);
    });
}

function carregarDados() {
    const user = auth.currentUser;
    if (!user) {
        alert('Você precisa estar logado para carregar dados.');
        return;
    }
    const uid = user.uid;
    database.ref('users/' + uid).once('value')
        .then((snapshot) => {
            if (snapshot.exists()) {
                const dados = snapshot.val();
                membros = dados.membros || [];
                restricoes = dados.restricoes || [];
                restricoesPermanentes = dados.restricoesPermanentes || [];
                atualizarListaMembros();
                atualizarSelectMembros();
                atualizarListaRestricoes();
                atualizarListaRestricoesPermanentes();
            } else {
                console.log('Nenhum dado encontrado.');
            }
        })
        .catch((error) => {
            console.error('Erro ao carregar dados: ', error);
        });
}

function limparDados() {
    if (confirm('Tem certeza que deseja limpar todos os dados? Esta ação não pode ser desfeita.')) {
        membros = [];
        restricoes = [];
        restricoesPermanentes = [];
        salvarDados();
        atualizarListaMembros();
        atualizarSelectMembros();
        atualizarListaRestricoes();
        atualizarListaRestricoesPermanentes();
        document.getElementById('resultadoEscala').innerHTML = '';
    }
}

// Funções de Autenticação
document.getElementById('formRegistro').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('emailRegistro').value;
    const senha = document.getElementById('senhaRegistro').value;
    auth.createUserWithEmailAndPassword(email, senha)
        .then((userCredential) => {
            alert('Usuário registrado com sucesso!');
            showTab('cadastro');
        })
        .catch((error) => {
            alert('Erro ao registrar: ' + error.message);
        });
});

document.getElementById('formLogin').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('emailLogin').value;
    const senha = document.getElementById('senhaLogin').value;
    auth.signInWithEmailAndPassword(email, senha)
        .then((userCredential) => {
            alert('Login bem-sucedido!');
            document.getElementById('logout').style.display = 'block';
            showTab('cadastro');
        })
        .catch((error) => {
            alert('Erro ao fazer login: ' + error.message);
        });
});

document.getElementById('logout').addEventListener('click', () => {
    auth.signOut().then(() => {
        alert('Logout bem-sucedido!');
        document.getElementById('logout').style.display = 'none';
        showTab('auth');
    });
});

// Funções de Membros
function atualizarListaMembros() {
    const lista = document.getElementById('listaMembros');
    membros.sort((a, b) => a.nome.localeCompare(b.nome));

    let maleCount = 0;
    let femaleCount = 0;

    lista.innerHTML = membros.map((m, index) => {
        if (m.genero === 'M') maleCount++;
        else if (m.genero === 'F') femaleCount++;

        const genderSymbol = m.genero === 'M' ? '♂️' : '♀️';
        return `
            <li>
                <div>
                    <span class="gender-icon gender-${m.genero === 'M' ? 'male' : 'female'}">(${genderSymbol})</span>
                    <span class="member-name">${m.nome}</span>
                </div>
                <div class="member-details">
                    ${m.conjuge ? `<span class="spouse-info">- Cônjuge: ${m.conjuge}</span>` : ''}
                </div>
                <button onclick="excluirMembro(${index})">Excluir</button>
            </li>`;
    }).join('');

    document.getElementById('maleCount').textContent = maleCount;
    document.getElementById('femaleCount').textContent = femaleCount;
    document.getElementById('totalCount').textContent = membros.length;
}

function excluirMembro(index) {
    membros.splice(index, 1);
    atualizarListaMembros();
    atualizarSelectMembros();
    salvarDados();
}

function atualizarSelectMembros() {
    const selects = [document.getElementById('membroRestricao'), document.getElementById('membroRestricaoPermanente')];
    // Ordena os membros alfabeticamente antes de popular os selects
    membros.sort((a, b) => a.nome.localeCompare(b.nome));
    selects.forEach(select => {
        select.innerHTML = '<option value="">Selecione um membro</option>' +
            membros.map(m => `<option value="${m.nome}">${m.nome}</option>`).join('');
    });
}

// Funções de Restrições
function atualizarListaRestricoes() {
    const lista = document.getElementById('listaRestricoes');
    // Ordena as restrições por nome do membro antes de exibir
    restricoes.sort((a, b) => a.membro.localeCompare(b.membro));
    lista.innerHTML = restricoes.map((r, index) =>
        `<li>${r.membro}: ${new Date(r.inicio).toLocaleDateString()} a ${new Date(r.fim).toLocaleDateString()}
        <button onclick="excluirRestricao(${index})">Excluir</button></li>`).join('');
}

function excluirRestricao(index) {
    restricoes.splice(index, 1);
    atualizarListaRestricoes();
    salvarDados();
}

function atualizarListaRestricoesPermanentes() {
    const lista = document.getElementById('listaRestricoesPermanentes');
    // Ordena as restrições permanentes por nome do membro antes de exibir
    restricoesPermanentes.sort((a, b) => a.membro.localeCompare(b.membro));
    lista.innerHTML = restricoesPermanentes.map((r, index) =>
        `<li>${r.membro}: ${r.diaSemana}
        <button onclick="excluirRestricaoPermanente(${index})">Excluir</button></li>`).join('');
}

function excluirRestricaoPermanente(index) {
    restricoesPermanentes.splice(index, 1);
    atualizarListaRestricoesPermanentes();
    salvarDados();
}

// Funções de Cadastro
document.getElementById('formCadastro').addEventListener('submit', (e) => {
    e.preventDefault();
    const nome = document.getElementById('nome').value;
    const genero = document.getElementById('genero').value;
    const conjugeParticipa = document.getElementById('conjugeParticipa').checked;
    const nomeConjuge = conjugeParticipa ? document.getElementById('nomeConjuge').value : null;

    if (nomeConjuge && !membros.some(m => m.nome === nomeConjuge)) {
        alert('O cônjuge deve estar cadastrado como membro!');
        return;
    }

    membros.push({ nome, genero, conjuge: nomeConjuge });
    atualizarListaMembros();
    atualizarSelectMembros();
    salvarDados();
    e.target.reset();
    toggleConjuge();
});

document.getElementById('formRestricao').addEventListener('submit', (e) => {
    e.preventDefault();
    const membro = document.getElementById('membroRestricao').value;
    const inicio = new Date(document.getElementById('dataInicio').value);
    const fim = new Date(document.getElementById('dataFim').value);

    if (!membro) {
        alert('Selecione um membro!');
        return;
    }
    if (fim < inicio) {
        alert('A data de fim deve ser posterior à data de início!');
        return;
    }

    restricoes.push({ membro, inicio: inicio.toISOString(), fim: fim.toISOString() });
    atualizarListaRestricoes();
    salvarDados();
    e.target.reset();
});

document.getElementById('formRestricaoPermanente').addEventListener('submit', (e) => {
    e.preventDefault();
    const membro = document.getElementById('membroRestricaoPermanente').value;
    const diaSemana = document.getElementById('diaSemana').value;

    if (!membro) {
        alert('Selecione um membro!');
        return;
    }

    restricoesPermanentes.push({ membro, diaSemana });
    atualizarListaRestricoesPermanentes();
    salvarDados();
    e.target.reset();
});

// Funções de Geração da Escala
function weightedRandom(weights) {
    let random = Math.random();
    let cumulativeWeight = 0;
    for (let i = 0; i < weights.length; i++) {
        cumulativeWeight += weights[i];
        if (random < cumulativeWeight) {
            return i;
        }
    }
    return weights.length - 1;
}

function selecionarMembrosComAleatoriedade(membrosDisponiveis, quantidadeNecessaria, participacoes) {
    if (membrosDisponiveis.length < quantidadeNecessaria) return [];

    const pesos = membrosDisponiveis.map(m => 1 / (1 + participacoes[m.nome]));
    const somaPesos = pesos.reduce((sum, p) => sum + p, 0);
    const pesosNormalizados = pesos.map(p => p / somaPesos);

    const selecionados = [];
    const disponiveis = [...membrosDisponiveis];
    const pesosTemp = [...pesosNormalizados];

    while (selecionados.length < quantidadeNecessaria && disponiveis.length > 0) {
        const indice = weightedRandom(pesosTemp);
        const membroSelecionado = disponiveis.splice(indice, 1)[0];
        pesosTemp.splice(indice, 1);
        selecionados.push(membroSelecionado);
    }

    return selecionados;
}

function revisarEscala(dias, participacoes) {
    let escalaAlterada = true;
    let iteracoes = 0;
    const maxIteracoes = 10;

    while (escalaAlterada && iteracoes < maxIteracoes) {
        escalaAlterada = false;
        iteracoes++;

        const participacoesOrdenadas = Object.entries(participacoes).sort(([, a], [, b]) => a - b);
        const membroMenosParticipou = participacoesOrdenadas[0][0];
        const membroMaisParticipou = participacoesOrdenadas[participacoesOrdenadas.length - 1][0];
        const diferencaParticipacao = participacoes[membroMaisParticipou] - participacoes[membroMenosParticipou];

        if (diferencaParticipacao > 1) {
            for (const dia of dias) {
                for (let i = 0; i < dia.selecionados.length; i++) {
                    const membroAtual = dia.selecionados[i];
                    if (membroAtual.nome === membroMaisParticipou) {
                        const membrosDisponiveisParaSubstituir = membros.filter(m => {
                            const restricaoTemp = restricoes.some(r =>
                                r.membro === m.nome && new Date(dia.data) >= new Date(r.inicio) && new Date(dia.data) <= new Date(r.fim)
                            );
                            const restricaoPerm = restricoesPermanentes.some(r =>
                                r.membro === m.nome && r.diaSemana === dia.tipo
                            );
                            const naoSerParceiroAtual = dia.selecionados.length === 2 ? m.nome !== dia.selecionados[1 - i].nome : true;
                            const ehMembroMenosParticipou = m.nome === membroMenosParticipou;

                            return !restricaoTemp && !restricaoPerm && naoSerParceiroAtual && ehMembroMenosParticipou && m.nome !== membroAtual.nome;
                        });

                        const substitutoIdeal = membrosDisponiveisParaSubstituir.find(sub =>
                            (dia.selecionados.length === 1 ||
                                (sub.genero === dia.selecionados[1 - i].genero ||
                                    sub.conjuge === dia.selecionados[1 - i].nome ||
                                    dia.selecionados[1 - i].conjuge === sub.nome))
                        );

                        if (substitutoIdeal) {
                            dia.selecionados[i] = substitutoIdeal;
                            participacoes[membroAtual.nome]--;
                            participacoes[substitutoIdeal.nome]++;
                            escalaAlterada = true;
                            break;
                        }
                    }
                }
                if (escalaAlterada) break;
            }
        }
    }
}

document.getElementById('formEscala').addEventListener('submit', (e) => {
    e.preventDefault();
    const gerarCultos = document.getElementById('escalaCultos').checked;
    const gerarSabado = document.getElementById('escalaSabado').checked;
    const gerarOração = document.getElementById('escalaOração').checked;
    const quantidadeCultos = parseInt(document.getElementById('quantidadeCultos').value);
    const mes = parseInt(document.getElementById('mesEscala').value);
    const ano = parseInt(document.getElementById('anoEscala').value);
    const resultado = document.getElementById('resultadoEscala');

    const inicio = new Date(ano, mes, 1);
    const fim = new Date(ano, mes + 1, 0);
    resultado.innerHTML = `<h3>Escala Gerada - ${inicio.toLocaleString('pt-BR', { month: 'long' })} ${ano}</h3>`;

    const dias = [];
    for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 1)) {
        const diaSemana = d.toLocaleString('pt-BR', { weekday: 'long' });
        if (gerarCultos) {
            if (diaSemana === 'quarta-feira') dias.push({ data: new Date(d), tipo: 'Quarta', selecionados: [] });
            if (diaSemana === 'domingo') {
                dias.push({ data: new Date(d), tipo: 'Domingo Manhã', selecionados: [] });
                dias.push({ data: new Date(d), tipo: 'Domingo Noite', selecionados: [] });
            }
        }
        if (gerarSabado && diaSemana === 'sábado') dias.push({ data: new Date(d), tipo: 'Sábado', selecionados: [] });
        if (gerarOração) dias.push({ data: new Date(d), tipo: 'Oração no WhatsApp', selecionados: [] });
    }

    const participacoes = {};
    membros.forEach(m => participacoes[m.nome] = 0);

    dias.forEach(dia => {
        const membrosDisponiveis = membros.filter(m => {
            const restricaoTemp = restricoes.some(r => r.membro === m.nome && new Date(dia.data) >= new Date(r.inicio) && new Date(dia.data) <= new Date(r.fim));
            const restricaoPerm = restricoesPermanentes.some(r => r.membro === m.nome && r.diaSemana === dia.tipo);
            return !restricaoTemp && !restricaoPerm;
        });

        const qtdNecessaria = dia.tipo === 'Oração no WhatsApp' ? 1 : (dia.tipo === 'Sábado' ? 1 : quantidadeCultos);
        if (membrosDisponiveis.length < qtdNecessaria) return;

        let selecionados = [];
        if (qtdNecessaria === 1) {
            const candidatos = selecionarMembrosComAleatoriedade(membrosDisponiveis, 1, participacoes);
            if (candidatos.length > 0) selecionados = candidatos;
        } else {
            const primeiro = selecionarMembrosComAleatoriedade(membrosDisponiveis, 1, participacoes)[0];
            if (!primeiro) return;

            const membrosCompatíveis = membrosDisponiveis.filter(m =>
                m.nome !== primeiro.nome && (
                    m.genero === primeiro.genero ||
                    m.conjuge === primeiro.nome ||
                    primeiro.conjuge === m.nome
                )
            );

            const segundo = selecionarMembrosComAleatoriedade(membrosCompatíveis, 1, participacoes)[0];
            if (segundo) selecionados = [primeiro, segundo];
        }

        if (selecionados.length === qtdNecessaria) {
            dia.selecionados = selecionados;
            selecionados.forEach(m => participacoes[m.nome]++);
        }
    });

    revisarEscala(dias, participacoes);

    let escalaHTML = '<ul>';
    dias.forEach(dia => {
        if (dia.selecionados.length > 0) {
            escalaHTML += `<li>${dia.data.toLocaleDateString()} - ${dia.tipo}: ${dia.selecionados.map(m => m.nome).join(', ')}</li>`;
        }
    });
    escalaHTML += '</ul>';
    resultado.innerHTML += escalaHTML;

    let relatorio = '<h4>Relatório de Participações</h4>';
    for (const [nome, count] of Object.entries(participacoes)) {
        relatorio += `<p>${nome}: ${count} participações</p>`;
    }
    resultado.innerHTML += relatorio;
});

// Funções de Exportar/Importar
function exportarEscalaXLSX() {
    const wb = XLSX.utils.book_new();
    const dadosEscala = [['Data', 'Tipo', 'Pessoa 1', 'Pessoa 2']];
    document.querySelectorAll('#resultadoEscala ul li').forEach(li => {
        const [dataTipo, pessoas] = li.textContent.split(': ');
        const [data, tipo] = dataTipo.split(' - ');
        const nomes = pessoas.split(', ');
        dadosEscala.push([data, tipo, nomes[0], nomes[1] || '']);
    });
    const wsEscala = XLSX.utils.aoa_to_sheet(dadosEscala);
    XLSX.utils.book_append_sheet(wb, wsEscala, 'Escala');
    XLSX.writeFile(wb, 'escala.xlsx');
}

function exportarDados() {
    const dados = { membros, restricoes, restricoesPermanentes };
    const json = JSON.stringify(dados, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dados_escala.json';
    a.click();
    URL.revokeObjectURL(url);
}

function importarDados(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const dados = JSON.parse(e.target.result);
            membros = dados.membros || [];
            restricoes = dados.restricoes || [];
            restricoesPermanentes = dados.restricoesPermanentes || [];
            atualizarListaMembros();
            atualizarSelectMembros();
            atualizarListaRestricoes();
            atualizarListaRestricoesPermanentes();
            salvarDados();
            alert('Dados importados com sucesso!');
        } catch (error) {
            alert('Erro ao importar dados: ' + error.message);
        }
    };
    reader.readAsText(file);
}

// Listener de Estado de Autenticação
auth.onAuthStateChanged((user) => {
    if (user) {
        document.getElementById('logout').style.display = 'block';
        showTab('cadastro');
        carregarDados();
    } else {
        document.getElementById('logout').style.display = 'none';
        showTab('auth');
    }
});
