import express from 'express';
import pool from '../config/database.js';
import { authenticateToken, authorizeRole, requireTenant } from '../middleware/auth.js';
import { buildExcelBuffer, sendExcel } from '../utils/excel.js';
import { parsePhoneFields, normalizePhone, DUPLICATE_PHONE_ERROR } from '../utils/phone.js';
import { parseCustomerName, formatCustomerDisplay } from '../utils/customerName.js';

const router = express.Router();

router.use(authenticateToken, requireTenant);

const customerColumns = [
  { header: 'ID', key: 'id', width: 8 },
  { header: 'Ad', key: 'display_name', width: 22 },
  { header: 'Telefon', key: 'phone', width: 14 },
  { header: 'Telefon 2', key: 'phone2', width: 14 },
  { header: 'Ünvan', key: 'address', width: 28 },
  { header: 'Qiymət', key: 'price', width: 10 },
  { header: 'Aktiv bidon', key: 'active_bidons', width: 12 },
  { header: 'Borc', key: 'debt', width: 10 },
];

async function fetchCustomerDetail(customerId, companyId) {
  const customerResult = await pool.query(
    'SELECT * FROM customers WHERE id = $1 AND company_id = $2',
    [customerId, companyId]
  );
  if (!customerResult.rows.length) return null;

  const [statsResult, ordersResult, debtPaymentsResult] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*)::int AS total_orders,
         COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_orders,
         COUNT(*) FILTER (WHERE status IN ('assigned', 'in_progress'))::int AS active_orders,
         MAX(created_at) AS last_order_at,
         MAX(completed_at) AS last_completed_at,
         COALESCE(SUM(price) FILTER (WHERE status = 'completed'), 0) AS total_order_value
       FROM orders
       WHERE customer_id = $1 AND company_id = $2`,
      [customerId, companyId]
    ),
    pool.query(
      `SELECT o.id, o.status, o.bidons_count, o.address, o.price, o.payment_type,
              o.amount_paid, o.is_paid, o.notes, o.created_at, o.completed_at,
              o.assigned_at, u.name AS courier_name
       FROM orders o
       LEFT JOIN users u ON o.courier_id = u.id
       WHERE o.customer_id = $1 AND o.company_id = $2
       ORDER BY o.created_at DESC
       LIMIT 20`,
      [customerId, companyId]
    ),
    pool.query(
      `SELECT dp.id, dp.amount, dp.previous_debt, dp.new_debt, dp.created_at,
              u.name AS recorded_by_name
       FROM debt_payments dp
       LEFT JOIN users u ON dp.recorded_by = u.id
       WHERE dp.customer_id = $1 AND dp.company_id = $2
       ORDER BY dp.created_at DESC
       LIMIT 20`,
      [customerId, companyId]
    ),
  ]);

  return {
    customer: mapCustomerRow(customerResult.rows[0]),
    stats: statsResult.rows[0],
    recent_orders: ordersResult.rows,
    debt_payments: debtPaymentsResult.rows,
  };
}

function mapCustomerRow(row) {
  return {
    ...row,
    display_name: formatCustomerDisplay(row),
  };
}

const CUSTOMER_LIST_ORDER = `ORDER BY LOWER(TRIM(CONCAT(name, ' ', COALESCE(surname, '')))) ASC NULLS LAST, id ASC`;

function buildCustomerSearchClause(q, params) {
  const term = (q || '').trim();
  if (!term) {
    return { clause: '', params };
  }

  const pattern = `%${term}%`;
  params.push(pattern);
  const idx = params.length;

  return {
    clause: ` AND (
      name ILIKE $${idx}
      OR surname ILIKE $${idx}
      OR phone ILIKE $${idx}
      OR phone2 ILIKE $${idx}
      OR address ILIKE $${idx}
      OR TRIM(CONCAT(name, ' ', COALESCE(surname, ''))) ILIKE $${idx}
    )`,
    params,
  };
}

function parsePaginationQuery(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  let limit = parseInt(query.limit, 10) || 20;
  limit = Math.min(100, Math.max(1, limit));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function mapCustomerListRow(row) {
  const mapped = mapCustomerRow(row);
  return {
    id: mapped.id,
    name: mapped.name,
    surname: mapped.surname,
    display_name: mapped.display_name,
    phone: mapped.phone,
    phone2: mapped.phone2,
    address: mapped.address,
    price: mapped.price,
    active_bidons: mapped.active_bidons,
    debt: mapped.debt,
  };
}

async function findCustomerByNormalizedPhone(normalized, companyId, excludeId = null) {
  if (!normalized) return null;

  const query = excludeId
    ? `SELECT id FROM customers
       WHERE company_id = $2 AND id != $3
         AND (phone_normalized = $1 OR phone2_normalized = $1)`
    : `SELECT id FROM customers
       WHERE company_id = $2 AND (phone_normalized = $1 OR phone2_normalized = $1)`;

  const params = excludeId
    ? [normalized, companyId, excludeId]
    : [normalized, companyId];

  const result = await pool.query(query, params);
  return result.rows[0] ?? null;
}

function handleCustomerError(res, err) {
  if (err.code === '23505') {
    return res.status(409).json({ error: DUPLICATE_PHONE_ERROR });
  }
  return res.status(500).json({ error: err.message });
}

router.get('/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);

    const pattern = `%${q}%`;
    const result = await pool.query(
      `SELECT * FROM customers
       WHERE company_id = $2
         AND (name ILIKE $1 OR surname ILIKE $1 OR phone ILIKE $1 OR phone2 ILIKE $1)
       ORDER BY name ASC, surname ASC NULLS LAST LIMIT 20`,
      [pattern, req.user.company_id]
    );
    res.json(result.rows.map(mapCustomerRow));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/export', authorizeRole(['admin']), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM customers WHERE company_id = $1 ${CUSTOMER_LIST_ORDER}`,
      [req.user.company_id]
    );
    const rows = result.rows.map((r) => ({
      ...r,
      display_name: formatCustomerDisplay(r),
    }));
    const buffer = await buildExcelBuffer('Müştərilər', customerColumns, rows);
    sendExcel(res, buffer, 'musteriler.xlsx');
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { page, limit, offset } = parsePaginationQuery(req.query);
    const params = [companyId];
    const search = buildCustomerSearchClause(req.query.q, params);

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM customers
       WHERE company_id = $1${search.clause}`,
      search.params
    );

    const listParams = [...search.params, limit, offset];
    const result = await pool.query(
      `SELECT * FROM customers
       WHERE company_id = $1${search.clause}
       ${CUSTOMER_LIST_ORDER}
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );

    res.json({
      customers: result.rows.map(mapCustomerListRow),
      total: countResult.rows[0].total,
      page,
      limit,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const detail = await fetchCustomerDetail(req.params.id, req.user.company_id);
    if (!detail) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    res.json(detail);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authorizeRole(['admin']), async (req, res) => {
  try {
    const parsedName = parseCustomerName(req.body);
    const { phone, phone2, address, price, active_bidons, debt } = req.body;

    if (!parsedName || !phone || !address) {
      return res.status(400).json({ error: 'Name, phone, and address required' });
    }

    const phone1 = parsePhoneFields(phone);
    if (!phone1) {
      return res.status(400).json({ error: 'Invalid phone number' });
    }

    let phone2Fields = null;
    if (phone2) {
      phone2Fields = parsePhoneFields(phone2);
      if (!phone2Fields) {
        return res.status(400).json({ error: 'Invalid phone2' });
      }
    }

    const duplicate = await findCustomerByNormalizedPhone(
      phone1.normalized,
      req.user.company_id
    );
    if (duplicate) {
      return res.status(409).json({ error: DUPLICATE_PHONE_ERROR });
    }

    if (phone2Fields) {
      const dup2 = await findCustomerByNormalizedPhone(
        phone2Fields.normalized,
        req.user.company_id
      );
      if (dup2) {
        return res.status(409).json({ error: DUPLICATE_PHONE_ERROR });
      }
    }

    const result = await pool.query(
      `INSERT INTO customers (
         company_id, name, surname, phone, phone_normalized, phone2, phone2_normalized,
         address, price, active_bidons, debt
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        req.user.company_id,
        parsedName.name,
        parsedName.surname,
        phone1.display,
        phone1.normalized,
        phone2Fields?.display ?? null,
        phone2Fields?.normalized ?? null,
        address,
        price || 0,
        active_bidons || 0,
        debt || 0,
      ]
    );

    res.status(201).json(mapCustomerRow(result.rows[0]));
  } catch (err) {
    handleCustomerError(res, err);
  }
});

router.put('/:id', authorizeRole(['admin']), async (req, res) => {
  const client = await pool.connect();
  try {
    const existing = await client.query(
      'SELECT * FROM customers WHERE id = $1 AND company_id = $2',
      [req.params.id, req.user.company_id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const row = existing.rows[0];
    const parsedName = parseCustomerName(req.body);
    const { phone, phone2, address, price, active_bidons, debt } = req.body;

    let phoneDisplay = row.phone;
    let phoneNorm = row.phone_normalized;
    if (phone != null) {
      const p = parsePhoneFields(phone);
      if (!p) return res.status(400).json({ error: 'Invalid phone number' });
      phoneDisplay = p.display;
      phoneNorm = p.normalized;
      const duplicate = await findCustomerByNormalizedPhone(
        phoneNorm,
        req.user.company_id,
        req.params.id
      );
      if (duplicate) {
        return res.status(409).json({ error: DUPLICATE_PHONE_ERROR });
      }
    }

    let phone2Display = row.phone2;
    let phone2Norm = row.phone2_normalized;
    if (phone2 !== undefined) {
      if (phone2 === null || phone2 === '') {
        phone2Display = null;
        phone2Norm = null;
      } else {
        const p2 = parsePhoneFields(phone2);
        if (!p2) return res.status(400).json({ error: 'Invalid phone2' });
        phone2Display = p2.display;
        phone2Norm = p2.normalized;
        const dup2 = await findCustomerByNormalizedPhone(
          phone2Norm,
          req.user.company_id,
          req.params.id
        );
        if (dup2) {
          return res.status(409).json({ error: DUPLICATE_PHONE_ERROR });
        }
      }
    }

    const oldDebt = Number(row.debt);
    const newDebt = debt !== undefined ? Number(debt) : oldDebt;

    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE customers
       SET name = COALESCE($1, name),
           surname = COALESCE($2, surname),
           phone = $3,
           phone_normalized = $4,
           phone2 = $5,
           phone2_normalized = $6,
           address = COALESCE($7, address),
           price = COALESCE($8, price),
           active_bidons = COALESCE($9, active_bidons),
           debt = $10,
           updated_at = NOW()
       WHERE id = $11 AND company_id = $12 RETURNING *`,
      [
        parsedName?.name ?? null,
        parsedName?.surname ?? null,
        phoneDisplay,
        phoneNorm,
        phone2Display,
        phone2Norm,
        address ?? null,
        price ?? null,
        active_bidons ?? null,
        newDebt,
        req.params.id,
        req.user.company_id,
      ]
    );

    let debtPayment = null;
    if (debt !== undefined && newDebt < oldDebt) {
      const paid = oldDebt - newDebt;
      const dp = await client.query(
        `INSERT INTO debt_payments (company_id, customer_id, amount, previous_debt, new_debt, recorded_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [
          req.user.company_id,
          req.params.id,
          paid,
          oldDebt,
          newDebt,
          req.user.id,
        ]
      );
      debtPayment = dp.rows[0];
    }

    await client.query('COMMIT');

    res.json({
      customer: mapCustomerRow(result.rows[0]),
      debt_payment: debtPayment,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    handleCustomerError(res, err);
  } finally {
    client.release();
  }
});

router.delete('/:id', authorizeRole(['admin']), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM customers WHERE id = $1 AND company_id = $2 RETURNING *',
      [req.params.id, req.user.company_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.json({ message: 'Customer deleted', customer: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
