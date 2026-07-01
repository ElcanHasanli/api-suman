# Admin — Sifarişlər səhifəsi filtrləri

## Sifariş siyahısı

```http
GET /api/orders?status=assigned&courier_id=5&completedToday=true
Authorization: Bearer <admin_token>
```

Filtrlər **AND** ilə birləşir (hamısı eyni anda tətbiq oluna bilər).

### Status

| `status` | Məna |
|----------|------|
| `pending` | Gözləyən (kuryer təyin olunmayıb) |
| `assigned` | Təyin olunub |
| `in_progress` | Kuryer başlayıb |
| `completed` | Tamamlanıb |

Parametr göndərilməsə — bütün statuslar.

### Bu gün tamamlanan

```
completedToday=true
```

Yalnız **bu gün** (Asia/Baku) tamamlanan `completed` sifarişlər.

### Kuryer

| `courier_id` | Məna |
|--------------|------|
| *(boş)* | Bütün kuryerlər |
| `5` | Yalnız həmin kuryerin sifarişləri |
| `unassigned` | Kuryer təyin olunmamış sifarişlər (`courier_id IS NULL`) |

**Kuryer dropdown:** `GET /api/couriers` — `{ id, name, phone, status }[]`

### Nümunələr

```http
# Bütün sifarişlər
GET /api/orders

# Yalnız Elnur kuryerinin sifarişləri
GET /api/orders?courier_id=3

# Gözləyən + kuryersiz
GET /api/orders?status=pending&courier_id=unassigned

# Bu gün tamamlanan + müəyyən kuryer
GET /api/orders?completedToday=true&courier_id=3
```

## Frontend tövsiyəsi

1. Status tab/dropdown — mövcud filtr
2. **Kuryer dropdown** — `GET /api/couriers` ilə doldur; birinci option: «Hamısı» (parametr göndərmə)
3. Seçim dəyişəndə: `getOrders({ status, courier_id, completedToday })`
4. URL sync (istəyə görə): `?status=assigned&courier_id=3`

```typescript
// lib/api.ts
export async function getOrders(params?: {
  status?: string;
  courier_id?: number | 'unassigned';
  completedToday?: boolean;
}) {
  const q = new URLSearchParams();
  if (params?.status) q.set('status', params.status);
  if (params?.courier_id != null && params.courier_id !== '') {
    q.set('courier_id', String(params.courier_id));
  }
  if (params?.completedToday) q.set('completedToday', 'true');
  return apiGet(`/orders?${q}`);
}
```

## Xətalar

| HTTP | Mənası |
|------|--------|
| 400 | `courier_id` rəqəm deyil |
| 404 | Kuryer tapılmadı (başqa şirkət və ya mövcud deyil) |
