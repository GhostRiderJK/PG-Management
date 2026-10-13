// Zero-install demo: runs the whole app on an in-memory database with sample data.
// Data is lost when you stop the server. Not for production.
process.env.USE_PG_MEM = "1";
process.env.JWT_SECRET = process.env.JWT_SECRET || "demo-secret-demo-secret-demo-secret";
process.env.NODE_ENV = "development";
const { createApp } = require("../src/app");
const { migrate } = require("../src/db");
const { ensureAdmin, seedDemo } = require("./seed");

(async () => {
  await migrate();
  await ensureAdmin();
  await seedDemo();
  const port = process.env.PORT || 5000;
  createApp().listen(port, () => {
    console.log(`\nDemo running at http://localhost:${port}`);
    console.log("Admin:  admin@pg.local / Admin@12345");
    console.log("Tenant: aarav@demo.com / Tenant@123\n");
  });
})();
