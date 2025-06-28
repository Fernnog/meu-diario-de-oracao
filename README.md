# Meus Alvos de Oração

Bem-vindo ao **Meus Alvos de Oração**, uma aplicação web desenvolvida para ajudar usuários a gerenciar e acompanhar seus alvos de oração de forma organizada e espiritual. Com esta ferramenta, você pode adicionar, editar, arquivar e orar por seus alvos, acompanhar seu progresso diário com o painel "Alvos de Oração do Dia" e visualizar sua perseverança.

Este projeto foi construído com HTML, CSS e JavaScript (ES Modules), utilizando o **Firebase** como backend para autenticação e armazenamento de dados em tempo real.

## Funcionalidades

-   **Gerenciamento de Alvos de Oração**:
    -   Adicione novos alvos com título, detalhes, data de criação, categoria (opcional) e prazo (opcional).
    -   Arquive alvos concluídos ou não mais relevantes, com a opção de marcá-los como "Respondido".
    -   Exclua permanentemente alvos arquivados.
    -   Visualize alvos ativos, arquivados ou respondidos em painéis separados com busca e paginação.
    -   Adicione observações datadas a qualquer alvo.

-   **Alvos de Oração do Dia**:
    -   Um painel que exibe até 10 alvos de oração ativos por dia.
    -   **Seleção Inteligente**: O sistema seleciona alvos aleatoriamente para compor a lista diária.
    -   **Persistência Diária**: A lista do dia (incluindo o estado "Orado") é salva no Firebase, garantindo consistência mesmo após recarregar a página.
    -   **Botão "Orei!"**: Marca um alvo como concluído *para aquele dia*. A interação atualiza as estatísticas de perseverança. Alvos concluídos são movidos para uma seção separada no painel do dia.

-   **Acompanhamento de Perseverança**:
    -   **Barra de Dias Consecutivos**: Uma barra de progresso visualiza a sequência atual de dias em que o usuário interagiu com pelo menos um alvo, comparado ao seu recorde pessoal.
    -   **Quadro Semanal**: Exibe visualmente os dias da semana atual (Dom-Sáb) em que houve pelo menos uma interação.
    -   Atualização automática ao clicar em "Orei!".

-   **Autenticação**:
    -   Login e cadastro seguros via Firebase Authentication (e-mail/senha).
    -   Opção de "Esqueci minha senha" para redefinição via e-mail.
    -   Status de autenticação visível e botão de logout.

-   **Persistência e Sincronização**:
    -   Todos os dados (alvos ativos, arquivados, listas diárias, dados de perseverança) são salvos no Firebase Firestore, garantindo sincronização e acesso de qualquer dispositivo.

## Tecnologias Utilizadas

-   **Frontend**:
    -   HTML5
    -   CSS3
    -   JavaScript (ES6+ Modules)
    -   Interface responsiva

-   **Backend**:
    -   Firebase Authentication (autenticação de usuários)
    -   Firebase Firestore (banco de dados NoSQL)

## Como Configurar o Projeto Localmente

### Pré-requisitos

-   Conta no Firebase
-   Um editor de código (ex.: VS Code)
-   Um servidor web local para servir os arquivos (a extensão "Live Server" para VS Code é recomendada, pois o projeto usa ES Modules)

### Passos para Configuração

1.  **Clone o Repositório** (ou baixe os arquivos):
    Obtenha todos os arquivos do projeto: `index.html`, `styles.css`, e os scripts (`script.js`, `ui.js`, `firestore-service.js`, `auth.js`, `firebase-config.js`, etc.).

2.  **Configure o Firebase**:
    -   Crie um projeto no [Firebase Console](https://console.firebase.google.com/).
    -   No seu projeto, vá para **Authentication** (Autenticação) e na aba "Sign-in method", habilite o provedor de **E-mail/senha**.
    -   Vá para **Firestore Database**, crie um banco de dados e inicie no **modo de produção**. Configure as regras de segurança adequadamente (para desenvolvimento, você pode usar regras que permitam acesso a usuários autenticados).
    -   Nas **Configurações do Projeto** (ícone de engrenagem) > Geral, role para baixo até "Seus apps".
    -   Clique no ícone da web (`</>`) para registrar um novo aplicativo da web.
    -   Dê um nome ao seu app e clique em "Registrar app".
    -   O Firebase fornecerá um objeto de configuração `firebaseConfig`. Copie este objeto.

3.  **Adicione as Credenciais do Firebase**:
    -   Abra o arquivo `firebase-config.js`.
    -   Substitua o objeto `firebaseConfig` de exemplo pelas credenciais que você copiou do *seu* projeto Firebase:
        ```javascript
        // firebase-config.js
        
        // ... (imports)

        // Cole aqui o objeto de configuração do seu projeto Firebase.
        const firebaseConfig = {
          apiKey: "SUA_API_KEY",
          authDomain: "SEU_AUTH_DOMAIN",
          projectId: "SEU_PROJECT_ID",
          storageBucket: "SEU_STORAGE_BUCKET",
          messagingSenderId: "SEU_MESSAGING_SENDER_ID",
          appId: "SEU_APP_ID",
          measurementId: "SEU_MEASUREMENT_ID" // Opcional, mas bom ter
        };

        // ... (restante do arquivo)
        ```
    -   **Importante:** Você só precisa fazer isso no arquivo `firebase-config.js`, pois todos os outros módulos o importarão de lá.

4.  **Estrutura do Firestore**:
    O projeto utiliza as seguintes coleções principais no Firestore:
    -   `users/{userId}/prayerTargets`: Armazena os alvos de oração ativos do usuário.
    -   `users/{userId}/archivedTargets`: Armazena os alvos arquivados/respondidos.
    -   `dailyPrayerTargets/{userId_YYYY-MM-DD}`: Armazena a lista de alvos para um usuário em um dia específico.
    -   `perseveranceData/{userId}`: Armazena os dados da barra de progresso de dias consecutivos.
    -   `weeklyInteractions/{userId}`: Armazena os dias da semana atual em que houve interação.

5.  **Execute Localmente**:
    -   Devido ao uso de Módulos JavaScript (`import`/`export`), você **precisa** servir os arquivos através de um servidor web. Abrir o `index.html` diretamente no navegador (via `file://`) não funcionará.
    -   **Recomendado**: Use a extensão "Live Server" no VS Code. Clique com o botão direito no arquivo `index.html` e selecione "Open with Live Server".
    -   Alternativamente, use um servidor simples como `python -m http.server` no terminal, dentro da pasta do projeto.
    -   Acesse a aplicação pelo endereço fornecido pelo servidor (ex: `http://127.0.0.1:5500`).

6.  **Teste a Aplicação**:
    -   Abra o navegador e acesse a URL local.
    -   Crie uma conta ou faça login.
    -   Adicione, edite e arquive alvos de oração.
    -   Verifique o painel "Alvos de Oração do Dia", clique em "Orei!".
    -   Observe a barra de progresso e o quadro semanal se atualizarem.

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
    -   Nos painéis de listagem, use os botões em cada alvo para realizar ações como arquivar, marcar como respondido, etc.

4.  **Use o Painel "Alvos de Oração do Dia"**:
    -   Veja os alvos selecionados para o dia.
    -   Clique em **"Orei!"** para marcar um alvo como concluído no dia e atualizar suas estatísticas.

5.  **Acompanhe o Progresso**:
    -   Observe a **barra de dias consecutivos** e o **quadro semanal** na Página Inicial.
