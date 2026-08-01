# Admin — Tarixçə: Günlük və Aylıq hesabat

Tarixçə səhifəsində **2 tab**:

1. **Günlük hesabat** — mövcud bütün qutular, yalnız **1 gün**
2. **Aylıq hesabat** — sadələşdirilmiş qutular, **tarix aralığı**

---

## 1. Günlük hesabat

| Method | URL |
|--------|-----|
| `GET` | `/api/history` |
| `GET` | `/api/history/dashboard` |

### Filterlər

| Parametr | Məna |
|----------|------|
| `period` | `today` (default) \| `yesterday` \| `custom` |
| `date` | Tək gün seçimi: `YYYY-MM-DD` (məs. keçən ayın 20-si) |
| `startDate` + `endDate` | `custom` üçün — **eyni gün** olmalıdır |
| `courier_id` | Kuryer filteri (opsional) |
| `expense_q` | Xərc **təsvirinə** görə axtarış (ILIKE) |

```http
GET /api/history/dashboard?period=today
GET /api/history/dashboard?period=yesterday
GET /api/history/dashboard?date=2026-06-20
GET /api/history/dashboard?period=custom&startDate=2026-06-20&endDate=2026-06-20
GET /api/history/dashboard?period=today&expense_q=yanacaq
```

**Qadağan:** `period=week|month` → `400` (`DAILY_PERIOD_INVALID`). Aralıq üçün aylıq tab.

### UI — günlük filter

- Bu gün / Dünən
- Tarix seçici (**1 gün**)
- Kuryer (opsional)

### Günlük qutular (hamısı qalır)

| Qutu | API | Klik → |
|------|-----|--------|
| Satış | `dashboard.sales` | `sales.orders` |
| Borc verildi | `dashboard.debt_given` | `customers` |
| Nişə | `dashboard.credit` | **`credit.customers`** — hansı müştəridə nişə/ödənilməmiş |
| Ödənilib | `dashboard.prepaid` | … |
| Kuryerdə qalıq | `dashboard.courier_balance` | … |
| Xərclər | `dashboard.expenses` | `expenses.items` + **təsvir filteri** (`expense_q`) |
| Qalıq | `dashboard.net_balance` | … |
| Satılan bidon | `dashboard.bidons_sold` | `items` |
| Götürülən bidon | `dashboard.bidons_taken` | `items` |
| Depozit | `dashboard.deposits` | `entries` |

### Nişə modalı (günlük + aylıq)

```json
{
  "credit": {
    "total": 35.5,
    "count": 3,
    "label": "Nişə / ödənilməmiş",
    "customers": [
      {
        "order_id": 101,
        "customer_id": 12,
        "customer": "Azer Huseynov",
        "amount": 12.5,
        "price": 22.5,
        "amount_paid": 10,
        "payment_type": "cash",
        "kind": "partial",
        "courier_name": "Elnur",
        "completed_at": "..."
      },
      {
        "order_id": 102,
        "customer": "Xelil",
        "amount": 6,
        "payment_type": "credit",
        "kind": "credit"
      }
    ]
  }
}
```

| `kind` | Məna |
|--------|------|
| `credit` | Tam nişə |
| `partial` | Qismən ödəniş — qalıq ödənilməyib |

### Xərc modalı + filter

Xərclər qutusuna klik → siyahı + axtarış inputu (təsvir).

```http
GET /api/history/dashboard?period=today&expense_q=yanacaq
```

`dashboard.expenses.items` və `expenses` massivi filterlənmiş gəlir. `description` sahəsinə görə axtarış.

---

## 2. Aylıq hesabat (YENİ)

| Method | URL |
|--------|-----|
| `GET` | `/api/history/monthly` |
| `GET` | `/api/history/monthly/dashboard` |

### Filterlər — tarix aralığı

| Parametr | Məna |
|----------|------|
| `startDate`, `endDate` | Mütləq (`period=custom`, default) |
| `period` | `custom` \| `week` \| `days2` \| `month` (UI shortcut) |
| `courier_id` | opsional |
| `expense_q` | Xərc təsviri axtarışı |

```http
GET /api/history/monthly?startDate=2026-07-01&endDate=2026-07-31
GET /api/history/monthly?period=week
GET /api/history/monthly?period=days2
GET /api/history/monthly?period=month
GET /api/history/monthly?startDate=2026-07-01&endDate=2026-07-07&expense_q=pompa
```

**UI tövsiyəsi:** date-range picker. Shortcut düymələr:

| Düymə | Backend |
|-------|---------|
| 2 gün | `period=days2` və ya `startDate=dünən&endDate=bugün` |
| Həftə | `period=week` |
| Bu ay | `period=month` |
| Özəl aralıq | `startDate` + `endDate` |

### Aylıq qutular

| Qutu | API | Məna |
|------|-----|------|
| Satış | `dashboard.sales` | Su + extras |
| Nişə | `dashboard.credit` | Ödənilməmiş (nişə/qismən) — klik → müştərilər |
| Xərclər | `dashboard.expenses` | + `expense_q` filter |
| Satılan bidon | `dashboard.bidons_sold` | Dolu verilən |
| Götürülən bidon | `dashboard.bidons_taken` | Boş alınan |
| Xalis gəlir | `dashboard.net_income` | **satış − xərclər** |

```json
{
  "report": "monthly",
  "period": "custom",
  "startDate": "2026-07-01",
  "endDate": "2026-07-31",
  "expense_q": null,
  "dashboard": {
    "sales": { "total": 5200, "...": "..." },
    "credit": { "total": 180, "customers": ["..."] },
    "expenses": { "total": 450, "items": ["..."] },
    "bidons_sold": { "total": 1200 },
    "bidons_taken": { "total": 1100 },
    "net_income": {
      "total": 4750,
      "sales": 5200,
      "expenses": 450,
      "formula": "xalis_gəlir = satış − xərclər",
      "label": "Xalis gəlir"
    }
  }
}
```

Aylıqda **yoxdur:** borc verildi, ödənilib, kuryerdə qalıq, depozit, `by_courier` (lazımdırsa sonra əlavə olunar).

---

## UI skelet

```
[ Günlük hesabat ]  [ Aylıq hesabat ]

Günlük:
  [ Bu gün ] [ Dünən ] [ 📅 1 gün ]  [ Kuryer ▾ ]
  → 10 qutu (mövcud)

Aylıq:
  [ 2 gün ] [ Həftə ] [ Bu ay ]  [ 📅 — 📅 aralıq ]  [ Kuryer ▾ ]
  → 6 qutu: Satış | Nişə | Xərclər | Satılan | Götürülən | Xalis gəlir
```

Xərclər modalında hər iki tabda təsvir axtarışı.  
Nişə modalında hər iki tabda `credit.customers`.

---

## Xətalar

| code | Məna |
|------|------|
| `DAILY_PERIOD_INVALID` | Günlükdə week/month |
| `DAILY_SINGLE_DAY_ONLY` | startDate ≠ endDate |
| `RANGE_DATES_REQUIRED` | Aylıqda tarix yoxdur |

## Deploy

```bash
pm2 restart api-suman
```

Migration lazım deyil.
