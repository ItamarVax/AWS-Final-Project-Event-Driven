// orders.js — Orders tab: create + scan, and the single-order detail panel.
// getOrder is the only way a single order is shown (after create/update, and
// when Inventory's Edit is clicked). The full list lives on the Inventory tab.

(function () {
  const form = document.getElementById("order-form");
  const idField = document.getElementById("order-id");
  const fDesc = document.getElementById("f-description");
  const fPrice = document.getElementById("f-price");
  const fCategory = document.getElementById("f-category");
  const submitBtn = document.getElementById("order-submit");
  const cancelBtn = document.getElementById("order-cancel");
  const scanInput = document.getElementById("scan-input");
  const scanStatus = document.getElementById("scan-status");
  const status = document.getElementById("orders-status");
  const detailCard = document.getElementById("detail-card");
  const detail = document.getElementById("order-detail");

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

  function resetForm() {
    form.reset();
    idField.value = "";
    submitBtn.textContent = "Create order";
    cancelBtn.hidden = true;
  }
  function fillForm(order) {
    idField.value = order.orderId;
    fDesc.value = order.description ?? "";
    fPrice.value = order.price ?? "";
    fCategory.value = order.category ?? "";
    submitBtn.textContent = "Update order";
    cancelBtn.hidden = false;
  }

  function renderDetail(order) {
    detailCard.hidden = false;
    detail.innerHTML = `
      <dl class="detail">
        <div><dt>Order ID</dt><dd>${escapeHtml(order.orderId)}</dd></div>
        <div><dt>Description</dt><dd>${escapeHtml(order.description ?? "")}</dd></div>
        <div><dt>Price</dt><dd>$${Number(order.price).toFixed(2)}</dd></div>
        <div><dt>Category</dt><dd>${order.category ? escapeHtml(order.category) : "—"}</dd></div>
        <div><dt>Created</dt><dd>${escapeHtml(fmtDate(order.creationDate))}</dd></div>
        <div><dt>Last modified</dt><dd>${escapeHtml(fmtDate(order.lastModifiedDate))}</dd></div>
      </dl>
      <div class="detail__actions">
        <button type="button" class="btn btn--ghost" id="detail-edit">Edit this order</button>
        <button type="button" class="btn btn--danger" id="detail-delete">Delete this order</button>
      </div>`;
    detail.querySelector("#detail-edit").addEventListener("click", () => {
      fillForm(order);
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    detail.querySelector("#detail-delete").addEventListener("click", () => handleDetailDelete(order));
  }

  // Delete the order currently shown in the detail panel.
  async function handleDetailDelete(order) {
    setStatus("Deleting…");
    const { ok, data } = await api.deleteOrder(order.orderId);
    if (!ok) { setStatus((data && data.error) || "Delete failed.", "error"); return; }
    detailCard.hidden = true;
    detail.innerHTML = "";
    if (idField.value === order.orderId) resetForm();
    setStatus((data && data.message) || "Order deleted.", "ok");
  }

  // GET /orders/{id} → show it in the detail panel.
  async function showOrder(orderId) {
    setStatus("Loading order…");
    const { ok, data } = await api.getOrder(orderId);
    if (!ok) { setStatus((data && data.error) || "Failed to load order.", "error"); return; }
    renderDetail(data);
    setStatus("Showing order " + String(orderId).slice(0, 8) + "…", "ok");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const description = fDesc.value.trim();
    const price = parseFloat(fPrice.value);
    const category = fCategory.value.trim();
    if (!description) { setStatus("Description is required.", "error"); return; }
    if (Number.isNaN(price)) { setStatus("Price must be a number.", "error"); return; }
    const payload = { description, price };
    if (category) payload.category = category;
    const editingId = idField.value;
    setStatus(editingId ? "Updating…" : "Creating…");
    const { ok, data } = editingId
      ? await api.updateOrder(editingId, payload)
      : await api.createOrder(payload);
    if (!ok) { setStatus((data && data.error) || "Request failed.", "error"); return; }
    resetForm();
    setStatus(editingId ? "Order updated." : "Order created.", "ok");
    showOrder(data.orderId);
  }

  function handleScan() {
    const file = scanInput.files[0];
    if (!file) return;
    scanStatus.textContent = "Analyzing image…";
    const reader = new FileReader();
    reader.onload = async () => {
      const { ok, data } = await api.analyzeImage(reader.result);
      if (!ok) { scanStatus.textContent = (data && data.error) || "Scan failed."; return; }
      if (data.description) fDesc.value = data.description;
      if (typeof data.suggestedPrice === "number") fPrice.value = data.suggestedPrice;
      if (data.category) fCategory.value = data.category;
      const labels = (data.labels || []).map((l) => `${l.name} ${Number(l.confidence).toFixed(0)}%`).join(" · ");
      scanStatus.textContent = labels ? `Detected: ${labels}` : "No labels detected.";
    };
    reader.onerror = () => { scanStatus.textContent = "Could not read the image file."; };
    reader.readAsDataURL(file);
  }

  form.addEventListener("submit", handleSubmit);
  cancelBtn.addEventListener("click", resetForm);
  scanInput.addEventListener("change", handleScan);
})();
