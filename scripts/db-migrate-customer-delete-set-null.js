/**
 * Müştəri silinəndə sifarişlər qalsın: orders.customer_id → ON DELETE SET NULL + snapshot
 * npm run db:migrate:customer-delete-set-null
 */
import pool from '../config/database.js';
import { formatCustomerDisplay } from '../utils/customerName.js';

async function dropFk(table, column) {
  const { rows } = await pool.query(
    `SELECT con.conname
     FROM pg_constraint con
     JOIN pg_class rel ON rel.oid = con.conrelid
     JOIN pg_attribute att
       ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
     WHERE rel.relname = $1
       AND att.attname = $2
       AND con.contype = 'f'`,
    [table, column]
  );
  for (const row of rows) {
    await pool.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${row.conname}`);
  }
}

async function migrate() {
  try {
    await pool.query(`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS customer_name_snapshot VARCHAR(255),
        ADD COLUMN IF NOT EXISTS customer_surname_snapshot VARCHAR(255),
        ADD COLUMN IF NOT EXISTS customer_phone_snapshot VARCHAR(50),
        ADD COLUMN IF NOT EXISTS customer_phone2_snapshot VARCHAR(50);
    `);

    await pool.query(`
      UPDATE orders o
      SET customer_name_snapshot = c.name,
          customer_surname_snapshot = c.surname,
          customer_phone_snapshot = c.phone,
          customer_phone2_snapshot = c.phone2
      FROM customers c
      WHERE o.customer_id = c.id
        AND o.customer_name_snapshot IS NULL;
    `);

    await dropFk('orders', 'customer_id');
    await pool.query(`ALTER TABLE orders ALTER COLUMN customer_id DROP NOT NULL`);
    await pool.query(`
      ALTER TABLE orders
        ADD CONSTRAINT orders_customer_id_fkey
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
    `);

    await pool.query(`
      ALTER TABLE debt_payments
        ADD COLUMN IF NOT EXISTS customer_name_snapshot VARCHAR(255);
    `);

    const debtRows = await pool.query(`
      SELECT dp.id, c.name, c.surname
      FROM debt_payments dp
      JOIN customers c ON c.id = dp.customer_id
      WHERE dp.customer_name_snapshot IS NULL
    `);
    for (const row of debtRows.rows) {
      const name = formatCustomerDisplay(row);
      await pool.query(
        `UPDATE debt_payments SET customer_name_snapshot = $1 WHERE id = $2`,
        [name || null, row.id]
      );
    }

    await dropFk('debt_payments', 'customer_id');
    await pool.query(`ALTER TABLE debt_payments ALTER COLUMN customer_id DROP NOT NULL`);
    await pool.query(`
      ALTER TABLE debt_payments
        ADD CONSTRAINT debt_payments_customer_id_fkey
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
    `);

    console.log('✅ customer delete SET NULL migration hazırdır');
  } catch (err) {
    console.error('❌', err.message);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

migrate();
