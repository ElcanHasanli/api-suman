import { unpaidOrderAmount } from './orderCompletion.js';
import { deriveUnitPrice, EXTRA_LABELS } from './orderExtras.js';
import { formatCustomerDisplay } from './customerName.js';
import { formatExpenseRow } from './expenseFormat.js';
import { isPickupOrder } from './orderTypes.js';

function roundMoney(value) {
  return Number(Number(value).toFixed(2));
}

function customerLabel(row) {
  return formatCustomerDisplay({
    name: row.customer_name ?? row.name,
    surname: row.customer_surname ?? row.surname,
  });
}

function matchesCourier(order, courierId) {
  if (!courierId) return true;
  return Number(order.courier_id) === Number(courierId);
}

function orderExtrasTotal(order) {
  if (Array.isArray(order.extras)) {
    return order.extras.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
  }
  return Number(order.extras_total ?? 0);
}

function orderSalesTotal(order) {
  if (isPickupOrder(order)) return 0;
  return roundMoney(Number(order.price ?? 0));
}

function orderUncollected(order) {
  if (isPickupOrder(order)) return 0;

  if (order.payment_type === 'credit') {
    return unpaidOrderAmount(order.price, order.amount_paid);
  }

  if (order.is_prepaid) {
    return roundMoney(Number(order.prepaid_amount ?? 0));
  }

  return unpaidOrderAmount(order.price, order.amount_paid);
}

function orderCollected(order) {
  const orderPaid = Number(order.amount_paid ?? 0);
  const debtPaid = Number(order.debt_paid_at_completion ?? 0);
  return roundMoney(orderPaid + debtPaid);
}

function bucketWaterTier(map, unitPrice, bidons, amount) {
  const key = roundMoney(unitPrice).toFixed(2);
  if (!map.has(key)) {
    map.set(key, { unit_price: roundMoney(unitPrice), bidons: 0, amount: 0 });
  }
  const bucket = map.get(key);
  bucket.bidons += bidons;
  bucket.amount = roundMoney(bucket.amount + amount);
}

function bucketExtra(map, extra) {
  const type = extra.extra_type ?? extra.type;
  if (!map.has(type)) {
    map.set(type, {
      type,
      label: EXTRA_LABELS[type] ?? type,
      count: 0,
      amount: 0,
    });
  }
  const bucket = map.get(type);
  bucket.count += Number(extra.quantity ?? 1);
  bucket.amount = roundMoney(bucket.amount + Number(extra.amount ?? 0));
}

export function buildSalesBox(orders, courierId = null) {
  const filtered = orders.filter((o) => matchesCourier(o, courierId) && !isPickupOrder(o));
  const waterMap = new Map();
  const extrasMap = new Map();
  const byCourierMap = new Map();

  for (const order of filtered) {
    const bidons =
      Number(order.full_bidons_given ?? order.bidons_count ?? 0) || 0;
    const unitPrice = deriveUnitPrice(order);
    const water = roundMoney(unitPrice * bidons);
    bucketWaterTier(waterMap, unitPrice, bidons, water);

    for (const extra of order.extras ?? []) {
      bucketExtra(extrasMap, extra);
    }

    const courierKey = order.courier_id ?? 'unassigned';
    if (!byCourierMap.has(courierKey)) {
      byCourierMap.set(courierKey, {
        courier_id: order.courier_id ?? null,
        courier_name: order.courier_name ?? 'Təyin olunmayıb',
        total: 0,
        water: [],
        extras: [],
        orders: [],
      });
    }

    const courierBucket = byCourierMap.get(courierKey);
    courierBucket.total = roundMoney(courierBucket.total + orderSalesTotal(order));
    courierBucket.orders.push({
      id: order.id,
      customer: customerLabel(order),
      bidons,
      unit_price: unitPrice,
      water_amount: water,
      extras: order.extras ?? [],
      total: orderSalesTotal(order),
      completed_at: order.completed_at,
    });
  }

  const water = [...waterMap.values()].sort((a, b) => a.unit_price - b.unit_price);
  const extras = [...extrasMap.values()];
  const waterTotal = roundMoney(water.reduce((s, row) => s + row.amount, 0));
  const extrasTotal = roundMoney(extras.reduce((s, row) => s + row.amount, 0));

  for (const courierBucket of byCourierMap.values()) {
    const courierWaterMap = new Map();
    const courierExtrasMap = new Map();
    for (const item of courierBucket.orders) {
      bucketWaterTier(courierWaterMap, item.unit_price, item.bidons, item.water_amount);
      for (const extra of item.extras) bucketExtra(courierExtrasMap, extra);
    }
    courierBucket.water = [...courierWaterMap.values()];
    courierBucket.extras = [...courierExtrasMap.values()];
  }

  return {
    total: roundMoney(waterTotal + extrasTotal),
    water_total: waterTotal,
    extras_total: extrasTotal,
    water,
    extras,
    by_courier: [...byCourierMap.values()].sort((a, b) =>
      String(a.courier_name).localeCompare(String(b.courier_name))
    ),
    orders: filtered.map((order) => ({
      id: order.id,
      customer: customerLabel(order),
      courier_id: order.courier_id,
      courier_name: order.courier_name,
      bidons: Number(order.full_bidons_given ?? order.bidons_count ?? 0),
      unit_price: deriveUnitPrice(order),
      water_amount: roundMoney(deriveUnitPrice(order) * (Number(order.full_bidons_given ?? order.bidons_count ?? 0) || 0)),
      extras: order.extras ?? [],
      total: orderSalesTotal(order),
      completed_at: order.completed_at,
    })),
  };
}

/**
 * «Borc verildi» — yalnız kuryerin müştəridən aldığı borc ödənişi.
 * Admin panelindən borc sıfırlama / mark-paid buraya düşmür.
 */
export function buildDebtGivenBox(debtPayments, orders, courierId = null) {
  const orderCourierMap = new Map(
    orders.map((o) => [Number(o.id), { courier_id: o.courier_id, courier_name: o.courier_name }])
  );

  const filtered = debtPayments.filter((dp) => {
    // Yalnız kuryer qeydi (tamamlama zamanı debt_paid)
    if (dp.recorded_by_role && dp.recorded_by_role !== 'courier') return false;
    if (!dp.recorded_by_role && !dp.order_id) return false;

    if (!courierId) return true;

    if (dp.order_id) {
      const orderMeta = orderCourierMap.get(Number(dp.order_id));
      if (orderMeta) {
        return Number(orderMeta.courier_id) === Number(courierId);
      }
    }
    return Number(dp.recorded_by) === Number(courierId);
  });

  const customers = filtered.map((dp) => ({
    id: dp.id,
    customer_id: dp.customer_id,
    customer: formatCustomerDisplay({
      name: dp.customer_name,
      surname: dp.customer_surname,
    }),
    amount: roundMoney(dp.amount),
    order_id: dp.order_id,
    recorded_by_name: dp.recorded_by_name,
    recorded_by_role: dp.recorded_by_role ?? null,
    created_at: dp.created_at,
  }));

  return {
    total: roundMoney(customers.reduce((s, row) => s + row.amount, 0)),
    count: customers.length,
    customers,
  };
}

/**
 * Ödənilməmiş qalıq — həm nişə, həm qismən nağd/kart
 * (summary.unpaidCreditAmount ilə eyni məntiq).
 */
export function buildCreditBox(orders, courierId = null) {
  const filtered = orders.filter((o) => {
    if (!matchesCourier(o, courierId) || isPickupOrder(o) || o.is_paid) {
      return false;
    }
    return unpaidOrderAmount(o.price, o.amount_paid) > 0.001;
  });

  const customers = filtered.map((order) => {
    const amount = unpaidOrderAmount(order.price, order.amount_paid);
    const isCredit = order.payment_type === 'credit';
    return {
      order_id: order.id,
      customer_id: order.customer_id,
      customer: customerLabel(order),
      courier_id: order.courier_id,
      courier_name: order.courier_name,
      amount: roundMoney(amount),
      price: roundMoney(order.price),
      amount_paid: roundMoney(order.amount_paid ?? 0),
      payment_type: order.payment_type,
      kind: isCredit ? 'credit' : 'partial',
      completed_at: order.completed_at,
    };
  });

  return {
    total: roundMoney(customers.reduce((s, row) => s + row.amount, 0)),
    count: customers.length,
    customers,
  };
}

export function buildPrepaidBox(orders, courierId = null) {
  const filtered = orders.filter(
    (o) => matchesCourier(o, courierId) && !isPickupOrder(o) && o.is_prepaid
  );

  const customers = filtered.map((order) => ({
    order_id: order.id,
    customer_id: order.customer_id,
    customer: customerLabel(order),
    courier_id: order.courier_id,
    courier_name: order.courier_name,
    amount: roundMoney(order.prepaid_amount ?? 0),
    price: roundMoney(order.price),
    completed_at: order.completed_at,
  }));

  return {
    total: roundMoney(customers.reduce((s, row) => s + row.amount, 0)),
    count: customers.length,
    customers,
  };
}

export function buildExpensesBox(expenses, courierId = null) {
  const filtered = expenses.filter((expense) => {
    if (!courierId) return true;
    if (expense.source === 'admin') return false;
    return Number(expense.courier_id) === Number(courierId);
  });

  const byCourierMap = new Map();
  for (const expense of filtered) {
    const key =
      expense.source === 'admin'
        ? `admin:${expense.created_by}`
        : `courier:${expense.courier_id}`;
    if (!byCourierMap.has(key)) {
      byCourierMap.set(key, {
        courier_id: expense.courier_id ?? null,
        courier_name:
          expense.source === 'admin'
            ? 'Admin'
            : expense.courier_name ?? 'Kuryer',
        source: expense.source,
        total: 0,
        items: [],
      });
    }
    const bucket = byCourierMap.get(key);
    bucket.total = roundMoney(bucket.total + Number(expense.amount));
    bucket.items.push(formatExpenseRow(expense));
  }

  return {
    total: roundMoney(filtered.reduce((s, row) => s + Number(row.amount), 0)),
    count: filtered.length,
    items: filtered.map(formatExpenseRow),
    by_courier: [...byCourierMap.values()],
  };
}

export function buildCourierBalanceBox(sales, debtGiven, credit, prepaid, orders, courierId = null) {
  const filtered = orders.filter((o) => matchesCourier(o, courierId) && !isPickupOrder(o));

  // credit.total artıq nişə + qismən ödənilməmişi əhatə edir — iki dəfə çıxılmasın
  const partialUnpaid = roundMoney(
    filtered
      .filter((o) => o.payment_type !== 'credit' && !o.is_prepaid && !o.is_paid)
      .reduce((s, o) => s + unpaidOrderAmount(o.price, o.amount_paid), 0)
  );

  const total = roundMoney(
    sales.total + debtGiven.total - credit.total - prepaid.total
  );

  const collected = roundMoney(
    filtered.reduce((s, o) => s + orderCollected(o), 0) + debtGiven.total
  );

  return {
    total,
    collected,
    formula: {
      sales: sales.total,
      debt_given: debtGiven.total,
      credit: credit.total,
      prepaid: prepaid.total,
      partial_unpaid: partialUnpaid,
    },
    note: 'total = satış + borc verildi − ödənilməmiş (nişə + qismən) − ödənilib',
  };
}

export function buildNetBalanceBox(courierBalance, expenses) {
  return {
    total: roundMoney(courierBalance.total - expenses.total),
    courier_balance: courierBalance.total,
    expenses: expenses.total,
    formula: 'qalıq = kuryerdə qalıq − xərclər',
  };
}

export function buildHistoryDashboard({ orders, debtPayments, expenses, courierId = null }) {
  const sales = buildSalesBox(orders, courierId);
  const debtGiven = buildDebtGivenBox(debtPayments, orders, courierId);
  const credit = buildCreditBox(orders, courierId);
  const prepaid = buildPrepaidBox(orders, courierId);
  const expensesBox = buildExpensesBox(expenses, courierId);
  const courierBalance = buildCourierBalanceBox(
    sales,
    debtGiven,
    credit,
    prepaid,
    orders,
    courierId
  );
  const netBalance = buildNetBalanceBox(courierBalance, expensesBox);

  return {
    sales,
    debt_given: debtGiven,
    credit,
    prepaid,
    courier_balance: courierBalance,
    expenses: expensesBox,
    net_balance: netBalance,
  };
}

export function buildPerCourierDashboard({ orders, debtPayments, expenses }) {
  const courierIds = new Set();
  for (const order of orders) {
    if (order.courier_id) courierIds.add(Number(order.courier_id));
  }
  for (const expense of expenses) {
    if (expense.courier_id) courierIds.add(Number(expense.courier_id));
  }

  const couriers = [...courierIds].map((courierId) => {
    const courierName =
      orders.find((o) => Number(o.courier_id) === courierId)?.courier_name ??
      expenses.find((e) => Number(e.courier_id) === courierId)?.courier_name ??
      `Kuryer #${courierId}`;

    const dashboard = buildHistoryDashboard({
      orders,
      debtPayments,
      expenses,
      courierId,
    });

    return {
      courier_id: courierId,
      courier_name: courierName,
      ...dashboard,
    };
  });

  return couriers.sort((a, b) => String(a.courier_name).localeCompare(String(b.courier_name)));
}
