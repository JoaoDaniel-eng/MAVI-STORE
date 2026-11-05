import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveRange, toCsv } from "../src/lib/csv";
import { slugify } from "../src/lib/slug";

test("CSV: separador, vírgula decimal, aspas e proteção contra fórmulas", () => {
  const csv = toCsv(["A", "B"], [["x;y", 12.5], ['aspas "x"', "=1+1"], [null, "ok"], ["-cmd", "@sum"], ["linha\nquebra", 3]]);
  assert.ok(csv.startsWith("\uFEFFA;B\r\n"));
  assert.ok(csv.includes('"x;y";12,5'));
  assert.ok(csv.includes('"aspas ""x"""'));
  assert.ok(csv.includes("'=1+1"));
  assert.ok(csv.includes("'-cmd;'@sum"));
  assert.ok(csv.includes('"linha\nquebra"'));
});

test("Período dos relatórios", () => {
  assert.throws(() => resolveRange("2026-12-31", "2026-01-01"), /anterior/);
  assert.throws(() => resolveRange("2024-01-01", "2026-01-01"), /1 ano/);
  assert.deepEqual(resolveRange("2026-01-01", "2026-01-31"), { from: "2026-01-01", to: "2026-01-31" });
});

test("slugify", () => {
  assert.equal(slugify("Vestido Midi — Linho & Algodão!"), "vestido-midi-linho-algodao");
  assert.equal(slugify("  Calça  Jeans  "), "calca-jeans");
});
