/**
 * customer_inactivity_alerts.last_order_at (dəqiqə dəqiqliyi)
 * npm run db:migrate:customer-inactivity-at
 */
import pool from '../config/database.js';

async function migrate() {
  try {
    await pool.query(`
      ALTER TABLE customer_inactivity_alerts
      ADD COLUMN IF NOT EXISTS last_order_at TIMESTAMPTZ;
    `);

    await pool.query(`
      UPDATE customer_inactivity_alerts
      SET last_order_at = (last_order_date::timestamp AT TIME ZONE 'Asia/Baku')
      WHERE last_order_at IS NULL AND last_order_date IS NOT NULL;
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_cia_company_customer_order_at
      ON customer_inactivity_alerts(company_id, customer_id, last_order_at)
      WHERE last_order_at IS NOT NULL;
    `);

    console.log('✅ customer_inactivity_alerts.last_order_at hazırdır');
  } catch (err) {
    console.error('❌', err.message);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

migrate();
