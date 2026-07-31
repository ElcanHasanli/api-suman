/**
 * notifications.customer_id — passiv müştəri bildirişi üçün
 * npm run db:migrate:notification-customer
 */
import pool from '../config/database.js';

async function migrate() {
  try {
    await pool.query(`
      ALTER TABLE notifications
        ADD COLUMN IF NOT EXISTS customer_id INT REFERENCES customers(id) ON DELETE SET NULL;
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_customer
        ON notifications(customer_id)
        WHERE customer_id IS NOT NULL;
    `);

    console.log('✅ notifications.customer_id hazırdır');
  } catch (err) {
    console.error('❌', err.message);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

migrate();
