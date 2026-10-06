const { z } = require("zod");
const { query } = require("./db");

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

async function audit(req, action, detail = "") {
  try {
    await query("INSERT INTO audit_log (user_id, action, detail, ip) VALUES ($1,$2,$3,$4)", [
      req.user ? req.user.id : null, action, String(detail).slice(0, 300), req.ip,
    ]);
  } catch (e) { console.error("audit failed", e.message); }
}

// UPDATE builder with a whitelist of allowed columns
async function updateRow(table, id, fields, allowed) {
  const keys = Object.keys(fields).filter((k) => allowed.includes(k));
  if (!keys.length) return null;
  const sets = keys.map((k, i) => `${k}=$${i + 1}`).join(", ");
  const { rows } = await query(
    `UPDATE ${table} SET ${sets} WHERE id=$${keys.length + 1} RETURNING *`,
    [...keys.map((k) => fields[k]), id]
  );
  return rows[0] || null;
}

const monthStr = (d = new Date()) => d.toISOString().slice(0, 7);
function lastMonths(n) {
  const out = [];
  const d = new Date();
  d.setUTCDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    out.push(monthStr(x));
  }
  return out;
}
function monthsBetween(from, to) {
  const out = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

const DUE_DAY = 5; // rent is due by the 5th of each month

function prevMonth(m) {
  const [y, mo] = m.split("-").map(Number);
  return monthStr(new Date(Date.UTC(y, mo - 2, 1)));
}

/**
 * Unpaid months (max 12) for a tenant who lives in a room.
 * `coveredMonths` = months with an APPROVED or still-PENDING payment.
 * The current month only counts as overdue after the due day.
 */
function computeDues(tenant, rent, coveredMonths) {
  const start = (tenant.join_date || tenant.created_at.toISOString()).slice(0, 7);
  const now = monthStr();
  const upto = new Date().getUTCDate() > DUE_DAY ? now : prevMonth(now);
  const unpaid = monthsBetween(start, upto).slice(-12).filter((m) => !coveredMonths.has(m));
  return { unpaidMonths: unpaid, amount: unpaid.length * rent };
}

const idParam = z.coerce.number().int().positive();
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date format YYYY-MM-DD");
const monthRe = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Month must look like 2026-10");

module.exports = { wrap, audit, updateRow, monthStr, lastMonths, computeDues, idParam, dateStr, monthRe };
