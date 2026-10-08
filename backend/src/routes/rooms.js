const router = require("express").Router();
const { z } = require("zod");
const { query } = require("../db");
const { wrap, audit, updateRow, idParam } = require("../util");
const { requireAuth, requireRole } = require("../middleware/auth");

const roomSchema = z.object({
  number: z.string().trim().min(1).max(20),
  floor: z.coerce.number().int().min(0).max(50).default(0),
  type: z.enum(["AC", "NON_AC"]).default("NON_AC"),
  capacity: z.coerce.number().int().min(1).max(20),
  rent: z.coerce.number().int().min(0).max(1000000),
  deposit: z.coerce.number().int().min(0).max(1000000).default(0),
});

router.use(requireAuth);

router.get("/", wrap(async (req, res) => {
  if (req.user.role === "ADMIN") {
    const rooms = (await query("SELECT * FROM rooms ORDER BY floor, number")).rows;
    const tenants = (await query("SELECT id, name, room_id, phone FROM users WHERE role='TENANT' AND active=true AND room_id IS NOT NULL")).rows;
    return res.json(rooms.map((r) => ({ ...r, tenants: tenants.filter((t) => t.room_id === r.id) })));
  }
  if (!req.user.room_id) return res.json([]);
  const room = (await query("SELECT * FROM rooms WHERE id=$1", [req.user.room_id])).rows[0];
  const mates = (await query("SELECT id, name FROM users WHERE room_id=$1 AND active=true", [req.user.room_id])).rows;
  res.json([{ ...room, tenants: mates }]);
}));

router.post("/", requireRole("ADMIN"), wrap(async (req, res) => {
  const d = roomSchema.parse(req.body);
  if ((await query("SELECT 1 FROM rooms WHERE number=$1", [d.number])).rows.length)
    return res.status(409).json({ error: "A room with this number already exists" });
  const { rows } = await query(
    "INSERT INTO rooms (number, floor, type, capacity, rent, deposit) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
    [d.number, d.floor, d.type, d.capacity, d.rent, d.deposit]
  );
  await audit(req, "ROOM_ADDED", d.number);
  res.status(201).json(rows[0]);
}));

router.put("/:id", requireRole("ADMIN"), wrap(async (req, res) => {
  const id = idParam.parse(req.params.id);
  const d = roomSchema.parse(req.body);
  const occupied = (await query("SELECT COUNT(*) AS n FROM users WHERE room_id=$1 AND active=true", [id])).rows[0].n;
  if (d.capacity < Number(occupied)) return res.status(409).json({ error: `Room already has ${occupied} tenants. Capacity cannot be lower.` });
  const dup = (await query("SELECT id FROM rooms WHERE number=$1 AND id<>$2", [d.number, id])).rows;
  if (dup.length) return res.status(409).json({ error: "A room with this number already exists" });
  const row = await updateRow("rooms", id, d, ["number", "floor", "type", "capacity", "rent", "deposit"]);
  if (!row) return res.status(404).json({ error: "Room not found" });
  await audit(req, "ROOM_UPDATED", d.number);
  res.json(row);
}));

router.delete("/:id", requireRole("ADMIN"), wrap(async (req, res) => {
  const id = idParam.parse(req.params.id);
  const n = (await query("SELECT COUNT(*) AS n FROM users WHERE room_id=$1", [id])).rows[0].n;
  if (Number(n) > 0) return res.status(409).json({ error: "Move the tenants out of this room before deleting it" });
  await query("DELETE FROM rooms WHERE id=$1", [id]);
  await audit(req, "ROOM_DELETED", `id ${id}`);
  res.status(204).end();
}));

module.exports = router;
