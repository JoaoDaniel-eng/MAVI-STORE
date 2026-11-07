import { randomInt } from 'node:crypto';
// Alfabeto sem caracteres ambíguos (0/O, 1/I) para o cliente ler e digitar o código sem erro.
// 32 símbolos ^ 6 posições ≈ 1 bilhão de códigos, sorteados com gerador criptográfico (não previsível).
export const ORDER_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ORDER_CODE_PATTERN = /^AR-[A-Z0-9]{6}$/;
export function makeOrderCode() {
  let suffix = '';
  for (let i = 0; i < 6; i++)
    suffix += ORDER_CODE_ALPHABET[randomInt(ORDER_CODE_ALPHABET.length)];
  return 'AR-' + suffix;
}
