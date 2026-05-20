import express from 'express';
import pool from '../config/database.js';
import { authenticateToken, authorizeRole, requireTenant } from '../middleware/auth.js';
import { buildCompletedOrdersFilter, COMPLETED_ORDER_SELECT } from '../utils/historyQuery.js';
import { buildExcelBuffer, sendExcel } from '../utils/excel.js';

const router = express.Router();

router.use(authenticateToken, requireTenant, authorizeRole(['admin']));

function summarizeOrders(rows) {
  const summary = {
    totalOrders: rows.length,
    totalRevenue: 0,
    cashRevenue: 0,
    cardRevenue: 0,
    creditRevenue: 0,
    unpaidCreditOrders: 0,
    unpaidCreditAmount: 0,
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

  summary.totalRevenue =
    summary.cashRevenue + summary.cardRevenue + summary.creditRevenue;

  return summary;
}

const historyColumns = [
  { header: 'ID', key: 'id', width: 8 },
  { header: 'Müştəri', key: 'customer', width: 22 },
  { header: 'Telefon', key: 'phone', width: 14 },
  { header: 'Ünvan', key: 'address', width: 28 },
  { header: 'Qiymət', key: 'price', width: 10 },
  { header: 'Ödəniş', key: 'payment_type', width: 12 },
  { header: 'Ödənilib', key: 'is_paid', width: 10 },
  { header: 'Ödəniş tarixi', key: 'paid_at', width: 20 },
  { header: 'Kuryer', key: 'courier_name', width: 16 },
  { header: 'Tamamlanma', key: 'completed_at', width: 20 },
];

async function fetchHistory(period, startDate, endDate, companyId) {
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

router.get('/', async (req, res) => {
  try {
    const { period = 'today', startDate, endDate } = req.query;
    const orders = await fetchHistory(
      period,
      startDate,
      endDate,
      req.user.company_id
    );

    res.json({
      period,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      summary: summarizeOrders(orders),
      orders,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/export', async (req, res) => {
  try {
    const { period = 'today', startDate, endDate } = req.query;
    const orders = await fetchHistory(
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
      is_paid: o.is_paid,
      paid_at: o.paid_at,
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
