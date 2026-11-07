import jwt from 'jsonwebtoken';
import { getPool } from '../db/pool.js';
import { versionOf, tokenVersion } from '../services/sessionVersion.js';
// Confere assinatura, tipo do token e, em seguida, se a conta ainda existe e se a senha não mudou depois do login.
// Tokens de cliente usam o mesmo JWT_SECRET, então a conferência do tipo impede que uma conta de cliente entre nos painéis.
function guard({ type, idField, table, reqKey, expiredMessage }) {
  return async (req, res, next) => {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token)
      return res.status(401).json({ error: 'Faça login para continuar.' });
    let payload;
    try {
      if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
        throw new Error('JWT_SECRET inválido');
      payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
      if (payload.type !== type || !payload[idField])
        throw new Error('Tipo de token incorreto');
    }
    catch {
      return res.status(401).json({ error: 'Sessão inválida ou expirada. Entre novamente.' });
    }
    try {
      const { rows } = await getPool().query(`SELECT password_changed_at FROM ${table} WHERE id=$1`, [payload[idField]]);
      if (!rows.length || versionOf(rows[0].password_changed_at) !== tokenVersion(payload))
        return res.status(401).json({ error: expiredMessage });
      req[reqKey] = payload;
      next();
    }
    catch (e) {
      next(e);
    }
  };
}
export const requireAdmin = guard({ type: 'admin', idField: 'adminId', table: 'admins', reqKey: 'admin', expiredMessage: 'Sua senha foi alterada ou a conta não existe mais. Entre novamente.' });
// Painel do desenvolvedor: token próprio (type 'developer').
export const requireDev = guard({ type: 'developer', idField: 'devId', table: 'developers', reqKey: 'dev', expiredMessage: 'Sua senha foi alterada ou a conta não existe mais. Entre novamente.' });

// Cliente logado, se houver: devolve o id da conta ou null (token ausente, inválido, expirado ou de outro tipo).
// Usado onde o login é opcional (fazer pedido como visitante ou conta, validar cupom).
export function optionalCustomerId(req) {
  try {
    const raw = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const p = jwt.verify(raw, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    return p.type === 'customer' ? Number(p.sub) : null;
  }
  catch {
    return null;
  }
}
