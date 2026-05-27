/** Bu günün tarixi (Asia/Baku) — CURRENT_DATE əvəzinə */
export const BAKU_TODAY = `(NOW() AT TIME ZONE 'Asia/Baku')::date`;

/**
 * Kuryer: assigned / in_progress yalnız bu gün assign olunmuşlar.
 * Digər statuslar (məs. completed) bu şərtdən keçir.
 */
export function courierActiveOrdersClause(alias = 'o') {
  return `(
    ${alias}.status NOT IN ('assigned', 'in_progress')
    OR (${alias}.assigned_at AT TIME ZONE 'Asia/Baku')::date = ${BAKU_TODAY}
  )`;
}
