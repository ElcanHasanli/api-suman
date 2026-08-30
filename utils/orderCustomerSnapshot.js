import { formatCustomerDisplay } from './customerName.js';

/** Sifariş sorğularında müştəri join + silinmiş müştəri snapshot */
export const ORDER_CUSTOMER_JOIN_SELECT = `
  COALESCE(c.name, o.customer_name_snapshot) AS name,
  COALESCE(c.surname, o.customer_surname_snapshot) AS surname,
  COALESCE(c.phone, o.customer_phone_snapshot) AS customer_phone,
  COALESCE(c.phone2, o.customer_phone2_snapshot) AS customer_phone2,
  c.address AS customer_address,
  c.active_bidons,
  c.debt,
  c.deposit AS customer_deposit,
  c.notes AS customer_notes
`;

export const COMPLETED_ORDER_CUSTOMER_SELECT = `
  COALESCE(c.name, o.customer_name_snapshot) AS customer_name,
  COALESCE(c.surname, o.customer_surname_snapshot) AS customer_surname,
  COALESCE(c.phone, o.customer_phone_snapshot) AS customer_phone,
  c.debt AS customer_debt
`;

export function customerSnapshotFromRow(customer) {
  return {
    customer_name_snapshot: customer.name ?? null,
    customer_surname_snapshot: customer.surname ?? null,
    customer_phone_snapshot: customer.phone ?? null,
    customer_phone2_snapshot: customer.phone2 ?? null,
  };
}

export async function snapshotCustomerOnOrders(client, companyId, customerId, customer) {
  const snap = customerSnapshotFromRow(customer);
  await client.query(
    `UPDATE orders
     SET customer_name_snapshot = $3,
         customer_surname_snapshot = $4,
         customer_phone_snapshot = $5,
         customer_phone2_snapshot = $6
     WHERE company_id = $1 AND customer_id = $2`,
    [
      companyId,
      customerId,
      snap.customer_name_snapshot,
      snap.customer_surname_snapshot,
      snap.customer_phone_snapshot,
      snap.customer_phone2_snapshot,
    ]
  );
}

export async function snapshotCustomerOnDebtPayments(client, companyId, customerId, customer) {
  const customerName = formatCustomerDisplay(customer) || null;
  await client.query(
    `UPDATE debt_payments
     SET customer_name_snapshot = $3
     WHERE company_id = $1 AND customer_id = $2`,
    [companyId, customerId, customerName]
  );
}
