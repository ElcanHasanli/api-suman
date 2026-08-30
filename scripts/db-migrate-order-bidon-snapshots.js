/**
 * Sifarişdə müştərinin boş bidon snapshot-u (tamamlanmadan əvvəl / sonra)
 * npm run db:migrate:order-bidon-snapshots
 */
import pool from '../config/database.js';

async function migrate() {
  try {
    await pool.query(`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS customer_active_bidons_before INT,
        ADD COLUMN IF NOT EXISTS customer_active_bidons_after INT;
    `);

    console.log('✅ order bidon snapshot migration hazırdır');
  } catch (err) {
    console.error('❌', err.message);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

migrate();
