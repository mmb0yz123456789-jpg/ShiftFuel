// Pricing and fee polish for ShiftFuel booking + landing pages.
// Adds a payment processing recovery line so ShiftFuel still nets the service fee.
(function () {
  const STRIPE_PERCENT = 0.029;
  const STRIPE_FIXED = 0.30;

  function money(value) {
    return `$${(Number(value) || 0).toFixed(2)}`;
  }

  function processingFeeForSubtotal(subtotal) {
    const amount = Number(subtotal) || 0;
    if (!amount) return 0;
    // Gross up so the payment processor fee is covered, then round up to the next dollar.
    return Math.max(1, Math.ceil(((amount + STRIPE_FIXED) / (1 - STRIPE_PERCENT)) - amount));
  }

  function patchCalculateTotals() {
    if (typeof window.calculateTotals !== "function" || window.calculateTotals.__shiftFuelFeePatched) return;
    const original = window.calculateTotals;
    window.calculateTotals = function patchedCalculateTotals() {
      const totals = original();
      const subtotalBeforeProcessing =
        (Number(totals.fuelEstimate) || 0) +
        (Number(totals.washAmount) || 0) +
        (Number(totals.fuelFee) || 0) +
        (Number(totals.washFee) || 0) +
        (Number(totals.quickFee) || 0);
      const processingFee = processingFeeForSubtotal(subtotalBeforeProcessing);
      return {
        ...totals,
        processingFee,
        subtotalBeforeProcessing,
        estimatedTotal: Math.ceil(subtotalBeforeProcessing + processingFee),
      };
    };
    window.calculateTotals.__shiftFuelFeePatched = true;
  }

  function addPaymentFeeRows(root = document) {
    if (typeof window.calculateTotals !== "function") return;
    const totals = window.calculateTotals();

    root.querySelectorAll("[data-payment-summary] .review-summary-list").forEach((list) => {
      if (list.querySelector("[data-processing-fee-row]")) return;
      const totalRow = Array.from(list.children).find((row) => /estimated total/i.test(row.textContent || ""));
      if (!totalRow) return;
      if (totals.processingFee) {
        const row = document.createElement("div");
        row.dataset.processingFeeRow = "1";
        row.innerHTML = `<dt>Payment processing recovery</dt><dd>${money(totals.processingFee)}</dd>`;
        list.insertBefore(row, totalRow);
      }
      const totalAmount = totalRow.querySelector("dd");
      if (totalAmount) totalAmount.textContent = money(totals.estimatedTotal);
    });

    root.querySelectorAll(".summary-total-amount").forEach((amount) => {
      amount.textContent = money(totals.estimatedTotal);
    });
  }

  function polishLandingPricing() {
    document.querySelectorAll(".pricing-from").forEach((item) => {
      item.innerHTML = item.innerHTML
        .replace(/\$15\s*<span>service fee<\/span>/gi, "$15+ <span>starting service fee</span>")
        .replace(/\$15\s*service fee/gi, "$15+ starting service fee");
    });

    document.querySelectorAll(".pricing-disclaimer").forEach((item) => {
      if (/payment processing recovery/i.test(item.textContent || "")) return;
      item.textContent = "Service pricing starts at $15 and includes a payment processing recovery so ShiftFuel can net the posted service fee. Final fuel cost is based on the actual receipt. Final totals are rounded up to the nearest dollar.";
    });
  }

  function run(root = document) {
    patchCalculateTotals();
    polishLandingPricing();
    addPaymentFeeRows(root);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => run(document));
  else run(document);

  new MutationObserver((mutations) => {
    run(document);
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) run(node);
      });
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
