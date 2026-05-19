import express from 'express';
import pool from '../config/database.js';
import { authenticateToken, authorizeRole } from '../middleware/auth.js';

const router = express.Router();

// Get all couriers
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email, name, phone, status FROM users WHERE role = $1', ['courier']);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get courier's orders
router.get('/:id/orders', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM orders WHERE courier_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;