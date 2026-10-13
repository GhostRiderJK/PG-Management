require("dotenv").config();
const { migrate, getPool } = require("../src/db");
migrate().then(() => { console.log("Database tables are ready."); return getPool().end(); })
  .catch((e) => { console.error(e.message); process.exit(1); });
