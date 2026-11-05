-- Up Migration
ALTER TABLE orders
  ADD COLUMN tracking_code text,
  ADD COLUMN cancel_reason text,        -- preenchido só em cancelamento manual
  ADD COLUMN cancelled_at timestamptz,
  ADD COLUMN delivered_at timestamptz;

CREATE TABLE order_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id    uuid NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  status      text NOT NULL,
  note        text,
  actor_id    uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_events_order_idx ON order_events (order_id, id);

-- Fila de e-mails: gravada junto com a operação; enviada por um job quando o provedor estiver configurado.
CREATE TABLE email_outbox (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email         citext NOT NULL,
  template         text NOT NULL,
  data             jsonb NOT NULL DEFAULT '{}',
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  attempts         integer NOT NULL DEFAULT 0,
  last_error       text,
  next_attempt_at  timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  sent_at          timestamptz
);
CREATE INDEX email_outbox_due_idx ON email_outbox (next_attempt_at) WHERE status = 'pending';

CREATE TABLE auth_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('password_reset','email_verification')),
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_tokens_user_idx ON auth_tokens (user_id, kind);

CREATE TABLE reviews (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  rating           integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title            text,
  body             text NOT NULL,
  author_name      text NOT NULL,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  moderation_note  text,
  moderated_by     uuid,
  moderated_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);
CREATE INDEX reviews_product_idx ON reviews (product_id) WHERE status = 'approved';
CREATE INDEX reviews_status_idx ON reviews (status, created_at DESC);

-- Down Migration
DROP TABLE IF EXISTS reviews;
DROP TABLE IF EXISTS auth_tokens;
DROP TABLE IF EXISTS email_outbox;
DROP TABLE IF EXISTS order_events;
ALTER TABLE orders DROP COLUMN IF EXISTS delivered_at, DROP COLUMN IF EXISTS cancelled_at,
  DROP COLUMN IF EXISTS cancel_reason, DROP COLUMN IF EXISTS tracking_code;
