# Admin — Tarixçə dashboard (7 qutu)

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

## 7 qutu (`dashboard`)

| Qutu | API sahəsi | Məna |
|------|------------|------|
| 1. Satış | `dashboard.sales` | Su satışı (2.50 / 3.00 və s.) + pompa, dispenser, cərimə |
| 2. Borc verildi | `dashboard.debt_given` | Müştərilərin ödədiyi köhnə borc |
| 3. Nişə | `dashboard.credit` | Nişə ilə tamamlanmış, ödənilməmiş sifarişlər |
| 4. Ödənilib | `dashboard.prepaid` | Əvvəlcədən ödənilmiş sifarişlər (kuryer pul almır) |
| 5. Kuryerdə qalıq | `dashboard.courier_balance` | (Satış + Borc verildi) − (Nişə + Ödənilib + qismən nağd/kart qalığı) |
| 6. Xərclər | `dashboard.expenses` | Admin və kuryer xərcləri |
| 7. Qalıq | `dashboard.net_balance` | Kuryerdə qalıq − Xərclər |

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

```json
{
  "debt_given": {
    "total": 23,
    "count": 2,
    "customers": [
      { "customer": "Adrik", "amount": 9, "order_id": 15 },
      { "customer": "Elvira", "amount": 14, "order_id": null }
    ]
  }
}
```

## 3. Nişə

`payment_type === 'credit'` **və hələ ödənilməmiş** (`is_paid: false`, `remaining_amount > 0`) tamamlanmış sifarişlər.

Kuryer/admin sonradan müştəri borcunu ödəyəndə (`debt_paid` və ya borclu müştərilər səhifəsi) həmin köhnə nişə sifarişləri avtomatik bağlanır və bu qutudan çıxır.

## 4. Ödənilib

`is_prepaid: true` sifarişlər — müştəri təyinat zamanı ödəyib.

## 5–7. Kuryer üzrə bölünmə

`by_courier` — hər kuryer üçün eyni 7 qutu (filter olmadan `GET /api/history` çağırılanda).

## UI tövsiyəsi

1. Yuxarıda period + kuryer filteri
2. 7 kart (məbləğ + qısa mətn)
3. Satış və Xərclər kartlarına klik → modal (detallı siyahı)
4. Aşağıda köhnə `orders`, `expenses`, `debtPayments` siyahıları (istəyə görə)

## Əlaqəli sənədlər

- `docs/ADMIN_FRONTEND_ORDER_EXTRAS.md` — pompa, dispenser, cərimə
- `docs/ADMIN_FRONTEND_DEBTORS.md` — borclu müştərilər səhifəsi
- `docs/ADMIN_FRONTEND_WAREHOUSE.md` — anbar pompa/dispenser
