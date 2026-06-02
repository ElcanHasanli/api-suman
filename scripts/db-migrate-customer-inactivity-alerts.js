/**
 * 1 ay (30 gün) sifariş etməyən müştəri alertləri (admin üçün)
 * npm run db:migrate:customer-inactivity
 */
import pool from '../config/database.js';

async function migrate() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customer_inactivity_alerts (
        id SERIAL PRIMARY KEY,
        company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        customer_id INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        last_order_date DATE NOT NULL,
        notified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (company_id, customer_id, last_order_date)
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_customer_inactivity_alerts_company
      ON customer_inactivity_alerts(company_id, notified_at DESC);
    `);

    console.log('✅ customer_inactivity_alerts hazırdır');
  } catch (err) {
    console.error('❌', err.message);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

migrate();
