# PostgreSQL — DB-yə baxış və idarəetmə

## Qoşulma

### Lokal (dev)

`.env` faylından:

```bash
psql -h localhost -U elcan -d damacana_dev
```

### Production (Contabo)

```bash
ssh root@109.123.241.102
sudo -u postgres psql -d api_suman
# və ya
psql -h localhost -U api_user -d api_suman
```

---

## Əsas cədvəllər

| Cədvəl | Məzmun |
|--------|--------|
| `companies` | Şirkətlər (tenant) |
| `users` | Admin, kuryer, owner |
| `customers` | Müştərilər (şirkətə bağlı) |
| `orders` | Sifarişlər |
| `expenses` | Xərclər |
| `debt_payments` | Borc ödənişləri (admin qeydi) |
| `order_notes` | Sifariş qeydləri |
| `warehouse_stock` | Anbar qalığı |
| `warehouse_updates` | Anbar hərəkətləri |
| `notifications` | Panel bildirişləri |
| `customer_inactivity_alerts` | Aktiv olmayan müştəri xəbərdarlıqları |
| `device_tokens` / `push_device_tokens` | Push tokenlər |

Əlaqə: hər biznes cədvəli `company_id` ilə şirkətə bağlıdır. `orders.customer_id` → `customers`.

---

## Tez-tez istifadə olunan sorğular

### Bütün şirkətlər

```sql
SELECT id, name, license_code, is_active, created_at
FROM companies
ORDER BY id;
```

### Şirkət üzrə statistika

```sql
SELECT
  c.id,
  c.name,
  (SELECT COUNT(*) FROM customers cu WHERE cu.company_id = c.id) AS customers,
  (SELECT COUNT(*) FROM orders o WHERE o.company_id = c.id) AS orders,
  (SELECT COUNT(*) FROM users u WHERE u.company_id = c.id) AS users,
  (SELECT COUNT(*) FROM expenses e WHERE e.company_id = c.id) AS expenses
FROM companies c
ORDER BY c.id;
```

### Bir şirkətin müştəriləri

```sql
SELECT id, name, surname, phone, address, debt, active_bidons, created_at
FROM customers
WHERE company_id = 1   -- Bir Inci Su
ORDER BY name, surname
LIMIT 20;
```

### Bir şirkətin sifarişləri

```sql
SELECT o.id, o.status, o.price, o.amount_paid, o.payment_type,
       o.completed_at, cu.name AS customer
FROM orders o
JOIN customers cu ON cu.id = o.customer_id
WHERE o.company_id = 1
ORDER BY o.created_at DESC
LIMIT 20;
```

### Bir şirkətin istifadəçiləri

```sql
SELECT id, name, email, role, phone, status
FROM users
WHERE company_id = 1;
```

### Cədvəl üzrə ümumi say

```sql
SELECT 'companies' AS t, COUNT(*) FROM companies UNION ALL
SELECT 'users', COUNT(*) FROM users UNION ALL
SELECT 'customers', COUNT(*) FROM customers UNION ALL
SELECT 'orders', COUNT(*) FROM orders UNION ALL
SELECT 'expenses', COUNT(*) FROM expenses UNION ALL
SELECT 'debt_payments', COUNT(*) FROM debt_payments UNION ALL
SELECT 'warehouse_stock', COUNT(*) FROM warehouse_stock;
```

### Borclu müştərilər (Bir Inci Su)

```sql
SELECT name, surname, phone, debt
FROM customers
WHERE company_id = 1 AND debt > 0
ORDER BY debt DESC;
```

---

## GUI alətlər (istəyə görə)

| Alət | Qeyd |
|------|------|
| **psql** | Terminal — yuxarıdakı sorğular |
| **TablePlus** / **DBeaver** / **pgAdmin** | Vizual baxış, filter, export |
| **VS Code** PostgreSQL extension | Sadə sorğular |

Contabo-da SSH tunnel:

```bash
ssh -L 5433:localhost:5432 root@109.123.241.102
# Sonra lokalda: psql -h localhost -p 5433 -U api_user -d api_suman
```

---

## Yalnız müştəriləri saxlamaq (təmizləmə)

**Bir Inci Su** müştərilərini saxlayıb qalan biznes məlumatını silmək üçün:

```bash
# 1) Əvvəl preview (heç nə silmir)
node scripts/db-purge-except-customers.js --company "Bir Inci Su"

# 2) Təsdiqdən sonra
node scripts/db-purge-except-customers.js --company "Bir Inci Su" --execute
```

**Silinir:**
- Digər bütün şirkətlər (Elcan və s.)
- Bir Inci Su: sifarişlər, xərclər, borc ödənişləri, anbar, bildirişlər

**Saxlanılır:**
- Bir Inci Su şirkəti
- Onun 401 müştəri siyahısı
- Onun admin/kuryer istifadəçiləri

⚠️ **Production-da əvvəl backup:**

```bash
pg_dump -U api_user -d api_suman -F c -f backup_$(date +%Y%m%d).dump
```

---

## Tam sıfırlama (başqa ssenari)

Bütün biznes məlumatını silib schema saxlamaq:

```bash
npm run db:reset
npm run db:seed   # test məlumatı (istəyə görə)
```
