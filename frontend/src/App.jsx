import { useEffect, useState } from "react";
import { api, setUnauthorizedHandler } from "./api.js";
import { Icon, Loading } from "./ui.jsx";
import Auth from "./pages/Auth.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Rooms from "./pages/Rooms.jsx";
import Tenants from "./pages/Tenants.jsx";
import Payments from "./pages/Payments.jsx";
import Complaints from "./pages/Complaints.jsx";
import Notices from "./pages/Notices.jsx";
import Expenses from "./pages/Expenses.jsx";
import Audit from "./pages/Audit.jsx";
import Profile from "./pages/Profile.jsx";

const ADMIN_NAV = [
  ["dashboard", "Dashboard", "dashboard"], ["rooms", "Rooms", "rooms"], ["tenants", "Tenants", "users"],
  ["payments", "Payments", "wallet"], ["complaints", "Complaints", "wrench"], ["notices", "Notices", "bell"],
  ["expenses", "Expenses", "coins"], ["audit", "Activity", "shield"],
];
const TENANT_NAV = [
  ["dashboard", "Home", "dashboard"], ["payments", "Rent", "wallet"], ["complaints", "Complaints", "wrench"], ["notices", "Notices", "bell"],
];

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState(location.hash.slice(1) || "dashboard");
  const [theme, setTheme] = useState(document.documentElement.dataset.theme);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    api.me().then(setUser).catch(() => {}).finally(() => setReady(true));
    const onHash = () => setPage(location.hash.slice(1) || "dashboard");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = (p) => { location.hash = p; setPage(p); window.scrollTo(0, 0); };
  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next; localStorage.setItem("pg_theme", next); setTheme(next);
  }
  async function logout() { try { await api.logout(); } catch { /* ignore */ } setUser(null); location.hash = ""; }

  if (!ready) return <div className="boot"><Loading /></div>;
  if (!user) return <Auth onAuth={(u) => { setUser(u); go("dashboard"); }} />;

  const admin = user.role === "ADMIN";
  const nav = admin ? ADMIN_NAV : TENANT_NAV;
  const current = [...nav.map((n) => n[0]), "profile"].includes(page) ? page : "dashboard";
  const views = {
    dashboard: <Dashboard user={user} go={go} />,
    rooms: admin && <Rooms />, tenants: admin && <Tenants />, expenses: admin && <Expenses />, audit: admin && <Audit />,
    payments: <Payments user={user} />, complaints: <Complaints user={user} />, notices: <Notices user={user} />,
    profile: <Profile user={user} onUser={setUser} />,
  };

  return (
    <div className="shell">
      <aside className="sidebar no-print">
        <div className="brand"><span className="logo"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 20V8m0 8h18m0 4v-7a3 3 0 0 0-3-3h-8v6" /></svg></span><strong>PG Manager</strong></div>
        <nav aria-label="Main">
          {nav.map(([key, label, icon]) => (
            <button key={key} className={current === key ? "nav on" : "nav"} onClick={() => go(key)} aria-current={current === key ? "page" : undefined}>
              <Icon name={icon} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <button className={current === "profile" ? "nav on" : "nav"} onClick={() => go("profile")}><Icon name="user" /><span>{user.name.split(" ")[0]}</span></button>
          <button className="nav" onClick={toggleTheme} aria-label="Toggle dark mode"><Icon name={theme === "dark" ? "sun" : "moon"} /><span>{theme === "dark" ? "Light mode" : "Dark mode"}</span></button>
          <button className="nav" onClick={logout}><Icon name="logout" /><span>Log out</span></button>
        </div>
      </aside>
      <main className="content">{views[current]}</main>
    </div>
  );
}
