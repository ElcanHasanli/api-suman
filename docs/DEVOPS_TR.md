# SUMAN — DevOps Özeti (TR)

## Projenin amacı

**SUMAN**, su / damacana teslimatı yapan firmalar için **çok kiracılı (SaaS)** bir yönetim sistemidir. Platform sahibi yazılımı birden fazla şirkete satar; her şirket kendi müşteri, sipariş ve kurye verisiyle çalışır (veriler `company_id` ile ayrılır).

## Sistemde neler var?

| Parça | Açıklama | Domain (plan) |
|-------|----------|----------------|
| **Backend API** | Node.js + Express + PostgreSQL — tüm iş mantığı | `api.suman.khamsacraft.az` |
| **Owner paneli** | Şirket oluşturma, lisans kodu, kullanıcı yönetimi | `suman.khamsacraft.az` |
| **Admin paneli** | Müşteri, sipariş, tarihçe, Excel | `admin.suman.khamsacraft.az` |
| **Kurye paneli** | Sipariş teslimi, ödeme, bildirim (ileride APK) | `courier.suman.khamsacraft.az` |

- **4 ayrı frontend deploy** + **1 API** + **1 PostgreSQL veritabanı**
- Giriş: Admin ve kurye **lisans kodu** ile; owner lisans kodu kullanmaz
- API repo: `api-suman` (bu repo)

## Sunucu önerisi (MVP)

**Tek Linux sunucu** yeterli (başlangıç):

- **2 vCPU, 8 GB RAM, 80 GB SSD**, Ubuntu 22/24 LTS  
- Üzerinde: PostgreSQL, Node API (port 5001), Nginx (HTTPS + reverse proxy), static frontend build’leri  
- Tahmini: ~10–20 €/ay (VPS)

Büyüdükçe: API ve PostgreSQL ayrı sunuculara veya yönetilen DB’ye taşınabilir.

## DevOps için minimum

- HTTPS (Let’s Encrypt) — 4 subdomain  
- PostgreSQL yedekleme (günlük)  
- `JWT_SECRET`, DB şifreleri güvenli tutulmalı  
- API health: `GET /health`

Detaylı API: repo içi `README.md`
