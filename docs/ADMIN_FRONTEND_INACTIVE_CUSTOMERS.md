# Admin — passiv müştəri bildirişi

Backend avtomatik yoxlayır (default **1 dəqiqə** test üçün; production: `.env` → `CUSTOMER_INACTIVITY_MINUTES=43200` = 30 gün):

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
  "last_order_at": "2026-06-02T15:30:00.000Z",
  "screen": "customers"
}
```

## In-app notification

`type: customer_inactive`  
`message`: `<Müştəri adı> 1 dəqiqədir sifariş verməyib (son: …)` (müddət konfiqurasiyadan asılıdır)

## Frontend üçün

- Bildirişdə `type === "customer_inactive"` olduqda `customers` ekranına yönləndir
- Mümkünsə `customer_id` ilə həmin müştərini highlight et
- Mövcud `/api/notifications` endpoint kifayətdir, yeni endpoint lazım deyil
