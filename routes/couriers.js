import express from 'express';
import pool from '../config/database.js';
import {
  authenticateToken,
  authorizeRole,
  requireTenant,
} from '../middleware/auth.js';
import { getWarehouseById, listWarehouses } from '../utils/warehouse.js';

const router = express.Router();

router.use(authenticateToken, requireTenant);

function mapCourierRow(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone,
    status: row.status,
    default_warehouse_id: row.default_warehouse_id ?? null,
    default_warehouse: row.warehouse_id
      ? {
          id: row.warehouse_id,
          code: row.warehouse_code,
          name: row.warehouse_name,
        }
      : null,
  };
}

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.name, u.phone, u.status, u.default_warehouse_id,
              w.id AS warehouse_id, w.code AS warehouse_code, w.name AS warehouse_name
       FROM users u
       LEFT JOIN warehouses w ON w.id = u.default_warehouse_id
       WHERE u.role = 'courier' AND u.company_id = $1
       ORDER BY u.name`,
      [req.user.company_id]
    );
    res.json(result.rows.map(mapCourierRow));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Admin: kuryerin default anbarını təyin et */
router.patch('/:id/warehouse', authorizeRole(['admin']), async (req, res) => {
  try {
    const { default_warehouse_id, warehouse_code } = req.body;
    const courierId = req.params.id;
    const companyId = req.user.company_id;

    const courier = await pool.query(
      `SELECT id FROM users
       WHERE id = $1 AND role = 'courier' AND company_id = $2`,
      [courierId, companyId]
    );
    if (!courier.rows.length) {
      return res.status(404).json({ error: 'Courier not found' });
    }

    let warehouseId = default_warehouse_id ?? null;

    if (warehouse_code) {
      const warehouses = await listWarehouses(null, companyId);
      const found = warehouses.find(
        (w) => w.code === String(warehouse_code).toLowerCase()
      );
      if (!found) {
        return res.status(400).json({
          error: 'Invalid warehouse_code',
          code: 'INVALID_WAREHOUSE',
        });
      }
      warehouseId = found.id;
    } else if (warehouseId != null) {
      const wh = await getWarehouseById(null, companyId, Number(warehouseId));
      if (!wh) {
        return res.status(404).json({ error: 'Warehouse not found' });
      }
      warehouseId = wh.id;
    }

    const result = await pool.query(
      `UPDATE users
       SET default_warehouse_id = $1
       WHERE id = $2 AND company_id = $3
       RETURNING id, email, name, phone, status, default_warehouse_id`,
      [warehouseId, courierId, companyId]
    );

    let default_warehouse = null;
    if (result.rows[0].default_warehouse_id) {
      const wh = await getWarehouseById(
        null,
        companyId,
        result.rows[0].default_warehouse_id
      );
      default_warehouse = wh
        ? { id: wh.id, code: wh.code, name: wh.name }
        : null;
    }

    res.json({ ...result.rows[0], default_warehouse });
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
