/**
 * Su doldurma anbarı — stock + yeniləmə tarixçəsi
 * npm run db:migrate:warehouse
 */
import pool from '../config/database.js';

async function migrate() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS warehouse_stock (
        company_id INT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
        full_count INT NOT NULL DEFAULT 0,
        empty_count INT NOT NULL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_by INT REFERENCES users(id) ON DELETE SET NULL
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS warehouse_updates (
        id SERIAL PRIMARY KEY,
        company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        courier_id INT REFERENCES users(id) ON DELETE SET NULL,
        created_by INT NOT NULL REFERENCES users(id),
        empty_in INT NOT NULL DEFAULT 0,
        full_in INT NOT NULL DEFAULT 0,
        full_out INT NOT NULL DEFAULT 0,
        exit_full INT,
        previous_full INT NOT NULL DEFAULT 0,
        previous_empty INT NOT NULL DEFAULT 0,
        remaining_full INT NOT NULL DEFAULT 0,
        remaining_empty INT NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_warehouse_updates_company
      ON warehouse_updates(company_id, created_at DESC);
    `);

    console.log('✅ warehouse_stock / warehouse_updates hazırdır');
  } catch (err) {
    console.error('❌', err.message);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

migrate();
