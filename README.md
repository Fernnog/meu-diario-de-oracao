# Meus Alvos de Oração

Bem-vindo ao **Meus Alvos de Oração**, uma aplicação web desenvolvida para ajudar usuários a gerenciar e acompanhar seus alvos de oração de forma organizada e espiritual. Com esta ferramenta, você pode adicionar, editar, arquivar e orar por seus alvos, acompanhar seu progresso diário com o painel "Alvos de Oração do Dia", visualizar sua perseverança e consultar um relatório detalhado.

Este projeto foi construído com HTML, CSS e JavaScript, utilizando o **Firebase** como backend para autenticação, armazenamento de dados e persistência em tempo real.

## Funcionalidades

-   **Gerenciamento de Alvos de Oração**:
    -   Adicione novos alvos com título, detalhes, data de criação, categoria (opcional) e prazo (opcional).
    -   Edite detalhes, prazo ou categoria de alvos existentes (ativos ou arquivados).
    -   Adicione observações datadas a qualquer alvo.
    -   Arquive alvos concluídos ou não mais relevantes, com a opção de marcá-los como "Respondido".
    -   Exclua permanentemente alvos arquivados.
    -   Acompanhe o tempo decorrido desde a criação de cada alvo.
    -   Visualize alvos ativos, arquivados ou respondidos em painéis separados com busca e paginação.
    -   Filtre alvos ativos por prazo (existente ou vencido).

-   **Alvos de Oração do Dia**:
    -   Um painel que exibe até 10 alvos de oração ativos por dia.
    -   **Seleção Inteligente**: O sistema seleciona alvos aleatoriamente, priorizando aqueles que não foram apresentados recentemente ou orados há mais tempo, buscando distribuir as orações entre todos os alvos ativos ao longo do tempo.
    -   **Persistência Diária**: A lista do dia (incluindo o estado "Orado") é salva no Firebase, garantindo consistência mesmo após recarregar a página ou navegar.
    -   **Botão "Orei!"**: Marca um alvo como concluído *para aquele dia*. A interação atualiza as estatísticas de perseverança (barra e quadro semanal) e a contagem de orações do alvo. Alvos concluídos são movidos para uma seção separada no painel do dia.
    -   **Adição Manual**: Um botão "Adicionar Alvo Manualmente" permite ao usuário buscar e incluir qualquer alvo *ativo* na lista do dia atual, caso ele não tenha sido selecionado aleatoriamente. A interação com alvos adicionados manualmente também conta para as estatísticas.
    -   **Controles Adicionais**: Botões para gerar uma nova lista para o dia (substituindo a atual), copiar os alvos pendentes para a área de transferência e gerar uma visualização detalhada dos alvos do dia.

-   **Acompanhamento de Perseverança**:
    -   **Barra de Dias Consecutivos**: Uma barra de progresso visualiza a sequência atual de dias em que o usuário interagiu (clicou em "Orei!") com pelo menos um alvo, comparado a uma meta (ex: 30 dias). Também exibe o recorde de dias consecutivos.
    -   **Quadro Semanal**: Exibe visualmente os dias da semana atual (Dom-Sáb) em que houve pelo menos uma interação ("Orei!").
    -   Atualização automática ao clicar em "Orei!".

-   **Relatório de Perseverança (`orei.html`)**:
    -   Uma página separada que lista **todos** os alvos do usuário (ativos, arquivados, respondidos).
    -   Permite filtrar os alvos por status (Ativo, Arquivado, Respondido) e pesquisar por texto (título, detalhe).
    -   Exibe a **contagem total** de cliques "Orei!" registrada para cada alvo ao longo do tempo.
    -   Inclui paginação para facilitar a navegação.

-   **Visualizações**:
    -   Opção de gerar uma visualização HTML (em nova aba) da lista de alvos atualmente exibida em qualquer painel (ativos, arquivados, respondidos).
    -   Opção de gerar uma visualização HTML (em nova aba) dos alvos respondidos dentro de um período de datas selecionado pelo usuário.
    -   Opção de gerar uma visualização HTML (em nova aba) detalhada dos alvos do dia (pendentes e concluídos).

-   **Versículos Inspiradores**:
    -   Exibe um versículo bíblico aleatório na seção "Alvos de Oração do Dia" para inspirar a oração.

-   **Autenticação**:
    -   Login e cadastro seguros via Firebase Authentication (e-mail/senha).
    -   Opção de "Esqueci minha senha" para redefinição via e-mail.
    -   Status de autenticação visível e botão de logout.

-   **Persistência e Sincronização**:
    -   Todos os dados (alvos ativos, arquivados, listas diárias, contagens de cliques, dados de perseverança) são salvos no Firebase Firestore, garantindo sincronização e acesso de qualquer dispositivo.

## Tecnologias Utilizadas

-   **Frontend**:
    -   HTML5, CSS3, JavaScript (ES6+ Modules)
    -   Interface responsiva

-   **Backend**:
    -   Firebase Authentication (autenticação de usuários via e-mail/senha)
    -   Firebase Firestore (banco de dados NoSQL para armazenamento de dados)
    -   Firebase Hosting (hospedagem da aplicação - se utilizada)

## Como Configurar o Projeto Localmente

### Pré-requisitos

-   Conta no Firebase
-   Um editor de código (ex.: VS Code)
-   Um servidor web local para servir os arquivos (ou usar o Firebase Hosting/Emulator)

### Passos para Configuração

1.  **Clone o Repositório** (ou baixe os arquivos):
    Obtenha os arquivos `index.html`, `orei.html`, `script.js`, `orei.js`, `styles.css`, `orei.css` e a imagem `logo.png`.

2.  **Configure o Firebase**:
    -   Crie um projeto no [Firebase Console](https://console.firebase.google.com/).
    -   Habilite o **Firebase Authentication** e ative o provedor de **E-mail/senha**.
    -   Habilite o **Firestore Database** no modo de produção (recomendado) e configure as regras de segurança adequadamente (inicialmente pode usar regras de teste, mas não é seguro para produção).
    -   Vá para as Configurações do Projeto > Geral > Seus apps > Web app.
    -   Copie o objeto de configuração do Firebase (`firebaseConfig`).

3.  **Adicione as Credenciais do Firebase**:
    -   Abra os arquivos `script.js` e `orei.js`.
    -   Localize a constante `firebaseConfig` no início de cada arquivo.
    -   Substitua as credenciais de exemplo pelas credenciais do *seu* projeto Firebase:
        ```javascript
        const firebaseConfig = {
          apiKey: "SUA_API_KEY",
          authDomain: "SEU_AUTH_DOMAIN",
          projectId: "SEU_PROJECT_ID",
          storageBucket: "SEU_STORAGE_BUCKET",
          messagingSenderId: "SEU_MESSAGING_SENDER_ID",
          appId: "SEU_APP_ID",
          measurementId: "SEU_MEASUREMENT_ID" // Opcional, mas bom ter
        };
        ```
    -   **Importante:** Faça isso em **ambos** os arquivos (`script.js` e `orei.js`).

4.  **Estrutura do Firestore**:
    O projeto utiliza as seguintes coleções no Firestore:
    -   `users/{userId}/prayerTargets`: Armazena os alvos de oração ativos do usuário.
        -   Campos: `title`, `details`, `date` (Timestamp), `category` (String/null), `hasDeadline` (Boolean), `deadlineDate` (Timestamp/null), `observations` (Array de {text, date, id}), `lastPresentedDate` (Timestamp/null), `userId`.
    -   `users/{userId}/archivedTargets`: Armazena os alvos arquivados/respondidos.
        -   Campos: Mesmos de `prayerTargets` + `archived` (Boolean), `archivedDate` (Timestamp), `resolved` (Boolean), `resolutionDate` (Timestamp/null).
    -   `prayerClickCounts/{targetId}`: Registra a contagem de cliques "Orei!" por alvo.
        -   Campos: `targetId`, `userId`, `totalClicks` (Number), `monthlyClicks.{YYYY-MM}` (Number), `yearlyClicks.{YYYY}` (Number).
    -   `dailyPrayerTargets/{userId_YYYY-MM-DD}`: Armazena a lista de alvos para um usuário específico em um dia específico.
        -   Campos: `userId`, `date` (String "YYYY-MM-DD"), `targets` (Array de {`targetId`, `completed` (Boolean), `manuallyAdded`? (Boolean)}).
    -   `perseveranceData/{userId}`: Armazena os dados da barra de progresso de dias consecutivos.
        -   Campos: `userId`, `consecutiveDays` (Number), `recordDays` (Number), `lastInteractionDate` (Timestamp).
    -   `weeklyInteractions/{userId}`: Armazena os dias da semana atual em que houve interação.
        -   Campos: `userId`, `weekId` (String "YYYY-W##"), `interactions` (Map { "YYYY-MM-DD": true }).

5.  **Execute Localmente**:
    -   Use uma extensão como "Live Server" no VS Code ou configure um servidor web simples (como `python -m http.server`) para servir os arquivos a partir do diretório onde eles estão.
    -   Acesse a aplicação pelo endereço fornecido pelo servidor local (ex: `http://127.0.0.1:8080` ou `http://localhost:5500`).

6.  **Teste a Aplicação**:
    -   Abra o navegador e acesse a URL local.
    -   Crie uma conta ou faça login.
    -   Adicione, edite e arquive alvos de oração.
    -   Verifique o painel "Alvos de Oração do Dia", clique em "Orei!", use o botão "Adicionar Alvo Manualmente".
    -   Observe a barra de progresso e o quadro semanal.
    -   Acesse o "Relatório de Perseverança".

## Como Usar

1.  **Faça Login/Cadastre-se**:
    -   Use seu e-mail e senha. Crie uma conta se for seu primeiro acesso.

2.  **Navegue pelos Painéis**:
    -   Use os botões do menu principal para alternar entre:
        -   **Página Inicial**: Exibe os "Alvos de Oração do Dia", o quadro semanal e a barra de perseverança.
        -   **Novo Alvo**: Exibe o formulário para adicionar um novo alvo.
        -   **Ver Todos os Alvos**: Mostra a lista de alvos ativos.
        -   **Ver Arquivados**: Mostra a lista de alvos arquivados (incluindo os respondidos).
        -   **Ver Respondidos**: Mostra apenas os alvos marcados como respondidos.

3.  **Adicione e Gerencie Alvos**:
    -   No painel "Novo Alvo", preencha os detalhes e salve.
    -   Nos painéis de listagem (Ativos, Arquivados, Respondidos), use os botões em cada alvo para:
        -   Marcar como **Respondido** (move para Arquivados).
        -   **Arquivar** (move para Arquivados).
        -   Adicionar/Ver **Observações**.
        -   Editar **Prazo** (apenas ativos).
        -   Editar **Categoria**.
        -   **Excluir Permanentemente** (apenas arquivados).

4.  **Use o Painel "Alvos de Oração do Dia"**:
    -   Veja os alvos selecionados para o dia e o versículo inspirador.
    -   Clique em **"Orei!"** para marcar um alvo como concluído no dia e atualizar suas estatísticas.
    -   Se precisar orar por um alvo específico não listado, clique em **"Adicionar Alvo Manualmente"**, pesquise e selecione o alvo desejado para incluí-lo na lista do dia.
    -   Use os outros botões ("Atualizar", "Copiar", "Visualizar") conforme necessário.

5.  **Acompanhe o Progresso**:
    -   Observe a **barra de dias consecutivos** e o **quadro semanal** na Página Inicial.
    -   Acesse o **"Relatório de Perseverança"** (botão no menu secundário) para ver a contagem total de orações por alvo e filtrar/pesquisar em toda a sua lista.

6.  **Gere Visualizações**:
    -   Use os botões "Gerar Visualização Atual" ou "Visualizar Respondidos (Período)" para abrir um resumo formatado em uma nova aba, útil para impressão ou compartilhamento simples.
