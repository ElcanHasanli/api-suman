import express from 'express';
import bcrypt from 'bcryptjs';
import pool from '../config/database.js';
import { authenticateToken, authorizeRole } from '../middleware/auth.js';
import { generateLicenseCode } from '../utils/company.js';
import {
  getLiveOverview,
  getLiveFeed,
  getCompanyMonitor,
  getCompanyHistory,
  getCompanyOrders,
  getCompanyWarehouse,
} from '../utils/ownerMonitor.js';

const router = express.Router();

router.use(authenticateToken, authorizeRole(['owner']));

function sendMonitorError(res, err) {
  const status = err.status || 500;
  res.status(status).json({ error: err.message });
}

/** Canlı monitor — /live* /companies/:id-dən əvvəl (route toqquşması olmasın) */
router.get('/live', async (req, res) => {
  try {
    const { period = 'today', startDate, endDate } = req.query;
    const data = await getLiveOverview(period, startDate || null, endDate || null);
    res.json(data);
  } catch (err) {
    sendMonitorError(res, err);
  }
});

router.get('/live/feed', async (req, res) => {
  try {
    const { company_id: companyId, limit, since } = req.query;
    const data = await getLiveFeed({
      companyId: companyId || null,
      limit: limit || 50,
      since: since || null,
    });
    res.json(data);
  } catch (err) {
    sendMonitorError(res, err);
  }
});

router.get('/companies/:id/monitor', async (req, res) => {
  try {
    const { period = 'today', startDate, endDate } = req.query;
    const data = await getCompanyMonitor(req.params.id, {
      period,
      startDate: startDate || null,
      endDate: endDate || null,
    });
    res.json(data);
  } catch (err) {
    sendMonitorError(res, err);
  }
});

router.get('/companies/:id/history', async (req, res) => {
  try {
    const { period = 'today', startDate, endDate } = req.query;
    const data = await getCompanyHistory(req.params.id, {
      period,
      startDate: startDate || null,
      endDate: endDate || null,
    });
    res.json(data);
  } catch (err) {
    sendMonitorError(res, err);
  }
});

router.get('/companies/:id/orders', async (req, res) => {
  try {
    const { status, limit } = req.query;
    const data = await getCompanyOrders(req.params.id, {
      status: status || null,
      limit: limit || 100,
    });
    res.json(data);
  } catch (err) {
    sendMonitorError(res, err);
  }
});

router.get('/companies/:id/warehouse', async (req, res) => {
  try {
    const data = await getCompanyWarehouse(req.params.id);
    res.json(data);
  } catch (err) {
    sendMonitorError(res, err);
  }
});

router.get('/companies', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*,
              (SELECT COUNT(*)::int FROM users u WHERE u.company_id = c.id AND u.role = 'admin') AS admin_count,
              (SELECT COUNT(*)::int FROM users u WHERE u.company_id = c.id AND u.role = 'courier') AS courier_count,
              (SELECT COUNT(*)::int FROM customers cu WHERE cu.company_id = c.id) AS customer_count,
              (SELECT COUNT(*)::int FROM orders o WHERE o.company_id = c.id) AS order_count
       FROM companies c
       ORDER BY c.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/companies/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM companies WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/companies', async (req, res) => {
  try {
    const { name, license_expires_at, is_active = true } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Company name required' });
    }

    const license_code = generateLicenseCode();
    const result = await pool.query(
      `INSERT INTO companies (name, license_code, is_active, license_expires_at)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, license_code, is_active, license_expires_at || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/companies/:id', async (req, res) => {
  try {
    const { name, is_active, license_expires_at } = req.body;

    const result = await pool.query(
      `UPDATE companies
       SET name = COALESCE($1, name),
           is_active = COALESCE($2, is_active),
           license_expires_at = COALESCE($3, license_expires_at),
           updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [name ?? null, is_active ?? null, license_expires_at ?? null, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/companies/:id/regenerate-license', async (req, res) => {
  try {
    const license_code = generateLicenseCode();
    const result = await pool.query(
      `UPDATE companies SET license_code = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [license_code, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/companies/:id/users', async (req, res) => {
  try {
    const { email, password, name, phone, role = 'admin' } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name required' });
    }

    if (!['admin', 'courier'].includes(role)) {
      return res.status(400).json({ error: 'Role must be admin or courier' });
    }

    const company = await pool.query('SELECT id FROM companies WHERE id = $1', [req.params.id]);
    if (company.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, name, phone, role, company_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, name, phone, role, company_id, created_at`,
      [email, hash, name, phone || null, role, req.params.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

router.get('/companies/:id/users', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, email, name, phone, role, status, created_at
       FROM users WHERE company_id = $1 AND role IN ('admin', 'courier')
       ORDER BY role, name`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function getCompanyUser(companyId, userId) {
  const result = await pool.query(
    `SELECT id, email, name, phone, role, status, company_id, created_at
     FROM users
     WHERE id = $1 AND company_id = $2 AND role IN ('admin', 'courier')`,
    [userId, companyId]
  );
  return result.rows[0] ?? null;
}

router.put('/companies/:id/users/:userId', async (req, res) => {
  try {
    const existing = await getCompanyUser(req.params.id, req.params.userId);
    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { email, password, name, phone, role, status } = req.body;

    if (role && !['admin', 'courier'].includes(role)) {
      return res.status(400).json({ error: 'Role must be admin or courier' });
    }

    if (status && !['active', 'inactive'].includes(status)) {
      return res.status(400).json({ error: 'Status must be active or inactive' });
    }

    let passwordHash;
    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    const result = await pool.query(
      `UPDATE users
       SET email = COALESCE($1, email),
           password_hash = COALESCE($2, password_hash),
           name = COALESCE($3, name),
           phone = COALESCE($4, phone),
           role = COALESCE($5, role),
           status = COALESCE($6, status),
           updated_at = NOW()
       WHERE id = $7 AND company_id = $8
       RETURNING id, email, name, phone, role, status, company_id, created_at`,
      [
        email ?? null,
        passwordHash ?? null,
        name ?? null,
        phone ?? null,
        role ?? null,
        status ?? null,
        req.params.userId,
        req.params.id,
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

router.delete('/companies/:id/users/:userId', async (req, res) => {
  try {
    const existing = await getCompanyUser(req.params.id, req.params.userId);
    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }

    await pool.query(
      'DELETE FROM users WHERE id = $1 AND company_id = $2',
      [req.params.userId, req.params.id]
    );

    res.json({ message: 'User deleted', user: existing });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
