--- START OF FILE script.js ---

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
const exportarBtn = document.querySelector('#relatorio'); // Botão 'Exportar' (antigo 'Relatório Excel')
const importarBtn = document.querySelector('#importar');
const limparListaBtn = document.querySelector('#limparLista');
const relatorioBtn = document.querySelector('#relatorio'); // Mantendo para consistência, mesmo renomeado no HTML para 'Exportar'
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
+   "Refrigerante", "Suco", "Cerveja", "Vinho", "Sabonete", "Shampoo", "Desodorante", "Papel higiênico", "Condicionador",
+   "Pasta de dente", "Fraldas", "Lenços umedecidos", "Algodão", "Cotonetes", "Absorvente", "Protetor solar",
+   "Repelente", "Escova de cabelo", "Pente", "Creme hidratante", "Água mineral", "Sal", "Pimenta", "Azeite", "Vinagre",
+   "Molho de tomate", "Ketchup", "Mostarda", "Maionese", "Sardinha enlatada", "Atum enlatado", "Milho enlatado",
+   "Ervilha enlatada", "Cogumelos", "Azeitonas", "Picles", "Palmito", "Chocolate", "Balas", "Chiclete", "Pipoca",
     "Escova de dente", "Creme dental", "Fio dental", "Absorvente", "Preservativo", "Pilhas", "Lâmpadas",
     "Fósforos", "Velas"
 ];

@@ -418,7 +422,7 @@
 });
 
 // Exportar dados para XLSX
-exportarBtn.addEventListener('click', () => {
+relatorioBtn.addEventListener('click', () => { // 'relatorioBtn' agora lida com a exportação (antigo 'Relatório Excel')
     if (compras.length === 0) {
         mostrarFeedbackErro('Não há dados para exportar.');
         return;
@@ -441,7 +445,7 @@
     document.body.appendChild(downloadAnchor);
     downloadAnchor.click();
     downloadAnchor.remove();
-    mostrarFeedbackSucesso('Dados exportados com sucesso!');
+    mostrarFeedbackSucesso('Lista de compras exportada com sucesso!'); // Feedback de sucesso atualizado
 });
 
 // Importar dados de XLSX (com aviso em pop-up)
@@ -526,25 +530,6 @@
     }
 });
 
-// Gerar relatório Excel
-relatorioBtn.addEventListener('click', () => {
-    if (compras.length === 0) {
-        mostrarFeedbackErro('Não há dados para gerar o relatório.');
-        return;
-    }
-    const wb = XLSX.utils.book_new();
-    const wsName = "RelatorioCompras";
-    const wsData = [
-        ["Descrição", "Quantidade", "Valor Unitário (R$)", "Categoria"],
-        ...compras.map(item => [item.descricao, item.quantidade, item.valorUnitario.toFixed(2), item.categoria])
-    ];
-    const ws = XLSX.utils.aoa_to_sheet(wsData);
-    XLSX.utils.book_append_sheet(wb, ws, wsName);
-    const dataAtual = new Date().toISOString().slice(0, 10).replace(/-/g, '');
-    const nomeArquivo = `${dataAtual}_RelatorioCompras.xlsx`;
-    XLSX.writeFile(wb, nomeArquivo);
-    mostrarFeedbackSucesso('Relatório gerado!');
-});
 
 // Carregar dados ao iniciar e atualizar a barra de progresso (CORRIGIDO)
 document.addEventListener('DOMContentLoaded', () => {
@@ -577,3 +562,4 @@
 
 // Estilos dinâmicos para animações
 vozFeedback.classList.add('fade-in');
+relatorioBtn.textContent = 'Exportar'; // Renomeando o texto do botão para 'Exportar'