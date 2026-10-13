process.env.USE_PG_MEM = "1";
process.env.JWT_SECRET = "test-secret-test-secret-test-secret";
process.env.ADMIN_EMAIL = "admin@test.com";
process.env.ADMIN_PASSWORD = "Admin@12345";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createApp } = require("../src/app");
const { migrate } = require("../src/db");
const { ensureAdmin, demoPng } = require("../scripts/seed");

let base, server;

/** tiny client with its own cookie jar */
function client() {
  let cookie = "";
  const call = async (method, path, body, extra = {}) => {
    const headers = { "X-Requested-With": "pg-manager", ...(cookie ? { Cookie: cookie } : {}), ...extra };
    let payload = body;
    if (body && !(body instanceof FormData)) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
    const res = await fetch(base + path, { method, headers, body: payload });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const type = res.headers.get("content-type") || "";
    const data = type.includes("json") ? await res.json().catch(() => null) : await res.text();
    return { status: res.status, data, headers: res.headers };
  };
  return { get: (p) => call("GET", p), post: (p, b) => call("POST", p, b), patch: (p, b) => call("PATCH", p, b), put: (p, b) => call("PUT", p, b), del: (p) => call("DELETE", p), raw: call };
}

const admin = client(), tenant = client(), tenant2 = client();
let roomId, tenantId, paymentId;
const month = new Date().toISOString().slice(0, 7);

test.before(async () => {
  await migrate(); await ensureAdmin();
  server = createApp().listen(0);
  base = `http://localhost:${server.address().port}`;
});
test.after(() => server.close());

function proofForm(m = month, amount = 5500, buf = demoPng(), type = "image/png", name = "p.png") {
  const fd = new FormData();
  fd.append("month", m); fd.append("amount", String(amount));
  fd.append("proof", new Blob([buf], { type }), name);
  return fd;
}

test("security: blocks requests without auth and without CSRF header", async () => {
  const anon = client();
  assert.equal((await anon.get("/api/rooms")).status, 401);
  const r = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  assert.equal(r.status, 403);
  const h = (await anon.get("/api/health")).headers;
  assert.ok(h.get("content-security-policy"));
  assert.equal(h.get("x-powered-by"), null);
});

test("auth: admin login sets httpOnly strict cookie", async () => {
  const r = await admin.post("/api/auth/login", { email: "admin@test.com", password: "Admin@12345" });
  assert.equal(r.status, 200);
  assert.equal(r.data.role, "ADMIN");
  const sc = r.headers.get("set-cookie");
  assert.match(sc, /HttpOnly/i);
  assert.match(sc, /SameSite=Strict/i);
  assert.equal(r.data.password_hash, undefined);
});

test("auth: weak password rejected, tenant registers", async () => {
  assert.equal((await client().post("/api/auth/register", { name: "Weak", email: "w@test.com", password: "abc" })).status, 400);
  const r = await tenant.post("/api/auth/register", { name: "Test Tenant", email: "t1@test.com", password: "Tenant@123", phone: "9876543210" });
  assert.equal(r.status, 201);
  assert.equal(r.data.role, "TENANT");
  tenantId = r.data.id;
  assert.equal((await client().post("/api/auth/register", { name: "Dup", email: "t1@test.com", password: "Tenant@123" })).status, 409);
});

test("auth: lockout after repeated wrong passwords", async () => {
  await client().post("/api/auth/register", { name: "Lock Me", email: "lock@test.com", password: "Tenant@123" });
  const c = client();
  for (let i = 0; i < 5; i++) assert.equal((await c.post("/api/auth/login", { email: "lock@test.com", password: "wrong" })).status, 401);
  assert.equal((await c.post("/api/auth/login", { email: "lock@test.com", password: "Tenant@123" })).status, 423);
});

test("rbac: tenant cannot use admin endpoints", async () => {
  assert.equal((await tenant.post("/api/rooms", { number: "X", capacity: 1, rent: 1 })).status, 403);
  assert.equal((await tenant.get("/api/tenants")).status, 403);
  assert.equal((await tenant.get("/api/audit")).status, 403);
  assert.equal((await tenant.get("/api/dashboard/admin")).status, 403);
});

test("rooms: admin creates, validates, and room assignment respects capacity", async () => {
  assert.equal((await admin.post("/api/rooms", { number: "", capacity: 2, rent: 5000 })).status, 400);
  const r = await admin.post("/api/rooms", { number: "101", floor: 1, type: "AC", capacity: 1, rent: 5500, deposit: 11000 });
  assert.equal(r.status, 201);
  roomId = r.data.id;
  assert.equal((await admin.post("/api/rooms", { number: "101", capacity: 2, rent: 5000 })).status, 409);
  assert.equal((await admin.patch(`/api/tenants/${tenantId}/room`, { room_id: roomId })).status, 200);
  await client().post("/api/auth/register", { name: "Second", email: "t2@test.com", password: "Tenant@123" });
  const list = (await admin.get("/api/tenants")).data;
  const second = list.find((t) => t.email === "t2@test.com");
  assert.equal((await admin.patch(`/api/tenants/${second.id}/room`, { room_id: roomId })).status, 409); // full
  assert.equal((await admin.del(`/api/rooms/${roomId}`)).status, 409); // occupied
});

test("payments: tenant uploads proof; fake image and duplicates are rejected", async () => {
  const bad = await tenant.raw("POST", "/api/payments", proofForm(month, 5500, Buffer.from("<script>alert(1)</script>__________"), "image/png", "evil.png"));
  assert.equal(bad.status, 400);
  const ok = await tenant.raw("POST", "/api/payments", proofForm());
  assert.equal(ok.status, 201, JSON.stringify(ok.data));
  paymentId = ok.data.id;
  assert.equal((await tenant.raw("POST", "/api/payments", proofForm())).status, 409);
  const future = await tenant.raw("POST", "/api/payments", proofForm("2999-01"));
  assert.equal(future.status, 400);
});

test("payments: proof is private to owner and admin", async () => {
  const outsider = client();
  await outsider.post("/api/auth/register", { name: "Out", email: "out@test.com", password: "Tenant@123" });
  assert.equal((await outsider.get(`/api/payments/${paymentId}/proof`)).status, 404);
  const mine = await tenant.get(`/api/payments/${paymentId}/proof`);
  assert.equal(mine.status, 200);
  assert.equal(mine.headers.get("content-type"), "image/png");
  assert.equal((await admin.get(`/api/payments/${paymentId}/proof`)).status, 200);
  assert.equal((await outsider.get("/api/payments")).data.length, 0);
});

test("payments: admin approves once, receipt available only after approval", async () => {
  assert.equal((await tenant.get(`/api/payments/${paymentId}/receipt`)).status, 409);
  assert.equal((await tenant.patch(`/api/payments/${paymentId}`, { status: "APPROVED" })).status, 403);
  assert.equal((await admin.patch(`/api/payments/${paymentId}`, { status: "APPROVED", admin_note: "ok" })).status, 200);
  assert.equal((await admin.patch(`/api/payments/${paymentId}`, { status: "REJECTED" })).status, 409);
  const rec = await tenant.get(`/api/payments/${paymentId}/receipt`);
  assert.equal(rec.status, 200);
  assert.match(rec.data.receipt_no, /^PG-\d{5}$/);
});

test("payments: dues and CSV export (with formula-injection guard)", async () => {
  const dues = await admin.get("/api/payments/dues");
  assert.equal(dues.status, 200);
  const csv = await admin.raw("GET", "/api/payments/export.csv");
  assert.equal(csv.status, 200);
  assert.match(csv.data, /Receipt,Tenant/);
});

test("complaints: raise, list isolation, admin responds", async () => {
  const c = await tenant.post("/api/complaints", { title: "Fan not working", description: "Ceiling fan makes noise", category: "ELECTRICAL", priority: "HIGH" });
  assert.equal(c.status, 201);
  assert.equal((await tenant.get("/api/complaints")).data.length, 1);
  assert.equal((await admin.get("/api/complaints?status=OPEN")).data.length, 1);
  const u = await admin.patch(`/api/complaints/${c.data.id}`, { status: "RESOLVED", admin_response: "Fixed" });
  assert.equal(u.status, 200);
  assert.equal((await tenant.patch(`/api/complaints/${c.data.id}`, { status: "OPEN" })).status, 403);
});

test("notices and expenses", async () => {
  assert.equal((await admin.post("/api/notices", { title: "Hello", body: "Welcome everyone", pinned: true })).status, 201);
  assert.equal((await tenant.get("/api/notices")).data.length, 1);
  assert.equal((await tenant.post("/api/notices", { title: "x", body: "yyy" })).status, 403);
  const e = await admin.post("/api/expenses", { title: "Electricity", category: "ELECTRICITY", amount: 4000, spent_on: `${month}-10` });
  assert.equal(e.status, 201);
  assert.equal((await admin.post("/api/expenses", { title: "Bad", amount: 5, spent_on: "10/10/2026" })).status, 400);
  assert.equal((await tenant.get("/api/expenses")).status, 403);
});

test("dashboards compute real numbers", async () => {
  const d = (await admin.get("/api/dashboard/admin")).data;
  assert.equal(d.rooms, 1);
  assert.equal(d.occupied, 1);
  assert.equal(d.collected, 5500);
  assert.equal(d.series.length, 6);
  assert.equal(d.series[5].expenses, 4000);
  const t = (await tenant.get("/api/dashboard/tenant")).data;
  assert.equal(t.room.number, "101");
  assert.equal(t.this_month_status, "APPROVED");
});

test("profile, password change, audit trail, logout", async () => {
  assert.equal((await tenant.patch("/api/auth/profile", { emergency_contact: "Mother 9999999999" })).status, 200);
  assert.equal((await tenant.post("/api/auth/change-password", { current: "wrong", next: "NewPass@123" })).status, 400);
  assert.equal((await tenant.post("/api/auth/change-password", { current: "Tenant@123", next: "NewPass@123" })).status, 200);
  assert.equal((await client().post("/api/auth/login", { email: "t1@test.com", password: "NewPass@123" })).status, 200);
  const log = (await admin.get("/api/audit")).data;
  assert.ok(log.some((l) => l.action === "PAYMENT_APPROVED"));
  assert.ok(log.some((l) => l.action === "LOGIN_FAILED"));
  await tenant.post("/api/auth/logout");
});

test("deactivated tenant is locked out immediately and vacates the room", async () => {
  const c = client();
  await c.post("/api/auth/login", { email: "t1@test.com", password: "NewPass@123" });
  assert.equal((await c.get("/api/auth/me")).status, 200);
  assert.equal((await admin.patch(`/api/tenants/${tenantId}`, { active: false })).status, 200);
  assert.equal((await c.get("/api/auth/me")).status, 401);
  assert.equal((await admin.del(`/api/rooms/${roomId}`)).status, 204);
});
