# Admin — 1 ay passiv müştəri bildirişi

Backend avtomatik yoxlayır: müştəri **1 ay (30 gün)** sifariş verməyibsə, adminlərə:

1) `notifications` siyahısına in-app bildiriş  
2) FCM push (`customer_inactive`)

Test rejimi yoxdur — yalnız real 30 gün (Asia/Baku).

## Trigger

- Admin login sonrası
- `GET /api/notifications` açılanda

## Push data

```json
{
  "type": "customer_inactive",
  "customer_id": "42",
  "last_order_date": "2026-04-28",
  "screen": "customers"
}
```

## In-app

`type: customer_inactive`  
`message`: `<Müştəri adı> 1 aydır sifariş verməyib (son: YYYY-MM-DD)`

## Frontend

- `type === "customer_inactive"` → `customers` səhifəsi, `customer_id` ilə fokus
