// floating-nav.js
// Responsabilidade: Gerenciar toda a lógica do navegador flutuante,
// incluindo sua visibilidade, eventos de clique e interação com a página.

// --- Elemento do DOM ---
// Selecionamos o elemento uma vez para otimizar a performance.
const floatingNav = document.getElementById('floatingNav');

// --- Funções Auxiliares Internas ---

/**
 * Reúne todos os elementos que servem como âncoras para a rolagem das setas.
 * @returns {NodeListOf<Element>} - Uma lista de nós de elementos de âncora.
 */
function getAnchors() {
    return document.querySelectorAll('#prioritySection .target, #dailySection .target');
}

/**
 * Atualiza o estado (ativado/desativado) dos botões de seta com base na posição de rolagem.
 * Esta função é chamada dentro de toggleVisibility para ser executada a cada evento de scroll.
 */
function updateArrowButtonsState() {
    const anchors = getAnchors();
    if (anchors.length < 2) { // Se não houver pelo menos 2 alvos, as setas não fazem sentido.
        document.querySelector('.up-btn')?.classList.add('disabled');
        document.querySelector('.down-btn')?.classList.add('disabled');
        return;
    }

    const anchorPositions = Array.from(anchors).map(el => el.offsetTop);
    const firstAnchorPosition = anchorPositions[0];
    const lastAnchorPosition = anchorPositions[anchorPositions.length - 1];
    const currentPosition = window.scrollY;

    const upButton = document.querySelector('.up-btn');
    const downButton = document.querySelector('.down-btn');

    // Desativa o botão "para cima" se estivermos no topo ou acima do primeiro alvo.
    // O buffer de -10px torna a experiência mais suave.
    if (currentPosition <= firstAnchorPosition - 10) {
        upButton?.classList.add('disabled');
    } else {
        upButton?.classList.remove('disabled');
    }

    // Desativa o botão "para baixo" se estivermos no último alvo ou abaixo dele.
    if (currentPosition >= lastAnchorPosition - 10) {
        downButton?.classList.add('disabled');
    } else {
        downButton?.classList.remove('disabled');
    }
}

/**
 * Controla a visibilidade do navegador flutuante com base no estado da aplicação e na posição de rolagem.
 * Esta função agora também controla o estado dos botões de seta.
 * @param {object} state - O objeto de estado global da aplicação.
 */
function toggleVisibility(state) {
    if (!floatingNav) {
        return;
    }

    // Condição 1: Visibilidade baseada no estado da aplicação.
    const shouldBeVisibleBasedOnState = state.user && state.prayerTargets && state.prayerTargets.length > 0;
    if (!shouldBeVisibleBasedOnState) {
        floatingNav.classList.add('hidden');
        return;
    }

    // Condição 2: Esconder perto do final da página.
    const buffer = 50;
    const isNearBottom = (window.innerHeight + window.scrollY) >= (document.documentElement.scrollHeight - buffer);

    if (isNearBottom) {
        floatingNav.classList.add('hidden');
    } else {
        floatingNav.classList.remove('hidden');
    }
    
    // MELHORIA APLICADA: Atualiza o estado dos botões de seta a cada verificação.
    updateArrowButtonsState();
}

/**
 * Rola a página para o próximo ou anterior alvo de oração visível.
 * @param {'up' | 'down'} direction - A direção da rolagem.
 */
function scrollToNextTarget(direction) {
    const anchors = getAnchors();
    if (anchors.length === 0) return;

    const anchorPositions = Array.from(anchors).map(el => el.offsetTop);
    const currentPosition = window.scrollY;

    let targetPosition = null;

    if (direction === 'down') {
        // Encontra o primeiro alvo cuja posição Y seja maior que a posição atual da tela.
        // O buffer de 2 pixels ajuda a pular o alvo atual caso seu topo esteja visível.
        targetPosition = anchorPositions.find(pos => pos > currentPosition + 2);
    } else { // direction === 'up'
        // Encontra o último alvo (iterando ao contrário) cuja posição Y seja menor que a posição atual.
        // O buffer de 2 pixels ajuda a pular para o alvo anterior corretamente.
        const previousAnchor = [...anchorPositions].reverse().find(pos => pos < currentPosition - 2);
        if (previousAnchor !== undefined) {
            targetPosition = previousAnchor;
        }
    }

    if (targetPosition !== null) {
        window.scrollTo({
            top: targetPosition,
            behavior: 'smooth'
        });
    }
}

/**
 * Configura os listeners de clique para os botões do navegador flutuante,
 * implementando a rolagem suave para as seções e entre os alvos.
 */
function setupClickListeners() {
    if (!floatingNav) {
        return;
    }

    floatingNav.addEventListener('click', (event) => {
        const clickedElement = event.target.closest('.nav-btn');
        if (!clickedElement) {
            return;
        }
        
        // MELHORIA APLICADA: Ignora cliques em botões desativados.
        if (clickedElement.classList.contains('disabled')) {
            event.preventDefault();
            return;
        }

        event.preventDefault();

        const action = clickedElement.dataset.action;
        const href = clickedElement.getAttribute('href');

        // Lógica para os botões de seta
        if (action === 'scroll-up' || action === 'scroll-down') {
            const direction = action === 'scroll-up' ? 'up' : 'down';
            scrollToNextTarget(direction);
            return;
        }
        
        // Lógica existente para os botões de âncora de seção
        if (href) {
            const targetId = href.substring(1);
            
            if (targetId === 'top') {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                return;
            }

            const targetElement = document.getElementById(targetId);
            if (targetElement) {
                targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    });
}


// --- Funções Exportadas ---

/**
 * (Exportado) Inicializa o navegador flutuante. Configura todos os seus eventos.
 * @param {object} state - O objeto de estado da aplicação.
 */
export function initializeFloatingNav(state) {
    if (!floatingNav) {
        return;
    }
    setupClickListeners();
    window.addEventListener('scroll', () => toggleVisibility(state));
    window.addEventListener('resize', () => toggleVisibility(state));
    toggleVisibility(state); // Verificação inicial
}

/**
 * (Exportado) Força uma reavaliação da visibilidade do navegador flutuante.
 * @param {object} state - O objeto de estado atualizado da aplicação.
 */
export function updateFloatingNavVisibility(state) {
    toggleVisibility(state);
}
