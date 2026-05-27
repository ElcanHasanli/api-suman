/**
 * orders.assigned_at — kuryer təyin tarixi (Asia/Baku gün filtri)
 * npm run db:migrate:assigned-at
 */
import pool from '../config/database.js';

async function migrate() {
  try {
    await pool.query(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
    `);

    await pool.query(`
      UPDATE orders
      SET assigned_at = COALESCE(updated_at, created_at)
      WHERE courier_id IS NOT NULL AND assigned_at IS NULL;
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_orders_assigned_at
      ON orders(company_id, courier_id, assigned_at)
      WHERE status IN ('assigned', 'in_progress');
    `);

    console.log('✅ orders.assigned_at hazırdır');
  } catch (err) {
    console.error('❌', err.message);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

migrate();
