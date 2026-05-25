import pool from '../config/database.js';
import { sendPushMulticast } from './pushFcm.js';

export async function getAdminDeviceTokens(companyId) {
  const result = await pool.query(
    `SELECT token FROM device_tokens
     WHERE company_id = $1 AND role = 'admin' AND app = 'admin'`,
    [companyId]
  );
  return result.rows.map((r) => r.token);
}

/**
 * Şirkətin bütün admin cihazlarına FCM push.
 */
export async function notifyCompanyAdmins(companyId, { title, body, data = {} }) {
  const tokens = await getAdminDeviceTokens(companyId);
  return sendPushMulticast(tokens, { title, body, data });
}

async function getUserName(userId) {
  const r = await pool.query('SELECT name FROM users WHERE id = $1', [userId]);
  return r.rows[0]?.name ?? 'Kuryer';
}

export async function notifyAdminsOrderCompleted(companyId, orderId, courierUserId) {
  const r = await pool.query(
    `SELECT o.id, o.price, o.amount_paid, o.payment_type,
            c.name AS customer_name, c.surname AS customer_surname
     FROM orders o
     LEFT JOIN customers c ON o.customer_id = c.id
     WHERE o.id = $1 AND o.company_id = $2`,
    [orderId, companyId]
  );
  if (!r.rows.length) return;

  const order = r.rows[0];
  const courierName = await getUserName(courierUserId);
  const customer = [order.customer_name, order.customer_surname]
    .filter(Boolean)
    .join(' ');
  const paid = Number(order.amount_paid ?? order.price ?? 0);

  return notifyCompanyAdmins(companyId, {
    title: 'Sifariş tamamlandı',
    body: `${courierName} — ${customer}, ₼${paid.toFixed(2)}`,
    data: {
      type: 'order_completed',
      order_id: String(orderId),
      screen: 'orders',
    },
  });
}

export async function notifyAdminsExpenseCreated(companyId, expense, courierUserId) {
  const courierName = await getUserName(courierUserId);
  const amount = Number(expense.amount ?? 0);

  return notifyCompanyAdmins(companyId, {
    title: 'Kuryer xərci',
    body: `${courierName}: ${expense.description} — ₼${amount.toFixed(2)}`,
    data: {
      type: 'expense_created',
      expense_id: String(expense.id),
      screen: 'history',
    },
  });
}

export async function notifyAdminsOrderNote(companyId, orderId, courierUserId, noteBody) {
  const courierName = await getUserName(courierUserId);
  const preview =
    noteBody.length > 80 ? `${noteBody.slice(0, 80)}…` : noteBody;

  return notifyCompanyAdmins(companyId, {
    title: 'Yeni qeyd',
    body: `${courierName} sifariş #${orderId}-ə qeyd yazdı: ${preview}`,
    data: {
      type: 'order_note',
      order_id: String(orderId),
      screen: 'orders',
    },
  });
}
