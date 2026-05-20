import express from 'express';
import bcrypt from 'bcryptjs';
import pool from '../config/database.js';
import { authenticateToken, authorizeRole, requireTenant } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken, requireTenant);

router.get('/', authorizeRole(['admin']), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, email, name, phone, role, status, created_at
       FROM users WHERE company_id = $1 ORDER BY role, name`,
      [req.user.company_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authorizeRole(['admin']), async (req, res) => {
  try {
    const { email, password, name, phone, role = 'courier' } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name required' });
    }

    if (role !== 'courier') {
      return res.status(400).json({ error: 'Admin yalnız kuryer yarada bilər' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (email, password_hash, name, phone, role, company_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, name, phone, role, company_id, created_at`,
      [email, hashedPassword, name, phone || null, 'courier', req.user.company_id]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, email, name, phone, role, created_at
       FROM users WHERE id = $1 AND company_id = $2`,
      [req.params.id, req.user.company_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
