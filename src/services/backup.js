import { getPool } from '../db/pool.js';
// Backup e restauração do banco (JSON). Usado apenas pelo painel do desenvolvedor (/api/dev/backup*).
export async function backupDownload(_req, res, next) {
  // O arquivo é escrito tabela por tabela: a memória usada é a da maior tabela, e não a do banco inteiro.
  // Contém dados pessoais e hashes de senha dos clientes: guarde o arquivo em local seguro.
  let started = false;
  try {
    const db = getPool();
    const names = ['products', 'product_sizes', 'options', 'delivery_zones', 'settings', 'customer_accounts', 'orders', 'customer_favorites', 'reviews', 'coupons', 'loyalty_points', 'inventory_items', 'inventory_recipes', 'inventory_movements', 'inventory_calibrations'];
    const source = { customer_accounts: 'customers' };
    await db.query('SELECT 1'); // falha aqui ainda devolve erro normal, antes de começar o arquivo
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="acai-da-roca-backup-${new Date().toISOString().slice(0, 10)}.json"`);
    res.write(`{"format":"acai-da-roca-backup","version":1,"createdAt":${JSON.stringify(new Date().toISOString())},"data":{`);
    started = true;
    for (const name of names) {
      const { rows } = await db.query(`SELECT * FROM ${source[name] || name} ORDER BY 1`);
      res.write(`${JSON.stringify(name)}:${JSON.stringify(rows)},`);
    }
    // Lista derivada dos pedidos (nome, telefone, último endereço), mantida por compatibilidade com backups antigos.
    const customers = (await db.query(`SELECT DISTINCT ON (regexp_replace(customer_phone,'[^0-9]','','g')) customer_name,customer_phone,address,neighborhood FROM orders ORDER BY regexp_replace(customer_phone,'[^0-9]','','g'),created_at DESC`)).rows;
    res.write(`"customers":${JSON.stringify(customers)}}}`);
    res.end();
  }
  catch (e) {
    if (started) {
      console.error('Falha no meio do backup:', e);
      res.destroy(e);
    }
    else
      next(e);
  }
}
export function backupVerify(req, res) {
  const b = req.body;
  if (!b || b.format !== 'acai-da-roca-backup' || b.version !== 1 || !b.data)
    return res.status(400).json({ valid: false, error: 'Arquivo de backup incompatível.' });
  const required = ['products', 'product_sizes', 'options', 'delivery_zones', 'settings', 'orders', 'reviews', 'coupons', 'loyalty_points'];
  const missing = required.filter(k => !Array.isArray(b.data[k]));
  if (missing.length)
    return res.status(400).json({ valid: false, error: `Backup incompleto: ${missing.join(', ')}.` });
  const optional = ['customer_accounts', 'customer_favorites'].filter(k => Array.isArray(b.data[k]));
  res.json({ valid: true, createdAt: b.createdAt, hasCustomerAccounts: Array.isArray(b.data.customer_accounts), counts: Object.fromEntries([...required, ...optional].map(k => [k, b.data[k].length])) });
}
export async function backupRestore(req, res, next) {
  const b = req.body;
  if (req.body?.confirmRestore !== true)
    return res.status(400).json({ error: 'Confirme explicitamente a restauração.' });
  if (!b || b.format !== 'acai-da-roca-backup' || b.version !== 1 || !b.data)
    return res.status(400).json({ error: 'Arquivo de backup incompatível.' });
  const tables = ['products', 'product_sizes', 'options', 'delivery_zones', 'settings', 'orders', 'reviews', 'coupons', 'loyalty_points'];
  if (tables.some(k => !Array.isArray(b.data[k])))
    return res.status(400).json({ error: 'O backup está incompleto.' });
  const withAccounts = Array.isArray(b.data.customer_accounts);
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    for (const t of ['inventory_calibrations', 'inventory_movements', 'inventory_recipes', 'inventory_items', 'loyalty_points', ...(withAccounts ? ['customer_favorites'] : []), 'orders', ...(withAccounts ? ['customers'] : []), 'reviews', 'coupons', 'product_sizes', 'products', 'options', 'delivery_zones', 'settings'])
      await client.query(`DELETE FROM ${t}`);
    // Contas de clientes (com hash de senha) voltam antes dos pedidos, que apontam para elas.
    const keepCustomerIds = new Set(withAccounts ? b.data.customer_accounts.map(r => Number(r.id)) : (await client.query('SELECT id FROM customers')).rows.map(r => Number(r.id)));
    if (withAccounts)
      for (const r of b.data.customer_accounts)
        await client.query('INSERT INTO customers(id,name,phone,password_hash,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6)', [r.id, r.name, r.phone, r.password_hash, r.created_at, r.updated_at || r.created_at]);
    for (const r of b.data.products)
      await client.query('INSERT INTO products(id,name,description,active,sort_order,created_at) VALUES($1,$2,$3,$4,$5,$6)', [r.id, r.name, r.description || '', r.active, r.sort_order || 0, r.created_at]);
    for (const r of b.data.product_sizes)
      await client.query('INSERT INTO product_sizes(id,product_id,name,price_cents,active,sort_order) VALUES($1,$2,$3,$4,$5,$6)', [r.id, r.product_id, r.name, r.price_cents, r.active, r.sort_order || 0]);
    for (const r of b.data.options)
      await client.query('INSERT INTO options(id,name,category,price_cents,active,sort_order) VALUES($1,$2,$3,$4,$5,$6)', [r.id, r.name, r.category, r.price_cents, r.active, r.sort_order || 0]);
    for (const r of (b.data.inventory_items || []))
      await client.query('INSERT INTO inventory_items(id,name,unit,quantity,minimum_quantity,unit_cost,option_id,active,auto_disable,created_at,updated_at,capacity_quantity,purchase_total,consumption_quantity,consumption_unit) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)', [r.id, r.name, r.unit, r.quantity, r.minimum_quantity, r.unit_cost, r.option_id, r.active, r.auto_disable, r.created_at, r.updated_at, r.capacity_quantity ?? r.quantity, r.purchase_total ?? 0, r.consumption_quantity ?? null, r.consumption_unit ?? null]);
    for (const r of (b.data.inventory_recipes || []))
      await client.query('INSERT INTO inventory_recipes(id,inventory_item_id,size_id,option_id,quantity) VALUES($1,$2,$3,$4,$5)', [r.id, r.inventory_item_id, r.size_id, r.option_id, r.quantity]);
    for (const r of b.data.delivery_zones)
      await client.query('INSERT INTO delivery_zones(id,name,fee_cents,active,created_at) VALUES($1,$2,$3,$4,$5)', [r.id, r.name, r.fee_cents, r.active, r.created_at]);
    for (const r of b.data.settings)
      await client.query('INSERT INTO settings(key,value,updated_at) VALUES($1,$2,$3)', [r.key, r.value, r.updated_at]);
    // Cupom pessoal (de boas-vindas) só volta se a conta dele voltou; sem dono ele viraria um cupom público.
    for (const r of b.data.coupons) {
      if (r.customer_id && !keepCustomerIds.has(Number(r.customer_id)))
        continue;
      await client.query('INSERT INTO coupons(id,code,discount_type,discount_value,min_subtotal_cents,active,created_at,kind,customer_id,used_at,used_order_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [r.id, r.code, r.discount_type, r.discount_value, r.min_subtotal_cents, r.active, r.created_at, r.kind || 'manual', r.customer_id ?? null, r.used_at ?? null, r.used_order_id ?? null]);
    }
    for (const r of b.data.orders)
      await client.query(`INSERT INTO orders(customer_id,id,order_code,customer_name,customer_phone,address,neighborhood,notes,scheduled_for,fulfillment,items,subtotal_cents,delivery_fee_cents,total_cents,status,whatsapp_opened,created_at,updated_at,payment_method,change_for,coupon_code,discount_cents,combo_discount_cents,estimated_minutes_min,estimated_minutes_max,needs_spoon,spoon_quantity,spoon_cents) VALUES(${Array.from({ length: 28 }, (_, i) => '$' + (i + 1)).join(',')})`, [r.customer_id && keepCustomerIds.has(Number(r.customer_id)) ? r.customer_id : null, r.id, r.order_code, r.customer_name, r.customer_phone, r.address, r.neighborhood, r.notes || '', r.scheduled_for, r.fulfillment || 'delivery', JSON.stringify(r.items), r.subtotal_cents, r.delivery_fee_cents, r.total_cents, r.status, r.whatsapp_opened || false, r.created_at, r.updated_at, r.payment_method || 'A combinar', r.change_for, r.coupon_code, r.discount_cents || 0, r.combo_discount_cents || 0, r.estimated_minutes_min || 35, r.estimated_minutes_max || 55, r.needs_spoon || false, r.spoon_quantity || (r.needs_spoon ? 1 : 0), r.spoon_cents || 0]);
    for (const r of (b.data.inventory_movements || []))
      await client.query('INSERT INTO inventory_movements(id,inventory_item_id,movement_type,quantity,unit_cost,reason,supplier,order_id,idempotency_key,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [r.id, r.inventory_item_id, r.movement_type, r.quantity, r.unit_cost || 0, r.reason ?? null, r.supplier ?? null, r.order_id ?? null, r.idempotency_key ?? null, r.created_at]);
    for (const r of (b.data.inventory_calibrations || []))
      await client.query('INSERT INTO inventory_calibrations(id,inventory_item_id,size_id,option_id,samples,average_quantity,approved,created_at,approved_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [r.id, r.inventory_item_id, r.size_id ?? null, r.option_id ?? null, r.samples, r.average_quantity, r.approved || false, r.created_at, r.approved_at ?? null]);
    for (const r of b.data.reviews)
      await client.query('INSERT INTO reviews(id,customer_name,rating,comment,approved,created_at,photo,photo_url,photo_public_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [r.id, r.customer_name, r.rating, r.comment, r.approved, r.created_at, r.photo ?? null, r.photo_url ?? null, r.photo_public_id ?? null]);
    if (withAccounts)
      for (const r of (b.data.customer_favorites || []))
        await client.query('INSERT INTO customer_favorites(id,customer_id,name,size_id,option_ids,created_at) VALUES($1,$2,$3,$4,$5::jsonb,$6)', [r.id, r.customer_id, r.name, r.size_id, JSON.stringify(r.option_ids || []), r.created_at]);
    for (const r of b.data.loyalty_points)
      await client.query('INSERT INTO loyalty_points(id,order_id,customer_phone,points,created_at) VALUES($1,$2,$3,$4,$5)', [r.id, r.order_id, r.customer_phone, r.points, r.created_at]);
    for (const [table, col] of [['products', 'id'], ['product_sizes', 'id'], ['options', 'id'], ['delivery_zones', 'id'], ['orders', 'id'], ['reviews', 'id'], ['coupons', 'id'], ['loyalty_points', 'id'], ['inventory_items', 'id'], ['inventory_recipes', 'id'], ['inventory_movements', 'id'], ['inventory_calibrations', 'id'], ...(withAccounts ? [['customers', 'id'], ['customer_favorites', 'id']] : [])])
      await client.query(`SELECT setval(pg_get_serial_sequence('${table}','${col}'),COALESCE((SELECT MAX(${col}) FROM ${table}),1),EXISTS(SELECT 1 FROM ${table}))`);
    await client.query('COMMIT');
    res.json({ ok: true, accountsRestored: withAccounts, message: withAccounts ? 'Restauração concluída, incluindo contas de clientes e favoritos. Confira os dados no painel e na loja.' : 'Restauração concluída. Este backup é antigo e não tem contas de clientes: as contas atuais foram mantidas, mas os pedidos antigos ficam sem vínculo com elas. Confira os dados no painel e na loja.' });
  }
  catch (e) {
    await client.query('ROLLBACK');
    next(e);
  }
  finally {
    client.release();
  }
}
