# Admin — Sifariş yaratma (yeni)

## Sifariş növləri

| `order_type` | Məna |
|--------------|------|
| `delivery` | Su çatdırılması (mövcud) |
| `pickup` | Boş bidon götürmə — müştəri damacanaları bitirib və ya işi dayandırıb |

## Tarix (Asia/Baku)

`scheduled_date` — sifarişin **icra günü** (YYYY-MM-DD).

- Default: **bu gün** (Baku)
- Sabah üçün: `scheduled_date: "2026-07-06"`
- Kuryer sifarişi yalnız **həmin gün** görür (köhnə `assigned_at` əvəzinə)

## Müştəri seçimi — kontekst

Müştəri seçiləndə:

```http
GET /api/customers/:id/order-preview
Authorization: Bearer <admin>
```

```json
{
  "customer": {
    "id": 12,
    "display_name": "Elcan Həsənli",
    "phone": "050...",
    "address": "Nərimanov...",
    "price": 2.5,
    "active_bidons": 3,
    "debt": 6
  },
  "last_note": {
    "body": "Qapıda zəng çalınmır",
    "created_at": "2026-07-01T10:00:00.000Z",
    "author_role": "courier",
    "author_name": "Elnur"
  }
}
```

`last_note` — bu müştəriyə aid **son sifariş qeydi** (hər hansı sifarişdən); yoxdursa `null`.

Modalda:
- **Nişə borcu** (`debt`) göstər + redaktə input
- **Son qeyd** oxumaq üçün (readonly)

## Sifariş yarat

```http
POST /api/orders
Authorization: Bearer <admin>
```

### Çatdırılma (delivery)

```json
{
  "customer_id": 12,
  "courier_id": 3,
  "order_type": "delivery",
  "scheduled_date": "2026-07-05",
  "bidons_count": 2,
  "price": 5,
  "address": "Nərimanov...",
  "notes": "Zəng et",
  "debt": 4
}
```

### Boş bidon götürmə (pickup)

```json
{
  "customer_id": 12,
  "courier_id": 3,
  "order_type": "pickup",
  "scheduled_date": "2026-07-05",
  "bidons_count": 2,
  "notes": "İşi dayandırıb, 2 boş bidon",
  "debt": 0
}
```

- `price` pickup üçün avtomatik **0**
- `bidons_count` — götürüləcək **boş bidon** sayı (təxmini)

### Borc yeniləmə

`debt` göndərilsə — sifariş yaradılmazdan əvvəl müştəri borcu yenilənir.
Borc **azalanda** `debt_payments` qeydi yaradılır (müştəri redaktəsi ilə eyni məntiq).

## Cavab sahələri

Sifariş obyektində yeni:

| Sahə | Məna |
|------|------|
| `order_type` | `delivery` \| `pickup` |
| `scheduled_date` | `"2026-07-06"` — **yalnız tarix** (YYYY-MM-DD), timezone yoxdur |
| `assigned_at` | UTC ISO (`2026-07-06T05:00:00.000Z`) |
| `assigned_at_baku` | Baku vaxtı (`2026-07-06T09:00:00+04:00`) — UI-da bunu göstərin |

## UI tövsiyəsi

1. Sifariş növü: **Çatdırılma** / **Boş bidon götürmə** (radio və ya tab)
2. **Tarix** date picker — default bu gün (Baku)
3. Müştəri seçiləndə `GET .../order-preview` → borc + son qeyd
4. Borc inputu — `debt` POST body-də
5. Pickup seçiləndə qiymət sahəsini gizlət; bidon = «götürüləcək boş bidon»

## Deploy

```bash
npm run db:migrate:order-type
pm2 restart api-suman
```
