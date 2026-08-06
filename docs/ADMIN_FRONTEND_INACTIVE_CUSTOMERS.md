# Admin — Problemli / passiv müştərilər (son 30 gün)

Əvvəlki məntiq:

1. **Son 30 gün** sifariş yoxdur  
2. **`active_bidons > 0`** (qalıq bidon var)

→ bildiriş + siyahı.

**Sifariş yaradılsa** → dərhal problemli/passiv siyahıdan və bildirişlərdən çıxır.

---

## Siyahı API

```http
GET /api/customers/inactive
GET /api/customers/inactive?q=yuksel&page=1&limit=50
```

```json
{
  "period": "days",
  "days": 30,
  "startDate": "2026-07-07",
  "endDate": "2026-08-06",
  "total": 12,
  "page": 1,
  "limit": 50,
  "customers": [
    {
      "id": 303,
      "display_name": "Xelil",
      "phone": "050 973 64 88",
      "active_bidons": 2,
      "last_order_date": "2026-06-28",
      "debt": "6.00"
    }
  ]
}
```

Tarix seçimi **yoxdur** — həmişə son 30 gün.

---

## Bildirişlər

- Admin login / `GET /api/notifications` → avtomatik yoxlanır
- `type: customer_inactive`
- Mesaj: `Xelil 1 aydır sifariş verməyib — qalıq 2 bidon (son: …)`
- `customer_id` → detal

0 bidonlu və ya son 30 gündə sifarişi olanlar siyahıda/bildirişdə görünmür.

---

## Frontend

- Problemli müştərilər: `GET /api/customers/inactive` (tarix filteri lazım deyil)
- Bildiriş: `customer_inactive` → müştəri detal
- Sifariş yaradanda backend özü çıxarır — əlavə iş lazım deyil

## Deploy

```bash
pm2 restart api-suman
```
