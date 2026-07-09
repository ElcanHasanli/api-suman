import express from 'express';
import pool from '../config/database.js';
import { authenticateToken, authorizeRole, requireTenant } from '../middleware/auth.js';
import { buildDateFilter } from '../utils/periodFilter.js';
import {
  applyWarehouseUpdate,
  getCustomersBidonSummary,
  getWarehouseStock,
  setWarehouseStockByAdmin,
} from '../utils/warehouse.js';
import { notifyAdminsWarehouseUpdated } from '../lib/notifyAdmins.js';

const router = express.Router();

router.use(authenticateToken, requireTenant);

/** Anbar + müştəri bidon xülasəsi */
router.get('/summary', authorizeRole(['admin', 'courier']), async (req, res) => {
  try {
    const stock = await getWarehouseStock(null, req.user.company_id);
    const customers = await getCustomersBidonSummary(req.user.company_id);

    let updatedByName = null;
    if (stock.updated_by) {
      const u = await pool.query('SELECT name FROM users WHERE id = $1', [stock.updated_by]);
      updatedByName = u.rows[0]?.name ?? null;
    }

    const lastUpdate = await pool.query(
      `SELECT wu.*, u.name AS courier_name, cb.name AS created_by_name
       FROM warehouse_updates wu
       LEFT JOIN users u ON wu.courier_id = u.id
       JOIN users cb ON wu.created_by = cb.id
       WHERE wu.company_id = $1
       ORDER BY wu.created_at DESC
       LIMIT 1`,
      [req.user.company_id]
    );

    res.json({
      warehouse: {
        full_count: Number(stock.full_count) || 0,
        empty_count: Number(stock.empty_count) || 0,
        pump_count: Number(stock.pump_count) || 0,
        dispenser_count: Number(stock.dispenser_count) || 0,
        updated_at: stock.updated_at,
        updated_by_name: updatedByName,
      },
      customers: {
        total_active_bidons: Number(customers.total_active_bidons) || 0,
        customer_count: Number(customers.customer_count) || 0,
      },
      last_update: lastUpdate.rows[0] ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Yeniləmə tarixçəsi */
router.get('/updates', authorizeRole(['admin', 'courier']), async (req, res) => {
  try {
    const { period, startDate, endDate, courier_id } = req.query;

    let query = `
      SELECT wu.*, u.name AS courier_name, cb.name AS created_by_name
      FROM warehouse_updates wu
      LEFT JOIN users u ON wu.courier_id = u.id
      JOIN users cb ON wu.created_by = cb.id
      WHERE wu.company_id = $1`;
    const params = [req.user.company_id];

    if (req.user.role === 'courier') {
      params.push(req.user.id);
      query += ` AND wu.courier_id = $${params.length}`;
    } else if (courier_id) {
      params.push(courier_id);
      query += ` AND wu.courier_id = $${params.length}`;
    }

    const df = buildDateFilter('wu.created_at', period, startDate, endDate, params);
    query += df.clause + ' ORDER BY wu.created_at DESC LIMIT 200';

    const result = await pool.query(query, df.params);
    res.json({ updates: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Su doldurma anbarı yeniləməsi (kuryer).
 * empty_in, full_in — anbara daxil; full_out — götürülən dolu; remaining_full — yerdə qaldı.
 */
router.post('/update', authorizeRole(['courier']), async (req, res) => {
  try {
    const {
      empty_in,
      full_in,
      full_out,
      exit_full,
      remaining_full,
      remaining_empty,
      notes,
    } = req.body;

    if (remaining_full == null || remaining_full === '') {
      return res.status(400).json({ error: 'remaining_full required (anbarda qalan dolu)' });
    }

    const result = await applyWarehouseUpdate({
      companyId: req.user.company_id,
      courierId: req.user.id,
      createdBy: req.user.id,
      empty_in,
      full_in,
      full_out,
      exit_full,
      remaining_full,
      remaining_empty,
      notes,
    });

    notifyAdminsWarehouseUpdated(
      req.user.company_id,
      result.update,
      req.user.id
    ).catch(() => {});

    res.status(201).json(result);
  } catch (err) {
    const status = err.message.includes('must be') ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

/** Admin: anbar sayını birbaşa düzəltmək */
router.patch('/stock', authorizeRole(['admin']), async (req, res) => {
  try {
    const { full_count, empty_count, pump_count, dispenser_count, notes } = req.body;

    if (full_count == null || empty_count == null) {
      return res.status(400).json({ error: 'full_count and empty_count required' });
    }

    const result = await setWarehouseStockByAdmin({
      companyId: req.user.company_id,
      full_count,
      empty_count,
      pump_count,
      dispenser_count,
      updatedBy: req.user.id,
      notes,
    });

    const customers = await getCustomersBidonSummary(req.user.company_id);

    res.json({
      ...result,
      customers: {
        total_active_bidons: Number(customers.total_active_bidons) || 0,
      },
    });
  } catch (err) {
    const status = err.message.includes('must be') ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

export default router;
