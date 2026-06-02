/**
 * customer_inactivity_alerts (cədvəl + last_order_at)
 * Serverdə cədvəl yoxdursa da işləyir.
 * npm run db:migrate:customer-inactivity-at
 */
import pool from '../config/database.js';

async function migrate() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customer_inactivity_alerts (
        id SERIAL PRIMARY KEY,
        company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        customer_id INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        last_order_date DATE,
        last_order_at TIMESTAMPTZ,
        notified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      ALTER TABLE customer_inactivity_alerts
      ADD COLUMN IF NOT EXISTS last_order_at TIMESTAMPTZ;
    `);

    await pool.query(`
      ALTER TABLE customer_inactivity_alerts
      ADD COLUMN IF NOT EXISTS last_order_date DATE;
    `);

    await pool.query(`
      ALTER TABLE customer_inactivity_alerts
      ALTER COLUMN last_order_date DROP NOT NULL;
    `).catch(() => {});

    await pool.query(`
      UPDATE customer_inactivity_alerts
      SET last_order_at = (last_order_date::timestamp AT TIME ZONE 'Asia/Baku')
      WHERE last_order_at IS NULL AND last_order_date IS NOT NULL;
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_customer_inactivity_alerts_company
      ON customer_inactivity_alerts(company_id, notified_at DESC);
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_cia_company_customer_order_at
      ON customer_inactivity_alerts(company_id, customer_id, last_order_at)
      WHERE last_order_at IS NOT NULL;
    `);

    console.log('✅ customer_inactivity_alerts hazırdır (last_order_at daxil)');
  } catch (err) {
    console.error('❌', err.message);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

migrate();
