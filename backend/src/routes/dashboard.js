const router = require("express").Router();
const { query } = require("../db");
const { wrap, monthStr, lastMonths, computeDues } = require("../util");
const { requireAuth, requireRole } = require("../middleware/auth");

router.use(requireAuth);

router.get("/admin", requireRole("ADMIN"), wrap(async (req, res) => {
  const month = monthStr();
  const rooms = (await query("SELECT id, capacity, rent FROM rooms")).rows;
  const tenants = (await query("SELECT id, name, phone, room_id, join_date, created_at FROM users WHERE role='TENANT' AND active=true")).rows;
  const housed = tenants.filter((t) => t.room_id);
  const rentOf = new Map(rooms.map((r) => [r.id, r.rent]));
  const months = lastMonths(6);
  const approved = (await query("SELECT user_id, month, amount FROM payments WHERE status='APPROVED' AND month >= $1", [months[0]])).rows;
  const allApproved = (await query("SELECT user_id, month FROM payments WHERE status IN ('APPROVED','PENDING')")).rows;
  const expenses = (await query("SELECT amount, spent_on FROM expenses WHERE spent_on >= $1", [months[0] + "-01"])).rows;
  const pendingPayments = (await query("SELECT COUNT(*) AS n FROM payments WHERE status='PENDING'")).rows[0].n;
  const openComplaints = (await query("SELECT COUNT(*) AS n FROM complaints WHERE status<>'RESOLVED'")).rows[0].n;

  const capacity = rooms.reduce((s, r) => s + r.capacity, 0);
  const expected = housed.reduce((s, t) => s + (rentOf.get(t.room_id) || 0), 0);
  const collected = approved.filter((p) => p.month === month).reduce((s, p) => s + p.amount, 0);

  const series = months.map((m) => ({
    month: m,
    collected: approved.filter((p) => p.month === m).reduce((s, p) => s + p.amount, 0),
    expenses: expenses.filter((e) => e.spent_on.startsWith(m)).reduce((s, e) => s + e.amount, 0),
  }));

  const defaulters = housed.map((t) => {
    const set = new Set(allApproved.filter((a) => a.user_id === t.id).map((a) => a.month));
    const d = computeDues(t, rentOf.get(t.room_id) || 0, set);
    return { id: t.id, name: t.name, phone: t.phone, months: d.unpaidMonths.length, amount_due: d.amount };
  }).filter((d) => d.months > 0).sort((a, b) => b.amount_due - a.amount_due).slice(0, 6);

  res.json({
    month, rooms: rooms.length, capacity, occupied: housed.length, tenants: tenants.length,
    occupancy_pct: capacity ? Math.round((housed.length / capacity) * 100) : 0,
    expected, collected, pending_payments: Number(pendingPayments), open_complaints: Number(openComplaints),
    series, defaulters,
  });
}));

router.get("/tenant", requireRole("TENANT"), wrap(async (req, res) => {
  const u = req.user;
  const room = u.room_id ? (await query("SELECT number, floor, type, rent, deposit FROM rooms WHERE id=$1", [u.room_id])).rows[0] : null;
  const pays = (await query("SELECT month, status FROM payments WHERE user_id=$1", [u.id])).rows;
  const month = monthStr();
  const thisMonth = pays.find((p) => p.month === month && p.status !== "REJECTED");
  let dues = { unpaidMonths: [], amount: 0 };
  if (room) dues = computeDues(u, room.rent, new Set(pays.filter((p) => p.status !== "REJECTED").map((p) => p.month)));
  const open = (await query("SELECT COUNT(*) AS n FROM complaints WHERE user_id=$1 AND status<>'RESOLVED'", [u.id])).rows[0].n;
  const pending = pays.filter((p) => p.status === "PENDING").length;
  res.json({ room, month, this_month_status: thisMonth ? thisMonth.status : "UNPAID", dues, open_complaints: Number(open), pending_payments: pending });
}));

module.exports = router;
