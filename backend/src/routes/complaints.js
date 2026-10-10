const router = require("express").Router();
const { z } = require("zod");
const { query } = require("../db");
const { wrap, audit, idParam } = require("../util");
const { requireAuth, requireRole } = require("../middleware/auth");

const CATEGORIES = ["MAINTENANCE", "CLEANING", "ELECTRICAL", "PLUMBING", "FOOD", "NOISE", "OTHER"];
const createSchema = z.object({
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().min(5).max(1000),
  category: z.enum(CATEGORIES).default("OTHER"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
});

router.use(requireAuth);

router.get("/", wrap(async (req, res) => {
  const where = [], params = [];
  if (req.user.role !== "ADMIN") { params.push(req.user.id); where.push(`c.user_id=$${params.length}`); }
  if (["OPEN", "IN_PROGRESS", "RESOLVED"].includes(req.query.status)) { params.push(req.query.status); where.push(`c.status=$${params.length}`); }
  const { rows } = await query(
    `SELECT c.*, u.name AS tenant_name, r.number AS room_number
       FROM complaints c JOIN users u ON u.id=c.user_id LEFT JOIN rooms r ON r.id=u.room_id
       ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY c.created_at DESC LIMIT 500`, params);
  res.json(rows);
}));

router.post("/", requireRole("TENANT"), wrap(async (req, res) => {
  const d = createSchema.parse(req.body);
  const { rows } = await query(
    "INSERT INTO complaints (user_id, title, description, category, priority) VALUES ($1,$2,$3,$4,$5) RETURNING *",
    [req.user.id, d.title, d.description, d.category, d.priority]);
  await audit(req, "COMPLAINT_RAISED", d.title);
  res.status(201).json(rows[0]);
}));

router.patch("/:id", requireRole("ADMIN"), wrap(async (req, res) => {
  const id = idParam.parse(req.params.id);
  const d = z.object({ status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED"]), admin_response: z.string().trim().max(500).optional() }).parse(req.body);
  const { rows } = await query(
    "UPDATE complaints SET status=$1, admin_response=COALESCE($2, admin_response), updated_at=now() WHERE id=$3 RETURNING id, status, admin_response",
    [d.status, d.admin_response || null, id]);
  if (!rows[0]) return res.status(404).json({ error: "Complaint not found" });
  await audit(req, "COMPLAINT_" + d.status, `id ${id}`);
  res.json(rows[0]);
}));

module.exports = router;
