-- Up Migration
CREATE TABLE locations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code              text NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9-]+$'),
  name              text NOT NULL,
  shopping_name     text NOT NULL,
  store_number      text NOT NULL,
  city              text NOT NULL DEFAULT 'Teresópolis',
  state             char(2) NOT NULL DEFAULT 'RJ',
  address           text,            -- pendente: preencher no painel
  phone             text,
  whatsapp          text,
  opening_hours     jsonb,           -- pendente: preencher no painel
  pickup_enabled    boolean NOT NULL DEFAULT true,
  pickup_fee_cents  integer NOT NULL DEFAULT 0 CHECK (pickup_fee_cents >= 0),  -- 0 = retirada grátis
  can_ship_from     boolean NOT NULL DEFAULT true,   -- pode ser origem de entrega nacional
  is_active         boolean NOT NULL DEFAULT true,
  sort_order        integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER locations_set_updated_at BEFORE UPDATE ON locations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO locations (code, name, shopping_name, store_number, sort_order) VALUES
  ('alto',   'MAVI Shopping do Alto', 'Shopping do Alto', '29',  1),
  ('comary', 'MAVI Shopping Comary',  'Shopping Comary',  '120', 2);

-- Down Migration
DROP TABLE IF EXISTS locations;
