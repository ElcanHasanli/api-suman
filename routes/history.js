import express from 'express';
import pool from '../config/database.js';
import { authenticateToken, authorizeRole, requireTenant } from '../middleware/auth.js';
import { buildCompletedOrdersFilter, COMPLETED_ORDER_SELECT } from '../utils/historyQuery.js';
import { buildDateFilter } from '../utils/periodFilter.js';
import { buildExcelBuffer, sendExcel } from '../utils/excel.js';
import { formatExpenseRow } from '../utils/expenseFormat.js';
import { unpaidOrderAmount } from '../utils/orderCompletion.js';
import { normalizeDateOnly, toBakuDateTimeString } from '../utils/bakuDate.js';
import {
  buildHistoryDashboard,
  buildPerCourierDashboard,
} from '../utils/historyDashboard.js';
import { fetchOrderExtras } from '../utils/orderExtras.js';
import {
  fetchCompanyDepositTotal,
  mapDepositEntry,
} from '../utils/customerDeposit.js';

const router = express.Router();

router.use(authenticateToken, requireTenant, authorizeRole(['admin']));

function mapHistoryOrder(row) {
  const orderAmountPaid = Number(row.amount_paid ?? 0);
  const debtPaidAtCompletion = Number(row.debt_paid_at_completion ?? 0);

  return {
    ...row,
    scheduled_date: normalizeDateOnly(row.scheduled_date),
    assigned_at_baku: row.assigned_at ? toBakuDateTimeString(row.assigned_at) : null,
    completed_at_baku: row.completed_at ? toBakuDateTimeString(row.completed_at) : null,
    remaining_amount: unpaidOrderAmount(row.price, row.amount_paid),
    customer_debt: row.customer_debt != null ? Number(row.customer_debt) : null,
    debt_paid_at_completion: debtPaidAtCompletion,
    total_collected: orderAmountPaid + debtPaidAtCompletion,
    is_prepaid: Boolean(row.is_prepaid),
    prepaid_amount: Number(row.prepaid_amount ?? 0),
    unit_price: row.unit_price != null ? Number(row.unit_price) : null,
    extras: row.extras ?? [],
  };
}

function summarizeOrders(rows) {
  const summary = {
    totalOrders: rows.length,
    cashRevenue: 0,
    cardRevenue: 0,
    creditRevenue: 0,
    unpaidCreditOrders: 0,
    unpaidCreditAmount: 0,
    orderRevenue: 0,
    salesRevenue: 0,
    debtCollected: 0,
    totalRevenue: 0,
    totalExpenses: 0,
    netRevenue: 0,
  };

  for (const row of rows) {
    const orderPrice = Number(row.price ?? 0);
    const amountPaid = Number(row.amount_paid ?? 0);

    if (row.payment_type === 'cash') {
      summary.cashRevenue += amountPaid;
    } else if (row.payment_type === 'card') {
      summary.cardRevenue += amountPaid;
    } else if (row.payment_type === 'credit') {
      if (row.is_paid) {
        summary.creditRevenue += orderPrice;
      } else {
        summary.unpaidCreditOrders += 1;
        summary.unpaidCreditAmount += unpaidOrderAmount(orderPrice, amountPaid);
      }
    }

    if (!row.is_paid) {
      const remaining = unpaidOrderAmount(orderPrice, amountPaid);
      if (remaining > 0 && row.payment_type !== 'credit') {
        summary.unpaidCreditOrders += 1;
        summary.unpaidCreditAmount += remaining;
      }
    }
  }

  summary.orderRevenue =
    summary.cashRevenue + summary.cardRevenue + summary.creditRevenue;

  return summary;
}

function buildFullSummary(orderSummary, expenses, debtPayments) {
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  /** Yalnız kuryerin müştəridən aldığı borc (admin sıfırlama daxil deyil) */
  const debtCollected = debtPayments
    .filter((d) => d.recorded_by_role === 'courier')
    .reduce((s, d) => s + Number(d.amount), 0);

  orderSummary.debtCollected = debtCollected;
  orderSummary.salesRevenue = orderSummary.orderRevenue;
  orderSummary.totalRevenue = orderSummary.orderRevenue + debtCollected;
  orderSummary.totalExpenses = totalExpenses;
  orderSummary.netRevenue = orderSummary.totalRevenue - totalExpenses;

  return orderSummary;
}

async function fetchHistoryOrders(period, startDate, endDate, companyId, courierId = null) {
  const { clause, params } = buildCompletedOrdersFilter(
    period,
    startDate,
    endDate,
    companyId
  );

  let query = `${COMPLETED_ORDER_SELECT} WHERE ${clause}`;
  const queryParams = [...params];

  if (courierId) {
    queryParams.push(courierId);
    query += ` AND o.courier_id = $${queryParams.length}`;
  }

  query += ' ORDER BY o.completed_at DESC';
  const result = await pool.query(query, queryParams);
  const ids = result.rows.map((row) => row.id);
  const extrasMap = await fetchOrderExtras(ids, companyId);

  return result.rows.map((row) => ({
    ...row,
    extras: extrasMap.get(row.id) ?? [],
  }));
}

async function fetchExpenses(period, startDate, endDate, companyId, courierId = null) {
  let query = `
    SELECT e.*, u.name AS courier_name
    FROM expenses e
    LEFT JOIN users u ON e.courier_id = u.id
    WHERE e.company_id = $1`;
  const params = [companyId];

  if (courierId) {
    params.push(courierId);
    query += ` AND e.courier_id = $${params.length}`;
  }

  const df = buildDateFilter('e.created_at', period, startDate, endDate, params);
  query += df.clause + ' ORDER BY e.created_at DESC';
  const result = await pool.query(query, df.params);
  return result.rows.map(formatExpenseRow);
}

async function fetchDebtPayments(period, startDate, endDate, companyId) {
  let query = `
    SELECT dp.*, c.name AS customer_name, c.surname AS customer_surname,
           u.name AS recorded_by_name, u.role AS recorded_by_role
    FROM debt_payments dp
    JOIN customers c ON dp.customer_id = c.id
    JOIN users u ON dp.recorded_by = u.id
    WHERE dp.company_id = $1`;
  const params = [companyId];
  const df = buildDateFilter('dp.created_at', period, startDate, endDate, params);
  query += df.clause + ' ORDER BY dp.created_at DESC';
  const result = await pool.query(query, df.params);
  return result.rows;
}

async function fetchDepositEntries(period, startDate, endDate, companyId) {
  let query = `
    SELECT de.*, u.name AS recorded_by_name
    FROM deposit_entries de
    LEFT JOIN users u ON u.id = de.recorded_by
    WHERE de.company_id = $1`;
  const params = [companyId];
  const df = buildDateFilter('de.created_at', period, startDate, endDate, params);
  query += df.clause + ' ORDER BY de.created_at DESC';
  const result = await pool.query(query, df.params);
  return result.rows.map(mapDepositEntry);
}

async function fetchCouriers(companyId) {
  const result = await pool.query(
    `SELECT id, name FROM users
     WHERE company_id = $1 AND role = 'courier'
     ORDER BY name ASC`,
    [companyId]
  );
  return result.rows;
}

const historyColumns = [
  { header: 'ID', key: 'id', width: 8 },
  { header: 'Müştəri', key: 'customer', width: 22 },
  { header: 'Telefon', key: 'phone', width: 14 },
  { header: 'Ünvan', key: 'address', width: 28 },
  { header: 'Qiymət', key: 'price', width: 10 },
  { header: 'Ödəniş', key: 'payment_type', width: 12 },
  { header: 'Kuryer', key: 'courier_name', width: 16 },
  { header: 'Tamamlanma', key: 'completed_at', width: 20 },
];

router.get('/dashboard', async (req, res) => {
  try {
    const { period = 'today', startDate, endDate, courier_id: courierId } = req.query;
    const companyId = req.user.company_id;

    const [orders, expenses, debtPayments, depositEntries, depositTotals, couriers] =
      await Promise.all([
        fetchHistoryOrders(period, startDate, endDate, companyId, courierId || null),
        fetchExpenses(period, startDate, endDate, companyId, courierId || null),
        fetchDebtPayments(period, startDate, endDate, companyId),
        fetchDepositEntries(period, startDate, endDate, companyId),
        fetchCompanyDepositTotal(companyId),
        fetchCouriers(companyId),
      ]);

    const dashboard = buildHistoryDashboard({
      orders,
      debtPayments,
      expenses,
      depositEntries,
      depositCurrentTotal: depositTotals.current_total,
      courierId: courierId || null,
    });

    res.json({
      period,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      courier_id: courierId ? Number(courierId) : null,
      couriers,
      dashboard,
      by_courier: courierId ? null : buildPerCourierDashboard({ orders, debtPayments, expenses }),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const { period = 'today', startDate, endDate, courier_id: courierId } = req.query;
    const companyId = req.user.company_id;

    const [orders, expenses, debtPayments, depositEntries, depositTotals, couriers] =
      await Promise.all([
        fetchHistoryOrders(period, startDate, endDate, companyId, courierId || null),
        fetchExpenses(period, startDate, endDate, companyId, courierId || null),
        fetchDebtPayments(period, startDate, endDate, companyId),
        fetchDepositEntries(period, startDate, endDate, companyId),
        fetchCompanyDepositTotal(companyId),
        fetchCouriers(companyId),
      ]);

    const summary = buildFullSummary(summarizeOrders(orders), expenses, debtPayments);
    const dashboard = buildHistoryDashboard({
      orders,
      debtPayments,
      expenses,
      depositEntries,
      depositCurrentTotal: depositTotals.current_total,
      courierId: courierId || null,
    });

    res.json({
      period,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      courier_id: courierId ? Number(courierId) : null,
      couriers,
      summary,
      dashboard,
      by_courier: courierId ? null : buildPerCourierDashboard({ orders, debtPayments, expenses }),
      orders: orders.map(mapHistoryOrder),
      expenses,
      debtPayments,
      depositEntries,
      deposit_totals: depositTotals,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/export', async (req, res) => {
  try {
    const { period = 'today', startDate, endDate, courier_id: courierId } = req.query;
    const orders = await fetchHistoryOrders(
      period,
      startDate,
      endDate,
      req.user.company_id,
      courierId || null
    );

    const rows = orders.map((o) => ({
      id: o.id,
      customer: [o.customer_name, o.customer_surname].filter(Boolean).join(' '),
      phone: o.customer_phone,
      address: o.address,
      price: o.price,
      payment_type: o.payment_type,
      courier_name: o.courier_name,
      completed_at: o.completed_at,
    }));

    const buffer = await buildExcelBuffer('Tarixcə', historyColumns, rows);
    sendExcel(res, buffer, `tarixce-${period}.xlsx`);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
