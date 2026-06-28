# Admin — Müştərilər cədvəli və müştəri detalı

## 1. Cədvəl sıralaması

`GET /api/customers` cavabı **elifba sırası ilə** gəlir:

- `name ASC`, sonra `surname ASC`
- Frontend əlavə sort etməyə ehtiyac yoxdur (istəsəniz eyni qaydanı saxlayın)

Siyahıda hər sətirdə `display_name` var (Ad + Soyad).

---

## 2. Siyahı vs detal

| Ekran | API | Məqsəd |
|--------|-----|--------|
| Müştərilər cədvəli | `GET /api/customers` | Qısa siyahı |
| Müştəri detalı | `GET /api/customers/:id` | Tam məlumat, sifariş və borc tarixçəsi |

Cədvəldə sətirə klik / “Detallar” → detal səhifəsi və ya modal.

---

## 3. `GET /api/customers/:id`

**Auth:** `Authorization: Bearer <token>`

**Nümunə cavab:**

```json
{
  "customer": {
    "id": 12,
    "name": "Azer",
    "surname": "Huseynov",
    "display_name": "Azer Huseynov",
    "phone": "050 553 18 68",
    "phone2": "070 530 57 30",
    "address": "Masazir. Su Turbalarin yani deqiq konum",
    "price": "3.00",
    "active_bidons": 3,
    "debt": "6.00",
    "created_at": "2026-06-27T...",
    "updated_at": "2026-06-27T..."
  },
  "stats": {
    "total_orders": 8,
    "completed_orders": 7,
    "active_orders": 1,
    "last_order_at": "2026-06-27T10:00:00.000Z",
    "last_completed_at": "2026-06-25T14:30:00.000Z",
    "total_order_value": "24.00"
  },
  "recent_orders": [
    {
      "id": 101,
      "status": "completed",
      "bidons_count": 2,
      "address": "Masazir...",
      "price": "6.00",
      "payment_type": "credit",
      "amount_paid": "0.00",
      "is_paid": false,
      "notes": null,
      "created_at": "...",
      "completed_at": "...",
      "assigned_at": "...",
      "courier_name": "Elnur"
    }
  ],
  "debt_payments": [
    {
      "id": 5,
      "amount": "6.00",
      "previous_debt": "12.00",
      "new_debt": "6.00",
      "created_at": "...",
      "recorded_by_name": "Admin"
    }
  ]
}
```

**404:** `{ "error": "Customer not found" }`

---

## 4. Detal UI tövsiyəsi

### Üst blok — əsas məlumat
- **Ad:** `customer.display_name`
- **Telefon 1 / 2:** `tel:` link (mobil üçün zəng)
- **Ünvan:** tam mətn, çox sətirli (`white-space: pre-wrap` və ya geniş textarea oxuma rejimi)
- **Qiymət:** `customer.price` ₼
- **Aktiv bidon:** `customer.active_bidons`
- **Cari borc:** `customer.debt` ₼ (borc > 0 → vurğula)

### Statistik kartlar (`stats`)
- Cəmi sifariş / tamamlanan / aktiv
- Son sifariş tarixi
- Son tamamlanma tarixi

### Son sifarişlər (`recent_orders`, max 20)
| Sütun | Mənbə |
|--------|--------|
| Tarix | `created_at` |
| Status | `status` |
| Bidon | `bidons_count` |
| Məbləğ | `price` |
| Ödəniş | `payment_type`, `is_paid` |
| Kuryer | `courier_name` |

Sifariş sətirinə klik → mövcud sifariş detal ekranı.

### Borc ödənişləri (`debt_payments`, max 20)
- Tarix, ödənilən məbləğ (`amount`), əvvəlki / yeni borc
- Kim qeyd edib: `recorded_by_name`

### Əməliyyatlar
- **Redaktə:** mövcud `PUT /api/customers/:id` formu
- **Yeni sifariş:** `POST /api/orders` + `customer_id`

---

## 5. Cədvəl UI (siyahı)

Tövsiyə olunan sütunlar:

| Sütun | Field |
|--------|--------|
| Ad | `display_name` |
| Telefon | `phone` |
| Ünvan | `address` (1–2 sətir, `…` ilə qısaldın) |
| Qiymət | `price` |
| Bidon | `active_bidons` |
| Borc | `debt` |

Ünvan cədvəldə qısa, **detalda tam** göstərin.

---

## 6. Passiv müştəri bildirişi

Push / notification: `type === "customer_inactive"` → `customers` səhifəsi, `customer_id` ilə detala keçid:

```
/customers/:customerId
```
