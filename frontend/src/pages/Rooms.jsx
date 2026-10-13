import { useState } from "react";
import { api } from "../api.js";
import { useLoad, useUI, PageHeader, Modal, Field, Loading, Empty, Icon, money } from "../ui.jsx";

const blank = { number: "", floor: 1, type: "NON_AC", capacity: 2, rent: 6000, deposit: 12000 };

function RoomForm({ initial, onClose, onSaved }) {
  const { toast } = useUI();
  const [f, setF] = useState(initial || blank);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save(e) {
    e.preventDefault(); setErr("");
    try {
      const body = { ...f, floor: +f.floor, capacity: +f.capacity, rent: +f.rent, deposit: +f.deposit };
      initial ? await api.editRoom(initial.id, body) : await api.addRoom(body);
      toast(initial ? "Room updated" : "Room added"); onSaved();
    } catch (e2) { setErr(e2.message); }
  }
  return (
    <Modal title={initial ? `Edit room ${initial.number}` : "Add a room"} onClose={onClose}>
      <form onSubmit={save} className="form-grid">
        <Field label="Room number"><input value={f.number} onChange={set("number")} required maxLength={20} /></Field>
        <Field label="Floor"><input type="number" min="0" max="50" value={f.floor} onChange={set("floor")} required /></Field>
        <Field label="Type"><select value={f.type} onChange={set("type")}><option value="NON_AC">Non-AC</option><option value="AC">AC</option></select></Field>
        <Field label="Beds"><input type="number" min="1" max="20" value={f.capacity} onChange={set("capacity")} required /></Field>
        <Field label="Rent per bed (₹)"><input type="number" min="0" value={f.rent} onChange={set("rent")} required /></Field>
        <Field label="Deposit (₹)"><input type="number" min="0" value={f.deposit} onChange={set("deposit")} required /></Field>
        {err && <p className="error span-2" role="alert">{err}</p>}
        <div className="modal-actions span-2"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary">Save room</button></div>
      </form>
    </Modal>
  );
}

export default function Rooms() {
  const { toast, confirm } = useUI();
  const { data: rooms, error, reload } = useLoad(api.rooms);
  const [editing, setEditing] = useState(null); // null | "new" | room

  async function remove(r) {
    if (!(await confirm(`Delete room ${r.number}? This cannot be undone.`, "Delete room"))) return;
    try { await api.deleteRoom(r.id); toast("Room deleted"); reload(); } catch (e) { toast(e.message, "bad"); }
  }
  if (error) return <p className="error">{error}</p>;
  if (!rooms) return <Loading />;
  const floors = [...new Set(rooms.map((r) => r.floor))];

  return (
    <>
      <PageHeader title="Rooms" sub={`${rooms.length} rooms · ${rooms.reduce((s, r) => s + r.tenants.length, 0)} of ${rooms.reduce((s, r) => s + r.capacity, 0)} beds filled`}>
        <button className="btn primary" onClick={() => setEditing("new")}><Icon name="plus" size={18} />Add room</button>
      </PageHeader>
      {rooms.length === 0 && <section className="card"><Empty title="No rooms yet">Add your first room to start assigning tenants.</Empty></section>}
      {floors.map((fl) => (
        <section key={fl} className="floor">
          <h2 className="floor-title">{fl === 0 ? "Ground floor" : `Floor ${fl}`}</h2>
          <div className="grid">
            {rooms.filter((r) => r.floor === fl).map((r) => (
              <article className="card room" key={r.id}>
                <header className="card-head"><h3>Room {r.number}</h3><span className={`tag ${r.type === "AC" ? "ac" : ""}`}>{r.type === "AC" ? "AC" : "Non-AC"}</span></header>
                <p><strong>{money(r.rent)}</strong> <span className="muted">per bed · deposit {money(r.deposit)}</span></p>
                <div className="beds" aria-label={`${r.tenants.length} of ${r.capacity} beds filled`}>
                  {Array.from({ length: r.capacity }).map((_, i) => <span key={i} className={i < r.tenants.length ? "bed full" : "bed"} title={r.tenants[i]?.name || "Free bed"} />)}
                </div>
                <p className="muted small-text">{r.tenants.length ? r.tenants.map((t) => t.name).join(", ") : "Empty"}</p>
                <footer className="card-foot"><button className="link" onClick={() => setEditing(r)}>Edit</button><button className="link danger" onClick={() => remove(r)}>Delete</button></footer>
              </article>
            ))}
          </div>
        </section>
      ))}
      {editing && <RoomForm initial={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}
