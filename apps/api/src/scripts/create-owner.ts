import { emailSchema, passwordSchema } from "@mavi/shared";
import { pool, withTransaction } from "../db/pool";
import { hashPassword } from "../lib/passwords";
import { writeAudit } from "../modules/audit/audit.service";

// Uso: OWNER_PASSWORD='...' npm run create-owner -w apps/api -- email@loja.com "Nome Completo"
async function main() {
  const [emailArg, nameArg] = process.argv.slice(2);
  const password = process.env["OWNER_PASSWORD"];
  if (!emailArg || !nameArg || !password) {
    throw new Error('Uso: OWNER_PASSWORD=... create-owner <email> "<nome>"');
  }
  const email = emailSchema.parse(emailArg);
  const pw = passwordSchema.parse(password);
  const hash = await hashPassword(pw);

  await withTransaction(async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, name, role, terms_accepted_at)
       VALUES ($1,$2,$3,'owner', now()) RETURNING id`,
      [email, hash, nameArg.trim()],
    );
    await writeAudit(c, { actorId: null, actorRole: null }, {
      action: "user.create_owner",
      entity: "user",
      entityId: rows[0]!.id,
    });
  });
  console.log(`Proprietária criada: ${email}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
