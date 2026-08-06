import pool from '../config/database.js';
import { notifyAdminsCustomerInactive } from '../lib/notifyAdmins.js';
import { BAKU_TODAY } from './bakuDate.js';
import { formatCustomerDisplay } from './customerName.js';

/** Son 30 gün sifariş yoxdursa + qalıq bidon > 0 → problemli / passiv */
export const INACTIVITY_DAYS = 30;

const BATCH_SIZE = 100;
const MAX_PER_RUN = 1000;

function toDateStr(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return new Date(value).toISOString().slice(0, 10);
}

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
 * Problemli / passiv siyahı — son 30 gün sifariş verməyən + active_bidons > 0.
 */
export async function listInactiveCustomers({
  companyId,
  page = 1,
  limit = 50,
  q = null,
}) {
  const offset = (page - 1) * limit;
  const params = [companyId, INACTIVITY_DAYS];
  let searchClause = '';

  const term = (q || '').trim();
  if (term) {
    params.push(`%${term}%`);
    const idx = params.length;
    searchClause = ` AND (
      c.name ILIKE $${idx}
      OR c.surname ILIKE $${idx}
      OR c.phone ILIKE $${idx}
      OR c.phone2 ILIKE $${idx}
      OR c.address ILIKE $${idx}
      OR TRIM(CONCAT(c.name, ' ', COALESCE(c.surname, ''))) ILIKE $${idx}
    )`;
  }

  const baseFrom = `
    FROM customers c
    WHERE c.company_id = $1
      AND c.active_bidons > 0
      AND (
        SELECT (COALESCE(MAX(o.created_at), c.created_at) AT TIME ZONE 'Asia/Baku')::date
        FROM orders o
        WHERE o.customer_id = c.id AND o.company_id = c.company_id
      ) <= ((NOW() AT TIME ZONE 'Asia/Baku')::date - $2::int)
      ${searchClause}
  `;

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total ${baseFrom}`,
    params
  );

  const listParams = [...params, limit, offset];
  const result = await pool.query(
    `SELECT
       c.id, c.name, c.surname, c.phone, c.phone2, c.address,
       c.price, c.active_bidons, c.debt, c.deposit, c.notes,
       c.created_at, c.updated_at,
       (
         SELECT MAX(o.created_at)
         FROM orders o
         WHERE o.customer_id = c.id AND o.company_id = c.company_id
       ) AS last_order_at,
       (
         SELECT (COALESCE(MAX(o.created_at), c.created_at) AT TIME ZONE 'Asia/Baku')::date
         FROM orders o
         WHERE o.customer_id = c.id AND o.company_id = c.company_id
       ) AS last_order_date
     ${baseFrom}
     ORDER BY
       last_order_date ASC NULLS FIRST,
       LOWER(TRIM(CONCAT(c.name, ' ', COALESCE(c.surname, '')))) ASC,
       c.id ASC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );

  const { rows: rangeRows } = await pool.query(
    `SELECT
       (${BAKU_TODAY})::text AS end_date,
       (${BAKU_TODAY} - $1::int * INTERVAL '1 day')::date::text AS start_date`,
    [INACTIVITY_DAYS]
  );

  return {
    period: 'days',
    days: INACTIVITY_DAYS,
    startDate: rangeRows[0].start_date,
    endDate: rangeRows[0].end_date,
    customers: result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      surname: row.surname,
      display_name: formatCustomerDisplay(row),
      phone: row.phone,
      phone2: row.phone2,
      address: row.address,
      price: row.price,
      active_bidons: Number(row.active_bidons ?? 0),
      debt: row.debt,
      deposit: Number(row.deposit ?? 0),
      notes: row.notes ?? null,
      created_at: row.created_at,
      last_order_at: row.last_order_at,
      last_order_date: toDateStr(row.last_order_date),
    })),
    total: countResult.rows[0].total,
    page,
    limit,
  };
}

/** Sifariş yarananda problemli / passiv siyahıdan çıxır */
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

export async function pruneStaleInactiveNotifications(companyId) {
  // 0 bidon və ya son 30 gündə sifarişi olanlar — bildirişdən sil
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
