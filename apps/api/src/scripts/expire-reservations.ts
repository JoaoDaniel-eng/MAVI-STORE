import { pool, withTransaction } from "../db/pool";
import { sendPendingEmails } from "../modules/email/outbox";
import { cancelExpiredOrders } from "../modules/checkout/orders.service";
import { expireDue } from "../modules/stock/reservations.service";

// Rede de segurança: a reserva também expira sozinha quando alguém tenta reservar o mesmo SKU.
async function main() {
  let total = 0;
  for (;;) {
    const n = await withTransaction((c) => expireDue(c));
    total += n;
    if (n < 500) break;
  }
  const cancelled = await withTransaction((c) => cancelExpiredOrders(c));
  const mail = await sendPendingEmails();
  console.log(`Reservas expiradas: ${total}; pedidos sem pagamento cancelados: ${cancelled}; e-mails: ${mail.skipped ? "provedor pendente" : `${mail.sent} enviados, ${mail.failed} com falha`}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
