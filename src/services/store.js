import { getPool } from '../db/pool.js';
export { money, getLocalParts, isOpenAt } from './time.js';
export async function getSettings() {
  const { rows } = await getPool().query('SELECT key,value FROM settings');
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}
