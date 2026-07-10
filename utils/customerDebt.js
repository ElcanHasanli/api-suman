import pool from '../config/database.js';

export async function fetchCustomerLastNote(customerId, companyId) {
  const result = await pool.query(
    `SELECT n.body, n.created_at, n.author_role, u.name AS author_name
     FROM order_notes n
     JOIN orders o ON o.id = n.order_id
     LEFT JOIN users u ON u.id = n.user_id
     WHERE o.customer_id = $1 AND o.company_id = $2
     ORDER BY n.created_at DESC
     LIMIT 1`,
    [customerId, companyId]
  );
  return result.rows[0] ?? null;
}

/**
 * Köhnə borc ödənişini ödənilməmiş tamamlanmış sifarişlərə FIFO ilə paylayır.
 * Beləliklə tarixçədə «Nişə» qutusundan çıxırlar.
 */
export async function settleUnpaidOrdersFromDebtPayment(
  client,
  { companyId, customerId, payAmount, excludeOrderId = null }
) {
  let remaining = Number(payAmount);
  if (!Number.isFinite(remaining) || remaining <= 0.001) return [];

  const params = [customerId, companyId];
  let excludeClause = '';
  if (excludeOrderId) {
    params.push(excludeOrderId);
    excludeClause = ` AND id <> $${params.length}`;
  }

  const unpaid = await client.query(
    `SELECT id, price, amount_paid, payment_type
     FROM orders
     WHERE customer_id = $1
       AND company_id = $2
       AND status = 'completed'
       AND is_paid = FALSE
       AND COALESCE(price, 0) > COALESCE(amount_paid, 0)
       ${excludeClause}
     ORDER BY completed_at ASC NULLS LAST, id ASC
     FOR UPDATE`,
    params
  );

  const settled = [];

  for (const order of unpaid.rows) {
    if (remaining <= 0.001) break;

    const price = Number(order.price);
    const paid = Number(order.amount_paid ?? 0);
    const due = Math.max(0, price - paid);
    if (due <= 0.001) continue;

    const apply = Math.min(remaining, due);
    const newPaid = Number((paid + apply).toFixed(2));
    const fullyPaid = newPaid >= price - 0.001;

    await client.query(
      `UPDATE orders
       SET amount_paid = $1,
           is_paid = $2,
           paid_at = CASE WHEN $2 THEN COALESCE(paid_at, NOW()) ELSE paid_at END,
           updated_at = NOW()
       WHERE id = $3`,
      [newPaid, fullyPaid, order.id]
    );

    settled.push({
      order_id: order.id,
      applied: apply,
      is_paid: fullyPaid,
    });
    remaining = Number((remaining - apply).toFixed(2));
  }

  return settled;
}

/**
 * Müştəri borcunu yeniləyir; azalma halında debt_payments qeydi yaradır
 * və ödənilməmiş sifarişləri bağlayır.
 */
export async function applyCustomerDebtUpdate(client, {
  companyId,
  customerId,
  newDebt,
  recordedBy,
}) {
  const existing = await client.query(
    'SELECT id, debt FROM customers WHERE id = $1 AND company_id = $2 FOR UPDATE',
    [customerId, companyId]
  );
  if (!existing.rows.length) {
    throw Object.assign(new Error('Customer not found'), { status: 404 });
  }

  const oldDebt = Number(existing.rows[0].debt);
  const debtValue = Number(newDebt);
  const paidDown = Math.max(0, oldDebt - debtValue);

  await client.query(
    `UPDATE customers SET debt = $1, updated_at = NOW() WHERE id = $2`,
    [debtValue, customerId]
  );

  let debtPayment = null;
  let settledOrders = [];

  if (paidDown > 0.001 && recordedBy) {
    const dp = await client.query(
      `INSERT INTO debt_payments (company_id, customer_id, amount, previous_debt, new_debt, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [companyId, customerId, paidDown, oldDebt, debtValue, recordedBy]
    );
    debtPayment = dp.rows[0];

    settledOrders = await settleUnpaidOrdersFromDebtPayment(client, {
      companyId,
      customerId,
      payAmount: paidDown,
    });
  }

  return { oldDebt, newDebt: debtValue, debtPayment, settledOrders };
}
