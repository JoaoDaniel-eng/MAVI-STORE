-- Up Migration
CREATE TABLE categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id   uuid REFERENCES categories (id) ON DELETE RESTRICT,
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  description text,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  is_demo     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE colors (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9]{2,12}$'),
  name        text NOT NULL UNIQUE,
  hex         text NOT NULL CHECK (hex ~ '^#[0-9A-Fa-f]{6}$'),
  is_demo     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sizes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label       text NOT NULL UNIQUE,
  sort_order  integer NOT NULL DEFAULT 0,
  is_demo     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE size_guides (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  description text,
  columns     jsonb NOT NULL,
  rows        jsonb NOT NULL,
  notes       text,
  is_demo     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                    text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9-]{2,20}$'),
  slug                    text NOT NULL UNIQUE,
  name                    text NOT NULL,
  description             text,
  composition             text,
  care_instructions       text,
  category_id             uuid NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  size_guide_id           uuid REFERENCES size_guides (id) ON DELETE SET NULL,
  status                  text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  base_price_cents        integer NOT NULL CHECK (base_price_cents >= 0),
  compare_at_price_cents  integer CHECK (compare_at_price_cents IS NULL OR compare_at_price_cents > base_price_cents),
  -- dados de frete (Melhor Envio): peso em gramas, dimensões em cm
  weight_g                integer CHECK (weight_g IS NULL OR weight_g > 0),
  length_cm               integer CHECK (length_cm IS NULL OR length_cm > 0),
  width_cm                integer CHECK (width_cm IS NULL OR width_cm > 0),
  height_cm               integer CHECK (height_cm IS NULL OR height_cm > 0),
  seo_title               text,
  seo_description         text,
  published_at            timestamptz,
  is_demo                 boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX products_category_idx ON products (category_id);
CREATE INDEX products_status_idx ON products (status);

CREATE TABLE skus (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  color_id    uuid NOT NULL REFERENCES colors (id) ON DELETE RESTRICT,
  size_id     uuid NOT NULL REFERENCES sizes (id) ON DELETE RESTRICT,
  sku_code    text NOT NULL UNIQUE,
  barcode     text,
  price_cents integer CHECK (price_cents IS NULL OR price_cents >= 0),  -- NULL = preço do produto
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, color_id, size_id)
);
CREATE INDEX skus_color_idx ON skus (color_id);
CREATE INDEX skus_size_idx ON skus (size_id);

CREATE TABLE product_images (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  color_id    uuid REFERENCES colors (id) ON DELETE SET NULL,
  storage_key text NOT NULL UNIQUE,
  url         text NOT NULL,
  alt         text NOT NULL DEFAULT '',
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_images_product_idx ON product_images (product_id, sort_order);

CREATE TRIGGER categories_set_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER colors_set_updated_at BEFORE UPDATE ON colors FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER sizes_set_updated_at BEFORE UPDATE ON sizes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER size_guides_set_updated_at BEFORE UPDATE ON size_guides FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER skus_set_updated_at BEFORE UPDATE ON skus FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE IF EXISTS product_images;
DROP TABLE IF EXISTS skus;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS size_guides;
DROP TABLE IF EXISTS sizes;
DROP TABLE IF EXISTS colors;
DROP TABLE IF EXISTS categories;
