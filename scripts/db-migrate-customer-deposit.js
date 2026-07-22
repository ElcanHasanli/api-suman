/**
 * Müştəri depoziti + qeyd + depozit tarixçəsi (ledger)
 * npm run db:migrate:customer-deposit
 */
import pool from '../config/database.js';

async function migrate() {
  try {
    await pool.query(`
      ALTER TABLE customers
        ADD COLUMN IF NOT EXISTS deposit DECIMAL(10, 2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS notes TEXT;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS deposit_entries (
        id SERIAL PRIMARY KEY,
        company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        customer_id INT REFERENCES customers(id) ON DELETE SET NULL,
        customer_name VARCHAR(255),
        amount DECIMAL(10, 2) NOT NULL,
        previous_deposit DECIMAL(10, 2) NOT NULL DEFAULT 0,
        new_deposit DECIMAL(10, 2) NOT NULL DEFAULT 0,
        entry_type VARCHAR(30) NOT NULL,
        notes TEXT,
        recorded_by INT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_deposit_entries_company_created
        ON deposit_entries(company_id, created_at DESC);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_deposit_entries_customer
        ON deposit_entries(customer_id);
    `);

    console.log('✅ customer deposit migration hazırdır');
  } catch (err) {
    console.error('❌', err.message);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

migrate();
