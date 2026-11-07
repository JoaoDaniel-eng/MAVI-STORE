// Validação das contas do painel da loja criadas/alteradas pelo desenvolvedor.
export const MIN_PASSWORD_LENGTH = 10;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase().slice(0, 254);
}
export function validateEmail(value) {
  const email = normalizeEmail(value);
  return EMAIL_PATTERN.test(email) ? { email } : { error: 'Informe um e-mail válido.' };
}
export function validatePassword(value) {
  const password = String(value ?? '');
  if (password.length < MIN_PASSWORD_LENGTH)
    return { error: `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  if (password.length > 200)
    return { error: 'A senha pode ter no máximo 200 caracteres.' };
  return { password };
}
// Filtros das listas de erros e auditoria: limita o tamanho e escapa curingas do LIKE.
export function likePattern(value) {
  const q = String(value || '').trim().slice(0, 80);
  return q ? `%${q.replace(/[\\%_]/g, c => '\\' + c)}%` : null;
}
export function clampLimit(value, fallback = 100, max = 300) {
  const n = Number(value);
  return Math.min(max, Math.max(1, Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback));
}
