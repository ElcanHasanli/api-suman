import pool from '../config/database.js';

export const WAREHOUSE_CODES = ['novxani', 'azadliq'];

export const WAREHOUSE_LABELS = {
  novxani: 'Novxanı',
  azadliq: 'Azadlıq',
};

function toInt(value, fieldName) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`${fieldName} must be a non-negative integer`);
  }
  return n;
}

export function formatWarehouse(row) {
  if (!row) return null;
  return {
    id: row.id,
    company_id: row.company_id,
    code: row.code,
    name: row.name,
    full_count: Number(row.full_count) || 0,
    empty_count: Number(row.empty_count) || 0,
    pump_count: Number(row.pump_count) || 0,
    dispenser_count: Number(row.dispenser_count) || 0,
    updated_at: row.updated_at,
    updated_by: row.updated_by ?? null,
  };
}

export function formatWarehouseUpdate(row) {
  if (!row) return null;
  const entryFull = Number(row.entry_full ?? row.full_in ?? 0);
  const entryEmpty = Number(row.entry_empty ?? row.empty_in ?? 0);
  const exitFull = row.exit_full != null ? Number(row.exit_full) : null;
  const fullTaken = Number(
    row.full_taken ??
      (exitFull != null ? Math.max(0, exitFull - entryFull) : row.full_out ?? 0)
  );

  return {
    id: row.id,
    company_id: row.company_id,
    warehouse_id: row.warehouse_id,
    warehouse_code: row.warehouse_code ?? null,
    warehouse_name: row.warehouse_name ?? null,
    courier_id: row.courier_id,
    courier_name: row.courier_name ?? null,
    created_by: row.created_by,
    created_by_name: row.created_by_name ?? null,
    entry_full: entryFull,
    entry_empty: entryEmpty,
    exit_full: exitFull,
    full_taken: fullTaken,
    // legacy aliases
    full_in: entryFull,
    empty_in: entryEmpty,
    full_out: fullTaken,
    previous_full: Number(row.previous_full) || 0,
    previous_empty: Number(row.previous_empty) || 0,
    remaining_full: Number(row.remaining_full) || 0,
    remaining_empty: Number(row.remaining_empty) || 0,
    notes: row.notes,
    created_at: row.created_at,
  };
}

export async function ensureCompanyWarehouses(client, companyId) {
  const db = client ?? pool;
  for (const code of WAREHOUSE_CODES) {
    await db.query(
      `INSERT INTO warehouses (company_id, code, name)
       VALUES ($1, $2, $3)
       ON CONFLICT (company_id, code) DO NOTHING`,
      [companyId, code, WAREHOUSE_LABELS[code]]
    );
  }
}

export async function listWarehouses(client, companyId) {
  const db = client ?? pool;
  await ensureCompanyWarehouses(db, companyId);
  const result = await db.query(
    `SELECT * FROM warehouses WHERE company_id = $1 ORDER BY code ASC`,
    [companyId]
  );
  return result.rows.map(formatWarehouse);
}

export async function getWarehouseById(client, companyId, warehouseId) {
  const db = client ?? pool;
  const result = await db.query(
    `SELECT * FROM warehouses WHERE id = $1 AND company_id = $2`,
    [warehouseId, companyId]
  );
  return result.rows[0] ?? null;
}

export async function getWarehouseByCode(client, companyId, code) {
  const db = client ?? pool;
  await ensureCompanyWarehouses(db, companyId);
  const result = await db.query(
    `SELECT * FROM warehouses WHERE company_id = $1 AND code = $2`,
    [companyId, code]
  );
  return result.rows[0] ?? null;
}

export async function resolveWarehouseId(client, companyId, {
  warehouse_id = null,
  warehouse_code = null,
  defaultWarehouseId = null,
} = {}) {
  if (warehouse_id != null && warehouse_id !== '') {
    const wh = await getWarehouseById(client, companyId, Number(warehouse_id));
    if (!wh) {
      throw Object.assign(new Error('Warehouse not found'), { status: 404 });
    }
    return wh;
  }

  if (warehouse_code) {
    const code = String(warehouse_code).trim().toLowerCase();
    if (!WAREHOUSE_CODES.includes(code)) {
      throw Object.assign(
        new Error(`warehouse_code must be ${WAREHOUSE_CODES.join(' or ')}`),
        { status: 400, code: 'INVALID_WAREHOUSE' }
      );
    }
    return getWarehouseByCode(client, companyId, code);
  }

  if (defaultWarehouseId) {
    const wh = await getWarehouseById(client, companyId, defaultWarehouseId);
    if (wh) return wh;
  }

  return getWarehouseByCode(client, companyId, 'novxani');
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

export async function getCourierDefaultWarehouse(client, companyId, courierId) {
  const db = client ?? pool;
  const result = await db.query(
    `SELECT default_warehouse_id FROM users
     WHERE id = $1 AND company_id = $2 AND role = 'courier'`,
    [courierId, companyId]
  );
  return result.rows[0]?.default_warehouse_id ?? null;
}

/**
 * Kuryer anbar yeniləməsi (sadə):
 * entry_full + entry_empty ilə girdi, exit_full ilə çıxdı.
 * full_taken = exit_full - entry_full
 */
export async function applyWarehouseUpdate({
  companyId,
  courierId,
  createdBy,
  warehouse_id = null,
  warehouse_code = null,
  entry_full = 0,
  entry_empty = 0,
  exit_full,
  // legacy aliases
  full_in,
  empty_in,
  notes = null,
}) {
  const entryFull = toInt(entry_full ?? full_in ?? 0, 'entry_full');
  const entryEmpty = toInt(entry_empty ?? empty_in ?? 0, 'entry_empty');

  if (exit_full == null || exit_full === '') {
    throw Object.assign(new Error('exit_full required (neçə dolu ilə çıxdı)'), {
      status: 400,
    });
  }
  const exitFull = toInt(exit_full, 'exit_full');

  if (exitFull < entryFull) {
    throw Object.assign(
      new Error(
        `exit_full (${exitFull}) cannot be less than entry_full (${entryFull})`
      ),
      { status: 400, code: 'EXIT_LESS_THAN_ENTRY' }
    );
  }

  const fullTaken = exitFull - entryFull;
  const defaultWarehouseId = await getCourierDefaultWarehouse(
    null,
    companyId,
    courierId
  );

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const warehouse = await resolveWarehouseId(client, companyId, {
      warehouse_id,
      warehouse_code,
      defaultWarehouseId,
    });

    const locked = await client.query(
      `SELECT * FROM warehouses WHERE id = $1 FOR UPDATE`,
      [warehouse.id]
    );
    const stock = locked.rows[0];
    const prevFull = Number(stock.full_count) || 0;
    const prevEmpty = Number(stock.empty_count) || 0;

    const remFull = Math.max(0, prevFull - fullTaken);
    const remEmpty = prevEmpty + entryEmpty;

    const insert = await client.query(
      `INSERT INTO warehouse_updates (
         company_id, warehouse_id, courier_id, created_by,
         empty_in, full_in, full_out, exit_full,
         entry_full, entry_empty, full_taken,
         previous_full, previous_empty, remaining_full, remaining_empty, notes
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
       ) RETURNING *`,
      [
        companyId,
        warehouse.id,
        courierId,
        createdBy,
        entryEmpty,
        entryFull,
        fullTaken,
        exitFull,
        entryFull,
        entryEmpty,
        fullTaken,
        prevFull,
        prevEmpty,
        remFull,
        remEmpty,
        notes?.trim() || null,
      ]
    );

    const updateResult = await client.query(
      `UPDATE warehouses
       SET full_count = $1,
           empty_count = $2,
           updated_at = NOW(),
           updated_by = $3
       WHERE id = $4
       RETURNING *`,
      [remFull, remEmpty, createdBy, warehouse.id]
    );

    await client.query('COMMIT');

    const update = {
      ...insert.rows[0],
      warehouse_code: warehouse.code,
      warehouse_name: warehouse.name,
    };

    return {
      warehouse: formatWarehouse(updateResult.rows[0]),
      stock: formatWarehouse(updateResult.rows[0]),
      update: formatWarehouseUpdate(update),
      calculation: {
        entry_full: entryFull,
        entry_empty: entryEmpty,
        exit_full: exitFull,
        full_taken: fullTaken,
        previous_full: prevFull,
        previous_empty: prevEmpty,
        remaining_full: remFull,
        remaining_empty: remEmpty,
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
  warehouse_id = null,
  warehouse_code = null,
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

    const warehouse = await resolveWarehouseId(client, companyId, {
      warehouse_id,
      warehouse_code,
    });

    const locked = await client.query(
      `SELECT * FROM warehouses WHERE id = $1 FOR UPDATE`,
      [warehouse.id]
    );
    const stock = locked.rows[0];
    const prevFull = Number(stock.full_count) || 0;
    const prevEmpty = Number(stock.empty_count) || 0;
    const nextPump = pump ?? (Number(stock.pump_count) || 0);
    const nextDispenser = dispenser ?? (Number(stock.dispenser_count) || 0);

    await client.query(
      `INSERT INTO warehouse_updates (
         company_id, warehouse_id, courier_id, created_by,
         empty_in, full_in, full_out, entry_full, entry_empty, full_taken,
         previous_full, previous_empty, remaining_full, remaining_empty, notes
       ) VALUES ($1, $2, NULL, $3, 0, 0, 0, 0, 0, 0, $4, $5, $6, $7, $8)`,
      [
        companyId,
        warehouse.id,
        updatedBy,
        prevFull,
        prevEmpty,
        full,
        empty,
        notes?.trim() || 'Admin düzəlişi',
      ]
    );

    const updateResult = await client.query(
      `UPDATE warehouses
       SET full_count = $1,
           empty_count = $2,
           pump_count = $3,
           dispenser_count = $4,
           updated_at = NOW(),
           updated_by = $5
       WHERE id = $6
       RETURNING *`,
      [full, empty, nextPump, nextDispenser, updatedBy, warehouse.id]
    );

    // Köhnə warehouse_stock (pompa/dispenser şirkət səviyyəsi) sync — Novxanı üçün
    if (warehouse.code === 'novxani') {
      await client.query(
        `INSERT INTO warehouse_stock (
           company_id, full_count, empty_count, pump_count, dispenser_count, updated_at, updated_by
         ) VALUES ($1, $2, $3, $4, $5, NOW(), $6)
         ON CONFLICT (company_id)
         DO UPDATE SET
           full_count = EXCLUDED.full_count,
           empty_count = EXCLUDED.empty_count,
           pump_count = EXCLUDED.pump_count,
           dispenser_count = EXCLUDED.dispenser_count,
           updated_at = NOW(),
           updated_by = EXCLUDED.updated_by`,
        [companyId, full, empty, nextPump, nextDispenser, updatedBy]
      );
    }

    await client.query('COMMIT');
    return { warehouse: formatWarehouse(updateResult.rows[0]), stock: formatWarehouse(updateResult.rows[0]) };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** @deprecated — company-level stock; use listWarehouses / getWarehouseById */
export async function getWarehouseStock(client, companyId) {
  const wh = await getWarehouseByCode(client, companyId, 'novxani');
  return formatWarehouse(wh);
}
