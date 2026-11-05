import { env } from "../../config/env";
import { pool, type Queryable } from "../../db/pool";
import { renderEmail, TEMPLATES, type Template } from "./templates";

export const emailReady = () => Boolean(env.EMAIL_API_KEY && env.EMAIL_FROM);

/** Grava o e-mail na fila (use o `client` da transação para só enviar se a operação for confirmada). */
export async function enqueueEmail(db: Queryable, to: string, template: Template, data: Record<string, unknown>) {
  await db.query(`INSERT INTO email_outbox (to_email, template, data) VALUES ($1,$2,$3)`, [to, template, JSON.stringify(data)]);
}

async function sendViaResend(to: string, m: { subject: string; html: string; text: string }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.EMAIL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject: m.subject, html: m.html, text: m.text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Provedor de e-mail respondeu ${res.status}`);
}

/** Envia a fila. Sem credenciais, não faz nada: as mensagens ficam pendentes e saem quando o provedor for configurado. */
export async function sendPendingEmails(limit = 25): Promise<{ sent: number; failed: number; skipped: boolean }> {
  if (!emailReady()) return { sent: 0, failed: 0, skipped: true };
  const client = await pool.connect();
  let sent = 0;
  let failed = 0;
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: string; to_email: string; template: string; data: Record<string, unknown>; attempts: number }>(
      `SELECT id, to_email::text AS to_email, template, data, attempts FROM email_outbox
        WHERE status = 'pending' AND next_attempt_at <= now() ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED`,
      [limit],
    );
    for (const r of rows) {
      try {
        if (!(TEMPLATES as readonly string[]).includes(r.template)) throw new Error("Modelo desconhecido");
        await sendViaResend(r.to_email, renderEmail(r.template as Template, r.data));
        await client.query(`UPDATE email_outbox SET status = 'sent', sent_at = now(), attempts = attempts + 1, last_error = NULL WHERE id = $1`, [r.id]);
        sent++;
      } catch (e) {
        const attempts = r.attempts + 1;
        await client.query(
          `UPDATE email_outbox SET attempts = $2, last_error = $3, status = $4, next_attempt_at = now() + make_interval(mins => $5::int) WHERE id = $1`,
          [r.id, attempts, (e as Error).message.slice(0, 300), attempts >= 5 ? "failed" : "pending", attempts * attempts],
        );
        failed++;
      }
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  return { sent, failed, skipped: false };
}
