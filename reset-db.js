/**
 * Biznes məlumatlarını sıfırlayır: şirkətlər, müştərilər, sifarişlər, xərclər, anbar, bildirişlər.
 * users default saxlanır (--drop-users ilə hamısı silinir).
 *
 * npm run db:reset
 * npm run db:reset -- --drop-users
 */
import pool from './config/database.js';

const dropUsers = process.argv.includes('--drop-users');

async function dropBusinessTables(client) {
  await client.query(`
    DROP TABLE IF EXISTS customer_inactivity_alerts CASCADE;
    DROP TABLE IF EXISTS notifications CASCADE;
    DROP TABLE IF EXISTS order_notes CASCADE;
    DROP TABLE IF EXISTS debt_payments CASCADE;
    DROP TABLE IF EXISTS expenses CASCADE;
    DROP TABLE IF EXISTS warehouse_updates CASCADE;
    DROP TABLE IF EXISTS warehouse_stock CASCADE;
    DROP TABLE IF EXISTS orders CASCADE;
    DROP TABLE IF EXISTS customers CASCADE;
    DROP TABLE IF EXISTS device_tokens CASCADE;
    DROP TABLE IF EXISTS push_device_tokens CASCADE;
    DROP TABLE IF EXISTS companies CASCADE;
  `);

  if (dropUsers) {
    await client.query('DROP TABLE IF EXISTS users CASCADE');
  } else {
    await client.query(`
      UPDATE users SET company_id = NULL WHERE company_id IS NOT NULL;
    `);
  }
}

async function createSchema(client) {
  await client.query(`
    CREATE TABLE companies (
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
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_customers_phone_norm ON customers(company_id, phone_normalized);

    CREATE TABLE expenses (
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

    CREATE TABLE orders (
      id SERIAL PRIMARY KEY,
      company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      customer_id INT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
      courier_id INT REFERENCES users(id) ON DELETE SET NULL,
      assigned_at TIMESTAMPTZ,
      scheduled_date DATE NOT NULL DEFAULT (NOW() AT TIME ZONE 'Asia/Baku')::date,
      order_type VARCHAR(20) NOT NULL DEFAULT 'delivery',
      bidons_count INT DEFAULT 1,
      address TEXT NOT NULL,
      price DECIMAL(10, 2) NOT NULL,
      status VARCHAR(50) DEFAULT 'pending',
      payment_type VARCHAR(50),
      amount_paid DECIMAL(10, 2),
      debt_paid_at_completion DECIMAL(10, 2) NOT NULL DEFAULT 0,
      empty_bidons_returned INT DEFAULT 0,
      full_bidons_given INT,
      notes TEXT,
      is_paid BOOLEAN NOT NULL DEFAULT FALSE,
      paid_at TIMESTAMP,
      completed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE order_notes (
      id SERIAL PRIMARY KEY,
      company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      user_id INT NOT NULL REFERENCES users(id),
      author_role VARCHAR(50) NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE debt_payments (
      id SERIAL PRIMARY KEY,
      company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      customer_id INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      order_id INT REFERENCES orders(id) ON DELETE SET NULL,
      amount DECIMAL(10, 2) NOT NULL,
      previous_debt DECIMAL(10, 2) NOT NULL,
      new_debt DECIMAL(10, 2) NOT NULL,
      recorded_by INT NOT NULL REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE warehouse_stock (
      company_id INT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
      full_count INT NOT NULL DEFAULT 0,
      empty_count INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_by INT REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE warehouse_updates (
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

    CREATE TABLE notifications (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      order_id INT REFERENCES orders(id) ON DELETE CASCADE,
      type VARCHAR(50) NOT NULL DEFAULT 'order_assigned',
      message TEXT NOT NULL,
      read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE customer_inactivity_alerts (
      id SERIAL PRIMARY KEY,
      company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      customer_id INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      last_order_date DATE NOT NULL,
      notified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (company_id, customer_id, last_order_date)
    );

    CREATE TABLE push_device_tokens (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      platform VARCHAR(20) NOT NULL DEFAULT 'android',
      token TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (user_id, platform)
    );

    CREATE TABLE device_tokens (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      role VARCHAR(50) NOT NULL,
      token TEXT NOT NULL,
      platform VARCHAR(20) NOT NULL DEFAULT 'android',
      app VARCHAR(20) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (user_id, platform, app)
    );

    CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id);
    CREATE INDEX IF NOT EXISTS idx_customers_company ON customers(company_id);
    CREATE INDEX IF NOT EXISTS idx_orders_company ON orders(company_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_courier ON orders(courier_id);
    CREATE INDEX IF NOT EXISTS idx_orders_completed_at ON orders(completed_at);
    CREATE INDEX IF NOT EXISTS idx_orders_assigned_at ON orders(company_id, courier_id, assigned_at)
      WHERE status IN ('assigned', 'in_progress');
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);
    CREATE INDEX IF NOT EXISTS idx_expenses_company ON expenses(company_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_warehouse_updates_company ON warehouse_updates(company_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_customer_inactivity_alerts_company ON customer_inactivity_alerts(company_id, notified_at DESC);
    CREATE INDEX IF NOT EXISTS idx_device_tokens_company_admin ON device_tokens(company_id, app) WHERE app = 'admin';
  `);
}

async function resetDatabase() {
  const client = await pool.connect();

  try {
    console.log('🔄 Verilənlər bazası sıfırlanır...');
    console.log(dropUsers ? '   (users də silinir)' : '   (owner/admin/kuryer hesabları saxlanır, company_id təmizlənir)');
    await client.query('BEGIN');

    await dropBusinessTables(client);
    await createSchema(client);

    await client.query('COMMIT');
    console.log('✅ Biznes məlumatları silindi.');
    console.log('');
    console.log('Növbəti addım (istəyə görə):');
    console.log('   npm run db:seed          — demo şirkət + admin/kuryer');
    console.log('   (seed olmadan) owner paneldən yeni şirkət yaradın');
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
