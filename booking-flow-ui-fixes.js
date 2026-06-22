// Booking flow UI cleanup fixes.
// Keeps returning-customer saved options from showing duplicate cards,
// adds delete for saved addresses, hides unavailable return times, and scrolls
// newly opened accordion steps high enough that the question/header is visible.
(function () {
  const SELECTORS = {
    flow: "[data-booking-flow]",
    activeCard: ".booking-accordion-card.is-active",
    card: ".returning-option-card",
    addressArea: "[data-returning-service-area]",
    vehicleArea: "[data-returning-vehicles]",
    returnTime: "select[data-return-time]",
  };

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/use this address|use this vehicle|selected|edit|delete/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function cardsIn(container) {
    return Array.from(container.querySelectorAll(SELECTORS.card));
  }

  function dedupeCards(container, keyBuilder) {
    if (!container) return;
    const seen = new Set();
    cardsIn(container).forEach((card) => {
      card.hidden = false;
      card.style.display = "";
      const key = keyBuilder(card);
      if (!key) return;
      if (seen.has(key)) {
        card.hidden = true;
        card.style.display = "none";
        card.setAttribute("aria-hidden", "true");
      } else {
        seen.add(key);
        card.removeAttribute("aria-hidden");
      }
    });
  }

  function cardTextSpans(card) {
    return Array.from(card.querySelectorAll(":scope > span"))
      .map((span) => span.textContent || "")
      .filter(Boolean);
  }

  function addressKey(card) {
    return normalizeText(cardTextSpans(card).join(" "));
  }

  function vehicleKey(card) {
    const title = normalizeText(card.querySelector("strong")?.textContent || "");
    const plateLine = cardTextSpans(card).find((text) => /^\s*plate\s*:/i.test(text));
    const plate = normalizeText(String(plateLine || "").replace(/^\s*plate\s*:/i, ""));
    return normalizeText([title, plate].filter(Boolean).join(" "));
  }

  function queryAreas(root, selector) {
    const areas = [];
    if (root.matches?.(selector)) areas.push(root);
    root.querySelectorAll?.(selector).forEach((area) => areas.push(area));
    return areas;
  }

  function ensureAddressDeleteButtons(area) {
    queryAreas(area, SELECTORS.addressArea).forEach((addressArea) => {
      cardsIn(addressArea).forEach((card) => {
        const actions = card.querySelector(".returning-customer-actions");
        const editButton = card.querySelector("[data-edit-returning-address]");
        if (!actions || !editButton || actions.querySelector("[data-delete-returning-address]")) return;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "button danger";
        button.textContent = "Delete";
        button.dataset.deleteReturningAddress = editButton.dataset.editReturningAddress || "";
        actions.appendChild(button);
      });
    });
  }

  function cleanReturningOptions(root = document) {
    queryAreas(root, SELECTORS.addressArea).forEach((area) => {
      ensureAddressDeleteButtons(area);
      dedupeCards(area, addressKey);
    });
    queryAreas(root, SELECTORS.vehicleArea).forEach((area) => {
      dedupeCards(area, vehicleKey);
    });
  }

  function hideUnavailableReturnTimes(root = document) {
    root.querySelectorAll(SELECTORS.returnTime).forEach((select) => {
      const selectedValue = select.value;
      Array.from(select.options).forEach((option) => {
        if (option.value && option.disabled) option.remove();
      });
      if (selectedValue && Array.from(select.options).some((option) => option.value === selectedValue)) {
        select.value = selectedValue;
      }
    });
  }

  function cleanupFlow(root = document) {
    cleanReturningOptions(root);
    hideUnavailableReturnTimes(root);
  }

  function customerPhone() {
    const text = document.body.textContent || "";
    const match = text.match(/\(\d{3}\)\s*\d{3}-\d{4}|\b\d{10}\b/);
    return match ? match[0].replace(/\D/g, "") : "";
  }

  function customerEmail() {
    const input = document.querySelector('[name="verifyEmail"], [name="customerEmail"]');
    return String(input?.value || "").trim().toLowerCase();
  }

  async function deleteReturningAddress(button) {
    const card = button.closest(SELECTORS.card);
    const area = button.closest(SELECTORS.addressArea);
    if (!card || !area) return;
    const confirmed = confirm("Delete this saved service address? This removes it from future booking options only. Past requests will not be changed.");
    if (!confirmed) return;

    const addressId = button.dataset.deleteReturningAddress || "";
    const phone = customerPhone();
    const email = customerEmail();

    button.disabled = true;
    button.textContent = "Deleting...";

    if (window.ShiftFuelSupabase && addressId && phone && email) {
      try {
        const { error } = await window.ShiftFuelSupabase.rpc("public_soft_delete_saved_address", {
          p_address_id: addressId,
          p_phone: phone,
          p_email: email,
        });
        if (error) throw error;
      } catch (error) {
        console.warn("Could not soft delete saved address from database:", error);
      }
    }

    const key = addressKey(card);
    cardsIn(area).forEach((candidate) => {
      if (addressKey(candidate) === key) candidate.remove();
    });
    cleanupFlow(document);
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

    cleanupFlow(flow);

    flow.addEventListener("click", (event) => {
      const deleteAddress = event.target.closest("[data-delete-returning-address]");
      if (deleteAddress) {
        event.preventDefault();
        deleteReturningAddress(deleteAddress);
        return;
      }

      if (event.target.closest("[data-continue], [data-back], [data-step-header]")) {
        scheduleScroll();
        window.setTimeout(() => cleanupFlow(flow), 100);
      }
    }, true);

    flow.addEventListener("change", (event) => {
      if (event.target.matches('[name="serviceDate"], [name="serviceType"]')) {
        window.setTimeout(() => hideUnavailableReturnTimes(flow), 80);
      }
    }, true);

    new MutationObserver(() => cleanupFlow(flow)).observe(flow, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
