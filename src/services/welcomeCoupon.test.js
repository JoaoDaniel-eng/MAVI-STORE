import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateWelcomeCode,
  couponStatus,
  presentWelcomeCoupon,
  issueWelcomeCoupon,
  couponProblem,
  claimPersonalCoupon,
  releasePersonalCoupon,
  findCouponForEdit,
  buildWelcomeAdminFilter,
  presentAdminWelcomeCoupon,
  WELCOME_ADMIN_DEFAULT_LIMIT,
  WELCOME_ADMIN_MAX_LIMIT,
  INVALID_COUPON_MESSAGE,
  USED_COUPON_MESSAGE,
  LOGIN_COUPON_MESSAGE,
  WELCOME_PERCENT
} from './welcomeCoupon.js';
import { priceOrder } from './pricing.js';
test('código de boas-vindas tem prefixo e 6 caracteres sem letras ambíguas', () => {
  for (let i = 0; i < 200; i++) assert.match(generateWelcomeCode(), /^BEMVINDO-[A-HJKMNP-Z2-9]{6}$/);
});
test('códigos gerados não se repetem em sequência', () => {
  assert.equal(new Set(Array.from({ length: 500 }, () => generateWelcomeCode())).size, 500);
});
test('status: usado vence desativado, que vence disponível', () => {
  assert.equal(couponStatus({ active: true, used_at: null }), 'available');
  assert.equal(couponStatus({ active: false, used_at: null }), 'inactive');
  assert.equal(couponStatus({ active: true, used_at: '2026-11-02T10:00:00Z' }), 'used');
  assert.equal(couponStatus({ active: false, used_at: '2026-11-02T10:00:00Z' }), 'used');
});
test('presentWelcomeCoupon devolve só o que o cliente precisa ver', () => {
  const p = presentWelcomeCoupon({ id: 9, code: 'BEMVINDO-ABC234', discount_value: 5, active: true, used_at: null, created_at: 'x', customer_id: 1 });
  assert.deepEqual(p, { code: 'BEMVINDO-ABC234', percent: 5, status: 'available', usedAt: null, createdAt: 'x' });
});
// Banco de mentira só para exercitar a lógica de decisão de issueWelcomeCoupon.
function fakeDb({ hasCoupon = false, hasOrders = false, conflicts = 0 } = {}) {
  const calls = [];
  let inserted = null, left = conflicts;
  return {
    calls,
    async query(sql, params) {
      calls.push(sql.trim().split(/\s+/)[0] + ' ' + (sql.match(/FROM (\w+)|INTO (\w+)/)?.[0] || ''));
      if (sql.includes('FROM coupons WHERE customer_id')) return { rowCount: hasCoupon || inserted ? 1 : 0, rows: [hasCoupon ? { code: 'JA-EXISTE' } : inserted] };
      if (sql.includes('FROM orders')) return { rowCount: hasOrders ? 1 : 0, rows: [] };
      if (sql.includes('INSERT INTO coupons')) {
        if (left-- > 0) return { rowCount: 0, rows: [] };
        inserted = { code: params[0], discount_value: params[1], kind: params[2], customer_id: params[3] };
        return { rowCount: 1, rows: [inserted] };
      }
      throw new Error('consulta inesperada: ' + sql);
    }
  };
}
test('cliente novo sem pedidos ganha cupom de 5% ligado à conta', async () => {
  const c = await issueWelcomeCoupon(fakeDb(), 7, '(21) 99999-0000');
  assert.equal(c.discount_value, WELCOME_PERCENT);
  assert.equal(c.customer_id, 7);
  assert.equal(c.kind, 'welcome');
});
test('quem já pediu antes com esse telefone não ganha cupom de primeira compra', async () => {
  assert.equal(await issueWelcomeCoupon(fakeDb({ hasOrders: true }), 7, '21999990000'), null);
});
test('chamar duas vezes devolve o cupom existente, sem criar outro', async () => {
  const db = fakeDb({ hasCoupon: true });
  assert.equal((await issueWelcomeCoupon(db, 7, '21999990000')).code, 'JA-EXISTE');
  assert.ok(!db.calls.some(c => c.startsWith('INSERT')));
});
test('se o código sortear repetido, tenta outro', async () => {
  const c = await issueWelcomeCoupon(fakeDb({ conflicts: 2 }), 7, '21999990000');
  assert.ok(c.code.startsWith('BEMVINDO-'));
});

// ---- Parte 2: regra de uso único ----
const manual = { id: 1, code: 'TESTE10', customer_id: null, active: true, used_at: null };
const mine = { id: 2, code: 'BEMVINDO-ABC234', customer_id: 7, active: true, used_at: null };
test('cupom que não existe é inválido', () => {
  assert.deepEqual(couponProblem(undefined, 7), { reason: 'invalid', message: INVALID_COUPON_MESSAGE });
});
test('cupom manual ativo vale para qualquer um, logado ou não; desativado não vale', () => {
  assert.equal(couponProblem(manual, null), null);
  assert.equal(couponProblem(manual, 7), null);
  assert.equal(couponProblem({ ...manual, active: false }, 7).reason, 'invalid');
});
test('cupom pessoal: o dono logado pode usar', () => {
  assert.equal(couponProblem(mine, 7), null);
  assert.equal(couponProblem(mine, '7'), null);
});
test('cupom pessoal sem login pede para entrar na conta', () => {
  assert.deepEqual(couponProblem(mine, null), { reason: 'login', message: LOGIN_COUPON_MESSAGE });
});
test('cupom pessoal de outra conta responde igual a "não existe" (não revela que o código existe)', () => {
  assert.deepEqual(couponProblem(mine, 8), couponProblem(undefined, 8));
  assert.deepEqual(couponProblem({ ...mine, used_at: '2026-11-02T10:00:00Z' }, 8), couponProblem(undefined, 8));
});
test('cupom pessoal já usado é recusado; desativado pela loja também', () => {
  assert.deepEqual(couponProblem({ ...mine, used_at: '2026-11-02T10:00:00Z' }, 7), { reason: 'used', message: USED_COUPON_MESSAGE });
  assert.equal(couponProblem({ ...mine, active: false }, 7).reason, 'invalid');
});
test('5% do cupom pessoal incide sobre o subtotal já sem o combo, e não sobre a entrega', () => {
  const coupon = { code: 'BEMVINDO-ABC234', discount_type: 'percent', discount_value: WELCOME_PERCENT, min_subtotal_cents: 0 };
  const p = priceOrder({ subtotalCents: 6000, itemCount: 3, deliveryFeeCents: 500, combo: { minItems: 3, percent: 10 }, coupon });
  assert.equal(p.comboDiscountCents, 600);
  assert.equal(p.couponDiscountCents, 270); // 5% de 5400
  assert.equal(p.totalCents, 5630); // 5400 - 270 + 500
  assert.equal(priceOrder({ subtotalCents: 2099, itemCount: 1, coupon }).couponDiscountCents, 104); // arredonda para baixo
});
// Banco de mentira que só guarda a consulta e os parâmetros, para conferir as condições do SQL.
function recordingDb(rows = [], rowCount = rows.length) {
  const calls = [];
  return { calls, async query(sql, params) { calls.push({ sql, params }); return { rows, rowCount }; } };
}
test('claim: só marca se estiver livre (used_at IS NULL), ativo e da conta, e diz se ganhou', async () => {
  const won = recordingDb([{ id: 2 }], 1);
  assert.equal(await claimPersonalCoupon(won, { couponId: 2, customerId: 7, orderId: 99 }), true);
  const { sql, params } = won.calls[0];
  assert.match(sql, /^UPDATE coupons SET used_at=NOW\(\),used_order_id=\$3 WHERE/);
  for (const part of ['used_at IS NULL', 'customer_id=$2', 'active=true', 'kind=$4']) assert.ok(sql.includes(part), part);
  assert.deepEqual(params, [2, 7, 99, 'welcome']);
  assert.equal(await claimPersonalCoupon(recordingDb([], 0), { couponId: 2, customerId: 7, orderId: 100 }), false);
});
test('release: devolve o cupom preso ao pedido e informa o código (ou null se o pedido não usou cupom pessoal)', async () => {
  const db = recordingDb([{ code: 'BEMVINDO-ABC234' }], 1);
  assert.equal(await releasePersonalCoupon(db, 99), 'BEMVINDO-ABC234');
  assert.ok(db.calls[0].sql.includes('used_at=NULL,used_order_id=NULL'));
  assert.ok(db.calls[0].sql.includes('used_order_id=$1'));
  assert.deepEqual(db.calls[0].params, [99, 'welcome']);
  assert.equal(await releasePersonalCoupon(recordingDb([], 0), 5), null);
});
test('edição: aceita o cupom manual ativo OU o pessoal já preso a este pedido', async () => {
  const db = recordingDb([{ code: 'X' }], 1);
  assert.deepEqual(await findCouponForEdit(db, 'X', 99), { code: 'X' });
  assert.ok(db.calls[0].sql.includes('used_order_id=$2'));
  assert.deepEqual(db.calls[0].params, ['X', 99, 'welcome']);
  assert.equal(await findCouponForEdit(recordingDb([], 0), 'Y', 99), null);
});

// ---- Visão da loja (Parte 3, etapa 3.3) ----
test('painel: sem filtros, só restringe a cupons de boas-vindas e usa o limite padrão', () => {
  const f = buildWelcomeAdminFilter({});
  assert.equal(f.where, 'WHERE c.kind = $1');
  assert.deepEqual(f.params, ['welcome']);
  assert.equal(f.limit, WELCOME_ADMIN_DEFAULT_LIMIT);
});
test('painel: filtro de status vira condição fixa (sem parâmetro) e status desconhecido é recusado', () => {
  assert.match(buildWelcomeAdminFilter({ status: 'used' }).where, /c\.used_at IS NOT NULL/);
  assert.match(buildWelcomeAdminFilter({ status: 'available' }).where, /c\.used_at IS NULL AND c\.active = TRUE/);
  assert.match(buildWelcomeAdminFilter({ status: 'inactive' }).where, /c\.used_at IS NULL AND c\.active = FALSE/);
  assert.equal(buildWelcomeAdminFilter({ status: 'all' }).where, 'WHERE c.kind = $1');
  assert.ok(buildWelcomeAdminFilter({ status: "used'; DROP TABLE coupons;--" }).error);
});
test('painel: busca usa parâmetros (nunca texto no SQL), escapa % e _ e só busca telefone com 3+ dígitos', () => {
  const f = buildWelcomeAdminFilter({ q: "a%_' OR x=y" });
  assert.ok(!f.where.includes('OR x=y'));
  assert.equal(f.params[1], "%a\\%\\_' OR x=y%");
  assert.ok(!f.where.includes('regexp_replace'));
  const g = buildWelcomeAdminFilter({ q: '(21) 99900-1234' });
  assert.match(g.where, /regexp_replace\(cu\.phone/);
  assert.equal(g.params[2], '%21999001234%');
  assert.match(g.where, /c\.code ILIKE \$2/);
  assert.match(g.where, /o\.order_code ILIKE \$2/);
});
test('painel: limite é inteiro positivo, no máximo 500', () => {
  assert.equal(buildWelcomeAdminFilter({ limit: '50' }).limit, 50);
  assert.equal(buildWelcomeAdminFilter({ limit: '99999' }).limit, WELCOME_ADMIN_MAX_LIMIT);
  assert.equal(buildWelcomeAdminFilter({ limit: '-3' }).limit, WELCOME_ADMIN_DEFAULT_LIMIT);
  assert.equal(buildWelcomeAdminFilter({ limit: 'abc' }).limit, WELCOME_ADMIN_DEFAULT_LIMIT);
});
test('painel: presentAdminWelcomeCoupon — disponível, usado com pedido, usado com pedido apagado e desativado', () => {
  const base = { id: '7', code: 'BEMVINDO-ABC234', discount_value: 5, active: true, created_at: '2026-11-02T10:00:00Z', customer_id: '3', customer_name: 'Ana', customer_phone: '21999001234', used_at: null, used_order_id: null, order_code: null, order_status: null };
  const free = presentAdminWelcomeCoupon(base);
  assert.equal(free.status, 'available');
  assert.equal(free.order, null);
  assert.equal(free.orderDeleted, false);
  assert.deepEqual(free.customer, { id: 3, name: 'Ana', phone: '21999001234' });
  assert.equal(free.percent, 5);
  const used = presentAdminWelcomeCoupon({ ...base, used_at: '2026-11-02T11:00:00Z', used_order_id: '41', order_code: 'ACAI-X', order_status: 'delivered' });
  assert.equal(used.status, 'used');
  assert.deepEqual(used.order, { id: 41, code: 'ACAI-X', status: 'delivered' });
  assert.equal(used.orderDeleted, false);
  const gone = presentAdminWelcomeCoupon({ ...base, used_at: '2026-11-02T11:00:00Z', used_order_id: '41' });
  assert.equal(gone.status, 'used');
  assert.equal(gone.order, null);
  assert.equal(gone.orderDeleted, true);
  assert.equal(presentAdminWelcomeCoupon({ ...base, active: false }).status, 'inactive');
  assert.equal(presentAdminWelcomeCoupon({ ...base, active: false, used_at: '2026-11-02T11:00:00Z' }).status, 'used');
});
