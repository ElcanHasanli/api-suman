# Su doldurma anbarı

2 məntəqə: **Novxanı** / **Azadlıq**.

## Yalnız bidon

| Sahə | Məna |
|------|------|
| `entry_full` | Anbara neçə **dolu** ilə girdi |
| `entry_empty` | Anbara neçə **boş** ilə girdi |
| `exit_full` | Anbardan neçə **dolu** ilə çıxdı |
| `full_taken` | `exit_full − entry_full` (götürülən dolu) |

Nümunə: 10 dolu + 5 boş girdi, 20 dolu çıxdı → 10 dolu götürdü.

Stok: `empty += entry_empty`, `full -= full_taken`.

Pompa/dispenser anbara aid deyil.

## API

| Method | URL | Kim |
|--------|-----|-----|
| GET | `/api/warehouse/summary` | admin, kuryer |
| GET | `/api/warehouse/updates` | admin, kuryer |
| POST | `/api/warehouse/update` | kuryer |
| PATCH | `/api/warehouse/stock` | admin |
| PATCH | `/api/couriers/:id/warehouse` | admin |

### POST kuryer

```json
{
  "warehouse_code": "novxani",
  "entry_full": 10,
  "entry_empty": 5,
  "exit_full": 20
}
```

### PATCH admin stock

```json
{ "warehouse_code": "azadliq", "full_count": 17, "empty_count": 8 }
```

## Deploy

```bash
npm run db:migrate:warehouse-locations
pm2 restart api-suman
```
