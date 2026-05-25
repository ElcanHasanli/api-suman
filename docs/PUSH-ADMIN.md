# Admin — Kuryer təyinatı və push

Admin paneldə əlavə kod lazım deyil — **`courier_id` body-də göndərilməlidir**:

- `POST /api/orders` — `{ customer_id, courier_id, ... }`
- `PUT /api/orders/:id` — `{ courier_id: 2 }` (status `assigned` olur)

Kuryer bildirişi backend-də avtomatik yaranır.
