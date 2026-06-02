import pool from '../config/database.js';
import { sendPushMulticast } from './pushFcm.js';
import { inactivityPeriodLabel } from '../utils/customerInactivityConfig.js';

export async function getAdminDeviceTokens(companyId) {
  const result = await pool.query(
    `SELECT token FROM device_tokens
     WHERE company_id = $1 AND role = 'admin' AND app = 'admin'`,
    [companyId]
  );
  return result.rows.map((r) => r.token);
}

async function getAdminUsers(companyId) {
  const result = await pool.query(
    `SELECT id FROM users
     WHERE company_id = $1 AND role = 'admin' AND status = 'active'`,
    [companyId]
  );
  return result.rows.map((r) => r.id);
}

export async function createInAppAdminNotification(companyId, { message, type, orderId = null }) {
  const adminIds = await getAdminUsers(companyId);
  if (!adminIds.length) return { created: 0 };

  await Promise.all(
    adminIds.map((adminId) =>
      pool.query(
        `INSERT INTO notifications (user_id, order_id, type, message)
         VALUES ($1, $2, $3, $4)`,
        [adminId, orderId, type, message]
      )
    )
  );

  return { created: adminIds.length };
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

  await createInAppAdminNotification(companyId, {
    message: `${courierName} — ${customer}, ₼${paid.toFixed(2)}`,
    type: 'order_completed',
    orderId,
  });

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

  await createInAppAdminNotification(companyId, {
    message: `${courierName}: ${expense.description} — ₼${amount.toFixed(2)}`,
    type: 'expense_created',
    orderId: null,
  });

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

export async function notifyAdminsWarehouseUpdated(companyId, update, courierUserId) {
  const courierName = await getUserName(courierUserId);
  const remFull = Number(update.remaining_full ?? 0);
  const remEmpty = Number(update.remaining_empty ?? 0);
  const emptyIn = Number(update.empty_in ?? 0);
  const fullIn = Number(update.full_in ?? 0);
  const fullOut = Number(update.full_out ?? 0);

  const body = `${courierName}: +${emptyIn} boş, +${fullIn} dolu, −${fullOut} dolu → anbarda ${remFull} dolu, ${remEmpty} boş`;

  await createInAppAdminNotification(companyId, {
    message: body,
    type: 'warehouse_updated',
    orderId: null,
  });

  return notifyCompanyAdmins(companyId, {
    title: 'Su doldurma anbarı',
    body,
    data: {
      type: 'warehouse_updated',
      warehouse_update_id: String(update.id),
      screen: 'warehouse',
    },
  });
}

export async function notifyAdminsOrderNote(companyId, orderId, courierUserId, noteBody) {
  const courierName = await getUserName(courierUserId);
  const preview =
    noteBody.length > 80 ? `${noteBody.slice(0, 80)}…` : noteBody;

  await createInAppAdminNotification(companyId, {
    message: `${courierName} sifariş #${orderId}-ə qeyd yazdı: ${preview}`,
    type: 'order_note',
    orderId,
  });

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

export async function notifyAdminsCustomerInactive(companyId, customer) {
  const fullName = [customer.name, customer.surname].filter(Boolean).join(' ');
  const label = fullName || `Müştəri #${customer.id}`;
  const lastAt = customer.last_order_at;
  const lastLabel = lastAt
    ? new Date(lastAt).toLocaleString('az-AZ', { timeZone: 'Asia/Baku' })
    : '—';
  const period = inactivityPeriodLabel();
  const message = `${label} ${period} sifariş verməyib (son: ${lastLabel})`;

  await createInAppAdminNotification(companyId, {
    message,
    type: 'customer_inactive',
    orderId: null,
  });

  return notifyCompanyAdmins(companyId, {
    title: 'Passiv müştəri',
    body: message,
    data: {
      type: 'customer_inactive',
      customer_id: String(customer.id),
      screen: 'customers',
      last_order_at: lastAt ? String(lastAt) : '',
    },
  });
}
