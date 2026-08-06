import pool from '../config/database.js';
import { BAKU_TODAY } from './bakuDate.js';
import { resolveRangePeriodQuery } from './periodFilter.js';
import { formatCustomerDisplay } from './customerName.js';

/**
 * Admin seçdiyi tarix aralığında sifariş verməyən + qalıq bidonu olan müştərilər.
 * Sabit 20/30 gün yoxdur — tarixçə kimi period / aralıq.
 */

function toDateStr(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return new Date(value).toISOString().slice(0, 10);
}

/**
 * period=custom|week|days2|month və ya days=N (son N gün).
 */
export async function resolveInactiveDateRange(query = {}) {
  if (query.days != null && query.days !== '') {
    const days = Math.max(1, Math.min(3660, parseInt(query.days, 10) || 0));
    if (!days) {
      throw Object.assign(new Error('days must be a positive number'), {
        status: 400,
        code: 'INVALID_DAYS',
      });
    }
    const { rows } = await pool.query(
      `SELECT
         (${BAKU_TODAY})::text AS end_date,
         (${BAKU_TODAY} - ($1::int - 1) * INTERVAL '1 day')::date::text AS start_date`,
      [days]
    );
    return {
      period: 'days',
      days,
      startDate: rows[0].start_date,
      endDate: rows[0].end_date,
    };
  }

  const resolved = resolveRangePeriodQuery({
    period: query.period || (query.startDate ? 'custom' : 'month'),
    startDate: query.startDate,
    endDate: query.endDate,
  });

  if (resolved.period === 'custom') {
    return {
      period: 'custom',
      days: null,
      startDate: resolved.startDate,
      endDate: resolved.endDate,
    };
  }

  const { rows } = await pool.query(`
    SELECT
      (${BAKU_TODAY})::text AS today,
      (${BAKU_TODAY} - INTERVAL '1 day')::date::text AS yesterday,
      (${BAKU_TODAY} - INTERVAL '6 days')::date::text AS week_start,
      date_trunc('month', ${BAKU_TODAY})::date::text AS month_start
  `);
  const t = rows[0];

  if (resolved.period === 'days2') {
    return {
      period: 'days2',
      days: 2,
      startDate: t.yesterday,
      endDate: t.today,
    };
  }
  if (resolved.period === 'week') {
    return {
      period: 'week',
      days: 7,
      startDate: t.week_start,
      endDate: t.today,
    };
  }
  return {
    period: 'month',
    days: null,
    startDate: t.month_start,
    endDate: t.today,
  };
}

/**
 * Seçilmiş [startDate, endDate] aralığında heç sifarişi olmayan,
 * active_bidons > 0 müştərilər.
 */
export async function listInactiveCustomers({
  companyId,
  startDate,
  endDate,
  page = 1,
  limit = 50,
  q = null,
}) {
  const offset = (page - 1) * limit;
  const params = [companyId, startDate, endDate];
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
      AND NOT EXISTS (
        SELECT 1
        FROM orders o
        WHERE o.customer_id = c.id
          AND o.company_id = c.company_id
          AND (o.created_at AT TIME ZONE 'Asia/Baku')::date >= $2::date
          AND (o.created_at AT TIME ZONE 'Asia/Baku')::date <= $3::date
      )
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
         SELECT (MAX(o.created_at) AT TIME ZONE 'Asia/Baku')::date
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

  const customers = result.rows.map((row) => ({
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
  }));

  return {
    customers,
    total: countResult.rows[0].total,
    page,
    limit,
  };
}

/** Sifariş yarananda köhnə passiv bildiriş/alert silinsin (əgər qalıbsa). */
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

/** Köhnə avtomatik passiv bildirişləri təmizlə (0 bidon + köhnə tip). */
export async function pruneStaleInactiveNotifications(companyId) {
  await pool.query(
    `DELETE FROM notifications n
     USING customers c, users u
     WHERE n.type = 'customer_inactive'
       AND n.customer_id = c.id
       AND c.company_id = $1
       AND n.user_id = u.id
       AND u.company_id = $1
       AND COALESCE(c.active_bidons, 0) <= 0`,
    [companyId]
  );
}

/**
 * @deprecated Sabit gün avtomatik bildiriş ləğv edildi.
 * Yalnız köhnə 0-bidon bildirişlərini təmizləyir.
 */
export async function checkAndNotifyInactiveCustomers(companyId) {
  await pruneStaleInactiveNotifications(companyId);
  return { checked: 0, notified: 0 };
}
