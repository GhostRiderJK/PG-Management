import { useState } from "react";
import { api } from "../api.js";
import { useLoad, useUI, PageHeader, Modal, Field, Loading, Empty, Icon, Stat, money, fdate, pretty } from "../ui.jsx";

const CATS = ["ELECTRICITY", "WATER", "FOOD", "MAINTENANCE", "SALARY", "INTERNET", "OTHER"];
const today = () => new Date().toISOString().slice(0, 10);

export default function Expenses() {
  const { toast, confirm } = useUI();
  const { data, error, reload } = useLoad(api.expenses);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", category: "ELECTRICITY", amount: "", spent_on: today() });
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function add(e) {
    e.preventDefault(); setErr("");
    try { await api.addExpense({ ...f, amount: +f.amount }); toast("Expense added"); setOpen(false); setF({ ...f, title: "", amount: "" }); reload(); } catch (e2) { setErr(e2.message); }
  }
  async function remove(x) {
    if (!(await confirm(`Delete "${x.title}"?`, "Delete"))) return;
    try { await api.deleteExpense(x.id); reload(); } catch (e) { toast(e.message, "bad"); }
  }
  if (error) return <p className="error">{error}</p>;
  if (!data) return <Loading />;
  const thisMonth = today().slice(0, 7);
  const total = data.filter((x) => x.spent_on.startsWith(thisMonth)).reduce((s, x) => s + x.amount, 0);

  return (
    <>
      <PageHeader title="Expenses" sub="Electricity, salaries, groceries and other costs">
        <button className="btn primary" onClick={() => setOpen(true)}><Icon name="plus" size={18} />Add expense</button>
      </PageHeader>
      <div className="stats"><Stat label="Spent this month" value={money(total)} /><Stat label="Entries" value={data.length} /></div>
      {data.length === 0 ? <section className="card"><Empty title="No expenses recorded">Add a bill to see income versus spending on the dashboard.</Empty></section> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Date</th><th>Item</th><th>Category</th><th>Amount</th><th /></tr></thead>
          <tbody>{data.map((x) => (
            <tr key={x.id}><td>{fdate(x.spent_on)}</td><td>{x.title}</td><td>{pretty(x.category)}</td><td>{money(x.amount)}</td><td className="actions"><button className="link danger" onClick={() => remove(x)}>Delete</button></td></tr>
          ))}</tbody>
        </table></div>
      )}
      {open && (
        <Modal title="Add expense" onClose={() => setOpen(false)}>
          <form onSubmit={add} className="form-grid">
            <div className="span-2"><Field label="What was it for?"><input value={f.title} onChange={set("title")} required minLength={2} maxLength={100} /></Field></div>
            <Field label="Category"><select value={f.category} onChange={set("category")}>{CATS.map((c) => <option key={c} value={c}>{pretty(c)}</option>)}</select></Field>
            <Field label="Amount (₹)"><input type="number" min="1" value={f.amount} onChange={set("amount")} required /></Field>
            <Field label="Date"><input type="date" value={f.spent_on} onChange={set("spent_on")} required /></Field>
            {err && <p className="error span-2" role="alert">{err}</p>}
            <div className="modal-actions span-2"><button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn primary">Add</button></div>
          </form>
        </Modal>
      )}
    </>
  );
}
