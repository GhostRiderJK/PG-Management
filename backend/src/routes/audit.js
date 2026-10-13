const router = require("express").Router();
const { query } = require("../db");
const { wrap } = require("../util");
const { requireAuth, requireRole } = require("../middleware/auth");

router.get("/", requireAuth, requireRole("ADMIN"), wrap(async (req, res) => {
  res.json((await query(
    `SELECT a.id, a.action, a.detail, a.ip, a.created_at, u.name AS user_name
       FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 200`)).rows);
}));

module.exports = router;
