/**
 * Eyni telefonla birdən çox müştəriyə icazə verir.
 * UNIQUE constraint + indeksləri silir.
 * İstifadə: npm run db:migrate:allow-duplicate-phone
 */
import pool from '../config/database.js';

const CONSTRAINT_NAMES = [
  'customers_company_id_phone_normalized_key',
  'customers_company_id_phone_key',
];

const INDEX_NAMES = [
  'idx_customers_phone_unique',
  'idx_customers_company_phone',
  'idx_customers_company_phone_norm',
];

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const name of CONSTRAINT_NAMES) {
      await client.query(`ALTER TABLE customers DROP CONSTRAINT IF EXISTS ${name}`);
    }

    const extra = await client.query(`
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'customers'::regclass
        AND contype = 'u'
        AND (
          pg_get_constraintdef(oid) ILIKE '%phone_normalized%'
          OR pg_get_constraintdef(oid) ILIKE '%(company_id, phone)%'
        )
    `);

    for (const row of extra.rows) {
      await client.query(
        `ALTER TABLE customers DROP CONSTRAINT IF EXISTS "${row.conname}"`
      );
    }

    for (const name of INDEX_NAMES) {
      await client.query(`DROP INDEX IF EXISTS ${name}`);
    }

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
