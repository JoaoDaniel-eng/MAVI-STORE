import { pool } from "../db/pool";
import { anonymizeOldOrders } from "../modules/privacy/privacy.service";

// Rotina diária: remove lixo técnico e aplica o prazo de retenção de dados pessoais.
async function main() {
  const q = async (sql: string) => (await pool.query(sql)).rowCount ?? 0;
  const tokens = await q(`DELETE FROM refresh_tokens WHERE COALESCE(revoked_at, expires_at) < now() - interval '30 days'`);
  const authTokens = await q(`DELETE FROM auth_tokens WHERE COALESCE(used_at, expires_at) < now() - interval '30 days'`);
  const mails = await q(`DELETE FROM email_outbox WHERE status = 'sent' AND sent_at < now() - interval '90 days'`);
  const orders = await anonymizeOldOrders();
  console.log(`Manutenção: ${tokens} sessões antigas, ${authTokens} links usados/vencidos, ${mails} e-mails enviados removidos; ${orders} pedido(s) anonimizado(s).`);
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => pool.end());
