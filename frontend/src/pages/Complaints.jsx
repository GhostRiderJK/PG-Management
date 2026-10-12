import { useState } from "react";
import { api } from "../api.js";
import { useLoad, useUI, PageHeader, Modal, Field, Loading, Empty, Badge, Icon, fdate, pretty } from "../ui.jsx";

const CATS = ["MAINTENANCE", "CLEANING", "ELECTRICAL", "PLUMBING", "FOOD", "NOISE", "OTHER"];

function Raise({ onClose, onDone }) {
  const { toast } = useUI();
  const [f, setF] = useState({ title: "", description: "", category: "MAINTENANCE", priority: "MEDIUM" });
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function send(e) {
    e.preventDefault(); setErr("");
    try { await api.addComplaint(f); toast("Complaint raised"); onDone(); } catch (e2) { setErr(e2.message); }
  }
  return (
    <Modal title="Raise a complaint" onClose={onClose}>
      <form onSubmit={send} className="form-grid">
        <div className="span-2"><Field label="What is the problem?"><input value={f.title} onChange={set("title")} required minLength={3} maxLength={100} /></Field></div>
        <Field label="Category"><select value={f.category} onChange={set("category")}>{CATS.map((c) => <option key={c} value={c}>{pretty(c)}</option>)}</select></Field>
        <Field label="How urgent?"><select value={f.priority} onChange={set("priority")}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></select></Field>
        <div className="span-2"><Field label="Details"><textarea rows="4" value={f.description} onChange={set("description")} required minLength={5} maxLength={1000} /></Field></div>
        {err && <p className="error span-2" role="alert">{err}</p>}
        <div className="modal-actions span-2"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary">Submit</button></div>
      </form>
    </Modal>
  );
}

function Respond({ c, onClose, onDone }) {
  const { toast } = useUI();
  const [status, setStatus] = useState(c.status);
  const [resp, setResp] = useState(c.admin_response || "");
  async function save(e) {
    e.preventDefault();
    try { await api.updateComplaint(c.id, { status, admin_response: resp || undefined }); toast("Complaint updated"); onDone(); } catch (er) { toast(er.message, "bad"); }
  }
  return (
    <Modal title={c.title} onClose={onClose}>
      <p>{c.description}</p>
      <p className="muted small-text">{c.tenant_name} · Room {c.room_number || "-"} · {fdate(c.created_at)}</p>
      <form onSubmit={save} className="stack">
        <Field label="Status"><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="OPEN">Open</option><option value="IN_PROGRESS">In progress</option><option value="RESOLVED">Resolved</option></select></Field>
        <Field label="Reply to tenant"><textarea rows="3" value={resp} onChange={(e) => setResp(e.target.value)} maxLength={500} /></Field>
        <div className="modal-actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary">Save</button></div>
      </form>
    </Modal>
  );
}

export default function Complaints({ user }) {
  const admin = user.role === "ADMIN";
  const [filter, setFilter] = useState("");
  const { data, error, reload } = useLoad(() => api.complaints(filter), [filter]);
  const [raising, setRaising] = useState(false);
  const [responding, setResponding] = useState(null);

  return (
    <>
      <PageHeader title="Complaints" sub={admin ? "Track and resolve issues raised by tenants" : "Raise an issue and follow its progress"}>
        {!admin && <button className="btn primary" onClick={() => setRaising(true)}><Icon name="plus" size={18} />Raise complaint</button>}
      </PageHeader>
      <div className="chips">
        {[["", "All"], ["OPEN", "Open"], ["IN_PROGRESS", "In progress"], ["RESOLVED", "Resolved"]].map(([k, l]) => (
          <button key={k} className={filter === k ? "chip on" : "chip"} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>
      {error ? <p className="error">{error}</p> : !data ? <Loading /> : data.length === 0 ? <section className="card"><Empty title="No complaints">{admin ? "All quiet for now." : "You have not raised any complaints."}</Empty></section> : (
        <div className="list">
          {data.map((c) => (
            <article className="card" key={c.id}>
              <header className="card-head"><h3>{c.title}</h3><span className="row-gap"><span className={`prio ${c.priority.toLowerCase()}`}>{pretty(c.priority)}</span><Badge status={c.status} /></span></header>
              <p>{c.description}</p>
              {c.admin_response && <p className="reply"><strong>Reply:</strong> {c.admin_response}</p>}
              <footer className="card-foot">
                <small className="muted">{pretty(c.category)} · {admin ? `${c.tenant_name}, Room ${c.room_number || "-"} · ` : ""}{fdate(c.created_at)}</small>
                {admin && <button className="link" onClick={() => setResponding(c)}>Update</button>}
              </footer>
            </article>
          ))}
        </div>
      )}
      {raising && <Raise onClose={() => setRaising(false)} onDone={() => { setRaising(false); reload(); }} />}
      {responding && <Respond c={responding} onClose={() => setResponding(null)} onDone={() => { setResponding(null); reload(); }} />}
    </>
  );
}
