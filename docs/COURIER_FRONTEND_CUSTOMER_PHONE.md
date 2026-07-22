# Kuryer — Müştəri telefonu və WhatsApp

Kuryer aktiv sifarişlərdə müştərinin telefonunu görür və WhatsApp ilə yaza bilər.

## API sahələri

`GET /api/orders`, `GET /api/orders/:id` cavabında:

| Sahə | Məna |
|------|------|
| `customer_phone` | Əsas telefon |
| `customer_phone2` | İkinci telefon (varsa) |
| `customer_display_name` | Ad Soyad |
| `customer_address` | Ünvan |
| `customer_deposit` | Depozit (AZN) — bax: `COURIER_FRONTEND_CUSTOMER_DEPOSIT.md` |
| `customer_notes` | Müştəri qeydi |
| `whatsapp_url` | `https://wa.me/994501234567` |
| `whatsapp_url_phone2` | İkinci nömrə üçün (varsa) |

## UI — Aktiv sifarişlər cədvəli

| Sütun | Mənbə |
|-------|--------|
| Müştəri | `customer_display_name` |
| Telefon | `customer_phone` |
| Ünvan | `address` və ya `customer_address` |
| ... | ... |

Telefon sütununu göstərin — kuryer zəng/mesaj üçün istifadə edəcək.

## UI — Sifariş detalı

Müştəri blokunda:
- Ad: `customer_display_name`
- Telefon: kliklənən link
- Depozit / qeyd: `customer_deposit`, `customer_notes`

```tsx
// React nümunəsi
<a href={order.whatsapp_url} target="_blank" rel="noopener noreferrer">
  {order.customer_phone}
</a>

{order.customer_phone2 && order.whatsapp_url_phone2 && (
  <a href={order.whatsapp_url_phone2} target="_blank" rel="noopener noreferrer">
    {order.customer_phone2}
  </a>
)}
```

Mobil brauzerdə / PWA-da `wa.me` linki WhatsApp tətbiqini açır.

## Özünüz link qurmaq (alternativ)

```typescript
import { normalizePhone } from '...'; // və ya backend whatsapp_url istifadə edin

function whatsAppHref(phone: string) {
  const n = phone.replace(/\D/g, '');
  const intl = n.startsWith('0') ? `994${n.slice(1)}` : n.startsWith('994') ? n : `994${n}`;
  return `https://wa.me/${intl}`;
}
```

**Tövsiyə:** backend-in `whatsapp_url` sahəsini istifadə edin — formatlaşdırma serverdədir.

## Deploy

Backend dəyişikliyi: `pm2 restart api-suman` (yalnız API yenilənəndə).
