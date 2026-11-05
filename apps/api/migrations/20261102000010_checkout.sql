-- Up Migration
ALTER TABLE locations
  ADD COLUMN postal_code text CHECK (postal_code IS NULL OR postal_code ~ '^[0-9]{8}$'); -- pendente: preencher (origem do frete)

CREATE TABLE coupons (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                 citext NOT NULL UNIQUE,
  description          text,
  type                 text NOT NULL CHECK (type IN ('percent','fixed','free_shipping')),
  value                integer NOT NULL DEFAULT 0 CHECK (value >= 0),
  min_subtotal_cents   integer NOT NULL DEFAULT 0 CHECK (min_subtotal_cents >= 0),
  max_discount_cents   integer CHECK (max_discount_cents IS NULL OR max_discount_cents > 0),
  starts_at            timestamptz,
  ends_at              timestamptz,
  usage_limit          integer CHECK (usage_limit IS NULL OR usage_limit > 0),
  per_customer_limit   integer CHECK (per_customer_limit IS NULL OR per_customer_limit > 0),
  used_count           integer NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  is_active            boolean NOT NULL DEFAULT true,
  is_demo              boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CHECK ((type = 'percent' AND value BETWEEN 1 AND 100) OR (type = 'fixed' AND value > 0) OR type = 'free_shipping')
);
CREATE TRIGGER coupons_set_updated_at BEFORE UPDATE ON coupons FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE orders (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number            bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  user_id                 uuid REFERENCES users (id) ON DELETE SET NULL,
  customer_email          citext NOT NULL,
  customer_name           text NOT NULL,
  customer_phone          text NOT NULL,
  customer_document       text NOT NULL,
  fulfillment             text NOT NULL CHECK (fulfillment IN ('ship','pickup')),
  pickup_location_id      uuid REFERENCES locations (id) ON DELETE RESTRICT,
  origin_location_id      uuid NOT NULL REFERENCES locations (id) ON DELETE RESTRICT, -- unidade que separa o pedido
  shipping_address        jsonb,
  shipping_service        jsonb,
  subtotal_cents          integer NOT NULL CHECK (subtotal_cents >= 0),
  discount_cents          integer NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  shipping_cents          integer NOT NULL DEFAULT 0 CHECK (shipping_cents >= 0),
  shipping_discount_cents integer NOT NULL DEFAULT 0 CHECK (shipping_discount_cents >= 0),
  total_cents             integer NOT NULL CHECK (total_cents >= 0),
  coupon_id               uuid REFERENCES coupons (id) ON DELETE SET NULL,
  coupon_code             text,
  status                  text NOT NULL DEFAULT 'awaiting_payment'
                          CHECK (status IN ('awaiting_payment','confirmed','processing','ready_for_pickup','shipped','delivered','cancelled')),
  payment_method          text NOT NULL CHECK (payment_method IN ('pix','card','pay_on_pickup')),
  payment_status          text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','paid','failed','refunded')),
  checkout_ref            uuid NOT NULL UNIQUE,
  idempotency_key         text NOT NULL UNIQUE,
  notes                   text,
  expires_at              timestamptz NOT NULL,
  terms_accepted_at       timestamptz NOT NULL,
  is_demo                 boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CHECK ((fulfillment = 'pickup' AND pickup_location_id IS NOT NULL) OR (fulfillment = 'ship' AND shipping_address IS NOT NULL))
);
CREATE INDEX orders_user_idx ON orders (user_id);
CREATE INDEX orders_email_idx ON orders (customer_email);
CREATE INDEX orders_status_idx ON orders (status, created_at DESC);
CREATE INDEX orders_expiry_idx ON orders (expires_at) WHERE status = 'awaiting_payment';
CREATE TRIGGER orders_set_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE order_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  sku_id           uuid NOT NULL REFERENCES skus (id) ON DELETE RESTRICT,
  product_name     text NOT NULL,
  sku_code         text NOT NULL,
  color_name       text NOT NULL,
  size_label       text NOT NULL,
  image_url        text,
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  quantity         integer NOT NULL CHECK (quantity > 0),
  total_cents      integer NOT NULL CHECK (total_cents >= 0)
);
CREATE INDEX order_items_order_idx ON order_items (order_id);
CREATE INDEX order_items_sku_idx ON order_items (sku_id);

CREATE TABLE coupon_redemptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id       uuid NOT NULL REFERENCES coupons (id) ON DELETE RESTRICT,
  order_id        uuid NOT NULL UNIQUE REFERENCES orders (id) ON DELETE CASCADE,
  user_id         uuid,
  customer_email  citext NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX coupon_redemptions_coupon_idx ON coupon_redemptions (coupon_id, customer_email);

INSERT INTO settings (key, value, description) VALUES
  ('payments.enabled_methods', '[]',
   'Formas de pagamento ativas no checkout (pix, card, pay_on_pickup). Manter vazio até configurar os pagamentos (Fase 7).');

-- Down Migration
DELETE FROM settings WHERE key = 'payments.enabled_methods';
DROP TABLE IF EXISTS coupon_redemptions;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS coupons;
ALTER TABLE locations DROP COLUMN IF EXISTS postal_code;
