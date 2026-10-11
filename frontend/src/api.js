let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

async function request(path, { method = "GET", body, form, text } = {}) {
  const headers = { "X-Requested-With": "pg-manager" };
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch("/api" + path, {
    method, headers, credentials: "same-origin",
    body: form || (body ? JSON.stringify(body) : undefined),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !path.startsWith("/auth/login")) onUnauthorized();
    throw new Error(data.error || "Something went wrong. Please try again.");
  }
  if (text) return res.text();
  return res.status === 204 ? null : res.json();
}

const post = (p, body) => request(p, { method: "POST", body });
const patch = (p, body) => request(p, { method: "PATCH", body });
const put = (p, body) => request(p, { method: "PUT", body });
const del = (p) => request(p, { method: "DELETE" });

export const api = {
  login: (b) => post("/auth/login", b),
  register: (b) => post("/auth/register", b),
  logout: () => post("/auth/logout"),
  me: () => request("/auth/me"),
  updateProfile: (b) => patch("/auth/profile", b),
  changePassword: (b) => post("/auth/change-password", b),

  adminDash: () => request("/dashboard/admin"),
  tenantDash: () => request("/dashboard/tenant"),

  rooms: () => request("/rooms"),
  addRoom: (b) => post("/rooms", b),
  editRoom: (id, b) => put(`/rooms/${id}`, b),
  deleteRoom: (id) => del(`/rooms/${id}`),

  tenants: () => request("/tenants"),
  editTenant: (id, b) => patch(`/tenants/${id}`, b),
  assignRoom: (id, room_id) => patch(`/tenants/${id}/room`, { room_id }),

  payments: (status) => request("/payments" + (status ? `?status=${status}` : "")),
  dues: () => request("/payments/dues"),
  submitPayment: (form) => request("/payments", { method: "POST", form }),
  reviewPayment: (id, b) => patch(`/payments/${id}`, b),
  receipt: (id) => request(`/payments/${id}/receipt`),
  exportCsv: () => request("/payments/export.csv", { text: true }),

  complaints: (status) => request("/complaints" + (status ? `?status=${status}` : "")),
  addComplaint: (b) => post("/complaints", b),
  updateComplaint: (id, b) => patch(`/complaints/${id}`, b),

  notices: () => request("/notices"),
  addNotice: (b) => post("/notices", b),
  deleteNotice: (id) => del(`/notices/${id}`),

  expenses: () => request("/expenses"),
  addExpense: (b) => post("/expenses", b),
  deleteExpense: (id) => del(`/expenses/${id}`),

  audit: () => request("/audit"),
};
