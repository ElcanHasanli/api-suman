# Admin — Sifariş əlavələri (pompa, dispenser, cərimə) və ödənilib

## Əlavə növləri

| `type` | Məna |
|--------|------|
| `pump` | Su pompası |
| `dispenser` | Dispenser |
| `fine` | Cərimə (məs. bidon qırılması) |
| `other` | Digər |

## Sifariş yaratma

```http
POST /api/orders
```

```json
{
  "customer_id": 12,
  "courier_id": 3,
  "bidons_count": 2,
  "unit_price": 2.5,
  "order_type": "delivery",
  "scheduled_date": "2026-07-09",
  "extras": [
    { "type": "pump", "amount": 12, "quantity": 1 },
    { "type": "fine", "description": "Bidon qırıldı", "amount": 5, "quantity": 1 }
  ],
  "is_prepaid": true,
  "prepaid_amount": 10
}
```

### Qiymət hesabı

- `unit_price` göndərilsə: su = `unit_price × bidons_count`
- Yalnız `price` göndərilsə (köhnə API): su = `price` (ümumi)
- Heç biri yoxdursa: `müştəri.price × bidons_count`
- **Ümumi** `price` = su + `extras` cəmi

### Ödənilib (`is_prepaid`)

Müştəri sifariş təyin olunanda artıq ödəyibsə:

```json
{
  "is_prepaid": true,
  "prepaid_amount": 17
}
```

- Kuryer tamamlayanda bu məbləği **təkrar almır**
- Tarixçədə **Ödənilib** qutusuna düşür
- Sifariş cavabında: `is_prepaid: true`, `prepaid_amount`

## Cavab sahələri

| Sahə | Məna |
|------|------|
| `unit_price` | Su vahid qiyməti (2.5, 3 və s.) |
| `extras` | Əlavə sətirlər massivi |
| `is_prepaid` | Əvvəlcədən ödənilib |
| `prepaid_amount` | Ödənilmiş məbləğ |

## Anbar

Pompa/dispenser satılanda (`extras` ilə) anbar sayı avtomatik azalır.

Anbar idarəetməsi: `PATCH /api/warehouse/stock` — `pump_count`, `dispenser_count` sahələri.

Ətraflı: `docs/ADMIN_FRONTEND_WAREHOUSE.md`.
