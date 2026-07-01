(function () {
  "use strict";

  function phoneDigits(value) {
    const digits = String(value || "").replace(/\D/g, "");
    return digits.length === 11 && digits[0] === "1" ? digits.slice(1) : digits.slice(0, 10);
  }

  function formatPhone(value) {
    const digits = phoneDigits(value);
    if (!digits) return "";
    if (digits.length <= 3) return `(${digits}`;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  function isValidPhone(value) {
    return phoneDigits(value).length === 10;
  }

  function phoneCursorFromDigitCount(value, digitCount) {
    if (digitCount <= 0) return 0;
    let seen = 0;
    for (let i = 0; i < value.length; i += 1) {
      if (/\d/.test(value[i])) seen += 1;
      if (seen >= digitCount) return i + 1;
    }
    return value.length;
  }

  function attachPhoneInput(input) {
    if (!input || input.dataset.phoneFormatBound === "1") return;
    input.dataset.phoneFormatBound = "1";
    const apply = () => {
      const start = input.selectionStart || 0;
      const digitsBeforeCursor = phoneDigits(input.value.slice(0, start)).length;
      const formatted = formatPhone(input.value);
      input.value = formatted;
      const nextCursor = phoneCursorFromDigitCount(formatted, digitsBeforeCursor);
      try {
        input.setSelectionRange(nextCursor, nextCursor);
      } catch (_) {
        // Some input types do not support cursor control.
      }
    };
    input.addEventListener("input", apply);
    input.addEventListener("blur", apply);
    if (input.value) apply();
  }

  function attachAll(root = document) {
    root.querySelectorAll('input[type="tel"], input[data-phone]').forEach(attachPhoneInput);
  }

  window.ShiftFuelPhone = Object.freeze({
    digits: phoneDigits,
    format: formatPhone,
    isValid: isValidPhone,
    attachInput: attachPhoneInput,
    attachAll,
    validationMessage: "Enter a valid 10-digit phone number.",
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => attachAll());
  } else {
    attachAll();
  }
})();
