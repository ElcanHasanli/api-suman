import crypto from 'crypto';
import pool from '../config/database.js';

export function generateLicenseCode() {
  const part = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `SUMAN-${part.slice(0, 4)}-${part.slice(4, 8)}`;
}

export async function getCompanyByLicense(licenseCode) {
  if (!licenseCode) return null;

  const result = await pool.query(
    `SELECT * FROM companies
     WHERE UPPER(TRIM(license_code)) = UPPER(TRIM($1))`,
    [licenseCode]
  );
  return result.rows[0] ?? null;
}

export function validateCompanyAccess(company) {
  if (!company) {
    return { ok: false, status: 403, error: 'Yanlış lisenziya kodu' };
  }
  if (!company.is_active) {
    return { ok: false, status: 403, error: 'Şirkət deaktiv edilib' };
  }
  if (company.license_expires_at && new Date(company.license_expires_at) < new Date()) {
    return { ok: false, status: 403, error: 'Lisenziyanın müddəti bitib' };
  }
  return { ok: true };
}
