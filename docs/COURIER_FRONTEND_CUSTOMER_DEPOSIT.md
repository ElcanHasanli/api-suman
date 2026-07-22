# Kuryer — Müştəri depoziti və qeyd

Kuryer sifarişdə müştərinin **depozitini** və **qeydini** görür (yalnız oxumaq).

**Auth:** kuryer token  
**Yazmaq yoxdur** — depozit/qeyd yalnız admin dəyişir.

---

## API sahələri

`GET /api/orders`, `GET /api/orders/:id` (və digər sifariş siyahıları):

| Sahə | Məna |
|------|------|
| `customer_deposit` | Müştəri depoziti (AZN), yoxdursa `0` |
| `customer_notes` | Müştərinin daimi qeydi; yoxdursa `null` |
| `customer_debt` | Köhnə borc (əvvəlki kimi) |
| `active_bidons` | Aktiv bidon |

Nümunə:

```json
{
  "id": 395,
  "customer_display_name": "Azer Huseynov",
  "customer_phone": "050 553 18 68",
  "customer_debt": 6,
  "customer_deposit": 20,
  "customer_notes": "Girişdə 2 bidon — depozit 20",
  "active_bidons": 2
}
```

`customer_notes` ≠ sifariş `notes` / `order_notes` — bu müştərinin öz qeydidir.

İstəyə görə detal: `GET /api/customers/:id` → `customer.deposit`, `customer.notes` (kuryer oxuya bilər).

---

## UI

Sifariş kartı / detal — müştəri blokunda:

1. Borc (əgər `customer_debt > 0`)
2. **Depozit:** `customer_deposit` AZN
3. **Qeyd:** `customer_notes` (boşdursa gizlət)

Tamamlama formasında dəyişdirmə sahəsi **əlavə etməyin**.
