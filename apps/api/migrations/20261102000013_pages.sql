-- Up Migration
CREATE TABLE pages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title            text NOT NULL,
  body             text NOT NULL,
  seo_description  text,
  sort_order       integer NOT NULL DEFAULT 0,
  is_published     boolean NOT NULL DEFAULT false,
  show_in_footer   boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER pages_set_updated_at BEFORE UPDATE ON pages FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE IF EXISTS pages;
