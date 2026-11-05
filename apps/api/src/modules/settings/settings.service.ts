import { SETTING_SCHEMAS, type SettingKey } from "@mavi/shared";
import type { z } from "zod";
import { pool, withTransaction, type Queryable } from "../../db/pool";
import { AppError } from "../../middleware/errors";
import { writeAudit, type AuditCtx } from "../audit/audit.service";

export async function getSetting<K extends SettingKey>(
  db: Queryable,
  key: K,
): Promise<z.infer<(typeof SETTING_SCHEMAS)[K]>> {
  const { rows } = await db.query<{ value: unknown }>(`SELECT value FROM settings WHERE key = $1`, [key]);
  if (!rows[0]) throw new AppError(500, "setting_missing", `Configuração ausente: ${key}`);
  return SETTING_SCHEMAS[key].parse(rows[0].value) as z.infer<(typeof SETTING_SCHEMAS)[K]>;
}

export async function listSettings() {
  const { rows } = await pool.query(
    `SELECT key, value, description, updated_at FROM settings ORDER BY key`,
  );
  return rows.map((r) => ({
    key: r.key as string,
    value: r.value as unknown,
    description: r.description as string | null,
    updatedAt: (r.updated_at as Date).toISOString(),
  }));
}

export async function updateSetting(key: SettingKey, rawValue: unknown, actorId: string, ctx: AuditCtx) {
  const value = SETTING_SCHEMAS[key].parse(rawValue);
  return withTransaction(async (c) => {
    if (key === "shipping.origin_rule") {
      const code = (value as { default_location_code: string }).default_location_code;
      const loc = await c.query(`SELECT 1 FROM locations WHERE code = $1 AND is_active AND can_ship_from`, [code]);
      if (!loc.rowCount) throw new AppError(400, "invalid_location", "Unidade inexistente ou sem permissão de envio.");
    }
    const before = (await c.query(`SELECT value FROM settings WHERE key = $1 FOR UPDATE`, [key])).rows[0];
    if (!before) throw new AppError(404, "not_found", "Configuração não encontrada.");
    await c.query(`UPDATE settings SET value = $2, updated_by = $3 WHERE key = $1`, [key, JSON.stringify(value), actorId]);
    await writeAudit(c, ctx, {
      action: "setting.update", entity: "setting", entityId: key, before: before["value"], after: value,
    });
    return { key, value };
  });
}
