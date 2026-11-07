import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReviewPhoto, photoBufferFromDataUrl, createRateLimiter, MAX_PHOTO_BYTES } from './reviews.js';
const jpegUrl = (size = 1000) => {
  const b = Buffer.alloc(size, 7);
  b[0] = 0xff;
  b[1] = 0xd8;
  b[2] = 0xff;
  return 'data:image/jpeg;base64,' + b.toString('base64');
};
test('sem foto é válido', () => {
  assert.deepEqual(parseReviewPhoto(undefined), { photo: null });
  assert.deepEqual(parseReviewPhoto(''), { photo: null });
});
test('aceita JPEG válido', () => {
  const r = parseReviewPhoto(jpegUrl());
  assert.ok(r.photo && !r.error);
  assert.equal(photoBufferFromDataUrl(r.photo)[0], 0xff);
});
test('rejeita tipos que não são JPEG, texto e arquivos maiores que o limite', () => {
  assert.ok(parseReviewPhoto('data:image/svg+xml;base64,PHN2Zz4=').error);
  assert.ok(parseReviewPhoto('data:text/html;base64,PGgxPg==').error);
  assert.ok(parseReviewPhoto(12345).error);
  assert.ok(parseReviewPhoto(jpegUrl(MAX_PHOTO_BYTES + 10)).error);
});
test('rejeita JPEG falso (assinatura errada)', () => {
  const fake = 'data:image/jpeg;base64,' + Buffer.alloc(1000, 1).toString('base64');
  assert.ok(parseReviewPhoto(fake).error);
});
test('limite por IP libera de novo depois da janela', () => {
  const allow = createRateLimiter({ max: 2, windowMs: 1000 });
  assert.equal(allow('a', 0), true);
  assert.equal(allow('a', 10), true);
  assert.equal(allow('a', 20), false);
  assert.equal(allow('b', 20), true);
  assert.equal(allow('a', 1500), true);
});
