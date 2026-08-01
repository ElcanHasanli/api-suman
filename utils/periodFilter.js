import { BAKU_TODAY } from './bakuDate.js';

/** Sütun UTC saxlanılsa belə filtr Asia/Baku günü ilə */
function bakuDateColumn(column) {
  return `(${column} AT TIME ZONE 'Asia/Baku')::date`;
}

/**
 * period: yesterday | today | custom (+ startDate, endDate YYYY-MM-DD)
 * Köhnə uyğunluq: week | month | days2
 */
export function buildDateFilter(column, period, startDate, endDate, params = []) {
  let clause = '';
  const p = [...params];
  const col = bakuDateColumn(column);

  if (period === 'today') {
    clause = ` AND ${col} = ${BAKU_TODAY}`;
  } else if (period === 'yesterday') {
    clause = ` AND ${col} = (${BAKU_TODAY} - INTERVAL '1 day')::date`;
  } else if (period === 'days2') {
    clause = ` AND ${col} >= (${BAKU_TODAY} - INTERVAL '1 day')::date`;
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

/**
 * Günlük hesabat: today | yesterday | custom (yalnız 1 gün).
 * `date=YYYY-MM-DD` → həmin gün.
 */
export function resolveDailyPeriodQuery(query = {}) {
  let period = query.period || 'today';
  let startDate = query.startDate || null;
  let endDate = query.endDate || null;
  const date = query.date || null;

  if (date) {
    period = 'custom';
    startDate = date;
    endDate = date;
  }

  if (['week', 'month', 'days2'].includes(period)) {
    throw Object.assign(
      new Error(
        'Günlük hesabat üçün period: today | yesterday | custom (1 gün). Aralıq üçün /api/history/monthly istifadə edin.'
      ),
      { status: 400, code: 'DAILY_PERIOD_INVALID' }
    );
  }

  if (!['today', 'yesterday', 'custom'].includes(period)) {
    throw Object.assign(new Error('Invalid period'), {
      status: 400,
      code: 'INVALID_PERIOD',
    });
  }

  if (period === 'custom') {
    if (!startDate) {
      throw Object.assign(
        new Error('Günlük hesabat üçün date və ya startDate lazımdır (YYYY-MM-DD)'),
        { status: 400, code: 'DAILY_DATE_REQUIRED' }
      );
    }
    endDate = endDate || startDate;
    if (startDate !== endDate) {
      throw Object.assign(
        new Error('Günlük hesabat yalnız 1 gün üçündür (startDate = endDate)'),
        { status: 400, code: 'DAILY_SINGLE_DAY_ONLY' }
      );
    }
  }

  return { period, startDate, endDate };
}

/**
 * Aylıq / aralıq hesabat: custom range və ya week | days2 | month.
 */
export function resolveRangePeriodQuery(query = {}) {
  let period = query.period || 'custom';
  let startDate = query.startDate || null;
  let endDate = query.endDate || null;

  if (['today', 'yesterday'].includes(period)) {
    throw Object.assign(
      new Error(
        'Aylıq hesabat üçün period: custom | week | days2 | month (+ startDate/endDate)'
      ),
      { status: 400, code: 'RANGE_PERIOD_INVALID' }
    );
  }

  if (period === 'custom') {
    if (!startDate || !endDate) {
      throw Object.assign(
        new Error('Aylıq hesabat üçün startDate və endDate lazımdır (YYYY-MM-DD)'),
        { status: 400, code: 'RANGE_DATES_REQUIRED' }
      );
    }
    if (startDate > endDate) {
      throw Object.assign(new Error('startDate endDate-dən böyük ola bilməz'), {
        status: 400,
        code: 'INVALID_DATE_RANGE',
      });
    }
  } else if (!['week', 'days2', 'month'].includes(period)) {
    throw Object.assign(new Error('Invalid period'), {
      status: 400,
      code: 'INVALID_PERIOD',
    });
  }

  return { period, startDate, endDate };
}
