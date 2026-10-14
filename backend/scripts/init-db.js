require("dotenv").config();

const { migrate, getPool } = require("../src/db");
const { ensureAdmin } = require("./seed");

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required. Configure backend/.env before initializing the database.");
  }

  if (process.env.NODE_ENV === "production") {
    if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
      throw new Error("Production initialization requires explicit ADMIN_EMAIL and ADMIN_PASSWORD values.");
    }
    if (process.env.ADMIN_PASSWORD.length < 16) {
      throw new Error("Production ADMIN_PASSWORD must contain at least 16 characters.");
    }
  }

  await migrate();
  await ensureAdmin();
  console.log("Database schema and admin initialization completed.");
}

main()
  .catch((error) => {
    console.error("Database initialization failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await getPool().end();
    } catch {
      // A pool may not have been initialized if validation failed early.
    }
  });
