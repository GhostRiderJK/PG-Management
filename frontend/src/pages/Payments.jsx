import { useState } from "react";
import { api } from "../api.js";
import { useLoad, useUI, PageHeader, Modal, Field, Loading, Empty, Badge, Icon, money, fdate, fdatetime, monthLabel, downloadText } from "../ui.jsx";

function Receipt({ id, onClose }) {
  const { data: r, error } = useLoad(() => api.receipt(id), [id]);
  return (
    <Modal title="Rent receipt" onClose={onClose}>
      {error ? <p className="error">{error}</p> : !r ? <Loading /> : (
        <div className="receipt print-area">
          <div className="receipt-head"><strong>PG Manager</strong><span>{r.receipt_no}</span></div>
          <h2>Rent received</h2>
          <dl>
            <div><dt>Received from</dt><dd>{r.tenant_name}</dd></div>
            <div><dt>Room</dt><dd>{r.room_number || "-"}</dd></div>
            <div><dt>For the month of</dt><dd>{monthLabel(r.month)}</dd></div>
            <div><dt>Mode</dt><dd>{r.method}</dd></div>
            <div><dt>Approved on</dt><dd>{fdate(r.approved_on)}</dd></div>
          </dl>
          <div className="receipt-total"><span>Amount</span><strong>{money(r.amount)}</strong></div>
          <p className="muted small-text">This is a computer generated receipt.</p>
        </div>
      )}
      <div className="modal-actions no-print"><button className="btn" onClick={onClose}>Close</button><button className="btn primary" onClick={() => window.print()} disabled={!r}><Icon name="printer" size={18} />Print</button></div>
    </Modal>
  );
}

function Review({ p, onClose, onDone }) {
  const { toast } = useUI();
  const [note, setNote] = useState("");
  async function decide(status) {
    try { await api.reviewPayment(p.id, { status, admin_note: note || undefined }); toast(status === "APPROVED" ? "Payment approved" : "Payment rejected"); onDone(); }
    catch (e) { toast(e.message, "bad"); }
  }
  return (
    <Modal title={`${p.tenant_name} · ${monthLabel(p.month)}`} onClose={onClose}>
      <p className="muted">Room {p.room_number || "-"} · {money(p.amount)} via {p.method} · sent {fdatetime(p.created_at)}</p>
      <img className="proof" src={`/api/payments/${p.id}/proof`} alt={`UPI screenshot from ${p.tenant_name}`} />
      <Field label="Note to tenant (optional)"><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="e.g. Amount does not match" /></Field>
      <div className="modal-actions">
        <button className="btn danger-solid" onClick={() => decide("REJECTED")}><Icon name="x" size={18} />Reject</button>
        <button className="btn primary" onClick={() => decide("APPROVED")}><Icon name="check" size={18} />Approve</button>
      </div>
    </Modal>
  );
}

function Submit({ onClose, onDone }) {
  const { toast } = useUI();
  const { data: dash } = useLoad(api.tenantDash);
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - i, 1)).map((d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  const [month, setMonth] = useState(months[0]);
  const [amount, setAmount] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const rent = dash?.room?.rent;

  async function send(e) {
    e.preventDefault(); setErr(""); setBusy(true);
    const fd = new FormData();
    fd.append("month", month); fd.append("amount", amount || rent); fd.append("proof", file);
    try { await api.submitPayment(fd); toast("Sent for approval"); onDone(); } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }
  return (
    <Modal title="Pay rent" onClose={onClose}>
      <form onSubmit={send} className="form-grid">
        <Field label="Rent for"><select value={month} onChange={(e) => setMonth(e.target.value)}>{months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select></Field>
        <Field label="Amount paid (₹)"><input type="number" min="1" value={amount} placeholder={rent ? String(rent) : ""} onChange={(e) => setAmount(e.target.value)} required={!rent} /></Field>
        <div className="span-2"><Field label="UPI payment screenshot" hint="JPG, PNG or WebP, up to 2 MB">
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files[0])} required />
        </Field></div>
        {file && <img className="proof span-2" src={URL.createObjectURL(file)} alt="Preview of your screenshot" />}
        {err && <p className="error span-2" role="alert">{err}</p>}
        <div className="modal-actions span-2"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? "Sending…" : "Send for approval"}</button></div>
      </form>
    </Modal>
  );
}

function Table({ rows, admin, onReview, onReceipt }) {
  if (!rows.length) return <section className="card"><Empty title="Nothing here yet">{admin ? "Payments appear when tenants submit them." : "Your submitted payments will be listed here."}</Empty></section>;
  return (
    <div className="table-wrap"><table>
      <thead><tr>{admin && <th>Tenant</th>}<th>Month</th><th>Amount</th><th>Status</th><th>Sent</th><th /></tr></thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.id}>
            {admin && <td><strong>{p.tenant_name}</strong><br /><small className="muted">Room {p.room_number || "-"}</small></td>}
            <td>{monthLabel(p.month)}</td>
            <td>{money(p.amount)}</td>
            <td><Badge status={p.status} />{p.admin_note && <><br /><small className="muted">{p.admin_note}</small></>}</td>
            <td>{fdatetime(p.created_at)}</td>
            <td className="actions">
              {admin && p.status === "PENDING" && <button className="btn small primary" onClick={() => onReview(p)}>Review</button>}
              {admin && p.status !== "PENDING" && <button className="link" onClick={() => onReview(p)}>View</button>}
              {p.status === "APPROVED" && <button className="link" onClick={() => onReceipt(p.id)}>Receipt</button>}
            </td>
          </tr>
        ))}
      </tbody>
    </table></div>
  );
}

function Dues() {
  const { data, error } = useLoad(api.dues);
  if (error) return <p className="error">{error}</p>;
  if (!data) return <Loading />;
  if (!data.length) return <section className="card"><Empty title="No dues">Every tenant with a room is paid up.</Empty></section>;
  return (
    <div className="table-wrap"><table>
      <thead><tr><th>Tenant</th><th>Room</th><th>Unpaid months</th><th>Amount due</th></tr></thead>
      <tbody>{data.map((t) => (
        <tr key={t.id}><td><strong>{t.name}</strong><br /><small className="muted">{t.phone || ""}</small></td><td>{t.room_number}</td>
          <td>{t.unpaid_months.map(monthLabel).join(", ")}</td><td><strong className="bad-text">{money(t.amount_due)}</strong></td></tr>
      ))}</tbody>
    </table></div>
  );
}

export default function Payments({ user }) {
  const admin = user.role === "ADMIN";
  const { toast } = useUI();
  const [tab, setTab] = useState(admin ? "PENDING" : "ALL");
  const { data, error, reload } = useLoad(() => api.payments(tab === "ALL" || tab === "DUES" ? "" : tab), [tab]);
  const [reviewing, setReviewing] = useState(null);
  const [receiptId, setReceiptId] = useState(null);
  const [paying, setPaying] = useState(false);

  async function exportCsv() {
    try { downloadText("payments.csv", await api.exportCsv()); } catch (e) { toast(e.message, "bad"); }
  }

  return (
    <>
      <PageHeader title={admin ? "Rent payments" : "My rent payments"} sub={admin ? "Approve UPI screenshots and track dues" : "Upload proof when you pay and download receipts"}>
        {admin ? <button className="btn" onClick={exportCsv}><Icon name="download" size={18} />Export CSV</button>
          : <button className="btn primary" onClick={() => setPaying(true)}><Icon name="plus" size={18} />Pay rent</button>}
      </PageHeader>
      {admin && (
        <div className="chips" role="tablist">
          {[["PENDING", "To review"], ["ALL", "All payments"], ["DUES", "Dues"]].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "chip on" : "chip"} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
      )}
      {tab === "DUES" ? <Dues /> : error ? <p className="error">{error}</p> : !data ? <Loading /> :
        <Table rows={data} admin={admin} onReview={setReviewing} onReceipt={setReceiptId} />}
      {reviewing && (reviewing.status === "PENDING"
        ? <Review p={reviewing} onClose={() => setReviewing(null)} onDone={() => { setReviewing(null); reload(); }} />
        : <Modal title={`${reviewing.tenant_name} · ${monthLabel(reviewing.month)}`} onClose={() => setReviewing(null)}><img className="proof" src={`/api/payments/${reviewing.id}/proof`} alt="UPI screenshot" /></Modal>)}
      {receiptId && <Receipt id={receiptId} onClose={() => setReceiptId(null)} />}
      {paying && <Submit onClose={() => setPaying(false)} onDone={() => { setPaying(false); reload(); }} />}
    </>
  );
}
