const path = require("path");
const fs = require("fs");
const express = require("express");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const { ZodError } = require("zod");
const { csrfGuard } = require("./middleware/auth");

function createApp() {
  const https = process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false";
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // running behind Nginx / a cloud load balancer

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: https ? [] : null,
      },
    },
    hsts: https ? { maxAge: 15552000, includeSubDomains: true } : false,
  }));
  app.use(cookieParser());
  app.use(express.json({ limit: "20kb" }));
  app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false, message: { error: "Too many requests. Slow down." } }));
  app.use("/api", csrfGuard);

  app.get("/api/health", (req, res) => res.json({ ok: true }));
  app.use("/api/auth", require("./routes/auth"));
  app.use("/api/rooms", require("./routes/rooms"));
  app.use("/api/tenants", require("./routes/tenants"));
  app.use("/api/payments", require("./routes/payments"));
  app.use("/api/complaints", require("./routes/complaints"));
  app.use("/api/notices", require("./routes/notices"));
  app.use("/api/expenses", require("./routes/expenses"));
  app.use("/api/dashboard", require("./routes/dashboard"));
  app.use("/api/audit", require("./routes/audit"));
  app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

  // Serve the built React app from the same server (one URL, one origin, no CORS)
  const dist = path.join(__dirname, "..", "..", "frontend", "dist");
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { maxAge: "1h", index: false }));
    app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(dist, "index.html")));
  }

  app.use((err, req, res, next) => {
    if (err instanceof ZodError) return res.status(400).json({ error: err.issues[0].message });
    if (err.code === "LIMIT_FILE_SIZE") return res.status(400).json({ error: "Image must be under 2 MB" });
    if (err.message && err.message.startsWith("Only JPG")) return res.status(400).json({ error: err.message });
    if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON" });
    console.error(err);
    res.status(500).json({ error: "Something went wrong on the server" });
  });
  return app;
}

module.exports = { createApp };
