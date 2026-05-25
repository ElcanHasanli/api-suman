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

function mapCustomerRow(row) {
  return {
    ...row,
    display_name: formatCustomerDisplay(row),
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
       ORDER BY name ASC LIMIT 20`,
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
      'SELECT * FROM customers WHERE company_id = $1 ORDER BY name ASC',
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
    const result = await pool.query(
      'SELECT * FROM customers WHERE company_id = $1 ORDER BY created_at DESC',
      [req.user.company_id]
    );
    res.json(result.rows.map(mapCustomerRow));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM customers WHERE id = $1 AND company_id = $2',
      [req.params.id, req.user.company_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    res.json(mapCustomerRow(result.rows[0]));
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
