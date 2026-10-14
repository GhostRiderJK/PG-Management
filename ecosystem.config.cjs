// pm2 process file: keeps the app running and restarts it on crash / reboot
module.exports = {
  apps: [{
    name: "pg-manager",
    cwd: "./backend",           // so dotenv finds backend/.env
    script: "src/server.js",
    env: { NODE_ENV: "production" },
    max_memory_restart: "300M",
  }],
};
