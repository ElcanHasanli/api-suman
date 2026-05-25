/**
 * Əlavə xərclər, sifariş qeydləri, borc ödənişləri, telefon sahələri.
 * npm run db:migrate:v2
 */
import pool from './config/database.js';
import { normalizePhone } from './utils/phone.js';

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE customers
        ADD COLUMN IF NOT EXISTS phone_normalized VARCHAR(20),
        ADD COLUMN IF NOT EXISTS phone2 VARCHAR(20),
        ADD COLUMN IF NOT EXISTS phone2_normalized VARCHAR(20);
    `);

    const customers = await client.query('SELECT id, phone FROM customers');
    for (const row of customers.rows) {
      const normalized = normalizePhone(row.phone);
      await client.query(
        'UPDATE customers SET phone_normalized = $1 WHERE id = $2',
        [normalized, row.id]
      );
    }

    await client.query(`
      ALTER TABLE customers ALTER COLUMN phone_normalized SET NOT NULL;
    `).catch(() => {});

    await client.query(`DROP INDEX IF EXISTS idx_customers_company_phone`);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_company_phone_norm
      ON customers (company_id, phone_normalized);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS expenses (
        id SERIAL PRIMARY KEY,
        company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        courier_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount DECIMAL(10, 2) NOT NULL,
        description VARCHAR(255) NOT NULL,
        category VARCHAR(100),
        created_by INT NOT NULL REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS order_notes (
        id SERIAL PRIMARY KEY,
        company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        user_id INT NOT NULL REFERENCES users(id),
        author_role VARCHAR(50) NOT NULL,
        body TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS debt_payments (
        id SERIAL PRIMARY KEY,
        company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        customer_id INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        amount DECIMAL(10, 2) NOT NULL,
        previous_debt DECIMAL(10, 2) NOT NULL,
        new_debt DECIMAL(10, 2) NOT NULL,
        recorded_by INT NOT NULL REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_expenses_company ON expenses(company_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_order_notes_order ON order_notes(order_id);
      CREATE INDEX IF NOT EXISTS idx_debt_payments_company ON debt_payments(company_id, created_at);
    `);

    await client.query('COMMIT');
    console.log('✅ migrate v2 tamamlandı');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    process.exit(0);
  }
}

migrate();
