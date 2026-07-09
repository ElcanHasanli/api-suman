import pool from '../config/database.js';

function toInt(value, fieldName) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`${fieldName} must be a non-negative integer`);
  }
  return n;
}

export async function getWarehouseStock(client, companyId) {
  const db = client ?? pool;
  const result = await db.query(
    `SELECT company_id, full_count, empty_count, pump_count, dispenser_count,
            updated_at, updated_by
     FROM warehouse_stock WHERE company_id = $1`,
    [companyId]
  );

  if (result.rows.length) return result.rows[0];

  return {
    company_id: companyId,
    full_count: 0,
    empty_count: 0,
    pump_count: 0,
    dispenser_count: 0,
    updated_at: null,
    updated_by: null,
  };
}

export async function getCustomersBidonSummary(companyId) {
  const result = await pool.query(
    `SELECT
       COALESCE(SUM(active_bidons), 0)::int AS total_active_bidons,
       COUNT(*)::int AS customer_count
     FROM customers WHERE company_id = $1`,
    [companyId]
  );
  return result.rows[0];
}

/**
 * Kuryer anbar yeniləməsi (su doldurma məntiqi).
 */
export async function applyWarehouseUpdate({
  companyId,
  courierId,
  createdBy,
  empty_in = 0,
  full_in = 0,
  full_out = 0,
  exit_full = null,
  remaining_full,
  remaining_empty = null,
  notes = null,
}) {
  const emptyIn = toInt(empty_in, 'empty_in');
  const fullIn = toInt(full_in, 'full_in');
  const fullOut = toInt(full_out, 'full_out');
  const remFull = toInt(remaining_full, 'remaining_full');

  let remEmpty;
  if (remaining_empty != null && remaining_empty !== '') {
    remEmpty = toInt(remaining_empty, 'remaining_empty');
  }

  let exitFull = null;
  if (exit_full != null && exit_full !== '') {
    exitFull = toInt(exit_full, 'exit_full');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const stock = await getWarehouseStock(client, companyId);
    const prevFull = Number(stock.full_count) || 0;
    const prevEmpty = Number(stock.empty_count) || 0;

    if (remEmpty == null) {
      remEmpty = Math.max(0, prevEmpty + emptyIn);
    }

    const expectedFull = prevFull + fullIn - fullOut;
    const mismatch = expectedFull !== remFull;

    await client.query(
      `INSERT INTO warehouse_updates (
         company_id, courier_id, created_by,
         empty_in, full_in, full_out, exit_full,
         previous_full, previous_empty, remaining_full, remaining_empty, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        companyId,
        courierId,
        createdBy,
        emptyIn,
        fullIn,
        fullOut,
        exitFull,
        prevFull,
        prevEmpty,
        remFull,
        remEmpty,
        notes?.trim() || null,
      ]
    );

    const updateResult = await client.query(
      `INSERT INTO warehouse_stock (company_id, full_count, empty_count, updated_at, updated_by)
       VALUES ($1, $2, $3, NOW(), $4)
       ON CONFLICT (company_id)
       DO UPDATE SET
         full_count = EXCLUDED.full_count,
         empty_count = EXCLUDED.empty_count,
         updated_at = NOW(),
         updated_by = EXCLUDED.updated_by
       RETURNING *`,
      [companyId, remFull, remEmpty, createdBy]
    );

    const logResult = await client.query(
      `SELECT wu.*, u.name AS courier_name
       FROM warehouse_updates wu
       JOIN users u ON wu.courier_id = u.id
       WHERE wu.company_id = $1
       ORDER BY wu.id DESC LIMIT 1`,
      [companyId]
    );

    await client.query('COMMIT');

    return {
      stock: updateResult.rows[0],
      update: logResult.rows[0],
      calculation: {
        previous_full: prevFull,
        previous_empty: prevEmpty,
        expected_full: expectedFull,
        mismatch,
      },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function setWarehouseStockByAdmin({
  companyId,
  full_count,
  empty_count,
  pump_count,
  dispenser_count,
  updatedBy,
  notes = null,
}) {
  const full = toInt(full_count, 'full_count');
  const empty = toInt(empty_count, 'empty_count');
  const pump =
    pump_count != null && pump_count !== '' ? toInt(pump_count, 'pump_count') : null;
  const dispenser =
    dispenser_count != null && dispenser_count !== ''
      ? toInt(dispenser_count, 'dispenser_count')
      : null;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const stock = await getWarehouseStock(client, companyId);
    const prevFull = Number(stock.full_count) || 0;
    const prevEmpty = Number(stock.empty_count) || 0;
    const prevPump = Number(stock.pump_count) || 0;
    const prevDispenser = Number(stock.dispenser_count) || 0;
    const nextPump = pump ?? prevPump;
    const nextDispenser = dispenser ?? prevDispenser;

    await client.query(
      `INSERT INTO warehouse_updates (
         company_id, courier_id, created_by,
         empty_in, full_in, full_out,
         previous_full, previous_empty, remaining_full, remaining_empty, notes
       ) VALUES ($1, NULL, $2, 0, 0, 0, $3, $4, $5, $6, $7)`,
      [
        companyId,
        updatedBy,
        prevFull,
        prevEmpty,
        full,
        empty,
        notes?.trim() || 'Admin düzəlişi',
      ]
    );

    const updateResult = await client.query(
      `INSERT INTO warehouse_stock (
         company_id, full_count, empty_count, pump_count, dispenser_count, updated_at, updated_by
       )
       VALUES ($1, $2, $3, $4, $5, NOW(), $6)
       ON CONFLICT (company_id)
       DO UPDATE SET
         full_count = EXCLUDED.full_count,
         empty_count = EXCLUDED.empty_count,
         pump_count = EXCLUDED.pump_count,
         dispenser_count = EXCLUDED.dispenser_count,
         updated_at = NOW(),
         updated_by = EXCLUDED.updated_by
       RETURNING *`,
      [companyId, full, empty, nextPump, nextDispenser, updatedBy]
    );

    await client.query('COMMIT');
    return { stock: updateResult.rows[0] };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
