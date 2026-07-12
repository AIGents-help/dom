// Shared behavior for public/templates/*.html.
document.addEventListener("DOMContentLoaded", function () {
  // Auto-fill today's date into any field tagged for it (e.g. the "entered
  // into on ___ (date)" line already present in the waiver/release forms).
  var today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  document.querySelectorAll('[data-autofill="today"]').forEach(function (el) {
    if (!el.value) el.value = today;
  });

  // Auto-grow multi-line fill fields to their content on-screen, so nothing
  // is hidden behind a scrollbar before printing (the print stylesheet
  // handles the printed-page side of the same problem).
  function autoGrow(el) {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }
  document.querySelectorAll("textarea.fill-block").forEach(function (el) {
    autoGrow(el);
    el.addEventListener("input", function () { autoGrow(el); });
  });
});
