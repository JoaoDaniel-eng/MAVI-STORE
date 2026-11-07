import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNoOrdersAlert, sanitizeClientError } from './alerts.js';
import { stampVersions, stampServiceWorker } from './build.js';

const settings = { opening_days: '0,1,2,3,4,5,6', opening_time: '13:30', closing_time: '22:00' };
// 15/11/2026 é domingo. UTC-3: 20:00 UTC = 17:00 em São Paulo.
const at17h = new Date('2026-11-15T20:00:00Z');

test('alerta quando está aberta há mais de 3 h e não há pedido', () => {
  assert.deepEqual(buildNoOrdersAlert({ settings, lastOrderAt: null, now: at17h }), { hours: 3 });
  assert.deepEqual(buildNoOrdersAlert({ settings, lastOrderAt: new Date('2026-11-14T22:00:00Z'), now: at17h }), { hours: 3 });
});
test('sem alerta com pedido recente, loja recém-aberta, fechada ou pausada', () => {
  assert.equal(buildNoOrdersAlert({ settings, lastOrderAt: new Date('2026-11-15T19:00:00Z'), now: at17h }), null);
  assert.equal(buildNoOrdersAlert({ settings, lastOrderAt: null, now: new Date('2026-11-15T17:30:00Z') }), null);
  assert.equal(buildNoOrdersAlert({ settings, lastOrderAt: null, now: new Date('2026-11-16T05:00:00Z') }), null);
  assert.equal(buildNoOrdersAlert({ settings: { ...settings, manual_closed: 'true' }, lastOrderAt: null, now: at17h }), null);
});
test('sanitizeClientError corta tamanhos e descarta mensagem vazia', () => {
  assert.equal(sanitizeClientError({ message: '  ' }), null);
  assert.equal(sanitizeClientError(null), null);
  const row = sanitizeClientError({ message: 'x'.repeat(900), line: '12', col: 'abc', stack: 'y'.repeat(5000), page: '/' });
  assert.equal(row.message.length, 500);
  assert.equal(row.line, 12);
  assert.equal(row.col, null);
  assert.equal(row.stack.length, 2000);
});
test('stampVersions troca todos os ?v= e o nome do cache do service worker', () => {
  assert.equal(stampVersions('<script src="/a.js?v=1"></script><link href="/b.css?v=20261101-rodada3-13">', 'abc'), '<script src="/a.js?v=abc"></script><link href="/b.css?v=abc">');
  const sw = stampServiceWorker("const CACHE_NAME = 'acai-da-roca-v20261101-rodada3-13';\n'/x.js?v=20261101-rodada3-13'", 'abc');
  assert.match(sw, /'acai-da-roca-vabc'/);
  assert.match(sw, /x\.js\?v=abc/);
});
