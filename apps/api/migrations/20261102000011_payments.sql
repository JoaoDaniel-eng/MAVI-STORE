-- Up Migration
ALTER TABLE orders ADD COLUMN requires_refund boolean NOT NULL DEFAULT false; -- pago depois de perder a reserva e sem estoque

CREATE TABLE payments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id           uuid NOT NULL REFERENCES orders (id) ON DELETE RESTRICT,
  gateway            text NOT NULL CHECK (gateway IN ('mercadopago','asaas')),
  method             text NOT NULL CHECK (method IN ('pix','card')),
  status             text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','refunded','cancelled')),
  amount_cents       integer NOT NULL CHECK (amount_cents >= 0),
  gateway_payment_id text,
  gateway_reference  text,            -- ex.: id da preferência (checkout hospedado)
  payload            jsonb,           -- código Pix copia e cola / link de pagamento; nunca dados de cartão
  paid_at            timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_order_idx ON payments (order_id, created_at DESC);
CREATE UNIQUE INDEX payments_gateway_payment_uidx ON payments (gateway, gateway_payment_id) WHERE gateway_payment_id IS NOT NULL;
CREATE UNIQUE INDEX payments_one_pending_uidx ON payments (order_id) WHERE status = 'pending'; -- uma cobrança aberta por pedido
CREATE TRIGGER payments_set_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Cada notificação do gateway é processada uma única vez (idempotência).
CREATE TABLE payment_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  gateway     text NOT NULL,
  event_key   text NOT NULL,
  outcome     text,
  payload     jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gateway, event_key)
);

-- Down Migration
DROP TABLE IF EXISTS payment_events;
DROP TABLE IF EXISTS payments;
ALTER TABLE orders DROP COLUMN IF EXISTS requires_refund;
