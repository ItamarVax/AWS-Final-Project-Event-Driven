// inventory.js — Inventory tab: Show inventory (listOrders) → rows with inline
// Edit (edit the row's values in place → updateOrder) and Delete.

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

  // Build one row element that flips between display and inline-edit modes.
  function makeRow(order) {
    const row = document.createElement("article");
    row.className = "order-row";

    function renderDisplay(o) {
      row.classList.remove("order-row--editing");
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
      row.querySelector('[data-act="edit"]').addEventListener("click", () => renderEdit(o));
      row.querySelector('[data-act="del"]').addEventListener("click", () => handleDelete(o));
    }

    function renderEdit(o) {
      row.classList.add("order-row--editing");
      row.innerHTML = `
        <div class="order-row__id" title="${escapeHtml(o.orderId)}">${escapeHtml(String(o.orderId).slice(0, 8))}…</div>
        <div class="order-row__main row-edit">
          <input class="row-edit__desc" type="text" value="${escapeHtml(o.description ?? "")}" placeholder="Description" />
          <input class="row-edit__category" type="text" value="${o.category ? escapeHtml(o.category) : ""}" placeholder="Category (optional)" />
        </div>
        <div class="order-row__price">
          <input class="row-edit__price" type="number" step="0.01" min="0" value="${o.price ?? ""}" />
        </div>
        <div class="order-row__actions">
          <button class="btn btn--accent" data-act="save">save</button>
          <button class="btn btn--ghost" data-act="cancel">cancel</button>
        </div>`;
      const descI = row.querySelector(".row-edit__desc");
      const catI = row.querySelector(".row-edit__category");
      const priceI = row.querySelector(".row-edit__price");
      descI.focus();
      row.querySelector('[data-act="cancel"]').addEventListener("click", () => renderDisplay(o));
      row.querySelector('[data-act="save"]').addEventListener("click", () => handleSave(o, descI, catI, priceI));
    }

    async function handleSave(o, descI, catI, priceI) {
      const description = descI.value.trim();
      const price = parseFloat(priceI.value);
      const category = catI.value.trim();
      if (!description) { setStatus("Description is required.", "error"); return; }
      if (Number.isNaN(price)) { setStatus("Price must be a number.", "error"); return; }
      const payload = { description, price };
      if (category) payload.category = category;
      setStatus("Saving…");
      const { ok, data } = await api.updateOrder(o.orderId, payload);
      if (!ok) { setStatus((data && data.error) || "Update failed.", "error"); return; }
      setStatus("Order " + String(o.orderId).slice(0, 8) + "… updated.", "ok");
      renderDisplay(data); // data = ALL_NEW updated order returned by PUT
    }

    async function handleDelete(o) {
      setStatus("Deleting…");
      const { ok, data } = await api.deleteOrder(o.orderId);
      if (!ok) { setStatus((data && data.error) || "Delete failed.", "error"); return; }
      setStatus((data && data.message) || "Order deleted.", "ok");
      row.remove();
    }

    renderDisplay(order);
    return row;
  }

  function render(orders) {
    if (!orders.length) { listWrap.innerHTML = '<p class="empty">No orders yet.</p>'; return; }
    const container = document.createElement("div");
    container.className = "orders";
    for (const o of orders) container.appendChild(makeRow(o));
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

  btn.addEventListener("click", loadInventory);
})();
