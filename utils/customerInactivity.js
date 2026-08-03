import pool from '../config/database.js';
import { notifyAdminsCustomerInactive } from '../lib/notifyAdmins.js';

/** Passiv həddi: 20 gün (Asia/Baku). */
export const INACTIVITY_DAYS = 20;

/** Bir yoxlamada max */
const BATCH_SIZE = 100;
const MAX_PER_RUN = 1000;

export async function findInactiveCustomers(companyId, limit = BATCH_SIZE) {
  const result = await pool.query(
    `WITH customer_last_order AS (
       SELECT
         c.id,
         c.name,
         c.surname,
         c.active_bidons,
         (COALESCE(MAX(o.created_at), c.created_at) AT TIME ZONE 'Asia/Baku')::date AS last_order_date
       FROM customers c
       LEFT JOIN orders o
         ON o.customer_id = c.id
        AND o.company_id = c.company_id
       WHERE c.company_id = $1
         AND c.active_bidons > 0
       GROUP BY c.id, c.name, c.surname, c.created_at, c.active_bidons
     )
     SELECT clo.*
     FROM customer_last_order clo
     LEFT JOIN customer_inactivity_alerts cia
       ON cia.company_id = $1
      AND cia.customer_id = clo.id
      AND cia.last_order_date = clo.last_order_date
     WHERE clo.last_order_date <= ((NOW() AT TIME ZONE 'Asia/Baku')::date - $3::int)
       AND cia.id IS NULL
     ORDER BY clo.last_order_date ASC, clo.id ASC
     LIMIT $2`,
    [companyId, limit, INACTIVITY_DAYS]
  );

  return result.rows;
}

/**
 * Sifariş yarananda: passiv bildiriş + alert silinsin.
 * 20 gün yenidən sifariş olmasa yenidən düşə bilər.
 */
export async function clearCustomerInactiveState(companyId, customerId) {
  if (!companyId || !customerId) return;

  await pool.query(
    `DELETE FROM notifications n
     USING users u
     WHERE n.type = 'customer_inactive'
       AND n.customer_id = $1
       AND n.user_id = u.id
       AND u.company_id = $2`,
    [customerId, companyId]
  );

  await pool.query(
    `DELETE FROM customer_inactivity_alerts
     WHERE company_id = $1 AND customer_id = $2`,
    [companyId, customerId]
  );
}

/** Artıq passiv olmayanların (0 bidon / 20 gündən az) köhnə bildirişlərini sil */
export async function pruneStaleInactiveNotifications(companyId) {
  await pool.query(
    `DELETE FROM notifications n
     USING customers c, users u
     WHERE n.type = 'customer_inactive'
       AND n.customer_id = c.id
       AND c.company_id = $1
       AND n.user_id = u.id
       AND u.company_id = $1
       AND (
         COALESCE(c.active_bidons, 0) <= 0
         OR (
           SELECT (COALESCE(MAX(o.created_at), c.created_at) AT TIME ZONE 'Asia/Baku')::date
           FROM orders o
           WHERE o.customer_id = c.id AND o.company_id = c.company_id
         ) > ((NOW() AT TIME ZONE 'Asia/Baku')::date - $2::int)
       )`,
    [companyId, INACTIVITY_DAYS]
  );

  // customer_id-siz köhnə qeydlər — yalnız 0 bidonlu ad uyğunluğu
  await pool.query(
    `DELETE FROM notifications n
     USING customers c, users u
     WHERE n.type = 'customer_inactive'
       AND n.customer_id IS NULL
       AND c.company_id = $1
       AND COALESCE(c.active_bidons, 0) <= 0
       AND n.user_id = u.id
       AND u.company_id = $1
       AND n.message ILIKE (TRIM(BOTH FROM CONCAT(c.name, ' ', COALESCE(c.surname, ''))) || '%')`,
    [companyId]
  );
}

export async function checkAndNotifyInactiveCustomers(companyId) {
  await pruneStaleInactiveNotifications(companyId);

  let checked = 0;
  let notified = 0;

  while (checked < MAX_PER_RUN) {
    const remaining = Math.min(BATCH_SIZE, MAX_PER_RUN - checked);
    const candidates = await findInactiveCustomers(companyId, remaining);
    if (!candidates.length) break;

    for (const customer of candidates) {
      checked += 1;
      try {
        const locked = await pool.query(
          `INSERT INTO customer_inactivity_alerts (company_id, customer_id, last_order_date)
           VALUES ($1, $2, $3)
           ON CONFLICT (company_id, customer_id, last_order_date) DO NOTHING
           RETURNING id`,
          [companyId, customer.id, customer.last_order_date]
        );
        if (!locked.rows.length) continue;

        await notifyAdminsCustomerInactive(companyId, customer);
        notified += 1;
      } catch (_) {
        // one failure must not block others
      }
    }

    if (candidates.length < remaining) break;
  }

  return { checked, notified };
}
