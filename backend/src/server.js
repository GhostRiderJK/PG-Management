require("dotenv").config();
const { createApp } = require("./app");
const { migrate } = require("./db");
const { ensureAdmin } = require("../scripts/seed");

async function main() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
    console.error("JWT_SECRET is missing or too short. Generate one with: openssl rand -hex 32");
    process.exit(1);
  }
  if (process.env.USE_PG_MEM !== "1" && !process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
    process.exit(1);
  }
  await migrate();
  await ensureAdmin();
  const port = process.env.PORT || 5000;
  createApp().listen(port, () => console.log(`PG Manager running on http://localhost:${port}`));
}
main().catch((e) => { console.error("Failed to start:", e.message); process.exit(1); });
