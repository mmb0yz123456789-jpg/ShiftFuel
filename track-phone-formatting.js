// Track page phone formatting cleanup.
// Allows customers to type/paste 10 digits and displays phone numbers as (XXX) XXX-XXXX.
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
    const digitsBeforeCursor = cleanPhone(input.value.slice(0, input.selectionStart || 0)).length;
    const formatted = formatPhone(input.value);
    input.value = formatted;

    let position = formatted.length;
    let seenDigits = 0;
    for (let index = 0; index < formatted.length; index += 1) {
      if (/\d/.test(formatted[index])) seenDigits += 1;
      if (seenDigits >= digitsBeforeCursor) {
        position = index + 1;
        break;
      }
    }

    try {
      input.setSelectionRange(position, position);
    } catch {
      // Some mobile browsers do not allow cursor control for every input state.
    }
  }

  function bindPhoneInput(input) {
    if (!input || input.dataset.trackPhoneCleanupBound) return;
    input.dataset.trackPhoneCleanupBound = "1";
    input.setAttribute("inputmode", "numeric");
    input.setAttribute("maxlength", "14");
    input.setAttribute("autocomplete", "tel");
    input.addEventListener("input", () => formatPhoneInput(input));
    input.addEventListener("blur", () => {
      input.value = formatPhone(input.value);
    });
    formatPhoneInput(input);
  }

  function formatVisiblePhoneText(root = document) {
    root.querySelectorAll(".worker-phone").forEach((element) => {
      const formatted = formatPhone(element.textContent);
      if (formatted) element.textContent = formatted;
    });

    root.querySelectorAll("input[type='tel'], .cb-customer-phone").forEach((input) => {
      if (input.value) input.value = formatPhone(input.value);
    });
  }

  function init() {
    const trackingPhone = document.querySelector("#tracking-phone");
    bindPhoneInput(trackingPhone);
    formatVisiblePhoneText();

    const trackForm = document.querySelector("#track-form");
    trackForm?.addEventListener("submit", (event) => {
      const input = document.querySelector("#tracking-phone");
      const message = document.querySelector("#track-message");
      const digits = cleanPhone(input?.value || "");

      if (input && digits && digits.length !== 10) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (message) message.textContent = "Enter a 10 digit phone number, or search by email or request number.";
        input.focus();
        return;
      }

      if (input && digits.length === 10) {
        input.value = formatPhone(digits);
      }
    }, true);

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            formatVisiblePhoneText(node);
          }
        });
      });
    });

    const trackingResult = document.querySelector("#tracking-result");
    if (trackingResult) {
      observer.observe(trackingResult, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
