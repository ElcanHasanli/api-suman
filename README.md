# SUMAN API (Backend)

Su çatdırılması idarəetmə sistemi — Admin və Kuryer panelləri üçün REST API.

## Rollar (multi-şirkət)

| Rol | Təsvir |
|-----|--------|
| `owner` | Platform sahibi — şirkətlər, lisenziyalar (`/api/owner`) |
| `admin` | Bir şirkətin admini — müştəri, sifariş, tarixçə |
| `courier` | Bir şirkətin kuryeri |

Hər şirkətin məlumatları `company_id` ilə izolyasiya olunur.

## Quraşdırma

```bash
npm install
cp .env.example .env
# .env: DB_HOST, DB_NAME, DB_USER, DB_PASSWORD, JWT_SECRET
```

### Yeni verilənlər bazası

```bash
createdb suman          # PostgreSQL-də DB yarat (bir dəfə)
npm run db:init
npm run db:seed
npm run dev
```

### Verilənlər bazasını sıfırlamaq (production)

**Diqqət:** Geri qaytarılmaz — bütün şirkətlər, müştərilər, sifarişlər, xərclər, anbar, bildirişlər silinir.

```bash
cd ~/api-suman
pm2 stop api-suman          # API dayansın (tövsiyə)
npm run db:reset            # biznes məlumatları silinir; user hesabları saxlanır
npm run db:seed             # istəyə görə: demo şirkət + admin/kuryer
pm2 start api-suman
```

Hamısını sıfırdan (owner daxil bütün userlər):
```bash
npm run db:reset -- --drop-users
npm run db:seed
```

Seed olmadan: owner paneldən (`owner@suman.az`) yeni şirkət və admin/kuryer yaradın.

### Köhnə / yanlış sxem var idisə

Əvvəlki `orders` cədvəlində `customer_name` kimi sütunlar ola bilər — bu API ilə uyğun deyil.
Cədvəlləri təmiz sıfırlamaq üçün:

```bash
npm run db:reset        # orders, customers, notifications silinir; users saxlanır
npm run db:seed         # admin/kuryer (yoxdursa)

# Hamısını sıfırdan (users də silinir):
npm run db:reset -- --drop-users
npm run db:seed
```

**Seed hesablar (development):**
| Rol | Email | Şifrə | Lisenziya |
|-----|-------|-------|------------|
| owner | owner@suman.az | owner123 | yox |
| admin | admin@suman.az | admin123 | `npm run db:seed` çıxışındakı kod |
| kuryer | kuryer@suman.az | kuryer123 | eyni kod |

```bash
npm run db:migrate:tenant   # mövcud DB üçün (bir dəfə)
npm run db:seed
```

## API xülasəsi

### Auth
- `POST /api/auth/login` — admin/kuryer: `{ email, password, license_code }` · owner: `{ email, password }`
- `POST /api/auth/register` — bağlı (owner şirkət istifadəçisi yaradır)

### Owner (platform)
- `GET /api/owner/companies` — bütün şirkətlər + statistika
- `POST /api/owner/companies` — `{ name, license_expires_at?, is_active? }` → avtomatik `license_code`
- `PATCH /api/owner/companies/:id` — aktiv/deaktiv, ad, müddət
- `POST /api/owner/companies/:id/regenerate-license` — yeni kod
- `POST /api/owner/companies/:id/users` — `{ email, password, name, role: admin|courier }`
- `GET /api/owner/companies/:id/users`
- `PUT /api/owner/companies/:id/users/:userId` — redaktə (şifrə opsional)
- `DELETE /api/owner/companies/:id/users/:userId` — sil
- `GET /api/owner/live` — bütün şirkətlərin günün icmalı (canlı monitor)
- `GET /api/owner/live/feed` — son əməliyyatlar (`?company_id=&since=&limit=`)
- `GET /api/owner/companies/:id/monitor` — şirkət detal + dashboard
- `GET /api/owner/companies/:id/history` — history dashboard
- `GET /api/owner/companies/:id/orders` — sifarişlər
- `GET /api/owner/companies/:id/warehouse` — anbarlar + son update-lər
- Frontend: `docs/OWNER_FRONTEND_LIVE_MONITOR.md`
### Müştərilər (admin CRUD)
- `GET /api/customers` — siyahı (`deposit`, `notes` daxil)
- `GET /api/customers/search?q=` — sifariş yaradarkən axtarış: ad, telefon, **ünvan** (ünvan uyğunluqları əvvəl)
- `GET /api/customers/export` — Excel
- `GET /api/customers/deposit-totals` — ümumi depozit cəmi
- `POST /api/customers` — `{ name, surname?, phone, address, price?, active_bidons?, debt?, deposit?, notes? }`
- `PUT /api/customers/:id` — depozit dəyişəndə `deposit_entries` ledger
- `DELETE /api/customers/:id` — depozit ümumi cəmdən çıxır (ledger `delete`)
- Frontend: `docs/ADMIN_FRONTEND_CUSTOMER_DEPOSIT.md`

### Sifarişlər
- `GET /api/orders` — `?status=&courier_id=&completedToday=true`
- `GET /api/orders/completed/:period` — `today` \| `week` \| `month` \| `custom` + `startDate`, `endDate`
- `GET /api/orders/:id`
- `POST /api/orders` (admin) — `{ customer_id, courier_id?, bidons_count?, address?, price?, notes? }`
- `PUT /api/orders/:id` (admin)
- `PUT /api/orders/:id/done` (admin) — admin tərəfdən tamamlama
- `PUT /api/orders/:id/start` (kuryer/admin) — `in_progress`
- `PUT /api/orders/:id/complete` (kuryer/admin) — `{ payment_type: cash|card|credit, amount_paid?, empty_bidons_returned?, full_bidons_given?, notes? }`
- `PUT /api/orders/:id/mark-paid` (admin) — nişə sifarişini ödənilmiş qeyd edir
- `DELETE /api/orders/:id` (admin)

Tamamlanmış sifarişlərdə `is_paid` / `paid_at`: `cash` və `card` avtomatik ödənilmiş; `credit` ödənilməmiş qalır.

Kuryer tamamladıqda admin paneldə də `completed` olur (eyni status).

### Kuryerlər
- `GET /api/couriers` — kuryer siyahısı
- `GET /api/orders/courier/:courierId` — kuryer sifarişləri
- `GET /api/orders/courier/:courierId/export?period=` — Excel tarixçə

### Tarixçə (admin)
- `GET /api/history?period=today|week|month|custom&startDate=&endDate=` — sifarişlər + gəlir xülasəsi
- `GET /api/history/export?period=...` — Excel

### Bildirişlər / Push (Android + iOS)
- `POST /api/devices/register` — `{ token, platform: "android"|"ios", app: "admin"|"courier" }` (login sonrası)
- `DELETE /api/devices/unregister` — `{ token }`
- Kuryer: `GET /api/notifications`, `POST /api/notifications/device-token` (köhnə, eyni `platform`)
- Kuryer təyin → push; kuryer tamamlayır/xərc/qeyd → admin push (`FIREBASE_SERVICE_ACCOUNT_JSON`)
- 1 ay sifariş etməyən müştəri → admin in-app + push (`customer_inactive`)
- Sənədlər: `docs/PUSH-ADMIN.md`, `docs/PUSH-KURYEER.md`

### Su doldurma anbarı
- `GET /api/warehouse/summary` — anbar + müştəri cəmi `active_bidons`
- `GET /api/warehouse/updates` — tarixçə
- `POST /api/warehouse/update` — kuryer (boş/dolu daxil, götürülən, yerdə qaldı)
- `PATCH /api/warehouse/stock` — admin düzəlişi
- Kuryer yeniləyəndə admin push: `warehouse_updated`
- `docs/WAREHOUSE.md`, `docs/ADMIN_FRONTEND_WAREHOUSE.md`, `docs/COURIER_FRONTEND_WAREHOUSE.md`

### İstifadəçilər (admin)
- `POST /api/users` — kuryer/admin yaratmaq
- `GET /api/users`

## Biznes qaydaları

- **Nişə (credit):** `payment_type: "credit"` olduqda ödənilməyən məbləğ müştəri `debt`-inə əlavə olunur; `is_paid: false`. Admin `mark-paid` edəndə borc azalır.
- **Ödəniş statusu:** `cash` / `card` → `is_paid: true`, `paid_at` avtomatik; `credit` → `is_paid: false` (sonradan admin `PUT /api/orders/:id/mark-paid`).
- **Bidonlar:** Tamamlananda `active_bidons += full_bidons_given - empty_bidons_returned`.
- **Təyinat:** Kuryer təyin olunanda `notifications` cədvəlinə yazılır.

## Header

```
Authorization: Bearer <token>
```
