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
 * Gera e inicia o download de um PDF para um alvo de oração.
 * @param {object} target - O objeto do alvo a ser exportado.
 */
export function generateAndDownloadPdf(target) {
    // Assegura que a biblioteca jsPDF foi carregada
    if (!window.jspdf) {
        console.error("jsPDF não está carregado!");
        alert("Não foi possível gerar o PDF. A biblioteca de exportação não foi carregada.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const margin = 15;
    let y = 20; // Posição vertical inicial

    // Título do Documento
    doc.setFontSize(18);
    doc.text(target.title, margin, y);
    y += 10;

    // Informações Gerais
    doc.setFontSize(11);
    doc.text(`Categoria: ${target.category || 'N/A'}`, margin, y);
    y += 7;
    doc.text(`Data de Criação: ${formatDateForDisplay(target.date)}`, margin, y);
    y += 10;
    doc.line(margin, y - 5, 200, y - 5); // Linha separadora

    // Detalhes
    doc.setFontSize(14);
    doc.text("Detalhes:", margin, y);
    y += 8;
    doc.setFontSize(11);
    // O método 'splitTextToSize' quebra o texto longo em várias linhas automaticamente
    const detailsLines = doc.splitTextToSize(target.details || 'Sem detalhes.', 180);
    doc.text(detailsLines, margin, y);
    y += (detailsLines.length * 5) + 5; // Aumenta o 'y' baseado no número de linhas
    doc.line(margin, y - 2, 200, y - 2);

    // Observações
    y += 8;
    doc.setFontSize(14);
    doc.text("Histórico de Observações:", margin, y);
    y += 8;
    doc.setFontSize(11);

    if (target.observations && target.observations.length > 0) {
        const sortedObs = [...target.observations].sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));
        sortedObs.forEach(obs => {
            const obsText = `[${formatDateForDisplay(obs.date)}] ${obs.text}`;
            const obsLines = doc.splitTextToSize(obsText, 180);
            
            // Verifica se há espaço na página
            if (y + (obsLines.length * 5) > 280) {
                doc.addPage();
                y = 20; // Reseta a posição na nova página
            }

            doc.text(obsLines, margin, y);
            y += (obsLines.length * 5) + 3;
        });
    } else {
        doc.text("Nenhuma observação registrada.", margin, y);
    }

    // Gera o nome do arquivo e salva
    const fileName = `${target.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
    doc.save(fileName);
}
