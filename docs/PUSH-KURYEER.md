# Kuryer tətbiqi — Push (Android + iOS)

## Token qeydiyyatı (tövsiyə olunur)

```http
POST /api/devices/register
Authorization: Bearer <courier JWT>
```

**Android:** `{ "token": "<FCM>", "platform": "android", "app": "courier" }`  
**iOS:** `{ "token": "<FCM>", "platform": "ios", "app": "courier" }`

Logout: `DELETE /api/devices/unregister` `{ "token": "..." }`

## Köhnə endpoint (uyğunluq)

| Method | URL | Body |
|--------|-----|------|
| POST | `/api/notifications/device-token` | `{ "token": "<FCM>", "platform": "android" \| "ios" }` |

| GET | `/api/notifications` | — |
| PATCH | `/api/notifications/:id/read` | — |
| PATCH | `/api/notifications/read-all` | — |

Login-dən sonra token qeydiyyatı edin. Tətbiq açıq olanda polling də işləyir.

## Assign

Admin kuryer təyin edəndə avtomatik bildiriş + push (FCM konfiqurasiya olunubsa).

Firebase (kuryer): `az.khamsacraft.suman.courier` — Android və iOS eyni bundle/package adı layihədə.
