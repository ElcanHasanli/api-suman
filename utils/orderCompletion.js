import pool from '../config/database.js';
import { isPickupOrder } from './orderTypes.js';
import { deriveUnitPrice } from './orderExtras.js';
import { settleUnpaidOrdersFromDebtPayment } from './customerDebt.js';

/** Sifariş qiyməti ilə ödənilən arasındakı fərq — müştəri borcuna əlavə olunur. */
export function unpaidOrderAmount(orderPrice, amountPaid) {
  return Math.max(0, Number(orderPrice) - Number(amountPaid ?? 0));
}

/**
 * Ödənişi sifariş və köhnə borc arasında bölür.
 *
 * Yeni API: amount_paid = yalnız sifariş, debt_paid = yalnız köhnə borc (ayrı inputlar).
 * Köhnə API: yalnız amount_paid göndərilib və orderDue-dan böyükdürsə, artıq hissə borca gedir.
 */
export function splitCompletionPayment(
  orderPrice,
  amountPaid,
  existingDebt,
  payment_type,
  prepaidAmount = 0,
  debtPaidExplicit = null
) {
  const price = Number(orderPrice);
  const debt = Math.max(0, Number(existingDebt ?? 0));
  const prepaid = Math.max(0, Number(prepaidAmount ?? 0));
  const orderDue = Math.max(0, price - prepaid);

  if (payment_type === 'credit') {
    return {
      orderAmountPaid: 0,
      debtPaid: 0,
      unpaidOrder: orderDue,
      newCustomerDebt: debt + orderDue,
      isOrderPaid: false,
      totalCollected: 0,
      totalOrderPaid: prepaid,
      orderDue,
    };
  }

  let orderPaid = Math.max(0, Number(amountPaid ?? 0));
  let debtPaid = 0;

  if (debtPaidExplicit != null && debtPaidExplicit !== '') {
    debtPaid = Math.max(0, Number(debtPaidExplicit));
  } else if (orderPaid > orderDue + 0.001) {
    debtPaid = Math.min(orderPaid - orderDue, debt);
    orderPaid = orderDue;
  }

  orderPaid = Math.min(orderPaid, orderDue);
  debtPaid = Math.min(debtPaid, debt);

  const unpaidOrder = orderDue - orderPaid;
  const newCustomerDebt = Math.max(0, debt - debtPaid + unpaidOrder);
  const totalOrderPaid = prepaid + orderPaid;

  return {
    orderAmountPaid: orderPaid,
    debtPaid,
    unpaidOrder,
    newCustomerDebt,
    isOrderPaid: totalOrderPaid >= price - 0.001,
    totalCollected: orderPaid + debtPaid,
    totalOrderPaid,
    orderDue,
  };
}

export function maxOrderPayment(orderPrice, payment_type, prepaidAmount = 0) {
  if (payment_type === 'credit') return 0;
  const prepaid = Math.max(0, Number(prepaidAmount ?? 0));
  return Math.max(0, Number(orderPrice) - prepaid);
}

export function maxDebtPayment(existingDebt, payment_type) {
  if (payment_type === 'credit') return 0;
  return Math.max(0, Number(existingDebt ?? 0));
}

export function maxCompletionPayment(orderPrice, existingDebt, payment_type, prepaidAmount = 0) {
  return (
    maxOrderPayment(orderPrice, payment_type, prepaidAmount) +
    maxDebtPayment(existingDebt, payment_type)
  );
}

export function validateCompletionPayments({
  orderPrice,
  existingDebt,
  payment_type,
  prepaidAmount = 0,
  amount_paid,
  debt_paid,
}) {
  const orderDue = maxOrderPayment(orderPrice, payment_type, prepaidAmount);
  const maxDebt = maxDebtPayment(existingDebt, payment_type);

  if (payment_type === 'credit') {
    return { orderPaid: 0, debtPaid: 0, orderDue, maxDebt };
  }

  let orderPaid =
    amount_paid != null && amount_paid !== ''
      ? Number(amount_paid)
      : orderDue;
  let debtPaid =
    debt_paid != null && debt_paid !== '' ? Number(debt_paid) : 0;

  if (!Number.isFinite(orderPaid) || orderPaid < 0) {
    throw Object.assign(new Error('amount_paid must be a non-negative number'), {
      status: 400,
    });
  }
  if (!Number.isFinite(debtPaid) || debtPaid < 0) {
    throw Object.assign(new Error('debt_paid must be a non-negative number'), {
      status: 400,
    });
  }

  // Legacy: debt_paid yoxdur, amount_paid ümumi məbləğ kimi
  if (
    (debt_paid == null || debt_paid === '') &&
    amount_paid != null &&
    orderPaid > orderDue + 0.001
  ) {
    const total = orderPaid;
    const maxTotal = orderDue + maxDebt;
    if (total > maxTotal + 0.001) {
      throw Object.assign(
        new Error(
          `amount_paid cannot exceed order due + customer debt (${maxTotal} AZN)`
        ),
        { status: 400, code: 'AMOUNT_EXCEEDS_PAYABLE' }
      );
    }
    debtPaid = Math.min(total - orderDue, maxDebt);
    orderPaid = orderDue;
  }

  if (orderPaid > orderDue + 0.001) {
    throw Object.assign(
      new Error(`amount_paid cannot exceed order remaining (${orderDue} AZN)`),
      { status: 400, code: 'AMOUNT_EXCEEDS_ORDER' }
    );
  }

  if (debtPaid > maxDebt + 0.001) {
    throw Object.assign(
      new Error(`debt_paid cannot exceed customer debt (${maxDebt} AZN)`),
      { status: 400, code: 'AMOUNT_EXCEEDS_DEBT' }
    );
  }

  return { orderPaid, debtPaid, orderDue, maxDebt };
}

export function orderUnitPrice(order) {
  if (order.unit_price != null && order.unit_price !== '') {
    return Number(order.unit_price);
  }
  const baseBidons =
    Number(order.full_bidons_given ?? order.bidons_count ?? 1) || 1;
  return Number(order.price) / baseBidons;
}

/**
 * Yalnız su məbləği (extras olmadan).
 * `orders.price` artıq su + extras cəmidir — ona görə unit_price üstünlük təşkil edir.
 */
export function resolveWaterPrice(order, fullBidonsGiven, explicitWaterPrice = null, extrasTotal = 0) {
  const given =
    Number(fullBidonsGiven ?? order.full_bidons_given ?? order.bidons_count ?? 1) ||
    1;

  if (explicitWaterPrice != null && explicitWaterPrice !== '') {
    return Number(explicitWaterPrice);
  }

  if (order.unit_price != null && order.unit_price !== '') {
    return Number((Number(order.unit_price) * given).toFixed(2));
  }

  // Legacy: price-də extras yoxdursa price/bidons; varsa çıxarıb suyu tapırıq
  const totalPrice = Number(order.price ?? 0);
  const waterOnly = Math.max(0, totalPrice - Number(extrasTotal ?? 0));
  return Number(waterOnly.toFixed(2));
}

/** @deprecated — resolveWaterPrice istifadə edin; bu funksiya su məbləği qaytarır */
export function resolveOrderPrice(order, fullBidonsGiven, explicitPrice = null) {
  return resolveWaterPrice(order, fullBidonsGiven, explicitPrice, 0);
}

async function getOrderExtrasTotal(client, orderId) {
  const result = await client.query(
    'SELECT COALESCE(SUM(amount), 0) AS total FROM order_extras WHERE order_id = $1',
    [orderId]
  );
  return Number(result.rows[0].total ?? 0);
}

async function revertCustomerCompletion(client, order) {
  const given = Number(order.full_bidons_given ?? order.bidons_count ?? 0);
  const emptyReturned = Number(order.empty_bidons_returned) || 0;
  const orderPrice = Number(order.price);
  const orderPaid = Number(order.amount_paid ?? 0);
  const debtPaid = Number(order.debt_paid_at_completion ?? 0);
  const unpaidOrder = unpaidOrderAmount(orderPrice, orderPaid);
  const debtRevertDelta = debtPaid - unpaidOrder;

  await client.query('DELETE FROM debt_payments WHERE order_id = $1', [order.id]);

  return client.query(
    `UPDATE customers
     SET active_bidons = GREATEST(0, active_bidons - $1 + $2),
         debt = GREATEST(0, debt + $3),
         updated_at = NOW()
     WHERE id = $4`,
    [given, emptyReturned, debtRevertDelta, order.customer_id]
  );
}

async function applyPaymentCompletion(client, order, customer, {
  payment_type,
  amount_paid,
  debt_paid = null,
  empty_bidons_returned,
  full_bidons_given,
  price,
  recordedBy,
}) {
  const given = Number(full_bidons_given ?? order.bidons_count ?? 1);
  const emptyReturned = Number(empty_bidons_returned) || 0;
  const orderPrice = Number(price ?? order.price);
  const previousDebt = Number(customer.debt ?? 0);

  const split = splitCompletionPayment(
    orderPrice,
    amount_paid,
    previousDebt,
    payment_type,
    order.prepaid_amount,
    debt_paid
  );

  await client.query(
    `UPDATE customers
     SET active_bidons = GREATEST(0, active_bidons + $1 - $2),
         debt = $3,
         updated_at = NOW()
     WHERE id = $4`,
    [given, emptyReturned, split.newCustomerDebt, order.customer_id]
  );

  if (split.debtPaid > 0.001 && recordedBy) {
    await client.query(
      `INSERT INTO debt_payments (
         company_id, customer_id, order_id, amount, previous_debt, new_debt, recorded_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        order.company_id,
        order.customer_id,
        order.id,
        split.debtPaid,
        previousDebt,
        Math.max(0, previousDebt - split.debtPaid),
        recordedBy,
      ]
    );

    // Köhnə nişə/qismən sifarişləri tarixçədən çıxarmaq üçün bağla
    await settleUnpaidOrdersFromDebtPayment(client, {
      companyId: order.company_id,
      customerId: order.customer_id,
      payAmount: split.debtPaid,
      excludeOrderId: order.id,
    });
  }

  return split;
}

async function completePickupOrderInternal(client, order, { empty_bidons_returned, notes }) {
  const returned = Number(empty_bidons_returned);
  if (!Number.isFinite(returned) || returned < 0) {
    throw Object.assign(new Error('empty_bidons_returned must be a non-negative number'), {
      status: 400,
    });
  }

  const updatedOrder = await client.query(
    `UPDATE orders
     SET status = 'completed',
         empty_bidons_returned = $1,
         full_bidons_given = 0,
         amount_paid = 0,
         debt_paid_at_completion = 0,
         price = 0,
         payment_type = 'pickup',
         is_paid = TRUE,
         paid_at = NOW(),
         notes = COALESCE($2, notes),
         completed_at = NOW(),
         updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [returned, notes ?? null, order.id]
  );

  if (returned > 0) {
    await client.query(
      `UPDATE customers
       SET active_bidons = GREATEST(0, active_bidons - $1),
           updated_at = NOW()
       WHERE id = $2`,
      [returned, order.customer_id]
    );
  }

  return updatedOrder.rows[0];
}

async function lockCustomer(client, customerId) {
  const r = await client.query(
    'SELECT * FROM customers WHERE id = $1 FOR UPDATE',
    [customerId]
  );
  if (!r.rows.length) {
    throw Object.assign(new Error('Customer not found'), { status: 404 });
  }
  return r.rows[0];
}

export async function completeOrder(orderId, {
  payment_type,
  amount_paid,
  debt_paid = null,
  empty_bidons_returned = 0,
  full_bidons_given,
  notes,
  price: explicitPrice,
  recordedBy,
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

    if (isPickupOrder(order)) {
      const completed = await completePickupOrderInternal(client, order, {
        empty_bidons_returned,
        notes,
      });
      await client.query('COMMIT');
      return completed;
    }

    const customer = await lockCustomer(client, order.customer_id);
    const given = Number(full_bidons_given ?? order.bidons_count ?? 1);
    const extrasTotal = await getOrderExtrasTotal(client, order.id);
    const waterPrice = resolveWaterPrice(order, given, explicitPrice, extrasTotal);
    const orderPrice = Number((waterPrice + extrasTotal).toFixed(2));
    const unitPrice =
      given > 0 ? Number((waterPrice / given).toFixed(2)) : deriveUnitPrice(order);
    const prepaidAmount = Number(order.prepaid_amount ?? 0);

    const validated = validateCompletionPayments({
      orderPrice,
      existingDebt: customer.debt,
      payment_type,
      prepaidAmount,
      amount_paid,
      debt_paid,
    });

    const split = await applyPaymentCompletion(client, order, customer, {
      payment_type,
      amount_paid: validated.orderPaid,
      debt_paid: validated.debtPaid,
      empty_bidons_returned,
      full_bidons_given: given,
      price: orderPrice,
      recordedBy: recordedBy ?? order.courier_id,
    });

    const updatedOrder = await client.query(
      `UPDATE orders
       SET status = 'completed',
           payment_type = $1,
           amount_paid = $2,
           debt_paid_at_completion = $3,
           empty_bidons_returned = $4,
           full_bidons_given = $5,
           bidons_count = $5,
           price = $6,
           unit_price = $7,
           notes = COALESCE($8, notes),
           is_paid = $9,
           paid_at = CASE WHEN $9 THEN NOW() ELSE NULL END,
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $10
       RETURNING *`,
      [
        payment_type,
        split.totalOrderPaid ?? split.orderAmountPaid + prepaidAmount,
        split.debtPaid,
        Number(empty_bidons_returned) || 0,
        given,
        orderPrice,
        unitPrice,
        notes ?? null,
        split.isOrderPaid,
        orderId,
      ]
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

export async function updateCompletedOrder(orderId, courierId, {
  payment_type,
  amount_paid,
  debt_paid = null,
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

    if (order.is_paid && !isPickupOrder(order)) {
      throw Object.assign(
        new Error('Order is already fully paid'),
        { status: 400, code: 'ORDER_ALREADY_PAID' }
      );
    }

    if (isPickupOrder(order)) {
      const revertedReturned = Number(order.empty_bidons_returned) || 0;
      if (revertedReturned > 0) {
        await client.query(
          `UPDATE customers
           SET active_bidons = active_bidons + $1,
               updated_at = NOW()
           WHERE id = $2`,
          [revertedReturned, order.customer_id]
        );
      }

      const completed = await completePickupOrderInternal(client, order, {
        empty_bidons_returned,
        notes,
      });
      await client.query('COMMIT');
      return completed;
    }

    if (!payment_type || !['cash', 'card', 'credit'].includes(payment_type)) {
      throw Object.assign(new Error('payment_type must be cash, card, or credit'), { status: 400 });
    }

    await revertCustomerCompletion(client, order);
    const customer = await lockCustomer(client, order.customer_id);

    const given = Number(
      full_bidons_given ?? order.full_bidons_given ?? order.bidons_count ?? 1
    );
    const extrasTotal = await getOrderExtrasTotal(client, order.id);
    const waterPrice = resolveWaterPrice(order, given, price, extrasTotal);
    const newPrice = Number((waterPrice + extrasTotal).toFixed(2));
    const unitPrice =
      given > 0 ? Number((waterPrice / given).toFixed(2)) : deriveUnitPrice(order);
    const prepaidAmount = Number(order.prepaid_amount ?? 0);
    const validated = validateCompletionPayments({
      orderPrice: newPrice,
      existingDebt: customer.debt,
      payment_type,
      prepaidAmount,
      amount_paid,
      debt_paid,
    });

    const split = await applyPaymentCompletion(client, order, customer, {
      payment_type,
      amount_paid: validated.orderPaid,
      debt_paid: validated.debtPaid,
      empty_bidons_returned,
      full_bidons_given: given,
      price: newPrice,
      recordedBy: courierId,
    });

    const updatedOrder = await client.query(
      `UPDATE orders
       SET payment_type = $1,
           amount_paid = $2,
           debt_paid_at_completion = $3,
           empty_bidons_returned = $4,
           full_bidons_given = $5,
           bidons_count = $5,
           notes = COALESCE($6, notes),
           price = $7,
           unit_price = $8,
           is_paid = $9,
           paid_at = CASE WHEN $9 THEN COALESCE(paid_at, NOW()) ELSE NULL END,
           updated_at = NOW()
       WHERE id = $10
       RETURNING *`,
      [
        payment_type,
        split.totalOrderPaid ?? split.orderAmountPaid + prepaidAmount,
        split.debtPaid,
        Number(empty_bidons_returned ?? order.empty_bidons_returned) || 0,
        given,
        notes ?? null,
        newPrice,
        unitPrice,
        split.isOrderPaid,
        orderId,
      ]
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
        `INSERT INTO debt_payments (company_id, customer_id, order_id, amount, previous_debt, new_debt, recorded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
          order.company_id,
          order.customer_id,
          orderId,
          payAmount,
          previousDebt,
          newDebt,
          recordedBy,
        ]
      );
      debtPayment = dp.rows[0];
    }

    // Bu sifariş artıq yuxarıda yenilənib; qalan məbləğ digər köhnə sifarişlərə getmir
    // (mark-paid yalnız bu sifarişin qalığı üçündür)

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

export async function markOrderAsPaid(orderId, options = {}) {
  const result = await recordOrderPayment(orderId, options);
  return result.order;
}
