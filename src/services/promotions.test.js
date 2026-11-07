import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateComboDiscount, calculateLoyaltyPoints } from './promotions.js';
test('combo aplica desconto configurado quando atinge a quantidade mínima', () => {
  assert.equal(calculateComboDiscount(4000, 2, 2, 5), 200);
});
test('combo não aplica desconto abaixo da quantidade mínima', () => {
  assert.equal(calculateComboDiscount(4000, 1, 2, 5), 0);
});
test('desconto de combo nunca ultrapassa 50 por cento', () => {
  assert.equal(calculateComboDiscount(10000, 3, 2, 90), 5000);
});
test('fidelidade concede um ponto por real completo em produtos', () => {
  assert.equal(calculateLoyaltyPoints(2599), 25);
  assert.equal(calculateLoyaltyPoints(99), 0);
});
