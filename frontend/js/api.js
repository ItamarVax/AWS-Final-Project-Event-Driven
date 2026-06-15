// api.js — every backend call lives here. No business logic, only transport.
// Each method resolves to { ok, status, data } so callers can uniformly
// surface success messages and error bodies.

async function request(path, { method = "GET", body } = {}) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, opts);
    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: text };
      }
    }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return {
      ok: false,
      status: 0,
      data: { error: "Could not reach the server. Check your connection and try again." },
    };
  }
}

const api = {
  listOrders:   ()            => request("/orders"),
  getOrder:     (id)          => request(`/orders/${encodeURIComponent(id)}`),
  createOrder:  (order)       => request("/orders", { method: "POST", body: order }),
  updateOrder:  (id, changes) => request(`/orders/${encodeURIComponent(id)}`, { method: "PUT", body: changes }),
  deleteOrder:  (id)          => request(`/orders/${encodeURIComponent(id)}`, { method: "DELETE" }),
  subscribe:    (email)       => request("/subscriptions", { method: "POST", body: { email } }),
  // DELETE with a body — the unsubscribe Lambda reads event.body, and fetch
  // forwards the body on DELETE, so this works as-is.
  unsubscribe:  (email)       => request("/subscriptions", { method: "DELETE", body: { email } }),
  getSummary:   ()            => request("/summary"),
  // `image` is the full FileReader.readAsDataURL() string; the Lambda strips
  // the data-URL prefix itself.
  analyzeImage: (image)       => request("/orders/analyze-image", { method: "POST", body: { image } }),
};
