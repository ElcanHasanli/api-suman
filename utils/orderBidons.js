import { isPickupOrder } from './orderTypes.js';

function toInt(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Sifariş siyahısı / detal üçün bidon məlumatları.
 * Kuryer tamamlayanda qeyd etdiyi `empty_bidons_returned` / `full_bidons_given` daxildir.
 */
export function buildOrderBidonFields(order) {
  if (!order) return {};

  const bidonsCount = toInt(order.bidons_count) ?? 0;
  const isCompleted = order.status === 'completed';
  const isOpen = ['pending', 'assigned', 'in_progress'].includes(order.status);
  const pickup = isPickupOrder(order);

  const fullGivenRaw = toInt(order.full_bidons_given);
  const fullGiven = fullGivenRaw ?? (isCompleted ? bidonsCount : bidonsCount);

  const emptyReturnedRaw = toInt(order.empty_bidons_returned);
  const emptyReturned = isOpen && emptyReturnedRaw == null ? null : emptyReturnedRaw ?? 0;

  const emptyBefore =
    toInt(order.customer_active_bidons_before) ?? toInt(order.active_bidons);

  let emptyAfter = toInt(order.customer_active_bidons_after);
  if (emptyAfter == null && isCompleted && emptyBefore != null) {
    if (pickup) {
      emptyAfter = Math.max(0, emptyBefore - (emptyReturned ?? 0));
    } else {
      emptyAfter = Math.max(0, emptyBefore + fullGiven - (emptyReturned ?? 0));
    }
  }

  return {
    bidons_count: bidonsCount,
    full_bidons_given: pickup ? (fullGivenRaw ?? 0) : fullGiven,
    empty_bidons_returned: emptyReturned,
    customer_active_bidons_before: emptyBefore,
    /** Təyin olunub / icra olunur — müştəridə boş bidon (sifariş tamamlanana qədər) */
    customer_empty_bidons_during: isOpen ? emptyBefore : null,
    /** Tamamlandıqdan sonra müştəridə qalan boş bidon */
    customer_active_bidons_after: isCompleted ? emptyAfter : null,
  };
}

export async function snapshotCustomerBidonsAfter(client, orderId, customerId) {
  if (!customerId) return null;
  const result = await client.query(
    'SELECT active_bidons FROM customers WHERE id = $1',
    [customerId]
  );
  const after = toInt(result.rows[0]?.active_bidons);
  if (after != null) {
    await client.query(
      'UPDATE orders SET customer_active_bidons_after = $1 WHERE id = $2',
      [after, orderId]
    );
  }
  return after;
}
