import { api } from "../api.js";
import { useLoad, PageHeader, Loading, Empty, fdatetime, pretty } from "../ui.jsx";

export default function Audit() {
  const { data, error } = useLoad(api.audit);
  if (error) return <p className="error">{error}</p>;
  if (!data) return <Loading />;
  return (
    <>
      <PageHeader title="Activity log" sub="Security trail of logins and changes (latest 200)" />
      {data.length === 0 ? <section className="card"><Empty title="Nothing logged yet" /></section> : (
        <div className="table-wrap"><table>
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Detail</th><th>IP address</th></tr></thead>
          <tbody>{data.map((a) => (
            <tr key={a.id}><td>{fdatetime(a.created_at)}</td><td>{a.user_name || "-"}</td><td><span className={`tag ${/FAILED|LOCKED|REJECT|DEACT|DELETED/.test(a.action) ? "warn" : ""}`}>{pretty(a.action)}</span></td><td>{a.detail}</td><td><small className="muted">{a.ip}</small></td></tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  );
}
