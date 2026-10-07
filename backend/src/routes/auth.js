const router = require("express").Router();
const bcrypt = require("bcryptjs");
const { z } = require("zod");
const rateLimit = require("express-rate-limit");
const { query } = require("../db");
const { wrap, audit, updateRow } = require("../util");
const { requireAuth, signToken, cookieOptions, COOKIE } = require("../middleware/auth");

const password = z.string().min(8, "Password needs at least 8 characters").max(72)
  .regex(/[a-z]/, "Password needs a lowercase letter")
  .regex(/[A-Z]/, "Password needs an uppercase letter")
  .regex(/\d/, "Password needs a number");
const phone = z.string().trim().regex(/^[0-9+\-\s]{7,15}$/, "Enter a valid phone number");

const registerSchema = z.object({
  name: z.string().trim().min(2).max(60),
  email: z.string().trim().toLowerCase().email().max(120),
  password,
  phone: phone.optional(),
});
const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(100) });

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, message: { error: "Too many attempts. Try again in a few minutes." } });
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12); // keeps timing equal for unknown emails
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

const publicUser = (u) => ({
  id: u.id, name: u.name, email: u.email, role: u.role, room_id: u.room_id,
  phone: u.phone, emergency_contact: u.emergency_contact, join_date: u.join_date,
});

router.post("/register", authLimiter, wrap(async (req, res) => {
  const data = registerSchema.parse(req.body);
  const dup = await query("SELECT id FROM users WHERE email=$1", [data.email]);
  if (dup.rows.length) return res.status(409).json({ error: "This email is already registered" });
  const hash = await bcrypt.hash(data.password, 12);
  const { rows } = await query(
    "INSERT INTO users (name, email, password_hash, role, phone) VALUES ($1,$2,$3,'TENANT',$4) RETURNING *",
    [data.name, data.email, hash, data.phone || null]
  );
  req.user = rows[0];
  await audit(req, "REGISTER", data.email);
  res.cookie(COOKIE, signToken(rows[0]), cookieOptions());
  res.status(201).json(publicUser(rows[0]));
}));

router.post("/login", authLimiter, wrap(async (req, res) => {
  const { email, password: pw } = loginSchema.parse(req.body);
  const { rows } = await query("SELECT * FROM users WHERE email=$1", [email]);
  const user = rows[0];
  const generic = { error: "Wrong email or password" };
  if (!user) { await bcrypt.compare(pw, DUMMY_HASH); return res.status(401).json(generic); }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    return res.status(423).json({ error: `Account locked after too many wrong passwords. Try again after ${LOCK_MINUTES} minutes.` });
  }
  const ok = await bcrypt.compare(pw, user.password_hash);
  if (!ok) {
    const attempts = user.failed_attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await query("UPDATE users SET failed_attempts=0, locked_until=$1 WHERE id=$2", [new Date(Date.now() + LOCK_MINUTES * 60000), user.id]);
      req.user = user; await audit(req, "ACCOUNT_LOCKED", email);
    } else {
      await query("UPDATE users SET failed_attempts=$1 WHERE id=$2", [attempts, user.id]);
    }
    req.user = user; await audit(req, "LOGIN_FAILED", email);
    return res.status(401).json(generic);
  }
  if (!user.active) return res.status(403).json({ error: "This account has been deactivated. Contact your PG owner." });

  await query("UPDATE users SET failed_attempts=0, locked_until=NULL WHERE id=$1", [user.id]);
  req.user = user; await audit(req, "LOGIN", email);
  res.cookie(COOKIE, signToken(user), cookieOptions());
  res.json(publicUser(user));
}));

router.post("/logout", wrap(async (req, res) => {
  res.clearCookie(COOKIE, { ...cookieOptions(), maxAge: undefined });
  res.json({ ok: true });
}));

router.get("/me", requireAuth, (req, res) => res.json(publicUser(req.user)));

router.patch("/profile", requireAuth, wrap(async (req, res) => {
  const data = z.object({
    name: z.string().trim().min(2).max(60).optional(),
    phone: phone.nullable().optional(),
    emergency_contact: z.string().trim().max(100).nullable().optional(),
  }).parse(req.body);
  const row = await updateRow("users", req.user.id, data, ["name", "phone", "emergency_contact"]);
  res.json(publicUser(row || req.user));
}));

router.post("/change-password", requireAuth, wrap(async (req, res) => {
  const { current, next } = z.object({ current: z.string().min(1), next: password }).parse(req.body);
  const { rows } = await query("SELECT password_hash FROM users WHERE id=$1", [req.user.id]);
  if (!(await bcrypt.compare(current, rows[0].password_hash)))
    return res.status(400).json({ error: "Current password is wrong" });
  await query("UPDATE users SET password_hash=$1 WHERE id=$2", [await bcrypt.hash(next, 12), req.user.id]);
  await audit(req, "PASSWORD_CHANGED");
  res.json({ ok: true });
}));

module.exports = router;
