// ── Stripe setup ─────────────────────────────────────────────────────────────
// REPLACE WITH LIVE KEY BEFORE PRODUCTION LAUNCH
const STRIPE_PUBLISHABLE_KEY = 'pk_test_51Tinn8H7KLNRhY3F757Dwev2OIk1CWs0ExzSQwvX9gvzo7ubsXnYbZKl9qVLoIWYOpF6OkzVkIA9kAtkx7i1c1HG00sCPnNo59';
const stripe = window.Stripe ? window.Stripe(STRIPE_PUBLISHABLE_KEY) : null;
const stripeElements = stripe ? stripe.elements() : null;
const cardElement = stripeElements ? stripeElements.create('card', {
  style: {
    base: {
      fontSize: '16px',
      color: '#1a1a1a',
      fontFamily: 'system-ui, sans-serif',
      '::placeholder': { color: '#9ca3af' },
    },
    invalid: { color: '#c0392b' },
  },
}) : null;

let cardMounted = false;

function mountCardElement() {
  if (cardElement && !cardMounted) {
    const container = document.querySelector('#card-element');
    if (container) {
      cardElement.mount('#card-element');
      cardMounted = true;
      cardElement.on('change', (event) => {
        const display = document.querySelector('#card-errors');
        if (display) display.textContent = event.error ? event.error.message : '';
      });
    }
  }
}

// Payment modal — lazy lookups so the dialog exists before we query it
function getPaymentModal()       { return document.querySelector('#payment-modal'); }
function getPaymentModalAmount() { return document.querySelector('#payment-modal-amount'); }
function getPaymentModalSubmit() { return document.querySelector('#payment-modal-submit'); }

function openPaymentModal(amountDisplay) {
  const modal = getPaymentModal();
  if (!modal) return;
  const amountEl = getPaymentModalAmount();
  if (amountEl) amountEl.textContent = amountDisplay;
  mountCardElement();
  modal.showModal();
}

function closePaymentModal() {
  const modal = getPaymentModal();
  if (modal) modal.close();
  const display = document.querySelector('#card-errors');
  if (display) display.textContent = '';
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('#payment-modal-cancel')?.addEventListener('click', closePaymentModal);
  document.querySelector('#payment-modal')?.addEventListener('click', (e) => {
    if (e.target === document.querySelector('#payment-modal')) closePaymentModal();
  });
  document.querySelector('#payment-modal-submit')?.addEventListener('click', handlePaymentModalSubmit);
});
// ─────────────────────────────────────────────────────────────────────────────

const year = document.querySelector("#year");
const form = document.querySelector("#booking-form");
const vehicleYear = document.querySelector("#vehicle-year");
const vehicleMake = document.querySelector("#vehicle-make");
const vehicleModel = document.querySelector("#vehicle-model");
const modelHelp = document.querySelector("#model-help");
const service = document.querySelector("#service");
const carWashPackage = document.querySelector("#car-wash-package");
const carWashControl = document.querySelector(".car-wash-control");
const fuelControls = Array.from(document.querySelectorAll(".fuel-control"));
const quickInspection = document.querySelector("#quick-inspection");
const serviceDetailsPanel = document.querySelector("#service-details-panel");
const serviceDate = document.querySelector("#service-date");
const returnTime = document.querySelector("#return-time");
const timeHelp = document.querySelector("#time-help");
const fuelType = document.querySelector("#fuel-type");
const fuelEstimate = document.querySelector("#fuel-estimate");
const paymentWashRow = document.querySelector("#payment-wash-row");
const paymentWashConvenienceRow = document.querySelector("#payment-wash-convenience-row");
const paymentFuelRow = document.querySelector("#payment-fuel-row");
const paymentPriceRow = document.querySelector("#payment-price-row");
const paymentConvenienceRow = document.querySelector("#payment-convenience-row");
const paymentInspectionRow = document.querySelector("#payment-inspection-row");
const estimatedWash = document.querySelector("#estimated-wash");
const washConvenienceFeeDisplay = document.querySelector("#wash-convenience-fee");
const estimatedFuel = document.querySelector("#estimated-fuel");
const averagePrice = document.querySelector("#average-price");
const fuelConvenienceFeeDisplay = document.querySelector("#fuel-convenience-fee");
const inspectionFeeDisplay = document.querySelector("#inspection-fee");
const estimatedTotal = document.querySelector("#estimated-total");
const statusMessage = document.querySelector("#form-status");
const applicantForm = document.querySelector("#applicant-form");
const applicantStatus = document.querySelector("#applicant-status");
const statusItems = Array.from(document.querySelectorAll("#status-list li"));
const addressStreet = form.querySelector('#address-street');
const addressApt    = form.querySelector('#address-apt');
const addressCity   = form.querySelector('#address-city');
const addressState  = form.querySelector('#address-state');
const addressZip    = form.querySelector('#address-zip');
const addressAreaStatus = document.querySelector('#address-area-status');
const validateAddressBtn = document.querySelector('#validate-address-btn');
const vehicleFieldset   = document.querySelector('#vehicle-fieldset');
const parkingFieldset   = document.querySelector('#parking-fieldset');
const serviceFieldset   = document.querySelector('#service-fieldset');
const paymentFieldset   = document.querySelector('#payment-fieldset');
const agreementFieldset = document.querySelector('#agreement-fieldset');
const bookingSubmitBtn  = document.querySelector('#booking-submit-btn');
const returningCustomerSearch = document.querySelector("#returning-customer-search");
const returningCustomerEmail = document.querySelector("#returning-customer-email");
const returningCustomerButton = document.querySelector("#returning-customer-button");
const returningCustomerStatus = document.querySelector("#returning-customer-status");
const returningCustomerResults = document.querySelector("#returning-customer-results");
const returningParkingConfirmationControl = document.querySelector("#returning-parking-confirmation-control");
const returningParkingConfirmation = document.querySelector("#returning-parking-confirmation");
const returningTimeConfirmationControl = document.querySelector("#returning-time-confirmation-control");
const returningTimeConfirmation = document.querySelector("#returning-time-confirmation");
const parkingKeyHandoffHeading = document.querySelector("#parking-key-handoff-heading");
const RESUME_BUCKET = "applicant-resumes";

year.textContent = new Date().getFullYear();


const slotReleasingStatuses = new Set(["complete", "denied", "customer_canceled", "unable_to_complete"]);
let bookedReturnSlots = new Set();
let workerAvailabilitySlots = null;
let workerAvailabilityLoaded = false;
let returningCustomerMatches = [];
let returningCustomerNeedsConfirmation = false;
let currentlyAppliedRequestId = null;
let addressValidated = false;
let isReturningCustomer = false;

function setAddressStatus(type, message) {
  if (!addressAreaStatus) return;
  addressAreaStatus.textContent = message;
  addressAreaStatus.dataset.status = type || '';
}

function setPostAddressSections(visible) {
  [vehicleFieldset, parkingFieldset, serviceFieldset, paymentFieldset, agreementFieldset, bookingSubmitBtn]
    .filter(Boolean)
    .forEach(el => { el.hidden = !visible; });
}

function resetAddressValidation() {
  if (!addressValidated) {
    const hasContent = [addressStreet, addressApt, addressCity, addressState, addressZip]
      .some(f => f?.value?.trim());
    if (hasContent) setAddressStatus('warning', 'Please validate your service address before continuing.');
    else setAddressStatus('', '');
    return;
  }
  addressValidated = false;
  setPostAddressSections(false);
  if (!isReturningCustomer) {
    setAddressStatus('warning', 'Please validate your service address before continuing.');
  } else {
    setAddressStatus('warning', 'Your vehicle and service selections are still saved. Please validate the updated address before submitting.');
  }
}

[addressStreet, addressApt, addressCity, addressState, addressZip]
  .filter(Boolean)
  .forEach(f => f.addEventListener('input', resetAddressValidation));

validateAddressBtn?.addEventListener('click', async () => {
  const fullAddress = getServiceAddress();
  if (!fullAddress) {
    setAddressStatus('error', 'Please enter your service address before validating.');
    return;
  }
  setAddressStatus('', 'Verifying address…');
  validateAddressBtn.disabled = true;
  try {
    const result = await validateServiceArea(fullAddress);
    if (!result.valid) {
      setAddressStatus('error', result.message);
      addressValidated = false;
      setPostAddressSections(false);
      return;
    }
    if (result.canonicalAddress) {
      const choice = await showAddressConfirmModal(fullAddress, result.canonicalAddress);
      if (choice === 'edit') {
        setAddressStatus('warning', 'Please validate your service address before continuing.');
        addressValidated = false;
        return;
      }
    }
    addressValidated = true;
    setAddressStatus('success', 'Address verified.');
    setPostAddressSections(true);
  } finally {
    validateAddressBtn.disabled = false;
  }
});

function formatDateInputValue(date) {
  const yearValue = date.getFullYear();
  const monthValue = String(date.getMonth() + 1).padStart(2, "0");
  const dayValue = String(date.getDate()).padStart(2, "0");
  return `${yearValue}-${monthValue}-${dayValue}`;
}

const todayValue = formatDateInputValue(new Date());
const maxServiceDate = new Date();
maxServiceDate.setMonth(maxServiceDate.getMonth() + 3);
const maxServiceDateValue = formatDateInputValue(maxServiceDate);
serviceDate.min = todayValue;
serviceDate.max = maxServiceDateValue;
serviceDate.value = todayValue;

const currentYear = new Date().getFullYear() + 1;

const popularMakes = [
  "Chevrolet",
  "Ford",
  "Honda",
  "Hyundai",
  "Jeep",
  "Kia",
  "Nissan",
  "Subaru",
  "Tesla",
  "Toyota",
];

const otherMakes = [
  "Acura",
  "Alfa Romeo",
  "Audi",
  "BMW",
  "Buick",
  "Cadillac",
  "Chrysler",
  "Dodge",
  "Fiat",
  "Genesis",
  "GMC",
  "Infiniti",
  "Jaguar",
  "Land Rover",
  "Lexus",
  "Lincoln",
  "Mazda",
  "Mercedes-Benz",
  "Mini",
  "Mitsubishi",
  "Porsche",
  "Ram",
  "Volkswagen",
  "Volvo",
];

const fallbackModels = {
  Acura: ["ILX", "Integra", "MDX", "RDX", "TLX"],
  Audi: ["A3", "A4", "A5", "A6", "Q3", "Q5", "Q7"],
  BMW: ["3 Series", "4 Series", "5 Series", "X1", "X3", "X5"],
  Buick: ["Encore", "Encore GX", "Enclave", "Envision"],
  Cadillac: ["CT4", "CT5", "Escalade", "XT4", "XT5", "XT6"],
  Chevrolet: ["Blazer", "Colorado", "Equinox", "Malibu", "Silverado", "Suburban", "Tahoe", "Trailblazer", "Traverse"],
  Chrysler: ["300", "Pacifica", "Voyager"],
  Dodge: ["Challenger", "Charger", "Durango", "Hornet"],
  Ford: ["Bronco", "Escape", "Explorer", "F-150", "Fusion", "Maverick", "Mustang", "Ranger"],
  Genesis: ["G70", "G80", "GV70", "GV80"],
  GMC: ["Acadia", "Canyon", "Sierra", "Terrain", "Yukon"],
  Honda: ["Accord", "Civic", "CR-V", "HR-V", "Odyssey", "Passport", "Pilot", "Ridgeline"],
  Hyundai: ["Elantra", "Kona", "Palisade", "Santa Fe", "Sonata", "Tucson"],
  Infiniti: ["Q50", "QX50", "QX55", "QX60", "QX80"],
  Jeep: ["Cherokee", "Compass", "Gladiator", "Grand Cherokee", "Renegade", "Wrangler"],
  Kia: ["Carnival", "Forte", "K5", "Seltos", "Sorento", "Soul", "Sportage", "Telluride"],
  Lexus: ["ES", "GX", "IS", "NX", "RX", "TX"],
  Lincoln: ["Aviator", "Corsair", "Nautilus", "Navigator"],
  Mazda: ["CX-30", "CX-5", "CX-50", "CX-9", "Mazda3", "Mazda6", "MX-5 Miata"],
  "Mercedes-Benz": ["C-Class", "E-Class", "GLA", "GLC", "GLE", "S-Class"],
  Mini: ["Clubman", "Convertible", "Cooper", "Countryman"],
  Mitsubishi: ["Eclipse Cross", "Mirage", "Outlander", "Outlander Sport"],
  Nissan: ["Altima", "Frontier", "Kicks", "Maxima", "Murano", "Pathfinder", "Rogue", "Sentra", "Versa"],
  Ram: ["1500", "2500", "3500", "ProMaster"],
  Subaru: ["Ascent", "Crosstrek", "Forester", "Impreza", "Legacy", "Outback"],
  Tesla: ["Model 3", "Model S", "Model X", "Model Y"],
  Toyota: ["4Runner", "Camry", "Corolla", "Highlander", "Prius", "RAV4", "Sienna", "Tacoma", "Tundra"],
  Volkswagen: ["Atlas", "Golf", "ID.4", "Jetta", "Passat", "Taos", "Tiguan"],
  Volvo: ["S60", "S90", "V60", "XC40", "XC60", "XC90"],
};

for (let optionYear = currentYear; optionYear >= 1980; optionYear -= 1) {
  const option = document.createElement("option");
  option.value = optionYear;
  option.textContent = optionYear;
  vehicleYear.append(option);
}

function createOption(value, text = value) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = text;
  return option;
}

function populateMakes() {
  const popularGroup = document.createElement("optgroup");
  const otherGroup = document.createElement("optgroup");

  popularGroup.label = "Most common makes";
  otherGroup.label = "Other makes";

  popularMakes.forEach((make) => popularGroup.append(createOption(make)));
  otherMakes
    .filter((make) => !popularMakes.includes(make))
    .sort((a, b) => a.localeCompare(b))
    .forEach((make) => otherGroup.append(createOption(make)));

  vehicleMake.append(popularGroup, otherGroup);
}

function setModelOptions(models, placeholder) {
  vehicleModel.innerHTML = "";
  vehicleModel.append(createOption("", placeholder));
  models.forEach((model) => vehicleModel.append(createOption(model)));
  vehicleModel.disabled = models.length === 0;
}

function resetModels(message = "Models load after you choose a year and make.") {
  setModelOptions([], "Select year and make first");
  modelHelp.textContent = message;
}

async function setVehicleFromPrevious(request) {
  vehicleYear.value = request.vehicle_year || "";
  vehicleMake.value = request.vehicle_make || "";

  await loadModelsForSelection();

  if (request.vehicle_model) {
    const hasModel = Array.from(vehicleModel.options).some((option) => option.value === request.vehicle_model);
    if (!hasModel) {
      vehicleModel.append(createOption(request.vehicle_model));
      vehicleModel.disabled = false;
    }
    vehicleModel.value = request.vehicle_model;
  }
}

async function loadModelsForSelection() {
  const selectedYear = vehicleYear.value;
  const selectedMake = vehicleMake.value;

  if (!selectedYear || !selectedMake) {
    resetModels();
    return;
  }

  setModelOptions([], "Loading models...");
  modelHelp.textContent = "Loading models for that year and make.";

  try {
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(selectedMake)}/modelyear/${selectedYear}/vehicletype/car?format=json`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Vehicle model lookup failed.");
    }

    const data = await response.json();
    const models = [...new Set(data.Results.map((item) => item.Model_Name).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));

    if (models.length > 0) {
      setModelOptions(models, "Select model");
      modelHelp.textContent = "Models are filtered by the selected year and make.";
      return;
    }
  } catch (error) {
    console.warn(error);
  }

  const fallback = fallbackModels[selectedMake] || [];
  setModelOptions(fallback, fallback.length ? "Select model" : "No models found");
  modelHelp.textContent = fallback.length
    ? "Showing common models while the official vehicle lookup is unavailable."
    : "No models found for that year and make.";
}

populateMakes();
resetModels();

const fuelEstimateRanges = [
  { value: "5", label: "5 gallons or less", gallons: 5 },
  { value: "10", label: "5-10 gallons", gallons: 10 },
  { value: "15", label: "10-15 gallons", gallons: 15 },
  { value: "20", label: "15-20 gallons", gallons: 20 },
  { value: "25", label: "20-25 gallons", gallons: 25 },
  { value: "30", label: "25+ gallons", gallons: 30 },
];

fuelEstimateRanges.forEach((range) => {
  const option = document.createElement("option");
  option.value = range.value;
  option.textContent = range.label;
  option.dataset.label = range.label;
  fuelEstimate.append(option);
});

const fees = {
  fuelConvenience: 15,
  washConvenience: 15,
  quickInspection: 5,
};

const carWashPackages = {
  "buff-shine": {
    label: "Buff & Shine",
    price: 27,
    includes: [
      "Fire Bath",
      "Super Hard Shell Ceramic Finish",
      "Dry N' Shine",
      "ICE Instant Shine",
      "Salt Shield",
      "Tire Shine",
      "Triple Wheel Cleaning",
      "Tri-Foam Conditioner",
      "Blazin' Glaze Clear Coat",
      "High pH and Low pH Presoak",
      "Drying Agent",
      "Spot Free Rinse",
    ],
  },
  "shine-protect": {
    label: "Shine & Protect",
    price: 20,
    includes: [
      "ICE Instant Shine",
      "Salt Shield",
      "Tire Shine",
      "Triple Wheel Cleaning",
      "Tri-Foam Conditioner",
      "Blazin' Glaze Clear Coat",
      "High pH and Low pH Presoak",
      "Drying Agent",
      "Spot Free Rinse",
    ],
  },
  shine: {
    label: "Shine",
    price: 16,
    includes: [
      "Tri-Foam Conditioner",
      "Blazin' Glaze Clear Coat",
      "High pH and Low pH Presoak",
      "Double Tire & Wheel Cleaning",
      "Drying Agent",
      "Spot Free Rinse",
    ],
  },
  "double-wash": {
    label: "Double Wash",
    price: 12,
    includes: [
      "High pH and Low pH Presoak",
      "Double Tire & Wheel Cleaning",
      "Drying Agent",
      "Spot Free Rinse",
    ],
  },
};

const serviceTypes = {
  "car-wash": {
    label: "Car Wash",
    needsFuel: false,
    needsWash: true,
  },
  fuel: {
    label: "Fuel",
    needsFuel: true,
    needsWash: false,
  },
  "car-wash-fuel": {
    label: "Car Wash + Fuel",
    needsFuel: true,
    needsWash: true,
  },
};

const averageFuelPrices = {
  Regular: 3.792,
  "Mid-grade": 4.411,
  Premium: 4.701,
  Diesel: 4.967,
};

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPricePerGallon(value) {
  return `$${value.toFixed(3)}/gal`;
}

function selectedServiceType() {
  return serviceTypes[service.value] || { needsFuel: false, needsWash: false };
}

function selectedWashPackage() {
  return carWashPackages[carWashPackage.value] || null;
}

function selectedFuelRange() {
  return fuelEstimateRanges.find((range) => range.value === fuelEstimate.value) || null;
}

function updateEstimate() {
  const serviceType = selectedServiceType();
  const washPackage = selectedWashPackage();
  const fuelRange = selectedFuelRange();
  const gallons = serviceType.needsFuel && fuelRange ? fuelRange.gallons : 0;
  const pricePerGallon = averageFuelPrices[fuelType.value] || averageFuelPrices.Regular;
  const fuelAmount = gallons * pricePerGallon;
  const fuelConvenienceFee = serviceType.needsFuel ? fees.fuelConvenience : 0;
  const washFee = serviceType.needsWash && washPackage ? washPackage.price : 0;
  const washConvenienceFee = serviceType.needsWash && washPackage ? fees.washConvenience : 0;
  const inspectionFee = quickInspection.checked ? fees.quickInspection : 0;
  const selectedFee = fuelConvenienceFee + washFee + washConvenienceFee + inspectionFee;

  paymentWashRow.hidden = !serviceType.needsWash || !washPackage;
  paymentWashConvenienceRow.hidden = !serviceType.needsWash || !washPackage;
  paymentFuelRow.hidden = !serviceType.needsFuel;
  paymentPriceRow.hidden = !serviceType.needsFuel;
  paymentConvenienceRow.hidden = !serviceType.needsFuel;
  paymentInspectionRow.hidden = !quickInspection.checked;

  estimatedWash.textContent = washPackage ? `${washPackage.label} - ${formatCurrency(washFee)}` : "$0.00";
  washConvenienceFeeDisplay.textContent = formatCurrency(washConvenienceFee);
  estimatedFuel.textContent = serviceType.needsFuel
    ? `${fuelRange?.label || "0 gallons"} estimated at ${gallons} gallons x ${formatPricePerGallon(pricePerGallon)} = ${formatCurrency(fuelAmount)}`
    : formatCurrency(fuelAmount);
  averagePrice.textContent = formatPricePerGallon(pricePerGallon);
  fuelConvenienceFeeDisplay.textContent = formatCurrency(fuelConvenienceFee);
  inspectionFeeDisplay.textContent = formatCurrency(inspectionFee);
  estimatedTotal.textContent = formatCurrency(fuelAmount + selectedFee);
}

function formatTimeLabel(value) {
  const [hourText, minute] = value.split(":");
  const hour = Number(hourText);
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${period}`;
}

function timeSlots(startHour, endHour) {
  const slots = [];

  for (let hour = startHour; hour <= endHour; hour += 1) {
    for (const minute of ["00", "30"]) {
      if (hour === endHour && minute === "30") {
        continue;
      }

      slots.push(`${String(hour).padStart(2, "0")}:${minute}`);
    }
  }

  return slots;
}

function populateReturnTimes(slots, placeholder) {
  const currentValue = returnTime.value;
  returnTime.innerHTML = "";
  returnTime.append(createOption("", placeholder));

  slots.forEach((slot) => {
    const option = createOption(slot, formatTimeLabel(slot));

    if (bookedReturnSlots.has(slot)) {
      option.disabled = true;
      option.textContent = `${formatTimeLabel(slot)} - booked`;
    }

    returnTime.append(option);
  });

  if (slots.includes(currentValue) && !bookedReturnSlots.has(currentValue)) {
    returnTime.value = currentValue;
  } else {
    returnTime.value = "";
  }
}

function normalizeTimeSlot(value) {
  return String(value || "").slice(0, 5);
}

function selectedHospital() {
  return ""; // location filtering handled by geocoding; all workers shown
}

function getServiceAddress() {
  return [
    addressStreet?.value?.trim(),
    addressApt?.value?.trim(),
    addressCity?.value?.trim(),
    addressState?.value?.trim(),
    addressZip?.value?.trim(),
  ].filter(Boolean).join(', ');
}

// ── Service area geocoding ────────────────────────────────────────────────────

const SERVICE_ANCHOR_LAT = 39.6789; // 132 Christiana Mall, Newark DE 19702
const SERVICE_ANCHOR_LON = -75.6653;
const SERVICE_MAX_MILES = 20;

function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function nominatimSearch(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(query)}&limit=1`;
  const response = await fetch(url, {
    headers: { "Accept-Language": "en", "User-Agent": "ShiftFuelConcierge/1.0" },
  });
  if (!response.ok) return null;
  const results = await response.json();
  return results?.length ? results[0] : null;
}

async function validateServiceArea(workplaceText) {
  try {
    // Try the full address first; fall back to city+state+zip so that streets
    // missing from OpenStreetMap still pass area validation.
    let result = await nominatimSearch(workplaceText);

    if (!result) {
      const city  = addressCity?.value?.trim()  || '';
      const state = addressState?.value?.trim() || '';
      const zip   = addressZip?.value?.trim()   || '';
      const fallback = [city, state, zip].filter(Boolean).join(', ');
      if (fallback) result = await nominatimSearch(fallback);
    }

    if (!result) {
      return {
        valid: false,
        message: "We could not verify this address. Please check your address and try again.",
      };
    }

    const dist = haversineMiles(
      SERVICE_ANCHOR_LAT, SERVICE_ANCHOR_LON,
      Number(result.lat), Number(result.lon)
    );
    if (dist > SERVICE_MAX_MILES) {
      return { valid: false, message: "We currently do not serve this area." };
    }

    // Build a clean canonical address from Nominatim's structured data.
    const a = result.address || {};
    const canonicalParts = [
      [a.house_number, a.road].filter(Boolean).join(' '),
      a.city || a.town || a.village || a.county,
      a.state,
      a.postcode,
    ].filter(Boolean);
    return { valid: true, canonicalAddress: canonicalParts.join(', ') };
  } catch {
    return { valid: false, message: 'We could not verify this address. Please try again or contact ShiftFuel.' };
  }
}

function showAddressConfirmModal(enteredAddress, canonicalAddress) {
  return new Promise((resolve) => {
    let modal = document.querySelector('#address-confirm-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'address-confirm-modal';
      modal.innerHTML = `
        <div class="address-confirm-dialog">
          <p class="eyebrow">Confirm your address</p>
          <p>We verified your address. Please confirm before continuing.</p>
          <div class="address-confirm-row">
            <div>
              <strong>You entered</strong>
              <p id="address-confirm-entered"></p>
            </div>
            <div>
              <strong>Verified as</strong>
              <p id="address-confirm-found"></p>
            </div>
          </div>
          <div class="address-confirm-actions">
            <button id="address-confirm-continue" class="button primary" type="button">Confirm and continue</button>
            <button id="address-confirm-edit" class="button secondary" type="button">Edit my address</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    modal.querySelector('#address-confirm-entered').textContent = enteredAddress;
    modal.querySelector('#address-confirm-found').textContent = canonicalAddress;
    modal.hidden = false;

    const continueBtn = modal.querySelector('#address-confirm-continue');
    const editBtn     = modal.querySelector('#address-confirm-edit');

    const cleanup = (choice) => {
      modal.hidden = true;
      continueBtn.removeEventListener('click', onContinue);
      editBtn.removeEventListener('click', onEdit);
      resolve(choice);
    };
    const onContinue = () => cleanup('continue');
    const onEdit     = () => cleanup('edit');

    continueBtn.addEventListener('click', onContinue);
    editBtn.addEventListener('click', onEdit);
  });
}

function minutesFromSlot(value) {
  const [hour, minute] = normalizeTimeSlot(value).split(":").map(Number);
  return hour * 60 + minute;
}

function isSelectedServiceDateToday() {
  return serviceDate.value === formatDateInputValue(new Date());
}

function currentLocalMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function futureSlotsForSelectedDate(slots) {
  if (!isSelectedServiceDateToday()) {
    return slots;
  }

  const nowMinutes = currentLocalMinutes();
  return slots.filter((slot) => minutesFromSlot(slot) > nowMinutes);
}

function slotsWithinAvailability(slots, availabilityRows) {
  if (!availabilityRows.length) {
    return [];
  }

  return slots.filter((slot) => {
    const slotMinutes = minutesFromSlot(slot);
    return availabilityRows.some((row) => {
      const start = minutesFromSlot(row.starts_at);
      const end = minutesFromSlot(row.ends_at);
      return slotMinutes >= start && slotMinutes <= end;
    });
  });
}

async function loadWorkerAvailabilitySlots() {
  workerAvailabilityLoaded = true;
  workerAvailabilitySlots = null;

  if (!serviceDate.value || !window.ShiftFuelSupabase) {
    return;
  }

  const selectedDate = new Date(`${serviceDate.value}T12:00:00`);
  const dayOfWeek = selectedDate.getDay();
  const hospital = selectedHospital();

  const { data: rpcSlots, error: rpcError } = await window.ShiftFuelSupabase
    .rpc("public_worker_availability_slots", {
      p_service_date: serviceDate.value,
      p_hospital: hospital,
    });

  if (!rpcError) {
    workerAvailabilitySlots = (rpcSlots || []).map((row) => normalizeTimeSlot(row.slot)).filter(Boolean);
    return;
  }

  if (!isMissingRpcError(rpcError)) {
    console.warn("Worker availability lookup blocked:", rpcError);
    workerAvailabilitySlots = [];
    return;
  }

  console.warn("Worker availability RPC unavailable, falling back to direct lookup:", rpcError);

  const { data: employees, error: employeeError } = await window.ShiftFuelSupabase
    .from("employees")
    .select("id,home_location,active")
    .eq("active", true);

  if (employeeError) {
    console.warn("Worker availability is not configured:", employeeError);
    return;
  }

  const employeeIds = (employees || [])
    .filter((employee) => !hospital || !employee.home_location || employee.home_location === hospital)
    .map((employee) => employee.id);

  if (!employeeIds.length) {
    workerAvailabilitySlots = [];
    return;
  }

  const { data: daysOff, error: daysOffError } = await window.ShiftFuelSupabase
    .from("employee_days_off")
    .select("employee_id,day_off")
    .in("employee_id", employeeIds)
    .eq("day_off", serviceDate.value);

  if (daysOffError) {
    console.warn("Could not load worker days off:", daysOffError);
    return;
  }

  const offEmployeeIds = new Set((daysOff || []).map((dayOff) => dayOff.employee_id));
  const availableEmployeeIds = employeeIds.filter((employeeId) => !offEmployeeIds.has(employeeId));

  if (!availableEmployeeIds.length) {
    workerAvailabilitySlots = [];
    return;
  }

  const { data: availability, error: availabilityError } = await window.ShiftFuelSupabase
    .from("employee_availability")
    .select("employee_id,day_of_week,starts_at,ends_at,work_location")
    .in("employee_id", availableEmployeeIds)
    .eq("day_of_week", dayOfWeek);

  if (availabilityError) {
    console.warn("Could not load worker availability:", availabilityError);
    return;
  }

  const matchingAvailability = (availability || []).filter((row) => {
    return !hospital || !row.work_location || row.work_location === hospital;
  });

  workerAvailabilitySlots = slotsWithinAvailability(timeSlots(0, 24), matchingAvailability);
}

async function refreshBookedReturnSlots() {
  if (!serviceDate.value || !window.ShiftFuelSupabase) {
    bookedReturnSlots = new Set();
    updateServiceAvailability();
    return;
  }

  await loadWorkerAvailabilitySlots();

  const { data: rpcSlots, error: rpcError } = await window.ShiftFuelSupabase
    .rpc("public_booked_return_slots", {
      p_service_date: serviceDate.value,
    });

  if (!rpcError) {
    bookedReturnSlots = new Set(
      (rpcSlots || [])
        .map((request) => normalizeTimeSlot(request.desired_return_time))
        .filter(Boolean)
    );

    updateServiceAvailability();
    return;
  }

  if (!isMissingRpcError(rpcError)) {
    console.warn("Booked slot lookup blocked:", rpcError);
    bookedReturnSlots = new Set();
    updateServiceAvailability();
    return;
  }

  console.warn("Booked slot RPC unavailable, falling back to direct lookup:", rpcError);

  const { data, error } = await window.ShiftFuelSupabase
    .from("service_requests")
    .select("desired_return_time,status")
    .eq("service_date", serviceDate.value);

  if (error) {
    console.warn("Could not load booked time slots:", error);
    bookedReturnSlots = new Set();
    updateServiceAvailability();
    return;
  }

  bookedReturnSlots = new Set(
    (data || [])
      .filter((request) => !slotReleasingStatuses.has(request.status))
      .map((request) => normalizeTimeSlot(request.desired_return_time))
      .filter(Boolean)
  );

  updateServiceAvailability();
}

function updateServiceAvailability() {
  const serviceType = selectedServiceType();
  const availabilitySuffix = workerAvailabilityLoaded && workerAvailabilitySlots?.length === 0
    ? " No worker availability is saved for this date."
    : "";
  const filterByWorkerAvailability = (slots) => Array.isArray(workerAvailabilitySlots)
    ? slots.filter((slot) => workerAvailabilitySlots.includes(slot))
    : slots;

  if (!serviceType.needsWash) {
    const slots = futureSlotsForSelectedDate(filterByWorkerAvailability(timeSlots(7, 22)));
    populateReturnTimes(slots, slots.length ? "Select return time" : "No return times left today");
    returnTime.setCustomValidity("");
    timeHelp.textContent = slots.length
      ? `Choose the time you want your vehicle returned.${availabilitySuffix}`
      : `No more return times are available today. Choose tomorrow or another future date.${availabilitySuffix}`;
    return;
  }

  const washSlots = futureSlotsForSelectedDate(filterByWorkerAvailability(timeSlots(9, 18)));
  populateReturnTimes(washSlots, washSlots.length ? "Select car wash return time" : "No car wash times left today");
  returnTime.setCustomValidity("");
  timeHelp.textContent = washSlots.length
    ? `Car wash service selected. Return times are limited to 9:00 AM through 6:00 PM.${availabilitySuffix}`
    : `No more car wash return times are available today. Choose tomorrow or another future date.${availabilitySuffix}`;
}

function setControlState(control, shouldEnable) {
  control.disabled = !shouldEnable;
  control.required = shouldEnable;

  if (!shouldEnable) {
    control.value = "";
  }
}

function setControlVisibility(container, shouldShow) {
  container.hidden = !shouldShow;
}

function updateServiceControls() {
  const serviceType = selectedServiceType();

  setControlVisibility(carWashControl, serviceType.needsWash);
  fuelControls.forEach((control) => setControlVisibility(control, serviceType.needsFuel));
  setControlState(carWashPackage, serviceType.needsWash);
  setControlState(fuelType, serviceType.needsFuel);
  setControlState(fuelEstimate, serviceType.needsFuel);
  updateServiceAvailability();
  updateServiceDetails();
  updateEstimate();
}

function updateServiceDetails() {
  const serviceType = selectedServiceType();
  const washPackage = selectedWashPackage();

  if (!service.value) {
    serviceDetailsPanel.innerHTML = `
      <p class="eyebrow">Service details</p>
      <h3>Select a service</h3>
      <p>Choose Car Wash, Fuel, or Car Wash + Fuel to see what is included.</p>
    `;
    return;
  }

  const details = [];

  if (serviceType.needsFuel) {
    details.push("Fuel filled using the selected fuel type and estimated gallons.");
    details.push(`Regular: ${formatPricePerGallon(averageFuelPrices.Regular)}`);
    details.push(`Mid-grade: ${formatPricePerGallon(averageFuelPrices["Mid-grade"])}`);
    details.push(`Premium: ${formatPricePerGallon(averageFuelPrices.Premium)}`);
    details.push(`Diesel: ${formatPricePerGallon(averageFuelPrices.Diesel)}`);
  }

  if (serviceType.needsWash && washPackage) {
    details.push(...washPackage.includes);
  } else if (serviceType.needsWash) {
    details.push("Select a wash package to see what is included.");
  }

  if (serviceType.needsFuel && serviceType.needsWash) {
    details.push("$30 car wash + fuel convenience fee added.");
  } else if (serviceType.needsFuel) {
    details.push("$15 fuel convenience fee added.");
  } else if (serviceType.needsWash) {
    details.push("$15 car wash convenience fee added.");
  }

  if (quickInspection.checked) {
    details.push("Quick vehicle inspection add-on.");
  }

  serviceDetailsPanel.innerHTML = `
    <p class="eyebrow">Service details</p>
    <h3>${serviceTypes[service.value].label}${washPackage ? `: ${washPackage.label}` : ""}</h3>
    <p>${serviceType.needsWash ? "Car wash services are available from 9:00 AM to 6:00 PM every day." : "Fuel service can be requested during your selected return window."}</p>
    <ul>${details.map((detail) => `<li>${detail}</li>`).join("")}</ul>
  `;
}

function moneyValue(text) {
  return Number(text.replace(/[^0-9.-]+/g, "")) || 0;
}
function formatPhoneNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");

  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return value;
}

function cleanLookupPhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function returningVehicleLabel(request) {
  return [
    request.vehicle_year,
    request.vehicle_make,
    request.vehicle_model,
    request.vehicle_color,
    request.license_plate ? `Plate ${request.license_plate}` : "",
  ].filter(Boolean).join(" ");
}

function returningServiceLabel(request) {
  const serviceName = request.service_label || request.service_type || "Service not listed";
  const details = [
    request.fuel_type ? `Fuel: ${request.fuel_type}` : "",
    request.wash_package_label ? `Wash: ${request.wash_package_label}` : "",
  ].filter(Boolean).join(" | ");

  return details ? `${serviceName} (${details})` : serviceName;
}

function shortDate(value) {
  if (!value) return "Date not listed";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function renderReturningCustomerResults(requests) {
  if (!returningCustomerResults) return;

  if (!requests.length) {
    returningCustomerResults.hidden = true;
    returningCustomerResults.innerHTML = "";
    return;
  }

  returningCustomerResults.hidden = false;
  returningCustomerResults.innerHTML = requests.map((request, index) => `
    <article class="returning-customer-card">
      <span>${escapeHtml(returningVehicleLabel(request) || "Previous vehicle")}</span>
      <small>${escapeHtml(returningServiceLabel(request))}</small>
      <small>${escapeHtml(request.customer_name || "Customer")} | ${escapeHtml(request.address_street ? [request.address_street, request.address_city, request.address_state, request.address_zip].filter(Boolean).join(", ") : (request.hospital || "Address not listed"))} | ${escapeHtml(shortDate(request.service_date || request.created_at))}</small>
      <div class="returning-customer-actions">
        <button class="button primary" type="button" data-returning-index="${index}" data-returning-mode="same-car">Use this car</button>
        <button class="button secondary" type="button" data-returning-index="${index}" data-returning-mode="new-car">Add new car but keep same service</button>
        <button class="button danger" type="button" data-returning-delete="${index}">Delete this car</button>
      </div>
    </article>
  `).join("");
}

async function lookupReturningCustomer() {
  const lookup = returningCustomerSearch?.value.trim() || "";
  const lookupEmail = returningCustomerEmail?.value.trim().toLowerCase() || "";
  const phone = cleanLookupPhone(lookup);

  if (!phone || !lookupEmail) {
    returningCustomerStatus.textContent = "Enter both the phone number and email used on a previous booking.";
    returningCustomerSearch?.focus();
    return;
  }

  if (!window.ShiftFuelSupabase) {
    returningCustomerStatus.textContent = "Customer lookup is not available yet.";
    return;
  }

  returningCustomerButton.disabled = true;
  returningCustomerButton.textContent = "Looking...";
  returningCustomerStatus.textContent = "Searching previous bookings...";

  try {
    const { data: rpcMatches, error: rpcError } = await window.ShiftFuelSupabase
      .rpc("public_returning_customer_lookup", {
        p_phone: phone,
        p_email: lookupEmail,
      });

    if (!rpcError) {
      returningCustomerMatches = rpcMatches || [];

      if (!returningCustomerMatches.length) {
        returningCustomerStatus.textContent = "No previous booking found. You can still complete the form below.";
        renderReturningCustomerResults([]);
        return;
      }

      returningCustomerStatus.textContent = "Choose a previous vehicle to prefill the form.";
      renderReturningCustomerResults(returningCustomerMatches);
      return;
    }

    if (!isMissingRpcError(rpcError)) {
      console.warn("Returning customer lookup blocked:", rpcError);
      returningCustomerStatus.textContent = "No previous booking found. You can still complete the form below.";
      renderReturningCustomerResults([]);
      return;
    }

    console.warn("Returning customer RPC unavailable, falling back to direct lookup:", rpcError);

    const columns = [
      "id",
      "customer_name",
      "customer_phone",
      "customer_email",
      "vehicle_year",
      "vehicle_make",
      "vehicle_model",
      "vehicle_color",
      "license_plate",
      "hospital",
      "address_street",
      "address_apt",
      "address_city",
      "address_state",
      "address_zip",
      "parking_location",
      "parking_spot",
      "parking_map_url",
      "key_handoff_details",
      "service_type",
      "service_label",
      "fuel_type",
      "wash_package",
      "wash_package_label",
      "service_date",
      "created_at",
    ];
    let data = null;
    let error = null;

    for (let attempt = 0; attempt < 6; attempt += 1) {
      ({ data, error } = await window.ShiftFuelSupabase
        .from("service_requests")
        .select(columns.join(","))
        .order("created_at", { ascending: false })
        .limit(100));

      const missingColumn = missingColumnName(error);

      if (!error || !missingColumn || !columns.includes(missingColumn)) {
        break;
      }

      columns.splice(columns.indexOf(missingColumn), 1);
    }

    if (error) throw error;

    const seenVehicles = new Set();
    returningCustomerMatches = (data || []).filter((request) => {
      const matchesPhone = phone && cleanLookupPhone(request.customer_phone) === phone;
      const matchesEmail = lookupEmail && String(request.customer_email || "").toLowerCase() === lookupEmail;
      return matchesPhone && matchesEmail;
    }).filter((request) => {
      const key = [request.license_plate, request.vehicle_year, request.vehicle_make, request.vehicle_model].join("|").toLowerCase();
      if (seenVehicles.has(key)) return false;
      seenVehicles.add(key);
      return true;
    }).slice(0, 5);

    if (!returningCustomerMatches.length) {
      returningCustomerStatus.textContent = "No previous booking found. You can still complete the form below.";
      renderReturningCustomerResults([]);
      return;
    }

    returningCustomerStatus.textContent = "Choose a previous vehicle to prefill the form.";
    renderReturningCustomerResults(returningCustomerMatches);
  } catch (error) {
    console.error("Returning customer lookup failed:", error);
    returningCustomerStatus.textContent = "Could not look up previous bookings right now.";
  } finally {
    returningCustomerButton.disabled = false;
    returningCustomerButton.textContent = "Find my info";
  }
}

function showReturningConfirmation() {
  returningCustomerNeedsConfirmation = true;
  [
    [returningParkingConfirmationControl, returningParkingConfirmation],
    [returningTimeConfirmationControl, returningTimeConfirmation],
  ].forEach(([control, checkbox]) => {
    if (control) control.hidden = false;
    if (checkbox) {
      checkbox.required = true;
      checkbox.checked = false;
    }
  });
  updateReturningConfirmationText();
}

function clearVehicleFields() {
  if (vehicleYear) vehicleYear.value = "";
  if (vehicleMake) vehicleMake.value = "";
  resetModels();
  form.elements.color.value = "";
  form.elements.license.value = "";
}

function applyReturningService(request) {
  if (request.service_type && serviceTypes[request.service_type]) {
    service.value = request.service_type;
  }

  if (request.fuel_type && fuelType) {
    fuelType.value = request.fuel_type;
  }

  const normalizedWashLabel = normalizeTextForMatch(request.wash_package_label);
  const washOption = Array.from(carWashPackage.options).find((option) => {
    const packageInfo = carWashPackages[option.value];
    return option.value === request.wash_package
      || (normalizedWashLabel && normalizeTextForMatch(option.textContent).includes(normalizedWashLabel))
      || (normalizedWashLabel && normalizeTextForMatch(packageInfo?.label).includes(normalizedWashLabel));
  });

  if (washOption) {
    carWashPackage.value = washOption.value;
  }
}

function normalizeTextForMatch(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function updateReturningConfirmationText() {
  const parking = form.elements.parkingLocation?.value || "parking location not entered";
  const keyInstructions = form.elements.keyHandoffDetails?.value || "key handoff instructions not entered";
  const desiredTime = returnTime.value ? formatTimeLabel(returnTime.value) : "return time not selected";

  const parkingLabel = returningParkingConfirmationControl?.querySelector("span");
  const timeLabel = returningTimeConfirmationControl?.querySelector("span");
  if (parkingLabel) {
    parkingLabel.textContent = `Did you confirm your parking and key handoff instructions: ${parking}; ${keyInstructions}?`;
  }
  if (timeLabel) {
    timeLabel.textContent = `Did you confirm your desired return time: ${desiredTime}?`;
  }
}

function scrollToParkingVerification() {
  const target = parkingKeyHandoffHeading || form.elements.parkingLocation;
  target?.scrollIntoView({ behavior: "smooth", block: "start" });
  form.elements.parkingLocation?.focus({ preventScroll: true });
}

async function applyReturningCustomer(index, mode = "same-car") {
  const request = returningCustomerMatches[index];
  if (!request) return;
  currentlyAppliedRequestId = request.id;

  form.elements.name.value = request.customer_name || "";
  form.elements.phone.value = request.customer_phone || "";
  form.elements.email.value = request.customer_email || "";
  // Fill address fields; fall back to the old single-field value for legacy bookings.
  if (addressStreet) addressStreet.value = request.address_street || request.hospital || "";
  if (addressApt)    addressApt.value    = request.address_apt    || "";
  if (addressCity)   addressCity.value   = request.address_city   || "";
  if (addressState)  addressState.value  = request.address_state  || "DE";
  if (addressZip)    addressZip.value    = request.address_zip    || "";
  isReturningCustomer = true;
  addressValidated = false;
  setPostAddressSections(false);
  setAddressStatus('warning', 'Please validate your service address before continuing.');
  form.elements.color.value = request.vehicle_color || "";
  form.elements.license.value = request.license_plate || "";
  form.elements.parkingLocation.value = [request.parking_location, request.parking_spot ? `spot ${request.parking_spot}` : ''].filter(Boolean).join(', ');
  form.elements.parkingMapUrl.value = request.parking_map_url || "";
  form.elements.keyHandoffDetails.value = request.key_handoff_details || "";
  applyReturningService(request);

  if (mode === "new-car") {
    clearVehicleFields();
  } else {
    await setVehicleFromPrevious(request);
  }

  await refreshBookedReturnSlots();
  updateServiceAvailability();
  updateServiceControls();
  updateEstimate();
  showReturningConfirmation();
  scrollToParkingVerification();

  returningCustomerStatus.textContent = mode === "new-car"
    ? "Your previous info and service were filled in. Add the new vehicle, then confirm parking and key handoff."
    : "Your previous info has been filled in. Confirm parking and key handoff, then choose today's date and return time.";
}

function getBookingPayload() {
  const data = new FormData(form);
  const selectedService = data.get("service");
  const serviceType = serviceTypes[selectedService] || { needsFuel: false, needsWash: false };
  const washPackage = selectedWashPackage();
  const fuelRange = selectedFuelRange();
  const gallons = serviceType.needsFuel && fuelRange ? fuelRange.gallons : 0;
  const selectedFuelType = serviceType.needsFuel ? data.get("fuel") : null;
  const pricePerGallon = averageFuelPrices[selectedFuelType] || averageFuelPrices.Regular;
  const fuelConvenienceFee = serviceType.needsFuel ? fees.fuelConvenience : 0;
  const washFee = serviceType.needsWash && washPackage ? washPackage.price : 0;
  const washConvenienceFee = serviceType.needsWash && washPackage ? fees.washConvenience : 0;
  const inspectionFee = data.get("quickInspection") === "yes" ? fees.quickInspection : 0;
  const selectedFee = fuelConvenienceFee + washFee + washConvenienceFee + inspectionFee;
  const estimatedFuelAmount = gallons * pricePerGallon;
  const estimatedTotalAmount = estimatedFuelAmount + selectedFee;

  return {
    customer: {
      name: data.get("name"),
	  phone: formatPhoneNumber(data.get("phone")),
      email: data.get("email"),
    },
    vehicle: {
      year: data.get("year"),
      make: data.get("make"),
      model: data.get("model"),
      color: data.get("color"),
      licensePlate: data.get("license"),
    },
    request: {
      hospital: getServiceAddress(),
      addressStreet: addressStreet?.value?.trim() || "",
      addressApt:    addressApt?.value?.trim()    || "",
      addressCity:   addressCity?.value?.trim()   || "",
      addressState:  addressState?.value?.trim()  || "",
      addressZip:    addressZip?.value?.trim()    || "",
      parkingLocation: data.get("parkingLocation"),
      parkingSpot: null,
      parkingMapUrl: data.get("parkingMapUrl"),
      keyHandoffDetails: data.get("keyHandoffDetails"),
      serviceType: selectedService,
      serviceDate: data.get("serviceDate"),
      desiredReturnTime: data.get("returnTime"),
      estimatedFuelRange: fuelRange?.label || null,
      estimatedGallons: gallons,
      pricePerGallon,
      fuelType: selectedFuelType,
      estimatedFuelAmount,
      serviceFee: selectedFee,
      fuelConvenienceFee,
      washPackage: washPackage ? carWashPackage.value : null,
      washPackageLabel: washPackage?.label || null,
      washFee,
      washConvenienceFee,
      quickInspection: inspectionFee > 0,
      quickInspectionFee: inspectionFee,
      serviceLabel: service.options[service.selectedIndex]?.textContent || selectedService,
      detailingAvailableWindow: serviceType.needsWash ? "9:00 AM - 6:00 PM" : null,
      estimatedTotal: estimatedTotalAmount || moneyValue(estimatedTotal.textContent),
      finalTotal: null,
      status: "request_received",
      notes: data.get("notes"),
    },
    photos: [],
    payment: {
      paymentIntentId: null,
      estimatedAmount: estimatedTotalAmount,
      finalAmount: null,
      paymentStatus: "not_started",
    },
  };
}

function missingColumnName(error) {
  const match = String(error?.message || "").match(/'([^']+)' column/);
  return match?.[1] || "";
}

function isMissingRpcError(error) {
  const message = String(error?.message || "").toLowerCase();
  return ["PGRST202", "PGRST204", "42883"].includes(error?.code)
    || message.includes("could not find the function")
    || (message.includes("function") && message.includes("does not exist"));
}

function addScheduleToNotes(row, payload) {
  const scheduleNote = `Service date: ${payload.request.serviceDate || "Not set"}; desired return time: ${payload.request.desiredReturnTime || "Not set"}`;
  if (String(row.notes || "").includes(scheduleNote)) {
    return;
  }

  row.notes = row.notes ? `${row.notes}\n${scheduleNote}` : scheduleNote;
}

async function uploadApplicantResume(file, applicantName) {
  if (!file) {
    return { resumeUrl: null, resumeStoragePath: null };
  }

  const safeName = String(applicantName || "applicant").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const extension = file.name.split(".").pop() || "pdf";
  const resumeStoragePath = `${Date.now()}-${safeName || "applicant"}.${extension}`;
  const { error } = await window.ShiftFuelSupabase.storage
    .from(RESUME_BUCKET)
    .upload(resumeStoragePath, file, { upsert: false });

  if (error) throw error;

  const { data } = window.ShiftFuelSupabase.storage.from(RESUME_BUCKET).getPublicUrl(resumeStoragePath);
  return {
    resumeUrl: data?.publicUrl || null,
    resumeStoragePath,
  };
}

function getServiceRequestInsert(payload) {
  return {
    customer_name: payload.customer.name,
    customer_phone: payload.customer.phone,
    customer_email: payload.customer.email,
    vehicle_year: payload.vehicle.year,
    vehicle_make: payload.vehicle.make,
    vehicle_model: payload.vehicle.model,
    vehicle_color: payload.vehicle.color,
    license_plate: payload.vehicle.licensePlate,
    hospital: payload.request.hospital,
    address_street: payload.request.addressStreet || null,
    address_apt:    payload.request.addressApt    || null,
    address_city:   payload.request.addressCity   || null,
    address_state:  payload.request.addressState  || null,
    address_zip:    payload.request.addressZip    || null,
    parking_location: payload.request.parkingLocation,
    parking_spot: payload.request.parkingSpot || '',
    key_handoff_details: payload.request.keyHandoffDetails,
    service_type: payload.request.serviceType,
    service_date: payload.request.serviceDate,
    desired_return_time: payload.request.desiredReturnTime,
    estimated_fuel_range: payload.request.estimatedFuelRange,
    estimated_gallons: payload.request.estimatedGallons,
    fuel_type: payload.request.fuelType,
    parking_map_url: payload.request.parkingMapUrl,
    service_label: payload.request.serviceLabel,
    detailing_available_window: payload.request.detailingAvailableWindow,
    fuel_convenience_fee: payload.request.fuelConvenienceFee,
    price_per_gallon: payload.request.pricePerGallon,
    estimated_fuel_amount: payload.request.estimatedFuelAmount,
    wash_package: payload.request.washPackage,
    wash_package_label: payload.request.washPackageLabel,
    wash_fee: payload.request.washFee,
    wash_convenience_fee: payload.request.washConvenienceFee,
    quick_inspection: payload.request.quickInspection,
    quick_inspection_fee: payload.request.quickInspectionFee,
    service_fee: payload.request.serviceFee,
    estimated_total: payload.request.estimatedTotal,
    status: "request_received",
    notes: payload.request.notes,
    payment_intent_id: payload.payment.paymentIntentId || null,
    payment_status: payload.payment.paymentIntentId ? 'authorized' : 'not_started',
  };
}

async function insertServiceRequest(supabase, payload) {
  const row = getServiceRequestInsert(payload);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data, error } = await supabase
      .from("service_requests")
      .insert(row)
      .select();

    if (!error) {
      return { data, error: null };
    }

    const column = missingColumnName(error);

    if (error.code !== "PGRST204" || !column || !(column in row)) {
      return { data: null, error };
    }

    if (column === "service_date" || column === "desired_return_time") {
      addScheduleToNotes(row, payload);
    }

    delete row[column];
  }

  return {
    data: null,
    error: new Error("Could not save booking after removing unsupported Supabase columns."),
  };
}

service.addEventListener("change", updateServiceControls);
carWashPackage.addEventListener("change", () => {
  updateServiceDetails();
  updateEstimate();
});
quickInspection.addEventListener("change", () => {
  updateServiceDetails();
  updateEstimate();
});
returnTime.addEventListener("change", updateServiceAvailability);
returnTime.addEventListener("change", updateReturningConfirmationText);
serviceDate.addEventListener("change", refreshBookedReturnSlots);
fuelType.addEventListener("change", updateEstimate);
fuelEstimate.addEventListener("change", updateEstimate);
vehicleYear.addEventListener("change", loadModelsForSelection);
vehicleMake.addEventListener("change", loadModelsForSelection);
returningCustomerButton?.addEventListener("click", lookupReturningCustomer);
returningCustomerSearch?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    lookupReturningCustomer();
  }
});
returningCustomerEmail?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    lookupReturningCustomer();
  }
});
returningCustomerResults?.addEventListener("click", async (event) => {
  const deleteBtn = event.target.closest("[data-returning-delete]");
  if (deleteBtn) {
    const index = Number(deleteBtn.dataset.returningDelete);
    const request = returningCustomerMatches[index];
    if (!request) return;
    const confirmed = confirm("Are you sure you want to delete this vehicle? This will not erase your current service selections.");
    if (!confirmed) return;

    deleteBtn.disabled = true;
    deleteBtn.textContent = "Deleting...";

    const phone = cleanLookupPhone(returningCustomerSearch?.value.trim() || "");
    const email = (returningCustomerEmail?.value.trim() || "").toLowerCase();

    if (window.ShiftFuelSupabase && phone && email) {
      const { error } = await window.ShiftFuelSupabase.rpc("public_hide_vehicle", {
        p_request_id: request.id,
        p_phone: phone,
        p_email: email,
      });
      if (error) {
        console.warn("Could not delete vehicle from database:", error);
      }
    }

    const wasSelected = currentlyAppliedRequestId === request.id;
    returningCustomerMatches.splice(index, 1);
    if (wasSelected) {
      clearVehicleFields();
      currentlyAppliedRequestId = null;
    }
    renderReturningCustomerResults(returningCustomerMatches);
    if (!returningCustomerMatches.length) {
      returningCustomerStatus.textContent = "No saved vehicles remaining. Fill in your vehicle details below.";
    } else {
      returningCustomerStatus.textContent = "Vehicle removed. Your service selections are still saved.";
    }
    return;
  }
  const button = event.target.closest("[data-returning-index]");
  if (!button) return;
  applyReturningCustomer(Number(button.dataset.returningIndex), button.dataset.returningMode || "same-car");
});

[
  returningParkingConfirmation,
  returningTimeConfirmation,
].forEach((checkbox) => {
  checkbox?.addEventListener("change", () => {
    if (checkbox.checked) {
      checkbox.setCustomValidity("");
    }
  });
});

function resetReturningConfirmation() {
  returningCustomerNeedsConfirmation = false;
  [
    [returningParkingConfirmationControl, returningParkingConfirmation],
    [returningTimeConfirmationControl, returningTimeConfirmation],
  ].forEach(([control, checkbox]) => {
    if (control) control.hidden = true;
    if (checkbox) {
      checkbox.required = false;
      checkbox.checked = false;
      checkbox.setCustomValidity("");
    }
  });
}

function validateReturningConfirmation() {
  if (!returningCustomerNeedsConfirmation) {
    return true;
  }

  if (!returningParkingConfirmation?.checked) {
    returningParkingConfirmation?.setCustomValidity("Confirm the parking and key location before submitting.");
    returningParkingConfirmation?.reportValidity();
    returningParkingConfirmationControl?.scrollIntoView({ behavior: "smooth", block: "center" });
    return false;
  }

  if (!returningTimeConfirmation?.checked) {
    returningTimeConfirmation?.setCustomValidity("Confirm the desired return time before submitting.");
    returningTimeConfirmation?.reportValidity();
    returningTimeConfirmationControl?.scrollIntoView({ behavior: "smooth", block: "center" });
    return false;
  }

  returningParkingConfirmation?.setCustomValidity("");
  returningTimeConfirmation?.setCustomValidity("");
  return true;
}

["parkingLocation", "parkingSpot", "parkingMapUrl", "keyHandoffDetails"].forEach((fieldName) => {
  form.elements[fieldName]?.addEventListener("input", updateReturningConfirmationText);
  form.elements[fieldName]?.addEventListener("change", updateReturningConfirmationText);
});

// Populate fuel price summary in the pricing card using the shared averageFuelPrices object.
// Update averageFuelPrices monthly — that single change reflects here and in the booking estimate.
(function renderFuelPricingSummary() {
  const container = document.querySelector('#fuel-pricing-summary');
  if (!container) return;
  const rows = Object.entries(averageFuelPrices)
    .map(([type, price]) => `<div class="fuel-price-row"><span>${type}</span><span>${formatPricePerGallon(price)}</span></div>`)
    .join('');
  container.innerHTML = `
    <p class="fuel-pricing-label">Current average fuel estimate</p>
    <div class="fuel-price-list">${rows}</div>
    <p class="fuel-pricing-note">Updated monthly for estimating only. Final fuel cost is based on the receipt.</p>
  `;
})();

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (serviceDate.value < todayValue) {
    serviceDate.setCustomValidity("Choose today or a future date.");
    serviceDate.reportValidity();
    return;
  }

  if (serviceDate.value > maxServiceDateValue) {
    serviceDate.setCustomValidity("Choose a date within the next 3 months.");
    serviceDate.reportValidity();
    return;
  }

  serviceDate.setCustomValidity("");

  if (bookedReturnSlots.has(returnTime.value)) {
    returnTime.setCustomValidity("That time slot was already booked. Choose another available time.");
    returnTime.reportValidity();
    await refreshBookedReturnSlots();
    return;
  }

  returnTime.setCustomValidity("");

  if (!validateReturningConfirmation()) {
    return;
  }

  if (!addressValidated) {
    setAddressStatus('error', 'Please validate your service address before continuing.');
    addressStreet?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  // Re-verify on submit — no bypass allowed
  statusMessage.textContent = "Verifying service area…";
  const areaResult = await validateServiceArea(getServiceAddress());
  if (!areaResult.valid) {
    statusMessage.textContent = "";
    addressValidated = false;
    setAddressStatus('error', areaResult.message);
    setPostAddressSections(false);
    return;
  }
  setAddressStatus('success', 'Address verified.');
  statusMessage.textContent = '';

  // Open the payment modal — Stripe flow runs there
  const payload = getBookingPayload();
  const estimatedDisplay = document.querySelector('#estimated-total')?.textContent || '$0.00';
  // Store payload so the modal submit can use it
  const modal = getPaymentModal();
  if (modal) {
    modal._pendingPayload = payload;
    openPaymentModal(estimatedDisplay);
  } else {
    console.error('Payment modal not found in DOM');
    statusMessage.textContent = 'Payment modal failed to load. Please hard-refresh the page (Ctrl+Shift+R).';
  }
});

async function saveBooking(payload) {
  const supabase = window.ShiftFuelSupabase;
  statusMessage.textContent = "Saving booking…";

  try {
    const { data, error } = await insertServiceRequest(supabase, payload);
    if (error) throw error;

    statusItems.forEach((item, index) => {
      item.classList.toggle("active", index === 0);
    });

    statusMessage.textContent = "Booking confirmed!";


    setAddressStatus('', '');
    addressValidated = false;
    isReturningCustomer = false;
    setPostAddressSections(false);

    form.reset();
    returningCustomerMatches = [];
    if (returningCustomerSearch) returningCustomerSearch.value = "";
    if (returningCustomerEmail) returningCustomerEmail.value = "";
    if (returningCustomerStatus) returningCustomerStatus.textContent = "";
    if (returningCustomerResults) {
      returningCustomerResults.hidden = true;
      returningCustomerResults.innerHTML = "";
    }
    resetReturningConfirmation();
    serviceDate.min = todayValue;
    serviceDate.max = maxServiceDateValue;
    serviceDate.value = todayValue;
    resetModels();
    updateServiceControls();
    await refreshBookedReturnSlots();
  } catch (err) {
    console.error("Supabase save error:", JSON.stringify(err, null, 2), err);
    const msg = err?.message || err?.details || err?.hint || JSON.stringify(err);
    statusMessage.textContent = `Could not save booking: ${msg}`;
  }
}

async function handlePaymentModalSubmit() {
  const modal = getPaymentModal();
  const submitBtn = getPaymentModalSubmit();
  const payload = modal?._pendingPayload;
  if (!payload) return;
  if (submitBtn?.disabled) return;

  const cardErrors = document.querySelector('#card-errors');
  if (cardErrors) cardErrors.textContent = '';

  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Authorizing…'; }

  const estimatedCents = Math.max(Math.round((payload.payment.estimatedAmount || 0) * 100), 50);

  let clientSecret;
  try {
    const piRes = await fetch('/api/create-payment-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount_cents: estimatedCents }),
    });
    const piData = await piRes.json();
    if (!piRes.ok) throw new Error(piData.error || 'Payment setup failed');
    clientSecret = piData.client_secret;
    payload.payment.paymentIntentId = piData.payment_intent_id;
  } catch (err) {
    if (cardErrors) cardErrors.textContent = err.message;
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Authorize payment'; }
    return;
  }

  const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
    payment_method: { card: cardElement },
  });

  if (stripeError) {
    if (cardErrors) cardErrors.textContent = stripeError.message;
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Authorize payment'; }
    return;
  }

  payload.payment.paymentIntentId = paymentIntent.id;
  closePaymentModal();
  if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Authorize payment'; }

  await saveBooking(payload);
}

applicantForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const data = new FormData(applicantForm);
  const applicantName = String(data.get("applicantName") || "").trim();
  const applicantEmail = String(data.get("applicantEmail") || "").trim();
  const applicantPhone = String(data.get("applicantPhone") || "").trim();
  const applicantResume = data.get("applicantResume");

  if (!applicantName || (!applicantEmail && !applicantPhone)) {
    if (applicantStatus) {
      applicantStatus.textContent = "Add your name and either a phone number or email.";
    }
    return;
  }

  if (applicantStatus) {
    applicantStatus.textContent = "Submitting application...";
  }

  try {
    const resume = applicantResume instanceof File && applicantResume.size > 0
      ? await uploadApplicantResume(applicantResume, applicantName)
      : { resumeUrl: null, resumeStoragePath: null };
    const applicantRow = {
      name: applicantName,
      email: applicantEmail || null,
      phone: applicantPhone || null,
      availability: String(data.get("applicantAvailability") || "").trim() || null,
      notes: String(data.get("applicantNotes") || "").trim() || null,
      resume_url: resume.resumeUrl,
      resume_storage_path: resume.resumeStoragePath,
    };

    let { error } = await window.ShiftFuelSupabase
      .from("applicants")
      .insert(applicantRow);

    if (error?.code === "PGRST204") {
      delete applicantRow.resume_url;
      delete applicantRow.resume_storage_path;
      ({ error } = await window.ShiftFuelSupabase
        .from("applicants")
        .insert(applicantRow));
    }

    if (error) throw error;

    applicantForm.reset();

    if (applicantStatus) {
      applicantStatus.textContent = "Application submitted. We will follow up soon.";
    }
  } catch (error) {
    console.error("Applicant save error:", error);

    if (applicantStatus) {
      applicantStatus.textContent = "Could not submit application. Make sure the applicants table is added in Supabase.";
    }
  }
});

updateServiceControls();
refreshBookedReturnSlots();

// Resume upload control — filename display + drag-and-drop
(function () {
  const dropZone = document.getElementById('resume-drop-zone');
  const fileInput = document.getElementById('applicant-resume-input');
  const fileNameEl = document.getElementById('resume-file-name');
  if (!dropZone || !fileInput || !fileNameEl) return;

  function showFileName(file) {
    fileNameEl.textContent = file ? file.name : 'No file chosen';
    fileNameEl.removeAttribute('data-empty');
  }

  fileInput.addEventListener('change', () => {
    showFileName(fileInput.files?.[0] || null);
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', (e) => {
    if (!dropZone.contains(e.relatedTarget)) {
      dropZone.classList.remove('drag-over');
    }
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    const accepted = ['.pdf', '.doc', '.docx'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!accepted.includes(ext)) {
      fileNameEl.textContent = 'Please upload a PDF or Word document.';
      return;
    }
    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;
    showFileName(file);
  });
}());
