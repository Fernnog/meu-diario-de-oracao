# Gerenciador de Planos de Leitura

O **Gerenciador de Planos de Leitura** é uma aplicação web simples e funcional para organizar planos de leitura de livros. Ele permite criar, editar, acompanhar e gerenciar planos com base em intervalos de páginas por dia, oferecendo flexibilidade para definir períodos e periodicidade. Os dados são salvos localmente no navegador usando `localStorage`, e há opções para exportar e importar planos em formato JSON, além de exportar eventos para a agenda.

## Funcionalidades

- **Navegação Simplificada com Botões "Novo" e "Início" Aprimorados com Ícones**: A interface agora conta com botões "Novo" e "Início" no cabeçalho para facilitar a navegação intuitiva entre a criação de planos e a visualização dos planos em andamento. Os botões principais foram aprimorados com ícones para melhor reconhecimento visual:
    - **Novo Plano**: Clique no botão "Novo" (<span class="material-symbols-outlined align-text-bottom">description</span>) no cabeçalho, agora com um ícone de documento, para acessar o formulário de criação de planos de leitura. O ícone ajuda a identificar rapidamente a ação de criar um novo plano.
    - **Tela Inicial (Início)**: Utilize o botão "Início" (<span class="material-symbols-outlined align-text-bottom">home</span>), com um ícone de casa, para retornar ao painel principal, onde seus planos de leitura ativos são exibidos e gerenciados. O ícone de casa torna o botão "Início" mais facilmente identificável.
    - **Outros Botões com Ícones**: Os botões "Exportar" (<span class="material-symbols-outlined align-text-bottom">upload</span>), "Importar" (<span class="material-symbols-outlined align-text-bottom">download</span>) e "Limpar Dados" (<span class="material-symbols-outlined align-text-bottom">delete</span>) também foram atualizados com ícones correspondentes (<span class="material-symbols-outlined align-text-bottom">upload</span> para exportar, <span class="material-symbols-outlined align-text-bottom">download</span> para importar e <span class="material-symbols-outlined align-text-bottom">delete</span> para limpar dados), melhorando a clareza e a usabilidade da interface.
    O uso de ícones nos botões principais torna a interface mais intuitiva e fácil de usar, especialmente para novos usuários.

- **Paginador Flutuante com Visibilidade Inteligente para Navegação Eficiente**: Navegue facilmente entre seus planos de leitura ativos com o paginador, que agora é flutuante e posicionado logo abaixo do cabeçalho para fácil acesso. Ele exibe números correspondentes a cada plano, permitindo que você clique em um número para ir diretamente ao plano desejado, eliminando a necessidade de rolagem.  A usabilidade foi aprimorada com a **visibilidade inteligente do paginador**:
    - **Navegação Direta e Contínua**: Acesse qualquer plano rapidamente clicando no número correspondente no paginador, que está sempre ao alcance logo abaixo do cabeçalho.
    - **Visibilidade Inteligente**: O paginador se oculta automaticamente quando você rola até o final da lista de planos, garantindo que nenhum conteúdo seja encoberto. Ao rolar de volta para cima, o paginador reaparece suavemente, mantendo a navegação sempre acessível quando necessário e maximizando a visibilidade do conteúdo principal.


- **Criação de Planos Flexível**: Defina um plano de leitura especificando o título do livro, a página de início e a página de fim, o período (por datas ou número de dias) e a periodicidade (diária ou semanal com seleção de dias da semana).
- **Exibição de Intervalos Aprimorada e Visualmente Clara**: Cada dia do plano exibe claramente o intervalo de páginas a serem lidas (ex.: "Páginas 5 a 15"), calculado automaticamente. A visualização de cada dia foi aprimorada para facilitar o acompanhamento, com:
    - **Cores Alternadas**:  Linhas de dias de leitura apresentam cores de fundo alternadas, facilitando o acompanhamento visual das datas do plano.
    - **Efeito Tachado em Dias Lidos**: As datas marcadas como lidas são exibidas com um efeito tachado (riscado), indicando visualmente o cumprimento da meta de leitura para aquele dia.
- **Acompanhamento de Progresso Detalhado**:
    - **Barra de Progresso Visual**: Acompanhe o progresso de cada plano com uma barra de progresso colorida e intuitiva.
    - **Percentual e Páginas Lidas**: Veja o percentual de progresso e o número de páginas lidas em relação ao total de páginas do livro.
- **Edição e Recálculo Inteligente**:
    - **Edição de Planos**: Modifique planos de leitura existentes para ajustar metas ou corrigir informações.
    - **Recálculo de Planos Atrasados**: Recalcule automaticamente os intervalos de páginas para os dias restantes em planos atrasados, permitindo que você retome o plano de leitura de forma eficaz.
- **Gerenciamento de Dados Robusto e Versátil**:
    - **Exportação para JSON**: Exporte seus planos de leitura para um arquivo JSON para backup ou compartilhamento. Os arquivos JSON são nomeados seguindo o padrão `AAAAMMDD_HHMM_Plano de leitura de livros.json`, facilitando a organização.
    - **Importação de JSON**: Importe planos de leitura previamente salvos a partir de arquivos JSON, restaurando seus planos rapidamente.
    - **Limpeza de Dados**: Limpe todos os dados de planos de leitura armazenados no navegador com um único clique, ideal para começar de novo.
    - **Exportação para Agenda (.ICS)**: Exporte os eventos de leitura de um plano selecionado para um arquivo `.ICS`, compatível com a maioria dos aplicativos de agenda (Google Calendar, Outlook, etc.). Integre seu plano de leitura diretamente ao seu calendário para lembretes e organização.
- **Numeração de Planos**: Os planos de leitura na lista são numerados para facilitar a referência, especialmente útil ao exportar planos para a agenda.
- **Persistência Local e Segura**: Seus planos são salvos automaticamente e de forma segura no `localStorage` do navegador. Seus dados permanecem acessíveis somente no seu navegador, mesmo após fechar e reabrir a página.
- **Lembrete de 15 Minutos na Agenda**: Ao exportar para o formato ICS, eventos de leitura incluem agora um lembrete de 15 minutos antes do horário programado, garantindo que você seja notificado e se mantenha no plano.
- **Link Direto para o Gerenciador no Evento da Agenda**: Cada evento exportado para a agenda inclui um link direto para o Gerenciador de Planos de Leitura na descrição do evento. Com um clique, acesse a página do gerenciador para atualizar seu progresso ou ajustar seu plano, proporcionando uma integração perfeita entre sua agenda e o gerenciador.

## Tecnologias Utilizadas

- **HTML**: Estrutura da interface de usuário, formulários e elementos visuais.
- **CSS**: Estilização completa da página, design responsivo para visualização ideal em dispositivos móveis e desktops, cores modernas, tipografia, barras de progresso e efeitos visuais como cores alternadas e tachado.
- **JavaScript**: Lógica de interação do usuário, manipulação dinâmica do DOM, cálculos complexos para planos de leitura, gerenciamento de dados (salvamento, exportação e importação para JSON e exportação para .ICS), validações de formulário e funcionalidades interativas da página.
- **Material Symbols**: Biblioteca de ícones para interface, utilizada para o ícone de "Agenda" no botão de exportação e ícones de navegação.

## Instalação

1. **Utilize diretamente no navegador**:
   - A forma mais simples é abrir o arquivo `index.html` diretamente em seu navegador web. Não requer instalação ou configuração de servidores.

2. **Clone o Repositório** (opcional, para desenvolvimento ou modificação):
   ```bash
   git clone https://github.com/seu-usuario/gerenciador-planos-leitura.git # Substitua pelo link do seu repositório
   cd gerenciador-planos-leitura
   # Abra o arquivo index.html no seu navegador
