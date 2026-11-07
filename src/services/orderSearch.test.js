import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOrderFilter, ordersToCsv } from './orderSearch.js';

test('sem filtros: sem WHERE', () => {
  assert.deepEqual(buildOrderFilter({}), { where: '', params: [] });
  assert.deepEqual(buildOrderFilter(), { where: '', params: [] });
});
test('status, busca por texto/telefone e datas viram parâmetros', () => {
  const f = buildOrderFilter({ status: 'delivered', q: ' (21) 99999-0000 ', from: '2026-11-01', to: '2026-11-30' });
  assert.match(f.where, /^WHERE status = \$1 AND \(order_code ILIKE \$2 OR customer_name ILIKE \$2 OR neighborhood ILIKE \$2 OR regexp_replace\(customer_phone, '\\D', '', 'g'\) LIKE \$3\) AND created_at >= \(\$4::date\)/);
  assert.deepEqual(f.params, ['delivered', '%(21) 99999-0000%', '%21999990000%', '2026-11-01', '2026-11-30']);
});
test('curingas do LIKE são escapados e texto curto não busca telefone', () => {
  const f = buildOrderFilter({ q: '50%_x' });
  assert.deepEqual(f.params, ['%50\\%\\_x%']);
  assert.doesNotMatch(f.where, /regexp_replace/);
});
test('status ou data inválidos são recusados', () => {
  assert.equal(buildOrderFilter({ status: 'x' }).error, 'Filtro de status inválido.');
  assert.equal(buildOrderFilter({ from: '2026-02-31' }).error, 'Data inválida.');
  assert.equal(buildOrderFilter({ to: 'ontem' }).error, 'Data inválida.');
});
test('CSV: cabeçalho, valores em reais, aspas e proteção contra fórmula', () => {
  const csv = ordersToCsv([{ order_code: 'AR-1', created_at: '2026-11-15T20:00:00Z', customer_name: '=SOMA(A1)', customer_phone: '21999990000', neighborhood: 'Centro', address: 'Rua "A"; 10', items: [{ quantity: 2, size: '500 ml', options: [{ name: 'Granola' }, { name: 'Leite em pó' }] }], payment_method: 'Pix', change_for: null, coupon_code: null, subtotal_cents: 3500, delivery_fee_cents: 500, total_cents: 4000, status: 'delivered', scheduled_for: null, notes: 'sem\ngranola' }]);
  const [head, line] = csv.replace('\uFEFF', '').split('\r\n');
  assert.equal(head.split(';')[0], 'Código');
  assert.ok(csv.startsWith('\uFEFF'));
  assert.equal(line, "AR-1;15/11/2026 17:00;'=SOMA(A1);21999990000;Centro;\"Rua \"\"A\"\"; 10\";2x 500 ml (Granola, Leite em pó);Pix;;;35,00;5,00;40,00;Entregue;;sem granola;0");
  // Pedido com colheres sai com a quantidade na última coluna.
  const comColher = ordersToCsv([{ order_code: 'AR-2', created_at: '2026-11-15T20:00:00Z', items: [], subtotal_cents: 0, delivery_fee_cents: 0, total_cents: 20, status: 'new', spoon_quantity: 2 }]);
  assert.ok(comColher.split('\r\n')[1].endsWith(';2'));
});
