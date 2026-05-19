import express from 'express';
import pool from '../config/database.js';
import { authenticateToken, authorizeRole } from '../middleware/auth.js';

const router = express.Router();

// Get all orders
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.*, c.name, c.surname, c.phone, c.address, u.name as courier_name
       FROM orders o
       LEFT JOIN customers c ON o.customer_id = c.id
       LEFT JOIN users u ON o.courier_id = u.id
       ORDER BY o.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get completed orders (today, week, month, custom date range)
router.get('/completed/:period', authenticateToken, async (req, res) => {
  try {
    const { period } = req.params;
    const { startDate, endDate } = req.query;

    let query = `SELECT o.*, c.name, c.surname, u.name as courier_name
                 FROM orders o
                 LEFT JOIN customers c ON o.customer_id = c.id
                 LEFT JOIN users u ON o.courier_id = u.id
                 WHERE o.status = 'completed'`;

    let params = [];

    if (period === 'today') {
      query += ' AND DATE(o.completed_at) = CURRENT_DATE';
    } else if (period === 'week') {
      query += ' AND o.completed_at >= CURRENT_DATE - INTERVAL 7 DAY';
    } else if (period === 'month') {
      query += ' AND DATE_TRUNC(\'month\', o.completed_at) = DATE_TRUNC(\'month\', CURRENT_DATE)';
    } else if (period === 'custom' && startDate && endDate) {
      query += ' AND o.completed_at >= $1 AND o.completed_at <= $2';
      params = [startDate, endDate];
    }

    query += ' ORDER BY o.completed_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get orders by courier
router.get('/courier/:courierId', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.*, c.name, c.surname, c.phone, c.address
       FROM orders o
       LEFT JOIN customers c ON o.customer_id = c.id
       WHERE o.courier_id = $1
       ORDER BY o.created_at DESC`,
      [req.params.courierId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create order
router.post('/', authenticateToken, authorizeRole(['admin']), async (req, res) => {
  try {
    const { customer_id, courier_id, bidons_count, address, price } = req.body;

    if (!customer_id) {
      return res.status(400).json({ error: 'Customer ID required' });
    }

    // Get customer details
    const customer = await pool.query('SELECT * FROM customers WHERE id = $1', [customer_id]);
    if (customer.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const customerData = customer.rows[0];

    const result = await pool.query(
      'INSERT INTO orders (customer_id, courier_id, bidons_count, address, price) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [customer_id, courier_id || null, bidons_count || 1, address || customerData.address, price || customerData.price]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update order
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { status, courier_id, payment_type, empty_bidons_returned, full_bidons_given, notes } = req.body;

    const result = await pool.query(
      `UPDATE orders 
       SET status = COALESCE($1, status), 
           courier_id = COALESCE($2, courier_id),
           payment_type = COALESCE($3, payment_type),
           empty_bidons_returned = COALESCE($4, empty_bidons_returned),
           full_bidons_given = COALESCE($5, full_bidons_given),
           notes = COALESCE($6, notes),
           completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE completed_at END,
           updated_at = NOW()
       WHERE id = $7 RETURNING *`,
      [status, courier_id, payment_type, empty_bidons_returned, full_bidons_given, notes, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete order
router.delete('/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM orders WHERE id = $1 RETURNING *',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({ message: 'Order deleted', order: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;