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

export const APP_VERSION = '1.0.2';

export const CHANGELOG = {
  '1.0.2': [
    'MELHORIA: A aparência do botão "Conectar ao Drive" e dos indicadores na barra superior foi unificada para maior consistência visual.',
    'ARQUITETURA: As informações de versão e changelog foram centralizadas neste arquivo (config.js), melhorando a organização e manutenção do código.',
    'UX: O modal de novidades agora suporta a visualização do histórico de versões anteriores.'
  ],
  '1.0.1': [
    'FUNCIONALIDADE: Adicionado indicador de versão e janela de novidades (changelog).',
    'CORREÇÃO: A sequência de perseverança agora é zerada corretamente após um dia de inatividade.'
  ]
};
