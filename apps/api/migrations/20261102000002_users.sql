-- Up Migration
CREATE TABLE users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email              citext NOT NULL UNIQUE,
  password_hash      text NOT NULL,
  name               text NOT NULL,
  phone              text,
  role               text NOT NULL DEFAULT 'customer'
                     CHECK (role IN ('owner', 'manager', 'staff', 'customer')),
  is_active          boolean NOT NULL DEFAULT true,
  email_verified_at  timestamptz,
  terms_accepted_at  timestamptz,
  marketing_opt_in   boolean NOT NULL DEFAULT false,
  last_login_at      timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX users_staff_idx ON users (role) WHERE role <> 'customer';

CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE IF EXISTS users;
