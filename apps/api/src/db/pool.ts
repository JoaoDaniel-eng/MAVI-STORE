import pg from "pg";
import { env } from "../config/env";

export type Queryable = pg.Pool | pg.PoolClient;

export const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 });

/** Executa `fn` em uma transação; faz rollback em qualquer erro. */
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
