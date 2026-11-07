import bcrypt from 'bcryptjs';
import { getPool } from './pool.js';
const schema = `
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY, name VARCHAR(120) NOT NULL, description TEXT NOT NULL DEFAULT '',
  product_type VARCHAR(20) NOT NULL DEFAULT 'traditional' CHECK(product_type IN ('traditional','truffled')),
  image_url TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE, sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS product_sizes (
  id SERIAL PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL, price_cents INTEGER NOT NULL CHECK(price_cents >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE, sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(product_id, name)
);
CREATE TABLE IF NOT EXISTS options (
  id SERIAL PRIMARY KEY, name VARCHAR(120) NOT NULL, category VARCHAR(30) NOT NULL CHECK(category IN ('topping','syrup','extra','mousse')),
  price_cents INTEGER NOT NULL DEFAULT 0 CHECK(price_cents >= 0), active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0, UNIQUE(name, category)
);
CREATE TABLE IF NOT EXISTS delivery_zones (
  id SERIAL PRIMARY KEY, name VARCHAR(120) NOT NULL UNIQUE, fee_cents INTEGER NOT NULL CHECK(fee_cents >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(80) PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY, name VARCHAR(120) NOT NULL, phone VARCHAR(15) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY, customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL, order_code VARCHAR(20) NOT NULL UNIQUE, customer_name VARCHAR(120) NOT NULL,
  customer_phone VARCHAR(30) NOT NULL, address TEXT NOT NULL, neighborhood VARCHAR(120) NOT NULL,
  notes TEXT NOT NULL DEFAULT '', scheduled_for TIMESTAMPTZ, fulfillment VARCHAR(20) NOT NULL DEFAULT 'delivery' CHECK(fulfillment='delivery'),
  items JSONB NOT NULL, subtotal_cents INTEGER NOT NULL CHECK(subtotal_cents >= 0), delivery_fee_cents INTEGER NOT NULL CHECK(delivery_fee_cents >= 0),
  total_cents INTEGER NOT NULL CHECK(total_cents >= 0), status VARCHAR(30) NOT NULL DEFAULT 'new' CHECK(status IN ('new','preparing','out_for_delivery','delivered','cancelled')),
  whatsapp_opened BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS reviews (
  id BIGSERIAL PRIMARY KEY, customer_name VARCHAR(100) NOT NULL, rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL, approved BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY, email VARCHAR(255) NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS developers (
  id SERIAL PRIMARY KEY, email VARCHAR(255) NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS coupons (
  id SERIAL PRIMARY KEY, code VARCHAR(40) NOT NULL UNIQUE,
  discount_type VARCHAR(10) NOT NULL CHECK(discount_type IN ('percent','fixed')),
  discount_value INTEGER NOT NULL CHECK(discount_value > 0),
  min_subtotal_cents INTEGER NOT NULL DEFAULT 0 CHECK(min_subtotal_cents >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status);
CREATE INDEX IF NOT EXISTS reviews_approved_idx ON reviews(approved, created_at DESC);
CREATE TABLE IF NOT EXISTS loyalty_points (id BIGSERIAL PRIMARY KEY, order_id BIGINT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE, customer_phone VARCHAR(30) NOT NULL, points INTEGER NOT NULL CHECK(points >= 0), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX IF NOT EXISTS loyalty_phone_idx ON loyalty_points(customer_phone);
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id BIGSERIAL PRIMARY KEY, admin_id INTEGER, admin_email VARCHAR(255) NOT NULL,
  action VARCHAR(20) NOT NULL, route TEXT NOT NULL, status_code INTEGER NOT NULL,
  ip_address VARCHAR(120), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS admin_audit_created_idx ON admin_audit_logs(created_at DESC);
CREATE TABLE IF NOT EXISTS client_errors (
  id BIGSERIAL PRIMARY KEY, kind VARCHAR(10) NOT NULL DEFAULT 'tela', message TEXT NOT NULL, source TEXT, line INTEGER, col INTEGER,
  stack TEXT, page TEXT, build VARCHAR(20), user_agent TEXT, ip_address VARCHAR(120), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS client_errors_created_idx ON client_errors(created_at DESC);
CREATE TABLE IF NOT EXISTS customer_favorites (
  id BIGSERIAL PRIMARY KEY, customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name VARCHAR(60) NOT NULL, size_id INTEGER NOT NULL, option_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS customer_favorites_customer_idx ON customer_favorites(customer_id, created_at DESC);
CREATE TABLE IF NOT EXISTS inventory_items (
 id BIGSERIAL PRIMARY KEY, name VARCHAR(140) NOT NULL, unit VARCHAR(20) NOT NULL,
 quantity NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK(quantity>=0), minimum_quantity NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK(minimum_quantity>=0),
 unit_cost NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK(unit_cost>=0), option_id INTEGER UNIQUE REFERENCES options(id) ON DELETE SET NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE, auto_disable BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS inventory_recipes (
 id BIGSERIAL PRIMARY KEY, inventory_item_id BIGINT NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
 size_id INTEGER REFERENCES product_sizes(id) ON DELETE CASCADE, option_id INTEGER REFERENCES options(id) ON DELETE CASCADE,
 quantity NUMERIC(14,3) NOT NULL CHECK(quantity>0), CHECK ((size_id IS NOT NULL)::int + (option_id IS NOT NULL)::int = 1),
 UNIQUE(inventory_item_id,size_id,option_id)
);
CREATE TABLE IF NOT EXISTS inventory_movements (
 id BIGSERIAL PRIMARY KEY, inventory_item_id BIGINT NOT NULL REFERENCES inventory_items(id), movement_type VARCHAR(20) NOT NULL,
 quantity NUMERIC(14,3) NOT NULL CHECK(quantity>0), unit_cost NUMERIC(14,4) NOT NULL DEFAULT 0,
 reason TEXT, supplier VARCHAR(160), order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
 idempotency_key VARCHAR(180) UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_recipe_size_uidx ON inventory_recipes(inventory_item_id,size_id) WHERE size_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS inventory_recipe_option_uidx ON inventory_recipes(inventory_item_id,option_id) WHERE option_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS inventory_movements_item_idx ON inventory_movements(inventory_item_id,created_at DESC);
CREATE TABLE IF NOT EXISTS inventory_calibrations (
 id BIGSERIAL PRIMARY KEY, inventory_item_id BIGINT NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
 size_id INTEGER REFERENCES product_sizes(id) ON DELETE CASCADE, option_id INTEGER REFERENCES options(id) ON DELETE CASCADE,
 samples NUMERIC(14,3)[] NOT NULL, average_quantity NUMERIC(14,3) NOT NULL, approved BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), approved_at TIMESTAMPTZ
);
`;
const products = [
  { name: 'Açaí tradicional', description: 'Monte do seu jeito com acompanhamentos e caldas.', sizes: [['300 ml', 1200], ['400 ml', 1600], ['500 ml', 1900], ['700 ml', 2300], ['Pote de 1 litro', 3800], ['1 copo especial', 3500]] }
];
const options = [
  ...['Paçoca', 'Granola', 'Amendoim', 'Granulado', 'Flocos de arroz', 'Chocobool', 'Sucrilhos', 'Leite em pó', 'Aveia', 'Jujuba'].map((name, i) => ({ name, category: 'topping', price: 0, sort: i })),
  ...['Morango', 'Chocolate', 'Menta', 'Uva', 'Banana caramelizada', 'Maracujá'].map((name, i) => ({ name, category: 'syrup', price: 0, sort: i })),
  ...[['Nutella', 600], ['Creme de paçoca', 600], ['Creme de avelã', 500], ['Creme de beijinho', 600], ['Ovomaltine', 500], ['Doce de leite', 400]].map(([name, price], i) => ({ name, category: 'extra', price, sort: i })),
  ...[['Mousse de maracujá', 500], ['Mousse de morango', 500], ['Mousse de limão', 500]].map(([name, price], i) => ({ name, category: 'mousse', price, sort: i }))
];
// Taxas provisórias por faixas de distância a partir do Cruzeiro (Vale do Paquequer).
// A lista foi reduzida para bairros próximos; confirme a distância pela rota antes de ativar vendas.
const zones = [
  ['Cruzeiro', 500],
  ['Pessegueiros', 1000], ['Andradas', 1000], ['Santa Rita', 1000], ['Campo Limpo', 1000],
  ['Providência', 1500], ['Ponte Nova', 1500], ['Granja Mafra', 1500]
];
export async function initializeDatabase() {
  const db = getPool();
  await db.query(schema);
  await db.query('DROP TABLE IF EXISTS admin_login_attempts');
  // Momento da última troca de senha: tokens emitidos antes dela deixam de valer (ver services/sessionVersion.js).
  await db.query('ALTER TABLE admins ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ');
  await db.query('ALTER TABLE developers ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ');
  // Auditoria compartilhada: 'admin' (painel da loja) ou 'dev' (painel do desenvolvedor). Linhas antigas viram 'admin'.
  await db.query("ALTER TABLE admin_audit_logs ADD COLUMN IF NOT EXISTS actor VARCHAR(10) NOT NULL DEFAULT 'admin'");
  await db.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type VARCHAR(20) NOT NULL DEFAULT 'traditional'");
  await db.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT');
  await db.query('ALTER TABLE reviews ADD COLUMN IF NOT EXISTS photo TEXT');
  // Fotos novas ficam no armazenamento de arquivos (Cloudinary); o banco guarda só o endereço.
  await db.query('ALTER TABLE reviews ADD COLUMN IF NOT EXISTS photo_url TEXT');
  await db.query('ALTER TABLE reviews ADD COLUMN IF NOT EXISTS photo_public_id TEXT');
  await db.query('ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS purchase_total NUMERIC(14,2) NOT NULL DEFAULT 0');
  await db.query('ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS capacity_quantity NUMERIC(14,3) NOT NULL DEFAULT 0');
  await db.query('UPDATE inventory_items SET capacity_quantity=quantity WHERE capacity_quantity=0 AND quantity>0');
  await db.query('ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS consumption_quantity NUMERIC(14,3)');
  await db.query('ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS consumption_unit VARCHAR(10)');
  await db.query('ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(14,4) NOT NULL DEFAULT 0');
  await db.query('ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS reason TEXT');
  await db.query('ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS supplier VARCHAR(160)');
  await db.query('ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL');
  await db.query('ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(180)');
  await db.query('CREATE UNIQUE INDEX IF NOT EXISTS inventory_movements_idempotency_uidx ON inventory_movements(idempotency_key) WHERE idempotency_key IS NOT NULL');
  // Vincula automaticamente itens cujo nome corresponde exatamente a um acompanhamento existente.
  await db.query(`WITH candidates AS (
    SELECT DISTINCT ON (o.id) i.id AS item_id,o.id AS option_id
    FROM inventory_items i JOIN options o ON LOWER(TRIM(i.name))=LOWER(TRIM(o.name))
    WHERE i.active=true AND i.option_id IS NULL AND NOT EXISTS (SELECT 1 FROM inventory_items x WHERE x.option_id=o.id)
    ORDER BY o.id,i.id
  ) UPDATE inventory_items i SET option_id=c.option_id,auto_disable=TRUE FROM candidates c WHERE i.id=c.item_id`);
  // Consolida produtos duplicados criados por inicializações anteriores.
  // Mantém o produto mais antigo e transfere tamanhos que ainda não existam nele.
  await db.query(`
    WITH ranked_products AS (
      SELECT id,
             FIRST_VALUE(id) OVER (PARTITION BY LOWER(TRIM(name)) ORDER BY id) AS keeper_id
      FROM products
    )
    INSERT INTO product_sizes(product_id, name, price_cents, active, sort_order)
    SELECT rp.keeper_id, ps.name, ps.price_cents, ps.active, ps.sort_order
    FROM product_sizes ps
    JOIN ranked_products rp ON rp.id = ps.product_id
    WHERE rp.id <> rp.keeper_id
    ON CONFLICT(product_id, name) DO NOTHING
  `);
  await db.query(`
    WITH ranked_products AS (
      SELECT id,
             FIRST_VALUE(id) OVER (PARTITION BY LOWER(TRIM(name)) ORDER BY id) AS keeper_id
      FROM products
    )
    DELETE FROM products p
    USING ranked_products rp
    WHERE p.id = rp.id AND rp.id <> rp.keeper_id
  `);
  await db.query('CREATE UNIQUE INDEX IF NOT EXISTS products_name_normalized_uidx ON products (LOWER(TRIM(name)))');
  // Compatibilidade com bancos já existentes: adiciona a forma de pagamento sem apagar pedidos.
  await db.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL");
  await db.query("ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()");
  await db.query("ALTER TABLE customers ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE");
  await db.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(40) NOT NULL DEFAULT 'A combinar'");
  await db.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS change_for VARCHAR(30)");
  await db.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(40)");
  await db.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_cents INTEGER NOT NULL DEFAULT 0");
  await db.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS combo_discount_cents INTEGER NOT NULL DEFAULT 0");
  await db.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_minutes_min INTEGER NOT NULL DEFAULT 35");
  await db.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_minutes_max INTEGER NOT NULL DEFAULT 55");
  // Colher: spoon_quantity = quantas colheres o cliente pediu; spoon_cents = quanto foi cobrado; needs_spoon = quantidade > 0.
  await db.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS needs_spoon BOOLEAN NOT NULL DEFAULT FALSE");
  await db.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS spoon_cents INTEGER NOT NULL DEFAULT 0");
  await db.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS spoon_quantity INTEGER NOT NULL DEFAULT 0");
  // Pedidos feitos quando a colher era só Sim/Não (1 colher) passam a ter quantidade 1.
  await db.query("UPDATE orders SET spoon_quantity=1 WHERE needs_spoon AND spoon_quantity=0");
  // Cupom de boas-vindas (5% na primeira compra, uso único): fica na tabela coupons, ligado a uma conta de cliente.
  // used_order_id é só um número (sem chave estrangeira) para o backup poder restaurar cupons antes dos pedidos.
  await db.query("ALTER TABLE coupons ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'manual'");
  await db.query("ALTER TABLE coupons ADD COLUMN IF NOT EXISTS customer_id BIGINT REFERENCES customers(id) ON DELETE CASCADE");
  await db.query("ALTER TABLE coupons ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ");
  await db.query("ALTER TABLE coupons ADD COLUMN IF NOT EXISTS used_order_id BIGINT");
  await db.query("CREATE UNIQUE INDEX IF NOT EXISTS coupons_one_welcome_per_customer_uidx ON coupons(customer_id) WHERE kind='welcome'");
  for (const [key, value] of Object.entries({
    manual_closed: 'false', store_name: 'Açaí da Roça', whatsapp_number: process.env.WHATSAPP_NUMBER || '5521969081157',
    timezone: 'America/Sao_Paulo', opening_days: '2,3,4,5,6,0', opening_time: '13:30', closing_time: '22:00',
    minimum_schedule_minutes: '30', max_free_toppings: '5', combo_min_items: '2', combo_discount_percent: '0', estimated_minutes_min: '35', estimated_minutes_max: '55'
  }))
    await db.query('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO NOTHING', [key, value]);
  // A loja não quer o desconto de combo: desliga uma única vez (0%). Se ela quiser religar depois, é só definir no painel: esta regra não roda de novo.
  const comboOff = await db.query("INSERT INTO settings(key,value) VALUES('combo_disabled_v1','1') ON CONFLICT(key) DO NOTHING RETURNING key");
  if (comboOff.rowCount)
    await db.query("UPDATE settings SET value='0' WHERE key='combo_discount_percent'");
  for (const product of products) {
    let productId = (await db.query('SELECT id FROM products WHERE LOWER(TRIM(name))=LOWER(TRIM($1)) ORDER BY id LIMIT 1', [product.name])).rows[0]?.id;
    if (!productId)
      productId = (await db.query('INSERT INTO products(name,description,sort_order) VALUES($1,$2,0) RETURNING id', [product.name, product.description])).rows[0].id;
    for (const [name, price] of product.sizes)
      await db.query('INSERT INTO product_sizes(product_id,name,price_cents) VALUES($1,$2,$3) ON CONFLICT(product_id,name) DO NOTHING', [productId, name, price]);
  }
  // Sabores trufados são produtos independentes: o tamanho já determina o preço e não aceita adicionais.
  const truffledFlavors = ['Morango com Chocolate', 'Ninho com Chocolate', 'Ninho com Morango', 'Ninho com Maracujá', 'Ninho com Paçoca'];
  for (const [index, flavor] of truffledFlavors.entries()) {
    let productId = (await db.query("SELECT id FROM products WHERE LOWER(TRIM(name))=LOWER(TRIM($1))", [flavor])).rows[0]?.id;
    if (!productId)
      productId = (await db.query("INSERT INTO products(name,description,product_type,sort_order) VALUES($1,$2,'truffled',$3) RETURNING id", [flavor, 'Receita predefinida de açaí trufado.', 100 + index])).rows[0].id;
    else
      await db.query("UPDATE products SET product_type='truffled' WHERE id=$1", [productId]);
    for (const [sizeName, price] of [['400 ml', 2000], ['500 ml', 2500]])
      await db.query('INSERT INTO product_sizes(product_id,name,price_cents,sort_order) VALUES($1,$2,$3,$4) ON CONFLICT(product_id,name) DO NOTHING', [productId, sizeName, price, sizeName === '400 ml' ? 0 : 1]);
  }
  for (const item of options)
    await db.query('INSERT INTO options(name,category,price_cents,sort_order) VALUES($1,$2,$3,$4) ON CONFLICT(name,category) DO NOTHING', [item.name, item.category, item.price, item.sort]);
  // Desativa zonas antigas de demonstração que não pertencem à área de entrega solicitada.
  await db.query("UPDATE delivery_zones SET active=FALSE WHERE name = ANY($1::text[])", [['Centro', 'Alto', 'Várzea', 'Agriões', 'Barra do Imbuí']]);
  // Bairros iniciais só entram em banco novo (tabela vazia). Depois disso o painel manda: taxas editadas,
  // bairros desativados e bairros excluídos não voltam ao padrão a cada reinício ou deploy.
  if (!(await db.query('SELECT 1 FROM delivery_zones LIMIT 1')).rowCount)
    for (const [name, fee] of zones)
      await db.query('INSERT INTO delivery_zones(name,fee_cents) VALUES($1,$2) ON CONFLICT(name) DO NOTHING', [name, fee]);
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
    await db.query('INSERT INTO admins(email,password_hash) VALUES($1,$2) ON CONFLICT(email) DO NOTHING', [process.env.ADMIN_EMAIL.toLowerCase(), hash]);
  }
  // Conta do desenvolvedor (painel /dev): vem só das variáveis DEV_EMAIL e DEV_PASSWORD. Trocar a senha na variável atualiza a conta.
  if (process.env.DEV_EMAIL && process.env.DEV_PASSWORD) {
    const devEmail = process.env.DEV_EMAIL.trim().toLowerCase();
    if (process.env.DEV_PASSWORD.length < 10)
      console.warn('DEV_PASSWORD precisa ter pelo menos 10 caracteres: conta do desenvolvedor não criada.');
    else {
      const current = (await db.query('SELECT password_hash FROM developers WHERE email=$1', [devEmail])).rows[0];
      if (!current)
        await db.query('INSERT INTO developers(email,password_hash) VALUES($1,$2)', [devEmail, await bcrypt.hash(process.env.DEV_PASSWORD, 12)]);
      else if (!(await bcrypt.compare(process.env.DEV_PASSWORD, current.password_hash)))
        await db.query('UPDATE developers SET password_hash=$2, password_changed_at=NOW() WHERE email=$1', [devEmail, await bcrypt.hash(process.env.DEV_PASSWORD, 12)]);
    }
  }
  console.log('Banco de dados inicializado.');
}
