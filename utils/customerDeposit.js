import pool from '../config/database.js';
import { formatCustomerDisplay } from './customerName.js';

function roundMoney(value) {
  return Number(Number(value).toFixed(2));
}

export function normalizeDeposit(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw Object.assign(new Error('deposit must be a non-negative number'), {
      status: 400,
    });
  }
  return roundMoney(n);
}

/**
 * Depozit dəyişikliyi ledger-ə yazılır.
 * amount = newDeposit - previousDeposit (silinəndə mənfi).
 */
export async function insertDepositEntry(
  client,
  {
    companyId,
    customerId,
    customerName,
    previousDeposit,
    newDeposit,
    entryType,
    recordedBy,
    notes = null,
  }
) {
  const db = client ?? pool;
  const previous = roundMoney(previousDeposit);
  const next = roundMoney(newDeposit);
  const amount = roundMoney(next - previous);
  if (Math.abs(amount) < 0.001) return null;

  const result = await db.query(
    `INSERT INTO deposit_entries (
       company_id, customer_id, customer_name, amount,
       previous_deposit, new_deposit, entry_type, notes, recorded_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      companyId,
      customerId,
      customerName || null,
      amount,
      previous,
      next,
      entryType,
      notes,
      recordedBy,
    ]
  );
  return result.rows[0];
}

export async function fetchCustomerDepositEntries(customerId, companyId, limit = 50) {
  const result = await pool.query(
    `SELECT de.*, u.name AS recorded_by_name
     FROM deposit_entries de
     LEFT JOIN users u ON u.id = de.recorded_by
     WHERE de.company_id = $1 AND de.customer_id = $2
     ORDER BY de.created_at DESC
     LIMIT $3`,
    [companyId, customerId, limit]
  );
  return result.rows.map(mapDepositEntry);
}

export async function fetchCompanyDepositTotal(companyId, client = null) {
  const db = client ?? pool;
  const result = await db.query(
    `SELECT COALESCE(SUM(deposit), 0)::numeric AS total,
            COUNT(*) FILTER (WHERE deposit > 0)::int AS customers_with_deposit
     FROM customers
     WHERE company_id = $1`,
    [companyId]
  );
  return {
    current_total: roundMoney(result.rows[0].total),
    customers_with_deposit: result.rows[0].customers_with_deposit,
  };
}

export function mapDepositEntry(row) {
  return {
    id: row.id,
    company_id: row.company_id,
    customer_id: row.customer_id,
    customer_name: row.customer_name,
    customer: row.customer_name,
    amount: roundMoney(row.amount),
    previous_deposit: roundMoney(row.previous_deposit),
    new_deposit: roundMoney(row.new_deposit),
    entry_type: row.entry_type,
    notes: row.notes ?? null,
    recorded_by: row.recorded_by,
    recorded_by_name: row.recorded_by_name ?? null,
    created_at: row.created_at,
  };
}

/**
 * Period üzrə depozit qutusu (tarixçə).
 * entered = müsbət məbləğ cəmi (daxil olan)
 * removed = mənfi məbləğlərin absolutu (çıxan / silinən)
 */
export function buildDepositsBox(entries, currentTotal = null) {
  const mapped = entries.map((e) =>
    e.amount != null && e.entry_type != null && e.customer !== undefined
      ? e
      : mapDepositEntry(e)
  );
  const entered = roundMoney(
    mapped.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0)
  );
  const removed = roundMoney(
    mapped.filter((e) => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0)
  );

  return {
    total: entered,
    entered,
    removed,
    net: roundMoney(entered - removed),
    count: mapped.length,
    current_total: currentTotal != null ? roundMoney(currentTotal) : null,
    label: 'Depozit',
    entries: mapped,
  };
}

export function customerNameSnapshot(customer) {
  return formatCustomerDisplay(customer);
}
