# SUMAN — Köhnə serverdən yeni serverə köçürmə

Köhnə EC2 dayandırılır; bütün xidmətlər **Contabo** VPS-ə köçürülür.

| | Köhnə (AWS) | Yeni (Contabo) |
|---|-------------|----------------|
| **IP** | `13.50.56.161` | **`109.123.241.102`** |
| **SSH** | `ubuntu@13.50.56.161` | `root@109.123.241.102` və ya `ubuntu@...` (Contabo-da yoxlayın) |
| **Key** | `khamsa-suman-key.pem` | Contabo-da təyin etdiyiniz key / root parol |

**Komponentlər:**
- PostgreSQL (`suman` DB)
- Backend API (`~/api-suman`, pm2: `api-suman`, port 5001)
- Admin panel (`~/admin-suman`)
- Kuryer panel (`~/courier-suman`)
- Owner panel (`~/suman` və ya oxşar — yoxlayın)
- Nginx + Let's Encrypt
- DNS: `api.`, `admin.`, `courier.`, `suman.` → `*.khamsacraft.az`

---

## 0. Hazırlıq (köçürmədən 24 saat əvvəl)

1. **DNS TTL** azaldın (məs. 300 saniyə) — `khamsacraft.az` zone.
2. Yeni serverin **public IP**: `109.123.241.102` (Contabo)
3. Contabo panelindən SSH: root parol və ya əlavə etdiyiniz SSH key
4. İstifadəçilərə qısa downtime xəbəri (15–60 dəq).

---

## 1. Köhnə server — backup

SSH köhnə: `ssh -i ~/Downloads/khamsa-suman-key.pem ubuntu@13.50.56.161`

```bash
# 1) PostgreSQL dump
pg_dump -U postgres -Fc suman > ~/suman-backup-$(date +%Y%m%d).dump
# və ya plain SQL:
pg_dump -U postgres suman > ~/suman-backup-$(date +%Y%m%d).sql

# 2) .env faylları
tar czf ~/suman-env-backup.tar.gz \
  ~/api-suman/.env \
  ~/admin-suman/.env* \
  ~/courier-suman/.env* \
  2>/dev/null
# owner panel varsa onu da əlavə edin

# 3) Nginx konfiqurasiya
sudo tar czf ~/nginx-backup.tar.gz /etc/nginx/sites-available /etc/nginx/sites-enabled

# 4) pm2
pm2 save
cp ~/.pm2/dump.pm2 ~/pm2-dump.pm2 2>/dev/null || true

# 5) Backup-ları Mac-ə endirin
# Mac-dən:
scp -i ~/Downloads/khamsa-suman-key.pem ubuntu@13.50.56.161:~/suman-backup-*.dump ~/Downloads/
scp -i ~/Downloads/khamsa-suman-key.pem ubuntu@13.50.56.161:~/suman-env-backup.tar.gz ~/Downloads/
scp -i ~/Downloads/khamsa-suman-key.pem ubuntu@13.50.56.161:~/nginx-backup.tar.gz ~/Downloads/
```

---

## 2. Köhnə server — dayandırma

```bash
pm2 stop all
# və ya tək-tək:
pm2 stop api-suman
# frontend pm2 varsa onları da

sudo systemctl stop nginx   # DNS dəyişənə qədər optional
```

**Köhnə serveri tam silməyin** — yeni server işləyənə qədər backup saxlayın.

---

## 3. Yeni server (Contabo) — əsas quraşdırma

SSH: `ssh root@109.123.241.102` (və ya Contabo-da göstərilən istifadəçi)

Ubuntu 22.04/24.04:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl nginx postgresql postgresql-contrib certbot python3-certbot-nginx

# Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

sudo npm install -g pm2

# PostgreSQL
sudo -u postgres createuser -s ubuntu 2>/dev/null || true
sudo -u postgres createdb suman -O ubuntu 2>/dev/null || true
```

---

## 4. Yeni server — DB bərpa

Mac-dən backup yükləyin:

```bash
scp ~/Downloads/suman-backup-YYYYMMDD.dump root@109.123.241.102:~/
scp ~/Downloads/suman-env-backup.tar.gz root@109.123.241.102:~/
scp ~/Downloads/nginx-backup.tar.gz root@109.123.241.102:~/
```

Yeni serverdə (`109.123.241.102`):

```bash
# Custom format:
pg_restore -U postgres -d suman --clean --if-exists ~/suman-backup-YYYYMMDD.dump

# Plain SQL:
# psql -U postgres -d suman < ~/suman-backup-YYYYMMDD.sql
```

Yoxlama:

```bash
psql -U postgres -d suman -c "SELECT id, name FROM companies;"
psql -U postgres -d suman -c "SELECT count(*) FROM customers;"
```

---

## 5. Yeni server — repolar

```bash
cd ~
git clone <api-suman-repo-url> api-suman
git clone <admin-suman-repo-url> admin-suman
git clone <courier-suman-repo-url> courier-suman
# owner repo varsa:
# git clone ... suman-owner
```

`.env` fayllarını köhnə backup-dan bərpa edin:

```bash
tar xzf ~/suman-env-backup.tar.gz -C /
# və ya manual: cp köhnə .env → yeni ~/api-suman/.env
```

**Vacib:** `JWT_SECRET` eyni qalsın — istifadəçilər yenidən login etməsin deyə.  
`DB_HOST=localhost` yoxlayın.

Backend:

```bash
cd ~/api-suman
npm install
pm2 start server.js --name api-suman
pm2 save
pm2 startup   # sistem açılışında avtomatik
```

Frontend (hər biri):

```bash
cd ~/admin-suman && npm install && npm run build
cd ~/courier-suman && npm install && npm run build
# owner eyni
```

Build xətası olarsa — əvvəl frontend fix, sonra build.

---

## 6. Nginx + HTTPS

Köhnə nginx backup-dan kopyalayın və ya nümunə:

```nginx
# /etc/nginx/sites-available/api.suman.khamsacraft.az
server {
    listen 80;
    server_name api.suman.khamsacraft.az;
    location / {
        proxy_pass http://127.0.0.1:5001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# admin / courier — static Next.js out (path layihəyə görə):
# root /home/ubuntu/admin-suman/out;
# və ya proxy_pass http://127.0.0.1:3000;
```

```bash
sudo ln -sf /etc/nginx/sites-available/api.suman.khamsacraft.az /etc/nginx/sites-enabled/
# digər subdomainlər eyni
sudo nginx -t && sudo systemctl reload nginx

sudo certbot --nginx -d api.suman.khamsacraft.az \
  -d admin.suman.khamsacraft.az \
  -d courier.suman.khamsacraft.az \
  -d suman.khamsacraft.az
```

---

## 7. DNS dəyişikliyi

`khamsacraft.az` DNS panelində A record-ları **`109.123.241.102`**-yə yönəldin:

| Host | Tip | Köhnə | Yeni |
|------|-----|-------|------|
| api.suman | A | 13.50.56.161 | **109.123.241.102** |
| admin.suman | A | 13.50.56.161 | **109.123.241.102** |
| courier.suman | A | 13.50.56.161 | **109.123.241.102** |
| suman | A | 13.50.56.161 | **109.123.241.102** |

Yayılma: TTL-dən asılı (5–30 dəq).

---

## 8. Yoxlama (checklist)

- [ ] `curl https://api.suman.khamsacraft.az/health` → `{"status":"ok"}`
- [ ] Admin login (lisenziya + email + şifrə)
- [ ] Kuryer login
- [ ] Owner login
- [ ] Müştərilər siyahısı (~400)
- [ ] Sifariş yaradıb tamamlamaq
- [ ] Push (FCM) — `FIREBASE_SERVICE_ACCOUNT_JSON` `.env`-də var?
- [ ] WhatsApp import lazımdırsa: faylları `scp` + `npm run import:whatsapp`

---

## 9. Köhnə server — söndürmə

Yeni server 24–48 saat problemsiz işləyəndən sonra:

```bash
# köhnə serverdə
pm2 delete all
sudo systemctl stop nginx postgresql
```

AWS-də instance **stop** və ya **terminate** (backup dump saxlanılsın).

---

## Tez əmr xülasəsi

| Harada | Əmr |
|--------|-----|
| Köhnə | `pg_dump`, `.env` backup, `pm2 stop all` |
| Mac | `scp` backup → yeni server |
| Yeni | PostgreSQL restore, `git clone`, `.env`, `npm install`, `pm2 start`, `npm run build`, nginx, certbot |
| DNS | A record → **109.123.241.102** |
| Test | `/health`, login, müştəri sayı |

---

## Problemlər

| Problem | Həll |
|---------|------|
| 502 Bad Gateway | `pm2 status`, API 5001 dinləyir? |
| Login işləmir | `JWT_SECRET` eynidirmi? DB-də users var? |
| Boş müştərilər | DB restore uğursuz — dump yenidən |
| SSL xətası | certbot yenidən; DNS `109.123.241.102`-yə işarə edir? |

---

## Contabo xüsusi qeydlər

1. **Firewall** — Contabo panel və ya `ufw`: port **22**, **80**, **443** açıq olsun.
2. **SSH istifadəçi** — bəzən `root`, bəzən `ubuntu`; Contabo VPS detail-dən yoxlayın.
3. **PostgreSQL** — Contabo-da default olmaya bilər; `apt install postgresql` ilə quraşdırın.
4. Köhnə AWS `.pem` Contabo-da işləməyə bilər — Contabo root parol və ya yeni SSH key istifadə edin.
5. DNS dəyişməmişkən test: `curl -H "Host: api.suman.khamsacraft.az" http://109.123.241.102/health`
| CORS | `api-suman/.env` → `CORS_ORIGIN` subdomainlər |
