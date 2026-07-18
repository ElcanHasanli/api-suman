# Owner panel — Canlı monitor (bütün şirkətlər)

**Kimə:** Owner frontend (`suman.khamsacraft.az`)  
**Auth:** yalnız `role: owner` — `Authorization: Bearer <owner_token>`  
**Vacib:** bütün endpointlər **read-only**. Admin/kuryer əməliyyatı yazılmır.

---

## Nə üçündür?

Owner bütün şirkətlərin günün icmalını və son əməliyyatları **canlı** izləyir (polling). WebSocket yoxdur — sadə `setInterval` kifayətdir.

| Poll | Endpoint | Tövsiyə |
|------|----------|---------|
| İcmal kartlar | `GET /api/owner/live` | hər **15–30 s** |
| Aktiv feed | `GET /api/owner/live/feed` | hər **10–15 s** (`since` ilə) |
| Şirkət detal | `GET .../monitor` | səhifə açılanda + 30 s |

---

## 1. Bütün şirkətlər — günün icmalı

```http
GET /api/owner/live?period=today
```

Query (admin history ilə eyni):

| Param | Default | Qeyd |
|-------|---------|------|
| `period` | `today` | `today` \| `yesterday` \| `week` \| `month` \| `custom` |
| `startDate` / `endDate` | — | yalnız `period=custom` (`YYYY-MM-DD`) |

**Cavab:**

```json
{
  "period": "today",
  "startDate": null,
  "endDate": null,
  "generated_at": "2026-07-10T10:00:00.000Z",
  "totals": {
    "active_orders": 12,
    "completed_orders": 40,
    "sales": 520.5,
    "debt_given": 80,
    "credit": 35,
    "expenses": 45,
    "net_balance": 520.5
  },
  "companies": [
    {
      "company_id": 1,
      "company_name": "Demo Şirkət",
      "is_active": true,
      "active_orders": 3,
      "completed_orders": 10,
      "sales": 120,
      "debt_given": 20,
      "credit": 10,
      "prepaid": 5,
      "courier_balance": 95,
      "expenses": 15,
      "net_balance": 120
    }
  ]
}
```

**UI:** yuxarıda `totals` kartları; altda şirkət cədvəli / kartları. Sətirə klik → şirkət monitor.

Qutu mənaları admin history dashboard ilə eynidir (`sales`, `debt_given`, `credit`, …).

---

## 2. Canlı feed (son əməliyyatlar)

```http
GET /api/owner/live/feed?limit=50
GET /api/owner/live/feed?company_id=1&limit=30&since=2026-07-10T09:55:00.000Z
```

| Param | Default | Qeyd |
|-------|---------|------|
| `limit` | `50` | max `100` |
| `company_id` | — | yalnız bir şirkət |
| `since` | — | ISO timestamptz — yalnız bundan **sonra** olanlar (incremental poll) |

**Cavab:**

```json
{
  "generated_at": "...",
  "company_id": null,
  "events": [
    {
      "type": "order_completed",
      "company_id": 1,
      "company_name": "Demo Şirkət",
      "entity_id": 395,
      "message": "Demo Şirkət: Elnur sifariş #395 tamamladı — Müştəri · 12 AZN",
      "actor_name": "Elnur",
      "amount": 12,
      "event_at": "...",
      "event_at_baku": "2026-07-10 14:22:01",
      "meta": { "status": "completed", "payment_type": "cash", "customer": "..." }
    }
  ]
}
```

### Event tipləri

| `type` | Məna |
|--------|------|
| `order_created` | yeni / pending sifariş |
| `order_assigned` | kuryerə təyin |
| `order_completed` | tamamlandı |
| `order_updated` | digər status |
| `expense_created` | xərc |
| `debt_collected` | borc ödənişi |
| `warehouse_updated` | kuryer anbar formu |

**Polling tip:**

1. İlk yükləmə: `GET /live/feed?limit=50` → siyahını göstər.
2. Sonra hər 10–15 s: `since=<son event_at və ya generated_at>` — yalnız yeni eventləri prepend et.
3. Eyni `entity_id` + `type` təkrar gələ bilər (order update) — UI-də dedupe: `type + entity_id + event_at`.

---

## 3. Şirkət monitor (detal)

```http
GET /api/owner/companies/:id/monitor?period=today
```

Bir cavabda: dashboard (7 qutu), `by_courier`, aktiv sifarişlər, tamamlananlar, xərclər, borc ödənişləri, anbarlar, admin/kuryer siyahısı.

```json
{
  "company": { "id": 1, "name": "...", "is_active": true, "license_code": "..." },
  "dashboard": { "sales": { "total": 120 }, "..." : "..." },
  "by_courier": [ ... ],
  "active_orders": [ ... ],
  "completed_orders": [ ... ],
  "expenses": [ ... ],
  "debtPayments": [ ... ],
  "warehouses": [ ... ],
  "users": [ { "id": 2, "name": "...", "role": "courier", "status": "active" } ],
  "counts": { "active_orders": 3, "completed_orders": 10, "expenses": 2, "debt_payments": 1 }
}
```

---

## 4. Əlavə (opsional) endpointlər

Eyni auth; monitor səhifəsində tab kimi istifadə edin.

| Method | URL | Qeyd |
|--------|-----|------|
| `GET` | `/api/owner/companies/:id/history?period=today` | yalnız dashboard + siyahılar |
| `GET` | `/api/owner/companies/:id/orders?status=assigned&limit=100` | `status` opsional |
| `GET` | `/api/owner/companies/:id/warehouse` | anbarlar + son 50 update |

---

## UI skelet (tövsiyə)

1. **Canlı** səhifə (default):
   - `totals` kartları
   - Şirkət cədvəli (`companies`)
   - Sağda və ya altda **feed** (son eventlər, şirkət adı badge)
2. Şirkətə klik → **Monitor** səhifəsi (`/companies/:id/monitor`)
3. Feed-də eventə klik → eyni şirkət monitoru / sifariş id göstər

Yazma əməliyyatı (sifariş tamamla, xərc yarat və s.) owner paneldə **yoxdur** — yalnız izləmə.

---

## Xətalar

| Status | Məna |
|--------|------|
| `401` / `403` | token yox / rol `owner` deyil |
| `404` | şirkət tapılmadı (`.../monitor` və s.) |
| `500` | server xətası — `error` mesajı |

---

## Deploy qeydi

Backend-də `pm2 restart api-suman` sonrası bu route-lar aktiv olur. Frontend-də əlavə env lazım deyil — eyni API base URL.
