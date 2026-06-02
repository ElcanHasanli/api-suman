import express from 'express';
import pool from '../config/database.js';
import { authenticateToken, authorizeRole, requireTenant } from '../middleware/auth.js';
import { buildDateFilter } from '../utils/periodFilter.js';
import { notifyAdminsExpenseCreated } from '../lib/notifyAdmins.js';
import { formatExpenseRow, isValidAdminCategory } from '../utils/expenseFormat.js';

const router = express.Router();

const expenseListSelect = `
  SELECT e.*, u.name AS courier_name
  FROM expenses e
  LEFT JOIN users u ON e.courier_id = u.id
`;

router.use(authenticateToken, requireTenant);

router.get('/', async (req, res) => {
  try {
    const { period, startDate, endDate, courier_id } = req.query;

    let query = `${expenseListSelect} WHERE e.company_id = $1`;
    const params = [req.user.company_id];

    if (req.user.role === 'courier') {
      params.push(req.user.id);
      query += ` AND e.courier_id = $${params.length}`;
    } else if (courier_id) {
      params.push(courier_id);
      query += ` AND e.courier_id = $${params.length}`;
    }

    const df = buildDateFilter('e.created_at', period, startDate, endDate, params);
    query += df.clause + ' ORDER BY e.created_at DESC';

    const result = await pool.query(query, df.params);
    const expenses = result.rows.map(formatExpenseRow);
    const totalExpenses = expenses.reduce((s, r) => s + Number(r.amount), 0);

    res.json({ expenses, totalExpenses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authorizeRole(['courier', 'admin']), async (req, res) => {
  try {
    const { amount, description, category, courier_id, source: bodySource } = req.body;

    if (!amount || !description) {
      return res.status(400).json({ error: 'Amount and description required' });
    }

    let source;
    let courierId;

    if (req.user.role === 'courier') {
      source = 'courier';
      courierId = req.user.id;
    } else {
      const wantsCourier =
        bodySource === 'courier' || (courier_id != null && courier_id !== '');

      if (wantsCourier) {
        if (!courier_id) {
          return res.status(400).json({ error: 'courier_id required when source is courier' });
        }
        const courier = await pool.query(
          `SELECT id FROM users WHERE id = $1 AND company_id = $2 AND role = 'courier'`,
          [courier_id, req.user.company_id]
        );
        if (courier.rows.length === 0) {
          return res.status(400).json({ error: 'Courier not found' });
        }
        source = 'courier';
        courierId = courier_id;
      } else {
        source = 'admin';
        courierId = null;
        if (category && !isValidAdminCategory(category)) {
          return res.status(400).json({
            error:
              'Invalid category. Use: payroll, fuel, rent, supplies, equipment, other',
          });
        }
      }
    }

    const result = await pool.query(
      `INSERT INTO expenses (
         company_id, courier_id, amount, description, category, created_by, source
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        req.user.company_id,
        courierId,
        amount,
        description,
        category || null,
        req.user.id,
        source,
      ]
    );

    const row = await pool.query(
      `${expenseListSelect} WHERE e.id = $1`,
      [result.rows[0].id]
    );
    const expense = formatExpenseRow(row.rows[0]);

    if (req.user.role === 'courier') {
      notifyAdminsExpenseCreated(
        req.user.company_id,
        expense,
        req.user.id
      ).catch(() => {});
    }

    res.status(201).json(expense);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authorizeRole(['admin']), async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM expenses WHERE id = $1 AND company_id = $2 RETURNING *`,
      [req.params.id, req.user.company_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    res.json({ message: 'Expense deleted', expense: formatExpenseRow(result.rows[0]) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
