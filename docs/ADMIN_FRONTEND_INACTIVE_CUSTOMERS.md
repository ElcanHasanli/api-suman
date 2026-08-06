# Admin — Passiv müştərilər (tarix seçimi)

Sabit 20/30 gün **yoxdur**. Tarixçə aylıq hesabat kimi admin **tarix aralığı** seçir; həmin tarixlərdə **sifariş verməyən** və **qalıq bidonu olan** (`active_bidons > 0`) müştərilər görünür.

Avtomatik bildiriş (login / notifications) artıq yeni passiv yazmır — siyahı bu endpointlədir.

---

## API

```http
GET /api/customers/inactive
Authorization: Bearer <admin_token>
```

### Filterlər (tarixçə ilə eyni ruh)

| Parametr | Məna |
|----------|------|
| `startDate`, `endDate` | Özəl aralıq (`YYYY-MM-DD`) — `period=custom` |
| `period` | `custom` \| `week` \| `days2` \| `month` (default: `month`) |
| `days` | Son N gün (məs. `days=45`) — `period` əvəzinə |
| `q` | Ad / telefon / ünvan axtarışı |
| `page`, `limit` | Səhifələmə (default limit 50, max 100) |

```http
GET /api/customers/inactive?period=month
GET /api/customers/inactive?period=week
GET /api/customers/inactive?period=days2
GET /api/customers/inactive?days=40
GET /api/customers/inactive?startDate=2026-06-01&endDate=2026-07-31
GET /api/customers/inactive?startDate=2026-07-01&endDate=2026-07-31&q=yuksel
```

### Cavab

```json
{
  "period": "custom",
  "days": null,
  "startDate": "2026-07-01",
  "endDate": "2026-07-31",
  "total": 42,
  "page": 1,
  "limit": 50,
  "customers": [
    {
      "id": 303,
      "display_name": "Xelil",
      "phone": "050 973 64 88",
      "active_bidons": 2,
      "debt": "6.00",
      "deposit": 20,
      "last_order_date": "2026-06-10",
      "last_order_at": "2026-06-10T...",
      "address": "..."
    }
  ]
}
```

### Məntiq

Müştəri siyahıdadır əgər:

1. `active_bidons > 0`
2. Seçilmiş `[startDate, endDate]` aralığında **heç bir** sifariş yoxdur (`orders.created_at`, Asia/Baku)

Yeni sifariş yaradılsa və tarix aralığına düşsə — növbəti sorğuda siyahıdan çıxır.

---

## UI tövsiyəsi

Ayrı səhifə və ya «Passiv müştərilər» tab:

```
[ 2 gün ] [ Həftə ] [ Bu ay ]  [ 📅 — 📅 ]  [ N gün ]  [ axtarış ]
```

Cədvəl: Ad, Telefon, Qalıq bidon, Son sifariş, Borc → klik detal.

Bildirişlər səhifəsində sabit 20 günlük avtomatik passiv **gözləməyin**.

---

## Deploy

```bash
pm2 restart api-suman
```

Migration lazım deyil. Frontend bu endpointə keçməlidir.
