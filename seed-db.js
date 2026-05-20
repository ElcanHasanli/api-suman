/**
 * Owner, demo şirkət, admin və kuryer hesabları.
 * İstifadə: npm run db:seed
 */
import bcrypt from 'bcryptjs';
import pool from './config/database.js';
import { generateLicenseCode } from './utils/company.js';

async function seed() {
  try {
    console.log('🌱 Seed başlayır...');

    let owner = await pool.query("SELECT id FROM users WHERE role = 'owner' LIMIT 1");
    if (owner.rows.length === 0) {
      const hash = await bcrypt.hash('owner123', 10);
      await pool.query(
        `INSERT INTO users (email, password_hash, name, role, company_id)
         VALUES ($1, $2, $3, 'owner', NULL)`,
        ['owner@suman.az', hash, 'Platform Owner']
      );
      console.log('   ✅ owner: owner@suman.az / owner123');
    } else {
      console.log('   ⏭  owner artıq var');
    }

    let company = await pool.query('SELECT * FROM companies LIMIT 1');
    if (company.rows.length === 0) {
      const license = generateLicenseCode();
      company = await pool.query(
        `INSERT INTO companies (name, license_code, is_active)
         VALUES ($1, $2, TRUE) RETURNING *`,
        ['Demo Şirkət', license]
      );
      console.log(`   ✅ Demo şirkət, lisenziya: ${license}`);
    } else {
      company = company;
      console.log(`   ⏭  şirkət: ${company.rows[0].name}, lisenziya: ${company.rows[0].license_code}`);
    }

    const companyId = company.rows[0].id;
    const licenseCode = company.rows[0].license_code;

    const users = [
      {
        email: 'admin@suman.az',
        password: 'admin123',
        name: 'Admin',
        role: 'admin',
      },
      {
        email: 'kuryer@suman.az',
        password: 'kuryer123',
        name: 'Kuryer',
        role: 'courier',
        phone: '994500000001',
      },
    ];

    for (const u of users) {
      const exists = await pool.query('SELECT id FROM users WHERE email = $1', [u.email]);
      if (exists.rows.length > 0) {
        await pool.query(
          'UPDATE users SET company_id = $1, role = $2 WHERE email = $3',
          [companyId, u.role, u.email]
        );
        console.log(`   ⏭  ${u.email} yeniləndi (company_id)`);
        continue;
      }

      const hash = await bcrypt.hash(u.password, 10);
      await pool.query(
        `INSERT INTO users (email, password_hash, name, phone, role, company_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [u.email, hash, u.name, u.phone ?? null, u.role, companyId]
      );
      console.log(`   ✅ ${u.role}: ${u.email} / ${u.password}`);
    }

    console.log('');
    console.log('📋 Login (admin/kuryer üçün lisenziya kodu mütləqdir):');
    console.log(`   Lisenziya: ${licenseCode}`);
    console.log('   Admin:  admin@suman.az / admin123');
    console.log('   Kuryer: kuryer@suman.az / kuryer123');
    console.log('   Owner:  owner@suman.az / owner123 (lisenziya lazım deyil)');
    console.log('✅ Seed tamamlandı');
  } catch (err) {
    console.error('❌ Xəta:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

seed();
