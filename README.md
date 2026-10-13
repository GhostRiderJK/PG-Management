# PG Manager

A full-stack, cloud-deployable management system for a Paying Guest (PG) house. The owner manages rooms, tenants, rent approvals, complaints, notices and expenses. Tenants see their room, pay rent by uploading a UPI screenshot, download receipts and raise complaints.

## Features
**Owner (admin)**
- Dashboard: occupancy, rent collected vs expected, pending approvals, open complaints, 6-month income vs expense chart, overdue tenants
- Rooms by floor (AC / Non-AC, beds, rent, deposit) with a live bed-occupancy view
- Tenants: search, assign or vacate a room (bed limit enforced), edit contact details, deactivate or reactivate
- Rent payments: review the UPI screenshot, approve or reject with a note, dues report, CSV export
- Complaints: categories and priorities, status (open, in progress, resolved) and replies
- Notice board (pin important notices), expense tracker, activity log of logins and changes

**Tenant**
- Home screen with room, rent, this month's status and total dues
- Upload rent proof, track approval, view and print receipts
- Raise complaints and read the owner's reply, read notices, edit profile, change password

**Everyone:** dark mode, mobile-friendly layout.

## Tech stack
| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, hand-written CSS (no UI library) |
| Backend | Node.js, Express |
| Database | PostgreSQL via `pg` (parameterised SQL) |
| Auth | bcrypt, JWT in an httpOnly cookie, role-based access (ADMIN / TENANT) |
| Validation | zod |
| Tests | Node test runner, 15 API tests on an in-memory Postgres (`pg-mem`) |
| Cloud | AWS EC2 + Nginx + PM2, AWS RDS PostgreSQL, Let's Encrypt HTTPS (or Docker, Render, Railway) |

```
Browser --HTTPS--> Nginx --> Node/Express (API + React build) --> PostgreSQL
```

## Security measures
| Area | What is done | Where |
|---|---|---|
| Passwords | bcrypt, cost 12; policy of 8+ chars with upper, lower and digit | `routes/auth.js` |
| Brute force | Per-account lockout (5 wrong passwords = 15 min), plus IP rate limits (30 auth requests and 600 API requests per 15 min) | `routes/auth.js`, `app.js` |
| Session | JWT (8 h) in an **httpOnly, SameSite=Strict, Secure** cookie, so scripts cannot read it | `middleware/auth.js` |
| Live account checks | The database is checked on every request, so deactivating a user takes effect immediately | `middleware/auth.js` |
| CSRF | SameSite=Strict cookies **and** a required custom header on every state-changing request | `csrfGuard` |
| Access control | Role middleware on every route; tenants can only read their own payments, proofs and complaints | `requireRole`, route files |
| Injection | All SQL is parameterised; column names in updates come from a whitelist; zod validates every body | `util.js`, route files |
| XSS | React escapes output; strict Content-Security-Policy (`script-src 'self'`) via helmet | `app.js` |
| File uploads | JPG/PNG/WebP only, 2 MB max, **real file signature checked** (not just the MIME type), stored in the database and served only to the owner or the admin with `nosniff` and a locked-down CSP | `middleware/upload.js`, `routes/payments.js` |
| CSV export | Cells starting with `=`, `+`, `-` or `@` are neutralised (spreadsheet formula injection) | `routes/payments.js` |
| Transport | HTTPS (Let's Encrypt), HSTS, upgrade-insecure-requests in production | `app.js`, `DEPLOY.md` |
| Secrets | In environment variables, never in Git; the app refuses to start without a strong `JWT_SECRET` | `server.js`, `.env.example` |
| Privacy | Same error for unknown email and wrong password; same hashing time for both | `routes/auth.js` |
| Auditing | Logins, failures, lockouts and all admin actions are recorded with IP address | `audit_log` table, Activity page |
| Public sign-up | Can only create TENANT accounts; the admin is created from environment variables | `routes/auth.js`, `scripts/seed.js` |
| Cloud network | Database is private and reachable only from the web server's security group; SSH only from your IP; no secrets in the AMI | `DEPLOY.md` |
| Errors | The server never returns stack traces or SQL errors to the client | `app.js` |

## Run it

### Option 1: instant demo (no database to install)
Uses an in-memory database filled with sample data. Everything resets when you stop it.
```bash
npm run demo          # then open http://localhost:5000
```
Admin: `admin@pg.local` / `Admin@12345`. Tenant: `aarav@demo.com` / `Tenant@123`.

### Option 2: Docker
```bash
docker compose up --build        # http://localhost:5000
```

### Option 3: your own PostgreSQL (development)
```bash
cp backend/.env.example backend/.env       # fill in DATABASE_URL and JWT_SECRET
cd backend && npm install && npm run dev   # API on :5000 (tables + admin are created automatically)
cd ../frontend && npm install && npm run dev   # UI on :5173, proxies /api to :5000
npm --prefix backend run seed:demo         # optional: sample data
```

### Tests
```bash
npm test      # 15 API tests: auth, lockout, roles, uploads, approvals, dues, CSV, dashboards, deactivation
```

## Deploy to the cloud
See **[DEPLOY.md](DEPLOY.md)** for the AWS (EC2 + RDS) walkthrough and the Docker / Render fallbacks.

## Project structure
```
backend/
  src/app.js            Express app: security headers, rate limits, routes, static React build
  src/server.js         Starts the server, runs migrations, creates the admin
  src/schema.sql        Database tables
  src/middleware/       auth (cookie JWT, roles, CSRF), upload (image checks)
  src/routes/           auth, rooms, tenants, payments, complaints, notices, expenses, dashboard, audit
  scripts/              migrate, seed (+ demo data), in-memory demo server
  tests/api.test.js     API test suite
frontend/src/
  App.jsx, api.js, ui.jsx, styles.css
  pages/                Dashboard, Rooms, Tenants, Payments, Complaints, Notices, Expenses, Audit, Profile, Auth
deploy/nginx.conf, ecosystem.config.cjs, Dockerfile, docker-compose.yml, DEPLOY.md
```

## API summary
| Method and path | Who |
|---|---|
| `POST /api/auth/register`, `/login`, `/logout`; `GET /me`; `PATCH /profile`; `POST /change-password` | public / logged in |
| `GET /api/dashboard/admin`, `/tenant` | admin / tenant |
| `GET, POST, PUT, DELETE /api/rooms` | read: all; write: admin |
| `GET /api/tenants`, `PATCH /:id`, `PATCH /:id/room` | admin |
| `GET, POST /api/payments`, `PATCH /:id`, `GET /:id/proof`, `/:id/receipt`, `/dues`, `/export.csv` | tenant submits, admin reviews |
| `GET, POST /api/complaints`, `PATCH /:id` | tenant raises, admin updates |
| `GET, POST, DELETE /api/notices`; `GET, POST, DELETE /api/expenses`; `GET /api/audit` | read notices: all; the rest admin |

## Known limits
- Payment screenshots are checked by the owner by eye; there is no automatic UPI verification.
- No email or SMS reminders; dues are shown inside the app.
- Rent is due by the 5th of each month (`DUE_DAY` in `backend/src/util.js`).
