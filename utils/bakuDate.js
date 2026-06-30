/** Bu günün tarixi (Asia/Baku) — CURRENT_DATE əvəzinə */
export const BAKU_TODAY = `(NOW() AT TIME ZONE 'Asia/Baku')::date`;

export const COURIER_COMPLETION_EDIT_HOURS = 24;

/**
 * Kuryer panelində görünən sifarişlər:
 * - assigned / in_progress: yalnız bu gün təyin olunmuşlar
 * - completed: tamamlanmadan sonra 24 saat ərzində
 */
export function courierVisibleOrdersClause(alias = 'o') {
  return `(
    (
      ${alias}.status IN ('assigned', 'in_progress')
      AND (${alias}.assigned_at AT TIME ZONE 'Asia/Baku')::date = ${BAKU_TODAY}
    )
    OR (
      ${alias}.status = 'completed'
      AND ${alias}.completed_at >= NOW() - INTERVAL '${COURIER_COMPLETION_EDIT_HOURS} hours'
    )
  )`;
}

/** @deprecated courierVisibleOrdersClause istifadə edin */
export function courierActiveOrdersClause(alias = 'o') {
  return courierVisibleOrdersClause(alias);
}

export function isWithinCourierEditWindow(completedAt) {
  if (!completedAt) return false;
  const ms = Date.now() - new Date(completedAt).getTime();
  return ms >= 0 && ms <= COURIER_COMPLETION_EDIT_HOURS * 60 * 60 * 1000;
}

/** UTC/timestamptz → Asia/Baku tarix (YYYY-MM-DD) */
export function toBakuDateString(dateInput) {
  if (!dateInput) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baku',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(dateInput));

  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return y && m && d ? `${y}-${m}-${d}` : null;
}

export function isBakuToday(dateInput) {
  if (!dateInput) return false;
  return toBakuDateString(dateInput) === toBakuDateString(new Date());
}

/** Kuryer panelində sifariş görünürlüyü (SQL clause ilə eyni məntiq). */
export function isOrderVisibleToCourier(order) {
  if (!order) return false;

  if (['assigned', 'in_progress'].includes(order.status)) {
    return isBakuToday(order.assigned_at);
  }

  if (order.status === 'completed') {
    return isWithinCourierEditWindow(order.completed_at);
  }

  return false;
}

/**
 * Kuryer sifarişə çıxışı.
 * @param {{ requireEditable?: boolean }} options — completed redaktə üçün true
 */
export function resolveCourierOrderAccess(user, order, { requireEditable = false } = {}) {
  if (!order) {
    return {
      allowed: false,
      status: 404,
      code: 'ORDER_NOT_FOUND',
      error: 'Order not found',
    };
  }

  if (user?.role === 'admin') {
    return { allowed: true };
  }

  if (user?.role !== 'courier') {
    return {
      allowed: false,
      status: 403,
      code: 'FORBIDDEN',
      error: 'Insufficient permissions',
    };
  }

  if (Number(order.courier_id) !== Number(user.id)) {
    return {
      allowed: false,
      status: 403,
      code: 'NOT_YOUR_ORDER',
      error: 'This order is assigned to another courier',
    };
  }

  if (!isOrderVisibleToCourier(order)) {
    return {
      allowed: false,
      status: 404,
      code: 'ORDER_NOT_VISIBLE',
      error: 'Order not found',
    };
  }

  if (requireEditable && order.status === 'completed' && !canCourierEditCompletion(order)) {
    const code = order.is_paid ? 'ORDER_ALREADY_PAID' : 'EDIT_WINDOW_EXPIRED';
    return {
      allowed: false,
      status: 403,
      code,
      error:
        code === 'ORDER_ALREADY_PAID'
          ? 'Order is already fully paid'
          : 'Completion edit window expired (24 hours)',
    };
  }

  return { allowed: true };
}

export function canCourierEditCompletion(order) {
  if (!order || order.status !== 'completed') return false;
  if (!isWithinCourierEditWindow(order.completed_at)) return false;
  if (order.is_paid) return false;
  return true;
}
