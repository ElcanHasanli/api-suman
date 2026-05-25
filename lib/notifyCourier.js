import pool from '../config/database.js';
import { sendPushToUser } from './pushFcm.js';

/**
 * Kuryer təyin olunanda bildiriş + opsional FCM push.
 * Eyni kuryerə təkrar assign → bildiriş getmir.
 */
export async function notifyCourierOnAssign({
  companyId,
  orderId,
  courierId,
  previousCourierId = null,
}) {
  const newId = courierId ? Number(courierId) : null;
  const prevId = previousCourierId ? Number(previousCourierId) : null;

  if (!newId) return null;
  if (prevId === newId) return null;

  const orderResult = await pool.query(
    `SELECT o.id, o.address, o.bidons_count,
            c.name AS customer_name, c.surname AS customer_surname
     FROM orders o
     LEFT JOIN customers c ON o.customer_id = c.id
     WHERE o.id = $1 AND o.company_id = $2`,
    [orderId, companyId]
  );

  if (orderResult.rows.length === 0) return null;

  const order = orderResult.rows[0];
  const customerLabel = [order.customer_name, order.customer_surname]
    .filter(Boolean)
    .join(' ');

  const message = prevId
    ? `Sizə sifariş #${orderId} təyin edildi — ${customerLabel || 'Müştəri'}`
    : `Yeni sifariş #${orderId} — ${customerLabel || 'Müştəri'}`;

  const notifResult = await pool.query(
    `INSERT INTO notifications (user_id, order_id, type, message)
     VALUES ($1, $2, 'order_assigned', $3)
     RETURNING *`,
    [newId, orderId, message]
  );

  const notification = notifResult.rows[0];

  await sendPushToUser(newId, {
    title: 'Yeni sifariş',
    body: message,
    data: {
      type: 'order_assigned',
      order_id: String(orderId),
      notification_id: String(notification.id),
      screen: 'orders',
    },
    app: 'courier',
  });

  return notification;
}

/** @deprecated notifyCourierOnAssign istifadə edin */
export async function notifyCourierAssignment(courierId, orderId, message) {
  if (!courierId) return;
  await pool.query(
    `INSERT INTO notifications (user_id, order_id, type, message)
     VALUES ($1, $2, 'order_assigned', $3)`,
    [courierId, orderId, message]
  );
}
