import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readdirSync, readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inlineScriptHashes, buildCsp, cspMiddleware } from './csp.js';
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
const sha = body => `'sha256-${crypto.createHash('sha256').update(body, 'utf8').digest('base64')}'`;
test('libera por hash só scripts inline executáveis e ignora src, JSON-LD e vazios', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'csp-'));
  writeFileSync(path.join(dir, 'a.html'), '<script>var a=1</script><script src="/x.js" defer></script><script type="application/ld+json">{"a":1}</script><script> </script><script type="text/javascript">var b=2</script>');
  assert.deepEqual(inlineScriptHashes(dir).sort(), [sha('var a=1'), sha('var b=2')].sort());
});
test('todo script inline das páginas do site está coberto e sem placeholders que mudariam o hash', () => {
  const hashes = new Set(inlineScriptHashes(publicDir));
  assert.ok(hashes.size >= 1);
  for (const file of readdirSync(publicDir).filter(f => f.endsWith('.html'))) {
    for (const [, attrs, body] of readFileSync(path.join(publicDir, file), 'utf8').matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (/src=|ld\+json/.test(attrs) || !body.trim()) continue;
      assert.ok(hashes.has(sha(body)), `${file}: script inline sem hash`);
      assert.ok(!body.includes('__') && !body.includes('?v='), `${file}: o servidor trocaria texto dentro do script`);
    }
  }
});
test('política: scripts só do site, sem unsafe-inline em script, sem frames e sem object', () => {
  const csp = buildCsp(["'sha256-abc'"]);
  assert.match(csp, /script-src 'self' 'sha256-abc'(;|$)/);
  assert.doesNotMatch(csp.split('; ').find(d => d.startsWith('script-src')), /unsafe/);
  for (const d of ["object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'", "connect-src 'self'"]) assert.ok(csp.includes(d), d);
});
test('CSP_REPORT_ONLY=true troca o cabeçalho para modo de observação', () => {
  const headers = {};
  const res = { setHeader: (k, v) => (headers[k] = v) };
  cspMiddleware(publicDir, {})({}, res, () => {});
  assert.ok(headers['Content-Security-Policy']);
  const h2 = {};
  cspMiddleware(publicDir, { CSP_REPORT_ONLY: 'true' })({}, { setHeader: (k, v) => (h2[k] = v) }, () => {});
  assert.ok(h2['Content-Security-Policy-Report-Only'] && !h2['Content-Security-Policy']);
});
