import pool from '../config/database.js';

/** Sifariş qiyməti ilə ödənilən arasındakı fərq — müştəri borcuna əlavə olunur. */
export function unpaidOrderAmount(orderPrice, amountPaid) {
  return Math.max(0, Number(orderPrice) - Number(amountPaid ?? 0));
}

/** Sifariş yaradılarkən 1 bidon üçün qiymət. */
export function orderUnitPrice(order) {
  const baseBidons =
    Number(order.full_bidons_given ?? order.bidons_count ?? 1) || 1;
  return Number(order.price) / baseBidons;
}

/** Bidon sayına görə qiymət; explicit price verilsə onu saxlayır. */
export function resolveOrderPrice(order, fullBidonsGiven, explicitPrice = null) {
  if (explicitPrice != null && explicitPrice !== '') {
    return Number(explicitPrice);
  }
  const given =
    Number(fullBidonsGiven ?? order.full_bidons_given ?? order.bidons_count ?? 1) ||
    1;
  const unit = orderUnitPrice(order);
  return Number((given * unit).toFixed(2));
}

function paymentStatusOnComplete(payment_type, orderPrice, amountPaid) {
  const unpaid = unpaidOrderAmount(orderPrice, amountPaid);

  if (payment_type === 'credit') {
    return { is_paid: false, paid_at: null };
  }

  const isPaid = unpaid === 0;
  return { is_paid: isPaid, paid_at: isPaid ? new Date() : null };
}

function debtDeltaOnComplete(orderPrice, amountPaid) {
  return unpaidOrderAmount(orderPrice, amountPaid);
}

/**
 * Tamamlanmış sifarişin müştəri təsirini geri al (redaktə üçün).
 */
function revertCustomerCompletion(client, order) {
  const given = Number(order.full_bidons_given ?? order.bidons_count ?? 0);
  const emptyReturned = Number(order.empty_bidons_returned) || 0;
  const debtDelta = debtDeltaOnComplete(order.price, order.amount_paid);

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
  const debtDelta = debtDeltaOnComplete(orderPrice, amount_paid);

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
  price: explicitPrice,
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

    const given = Number(full_bidons_given ?? order.bidons_count ?? 1);
    const orderPrice = resolveOrderPrice(order, given, explicitPrice);
    const paid =
      amount_paid != null
        ? Number(amount_paid)
        : payment_type === 'credit'
          ? 0
          : orderPrice;
    const emptyReturned = Number(empty_bidons_returned) || 0;
    const { is_paid, paid_at } = paymentStatusOnComplete(payment_type, orderPrice, paid);

    const updatedOrder = await client.query(
      `UPDATE orders
       SET status = 'completed',
           payment_type = $1,
           amount_paid = $2,
           empty_bidons_returned = $3,
           full_bidons_given = $4,
           bidons_count = $4,
           price = $5,
           notes = COALESCE($6, notes),
           is_paid = $7,
           paid_at = $8,
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $9
       RETURNING *`,
      [
        payment_type,
        paid,
        emptyReturned,
        given,
        orderPrice,
        notes ?? null,
        is_paid,
        paid_at,
        orderId,
      ]
    );

    await applyCustomerCompletion(client, order, {
      payment_type,
      amount_paid: paid,
      empty_bidons_returned: emptyReturned,
      full_bidons_given: given,
      price: orderPrice,
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

    if (order.is_paid) {
      throw Object.assign(
        new Error('Order is already fully paid'),
        { status: 400, code: 'ORDER_ALREADY_PAID' }
      );
    }

    if (!payment_type || !['cash', 'card', 'credit'].includes(payment_type)) {
      throw Object.assign(new Error('payment_type must be cash, card, or credit'), { status: 400 });
    }

    const given = Number(
      full_bidons_given ?? order.full_bidons_given ?? order.bidons_count ?? 1
    );
    const newPrice = resolveOrderPrice(order, given, price);
    const paid =
      amount_paid != null
        ? Number(amount_paid)
        : payment_type === 'credit'
          ? Number(order.amount_paid ?? 0)
          : newPrice;
    const emptyReturned = Number(empty_bidons_returned ?? order.empty_bidons_returned) || 0;
    const { is_paid, paid_at } = paymentStatusOnComplete(payment_type, newPrice, paid);

    await revertCustomerCompletion(client, order);

    const updatedOrder = await client.query(
      `UPDATE orders
       SET payment_type = $1,
           amount_paid = $2,
           empty_bidons_returned = $3,
           full_bidons_given = $4,
           bidons_count = $4,
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
 * Admin: sifariş üzrə borc ödənişi (tam və ya qismən).
 * @param {number} [amount] — ödənilən məbləğ; verilməsə sifarişin qalığı tam ödənilir
 */
export async function recordOrderPayment(orderId, { amount, recordedBy }) {
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
      throw Object.assign(new Error('Only completed orders can receive payment'), {
        status: 400,
      });
    }

    if (order.is_paid) {
      throw Object.assign(new Error('Order is already fully paid'), {
        status: 400,
        code: 'ORDER_ALREADY_PAID',
      });
    }

    const orderPrice = Number(order.price);
    const amountPaid = Number(order.amount_paid ?? 0);
    const orderRemaining = unpaidOrderAmount(orderPrice, amountPaid);

    if (orderRemaining <= 0) {
      throw Object.assign(new Error('Order has no remaining balance'), { status: 400 });
    }

    const payAmount =
      amount != null && amount !== '' ? Number(amount) : orderRemaining;

    if (!Number.isFinite(payAmount) || payAmount <= 0) {
      throw Object.assign(new Error('Payment amount must be greater than 0'), { status: 400 });
    }

    if (payAmount > orderRemaining + 0.001) {
      throw Object.assign(
        new Error(`Payment cannot exceed order remaining (${orderRemaining} AZN)`),
        { status: 400, code: 'AMOUNT_EXCEEDS_ORDER' }
      );
    }

    const customerResult = await client.query(
      'SELECT id, debt FROM customers WHERE id = $1 FOR UPDATE',
      [order.customer_id]
    );

    if (!customerResult.rows.length) {
      throw Object.assign(new Error('Customer not found'), { status: 404 });
    }

    const previousDebt = Number(customerResult.rows[0].debt);
    const newAmountPaid = amountPaid + payAmount;
    const isFullyPaid = newAmountPaid >= orderPrice - 0.001;

    const updatedOrder = await client.query(
      `UPDATE orders
       SET amount_paid = $1,
           is_paid = $2,
           paid_at = CASE WHEN $2 THEN NOW() ELSE paid_at END,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [newAmountPaid, isFullyPaid, orderId]
    );

    const newDebt = Math.max(0, previousDebt - payAmount);
    await client.query(
      `UPDATE customers
       SET debt = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [newDebt, order.customer_id]
    );

    let debtPayment = null;
    if (recordedBy) {
      const dp = await client.query(
        `INSERT INTO debt_payments (company_id, customer_id, amount, previous_debt, new_debt, recorded_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [order.company_id, order.customer_id, payAmount, previousDebt, newDebt, recordedBy]
      );
      debtPayment = dp.rows[0];
    }

    await client.query('COMMIT');

    return {
      order: updatedOrder.rows[0],
      debt_payment: debtPayment,
      customer_debt: newDebt,
      paid_amount: payAmount,
      order_remaining: unpaidOrderAmount(orderPrice, newAmountPaid),
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** @deprecated recordOrderPayment istifadə edin */
export async function markOrderAsPaid(orderId, options = {}) {
  const result = await recordOrderPayment(orderId, options);
  return result.order;
}

