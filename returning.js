const returningState = {
  contact: { phone: "", email: "", ticket: "" },
  addresses: [],
  vehicles: [],
  selectedAddress: null,
  selectedVehicle: null,
};

const navToggle = document.querySelector("[data-nav-toggle]");
const nav = document.querySelector("[data-nav]");
const year = document.querySelector("#year");
const form = document.querySelector("#returning-verify-form");
const phoneInput = document.querySelector("#returning-phone");
const emailInput = document.querySelector("#returning-email");
const ticketInput = document.querySelector("#returning-ticket");
const statusEl = document.querySelector("#returning-status");
const addressList = document.querySelector("#returning-addresses");
const vehicleList = document.querySelector("#returning-vehicles");
const continueBtn = document.querySelector("#returning-continue");

if (year) year.textContent = new Date().getFullYear();

navToggle?.addEventListener("click", () => {
  const isOpen = navToggle.getAttribute("aria-expanded") === "true";
  navToggle.setAttribute("aria-expanded", String(!isOpen));
  nav?.classList.toggle("is-open", !isOpen);
});

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function formatPhone(value) {
  const digits = normalizePhone(value).slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showStep(step) {
  document.querySelectorAll(".returning-step").forEach((section) => {
    const active = Number(section.dataset.step) <= step;
    section.hidden = !active;
    section.classList.toggle("is-active", Number(section.dataset.step) === step);
  });
}

function addressLabel(address) {
  return [
    address.address_street || address.street || address.hospital,
    address.address_apt || address.apt,
    [address.address_city || address.city, address.address_state || address.state, address.address_zip || address.zip].filter(Boolean).join(", "),
  ].filter(Boolean);
}

function vehicleLabel(vehicle) {
  return [
    [vehicle.vehicle_year || vehicle.year, vehicle.vehicle_make || vehicle.make, vehicle.vehicle_model || vehicle.model].filter(Boolean).join(" "),
    vehicle.vehicle_color || vehicle.color ? `Color: ${vehicle.vehicle_color || vehicle.color}` : "",
    vehicle.license_plate || vehicle.plate ? `Plate: ${vehicle.license_plate || vehicle.plate}` : "",
  ].filter(Boolean);
}

function isActiveRecord(record) {
  return record?.is_active !== false && !record?.deleted_at;
}

function normalizeLookupPayload(payload) {
  const source = Array.isArray(payload) ? payload[0] || {} : payload || {};
  const addresses = Array.isArray(source.addresses)
    ? source.addresses
    : Array.isArray(source.saved_addresses)
      ? source.saved_addresses
      : Array.isArray(source.service_addresses)
        ? source.service_addresses
        : [];
  const vehicles = Array.isArray(source.vehicles)
    ? source.vehicles
    : Array.isArray(source.saved_vehicles)
      ? source.saved_vehicles
      : [];

  return {
    addresses: addresses.filter(isActiveRecord),
    vehicles: vehicles.filter(isActiveRecord),
  };
}

function keyFromParts(parts) {
  return parts
    .map((part) => String(part || "").toLowerCase().replace(/\s+/g, " ").trim())
    .join("|");
}

function requestsToOptions(requests) {
  const addresses = [];
  const vehicles = [];
  const addressKeys = new Set();
  const vehicleKeys = new Set();

  (Array.isArray(requests) ? requests : []).forEach((request) => {
    const address = {
      address_street: request.address_street || request.hospital,
      address_apt: request.address_apt,
      address_city: request.address_city,
      address_state: request.address_state,
      address_zip: request.address_zip,
      customer_name: request.customer_name,
      customer_phone: request.customer_phone,
      customer_email: request.customer_email,
    };
    const addressKey = keyFromParts([
      address.address_street,
      address.address_apt,
      address.address_city,
      address.address_state,
      address.address_zip,
    ]);
    if (address.address_street && !addressKeys.has(addressKey)) {
      addressKeys.add(addressKey);
      addresses.push(address);
    }

    const vehicle = {
      vehicle_year: request.vehicle_year,
      vehicle_make: request.vehicle_make,
      vehicle_model: request.vehicle_model,
      vehicle_color: request.vehicle_color,
      license_plate: request.license_plate,
      customer_name: request.customer_name,
      customer_phone: request.customer_phone,
      customer_email: request.customer_email,
    };
    const vehicleKey = keyFromParts([
      vehicle.vehicle_year,
      vehicle.vehicle_make,
      vehicle.vehicle_model,
      vehicle.vehicle_color,
      vehicle.license_plate,
    ]);
    if ((vehicle.vehicle_make || vehicle.vehicle_model || vehicle.license_plate) && !vehicleKeys.has(vehicleKey)) {
      vehicleKeys.add(vehicleKey);
      vehicles.push(vehicle);
    }
  });

  return { addresses, vehicles };
}

async function lookupFromTrackedRequests({ ticket, phone, email }) {
  if (!window.ShiftFuelSupabase) return { addresses: [], vehicles: [] };
  const { data, error } = await window.ShiftFuelSupabase.rpc("public_track_request", {
    p_request_id: ticket || null,
    p_phone: phone || null,
    p_email: email || null,
  });
  if (error) throw error;
  return requestsToOptions(data || []);
}

function renderAddresses() {
  if (!addressList) return;
  if (!returningState.addresses.length) {
    addressList.innerHTML = `<p class="field-help">No saved service areas found. Add a new service address in Book Now.</p>`;
    return;
  }

  addressList.innerHTML = returningState.addresses.map((address, index) => {
    const selected = returningState.selectedAddress === address;
    return `
      <article class="returning-option-card ${selected ? "is-selected" : ""}">
        ${addressLabel(address).map((line) => `<span>${escapeHtml(line)}</span>`).join("")}
        <button class="button primary" type="button" data-address-index="${index}">${selected ? "Service area selected" : "Use this service area"}</button>
      </article>
    `;
  }).join("");
}

function renderVehicles() {
  if (!vehicleList) return;
  if (!returningState.vehicles.length) {
    vehicleList.innerHTML = `<p class="field-help">No saved vehicles found. Add a new vehicle in Book Now.</p>`;
    return;
  }

  vehicleList.innerHTML = returningState.vehicles.map((vehicle, index) => {
    const selected = returningState.selectedVehicle === vehicle;
    return `
      <article class="returning-option-card ${selected ? "is-selected" : ""}">
        ${vehicleLabel(vehicle).map((line) => `<span>${escapeHtml(line)}</span>`).join("")}
        <div class="returning-customer-actions">
          <button class="button primary" type="button" data-vehicle-index="${index}">${selected ? "Vehicle selected" : "Use this vehicle"}</button>
          <button class="button danger" type="button" data-delete-vehicle-index="${index}">Delete</button>
        </div>
      </article>
    `;
  }).join("");
}

async function lookupReturningCustomer() {
  const phone = normalizePhone(phoneInput?.value || "");
  const email = (emailInput?.value || "").trim().toLowerCase();
  const ticket = (ticketInput?.value || "").trim();

  if (!phone && !email && !ticket) {
    statusEl.textContent = "Enter a phone number, email address, or ticket number to continue.";
    phoneInput?.focus();
    return;
  }

  returningState.contact = { phone, email, ticket };
  statusEl.textContent = "Looking up saved customer information...";

  try {
    let savedOptions = { addresses: [], vehicles: [] };

    if (window.ShiftFuelSupabase && phone && email) {
      try {
        const { data, error } = await window.ShiftFuelSupabase.rpc("public_returning_customer_options", {
          p_phone: phone,
          p_email: email,
        });
        if (error) throw error;
        savedOptions = normalizeLookupPayload(data);
      } catch (savedOptionsError) {
        console.warn("Saved returning customer options lookup failed; trying tracked requests:", savedOptionsError);
        savedOptions = await lookupFromTrackedRequests({ ticket, phone, email });
      }
      if (!savedOptions.addresses.length && !savedOptions.vehicles.length) {
        savedOptions = await lookupFromTrackedRequests({ ticket, phone, email });
      }
    } else if (window.ShiftFuelSupabase && (ticket || phone || email)) {
      savedOptions = await lookupFromTrackedRequests({ ticket, phone, email });
    }

    returningState.addresses = savedOptions.addresses;
    returningState.vehicles = savedOptions.vehicles;
    returningState.selectedAddress = null;
    returningState.selectedVehicle = null;
    renderAddresses();
    renderVehicles();
    showStep(2);
    statusEl.textContent = savedOptions.addresses.length || savedOptions.vehicles.length
      ? "Saved information found. Pick your validated service area first."
      : "No saved options found yet. Continue through Book Now to add and validate your service address.";
  } catch (error) {
    console.error("Returning customer lookup failed:", error);
    returningState.addresses = [];
    returningState.vehicles = [];
    renderAddresses();
    renderVehicles();
    showStep(2);
    statusEl.textContent = "We could not load saved options right now. You can still continue through Book Now.";
  }
}

async function deleteVehicle(index) {
  const vehicle = returningState.vehicles[index];
  if (!vehicle) return;
  const confirmed = confirm("Delete this saved vehicle? This removes it from future booking options only. Past requests will not be changed.");
  if (!confirmed) return;

  const id = vehicle.id || vehicle.saved_vehicle_id;
  if (window.ShiftFuelSupabase && id && returningState.contact.phone && returningState.contact.email) {
    const { error } = await window.ShiftFuelSupabase.rpc("public_soft_delete_saved_vehicle", {
      p_vehicle_id: id,
      p_phone: returningState.contact.phone,
      p_email: returningState.contact.email,
    });
    if (error) {
      console.error("Could not delete saved vehicle:", error);
      alert("Could not delete that saved vehicle. Please try again in Book Now.");
      return;
    }
  }

  returningState.vehicles.splice(index, 1);
  if (returningState.selectedVehicle === vehicle) returningState.selectedVehicle = null;
  renderVehicles();
}

phoneInput?.addEventListener("input", () => {
  phoneInput.value = formatPhone(phoneInput.value);
});

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  lookupReturningCustomer();
});

addressList?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-address-index]");
  if (!button) return;
  returningState.selectedAddress = returningState.addresses[Number(button.dataset.addressIndex)];
  renderAddresses();
  showStep(3);
});

vehicleList?.addEventListener("click", async (event) => {
  const deleteButton = event.target.closest("[data-delete-vehicle-index]");
  if (deleteButton) {
    await deleteVehicle(Number(deleteButton.dataset.deleteVehicleIndex));
    return;
  }

  const button = event.target.closest("[data-vehicle-index]");
  if (!button) return;
  returningState.selectedVehicle = returningState.vehicles[Number(button.dataset.vehicleIndex)];
  renderVehicles();
  showStep(4);
});

continueBtn?.addEventListener("click", () => {
  localStorage.setItem("shiftfuel_returning_prefill", JSON.stringify({
    contact: returningState.contact,
    address: returningState.selectedAddress,
    vehicle: returningState.selectedVehicle,
    savedAt: new Date().toISOString(),
  }));
  window.location.href = "book.html?returning=1#book";
});
