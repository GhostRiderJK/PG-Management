import { useState } from "react";
import { api } from "../api.js";
import { useLoad, useUI, PageHeader, Modal, Field, Loading, Empty, Icon, fdate } from "../ui.jsx";

export default function Notices({ user }) {
  const admin = user.role === "ADMIN";
  const { toast, confirm } = useUI();
  const { data, error, reload } = useLoad(api.notices);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", body: "", pinned: false });
  const [err, setErr] = useState("");

  async function post(e) {
    e.preventDefault(); setErr("");
    try { await api.addNotice(f); toast("Notice posted"); setOpen(false); setF({ title: "", body: "", pinned: false }); reload(); } catch (e2) { setErr(e2.message); }
  }
  async function remove(n) {
    if (!(await confirm(`Delete the notice "${n.title}"?`, "Delete"))) return;
    try { await api.deleteNotice(n.id); reload(); } catch (e) { toast(e.message, "bad"); }
  }

  return (
    <>
      <PageHeader title="Notice board" sub="Announcements for everyone in the PG">
        {admin && <button className="btn primary" onClick={() => setOpen(true)}><Icon name="plus" size={18} />New notice</button>}
      </PageHeader>
      {error ? <p className="error">{error}</p> : !data ? <Loading /> : data.length === 0 ? <section className="card"><Empty title="No notices yet">{admin ? "Post rules, due dates or maintenance schedules." : "Your PG owner has not posted anything."}</Empty></section> : (
        <div className="list">
          {data.map((n) => (
            <article key={n.id} className={n.pinned ? "card pinned" : "card"}>
              <header className="card-head"><h3>{n.pinned && <Icon name="pin" size={16} />} {n.title}</h3>{admin && <button className="link danger" onClick={() => remove(n)}>Delete</button>}</header>
              <p className="pre">{n.body}</p>
              <small className="muted">{fdate(n.created_at)}</small>
            </article>
          ))}
        </div>
      )}
      {open && (
        <Modal title="New notice" onClose={() => setOpen(false)}>
          <form onSubmit={post} className="stack">
            <Field label="Title"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required minLength={3} maxLength={100} /></Field>
            <Field label="Message"><textarea rows="5" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} required minLength={3} maxLength={2000} /></Field>
            <label className="check"><input type="checkbox" checked={f.pinned} onChange={(e) => setF({ ...f, pinned: e.target.checked })} />Pin to the top</label>
            {err && <p className="error" role="alert">{err}</p>}
            <div className="modal-actions"><button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn primary">Post notice</button></div>
          </form>
        </Modal>
      )}
    </>
  );
}
