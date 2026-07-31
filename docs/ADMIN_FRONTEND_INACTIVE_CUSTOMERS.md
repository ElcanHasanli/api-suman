# Admin — 1 ay passiv müştəri bildirişi

Backend avtomatik yoxlayır: müştəri **1 ay (30 gün)** sifariş verməyibsə (və ya heç sifariş verməyibsə — `created_at` əsas götürülür), adminlərə:

1) `notifications` siyahısına in-app bildiriş  
2) FCM push (`customer_inactive`)

Test rejimi yoxdur — yalnız real 30 gün (Asia/Baku).

**Dublikat:** eyni müştəri üçün bir neçə `customer_inactive` görünürsə — bu frontend deyil, backend race idi (bir neçə paralel yoxlama). İndi əvvəl alert yazılır, yalnız sonra bildiriş; yeni dublikat yaranmamalıdır. Köhnə dublikatları DB-dən silmək olar (aşağıda).

---

## Trigger

- Admin login sonrası (fon)
- `GET /api/notifications` açılanda — **əvvəl yoxlama bitirilir**, sonra siyahı qayıdır (yeni bildirişlər eyni cavabda görünür)

Bir yoxlamada max **1000** passiv müştəri işlənir (batch 100). Əvvəl limit 50 idi — yüzlərlə müştəri olanda növbədə geridə qalanlar (məs. Xelil) heç görünmürdü.

---

## In-app cavab sahələri

```json
{
  "id": 12,
  "type": "customer_inactive",
  "message": "Xelil 1 aydır sifariş verməyib (son: 2026-06-28)",
  "customer_id": 303,
  "customer_name": "Xelil",
  "customer_surname": null,
  "read": false,
  "created_at": "..."
}
```

| Sahə | Məna |
|------|------|
| `customer_id` | Müştəri ID (klik → detal) |
| `customer_name` / `customer_surname` | Join ilə |

---

## Push data

```json
{
  "type": "customer_inactive",
  "customer_id": "303",
  "last_order_date": "2026-06-28",
  "screen": "customers"
}
```

## Frontend

- `type === "customer_inactive"` → `customers` detal, `customer_id` ilə fokus
- Siyahı limiti backend-də 200-ə qaldırılıb

## Deploy

```bash
npm run db:migrate:notification-customer
pm2 restart api-suman
```

Sonra admin panelində **Bildirişlər** səhifəsini bir dəfə açın — gözləyən passiv müştərilər (o cümlədən Xelil) yazılacaq.

### Köhnə dublikatları təmizləmək (opsional, serverdə)

Hər admin üçün eyni `customer_id`-dən yalnız ən son bildirişi saxlayır:

```sql
DELETE FROM notifications n
USING notifications newer
WHERE n.type = 'customer_inactive'
  AND n.customer_id IS NOT NULL
  AND newer.type = 'customer_inactive'
  AND newer.customer_id = n.customer_id
  AND newer.user_id = n.user_id
  AND newer.id > n.id;
```
