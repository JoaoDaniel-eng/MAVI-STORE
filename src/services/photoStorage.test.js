import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { parseCloudinaryUrl, signParams, isStoredPhotoUrl, uploadPhoto, downloadPhoto, deletePhoto } from './photoStorage.js';
const storage = { apiKey: '123', apiSecret: 'segredo', cloudName: 'minhaloja' };
test('lê a CLOUDINARY_URL e rejeita formatos errados', () => {
  assert.deepEqual(parseCloudinaryUrl('cloudinary://123:segredo@minhaloja'), storage);
  assert.equal(parseCloudinaryUrl(''), null);
  assert.equal(parseCloudinaryUrl('https://exemplo.com'), null);
  assert.equal(parseCloudinaryUrl('cloudinary://so-chave@minhaloja'), null);
});
test('assinatura: ordem alfabética, ignora vazios e usa SHA-1 com o segredo', () => {
  const esperado = crypto.createHash('sha1').update('folder=a&timestamp=10segredo').digest('hex');
  assert.equal(signParams({ timestamp: '10', folder: 'a', vazio: '' }, 'segredo'), esperado);
});
test('só aceita endereços https do Cloudinary da própria conta', () => {
  assert.equal(isStoredPhotoUrl('https://res.cloudinary.com/minhaloja/image/upload/v1/a.jpg', 'minhaloja'), true);
  assert.equal(isStoredPhotoUrl('https://res.cloudinary.com/outra/image/upload/v1/a.jpg', 'minhaloja'), false);
  assert.equal(isStoredPhotoUrl('http://res.cloudinary.com/minhaloja/a.jpg', 'minhaloja'), false);
  assert.equal(isStoredPhotoUrl('https://evil.example/minhaloja/a.jpg', 'minhaloja'), false);
  assert.equal(isStoredPhotoUrl('não é url', 'minhaloja'), false);
});
test('envio devolve url e id; erro do serviço vira exceção', async () => {
  let enviado;
  const ok = async (url, init) => { enviado = { url, form: init.body }; return { ok: true, status: 200, json: async () => ({ secure_url: 'https://res.cloudinary.com/minhaloja/image/upload/v1/avaliacoes/x.jpg', public_id: 'avaliacoes/x' }) }; };
  const r = await uploadPhoto(Buffer.from('abc'), { storage, fetchImpl: ok, now: () => 100 });
  assert.equal(r.publicId, 'avaliacoes/x');
  assert.match(enviado.url, /\/v1_1\/minhaloja\/image\/upload$/);
  assert.equal(enviado.form.get('signature'), signParams({ folder: 'acai-da-roca/avaliacoes', timestamp: '100' }, 'segredo'));
  assert.equal(enviado.form.get('api_secret'), null);
  const falha = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'Invalid Signature' } }) });
  await assert.rejects(() => uploadPhoto(Buffer.from('abc'), { storage, fetchImpl: falha }), /Invalid Signature/);
  const estranha = async () => ({ ok: true, status: 200, json: async () => ({ secure_url: 'https://evil.example/x.jpg', public_id: 'x' }) });
  await assert.rejects(() => uploadPhoto(Buffer.from('abc'), { storage, fetchImpl: estranha }), /não é confiável/);
});
test('download recusa endereço de fora e arquivo grande demais', async () => {
  const bytes = Buffer.from('imagem');
  const fetchOk = async () => ({ ok: true, headers: new Headers(), arrayBuffer: async () => bytes });
  assert.deepEqual(await downloadPhoto('https://res.cloudinary.com/minhaloja/a.jpg', { storage, fetchImpl: fetchOk }), bytes);
  assert.equal(await downloadPhoto('https://evil.example/a.jpg', { storage, fetchImpl: fetchOk }), null);
  const grande = async () => ({ ok: true, headers: new Headers({ 'content-length': String(5 * 1024 * 1024) }), arrayBuffer: async () => bytes });
  assert.equal(await downloadPhoto('https://res.cloudinary.com/minhaloja/a.jpg', { storage, fetchImpl: grande }), null);
});
test('apagar não derruba nada quando o serviço falha', async () => {
  const quebra = async () => { throw new Error('sem rede'); };
  assert.equal(await deletePhoto('avaliacoes/x', { storage, fetchImpl: quebra }), false);
  assert.equal(await deletePhoto('', { storage, fetchImpl: quebra }), false);
});
