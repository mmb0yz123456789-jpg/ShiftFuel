// Keeps the Stripe card Element mounted after the booking accordion re-renders.
// booking-flow.js redraws the accordion as customers move between steps; without
// this helper, the original Stripe Element can stay attached to a removed DOM node.
(function () {
  if (!window.Stripe || window.Stripe.__shiftFuelRemountPatched) return;

  const originalStripe = window.Stripe;

  function elementHasFrame(target) {
    return Boolean(target && target.querySelector && target.querySelector("iframe"));
  }

  function setupCardRemount(cardElement) {
    if (!cardElement || cardElement.__shiftFuelAutoRemount) return;
    cardElement.__shiftFuelAutoRemount = true;

    const originalMount = cardElement.mount.bind(cardElement);
    const originalUnmount = typeof cardElement.unmount === "function" ? cardElement.unmount.bind(cardElement) : null;
    let mounting = false;

    cardElement.mount = function patchedMount(target) {
      return originalMount(target);
    };

    function remountIfNeeded() {
      const target = document.querySelector("#booking-card-element");
      if (!target || mounting || elementHasFrame(target)) return;

      try {
        mounting = true;
        if (originalUnmount) {
          try { originalUnmount(); } catch (_) {}
        }
        originalMount(target);
      } catch (error) {
        console.warn("Stripe card remount skipped:", error);
      } finally {
        mounting = false;
      }
    }

    const observer = new MutationObserver(remountIfNeeded);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setInterval(remountIfNeeded, 500);
    window.setTimeout(remountIfNeeded, 0);
  }

  function patchedStripe(...args) {
    const stripe = originalStripe.apply(this, args);
    if (!stripe || stripe.__shiftFuelElementsPatched || typeof stripe.elements !== "function") return stripe;

    const originalElements = stripe.elements.bind(stripe);
    stripe.elements = function patchedElements(...elementArgs) {
      const elements = originalElements(...elementArgs);
      if (!elements || elements.__shiftFuelCreatePatched || typeof elements.create !== "function") return elements;

      const originalCreate = elements.create.bind(elements);
      elements.create = function patchedCreate(type, options) {
        const element = originalCreate(type, options);
        if (type === "card") setupCardRemount(element);
        return element;
      };
      elements.__shiftFuelCreatePatched = true;
      return elements;
    };

    stripe.__shiftFuelElementsPatched = true;
    return stripe;
  }

  Object.assign(patchedStripe, originalStripe);
  patchedStripe.__shiftFuelRemountPatched = true;
  window.Stripe = patchedStripe;
})();
