# Kuryer — Sifariş növləri və planlaşdırılmış tarix

## Görünürlük (yenilənmiş)

Kuryer **yalnız bu günün** (Asia/Baku) sifarişlərini görür:

- `scheduled_date = bu gün` olan `assigned` / `in_progress`
- Son 24 saat `completed`

Sabaha planlanmış sifariş bu gün **görünmür** — sabah avtomatik çıxır.

## Sifariş növləri

| `order_type` | Paneldə |
|--------------|---------|
| `delivery` | Su çatdırılması (mövcud tamamlama formu) |
| `pickup` | **Boş bidon götürmə** — badge/ikon ilə fərqləndirin |

Sifariş cavabında: `order_type`, `scheduled_date`.

## Boş bidon götürmə — tamamlama

```http
PUT /api/orders/:id/complete
Authorization: Bearer <courier>
```

```json
{
  "empty_bidons_returned": 2,
  "notes": "2 boş götürüldü"
}
```

- `payment_type` və `amount_paid` **lazım deyil**
- `empty_bidons_returned` — faktiki götürülən boş bidon sayı
- Müştərinin `active_bidons` azalır
- Qiymət / ödəniş yoxdur (`price: 0`, `is_paid: true`)

## Redaktə (24 saat)

`PATCH /api/orders/:id/completion` — pickup üçün yalnız:

```json
{
  "empty_bidons_returned": 3,
  "notes": "Düzəliş"
}
```

## Çatdırılma

Əvvəlki kimi: `payment_type`, `amount_paid`, `full_bidons_given`, `empty_bidons_returned`.

Ətraflı: `docs/COURIER_FRONTEND_PARTIAL_PAYMENT.md`, `docs/COURIER_FRONTEND_COMPLETION_EDIT.md`.

## UI tövsiyəsi

1. Sifariş kartında `order_type === 'pickup'` → «Boş bidon götürmə» etiketi
2. `scheduled_date` sabahdırsa — admin paneldə görünür; kuryer panelində yalnız həmin gün
3. Pickup tamamlama: sadə forma — yalnız götürülən boş bidon sayı + qeyd
4. Push bildirişi: «Boş bidon götürmə #35 — Müştəri adı»

## Deploy

Backend: `npm run db:migrate:order-type && pm2 restart api-suman`
