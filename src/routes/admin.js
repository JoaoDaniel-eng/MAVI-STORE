import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { getPool } from '../db/pool.js';
import { requireAdmin } from '../middleware/auth.js';
import { auditMutations, logLogin } from '../services/audit.js';
import { versionOf } from '../services/sessionVersion.js';
import { getSettings } from '../services/store.js';
import { calculateLoyaltyPoints } from '../services/promotions.js';
import { photoBufferFromDataUrl } from '../services/reviews.js';
import { getPhotoStorage, uploadPhoto, downloadPhoto, deletePhoto } from '../services/photoStorage.js';
import { createAttemptLimiter } from '../services/rateLimit.js';
import { buildNoOrdersAlert } from '../services/alerts.js';
import { buildOrderFilter, ordersToCsv } from '../services/orderSearch.js';
import { validatePixSetting } from '../services/pix.js';
import { convertConsumptionToStockUnit, convertStockQuantity, stockUnitFactor, defaultConsumptionUnit } from '../services/inventory.js';
import {
  releasePersonalCoupon,
  buildWelcomeAdminFilter,
  presentAdminWelcomeCoupon,
  WELCOME_KIND,
  WELCOME_CODE_PREFIX,
  WELCOME_LOCKED_MESSAGE,
  WELCOME_RESERVED_PREFIX_MESSAGE
} from '../services/welcomeCoupon.js';
const router = Router();
// Login: 5 senhas erradas por IP e 20 por e-mail a cada 15 min. Depois disso responde 429 até a janela passar.
const loginByIp = createAttemptLimiter({ max: 5, windowMs: 15 * 60 * 1000 }), loginByEmail = createAttemptLimiter({ max: 20, windowMs: 15 * 60 * 1000 });
const DUMMY_HASH = bcrypt.hashSync('sem-usuario-cadastrado', 10);
// Validade do token do painel. Padrão 7 dias; pode ser trocada com ADMIN_TOKEN_TTL (ex.: 12h, 30m, 3d).
const adminTokenTtl = () => { const v = String(process.env.ADMIN_TOKEN_TTL || '7d').trim(); return /^\d{1,3}[mhd]$/.test(v) ? v : '7d'; };
router.post('/login', async (req, res, next) => {
  try {
    const db = getPool(), ip = String(req.ip || 'unknown').slice(0, 120);
    const email = String(req.body.email || '').trim().toLowerCase().slice(0, 254), password = String(req.body.password || '').slice(0, 200);
    const wait = Math.max(loginByIp.retryAfterSeconds(ip), loginByEmail.retryAfterSeconds(email));
    if (wait > 0) {
      res.set('Retry-After', String(wait));
      return res.status(429).json({ error: `Muitas tentativas de login. Aguarde ${Math.ceil(wait / 60)} minuto(s) e tente novamente.` });
    }
    const { rows } = await db.query('SELECT id,email,password_hash,password_changed_at FROM admins WHERE email=$1', [email]);
    // Compara sempre com algum hash para que e-mail inexistente e senha errada demorem o mesmo.
    const matches = await bcrypt.compare(password, rows[0] ? rows[0].password_hash : DUMMY_HASH);
    const valid = !!rows[0] && matches;
    if (!valid) {
      loginByIp.record(ip);
      loginByEmail.record(email);
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }
    loginByIp.reset(ip);
    loginByEmail.reset(email);
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
      return res.status(500).json({ error: 'JWT_SECRET precisa ter pelo menos 32 caracteres.' });
    const token = jwt.sign({ adminId: rows[0].id, email: rows[0].email, type: 'admin', pwv: versionOf(rows[0].password_changed_at) }, process.env.JWT_SECRET, { expiresIn: adminTokenTtl(), algorithm: 'HS256' });
    await logLogin({ actor: 'admin', adminId: rows[0].id, email: rows[0].email, ip });
    res.json({ token, email: rows[0].email });
  }
  catch (e) {
    next(e);
  }
});
router.use(requireAdmin);
// Registra automaticamente toda mutação administrativa concluída (ver services/audit.js).
router.use(auditMutations('admin'));
router.get('/stats', async (_req, res, next) => {
  try {
    const db = getPool();
    const [total, today, open, rev] = await Promise.all([
      db.query('SELECT COUNT(*)::int AS count,COALESCE(SUM(total_cents),0)::int AS revenue FROM orders WHERE status<>\'cancelled\''),
      db.query("SELECT COUNT(*)::int AS count,COALESCE(SUM(total_cents),0)::int AS revenue FROM orders WHERE status<>'cancelled' AND created_at >= date_trunc('day',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'"),
      db.query("SELECT COUNT(*)::int AS count FROM orders WHERE status IN ('new','preparing','out_for_delivery')"),
      db.query('SELECT COUNT(*)::int AS count FROM reviews WHERE approved=false')
    ]);
    const last = await db.query('SELECT COALESCE(MAX(id),0)::bigint AS id FROM orders');
    res.json({ all: total.rows[0], today: today.rows[0], openOrders: open.rows[0].count, pendingReviews: rev.rows[0].count, latestOrderId: Number(last.rows[0].id) });
  }
  catch (e) {
    next(e);
  }
});
router.get('/reports', async (req, res, next) => {
  try {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
    const db = getPool();
    const [summary, daily, top, hours, weekdays, topOptions] = await Promise.all([
      db.query(`SELECT COUNT(*)::int AS orders,COALESCE(SUM(total_cents),0)::int AS revenue,COALESCE(AVG(total_cents),0)::int AS average_ticket FROM orders WHERE status<>'cancelled' AND created_at>=NOW()-($1::int * INTERVAL '1 day')`, [days]),
      // Agrupa primeiro pela data (dia em Brasília) e só depois formata o texto "DD/MM" na consulta de fora.
      // Formatar `created_at` direto no SELECT, agrupando por outra expressão, faz o PostgreSQL recusar a consulta
      // ("column orders.created_at must appear in the GROUP BY clause").
      db.query(`SELECT TO_CHAR(d.day,'DD/MM') AS day,d.orders,d.revenue FROM (SELECT (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,COUNT(*)::int AS orders,COALESCE(SUM(total_cents),0)::int AS revenue FROM orders WHERE status<>'cancelled' AND created_at>=NOW()-($1::int * INTERVAL '1 day') GROUP BY 1) d ORDER BY d.day`, [days]),
      db.query(`SELECT item->>'size' AS item,COALESCE(SUM((item->>'quantity')::int),0)::int AS quantity FROM orders o CROSS JOIN LATERAL jsonb_array_elements(o.items) item WHERE o.status<>'cancelled' AND o.created_at>=NOW()-($1::int * INTERVAL '1 day') GROUP BY item->>'size' ORDER BY quantity DESC LIMIT 8`, [days]),
      db.query(`SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'America/Sao_Paulo')::int AS hour,COUNT(*)::int AS orders,COALESCE(SUM(total_cents),0)::int AS revenue FROM orders WHERE status<>'cancelled' AND created_at>=NOW()-($1::int * INTERVAL '1 day') GROUP BY 1 ORDER BY 1`, [days]),
      db.query(`SELECT EXTRACT(DOW FROM created_at AT TIME ZONE 'America/Sao_Paulo')::int AS dow,COUNT(*)::int AS orders,COALESCE(SUM(total_cents),0)::int AS revenue FROM orders WHERE status<>'cancelled' AND created_at>=NOW()-($1::int * INTERVAL '1 day') GROUP BY 1 ORDER BY 1`, [days]),
      db.query(`SELECT opt->>'name' AS name,opt->>'category' AS category,COALESCE(SUM((item->>'quantity')::int),0)::int AS quantity FROM orders o CROSS JOIN LATERAL jsonb_array_elements(o.items) item CROSS JOIN LATERAL jsonb_array_elements(COALESCE(item->'options','[]'::jsonb)) opt WHERE o.status<>'cancelled' AND o.created_at>=NOW()-($1::int * INTERVAL '1 day') GROUP BY opt->>'name',opt->>'category' ORDER BY quantity DESC LIMIT 10`, [days])
    ]);
    res.json({ days, summary: summary.rows[0], daily: daily.rows, top: top.rows, hours: hours.rows, weekdays: weekdays.rows, topOptions: topOptions.rows });
  }
  catch (e) {
    next(e);
  }
});
router.get('/reports/periods', async (_req, res, next) => {
  try {
    const db = getPool();
    const sql = `WITH periods AS (SELECT 'Hoje' AS label,date_trunc('day',NOW() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo' AS start_at UNION ALL SELECT 'Esta semana',date_trunc('week',NOW() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo' UNION ALL SELECT 'Este mês',date_trunc('month',NOW() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') SELECT p.label,COUNT(o.id)::int AS orders,COALESCE(SUM(o.total_cents),0)::int AS revenue,COALESCE(AVG(o.total_cents),0)::int AS average_ticket FROM periods p LEFT JOIN orders o ON o.created_at>=p.start_at AND o.status<>'cancelled' GROUP BY p.label, p.start_at ORDER BY p.start_at DESC`;
    const { rows } = await db.query(sql);
    res.json(rows);
  }
  catch (e) {
    next(e);
  }
});
// Aviso do topo do painel: loja aberta e sem pedidos (ALERT_NO_ORDERS_HOURS, padrão 3 h).
// Erros técnicos agora aparecem só no painel do desenvolvedor (/dev).
router.get('/alerts', async (_req, res, next) => {
  try {
    const db = getPool(), settings = await getSettings();
    const last = await db.query("SELECT MAX(created_at) AS last FROM orders WHERE status <> 'cancelled'");
    const hours = Number(process.env.ALERT_NO_ORDERS_HOURS) > 0 ? Number(process.env.ALERT_NO_ORDERS_HOURS) : 3;
    res.json({ noOrders: buildNoOrdersAlert({ settings, lastOrderAt: last.rows[0].last, now: new Date(), hours }) });
  }
  catch (e) {
    next(e);
  }
});
// Clientes: busca e redefinição de senha (recuperação de acesso feita pela loja).
router.get('/customers', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const digits = q.replace(/\D/g, '');
    const db = getPool();
    const rows = q ? (await db.query("SELECT id,name,phone,created_at,must_change_password FROM customers WHERE name ILIKE $1 OR ($2<>'' AND phone LIKE $3) ORDER BY created_at DESC LIMIT 30", ['%' + q.replace(/[%_\\]/g, '\\$&') + '%', digits, '%' + digits + '%'])).rows : (await db.query('SELECT id,name,phone,created_at,must_change_password FROM customers ORDER BY created_at DESC LIMIT 30')).rows;
    res.json(rows);
  }
  catch (e) {
    next(e);
  }
});
router.post('/customers/:id/reset-password', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1)
      return res.status(400).json({ error: 'Cliente inválido.' });
    const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
    const bytes = crypto.randomBytes(8);
    const temp = Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
    const hash = await bcrypt.hash(temp, 12);
    const r = await getPool().query('UPDATE customers SET password_hash=$1,must_change_password=TRUE,updated_at=NOW() WHERE id=$2 RETURNING name,phone', [hash, id]);
    if (!r.rowCount)
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    res.json({ name: r.rows[0].name, phone: r.rows[0].phone, temporaryPassword: temp });
  }
  catch (e) {
    next(e);
  }
});
// O cupom existe e não é manual (é de boas-vindas ou pessoal)? Usado para responder 403 em vez de 404.
const isWelcomeCoupon = async (db, id) => (await db.query("SELECT 1 FROM coupons WHERE id=$1 AND (kind<>'manual' OR customer_id IS NOT NULL)", [id])).rowCount > 0;
router.get('/coupons', async (_req, res, next) => {
  try {
    const { rows } = await getPool().query('SELECT * FROM coupons WHERE customer_id IS NULL ORDER BY created_at DESC,id DESC');
    res.json(rows);
  }
  catch (e) {
    next(e);
  }
});
// Cupons de boas-vindas (automáticos, um por cliente): dono, status e pedido. Só leitura.
// Filtros: status (available | used | inactive), q (código, nome, telefone ou código do pedido) e limit (até 500; padrão 200).
router.get('/coupons/welcome', async (req, res, next) => {
  try {
    const f = buildWelcomeAdminFilter(req.query);
    if (f.error)
      return res.status(400).json({ error: f.error });
    const db = getPool();
    const { rows } = await db.query(
      `SELECT c.id, c.code, c.discount_value, c.active, c.used_at, c.used_order_id, c.created_at,
              cu.id AS customer_id, cu.name AS customer_name, cu.phone AS customer_phone,
              o.order_code, o.status AS order_status
         FROM coupons c
         JOIN customers cu ON cu.id = c.customer_id
         LEFT JOIN orders o ON o.id = c.used_order_id
         ${f.where}
        ORDER BY c.created_at DESC, c.id DESC
        LIMIT ${f.limit + 1}`,
      f.params
    );
    // O resumo ignora os filtros: é o retrato de todos os cupons de boas-vindas.
    const sum = await db.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE used_at IS NULL AND active)::int AS available,
              COUNT(*) FILTER (WHERE used_at IS NOT NULL)::int AS used,
              COUNT(*) FILTER (WHERE used_at IS NULL AND NOT active)::int AS inactive
         FROM coupons WHERE kind = $1`,
      [WELCOME_KIND]
    );
    res.json({ summary: sum.rows[0], coupons: rows.slice(0, f.limit).map(presentAdminWelcomeCoupon), truncated: rows.length > f.limit });
  }
  catch (e) {
    next(e);
  }
});
router.post('/coupons', async (req, res, next) => {
  try {
    const code = String(req.body.code || '').trim().toUpperCase().replace(/\s+/g, '');
    const type = String(req.body.discountType || '');
    const value = Number(req.body.discountValue);
    const minimum = Number(req.body.minSubtotalCents || 0);
    if (!/^[A-Z0-9_-]{3,40}$/.test(code) || !['percent', 'fixed'].includes(type) || !Number.isInteger(value) || value < 1 || (type === 'percent' && value > 100) || (type === 'fixed' && value > 2000000) || !Number.isInteger(minimum) || minimum < 0 || minimum > 2000000)
      return res.status(400).json({ error: 'Confira código, desconto e pedido mínimo.' });
    if (code.startsWith(WELCOME_CODE_PREFIX))
      return res.status(400).json({ error: WELCOME_RESERVED_PREFIX_MESSAGE });
    const { rows } = await getPool().query('INSERT INTO coupons(code,discount_type,discount_value,min_subtotal_cents) VALUES($1,$2,$3,$4) RETURNING *', [code, type, value, minimum]);
    res.status(201).json(rows[0]);
  }
  catch (e) {
    if (e.code === '23505')
      return res.status(409).json({ error: 'Já existe um cupom com esse código.' });
    next(e);
  }
});
router.patch('/coupons/:id', async (req, res, next) => {
  try {
    if (typeof req.body.active !== 'boolean')
      return res.status(400).json({ error: 'Estado do cupom inválido.' });
    const active = req.body.active, id = Number(req.params.id);
    if (!Number.isInteger(id))
      return res.status(404).json({ error: 'Cupom não encontrado.' });
    const db = getPool();
    // Só cupom manual da loja muda aqui. O de boas-vindas é automático e fica travado.
    const { rows } = await db.query("UPDATE coupons SET active=$1 WHERE id=$2 AND kind='manual' AND customer_id IS NULL RETURNING *", [active, id]);
    if (!rows.length) {
      if (await isWelcomeCoupon(db, id))
        return res.status(403).json({ error: WELCOME_LOCKED_MESSAGE });
      return res.status(404).json({ error: 'Cupom não encontrado.' });
    }
    res.json(rows[0]);
  }
  catch (e) {
    next(e);
  }
});
router.delete('/coupons/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id))
      return res.status(404).json({ error: 'Cupom não encontrado.' });
    const db = getPool();
    const r = await db.query("DELETE FROM coupons WHERE id=$1 AND kind='manual' AND customer_id IS NULL", [id]);
    if (!r.rowCount) {
      if (await isWelcomeCoupon(db, id))
        return res.status(403).json({ error: WELCOME_LOCKED_MESSAGE });
      return res.status(404).json({ error: 'Cupom não encontrado.' });
    }
    res.json({ ok: true });
  }
  catch (e) {
    next(e);
  }
});
// Histórico: filtros status, q (código, nome, telefone ou bairro), from/to (AAAA-MM-DD) e limit (até 501; padrão 200).
router.get('/orders', async (req, res, next) => {
  try {
    const f = buildOrderFilter(req.query);
    if (f.error)
      return res.status(400).json({ error: f.error });
    const limit = Math.min(501, Math.max(1, Math.trunc(Number(req.query.limit)) || 200));
    const q = await getPool().query(`SELECT * FROM orders ${f.where} ORDER BY created_at DESC, id DESC LIMIT $${f.params.length + 1}`, [...f.params, limit]);
    res.json(q.rows.map(r => ({ ...r, orderCode: r.order_code, customerName: r.customer_name, customerPhone: r.customer_phone, deliveryFeeCents: r.delivery_fee_cents, subtotalCents: r.subtotal_cents, totalCents: r.total_cents, scheduledFor: r.scheduled_for, createdAt: r.created_at })));
  }
  catch (e) {
    next(e);
  }
});
// Planilha (CSV) com os pedidos do filtro atual, até 20 mil linhas.
router.get('/orders/export.csv', async (req, res, next) => {
  try {
    const f = buildOrderFilter(req.query);
    if (f.error)
      return res.status(400).json({ error: f.error });
    const { rows } = await getPool().query(`SELECT * FROM orders ${f.where} ORDER BY created_at DESC, id DESC LIMIT 20000`, f.params);
    res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', 'attachment; filename="pedidos.csv"').send(ordersToCsv(rows));
  }
  catch (e) {
    next(e);
  }
});
router.patch('/orders/:id/status', async (req, res, next) => {
  const db = getPool(), client = await db.connect();
  try {
    const status = String(req.body.status || '');
    if (!['new', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'].includes(status))
      return res.status(400).json({ error: 'Status inválido.' });
    await client.query('BEGIN');
    const found = await client.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [Number(req.params.id)]);
    if (!found.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }
    const order = found.rows[0], items = Array.isArray(order.items) ? order.items : [];
    // Pedido cancelado pode voltar: desfaz o que o cancelamento fez (estoque devolvido e cupom pessoal liberado).
    if (order.status === 'cancelled' && status !== 'cancelled') {
      // Estoque: o cancelamento devolveu o que a produção tinha consumido; ao reativar, tira de novo (e apaga a devolução,
      // para um novo cancelamento devolver outra vez). Assim o saldo fica igual ao de um pedido que nunca foi cancelado.
      const returned = await client.query("SELECT id,inventory_item_id,quantity FROM inventory_movements WHERE order_id=$1 AND movement_type='devolucao' AND idempotency_key LIKE $2", [order.id, `order-${order.id}-return-%`]);
      for (const m of returned.rows) {
        const locked = await client.query('SELECT name,quantity FROM inventory_items WHERE id=$1 FOR UPDATE', [m.inventory_item_id]);
        if (!locked.rowCount)
          continue;
        if (Number(locked.rows[0].quantity) < Number(m.quantity))
          throw Object.assign(new Error(`Estoque insuficiente de ${locked.rows[0].name} para reativar este pedido. Ajuste o estoque e tente de novo.`), { status: 409 });
        await client.query('UPDATE inventory_items SET quantity=quantity-$1,updated_at=NOW() WHERE id=$2', [m.quantity, m.inventory_item_id]);
        await client.query('UPDATE options o SET active=CASE WHEN i.auto_disable THEN i.quantity>0 ELSE o.active END FROM inventory_items i WHERE i.id=$1 AND o.id=i.option_id', [m.inventory_item_id]);
        await client.query('DELETE FROM inventory_movements WHERE id=$1', [m.id]);
      }
      // Cupom pessoal (boas-vindas): o cancelamento liberou o cupom para o cliente; ao reativar, ele volta a ficar preso a este pedido.
      // Se o cliente já usou o cupom em outro pedido, não dá para reativar sem cobrar o desconto duas vezes.
      if (order.coupon_code) {
        const personal = await client.query('SELECT id,used_at,used_order_id FROM coupons WHERE code=$1 AND kind=$2 AND customer_id IS NOT NULL FOR UPDATE', [order.coupon_code, WELCOME_KIND]);
        if (personal.rowCount) {
          const c = personal.rows[0];
          if (c.used_at && Number(c.used_order_id) !== Number(order.id))
            throw Object.assign(new Error(`O cupom ${order.coupon_code} já foi usado pelo cliente em outro pedido. Para reativar este, ajuste o pedido ou fale com o cliente.`), { status: 409 });
          await client.query('UPDATE coupons SET used_at=COALESCE(used_at,NOW()),used_order_id=$2 WHERE id=$1', [c.id, order.id]);
        }
      }
    }
    if (status === 'preparing' && order.status !== 'preparing') {
      const prior = await client.query("SELECT 1 FROM inventory_movements WHERE order_id=$1 AND movement_type='consumo' LIMIT 1", [order.id]);
      const recipes = await client.query(`SELECT r.*,i.name,i.unit,i.quantity AS stock FROM inventory_recipes r JOIN inventory_items i ON i.id=r.inventory_item_id WHERE i.active=true`);
      const needs = new Map();
      for (const item of items) {
        const qty = Number(item.quantity || 1);
        for (const rec of recipes.rows) {
          // Adicional com várias camadas gasta o ingrediente uma vez por camada.
          const bySize = rec.size_id && Number(rec.size_id) === Number(item.sizeId);
          const optionLayers = rec.option_id ? Math.max(0, ...(item.options || []).filter(o => Number(o.id) === Number(rec.option_id)).map(o => Number(o.layers) || 1)) : 0;
          const multiplier = bySize ? 1 : optionLayers;
          if (multiplier > 0)
            needs.set(Number(rec.inventory_item_id), (needs.get(Number(rec.inventory_item_id)) || 0) + Number(rec.quantity) * qty * multiplier);
        }
      }
      const simpleItems = await client.query('SELECT id,name,unit,quantity,consumption_quantity,consumption_unit,option_id FROM inventory_items WHERE active=true AND consumption_quantity>0');
      for (const product of simpleItems.rows) {
        if (recipes.rows.some(r => Number(r.inventory_item_id) === Number(product.id)))
          continue;
        let count = 0;
        for (const orderItem of items) {
          const itemQty = Number(orderItem.quantity || 1);
          if (product.option_id) {
            const matched = (orderItem.options || []).filter(o => Number(o.id) === Number(product.option_id));
            if (matched.length)
              count += itemQty * Math.max(...matched.map(o => Number(o.layers) || 1));
          }
          else
            count += itemQty;
        }
        if (count > 0) {
          const amount = convertConsumptionToStockUnit(Number(product.consumption_quantity), product.consumption_unit, product.unit) * count;
          needs.set(Number(product.id), (needs.get(Number(product.id)) || 0) + amount);
        }
      }
      if (!prior.rowCount)
        for (const [itemId, amount] of needs) {
          const row = recipes.rows.find(r => Number(r.inventory_item_id) === itemId) || simpleItems.rows.find(r => Number(r.id) === itemId);
          const locked = await client.query('SELECT quantity,auto_disable,option_id FROM inventory_items WHERE id=$1 FOR UPDATE', [itemId]);
          if (!locked.rowCount)
            throw Object.assign(new Error('Produto de estoque não encontrado.'), { status: 409 });
          if (Number(locked.rows[0].quantity) < amount)
            throw Object.assign(new Error(`Estoque insuficiente de ${row?.name || 'um ingrediente'}. Ajuste o estoque antes de iniciar a produção.`), { status: 409 });
          await client.query('UPDATE inventory_items SET quantity=quantity-$1,updated_at=NOW() WHERE id=$2', [amount, itemId]);
          await client.query('UPDATE options o SET active=CASE WHEN i.auto_disable THEN i.quantity>0 ELSE o.active END FROM inventory_items i WHERE i.id=$1 AND o.id=i.option_id', [itemId]);
          await client.query(`INSERT INTO inventory_movements(inventory_item_id,movement_type,quantity,unit_cost,reason,order_id,idempotency_key) VALUES($1,'consumo',$2,0,'Baixa automática do pedido',$3,$4) ON CONFLICT(idempotency_key) DO NOTHING`, [itemId, amount, order.id, `order-${order.id}-consume-${itemId}`]);
        }
    }
    if (status === 'cancelled' && order.status !== 'cancelled') {
      const consumed = await client.query(`SELECT * FROM inventory_movements WHERE order_id=$1 AND movement_type='consumo'`, [order.id]);
      for (const m of consumed.rows) {
        await client.query('UPDATE inventory_items SET quantity=quantity+$1,updated_at=NOW() WHERE id=$2', [m.quantity, m.inventory_item_id]);
        await client.query('UPDATE options o SET active=CASE WHEN i.auto_disable THEN TRUE ELSE o.active END FROM inventory_items i WHERE i.id=$1 AND o.id=i.option_id', [m.inventory_item_id]);
        await client.query(`INSERT INTO inventory_movements(inventory_item_id,movement_type,quantity,unit_cost,reason,order_id,idempotency_key) VALUES($1,'devolucao',$2,$3,'Devolução por cancelamento',$4,$5) ON CONFLICT(idempotency_key) DO NOTHING`, [m.inventory_item_id, m.quantity, m.unit_cost, order.id, `order-${order.id}-return-${m.inventory_item_id}`]);
      }
    }
    // Cancelou: o cupom pessoal que estava preso a este pedido volta para o cliente.
    if (status === 'cancelled' && order.status !== 'cancelled')
      await releasePersonalCoupon(client, order.id);
    const r = await client.query('UPDATE orders SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING id,order_code,status,total_cents,delivery_fee_cents,spoon_cents,customer_phone', [status, order.id]);
    if (status === 'delivered') {
      const points = calculateLoyaltyPoints(Math.max(0, Number(r.rows[0].total_cents) - Number(r.rows[0].delivery_fee_cents) - Number(r.rows[0].spoon_cents || 0)));
      if (points > 0)
        await client.query('INSERT INTO loyalty_points(order_id,customer_phone,points) VALUES($1,$2,$3) ON CONFLICT(order_id) DO NOTHING', [r.rows[0].id, r.rows[0].customer_phone, points]);
    }
    await client.query('COMMIT');
    res.json(r.rows[0]);
  }
  catch (e) {
    await client.query('ROLLBACK').catch(() => { });
    if (e.status)
      return res.status(e.status).json({ error: e.message });
    next(e);
  }
  finally {
    client.release();
  }
});
router.get('/reviews', async (_req, res, next) => {
  try {
    const { rows } = await getPool().query('SELECT id,customer_name,rating,comment,approved,created_at,(photo IS NOT NULL OR photo_url IS NOT NULL) AS has_photo FROM reviews ORDER BY approved ASC,created_at DESC LIMIT 200');
    res.json(rows);
  }
  catch (e) {
    next(e);
  }
});
router.get('/reviews/:id/photo', async (req, res, next) => {
  try {
    const { rows } = await getPool().query('SELECT photo,photo_url FROM reviews WHERE id=$1 AND (photo IS NOT NULL OR photo_url IS NOT NULL)', [Number(req.params.id)]);
    const bytes = !rows.length ? null : rows[0].photo_url ? await downloadPhoto(rows[0].photo_url) : photoBufferFromDataUrl(rows[0].photo);
    if (!bytes)
      return res.status(404).json({ error: 'Foto não encontrada.' });
    res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', 'Content-Length': String(bytes.length) });
    res.end(bytes);
  }
  catch (e) {
    next(e);
  }
});
router.patch('/reviews/:id', async (req, res, next) => {
  try {
    if (typeof req.body.approved !== 'boolean')
      return res.status(400).json({ error: 'Estado da avaliação inválido.' });
    const approved = req.body.approved;
    const r = await getPool().query('UPDATE reviews SET approved=$1 WHERE id=$2 RETURNING id,approved', [approved, Number(req.params.id)]);
    if (!r.rowCount)
      return res.status(404).json({ error: 'Avaliação não encontrada.' });
    res.json(r.rows[0]);
  }
  catch (e) {
    next(e);
  }
});
router.delete('/reviews/:id', async (req, res, next) => {
  try {
    const r = await getPool().query('DELETE FROM reviews WHERE id=$1 RETURNING photo_public_id', [Number(req.params.id)]);
    if (!r.rowCount)
      return res.status(404).json({ error: 'Avaliação não encontrada.' });
    if (r.rows[0].photo_public_id)
      await deletePhoto(r.rows[0].photo_public_id);
    res.json({ ok: true });
  }
  catch (e) {
    next(e);
  }
});
// Migração das fotos antigas (guardadas no banco) para o armazenamento de arquivos. Roda em lotes pequenos; a foto só sai do banco depois que o envio deu certo.
router.get('/reviews/photos-pending', async (_req, res, next) => {
  try {
    const { rows } = await getPool().query('SELECT COUNT(*)::int AS pending FROM reviews WHERE photo IS NOT NULL AND photo_url IS NULL');
    res.json({ configured: !!getPhotoStorage(), pending: rows[0].pending });
  }
  catch (e) {
    next(e);
  }
});
router.post('/reviews/migrate-photos', async (_req, res, next) => {
  try {
    if (!getPhotoStorage())
      return res.status(400).json({ error: 'Defina CLOUDINARY_URL no servidor antes de mover as fotos.' });
    const db = getPool();
    const { rows } = await db.query('SELECT id,photo FROM reviews WHERE photo IS NOT NULL AND photo_url IS NULL ORDER BY id LIMIT 5');
    let migrated = 0, failed = 0;
    for (const r of rows) {
      try {
        const bytes = photoBufferFromDataUrl(r.photo);
        if (!bytes) {
          failed++;
          continue;
        }
        const up = await uploadPhoto(bytes);
        await db.query('UPDATE reviews SET photo_url=$1,photo_public_id=$2,photo=NULL WHERE id=$3 AND photo_url IS NULL', [up.url, up.publicId, r.id]);
        migrated++;
      }
      catch (err) {
        failed++;
        console.error('Falha ao mover foto da avaliação', r.id, err.message);
      }
    }
    const left = await db.query('SELECT COUNT(*)::int AS pending FROM reviews WHERE photo IS NOT NULL AND photo_url IS NULL');
    res.json({ migrated, failed, pending: left.rows[0].pending });
  }
  catch (e) {
    next(e);
  }
});
router.get('/menu', async (_req, res, next) => {
  try {
    const db = getPool();
    const [p, s, o] = await Promise.all([db.query('SELECT * FROM products ORDER BY sort_order,id'), db.query('SELECT s.*,p.name AS product_name FROM product_sizes s JOIN products p ON p.id=s.product_id ORDER BY p.sort_order,s.sort_order,s.id'), db.query('SELECT * FROM options ORDER BY category,sort_order,id')]);
    res.json({ products: p.rows, sizes: s.rows, options: o.rows });
  }
  catch (e) {
    next(e);
  }
});
router.patch('/menu/sizes/:id', async (req, res, next) => {
  try {
    const price = Number(req.body.priceCents);
    if (!Number.isInteger(price) || price < 0 || price > 500000)
      return res.status(400).json({ error: 'Preço inválido.' });
    const r = await getPool().query('UPDATE product_sizes SET price_cents=$1,active=COALESCE($2,active) WHERE id=$3 RETURNING *', [price, typeof req.body.active === 'boolean' ? req.body.active : null, Number(req.params.id)]);
    if (!r.rowCount)
      return res.status(404).json({ error: 'Tamanho não encontrado.' });
    res.json(r.rows[0]);
  }
  catch (e) {
    next(e);
  }
});
router.patch('/menu/options/:id', async (req, res, next) => {
  try {
    const price = Number(req.body.priceCents);
    if (!Number.isInteger(price) || price < 0 || price > 100000)
      return res.status(400).json({ error: 'Preço inválido.' });
    const r = await getPool().query('UPDATE options SET price_cents=$1,active=COALESCE($2,active) WHERE id=$3 RETURNING *', [price, typeof req.body.active === 'boolean' ? req.body.active : null, Number(req.params.id)]);
    if (!r.rowCount)
      return res.status(404).json({ error: 'Adicional não encontrado.' });
    res.json(r.rows[0]);
  }
  catch (e) {
    next(e);
  }
});
router.patch('/menu/products/:id', async (req, res, next) => {
  try {
    if (req.body.active !== undefined && typeof req.body.active !== 'boolean')
      return res.status(400).json({ error: 'Disponibilidade inválida.' });
    const imageUrl = req.body.imageUrl === undefined ? undefined : String(req.body.imageUrl || '').trim();
    if (imageUrl !== undefined && imageUrl.length > 1000)
      return res.status(400).json({ error: 'Endereço da imagem muito longo.' });
    if (imageUrl && !(/^(https:\/\/|\/)/i).test(imageUrl))
      return res.status(400).json({ error: 'Use um endereço HTTPS ou caminho local para a imagem.' });
    const r = await getPool().query('UPDATE products SET active=COALESCE($1,active), image_url=CASE WHEN $2 THEN $3 ELSE image_url END WHERE id=$4 RETURNING *', [typeof req.body.active === 'boolean' ? req.body.active : null, imageUrl !== undefined, imageUrl || null, Number(req.params.id)]);
    if (!r.rowCount)
      return res.status(404).json({ error: 'Produto não encontrado.' });
    res.json(r.rows[0]);
  }
  catch (e) {
    next(e);
  }
});
router.delete('/orders/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1)
      return res.status(400).json({ error: 'Pedido inválido.' });
    // Apagar pedido não entregue devolve o cupom pessoal ao cliente; pedido entregue mantém o cupom como usado.
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const r = await client.query('DELETE FROM orders WHERE id=$1 RETURNING order_code,status', [id]);
      if (!r.rowCount) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Pedido não encontrado.' });
      }
      if (r.rows[0].status !== 'delivered')
        await releasePersonalCoupon(client, id);
      await client.query('COMMIT');
      res.json({ ok: true, orderCode: r.rows[0].order_code });
    }
    catch (e) {
      await client.query('ROLLBACK').catch(() => { });
      throw e;
    }
    finally {
      client.release();
    }
  }
  catch (e) {
    next(e);
  }
});
router.delete('/menu/products/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1)
      return res.status(400).json({ error: 'Produto inválido.' });
    const r = await getPool().query('DELETE FROM products WHERE id=$1 RETURNING name', [id]);
    if (!r.rowCount)
      return res.status(404).json({ error: 'Produto não encontrado.' });
    res.json({ ok: true, name: r.rows[0].name });
  }
  catch (e) {
    next(e);
  }
});
router.get('/zones', async (_req, res, next) => {
  try {
    const { rows } = await getPool().query('SELECT id,name,fee_cents AS fee,active FROM delivery_zones ORDER BY name');
    res.json(rows);
  }
  catch (e) {
    next(e);
  }
});
router.post('/zones', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim().slice(0, 120), fee = Number(req.body.feeCents);
    if (name.length < 2 || !Number.isInteger(fee) || fee < 0 || fee > 100000)
      return res.status(400).json({ error: 'Informe bairro e taxa válida.' });
    const db = getPool();
    const exists = await db.query('SELECT id FROM delivery_zones WHERE LOWER(TRIM(name))=LOWER(TRIM($1))', [name]);
    if (exists.rowCount)
      return res.status(409).json({ error: 'Esse bairro já existe.' });
    const { rows } = await db.query('INSERT INTO delivery_zones(name,fee_cents) VALUES($1,$2) RETURNING id,name,fee_cents AS fee,active', [name, fee]);
    res.status(201).json(rows[0]);
  }
  catch (e) {
    if (e.code === '23505')
      return res.status(409).json({ error: 'Esse bairro já existe.' });
    next(e);
  }
});
router.patch('/zones/:id', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim().slice(0, 120), fee = Number(req.body.feeCents), active = req.body.active;
    if (typeof active !== 'boolean')
      return res.status(400).json({ error: 'Disponibilidade do bairro inválida.' });
    if (name.length < 2 || !Number.isInteger(fee) || fee < 0 || fee > 100000)
      return res.status(400).json({ error: 'Informe bairro e taxa válida.' });
    const db = getPool();
    const exists = await db.query('SELECT id FROM delivery_zones WHERE LOWER(TRIM(name))=LOWER(TRIM($1)) AND id<>$2', [name, Number(req.params.id)]);
    if (exists.rowCount)
      return res.status(409).json({ error: 'Esse bairro já existe.' });
    const { rows } = await db.query('UPDATE delivery_zones SET name=$1,fee_cents=$2,active=$3 WHERE id=$4 RETURNING id,name,fee_cents AS fee,active', [name, fee, active, Number(req.params.id)]);
    if (!rows.length)
      return res.status(404).json({ error: 'Bairro não encontrado.' });
    res.json(rows[0]);
  }
  catch (e) {
    if (e.code === '23505')
      return res.status(409).json({ error: 'Esse bairro já existe.' });
    next(e);
  }
});
router.delete('/zones/:id', async (req, res, next) => {
  try {
    const r = await getPool().query('DELETE FROM delivery_zones WHERE id=$1', [Number(req.params.id)]);
    if (!r.rowCount)
      return res.status(404).json({ error: 'Bairro não encontrado.' });
    res.json({ ok: true });
  }
  catch (e) {
    next(e);
  }
});
router.get('/settings', async (_req, res, next) => {
  try {
    const s = await getSettings();
    res.json(s);
  }
  catch (e) {
    next(e);
  }
});
router.patch('/settings', async (req, res, next) => {
  try {
    const currentSettings = await getSettings();
    const minEstimate = Number(req.body.estimated_minutes_min ?? currentSettings.estimated_minutes_min ?? 35), maxEstimate = Number(req.body.estimated_minutes_max ?? currentSettings.estimated_minutes_max ?? 55);
    if (Number.isFinite(minEstimate) && Number.isFinite(maxEstimate) && minEstimate > maxEstimate)
      return res.status(400).json({ error: 'O tempo mínimo não pode ser maior que o máximo.' });
    const allowed = ['manual_closed', 'store_name', 'whatsapp_number', 'opening_days', 'opening_time', 'closing_time', 'minimum_schedule_minutes', 'max_free_toppings', 'combo_min_items', 'combo_discount_percent', 'estimated_minutes_min', 'estimated_minutes_max', 'pix_key', 'pix_name', 'pix_city'];
    const db = getPool();
    const mergedPix = { ...currentSettings, ...Object.fromEntries(['pix_key', 'pix_name', 'pix_city'].filter(k => req.body[k] !== undefined).map(k => [k, String(req.body[k]).trim()])) };
    if (String(mergedPix.pix_key || '').trim() && !(String(mergedPix.pix_name || '').trim() && String(mergedPix.pix_city || '').trim()))
      return res.status(400).json({ error: 'Para usar o Pix, informe a chave, o nome e a cidade do recebedor.' });
    for (const key of allowed) {
      if (req.body[key] === undefined)
        continue;
      let value = String(req.body[key]).trim();
      if (key === 'pix_key' || key === 'pix_name' || key === 'pix_city') {
        const r = validatePixSetting(key, value);
        if (r.error)
          return res.status(400).json({ error: r.error });
        value = r.value;
      }
      if (key === 'manual_closed' && !['true', 'false'].includes(value))
        return res.status(400).json({ error: 'Valor de fechamento inválido.' });
      if (key === 'opening_time' || key === 'closing_time') {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
          return res.status(400).json({ error: 'Horário inválido.' });
      }
      if (key === 'opening_days' && !/^[0-6](,[0-6])*$/.test(value))
        return res.status(400).json({ error: 'Dias de funcionamento inválidos.' });
      if (key === 'minimum_schedule_minutes' && (!/^\d+$/.test(value) || Number(value) < 30 || Number(value) > 1440))
        return res.status(400).json({ error: 'A antecedência deve ser de 30 a 1440 minutos.' });
      if (key === 'max_free_toppings' && (!/^\d+$/.test(value) || Number(value) < 0 || Number(value) > 10))
        return res.status(400).json({ error: 'A quantidade de acompanhamentos deve ficar entre 0 e 10.' });
      if (key === 'whatsapp_number' && !/^\d{10,15}$/.test(value))
        return res.status(400).json({ error: 'Use o WhatsApp com DDI e DDD, apenas números.' });
      if (key === 'combo_min_items' && (!/^\d+$/.test(value) || Number(value) < 2 || Number(value) > 10))
        return res.status(400).json({ error: 'O combo deve exigir de 2 a 10 açaís.' });
      if (key === 'combo_discount_percent' && (!/^\d+$/.test(value) || Number(value) < 0 || Number(value) > 50))
        return res.status(400).json({ error: 'O desconto do combo deve ficar entre 0% e 50%.' });
      if ((key === 'estimated_minutes_min' || key === 'estimated_minutes_max') && (!/^\d+$/.test(value) || Number(value) < 10 || Number(value) > 180))
        return res.status(400).json({ error: 'A previsão deve ficar entre 10 e 180 minutos.' });
      if (key === 'store_name' && (value.length < 2 || value.length > 120))
        return res.status(400).json({ error: 'Nome da loja inválido.' });
      await db.query('INSERT INTO settings(key,value,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()', [key, value]);
    }
    const saved = await getSettings();
    if (Number(saved.estimated_minutes_min || 35) > Number(saved.estimated_minutes_max || 55))
      return res.status(400).json({ error: 'O tempo mínimo não pode ser maior que o máximo.' });
    res.json(saved);
  }
  catch (e) {
    next(e);
  }
});
// ===== Controle de estoque =====
router.get('/inventory', async (_req, res, next) => {
  try {
    const db = getPool();
    const [items, recipes, movements] = await Promise.all([
      db.query(`SELECT i.*,o.name AS option_name,o.category FROM inventory_items i LEFT JOIN options o ON o.id=i.option_id WHERE i.active=true ORDER BY i.name`),
      db.query(`SELECT r.*,i.name AS ingredient_name,COALESCE(s.name,'') AS size_name,COALESCE(o.name,'') AS option_name FROM inventory_recipes r JOIN inventory_items i ON i.id=r.inventory_item_id LEFT JOIN product_sizes s ON s.id=r.size_id LEFT JOIN options o ON o.id=r.option_id ORDER BY i.name`),
      db.query(`SELECT m.*,COALESCE(i.name,'Produto removido') AS item_name,i.unit AS item_unit FROM inventory_movements m LEFT JOIN inventory_items i ON i.id=m.inventory_item_id ORDER BY m.created_at DESC LIMIT 100`)
    ]);
    res.json({ items: items.rows, recipes: recipes.rows, movements: movements.rows });
  }
  catch (e) {
    next(e);
  }
});
router.get('/inventory/catalog', async (_req, res, next) => {
  try {
    const db = getPool();
    const [options, sizes] = await Promise.all([db.query('SELECT id,name,category FROM options ORDER BY name'), db.query('SELECT id,name FROM product_sizes WHERE active ORDER BY sort_order,id')]);
    res.json({ options: options.rows, sizes: sizes.rows });
  }
  catch (e) {
    next(e);
  }
});
// Endpoint enxuto para os combos: não depende de receitas, movimentações ou relatórios.
router.get('/inventory/items', async (_req, res, next) => {
  try {
    const { rows } = await getPool().query('SELECT id,name,unit,quantity,active FROM inventory_items WHERE active=true ORDER BY name');
    res.json(rows);
  }
  catch (e) {
    next(e);
  }
});
router.post('/inventory/items', async (req, res, next) => {
  const client = await getPool().connect();
  try {
    const name = String(req.body.name || '').trim(), unit = String(req.body.unit || '').trim(), qty = Number(req.body.quantity), minimum = Number(req.body.minimumQuantity ?? 0), purchaseTotal = Number(req.body.purchaseTotal ?? 0), consumption = Number(req.body.consumptionQuantity ?? 0), consumptionUnit = String(req.body.consumptionUnit || 'g');
    if (name.length < 2 || !['kg', 'g', 'l', 'ml', 'un'].includes(unit) || ![qty, minimum, purchaseTotal, consumption].every(Number.isFinite) || qty < 0 || minimum < 0 || purchaseTotal < 0 || (purchaseTotal > 0 && qty <= 0) || consumption < 0 || !['g', 'ml', 'un'].includes(consumptionUnit))
      return res.status(400).json({ error: 'Confira nome, unidade, quantidade, consumo e valor gasto.' });
    let storedConsumption = null;
    if (consumption > 0) {
      try {
        convertConsumptionToStockUnit(consumption, consumptionUnit, unit);
        storedConsumption = consumption;
      }
      catch (e) {
        return res.status(400).json({ error: e.message });
      }
    }
    await client.query('BEGIN');
    const dup = await client.query('SELECT 1 FROM inventory_items WHERE active=true AND LOWER(TRIM(name))=LOWER(TRIM($1)) LIMIT 1', [name]);
    if (dup.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Já existe um produto de estoque com esse nome. Use “Adicionar compra” nele.' });
    }
    const match = await client.query('SELECT id FROM options WHERE LOWER(TRIM(name))=LOWER(TRIM($1)) ORDER BY id LIMIT 1', [name]);
    const optionId = match.rows[0]?.id || null;
    const unitCost = qty > 0 ? purchaseTotal / qty : 0;
    const { rows } = await client.query(`INSERT INTO inventory_items(name,unit,quantity,minimum_quantity,unit_cost,option_id,auto_disable,consumption_quantity,consumption_unit,capacity_quantity,purchase_total) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$3,$10) RETURNING *`, [name, unit, qty, minimum, unitCost, optionId, !!optionId && qty <= 0, storedConsumption, storedConsumption ? consumptionUnit : null, purchaseTotal]);
    if (qty > 0)
      await client.query(`INSERT INTO inventory_movements(inventory_item_id,movement_type,quantity,unit_cost,reason) VALUES($1,'entrada',$2,$3,'Estoque inicial cadastrado')`, [rows[0].id, qty, unitCost]);
    if (optionId && qty <= 0)
      await client.query('UPDATE options SET active=FALSE WHERE id=$1', [optionId]);
    await client.query('COMMIT');
    res.status(201).json({ ...rows[0], matchedOption: !!optionId });
  }
  catch (e) {
    await client.query('ROLLBACK').catch(() => { });
    if (e.code === '23505')
      return res.status(409).json({ error: 'Já existe um produto de estoque com esse nome ou acompanhamento vinculado.' });
    next(e);
  }
  finally {
    client.release();
  }
});
router.patch('/inventory/items/:id', async (req, res, next) => {
  const client = await getPool().connect();
  try {
    const b = req.body || {}, id = Number(req.params.id), num = v => v === undefined || v === null || v === '' ? null : Number(v);
    const name = b.name === undefined ? null : String(b.name).trim(), unit = b.unit === undefined ? null : String(b.unit), minimum = num(b.minimumQuantity), capacity = num(b.capacityQuantity), cost = num(b.unitCost), consumption = num(b.consumptionQuantity), consumptionUnit = b.consumptionUnit === undefined ? null : String(b.consumptionUnit);
    if (!Number.isInteger(id) || id < 1 || (name !== null && name.length < 2) || (unit !== null && !['kg', 'g', 'l', 'ml', 'un'].includes(unit)) || [minimum, capacity, cost, consumption].some(v => v !== null && (!Number.isFinite(v) || v < 0)) || (consumptionUnit !== null && !['g', 'ml', 'un'].includes(consumptionUnit)))
      return res.status(400).json({ error: 'Dados do produto inválidos.' });
    await client.query('BEGIN');
    const found = await client.query('SELECT * FROM inventory_items WHERE id=$1 AND active=true FOR UPDATE', [id]);
    if (!found.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Produto não encontrado ou já excluído. Atualize a página.' });
    }
    const cur = found.rows[0], newUnit = unit || cur.unit, newName = name ?? cur.name;
    if (name !== null) {
      const dup = await client.query('SELECT 1 FROM inventory_items WHERE active=true AND id<>$1 AND LOWER(TRIM(name))=LOWER(TRIM($2)) LIMIT 1', [id, newName]);
      if (dup.rowCount) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Já existe outro produto de estoque com esse nome.' });
      }
    }
    let qty = Number(cur.quantity), cap = Number(cur.capacity_quantity || 0), min = Number(cur.minimum_quantity), unitCost = Number(cur.unit_cost);
    const unitChanged = newUnit !== cur.unit;
    let factor = 1;
    if (unitChanged) {
      try {
        factor = stockUnitFactor(cur.unit, newUnit);
        qty = convertStockQuantity(qty, cur.unit, newUnit);
        cap = convertStockQuantity(cap, cur.unit, newUnit);
        min = convertStockQuantity(min, cur.unit, newUnit);
        unitCost = Math.round(unitCost / factor * 10000) / 10000;
      }
      catch (e) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: e.message });
      }
    }
    if (minimum !== null)
      min = minimum;
    if (capacity !== null)
      cap = capacity;
    if (cost !== null)
      unitCost = cost;
    if (cap < qty)
      cap = qty;
    let cq = cur.consumption_quantity === null ? null : Number(cur.consumption_quantity), cu = cur.consumption_unit;
    if (consumption !== null) {
      if (consumption === 0) {
        cq = null;
        cu = null;
      }
      else {
        cq = consumption;
        cu = consumptionUnit || cu || defaultConsumptionUnit(newUnit);
      }
    }
    else if (consumptionUnit !== null && cq !== null)
      cu = consumptionUnit;
    if (cq !== null) {
      try {
        convertConsumptionToStockUnit(cq, cu || defaultConsumptionUnit(newUnit), newUnit);
      }
      catch (e) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: e.message });
      }
    }
    if (unitChanged)
      await client.query('UPDATE inventory_recipes SET quantity=GREATEST(ROUND(quantity*$1::numeric,3),0.001) WHERE inventory_item_id=$2', [factor, id]);
    if (b.clearSizeRecipes === true && consumption !== null && consumption > 0)
      await client.query('DELETE FROM inventory_recipes WHERE inventory_item_id=$1 AND size_id IS NOT NULL', [id]);
    const { rows } = await client.query('UPDATE inventory_items SET name=$1,unit=$2,quantity=$3,capacity_quantity=$4,minimum_quantity=$5,unit_cost=$6,consumption_quantity=$7,consumption_unit=$8,updated_at=NOW() WHERE id=$9 RETURNING *', [newName, newUnit, qty, cap, min, unitCost, cq, cq === null ? null : (cu || defaultConsumptionUnit(newUnit)), id]);
    if (unitChanged && qty > 0)
      await client.query("INSERT INTO inventory_movements(inventory_item_id,movement_type,quantity,unit_cost,reason) VALUES($1,'ajuste',$2,0,$3)", [id, qty, `Unidade alterada de ${cur.unit} para ${newUnit} (saldo convertido automaticamente)`]);
    await client.query('COMMIT');
    res.json(rows[0]);
  }
  catch (e) {
    await client.query('ROLLBACK').catch(() => { });
    next(e);
  }
  finally {
    client.release();
  }
});
// Exclusão lógica: preserva histórico de compras/consumo e não apaga movimentos antigos.
router.delete('/inventory/items/:id', async (req, res, next) => {
  const client = await getPool().connect();
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1)
      return res.status(400).json({ error: 'Produto inválido.' });
    await client.query('BEGIN');
    const found = await client.query('SELECT id,option_id FROM inventory_items WHERE id=$1 AND active=true FOR UPDATE', [id]);
    if (!found.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Produto não encontrado ou já excluído.' });
    }
    if (found.rows[0].option_id)
      await client.query('UPDATE options SET active=TRUE WHERE id=$1', [found.rows[0].option_id]);
    await client.query('UPDATE inventory_items SET active=FALSE,auto_disable=FALSE,option_id=NULL,updated_at=NOW() WHERE id=$1', [id]);
    await client.query('COMMIT');
    res.json({ ok: true, message: 'Produto excluído da lista. O histórico foi preservado.' });
  }
  catch (e) {
    await client.query('ROLLBACK').catch(() => { });
    next(e);
  }
  finally {
    client.release();
  }
});
router.post('/inventory/movements', async (req, res) => {
  const client = await getPool().connect();
  try {
    const id = Number(req.body.itemId), qty = Number(req.body.quantity), type = String(req.body.type || ''), totalPaid = Number(String(req.body.totalPaid ?? 0).replace(',', '.'));
    const reason = String(req.body.reason || '').trim().slice(0, 500);
    if (!Number.isInteger(id) || id < 1 || !Number.isFinite(qty) || !['entrada', 'saida', 'ajuste', 'desperdicio', 'conferencia'].includes(type) || !Number.isFinite(totalPaid) || totalPaid < 0 || (type === 'conferencia' ? qty < 0 : qty <= 0))
      return res.status(400).json({ error: 'Informe uma quantidade válida e, para compras, o valor pago.' });
    await client.query('BEGIN');
    const found = await client.query('SELECT id,quantity,unit,auto_disable,option_id,purchase_total,capacity_quantity FROM inventory_items WHERE id=$1 AND active=true FOR UPDATE', [id]);
    if (!found.rowCount)
      throw Object.assign(new Error('Produto não encontrado ou inativo. Atualize a página.'), { status: 404 });
    const item = found.rows[0], current = Number(item.quantity);
    const delta = type === 'entrada' ? qty : type === 'conferencia' ? qty - current : -qty;
    if (current + delta < 0)
      throw Object.assign(new Error('A quantidade informada é maior que o saldo disponível.'), { status: 409 });
    if (type === 'conferencia' && Math.abs(delta) < 0.0005) {
      await client.query('COMMIT');
      return res.json({ ok: true, message: 'O saldo já corresponde à quantidade conferida.' });
    }
    const purchaseValue = type === 'entrada' ? totalPaid : 0;
    const unitCost = type === 'entrada' && qty > 0 ? totalPaid / qty : 0;
    await client.query(`UPDATE inventory_items SET quantity=$1::numeric,capacity_quantity=GREATEST(COALESCE(capacity_quantity,0),$1::numeric),purchase_total=COALESCE(purchase_total,0)+$2::numeric,unit_cost=CASE WHEN $3::numeric>0 THEN $3::numeric ELSE unit_cost END,updated_at=NOW() WHERE id=$4`, [current + delta, purchaseValue, unitCost, id]);
    if (item.option_id && item.auto_disable)
      await client.query('UPDATE options SET active=$1::boolean WHERE id=$2', [current + delta > 0, item.option_id]);
    const movementQty = type === 'conferencia' ? Math.abs(delta) : qty;
    await client.query(`INSERT INTO inventory_movements(inventory_item_id,movement_type,quantity,unit_cost,reason,supplier) VALUES($1,$2,$3,$4,$5,$6)`, [id, type, movementQty, unitCost, reason || (type === 'entrada' ? 'Compra/reposição de estoque' : type === 'conferencia' ? `Correção de saldo: de ${current} para ${qty} ${item.unit}` : type === 'saida' ? 'Retirada manual do estoque' : type === 'desperdicio' ? 'Perda/desperdício' : 'Movimentação manual'), String(req.body.supplier || '').trim().slice(0, 160) || null]);
    await client.query('COMMIT');
    res.status(201).json({ ok: true, quantity: current + delta, message: type === 'entrada' ? 'Compra adicionada ao estoque.' : type === 'saida' || type === 'desperdicio' ? 'Retirada registrada.' : 'Saldo atualizado.' });
  }
  catch (e) {
    await client.query('ROLLBACK').catch(() => { });
    if (e.status)
      return res.status(e.status).json({ error: e.message });
    console.error('Falha ao registrar movimentação de estoque:', { code: e.code, message: e.message, detail: e.detail, table: e.table, column: e.column });
    res.status(500).json({ error: 'Não foi possível salvar a movimentação. Verifique os dados e tente novamente.' });
  }
  finally {
    client.release();
  }
});
router.post('/inventory/quick-recipe', async (req, res, next) => {
  try {
    const itemId = Number(req.body.itemId), optionId = Number(req.body.optionId), amount = Number(req.body.quantity), measure = String(req.body.measure || '');
    if (!Number.isInteger(itemId) || itemId < 1 || !Number.isInteger(optionId) || optionId < 1 || !Number.isFinite(amount) || amount <= 0 || !['g', 'ml', 'un'].includes(measure))
      return res.status(400).json({ error: 'Informe ingrediente, acompanhamento e consumo válido.' });
    const db = getPool();
    const found = await db.query('SELECT id,unit FROM inventory_items WHERE id=$1 AND active=true', [itemId]);
    if (!found.rowCount)
      return res.status(404).json({ error: 'Ingrediente não encontrado ou inativo.' });
    const option = await db.query('SELECT id FROM options WHERE id=$1', [optionId]);
    if (!option.rowCount)
      return res.status(404).json({ error: 'Acompanhamento não encontrado.' });
    const stockUnit = found.rows[0].unit;
    let stored;
    try {
      stored = convertConsumptionToStockUnit(amount, measure, stockUnit);
    }
    catch (error) {
      return res.status(400).json({ error: error.message });
    }
    const { rows } = await db.query(`INSERT INTO inventory_recipes(inventory_item_id,option_id,quantity) VALUES($1,$2,$3) ON CONFLICT(inventory_item_id,option_id) WHERE option_id IS NOT NULL DO UPDATE SET quantity=EXCLUDED.quantity RETURNING *`, [itemId, optionId, stored]);
    res.status(201).json(rows[0]);
  }
  catch (e) {
    next(e);
  }
});
// Grava (ou atualiza) uma receita de consumo. Cada alvo (tamanho ou acompanhamento) tem seu próprio índice único parcial,
// por isso o ON CONFLICT precisa indicar o alvo certo.
async function saveRecipe(q, itemId, sizeId, optionId, quantity) {
  if (sizeId)
    return q.query(`INSERT INTO inventory_recipes(inventory_item_id,size_id,quantity) VALUES($1,$2,$3) ON CONFLICT(inventory_item_id,size_id) WHERE size_id IS NOT NULL DO UPDATE SET quantity=EXCLUDED.quantity RETURNING *`, [itemId, sizeId, quantity]);
  return q.query(`INSERT INTO inventory_recipes(inventory_item_id,option_id,quantity) VALUES($1,$2,$3) ON CONFLICT(inventory_item_id,option_id) WHERE option_id IS NOT NULL DO UPDATE SET quantity=EXCLUDED.quantity RETURNING *`, [itemId, optionId, quantity]);
}
router.post('/inventory/recipes', async (req, res, next) => {
  try {
    const item = Number(req.body.itemId), qty = Number(req.body.quantity), size = req.body.sizeId ? Number(req.body.sizeId) : null, opt = req.body.optionId ? Number(req.body.optionId) : null, measure = req.body.measure ? String(req.body.measure) : null;
    if (!Number.isInteger(item) || item < 1 || !Number.isFinite(qty) || qty <= 0 || (!size && !opt) || (size && opt) || (measure && !['g', 'ml', 'un'].includes(measure)))
      return res.status(400).json({ error: 'Informe ingrediente, consumo e um tamanho ou acompanhamento.' });
    const db = getPool();
    const found = await db.query('SELECT unit FROM inventory_items WHERE id=$1 AND active=true', [item]);
    if (!found.rowCount)
      return res.status(404).json({ error: 'Ingrediente não encontrado ou inativo.' });
    let stored = qty;
    if (measure) {
      try {
        stored = convertConsumptionToStockUnit(qty, measure, found.rows[0].unit);
      }
      catch (error) {
        return res.status(400).json({ error: error.message });
      }
    }
    stored = Math.round(stored * 1000) / 1000;
    if (!(stored > 0))
      return res.status(400).json({ error: 'A quantidade é pequena demais para a unidade do estoque.' });
    const { rows } = await saveRecipe(db, item, size, opt, stored);
    res.status(201).json(rows[0]);
  }
  catch (e) {
    next(e);
  }
});
// Consumo por tamanho: grava de uma vez a quantidade usada em cada tamanho do cardápio. Em branco/0 remove o consumo daquele tamanho.
router.put('/inventory/items/:id/size-recipes', async (req, res, next) => {
  const client = await getPool().connect();
  try {
    const id = Number(req.params.id), measure = String(req.body.measure || ''), list = Array.isArray(req.body.sizes) ? req.body.sizes : null;
    if (!Number.isInteger(id) || id < 1 || !list || list.length > 50 || !['g', 'ml', 'un'].includes(measure))
      return res.status(400).json({ error: 'Informe o produto, a unidade e os tamanhos.' });
    const rows = [], seen = new Set();
    for (const entry of list) {
      const sizeId = Number(entry?.sizeId), raw = entry?.quantity === null || entry?.quantity === undefined || entry?.quantity === '' ? 0 : Number(entry.quantity);
      if (!Number.isInteger(sizeId) || sizeId < 1 || !Number.isFinite(raw) || raw < 0 || seen.has(sizeId))
        return res.status(400).json({ error: 'Confira os tamanhos e as quantidades informadas.' });
      seen.add(sizeId);
      rows.push({ sizeId, raw });
    }
    await client.query('BEGIN');
    const found = await client.query('SELECT id,unit FROM inventory_items WHERE id=$1 AND active=true FOR UPDATE', [id]);
    if (!found.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Produto não encontrado ou já excluído. Atualize a página.' });
    }
    const unit = found.rows[0].unit;
    const valid = await client.query('SELECT id FROM product_sizes WHERE id=ANY($1::int[])', [rows.map(r => r.sizeId)]);
    if (valid.rowCount !== rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Um dos tamanhos não existe mais. Atualize a página.' });
    }
    for (const r of rows) {
      if (r.raw === 0) {
        await client.query('DELETE FROM inventory_recipes WHERE inventory_item_id=$1 AND size_id=$2', [id, r.sizeId]);
        continue;
      }
      let stored;
      try {
        stored = Math.round(convertConsumptionToStockUnit(r.raw, measure, unit) * 1000) / 1000;
      }
      catch (error) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: error.message });
      }
      if (!(stored > 0)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Uma das quantidades é pequena demais para a unidade do estoque.' });
      }
      await saveRecipe(client, id, r.sizeId, null, stored);
    }
    await client.query('COMMIT');
    const out = await client.query(`SELECT r.*,COALESCE(s.name,'') AS size_name FROM inventory_recipes r LEFT JOIN product_sizes s ON s.id=r.size_id WHERE r.inventory_item_id=$1 AND r.size_id IS NOT NULL ORDER BY s.sort_order,s.id`, [id]);
    res.json({ ok: true, recipes: out.rows });
  }
  catch (e) {
    await client.query('ROLLBACK').catch(() => { });
    next(e);
  }
  finally {
    client.release();
  }
});
router.delete('/inventory/recipes/:id', async (req, res, next) => {
  try {
    await getPool().query('DELETE FROM inventory_recipes WHERE id=$1', [Number(req.params.id)]);
    res.json({ ok: true });
  }
  catch (e) {
    next(e);
  }
});
router.get('/inventory/calibrations', async (_req, res, next) => {
  try {
    const { rows } = await getPool().query(`SELECT c.*,i.name AS ingredient_name,COALESCE(s.name,'') AS size_name,COALESCE(o.name,'') AS option_name FROM inventory_calibrations c JOIN inventory_items i ON i.id=c.inventory_item_id LEFT JOIN product_sizes s ON s.id=c.size_id LEFT JOIN options o ON o.id=c.option_id ORDER BY c.created_at DESC LIMIT 100`);
    res.json(rows);
  }
  catch (e) {
    next(e);
  }
});
router.post('/inventory/calibrations', async (req, res, next) => {
  try {
    const item = Number(req.body.itemId), samples = Array.isArray(req.body.samples) ? req.body.samples.map(Number) : [], size = req.body.sizeId ? Number(req.body.sizeId) : null, opt = req.body.optionId ? Number(req.body.optionId) : null;
    if (!Number.isInteger(item) || samples.length < 2 || samples.length > 30 || samples.some(x => !Number.isFinite(x) || x <= 0) || (!size && !opt) || (size && opt))
      return res.status(400).json({ error: 'Informe pelo menos 2 medições positivas e um alvo.' });
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    const { rows } = await getPool().query(`INSERT INTO inventory_calibrations(inventory_item_id,size_id,option_id,samples,average_quantity) VALUES($1,$2,$3,$4,$5) RETURNING *`, [item, size, opt, samples, avg]);
    res.status(201).json(rows[0]);
  }
  catch (e) {
    next(e);
  }
});
router.post('/inventory/calibrations/:id/approve', async (req, res, next) => {
  const db = getPool(), c = await db.connect();
  try {
    await c.query('BEGIN');
    const found = await c.query('SELECT * FROM inventory_calibrations WHERE id=$1 FOR UPDATE', [Number(req.params.id)]);
    if (!found.rowCount)
      throw Object.assign(new Error('Calibração não encontrada.'), { status: 404 });
    const x = found.rows[0];
    if (x.approved)
      throw Object.assign(new Error('Esta calibração já foi aprovada.'), { status: 409 });
    await saveRecipe(c, x.inventory_item_id, x.size_id, x.option_id, x.average_quantity);
    await c.query('UPDATE inventory_calibrations SET approved=true,approved_at=NOW() WHERE id=$1', [x.id]);
    await c.query('COMMIT');
    res.json({ ok: true, averageQuantity: x.average_quantity });
  }
  catch (e) {
    await c.query('ROLLBACK').catch(() => { });
    if (e.status)
      return res.status(e.status).json({ error: e.message });
    next(e);
  }
  finally {
    c.release();
  }
});
router.get('/inventory/reports', async (_req, res, next) => {
  try {
    const db = getPool();
    const [usage, purchases] = await Promise.all([
      db.query(`SELECT i.name,i.unit,COALESCE(SUM(m.quantity),0) AS consumed FROM inventory_items i LEFT JOIN inventory_movements m ON m.inventory_item_id=i.id AND m.movement_type IN ('consumo','saida','desperdicio') GROUP BY i.id ORDER BY consumed DESC`),
      db.query(`SELECT COALESCE(SUM(quantity*unit_cost),0) AS total FROM inventory_movements WHERE movement_type='entrada'`)
    ]);
    const costs = await db.query(`SELECT s.name AS size_name,COALESCE(SUM(r.quantity*i.unit_cost),0) AS estimated_cost FROM product_sizes s LEFT JOIN inventory_recipes r ON r.size_id=s.id LEFT JOIN inventory_items i ON i.id=r.inventory_item_id GROUP BY s.id ORDER BY s.sort_order,s.id`);
    res.json({ usage: usage.rows, purchases: purchases.rows[0].total, costs: costs.rows });
  }
  catch (e) {
    next(e);
  }
});
export default router;
