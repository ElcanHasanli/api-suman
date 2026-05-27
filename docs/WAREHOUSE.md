# Su doldurma anbarı

Kuryer su doldurma məntəqəsində bidon hərəkətini qeyd edir; admin real vaxtda anbar və müştəridəki ümumi bidon sayını görür.

## Biznes məntiqi (köhnə WhatsApp mesajı)

```
Su doldurma
8 boş 23 dolu    → anbara daxil: 8 boş, 23 dolu
+7 dolu           → anbardan götürülən dolu: 7
çıxış 30 dolu     → maşında (məlumat): 30
Yerdə qaldı 17    → anbarda qalan dolu: 17
```

| Sahə API | Mənası |
|----------|--------|
| `empty_in` | Anbara daxil boş bidon |
| `full_in` | Anbara daxil dolu bidon |
| `full_out` | Anbardan götürülən dolu bidon |
| `exit_full` | Kuryerin maşınındakı dolu (opsional, audit) |
| `remaining_full` | **Mütləq** — anbarda qalan dolu |
| `remaining_empty` | Anbarda qalan boş (göndərilməsə: əvvəlki + `empty_in`) |

Yoxlama: `əvvəlki_dolu + full_in - full_out` ≈ `remaining_full` (uyğunsuzluqda `calculation.mismatch: true` qayıdır, yeniləmə qəbul olunur).

## API

| Method | URL | Kim |
|--------|-----|-----|
| GET | `/api/warehouse/summary` | admin, kuryer |
| GET | `/api/warehouse/updates?period=&courier_id=` | admin, kuryer |
| POST | `/api/warehouse/update` | kuryer |
| PATCH | `/api/warehouse/stock` | admin (birbaşa say) |

### GET `/api/warehouse/summary`

```json
{
  "warehouse": {
    "full_count": 17,
    "empty_count": 8,
    "updated_at": "...",
    "updated_by_name": "Kuryer Adı"
  },
  "customers": {
    "total_active_bidons": 342,
    "customer_count": 120
  },
  "last_update": { ... }
}
```

### POST `/api/warehouse/update` (kuryer)

```json
{
  "empty_in": 8,
  "full_in": 23,
  "full_out": 7,
  "exit_full": 30,
  "remaining_full": 17,
  "remaining_empty": 8,
  "notes": ""
}
```

Cavab: `{ stock, update, calculation }`

### PATCH `/api/warehouse/stock` (admin)

```json
{ "full_count": 17, "empty_count": 8, "notes": "İnventar sayımı" }
```

## Push (admin)

Kuryer `POST /update` etdikdə:

- `type`: `warehouse_updated`
- `screen`: `warehouse`

## Deploy

```bash
npm run db:migrate:warehouse
pm2 restart all
```
