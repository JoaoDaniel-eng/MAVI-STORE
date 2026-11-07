// "Versão da sessão": instante em que a senha da conta mudou pela última vez (0 se nunca mudou).
// O login grava esse número no token (campo pwv); a cada requisição o servidor compara com o valor atual da conta.
// Trocou a senha, o número muda e todos os tokens antigos deixam de valer, em qualquer aparelho.
export const versionOf = value => (value ? new Date(value).getTime() : 0);
export const tokenVersion = payload => Number(payload?.pwv) || 0;
