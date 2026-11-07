import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEmail, validatePassword, normalizeEmail, likePattern, clampLimit } from './devAccounts.js';
test('e-mail é normalizado e validado', () => {
  assert.equal(normalizeEmail('  Dona@Loja.COM '), 'dona@loja.com');
  assert.deepEqual(validateEmail(' Dona@Loja.com '), { email: 'dona@loja.com' });
  assert.ok(validateEmail('sem-arroba').error);
  assert.ok(validateEmail('a@b').error);
  assert.ok(validateEmail('').error);
});
test('senha exige 10 caracteres e tem teto', () => {
  assert.ok(validatePassword('curta123').error);
  assert.ok(validatePassword(undefined).error);
  assert.equal(validatePassword('1234567890').password, '1234567890');
  assert.ok(validatePassword('x'.repeat(201)).error);
});
test('busca escapa curingas do LIKE e limita o tamanho', () => {
  assert.equal(likePattern(''), null);
  assert.equal(likePattern('  '), null);
  assert.equal(likePattern('50%_x'), '%50\\%\\_x%');
  assert.equal(likePattern('a'.repeat(200)).length, 82);
});
test('limite de linhas fica entre 1 e o teto', () => {
  assert.equal(clampLimit(undefined, 100), 100);
  assert.equal(clampLimit('abc', 100), 100);
  assert.equal(clampLimit(-5, 100), 100);
  assert.equal(clampLimit(9999, 100, 300), 300);
  assert.equal(clampLimit('25'), 25);
});
