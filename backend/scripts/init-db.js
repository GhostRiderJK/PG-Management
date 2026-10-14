require("dotenv").config();

const { query, migrate, getPool } = require("../src/db");
const { ensureAdmin } = require("./seed");

const APP_DB_USER = process.env.APP_DB_USER || "pgmanager_app";

async function ensureAppRole() {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(APP_DB_USER)) {
    throw new Error("APP_DB_USER must be a simple PostgreSQL identifier (letters, digits, underscores).");
  }
  const password = process.env.APP_DB_PASSWORD;
  if (!password || password.length < 24) {
    throw new Error("Set APP_DB_PASSWORD to a unique password with at least 24 characters.");
  }

  const exists = (await query("SELECT 1 FROM pg_roles WHERE rolname = $1", [APP_DB_USER])).rows.length > 0;
  const roleTemplate = exists
    ? "ALTER ROLE %I WITH LOGIN PASSWORD %L"
    : "CREATE ROLE %I WITH LOGIN PASSWORD %L";
  const roleSql = (await query("SELECT format($1, $2, $3) AS statement", [
    roleTemplate, APP_DB_USER, password,
  ])).rows[0].statement;
  await query(roleSql);

  const grantTemplates = [
    "GRANT CONNECT ON DATABASE %I TO %I",
    "GRANT USAGE ON SCHEMA public TO %I",
    "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I",
    "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I",
  ];

  for (let i = 0; i < grantTemplates.length; i++) {
    const template = grantTemplates[i];
    let statement;
    if (i === 0) {
      statement = (await query("SELECT format($1, current_database(), $2) AS statement", [
        template, APP_DB_USER,
      ])).rows[0].statement;
    } else {
      statement = (await query("SELECT format($1, $2) AS statement", [
        template, APP_DB_USER,
      ])).rows[0].statement;
    }
    await query(statement);
  }

  // Apply privileges to future tables/sequences created by the migration owner.
  const defaults = [
    "ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I",
    "ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I",
  ];
  const currentRole = (await query("SELECT current_user AS name")).rows[0].name;
  for (const template of defaults) {
    const statement = (await query("SELECT format($1, $2, $3) AS statement", [
      template, currentRole, APP_DB_USER,
    ])).rows[0].statement;
    await query(statement);
  }

  console.log(`Application database role ${APP_DB_USER} is ready.`);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required. Use the RDS master connection only for this one-time initialization.");
  }

  if (process.env.NODE_ENV === "production") {
    if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
      throw new Error("Production initialization requires explicit ADMIN_EMAIL and ADMIN_PASSWORD values.");
    }
    if (process.env.ADMIN_PASSWORD.length < 16) {
      throw new Error("Production ADMIN_PASSWORD must contain at least 16 characters.");
    }
    if (process.env.DB_SSL !== "true") {
      throw new Error("Production database initialization requires DB_SSL=true.");
    }
  }

  await migrate();
  await ensureAdmin();
  await ensureAppRole();
  console.log("Database schema, admin account, and application role initialization completed.");
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
