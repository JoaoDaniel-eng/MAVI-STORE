import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getPool } from '../db/pool.js';
import { createAttemptLimiter } from '../services/rateLimit.js';
import { issueWelcomeCoupon, presentWelcomeCoupon, WELCOME_KIND } from '../services/welcomeCoupon.js';
const router = Router();
// Entrada de cliente: 10 senhas erradas por IP e por celular a cada 15 min.
const custLoginByIp = createAttemptLimiter({ max: 10, windowMs: 15 * 60 * 1000 }), custLoginByPhone = createAttemptLimiter({ max: 10, windowMs: 15 * 60 * 1000 });
const normalizePhone = value => String(value || '').replace(/\D/g, '');
function tokenFor(customer) { return jwt.sign({ sub: String(customer.id), type: 'customer' }, process.env.JWT_SECRET, { expiresIn: '30d' }); }
function auth(req, res, next) {
  try {
    const raw = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const payload = jwt.verify(raw, process.env.JWT_SECRET);
    if (payload.type !== 'customer')
      throw new Error('invalid');
    req.customerId = Number(payload.sub);
    next();
  }
  catch {
    return res.status(401).json({ error: 'Entre na sua conta novamente para continuar.' });
  }
}
router.post('/customers/register', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim(), phone = normalizePhone(req.body.phone), password = String(req.body.password || '');
    if (name.length < 2 || name.length > 120)
      return res.status(400).json({ error: 'Informe seu nome completo.' });
    if (phone.length < 10 || phone.length > 15)
      return res.status(400).json({ error: 'Informe um número de celular válido com DDD.' });
    if (password.length < 8 || password.length > 72)
      return res.status(400).json({ error: 'A senha deve ter entre 8 e 72 caracteres.' });
    const db = getPool();
    const exists = await db.query('SELECT id FROM customers WHERE phone=$1', [phone]);
    if (exists.rowCount)
      return res.status(409).json({ error: 'Este número de WhatsApp já está cadastrado em outra conta. Toque em ‘Fazer login’ para entrar com esse número.' });
    const hash = await bcrypt.hash(password, 12);
    const result = await db.query('INSERT INTO customers(name,phone,password_hash) VALUES($1,$2,$3) RETURNING id,name,phone', [name, phone, hash]);
    const c = result.rows[0];
    // O cupom nunca pode impedir o cadastro: se falhar, a conta fica criada e o erro vai para o log.
    let welcomeCoupon = null;
    try {
      const coupon = await issueWelcomeCoupon(db, c.id, c.phone);
      if (coupon) welcomeCoupon = presentWelcomeCoupon(coupon);
    }
    catch (err) {
      console.error('Falha ao criar cupom de boas-vindas:', err);
    }
    res.status(201).json({ token: tokenFor(c), customer: { name: c.name, phone: c.phone }, welcomeCoupon });
  }
  catch (e) {
    if (e.code === '23505')
      return res.status(409).json({ error: 'Este número de WhatsApp já está cadastrado em outra conta. Toque em ‘Fazer login’ para entrar com esse número.' });
    next(e);
  }
});
router.post('/customers/login', async (req, res, next) => {
  try {
    const phone = normalizePhone(req.body.phone), password = String(req.body.password || '').slice(0, 200), ip = String(req.ip || 'unknown');
    if (phone.length < 10 || phone.length > 15 || !password)
      return res.status(400).json({ error: 'Informe o celular e a senha.' });
    const wait = Math.max(custLoginByIp.retryAfterSeconds(ip), custLoginByPhone.retryAfterSeconds(phone));
    if (wait > 0) {
      res.set('Retry-After', String(wait));
      return res.status(429).json({ error: `Muitas tentativas de entrada. Aguarde ${Math.ceil(wait / 60)} minuto(s) e tente novamente.` });
    }
    const r = await getPool().query('SELECT id,name,phone,password_hash,must_change_password FROM customers WHERE phone=$1', [phone]);
    if (!r.rowCount || !(await bcrypt.compare(password, r.rows[0].password_hash))) {
      custLoginByIp.record(ip);
      custLoginByPhone.record(phone);
      return res.status(401).json({ error: 'Celular ou senha incorretos.' });
    }
    const c = r.rows[0];
    custLoginByIp.reset(ip);
    custLoginByPhone.reset(phone);
    res.json({ token: tokenFor(c), customer: { name: c.name, phone: c.phone }, mustChangePassword: !!c.must_change_password });
  }
  catch (e) {
    next(e);
  }
});
router.get('/customers/me', auth, async (req, res, next) => {
  try {
    const db = getPool();
    const r = await db.query('SELECT name,phone,created_at,must_change_password FROM customers WHERE id=$1', [req.customerId]);
    if (!r.rowCount)
      return res.status(404).json({ error: 'Conta não encontrada.' });
    const l = await db.query("SELECT COALESCE(SUM(points),0)::int AS balance FROM loyalty_points WHERE regexp_replace(customer_phone,'[^0-9]','','g')=$1", [r.rows[0].phone]);
    const { must_change_password, ...customer } = r.rows[0];
    res.json({ customer, loyaltyBalance: l.rows[0].balance, mustChangePassword: !!must_change_password });
  }
  catch (e) {
    next(e);
  }
});
router.get('/customers/me/coupons', auth, async (req, res, next) => {
  try {
    const r = await getPool().query('SELECT code,discount_value,active,used_at,created_at FROM coupons WHERE customer_id=$1 AND kind=$2 ORDER BY created_at DESC', [req.customerId, WELCOME_KIND]);
    res.json({ coupons: r.rows.map(presentWelcomeCoupon) });
  }
  catch (e) {
    next(e);
  }
});
router.patch('/customers/me', auth, async (req, res, next) => {
  try {
    const db = getPool();
    const name = String(req.body.name || '').trim();
    if (name.length < 2 || name.length > 120)
      return res.status(400).json({ error: 'Informe um nome entre 2 e 120 caracteres.' });
    const hasPhone = req.body.phone !== undefined && req.body.phone !== null && String(req.body.phone).trim() !== '';
    if (hasPhone) {
      const phone = normalizePhone(req.body.phone);
      if (phone.length < 10 || phone.length > 15)
        return res.status(400).json({ error: 'Informe um número de celular válido com DDD.' });
      const current = await db.query('SELECT phone,password_hash FROM customers WHERE id=$1', [req.customerId]);
      if (!current.rowCount)
        return res.status(404).json({ error: 'Conta não encontrada.' });
      if (phone !== current.rows[0].phone) {
        const password = String(req.body.currentPassword || '');
        if (!password || !(await bcrypt.compare(password, current.rows[0].password_hash)))
          return res.status(400).json({ error: 'Para trocar o telefone, informe sua senha atual corretamente.' });
        const exists = await db.query('SELECT id FROM customers WHERE phone=$1 AND id<>$2', [phone, req.customerId]);
        if (exists.rowCount)
          return res.status(409).json({ error: 'Este número já está cadastrado em outra conta.' });
        const r = await db.query('UPDATE customers SET name=$1,phone=$2,updated_at=NOW() WHERE id=$3 RETURNING name,phone', [name, phone, req.customerId]);
        return res.json({ customer: r.rows[0] });
      }
    }
    const r = await db.query('UPDATE customers SET name=$1,updated_at=NOW() WHERE id=$2 RETURNING name,phone', [name, req.customerId]);
    res.json({ customer: r.rows[0] });
  }
  catch (e) {
    if (e.code === '23505')
      return res.status(409).json({ error: 'Este número já está cadastrado em outra conta.' });
    next(e);
  }
});
router.post('/customers/me/password', auth, async (req, res, next) => {
  try {
    const current = String(req.body.currentPassword || ''), nextPassword = String(req.body.newPassword || '');
    if (nextPassword.length < 8 || nextPassword.length > 72)
      return res.status(400).json({ error: 'A nova senha deve ter entre 8 e 72 caracteres.' });
    const db = getPool(), r = await db.query('SELECT password_hash FROM customers WHERE id=$1', [req.customerId]);
    if (!r.rowCount || !(await bcrypt.compare(current, r.rows[0].password_hash)))
      return res.status(400).json({ error: 'A senha atual está incorreta.' });
    await db.query('UPDATE customers SET password_hash=$1,must_change_password=FALSE,updated_at=NOW() WHERE id=$2', [await bcrypt.hash(nextPassword, 12), req.customerId]);
    res.json({ message: 'Senha alterada com sucesso.' });
  }
  catch (e) {
    next(e);
  }
});
router.get('/customers/me/orders', auth, async (req, res, next) => {
  try {
    const r = await getPool().query(`SELECT order_code,customer_name,customer_phone,address,neighborhood,payment_method,change_for,items,subtotal_cents,delivery_fee_cents,needs_spoon,spoon_quantity,spoon_cents,total_cents,status,created_at,updated_at FROM orders WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 100`, [req.customerId]);
    res.json({ orders: r.rows });
  }
  catch (e) {
    next(e);
  }
});
// Favoritos: combinações salvas (tamanho + complementos) para pedir novamente com um toque.
router.get('/customers/me/favorites', auth, async (req, res, next) => {
  try {
    const r = await getPool().query('SELECT id,name,size_id,option_ids FROM customer_favorites WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 30', [req.customerId]);
    res.json({ favorites: r.rows.map(f => ({ id: Number(f.id), name: f.name, sizeId: f.size_id, optionIds: f.option_ids })) });
  }
  catch (e) {
    next(e);
  }
});
router.post('/customers/me/favorites', auth, async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim().slice(0, 60), sizeId = Number(req.body.sizeId), optionIds = Array.isArray(req.body.optionIds) ? [...new Set(req.body.optionIds.map(Number))].filter(n => Number.isInteger(n) && n > 0).slice(0, 30) : [];
    if (name.length < 2)
      return res.status(400).json({ error: 'Dê um nome ao seu favorito (mínimo 2 letras).' });
    if (!Number.isInteger(sizeId) || sizeId < 1)
      return res.status(400).json({ error: 'Escolha um tamanho para salvar.' });
    const db = getPool();
    const size = await db.query('SELECT id FROM product_sizes WHERE id=$1 AND active=true', [sizeId]);
    if (!size.rowCount)
      return res.status(400).json({ error: 'Tamanho indisponível.' });
    if (optionIds.length) {
      const o = await db.query('SELECT id FROM options WHERE id=ANY($1::int[]) AND active=true', [optionIds]);
      if (o.rowCount !== optionIds.length)
        return res.status(400).json({ error: 'Alguma opção escolhida não está mais disponível.' });
    }
    const count = await db.query('SELECT COUNT(*)::int AS n FROM customer_favorites WHERE customer_id=$1', [req.customerId]);
    if (count.rows[0].n >= 20)
      return res.status(400).json({ error: 'Você já tem 20 favoritos. Remova algum para salvar outro.' });
    const r = await db.query('INSERT INTO customer_favorites(customer_id,name,size_id,option_ids) VALUES($1,$2,$3,$4::jsonb) RETURNING id,name,size_id,option_ids', [req.customerId, name, sizeId, JSON.stringify(optionIds)]);
    const f = r.rows[0];
    res.status(201).json({ favorite: { id: Number(f.id), name: f.name, sizeId: f.size_id, optionIds: f.option_ids } });
  }
  catch (e) {
    next(e);
  }
});
router.delete('/customers/me/favorites/:id', auth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1)
      return res.status(400).json({ error: 'Favorito inválido.' });
    const r = await getPool().query('DELETE FROM customer_favorites WHERE id=$1 AND customer_id=$2', [id, req.customerId]);
    if (!r.rowCount)
      return res.status(404).json({ error: 'Favorito não encontrado.' });
    res.json({ ok: true });
  }
  catch (e) {
    next(e);
  }
});
export default router;
