// Pix "copia e cola" estático (BR Code), gerado só com a chave da loja: não precisa de conta em provedor de pagamento.
// O dinheiro cai direto na conta da chave; a loja confere o recebimento no app do banco.
const tlv = (id, value) => id + String(value.length).padStart(2, '0') + value;
// CRC16/CCITT-FALSE exigido pelo padrão do Banco Central.
export function crc16(text) {
  let crc = 0xffff;
  for (const byte of Buffer.from(text, 'utf8')) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++)
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
// Nome e cidade do recebedor: maiúsculas, sem acento e só letras/números (regra do BR Code).
export function sanitizePixText(text, max) {
  return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ').trim().toUpperCase().slice(0, max).trim();
}
// Confere os dígitos verificadores. Um celular digitado sem +55 tem 11 números e parecia CPF: o banco recusava o código.
const allSame = d => /^(\d)\1+$/.test(d);
export function isValidCpf(d) {
  if (!/^\d{11}$/.test(d) || allSame(d))
    return false;
  for (const n of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < n; i++)
      sum += Number(d[i]) * (n + 1 - i);
    if (((sum * 10) % 11) % 10 !== Number(d[n]))
      return false;
  }
  return true;
}
export function isValidCnpj(d) {
  if (!/^\d{14}$/.test(d) || allSame(d))
    return false;
  for (const n of [12, 13]) {
    const weights = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + w * Number(d[i]), 0);
    const r = sum % 11;
    if ((r < 2 ? 0 : 11 - r) !== Number(d[n]))
      return false;
  }
  return true;
}
// Aceita CPF, CNPJ (só números), celular com +55, e-mail e chave aleatória. Celular precisa do +55 para não
// ser confundido com CPF (os dois têm 11 dígitos).
export function normalizePixKey(input) {
  const raw = String(input || '').trim();
  if (!raw)
    return { key: '' };
  if (raw.length > 77)
    return { error: 'A chave Pix é longa demais.' };
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw))
    return { key: raw.toLowerCase() };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw))
    return { key: raw.toLowerCase() };
  const phone = raw.replace(/[\s()-]/g, '');
  if (/^\+55\d{10,11}$/.test(phone))
    return { key: phone };
  if (/^[\d.\-/]+$/.test(raw)) {
    const digits = raw.replace(/\D/g, '');
    if (isValidCpf(digits) || isValidCnpj(digits))
      return { key: digits };
    if (digits.length === 11 || digits.length === 14)
      return { error: 'Esse CPF/CNPJ não é válido. Se a chave é um celular, escreva com +55 na frente (ex.: +5521999999999).' };
  }
  return { error: 'Chave Pix inválida. Use CPF ou CNPJ (só números), celular com +55 (ex.: +5521999999999), e-mail ou chave aleatória.' };
}
// Valida/normaliza um campo de configuração do Pix. Devolve { value } ou { error }.
export function validatePixSetting(key, value) {
  if (key === 'pix_key') {
    const r = normalizePixKey(value);
    return r.error ? { error: r.error } : { value: r.key };
  }
  const max = key === 'pix_name' ? 25 : 15;
  const clean = sanitizePixText(value, max);
  if (String(value).trim() && !clean)
    return { error: key === 'pix_name' ? 'Informe o nome do recebedor com letras ou números.' : 'Informe a cidade com letras ou números.' };
  return { value: clean };
}
export function buildPixPayload({ key, name, city, amountCents, txid }) {
  const merchant = tlv('00', 'br.gov.bcb.pix') + tlv('01', key);
  const tx = String(txid || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
  const body = tlv('00', '01') + tlv('01', '11') + tlv('26', merchant) + tlv('52', '0000') + tlv('53', '986')
    + (amountCents > 0 ? tlv('54', (amountCents / 100).toFixed(2)) : '')
    + tlv('58', 'BR') + tlv('59', name) + tlv('60', city) + tlv('62', tlv('05', tx)) + '6304';
  return body + crc16(body);
}
// Pix do pedido, ou null quando a loja não configurou a chave (ou o valor é zero).
export function buildOrderPix(settings, { amountCents, orderCode }) {
  const key = String(settings?.pix_key || ''), name = String(settings?.pix_name || ''), city = String(settings?.pix_city || '');
  if (!key || !name || !city || !(amountCents > 0))
    return null;
  return { payload: buildPixPayload({ key, name, city, amountCents, txid: orderCode }), key, name, amountCents };
}
