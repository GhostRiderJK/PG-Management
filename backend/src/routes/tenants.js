const router = require("express").Router();
const { z } = require("zod");
const { query } = require("../db");
const { wrap, audit, updateRow, idParam, dateStr } = require("../util");
const { requireAuth, requireRole } = require("../middleware/auth");

router.use(requireAuth, requireRole("ADMIN"));

router.get("/", wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.phone, u.emergency_contact, u.join_date, u.active, u.room_id, r.number AS room_number
       FROM users u LEFT JOIN rooms r ON r.id = u.room_id
      WHERE u.role='TENANT' ORDER BY u.created_at DESC`
  );
  res.json(rows);
}));

router.patch("/:id", wrap(async (req, res) => {
  const id = idParam.parse(req.params.id);
  const d = z.object({
    phone: z.string().trim().regex(/^[0-9+\-\s]{7,15}$/).nullable().optional(),
    emergency_contact: z.string().trim().max(100).nullable().optional(),
    join_date: dateStr.nullable().optional(),
    active: z.boolean().optional(),
  }).parse(req.body);
  const target = (await query("SELECT role FROM users WHERE id=$1", [id])).rows[0];
  if (!target || target.role !== "TENANT") return res.status(404).json({ error: "Tenant not found" });
  const row = await updateRow("users", id, d, ["phone", "emergency_contact", "join_date", "active"]);
  if (d.active === false) await query("UPDATE users SET room_id=NULL WHERE id=$1", [id]);
  await audit(req, d.active === false ? "TENANT_DEACTIVATED" : "TENANT_UPDATED", `id ${id}`);
  res.json({ id: row.id });
}));

router.patch("/:id/room", wrap(async (req, res) => {
  const id = idParam.parse(req.params.id);
  const { room_id } = z.object({ room_id: z.number().int().positive().nullable() }).parse(req.body);
  const target = (await query("SELECT role, active FROM users WHERE id=$1", [id])).rows[0];
  if (!target || target.role !== "TENANT") return res.status(404).json({ error: "Tenant not found" });
  if (!target.active) return res.status(409).json({ error: "This tenant is deactivated" });
  if (room_id !== null) {
    const room = (await query("SELECT * FROM rooms WHERE id=$1", [room_id])).rows[0];
    if (!room) return res.status(404).json({ error: "Room not found" });
    const taken = (await query("SELECT COUNT(*) AS n FROM users WHERE room_id=$1 AND id<>$2 AND active=true", [room_id, id])).rows[0].n;
    if (Number(taken) >= room.capacity) return res.status(409).json({ error: "This room is full" });
    await query("UPDATE users SET room_id=$1, join_date=COALESCE(join_date,$2) WHERE id=$3", [room_id, new Date().toISOString().slice(0, 10), id]);
  } else {
    await query("UPDATE users SET room_id=NULL WHERE id=$1", [id]);
  }
  await audit(req, room_id ? "ROOM_ASSIGNED" : "ROOM_VACATED", `tenant ${id}${room_id ? " -> room " + room_id : ""}`);
  res.json({ id, room_id });
}));

module.exports = router;
