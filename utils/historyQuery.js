export function buildCompletedOrdersFilter(period, startDate, endDate, companyId = null) {
  let clause = `o.status = 'completed'`;
  const params = [];

  if (companyId) {
    params.push(companyId);
    clause += ` AND o.company_id = $${params.length}`;
  }

  if (period === 'today') {
    clause += ` AND DATE(o.completed_at) = CURRENT_DATE`;
  } else if (period === 'week') {
    clause += ` AND o.completed_at >= CURRENT_DATE - INTERVAL '7 days'`;
  } else if (period === 'month') {
    clause += ` AND DATE_TRUNC('month', o.completed_at) = DATE_TRUNC('month', CURRENT_DATE)`;
  } else if (period === 'custom' && startDate && endDate) {
    params.push(startDate, endDate);
    clause += ` AND o.completed_at >= $${params.length - 1}::timestamp AND o.completed_at < ($${params.length}::date + INTERVAL '1 day')`;
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
