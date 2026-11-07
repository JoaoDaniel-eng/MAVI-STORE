import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getPool } from '../db/pool.js';
import { requireDev } from '../middleware/auth.js';
import { auditMutations, logLogin, ipOf } from '../services/audit.js';
import { createAttemptLimiter } from '../services/rateLimit.js';
import { BUILD_ID } from '../services/build.js';
import { getPhotoStorage } from '../services/photoStorage.js';
import { backupDownload, backupVerify, backupRestore } from '../services/backup.js';
import { versionOf } from '../services/sessionVersion.js';
import { validateEmail, validatePassword, normalizeEmail, likePattern, clampLimit } from '../services/devAccounts.js';
// Painel do desenvolvedor (/dev): login próprio, separado do painel da loja.
const router = Router();
const loginByIp = createAttemptLimiter({ max: 5, windowMs: 15 * 60 * 1000 }), loginByEmail = createAttemptLimiter({ max: 10, windowMs: 15 * 60 * 1000 });
const DUMMY_HASH = bcrypt.hashSync('sem-desenvolvedor-cadastrado', 10);
// Sessão mais curta que a do painel da loja: 12 h por padrão (DEV_TOKEN_TTL muda, ex.: 2h, 30m, 3d).
const devTokenTtl = () => { const v = String(process.env.DEV_TOKEN_TTL || '12h').trim(); return /^\d{1,3}[mhd]$/.test(v) ? v : '12h'; };
router.post('/login', async (req, res, next) => {
  try {
    const db = getPool(), ip = ipOf(req);
    const email = normalizeEmail(req.body.email), password = String(req.body.password || '').slice(0, 200);
    const wait = Math.max(loginByIp.retryAfterSeconds(ip), loginByEmail.retryAfterSeconds(email));
    if (wait > 0) {
      res.set('Retry-After', String(wait));
      return res.status(429).json({ error: `Muitas tentativas de login. Aguarde ${Math.ceil(wait / 60)} minuto(s) e tente novamente.` });
    }
    const { rows } = await db.query('SELECT id,email,password_hash,password_changed_at FROM developers WHERE email=$1', [email]);
    const matches = await bcrypt.compare(password, rows[0] ? rows[0].password_hash : DUMMY_HASH);
    if (!rows[0] || !matches) {
      loginByIp.record(ip);
      loginByEmail.record(email);
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }
    loginByIp.reset(ip);
    loginByEmail.reset(email);
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
      return res.status(500).json({ error: 'JWT_SECRET precisa ter pelo menos 32 caracteres.' });
    const token = jwt.sign({ devId: rows[0].id, email: rows[0].email, type: 'developer', pwv: versionOf(rows[0].password_changed_at) }, process.env.JWT_SECRET, { expiresIn: devTokenTtl(), algorithm: 'HS256' });
    await logLogin({ actor: 'dev', email: rows[0].email, ip });
    res.json({ token, email: rows[0].email });
  }
  catch (e) {
    next(e);
  }
});
router.use(requireDev);
router.use(auditMutations('dev'));
router.get('/me', (req, res) => res.json({ email: req.dev.email }));
// Visão geral: saúde do banco, versão, memória e quais variáveis de ambiente estão configuradas (nunca os valores secretos).
router.get('/overview', async (_req, res, next) => {
  try {
    const pool = getPool(), t0 = Date.now();
    await pool.query('SELECT 1');
    const latencyMs = Date.now() - t0;
    const counts = (await pool.query(`SELECT (SELECT COUNT(*) FROM orders)::int AS orders, (SELECT COUNT(*) FROM customers)::int AS customers, (SELECT COUNT(*) FROM reviews)::int AS reviews,
      (SELECT COUNT(*) FROM products)::int AS products, (SELECT COUNT(*) FROM admins)::int AS admins, (SELECT COUNT(*) FROM client_errors)::int AS errors_total,
      (SELECT COUNT(*) FROM client_errors WHERE created_at > NOW() - INTERVAL '24 hours')::int AS errors_24h,
      (SELECT COUNT(*) FROM client_errors WHERE created_at > NOW() - INTERVAL '24 hours' AND kind='servidor')::int AS errors_24h_server,
      (SELECT COUNT(*) FROM admin_audit_logs)::int AS audit_total`)).rows[0];
    let dbSize = null, dbVersion = null;
    try {
      const info = (await pool.query("SELECT pg_size_pretty(pg_database_size(current_database())) AS size, split_part(version(), ' on ', 1) AS version")).rows[0];
      dbSize = info.size;
      dbVersion = info.version;
    }
    catch { /* alguns provedores restringem essas consultas */ }
    const mem = process.memoryUsage();
    const secretSet = name => Boolean(process.env[name]);
    res.json({
      database: { ok: true, latencyMs, size: dbSize, version: dbVersion, pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount } },
      server: { build: BUILD_ID, node: process.version, env: process.env.NODE_ENV || 'development', uptimeSeconds: Math.round(process.uptime()), rssMb: Math.round(mem.rss / 1048576), heapMb: Math.round(mem.heapUsed / 1048576), timezone: 'America/Sao_Paulo', now: new Date().toISOString() },
      counts,
      config: [
        { name: 'JWT_SECRET', ok: (process.env.JWT_SECRET || '').length >= 32, note: 'precisa de 32+ caracteres' },
        { name: 'ADMIN_EMAIL / ADMIN_PASSWORD', ok: secretSet('ADMIN_EMAIL') && secretSet('ADMIN_PASSWORD') },
        { name: 'DEV_EMAIL / DEV_PASSWORD', ok: secretSet('DEV_EMAIL') && secretSet('DEV_PASSWORD') },
        { name: 'WHATSAPP_NUMBER', ok: secretSet('WHATSAPP_NUMBER') },
        { name: 'SITE_URL', ok: secretSet('SITE_URL'), note: process.env.SITE_URL || 'usa o endereço da requisição' },
        { name: 'CLOUDINARY_URL (fotos das avaliações)', ok: Boolean(getPhotoStorage()), note: 'sem ela, as fotos ficam no banco' },
        { name: 'ADMIN_TOKEN_TTL', ok: true, note: process.env.ADMIN_TOKEN_TTL || 'padrão 7d' },
        { name: 'DEV_TOKEN_TTL', ok: true, note: process.env.DEV_TOKEN_TTL || 'padrão 12h' },
        { name: 'ALERT_NO_ORDERS_HOURS', ok: true, note: process.env.ALERT_NO_ORDERS_HOURS || 'padrão 3' }
      ]
    });
  }
  catch (e) {
    next(e);
  }
});
// ===== Erros =====
router.get('/errors', async (req, res, next) => {
  try {
    const db = getPool(), kind = ['tela', 'servidor'].includes(req.query.kind) ? req.query.kind : null, q = likePattern(req.query.q), limit = clampLimit(req.query.limit, 150);
    const where = "WHERE ($1::text IS NULL OR kind=$1) AND ($2::text IS NULL OR message ILIKE $2 ESCAPE '\\' OR page ILIKE $2 ESCAPE '\\' OR source ILIKE $2 ESCAPE '\\')";
    const [rows, groups] = await Promise.all([
      db.query(`SELECT id,kind,message,source,line,col,page,build,user_agent,ip_address,(stack IS NOT NULL) AS has_stack,created_at FROM client_errors ${where} ORDER BY created_at DESC LIMIT $3`, [kind, q, limit]),
      db.query(`SELECT kind,message,COUNT(*)::int AS occurrences,MIN(created_at) AS first_seen,MAX(created_at) AS last_seen FROM client_errors ${where} GROUP BY kind,message ORDER BY MAX(created_at) DESC LIMIT 30`, [kind, q])
    ]);
    res.json({ rows: rows.rows, groups: groups.rows });
  }
  catch (e) {
    next(e);
  }
});
router.get('/errors/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1)
      return res.status(404).json({ error: 'Erro não encontrado.' });
    const { rows } = await getPool().query('SELECT id,kind,message,source,line,col,stack,page,build,user_agent,ip_address,created_at FROM client_errors WHERE id=$1', [id]);
    if (!rows.length)
      return res.status(404).json({ error: 'Erro não encontrado.' });
    res.json(rows[0]);
  }
  catch (e) {
    next(e);
  }
});
router.delete('/errors', async (_req, res, next) => {
  try {
    await getPool().query('DELETE FROM client_errors');
    res.json({ ok: true });
  }
  catch (e) {
    next(e);
  }
});
router.delete('/errors/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1)
      return res.status(404).json({ error: 'Erro não encontrado.' });
    await getPool().query('DELETE FROM client_errors WHERE id=$1', [id]);
    res.json({ ok: true });
  }
  catch (e) {
    next(e);
  }
});
// ===== Auditoria (painel da loja + painel do desenvolvedor) =====
router.get('/audit-logs', async (req, res, next) => {
  try {
    const actor = ['admin', 'dev'].includes(req.query.actor) ? req.query.actor : null, q = likePattern(req.query.q), limit = clampLimit(req.query.limit, 100);
    const { rows } = await getPool().query("SELECT id,admin_email,action,route,status_code,ip_address,actor,created_at FROM admin_audit_logs WHERE ($1::text IS NULL OR actor=$1) AND ($2::text IS NULL OR admin_email ILIKE $2 ESCAPE '\\' OR route ILIKE $2 ESCAPE '\\' OR action ILIKE $2 ESCAPE '\\') ORDER BY created_at DESC LIMIT $3", [actor, q, limit]);
    res.json(rows);
  }
  catch (e) {
    next(e);
  }
});
// ===== Backup e restauração (mesma lógica que antes ficava no painel da loja) =====
router.get('/backup', backupDownload);
router.post('/backup/verify', backupVerify);
router.post('/backup/restore', backupRestore);
// ===== Contas do painel da loja =====
router.get('/admins', async (_req, res, next) => {
  try {
    const { rows } = await getPool().query('SELECT id,email,created_at FROM admins ORDER BY id');
    res.json(rows);
  }
  catch (e) {
    next(e);
  }
});
router.post('/admins', async (req, res, next) => {
  try {
    const e = validateEmail(req.body.email), p = validatePassword(req.body.password);
    if (e.error || p.error)
      return res.status(400).json({ error: e.error || p.error });
    const { rows } = await getPool().query('INSERT INTO admins(email,password_hash) VALUES($1,$2) RETURNING id,email,created_at', [e.email, await bcrypt.hash(p.password, 12)]);
    res.status(201).json(rows[0]);
  }
  catch (err) {
    if (err.code === '23505')
      return res.status(409).json({ error: 'Já existe uma conta da loja com esse e-mail.' });
    next(err);
  }
});
router.post('/admins/:id/password', async (req, res, next) => {
  try {
    const id = Number(req.params.id), p = validatePassword(req.body.password);
    if (!Number.isInteger(id) || id < 1)
      return res.status(404).json({ error: 'Conta não encontrada.' });
    if (p.error)
      return res.status(400).json({ error: p.error });
    const r = await getPool().query('UPDATE admins SET password_hash=$2, password_changed_at=NOW() WHERE id=$1 RETURNING id', [id, await bcrypt.hash(p.password, 12)]);
    if (!r.rowCount)
      return res.status(404).json({ error: 'Conta não encontrada.' });
    res.json({ ok: true });
  }
  catch (e) {
    next(e);
  }
});
export default router;
