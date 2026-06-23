const trackForm = document.querySelector("#track-form");
const trackingId = document.querySelector("#tracking-id");
const trackingPhone = document.querySelector("#tracking-phone");
const trackingEmail = document.querySelector("#tracking-email");
const trackMessage = document.querySelector("#track-message");
const trackingResult = document.querySelector("#tracking-result");
const refreshStatusBtn = document.querySelector("#refresh-status-btn");

const shiftFuelDb = window.ShiftFuelSupabase;
const TRACK_LOCK_KEY = "shiftfuel_track_locked_until";
const TRACK_ATTEMPT_KEY = "shiftfuel_track_failed_attempts";
const FUEL_AUTHORIZATION_BUFFER_GALLONS = {
  5: 10,
  10: 15,
  15: 20,
  20: 30,
  25: 30,
  30: 40,
};
let verifiedTrackingContact = { phone: "", email: "" };

// Unified terminal/closed status list — keep in sync with admin.js, worker.js,
// and the SQL terminal-status list in supabase-production-rls-lockdown.sql.
const terminalStatuses = ["complete", "denied", "customer_canceled", "canceled", "cancelled", "unable_to_complete", "auto_reversed", "closed_no_charge", "canceled_return_completed"];
const closedStatuses   = ["denied", "customer_canceled", "canceled", "cancelled", "unable_to_complete", "auto_reversed", "closed_no_charge", "canceled_return_completed"];
// cancelled_pending_key_return is deliberately NOT terminal/closed — the
// request stays in the in-progress section until the worker confirms the
// key/vehicle has been returned (status then flips to "cancelled").
const slotHoldingStatuses = new Set([
  "accepted", "key_received",
  "pickup_vehicle_photo_uploaded", "pickup_odometer_photo_uploaded", "pickup_fuel_gauge_photo_uploaded",
  "vehicle_picked_up", "service_in_progress",
  "fueling_in_progress", "car_wash_in_progress", "partial_service_complete",
  "fueling_complete", "fuel_receipt_uploaded",
  "car_wash_complete", "car_wash_after_fuel_in_progress",
  "wash_receipt_uploaded", "wash_receipt_after_fuel_uploaded",
  "fueling_after_wash_in_progress", "fuel_receipt_after_wash_uploaded", "fuel_and_wash_complete",
  "service_complete", "receipts_recorded",
  "returned_location_pending", "return_location_recorded", "return_photos_needed",
  "dropoff_vehicle_photo_uploaded", "dropoff_odometer_photo_uploaded", "dropoff_fuel_gauge_photo_uploaded",
  "vehicle_returned", "inspection_needed", "inspection_recorded",
  "final_payment_processed", "awaiting_key_return", "keys_returned",
  "return_requested", "customer_return_requested",
  "cancelled_pending_key_return",
  "payment_issue", "authorization_too_low", "pending_customer_payment",
]);

function fuelAuthorizationGallons(fuelRange) {
  return FUEL_AUTHORIZATION_BUFFER_GALLONS[Number(fuelRange?.value || fuelRange?.gallons || 0)] || Number(fuelRange?.gallons || 0);
}

function authorizationAmountForEstimate({ needsFuel, fuelRange, pricePerGallon, washAmount = 0, needsWash = false, quickInspection = false } = {}) {
  if (!needsFuel) {
    return cbServicePricingParts({
      needsFuel: false,
      needsWash,
      fuelAmount: 0,
      washAmount,
      quickInspection,
    }).total;
  }

  const authFuelAmount = fuelAuthorizationGallons(fuelRange) * Number(pricePerGallon || 0);
  return cbServicePricingParts({
    needsFuel: true,
    needsWash,
    fuelAmount: authFuelAmount,
    washAmount,
    quickInspection,
  }).total;
}

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

// Friendly labels for every status — keep in sync with admin.js and worker.js.
// Raw database status strings must never be shown to a customer.
const statusLabels = {
  pending: "Request received",
  request_received: "Request received",
  accepted: "Accepted",
  key_received: "Key received",
  pickup_vehicle_photo_uploaded: "Vehicle picked up",
  pickup_odometer_photo_uploaded: "Vehicle picked up",
  pickup_fuel_gauge_photo_uploaded: "Vehicle picked up",
  vehicle_picked_up: "Vehicle picked up",
  service_in_progress: "Service in progress",
  service_complete: "Service complete",
  fueling_in_progress: "Service in progress",
  fueling_complete: "Fueling complete",
  fuel_receipt_uploaded: "Fuel receipt recorded",
  car_wash_in_progress: "Service in progress",
  car_wash_complete: "Vehicle cleaning complete",
  car_wash_after_fuel_in_progress: "Service in progress",
  wash_receipt_uploaded: "Car wash receipt recorded",
  wash_receipt_after_fuel_uploaded: "Car wash receipt recorded",
  fueling_after_wash_in_progress: "Service in progress",
  fuel_receipt_after_wash_uploaded: "Fuel receipt recorded",
  receipts_recorded: "Receipts recorded",
  returned_location_pending: "Vehicle return location needed",
  return_location_recorded: "Return location recorded",
  return_photos_needed: "Return photos needed",
  dropoff_vehicle_photo_uploaded: "Vehicle returned",
  dropoff_odometer_photo_uploaded: "Vehicle returned",
  vehicle_returned: "Vehicle returned",
  inspection_needed: "Quick inspection needed",
  inspection_recorded: "Quick inspection complete",
  final_payment_processed: "Final payment processed",
  awaiting_key_return: "Awaiting key return",
  keys_returned: "Keys returned",
  partial_service_complete: "Partial service complete",
  complete: "Complete",
  denied: "Denied",
  customer_canceled: "Canceled by customer",
  canceled: "Canceled",
  unable_to_complete: "Unable to complete",
  auto_reversed: "Missed — auto-reversed",
  closed_no_charge: "Closed — no charge",
  pending_customer_info: "Complete your booking",
  pending_customer_payment: "Awaiting customer payment",
  return_requested: "Return requested",
  customer_return_requested: "Return requested",
  payment_issue: "Payment issue",
  authorization_too_low: "Authorization issue",
  canceled_return_completed: "Return completed",
  cancelled: "Cancelled",
  cancelled_pending_key_return: "Cancellation received — awaiting key/vehicle return",
};

// statusSteps is now dynamic — see buildStatusSteps(request)

const DENY_REASONS = [
  'Car wash unavailable',
  'Customer requested cancellation',
  'Duplicate request',
  'Fuel door locked',
  'Fuel station unavailable',
  'Keys unavailable',
  'Other',
  'We currently do not serve this area.',
  'Payment authorization issue',
  'Safety concern',
  'Service location issue',
  'Vehicle inaccessible',
  'Vehicle not located',
  'Weather conditions',
];

function cleanPhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function attachPhoneInputFormatting(input) {
  if (!input || input.dataset.phoneFormatBound) return;
  input.dataset.phoneFormatBound = "1";
  input.addEventListener("input", () => {
    const digitsBeforeCursor = cleanPhone(input.value.slice(0, input.selectionStart || 0)).length;
    const digits = cleanPhone(input.value).slice(0, 10);
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

attachPhoneInputFormatting(trackingPhone);

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

// Cancellation tiers — keep this in sync with cancellationOutcomeForStatus()
// in api/payments.js. The customer must see the exact fee story they'll be
// charged before confirming.
const CANCELLATION_MODAL_COPY = {
  request_received: "Are you sure you want to cancel this request? No cancellation fee will be charged.",
  pending: "Are you sure you want to cancel this request? No cancellation fee will be charged.",
  accepted: "Are you sure you want to cancel this request? No cancellation fee will be charged.",
  key_received: "Are you sure you want to cancel this request? A $15 cancellation fee applies because your key has already been received.",
};
const CANCELLATION_MODAL_COPY_SERVICE_STARTED = "Are you sure you want to cancel this request? A $15 cancellation fee, Stripe processing fee, and any submitted receipt totals for services already started or completed may apply.";
const CANCELLATION_SERVICE_STARTED_STATUSES = new Set([
  'vehicle_picked_up', 'fueling_in_progress', 'car_wash_in_progress', 'service_in_progress',
  'partial_service_complete', 'pickup_vehicle_photo_uploaded', 'pickup_odometer_photo_uploaded',
  'pickup_fuel_gauge_photo_uploaded', 'fueling_complete', 'fuel_receipt_uploaded',
  'car_wash_complete', 'wash_receipt_uploaded', 'car_wash_after_fuel_in_progress',
  'fueling_after_wash_in_progress', 'wash_receipt_after_fuel_uploaded', 'fuel_receipt_after_wash_uploaded',
  'service_complete', 'receipts_recorded',
]);
const CANCELLATION_BLOCKED_MESSAGES = {
  vehicle_returned: "This request can no longer be cancelled because the vehicle has already been returned.",
  complete: "This request is already complete.",
  denied: "This request has already been denied.",
  cancelled: "This request has already been cancelled.",
  cancelled_pending_key_return: "This request has already been cancelled.",
  customer_canceled: "This request has already been cancelled.",
  canceled: "This request has already been cancelled.",
};

function cancellationModalTextForStatus(status) {
  if (CANCELLATION_MODAL_COPY[status]) return CANCELLATION_MODAL_COPY[status];
  if (CANCELLATION_SERVICE_STARTED_STATUSES.has(status)) return CANCELLATION_MODAL_COPY_SERVICE_STARTED;
  return "Are you sure you want to cancel this request? A cancellation fee may apply.";
}

function canCustomerCancel(request) {
  return !CANCELLATION_BLOCKED_MESSAGES[request.status]
    && request.status !== 'return_requested'
    && request.status !== 'customer_return_requested'
    && (Object.prototype.hasOwnProperty.call(CANCELLATION_MODAL_COPY, request.status)
      || CANCELLATION_SERVICE_STARTED_STATUSES.has(request.status));
}

// Same backend validation used by the main Book Now page — keeps the
// service-area anchor/radius and Nominatim geocoding in one server-side place.
async function validateCbServiceArea({ street = '', apt = '', city = '', state = '', zip = '' } = {}) {
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

async function submitCustomerReturnRequest(requestId, button = null) {
  const originalText = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = "Submitting...";
  }
  trackMessage.textContent = "";

  try {
    const res = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'customer_request_return',
        request_id: requestId,
        phone: verifiedTrackingContact.phone,
        email: verifiedTrackingContact.email,
      }),
    });
    const result = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error('[track] Return request failed:', result.error);
      trackMessage.textContent = result.error || "Could not submit your return request. Please contact ShiftFuel.";
      if (button) {
        button.disabled = false;
        button.textContent = originalText || "Request vehicle return";
      }
      return;
    }
  } catch (err) {
    console.error('[track] Return request network error:', err);
    trackMessage.textContent = "Network error. Please try again or contact ShiftFuel.";
    if (button) {
      button.disabled = false;
      button.textContent = originalText || "Request vehicle return";
    }
    return;
  }

  trackMessage.textContent = "Your return request has been submitted. A ShiftFuel team member will return your vehicle as soon as safely possible.";

  try {
    await refreshTrackedRequestsAfterAction();
  } catch (refreshError) {
    console.error('[track] Refresh after return request failed:', refreshError);
  }
}

async function fetchTrackedRequests(requestId = null) {
  const { data, error } = await shiftFuelDb.rpc("public_track_request", {
    p_request_id: requestId,
    p_phone: verifiedTrackingContact.phone,
    p_email: verifiedTrackingContact.email,
  });

  if (error) throw error;
  return data || [];
}

async function refreshTrackedRequestsAfterAction(requestId = null) {
  const refreshed = await fetchTrackedRequests(requestId);
  if (!requestId) {
    window._trackingRequests = refreshed;
    await renderAllRequests(refreshed, verifiedTrackingContact.phone, verifiedTrackingContact.email);
    return refreshed;
  }

  const existing = window._trackingRequests || [];
  const byId = new Map(existing.map((request) => [request.id, request]));
  refreshed.forEach((request) => byId.set(request.id, request));
  const merged = Array.from(byId.values());
  window._trackingRequests = sortTrackedRequests(merged);
  await renderAllRequests(window._trackingRequests, verifiedTrackingContact.phone, verifiedTrackingContact.email);
  return refreshed;
}

async function cancelCustomerRequestFromTrack({ requestId, reason }) {
  const res = await fetch('/api/payments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'customer_cancel',
      request_id: requestId,
      phone: verifiedTrackingContact.phone,
      email: verifiedTrackingContact.email,
      reason,
    }),
  });
  const result = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error = new Error(result.error || "Could not cancel this request. Please contact ShiftFuel.");
    error.payload = result;
    throw error;
  }

  return result;
}

function cancellationReasonForDisplay(request) {
  const notes = String(request.notes || "");
  const noteReason = notes.match(/\[denied[^\]]*\]\s*Admin denial reason:\s*([^\n]+)/i)?.[1] || "";
  const reason = String(request.cancellation_reason || noteReason || "").trim();

  if (!reason || !["denied", "customer_canceled", "cancelled", "cancelled_pending_key_return"].includes(request.status)) {
    return "";
  }

  const looksLikeOperationalNotes = /\[(pickup_time|dropoff_time|receipt_totals|service_unable)\]|Quick inspection recorded|receipt recorded/i.test(reason);

  if (looksLikeOperationalNotes) {
    return "";
  }

  return reason;
}

function trackRequestNumber(id) {
  return `SF-${String(id || "").slice(0, 8).toUpperCase()}`;
}

function friendlyStatusLabel(status) {
  return statusLabels[status] || "Status update";
}

function importantPaymentLabel(request) {
  const status = request.payment_status || "";
  if (request.status === "payment_issue" || status === "capture_failed") return "Payment issue";
  if (request.status === "authorization_too_low") return "Authorization issue";
  if (request.status === "pending_customer_payment") return "Payment needed";
  if (status === "payment_release_failed") return "Payment review needed";
  return "";
}

function sortTrackedRequests(requests) {
  return [...(requests || [])].sort((a, b) => {
    const ad = new Date(a.updated_at || a.created_at || 0).getTime();
    const bd = new Date(b.updated_at || b.created_at || 0).getTime();
    return bd - ad;
  });
}

function requestSummaryHtml(request, options = {}) {
  const vehicle = [request.vehicle_year, request.vehicle_make, request.vehicle_model].filter(Boolean).join(" ") || "Vehicle details pending";
  const serviceDate = request.service_date
    ? new Date(request.service_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";
  const service = request.service_label || serviceLabelFromType(request.service_type) || request.service_type || "";
  const status = options.statusLabel || friendlyStatusLabel(request.status);
  const payment = importantPaymentLabel(request);
  const statusClass = options.statusClass || "";

  return `
    <summary class="track-request-summary">
      <div class="track-request-summary-main">
        <span class="track-request-number">${escapeHtml(trackRequestNumber(request.id))}</span>
        <span class="track-request-vehicle">${escapeHtml(vehicle)}</span>
        <span class="track-request-meta">
          ${serviceDate ? `<span>${escapeHtml(serviceDate)}</span>` : ""}
          ${service ? `<span>${escapeHtml(service)}</span>` : ""}
          ${payment ? `<span>${escapeHtml(payment)}</span>` : ""}
        </span>
      </div>
      <span class="status-pill ${escapeHtml(statusClass)}">${escapeHtml(status)}</span>
    </summary>
  `;
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

const PAYMENT_RECOVERY_RATE = 0.029;
const PAYMENT_RECOVERY_FIXED = 0.30;
const BASE_FUEL_SERVICE_FEE = 15;
const BASE_WASH_SERVICE_FEE = 15;
const BASE_QUICK_INSPECTION_FEE = 5;

function roundMoneyValue(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

// True only if admin/worker explicitly chose to charge the service fee for
// an unable_to_complete service (default is to waive it entirely). Read-only
// here — the customer tracker never sets this, only displays the consequence.
function serviceUnableFeeCharged(request, type) {
  const notes = String(request.notes || '');
  return new RegExp(`\\[service_unable_fee_charged ${type}\\]`).test(notes);
}

function transactionPricingSummary(request, receiptTotals = { fuel: 0, wash: 0 }) {
  const fuelBase = requestNeedsFuel(request) && (Number(receiptTotals.fuel || 0) > 0 || serviceUnableFeeCharged(request, 'fuel')) ? BASE_FUEL_SERVICE_FEE : 0;
  const washBase = requestNeedsWash(request) && (Number(receiptTotals.wash || 0) > 0 || serviceUnableFeeCharged(request, 'wash')) ? BASE_WASH_SERVICE_FEE : 0;
  const inspection = request.quick_inspection ? BASE_QUICK_INSPECTION_FEE : 0;
  const netTarget = roundMoneyValue(Number(receiptTotals.fuel || 0) + Number(receiptTotals.wash || 0) + fuelBase + washBase + inspection);
  const roundedTotal = netTarget > 0
    ? Math.ceil((netTarget + PAYMENT_RECOVERY_FIXED) / (1 - PAYMENT_RECOVERY_RATE))
    : 0;
  const recovery = roundMoneyValue(roundedTotal - netTarget);
  let fuelRecovery = 0;
  let washRecovery = 0;

  if (fuelBase && washBase) {
    // Recovery is calculated once on the whole transaction, then split
    // proportionally by base service fee (equal split when bases are
    // equal). Leftover penny from rounding goes to the fuel side.
    const recoveryCents = Math.round(recovery * 100);
    const totalBase = fuelBase + washBase;
    const fuelCents = Math.round(recoveryCents * (fuelBase / totalBase));
    fuelRecovery = fuelCents / 100;
    washRecovery = (recoveryCents - fuelCents) / 100;
  } else if (fuelBase) {
    fuelRecovery = recovery;
  } else if (washBase) {
    washRecovery = recovery;
  }

  return {
    fuel: roundMoneyValue(fuelBase + fuelRecovery),
    wash: roundMoneyValue(washBase + washRecovery),
    inspection,
    recovery,
    total: roundedTotal,
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

function formatPhone(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === '1') return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  return raw || '';
}

function formatTimeShort(isoOrTime) {
  if (!isoOrTime) return '';
  try {
    const d = new Date(isoOrTime);
    if (isNaN(d)) return '';
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch { return ''; }
}

function formatReturnTime(t) {
  if (!t) return '';
  // t may be "17:00:00" or "17:00"
  const parts = String(t).split(':');
  if (parts.length < 2) return t;
  const h = Number(parts[0]), m = Number(parts[1]);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
}

function renderAssignedWorker(request) {
  if (!request.assigned_worker_name) return '';

  const photoFrame = window.ShiftFuelPhoto
    ? window.ShiftFuelPhoto.renderPhotoFrame(
        { photo_url: request.assigned_worker_photo_url || '', cropped_photo_url: request.assigned_worker_photo_url || '', original_photo_url: request.assigned_worker_original_photo_url || '', name: request.assigned_worker_name || '' },
        { clickable: true }
      )
    : (request.assigned_worker_photo_url
        ? `<div class="worker-profile-photo-frame"><img class="worker-profile-photo" src="${escapeHtml(request.assigned_worker_photo_url)}" alt="${escapeHtml(request.assigned_worker_name || '')}"></div>`
        : `<div class="worker-profile-photo-frame"><div class="worker-profile-photo-placeholder">No photo</div></div>`);

  return `
    <section class="assigned-worker-card">
      ${photoFrame}
      <div class="assigned-worker-info">
        <p class="eyebrow">Assigned ShiftFuel employee</p>
        <h3>${escapeHtml(request.assigned_worker_name)}</h3>
        ${request.assigned_worker_phone ? `<p class="worker-phone">${escapeHtml(formatPhone(request.assigned_worker_phone))}</p>` : ''}
        <span class="worker-verified-badge">✓ Verified ShiftFuel Employee</span>
      </div>
    </section>
  `;
}

function buildStatusSteps(request) {
  const needsFuel = requestNeedsFuel(request);
  const needsWash = requestNeedsWash(request);
  const needsInspection = !!request.quick_inspection;

  const steps = [
    { key: 'request_received',    label: 'Request received' },
    { key: 'accepted',            label: 'Accepted' },
    { key: 'key_received',        label: 'Key received' },
    { key: 'vehicle_picked_up',   label: 'Vehicle picked up' },
    { key: 'service_in_progress', label: 'Service in progress' },
  ];

  if (needsFuel) {
    steps.push({ key: 'fueling',               label: 'Fueling',               nested: true, parentKey: 'service_in_progress' });
    steps.push({ key: 'fuel_receipt_recorded', label: 'Fuel receipt recorded', nested: true, parentKey: 'service_in_progress' });
  }
  if (needsWash) {
    steps.push({ key: 'vehicle_cleaning',          label: 'Vehicle cleaning',          nested: true, parentKey: 'service_in_progress' });
    steps.push({ key: 'car_wash_receipt_recorded', label: 'Car wash receipt recorded', nested: true, parentKey: 'service_in_progress' });
  }

  steps.push({ key: 'service_complete', label: 'Service complete' });
  steps.push({ key: 'vehicle_returned', label: 'Vehicle returned' });

  if (needsInspection) {
    steps.push({ key: 'quick_inspection',     label: 'Quick inspection' });
    steps.push({ key: 'inspection_in_progress', label: 'Inspection in progress', nested: true, parentKey: 'quick_inspection' });
    steps.push({ key: 'inspection_complete',  label: 'Inspection complete',    nested: true, parentKey: 'quick_inspection' });
  }

  steps.push({ key: 'final_payment_processed', label: 'Final payment processed' });
  steps.push({ key: 'keys_returned',           label: 'Keys returned' });
  steps.push({ key: 'complete',                label: 'Complete' });

  return steps;
}

function timelineStatus(request) {
  return request.payment_status === 'capture_failed' ? 'payment_issue' : request.status;
}

const RETURN_STATUSES = new Set([
  'returned_location_pending', 'return_location_recorded', 'return_photos_needed',
  'dropoff_vehicle_photo_uploaded', 'dropoff_odometer_photo_uploaded',
  'vehicle_returned', 'inspection_needed', 'inspection_recorded',
  'pending_customer_payment', 'payment_issue', 'authorization_too_low',
  'awaiting_key_return', 'complete',
]);

function allReceiptsDone(request) {
  const s = timelineStatus(request);
  if (RETURN_STATUSES.has(s) || s === 'receipts_recorded') return true;
  const needsFuel = requestNeedsFuel(request);
  const needsWash = requestNeedsWash(request);
  // Fuel-only: fuel receipt uploaded means service done
  if (needsFuel && !needsWash) return ['fuel_receipt_uploaded', 'fuel_receipt_after_wash_uploaded'].includes(s);
  // Wash-only: wash receipt uploaded means service done
  if (needsWash && !needsFuel) return ['wash_receipt_uploaded', 'wash_receipt_after_fuel_uploaded'].includes(s);
  // Both: need receipts_recorded (already handled above)
  return false;
}

function isStepDone(stepKey, request) {
  const s = timelineStatus(request);

  const AT_OR_AFTER_KEY_RECEIVED = new Set([
    'key_received', 'pickup_vehicle_photo_uploaded', 'pickup_odometer_photo_uploaded',
    'pickup_fuel_gauge_photo_uploaded', 'vehicle_picked_up', 'service_in_progress',
    'fueling_in_progress', 'car_wash_in_progress', 'car_wash_after_fuel_in_progress',
    'fueling_after_wash_in_progress', 'fueling_complete', 'car_wash_complete',
    'fuel_receipt_uploaded', 'wash_receipt_uploaded', 'wash_receipt_after_fuel_uploaded',
    'fuel_receipt_after_wash_uploaded', 'service_complete', 'receipts_recorded',
    ...RETURN_STATUSES,
  ]);

  const AT_OR_AFTER_VEHICLE_PICKED_UP = new Set([
    'vehicle_picked_up', 'service_in_progress', 'fueling_in_progress', 'car_wash_in_progress',
    'car_wash_after_fuel_in_progress', 'fueling_after_wash_in_progress',
    'fueling_complete', 'car_wash_complete', 'fuel_receipt_uploaded', 'wash_receipt_uploaded',
    'wash_receipt_after_fuel_uploaded', 'fuel_receipt_after_wash_uploaded', 'service_complete',
    'receipts_recorded', ...RETURN_STATUSES,
  ]);

  switch (stepKey) {
    case 'request_received':
      return s !== 'request_received' && s !== 'pending_review';
    case 'accepted':
      return !['request_received', 'pending_review', 'accepted'].includes(s);
    case 'key_received':
      return AT_OR_AFTER_KEY_RECEIVED.has(s);
    case 'vehicle_picked_up':
      return AT_OR_AFTER_VEHICLE_PICKED_UP.has(s);
    case 'service_in_progress':
    case 'service_complete':
      return allReceiptsDone(request);
    case 'fueling': {
      const fuelDone = new Set([
        'fueling_complete', 'fuel_receipt_uploaded', 'fuel_receipt_after_wash_uploaded',
        'car_wash_after_fuel_in_progress', 'wash_receipt_after_fuel_uploaded',
        'service_complete', 'receipts_recorded', ...RETURN_STATUSES,
      ]);
      return fuelDone.has(s);
    }
    case 'fuel_receipt_recorded': {
      const fuelReceiptDone = new Set([
        'fuel_receipt_uploaded', 'fuel_receipt_after_wash_uploaded',
        'service_complete', 'receipts_recorded', ...RETURN_STATUSES,
      ]);
      return fuelReceiptDone.has(s);
    }
    case 'vehicle_cleaning': {
      const washDone = new Set([
        'car_wash_complete', 'wash_receipt_uploaded', 'wash_receipt_after_fuel_uploaded',
        'fueling_after_wash_in_progress', 'fuel_receipt_after_wash_uploaded',
        'service_complete', 'receipts_recorded', ...RETURN_STATUSES,
      ]);
      return washDone.has(s);
    }
    case 'car_wash_receipt_recorded': {
      const washReceiptDone = new Set([
        'wash_receipt_uploaded', 'wash_receipt_after_fuel_uploaded',
        'service_complete', 'receipts_recorded', ...RETURN_STATUSES,
      ]);
      return washReceiptDone.has(s);
    }
    case 'vehicle_returned':
      return new Set(['vehicle_returned', 'inspection_needed', 'inspection_recorded',
        'pending_customer_payment', 'awaiting_key_return', 'complete']).has(s);
    case 'quick_inspection':
    case 'inspection_in_progress':
    case 'inspection_complete':
      return new Set(['inspection_recorded', 'pending_customer_payment', 'awaiting_key_return', 'complete']).has(s);
    case 'final_payment_processed':
      return request.payment_status === 'captured' || s === 'awaiting_key_return' || s === 'complete';
    case 'keys_returned':
      return s === 'complete';
    case 'complete':
      return isFinalRequestComplete(request);
    default:
      return false;
  }
}

const FINAL_COMPLETE_STATUSES = new Set(['complete', 'completed', 'finalized']);

function isFinalRequestComplete(request) {
  return FINAL_COMPLETE_STATUSES.has(String(request?.status || '').toLowerCase());
}

function normalizeServiceFailureReason(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function serviceFailureReasons(request) {
  const notes = String(request?.notes || '');
  const reasons = serviceUnableReasonsFromNotes(request) || { fuel: '', wash: '' };
  reasons.fuel = normalizeServiceFailureReason(reasons.fuel);
  reasons.wash = normalizeServiceFailureReason(reasons.wash);

  // Extra protection for older notes/copy formats.
  for (const match of notes.matchAll(/\[service_unable\s+(fuel|wash)\][^\n:]*:\s*([^\n]+)/gi)) {
    reasons[match[1].toLowerCase()] = normalizeServiceFailureReason(match[2]);
  }
  for (const match of notes.matchAll(/(fuel|gas|car wash|wash)[^\n.]*?(?:could not be completed|not completed|unavailable|unable)[^\n:]*:?\s*([^\n]*)/gi)) {
    const rawType = match[1].toLowerCase();
    const type = rawType.includes('wash') ? 'wash' : 'fuel';
    const fallback = type === 'wash' ? 'Car wash unavailable' : 'Fuel service unavailable';
    reasons[type] = normalizeServiceFailureReason(match[2] || fallback);
  }

  const cancellationReason = normalizeServiceFailureReason(request?.cancellation_reason);
  if (cancellationReason) {
    const lower = cancellationReason.toLowerCase();
    if (!reasons.wash && /car wash|wash/.test(lower) && /unavailable|unable|not completed|cannot be completed|could not be completed/.test(lower)) {
      reasons.wash = cancellationReason;
    }
    if (!reasons.fuel && /fuel|gas/.test(lower) && /unavailable|unable|not completed|cannot be completed|could not be completed/.test(lower)) {
      reasons.fuel = cancellationReason;
    }
  }

  return reasons;
}

function failedReasonForStep(step, request) {
  const reasons = serviceFailureReasons(request);
  if (['fueling', 'fuel_receipt_recorded'].includes(step.key) && reasons.fuel) return reasons.fuel;
  if (['vehicle_cleaning', 'car_wash_receipt_recorded'].includes(step.key) && reasons.wash) return reasons.wash;
  return '';
}

function getStatusMessage(request) {
  const s = timelineStatus(request);
  const needsFuel = requestNeedsFuel(request);
  const needsWash = requestNeedsWash(request);

  if (['request_received', 'pending_review'].includes(s)) {
    return 'We received your ShiftFuel request. A team member will review and accept it shortly.';
  }
  if (s === 'accepted') {
    return 'A ShiftFuel employee accepted your request. We are confirming your key or handoff instructions.';
  }
  if (s === 'key_received') {
    return 'Your key or handoff instructions have been confirmed. Your vehicle pickup is next.';
  }
  if (['vehicle_picked_up', 'pickup_vehicle_photo_uploaded', 'pickup_odometer_photo_uploaded', 'pickup_fuel_gauge_photo_uploaded'].includes(s)) {
    return 'Your vehicle has been picked up. Service is starting.';
  }
  if (['service_in_progress', 'fueling_in_progress', 'car_wash_in_progress', 'car_wash_after_fuel_in_progress', 'fueling_after_wash_in_progress'].includes(s)) {
    if (needsFuel && needsWash) return 'Fueling and vehicle cleaning are in progress.';
    if (needsFuel) return 'Fueling is in progress.';
    if (needsWash) return 'Vehicle cleaning is in progress.';
    return 'Service is in progress.';
  }
  if (['fueling_complete', 'fuel_receipt_uploaded', 'fuel_receipt_after_wash_uploaded'].includes(s)) {
    if (needsWash && !allReceiptsDone(request)) return 'Fueling complete. Vehicle cleaning is next.';
    if (allReceiptsDone(request)) return 'Service is complete. Your vehicle is being returned to you.';
    return 'Fueling complete. Finalizing service.';
  }
  if (['car_wash_complete', 'wash_receipt_uploaded', 'wash_receipt_after_fuel_uploaded'].includes(s)) {
    if (needsFuel && !allReceiptsDone(request)) return 'Vehicle cleaning complete. Fueling is next.';
    if (allReceiptsDone(request)) return 'Service is complete. Your vehicle is being returned to you.';
    return 'Vehicle cleaning complete. Finalizing service.';
  }
  if (s === 'service_complete' || s === 'receipts_recorded') {
    return 'Receipt totals recorded. Final payment will be processed automatically after your vehicle is returned and inspection is completed, if selected.';
  }
  if (['returned_location_pending', 'return_location_recorded', 'return_photos_needed',
       'dropoff_vehicle_photo_uploaded', 'dropoff_odometer_photo_uploaded'].includes(s)) {
    return 'Your vehicle is being returned to its parking location.';
  }
  if (s === 'vehicle_returned') {
    if (request.quick_inspection) return 'Your vehicle has been returned. A quick inspection is next.';
    return 'Final payment is being processed automatically.';
  }
  if (s === 'inspection_needed' || s === 'inspection_recorded') {
    return 'A quick vehicle inspection is in progress. Final payment is being processed automatically.';
  }
  if (s === 'final_payment_processed') {
    return 'Final payment processed.';
  }
  if (s === 'pending_customer_payment' || s === 'payment_issue' || s === 'authorization_too_low') {
    return 'We could not process your final payment automatically. Please update your payment method so we can close out your service.';
  }
  if (s === 'awaiting_key_return') {
    return 'Final payment processed. Your keys are being returned to you.';
  }
  if (s === 'keys_returned') {
    return 'Your keys have been returned.';
  }
  if (s === 'complete') {
    return 'Your service is complete. Thank you for using ShiftFuel!';
  }
  return '';
}

function renderTimeline(request) {
  // No timeline for closed/terminal non-complete statuses
  if (closedStatuses.includes(request.status)) return '';
  if (request.status === 'cancelled_pending_key_return') {
    return `<p class="timeline-status-message">Cancellation received — awaiting key/vehicle return.</p>`;
  }

  const steps = buildStatusSteps(request);
  const finalComplete = isFinalRequestComplete(request);

  steps.forEach((step) => {
    step.failedReason = failedReasonForStep(step, request);
    step.failed = Boolean(step.failedReason);
    step.done = !step.failed && isStepDone(step.key, request);
  });

  const firstIncompleteIdx = finalComplete ? -1 : steps.findIndex((step) => !step.done && !step.failed);
  const activeKey = firstIncompleteIdx >= 0 ? steps[firstIncompleteIdx].key : null;
  const total = steps.length;
  const currentStepNum = firstIncompleteIdx >= 0 ? firstIncompleteIdx + 1 : total;

  const statusMsg = getStatusMessage(request);

  // Track which parent steps have had their first incomplete child claimed
  const firstIncompleteChildClaimed = {};

  let html = '';
  if (statusMsg) {
    html += `<p class="timeline-status-message">${escapeHtml(statusMsg)}</p>`;
  }
  html += `<div class="timeline-progress-label">Step ${currentStepNum} of ${total}</div>`;
  html += `<ol class="customer-timeline">`;

  steps.forEach((step) => {
    const done = step.done;
    const failed = step.failed;
    const isActive = !finalComplete && step.key === activeKey;

    // Show active arrow on the first incomplete nested child of an active parent
    let isActiveChild = false;
    if (!finalComplete && step.nested && step.parentKey && !done && !failed) {
      const parentActive = activeKey === step.parentKey;
      if (parentActive && !firstIncompleteChildClaimed[step.parentKey]) {
        isActiveChild = true;
        firstIncompleteChildClaimed[step.parentKey] = true;
      }
    }

    let cls = 'future';
    let icon = '○';
    if (failed) {
      cls = 'failed';
      icon = '×';
    } else if (done) {
      cls = 'done'; icon = '✓';
    } else if (isActive || isActiveChild) {
      cls = 'active'; icon = '➜';
    }

    const nestedCls = step.nested ? ' timeline-step-nested' : '';
    const reasonTitle = failed ? ` title="${escapeHtml(step.failedReason)}" aria-label="${escapeHtml(`${step.label}: ${step.failedReason}`)}"` : '';
    const reasonText = failed ? `<small class="timeline-failure-reason">${escapeHtml(step.failedReason)}</small>` : '';
    html += `<li class="timeline-step ${cls}${nestedCls}"${reasonTitle}><span class="timeline-icon">${icon}</span><p>${escapeHtml(step.label)}</p>${reasonText}</li>`;
  });

  html += `</ol>`;
  return html;
}

function renderServiceIssueBanner(request) {
  const unableReasons = serviceUnableReasonsFromNotes(request) || { fuel: '', wash: '' };
  const parts = [];
  if (unableReasons.fuel) parts.push({ service: 'Fuel Service', reason: unableReasons.fuel });
  if (unableReasons.wash) parts.push({ service: 'Car Wash Service', reason: unableReasons.wash });
  if (!parts.length && request && request.status === 'unable_to_complete') {
    parts.push({ service: 'Service', reason: request.cancellation_reason || 'A service issue was reported.' });
  }
  if (!parts.length) return '';

  return parts.map((p) => `
    <div class="service-issue-banner">
      <strong>⚠ Unable to do ${escapeHtml(p.service)} — ${escapeHtml(p.reason)}</strong>
    </div>
  `).join('');
}

function renderServicePackageDetails(request) {
  const needsFuel = requestNeedsFuel(request);
  const needsWash = requestNeedsWash(request);
  const washPkg = WASH_PACKAGES.find(p => p.value === request.wash_package);
  const parts = [];

  if (needsFuel) {
    parts.push(`<div class="service-package-block">
      <p class="service-package-title">⛽ Fuel Service</p>
      ${request.fuel_type ? `<p>Fuel type: <strong>${escapeHtml(request.fuel_type)}</strong></p>` : ''}
    </div>`);
  }

  if (needsWash && washPkg) {
    parts.push(`<div class="service-package-block">
      <p class="service-package-title">🚿 Car Wash: ${escapeHtml(washPkg.label)} Package</p>
      <ul class="service-package-list">
        ${washPkg.includes.map(i => `<li>${escapeHtml(i)}</li>`).join('')}
      </ul>
    </div>`);
  } else if (needsWash) {
    parts.push(`<div class="service-package-block"><p class="service-package-title">🚿 Car Wash Service</p></div>`);
  }

  if (!parts.length) return '';
  return `<section class="service-package-details">${parts.join('')}</section>`;
}

const PAYMENT_RELEASED_STATUSES = ['voided', 'authorization_released', 'refunded', 'auto_reversed'];

function renderEstimatedTotalCard(request) {
  if (request.estimated_total == null && request.final_total == null) return '';

  const isClosed = closedStatuses.includes(request.status);
  const holdReleased = isClosed && PAYMENT_RELEASED_STATUSES.includes(request.payment_status);
  const releaseFailed = isClosed && request.payment_status === 'payment_release_failed';

  if (holdReleased) {
    const amount = request.final_total != null ? request.final_total : request.estimated_total;
    return `
      <div class="estimated-total-card estimated-total-released">
        <span class="estimated-total-label">Authorization released</span>
        <span class="estimated-total-amount">${formatCurrency(amount)}</span>
        <p class="estimated-total-note">Your card was not charged.</p>
      </div>
    `;
  }

  if (releaseFailed) {
    const amount = request.estimated_total != null ? request.estimated_total : 0;
    return `
      <div class="estimated-total-card estimated-total-release-failed">
        <span class="estimated-total-label">Estimated hold</span>
        <span class="estimated-total-amount">${formatCurrency(amount)}</span>
        <p class="estimated-total-note">Your authorization hold is being released. This may take 1–3 business days depending on your bank.</p>
      </div>
    `;
  }

  const amount = request.final_total != null ? request.final_total : request.estimated_total;
  const label  = request.final_total != null ? 'Final Total' : 'Estimated Total';
  return `
    <div class="estimated-total-card">
      <span class="estimated-total-label">${escapeHtml(label)}</span>
      <span class="estimated-total-amount">${formatCurrency(amount)}</span>
    </div>
  `;
}

function renderReturnDetails(request) {
  if (!request.return_parking_location) return '';
  return `
    <section class="return-confirmation">
      <h4>Vehicle returned successfully</h4>
      <p><strong>Returned to:</strong> ${escapeHtml(request.return_parking_location)}</p>
      ${request.key_handoff_details ? `<p><strong>Keys:</strong> ${escapeHtml(request.key_handoff_details)}</p>` : ''}
    </section>
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
        { label: "Pickup odometer", types: ["pickup_odometer"] },
        { label: "Pickup fuel gauge", types: ["pickup_fuel_gauge"] },
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
  const fees = transactionPricingSummary(request, receiptTotals);
  const lines = [];

  if (requestNeedsFuel(request)) {
    lines.push(unableReasons.fuel
      ? `<p><strong>Fuel:</strong> Not completed. ${escapeHtml(unableReasons.fuel)}</p>`
      : `<p><strong>Fuel:</strong> ${formatCurrency(receiptTotals.fuel)} receipt + ${formatCurrency(fees.fuel)} service.</p>`);
  }

  if (requestNeedsWash(request)) {
    lines.push(unableReasons.wash
      ? `<p><strong>Car wash:</strong> Not completed. ${escapeHtml(unableReasons.wash)}</p>`
      : `<p><strong>Car wash:</strong> ${formatCurrency(receiptTotals.wash)} receipt + ${formatCurrency(fees.wash)} service.</p>`);
  }

  if (request.quick_inspection) {
    lines.push(`<p><strong>Quick inspection:</strong> ${formatCurrency(fees.inspection)}</p>`);
  }

  if (!lines.length && request.final_total == null) {
    return "";
  }

  return `
    <section class="inspection-summary">
      <h3>Service summary</h3>
      ${lines.join("")}
      <p class="field-help">Service prices include payment and operating costs. Final fuel cost is based on the actual receipt. Final totals are rounded up to the nearest dollar.</p>
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

function cbServicePricingParts({ needsFuel, needsWash, fuelAmount = 0, washAmount = 0, quickInspection = false }) {
  const fuelBase = needsFuel ? CB_FEES.fuelConvenience : 0;
  const washBase = needsWash ? CB_FEES.washConvenience : 0;
  const inspection = quickInspection ? CB_FEES.quickInspection : 0;
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
    // equal). Leftover penny from rounding goes to the fuel side.
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

  return {
    fuelService: roundMoneyValue(fuelBase + fuelRecovery),
    washService: roundMoneyValue(washBase + washRecovery),
    inspection,
    recovery,
    total: roundedTotal,
  };
}

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
function cbIsMissingRpcError(error) {
  const message = String(error?.message || '').toLowerCase();
  return ['PGRST202', 'PGRST204', '42883'].includes(error?.code)
    || message.includes('could not find the function')
    || (message.includes('function') && message.includes('does not exist'));
}
async function cbLoadWorkerAvailabilitySlots(dateValue) {
  if (!dateValue || !shiftFuelDb) return null;
  const { data, error } = await shiftFuelDb.rpc('public_worker_availability_slots', {
    p_service_date: dateValue,
    p_hospital: '',
  });
  if (!error) {
    return (data || []).map((row) => String(row.slot || '').slice(0, 5)).filter(Boolean);
  }
  if (!cbIsMissingRpcError(error)) {
    console.warn('Completion form worker availability lookup blocked:', error);
    return [];
  }
  console.warn('Worker availability RPC unavailable for completion form:', error);
  return null;
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
function cbFillReturnSelect(select, slots, bookedSlots, placeholder, preferredSlot = '') {
  const prev = select.value;
  const preferred = String(preferredSlot || '').slice(0, 5);
  const allSlots = preferred && !slots.includes(preferred)
    ? [...slots, preferred].sort((a, b) => cbMinutesFromSlot(a) - cbMinutesFromSlot(b))
    : slots;
  select.innerHTML = '';
  const blank = document.createElement('option'); blank.value = ''; blank.textContent = placeholder; select.append(blank);
  allSlots.forEach((slot) => {
    const opt = document.createElement('option'); opt.value = slot; opt.textContent = cbFormatTimeLabel(slot);
    if (bookedSlots.has(slot) && slot !== preferred) { opt.disabled = true; opt.textContent += ' — booked'; }
    if (slot === preferred) opt.textContent += ' — currently selected';
    select.append(opt);
  });
  if (preferred) select.value = preferred;
  else if (slots.includes(prev) && !bookedSlots.has(prev)) select.value = prev;
}

async function cbRefreshReturnTimes(form) {
  const timeSel   = form.querySelector('.cb-return-time');
  const timeHelp  = form.querySelector('.cb-time-help');
  const dateValue = (form.querySelector('.cb-service-date')?.value || '').trim();
  const svcType   = form.querySelector('.cb-service-type')?.value || '';
  const needsWash = svcType === 'car-wash' || svcType === 'car-wash-fuel';
  const preferredDate = timeSel?.dataset.preferredServiceDate || '';
  const preferredSlot = preferredDate && preferredDate === dateValue ? (timeSel?.dataset.preferredReturnTime || '') : '';
  if (!timeSel) return;
  if (!dateValue) { timeSel.innerHTML = '<option value="">Select a date first</option>'; return; }

  let bookedSlots = new Set();
  try {
    const { data } = await shiftFuelDb.rpc('public_booked_return_slots', { p_service_date: dateValue });
    if (data) bookedSlots = new Set((data)
      .filter((r) => slotHoldingStatuses.has(r.status))
      .map((r) => String(r.desired_return_time || '').slice(0, 5))
      .filter(Boolean));
  } catch (e) { console.warn('cbRefreshReturnTimes:', e); }

  const rawSlots = needsWash ? cbTimeSlots(9, 18) : cbTimeSlots(7, 22);
  let slots      = cbFutureSlotsForDate(rawSlots, dateValue);
  const availabilitySlots = await cbLoadWorkerAvailabilitySlots(dateValue);
  if (Array.isArray(availabilitySlots)) {
    slots = slots.filter((slot) => availabilitySlots.includes(slot));
  }
  const placeholder = needsWash
    ? (slots.length ? 'Select car wash return time' : 'No car wash times left today')
    : (slots.length ? 'Select return time' : 'No return times left today');
  cbFillReturnSelect(timeSel, slots, bookedSlots, placeholder, preferredSlot);
  if (timeHelp) {
    const availabilitySuffix = Array.isArray(availabilitySlots) && availabilitySlots.length === 0
      ? ' No worker availability is saved for this date.'
      : '';
    timeHelp.textContent = needsWash
      ? (slots.length ? `Car wash service selected. Return times are limited to 9:00 AM through 6:00 PM.${availabilitySuffix}` : `No more car wash return times are available today. Choose tomorrow or another future date.${availabilitySuffix}`)
      : (slots.length ? `Choose the time you want your vehicle returned.${availabilitySuffix}` : `No more return times are available today. Choose tomorrow or another future date.${availabilitySuffix}`);
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
  const authGallons = needsFuel ? fuelAuthorizationGallons(fuelRange) : 0;
  const authFuelAmt = authGallons * ppg;
  const washFee   = needsWash && washPkg ? washPkg.price : 0;
  const pricing   = cbServicePricingParts({
    needsFuel,
    needsWash: needsWash && !!washPkg,
    fuelAmount: fuelAmt,
    washAmount: washFee,
    quickInspection: insp,
  });

  const qHide = (cls, h) => { const el = form.querySelector(`.${cls}`); if (el) el.hidden = h; };
  const qText = (cls, t) => { const el = form.querySelector(`.${cls}`); if (el) el.textContent = t; };

  qHide('cb-payment-wash-row',       !(needsWash && washPkg));
  qHide('cb-payment-wash-conv-row',  !(needsWash && washPkg));
  qHide('cb-payment-price-row',      !needsFuel);
  qHide('cb-payment-fuel-row',       !needsFuel);
  qHide('cb-payment-fuel-conv-row',  !needsFuel);
  qHide('cb-payment-inspection-row', !insp);

  qText('cb-estimated-wash',  washPkg ? `${washPkg.label} — ${cbFormatCurrency(washFee)}` : '$0.00');
  qText('cb-wash-conv-fee',   cbFormatCurrency(pricing.washService));
  qText('cb-average-price',   cbFormatPricePerGallon(ppg));
  qText('cb-estimated-fuel',  needsFuel
    ? `${fuelRange?.label || '0 gallons'} selected. Authorization hold uses ${authGallons} gallons x ${cbFormatPricePerGallon(ppg)} = ${cbFormatCurrency(authFuelAmt)}. Final fuel cost is based on the actual receipt.`
    : cbFormatCurrency(fuelAmt));
  qText('cb-fuel-conv-fee',   cbFormatCurrency(pricing.fuelService));
  qText('cb-inspection-fee',  cbFormatCurrency(pricing.inspection));
  qText('cb-estimated-total', cbFormatCurrency(authorizationAmountForEstimate({
    needsFuel,
    fuelRange,
    pricePerGallon: ppg,
    needsWash: needsWash && !!washPkg,
    washAmount: washFee,
    quickInspection: insp,
  })));
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
  details.push('Service prices include payment and operating costs. Final fuel cost is based on the actual receipt. Final totals are rounded up to the nearest dollar.');
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
  const timeSel = form.querySelector('.cb-return-time');
  if (timeSel && request?.desired_return_time) {
    timeSel.dataset.preferredReturnTime = String(request.desired_return_time).slice(0, 5);
    timeSel.dataset.preferredServiceDate = request.service_date || '';
  }
  await cbRefreshReturnTimes(form);
  // Restore pre-selected return time if it survived the refresh
  if (timeSel && request?.desired_return_time) {
    const slot = String(request.desired_return_time).slice(0, 5);
    const opt = Array.from(timeSel.options).find((o) => o.value === slot && !o.disabled);
    if (opt) timeSel.value = slot;
  }

  // Attach custom date picker (replaces native <input type="date">)
  const dateHost = form.querySelector('.cb-service-date-host');
  if (dateHost && window.ShiftFuelDatePicker && !dateHost.dataset.pickerReady) {
    dateHost.dataset.pickerReady = '1';
    const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
    const maxD  = (() => { const d = new Date(); d.setMonth(d.getMonth()+3); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
    ShiftFuelDatePicker.attach(dateHost, { min: today, max: maxD });
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
      <details class="track-request-details">
        ${requestSummaryHtml(request, { statusLabel: "Action required" })}
        <div class="track-request-body">
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
                value="${escapeHtml(formatPhone(verifiedTrackingContact.phone || request.customer_phone || ''))}" readonly>
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
              <span>Key handoff details <span class="required-mark">Required</span></span>
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
                <div class="sfp-host cb-service-date-host">
                  <input type="hidden" class="cb-service-date" value="${escapeHtml(request.service_date || '')}">
                </div>
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
            <p>Service prices include payment and operating costs. Final fuel cost is based on the actual receipt. Final totals are rounded up to the nearest dollar.</p>
            <dl>
              <div class="cb-payment-wash-row" hidden>
                <dt>Car wash package</dt>
                <dd class="cb-estimated-wash">$0.00</dd>
              </div>
              <div class="cb-payment-wash-conv-row" hidden>
                <dt>Car wash service fee</dt>
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
                <dt>Fuel service fee</dt>
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
          <p class="field-help">The amount shown before payment is an authorization hold only. ShiftFuel captures the final amount after service is completed based on actual receipts and selected services, and any unused hold is released by your card issuer. Online card authorizations are typically valid for about 7 days; after final capture or release, your bank or credit card company may take a few business days to show the final amount or released hold on your account.</p>
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
        </div>
      </details>
    </article>
  `;
}

function renderPendingPaymentCard(request) {
  const vehicle = [request.vehicle_year, request.vehicle_make, request.vehicle_model].filter(Boolean).join(' ');
  const serviceDate = request.service_date
    ? new Date(request.service_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  const finalTotal = request.final_total != null ? formatCurrency(request.final_total) : null;

  const hasPreAuth = !!request.payment_intent_id;
  const captureFailed = request.payment_status === 'capture_failed';

  // Pre-authorized and capture succeeded or is pending — no action needed from customer.
  // Only show the payment button if capture explicitly failed or there was never a pre-auth.
  let paymentSection;
  if (hasPreAuth && !captureFailed) {
    paymentSection = `
      <div class="payment-authorized-notice">
        <strong>Payment method authorized</strong>
        <p>Final payment will be processed automatically after your service is completed. No action needed.</p>
        ${finalTotal ? `<div class="estimated-total-card"><span class="estimated-total-label">Final Total</span><span class="estimated-total-amount">${finalTotal}</span></div>` : ''}
      </div>
    `;
  } else if (hasPreAuth && captureFailed) {
    paymentSection = `
      <div class="action-required-banner">
        <strong>⚡ Action required — payment issue</strong>
        <p>We could not process your final payment automatically. Please update your payment method so we can close out your service.</p>
      </div>
      ${finalTotal ? `<div class="estimated-total-card"><span class="estimated-total-label">Final Total</span><span class="estimated-total-amount">${finalTotal}</span></div>` : ''}
      <div id="customer-payment-section-${escapeHtml(request.id)}" class="customer-payment-section">
        <p class="field-help">Enter new card details below to complete your payment.</p>
        <div class="stripe-card-element-wrap">
          <div id="customer-pay-card-${escapeHtml(request.id)}" class="stripe-card-element"></div>
        </div>
        <p class="customer-payment-error" id="customer-payment-error-${escapeHtml(request.id)}"></p>
        <button class="button primary confirm-and-pay" data-id="${escapeHtml(request.id)}" type="button">
          Confirm and Pay ${finalTotal ? finalTotal : ''}
        </button>
      </div>
    `;
  } else {
    // No pre-auth on file — customer must enter card details.
    paymentSection = `
      <div id="customer-payment-section-${escapeHtml(request.id)}" class="customer-payment-section">
        <p class="field-help">Please enter your card details to pay the final total.</p>
        <div class="stripe-card-element-wrap">
          <div id="customer-pay-card-${escapeHtml(request.id)}" class="stripe-card-element"></div>
        </div>
        <p class="customer-payment-error" id="customer-payment-error-${escapeHtml(request.id)}"></p>
        <button class="button primary confirm-and-pay" data-id="${escapeHtml(request.id)}" type="button">
          Confirm and Pay ${finalTotal ? finalTotal : ''}
        </button>
      </div>
    `;
  }

  const needsAction = !hasPreAuth || captureFailed;

  return `
    <article class="track-request-card track-payment-card" data-request-id="${escapeHtml(request.id)}">
      <details class="track-request-details">
        ${requestSummaryHtml(request, { statusLabel: needsAction ? "Awaiting your payment" : friendlyStatusLabel(request.status), statusClass: "status-pill-payment" })}
        <div class="track-request-body">
          ${needsAction ? `<div class="action-required-banner"><strong>⚡ Action required — Final payment needed</strong></div>` : ''}

      <p class="track-payment-intro">Your ShiftFuel service is complete!${needsAction ? ' Please review the details below and confirm your final payment.' : ''}</p>

      <div class="track-payment-summary">
        ${request.service_label ? `<p><strong>Service:</strong> ${escapeHtml(request.service_label)}</p>` : ''}
        ${request.return_parking_location ? `<p><strong>Vehicle returned to:</strong> ${escapeHtml(request.return_parking_location)}</p>` : ''}
        ${(needsAction && finalTotal) ? `<div class="estimated-total-card"><span class="estimated-total-label">Final Total</span><span class="estimated-total-amount">${finalTotal}</span></div>` : ''}
        ${request.notes ? `<p class="track-payment-notes"><strong>Notes:</strong> ${escapeHtml(request.notes)}</p>` : ''}
      </div>

      ${paymentSection}

      ${renderTimeline(request)}
        </div>
      </details>
    </article>
  `;
}

function renderReturnCompletedNotice(request) {
  if (request.status !== 'canceled_return_completed') return '';
  if (request.cancellation_fee_applied) {
    return `
      <div class="estimated-total-card">
        <span class="estimated-total-label">Vehicle returned</span>
        <p class="estimated-total-note">Your vehicle was returned. A $15 cancellation/service fee was charged because service had already started.</p>
      </div>
    `;
  }
  return `
    <div class="estimated-total-card estimated-total-released">
      <span class="estimated-total-label">Vehicle returned</span>
      <p class="estimated-total-note">Your vehicle was returned. Your authorization was released and you were not charged.</p>
    </div>
  `;
}

function renderReturnRequestedCard(request) {
  const vehicle = [request.vehicle_year, request.vehicle_make, request.vehicle_model].filter(Boolean).join(' ');
  const serviceDate = request.service_date
    ? new Date(request.service_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  return `
    <article class="track-request-card" data-request-id="${escapeHtml(request.id)}">
      <details class="track-request-details">
        ${requestSummaryHtml(request, { statusLabel: "Return requested" })}
        <div class="track-request-body">
          <p class="track-payment-intro"><strong>Return requested</strong></p>
          <p>Your return request was received. Because service had already started, completed receipt totals and a $15 cancellation/service fee may apply.</p>
        </div>
      </details>
    </article>
  `;
}

function needsCustomerPaymentAction(request) {
  return ['pending_customer_payment', 'payment_issue', 'authorization_too_low'].includes(request.status)
    || request.payment_status === 'capture_failed';
}

function renderRequestCard(request, photos = [], review = null) {
  if (request.status === 'pending_customer_info') {
    return renderPendingCompletionCard(request);
  }
  if (needsCustomerPaymentAction(request)) {
    return renderPendingPaymentCard(request);
  }
  if (request.status === 'return_requested' || request.status === 'customer_return_requested') {
    return renderReturnRequestedCard(request);
  }
  const statusLabel = friendlyStatusLabel(request.status);
  const cancellationReason = cancellationReasonForDisplay(request);
  const vehicle = [request.vehicle_year, request.vehicle_make, request.vehicle_model].filter(Boolean).join(' ');
  const serviceDate = request.service_date
    ? new Date(request.service_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  const returnTime = formatReturnTime(request.desired_return_time);
  const isReturned = ['vehicle_returned','returned_location_pending','return_location_recorded',
    'return_photos_needed','dropoff_vehicle_photo_uploaded','dropoff_odometer_photo_uploaded',
    'inspection_needed','inspection_recorded','awaiting_key_return','complete'].includes(request.status);

  const serviceArea = [request.address_street || request.hospital, request.address_city, request.address_state]
    .filter(Boolean).join(', ');
  const lastUpdated = request.updated_at
    ? new Date(request.updated_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '';

  return `
    <article class="track-request-card" data-request-id="${escapeHtml(request.id)}">
      <details class="track-request-details">
        ${requestSummaryHtml(request, { statusLabel, statusClass: request.status === 'complete' ? 'status-pill-complete' : '' })}

        <div class="track-request-body">
          ${renderEstimatedTotalCard(request)}
          ${renderServiceIssueBanner(request)}
          ${renderReturnCompletedNotice(request)}
          <div class="request-details">
            <p><strong>Date:</strong> ${escapeHtml(serviceDate)}</p>
            ${returnTime ? `<p><strong>Return by:</strong> ${escapeHtml(returnTime)}</p>` : ''}
            <p><strong>Vehicle:</strong> ${escapeHtml(vehicle)}${request.vehicle_color ? ', ' + escapeHtml(request.vehicle_color) : ''}</p>
            <p><strong>Service:</strong> ${escapeHtml(request.service_label || request.service_type || '')}</p>
            ${serviceArea ? `<p><strong>Service address:</strong> ${escapeHtml(serviceArea)}</p>` : ''}
            <p><strong>Parking:</strong> ${[request.parking_location, request.parking_spot ? 'spot ' + request.parking_spot : ''].filter(Boolean).map(escapeHtml).join(', ')}</p>
            ${lastUpdated ? `<p><strong>Last updated:</strong> ${escapeHtml(lastUpdated)}</p>` : ''}
            ${cancellationReason ? `<p><strong>Reason:</strong> ${escapeHtml(cancellationReason)}</p>` : ''}
            ${request.status === 'auto_reversed' ? `<p class="track-auto-reversed-note">Your service was not completed on the scheduled date, so your payment has been reversed.</p>` : ''}
          </div>
          ${renderServicePackageDetails(request)}
          ${isReturned ? renderReturnDetails(request) : ''}
          ${renderAssignedWorker(request)}
          ${renderTimeline(request)}
          ${serviceTimingFromNotes(request)}
          ${inspectionSummaryFromNotes(request)}
          ${request.status === 'complete' ? serviceSummaryFromRequest(request) : ''}
          ${renderPhotos(request, photos)}
          ${renderReviewPrompt(request, review)}
          ${canCustomerCancel(request) ? `
            <div class="tracking-actions">
              <button class="button danger show-cancel-request" type="button">Cancel request</button>
            </div>
            <div class="cancel-panel" hidden>
              <p class="field-help">${escapeHtml(cancellationModalTextForStatus(request.status))}</p>
              <label>
                Reason for cancellation (optional)
                <textarea class="customer-cancel-reason" rows="3" placeholder="Example: I no longer need service today."></textarea>
              </label>
              <div class="admin-button-row">
                <button class="button secondary keep-request" type="button">Keep request</button>
                <button class="button danger confirm-cancel-request" data-request-id="${escapeHtml(request.id)}" type="button">
                  Confirm cancellation
                </button>
              </div>
            </div>
          ` : (CANCELLATION_BLOCKED_MESSAGES[request.status] ? `<p class="field-help">${escapeHtml(CANCELLATION_BLOCKED_MESSAGES[request.status])}</p>` : '')}
        </div>
      </details>
    </article>
  `;
}

const cancelledStatuses = new Set(['customer_canceled', 'canceled', 'cancelled', 'canceled_return_completed']);
const deniedOnlyStatuses = new Set(['denied', 'unable_to_complete', 'auto_reversed', 'closed_no_charge']);

async function renderAllRequests(requests, phone, email) {
  const inProgress = requests.filter(r => !terminalStatuses.includes(r.status));
  const completed  = requests.filter(r => r.status === 'complete');
  // Cancelled (customer-initiated) is shown separately from Denied (admin-closed
  // without completion) — different customer-facing outcomes, shouldn't be lumped
  // together even though both are part of closedStatuses internally.
  const cancelled = requests.filter((r) => cancelledStatuses.has(r.status));
  const denied = requests.filter((r) => deniedOnlyStatuses.has(r.status));

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

  // Cancelled section
  html += `
    <details class="track-section">
      <summary class="track-section-header">
        Cancelled requests
        <span class="track-section-count">${cancelled.length}</span>
      </summary>
      <div class="track-section-body">
  `;
  if (cancelled.length === 0) {
    html += `<p class="track-empty-msg">No cancelled requests found.</p>`;
  } else {
    for (const request of cancelled) {
      html += renderDeniedCard(request);
    }
  }
  html += `</div></details>`;

  // Denied section
  html += `
    <details class="track-section">
      <summary class="track-section-header">
        Denied requests
        <span class="track-section-count">${denied.length}</span>
      </summary>
      <div class="track-section-body">
  `;
  if (denied.length === 0) {
    html += `<p class="track-empty-msg">No denied requests found.</p>`;
  } else {
    for (const request of denied) {
      html += renderDeniedCard(request);
    }
  }
  html += `</div></details>`;

  html += `</div>`;
  trackingResult.innerHTML = html;

  trackingResult.querySelectorAll('.track-request-details').forEach((details) => {
    details.addEventListener('toggle', () => {
      if (details.open) mountVisibleCustomerPayCards(details);
    });
  });
  trackingResult.querySelectorAll('.track-section[open] .track-request-details[open]').forEach((details) => {
    mountVisibleCustomerPayCards(details);
  });
}

function mountVisibleCustomerPayCards(root = trackingResult) {
  root.querySelectorAll('.track-request-details[open] .customer-payment-section').forEach((section) => {
    const requestId = section.id.replace('customer-payment-section-', '');
    if (requestId) mountCustomerPayCard(requestId);
  });
}

const HARD_DENIED_STATUSES = new Set(['denied', 'customer_canceled', 'canceled', 'cancelled']);

function renderDeniedCard(request) {
  const vehicle = [request.vehicle_year, request.vehicle_make, request.vehicle_model].filter(Boolean).join(' ');
  const serviceDate = request.service_date
    ? new Date(request.service_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  const closedAt = request.updated_at
    ? new Date(request.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  const reason = cancellationReasonForDisplay(request);
  const baseLabel = friendlyStatusLabel(request.status);
  const statusLabel = reason ? `${baseLabel} — ${reason}` : baseLabel;
  // Spec: only red badges for denied/cancelled/error states — other closed
  // statuses (auto-reversed, closed with no charge, etc.) stay neutral.
  const statusClass = HARD_DENIED_STATUSES.has(request.status) ? 'status-pill-denied' : '';

  return `
    <article class="track-request-card track-denied-card" data-request-id="${escapeHtml(request.id)}">
      <details class="track-request-details">
        ${requestSummaryHtml(request, { statusLabel, statusClass })}
        <div class="track-request-body">
          <div class="request-details">
            ${serviceDate ? `<p><strong>Service date:</strong> ${escapeHtml(serviceDate)}</p>` : ''}
            ${vehicle ? `<p><strong>Vehicle:</strong> ${escapeHtml(vehicle)}${request.vehicle_color ? ', ' + escapeHtml(request.vehicle_color) : ''}</p>` : ''}
            ${request.service_label || request.service_type ? `<p><strong>Service:</strong> ${escapeHtml(request.service_label || request.service_type)}</p>` : ''}
            ${closedAt ? `<p><strong>Updated:</strong> ${escapeHtml(closedAt)}</p>` : ''}
            <p><strong>Reason:</strong> ${escapeHtml(reason || 'This request could not be completed.')}</p>
          </div>
        </div>
      </details>
    </article>`;
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

  if (!id && !phone && !email) {
    trackMessage.textContent = "Enter your phone number, email address, or request number to search.";
    trackingPhone.focus();
    return;
  }

  trackMessage.textContent = "Looking up requests...";
  const submitButton = trackForm.querySelector('button[type="submit"]');
  const originalSubmitText = submitButton?.textContent;
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Searching...";
  }

  let matchedRequests = [];
  try {
    const rpcRequestId = id || null;
    const { data: rpcData, error: rpcError } = await shiftFuelDb
      .rpc("public_track_request", {
        p_request_id: rpcRequestId,
        p_phone: phone,
        p_email: email,
      });

    if (!rpcError) {
      matchedRequests = sortTrackedRequests(rpcData || []);
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

      matchedRequests = sortTrackedRequests((data || []).filter((request) => {
        const phoneMatches = !phone || cleanPhone(request.customer_phone) === phone;
        const emailMatches = !email || String(request.customer_email || "").toLowerCase() === email;
        return phoneMatches && emailMatches;
      }));
    }

    if (matchedRequests.length === 0) {
      recordTrackFailedAttempt();
      trackMessage.textContent = "We could not find a matching request. Please check your phone number, email, or request number and try again.";
      return;
    }

    clearTrackAttempts();
    verifiedTrackingContact = { phone, email };
    trackMessage.textContent = "";
    if (refreshStatusBtn) refreshStatusBtn.hidden = false;
    window._trackingRequests = matchedRequests;
    await renderAllRequests(matchedRequests, phone, email);
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = originalSubmitText || "Track Request";
    }
  }
});

refreshStatusBtn?.addEventListener("click", () => {
  if (!verifiedTrackingContact.phone && !verifiedTrackingContact.email && !trackingId.value.trim()) {
    return;
  }
  trackMessage.textContent = "Refreshing status...";
  window._trackingRequests = [];
  trackForm.requestSubmit();
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
    const card = cbConfirmCancelBtn.closest('.pending-completion-card');
    const reason = card?.querySelector('.customer-cancel-reason')?.value.trim() || 'Customer declined service';
    cbConfirmCancelBtn.disabled = true;
    cbConfirmCancelBtn.textContent = 'Canceling…';
    trackMessage.textContent = '';

    try {
      await cancelCustomerRequestFromTrack({ requestId, reason });
      trackMessage.textContent = 'Your request has been canceled. Your card authorization was released and you were not charged.';
      await refreshTrackedRequestsAfterAction();
    } catch (error) {
      console.error('[track] Customer cancellation failed for cb flow:', error.payload || error);
      if (String(error.message || '').toLowerCase().includes('request vehicle return')) {
        await submitCustomerReturnRequest(requestId, cbConfirmCancelBtn);
        return;
      }
      trackMessage.textContent = String(error.message || '').includes('release the authorization')
        ? 'We could not release the authorization automatically. Please contact ShiftFuel.'
        : (error.message || 'Could not cancel this request. Please contact ShiftFuel.');
      cbConfirmCancelBtn.disabled = false;
      cbConfirmCancelBtn.textContent = 'Cancel request';
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

  const keepRequestButton = event.target.closest(".keep-request");
  if (keepRequestButton) {
    const panel = keepRequestButton.closest(".cancel-panel");
    if (panel) panel.hidden = true;
    return;
  }

  // ── Confirm and Pay (pending_customer_payment) ───────────────────────────
  const confirmPayBtn = event.target.closest('.confirm-and-pay');
  if (confirmPayBtn && !confirmPayBtn.disabled) {
    await handleConfirmAndPay(confirmPayBtn);
    return;
  }

  if (!confirmCancelButton) {
    return;
  }

  const requestId = confirmCancelButton.dataset.requestId;
  const card = confirmCancelButton.closest(".track-request-card") || trackingResult;
  const reasonInput = card.querySelector(".customer-cancel-reason");
  const reason = reasonInput?.value.trim() || "";

  confirmCancelButton.textContent = "Canceling...";
  confirmCancelButton.disabled = true;
  trackMessage.textContent = "";

  let result;
  try {
    result = await cancelCustomerRequestFromTrack({ requestId, reason });
  } catch (err) {
    console.error('[track] Customer cancellation failed:', err.payload || err);
    trackMessage.textContent = err.message || "Network error. Please try again or contact ShiftFuel.";
    confirmCancelButton.textContent = "Confirm cancellation";
    confirmCancelButton.disabled = false;
    return;
  }

  trackMessage.textContent = result.status === 'cancelled_pending_key_return'
    ? "Cancellation received. Your request will remain visible until your key or vehicle is returned."
    : "Your request has been cancelled.";
  try {
    await refreshTrackedRequestsAfterAction();
  } catch (refreshError) {
    console.error('[track] Refresh after cancellation failed:', refreshError);
  }
});

// ── Confirm and Pay (pending_customer_payment) ────────────────────────────────

let stripeInstance = null;

function getStripe() {
  if (!stripeInstance && window.Stripe) {
    const pk = window.SHIFTFUEL_STRIPE_PUBLISHABLE_KEY;
    if (pk) stripeInstance = window.Stripe(pk);
  }
  return stripeInstance;
}

// Mounted card elements for new-card payment (case B), keyed by request id.
const _customerCardElements = {};

// Called when the payment section is inserted into the DOM — mounts the Stripe
// card element for requests that have no pre-authorized payment intent.
function mountCustomerPayCard(requestId) {
  const container = document.getElementById(`customer-pay-card-${requestId}`);
  if (!container || container.dataset.mounted) return;
  const stripe = getStripe();
  if (!stripe) return;
  const elements = stripe.elements();
  const card = elements.create('card', {
    style: { base: { fontSize: '16px', color: '#1a1a1a', fontFamily: 'inherit' } },
  });
  card.mount(container);
  container.dataset.mounted = '1';
  _customerCardElements[requestId] = card;
}

async function handleConfirmAndPay(button) {
  const requestId = button.dataset.id;
  const request = (window._trackingRequests || []).find(r => r.id === requestId);
  if (!request) return;

  const errorEl = document.getElementById(`customer-payment-error-${requestId}`);
  const setError = (msg) => { if (errorEl) errorEl.textContent = msg; };

  button.disabled = true;
  button.textContent = 'Processing…';
  setError('');

  const { phone, email } = verifiedTrackingContact;
  const amountCents = request.final_total != null ? Math.round(request.final_total * 100) : null;

  try {
    // ── Case A: pre-authorized PaymentIntent exists ──────────────────────────
    if (request.payment_intent_id && request.payment_status !== 'capture_failed') {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'customer_capture',
          request_id: requestId,
          phone,
          email,
          amount_cents: amountCents,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Payment failed. Please try again.');
        button.disabled = false;
        button.textContent = 'Confirm and Pay';
        return;
      }
    } else {
      // ── Case B: no pre-auth — charge a new card ────────────────────────────
      if (!amountCents || amountCents < 50) {
        setError('Final total is not set. Please contact ShiftFuel.');
        button.disabled = false;
        button.textContent = 'Confirm and Pay';
        return;
      }
      const stripe = getStripe();
      const cardElement = _customerCardElements[requestId];
      if (!stripe || !cardElement) {
        setError('Card entry is not ready. Please refresh and try again.');
        button.disabled = false;
        button.textContent = 'Confirm and Pay';
        return;
      }

      // Create a PaymentIntent server-side — amount comes from DB, not frontend.
      const piRes = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_customer_final', request_id: requestId, phone, email }),
      });
      const piData = await piRes.json().catch(() => ({}));
      if (!piRes.ok) {
        setError(piData.error || 'Could not initialize payment. Please try again.');
        button.disabled = false;
        button.textContent = 'Confirm and Pay';
        return;
      }

      const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(piData.client_secret, {
        payment_method: { card: cardElement },
      });

      if (confirmError) {
        setError(confirmError.message || 'Payment failed. Please check your card and try again.');
        button.disabled = false;
        button.textContent = 'Confirm and Pay';
        return;
      }

      // Notify server: record the new PI and mark complete.
      const captureRes = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'customer_capture',
          request_id: requestId,
          phone,
          email,
          new_payment_intent_id: paymentIntent.id,
        }),
      });
      const captureData = await captureRes.json().catch(() => ({}));
      if (!captureRes.ok) {
        // Payment was charged but server failed to mark complete — log for support.
        console.error('[confirm-and-pay] Capture recorded but mark-complete failed:', captureData.error);
        setError('Payment was processed but we could not update your request. Please contact ShiftFuel and reference request ' + requestId);
        button.disabled = false;
        button.textContent = 'Confirm and Pay';
        return;
      }
    }

    // ── Success ──────────────────────────────────────────────────────────────
    button.textContent = '✓ Payment confirmed!';
    setError('');

    setTimeout(async () => {
      const { data: refreshed } = await shiftFuelDb.rpc('public_track_request', {
        p_phone: phone,
        p_email: email,
      });
      if (refreshed?.length) {
        window._trackingRequests = refreshed;
        await renderAllRequests(refreshed, phone, email);
      }
    }, 1200);
  } catch (err) {
    console.error('[confirm-and-pay] Unexpected error:', err.message);
    setError('An unexpected error occurred. Please try again or contact ShiftFuel.');
    button.disabled = false;
    button.textContent = 'Confirm and Pay';
  }
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
        Your card is authorized now. You are not charged until service is complete, unless you cancel after the worker has received your keys or service has started.
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
      const piRes = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_intent', amount_cents: authAmountCents, customer_name: customerName, customer_email: customerEmail, service_label: serviceLabel }),
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

  if (statusEl) statusEl.textContent = 'Verifying service address…';
  const areaResult = await validateCbServiceArea({ street: addrStreet, apt: addrApt, city: addrCity, state: addrState, zip: addrZip });
  if (!areaResult.valid) {
    if (statusEl) statusEl.textContent = areaResult.message || 'We could not verify this address. Please check your address and try again.';
    form.querySelector('.cb-address-street')?.focus();
    return;
  }
  if (statusEl) statusEl.textContent = '';

  if ((!year || !make || !model || !color || !plate) && fail('Please fill in all vehicle fields.', '.cb-vehicle-year')) return;
  if (!parkingLoc  && fail('Please describe where your vehicle will be parked.', '.cb-parking-location')) return;
  if (!keyHandoff  && fail('Please describe how to pick up your keys.', '.cb-key-handoff')) return;
  if (!serviceType && fail('Please select a service type.', '.cb-service-type')) return;
  if (needsFuel && !fuelType     && fail('Please select a fuel type.', '.cb-fuel-type')) return;
  if (needsFuel && !fuelEstimate && fail('Please select the estimated fuel amount.', '.cb-fuel-estimate')) return;
  if (needsWash && !washPackage  && fail('Please select a car wash package.', '.cb-wash-package')) return;
  if (!serviceDate && fail('Please select a service date.', '.cb-service-date-host .sfp-trigger')) return;
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
  const pricing        = cbServicePricingParts({
    needsFuel,
    needsWash: needsWash && !!washPkg,
    fuelAmount: fuelAmt,
    washAmount: washFee,
    quickInspection,
  });
  const washConvFee    = pricing.washService;
  const fuelConvFee    = pricing.fuelService;
  const inspFee        = pricing.inspection;
  const estimatedTotal = pricing.total || null;
  const authorizationAmount = authorizationAmountForEstimate({
    needsFuel,
    fuelRange: fuelEstimateRange,
    pricePerGallon: ppg,
    needsWash: needsWash && !!washPkg,
    washAmount: washFee,
    quickInspection,
  });
  const authAmountCents = Math.max(Math.round((authorizationAmount || 1) * 100), 50);

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
      p_estimated_total:      authorizationAmount,
      p_payment_intent_id:    paymentIntentId || null,
      p_customer_notes:       notes || null,
    });

    if (!error) {
      // Re-render the card as a normal in-progress request
      setTimeout(async () => {
        await refreshTrackedRequestsAfterAction();
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
