// Armazenamento das fotos de avaliação fora do banco (Cloudinary, plano gratuito).
// Sem SDK: só fetch e uma assinatura SHA-1. Se CLOUDINARY_URL não estiver definida, o site continua
// guardando a foto no banco (comportamento anterior), então nada quebra enquanto a conta não é criada.
// Formato: CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME
import crypto from 'node:crypto';
const FOLDER = 'acai-da-roca/avaliacoes';
const MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024;
export function parseCloudinaryUrl(value) {
  const m = /^cloudinary:\/\/([^:@\s]+):([^@\s]+)@([A-Za-z0-9_-]+)$/.exec(String(value || '').trim());
  return m ? { apiKey: m[1], apiSecret: m[2], cloudName: m[3] } : null;
}
export function getPhotoStorage(env = process.env) {
  return parseCloudinaryUrl(env.CLOUDINARY_URL);
}
// Assinatura do Cloudinary: parâmetros em ordem alfabética (k=v&k=v) + segredo, em SHA-1.
export function signParams(params, secret) {
  const text = Object.keys(params).filter(k => params[k] !== undefined && params[k] !== '').sort().map(k => `${k}=${params[k]}`).join('&');
  return crypto.createHash('sha1').update(text + secret).digest('hex');
}
export function isStoredPhotoUrl(url, cloudName) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 'res.cloudinary.com' && (!cloudName || u.pathname.startsWith(`/${cloudName}/`));
  }
  catch {
    return false;
  }
}
export async function uploadPhoto(bytes, { storage = getPhotoStorage(), fetchImpl = fetch, now = () => Math.floor(Date.now() / 1000) } = {}) {
  if (!storage)
    throw new Error('Armazenamento de fotos não configurado.');
  const timestamp = String(now());
  const params = { folder: FOLDER, timestamp };
  const form = new FormData();
  form.set('file', `data:image/jpeg;base64,${Buffer.from(bytes).toString('base64')}`);
  form.set('api_key', storage.apiKey);
  form.set('timestamp', timestamp);
  form.set('folder', FOLDER);
  form.set('signature', signParams(params, storage.apiSecret));
  const res = await fetchImpl(`https://api.cloudinary.com/v1_1/${storage.cloudName}/image/upload`, { method: 'POST', body: form, signal: AbortSignal.timeout(20000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.secure_url || !data.public_id)
    throw new Error(`Falha ao enviar a foto (${res.status}): ${data?.error?.message || 'resposta inesperada'}`);
  if (!isStoredPhotoUrl(data.secure_url, storage.cloudName))
    throw new Error('O endereço devolvido pelo armazenamento não é confiável.');
  return { url: data.secure_url, publicId: data.public_id };
}
// O servidor busca a foto e entrega ao navegador: o endereço do arquivo nunca aparece para o cliente
// (fotos de avaliações ainda não aprovadas não ficam acessíveis por link).
export async function downloadPhoto(url, { storage = getPhotoStorage(), fetchImpl = fetch } = {}) {
  if (!isStoredPhotoUrl(url, storage?.cloudName))
    return null;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok)
    return null;
  const length = Number(res.headers.get('content-length') || 0);
  if (length > MAX_DOWNLOAD_BYTES)
    return null;
  const bytes = Buffer.from(await res.arrayBuffer());
  return bytes.length && bytes.length <= MAX_DOWNLOAD_BYTES ? bytes : null;
}
// Melhor esforço: se falhar, a foto fica órfã no Cloudinary, mas a avaliação é removida do mesmo jeito.
export async function deletePhoto(publicId, { storage = getPhotoStorage(), fetchImpl = fetch, now = () => Math.floor(Date.now() / 1000) } = {}) {
  if (!storage || !publicId)
    return false;
  try {
    const timestamp = String(now());
    const form = new FormData();
    form.set('public_id', publicId);
    form.set('api_key', storage.apiKey);
    form.set('timestamp', timestamp);
    form.set('signature', signParams({ public_id: publicId, timestamp }, storage.apiSecret));
    const res = await fetchImpl(`https://api.cloudinary.com/v1_1/${storage.cloudName}/image/destroy`, { method: 'POST', body: form, signal: AbortSignal.timeout(15000) });
    return res.ok;
  }
  catch (err) {
    console.error('Não foi possível apagar a foto do armazenamento:', err.message);
    return false;
  }
}
