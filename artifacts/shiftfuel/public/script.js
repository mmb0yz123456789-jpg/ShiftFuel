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
  // Block Cancel/backdrop-click while authorization or saving is in progress —
  // closing mid-save could orphan a successful Stripe authorization with no
  // confirmed booking and no visible error.
  const isProcessing = () => getPaymentModalSubmit()?.disabled === true;

  document.querySelector('#payment-modal-cancel')?.addEventListener('click', () => {
    if (isProcessing()) return;
    closePaymentModal();
  });
  document.querySelector('#payment-modal')?.addEventListener('click', (e) => {
    if (e.target === document.querySelector('#payment-modal') && !isProcessing()) closePaymentModal();
  });
  // Native <dialog> Escape-key dismissal — block it the same way while processing.
  document.querySelector('#payment-modal')?.addEventListener('cancel', (e) => {
    if (isProcessing()) e.preventDefault();
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
const parkingKeyHandoffHeading = document.querySelector("#parking-key-handoff-heading");
const RESUME_BUCKET = "applicant-resumes";

year.textContent = new Date().getFullYear();


// Return slots are reserved only after an admin accepts the request.
// New request_received bookings stay available until accepted.
const slotHoldingStatuses = new Set([
  "accepted", "key_received",
  "pickup_vehicle_photo_uploaded", "pickup_odometer_photo_uploaded", "pickup_fuel_gauge_photo_uploaded",
  "vehicle_picked_up", "service_in_progress",
  "fueling_in_progress", "fueling_complete", "fuel_receipt_uploaded",
  "car_wash_in_progress", "car_wash_complete", "car_wash_after_fuel_in_progress",
  "wash_receipt_uploaded", "wash_receipt_after_fuel_uploaded",
  "fueling_after_wash_in_progress", "fuel_receipt_after_wash_uploaded", "fuel_and_wash_complete",
  "service_complete", "receipts_recorded",
  "returned_location_pending", "return_location_recorded", "return_photos_needed",
  "dropoff_vehicle_photo_uploaded", "dropoff_odometer_photo_uploaded", "dropoff_fuel_gauge_photo_uploaded",
  "vehicle_returned", "inspection_needed", "inspection_recorded",
  "final_payment_processed", "awaiting_key_return", "keys_returned",
  "return_requested", "customer_return_requested",
  "payment_issue", "authorization_too_low", "pending_customer_payment",
]);
let bookedReturnSlots = new Set();
let workerAvailabilitySlots = null;
let workerAvailabilityLoaded = false;
let returningCustomerMatches = [];
let returningCustomerSavedOptions = { addresses: [], vehicles: [], recentRequests: [] };
let currentlyAppliedRequestId = null;
let currentlyAppliedSavedAddressId = null;
let currentlyAppliedSavedVehicleId = null;
let addressValidated = false;
let isReturningCustomer = false;
let isApplyingSavedAddress = false;

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
  if (isApplyingSavedAddress) return;
  if (!addressValidated) {
    const hasContent = [addressStreet, addressApt, addressCity, addressState, addressZip]
      .some(f => f?.value?.trim());
    if (hasContent) setAddressStatus('warning', 'Please validate your service address before continuing.');
    else setAddressStatus('', '');
    return;
  }
  addressValidated = false;
  currentlyAppliedSavedAddressId = null;
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
    const result = await validateServiceArea({
      street: addressStreet?.value?.trim() || '',
      apt: addressApt?.value?.trim() || '',
      city: addressCity?.value?.trim() || '',
      state: addressState?.value?.trim() || '',
      zip: addressZip?.value?.trim() || '',
    });
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
const FUEL_AUTHORIZATION_BUFFER_GALLONS = {
  5: 10,
  10: 15,
  15: 20,
  20: 30,
  25: 30,
  30: 40,
};

function fuelAuthorizationGallons(fuelRange) {
  return FUEL_AUTHORIZATION_BUFFER_GALLONS[Number(fuelRange?.value || fuelRange?.gallons || 0)] || Number(fuelRange?.gallons || 0);
}

function authorizationAmountForEstimate({ needsFuel, fuelRange, pricePerGallon, washAmount = 0, needsWash = false, quickInspection = false } = {}) {
  if (!needsFuel) {
    return servicePricingParts({
      needsFuel: false,
      needsWash,
      fuelAmount: 0,
      washAmount,
      quickInspection,
    }).total;
  }

  const authFuelAmount = fuelAuthorizationGallons(fuelRange) * Number(pricePerGallon || 0);
  return servicePricingParts({
    needsFuel: true,
    needsWash,
    fuelAmount: authFuelAmount,
    washAmount,
    quickInspection,
  }).total;
}

const serviceDatePicker = window.ShiftFuelDatePicker?.attach(
  document.getElementById('service-date-picker'),
  { min: todayValue, max: maxServiceDateValue, value: todayValue }
);

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

// Fuel prices — defaults used until DB prices load.
const averageFuelPrices = {
  Regular: 3.799,
  "Mid-grade": 4.199,
  Premium: 4.499,
  Diesel: 4.199,
};
let fuelPriceLastUpdated = null;
let fuelPriceArea = 'Primary pricing area';

async function loadFuelPricesFromDb() {
  try {
    const { data, error } = await window.ShiftFuelSupabase.rpc('public_get_fuel_prices');
    if (error || !data) return;
    averageFuelPrices.Regular = Number(data.regular_price);
    averageFuelPrices['Mid-grade'] = Number(data.midgrade_price);
    averageFuelPrices.Premium = Number(data.premium_price);
    averageFuelPrices.Diesel = Number(data.diesel_price);
    fuelPriceLastUpdated = data.last_updated_at ? new Date(data.last_updated_at) : null;
    fuelPriceArea = data.service_area_label || fuelPriceArea;
    updateEstimate();
    renderFuelPricingSummary();
  } catch {
    // Use defaults silently.
  }
}

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

const PAYMENT_RECOVERY_RATE = 0.029;
const PAYMENT_RECOVERY_FIXED = 0.30;

function roundMoneyValue(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function servicePricingParts({ needsFuel, needsWash, fuelAmount = 0, washAmount = 0, quickInspection = false }) {
  const fuelBase = needsFuel ? fees.fuelConvenience : 0;
  const washBase = needsWash ? fees.washConvenience : 0;
  const inspection = quickInspection ? fees.quickInspection : 0;
  const netTarget = roundMoneyValue(fuelAmount + washAmount + fuelBase + washBase + inspection);
  const roundedTotal = netTarget > 0
    ? Math.ceil((netTarget + PAYMENT_RECOVERY_FIXED) / (1 - PAYMENT_RECOVERY_RATE))
    : 0;
  const recovery = roundMoneyValue(roundedTotal - netTarget);
  let fuelRecovery = 0;
  let washRecovery = 0;

  if (needsFuel && needsWash) {
    // Recovery is calculated once on the whole transaction, then split
    // proportionally by base service fee (equal split when bases are
    // equal, which they currently always are). Any leftover penny from
    // rounding goes to the fuel side so the two lines always sum exactly
    // to the rounded customer total.
    const recoveryCents = Math.round(recovery * 100);
    const totalBase = fuelBase + washBase;
    const fuelCents = totalBase > 0
      ? Math.round(recoveryCents * (fuelBase / totalBase))
      : Math.round(recoveryCents / 2);
    fuelRecovery = fuelCents / 100;
    washRecovery = (recoveryCents - fuelCents) / 100;
  } else if (needsFuel) {
    fuelRecovery = recovery;
  } else if (needsWash) {
    washRecovery = recovery;
  }

  const grossBeforeRounding = netTarget > 0 ? (netTarget + PAYMENT_RECOVERY_FIXED) / (1 - PAYMENT_RECOVERY_RATE) : 0;

  return {
    fuelBase,
    washBase,
    fuelService: roundMoneyValue(fuelBase + fuelRecovery),
    washService: roundMoneyValue(washBase + washRecovery),
    inspection,
    recovery,
    netTarget,
    grossBeforeRounding,
    total: roundedTotal,
  };
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
  const authGallons = serviceType.needsFuel ? fuelAuthorizationGallons(fuelRange) : 0;
  const authFuelAmount = authGallons * pricePerGallon;
  const washFee = serviceType.needsWash && washPackage ? washPackage.price : 0;
  const pricing = servicePricingParts({
    needsFuel: serviceType.needsFuel,
    needsWash: serviceType.needsWash && !!washPackage,
    fuelAmount,
    washAmount: washFee,
    quickInspection: quickInspection.checked,
  });

  paymentWashRow.hidden = !serviceType.needsWash || !washPackage;
  paymentWashConvenienceRow.hidden = !serviceType.needsWash || !washPackage;
  paymentFuelRow.hidden = !serviceType.needsFuel;
  paymentPriceRow.hidden = !serviceType.needsFuel;
  paymentConvenienceRow.hidden = !serviceType.needsFuel;
  paymentInspectionRow.hidden = !quickInspection.checked;

  estimatedWash.textContent = washPackage ? `${washPackage.label} - ${formatCurrency(washFee)}` : "$0.00";
  washConvenienceFeeDisplay.textContent = formatCurrency(pricing.washService);
  estimatedFuel.textContent = serviceType.needsFuel
    ? `${fuelRange?.label || "0 gallons"} selected. Authorization hold uses ${authGallons} gallons x ${formatPricePerGallon(pricePerGallon)} = ${formatCurrency(authFuelAmount)}. Final fuel cost is based on the actual receipt.`
    : formatCurrency(fuelAmount);
  averagePrice.textContent = formatPricePerGallon(pricePerGallon);
  fuelConvenienceFeeDisplay.textContent = formatCurrency(pricing.fuelService);
  inspectionFeeDisplay.textContent = formatCurrency(pricing.inspection);
  estimatedTotal.textContent = formatCurrency(authorizationAmountForEstimate({
    needsFuel: serviceType.needsFuel,
    fuelRange,
    pricePerGallon,
    needsWash: serviceType.needsWash && !!washPackage,
    washAmount: washFee,
    quickInspection: quickInspection.checked,
  }));
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

// ── Service area validation ───────────────────────────────────────────────────
// Geocoding happens server-side (api/address.js) to avoid CORS/rate-limit
// issues with calling Nominatim directly from the browser, and to keep the
// service-area anchor/radius defined in one place.

async function validateServiceArea({ street = '', apt = '', city = '', state = '', zip = '' } = {}) {
  try {
    const res = await fetch('/api/address', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'validate_service_area', street, apt, city, state, zip }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { valid: false, message: data.message || 'We could not verify this address. Please check your address and try again.' };
    }
    return data;
  } catch {
    return { valid: false, message: 'We could not verify this address. Please check your address and try again.' };
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
        .filter((request) => slotHoldingStatuses.has(request.status))
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
      .filter((request) => slotHoldingStatuses.has(request.status))
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

  details.push("Service prices include payment and operating costs. Final fuel cost is based on the actual receipt. Final totals are rounded up to the nearest dollar.");

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
function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function formatPhone(value) {
  let digits = normalizePhone(value);
  if (digits.length === 11 && digits[0] === "1") digits = digits.slice(1);
  if (digits.length !== 10) return value || "";
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function cleanLookupPhone(value) {
  return normalizePhone(value);
}

// Reformats a phone <input> live as the customer types, preserving cursor
// position by digit count. Safe to call more than once on the same element.
function attachPhoneInputFormatting(input) {
  if (!input || input.dataset.phoneFormatBound) return;
  input.dataset.phoneFormatBound = "1";
  input.addEventListener("input", () => {
    const digitsBeforeCursor = normalizePhone(input.value.slice(0, input.selectionStart || 0)).length;
    const digits = normalizePhone(input.value).slice(0, 10);
    let formatted = digits;
    if (digits.length > 6) formatted = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    else if (digits.length > 3) formatted = `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    else if (digits.length > 0) formatted = `(${digits}`;
    input.value = formatted;

    let pos = 0;
    let seen = 0;
    while (pos < formatted.length && seen < digitsBeforeCursor) {
      if (/\d/.test(formatted[pos])) seen += 1;
      pos += 1;
    }
    input.setSelectionRange(pos, pos);
  });
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

function returningVehicleCardTitle(vehicle) {
  return [
    vehicle.vehicle_year,
    vehicle.vehicle_make,
    vehicle.vehicle_model,
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

function returningAddressLabel(address) {
  return address.address_street || address.hospital || "Saved address";
}

function returningVehicleDetails(vehicle) {
  return [
    vehicle.vehicle_color ? `Color: ${vehicle.vehicle_color}` : "",
    vehicle.license_plate ? `Plate: ${vehicle.license_plate}` : "",
  ].filter(Boolean).join(" | ");
}

function savedVehiclePlateKey(value) {
  return String(value || "").trim().toUpperCase().replace(/[\s-]+/g, "");
}

function savedVehicleColorKey(value) {
  return String(value || "").trim().toLowerCase();
}

function savedVehicleDuplicateExists(candidate, currentVehicleId = null) {
  const plateKey = savedVehiclePlateKey(candidate.license_plate);
  const colorKey = savedVehicleColorKey(candidate.vehicle_color);
  if (!plateKey || !colorKey) return false;

  return returningCustomerSavedOptions.vehicles.some((vehicle) => {
    if (currentVehicleId && vehicle.id === currentVehicleId) return false;
    return savedVehiclePlateKey(vehicle.license_plate) === plateKey
      && savedVehicleColorKey(vehicle.vehicle_color) === colorKey;
  });
}

function returningAddressCityLine(address) {
  return [address.address_city, address.address_state, address.address_zip].filter(Boolean).join(", ");
}

function savedAddressTextKey(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function savedAddressStateKey(value) {
  return String(value || "").trim().toUpperCase();
}

function savedAddressZipKey(value) {
  return String(value || "").replace(/\D/g, "");
}

function savedAddressDuplicateKey(address) {
  return [
    savedAddressTextKey(address.address_street || address.hospital),
    savedAddressTextKey(address.address_apt),
    savedAddressTextKey(address.address_city),
    savedAddressStateKey(address.address_state),
    savedAddressZipKey(address.address_zip),
  ].join("|");
}

function uniqueSavedAddresses(addresses) {
  const seen = new Set();
  return (addresses || []).filter((address) => {
    const key = savedAddressDuplicateKey(address);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function savedAddressDuplicateExists(candidate, currentAddressId = null) {
  const key = savedAddressDuplicateKey(candidate);
  return returningCustomerSavedOptions.addresses.some((address) => {
    if (currentAddressId && address.id === currentAddressId) return false;
    return savedAddressDuplicateKey(address) === key;
  });
}

function shortDate(value) {
  if (!value) return "Date not listed";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function legacyRequestsToSavedOptions(requests) {
  const addressKeys = new Set();
  const vehicleKeys = new Set();
  const addresses = [];
  const vehicles = [];

  (requests || []).forEach((request, index) => {
    const addressKey = [
      request.address_street || request.hospital || "",
      request.address_apt || "",
      request.address_city || "",
      request.address_state || "",
      request.address_zip || "",
    ].map((part) => String(part).toLowerCase()).join("|");
    if (!addressKeys.has(addressKey)) {
      addressKeys.add(addressKey);
      addresses.push({ ...request, id: request.id || `legacy-address-${index}`, legacy_request_index: index });
    }

    const vehicleKey = [
      request.license_plate || "",
      request.vehicle_year || "",
      request.vehicle_make || "",
      request.vehicle_model || "",
    ].map((part) => String(part).toLowerCase()).join("|");
    if (!vehicleKeys.has(vehicleKey)) {
      vehicleKeys.add(vehicleKey);
      vehicles.push({ ...request, id: request.id || `legacy-vehicle-${index}`, legacy_request_index: index });
    }
  });

  return { addresses, vehicles, recentRequests: requests || [] };
}

function setReturningSavedOptions(options) {
  returningCustomerSavedOptions = {
    addresses: uniqueSavedAddresses(Array.isArray(options?.addresses) ? options.addresses : []),
    vehicles: Array.isArray(options?.vehicles) ? options.vehicles : [],
    recentRequests: Array.isArray(options?.recent_requests)
      ? options.recent_requests
      : Array.isArray(options?.recentRequests)
      ? options.recentRequests
      : [],
  };
  returningCustomerMatches = returningCustomerSavedOptions.recentRequests;
}

function renderReturningCustomerResults() {
  if (!returningCustomerResults) return;

  const { addresses, vehicles } = returningCustomerSavedOptions;
  returningCustomerResults.hidden = false;
  returningCustomerResults.innerHTML = `
    <section class="returning-customer-section">
      <div class="returning-customer-section-head">
        <h4>Saved addresses</h4>
        <button class="button secondary" type="button" data-returning-add-address>Add new address</button>
      </div>
      ${addresses.length ? addresses.map((address, index) => `
        <article class="returning-customer-card ${currentlyAppliedSavedAddressId && currentlyAppliedSavedAddressId === address.id ? "is-selected" : ""}">
          <span>${escapeHtml(returningAddressLabel(address))}</span>
          ${currentlyAppliedSavedAddressId && currentlyAppliedSavedAddressId === address.id ? `<small class="selected-option-note">Selected address</small>` : ""}
          ${returningAddressCityLine(address) ? `<small>${escapeHtml(returningAddressCityLine(address))}</small>` : ""}
          <div class="returning-customer-actions">
            <button class="button primary" type="button" data-returning-address-index="${index}">${currentlyAppliedSavedAddressId && currentlyAppliedSavedAddressId === address.id ? "Address selected" : "Use this address"}</button>
            <button class="button secondary" type="button" data-returning-edit-address="${index}">Edit</button>
            <button class="button danger" type="button" data-returning-delete-address="${index}">Delete</button>
          </div>
        </article>
      `).join("") : `<p class="field-help">No saved addresses. Use Add new address.</p>`}
    </section>
    <section class="returning-customer-section">
      <div class="returning-customer-section-head">
        <h4>Saved vehicles</h4>
        <button class="button secondary" type="button" data-returning-add-vehicle>Add new vehicle</button>
      </div>
      ${vehicles.length ? vehicles.map((vehicle, index) => `
        <article class="returning-customer-card ${currentlyAppliedSavedVehicleId && currentlyAppliedSavedVehicleId === vehicle.id ? "is-selected" : ""}">
          <span>${escapeHtml(returningVehicleCardTitle(vehicle) || "Saved vehicle")}</span>
          ${currentlyAppliedSavedVehicleId && currentlyAppliedSavedVehicleId === vehicle.id ? `<small class="selected-option-note">Selected vehicle</small>` : ""}
          ${returningVehicleDetails(vehicle) ? `<small>${escapeHtml(returningVehicleDetails(vehicle))}</small>` : ""}
          <div class="returning-customer-actions">
            <button class="button primary" type="button" data-returning-vehicle-index="${index}">${currentlyAppliedSavedVehicleId && currentlyAppliedSavedVehicleId === vehicle.id ? "Vehicle selected" : "Use this vehicle"}</button>
            <button class="button secondary" type="button" data-returning-edit-vehicle="${index}">Edit</button>
            <button class="button danger" type="button" data-returning-delete-vehicle="${index}">Delete</button>
          </div>
        </article>
      `).join("") : `<p class="field-help">No saved vehicles. Use Add new vehicle.</p>`}
    </section>
  `;
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
    const { data: savedOptions, error: savedError } = await window.ShiftFuelSupabase
      .rpc("public_returning_customer_options", {
        p_phone: phone,
        p_email: lookupEmail,
      });

    if (!savedError) {
      setReturningSavedOptions(savedOptions || {});

      if (!returningCustomerSavedOptions.addresses.length && !returningCustomerSavedOptions.vehicles.length) {
        returningCustomerStatus.textContent = "No saved addresses or vehicles found. Use Add new address and Add new vehicle below.";
        returningCustomerResults.hidden = false;
        returningCustomerResults.innerHTML = `
          <section class="returning-customer-section">
            <div class="returning-customer-section-head">
              <h4>Saved addresses</h4>
              <button class="button secondary" type="button" data-returning-add-address>Add new address</button>
            </div>
            <p class="field-help">No saved addresses yet.</p>
          </section>
          <section class="returning-customer-section">
            <div class="returning-customer-section-head">
              <h4>Saved vehicles</h4>
              <button class="button secondary" type="button" data-returning-add-vehicle>Add new vehicle</button>
            </div>
            <p class="field-help">No saved vehicles yet.</p>
          </section>
        `;
        return;
      }

      returningCustomerStatus.textContent = "Choose a saved address and saved vehicle to prefill the form.";
      renderReturningCustomerResults();
      return;
    }

    console.warn("Saved returning customer lookup failed; trying legacy lookup:", savedError);

    const { data: rpcMatches, error: rpcError } = await window.ShiftFuelSupabase
      .rpc("public_returning_customer_lookup", {
        p_phone: phone,
        p_email: lookupEmail,
      });

    if (!rpcError) {
      setReturningSavedOptions(legacyRequestsToSavedOptions(rpcMatches || []));

      if (!returningCustomerSavedOptions.addresses.length && !returningCustomerSavedOptions.vehicles.length) {
        returningCustomerStatus.textContent = "No previous booking found. You can still complete the form below.";
        renderReturningCustomerResults();
        return;
      }

      returningCustomerStatus.textContent = "Choose a saved address and saved vehicle to prefill the form.";
      renderReturningCustomerResults();
      return;
    }

    console.warn("Returning customer lookup failed:", rpcError);
    returningCustomerStatus.textContent = "Returning customer lookup is not available right now. Please complete the form manually.";
  } catch (error) {
    console.error("Returning customer lookup failed:", error);
    returningCustomerStatus.textContent = "Could not look up previous bookings right now.";
  } finally {
    returningCustomerButton.disabled = false;
    returningCustomerButton.textContent = "Find my info";
  }
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
  form.elements.phone.value = formatPhone(request.customer_phone || "");
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
  scrollToParkingVerification();

  returningCustomerStatus.textContent = mode === "new-car"
    ? "Your previous info and service were filled in. Add the new vehicle, then confirm parking and key handoff."
    : "Your previous info has been filled in. Confirm parking and key handoff, then choose today's date and return time.";
}

function fillReturningContact(option) {
  form.elements.name.value = option.customer_name || form.elements.name.value || "";
  form.elements.phone.value = formatPhone(returningCustomerSearch?.value || option.customer_phone || form.elements.phone.value || "");
  form.elements.email.value = (returningCustomerEmail?.value || option.customer_email || form.elements.email.value || "").toLowerCase();
}

function applyReturningAddress(index) {
  const address = returningCustomerSavedOptions.addresses[index];
  if (!address) return;
  currentlyAppliedSavedAddressId = address.id || null;
  fillReturningContact(address);

  isApplyingSavedAddress = true;
  try {
    if (addressStreet) addressStreet.value = address.address_street || address.hospital || "";
    if (addressApt)    addressApt.value    = address.address_apt    || "";
    if (addressCity)   addressCity.value   = address.address_city   || "";
    if (addressState)  addressState.value  = address.address_state  || "DE";
    if (addressZip)    addressZip.value    = address.address_zip    || "";
    form.elements.parkingLocation.value = "";
    form.elements.parkingMapUrl.value = "";
    form.elements.keyHandoffDetails.value = "";
  } finally {
    isApplyingSavedAddress = false;
  }

  isReturningCustomer = true;
  addressValidated = true;
  setPostAddressSections(true);
  setAddressStatus("success", "Saved address selected. Confirm parking and key handoff before continuing.");
  renderReturningCustomerResults();
  returningCustomerStatus.textContent = "Saved address selected. Confirm parking and key handoff before continuing.";
}

async function applyReturningVehicle(index) {
  const vehicle = returningCustomerSavedOptions.vehicles[index];
  if (!vehicle) return;
  currentlyAppliedSavedVehicleId = vehicle.id || null;
  fillReturningContact(vehicle);

  form.elements.color.value = vehicle.vehicle_color || "";
  form.elements.license.value = vehicle.license_plate || "";
  if (vehicle.fuel_type && fuelType) fuelType.value = vehicle.fuel_type;
  await setVehicleFromPrevious(vehicle);

  isReturningCustomer = true;
  updateServiceControls();
  updateEstimate();
  renderReturningCustomerResults();
  if (currentlyAppliedSavedAddressId) {
    scrollToParkingVerification();
    returningCustomerStatus.textContent = "Saved vehicle selected. Confirm parking and key handoff before continuing.";
  } else {
    returningCustomerStatus.textContent = "Saved vehicle selected. Choose a saved address or add a new address next.";
  }
}

async function addNewReturningAddress() {
  currentlyAppliedSavedAddressId = null;
  const data = await openSavedAddressModal(null);
  if (!data) return;
  const phone = cleanLookupPhone(returningCustomerSearch?.value.trim() || "");
  const email = (returningCustomerEmail?.value.trim() || "").toLowerCase();
  const { error } = await window.ShiftFuelSupabase.rpc("public_add_saved_address", {
    p_phone: phone,
    p_email: email,
    p_data: data,
  });
  if (error) {
    console.warn("Could not add saved address:", error);
    returningCustomerStatus.textContent = String(error.message || "").includes("already saved")
      ? "This address is already saved. Please use the saved address or edit the existing one."
      : "Could not add that saved address.";
    return;
  }
  await refreshReturningOptionsAfterMutation("Saved address added.");
}

async function addNewReturningVehicle() {
  currentlyAppliedSavedVehicleId = null;
  const data = await openSavedVehicleModal(null);
  if (!data) return;
  const phone = cleanLookupPhone(returningCustomerSearch?.value.trim() || "");
  const email = (returningCustomerEmail?.value.trim() || "").toLowerCase();
  const { error } = await window.ShiftFuelSupabase.rpc("public_add_saved_vehicle", {
    p_phone: phone,
    p_email: email,
    p_data: data,
  });
  if (error) {
    console.warn("Could not add saved vehicle:", error);
    returningCustomerStatus.textContent = String(error.message || "").includes("already appears to be saved")
      ? "This vehicle already appears to be saved. Please use the saved vehicle or edit the existing one."
      : "Could not add that saved vehicle.";
    return;
  }
  await refreshReturningOptionsAfterMutation("Saved vehicle added.");
}

async function refreshReturningOptionsAfterMutation(message) {
  await lookupReturningCustomer();
  if (message && returningCustomerStatus) returningCustomerStatus.textContent = message;
}

function modalOption(value, label = value, selected = false) {
  return `<option value="${escapeHtml(value)}"${selected ? " selected" : ""}>${escapeHtml(label)}</option>`;
}

function populateModalVehicleYears(select, selectedValue = "") {
  select.innerHTML = `<option value="">Select year</option>`;
  for (let optionYear = currentYear; optionYear >= 1980; optionYear -= 1) {
    select.insertAdjacentHTML("beforeend", modalOption(String(optionYear), String(optionYear), String(optionYear) === String(selectedValue)));
  }
}

function populateModalVehicleMakes(select, selectedValue = "") {
  select.innerHTML = "";
  const popular = document.createElement("optgroup");
  const other = document.createElement("optgroup");
  popular.label = "Most common makes";
  other.label = "Other makes";
  popularMakes.forEach((make) => popular.append(createOption(make)));
  otherMakes
    .filter((make) => !popularMakes.includes(make))
    .sort((a, b) => a.localeCompare(b))
    .forEach((make) => other.append(createOption(make)));
  select.append(popular, other);
  if (selectedValue) select.value = selectedValue;
}

async function loadModalVehicleModels(year, make, modelSelect, selectedModel = "") {
  modelSelect.innerHTML = `<option value="">Loading models...</option>`;
  modelSelect.disabled = true;
  if (!year || !make) {
    modelSelect.innerHTML = `<option value="">Select year and make first</option>`;
    return;
  }

  try {
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(make)}/modelyear/${year}/vehicletype/car?format=json`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Vehicle model lookup failed.");
    const data = await response.json();
    const models = [...new Set(data.Results.map((item) => item.Model_Name).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    modelSelect.innerHTML = `<option value="">Select model</option>`;
    models.forEach((model) => modelSelect.append(createOption(model)));
  } catch {
    const fallback = fallbackModels[make] || [];
    modelSelect.innerHTML = `<option value="">${fallback.length ? "Select model" : "No models found"}</option>`;
    fallback.forEach((model) => modelSelect.append(createOption(model)));
  }

  if (selectedModel && !Array.from(modelSelect.options).some((option) => option.value === selectedModel)) {
    modelSelect.append(createOption(selectedModel));
  }
  if (selectedModel) modelSelect.value = selectedModel;
  modelSelect.disabled = modelSelect.options.length <= 1;
}

function openReturningModal(title, bodyHtml) {
  let modalRef = null;
  const promise = new Promise((resolve) => {
    const modal = document.createElement("div");
    modalRef = modal;
    modal.className = "returning-modal";
    modal.innerHTML = `
      <div class="returning-modal-dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
        <div class="returning-modal-header">
          <h3>${escapeHtml(title)}</h3>
          <button class="button secondary returning-modal-close" type="button">Close</button>
        </div>
        ${bodyHtml}
      </div>
    `;
    document.body.append(modal);
    const close = (value = null) => {
      modal.remove();
      resolve(value);
    };
    modal.querySelector(".returning-modal-close")?.addEventListener("click", () => close(null));
    modal.addEventListener("click", (event) => {
      if (event.target === modal) close(null);
    });
    modal.addEventListener("returning-modal-save", (event) => close(event.detail));
  });
  return { promise, modal: modalRef };
}

async function openSavedAddressModal(address = null) {
  const title = address ? "Edit saved address" : "Add new address";
  const { promise: resultPromise, modal } = openReturningModal(title, `
    <form class="returning-address-modal-form">
      <fieldset>
        <legend>Service address</legend>
        <div class="address-fields">
          <label><span>Street address <span class="required-mark">Required</span></span><input class="ram-street" type="text" autocomplete="address-line1" placeholder="123 Main Street" value="${escapeHtml(address?.address_street || address?.hospital || "")}" required></label>
          <label><span>Apt / Suite / Unit <span class="optional-mark">Optional</span></span><input class="ram-apt" type="text" autocomplete="address-line2" placeholder="Suite 200, Unit B" value="${escapeHtml(address?.address_apt || "")}"></label>
          <div class="address-csz">
            <label><span>City <span class="required-mark">Required</span></span><input class="ram-city" type="text" autocomplete="address-level2" placeholder="Newark" value="${escapeHtml(address?.address_city || "")}" required></label>
            <label><span>State</span><input class="ram-state" type="text" autocomplete="address-level1" placeholder="DE" value="${escapeHtml(address?.address_state || "DE")}"></label>
            <label><span>ZIP <span class="required-mark">Required</span></span><input class="ram-zip" type="text" autocomplete="postal-code" inputmode="numeric" placeholder="19702" value="${escapeHtml(address?.address_zip || "")}" required></label>
          </div>
        </div>
        <div class="address-validate-row">
          <button class="button secondary ram-validate" type="button">Validate Address</button>
        </div>
        <p class="field-help ram-status" role="status"></p>
      </fieldset>
      <div class="returning-modal-actions">
        <button class="button primary ram-save" type="submit" disabled>Save address</button>
      </div>
    </form>
  `);

  const formEl = modal.querySelector(".returning-address-modal-form");
  const statusEl = modal.querySelector(".ram-status");
  const saveBtn = modal.querySelector(".ram-save");
  let validated = false;

  const collect = () => {
    const street = modal.querySelector(".ram-street")?.value.trim() || "";
    const apt = modal.querySelector(".ram-apt")?.value.trim() || "";
    const city = modal.querySelector(".ram-city")?.value.trim() || "";
    const state = modal.querySelector(".ram-state")?.value.trim() || "DE";
    const zip = modal.querySelector(".ram-zip")?.value.trim() || "";
    return {
      customer_name: form.elements.name.value || "",
      hospital: [street, city, state, zip].filter(Boolean).join(", "),
      address_street: street,
      address_apt: apt,
      address_city: city,
      address_state: state,
      address_zip: zip,
      service_area_valid: true,
    };
  };

  formEl.querySelectorAll("input").forEach((input) => input.addEventListener("input", () => {
    validated = false;
    saveBtn.disabled = true;
    statusEl.textContent = "Validate this address before saving.";
    statusEl.dataset.status = "warning";
  }));

  modal.querySelector(".ram-validate")?.addEventListener("click", async () => {
    const data = collect();
    if (!data.address_street || !data.address_city || !data.address_zip) {
      statusEl.textContent = "Please enter the required address fields.";
      statusEl.dataset.status = "error";
      return;
    }
    if (savedAddressDuplicateExists(data, address?.id || null)) {
      statusEl.textContent = "This address is already saved. Please use the saved address or edit the existing one.";
      statusEl.dataset.status = "error";
      validated = false;
      saveBtn.disabled = true;
      return;
    }
    statusEl.textContent = "Verifying address...";
    statusEl.dataset.status = "";
    const validation = await validateServiceArea({
      street: data.address_street,
      apt: data.address_apt,
      city: data.address_city,
      state: data.address_state,
      zip: data.address_zip,
    });
    if (!validation.valid) {
      statusEl.textContent = validation.message || "We currently do not serve this area.";
      statusEl.dataset.status = "error";
      validated = false;
      saveBtn.disabled = true;
      return;
    }
    if (savedAddressDuplicateExists(data, address?.id || null)) {
      statusEl.textContent = "This address is already saved. Please use the saved address or edit the existing one.";
      statusEl.dataset.status = "error";
      validated = false;
      saveBtn.disabled = true;
      return;
    }
    statusEl.textContent = "Address verified.";
    statusEl.dataset.status = "success";
    validated = true;
    saveBtn.disabled = false;
  });

  formEl.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!validated) return;
    modal.dispatchEvent(new CustomEvent("returning-modal-save", { detail: collect() }));
  });

  return resultPromise;
}

async function openSavedVehicleModal(vehicle = null) {
  const title = vehicle ? "Edit saved vehicle" : "Add new vehicle";
  const { promise: resultPromise, modal } = openReturningModal(title, `
    <form class="returning-vehicle-modal-form">
      <fieldset>
        <legend>Vehicle</legend>
        <div class="field-grid">
          <label><span>Year <span class="required-mark">Required</span></span><select class="rvm-year" required></select></label>
          <label><span>Make <span class="required-mark">Required</span></span><select class="rvm-make" required></select></label>
          <label><span>Model <span class="required-mark">Required</span></span><select class="rvm-model" required disabled><option value="">Select year and make first</option></select><span class="field-help">Models load after you choose a year and make.</span></label>
          <label><span>Color <span class="required-mark">Required</span></span><input class="rvm-color" type="text" placeholder="Silver" value="${escapeHtml(vehicle?.vehicle_color || "")}" required></label>
          <label><span>License plate <span class="required-mark">Required</span></span><input class="rvm-plate" type="text" placeholder="ABC-1234" value="${escapeHtml(vehicle?.license_plate || "")}" required></label>
        </div>
      </fieldset>
      <p class="field-help rvm-status" role="status"></p>
      <div class="returning-modal-actions">
        <button class="button primary" type="submit">Save vehicle</button>
      </div>
    </form>
  `);

  const yearSel = modal.querySelector(".rvm-year");
  const makeSel = modal.querySelector(".rvm-make");
  const modelSel = modal.querySelector(".rvm-model");
  const statusEl = modal.querySelector(".rvm-status");
  populateModalVehicleYears(yearSel, vehicle?.vehicle_year || "");
  populateModalVehicleMakes(makeSel, vehicle?.vehicle_make || "");
  await loadModalVehicleModels(yearSel.value, makeSel.value, modelSel, vehicle?.vehicle_model || "");

  const reloadModels = () => loadModalVehicleModels(yearSel.value, makeSel.value, modelSel, "");
  yearSel.addEventListener("change", reloadModels);
  makeSel.addEventListener("change", reloadModels);

  modal.querySelector(".returning-vehicle-modal-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = {
      customer_name: form.elements.name.value || "",
      vehicle_year: yearSel.value,
      vehicle_make: makeSel.value,
      vehicle_model: modelSel.value,
      vehicle_color: modal.querySelector(".rvm-color")?.value.trim() || "",
      license_plate: modal.querySelector(".rvm-plate")?.value.trim() || "",
    };
    if (savedVehicleDuplicateExists(data, vehicle?.id || null)) {
      statusEl.textContent = "This vehicle already appears to be saved. Please use the saved vehicle or edit the existing one.";
      statusEl.dataset.status = "error";
      return;
    }
    modal.dispatchEvent(new CustomEvent("returning-modal-save", {
      detail: data,
    }));
  });

  return resultPromise;
}

async function editReturningAddress(index) {
  const address = returningCustomerSavedOptions.addresses[index];
  if (!address?.id || !window.ShiftFuelSupabase) {
    applyReturningAddress(index);
    returningCustomerStatus.textContent = "Address filled in. Edit the fields below before booking.";
    return;
  }

  const data = await openSavedAddressModal(address);
  if (!data) return;

  const phone = cleanLookupPhone(returningCustomerSearch?.value.trim() || "");
  const email = (returningCustomerEmail?.value.trim() || "").toLowerCase();
  const { error } = await window.ShiftFuelSupabase.rpc("public_update_saved_address", {
    p_address_id: address.id,
    p_phone: phone,
    p_email: email,
    p_data: data,
  });
  if (error) {
    console.warn("Could not edit saved address:", error);
    returningCustomerStatus.textContent = String(error.message || "").includes("already saved")
      ? "This address is already saved. Please use the saved address or edit the existing one."
      : "Could not update that saved address. You can still edit the booking form below.";
    return;
  }
  await refreshReturningOptionsAfterMutation("Saved address updated.");
}

async function editReturningVehicle(index) {
  const vehicle = returningCustomerSavedOptions.vehicles[index];
  if (!vehicle?.id || !window.ShiftFuelSupabase) {
    await applyReturningVehicle(index);
    returningCustomerStatus.textContent = "Vehicle filled in. Edit the fields below before booking.";
    return;
  }

  const data = await openSavedVehicleModal(vehicle);
  if (!data) return;

  const phone = cleanLookupPhone(returningCustomerSearch?.value.trim() || "");
  const email = (returningCustomerEmail?.value.trim() || "").toLowerCase();
  const { error } = await window.ShiftFuelSupabase.rpc("public_update_saved_vehicle", {
    p_vehicle_id: vehicle.id,
    p_phone: phone,
    p_email: email,
    p_data: data,
  });
  if (error) {
    console.warn("Could not edit saved vehicle:", error);
    returningCustomerStatus.textContent = String(error.message || "").includes("already appears to be saved")
      ? "This vehicle already appears to be saved. Please use the saved vehicle or edit the existing one."
      : "Could not update that saved vehicle. You can still edit the booking form below.";
    return;
  }
  await refreshReturningOptionsAfterMutation("Saved vehicle updated.");
}

async function deleteReturningAddress(index, button) {
  const address = returningCustomerSavedOptions.addresses[index];
  if (!address) return;
  const confirmed = confirm("Delete this saved address? This removes it from future booking options only. Past requests will not be changed.");
  if (!confirmed) return;

  button.disabled = true;
  button.textContent = "Deleting...";
  const phone = cleanLookupPhone(returningCustomerSearch?.value.trim() || "");
  const email = (returningCustomerEmail?.value.trim() || "").toLowerCase();

  if (window.ShiftFuelSupabase && address.id && phone && email) {
    const { error } = await window.ShiftFuelSupabase.rpc("public_soft_delete_saved_address", {
      p_address_id: address.id,
      p_phone: phone,
      p_email: email,
    });
    if (error) {
      console.warn("Could not delete saved address:", error);
      button.disabled = false;
      button.textContent = "Delete";
      returningCustomerStatus.textContent = "Could not delete that saved address.";
      return;
    }
  }

  if (currentlyAppliedSavedAddressId === address.id) currentlyAppliedSavedAddressId = null;
  returningCustomerSavedOptions.addresses.splice(index, 1);
  renderReturningCustomerResults();
  returningCustomerStatus.textContent = returningCustomerSavedOptions.addresses.length
    ? "Saved address removed from future booking options."
    : "No saved addresses remaining. Use Add new address.";
}

async function deleteReturningVehicle(index, button) {
  const vehicle = returningCustomerSavedOptions.vehicles[index];
  if (!vehicle) return;
  const confirmed = confirm("Delete this saved vehicle? This removes it from future booking options only. Past requests will not be changed.");
  if (!confirmed) return;

  button.disabled = true;
  button.textContent = "Deleting...";
  const phone = cleanLookupPhone(returningCustomerSearch?.value.trim() || "");
  const email = (returningCustomerEmail?.value.trim() || "").toLowerCase();

  if (window.ShiftFuelSupabase && vehicle.id && phone && email) {
    const { error } = await window.ShiftFuelSupabase.rpc("public_soft_delete_saved_vehicle", {
      p_vehicle_id: vehicle.id,
      p_phone: phone,
      p_email: email,
    });
    if (error) {
      console.warn("Could not delete saved vehicle:", error);
      button.disabled = false;
      button.textContent = "Delete";
      returningCustomerStatus.textContent = "Could not delete that saved vehicle.";
      return;
    }
  }

  if (currentlyAppliedSavedVehicleId === vehicle.id) {
    clearVehicleFields();
    currentlyAppliedSavedVehicleId = null;
  }
  returningCustomerSavedOptions.vehicles.splice(index, 1);
  renderReturningCustomerResults();
  returningCustomerStatus.textContent = returningCustomerSavedOptions.vehicles.length
    ? "Saved vehicle removed from future booking options."
    : "No saved vehicles remaining. Use Add new vehicle.";
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
  const washFee = serviceType.needsWash && washPackage ? washPackage.price : 0;
  const estimatedFuelAmount = gallons * pricePerGallon;
  const pricing = servicePricingParts({
    needsFuel: serviceType.needsFuel,
    needsWash: serviceType.needsWash && !!washPackage,
    fuelAmount: estimatedFuelAmount,
    washAmount: washFee,
    quickInspection: data.get("quickInspection") === "yes",
  });
  const selectedFee = pricing.fuelService + washFee + pricing.washService + pricing.inspection;
  const estimatedTotalAmount = pricing.total;
  const authorizationAmount = authorizationAmountForEstimate({
    needsFuel: serviceType.needsFuel,
    fuelRange,
    pricePerGallon,
    needsWash: serviceType.needsWash && !!washPackage,
    washAmount: washFee,
    quickInspection: data.get("quickInspection") === "yes",
  });

  return {
    customer: {
      name: data.get("name"),
	  phone: formatPhone(data.get("phone")),
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
      fuelConvenienceFee: pricing.fuelService,
      washPackage: washPackage ? carWashPackage.value : null,
      washPackageLabel: washPackage?.label || null,
      washFee,
      washConvenienceFee: pricing.washService,
      quickInspection: pricing.inspection > 0,
      quickInspectionFee: pricing.inspection,
      paymentOperatingRecovery: pricing.recovery,
      baseFuelServiceFee: serviceType.needsFuel ? pricing.fuelBase : null,
      baseCarWashServiceFee: serviceType.needsWash && washPackage ? pricing.washBase : null,
      baseInspectionFee: pricing.inspection > 0 ? pricing.inspection : null,
      netTargetAmount: pricing.netTarget,
      grossTotalBeforeRounding: roundMoneyValue(pricing.grossBeforeRounding),
      roundedCustomerTotal: pricing.total,
      authorizedAmount: authorizationAmount,
      serviceLabel: service.options[service.selectedIndex]?.textContent || selectedService,
      detailingAvailableWindow: serviceType.needsWash ? "9:00 AM - 6:00 PM" : null,
      estimatedTotal: authorizationAmount || moneyValue(estimatedTotal.textContent),
      finalTotal: null,
      status: "request_received",
      notes: data.get("notes"),
    },
    photos: [],
    payment: {
      paymentIntentId: null,
      estimatedAmount: authorizationAmount,
      finalAmount: null,
      paymentStatus: "not_started",
    },
  };
}

function isMissingRpcError(error) {
  const message = String(error?.message || "").toLowerCase();
  return ["PGRST202", "PGRST204", "42883"].includes(error?.code)
    || message.includes("could not find the function")
    || (message.includes("function") && message.includes("does not exist"));
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
    base_fuel_service_fee: payload.request.baseFuelServiceFee,
    base_car_wash_service_fee: payload.request.baseCarWashServiceFee,
    base_inspection_fee: payload.request.baseInspectionFee,
    payment_operating_recovery_amount: payload.request.paymentOperatingRecovery,
    displayed_fuel_service_fee: payload.request.fuelConvenienceFee,
    displayed_car_wash_service_fee: payload.request.washConvenienceFee,
    displayed_inspection_fee: payload.request.baseInspectionFee,
    net_target_amount: payload.request.netTargetAmount,
    gross_total_before_rounding: payload.request.grossTotalBeforeRounding,
    rounded_customer_total: payload.request.roundedCustomerTotal,
    authorized_amount: payload.request.authorizedAmount,
  };
}

async function insertServiceRequest(supabase, payload) {
  // Booking creation now happens server-side (api/payments.js,
  // action: create_authorized_booking) after Stripe authorization succeeds.
  // This verifies the PaymentIntent and inserts with the service-role key,
  // since production RLS no longer allows a direct anon insert with
  // customer-controlled status/payment fields.
  const row = getServiceRequestInsert(payload);
  const paymentIntentId = payload.payment.paymentIntentId;

  if (!paymentIntentId) {
    return { data: null, error: new Error('Missing payment authorization. Please try again.') };
  }

  const amountCents = Math.max(Math.round((payload.payment.estimatedAmount || 0) * 100), 50);

  // These are always set server-side — strip any local copies before sending.
  delete row.status;
  delete row.payment_status;
  delete row.payment_intent_id;

  try {
    const res = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create_authorized_booking',
        payment_intent_id: paymentIntentId,
        amount_cents: amountCents,
        ...row,
      }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error('[insertServiceRequest] create_authorized_booking failed:', data.error);
      return {
        data: null,
        error: new Error(data.error || 'We could not finish saving your booking after payment authorization. Please try again or contact ShiftFuel.'),
      };
    }

    return { data: [data], error: null };
  } catch (err) {
    console.error('[insertServiceRequest] Network error:', err);
    return {
      data: null,
      error: new Error('We could not finish saving your booking after payment authorization. Please try again or contact ShiftFuel.'),
    };
  }
}

attachPhoneInputFormatting(form.elements.phone);
attachPhoneInputFormatting(returningCustomerSearch);

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

// Picker enforces min/max at selection time; this listener refreshes return slots on date change.
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
  const addAddressBtn = event.target.closest("[data-returning-add-address]");
  if (addAddressBtn) {
    await addNewReturningAddress();
    return;
  }

  const addVehicleBtn = event.target.closest("[data-returning-add-vehicle]");
  if (addVehicleBtn) {
    await addNewReturningVehicle();
    return;
  }

  const addressBtn = event.target.closest("[data-returning-address-index]");
  if (addressBtn) {
    applyReturningAddress(Number(addressBtn.dataset.returningAddressIndex));
    return;
  }

  const vehicleBtn = event.target.closest("[data-returning-vehicle-index]");
  if (vehicleBtn) {
    await applyReturningVehicle(Number(vehicleBtn.dataset.returningVehicleIndex));
    return;
  }

  const editAddressBtn = event.target.closest("[data-returning-edit-address]");
  if (editAddressBtn) {
    await editReturningAddress(Number(editAddressBtn.dataset.returningEditAddress));
    return;
  }

  const editVehicleBtn = event.target.closest("[data-returning-edit-vehicle]");
  if (editVehicleBtn) {
    await editReturningVehicle(Number(editVehicleBtn.dataset.returningEditVehicle));
    return;
  }

  const deleteAddressBtn = event.target.closest("[data-returning-delete-address]");
  if (deleteAddressBtn) {
    await deleteReturningAddress(Number(deleteAddressBtn.dataset.returningDeleteAddress), deleteAddressBtn);
    return;
  }

  const deleteVehicleBtn = event.target.closest("[data-returning-delete-vehicle]");
  if (deleteVehicleBtn) {
    await deleteReturningVehicle(Number(deleteVehicleBtn.dataset.returningDeleteVehicle), deleteVehicleBtn);
    return;
  }

  const button = event.target.closest("[data-returning-index]");
  if (!button) return;
  applyReturningCustomer(Number(button.dataset.returningIndex), button.dataset.returningMode || "same-car");
});

async function applyStandaloneReturningPrefill() {
  let prefill = null;
  try {
    prefill = JSON.parse(localStorage.getItem("shiftfuel_returning_prefill") || "null");
  } catch {
    prefill = null;
  }
  if (!prefill || (!prefill.address && !prefill.vehicle && !prefill.contact)) return;

  localStorage.removeItem("shiftfuel_returning_prefill");
  const address = prefill.address || {};
  const vehicle = prefill.vehicle || {};
  const contact = prefill.contact || {};

  if (form.elements.name) form.elements.name.value = address.customer_name || vehicle.customer_name || form.elements.name.value || "";
  if (form.elements.phone) form.elements.phone.value = formatPhone(address.customer_phone || vehicle.customer_phone || contact.phone || form.elements.phone.value || "");
  if (form.elements.email) form.elements.email.value = (address.customer_email || vehicle.customer_email || contact.email || form.elements.email.value || "").toLowerCase();

  if (prefill.address) {
    currentlyAppliedSavedAddressId = address.id || null;
    isApplyingSavedAddress = true;
    try {
      if (addressStreet) addressStreet.value = address.address_street || address.street || address.hospital || "";
      if (addressApt) addressApt.value = address.address_apt || address.apt || "";
      if (addressCity) addressCity.value = address.address_city || address.city || "";
      if (addressState) addressState.value = address.address_state || address.state || "DE";
      if (addressZip) addressZip.value = address.address_zip || address.zip || "";
      form.elements.parkingLocation.value = "";
      form.elements.parkingMapUrl.value = "";
      form.elements.keyHandoffDetails.value = "";
    } finally {
      isApplyingSavedAddress = false;
    }
    isReturningCustomer = true;
    addressValidated = true;
    setPostAddressSections(true);
    setAddressStatus("success", "Saved address selected. Confirm parking and key handoff before continuing.");
  }

  if (prefill.vehicle) {
    currentlyAppliedSavedVehicleId = vehicle.id || vehicle.saved_vehicle_id || null;
    form.elements.color.value = vehicle.vehicle_color || vehicle.color || "";
    form.elements.license.value = vehicle.license_plate || vehicle.plate || "";
    await setVehicleFromPrevious({
      vehicle_year: vehicle.vehicle_year || vehicle.year,
      vehicle_make: vehicle.vehicle_make || vehicle.make,
      vehicle_model: vehicle.vehicle_model || vehicle.model,
    });
    isReturningCustomer = true;
  }

  updateServiceControls();
  updateEstimate();
  if (returningCustomerStatus) {
    returningCustomerStatus.textContent = "Returning customer details were prefilled. Confirm service, date, return time, parking, key handoff, and payment authorization.";
  }
}

applyStandaloneReturningPrefill();

function renderFuelPricingSummary() {
  const container = document.querySelector('#fuel-pricing-summary');
  if (!container) return;
  const rows = Object.entries(averageFuelPrices)
    .map(([type, price]) => `<div class="fuel-price-row"><span>${type}</span><span>${formatPricePerGallon(price)}</span></div>`)
    .join('');
  const updatedText = fuelPriceLastUpdated
    ? fuelPriceLastUpdated.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;
  container.innerHTML = `
    <p class="fuel-pricing-label">Estimated fuel price — ${fuelPriceArea}</p>
    <div class="fuel-price-list">${rows}</div>
    ${updatedText ? `<p class="fuel-pricing-updated">Last updated ${updatedText}</p>` : ''}
    <p class="fuel-pricing-note">Estimated fuel price based on local area averages. Actual pump price may vary.</p>
  `;
}
renderFuelPricingSummary();
loadFuelPricesFromDb();

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const dateErrorEl = document.querySelector('#service-date-error');
  if (!serviceDate.value || serviceDate.value < todayValue || serviceDate.value > maxServiceDateValue) {
    if (dateErrorEl) { dateErrorEl.textContent = 'Please select a valid service date.'; dateErrorEl.hidden = false; }
    document.getElementById('service-date-picker')?.querySelector('.sfp-trigger')?.focus();
    return;
  }
  if (dateErrorEl) dateErrorEl.hidden = true;

  if (bookedReturnSlots.has(returnTime.value)) {
    returnTime.setCustomValidity("That time slot was already booked. Choose another available time.");
    returnTime.reportValidity();
    await refreshBookedReturnSlots();
    return;
  }

  returnTime.setCustomValidity("");

  if (!addressValidated) {
    setAddressStatus('error', 'Please validate your service address before continuing.');
    addressStreet?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  // Re-verify on submit — no bypass allowed
  statusMessage.textContent = "Verifying service address…";
  if (currentlyAppliedSavedAddressId) {
    setAddressStatus('success', 'Saved address selected. Confirm parking and key handoff before continuing.');
    statusMessage.textContent = '';
  } else {
  const areaResult = await validateServiceArea({
    street: addressStreet?.value?.trim() || '',
    apt: addressApt?.value?.trim() || '',
    city: addressCity?.value?.trim() || '',
    state: addressState?.value?.trim() || '',
    zip: addressZip?.value?.trim() || '',
  });
  if (!areaResult.valid) {
    statusMessage.textContent = "";
    addressValidated = false;
    setAddressStatus('error', areaResult.message);
    setPostAddressSections(false);
    return;
  }
  setAddressStatus('success', 'Address verified.');
  statusMessage.textContent = '';
  }

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

// Returns true on success, false on failure. Never throws — the caller (the
// payment modal flow) needs a clean success/failure signal so it knows
// whether it's safe to close the modal, without losing the customer-safe
// error message that used to only live in the catch block here.
async function saveBooking(payload) {
  const supabase = window.ShiftFuelSupabase;
  statusMessage.textContent = "Saving booking…";

  try {
    const { data, error } = await insertServiceRequest(supabase, payload);
    if (error) throw error;

    statusItems.forEach((item, index) => {
      item.classList.toggle("active", index === 0);
    });

    statusMessage.textContent = "Your booking has been confirmed.";


    setAddressStatus('', '');
    addressValidated = false;
    isReturningCustomer = false;
    setPostAddressSections(false);

    form.reset();
    returningCustomerMatches = [];
    returningCustomerSavedOptions = { addresses: [], vehicles: [], recentRequests: [] };
    currentlyAppliedSavedAddressId = null;
    currentlyAppliedSavedVehicleId = null;
    currentlyAppliedRequestId = null;
    if (returningCustomerSearch) returningCustomerSearch.value = "";
    if (returningCustomerEmail) returningCustomerEmail.value = "";
    if (returningCustomerStatus) returningCustomerStatus.textContent = "";
    if (returningCustomerResults) {
      returningCustomerResults.hidden = true;
      returningCustomerResults.innerHTML = "";
    }
    serviceDatePicker?.setValue(todayValue);
    resetModels();
    updateServiceControls();
    await refreshBookedReturnSlots();
    return true;
  } catch (err) {
    console.error("Booking save error:", err);
    // err.message is already a customer-safe string set by insertServiceRequest —
    // raw Supabase/RLS error details are logged above, never shown here.
    statusMessage.textContent = err?.message || "We could not finish saving your booking after payment authorization. Please contact ShiftFuel.";
    return false;
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

  // If a previous attempt already authorized the card but the save step
  // failed, retry only the save — never re-run Stripe confirmation, which
  // would create a second authorization hold on the same card.
  if (payload.payment._authorized && payload.payment.paymentIntentId) {
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Saving booking…'; }
    const saved = await saveBooking(payload);
    if (saved) {
      closePaymentModal();
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Authorize payment'; }
    } else {
      if (cardErrors) cardErrors.textContent = 'We could not finish saving your booking after payment authorization. Please contact ShiftFuel.';
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Try saving again'; }
    }
    return;
  }

  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Authorizing…'; }

  const estimatedCents = Math.max(Math.round((payload.payment.estimatedAmount || 0) * 100), 50);

  let clientSecret;
  try {
    const piRes = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create_intent', amount_cents: estimatedCents }),
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

  // Authorization succeeded (including any 3D Secure challenge Stripe.js
  // handled). Mark it so a retry never re-authorizes — and keep the modal
  // open/button disabled until we know the booking actually saved.
  payload.payment.paymentIntentId = paymentIntent.id;
  payload.payment._authorized = true;

  if (submitBtn) { submitBtn.textContent = 'Saving booking…'; }
  const saved = await saveBooking(payload);

  if (saved) {
    closePaymentModal();
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Authorize payment'; }
  } else {
    // Card is already authorized — do not let the customer re-click into a
    // second authorization. Only offer to retry the save itself.
    if (cardErrors) cardErrors.textContent = 'We could not finish saving your booking after payment authorization. Please contact ShiftFuel.';
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Try saving again'; }
  }
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
