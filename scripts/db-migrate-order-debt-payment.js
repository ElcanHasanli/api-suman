/**
 * orders.debt_paid_at_completion, debt_payments.order_id
 * npm run db:migrate:order-debt-payment
 */
import pool from '../config/database.js';

async function migrate() {
  try {
    await pool.query(`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS debt_paid_at_completion DECIMAL(10, 2) NOT NULL DEFAULT 0;
    `);

    await pool.query(`
      ALTER TABLE debt_payments
        ADD COLUMN IF NOT EXISTS order_id INT REFERENCES orders(id) ON DELETE SET NULL;
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_debt_payments_order
      ON debt_payments(order_id) WHERE order_id IS NOT NULL;
    `);

    console.log('✅ orders.debt_paid_at_completion + debt_payments.order_id hazırdır');
  } catch (err) {
    console.error('❌', err.message);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

migrate();
