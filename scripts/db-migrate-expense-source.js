/**
 * expenses.source (courier|admin), courier_id nullable
 * npm run db:migrate:expense-source
 */
import pool from '../config/database.js';

async function migrate() {
  try {
    await pool.query(`
      ALTER TABLE expenses
      ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'courier';
    `);

    await pool.query(`
      ALTER TABLE expenses
      ALTER COLUMN courier_id DROP NOT NULL;
    `);

    await pool.query(`
      UPDATE expenses SET source = 'courier' WHERE source IS NULL OR source = '';
    `);

    console.log('✅ expenses.source + nullable courier_id hazırdır');
  } catch (err) {
    console.error('❌', err.message);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

migrate();
