import { BAKU_TODAY } from './bakuDate.js';

/** Sütun UTC saxlanılsa belə filtr Asia/Baku günü ilə */
function bakuDateColumn(column) {
  return `(${column} AT TIME ZONE 'Asia/Baku')::date`;
}

/**
 * period: yesterday | today | custom (+ startDate, endDate YYYY-MM-DD)
 * Köhnə uyğunluq: week | month
 */
export function buildDateFilter(column, period, startDate, endDate, params = []) {
  let clause = '';
  const p = [...params];
  const col = bakuDateColumn(column);

  if (period === 'today') {
    clause = ` AND ${col} = ${BAKU_TODAY}`;
  } else if (period === 'yesterday') {
    clause = ` AND ${col} = (${BAKU_TODAY} - INTERVAL '1 day')::date`;
  } else if (period === 'week') {
    clause = ` AND ${col} >= (${BAKU_TODAY} - INTERVAL '6 days')::date`;
  } else if (period === 'month') {
    clause = ` AND ${col} >= date_trunc('month', ${BAKU_TODAY})::date`;
  } else if (period === 'custom' && startDate && endDate) {
    p.push(startDate, endDate);
    clause = ` AND ${col} >= $${p.length - 1}::date AND ${col} <= $${p.length}::date`;
  }

  return { clause, params: p };
}
