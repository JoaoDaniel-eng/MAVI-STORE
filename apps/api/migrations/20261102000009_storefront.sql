-- Up Migration
CREATE TABLE home_sections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          text NOT NULL CHECK (kind IN ('hero','banner','featured_products','category_grid','text')),
  title         text,
  subtitle      text,
  body          text,
  cta_label     text,
  cta_url       text,
  image_key     text,
  image_url     text,
  product_ids   uuid[] NOT NULL DEFAULT '{}',
  category_ids  uuid[] NOT NULL DEFAULT '{}',
  sort_order    integer NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER home_sections_set_updated_at BEFORE UPDATE ON home_sections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE favorites (
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  product_id  uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);
CREATE INDEX favorites_product_idx ON favorites (product_id);

CREATE INDEX products_published_idx ON products (published_at DESC) WHERE status = 'active';

-- Down Migration
DROP INDEX IF EXISTS products_published_idx;
DROP TABLE IF EXISTS favorites;
DROP TABLE IF EXISTS home_sections;
