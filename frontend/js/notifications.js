// notifications.js — Notifications tab: subscribe / unsubscribe.
// Surfaces the backend's exact message (covers all unsubscribe outcomes).

(function () {
  const subForm = document.getElementById("sub-form");
  const subEmail = document.getElementById("sub-email");
  const unsubForm = document.getElementById("unsub-form");
  const unsubEmail = document.getElementById("unsub-email");
  const status = document.getElementById("notif-status");

  function setStatus(msg, kind) {
    status.textContent = msg || "";
    status.className = "status" + (kind ? " status--" + kind : "");
  }

  subForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = subEmail.value.trim();
    if (!email) { setStatus("Email is required.", "error"); return; }
    setStatus("Subscribing…");
    const { ok, data } = await api.subscribe(email);
    setStatus((data && (data.message || data.error)) || (ok ? "Subscribed." : "Failed."), ok ? "ok" : "error");
    if (ok) subForm.reset();
  });

  unsubForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = unsubEmail.value.trim();
    if (!email) { setStatus("Email is required.", "error"); return; }
    setStatus("Unsubscribing…");
    const { ok, data } = await api.unsubscribe(email);
    setStatus((data && (data.message || data.error)) || (ok ? "Unsubscribed." : "Failed."), ok ? "ok" : "error");
    if (ok) unsubForm.reset();
  });
})();
