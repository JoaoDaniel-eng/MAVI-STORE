import test from 'node:test';
import assert from 'node:assert/strict';
import { makeOrderCode, ORDER_CODE_PATTERN, ORDER_CODE_ALPHABET } from './orderCode.js';
test('código do pedido segue o formato esperado pelas rotas', () => {
  for (let i = 0; i < 500; i++)
    assert.match(makeOrderCode(), ORDER_CODE_PATTERN);
});
test('código do pedido não usa caracteres ambíguos', () => {
  assert.doesNotMatch(ORDER_CODE_ALPHABET, /[01IO]/);
});
test('códigos gerados variam (sem repetição em amostra grande)', () => {
  const codes = new Set(Array.from({ length: 2000 }, makeOrderCode));
  assert.ok(codes.size > 1990);
});
