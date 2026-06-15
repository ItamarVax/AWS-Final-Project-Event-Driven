// app.js — tab switching between the three panels. Defaults to Orders.

(function () {
  const tabs = document.querySelectorAll("[data-tab]");
  const panels = document.querySelectorAll(".panel");

  function activate(name) {
    tabs.forEach((t) => t.classList.toggle("is-active", t.dataset.tab === name));
    panels.forEach((p) => p.classList.toggle("is-active", p.id === `tab-${name}`));
  }

  tabs.forEach((t) => t.addEventListener("click", () => activate(t.dataset.tab)));
  activate("orders");
})();
