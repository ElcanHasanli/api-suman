# Su doldurma anbarı (2 məntəqə)

Şirkətin **2 anbarı** var: **Novxanı** (`novxani`) və **Azadlıq** (`azadliq`).
Hər kuryerin default anbarı olur; yeniləmədə dəyişmək də olar.

## Kuryer məntiqi (sadə)

Yalnız 3 rəqəm:

| Sahə | Məna |
|------|------|
| `entry_full` | Anbara **neçə dolu** ilə girdi |
| `entry_empty` | Anbara **neçə boş** ilə girdi |
| `exit_full` | Anbardan **neçə dolu** ilə çıxdı |

```
full_taken = exit_full − entry_full
```

**Nümunə:** 10 dolu + 5 boş ilə girdi, 20 dolu ilə çıxdı → **10 dolu götürdü**.

Anbar stoku:
- boş += `entry_empty`
- dolu −= `full_taken`

## API

| Method | URL | Kim |
|--------|-----|-----|
| GET | `/api/warehouse/summary` | admin, kuryer |
| GET | `/api/warehouse/updates?warehouse_code=&courier_id=` | admin, kuryer |
| POST | `/api/warehouse/update` | kuryer |
| PATCH | `/api/warehouse/stock` | admin |
| PATCH | `/api/couriers/:id/warehouse` | admin (default anbar) |

### GET `/api/warehouse/summary`

```json
{
  "warehouses": [
    { "id": 1, "code": "novxani", "name": "Novxanı", "full_count": 17, "empty_count": 8 },
    { "id": 2, "code": "azadliq", "name": "Azadlıq", "full_count": 12, "empty_count": 3 }
  ],
  "default_warehouse": { "id": 1, "code": "novxani", "name": "Novxanı" },
  "warehouse": { "...": "kuryer üçün default / Novxanı (köhnə uyğunluq)" },
  "customers": { "total_active_bidons": 342, "customer_count": 120 },
  "last_update": { "...": "..." }
}
```

### POST `/api/warehouse/update` (kuryer)

```json
{
  "warehouse_code": "novxani",
  "entry_full": 10,
  "entry_empty": 5,
  "exit_full": 20,
  "notes": ""
}
```

- `warehouse_id` və ya `warehouse_code` — göndərilməsə kuryerin **default** anbarı
- `exit_full` ≥ `entry_full` olmalıdır

Cavab: `{ warehouse, update, calculation: { full_taken: 10, ... } }`

### PATCH `/api/warehouse/stock` (admin)

```json
{
  "warehouse_code": "azadliq",
  "full_count": 17,
  "empty_count": 8,
  "notes": "Sayım"
}
```

### Admin — kuryer default anbar

```http
PATCH /api/couriers/:id/warehouse
{ "warehouse_code": "novxani" }
```

və ya `{ "default_warehouse_id": 1 }`

Login / `/api/auth/me` cavabında kuryerdə: `default_warehouse`.

## Push (admin)

- `type`: `warehouse_updated`
- `screen`: `warehouse`
- `warehouse_id`

## Deploy

```bash
npm run db:migrate:warehouse-locations
pm2 restart api-suman
```
