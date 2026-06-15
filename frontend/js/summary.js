// summary.js — PDF Summary tab. Renders the presigned URL as a link
// (returned in the body, never logged).

(function () {
  const btn = document.getElementById("summary-btn");
  const result = document.getElementById("summary-result");

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    result.innerHTML = '<p class="status">Generating PDF summary…</p>';
    const { ok, data } = await api.getSummary();
    btn.disabled = false;
    if (!ok) {
      result.innerHTML = `<p class="status status--error">${(data && data.error) || "Failed to generate summary."}</p>`;
      return;
    }
    result.innerHTML = `
      <p class="status status--ok">Summary built from ${data.deletedOrderCount} backed-up order(s).</p>
      <a class="btn btn--accent" href="${data.url}" target="_blank" rel="noopener">Open PDF ↗</a>
      <p class="hint">Link is valid for about 1 hour.</p>`;
  });
})();
