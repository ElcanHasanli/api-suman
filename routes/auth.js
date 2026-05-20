import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/database.js';
import { getCompanyByLicense, validateCompanyAccess } from '../utils/company.js';

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

    res.json(await buildAuthResponse(user, company));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Yalnız owner — public register bağlanıb. */
router.post('/register', async (req, res) => {
  res.status(403).json({
    error: 'Qeydiyyat bağlanıb. Şirkət admini owner tərəfindən yaradılır.',
  });
});

export default router;
