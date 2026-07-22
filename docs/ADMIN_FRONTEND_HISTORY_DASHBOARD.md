# Admin — Tarixçə dashboard (7 pul qutu + 2 bidon)

Yeni tarixçə səhifəsi `GET /api/history` və ya yalnız qutular üçün `GET /api/history/dashboard` ilə işləyir.

## Filterlər

| Parametr | Məna |
|----------|------|
| `period` | `today` (default), `yesterday`, `week`, `month`, `custom` |
| `startDate`, `endDate` | `period=custom` üçün (YYYY-MM-DD) |
| `courier_id` | Kuryer filteri; göndərilməsə — **hamısı birlikdə** |

```http
GET /api/history/dashboard?period=today
GET /api/history/dashboard?period=custom&startDate=2026-07-08&endDate=2026-07-09
GET /api/history/dashboard?period=today&courier_id=3
```

Cavabda `couriers` — filter dropdown üçün kuryer siyahısı.

## Qutular (`dashboard`)

| Qutu | API sahəsi | Məna |
|------|------------|------|
| 1. Satış | `dashboard.sales` | Su satışı (2.50 / 3.00 və s.) + pompa, dispenser, cərimə |
| 2. Borc verildi | `dashboard.debt_given` | Müştərilərin ödədiyi köhnə borc |
| 3. Nişə | `dashboard.credit` | Nişə ilə tamamlanmış, ödənilməmiş sifarişlər |
| 4. Ödənilib | `dashboard.prepaid` | Əvvəlcədən ödənilmiş sifarişlər (kuryer pul almır) |
| 5. Kuryerdə qalıq | `dashboard.courier_balance` | (Satış + Borc verildi) − (Nişə + Ödənilib + qismən nağd/kart qalığı) |
| 6. Xərclər | `dashboard.expenses` | Admin və kuryer xərcləri |
| 7. Qalıq | `dashboard.net_balance` | Kuryerdə qalıq − Xərclər |
| 8. Satılan bidon | `dashboard.bidons_sold` | Verilən **dolu** bidon sayı |
| 9. Götürülən bidon | `dashboard.bidons_taken` | Müştəridən alınan **boş** bidon sayı |
| 10. Depozit | `dashboard.deposits` | Periodda daxil/çıxan depozit + ümumi cəm |

### Düstur

```
kuryerdə_qalıq = satış + borc_verildi − nişə − ödənilib − qismən_ödənilməmiş_nağd/kart
qalıq = kuryerdə_qalıq − xərclər
```

`dashboard.courier_balance.formula` — hesabın detallı bölgüsü.

## 1. Satış qutusu

```json
{
  "sales": {
    "total": 298.5,
    "water_total": 286.5,
    "extras_total": 12,
    "water": [
      { "unit_price": 2.5, "bidons": 21, "amount": 52.5 },
      { "unit_price": 3, "bidons": 78, "amount": 234 }
    ],
    "extras": [
      { "type": "pump", "label": "Pompa", "count": 1, "amount": 12 }
    ],
    "by_courier": [...],
    "orders": [...]
  }
}
```

**Modal:** qutuya klik → `sales.orders` və ya `sales.by_courier` göstərin.

## 2. Borc verildi

Yalnız **kuryerin** müştəridən aldığı köhnə borc ödənişi (`debt_paid` tamamlamada).

**Daxil deyil:**
- Admin panelindən borc sıfırlama / `pay-debt`
- Admin `mark-paid`

Admin ödənişləri aşağıdakı `debtPayments` siyahısında görünür (`recorded_by_role: "admin"`).

```json
{
  "debt_given": {
    "total": 23,
    "count": 2,
    "customers": [
      {
        "customer": "Adrik",
        "amount": 9,
        "order_id": 15,
        "recorded_by_name": "Elnur",
        "recorded_by_role": "courier"
      }
    ]
  }
}
```

`debtPayments` (aşağı siyahı) — bütün ödənişlər (kuryer + admin).

## 3. Nişə / ödənilməmiş

`dashboard.credit` — **bütün ödənilməmiş qalıqlar** (nişə + qismən nağd/kart).

`summary.unpaidCreditAmount` ilə **eyni məbləğ** olmalıdır.

| Sahə | Məna |
|------|------|
| `kind: "credit"` | Tam nişə (`payment_type: credit`) |
| `kind: "partial"` | Qismən ödəniş (məs. 22.50-dən 10 ödənib → 12.50) |

Nümunə: qiymət 22.50, `amount_paid: 10` → modalda **12.50** (`kind: partial`).

Kuryer/admin borc ödəyəndə bu sifarişlər bağlanır və qutudan çıxır.

## 4. Ödənilib

`is_prepaid: true` sifarişlər — müştəri təyinat zamanı ödəyib.

## 5–7. Kuryer üzrə bölünmə

`by_courier` — hər kuryer üçün eyni 7 pul qutu + 2 bidon qutu (filter olmadan `GET /api/history` çağırılanda).

## 8–9. Bidon qutuları (YENİ)

Pul qutularının **yanında** göstərin — məbləğ AZN deyil, **ədəd**.

```json
{
  "bidons_sold": {
    "total": 99,
    "count": 40,
    "unit": "bidon",
    "label": "Satılan bidon",
    "items": [
      {
        "order_id": 395,
        "customer": "Müştəri Adı",
        "courier_id": 3,
        "courier_name": "Elnur",
        "bidons": 3,
        "completed_at": "..."
      }
    ]
  },
  "bidons_taken": {
    "total": 85,
    "count": 38,
    "unit": "bidon",
    "label": "Götürülən bidon",
    "items": [
      {
        "order_id": 395,
        "customer": "Müştəri Adı",
        "courier_id": 3,
        "courier_name": "Elnur",
        "bidons": 2,
        "order_type": "delivery",
        "completed_at": "..."
      }
    ]
  }
}
```

| Sahə | Məna |
|------|------|
| `bidons_sold.total` | Verilən **dolu** (`full_bidons_given`) — yalnız çatdırılma |
| `bidons_taken.total` | Alınan **boş** (`empty_bidons_returned`) — çatdırılma + pickup |
| `count` | Sifariş sayı (bidonu > 0 olanlar) |
| `items` | Modal üçün siyahı |

**UI:** kartlarda `total` + «bidon» yazısı; klik → `items`.

Anbardan götürülən dolu (`warehouse full_taken`) bu qutularda **yoxdur** — anbar səhifəsindədir.

## 10. Depozit qutusu

Period üzrə daxil olan / çıxan depozit. Tam sənəd: `docs/ADMIN_FRONTEND_CUSTOMER_DEPOSIT.md`.

```json
{
  "deposits": {
    "entered": 120,
    "removed": 40,
    "net": 80,
    "current_total": 1540.5,
    "entries": [...]
  }
}
```

## UI tövsiyəsi

1. Yuxarıda period + kuryer filteri
2. 7 pul kartı + **2 bidon** + **1 depozit** kartı
3. Satış, Xərclər, Bidon, Depozit kartlarına klik → modal
4. Aşağıda köhnə `orders`, `expenses`, `debtPayments`, `depositEntries` siyahıları (istəyə görə)

## Əlaqəli sənədlər

- `docs/ADMIN_FRONTEND_CUSTOMER_DEPOSIT.md` — depozit + müştəri qeydi
- `docs/ADMIN_FRONTEND_ORDER_EXTRAS.md` — pompa, dispenser, cərimə
- `docs/ADMIN_FRONTEND_DEBTORS.md` — borclu müştərilər səhifəsi
- `docs/ADMIN_FRONTEND_WAREHOUSE.md` — anbar (boş/dolu giriş-çıxış)
