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

export function canCourierEditCompletion(order) {
  if (!order || order.status !== 'completed') return false;
  if (!isWithinCourierEditWindow(order.completed_at)) return false;
  if (order.is_paid) return false;
  return true;
}
