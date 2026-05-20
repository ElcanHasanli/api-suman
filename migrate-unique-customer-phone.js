/**
 * Müştəri telefonlarını normallaşdırır və UNIQUE constraint əlavə edir.
 * İstifadə: npm run db:migrate:phone
 */
import pool from './config/database.js';
import { normalizePhone } from './utils/phone.js';

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows } = await client.query('SELECT id, phone FROM customers ORDER BY id');

    const seen = new Map();
    for (const row of rows) {
      const normalized = normalizePhone(row.phone);
      if (!normalized) continue;

      if (seen.has(normalized)) {
        throw new Error(
          `Təkrarlanan telefon: ${normalized} (müştəri id ${row.id} və ${seen.get(normalized)})`
        );
      }
      seen.set(normalized, row.id);

      await client.query('UPDATE customers SET phone = $1 WHERE id = $2', [
        normalized,
        row.id,
      ]);
    }

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_phone_unique ON customers (phone);
    `);

    await client.query('COMMIT');
    console.log('✅ customers.phone UNIQUE index yaradıldı, mövcud nömrələr normallaşdırıldı');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    process.exit(0);
  }
}

migrate();
