import express from 'express';
import pool from '../config/database.js';
import { authenticateToken, authorizeRole } from '../middleware/auth.js';

const router = express.Router();

// Get all customers
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM customers ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get customer by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM customers WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create customer
router.post('/', authenticateToken, authorizeRole(['admin']), async (req, res) => {
  try {
    const { name, surname, phone, address, price, active_bidons } = req.body;

    if (!name || !phone || !address) {
      return res.status(400).json({ error: 'Name, phone, and address required' });
    }

    const result = await pool.query(
      'INSERT INTO customers (name, surname, phone, address, price, active_bidons) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, surname || null, phone, address, price || 0, active_bidons || 0]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update customer
router.put('/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
  try {
    const { name, surname, phone, address, price, active_bidons, debt } = req.body;

    const result = await pool.query(
      'UPDATE customers SET name = COALESCE($1, name), surname = COALESCE($2, surname), phone = COALESCE($3, phone), address = COALESCE($4, address), price = COALESCE($5, price), active_bidons = COALESCE($6, active_bidons), debt = COALESCE($7, debt), updated_at = NOW() WHERE id = $8 RETURNING *',
      [name, surname, phone, address, price, active_bidons, debt, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete customer
router.delete('/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM customers WHERE id = $1 RETURNING *',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.json({ message: 'Customer deleted', customer: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;