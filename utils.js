--- START OF FILE utils.js ---
// utils.js
// Responsabilidade: Conter funções utilitárias puras e reutilizáveis em toda a aplicação.

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
--- END OF FILE utils.js ---