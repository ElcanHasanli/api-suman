# Admin panel — Backend yeniləməsi (V2)

## 1. Əlavə xərclər (kuryer xərcləri)

Kuryer yanacaq və s. xərc qeyd edir; admin tarixçədə görür.

| Method | URL |
|--------|-----|
| GET | `/api/expenses?period=today&courier_id=` |
| POST | `/api/expenses` — admin kuryer adına: `{ courier_id, amount, description, category? }` |
| DELETE | `/api/expenses/:id` |

**Tarixçə (`GET /api/history`):** cavabda əlavə:
```json
{
  "summary": {
    "orderRevenue": 150,
    "debtCollected": 20,
    "totalRevenue": 170,
    "totalExpenses": 45,
    "netRevenue": 125,
    "cashRevenue": "...",
    "cardRevenue": "...",
    "creditRevenue": "..."
  },
  "orders": [],
  "expenses": [{ "courier_name", "amount", "description", "created_at" }],
  "debtPayments": []
}
```

**UI:** Xalis gəlir = `netRevenue`. Xərclər cədvəli — hansı kuryer, nə qədər.

---

## 2. Sifariş qeydləri

Admin sifarişə təlimat qeydi yaza bilər (kuryer də öz qeydini yazır).

| Method | URL |
|--------|-----|
| GET | `/api/orders/:id/notes` |
| POST | `/api/orders/:id/notes` — `{ "body": "Diqqət: ..." }` |
| GET | `/api/orders/:id` — cavabda `notes` massivi də var |

`author_role`: `admin` | `courier`

---

## 3. Müştəri — ad bir input

POST/PUT qəbul edir:
- `{ "full_name": "Elcan Həsənli" }` — soyad opsional (boşluqdan sonra)
- və ya `{ "name": "Elcan" }` — yalnız ad

Cavabda `display_name` — tam göstərim üçün.

---

## 4. Telefon — daxil edildiyi kimi

`phone` və `phone2` **normalizasiya olunmadan** saxlanır (məs: `050 123 45 67`).  
Cədvəldə `phone` sahəsini göstərin — `phone_normalized` UI-da lazım deyil.

---

## 5. İkinci telefon (opsional)

```json
{ "phone": "0501234567", "phone2": "0559998877" }
```

`phone2` boş ola bilər.

---

## 6. Borc ödənişi → tarixçə

Müştəri `debt` azaldılanda (`PUT /api/customers/:id`):
```json
{
  "customer": { ... },
  "debt_payment": {
    "amount": 10,
    "previous_debt": 25,
    "new_debt": 15,
    "created_at": "..."
  }
}
```

Tarixçədə `debtPayments` siyahısı və `summary.debtCollected` — həmin günün gəlirinə əlavə olunur.

**UI:** Müştəri borc redaktə → ödənilən məbləğ tarixçədə «Borc ödənişi» kimi; gəlir kartında `debtCollected` / `totalRevenue`.

---

## Deploy

Backend: `npm run db:migrate:v2` (serverdə bir dəfə).
