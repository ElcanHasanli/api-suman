# Admin — Müştəri depoziti və qeyd

**Kimə:** Admin frontend  
**Deploy:** `npm run db:migrate:customer-deposit` sonra `pm2 restart api-suman`

---

## Məna

| Sahə | Məna |
|------|------|
| `deposit` | Müştəridə saxlanan depozit (AZN). Adətən verilən bidona görə admin təyin edir (məs. yeni müştəri → `20`) |
| `notes` | **Müştərinin öz qeydi** (sifariş `order_notes`-dan ayrı) — daimi mətn |

**Ümumi depozit** = bütün müştərilərin `deposit` cəmi.  
Müştəri silinəndə onun depoziti cəmdən avtomatik çıxır; tarixçədə mənfi qeyd qalır (`entry_type: delete`).

---

## API

### Yarat / yenilə

```http
POST /api/customers
{
  "name": "Yeni Müştəri",
  "phone": "0501234567",
  "address": "...",
  "active_bidons": 2,
  "deposit": 20,
  "notes": "Girişdə 2 bidon — depozit 20"
}
```

```http
PUT /api/customers/:id
{
  "deposit": 30,
  "notes": "Yenilənmiş qeyd"
}
```

- `deposit` — `≥ 0` (opsional; göndərilməsə dəyişmir)
- `notes` — string və ya `null`/boş (təmizləmək üçün)

**PUT cavabı** əlavə sahələr:

```json
{
  "customer": { "...": "...", "deposit": 30, "notes": "..." },
  "debt_payment": null,
  "deposit_entry": {
    "amount": 10,
    "previous_deposit": 20,
    "new_deposit": 30,
    "entry_type": "adjust"
  }
}
```

`deposit` dəyişməyibsə `deposit_entry: null`.

### Sil

```http
DELETE /api/customers/:id
```

```json
{
  "message": "Customer deleted",
  "customer": { "...": "..." },
  "deposit_removed": 20
}
```

Silinməzdən əvvəl ledger-ə `entry_type: "delete"`, `amount: -20` yazılır.  
Sifarişi olan müştərini silmək olmur (`orders` FK) — əvvəl sifarişlər bağlanmalıdır.

### Cəmi depozit

```http
GET /api/customers/deposit-totals
```

```json
{
  "current_total": 1540.5,
  "customers_with_deposit": 82
}
```

### Detal

`GET /api/customers/:id` → `customer.deposit`, `customer.notes` + `deposit_entries[]` (son 50).

Siyahı / search / export də `deposit` və `notes` qaytarır.

---

## Tarixçə qutusu

`GET /api/history` / `GET /api/history/dashboard` → `dashboard.deposits`

Period (`today` / `month` / `custom` …) ledger üzrə:

```json
{
  "deposits": {
    "total": 120,
    "entered": 120,
    "removed": 40,
    "net": 80,
    "count": 5,
    "current_total": 1540.5,
    "label": "Depozit",
    "entries": [
      {
        "customer": "Yeni Müştəri",
        "amount": 20,
        "entry_type": "create",
        "recorded_by_name": "Admin",
        "created_at": "..."
      },
      {
        "customer": "Silinən",
        "amount": -20,
        "entry_type": "delete",
        "created_at": "..."
      }
    ]
  }
}
```

| Sahə | UI |
|------|-----|
| `entered` / `total` | Periodda **daxil olan** depozit |
| `removed` | Periodda çıxan (azalma + silinmə) |
| `net` | entered − removed |
| `current_total` | İndi müştərilərdəki **ümumi** depozit (perioddan asılı deyil) |

Kart: məs. «Depozit daxil: 120 AZN» + kiçik «ümumi: 1540»; klik → `entries`.

`GET /api/history` həmçinin `depositEntries` və `deposit_totals` siyahılarını qaytarır.

---

## UI tövsiyəsi

1. Müştəri formu: **Depozit** (AZN) + **Qeyd** (textarea)
2. Cədvəl sütunu: Depozit
3. Detal: qeyd + depozit + depozit tarixçəsi (`deposit_entries`)
4. Tarixçə səhifəsi: digər qutuların yanında **Depozit** kartı
5. Header/footer: istəyə görə `GET /deposit-totals` → «Ümumi depozit: …»

---

## `entry_type`

| Dəyər | Məna |
|-------|------|
| `create` | Yeni müştəri depoziti |
| `adjust` | Redaktə (artım və ya azalma) |
| `delete` | Müştəri silindi — cəmdən çıxarıldı |
