import test from 'node:test';
import assert from 'node:assert/strict';
import { convertConsumptionToStockUnit } from './inventory.js';
test('converte gramas para estoque cadastrado em kg', () => {
  assert.equal(convertConsumptionToStockUnit(20, 'g', 'kg'), 0.02);
});
test('converte mililitros para estoque cadastrado em litros', () => {
  assert.equal(convertConsumptionToStockUnit(30, 'ml', 'l'), 0.03);
});
test('mantém consumo quando a unidade já é igual', () => {
  assert.equal(convertConsumptionToStockUnit(20, 'g', 'g'), 20);
});
test('rejeita unidades incompatíveis', () => {
  assert.throws(() => convertConsumptionToStockUnit(20, 'g', 'un'), /não combina/);
});
import { convertStockQuantity, defaultConsumptionUnit, stockStatus } from './inventory.js';
test('troca kg para g mantendo o saldo', () => {
  assert.equal(convertStockQuantity(2.5, 'kg', 'g'), 2500);
});
test('troca g para kg sem erro de ponto flutuante', () => {
  assert.equal(convertStockQuantity(300, 'g', 'kg'), 0.3);
});
test('troca l e ml', () => {
  assert.equal(convertStockQuantity(1.5, 'l', 'ml'), 1500);
});
test('rejeita troca entre unidades não conversíveis', () => {
  assert.throws(() => convertStockQuantity(1, 'kg', 'un'), /Só é possível/);
});
test('unidade de consumo padrão', () => {
  assert.equal(defaultConsumptionUnit('kg'), 'g');
  assert.equal(defaultConsumptionUnit('l'), 'ml');
  assert.equal(defaultConsumptionUnit('un'), 'un');
});
test('status do medidor: bom, acabando e esgotado', () => {
  assert.equal(stockStatus({ quantity: 8, capacity: 10, minimum: 0 }).key, 'good');
  assert.equal(stockStatus({ quantity: 2, capacity: 10, minimum: 0 }).key, 'low');
  assert.equal(stockStatus({ quantity: 0, capacity: 10, minimum: 0 }).key, 'empty');
});
test('status respeita o alerta mínimo configurado', () => {
  assert.equal(stockStatus({ quantity: 4, capacity: 10, minimum: 5 }).key, 'low');
});
import { convertStockToConsumption } from './inventory.js';
test('consumo por tamanho: açaí em litros, 300 ml e 1 L', () => {
  assert.equal(convertConsumptionToStockUnit(300, 'ml', 'l'), 0.3);
  assert.equal(convertConsumptionToStockUnit(1000, 'ml', 'l'), 1);
  assert.equal(convertStockToConsumption(0.3, 'ml', 'l'), 300);
  assert.equal(convertStockToConsumption(1, 'ml', 'l'), 1000);
});
test('caminho inverso mantém a mesma unidade quando não há conversão', () => {
  assert.equal(convertStockToConsumption(30, 'g', 'g'), 30);
  assert.equal(convertStockToConsumption(0.03, 'g', 'kg'), 30);
  assert.equal(convertStockToConsumption(2, 'un', 'un'), 2);
});
import { soldOutSizeIds, findStockShortage } from './inventory.js';
// Açaí em litros: 300 ml = 0,3 L, 1 L = 1 L. Saldo de 1,2 L.
const acai = (size_id, quantity, stock = 1.2) => ({ inventory_item_id: 1, size_id, quantity, stock, name: 'Açaí' });
test('tamanho esgota quando o saldo não cobre um copo', () => {
  const rows = [acai(1, 0.3), acai(2, 0.4), acai(5, 1)];
  assert.deepEqual([...soldOutSizeIds(rows.map(r => ({ ...r, stock: 0.35 })))].sort(), [2, 5]);
  assert.deepEqual([...soldOutSizeIds(rows)], []);
  assert.deepEqual([...soldOutSizeIds(rows.map(r => ({ ...r, stock: 0 })))].sort(), [1, 2, 5]);
});
test('pedido soma os copos antes de comparar com o saldo', () => {
  const rows = [acai(1, 0.3), acai(5, 1)];
  assert.equal(findStockShortage([{ sizeId: 1, quantity: 4 }], rows), null); // 1,2 L cabe exato
  assert.equal(findStockShortage([{ sizeId: 1, quantity: 5 }], rows).name, 'Açaí'); // 1,5 L não cabe
  assert.equal(findStockShortage([{ sizeId: 5, quantity: 1 }, { sizeId: 1, quantity: 1 }], rows).need, 1.3); // soma tamanhos diferentes
});
test('tamanho sem receita não bloqueia nada', () => {
  assert.equal(findStockShortage([{ sizeId: 6, quantity: 3 }], [acai(1, 0.3)]), null);
});
test('arredondamento de ponto flutuante não esgota por engano', () => {
  assert.equal(findStockShortage([{ sizeId: 1, quantity: 3 }], [acai(1, 0.1, 0.30000000000000004)]), null);
  assert.equal(soldOutSizeIds([acai(1, 0.3, 0.3)]).size, 0);
});
