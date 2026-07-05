/**
 * orders.order_type (delivery | pickup), orders.scheduled_date (Asia/Baku günü)
 * npm run db:migrate:order-type
 */
import pool from '../config/database.js';

async function migrate() {
  try {
    await pool.query(`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS order_type VARCHAR(20) NOT NULL DEFAULT 'delivery',
        ADD COLUMN IF NOT EXISTS scheduled_date DATE;
    `);

    await pool.query(`
      UPDATE orders
      SET scheduled_date = (assigned_at AT TIME ZONE 'Asia/Baku')::date
      WHERE scheduled_date IS NULL AND assigned_at IS NOT NULL;
    `);

    await pool.query(`
      UPDATE orders
      SET scheduled_date = (created_at AT TIME ZONE 'Asia/Baku')::date
      WHERE scheduled_date IS NULL;
    `);

    await pool.query(`
      ALTER TABLE orders ALTER COLUMN scheduled_date SET NOT NULL;
    `).catch(() => {});

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_orders_scheduled_date
      ON orders(company_id, scheduled_date)
      WHERE status IN ('assigned', 'in_progress', 'pending');
    `);

    console.log('✅ orders.order_type + scheduled_date hazırdır');
  } catch (err) {
    console.error('❌', err.message);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

migrate();
