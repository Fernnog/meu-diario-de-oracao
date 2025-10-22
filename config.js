// config.js
// Responsabilidade: Centralizar as configurações e regras de negócio da aplicação.

/**
 * Define os marcos (milestones) de perseverança, suas regras e ícones.
 * A ordem neste array é crucial e deve ser do maior para o menor valor em 'dias'.
 * - type 'principal': Permite empilhamento (ex: x2, x3).
 * - type 'etapa': Ocorre apenas uma vez no cálculo do "troco".
 */
export const MILESTONES = [
    { name: 'Sol',      days: 1000, icon: '☀️', type: 'principal' },
    { name: 'Diamante', days: 300,  icon: '💎', type: 'principal' },
    { name: 'Árvore',   days: 100,  icon: '🌳', type: 'principal' },
    { name: 'Estrela',  days: 30,   icon: '⭐', type: 'principal' },
    { name: 'Chama',    days: 15,   icon: '🔥', type: 'etapa'     },
    { name: 'Semente',  days: 7,    icon: '🌱', type: 'etapa'     }
];

// --- GERENCIAMENTO DE VERSÃO E CHANGELOG ---

export const APP_VERSION = '1.0.8';

export const CHANGELOG = {
 '1.0.8': [
    'MELHORIA (UX): A visualização de observações foi otimizada para uma interface mais limpa. Agora, são exibidas por padrão apenas as 3 mais recentes e os sub-alvos, focando no conteúdo mais relevante.',
    'FUNCIONALIDADE: Adicionado um sistema "Ver Mais/Ver Menos" nas observações. Um novo botão permite expandir e recolher o histórico de anotações mais antigas, melhorando a navegação em alvos com muitos registros.'
  ],
 '1.0.7': [
    'ARQUITETURA: A estrutura dos arquivos de estilo (CSS) foi completamente reorganizada. O código foi dividido em `styles/base.css` (estilos globais) e `styles/components.css` (elementos específicos), melhorando a organização, performance e facilitando futuras manutenções.',
    'CORREÇÃO (Layout): Corrigido um desalinhamento visual na página principal, garantindo que o painel de "Alvos Prioritários" tenha a mesma largura dos demais painéis, como o de "Alvos do Dia".'
  ],
 '1.0.6': [
    'MELHORIA (UX): Os campos de texto longos (como "Observações") agora crescem automaticamente para se ajustar ao conteúdo, facilitando a digitação e a visualização de textos extensos.',
    'CORREÇÃO (Mobile): A barra de rolagem nos campos de texto foi otimizada para dispositivos móveis, tornando-se mais espessa e fácil de usar com o toque, resolvendo a dificuldade de rolagem em telas pequenas.'
  ],
 '1.0.5': [
    'CORREÇÃO (UX): A janela para "Adicionar Alvo Manualmente" foi aprimorada para se adaptar melhor a telas de computador, eliminando a barra de rolagem interna desnecessária e melhorando a visualização da lista de alvos.',
    'PERFORMANCE: A busca de alvos na janela de adição manual está mais inteligente e rápida. A pesquisa agora aguarda uma breve pausa na digitação, melhorando a fluidez e a performance geral da funcionalidade.'
  ],
 '1.0.4': [
    'CORREÇÃO: Resolvido um problema crítico que fazia a tela de carregamento (splash screen) travar indefinidamente em dispositivos móveis, impedindo o acesso ao aplicativo.',
    'ROBUSTEZ: O processo de inicialização do aplicativo foi aprimorado para lidar com falhas de carregamento. Agora, em caso de erro, a tela de carregamento será sempre finalizada, permitindo que o usuário interaja com a tela de login.'
  ],
 '1.0.3': [
    'UX: Alvos adicionados manualmente à lista do dia agora aparecem em primeiro lugar, permitindo um acesso mais rápido e focado.',
    'ARQUITETURA: O processo de adicionar um alvo manual à lista diária foi otimizado, tornando a ação instantânea e evitando recarregar todos os dados do usuário.'
  ]
};
