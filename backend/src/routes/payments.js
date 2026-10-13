const router = require("express").Router();
const { z } = require("zod");
const { query } = require("../db");
const { wrap, audit, idParam, monthRe, monthStr, computeDues } = require("../util");
const { requireAuth, requireRole } = require("../middleware/auth");
const { upload, sniffImage } = require("../middleware/upload");

const LIST_SQL = `SELECT p.id, p.user_id, p.month, p.amount, p.method, p.status, p.admin_note, p.created_at, p.reviewed_at,
                         u.name AS tenant_name, r.number AS room_number
                    FROM payments p JOIN users u ON u.id = p.user_id LEFT JOIN rooms r ON r.id = u.room_id`;

router.use(requireAuth);

router.get("/", wrap(async (req, res) => {
  const where = [], params = [];
  if (req.user.role !== "ADMIN") { params.push(req.user.id); where.push(`p.user_id=$${params.length}`); }
  if (["PENDING", "APPROVED", "REJECTED"].includes(req.query.status)) { params.push(req.query.status); where.push(`p.status=$${params.length}`); }
  const sql = `${LIST_SQL} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY p.created_at DESC LIMIT 500`;
  res.json((await query(sql, params)).rows);
}));

// Admin: who owes rent
router.get("/dues", requireRole("ADMIN"), wrap(async (req, res) => {
  const tenants = (await query(
    `SELECT u.id, u.name, u.phone, u.join_date, u.created_at, r.number AS room_number, r.rent
       FROM users u JOIN rooms r ON r.id = u.room_id WHERE u.role='TENANT' AND u.active=true ORDER BY r.number`)).rows;
  const approved = (await query("SELECT user_id, month FROM payments WHERE status IN ('APPROVED','PENDING')")).rows;
  const out = tenants.map((t) => {
    const set = new Set(approved.filter((a) => a.user_id === t.id).map((a) => a.month));
    const d = computeDues(t, t.rent, set);
    return { id: t.id, name: t.name, phone: t.phone, room_number: t.room_number, rent: t.rent, unpaid_months: d.unpaidMonths, amount_due: d.amount };
  }).filter((t) => t.unpaid_months.length);
  res.json(out);
}));

router.get("/export.csv", requireRole("ADMIN"), wrap(async (req, res) => {
  const rows = (await query(`${LIST_SQL} ORDER BY p.created_at DESC`)).rows;
  const safe = (v) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;           // block spreadsheet formula injection
    return `"${s.replace(/"/g, '""')}"`;
  };
  const head = ["Receipt", "Tenant", "Room", "Month", "Amount", "Method", "Status", "Submitted", "Reviewed", "Note"];
  const lines = rows.map((p) => [
    `PG-${String(p.id).padStart(5, "0")}`, p.tenant_name, p.room_number, p.month, p.amount, p.method, p.status,
    new Date(p.created_at).toISOString(), p.reviewed_at ? new Date(p.reviewed_at).toISOString() : "", p.admin_note,
  ].map(safe).join(","));
  res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="payments.csv"' });
  await audit(req, "PAYMENTS_EXPORTED", `${rows.length} rows`);
  res.send([head.join(","), ...lines].join("\n"));
}));

router.post("/", requireRole("TENANT"), upload.single("proof"), wrap(async (req, res) => {
  if (!req.user.room_id) return res.status(409).json({ error: "You have not been assigned a room yet" });
  if (!req.file) return res.status(400).json({ error: "Attach a screenshot of your UPI payment" });
  const type = sniffImage(req.file.buffer);
  if (!type) return res.status(400).json({ error: "That file is not a real JPG, PNG or WebP image" });
  const d = z.object({ month: monthRe, amount: z.coerce.number().int().min(1).max(1000000) }).parse(req.body);
  if (d.month > monthStr()) return res.status(400).json({ error: "You cannot pay for a future month" });
  const dup = await query("SELECT id FROM payments WHERE user_id=$1 AND month=$2 AND status IN ('PENDING','APPROVED')", [req.user.id, d.month]);
  if (dup.rows.length) return res.status(409).json({ error: "A payment for this month is already pending or approved" });
  const { rows } = await query(
    "INSERT INTO payments (user_id, month, amount, proof, proof_type) VALUES ($1,$2,$3,$4,$5) RETURNING id, month, amount, status",
    [req.user.id, d.month, d.amount, req.file.buffer, type]
  );
  await audit(req, "PAYMENT_SUBMITTED", `${d.month} Rs ${d.amount}`);
  res.status(201).json(rows[0]);
}));

router.patch("/:id", requireRole("ADMIN"), wrap(async (req, res) => {
  const id = idParam.parse(req.params.id);
  const d = z.object({ status: z.enum(["APPROVED", "REJECTED"]), admin_note: z.string().trim().max(300).optional() }).parse(req.body);
  const cur = (await query("SELECT status FROM payments WHERE id=$1", [id])).rows[0];
  if (!cur) return res.status(404).json({ error: "Payment not found" });
  if (cur.status !== "PENDING") return res.status(409).json({ error: "This payment has already been reviewed" });
  await query("UPDATE payments SET status=$1, admin_note=$2, reviewed_at=now() WHERE id=$3", [d.status, d.admin_note || null, id]);
  await audit(req, `PAYMENT_${d.status}`, `payment ${id}`);
  res.json({ id, status: d.status });
}));

async function loadOwned(req, id, cols) {
  const row = (await query(`SELECT ${cols} FROM payments p JOIN users u ON u.id=p.user_id LEFT JOIN rooms r ON r.id=u.room_id WHERE p.id=$1`, [id])).rows[0];
  if (!row || (req.user.role !== "ADMIN" && row.user_id !== req.user.id)) return null;
  return row;
}

router.get("/:id/proof", wrap(async (req, res) => {
  const row = await loadOwned(req, idParam.parse(req.params.id), "p.user_id, p.proof, p.proof_type");
  if (!row || !row.proof) return res.status(404).json({ error: "Not found" });
  res.set({ "Content-Type": row.proof_type, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=300", "Content-Security-Policy": "default-src 'none'" });
  res.send(row.proof);
}));

router.get("/:id/receipt", wrap(async (req, res) => {
  const id = idParam.parse(req.params.id);
  const row = await loadOwned(req, id, "p.user_id, p.id, p.month, p.amount, p.method, p.status, p.reviewed_at, u.name AS tenant_name, r.number AS room_number");
  if (!row) return res.status(404).json({ error: "Not found" });
  if (row.status !== "APPROVED") return res.status(409).json({ error: "A receipt is only available for approved payments" });
  res.json({ receipt_no: `PG-${String(row.id).padStart(5, "0")}`, tenant_name: row.tenant_name, room_number: row.room_number, month: row.month, amount: row.amount, method: row.method, approved_on: row.reviewed_at });
}));

module.exports = router;
