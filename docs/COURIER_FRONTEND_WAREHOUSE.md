# Kuryer — Su doldurma anbarı (yeni)

Backend hazırdır. Su doldurma məntəqəsində əvvəl WhatsApp ilə yazdığınız mesajı indi tətbiqdə form ilə göndərin.

## Ekran: «Su doldurma»

Form sahələri:

| Sahə | Label (tövsiyə) | Nümunə |
|------|-----------------|--------|
| `empty_in` | Anbara boş | 8 |
| `full_in` | Anbara dolu | 23 |
| `full_out` | Anbardan götürülən dolu | 7 |
| `exit_full` | Maşında dolu (opsional) | 30 |
| `remaining_full` | **Anbarda qalan dolu** * | 17 |
| `remaining_empty` | Anbarda qalan boş (opsional) | 8 |
| `notes` | Qeyd | |

\* `remaining_full` mütləqdir.

## API

**Göndərmək:**
```http
POST /api/warehouse/update
Authorization: Bearer <courier_token>
```

**Cari vəziyyət (formu doldurmadan əvvəl göstərmək üçün):**
```http
GET /api/warehouse/summary
```

Cavabda `warehouse.full_count` / `empty_count` — indiki anbar; `customers.total_active_bidons` — müştərilərdə cəmi aktiv bidon.

**Öz tarixçəniz:**
```http
GET /api/warehouse/updates?period=week
```

## UX

- Submit sonrası uğur mesajı + `calculation.mismatch` true olarsa xəbərdarlıq: «Hesablanan dolu ilə «yerdə qaldı» uyğun gəlmir»
- Admin paneldə eyni rəqəmlər dərhal yenilənir (push da gedir)

Ətraflı: `docs/WAREHOUSE.md`
