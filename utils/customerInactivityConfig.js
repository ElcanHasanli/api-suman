/** Test: 1. Production: `.env` → `CUSTOMER_INACTIVITY_MINUTES=43200` (30 gün) */
export const INACTIVITY_MINUTES = Number(
  process.env.CUSTOMER_INACTIVITY_MINUTES ?? 1
);

export function inactivityPeriodLabel() {
  const m = INACTIVITY_MINUTES;
  if (m < 60) return `${m} dəqiqədir`;
  if (m < 1440) return `${Math.round(m / 60)} saatdır`;
  const days = Math.round(m / 1440);
  return days === 1 ? '1 gündür' : `${days}+ gündür`;
}
