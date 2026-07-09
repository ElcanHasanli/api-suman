import pool from '../config/database.js';

export const EXTRA_TYPES = ['pump', 'dispenser', 'fine', 'other'];

export const EXTRA_LABELS = {
  pump: 'Pompa',
  dispenser: 'Dispenser',
  fine: 'Cərimə',
  other: 'Digər',
};

export function normalizeExtraType(value) {
  const t = String(value ?? 'other').trim().toLowerCase();
  if (!EXTRA_TYPES.includes(t)) {
    throw Object.assign(
      new Error(`extra type must be one of: ${EXTRA_TYPES.join(', ')}`),
      { status: 400, code: 'INVALID_EXTRA_TYPE' }
    );
  }
  return t;
}

export function parseExtrasInput(extras) {
  if (!extras) return [];
  if (!Array.isArray(extras)) {
    throw Object.assign(new Error('extras must be an array'), { status: 400 });
  }

  return extras.map((item, index) => {
    const type = normalizeExtraType(item.type ?? item.extra_type);
    const quantity = Math.max(1, parseInt(item.quantity, 10) || 1);
    const unitPrice =
      item.unit_price != null && item.unit_price !== ''
        ? Number(item.unit_price)
        : item.amount != null
          ? Number(item.amount) / quantity
          : 0;
    const amount =
      item.amount != null && item.amount !== ''
        ? Number(item.amount)
        : Number((unitPrice * quantity).toFixed(2));

    if (!Number.isFinite(amount) || amount < 0) {
      throw Object.assign(new Error(`extras[${index}].amount must be non-negative`), {
        status: 400,
      });
    }

    return {
      extra_type: type,
      description: item.description?.trim() || EXTRA_LABELS[type] || null,
      quantity,
      unit_price: Number(unitPrice.toFixed(2)),
      amount,
    };
  });
}

export function sumExtrasAmount(extras) {
  return extras.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
}

export async function fetchOrderExtras(orderIds, companyId) {
  if (!orderIds.length) return new Map();

  const result = await pool.query(
    `SELECT * FROM order_extras
     WHERE company_id = $1 AND order_id = ANY($2::int[])
     ORDER BY id ASC`,
    [companyId, orderIds]
  );

  const map = new Map();
  for (const row of result.rows) {
    if (!map.has(row.order_id)) map.set(row.order_id, []);
    map.get(row.order_id).push(formatExtraRow(row));
  }
  return map;
}

export function formatExtraRow(row) {
  return {
    id: row.id,
    order_id: row.order_id,
    extra_type: row.extra_type,
    type: row.extra_type,
    label: EXTRA_LABELS[row.extra_type] ?? row.extra_type,
    description: row.description,
    quantity: Number(row.quantity),
    unit_price: Number(row.unit_price),
    amount: Number(row.amount),
  };
}

export async function insertOrderExtras(client, companyId, orderId, extras) {
  const rows = [];
  for (const item of extras) {
    const result = await client.query(
      `INSERT INTO order_extras (
         company_id, order_id, extra_type, description, quantity, unit_price, amount
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        companyId,
        orderId,
        item.extra_type,
        item.description,
        item.quantity,
        item.unit_price,
        item.amount,
      ]
    );
    rows.push(result.rows[0]);
  }
  return rows;
}

export async function replaceOrderExtras(client, companyId, orderId, extras) {
  await client.query('DELETE FROM order_extras WHERE order_id = $1 AND company_id = $2', [
    orderId,
    companyId,
  ]);
  return insertOrderExtras(client, companyId, orderId, extras);
}

export async function adjustWarehouseForExtras(client, companyId, extras, direction = -1) {
  let pumpDelta = 0;
  let dispenserDelta = 0;

  for (const item of extras) {
    if (item.extra_type === 'pump') pumpDelta += item.quantity;
    if (item.extra_type === 'dispenser') dispenserDelta += item.quantity;
  }

  if (!pumpDelta && !dispenserDelta) return null;

  const sign = direction < 0 ? -1 : 1;
  const result = await client.query(
    `INSERT INTO warehouse_stock (company_id, full_count, empty_count, pump_count, dispenser_count)
     VALUES ($1, 0, 0, GREATEST(0, $2), GREATEST(0, $3))
     ON CONFLICT (company_id)
     DO UPDATE SET
       pump_count = GREATEST(0, warehouse_stock.pump_count + $4),
       dispenser_count = GREATEST(0, warehouse_stock.dispenser_count + $5),
       updated_at = NOW()
     RETURNING pump_count, dispenser_count`,
    [
      companyId,
      Math.max(0, sign * pumpDelta),
      Math.max(0, sign * dispenserDelta),
      sign * pumpDelta,
      sign * dispenserDelta,
    ]
  );

  return result.rows[0];
}

export function deriveUnitPrice(order) {
  if (order.unit_price != null && order.unit_price !== '') {
    return Number(order.unit_price);
  }
  const bidons =
    Number(order.full_bidons_given ?? order.bidons_count ?? 1) || 1;
  return Number(order.price ?? 0) / bidons;
}

export function waterAmount(order) {
  const bidons =
    Number(order.full_bidons_given ?? order.bidons_count ?? 0) || 0;
  return Number((deriveUnitPrice(order) * bidons).toFixed(2));
}
