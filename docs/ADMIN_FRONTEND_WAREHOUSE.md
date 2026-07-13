# Admin — Su doldurma anbarı (2 məntəqə)

**Novxanı** və **Azadlıq** — iki ayrı anbar. Hər kuryerin default anbarı var.

## Dashboard

`GET /api/warehouse/summary` → `warehouses[]` (hər məntəqənin dolu/boş/pompa/dispenser).

| Göstərici | Mənbə |
|-----------|--------|
| Novxanı / Azadlıq dolu-boş | `warehouses[].full_count` / `empty_count` |
| Pompa / dispenser | `warehouses[].pump_count` / `dispenser_count` |
| Müştərilərdə bidon | `customers.total_active_bidons` |
| Son yeniləmə | `last_update` |

## Kuryer yeniləməsi (oxumaq)

Tarixçə: `GET /api/warehouse/updates?warehouse_code=novxani&period=today`

Hər sətirdə:

| Sahə | Məna |
|------|------|
| `entry_full` | Neçə dolu ilə girdi |
| `entry_empty` | Neçə boş ilə girdi |
| `exit_full` | Neçə dolu ilə çıxdı |
| `full_taken` | Anbardan götürülən dolu (`exit_full − entry_full`) |
| `warehouse_name` | Novxanı / Azadlıq |

**Nümunə UI:** `Elnur · Novxanı · girdi 10 dolu + 5 boş · çıxdı 20 dolu · götürdü 10`

## Admin düzəlişi

```http
PATCH /api/warehouse/stock
{
  "warehouse_code": "azadliq",
  "full_count": 17,
  "empty_count": 8,
  "notes": "..."
}
```

## Kuryer default anbar

```http
PATCH /api/couriers/26/warehouse
{ "warehouse_code": "novxani" }
```

Kuryer siyahısı: `GET /api/couriers` → `default_warehouse`.

## Push

| `data.type` | `data.screen` |
|-------------|---------------|
| `warehouse_updated` | `warehouse` |

## Deploy

```bash
npm run db:migrate:warehouse-locations
```
