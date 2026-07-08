# Admin — Sifariş borcu ödənişi (tam / qismən)

Tarixçədə **yerinə yetirilmiş** sifarişlərdə müştərinin borcu varsa, admin borcu ödənilib qeyd edə bilər — **tam** və ya **qismən**.

## Borc necə yaranır?

Sifariş tamamlananda:

```
sifariş_qalığı = max(0, qiymət - amount_paid)
yeni_borc = köhnə_borc - debt_paid_at_completion + sifariş_qalığı
```

- `amount_paid` — yalnız **sifariş qiymətinə** gedən ödəniş
- `debt_paid_at_completion` — tamamlama zamanı **köhnə borcdan** ödənilən hissə (kuryer birlikdə ödəyibsə)

**Nümunə (kuryer):** qiymət 10 AZN, köhnə borc 10 AZN, kuryer 20 AZN alıb → `amount_paid: 10`, `debt_paid_at_completion: 10`, `total_collected: 20`, `customer_debt: 0`.

**Nümunə (qismən sifariş):** qiymət 3 AZN, `amount_paid: 1` → borc +2 AZN, `is_paid: false`, `remaining_amount: 2`.

## Tarixçə API — sahələr

`GET /api/history` — hər sifarişdə:

| Sahə | Tip | Mənası |
|------|-----|--------|
| `price` | number | Sifariş qiyməti |
| `amount_paid` | number | Sifariş qiymətindən ödənilən |
| `debt_paid_at_completion` | number | Tamamlama zamanı köhnə borcdan ödənilən |
| `total_collected` | number | Kuryerin aldığı ümumi məbləğ (`amount_paid + debt_paid_at_completion`) |
| `is_paid` | boolean | Sifariş tam ödənilib |
| `remaining_amount` | number | `max(0, price - amount_paid)` |
| `customer_debt` | number | Müştərinin cari ümumi borcu (AZN) |

**UI tövsiyəsi:** sifariş sətirində `total_collected` göstərin; `debt_paid_at_completion > 0` olduqda alt sətirdə: «Sifariş: X AZN · Borc: Y AZN».

`summary.debtCollected` — `debt_payments` cədvəlindən (kuryer tamamlamada borc ödəyibsə və admin sonradan ödəyibsə daxildir).

## Borc ödənişi (admin)

```http
PUT /api/orders/:id/mark-paid
Authorization: Bearer <admin_token>
Content-Type: application/json
```

Yalnız **sifariş qalığı** (`remaining_amount`) ödənilir — köhnə borc bu endpoint ilə ödənilmir (kuryer tamamlayanda və ya müştəri detalından ödənilir).

### Tam ödəniş

Body boş və ya `{}` — sifarişin **qalan** məbləği tam ödənilir.

### Qismən ödəniş

```json
{
  "amount": 3
}
```

- `amount` sifarişin `remaining_amount`-dan çox ola bilməz
- Müştəri borcu `amount` qədər azalır

### Cavab

```json
{
  "order": {
    "price": 10,
    "amount_paid": 10,
    "debt_paid_at_completion": 10,
    "total_collected": 20,
    "remaining_amount": 0,
    "customer_debt": 0
  },
  "debt_payment": { "id": 12, "amount": 3, "order_id": 5, "..." },
  "customer_debt": 3,
  "paid_amount": 3,
  "order_remaining": 0
}
```

## Xətalar

| HTTP | `code` | Mənası |
|------|--------|--------|
| 400 | `ORDER_ALREADY_PAID` | Sifariş artıq tam ödənilib |
| 400 | `AMOUNT_EXCEEDS_ORDER` | `amount` sifariş qalığından böyükdür |
| 400 | `AMOUNT_EXCEEDS_PAYABLE` | Tamamlamada `amount_paid > price + customer_debt` |
| 404 | — | Sifariş tapılmadı |

## Modal UI tövsiyəsi

1. Sifariş sətirində: qiymət, `amount_paid`, `debt_paid_at_completion`, `total_collected`, `remaining_amount`, `customer_debt`
2. Kuryer birlikdə ödəyibsə: «20 AZN (sifariş 10 + borc 10)»
3. **«Borc ödə»** — yalnız `remaining_amount > 0` olduqda (sifariş qalığı)
4. `is_paid === true` olduqda düyməni gizlət

## Müştəri detalı

`GET /api/customers/:id` — `debt_payments` siyahısında `order_id` ilə hansı sifarişə bağlı olduğu görünür.
