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
const statusItems = Array.from(document.querySelectorAll("#status-list li"));
const washPricingToggle = document.querySelector("#wash-pricing-toggle");
const washPricingDetails = document.querySelector("#wash-pricing-details");
const addInspectionFromPricing = document.querySelector("#add-inspection-from-pricing");

year.textContent = new Date().getFullYear();

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
    returnTime.append(createOption(slot, formatTimeLabel(slot)));
  });

  if (slots.includes(currentValue)) {
    returnTime.value = currentValue;
  }
}

function updateServiceAvailability() {
  const serviceType = selectedServiceType();

  if (!serviceType.needsWash) {
    populateReturnTimes(timeSlots(7, 22), "Select return time");
    returnTime.setCustomValidity("");
    timeHelp.textContent = "Choose the time you want your vehicle returned.";
    return;
  }

  populateReturnTimes(timeSlots(9, 18), "Select car wash return time");
  returnTime.setCustomValidity("");
  timeHelp.textContent = "Car wash service selected. Return times are limited to 9:00 AM through 6:00 PM.";
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
    details.push("$15 fuel convenience fee added.");
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
      hospital: data.get("hospital"),
      parkingLocation: data.get("parkingLocation"),
      parkingSpot: data.get("parkingSpot"),
      parkingMapUrl: data.get("parkingMapUrl"),
      keyHandoffMethod: data.get("keyMethod"),
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
      stripePaymentId: null,
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

function addScheduleToNotes(row, payload) {
  const scheduleNote = `Service date: ${payload.request.serviceDate || "Not set"}; desired return time: ${payload.request.desiredReturnTime || "Not set"}`;
  if (String(row.notes || "").includes(scheduleNote)) {
    return;
  }

  row.notes = row.notes ? `${row.notes}\n${scheduleNote}` : scheduleNote;
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
    parking_location: payload.request.parkingLocation,
    parking_spot: payload.request.parkingSpot,
    key_handoff_method: payload.request.keyHandoffMethod,
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
fuelType.addEventListener("change", updateEstimate);
fuelEstimate.addEventListener("change", updateEstimate);
vehicleYear.addEventListener("change", loadModelsForSelection);
vehicleMake.addEventListener("change", loadModelsForSelection);

washPricingToggle.addEventListener("click", () => {
  const shouldShow = washPricingDetails.hidden;
  washPricingDetails.hidden = !shouldShow;
  washPricingToggle.setAttribute("aria-expanded", String(shouldShow));
  washPricingToggle.textContent = shouldShow ? "Hide details" : "Details";
});

addInspectionFromPricing.addEventListener("click", () => {
  quickInspection.checked = true;
  updateServiceDetails();
  updateEstimate();
  quickInspection.scrollIntoView({ behavior: "smooth", block: "center" });
  quickInspection.focus({ preventScroll: true });
});

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

  statusMessage.textContent = "Saving booking to Supabase...";

  const payload = getBookingPayload();
  const supabase = window.ShiftFuelSupabase;

  try {
    const { data, error } = await insertServiceRequest(supabase, payload);

    if (error) throw error;

    statusItems.forEach((item, index) => {
      item.classList.toggle("active", index === 0);
    });

    statusMessage.textContent = "Booking saved to Supabase!";
    console.log("Saved request:", data);

    form.reset();
    serviceDate.min = todayValue;
    serviceDate.max = maxServiceDateValue;
    serviceDate.value = todayValue;
    resetModels();
    updateServiceControls();
  } catch (error) {
    console.error("Supabase save error:", error);
    statusMessage.textContent = "Supabase error. Check Console for details.";
  }
});

updateServiceControls();
