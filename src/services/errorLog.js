import { getPool } from '../db/pool.js';
// Guarda um erro (da tela do cliente ou do servidor) na tabela client_errors. Nunca lança erro: registrar não pode quebrar o pedido.
export function saveError({ kind = 'tela', message, source = null, line = null, col = null, stack = null, page = null, build = null, userAgent = null, ip = null }) {
  try {
    const db = getPool();
    db.query('INSERT INTO client_errors(kind,message,source,line,col,stack,page,build,user_agent,ip_address) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [kind, String(message).slice(0, 500), source, line, col, stack ? String(stack).slice(0, 2000) : null, page, build, userAgent, ip]).catch(err => console.error('Falha ao salvar erro:', err.message));
    if (Math.random() < 0.02)
      db.query("DELETE FROM client_errors WHERE created_at < NOW() - INTERVAL '30 days'").catch(() => { });
  }
  catch (err) {
    console.error('Falha ao salvar erro:', err.message);
  }
}
