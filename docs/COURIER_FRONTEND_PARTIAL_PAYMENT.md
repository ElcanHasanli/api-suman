# Kuryer — Qismən ödəniş, borc və birlikdə ödəniş

Kuryer sifarişi tamamlayarkən:

1. **Sifariş qiymətini** qismən və ya tam ödəyə bilər
2. Ödəniş artıq qalıbsa, **müştərinin köhnə borcunu** da bağlaya bilər
3. Sifarişdə ödənilməyən qalıq avtomatik müştəri borcuna yazılır

## Müştəri borcu (sifariş siyahısı / detal)

`GET /api/orders`, `GET /api/orders/:id` — join-dən:

| Sahə | Mənası |
|------|--------|
| `customer_debt` | Müştərinin cari ümumi borcu (AZN) |
| `max_completion_payment` | Tamamlanmamış sifarişdə: `price + customer_debt` — kuryer bu qədər ödəyə bilər |

## Tamamlama

```http
PUT /api/orders/:id/complete
```

```json
{
  "payment_type": "cash",
  "amount_paid": 20,
  "empty_bidons_returned": 2,
  "full_bidons_given": 3,
  "notes": ""
}
```

| `payment_type` | `amount_paid` default (göndərilməsə) |
|----------------|--------------------------------------|
| `credit` | `0` |
| `cash` / `card` | tam `price` |

**Vacib:** `amount_paid` müştəridən **faktiki alınan ümumi məbləğdir** — sifariş + köhnə borc birlikdə.

### Ödənişin bölünməsi

```
sifarişə gedən = min(amount_paid, price)
köhnə borca gedən = min(amount_paid - price, customer_debt)   // price tam ödənildikdən sonra
```

| Qiymət | Köhnə borc | `amount_paid` | Nəticə |
|--------|------------|---------------|--------|
| 10 AZN | 10 AZN | 20 | Sifarişə 10, borca 10, `customer_debt: 0`, `is_paid: true` |
| 10 AZN | 10 AZN | 15 | Sifarişə 10, borca 5, `customer_debt: 5`, `is_paid: true` |
| 10 AZN | 0 | 5 | Sifarişə 5, borca 0, `customer_debt: 5`, `is_paid: false` |
| 10 AZN | 0 | 0 (`credit`) | Borc +10, `is_paid: false` |

**Limit:** `amount_paid` ≤ `price + customer_debt` (əks halda `AMOUNT_EXCEEDS_PAYABLE`).

## Cavabda sahələr

```json
{
  "price": 10,
  "amount_paid": 10,
  "debt_paid_at_completion": 10,
  "total_collected": 20,
  "is_paid": true,
  "remaining_amount": 0,
  "customer_debt": 0,
  "payment_type": "cash"
}
```

| Sahə | Mənası |
|------|--------|
| `amount_paid` | Bu sifarişin qiymətindən ödənilən hissə |
| `debt_paid_at_completion` | Tamamlama zamanı köhnə borcdan ödənilən hissə |
| `total_collected` | `amount_paid + debt_paid_at_completion` — kuryerin aldığı ümumi məbləğ |
| `remaining_amount` | Bu sifarişdə hələ ödənilməmiş qalıq |
| `customer_debt` | Müştərinin yeni ümumi borcu |

## UI tövsiyəsi

1. Tamamlama formunda müştəri borcunu göstərin (`customer_debt`)
2. **«Ödənilən məbləğ»** — default `price`; borc varsa kuryer artıra bilər (max `max_completion_payment`)
3. `amount_paid > price` olduqda: «**X AZN** köhnə borcdan ödəniləcək»
4. `amount_paid < price` olduqda: «Qalan **X AZN** müştəri borcuna yazılacaq»
5. `payment_type: credit` — ödəniş 0, bütün məbləğ borca gedir

## Redaktə (24 saat)

`PATCH /api/orders/:id/completion` — `amount_paid` dəyişəndə bölünmə və borc yenidən hesablanır.

**Xəta kodları:** `ORDER_ALREADY_PAID`, `EDIT_WINDOW_EXPIRED`, `AMOUNT_EXCEEDS_PAYABLE`.

Ətraflı: `docs/COURIER_FRONTEND_COMPLETION_EDIT.md`.
