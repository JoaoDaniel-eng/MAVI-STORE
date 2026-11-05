import { env } from "../config/env";
import { pool, withTransaction } from "../db/pool";

// Dados DEMONSTRATIVOS para ver a loja funcionando. Tudo fica marcado com is_demo = true e rotulado "(demo)".
// Uso: npm run seed:demo -w apps/api -- --yes     |     limpeza: npm run clean:demo -w apps/api
async function main() {
  if (!process.argv.includes("--yes")) throw new Error("Confirme com --yes. Isto cria categorias, produtos, estoque, cupom e uma seção de home de demonstração.");
  if (env.NODE_ENV === "production" && process.env["ALLOW_DEMO_IN_PRODUCTION"] !== "true") {
    throw new Error("Bloqueado em produção. Para forçar (não recomendado), defina ALLOW_DEMO_IN_PRODUCTION=true.");
  }

  await withTransaction(async (c) => {
    const locs = (await c.query<{ id: string; code: string }>(`SELECT id, code FROM locations WHERE is_active ORDER BY sort_order`)).rows;
    if (!locs.length) throw new Error("Nenhuma unidade cadastrada. Rode as migrations primeiro.");

    const upsert = async (table: string, key: string, keyVal: string, cols: Record<string, unknown>) => {
      const names = [key, ...Object.keys(cols), "is_demo"];
      const vals = [keyVal, ...Object.values(cols), true];
      await c.query(`INSERT INTO ${table} (${names.join(",")}) VALUES (${vals.map((_, i) => `$${i + 1}`).join(",")}) ON CONFLICT (${key}) DO NOTHING`, vals);
      return (await c.query<{ id: string }>(`SELECT id FROM ${table} WHERE ${key} = $1`, [keyVal])).rows[0]!.id;
    };

    const cat = {
      vestidos: await upsert("categories", "slug", "vestidos-demo", { name: "Vestidos (demo)", sort_order: 1 }),
      blusas: await upsert("categories", "slug", "blusas-demo", { name: "Blusas (demo)", sort_order: 2 }),
      calcas: await upsert("categories", "slug", "calcas-demo", { name: "Calças (demo)", sort_order: 3 }),
    };
    const colors = [
      await upsert("colors", "code", "PRETO", { name: "Preto (demo)", hex: "#1F1A21" }),
      await upsert("colors", "code", "OFFWHITE", { name: "Off-white (demo)", hex: "#EFE9E4" }),
      await upsert("colors", "code", "VINHO", { name: "Vinho (demo)", hex: "#6B2737" }),
    ];
    const sizes = [await upsert("sizes", "label", "P", { sort_order: 1 }), await upsert("sizes", "label", "M", { sort_order: 2 }), await upsert("sizes", "label", "G", { sort_order: 3 })];
    const sizeLabels = ["P", "M", "G"];
    const colorCodes = ["PRETO", "OFFWHITE", "VINHO"];

    // Guia com células vazias ("—"): nenhuma medida inventada.
    const guide = await upsert("size_guides", "name", "Guia demonstrativo (demo)", {
      columns: JSON.stringify(["Tamanho", "Medida A (cm)", "Medida B (cm)"]),
      rows: JSON.stringify(sizeLabels.map((s) => [s, "—", "—"])),
      notes: "Guia ilustrativo. Preencha com as medidas reais das suas peças.",
    });

    const products = [
      { code: "DEMO-VES", name: "[DEMO] Vestido exemplo", slug: "demo-vestido-exemplo", cat: cat.vestidos, price: 19900, weight: 450, dims: [35, 25, 6] },
      { code: "DEMO-BLU", name: "[DEMO] Blusa exemplo", slug: "demo-blusa-exemplo", cat: cat.blusas, price: 12900, weight: 250, dims: [30, 22, 4] },
      { code: "DEMO-CAL", name: "[DEMO] Calça exemplo", slug: "demo-calca-exemplo", cat: cat.calcas, price: 15900, weight: 500, dims: [35, 28, 6] },
    ];
    const productIds: string[] = [];
    for (const p of products) {
      const id = await upsert("products", "code", p.code, {
        slug: p.slug, name: p.name, description: "Produto demonstrativo: não existe para venda. Apague com o script de limpeza.", category_id: p.cat, size_guide_id: guide,
        status: "active", base_price_cents: p.price, weight_g: p.weight, length_cm: p.dims[0], width_cm: p.dims[1], height_cm: p.dims[2], published_at: new Date(),
      });
      productIds.push(id);
      for (let ci = 0; ci < colors.length; ci++) {
        for (let si = 0; si < sizes.length; si++) {
          const code = `${p.code}-${colorCodes[ci]}-${sizeLabels[si]}`;
          await c.query(`INSERT INTO skus (product_id, color_id, size_id, sku_code) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [id, colors[ci], sizes[si], code]);
          const sku = (await c.query<{ id: string }>(`SELECT id FROM skus WHERE sku_code = $1`, [code])).rows[0]!.id;
          for (const l of locs) {
            // Estoque direto (sem movimentos) para poder apagar depois; um SKU zerado por produto para mostrar "esgotado".
            const qty = ci === 2 && si === 2 ? 0 : l.code === locs[0]!.code ? 5 : 3;
            await c.query(`INSERT INTO stock_levels (sku_id, location_id, on_hand) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [sku, l.id, qty]);
          }
        }
      }
    }

    await c.query(`INSERT INTO coupons (code, type, value, description, is_demo) VALUES ('DEMO10','percent',10,'Cupom de demonstração', true) ON CONFLICT DO NOTHING`);
    const hasHome = (await c.query(`SELECT 1 FROM home_sections WHERE is_demo LIMIT 1`)).rowCount;
    if (!hasHome) {
      await c.query(`INSERT INTO home_sections (kind, title, product_ids, sort_order, is_demo) VALUES ('featured_products','Novidades (demo)',$1,0,true)`, [productIds]);
    }
  });
  console.log("Dados de demonstração criados (sem fotos). Cupom: DEMO10. Para remover: npm run clean:demo -w apps/api");
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => pool.end());
