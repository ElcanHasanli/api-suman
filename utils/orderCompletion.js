import pool from '../config/database.js';

function paymentStatusOnComplete(payment_type) {
  const isPaid = payment_type === 'cash' || payment_type === 'card';
  return { is_paid: isPaid, paid_at: isPaid ? new Date() : null };
}

/**
 * Completes an order: updates payment/bottles, customer debt & active bidons.
 */
export async function completeOrder(orderId, {
  payment_type,
  amount_paid,
  empty_bidons_returned = 0,
  full_bidons_given,
  notes,
}) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const orderResult = await client.query(
      'SELECT * FROM orders WHERE id = $1 FOR UPDATE',
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      throw Object.assign(new Error('Order not found'), { status: 404 });
    }

    const order = orderResult.rows[0];

    if (order.status === 'completed') {
      throw Object.assign(new Error('Order already completed'), { status: 400 });
    }

    const given = full_bidons_given ?? order.bidons_count;
    const paid = amount_paid != null ? Number(amount_paid) : Number(order.price);
    const emptyReturned = Number(empty_bidons_returned) || 0;
    const { is_paid, paid_at } = paymentStatusOnComplete(payment_type);

    const updatedOrder = await client.query(
      `UPDATE orders
       SET status = 'completed',
           payment_type = $1,
           amount_paid = $2,
           empty_bidons_returned = $3,
           full_bidons_given = $4,
           notes = COALESCE($5, notes),
           is_paid = $6,
           paid_at = $7,
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [payment_type, paid, emptyReturned, given, notes ?? null, is_paid, paid_at, orderId]
    );

    const orderPrice = Number(order.price);
    const creditAmount = payment_type === 'credit'
      ? orderPrice - paid
      : 0;

    await client.query(
      `UPDATE customers
       SET active_bidons = GREATEST(0, active_bidons + $1 - $2),
           debt = debt + $3,
           updated_at = NOW()
       WHERE id = $4`,
      [given, emptyReturned, Math.max(0, creditAmount), order.customer_id]
    );

    await client.query('COMMIT');
    return updatedOrder.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Admin: nişə sifarişini ödənilmiş kimi qeyd edir, müştəri borcunu azaldır.
 */
export async function markOrderAsPaid(orderId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const orderResult = await client.query(
      'SELECT * FROM orders WHERE id = $1 FOR UPDATE',
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      throw Object.assign(new Error('Order not found'), { status: 404 });
    }

    const order = orderResult.rows[0];

    if (order.status !== 'completed') {
      throw Object.assign(new Error('Only completed orders can be marked as paid'), { status: 400 });
    }

    if (order.is_paid) {
      throw Object.assign(new Error('Order is already marked as paid'), { status: 400 });
    }

    const orderPrice = Number(order.price);
    const amountPaid = Number(order.amount_paid ?? 0);
    const debtReduction = Math.max(0, orderPrice - amountPaid);

    const updatedOrder = await client.query(
      `UPDATE orders
       SET is_paid = TRUE,
           paid_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [orderId]
    );

    if (debtReduction > 0) {
      await client.query(
        `UPDATE customers
         SET debt = GREATEST(0, debt - $1),
             updated_at = NOW()
         WHERE id = $2`,
        [debtReduction, order.customer_id]
      );
    }

    await client.query('COMMIT');
    return updatedOrder.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function notifyCourierAssignment(courierId, orderId, message) {
  if (!courierId) return;

  await pool.query(
    `INSERT INTO notifications (user_id, order_id, type, message)
     VALUES ($1, $2, 'order_assigned', $3)`,
    [courierId, orderId, message]
  );
}
