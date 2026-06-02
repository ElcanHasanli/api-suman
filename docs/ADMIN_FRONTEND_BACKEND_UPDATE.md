# Admin backend yeniləmələri (frontend uyğunluğu)

## 1. Şirkət xərci (kuryer olmadan)

```http
POST /api/expenses
Authorization: Bearer <admin>
```

```json
{
  "amount": 350,
  "description": "Yanacaq — mart",
  "category": "fuel",
  "source": "admin"
}
```

- `courier_id` **lazım deyil** (`source: "admin"`).
- `category`: `payroll` | `fuel` | `rent` | `supplies` | `equipment` | `other`
- Cavab: `source: "admin"`, `courier_name: "Admin"` (və ya null)

Kuryer adına xərc: `{ "source": "courier", "courier_id": 5, ... }`

## 2. Tarixçə

`GET /api/history?period=custom&startDate=2026-03-01&endDate=2026-03-31`

`period`:
- `today` — bu gün (Asia/Baku)
- `yesterday` — dünən
- `custom` — `startDate`, `endDate` (YYYY-MM-DD, daxil)

`summary.totalExpenses` — kuryer + admin xərcləri  
`summary.netRevenue` — ümumi gəlir − xərclər  
`expenses[]` — hər iki mənbə (`source`: `courier` | `admin`)

## 3. Anbar tarixçəsi

`GET /api/warehouse/updates?period=yesterday|today|custom&startDate=&endDate=`

Eyni period məntiqi (Baku timezone).

## 4. Push

`POST /api/devices/register` — `platform: "ios"` | `"android"`, `app: "admin"`

## Deploy

```bash
npm run db:migrate:expense-source
pm2 restart all
```
