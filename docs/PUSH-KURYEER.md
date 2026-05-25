# Kuryer — Push bildirişlər

## API

| Method | URL | Body |
|--------|-----|------|
| POST | `/api/notifications/device-token` | `{ "token": "<FCM>", "platform": "android" \| "ios" }` |
| GET | `/api/notifications` | — |
| PATCH | `/api/notifications/:id/read` | — |
| PATCH | `/api/notifications/read-all` | — |

Login-dən sonra token qeydiyyatı edin. Tətbiq açıq olanda polling də işləyir.

## Assign

Admin kuryer təyin edəndə avtomatik bildiriş + push (FCM konfiqurasiya olunubsa).
