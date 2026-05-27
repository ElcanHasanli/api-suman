import express from 'express';
import pool from '../config/database.js';
import {
  authenticateToken,
  authorizeRole,
  authorizeCourierSelf,
  requireTenant,
} from '../middleware/auth.js';
import { assertSameCompany } from '../middleware/tenant.js';
import { completeOrder, markOrderAsPaid } from '../utils/orderCompletion.js';
import { notifyCourierOnAssign } from '../lib/notifyCourier.js';
import {
  notifyAdminsOrderCompleted,
  notifyAdminsOrderNote,
} from '../lib/notifyAdmins.js';
import { buildCompletedOrdersFilter, COMPLETED_ORDER_SELECT } from '../utils/historyQuery.js';
import { buildExcelBuffer, sendExcel } from '../utils/excel.js';
import { BAKU_TODAY, courierActiveOrdersClause } from '../utils/bakuDate.js';

const router = express.Router();

router.use(authenticateToken, requireTenant);

const orderListSelect = `
  SELECT o.*,
         c.name, c.surname, c.phone AS customer_phone,
         c.address AS customer_address, c.active_bidons, c.debt,
         u.name AS courier_name
  FROM orders o
  LEFT JOIN customers c ON o.customer_id = c.id
  LEFT JOIN users u ON o.courier_id = u.id
`;

async function getOrderById(id, companyId, user = null) {
  let query = `${orderListSelect} WHERE o.id = $1 AND o.company_id = $2`;
  const params = [id, companyId];

  if (user?.role === 'courier') {
    params.push(user.id);
    query += ` AND o.courier_id = $${params.length}`;
    query += ` AND ${courierActiveOrdersClause('o')}`;
  }

  const result = await pool.query(query, params);
  return result.rows[0] ?? null;
}

async function assertCourierInCompany(courierId, companyId) {
  if (!courierId) return true;
  const r = await pool.query(
    `SELECT id FROM users WHERE id = $1 AND company_id = $2 AND role = 'courier'`,
    [courierId, companyId]
  );
  return r.rows.length > 0;
}

function assertCourierOrderAccess(req, order) {
  if (!order || !assertSameCompany(req.user, order.company_id)) return false;
  if (req.user.role === 'admin') return true;
  if (req.user.role !== 'courier' || order.courier_id !== req.user.id) return false;

  if (['assigned', 'in_progress'].includes(order.status)) {
    if (!order.assigned_at) return false;
  }

  return true;
}

router.get('/', async (req, res) => {
  try {
    const { status, courier_id, completedToday } = req.query;
    let query = `${orderListSelect} WHERE o.company_id = $1`;
    const params = [req.user.company_id];

    if (req.user.role === 'courier') {
      params.push(req.user.id);
      query += ` AND o.courier_id = $${params.length}`;
      query += ` AND ${courierActiveOrdersClause('o')}`;
    } else if (courier_id) {
      params.push(courier_id);
      query += ` AND o.courier_id = $${params.length}`;
    }

    if (status) {
      params.push(status);
      query += ` AND o.status = $${params.length}`;
    }

    if (completedToday === 'true') {
      query += ` AND o.status = 'completed'
        AND (o.completed_at AT TIME ZONE 'Asia/Baku')::date = ${BAKU_TODAY}`;
    }

    query += ' ORDER BY o.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/completed/:period', async (req, res) => {
  try {
    const { period } = req.params;
    const { startDate, endDate } = req.query;
    const { clause, params } = buildCompletedOrdersFilter(
      period,
      startDate,
      endDate,
      req.user.company_id
    );

    const query = `${COMPLETED_ORDER_SELECT} WHERE ${clause} ORDER BY o.completed_at DESC`;
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/courier/:courierId', authorizeCourierSelf('courierId'), async (req, res) => {
  try {
    const ok = await assertCourierInCompany(req.params.courierId, req.user.company_id);
    if (!ok) return res.status(404).json({ error: 'Courier not found' });

    let query = `${orderListSelect} WHERE o.courier_id = $1 AND o.company_id = $2`;
    if (req.user.role === 'courier') {
      query += ` AND ${courierActiveOrdersClause('o')}`;
    }
    query += ' ORDER BY o.created_at DESC';

    const result = await pool.query(query, [
      req.params.courierId,
      req.user.company_id,
    ]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/courier/:courierId/export', authorizeCourierSelf('courierId'), async (req, res) => {
  try {
    const ok = await assertCourierInCompany(req.params.courierId, req.user.company_id);
    if (!ok) return res.status(404).json({ error: 'Courier not found' });

    const { period, startDate, endDate } = req.query;
    let query = `${orderListSelect} WHERE o.courier_id = $1 AND o.company_id = $2 AND o.status = 'completed'`;
    const params = [req.params.courierId, req.user.company_id];

    if (period === 'today') {
      query += ` AND DATE(o.completed_at) = CURRENT_DATE`;
    } else if (period === 'week') {
      query += ` AND o.completed_at >= CURRENT_DATE - INTERVAL '7 days'`;
    } else if (period === 'month') {
      query += ` AND DATE_TRUNC('month', o.completed_at) = DATE_TRUNC('month', CURRENT_DATE)`;
    } else if (period === 'custom' && startDate && endDate) {
      params.push(startDate, endDate);
      query += ` AND o.completed_at >= $3::timestamp AND o.completed_at < ($4::date + INTERVAL '1 day')`;
    }

    query += ' ORDER BY o.completed_at DESC';

    const result = await pool.query(query, params);
    const rows = result.rows.map((o) => ({
      id: o.id,
      customer: [o.name, o.surname].filter(Boolean).join(' '),
      address: o.address,
      price: o.price,
      payment_type: o.payment_type,
      is_paid: o.is_paid,
      paid_at: o.paid_at,
      completed_at: o.completed_at,
    }));

    const buffer = await buildExcelBuffer('Sifarişlər', [
      { header: 'ID', key: 'id', width: 8 },
      { header: 'Müştəri', key: 'customer', width: 22 },
      { header: 'Ünvan', key: 'address', width: 28 },
      { header: 'Qiymət', key: 'price', width: 10 },
      { header: 'Ödəniş', key: 'payment_type', width: 12 },
      { header: 'Ödənilib', key: 'is_paid', width: 10 },
      { header: 'Ödəniş tarixi', key: 'paid_at', width: 20 },
      { header: 'Tamamlanma', key: 'completed_at', width: 20 },
    ], rows);

    sendExcel(res, buffer, `kuryer-sifarisler-${req.params.courierId}.xlsx`);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function getOrderNotes(orderId, companyId) {
  const result = await pool.query(
    `SELECT n.*, u.name AS author_name
     FROM order_notes n
     JOIN users u ON n.user_id = u.id
     WHERE n.order_id = $1 AND n.company_id = $2
     ORDER BY n.created_at ASC`,
    [orderId, companyId]
  );
  return result.rows;
}

router.get('/:id/notes', async (req, res) => {
  try {
    const order = await getOrderById(req.params.id, req.user.company_id, req.user);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!assertCourierOrderAccess(req, order)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    const notes = await getOrderNotes(req.params.id, req.user.company_id);
    res.json(notes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/notes', authorizeRole(['admin', 'courier']), async (req, res) => {
  try {
    const order = await getOrderById(req.params.id, req.user.company_id, req.user);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!assertCourierOrderAccess(req, order)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { body: noteBody } = req.body;
    if (!noteBody || !String(noteBody).trim()) {
      return res.status(400).json({ error: 'Note body required' });
    }

    const result = await pool.query(
      `INSERT INTO order_notes (company_id, order_id, user_id, author_role, body)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        req.user.company_id,
        req.params.id,
        req.user.id,
        req.user.role,
        String(noteBody).trim(),
      ]
    );

    if (req.user.role === 'courier') {
      notifyAdminsOrderNote(
        req.user.company_id,
        req.params.id,
        req.user.id,
        String(noteBody).trim()
      ).catch(() => {});
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const order = await getOrderById(req.params.id, req.user.company_id, req.user);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!assertCourierOrderAccess(req, order)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    const notes = await getOrderNotes(req.params.id, req.user.company_id);
    res.json({ ...order, notes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authorizeRole(['admin']), async (req, res) => {
  try {
    const { customer_id, courier_id, bidons_count, address, price, notes } = req.body;

    if (!customer_id) {
      return res.status(400).json({ error: 'Customer ID required' });
    }

    const customer = await pool.query(
      'SELECT * FROM customers WHERE id = $1 AND company_id = $2',
      [customer_id, req.user.company_id]
    );
    if (customer.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    if (courier_id) {
      const courierOk = await assertCourierInCompany(courier_id, req.user.company_id);
      if (!courierOk) {
        return res.status(400).json({ error: 'Courier not found in your company' });
      }
    }

    const customerData = customer.rows[0];
    const status = courier_id ? 'assigned' : 'pending';

    const result = await pool.query(
      `INSERT INTO orders (
         company_id, customer_id, courier_id, bidons_count, address, price,
         status, notes, full_bidons_given, assigned_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        req.user.company_id,
        customer_id,
        courier_id || null,
        bidons_count ?? 1,
        address || customerData.address,
        price ?? customerData.price,
        status,
        notes ?? null,
        bidons_count ?? 1,
        courier_id ? new Date() : null,
      ]
    );

    const order = result.rows[0];

    if (courier_id) {
      await notifyCourierOnAssign({
        companyId: req.user.company_id,
        orderId: order.id,
        courierId: courier_id,
        previousCourierId: null,
      });
    }

    res.status(201).json(await getOrderById(order.id, req.user.company_id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authorizeRole(['admin']), async (req, res) => {
  try {
    const existing = await getOrderById(req.params.id, req.user.company_id);
    if (!existing) return res.status(404).json({ error: 'Order not found' });

    const { customer_id, courier_id, bidons_count, address, price, status, notes } = req.body;

    if (customer_id) {
      const c = await pool.query(
        'SELECT id FROM customers WHERE id = $1 AND company_id = $2',
        [customer_id, req.user.company_id]
      );
      if (c.rows.length === 0) {
        return res.status(400).json({ error: 'Customer not found' });
      }
    }

    const newCourierId = courier_id !== undefined ? courier_id : existing.courier_id;
    if (newCourierId) {
      const courierOk = await assertCourierInCompany(newCourierId, req.user.company_id);
      if (!courierOk) {
        return res.status(400).json({ error: 'Courier not found in your company' });
      }
    }

    const courierChanged = courier_id !== undefined && courier_id !== existing.courier_id;
    let newStatus = status ?? existing.status;
    if (courierChanged && newCourierId && newStatus === 'pending') {
      newStatus = 'assigned';
    }

    const setAssignedAt = courierChanged && newCourierId;

    await pool.query(
      `UPDATE orders
       SET customer_id = COALESCE($1, customer_id),
           courier_id = $2,
           bidons_count = COALESCE($3, bidons_count),
           address = COALESCE($4, address),
           price = COALESCE($5, price),
           status = $6,
           notes = COALESCE($7, notes),
           full_bidons_given = COALESCE($3, full_bidons_given),
           assigned_at = CASE
             WHEN $10 THEN NOW()
             WHEN $2 IS NULL THEN NULL
             ELSE assigned_at
           END,
           updated_at = NOW()
       WHERE id = $8 AND company_id = $9`,
      [
        customer_id ?? null,
        newCourierId,
        bidons_count ?? null,
        address ?? null,
        price ?? null,
        newStatus,
        notes ?? null,
        req.params.id,
        req.user.company_id,
        setAssignedAt,
      ]
    );

    if (courierChanged && newCourierId) {
      await notifyCourierOnAssign({
        companyId: req.user.company_id,
        orderId: req.params.id,
        courierId: newCourierId,
        previousCourierId: existing.courier_id,
      });
    }

    res.json(await getOrderById(req.params.id, req.user.company_id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/mark-paid', authorizeRole(['admin']), async (req, res) => {
  try {
    const existing = await getOrderById(req.params.id, req.user.company_id);
    if (!existing) return res.status(404).json({ error: 'Order not found' });

    const order = await markOrderAsPaid(req.params.id);
    res.json(await getOrderById(order.id, req.user.company_id));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.put('/:id/done', authorizeRole(['admin']), async (req, res) => {
  try {
    const existing = await getOrderById(req.params.id, req.user.company_id);
    if (!existing) return res.status(404).json({ error: 'Order not found' });

    const order = await completeOrder(req.params.id, {
      payment_type: req.body.payment_type ?? 'cash',
      amount_paid: req.body.amount_paid,
      empty_bidons_returned: req.body.empty_bidons_returned ?? 0,
      full_bidons_given: req.body.full_bidons_given,
      notes: req.body.notes,
    });
    res.json(await getOrderById(order.id, req.user.company_id));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.put('/:id/start', authorizeRole(['courier', 'admin']), async (req, res) => {
  try {
    const existing = await getOrderById(req.params.id, req.user.company_id, req.user);
    if (!existing) return res.status(404).json({ error: 'Order not found' });
    if (!assertCourierOrderAccess(req, existing)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const result = await pool.query(
      `UPDATE orders SET status = 'in_progress', updated_at = NOW()
       WHERE id = $1 AND company_id = $2 AND status IN ('pending', 'assigned')
       RETURNING *`,
      [req.params.id, req.user.company_id]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Order cannot be started' });
    }

    res.json(await getOrderById(req.params.id, req.user.company_id, req.user));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/complete', authorizeRole(['courier', 'admin']), async (req, res) => {
  try {
    const existing = await getOrderById(req.params.id, req.user.company_id, req.user);
    if (!existing) return res.status(404).json({ error: 'Order not found' });
    if (!assertCourierOrderAccess(req, existing)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { payment_type, amount_paid, empty_bidons_returned, full_bidons_given, notes } = req.body;

    if (!payment_type || !['cash', 'card', 'credit'].includes(payment_type)) {
      return res.status(400).json({ error: 'payment_type must be cash, card, or credit' });
    }

    const order = await completeOrder(req.params.id, {
      payment_type,
      amount_paid: amount_paid ?? (payment_type === 'credit' ? 0 : existing.price),
      empty_bidons_returned,
      full_bidons_given: full_bidons_given ?? existing.full_bidons_given ?? existing.bidons_count,
      notes,
    });

    if (req.user.role === 'courier') {
      notifyAdminsOrderCompleted(
        req.user.company_id,
        order.id,
        req.user.id
      ).catch(() => {});
    }

    res.json(await getOrderById(order.id, req.user.company_id, req.user));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.delete('/:id', authorizeRole(['admin']), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM orders WHERE id = $1 AND company_id = $2 RETURNING *',
      [req.params.id, req.user.company_id]
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
