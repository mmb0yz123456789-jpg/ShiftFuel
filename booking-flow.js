// ============================================================
// merged from returning-supabase-rpc-patch.js
// (must run before booking-flow body so rpc() supports .catch())
// ============================================================
// returning.html loads this before booking-flow.js.
// Supabase rpc() returns a thenable query object, but booking-flow.js uses .catch()
// for one optional returning-customer lookup. Wrap rpc() so it behaves like a real Promise.
(function () {
  const db = window.ShiftFuelSupabase;
  if (!db || typeof db.rpc !== "function" || db.__shiftfuelRpcPromisePatched) return;

  const originalRpc = db.rpc.bind(db);
  db.rpc = function patchedRpc(...args) {
    return Promise.resolve(originalRpc(...args));
  };
  db.__shiftfuelRpcPromisePatched = true;
})();

// ============================================================
// booking-flow.js (base)
// ============================================================
const flowRoot = document.querySelector("[data-booking-flow]");
const navToggle = document.querySelector("[data-nav-toggle]");
const nav = document.querySelector("[data-nav]");
const year = document.querySelector("#year");
const STRIPE_PUBLISHABLE_KEY = window.SHIFTFUEL_CONFIG?.stripePublishableKey || window.SHIFTFUEL_STRIPE_PUBLISHABLE_KEY || "";
if (!STRIPE_PUBLISHABLE_KEY) console.error("ShiftFuel Stripe publishable config is missing. Set STRIPE_PUBLISHABLE_KEY for the current Vercel environment.");
const stripe = window.Stripe && STRIPE_PUBLISHABLE_KEY ? window.Stripe(STRIPE_PUBLISHABLE_KEY) : null;
const stripeElements = stripe ? stripe.elements() : null;
const cardElement = stripeElements ? stripeElements.create("card", {
  style: {
    base: {
      fontSize: "16px",
      color: "#1a1a1a",
      fontFamily: "system-ui, sans-serif",
      "::placeholder": { color: "#9ca3af" },
    },
    invalid: { color: "#b42318" },
  },
}) : null;

// Consolidated booking-flow session/UI state (scattered top-level `let`s;
// separate from the main `bookingState`). Each field is still freely reassigned
// as flowState.X. Pricing constants (PRICE_PER_GALLON, *_SERVICE_FEE, BUNDLE_*,
// WASH_PACKAGES) stay as named module constants.
const flowState = {
  cardMounted: false,
  summaryMobileOpen: false,
  lastAddressSuggestions: [],
  addressSuggestTimer: null,
  addressSuggestSeq: 0,
  addressPickInProgress: false,
  carWashFacilityCoords: null,
  washEstimate: { fetchedFor: "", oneWayMiles: 0 },
};

if (year) year.textContent = new Date().getFullYear();

navToggle?.addEventListener("click", () => {
  const isOpen = navToggle.getAttribute("aria-expanded") === "true";
  navToggle.setAttribute("aria-expanded", String(!isOpen));
  nav?.classList.toggle("is-open", !isOpen);
});

const sharedSteps = ["Vehicle", "Service", "Service Details", "Schedule", "Handoff", "Payment", "Review"];
const flows = {
  "book-now": ["Customer", "Address", ...sharedSteps],
  returning: ["Verify", "Service Address", ...sharedSteps],
};

const bookingState = {
  values: {},
  // Car-wash distance charge (fixed wash facility). Server-authoritative: fetched
  // via the wash_distance_quote API into here, echoed in the quote so it matches
  // what the booking re-price charges. 0 for fuel-only / short wash detours.
  washSurcharge: 0,
  address: {
    validated: false,
    status: "warning",
    message: "Start typing your street address and pick it from the list to verify your service area.",
  },
  returning: {
    verified: false,
    status: "",
    statusType: "",
    requests: [],
    addresses: [],
    vehicles: [],
    selectedAddressId: null,
    selectedVehicleId: null,
    addressMode: "",
    vehicleMode: "",
    stagedAddress: null,
    stagedVehicle: null,
    addressValidated: false,
    addressStatusType: "warning",
    addressStatus: "",
  },
  payment: {
    authorized: false,
    paymentIntentId: "",
    clientSecret: "",
    authorizedAmountCents: 0,
    status: "",
    statusType: "",
    // Advance bookings save the card now instead of holding funds (see
    // NEAR_TERM_DAYS). The cron places the real hold ~2 days before service.
    cardSaved: false,
    setupIntentId: "",
    stripeCustomerId: "",
  },
  // "Customer choice" gas station. Closest station is the free default; the
  // surcharge for a farther one ($0.75/extra round-trip mile) is computed by the
  // server and echoed here so the quote matches what's charged.
  station: {
    options: [],
    fetchedFor: "",
    selectedId: "",
    name: "",
    address: "",
    lat: "",
    lon: "",
    surcharge: 0,
    extraMiles: 0,
    oneWayMiles: 0,
    perMileRate: 0.75,
  },
  promo: { code: "", discount_type: "", discount_value: 0, applies_to: "" },
  pendingPromoCode: "",
  submitted: false,
  submitting: false,
  submittedRequestNumber: "",
  bookedSlots: new Set(),
  availabilitySlots: null,
};

const stepCopy = {
  Customer: {
    title: "Customer Info",
    intro: "Tell us who is booking the service.",
    fields: `
      <div class="customer-account-prompt">
        <div>
          <strong>Returning customer?</strong>
          <span>Sign in to autofill saved vehicles, saved service addresses, and recent booking details. New customers can continue below as guests.</span>
          <small>No account required to book.</small>
        </div>
        <a class="button secondary" href="/account">Sign In / Open My Account</a>
      </div>
      <div class="booking-field-grid">
        <label><span>First name <span class="required-mark">Required</span></span><input data-required name="firstName" type="text" autocomplete="given-name" placeholder="First name"></label>
        <label><span>Last name <span class="required-mark">Required</span></span><input data-required name="lastName" type="text" autocomplete="family-name" placeholder="Last name"></label>
        <label><span>Phone number <span class="required-mark">Required</span></span><input data-required data-phone name="customerPhone" type="tel" autocomplete="tel" placeholder="Phone number"></label>
        <label><span>Email address <span class="required-mark">Required</span></span><input data-required data-email name="customerEmail" type="email" autocomplete="email" placeholder="you@example.com"></label>
      </div>
    `,
  },
  Address: {
    title: "Service Address",
    intro: "Add the workplace or approved service location where the vehicle will be serviced.",
    fields: `
      <div data-booknow-saved-addresses></div>
      <div class="booking-field-grid">
        <label class="span-2"><span>Street address <span class="required-mark">Required</span></span><span class="address-autocomplete"><input data-required data-address-field data-address-autocomplete name="street" type="text" autocomplete="off" placeholder="Start typing your address…"><ul class="address-suggest" data-address-suggest hidden></ul></span></label>
        <label><span>Unit/suite/apartment</span><input data-address-field name="unit" type="text" autocomplete="address-line2" placeholder="Optional"></label>
        <label><span>City <span class="required-mark">Required</span></span><input data-required data-address-field name="city" type="text" autocomplete="address-level2" placeholder="Wilmington"></label>
        <label><span>State <span class="required-mark">Required</span></span><input data-required data-address-field name="state" type="text" autocomplete="address-level1" placeholder="DE" value="DE"></label>
        <label><span>ZIP code <span class="required-mark">Required</span></span><input data-required data-address-field name="zip" type="text" autocomplete="postal-code" inputmode="numeric" placeholder="19804"></label>
      </div>
      <div class="address-validation-panel">
        <p class="booking-validation-message" data-address-status data-status="warning">Start typing your street address and pick it from the list to verify your service area.</p>
      </div>
    `,
  },
  Verify: {
    title: "Verify this is you",
    intro: "Enter your phone number, email, ticket number, or any combination of these so we can find your previous booking information.",
    fields: `
      <div class="booking-field-grid">
        <label><span>Phone number</span><input name="verifyPhone" type="tel" placeholder="Phone number" data-any-required="verify" data-phone></label>
        <label><span>Email address</span><input name="verifyEmail" type="email" placeholder="you@example.com" data-any-required="verify" data-email-optional></label>
        <label><span>Ticket/request number</span><input name="verifyTicket" type="text" placeholder="Request number" data-any-required="verify"></label>
      </div>
      <div class="address-validation-panel">
        <button class="button secondary" type="button" data-verify-returning>Verify customer</button>
        <p class="booking-validation-message" data-returning-status></p>
      </div>
    `,
  },
  "Service Address": {
    title: "Pick your validated service address",
    intro: "Reuse a saved validated service address or add a new address. New and edited addresses must be validated before continuing.",
    fields: `<div data-returning-service-area></div>`,
  },
  Vehicle: {
    title: "Vehicle Details",
    intro: "Enter the vehicle details for this booking.",
    fields: `
      <div data-booknow-saved-vehicles></div>
      <div class="booking-field-grid">
        <label><span>Year <span class="required-mark">Required</span></span><select data-required name="vehicleYear"><option value="">Select year</option></select></label>
        <label><span>Make <span class="required-mark">Required</span></span><select data-required name="vehicleMake"><option value="">Select make</option></select></label>
        <label><span>Model <span class="required-mark">Required</span></span><select data-required name="vehicleModel"><option value="">Select year and make first</option></select></label>
        <label><span>Color <span class="required-mark">Required</span></span><input data-required name="vehicleColor" type="text" placeholder="Blue"></label>
        <label><span>License plate <span class="required-mark">Required</span></span><input data-required name="licensePlate" type="text" placeholder="123456"></label>
      </div>
    `,
  },
  "Returning Vehicle": {
    title: "Pick your vehicle",
    intro: "Choose a saved vehicle, add a new vehicle, or delete a saved vehicle from future options.",
    fields: `<div data-returning-vehicles></div>`,
  },
  Service: {
    title: "Service Selection",
    intro: "Select the service and optional add-on for this request.",
    fields: `
      <div class="choice-grid">
        <label class="choice-card"><input data-required type="radio" name="serviceType" value="fuel"><span><strong>Fuel Fill-Up</strong><small>Fuel service only.</small></span></label>
        <label class="choice-card"><input data-required type="radio" name="serviceType" value="wash"><span><strong>Car Wash</strong><small>Car wash service only.</small></span></label>
        <label class="choice-card"><input data-required type="radio" name="serviceType" value="fuel_wash"><span><strong>Fuel + Car Wash <span class="bundle-save-badge" data-bundle-badge hidden></span></strong><small>Bundle both services.</small></span></label>
      </div>
      <label class="choice-card booking-addon-card">
        <input type="checkbox" name="quickCare" value="quick-care">
        <span>
          <strong>Vehicle Add-Ons</strong>
          <small>Optional add-on</small>
          <details>
            <summary>What is included?</summary>
            <ul class="pricing-includes">
              <li>Tire pressure top-off</li>
              <li>Washer fluid refill</li>
              <li>Quick exterior look-over</li>
            </ul>
            <p class="pricing-warning">Convenience add-ons only. No repairs, diagnostics, mechanical inspection, towing, or emergency service.</p>
          </details>
        </span>
      </label>
    `,
  },
  "Service Details": {
    title: "Service Details",
    intro: "Add the details needed for the selected service.",
    fields: `<div data-service-details></div>`,
  },
  Schedule: {
    title: "Schedule",
    intro: "Pick the service date and desired return time.",
    fields: `
      <div class="booking-field-grid">
        <label><span>Service date <span class="required-mark">Required</span></span><span class="sfp-field-host" data-date-host><input type="hidden" data-required name="serviceDate"></span></label>
        <label><span>Earliest Pickup Time <span class="optional-mark">Optional</span></span><select name="pickupTime" data-pickup-time>
          <option value="">Flexible — no preference</option>
        </select></label>
        <label><span>Desired return time <span class="required-mark">Required</span></span><select data-required name="returnTime" data-return-time>
          <option value="">Select return time</option>
        </select></label>
      </div>
      <p class="field-help">Return times are shown in 30-minute increments. Unavailable and fully booked times are not selectable.</p>
      <p class="field-help">Pickup time is the earliest your keys/vehicle are available. Leave it blank if you're flexible — a wider gap before your return time gives us more ways to fit your service in.</p>
    `,
  },
  Handoff: {
    title: "Parking and Key Handoff",
    intro: "Tell the worker where the vehicle is parked and how keys will be handled for this request.",
    fields: `
      <div class="booking-field-grid">
        <label class="span-2"><span>Parking location <span class="required-mark">Required</span></span><textarea data-required name="parking" rows="4" placeholder="Example: Main lot, row C, space 12"></textarea></label>
        <label class="span-2"><span>Key handoff details <span class="required-mark">Required</span></span><textarea data-required name="handoff" rows="4" placeholder="Example: front desk, security desk, main entrance, or meet at vehicle"></textarea></label>
        <label class="span-2"><span>Special instructions</span><textarea name="specialInstructions" rows="3" placeholder="Optional"></textarea></label>
      </div>
    `,
  },
  Payment: {
    title: "Payment Authorization",
    intro: "Authorize your payment method now. You are not charged until service is complete.",
    fields: `
      <div class="payment-placeholder" data-payment-summary></div>
      <p class="payment-notice">Your card is authorized now. You are not charged until service is complete, unless you cancel after the worker has received your keys or service has started.</p>
      <p class="field-help">This places a temporary hold for the estimated amount. The request is not booked until you review and submit it on the next step.</p>
      <button class="button secondary" type="button" data-authorize-payment>Authorize payment</button>
      <p class="booking-validation-message" data-payment-status></p>
    `,
  },
  Review: {
    title: "Review and Submit",
    intro: "Confirm the booking details before submitting your request.",
    fields: `
      <div class="review-placeholder" data-review-summary>
        <strong>Review summary</strong>
      </div>
      <label class="booking-check"><input data-required type="checkbox" name="reviewConfirmed"><span>I confirm that the information above is accurate and authorize ShiftFuel Concierge to pick up, service, and return my vehicle using the instructions provided.</span></label>
      <div class="admin-button-row">
        <button class="button primary" type="button" data-submit-booking>Book request</button>
        <button class="button secondary" type="button" data-cancel-authorization>Cancel authorization</button>
      </div>
      <p class="booking-legal-notice">By clicking <strong>Book request</strong> you agree to our <a href="terms.html" target="_blank">Terms of Service</a>, <a href="privacy.html" target="_blank">Privacy Policy</a>, and <a href="liability-waiver.html" target="_blank">Liability Waiver</a>.</p>
      <p class="booking-validation-message" data-submit-status></p>
    `,
  },
};

function scrollBookingFlowStart(options = {}) {
  const target = document.querySelector("#booking-flow");
  if (!target) return;
  const header = document.querySelector(".site-header");
  const headerHeight = header ? header.getBoundingClientRect().height : 0;
  const top = target.getBoundingClientRect().top + window.scrollY - headerHeight - 18;
  window.scrollTo({
    top: Math.max(top, 0),
    behavior: options.behavior || "smooth",
  });
}

function scrollBookingFlowStartAfterRender() {
  if (window.location.hash !== "#booking-flow") return;
  window.setTimeout(() => scrollBookingFlowStart({ behavior: "auto" }), 0);
  window.setTimeout(() => scrollBookingFlowStart({ behavior: "auto" }), 120);
}

function bindBookingFlowAnchorScroll() {
  if (!document.body?.classList.contains("booking-page")) return;
  if (document.documentElement.dataset.bookingFlowAnchorBound === "true") return;
  document.documentElement.dataset.bookingFlowAnchorBound = "true";

  document.addEventListener("click", (event) => {
    const link = event.target.closest('a[href$="#booking-flow"], a[href="#booking-flow"]');
    if (!link) return;
    let targetUrl;
    try {
      targetUrl = new URL(link.getAttribute("href"), window.location.href);
    } catch (_) {
      return;
    }
    if (targetUrl.pathname !== window.location.pathname || targetUrl.hash !== "#booking-flow") return;

    event.preventDefault();
    history.replaceState(null, "", "#booking-flow");
    navToggle?.setAttribute("aria-expanded", "false");
    nav?.classList.remove("is-open");
    scrollBookingFlowStart();
  });

  window.addEventListener("hashchange", () => {
    if (window.location.hash === "#booking-flow") scrollBookingFlowStart();
  });
}

function normalizePhone(value) {
  return window.ShiftFuelPhone?.digits(value) || String(value || "").replace(/\D/g, "").slice(0, 10);
}

function formatPhone(value) {
  return window.ShiftFuelPhone?.format(value) || value || "";
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

let PRICE_PER_GALLON = 3.799;
let FUEL_SERVICE_FEE = 15;
let CAR_WASH_SERVICE_FEE = 15;
let QUICK_CARE_FEE = 5;
// Fuel + Wash bundle, per leg. When a customer books both, they pay the bundled
// fuel fee + bundled wash fee instead of the two full service fees. 0/0 = bundle
// off. Worker shares for the bundle live worker-side (worker.js). See
// calculateTotals + the "Save X%" badge.
let BUNDLE_FUEL_FEE = 0;
let BUNDLE_WASH_FEE = 0;
// Time-comp rates (from public_get_service_pricing). timeRatePerMin defaults to 0
// so the customer fee is unchanged until the admin sets it — safe to deploy first.
const TIME_COMP_RATES = {
  timeRatePerMin: 0,
  fuelBaseMin: 3,
  fuelPerGallonMin: 0.5,
  washMin: 20,
  washDetourFreeMiles: 5,
  washDetourRate: 0.725,
};
let WASH_PACKAGES = [
  {
    value: "buff-shine", label: "Buff & Shine", price: 27,
    includes: ["Fire Bath", "Super Hard Shell Ceramic Finish", "Buff N' Shine", "ICE® Instant Shine", "Salt Shield", "Tire Shine", "Triple Wheel Cleaning", "Tri-Foam Conditioner", "Blazin' Glaze Clear Coat", "High pH Presoak", "Low pH Presoak", "Double Tire & Wheel Cleaning", "Drying Agent", "Spot Free Rinse"],
  },
  {
    value: "shine-protect", label: "Shine & Protect", price: 20,
    includes: ["ICE® Instant Shine", "Salt Shield", "Tire Shine", "Triple Wheel Cleaning", "Tri-Foam Conditioner", "Blazin' Glaze Clear Coat", "High pH Presoak", "Low pH Presoak", "Double Tire & Wheel Cleaning", "Drying Agent", "Spot Free Rinse"],
  },
  {
    value: "shine", label: "Shine", price: 16,
    includes: ["Tri-Foam Conditioner", "Blazin' Glaze Clear Coat", "High pH Presoak", "Low pH Presoak", "Double Tire & Wheel Cleaning", "Drying Agent", "Spot Free Rinse"],
  },
  {
    value: "double-wash", label: "Double Wash", price: 12,
    includes: ["High pH Presoak", "Low pH Presoak", "Double Tire & Wheel Cleaning", "Drying Agent", "Spot Free Rinse"],
  },
];
const WASH_PACKAGE_INCLUDES = {
  "buff-shine": WASH_PACKAGES[0].includes,
  "shine-protect": WASH_PACKAGES[1].includes,
  shine: WASH_PACKAGES[2].includes,
  "double-wash": WASH_PACKAGES[3].includes,
};

async function loadLivePricing() {
  if (!window.ShiftFuelSupabase) return;
  try {
    const [fuelResult, serviceResult] = await Promise.all([
      window.ShiftFuelSupabase.rpc("public_get_fuel_prices"),
      window.ShiftFuelSupabase.rpc("public_get_service_pricing"),
    ]);

    const fuelData = fuelResult?.data;
    if (!fuelResult?.error && fuelData && fuelData.regular_price != null) {
      PRICE_PER_GALLON = Number(fuelData.regular_price);
    }

    const serviceData = serviceResult?.data;
    if (!serviceResult?.error && serviceData) {
      FUEL_SERVICE_FEE = Number(serviceData.fuel_service_fee);
      CAR_WASH_SERVICE_FEE = Number(serviceData.wash_service_fee);
      QUICK_CARE_FEE = Number(serviceData.quick_inspection_fee);
      BUNDLE_FUEL_FEE = Number(serviceData.bundle_fuel_service_fee) || 0;
      BUNDLE_WASH_FEE = Number(serviceData.bundle_wash_service_fee) || 0;
      // Time-comp rates. timeRatePerMin stays 0 (off) unless the column exists + is set.
      TIME_COMP_RATES.timeRatePerMin = Number(serviceData.time_rate_per_min) || 0;
      if (serviceData.fuel_time_base_min != null) TIME_COMP_RATES.fuelBaseMin = Number(serviceData.fuel_time_base_min);
      if (serviceData.fuel_time_per_gallon_min != null) TIME_COMP_RATES.fuelPerGallonMin = Number(serviceData.fuel_time_per_gallon_min);
      if (serviceData.wash_time_min != null) TIME_COMP_RATES.washMin = Number(serviceData.wash_time_min);
      if (serviceData.wash_detour_free_miles != null) TIME_COMP_RATES.washDetourFreeMiles = Number(serviceData.wash_detour_free_miles);
      if (serviceData.wash_detour_rate != null) TIME_COMP_RATES.washDetourRate = Number(serviceData.wash_detour_rate);
      WASH_PACKAGES = [
        { value: "buff-shine", label: "Buff & Shine", price: Number(serviceData.wash_buff_shine_price), includes: WASH_PACKAGE_INCLUDES["buff-shine"] },
        { value: "shine-protect", label: "Shine & Protect", price: Number(serviceData.wash_shine_protect_price), includes: WASH_PACKAGE_INCLUDES["shine-protect"] },
        { value: "shine", label: "Shine", price: Number(serviceData.wash_shine_price), includes: WASH_PACKAGE_INCLUDES.shine },
        { value: "double-wash", label: "Double Wash", price: Number(serviceData.wash_double_wash_price), includes: WASH_PACKAGE_INCLUDES["double-wash"] },
      ];
    }
  } catch (err) {
    console.error("Could not load live pricing, using defaults:", err);
  }
  // Pricing may arrive after the flow first rendered — refresh the bundle badge.
  updateBundleBadges();
}

const livePricingReady = loadLivePricing();
const VEHICLE_POPULAR_MAKES = ["Chevrolet", "Ford", "Honda", "Hyundai", "Jeep", "Kia", "Nissan", "Subaru", "Tesla", "Toyota"];
const VEHICLE_OTHER_MAKES = ["Acura", "Alfa Romeo", "Audi", "BMW", "Buick", "Cadillac", "Chrysler", "Dodge", "Fiat", "Genesis", "GMC", "Infiniti", "Jaguar", "Land Rover", "Lexus", "Lincoln", "Mazda", "Mercedes-Benz", "Mini", "Mitsubishi", "Porsche", "Ram", "Volkswagen", "Volvo"];
const VEHICLE_FALLBACK_MODELS = {
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
const FUEL_SELECTED_GALLONS = {
  "0-5": 5,
  "5-10": 10,
  "10-15": 15,
  "15-20": 20,
  "20-25": 25,
  "25+": 40,
};
const FUEL_AUTHORIZATION_GALLONS = {
  "0-5": 10,
  "5-10": 15,
  "10-15": 20,
  "15-20": 30,
  "20-25": 30,
  "25+": 40,
};

// Up-front, dynamic explanation of the card hold the moment a fuel range is picked.
// The hold covers a gallon buffer (you might pump a little more than the range), so
// the authorized amount is higher than expected — make that clear here, not at checkout.
function updateFuelBufferNote(panel) {
  const note = panel?.querySelector('[data-fuel-buffer-note]');
  if (!note) return;
  const pref = bookingState.values.fuelPreference;
  const authGal = FUEL_AUTHORIZATION_GALLONS[pref];
  if (!serviceNeedsFuel() || !pref || !authGal) {
    note.hidden = true;
    note.textContent = '';
    return;
  }
  note.hidden = false;
  note.innerHTML = `💳 <strong>Card hold:</strong> at checkout we authorize for up to <strong>${authGal} gallons</strong> — just in case your tank needs a little more fuel than the range you picked. You're only charged for the fuel actually pumped; the rest is released right after service.`;
}
const slotHoldingStatuses = new Set([
  "assigned",
  "en_route",
  "in_service",
  "returning",
]);

// Booking-status logic lives in shared-status.js (loaded before this file).
const canonicalBookingStatus = window.SF.canonicalBookingStatus;

function formatMoney(value) {
  return `$${(Number(value) || 0).toFixed(2)}`;
}

function todayValue() {
  return new Date().toISOString().slice(0, 10);
}

function maxDateValue() {
  const date = new Date();
  date.setMonth(date.getMonth() + 3);
  return date.toISOString().slice(0, 10);
}

function serviceNeedsFuel() {
  return bookingState.values.serviceType === "fuel" || bookingState.values.serviceType === "fuel_wash";
}

function serviceNeedsWash() {
  return bookingState.values.serviceType === "wash" || bookingState.values.serviceType === "fuel_wash";
}

function selectedWashPackage() {
  return WASH_PACKAGES.find((item) => item.value === bookingState.values.washPackage) || null;
}

// The dollar base a promo's % / $ is computed against, per the code's applies_to
// mode. Mirrors discountBase() in api/_promos.js so the preview matches the
// server's authoritative charge.
function promoDiscountBase(t, appliesTo) {
  const fees = (Number(t.fuelFee) || 0) + (Number(t.washFee) || 0) + (Number(t.quickFee) || 0);
  switch (appliesTo) {
    case "total":         return Number(t.total) || 0;
    case "wash_and_fees": return fees + (Number(t.washAmount) || 0);
    case "fuel_service":  return Number(t.fuelFee) || 0;
    case "wash_service":  return Number(t.washFee) || 0;
    case "inspection":    return Number(t.quickFee) || 0;
    case "service_fees":
    default:              return fees;
  }
}

function calculateTotals() {
  const selectedFuelGallons = serviceNeedsFuel() ? FUEL_SELECTED_GALLONS[bookingState.values.fuelPreference] || 0 : 0;
  const authorizationFuelGallons = serviceNeedsFuel() ? FUEL_AUTHORIZATION_GALLONS[bookingState.values.fuelPreference] || 0 : 0;
  const fuelGallons = authorizationFuelGallons;
  const fuelEstimate = authorizationFuelGallons * PRICE_PER_GALLON;
  const washPackage = serviceNeedsWash() ? selectedWashPackage() : null;
  const washAmount = washPackage ? washPackage.price : 0;
  let fuelBaseFee = serviceNeedsFuel() ? FUEL_SERVICE_FEE : 0;
  let washBaseFee = serviceNeedsWash() ? CAR_WASH_SERVICE_FEE : 0;
  const quickFee = bookingState.values.quickCare ? QUICK_CARE_FEE : 0;
  // Fuel + Wash bundle: when both services are booked and the bundled fuel + wash
  // fees beat paying the two full fees, the customer pays the bundled fees instead.
  // Each leg keeps its own fee so the worker's per-leg bundle share applies cleanly.
  // MUST mirror api/payments.js calculateBookingAuthorization.
  const bundleFullFee = fuelBaseFee + washBaseFee;
  const bundleSum = BUNDLE_FUEL_FEE + BUNDLE_WASH_FEE;
  const bundleActive = serviceNeedsFuel() && serviceNeedsWash()
    && bundleSum > 0 && bundleSum < bundleFullFee;
  const bundleSavingsPct = bundleActive ? Math.round((1 - bundleSum / bundleFullFee) * 100) : 0;
  if (bundleActive) {
    fuelBaseFee = BUNDLE_FUEL_FEE;
    washBaseFee = BUNDLE_WASH_FEE;
  }
  // Gas-station distance surcharge only applies to fuel services with a chosen
  // (non-closest) station. The server is authoritative; this mirrors it so the
  // authorized total matches.
  const stationSurcharge = serviceNeedsFuel() ? (Number(bookingState.station.surcharge) || 0) : 0;
  // Car-wash distance charge — server-authoritative (fetched via wash_distance_quote
  // into bookingState.washSurcharge); mirrored here so the authorized total matches.
  const washSurcharge = serviceNeedsWash() ? (Number(bookingState.washSurcharge) || 0) : 0;
  // Service-time cost, baked into the SERVICE FEES (so the summary still adds up),
  // split per service. 0 until the admin sets the company time rate.
  const timeRate = TIME_COMP_RATES.timeRatePerMin || 0;
  const fuelTimeCost = Math.round((serviceNeedsFuel() ? (TIME_COMP_RATES.fuelBaseMin + TIME_COMP_RATES.fuelPerGallonMin * selectedFuelGallons) : 0) * timeRate * 100) / 100;
  const washTimeCost = Math.round((serviceNeedsWash() ? TIME_COMP_RATES.washMin : 0) * timeRate * 100) / 100;
  const timeCost = Math.round((fuelTimeCost + washTimeCost) * 100) / 100;
  const netTarget = fuelEstimate + washAmount + fuelBaseFee + washBaseFee + quickFee + stationSurcharge + washSurcharge + timeCost;
  const grossBeforeRounding = netTarget ? (netTarget + 0.30) / (1 - 0.029) : 0;
  const estimatedTotal = netTarget ? Math.ceil(grossBeforeRounding) : 0;
  const recovery = Math.round((estimatedTotal - netTarget) * 100) / 100;
  let fuelRecovery = 0;
  let washRecovery = 0;

  if (serviceNeedsFuel() && serviceNeedsWash()) {
    const recoveryCents = Math.round(recovery * 100);
    const fuelBase = fuelEstimate + fuelBaseFee;
    const washBase = washAmount + washBaseFee;
    const totalServiceBase = fuelBase + washBase;
    const fuelCents = totalServiceBase
      ? Math.round(recoveryCents * (fuelBase / totalServiceBase))
      : Math.round(recoveryCents / 2);
    fuelRecovery = fuelCents / 100;
    washRecovery = (recoveryCents - fuelCents) / 100;
  } else if (serviceNeedsFuel()) {
    fuelRecovery = recovery;
  } else if (serviceNeedsWash()) {
    washRecovery = recovery;
  }

  const fuelFee = Math.round((fuelBaseFee + fuelRecovery + fuelTimeCost) * 100) / 100;
  const washFee = Math.round((washBaseFee + washRecovery + washTimeCost) * 100) / 100;

  const serviceFees = Math.round((fuelFee + washFee + quickFee) * 100) / 100;
  const subtotal = estimatedTotal; // pre-discount gross total
  // Recompute the discount live from the code's type/value against the base it
  // targets (applies_to), so it scales/caps as the customer changes service. The
  // server re-validates + recomputes this authoritatively at booking. The discount
  // always comes out of the company's take — never the worker's pay.
  let promoDiscount = 0;
  const promo = bookingState.promo;
  if (promo && promo.code) {
    const base = promoDiscountBase({ fuelFee, washFee, quickFee, washAmount, total: subtotal }, promo.applies_to);
    if (base > 0) {
      const dv = Number(promo.discount_value) || 0;
      if (promo.discount_type === "percent") promoDiscount = base * (dv / 100);
      else if (promo.discount_type === "free_addon") promoDiscount = base;
      else promoDiscount = dv;
      promoDiscount = Math.round(Math.min(Math.max(0, promoDiscount), base) * 100) / 100;
    }
  }
  const discountedTotal = Math.max(0, Math.round((estimatedTotal - promoDiscount) * 100) / 100);

  return {
    fuelGallons,
    selectedFuelGallons,
    authorizationFuelGallons,
    fuelEstimate,
    washPackage,
    washAmount,
    fuelFee,
    washFee,
    quickFee,
    stationSurcharge,
    washSurcharge,
    timeCost,
    serviceFees,
    subtotal,
    promoDiscount,
    estimatedTotal: discountedTotal,
    fuelBaseFee,
    washBaseFee,
    recovery,
    netTarget,
    grossBeforeRounding,
    bundleActive,
    bundleSavingsPct,
    combinedServiceFee: bundleSum,
  };
}

// Paint the "Save X%" badge on the Fuel + Car Wash option whenever a combined
// bundle fee beats paying the two fees separately. Pure function of admin pricing,
// so it just reflects the loaded settings (same math as the admin preview).
function updateBundleBadges() {
  const full = (Number(FUEL_SERVICE_FEE) || 0) + (Number(CAR_WASH_SERVICE_FEE) || 0);
  const bundleSum = (Number(BUNDLE_FUEL_FEE) || 0) + (Number(BUNDLE_WASH_FEE) || 0);
  const active = full > 0 && bundleSum > 0 && bundleSum < full;
  const pct = active ? Math.round((1 - bundleSum / full) * 100) : 0;
  document.querySelectorAll("[data-bundle-badge]").forEach((el) => {
    el.textContent = pct > 0 ? `Save ${pct}%` : "";
    el.hidden = pct <= 0;
  });
}

function timeLabel(hour, minute) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const normalizedHour = hour % 12 || 12;
  return `${normalizedHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function timeValue(hour, minute) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeTimeSlot(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function isMissingRpcError(error) {
  const message = String(error?.message || "").toLowerCase();
  return ["PGRST202", "PGRST204", "42883"].includes(error?.code)
    || message.includes("could not find the function")
    || (message.includes("function") && message.includes("does not exist"));
}

// Rough minutes a job will occupy a worker, mirroring the worker app's
// time-to-complete estimate (worker.js workerEstimatedMinutes): drive to the
// site + find the car + the round-trip pump/wash drive legs + quick-care time.
// Used to size the capacity block when checking which return times can be staffed.
const EST_TO_DESTINATION_MIN = 10;
const EST_FIND_CAR_MIN = 5;
const EST_QUICK_CARE_MIN = 10;
function estimateBookingMinutes() {
  const stationRT = serviceNeedsFuel() ? (Number(bookingState.station.oneWayMiles) || 0) * 2 : 0;
  const washRT = serviceNeedsWash() ? (Number(flowState.washEstimate.oneWayMiles) || 0) * 2 : 0;
  const driveLegs = ((stationRT + washRT) / 30) * 60; // legs at ~30 mph
  const quickCare = bookingState.values.quickCare ? EST_QUICK_CARE_MIN : 0;
  return Math.round(EST_TO_DESTINATION_MIN + EST_FIND_CAR_MIN + driveLegs + quickCare);
}

function availableTimeOptions() {
  const selectedDate = bookingState.values.serviceDate || "";
  const now = new Date();
  const isToday = selectedDate === todayValue();
  const bookedSlots = bookingState.bookedSlots || new Set();
  const availabilitySlots = bookingState.availabilitySlots;
  const hasAvailabilityLookup = availabilitySlots instanceof Set;
  // Capacity is the authority when present: the server already folded in worker
  // shifts, duration, the pickup window, and existing bookings, so a slot it
  // returns is genuinely staffable and one it omits is full / too tight.
  const capacitySlots = bookingState.capacitySlots;
  const hasCapacity = capacitySlots instanceof Set;
  // Car wash bookings must be returned before the wash closes (8 AM–7 PM),
  // so the latest selectable return time is capped at 6:00 PM to leave an
  // hour of buffer for the wash and drive-back. The start of the window is
  // left to worker availability / the past-time filter.
  const washClose = serviceNeedsWash();
  const options = [];
  for (let hour = 7; hour <= 22; hour += 1) {
    for (const minute of [0, 30]) {
      if (hour === 22 && minute > 0) continue;
      const value = timeValue(hour, minute);
      const optionDate = new Date(`${selectedDate || todayValue()}T${value}:00`);
      const past = isToday && optionDate <= now;
      const afterWashCutoff = washClose && (hour > 18 || (hour === 18 && minute > 0));
      // In capacity mode the server's list already accounts for existing bookings,
      // so a missing slot means "full / can't fit" — no separate booked check.
      // Otherwise fall back to the older availability + one-per-slot booked logic.
      const booked = hasCapacity ? false : bookedSlots.has(value);
      const unavailable = afterWashCutoff
        || (hasCapacity
              ? !capacitySlots.has(value)
              : (hasAvailabilityLookup ? !availabilitySlots.has(value) : (hour < 9 || hour > 17 || (hour === 17 && minute > 0))));
      if (!unavailable || bookingState.values.returnTime === value) {
        options.push({ value, label: timeLabel(hour, minute), disabled: past || booked || unavailable });
      }
    }
  }
  return options;
}

// Earliest-pickup options: plain 30-minute slots across the service window (it's a
// soft "keys available from" bound, not a capacity-gated slot). Past times on the
// service date are omitted so customers don't see lapsed choices.
function pickupTimeOptions() {
  const selectedDate = bookingState.values.serviceDate || "";
  const isToday = selectedDate === todayValue();
  const now = new Date();
  const opts = [];
  for (let hour = 7; hour <= 22; hour += 1) {
    for (const minute of [0, 30]) {
      if (hour === 22 && minute > 0) continue;
      const value = timeValue(hour, minute);
      const past = isToday && new Date(`${selectedDate || todayValue()}T${value}:00`) <= now;
      if (!past) opts.push({ value, label: timeLabel(hour, minute), disabled: false });
    }
  }
  return opts;
}

async function loadBookedSlots() {
  bookingState.bookedSlots = new Set();
  bookingState.availabilitySlots = null;
  bookingState.capacitySlots = null;
  if (!window.ShiftFuelSupabase || !bookingState.values.serviceDate) return;
  // Size the capacity block to this job's estimate and respect the pickup window.
  const durationMinutes = estimateBookingMinutes();
  const pickupTime = bookingState.values.pickupTime ? `${bookingState.values.pickupTime}:00` : null;
  try {
    const [bookedResult, availabilityResult, capacityResult] = await Promise.all([
      window.ShiftFuelSupabase.rpc("public_booked_return_slots", {
        p_service_date: bookingState.values.serviceDate,
      }),
      window.ShiftFuelSupabase.rpc("public_worker_availability_slots", {
        p_service_date: bookingState.values.serviceDate,
        p_hospital: "",
      }),
      window.ShiftFuelSupabase.rpc("public_capacity_return_slots", {
        p_service_date: bookingState.values.serviceDate,
        p_duration_minutes: durationMinutes,
        p_pickup_time: pickupTime,
      }),
    ]);

    const { data, error } = bookedResult || {};
    if (error) throw error;
    (data || []).forEach((row) => {
      if (slotHoldingStatuses.has(canonicalBookingStatus(row.status)) && row.desired_return_time) {
        bookingState.bookedSlots.add(normalizeTimeSlot(row.desired_return_time));
      }
    });

    if (availabilityResult?.error) {
      if (!isMissingRpcError(availabilityResult.error)) {
        console.warn("Could not load worker availability slots:", availabilityResult.error);
        bookingState.availabilitySlots = new Set();
      }
    } else {
      bookingState.availabilitySlots = new Set((availabilityResult?.data || [])
        .map((row) => normalizeTimeSlot(row.slot))
        .filter(Boolean));
    }

    // Capacity gate (authoritative when present). Fail-open: if the RPC hasn't
    // been deployed yet, or errors, leave capacitySlots null so the older
    // availability/booked logic still drives the dropdown.
    if (capacityResult?.error) {
      if (!isMissingRpcError(capacityResult.error)) {
        console.warn("Could not load capacity slots:", capacityResult.error);
      }
    } else {
      bookingState.capacitySlots = new Set((capacityResult?.data || [])
        .map((row) => normalizeTimeSlot(row.slot))
        .filter(Boolean));
    }
  } catch (error) {
    console.warn("Could not load booked return slots:", error);
  }
}

function mountCardIfNeeded() {
  const container = document.querySelector("#booking-card-element");
  if (!container) return;
  // If Stripe didn't load (blocked script, offline, bad key), don't leave a
  // silent empty box — tell the customer what to do.
  if (!stripe || !cardElement) {
    const display = document.querySelector("#booking-card-errors");
    if (display) display.textContent = "Card entry could not load. Please refresh the page, disable any ad/script blockers, or try a different browser.";
    return;
  }
  if (flowState.cardMounted) return;
  cardElement.mount("#booking-card-element");
  flowState.cardMounted = true;
  cardElement.on("change", (event) => {
    const display = document.querySelector("#booking-card-errors");
    if (display) display.textContent = event.error ? event.error.message : "";
  });
  // Surface the real reason if Stripe's card iframe fails to render.
  cardElement.on("loaderror", (event) => {
    const display = document.querySelector("#booking-card-errors");
    if (display) display.textContent = event?.error?.message || "Card entry could not load. Please refresh and try again.";
  });
}

function closePaymentModal() {
  const modal = document.querySelector("#booking-payment-modal");
  if (!modal) return;
  if (cardElement && flowState.cardMounted) {
    cardElement.unmount();
    flowState.cardMounted = false;
  }
  modal.remove();
  document.body.classList.remove("payment-modal-open");
}

function openPaymentModal(panel) {
  closePaymentModal();

  const advance = serviceIsAdvanceBooking();
  const svcDate = bookingState.values.serviceDate || "your service date";
  const helpCopy = advance
    ? `Your card is saved now — no charge today. We'll authorize your estimated total about 2 days before ${svcDate}, and you're only charged once service is complete.`
    : "Your card is authorized now. You are not charged until service is complete, unless you cancel after the worker has received your keys or service has started.";
  const confirmCopy = advance ? "Save card" : "Authorize payment";

  const modal = document.createElement("div");
  modal.id = "booking-payment-modal";
  modal.className = "booking-payment-modal";
  modal.innerHTML = `
    <div class="booking-payment-backdrop" data-close-payment-modal></div>
    <div class="booking-payment-dialog" role="dialog" aria-modal="true" aria-labelledby="booking-payment-title">
      <button class="booking-payment-close" type="button" aria-label="Close payment authorization" data-close-payment-modal>&times;</button>
      <p class="eyebrow">Secure payment authorization</p>
      <h3 id="booking-payment-title">Enter card information</h3>
      <p class="field-help">${helpCopy}</p>
      <div class="payment-card-box">
        <label><span>Card information</span><div id="booking-card-element" class="booking-card-element"></div></label>
        <p id="booking-card-errors" class="booking-validation-message" data-status="error"></p>
      </div>
      <div class="admin-button-row">
        <button class="button secondary" type="button" data-close-payment-modal>Cancel</button>
        <button class="button primary" type="button" data-confirm-payment-authorization>${confirmCopy}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.body.classList.add("payment-modal-open");
  mountCardIfNeeded();
  if (cardElement?.clear) cardElement.clear();

  modal.addEventListener("click", async (event) => {
    if (event.target.closest("[data-close-payment-modal]")) {
      closePaymentModal();
      return;
    }

    const confirmButton = event.target.closest("[data-confirm-payment-authorization]");
    if (!confirmButton) return;
    await confirmPaymentAuthorization(panel, confirmButton);
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function compactKey(parts) {
  return parts.map((part) => String(part || "").toLowerCase().replace(/\s+/g, " ").trim()).join("|");
}

function isActiveRecord(record) {
  return record?.is_active !== false && !record?.deleted_at;
}

function isValidatedAddress(record) {
  return isActiveRecord(record)
    && record?.outside_service_area !== true
    && record?.is_outside_service_area !== true
    && record?.service_area_valid !== false
    && record?.is_validated !== false;
}

function inputValue(input) {
  if (input.type === "checkbox") return input.checked;
  if (input.type === "radio") return input.checked ? input.value : bookingState.values[input.name];
  return input.value;
}

function invalidatePaymentAuthorization() {
  if (!bookingState.payment.authorized && !bookingState.payment.cardSaved) return;
  bookingState.payment.authorized = false;
  // Also clear any saved-card (advance booking) state — changing details,
  // including the service date, can flip the near-term/advance tier.
  bookingState.payment.cardSaved = false;
  bookingState.payment.setupIntentId = "";
  bookingState.payment.stripeCustomerId = "";
  bookingState.payment.statusType = "warning";
  bookingState.payment.status = "Booking details changed. Please authorize payment again.";
  bookingState.payment.paymentIntentId = "";
  bookingState.payment.clientSecret = "";
}

function savePanelValues(panel) {
  panel.querySelectorAll("input, select, textarea").forEach((input) => {
    if (input.type === "radio" && !input.checked) return;
    bookingState.values[input.name] = inputValue(input);
  });
}

function restorePanelValues(panel) {
  panel.querySelectorAll("input, select, textarea").forEach((input) => {
    const value = bookingState.values[input.name];
    if (value === undefined || value === null) return;
    if (input.type === "checkbox") {
      input.checked = Boolean(value);
    } else if (input.type === "radio") {
      input.checked = input.value === value;
    } else {
      input.value = value;
    }
  });

  const status = panel.querySelector("[data-address-status]");
  if (status) {
    status.textContent = bookingState.address.message;
    status.dataset.status = bookingState.address.status;
  }
  const returningStatus = panel.querySelector("[data-returning-status]");
  if (returningStatus) {
    returningStatus.textContent = bookingState.returning.status;
    returningStatus.dataset.status = bookingState.returning.statusType;
  }
}

function requiredInputsComplete(panel) {
  const required = Array.from(panel.querySelectorAll("[data-required]"));
  return required.every((input) => {
    if (input.type === "radio") return Boolean(panel.querySelector(`input[name="${input.name}"]:checked`));
    if (input.type === "checkbox") return input.checked;
    return Boolean(input.value.trim());
  });
}

function stepIsComplete(panel) {
  const step = panel.dataset.currentStep;
  const flowName = panel.dataset.flowName;

  const anyGroups = new Map();
  panel.querySelectorAll("[data-any-required]").forEach((input) => {
    const key = input.dataset.anyRequired;
    anyGroups.set(key, (anyGroups.get(key) || false) || Boolean(input.value.trim()));
  });
  for (const complete of anyGroups.values()) {
    if (!complete) return false;
  }

  if (panel.querySelector("[data-email]") && !isValidEmail(panel.querySelector("[data-email]").value)) return false;
  for (const optionalEmail of panel.querySelectorAll("[data-email-optional]")) {
    if (optionalEmail.value.trim() && !isValidEmail(optionalEmail.value)) return false;
  }
  for (const phone of panel.querySelectorAll("[data-phone]")) {
    const digits = normalizePhone(phone.value);
    if (phone.dataset.required !== undefined && digits.length !== 10) return false;
    if (digits.length > 0 && digits.length !== 10) return false;
  }

  if (step === "Verify") return bookingState.returning.verified;
  if (step === "Service Address") return Boolean(bookingState.returning.selectedAddressId && bookingState.returning.addressValidated);
  if (step === "Vehicle" && flowName === "returning") {
    return Boolean(bookingState.returning.selectedVehicleId || bookingState.returning.stagedVehicle);
  }
  if (step === "Service Details") {
    if (serviceNeedsFuel() && (!bookingState.values.fuelType || !bookingState.values.fuelPreference)) return false;
    if (serviceNeedsWash() && !bookingState.values.washPackage) return false;
  }
  if (step === "Schedule") {
    const date = bookingState.values.serviceDate || "";
    if (!date || date < todayValue() || date > maxDateValue()) return false;
    if (!bookingState.values.returnTime) return false;
  }
  if (step === "Payment") return bookingState.payment.authorized;
  if (step === "Review") return Boolean(bookingState.values.reviewConfirmed);

  if (!requiredInputsComplete(panel)) return false;
  if (step === "Address") return bookingState.address.validated;
  return true;
}

// Friendly, customer-facing validation copy for a single field. Returns "" when
// the field is acceptable. Used for inline messages shown on blur.
function friendlyFieldMessage(input) {
  const name = input.name || "";
  const value = (input.value || "").trim();
  const isRequired = input.dataset.required !== undefined;

  if (input.dataset.phone !== undefined) {
    const digits = normalizePhone(value);
    if ((isRequired && digits.length !== 10) || (digits.length > 0 && digits.length !== 10)) {
      return window.ShiftFuelPhone?.validationMessage || "Enter a valid 10-digit phone number.";
    }
  }
  if (input.dataset.email !== undefined && value && !isValidEmail(value)) {
    return "Please enter a valid email address.";
  }
  if (isRequired && !value && input.type !== "radio" && input.type !== "checkbox") {
    const copy = {
      firstName: "Please enter your first name.",
      lastName: "Please enter your last name.",
      customerPhone: window.ShiftFuelPhone?.validationMessage || "Enter a valid 10-digit phone number.",
      customerEmail: "Please enter a valid email address.",
      street: "Please enter your street address.",
      city: "Please enter your city.",
      state: "Please enter your state.",
      zip: "Please enter your ZIP code.",
    };
    return copy[name] || "";
  }
  return "";
}

// Shows/clears the inline error message beneath a field's label.
function showFieldMessage(input) {
  const label = input.closest("label");
  if (!label) return;
  const message = friendlyFieldMessage(input);
  let msgEl = label.querySelector(".booking-field-error");
  if (message) {
    if (!msgEl) {
      msgEl = document.createElement("span");
      msgEl.className = "booking-field-error";
      label.appendChild(msgEl);
    }
    msgEl.textContent = message;
    input.classList.add("has-error");
  } else {
    if (msgEl) msgEl.remove();
    input.classList.remove("has-error");
  }
}

const STEP_ICONS = {
  Customer: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="3.4"/><path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6"/></svg>`,
  Address: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 21s7-5.5 7-11.5A7 7 0 0 0 5 9.5C5 15.5 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.3"/></svg>`,
  Verify: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="10.5" width="14" height="9.5" rx="1.6"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>`,
  "Service Address": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 21s7-5.5 7-11.5A7 7 0 0 0 5 9.5C5 15.5 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.3"/></svg>`,
  Vehicle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 16l1.5-5a2 2 0 0 1 1.9-1.4h9.2A2 2 0 0 1 18.5 11L20 16"/><rect x="3" y="16" width="18" height="4" rx="1.4"/><circle cx="7.5" cy="20" r="1.1"/><circle cx="16.5" cy="20" r="1.1"/></svg>`,
  Service: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 16l1.5-5a2 2 0 0 1 1.9-1.4h9.2A2 2 0 0 1 18.5 11L20 16"/><rect x="3" y="16" width="18" height="4" rx="1.4"/><circle cx="7.5" cy="20" r="1.1"/><circle cx="16.5" cy="20" r="1.1"/><path d="M8 5.5c.7-1 .7-1.8 0-2.8M12 5.5c.7-1 .7-1.8 0-2.8M16 5.5c.7-1 .7-1.8 0-2.8"/></svg>`,
  "Service Details": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="4" width="14" height="17" rx="1.6"/><path d="M9 3.5h6v2H9z"/><path d="M9 11h6M9 14.5h6"/></svg>`,
  Schedule: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/></svg>`,
  Handoff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="8" r="3"/><path d="M11 11l8 8M16 14l2.5 2.5M13.5 16.5L16 19"/></svg>`,
  Payment: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/></svg>`,
  Review: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.5l2.2 2.2L16 10"/></svg>`,
};
const CHECK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12.5l4.5 4.5L19 7"/></svg>`;

function renderProgressRail(steps, unlockedIndex, openIndex, flowName) {
  const currentLabel = getStepContent(steps[openIndex], flowName)?.title || steps[openIndex];
  return `
    <p class="booking-progress-compact">
      <span class="booking-progress-compact-step">Step ${openIndex + 1} of ${steps.length}</span>
      <span class="booking-progress-compact-label">${escapeHtml(currentLabel)}</span>
    </p>
    <ol class="booking-progress-rail" aria-label="Booking progress">
      ${steps.map((step, index) => {
        const state = index === openIndex ? "is-active" : index < unlockedIndex ? "is-complete" : "is-locked";
        const clickable = index <= unlockedIndex;
        return `
          <li class="${state}">
            <button type="button" class="rail-step" data-rail-step="${index}" ${clickable ? "" : "disabled"} aria-label="${escapeHtml(step)}">
              <span class="rail-number">${index + 1}</span>
              <span class="rail-icon">${state === "is-complete" ? CHECK_ICON : (STEP_ICONS[step] || "")}</span>
            </button>
            <span class="rail-label">${escapeHtml(step)}</span>
          </li>
        `;
      }).join("")}
    </ol>
  `;
}

function summaryRow({ label, stepName, content, unlockedIndex, steps }) {
  const idx = steps.indexOf(stepName);
  const reached = idx >= 0 && idx <= unlockedIndex;
  return `
    <div class="summary-row">
      <span class="summary-row-icon">${STEP_ICONS[stepName] || ""}</span>
      <span class="summary-row-body">
        <strong>${escapeHtml(label)}</strong>
        <span>${content || "Not entered yet"}</span>
      </span>
      ${reached ? `<button type="button" class="summary-edit" data-edit-step="${idx}">Edit</button>` : ""}
    </div>
  `;
}

// Mobile only: the Booking Summary collapses into a tappable accordion at the
// top. Persisted across re-renders so toggling doesn't reset on every step change.

// Promo-code control inside the Booking Summary. Shows an input + Apply, or an
// "applied" chip with Remove once a valid code is in bookingState.promo.
function renderPromoBlock() {
  const p = bookingState.promo;
  if (p && p.code) {
    return `
      <div class="summary-promo is-applied">
        <span class="summary-promo-chip">&#10003; ${escapeHtml(p.code)} applied</span>
        <button type="button" class="summary-promo-remove" data-promo-remove>Remove</button>
      </div>`;
  }
  return `
    <div class="summary-promo">
      <div class="summary-promo-input">
        <input type="text" data-promo-input placeholder="Promo code" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="32" value="${escapeHtml(bookingState.pendingPromoCode || "")}">
        <button type="button" class="button secondary" data-promo-apply>Apply</button>
      </div>
      <p class="summary-promo-msg" data-promo-msg role="status"></p>
    </div>`;
}

function renderSummarySidebar(steps, flowName, unlockedIndex) {
  const v = bookingState.values;
  const totals = calculateTotals();
  const reviewIndex = steps.indexOf("Review");
  const reachedReview = unlockedIndex >= reviewIndex;
  const customerStep = flowName === "returning" ? "Verify" : "Customer";
  const addressStep = flowName === "returning" ? "Service Address" : "Address";

  const customerContent = v.firstName || v.customerPhone
    ? escapeHtml([v.firstName, v.lastName].filter(Boolean).join(" "))
      + (v.customerPhone ? ` &bull; ${escapeHtml(v.customerPhone)}` : "")
    : "";
  const addressContent = v.street ? escapeHtml([v.street, v.city, v.state].filter(Boolean).join(", ")) : "";
  const vehicleContent = v.vehicleMake || v.vehicleModel
    ? escapeHtml([v.vehicleYear, v.vehicleMake, v.vehicleModel].filter(Boolean).join(" "))
      + (v.licensePlate ? ` &bull; Plate: ${escapeHtml(v.licensePlate)}` : "")
    : "";
  const serviceContent = v.serviceType ? escapeHtml(serviceLabel()) : "";
  const scheduleContent = v.serviceDate
    ? escapeHtml(v.serviceDate) + (v.returnTime ? ` &bull; ${escapeHtml(v.returnTime)}` : "")
    : "";
  const handoffContent = v.parking || v.handoff ? "Parking and key details saved" : "";
  const paymentContent = bookingState.payment.authorized ? "Payment method authorized" : "";

  const rows = [
    summaryRow({ label: "Customer", stepName: customerStep, content: customerContent, unlockedIndex, steps }),
    summaryRow({ label: "Address", stepName: addressStep, content: addressContent, unlockedIndex, steps }),
    summaryRow({ label: "Vehicle", stepName: "Vehicle", content: vehicleContent, unlockedIndex, steps }),
    summaryRow({ label: "Service", stepName: "Service", content: serviceContent, unlockedIndex, steps }),
    summaryRow({ label: "Schedule", stepName: "Schedule", content: scheduleContent, unlockedIndex, steps }),
    summaryRow({ label: "Handoff", stepName: "Handoff", content: handoffContent, unlockedIndex, steps }),
    summaryRow({ label: "Payment", stepName: "Payment", content: paymentContent, unlockedIndex, steps }),
  ].join("");

  return `
    <aside class="booking-summary-sidebar${flowState.summaryMobileOpen ? " is-open" : ""}">
      <button type="button" class="booking-summary-toggle" data-summary-toggle aria-expanded="${flowState.summaryMobileOpen ? "true" : "false"}">
        <span class="booking-summary-toggle-label">Booking Summary</span>
        <span class="booking-summary-toggle-total">${formatMoney(totals.estimatedTotal)}</span>
        <span class="booking-summary-chevron" aria-hidden="true">▾</span>
      </button>
      <div class="booking-summary-body">
        <h3>Booking Summary</h3>
        <p class="field-help">Review your details before continuing.</p>
        <div class="summary-rows">${rows}</div>
        <div class="summary-promo-wrap">${renderPromoBlock()}</div>
        ${totals.promoDiscount > 0 ? `
        <div class="summary-discount-row">
          <span>Promo ${escapeHtml(bookingState.promo.code)}</span>
          <span class="summary-discount-amount">&minus;${formatMoney(totals.promoDiscount)}</span>
        </div>` : ""}
        <div class="summary-total-row">
          <span>
            <strong>Estimated Total</strong>
            <small>Includes service and convenience fees.</small>
          </span>
          <span class="summary-total-amount">${formatMoney(totals.estimatedTotal)}</span>
        </div>
        <p class="summary-secure-note">Secure, encrypted, and trusted.</p>
      </div>
    </aside>
  `;
}

function renderStepCard(step, index, flowName, unlockedIndex, openIndex) {
  const content = getStepContent(step, flowName);
  const state = index === openIndex ? "is-active" : index < unlockedIndex ? "is-complete" : "is-locked";
  return `
    <article class="booking-accordion-card ${state}" data-step-index="${index}" data-current-step="${step}" data-flow-name="${flowName}">
      <button type="button" class="booking-accordion-header" data-step-header="${index}" ${state === "is-locked" ? "disabled" : ""}>
        <span class="accordion-icon">${state === "is-complete" ? CHECK_ICON : (STEP_ICONS[step] || "")}</span>
        <span class="accordion-heading">
          <strong>${index + 1}. ${escapeHtml(content.title)}</strong>
          <small>${escapeHtml(content.intro)}</small>
        </span>
        <span class="accordion-chevron" aria-hidden="true"></span>
      </button>
      <div class="booking-accordion-body">
        <div class="booking-step-fields">${content.fields}</div>
        <div class="booking-step-actions">
          ${index > 0 && step !== "Review" ? `<button class="button secondary" type="button" data-back>Back</button>` : ""}
          ${step !== "Review" ? `<button class="button primary" type="button" data-continue>Continue</button>` : ""}
        </div>
      </div>
    </article>
  `;
}

function setAddressStatus(panel, status, message) {
  bookingState.address.status = status;
  bookingState.address.message = message;
  const statusEl = panel.querySelector("[data-address-status]");
  if (statusEl) {
    statusEl.dataset.status = status;
    statusEl.textContent = message;
  }
}

function setReturningStatus(panel, status, message) {
  bookingState.returning.statusType = status;
  bookingState.returning.status = message;
  const statusEl = panel.querySelector("[data-returning-status]");
  if (statusEl) {
    statusEl.dataset.status = status;
    statusEl.textContent = message;
  }
}

async function callAddressValidator(address) {
  const res = await fetch("/api/address", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "validate_service_area",
      street: address.street || "",
      apt: address.unit || "",
      city: address.city || "",
      state: address.state || "",
      zip: address.zip || "",
      lat: address.lat || "",
      lon: address.lon || "",
    }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

async function validateAddress(panel) {
  savePanelValues(panel);
  if (!requiredInputsComplete(panel)) {
    bookingState.address.validated = false;
    setAddressStatus(panel, "error", "Please complete the required address fields before validating.");
    return;
  }

  const button = panel.querySelector("[data-validate-address]");
  if (button) {
    button.disabled = true;
    button.textContent = "Validating...";
  }
  setAddressStatus(panel, "warning", "Validating service address...");

  try {
    const { ok, data } = await callAddressValidator({
      street: bookingState.values.street,
      unit: bookingState.values.unit,
      city: bookingState.values.city,
      state: bookingState.values.state,
      zip: bookingState.values.zip,
      lat: bookingState.values.address_lat,
      lon: bookingState.values.address_lon,
    });
    if (!ok || !data.valid) {
      bookingState.address.validated = false;
      setAddressStatus(panel, "error", data.message || "We currently do not serve this area.");
      return;
    }
    // Keep the resolved coordinates so Service Details can load nearby stations
    // (saved addresses arrive without coordinates until validated).
    if (Number.isFinite(Number(data.lat)) && Number.isFinite(Number(data.lon))) {
      bookingState.values.address_lat = Number(data.lat);
      bookingState.values.address_lon = Number(data.lon);
    }
    bookingState.address.validated = true;
    setAddressStatus(panel, "success", "Address verified.");
  } catch (error) {
    console.error("Address validation failed:", error);
    bookingState.address.validated = false;
    setAddressStatus(panel, "error", "We could not verify this address. Please check your address and try again.");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Validate Address";
    }
  }
}

// ---------------------------------------------------------------------------
// Mapbox address autocomplete. We proxy through /api/address so the browser
// never carries a token. The server uses the Geocoding API (request-billed,
// large free tier) and returns full structured fields + coordinates with each
// suggestion, so picking one needs no second call — no Search Box "sessions".
// ---------------------------------------------------------------------------

// Set on suggestion mousedown (fires before the input's blur) so the blur-driven
// fallback validation doesn't race the validate of a pick.

function closeAddressSuggest(listEl) {
  if (!listEl) return;
  listEl.hidden = true;
  listEl.innerHTML = "";
}

async function fetchAddressSuggestions(query, listEl) {
  const seq = ++flowState.addressSuggestSeq;
  try {
    const res = await fetch("/api/address", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "address_suggest", q: query }),
    });
    const data = await res.json().catch(() => ({}));
    if (seq !== flowState.addressSuggestSeq) return; // a newer keystroke superseded this one
    flowState.lastAddressSuggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
    renderAddressSuggestions(listEl, flowState.lastAddressSuggestions);
  } catch (error) {
    closeAddressSuggest(listEl);
  }
}

function renderAddressSuggestions(listEl, suggestions) {
  if (!listEl) return;
  if (!suggestions.length) {
    closeAddressSuggest(listEl);
    return;
  }
  listEl.innerHTML = suggestions
    .map(
      (s) => `
      <li>
        <button type="button" class="address-suggest-item" data-suggest-id="${escapeHtml(s.id)}">
          <span class="address-suggest-name">${escapeHtml(s.name)}</span>
          <span class="address-suggest-place">${escapeHtml(s.place)}</span>
        </button>
      </li>`
    )
    .join("");
  listEl.hidden = false;
}

async function selectAddressSuggestion(panel, suggestId) {
  const listEl = panel.querySelector("[data-address-suggest]");
  closeAddressSuggest(listEl);
  try {
    // The suggestion already carries the structured fields + coordinates from the
    // Geocoding response, so there's no second lookup — just apply them.
    const a = flowState.lastAddressSuggestions.find((s) => String(s.id) === String(suggestId));
    if (!a) return;

    const setField = (name, value) => {
      const input = panel.querySelector(`[name="${name}"]`);
      if (input && value) input.value = value;
      bookingState.values[name] = value || bookingState.values[name] || "";
    };
    setField("street", a.street);
    setField("city", a.city);
    setField("state", a.state);
    setField("zip", a.zip);
    bookingState.values.address_lat = a.lat ?? "";
    bookingState.values.address_lon = a.lon ?? "";

    // We already have exact coordinates — validate instantly (radius check only).
    savePanelValues(panel);
    await validateAddress(panel);
    panel.dispatchEvent(new Event("booking-address-picked", { bubbles: true }));
  } catch (error) {
    console.error("Address selection failed:", error);
  } finally {
    flowState.addressPickInProgress = false;
  }
}

// Auto-validate a hand-typed address (no Mapbox pick) once all required fields
// are filled, so the removed "Validate Address" button isn't needed. Skipped
// while a suggestion pick is mid-flight (that path validates with exact coords).
// Returns the validation promise (or null) so callers can refresh the UI after.
function maybeAutoValidateAddress(panel) {
  if (panel.dataset.currentStep !== "Address") return null;
  if (flowState.addressPickInProgress) return null;
  if (bookingState.address.validated) return null;
  if (!requiredInputsComplete(panel)) return null;
  return validateAddress(panel);
}

function requestAddressFromRecord(record) {
  return {
    id: record.id || record.saved_address_id || compactKey([
      record.address_street || record.street || record.hospital,
      record.address_apt || record.unit,
      record.address_city || record.city,
      record.address_state || record.state,
      record.address_zip || record.zip,
    ]),
    street: record.address_street || record.street || record.hospital || "",
    unit: record.address_apt || record.unit || "",
    city: record.address_city || record.city || "",
    state: record.address_state || record.state || "DE",
    zip: record.address_zip || record.zip || "",
    raw: record,
  };
}

function requestVehicleFromRecord(record) {
  return {
    id: record.id || record.saved_vehicle_id || compactKey([
      record.vehicle_year || record.year,
      record.vehicle_make || record.make,
      record.vehicle_model || record.model,
      record.vehicle_color || record.color,
      record.license_plate || record.plate,
    ]),
    year: record.vehicle_year || record.year || "",
    make: record.vehicle_make || record.make || "",
    model: record.vehicle_model || record.model || "",
    color: record.vehicle_color || record.color || "",
    license: record.license_plate || record.plate || "",
    fuelType: record.fuel_type || record.fuelType || "",
    raw: record,
  };
}

// Collapse saved addresses that are the same place formatted differently
// ("1702 Saint Mihiel Avenue" vs "…Ave"), so the picker doesn't show duplicates.
function dedupeReturningAddresses(addresses) {
  const suffixes = { avenue: "ave", street: "st", boulevard: "blvd", highway: "hwy", road: "rd", drive: "dr", lane: "ln", court: "ct", place: "pl", parkway: "pkwy", terrace: "ter" };
  const norm = (s) => String(s || "").toLowerCase().replace(/[.,]/g, " ")
    .replace(/\b(avenue|street|boulevard|highway|road|drive|lane|court|place|parkway|terrace)\b/g, (m) => suffixes[m] || m)
    .replace(/\s+/g, " ").trim();
  const keyOf = (a) => [norm(a.street), norm(a.unit), norm(a.city), norm(a.state), String(a.zip || "").replace(/\D/g, "")].join("|");
  const seen = new Map();
  for (const a of (Array.isArray(addresses) ? addresses : [])) {
    const key = keyOf(a);
    if (!seen.has(key)) seen.set(key, a);
  }
  return [...seen.values()];
}

function requestsToReturningOptions(requests) {
  const addresses = [];
  const vehicles = [];
  const addressKeys = new Set();
  const vehicleKeys = new Set();

  (Array.isArray(requests) ? requests : []).forEach((request) => {
    const address = requestAddressFromRecord(request);
    const addressKey = compactKey([address.street, address.unit, address.city, address.state, address.zip]);
    if (address.street && !addressKeys.has(addressKey) && isValidatedAddress(request)) {
      addressKeys.add(addressKey);
      addresses.push(address);
    }

    const vehicle = requestVehicleFromRecord(request);
    const vehicleKey = compactKey([vehicle.year, vehicle.make, vehicle.model, vehicle.color, vehicle.license]);
    if ((vehicle.make || vehicle.model || vehicle.license) && !vehicleKeys.has(vehicleKey) && isActiveRecord(request)) {
      vehicleKeys.add(vehicleKey);
      vehicles.push(vehicle);
    }
  });

  return { addresses, vehicles };
}

function savedOptionsToReturningOptions(options) {
  const addresses = Array.isArray(options?.addresses) ? options.addresses : Array.isArray(options?.saved_addresses) ? options.saved_addresses : [];
  const vehicles = Array.isArray(options?.vehicles) ? options.vehicles : Array.isArray(options?.saved_vehicles) ? options.saved_vehicles : [];
  return {
    addresses: addresses.filter(isValidatedAddress).map(requestAddressFromRecord),
    vehicles: vehicles.filter(isActiveRecord).map(requestVehicleFromRecord),
  };
}

function uniqueCustomerKeys(requests) {
  const keys = new Set();
  (Array.isArray(requests) ? requests : []).forEach((request) => {
    keys.add(compactKey([normalizePhone(request.customer_phone), request.customer_email]));
  });
  return keys;
}

function applyVerifiedCustomer(requests) {
  const first = requests[0] || {};
  const nameParts = String(first.customer_name || "").trim().split(/\s+/).filter(Boolean);
  bookingState.values.firstName = bookingState.values.firstName || nameParts[0] || "";
  bookingState.values.lastName = bookingState.values.lastName || nameParts.slice(1).join(" ") || "";
  bookingState.values.customerPhone = formatPhone(first.customer_phone || bookingState.values.verifyPhone || "");
  bookingState.values.customerEmail = first.customer_email || bookingState.values.verifyEmail || "";
}

async function verifyReturningCustomer(panel) {
  savePanelValues(panel);
  const phone = normalizePhone(bookingState.values.verifyPhone);
  const email = String(bookingState.values.verifyEmail || "").trim().toLowerCase();
  const ticket = String(bookingState.values.verifyTicket || "").trim();

  if (!phone && !email && !ticket) {
    bookingState.returning.verified = false;
    setReturningStatus(panel, "error", "Enter at least one detail to verify your booking history.");
    return;
  }

  const button = panel.querySelector("[data-verify-returning]");
  if (button) {
    button.disabled = true;
    button.textContent = "Verifying...";
  }
  setReturningStatus(panel, "warning", "Checking previous booking information...");

  try {
    if (!window.ShiftFuelSupabase) {
      bookingState.returning.verified = false;
      setReturningStatus(panel, "error", "We could not verify your information right now. Please use Book Now.");
      return;
    }

    const { data, error } = await window.ShiftFuelSupabase.rpc("public_track_request", {
      p_request_id: ticket || null,
      p_phone: phone || null,
      p_email: email || null,
    });
    if (error) throw error;

    const requests = Array.isArray(data) ? data : [];
    if (!requests.length) {
      bookingState.returning.verified = false;
      setReturningStatus(panel, "error", "We could not find a previous customer with those details.");
      return;
    }

    if (uniqueCustomerKeys(requests).size > 1) {
      bookingState.returning.verified = false;
      setReturningStatus(panel, "warning", "We found more than one possible match. Please enter one more detail to verify this is you.");
      return;
    }

    bookingState.returning.requests = requests;
    applyVerifiedCustomer(requests);
    let options = requestsToReturningOptions(requests);

    if (phone && email) {
      let saved = { data: null, error: null };
      try {
        saved = await window.ShiftFuelSupabase.rpc("public_returning_customer_options", {
          p_phone: phone,
          p_email: email,
        });
      } catch (savedError) {
        // supabase rpc() is thenable with no .catch — wrap so a real throw (network)
        // is handled and we fall back to the request-derived options below.
        console.warn("Saved returning options lookup failed:", savedError);
      }
      if (!saved.error && saved.data) {
        const savedOptions = savedOptionsToReturningOptions(saved.data);
        if (savedOptions.addresses.length || savedOptions.vehicles.length) options = savedOptions;
      }
    }

    bookingState.returning.addresses = dedupeReturningAddresses(options.addresses);
    bookingState.returning.vehicles = options.vehicles;
    bookingState.returning.selectedAddressId = null;
    bookingState.returning.selectedVehicleId = null;
    bookingState.returning.stagedAddress = null;
    bookingState.returning.stagedVehicle = null;
    bookingState.returning.verified = true;
    setReturningStatus(panel, "success", "Verified. Continue to pick your validated service address.");
  } catch (error) {
    console.error("Returning verification failed:", error);
    bookingState.returning.verified = false;
    const detail = error?.message || error?.code || "";
    setReturningStatus(panel, "error", `We could not verify your information right now. Please try again.${detail ? ` (${detail})` : ""}`);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Verify customer";
    }
  }
}

function applySelectedAddress(address) {
  bookingState.returning.selectedAddressId = address.id;
  bookingState.returning.stagedAddress = null;
  bookingState.values.street = address.street;
  bookingState.values.unit = address.unit;
  bookingState.values.city = address.city;
  bookingState.values.state = address.state || "DE";
  bookingState.values.zip = address.zip;
  // Saved addresses carry no coordinates, and we must not reuse coords from a
  // previously-typed address. Clear them so validation geocodes this address
  // fresh and stores the correct coordinates (needed for nearby stations).
  bookingState.values.address_lat = Number(address.lat) || "";
  bookingState.values.address_lon = Number(address.lon) || "";
  bookingState.address.validated = true;
  bookingState.address.status = "success";
  bookingState.address.message = "Address verified.";
}

function applySelectedVehicle(vehicle) {
  bookingState.returning.selectedVehicleId = vehicle.id;
  bookingState.returning.stagedVehicle = null;
  bookingState.values.vehicleYear = vehicle.year;
  bookingState.values.vehicleMake = vehicle.make;
  bookingState.values.vehicleModel = vehicle.model;
  bookingState.values.vehicleColor = vehicle.color;
  bookingState.values.licensePlate = vehicle.license;
  // Fuel type: the vehicle's saved type, else the one they used most in their
  // booking history for this vehicle.
  bookingState.values.fuelType = vehicle.fuelType || getPreferredFuelType() || "";
}

// Mobile: after picking a saved address/vehicle, glide to the Continue button so
// the customer doesn't have to scroll past the form to proceed.
function scrollToContinue(panel) {
  if (window.innerWidth > 980) return;
  const btn = panel.querySelector("[data-continue]");
  if (btn) btn.scrollIntoView({ behavior: "smooth", block: "center" });
}

// The fuel type the returning customer used most often for the selected vehicle.
function getPreferredFuelType() {
  const reqs = Array.isArray(bookingState.returning.requests) ? bookingState.returning.requests : [];
  const matches = reqs.filter((r) => r.fuel_type && requestMatchesSelectedVehicle(r));
  if (!matches.length) return "";
  const tally = new Map();
  for (const r of matches) {
    const key = String(r.fuel_type).trim();
    if (key) tally.set(key, (tally.get(key) || 0) + 1);
  }
  let best = "";
  let bestCount = 0;
  for (const [type, count] of tally) {
    if (count > bestCount) { best = type; bestCount = count; }
  }
  return best;
}

function addressCard(address) {
  const selected = bookingState.returning.selectedAddressId === address.id;
  return `
    <article class="returning-option-card ${selected ? "is-selected" : ""}">
      <span>${escapeHtml(address.street)}</span>
      ${address.unit ? `<span>${escapeHtml(address.unit)}</span>` : ""}
      <span>${escapeHtml([address.city, address.state, address.zip].filter(Boolean).join(", "))}</span>
      <div class="returning-customer-actions">
        <button class="button primary" type="button" data-select-returning-address="${escapeHtml(address.id)}">${selected ? "Selected" : "Use this address"}</button>
        <button class="button secondary" type="button" data-edit-returning-address="${escapeHtml(address.id)}">Edit</button>
      </div>
    </article>
  `;
}

function vehicleCard(vehicle) {
  const selected = bookingState.returning.selectedVehicleId === vehicle.id;
  return `
    <article class="returning-option-card ${selected ? "is-selected" : ""}">
      <span><strong>${escapeHtml([vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Saved vehicle")}</strong></span>
      ${vehicle.color ? `<span>Color: ${escapeHtml(vehicle.color)}</span>` : ""}
      ${vehicle.license ? `<span>Plate: ${escapeHtml(vehicle.license)}</span>` : ""}
      <div class="returning-customer-actions">
        <button class="button primary" type="button" data-select-returning-vehicle="${escapeHtml(vehicle.id)}">${selected ? "Selected" : "Use this vehicle"}</button>
        <button class="button danger" type="button" data-delete-returning-vehicle="${escapeHtml(vehicle.id)}">Delete</button>
      </div>
    </article>
  `;
}

function returningAddressForm(address = {}) {
  return `
    <div class="returning-inline-form">
      <div class="booking-field-grid">
        <label class="span-2"><span>Street address <span class="required-mark">Required</span></span><input data-returning-address-field name="returningStreet" type="text" value="${escapeHtml(address.street)}" placeholder="123 Main Street"></label>
        <label><span>Unit/suite/apartment</span><input data-returning-address-field name="returningUnit" type="text" value="${escapeHtml(address.unit)}" placeholder="Optional"></label>
        <label><span>City <span class="required-mark">Required</span></span><input data-returning-address-field name="returningCity" type="text" value="${escapeHtml(address.city)}" placeholder="Wilmington"></label>
        <label><span>State <span class="required-mark">Required</span></span><input data-returning-address-field name="returningState" type="text" value="${escapeHtml(address.state || "DE")}"></label>
        <label><span>ZIP code <span class="required-mark">Required</span></span><input data-returning-address-field name="returningZip" type="text" value="${escapeHtml(address.zip)}" placeholder="19804"></label>
      </div>
      <div class="address-validation-panel">
        <button class="button secondary" type="button" data-validate-returning-address>Validate Address</button>
        <p class="booking-validation-message" data-returning-address-status data-status="${escapeHtml(bookingState.returning.addressStatusType || "warning")}">${escapeHtml(bookingState.returning.addressStatus ? bookingState.returning.addressStatus : "Please validate your service address before continuing.")}</p>
      </div>
    </div>
  `;
}

function returningVehicleForm() {
  return `
    <div class="returning-inline-form">
      <div class="booking-field-grid">
        <label><span>Year <span class="required-mark">Required</span></span><select data-returning-vehicle-field name="returningVehicleYear"><option value="">Select year</option></select></label>
        <label><span>Make <span class="required-mark">Required</span></span><select data-returning-vehicle-field name="returningVehicleMake"><option value="">Select make</option></select></label>
        <label><span>Model <span class="required-mark">Required</span></span><select data-returning-vehicle-field name="returningVehicleModel"><option value="">Select year and make first</option></select></label>
        <label><span>Color <span class="required-mark">Required</span></span><input data-returning-vehicle-field name="returningVehicleColor" type="text" placeholder="Blue"></label>
        <label><span>License plate <span class="required-mark">Required</span></span><input data-returning-vehicle-field name="returningLicensePlate" type="text" placeholder="123456"></label>
        <label><span>Fuel type</span><select data-returning-vehicle-field name="returningFuelType">
          <option value="">Select fuel type later if needed</option>
          <option>Regular</option>
          <option>Midgrade</option>
          <option>Premium</option>
          <option>Diesel</option>
          <option>Electric / no fuel</option>
        </select></label>
      </div>
      <button class="button secondary" type="button" data-save-returning-vehicle>Use this vehicle</button>
    </div>
  `;
}

function renderReturningServiceArea(panel) {
  const container = panel.querySelector("[data-returning-service-area]");
  if (!container) return;
  const modeAddress = bookingState.returning.addressMode === "add"
    ? {}
    : bookingState.returning.addresses.find((address) => address.id === bookingState.returning.addressMode) || {};

  container.innerHTML = `
    <div class="returning-option-grid">
      ${bookingState.returning.addresses.length
        ? bookingState.returning.addresses.map(addressCard).join("")
        : `<p class="field-help">No saved validated service addresses were found. Add a new service address below.</p>`}
    </div>
    <button class="button secondary" type="button" data-add-returning-address>Add new service address</button>
    ${!bookingState.returning.addressMode && bookingState.returning.selectedAddressId
      ? `<p class="booking-validation-message" data-returning-area-status data-status="${escapeHtml(bookingState.returning.addressStatusType || "warning")}">${escapeHtml(bookingState.returning.addressStatus || "Select your address to confirm it's still in our service area.")}</p>`
      : ""}
    ${bookingState.returning.addressMode ? returningAddressForm(modeAddress) : ""}
  `;
}

function renderReturningVehicles(panel) {
  const container = panel.querySelector("[data-returning-vehicles]");
  if (!container) return;
  container.innerHTML = `
    <div class="returning-option-grid">
      ${bookingState.returning.vehicles.length
        ? bookingState.returning.vehicles.map(vehicleCard).join("")
        : `<p class="field-help">No saved vehicles were found. Add a new vehicle below.</p>`}
    </div>
    <button class="button secondary" type="button" data-add-returning-vehicle>Add new vehicle</button>
    ${bookingState.returning.vehicleMode === "add" ? returningVehicleForm() : ""}
  `;
}

// Book Now: silently detect a returning customer once the Customer step is done,
// and load their saved addresses/vehicles so the next steps offer them.
async function detectReturningCustomer() {
  const phone = normalizePhone(bookingState.values.customerPhone || "");
  const email = String(bookingState.values.customerEmail || "").trim();
  if (!phone || !email || !window.ShiftFuelSupabase) return false;
  try {
    const { data, error } = await window.ShiftFuelSupabase.rpc("public_track_request", {
      p_request_id: null, p_phone: phone, p_email: email,
    });
    if (error) return false;
    const requests = Array.isArray(data) ? data : [];
    // Need a confident, single-customer match before we auto-load anything.
    if (!requests.length || uniqueCustomerKeys(requests).size > 1) return false;

    bookingState.returning.requests = requests;
    applyVerifiedCustomer(requests);
    let options = requestsToReturningOptions(requests);
    const saved = await window.ShiftFuelSupabase
      .rpc("public_returning_customer_options", { p_phone: phone, p_email: email })
      .catch(() => ({ data: null, error: true }));
    if (!saved.error && saved.data) {
      const savedOptions = savedOptionsToReturningOptions(saved.data);
      if (savedOptions.addresses.length || savedOptions.vehicles.length) options = savedOptions;
    }
    bookingState.returning.addresses = dedupeReturningAddresses(options.addresses);
    bookingState.returning.vehicles = options.vehicles;
    bookingState.returning.verified = true;
    bookingState.returning.detectedOnBookNow = true;
    bookingState.returning.customerName = bookingState.values.firstName || "";
    return true;
  } catch (error) {
    console.warn("Returning-customer detection failed:", error);
    return false;
  }
}

function renderBookNowSavedAddresses(panel) {
  const container = panel.querySelector("[data-booknow-saved-addresses]");
  if (!container) return;
  if (!bookingState.returning.detectedOnBookNow || !bookingState.returning.addresses.length) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = `
    <div class="booknow-saved-block">
      <p class="booknow-welcome">Welcome back${bookingState.returning.customerName ? `, ${escapeHtml(bookingState.returning.customerName)}` : ""}! Pick a saved service address, or enter a new one below.</p>
      <div class="returning-option-grid">${bookingState.returning.addresses.map(addressCard).join("")}</div>
    </div>
  `;
}

function renderBookNowSavedVehicles(panel) {
  const container = panel.querySelector("[data-booknow-saved-vehicles]");
  if (!container) return;
  if (!bookingState.returning.detectedOnBookNow || !bookingState.returning.vehicles.length) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = `
    <div class="booknow-saved-block">
      <p class="booknow-welcome">Your saved vehicles — pick one, or enter a new one below.</p>
      <div class="returning-option-grid">${bookingState.returning.vehicles.map(vehicleCard).join("")}</div>
    </div>
  `;
}

function populateVehicleYearOptions(select) {
  const maxYear = new Date().getFullYear() + 1;
  let html = `<option value="">Select year</option>`;
  for (let year = maxYear; year >= 1980; year -= 1) html += `<option value="${year}">${year}</option>`;
  select.innerHTML = html;
}

function populateVehicleMakeOptions(select) {
  const popular = VEHICLE_POPULAR_MAKES.map((make) => `<option value="${escapeHtml(make)}">${escapeHtml(make)}</option>`).join("");
  const other = VEHICLE_OTHER_MAKES
    .filter((make) => !VEHICLE_POPULAR_MAKES.includes(make))
    .sort((a, b) => a.localeCompare(b))
    .map((make) => `<option value="${escapeHtml(make)}">${escapeHtml(make)}</option>`)
    .join("");
  select.innerHTML = `
    <option value="">Select make</option>
    <optgroup label="Most common makes">${popular}</optgroup>
    <optgroup label="Other makes">${other}</optgroup>
  `;
}

async function loadVehicleModelOptions(yearSelect, makeSelect, modelSelect, selectedModel) {
  if (!modelSelect) return;
  const year = yearSelect?.value || "";
  const make = makeSelect?.value || "";

  if (!year || !make) {
    modelSelect.innerHTML = `<option value="">Select year and make first</option>`;
    modelSelect.disabled = true;
    return;
  }

  modelSelect.innerHTML = `<option value="">Loading models...</option>`;
  modelSelect.disabled = true;

  try {
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(make)}/modelyear/${year}/vehicletype/car?format=json`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const models = [...new Set((data.Results || []).map((row) => row.Model_Name).filter(Boolean))].sort((a, b) => a.localeCompare(b));
      if (models.length) {
        modelSelect.innerHTML = `<option value="">Select model</option>${models.map((model) => `<option value="${escapeHtml(model)}">${escapeHtml(model)}</option>`).join("")}`;
        modelSelect.disabled = false;
        if (selectedModel) {
          if (!Array.from(modelSelect.options).some((option) => option.value === selectedModel)) {
            modelSelect.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(selectedModel)}">${escapeHtml(selectedModel)}</option>`);
          }
          modelSelect.value = selectedModel;
        }
        return;
      }
    }
  } catch (error) {
    console.warn("Could not load vehicle models from NHTSA:", error);
  }

  const fallback = VEHICLE_FALLBACK_MODELS[make] || [];
  modelSelect.innerHTML = `<option value="">${fallback.length ? "Select model" : "No models found"}</option>${fallback.map((model) => `<option value="${escapeHtml(model)}">${escapeHtml(model)}</option>`).join("")}`;
  modelSelect.disabled = fallback.length === 0;
  if (selectedModel && fallback.includes(selectedModel)) modelSelect.value = selectedModel;
}

function renderVehicleFields(panel) {
  const yearSelect = panel.querySelector('[name="vehicleYear"]');
  const makeSelect = panel.querySelector('[name="vehicleMake"]');
  const modelSelect = panel.querySelector('[name="vehicleModel"]');
  if (!yearSelect || !makeSelect || !modelSelect) return;

  if (!yearSelect.dataset.populated) {
    populateVehicleYearOptions(yearSelect);
    yearSelect.dataset.populated = "1";
  }
  if (!makeSelect.dataset.populated) {
    populateVehicleMakeOptions(makeSelect);
    makeSelect.dataset.populated = "1";
  }
  if (bookingState.values.vehicleYear) yearSelect.value = bookingState.values.vehicleYear;
  if (bookingState.values.vehicleMake) makeSelect.value = bookingState.values.vehicleMake;

  // Returned so callers can await the async model load before re-checking step
  // completion (otherwise picking a saved vehicle leaves Continue disabled).
  return loadVehicleModelOptions(yearSelect, makeSelect, modelSelect, bookingState.values.vehicleModel || "");
}

function renderReturningVehicleFields(panel) {
  const yearSelect = panel.querySelector('[name="returningVehicleYear"]');
  const makeSelect = panel.querySelector('[name="returningVehicleMake"]');
  const modelSelect = panel.querySelector('[name="returningVehicleModel"]');
  if (!yearSelect || !makeSelect || !modelSelect) return;

  if (!yearSelect.dataset.populated) {
    populateVehicleYearOptions(yearSelect);
    yearSelect.dataset.populated = "1";
  }
  if (!makeSelect.dataset.populated) {
    populateVehicleMakeOptions(makeSelect);
    makeSelect.dataset.populated = "1";
  }

  loadVehicleModelOptions(yearSelect, makeSelect, modelSelect, "");
}

function renderWashIncludes(panel) {
  const container = panel.querySelector("[data-wash-includes]");
  if (!container) return;
  const pkg = selectedWashPackage();
  if (!pkg) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = `
    <div class="wash-package-includes">
      <strong>${escapeHtml(pkg.label)} - ${formatMoney(pkg.price)} includes:</strong>
      <ul>${pkg.includes.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </div>
  `;
}

function renderServiceDetails(panel) {
  const container = panel.querySelector("[data-service-details]");
  if (!container) return;
  if (!bookingState.values.serviceType) {
    container.innerHTML = `<p class="field-help">Select a service first.</p>`;
    return;
  }

  const fuelFields = serviceNeedsFuel() ? `
    <div class="booking-field-grid">
      <label><span>Fuel type <span class="required-mark">Required</span></span><select data-required name="fuelType">
        <option value="">Select fuel type</option>
        <option>Regular</option>
        <option>Midgrade</option>
        <option>Premium</option>
        <option>Diesel</option>
      </select></label>
      <label><span>Fuel preference <span class="required-mark">Required</span></span><select data-required name="fuelPreference">
        <option value="">Select gallons</option>
        <option value="0-5">0-5 gallons</option>
        <option value="5-10">5-10 gallons</option>
        <option value="10-15">10-15 gallons</option>
        <option value="15-20">15-20 gallons</option>
        <option value="20-25">20-25 gallons</option>
        <option value="25+">25+ gallons</option>
      </select></label>
    </div>
    <p class="fuel-buffer-note" data-fuel-buffer-note hidden></p>
  ` : "";

  const washFields = serviceNeedsWash() ? `
    <div class="booking-field-grid">
      ${WASH_PACKAGES.length === 1
        ? `<div class="payment-placeholder"><strong>Car wash package</strong><p>${escapeHtml(WASH_PACKAGES[0].label)} - ${formatMoney(WASH_PACKAGES[0].price)}</p></div>`
        : `<label><span>Car wash package <span class="required-mark">Required</span></span><select data-required name="washPackage">
            <option value="">Select package</option>
            ${WASH_PACKAGES.map((pkg) => `<option value="${pkg.value}">${escapeHtml(pkg.label)} - ${formatMoney(pkg.price)}</option>`).join("")}
          </select></label>`}
    </div>
    <div data-wash-includes></div>
  ` : "";

  const stationFields = serviceNeedsFuel() ? `
    <div class="station-picker" data-station-picker>
      <div class="station-picker-head">
        <strong>Preferred gas station</strong>
        <p class="field-help">We fuel up at the closest station by default — no extra charge. Prefer a specific station? Every extra mile to and from it adds <span data-station-rate>${formatMoney(bookingState.station.perMileRate || STATION_PER_MILE_RATE)}</span>.</p>
      </div>
      <div data-station-list><p class="field-help">Verify your service address to see nearby stations.</p></div>
      <p class="field-help station-combo-note" data-station-combo-note hidden></p>
      <div class="station-search">
        <input type="text" data-station-search placeholder="Don't see it? Search a station by name or address">
        <button type="button" class="button secondary" data-station-search-btn>Search</button>
      </div>
      <p class="field-help" data-station-search-status></p>
    </div>
  ` : "";

  container.innerHTML = `
    ${fuelFields}
    ${stationFields}
    ${washFields}
    <div class="placeholder-note">Only fields needed for your selected service are shown.</div>
  `;
  if (WASH_PACKAGES.length === 1 && serviceNeedsWash()) bookingState.values.washPackage = WASH_PACKAGES[0].value;
  renderWashIncludes(panel);
  restorePanelValues(panel);
  updateFuelBufferNote(panel);
  if (serviceNeedsFuel()) loadStationOptions(panel);
  if (serviceNeedsWash()) { ensureWashEstimate(); ensureWashCharge(); }
}

// Per-extra-mile rate shown in the UI; the server (api/_gas-stations.js) is the
// source of truth for the actual surcharge.
const STATION_PER_MILE_RATE = 0.75;

// Fetch nearby gas stations for the verified service address and render them.
// Closest is auto-selected (free); the customer can upgrade to a farther one.
// Does a past request belong to the vehicle the customer just selected? Prefer
// an exact license-plate match; fall back to make+model when no plate is known.
function requestMatchesSelectedVehicle(r) {
  const plate = String(bookingState.values.licensePlate || "").replace(/\s/g, "").toUpperCase();
  if (plate) return String(r.license_plate || "").replace(/\s/g, "").toUpperCase() === plate;
  const make = String(bookingState.values.vehicleMake || "").toLowerCase();
  const model = String(bookingState.values.vehicleModel || "").toLowerCase();
  return Boolean(make && model
    && String(r.vehicle_make || "").toLowerCase() === make
    && String(r.vehicle_model || "").toLowerCase() === model);
}

// The customer's go-to station brand for the selected vehicle: the station name
// they PAID a surcharge for most often across their paid history. Returns null
// when they have no consistent paid preference (e.g. they always take the free
// closest), so nothing gets auto-selected in that case.
function getPreferredStationBrand() {
  const reqs = Array.isArray(bookingState.returning.requests) ? bookingState.returning.requests : [];
  const paid = reqs.filter((r) =>
    (r.payment_status === "captured" || r.status === "complete")
    && Number(r.gas_station_surcharge) > 0
    && r.gas_station_name
    && requestMatchesSelectedVehicle(r));
  if (!paid.length) return null;
  const tally = new Map();
  for (const r of paid) {
    const key = String(r.gas_station_name).trim();
    if (key) tally.set(key, (tally.get(key) || 0) + 1);
  }
  let best = null;
  let bestCount = 0;
  for (const [name, count] of tally) {
    if (count > bestCount) { best = name; bestCount = count; }
  }
  return best;
}

// If the customer has a usual paid station for this vehicle, find the closest one
// of that brand near the new address and auto-select it.
async function applyPreferredStation(panel) {
  const brand = getPreferredStationBrand();
  if (!brand) return;
  const lat = Number(bookingState.values.address_lat);
  const lon = Number(bookingState.values.address_lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  try {
    const res = await fetch("/api/address", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "gas_station_search", lat, lon, q: brand }),
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok || !Array.isArray(data.stations) || !data.stations.length) return;
    const matchIds = new Set(data.stations.map((s) => s.id));
    const rest = bookingState.station.options.filter((s) => !matchIds.has(s.id));
    bookingState.station.options = [...data.stations, ...rest];
    applyStationSelection(data.stations[0]); // closest of their usual brand
    renderStationList(panel);
    refreshTotalsUI(panel);
    const statusEl = panel.querySelector("[data-station-search-status]");
    if (statusEl) statusEl.textContent = `Auto-selected your usual: ${data.stations[0].name}. Change it anytime below.`;
  } catch (_) {
    // Non-fatal — the closest station stays selected.
  }
}

// ── Car-wash drive estimate ───────────────────────────────────────────────────
// The wash facility is fixed (The Car Spa). The worker's "time to complete" needs the
// round-trip drive to it, but the real GPS coords aren't captured until mid-job, so
// estimate it at booking from the service address. Geocoded once per session and
// cached; straight-line distance ×1.3 road factor — display-only, so no routing
// call. Stored one-way (the worker doubles it), in `[wash_miles]`.
const CAR_WASH_FACILITY_ADDRESS = "602 Main St, Wilmington, DE 19804";

function bookingHaversineMiles(a, b) {
  if (!a || !b) return 0;
  const R = 3958.8, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

async function ensureWashEstimate() {
  const lat = Number(bookingState.values.address_lat);
  const lon = Number(bookingState.values.address_lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return;
  const key = `${lat},${lon}`;
  if (flowState.washEstimate.fetchedFor === key && flowState.washEstimate.oneWayMiles > 0) return;
  try {
    if (!flowState.carWashFacilityCoords) {
      const res = await fetch("/api/address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "geocode", street: CAR_WASH_FACILITY_ADDRESS }),
      });
      const data = await res.json().catch(() => ({}));
      if (data && data.ok && Number.isFinite(Number(data.lat)) && Number.isFinite(Number(data.lon))) {
        flowState.carWashFacilityCoords = { lat: Number(data.lat), lon: Number(data.lon) };
      }
    }
    if (!flowState.carWashFacilityCoords) return;
    const oneWay = bookingHaversineMiles({ lat, lon }, flowState.carWashFacilityCoords) * 1.3;
    flowState.washEstimate = { fetchedFor: key, oneWayMiles: Math.round(oneWay * 10) / 10 };
  } catch (_) {
    // Non-fatal — the wash drive just won't be included in the estimate.
  }
}

// Server-authoritative car-wash distance charge (fixed wash facility). Mirrors the
// gas-station surcharge: fetch the exact dollar amount the booking re-price will
// use, store it on bookingState, and refresh the visible summary. For a fuel+wash
// job it depends on the chosen station, so it waits until one is selected.
async function ensureWashCharge() {
  if (!serviceNeedsWash()) { bookingState.washSurcharge = 0; return; }
  const lat = Number(bookingState.values.address_lat);
  const lon = Number(bookingState.values.address_lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return;
  const needsFuel = serviceNeedsFuel();
  const gasLat = needsFuel ? Number(bookingState.station.lat) : NaN;
  const gasLon = needsFuel ? Number(bookingState.station.lon) : NaN;
  if (needsFuel && !(Number.isFinite(gasLat) && Number.isFinite(gasLon) && (gasLat !== 0 || gasLon !== 0))) {
    return; // no station chosen yet — called again after applyStationSelection
  }
  try {
    const res = await fetch("/api/address", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "wash_distance_quote",
        address_lat: lat,
        address_lon: lon,
        gas_station_lat: needsFuel ? gasLat : "",
        gas_station_lon: needsFuel ? gasLon : "",
        needs_fuel: needsFuel,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (data && data.ok) {
      bookingState.washSurcharge = Number(data.surcharge) || 0;
      if (typeof renderPaymentSummary === "function") renderPaymentSummary(document);
    }
  } catch (_) {
    // Non-fatal — the authorize step re-fetches and the server is authoritative.
  }
}

async function loadStationOptions(panel) {
  const list = panel.querySelector("[data-station-list]");
  if (!list) return;
  const lat = Number(bookingState.values.address_lat);
  const lon = Number(bookingState.values.address_lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
    list.innerHTML = `<p class="field-help">Verify your service address to see nearby stations.</p>`;
    return;
  }

  const key = `${lat},${lon}`;
  if (bookingState.station.fetchedFor === key && bookingState.station.options.length) {
    renderStationList(panel);
    return;
  }

  list.innerHTML = `<p class="field-help">Loading nearby stations…</p>`;
  try {
    const res = await fetch("/api/address", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "nearby_gas_stations", lat, lon }),
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok || !Array.isArray(data.stations) || !data.stations.length) {
      list.innerHTML = `<p class="field-help">We couldn't load nearby stations right now — we'll fuel at the closest one (no extra charge).</p>`;
      bookingState.station.options = [];
      return;
    }
    bookingState.station.options = data.stations;
    bookingState.station.fetchedFor = key;
    if (Number.isFinite(Number(data.per_mile_rate))) {
      bookingState.station.perMileRate = Number(data.per_mile_rate);
      const rateEl = panel.querySelector("[data-station-rate]");
      if (rateEl) rateEl.textContent = formatMoney(bookingState.station.perMileRate);
    }
    const chosen = bookingState.station.selectedId;
    let justDefaulted = false;
    if (!chosen || !data.stations.some((s) => s.id === chosen)) {
      applyStationSelection(data.stations[0]);
      justDefaulted = true;
    }
    renderStationList(panel);
    refreshTotalsUI(panel);
    // Only override the default closest with the customer's usual brand — never a
    // station they've already manually chosen.
    if (justDefaulted) await applyPreferredStation(panel);
  } catch (err) {
    list.innerHTML = `<p class="field-help">We couldn't load nearby stations right now — we'll fuel at the closest one (no extra charge).</p>`;
  }
}

// Free-text station search ("don't see your station?"). Merges matches into the
// list (deduped by id), keeps it sorted by price, and selects the top match.
async function searchStations(panel) {
  const input = panel.querySelector("[data-station-search]");
  const statusEl = panel.querySelector("[data-station-search-status]");
  if (!input) return;
  const q = input.value.trim();
  const lat = Number(bookingState.values.address_lat);
  const lon = Number(bookingState.values.address_lon);
  const setStatus = (msg) => { if (statusEl) statusEl.textContent = msg; };
  if (q.length < 2) { setStatus("Type at least 2 characters to search."); return; }
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
    setStatus("Verify your service address first."); return;
  }
  setStatus("Searching…");
  try {
    const res = await fetch("/api/address", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "gas_station_search", lat, lon, q }),
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok || !Array.isArray(data.stations) || !data.stations.length) {
      setStatus("No matching stations found near your address."); return;
    }
    const matchIds = new Set(data.stations.map((s) => s.id));
    // Put the searched stations on top, then the original nearby list (minus any
    // that were also in the search results, so nothing repeats).
    const rest = bookingState.station.options.filter((s) => !matchIds.has(s.id));
    bookingState.station.options = [...data.stations, ...rest];
    applyStationSelection(data.stations[0]);
    renderStationList(panel);
    refreshTotalsUI(panel);
    invalidatePaymentAuthorization();
    setStatus(`Showing ${data.stations.length} match${data.stations.length > 1 ? "es" : ""} on top — selected your pick.`);
  } catch (err) {
    setStatus("Search failed. Please try again.");
  }
}

function renderStationList(panel) {
  const list = panel.querySelector("[data-station-list]");
  if (!list) return;
  const opts = bookingState.station.options;
  if (!opts.length) return;
  list.innerHTML = opts.map((s) => {
    const checked = s.id === bookingState.station.selectedId;
    const badge = s.is_closest
      ? `<span class="station-badge station-badge--free">Closest · Free</span>`
      : `<span class="station-badge station-badge--fee">+${formatMoney(s.surcharge)}</span>`;
    return `
      <label class="station-option${checked ? " is-selected" : ""}">
        <input type="radio" name="gasStation" value="${escapeHtml(s.id)}"${checked ? " checked" : ""}>
        <span class="station-option-info">
          <span class="station-option-name">${escapeHtml(s.name)}</span>
          ${s.address ? `<span class="station-option-addr">${escapeHtml(s.address)}</span>` : ""}
        </span>
        ${badge}
      </label>`;
  }).join("");

  // Soft flag for fuel + wash combos: a non-closest station is an extra stop on top
  // of the car wash trip. We don't block it — just surface the detour + cost. Order
  // stays wash → fuel → back, so the station falls on the way home.
  const note = panel.querySelector("[data-station-combo-note]");
  if (note) {
    const sel = opts.find((s) => s.id === bookingState.station.selectedId);
    if (serviceNeedsFuel() && serviceNeedsWash() && sel && !sel.is_closest) {
      const miles = Number(sel.extra_round_trip_miles) || 0;
      note.hidden = false;
      note.textContent = `Heads up: with a car wash too, ${sel.name} is an extra stop — about ${miles ? `${miles.toFixed(1)} mi of` : "extra"} driving (+${formatMoney(Number(sel.surcharge) || 0)}) vs. the closest station. You can still pick it; we route wash → fuel → back so it's on the way home.`;
    } else {
      note.hidden = true;
      note.textContent = "";
    }
  }
}

function applyStationSelection(s) {
  if (!s) return;
  bookingState.station.selectedId = s.id;
  bookingState.station.name = s.name || "";
  bookingState.station.address = s.address || "";
  bookingState.station.lat = s.lat ?? "";
  bookingState.station.lon = s.lon ?? "";
  bookingState.station.surcharge = Number(s.surcharge) || 0;
  bookingState.station.extraMiles = Number(s.extra_round_trip_miles) || 0;
  // One-way driving miles to this station (already a real Mapbox distance from the
  // picker) — stashed in notes so the worker's time-to-complete can include the
  // round-trip drive to the pump. Display-only; no extra Mapbox call.
  bookingState.station.oneWayMiles = Number(s.one_way_miles) || 0;
  // A fuel+wash job's wash charge depends on this station — re-quote it now.
  if (serviceNeedsWash()) ensureWashCharge();
}

// Clear any station selection (e.g. when the address changes or fuel is dropped)
// so a stale surcharge never carries over.
function resetStationSelection() {
  bookingState.station.options = [];
  bookingState.station.fetchedFor = "";
  bookingState.station.selectedId = "";
  bookingState.station.name = "";
  bookingState.station.address = "";
  bookingState.station.lat = "";
  bookingState.station.lon = "";
  bookingState.station.surcharge = 0;
  bookingState.station.extraMiles = 0;
  bookingState.station.oneWayMiles = 0;
}

// Refresh any visible price summaries after a station change. Both are no-ops if
// the relevant container isn't in this panel.
function refreshTotalsUI(panel) {
  if (panel.querySelector("[data-payment-summary]")) renderPaymentSummary(panel);
  if (panel.querySelector("[data-review-summary]")) renderReviewSummary(panel);
}

function renderScheduleFields(panel) {
  const host = panel.querySelector("[data-date-host]");
  const timeSelect = panel.querySelector("[data-return-time]");
  if (!host || !timeSelect) return;

  // Custom date picker: greys out past/out-of-range dates and uses an inline
  // popup instead of iOS's off-screen native overlay. Attach once per render
  // (the host is rebuilt fresh on every full re-render); the change handler that
  // refreshes return times keeps the flag, so it never double-attaches.
  if (!host.dataset.sfpAttached && window.ShiftFuelDatePicker) {
    host.dataset.sfpAttached = "1";
    const hidden = host.querySelector('input[name="serviceDate"]');
    if (hidden) hidden.value = bookingState.values.serviceDate || "";
    ShiftFuelDatePicker.attach(host, {
      min: todayValue(),
      max: maxDateValue(),
      value: bookingState.values.serviceDate || "",
    });
  }

  const selectedTime = bookingState.values.returnTime || "";
  const options = availableTimeOptions();
  const placeholder = bookingState.values.serviceDate && options.length === 0
    ? (bookingState.values.pickupTime
        ? "No staffable times — try an earlier pickup time or another date"
        : "No return times available for this date")
    : "Select return time";
  timeSelect.innerHTML = `<option value="">${placeholder}</option>${options.map((option) => `
    <option value="${option.value}" ${option.disabled ? "disabled" : ""} ${option.value === selectedTime && !option.disabled ? "selected" : ""}>${option.label}${option.disabled ? " - unavailable" : ""}</option>
  `).join("")}`;
  if (selectedTime && !Array.from(timeSelect.options).some((option) => option.value === selectedTime && !option.disabled)) {
    bookingState.values.returnTime = "";
    timeSelect.value = "";
  }

  // Earliest-pickup dropdown (30-min slots; "Flexible" default).
  const pickupSelect = panel.querySelector("[data-pickup-time]");
  if (pickupSelect && pickupSelect.tagName === "SELECT") {
    const selectedPickup = bookingState.values.pickupTime || "";
    const popts = pickupTimeOptions();
    pickupSelect.innerHTML = `<option value="">Flexible — no preference</option>${popts.map((o) => `
      <option value="${o.value}" ${o.disabled ? "disabled" : ""} ${o.value === selectedPickup && !o.disabled ? "selected" : ""}>${o.label}</option>
    `).join("")}`;
    if (selectedPickup && !popts.some((o) => o.value === selectedPickup && !o.disabled)) {
      bookingState.values.pickupTime = "";
      pickupSelect.value = "";
    }
  }
}

function renderPaymentSummary(panel) {
  const container = panel.querySelector("[data-payment-summary]");
  if (!container) return;
  const totals = calculateTotals();
  container.innerHTML = `
    <strong>Payment authorization summary</strong>
    <dl class="review-summary-list">
      ${serviceNeedsFuel() ? `<div><dt>Fuel service fee</dt><dd>${formatMoney(totals.fuelFee)}</dd></div>` : ""}
      ${serviceNeedsWash() ? `<div><dt>Car wash service fee</dt><dd>${formatMoney(totals.washFee)}</dd></div>` : ""}
      ${bookingState.values.quickCare ? `<div><dt>Vehicle add-on</dt><dd>${formatMoney(totals.quickFee)}</dd></div>` : ""}
      ${serviceNeedsFuel() ? `<div><dt>Estimated fuel</dt><dd>${escapeHtml(bookingState.values.fuelPreference || "Selected range")} selected. We authorize a ${totals.authorizationFuelGallons} gallon buffer just in case: ${totals.authorizationFuelGallons} gal x ${formatMoney(PRICE_PER_GALLON)}/gal = ${formatMoney(totals.fuelEstimate)}</dd></div>` : ""}
      ${totals.washPackage ? `<div><dt>Car wash package</dt><dd>${escapeHtml(totals.washPackage.label)} - ${formatMoney(totals.washAmount)}</dd></div>` : ""}
      ${totals.stationSurcharge > 0 ? `<div><dt>Preferred station distance</dt><dd>${escapeHtml(bookingState.station.name || "Selected station")} (+${formatMoney(totals.stationSurcharge)})</dd></div>` : ""}
      ${totals.washSurcharge > 0 ? `<div><dt>Car wash distance</dt><dd>+${formatMoney(totals.washSurcharge)}</dd></div>` : ""}
      ${totals.promoDiscount > 0 ? `<div class="payment-promo-line"><dt>Promo ${escapeHtml(bookingState.promo.code)}</dt><dd>&minus;${formatMoney(totals.promoDiscount)}</dd></div>` : ""}
      <div><dt>Estimated total</dt><dd>${formatMoney(totals.estimatedTotal)}</dd></div>
      ${serviceIsAdvanceBooking() ? `<div><dt>Scheduled authorization</dt><dd>Your card is saved now — no charge today. We authorize ${formatMoney(totals.estimatedTotal)} about 2 days before your service date, and you're only charged once service is complete.</dd></div>` : ""}
    </dl>
    ${totals.subtotal > 0 ? `<div class="payment-promo-wrap">${renderPromoBlock()}</div>` : ""}
  `;
  const status = panel.querySelector("[data-payment-status]");
  if (status) {
    status.dataset.status = bookingState.payment.statusType || "";
    status.textContent = bookingState.payment.status || "";
  }
  const button = panel.querySelector("[data-authorize-payment]");
  if (button) {
    const done = bookingState.payment.authorized || bookingState.payment.cardSaved;
    button.disabled = done;
    button.textContent = bookingState.payment.cardSaved
      ? "Card saved"
      : (bookingState.payment.authorized ? "Payment authorized" : "Authorize payment");
  }
}

// A Stripe authorization hold expires in ~7 days, so it can't cover a booking
// made further out. At/under NEAR_TERM_DAYS we authorize now (today's hold flow);
// beyond it we save the card now and the daily cron places the hold ~2 days
// before the service date.
const NEAR_TERM_DAYS = 5;

function daysUntilServiceDate() {
  const raw = bookingState.values.serviceDate || "";
  if (!raw) return null;
  const svc = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(svc.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((svc - today) / 86400000);
}

function serviceIsAdvanceBooking() {
  const days = daysUntilServiceDate();
  return days != null && days > NEAR_TERM_DAYS;
}

async function authorizePayment(panel) {
  savePanelValues(panel);
  const status = panel.querySelector("[data-payment-status]");
  const button = panel.querySelector("[data-authorize-payment]");
  const setStatus = (type, message) => {
    bookingState.payment.statusType = type;
    bookingState.payment.status = message;
    if (status) {
      status.dataset.status = type;
      status.textContent = message;
    }
  };
  if (!stripe || !cardElement) {
    setStatus("error", "Payment authorization is not available right now.");
    return;
  }
  const totals = calculateTotals();
  if (!totals.estimatedTotal) {
    setStatus("error", "Please complete service details before authorizing payment.");
    return;
  }
  openPaymentModal(panel);
}

async function confirmPaymentAuthorization(panel, button) {
  savePanelValues(panel);
  const status = panel.querySelector("[data-payment-status]");
  const setStatus = (type, message) => {
    bookingState.payment.statusType = type;
    bookingState.payment.status = message;
    if (status) {
      status.dataset.status = type;
      status.textContent = message;
    }
    const modalError = document.querySelector("#booking-card-errors");
    if (modalError && type === "error") modalError.textContent = message;
  };

  if (!stripe || !cardElement || !flowState.cardMounted) {
    setStatus("error", "Payment authorization is not available right now.");
    return;
  }

  // Make sure the server-authoritative wash distance charge is current before we
  // lock in + authorize the total, so the authorized amount matches the re-price.
  await ensureWashCharge();
  const totals = calculateTotals();
  if (button) {
    button.disabled = true;
    button.textContent = "Authorizing...";
  }
  setStatus("warning", serviceIsAdvanceBooking() ? "Saving card..." : "Authorizing payment method...");
  try {
    if (serviceIsAdvanceBooking()) {
      // Advance booking: save the card now (no hold placed). The daily cron
      // authorizes the real hold ~2 days before the service date.
      const setupRes = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_setup_intent",
          customer_name: customerName(),
          customer_email: bookingState.values.customerEmail,
          customer_phone: normalizePhone(bookingState.values.customerPhone),
          service_label: serviceLabel(),
        }),
      });
      const setup = await setupRes.json().catch(() => ({}));
      if (!setupRes.ok) throw new Error(setup.error || "Could not start card setup.");

      const result = await stripe.confirmCardSetup(setup.client_secret, {
        payment_method: {
          card: cardElement,
          billing_details: {
            name: customerName(),
            email: bookingState.values.customerEmail || undefined,
            phone: normalizePhone(bookingState.values.customerPhone) || undefined,
          },
        },
      });
      if (result.error) throw new Error(result.error.message);

      bookingState.payment.cardSaved = true;
      bookingState.payment.setupIntentId = result.setupIntent?.id || "";
      bookingState.payment.stripeCustomerId = setup.customer_id || "";
      bookingState.payment.authorizedAmountCents = Math.round(totals.estimatedTotal * 100);
      const svcDate = bookingState.values.serviceDate || "your service date";
      setStatus("success", `Card saved. We'll authorize ${formatMoney(totals.estimatedTotal)} about 2 days before ${svcDate}. You are not charged until service is complete.`);
      closePaymentModal();
      flowRoot?.dispatchEvent(new CustomEvent("booking-payment-authorized"));
      return;
    }

    const createRes = await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_intent",
        amount_cents: Math.round(totals.estimatedTotal * 100),
        customer_name: customerName(),
        customer_email: bookingState.values.customerEmail,
        service_label: serviceLabel(),
      }),
    });
    const intent = await createRes.json().catch(() => ({}));
    if (!createRes.ok) throw new Error(intent.error || "Could not initialize payment authorization.");

    const confirmation = await stripe.confirmCardPayment(intent.client_secret, {
      payment_method: {
        card: cardElement,
        billing_details: {
          name: customerName(),
          email: bookingState.values.customerEmail || undefined,
          phone: normalizePhone(bookingState.values.customerPhone) || undefined,
        },
      },
    });
    if (confirmation.error) throw new Error(confirmation.error.message);

    bookingState.payment.authorized = true;
    bookingState.payment.paymentIntentId = intent.payment_intent_id;
    bookingState.payment.clientSecret = intent.client_secret;
    bookingState.payment.authorizedAmountCents = Math.round(totals.estimatedTotal * 100);
    setStatus("success", "Payment authorized. You are not charged until service is complete.");
    closePaymentModal();
    flowRoot?.dispatchEvent(new CustomEvent("booking-payment-authorized"));
  } catch (error) {
    console.error("Payment authorization failed:", error);
    bookingState.payment.authorized = false;
    setStatus("error", error.message || "Could not authorize payment. Please try again.");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Authorize payment";
    }
  }
}

async function cancelPaymentAuthorization(panel) {
  const status = panel.querySelector("[data-submit-status]") || panel.querySelector("[data-payment-status]");
  const setStatus = (type, message) => {
    if (status) {
      status.dataset.status = type;
      status.textContent = message;
    }
    bookingState.payment.statusType = type;
    bookingState.payment.status = message;
  };

  if (!bookingState.payment.paymentIntentId || !bookingState.payment.clientSecret) {
    bookingState.payment.authorized = false;
    bookingState.payment.paymentIntentId = "";
    bookingState.payment.clientSecret = "";
    bookingState.payment.authorizedAmountCents = 0;
    // Advance booking saved a card instead of a hold — nothing to release in
    // Stripe, just clear the local state.
    bookingState.payment.cardSaved = false;
    bookingState.payment.setupIntentId = "";
    bookingState.payment.stripeCustomerId = "";
    bookingState.values.reviewConfirmed = false;
    setStatus("warning", "Payment authorization was cleared. No request was booked.");
    return true;
  }

  const confirmed = confirm("Cancel this payment authorization? No request will be booked and the card hold will be released.");
  if (!confirmed) return false;

  const button = panel.querySelector("[data-cancel-authorization]");
  if (button) {
    button.disabled = true;
    button.textContent = "Canceling...";
  }
  setStatus("warning", "Canceling payment authorization...");

  try {
    const res = await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "cancel_authorization",
        payment_intent_id: bookingState.payment.paymentIntentId,
        client_secret: bookingState.payment.clientSecret,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not cancel payment authorization.");

    bookingState.payment.authorized = false;
    bookingState.payment.paymentIntentId = "";
    bookingState.payment.clientSecret = "";
    bookingState.payment.authorizedAmountCents = 0;
    bookingState.values.reviewConfirmed = false;
    setStatus("success", "Payment authorization canceled. No request was booked and the card hold was released.");
    return true;
  } catch (error) {
    console.error("Payment authorization cancel failed:", error);
    setStatus("error", error.message || "Could not cancel payment authorization. Please contact ShiftFuel.");
    return false;
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Cancel authorization";
    }
  }
}

// Re-check a saved address (selected from the cards) against the CURRENT service
// area, so a returning customer can't book a previously-valid address that now
// falls outside coverage. Gates the "Service Address" step via addressValidated.
async function recheckReturningSavedAddress(panel, address) {
  bookingState.returning.addressValidated = false;
  bookingState.returning.addressStatusType = "warning";
  bookingState.returning.addressStatus = "Checking this address is still in our service area…";
  renderReturningServiceArea(panel);
  try {
    const { ok, data } = await callAddressValidator({
      street: address.street, unit: address.unit, city: address.city,
      state: address.state, zip: address.zip, lat: address.lat, lon: address.lon,
    });
    if (!ok || !data.valid) {
      bookingState.returning.addressStatusType = "error";
      bookingState.returning.addressStatus = data.message || "We currently do not serve this area.";
    } else {
      if (Number.isFinite(Number(data.lat)) && Number.isFinite(Number(data.lon))) {
        bookingState.values.address_lat = Number(data.lat);
        bookingState.values.address_lon = Number(data.lon);
      }
      bookingState.returning.addressValidated = true;
      bookingState.returning.addressStatusType = "success";
      bookingState.returning.addressStatus = "Address verified — in your service area.";
    }
  } catch (error) {
    console.error("Returning saved-address re-check failed:", error);
    bookingState.returning.addressStatusType = "error";
    bookingState.returning.addressStatus = "We could not verify this address. Please try again.";
  }
  renderReturningServiceArea(panel);
}

async function validateReturningAddress(panel) {
  const address = {
    id: bookingState.returning.addressMode && bookingState.returning.addressMode !== "add" ? bookingState.returning.addressMode : `new-address-${Date.now()}`,
    street: panel.querySelector('[name="returningStreet"]')?.value.trim() || "",
    unit: panel.querySelector('[name="returningUnit"]')?.value.trim() || "",
    city: panel.querySelector('[name="returningCity"]')?.value.trim() || "",
    state: panel.querySelector('[name="returningState"]')?.value.trim() || "",
    zip: panel.querySelector('[name="returningZip"]')?.value.trim() || "",
  };
  const statusEl = panel.querySelector("[data-returning-address-status]");
  const setStatus = (status, message) => {
    bookingState.returning.addressStatusType = status;
    bookingState.returning.addressStatus = message;
    if (statusEl) {
      statusEl.dataset.status = status;
      statusEl.textContent = message;
    }
  };

  if (!address.street || !address.city || !address.state || !address.zip) {
    setStatus("error", "Please complete the required address fields before validating.");
    return;
  }

  const button = panel.querySelector("[data-validate-returning-address]");
  if (button) {
    button.disabled = true;
    button.textContent = "Validating...";
  }
  setStatus("warning", "Validating service address...");

  bookingState.returning.addressValidated = false;
  try {
    const { ok, data } = await callAddressValidator(address);
    if (!ok || !data.valid) {
      setStatus("error", data.message || "We currently do not serve this area.");
      return;
    }
    if (bookingState.returning.addressMode === "add") {
      bookingState.returning.addresses.push(address);
    } else {
      bookingState.returning.addresses = bookingState.returning.addresses.map((item) => (
        item.id === address.id ? address : item
      ));
    }
    if (Number.isFinite(Number(data.lat)) && Number.isFinite(Number(data.lon))) {
      bookingState.values.address_lat = Number(data.lat);
      bookingState.values.address_lon = Number(data.lon);
    }
    applySelectedAddress(address);
    bookingState.returning.addressMode = "";
    bookingState.returning.addressValidated = true;
    setStatus("success", "Address verified.");
  } catch (error) {
    console.error("Returning address validation failed:", error);
    setStatus("error", "We could not verify this address. Please check your address and try again.");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Validate Address";
    }
  }
}

function saveReturningVehicle(panel) {
  const vehicle = {
    id: `new-vehicle-${Date.now()}`,
    year: panel.querySelector('[name="returningVehicleYear"]')?.value.trim() || "",
    make: panel.querySelector('[name="returningVehicleMake"]')?.value.trim() || "",
    model: panel.querySelector('[name="returningVehicleModel"]')?.value.trim() || "",
    color: panel.querySelector('[name="returningVehicleColor"]')?.value.trim() || "",
    license: panel.querySelector('[name="returningLicensePlate"]')?.value.trim() || "",
    fuelType: panel.querySelector('[name="returningFuelType"]')?.value || "",
  };
  if (!vehicle.year || !vehicle.make || !vehicle.model || !vehicle.color || !vehicle.license) return false;
  bookingState.returning.vehicles.push(vehicle);
  applySelectedVehicle(vehicle);
  return true;
}

async function deleteReturningVehicle(vehicleId) {
  const vehicle = bookingState.returning.vehicles.find((item) => item.id === vehicleId);
  if (!vehicle) return;
  const confirmed = confirm("Delete this saved vehicle? This removes it from future booking options only. Past requests will not be changed.");
  if (!confirmed) return;

  const rpcId = vehicle.raw?.id || vehicle.raw?.saved_vehicle_id;
  const phone = normalizePhone(bookingState.values.customerPhone);
  const email = String(bookingState.values.customerEmail || "").toLowerCase();
  if (window.ShiftFuelSupabase && rpcId && phone && email) {
    const { error } = await window.ShiftFuelSupabase.rpc("public_soft_delete_saved_vehicle", {
      p_vehicle_id: rpcId,
      p_phone: phone,
      p_email: email,
    });
    if (error) {
      console.error("Could not delete saved vehicle:", error);
      alert("Could not delete that saved vehicle. Please try again.");
      return;
    }
  }

  bookingState.returning.vehicles = bookingState.returning.vehicles.filter((item) => item.id !== vehicleId);
  if (bookingState.returning.selectedVehicleId === vehicleId) {
    bookingState.returning.selectedVehicleId = null;
  }
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function resolveSelectedVehicleId() {
  const vehicle = bookingState.returning.vehicles.find((item) => item.id === bookingState.returning.selectedVehicleId);
  const rawId = vehicle?.raw?.saved_vehicle_id || vehicle?.raw?.vehicle_id || vehicle?.raw?.id;
  return isUuid(rawId) ? rawId : null;
}

function customerName() {
  return [bookingState.values.firstName, bookingState.values.lastName].filter(Boolean).join(" ").trim();
}

function serviceLabel() {
  const labels = {
    fuel: "Fuel Fill-Up",
    wash: "Car Wash",
    fuel_wash: "Fuel + Car Wash",
  };
  return labels[bookingState.values.serviceType] || "ShiftFuel service";
}

function serviceTypeForApi() {
  if (bookingState.values.serviceType === "wash") return "wash-only";
  if (bookingState.values.serviceType === "fuel_wash") return "car-wash-fuel";
  return "fuel-only";
}

function buildBookingPayload() {
  const totals = calculateTotals();
  const washPackage = selectedWashPackage();
  const serviceDate = bookingState.values.serviceDate || "";
  const returnTime = bookingState.values.returnTime || "";
  const pickupTime = bookingState.values.pickupTime || "";
  const notes = [
    bookingState.values.specialInstructions ? `[special_instructions] ${bookingState.values.specialInstructions}` : "",
    "[booking_source shared_flow]",
    // Freeze the time charge at the booking-time company rate so the customer's
    // price is locked — later company/employee rate changes never move it.
    Number(totals.timeCost) > 0 ? `[time_charge ${Number(totals.timeCost).toFixed(2)}]` : "",
    // One-way driving miles to the gas station (real Mapbox distance from the
    // picker) so the worker's time-to-complete can add the round-trip pump drive.
    serviceNeedsFuel() && Number(bookingState.station.oneWayMiles) > 0
      ? `[station_miles ${Number(bookingState.station.oneWayMiles).toFixed(1)}]` : "",
    // One-way miles to the fixed car-wash facility, same purpose for the wash leg.
    serviceNeedsWash() && Number(flowState.washEstimate.oneWayMiles) > 0
      ? `[wash_miles ${Number(flowState.washEstimate.oneWayMiles).toFixed(1)}]` : "",
  ].filter(Boolean).join(" ");

  return {
    payment_intent_id: bookingState.payment.paymentIntentId,
    amount_cents: bookingState.payment.authorizedAmountCents || Math.round(totals.estimatedTotal * 100),
    customer_name: customerName(),
    customer_id: bookingState.returning.requests[0]?.customer_id || null,
    customer_phone: normalizePhone(bookingState.values.customerPhone || ""),
    customer_email: bookingState.values.customerEmail || "",
    vehicle_year: bookingState.values.vehicleYear || "",
    vehicle_id: resolveSelectedVehicleId(),
    vehicle_make: bookingState.values.vehicleMake || "",
    vehicle_model: bookingState.values.vehicleModel || "",
    vehicle_color: bookingState.values.vehicleColor || "",
    license_plate: bookingState.values.licensePlate || "",
    hospital: [bookingState.values.street, bookingState.values.city, bookingState.values.state, bookingState.values.zip].filter(Boolean).join(", "),
    address_street: bookingState.values.street || "",
    address_apt: bookingState.values.unit || "",
    address_city: bookingState.values.city || "",
    address_state: bookingState.values.state || "",
    address_zip: bookingState.values.zip || "",
    // Coordinates power the server-side service-area re-check in /api/payments.
    // They are read from the request body, not persisted as booking columns.
    address_lat: bookingState.values.address_lat || "",
    address_lon: bookingState.values.address_lon || "",
    // Chosen gas station. Coords let the server recompute the distance surcharge
    // authoritatively; gas_station_surcharge is only a fallback hint.
    gas_station_name: serviceNeedsFuel() ? bookingState.station.name || "" : "",
    gas_station_address: serviceNeedsFuel() ? bookingState.station.address || "" : "",
    gas_station_lat: serviceNeedsFuel() ? bookingState.station.lat || "" : "",
    gas_station_lon: serviceNeedsFuel() ? bookingState.station.lon || "" : "",
    gas_station_surcharge: serviceNeedsFuel() ? bookingState.station.surcharge || 0 : 0,
    // Car wash distance charge — server recomputes authoritatively from the fixed
    // wash facility; this is only a fallback hint if its geocode is briefly down.
    wash_distance_surcharge: serviceNeedsWash() ? bookingState.washSurcharge || 0 : 0,
    // Promo code: the server re-validates + recomputes the discount authoritatively;
    // promo_order_total is the pre-discount subtotal for the minimum-order check.
    promo_code: bookingState.promo && bookingState.promo.code ? bookingState.promo.code : "",
    promo_order_total: totals.subtotal || totals.estimatedTotal || 0,
    address_validation_status: bookingState.address.validated ? "validated" : "not_validated",
    parking_location: bookingState.values.parking || "",
    key_handoff_details: bookingState.values.handoff || "",
    special_instructions: bookingState.values.specialInstructions || "",
    service_type: serviceTypeForApi(),
    service_label: serviceLabel(),
    service_date: serviceDate,
    desired_return_time: returnTime ? `${returnTime}:00` : "",
    // Optional earliest-pickup constraint. Omit entirely when blank so the empty
    // string never reaches the `time` column (NULL = customer is flexible).
    desired_pickup_time: pickupTime ? `${pickupTime}:00` : undefined,
    fuel_type: serviceNeedsFuel() ? bookingState.values.fuelType || "" : "",
    estimated_fuel_range: serviceNeedsFuel() ? bookingState.values.fuelPreference || "" : "",
    estimated_gallons: totals.fuelGallons,
    selected_fuel_gallons: totals.selectedFuelGallons,
    authorization_fuel_gallons: totals.authorizationFuelGallons,
    price_per_gallon: PRICE_PER_GALLON,
    estimated_fuel_amount: totals.fuelEstimate,
    fuel_convenience_fee: totals.fuelFee,
    wash_package: washPackage?.value || "",
    wash_package_label: washPackage?.label || "",
    wash_fee: totals.washAmount,
    wash_convenience_fee: totals.washFee,
    quick_inspection: Boolean(bookingState.values.quickCare),
    quick_inspection_fee: totals.quickFee,
    service_fee: totals.fuelFee + totals.washFee,
    estimated_total: totals.estimatedTotal,
    authorized_amount: totals.estimatedTotal,
    base_fuel_service_fee: totals.fuelBaseFee,
    base_car_wash_service_fee: totals.washBaseFee,
    base_inspection_fee: totals.quickFee,
    payment_operating_recovery_amount: totals.recovery,
    displayed_fuel_service_fee: totals.fuelFee,
    displayed_car_wash_service_fee: totals.washFee,
    displayed_inspection_fee: totals.quickFee,
    net_target_amount: totals.netTarget,
    gross_total_before_rounding: totals.grossBeforeRounding,
    rounded_customer_total: totals.estimatedTotal,
    booking_source: flowRoot?.dataset.bookingFlow === "returning" ? "returning_customer" : "book_now",
    notes,
  };
}

function publicRequestNumber(id) {
  return `SF-${String(id || "").slice(0, 8).toUpperCase()}`;
}

function postBookingAccountPromptHtml() {
  return `
    <div class="post-booking-account-prompt" data-post-booking-account-prompt>
      <div>
        <h4>Want faster booking next time?</h4>
        <p>Create an account to save your vehicle, service address, and booking history.</p>
      </div>
      <div class="admin-button-row">
        <a class="button primary" href="/create-account">Create My Account</a>
        <button class="button secondary" type="button" data-dismiss-account-prompt>No thanks</button>
      </div>
    </div>
  `;
}

async function submitBooking(panel) {
  if (bookingState.submitting || bookingState.submitted) return;
  savePanelValues(panel);
  const status = panel.querySelector("[data-submit-status]");
  const setStatus = (type, message) => {
    if (status) {
      status.dataset.status = type;
      status.textContent = message;
    }
  };
  if (!bookingState.payment.authorized || !bookingState.payment.paymentIntentId) {
    setStatus("error", "Please authorize payment before submitting.");
    return;
  }
  if (!bookingState.values.reviewConfirmed) {
    setStatus("error", "Please confirm the booking information before submitting.");
    return;
  }
  bookingState.submitting = true;
  const button = panel.querySelector("[data-submit-booking]");
  if (button) {
    button.disabled = true;
    button.textContent = "Submitting...";
  }
  setStatus("warning", "Submitting booking...");
  try {
    const payload = buildBookingPayload();
    const res = await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_authorized_booking",
        ...payload,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not submit booking.");
    bookingState.submitted = true;
    bookingState.submittedRequestNumber = publicRequestNumber(data.id);
    const fields = panel.querySelector(".booking-step-fields");
    if (fields) {
      fields.innerHTML = `
        <div class="submission-success">
          <h3>Request received.</h3>
          <p>Your request number is: <strong>${escapeHtml(bookingState.submittedRequestNumber)}</strong></p>
          <p>Use Track My Vehicle to follow your request.</p>
          <div class="admin-button-row">
            <button class="button primary" type="button" data-new-booking>Submit a new request</button>
            <a class="button secondary" href="/track">Track My Vehicle</a>
          </div>
          ${postBookingAccountPromptHtml()}
        </div>
      `;
    }
    setStatus("success", "");
    const actions = panel.querySelector(".booking-step-actions");
    if (actions) actions.hidden = true;
    if (button) button.hidden = true;
    // Scroll the "Request received" confirmation into view (below the sticky
    // header) so the customer clearly sees it worked + their request number.
    const successEl = fields?.querySelector(".submission-success");
    if (successEl) {
      const header = document.querySelector(".site-header");
      const headerHeight = header ? header.getBoundingClientRect().height : 0;
      const top = successEl.getBoundingClientRect().top + window.scrollY - headerHeight - 18;
      window.scrollTo({ top: Math.max(top, 0), behavior: "smooth" });
    }
  } catch (error) {
    console.error("Booking submit failed:", error);
    setStatus("error", error.message || "Could not submit booking. Please try again.");
    if (button) {
      button.disabled = false;
      button.textContent = "Book request";
    }
  } finally {
    bookingState.submitting = false;
  }
}

function renderReviewSummary(panel) {
  const summary = panel.querySelector("[data-review-summary]");
  if (!summary) return;
  const values = bookingState.values;
  const totals = calculateTotals();
  const addOns = values.quickCare ? "Vehicle Add-Ons" : "None";
  summary.innerHTML = `
    <strong>Final summary</strong>
    <dl class="review-summary-list">
      <div><dt>Customer</dt><dd>${escapeHtml([values.firstName, values.lastName].filter(Boolean).join(" ") || "Not entered")} | ${escapeHtml(values.customerPhone || "No phone")} | ${escapeHtml(values.customerEmail || "No email")}</dd></div>
      <div><dt>Service address</dt><dd>${escapeHtml([values.street, values.unit, values.city, values.state, values.zip].filter(Boolean).join(", ") || "Not entered")}</dd></div>
      <div><dt>Vehicle</dt><dd>${escapeHtml([values.vehicleYear, values.vehicleMake, values.vehicleModel, values.vehicleColor].filter(Boolean).join(" ") || "Not entered")}${values.licensePlate ? ` | Plate: ${escapeHtml(values.licensePlate)}` : ""}${values.fuelType ? ` | Fuel: ${escapeHtml(values.fuelType)}` : ""}</dd></div>
      <div><dt>Selected services</dt><dd>${escapeHtml(serviceLabel())}</dd></div>
      ${serviceNeedsFuel() ? `<div><dt>Fuel details</dt><dd>${escapeHtml(values.fuelType || "Not selected")}, ${escapeHtml(values.fuelPreference || "Not selected")} gallons selected. Authorization uses a ${totals.authorizationFuelGallons} gallon buffer.</dd></div>` : ""}
      ${totals.washPackage ? `<div><dt>Car wash package</dt><dd>${escapeHtml(totals.washPackage.label)}</dd></div>` : ""}
      ${serviceNeedsFuel() && bookingState.station.name ? `<div><dt>Gas station</dt><dd>${escapeHtml(bookingState.station.name)}${totals.stationSurcharge > 0 ? ` | +${formatMoney(totals.stationSurcharge)} distance surcharge` : " | Closest (no extra charge)"}</dd></div>` : ""}
      <div><dt>Add-ons</dt><dd>${escapeHtml(addOns)}</dd></div>
      <div><dt>Service date</dt><dd>${escapeHtml(values.serviceDate || "Not selected")}</dd></div>
      ${values.pickupTime ? `<div><dt>Earliest pickup time</dt><dd>${escapeHtml(values.pickupTime)}</dd></div>` : ""}
      <div><dt>Desired return time</dt><dd>${escapeHtml(values.returnTime || "Not selected")}</dd></div>
      <div><dt>Parking location</dt><dd>${escapeHtml(values.parking || "Not entered")}</dd></div>
      <div><dt>Key handoff details</dt><dd>${escapeHtml(values.handoff || "Not entered")}</dd></div>
      <div><dt>Special instructions</dt><dd>${escapeHtml(values.specialInstructions || "None")}</dd></div>
      <div><dt>Payment authorization total</dt><dd>${formatMoney(totals.estimatedTotal)}</dd></div>
    </dl>
    <p class="field-help">Your card is authorized now. You are not charged until service is complete, unless you cancel after the worker has received your keys or service has started. Choose Book request to send this booking to ShiftFuel, or Cancel authorization to release the hold and stop here.</p>
  `;
}

function getStepContent(step, flowName) {
  if (flowName === "returning" && step === "Vehicle") return stepCopy["Returning Vehicle"];
  return stepCopy[step];
}

function renderFlow(root) {
  const flowName = root.dataset.bookingFlow || "book-now";
  const steps = flows[flowName] || flows["book-now"];
  let unlockedIndex = 0;
  let openIndex = 0;

  const updateContinue = () => {
    const activePanel = root.querySelector(".booking-accordion-card.is-active");
    if (!activePanel) return;
    const continueButton = activePanel.querySelector("[data-continue]");
    if (continueButton) continueButton.disabled = !stepIsComplete(activePanel);
    const submitButton = activePanel.querySelector("[data-submit-booking]");
    if (submitButton && !bookingState.submitted) {
      submitButton.disabled = !Boolean(bookingState.values.reviewConfirmed);
    }
  };

  // Land the active step just below the sticky header. Matches the calc in the
  // merged scrollActiveStepIntoView() so the two scroll passes agree instead of
  // fighting (the fight caused the desktop "jump"). Works on both flows + sizes.
  const scrollToActive = () => {
    const active = root.querySelector(".booking-accordion-card.is-active");
    if (!active) return;
    const header = document.querySelector(".site-header");
    const headerHeight = header ? header.getBoundingClientRect().height : 0;
    const top = active.getBoundingClientRect().top + window.scrollY - headerHeight - 18;
    window.scrollTo({ top: Math.max(top, 0), behavior: "smooth" });
  };

  const render = () => {
    root.innerHTML = `
      ${renderProgressRail(steps, unlockedIndex, openIndex, flowName)}
      <div class="booking-layout">
        <div class="booking-cards">
          ${steps.map((step, index) => renderStepCard(step, index, flowName, unlockedIndex, openIndex)).join("")}
        </div>
        ${renderSummarySidebar(steps, flowName, unlockedIndex)}
      </div>
      <button type="button" class="mobile-booking-summary-bar" data-mobile-summary-jump>
        <span>Estimated total</span>
        <strong>${formatMoney(calculateTotals().discountedTotal || calculateTotals().estimatedTotal || 0)}</strong>
        <em>View summary</em>
      </button>
    `;

    steps.forEach((step, index) => {
      const panel = root.querySelector(`[data-step-index="${index}"]`);
      if (!panel) return;
      restorePanelValues(panel);
      renderReturningServiceArea(panel);
      renderReturningVehicles(panel);
      renderBookNowSavedAddresses(panel);
      renderBookNowSavedVehicles(panel);
      renderVehicleFields(panel);
      renderReturningVehicleFields(panel);
      renderServiceDetails(panel);
      renderScheduleFields(panel);
      renderPaymentSummary(panel);
      renderReviewSummary(panel);
    });

    updateBundleBadges();

    const activePanel = root.querySelector(".booking-accordion-card.is-active");
    if (activePanel?.dataset.currentStep === "Schedule" && bookingState.values.serviceDate) {
      loadBookedSlots().then(() => {
        renderScheduleFields(activePanel);
        updateContinue();
      });
    }
    updateContinue();
  };

  const goToStep = (index) => {
    openIndex = Math.max(0, Math.min(steps.length - 1, index));
    render();
    scrollToActive();
  };

  // mousedown fires before the street input's blur, so we can flag a pick in
  // progress and stop the blur fallback from running a redundant validation.
  root.addEventListener("mousedown", (event) => {
    if (event.target.closest("[data-suggest-id]")) flowState.addressPickInProgress = true;
  });

  root.addEventListener("input", (event) => {
    const panel = event.target.closest(".booking-accordion-card");
    if (!panel) return;

    if (event.target.matches("[data-phone]")) {
      event.target.value = formatPhone(event.target.value);
    }

    if (event.target.matches("[data-address-field]")) {
      bookingState.address.validated = false;
      setAddressStatus(panel, "warning", "Start typing your street address and pick it from the list to verify your service area.");
      // Hand-editing any field drops the Mapbox coordinates so we don't reuse a
      // stale pin for a typed address.
      bookingState.values.address_lat = "";
      bookingState.values.address_lon = "";
      // A new address means new nearby stations — drop the old selection.
      resetStationSelection();
      // Editing the address after it was validated re-locks every later step
      // until it is validated again. Materializes on the next render.
      const addrIdx = steps.indexOf("Address");
      if (addrIdx >= 0 && unlockedIndex > addrIdx) unlockedIndex = addrIdx;
    }

    if (event.target.matches("[data-address-autocomplete]")) {
      const listEl = panel.querySelector("[data-address-suggest]");
      const query = event.target.value.trim();
      window.clearTimeout(flowState.addressSuggestTimer);
      if (query.length < 3) {
        closeAddressSuggest(listEl);
      } else {
        flowState.addressSuggestTimer = window.setTimeout(() => fetchAddressSuggestions(query, listEl), 250);
      }
    }

    // Live-clear an inline validation message once the field becomes valid.
    if (event.target.classList?.contains("has-error")) showFieldMessage(event.target);

    if (event.target.matches("[data-returning-address-field]")) {
      bookingState.returning.stagedAddress = null;
      bookingState.returning.selectedAddressId = null;
      bookingState.returning.addressStatusType = "warning";
      bookingState.returning.addressStatus = "Please validate your service address before continuing.";
      const statusEl = panel.querySelector("[data-returning-address-status]");
      if (statusEl) {
        statusEl.dataset.status = "warning";
        statusEl.textContent = "Please validate your service address before continuing.";
      }
    }

    savePanelValues(panel);
    if (!["Payment", "Review"].includes(panel.dataset.currentStep)) invalidatePaymentAuthorization();
    updateContinue();
  });

  root.addEventListener("change", async (event) => {
    const panel = event.target.closest(".booking-accordion-card");
    if (!panel) return;
    savePanelValues(panel);
    if (!["Payment", "Review"].includes(panel.dataset.currentStep)) invalidatePaymentAuthorization();
    // Any change in Service or Service Details affects the price and/or which later
    // steps are valid — re-lock every step after this one so the customer re-flows
    // (and re-authorizes the new amount) instead of landing back on a stale Payment.
    // Covers service type, fuel type/range, wash package, chosen station, quick care.
    if (["Service", "Service Details"].includes(panel.dataset.currentStep)) {
      const stepIdx = Number(panel.dataset.stepIndex);
      if (Number.isFinite(stepIdx) && unlockedIndex > stepIdx) unlockedIndex = stepIdx;
    }
    if (event.target.matches('[name="serviceType"]')) {
      bookingState.values.fuelPreference = "";
      bookingState.values.washPackage = "";
      // A non-fuel service has no station surcharge; clear any prior pick.
      if (!serviceNeedsFuel()) resetStationSelection();
      // (downstream steps are re-locked by the Service/Service Details guard above)
      renderServiceDetails(panel);
    }
    if (event.target.matches('[name="serviceDate"]')) {
      bookingState.values.returnTime = "";
      await loadBookedSlots();
      renderScheduleFields(panel);
    }
    if (event.target.matches('[name="pickupTime"]')) {
      // Pickup is the earliest-start bound, so it changes which return times can
      // be staffed — reload the capacity-filtered slots and make them re-pick.
      bookingState.values.returnTime = "";
      await loadBookedSlots();
      renderScheduleFields(panel);
    }
    if (event.target.matches('[name="vehicleYear"], [name="vehicleMake"]')) {
      bookingState.values.vehicleModel = "";
      await loadVehicleModelOptions(
        panel.querySelector('[name="vehicleYear"]'),
        panel.querySelector('[name="vehicleMake"]'),
        panel.querySelector('[name="vehicleModel"]'),
        ""
      );
    }
    if (event.target.matches('[name="returningVehicleYear"], [name="returningVehicleMake"]')) {
      await loadVehicleModelOptions(
        panel.querySelector('[name="returningVehicleYear"]'),
        panel.querySelector('[name="returningVehicleMake"]'),
        panel.querySelector('[name="returningVehicleModel"]'),
        ""
      );
    }
    if (event.target.matches('[name="washPackage"]')) {
      renderWashIncludes(panel);
    }
    if (event.target.matches('[name="fuelPreference"], [name="fuelType"]')) {
      updateFuelBufferNote(panel);
    }
    if (event.target.matches('[name="gasStation"]')) {
      const picked = bookingState.station.options.find((s) => s.id === event.target.value);
      if (picked) {
        applyStationSelection(picked);
        renderStationList(panel);
        refreshTotalsUI(panel);
        // Picking a different station changes the total, so any prior payment
        // authorization is stale.
        invalidatePaymentAuthorization();
      }
    }
    updateContinue();
  });

  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-station-search-btn]")) {
      const panel = event.target.closest(".booking-accordion-card");
      if (panel) searchStations(panel);
    }
  });

  root.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target.matches("[data-station-search]")) {
      event.preventDefault();
      const panel = event.target.closest(".booking-accordion-card");
      if (panel) searchStations(panel);
    }
  });

  root.addEventListener("focusout", (event) => {
    const input = event.target;
    if (input?.matches?.("input[data-required], input[data-phone], input[data-email]")) {
      showFieldMessage(input);
    }
    if (input?.matches?.("[data-address-autocomplete]")) {
      const listEl = input.closest(".booking-accordion-card")?.querySelector("[data-address-suggest]");
      // Delay so a click on a suggestion lands before the list is removed.
      window.setTimeout(() => closeAddressSuggest(listEl), 150);
    }
    // When a hand-typed address loses focus, auto-verify it (no button needed).
    // Small delay lets a suggestion click set the in-progress guard first.
    if (input?.matches?.("[data-address-field]")) {
      const panel = input.closest(".booking-accordion-card");
      if (panel) {
        window.setTimeout(() => {
          maybeAutoValidateAddress(panel)?.then(() => updateContinue());
        }, 180);
      }
    }
  });

  root.addEventListener("booking-payment-authorized", () => {
    const activePanel = root.querySelector(".booking-accordion-card.is-active");
    if (activePanel) {
      renderPaymentSummary(activePanel);
      updateContinue();
    }
  });

  root.addEventListener("click", async (event) => {
    const summaryToggle = event.target.closest("[data-summary-toggle]");
    if (summaryToggle) {
      flowState.summaryMobileOpen = !flowState.summaryMobileOpen;
      const aside = summaryToggle.closest(".booking-summary-sidebar");
      if (aside) aside.classList.toggle("is-open", flowState.summaryMobileOpen);
      summaryToggle.setAttribute("aria-expanded", flowState.summaryMobileOpen ? "true" : "false");
      return;
    }

    const railStep = event.target.closest("[data-rail-step]");
    if (railStep && !railStep.disabled && Number(railStep.dataset.railStep) <= unlockedIndex) {
      goToStep(Number(railStep.dataset.railStep));
      return;
    }

    const editStep = event.target.closest("[data-edit-step]");
    if (editStep) {
      goToStep(Number(editStep.dataset.editStep));
      return;
    }

    const jumpReview = event.target.closest("[data-jump-review]");
    if (jumpReview && !jumpReview.disabled) {
      goToStep(steps.indexOf("Review"));
      return;
    }

    const stepHeader = event.target.closest("[data-step-header]");
    if (stepHeader && !stepHeader.disabled && Number(stepHeader.dataset.stepHeader) <= unlockedIndex) {
      const index = Number(stepHeader.dataset.stepHeader);
      if (index !== openIndex) goToStep(index);
      return;
    }

    // Promo code (lives in the always-visible summary sidebar, not a step panel).
    const promoApply = event.target.closest("[data-promo-apply]");
    if (promoApply) {
      const wrap = promoApply.closest(".summary-promo");
      const input = wrap?.querySelector("[data-promo-input]");
      const msg = wrap?.querySelector("[data-promo-msg]");
      const code = String(input?.value || "").trim();
      const v = bookingState.values;
      if (msg) msg.textContent = "";
      if (!code) { if (msg) msg.textContent = "Enter a promo code."; return; }
      if (!v.customerPhone || !v.customerEmail) {
        if (msg) msg.textContent = "Add your phone and email first, then apply your code.";
        return;
      }
      const t = calculateTotals();
      // The box is always visible, so guard the case where there's no order to
      // discount yet — friendlier than the server's "doesn't apply" reply.
      if (t.subtotal <= 0) {
        if (msg) msg.textContent = "Pick a service first to apply a code.";
        return;
      }
      promoApply.disabled = true; promoApply.textContent = "Checking…";
      try {
        const r = await fetch("/api/promos", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "validate", code, phone: v.customerPhone, email: v.customerEmail,
            fuel_service: t.fuelFee, wash_service: t.washFee, inspection: t.quickFee,
            wash_price: t.washAmount, order_total: t.subtotal,
            service_type: bookingState.values.serviceType || "",
            is_account: Boolean(getCustomerAccountSession()),
            customer_id: bookingState.returning.requests[0]?.customer_id || "",
          }),
        });
        const data = await r.json().catch(() => ({}));
        if (data && data.valid) {
          bookingState.promo = { code: data.code, discount_type: data.discount_type, discount_value: Number(data.discount_value) || 0, applies_to: data.applies_to || "service_fees" };
          bookingState.pendingPromoCode = "";
          render();
        } else {
          if (msg) msg.textContent = (data && data.reason) || "That code isn't valid.";
          promoApply.disabled = false; promoApply.textContent = "Apply";
        }
      } catch (_) {
        if (msg) msg.textContent = "Could not check that code right now. Try again.";
        promoApply.disabled = false; promoApply.textContent = "Apply";
      }
      return;
    }
    if (event.target.closest("[data-promo-remove]")) {
      bookingState.promo = { code: "", discount_type: "", discount_value: 0, applies_to: "" };
      render();
      return;
    }

    if (event.target.closest("[data-mobile-summary-jump]")) {
      const summary = root.querySelector(".booking-summary-sidebar");
      if (summary) {
        summary.classList.add("is-open");
        summary.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return;
    }

    const panel = event.target.closest(".booking-accordion-card");
    if (!panel) return;

    const suggestItem = event.target.closest("[data-suggest-id]");
    if (suggestItem) {
      await selectAddressSuggestion(panel, suggestItem.dataset.suggestId);
      updateContinue();
      return;
    }

    if (event.target.closest("[data-new-booking]")) {
      window.location.reload();
      return;
    }

    const dismissAccountPrompt = event.target.closest("[data-dismiss-account-prompt]");
    if (dismissAccountPrompt) {
      dismissAccountPrompt.closest("[data-post-booking-account-prompt]")?.remove();
      return;
    }

    if (event.target.closest("[data-verify-returning]")) {
      await verifyReturningCustomer(panel);
      savePanelValues(panel);
      updateContinue();
      return;
    }

    if (event.target.closest("[data-authorize-payment]")) {
      await authorizePayment(panel);
      updateContinue();
      return;
    }

    if (event.target.closest("[data-submit-booking]")) {
      await submitBooking(panel);
      updateContinue();
      return;
    }

    if (event.target.closest("[data-cancel-authorization]")) {
      const canceled = await cancelPaymentAuthorization(panel);
      if (canceled) {
        unlockedIndex = Math.min(unlockedIndex, steps.indexOf("Payment"));
        goToStep(steps.indexOf("Payment"));
      } else {
        updateContinue();
      }
      return;
    }

    if (event.target.closest("[data-add-returning-address]")) {
      bookingState.returning.addressMode = "add";
      bookingState.returning.addressStatusType = "warning";
      bookingState.returning.addressStatus = "Please validate your service address before continuing.";
      renderReturningServiceArea(panel);
      updateContinue();
      return;
    }

    const editAddress = event.target.closest("[data-edit-returning-address]");
    if (editAddress) {
      bookingState.returning.addressMode = editAddress.dataset.editReturningAddress;
      bookingState.returning.addressStatusType = "warning";
      bookingState.returning.addressStatus = "Please validate your service address before continuing.";
      renderReturningServiceArea(panel);
      updateContinue();
      return;
    }

    const selectAddress = event.target.closest("[data-select-returning-address]");
    if (selectAddress) {
      const address = bookingState.returning.addresses.find((item) => item.id === selectAddress.dataset.selectReturningAddress);
      if (address) {
        applySelectedAddress(address);
        renderBookNowSavedAddresses(panel);
        if (panel.dataset.currentStep === "Address") {
          // Book Now: re-check the saved address against the current service area.
          renderReturningServiceArea(panel);
          restorePanelValues(panel);
          await validateAddress(panel);
        } else {
          // Returning flow: same service-area re-check (renders internally).
          await recheckReturningSavedAddress(panel, address);
        }
        scrollToContinue(panel);
      }
      updateContinue();
      return;
    }

    if (event.target.closest("[data-validate-returning-address]")) {
      await validateReturningAddress(panel);
      renderReturningServiceArea(panel);
      updateContinue();
      return;
    }

    if (event.target.closest("[data-add-returning-vehicle]")) {
      bookingState.returning.vehicleMode = "add";
      renderReturningVehicles(panel);
      updateContinue();
      return;
    }

    const selectVehicle = event.target.closest("[data-select-returning-vehicle]");
    if (selectVehicle) {
      const vehicle = bookingState.returning.vehicles.find((item) => item.id === selectVehicle.dataset.selectReturningVehicle);
      if (vehicle) {
        applySelectedVehicle(vehicle);
        renderReturningVehicles(panel);
        renderBookNowSavedVehicles(panel);
        // Book Now: fill the typed vehicle fields from the saved vehicle. Await
        // the async model load so Continue enables once the fields are populated.
        if (panel.dataset.currentStep === "Vehicle") {
          restorePanelValues(panel);
          await renderVehicleFields(panel);
        }
        scrollToContinue(panel);
      }
      updateContinue();
      return;
    }

    const deleteVehicle = event.target.closest("[data-delete-returning-vehicle]");
    if (deleteVehicle) {
      await deleteReturningVehicle(deleteVehicle.dataset.deleteReturningVehicle);
      renderReturningVehicles(panel);
      updateContinue();
      return;
    }

    if (event.target.closest("[data-save-returning-vehicle]")) {
      if (saveReturningVehicle(panel)) {
        bookingState.returning.vehicleMode = "";
        renderReturningVehicles(panel);
      }
      updateContinue();
      return;
    }

    if (event.target.closest("[data-back]")) {
      savePanelValues(panel);
      goToStep(openIndex - 1);
      return;
    }

    if (event.target.closest("[data-continue]")) {
      savePanelValues(panel);
      if (!stepIsComplete(panel)) return;
      // Book Now: after the Customer step, check (once) whether this is a
      // returning customer and pre-load their saved addresses/vehicles.
      if (panel.dataset.currentStep === "Customer" && !bookingState.returning.detectedOnBookNow) {
        const btn = event.target.closest("[data-continue]");
        if (btn) { btn.disabled = true; btn.textContent = "Checking…"; }
        await detectReturningCustomer();
        if (btn) { btn.disabled = false; btn.textContent = "Continue"; }
      }
      unlockedIndex = Math.max(unlockedIndex, openIndex + 1);
      goToStep(unlockedIndex);
    }
  });

  render();
}

// Preselect a service when the customer arrives from a "Book This Service" card
// on the landing page (e.g. /book?service=fuel). Vehicle Add-Ons are an
// add-on, so it pre-checks the add-on and explains it must attach to a service.
function applyPreselectedService() {
  let requested = "";
  try {
    const params = new URLSearchParams(window.location.search);
    requested = params.get("service") || "";
    const promo = params.get("promo") || "";
    if (promo) bookingState.pendingPromoCode = promo.trim().toUpperCase().slice(0, 32);
  } catch (_) {
    requested = "";
  }
  if (!requested) return;

  if (["fuel", "wash", "fuel_wash"].includes(requested)) {
    bookingState.values.serviceType = requested;
  } else if (requested === "quick-care") {
    bookingState.values.quickCare = true;
    if (stepCopy.Service) {
      stepCopy.Service.intro =
        "Vehicle Add-Ons are optional. Choose a fuel or car wash service below to attach them to.";
    }
  }
}

function getCustomerAccountSession() {
  try {
    const session = JSON.parse(localStorage.getItem("shiftfuel_customer_account") || "null");
    if (!session?.phone || !session?.email) return null;
    return {
      phone: String(session.phone || "").trim(),
      email: String(session.email || "").trim().toLowerCase(),
      name: String(session.name || "").trim(),
    };
  } catch (_) {
    return null;
  }
}

function applyCustomerAccountSession() {
  const session = getCustomerAccountSession();
  if (!session) return;

  const phone = formatPhone(session.phone);
  const email = String(session.email || "").trim().toLowerCase();
  const nameParts = String(session.name || "").trim().split(/\s+/).filter(Boolean);

  bookingState.values.customerPhone = bookingState.values.customerPhone || phone;
  bookingState.values.customerEmail = bookingState.values.customerEmail || email;
  bookingState.values.verifyPhone = bookingState.values.verifyPhone || phone;
  bookingState.values.verifyEmail = bookingState.values.verifyEmail || email;
  if (nameParts.length) {
    bookingState.values.firstName = bookingState.values.firstName || nameParts[0];
    bookingState.values.lastName = bookingState.values.lastName || nameParts.slice(1).join(" ");
  }
}

async function autoVerifyReturningCustomer() {
  if (!flowRoot || flowRoot.dataset.bookingFlow !== "returning") return;
  const session = getCustomerAccountSession();
  if (!session) return;
  const panel = flowRoot.querySelector('[data-step-index="0"]');
  if (!panel) return;
  if (!bookingState.values.verifyPhone && !bookingState.values.verifyEmail) return;

  await verifyReturningCustomer(panel);
}

async function initBookingFlow() {
  if (!flowRoot) return;
  await livePricingReady;
  applyCustomerAccountSession();
  applyPreselectedService();
  bindBookingFlowAnchorScroll();
  renderFlow(flowRoot);
  scrollBookingFlowStartAfterRender();
  autoVerifyReturningCustomer().catch((error) => {
    console.warn("Returning customer auto-verify failed:", error);
  });
}

initBookingFlow();

// ============================================================
// merged from booking-submit-hardening.js
// ============================================================
// Hard timeout ownership for the final Book Request click.
(() => {
  if (!document.body?.classList.contains('booking-page') && !document.body?.classList.contains('returning-page')) return;
  const PREFIX = '[booking-submit-hardening]';
  const TIMEOUT_MS = 12000;
  let locked = false;
  const log = (m, d) => d === undefined ? console.log(PREFIX, m) : console.log(PREFIX, m, d);
  const err = (m, e) => console.error(PREFIX, m, e);

  function setStatus(panel, type, message) {
    const status = panel?.querySelector('[data-submit-status]');
    if (!status) return;
    status.dataset.status = type || '';
    status.textContent = message || '';
    status.hidden = false;
  }

  function unlock(panel, submitted = false) {
    log('Page unlocked');
    locked = false;
    try { bookingState.submitting = false; } catch (_) {}
    [document.documentElement, document.body, document.querySelector('[data-booking-flow]'), document.querySelector('.booking-flow-shell')].forEach((el) => {
      if (!el) return;
      el.style.pointerEvents = '';
      el.style.overflow = '';
      el.removeAttribute('aria-busy');
      el.classList.remove('is-submitting', 'is-loading', 'booking-locked', 'page-locked', 'disabled');
    });
    document.querySelectorAll('.booking-submit-overlay, .booking-loading-overlay, .loading-overlay, .page-loading-overlay, .blocking-overlay, .modal-backdrop').forEach((el) => el.remove());
    const submit = panel?.querySelector('[data-submit-booking]') || document.querySelector('[data-submit-booking]');
    const cancel = panel?.querySelector('[data-cancel-authorization]') || document.querySelector('[data-cancel-authorization]');
    if (submit && !submitted) {
      submit.disabled = false;
      submit.hidden = false;
      submit.textContent = 'Book request';
      submit.removeAttribute('aria-busy');
    }
    if (cancel && !submitted) {
      cancel.disabled = false;
      cancel.hidden = false;
      cancel.textContent = 'Cancel authorization';
      cancel.removeAttribute('aria-busy');
    }
  }

  function publicNumber(id) {
    try { return publicRequestNumber(id); } catch (_) { return `SF-${String(id || '').slice(0, 8).toUpperCase()}`; }
  }

  function showSuccess(panel, data) {
    const number = publicNumber(data.id);
    bookingState.submitted = true;
    bookingState.submittedRequestNumber = number;
    const fields = panel.querySelector('.booking-step-fields');
    if (fields) {
      fields.innerHTML = `<div class="submission-success"><h3>Request received.</h3><p>Your request number is: <strong>${escapeHtml(number)}</strong></p><p>Use Track My Vehicle to follow your request.</p><div class="admin-button-row"><button class="button primary" type="button" data-new-booking>Submit a new request</button><a class="button secondary" href="/track">Track My Vehicle</a></div>${postBookingAccountPromptHtml()}</div>`;
    }
    setStatus(panel, 'success', `Request received. Your request number is ${number}.`);
    const actions = panel.querySelector('.booking-step-actions');
    if (actions) actions.hidden = true;
    panel.querySelectorAll('[data-submit-booking], [data-cancel-authorization]').forEach((button) => { button.hidden = true; });
    // Scroll the Review & Submit step back into view (below the sticky header) so
    // the customer clearly sees it went through — the "Request received"
    // confirmation + their request number. rAF lets the replaced content settle
    // before we measure. (The older submit path does the same at the call site.)
    requestAnimationFrame(() => {
      const header = document.querySelector('.site-header');
      const headerHeight = header ? header.getBoundingClientRect().height : 0;
      const top = panel.getBoundingClientRect().top + window.scrollY - headerHeight - 18;
      window.scrollTo({ top: Math.max(top, 0), behavior: 'smooth' });
    });
  }

  function makePayload() {
    // Prefer the more complete frozen-quote payload (full fee breakdown frozen
    // at authorization time, not just the total) when it's available.
    if (typeof window.freezeAuthorizedQuote === 'function' && typeof window.makePayloadFromFrozenQuote === 'function') {
      window.freezeAuthorizedQuote();
      const payload = window.makePayloadFromFrozenQuote();
      log('Frozen quote total loaded', { amountCents: payload.amount_cents, total: payload.estimated_total });
      log('Stripe authorization/payment intent loaded', { paymentIntentId: payload.payment_intent_id, amountCents: payload.amount_cents });
      return payload;
    }

    const totals = calculateTotals();
    const payload = buildBookingPayload();
    const amountCents = Math.round(Number(bookingState.payment.authorizedAmountCents || totals.estimatedTotal * 100));
    payload.amount_cents = amountCents;
    payload.estimated_total = amountCents / 100;
    payload.authorized_amount = amountCents / 100;
    payload.rounded_customer_total = amountCents / 100;
    payload.booking_idempotency_key = bookingState.payment.paymentIntentId || payload.payment_intent_id || '';
    log('Frozen quote total loaded', { amountCents, total: amountCents / 100 });
    log('Stripe authorization/payment intent loaded', { paymentIntentId: payload.payment_intent_id, amountCents });
    return payload;
  }

  async function submit(panel, button) {
    log('Book request clicked');
    if (locked || bookingState.submitting || bookingState.submitted) return;
    let submitted = false;
    try {
      locked = true;
      bookingState.submitting = true;
      unlock(panel, false);
      locked = true;
      bookingState.submitting = true;
      savePanelValues(panel);
      log('Validation started');
      // Advance bookings have a saved card (no hold) instead of an authorized PI.
      const isScheduled = Boolean(bookingState.payment.cardSaved && bookingState.payment.setupIntentId);
      if (!isScheduled && (!bookingState.payment.authorized || !bookingState.payment.paymentIntentId)) {
        setStatus(panel, 'error', 'Please authorize payment before submitting.');
        return;
      }
      if (!bookingState.values.reviewConfirmed) {
        setStatus(panel, 'error', 'Please confirm the booking information before submitting.');
        return;
      }
      log('Validation passed');
      const idemKey = bookingState.payment.paymentIntentId || bookingState.payment.setupIntentId;
      const stored = sessionStorage.getItem(`shiftfuel_booking_request_${idemKey}`);
      if (stored) {
        const data = JSON.parse(stored);
        if (data?.id) { showSuccess(panel, data); submitted = true; return; }
      }
      button.disabled = true;
      button.textContent = 'Submitting...';
      setStatus(panel, 'warning', 'Submitting booking...');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      log('Supabase insert started');
      let response;
      if (isScheduled) {
        // Card saved, no hold yet — create the request in payment_scheduled
        // state; the daily cron places the real hold ~2 days before service.
        const totals = calculateTotals();
        const amountCents = Math.round(Number(bookingState.payment.authorizedAmountCents || totals.estimatedTotal * 100));
        const schedPayload = buildBookingPayload();
        schedPayload.action = 'create_scheduled_booking';
        schedPayload.setup_intent_id = bookingState.payment.setupIntentId;
        schedPayload.amount_cents = amountCents;
        schedPayload.estimated_total = amountCents / 100;
        response = await Promise.race([
          fetch('/api/payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(schedPayload), signal: controller.signal }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Booking is taking longer than expected.')), TIMEOUT_MS)),
        ]).finally(() => clearTimeout(timer));
      } else {
        const payload = makePayload();
        response = await Promise.race([
          fetch('/api/create-authorized-booking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Booking is taking longer than expected.')), TIMEOUT_MS)),
        ]).finally(() => clearTimeout(timer));
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.id) throw new Error(data.error || 'Could not submit booking.');
      log('Supabase insert succeeded', data);
      sessionStorage.setItem(`shiftfuel_booking_request_${idemKey}`, JSON.stringify(data));
      log('Request number created', { requestNumber: publicNumber(data.id), requestId: data.id });
      showSuccess(panel, data);
      submitted = true;
      log('Submit finished');
    } catch (error) {
      err('Submit failed', error);
      const timeout = error?.name === 'AbortError' || /longer than expected|timed out/i.test(error?.message || '');
      setStatus(panel, 'error', timeout
        ? 'Booking is taking longer than expected. Please try again or cancel the authorization. Your card has not been charged.'
        : `Your payment authorization was approved, but the request could not be created. Your card has not been charged. You can try again or cancel the authorization. ${error.message || ''}`.trim());
    } finally {
      unlock(panel, submitted);
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-submit-booking]');
    if (!button) return;
    const panel = button.closest('.booking-accordion-card');
    if (!panel) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    submit(panel, button);
  }, true);
  window.unlockBookingPage = unlock;
})();

// ============================================================
// Abandoned-authorization guard
// ============================================================
// If the customer authorizes their card on the Review step but leaves the page
// before clicking "Book request", a Stripe hold is left on their card with no
// booking behind it. The auto-reverse cron cannot clean it up (it only looks at
// service_requests rows, and no row was ever created). So we:
//   1. Warn before unload while a hold is pending (catches accidental exits).
//   2. Best-effort void the hold on the way out via sendBeacon (immediate
//      release instead of waiting ~7 days for Stripe's auth to expire).
(() => {
  function hasPendingHold() {
    const p = bookingState.payment || {};
    return Boolean(p.authorized && p.paymentIntentId)
      && !bookingState.submitted
      && !bookingState.submitting;
  }

  window.addEventListener("beforeunload", (event) => {
    if (!hasPendingHold()) return;
    // Triggers the browser's native "Leave site?" confirmation.
    event.preventDefault();
    event.returnValue = "";
    return "";
  });

  // pagehide fires once the user actually commits to leaving (close/navigate).
  // Fire a keepalive beacon to release the hold. Guard against double-cancel by
  // clearing the pending flag immediately.
  window.addEventListener("pagehide", () => {
    if (!hasPendingHold()) return;
    const p = bookingState.payment;
    const payload = JSON.stringify({
      action: "cancel_authorization",
      payment_intent_id: p.paymentIntentId,
      client_secret: p.clientSecret || "",
    });
    p.authorized = false; // prevent a second beacon if pagehide fires twice
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/payments", new Blob([payload], { type: "application/json" }));
      } else {
        fetch("/api/payments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        });
      }
    } catch (_) { /* best-effort only */ }
  });
})();

// ============================================================
// merged from booking-flow-ui-fixes.js
// ============================================================
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

// ============================================================
// merged from booking-price-lock-fix.js
// ============================================================
// Freeze the authorized booking quote so admin price edits cannot break checkout after Stripe approval.
// Also hardens final Book Request submission so the page can never stay locked after failure.
(() => {
  if (!document.body?.classList.contains('booking-page') && !document.body?.classList.contains('returning-page')) return;

  const DEBUG_PREFIX = '[booking-submit]';

  function debug(message, data) {
    if (data !== undefined) console.log(DEBUG_PREFIX, message, data);
    else console.log(DEBUG_PREFIX, message);
  }

  function debugError(message, error) {
    console.error(DEBUG_PREFIX, message, error);
  }

  function money(value) {
    try {
      if (typeof formatMoney === 'function') return formatMoney(value);
    } catch (_) {}
    return `$${(Number(value) || 0).toFixed(2)}`;
  }

  function cloneTotals(totals) {
    return {
      ...totals,
      washPackage: totals?.washPackage ? { ...totals.washPackage } : null,
      frozenAt: new Date().toISOString(),
    };
  }

  function currentQuoteTotals() {
    try {
      if (bookingState?.payment?.authorized && bookingState.payment.authorizedQuote) return bookingState.payment.authorizedQuote;
    } catch (_) {}
    return typeof calculateTotals === 'function' ? calculateTotals() : null;
  }

  function ensurePaymentShape() {
    if (typeof bookingState === 'undefined') return;
    if (!bookingState.payment) bookingState.payment = {};
    if (!Object.prototype.hasOwnProperty.call(bookingState.payment, 'authorizedQuote')) bookingState.payment.authorizedQuote = null;
  }

  function freezeAuthorizedQuote() {
    ensurePaymentShape();
    if (typeof bookingState === 'undefined' || typeof calculateTotals !== 'function') return;
    if (!bookingState.payment.authorized) return;
    const totals = cloneTotals(calculateTotals());
    const cents = Number(bookingState.payment.authorizedAmountCents || Math.round(totals.estimatedTotal * 100));
    totals.estimatedTotal = Math.round(cents) / 100;
    bookingState.payment.authorizedQuote = totals;
    debug('Frozen quote total loaded', { amountCents: cents, total: totals.estimatedTotal });
  }

  function clearFrozenQuoteWhenUnauthorized() {
    try {
      if (!bookingState.payment.authorized) bookingState.payment.authorizedQuote = null;
    } catch (_) {}
  }

  function makePayloadFromFrozenQuote() {
    const payload = buildBookingPayload();
    const totals = currentQuoteTotals();
    const amountCents = Math.round(Number(bookingState.payment.authorizedAmountCents || totals.estimatedTotal * 100));

    payload.amount_cents = amountCents;
    payload.estimated_total = amountCents / 100;
    payload.authorized_amount = amountCents / 100;
    payload.rounded_customer_total = amountCents / 100;
    payload.booking_idempotency_key = bookingState.payment.paymentIntentId || payload.payment_intent_id || '';

    if (totals) {
      payload.estimated_gallons = totals.fuelGallons;
      payload.selected_fuel_gallons = totals.selectedFuelGallons;
      payload.authorization_fuel_gallons = totals.authorizationFuelGallons;
      payload.estimated_fuel_amount = totals.fuelEstimate;
      payload.fuel_convenience_fee = totals.fuelFee;
      payload.wash_fee = totals.washAmount;
      payload.wash_package_label = totals.washPackage?.label || payload.wash_package_label || '';
      payload.wash_convenience_fee = totals.washFee;
      payload.quick_inspection_fee = totals.quickFee;
      payload.service_fee = Number(totals.fuelFee || 0) + Number(totals.washFee || 0);
      payload.base_fuel_service_fee = totals.fuelBaseFee;
      payload.base_car_wash_service_fee = totals.washBaseFee;
      payload.base_inspection_fee = totals.quickFee;
      payload.payment_operating_recovery_amount = totals.recovery;
      payload.displayed_fuel_service_fee = totals.fuelFee;
      payload.displayed_car_wash_service_fee = totals.washFee;
      payload.displayed_inspection_fee = totals.quickFee;
      payload.net_target_amount = totals.netTarget;
      payload.gross_total_before_rounding = totals.grossBeforeRounding;
      payload.notes = [payload.notes || '', `[client_quote_frozen ${totals.frozenAt || new Date().toISOString()}] Customer authorized ${money(amountCents / 100)}.`].filter(Boolean).join('\n');
    }

    return payload;
  }

  function setSubmitStatus(panel, type, message) {
    const status = panel?.querySelector('[data-submit-status]');
    if (status) {
      status.dataset.status = type || '';
      status.textContent = message || '';
      status.hidden = false;
    }
  }

  function restoreClickablePage() {
    [document.documentElement, document.body, document.querySelector('[data-booking-flow]'), document.querySelector('.booking-flow-shell')].forEach((element) => {
      if (!element) return;
      element.style.pointerEvents = '';
      element.classList.remove('is-submitting', 'is-loading', 'booking-locked', 'page-locked', 'disabled');
      element.removeAttribute('aria-busy');
      if (element === document.documentElement || element === document.body) element.style.overflow = '';
    });

    document.querySelectorAll('.booking-submit-overlay, .booking-loading-overlay, .loading-overlay, .page-loading-overlay, .blocking-overlay, .modal-backdrop').forEach((overlay) => {
      overlay.remove();
    });
  }

  function unlockBookingPage(panel, options = {}) {
    debug('Page unlocked');
    try {
      if (typeof bookingState !== 'undefined') bookingState.submitting = false;
    } catch (_) {}

    restoreClickablePage();

    const submitted = Boolean(options.submitted || (typeof bookingState !== 'undefined' && bookingState.submitted));
    const submitButton = panel?.querySelector('[data-submit-booking]') || document.querySelector('[data-submit-booking]');
    const cancelButton = panel?.querySelector('[data-cancel-authorization]') || document.querySelector('[data-cancel-authorization]');

    if (submitButton && !submitted) {
      submitButton.disabled = false;
      submitButton.hidden = false;
      submitButton.textContent = 'Book request';
      submitButton.removeAttribute('aria-busy');
    }
    if (cancelButton && !submitted) {
      cancelButton.disabled = false;
      cancelButton.hidden = false;
      cancelButton.textContent = 'Cancel authorization';
      cancelButton.removeAttribute('aria-busy');
    }

    panel?.querySelectorAll('fieldset').forEach((fieldset) => { fieldset.disabled = false; });
  }

  let updatingFrozenQuoteCopy = false;
  function updateFrozenQuoteCopy(root = document) {
    // Re-entrancy guard: this function writes textContent, which is itself a DOM
    // mutation. The MutationObserver below would otherwise re-invoke us on our own
    // writes and spin into an infinite loop, locking up the page on the Review step.
    if (updatingFrozenQuoteCopy) return;
    let quote = null;
    try { quote = bookingState.payment.authorizedQuote; } catch (_) {}
    if (!quote) return;

    updatingFrozenQuoteCopy = true;
    try {
      const frozenTotal = money(quote.estimatedTotal);
      root.querySelectorAll('[data-review-summary] .review-summary-list div, [data-payment-summary] .review-summary-list div').forEach((row) => {
        const label = row.querySelector('dt')?.textContent?.trim().toLowerCase() || '';
        const value = row.querySelector('dd');
        if (!value) return;
        // Only write when the value actually differs, so we don't generate
        // needless mutations that keep the observer firing.
        if ((label === 'estimated total' || label === 'payment authorization total') && value.textContent !== frozenTotal) {
          value.textContent = frozenTotal;
        }
      });
      const sidebarTotal = root.querySelector('.summary-total-amount');
      if (sidebarTotal && sidebarTotal.textContent !== frozenTotal) sidebarTotal.textContent = frozenTotal;
    } finally {
      updatingFrozenQuoteCopy = false;
    }
  }

  function start() {
    ensurePaymentShape();

    const originalInvalidate = typeof invalidatePaymentAuthorization === 'function' ? invalidatePaymentAuthorization : null;
    if (originalInvalidate && !originalInvalidate.__quoteFixPatched) {
      const patched = function patchedInvalidatePaymentAuthorization(...args) {
        const result = originalInvalidate.apply(this, args);
        clearFrozenQuoteWhenUnauthorized();
        return result;
      };
      patched.__quoteFixPatched = true;
      invalidatePaymentAuthorization = patched;
    }

    document.addEventListener('booking-payment-authorized', () => {
      debug('Payment authorization event received');
      freezeAuthorizedQuote();
      setTimeout(() => updateFrozenQuoteCopy(document), 0);
    });

    window.addEventListener('unhandledrejection', (event) => {
      debugError('Unhandled promise rejection caught', event.reason);
      const panel = document.querySelector('.booking-accordion-card.is-active');
      if (panel?.querySelector('[data-submit-booking]')) {
        setSubmitStatus(panel, 'error', 'Something went wrong while booking. Your card has not been charged. Please try again or cancel the authorization.');
        unlockBookingPage(panel);
      }
    });

    const root = document.querySelector('[data-booking-flow]');
    if (root) {
      new MutationObserver(() => updateFrozenQuoteCopy(root)).observe(root, { childList: true, subtree: true });
    }
  }

  window.unlockBookingPage = unlockBookingPage;
  window.freezeAuthorizedQuote = freezeAuthorizedQuote;
  window.makePayloadFromFrozenQuote = makePayloadFromFrozenQuote;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
