import crypto from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
// Content-Security-Policy: o navegador só executa scripts do próprio site (e os scripts inline conhecidos, liberados por hash).
// Se alguém conseguir injetar um <script> ou um onclick numa página, ele não roda, e o token guardado no navegador fica protegido.
const INLINE_SCRIPT = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
// Hash (sha256) de cada <script> inline executável dos .html de public/. Blocos de dados (ex.: JSON-LD) não são executados e ficam de fora.
export function inlineScriptHashes(publicDir) {
  const hashes = new Set();
  for (const file of readdirSync(publicDir).filter(f => f.endsWith('.html'))) {
    for (const [, attrs, body] of readFileSync(path.join(publicDir, file), 'utf8').matchAll(INLINE_SCRIPT)) {
      if (/\bsrc\s*=/i.test(attrs) || (/\btype\s*=/i.test(attrs) && !/type\s*=\s*["']?(text|application)\/javascript/i.test(attrs)) || !body.trim())
        continue;
      hashes.add(`'sha256-${crypto.createHash('sha256').update(body, 'utf8').digest('base64')}'`);
    }
  }
  return [...hashes];
}
export function buildCsp(hashes = []) {
  return [
    "default-src 'self'",
    `script-src 'self' ${hashes.join(' ')}`.trim(),
    // Folhas de estilo: só do site e do Google Fonts. Atributos style="..." (barras de progresso etc.) continuam permitidos.
    "style-src 'self' https://fonts.googleapis.com",
    "style-src-attr 'unsafe-inline'",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; ');
}
// Middleware. Com CSP_REPORT_ONLY=true o navegador só avisa no console o que bloquearia, sem bloquear (para investigar).
export function cspMiddleware(publicDir, env = process.env) {
  const value = buildCsp(inlineScriptHashes(publicDir)), header = String(env.CSP_REPORT_ONLY).toLowerCase() === 'true' ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
  return (_req, res, next) => {
    res.setHeader(header, value);
    next();
  };
}
