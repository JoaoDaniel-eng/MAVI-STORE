import { getLocalParts, isOpenAt } from './time.js';
const toMinutes = hm => { const [h, m] = String(hm).split(':').map(Number); return h * 60 + m; };
// Loja aberta há pelo menos `hours` horas e sem nenhum pedido (não cancelado) nesse tempo: devolve { hours }; senão null.
export function buildNoOrdersAlert({ settings, lastOrderAt, now = new Date(), hours = 3 }) {
  if (settings.manual_closed === 'true' || !isOpenAt(now, settings)) return null;
  const p = getLocalParts(now);
  const sinceOpen = toMinutes(`${p.hour}:${p.minute}`) - toMinutes(settings.opening_time || '13:30');
  const sinceOrder = lastOrderAt ? (now - new Date(lastOrderAt)) / 60000 : Infinity;
  const limit = hours * 60;
  if (sinceOpen < limit || sinceOrder < limit) return null;
  return { hours: Math.floor(Math.min(sinceOpen, sinceOrder) / 60) };
}
const cut = (v, n) => String(v ?? '').slice(0, n);
const toInt = v => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : null);
// Limpa o que o navegador do cliente envia: corta tamanhos e descarta lixo. Devolve null se não há mensagem.
export function sanitizeClientError(body) {
  const b = body && typeof body === 'object' ? body : {};
  const message = cut(b.message, 500).trim();
  if (!message)
    return null;
  return { message, source: cut(b.source, 300) || null, line: toInt(b.line), col: toInt(b.col), stack: cut(b.stack, 2000) || null, page: cut(b.page, 200) || null, build: cut(b.build, 20) || null };
}
