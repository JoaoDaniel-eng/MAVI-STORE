import { getLocalParts } from './time.js';
// Filtro e exportação do histórico de pedidos (painel). Funções puras: montam SQL parametrizado e o CSV.
const STATUSES = ['new', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'];
const STATUS_LABEL = { new: 'Novo', preparing: 'Preparando', out_for_delivery: 'Saiu para entrega', delivered: 'Entregue', cancelled: 'Cancelado' };
const validDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
// Entrada: { status, q, from, to } (texto livre e datas AAAA-MM-DD no fuso de São Paulo).
// Saída: { where, params } para usar em "SELECT ... FROM orders ${where}", ou { error }.
export function buildOrderFilter({ status = 'all', q = '', from = '', to = '' } = {}) {
  status = String(status || 'all');
  from = String(from || '').trim();
  to = String(to || '').trim();
  if (status !== 'all' && !STATUSES.includes(status))
    return { error: 'Filtro de status inválido.' };
  if ((from && !validDate(from)) || (to && !validDate(to)))
    return { error: 'Data inválida.' };
  const conds = [], params = [];
  const add = v => { params.push(v); return `$${params.length}`; };
  if (status !== 'all')
    conds.push(`status = ${add(status)}`);
  const text = String(q || '').trim().slice(0, 80);
  if (text) {
    const like = add('%' + text.replace(/[\\%_]/g, '\\$&') + '%');
    const parts = [`order_code ILIKE ${like}`, `customer_name ILIKE ${like}`, `neighborhood ILIKE ${like}`];
    const digits = text.replace(/\D/g, '');
    if (digits.length >= 3)
      parts.push(`regexp_replace(customer_phone, '\\D', '', 'g') LIKE ${add('%' + digits + '%')}`);
    conds.push(`(${parts.join(' OR ')})`);
  }
  if (from)
    conds.push(`created_at >= (${add(from)}::date)::timestamp AT TIME ZONE 'America/Sao_Paulo'`);
  if (to)
    conds.push(`created_at < ((${add(to)}::date + 1))::timestamp AT TIME ZONE 'America/Sao_Paulo'`);
  return { where: conds.length ? `WHERE ${conds.join(' AND ')}` : '', params };
}
const brMoney = c => (Number(c || 0) / 100).toFixed(2).replace('.', ',');
const fmtDate = d => { if (!d) return ''; const p = getLocalParts(new Date(d)); return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`; };
// Aspas quando preciso; texto que começa com = + - @ ganha um apóstrofo para o Excel não executar como fórmula.
const cell = v => {
  let s = String(v ?? '').replace(/\r?\n/g, ' ');
  if (/^[=+\-@\t]/.test(s))
    s = "'" + s;
  return /[";]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const itemsText = items => (Array.isArray(items) ? items : []).map(i => `${i.quantity}x ${i.size || i.product || ''}${Array.isArray(i.options) && i.options.length ? ` (${i.options.map(o => o.name).join(', ')})` : ''}`).join(' | ');
// CSV com ";" e BOM (abre direto no Excel em português).
export function ordersToCsv(rows) {
  const head = ['Código', 'Data', 'Cliente', 'Telefone', 'Bairro', 'Endereço', 'Itens', 'Pagamento', 'Troco para', 'Cupom', 'Subtotal', 'Entrega', 'Total', 'Status', 'Agendado para', 'Observações', 'Colheres'];
  const lines = rows.map(o => [o.order_code, fmtDate(o.created_at), o.customer_name, o.customer_phone, o.neighborhood, o.address, itemsText(o.items), o.payment_method, o.change_for, o.coupon_code, brMoney(o.subtotal_cents), brMoney(o.delivery_fee_cents), brMoney(o.total_cents), STATUS_LABEL[o.status] || o.status, fmtDate(o.scheduled_for), o.notes, Number(o.spoon_quantity) || 0].map(cell).join(';'));
  return '\uFEFF' + [head.join(';'), ...lines].join('\r\n') + '\r\n';
}
