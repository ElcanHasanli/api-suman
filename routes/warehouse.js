import express from 'express';
import pool from '../config/database.js';
import { authenticateToken, authorizeRole, requireTenant } from '../middleware/auth.js';
import { buildDateFilter } from '../utils/periodFilter.js';
import {
  applyWarehouseUpdate,
  formatWarehouseUpdate,
  getCourierDefaultWarehouse,
  getCustomersBidonSummary,
  getWarehouseById,
  listWarehouses,
  setWarehouseStockByAdmin,
} from '../utils/warehouse.js';
import { notifyAdminsWarehouseUpdated } from '../lib/notifyAdmins.js';

const router = express.Router();

router.use(authenticateToken, requireTenant);

async function mapCourierWarehouse(companyId, courierId) {
  const defaultId = await getCourierDefaultWarehouse(null, companyId, courierId);
  if (!defaultId) return null;
  const wh = await getWarehouseById(null, companyId, defaultId);
  return wh
    ? { id: wh.id, code: wh.code, name: wh.name }
    : null;
}

/** Anbar siyahısı + müştəri bidon xülasəsi */
router.get('/summary', authorizeRole(['admin', 'courier']), async (req, res) => {
  try {
    const warehouses = await listWarehouses(null, req.user.company_id);
    const customers = await getCustomersBidonSummary(req.user.company_id);

    let defaultWarehouse = null;
    if (req.user.role === 'courier') {
      defaultWarehouse = await mapCourierWarehouse(
        req.user.company_id,
        req.user.id
      );
    }

    const lastUpdate = await pool.query(
      `SELECT wu.*, u.name AS courier_name, cb.name AS created_by_name,
              w.code AS warehouse_code, w.name AS warehouse_name
       FROM warehouse_updates wu
       LEFT JOIN users u ON wu.courier_id = u.id
       JOIN users cb ON wu.created_by = cb.id
       LEFT JOIN warehouses w ON wu.warehouse_id = w.id
       WHERE wu.company_id = $1
       ORDER BY wu.created_at DESC
       LIMIT 1`,
      [req.user.company_id]
    );

    // Köhnə uyğunluq: warehouse = Mikrorayon (və ya kuryerin default-u)
    const primary =
      (defaultWarehouse &&
        warehouses.find((w) => w.id === defaultWarehouse.id)) ||
      warehouses.find((w) => w.code === 'mikrorayon') ||
      warehouses[0] ||
      null;

    res.json({
      warehouses,
      default_warehouse: defaultWarehouse,
      warehouse: primary,
      customers: {
        total_active_bidons: Number(customers.total_active_bidons) || 0,
        customer_count: Number(customers.customer_count) || 0,
      },
      last_update: formatWarehouseUpdate(lastUpdate.rows[0] ?? null),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Yeniləmə tarixçəsi */
router.get('/updates', authorizeRole(['admin', 'courier']), async (req, res) => {
  try {
    const { period, startDate, endDate, courier_id, warehouse_id, warehouse_code } =
      req.query;

    let query = `
      SELECT wu.*, u.name AS courier_name, cb.name AS created_by_name,
             w.code AS warehouse_code, w.name AS warehouse_name
      FROM warehouse_updates wu
      LEFT JOIN users u ON wu.courier_id = u.id
      JOIN users cb ON wu.created_by = cb.id
      LEFT JOIN warehouses w ON wu.warehouse_id = w.id
      WHERE wu.company_id = $1`;
    const params = [req.user.company_id];

    if (req.user.role === 'courier') {
      params.push(req.user.id);
      query += ` AND wu.courier_id = $${params.length}`;
    } else if (courier_id) {
      params.push(courier_id);
      query += ` AND wu.courier_id = $${params.length}`;
    }

    if (warehouse_id) {
      params.push(warehouse_id);
      query += ` AND wu.warehouse_id = $${params.length}`;
    } else if (warehouse_code) {
      params.push(String(warehouse_code).toLowerCase());
      query += ` AND w.code = $${params.length}`;
    }

    const df = buildDateFilter('wu.created_at', period, startDate, endDate, params);
    query += df.clause + ' ORDER BY wu.created_at DESC LIMIT 200';

    const result = await pool.query(query, df.params);
    res.json({ updates: result.rows.map(formatWarehouseUpdate) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Su doldurma (kuryer) — sadə forma:
 * entry_full, entry_empty, exit_full (+ optional warehouse_id/code)
 */
router.post('/update', authorizeRole(['courier']), async (req, res) => {
  try {
    const {
      warehouse_id,
      warehouse_code,
      entry_full,
      entry_empty,
      exit_full,
      full_in,
      empty_in,
      notes,
    } = req.body;

    const result = await applyWarehouseUpdate({
      companyId: req.user.company_id,
      courierId: req.user.id,
      createdBy: req.user.id,
      warehouse_id,
      warehouse_code,
      entry_full,
      entry_empty,
      exit_full,
      full_in,
      empty_in,
      notes,
    });

    notifyAdminsWarehouseUpdated(
      req.user.company_id,
      result.update,
      req.user.id
    ).catch(() => {});

    res.status(201).json(result);
  } catch (err) {
    const status =
      err.status ||
      (err.message.includes('must be') || err.message.includes('cannot be')
        ? 400
        : 500);
    res.status(status).json({ error: err.message, code: err.code ?? undefined });
  }
});

/** Admin: anbar sayını birbaşa düzəltmək */
router.patch('/stock', authorizeRole(['admin']), async (req, res) => {
  try {
    const { warehouse_id, warehouse_code, full_count, empty_count, notes } = req.body;

    if (full_count == null || empty_count == null) {
      return res.status(400).json({ error: 'full_count and empty_count required' });
    }

    const result = await setWarehouseStockByAdmin({
      companyId: req.user.company_id,
      warehouse_id,
      warehouse_code,
      full_count,
      empty_count,
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
    const status = err.status || (err.message.includes('must be') ? 400 : 500);
    res.status(status).json({ error: err.message, code: err.code ?? undefined });
  }
});

export default router;
