# SUMAN — Owner Panel Frontend Brief

Bu sənəd **Owner (platform sahibi)** paneli üçün ayrıca frontend layihəsinin tapşırığını təsvir edir. Backend hazırdır; admin və kuryer panelləri **ayrı repolarda** və **ayrı subdomainlərdə** olacaq.

---

## 1. Layihə haqqında

**SUMAN** — su çatdırılması (damacana) idarəetmə sistemidir. Platforma **birdən çox şirkətə** satılır:

- Hər şirkətin **öz admini** və **kuryerləri** var.
- Hər şirkətə **lisenziya kodu** verilir; admin/kuryer login zamanı bu kodu daxil edir.
- **Owner** (platform sahibi) bütün şirkətləri idarə edir: yaradır, aktiv/deaktiv edir, lisenziya verir/yeniləyir, şirkət üçün admin/kuryer hesabı yaradır.

Owner paneli **müştəri şirkətlərə verilmir** — yalnız platform sahibi üçündür.

---

## 2. Ümumi arxitektura

```text
api.suman.khamsacraft.az     →  Backend (Node/Express) — hazır repo: api-suman
admin.suman.khamsacraft.az   →  Admin panel (ayrı repo — artıq mövcuddur)
kuryer.suman.khamsacraft.az  →  Kuryer panel (ayrı repo — artıq mövcuddur)
owner.suman.khamsacraft.az   →  Owner panel (SİZİN layihəniz — yeni repo)
```

| Layihə | Kim istifadə edir | Lisenziya kodu login-də |
|--------|-------------------|-------------------------|
| Admin | Şirkət admini | Bəli |
| Kuryer | Şirkət kuryeri | Bəli |
| **Owner** | Platform sahibi | **Xeyr** |

---

## 3. Texnologiya tələbləri

| Tələb | Dəyər |
|-------|--------|
| Framework | **Next.js** (App Router tövsiyə olunur) |
| Dil | **TypeScript** |
| Stil | **CSS Modules** (`*.module.css`) — global CSS minimum |
| API | REST, JSON |
| State / fetch | İstəyə görə (React Query, SWR və s.) |

**Qeyd:** Admin və kuryer panelləri ayrı repodadır; vizual dil uyğun ola bilər, amma kod paylaşımı məcburi deyil.

---

## 4. Environment

```env
# .env.local
NEXT_PUBLIC_API_URL=http://localhost:5001
# production: https://api.suman.khamsacraft.az
```

---

## 5. Autentifikasiya

### Login

```http
POST {API_URL}/api/auth/login
Content-Type: application/json

{
  "email": "owner@suman.az",
  "password": "owner123"
}
```

Owner üçün **`license_code` göndərilmir**.

### Uğurlu cavab

```json
{
  "message": "Login successful",
  "token": "eyJhbG...",
  "user": {
    "id": 5,
    "email": "owner@suman.az",
    "name": "Platform Owner",
    "role": "owner",
    "company_id": null,
    "company_name": null
  }
}
```

### Frontend qaydaları

1. `token` → `localStorage` və ya httpOnly cookie (tövsiyə: mümkünsə secure cookie).
2. `user.role === 'owner'` yoxlanılsın; deyilsə `/login`-ə yönləndir.
3. Bütün owner API sorğularında: `Authorization: Bearer <token>`.
4. **401/403** → logout + login.

### Development test hesabı

| Email | Şifrə |
|-------|-------|
| `owner@suman.az` | `owner123` |

---

## 6. Owner API (yalnız `role: owner`)

Base path: `/api/owner`

### 6.1 Şirkətlər siyahısı

```http
GET /api/owner/companies
```

**Cavab (array):**

```json
[
  {
    "id": 1,
    "name": "Demo Şirkət",
    "license_code": "SUMAN-A7K9-2F4M",
    "is_active": true,
    "license_expires_at": null,
    "created_at": "...",
    "updated_at": "...",
    "admin_count": 1,
    "courier_count": 2,
    "customer_count": 15,
    "order_count": 120
  }
]
```

### 6.2 Şirkət detalı

```http
GET /api/owner/companies/:id
```

### 6.3 Yeni şirkət

```http
POST /api/owner/companies
{ "name": "Şirkət Adı", "is_active": true, "license_expires_at": "2027-12-31T00:00:00Z" }
```

→ Cavabda avtomatik **`license_code`** gəlir. Bu kodu müştəriyə verirsiniz (admin/kuryer login üçün).

### 6.4 Şirkəti redaktə et

```http
PATCH /api/owner/companies/:id
{ "name": "...", "is_active": false, "license_expires_at": null }
```

`is_active: false` → həmin şirkətin admin/kuryeri lisenziya ilə də login ola bilməz.

### 6.5 Lisenziya kodunu yenilə

```http
POST /api/owner/companies/:id/regenerate-license
```

→ Köhnə kod etibarsız olur; yeni `license_code` qaytarılır.

### 6.6 Şirkət istifadəçiləri

```http
GET  /api/owner/companies/:id/users
POST /api/owner/companies/:id/users
```

**POST body:**

```json
{
  "email": "admin@firma.az",
  "password": "secure-pass",
  "name": "Firma Admin",
  "phone": "994501234567",
  "role": "admin"
}
```

`role`: `"admin"` | `"courier"`

### 6.7 İstifadəçini redaktə et

```http
PUT /api/owner/companies/:companyId/users/:userId
```

**Body (hamısı opsional):**
```json
{
  "email": "yeni@firma.az",
  "password": "yeni-sifre",
  "name": "Ad Soyad",
  "phone": "994501234567",
  "role": "courier",
  "status": "inactive"
}
```

- `password` göndərilməsə — köhnə şifrə qalır.
- `status`: `"active"` | `"inactive"` — `inactive` olan hesab login edə bilməz.

### 6.8 İstifadəçini sil

```http
DELETE /api/owner/companies/:companyId/users/:userId
```

**Cavab:**
```json
{ "message": "User deleted", "user": { ... } }
```

---

## 7. Tövsiyə olunan səhifələr (MVP)

| Səhifə | Route (nümunə) | Funksiya |
|--------|----------------|----------|
| Login | `/login` | email + password |
| Dashboard | `/` | şirkət sayı, qısa statistika |
| Şirkətlər | `/companies` | cədvəl: ad, lisenziya, aktiv, admin/kuryer/müştəri/sifariş sayı |
| Şirkət yarat | `/companies/new` | form → POST |
| Şirkət detal | `/companies/[id]` | redaktə, lisenziya copy, regenerate, aktiv toggle |
| İstifadəçilər | `/companies/[id]/users` | siyahı, əlavə et, **redaktə**, **sil**, status (aktiv/deaktiv) |

### UX tövsiyələri

- **Lisenziya kodu** — böyük, kopyalama düyməsi (Copy to clipboard).
- **Regenerate license** — təsdiq modalı (“Köhnə kod işləməyəcək”).
- **Deaktiv şirkət** — vizual fərq (badge: Deaktiv).
- **Xəta mesajları** — API `error` sahəsini göstər (Azərbaycan dilində gələ bilər).

---

## 8. TypeScript tipləri (nümunə)

```typescript
export type UserRole = 'owner' | 'admin' | 'courier';

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  company_id: number | null;
  company_name: string | null;
}

export interface Company {
  id: number;
  name: string;
  license_code: string;
  is_active: boolean;
  license_expires_at: string | null;
  created_at: string;
  updated_at: string;
  admin_count?: number;
  courier_count?: number;
  customer_count?: number;
  order_count?: number;
}

export interface CompanyUser {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  role: 'admin' | 'courier';
  status: string;
  created_at: string;
}
```

---

## 9. API client nümunəsi

```typescript
const API = process.env.NEXT_PUBLIC_API_URL!;

export async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data as T;
}
```

---

## 10. Scope xaricində (bu repoda etməyin)

- Müştəri, sifariş, tarixçə CRUD → **Admin panel** (`/api/customers`, `/api/orders`, …).
- Kuryer sifariş axını → **Kuryer panel**.
- Owner panelində bu endpointlərə ehtiyac **yoxdur**.

---

## 11. Əlaqə / resurslar

- Backend repo: `api-suman`
- Backend işə salma: `npm run dev` → `http://localhost:5001`
- Health: `GET /health`
- Ətraflı API: backend `README.md`

---

## 12. Qəbul kriteriyaları (MVP hazır sayılır)

- [ ] Owner login/logout işləyir
- [ ] Şirkətlər siyahısı göstərilir
- [ ] Yeni şirkət yaradılır, lisenziya kodu görünür və kopyalanır
- [ ] Şirkət aktiv/deaktiv edilir
- [ ] Lisenziya yenilənir (regenerate)
- [ ] Şirkət üçün admin və kuryer hesabı yaradılır, redaktə və silinir
- [ ] Next.js + TypeScript + CSS Modules
- [ ] Production üçün `NEXT_PUBLIC_API_URL` konfiqurasiya olunub
