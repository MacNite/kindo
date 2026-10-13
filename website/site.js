// With a hosted demo configured (config.js), Live demo buttons open it directly
// and the demo page shows its address next to the local instructions.
(function () {
  var url = window.KINDO_DEMO_URL;
  if (!url) return;
  document.querySelectorAll("[data-demo-link]").forEach(function (a) {
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
  });
  document.querySelectorAll("[data-demo-hosted]").forEach(function (el) {
    el.hidden = false;
  });
  document.querySelectorAll("[data-demo-url]").forEach(function (el) {
    el.textContent = url;
  });
})();
