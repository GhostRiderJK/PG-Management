import { api } from "../api.js";
import { useLoad, PageHeader, Stat, BarChart, Loading, Empty, Badge, money, monthLabel, fdate } from "../ui.jsx";

function NoticeList({ go }) {
  const { data } = useLoad(api.notices);
  return (
    <section className="card">
      <header className="card-head"><h3>Notice board</h3><button className="link" onClick={() => go("notices")}>View all</button></header>
      {!data ? <Loading /> : data.length === 0 ? <Empty title="No notices">Announcements from your PG owner appear here.</Empty> :
        data.slice(0, 3).map((n) => (
          <article key={n.id} className="notice-mini"><strong>{n.title}</strong><p className="muted">{n.body}</p></article>
        ))}
    </section>
  );
}

function AdminDashboard({ go }) {
  const { data: d, error } = useLoad(api.adminDash);
  if (error) return <p className="error">{error}</p>;
  if (!d) return <Loading />;
  const pct = d.expected ? Math.min(100, Math.round((d.collected / d.expected) * 100)) : 0;
  return (
    <>
      <PageHeader title="Dashboard" sub={`Overview for ${monthLabel(d.month)}`} />
      <div className="stats">
        <Stat label="Occupancy" value={`${d.occupancy_pct}%`} sub={`${d.occupied} of ${d.capacity} beds filled`} />
        <Stat label="Rent collected" value={money(d.collected)} sub={`${pct}% of ${money(d.expected)} expected`} tone="good" />
        <button className="stat as-button" onClick={() => go("payments")}>
          <span className="stat-label">Waiting for approval</span><strong className="stat-value">{d.pending_payments}</strong><span className="stat-sub">payments to review</span>
        </button>
        <button className="stat as-button" onClick={() => go("complaints")}>
          <span className="stat-label">Open complaints</span><strong className="stat-value">{d.open_complaints}</strong><span className="stat-sub">need attention</span>
        </button>
      </div>
      <div className="two-col">
        <section className="card">
          <header className="card-head"><h3>Last 6 months</h3></header>
          <BarChart series={d.series} />
        </section>
        <section className="card">
          <header className="card-head"><h3>Rent overdue</h3><button className="link" onClick={() => go("payments")}>Open dues</button></header>
          {d.defaulters.length === 0 ? <Empty title="Everyone is up to date">No tenant has unpaid months.</Empty> : (
            <ul className="plain">
              {d.defaulters.map((t) => (
                <li key={t.id} className="row-between">
                  <span><strong>{t.name}</strong><br /><small className="muted">{t.months} month{t.months > 1 ? "s" : ""} unpaid{t.phone ? ` · ${t.phone}` : ""}</small></span>
                  <strong className="bad-text">{money(t.amount_due)}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <NoticeList go={go} />
    </>
  );
}

function TenantDashboard({ go, user }) {
  const { data: d, error } = useLoad(api.tenantDash);
  if (error) return <p className="error">{error}</p>;
  if (!d) return <Loading />;
  const status = d.this_month_status;
  return (
    <>
      <PageHeader title={`Hi, ${user.name.split(" ")[0]}`} sub="Here is your PG at a glance" />
      {!d.room ? (
        <section className="card"><Empty title="No room assigned yet">Your PG owner will assign you a room. You can pay rent after that.</Empty></section>
      ) : (
        <>
          <div className="stats">
            <Stat label="My room" value={`Room ${d.room.number}`} sub={`Floor ${d.room.floor} · ${d.room.type === "AC" ? "AC" : "Non-AC"}`} />
            <Stat label="Monthly rent" value={money(d.room.rent)} sub={`Deposit ${money(d.room.deposit)}`} />
            <Stat label={`${monthLabel(d.month)} rent`} value={status === "UNPAID" ? "Not paid" : status === "PENDING" ? "In review" : "Paid"} tone={status === "APPROVED" ? "good" : status === "UNPAID" ? "bad" : ""} sub={status === "UNPAID" ? "Upload your UPI screenshot" : status === "PENDING" ? "Waiting for owner" : "Thank you"} />
            <Stat label="Total dues" value={money(d.dues.amount)} sub={d.dues.unpaidMonths.length ? `${d.dues.unpaidMonths.length} month(s) unpaid` : "All clear"} tone={d.dues.amount ? "bad" : "good"} />
          </div>
          {status === "UNPAID" && (
            <section className="card callout">
              <div><strong>Rent for {monthLabel(d.month)} is not paid yet.</strong><p className="muted">Pay by UPI, then upload the screenshot so your owner can approve it.</p></div>
              <button className="btn primary" onClick={() => go("payments")}>Upload payment</button>
            </section>
          )}
        </>
      )}
      <NoticeList go={go} />
    </>
  );
}

export default function Dashboard({ user, go }) {
  return user.role === "ADMIN" ? <AdminDashboard go={go} /> : <TenantDashboard go={go} user={user} />;
}
