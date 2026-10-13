import { createContext, useCallback, useContext, useEffect, useState } from "react";

/* ---------- formatting ---------- */
export const money = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
export const fdate = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "-");
export const fdatetime = (d) => (d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "-");
export const monthLabel = (m) => new Date(m + "-01T00:00:00").toLocaleDateString("en-IN", { month: "short", year: "numeric" });
export const pretty = (s) => String(s).toLowerCase().replace(/_/g, " ");

/* ---------- icons ---------- */
const PATHS = {
  dashboard: "M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z",
  rooms: "M3 20V8m0 8h18m0 4v-7a3 3 0 0 0-3-3h-8v6M7 11.5h.01",
  users: "M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1m13-9a3 3 0 1 0 0-6m5 15v-1a4 4 0 0 0-3-3.9M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
  wallet: "M3 7a2 2 0 0 1 2-2h13v4M3 7v11a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2zm14 7h.01",
  wrench: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4 2.5-2.5z",
  bell: "M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9m4 13a2 2 0 0 0 4 0",
  coins: "M12 6c4.4 0 8-1.1 8-2.5S16.4 1 12 1 4 2.1 4 3.5 7.6 6 12 6zM4 3.5v5C4 9.9 7.6 11 12 11s8-1.1 8-2.5v-5M4 8.5v5c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-5M4 13.5v5c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-5",
  shield: "M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6l8-3zm-3 9l2 2 4-4",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14l5-5-5-5m5 5H9",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2m0 18v2M4.2 4.2l1.4 1.4m12.8 12.8l1.4 1.4M1 12h2m18 0h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z",
  plus: "M12 5v14M5 12h14",
  download: "M12 3v12m0 0l-4-4m4 4l4-4M4 21h16",
  printer: "M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2M6 14h12v7H6z",
  check: "M5 13l4 4L19 7",
  x: "M6 6l12 12M18 6L6 18",
  pin: "M12 17v5m-4-9l-2 4h12l-2-4V5h1V3H7v2h1z",
};
export const Icon = ({ name, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={PATHS[name]} />
  </svg>
);

/* ---------- toasts + confirm ---------- */
const Ctx = createContext(null);
export const useUI = () => useContext(Ctx);

export function Providers({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirm] = useState(null);

  const toast = useCallback((message, type = "ok") => {
    const id = Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);
  const confirm = useCallback((message, okLabel = "Confirm") =>
    new Promise((resolve) => setConfirm({ message, okLabel, resolve })), []);
  const close = (v) => { confirmState.resolve(v); setConfirm(null); };

  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>)}
      </div>
      {confirmState && (
        <Modal title="Are you sure?" onClose={() => close(false)} small>
          <p>{confirmState.message}</p>
          <div className="modal-actions">
            <button className="btn" onClick={() => close(false)}>Cancel</button>
            <button className="btn danger-solid" onClick={() => close(true)}>{confirmState.okLabel}</button>
          </div>
        </Modal>
      )}
    </Ctx.Provider>
  );
}

/* ---------- building blocks ---------- */
export function Modal({ title, onClose, children, small }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={small ? "modal small" : "modal"} role="dialog" aria-modal="true" aria-label={title}>
        <header className="no-print"><h3>{title}</h3><button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button></header>
        {children}
      </div>
    </div>
  );
}

export const Field = ({ label, children, hint }) => (
  <label className="field"><span>{label}</span>{children}{hint && <small className="muted">{hint}</small>}</label>
);

export const Badge = ({ status }) => <span className={`badge ${String(status).toLowerCase()}`}>{pretty(status)}</span>;

export const Empty = ({ title, children }) => (
  <div className="empty"><strong>{title}</strong>{children && <p>{children}</p>}</div>
);

export const Loading = () => <div className="loading"><span /><span /><span /></div>;

export function PageHeader({ title, sub, children }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{sub && <p className="muted">{sub}</p>}</div>
      <div className="head-actions">{children}</div>
    </div>
  );
}

export function Stat({ label, value, sub, tone }) {
  return (
    <div className={`stat ${tone || ""}`}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}

export function useLoad(fn, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    try { setData(await fn()); setError(""); } catch (e) { setError(e.message); }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, [reload]);
  return { data, error, reload, loading: data === null && !error };
}

/* ---------- chart: collected vs expenses ---------- */
export function BarChart({ series }) {
  const W = 620, H = 240, pad = { l: 52, r: 10, t: 14, b: 32 };
  const max = Math.max(1000, ...series.flatMap((s) => [s.collected, s.expenses]));
  const nice = Math.ceil(max / 1000) * 1000;
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const group = iw / series.length, bw = Math.min(28, group / 3);
  const y = (v) => pad.t + ih - (v / nice) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(nice * f));
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Rent collected versus expenses for the last six months">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="grid-line" />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="axis">{t >= 1000 ? t / 1000 + "k" : t}</text>
          </g>
        ))}
        {series.map((s, i) => {
          const cx = pad.l + group * i + group / 2;
          return (
            <g key={s.month}>
              <rect x={cx - bw - 2} y={y(s.collected)} width={bw} height={Math.max(0, pad.t + ih - y(s.collected))} rx="4" className="bar-in"><title>{`Collected ${money(s.collected)}`}</title></rect>
              <rect x={cx + 2} y={y(s.expenses)} width={bw} height={Math.max(0, pad.t + ih - y(s.expenses))} rx="4" className="bar-out"><title>{`Expenses ${money(s.expenses)}`}</title></rect>
              <text x={cx} y={H - 10} textAnchor="middle" className="axis">{monthLabel(s.month).split(" ")[0]}</text>
            </g>
          );
        })}
      </svg>
      <figcaption><span className="key in" />Rent collected <span className="key out" />Expenses</figcaption>
    </figure>
  );
}

export function downloadText(filename, text, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
