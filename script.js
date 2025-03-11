// Seleção de elementos do DOM
const vozInput = document.querySelector('#vozInput');
const ativarVoz = document.querySelector('#ativarVoz');
const inserirItem = document.querySelector('#inserirItem');
const limparInput = document.querySelector('#limparInput');
const vozFeedback = document.querySelector('.voz-feedback');
const listaCompras = document.querySelector('#listaCompras');
const totalValorPainel = document.querySelector('#totalValorPainel');
const totalValor = document.querySelector('#totalValor');
const orcamentoInput = document.querySelector('#orcamento');
const categoriaFiltro = document.querySelector('#categoriaFiltro');
const modalEdicao = document.querySelector('#modalEdicao');
const fecharModalBtn = document.querySelector('.fechar-modal');
const editarDescricao = document.querySelector('#editarDescricao');
const editarQuantidade = document.querySelector('#editarQuantidade');
const editarValor = document.querySelector('#editarValor');
const salvarEdicaoBtn = document.querySelector('#salvarEdicao');
const importarBtn = document.querySelector('#importar');
const limparListaBtn = document.querySelector('#limparLista');
const relatorioBtn = document.querySelector('#relatorio');
const barraProgresso = document.getElementById('barraProgresso');
const porcentagemProgresso = document.getElementById('porcentagemProgresso');

// Lista de compras e índice do item sendo editado
let compras = JSON.parse(localStorage.getItem('compras')) || [];
let itemEditandoIndex = null;

// Lista de sugestões para autocomplete (expandida)
const listaSugestoes = [
    "Água sanitária", "Detergente", "Vassoura", "Saco de lixo", "Sabão em pó", "Amaciante", "Esponja", "Papel toalha",
    "Arroz", "Feijão", "Macarrão", "Banana", "Tomate", "Biscoito", "Leite", "Queijo", "Manteiga", "Pão", "Café",
    "Açúcar", "Óleo de cozinha", "Farinha de trigo", "Ovos", "Carne bovina", "Frango", "Peixe", "Batata", "Cebola",
    "Alho", "Maçã", "Laranja", "Uva", "Morango", "Cenoura", "Beterraba", "Brócolis", "Espinafre", "Iogurte",
    "Refrigerante", "Suco", "Cerveja", "Vinho", "Sabonete", "Shampoo", "Desodorante", "Papel higiênico",
    "Escova de dente", "Creme dental", "Fio dental", "Absorvente", "Preservativo", "Pilhas", "Lâmpadas",
    "Fósforos", "Velas"
];

// Função para inferir categoria automaticamente
function inferirCategoria(descricao) {
    const categorias = {
        Alimentos: ['arroz', 'feijão', 'macarrão', 'banana', 'tomate', 'biscoito', 'leite', 'queijo', 'manteiga', 'pão',
            'café', 'açúcar', 'óleo', 'farinha', 'ovos', 'carne', 'frango', 'peixe', 'batata', 'cebola', 'alho',
            'maçã', 'laranja', 'uva', 'morango', 'cenoura', 'beterraba', 'brócolis', 'espinafre', 'iogurte',
            'refrigerante', 'suco', 'cerveja', 'vinho'],
        Limpeza: ['água sanitária', 'detergente', 'vassoura', 'saco de lixo', 'sabão em pó', 'amaciante', 'esponja',
            'papel toalha'],
        'Higiene Pessoal': ['sabonete', 'shampoo', 'desodorante', 'papel higiênico', 'escova de dente', 'creme dental',
            'fio dental', 'absorvente', 'preservativo'],
        Outros: ['pilhas', 'lâmpadas', 'fósforos', 'velas']
    };
    descricao = descricao.toLowerCase();
    for (const [categoria, palavras] of Object.entries(categorias)) {
        if (palavras.some(palavra => descricao.includes(palavra))) {
            return categoria;
        }
    }
    return 'Outros'; // Já está implementado para itens não mapeados
}

// Configurar autocomplete com Awesomplete
new Awesomplete(vozInput, {
    list: listaSugestoes,
    filter: function(text, input) {
        return Awesomplete.FILTER_CONTAINS(text, input.match(/[^,]*$/)[0]);
    },
    replace: function(text) {
        const before = this.input.value.match(/^.+,\s*|/)[0];
        this.input.value = before ? before + text + ", " : text;
    },
    minChars: 1
});

// Traduz a mensagem do Awesomplete
document.addEventListener('DOMContentLoaded', () => {
    const awesompleteMessage = document.querySelector('.awesomplete > ul:empty::before');
    if (awesompleteMessage) {
        awesompleteMessage.textContent = 'Digite 1 ou mais caracteres para resultados.';
    } else {
        // Caso o elemento não seja encontrado diretamente, observamos mudanças
        const observer = new MutationObserver(() => {
            const message = document.querySelector('.awesomplete > ul:empty::before');
            if (message) {
                message.textContent = 'Digite 1 ou mais caracteres para resultados.';
                observer.disconnect();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }
});

// Feedback visual em tempo real
vozInput.addEventListener('input', () => {
    vozFeedback.textContent = vozInput.value || '';
    vozFeedback.style.display = vozInput.value ? 'block' : 'none';
    vozFeedback.style.opacity = vozInput.value ? '1' : '0';
    vozFeedback.classList.toggle('fade-in', !!vozInput.value);
});

// Função auxiliar para converter números escritos em português para numéricos
function parseNumber(texto) {
    const numerosEscritos = {
        'um': 1, 'dois': 2, 'três': 3, 'quatro': 4, 'cinco': 5,
        'seis': 6, 'sete': 7, 'oito': 8, 'nove': 9, 'dez': 10
    };
    texto = texto.toLowerCase().trim();
    return numerosEscritos[texto] || parseInt(texto) || 1;
}

// Função para processar e adicionar item (VERSÃO SUPER TOLERANTE)
function processarEAdicionarItem(texto) {
    texto = texto.toLowerCase().trim();

    // Regex super tolerante para marcadores
    const regexMarcadores = /^\s*quantidade\s+(.+?)\s+descri[cç][aã]o\s+(.+?)\s+pre[cç]o\s+([\d,\s]+?)(?:\s*(reais|real))?\s*$/i;
    const matchMarcadores = texto.match(regexMarcadores);

    // Regex para o formato natural (mantida, mas você disse que o foco são os marcadores)
    const regexNatural = /^(\d+|um|dois|três|quatro|cinco|seis|sete|oito|nove|dez)\s*([\w\s]+(?:de\s[\w\s]+)?)(?:\s*(kg|quilos?|unidades?|biscoitos?))?\s*(?:a|por)\s*([\d,]+)(?:\s*(reais|real))?(?:\s*cada)?$/i;
    const matchNatural = texto.match(regexNatural);

    let quantidade, descricao, valorUnitario;

    if (matchMarcadores) {
        // 1. QUANTIDADE:  Pega TUDO depois de "quantidade" até "descrição"
        quantidade = matchMarcadores[1].trim(); // Pega tudo, sem se preocupar com o formato
        quantidade = parseNumber(quantidade);   // Usa a função parseNumber para converter

        // 2. DESCRIÇÃO: Pega TUDO depois de "descrição" até "preço"
        descricao = matchMarcadores[2].trim();   // Pega tudo e remove espaços extras

        // 3. PREÇO: Pega TUDO depois de "preço" até o final (ou "reais")
        valorUnitario = parseFloat(matchMarcadores[3].replace(/\s/g, '').replace(',', '.')) || 0;

        console.log("Marcadores (Super Tolerante):", quantidade, descricao, valorUnitario); // Debug

    } else if (matchNatural) { // Mantido o formato natural, caso precise
       quantidade = parseNumber(matchNatural[1]);
        descricao = matchNatural[2].trim().replace(/(kg|quilos?|unidades?|biscoitos?)$/, '').replace(/^de\s/, '').trim();
        valorUnitario = parseFloat(matchNatural[4].replace(/\s/g, '').replace(',', '.')) || 0;
        console.log("Natural:", quantidade, descricao, valorUnitario);

    } else {
        mostrarFeedbackErro('Formato de comando de voz não reconhecido. Use "quantidade X descrição Y preço Z" ou "X [produto] por Z".');
        return;
    }

    // VALIDAÇÕES (mantidas)
    if (!descricao) {
        mostrarFeedbackErro('A descrição não pode estar vazia.');
        return;
    }
    if (valorUnitario <= 0) {
        mostrarFeedbackErro('Valor unitário inválido. Insira um valor maior que zero.');
        return;
    }

    // CRIAÇÃO DO ITEM E ADIÇÃO
    const categoria = inferirCategoria(descricao);
    const novoItem = { descricao, quantidade, valorUnitario, categoria };
    compras.push(novoItem);
    atualizarLista();
    salvarDados();
    vozInput.value = '';
    mostrarFeedbackSucesso('Item adicionado!');
}

// Funções auxiliares para feedback (evita repetição)
function mostrarFeedbackSucesso(mensagem) {
    vozFeedback.textContent = mensagem;
    vozFeedback.classList.add('success-fade');
    vozFeedback.classList.remove('error-fade'); // Garante que a classe de erro seja removida
    setTimeout(() => vozFeedback.classList.remove('success-fade'), 2000);
}

function mostrarFeedbackErro(mensagem) {
    vozFeedback.textContent = mensagem;
    vozFeedback.classList.add('error-fade');
    vozFeedback.classList.remove('success-fade'); // Garante que a classe de sucesso seja removida
    setTimeout(() => vozFeedback.classList.remove('error-fade'), 2000);
}

// Botão de microfone para ativar ditado no input principal
ativarVoz.addEventListener('click', () => {
    vozInput.focus();
    mostrarFeedbackSucesso('Fale agora...');
});

// Botão para inserir item (input principal)
inserirItem.addEventListener('click', () => {
    if (vozInput.value.trim()) {
        processarEAdicionarItem(vozInput.value);
    } else {
        mostrarFeedbackErro('Digite ou dite algo primeiro!');
    }
});

// Botão para limpar o campo de input principal
limparInput.addEventListener('click', () => {
    vozInput.value = '';
    mostrarFeedbackSucesso('Campo limpo!'); // Usa a função auxiliar
});

// Atualizar lista de compras (COM BOTÃO DE EXCLUIR E CORREÇÃO DO EVENTO DE CLIQUE)
function atualizarLista(filtrados = compras) {
    listaCompras.innerHTML = '';
    let total = 0;
    filtrados.forEach((item, index) => {
        const li = document.createElement('li');
        // Adiciona o botão de excluir
        let buttonClass = "excluir-item";
        if (item.valorUnitario <= 0) {
            buttonClass += " sem-valor"; // Adiciona classe 'sem-valor' se o valor for zero
        }
        li.innerHTML = `
            ${item.quantidade}x ${item.descricao} - R$ ${item.valorUnitario.toFixed(2).replace('.', ',')} (${item.categoria})
            <button class="${buttonClass}" data-index="${index}">🗑️</button>
        `; // Usa o ícone de lixeira e aplica a classe condicional

        li.classList.add('fade-in');

        // ADICIONA O EVENT LISTENER *DENTRO* DO LOOP (correção)
        li.addEventListener('click', (event) => {
            // Verifica se o clique NÃO foi no botão de excluir
            if (!event.target.classList.contains('excluir-item')) {
                editarItem(index);
            }
        });

        listaCompras.appendChild(li);
        total += item.quantidade * item.valorUnitario;
        setTimeout(() => li.style.opacity = 1, 10);
    });
    totalValorPainel.textContent = total.toFixed(2).replace('.', ',');
    totalValor.textContent = total.toFixed(2).replace('.', ',');
    verificarOrcamento(total); // Atualiza a barra de progresso
}

// Event listener para o botão de excluir (USANDO DELEGAÇÃO DE EVENTOS - CORRETO)
listaCompras.addEventListener('click', (event) => {
    if (event.target.classList.contains('excluir-item')) {
        const index = parseInt(event.target.dataset.index);
        if (confirm(`Tem certeza que deseja excluir "${compras[index].descricao}"?`)) {
            compras.splice(index, 1);
            atualizarLista();
            salvarDados();
            mostrarFeedbackSucesso('Item excluído!');
        }
    }
});

// Verificar orçamento e atualizar barra de progresso (CORRIGIDO)
function verificarOrcamento(total) {
    const orcamento = parseFloat(orcamentoInput.value.replace(',', '.')) || 0;
    let porcentagem = 0;

    if (orcamento > 0) {
        porcentagem = (total / orcamento) * 100;
        porcentagem = Math.min(porcentagem, 100); // Garante que não ultrapasse 100%
        barraProgresso.value = porcentagem;
        porcentagemProgresso.textContent = `${porcentagem.toFixed(1)}%`;

        // Muda a cor da barra dependendo da porcentagem
        if (porcentagem > 80) {
            barraProgresso.style.setProperty('--webkit-progress-value-background-color', 'orange', 'important');
        }
        if (porcentagem >= 100) {
            barraProgresso.style.setProperty('--webkit-progress-value-background-color', 'red', 'important');
        }
        if (porcentagem <= 80) {
            barraProgresso.style.setProperty('--webkit-progress-value-background-color', '#4CAF50', 'important');
        }
    } else {
        barraProgresso.value = 0; // Zera a barra se não houver orçamento
        porcentagemProgresso.textContent = "0%";
        barraProgresso.style.setProperty('--webkit-progress-value-background-color', '#4CAF50', 'important');
    }

    if (total > orcamento && orcamento > 0) {
        document.querySelector('#painelTotal').style.backgroundColor = '#ffcccc'; // Muda a cor do painel
        setTimeout(() => document.querySelector('#painelTotal').style.backgroundColor = '#f8f8f8', 2000); // Volta ao normal após 2 segundos
    }
}

// Salvar dados no localStorage
function salvarDados() {
    localStorage.setItem('compras', JSON.stringify(compras));
    localStorage.setItem('orcamento', orcamentoInput.value); // Salva o orçamento também
}

// Filtrar por categoria
categoriaFiltro.addEventListener('change', () => {
    const categoria = categoriaFiltro.value;
    const filtrados = categoria ? compras.filter(item => item.categoria === categoria) : compras;
    atualizarLista(filtrados);
});

// Editar item
function editarItem(index) {
    itemEditandoIndex = index;
    const item = compras[index];
    editarDescricao.value = item.descricao;
    editarQuantidade.value = item.quantidade;
    editarValor.value = item.valorUnitario.toFixed(2).replace('.', ',');
    modalEdicao.style.display = 'block';
    modalEdicao.classList.add('slide-in');

    // Adiciona listeners de clique aos botões de microfone no modal de edição
    const micBtnDescricao = modalEdicao.querySelector('#editarDescricao + .mic-btn');
    const micBtnQuantidade = modalEdicao.querySelector('#editarQuantidade + .mic-btn');
    const micBtnValor = modalEdicao.querySelector('#editarValor + .mic-btn');

    micBtnDescricao.onclick = () => editarCampoComVoz('editarDescricao');
    micBtnQuantidade.onclick = () => editarCampoComVoz('editarQuantidade');
    micBtnValor.onclick = () => editarCampoComVoz('editarValor');
}

// Função para editar campo com voz dentro do modal
function editarCampoComVoz(campoId) {
    const inputElement = document.getElementById(campoId);
    inputElement.focus();

    const recognition = new webkitSpeechRecognition() || new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
        mostrarFeedbackSucesso(`Fale para editar ${campoId.replace('editar', '').toLowerCase()}...`);
    };

    recognition.onresult = (event) => {
        const result = event.results[0][0].transcript;
        inputElement.value = result;
        mostrarFeedbackSucesso(`${campoId.replace('editar', '').toLowerCase()} alterado para: ${result}`);
    };

    recognition.onerror = (event) => {
        mostrarFeedbackErro('Erro no reconhecimento de voz.');
        console.error('Speech recognition error:', event.error);
    };

    recognition.onend = () => {
        // No need to show "Falar novamente" feedback here, as it might be confusing in modal context
    };

    recognition.start();
}


// Salvar edição
salvarEdicaoBtn.addEventListener('click', () => {
    if (itemEditandoIndex !== null) {
        const novaDescricao = editarDescricao.value.trim();
        const novaQuantidade = parseInt(editarQuantidade.value) || 1;
        const novoValorUnitario = parseFloat(editarValor.value.replace(',', '.')) || 0;

        // Validações mais robustas
        if (!novaDescricao) {
            alert('A descrição não pode estar vazia.');
            return;
        }
        if (novaQuantidade <= 0) {
            alert('A quantidade deve ser maior que zero.');
            return;
        }
        if (novoValorUnitario <= 0) {
            alert('Valor unitário inválido. Insira um valor maior que zero.');
            return;
        }

        const novaCategoria = inferirCategoria(novaDescricao);
        compras[itemEditandoIndex] = { descricao: novaDescricao, quantidade: novaQuantidade, valorUnitario: novoValorUnitario, categoria: novaCategoria };
        modalEdicao.style.display = 'none';
        modalEdicao.classList.remove('slide-in');
        atualizarLista();
        salvarDados();
        mostrarFeedbackSucesso('Item editado!');
    }
});

// Fechar modal
fecharModalBtn.addEventListener('click', () => {
    modalEdicao.style.display = 'none';
    modalEdicao.classList.remove('slide-in');
});

window.addEventListener('click', (event) => {
    if (event.target === modalEdicao) {
        modalEdicao.style.display = 'none';
        modalEdicao.classList.remove('slide-in');
    }
});

// Formatar valor em tempo real no input de edição de valor
editarValor.addEventListener('input', function() {
    let valor = this.value;
    valor = valor.replace(/\D/g, '');
    valor = valor.replace(/(\d{1,})(\d{2})$/, "$1,$2");
    this.value = valor;
});

// Importar dados de XLSX (com aviso em pop-up)
importarBtn.addEventListener('click', () => {
    // Mostra o modal de aviso de importação
    const modalImportInfo = document.getElementById('modalImportInfo');
    modalImportInfo.style.display = 'block';

    // Adiciona evento ao botão "Continuar" para prosseguir com a importação
    const continuarImport = document.getElementById('continuarImport');
    continuarImport.onclick = () => {
        modalImportInfo.style.display = 'none';

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.xlsx'; // Alterado para aceitar arquivos XLSX
        input.onchange = (e) => {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const workbook = XLSX.read(e.target.result, { type: 'binary' });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const excelData = XLSX.utils.sheet_to_json(worksheet);

                    // Mapear e validar os dados da planilha
                    compras = excelData.map(row => {
                        const quantidade = Number(row['Quantidade']) || 1; // Garante que seja número, padrão 1 se inválido
                        const valorUnitario = Number(String(row['Valor Unitário (R$)']).replace(',', '.')) || 0; // Converte para número
                        return {
                            descricao: row['Descrição'] || 'Sem descrição',
                            quantidade: quantidade,
                            valorUnitario: valorUnitario,
                            categoria: row['Categoria'] || inferirCategoria(row['Descrição']) // Categoria ou inferir
                        };
                    });

                    atualizarLista();
                    salvarDados();
                    mostrarFeedbackSucesso('Dados importados!');
                } catch (error) {
                    console.error("Erro ao importar XLSX:", error);
                    mostrarFeedbackErro('Erro ao importar ou processar o arquivo XLSX.');
                }
            };
            reader.readAsBinaryString(file); // Usar readAsBinaryString para XLSX
        };
        input.click();
    };

    // Fecha o modal ao clicar no "×"
    const fecharModal = document.querySelector('#modalImportInfo .fechar-modal');
    fecharModal.onclick = () => {
        modalImportInfo.style.display = 'none';
    };

    // Fecha o modal ao clicar fora dele
    window.addEventListener('click', (event) => {
        if (event.target === modalImportInfo) {
            modalImportInfo.style.display = 'none';
        }
    });
});

// Limpar lista
limparListaBtn.addEventListener('click', () => {
    if (confirm('Tem certeza que deseja limpar a lista?')) {
        compras = [];
        atualizarLista();
        salvarDados();
        mostrarFeedbackSucesso('Lista limpa!');
    }
});

// Gerar relatório Excel
relatorioBtn.addEventListener('click', () => {
    if (compras.length === 0) {
        mostrarFeedbackErro('Não há dados para gerar o relatório.');
        return;
    }
    const wb = XLSX.utils.book_new();
    const wsName = "RelatorioCompras";
    const wsData = [
        ["Descrição", "Quantidade", "Valor Unitário (R$)", "Categoria"],
        ...compras.map(item => [item.descricao, item.quantidade, item.valorUnitario.toFixed(2), item.categoria])
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, wsName);
    // Define propriedades para forçar o download e nome do arquivo
    const dataAtual = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const wbout = XLSX.write(wb, { bookType:'xlsx', type:'array' });
    const blob = new Blob([wbout], {type:"application/octet-stream"});
    const downloadLink = document.createElement('a');
    downloadLink.href = URL.createObjectURL(blob);
    downloadLink.download = `${dataAtual}_RelatorioCompras.xlsx`;
    const nomeArquivo = `${dataAtual}_RelatorioCompras.xlsx`;
    XLSX.writeFile(wb, nomeArquivo);
    mostrarFeedbackSucesso('Relatório gerado!');
});

// Carregar dados ao iniciar e atualizar a barra de progresso (CORRIGIDO)
document.addEventListener('DOMContentLoaded', () => {
    carregarDados();
    atualizarLista();
    // Atualiza a barra DEPOIS de carregar os dados e atualizar a lista
    const total = parseFloat(totalValor.textContent.replace(',', '.')) || 0;
    verificarOrcamento(total);
});

// Atualiza a barra de progresso sempre que o orçamento for alterado (CORRIGIDO)
orcamentoInput.addEventListener('input', () => {
    const total = parseFloat(totalValor.textContent.replace(',', '.')) || 0; // Pega o total *atual* da lista
    verificarOrcamento(total);
    salvarDados();
});

// Função auxiliar para carregar dados e converter formato antigo
function carregarDados() {
    const orcamentoSalvo = localStorage.getItem('orcamento');
    if (orcamentoSalvo) orcamentoInput.value = orcamentoSalvo.replace('.', ',');
    compras = JSON.parse(localStorage.getItem('compras')) || [];
    compras.forEach(item => {
        if (item.valor && !item.valorUnitario) {
            item.valorUnitario = item.valor / item.quantidade;
            delete item.valor;
        }
    });
    salvarDados();
}

// Estilos dinâmicos para animações
vozFeedback.classList.add('fade-in');
