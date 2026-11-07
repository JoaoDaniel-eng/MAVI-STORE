// Validação da foto enviada em uma avaliação.
// O navegador reduz a imagem e a converte para JPEG antes de enviar; aqui o servidor
// confere de novo (tipo, tamanho e assinatura do arquivo) para não confiar só no cliente.
export const MAX_PHOTO_BYTES = 700 * 1024;
const DATA_URL = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/;
export function parseReviewPhoto(input) {
  if (input === undefined || input === null || input === '')
    return { photo: null };
  if (typeof input !== 'string' || input.length > Math.ceil(MAX_PHOTO_BYTES * 4 / 3) + 64) {
    return { error: 'A foto é grande demais. Escolha outra imagem.' };
  }
  const match = DATA_URL.exec(input);
  if (!match)
    return { error: 'Formato de foto inválido. Envie uma imagem JPG, PNG ou WebP.' };
  const bytes = Buffer.from(match[1], 'base64');
  if (bytes.length < 200 || bytes.length > MAX_PHOTO_BYTES) {
    return { error: 'A foto é grande demais ou está corrompida. Escolha outra imagem.' };
  }
  // JPEG sempre começa com FF D8 FF.
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    return { error: 'O arquivo enviado não é uma imagem válida.' };
  }
  return { photo: input, bytes };
}
export function photoBufferFromDataUrl(dataUrl) {
  const match = DATA_URL.exec(String(dataUrl || ''));
  return match ? Buffer.from(match[1], 'base64') : null;
}
// Limite simples por IP (em memória) para o envio de avaliações: evita enchimento do banco.
export function createRateLimiter({ max = 5, windowMs = 60 * 60 * 1000 } = {}) {
  const hits = new Map();
  return function allow(key, now = Date.now()) {
    if (hits.size > 5000)
      for (const [k, list] of hits)
        if (!list.some(t => now - t < windowMs))
          hits.delete(k);
    const recent = (hits.get(key) || []).filter(t => now - t < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    return true;
  };
}
