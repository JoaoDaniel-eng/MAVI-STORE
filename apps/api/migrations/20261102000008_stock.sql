-- Up Migration
CREATE TABLE stock_levels (
  sku_id               uuid NOT NULL REFERENCES skus (id) ON DELETE RESTRICT,
  location_id          uuid NOT NULL REFERENCES locations (id) ON DELETE RESTRICT,
  on_hand              integer NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
  reserved             integer NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  low_stock_threshold  integer CHECK (low_stock_threshold IS NULL OR low_stock_threshold >= 0),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sku_id, location_id),
  CHECK (reserved <= on_hand)   -- rede de segurança: nunca reservar/vender além do saldo
);
CREATE INDEX stock_levels_location_idx ON stock_levels (location_id);
CREATE TRIGGER stock_levels_set_updated_at BEFORE UPDATE ON stock_levels
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Histórico imutável de movimentos (delta com sinal; saldo resultante guardado).
CREATE TABLE stock_movements (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sku_id          uuid NOT NULL REFERENCES skus (id) ON DELETE RESTRICT,
  location_id     uuid NOT NULL REFERENCES locations (id) ON DELETE RESTRICT,
  type            text NOT NULL CHECK (type IN ('entry','exit','adjustment','transfer_in','transfer_out','sale')),
  quantity_delta  integer NOT NULL CHECK (quantity_delta <> 0),
  on_hand_after   integer NOT NULL CHECK (on_hand_after >= 0),
  reason          text,
  transfer_id     uuid,
  reference_type  text,
  reference_id    text,
  actor_id        uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_movements_sku_idx ON stock_movements (sku_id, created_at DESC);
CREATE INDEX stock_movements_location_idx ON stock_movements (location_id, created_at DESC);
CREATE INDEX stock_movements_created_idx ON stock_movements (created_at DESC);

CREATE FUNCTION stock_movements_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'stock_movements é imutável';
END $$;
CREATE TRIGGER stock_movements_no_change BEFORE UPDATE OR DELETE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION stock_movements_immutable();

-- Reservas durante o checkout. Várias linhas compartilham o mesmo checkout_ref.
CREATE TABLE stock_reservations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_ref   uuid NOT NULL,
  sku_id         uuid NOT NULL REFERENCES skus (id) ON DELETE RESTRICT,
  location_id    uuid NOT NULL REFERENCES locations (id) ON DELETE RESTRICT,
  quantity       integer NOT NULL CHECK (quantity > 0),
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active','committed','released','expired')),
  expires_at     timestamptz NOT NULL,
  reference_type text,
  reference_id   text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  resolved_at    timestamptz
);
CREATE INDEX stock_reservations_ref_idx ON stock_reservations (checkout_ref);
CREATE INDEX stock_reservations_due_idx ON stock_reservations (expires_at) WHERE status = 'active';
CREATE INDEX stock_reservations_sku_idx ON stock_reservations (sku_id, location_id) WHERE status = 'active';

-- Down Migration
DROP TABLE IF EXISTS stock_reservations;
DROP TABLE IF EXISTS stock_movements;
DROP FUNCTION IF EXISTS stock_movements_immutable();
DROP TABLE IF EXISTS stock_levels;
