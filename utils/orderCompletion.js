import pool from '../config/database.js';

function paymentStatusOnComplete(payment_type) {
  const isPaid = payment_type === 'cash' || payment_type === 'card';
  return { is_paid: isPaid, paid_at: isPaid ? new Date() : null };
}

function creditDebtDelta(payment_type, orderPrice, amountPaid) {
  if (payment_type !== 'credit') return 0;
  return Math.max(0, Number(orderPrice) - Number(amountPaid ?? 0));
}

/**
 * Tamamlanmış sifarişin müştəri təsirini geri al (redaktə üçün).
 */
function revertCustomerCompletion(client, order) {
  const given = Number(order.full_bidons_given ?? order.bidons_count ?? 0);
  const emptyReturned = Number(order.empty_bidons_returned) || 0;
  const debtDelta = creditDebtDelta(
    order.payment_type,
    order.price,
    order.amount_paid
  );

  return client.query(
    `UPDATE customers
     SET active_bidons = GREATEST(0, active_bidons - $1 + $2),
         debt = GREATEST(0, debt - $3),
         updated_at = NOW()
     WHERE id = $4`,
    [given, emptyReturned, debtDelta, order.customer_id]
  );
}

function applyCustomerCompletion(client, order, {
  payment_type,
  amount_paid,
  empty_bidons_returned,
  full_bidons_given,
  price,
}) {
  const given = Number(full_bidons_given ?? order.bidons_count ?? 1);
  const emptyReturned = Number(empty_bidons_returned) || 0;
  const orderPrice = Number(price ?? order.price);
  const debtDelta = creditDebtDelta(payment_type, orderPrice, amount_paid);

  return client.query(
    `UPDATE customers
     SET active_bidons = GREATEST(0, active_bidons + $1 - $2),
         debt = debt + $3,
         updated_at = NOW()
     WHERE id = $4`,
    [given, emptyReturned, debtDelta, order.customer_id]
  );
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

    await applyCustomerCompletion(client, order, {
      payment_type,
      amount_paid: paid,
      empty_bidons_returned: emptyReturned,
      full_bidons_given: given,
      price: order.price,
    });

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
 * Kuryer: tamamlanmış sifarişi 24 saat ərzində redaktə edir.
 */
export async function updateCompletedOrder(orderId, courierId, {
  payment_type,
  amount_paid,
  empty_bidons_returned,
  full_bidons_given,
  notes,
  price,
}) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const orderResult = await client.query(
      `SELECT * FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      throw Object.assign(new Error('Order not found'), { status: 404 });
    }

    const order = orderResult.rows[0];

    if (order.status !== 'completed') {
      throw Object.assign(new Error('Order is not completed'), { status: 400 });
    }

    if (Number(order.courier_id) !== Number(courierId)) {
      throw Object.assign(new Error('Insufficient permissions'), { status: 403 });
    }

    const completedAt = order.completed_at ? new Date(order.completed_at) : null;
    if (!completedAt || Date.now() - completedAt.getTime() > 24 * 60 * 60 * 1000) {
      throw Object.assign(
        new Error('Completion edit window expired (24 hours)'),
        { status: 403, code: 'EDIT_WINDOW_EXPIRED' }
      );
    }

    if (order.payment_type === 'credit' && order.is_paid) {
      throw Object.assign(
        new Error('Credit order already marked paid by admin'),
        { status: 403, code: 'ORDER_LOCKED' }
      );
    }

    if (!payment_type || !['cash', 'card', 'credit'].includes(payment_type)) {
      throw Object.assign(new Error('payment_type must be cash, card, or credit'), { status: 400 });
    }

    const newPrice = price != null ? Number(price) : Number(order.price);
    const given = full_bidons_given ?? order.full_bidons_given ?? order.bidons_count;
    const paid = amount_paid != null
      ? Number(amount_paid)
      : payment_type === 'credit'
        ? Number(order.amount_paid ?? 0)
        : newPrice;
    const emptyReturned = Number(empty_bidons_returned ?? order.empty_bidons_returned) || 0;
    const { is_paid, paid_at } = paymentStatusOnComplete(payment_type);

    await revertCustomerCompletion(client, order);

    const updatedOrder = await client.query(
      `UPDATE orders
       SET payment_type = $1,
           amount_paid = $2,
           empty_bidons_returned = $3,
           full_bidons_given = $4,
           notes = COALESCE($5, notes),
           price = $6,
           is_paid = $7,
           paid_at = $8,
           updated_at = NOW()
       WHERE id = $9
       RETURNING *`,
      [
        payment_type,
        paid,
        emptyReturned,
        given,
        notes ?? null,
        newPrice,
        is_paid,
        paid_at,
        orderId,
      ]
    );

    await applyCustomerCompletion(client, updatedOrder.rows[0], {
      payment_type,
      amount_paid: paid,
      empty_bidons_returned: emptyReturned,
      full_bidons_given: given,
      price: newPrice,
    });

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

