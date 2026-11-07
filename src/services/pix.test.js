import test from 'node:test';
import assert from 'node:assert/strict';
import { crc16, buildPixPayload, buildOrderPix, normalizePixKey, sanitizePixText, validatePixSetting } from './pix.js';
// Lê o BR Code como lista de campos (id, tamanho, valor).
function parse(payload) {
  const out = {};
  let i = 0;
  while (i < payload.length) {
    const id = payload.slice(i, i + 2), len = Number(payload.slice(i + 2, i + 4));
    assert.ok(Number.isInteger(len), 'tamanho inválido em ' + id);
    out[id] = payload.slice(i + 4, i + 4 + len);
    i += 4 + len;
  }
  assert.equal(i, payload.length, 'sobrou ou faltou texto');
  return out;
}
test('CRC16/CCITT-FALSE confere com o vetor padrão', () => {
  assert.equal(crc16('123456789'), '29B1');
});
test('payload do Pix tem campos, valor e CRC corretos', () => {
  const p = buildPixPayload({ key: '+5521969081157', name: 'ACAI DA ROCA', city: 'MENDES', amountCents: 3550, txid: 'AR-ABC123' });
  const f = parse(p);
  assert.equal(f['00'], '01');
  assert.equal(f['01'], '11');
  assert.equal(f['52'], '0000');
  assert.equal(f['53'], '986');
  assert.equal(f['54'], '35.50');
  assert.equal(f['58'], 'BR');
  assert.equal(f['59'], 'ACAI DA ROCA');
  assert.equal(f['60'], 'MENDES');
  assert.deepEqual(parse(f['26']), { '00': 'br.gov.bcb.pix', '01': '+5521969081157' });
  assert.deepEqual(parse(f['62']), { '05': 'ARABC123' });
  assert.ok(p.endsWith('6304' + crc16(p.slice(0, -4))));
  assert.equal(f['63'].length, 4);
});
test('pedido sem chave configurada não gera Pix', () => {
  assert.equal(buildOrderPix({}, { amountCents: 1000, orderCode: 'AR-1' }), null);
  assert.equal(buildOrderPix({ pix_key: 'a@b.com', pix_name: 'LOJA' }, { amountCents: 1000, orderCode: 'AR-1' }), null);
  const ok = buildOrderPix({ pix_key: 'a@b.com', pix_name: 'LOJA', pix_city: 'MENDES' }, { amountCents: 1000, orderCode: 'AR-1' });
  assert.equal(ok.key, 'a@b.com');
  assert.match(ok.payload, /^000201/);
});
test('chaves Pix aceitas e recusadas', () => {
  assert.equal(normalizePixKey('123.456.789-09').key, '12345678909');
  assert.equal(normalizePixKey('12.345.678/0001-95').key, '12345678000195');
  assert.equal(normalizePixKey('+55 (21) 96908-1157').key, '+5521969081157');
  assert.equal(normalizePixKey('Loja@Email.com').key, 'loja@email.com');
  assert.equal(normalizePixKey('123E4567-E12B-12D1-A456-426655440000').key, '123e4567-e12b-12d1-a456-426655440000');
  assert.equal(normalizePixKey('').key, '');
  assert.ok(normalizePixKey('21969081157x').error);
  assert.ok(normalizePixKey('1234').error);
});
test('nome e cidade saem em maiúsculas, sem acento e com limite', () => {
  assert.equal(sanitizePixText('Açaí da Roça', 25), 'ACAI DA ROCA');
  assert.equal(sanitizePixText('São João de Meriti - RJ', 15), 'SAO JOAO DE MER');
  assert.equal(validatePixSetting('pix_name', 'Açaí da Roça').value, 'ACAI DA ROCA');
  assert.ok(validatePixSetting('pix_city', '!!!').error);
});

test('celular sem +55 não é aceito como CPF e CPF/CNPJ conferem os dígitos', () => {
  assert.ok(normalizePixKey('21969081157').error);
  assert.ok(normalizePixKey('123.456.789-10').error);
  assert.ok(normalizePixKey('12345678000100').error);
  assert.equal(normalizePixKey('+5521969081157').key, '+5521969081157');
});
