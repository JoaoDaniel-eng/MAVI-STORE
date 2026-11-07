import test from 'node:test';
import assert from 'node:assert/strict';
import { createAttemptLimiter } from './rateLimit.js';
test('bloqueia só depois de atingir o máximo', () => {
  const l = createAttemptLimiter({ max: 3, windowMs: 1000 });
  for (let i = 0; i < 2; i++)
    l.record('a', 0);
  assert.equal(l.isBlocked('a', 10), false);
  l.record('a', 20);
  assert.equal(l.isBlocked('a', 30), true);
});
test('consultar não conta como tentativa', () => {
  const l = createAttemptLimiter({ max: 2, windowMs: 1000 });
  for (let i = 0; i < 10; i++)
    l.isBlocked('a', i);
  assert.equal(l.isBlocked('a', 20), false);
});
test('volta a aceitar quando a janela passa', () => {
  const l = createAttemptLimiter({ max: 2, windowMs: 1000 });
  l.record('a', 0);
  l.record('a', 100);
  assert.equal(l.isBlocked('a', 500), true);
  assert.equal(l.isBlocked('a', 1001), false);
});
test('chaves diferentes não se misturam e reset libera', () => {
  const l = createAttemptLimiter({ max: 1, windowMs: 1000 });
  l.record('a', 0);
  assert.equal(l.isBlocked('a', 1), true);
  assert.equal(l.isBlocked('b', 1), false);
  l.reset('a');
  assert.equal(l.isBlocked('a', 2), false);
});
test('informa quantos segundos faltam', () => {
  const l = createAttemptLimiter({ max: 2, windowMs: 60000 });
  l.record('a', 0);
  l.record('a', 10000);
  assert.equal(l.retryAfterSeconds('a', 20000), 40);
  assert.equal(l.retryAfterSeconds('b', 20000), 0);
});
