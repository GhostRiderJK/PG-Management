const jwt = require("jsonwebtoken");
const { query } = require("../db");

const COOKIE = "pg_token";

function cookieOptions() {
  return {
    httpOnly: true,                       // JavaScript cannot read the token (blocks XSS theft)
    sameSite: "strict",                   // not sent on cross-site requests (blocks CSRF)
    secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false",
    maxAge: 8 * 60 * 60 * 1000,
    path: "/",
  };
}

const signToken = (u) => jwt.sign({ id: u.id, role: u.role }, process.env.JWT_SECRET, { expiresIn: "8h" });

async function requireAuth(req, res, next) {
  try {
    const token = req.cookies && req.cookies[COOKIE];
    if (!token) return res.status(401).json({ error: "Please log in" });
    let payload;
    try { payload = jwt.verify(token, process.env.JWT_SECRET); }
    catch { return res.status(401).json({ error: "Session expired. Please log in again." }); }
    // Re-check the database on every request so deactivated users and role changes apply immediately
    const { rows } = await query(
      "SELECT id, name, email, role, room_id, active, phone, emergency_contact, join_date, created_at FROM users WHERE id=$1",
      [payload.id]
    );
    const user = rows[0];
    if (!user || !user.active) return res.status(401).json({ error: "This account is not active" });
    req.user = user;
    next();
  } catch (e) { next(e); }
}

const requireRole = (role) => (req, res, next) =>
  req.user && req.user.role === role
    ? next()
    : res.status(403).json({ error: "You do not have access to this action" });

// CSRF defence in depth: state-changing requests must carry a custom header
// (browsers will not add it on cross-site form posts) on top of SameSite=Strict cookies.
const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);
function csrfGuard(req, res, next) {
  if (UNSAFE.has(req.method) && req.get("X-Requested-With") !== "pg-manager")
    return res.status(403).json({ error: "Blocked: missing request header" });
  next();
}

module.exports = { requireAuth, requireRole, csrfGuard, signToken, cookieOptions, COOKIE };
