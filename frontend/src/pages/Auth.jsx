import { useState } from "react";
import { api } from "../api.js";

export default function Auth({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      const user = mode === "login"
        ? await api.login({ email: form.email, password: form.password })
        : await api.register({ name: form.name, email: form.email, password: form.password, phone: form.phone || undefined });
      onAuth(user);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <main className="auth">
      <section className="auth-brand">
        <div className="logo big"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 20V8m0 8h18m0 4v-7a3 3 0 0 0-3-3h-8v6" /></svg></div>
        <h1>Run your PG without the notebook.</h1>
        <p>Rooms, rent approvals, complaints and notices in one place. Tenants pay by UPI and upload the screenshot. You approve it in one tap.</p>
        <ul>
          <li>Live view of every bed and who sleeps in it</li>
          <li>See who has not paid before the month ends</li>
          <li>Printable receipts for every approved payment</li>
        </ul>
      </section>
      <section className="auth-form">
        <form onSubmit={submit}>
          <h2>{mode === "login" ? "Welcome back" : "Create tenant account"}</h2>
          {mode === "register" && (
            <>
              <label className="field"><span>Full name</span><input value={form.name} onChange={set("name")} required minLength={2} autoComplete="name" /></label>
              <label className="field"><span>Phone (optional)</span><input value={form.phone} onChange={set("phone")} inputMode="tel" autoComplete="tel" /></label>
            </>
          )}
          <label className="field"><span>Email</span><input type="email" value={form.email} onChange={set("email")} required autoComplete="email" /></label>
          <label className="field"><span>Password</span>
            <input type="password" value={form.password} onChange={set("password")} required autoComplete={mode === "login" ? "current-password" : "new-password"} />
            {mode === "register" && <small className="muted">At least 8 characters with an uppercase letter, a lowercase letter and a number.</small>}
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn primary block" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}</button>
          <button type="button" className="link center" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>
            {mode === "login" ? "New tenant? Create an account" : "Already registered? Log in"}
          </button>
        </form>
      </section>
    </main>
  );
}
