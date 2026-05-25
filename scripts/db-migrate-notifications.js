/**
 * notifications + push_device_tokens
 * npm run db:migrate:notifications
 */
import pool from '../config/database.js';

async function migrate() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        order_id INT REFERENCES orders(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL DEFAULT 'order_assigned',
        message TEXT NOT NULL,
        read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS push_device_tokens (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        platform VARCHAR(20) NOT NULL DEFAULT 'android',
        token TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (user_id, platform)
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);
      CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_device_tokens(user_id);
    `);

    console.log('✅ notifications + push_device_tokens hazırdır');
  } catch (err) {
    console.error('❌', err.message);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

migrate();
