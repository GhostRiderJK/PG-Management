const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

let pool;

function getPool() {
  if (pool) return pool;

  if (process.env.USE_PG_MEM === "1") {
    // In-memory Postgres emulator: used for tests and the no-install demo mode.
    const { newDb } = require("pg-mem");
    const { Pool: MemPool } = newDb().adapters.createPg();
    pool = new MemPool();
  } else {
    let ssl;
    if (process.env.DB_SSL === "true") {
      ssl = { rejectUnauthorized: true };
      if (process.env.DB_SSL_CA) {
        ssl.ca = fs.readFileSync(process.env.DB_SSL_CA, "utf8");
      }
    }

    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl,
      max: 10,
    });
  }

  return pool;
}

const query = (text, params) => getPool().query(text, params);

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  for (const stmt of sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) {
    await query(stmt);
  }
}

module.exports = { query, migrate, getPool };
