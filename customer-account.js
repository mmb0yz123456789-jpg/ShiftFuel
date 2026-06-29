const CUSTOMER_ACCOUNT_KEY = "shiftfuel_customer_account";
const customerDb = window.ShiftFuelSupabase;
const loginForm = document.querySelector("[data-customer-login-form]");
const accountStatus = document.querySelector("[data-customer-account-status]");
const dashboard = document.querySelector("[data-customer-dashboard]");
const statsMount = document.querySelector("[data-customer-stats]");
const activeMount = document.querySelector("[data-active-requests]");
const vehiclesMount = document.querySelector("[data-saved-vehicles]");
const addressesMount = document.querySelector("[data-saved-addresses]");
const historyMount = document.querySelector("[data-service-history]");
const promosMount = document.querySelector("[data-customer-promos]");
const accountSummary = document.querySelector("[data-customer-account-summary]");
const greeting = document.querySelector("[data-customer-greeting]");

const terminalStatuses = new Set([
  "complete",
  "denied",
  "customer_canceled",
  "canceled",
  "cancelled",
  "unable_to_complete",
  "auto_reversed",
  "closed_no_charge",
  "canceled_return_completed",
]);

const statusLabels = {
  request_received: "Request received",
  pending_customer_info: "Action needed",
  accepted: "Accepted",
  key_received: "Keys received",
  vehicle_picked_up: "Vehicle picked up",
  service_in_progress: "Service in progress",
  fueling_in_progress: "Fueling in progress",
  car_wash_in_progress: "Car wash in progress",
  service_complete: "Service complete",
  final_payment_processed: "Payment processed",
  complete: "Complete",
  cancelled_pending_key_return: "Canceled - return pending",
  customer_canceled: "Canceled",
  canceled: "Canceled",
  cancelled: "Canceled",
  denied: "Denied",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function cleanPhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function formatPhone(value) {
  const digits = cleanPhone(value).slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
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
  return statusLabels[status] || String(status || "Status pending").replace(/_/g, " ");
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
  const trackHref = `track.html?request=${encodeURIComponent(publicNumber(request.id))}`;
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

function renderAccount(session, data) {
  const requests = [...data.requests].sort((a, b) => new Date(b.created_at || b.service_date || 0) - new Date(a.created_at || a.service_date || 0));
  const active = requests.filter((request) => !terminalStatuses.has(request.status));
  const history = requests.filter((request) => terminalStatuses.has(request.status));
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
    : emptyCard("No active services right now.", `<a class="button primary" href="returning.html#booking-flow">Book again</a>`);
  vehiclesMount.innerHTML = data.vehicles.length
    ? data.vehicles.map(vehicleCard).join("")
    : emptyCard("No saved vehicles yet. Your next completed booking will save one for faster future booking.");
  addressesMount.innerHTML = data.addresses.length
    ? data.addresses.map(addressCard).join("")
    : emptyCard("No saved service addresses yet. Use Book Now or My Account to add one.");
  historyMount.innerHTML = history.length
    ? history.slice(0, 8).map((request) => requestCard(request, "history")).join("")
    : emptyCard("No completed service history is available for this phone and email yet.");
  promosMount.innerHTML = `
    <article class="customer-data-card">
      <strong>${requests.length ? "Book again with saved details" : "Ready to book"}</strong>
      <span>${requests.length ? "Use your returning customer account to reuse saved vehicles and addresses on the next booking." : "Start a new booking and enter any promo code during checkout."}</span>
    </article>
    <article class="customer-data-card">
      <strong>Promos</strong>
      <span>${promoCopy}</span>
    </article>
  `;

  dashboard.hidden = false;
  loginForm?.classList.add("is-compact");
}

async function openAccount(session) {
  setStatus("warning", "Loading your account...");
  const data = await loadAccountData(session);
  if (!data.requests.length && !data.addresses.length && !data.vehicles.length) {
    throw new Error("We could not find saved customer details for that phone and email.");
  }
  const name = customerNameFrom(data.requests, data);
  const nextSession = { ...session, name };
  writeSession(nextSession);
  renderAccount(nextSession, data);
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
      button.textContent = "Open My Account";
    }
  }
});

document.querySelector("[data-customer-sign-out]")?.addEventListener("click", () => {
  clearSession();
  dashboard.hidden = true;
  loginForm?.classList.remove("is-compact");
  loginForm?.reset();
  setStatus("warning", "Signed out on this device.");
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

  const session = readSession();
  if (!session || !loginForm) return;
  loginForm.elements.phone.value = formatPhone(session.phone);
  loginForm.elements.email.value = session.email;
  openAccount(session).catch((error) => {
    console.warn("[customer-account] saved session could not be loaded:", error);
    clearSession();
    setStatus("warning", "Please enter your phone and email to open My Account.");
  });
})();
