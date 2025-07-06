// floating-nav.js
// Responsabilidade: Gerenciar toda a lógica do navegador flutuante,
// incluindo sua visibilidade, eventos de clique e interação com a página.

// --- Elemento do DOM ---
// Selecionamos o elemento uma vez para otimizar a performance.
const floatingNav = document.getElementById('floatingNav');

/**
 * Controla a visibilidade do navegador flutuante e de seus botões de navegação.
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

    // --- INÍCIO DA MODIFICAÇÃO: Lógica para habilitar/desabilitar botões de navegação ---
    const navUpBtn = floatingNav.querySelector('.nav-up-btn');
    const navDownBtn = floatingNav.querySelector('.nav-down-btn');

    if (navUpBtn && navDownBtn) {
        // Seleciona todos os elementos visíveis que podem ser navegados
        const targets = Array.from(document.querySelectorAll('.target:not([style*="display: none"])'));
        
        if (targets.length > 0) {
            const firstTarget = targets[0];
            const lastTarget = targets[targets.length - 1];

            // Verifica se o topo do primeiro alvo já está visível ou acima da viewport
            const isAtTop = firstTarget.getBoundingClientRect().top >= 0;
            // Verifica se a base do último alvo já está visível ou acima do final da viewport
            const isAtBottom = lastTarget.getBoundingClientRect().bottom <= window.innerHeight;

            navUpBtn.classList.toggle('disabled', isAtTop);
            navDownBtn.classList.toggle('disabled', isAtBottom);
        } else {
            // Se não há alvos, desabilita ambos
            navUpBtn.classList.add('disabled');
            navDownBtn.classList.add('disabled');
        }
    }
    // --- FIM DA MODIFICAÇÃO ---
}

/**
 * (NOVA FUNÇÃO) Navega a visualização para o alvo de oração anterior ou seguinte na página.
 * @param {string} direction - A direção da navegação ('up' ou 'down').
 */
function handleTargetNavigation(direction) {
    // Seleciona todos os elementos visíveis que representam um alvo de oração
    const targets = Array.from(document.querySelectorAll('.target:not([style*="display: none"])'));
    if (targets.length === 0) return;

    const viewportTop = window.scrollY;

    if (direction === 'down') {
        // Encontra o primeiro alvo que está abaixo da borda superior da tela (com uma pequena tolerância)
        const firstTargetBelow = targets.find(t => t.offsetTop > viewportTop + 1);
        if (firstTargetBelow) {
            firstTargetBelow.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    } else if (direction === 'up') {
        // Encontra o último alvo que está acima da borda superior da tela (com uma pequena tolerância)
        const allTargetsAbove = targets.filter(t => t.offsetTop < viewportTop - 1);
        if (allTargetsAbove.length > 0) {
            allTargetsAbove[allTargetsAbove.length - 1].scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
}

/**
 * Configura os listeners de clique para os botões do navegador flutuante.
 * Esta função foi modificada para incluir a navegação entre alvos.
 */
function setupClickListeners() {
    if (!floatingNav) {
        return;
    }

    floatingNav.addEventListener('click', (event) => {
        const clickedElement = event.target.closest('a.nav-btn');
        if (!clickedElement || clickedElement.classList.contains('disabled')) {
            return; // Ignora cliques em botões desabilitados ou fora dos botões
        }

        event.preventDefault();

        // --- INÍCIO DA MODIFICAÇÃO: Lógica para navegação entre alvos ---
        const navDirection = clickedElement.dataset.navDirection;
        if (navDirection) {
            handleTargetNavigation(navDirection);
            return;
        }
        // --- FIM DA MODIFICAÇÃO ---

        const targetId = clickedElement.getAttribute('href').substring(1);

        if (targetId === 'top') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }

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