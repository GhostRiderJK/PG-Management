require("dotenv").config();
const zlib = require("zlib");
const bcrypt = require("bcryptjs");
const { query, migrate, getPool } = require("../src/db");

async function ensureAdmin() {
  const email = (process.env.ADMIN_EMAIL || "admin@pg.local").toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "Admin@12345";
  const exists = (await query("SELECT id FROM users WHERE email=$1", [email])).rows[0];
  if (exists) return exists.id;
  const { rows } = await query(
    "INSERT INTO users (name, email, password_hash, role) VALUES ('PG Owner', $1, $2, 'ADMIN') RETURNING id",
    [email, await bcrypt.hash(password, 12)]
  );
  console.log("Admin created:", email);
  return rows[0].id;
}

/* ---- tiny PNG generator so demo payment screenshots show a real image ---- */
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function demoPng(w = 240, h = 140) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const i = y * (w * 3 + 1) + 1 + x * 3;
      const inBadge = Math.hypot(x - w / 2, y - h / 2 - 8) < 34;
      raw[i] = inBadge ? 255 : 20 + (y * 40) / h;
      raw[i + 1] = inBadge ? 255 : 120 + (y * 50) / h;
      raw[i + 2] = inBadge ? 255 : 110 + (x * 40) / w;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const monthOffset = (n) => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, 1)).toISOString().slice(0, 7); };

async function seedDemo() {
  if ((await query("SELECT COUNT(*) AS n FROM rooms")).rows[0].n > 0) { console.log("Demo data skipped: rooms already exist."); return; }
  const rooms = [["101", 1, "NON_AC", 3, 5500], ["102", 1, "NON_AC", 3, 5500], ["201", 2, "AC", 2, 8500], ["202", 2, "AC", 2, 8500], ["301", 3, "NON_AC", 4, 4800], ["302", 3, "AC", 1, 11000]];
  const ids = {};
  for (const [n, f, t, c, r] of rooms) {
    ids[n] = (await query("INSERT INTO rooms (number, floor, type, capacity, rent, deposit) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id", [n, f, t, c, r, r * 2])).rows[0].id;
  }
  const hash = await bcrypt.hash("Tenant@123", 10);
  const people = [
    ["Aarav Sharma", "aarav@demo.com", "9876500001", "101"], ["Rohan Patil", "rohan@demo.com", "9876500002", "101"],
    ["Kabir Mehta", "kabir@demo.com", "9876500003", "102"], ["Vikram Joshi", "vikram@demo.com", "9876500004", "201"],
    ["Ishaan Kulkarni", "ishaan@demo.com", "9876500005", "201"], ["Neel Deshmukh", "neel@demo.com", "9876500006", "301"],
    ["Aditya Nair", "aditya@demo.com", "9876500007", "302"], ["Samar Khan", "samar@demo.com", null, null],
  ];
  const users = [];
  for (const [name, email, phone, room] of people) {
    const joined = room ? monthOffset(3) + "-05" : null;
    users.push((await query(
      "INSERT INTO users (name, email, password_hash, phone, room_id, join_date, emergency_contact) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, room_id",
      [name, email, hash, phone, room ? ids[room] : null, joined, room ? "Parent: 98900" + Math.floor(10000 + Math.random() * 89999) : null])).rows[0]);
  }
  const rentOf = Object.fromEntries(rooms.map(([n, , , , r]) => [ids[n], r]));
  const png = demoPng();
  // Months 4..1 ago: mostly approved. Current month: a mix. Two tenants are behind on rent.
  for (let i = 0; i < 7; i++) {
    const u = users[i];
    for (let back = 3; back >= 1; back--) {
      if ((i === 3 || i === 5) && back <= 2) continue; // behind on rent
      await query("INSERT INTO payments (user_id, month, amount, proof, proof_type, status, reviewed_at, created_at) VALUES ($1,$2,$3,$4,'image/png','APPROVED', now(), now())", [u.id, monthOffset(back), rentOf[u.room_id], png]);
    }
  }
  const cur = monthOffset(0);
  await query("INSERT INTO payments (user_id, month, amount, proof, proof_type, status, reviewed_at) VALUES ($1,$2,$3,$4,'image/png','APPROVED', now())", [users[0].id, cur, rentOf[users[0].room_id], png]);
  await query("INSERT INTO payments (user_id, month, amount, proof, proof_type, status, reviewed_at) VALUES ($1,$2,$3,$4,'image/png','APPROVED', now())", [users[1].id, cur, rentOf[users[1].room_id], png]);
  await query("INSERT INTO payments (user_id, month, amount, proof, proof_type) VALUES ($1,$2,$3,$4,'image/png')", [users[2].id, cur, rentOf[users[2].room_id], png]);
  await query("INSERT INTO payments (user_id, month, amount, proof, proof_type) VALUES ($1,$2,$3,$4,'image/png')", [users[4].id, cur, rentOf[users[4].room_id], png]);
  await query("INSERT INTO payments (user_id, month, amount, proof, proof_type, status, admin_note, reviewed_at) VALUES ($1,$2,$3,$4,'image/png','REJECTED','Screenshot is blurry. Please upload again.', now())", [users[6].id, cur, rentOf[users[6].room_id], png]);

  const comp = [
    [0, "Wi-Fi is very slow at night", "Speed drops below 1 Mbps after 10 PM on the first floor.", "OTHER", "MEDIUM", "OPEN"],
    [3, "Tap leaking in bathroom", "Water keeps dripping from the wash basin tap.", "PLUMBING", "HIGH", "IN_PROGRESS"],
    [2, "Tube light not working", "Light above the study table needs replacement.", "ELECTRICAL", "LOW", "RESOLVED"],
  ];
  for (const [i, t, d, c, p, s] of comp) {
    await query("INSERT INTO complaints (user_id, title, description, category, priority, status, admin_response) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [users[i].id, t, d, c, p, s, s === "RESOLVED" ? "Replaced on Monday." : s === "IN_PROGRESS" ? "Plumber is coming tomorrow." : null]);
  }
  await query("INSERT INTO announcements (title, body, pinned) VALUES ('Rent due date', 'Please pay rent and upload the UPI screenshot by the 5th of every month.', true)");
  await query("INSERT INTO announcements (title, body) VALUES ('Water supply', 'Water will be off on Sunday from 10 AM to 1 PM for tank cleaning.')");
  for (let back = 0; back < 4; back++) {
    const m = monthOffset(back);
    await query("INSERT INTO expenses (title, category, amount, spent_on) VALUES ('Electricity bill','ELECTRICITY',$1,$2)", [9000 + back * 650, m + "-10"]);
    await query("INSERT INTO expenses (title, category, amount, spent_on) VALUES ('Cook salary','SALARY',$1,$2)", [12000, m + "-01"]);
  }
  console.log("Demo data added. Tenant logins use password Tenant@123 (e.g. aarav@demo.com).");
}

module.exports = { ensureAdmin, seedDemo, demoPng };

if (require.main === module) {
  (async () => {
    await migrate();
    await ensureAdmin();
    if (process.argv.includes("--demo")) await seedDemo();
    await getPool().end();
  })().catch((e) => { console.error(e.message); process.exit(1); });
}
