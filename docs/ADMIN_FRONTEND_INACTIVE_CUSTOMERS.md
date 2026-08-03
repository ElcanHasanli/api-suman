# Admin — Passiv müştəri bildirişi (20 gün + qalıq bidon)

Backend avtomatik yoxlayır. Bildiriş **yalnız** bu şərtlərlə:

1. **20+ gündür** sifariş yaradılmayıb (`orders.created_at`, yoxdursa `customers.created_at`)
2. **`active_bidons > 0`** — qalıq bidon var

Adminlərə: in-app `notifications` + FCM push (`customer_inactive`).

### Siyahıdan çıxır

| Hadisə | Nəticə |
|--------|--------|
| Yeni sifariş yaradılır | Həmin müştərinin passiv bildirişi + alert silinir |
| Bidon 0 olur | Siyahıda görünmür / silinir |
| Son sifarişdən 20 gün keçməyib | Siyahıda görünmür / silinir |

20 gün yenidən sifariş olmasa — yenidən düşə bilər.

---

## Trigger

- Admin login (fon)
- `GET /api/notifications` — əvvəl yoxlama + köhnə passivləri təmizləmə, sonra siyahı

---

## In-app

```json
{
  "type": "customer_inactive",
  "message": "Xelil 20 gündür sifariş verməyib — qalıq 2 bidon (son: 2026-06-28)",
  "customer_id": 303,
  "customer_active_bidons": 2
}
```

## Push data

```json
{
  "type": "customer_inactive",
  "customer_id": "303",
  "last_order_date": "2026-06-28",
  "active_bidons": "2",
  "inactivity_days": "20",
  "screen": "customers"
}
```

## Frontend

- `type === "customer_inactive"` → müştəri detal
- Frontend dəyişikliyi məcburi deyil (backend süzür)

## Deploy

```bash
pm2 restart api-suman
```

Bildirişlər səhifəsini bir dəfə açın.
