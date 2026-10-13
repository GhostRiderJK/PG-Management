import { useState } from "react";
import { api } from "../api.js";
import { useLoad, useUI, PageHeader, Modal, Field, Loading, Empty, Badge, fdate } from "../ui.jsx";

function EditTenant({ t, onClose, onSaved }) {
  const { toast } = useUI();
  const [f, setF] = useState({ phone: t.phone || "", emergency_contact: t.emergency_contact || "", join_date: t.join_date || "" });
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save(e) {
    e.preventDefault(); setErr("");
    try {
      await api.editTenant(t.id, { phone: f.phone || null, emergency_contact: f.emergency_contact || null, join_date: f.join_date || null });
      toast("Tenant updated"); onSaved();
    } catch (e2) { setErr(e2.message); }
  }
  return (
    <Modal title={`Edit ${t.name}`} onClose={onClose}>
      <form onSubmit={save} className="form-grid">
        <Field label="Phone"><input value={f.phone} onChange={set("phone")} inputMode="tel" /></Field>
        <Field label="Joining date"><input type="date" value={f.join_date} onChange={set("join_date")} /></Field>
        <div className="span-2"><Field label="Emergency contact" hint="Name and number of a parent or guardian"><input value={f.emergency_contact} onChange={set("emergency_contact")} maxLength={100} /></Field></div>
        {err && <p className="error span-2" role="alert">{err}</p>}
        <div className="modal-actions span-2"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary">Save</button></div>
      </form>
    </Modal>
  );
}

export default function Tenants() {
  const { toast, confirm } = useUI();
  const { data: tenants, error, reload } = useLoad(api.tenants);
  const { data: rooms, reload: reloadRooms } = useLoad(api.rooms);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);

  async function assign(t, value) {
    try { await api.assignRoom(t.id, value === "" ? null : Number(value)); toast(value === "" ? `${t.name} moved out` : "Room assigned"); }
    catch (e) { toast(e.message, "bad"); }
    reload(); reloadRooms();
  }
  async function toggle(t) {
    const off = t.active;
    if (off && !(await confirm(`Deactivate ${t.name}? They will be logged out and removed from their room.`, "Deactivate"))) return;
    try { await api.editTenant(t.id, { active: !off }); toast(off ? "Tenant deactivated" : "Tenant reactivated"); reload(); reloadRooms(); }
    catch (e) { toast(e.message, "bad"); }
  }

  if (error) return <p className="error">{error}</p>;
  if (!tenants) return <Loading />;
  const shown = tenants.filter((t) => (t.name + t.email + (t.room_number || "")).toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHeader title="Tenants" sub={`${tenants.filter((t) => t.active).length} active tenants`}>
        <input className="search" type="search" placeholder="Search name, email or room" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tenants" />
      </PageHeader>
      {shown.length === 0 ? <section className="card"><Empty title={tenants.length ? "No match" : "No tenants yet"}>{tenants.length ? "Try a different search." : "Tenants appear here after they create an account."}</Empty></section> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Tenant</th><th>Contact</th><th>Joined</th><th>Room</th><th>Status</th><th /></tr></thead>
          <tbody>
            {shown.map((t) => (
              <tr key={t.id} className={t.active ? "" : "dim"}>
                <td><strong>{t.name}</strong><br /><small className="muted">{t.email}</small></td>
                <td>{t.phone || <span className="muted">-</span>}<br /><small className="muted">{t.emergency_contact}</small></td>
                <td>{t.join_date ? fdate(t.join_date) : "-"}</td>
                <td>
                  <select value={t.room_id ?? ""} disabled={!t.active} onChange={(e) => assign(t, e.target.value)} aria-label={`Room for ${t.name}`}>
                    <option value="">Not assigned</option>
                    {rooms?.map((r) => <option key={r.id} value={r.id}>Room {r.number} ({r.tenants.length}/{r.capacity})</option>)}
                  </select>
                </td>
                <td><Badge status={t.active ? "ACTIVE" : "INACTIVE"} /></td>
                <td className="actions"><button className="link" onClick={() => setEditing(t)}>Edit</button><button className={t.active ? "link danger" : "link"} onClick={() => toggle(t)}>{t.active ? "Deactivate" : "Reactivate"}</button></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {editing && <EditTenant t={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}
