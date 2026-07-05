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
 * Müştəri borcunu yeniləyir; azalma halında debt_payments qeydi yaradır.
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

  await client.query(
    `UPDATE customers SET debt = $1, updated_at = NOW() WHERE id = $2`,
    [debtValue, customerId]
  );

  let debtPayment = null;
  if (debtValue < oldDebt && recordedBy) {
    const dp = await client.query(
      `INSERT INTO debt_payments (company_id, customer_id, amount, previous_debt, new_debt, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [companyId, customerId, oldDebt - debtValue, oldDebt, debtValue, recordedBy]
    );
    debtPayment = dp.rows[0];
  }

  return { oldDebt, newDebt: debtValue, debtPayment };
}
