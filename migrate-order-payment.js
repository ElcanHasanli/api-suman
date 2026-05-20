/**
 * Mövcud DB-yə is_paid / paid_at əlavə edir.
 * İstifadə: npm run db:migrate
 */
import pool from './config/database.js';

async function migrate() {
  try {
    await pool.query(`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS is_paid BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;
    `);

    await pool.query(`
      UPDATE orders
      SET is_paid = TRUE,
          paid_at = COALESCE(paid_at, completed_at, updated_at)
      WHERE status = 'completed'
        AND payment_type IN ('cash', 'card')
        AND is_paid = FALSE;
    `);

    console.log('✅ orders.is_paid / orders.paid_at əlavə edildi');
  } catch (err) {
    console.error('❌', err.message);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

migrate();
