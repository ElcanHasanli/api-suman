import pool from '../config/database.js';
import { toBakuDateTimeString, normalizeDateOnly } from './bakuDate.js';
import { buildCompletedOrdersFilter, COMPLETED_ORDER_SELECT } from './historyQuery.js';
import { buildDateFilter } from './periodFilter.js';
import { buildHistoryDashboard, buildPerCourierDashboard } from './historyDashboard.js';
import { unpaidOrderAmount } from './orderCompletion.js';
import { fetchOrderExtras } from './orderExtras.js';
import { formatExpenseRow } from './expenseFormat.js';
import { listWarehouses, formatWarehouseUpdate } from './warehouse.js';
import { formatCustomerDisplay } from './customerName.js';

function roundMoney(value) {
  return Number(Number(value).toFixed(2));
}

export async function assertCompanyExists(companyId) {
  const result = await pool.query(
    'SELECT id, name, is_active, license_code FROM companies WHERE id = $1',
    [companyId]
  );
  if (!result.rows.length) {
    throw Object.assign(new Error('Company not found'), { status: 404 });
  }
  return result.rows[0];
}

async function fetchCompletedOrders(period, startDate, endDate, companyId) {
  const { clause, params } = buildCompletedOrdersFilter(
    period,
    startDate,
    endDate,
    companyId
  );
  const result = await pool.query(
    `${COMPLETED_ORDER_SELECT} WHERE ${clause} ORDER BY o.completed_at DESC`,
    params
  );
  const extrasMap = await fetchOrderExtras(
    result.rows.map((r) => r.id),
    companyId
  );
  return result.rows.map((row) => ({
    ...row,
    extras: extrasMap.get(row.id) ?? [],
  }));
}

async function fetchExpenses(period, startDate, endDate, companyId) {
  let query = `
    SELECT e.*, u.name AS courier_name
    FROM expenses e
    LEFT JOIN users u ON e.courier_id = u.id
    WHERE e.company_id = $1`;
  const params = [companyId];
  const df = buildDateFilter('e.created_at', period, startDate, endDate, params);
  query += df.clause + ' ORDER BY e.created_at DESC';
  const result = await pool.query(query, df.params);
  return result.rows.map(formatExpenseRow);
}

async function fetchDebtPayments(period, startDate, endDate, companyId) {
  let query = `
    SELECT dp.*, c.name AS customer_name, c.surname AS customer_surname,
           u.name AS recorded_by_name, u.role AS recorded_by_role
    FROM debt_payments dp
    JOIN customers c ON dp.customer_id = c.id
    JOIN users u ON dp.recorded_by = u.id
    WHERE dp.company_id = $1`;
  const params = [companyId];
  const df = buildDateFilter('dp.created_at', period, startDate, endDate, params);
  query += df.clause + ' ORDER BY dp.created_at DESC';
  const result = await pool.query(query, df.params);
  return result.rows;
}

function mapOrderRow(row) {
  return {
    ...row,
    customer_display_name: formatCustomerDisplay({
      name: row.customer_name ?? row.name,
      surname: row.customer_surname ?? row.surname,
    }),
    scheduled_date: normalizeDateOnly(row.scheduled_date),
    assigned_at_baku: row.assigned_at ? toBakuDateTimeString(row.assigned_at) : null,
    completed_at_baku: row.completed_at ? toBakuDateTimeString(row.completed_at) : null,
    remaining_amount: unpaidOrderAmount(row.price, row.amount_paid),
    customer_debt: row.customer_debt != null ? Number(row.customer_debt) : null,
  };
}

export async function getCompanyMonitor(companyId, {
  period = 'today',
  startDate = null,
  endDate = null,
} = {}) {
  const company = await assertCompanyExists(companyId);

  const [orders, expenses, debtPayments, activeOrders, warehouses, couriers] =
    await Promise.all([
      fetchCompletedOrders(period, startDate, endDate, companyId),
      fetchExpenses(period, startDate, endDate, companyId),
      fetchDebtPayments(period, startDate, endDate, companyId),
      pool.query(
        `SELECT o.*,
                c.name, c.surname, c.phone AS customer_phone, c.debt AS customer_debt,
                u.name AS courier_name
         FROM orders o
         LEFT JOIN customers c ON o.customer_id = c.id
         LEFT JOIN users u ON o.courier_id = u.id
         WHERE o.company_id = $1
           AND o.status IN ('pending', 'assigned', 'in_progress')
         ORDER BY o.created_at DESC
         LIMIT 100`,
        [companyId]
      ),
      listWarehouses(null, companyId),
      pool.query(
        `SELECT id, name, role, status FROM users
         WHERE company_id = $1 AND role IN ('admin', 'courier')
         ORDER BY role, name`,
        [companyId]
      ),
    ]);

  const dashboard = buildHistoryDashboard({
    orders,
    debtPayments,
    expenses,
  });

  return {
    company,
    period,
    startDate,
    endDate,
    generated_at: new Date().toISOString(),
    dashboard,
    by_courier: buildPerCourierDashboard({ orders, debtPayments, expenses }),
    active_orders: activeOrders.rows.map(mapOrderRow),
    completed_orders: orders.map(mapOrderRow),
    expenses,
    debtPayments,
    warehouses,
    users: couriers.rows,
    counts: {
      active_orders: activeOrders.rows.length,
      completed_orders: orders.length,
      expenses: expenses.length,
      debt_payments: debtPayments.length,
    },
  };
}

export async function getLiveOverview(period = 'today', startDate = null, endDate = null) {
  const companies = await pool.query(
    `SELECT id, name, is_active FROM companies ORDER BY name ASC`
  );

  const snapshots = await Promise.all(
    companies.rows.map(async (company) => {
      const [orders, expenses, debtPayments, activeCount] = await Promise.all([
        fetchCompletedOrders(period, startDate, endDate, company.id),
        fetchExpenses(period, startDate, endDate, company.id),
        fetchDebtPayments(period, startDate, endDate, company.id),
        pool.query(
          `SELECT COUNT(*)::int AS n FROM orders
           WHERE company_id = $1 AND status IN ('pending', 'assigned', 'in_progress')`,
          [company.id]
        ),
      ]);

      const dashboard = buildHistoryDashboard({ orders, debtPayments, expenses });

      return {
        company_id: company.id,
        company_name: company.name,
        is_active: company.is_active,
        active_orders: activeCount.rows[0].n,
        completed_orders: orders.length,
        sales: dashboard.sales.total,
        debt_given: dashboard.debt_given.total,
        credit: dashboard.credit.total,
        prepaid: dashboard.prepaid.total,
        courier_balance: dashboard.courier_balance.total,
        expenses: dashboard.expenses.total,
        net_balance: dashboard.net_balance.total,
      };
    })
  );

  const totals = snapshots.reduce(
    (acc, row) => {
      acc.active_orders += row.active_orders;
      acc.completed_orders += row.completed_orders;
      acc.sales = roundMoney(acc.sales + row.sales);
      acc.debt_given = roundMoney(acc.debt_given + row.debt_given);
      acc.credit = roundMoney(acc.credit + row.credit);
      acc.expenses = roundMoney(acc.expenses + row.expenses);
      acc.net_balance = roundMoney(acc.net_balance + row.net_balance);
      return acc;
    },
    {
      active_orders: 0,
      completed_orders: 0,
      sales: 0,
      debt_given: 0,
      credit: 0,
      expenses: 0,
      net_balance: 0,
    }
  );

  return {
    period,
    startDate,
    endDate,
    generated_at: new Date().toISOString(),
    totals,
    companies: snapshots,
  };
}

/**
 * Son əməliyyatlar (bütün şirkətlər və ya bir şirkət).
 * Polling ilə «canlı» feed üçün.
 */
export async function getLiveFeed({
  companyId = null,
  limit = 50,
  since = null,
} = {}) {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));

  function buildParams() {
    const params = [];
    const filters = { company: '', since: '' };
    if (companyId) {
      params.push(Number(companyId));
      filters.company = ` AND x.company_id = $${params.length}`;
    }
    if (since) {
      params.push(since);
      filters.since = ` AND x.event_at > $${params.length}::timestamptz`;
    }
    params.push(safeLimit);
    filters.limit = ` LIMIT $${params.length}`;
    return { params, filters };
  }

  const orderQ = buildParams();
  const expenseQ = buildParams();
  const debtQ = buildParams();
  const warehouseQ = buildParams();

  const [orders, expenses, debts, warehouse] = await Promise.all([
    pool.query(
      `SELECT * FROM (
         SELECT o.id, o.company_id, co.name AS company_name, o.status, o.price,
                o.payment_type, o.amount_paid, o.is_paid, o.created_at, o.updated_at,
                o.completed_at, o.courier_id,
                c.name AS customer_name, c.surname AS customer_surname,
                u.name AS courier_name,
                GREATEST(o.updated_at, COALESCE(o.completed_at, o.created_at)) AS event_at
         FROM orders o
         JOIN companies co ON co.id = o.company_id
         LEFT JOIN customers c ON c.id = o.customer_id
         LEFT JOIN users u ON u.id = o.courier_id
       ) x
       WHERE 1=1
         ${orderQ.filters.company}
         ${orderQ.filters.since}
       ORDER BY x.event_at DESC
       ${orderQ.filters.limit}`,
      orderQ.params
    ),
    pool.query(
      `SELECT * FROM (
         SELECT e.id, e.company_id, co.name AS company_name, e.amount, e.description,
                e.category, e.source, e.created_at AS event_at,
                u.name AS actor_name
         FROM expenses e
         JOIN companies co ON co.id = e.company_id
         LEFT JOIN users u ON u.id = COALESCE(e.courier_id, e.created_by)
       ) x
       WHERE 1=1
         ${expenseQ.filters.company}
         ${expenseQ.filters.since}
       ORDER BY x.event_at DESC
       ${expenseQ.filters.limit}`,
      expenseQ.params
    ),
    pool.query(
      `SELECT * FROM (
         SELECT dp.id, dp.company_id, co.name AS company_name, dp.amount,
                dp.order_id, dp.created_at AS event_at,
                c.name AS customer_name, c.surname AS customer_surname,
                u.name AS actor_name, u.role AS actor_role
         FROM debt_payments dp
         JOIN companies co ON co.id = dp.company_id
         JOIN customers c ON c.id = dp.customer_id
         JOIN users u ON u.id = dp.recorded_by
       ) x
       WHERE 1=1
         ${debtQ.filters.company}
         ${debtQ.filters.since}
       ORDER BY x.event_at DESC
       ${debtQ.filters.limit}`,
      debtQ.params
    ),
    pool.query(
      `SELECT * FROM (
         SELECT wu.id, wu.company_id, co.name AS company_name,
                wu.entry_full, wu.entry_empty, wu.exit_full, wu.full_taken,
                wu.full_in, wu.empty_in, wu.full_out,
                wu.created_at AS event_at,
                w.name AS warehouse_name, w.code AS warehouse_code,
                u.name AS actor_name
         FROM warehouse_updates wu
         JOIN companies co ON co.id = wu.company_id
         LEFT JOIN warehouses w ON w.id = wu.warehouse_id
         LEFT JOIN users u ON u.id = wu.courier_id
         WHERE wu.courier_id IS NOT NULL
       ) x
       WHERE 1=1
         ${warehouseQ.filters.company}
         ${warehouseQ.filters.since}
       ORDER BY x.event_at DESC
       ${warehouseQ.filters.limit}`,
      warehouseQ.params
    ),
  ]);

  const events = [];

  for (const row of orders.rows) {
    const customer = formatCustomerDisplay({
      name: row.customer_name,
      surname: row.customer_surname,
    });
    let type = 'order_updated';
    let message = `${row.company_name}: sifariş #${row.id} (${row.status})`;
    if (row.status === 'completed') {
      type = 'order_completed';
      message = `${row.company_name}: ${row.courier_name || 'Kuryer'} sifariş #${row.id} tamamladı — ${customer} · ${row.price} AZN`;
    } else if (row.status === 'assigned') {
      type = 'order_assigned';
      message = `${row.company_name}: sifariş #${row.id} ${row.courier_name || 'kuryer'}ə təyin olundu — ${customer}`;
    } else if (row.status === 'pending') {
      type = 'order_created';
      message = `${row.company_name}: yeni sifariş #${row.id} — ${customer}`;
    }

    events.push({
      type,
      company_id: row.company_id,
      company_name: row.company_name,
      entity_id: row.id,
      message,
      actor_name: row.courier_name,
      amount: Number(row.price),
      event_at: row.event_at,
      event_at_baku: toBakuDateTimeString(row.event_at),
      meta: {
        status: row.status,
        payment_type: row.payment_type,
        customer,
      },
    });
  }

  for (const row of expenses.rows) {
    events.push({
      type: 'expense_created',
      company_id: row.company_id,
      company_name: row.company_name,
      entity_id: row.id,
      message: `${row.company_name}: xərc ${row.amount} AZN — ${row.description || row.category || 'xərc'} (${row.actor_name || row.source})`,
      actor_name: row.actor_name,
      amount: Number(row.amount),
      event_at: row.event_at,
      event_at_baku: toBakuDateTimeString(row.event_at),
      meta: { category: row.category, source: row.source },
    });
  }

  for (const row of debts.rows) {
    const customer = formatCustomerDisplay({
      name: row.customer_name,
      surname: row.customer_surname,
    });
    events.push({
      type: 'debt_collected',
      company_id: row.company_id,
      company_name: row.company_name,
      entity_id: row.id,
      message: `${row.company_name}: borc ödənişi ${row.amount} AZN — ${customer} (${row.actor_name})`,
      actor_name: row.actor_name,
      amount: Number(row.amount),
      event_at: row.event_at,
      event_at_baku: toBakuDateTimeString(row.event_at),
      meta: { order_id: row.order_id, actor_role: row.actor_role, customer },
    });
  }

  for (const row of warehouse.rows) {
    const upd = formatWarehouseUpdate(row);
    events.push({
      type: 'warehouse_updated',
      company_id: row.company_id,
      company_name: row.company_name,
      entity_id: row.id,
      message: `${row.company_name}: ${row.actor_name || 'Kuryer'} · ${row.warehouse_name || 'Anbar'} — girdi ${upd.entry_full} dolu + ${upd.entry_empty} boş, çıxdı ${upd.exit_full} dolu`,
      actor_name: row.actor_name,
      amount: null,
      event_at: row.event_at,
      event_at_baku: toBakuDateTimeString(row.event_at),
      meta: {
        warehouse_code: row.warehouse_code,
        entry_full: upd.entry_full,
        entry_empty: upd.entry_empty,
        exit_full: upd.exit_full,
        full_taken: upd.full_taken,
      },
    });
  }

  events.sort((a, b) => new Date(b.event_at) - new Date(a.event_at));

  return {
    generated_at: new Date().toISOString(),
    company_id: companyId ? Number(companyId) : null,
    events: events.slice(0, safeLimit),
  };
}

export async function getCompanyOrders(companyId, { status = null, limit = 100 } = {}) {
  await assertCompanyExists(companyId);
  const params = [companyId];
  let query = `
    SELECT o.*,
           c.name, c.surname, c.phone AS customer_phone, c.debt AS customer_debt,
           u.name AS courier_name
    FROM orders o
    LEFT JOIN customers c ON o.customer_id = c.id
    LEFT JOIN users u ON o.courier_id = u.id
    WHERE o.company_id = $1`;

  if (status) {
    params.push(status);
    query += ` AND o.status = $${params.length}`;
  }

  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 100));
  params.push(safeLimit);
  query += ` ORDER BY o.created_at DESC LIMIT $${params.length}`;

  const result = await pool.query(query, params);
  return result.rows.map(mapOrderRow);
}

export async function getCompanyWarehouse(companyId) {
  await assertCompanyExists(companyId);
  const warehouses = await listWarehouses(null, companyId);
  const updates = await pool.query(
    `SELECT wu.*, u.name AS courier_name, cb.name AS created_by_name,
            w.code AS warehouse_code, w.name AS warehouse_name
     FROM warehouse_updates wu
     LEFT JOIN users u ON wu.courier_id = u.id
     JOIN users cb ON wu.created_by = cb.id
     LEFT JOIN warehouses w ON wu.warehouse_id = w.id
     WHERE wu.company_id = $1
     ORDER BY wu.created_at DESC
     LIMIT 50`,
    [companyId]
  );

  return {
    warehouses,
    updates: updates.rows.map(formatWarehouseUpdate),
  };
}

export async function getCompanyHistory(companyId, {
  period = 'today',
  startDate = null,
  endDate = null,
} = {}) {
  await assertCompanyExists(companyId);
  const [orders, expenses, debtPayments] = await Promise.all([
    fetchCompletedOrders(period, startDate, endDate, companyId),
    fetchExpenses(period, startDate, endDate, companyId),
    fetchDebtPayments(period, startDate, endDate, companyId),
  ]);

  return {
    period,
    startDate,
    endDate,
    dashboard: buildHistoryDashboard({ orders, debtPayments, expenses }),
    by_courier: buildPerCourierDashboard({ orders, debtPayments, expenses }),
    orders: orders.map(mapOrderRow),
    expenses,
    debtPayments,
  };
}
