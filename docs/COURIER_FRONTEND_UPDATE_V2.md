# Kuryer panel — Backend yeniləməsi (V2)

## 1. Əlavə xərclər

Kuryer öz xərclərini qeyd edir (yanacaq və s.).

| Method | URL |
|--------|-----|
| GET | `/api/expenses?period=today` — yalnız öz xərcləri |
| POST | `/api/expenses` |

**POST body:**
```json
{
  "amount": 25.50,
  "description": "Yanacaq",
  "category": "fuel"
}
```

`courier_id` göndərməyin — avtomatik sizin hesabınıza yazılır.

**Cavab:** `{ expenses: [...], totalExpenses: 45 }`

**UI:** «Əlavə xərclər» bölməsi + tarixçədə/filterdə öz xərclərinizin siyahısı.

---

## 2. Sifariş qeydləri

Təhvil zamanı qeyd (məs. problem baş verdi).

| Method | URL |
|--------|-----|
| POST | `/api/orders/:id/notes` — `{ "body": "Mətn..." }` |
| GET | `/api/orders/:id/notes` |
| GET | `/api/orders/:id` — `notes` massivi daxildir |

Admin də qeyd yaza bilər — sifariş detalında hamısını göstərin (`author_role`, `author_name`).

---

## 3. Digər

- Müştəri CRUD — **yox** (admin).
- Login — əvvəlki kimi `license_code` mütləq.

---

## Deploy

Backend `npm run db:migrate:v2` işlədilməlidir.
