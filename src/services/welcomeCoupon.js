import { randomInt } from 'node:crypto';
// Cupom de boas-vindas: 5% na primeira compra, gerado no cadastro, ligado à conta do cliente e de uso único.
// Fica na mesma tabela `coupons` dos cupons do painel; o que o diferencia é kind='welcome' + customer_id preenchido.
export const WELCOME_KIND = 'welcome';
export const WELCOME_PERCENT = 5;
// Sem 0/O/1/I/L para ninguém errar ao digitar o código.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function generateWelcomeCode(random = randomInt) {
  let suffix = '';
  for (let i = 0; i < 6; i++) suffix += ALPHABET[random(ALPHABET.length)];
  return `BEMVINDO-${suffix}`;
}
// Estado mostrado ao cliente: disponível, já usado ou desativado pela loja.
export function couponStatus(row) {
  if (row.used_at) return 'used';
  if (!row.active) return 'inactive';
  return 'available';
}
export function presentWelcomeCoupon(row) {
  return {
    code: row.code,
    percent: Number(row.discount_value),
    status: couponStatus(row),
    usedAt: row.used_at || null,
    createdAt: row.created_at
  };
}
// Emite o cupom do cliente recém-cadastrado. Regras:
//  - só quem nunca fez pedido com esse telefone ganha (é cupom de PRIMEIRA compra);
//  - no máximo um por conta (índice único no banco; chamar duas vezes devolve o mesmo cupom);
//  - se o código sortear igual a outro existente, tenta de novo.
// `db` pode ser o pool ou um client. Devolve a linha do cupom, ou null se o cliente não tem direito.
export async function issueWelcomeCoupon(db, customerId, phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  const existing = await db.query('SELECT * FROM coupons WHERE customer_id=$1 AND kind=$2', [customerId, WELCOME_KIND]);
  if (existing.rowCount) return existing.rows[0];
  const prior = await db.query("SELECT 1 FROM orders WHERE regexp_replace(customer_phone,'[^0-9]','','g')=$1 LIMIT 1", [digits]);
  if (prior.rowCount) return null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateWelcomeCode();
    const r = await db.query(
      `INSERT INTO coupons(code,discount_type,discount_value,min_subtotal_cents,kind,customer_id)
       VALUES($1,'percent',$2,0,$3,$4) ON CONFLICT DO NOTHING RETURNING *`,
      [code, WELCOME_PERCENT, WELCOME_KIND, customerId]
    );
    if (r.rowCount) return r.rows[0];
    // Conflito: ou o código já existe (sorteia outro) ou a conta já tinha cupom (corrida entre dois cadastros).
    const again = await db.query('SELECT * FROM coupons WHERE customer_id=$1 AND kind=$2', [customerId, WELCOME_KIND]);
    if (again.rowCount) return again.rows[0];
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Regra de uso único (Parte 2)
// Um cupom pessoal (customer_id preenchido) só vale para a conta dona, uma vez. O "marcar como usado" é um UPDATE
// condicional (used_at IS NULL) feito na MESMA transação que grava o pedido: se duas compras tentarem o mesmo cupom
// ao mesmo tempo, o Postgres faz a segunda esperar a primeira e ela encontra o cupom já usado (0 linhas) → recusa.
// ---------------------------------------------------------------------------------------------------------------------
export const INVALID_COUPON_MESSAGE = 'Cupom inválido ou indisponível.';
export const USED_COUPON_MESSAGE = 'Este cupom já foi usado.';
export const LOGIN_COUPON_MESSAGE = 'Este cupom é pessoal. Entre na sua conta para usá-lo.';

export const isPersonalCoupon = row => row?.customer_id != null;

// Decide se `row` (linha de coupons, ou undefined se o código não existe) pode ser usada por `customerId`
// (cliente logado, ou null/undefined se anônimo). Devolve null se pode, ou { reason, message }:
//   reason 'invalid' (não existe / desativado / é de outra conta), 'login' (pessoal e ninguém logado) ou 'used'.
// Cupom de OUTRA conta responde igual a "não existe", para ninguém descobrir códigos alheios.
export function couponProblem(row, customerId) {
  if (!row) return { reason: 'invalid', message: INVALID_COUPON_MESSAGE };
  if (!isPersonalCoupon(row)) return row.active ? null : { reason: 'invalid', message: INVALID_COUPON_MESSAGE };
  if (!customerId) return { reason: 'login', message: LOGIN_COUPON_MESSAGE };
  if (Number(row.customer_id) !== Number(customerId)) return { reason: 'invalid', message: INVALID_COUPON_MESSAGE };
  if (row.used_at) return { reason: 'used', message: USED_COUPON_MESSAGE };
  if (!row.active) return { reason: 'invalid', message: INVALID_COUPON_MESSAGE };
  return null;
}

// Cupom pelo código (manual ou pessoal), com o que couponProblem precisa. `db` = pool ou client.
export async function findCouponByCode(db, code) {
  const r = await db.query(
    'SELECT id,code,discount_type,discount_value,min_subtotal_cents,active,customer_id,used_at FROM coupons WHERE code=$1',
    [code]
  );
  return r.rows[0];
}

// Marca o cupom pessoal como usado por este pedido. Só funciona se ainda estiver livre, ativo e for da conta.
// Chamar DENTRO da transação do pedido. Devolve true se este pedido ficou com o cupom, false se perdeu a corrida.
export async function claimPersonalCoupon(db, { couponId, customerId, orderId }) {
  const r = await db.query(
    'UPDATE coupons SET used_at=NOW(),used_order_id=$3 WHERE id=$1 AND customer_id=$2 AND kind=$4 AND used_at IS NULL AND active=true RETURNING id',
    [couponId, customerId, orderId, WELCOME_KIND]
  );
  return r.rowCount === 1;
}

// Devolve ao cliente o cupom que estava preso a este pedido (cancelamento, ou pedido apagado sem ter sido entregue).
// Sem efeito se o pedido não usou cupom pessoal, então pode ser chamado em todo cancelamento. Devolve o código ou null.
export async function releasePersonalCoupon(db, orderId) {
  const r = await db.query(
    'UPDATE coupons SET used_at=NULL,used_order_id=NULL WHERE used_order_id=$1 AND kind=$2 AND used_at IS NOT NULL RETURNING code',
    [orderId, WELCOME_KIND]
  );
  return r.rows[0]?.code || null;
}

// Cupom para REPRECIFICAR um pedido já feito (edição). Vale o cupom manual ainda ativo OU o cupom pessoal que já está
// preso a este pedido (ele já foi usado por ele, então "used_at" não conta e a loja desativá-lo depois também não).
export async function findCouponForEdit(db, code, orderId) {
  const r = await db.query(
    'SELECT code,discount_type,discount_value,min_subtotal_cents FROM coupons WHERE code=$1 AND ((active=true AND customer_id IS NULL) OR (kind=$3 AND used_order_id=$2))',
    [code, orderId, WELCOME_KIND]
  );
  return r.rows[0] || null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Visão da loja (Parte 3, etapa 3.3)
// O painel lista os cupons de boas-vindas separados dos cupons manuais: de quem é, se já foi usado e em qual pedido.
// Eles são automáticos: a loja só consulta (não edita nem exclui).
// ---------------------------------------------------------------------------------------------------------------------
export const WELCOME_CODE_PREFIX = 'BEMVINDO-';
export const WELCOME_LOCKED_MESSAGE =
  'Cupons de boas-vindas são automáticos: não dá para editar nem excluir. Eles aparecem na lista "Cupons de boas-vindas".';
export const WELCOME_RESERVED_PREFIX_MESSAGE = `O início ${WELCOME_CODE_PREFIX} é reservado aos cupons de boas-vindas automáticos. Escolha outro código.`;
export const WELCOME_ADMIN_STATUSES = ['available', 'used', 'inactive'];
export const WELCOME_ADMIN_DEFAULT_LIMIT = 200;
export const WELCOME_ADMIN_MAX_LIMIT = 500;

// Entrada: { status, q, limit } vindos da query string. Saída: { where, params, limit } ou { error }.
// "where" já começa com "WHERE" e sempre restringe a kind='welcome'. Parâmetros começam em $1; o limite é o último.
export function buildWelcomeAdminFilter({ status = 'all', q = '', limit } = {}) {
  status = String(status || 'all');
  if (status !== 'all' && !WELCOME_ADMIN_STATUSES.includes(status)) return { error: 'Filtro de status inválido.' };
  const conds = ['c.kind = $1'], params = [WELCOME_KIND];
  const add = v => { params.push(v); return `$${params.length}`; };
  if (status === 'used') conds.push('c.used_at IS NOT NULL');
  if (status === 'available') conds.push('c.used_at IS NULL AND c.active = TRUE');
  if (status === 'inactive') conds.push('c.used_at IS NULL AND c.active = FALSE');
  const text = String(q || '').trim().slice(0, 80);
  if (text) {
    const like = add('%' + text.replace(/[\\%_]/g, '\\$&') + '%');
    const parts = [`c.code ILIKE ${like}`, `cu.name ILIKE ${like}`, `o.order_code ILIKE ${like}`];
    const digits = text.replace(/\D/g, '');
    if (digits.length >= 3) parts.push(`regexp_replace(cu.phone, '\\D', '', 'g') LIKE ${add('%' + digits + '%')}`);
    conds.push(`(${parts.join(' OR ')})`);
  }
  const n = Number.parseInt(limit, 10);
  const safeLimit = Number.isInteger(n) && n > 0 ? Math.min(n, WELCOME_ADMIN_MAX_LIMIT) : WELCOME_ADMIN_DEFAULT_LIMIT;
  return { where: `WHERE ${conds.join(' AND ')}`, params, limit: safeLimit };
}

// Linha do JOIN (coupons + customers + orders) → o que o painel mostra.
// order é null se o cupom não está em uso. orderDeleted = o cupom consta como usado, mas o pedido não existe mais
// (pedido entregue e depois apagado mantém o cupom usado, como decidido na Parte 2).
export function presentAdminWelcomeCoupon(row) {
  const used = Boolean(row.used_at);
  const orderFound = row.order_code != null;
  return {
    id: Number(row.id),
    code: row.code,
    percent: Number(row.discount_value),
    status: couponStatus(row),
    createdAt: row.created_at,
    usedAt: row.used_at || null,
    customer: { id: Number(row.customer_id), name: row.customer_name, phone: row.customer_phone },
    order: used && orderFound ? { id: Number(row.used_order_id), code: row.order_code, status: row.order_status } : null,
    orderDeleted: used && !orderFound
  };
}
