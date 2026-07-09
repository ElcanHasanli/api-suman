# Admin — Su doldurma anbarı (yeni)

Kuryer anbarı yeniləyəndə admin paneldə real vaxtda görünür + FCM push (`warehouse_updated`).

## Dashboard / Anbar səhifəsi

**Əsas göstəricilər** (`GET /api/warehouse/summary`):

| Göstərici | Mənbə |
|-----------|--------|
| Anbarda dolu bidon | `warehouse.full_count` |
| Anbarda boş bidon | `warehouse.empty_count` |
| Anbarda pompa | `warehouse.pump_count` |
| Anbarda dispenser | `warehouse.dispenser_count` |
| Müştərilərdə cəmi bidon | `customers.total_active_bidons` |
| Müştəri sayı | `customers.customer_count` |
| Son yeniləmə | `last_update` (kuryer, tarix, rəqəmlər) |

## Tarixçə

```http
GET /api/warehouse/updates?period=today|week|month&courier_id=
```

Hər sətir: `empty_in`, `full_in`, `full_out`, `exit_full`, `previous_*`, `remaining_*`, `courier_name`, `created_at`.

## Admin düzəlişi

Sayım səhvi və ya ilk qurulum:

```http
PATCH /api/warehouse/stock
{
  "full_count": 17,
  "empty_count": 8,
  "pump_count": 5,
  "dispenser_count": 2,
  "notes": "..."
}
```

Pompa/dispenser satılanda (sifariş `extras` ilə) say avtomatik azalır.

## Push

| `data.type` | `data.screen` |
|-------------|---------------|
| `warehouse_updated` | `warehouse` |

Bildiriş mətni nümunəsi: `Kuryer: +8 boş, +23 dolu, −7 dolu → anbarda 17 dolu, 8 boş`

## Deploy (backend)

```bash
npm run db:migrate:warehouse
```

Ətraflı: `docs/WAREHOUSE.md`
