import express from 'express';
import pool from '../config/database.js';
import {
  authenticateToken,
  authorizeRole,
  authorizeCourierSelf,
  requireTenant,
} from '../middleware/auth.js';
import {
  completeOrder,
  recordOrderPayment,
  updateCompletedOrder,
  unpaidOrderAmount,
  maxCompletionPayment,
} from '../utils/orderCompletion.js';
import { notifyCourierOnAssign } from '../lib/notifyCourier.js';
import {
  parseExtrasInput,
  sumExtrasAmount,
  fetchOrderExtras,
  insertOrderExtras,
  replaceOrderExtras,
  adjustWarehouseForExtras,
  formatExtraRow,
} from '../utils/orderExtras.js';
import {
  notifyAdminsOrderCompleted,
  notifyAdminsOrderNote,
} from '../lib/notifyAdmins.js';
import { buildCompletedOrdersFilter, COMPLETED_ORDER_SELECT } from '../utils/historyQuery.js';
import { buildExcelBuffer, sendExcel } from '../utils/excel.js';
import {
  BAKU_TODAY,
  courierVisibleOrdersClause,
  canCourierEditCompletion,
  COURIER_COMPLETION_EDIT_HOURS,
  resolveCourierOrderAccess,
  parseScheduledDateInput,
  normalizeDateOnly,
  toBakuDateTimeString,
} from '../utils/bakuDate.js';
import { normalizeOrderType, isPickupOrder } from '../utils/orderTypes.js';
import { applyCustomerDebtUpdate } from '../utils/customerDebt.js';
import { whatsAppUrl } from '../utils/phone.js';
import { formatCustomerDisplay } from '../utils/customerName.js';

const router = express.Router();

router.use(authenticateToken, requireTenant);

const orderListSelect = `
  SELECT o.*,
         c.name, c.surname, c.phone AS customer_phone, c.phone2 AS customer_phone2,
         c.address AS customer_address, c.active_bidons, c.debt,
         u.name AS courier_name
  FROM orders o
  LEFT JOIN customers c ON o.customer_id = c.id
  LEFT JOIN users u ON o.courier_id = u.id
`;

async function attachExtrasToOrders(orders, companyId) {
  const ids = orders.map((o) => o.id);
  const extrasMap = await fetchOrderExtras(ids, companyId);
  return orders.map((order) => ({
    ...order,
    extras: extrasMap.get(order.id) ?? [],
  }));
}

function enrichOrderRow(order, user = null) {
  if (!order) return order;
  const orderPrice = Number(order.price ?? 0);
  const orderAmountPaid = Number(order.amount_paid ?? 0);
  const debtPaidAtCompletion = Number(order.debt_paid_at_completion ?? 0);
  const customerDebt = order.debt != null ? Number(order.debt) : undefined;
  const prepaidAmount = Number(order.prepaid_amount ?? 0);
  const orderDue = Math.max(0, orderPrice - prepaidAmount);

  const row = {
    ...order,
    customer_display_name: formatCustomerDisplay({
      name: order.name,
      surname: order.surname,
    }),
    whatsapp_url: whatsAppUrl(order.customer_phone),
    whatsapp_url_phone2: whatsAppUrl(order.customer_phone2),
    scheduled_date: normalizeDateOnly(order.scheduled_date),
    assigned_at_baku: order.assigned_at
      ? toBakuDateTimeString(order.assigned_at)
      : null,
    completed_at_baku: order.completed_at
      ? toBakuDateTimeString(order.completed_at)
      : null,
    remaining_amount: unpaidOrderAmount(orderPrice, orderAmountPaid),
    customer_debt: customerDebt,
    debt_paid_at_completion: debtPaidAtCompletion,
    total_collected: orderAmountPaid + debtPaidAtCompletion,
    is_prepaid: Boolean(order.is_prepaid),
    prepaid_amount: prepaidAmount,
    unit_price: order.unit_price != null ? Number(order.unit_price) : undefined,
    extras: (order.extras ?? []).map((item) =>
      item.label ? item : formatExtraRow(item)
    ),
    max_completion_payment:
      order.status !== 'completed' && customerDebt != null
        ? orderDue + customerDebt
        : undefined,
  };
  return user?.role === 'courier' ? enrichOrderForUser(row, user) : row;
}

function enrichOrderForUser(order, user) {
  if (!order || user?.role !== 'courier') return order;

  const editable = canCourierEditCompletion(order);
  const editableUntil = order.completed_at
    ? new Date(
        new Date(order.completed_at).getTime() +
          COURIER_COMPLETION_EDIT_HOURS * 60 * 60 * 1000
      ).toISOString()
    : null;

  return {
    ...order,
    courier_editable: editable,
    courier_editable_until: editable ? editableUntil : null,
  };
}

async function fetchOrderById(id, companyId) {
  const result = await pool.query(
    `${orderListSelect} WHERE o.id = $1 AND o.company_id = $2`,
    [id, companyId]
  );
  return result.rows[0] ?? null;
}

async function getOrderById(id, companyId, user = null) {
  let query = `${orderListSelect} WHERE o.id = $1 AND o.company_id = $2`;
  const params = [id, companyId];

  if (user?.role === 'courier') {
    params.push(user.id);
    query += ` AND o.courier_id = $${params.length}`;
    query += ` AND ${courierVisibleOrdersClause('o')}`;
  }

  const result = await pool.query(query, params);
  const row = result.rows[0] ?? null;
  if (!row) return null;
  const [withExtras] = await attachExtrasToOrders([row], companyId);
  return enrichOrderRow(withExtras, user);
}

async function assertCourierInCompany(courierId, companyId) {
  if (!courierId) return true;
  const r = await pool.query(
    `SELECT id FROM users WHERE id = $1 AND company_id = $2 AND role = 'courier'`,
    [courierId, companyId]
  );
  return r.rows.length > 0;
}

async function applyAdminCourierFilter(query, params, courierIdRaw, companyId) {
  if (courierIdRaw == null || courierIdRaw === '') {
    return query;
  }

  const value = String(courierIdRaw).trim().toLowerCase();
  if (value === 'unassigned' || value === 'none') {
    return `${query} AND o.courier_id IS NULL`;
  }

  const courierId = Number(courierIdRaw);
  if (!Number.isFinite(courierId)) {
    throw Object.assign(new Error('Invalid courier_id'), { status: 400 });
  }

  const ok = await assertCourierInCompany(courierId, companyId);
  if (!ok) {
    throw Object.assign(new Error('Courier not found'), { status: 404 });
  }

  params.push(courierId);
  return `${query} AND o.courier_id = $${params.length}`;
}

function respondCourierAccess(res, access) {
  return res.status(access.status).json({ error: access.error, code: access.code });
}

function checkCourierAccess(user, order, options = {}) {
  return resolveCourierOrderAccess(user, order, options);
}

router.get('/', async (req, res) => {
  try {
    const { status, courier_id, completedToday } = req.query;
    let query = `${orderListSelect} WHERE o.company_id = $1`;
    const params = [req.user.company_id];

    if (req.user.role === 'courier') {
      params.push(req.user.id);
      query += ` AND o.courier_id = $${params.length}`;
      query += ` AND ${courierVisibleOrdersClause('o')}`;
    } else {
      query = await applyAdminCourierFilter(
        query,
        params,
        courier_id,
        req.user.company_id
      );
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
    const withExtras = await attachExtrasToOrders(result.rows, req.user.company_id);
    const rows = withExtras.map((r) =>
      enrichOrderRow(r, req.user.role === 'courier' ? req.user : null)
    );
    res.json(rows);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
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
      query += ` AND ${courierVisibleOrdersClause('o')}`;
    }
    query += ' ORDER BY o.created_at DESC';

    const result = await pool.query(query, [
      req.params.courierId,
      req.user.company_id,
    ]);
    const rows = result.rows.map((r) =>
      enrichOrderRow(r, req.user.role === 'courier' ? req.user : null)
    );
    res.json(rows);
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
    const order = await fetchOrderById(req.params.id, req.user.company_id);
    if (!order) return res.status(404).json({ error: 'Order not found', code: 'ORDER_NOT_FOUND' });
    if (req.user.role === 'courier') {
      const access = checkCourierAccess(req.user, order);
      if (!access.allowed) return respondCourierAccess(res, access);
    }
    const notes = await getOrderNotes(req.params.id, req.user.company_id);
    res.json(notes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/notes', authorizeRole(['admin', 'courier']), async (req, res) => {
  try {
    const order = await fetchOrderById(req.params.id, req.user.company_id);
    if (!order) return res.status(404).json({ error: 'Order not found', code: 'ORDER_NOT_FOUND' });
    if (req.user.role === 'courier') {
      const access = checkCourierAccess(req.user, order);
      if (!access.allowed) return respondCourierAccess(res, access);
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
    if (!order) return res.status(404).json({ error: 'Order not found', code: 'ORDER_NOT_FOUND' });
    const notes = await getOrderNotes(req.params.id, req.user.company_id);
    res.json({ ...order, notes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authorizeRole(['admin']), async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      customer_id,
      courier_id,
      bidons_count,
      address,
      price,
      unit_price,
      notes,
      order_type,
      scheduled_date,
      debt,
      extras,
      is_prepaid,
      prepaid_amount,
    } = req.body;

    if (!customer_id) {
      return res.status(400).json({ error: 'Customer ID required' });
    }

    const type = normalizeOrderType(order_type);
    const scheduled = parseScheduledDateInput(scheduled_date);
    const parsedExtras = parseExtrasInput(extras);
    const extrasTotal = sumExtrasAmount(parsedExtras);

    const customer = await client.query(
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
    const finalBidons = bidons_count ?? 1;
    const isPickup = type === 'pickup';

    let waterPrice = 0;
    let finalUnitPrice = 0;
    if (!isPickup) {
      if (unit_price != null && unit_price !== '') {
        finalUnitPrice = Number(unit_price);
        waterPrice = Number((finalUnitPrice * finalBidons).toFixed(2));
      } else if (price != null && price !== '') {
        waterPrice = Number(price);
        finalUnitPrice =
          finalBidons > 0
            ? Number((waterPrice / finalBidons).toFixed(2))
            : Number(customerData.price ?? 0);
      } else {
        finalUnitPrice = Number(customerData.price ?? 0);
        waterPrice = Number((finalUnitPrice * finalBidons).toFixed(2));
      }
    }

    const finalPrice = isPickup ? 0 : Number((waterPrice + extrasTotal).toFixed(2));
    const fullBidonsGiven = isPickup ? 0 : finalBidons;
    const prepaid = Boolean(is_prepaid);
    const prepaidValue = prepaid ? Number(prepaid_amount ?? finalPrice) : 0;
    if (prepaid && (!Number.isFinite(prepaidValue) || prepaidValue < 0)) {
      return res.status(400).json({ error: 'prepaid_amount must be a non-negative number' });
    }
    const isPaid = prepaid && prepaidValue >= finalPrice;

    await client.query('BEGIN');

    if (debt !== undefined && debt !== null && debt !== '') {
      await applyCustomerDebtUpdate(client, {
        companyId: req.user.company_id,
        customerId: customer_id,
        newDebt: debt,
        recordedBy: req.user.id,
      });
    }

    const result = await client.query(
      `INSERT INTO orders (
         company_id, customer_id, courier_id, bidons_count, address, price, unit_price,
         status, notes, full_bidons_given, assigned_at, order_type, scheduled_date,
         is_prepaid, prepaid_amount, amount_paid, is_paid, paid_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::date, $14, $15, $16, $17, $18)
       RETURNING *`,
      [
        req.user.company_id,
        customer_id,
        courier_id || null,
        finalBidons,
        address || customerData.address,
        finalPrice,
        isPickup ? null : finalUnitPrice,
        status,
        notes ?? null,
        fullBidonsGiven,
        courier_id ? new Date() : null,
        type,
        scheduled,
        prepaid,
        prepaidValue,
        prepaid ? prepaidValue : null,
        isPaid,
        isPaid ? new Date() : null,
      ]
    );

    const order = result.rows[0];

    if (parsedExtras.length) {
      await insertOrderExtras(client, req.user.company_id, order.id, parsedExtras);
      await adjustWarehouseForExtras(client, req.user.company_id, parsedExtras, -1);
    }

    await client.query('COMMIT');

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
    await client.query('ROLLBACK');
    res.status(err.status || 500).json({
      error: err.message,
      code: err.code ?? undefined,
    });
  } finally {
    client.release();
  }
});

router.put('/:id', authorizeRole(['admin']), async (req, res) => {
  try {
    const existing = await getOrderById(req.params.id, req.user.company_id);
    if (!existing) return res.status(404).json({ error: 'Order not found' });

    const { customer_id, courier_id, bidons_count, address, price, status, notes, scheduled_date, order_type } = req.body;

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

    const setAssignedAt = Boolean(courierChanged && newCourierId);
    const clearAssignedAt = courier_id !== undefined && !newCourierId;

    let scheduledDateClause = '';
    const updateParams = [
      customer_id ?? null,
      newCourierId ?? null,
      bidons_count ?? null,
      address ?? null,
      price ?? null,
      newStatus,
      notes ?? null,
      req.params.id,
      req.user.company_id,
      setAssignedAt,
      clearAssignedAt,
    ];

    if (scheduled_date !== undefined) {
      const scheduled = parseScheduledDateInput(scheduled_date);
      updateParams.push(scheduled);
      scheduledDateClause = `, scheduled_date = $${updateParams.length}::date`;
    }

    let orderTypeClause = '';
    if (order_type !== undefined) {
      const type = normalizeOrderType(order_type);
      updateParams.push(type);
      orderTypeClause = `, order_type = $${updateParams.length}`;
      if (type === 'pickup') {
        updateParams.push(0);
        orderTypeClause += `, price = $${updateParams.length}, full_bidons_given = 0`;
      }
    }

    await pool.query(
      `UPDATE orders
       SET customer_id = COALESCE($1::int, customer_id),
           courier_id = $2::int,
           bidons_count = COALESCE($3::int, bidons_count),
           address = COALESCE($4::text, address),
           price = COALESCE($5::numeric, price),
           status = $6::varchar,
           notes = COALESCE($7::text, notes),
           full_bidons_given = COALESCE($3::int, full_bidons_given),
           assigned_at = CASE
             WHEN $10::boolean THEN NOW()
             WHEN $11::boolean THEN NULL
             ELSE assigned_at
           END${scheduledDateClause}${orderTypeClause},
           updated_at = NOW()
       WHERE id = $8::int AND company_id = $9::int`,
      updateParams
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
    res.status(err.status || 500).json({
      error: err.message,
      code: err.code ?? undefined,
    });
  }
});

router.put('/:id/mark-paid', authorizeRole(['admin']), async (req, res) => {
  try {
    const existing = await getOrderById(req.params.id, req.user.company_id);
    if (!existing) return res.status(404).json({ error: 'Order not found' });

    const { amount } = req.body;
    const result = await recordOrderPayment(req.params.id, {
      amount,
      recordedBy: req.user.id,
    });

    res.json({
      order: await getOrderById(result.order.id, req.user.company_id),
      debt_payment: result.debt_payment,
      customer_debt: result.customer_debt,
      paid_amount: result.paid_amount,
      order_remaining: result.order_remaining,
    });
  } catch (err) {
    res.status(err.status || 500).json({
      error: err.message,
      code: err.code ?? undefined,
    });
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
      recordedBy: req.user.id,
    });
    res.json(await getOrderById(order.id, req.user.company_id));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.put('/:id/start', authorizeRole(['courier', 'admin']), async (req, res) => {
  try {
    const existing = await fetchOrderById(req.params.id, req.user.company_id);
    if (!existing) return res.status(404).json({ error: 'Order not found', code: 'ORDER_NOT_FOUND' });
    if (req.user.role === 'courier') {
      const access = checkCourierAccess(req.user, existing);
      if (!access.allowed) return respondCourierAccess(res, access);
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
    const existing = await fetchOrderById(req.params.id, req.user.company_id);
    if (!existing) return res.status(404).json({ error: 'Order not found', code: 'ORDER_NOT_FOUND' });
    if (req.user.role === 'courier') {
      const access = checkCourierAccess(req.user, existing);
      if (!access.allowed) return respondCourierAccess(res, access);
    }

    if (isPickupOrder(existing)) {
      const { empty_bidons_returned, notes } = req.body;
      const order = await completeOrder(req.params.id, {
        empty_bidons_returned,
        notes,
      });

      if (req.user.role === 'courier') {
        notifyAdminsOrderCompleted(
          req.user.company_id,
          order.id,
          req.user.id
        ).catch(() => {});
      }

      return res.json(await getOrderById(order.id, req.user.company_id, req.user));
    }

    const { payment_type, amount_paid, empty_bidons_returned, full_bidons_given, notes } = req.body;

    if (!payment_type || !['cash', 'card', 'credit'].includes(payment_type)) {
      return res.status(400).json({ error: 'payment_type must be cash, card, or credit' });
    }

    const orderPrice = Number(existing.price);
    const customerDebt = Number(existing.debt ?? 0);
    const prepaidAmount = Number(existing.prepaid_amount ?? 0);
    const paid =
      amount_paid != null
        ? Number(amount_paid)
        : payment_type === 'credit'
          ? 0
          : Math.max(0, orderPrice - prepaidAmount);

    if (!Number.isFinite(paid) || paid < 0) {
      return res.status(400).json({ error: 'amount_paid must be a non-negative number' });
    }

    const maxPay = maxCompletionPayment(orderPrice, customerDebt, payment_type, prepaidAmount);
    if (payment_type !== 'credit' && paid > maxPay + 0.001) {
      return res.status(400).json({
        error: `amount_paid cannot exceed order price + customer debt (${maxPay} AZN)`,
        code: 'AMOUNT_EXCEEDS_PAYABLE',
      });
    }

    const order = await completeOrder(req.params.id, {
      payment_type,
      amount_paid: paid,
      empty_bidons_returned,
      full_bidons_given: full_bidons_given ?? existing.full_bidons_given ?? existing.bidons_count,
      notes,
      recordedBy: req.user.id,
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

router.patch('/:id/completion', authorizeRole(['courier']), async (req, res) => {
  try {
    const existing = await fetchOrderById(req.params.id, req.user.company_id);
    if (!existing) return res.status(404).json({ error: 'Order not found', code: 'ORDER_NOT_FOUND' });

    const access = checkCourierAccess(req.user, existing, { requireEditable: true });
    if (!access.allowed) return respondCourierAccess(res, access);

    if (isPickupOrder(existing)) {
      const order = await updateCompletedOrder(req.params.id, req.user.id, {
        empty_bidons_returned: req.body.empty_bidons_returned,
        notes: req.body.notes,
      });
      return res.json(await getOrderById(order.id, req.user.company_id, req.user));
    }

    const {
      payment_type,
      amount_paid,
      empty_bidons_returned,
      full_bidons_given,
      notes,
      price,
    } = req.body;

    const order = await updateCompletedOrder(req.params.id, req.user.id, {
      payment_type: payment_type ?? existing.payment_type,
      amount_paid,
      empty_bidons_returned,
      full_bidons_given,
      notes,
      price,
    });

    res.json(await getOrderById(order.id, req.user.company_id, req.user));
  } catch (err) {
    res.status(err.status || 500).json({
      error: err.message,
      code: err.code ?? undefined,
    });
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
