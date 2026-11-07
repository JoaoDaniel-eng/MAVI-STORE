import test from 'node:test';
import assert from 'node:assert/strict';
import { isOpenAt, getLocalParts, money } from './time.js';
const settings = { opening_days: '2,3,4,5,6,0', opening_time: '13:30', closing_time: '22:00' };
test('loja abre dentro da janela configurada no horário de São Paulo', () => {
  // 2026-10-27 é terça-feira; 17:00 UTC corresponde a 14:00 em São Paulo.
  assert.equal(isOpenAt(new Date('2026-10-27T17:00:00Z'), settings), true);
});
test('loja fica fechada antes do horário de abertura', () => {
  assert.equal(isOpenAt(new Date('2026-10-27T16:00:00Z'), settings), false);
});
test('segunda-feira fica fechada com os dias padrão', () => {
  assert.equal(isOpenAt(new Date('2026-10-26T17:00:00Z'), settings), false);
});
test('horário de fechamento é exclusivo', () => {
  assert.equal(isOpenAt(new Date('2026-10-27T01:00:00Z'), settings), false);
});
test('formata centavos como moeda brasileira', () => {
  assert.match(money(1200), /12,00/);
});
test('partes locais usam timezone de São Paulo', () => {
  const p = getLocalParts(new Date('2026-10-27T17:00:00Z'));
  assert.equal(p.hour, '14');
  assert.equal(p.weekday, 'Tue');
});
