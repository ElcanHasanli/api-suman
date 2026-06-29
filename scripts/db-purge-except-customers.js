/**
 * Seçilmiş şirkətin müştərilərini saxlayır; qalan bütün biznes məlumatını silir.
 *
 * Silinir:
 *   - Digər bütün şirkətlər (onların hər şeyi CASCADE ilə)
 *   - Hədəf şirkət: sifarişlər, xərclər, borc ödənişləri, anbar, bildirişlər, qeydlər
 *
 * Saxlanılır:
 *   - Hədəf şirkət (companies)
 *   - Hədəf şirkətin müştəriləri (customers)
 *   - Hədəf şirkətin istifadəçiləri (users)
 *
 * İstifadə:
 *   node scripts/db-purge-except-customers.js --company "Bir Inci Su"           # yalnız preview
 *   node scripts/db-purge-except-customers.js --company "Bir Inci Su" --execute # həqiqi silmə
 *   node scripts/db-purge-except-customers.js --company-id 1 --execute
 */
import pool from '../config/database.js';

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const companyIdArg = args.find((a) => a.startsWith('--company-id='))?.split('=')[1]
  ?? (args.includes('--company-id') ? args[args.indexOf('--company-id') + 1] : null);
const companyNameArg = args.find((a) => a.startsWith('--company='))?.split('=')[1]
  ?? (args.includes('--company') ? args[args.indexOf('--company') + 1] : 'Bir Inci Su');

async function countForCompany(client, table, companyId, column = 'company_id') {
  const r = await client.query(
    `SELECT COUNT(*)::int AS n FROM ${table} WHERE ${column} = $1`,
    [companyId]
  );
  return r.rows[0].n;
}

async function resolveCompany(client) {
  if (companyIdArg) {
    const r = await client.query('SELECT * FROM companies WHERE id = $1', [Number(companyIdArg)]);
    if (!r.rows.length) throw new Error(`Company id ${companyIdArg} not found`);
    return r.rows[0];
  }

  const r = await client.query(
    `SELECT * FROM companies WHERE name ILIKE $1 ORDER BY id LIMIT 1`,
    [`%inci%su%`]
  );
  if (!r.rows.length) {
    const all = await client.query('SELECT id, name FROM companies ORDER BY id');
    throw new Error(
      `Company "${companyNameArg}" not found. Existing: ${all.rows.map((c) => `${c.id}=${c.name}`).join(', ')}`
    );
  }
  return r.rows[0];
}

async function purgeExceptCustomers(client, keepCompanyId) {
  const otherCompanies = await client.query(
    'SELECT id, name FROM companies WHERE id <> $1 ORDER BY id',
    [keepCompanyId]
  );

  const plan = {
    keepCompanyId,
    otherCompanies: otherCompanies.rows,
    targetCompanyDeletes: {},
  };

  const tablesWithCompanyId = [
    'orders',
    'order_notes',
    'debt_payments',
    'expenses',
    'warehouse_updates',
    'warehouse_stock',
    'customer_inactivity_alerts',
  ];

  for (const table of tablesWithCompanyId) {
    plan.targetCompanyDeletes[table] = await countForCompany(client, table, keepCompanyId);
  }

  plan.targetCompanyDeletes.notifications = (
    await client.query(
      `SELECT COUNT(*)::int AS n FROM notifications n
       WHERE n.order_id IN (SELECT id FROM orders WHERE company_id = $1)
          OR n.user_id IN (SELECT id FROM users WHERE company_id = $1)`,
      [keepCompanyId]
    )
  ).rows[0].n;

  plan.keepCustomers = await countForCompany(client, 'customers', keepCompanyId);
  plan.keepUsers = await countForCompany(client, 'users', keepCompanyId);

  if (!execute) return plan;

  await client.query('BEGIN');

  try {
    await client.query(
      `DELETE FROM notifications n
       WHERE n.order_id IN (SELECT id FROM orders WHERE company_id = $1)
          OR n.user_id IN (SELECT id FROM users WHERE company_id = $1)`,
      [keepCompanyId]
    );

    await client.query('DELETE FROM order_notes WHERE company_id = $1', [keepCompanyId]);
    await client.query('DELETE FROM orders WHERE company_id = $1', [keepCompanyId]);
    await client.query('DELETE FROM debt_payments WHERE company_id = $1', [keepCompanyId]);
    await client.query('DELETE FROM customer_inactivity_alerts WHERE company_id = $1', [keepCompanyId]);
    await client.query('DELETE FROM expenses WHERE company_id = $1', [keepCompanyId]);
    await client.query('DELETE FROM warehouse_updates WHERE company_id = $1', [keepCompanyId]);
    await client.query('DELETE FROM warehouse_stock WHERE company_id = $1', [keepCompanyId]);

    if (otherCompanies.rows.length) {
      await client.query('DELETE FROM companies WHERE id <> $1', [keepCompanyId]);
    }

    await client.query('COMMIT');
    return plan;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

async function main() {
  const client = await pool.connect();

  try {
    const company = await resolveCompany(client);
    console.log(`\n🎯 Hədəf şirkət: ${company.name} (id=${company.id})`);
    console.log(execute ? '⚠️  EXECUTE rejimi — məlumat silinəcək\n' : '👀 DRY-RUN — heç nə silinmir (--execute ilə tətbiq edin)\n');

    const plan = await purgeExceptCustomers(client, company.id);

    if (plan.otherCompanies.length) {
      console.log('Silinəcək digər şirkətlər (CASCADE):');
      for (const c of plan.otherCompanies) {
        console.log(`  - id=${c.id} ${c.name}`);
      }
    } else {
      console.log('Digər şirkət yoxdur.');
    }

    console.log(`\n"${company.name}" üzrə silinəcək:`);
    for (const [table, n] of Object.entries(plan.targetCompanyDeletes)) {
      console.log(`  ${table}: ${n} sətir`);
    }

    console.log(`\nSaxlanılacaq:`);
    console.log(`  customers: ${plan.keepCustomers}`);
    console.log(`  users: ${plan.keepUsers}`);
    console.log(`  companies: 1 (${company.name})`);

    if (execute) {
      console.log('\n✅ Təmizləmə tamamlandı.');
    } else {
      console.log('\nTətbiq: node scripts/db-purge-except-customers.js --company "Bir Inci Su" --execute');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
