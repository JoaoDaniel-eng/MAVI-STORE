import { pool, withTransaction } from "../db/pool";
import type { PoolClient } from "pg";

// Remove tudo que está marcado como demo. O que não puder ser apagado (ex.: já tem pedido ou movimento de estoque)
// é arquivado/desativado e listado no final. Opção: --keep-attributes mantém cores e tamanhos como cadastros reais.
let n = 0;
const kept: string[] = [];
const removed: Record<string, number> = {};

async function tryDelete(c: PoolClient, label: string, name: string, sql: string, params: unknown[], fallback?: string) {
  const sp = `sp${++n}`;
  await c.query(`SAVEPOINT ${sp}`);
  try {
    const r = await c.query(sql, params);
    await c.query(`RELEASE SAVEPOINT ${sp}`);
    removed[label] = (removed[label] ?? 0) + (r.rowCount ?? 0);
  } catch (e) {
    await c.query(`ROLLBACK TO SAVEPOINT ${sp}`);
    if (!["23503", "P0001"].includes((e as { code?: string }).code ?? "")) throw e; // FK em uso ou trigger de imutabilidade
    if (fallback) await c.query(fallback, params);
    kept.push(`${label}: ${name}${fallback ? " (desativado/arquivado)" : ""} tem registros ligados e foi mantido`);
  }
}

async function main() {
  const keepAttrs = process.argv.includes("--keep-attributes");
  await withTransaction(async (c) => {
    for (const p of (await c.query<{ id: string; name: string }>(`SELECT id, name FROM products WHERE is_demo`)).rows) {
      const sp = `sp${++n}`;
      await c.query(`SAVEPOINT ${sp}`);
      try {
        await c.query(`DELETE FROM stock_levels WHERE sku_id IN (SELECT id FROM skus WHERE product_id = $1)`, [p.id]);
        await c.query(`DELETE FROM products WHERE id = $1`, [p.id]);
        await c.query(`RELEASE SAVEPOINT ${sp}`);
        removed["produtos"] = (removed["produtos"] ?? 0) + 1;
      } catch (e) {
        await c.query(`ROLLBACK TO SAVEPOINT ${sp}`);
        if (!["23503", "P0001"].includes((e as { code?: string }).code ?? "")) throw e;
        await c.query(`UPDATE products SET status = 'archived' WHERE id = $1`, [p.id]);
        kept.push(`produto: ${p.name} tem pedidos ou movimentos de estoque e foi apenas arquivado`);
      }
    }
    await tryDelete(c, "seções da home", "demo", `DELETE FROM home_sections WHERE is_demo`, []);
    await tryDelete(c, "páginas", "demo", `DELETE FROM pages WHERE is_demo`, []);
    for (const k of (await c.query<{ id: string; code: string }>(`SELECT id, code::text AS code FROM coupons WHERE is_demo`)).rows) {
      await tryDelete(c, "cupons", k.code, `DELETE FROM coupons WHERE id = $1`, [k.id], `UPDATE coupons SET is_active = false WHERE id = $1`);
    }
    await tryDelete(c, "guias de medidas", "demo", `DELETE FROM size_guides WHERE is_demo`, []);
    for (const k of (await c.query<{ id: string; name: string }>(`SELECT id, name FROM categories WHERE is_demo ORDER BY (parent_id IS NULL)`)).rows) {
      await tryDelete(c, "categorias", k.name, `DELETE FROM categories WHERE id = $1`, [k.id]);
    }
    if (keepAttrs) {
      await c.query(`UPDATE colors SET is_demo = false WHERE is_demo`);
      await c.query(`UPDATE sizes SET is_demo = false WHERE is_demo`);
    } else {
      for (const k of (await c.query<{ id: string; name: string }>(`SELECT id, name FROM colors WHERE is_demo`)).rows) await tryDelete(c, "cores", k.name, `DELETE FROM colors WHERE id = $1`, [k.id]);
      for (const k of (await c.query<{ id: string; label: string }>(`SELECT id, label FROM sizes WHERE is_demo`)).rows) await tryDelete(c, "tamanhos", k.label, `DELETE FROM sizes WHERE id = $1`, [k.id]);
    }
  });
  console.log("Removidos:", Object.entries(removed).map(([k, v]) => `${k}: ${v}`).join(", ") || "nada");
  if (kept.length) console.log("Mantidos:\n- " + kept.join("\n- "));
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => pool.end());
