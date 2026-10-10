const router = require("express").Router();
const { z } = require("zod");
const { query } = require("../db");
const { wrap, audit, idParam } = require("../util");
const { requireAuth, requireRole } = require("../middleware/auth");

router.use(requireAuth);

router.get("/", wrap(async (req, res) => {
  res.json((await query("SELECT id, title, body, pinned, created_at FROM announcements ORDER BY pinned DESC, created_at DESC LIMIT 100")).rows);
}));

router.post("/", requireRole("ADMIN"), wrap(async (req, res) => {
  const d = z.object({ title: z.string().trim().min(3).max(100), body: z.string().trim().min(3).max(2000), pinned: z.boolean().default(false) }).parse(req.body);
  const { rows } = await query("INSERT INTO announcements (title, body, pinned, author_id) VALUES ($1,$2,$3,$4) RETURNING *", [d.title, d.body, d.pinned, req.user.id]);
  await audit(req, "NOTICE_POSTED", d.title);
  res.status(201).json(rows[0]);
}));

router.delete("/:id", requireRole("ADMIN"), wrap(async (req, res) => {
  await query("DELETE FROM announcements WHERE id=$1", [idParam.parse(req.params.id)]);
  await audit(req, "NOTICE_DELETED", `id ${req.params.id}`);
  res.status(204).end();
}));

module.exports = router;
