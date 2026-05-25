/**
 * device_tokens cədvəli (admin + kuryer FCM)
 * npm run db:migrate:devices
 */
import pool from '../config/database.js';

async function migrate() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS device_tokens (
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
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_device_tokens_company_admin
      ON device_tokens(company_id, app) WHERE app = 'admin';
    `);

    await pool.query(`
      INSERT INTO device_tokens (user_id, company_id, role, token, platform, app, updated_at)
      SELECT u.id, u.company_id, u.role, p.token, p.platform, 'courier', p.updated_at
      FROM push_device_tokens p
      JOIN users u ON p.user_id = u.id
      WHERE u.company_id IS NOT NULL
      ON CONFLICT (user_id, platform, app) DO UPDATE
        SET token = EXCLUDED.token, updated_at = EXCLUDED.updated_at;
    `).catch(() => {});

    console.log('✅ device_tokens hazırdır');
  } catch (err) {
    console.error('❌', err.message);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

migrate();
