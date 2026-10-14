require("dotenv").config();
const { createApp } = require("./app");
const { migrate } = require("./db");
const { ensureAdmin } = require("../scripts/seed");

async function main() {
  const production = process.env.NODE_ENV === "production";

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET is missing or too short. Generate a strong secret with: openssl rand -hex 32");
  }

  if (process.env.USE_PG_MEM !== "1" && !process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Configure it before starting the app.");
  }

  if (production && process.env.USE_PG_MEM !== "1" && process.env.DB_SSL !== "true") {
    throw new Error("Production database connections must use TLS. Set DB_SSL=true.");
  }

  // Development/demo defaults retain automatic initialization. Production should
  // initialize the database once via npm run init-db before starting replicas.
  const autoInit = process.env.AUTO_INIT_DB === "true"
    || (!production && process.env.AUTO_INIT_DB !== "false");

  if (autoInit) {
    await migrate();
    await ensureAdmin();
  }

  const port = Number(process.env.PORT || 5000);
  const app = createApp();
  const server = app.listen(port, "0.0.0.0", () => {
    console.log(`PG Manager running on port ${port}`);
  });

  const shutdown = (signal) => {
    console.log(`${signal} received; shutting down gracefully.`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error) => {
  console.error("Failed to start PG Manager:", error.message);
  process.exit(1);
});
