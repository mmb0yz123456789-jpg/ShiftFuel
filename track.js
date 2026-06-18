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

function serviceLabelFromType(type) {
  return SERVICE_OPTIONS.find((o) => o.value === type)?.label || type || '';
}

function renderPendingCompletionCard(request) {
  const serviceDate = request.service_date
    ? new Date(request.service_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  const address = [request.address_street, request.address_apt, request.address_city, request.address_state, request.address_zip]
    .filter(Boolean).join(', ') || request.hospital || '';
  const serviceOpts = SERVICE_OPTIONS.map((o) =>
    `<option value="${escapeHtml(o.value)}"${request.service_type === o.value ? ' selected' : ''}>${escapeHtml(o.label)}</option>`
  ).join('');

  return `
    <article class="track-request-card pending-completion-card" data-request-id="${escapeHtml(request.id)}">
      <div class="pending-action-banner">
        <span class="pending-action-icon">&#9888;</span>
        Action required — Review and confirm your service
      </div>

      <form class="booking-form complete-booking-form" data-request-id="${escapeHtml(request.id)}">
        <fieldset>
          <legend>Service details</legend>
          <p class="field-help">Review what was requested. You can update the service type before confirming. Once confirmed, your request enters the worker queue.</p>
          <div class="field-grid">
            <label>Service type <span class="required-mark">*</span>
              <select class="cb-service-type" required>
                <option value="">Select service</option>
                ${serviceOpts}
              </select>
            </label>
            <label>Service date
              <input class="cb-service-date" type="date" value="${escapeHtml(request.service_date || '')}">
            </label>
            <label>Desired return time
              <input class="cb-return-time" type="time" value="${escapeHtml(request.desired_return_time ? request.desired_return_time.slice(0, 5) : '')}">
            </label>
          </div>
          ${address ? `<p class="field-help"><strong>Service address:</strong> ${escapeHtml(address)}</p>` : ''}
          ${request.parking_location ? `<p class="field-help"><strong>Parking:</strong> ${escapeHtml(request.parking_location)}</p>` : ''}
        </fieldset>

        <fieldset>
          <legend>Your vehicle</legend>
          <div class="field-grid">
            <label>Year <span class="required-mark">*</span>
              <input class="cb-vehicle-year" type="text" placeholder="2020" value="${escapeHtml(request.vehicle_year || '')}" required>
            </label>
            <label>Make <span class="required-mark">*</span>
              <input class="cb-vehicle-make" type="text" placeholder="Toyota" value="${escapeHtml(request.vehicle_make || '')}" required>
            </label>
            <label>Model <span class="required-mark">*</span>
              <input class="cb-vehicle-model" type="text" placeholder="Camry" value="${escapeHtml(request.vehicle_model || '')}" required>
            </label>
            <label>Color <span class="required-mark">*</span>
              <input class="cb-vehicle-color" type="text" placeholder="Silver" value="${escapeHtml(request.vehicle_color || '')}" required>
            </label>
            <label>License plate <span class="required-mark">*</span>
              <input class="cb-license-plate" type="text" placeholder="ABC 1234" value="${escapeHtml(request.license_plate || '')}" required>
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Payment authorization</legend>
          <p class="field-help">Your card will be authorized but not charged until service is complete. The final amount may vary based on actual fuel cost.</p>
          <div id="cb-card-element-${escapeHtml(request.id)}" class="stripe-card-element"></div>
          <p class="cb-card-error"></p>
        </fieldset>

        <div class="pending-form-actions">
          <button class="button primary cb-submit-btn" type="submit">Confirm booking</button>
          <button class="button danger cb-cancel-btn" type="button">Cancel this request</button>
        </div>
        <p class="cb-status form-status" role="status"></p>
      </form>

      <div class="cancel-panel" hidden>
        <p><strong>Cancel this service request?</strong></p>
        <p class="field-help">Your request will be marked canceled. No payment will be collected and no worker will be assigned.</p>
        <div class="pending-form-actions">
          <button class="button danger cb-confirm-cancel-btn" data-request-id="${escapeHtml(request.id)}" type="button">Yes, cancel request</button>
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
    return;
  }

  clearTrackAttempts();
  verifiedTrackingContact = { phone, email };
  trackMessage.textContent = "";
  window._trackingRequests = matchedRequests;
  await renderAllRequests(matchedRequests, phone, email);
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
const mountedStripeCards = new Map(); // requestId → { elements, cardElement }

function getStripe() {
  if (!stripeInstance && window.Stripe) {
    const pk = window.SHIFTFUEL_STRIPE_PUBLISHABLE_KEY;
    if (pk) stripeInstance = window.Stripe(pk);
  }
  return stripeInstance;
}

function mountStripeCardForRequest(requestId) {
  const stripe = getStripe();
  if (!stripe) return;
  if (mountedStripeCards.has(requestId)) return;

  const mountEl = document.getElementById(`cb-card-element-${requestId}`);
  if (!mountEl) return;

  const elements = stripe.elements();
  const cardElement = elements.create('card', {
    style: {
      base: { fontSize: '16px', color: '#1a1a1a', fontFamily: 'inherit' },
    },
  });
  cardElement.mount(mountEl);
  cardElement.on('change', (event) => {
    const errEl = mountEl.closest('form')?.querySelector('.cb-card-error');
    if (errEl) errEl.textContent = event.error ? event.error.message : '';
  });
  mountedStripeCards.set(requestId, { elements, cardElement });
}

// Mount cards for any pending-completion requests after rendering
function mountPendingCards() {
  document.querySelectorAll('.complete-booking-form').forEach((form) => {
    mountStripeCardForRequest(form.dataset.requestId);
  });
}

// Patch renderAllRequests to call mountPendingCards after setting innerHTML
const _origRenderAllRequests = renderAllRequests;

trackingResult.addEventListener('submit', async (event) => {
  const form = event.target.closest('.complete-booking-form');
  if (!form) return;
  event.preventDefault();

  const requestId = form.dataset.requestId;
  const statusEl = form.querySelector('.cb-status');
  const submitBtn = form.querySelector('.cb-submit-btn');
  const cardErrorEl = form.querySelector('.cb-card-error');

  const val = (cls) => (form.querySelector(`.${cls}`)?.value || '').trim();
  const serviceType = val('cb-service-type');
  const serviceDate = val('cb-service-date');
  const returnTime  = val('cb-return-time');
  const year  = val('cb-vehicle-year');
  const make  = val('cb-vehicle-make');
  const model = val('cb-vehicle-model');
  const color = val('cb-vehicle-color');
  const plate = val('cb-license-plate');

  if (!serviceType) {
    if (statusEl) statusEl.textContent = 'Please select a service type.';
    form.querySelector('.cb-service-type')?.focus();
    return;
  }
  if (!year || !make || !model || !color || !plate) {
    if (statusEl) statusEl.textContent = 'Please fill in all vehicle fields.';
    return;
  }

  if (statusEl) statusEl.textContent = 'Authorizing payment…';
  submitBtn.disabled = true;

  try {
    const stripe = getStripe();
    const stripeCard = mountedStripeCards.get(requestId);

    let paymentIntentId = null;

    if (stripe && stripeCard) {
      // Look up estimated total from the rendered request data
      const requestData = (window._trackingRequests || []).find((r) => r.id === requestId);
      const amountCents = requestData?.estimated_total
        ? Math.round(Number(requestData.estimated_total) * 100)
        : 100; // $1.00 placeholder authorization if no estimate

      const piRes = await fetch('/api/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount_cents: Math.max(amountCents, 50),
          customer_name: requestData?.customer_name || '',
          customer_email: requestData?.customer_email || '',
          service_label: serviceLabelFromType(serviceType) || requestData?.service_label || 'ShiftFuel service',
        }),
      });

      const piData = await piRes.json();
      if (!piRes.ok) throw new Error(piData.error || 'Could not create payment authorization.');

      const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(piData.client_secret, {
        payment_method: { card: stripeCard.cardElement },
      });

      if (confirmError) {
        if (cardErrorEl) cardErrorEl.textContent = confirmError.message;
        if (statusEl) statusEl.textContent = '';
        submitBtn.disabled = false;
        return;
      }

      paymentIntentId = paymentIntent.id;
    }

    // Call customer_complete_booking RPC
    const { error } = await shiftFuelDb.rpc('customer_complete_booking', {
      p_request_id: requestId,
      p_phone: verifiedTrackingContact.phone || '',
      p_email: verifiedTrackingContact.email || '',
      p_service_type: serviceType,
      p_service_label: serviceLabelFromType(serviceType),
      p_service_date: serviceDate || null,
      p_desired_return_time: returnTime || null,
      p_vehicle_year: year,
      p_vehicle_make: make,
      p_vehicle_model: model,
      p_vehicle_color: color,
      p_license_plate: plate,
      p_payment_intent_id: paymentIntentId || null,
    });

    if (error) throw error;

    if (statusEl) statusEl.textContent = 'Booking confirmed! Your request has entered the queue.';
    mountedStripeCards.delete(requestId);

    // Refresh the display
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
    }, 1200);
  } catch (err) {
    console.error('complete-booking error:', err);
    if (statusEl) statusEl.textContent = `Could not complete booking: ${err.message || err}`;
    submitBtn.disabled = false;
  }
});

// After any render that places .complete-booking-form elements, mount Stripe cards
const _trackResultObserver = new MutationObserver(() => mountPendingCards());
_trackResultObserver.observe(trackingResult, { childList: true, subtree: true });
