/**
 * Multi-tenant: companies + company_id
 * İstifadə: npm run db:migrate:tenant
 */
import pool from './config/database.js';
import { generateLicenseCode } from './utils/company.js';

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

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

    let companyId;
    const existingCompany = await client.query('SELECT id FROM companies LIMIT 1');

    if (existingCompany.rows.length === 0) {
      const license = generateLicenseCode();
      const inserted = await client.query(
        `INSERT INTO companies (name, license_code, is_active)
         VALUES ($1, $2, TRUE) RETURNING id, license_code`,
        ['Demo Şirkət', license]
      );
      companyId = inserted.rows[0].id;
      console.log(`   Demo şirkət yaradıldı, lisenziya: ${inserted.rows[0].license_code}`);
    } else {
      companyId = existingCompany.rows[0].id;
    }

    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id INT REFERENCES companies(id) ON DELETE CASCADE;
    `);
    await client.query(`
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS company_id INT REFERENCES companies(id) ON DELETE CASCADE;
    `);
    await client.query(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS company_id INT REFERENCES companies(id) ON DELETE CASCADE;
    `);

    await client.query(
      `UPDATE users SET company_id = $1 WHERE company_id IS NULL AND role != 'owner'`,
      [companyId]
    );
    await client.query(
      `UPDATE customers SET company_id = $1 WHERE company_id IS NULL`,
      [companyId]
    );
    await client.query(
      `UPDATE orders SET company_id = $1 WHERE company_id IS NULL`,
      [companyId]
    );

    await client.query(`
      ALTER TABLE users ALTER COLUMN company_id DROP NOT NULL;
    `);

    await client.query(`DROP INDEX IF EXISTS idx_customers_phone_unique`);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_company_phone
      ON customers (company_id, phone);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id);
      CREATE INDEX IF NOT EXISTS idx_customers_company ON customers(company_id);
      CREATE INDEX IF NOT EXISTS idx_orders_company ON orders(company_id);
    `);

    await client.query('COMMIT');
    console.log('✅ Multi-tenant migrasiya tamamlandı');
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
