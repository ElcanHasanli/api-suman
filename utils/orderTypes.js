export const ORDER_TYPES = ['delivery', 'pickup'];

export function normalizeOrderType(value) {
  const t = String(value ?? 'delivery').trim().toLowerCase();
  if (!ORDER_TYPES.includes(t)) {
    throw Object.assign(
      new Error(`order_type must be ${ORDER_TYPES.join(' or ')}`),
      { status: 400, code: 'INVALID_ORDER_TYPE' }
    );
  }
  return t;
}

export function isPickupOrder(order) {
  return order?.order_type === 'pickup';
}
