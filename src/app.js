import express from 'express';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import publicRoutes from './routes/public.js';
import orderRoutes from './routes/orders.js';
import adminRoutes from './routes/admin.js';
import devRoutes from './routes/dev.js';
import customerRoutes from './routes/customers.js';
import { PricingError } from './services/pricing.js';
import { getPool } from './db/pool.js';
import { BUILD_ID, stampVersions, stampServiceWorker } from './services/build.js';
import { saveError } from './services/errorLog.js';
import { cspMiddleware } from './services/csp.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Monta o app Express sem abrir porta nem conectar ao banco. O server.js liga tudo; os testes de rota usam direto.
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(cspMiddleware(path.join(__dirname, '..', 'public')));
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (req.path === '/admin' || req.path.startsWith('/admin/') || req.path === '/dev' || req.path.startsWith('/dev/') || req.path.startsWith('/api/'))
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  });
  // Limites de corpo por rota (os parsers específicos vêm antes: o primeiro que lê o corpo vale).
  // Backup/restauração leva o banco inteiro (inclui fotos de avaliações); avaliação com foto chega perto de 1 MB; o resto cabe em 100 KB.
  app.use('/api/dev/backup', express.json({ limit: '10mb' }));
  app.use('/api/reviews', express.json({ limit: '1200kb' }));
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  // Express 5 deixa req.body indefinido quando a requisição não traz corpo; sem isso, rotas que leem req.body.campo dariam erro 500.
  app.use((req, _res, next) => {
    if (req.body === undefined)
      req.body = {};
    next();
  });
  app.use('/api', publicRoutes);
  app.use('/api', orderRoutes);
  app.use('/api', customerRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/dev', devRoutes);
  // SEO: endereço público do site. Defina SITE_URL no Render (ex.: https://www.seudominio.com.br); sem ela, usa o endereço da própria requisição.
  const siteUrl = req => (process.env.SITE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
  let indexHtml = null;
  const sendIndex = async (req, res, next) => {
    try {
      indexHtml ??= await readFile(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
      res.type('html').set('Cache-Control', 'no-cache').send(stampVersions(indexHtml.replaceAll('__SITE_URL__', siteUrl(req)).replaceAll('__BUILD_ID__', BUILD_ID)));
    }
    catch (err) {
      next(err);
    }
  };
  app.get(['/', '/index.html'], sendIndex);
  app.get('/robots.txt', (req, res) => res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${siteUrl(req)}/sitemap.xml\n`));
  app.get('/sitemap.xml', (req, res) => res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${siteUrl(req)}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>\n  <url><loc>${siteUrl(req)}/privacidade.html</loc><changefreq>yearly</changefreq><priority>0.3</priority></url>\n</urlset>\n`));
  // Painel e service worker também recebem o identificador da versão (cache novo a cada deploy, sem trocar números à mão).
  let adminHtml = null, devHtml = null, swJs = null;
  app.get('/admin', async (_req, res, next) => {
    try {
      adminHtml ??= stampVersions((await readFile(path.join(__dirname, '..', 'public', 'admin.html'), 'utf8')).replaceAll('__BUILD_ID__', BUILD_ID));
      res.type('html').set('Cache-Control', 'no-cache').send(adminHtml);
    }
    catch (err) {
      next(err);
    }
  });
  app.get('/dev', async (_req, res, next) => {
    try {
      devHtml ??= stampVersions((await readFile(path.join(__dirname, '..', 'public', 'dev.html'), 'utf8')).replaceAll('__BUILD_ID__', BUILD_ID));
      res.type('html').set('Cache-Control', 'no-store').send(devHtml);
    }
    catch (err) {
      next(err);
    }
  });
  app.get('/service-worker.js', async (_req, res, next) => {
    try {
      swJs ??= stampServiceWorker(await readFile(path.join(__dirname, '..', 'public', 'service-worker.js'), 'utf8'));
      res.type('application/javascript').set('Cache-Control', 'no-cache').send(swJs);
    }
    catch (err) {
      next(err);
    }
  });
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', app: 'Açaí da Roça' }));
  // Checa o banco com um SELECT 1 e limite de 5 s. Fica separado do /api/health de propósito: o Neon suspende o banco
  // quando ocioso e a primeira consulta pode demorar; se o Render usasse esta rota como health check, poderia
  // reiniciar o serviço à toa. Use em monitor externo (ex.: UptimeRobot).
  app.get('/api/health/db', async (_req, res) => {
    let timer;
    try {
      await Promise.race([
        getPool().query('SELECT 1'),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 5000); })
      ]);
      res.json({ status: 'ok', database: 'ok' });
    }
    catch {
      res.status(503).json({ status: 'error', database: 'indisponível' });
    }
    finally {
      clearTimeout(timer);
    }
  });
  app.use((req, res) => req.path.startsWith('/api/') ? res.status(404).json({ error: 'Rota não encontrada.' }) : res.status(404).sendFile(path.join(__dirname, '..', 'public', '404.html')));
  // O Express só reconhece um tratador de erros com 4 parâmetros, mesmo que o último não seja usado.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err instanceof PricingError)
      return res.status(err.status).json({ error: err.message });
    if (err.type === 'entity.too.large')
      return res.status(413).json({ error: 'Os dados enviados são grandes demais.' });
    if (err.type === 'entity.parse.failed')
      return res.status(400).json({ error: 'Dados inválidos.' });
    console.error(err);
    saveError({ kind: 'servidor', message: String(err.message || err), stack: err.stack, page: `${req.method} ${req.path}`.slice(0, 200), build: BUILD_ID, userAgent: String(req.get('user-agent') || '').slice(0, 300), ip: String(req.ip || '').slice(0, 120) });
    if (err.code === '23503')
      return res.status(400).json({ error: 'Não foi possível concluir por causa de uma referência inválida.' });
    res.status(500).json({ error: 'Ocorreu um erro interno. Tente novamente.' });
  });
  return app;
}
