import { Router } from 'express';
import { getPool } from '../db/pool.js';
import { getSettings, isOpenAt } from '../services/store.js';
import { comboRules, MAX_SPOONS, priceOrder, SPOON_PRICE_CENTS } from '../services/pricing.js';
import { soldOutSizeIds } from '../services/inventory.js';
import { parseReviewPhoto, photoBufferFromDataUrl, createRateLimiter } from '../services/reviews.js';
import { getPhotoStorage, uploadPhoto, downloadPhoto } from '../services/photoStorage.js';
import { createAttemptLimiter } from '../services/rateLimit.js';
import { sanitizeClientError } from '../services/alerts.js';
import { saveError } from '../services/errorLog.js';
import { BUILD_ID } from '../services/build.js';
import { buildScheduleSlots } from '../services/schedule.js';
import { optionalCustomerId } from '../middleware/auth.js';
import { couponProblem, findCouponByCode } from '../services/welcomeCoupon.js';
const allowReview = createRateLimiter({ max: 5, windowMs: 60 * 60 * 1000 });
const router = Router();
const clientErrorLimiter = createAttemptLimiter({ max: 20, windowMs: 10 * 60 * 1000 });
// Versão publicada: a tela compara com a que carregou e avisa quando há deploy novo.
router.get('/version', (_req, res) => res.set('Cache-Control', 'no-store').json({ build: BUILD_ID }));
// Erros de JavaScript ocorridos no aparelho do cliente. Responde sempre 204 e limita 20 por IP a cada 10 min.
router.post('/client-errors', (req, res) => {
  const ip = String(req.ip || '').slice(0, 120), row = sanitizeClientError(req.body);
  if (row && !clientErrorLimiter.isBlocked(ip)) {
    clientErrorLimiter.record(ip);
    saveError({ ...row, kind: 'tela', userAgent: String(req.get('user-agent') || '').slice(0, 300), ip });
  }
  res.status(204).end();
});
router.get('/store', async (_req, res, next) => {
  try {
    const settings = await getSettings();
    const now = new Date();
    const openNow = isOpenAt(now, settings) && settings.manual_closed !== 'true';
    res.json({ name: settings.store_name || 'Açaí da Roça', whatsappNumber: settings.whatsapp_number || '', timezone: settings.timezone || 'America/Sao_Paulo', openingDays: (settings.opening_days || '2,3,4,5,6,0').split(',').map(Number), openingTime: settings.opening_time || '13:30', closingTime: settings.closing_time || '22:00', minimumScheduleMinutes: Number(settings.minimum_schedule_minutes || 30), maxFreeToppings: Number(settings.max_free_toppings || 5), spoonPriceCents: SPOON_PRICE_CENTS, maxSpoons: MAX_SPOONS, comboMinItems: Number(settings.combo_min_items || 2), comboDiscountPercent: Number(settings.combo_discount_percent || 5), estimatedMinutesMin: Number(settings.estimated_minutes_min || 35), estimatedMinutesMax: Number(settings.estimated_minutes_max || 55), manualClosed: settings.manual_closed === 'true', openNow });
  }
  catch (e) {
    next(e);
  }
});
// Dias e horários em que o cliente pode agendar (só o que a loja aceita, conforme a aba Funcionamento do painel).
router.get('/schedule-slots', async (_req, res, next) => {
  try {
    const settings = await getSettings();
    res.set('Cache-Control', 'no-store').json({ days: buildScheduleSlots(settings), openingTime: settings.opening_time || '13:30', closingTime: settings.closing_time || '22:00' });
  }
  catch (e) {
    next(e);
  }
});
router.get('/menu', async (_req, res, next) => {
  try {
    const db = getPool();
    const [p, s, o, z, stock] = await Promise.all([
      db.query('SELECT id,name,description,product_type AS type,image_url,active FROM products WHERE active=true ORDER BY sort_order,id'),
      db.query('SELECT s.id,s.product_id,s.name,s.price_cents AS price,p.name AS product_name FROM product_sizes s JOIN products p ON p.id=s.product_id WHERE s.active=true ORDER BY s.sort_order,s.id'),
      db.query('SELECT id,name,category,price_cents AS price FROM options WHERE active=true ORDER BY sort_order,id'),
      db.query('SELECT id,name,fee_cents AS fee FROM delivery_zones WHERE active=true ORDER BY name'),
      // Receitas por tamanho x saldo: tamanho cujo ingrediente não cobre nem um copo aparece como esgotado.
      db.query('SELECT r.size_id,r.quantity,i.quantity AS stock FROM inventory_recipes r JOIN inventory_items i ON i.id=r.inventory_item_id WHERE r.size_id IS NOT NULL AND i.active=true')
    ]);
    const soldOut = soldOutSizeIds(stock.rows);
    res.json({ products: p.rows.map(product => ({ ...product, sizes: s.rows.filter(x => x.product_id === product.id).map(x => ({ ...x, soldOut: soldOut.has(Number(x.id)) })) })), options: o.rows, zones: z.rows });
  }
  catch (e) {
    next(e);
  }
});
router.get('/coupons/validate', async (req, res, next) => {
  try {
    const code = String(req.query.code || '').trim().toUpperCase(), subtotal = Number(req.query.subtotalCents);
    if (!code || !Number.isInteger(subtotal) || subtotal < 0)
      return res.status(400).json({ error: 'Informe um cupom e um subtotal válido.' });
    // O site manda o token da conta (se logado): cupom pessoal só é aceito para o dono, e só se ainda não foi usado.
    const c = await findCouponByCode(getPool(), code);
    const problem = couponProblem(c, optionalCustomerId(req));
    if (problem)
      return res.status(problem.reason === 'invalid' ? 404 : 400).json({ error: problem.message });
    const settings = await getSettings();
    const pricing = priceOrder({ subtotalCents: subtotal, itemCount: Number(req.query.itemCount || 0), combo: comboRules(settings), coupon: c });
    if (pricing.couponRejected)
      return res.status(400).json({ error: pricing.couponRejected.message });
    const discountCents = pricing.couponDiscountCents, comboDiscount = pricing.comboDiscountCents;
    res.json({ code: c.code, discountCents, comboDiscountCents: comboDiscount, discountType: c.discount_type, discountValue: c.discount_value });
  }
  catch (e) {
    next(e);
  }
});
router.get('/reviews', async (_req, res, next) => {
  try {
    const { rows } = await getPool().query('SELECT id,customer_name AS name,rating,comment,created_at,(photo IS NOT NULL OR photo_url IS NOT NULL) AS has_photo FROM reviews WHERE approved=true ORDER BY created_at DESC LIMIT 30');
    res.json(rows);
  }
  catch (e) {
    next(e);
  }
});
// Foto de uma avaliação já aprovada (as pendentes só aparecem para a loja, no painel).
router.get('/reviews/:id/photo', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1)
      return res.status(404).end();
    const { rows } = await getPool().query('SELECT photo,photo_url FROM reviews WHERE id=$1 AND approved=true AND (photo IS NOT NULL OR photo_url IS NOT NULL)', [id]);
    const bytes = !rows.length ? null : rows[0].photo_url ? await downloadPhoto(rows[0].photo_url) : photoBufferFromDataUrl(rows[0].photo);
    if (!bytes)
      return res.status(404).end();
    res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600', 'Content-Length': String(bytes.length) });
    res.end(bytes);
  }
  catch (e) {
    next(e);
  }
});
router.post('/reviews', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim().slice(0, 100), comment = String(req.body.comment || '').trim().slice(0, 800), rating = Number(req.body.rating);
    if (name.length < 2 || comment.length < 5 || !Number.isInteger(rating) || rating < 1 || rating > 5)
      return res.status(400).json({ error: 'Informe nome, comentário e nota de 1 a 5.' });
    const parsed = parseReviewPhoto(req.body.photo);
    if (parsed.error)
      return res.status(400).json({ error: parsed.error });
    if (!allowReview(req.ip || 'anon'))
      return res.status(429).json({ error: 'Você enviou várias avaliações em pouco tempo. Tente novamente mais tarde.' });
    // Com o armazenamento configurado, a foto vai para lá e o banco guarda só o endereço; sem ele, mantém o comportamento antigo.
    let stored = null;
    if (parsed.photo && getPhotoStorage()) {
      try {
        stored = await uploadPhoto(parsed.bytes);
      }
      catch (err) {
        console.error('Falha ao enviar foto da avaliação:', err.message);
        return res.status(502).json({ error: 'Não foi possível enviar a foto agora. Tente de novo em instantes ou envie a avaliação sem foto.' });
      }
    }
    await getPool().query('INSERT INTO reviews(customer_name,rating,comment,photo,photo_url,photo_public_id) VALUES($1,$2,$3,$4,$5,$6)', [name, rating, comment, stored ? null : parsed.photo, stored?.url ?? null, stored?.publicId ?? null]);
    res.status(201).json({ message: parsed.photo ? 'Avaliação e foto enviadas para análise. Obrigado!' : 'Avaliação enviada para análise. Obrigado!' });
  }
  catch (e) {
    next(e);
  }
});
export default router;
