# SUMAN — Kuryer Panel: Backend dəyişiklikləri

Bu sənəd **Kuryer panel** frontend komandası üçündür (APK / web). Backend multi-şirkət modelinə keçib; aşağıdakı dəyişikliklər **mütləq** tətbiq edilməlidir.

**Subdomain:** `kuryer.suman.khamsacraft.az`  
**API:** `https://api.suman.khamsacraft.az` (dev: `http://localhost:5001`)

---

## 1. Ən vacib: Login dəyişdi

Kuryer login indi **lisenziya kodu** tələb edir (şirkət admini ilə eyni kod).

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "kuryer@firma.az",
  "password": "******",
  "license_code": "SUMAN-A7K9-2F4M"
}
```

**Uğurlu cavab:**
```json
{
  "token": "eyJhbG...",
  "user": {
    "id": 4,
    "email": "kuryer@firma.az",
    "name": "Kuryer",
    "role": "courier",
    "company_id": 1,
    "company_name": "Firma Adı"
  }
}
```

### Frontenddə / APK-da etməli olduğunuz

- [ ] Login ekranına **`license_code`** sahəsi (bir dəfə daxil edib SecureStorage-da saxlamaq olar).
- [ ] Bütün API sorğularında `Authorization: Bearer <token>`.
- [ ] `role === 'courier'` yoxlanışı.
- [ ] **`POST /api/auth/register` işləmir** (403).

### Xəta mesajları

| Mesaj | Məna |
|-------|------|
| `Lisenziya kodu tələb olunur` | Kod göndərilməyib |
| `Yanlış lisenziya kodu` | Etibarsız kod |
| `Şirkət deaktiv edilib` | Giriş bağlanıb |
| `Bu hesab bu lisenziya koduna aid deyil` | Yanlış kod/hesab uyğunsuzluğu |

### Development test

| Email | Şifrə | Lisenziya |
|-------|-------|-----------|
| `kuryer@suman.az` | `kuryer123` | `npm run db:seed` çıxışındakı kod |

---

## 2. Məlumat izolyasiyası

`GET /api/orders` və digər endpointlər avtomatik **yalnız sizin təyin olunmuş sifarişlərinizi** qaytarır. Başqa şirkətin sifarişinə ID ilə çata bilməzsiniz (403/404).

---

## 3. Sifariş axını (dəyişməyib, amma tamamlama detalları var)

### Siyahı
```http
GET /api/orders
Authorization: Bearer <token>
```
→ Yalnız `courier_id = sizin id` olan sifarişlər.

### Detal
```http
GET /api/orders/:id
```

### Başladım
```http
PUT /api/orders/:id/start
```
→ Status: `in_progress`

### Tamamladım
```http
PUT /api/orders/:id/complete
Content-Type: application/json

{
  "payment_type": "cash",
  "amount_paid": 12.5,
  "empty_bidons_returned": 2,
  "full_bidons_given": 5,
  "notes": ""
}
```

| `payment_type` | Məna |
|----------------|------|
| `cash` | Nağd |
| `card` | Kart |
| `credit` | Nişə (müştəri borcu artır, admin paneldə görünür) |

**Avtomatik (backend):**
- `cash` / `card` → `is_paid: true`, `paid_at` set olunur
- `credit` → `is_paid: false` (admin sonradan «ödənildi» edə bilər)

`full_bidons_given` — sifarişdə `bidons_count` default gəlir; formda redaktə oluna bilər.  
`empty_bidons_returned` — götürülən boş bidon sayı.

`amount_paid`: nişədə adətən `0` və ya qismən; nağd/kartda adətən sifariş `price`.

---

## 4. Bildirişlər

Kuryerə sifariş təyin olunanda bildiriş gəlir.

```http
GET  /api/notifications
PATCH /api/notifications/:id/read
PATCH /api/notifications/read-all
```

Push notification (APK) üçün polling və ya gələcək WebSocket ayrıca planlaşdırıla bilər; hazırda REST kifayətdir.

---

## 5. Tarixçə + Excel

```http
GET /api/orders/courier/{userId}/export?period=week
```

`userId` = login olan kuryerin `user.id`.  
`period`: `today` | `week` | `month` | `custom` (+ `startDate`, `endDate`)

Cavab: Excel **blob** — admin export ilə eyni məntiq.

Tamamlanmış sifarişlər siyahısı:
```http
GET /api/orders?status=completed
```
və ya courier-specific endpoint (əgər istifadə edirsinizsə):
```http
GET /api/orders/courier/{userId}
```

---

## 6. Sifariş obyektində yeni sahələr

```typescript
interface Order {
  id: number;
  bidons_count: number;
  full_bidons_given: number | null;
  price: number;
  status: 'pending' | 'assigned' | 'in_progress' | 'completed';
  payment_type: 'cash' | 'card' | 'credit' | null;
  amount_paid: number | null;
  is_paid: boolean;
  paid_at: string | null;
  empty_bidons_returned: number;
  address: string;
  // müştəri join: name, surname, customer_phone, ...
}

interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: 'courier';
  company_id: number;
  company_name: string;
}
```

Kuryer UI-da `is_paid` göstərmək məcburi deyil; əsasən admin panel üçündür. Amma tamamlama formasında `payment_type` seçimi **mütləqdir**.

---

## 7. API client nümunəsi

```typescript
const API = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:5001';

export async function login(email: string, password: string, license_code: string) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, license_code }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}
```

---

## 8. UI / APK checklist

- [ ] Login: email + şifrə + lisenziya kodu
- [ ] Sifariş detal: bidon sayı, ünvan, müştəri
- [ ] «Başladım» → `start`
- [ ] «Tamamladım» formu: ödəniş növü, boş/dolu bidon, məbləğ
- [ ] Bildirişlər siyahısı
- [ ] Tarixçə / export (istəyə bağlı MVP+)

---

## 9. Scope xaricində

- Müştəri CRUD, tarixçə summary, `mark-paid` → **Admin panel**
- Owner / şirkət idarəetməsi → **suman.khamsacraft.az** (ayrı repo)

---

## 10. Əlaqə

Backend: `api-suman` · `README.md`
