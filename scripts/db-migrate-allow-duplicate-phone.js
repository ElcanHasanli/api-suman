/**
 * Eyni telefonla birdən çox müştəriyə icazə verir — UNIQUE indeksləri silir.
 * İstifadə: npm run db:migrate:allow-duplicate-phone
 */
import pool from '../config/database.js';

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query('DROP INDEX IF EXISTS idx_customers_phone_unique');
    await client.query('DROP INDEX IF EXISTS idx_customers_company_phone');
    await client.query('DROP INDEX IF EXISTS idx_customers_company_phone_norm');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_customers_phone_norm
      ON customers (company_id, phone_normalized);
    `);

    await client.query('COMMIT');
    console.log('✅ Müştəri telefonu UNIQUE məhdudiyyəti silindi');
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
