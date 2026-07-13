import express from 'express';
import bcrypt from 'bcryptjs';
import pool from '../config/database.js';
import { authenticateToken, authorizeRole, requireTenant } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken, requireTenant);

router.get('/', authorizeRole(['admin']), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.name, u.phone, u.role, u.status, u.created_at,
              u.default_warehouse_id,
              w.code AS default_warehouse_code, w.name AS default_warehouse_name
       FROM users u
       LEFT JOIN warehouses w ON w.id = u.default_warehouse_id
       WHERE u.company_id = $1 ORDER BY u.role, u.name`,
      [req.user.company_id]
    );
    res.json(
      result.rows.map((row) => ({
        ...row,
        default_warehouse: row.default_warehouse_id
          ? {
              id: row.default_warehouse_id,
              code: row.default_warehouse_code,
              name: row.default_warehouse_name,
            }
          : null,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authorizeRole(['admin']), async (req, res) => {
  try {
    const {
      email,
      password,
      name,
      phone,
      role = 'courier',
      default_warehouse_id,
      warehouse_code,
    } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name required' });
    }

    if (role !== 'courier') {
      return res.status(400).json({ error: 'Admin yalnız kuryer yarada bilər' });
    }

    let warehouseId = default_warehouse_id ?? null;
    if (warehouse_code) {
      const wh = await pool.query(
        `SELECT id FROM warehouses WHERE company_id = $1 AND code = $2`,
        [req.user.company_id, String(warehouse_code).toLowerCase()]
      );
      if (!wh.rows.length) {
        return res.status(400).json({ error: 'Invalid warehouse_code' });
      }
      warehouseId = wh.rows[0].id;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (email, password_hash, name, phone, role, company_id, default_warehouse_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, email, name, phone, role, company_id, default_warehouse_id, created_at`,
      [
        email,
        hashedPassword,
        name,
        phone || null,
        'courier',
        req.user.company_id,
        warehouseId,
      ]
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
