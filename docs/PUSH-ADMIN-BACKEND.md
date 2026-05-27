# Admin push bildirişləri — Backend (hazır)

Admin və kuryer tətbiqləri **hər ikisi Android + iOS**-dur. Push eyni FCM infrastrukturudur; platforma `device_tokens.platform` ilə ayrılır.

## Cihaz token

| Method | URL |
|--------|-----|
| POST | `/api/devices/register` |
| DELETE | `/api/devices/unregister` |

```json
POST /api/devices/register
Authorization: Bearer <admin JWT>
{
  "token": "FCM_TOKEN",
  "platform": "android",
  "app": "admin"
}
```

`platform`: **`android`** | **`ios`** | `web` (mütləq göndərilməlidir)

DB: `device_tokens` — `UNIQUE (user_id, platform, app)`  
→ Bir adminin Android və iOS tokenləri eyni vaxtda saxlanılır; push hər ikisinə gedir.

**Kuryer** eyni endpoint: `"app": "courier"`, `platform`: `android` | `ios`  
(Köhnə: `POST /api/notifications/device-token` — yalnız kuryer, courier app üçün device_tokens-ə də yazır.)

## FCM göndərmə

`lib/pushFcm.js` — `sendEachForMulticast`:

- `android: { priority: 'high' }`
- `apns: { payload: { aps: { sound: 'default', badge: 1 } } } }`

`data` dəyərləri hamısı **string** (FCM qaydası).

## Kuryer əməliyyatı → admin push

| Hadisə | `data.type` | `data.screen` |
|--------|-------------|---------------|
| Sifariş tamamlandı (kuryer) | `order_completed` | `orders` |
| Yeni xərc (kuryer) | `expense_created` | `history` |
| Sifariş qeydi (kuryer) | `order_note` | `orders` |
| Su doldurma anbarı (kuryer) | `warehouse_updated` | `warehouse` |

Yalnız **kuryer** tərəfindən edilən əməliyyatlarda admin-ə gedir.

## Deploy

```bash
git pull
npm install
npm run db:migrate:devices
pm2 restart all
```

`.env`:
```env
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

## Test

1. Admin **Android** login → `register` `platform: "android"`
2. Admin **iOS** login → `register` `platform: "ios"`
3. Kuryer sifariş tamamlayır → hər iki cihazda bildiriş (konfiqurasiya düzgündürsə)

```sql
SELECT user_id, platform, app, left(token, 20) FROM device_tokens WHERE app = 'admin';
```
