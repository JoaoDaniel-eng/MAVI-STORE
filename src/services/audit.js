import { getPool } from '../db/pool.js';
// Auditoria compartilhada pelo painel da loja (actor 'admin') e pelo painel do desenvolvedor (actor 'dev').
// Registra login e toda mutação concluída com sucesso, sem guardar dados pessoais do corpo da requisição.
export const ipOf = req => String(req.ip || 'unknown').slice(0, 120);
export function logLogin({ actor, adminId = null, email, ip }) {
  return getPool().query("INSERT INTO admin_audit_logs(admin_id,admin_email,action,route,status_code,ip_address,actor) VALUES($1,$2,'LOGIN','/login',200,$3,$4)", [adminId, email, ip, actor]);
}
// Middleware: precisa rodar depois da autenticação (usa req.admin ou req.dev).
export function auditMutations(actor) {
  return (req, res, next) => {
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method))
      return next();
    res.on('finish', () => {
      if (res.statusCode < 200 || res.statusCode >= 400)
        return;
      const who = (actor === 'dev' ? req.dev : req.admin) || {};
      getPool().query('INSERT INTO admin_audit_logs(admin_id,admin_email,action,route,status_code,ip_address,actor) VALUES($1,$2,$3,$4,$5,$6,$7)', [actor === 'admin' ? who.adminId || null : null, String(who.email || actor), req.method, req.path, res.statusCode, String(req.ip || '').slice(0, 120), actor]).catch(err => console.error('Falha ao registrar auditoria:', err.message));
    });
    next();
  };
}
