/**
 * Tarixçə dashboard: unit_price, prepaid, order_extras, anbar pompa/dispenser
 * npm run db:migrate:history-dashboard
 */
import pool from '../config/database.js';

async function migrate() {
  try {
    await pool.query(`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS unit_price DECIMAL(10, 2),
        ADD COLUMN IF NOT EXISTS is_prepaid BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS prepaid_amount DECIMAL(10, 2) NOT NULL DEFAULT 0;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS order_extras (
        id SERIAL PRIMARY KEY,
        company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        extra_type VARCHAR(30) NOT NULL,
        description TEXT,
        quantity INT NOT NULL DEFAULT 1,
        unit_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
        amount DECIMAL(10, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_order_extras_order
      ON order_extras(order_id);
    `);

    await pool.query(`
      ALTER TABLE warehouse_stock
        ADD COLUMN IF NOT EXISTS pump_count INT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS dispenser_count INT NOT NULL DEFAULT 0;
    `);

    console.log('✅ history dashboard migration hazırdır');
  } catch (err) {
    console.error('❌', err.message);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

migrate();
