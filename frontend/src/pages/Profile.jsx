import { useState } from "react";
import { api } from "../api.js";
import { useUI, PageHeader, Field } from "../ui.jsx";

export default function Profile({ user, onUser }) {
  const { toast } = useUI();
  const [p, setP] = useState({ name: user.name, phone: user.phone || "", emergency_contact: user.emergency_contact || "" });
  const [pw, setPw] = useState({ current: "", next: "" });
  const [pErr, setPErr] = useState(""), [wErr, setWErr] = useState("");

  async function saveProfile(e) {
    e.preventDefault(); setPErr("");
    try { onUser(await api.updateProfile({ name: p.name, phone: p.phone || null, emergency_contact: p.emergency_contact || null })); toast("Profile saved"); }
    catch (er) { setPErr(er.message); }
  }
  async function savePw(e) {
    e.preventDefault(); setWErr("");
    try { await api.changePassword(pw); setPw({ current: "", next: "" }); toast("Password changed"); } catch (er) { setWErr(er.message); }
  }
  return (
    <>
      <PageHeader title="My profile" sub={user.email} />
      <div className="two-col">
        <form className="card stack" onSubmit={saveProfile}>
          <h3>Details</h3>
          <Field label="Full name"><input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} required minLength={2} /></Field>
          <Field label="Phone"><input value={p.phone} onChange={(e) => setP({ ...p, phone: e.target.value })} inputMode="tel" /></Field>
          {user.role === "TENANT" && <Field label="Emergency contact"><input value={p.emergency_contact} onChange={(e) => setP({ ...p, emergency_contact: e.target.value })} maxLength={100} /></Field>}
          {pErr && <p className="error" role="alert">{pErr}</p>}
          <button className="btn primary">Save details</button>
        </form>
        <form className="card stack" onSubmit={savePw}>
          <h3>Change password</h3>
          <Field label="Current password"><input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required autoComplete="current-password" /></Field>
          <Field label="New password" hint="8+ characters with upper case, lower case and a number"><input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required autoComplete="new-password" /></Field>
          {wErr && <p className="error" role="alert">{wErr}</p>}
          <button className="btn primary">Update password</button>
        </form>
      </div>
    </>
  );
}
