/**
 * orders, customers, notifications, companies silinir.
 * users default saxlanır (--drop-users ilə hamısı).
 */
import pool from './config/database.js';

const dropUsers = process.argv.includes('--drop-users');

async function resetDatabase() {
  const client = await pool.connect();

  try {
    console.log('🔄 Verilənlər bazası sıfırlanır...');
    await client.query('BEGIN');

    await client.query('DROP TABLE IF EXISTS notifications CASCADE');
    await client.query('DROP TABLE IF EXISTS orders CASCADE');
    await client.query('DROP TABLE IF EXISTS customers CASCADE');
    await client.query('DROP TABLE IF EXISTS companies CASCADE');

    if (dropUsers) {
      await client.query('DROP TABLE IF EXISTS users CASCADE');
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        license_code VARCHAR(32) UNIQUE NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        license_expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    if (dropUsers) {
      await client.query(`
        CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          name VARCHAR(255) NOT NULL,
          phone VARCHAR(20),
          role VARCHAR(50) NOT NULL DEFAULT 'user',
          status VARCHAR(50) DEFAULT 'active',
          company_id INT REFERENCES companies(id) ON DELETE CASCADE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
    } else {
      await client.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id INT REFERENCES companies(id) ON DELETE CASCADE;
      `);
    }

    await client.query(`
      CREATE TABLE customers (
        id SERIAL PRIMARY KEY,
        company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        surname VARCHAR(255),
        phone VARCHAR(20) NOT NULL,
        phone_normalized VARCHAR(20) NOT NULL,
        phone2 VARCHAR(20),
        phone2_normalized VARCHAR(20),
        address TEXT NOT NULL,
        price DECIMAL(10, 2) DEFAULT 0,
        active_bidons INT DEFAULT 0,
        debt DECIMAL(10, 2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (company_id, phone_normalized)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS expenses (
        id SERIAL PRIMARY KEY,
        company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        courier_id INT REFERENCES users(id) ON DELETE SET NULL,
        amount DECIMAL(10, 2) NOT NULL,
        description VARCHAR(255) NOT NULL,
        category VARCHAR(100),
        source VARCHAR(20) NOT NULL DEFAULT 'courier',
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
      CREATE TABLE IF NOT EXISTS warehouse_stock (
        company_id INT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
        full_count INT NOT NULL DEFAULT 0,
        empty_count INT NOT NULL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_by INT REFERENCES users(id) ON DELETE SET NULL
      );
    `);

    await client.query(`
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

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_warehouse_updates_company
      ON warehouse_updates(company_id, created_at DESC);
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
      CREATE TABLE orders (
        id SERIAL PRIMARY KEY,
        company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        customer_id INT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
        courier_id INT REFERENCES users(id) ON DELETE SET NULL,
        assigned_at TIMESTAMPTZ,
        bidons_count INT DEFAULT 1,
        address TEXT NOT NULL,
        price DECIMAL(10, 2) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        payment_type VARCHAR(50),
        amount_paid DECIMAL(10, 2),
        empty_bidons_returned INT DEFAULT 0,
        full_bidons_given INT,
        notes TEXT,
        is_paid BOOLEAN NOT NULL DEFAULT FALSE,
        paid_at TIMESTAMP,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE notifications (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        order_id INT REFERENCES orders(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL DEFAULT 'order_assigned',
        message TEXT NOT NULL,
        read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_inactivity_alerts (
        id SERIAL PRIMARY KEY,
        company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        customer_id INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        last_order_date DATE NOT NULL,
        notified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (company_id, customer_id, last_order_date)
      );
    `);

    await client.query(`
      CREATE INDEX idx_users_company ON users(company_id);
      CREATE INDEX idx_customers_company ON customers(company_id);
      CREATE INDEX idx_orders_company ON orders(company_id);
      CREATE INDEX idx_orders_status ON orders(status);
      CREATE INDEX idx_orders_courier ON orders(courier_id);
      CREATE INDEX idx_orders_completed_at ON orders(completed_at);
      CREATE INDEX idx_notifications_user ON notifications(user_id, read);
      CREATE INDEX idx_customer_inactivity_alerts_company
      ON customer_inactivity_alerts(company_id, notified_at DESC);
    `);

    await client.query('COMMIT');
    console.log('✅ Sıfırlandı → npm run db:seed');
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

resetDatabase();
