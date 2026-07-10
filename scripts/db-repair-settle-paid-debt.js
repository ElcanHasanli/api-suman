/**
 * Müştəri borcu artıq azalıb, amma köhnə nişə sifarişləri hələ is_paid=false qalıbsa düzəldir.
 * npm run db:repair:settle-paid-debt
 *
 * Məntiq: unpaid_orders_remaining - customers.debt = artıq ödənilmiş, amma sifarişə yazılmamış məbləğ.
 * Bu məbləğ FIFO ilə köhnə sifarişlərə paylanır.
 */
import pool from '../config/database.js';
import { settleUnpaidOrdersFromDebtPayment } from '../utils/customerDebt.js';

async function repair() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const customers = await client.query(
      `SELECT c.id, c.company_id, c.debt,
              COALESCE((
                SELECT SUM(GREATEST(0, o.price - COALESCE(o.amount_paid, 0)))
                FROM orders o
                WHERE o.customer_id = c.id
                  AND o.company_id = c.company_id
                  AND o.status = 'completed'
                  AND o.is_paid = FALSE
              ), 0) AS unpaid_orders
       FROM customers c
       WHERE COALESCE((
         SELECT SUM(GREATEST(0, o.price - COALESCE(o.amount_paid, 0)))
         FROM orders o
         WHERE o.customer_id = c.id
           AND o.company_id = c.company_id
           AND o.status = 'completed'
           AND o.is_paid = FALSE
       ), 0) > c.debt + 0.001`
    );

    let totalSettled = 0;
    for (const row of customers.rows) {
      const alreadyCovered = Number(row.unpaid_orders) - Number(row.debt);
      if (alreadyCovered <= 0.001) continue;

      const settled = await settleUnpaidOrdersFromDebtPayment(client, {
        companyId: row.company_id,
        customerId: row.id,
        payAmount: alreadyCovered,
      });

      totalSettled += settled.length;
      console.log(
        `customer #${row.id}: unpaid_orders=${row.unpaid_orders}, debt=${row.debt}, settled ${settled.length} order(s)`
      );
    }

    await client.query('COMMIT');
    console.log(`✅ repair tamamlandı: ${customers.rows.length} müştəri, ${totalSettled} sifariş`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    process.exit(0);
  }
}

repair();
