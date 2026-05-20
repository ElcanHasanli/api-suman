# Owner panel — YENİLİK: İstifadəçi edit / delete

**Tarix:** backend yeniləməsi  
**Kimə:** Owner frontend (`suman.khamsacraft.az`) komandası

---

## Nə əlavə olundu?

Şirkət istifadəçilərini (admin / kuryer) indi **redaktə** və **silə** bilərsiniz.

| Method | URL |
|--------|-----|
| `PUT` | `/api/owner/companies/:companyId/users/:userId` |
| `DELETE` | `/api/owner/companies/:companyId/users/:userId` |

Əvvəlki `GET` və `POST` eyni qalır.

---

## Redaktə

```http
PUT /api/owner/companies/1/users/5
Authorization: Bearer <owner_token>
Content-Type: application/json

{
  "name": "Yeni Ad",
  "email": "admin@firma.az",
  "phone": "994501234567",
  "role": "admin",
  "status": "active",
  "password": "optional-yeni-sifre"
}
```

- Bütün sahələr **opsional** — yalnız dəyişənləri göndərin.
- `password` yoxdursa — şifrə dəyişmir.
- `role`: `"admin"` | `"courier"`
- `status`: `"active"` | `"inactive"` → deaktiv hesab **login edə bilməz**

**Uğurlu cavab:** yenilənmiş user obyekti (şifrə hash qaytarılmır).

**Xətalar:**
- `404` — user və ya şirkət tapılmadı
- `400` — `Email already exists` (başqa hesabda eyni email)

---

## Sil

```http
DELETE /api/owner/companies/1/users/5
Authorization: Bearer <owner_token>
```

```json
{
  "message": "User deleted",
  "user": {
    "id": 5,
    "email": "...",
    "name": "...",
    "role": "courier",
    ...
  }
}
```

Kuryerin təyin olunmuş sifarişləri qalır; `courier_id` null olur (backend FK).

---

## UI tövsiyəsi

Şirkət detal → **İstifadəçilər** cədvəli:

| Ad | Email | Rol | Status | Əməliyyat |
|----|-------|-----|--------|-----------|
| ... | ... | admin | active | Redaktə · Sil |

- **Redaktə** — modal/form → `PUT`
- **Sil** — təsdiq: «Bu hesab silinəcək» → `DELETE`
- **Status** toggle və ya select → `PUT` ilə `status: "inactive"`

---

## TypeScript

```typescript
interface UpdateCompanyUserBody {
  email?: string;
  password?: string;
  name?: string;
  phone?: string | null;
  role?: 'admin' | 'courier';
  status?: 'active' | 'inactive';
}
```

---

Ətraflı kontekst: `docs/OWNER_FRONTEND_BRIEF.md` (§6.7, §6.8)
