# Admin — Borclu müştərilər səhifəsi

## Siyahı

```http
GET /api/customers/debtors?page=1&limit=20&q=elvira
Authorization: Bearer <admin_token>
```

Yalnız `debt > 0` olan müştərilər. Sıralama: borc azalan.

```json
{
  "customers": [
    {
      "id": 5,
      "display_name": "Elvira",
      "phone": "050...",
      "debt": 14,
      "active_bidons": 2
    }
  ],
  "total": 12,
  "total_debt": 86.5,
  "page": 1,
  "limit": 20
}
```

## Borc ödənişi

```http
POST /api/customers/:id/pay-debt
Authorization: Bearer <admin_token>
Content-Type: application/json
```

### Tam ödəniş

```json
{}
```

### Qismən ödəniş

```json
{
  "amount": 5
}
```

### Cavab

```json
{
  "customer_id": 5,
  "paid_amount": 5,
  "previous_debt": 14,
  "customer_debt": 9,
  "debt_payment": { "id": 20, "amount": 5, "previous_debt": 14, "new_debt": 9 }
}
```

## Xətalar

| HTTP | `code` | Mənası |
|------|--------|--------|
| 400 | `NO_DEBT` | Müştərinin borcu yoxdur |
| 400 | `AMOUNT_EXCEEDS_DEBT` | Məbləğ borcdan böyükdür |

## UI tövsiyəsi

1. Ayrıca «Borclu müştərilər» səhifəsi
2. Hər sətirdə borc məbləği + «Tam ödə» / «Qismən ödə» düymələri
3. Uğurdan sonra siyahını yeniləyin

Qeyd: Sifariş qalığı üçün `PUT /api/orders/:id/mark-paid` — `docs/ADMIN_FRONTEND_DEBT_PAYMENT.md`.
