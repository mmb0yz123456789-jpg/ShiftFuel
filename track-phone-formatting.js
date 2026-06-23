// Track page phone formatting cleanup.
(function () {
  function cleanPhone(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 10);
  }

  function formatPhone(value) {
    const digits = cleanPhone(value);
    if (!digits) return "";
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  function formatPhoneInput(input) {
    if (!input) return;
    input.value = formatPhone(input.value);
  }

  function bindPhoneInput(input) {
    if (!input || input.dataset.trackPhoneCleanupBound) return;
    input.dataset.trackPhoneCleanupBound = "1";
    input.setAttribute("inputmode", "numeric");
    input.setAttribute("maxlength", "14");
    input.setAttribute("autocomplete", "tel");
    input.addEventListener("input", () => formatPhoneInput(input));
    input.addEventListener("blur", () => { input.value = formatPhone(input.value); });
    formatPhoneInput(input);
  }

  function formatVisiblePhoneText(root) {
    (root || document).querySelectorAll(".worker-phone").forEach((element) => {
      const formatted = formatPhone(element.textContent);
      if (formatted) element.textContent = formatted;
    });
  }

  function loadLiveLocationScript() {
    if (document.querySelector('script[data-track-live-location]')) return;
    const script = document.createElement('script');
    script.src = 'track-live-location.js';
    script.dataset.trackLiveLocation = '1';
    document.body.appendChild(script);
  }

  function init() {
    bindPhoneInput(document.querySelector("#tracking-phone"));
    formatVisiblePhoneText(document);
    loadLiveLocationScript();

    document.querySelector("#track-form")?.addEventListener("submit", (event) => {
      const input = document.querySelector("#tracking-phone");
      const message = document.querySelector("#track-message");
      const digits = cleanPhone(input?.value || "");

      if (input && digits && digits.length !== 10) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (message) message.textContent = "Enter a 10 digit phone number, or search by email or request number.";
        input.focus();
      }
    }, true);

    const trackingResult = document.querySelector("#tracking-result");
    if (trackingResult) {
      new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) formatVisiblePhoneText(node);
          });
        });
      }).observe(trackingResult, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
