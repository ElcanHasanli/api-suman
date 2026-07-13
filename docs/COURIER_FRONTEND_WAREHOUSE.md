# Kuryer — Su doldurma anbarı

İki məntəqə: **Novxanı** və **Azadlıq**. Sizin default anbarınız login-də gəlir; formda dəyişmək olar.

## Forma (yalnız 3 sahə)

| Sahə | Label | Nümunə |
|------|-------|--------|
| `entry_full` | Neçə dolu ilə girdiniz | 10 |
| `entry_empty` | Neçə boş ilə girdiniz | 5 |
| `exit_full` | Neçə dolu ilə çıxdınız | 20 |
| Anbar seçimi | Default / Novxanı / Azadlıq | |

Hesablama (backend): **götürülən dolu** = `exit_full − entry_full` → nümunədə **10**.

## API

```http
POST /api/warehouse/update
Authorization: Bearer <courier_token>
```

```json
{
  "warehouse_code": "novxani",
  "entry_full": 10,
  "entry_empty": 5,
  "exit_full": 20
}
```

- `warehouse_code` / `warehouse_id` göndərilməsə → sizin **default** anbar
- `exit_full` < `entry_full` olarsa xəta: `EXIT_LESS_THAN_ENTRY`

### Cari vəziyyət

```http
GET /api/warehouse/summary
```

- `warehouses` — hər iki anbar
- `default_warehouse` — sizin default

### Öz tarixçəniz

```http
GET /api/warehouse/updates?period=week
```

## UX

1. Anbar seçimi (default seçili)
2. 3 rəqəm: dolu girdi / boş girdi / dolu çıxdı
3. Submit öncəsi göstərin: «Götürüləcək dolu: X»
4. Login / `GET /api/auth/me` → `user.default_warehouse`

Ətraflı: `docs/WAREHOUSE.md`
