import { BAKU_TODAY } from './bakuDate.js';

function completedAtBaku() {
  return `(o.completed_at AT TIME ZONE 'Asia/Baku')::date`;
}

export function buildCompletedOrdersFilter(period, startDate, endDate, companyId = null) {
  let clause = `o.status = 'completed'`;
  const params = [];

  if (companyId) {
    params.push(companyId);
    clause += ` AND o.company_id = $${params.length}`;
  }

  const col = completedAtBaku();

  if (period === 'today') {
    clause += ` AND ${col} = ${BAKU_TODAY}`;
  } else if (period === 'yesterday') {
    clause += ` AND ${col} = (${BAKU_TODAY} - INTERVAL '1 day')::date`;
  } else if (period === 'week') {
    clause += ` AND ${col} >= (${BAKU_TODAY} - INTERVAL '6 days')::date`;
  } else if (period === 'month') {
    clause += ` AND ${col} >= date_trunc('month', ${BAKU_TODAY})::date`;
  } else if (period === 'custom' && startDate && endDate) {
    params.push(startDate, endDate);
    clause += ` AND ${col} >= $${params.length - 1}::date AND ${col} <= $${params.length}::date`;
  }

  return { clause, params };
}

export const COMPLETED_ORDER_SELECT = `
  SELECT o.*,
         c.name AS customer_name,
         c.surname AS customer_surname,
         c.phone AS customer_phone,
         u.name AS courier_name
  FROM orders o
  LEFT JOIN customers c ON o.customer_id = c.id
  LEFT JOIN users u ON o.courier_id = u.id
`;
