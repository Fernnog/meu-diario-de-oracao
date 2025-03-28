# Meus Alvos de Oração

Bem-vindo ao **Meus Alvos de Oração**, uma aplicação web desenvolvida para ajudar usuários a gerenciar e acompanhar seus alvos de oração de forma organizada e espiritual. Com esta ferramenta, você pode adicionar, editar, arquivar e orar por seus alvos, além de acompanhar seu progresso diário com o painel "Alvos de Oração do Dia".

Este projeto foi construído com HTML, CSS e JavaScript, utilizando o **Firebase** como backend para autenticação, armazenamento de dados e persistência em tempo real.

## Funcionalidades

- **Gerenciamento de Alvos de Oração**:
  - Adicione novos alvos com título, detalhes, data de criação e prazo (opcional).
  - Edite ou remova alvos existentes.
  - Arquive alvos concluídos ou não mais relevantes, com a opção de marcá-los como "resolvidos".
  - Acompanhe o tempo decorrido desde a criação de cada alvo.

- **Alvos de Oração do Dia** (Atualizado!):
  - Um painel que exibe até 10 alvos de oração aleatórios por dia.
  - **Nova funcionalidade**: Os alvos diários agora são persistidos no Firebase, garantindo que a lista do dia permaneça consistente mesmo após recarregamentos ou navegações.
  - Clique em "Orei!" para marcar um alvo como concluído no dia. O estado é salvo no Firebase, e apenas os alvos pendentes são exibidos ao recarregar.
  - Alvos não concluídos retornam ao pool geral para serem exibidos em dias futuros.
  - O ciclo de alvos reinicia automaticamente quando todos os alvos disponíveis forem apresentados.

- **Versículos Inspiradores**:
  - Exibe um versículo bíblico aleatório ao lado dos alvos diários para inspirar sua oração.

- **Autenticação**:
  - Login e logout seguros via Firebase Authentication (e-mail/senha ou provedores como Google).

- **Persistência e Sincronização**:
  - Todos os dados (alvos, alvos arquivados, alvos diários e contagem de orações) são salvos no Firebase Firestore, garantindo sincronização em tempo real e acesso de qualquer dispositivo.

- **Acompanhamento de Progresso**:
  - Contagem de cliques em "Orei!" por alvo, com estatísticas mensais e anuais.
  - Notificações visuais para prazos expirados e alvos concluídos.

## Tecnologias Utilizadas

- **Frontend**:
  - HTML5, CSS3, JavaScript (ES6+)
  - Interface responsiva e amigável

- **Backend**:
  - Firebase Authentication (autenticação de usuários)
  - Firebase Firestore (banco de dados NoSQL para armazenamento de alvos e estados)
  - Firebase Hosting (hospedagem da aplicação)

## Como Configurar o Projeto Localmente

### Pré-requisitos
- Node.js instalado (para gerenciar dependências, se necessário)
- Conta no Firebase (para configurar autenticação e banco de dados)
- Um editor de código (ex.: VS Code)

### Passos para Configuração

1. **Clone o Repositório**:
   ```bash
   git clone https://github.com/seu-usuario/meus-alvos-de-oracao.git
   cd meus-alvos-de-oracao
   ```

2. **Configure o Firebase**:
   - Crie um projeto no [Firebase Console](https://console.firebase.google.com/).
   - Habilite o **Firebase Authentication** (ative o provedor de e-mail/senha e, opcionalmente, outros como Google).
   - Habilite o **Firestore Database** e crie um banco de dados no modo de produção ou teste.
   - Copie as credenciais do Firebase (API Key, Auth Domain, etc.) do seu projeto.

3. **Adicione as Credenciais do Firebase**:
   - Abra o arquivo `script.js` e localize a configuração do Firebase (próxima ao início do arquivo).
   - Substitua as credenciais pela configuração do seu projeto:
     ```javascript
     const firebaseConfig = {
       apiKey: "SUA_API_KEY",
       authDomain: "SEU_AUTH_DOMAIN",
       projectId: "SEU_PROJECT_ID",
       storageBucket: "SEU_STORAGE_BUCKET",
       messagingSenderId: "SEU_MESSAGING_SENDER_ID",
       appId: "SEU_APP_ID"
     };
     ```

4. **Estrutura do Firestore**:
   O projeto utiliza as seguintes coleções no Firestore:
   - `prayerTargets`: Armazena os alvos de oração ativos.
   - `archivedTargets`: Armazena os alvos arquivados.
   - `prayerClickCounts`: Registra a contagem de cliques em "Orei!" por alvo.
   - `dailyPrayerTargets`: (Nova!) Armazena os alvos diários por usuário e data, no formato `userId_date` (ex.: `user123_2025-03-27`).
     - Estrutura de documento:
       ```json
       {
         "userId": "user123",
         "date": "2025-03-27",
         "targets": [
           { "targetId": "abc123", "completed": true },
           { "targetId": "def456", "completed": false }
         ],
         "completedAt": null
       }
       ```

5. **Hospede Localmente**:
   - Se você estiver usando o Firebase Hosting, instale o Firebase CLI:
     ```bash
     npm install -g firebase-tools
     ```
   - Faça login no Firebase:
     ```bash
     firebase login
     ```
   - Inicialize o servidor local:
     ```bash
     firebase emulators:start
     ```
   - Acesse a aplicação em `http://localhost:5000`.

6. **Teste a Aplicação**:
   - Abra o navegador e acesse a URL local.
   - Faça login (ou crie uma conta) e comece a adicionar alvos de oração.
   - Verifique o painel "Alvos de Oração do Dia" e teste a persistência ao recarregar a página.

## Como Usar

1. **Faça Login**:
   - Use seu e-mail e senha ou faça login com o Google.
   - Se for seu primeiro acesso, crie uma conta.

2. **Adicione Alvos de Oração**:
   - Clique em "Adicionar Alvo" e preencha os campos (título, detalhes, prazo, etc.).
   - Os alvos aparecerão na seção principal.

3. **Use o Painel "Alvos de Oração do Dia"**:
   - A cada dia, o sistema seleciona automaticamente até 10 alvos aleatórios.
   - Clique em "Orei!" para marcar um alvo como concluído no dia.
   - O estado é salvo no Firebase, e os alvos concluídos não reaparecem no mesmo dia, mesmo após recarregar a página.
   - No dia seguinte, uma nova lista de alvos será gerada.

4. **Arquive ou Edite Alvos**:
   - Use os botões de edição ou arquivamento para gerenciar seus alvos.
   - Alvos arquivados podem ser marcados como "resolvidos" e são exibidos em uma seção separada.

5. **Acompanhe o Progresso**:
   - Veja a contagem de orações por alvo e o tempo decorrido.
   - Receba notificações visuais para prazos expirados.

## Contribuindo

Se você deseja contribuir para o projeto, siga os passos abaixo:

1. **Fork o Repositório**:
   - Clique em "Fork" no GitHub para criar uma cópia do repositório no seu perfil.

2. **Clone e Faça Alterações**:
   - Clone seu fork e crie uma nova branch para suas alterações:
     ```bash
     git checkout -b minha-nova-funcionalidade
     ```

3. **Teste Suas Alterações**:
   - Certifique-se de que suas mudanças não quebram funcionalidades existentes.
   - Teste localmente com o Firebase Emulator.

4. **Envie um Pull Request**:
   - Faça o commit das suas alterações e envie para o repositório original:
     ```bash
     git push origin minha-nova-funcionalidade
     ```
   - Abra um Pull Request descrevendo suas mudanças.

### Sugestões de Melhorias
- Adicionar relatórios detalhados de progresso (ex.: número de alvos concluídos por semana).
- Implementar notificações push para lembrar o usuário de orar.
- Criar um sistema de categorias ou tags para organizar os alvos.
- Adicionar suporte a múltiplos idiomas.

## Funcionalidades em Desenvolvimento

### Seleção Aleatória de Alvos Diários com Exclusão e Reinício de Ciclo

Estamos trabalhando em uma nova funcionalidade para aprimorar a experiência no painel inicial da aplicação "Meus Alvos de Oração". Esta funcionalidade, ainda em implementação, incluirá:

- **Seleção Aleatória de Alvos**: A cada dia, o sistema selecionará aleatoriamente 10 alvos de oração a partir do pool de alvos ativos cadastrados pelo usuário.
- **Exclusão de Alvos Interagidos**: Alvos marcados como "Orei!" (ou seja, concluídos) no dia atual serão excluídos do pool de seleção do dia seguinte, garantindo que o usuário foque em alvos ainda não orados.
- **Reinício do Ciclo**: Quando todos os alvos ativos tiverem sido apresentados e concluídos pelo menos uma vez, o ciclo será reiniciado, permitindo que todos os alvos voltem a ser elegíveis para seleção.
- **Persistência no Firebase**: As interações diárias continuarão sendo salvas na coleção `dailyPrayerTargets`, com um documento por dia no formato `userId_date` (ex.: `user123_2025-03-27`), e os alvos serão rastreados para garantir a exclusão e o reinício corretos.

**Status**: Em desenvolvimento. A lógica de seleção aleatória e exclusão já foi implementada no backend (`script.js`), mas estamos ajustando a robustez do reinício do ciclo e testando a integração com o Firebase para garantir consistência.

Fique de olho nas próximas atualizações para experimentar essa nova funcionalidade!
