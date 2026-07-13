import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/database.js';
import { getCompanyByLicense, validateCompanyAccess } from '../utils/company.js';
import { checkAndNotifyInactiveCustomers } from '../utils/customerInactivity.js';

const router = express.Router();

async function buildAuthResponse(user, company = null) {
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    company_id: user.company_id ?? null,
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE,
  });

  let default_warehouse = null;
  if (user.role === 'courier' && user.default_warehouse_id) {
    const wh = await pool.query(
      `SELECT id, code, name FROM warehouses WHERE id = $1`,
      [user.default_warehouse_id]
    );
    if (wh.rows[0]) {
      default_warehouse = {
        id: wh.rows[0].id,
        code: wh.rows[0].code,
        name: wh.rows[0].name,
      };
    }
  }

  return {
    message: 'Login successful',
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      company_id: user.company_id ?? null,
      company_name: company?.name ?? null,
      default_warehouse_id: user.default_warehouse_id ?? null,
      default_warehouse,
    },
  };
}

router.post('/login', async (req, res) => {
  try {
    const { email, password, license_code } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.status === 'inactive') {
      return res.status(403).json({ error: 'Hesab deaktiv edilib' });
    }

    let company = null;

    if (user.role === 'owner') {
      return res.json(await buildAuthResponse(user));
    }

    if (!license_code) {
      return res.status(400).json({ error: 'Lisenziya kodu tələb olunur' });
    }

    company = await getCompanyByLicense(license_code);
    const access = validateCompanyAccess(company);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    if (Number(user.company_id) !== Number(company.id)) {
      return res.status(403).json({ error: 'Bu hesab bu lisenziya koduna aid deyil' });
    }

    if (user.role === 'admin') {
      checkAndNotifyInactiveCustomers(user.company_id).catch(() => {});
    }

    res.json(await buildAuthResponse(user, company));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Token etibarlılığını yoxla (admin/kuryer app startup) */
router.get('/me', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const result = await pool.query(
      `SELECT u.id, u.email, u.name, u.role, u.status, u.company_id, u.default_warehouse_id,
              c.name AS company_name,
              w.id AS warehouse_id, w.code AS warehouse_code, w.name AS warehouse_name
       FROM users u
       LEFT JOIN companies c ON u.company_id = c.id
       LEFT JOIN warehouses w ON w.id = u.default_warehouse_id
       WHERE u.id = $1`,
      [payload.id]
    );

    if (!result.rows.length) {
      return res.status(401).json({ error: 'User not found', code: 'TOKEN_INVALID' });
    }

    const user = result.rows[0];
    if (user.status === 'inactive') {
      return res.status(403).json({ error: 'Hesab deaktiv edilib' });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        company_id: user.company_id,
        company_name: user.company_name,
        default_warehouse_id: user.default_warehouse_id ?? null,
        default_warehouse: user.warehouse_id
          ? {
              id: user.warehouse_id,
              code: user.warehouse_code,
              name: user.warehouse_name,
            }
          : null,
      },
    });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token', code: 'TOKEN_INVALID' });
  }
});

/** Yalnız owner — public register bağlanıb. */
router.post('/register', async (req, res) => {
  res.status(403).json({
    error: 'Qeydiyyat bağlanıb. Şirkət admini owner tərəfindən yaradılır.',
  });
});

export default router;
