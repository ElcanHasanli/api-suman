# Kuryer — Tamamlanmış sifariş redaktəsi (24 saat)

Kuryer sifarişi tamamladıqdan sonra **24 saat ərzində** səhv düzəlişi edə bilər (qiymət, ödəniş, bidon və s.). 24 saat keçəndən sonra həmin sifariş kuryer panelində **görünmür**.

## Görünürlük (backend filtr)

`GET /api/orders` kuryer üçün avtomatik:

| Status | Görünür |
|--------|---------|
| `assigned` / `in_progress` | Yalnız **bu gün** təyin olunmuşlar |
| `completed` | Yalnız **son 24 saat** (`completed_at`) |
| Digər / köhnə | Görünmür (404) |

Hər sifarişdə (kuryer):
```json
{
  "courier_editable": true,
  "courier_editable_until": "2026-06-03T19:30:00.000Z"
}
```

`courier_editable: false` → redaktə formu göstərməyin.

## Tamamlama (ilk dəfə)

```http
PUT /api/orders/:id/complete
```

Body:
```json
{
  "payment_type": "cash",
  "amount_paid": 5,
  "empty_bidons_returned": 2,
  "full_bidons_given": 3,
  "notes": ""
}
```

- `amount_paid` — müştərinin **faktiki** ödədiyi məbləğ (AZN)
- Göndərilməsə: `credit` → `0`, `cash`/`card` → tam `price`
- `amount_paid < price` → fərq müştəri borcuna yazılır (`remaining_amount`, `is_paid: false`)
- Ətraflı: `docs/COURIER_FRONTEND_PARTIAL_PAYMENT.md`

## Redaktə (24 saat ərzində)

```http
PATCH /api/orders/:id/completion
Authorization: Bearer <courier_token>
```

```json
{
  "payment_type": "cash",
  "amount_paid": 6,
  "price": 6,
  "empty_bidons_returned": 2,
  "full_bidons_given": 3,
  "notes": "Qiymət düzəldildi"
}
```

- `payment_type` mütləq (cash | card | credit)
- `price` — səhv qiymət düzəlişi üçün
- `completed_at` dəyişmir (24 saat həmin vaxtdan hesablanır)

**Xətalar (kuryer):**

| HTTP | `code` | Mənası |
|------|--------|--------|
| 404 | `ORDER_NOT_FOUND` | Sifariş yoxdur (şirkət daxilində) |
| 404 | `ORDER_NOT_VISIBLE` | Köhnə / bu gün deyil / 24 saat keçib — görünmür |
| 403 | `NOT_YOUR_ORDER` | Başqa kuryerə təyin olunub |
| 403 | `ORDER_ALREADY_PAID` | Tam ödənilib — redaktə bağlı |
| 403 | `EDIT_WINDOW_EXPIRED` | 24 saat bitib — redaktə bağlı |

`GET /api/orders/:id` — tamamlanmış sifariş **24 saat ərzində** görünür (`is_paid` olsa belə); yalnız `courier_editable: false` olur.

## UI tövsiyəsi

1. **Tamamlananlar** tab — son 24 saatdakı `completed` sifarişlər (`GET /api/orders?status=completed` və ya ümumi list)
2. `courier_editable === true` → «Düzəlt» düyməsi
3. Eyni tamamlama formu, `PATCH /completion` göndər
4. `courier_editable_until` göstər (məs. «Düzəlişə qalan: 5 saat»)
5. 24 saat sonra sifariş API-dən düşür — UI-dan da silin

Admin panel tam tarixçəni görür; bu qayda yalnız **kuryer** üçündür.
