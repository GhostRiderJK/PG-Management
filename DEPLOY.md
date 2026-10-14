# Deploying to AWS (EC2 + RDS)

One Node process serves the API and the React app, Nginx sits in front for HTTPS, and PostgreSQL runs on a private RDS instance.

```
Browser --HTTPS--> Nginx (EC2) --> Node/Express :5000 --> RDS PostgreSQL (private)
```

You need: an AWS account (free tier is enough) and a free domain from https://www.duckdns.org (for HTTPS), e.g. `mypg.duckdns.org`.

## 1. Security groups (create first)
| Group | Inbound rules |
|---|---|
| `pg-web-sg` (for EC2) | 22 from **My IP only**; 80 and 443 from anywhere |
| `pg-db-sg` (for RDS)  | 5432 from **`pg-web-sg` only** (pick the group, not an IP range) |

## 2. Database: RDS PostgreSQL
1. RDS > Create database > PostgreSQL > **Free tier** template.
2. DB name `pgmanager`, user `postgres`, a strong master password.
3. **Public access: No.** VPC security group: `pg-db-sg`. Keep encryption on.
4. Copy the endpoint. Your connection string:
   `postgresql://postgres:YOUR_PASSWORD@YOUR-ENDPOINT:5432/pgmanager`
   (RDS enforces SSL on new PostgreSQL versions, so you will also set `DB_SSL=true`.)

## 3. Server: EC2
1. Launch instance: Ubuntu 24.04, `t3.micro`, new key pair, security group `pg-web-sg`.
2. In DuckDNS, point your subdomain to the instance's public IP.
3. SSH in and install:
```bash
sudo apt update && sudo apt install -y nginx git certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs
sudo npm install -g pm2
```

## 4. App
```bash
git clone https://github.com/YOUR_USER/pg-manager.git && cd pg-manager
cp backend/.env.example backend/.env
nano backend/.env
```
Set these in `backend/.env`:
```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@YOUR-ENDPOINT:5432/pgmanager
DB_SSL=true
NODE_ENV=production
JWT_SECRET=<paste output of: openssl rand -hex 32>
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=<a strong password>
```
Then:
```bash
chmod 600 backend/.env
npm run build                      # builds the React app and installs backend packages
pm2 start ecosystem.config.cjs && pm2 save
pm2 startup                        # run the command it prints so the app survives reboots
curl localhost:5000/api/health     # -> {"ok":true}
```
The tables and the admin account are created automatically on first start.

**Optional, for your evaluation demo:** add sample rooms, tenants, payments and complaints:
```bash
npm --prefix backend run seed:demo
```
Demo tenants (for example `aarav@demo.com`) use the password `Tenant@123`. Remove the demo users or do not use this on a real PG.

## 5. Nginx and HTTPS
```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/pgmanager
sudo sed -i 's/YOUR_DOMAIN/mypg.duckdns.org/' /etc/nginx/sites-available/pgmanager
sudo ln -s /etc/nginx/sites-available/pgmanager /etc/nginx/sites-enabled/ && sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d mypg.duckdns.org
```

## 6. Check it
- `https://YOUR_DOMAIN/api/health` returns `{"ok":true}`
- Open `https://YOUR_DOMAIN`, log in as the admin
- Register a tenant in a private window, assign a room, upload a payment screenshot, approve it, print the receipt

## Updating after a change
```bash
cd ~/pg-manager && git pull && npm run build && pm2 restart pg-manager
```

---

## Fallback A: Docker (any VM)
```bash
docker compose up --build        # http://localhost:5000, Postgres included
```

## Fallback B: Render or Railway (no server to manage)
Create a **Web Service** from your GitHub repo and a **PostgreSQL** database, then set:
- Build command: `npm run build`
- Start command: `npm start`
- Environment: `DATABASE_URL` (from the database), `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `NODE_ENV=production`
Platforms terminate HTTPS for you. Payment screenshots are stored in the database, so they survive redeploys. Check each platform's current free-tier limits before relying on it for the demo.

## Troubleshooting
| Symptom | Fix |
|---|---|
| Login works but you are logged out on every request | You are on plain `http` with `NODE_ENV=production`. Use HTTPS, or set `COOKIE_SECURE=false` for testing only |
| `no pg_hba.conf entry` / SSL error | Set `DB_SSL=true` |
| Connection times out to RDS | `pg-db-sg` must allow 5432 from `pg-web-sg` |
| 502 Bad Gateway | `pm2 logs pg-manager` |
