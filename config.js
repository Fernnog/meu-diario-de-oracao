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

// Outras configurações futuras podem ser adicionadas aqui.
// Ex: export const DAILY_TARGETS_COUNT = 10;