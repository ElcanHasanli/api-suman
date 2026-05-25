import express from 'express';
import pool from '../config/database.js';
import { authenticateToken, requireTenant, authorizeRole } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken, requireTenant);

router.post('/register', async (req, res) => {
  try {
    const { token, platform, app } = req.body;

    if (!token || !String(token).trim()) {
      return res.status(400).json({ error: 'token required' });
    }

    if (!platform || !['android', 'ios', 'web'].includes(platform)) {
      return res.status(400).json({
        error: 'platform required: android | ios | web',
      });
    }

    if (!app || !['admin', 'courier'].includes(app)) {
      return res.status(400).json({ error: 'app must be admin or courier' });
    }

    if (app === 'admin' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admin can register admin app token' });
    }

    if (app === 'courier' && req.user.role !== 'courier') {
      return res.status(403).json({ error: 'Only courier can register courier app token' });
    }

    const tokenStr = String(token).trim();

    const result = await pool.query(
      `INSERT INTO device_tokens (user_id, company_id, role, token, platform, app, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (user_id, platform, app)
       DO UPDATE SET token = EXCLUDED.token, company_id = EXCLUDED.company_id,
                     role = EXCLUDED.role, updated_at = NOW()
       RETURNING id, user_id, company_id, role, platform, app, created_at, updated_at`,
      [
        req.user.id,
        req.user.company_id,
        req.user.role,
        tokenStr,
        platform,
        app,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/unregister', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'token required' });
    }

    await pool.query(
      'DELETE FROM device_tokens WHERE user_id = $1 AND token = $2',
      [req.user.id, String(token).trim()]
    );
    await pool.query(
      'DELETE FROM push_device_tokens WHERE user_id = $1 AND token = $2',
      [req.user.id, String(token).trim()]
    ).catch(() => {});

    res.json({ message: 'Device unregistered' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
