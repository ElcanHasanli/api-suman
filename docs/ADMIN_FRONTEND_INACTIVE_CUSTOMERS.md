# Admin — 1 ay passiv müştəri bildirişi

Backend avtomatik yoxlayır: müştəri **1 ay (30 gün)** sifariş verməyibsə **və** onda **qalıq bidon** var (`active_bidons > 0`), adminlərə:

1) `notifications` siyahısına in-app bildiriş  
2) FCM push (`customer_inactive`)

**Daxil deyil:** `active_bidons = 0` olanlar (bidonu qalmayan passivlər).

Test rejimi yoxdur — yalnız real 30 gün (Asia/Baku).

**Dublikat:** eyni müştəri üçün bir neçə `customer_inactive` görünürsə — backend race idi. İndi əvvəl alert yazılır, yalnız sonra bildiriş.

---

## Trigger

- Admin login sonrası (fon)
- `GET /api/notifications` açılanda — əvvəl yoxlama bitirilir, sonra siyahı qayıdır

Bir yoxlamada max **1000** passiv müştəri (batch 100).

---

## In-app

```json
{
  "id": 12,
  "type": "customer_inactive",
  "message": "Xelil 1 aydır sifariş verməyib — qalıq 2 bidon (son: 2026-06-28)",
  "customer_id": 303,
  "customer_name": "Xelil",
  "read": false
}
```

## Push data

```json
{
  "type": "customer_inactive",
  "customer_id": "303",
  "last_order_date": "2026-06-28",
  "active_bidons": "2",
  "screen": "customers"
}
```

## Frontend

`type === "customer_inactive"` → müştəri detal (`customer_id`). Mesajda qalıq bidon göstərilir.

## Deploy

```bash
pm2 restart api-suman
```

Bildirişlər səhifəsini bir dəfə açın — yalnız **bidonu qalan** passivlər gələcək.

**Qeyd:** Əvvəl artıq bildiriş yazılmış `active_bidons = 0` müştərilər siyahıda qala bilər (tarixi qeyd). Yeni yoxlamada onlar yenidən əlavə olunmur.
