import pool from '../config/database.js';
import { notifyAdminsCustomerInactive } from '../lib/notifyAdmins.js';
import { INACTIVITY_MINUTES } from './customerInactivityConfig.js';

export async function findInactiveCustomers(companyId, limit = 50) {
  const result = await pool.query(
    `WITH customer_last_order AS (
       SELECT
         c.id,
         c.name,
         c.surname,
         COALESCE(MAX(o.created_at), c.created_at) AS last_order_at
       FROM customers c
       LEFT JOIN orders o
         ON o.customer_id = c.id
        AND o.company_id = c.company_id
       WHERE c.company_id = $1
       GROUP BY c.id, c.name, c.surname, c.created_at
     )
     SELECT clo.*
     FROM customer_last_order clo
     LEFT JOIN customer_inactivity_alerts cia
       ON cia.company_id = $1
      AND cia.customer_id = clo.id
      AND cia.last_order_at = clo.last_order_at
     WHERE clo.last_order_at <= NOW() - ($2 * INTERVAL '1 minute')
       AND cia.id IS NULL
     ORDER BY clo.last_order_at ASC, clo.id ASC
     LIMIT $3`,
    [companyId, INACTIVITY_MINUTES, limit]
  );

  return result.rows;
}

export async function checkAndNotifyInactiveCustomers(companyId) {
  const candidates = await findInactiveCustomers(companyId);
  if (!candidates.length) return { checked: 0, notified: 0 };

  let notified = 0;
  for (const customer of candidates) {
    try {
      await notifyAdminsCustomerInactive(companyId, customer);
      await pool.query(
        `INSERT INTO customer_inactivity_alerts (
           company_id, customer_id, last_order_at, last_order_date
         )
         VALUES ($1, $2, $3, ($3 AT TIME ZONE 'Asia/Baku')::date)
         ON CONFLICT (company_id, customer_id, last_order_at) DO NOTHING`,
        [companyId, customer.id, customer.last_order_at]
      );
      notified += 1;
    } catch (_) {
      // one failure must not block others
    }
  }

  return { checked: candidates.length, notified };
}
