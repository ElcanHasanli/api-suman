# Kuryer — Əlavə ödənişlər və ödənilib sifarişlər

## Sifariş detalında yeni sahələr

`GET /api/orders/:id`, sifariş siyahısı:

| Sahə | Məna |
|------|------|
| `unit_price` | Su vahid qiyməti (2.50, 3.00) |
| `extras` | Pompa, dispenser, cərimə və s. |
| `is_prepaid` | Müştəri artıq ödəyib |
| `prepaid_amount` | Əvvəlcədən ödənilmiş məbləğ |

### `extras` nümunəsi

```json
{
  "extras": [
    { "type": "pump", "label": "Pompa", "amount": 12, "quantity": 1 }
  ]
}
```

## Tamamlama

- **Ödənilib** sifarişdə kuryer sifariş məbləğini təkrar almır — yalnız köhnə borc və ya qalan hissə
- `max_completion_payment` = `(price - prepaid_amount) + customer_debt`
- Ümumi qiymət `price`-ə pompa/cərimə daxildir

### Nümunə

Sifariş: 2 su × 2.50 = 5 + pompa 12 = **17 AZN**, `prepaid_amount: 10`

Kuryer tamamlayanda max nağd: **7 AZN** (qalan sifariş) + müştəri borcu.

## UI tövsiyəsi

1. Sifariş kartında `is_prepaid` olduqda **«Ödənilib»** badge
2. `extras` varsa ayrıca sətirdə göstərin
3. Tamamlama formunda `prepaid_amount` çıxılmış qalığı göstərin

Ətraflı ödəniş: `docs/COURIER_FRONTEND_PARTIAL_PAYMENT.md`.
