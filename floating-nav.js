// floating-nav.js
// Responsabilidade: Gerenciar toda a lógica do navegador flutuante,
// incluindo sua visibilidade, eventos de clique e interação com a página.

// --- Elemento do DOM ---
// Selecionamos o elemento uma vez para otimizar a performance.
const floatingNav = document.getElementById('floatingNav');

/**
 * Controla a visibilidade do navegador flutuante com base no estado da aplicação e na posição de rolagem.
 * Esta função é interna ao módulo.
 * @param {object} state - O objeto de estado global da aplicação.
 */
function toggleVisibility(state) {
    // Se o elemento não existir no DOM, não faz nada.
    if (!floatingNav) {
        return;
    }

    // Condição 1: O navegador só deve ser visível se o usuário estiver logado E tiver alvos de oração.
    const shouldBeVisibleBasedOnState = state.user && state.prayerTargets && state.prayerTargets.length > 0;
    if (!shouldBeVisibleBasedOnState) {
        floatingNav.classList.add('hidden');
        return; // Sai da função, pois o estado não permite que ele seja mostrado.
    }

    // Condição 2: Esconder o navegador quando o usuário rolar para perto do final da página.
    const buffer = 50; // Uma pequena margem de segurança do final da página.
    const isNearBottom = (window.innerHeight + window.scrollY) >= (document.documentElement.scrollHeight - buffer);

    if (isNearBottom) {
        floatingNav.classList.add('hidden');
    } else {
        floatingNav.classList.remove('hidden');
    }
}

/**
 * Configura os listeners de clique para os botões do navegador flutuante,
 * implementando a rolagem suave para as seções.
 * Esta função é interna ao módulo.
 */
function setupClickListeners() {
    if (!floatingNav) {
        return;
    }

    // Usamos delegação de eventos para ter um único listener no container.
    floatingNav.addEventListener('click', (event) => {
        const clickedLink = event.target.closest('a.nav-btn');
        if (!clickedLink) {
            return; // Ignora cliques que não sejam nos botões de navegação.
        }

        event.preventDefault(); // Previne o comportamento padrão de "pular" da âncora.

        const targetId = clickedLink.getAttribute('href').substring(1); // Remove o '#' do href.
        
        // Caso especial para o botão "Topo".
        if (targetId === 'top') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }

        // Para os outros botões, encontra o elemento e rola até ele.
        const targetElement = document.getElementById(targetId);
        if (targetElement) {
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
}

/**
 * (Exportado) Inicializa o navegador flutuante. Configura todos os seus eventos.
 * Esta função deve ser chamada uma única vez quando a aplicação é carregada.
 * @param {object} state - O objeto de estado da aplicação, necessário para os listeners de evento.
 */
export function initializeFloatingNav(state) {
    if (!floatingNav) {
        return;
    }

    // Configura os cliques nos botões.
    setupClickListeners();
    
    // Adiciona os listeners de scroll e resize que reavaliam a visibilidade do navegador.
    // Eles precisam do 'state' para tomar decisões corretas.
    window.addEventListener('scroll', () => toggleVisibility(state));
    window.addEventListener('resize', () => toggleVisibility(state));
    
    // Executa uma verificação inicial da visibilidade assim que a página é carregada.
    toggleVisibility(state);
}

/**
 * (Exportado) Força uma reavaliação da visibilidade do navegador flutuante.
 * É chamada de fora do módulo (em script.js) sempre que o estado da aplicação
 * que afeta a visibilidade (como login/logout) é alterado.
 * @param {object} state - O objeto de estado atualizado da aplicação.
 */
export function updateFloatingNavVisibility(state) {
    toggleVisibility(state);
}