import express from 'express';
import pool from '../config/database.js';
import { authenticateToken, requireTenant, authorizeRole } from '../middleware/auth.js';
import { checkAndNotifyInactiveCustomers } from '../utils/customerInactivity.js';

const router = express.Router();

router.use(authenticateToken, requireTenant);

router.get('/', async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      // Əvvəl fire-and-forget idi → yeni passiv bildirişlər eyni cavabda görünmürdü
      await checkAndNotifyInactiveCustomers(req.user.company_id).catch(() => {});
    }

    const result = await pool.query(
      `SELECT n.*, o.status AS order_status, o.address AS order_address,
              c.name AS customer_name, c.surname AS customer_surname,
              c.active_bidons AS customer_active_bidons
       FROM notifications n
       LEFT JOIN orders o ON n.order_id = o.id AND o.company_id = $2
       LEFT JOIN customers c ON n.customer_id = c.id AND c.company_id = $2
       WHERE n.user_id = $1
         AND NOT (
           n.type = 'customer_inactive'
           AND (
             (n.customer_id IS NOT NULL AND COALESCE(c.active_bidons, 0) <= 0)
             OR (n.customer_id IS NOT NULL AND c.id IS NULL)
             OR (
               n.customer_id IS NOT NULL
               AND (
                 SELECT (COALESCE(MAX(ord.created_at), c.created_at) AT TIME ZONE 'Asia/Baku')::date
                 FROM orders ord
                 WHERE ord.customer_id = c.id AND ord.company_id = $2
               ) > ((NOW() AT TIME ZONE 'Asia/Baku')::date - 20)
             )
           )
         )
       ORDER BY n.created_at DESC
       LIMIT 200`,
      [req.user.id, req.user.company_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Kuryer mobil cihaz tokeni (FCM) */
router.post('/device-token', authorizeRole(['courier']), async (req, res) => {
  try {
    const { token, platform } = req.body;

    if (!token || !String(token).trim()) {
      return res.status(400).json({ error: 'token required' });
    }

    if (!platform || !['android', 'ios', 'web'].includes(platform)) {
      return res.status(400).json({
        error: 'platform required: android | ios | web',
      });
    }

    const tokenStr = String(token).trim();

    await pool.query(
      `INSERT INTO push_device_tokens (user_id, platform, token, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, platform)
       DO UPDATE SET token = EXCLUDED.token, updated_at = NOW()`,
      [req.user.id, platform, tokenStr]
    ).catch(() => {});

    const result = await pool.query(
      `INSERT INTO device_tokens (user_id, company_id, role, token, platform, app, updated_at)
       VALUES ($1, $2, 'courier', $3, $4, 'courier', NOW())
       ON CONFLICT (user_id, platform, app)
       DO UPDATE SET token = EXCLUDED.token, updated_at = NOW()
       RETURNING *`,
      [req.user.id, req.user.company_id, tokenStr, platform]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/read-all', async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET read = TRUE WHERE user_id = $1 AND read = FALSE',
      [req.user.id]
    );
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/read', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE notifications SET read = TRUE
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
