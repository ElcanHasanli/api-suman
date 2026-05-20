import express from 'express';
import pool from '../config/database.js';
import { authenticateToken, requireTenant } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken, requireTenant);

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, email, name, phone, status
       FROM users
       WHERE role = 'courier' AND company_id = $1
       ORDER BY name`,
      [req.user.company_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/orders', async (req, res) => {
  try {
    const courier = await pool.query(
      `SELECT id FROM users
       WHERE id = $1 AND role = 'courier' AND company_id = $2`,
      [req.params.id, req.user.company_id]
    );
    if (courier.rows.length === 0) {
      return res.status(404).json({ error: 'Courier not found' });
    }

    const result = await pool.query(
      `SELECT * FROM orders
       WHERE courier_id = $1 AND company_id = $2
       ORDER BY created_at DESC`,
      [req.params.id, req.user.company_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
