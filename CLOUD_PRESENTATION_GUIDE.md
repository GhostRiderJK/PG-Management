# PG Manager — CI/CD Pipeline & Faculty Presentation Guide

Cloud Computing presentation companion for `PG-Manager_Cloud_Presentation.pptx`.
Part 1 is the CI/CD pipeline (with a ready-to-use GitHub Actions workflow). Part 2 is
everything to say to the faculty, slide by slide, plus the full expected-question bank.

---

## Part 1 — CI/CD Pipeline

### 1.1 Pipeline at a glance

```
 push / PR            main branch only                    on approval (manual gate)
┌──────────┐   ┌──────────────────────────┐   ┌───────────────────────────────┐
│  CI      │   │  BUILD & PACKAGE         │   │  CD — DEPLOY TO AWS           │
│  test    │──▶│  vite build (frontend)   │──▶│  SSH to EC2: git pull         │
│  (15 API │   │  docker build (image)    │   │  npm run build                │
│  tests on│   │  docker push → GHCR      │   │  pm2 restart pg-manager       │
│  pg-mem) │   │  (tagged = commit SHA)   │   │  curl /api/health  ← gate     │
└──────────┘   └──────────────────────────┘   └───────────────────────────────┘
                                                      │
                                        failure → automatic rollback:
                                        pm2 restart previous release
```

**Trigger:** every `push` and every Pull Request targeting `main`.
**Runner:** `ubuntu-latest` (GitHub-hosted — itself an example of cloud compute).
**Deploy target:** the AWS EC2 instance from DEPLOY.md; the RDS database is never
touched by the deployer except through the app's own startup migrations.

### 1.2 The five stages explained

| # | Stage | What runs | Why it matters (say this to faculty) |
|---|---|---|---|
| 1 | **Checkout + cache** | `actions/checkout`, `actions/setup-node@v4` with npm cache | Cuts CI time; caching dependencies is standard practice |
| 2 | **Test (CI gate)** | `npm ci` then `npm test` — 15 API tests against **pg-mem** (in-memory PostgreSQL) | Tests run in seconds with **no database server needed** — the same SQL, migrations and role logic execute against a real Postgres emulator |
| 3 | **Build** | `npm run build` — Vite compiles the React app to static files; backend deps installed | Proves the artifact that ships is the artifact that was tested |
| 4 | **Package (Docker)** | `docker build` + push image to **GitHub Container Registry (GHCR)**, tagged with the commit SHA | Immutable, versioned artifact — one image = one release, environment-parity from laptop to cloud |
| 5 | **Deploy (CD)** | Manual approval gate → SSH to EC2 → pull the GHCR image → `docker run` (or `git pull && npm run build && pm2 restart` for the classic path) → **health check** | Deployment is *reviewed, not blind*; the health gate makes a bad deploy visible immediately |

### 1.3 Ready-to-use workflow file

Save as `.github/workflows/ci-cd.yml`:

```yaml
name: CI/CD — PG Manager

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    name: Test & Build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm test                 # 15 API tests on pg-mem (no DB server needed)
      - run: npm run build            # Vite production bundle

  docker:
    name: Package image
    needs: ci
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions:
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          push: true
          tags: ghcr.io/${{ github.repository }}:${{ github.sha }}

  deploy:
    name: Deploy to AWS EC2
    needs: docker
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment:
      name: production        # ← manual approval gate configured in repo settings
    steps:
      - name: SSH deploy
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ${{ secrets.EC2_USER }}
          key: ${{ secrets.EC2_SSH_KEY }}
          script: |
            cd /home/ubuntu/pg-manager
            git pull
            npm run build
            pm2 restart pg-manager --update-env
            sleep 3
            curl -f localhost:5000/api/health   # -f = fail the step on HTTP error
```

### 1.4 Secrets the pipeline needs (Settings → Secrets and variables)

| Secret | Purpose |
|---|---|
| `EC2_HOST` | Public DNS/IP of the EC2 instance |
| `EC2_USER` | SSH user (`ubuntu`) |
| `EC2_SSH_KEY` | Private key, **restricted to the GitHub deployer only** |

The app's own secrets (`DATABASE_URL`, `JWT_SECRET`) live **only** in `backend/.env`
on the server (chmod 600) — the pipeline never sees or writes them. This is the
clean separation faculty usually ask about: *CI/CD credentials ≠ application credentials.*

### 1.5 Rollback & safety story

- Every release is a **commit-SHA-tagged Docker image** in GHCR → rollback = redeploy the previous tag.
- The deploy job ends with `curl -f /api/health`; a non-200 fails the run and stops promotion.
- PM2's `max_memory_restart: 300M` guards the runtime between deploys.
- Database migrations run **forward-only and additive** at app start, so an older
  release can still boot against the current schema — the safety property that makes
  instant rollback possible.
- The `production` **environment gate** means a human approves the deploy — continuous
  delivery, not unattended deployment. (Good line if asked "do you trust the robot?")

### 1.6 Honest limitations (state them before she finds them)

- No automated staging environment yet — the gate is the manual approval.
- No load-test / E2E-browser stage; the 15 tests are API-level.
- Single-instance deploy; blue/green with an ALB is the documented next step.

---

## Part 2 — Everything to tell the faculty

### 2.1 30-second opening pitch (memorize this)

> "PG Manager is a cloud-deployed management system for a Paying Guest house. The owner
> manages rooms, approves rent payments, complaints, notices and expenses; tenants pay
> rent by uploading a UPI screenshot and download receipts. It's a React + Node +
> PostgreSQL full-stack app — and the cloud part is real: it runs on an AWS EC2 virtual
> server with Nginx and free HTTPS, with its database on AWS RDS, private by default —
> entirely on the free tier, at zero cost."

### 2.2 Slide-by-slide talk track (5 minutes)

| Slide | Time | Core sentence |
|---|---|---|
| 1 Cover | 0:00–0:30 | Opening pitch above. |
| 2 What it does | 0:30–1:05 | Two roles, one secure system; the code itself is cloud-agnostic — deployment makes it a cloud app. |
| 3 Architecture | 1:05–1:45 | Walk the diagram: Browser → HTTPS → Nginx → Node :5000 → private RDS. Key line: *"The database has no public address at all."* |
| 4 Service map | 1:45–2:25 | EC2 = IaaS, RDS = managed DB (PaaS-style), Nginx+Let's Encrypt = free TLS, security groups = virtual firewalls. This is the cloud-theory slide — slow down here. |
| 5 Security | 2:25–3:00 | Numbers not adjectives: bcrypt cost 12, 5 wrong tries → 15-min lockout, 8 h httpOnly JWT, 15 automated tests. |
| 6 CI/CD + deploy | 3:00–3:40 | "Push to GitHub → tests run on an in-memory Postgres → Docker image tagged with the commit SHA → human-approved deploy over SSH → health check gates it." If time is short, present only stages 2→5 from Part 1. |
| 7 Docker & scaling | 3:40–4:20 | Same app in one `docker compose up`; scaling story: vertical first, then horizontal because sessions are stateless. |
| 8 Close | 4:20–5:00 | "Production-shaped, secure, multi-user — on real cloud infrastructure, for ₹0." Offer the live demo. |

### 2.3 Question bank — what she can ask, and the answer

#### Cloud fundamentals
| Q | A |
|---|---|
| What is cloud computing? | On-demand delivery of compute/database/storage over the internet, pay-as-you-go, instead of owning physical servers. This project uses it for compute (EC2), database (RDS) and CI runners (GitHub-hosted). |
| IaaS vs PaaS vs SaaS? | IaaS = raw virtual hardware (EC2: I manage OS+everything above). PaaS = managed platform (RDS: I don't patch Postgres; GHCR: I don't run a registry). SaaS = finished software over browser — PG Manager itself is SaaS *for the owner and tenants*. |
| Public / private / hybrid? | Public cloud (AWS shared infrastructure). Nothing here is private cloud; the RDS instance is *private by network config* but still public cloud — don't confuse the two. |
| What's the elastic benefit here? | Instance and DB class can change in minutes; free tier absorbed zero cost at demo scale; a real 200-tenant spike = bigger instance, no re-architecture. |
| Regions/AZ? | Kept everything in one region (same-AZ EC2→RDS = free data transfer + low latency). Multi-AZ standby is the documented HA upgrade. |

#### Architecture
| Q | A |
|---|---|
| Why separate DB from the app server? | Independent scaling and backups; DB survives server replacement; RDS automates patching/failover; blast radius of a web compromise shrinks (no localhost DB to poke). |
| Why a reverse proxy instead of exposing Node? | TLS termination in one place, static-file hardening, rate limiting at edge, Node stays on localhost — nothing but 80/443 is exposed. |
| Why one process serving API + frontend? | Fewer moving parts on a 1 vCPU free-tier box; Vite output is just static files Express can serve; splitting would burn another process/port for zero benefit at this scale. |
| Why PostgreSQL, not MySQL/MongoDB? | Relational data with real constraints (tenants↔rooms↔payments), need for BYTEA, transactions, and RDS free-tier support. JSON column types cover the few semi-structured bits. |
| Where are uploaded files stored? | As BYTEA in Postgres, streamed back only to the owner/admin with `nosniff` + locked CSP. At scale they'd move to S3 — that's the first storage-growth change. |

#### Networking & security
| Q | A |
|---|---|
| What is a security group? | Stateless-config, stateful-traffic virtual firewall at instance level. `pg-web-sg`: 22 from my IP only, 80/443 open. `pg-db-sg`: 5432 **from pg-web-sg by group reference**, never an IP range. |
| How does HTTPS work here? | Nginx gets a free Let's Encrypt cert via certbot (auto-renew), terminates TLS, proxies plain HTTP to localhost:5000, HSTS forces HTTPS afterwards. |
| Why JWT in httpOnly cookie instead of localStorage? | localStorage is readable by any XSS payload; httpOnly+SameSite=Strict means only the browser sends it, scripts can't read it. 8 h expiry + live DB account check on every request. |
| CSRF — why a custom header? | Browsers attach cookies automatically; requiring an `X-Requested-With` header (which cross-site forms can't set, and CORS blocks) plus SameSite=Strict gives double protection. |
| SQL injection? | Impossible-by-convention: every query is parameterised via `pg`; dynamic column names come from a whitelist; zod validates every body at the boundary. |
| Brute force? | Two layers: per-account lockout (5 failures → 15 min) and per-IP rate limits (30 auth / 600 API per 15 min). |

#### CI/CD (Part 1 is your source)
| Q | A |
|---|---|
| Difference between CI and CD? | CI = automatically build+test every commit (stages 1–3). CD = automatically ship tested artifacts; here it's **continuous delivery** — deploy is one-button but human-approved, not fully automatic. |
| Why test on pg-mem? | Real SQL semantics (it emulates Postgres) with zero infrastructure — tests finish in seconds inside the CI runner. |
| What gets deployed? | A commit-SHA-tagged Docker image in GHCR; the deploy step pins that exact image, so what passed CI is byte-identical to what runs. |
| How do you avoid downtime? | `pm2 restart` is a ~1 s blip at this scale; the real answer is blue/green behind an ALB once there are two instances — designed, not needed yet. |
| How do you roll back? | Redeploy previous GHCR tag / previous commit; migrations are forward-only and additive so old code still boots on the new schema. |
| Where do secrets live? | App secrets: `backend/.env` on the server only (chmod 600, never in git, never in the image). Pipeline secrets: GitHub Actions encrypted secrets. The two sets never mix. |
| What if CI passes but prod breaks? | Health-check gate at the end of deploy fails the run → approval record + instant rollback path. |

#### Deployment & operations
| Q | A |
|---|---|
| Why PM2? | Process supervisor: auto-restart on crash, `pm2 startup` re-launches after reboot, memory guard restarts at 300 MB. Without it, one OOM = dead site. |
| Why DuckDNS? | Free domain so certbot can issue a real Let's Encrypt cert (LE needs a hostname, not a bare IP). |
| Cost? | ₹0/month on the 12-month free tier: t3.micro EC2 + db.t3.micro RDS + 30 GB storage. First real cost appears only when leaving the free tier. |
| Backups? | RDS automated daily snapshots with point-in-time recovery; retention configured on the DB, not on my code. |
| Monitoring? | Honest answer: `/api/health` + PM2 logs + the app's own audit_log table. CloudWatch alarms are the next step. |
| What breaks first? | The single EC2 instance — which is exactly why the app is stateless (JWT, no server sessions) so a second instance behind a load balancer is a config change, not a rewrite. |

#### If she asks for a live demo
1. Open `https://<your-domain>/api/health` → `{"ok":true}`.
2. Log in as admin → dashboard with occupancy + income/expense chart.
3. Open a private window → register a tenant → upload a payment screenshot.
4. Back as admin → Payments → view proof → approve → show the receipt.
5. Show the GitHub Actions run going green → point at the deploy job.
6. (Backup) `npm run demo` locally works with zero cloud dependency — mention that as
   proof the pipeline artifact runs anywhere.

### 2.4 Facts to never get caught wrong

- Stack: React 18 + Vite · Node/Express · PostgreSQL 16 via `pg` · zod · bcrypt (cost 12) · JWT 8 h httpOnly SameSite=Strict cookie.
- Tests: **15** API tests, run with Node's built-in test runner on **pg-mem**.
- Infra: EC2 **t3.micro**, Ubuntu 24.04, Node 20, Nginx, PM2, RDS Postgres **public access = No**, DuckDNS domain, certbot.
- Lockout: 5 wrong passwords → 15 minutes. Rate limits: 30 auth / 600 API per 15 min per IP.
- Rent due day: 5th of each month (`DUE_DAY` in `backend/src/util.js`).
- Uploads: JPG/PNG/WebP, 2 MB max, magic-byte signature check, stored as BYTEA in DB.
- The app refuses to start without a strong `JWT_SECRET` — enforced in `server.js`.
