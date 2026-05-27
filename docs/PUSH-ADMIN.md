# Admin tətbiqi — Push (Android + iOS)

Hər platforma **öz FCM tokeni** ilə qeydiyyat olunur. Eyni admin həm Android, həm iPhone istifadə edirsə, hər cihazda ayrıca `register` edin — backend hər ikisinə push göndərir.

## Login sonrası

```http
POST https://api.suman.khamsacraft.az/api/devices/register
Authorization: Bearer <admin_token>
Content-Type: application/json
```

**Android:**
```json
{
  "token": "<FCM_DEVICE_TOKEN>",
  "platform": "android",
  "app": "admin"
}
```

**iOS:**
```json
{
  "token": "<FCM_DEVICE_TOKEN>",
  "platform": "ios",
  "app": "admin"
}
```

`platform` mütləqdir (`android` və ya `ios`). Default yoxdur — yanlış platforma token üst-üstə düşə bilər.

Logout (hər cihazda öz tokeni):
```http
DELETE /api/devices/unregister
{ "token": "<FCM_DEVICE_TOKEN>" }
```

## Firebase layihəsi (admin)

| Platform | Identifikator |
|----------|----------------|
| Android | `az.khamsacraft.suman.admin` |
| iOS | `az.khamsacraft.suman.admin` |

- Android: `google-services.json`
- iOS: `GoogleService-Info.plist` (Xcode)
- Kuryer ilə eyni Firebase layihəsi və ya ayrı — serverdə bir `FIREBASE_SERVICE_ACCOUNT_JSON` kifayətdir

## Bildirişə toxunanda

`data` payload (hamısı string):

| type | screen | Əlavə |
|------|--------|-------|
| `order_completed` | `orders` | `order_id` |
| `expense_created` | `history` | `expense_id` |
| `order_note` | `orders` | `order_id` |
| `warehouse_updated` | `warehouse` | `warehouse_update_id` |

Backend spec: `docs/PUSH-ADMIN-BACKEND.md`  
Anbar: `docs/WAREHOUSE.md`
