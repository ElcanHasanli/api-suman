import express from 'express';
import pool from '../config/database.js';
import { authenticateToken, authorizeRole, requireTenant } from '../middleware/auth.js';
import { buildCompletedOrdersFilter, COMPLETED_ORDER_SELECT } from '../utils/historyQuery.js';
import { buildDateFilter } from '../utils/periodFilter.js';
import { buildExcelBuffer, sendExcel } from '../utils/excel.js';
const router = express.Router();

router.use(authenticateToken, requireTenant, authorizeRole(['admin']));

function summarizeOrders(rows) {
  const summary = {
    totalOrders: rows.length,
    cashRevenue: 0,
    cardRevenue: 0,
    creditRevenue: 0,
    unpaidCreditOrders: 0,
    unpaidCreditAmount: 0,
    orderRevenue: 0,
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
        summary.unpaidCreditAmount += Math.max(0, orderPrice - amountPaid);
      }
    }
  }

  summary.orderRevenue =
    summary.cashRevenue + summary.cardRevenue + summary.creditRevenue;

  return summary;
}

async function fetchHistoryOrders(period, startDate, endDate, companyId) {
  const { clause, params } = buildCompletedOrdersFilter(
    period,
    startDate,
    endDate,
    companyId
  );
  const query = `${COMPLETED_ORDER_SELECT} WHERE ${clause} ORDER BY o.completed_at DESC`;
  const result = await pool.query(query, params);
  return result.rows;
}

async function fetchExpenses(period, startDate, endDate, companyId) {
  let query = `
    SELECT e.*, u.name AS courier_name
    FROM expenses e
    JOIN users u ON e.courier_id = u.id
    WHERE e.company_id = $1`;
  const params = [companyId];
  const df = buildDateFilter('e.created_at', period, startDate, endDate, params);
  query += df.clause + ' ORDER BY e.created_at DESC';
  const result = await pool.query(query, df.params);
  return result.rows;
}

async function fetchDebtPayments(period, startDate, endDate, companyId) {
  let query = `
    SELECT dp.*, c.name AS customer_name, c.surname AS customer_surname,
           u.name AS recorded_by_name
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

function buildFullSummary(orderSummary, expenses, debtPayments) {
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const debtCollected = debtPayments.reduce((s, d) => s + Number(d.amount), 0);

  orderSummary.debtCollected = debtCollected;
  orderSummary.totalRevenue = orderSummary.orderRevenue + debtCollected;
  orderSummary.totalExpenses = totalExpenses;
  orderSummary.netRevenue = orderSummary.totalRevenue - totalExpenses;

  return orderSummary;
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

router.get('/', async (req, res) => {
  try {
    const { period = 'today', startDate, endDate } = req.query;
    const companyId = req.user.company_id;

    const [orders, expenses, debtPayments] = await Promise.all([
      fetchHistoryOrders(period, startDate, endDate, companyId),
      fetchExpenses(period, startDate, endDate, companyId),
      fetchDebtPayments(period, startDate, endDate, companyId),
    ]);

    const summary = buildFullSummary(summarizeOrders(orders), expenses, debtPayments);

    res.json({
      period,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      summary,
      orders,
      expenses,
      debtPayments,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/export', async (req, res) => {
  try {
    const { period = 'today', startDate, endDate } = req.query;
    const orders = await fetchHistoryOrders(
      period,
      startDate,
      endDate,
      req.user.company_id
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
