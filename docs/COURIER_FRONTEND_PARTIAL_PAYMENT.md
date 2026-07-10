# Kuryer — Qismən ödəniş, borc və ayrı inputlar

Kuryer sifarişi tamamlayarkən **iki ayrı məbləğ** daxil edir:

1. **`amount_paid`** — yalnız **sifariş qiyməti** (və ya qalan hissəsi)
2. **`debt_paid`** — yalnız **köhnə müştəri borcu** (əlavə ödəniş)

## Sifariş sahələri

`GET /api/orders`, `GET /api/orders/:id`:

| Sahə | Mənası |
|------|--------|
| `price` | Sifariş ümumi qiyməti (su + extras) |
| `prepaid_amount` | Əvvəlcədən ödənilmiş |
| `order_due` | Tamamlamada sifariş üçün qalan: `price - prepaid_amount` |
| `customer_debt` | Müştərinin köhnə borcu |
| `max_order_payment` | Sifariş inputunun max-ı (`order_due`) |
| `max_debt_payment` | Borc inputunun max-ı (`customer_debt`) |
| `max_completion_payment` | Ümumi max: `order_due + customer_debt` |

### Nümunə (ödənilib + borc)

```json
{
  "price": 40,
  "is_prepaid": true,
  "prepaid_amount": 40,
  "order_due": 0,
  "customer_debt": 21,
  "max_order_payment": 0,
  "max_debt_payment": 21,
  "max_completion_payment": 21
}
```

Burada sifariş artıq ödənilib → `amount_paid: 0`, borc üçün `debt_paid: 0…21`.

## Tamamlama

```http
PUT /api/orders/:id/complete
```

```json
{
  "payment_type": "cash",
  "amount_paid": 40,
  "debt_paid": 10,
  "empty_bidons_returned": 2,
  "full_bidons_given": 40,
  "notes": ""
}
```

| Sahə | Default | Limit |
|------|---------|-------|
| `amount_paid` | `order_due` (credit → 0) | ≤ `max_order_payment` |
| `debt_paid` | `0` | ≤ `max_debt_payment` |

### Nümunələr

| Sifariş | Borc | `amount_paid` | `debt_paid` | Nəticə |
|---------|------|---------------|-------------|--------|
| 40 (ödənilməyib) | 21 | 40 | 10 | Sifariş tam, borc 11 qalır |
| 40 (ödənilməyib) | 21 | 40 | 0 | Yalnız sifariş |
| 40 (ödənilib / prepaid) | 21 | 0 | 21 | Yalnız borc bağlanır |
| 40 | 0 | 30 | 0 | Sifariş qismən, borc +10 |

### Prepaid sifariş

```json
{
  "payment_type": "cash",
  "amount_paid": 0,
  "debt_paid": 21,
  "empty_bidons_returned": 40,
  "full_bidons_given": 40
}
```

## UI tövsiyəsi

1. **Sifariş ödənişi** input — default `order_due`, max `max_order_payment`
2. **Borc ödənişi** input — yalnız `customer_debt > 0` olduqda; default `0`, max `max_debt_payment`
3. Cəmi göstərin: `amount_paid + debt_paid`
4. `is_prepaid` / `order_due === 0` → sifariş inputu 0 və ya disabled; yalnız borc inputu aktiv
5. `payment_type: credit` → hər iki input 0

## Redaktə (24 saat)

`PATCH /api/orders/:id/completion` — eyni `amount_paid` + `debt_paid`.

**Xəta kodları:**

| `code` | Mənası |
|--------|--------|
| `AMOUNT_EXCEEDS_ORDER` | `amount_paid > order_due` |
| `AMOUNT_EXCEEDS_DEBT` | `debt_paid > customer_debt` |
| `ORDER_ALREADY_PAID` | Tam ödənilib, redaktə bağlı |
| `EDIT_WINDOW_EXPIRED` | 24 saat keçib |

Ətraflı: `docs/COURIER_FRONTEND_COMPLETION_EDIT.md`.
