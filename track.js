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

// Consolidated track-page session/UI state (previously a dozen scattered
// top-level `let`s). Grouped for traceability; each field is still freely
// reassigned as trackState.X.
const trackState = {
  verifiedTrackingContact: { phone: "", email: "" },
  _lightboxItems: [],
  _lightboxIndex: 0,
  trackingPollTimer: null,
  trackingPollInFlight: false,
  stripeInstance: null,
  _cbModal: null,
  _cbModalCard: null,        // { elements, cardElement }
  _cbModalRpcFn: null,       // async (paymentIntentId) → error | null
  _cbModalMeta: null,        // { authAmountCents, serviceLabel, customerName, customerEmail }
  _cbModalFormStatusEl: null,
  _cbModalSubmitBtn: null,
};

function scrollTrackFormIntoView(options = {}) {
  const target = document.querySelector("#track-form");
  if (!target) return;
  const header = document.querySelector(".site-header");
  const headerHeight = header ? header.getBoundingClientRect().height : 0;
  const top = target.getBoundingClientRect().top + window.scrollY - headerHeight - 18;
  window.scrollTo({
    top: Math.max(top, 0),
    behavior: options.behavior || "smooth",
  });
}

function bindTrackFormAnchorScroll() {
  if (document.documentElement.dataset.trackFormAnchorBound === "true") return;
  document.documentElement.dataset.trackFormAnchorBound = "true";

  document.addEventListener("click", (event) => {
    const link = event.target.closest('a[href$="#track-form"], a[href="#track-form"]');
    if (!link) return;
    let targetUrl;
    try {
      targetUrl = new URL(link.getAttribute("href"), window.location.href);
    } catch (_) {
      return;
    }
    if (targetUrl.pathname !== window.location.pathname || targetUrl.hash !== "#track-form") return;

    event.preventDefault();
    history.replaceState(null, "", "#track-form");
    document.querySelector("[data-nav-toggle]")?.setAttribute("aria-expanded", "false");
    document.querySelector("[data-nav]")?.classList.remove("is-open");
    scrollTrackFormIntoView();
  });

  window.addEventListener("hashchange", () => {
    if (window.location.hash === "#track-form") scrollTrackFormIntoView();
  });
}

function scrollTrackFormAfterLoad() {
  if (window.location.hash !== "#track-form") return;
  window.setTimeout(() => scrollTrackFormIntoView({ behavior: "auto" }), 0);
  window.setTimeout(() => scrollTrackFormIntoView({ behavior: "auto" }), 120);
}

function formatPhoneForTracking(value) {
  return window.ShiftFuelPhone?.format(value) || value || "";
}

(function prefillTrackingFromCustomerAccount() {
  let session = null;
  try {
    session = JSON.parse(localStorage.getItem("shiftfuel_customer_account") || "null");
  } catch (_) {
    session = null;
  }

  const params = new URLSearchParams(window.location.search || "");
  const request = params.get("request") || "";
  // ?me=1 comes from the signed-in dashboard "Track My Vehicle" button — auto-load
  // the customer's own requests using their saved phone/email, no re-entry needed.
  const autoMe = params.get("me") === "1";
  if (session?.phone && trackingPhone && !trackingPhone.value) trackingPhone.value = formatPhoneForTracking(session.phone);
  if (session?.email && trackingEmail && !trackingEmail.value) trackingEmail.value = String(session.email || "").trim().toLowerCase();
  if (request && trackingId && !trackingId.value) trackingId.value = request;

  if ((request || autoMe) && session?.phone && session?.email) {
    window.addEventListener("load", () => {
      window.setTimeout(() => trackForm?.requestSubmit(), 100);
    });
  }
})();

// Unified terminal/closed status list — keep in sync with admin.js, worker.js,
// and the SQL terminal-status list in supabase-production-rls-lockdown.sql.
// Booking-status logic lives in shared-status.js (loaded before this file).
const BOOKING_STATUSES = window.SF.BOOKING_STATUSES;
const canonicalBookingStatus = window.SF.canonicalBookingStatus;

const terminalStatuses = window.SF.TERMINAL_STATUSES;
const closedStatuses = window.SF.CLOSED_STATUSES;
// cancelled_pending_key_return is deliberately NOT terminal/closed — the
// request stays in the in-progress section until the worker confirms the
// key/vehicle has been returned (status then flips to "cancelled").
const slotHoldingStatuses = new Set([
  "assigned",
  "en_route",
  "in_service",
  "returning",
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
      <button class="photo-lightbox-nav photo-lightbox-prev" type="button" aria-label="Previous photo">&#8249;</button>
      <img class="photo-lightbox-img" src="" alt="">
      <button class="photo-lightbox-nav photo-lightbox-next" type="button" aria-label="Next photo">&#8250;</button>
      <p class="photo-lightbox-caption"></p>
      <p class="photo-lightbox-counter"></p>
    </div>
  `;
  document.body.appendChild(el);
  el.querySelector('.photo-lightbox-backdrop').addEventListener('click', closePhotoLightbox);
  el.querySelector('.photo-lightbox-close').addEventListener('click', closePhotoLightbox);
  el.querySelector('.photo-lightbox-prev').addEventListener('click', () => stepLightbox(-1));
  el.querySelector('.photo-lightbox-next').addEventListener('click', () => stepLightbox(1));
}

function showLightboxAt(index) {
  const el = document.getElementById('photo-lightbox');
  if (!el || !trackState._lightboxItems.length) return;
  trackState._lightboxIndex = (index + trackState._lightboxItems.length) % trackState._lightboxItems.length;
  const item = trackState._lightboxItems[trackState._lightboxIndex];
  const img = el.querySelector('.photo-lightbox-img');
  img.src = item.src;
  img.alt = item.label;
  el.querySelector('.photo-lightbox-caption').textContent = item.label;
  const multi = trackState._lightboxItems.length > 1;
  el.querySelector('.photo-lightbox-counter').textContent = multi ? `${trackState._lightboxIndex + 1} of ${trackState._lightboxItems.length}` : '';
  el.querySelectorAll('.photo-lightbox-nav').forEach((b) => { b.hidden = !multi; });
  el.hidden = false;
  document.body.style.overflow = 'hidden';
}

function stepLightbox(delta) {
  if (trackState._lightboxItems.length) showLightboxAt(trackState._lightboxIndex + delta);
}

// Back-compat: open a single photo with no paging.
function openPhotoLightbox(src, label) {
  trackState._lightboxItems = [{ src, label: label || '' }];
  showLightboxAt(0);
}

// Open from a tapped thumbnail and page through the photos in the same grid the
// user tapped. Skip hidden thumbnails.
function openLightboxFromCard(card) {
  const scope = card.closest('.tk-photo-grid')
    || card.closest('.track-request-card')
    || document;
  const thumbs = Array.from(scope.querySelectorAll('[data-lightbox-src]'))
    .filter((t) => t === card || t.offsetParent !== null);
  trackState._lightboxItems = thumbs.map((t) => ({ src: t.dataset.lightboxSrc, label: t.dataset.lightboxLabel || '' }));
  showLightboxAt(Math.max(0, thumbs.indexOf(card)));
}

function closePhotoLightbox() {
  const el = document.getElementById('photo-lightbox');
  if (!el) return;
  el.hidden = true;
  el.querySelector('.photo-lightbox-img').src = '';
  document.body.style.overflow = '';
}

document.addEventListener('keydown', (e) => {
  const el = document.getElementById('photo-lightbox');
  if (!el || el.hidden) return;
  if (e.key === 'Escape') closePhotoLightbox();
  else if (e.key === 'ArrowLeft') stepLightbox(-1);
  else if (e.key === 'ArrowRight') stepLightbox(1);
});

document.addEventListener('click', (e) => {
  const card = e.target.closest('[data-lightbox-src]');
  if (!card) return;
  openLightboxFromCard(card);
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const card = e.target.closest('[data-lightbox-src]');
  if (!card) return;
  e.preventDefault();
  openLightboxFromCard(card);
});

initPhotoLightbox();

// Desktop detail sections are locked open via CSS. If the viewport crosses into
// desktop width after render (e.g. the user maximizes the window), force their
// open attribute so they can't be stuck closed with no chevron to reopen them.
(function keepDesktopSectionsOpen() {
  if (typeof window === 'undefined' || !window.matchMedia) return;
  const mq = window.matchMedia('(min-width: 1000px)');
  const apply = () => {
    if (!mq.matches) return;
    document.querySelectorAll('.tk-detail-grid > .tk-sub-acc').forEach((d) => { d.open = true; });
  };
  if (mq.addEventListener) mq.addEventListener('change', apply);
  else if (mq.addListener) mq.addListener(apply);
})();

// Friendly labels for every status — keep in sync with admin.js and worker.js.
// Raw database status strings must never be shown to a customer.
const statusLabels = {
  new: "New",
  assigned: "Assigned",
  en_route: "En route",
  in_service: "In service",
  returning: "Returning",
  completed: "Completed",
  cancelled: "Cancelled",
  pending: "Request received",
  request_received: "Request received",
  accepted: "Accepted",
  key_received: "Key received",
  in_progress: "In service",
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
  return window.ShiftFuelPhone?.digits(value) || String(value || "").replace(/\D/g, "").slice(0, 10);
}

function attachPhoneInputFormatting(input) {
  window.ShiftFuelPhone?.attachInput(input);
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

// Display formatters live in shared-format.js (loaded before this file).
const escapeHtml = window.SF.escapeHtml;
const formatCurrency = window.SF.formatCurrency;

function hoursSince(value) {
  const time = new Date(value || Date.now()).getTime();
  return (Date.now() - time) / (1000 * 60 * 60);
}

// Cancellation confirmation copy. The status categorization (which statuses are
// cancelable / blocked / their tier) is the SHARED cancellationOutcomeForStatus()
// in shared-payments.js — the same one the server charges from — so this copy can
// never drift from the fee actually charged.
const CANCELLATION_MODAL_COPY_SERVICE_STARTED = "Are you sure you want to cancel? Your specialist already has your vehicle and is on the way to the service. You'll be charged a $15 cancellation fee plus the distance already driven and time already spent on your vehicle, so the amount depends on how far along the trip is. (Once the service itself begins, it can no longer be cancelled.)";
// Once the service is actually underway (or done) it can't be cancelled — the
// specialist finishes it and the customer is charged for the completed service.
const CANCELLATION_SERVICE_STARTED_BLOCKED_MSG = "Your specialist has already started the service, so it can't be cancelled now. They'll finish it and you'll be charged for the completed service.";
const CANCELLATION_BLOCKED_MESSAGES = {
  service_in_progress: CANCELLATION_SERVICE_STARTED_BLOCKED_MSG,
  fueling_in_progress: CANCELLATION_SERVICE_STARTED_BLOCKED_MSG,
  car_wash_in_progress: CANCELLATION_SERVICE_STARTED_BLOCKED_MSG,
  partial_service_complete: CANCELLATION_SERVICE_STARTED_BLOCKED_MSG,
  fueling_complete: CANCELLATION_SERVICE_STARTED_BLOCKED_MSG,
  fuel_receipt_uploaded: CANCELLATION_SERVICE_STARTED_BLOCKED_MSG,
  car_wash_complete: CANCELLATION_SERVICE_STARTED_BLOCKED_MSG,
  wash_receipt_uploaded: CANCELLATION_SERVICE_STARTED_BLOCKED_MSG,
  car_wash_after_fuel_in_progress: CANCELLATION_SERVICE_STARTED_BLOCKED_MSG,
  fueling_after_wash_in_progress: CANCELLATION_SERVICE_STARTED_BLOCKED_MSG,
  wash_receipt_after_fuel_uploaded: CANCELLATION_SERVICE_STARTED_BLOCKED_MSG,
  fuel_receipt_after_wash_uploaded: CANCELLATION_SERVICE_STARTED_BLOCKED_MSG,
  service_complete: CANCELLATION_SERVICE_STARTED_BLOCKED_MSG,
  receipts_recorded: CANCELLATION_SERVICE_STARTED_BLOCKED_MSG,
  vehicle_returned: "This request can no longer be cancelled because the vehicle has already been returned.",
  complete: "This request is already complete.",
  denied: "This request has already been denied.",
  cancelled: "This request has already been cancelled.",
  cancelled_pending_key_return: "This request has already been cancelled.",
  customer_canceled: "This request has already been cancelled.",
  canceled: "This request has already been cancelled.",
};

function cancellationModalTextForStatus(status) {
  const tier = (window.SF.cancellationOutcomeForStatus(status) || {}).tier;
  if (tier === 'none') return "Are you sure you want to cancel this request? No cancellation fee will be charged.";
  if (tier === 'flat_fee') return "Are you sure you want to cancel this request? A $15 cancellation fee applies because your key has already been received.";
  if (tier === 'fee_plus_costs') return CANCELLATION_MODAL_COPY_SERVICE_STARTED;
  return "Are you sure you want to cancel this request? A cancellation fee may apply.";
}

function canCustomerCancel(request) {
  return Boolean(window.SF.cancellationOutcomeForStatus(request.status).cancelable);
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
        phone: trackState.verifiedTrackingContact.phone,
        email: trackState.verifiedTrackingContact.email,
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
    p_phone: trackState.verifiedTrackingContact.phone,
    p_email: trackState.verifiedTrackingContact.email,
  });

  if (error) throw error;
  return data || [];
}

async function refreshTrackedRequestsAfterAction(requestId = null) {
  const refreshed = await fetchTrackedRequests(requestId);
  if (!requestId) {
    window._trackingRequests = refreshed;
    await renderAllRequests(refreshed, trackState.verifiedTrackingContact.phone, trackState.verifiedTrackingContact.email);
    return refreshed;
  }

  const existing = window._trackingRequests || [];
  const byId = new Map(existing.map((request) => [request.id, request]));
  refreshed.forEach((request) => byId.set(request.id, request));
  const merged = Array.from(byId.values());
  window._trackingRequests = sortTrackedRequests(merged);
  await renderAllRequests(window._trackingRequests, trackState.verifiedTrackingContact.phone, trackState.verifiedTrackingContact.email);
  return refreshed;
}

async function cancelCustomerRequestFromTrack({ requestId, reason }) {
  const res = await fetch('/api/payments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'customer_cancel',
      request_id: requestId,
      phone: trackState.verifiedTrackingContact.phone,
      email: trackState.verifiedTrackingContact.email,
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
  const canonicalStatus = canonicalBookingStatus(status);
  return statusLabels[canonicalStatus] || "Status update";
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

  const totalAmount = request.final_total != null ? request.final_total
    : (closedStatuses.includes(canonicalBookingStatus(request.status)) && request.estimated_total != null ? request.estimated_total : null);
  const totalLabel = request.final_total != null ? 'Final' : 'Est.';

  return `
    <summary class="track-request-summary">
      <div class="track-request-summary-main">
        <div class="track-request-summary-top">
          <span class="track-request-number">${escapeHtml(trackRequestNumber(request.id))}</span>
          <span class="status-pill ${escapeHtml(statusClass)}">${escapeHtml(status)}</span>
        </div>
        <span class="track-request-vehicle">${escapeHtml(vehicle)}</span>
        <span class="track-request-meta">
          ${serviceDate ? `<span>${escapeHtml(serviceDate)}</span>` : ""}
          ${service ? `<span>${escapeHtml(service)}</span>` : ""}
          ${payment ? `<span class="track-request-payment-flag">${escapeHtml(payment)}</span>` : ""}
          ${totalAmount != null ? `<span class="track-request-total">${escapeHtml(totalLabel)} ${formatCurrency(totalAmount)}</span>` : ""}
        </span>
      </div>
      <span class="track-request-expand-hint" aria-hidden="true">View details</span>
    </summary>
  `;
}

function savedFeeOrDefault(value, fallback) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : fallback;
}

// Service-type checks and receipt-total parsing live in shared-payments.js
// (loaded before this file).
const requestNeedsFuel = window.SF.requestNeedsFuel;
const requestNeedsWash = window.SF.requestNeedsWash;
const receiptTotalsFromNotes = window.SF.receiptTotalsFromNotes;

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

// Only format genuinely valid US numbers. Anything else returns '' so callers
// can fall back to "Contact Support" instead of rendering a broken number
// like "(55) 123-4567".
function formatPhone(raw) {
  return window.ShiftFuelPhone?.format(raw) || '';
}

function isValidPhone(raw) {
  return Boolean(window.ShiftFuelPhone?.isValid(raw));
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

// The Verified badge + the worker's CURRENT photo now arrive embedded in each
// request from the public_track_request RPC (assigned_worker_verified /
// assigned_worker_photo_url / assigned_worker_original_photo_url). The old
// client-side join to the anon-readable employees_public view was removed when
// that view's anon grant was revoked — see migration
// 20260709_gate_employees_public_view.sql. On the RPC-unavailable fallback paths
// (direct service_requests reads) the badge simply stays off and the photo falls
// back to the request's denormalized column, so this always fails safe.

// A real coordinate (not null/empty, which Number() turns into a "finite" 0).
function isRealCoord(v) {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0;
}

// The worker is driving to the vehicle: accepted, live GPS on, and we have the
// worker's real location. The destination is resolved in updateEtaBanners (from
// the stored address coords, or by geocoding the address if they're missing).
function workerEnRouteToVehicle(request) {
  return request.status === 'accepted'
    && request.live_tracking_enabled
    && isRealCoord(request.last_latitude)
    && isRealCoord(request.last_longitude);
}

function etaBannerHtml(request) {
  if (!workerEnRouteToVehicle(request)) return '';
  const addr = [request.address_street, request.address_city, request.address_state, request.address_zip]
    .filter(Boolean).join(', ');
  return `<div class="worker-eta-banner" data-eta data-req="${escapeHtml(request.id)}"
    data-olat="${request.last_latitude}" data-olon="${request.last_longitude}"
    data-dlat="${request.address_lat || ''}" data-dlon="${request.address_lon || ''}"
    data-addr="${escapeHtml(addr)}">
    <span class="worker-eta-text">Locating your specialist…</span></div>`;
}

// Fill each en-route banner with a live driving ETA (worker → service address).
async function updateEtaBanners() {
  const els = document.querySelectorAll('.worker-eta-banner[data-eta]');
  for (const el of els) {
    const text = el.querySelector('.worker-eta-text');
    try {
      let dlat = el.dataset.dlat;
      let dlon = el.dataset.dlon;
      // No stored destination coords (booking predates address coords) — geocode
      // the service address so the ETA still works.
      if (!(isRealCoord(dlat) && isRealCoord(dlon)) && el.dataset.addr) {
        const gres = await fetch('/api/address', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'geocode', street: el.dataset.addr }),
        });
        const gdata = await gres.json().catch(() => ({}));
        if (gdata.ok) { dlat = gdata.lat; dlon = gdata.lon; }
      }
      if (!(isRealCoord(dlat) && isRealCoord(dlon))) {
        if (text) text.textContent = 'Your specialist is on the way.';
        continue;
      }
      const res = await fetch('/api/address', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'route_eta',
          origin_lat: el.dataset.olat, origin_lon: el.dataset.olon,
          dest_lat: dlat, dest_lon: dlon,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok && text) text.innerHTML = `🚗 Your specialist is about <strong>${data.minutes} min</strong> away · ${data.miles} mi`;
      else if (text) text.textContent = 'Your specialist is on the way.';
    } catch (_) {
      if (text) text.textContent = 'Your specialist is on the way.';
    }
  }
}

// Live en-route ETA. The worker now navigates to the service address inside the
// app (turn-by-turn, screen kept on), so their GPS streams the whole drive. Each
// status poll brings fresh worker coords; when the status itself hasn't changed
// (so the page isn't re-rendered), we push the new origin into the existing ETA
// banner and recompute — so "your specialist is X min away" ticks down for real.
function refreshEnRouteEta(requests) {
  let any = false;
  (requests || []).forEach((request) => {
    if (!workerEnRouteToVehicle(request)) return;
    const banner = document.querySelector(`.worker-eta-banner[data-req="${request.id}"]`);
    if (!banner) return;
    banner.dataset.olat = request.last_latitude;
    banner.dataset.olon = request.last_longitude;
    any = true;
  });
  if (any) updateEtaBanners();
}

function renderAssignedWorker(request) {
  if (!request.assigned_worker_name) return '';

  const isVerified = Boolean(request.assigned_worker_verified);

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
        ${isVerified ? '<span class="worker-verified-badge">✓ Verified ShiftFuel Employee</span>' : ''}
      </div>
      ${etaBannerHtml(request)}
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
    steps.push({ key: 'quick_inspection',     label: 'Vehicle add-ons' });
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
    if (request.quick_inspection) return 'Your vehicle has been returned. Vehicle add-ons are being wrapped up.';
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
  if (closedStatuses.includes(canonicalBookingStatus(request.status))) return '';
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

  const isClosed = closedStatuses.includes(canonicalBookingStatus(request.status));
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

  const slotPhoto = (types) => types.map((type) => photoByType.get(type)).find(Boolean);

  const photoSlot = (label, types) => {
    const photo = slotPhoto(types);

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

  // Only render a section once at least one of its photos exists. This avoids a
  // wall of empty "Not uploaded yet" placeholders before the service has begun;
  // partially-filled sections still show their remaining slots so the customer
  // can see what's coming.
  const section = (title, slots, isCompact = false) => {
    if (!slots.some((slot) => slotPhoto(slot.types))) return "";
    return `
      <section class="photo-proof-section ${isCompact ? "photo-proof-section-compact" : ""}">
        <h3>${escapeHtml(title)}</h3>
        <div class="photo-proof-grid">
          ${slots.map((slot) => photoSlot(slot.label, slot.types)).join("")}
        </div>
      </section>
    `;
  };

  const sections = [
    section("Pickup", [
      { label: "Driver Side Front", types: ["pickup_driver_front", "pickup_front"] },
      { label: "Passenger Side Front", types: ["pickup_passenger_front", "pickup_passenger_side"] },
      { label: "Driver Side Rear", types: ["pickup_driver_rear", "pickup_driver_side"] },
      { label: "Passenger Side Rear", types: ["pickup_passenger_rear", "pickup_rear"] },
      { label: "Pickup odometer", types: ["pickup_odometer"] },
      { label: "Pickup fuel gauge", types: ["pickup_fuel_gauge"] },
    ]),
    requestNeedsFuel(request) ? section("Fuel Receipt", [
      { label: "Receipt", types: ["fuel_receipt"] },
    ], true) : "",
    requestNeedsWash(request) ? section("Car Wash Receipt", [
      { label: "Receipt", types: ["wash_receipt"] },
    ], true) : "",
    section("Drop off", [
      { label: "Driver Side Front", types: ["dropoff_driver_front", "dropoff_front"] },
      { label: "Passenger Side Front", types: ["dropoff_passenger_front", "dropoff_passenger_side"] },
      { label: "Driver Side Rear", types: ["dropoff_driver_rear", "dropoff_driver_side"] },
      { label: "Passenger Side Rear", types: ["dropoff_passenger_rear", "dropoff_rear"] },
      { label: "Odometer", types: ["dropoff_odometer"] },
    ]),
    section("Return back", [
      { label: "Ending Fuel Gauge", types: ["dropoff_fuel_gauge"] },
    ], true),
  ].join("");

  if (!sections.trim()) {
    return `
      <div class="photo-proof-sections">
        <p class="photo-proof-empty">Service photos will appear here as your vehicle is picked up and serviced.</p>
      </div>
    `;
  }

  return `<div class="photo-proof-sections">${sections}</div>`;
}

function inspectionSummaryFromNotes(request) {
  const notes = String(request.notes || "");
  const codeMatches = Array.from(notes.matchAll(/Trouble code ([A-Z0-9]+): ([\s\S]*?) Possible fixes: ([^\n]+)/g));
  // New format: "Tire pressure set (door-jamb 35): driver front 35, …."
  const newPsiMatches = Array.from(notes.matchAll(/Tire pressure set \(door-jamb ([^)]*)\): ([^.]*)\./g));
  // Legacy format (jobs completed before the inspection redesign).
  const oldPsiMatches = Array.from(notes.matchAll(/Tire PSI before\/after: ([\s\S]*?)(?:\. Trouble code|\n|$)/g));
  const washerMatches = Array.from(notes.matchAll(/Windshield washer fluid: ([^.\n]+)/g));
  const latestCode = codeMatches.at(-1);
  const latestNewPsi = newPsiMatches.at(-1);
  const latestOldPsi = oldPsiMatches.at(-1);
  const latestWasher = washerMatches.at(-1);

  if (!latestCode && !latestNewPsi && !latestOldPsi && !latestWasher) {
    return "";
  }

  const psiHtml = latestNewPsi
    ? `<p><strong>Tire pressure:</strong> ${escapeHtml(latestNewPsi[2].trim())} (door-jamb ${escapeHtml(latestNewPsi[1].trim())} PSI).</p>`
    : latestOldPsi
      ? `<p><strong>Tire pressure:</strong> ${escapeHtml(latestOldPsi[1].trim().replace(/\.$/, ""))}.</p>`
      : "";

  return `
    <section class="inspection-summary">
      <h3>Vehicle inspection</h3>
      ${psiHtml}
      ${latestWasher ? `<p><strong>Windshield washer fluid:</strong> ${escapeHtml(latestWasher[1].trim())}.</p>` : ""}
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
    lines.push(`<p><strong>Vehicle add-ons:</strong> ${formatCurrency(fees.inspection)}</p>`);
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

async function loadRequestPhotos(requestId, phone = trackState.verifiedTrackingContact.phone, email = trackState.verifiedTrackingContact.email) {
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

async function loadRequestReview(requestId, phone = trackState.verifiedTrackingContact.phone, email = trackState.verifiedTrackingContact.email) {
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

function renderReviewPrompt(request, review) {
  if (review) {
    const filled = '★'.repeat(review.rating);
    const empty = '☆'.repeat(5 - review.rating);
    return `
      <section class="review-panel review-panel--submitted">
        <h3>Your rating</h3>
        <div class="star-display" aria-label="${review.rating} out of 5 stars">${filled}${empty}</div>
        ${review.comments ? `<p class="review-comment">&ldquo;${escapeHtml(review.comments)}&rdquo;</p>` : ''}
      </section>
    `;
  }

  if (request.status !== "complete") return "";

  const workerName = request.assigned_worker_name || "your service partner";

  return `
    <section class="review-panel">
      <h3>Rate your service</h3>
      <p class="field-help">How did ${escapeHtml(workerName)} do with your vehicle service?</p>
      <div class="star-rating" role="radiogroup" aria-label="Service rating" data-selected="0">
        <button type="button" class="star-btn" data-star="1" aria-label="1 star">★</button>
        <button type="button" class="star-btn" data-star="2" aria-label="2 stars">★</button>
        <button type="button" class="star-btn" data-star="3" aria-label="3 stars">★</button>
        <button type="button" class="star-btn" data-star="4" aria-label="4 stars">★</button>
        <button type="button" class="star-btn" data-star="5" aria-label="5 stars">★</button>
      </div>
      <p class="star-rating-label">Tap a star to rate</p>
      <input type="hidden" class="star-rating-value" value="">
      <label>
        <textarea id="service-review-comments" rows="3" placeholder="Share anything about your experience…"></textarea>
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

// ── Vehicle data for completion form dropdowns ────────────────────────────────
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
      .filter((r) => slotHoldingStatuses.has(canonicalBookingStatus(r.status)))
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
  if (form.querySelector('.cb-quick-inspection')?.checked) details.push('Vehicle add-ons selected.');

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

// The booking-completion form, split into one helper per <fieldset> so the
// assembler below reads as an outline. Each helper returns the exact same markup
// that was previously inline — presentation only.
function pcContactFieldset(request) {
  return `
        <fieldset>
          <legend>Contact information</legend>
          <div class="field-grid">
            <label>
              <span>Name <span class="required-mark">Required</span></span>
              <input class="cb-customer-name" type="text" placeholder="Customer name"
                value="${escapeHtml(request.customer_name || '')}" required>
            </label>
            <label>
              <span>Phone number <span class="required-mark">Required</span></span>
              <input class="cb-customer-phone" type="tel"
                value="${escapeHtml(formatPhone(trackState.verifiedTrackingContact.phone || request.customer_phone || ''))}" readonly>
            </label>
            <label>
              <span>Email <span class="required-mark">Required</span></span>
              <input class="cb-customer-email" type="email"
                value="${escapeHtml(trackState.verifiedTrackingContact.email || request.customer_email || '')}" readonly>
            </label>
          </div>
        </fieldset>`;
}

function pcAddressFieldset(request) {
  return `
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
        </fieldset>`;
}

function pcVehicleFieldset(request) {
  return `
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
        </fieldset>`;
}

function pcParkingFieldset(request) {
  return `
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
        </fieldset>`;
}

function pcServiceFieldset(request) {
  const needsFuel = request.service_type === 'fuel' || request.service_type === 'car-wash-fuel';
  const needsWash = request.service_type === 'car-wash' || request.service_type === 'car-wash-fuel';
  const rid = escapeHtml(request.id);

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
  return `
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
        </fieldset>`;
}

function pcPaymentFieldset() {
  return `
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
                <dt>Vehicle add-ons</dt>
                <dd class="cb-inspection-fee">$0.00</dd>
              </div>
              <div>
                <dt>Estimated authorization</dt>
                <dd class="cb-estimated-total">$0.00</dd>
              </div>
            </dl>
          </div>
        </fieldset>`;
}

function pcAgreementFieldset() {
  return `
        <fieldset>
          <legend>Agreement</legend>
          <label class="checkbox-label">
            <input class="cb-agreed" type="checkbox" value="yes" required>
            <span>I agree that ShiftFuel Concierge may pick up, service, and return my vehicle using the instructions I provided.</span>
          </label>
          <p class="field-help">By booking, you agree to provide accurate vehicle, key, parking, fuel, and service instructions. ShiftFuel documents pickup and return condition with photos and will contact you if a requested service cannot be completed.</p>
          <p class="field-help">You may cancel before your specialist begins the service (a $15 fee applies once your key has been received). Once the service itself has started, it can no longer be cancelled and you will be charged for the completed service.</p>
          <p class="field-help">The amount shown before payment is an authorization hold only. ShiftFuel captures the final amount after service is completed based on actual receipts and selected services, and any unused hold is released by your card issuer. Online card authorizations are typically valid for about 7 days; after final capture or release, your bank or credit card company may take a few business days to show the final amount or released hold on your account.</p>
        </fieldset>`;
}

function renderPendingCompletionCard(request) {
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
        ${pcContactFieldset(request)}
        ${pcAddressFieldset(request)}
        ${pcVehicleFieldset(request)}
        ${pcParkingFieldset(request)}
        ${pcServiceFieldset(request)}
        ${pcPaymentFieldset()}
        ${pcAgreementFieldset()}
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

// Advance (saved-card) booking whose off-session authorization failed. The
// customer places a fresh hold on-session via the shared card modal.
function renderReauthCard(request) {
  const amount = request.estimated_total != null ? formatCurrency(request.estimated_total) : '';
  const serviceDate = request.service_date
    ? new Date(request.service_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  return `
    <article class="track-request-card track-payment-card" data-request-id="${escapeHtml(request.id)}">
      <details class="track-request-details" open>
        ${requestSummaryHtml(request, { statusLabel: "Re-authorize payment", statusClass: "status-pill-payment" })}
        <div class="track-request-body">
          <div class="action-required-banner">
            <strong>⚡ Action required — re-authorize payment</strong>
            <p>We couldn't authorize your card for your upcoming service${serviceDate ? ` on ${escapeHtml(serviceDate)}` : ''}. Please re-authorize so we can complete it. You're not charged until the service is done.</p>
          </div>
          ${request.service_label ? `<p><strong>Service:</strong> ${escapeHtml(request.service_label)}</p>` : ''}
          ${amount ? `<div class="estimated-total-card"><span class="estimated-total-label">Authorization total</span><span class="estimated-total-amount">${amount}</span></div>` : ''}
          <button class="button primary track-reauth-btn" data-id="${escapeHtml(request.id)}" type="button">Re-authorize payment</button>
          <p class="form-status" data-reauth-status="${escapeHtml(request.id)}"></p>
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

// ── Customer dashboard view (mockup layout) ─────────────────────────────────
// These render the clean two-column desktop / stacked mobile layout. They reuse
// the existing status logic (isStepDone, getStatusMessage, photo/worker data)
// so no tracking, payment, or privacy behaviour changes — only presentation.

const TRACK_SUPPORT_PHONE = '5551234567';
const TRACK_SUPPORT_PHONE_DISPLAY = '(555) 123-4567';

// The seven canonical, customer-facing steps from the spec. The granular
// internal statuses all roll up into one of these via isStepDone().
const SIMPLE_STATUS_STEPS = [
  { key: 'request_received',    label: 'Request Received',   desc: 'Your request has been received.' },
  { key: 'accepted',            label: 'Accepted',           desc: 'A ShiftFuel employee accepted your request.' },
  { key: 'key_received',        label: 'Key Received',       desc: 'Your key has been received.' },
  { key: 'vehicle_picked_up',   label: 'Vehicle Picked Up',  desc: 'Your vehicle has been picked up.' },
  { key: 'service_in_progress', label: 'Service In Progress',desc: 'Your requested service is in progress.' },
  { key: 'vehicle_returned',    label: 'Vehicle Returned',   desc: 'Your vehicle has been returned.' },
  { key: 'complete',            label: 'Complete',           desc: 'Your service is complete.' },
];

const CAR_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M5 11l1.5-4.2A2 2 0 0 1 8.4 5.5h7.2a2 2 0 0 1 1.9 1.3L19 11"/><path d="M3 11h18v5a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1v-1H6.5v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><circle cx="7" cy="14" r="1"/><circle cx="17" cy="14" r="1"/></svg>';

function stepTimeTagFromNotes(request, tag) {
  const matches = Array.from(String(request.notes || '').matchAll(new RegExp(`\\[${tag} ([^\\]]+)\\]`, 'g')));
  return matches.at(-1)?.[1] || '';
}

// "Today, 10:20 AM" when same calendar day, otherwise "Jun 23, 10:20 AM".
function formatTrackTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d)) return '';
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return `Today, ${time}`;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`;
}

function simpleStepTime(request, key) {
  if (key === 'request_received') return formatTrackTime(request.created_at);
  if (key === 'vehicle_picked_up') return formatTrackTime(stepTimeTagFromNotes(request, 'pickup_time'));
  if (key === 'vehicle_returned') return formatTrackTime(stepTimeTagFromNotes(request, 'dropoff_time'));
  if (key === 'complete' && isFinalRequestComplete(request)) return formatTrackTime(request.updated_at);
  return '';
}

function buildSimpleSteps(request) {
  const finalComplete = isFinalRequestComplete(request);
  const steps = SIMPLE_STATUS_STEPS.map((s) => ({
    ...s,
    done: finalComplete || isStepDone(s.key, request),
    time: simpleStepTime(request, s.key),
  }));
  const firstIncomplete = finalComplete ? -1 : steps.findIndex((s) => !s.done);
  steps.forEach((s, i) => { s.active = !finalComplete && i === firstIncomplete; });
  return steps;
}

function renderStatusStepper(request) {
  const steps = buildSimpleSteps(request);
  return `<ol class="sf-stepper">${steps.map((s) => {
    const cls = s.done ? 'done' : s.active ? 'active' : 'future';
    const icon = s.done ? '✓' : '';
    return `<li class="sf-step ${cls}">
        <span class="sf-step-dot">${icon}</span>
        <span class="sf-step-label">${escapeHtml(s.label)}</span>
        ${s.time ? `<span class="sf-step-time">${escapeHtml(s.time)}</span>` : ''}
      </li>`;
  }).join('')}</ol>`;
}

function renderCurrentStatusCard(request) {
  const label = friendlyStatusLabel(request.status);
  const msg = getStatusMessage(request) || '';
  const showCheck = !needsCustomerPaymentAction(request);
  const updated = request.updated_at ? formatTrackTime(request.updated_at) : '';
  return `
    <div class="tk-status-head">
      <div class="tk-status-headline">
        <p class="tk-eyebrow">Current Status</p>
        <h2 class="tk-status-title">${escapeHtml(label)}${showCheck ? '<span class="tk-status-check" aria-hidden="true">✓</span>' : ''}</h2>
        ${msg ? `<p class="tk-status-desc">${escapeHtml(msg)}</p>` : ''}
      </div>
      <div class="tk-status-meta">
        ${updated ? `<span class="tk-updated"><small>Last updated</small>${escapeHtml(updated)}</span>` : ''}
        <button class="tk-refresh" type="button" data-track-refresh aria-label="Refresh status">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 11A8 8 0 1 0 18 16.5"/><path d="M20 5v6h-6"/></svg>
          <span>Refresh</span>
        </button>
      </div>
    </div>
    ${renderStatusStepper(request)}
  `;
}

// App-like hero: names the current stage, shows a segmented progress bar, and the
// key at-a-glance info (concierge + return time). Reuses buildSimpleSteps so it
// stays in lockstep with the detailed timeline.
function renderTrackHero(request) {
  const steps = buildSimpleSteps(request);
  const total = steps.length;
  const doneCount = steps.filter((s) => s.done).length;
  const activeIdx = steps.findIndex((s) => s.active);
  const finalComplete = isFinalRequestComplete(request);
  const stepNum = finalComplete ? total : (activeIdx >= 0 ? activeIdx + 1 : Math.min(doneCount + 1, total));
  const nextStep = activeIdx >= 0 ? steps[activeIdx + 1] : null;

  const label = friendlyStatusLabel(request.status);
  const msg = getStatusMessage(request) || '';

  const segs = steps.map((s) => {
    const cls = s.done ? 'filled' : (s.active ? 'current' : '');
    return `<span class="tk-hero-seg ${cls}"></span>`;
  }).join('');

  const progressNote = finalComplete
    ? 'All steps complete'
    : `Step ${stepNum} of ${total}${nextStep ? ` &middot; next: ${escapeHtml(String(nextStep.label).toLowerCase())}` : ''}`;

  const returnTime = formatReturnTime(request.desired_return_time);
  const worker = request.assigned_worker_name;
  const quick = [];
  if (worker) {
    const isVerified = Boolean(request.assigned_worker_verified);
    const avatar = request.assigned_worker_photo_url
      ? `<img class="tk-hero-avatar tk-hero-avatar-photo" src="${escapeHtml(request.assigned_worker_photo_url)}" alt="${escapeHtml(worker)}">`
      : `<span class="tk-hero-avatar" aria-hidden="true">${escapeHtml(worker.charAt(0).toUpperCase())}</span>`;
    const canCall = isValidPhone(request.assigned_worker_phone);
    quick.push(`
      <div class="tk-hero-quick tk-hero-concierge">
        <span class="tk-hero-quick-label">Your concierge</span>
        <div class="tk-hero-concierge-row">
          ${avatar}
          <div class="tk-hero-concierge-info">
            <span class="tk-hero-quick-val">${escapeHtml(worker)}</span>
            ${isVerified ? '<span class="tk-hero-verified">&#10003; Verified ShiftFuel employee</span>' : ''}
          </div>
        </div>
        ${canCall ? `<a class="tk-hero-call" href="tel:${escapeHtml(cleanPhone(request.assigned_worker_phone))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 4h3l1.5 5-2 1a11 11 0 0 0 5 5l1-2 5 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>Call</a>` : ''}
      </div>`);
  }
  if (returnTime) {
    quick.push(`<div class="tk-hero-quick"><span class="tk-hero-quick-label">Back by</span><span class="tk-hero-quick-val">${escapeHtml(returnTime)}</span></div>`);
  }

  const icon = finalComplete
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><path d="M5 12.5l4 4 10-10"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M5 11l1.5-4.2A2 2 0 0 1 8.4 5.5h7.2a2 2 0 0 1 1.9 1.3L19 11"/><path d="M3 11h18v5a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1v-1H6.5v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><circle cx="7" cy="14" r="1"/><circle cx="17" cy="14" r="1"/></svg>';

  return `
    <section class="tk-hero">
      <div class="tk-hero-head">
        <span class="tk-hero-icon" aria-hidden="true">${icon}</span>
        <div class="tk-hero-headline">
          <p class="tk-hero-stage">${escapeHtml(label)}</p>
          ${msg ? `<p class="tk-hero-desc">${escapeHtml(msg)}</p>` : ''}
        </div>
        <button class="tk-hero-refresh" type="button" data-track-refresh aria-label="Refresh status">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><path d="M20 11A8 8 0 1 0 18 16.5"/><path d="M20 5v6h-6"/></svg>
        </button>
      </div>
      <div class="tk-hero-progress" role="img" aria-label="${progressNote.replace(/&middot;/g, ',').replace(/<[^>]+>/g, '')}">${segs}</div>
      <p class="tk-hero-progress-note">${progressNote}</p>
      ${quick.length ? `<div class="tk-hero-quickrow">${quick.join('')}</div>` : ''}
    </section>
  `;
}

function renderLiveUpdatesFeed(request) {
  const steps = buildSimpleSteps(request).filter((s) => s.done || s.active);
  if (!steps.length) return '<p class="tk-empty">Updates will appear here as your service progresses.</p>';
  // Newest-first.
  return `<ul class="tk-updates-list">${steps.slice().reverse().map((s) => `
    <li class="tk-update ${s.done ? 'done' : 'active'}">
      <span class="tk-update-dot" aria-hidden="true">${s.done ? '✓' : ''}</span>
      <div class="tk-update-body">
        <p class="tk-update-title">${escapeHtml(s.label)}</p>
        <p class="tk-update-desc">${escapeHtml(s.desc)}</p>
      </div>
      ${s.time ? `<span class="tk-update-time">${escapeHtml(s.time)}</span>` : ''}
    </li>`).join('')}</ul>`;
}

// Live GPS panel. The live map (injected by track-live-location.js into the
// mount) is only relevant while the worker holds the vehicle — i.e. after the
// keys are received and before the vehicle is returned. Outside that window we
// show a plain status note instead.
function renderGpsTracking(request) {
  const keysReceived = isStepDone('key_received', request);
  const vehicleReturned = isStepDone('vehicle_returned', request) || isFinalRequestComplete(request);

  if (!keysReceived) {
    // Worker is driving to the vehicle (tapped Start, GPS on) — show a live ETA.
    if (workerEnRouteToVehicle(request)) {
      return etaBannerHtml(request);
    }
    return `<div class="tk-gps-state tk-gps-off"><span class="tk-gps-dot" aria-hidden="true"></span>GPS is not currently on — keys not received</div>`;
  }
  if (vehicleReturned) {
    return `<div class="tk-gps-state tk-gps-done"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12.5l4 4 10-10"/></svg>Keys returned — GPS is no longer needed</div>`;
  }
  // Active service window — the live map injects into this mount.
  return `<div class="track-live-location-mount"></div>`;
}

function renderPartnerCard(request) {
  if (!request.assigned_worker_name) return '';
  const name = request.assigned_worker_name;
  const isVerified = Boolean(request.assigned_worker_verified);
  const photo = request.assigned_worker_photo_url
    ? `<img class="tk-partner-photo" src="${escapeHtml(request.assigned_worker_photo_url)}" alt="${escapeHtml(name)}">`
    : `<span class="tk-partner-photo tk-partner-initial">${escapeHtml(name.charAt(0).toUpperCase())}</span>`;
  const canCall = isValidPhone(request.assigned_worker_phone);
  return `
    <p class="tk-eyebrow">Your Service Partner</p>
    <div class="tk-partner-row">
      ${photo}
      <div class="tk-partner-info">
        <p class="tk-partner-name">${escapeHtml(name)}</p>
        ${isVerified ? '<span class="tk-partner-badge">✓ Verified ShiftFuel Employee</span>' : ''}
      </div>
    </div>
    ${canCall ? `<a class="button secondary tk-partner-action" href="tel:${escapeHtml(cleanPhone(request.assigned_worker_phone))}">Call</a>` : ''}
  `;
}

// The gas station the customer chose at booking (only for fuel services, and
// only once a station was actually selected). Shown so the customer can confirm
// where their vehicle is being fueled — mirrors the worker + admin views.
function gasStationMetaRow(request) {
  if (!requestNeedsFuel(request)) return '';
  // Fallback when no station was recorded (the nearby-station lookup can fail, or
  // the booking predates station capture): we still fuel at the closest one, so
  // show that rather than a blank.
  if (!request.gas_station_name) {
    return `<div><dt>Gas station</dt><dd>Closest available station</dd></div>`;
  }
  const addr = request.gas_station_address ? ` — ${escapeHtml(request.gas_station_address)}` : '';
  return `<div><dt>Gas station</dt><dd>${escapeHtml(request.gas_station_name)}${addr}</dd></div>`;
}

function renderVehicleCard(request) {
  const vehicle = [request.vehicle_year, request.vehicle_make, request.vehicle_model].filter(Boolean).join(' ') || 'Your vehicle';
  const serviceDate = request.service_date
    ? new Date(request.service_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  const returnTime = formatReturnTime(request.desired_return_time);
  const serviceArea = [request.address_street || request.hospital, request.address_city, request.address_state].filter(Boolean).join(', ');
  const parking = [request.parking_location, request.parking_spot ? 'spot ' + request.parking_spot : ''].filter(Boolean).join(', ');
  const service = request.service_label || serviceLabelFromType(request.service_type) || request.service_type || '';
  return `
    <div class="tk-vehicle-top">
      <span class="tk-vehicle-icon">${CAR_ICON_SVG}</span>
      <div class="tk-vehicle-id-block">
        <p class="tk-vehicle-name">${escapeHtml(vehicle)}</p>
        ${request.vehicle_color ? `<p class="tk-vehicle-color">${escapeHtml(request.vehicle_color)}</p>` : ''}
        <span class="tk-vehicle-id">${escapeHtml(trackRequestNumber(request.id))}</span>
      </div>
    </div>
    <dl class="tk-vehicle-meta">
      ${service ? `<div><dt>Service</dt><dd>${escapeHtml(service)}</dd></div>` : ''}
      ${requestNeedsFuel(request) && request.fuel_type ? `<div><dt>Fuel type</dt><dd>${escapeHtml(request.fuel_type)}</dd></div>` : ''}
      ${gasStationMetaRow(request)}
      ${requestNeedsWash(request) && request.wash_package ? `<div><dt>Car wash package</dt><dd>${escapeHtml(washLabelFromValue(request.wash_package))}</dd></div>` : ''}
      ${serviceArea ? `<div><dt>Location</dt><dd>${escapeHtml(serviceArea)}</dd></div>` : ''}
      ${parking ? `<div><dt>Parking</dt><dd>${escapeHtml(parking)}</dd></div>` : ''}
      ${returnTime ? `<div><dt>Return Window</dt><dd>${escapeHtml(serviceDate ? serviceDate + ', ' : '')}${escapeHtml(returnTime)}</dd></div>` : ''}
      ${request.key_handoff_details ? `<div><dt>Key handoff</dt><dd>${escapeHtml(request.key_handoff_details)}</dd></div>` : ''}
    </dl>
  `;
}

const TRACK_PHOTO_LABELS = {
  key_received: 'Key Received',
  pickup_vehicle: 'Vehicle Picked Up',
  pickup_driver_front: 'Exterior - Front', pickup_passenger_front: 'Exterior - Front', pickup_front: 'Exterior - Front',
  pickup_driver_rear: 'Exterior - Rear', pickup_passenger_rear: 'Exterior - Rear', pickup_rear: 'Exterior - Rear',
  pickup_driver_side: 'Exterior - Side', pickup_passenger_side: 'Exterior - Side',
  pickup_odometer: 'Odometer', pickup_fuel_gauge: 'Fuel Level',
  fuel_receipt: 'Fuel Receipt', wash_receipt: 'Wash Receipt',
  dropoff_driver_front: 'Return Photo', dropoff_front: 'Return Photo', dropoff_passenger_front: 'Return Photo',
  dropoff_driver_rear: 'Return Photo', dropoff_rear: 'Return Photo',
  dropoff_odometer: 'Odometer', dropoff_fuel_gauge: 'Fuel Level',
};

function trackPhotoLabel(type) {
  return TRACK_PHOTO_LABELS[type] || String(type || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Customer-facing photo groups, in display order: starting/ending exterior,
// odometer + fuel level (each before→after), and service receipts.
const TRACK_PHOTO_GROUPS = [
  { key: 'starting', title: 'Starting exterior' },
  { key: 'odometer', title: 'Odometer' },
  { key: 'fuel',     title: 'Fuel level' },
  { key: 'receipts', title: 'Service receipts' },
  { key: 'ending',   title: 'Ending exterior' },
];

function trackPhotoGroup(type) {
  const t = String(type || '');
  if (t.includes('odometer')) return 'odometer';
  if (t.includes('fuel_gauge')) return 'fuel';
  if (t.includes('receipt')) return 'receipts';
  if (t.startsWith('dropoff')) return 'ending';
  return 'starting'; // pickup_* exterior, key_received, anything else
}

// 'before' = pickup, 'after' = dropoff — orders + labels the odometer/fuel pairs.
function trackPhotoPhase(type) {
  const t = String(type || '');
  if (t.startsWith('dropoff')) return 'after';
  if (t.startsWith('pickup')) return 'before';
  return '';
}

function renderPhotoTile(p) {
  const thumb = p.thumbnail_url || p.image_url;
  const full = p.original_url || p.image_url;
  if (!thumb && !full) return '';
  const fullLabel = trackPhotoLabel(p.photo_type);
  const group = trackPhotoGroup(p.photo_type);
  const phase = trackPhotoPhase(p.photo_type);
  // In before/after groups the heading already says Odometer/Fuel, so the tile
  // just labels which shot it is.
  const label = (group === 'odometer' || group === 'fuel') && phase
    ? (phase === 'before' ? 'Before' : 'After')
    : fullLabel;
  const time = p.created_at ? formatTimeShort(p.created_at) : '';
  return `
    <button class="tk-photo-tile" type="button"
            data-lightbox-src="${escapeHtml(full)}" data-lightbox-label="${escapeHtml(fullLabel)}">
      <img src="${escapeHtml(thumb)}" alt="${escapeHtml(label)}" loading="lazy">
      <span class="tk-photo-label">${escapeHtml(label)}</span>
      ${time ? `<span class="tk-photo-time">${escapeHtml(time)}</span>` : ''}
    </button>`;
}

function renderPhotoStrip(request, photos) {
  if (!photos || !photos.length) return '';
  // Bucket photos into the customer-facing groups.
  const buckets = {};
  for (const p of photos) {
    const g = trackPhotoGroup(p.photo_type);
    (buckets[g] = buckets[g] || []).push(p);
  }
  // Order before (pickup) → after (dropoff) within the paired groups, so the
  // "before" shot sits on the left and "after" on the right.
  const phaseRank = { before: 0, after: 1, '': 2 };
  ['odometer', 'fuel'].forEach((g) => {
    if (buckets[g]) buckets[g].sort((a, b) => phaseRank[trackPhotoPhase(a.photo_type)] - phaseRank[trackPhotoPhase(b.photo_type)]);
  });
  // Groups render as plain headed sections (label + photos directly below) on
  // every screen — no per-group accordion. The Photos section itself still
  // collapses the whole thing on mobile, so this avoids a third tap-to-open layer.
  const sections = TRACK_PHOTO_GROUPS.map(({ key, title }) => {
    const items = buckets[key];
    if (!items || !items.length) return '';
    const tiles = items.map(renderPhotoTile).join('');
    return `
      <section class="tk-photo-group">
        <p class="tk-photo-group-head">
          <span class="tk-photo-group-title">${escapeHtml(title)}</span>
          <span class="tk-photo-group-count">${items.length}</span>
        </p>
        <div class="tk-photo-group-body"><div class="tk-photo-grid">${tiles}</div></div>
      </section>`;
  }).join('');

  return `<div class="tk-photo-groups">${sections}</div>`;
}

function renderHelpCard() {
  return `
    <p class="tk-eyebrow">Questions?</p>
    <p class="tk-help-text">We're here to help.</p>
    <a class="button secondary tk-help-action" href="tel:${TRACK_SUPPORT_PHONE}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 4h3l1.5 5-2 1a11 11 0 0 0 5 5l1-2 5 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>
      <span>Contact Support</span>
    </a>
    <p class="tk-help-num">${TRACK_SUPPORT_PHONE_DISPLAY}</p>
  `;
}

// ── Sub-accordion helper ─────────────────────────────────────────────────────
// Wraps content in a collapsible <details> section inside an expanded request.
function tkSubAcc(title, content, { open = false, className = '' } = {}) {
  const trimmed = (content || '').trim();
  if (!trimmed) return '';
  return `
    <details class="tk-sub-acc${className ? ' ' + className : ''}"${open ? ' open' : ''}>
      <summary class="tk-sub-acc-head">
        <span>${escapeHtml(title)}</span>
        <svg class="tk-sub-acc-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
      </summary>
      <div class="tk-sub-acc-body">${trimmed}</div>
    </details>`;
}

// ── Canceled-request view ───────────────────────────────────────────────────
// A canceled request gets a dedicated top-down layout: "Canceled" + the right
// message first, then cancellation/return details, then request details. The
// worker card only appears (lower, as "Return Partner") while a return is still
// pending — never above the cancellation status.

const CANCELED_STATUS_SET = new Set([
  'canceled', 'cancelled', 'customer_canceled', 'closed_canceled',
  'cancelled_pending_key_return', 'canceled_return_completed',
]);

function isCanceledStatus(status) {
  return canonicalBookingStatus(status) === 'cancelled' || CANCELED_STATUS_SET.has(status);
}

function canceledReturnPending(request) {
  return request.status === 'cancelled_pending_key_return';
}

const CANCELED_STAGE_MESSAGES = {
  before_accept: 'Your request was canceled before service started.',
  after_accept: 'Your request was canceled. No service is currently in progress.',
  after_key: 'Your request was canceled. Your key return may still be in progress.',
  after_pickup: 'Your request was canceled. Your vehicle return may still be in progress.',
  closed: 'Your request was canceled and closed.',
};

function canceledStage(request) {
  const s = request.status;
  if (s === 'canceled_return_completed') return 'closed';
  // Prefer the explicit return-requirement fields set at cancel time over
  // inferring the stage from notes.
  if (request.vehicle_return_required === true) return 'after_pickup';
  if (request.key_return_required === true) return 'after_key';
  // A completed return stamps *_returned_at and clears the requirement.
  if (request.vehicle_returned_at || request.key_returned_at) return 'closed';
  const pickedUp = Boolean(request.vehicle_picked_up_at) || Boolean(stepTimeTagFromNotes(request, 'pickup_time'));
  if (s === 'cancelled_pending_key_return') return pickedUp ? 'after_pickup' : 'after_key';
  // Terminal canceled statuses (no return pending).
  if (pickedUp) return 'closed';
  if (request.assigned_worker_name) return 'after_accept';
  return 'before_accept';
}

function canceledPaymentNote(request) {
  if (request.cancellation_fee_applied) {
    return 'A $15 cancellation/service fee was charged. Any remaining authorization hold was released.';
  }
  if (PAYMENT_RELEASED_STATUSES.includes(request.payment_status)) {
    return 'Your authorization hold was released and you were not charged.';
  }
  return '';
}

function renderReturnPartnerCard(request) {
  if (!request.assigned_worker_name) return '';
  const name = request.assigned_worker_name;
  const isVerified = Boolean(request.assigned_worker_verified);
  const photo = request.assigned_worker_photo_url
    ? `<img class="tk-partner-photo" src="${escapeHtml(request.assigned_worker_photo_url)}" alt="${escapeHtml(name)}">`
    : `<span class="tk-partner-photo tk-partner-initial">${escapeHtml(name.charAt(0).toUpperCase())}</span>`;
  const canCall = isValidPhone(request.assigned_worker_phone);
  return `
    <p class="tk-eyebrow">Return Partner</p>
    <div class="tk-partner-row">
      ${photo}
      <div class="tk-partner-info">
        <p class="tk-partner-name">${escapeHtml(name)}</p>
        ${isVerified ? '<span class="tk-partner-badge">✓ Verified ShiftFuel Employee</span>' : ''}
      </div>
    </div>
    ${canCall ? `<a class="button secondary tk-partner-action" href="tel:${escapeHtml(cleanPhone(request.assigned_worker_phone))}">Call</a>` : ''}
  `;
}

function renderCanceledCard(request, photos = [], { expanded = false } = {}) {
  const stage = canceledStage(request);
  const returnPending = canceledReturnPending(request);
  const returnsVehicle = stage === 'after_pickup';
  // While a return is pending, the headline and message name what's coming back.
  const headline = returnPending
    ? (returnsVehicle ? 'Canceled — Vehicle Return Pending' : 'Canceled — Key Return Pending')
    : 'Canceled';
  const message = returnPending
    ? (returnsVehicle
        ? 'Your request was canceled. Your vehicle return is still in progress.'
        : 'Your request was canceled. A ShiftFuel team member will return your key as soon as safely possible.')
    : (CANCELED_STAGE_MESSAGES[stage] || 'Your request was canceled.');
  const paymentNote = canceledPaymentNote(request);
  const reason = cancellationReasonForDisplay(request);
  const canceledAt = request.updated_at
    ? new Date(request.updated_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '';
  const canceledBy = request.status === 'customer_canceled' ? 'You (customer)' : '';

  // Request details.
  const vehicle = [request.vehicle_year, request.vehicle_make, request.vehicle_model].filter(Boolean).join(' ') || 'Your vehicle';
  const service = request.service_label || serviceLabelFromType(request.service_type) || request.service_type || '';
  const serviceDate = request.service_date
    ? new Date(request.service_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  const returnTime = formatReturnTime(request.desired_return_time);
  const serviceArea = [request.address_street || request.hospital, request.address_city, request.address_state].filter(Boolean).join(', ');
  const hasPhotos = Array.isArray(photos) && photos.length > 0;

  const returnStatusCard = returnPending ? `
    <section class="tk-card tk-return-status">
      <p class="tk-eyebrow">Return Status</p>
      <p class="tk-return-line"><span class="tk-return-dot" aria-hidden="true"></span>${stage === 'after_pickup' ? 'Vehicle return pending' : 'Key return pending'}</p>
      <p class="tk-status-desc">A ShiftFuel team member will return your ${stage === 'after_pickup' ? 'vehicle' : 'key'} as soon as safely possible.</p>
    </section>` : '';

  return `
    <article class="track-request-card track-canceled-card" data-request-id="${escapeHtml(request.id)}">
      <details class="track-request-details"${expanded ? ' open' : ''}>
        ${requestSummaryHtml(request, { statusLabel: headline, statusClass: 'status-pill-denied' })}
        <div class="track-request-body">

          ${tkSubAcc('Current Status', `
            <section class="tk-card tk-canceled-status">
              <p class="tk-eyebrow">Current Status</p>
              <h2 class="tk-status-title tk-canceled-title">${escapeHtml(headline)}</h2>
              <p class="tk-status-desc">${escapeHtml(message)}</p>
              ${paymentNote ? `<p class="tk-canceled-note">${escapeHtml(paymentNote)}</p>` : ''}
              <a class="button secondary tk-help-action" href="tel:${TRACK_SUPPORT_PHONE}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 4h3l1.5 5-2 1a11 11 0 0 0 5 5l1-2 5 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>
                <span>Contact Support</span>
              </a>
            </section>
            ${returnStatusCard}
            ${returnPending && request.assigned_worker_name ? `<section class="tk-card tk-partner">${renderReturnPartnerCard(request)}</section>` : ''}
          `, { open: true })}

          ${tkSubAcc('Cancellation Details', `
            <section class="tk-card">
              <dl class="tk-vehicle-meta">
                ${canceledAt ? `<div><dt>Canceled</dt><dd>${escapeHtml(canceledAt)}</dd></div>` : ''}
                ${canceledBy ? `<div><dt>Canceled by</dt><dd>${escapeHtml(canceledBy)}</dd></div>` : ''}
                <div><dt>Cancellation fee</dt><dd>${request.cancellation_fee_applied ? '$15 charged' : 'None'}</dd></div>
                ${reason ? `<div><dt>Reason</dt><dd>${escapeHtml(reason)}</dd></div>` : ''}
              </dl>
            </section>
          `)}

          ${tkSubAcc('Request Details', `
            <section class="tk-card">
              <dl class="tk-vehicle-meta">
                ${service ? `<div><dt>Service</dt><dd>${escapeHtml(service)}</dd></div>` : ''}
                ${requestNeedsFuel(request) && request.fuel_type ? `<div><dt>Fuel type</dt><dd>${escapeHtml(request.fuel_type)}</dd></div>` : ''}
                ${gasStationMetaRow(request)}
                ${requestNeedsWash(request) && request.wash_package ? `<div><dt>Car wash package</dt><dd>${escapeHtml(washLabelFromValue(request.wash_package))}</dd></div>` : ''}
                <div><dt>Vehicle</dt><dd>${escapeHtml(vehicle)}${request.vehicle_color ? ', ' + escapeHtml(request.vehicle_color) : ''}</dd></div>
                ${returnTime ? `<div><dt>Return window</dt><dd>${escapeHtml(serviceDate ? serviceDate + ', ' : '')}${escapeHtml(returnTime)}</dd></div>` : ''}
                ${serviceArea ? `<div><dt>Service address</dt><dd>${escapeHtml(serviceArea)}</dd></div>` : ''}
              </dl>
            </section>
          `)}

          ${tkSubAcc('Photos', `
            <div class="tk-photos-lazy"><p class="tk-empty">Loading photos…</p></div>
          `)}

          <!-- Live location mounts here (only while a key/vehicle return is active). -->
          <div class="track-live-location-mount"></div>

          ${tkSubAcc('Help', `<section class="tk-card tk-help">${renderHelpCard()}</section>`)}
        </div>
      </details>
    </article>
  `;
}

// ── Completed-request view ──────────────────────────────────────────────────
// A clean customer receipt: summary card open by default, heavier detail
// (timeline, photos, inspection, timing, line items) tucked into collapsed
// accordions so it doesn't read like an admin report.

function capitalizeFirst(text) {
  const s = String(text || '');
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function lowerFirst(text) {
  const s = String(text || '');
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

function completedOutcomeSummary(request) {
  const needsFuel = requestNeedsFuel(request);
  const needsWash = requestNeedsWash(request);
  const unable = serviceUnableReasonsFromNotes(request) || { fuel: '', wash: '' };
  const done = [];
  const notDone = [];
  if (needsWash) (unable.wash ? notDone : done).push({ label: 'car wash', reason: unable.wash });
  if (needsFuel) (unable.fuel ? notDone : done).push({ label: 'fuel service', reason: unable.fuel });
  if (request.quick_inspection) done.push({ label: 'vehicle add-ons', reason: '' });

  const sentences = [];
  if (done.length) {
    const names = done.map((d) => d.label);
    const list = names.length > 1
      ? names.slice(0, -1).join(', ') + ' and ' + names.slice(-1)
      : names[0];
    sentences.push(`Your ${list} ${done.length > 1 ? 'were' : 'was'} completed.`);
  }
  notDone.forEach((d) => {
    const reason = String(d.reason || '').replace(/\.$/, '').trim();
    sentences.push(`${capitalizeFirst(d.label)} was not completed${reason ? ` because ${lowerFirst(reason)}` : ''}.`);
  });
  return sentences.join(' ');
}

function renderCompletedCard(request, photos = [], review = null, { expanded = false } = {}) {
  const vehicle = [request.vehicle_year, request.vehicle_make, request.vehicle_model].filter(Boolean).join(' ') || 'Your vehicle';
  const service = request.service_label || serviceLabelFromType(request.service_type) || request.service_type || '';
  const finalAmount = request.final_total != null ? request.final_total : request.estimated_total;
  const completedAt = request.completed_at || request.updated_at;
  const completedStr = completedAt
    ? new Date(completedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '';
  const outcome = completedOutcomeSummary(request);
  const inspection = inspectionSummaryFromNotes(request);
  const timing = serviceTimingFromNotes(request);
  const details = `${renderServicePackageDetails(request)}${serviceSummaryFromRequest(request)}`;
  const reviewHtml = renderReviewPrompt(request, review);
  // Desktop reads as a website: expand the detail sections by default (no clicking
  // through every accordion). Mobile keeps them collapsed for the app-like feel.
  const detailsOpen = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(min-width: 1000px)').matches;

  return `
    <article class="track-request-card track-completed-card" data-request-id="${escapeHtml(request.id)}">
      <details class="track-request-details"${expanded ? ' open' : ''}>
        ${requestSummaryHtml(request, { statusLabel: 'Complete', statusClass: 'status-pill-complete' })}
        <div class="track-request-body track-completed-body">

          ${renderServiceIssueBanner(request)}

          <section class="tk-card tk-completed-summary">
            <div class="tk-completed-head">
              <div>
                <p class="tk-eyebrow">Status</p>
                <h2 class="tk-status-title">Complete<span class="tk-status-check" aria-hidden="true">✓</span></h2>
              </div>
              ${finalAmount != null ? `<div class="tk-completed-total"><small>Final total</small>${escapeHtml(formatCurrency(finalAmount))}</div>` : ''}
            </div>
            ${outcome ? `<p class="tk-status-desc">${escapeHtml(outcome)}</p>` : ''}
            <dl class="tk-vehicle-meta tk-completed-meta">
              <div><dt>Vehicle</dt><dd>${escapeHtml(vehicle)}${request.vehicle_color ? ', ' + escapeHtml(request.vehicle_color) : ''}</dd></div>
              ${service ? `<div><dt>Service</dt><dd>${escapeHtml(service)}</dd></div>` : ''}
              ${gasStationMetaRow(request)}
              ${completedStr ? `<div><dt>Completed</dt><dd>${escapeHtml(completedStr)}</dd></div>` : ''}
              ${request.assigned_worker_name ? `<div><dt>Service partner</dt><dd>${escapeHtml(request.assigned_worker_name)}</dd></div>` : ''}
            </dl>
          </section>

          ${reviewHtml}

          ${tkSubAcc('Photos', `<div class="tk-photos-lazy"><p class="tk-empty">Loading photos…</p></div>`, { open: detailsOpen, className: 'tk-sub-acc--full' })}
          ${tkSubAcc('Vehicle inspection', inspection, { open: detailsOpen })}
          ${tkSubAcc('Service timing', timing, { open: detailsOpen })}
          ${tkSubAcc('Service details', details, { open: detailsOpen })}
          ${tkSubAcc('Contact & questions', renderHelpCard(), { open: detailsOpen })}
        </div>
      </details>
    </article>
  `;
}

function renderRequestCard(request, photos = [], review = null, { expanded = false } = {}) {
  if (isCanceledStatus(request.status)) {
    return renderCanceledCard(request, photos, { expanded });
  }
  if (canonicalBookingStatus(request.status) === 'completed') {
    return renderCompletedCard(request, photos, review, { expanded });
  }
  if (request.status === 'pending_customer_info') {
    return renderPendingCompletionCard(request);
  }
  if (request.payment_status === 'needs_reauth') {
    return renderReauthCard(request);
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

  const hasWorker = Boolean(request.assigned_worker_name);
  const hasPhotos = Array.isArray(photos) && photos.length > 0;
  // Desktop: open every detail section by default so the two-column dashboard is
  // filled. Mobile keeps them collapsed for the cleaner app-like feel.
  const detailsOpen = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(min-width: 1000px)').matches;

  return `
    <article class="track-request-card track-dashboard-card" data-request-id="${escapeHtml(request.id)}">
      <details class="track-request-details"${expanded ? ' open' : ''}>
        ${requestSummaryHtml(request, { statusLabel, statusClass: canonicalBookingStatus(request.status) === 'completed' ? 'status-pill-complete' : '' })}

        <div class="track-request-body">
          ${renderTrackHero(request)}
          ${renderServiceIssueBanner(request)}
          ${renderReturnCompletedNotice(request)}
          ${request.status === 'auto_reversed' ? `<p class="track-auto-reversed-note">Your service was not completed on the scheduled date, so your payment has been reversed.</p>` : ''}

          <div class="tk-detail-grid">
          <div class="tk-detail-col">
            ${tkSubAcc('Vehicle Information', `
              <section class="tk-card tk-vehicle">${renderVehicleCard(request)}</section>
            `, { open: true })}

          </div>

          <div class="tk-detail-col">
            ${tkSubAcc('Progress', `
              <section class="tk-card tk-updates"><p class="tk-eyebrow">Live GPS tracking</p>${renderGpsTracking(request)}</section>
              <section class="tk-card tk-updates tk-timeline-card"><p class="tk-eyebrow">Status timeline</p>${renderLiveUpdatesFeed(request)}</section>
            `, { open: true })}

            ${tkSubAcc('Important Details', [
              renderEstimatedTotalCard(request),
              isReturned ? renderReturnDetails(request) : '',
              serviceTimingFromNotes(request),
              inspectionSummaryFromNotes(request),
              canonicalBookingStatus(request.status) === 'completed' ? serviceSummaryFromRequest(request) : '',
            ].filter(Boolean).join(''), { open: detailsOpen })}
          </div>
          </div>

          ${tkSubAcc('Photos & History', `
            <div class="tk-photos-lazy"><p class="tk-empty">Loading photos...</p></div>
          `, { open: detailsOpen, className: 'tk-sub-acc--full tk-sub-acc-history' })}

          ${renderReviewPrompt(request, review)}
          ${tkSubAcc('Help', `<section class="tk-card tk-help">${renderHelpCard()}</section>`, { open: detailsOpen })}
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
  // A request that was canceled but still has the key/vehicle out
  // (cancelled_pending_key_return) is NOT closed — the ticket stays open until
  // the worker returns it. So it lists under "Requests in progress" (shown with
  // its "Canceled — Key/Vehicle Return Pending" card). Only fully-canceled
  // tickets go to the Cancelled section.
  const isReturnPending = (status) => status === 'cancelled_pending_key_return';
  // Closed/finished requests fall off the customer's tracker after 30 days
  // (based on last activity). Active requests always show, no matter how old.
  const within30Days = (r) => {
    const t = new Date(r.updated_at || r.created_at || 0).getTime();
    return Number.isFinite(t) && (Date.now() - t) <= 30 * 24 * 60 * 60 * 1000;
  };

  const inProgress = requests.filter(r => !terminalStatuses.includes(canonicalBookingStatus(r.status)) && (isReturnPending(r.status) || !isCanceledStatus(r.status)));
  const completed  = requests.filter(r => canonicalBookingStatus(r.status) === 'completed' && within30Days(r));
  // Cancelled (customer/admin) and Denied are merged into one "closed" history
  // section — both are end states the customer can't act on. Return-pending
  // cancellations stay in "In progress" until the worker confirms the return.
  const closed = requests.filter((r) => within30Days(r)
    && ((isCanceledStatus(r.status) && !isReturnPending(r.status)) || deniedOnlyStatuses.has(r.status)));

  // Auto-expand only a genuinely active (non-canceled) request. A return-pending
  // cancellation lists in this section but never auto-expands. The section opens
  // whenever it has anything in it so the customer can see it.
  const activeInProgressRequest = inProgress.find((r) => !isCanceledStatus(r.status)) || null;
  const expandedRequestId = activeInProgressRequest ? activeInProgressRequest.id : null;

  let html = `<div class="track-sections">`;

  // In Progress section
  html += `
    <details class="track-section"${inProgress.length ? ' open' : ''}>
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
      // Load review upfront (needed for review prompt); photos lazy-load on expand
      const review = await loadRequestReview(request.id, phone, email);
      html += renderRequestCard(request, [], review, { expanded: request.id === expandedRequestId });
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
      html += renderRequestCard(request, [], null);
    }
  }
  html += `</div></details>`;

  // Cancelled & denied — merged history section, always collapsed. Each card
  // renders in its own style (canceled vs denied). Photos load lazily on expand.
  html += `
    <details class="track-section">
      <summary class="track-section-header">
        Cancelled &amp; denied requests
        <span class="track-section-count">${closed.length}</span>
      </summary>
      <div class="track-section-body">
  `;
  if (closed.length === 0) {
    html += `<p class="track-empty-msg">No cancelled or denied requests in the last 30 days.</p>`;
  } else {
    for (const request of closed) {
      html += isCanceledStatus(request.status)
        ? renderCanceledCard(request, [], { expanded: false })
        : renderDeniedCard(request);
    }
  }
  html += `</div></details>`;

  html += `</div>`;
  trackingResult.innerHTML = html;

  // Snapshot "how far out is my specialist" ETA (computed once, when the worker
  // hit Start). Not polled — live GPS only starts after keys are received.
  updateEtaBanners();

  // After a successful lookup, condense the search form to a slim bar so the
  // result cards get the space. Tapping the bar re-expands it for a new search.
  const searchCard = document.querySelector('.track-search-card');
  if (searchCard && requests && requests.length) {
    searchCard.classList.add('is-condensed');
    if (!searchCard.dataset.toggleWired) {
      searchCard.dataset.toggleWired = '1';
      searchCard.addEventListener('click', () => {
        if (!searchCard.classList.contains('is-condensed')) return;
        searchCard.classList.remove('is-condensed');
        searchCard.querySelector('input')?.focus();
      });
    }
  }

  // Map for lazy photo loading
  const requestMap = new Map(requests.map((r) => [r.id, r]));

  // One group section open at a time
  trackingResult.querySelectorAll('.track-section').forEach((section) => {
    section.addEventListener('toggle', () => {
      if (!section.open) return;
      trackingResult.querySelectorAll('.track-section').forEach((other) => {
        if (other !== section && other.open) other.open = false;
      });
    });
  });

  // Lazy-load photos into a request's .tk-photos-lazy placeholder
  async function loadPhotosInto(details) {
    const card = details.closest('[data-request-id]');
    const reqId = card?.dataset.requestId;
    const photoMount = details.querySelector('.tk-photos-lazy:not([data-photos-loaded])');
    if (!reqId || !photoMount) return;
    photoMount.dataset.photosLoaded = '1';
    try {
      const request = requestMap.get(reqId);
      const photos = await loadRequestPhotos(reqId, phone, email);
      if (request && photos.length > 0) {
        photoMount.innerHTML = renderPhotoStrip(request, photos);
      } else {
        photoMount.innerHTML = '<p class="tk-empty">No photos available yet.</p>';
      }
    } catch (e) {
      photoMount.innerHTML = '<p class="tk-empty">Could not load photos.</p>';
    }
  }

  // One request expanded at a time + mount payment cards
  trackingResult.querySelectorAll('.track-request-details').forEach((details) => {
    details.addEventListener('toggle', async () => {
      if (!details.open) return;
      const body = details.closest('.track-section-body');
      if (body) {
        body.querySelectorAll('.track-request-details').forEach((other) => {
          if (other !== details && other.open) other.open = false;
        });
      }
      mountVisibleCustomerPayCards(details);
      // Photos may be open-by-default (desktop), so their own toggle won't fire —
      // load them whenever the request expands.
      await loadPhotosInto(details);
    });
  });

  // Load photos when the Photos sub-accordion is opened
  trackingResult.querySelectorAll('.tk-sub-acc').forEach((subAcc) => {
    subAcc.addEventListener('toggle', async () => {
      if (!subAcc.open) return;
      const details = subAcc.closest('.track-request-details');
      if (details) await loadPhotosInto(details);
    });
  });

  // For already-open request(s) on render, mount payment cards + load photos
  trackingResult.querySelectorAll('.track-request-details[open]').forEach(async (details) => {
    mountVisibleCustomerPayCards(details);
    await loadPhotosInto(details);
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
    trackState.verifiedTrackingContact = { phone, email };
    window._trackingContact = trackState.verifiedTrackingContact;
    trackMessage.textContent = "";
    if (refreshStatusBtn) refreshStatusBtn.hidden = false;
    window._trackingRequests = matchedRequests;
    await renderAllRequests(matchedRequests, phone, email);
    startTrackingPoll();
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = originalSubmitText || "Track Request";
    }
  }
});

refreshStatusBtn?.addEventListener("click", () => {
  if (!trackState.verifiedTrackingContact.phone && !trackState.verifiedTrackingContact.email && !trackingId.value.trim()) {
    return;
  }
  trackMessage.textContent = "Refreshing status...";
  window._trackingRequests = [];
  trackForm.requestSubmit();
});

// In-card "Refresh" icon and photo "View all" toggle (dashboard layout).
trackingResult.addEventListener("click", (event) => {
  if (event.target.closest('[data-track-refresh]')) {
    event.preventDefault();
    refreshStatusBtn?.click();
    return;
  }
});

// ── Auto-refresh tracked request status ──────────────────────────────────────
// Polls in the background so worker-side changes (e.g. a cancellation or
// completion) appear without the customer hitting "Refresh Status". To avoid
// disrupting an open accordion or a half-filled payment/cancel form, it only
// re-renders when a status actually changed since the last poll.

function trackedStatusSignature(list) {
  return (list || [])
    .map((r) => `${r.id}:${r.status || ''}:${r.payment_status || ''}`)
    .sort()
    .join('|');
}

async function pollTrackingStatus() {
  if (trackState.trackingPollInFlight || document.hidden) return;
  const contact = trackState.verifiedTrackingContact || {};
  const id = trackingId?.value.trim() || null;
  if (!contact.phone && !contact.email && !id) return;

  trackState.trackingPollInFlight = true;
  try {
    const { data, error } = await shiftFuelDb.rpc("public_track_request", {
      p_request_id: id,
      p_phone: contact.phone || "",
      p_email: contact.email || "",
    });
    if (error || !Array.isArray(data)) return;
    const next = sortTrackedRequests(data);
    if (trackedStatusSignature(next) === trackedStatusSignature(window._trackingRequests)) {
      // Status unchanged, but the worker may have moved — keep the live ETA ticking
      // without a disruptive full re-render of the page.
      window._trackingRequests = next;
      refreshEnRouteEta(next);
      return;
    }
    window._trackingRequests = next;
    await renderAllRequests(next, contact.phone || "", contact.email || "");
  } catch (err) {
    console.warn("Status auto-refresh failed:", err);
  } finally {
    trackState.trackingPollInFlight = false;
  }
}

function startTrackingPoll() {
  if (trackState.trackingPollTimer) return;
  trackState.trackingPollTimer = setInterval(pollTrackingStatus, 20000);
}

// Refresh immediately when the customer returns to the tab.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && trackState.trackingPollTimer) pollTrackingStatus();
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
  const starBtn = event.target.closest(".star-btn");

  // Star button tap: highlight 1–N stars and store value in hidden input
  if (starBtn) {
    const ratingWidget = starBtn.closest(".star-rating");
    const selected = Number(starBtn.dataset.star);
    ratingWidget.dataset.selected = selected;
    ratingWidget.querySelectorAll(".star-btn").forEach((btn) => {
      btn.classList.toggle("filled", Number(btn.dataset.star) <= selected);
    });
    const panel = ratingWidget.closest(".review-panel");
    const hiddenInput = panel?.querySelector(".star-rating-value");
    if (hiddenInput) hiddenInput.value = selected;
    const label = panel?.querySelector(".star-rating-label");
    if (label) {
      const labels = ["", "1 star — Poor", "2 stars — Fair", "3 stars — Okay", "4 stars — Good", "5 stars — Amazing"];
      label.textContent = labels[selected] || "";
      label.classList.add("has-selection");
    }
    return;
  }

  if (submitReviewButton) {
    const panel = submitReviewButton.closest(".review-panel");
    const rating = panel.querySelector(".star-rating-value")?.value;
    const comments = panel.querySelector("#service-review-comments")?.value.trim() || "";
    const requestId = submitReviewButton.dataset.requestId;

    if (!rating) {
      trackMessage.textContent = "Select a star rating before submitting.";
      return;
    }

    submitReviewButton.disabled = true;
    submitReviewButton.textContent = "Submitting…";
    trackMessage.textContent = "";

    let usedDirectReviewInsert = false;
    let { error } = await shiftFuelDb.rpc("public_submit_service_review", {
      p_request_id: requestId,
      p_phone: trackState.verifiedTrackingContact.phone || submitReviewButton.dataset.customerPhone || "",
      p_email: trackState.verifiedTrackingContact.email || submitReviewButton.dataset.customerEmail || "",
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
      panel.innerHTML = '<p class="review-thanks">Thank you for your feedback.</p>';
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
    panel.innerHTML = '<p class="review-thanks">Thank you for your feedback.</p>';
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


function getStripe() {
  if (!trackState.stripeInstance && window.Stripe) {
    const pk = window.SHIFTFUEL_STRIPE_PUBLISHABLE_KEY;
    if (pk) trackState.stripeInstance = window.Stripe(pk);
  }
  return trackState.stripeInstance;
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

  const { phone, email } = trackState.verifiedTrackingContact;
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


function initCbPaymentModal() {
  if (trackState._cbModal) return;
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
  trackState._cbModal = el;

  el.addEventListener('click', (e) => { if (e.target === el) _closeCbModal(false); });
  el.querySelector('.cb-payment-modal-close').addEventListener('click', () => _closeCbModal(false));
  el.querySelector('.cb-payment-modal-authorize').addEventListener('click', _handleCbModalAuthorize);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && trackState._cbModal && !trackState._cbModal.hidden) _closeCbModal(false);
  });
}

function _openCbModal(meta, rpcFn, formStatusEl, submitBtn) {
  initCbPaymentModal();
  trackState._cbModalMeta         = meta;
  trackState._cbModalRpcFn        = rpcFn;
  trackState._cbModalFormStatusEl = formStatusEl;
  trackState._cbModalSubmitBtn    = submitBtn;

  // Reset modal state
  trackState._cbModal.querySelector('.cb-payment-modal-error').textContent  = '';
  trackState._cbModal.querySelector('.cb-payment-modal-status').textContent = '';
  const authorizeBtn = trackState._cbModal.querySelector('.cb-payment-modal-authorize');
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
      trackState._cbModal.querySelector('.cb-payment-modal-error').textContent = ev.error?.message || '';
    });
    trackState._cbModalCard = { elements, cardElement: cardEl };
  } else {
    trackState._cbModalCard = null;
  }

  trackState._cbModal.hidden = false;
  document.body.style.overflow = 'hidden';
  trackState._cbModal.querySelector('.cb-payment-modal-authorize').focus();
}

function _closeCbModal(succeeded) {
  if (!trackState._cbModal) return;
  trackState._cbModal.hidden = true;
  document.body.style.overflow = '';

  if (trackState._cbModalCard?.cardElement) {
    trackState._cbModalCard.cardElement.unmount();
    trackState._cbModalCard = null;
  }

  if (!succeeded && trackState._cbModalFormStatusEl) {
    trackState._cbModalFormStatusEl.textContent = 'Payment authorization was not completed. Please try again.';
  }
  if (trackState._cbModalSubmitBtn) {
    trackState._cbModalSubmitBtn.disabled = false;
  }

  trackState._cbModalRpcFn  = null;
  trackState._cbModalMeta   = null;
  trackState._cbModalFormStatusEl = null;
  trackState._cbModalSubmitBtn    = null;
}

async function _handleCbModalAuthorize() {
  const errorEl   = trackState._cbModal.querySelector('.cb-payment-modal-error');
  const statusEl  = trackState._cbModal.querySelector('.cb-payment-modal-status');
  const authorizeBtn = trackState._cbModal.querySelector('.cb-payment-modal-authorize');

  errorEl.textContent  = '';
  statusEl.textContent = 'Authorizing…';
  authorizeBtn.disabled = true;

  try {
    const stripe = getStripe();
    let paymentIntentId = null;

    if (stripe && trackState._cbModalCard?.cardElement) {
      const { authAmountCents, serviceLabel, customerName, customerEmail } = trackState._cbModalMeta;
      const piRes = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_intent', amount_cents: authAmountCents, customer_name: customerName, customer_email: customerEmail, service_label: serviceLabel }),
      });
      const piData = await piRes.json();
      if (!piRes.ok) throw new Error(piData.error || 'Could not create payment authorization.');

      const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(piData.client_secret, {
        payment_method: { card: trackState._cbModalCard.cardElement },
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
    const rpcError = await trackState._cbModalRpcFn(paymentIntentId);
    if (rpcError) throw rpcError;

    statusEl.textContent = 'Your booking has been confirmed.';
    authorizeBtn.textContent = '✓ Confirmed';

    setTimeout(() => {
      _closeCbModal(true);
      // Re-run the tracking lookup to replace the completion form with the confirmed status card
      const phone = trackState.verifiedTrackingContact?.phone || '';
      const email = trackState.verifiedTrackingContact?.email || '';
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
      p_phone:                trackState.verifiedTrackingContact.phone || '',
      p_email:                trackState.verifiedTrackingContact.email || '',
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

// ── Re-authorize a saved-card booking whose off-session hold failed ───────────
trackingResult?.addEventListener('click', async (event) => {
  const button = event.target.closest('.track-reauth-btn');
  if (!button) return;
  const requestId = button.dataset.id;
  const request = (window._trackingRequests || []).find((r) => r.id === requestId);
  if (!request) return;

  const statusEl = document.querySelector(`[data-reauth-status="${requestId}"]`);
  const authAmountCents = Math.max(Math.round((Number(request.estimated_total) || 1) * 100), 50);

  // _openCbModal creates a manual-capture intent + confirms the card (a hold),
  // then calls this with the new PaymentIntent id. We attach it to the request.
  const rpcFn = async (paymentIntentId) => {
    if (!paymentIntentId) return new Error('Payment was not authorized. Please try again.');
    const res = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'customer_reauthorize_scheduled',
        request_id: requestId,
        phone: trackState.verifiedTrackingContact?.phone || '',
        email: trackState.verifiedTrackingContact?.email || '',
        new_payment_intent_id: paymentIntentId,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return new Error(data.error || 'Could not re-authorize payment.');
    setTimeout(() => { refreshTrackedRequestsAfterAction(); }, 1000);
    return null;
  };

  _openCbModal(
    {
      authAmountCents,
      serviceLabel:  request.service_label || 'ShiftFuel service',
      customerName:  request.customer_name || '',
      customerEmail: request.customer_email || '',
    },
    rpcFn,
    statusEl,
    button,
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

// merged from track-two-criteria.js
// Track page lookup safety: require at least two identifiers.
// Customer-facing ticket numbers use SF-XXXXXXXX. The full UUID remains internal.
// (Capture-phase listeners, so they still run before track.js's own submit handler
// above even though this block now lives after it.)
(() => {
  if (!document.body?.classList.contains('track-page')) return;

  function cleanPhone(value) {
    return window.ShiftFuelPhone?.digits(value) || String(value || '').replace(/\D/g, '').slice(0, 10);
  }

  function cleanRequestId(value) {
    return String(value || '').trim();
  }

  function ticketInfo(value) {
    const raw = cleanRequestId(value);
    const upper = raw.toUpperCase().replaceAll(' ', '');
    const compact = upper.startsWith('SF-') ? upper.slice(3) : upper;
    const isShortTicket = compact.length === 8 && /^[A-F0-9]+$/.test(compact);
    return {
      raw,
      isShortTicket,
      shortPrefix: isShortTicket ? compact.toLowerCase() : '',
    };
  }

  function criteriaCount() {
    const phone = cleanPhone(document.querySelector('#tracking-phone')?.value || '');
    const email = String(document.querySelector('#tracking-email')?.value || '').trim();
    const requestId = cleanRequestId(document.querySelector('#tracking-id')?.value || '');
    return [phone, email, requestId].filter(Boolean).length;
  }

  function showCriteriaMessage() {
    const trackMessage = document.querySelector('#track-message');
    if (trackMessage) {
      trackMessage.textContent = 'Please enter at least two pieces of information to track your request, such as phone + email, phone + request number, or email + request number.';
    }
  }

  function formatTicketInput() {
    const input = document.querySelector('#tracking-id');
    if (!input || input.dataset.sfTicketFormatBound) return;
    input.dataset.sfTicketFormatBound = '1';
    input.placeholder = 'SF-DDDFBBC5';
    input.addEventListener('blur', () => {
      const info = ticketInfo(input.value);
      if (info.isShortTicket) input.value = `SF-${info.shortPrefix.toUpperCase()}`;
    });
  }

  async function directShortTicketLookup(ticket) {
    const db = window.ShiftFuelSupabase;
    if (!db) return { data: [], error: new Error('Supabase is not ready.') };

    let { data, error } = await db
      .from('service_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(250);

    if (error) return { data: [], error };
    return {
      data: (data || []).filter((request) => String(request.id || '').toLowerCase().startsWith(ticket.shortPrefix)),
      error: null,
    };
  }

  async function handleShortTicketLookup(event) {
    const form = event.target.closest('#track-form');
    if (!form) return false;

    const trackingId = document.querySelector('#tracking-id');
    const ticket = ticketInfo(trackingId?.value || '');
    if (!ticket.isShortTicket) return false;

    const phone = cleanPhone(document.querySelector('#tracking-phone')?.value || '');
    const email = String(document.querySelector('#tracking-email')?.value || '').trim().toLowerCase();
    if (!phone && !email) return false;

    event.preventDefault();
    event.stopImmediatePropagation();

    const trackMessage = document.querySelector('#track-message');
    const trackingResult = document.querySelector('#tracking-result');
    const refreshStatusBtn = document.querySelector('#refresh-status-btn');
    const submitButton = form.querySelector('button[type="submit"]');
    const originalSubmitText = submitButton?.textContent || 'Track Request';

    if (trackingResult) trackingResult.innerHTML = '';
    if (trackMessage) trackMessage.textContent = 'Looking up requests...';
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Searching...';
    }

    try {
      let data = [];
      const rpcResult = await window.ShiftFuelSupabase.rpc('public_track_request', {
        p_request_id: null,
        p_phone: phone,
        p_email: email,
      });

      if (!rpcResult.error) {
        data = (rpcResult.data || []).filter((request) => String(request.id || '').toLowerCase().startsWith(ticket.shortPrefix));
      }

      if (!data.length) {
        const directResult = await directShortTicketLookup(ticket);
        if (directResult.error) {
          console.warn('Short ticket fallback blocked:', directResult.error);
        } else {
          data = directResult.data || [];
        }
      }

      if (!data.length) {
        if (trackMessage) trackMessage.textContent = 'We could not find a matching request. Please check your phone number, email, or request number and try again.';
        return true;
      }

      if (typeof trackState.verifiedTrackingContact !== 'undefined') trackState.verifiedTrackingContact = { phone, email };
      if (trackMessage) trackMessage.textContent = '';
      if (refreshStatusBtn) refreshStatusBtn.hidden = false;
      window._trackingRequests = typeof sortTrackedRequests === 'function' ? sortTrackedRequests(data) : data;
      if (typeof renderAllRequests === 'function') await renderAllRequests(window._trackingRequests, phone, email);
      return true;
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalSubmitText;
      }
    }
  }

  function install() {
    const form = document.querySelector('#track-form');
    if (!form || form.dataset.twoCriteriaBound) return;
    form.dataset.twoCriteriaBound = '1';
    formatTicketInput();

    form.addEventListener('submit', async (event) => {
      if (criteriaCount() < 2) {
        event.preventDefault();
        event.stopImmediatePropagation();
        showCriteriaMessage();
        return;
      }
      await handleShortTicketLookup(event);
    }, true);

    document.querySelector('#refresh-status-btn')?.addEventListener('click', (event) => {
      if (criteriaCount() >= 2) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      showCriteriaMessage();
    }, true);
  }

  document.addEventListener('DOMContentLoaded', install);
  install();
})();

// merged from track-phone-formatting.js
(function () {
  function cleanPhone(value) {
    return window.ShiftFuelPhone?.digits(value) || String(value || "").replace(/\D/g, "").slice(0, 10);
  }

  function formatPhone(value) {
    return window.ShiftFuelPhone?.format(value) || "";
  }

  function formatPhoneInput(input) {
    if (!input) return;
    input.value = formatPhone(input.value);
  }

  function bindPhoneInput(input) {
    if (!input || input.dataset.trackPhoneCleanupBound) return;
    input.dataset.trackPhoneCleanupBound = "1";
    input.setAttribute("inputmode", "numeric");
    input.setAttribute("maxlength", "14");
    input.setAttribute("autocomplete", "tel");
    window.ShiftFuelPhone?.attachInput(input);
    formatPhoneInput(input);
  }

  function formatVisiblePhoneText(root) {
    (root || document).querySelectorAll(".worker-phone").forEach((element) => {
      const formatted = formatPhone(element.textContent);
      if (formatted) element.textContent = formatted;
    });
  }

  function loadLiveLocationScript() {
    if (document.querySelector('script[data-track-live-location]')) return;
    const script = document.createElement('script');
    script.src = 'track-live-location.js';
    script.dataset.trackLiveLocation = '1';
    document.body.appendChild(script);
  }

  function init() {
    bindPhoneInput(document.querySelector("#tracking-phone"));
    formatVisiblePhoneText(document);
    loadLiveLocationScript();

    document.querySelector("#track-form")?.addEventListener("submit", (event) => {
      const input = document.querySelector("#tracking-phone");
      const message = document.querySelector("#track-message");
      const digits = cleanPhone(input?.value || "");

      if (input && digits && digits.length !== 10) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (message) message.textContent = window.ShiftFuelPhone?.validationMessage || "Enter a valid 10-digit phone number.";
        input.focus();
      }
    }, true);

    const trackingResult = document.querySelector("#tracking-result");
    if (trackingResult) {
      new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) formatVisiblePhoneText(node);
          });
        });
      }).observe(trackingResult, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

bindTrackFormAnchorScroll();
scrollTrackFormAfterLoad();
