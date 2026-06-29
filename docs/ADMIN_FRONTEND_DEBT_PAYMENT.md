# Admin — Sifariş borcu ödənişi (tam / qismən)

Tarixçədə **yerinə yetirilmiş** sifarişlərdə müştərinin borcu varsa, admin borcu ödənilib qeyd edə bilər — **tam** və ya **qismən**.

## Borc necə yaranır?

Sifariş tamamlananda:

```
qalan = max(0, qiymət - amount_paid)
```

`qalan > 0` olduqda həmin məbləğ müştərinin ümumi borcuna (`customers.debt`) əlavə olunur — **nağd**, **kart** və **nişə** üçün eyni qayda.

**Nümunə:** qiymət 3 AZN, kuryer `amount_paid: 1` göndəribsə → müştəri borcu +2 AZN, sifariş `is_paid: false`, `remaining_amount: 2`.

## Tarixçə API — yeni sahələr

`GET /api/history` — hər sifarişdə:

| Sahə | Tip | Mənası |
|------|-----|--------|
| `amount_paid` | number | Sifariş üzrə indiyə qədər ödənilən |
| `is_paid` | boolean | Sifariş tam ödənilib |
| `remaining_amount` | number | `max(0, price - amount_paid)` |
| `customer_debt` | number | Müştərinin ümumi borcu (AZN) |

**«Borc ödə» düyməsi:** `remaining_amount > 0` **və** `customer_debt > 0` (və ya ən azı sifarişdə qalan var).

`summary.unpaidCreditAmount` — ödənilməmiş sifariş qalıqları (nişə + qismən nağd/kart).

## Borc ödənişi

```http
PUT /api/orders/:id/mark-paid
Authorization: Bearer <admin_token>
Content-Type: application/json
```

### Tam ödəniş

Body boş və ya `{}` — sifarişin **qalan** məbləği tam ödənilir.

```json
{}
```

### Qismən ödəniş

```json
{
  "amount": 3
}
```

- `amount` — bu dəfə ödənilən məbləğ (AZN)
- `amount` sifarişin `remaining_amount`-dan çox ola bilməz
- Müştəri borcu `amount` qədər azalır
- Sifariş `amount_paid` artır; tam ödəniləndə `is_paid: true`, `paid_at` təyin olunur

### Cavab

```json
{
  "order": { "...": "yenilənmiş sifariş", "remaining_amount": 0, "customer_debt": 1.5 },
  "debt_payment": { "id": 12, "amount": 3, "previous_debt": 6, "new_debt": 3, "..." },
  "customer_debt": 3,
  "paid_amount": 3,
  "order_remaining": 0
}
```

| Sahə | Mənası |
|------|--------|
| `paid_amount` | Bu əməliyyatda ödənilən məbləğ |
| `order_remaining` | Sifarişdə hələ qalan borc |
| `customer_debt` | Müştərinin yeni ümumi borcu |

## Xətalar

| HTTP | `code` | Mənası |
|------|--------|--------|
| 400 | `ORDER_ALREADY_PAID` | Sifariş artıq tam ödənilib |
| 400 | `AMOUNT_EXCEEDS_ORDER` | `amount` sifariş qalığından böyükdür |
| 400 | — | `amount` ≤ 0 və ya sifariş tamamlanmayıb |
| 404 | — | Sifariş tapılmadı |

## Modal UI tövsiyəsi

1. Sifariş sətirində: qiymət, `amount_paid`, `remaining_amount`, müştəri adı + `customer_debt`
2. **«Borc ödə»** — yalnız `remaining_amount > 0` olduqda
3. Modal:
   - **Tam ödədi** — `PUT mark-paid` body `{}`
   - **Qismən ödədi** — məbləğ inputu + təsdiq; `PUT mark-paid` `{ "amount": <daxil edilən> }`
4. Uğur mesajı: «3 AZN ödənildi. Sifarişdə qalan: 0 AZN. Müştəri borcu: 3 AZN»
5. Qismən: «2 AZN ödənildi. Sifarişdə qalan: 1 AZN. Müştəri borcu: 4 AZN»
6. `is_paid === true` olduqda düyməni gizlət; «Ödənilib» badge

## Müştəri detalı

`GET /api/customers/:id` — `debt_payments` siyahısında admin ödənişləri görünür (`recorded_by` ilə).
