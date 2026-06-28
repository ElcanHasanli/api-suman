# SUMAN — Admin Panel: Backend dəyişiklikləri

Bu sənəd **Admin panel** frontend komandası üçündür. Backend multi-şirkət (SaaS) modelinə keçib; admin paneldə **mütləq yenilənməli** hissələr aşağıdadır.

**Subdomain:** `admin.suman.khamsacraft.az`  
**API:** `https://api.suman.khamsacraft.az` (dev: `http://localhost:5001`)

---

## 1. Ən vacib: Login dəyişdi

Admin login indi **lisenziya kodu** tələb edir. Kod platform sahibi (owner) tərəfindən şirkət yaradılanda verilir.

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin@firma.az",
  "password": "******",
  "license_code": "SUMAN-A7K9-2F4M"
}
```

**Uğurlu cavab:**
```json
{
  "token": "eyJhbG...",
  "user": {
    "id": 3,
    "email": "admin@firma.az",
    "name": "Admin",
    "role": "admin",
    "company_id": 1,
    "company_name": "Firma Adı"
  }
}
```

### Frontenddə etməli olduğunuz

- [ ] Login formuna **`license_code`** sahəsi əlavə edin (mətn, böyük hərf göstərmək olar).
- [ ] `token` + `user` saxlayın; sonrakı bütün sorğularda `Authorization: Bearer <token>`.
- [ ] `user.company_id` / `user.company_name` istəsəniz UI-da göstərin.
- [ ] **`POST /api/auth/register` bağlıdır** — 403. Qeydiyyat səhifəsi lazım deyilsə silin.

### Xəta mesajları (API-dən)

| Mesaj | Məna |
|-------|------|
| `Lisenziya kodu tələb olunur` | `license_code` göndərilməyib |
| `Yanlış lisenziya kodu` | Kod tapılmadı |
| `Şirkət deaktiv edilib` | Owner şirkəti söndürüb |
| `Lisenziyanın müddəti bitib` | `license_expires_at` keçib |
| `Bu hesab bu lisenziya koduna aid deyil` | Email başqa şirkətə aiddir |

### Development test

| Email | Şifrə | Lisenziya |
|-------|-------|-----------|
| `admin@suman.az` | `admin123` | Backend `npm run db:seed` çıxışındakı kod |

---

## 2. Məlumat izolyasiyası

Backend avtomatik **yalnız sizin şirkətinizin** məlumatını qaytarır (`company_id` JWT-dən). Əlavə filter parametri göndərməyə ehtiyac yoxdur.

Başqa şirkətin `customer_id` / `order_id` ilə sorğu etsəniz → **404** və ya boş nəticə.

---

## 3. Yeni / dəyişən API-lər

### Ödəniş statusu (sifarişlər)

Tamamlanmış sifarişlərdə əlavə sahələr:

| Sahə | Tip | Məna |
|------|-----|------|
| `is_paid` | boolean | Ödənilib? |
| `paid_at` | string \| null | Ödəniş tarixi |

**Kuryer tamamlayanda:**
- `cash` / `card` → `is_paid: true`, `paid_at` dolu
- `credit` (nişə) → `is_paid: false`, `paid_at: null`

**Admin — nişəni ödənilmiş etmək:**
```http
PUT /api/orders/:id/mark-paid
Authorization: Bearer <token>
```
→ `is_paid: true`, müştəri `debt` azalır.

### Müştəri telefonu

Bir telefon **yalnız bir müştəriyə** (şirkət daxilində) aid ola bilər.

```http
POST /api/customers
PUT  /api/customers/:id
```

Təkrar nömrə → **409**:
```json
{ "error": "Bu telefon nömrəsi artıq başqa müştəriyə aid edilib" }
```

Telefon DB-də normallaşdırılır (`050...` → `994...`). UI-da istədiyiniz formatda göstərə bilərsiniz.

### Tarixçə summary (`GET /api/history`)

```json
{
  "summary": {
    "totalOrders": 10,
    "totalRevenue": 150.5,
    "cashRevenue": 100,
    "cardRevenue": 30.5,
    "creditRevenue": 20,
    "unpaidCreditOrders": 2,
    "unpaidCreditAmount": 45
  },
  "orders": [ ... ]
}
```

**Hesablama qaydası (dəqiq göstərin):**
- `cashRevenue` — nağd sifarişlərin `amount_paid` cəmi
- `cardRevenue` — kart sifarişlərin `amount_paid` cəmi
- `creditRevenue` — nişə + **`is_paid === true`** olanların **`price`** cəmi
- `unpaidCreditAmount` — nişə + **`is_paid === false`** → borc (`price - amount_paid`)
- **`totalRevenue` = cashRevenue + cardRevenue + creditRevenue** (həmişə)

Ödənilməmiş nişə **`totalRevenue`-ə daxil deyil**.

---

## 4. Admin API xülasəsi (dəyişməyən URL-lər)

Bütün endpointlər eyni prefix: `/api/...`  
Header: `Authorization: Bearer <token>`

### Müştərilər
| Method | URL |
|--------|-----|
| GET | `/api/customers` — elifba sırası (name, surname) |
| GET | `/api/customers/:id` — detal + sifariş/borc tarixçəsi |
| GET | `/api/customers/search?q=` |
| GET | `/api/customers/export` (blob) |
| POST | `/api/customers` |
| PUT | `/api/customers/:id` |
| DELETE | `/api/customers/:id` |

Detal ekranı: **`docs/ADMIN_FRONTEND_CUSTOMER_DETAIL.md`**

### Sifarişlər
| Method | URL |
|--------|-----|
| GET | `/api/orders` ?`status` & `courier_id` & `completedToday=true` |
| GET | `/api/orders/completed/:period` — `today` \| `week` \| `month` \| `custom` + `startDate`, `endDate` |
| GET | `/api/orders/:id` |
| POST | `/api/orders` |
| PUT | `/api/orders/:id` |
| PUT | `/api/orders/:id/done` |
| PUT | `/api/orders/:id/mark-paid` |
| DELETE | `/api/orders/:id` |

### Tarixçə
| GET | `/api/history?period=...` |
| GET | `/api/history/export?period=...` |

### Kuryerlər (təyinat üçün)
| GET | `/api/couriers` |
| POST | `/api/users` — yalnız **kuryer** yaradır (`role: "courier"`) |

---

## 5. TypeScript — əlavə sahələr

```typescript
interface Order {
  // ... mövcud sahələr
  is_paid: boolean;
  paid_at: string | null;
  payment_type: 'cash' | 'card' | 'credit' | null;
  amount_paid: number | null;
}

interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: 'admin';
  company_id: number;
  company_name: string;
}

interface HistorySummary {
  totalOrders: number;
  totalRevenue: number;
  cashRevenue: number;
  cardRevenue: number;
  creditRevenue: number;
  unpaidCreditOrders: number;
  unpaidCreditAmount: number;
}
```

---

## 6. UI tövsiyələri

- [ ] Login: 3 sahə (email, şifrə, lisenziya kodu)
- [ ] Sifariş cədvəlində nişə + `!is_paid` → «Ödənilməyib» badge + **«Ödənildi»** düyməsi → `mark-paid`
- [ ] Tarixçə kartlarında `unpaidCreditAmount` ayrıca göstərilsin
- [ ] 409 telefon xətası istifadəçiyə aydın mesajla

---

## 7. Scope xaricində

- **Owner panel** (`suman.khamsacraft.az`) — `/api/owner/*` — admin paneldə **istifadə etməyin**
- Kuryer `start` / `complete` — kuryer panelindədir; admin yalnız `done` və `mark-paid` edə bilər

---

## 8. Əlaqə

Backend repo: `api-suman` · `README.md` · `npm run dev` → port `5001`
