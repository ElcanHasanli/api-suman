import express from 'express';
import pool from '../config/database.js';
import { authenticateToken, authorizeRole, requireTenant } from '../middleware/auth.js';
import { buildExcelBuffer, sendExcel } from '../utils/excel.js';
import { normalizePhone, DUPLICATE_PHONE_ERROR } from '../utils/phone.js';

const router = express.Router();

router.use(authenticateToken, requireTenant);

const customerColumns = [
  { header: 'ID', key: 'id', width: 8 },
  { header: 'Ad', key: 'name', width: 16 },
  { header: 'Soyad', key: 'surname', width: 16 },
  { header: 'Telefon', key: 'phone', width: 14 },
  { header: 'Ünvan', key: 'address', width: 28 },
  { header: 'Qiymət', key: 'price', width: 10 },
  { header: 'Aktiv bidon', key: 'active_bidons', width: 12 },
  { header: 'Borc', key: 'debt', width: 10 },
];

async function findCustomerByPhone(phone, companyId, excludeId = null) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const query = excludeId
    ? 'SELECT id FROM customers WHERE phone = $1 AND company_id = $2 AND id != $3'
    : 'SELECT id FROM customers WHERE phone = $1 AND company_id = $2';

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
    let params = [pattern, req.user.company_id];
    let query = `SELECT * FROM customers
                 WHERE company_id = $2
                   AND (name ILIKE $1 OR surname ILIKE $1 OR phone ILIKE $1)
                 ORDER BY name ASC LIMIT 20`;

    const result = await pool.query(query, params);
    res.json(result.rows);
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
    const buffer = await buildExcelBuffer('Müştərilər', customerColumns, result.rows);
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
    res.json(result.rows);
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
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authorizeRole(['admin']), async (req, res) => {
  try {
    const { name, surname, phone, address, price, active_bidons, debt } = req.body;

    if (!name || !phone || !address) {
      return res.status(400).json({ error: 'Name, phone, and address required' });
    }

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return res.status(400).json({ error: 'Invalid phone number' });
    }

    const duplicate = await findCustomerByPhone(
      normalizedPhone,
      req.user.company_id
    );
    if (duplicate) {
      return res.status(409).json({ error: DUPLICATE_PHONE_ERROR });
    }

    const result = await pool.query(
      `INSERT INTO customers (company_id, name, surname, phone, address, price, active_bidons, debt)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        req.user.company_id,
        name,
        surname || null,
        normalizedPhone,
        address,
        price || 0,
        active_bidons || 0,
        debt || 0,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    handleCustomerError(res, err);
  }
});

router.put('/:id', authorizeRole(['admin']), async (req, res) => {
  try {
    const { name, surname, phone, address, price, active_bidons, debt } = req.body;

    const existing = await pool.query(
      'SELECT * FROM customers WHERE id = $1 AND company_id = $2',
      [req.params.id, req.user.company_id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    let normalizedPhone;
    if (phone != null) {
      normalizedPhone = normalizePhone(phone);
      if (!normalizedPhone) {
        return res.status(400).json({ error: 'Invalid phone number' });
      }

      const duplicate = await findCustomerByPhone(
        normalizedPhone,
        req.user.company_id,
        req.params.id
      );
      if (duplicate) {
        return res.status(409).json({ error: DUPLICATE_PHONE_ERROR });
      }
    }

    const result = await pool.query(
      `UPDATE customers
       SET name = COALESCE($1, name),
           surname = COALESCE($2, surname),
           phone = COALESCE($3, phone),
           address = COALESCE($4, address),
           price = COALESCE($5, price),
           active_bidons = COALESCE($6, active_bidons),
           debt = COALESCE($7, debt),
           updated_at = NOW()
       WHERE id = $8 AND company_id = $9 RETURNING *`,
      [
        name,
        surname,
        normalizedPhone ?? null,
        address,
        price,
        active_bidons,
        debt,
        req.params.id,
        req.user.company_id,
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    handleCustomerError(res, err);
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
