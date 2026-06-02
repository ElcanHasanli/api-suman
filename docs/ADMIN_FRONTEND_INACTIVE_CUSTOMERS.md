# Admin — 30+ gün passiv müştəri bildirişi

Backend artıq avtomatik yoxlayır: əgər müştəri 30+ gün sifariş verməyibsə, adminlərə:

1) `notifications` siyahısına in-app bildiriş yazılır  
2) FCM push göndərilir (`customer_inactive`)

## Trigger

- Admin login (`POST /api/auth/login`) sonrası arxa planda
- Admin bildiriş səhifəsi (`GET /api/notifications`) açılarkən

## Bildiriş payload (push)

```json
{
  "type": "customer_inactive",
  "customer_id": "42",
  "last_order_date": "2026-04-28",
  "screen": "customers"
}
```

## In-app notification

`type: customer_inactive`  
`message`: `<Müştəri adı> 30+ gündür sifariş verməyib (son: YYYY-MM-DD)`

## Frontend üçün

- Bildirişdə `type === "customer_inactive"` olduqda `customers` ekranına yönləndir
- Mümkünsə `customer_id` ilə həmin müştərini highlight et
- Mövcud `/api/notifications` endpoint kifayətdir, yeni endpoint lazım deyil
