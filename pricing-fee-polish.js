// Safe pricing polish: landing copy + booking total recovery.
(function () {
  const percent = 0.029;
  const fixed = 0.30;

  function dollars(value) {
    return `$${(Number(value) || 0).toFixed(2)}`;
  }

  function recovery(subtotal) {
    const amount = Number(subtotal) || 0;
    if (!amount) return 0;
    return Math.max(1, Math.ceil(((amount + fixed) / (1 - percent)) - amount));
  }

  function patchTotals() {
    if (typeof window.calculateTotals !== "function" || window.calculateTotals.__sfRecovery) return;
    const original = window.calculateTotals;
    window.calculateTotals = function () {
      const totals = original();
      const subtotal =
        Number(totals.fuelEstimate || 0) +
        Number(totals.washAmount || 0) +
        Number(totals.fuelFee || 0) +
        Number(totals.washFee || 0) +
        Number(totals.quickFee || 0);
      const feeRecovery = recovery(subtotal);
      return Object.assign({}, totals, {
        serviceFeeRecovery: feeRecovery,
        estimatedTotal: Math.ceil(subtotal + feeRecovery),
      });
    };
    window.calculateTotals.__sfRecovery = true;
  }

  function updateLandingCopy() {
    document.querySelectorAll(".pricing-from").forEach((item) => {
      item.innerHTML = item.innerHTML
        .replace("$15 <span>service fee</span>", "$15+ <span>starting service fee</span>")
        .replace("$15 service fee", "$15+ starting service fee");
    });
    document.querySelectorAll(".pricing-disclaimer").forEach((item) => {
      item.textContent = "Service fees start at $15. Final authorization includes estimated fuel or wash cost, the service fee, and a payment processing recovery. Final totals are rounded up to the nearest dollar.";
    });
  }

  function updatePaymentSummary() {
    if (typeof window.calculateTotals !== "function") return;
    const totals = window.calculateTotals();
    document.querySelectorAll("[data-payment-summary] .review-summary-list").forEach((list) => {
      const totalRow = Array.from(list.children).find((row) => /estimated total/i.test(row.textContent || ""));
      if (!totalRow) return;
      let recoveryRow = list.querySelector("[data-service-fee-recovery]");
      if (!recoveryRow) {
        recoveryRow = document.createElement("div");
        recoveryRow.dataset.serviceFeeRecovery = "1";
        list.insertBefore(recoveryRow, totalRow);
      }
      recoveryRow.innerHTML = `<dt>Payment processing recovery</dt><dd>${dollars(totals.serviceFeeRecovery)}</dd>`;
      const totalAmount = totalRow.querySelector("dd");
      if (totalAmount) totalAmount.textContent = dollars(totals.estimatedTotal);
    });
    document.querySelectorAll(".summary-total-amount").forEach((amount) => {
      amount.textContent = dollars(totals.estimatedTotal);
    });
  }

  function run() {
    patchTotals();
    updateLandingCopy();
    updatePaymentSummary();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();

  let tries = 0;
  const timer = window.setInterval(() => {
    run();
    tries += 1;
    if (tries > 20) window.clearInterval(timer);
  }, 300);
})();
