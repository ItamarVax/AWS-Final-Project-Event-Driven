// inventory.js — Inventory tab: Show inventory (listOrders) → rows w/ Edit+Delete.

(function () {
  const btn = document.getElementById("inventory-btn");
  const listWrap = document.getElementById("inventory-list");
  const status = document.getElementById("inventory-status");

  function setStatus(msg, kind) {
    status.textContent = msg || "";
    status.className = "status" + (kind ? " status--" + kind : "");
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
  function fmtDate(iso) { return iso ? iso.replace("T", " ").replace("Z", " UTC") : "—"; }

  function render(orders) {
    if (!orders.length) { listWrap.innerHTML = '<p class="empty">No orders yet.</p>'; return; }
    const container = document.createElement("div");
    container.className = "orders";
    for (const o of orders) {
      const row = document.createElement("article");
      row.className = "order-row";
      row.innerHTML = `
        <div class="order-row__id" title="${escapeHtml(o.orderId)}">${escapeHtml(String(o.orderId).slice(0, 8))}…</div>
        <div class="order-row__main">
          <div class="order-row__desc">${escapeHtml(o.description ?? "")}</div>
          <div class="order-row__meta">
            ${o.category ? `<span class="tag">${escapeHtml(o.category)}</span>` : ""}
            <span>created ${escapeHtml(fmtDate(o.creationDate))}</span>
            <span>modified ${escapeHtml(fmtDate(o.lastModifiedDate))}</span>
          </div>
        </div>
        <div class="order-row__price">$${Number(o.price).toFixed(2)}</div>
        <div class="order-row__actions">
          <button class="btn btn--ghost" data-act="edit">edit</button>
          <button class="btn btn--danger" data-act="del">delete</button>
        </div>`;
      row.querySelector('[data-act="edit"]').addEventListener("click", () => window.ordersEditById(o.orderId));
      row.querySelector('[data-act="del"]').addEventListener("click", () => handleDelete(o));
      container.appendChild(row);
    }
    listWrap.innerHTML = "";
    listWrap.appendChild(container);
  }

  async function loadInventory() {
    setStatus("Loading…");
    const { ok, data } = await api.listOrders();
    if (!ok) { setStatus((data && data.error) || "Failed to load inventory.", "error"); return; }
    const orders = data.orders || [];
    render(orders);
    setStatus(`${data.count ?? orders.length} order(s).`, "ok");
  }

  async function handleDelete(order) {
    const shortId = String(order.orderId).slice(0, 8);
    if (!confirm(`Delete order ${shortId}… (${order.description})?`)) return;
    setStatus("Deleting…");
    const { ok, data } = await api.deleteOrder(order.orderId);
    if (!ok) { setStatus((data && data.error) || "Delete failed.", "error"); return; }
    setStatus((data && data.message) || "Order deleted.", "ok");
    loadInventory();
  }

  btn.addEventListener("click", loadInventory);
})();
