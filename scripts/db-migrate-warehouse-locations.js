/**
 * İki anbar (novxani, azadliq) + kuryer default anbar
 * npm run db:migrate:warehouse-locations
 */
import pool from '../config/database.js';

const WAREHOUSE_DEFS = [
  { code: 'mikrorayon', name: 'Mikrorayon' },
  { code: 'xirdalan', name: 'Xırdalan' },
];

async function migrate() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS warehouses (
        id SERIAL PRIMARY KEY,
        company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        code VARCHAR(30) NOT NULL,
        name VARCHAR(100) NOT NULL,
        full_count INT NOT NULL DEFAULT 0,
        empty_count INT NOT NULL DEFAULT 0,
        pump_count INT NOT NULL DEFAULT 0,
        dispenser_count INT NOT NULL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_by INT REFERENCES users(id) ON DELETE SET NULL,
        UNIQUE (company_id, code)
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_warehouses_company
      ON warehouses(company_id);
    `);

    await pool.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS default_warehouse_id INT
          REFERENCES warehouses(id) ON DELETE SET NULL;
    `);

    await pool.query(`
      ALTER TABLE warehouse_updates
        ADD COLUMN IF NOT EXISTS warehouse_id INT
          REFERENCES warehouses(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS entry_full INT,
        ADD COLUMN IF NOT EXISTS entry_empty INT,
        ADD COLUMN IF NOT EXISTS full_taken INT;
    `);

    const companies = await pool.query('SELECT id FROM companies');

    for (const company of companies.rows) {
      const stock = await pool.query(
        `SELECT full_count, empty_count, pump_count, dispenser_count, updated_by
         FROM warehouse_stock WHERE company_id = $1`,
        [company.id]
      );
      const prev = stock.rows[0] ?? {
        full_count: 0,
        empty_count: 0,
        pump_count: 0,
        dispenser_count: 0,
        updated_by: null,
      };

      for (let i = 0; i < WAREHOUSE_DEFS.length; i++) {
        const def = WAREHOUSE_DEFS[i];
        // Mövcud stoku ilk anbara (Mikrorayon) köçür
        const full = i === 0 ? Number(prev.full_count) || 0 : 0;
        const empty = i === 0 ? Number(prev.empty_count) || 0 : 0;
        const pump = i === 0 ? Number(prev.pump_count) || 0 : 0;
        const dispenser = i === 0 ? Number(prev.dispenser_count) || 0 : 0;

        await pool.query(
          `INSERT INTO warehouses (
             company_id, code, name, full_count, empty_count,
             pump_count, dispenser_count, updated_by
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (company_id, code) DO NOTHING`,
          [
            company.id,
            def.code,
            def.name,
            full,
            empty,
            pump,
            dispenser,
            prev.updated_by,
          ]
        );
      }
    }

    // Köhnə update-ləri Mikrorayon ilə bağla
    await pool.query(`
      UPDATE warehouse_updates wu
      SET warehouse_id = w.id,
          entry_full = COALESCE(wu.entry_full, wu.full_in),
          entry_empty = COALESCE(wu.entry_empty, wu.empty_in),
          full_taken = COALESCE(
            wu.full_taken,
            CASE
              WHEN wu.exit_full IS NOT NULL
              THEN GREATEST(0, wu.exit_full - COALESCE(wu.full_in, 0))
              ELSE wu.full_out
            END
          )
      FROM warehouses w
      WHERE w.company_id = wu.company_id
        AND w.code = 'mikrorayon'
        AND wu.warehouse_id IS NULL;
    `);

    console.log('✅ warehouses (mikrorayon, xirdalan) + default_warehouse_id hazırdır');
  } catch (err) {
    console.error('❌', err.message);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

migrate();
