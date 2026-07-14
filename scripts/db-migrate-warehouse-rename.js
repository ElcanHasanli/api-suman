/**
 * Anbar adları: novxani/azadliq → mikrorayon/xirdalan
 * npm run db:migrate:warehouse-rename
 */
import pool from '../config/database.js';

async function migrate() {
  try {
    // Mövcud sətirləri yenilə
    await pool.query(`
      UPDATE warehouses SET code = 'mikrorayon', name = 'Mikrorayon'
      WHERE code = 'novxani';
    `);
    await pool.query(`
      UPDATE warehouses SET code = 'xirdalan', name = 'Xırdalan'
      WHERE code = 'azadliq';
    `);

    // Əgər heç yoxdursa — şirkətlər üçün yarat
    const companies = await pool.query('SELECT id FROM companies');
    for (const company of companies.rows) {
      await pool.query(
        `INSERT INTO warehouses (company_id, code, name)
         VALUES ($1, 'mikrorayon', 'Mikrorayon'), ($1, 'xirdalan', 'Xırdalan')
         ON CONFLICT (company_id, code) DO UPDATE
         SET name = EXCLUDED.name`,
        [company.id]
      );
    }

    console.log('✅ anbarlar: Mikrorayon + Xırdalan');
  } catch (err) {
    console.error('❌', err.message);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

migrate();
