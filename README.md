# Gerenciador de Planos de Leitura

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Um aplicativo web simples e eficiente para te ajudar a organizar e acompanhar seus planos de leitura de livros.**

![Logo do Gerenciador de Planos de Leitura](logo.png)

## Visão Geral

O **Gerenciador de Planos de Leitura** é uma ferramenta online desenvolvida para facilitar o planejamento e o acompanhamento das suas metas de leitura. Se você deseja ler mais livros e precisa de uma maneira organizada de monitorar seu progresso, este aplicativo é para você!

Com uma interface intuitiva e funcionalidades práticas, você pode criar planos de leitura personalizados, definir metas diárias ou semanais, acompanhar seu avanço página por página e manter a motivação em dia para alcançar seus objetivos literários.

## Funcionalidades Principais

*   **Criação de Planos de Leitura Personalizados:**
    *   Defina o título do livro, páginas de início e fim.
    *   Escolha o período do plano por datas (início e fim) ou por duração (data de início e número de dias).
    *   Selecione a periodicidade da leitura: diária ou semanal (com seleção dos dias da semana).
*   **Acompanhamento Visual do Progresso:**
    *   Barra de progresso interativa para visualizar rapidamente o percentual de leitura concluído.
    *   Indicação clara de páginas lidas e páginas totais do plano.
    *   Lista organizada dos dias de leitura planejados, com marcação de páginas a serem lidas em cada dia.
*   **Interação e Marcação de Leitura Diária:**
    *   Checkboxes interativos para marcar os dias de leitura como concluídos diretamente na lista de dias do plano.
    *   Atualização automática do progresso ao marcar os dias como lidos.
*   **Edição e Exclusão de Planos:**
    *   Botão "Editar" para modificar qualquer detalhe de um plano de leitura ativo (título, páginas, período, periodicidade, etc.).
    *   Botão "Excluir" para remover planos de leitura que não são mais relevantes.
*   **Recálculo Inteligente de Planos Atrasados:**
    *   Aviso visual para planos com atraso no cronograma.
    *   Opções de recálculo para ajustar o plano:
        *   Definir uma nova data limite para conclusão.
        *   Recalcular o número de páginas a serem lidas por dia para alcançar a meta.
*   **Exportação e Importação de Dados:**
    *   **Exportar Planos:** Salve todos os seus planos de leitura em um arquivo JSON para backup ou compartilhamento.
    *   **Importar Planos:** Recupere seus planos de leitura facilmente a partir de um arquivo JSON previamente exportado.
*   **Exportação para Agenda (ICS):**
    *   Exporte os eventos de leitura de um plano específico para um arquivo ICS, compatível com a maioria dos aplicativos de calendário (Google Calendar, Outlook, etc.).
    *   Personalize o horário de início e fim dos eventos na agenda.
*   **Autenticação de Usuário (Opcional):**
    *   Funcionalidade de login e cadastro com e-mail e senha, utilizando Firebase Authentication (opcional, para sincronização em nuvem - funcionalidade futura).
    *   Opção de sair da sua conta.
*   **Sincronização com Firebase (Funcionalidade Futura):**
    *   Botão para sincronizar seus dados com o Firebase Firestore (funcionalidade em desenvolvimento para salvar e acessar seus planos em diferentes dispositivos).
*   **Design Responsivo:**
    *   Interface adaptável a diferentes tamanhos de tela (desktops, tablets e smartphones), garantindo uma boa experiência em qualquer dispositivo.
*   **Interface Amigável e Moderna:**
    *   Layout limpo e intuitivo, fácil de usar mesmo para quem não tem experiência com aplicativos de gerenciamento de leitura.
    *   Design moderno com paleta de cores agradável e ícones para facilitar a navegação.

## Tecnologias Utilizadas

*   **HTML5:** Estrutura da página web.
*   **CSS3:** Estilização e layout da interface, incluindo design responsivo.
*   **JavaScript (ES6 Modules):** Lógica e interatividade do aplicativo, manipulação do DOM, gestão dos planos de leitura, funcionalidades de exportação/importação e integração com Firebase.
*   **Firebase:**
    *   **Firebase Authentication:** Autenticação de usuários com e-mail e senha (funcionalidade opcional e futura para sincronização).
    *   **Firebase Firestore:** Banco de dados NoSQL para armazenamento dos planos de leitura (funcionalidade futura para sincronização em nuvem).
*   **Google Fonts:** Fontes personalizadas para melhorar a tipografia da página (`Roboto` e `Ubuntu`).
*   **Material Symbols Outlined:** Biblioteca de ícones para uma interface mais visual e intuitiva.
*   **Cloudflare Web Analytics:** Análise de tráfego web (opcional).

## Como Utilizar

1.  **Acesse o Gerenciador de Planos de Leitura:** Abra o arquivo `index.html` no seu navegador web (ou acesse a versão online, se disponível - [link para a versão online, se houver]).

2.  **Criar um Novo Plano de Leitura:**
    *   Clique no botão **"Novo"** no topo da página.
    *   Preencha o formulário **"Novo Plano de Leitura"**:
        *   **Título do Livro:** Digite o nome do livro que você irá ler.
        *   **Página de Início:** Indique a página onde você começará a leitura.
        *   **Página de Fim:** Indique a página onde você terminará a leitura.
        *   **Definir Período por:** Escolha como definir o período do plano:
            *   **Datas de Início e Fim:** Selecione as datas de início e fim desejadas.
            *   **Data de Início e Número de Dias:** Selecione a data de início e o número total de dias para o plano.
        *   **Data de Início / Data de Início:** Selecione a data de início do seu plano de leitura.
        *   **Data de Fim / Número de Dias:** Dependendo da opção "Definir Período por" escolhida, selecione a data de fim ou o número de dias de duração do plano.
        *   **Periodicidade:** Escolha a frequência de leitura:
            *   **Diariamente:** Para ler todos os dias dentro do período definido.
            *   **Dias da Semana (Selecionar):** Para ler apenas em dias específicos da semana. Se selecionar esta opção, marque os checkboxes dos dias da semana desejados (Domingo, Segunda, Terça, etc.).
    *   Clique no botão **"Salvar Plano"** para adicionar o plano à sua lista de planos ativos.
    *   Para voltar à tela inicial, clique no botão **"Início"** (ícone de seta para trás) na seção de cadastro.

3.  **Gerenciar Planos de Leitura Ativos:**
    *   Na seção **"Planos de Leitura Ativos"**, você verá a lista de todos os seus planos cadastrados.
    *   **Acompanhar o Progresso:** Visualize a barra de progresso, o percentual de leitura e a lista de dias planejados para cada plano.
    *   **Marcar Dias como Lidos:** Clique nos checkboxes ao lado de cada dia na lista de dias de leitura para marcar os dias como concluídos. O progresso do plano será atualizado automaticamente.
    *   **Editar um Plano:** Clique no botão **"Editar"** ao lado do título do plano que você deseja modificar. O formulário de cadastro será preenchido com os dados do plano, permitindo que você faça as alterações necessárias e salve novamente.
    *   **Excluir um Plano:** Clique no botão **"Excluir"** para remover um plano da sua lista.
    *   **Recalcular Plano (em caso de atraso):** Se um plano estiver atrasado, um aviso será exibido. Clique no botão **"Recalcular Plano"** para escolher entre definir uma nova data limite ou recalcular as páginas por dia.

4.  **Exportar e Importar Planos:**
    *   **Exportar Planos:** Clique no botão **"Exportar"** no menu superior para baixar um arquivo JSON contendo todos os seus planos de leitura.
    *   **Importar Planos:**
        *   Clique no botão **"Importar"** no menu superior.
        *   Selecione o arquivo JSON contendo os planos que você deseja importar.
        *   Os planos serão adicionados à sua lista de planos ativos.

5.  **Exportar Agenda (ICS):**
    *   Clique no botão **"Agenda"** no menu superior.
    *   Digite o número do plano que você deseja exportar para a agenda (o número é exibido ao lado do título do plano na lista).
    *   Informe os horários de início e fim desejados para os eventos de leitura na agenda.
    *   Um arquivo ICS será baixado, que você poderá importar para o seu aplicativo de calendário preferido.

6.  **Limpar Dados Locais:**
    *   Clique no botão **"Limpar Dados"** no menu superior para remover todos os planos de leitura armazenados localmente no seu navegador. **Atenção:** Esta ação é irreversível e não afeta os dados no Firebase (se você estiver usando a funcionalidade de sincronização).

7.  **Login/Cadastro e Sair (Funcionalidade Opcional e Futura):**
    *   **Login/Cadastro:** Clique no botão **"Login/Cadastro"** para exibir o formulário de autenticação. Você pode fazer login com uma conta existente ou criar uma nova conta com e-mail e senha.
    *   **Sair:** Após fazer login, o botão **"Login/Cadastro"** será substituído pelo botão **"Sair"**. Clique em **"Sair"** para deslogar da sua conta.

## Agradecimentos

*   Agradecimentos às bibliotecas e frameworks de código aberto que tornaram este projeto possível: Firebase, Google Fonts, Material Symbols.

**Divirta-se planejando e acompanhando suas leituras com o Gerenciador de Planos de Leitura!**
