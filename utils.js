// utils.js
// Responsabilidade: Conter funções utilitárias puras e reutilizáveis em toda a aplicação.

import { MILESTONES } from './config.js';

/**
 * Formata um objeto Date para exibição ao usuário (ex: 27/10/2023).
 * Utiliza toLocaleDateString para respeitar o fuso horário local do usuário na exibição.
 * @param {Date} date - Objeto Date a ser formatado.
 * @returns {string} - A data formatada.
 */
export function formatDateForDisplay(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) return 'Data Inválida';
    // O timeZone: 'UTC' garante que a data (dia, mês, ano) seja interpretada como foi salva,
    // evitando que um timestamp do início do dia em UTC se torne o dia anterior em fusos como o do Brasil.
    return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'UTC'
    });
}

/**
 * Formata um objeto Date para o formato ISO (YYYY-MM-DD) para uso em inputs <input type="date">.
 * Utiliza métodos UTC para manter consistência com a lógica do back-end.
 * @param {Date} date - Objeto Date a ser formatado.
 * @returns {string} - A data no formato YYYY-MM-DD.
 */
export function formatDateToISO(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
        const today = new Date();
        const year = today.getUTCFullYear();
        const month = String(today.getUTCMonth() + 1).padStart(2, '0');
        const day = String(today.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Calcula o tempo decorrido entre duas datas de forma humanizada.
 * @param {Date} startDate - A data inicial.
 * @param {Date} [endDate=new Date()] - A data final (padrão: agora).
 * @returns {string} - O tempo decorrido (ex: "3 dias", "2 meses").
 */
export function timeElapsed(startDate, endDate = new Date()) {
    if (!startDate || !(startDate instanceof Date) || isNaN(startDate.getTime())) return 'Tempo desconhecido';
    let diffInSeconds = Math.floor((endDate.getTime() - startDate.getTime()) / 1000);
    if (diffInSeconds < 0) diffInSeconds = 0;

    if (diffInSeconds < 60) return `${diffInSeconds} seg`;
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes} min`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} hr`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 30) return `${diffInDays} dias`;
    const diffInMonths = Math.floor(diffInDays / 30.44);
    if (diffInMonths < 12) return `${diffInMonths} meses`;
    return `${Math.floor(diffInDays / 365.25)} anos`;
}

/**
 * (NOVA FUNÇÃO)
 * Calcula os marcos cumulativos com base em um número de dias, seguindo as regras de negócio.
 * Esta função é uma implementação direta da melhoria arquitetural da "Prioridade 2".
 * @param {number} consecutiveDays - O total de dias consecutivos.
 * @returns {Array<{icon: string, count: number}>} - Um array com os marcos alcançados e seus contadores.
 */
export function calculateMilestones(consecutiveDays) {
    let remainingDays = consecutiveDays;
    const achievedMilestones = [];

    // Validação de entrada para garantir que o cálculo não falhe
    if (typeof remainingDays !== 'number' || remainingDays < 0) {
        return [];
    }

    // O loop itera sobre os marcos definidos em config.js (já em ordem de precedência)
    for (const milestone of MILESTONES) {
        // Verifica se o usuário tem dias suficientes para atingir o marco atual
        if (remainingDays >= milestone.days) {
            let count = 0;
            // Se o marco for do tipo 'principal', ele pode ser acumulado (empilhado)
            if (milestone.type === 'principal') {
                count = Math.floor(remainingDays / milestone.days);
                // O "troco" é o que sobra para o próximo cálculo
                remainingDays %= milestone.days;
            } else { // Se for do tipo 'etapa', só é contado uma vez
                count = 1;
                remainingDays -= milestone.days;
            }

            // Adiciona o marco à lista de resultados apenas se ele foi conquistado
            if (count > 0) {
                 achievedMilestones.push({ icon: milestone.icon, count: count });
            }
        }
    }
    
    return achievedMilestones;
}

/**
 * (NOVA FUNÇÃO - PRIORIDADE 2)
 * Gera o conteúdo HTML formatado para um arquivo .doc a partir de um alvo.
 * @param {object} target - O objeto do alvo de oração.
 * @returns {string} - O conteúdo HTML completo para o arquivo.
 */
export function generateDocContent(target) {
    // Formata o conteúdo principal do documento
    let docContent = `
        <h1>${target.title}</h1>
        <p><strong>Categoria:</strong> ${target.category || 'N/A'}</p>
        <p><strong>Data de Criação:</strong> ${formatDateForDisplay(target.date)}</p>
        <hr>
        <h3>Detalhes</h3>
        <p>${target.details ? target.details.replace(/\n/g, '<br>') : 'Sem detalhes.'}</p>
        <hr>
        <h3>Observações</h3>
    `;

    if (target.observations && target.observations.length > 0) {
        // Ordena as observações da mais antiga para a mais recente para o relatório
        const sortedObservations = [...target.observations].sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));
        sortedObservations.forEach(obs => {
            docContent += `<p><strong>${formatDateForDisplay(obs.date)}:</strong> ${obs.text}</p>`;
        });
    } else {
        docContent += '<p>Nenhuma observação registrada.</p>';
    }

    // Adiciona o cabeçalho e rodapé necessários para o formato Word
    const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' "+
          "xmlns:w='urn:schemas-microsoft-com:office:word' "+
          "xmlns='http://www.w3.org/TR/REC-html40'>"+
          "<head><meta charset='utf-8'><title>Exportação de Alvo</title></head><body>";
    const footer = "</body></html>";
    
    return header + docContent + footer;
}