-- Up Migration
ALTER TABLE users ADD COLUMN deleted_at timestamptz; -- conta anonimizada a pedido da titular (LGPD)

ALTER TABLE home_sections ADD COLUMN is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE pages ADD COLUMN is_demo boolean NOT NULL DEFAULT false;

-- Down Migration
ALTER TABLE pages DROP COLUMN IF EXISTS is_demo;
ALTER TABLE home_sections DROP COLUMN IF EXISTS is_demo;
ALTER TABLE users DROP COLUMN IF EXISTS deleted_at;
