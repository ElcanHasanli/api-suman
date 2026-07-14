# Admin — Su doldurma anbarı (2 məntəqə)

**Novxanı** və **Azadlıq**. Hər kuryerin default anbarı var.

Əsas: kuryer **neçə boş + dolu** ilə girdi, **neçə dolu** ilə çıxdı.

## Dashboard

`GET /api/warehouse/summary` → `warehouses[]`

| Göstərici | Mənbə |
|-----------|--------|
| Novxanı / Azadlıq dolu | `warehouses[].full_count` |
| Novxanı / Azadlıq boş | `warehouses[].empty_count` |
| Müştərilərdə bidon | `customers.total_active_bidons` |
| Son yeniləmə | `last_update` |

## Kuryer yeniləməsi

`GET /api/warehouse/updates?warehouse_code=novxani&period=today`

| Sahə | Məna |
|------|------|
| `entry_full` | Neçə dolu ilə girdi |
| `entry_empty` | Neçə boş ilə girdi |
| `exit_full` | Neçə dolu ilə çıxdı |
| `full_taken` | Anbardan götürülən (`exit_full − entry_full`) |
| `warehouse_name` | Novxanı / Azadlıq |

**Nümunə:** `Elnur · Novxanı · girdi 10 dolu + 5 boş · çıxdı 20 dolu · götürdü 10`

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

Yalnız `full_count` + `empty_count`.

## Kuryer default anbar

```http
PATCH /api/couriers/26/warehouse
{ "warehouse_code": "novxani" }
```

## Deploy

```bash
npm run db:migrate:warehouse-locations
pm2 restart api-suman
```
