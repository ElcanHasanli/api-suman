/**
 * WhatsApp qrupundan müştəriləri DB-yə import.
 *
 * npm run import:whatsapp -- --file /path/_chat.txt --file "/path/_chat 2.txt" --company-id 1
 * npm run import:whatsapp -- --file ./_chat.txt --company-id 1 --dry-run
 */
import fs from 'fs';
import path from 'path';
import pool from '../config/database.js';
import {
  parseWhatsappCustomers,
  parseWhatsappWarehouse,
  mergeWhatsappCustomers,
  mergeWhatsappWarehouse,
} from '../utils/whatsappChatParser.js';

function fileArgs() {
  const files = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === '--file' && process.argv[i + 1]) {
      files.push(process.argv[i + 1]);
    }
  }
  return files;
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const filePaths = fileArgs();
const companyId = Number(arg('--company-id'));
const dryRun = process.argv.includes('--dry-run');
const jsonOut = arg('--json');
const importWarehouse = !process.argv.includes('--skip-warehouse');

async function main() {
  if (!filePaths.length || !companyId) {
    console.error(
      'Usage: node scripts/import-whatsapp-customers.js --file <path> [--file <path2> ...] --company-id <id> [--dry-run] [--json out.json]'
    );
    process.exit(1);
  }

  const customerLists = [];
  const warehouseLists = [];

  for (const filePath of filePaths) {
    const abs = path.resolve(filePath);
    if (!fs.existsSync(abs)) {
      console.error('File not found:', abs);
      process.exit(1);
    }

    const raw = fs.readFileSync(abs, 'utf8');
    const customers = parseWhatsappCustomers(raw);
    const warehouse = parseWhatsappWarehouse(raw);
    customerLists.push(customers);
    warehouseLists.push(warehouse);

    console.log(`📄 ${path.basename(abs)}: ${customers.length} müştəri, ${warehouse.length} anbar qeydi`);
  }

  const customers = mergeWhatsappCustomers(customerLists);
  const warehouse = mergeWhatsappWarehouse(warehouseLists);

  const phoneSources = new Map();
  for (let i = 0; i < customerLists.length; i++) {
    for (const c of customerLists[i]) {
      const key = c.phone_normalized;
      const prev = phoneSources.get(key);
      if (!prev || c.date > prev.date) {
        phoneSources.set(key, { date: c.date, fileIndex: i });
      }
    }
  }
  const fromFile = filePaths.map((_, i) => 0);
  for (const src of phoneSources.values()) fromFile[src.fileIndex] += 1;
  const multiFilePhones = customerLists.reduce((set, list, i) => {
    for (const c of list) {
      const others = customerLists.some(
        (other, j) => j !== i && other.some((x) => x.phone_normalized === c.phone_normalized)
      );
      if (others) set.add(c.phone_normalized);
    }
    return set;
  }, new Set()).size;

  console.log(`\n👥 Cəmi unikal müştəri: ${customers.length}`);
  filePaths.forEach((f, i) => {
    console.log(`   ↳ ${path.basename(f)}: ${fromFile[i]} müştəri (ən son qeyd)`);
  });
  console.log(`📅 Çox faylda təkrar (ən son tarix qalır): ${multiFilePhones}`);
  console.log(`🏭 Cəmi anbar qeydi: ${warehouse.length}`);

  if (jsonOut) {
    fs.writeFileSync(
      path.resolve(jsonOut),
      JSON.stringify({ customers, warehouse, sources: filePaths }, null, 2),
      'utf8'
    );
    console.log(`💾 JSON: ${jsonOut}`);
  }

  const company = await pool.query('SELECT id, name FROM companies WHERE id = $1', [
    companyId,
  ]);
  if (!company.rows.length) {
    console.error('Company not found:', companyId);
    process.exit(1);
  }
  console.log(`🏢 Şirkət: ${company.rows[0].name} (#${companyId})`);

  if (dryRun) {
    console.log('\n--- Nümunə (ilk 5) ---');
    customers.slice(0, 5).forEach((c) => {
      console.log(
        `- ${c.name} ${c.surname ?? ''} | ${c.phone} | var:${c.active_bidons} borc:${c.debt} ₼${c.price} | ${c.address.slice(0, 50)}…`
      );
    });
    if (warehouse.length) {
      const last = warehouse[warehouse.length - 1];
      console.log(
        `\n🏭 Son anbar qeydi: ${last.remaining_full} dolu (${last.date.toISOString().slice(0, 10)})`
      );
    }
    console.log('\n(dry-run — DB-yə yazılmadı)');
    await pool.end();
    process.exit(0);
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const c of customers) {
    try {
      const existing = await pool.query(
        `SELECT id FROM customers WHERE company_id = $1 AND phone_normalized = $2`,
        [companyId, c.phone_normalized]
      );

      if (existing.rows.length) {
        await pool.query(
          `UPDATE customers
           SET name = $1, surname = $2, address = $3, phone = $4, phone2 = $5,
               phone2_normalized = $6, price = $7, active_bidons = $8, debt = $9,
               updated_at = NOW()
           WHERE id = $10`,
          [
            c.name,
            c.surname,
            c.address,
            c.phone,
            c.phone2,
            c.phone2_normalized,
            c.price,
            c.active_bidons,
            c.debt,
            existing.rows[0].id,
          ]
        );
        updated += 1;
      } else {
        await pool.query(
          `INSERT INTO customers (
             company_id, name, surname, phone, phone_normalized, phone2, phone2_normalized,
             address, price, active_bidons, debt
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            companyId,
            c.name,
            c.surname,
            c.phone,
            c.phone_normalized,
            c.phone2,
            c.phone2_normalized,
            c.address,
            c.price,
            c.active_bidons,
            c.debt,
          ]
        );
        inserted += 1;
      }
    } catch (err) {
      skipped += 1;
      console.warn(`⚠️ Skip ${c.phone}: ${err.message}`);
    }
  }

  if (importWarehouse && warehouse.length) {
    const last = warehouse[warehouse.length - 1];
    await pool.query(
      `INSERT INTO warehouse_stock (company_id, full_count, empty_count, updated_at)
       VALUES ($1, $2, 0, $3)
       ON CONFLICT (company_id)
       DO UPDATE SET full_count = EXCLUDED.full_count, updated_at = EXCLUDED.updated_at`,
      [companyId, last.remaining_full, last.date]
    );
    console.log(
      `\n🏭 Anbar (son qeyd): ${last.remaining_full} dolu (${last.date.toISOString().slice(0, 10)})`
    );
  }

  console.log(`\n✅ Insert: ${inserted}, Update: ${updated}, Skip: ${skipped}`);
  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
