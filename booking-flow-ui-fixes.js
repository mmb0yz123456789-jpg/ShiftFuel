// Booking flow UI cleanup fixes.
// Keeps returning-customer saved options from showing duplicate cards and
// scrolls newly opened accordion steps high enough that the question/header is visible.
(function () {
  const SELECTORS = {
    flow: "[data-booking-flow]",
    activeCard: ".booking-accordion-card.is-active",
    card: ".returning-option-card",
    addressArea: "[data-returning-service-area]",
    vehicleArea: "[data-returning-vehicles]",
  };

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/use this address|use this vehicle|selected|edit|delete/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function dedupeCards(container, keyBuilder) {
    if (!container) return;
    const seen = new Set();
    container.querySelectorAll(SELECTORS.card).forEach((card) => {
      card.hidden = false;
      const key = keyBuilder(card);
      if (!key) return;
      if (seen.has(key)) {
        card.hidden = true;
        card.setAttribute("aria-hidden", "true");
      } else {
        seen.add(key);
        card.removeAttribute("aria-hidden");
      }
    });
  }

  function addressKey(card) {
    return normalizeText(card.textContent);
  }

  function vehicleKey(card) {
    const title = normalizeText(card.querySelector("strong")?.textContent || "");
    const plateLine = Array.from(card.querySelectorAll("span"))
      .map((span) => span.textContent || "")
      .find((text) => /^\s*plate\s*:/i.test(text));
    const plate = normalizeText(String(plateLine || "").replace(/^\s*plate\s*:/i, ""));
    return normalizeText([title, plate].filter(Boolean).join(" "));
  }

  function cleanReturningOptions(root = document) {
    root.querySelectorAll(SELECTORS.addressArea).forEach((area) => {
      dedupeCards(area, addressKey);
    });
    root.querySelectorAll(SELECTORS.vehicleArea).forEach((area) => {
      dedupeCards(area, vehicleKey);
    });
  }

  function scrollActiveStepIntoView() {
    const active = document.querySelector(SELECTORS.activeCard);
    if (!active) return;
    const header = document.querySelector(".site-header");
    const headerHeight = header ? header.getBoundingClientRect().height : 0;
    const extraSpace = 18;
    const top = active.getBoundingClientRect().top + window.scrollY - headerHeight - extraSpace;
    window.scrollTo({ top: Math.max(top, 0), behavior: "smooth" });
  }

  function scheduleScroll() {
    window.setTimeout(scrollActiveStepIntoView, 80);
    window.setTimeout(scrollActiveStepIntoView, 220);
  }

  function init() {
    const flow = document.querySelector(SELECTORS.flow);
    if (!flow) return;

    cleanReturningOptions(flow);

    flow.addEventListener("click", (event) => {
      if (event.target.closest("[data-continue], [data-back], [data-step-header]")) {
        scheduleScroll();
      }
    }, true);

    new MutationObserver(() => {
      cleanReturningOptions(flow);
    }).observe(flow, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
