-- Up Migration
CREATE TABLE settings (
  key          text PRIMARY KEY CHECK (key ~ '^[a-z0-9_.]+$'),
  value        jsonb NOT NULL,
  description  text,
  updated_by   uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER settings_set_updated_at BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Valores iniciais de configuração (não são dados de loja). Ajustar no painel.
INSERT INTO settings (key, value, description) VALUES
  ('store.name', '"MAVI"', 'Nome da loja.'),
  ('shipping.origin_rule',
   '{"strategy":"default_with_fallback","default_location_code":"alto"}',
   'Regra da unidade de saída da entrega nacional. Padrão inicial: CONFIRMAR com a loja.'),
  ('stock.low_stock_threshold', '{"default":3}',
   'Alerta de baixo estoque por SKU. Padrão inicial: CONFIRMAR com a loja.'),
  ('stock.reservation_ttl_minutes', '15',
   'Tempo da reserva de estoque durante o checkout. Padrão inicial: CONFIRMAR.');

-- Down Migration
DROP TABLE IF EXISTS settings;
