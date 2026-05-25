export function buildDateFilter(column, period, startDate, endDate, params = []) {
  let clause = '';
  const p = [...params];

  if (period === 'today') {
    clause = ` AND DATE(${column}) = CURRENT_DATE`;
  } else if (period === 'week') {
    clause = ` AND ${column} >= CURRENT_DATE - INTERVAL '7 days'`;
  } else if (period === 'month') {
    clause = ` AND DATE_TRUNC('month', ${column}) = DATE_TRUNC('month', CURRENT_DATE)`;
  } else if (period === 'custom' && startDate && endDate) {
    p.push(startDate, endDate);
    clause = ` AND ${column} >= $${p.length - 1}::timestamp AND ${column} < ($${p.length}::date + INTERVAL '1 day')`;
  }

  return { clause, params: p };
}
