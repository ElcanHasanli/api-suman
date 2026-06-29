# Kuryer — Qismən ödəniş və borc

Kuryer sifarişi tamamlayarkən müştəri **tam məbləği ödəməyibsə**, fərq avtomatik müştəri borcuna yazılır.

## Tamamlama

```http
PUT /api/orders/:id/complete
```

```json
{
  "payment_type": "cash",
  "amount_paid": 1,
  "empty_bidons_returned": 2,
  "full_bidons_given": 3,
  "notes": ""
}
```

| `payment_type` | `amount_paid` default (göndərilməsə) |
|----------------|--------------------------------------|
| `credit` | `0` |
| `cash` / `card` | tam `price` |

**Vacib:** müştəri qismən ödəyibsə **`amount_paid` mütləq göndərin** — real ödənilən məbləğ.

### Nümunələr

| Qiymət | `amount_paid` | Nəticə |
|--------|---------------|--------|
| 3 AZN | 1 | Borc +2 AZN, `is_paid: false`, `remaining_amount: 2` |
| 3 AZN | 3 | Borc dəyişmir (əgər əvvəl borc yoxdursa), `is_paid: true` |
| 6 AZN | 0 (`credit`) | Borc +6 AZN, `is_paid: false` |

## Cavabda yeni sahələr

`GET /api/orders`, `GET /api/orders/:id`, tamamlama cavabı:

```json
{
  "price": 3,
  "amount_paid": 1,
  "is_paid": false,
  "remaining_amount": 2,
  "debt": 5,
  "payment_type": "cash"
}
```

| Sahə | Mənası |
|------|--------|
| `remaining_amount` | Bu sifarişdə ödənilməmiş qalıq |
| `debt` | Müştərinin ümumi borcu (join-dən) |

## UI tövsiyəsi

1. Tamamlama formunda **«Ödənilən məbləğ»** sahəsi — default tam qiymət; kuryer azalda bilər
2. `amount_paid < price` olduqda xəbərdarlıq: «Qalan **X AZN** müştəri borcuna yazılacaq»
3. `payment_type: credit` — ödəniş 0, bütün məbləğ borca gedir
4. Tam ödənişdən sonra `is_paid: true` — redaktə bağlanır (admin tam ödəyənə qədər qismən ödənişdə redaktə açıq qalır)

## Redaktə (24 saat)

`PATCH /api/orders/:id/completion` — `amount_paid` dəyişəndə borc yenidən hesablanır (köhnə təsir geri alınır, yeni tətbiq olunur).

`is_paid: true` (tam ödənilib və ya admin ödəyib) → redaktə **bağlı**, `courier_editable: false`.

**Xəta kodları:** `ORDER_ALREADY_PAID`, `EDIT_WINDOW_EXPIRED`, `AMOUNT_EXCEEDS_ORDER` (`amount_paid > price`).

Ətraflı: `docs/COURIER_FRONTEND_COMPLETION_EDIT.md`.
