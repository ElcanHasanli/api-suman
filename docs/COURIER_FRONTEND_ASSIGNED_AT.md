# Kuryer — Aktiv sifarişlər (backend filtr)

`assigned` / `in_progress` sifarişlər yalnız **bu gün** (Asia/Baku) təyin olunmuşlar API-də görünür.

- `GET /api/orders` — avtomatik filtr
- `GET /api/orders/:id`, `PUT .../start`, `PUT .../complete` — köhnə aktiv sifariş → `404`
- `completed` və `?completedToday=true` — əvvəlki kimi (Baku tarixi)

Admin filtrsiz qalır.

Deploy: `npm run db:migrate:assigned-at`
