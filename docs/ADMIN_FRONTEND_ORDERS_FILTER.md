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

## Bidon məlumatları (sifariş siyahısı / detal)

`GET /api/orders` və `GET /api/orders/:id` cavabında hər sifarişdə:

| Sahə | Məna |
|------|------|
| `bidons_count` | Sifariş edilən bidon sayı |
| `full_bidons_given` | Verilən dolu bidon (tamamlanmamışda planlaşdırılan say) |
| `empty_bidons_returned` | Müştəridən götürülən boş bidon (tamamlananda kuryer qeyd edir; aktiv sifarişdə `null`) |
| `customer_active_bidons_before` | Sifariş yaradılanda müştəridə olan boş bidon |
| `customer_empty_bidons_during` | Təyin olunub / icra olunur — tamamlanana qədər müştəridə boş bidon (`customer_active_bidons_before` ilə eyni) |
| `customer_active_bidons_after` | Tamamlandıqdan sonra müştəridə qalan boş bidon (`completed` statusunda) |

### UI tövsiyəsi — sütunlar

| Sütun | Göstəriş |
|--------|----------|
| Sifariş | `bidons_count` dolu |
| Götürülən boş | `empty_bidons_returned` (tamamlanmayıbsa `—`) |
| Müştəridə boş (icra) | `customer_empty_bidons_during` — yalnız `assigned` / `in_progress` |
| Müştəridə boş (sonra) | `customer_active_bidons_after` — yalnız `completed` |

Nümunə: `2 dolu · 1 boş götürüldü · qalıq: 3`  
`order_type === "pickup"` → yalnız boş götürmə (`full_bidons_given` = 0).

**Qeyd:** Köhnə sifarişlərdə `customer_active_bidons_before/after` boş ola bilər; bu halda `customer_empty_bidons_during` müştərinin cari `active_bidons` dəyərinə fallback edir.

```typescript
// Sifariş sətirində bidon xülasəsi
function formatOrderBidons(o: Order) {
  const parts = [`${o.bidons_count} dolu`];
  if (o.empty_bidons_returned != null) {
    parts.push(`${o.empty_bidons_returned} boş götürüldü`);
  }
  if (o.customer_empty_bidons_during != null) {
    parts.push(`müştəridə ${o.customer_empty_bidons_during} boş`);
  } else if (o.customer_active_bidons_after != null) {
    parts.push(`sonra ${o.customer_active_bidons_after} boş qaldı`);
  }
  return parts.join(' · ');
}
```

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
