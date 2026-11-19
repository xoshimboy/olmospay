import { sql } from 'drizzle-orm';
import { getDatabase } from '../db.js';

export default async function healthHandler(_req, res) {
  try {
    const database = getDatabase();
    await database.execute(sql`SELECT 1`);
    return res.status(200).json({ ok: true, api: 'ready', storage: 'neon' });
  } catch (error) {
    console.error('[Health check error]', error);
    return res.status(503).json({ ok: false, api: 'unavailable', storage: 'unavailable' });
  }
}
