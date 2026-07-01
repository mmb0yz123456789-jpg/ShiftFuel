const CUSTOMER_ACCOUNT_KEY = "shiftfuel_customer_account";
const customerDb = window.ShiftFuelSupabase;
const loginForm = document.querySelector("[data-customer-login-form]");
const createForm = document.querySelector("[data-customer-create-form]");
const accountStatus = document.querySelector("[data-customer-account-status]");
const createStatus = document.querySelector("[data-customer-create-status]");
const accountModeButtons = document.querySelectorAll("[data-account-mode]");
const accountModePanels = document.querySelectorAll("[data-account-panel]");
const accountOpenButtons = document.querySelectorAll("[data-account-open]");
const accountCloseButtons = document.querySelectorAll("[data-account-close]");
const accountFormPanel = document.querySelector("[data-account-form]");
const accountBenefitsCard = document.querySelector("[data-account-benefits]");
const dashboard = document.querySelector("[data-customer-dashboard]");
const statsMount = document.querySelector("[data-customer-stats]");
const activeMount = document.querySelector("[data-active-requests]");
const vehiclesMount = document.querySelector("[data-saved-vehicles]");
const addressesMount = document.querySelector("[data-saved-addresses]");
const historyMount = document.querySelector("[data-service-history]");
const promosMount = document.querySelector("[data-customer-promos]");
const accountSummary = document.querySelector("[data-customer-account-summary]");
const greeting = document.querySelector("[data-customer-greeting]");
const accountIntroTitle = document.querySelector("#customer-account-title");
const accountIntroCopy = document.querySelector(".customer-account-intro p:not(.customer-dashboard-kicker)");
let activeAccountSession = null;
let activeAccountData = { requests: [], addresses: [], vehicles: [] };

const terminalStatuses = new Set([
  "completed",
  "cancelled",
]);

const statusLabels = {
  new: "New",
  assigned: "Assigned",
  en_route: "En route",
  in_service: "In service",
  returning: "Returning",
  completed: "Completed",
  cancelled: "Cancelled",
  request_received: "Request received",
  accepted: "Accepted",
  key_received: "Keys received",
  vehicle_picked_up: "Vehicle picked up",
  in_progress: "In service",
};

// Booking-status logic lives in shared-status.js (loaded before this file). The
// granular labels stay per-surface — statusLabel() below prefers this file's own
// statusLabels for the raw status, so customer copy ("Keys received", etc.) is
// unchanged, while the canonical bucketing is now the single shared source.
const canonicalBookingStatus = window.SF.canonicalBookingStatus;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function cleanPhone(value) {
  return window.ShiftFuelPhone?.digits(value) || String(value || "").replace(/\D/g, "").slice(0, 10);
}

function formatPhone(value) {
  return window.ShiftFuelPhone?.format(value) || value || "";
}

function publicNumber(id) {
  return `SF-${String(id || "").slice(0, 8).toUpperCase()}`;
}

function serviceDateLabel(value) {
  if (!value) return "Date not selected";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function statusLabel(status) {
  const raw = String(status || "new").toLowerCase();
  const canonicalStatus = canonicalBookingStatus(status);
  // Prefer this surface's own granular label for the raw status (e.g. "Keys
  // received"), falling back to the canonical bucket label.
  return statusLabels[raw] || statusLabels[canonicalStatus] || String(canonicalStatus || "Status pending").replace(/_/g, " ");
}

function customerNameFrom(requests = [], options = {}) {
  const firstRequest = requests.find((item) => item.customer_name)?.customer_name || "";
  const firstAddress = (options.addresses || []).find((item) => item.customer_name)?.customer_name || "";
  const firstVehicle = (options.vehicles || []).find((item) => item.customer_name)?.customer_name || "";
  return firstRequest || firstAddress || firstVehicle || "";
}

function readSession() {
  try {
    const session = JSON.parse(localStorage.getItem(CUSTOMER_ACCOUNT_KEY) || "null");
    if (!session?.phone || !session?.email) return null;
    return session;
  } catch (_) {
    return null;
  }
}

function writeSession(session) {
  localStorage.setItem(CUSTOMER_ACCOUNT_KEY, JSON.stringify({
    phone: cleanPhone(session.phone),
    email: String(session.email || "").trim().toLowerCase(),
    name: session.name || "",
    isNewAccount: Boolean(session.isNewAccount),
    savedAt: new Date().toISOString(),
  }));
}

function clearSession() {
  localStorage.removeItem(CUSTOMER_ACCOUNT_KEY);
}

function setStatus(type, message) {
  if (!accountStatus) return;
  accountStatus.dataset.status = type || "";
  accountStatus.textContent = message || "";
}

function setCreateStatus(type, message) {
  if (!createStatus) return;
  createStatus.dataset.status = type || "";
  createStatus.textContent = message || "";
}

function switchAccountMode(mode = "login") {
  const nextMode = mode === "create" ? "create" : "login";
  accountModeButtons.forEach((button) => {
    const isActive = button.dataset.accountMode === nextMode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });
  accountModePanels.forEach((panel) => {
    const isActive = panel.dataset.accountPanel === nextMode;
    panel.classList.toggle("is-active", isActive);
    panel.hidden = !isActive;
  });
  if (nextMode === "login") setCreateStatus("", "");
  else setStatus("", "");
}

// The login/create form is collapsed by default so first-time customers see the
// guest actions first. Reveal it only when they tap "Log In or Create Account".
function openAccountForm(mode, options = {}) {
  const shouldFocus = options.focus !== false;
  const shouldScroll = options.scroll !== false;
  if (accountFormPanel) accountFormPanel.hidden = false;
  if (accountBenefitsCard) accountBenefitsCard.hidden = true;
  accountOpenButtons.forEach((button) => button.setAttribute("aria-expanded", "true"));
  if (mode) switchAccountMode(mode);
  if (shouldScroll) accountFormPanel?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  const firstInput = accountFormPanel?.querySelector(".customer-account-mode-panel.is-active input");
  if (shouldFocus) {
    window.setTimeout(() => {
      try { firstInput?.focus({ preventScroll: true }); } catch (_) { /* focus is best-effort */ }
    }, 80);
  }
}

function closeAccountForm() {
  if (accountFormPanel) accountFormPanel.hidden = true;
  if (accountBenefitsCard) accountBenefitsCard.hidden = false;
  accountOpenButtons.forEach((button) => button.setAttribute("aria-expanded", "false"));
}

// Email is stored lowercase on submit; mirror that in the field as the customer
// types so what they see matches what is saved.
function bindEmailLowercase(root = document) {
  root.querySelectorAll('input[type="email"]').forEach((input) => {
    if (input.dataset.lowerBound === "1") return;
    input.dataset.lowerBound = "1";
    const lower = () => {
      const next = input.value.toLowerCase();
      if (next === input.value) return;
      const start = input.selectionStart;
      const end = input.selectionEnd;
      input.value = next;
      try { input.setSelectionRange(start, end); } catch (_) { /* not all inputs support it */ }
    };
    input.addEventListener("input", lower);
    input.addEventListener("blur", lower);
  });
}

function accountHasData(data = {}) {
  return Boolean(data.requests?.length || data.addresses?.length || data.vehicles?.length);
}

async function loadAccountData(session) {
  if (!customerDb) throw new Error("Account lookup is unavailable right now.");
  const phone = cleanPhone(session.phone);
  const email = String(session.email || "").trim().toLowerCase();
  if (!phone || !email) throw new Error("Phone and email are required.");

  const [requestsResult, optionsResult] = await Promise.all([
    customerDb.rpc("public_track_request", {
      p_request_id: null,
      p_phone: phone,
      p_email: email,
    }),
    customerDb.rpc("public_returning_customer_options", {
      p_phone: phone,
      p_email: email,
    }),
  ]);

  if (requestsResult.error) throw requestsResult.error;
  if (optionsResult.error) throw optionsResult.error;

  const requests = Array.isArray(requestsResult.data) ? requestsResult.data : [];
  const options = optionsResult.data || {};
  const addresses = Array.isArray(options.addresses) ? options.addresses : [];
  const vehicles = Array.isArray(options.vehicles) ? options.vehicles : [];
  return { requests, addresses, vehicles };
}

async function loadEligiblePromos(session, customerId = "") {
  try {
    const res = await fetch("/api/promos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "eligible",
        phone: session.phone,
        email: session.email,
        is_account: true,
        customer_id: customerId,
      }),
    });
    const data = await res.json().catch(() => ({}));
    return Array.isArray(data.promos) ? data.promos : [];
  } catch (error) {
    console.warn("[customer-account] promos unavailable:", error);
    return [];
  }
}

function emptyCard(message, action = "") {
  return `
    <article class="customer-empty-card">
      <p>${escapeHtml(message)}</p>
      ${action}
    </article>
  `;
}

function requestCard(request, type = "active") {
  const vehicle = [request.vehicle_year, request.vehicle_make, request.vehicle_model].filter(Boolean).join(" ");
  const service = request.service_label || request.service_type || "ShiftFuel service";
  const trackHref = `/track?request=${encodeURIComponent(publicNumber(request.id))}`;
  const repeatHref = `/book?repeat=${encodeURIComponent(publicNumber(request.id))}#booking-flow`;
  return `
    <article class="customer-request-card customer-request-card-${type}">
      <div>
        <strong>${escapeHtml(service)}</strong>
        <span>${escapeHtml(publicNumber(request.id))}</span>
      </div>
      <dl>
        <div><dt>Status</dt><dd>${escapeHtml(statusLabel(request.status))}</dd></div>
        <div><dt>Date</dt><dd>${escapeHtml(serviceDateLabel(request.service_date))}</dd></div>
        <div><dt>Vehicle</dt><dd>${escapeHtml(vehicle || "Vehicle details saved")}</dd></div>
      </dl>
      <a class="button secondary" href="${trackHref}">Open tracking</a>
      ${type === "history" ? `<a class="button secondary" href="${repeatHref}">Repeat service</a>` : ""}
    </article>
  `;
}

function vehicleCard(vehicle) {
  const title = [vehicle.vehicle_year, vehicle.vehicle_make, vehicle.vehicle_model].filter(Boolean).join(" ") || "Saved vehicle";
  return `
    <article class="customer-data-card">
      <strong>${escapeHtml(title)}</strong>
      <span>${vehicle.vehicle_color ? `Color: ${escapeHtml(vehicle.vehicle_color)}` : "Color not saved"}</span>
      <span>${vehicle.license_plate ? `Plate: ${escapeHtml(vehicle.license_plate)}` : "Plate not saved"}</span>
      ${vehicle.fuel_type ? `<span>Fuel: ${escapeHtml(vehicle.fuel_type)}</span>` : ""}
      <div class="customer-card-actions">
        <a class="button secondary" href="/book#booking-flow">Book this vehicle</a>
        <button class="button secondary" type="button" data-edit-vehicle="${escapeHtml(vehicle.id)}">Edit</button>
        <button class="button secondary" type="button" data-delete-vehicle="${escapeHtml(vehicle.id)}">Delete</button>
      </div>
    </article>
  `;
}

function addressCard(address) {
  const line1 = address.address_street || address.hospital || "Saved service address";
  const line2 = [address.address_apt, address.address_city, address.address_state, address.address_zip].filter(Boolean).join(", ");
  return `
    <article class="customer-data-card">
      <strong>${escapeHtml(line1)}</strong>
      ${line2 ? `<span>${escapeHtml(line2)}</span>` : ""}
      ${address.parking_location ? `<span>Parking: ${escapeHtml(address.parking_location)}</span>` : ""}
      ${address.key_handoff_details ? `<span>Keys: ${escapeHtml(address.key_handoff_details)}</span>` : ""}
      <div class="customer-card-actions">
        <a class="button secondary" href="/book#booking-flow">Use this address</a>
        <button class="button secondary" type="button" data-edit-address="${escapeHtml(address.id)}">Edit</button>
        <button class="button secondary" type="button" data-delete-address="${escapeHtml(address.id)}">Delete</button>
      </div>
    </article>
  `;
}

function promoDiscountLabel(promo) {
  const value = Number(promo.discount_value) || 0;
  if (promo.discount_type === "free_addon") return "Free add-on";
  return promo.discount_type === "percent" ? `${value}% off` : `$${value.toFixed(2)} off`;
}

function promoCard(promo) {
  const code = String(promo.code || "").trim().toUpperCase();
  return `
    <article class="customer-data-card customer-promo-card">
      <strong>${escapeHtml(promo.name || code)}</strong>
      <span>${escapeHtml(promo.description || promoDiscountLabel(promo))}</span>
      <span class="customer-promo-code">${escapeHtml(code)} - ${escapeHtml(promoDiscountLabel(promo))}</span>
      <a class="button secondary" href="/book?promo=${encodeURIComponent(code)}#booking-flow">Book with this promo</a>
    </article>
  `;
}

function renderStats(active, history, addresses, vehicles) {
  if (!statsMount) return;
  statsMount.innerHTML = [
    ["Active", active.length],
    ["History", history.length],
    ["Vehicles", vehicles.length],
    ["Addresses", addresses.length],
  ].map(([label, value]) => `
    <article>
      <strong>${value}</strong>
      <span>${label}</span>
    </article>
  `).join("");
}

function renderAccount(session, data, promos = []) {
  activeAccountSession = session;
  activeAccountData = data;
  const requests = [...data.requests].sort((a, b) => new Date(b.created_at || b.service_date || 0) - new Date(a.created_at || a.service_date || 0));
  const active = requests.filter((request) => !terminalStatuses.has(canonicalBookingStatus(request.status)));
  const history = requests.filter((request) => terminalStatuses.has(canonicalBookingStatus(request.status)));
  const name = session.name || customerNameFrom(requests, data);
  const phone = formatPhone(session.phone);
  const email = String(session.email || "").trim().toLowerCase();
  const promoHeading = requests.length ? "Returning customer" : "Promo eligibility";
  const promoCopy = requests.length
    ? "You are recognized as a returning customer. Eligible promo codes are validated during booking and usage caps are tracked by your phone and email."
    : "Your account is linked to saved details. Enter promo codes during booking to see if you qualify.";

  if (greeting) greeting.textContent = name ? `Welcome back, ${name.split(/\s+/)[0]}` : "Welcome back";
  if (accountSummary) {
    accountSummary.innerHTML = `
      <article class="customer-data-card customer-account-card">
        <strong>Signed in as</strong>
        <span>${escapeHtml(phone)} · ${escapeHtml(email)}</span>
      </article>
      <article class="customer-data-card customer-account-card">
        <strong>${escapeHtml(promoHeading)}</strong>
        <span>${escapeHtml(promoCopy)}</span>
      </article>
    `;
  }

  document.querySelector("[data-active-count]").textContent = active.length;
  document.querySelector("[data-history-count]").textContent = history.length;
  document.querySelector("[data-vehicle-count]").textContent = data.vehicles.length;
  document.querySelector("[data-address-count]").textContent = data.addresses.length;

  renderStats(active, history, data.addresses, data.vehicles);
  activeMount.innerHTML = active.length
    ? active.map((request) => requestCard(request, "active")).join("")
    : emptyCard("No active services right now.", `<a class="button primary" href="/book#booking-flow">Book a saved vehicle</a>`);
  vehiclesMount.innerHTML = data.vehicles.length
    ? data.vehicles.map(vehicleCard).join("")
    : emptyCard("No saved vehicles yet. Your next completed booking will save one for faster future booking.");
  addressesMount.innerHTML = data.addresses.length
    ? data.addresses.map(addressCard).join("")
    : emptyCard("No saved service addresses yet. Use Book Now or My Account to add one.");
  historyMount.innerHTML = history.length
    ? history.slice(0, 8).map((request) => requestCard(request, "history")).join("")
    : emptyCard("No completed service history is available for this phone and email yet.");
  promosMount.innerHTML = promos.length
    ? promos.map(promoCard).join("")
    : `
      <article class="customer-data-card">
        <strong>${requests.length ? "Book again with saved details" : "Ready to book"}</strong>
        <span>${requests.length ? "Use your returning customer account to reuse saved vehicles and addresses on the next booking." : "Start a new booking and enter any promo code during checkout."}</span>
        <a class="button secondary" href="/book#booking-flow">${requests.length ? "Book again" : "Book service"}</a>
      </article>
      <article class="customer-data-card">
        <strong>Promos</strong>
        <span>No promos available right now. Check back later for account offers and service reminders.</span>
      </article>
    `;

  dashboard.hidden = false;
  document.body.classList.add("customer-account-loaded");
  loginForm?.classList.add("is-compact");
}

async function refreshAccount() {
  if (!activeAccountSession) return;
  await openAccount(activeAccountSession);
}

function promptValue(label, current = "") {
  const value = window.prompt(label, current || "");
  return value == null ? null : value.trim();
}

async function updateSavedVehicle(vehicle) {
  const vehicleYear = promptValue("Vehicle year", vehicle.vehicle_year || "");
  if (vehicleYear == null) return;
  const vehicleMake = promptValue("Vehicle make", vehicle.vehicle_make || "");
  if (vehicleMake == null) return;
  const vehicleModel = promptValue("Vehicle model", vehicle.vehicle_model || "");
  if (vehicleModel == null) return;
  const vehicleColor = promptValue("Vehicle color", vehicle.vehicle_color || "");
  if (vehicleColor == null) return;
  const licensePlate = promptValue("License plate", vehicle.license_plate || "");
  if (licensePlate == null) return;
  const fuelType = promptValue("Fuel type", vehicle.fuel_type || "");
  if (fuelType == null) return;

  setStatus("warning", "Saving vehicle...");
  const { error } = await customerDb.rpc("public_update_saved_vehicle", {
    p_vehicle_id: vehicle.id,
    p_phone: activeAccountSession.phone,
    p_email: activeAccountSession.email,
    p_data: {
      customer_name: activeAccountSession.name || "",
      vehicle_year: vehicleYear,
      vehicle_make: vehicleMake,
      vehicle_model: vehicleModel,
      vehicle_color: vehicleColor,
      license_plate: licensePlate,
      fuel_type: fuelType,
    },
  });
  if (error) throw error;
  setStatus("success", "Vehicle updated.");
  await refreshAccount();
}

async function updateSavedAddress(address) {
  const street = promptValue("Street address", address.address_street || address.hospital || "");
  if (street == null) return;
  const unit = promptValue("Unit/suite/apartment", address.address_apt || "");
  if (unit == null) return;
  const city = promptValue("City", address.address_city || "");
  if (city == null) return;
  const state = promptValue("State", address.address_state || "DE");
  if (state == null) return;
  const zip = promptValue("ZIP code", address.address_zip || "");
  if (zip == null) return;
  const parking = promptValue("Parking details", address.parking_location || "");
  if (parking == null) return;
  const keys = promptValue("Key handoff details", address.key_handoff_details || "");
  if (keys == null) return;

  setStatus("warning", "Saving address...");
  const { error } = await customerDb.rpc("public_update_saved_address", {
    p_address_id: address.id,
    p_phone: activeAccountSession.phone,
    p_email: activeAccountSession.email,
    p_data: {
      customer_name: activeAccountSession.name || "",
      hospital: [street, city, state, zip].filter(Boolean).join(", "),
      address_street: street,
      address_apt: unit,
      address_city: city,
      address_state: state,
      address_zip: zip,
      parking_location: parking,
      key_handoff_details: keys,
    },
  });
  if (error) throw error;
  setStatus("success", "Address updated.");
  await refreshAccount();
}

async function deleteSavedVehicle(vehicleId) {
  if (!window.confirm("Delete this saved vehicle from My Account?")) return;
  setStatus("warning", "Deleting vehicle...");
  const { error } = await customerDb.rpc("public_soft_delete_saved_vehicle", {
    p_vehicle_id: vehicleId,
    p_phone: activeAccountSession.phone,
    p_email: activeAccountSession.email,
  });
  if (error) throw error;
  setStatus("success", "Vehicle deleted.");
  await refreshAccount();
}

async function deleteSavedAddress(addressId) {
  if (!window.confirm("Delete this saved service address from My Account?")) return;
  setStatus("warning", "Deleting address...");
  const { error } = await customerDb.rpc("public_soft_delete_saved_address", {
    p_address_id: addressId,
    p_phone: activeAccountSession.phone,
    p_email: activeAccountSession.email,
  });
  if (error) throw error;
  setStatus("success", "Address deleted.");
  await refreshAccount();
}

async function openAccount(session) {
  setStatus("warning", "Loading your account...");
  const data = await loadAccountData(session);
  if (!accountHasData(data)) {
    if (session.isNewAccount) {
      renderAccount(session, data, []);
      setStatus("success", "Account loaded. Saved details will appear here after booking.");
      return;
    }
    throw new Error("We could not find saved customer details for that phone and email.");
  }
  const customerId = data.requests.find((request) => request.customer_id)?.customer_id || "";
  const promos = await loadEligiblePromos(session, customerId);
  const name = customerNameFrom(data.requests, data);
  const nextSession = { ...session, name, isNewAccount: false };
  writeSession(nextSession);
  renderAccount(nextSession, data, promos);
  setStatus("success", "Account loaded.");
}

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const session = {
    phone: form.elements.phone.value,
    email: form.elements.email.value,
  };
  if (!window.ShiftFuelPhone?.isValid(session.phone)) {
    setStatus("error", window.ShiftFuelPhone?.validationMessage || "Enter a valid 10-digit phone number.");
    return;
  }
  if (button) {
    button.disabled = true;
    button.textContent = "Opening...";
  }
  try {
    await openAccount(session);
  } catch (error) {
    console.error("[customer-account] lookup failed:", error);
    setStatus("error", error.message || "Could not open My Account. Please try again.");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Sign In";
    }
  }
});

createForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const firstName = String(form.elements.firstName.value || "").trim();
  const lastName = String(form.elements.lastName.value || "").trim();
  const phone = cleanPhone(form.elements.phone.value);
  const email = String(form.elements.email.value || "").trim().toLowerCase();

  if (phone.length < 10 || !email || !firstName || !lastName) {
    setCreateStatus("error", firstName && lastName && email ? (window.ShiftFuelPhone?.validationMessage || "Enter a valid 10-digit phone number.") : "Enter your first name, last name, phone number, and email.");
    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = "Creating...";
  }

  try {
    setCreateStatus("warning", "Checking for an existing account...");
    const session = { phone, email, name: `${firstName} ${lastName}`.trim(), isNewAccount: true };
    const data = await loadAccountData(session);
    if (accountHasData(data)) {
      switchAccountMode("login");
      if (loginForm) {
        loginForm.elements.phone.value = formatPhone(phone);
        loginForm.elements.email.value = email;
      }
      setStatus("warning", "An account already exists for this phone/email. Please log in instead.");
      return;
    }

    writeSession(session);
    renderAccount(session, { requests: [], addresses: [], vehicles: [] }, []);
    setStatus("success", "Account created. You can book service and saved details will appear here after booking.");
  } catch (error) {
    console.error("[customer-account] create account failed:", error);
    setCreateStatus("error", error.message || "Could not create your account. Please try again.");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Create Account";
    }
  }
});

document.querySelector("[data-customer-sign-out]")?.addEventListener("click", () => {
  clearSession();
  activeAccountSession = null;
  activeAccountData = { requests: [], addresses: [], vehicles: [] };
  dashboard.hidden = true;
  document.body.classList.remove("customer-account-loaded");
  loginForm?.classList.remove("is-compact");
  loginForm?.reset();
  createForm?.reset();
  switchAccountMode("login");
  closeAccountForm();
  const standalone = window.SF_MODE?.standalone
    || (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches)
    || window.navigator.standalone === true;
  const compact = window.SF_MODE?.compact
    || !window.matchMedia
    || window.matchMedia("(max-width: 760px)").matches;
  if (standalone && compact) {
    if (accountIntroTitle) accountIntroTitle.textContent = "Welcome back";
    if (accountIntroCopy) accountIntroCopy.textContent = "Sign in to access your saved vehicles, addresses, and bookings.";
    openAccountForm("login", { focus: false, scroll: false });
  }
  setStatus("warning", "Signed out on this device.");
});

dashboard?.addEventListener("click", async (event) => {
  const vehicleEdit = event.target.closest("[data-edit-vehicle]");
  const vehicleDelete = event.target.closest("[data-delete-vehicle]");
  const addressEdit = event.target.closest("[data-edit-address]");
  const addressDelete = event.target.closest("[data-delete-address]");
  if (!vehicleEdit && !vehicleDelete && !addressEdit && !addressDelete) return;
  if (!activeAccountSession || !customerDb) {
    setStatus("error", "Open My Account before editing saved details.");
    return;
  }
  try {
    if (vehicleEdit) {
      const vehicle = activeAccountData.vehicles.find((item) => String(item.id) === String(vehicleEdit.dataset.editVehicle));
      if (vehicle) await updateSavedVehicle(vehicle);
    } else if (vehicleDelete) {
      await deleteSavedVehicle(vehicleDelete.dataset.deleteVehicle);
    } else if (addressEdit) {
      const address = activeAccountData.addresses.find((item) => String(item.id) === String(addressEdit.dataset.editAddress));
      if (address) await updateSavedAddress(address);
    } else if (addressDelete) {
      await deleteSavedAddress(addressDelete.dataset.deleteAddress);
    }
  } catch (error) {
    console.error("[customer-account] saved detail update failed:", error);
    setStatus("error", error.message || "Could not update saved details.");
  }
});

(function initCustomerAccount() {
  const year = document.querySelector("#year");
  if (year) year.textContent = new Date().getFullYear();
  const navToggle = document.querySelector("[data-nav-toggle]");
  const nav = document.querySelector("[data-nav]");
  navToggle?.addEventListener("click", () => {
    const isOpen = navToggle.getAttribute("aria-expanded") === "true";
    navToggle.setAttribute("aria-expanded", String(!isOpen));
    nav?.classList.toggle("is-open", !isOpen);
  });

  accountModeButtons.forEach((button) => {
    button.addEventListener("click", () => switchAccountMode(button.dataset.accountMode));
  });

  accountOpenButtons.forEach((button) => {
    button.addEventListener("click", () => openAccountForm());
  });
  accountCloseButtons.forEach((button) => {
    button.addEventListener("click", () => closeAccountForm());
  });
  bindEmailLowercase();

  // Deep links / the "My Account" nav item should open the collapsed form.
  function openFormFromHash(hash) {
    if (hash === "#create") openAccountForm("create");
    else if (hash === "#customer-account-panel") openAccountForm("login");
  }
  openFormFromHash(window.location.hash);
  if (window.location.hash !== "#create") switchAccountMode("login");
  window.addEventListener("hashchange", () => openFormFromHash(window.location.hash));

  const standalone = window.SF_MODE?.standalone
    || (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches)
    || window.navigator.standalone === true;
  const compact = window.SF_MODE?.compact
    || !window.matchMedia
    || window.matchMedia("(max-width: 760px)").matches;

  if (standalone && compact) {
    if (accountIntroTitle) accountIntroTitle.textContent = "Welcome back";
    if (accountIntroCopy) accountIntroCopy.textContent = "Sign in to access your saved vehicles, addresses, and bookings.";
    openAccountForm("login", { focus: false, scroll: false });
  }

  const session = readSession();
  if (!session || !loginForm) return;
  loginForm.elements.phone.value = formatPhone(session.phone);
  loginForm.elements.email.value = session.email;
  openAccount(session).catch((error) => {
    console.warn("[customer-account] saved session could not be loaded:", error);
    clearSession();
    if (standalone && compact) {
      setStatus("", "");
      if (accountIntroTitle) accountIntroTitle.textContent = "Welcome back";
      if (accountIntroCopy) accountIntroCopy.textContent = "Sign in to access your saved vehicles, addresses, and bookings.";
      openAccountForm("login", { focus: false, scroll: false });
    } else {
      setStatus("warning", "Please enter your phone and email to open My Account.");
    }
  });
})();
