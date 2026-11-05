import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { env } from "../config/env";

const UP = "-- Up Migration";
const DOWN = "-- Down Migration";
const LOCK_ID = 727001;

type Migration = { name: string; up: string; down: string };

async function loadMigrations(dir: string): Promise<Migration[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  return Promise.all(
    files.map(async (file) => {
      const sql = await readFile(path.join(dir, file), "utf8");
      const i = sql.indexOf(UP);
      const j = sql.indexOf(DOWN);
      if (i === -1 || j === -1 || j < i) throw new Error(`${file}: faltam os marcadores "${UP}" / "${DOWN}"`);
      return {
        name: file.replace(/\.sql$/, ""),
        up: sql.slice(i + UP.length, j),
        down: sql.slice(j + DOWN.length),
      };
    }),
  );
}

async function main() {
  const [command = "up", arg] = process.argv.slice(2);
  const dir = path.resolve(process.cwd(), "migrations");
  const migrations = await loadMigrations(dir);

  const client = new pg.Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_ID]);
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const { rows } = await client.query<{ name: string }>("SELECT name FROM schema_migrations ORDER BY name");
    const applied = new Set(rows.map((r) => r.name));

    if (command === "status") {
      for (const m of migrations) console.log(`${applied.has(m.name) ? "aplicada " : "pendente "} ${m.name}`);
      return;
    }

    if (command === "up") {
      const todo = migrations.filter((m) => !applied.has(m.name));
      for (const m of todo) {
        await client.query("BEGIN");
        try {
          await client.query(m.up);
          await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [m.name]);
          await client.query("COMMIT");
          console.log(`aplicada: ${m.name}`);
        } catch (err) {
          await client.query("ROLLBACK");
          throw new Error(`Falha em ${m.name}: ${(err as Error).message}`);
        }
      }
      if (todo.length === 0) console.log("Nada a aplicar.");
      return;
    }

    if (command === "down") {
      const count = arg === "all" ? Infinity : Number(arg ?? 1);
      if (arg !== "all" && !Number.isInteger(count)) throw new Error("Uso: migrate down [n|all]");
      const todo = migrations.filter((m) => applied.has(m.name)).reverse().slice(0, count);
      for (const m of todo) {
        await client.query("BEGIN");
        try {
          await client.query(m.down);
          await client.query("DELETE FROM schema_migrations WHERE name = $1", [m.name]);
          await client.query("COMMIT");
          console.log(`revertida: ${m.name}`);
        } catch (err) {
          await client.query("ROLLBACK");
          throw new Error(`Falha ao reverter ${m.name}: ${(err as Error).message}`);
        }
      }
      return;
    }

    throw new Error(`Comando desconhecido: ${command}. Use up | down [n|all] | status`);
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]).catch(() => undefined);
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
