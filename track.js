const trackForm = document.querySelector("#track-form");
const trackingId = document.querySelector("#tracking-id");
const trackingPhone = document.querySelector("#tracking-phone");
const trackingEmail = document.querySelector("#tracking-email");
const trackMessage = document.querySelector("#track-message");
const trackingResult = document.querySelector("#tracking-result");

const shiftFuelDb = window.ShiftFuelSupabase;
const TRACK_LOCK_KEY = "shiftfuel_track_locked_until";
const TRACK_ATTEMPT_KEY = "shiftfuel_track_failed_attempts";
let verifiedTrackingContact = { phone: "", email: "" };

const terminalStatuses = ["complete", "denied", "customer_canceled", "unable_to_complete", "auto_reversed"];
const closedStatuses   = ["denied", "customer_canceled", "unable_to_complete", "auto_reversed"];

function initPhotoLightbox() {
  if (document.getElementById('photo-lightbox')) return;
  const el = document.createElement('div');
  el.id = 'photo-lightbox';
  el.hidden = true;
  el.innerHTML = `
    <div class="photo-lightbox-backdrop"></div>
    <div class="photo-lightbox-dialog" role="dialog" aria-modal="true" aria-label="Photo">
      <button class="photo-lightbox-close" type="button" aria-label="Close">&times;</button>
      <img class="photo-lightbox-img" src="" alt="">
      <p class="photo-lightbox-caption"></p>
    </div>
  `;
  document.body.appendChild(el);
  el.querySelector('.photo-lightbox-backdrop').addEventListener('click', closePhotoLightbox);
  el.querySelector('.photo-lightbox-close').addEventListener('click', closePhotoLightbox);
}

function openPhotoLightbox(src, label) {
  const el = document.getElementById('photo-lightbox');
  if (!el) return;
  const img = el.querySelector('.photo-lightbox-img');
  img.src = src;
  img.alt = label;
  el.querySelector('.photo-lightbox-caption').textContent = label;
  el.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closePhotoLightbox() {
  const el = document.getElementById('photo-lightbox');
  if (!el) return;
  el.hidden = true;
  el.querySelector('.photo-lightbox-img').src = '';
  document.body.style.overflow = '';
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePhotoLightbox();
});

document.addEventListener('click', (e) => {
  const card = e.target.closest('[data-lightbox-src]');
  if (!card) return;
  openPhotoLightbox(card.dataset.lightboxSrc, card.dataset.lightboxLabel || '');
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const card = e.target.closest('[data-lightbox-src]');
  if (!card) return;
  e.preventDefault();
  openPhotoLightbox(card.dataset.lightboxSrc, card.dataset.lightboxLabel || '');
});

initPhotoLightbox();

const statusLabels = {
  request_received: "Request received",
  accepted: "Accepted",
  key_received: "Key received",
  pickup_vehicle_photo_uploaded: "Pickup vehicle photo uploaded",
  pickup_odometer_photo_uploaded: "Pickup odometer photo uploaded",
  vehicle_picked_up: "Vehicle picked up",
  fueling_in_progress: "Fueling in progress",
  fueling_complete: "Fueling complete",
  fuel_receipt_uploaded: "Fuel receipt uploaded",
  car_wash_in_progress: "Car wash in progress",
  car_wash_complete: "Car wash complete",
  car_wash_after_fuel_in_progress: "Car wash in progress",
  wash_receipt_uploaded: "Wash receipt uploaded",
  wash_receipt_after_fuel_uploaded: "Wash receipt uploaded",
  fueling_after_wash_in_progress: "Fueling in progress",
  fuel_receipt_after_wash_uploaded: "Fuel receipt uploaded",
  receipts_recorded: "Receipts recorded",
  returned_location_pending: "Vehicle returned",
  return_location_recorded: "Return location recorded",
  return_photos_needed: "Return photos needed",
  dropoff_vehicle_photo_uploaded: "Drop-off vehicle photo uploaded",
  dropoff_odometer_photo_uploaded: "Drop-off odometer photo uploaded",
  vehicle_returned: "Vehicle returned",
  inspection_needed: "Vehicle inspection needed",
  inspection_recorded: "Vehicle inspection recorded",
  complete: "Complete",
  denied: "Denied",
  customer_canceled: "Canceled by customer",
  unable_to_complete: "Unable to complete",
  pending_customer_info: "Complete your booking",
};

const statusSteps = [
  { key: "request_received", label: "Request received" },
  { key: "accepted", label: "Accepted" },
  { key: "key_received", label: "Key received" },
  { key: "vehicle_picked_up", label: "Vehicle picked up" },
  { key: "fueling_in_progress", label: "Fueling in progress" },
  { key: "vehicle_returned", label: "Vehicle returned" },
  { key: "complete", label: "Complete" },
];

function cleanPhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function trackLockedUntil() {
  return Number(localStorage.getItem(TRACK_LOCK_KEY) || 0);
}

function clearTrackAttempts() {
  localStorage.removeItem(TRACK_ATTEMPT_KEY);
  localStorage.removeItem(TRACK_LOCK_KEY);
}

function isMissingRpcError(error) {
  const message = String(error?.message || "").toLowerCase();
  return ["PGRST202", "PGRST204", "42883"].includes(error?.code)
    || message.includes("could not find the function")
    || message.includes("function") && message.includes("does not exist");
}

function recordTrackFailedAttempt() {
  const attempts = Number(localStorage.getItem(TRACK_ATTEMPT_KEY) || 0) + 1;
  localStorage.setItem(TRACK_ATTEMPT_KEY, String(attempts));

  if (attempts >= 8) {
    localStorage.setItem(TRACK_LOCK_KEY, String(Date.now() + 5 * 60 * 1000));
    localStorage.setItem(TRACK_ATTEMPT_KEY, "0");
    trackMessage.textContent = "Too many lookup attempts. Tracking is locked for 5 minutes.";
    return;
  }

  trackMessage.textContent = `No request found. ${8 - attempts} lookup attempt${8 - attempts === 1 ? "" : "s"} left before a temporary lock.`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

function hoursSince(value) {
  const time = new Date(value || Date.now()).getTime();
  return (Date.now() - time) / (1000 * 60 * 60);
}

function canCustomerCancel(request) {
  return !terminalStatuses.includes(request.status);
}

function cancellationReasonForDisplay(request) {
  const reason = String(request.cancellation_reason || "").trim();

  if (!reason || !["denied", "customer_canceled"].includes(request.status)) {
    return "";
  }

  const looksLikeOperationalNotes = /\[(pickup_time|dropoff_time|receipt_totals|service_unable)\]|Quick inspection recorded|receipt recorded/i.test(reason);

  if (looksLikeOperationalNotes) {
    return "";
  }

  return reason;
}

function savedFeeOrDefault(value, fallback) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : fallback;
}

function requestNeedsFuel(request) {
  return String(request.service_type || "").includes("fuel");
}

function requestNeedsWash(request) {
  return String(request.service_type || "").includes("wash");
}

function receiptTotalsFromNotes(request) {
  const matches = Array.from(String(request.notes || "").matchAll(/\[receipt_totals fuel=([0-9.]+) wash=([0-9.]+)\]/g));
  const latest = matches.at(-1);

  return {
    fuel: latest ? Number(latest[1]) || 0 : 0,
    wash: latest ? Number(latest[2]) || 0 : 0,
  };
}

function serviceUnableReasonsFromNotes(request) {
  const notes = String(request.notes || "");
  const reasons = { fuel: "", wash: "" };

  for (const match of notes.matchAll(/\[service_unable (fuel|wash)\] [^:]+: ([^\n]+)/g)) {
    reasons[match[1]] = match[2];
  }

  return reasons;
}

function renderAssignedWorker(request) {
  if (!request.assigned_worker_name) {
    return "";
  }

  const photoFrame = window.ShiftFuelPhoto
    ? window.ShiftFuelPhoto.renderPhotoFrame(
        {
          photo_url: request.assigned_worker_photo_url || '',
          cropped_photo_url: request.assigned_worker_photo_url || '',
          original_photo_url: request.assigned_worker_original_photo_url || '',
          name: request.assigned_worker_name || '',
        },
        { clickable: true }
      )
    : (request.assigned_worker_photo_url
        ? `<div class="worker-profile-photo-frame"><img class="worker-profile-photo" src="${escapeHtml(request.assigned_worker_photo_url)}" alt="${escapeHtml(request.assigned_worker_name || '')}"></div>`
        : `<div class="worker-profile-photo-frame"><div class="worker-profile-photo-placeholder">No photo</div></div>`);

  return `
    <section class="assigned-worker-card">
      ${photoFrame}
      <div>
        <p class="eyebrow">Who is working on your car</p>
        <h3>${escapeHtml(request.assigned_worker_name)}</h3>
        ${request.assigned_worker_phone ? `<p><strong>Phone:</strong> ${escapeHtml(request.assigned_worker_phone)}</p>` : '<p class="field-help">Contact information will be added soon.</p>'}
      </div>
    </section>
  `;
}

function renderTimeline(currentStatus) {
  const currentIndex = statusSteps.findIndex((step) => step.key === currentStatus);

  return `
    <ol class="customer-timeline">
      ${statusSteps
        .map((step, index) => {
          const isDone = index <= currentIndex;
          return `
            <li class="${isDone ? "done" : ""}">
              <span>${isDone ? "✓" : index + 1}</span>
              <p>${step.label}</p>
            </li>
          `;
        })
        .join("")}
    </ol>
  `;
}

function renderPhotos(request, photos) {
  const photoByType = new Map();
  photos.forEach((photo) => {
    if (!photoByType.has(photo.photo_type)) {
      photoByType.set(photo.photo_type, photo);
    }
  });

  const photoSlot = (label, types) => {
    const photo = types.map((type) => photoByType.get(type)).find(Boolean);

    if (!photo) {
      return `
        <div class="photo-proof-card photo-proof-missing">
          <span>${escapeHtml(label)}</span>
          <p>Not uploaded yet</p>
        </div>
      `;
    }

    const thumbSrc = photo.thumbnail_url || photo.image_url;
    const fullSrc  = photo.original_url  || photo.image_url;

    return `
      <div class="photo-proof-card photo-proof-loaded"
           role="button" tabindex="0"
           data-lightbox-src="${escapeHtml(fullSrc)}"
           data-lightbox-label="${escapeHtml(label)}">
        <img src="${escapeHtml(thumbSrc)}" alt="${escapeHtml(label)}" loading="lazy">
        <span>${escapeHtml(label)}</span>
      </div>
    `;
  };

  const section = (title, slots, isCompact = false) => `
    <section class="photo-proof-section ${isCompact ? "photo-proof-section-compact" : ""}">
      <h3>${escapeHtml(title)}</h3>
      <div class="photo-proof-grid">
        ${slots.map((slot) => photoSlot(slot.label, slot.types)).join("")}
      </div>
    </section>
  `;

  return `
    <div class="photo-proof-sections">
      ${section("Pickup", [
        { label: "Driver Side Front", types: ["pickup_driver_front", "pickup_front"] },
        { label: "Passenger Side Front", types: ["pickup_passenger_front", "pickup_passenger_side"] },
        { label: "Driver Side Rear", types: ["pickup_driver_rear", "pickup_driver_side"] },
        { label: "Passenger Side Rear", types: ["pickup_passenger_rear", "pickup_rear"] },
        { label: "Odometer", types: ["pickup_odometer"] },
      ])}
      ${requestNeedsFuel(request) ? section("Fuel Receipt", [
        { label: "Receipt", types: ["fuel_receipt"] },
      ], true) : ""}
      ${requestNeedsWash(request) ? section("Car Wash Receipt", [
        { label: "Receipt", types: ["wash_receipt"] },
      ], true) : ""}
      ${section("Drop off", [
        { label: "Driver Side Front", types: ["dropoff_driver_front", "dropoff_front"] },
        { label: "Passenger Side Front", types: ["dropoff_passenger_front", "dropoff_passenger_side"] },
        { label: "Driver Side Rear", types: ["dropoff_driver_rear", "dropoff_driver_side"] },
        { label: "Passenger Side Rear", types: ["dropoff_passenger_rear", "dropoff_rear"] },
        { label: "Odometer", types: ["dropoff_odometer"] },
      ])}
      ${section("Return back", [
        { label: "Ending Fuel Gauge", types: ["dropoff_fuel_gauge"] },
      ], true)}
    </div>
  `;
}

function inspectionSummaryFromNotes(request) {
  const notes = String(request.notes || "");
  const codeMatches = Array.from(notes.matchAll(/Trouble code ([A-Z0-9]+): ([\s\S]*?) Possible fixes: ([^\n]+)/g));
  const psiMatches = Array.from(notes.matchAll(/Tire PSI before\/after: ([\s\S]*?)(?:\. Trouble code|\n|$)/g));
  const latestCode = codeMatches.at(-1);
  const latestPsi = psiMatches.at(-1);

  if (!latestCode && !latestPsi) {
    return "";
  }

  return `
    <section class="inspection-summary">
      <h3>Vehicle inspection</h3>
      ${latestPsi ? `<p><strong>Tire pressure:</strong> ${escapeHtml(latestPsi[1].trim().replace(/\.$/, ""))}.</p>` : ""}
      ${latestCode ? `
        <p><strong>Trouble code ${escapeHtml(latestCode[1])}:</strong> ${escapeHtml(latestCode[2].trim())}</p>
        <p><strong>Possible fixes:</strong> ${escapeHtml(latestCode[3].trim())}</p>
      ` : ""}
    </section>
  `;
}

function serviceSummaryFromRequest(request) {
  const receiptTotals = receiptTotalsFromNotes(request);
  const unableReasons = serviceUnableReasonsFromNotes(request);
  const fuelFee = requestNeedsFuel(request) && receiptTotals.fuel > 0 ? savedFeeOrDefault(request.fuel_convenience_fee, 15) : 0;
  const washFee = requestNeedsWash(request) && receiptTotals.wash > 0 ? savedFeeOrDefault(request.wash_convenience_fee, 15) : 0;
  const inspectionFee = request.quick_inspection ? savedFeeOrDefault(request.quick_inspection_fee, 5) : 0;
  const lines = [];

  if (requestNeedsFuel(request)) {
    lines.push(unableReasons.fuel
      ? `<p><strong>Fuel:</strong> Not completed. ${escapeHtml(unableReasons.fuel)}</p>`
      : `<p><strong>Fuel:</strong> ${formatCurrency(receiptTotals.fuel)} receipt + ${formatCurrency(fuelFee)} convenience fee.</p>`);
  }

  if (requestNeedsWash(request)) {
    lines.push(unableReasons.wash
      ? `<p><strong>Car wash:</strong> Not completed. ${escapeHtml(unableReasons.wash)}</p>`
      : `<p><strong>Car wash:</strong> ${formatCurrency(receiptTotals.wash)} receipt + ${formatCurrency(washFee)} convenience fee.</p>`);
  }

  if (request.quick_inspection) {
    lines.push(`<p><strong>Quick inspection:</strong> ${formatCurrency(inspectionFee)}</p>`);
  }

  if (!lines.length && request.final_total == null) {
    return "";
  }

  return `
    <section class="inspection-summary">
      <h3>Service summary</h3>
      ${lines.join("")}
      <p><strong>Final total:</strong> ${formatCurrency(request.final_total)}</p>
    </section>
  `;
}

function serviceTimingFromNotes(request) {
  const notes = String(request.notes || "");
  const pickupMatches = Array.from(notes.matchAll(/\[pickup_time ([^\]]+)\]/g));
  const dropoffMatches = Array.from(notes.matchAll(/\[dropoff_time ([^\]]+)\]/g));
  const pickup = pickupMatches.at(-1)?.[1] || "";
  const dropoff = dropoffMatches.at(-1)?.[1] || "";

  if (!pickup && !dropoff) {
    return "";
  }

  const format = (value) => new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

  return `
    <section class="inspection-summary">
      <h3>Service timing</h3>
      ${pickup ? `<p><strong>Pickup photo timestamp:</strong> ${escapeHtml(format(pickup))}</p>` : ""}
      ${dropoff ? `<p><strong>Drop-off photo timestamp:</strong> ${escapeHtml(format(dropoff))}</p>` : ""}
    </section>
  `;
}

async function loadRequestPhotos(requestId, phone = verifiedTrackingContact.phone, email = verifiedTrackingContact.email) {
  const { data: rpcPhotos, error: rpcError } = await shiftFuelDb
    .rpc("public_request_photos", {
      p_request_id: requestId,
      p_phone: phone,
      p_email: email,
    });

  if (!rpcError) {
    return rpcPhotos || [];
  }

  if (!isMissingRpcError(rpcError)) {
    console.warn("Photo lookup blocked:", rpcError);
    return [];
  }

  console.warn("Photo RPC unavailable, falling back to direct lookup:", rpcError);

  const { data, error } = await shiftFuelDb
    .from("photos")
    .select("photo_type,image_url,thumbnail_url,original_url,created_at")
    .eq("service_request_id", requestId)
    .order("created_at", { ascending: true });

  if (error) {
    console.warn("Photo lookup skipped:", error);
    return [];
  }

  return data || [];
}

async function loadRequestReview(requestId, phone = verifiedTrackingContact.phone, email = verifiedTrackingContact.email) {
  const { data: rpcReview, error: rpcError } = await shiftFuelDb
    .rpc("public_review_for_request", {
      p_request_id: requestId,
      p_phone: phone,
      p_email: email,
    });

  if (!rpcError) {
    return rpcReview?.[0] || null;
  }

  if (!isMissingRpcError(rpcError)) {
    console.warn("Review lookup blocked:", rpcError);
    return null;
  }

  console.warn("Review RPC unavailable, falling back to direct lookup:", rpcError);

  const { data, error } = await shiftFuelDb
    .from("service_reviews")
    .select("id,rating,comments,submitted_at")
    .eq("service_request_id", requestId)
    .maybeSingle();

  if (error) {
    console.warn("Review lookup skipped:", error);
    return null;
  }

  return data || null;
}

function shouldShowReviewPrompt(request, review) {
  return request.status === "complete" && !review && hoursSince(request.updated_at || request.created_at) <= 24;
}

function renderReviewPrompt(request, review) {
  if (review) {
    return "";
  }

  if (!shouldShowReviewPrompt(request, review)) {
    return "";
  }

  const ratingLabels = {
    5: "5 - Amazing",
    4: "4 - Good",
    3: "3 - Okay",
    2: "2 - Poor",
    1: "1 - Terrible",
  };

  return `
    <section class="review-panel">
      <h3>Please review our service</h3>
      <p class="field-help">Tell us how we did. After you submit, this review request will disappear from tracking.</p>
      <p class="field-help">5 is amazing. 1 is terrible. Comments are optional for 4-5 and required for 1-3.</p>
      <div class="rating-options" role="radiogroup" aria-label="Service rating">
        ${[5, 4, 3, 2, 1].map((rating) => `
          <label>
            <input type="radio" name="service-rating" value="${rating}">
            <span>${ratingLabels[rating]}</span>
          </label>
        `).join("")}
      </div>
      <label>
        Comments
        <textarea id="service-review-comments" rows="3" placeholder="Optional for 4-5. Required if rating is 3 or below."></textarea>
      </label>
      <button
        class="button primary submit-service-review"
        data-request-id="${escapeHtml(request.id)}"
        data-customer-name="${escapeHtml(request.customer_name)}"
        data-customer-phone="${escapeHtml(request.customer_phone)}"
        data-customer-email="${escapeHtml(request.customer_email || "")}"
        type="button"
      >Submit review</button>
    </section>
  `;
}

function routeHomeAfterReview() {
  window.location.href = "index.html";
}

async function markReviewComplete(requestId) {
  const updates = {
    status: "complete",
    review_completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  let { error } = await shiftFuelDb
    .from("service_requests")
    .update(updates)
    .eq("id", requestId);

  if (error?.code === "PGRST204" && String(error.message || "").includes("'review_completed_at'")) {
    delete updates.review_completed_at;
    ({ error } = await shiftFuelDb
      .from("service_requests")
      .update(updates)
      .eq("id", requestId));
  }

  if (error) {
    console.warn("Could not mark review complete:", error);
  }
}

const SERVICE_OPTIONS = [
  { value: 'fuel',          label: 'Fuel only' },
  { value: 'car-wash',      label: 'Car wash only' },
  { value: 'car-wash-fuel', label: 'Car wash + Fuel' },
];

const WASH_PACKAGES = [
  {
    value: 'buff-shine', label: 'Buff & Shine', price: 27,
    includes: ['Fire Bath', 'Super Hard Shell Ceramic Finish', "Dry N' Shine", 'ICE Instant Shine', 'Salt Shield', 'Tire Shine', 'Triple Wheel Cleaning', 'Tri-Foam Conditioner', "Blazin' Glaze Clear Coat", 'High pH and Low pH Presoak', 'Drying Agent', 'Spot Free Rinse'],
  },
  {
    value: 'shine-protect', label: 'Shine & Protect', price: 20,
    includes: ['ICE Instant Shine', 'Salt Shield', 'Tire Shine', 'Triple Wheel Cleaning', 'Tri-Foam Conditioner', "Blazin' Glaze Clear Coat", 'High pH and Low pH Presoak', 'Drying Agent', 'Spot Free Rinse'],
  },
  {
    value: 'shine', label: 'Shine', price: 16,
    includes: ['Tri-Foam Conditioner', "Blazin' Glaze Clear Coat", 'High pH and Low pH Presoak', 'Double Tire & Wheel Cleaning', 'Drying Agent', 'Spot Free Rinse'],
  },
  {
    value: 'double-wash', label: 'Double Wash', price: 12,
    includes: ['High pH and Low pH Presoak', 'Double Tire & Wheel Cleaning', 'Drying Agent', 'Spot Free Rinse'],
  },
];

const FUEL_ESTIMATE_RANGES = [
  { value: '5',  label: '5 gallons or less',  gallons: 5 },
  { value: '10', label: '5–10 gallons',        gallons: 10 },
  { value: '15', label: '10–15 gallons',       gallons: 15 },
  { value: '20', label: '15–20 gallons',       gallons: 20 },
  { value: '25', label: '20–25 gallons',       gallons: 25 },
  { value: '30', label: '25+ gallons',         gallons: 30 },
];

// ── Vehicle data (mirrors script.js for completion form dropdowns) ────────────
const CB_POPULAR_MAKES = ['Chevrolet','Ford','Honda','Hyundai','Jeep','Kia','Nissan','Subaru','Tesla','Toyota'];
const CB_OTHER_MAKES   = ['Acura','Alfa Romeo','Audi','BMW','Buick','Cadillac','Chrysler','Dodge','Fiat','Genesis','GMC','Infiniti','Jaguar','Land Rover','Lexus','Lincoln','Mazda','Mercedes-Benz','Mini','Mitsubishi','Porsche','Ram','Volkswagen','Volvo'];
const CB_FALLBACK_MODELS = {
  Acura: ['ILX','Integra','MDX','RDX','TLX'],
  Audi: ['A3','A4','A5','A6','Q3','Q5','Q7'],
  BMW: ['3 Series','4 Series','5 Series','X1','X3','X5'],
  Buick: ['Encore','Encore GX','Enclave','Envision'],
  Cadillac: ['CT4','CT5','Escalade','XT4','XT5','XT6'],
  Chevrolet: ['Blazer','Colorado','Equinox','Malibu','Silverado','Suburban','Tahoe','Trailblazer','Traverse'],
  Chrysler: ['300','Pacifica','Voyager'],
  Dodge: ['Challenger','Charger','Durango','Hornet'],
  Ford: ['Bronco','Escape','Explorer','F-150','Fusion','Maverick','Mustang','Ranger'],
  Genesis: ['G70','G80','GV70','GV80'],
  GMC: ['Acadia','Canyon','Sierra','Terrain','Yukon'],
  Honda: ['Accord','Civic','CR-V','HR-V','Odyssey','Passport','Pilot','Ridgeline'],
  Hyundai: ['Elantra','Kona','Palisade','Santa Fe','Sonata','Tucson'],
  Infiniti: ['Q50','QX50','QX55','QX60','QX80'],
  Jeep: ['Cherokee','Compass','Gladiator','Grand Cherokee','Renegade','Wrangler'],
  Kia: ['Carnival','Forte','K5','Seltos','Sorento','Soul','Sportage','Telluride'],
  Lexus: ['ES','GX','IS','NX','RX','TX'],
  Lincoln: ['Aviator','Corsair','Nautilus','Navigator'],
  Mazda: ['CX-30','CX-5','CX-50','CX-9','Mazda3','Mazda6','MX-5 Miata'],
  'Mercedes-Benz': ['C-Class','E-Class','GLA','GLC','GLE','S-Class'],
  Mini: ['Clubman','Convertible','Cooper','Countryman'],
  Mitsubishi: ['Eclipse Cross','Mirage','Outlander','Outlander Sport'],
  Nissan: ['Altima','Frontier','Kicks','Maxima','Murano','Pathfinder','Rogue','Sentra','Versa'],
  Ram: ['1500','2500','3500','ProMaster'],
  Subaru: ['Ascent','Crosstrek','Forester','Impreza','Legacy','Outback'],
  Tesla: ['Model 3','Model S','Model X','Model Y'],
  Toyota: ['4Runner','Camry','Corolla','Highlander','Prius','RAV4','Sienna','Tacoma','Tundra'],
  Volkswagen: ['Atlas','Golf','ID.4','Jetta','Passat','Taos','Tiguan'],
  Volvo: ['S60','S90','V60','XC40','XC60','XC90'],
};
const CB_AVG_FUEL_PRICES = { Regular: 3.792, 'Mid-grade': 4.411, Premium: 4.701, Diesel: 4.967 };
const CB_FEES = { fuelConvenience: 15, washConvenience: 15, quickInspection: 5 };

// ── Completion-form utility functions ─────────────────────────────────────────
function cbFormatCurrency(v) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);
}
function cbFormatPricePerGallon(v) { return `$${v.toFixed(3)}/gal`; }

function cbTimeSlots(startHour, endHour) {
  const slots = [];
  for (let h = startHour; h <= endHour; h++) {
    for (const m of ['00', '30']) {
      if (h === endHour && m === '30') continue;
      slots.push(`${String(h).padStart(2, '0')}:${m}`);
    }
  }
  return slots;
}
function cbMinutesFromSlot(v) {
  const [h, m] = String(v || '').slice(0, 5).split(':').map(Number);
  return h * 60 + (m || 0);
}
function cbFutureSlotsForDate(slots, dateValue) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (dateValue !== todayStr) return slots;
  const nowMin = today.getHours() * 60 + today.getMinutes();
  return slots.filter((s) => cbMinutesFromSlot(s) > nowMin);
}
function cbFormatTimeLabel(v) {
  const [hStr, m] = v.split(':');
  const h = Number(hStr);
  return `${h % 12 || 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`;
}

// ── Vehicle dropdown functions ─────────────────────────────────────────────────
function cbPopulateYears(select, selectedValue) {
  const maxYear = new Date().getFullYear() + 1;
  for (let y = maxYear; y >= 1980; y--) {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y;
    if (String(y) === String(selectedValue)) opt.selected = true;
    select.append(opt);
  }
}

function cbPopulateMakes(select, selectedValue) {
  const popularGroup = document.createElement('optgroup');
  popularGroup.label = 'Most common makes';
  CB_POPULAR_MAKES.forEach((make) => {
    const opt = document.createElement('option');
    opt.value = make; opt.textContent = make;
    if (make === selectedValue) opt.selected = true;
    popularGroup.append(opt);
  });
  const otherGroup = document.createElement('optgroup');
  otherGroup.label = 'Other makes';
  CB_OTHER_MAKES.filter((m) => !CB_POPULAR_MAKES.includes(m))
    .sort((a, b) => a.localeCompare(b))
    .forEach((make) => {
      const opt = document.createElement('option');
      opt.value = make; opt.textContent = make;
      if (make === selectedValue) opt.selected = true;
      otherGroup.append(opt);
    });
  select.append(popularGroup, otherGroup);
}

async function cbLoadModels(form) {
  const yearSel  = form.querySelector('.cb-vehicle-year');
  const makeSel  = form.querySelector('.cb-vehicle-make');
  const modelSel = form.querySelector('.cb-vehicle-model');
  const helpEl   = form.querySelector('.cb-model-help');
  if (!modelSel) return;
  const selYear = yearSel?.value;
  const selMake = makeSel?.value;
  if (!selYear || !selMake) {
    modelSel.innerHTML = '<option value="">Select year and make first</option>';
    modelSel.disabled = true;
    if (helpEl) helpEl.textContent = 'Models load after you choose a year and make.';
    return;
  }
  const prevModel = modelSel.dataset.pendingValue || '';
  modelSel.innerHTML = '<option value="">Loading models…</option>';
  modelSel.disabled = true;
  if (helpEl) helpEl.textContent = 'Loading models for that year and make.';
  try {
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(selMake)}/modelyear/${selYear}/vehicletype/car?format=json`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const models = [...new Set(data.Results.map((r) => r.Model_Name).filter(Boolean))].sort((a, b) => a.localeCompare(b));
      if (models.length > 0) {
        modelSel.innerHTML = '<option value="">Select model</option>';
        models.forEach((m) => { const o = document.createElement('option'); o.value = m; o.textContent = m; modelSel.append(o); });
        modelSel.disabled = false;
        if (prevModel) { if (!Array.from(modelSel.options).some((o) => o.value === prevModel)) { const o = document.createElement('option'); o.value = prevModel; o.textContent = prevModel; modelSel.append(o); } modelSel.value = prevModel; }
        if (helpEl) helpEl.textContent = 'Models are filtered by the selected year and make.';
        return;
      }
    }
  } catch (e) { console.warn('cbLoadModels NHTSA error:', e); }
  const fallback = CB_FALLBACK_MODELS[selMake] || [];
  modelSel.innerHTML = `<option value="">${fallback.length ? 'Select model' : 'No models found'}</option>`;
  fallback.forEach((m) => { const o = document.createElement('option'); o.value = m; o.textContent = m; modelSel.append(o); });
  modelSel.disabled = fallback.length === 0;
  if (prevModel && fallback.length) { if (!Array.from(modelSel.options).some((o) => o.value === prevModel)) { const o = document.createElement('option'); o.value = prevModel; o.textContent = prevModel; modelSel.append(o); } modelSel.value = prevModel; }
  if (helpEl) helpEl.textContent = fallback.length ? 'Showing common models while the official vehicle lookup is unavailable.' : 'No models found for that year and make.';
}

// ── Return time dropdown ───────────────────────────────────────────────────────
function cbFillReturnSelect(select, slots, bookedSlots, placeholder) {
  const prev = select.value;
  select.innerHTML = '';
  const blank = document.createElement('option'); blank.value = ''; blank.textContent = placeholder; select.append(blank);
  slots.forEach((slot) => {
    const opt = document.createElement('option'); opt.value = slot; opt.textContent = cbFormatTimeLabel(slot);
    if (bookedSlots.has(slot)) { opt.disabled = true; opt.textContent += ' — booked'; }
    select.append(opt);
  });
  if (slots.includes(prev) && !bookedSlots.has(prev)) select.value = prev;
}

async function cbRefreshReturnTimes(form) {
  const timeSel   = form.querySelector('.cb-return-time');
  const timeHelp  = form.querySelector('.cb-time-help');
  const dateValue = (form.querySelector('.cb-service-date')?.value || '').trim();
  const svcType   = form.querySelector('.cb-service-type')?.value || '';
  const needsWash = svcType === 'car-wash' || svcType === 'car-wash-fuel';
  if (!timeSel) return;
  if (!dateValue) { timeSel.innerHTML = '<option value="">Select a date first</option>'; return; }

  let bookedSlots = new Set();
  try {
    const { data } = await shiftFuelDb.rpc('public_booked_return_slots', { p_service_date: dateValue });
    if (data) bookedSlots = new Set((data).map((r) => String(r.desired_return_time || '').slice(0, 5)).filter(Boolean));
  } catch (e) { console.warn('cbRefreshReturnTimes:', e); }

  const rawSlots = needsWash ? cbTimeSlots(9, 18) : cbTimeSlots(7, 22);
  const slots    = cbFutureSlotsForDate(rawSlots, dateValue);
  const placeholder = needsWash
    ? (slots.length ? 'Select car wash return time' : 'No car wash times left today')
    : (slots.length ? 'Select return time' : 'No return times left today');
  cbFillReturnSelect(timeSel, slots, bookedSlots, placeholder);
  if (timeHelp) {
    timeHelp.textContent = needsWash
      ? (slots.length ? 'Car wash service selected. Return times are limited to 9:00 AM through 6:00 PM.' : 'No more car wash return times are available today. Choose tomorrow or another future date.')
      : (slots.length ? 'Choose the time you want your vehicle returned.' : 'No more return times are available today. Choose tomorrow or another future date.');
  }
}

// ── Live price estimate ────────────────────────────────────────────────────────
function cbUpdateEstimate(form) {
  const svcType    = form.querySelector('.cb-service-type')?.value || '';
  const needsFuel  = svcType === 'fuel' || svcType === 'car-wash-fuel';
  const needsWash  = svcType === 'car-wash' || svcType === 'car-wash-fuel';
  const washPkgVal = form.querySelector('.cb-wash-package')?.value || '';
  const fuelTypeVal = form.querySelector('.cb-fuel-type')?.value || 'Regular';
  const fuelEstVal  = form.querySelector('.cb-fuel-estimate')?.value || '';
  const insp        = form.querySelector('.cb-quick-inspection')?.checked || false;

  const washPkg   = WASH_PACKAGES.find((p) => p.value === washPkgVal) || null;
  const fuelRange = FUEL_ESTIMATE_RANGES.find((r) => r.value === fuelEstVal) || null;
  const gallons   = needsFuel && fuelRange ? fuelRange.gallons : 0;
  const ppg       = CB_AVG_FUEL_PRICES[fuelTypeVal] || CB_AVG_FUEL_PRICES.Regular;
  const fuelAmt   = gallons * ppg;
  const washFee   = needsWash && washPkg ? washPkg.price : 0;
  const washConv  = needsWash && washPkg ? CB_FEES.washConvenience : 0;
  const fuelConv  = needsFuel ? CB_FEES.fuelConvenience : 0;
  const inspFee   = insp ? CB_FEES.quickInspection : 0;
  const total     = fuelAmt + washFee + washConv + fuelConv + inspFee;

  const qHide = (cls, h) => { const el = form.querySelector(`.${cls}`); if (el) el.hidden = h; };
  const qText = (cls, t) => { const el = form.querySelector(`.${cls}`); if (el) el.textContent = t; };

  qHide('cb-payment-wash-row',       !(needsWash && washPkg));
  qHide('cb-payment-wash-conv-row',  !(needsWash && washPkg));
  qHide('cb-payment-price-row',      !needsFuel);
  qHide('cb-payment-fuel-row',       !needsFuel);
  qHide('cb-payment-fuel-conv-row',  !needsFuel);
  qHide('cb-payment-inspection-row', !insp);

  qText('cb-estimated-wash',  washPkg ? `${washPkg.label} — ${cbFormatCurrency(washFee)}` : '$0.00');
  qText('cb-wash-conv-fee',   cbFormatCurrency(washConv));
  qText('cb-average-price',   cbFormatPricePerGallon(ppg));
  qText('cb-estimated-fuel',  needsFuel
    ? `${fuelRange?.label || '0 gallons'} estimated at ${gallons} gallons × ${cbFormatPricePerGallon(ppg)} = ${cbFormatCurrency(fuelAmt)}`
    : cbFormatCurrency(fuelAmt));
  qText('cb-fuel-conv-fee',   cbFormatCurrency(fuelConv));
  qText('cb-inspection-fee',  cbFormatCurrency(inspFee));
  qText('cb-estimated-total', cbFormatCurrency(total));
}

// ── Service details panel ──────────────────────────────────────────────────────
function cbUpdateServiceDetails(form) {
  const panel   = form.querySelector('.cb-service-details');
  if (!panel) return;
  const svcType  = form.querySelector('.cb-service-type')?.value || '';
  const needsFuel = svcType === 'fuel' || svcType === 'car-wash-fuel';
  const needsWash = svcType === 'car-wash' || svcType === 'car-wash-fuel';
  const washPkg   = WASH_PACKAGES.find((p) => p.value === (form.querySelector('.cb-wash-package')?.value || '')) || null;
  const svcLabel  = SERVICE_OPTIONS.find((o) => o.value === svcType)?.label || '';

  if (!svcType) {
    panel.innerHTML = `<p class="eyebrow">Service details</p><h3>Select a service</h3><p>Choose Car Wash, Fuel, or Car Wash + Fuel to see what is included.</p>`;
    return;
  }

  const details = [];
  if (needsFuel) {
    details.push('Fuel filled using the selected fuel type and estimated gallons.');
    details.push(`Regular: ${cbFormatPricePerGallon(CB_AVG_FUEL_PRICES.Regular)}`);
    details.push(`Mid-grade: ${cbFormatPricePerGallon(CB_AVG_FUEL_PRICES['Mid-grade'])}`);
    details.push(`Premium: ${cbFormatPricePerGallon(CB_AVG_FUEL_PRICES.Premium)}`);
    details.push(`Diesel: ${cbFormatPricePerGallon(CB_AVG_FUEL_PRICES.Diesel)}`);
  }
  if (needsWash && washPkg) details.push(...washPkg.includes);
  else if (needsWash)       details.push('Select a wash package to see what is included.');
  if (needsFuel && needsWash) details.push('$30 car wash + fuel convenience fee added.');
  else if (needsFuel)         details.push('$15 fuel convenience fee added.');
  else if (needsWash)         details.push('$15 car wash convenience fee added.');
  if (form.querySelector('.cb-quick-inspection')?.checked) details.push('Quick vehicle inspection add-on.');

  panel.innerHTML = `
    <p class="eyebrow">Service details</p>
    <h3>${escapeHtml(svcLabel)}${washPkg ? `: ${escapeHtml(washPkg.label)}` : ''}</h3>
    <p>${needsWash ? 'Car wash services are available from 9:00 AM to 6:00 PM every day.' : 'Fuel service can be requested during your selected return window.'}</p>
    <ul>${details.map((d) => `<li>${escapeHtml(d)}</li>`).join('')}</ul>
  `;
}

// ── Initialise a newly-rendered completion form ────────────────────────────────
async function cbInitForm(form, request) {
  // Vehicle dropdowns
  const yearSel  = form.querySelector('.cb-vehicle-year');
  const makeSel  = form.querySelector('.cb-vehicle-make');
  const modelSel = form.querySelector('.cb-vehicle-model');
  if (yearSel && yearSel.options.length <= 1) cbPopulateYears(yearSel, request?.vehicle_year || '');
  if (makeSel && makeSel.options.length <= 1) cbPopulateMakes(makeSel, request?.vehicle_make || '');
  if (modelSel && request?.vehicle_model) modelSel.dataset.pendingValue = request.vehicle_model;
  await cbLoadModels(form);

  // Return time dropdown
  await cbRefreshReturnTimes(form);
  // Restore pre-selected return time if it survived the refresh
  const timeSel = form.querySelector('.cb-return-time');
  if (timeSel && request?.desired_return_time) {
    const slot = String(request.desired_return_time).slice(0, 5);
    const opt = Array.from(timeSel.options).find((o) => o.value === slot && !o.disabled);
    if (opt) timeSel.value = slot;
  }

  // Initial state for service-dependent panels
  cbUpdateServiceDetails(form);
  cbUpdateEstimate(form);
}

function serviceLabelFromType(type) {
  return SERVICE_OPTIONS.find((o) => o.value === type)?.label || type || '';
}

function washLabelFromValue(value) {
  return WASH_PACKAGES.find((p) => p.value === value)?.label || value || '';
}

// Show/hide fuel and wash sub-controls inside a pending-completion-card
function cbUpdateServiceControls(form) {
  const svcType   = form.querySelector('.cb-service-type')?.value || '';
  const needsFuel = svcType === 'fuel' || svcType === 'car-wash-fuel';
  const needsWash = svcType === 'car-wash' || svcType === 'car-wash-fuel';

  // Show/hide fuel controls; toggle required without clearing preserved values
  form.querySelectorAll('.cb-fuel-control').forEach((el) => {
    el.hidden = !needsFuel;
    el.querySelectorAll('select,input').forEach((inp) => {
      if (needsFuel) inp.setAttribute('required', '');
      else           inp.removeAttribute('required');
    });
  });

  // Show/hide wash controls
  form.querySelectorAll('.cb-wash-control').forEach((el) => {
    el.hidden = !needsWash;
    el.querySelectorAll('select,input').forEach((inp) => {
      if (needsWash) inp.setAttribute('required', '');
      else           inp.removeAttribute('required');
    });
  });
}

function renderPendingCompletionCard(request) {
  const needsFuel = request.service_type === 'fuel' || request.service_type === 'car-wash-fuel';
  const needsWash = request.service_type === 'car-wash' || request.service_type === 'car-wash-fuel';

  const serviceOpts = SERVICE_OPTIONS.map((o) =>
    `<option value="${escapeHtml(o.value)}"${request.service_type === o.value ? ' selected' : ''}>${escapeHtml(o.label)}</option>`
  ).join('');

  const fuelTypeOpts = ['Regular', 'Mid-grade', 'Premium', 'Diesel'].map((t) =>
    `<option value="${escapeHtml(t)}"${request.fuel_type === t ? ' selected' : ''}>${escapeHtml(t)}</option>`
  ).join('');

  const fuelEstimateOpts = FUEL_ESTIMATE_RANGES.map((r) =>
    `<option value="${escapeHtml(r.value)}"${String(request.estimated_gallons || '') === r.value ? ' selected' : ''}>${escapeHtml(r.label)}</option>`
  ).join('');

  const washPkgOpts = WASH_PACKAGES.map((p) =>
    `<option value="${escapeHtml(p.value)}"${request.wash_package === p.value ? ' selected' : ''}>${escapeHtml(p.label)} — $${p.price}</option>`
  ).join('');

  // Year/make/model dropdowns are populated by cbInitForm after DOM insertion.
  // Return time dropdown is also populated by cbInitForm.

  const rid = escapeHtml(request.id);

  return `
    <article class="track-request-card pending-completion-card" data-request-id="${rid}">
      <div class="pending-action-banner">
        <span class="pending-action-icon">&#9888;</span>
        Action required — Complete your booking to enter the service queue
      </div>

      <form class="booking-form complete-booking-form" data-request-id="${rid}">
        <p class="form-note"><span class="required-mark">Required</span> fields must be completed before submitting. Optional fields can be skipped.</p>

        <fieldset>
          <legend>Contact information</legend>
          <div class="field-grid">
            <label>
              <span>Name <span class="required-mark">Required</span></span>
              <input class="cb-customer-name" type="text" placeholder="Jordan Smith"
                value="${escapeHtml(request.customer_name || '')}" required>
            </label>
            <label>
              <span>Phone number <span class="required-mark">Required</span></span>
              <input class="cb-customer-phone" type="tel"
                value="${escapeHtml(verifiedTrackingContact.phone || request.customer_phone || '')}" readonly>
            </label>
            <label>
              <span>Email <span class="required-mark">Required</span></span>
              <input class="cb-customer-email" type="email"
                value="${escapeHtml(verifiedTrackingContact.email || request.customer_email || '')}" readonly>
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Service address</legend>
          <div class="address-fields">
            <label>
              <span>Street address <span class="required-mark">Required</span></span>
              <input class="cb-address-street" type="text" autocomplete="address-line1"
                placeholder="123 Main Street" value="${escapeHtml(request.address_street || '')}" required>
            </label>
            <label>
              <span>Apt / Suite / Unit <span class="optional-mark">Optional</span></span>
              <input class="cb-address-apt" type="text" autocomplete="address-line2"
                placeholder="Suite 200, Unit B" value="${escapeHtml(request.address_apt || '')}">
            </label>
            <div class="address-csz">
              <label>
                <span>City <span class="required-mark">Required</span></span>
                <input class="cb-address-city" type="text" autocomplete="address-level2"
                  placeholder="Newark" value="${escapeHtml(request.address_city || '')}" required>
              </label>
              <label>
                <span>State</span>
                <input class="cb-address-state" type="text" autocomplete="address-level1"
                  placeholder="DE" value="${escapeHtml(request.address_state || 'DE')}">
              </label>
              <label>
                <span>ZIP <span class="required-mark">Required</span></span>
                <input class="cb-address-zip" type="text" autocomplete="postal-code"
                  inputmode="numeric" placeholder="19702" value="${escapeHtml(request.address_zip || '')}" required>
              </label>
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend>Vehicle</legend>
          <div class="field-grid">
            <label>
              <span>Year <span class="required-mark">Required</span></span>
              <select class="cb-vehicle-year" required>
                <option value="">Select year</option>
              </select>
            </label>
            <label>
              <span>Make <span class="required-mark">Required</span></span>
              <select class="cb-vehicle-make" required>
                <option value="">Select make</option>
              </select>
            </label>
            <label>
              <span>Model <span class="required-mark">Required</span></span>
              <select class="cb-vehicle-model" required disabled>
                <option value="">Select year and make first</option>
              </select>
              <span class="cb-model-help field-help">Models load after you choose a year and make.</span>
            </label>
            <label>
              <span>Color <span class="required-mark">Required</span></span>
              <input class="cb-vehicle-color" type="text" placeholder="Silver"
                value="${escapeHtml(request.vehicle_color || '')}" required>
            </label>
            <label>
              <span>License plate <span class="required-mark">Required</span></span>
              <input class="cb-license-plate" type="text" placeholder="ABC-1234"
                value="${escapeHtml(request.license_plate || '')}" required>
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Parking and key handoff</legend>
          <div class="field-grid">
            <label>
              <span>Car location <span class="required-mark">Required</span></span>
              <input class="cb-parking-location" type="text"
                placeholder="Example: on the street, Garage B Level 3 spot 142, surface lot near main entrance"
                value="${escapeHtml(request.parking_location || '')}" required>
              <span class="field-help">Tell us exactly where your vehicle will be parked.</span>
            </label>
            <label>
              <span>Key handoff instructions <span class="required-mark">Required</span></span>
              <input class="cb-key-handoff" type="text"
                placeholder="Example: front door to Building X, front desk, employee entrance, or meet at vehicle."
                value="${escapeHtml(request.key_handoff_details || '')}" required>
              <span class="field-help">Tell us exactly where and how to pick up your keys.</span>
            </label>
            <label>
              <span>Google Maps / Apple Maps link <span class="optional-mark">Optional</span></span>
              <input class="cb-parking-map-url" type="url"
                placeholder="Paste a map link to the parking location"
                value="${escapeHtml(request.parking_map_url || '')}">
              <span class="field-help">Optional. Helps the worker find your vehicle faster.</span>
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Service request</legend>
          <div class="service-choice-grid">
            <div class="service-controls">
              <label>
                <span>Service needed <span class="required-mark">Required</span></span>
                <select class="cb-service-type" required>
                  <option value="">Select service</option>
                  ${serviceOpts}
                </select>
              </label>
              <label class="cb-wash-control conditional-control"${needsWash ? '' : ' hidden'}>
                <span>Car wash package <span class="required-mark">Required when visible</span></span>
                <select class="cb-wash-package"${needsWash ? ' required' : ''}>
                  <option value="">Select wash package</option>
                  ${washPkgOpts}
                </select>
              </label>
              <label class="cb-fuel-control conditional-control"${needsFuel ? '' : ' hidden'}>
                <span>Fuel type <span class="required-mark">Required when visible</span></span>
                <select class="cb-fuel-type"${needsFuel ? ' required' : ''}>
                  <option value="">Select fuel type</option>
                  ${fuelTypeOpts}
                </select>
              </label>
              <label class="cb-fuel-control conditional-control"${needsFuel ? '' : ' hidden'}>
                <span>Estimated fuel needed, in gallons <span class="required-mark">Required when visible</span></span>
                <select class="cb-fuel-estimate"${needsFuel ? ' required' : ''}>
                  <option value="">Select fuel range</option>
                  ${fuelEstimateOpts}
                </select>
              </label>
              <label>
                <span>Service date <span class="required-mark">Required</span></span>
                <input class="cb-service-date" type="date" value="${escapeHtml(request.service_date || '')}" required>
                <span class="field-help">Choose a service date within the next 3 months. Past dates are not available.</span>
              </label>
              <label>
                <span>Desired return time <span class="required-mark">Required</span></span>
                <select class="cb-return-time" required>
                  <option value="">Loading available times…</option>
                </select>
                <span class="cb-time-help field-help">Car wash services are available from 9:00 AM to 6:00 PM every day.</span>
              </label>
              <div class="inspection-addon-control">
                <label class="checkbox-label cb-inspection-label" aria-describedby="cb-inspection-details-${rid}">
                  <input class="cb-quick-inspection" type="checkbox" value="yes"${request.quick_inspection ? ' checked' : ''}>
                  <span>Add a quick vehicle inspection for $5 <span class="optional-mark">Optional</span></span>
                </label>
                <div id="cb-inspection-details-${rid}" class="inspection-addon-details" role="tooltip">
                  <h4>Inspection covers</h4>
                  <ul>
                    <li>Walk-around vehicle condition check</li>
                    <li>Photos of visible exterior condition</li>
                    <li>Check for obvious dents, scratches, cracked glass, or damage</li>
                    <li>Tire visual inspection</li>
                    <li>Windshield and mirror check</li>
                    <li>Documentation of vehicle condition before service</li>
                  </ul>
                </div>
              </div>
            </div>
            <aside class="cb-service-details service-details-panel" aria-live="polite">
              <p class="eyebrow">Service details</p>
              <h3>Select a service</h3>
              <p>Choose Car Wash, Fuel, or Car Wash + Fuel to see what is included.</p>
            </aside>
          </div>
          <label>
            <span>Notes <span class="optional-mark">Optional</span></span>
            <textarea class="cb-notes" rows="4" placeholder="Anything we should know?"></textarea>
          </label>
        </fieldset>

        <fieldset>
          <legend>Payment authorization</legend>
          <div class="payment-box">
            <p>Your card will be authorized for the estimated service total. No charge is collected until service is complete. The final amount may vary based on actual fuel cost.</p>
            <dl>
              <div class="cb-payment-wash-row" hidden>
                <dt>Car wash package</dt>
                <dd class="cb-estimated-wash">$0.00</dd>
              </div>
              <div class="cb-payment-wash-conv-row" hidden>
                <dt>Car wash convenience fee</dt>
                <dd class="cb-wash-conv-fee">$0.00</dd>
              </div>
              <div class="cb-payment-price-row" hidden>
                <dt>Average price used</dt>
                <dd class="cb-average-price">$0.000/gal</dd>
              </div>
              <div class="cb-payment-fuel-row" hidden>
                <dt>Estimated fuel</dt>
                <dd class="cb-estimated-fuel">$0.00</dd>
              </div>
              <div class="cb-payment-fuel-conv-row" hidden>
                <dt>Fuel convenience fee</dt>
                <dd class="cb-fuel-conv-fee">$0.00</dd>
              </div>
              <div class="cb-payment-inspection-row" hidden>
                <dt>Quick inspection</dt>
                <dd class="cb-inspection-fee">$0.00</dd>
              </div>
              <div>
                <dt>Estimated authorization</dt>
                <dd class="cb-estimated-total">$0.00</dd>
              </div>
            </dl>
          </div>
        </fieldset>

        <fieldset>
          <legend>Agreement</legend>
          <label class="checkbox-label">
            <input class="cb-agreed" type="checkbox" value="yes" required>
            <span>I agree that ShiftFuel Concierge may pick up, service, and return my vehicle using the instructions I provided.</span>
          </label>
          <p class="field-help">By booking, you agree to provide accurate vehicle, key, parking, fuel, and service instructions. ShiftFuel documents pickup and return condition with photos and will contact you if a requested service cannot be completed.</p>
        </fieldset>

        <div class="pending-form-actions">
          <button class="button primary cb-submit-btn cb-pay-confirm-btn" type="submit">Authorize Payment &amp; Confirm Booking</button>
          <button class="button danger cb-cancel-btn" type="button">Cancel this request</button>
        </div>
        <p class="cb-status form-status" role="status"></p>
      </form>

      <div class="cancel-panel" hidden>
        <p><strong>Cancel this service request?</strong></p>
        <p class="field-help">Your request will be marked canceled. No payment will be collected and no worker will be assigned.</p>
        <div class="pending-form-actions">
          <button class="button danger cb-confirm-cancel-btn" data-request-id="${rid}" type="button">Yes, cancel request</button>
          <button class="button cb-back-btn" type="button">Keep request</button>
        </div>
      </div>
    </article>
  `;
}

function renderRequestCard(request, photos = [], review = null) {
  if (request.status === 'pending_customer_info') {
    return renderPendingCompletionCard(request);
  }
  const statusLabel = statusLabels[request.status] || request.status;
  const cancellationReason = cancellationReasonForDisplay(request);
  const vehicle = [request.vehicle_year, request.vehicle_make, request.vehicle_model].filter(Boolean).join(' ');
  const serviceDate = request.service_date
    ? new Date(request.service_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  return `
    <article class="track-request-card" data-request-id="${escapeHtml(request.id)}">
      <details class="track-request-details">
        <summary class="track-request-summary">
          <div class="track-request-summary-main">
            <span class="track-request-vehicle">${escapeHtml(vehicle)}</span>
            <span class="track-request-meta">
              ${serviceDate ? `<span>${escapeHtml(serviceDate)}</span>` : ''}
              ${request.service_label || request.service_type ? `<span>${escapeHtml(request.service_label || request.service_type)}</span>` : ''}
            </span>
          </div>
          <span class="status-pill">${escapeHtml(statusLabel)}</span>
        </summary>

        <div class="track-request-body">
          <div class="request-details">
            <p><strong>Date:</strong> ${escapeHtml(serviceDate)}</p>
            <p><strong>Vehicle:</strong> ${escapeHtml(vehicle)}${request.vehicle_color ? ', ' + escapeHtml(request.vehicle_color) : ''}</p>
            <p><strong>Service:</strong> ${escapeHtml(request.service_label || request.service_type || '')}</p>
            <p><strong>Parking:</strong> ${[request.parking_location, request.parking_spot ? 'spot ' + request.parking_spot : ''].filter(Boolean).map(escapeHtml).join(', ')}</p>
            ${request.return_parking_location ? `<p><strong>Vehicle returned to:</strong> ${escapeHtml(request.return_parking_location)}</p>` : ''}
            ${request.estimated_total != null ? `<p><strong>Estimated total:</strong> ${formatCurrency(request.estimated_total)}</p>` : ''}
            ${request.final_total != null ? `<p><strong>Final total:</strong> ${formatCurrency(request.final_total)}</p>` : ''}
            ${cancellationReason ? `<p><strong>Reason:</strong> ${escapeHtml(cancellationReason)}</p>` : ''}
            ${request.status === 'auto_reversed' ? `<p class="track-auto-reversed-note">Your service was not completed on the scheduled date, so your payment has been reversed.</p>` : ''}
          </div>
          ${renderAssignedWorker(request)}
          ${renderTimeline(request.status)}
          ${serviceTimingFromNotes(request)}
          ${inspectionSummaryFromNotes(request)}
          ${renderPhotos(request, photos)}
          ${renderReviewPrompt(request, review)}
          ${canCustomerCancel(request) ? `
            <div class="tracking-actions">
              <button class="button danger show-cancel-request" type="button">Cancel request</button>
            </div>
            <div class="cancel-panel" hidden>
              <label>
                Reason for cancellation
                <textarea class="customer-cancel-reason" rows="3" placeholder="Example: I no longer need service today."></textarea>
              </label>
              <button class="button danger confirm-cancel-request" data-request-id="${escapeHtml(request.id)}" type="button">
                Confirm cancellation
              </button>
            </div>
          ` : ''}
        </div>
      </details>
    </article>
  `;
}

async function renderAllRequests(requests, phone, email) {
  const now = Date.now();
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

  const inProgress = requests.filter(r => !terminalStatuses.includes(r.status));
  const completed  = requests.filter(r => r.status === 'complete'
    && (now - new Date(r.updated_at || r.created_at).getTime()) <= TWENTY_FOUR_HOURS);

  let html = `<div class="track-sections">`;

  // In Progress section
  html += `
    <details class="track-section" open>
      <summary class="track-section-header">
        Requests in progress
        <span class="track-section-count">${inProgress.length}</span>
      </summary>
      <div class="track-section-body">
  `;
  if (inProgress.length === 0) {
    html += `<p class="track-empty-msg">No requests in progress.</p>`;
  } else {
    for (const request of inProgress) {
      const photos = await loadRequestPhotos(request.id, phone, email);
      const review = await loadRequestReview(request.id, phone, email);
      html += renderRequestCard(request, photos, review);
    }
  }
  html += `</div></details>`;

  // Completed section
  html += `
    <details class="track-section">
      <summary class="track-section-header">
        Completed requests
        <span class="track-section-count">${completed.length}</span>
      </summary>
      <div class="track-section-body">
  `;
  if (completed.length === 0) {
    html += `<p class="track-empty-msg">No completed requests available.</p>`;
  } else {
    for (const request of completed) {
      const photos = await loadRequestPhotos(request.id, phone, email);
      const review = await loadRequestReview(request.id, phone, email);
      html += renderRequestCard(request, photos, review);
    }
  }
  html += `</div></details>`;

  html += `</div>`;
  trackingResult.innerHTML = html;
}

trackForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const lockTime = trackLockedUntil();
  if (lockTime > Date.now()) {
    const minutes = Math.ceil((lockTime - Date.now()) / 60000);
    trackMessage.textContent = `Too many lookup attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
    return;
  }

  const id = trackingId.value.trim();
  const phone = cleanPhone(trackingPhone.value);
  const email = trackingEmail.value.trim().toLowerCase();

  trackingResult.innerHTML = "";

  if (!id && (!phone || !email)) {
    trackMessage.textContent = "Enter both phone number and email address, or enter a request ID with one matching contact detail.";
    trackingPhone.focus();
    return;
  }

  if (id && !phone && !email) {
    trackMessage.textContent = "For security, enter the request ID plus the phone number or email used to book.";
    trackingPhone.focus();
    return;
  }

  trackMessage.textContent = "Looking up requests...";

  let matchedRequests = [];
  const rpcRequestId = id || null;
  const { data: rpcData, error: rpcError } = await shiftFuelDb
    .rpc("public_track_request", {
      p_request_id: rpcRequestId,
      p_phone: phone,
      p_email: email,
    });

  if (!rpcError) {
    matchedRequests = rpcData || [];
  } else {
    if (!isMissingRpcError(rpcError)) {
      console.warn("Track lookup blocked:", rpcError);
      recordTrackFailedAttempt();
      trackMessage.textContent = "Unable to look up your request. Please try again.";
      return;
    }

    console.warn("Track RPC unavailable, falling back to direct lookup:", rpcError);

    let query = shiftFuelDb
      .from("service_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (id) {
      query = query.eq("id", id);
    } else if (email) {
      query = query.ilike("customer_email", email);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Tracking lookup error:", error);
      recordTrackFailedAttempt();
      trackMessage.textContent = "Unable to look up your request. Please try again.";
      return;
    }

    matchedRequests = (data || []).filter((request) => {
      const phoneMatches = phone && cleanPhone(request.customer_phone) === phone;
      const emailMatches = email && String(request.customer_email || "").toLowerCase() === email;
      return id ? (phoneMatches || emailMatches) : (phoneMatches && emailMatches);
    });
  }

  if (matchedRequests.length === 0) {
    recordTrackFailedAttempt();
    trackMessage.textContent = "No requests found matching that information. Please check your phone number and email, then try again.";
    return;
  }

  clearTrackAttempts();
  verifiedTrackingContact = { phone, email };
  trackMessage.textContent = "";
  window._trackingRequests = matchedRequests;
  await renderAllRequests(matchedRequests, phone, email);
});

// ── Completion-form change delegation ────────────────────────────────────────
trackingResult.addEventListener('change', (event) => {
  const form = event.target.closest('.complete-booking-form');
  if (!form) return;

  const t = event.target;

  // Service type: update visibility, details panel, estimate, and return times
  if (t.matches('.cb-service-type')) {
    cbUpdateServiceControls(form);
    cbUpdateServiceDetails(form);
    cbUpdateEstimate(form);
    cbRefreshReturnTimes(form);
    return;
  }

  // Service date: repopulate return time dropdown
  if (t.matches('.cb-service-date')) {
    cbRefreshReturnTimes(form);
    return;
  }

  // Vehicle year or make: reload model dropdown
  if (t.matches('.cb-vehicle-year') || t.matches('.cb-vehicle-make')) {
    cbLoadModels(form);
    return;
  }

  // Wash package, fuel type, fuel estimate, inspection: update estimate + details
  if (t.matches('.cb-wash-package') || t.matches('.cb-fuel-type') ||
      t.matches('.cb-fuel-estimate') || t.matches('.cb-quick-inspection')) {
    cbUpdateEstimate(form);
    cbUpdateServiceDetails(form);
  }
});

trackingResult.addEventListener("click", async (event) => {
  // ── Pending-booking cancel flow ──────────────────────────────────────────
  const cbCancelBtn = event.target.closest('.cb-cancel-btn');
  const cbBackBtn = event.target.closest('.cb-back-btn');
  const cbConfirmCancelBtn = event.target.closest('.cb-confirm-cancel-btn');

  if (cbCancelBtn) {
    const card = cbCancelBtn.closest('.pending-completion-card');
    if (card) {
      card.querySelector('.complete-booking-form').hidden = true;
      card.querySelector('.cancel-panel').hidden = false;
    }
    return;
  }

  if (cbBackBtn) {
    const card = cbBackBtn.closest('.pending-completion-card');
    if (card) {
      card.querySelector('.complete-booking-form').hidden = false;
      card.querySelector('.cancel-panel').hidden = true;
    }
    return;
  }

  if (cbConfirmCancelBtn) {
    const requestId = cbConfirmCancelBtn.dataset.requestId;
    cbConfirmCancelBtn.disabled = true;
    cbConfirmCancelBtn.textContent = 'Canceling…';
    trackMessage.textContent = '';

    const { error } = await shiftFuelDb.rpc('public_cancel_request', {
      p_request_id: requestId,
      p_phone: verifiedTrackingContact.phone,
      p_email: verifiedTrackingContact.email,
      p_reason: 'Customer declined service',
    });

    if (error && !isMissingRpcError(error)) {
      // Fallback direct update
      await shiftFuelDb.from('service_requests').update({
        status: 'customer_canceled',
        cancellation_reason: 'Customer declined service',
      }).eq('id', requestId);
    } else if (error && isMissingRpcError(error)) {
      await shiftFuelDb.from('service_requests').update({
        status: 'customer_canceled',
        notes: 'Customer declined service via Track page',
      }).eq('id', requestId);
    }

    trackMessage.textContent = 'Request canceled.';
    // Re-render the card as a regular canceled card
    const { data: refreshed } = await shiftFuelDb.rpc('public_track_request', {
      p_request_id: requestId,
      p_phone: verifiedTrackingContact.phone,
      p_email: verifiedTrackingContact.email,
    });
    if (refreshed?.[0]) {
      const photos = await loadRequestPhotos(refreshed[0].id);
      const review = await loadRequestReview(refreshed[0].id);
      renderRequest(refreshed[0], photos, review);
    }
    return;
  }

  const showCancelButton = event.target.closest(".show-cancel-request");
  const confirmCancelButton = event.target.closest(".confirm-cancel-request");
  const submitReviewButton = event.target.closest(".submit-service-review");

  if (submitReviewButton) {
    const panel = submitReviewButton.closest(".review-panel");
    const rating = panel.querySelector("input[name='service-rating']:checked")?.value;
    const comments = panel.querySelector("#service-review-comments")?.value.trim() || "";
    const requestId = submitReviewButton.dataset.requestId;

    if (!rating) {
      trackMessage.textContent = "Choose a rating before submitting your review.";
      return;
    }

    if (Number(rating) <= 3 && !comments) {
      trackMessage.textContent = "Please add a comment for ratings of 3 or below so we know what to fix.";
      panel.querySelector("#service-review-comments")?.focus();
      return;
    }

    submitReviewButton.disabled = true;
    submitReviewButton.textContent = "Submitting...";
    trackMessage.textContent = "";

    let usedDirectReviewInsert = false;
    let { error } = await shiftFuelDb.rpc("public_submit_service_review", {
      p_request_id: requestId,
      p_phone: verifiedTrackingContact.phone || submitReviewButton.dataset.customerPhone || "",
      p_email: verifiedTrackingContact.email || submitReviewButton.dataset.customerEmail || "",
      p_rating: Number(rating),
      p_comments: comments,
    });

    if (error && isMissingRpcError(error)) {
      console.warn("Review RPC unavailable or rejected, falling back to direct insert:", error);
      usedDirectReviewInsert = true;
      const reviewRow = {
        service_request_id: requestId,
        rating: Number(rating),
        comments,
        customer_name: submitReviewButton.dataset.customerName || null,
        customer_phone: submitReviewButton.dataset.customerPhone || null,
        customer_email: submitReviewButton.dataset.customerEmail || null,
      };

      ({ error } = await shiftFuelDb.from("service_reviews").insert(reviewRow));

      if (error?.code === "PGRST204") {
        delete reviewRow.customer_name;
        delete reviewRow.customer_phone;
        delete reviewRow.customer_email;
        ({ error } = await shiftFuelDb.from("service_reviews").insert(reviewRow));
      }
    } else if (error) {
      console.warn("Review submit blocked:", error);
    }

    if (error?.code === "23505") {
      await markReviewComplete(requestId);
      panel.remove();
      trackMessage.textContent = "Thank you for reviewing our service.";
      routeHomeAfterReview();
      return;
    }

    if (error) {
      console.error("Review submit error:", error);
      if (error.code === "42P01" || error.code === "PGRST205") {
        trackMessage.textContent = "Review table is missing in Supabase. Run supabase-service-reviews.sql.";
      } else if (error.code === "42501" || String(error.message || "").toLowerCase().includes("row-level security")) {
        trackMessage.textContent = "Supabase blocked review saving. Run the review SQL again so the insert policy is added.";
      } else {
        trackMessage.textContent = `Could not save the review: ${error.message || "Supabase rejected the request."}`;
      }
      submitReviewButton.disabled = false;
      submitReviewButton.textContent = "Submit review";
      return;
    }

    if (usedDirectReviewInsert) {
      await markReviewComplete(requestId);
    }
    panel.remove();
    trackMessage.textContent = "Thank you for reviewing our service.";
    routeHomeAfterReview();
    return;
  }

  if (showCancelButton) {
    const card = showCancelButton.closest(".track-request-card") || trackingResult;
    const panel = card.querySelector(".cancel-panel");
    const reasonInput = card.querySelector(".customer-cancel-reason");

    if (panel) {
      panel.hidden = !panel.hidden;
    }

    if (reasonInput && panel && !panel.hidden) {
      reasonInput.focus();
    }

    return;
  }

  if (!confirmCancelButton) {
    return;
  }

  const requestId = confirmCancelButton.dataset.requestId;
  const card = confirmCancelButton.closest(".track-request-card") || trackingResult;
  const reasonInput = card.querySelector(".customer-cancel-reason");
  const reason = reasonInput?.value.trim() || "";

  if (!reason) {
    trackMessage.textContent = "Please add a reason before canceling.";
    reasonInput?.focus();
    return;
  }

  confirmCancelButton.textContent = "Canceling...";
  confirmCancelButton.disabled = true;
  trackMessage.textContent = "";

  let data = null;
  let { error } = await shiftFuelDb.rpc("public_cancel_request", {
    p_request_id: requestId,
    p_phone: verifiedTrackingContact.phone,
    p_email: verifiedTrackingContact.email,
    p_reason: reason,
  });

  if (error && isMissingRpcError(error)) {
    console.warn("Cancel RPC unavailable, falling back to direct update:", error);
    ({ data, error } = await shiftFuelDb
      .from("service_requests")
      .update({
        status: "customer_canceled",
        cancellation_reason: reason,
      })
      .eq("id", requestId)
      .select()
      .single());

    if (error?.code === "PGRST204") {
      ({ data, error } = await shiftFuelDb
        .from("service_requests")
        .update({
          status: "customer_canceled",
          notes: `Customer cancellation reason: ${reason}`,
        })
        .eq("id", requestId)
        .select()
        .single());
    }
  } else if (!error) {
    const { data: refreshed, error: refreshError } = await shiftFuelDb.rpc("public_track_request", {
      p_request_id: requestId,
      p_phone: verifiedTrackingContact.phone,
      p_email: verifiedTrackingContact.email,
    });

    if (refreshError) {
      error = refreshError;
    } else {
      data = refreshed?.[0] || null;
    }
  } else {
    console.warn("Cancel blocked:", error);
  }

  if (error || !data) {
    console.error("Customer cancellation error:", error);
    trackMessage.textContent = "Could not cancel this request.";
    confirmCancelButton.textContent = "Confirm cancellation";
    confirmCancelButton.disabled = false;
    return;
  }

  trackMessage.textContent = "Request canceled.";
  const photos = await loadRequestPhotos(data.id);
  const review = await loadRequestReview(data.id);
  renderRequest(data, photos, review);
});

// ── Complete booking (pending_customer_info) ──────────────────────────────────

let stripeInstance = null;

function getStripe() {
  if (!stripeInstance && window.Stripe) {
    const pk = window.SHIFTFUEL_STRIPE_PUBLISHABLE_KEY;
    if (pk) stripeInstance = window.Stripe(pk);
  }
  return stripeInstance;
}

// ── Payment modal ─────────────────────────────────────────────────────────────

let _cbModal = null;
let _cbModalCard = null;       // { elements, cardElement }
let _cbModalRpcFn = null;      // async (paymentIntentId) → error | null
let _cbModalMeta  = null;      // { authAmountCents, serviceLabel, customerName, customerEmail }
let _cbModalFormStatusEl = null;
let _cbModalSubmitBtn    = null;

function initCbPaymentModal() {
  if (_cbModal) return;
  const el = document.createElement('div');
  el.className = 'cb-payment-modal-backdrop';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Payment authorization');
  el.innerHTML = `
    <div class="cb-payment-modal-dialog">
      <button class="cb-payment-modal-close" type="button" aria-label="Close">&times;</button>
      <div class="cb-payment-modal-lock-icon" aria-hidden="true">&#128274;</div>
      <h3 class="cb-payment-modal-title">Secure payment authorization</h3>
      <p class="cb-payment-modal-desc">
        Enter your card details to authorize payment.
        Your card will not be charged until your service is complete.
      </p>
      <div class="cb-payment-modal-card-wrap">
        <div id="cb-modal-card-element" class="stripe-card-element"></div>
      </div>
      <p class="cb-payment-modal-error"></p>
      <button class="button primary cb-payment-modal-authorize" type="button">
        Authorize Payment &amp; Confirm Booking
      </button>
      <p class="cb-payment-modal-status form-status" role="status"></p>
    </div>
  `;
  document.body.appendChild(el);
  _cbModal = el;

  el.addEventListener('click', (e) => { if (e.target === el) _closeCbModal(false); });
  el.querySelector('.cb-payment-modal-close').addEventListener('click', () => _closeCbModal(false));
  el.querySelector('.cb-payment-modal-authorize').addEventListener('click', _handleCbModalAuthorize);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _cbModal && !_cbModal.hidden) _closeCbModal(false);
  });
}

function _openCbModal(meta, rpcFn, formStatusEl, submitBtn) {
  initCbPaymentModal();
  _cbModalMeta         = meta;
  _cbModalRpcFn        = rpcFn;
  _cbModalFormStatusEl = formStatusEl;
  _cbModalSubmitBtn    = submitBtn;

  // Reset modal state
  _cbModal.querySelector('.cb-payment-modal-error').textContent  = '';
  _cbModal.querySelector('.cb-payment-modal-status').textContent = '';
  const authorizeBtn = _cbModal.querySelector('.cb-payment-modal-authorize');
  authorizeBtn.disabled    = false;
  authorizeBtn.textContent = 'Authorize Payment & Confirm Booking';

  // Mount a fresh Stripe card element
  const stripe = getStripe();
  if (stripe) {
    const elements = stripe.elements();
    const cardEl = elements.create('card', {
      style: { base: { fontSize: '16px', color: '#1a1a1a', fontFamily: 'inherit' } },
    });
    const mountEl = document.getElementById('cb-modal-card-element');
    mountEl.innerHTML = '';
    cardEl.mount(mountEl);
    cardEl.on('change', (ev) => {
      _cbModal.querySelector('.cb-payment-modal-error').textContent = ev.error?.message || '';
    });
    _cbModalCard = { elements, cardElement: cardEl };
  } else {
    _cbModalCard = null;
  }

  _cbModal.hidden = false;
  document.body.style.overflow = 'hidden';
  _cbModal.querySelector('.cb-payment-modal-authorize').focus();
}

function _closeCbModal(succeeded) {
  if (!_cbModal) return;
  _cbModal.hidden = true;
  document.body.style.overflow = '';

  if (_cbModalCard?.cardElement) {
    _cbModalCard.cardElement.unmount();
    _cbModalCard = null;
  }

  if (!succeeded && _cbModalFormStatusEl) {
    _cbModalFormStatusEl.textContent = 'Payment authorization was not completed. Please try again.';
  }
  if (_cbModalSubmitBtn) {
    _cbModalSubmitBtn.disabled = false;
  }

  _cbModalRpcFn  = null;
  _cbModalMeta   = null;
  _cbModalFormStatusEl = null;
  _cbModalSubmitBtn    = null;
}

async function _handleCbModalAuthorize() {
  const errorEl   = _cbModal.querySelector('.cb-payment-modal-error');
  const statusEl  = _cbModal.querySelector('.cb-payment-modal-status');
  const authorizeBtn = _cbModal.querySelector('.cb-payment-modal-authorize');

  errorEl.textContent  = '';
  statusEl.textContent = 'Authorizing…';
  authorizeBtn.disabled = true;

  try {
    const stripe = getStripe();
    let paymentIntentId = null;

    if (stripe && _cbModalCard?.cardElement) {
      const { authAmountCents, serviceLabel, customerName, customerEmail } = _cbModalMeta;
      const piRes = await fetch('/api/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_cents: authAmountCents, customer_name: customerName, customer_email: customerEmail, service_label: serviceLabel }),
      });
      const piData = await piRes.json();
      if (!piRes.ok) throw new Error(piData.error || 'Could not create payment authorization.');

      const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(piData.client_secret, {
        payment_method: { card: _cbModalCard.cardElement },
      });

      if (confirmError) {
        errorEl.textContent  = confirmError.message;
        statusEl.textContent = '';
        authorizeBtn.disabled = false;
        return;
      }

      paymentIntentId = paymentIntent.id;
    }

    // Save booking details + move to worker queue
    const rpcError = await _cbModalRpcFn(paymentIntentId);
    if (rpcError) throw rpcError;

    statusEl.textContent = 'Your booking has been confirmed.';
    authorizeBtn.textContent = '✓ Confirmed';

    setTimeout(() => {
      _closeCbModal(true);
      // Re-run the tracking lookup to replace the completion form with the confirmed status card
      const phone = verifiedTrackingContact?.phone || '';
      const email = verifiedTrackingContact?.email || '';
      if (phone || email) {
        shiftFuelDb.rpc('public_track_request', { p_request_id: null, p_phone: phone, p_email: email })
          .then(({ data }) => {
            if (data?.length) {
              window._trackingRequests = data;
              renderAllRequests(data, phone, email);
            }
          })
          .catch(() => {});
      }
    }, 1500);

  } catch (err) {
    console.error('Payment modal error:', err);
    errorEl.textContent  = err.message || 'Payment authorization failed. Please try again.';
    statusEl.textContent = '';
    authorizeBtn.disabled = false;
  }
}

// ── Form submit → validate → open payment modal ───────────────────────────────

trackingResult.addEventListener('submit', async (event) => {
  const form = event.target.closest('.complete-booking-form');
  if (!form) return;
  event.preventDefault();

  const requestId = form.dataset.requestId;
  const statusEl  = form.querySelector('.cb-status');
  const submitBtn = form.querySelector('.cb-submit-btn');

  const val     = (cls) => (form.querySelector(`.${cls}`)?.value || '').trim();
  const checked = (cls) => form.querySelector(`.${cls}`)?.checked === true;

  const customerName    = val('cb-customer-name');
  const addrStreet      = val('cb-address-street');
  const addrApt         = val('cb-address-apt');
  const addrCity        = val('cb-address-city');
  const addrState       = val('cb-address-state');
  const addrZip         = val('cb-address-zip');
  const year            = val('cb-vehicle-year');
  const make            = val('cb-vehicle-make');
  const model           = val('cb-vehicle-model');
  const color           = val('cb-vehicle-color');
  const plate           = val('cb-license-plate');
  const parkingLoc      = val('cb-parking-location');
  const keyHandoff      = val('cb-key-handoff');
  const parkingMapUrl   = val('cb-parking-map-url');
  const serviceType     = val('cb-service-type');
  const needsFuel       = serviceType === 'fuel' || serviceType === 'car-wash-fuel';
  const needsWash       = serviceType === 'car-wash' || serviceType === 'car-wash-fuel';
  const fuelType        = val('cb-fuel-type');
  const fuelEstimate    = val('cb-fuel-estimate');
  const washPackage     = val('cb-wash-package');
  const serviceDate     = val('cb-service-date');
  const returnTime      = val('cb-return-time');
  const quickInspection = checked('cb-quick-inspection');
  const notes           = val('cb-notes');
  const agreed          = checked('cb-agreed');

  // ── Validate (matches Book Now field order) ───────────────────────────────
  const fail = (msg, selector) => {
    if (statusEl) statusEl.textContent = msg;
    if (selector) form.querySelector(selector)?.focus();
    return true;
  };

  if (!customerName && fail('Please enter your name.', '.cb-customer-name')) return;
  if (!addrStreet  && fail('Please enter the street address.', '.cb-address-street')) return;
  if (!addrCity    && fail('Please enter the city.', '.cb-address-city')) return;
  if (!addrZip     && fail('Please enter the ZIP code.', '.cb-address-zip')) return;
  if ((!year || !make || !model || !color || !plate) && fail('Please fill in all vehicle fields.', '.cb-vehicle-year')) return;
  if (!parkingLoc  && fail('Please describe where your vehicle will be parked.', '.cb-parking-location')) return;
  if (!keyHandoff  && fail('Please describe how to pick up your keys.', '.cb-key-handoff')) return;
  if (!serviceType && fail('Please select a service type.', '.cb-service-type')) return;
  if (needsFuel && !fuelType     && fail('Please select a fuel type.', '.cb-fuel-type')) return;
  if (needsFuel && !fuelEstimate && fail('Please select the estimated fuel amount.', '.cb-fuel-estimate')) return;
  if (needsWash && !washPackage  && fail('Please select a car wash package.', '.cb-wash-package')) return;
  if (!serviceDate && fail('Please enter a service date.', '.cb-service-date')) return;
  if (!returnTime  && fail('Please enter a desired return time.', '.cb-return-time')) return;
  if (!agreed && fail('Please check the agreement box to confirm your booking.', '.cb-agreed')) return;

  if (statusEl) statusEl.textContent = '';
  submitBtn.disabled = true;

  // ── Compute auth amount (matches cbUpdateEstimate display) ───────────────────
  const washPkg        = WASH_PACKAGES.find((p) => p.value === washPackage) || null;
  const fuelEstimateRange = FUEL_ESTIMATE_RANGES.find((r) => r.value === fuelEstimate) || null;
  const gallons        = needsFuel && fuelEstimateRange ? fuelEstimateRange.gallons : 0;
  const ppg            = CB_AVG_FUEL_PRICES[fuelType] || CB_AVG_FUEL_PRICES.Regular;
  const fuelAmt        = gallons * ppg;
  const washFee        = needsWash && washPkg ? washPkg.price : 0;
  const washConvFee    = needsWash && washPkg ? CB_FEES.washConvenience : 0;
  const fuelConvFee    = needsFuel ? CB_FEES.fuelConvenience : 0;
  const inspFee        = quickInspection ? CB_FEES.quickInspection : 0;
  const estimatedTotal = (fuelAmt + washFee + washConvFee + fuelConvFee + inspFee) || null;
  const authAmountCents = Math.max(Math.round((estimatedTotal || 1) * 100), 50);

  const requestData = (window._trackingRequests || []).find((r) => r.id === requestId);

  // ── Build the RPC call to run after payment succeeds ─────────────────────
  const rpcFn = async (paymentIntentId) => {
    const { error } = await shiftFuelDb.rpc('customer_complete_booking', {
      p_request_id:           requestId,
      p_phone:                verifiedTrackingContact.phone || '',
      p_email:                verifiedTrackingContact.email || '',
      p_service_type:         serviceType,
      p_service_label:        serviceLabelFromType(serviceType),
      p_service_date:         serviceDate   || null,
      p_desired_return_time:  returnTime    || null,
      p_fuel_type:            needsFuel ? (fuelType || null) : null,
      p_wash_package:         needsWash ? (washPackage || null) : null,
      p_wash_package_label:   needsWash ? (washPkg?.label || null) : null,
      p_wash_fee:             needsWash && washPkg ? washPkg.price : null,
      p_estimated_gallons:    needsFuel && fuelEstimateRange ? fuelEstimateRange.gallons : null,
      p_quick_inspection:     quickInspection,
      p_quick_inspection_fee: quickInspection ? 5 : 0,
      p_address_street:       addrStreet    || null,
      p_address_apt:          addrApt       || null,
      p_address_city:         addrCity      || null,
      p_address_state:        addrState     || null,
      p_address_zip:          addrZip       || null,
      p_parking_location:     parkingLoc    || null,
      p_key_handoff_details:  keyHandoff    || null,
      p_parking_map_url:      parkingMapUrl || null,
      p_vehicle_year:         year,
      p_vehicle_make:         make,
      p_vehicle_model:        model,
      p_vehicle_color:        color,
      p_license_plate:        plate,
      p_estimated_total:      estimatedTotal,
      p_payment_intent_id:    paymentIntentId || null,
      p_customer_notes:       notes || null,
    });

    if (!error) {
      // Re-render the card as a normal in-progress request
      setTimeout(async () => {
        const { data: refreshed } = await shiftFuelDb.rpc('public_track_request', {
          p_request_id: requestId,
          p_phone: verifiedTrackingContact.phone,
          p_email: verifiedTrackingContact.email,
        });
        if (refreshed?.[0]) {
          const photos = await loadRequestPhotos(refreshed[0].id);
          const review = await loadRequestReview(refreshed[0].id);
          renderRequest(refreshed[0], photos, review);
        }
        if (statusEl) statusEl.textContent = 'Your booking has been confirmed.';
      }, 1000);
    }

    return error || null;
  };

  // ── Open the payment modal ────────────────────────────────────────────────
  _openCbModal(
    {
      authAmountCents,
      serviceLabel:  serviceLabelFromType(serviceType) || requestData?.service_label || 'ShiftFuel service',
      customerName:  requestData?.customer_name  || '',
      customerEmail: requestData?.customer_email || '',
    },
    rpcFn,
    statusEl,
    submitBtn,
  );
});

// After any render that inserts a .complete-booking-form, initialise dropdowns
// and controls. Uses a stored request reference keyed to the form's request ID.
const _svcControlsObserver = new MutationObserver(() => {
  document.querySelectorAll('.complete-booking-form').forEach((form) => {
    if (!form.dataset.svcControlsReady) {
      form.dataset.svcControlsReady = '1';
      const requestId = form.dataset.requestId;
      const request = (window._trackingRequests || []).find((r) => r.id === requestId) || null;
      cbUpdateServiceControls(form);
      cbInitForm(form, request);
    }
  });
});
_svcControlsObserver.observe(trackingResult, { childList: true, subtree: true });
