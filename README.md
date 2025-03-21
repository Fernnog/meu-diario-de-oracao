# Diário de Oração Digital - Meus Alvos de Oração

## Descrição

Este projeto é um diário de oração digital pessoal, desenvolvido para ajudar você a registrar, organizar e acompanhar seus alvos de oração. ... **Inclui agora duas ferramentas visuais motivadoras na página inicial para acompanhar a consistência na prática diária da oração: uma barra de progresso "Perseverança na Intercessão" e um quadro semanal "Sua Semana de Perseverança".**

**A barra de progresso "Perseverança na Intercessão", visualmente aprimorada com um indicador de porcentagem à esquerda em fundo verde e a meta de dias à direita em fundo claro, oferece um acompanhamento motivador da sua jornada de oração de longo prazo.**  Abaixo dela, o botão "Confirmar Perseverança" permite registrar sua interação diária com o diário.

**Logo acima da barra de progresso, o novo quadro semanal "Sua Semana de Perseverança" exibe visualmente sua consistência nos últimos 7 dias.** Cada dia da semana é representado, e um "tick" verde aparece nos dias em que você confirmou a perseverança. Este quadro, que surge dinamicamente quando você inicia sua jornada de perseverança, oferece uma visão rápida e encorajadora do seu progresso semanal.

Com um sistema de contas de usuário para privacidade, o aplicativo oferece um espaço dedicado para detalhar seus pedidos, definir prazos e acompanhar o progresso de suas orações.

**Propósito:** Facilitar a prática consistente da oração, permitindo que você visualize e reflita sobre suas orações e as respostas divinas ao longo do tempo, e agora também, **acompanhar visualmente sua perseverança na intercessão tanto em uma perspectiva de longo prazo com a barra de progresso, quanto semanalmente com o novo quadro de dias da semana.**

## Funcionalidades Principais

*   **Contas de Usuário:** Sistema de autenticação para garantir a privacidade e organização individual de cada usuário.
*   **Cadastro Detalhado de Alvos de Oração:**
    *   Definição de título e descrição completa para cada pedido.
    *   Registro da data de início do alvo de oração.
    *   Opção de definir datas de validade para pedidos com prazos específicos.
*   **Seção "Alvos de Oração do Dia":** Exibe uma seleção rotativa diária de até 10 pedidos, incentivando a oração focada e variada.
    *   Botão interativo "Orei!" para registrar a prática da oração diária para cada alvo.
*   **Gestão e Revisão de Pedidos:**
    *   Visualização de todos os alvos em uma lista completa.
    *   Funcionalidades para arquivar e marcar alvos como "Respondidos".
    *   Seções dedicadas para "Ver Arquivados" e "Ver Respondidos" para organizar orações passadas.
    *   Ferramentas de busca e paginação para facilitar a localização de pedidos específicos.
*   **Geração de Visualizações e Relatórios:**
    *   Geração de visualizações gerais e de orações respondidas em formato HTML para compartilhamento e arquivamento.
    *   Relatório de "Perseverança nas Orações" que computa a frequência de cliques no botão "Orei!" por alvo, oferecendo uma visão da dedicação à oração.
*   **Barra de Progresso "Perseverança na Intercessão" e Quadro Semanal "Sua Semana de Perseverança":** Um conjunto de ferramentas visuais na página inicial que registram a interação diária com o diário de oração, incentivando a consistência e estabelecendo metas de perseverança.
    *   **Barra de Progresso Aprimorada:** Apresenta visualmente o percentual de progresso à esquerda com fundo verde e a meta de dias à direita com fundo claro, além de um botão "Confirmar Perseverança" com estilo arredondado para registrar a interação diária.
    *   **Novo Quadro Semanal "Sua Semana de Perseverança":** Exibe um quadro visual dos dias da semana, marcando com "ticks" os dias em que a perseverança foi confirmada, oferecendo uma visão rápida da consistência semanal.

## Tecnologias Utilizadas

*   **Frontend:** HTML, CSS, JavaScript
*   **Framework CSS:** Custom CSS (`styles.css`, `orei.css`)
*   **Fontes:** Google Fonts (Playfair Display)
*   **Backend e Banco de Dados:** Firebase (Authentication, Firestore)
*   **Bibliotecas JavaScript (CDN):**
    *   Firebase JS SDK (App, Analytics, Auth, Firestore)

## Configuração e Execução

Este é um aplicativo web frontend que utiliza o Firebase como backend. Para executar este projeto, você precisará:

1.  **Configurar um projeto no Firebase:**
    *   Crie um projeto no [Firebase Console](https://console.firebase.google.com/).
    *   Habilite a autenticação (Authentication) e o banco de dados Firestore.
    *   Obtenha as credenciais de configuração do seu projeto Firebase (apiKey, authDomain, projectId, etc.).

2.  **Substituir as credenciais no `script.js` e `orei.js`:**
    *   Abra os arquivos `script.js` e `orei.js`.
    *   Localize o objeto `firebaseConfig` e substitua os valores de exemplo pelas credenciais do seu projeto Firebase que você obteve no passo anterior.

    ```javascript
    const firebaseConfig = {
        apiKey: "SUA_API_KEY",
        authDomain: "SEU_PROJECT_ID.firebaseapp.com",
        projectId: "SEU_PROJECT_ID",
        storageBucket: "SEU_PROJECT_ID.firebasestorage.app",
        messagingSenderId: "SEU_MESSAGING_SENDER_ID",
        appId: "SEU_APP_ID",
        measurementId: "SEU_MEASUREMENT_ID"
    };
    ```

3.  **Abrir `index.html` (ou `orei.html` para o relatório) no navegador:**
    *   Após configurar o Firebase e substituir as credenciais, você pode simplesmente abrir o arquivo `index.html` (ou `orei.html`) no seu navegador web para utilizar o aplicativo.

## Utilização

1.  **Autenticação:**
    *   Na página inicial (`index.html`), utilize a seção de autenticação para criar uma nova conta ("Registrar") ou entrar em uma conta existente ("Entrar") utilizando seu email e senha.

2.  **Cadastrar um Novo Alvo de Oração:**
    *   Após autenticar-se, clique no botão "Novo" no menu principal para acessar o formulário de cadastro.
    *   Preencha os campos "Título", "Observações", "Data" e, se desejar, marque "Este alvo tem prazo de validade?" e defina o "Prazo de Validade".
    *   Clique em "Adicionar Alvo" para salvar o novo pedido de oração.

3.  **Interagir com os Alvos Diários, a Barra de Perseverança e o Quadro Semanal:**
        *   Na seção "Alvos de oração do dia", você verá uma seleção de pedidos e a barra "Perseverança na Intercessão" com design visual aprimorado, **e o novo quadro semanal "Sua Semana de Perseverança" acima.**
        *   Clique no botão "Orei!" para registrar sua oração por cada alvo diário.
        *   **Diariamente, clique no botão "Confirmar Perseverança" abaixo da barra de progresso "Perseverança na Intercessão" para registrar sua interação com o diário e avançar na barra de progresso. A barra exibe o seu progresso com o percentual em destaque à esquerda em um fundo verde e a meta de 100 dias (inicial) claramente indicada à direita em fundo claro.**
        *   **Observe o quadro semanal "Sua Semana de Perseverança" acima da barra. Ele exibirá "ticks" verdes nos dias da semana em que você confirmar a perseverança. Este quadro oferece uma visão rápida de sua consistência nos últimos 7 dias.**
        *   Utilize os botões "Atualizar Alvos do Dia", "Copiar Alvos do Dia" e "Visualizar Alvos do Dia" para gerenciar e visualizar seus alvos diários.

4.  **Gerenciar Todos os Alvos:**
    *   Clique em "Ver Todos os Alvos" para acessar a lista completa de pedidos ativos.
    *   Utilize os botões "Marcar como Respondido", "Arquivar", "Adicionar Observação" e "Editar Prazo" (quando aplicável) para gerenciar seus alvos.
    *   Explore as seções "Ver Arquivados" e "Ver Respondidos" através do menu principal para revisar orações passadas.
    *   Utilize a barra de pesquisa para encontrar alvos específicos.

5.  **Gerar Visualizações e Relatórios:**
    *   Clique em "Gerar Visualização Geral" e "Visualizar Respondidos" no menu principal para exportar listas de oração em HTML.
    *   Clique em "Perseverança" para acessar a página de relatório (`orei.html`) e visualizar o relatório de frequência de oração ("Orei!").
