const router = require("express").Router();
const { z } = require("zod");
const { query } = require("../db");
const { wrap, audit, idParam, dateStr } = require("../util");
const { requireAuth, requireRole } = require("../middleware/auth");

router.use(requireAuth, requireRole("ADMIN"));

router.get("/", wrap(async (req, res) => {
  res.json((await query("SELECT * FROM expenses ORDER BY spent_on DESC, id DESC LIMIT 500")).rows);
}));

router.post("/", wrap(async (req, res) => {
  const d = z.object({
    title: z.string().trim().min(2).max(100),
    category: z.enum(["ELECTRICITY", "WATER", "FOOD", "MAINTENANCE", "SALARY", "INTERNET", "OTHER"]).default("OTHER"),
    amount: z.coerce.number().int().min(1).max(10000000),
    spent_on: dateStr,
  }).parse(req.body);
  const { rows } = await query("INSERT INTO expenses (title, category, amount, spent_on) VALUES ($1,$2,$3,$4) RETURNING *", [d.title, d.category, d.amount, d.spent_on]);
  await audit(req, "EXPENSE_ADDED", `${d.title} Rs ${d.amount}`);
  res.status(201).json(rows[0]);
}));

router.delete("/:id", wrap(async (req, res) => {
  await query("DELETE FROM expenses WHERE id=$1", [idParam.parse(req.params.id)]);
  await audit(req, "EXPENSE_DELETED", `id ${req.params.id}`);
  res.status(204).end();
}));

module.exports = router;
