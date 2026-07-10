# Kuryer — Əlavə ödənişlər və ödənilib sifarişlər

## Sifariş detalında yeni sahələr

`GET /api/orders/:id`, sifariş siyahısı:

| Sahə | Məna |
|------|------|
| `unit_price` | Su vahid qiyməti (2.50, 3.00) |
| `extras` | Pompa, dispenser, cərimə və s. |
| `is_prepaid` | Müştəri artıq ödəyib |
| `prepaid_amount` | Əvvəlcədən ödənilmiş məbləğ |
| `order_due` | Sifariş üçün qalan ödəniş (`price - prepaid_amount`) |
| `max_order_payment` | Sifariş input max |
| `max_debt_payment` | Borc input max |

### `extras` nümunəsi

```json
{
  "extras": [
    { "type": "pump", "label": "Pompa", "amount": 12, "quantity": 1 }
  ]
}
```

## Tamamlama — iki input

```json
{
  "payment_type": "cash",
  "amount_paid": 0,
  "debt_paid": 21
}
```

- **`amount_paid`** — yalnız sifariş qalığı (`order_due`)
- **`debt_paid`** — yalnız köhnə borc (`customer_debt`)

### Prepaid nümunə

Sifariş: 40 AZN, `prepaid_amount: 40`, `customer_debt: 21`

→ `order_due: 0`, `max_order_payment: 0`, `max_debt_payment: 21`

Kuryer yalnız borc ödəyə bilər: `{ "amount_paid": 0, "debt_paid": 21 }`.

## UI tövsiyəsi

1. `is_prepaid` → **«Ödənilib»** badge
2. `extras` varsa ayrıca sətirdə
3. Tamamlama formunda **iki input**: sifariş + borc
4. `order_due === 0` olduqda sifariş inputunu bağlayın

Ətraflı: `docs/COURIER_FRONTEND_PARTIAL_PAYMENT.md`.
