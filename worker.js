const workerDb = window.ShiftFuelSupabase;

const workerProfileForm = document.querySelector('#worker-profile-form');
const workerProfileName = document.querySelector('#worker-profile-name');
const workerProfileUsername = document.querySelector('#worker-profile-username');
const workerProfilePhone = document.querySelector('#worker-profile-phone');
const workerProfileStarted = document.querySelector('#worker-profile-started');
const workerProfilePhoto = document.querySelector('#worker-profile-photo');
const workerProfileStatus = document.querySelector('#worker-profile-status');
const editWorkerPhoto = document.querySelector('#edit-worker-photo');
const workerPhotoBoundaryPanel = document.querySelector('#worker-photo-boundary-panel');
const workerPhotoBoundaryPreview = document.querySelector('#worker-photo-boundary-preview');
const workerPhotoBoundaryImage = document.querySelector('#worker-photo-boundary-image');
const workerPhotoDisplayZoom = document.querySelector('#worker-photo-display-zoom');
const workerPhotoCropPanel = document.querySelector('#worker-photo-crop-panel');
const workerPhotoCropImage = document.querySelector('#worker-photo-crop-image');
const workerPhotoCropPreview = document.querySelector('#worker-photo-crop-preview');
const workerPhotoCropZoom = document.querySelector('#worker-photo-crop-zoom');
const workerPhotoCropUse = document.querySelector('#worker-photo-crop-use');
const workerPhotoCropChoose = document.querySelector('#worker-photo-crop-choose');
const workerPhotoCropCancel = document.querySelector('#worker-photo-crop-cancel');
const workerPhotoCropStatus = document.querySelector('#worker-photo-crop-status');
const workerSignoutBtn = document.querySelector('#worker-signout-btn');
const workerBreakToggle = document.querySelector('#worker-break-toggle');
const workerPresenceIndicator = document.querySelector('#worker-presence-indicator');
const workerPresenceLabel = document.querySelector('#worker-presence-label');
const openChangePasswordBtn = document.querySelector('#open-change-password-btn');
const workerRefreshJobsBtn = document.querySelector('#worker-refresh-jobs-btn');
const workerPasswordModal = document.querySelector('#worker-password-modal');
const workerPasswordModalClose = document.querySelector('#worker-password-modal-close');
const workerPasswordChangeForm = document.querySelector('#worker-password-change-form');
const wpcCurrent = document.querySelector('#wpc-current');
const wpcNew = document.querySelector('#wpc-new');
const wpcConfirm = document.querySelector('#wpc-confirm');
const workerPasswordStatus = document.querySelector('#worker-password-status');
const workerProfilePhotoPreview = document.querySelector('#worker-profile-photo-preview');
const workerProfilePhotoPlaceholder = document.querySelector('#worker-profile-photo-placeholder');
const workerDashboardPhoto = document.querySelector('#worker-dashboard-photo');
const workerDashboardPhotoPlaceholder = document.querySelector('#worker-dashboard-photo-placeholder');
const workerPortalHeading = document.querySelector('#worker-portal-heading');
const workerHeroSubtitle = document.querySelector('#worker-hero-subtitle');
const workerCurrentJobsToday = document.querySelector('#worker-current-jobs-today');
const workerCurrentRating = document.querySelector('#worker-current-rating');
const workerWorkingSince = document.querySelector('#worker-working-since');
const workerDashboardName = document.querySelector('#worker-dashboard-name');
const workerDashboardPhone = document.querySelector('#worker-dashboard-phone');
const workerScheduleForm = document.querySelector('#worker-schedule-form');
const workerScheduleStatus = document.querySelector('#worker-schedule-status');
const workerDaysGrid = document.querySelector('#worker-days-grid');
const workerDaysOffCalendar = document.querySelector('#worker-days-off-calendar');
const workerDaysOffSummary = document.querySelector('#worker-days-off-summary');
const saveWorkdaysButton = document.querySelector('#save-workdays');
const saveDaysOffButton = document.querySelector('#save-days-off');
const workerJobList = document.querySelector('#worker-job-list');
const workerReviewList = document.querySelector('#worker-review-list');

workerSignoutBtn?.addEventListener('click', () => {
  // Best-effort: mark offline immediately so the admin snapshot updates without
  // waiting for the heartbeat to go stale. Fire-and-forget; never block sign-out.
  sendWorkerHeartbeat('offline');
  sessionStorage.removeItem('shiftfuel_worker');
  sessionStorage.removeItem('shiftfuel_worker_id');
  sessionStorage.removeItem('shiftfuel_worker_token');
  sessionStorage.removeItem('shiftfuel_worker_expires');
  sessionStorage.removeItem('shiftfuel_worker_must_change_pw');
  window.location.href = '/worker/login';
});

// ── Live presence heartbeat ──────────────────────────────────────────────────
// Pings worker_heartbeat() so the admin "Worker Snapshot" reflects who is
// actually online. Status is 'online' normally, 'on_break' when the worker
// toggles a break. If the app is closed the heartbeat goes stale and the admin
// ages the worker out to Offline automatically.
let workerPresenceStatus = 'online';
let workerHeartbeatTimer = null;

async function sendWorkerHeartbeat(status) {
  const token = (typeof SESSION_WORKER_TOKEN !== 'undefined' && SESSION_WORKER_TOKEN) || '';
  if (!token) return;
  try {
    await workerDb.rpc('worker_heartbeat', { p_token: token, p_status: status || workerPresenceStatus });
  } catch (err) {
    // Non-fatal: a missed heartbeat just ages out to Offline.
    console.warn('Worker heartbeat failed:', err);
  }
}

function renderPresenceControls() {
  const onBreak = workerPresenceStatus === 'on_break';
  if (workerPresenceIndicator) {
    workerPresenceIndicator.hidden = false;
    workerPresenceIndicator.classList.toggle('is-on-break', onBreak);
    workerPresenceIndicator.setAttribute('role', 'button');
    workerPresenceIndicator.setAttribute('tabindex', '0');
    workerPresenceIndicator.title = onBreak ? 'On break — tap to go back online' : 'Online — tap to take a break';
  }
  if (workerPresenceLabel) workerPresenceLabel.textContent = onBreak ? 'On break' : 'Online';
  if (workerBreakToggle) {
    workerBreakToggle.hidden = false;
    workerBreakToggle.textContent = onBreak ? 'End break' : 'Take a break';
  }
  updateWorkerStatusBadge();
}

// Status pill in the account modal header: Active / On Break / Offline.
function updateWorkerStatusBadge() {
  const badge = document.getElementById('worker-account-status-badge');
  if (!badge) return;
  const inactive = currentEmployee && currentEmployee.active === false;
  const onBreak = workerPresenceStatus === 'on_break';
  badge.classList.remove('is-on-break', 'is-offline');
  let label = 'Active';
  if (inactive) { badge.classList.add('is-offline'); label = 'Offline'; }
  else if (onBreak) { badge.classList.add('is-on-break'); label = 'On Break'; }
  badge.innerHTML = '<span class="worker-active-dot"></span>' + label;
}

function startWorkerHeartbeat() {
  renderPresenceControls();
  if (workerHeartbeatTimer) return;
  sendWorkerHeartbeat();
  workerHeartbeatTimer = setInterval(() => sendWorkerHeartbeat(), 30000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) sendWorkerHeartbeat();
  });
}

function toggleWorkerBreak() {
  workerPresenceStatus = workerPresenceStatus === 'on_break' ? 'online' : 'on_break';
  renderPresenceControls();
  sendWorkerHeartbeat();
}
workerBreakToggle?.addEventListener('click', toggleWorkerBreak);
// The header "Online / On break" pill is itself a tap target — clicking it
// toggles the break, same as the account-menu button.
workerPresenceIndicator?.addEventListener('click', toggleWorkerBreak);
workerPresenceIndicator?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleWorkerBreak(); }
});

// Show the worker's profile photo in an avatar circle (cover-cropped); fall back
// to the initial letter when there's no photo.
function applyAvatarPhoto(el, url) {
  if (!el) return;
  if (url) {
    el.style.backgroundImage = `url("${url}")`;
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
    el.classList.add('has-avatar-photo');
  } else {
    el.style.backgroundImage = '';
    el.classList.remove('has-avatar-photo');
  }
}

// Enable push notifications for this worker (new jobs, customer cancellations).
const workerEnableAlertsBtn = document.querySelector('#worker-enable-alerts');
workerEnableAlertsBtn?.addEventListener('click', async () => {
  if (!window.ShiftFuelPush) return;
  const original = workerEnableAlertsBtn.textContent;
  workerEnableAlertsBtn.disabled = true;
  workerEnableAlertsBtn.textContent = 'Enabling…';
  const result = await window.ShiftFuelPush.enablePush({ type: 'worker', workerToken: SESSION_WORKER_TOKEN });
  if (result.ok) {
    workerEnableAlertsBtn.textContent = 'Alerts on ✓ (tap to test)';
    workerEnableAlertsBtn.disabled = false;
    // Immediate confirmation — fire a test push so you see a real notification land.
    const test = await window.ShiftFuelPush.sendTest(result.endpoint, SESSION_WORKER_TOKEN);
    if (test && test.ok === false) {
      alert('Notifications are on, but the test push could not be delivered:\n\n' + (test.error || 'unknown') + '\n\nOn iPhone this usually means the app isn’t running as an installed Home Screen app.');
    }
  } else {
    alert(window.ShiftFuelPush.friendlyReason(result.reason));
    workerEnableAlertsBtn.disabled = false;
    workerEnableAlertsBtn.textContent = original;
  }
});

// Reflect an existing push subscription on load so the button doesn't imply you
// must re-enable alerts every sign-in — the subscription persists in the browser.
(async function reflectExistingPushSubscription() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !workerEnableAlertsBtn) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && (await reg.pushManager.getSubscription());
    if (sub) workerEnableAlertsBtn.textContent = 'Alerts on ✓ (tap to test)';
  } catch (_) {}
})();

// Profile "View all reviews" reuses the existing reviews modal trigger.
document.querySelector('#worker-reviews-viewall')?.addEventListener('click', () => {
  document.querySelector('#worker-reviews-trigger')?.click();
});
// Dashboard aside cards: reviews → modal, availability → Schedule tab, header → sign out.
document.querySelector('#worker-dash-reviews-all')?.addEventListener('click', () => {
  document.querySelector('#worker-reviews-trigger')?.click();
});
document.querySelector('#worker-snapshot-schedule')?.addEventListener('click', () => {
  document.querySelector('[data-tab-view="schedule"]')?.click();
});
// ── Account modal ────────────────────────────────────────────────────────────
// Opened from the header avatar/name chip (desktop), the avatar button (mobile),
// and the "Manage account" button on the Profile tab. The action buttons inside
// it (Edit profile, Change password, Enable alerts, Take a break, Sign out) are
// the real controls — their click handlers are wired elsewhere by their own IDs.
const workerProfilePanel = document.getElementById('worker-profile-panel');
const workerProfilePanelOverlay = document.getElementById('worker-profile-panel-overlay');

function openWorkerProfilePanel() {
  if (!workerProfilePanel) return;
  workerProfilePanel.removeAttribute('hidden');
  workerProfilePanelOverlay?.classList.add('active');
  document.body.style.overflow = 'hidden';
}
function closeWorkerProfilePanel() {
  if (!workerProfilePanel) return;
  workerProfilePanel.setAttribute('hidden', '');
  workerProfilePanelOverlay?.classList.remove('active');
  document.body.style.overflow = '';
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && workerProfilePanel && !workerProfilePanel.hasAttribute('hidden')) closeWorkerProfilePanel();
});
document.querySelector('#worker-mobile-avatar-btn')?.addEventListener('click', openWorkerProfilePanel);
document.querySelector('#worker-desktop-account-btn')?.addEventListener('click', openWorkerProfilePanel);
document.querySelector('#worker-manage-account-btn')?.addEventListener('click', openWorkerProfilePanel);
document.querySelector('#close-worker-profile-panel')?.addEventListener('click', closeWorkerProfilePanel);
workerProfilePanelOverlay?.addEventListener('click', closeWorkerProfilePanel);
// Edit profile / Change password open their own modals — close the account modal
// first so they don't stack on top of it. (These buttons keep their own handlers.)
document.querySelector('#open-edit-profile-btn')?.addEventListener('click', closeWorkerProfilePanel);
document.querySelector('#open-change-password-btn')?.addEventListener('click', closeWorkerProfilePanel);

document.querySelector('#worker-progress-job-label')?.addEventListener('click', async () => {
  const jobLabel = document.querySelector('#worker-progress-job-label');
  const jobId = jobLabel?.dataset.jobId;
  if (!jobId) return;
  expandedWorkerJobId = expandedWorkerJobId === jobId ? null : jobId;
  await loadWorkerJobs();
  document.querySelector('#worker-jobs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

workerRefreshJobsBtn?.addEventListener('click', async () => {
  const originalText = workerRefreshJobsBtn.textContent;
  workerRefreshJobsBtn.disabled = true;
  workerRefreshJobsBtn.textContent = 'Refreshing...';
  try {
    await loadWorkerProfile();
  } finally {
    workerRefreshJobsBtn.disabled = false;
    workerRefreshJobsBtn.textContent = originalText;
  }
});

// Change-request wiring: schedule form, job-change modal, and the per-job
// "Request a change" buttons (delegated, since job cards re-render on poll).
document.querySelector('#wcr-schedule-submit')?.addEventListener('click', submitWorkerScheduleChangeRequest);
document.querySelector('#wcr-schedule-type')?.addEventListener('change', syncWorkerScheduleDateVisibility);
syncWorkerScheduleDateVisibility();
document.querySelector('#wcr-job-submit')?.addEventListener('click', submitWorkerJobChangeRequest);
document.querySelector('#wcr-job-close')?.addEventListener('click', closeWorkerJobChangeModal);
document.querySelector('#worker-jobchange-overlay')?.addEventListener('click', closeWorkerJobChangeModal);
document.addEventListener('click', (event) => {
  const btn = event.target.closest('.worker-request-job-change');
  if (!btn) return;
  openWorkerJobChangeModal(btn.dataset.id, btn.dataset.customer || '');
});

const SESSION_WORKER_NAME = sessionStorage.getItem('shiftfuel_worker') || 'Worker';
const SESSION_WORKER_ID = sessionStorage.getItem('shiftfuel_worker_id') || '';
const SESSION_WORKER_TOKEN = sessionStorage.getItem('shiftfuel_worker_token') || '';
const SERVICE_CENTERS = [
  'ShiftFuel - 132 Christiana Mall, Newark, DE 19702',
];
const DEFAULT_WORK_LOCATION = SERVICE_CENTERS[0];
const PHOTO_BUCKET = 'service-photos';
const workerDayOptions = [
  { dayOfWeek: 1, label: 'Monday' },
  { dayOfWeek: 2, label: 'Tuesday' },
  { dayOfWeek: 3, label: 'Wednesday' },
  { dayOfWeek: 4, label: 'Thursday' },
  { dayOfWeek: 5, label: 'Friday' },
  { dayOfWeek: 6, label: 'Saturday' },
  { dayOfWeek: 0, label: 'Sunday' },
];

let currentEmployee = null;
let selectedWorkerDaysOff = new Set();

let copiedWorkerDaySchedule = null;
let allWorkerJobs = [];
let vehiclePsiGuides = [];
let workerCropImageUrl = '';
let workerCroppedPreviewUrl = '';
let workerBoundaryPreviewUrl = '';
let workerCroppedPhotoBlob = null;
let workerCropOffset = { x: 0, y: 0 };
let workerCropDrag = null;
let workerProfilePhotoZoom = 1;
let workerProfilePhotoPosition = { x: 0, y: 0 };
let workerPhotoDisplayDrag = null;

// Booking-status logic lives in shared-status.js (loaded before this file). The
// shared map is comprehensive: key_received → en_route, and combo statuses like
// fuel_and_wash_complete now correctly map to in_service (previously fell to new).
const BOOKING_STATUSES = window.SF.BOOKING_STATUSES;
const canonicalBookingStatus = window.SF.canonicalBookingStatus;

// Unified active/open status list. The RPC filters server-side too, but the
// client keeps this guard so stale SQL cannot show closed requests.
const workerOpenStatuses = [
  'new',
  'assigned',
  'en_route',
  'in_service',
  'returning',
];

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizePhone(value) {
  return window.ShiftFuelPhone?.digits(value) || String(value || '').replace(/\D/g, '').slice(0, 10);
}

function normalizeId(value) {
  return String(value || '').trim().toLowerCase();
}

function isWorkerOpenStatus(status) {
  return workerOpenStatuses.includes(canonicalBookingStatus(status));
}

function hasCustomerReturnRequestAlert(request) {
  return !!request?.return_requested_at
    || request?.status === 'return_requested'
    || request?.status === 'customer_return_requested'
    || String(request?.notes || '').includes('[customer_return_requested]');
}

function hasPickupPhotoSet(request) {
  return String(request?.notes || '').includes('[pickup_time');
}

function hasDropoffPhotoSet(request) {
  return String(request?.notes || '').includes('[dropoff_time');
}

function hasKeysReturnedRecorded(request) {
  return /\[keys_returned\b|\[return_keys_recorded\b|\[return_fee_charge\b/.test(String(request?.notes || ''));
}

function isActiveCustomerReturnWorkflow(request) {
  return hasCustomerReturnRequestAlert(request)
    && !['awaiting_key_return', 'keys_returned', 'complete', 'canceled_return_completed'].includes(request?.status);
}

// Once the worker taps "Start service" the job is committed — a return-request that
// slips in (race) is DEFERRED: the worker finishes the in-progress service and
// records its receipt first, then the cancel/return surfaces. These are the
// "actively servicing / just finished, recording" statuses; once a receipt is
// saved (wash_receipt_uploaded / fuel_receipt_uploaded / receipts_recorded) the
// cancel surfaces. (Combo: only the in-progress service is finished, not the next.)
const WORKER_CANCEL_DEFER_STATUSES = new Set([
  'service_in_progress', 'fueling_in_progress', 'car_wash_in_progress',
  'car_wash_after_fuel_in_progress', 'fueling_after_wash_in_progress',
  'fueling_complete', 'car_wash_complete', 'fuel_and_wash_complete',
]);
function workerCancelDeferredMidService(request) {
  return WORKER_CANCEL_DEFER_STATUSES.has(request?.status);
}

function workerJobBelongsToCurrentEmployee(job) {
  if (!currentEmployee) return false;

  const assignedEmployeeId = normalizeId(job.assigned_employee_id);
  const currentEmployeeId = normalizeId(currentEmployee.id);
  const normalizedWorkerName = normalizeName(currentEmployee.full_name);
  const normalizedWorkerPhone = normalizePhone(currentEmployee.phone);
  const normalizedJobWorkerName = normalizeName(job.assigned_worker_name);
  const normalizedJobWorkerPhone = normalizePhone(job.assigned_worker_phone);

  if (assignedEmployeeId && currentEmployeeId && assignedEmployeeId === currentEmployeeId) return true;

  return !assignedEmployeeId
    && (
      (normalizedJobWorkerName && normalizedJobWorkerName === normalizedWorkerName)
      || (normalizedJobWorkerPhone && normalizedJobWorkerPhone === normalizedWorkerPhone)
    );
}

function workerJobHasAssignedFallback(job) {
  return !!normalizeName(job.assigned_worker_name) || !!normalizePhone(job.assigned_worker_phone);
}

function formatPhone(value) {
  return window.ShiftFuelPhone?.format(value) || value || '';
}

function attachPhoneInputFormatting(input) {
  window.ShiftFuelPhone?.attachInput(input);
}

attachPhoneInputFormatting(workerProfilePhone);

// Friendly labels for every status â€” keep in sync with admin.js and track.js.
// Raw database status strings must never be shown to a worker.
const workerStatusLabels = {
  new: 'New',
  assigned: 'Assigned',
  en_route: 'En route',
  in_service: 'In service',
  returning: 'Returning',
  completed: 'Completed',
  cancelled: 'Cancelled',
  request_received: 'Request received',
  accepted: 'Accepted',
  key_received: 'Key received',
  vehicle_picked_up: 'Vehicle picked up',
  in_progress: 'In service',
  pending: 'Request received',
  service_in_progress: 'Service in progress',
  fueling_in_progress: 'Fueling in progress',
  car_wash_in_progress: 'Car wash in progress',
  partial_service_complete: 'Partial service complete',
  fueling_complete: 'Fueling complete',
  fuel_receipt_uploaded: 'Fuel receipt recorded',
  car_wash_complete: 'Vehicle cleaning complete',
  wash_receipt_uploaded: 'Car wash receipt recorded',
  service_complete: 'Service complete',
  receipts_recorded: 'Receipts recorded',
  returned_location_pending: 'Vehicle return location needed',
  return_location_recorded: 'Return location recorded',
  return_photos_needed: 'Return photos needed',
  vehicle_returned: 'Vehicle returned',
  inspection_needed: 'Quick inspection needed',
  inspection_recorded: 'Quick inspection complete',
  final_payment_processed: 'Final payment processed',
  awaiting_key_return: 'Awaiting key return',
  keys_returned: 'Keys returned',
  return_requested: 'Return requested',
  customer_return_requested: 'Return requested',
  payment_issue: 'Payment issue',
  authorization_too_low: 'Authorization issue',
  pending_customer_payment: 'Awaiting customer payment',
  complete: 'Complete',
  denied: 'Denied',
  customer_canceled: 'Canceled by customer',
  canceled: 'Canceled',
  unable_to_complete: 'Unable to complete',
  auto_reversed: 'Missed â€” auto-reversed',
  closed_no_charge: 'Closed â€” no charge',
  canceled_return_completed: 'Return completed',
  cancelled: 'Cancelled',
  cancelled_pending_key_return: 'Cancellation received - awaiting key/vehicle return',
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDateTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatWorkerJobTime(request) {
  return [request.service_date, String(request.desired_return_time || '').slice(0, 5)]
    .filter(Boolean)
    .join(' ');
}

function money(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
}

// Door-jamb PSI defaults live in the shared vehicle-psi.js table (single source
// of truth for admin + worker). Loaded via <script src="vehicle-psi.js"> before
// this file.
const fallbackPsiGuides = (typeof window !== 'undefined' && window.SF && window.SF.FALLBACK_PSI_GUIDES) || [];

function normalizeVehicleText(value) {
  return String(value || '').trim().toLowerCase();
}

function psiGuideForRequest(request) {
  const guides = vehiclePsiGuides.length ? vehiclePsiGuides : fallbackPsiGuides;
  const make = normalizeVehicleText(request.vehicle_make);
  const model = normalizeVehicleText(request.vehicle_model);
  const exact = guides.find((guide) => normalizeVehicleText(guide.make) === make && normalizeVehicleText(guide.model) === model);
  const partial = exact || guides.find((guide) => {
    const guideModel = normalizeVehicleText(guide.model);
    return normalizeVehicleText(guide.make) === make && (model.includes(guideModel) || guideModel.includes(model));
  });

  if (!partial) {
    return null;
  }

  return {
    front: Number(partial.front_psi || partial.frontPsi || 0),
    rear: Number(partial.rear_psi || partial.rearPsi || 0),
    source: partial.source || 'ShiftFuel PSI guide',
  };
}

async function loadVehiclePsiGuides() {
  const { data, error } = await workerDb
    .from('vehicle_psi_guides')
    .select('make,model,front_psi,rear_psi,source');

  if (error) {
    console.warn('Using built-in PSI guide until vehicle_psi_guides is added:', error);
    vehiclePsiGuides = fallbackPsiGuides;
    return;
  }

  vehiclePsiGuides = data?.length ? data : fallbackPsiGuides;
}

function numberFromInput(value) {
  return Number(String(value || '').replace(/[^0-9.\-]/g, '')) || 0;
}

function savedFeeOrDefault(value, fallback) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : fallback;
}

function serviceNeedsFuel(request) {
  return String(request.service_type || '').includes('fuel');
}

function serviceNeedsWash(request) {
  return String(request.service_type || '').includes('wash');
}

function receiptTotalsFromNotes(request) {
  const matches = Array.from(String(request.notes || '').matchAll(/\[receipt_totals fuel=([0-9.]+) wash=([0-9.]+)\]/g));
  const latest = matches.at(-1);

  return {
    fuel: latest ? Number(latest[1]) || 0 : 0,
    wash: latest ? Number(latest[2]) || 0 : 0,
  };
}

function serviceUnableMap(request) {
  const notes = String(request.notes || '');
  return {
    fuel: /\[service_unable fuel\]/.test(notes),
    wash: /\[service_unable wash\]/.test(notes),
  };
}

function serviceUnable(request, type) {
  return Boolean(serviceUnableMap(request)[type]);
}

// True only if admin/worker explicitly chose to charge the service fee for
// an unable_to_complete service (default is to waive it entirely).
function serviceUnableFeeCharged(request, type) {
  const notes = String(request.notes || '');
  return new RegExp(`\\[service_unable_fee_charged ${type}\\]`).test(notes);
}

function serviceDoneOrUnable(request, type) {
  const receiptTotals = receiptTotalsFromNotes(request);
  return serviceUnable(request, type) || Number(receiptTotals[type] || 0) > 0;
}

function nextStatusAfterServiceUnable(request, type) {
  const fuelDone = type === 'fuel' || !serviceNeedsFuel(request) || serviceDoneOrUnable(request, 'fuel');
  const washDone = type === 'wash' || !serviceNeedsWash(request) || serviceDoneOrUnable(request, 'wash');

  if (fuelDone && washDone) {
    // All services resolved â€” route to service_complete for receipt confirmation.
    return 'service_complete';
  }

  return type === 'fuel' ? 'fuel_receipt_uploaded' : 'wash_receipt_uploaded';
}

function feeSummary(request) {
  return {
    fuel: serviceNeedsFuel(request) ? savedFeeOrDefault(request.fuel_convenience_fee, 15) : 0,
    wash: serviceNeedsWash(request) ? savedFeeOrDefault(request.wash_convenience_fee, 15) : 0,
    inspection: request.quick_inspection ? savedFeeOrDefault(request.quick_inspection_fee, 5) : 0,
  };
}

const PAYMENT_RECOVERY_RATE = 0.029;
const PAYMENT_RECOVERY_FIXED = 0.30;
// Service fees + pay rates default to the agreed numbers, then get overwritten by
// the admin's live Services settings via loadWorkerPayRates() at startup, so the
// calculator and live payouts always reflect what the admin configured.
let BASE_FUEL_SERVICE_FEE = 15;
let BASE_WASH_SERVICE_FEE = 15;
let BASE_QUICK_INSPECTION_FEE = 5;

// Worker pay model:
//   - 50% of the service fees (fuel + wash + inspection), net of card processing.
//   - $0.725 per extra round-trip mile driven to a customer-chosen gas station
//     (IRS standard mileage rate); the company keeps the remaining $0.025/mile
//     of the $0.75/mile customer surcharge.
const WORKER_SERVICE_FEE_SHARE = 0.5; // fallback / cancellation-fee share
let WORKER_MILEAGE_RATE = 0.725;
// Independent worker share per service-fee type (admin-editable, from settings).
// Default 0.5 each so payout is unchanged until the admin sets different values.
let WORKER_FEE_SHARES = { fuel: 0.5, wash: 0.5, insp: 0.5 };
// Fuel + Wash bundle: per-leg bundled fees + per-leg worker shares (admin-set).
// On a combo job (fuel + wash) the worker earns these shares instead of the normal
// per-fee shares above; bundle is "on" only when the legs sum > 0 and beat the two
// full fees. 0/0 fees = off.
let WORKER_BUNDLE = { fuelFee: 0, washFee: 0, fuelShare: 0.5, washShare: 0.5 };

// The per-fee shares to use for a given job: a live Fuel + Wash combo earns the
// bundle shares (when a bundle is configured + cheaper than the two fees apart);
// every other job uses the standard per-fee shares.
function effectiveFeeShares(request) {
  const both = serviceNeedsFuel(request) && serviceNeedsWash(request);
  const bundleSum = WORKER_BUNDLE.fuelFee + WORKER_BUNDLE.washFee;
  const fullSum = BASE_FUEL_SERVICE_FEE + BASE_WASH_SERVICE_FEE;
  if (both && bundleSum > 0 && bundleSum < fullSum) {
    return { fuel: WORKER_BUNDLE.fuelShare, wash: WORKER_BUNDLE.washShare, insp: WORKER_FEE_SHARES.insp };
  }
  return WORKER_FEE_SHARES;
}

function roundMoneyValue(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

// Mileage pay for the extra driving to a customer-selected (non-closest) gas
// station. `gas_station_extra_miles` is the extra round-trip miles beyond the
// closest station; 0 (or absent) for the default station. Never negative.
function workerMileagePay(request) {
  const extraMiles = Number(request.gas_station_extra_miles) || 0;
  return extraMiles > 0 ? roundMoneyValue(extraMiles * WORKER_MILEAGE_RATE) : 0;
}

// ── Time-based compensation ───────────────────────────────────────────────────
// Service time (the worker "sitting" while fueling / at the wash) is paid by the
// minute, and the car-wash detour is paid by the mile beyond a free allowance —
// mirroring the gas-station mileage. Company defaults below; the per-employee rate
// (what THAT worker earns out of the company rate) comes from the employee record.
const TIME_COMP = {
  companyRatePerMin: 0.50,   // also what's baked into the customer fee (settings)
  fuelBaseMin: 3,
  fuelPerGallonMin: 0.5,
  washMin: 20,
  washDetourFreeMiles: 5,
  washDetourRate: 0.725,
};

// Pull the admin's live Services settings into the pay constants so worker payout
// (and the Earnings calculator) reflect what the admin configured rather than the
// hardcoded defaults. The admin "Wash detour ($/mile)" rate (wash_detour_rate) is
// the single per-mile WORKER drive-pay rate — it drives BOTH the gas-station
// mileage pay and the wash-detour pay (NOT the customer's per-mile surcharge, which
// is per_mile_rate). Settings are the source for live/estimated pay; a completed
// job's pay is still frozen at completion via its [worker_payout] tag.
async function loadWorkerPayRates() {
  try {
    const { data, error } = await workerDb.rpc('public_get_service_pricing');
    if (error || !data) return;
    if (data.fuel_service_fee != null) BASE_FUEL_SERVICE_FEE = Number(data.fuel_service_fee);
    if (data.wash_service_fee != null) BASE_WASH_SERVICE_FEE = Number(data.wash_service_fee);
    if (data.quick_inspection_fee != null) BASE_QUICK_INSPECTION_FEE = Number(data.quick_inspection_fee);
    if (data.time_rate_per_min != null) TIME_COMP.companyRatePerMin = Number(data.time_rate_per_min);
    if (data.fuel_time_base_min != null) TIME_COMP.fuelBaseMin = Number(data.fuel_time_base_min);
    if (data.fuel_time_per_gallon_min != null) TIME_COMP.fuelPerGallonMin = Number(data.fuel_time_per_gallon_min);
    if (data.wash_time_min != null) TIME_COMP.washMin = Number(data.wash_time_min);
    if (data.wash_detour_free_miles != null) TIME_COMP.washDetourFreeMiles = Number(data.wash_detour_free_miles);
    if (data.wash_detour_rate != null) {
      TIME_COMP.washDetourRate = Number(data.wash_detour_rate);
      WORKER_MILEAGE_RATE = Number(data.wash_detour_rate);
    }
    if (data.fuel_fee_share != null) WORKER_FEE_SHARES.fuel = Number(data.fuel_fee_share);
    if (data.wash_fee_share != null) WORKER_FEE_SHARES.wash = Number(data.wash_fee_share);
    if (data.quick_care_fee_share != null) WORKER_FEE_SHARES.insp = Number(data.quick_care_fee_share);
    if (data.bundle_fuel_service_fee != null) WORKER_BUNDLE.fuelFee = Number(data.bundle_fuel_service_fee);
    if (data.bundle_wash_service_fee != null) WORKER_BUNDLE.washFee = Number(data.bundle_wash_service_fee);
    if (data.bundle_fuel_fee_share != null) WORKER_BUNDLE.fuelShare = Number(data.bundle_fuel_fee_share);
    if (data.bundle_wash_fee_share != null) WORKER_BUNDLE.washShare = Number(data.bundle_wash_fee_share);
    if (typeof runWorkerPayCalc === 'function') runWorkerPayCalc();
  } catch (e) {
    console.warn('Could not load worker pay rates from settings:', e);
  }
}

function parseNoteCoords(request, tag) {
  const m = String(request?.notes || '').match(new RegExp('\\[' + tag + ' (-?\\d+(?:\\.\\d+)?),(-?\\d+(?:\\.\\d+)?)\\]'));
  if (!m) return null;
  const lat = Number(m[1]), lon = Number(m[2]);
  return (Number.isFinite(lat) && Number.isFinite(lon)) ? { lat, lon } : null;
}

function haversineMiles(a, b) {
  if (!a || !b) return 0;
  const R = 3958.8, toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function workerJobGallons(request) {
  return Number(request.selected_fuel_gallons || request.estimated_gallons || request.authorization_fuel_gallons || 0);
}

// Paid service minutes: fuel (base + per-gallon) and/or a flat wash.
function workerServiceMinutes(request) {
  let m = 0;
  if (serviceNeedsFuel(request)) m += TIME_COMP.fuelBaseMin + TIME_COMP.fuelPerGallonMin * workerJobGallons(request);
  if (serviceNeedsWash(request)) m += TIME_COMP.washMin;
  return m;
}

// The worker's per-minute rate: their own (out of the company rate) or the company
// rate as the default. Capped at the company rate — a worker can never earn more
// per minute than the company charges.
function workerTimeRate() {
  const company = TIME_COMP.companyRatePerMin;
  const r = Number(currentEmployee?.time_rate_per_min);
  return Number.isFinite(r) && r > 0 ? Math.min(r, company) : company;
}
function workerTimePay(request) {
  return roundMoneyValue(workerServiceMinutes(request) * workerTimeRate());
}

// Car-wash detour: round trip from the car's spot to the wash, miles beyond the
// free allowance, paid like the gas detour. Uses the captured spot coords; 0 until
// both are known (so it never guesses).
function workerWashDetourMiles(request) {
  if (!serviceNeedsWash(request)) return 0;
  const car = parseNoteCoords(request, 'pickup_coords');
  const wash = parseNoteCoords(request, 'wash_dest_coords');
  if (!car || !wash) return 0;
  return haversineMiles(car, wash) * 2 * 1.3; // round trip, ~1.3x road factor
}
function workerWashDetourPay(request) {
  // Worker is paid on EVERY wash detour mile; the customer's free allowance is a
  // customer-side discount the company absorbs, not unpaid driving.
  return roundMoneyValue(workerWashDetourMiles(request) * TIME_COMP.washDetourRate);
}

// Did the customer cancel after the worker already had the keys? Those workers are
// owed half the base cancellation fee actually collected, plus — for post-pickup
// cancels where the driver had already set off — the aborted-trip mileage + time
// from the [cancel_costs] note (see workerNetPayout).
function isCanceledAfterKeys(request) {
  const canceled = !!request.canceled_at || /cancel/i.test(String(request.status || ''));
  return canceled && !!request.key_received_at;
}
// [cancel_costs mileage=X time=Y miles=M mins=N src=…] — stamped by the server on a
// post-pickup cancellation so the driver is paid for the trip they actually made.
// Absent on pre-drive (key-only) cancels ⇒ null.
function cancelCostsFromNotes(request) {
  const m = String(request?.notes || '').match(/\[cancel_costs mileage=(-?\d+(?:\.\d+)?) time=(-?\d+(?:\.\d+)?) miles=(-?\d+(?:\.\d+)?) mins=(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  return { mileageCost: Number(m[1]) || 0, timeCost: Number(m[2]) || 0, miles: Number(m[3]) || 0, mins: Number(m[4]) || 0 };
}

// Worker's estimated take-home for a job: 50% of the service fees (fuel + wash +
// inspection) net of Stripe processing (2.9% + $0.30), plus full mileage pay for
// any extra driving to a chosen station. A customer-cancel-after-keys pays 50% of
// the cancellation fee actually collected (no mileage). Never negative.
// Worker's cut of the service fees, with an INDEPENDENT share per fee type
// (fuel / wash / quick-care). Card processing and the folded service-time cost are
// removed first (so time is paid once, via workerTimePay), then the remaining net
// is split across the fees by each fee's time-stripped gross and each pays its own
// share. At equal 50/50/50 shares this exactly equals the old single-share math.
function workerFeeShareSplit(fuelFee, washFee, inspFee, timeCharge, shares = WORKER_FEE_SHARES) {
  const f = Number(fuelFee) || 0;
  const w = Number(washFee) || 0;
  const i = Number(inspFee) || 0;
  const t = Number(timeCharge) || 0;
  const totalFee = f + w + i;
  if (totalFee <= 0) return 0;
  const gross = Math.max(0, totalFee - t);
  if (gross <= 0) return 0;
  const stripe = roundMoneyValue(gross * PAYMENT_RECOVERY_RATE + PAYMENT_RECOVERY_FIXED);
  const net = Math.max(0, gross - stripe);
  if (net <= 0) return 0;
  // Time is folded into fuel/wash only; quick-care carries none.
  const timeBearing = f + w;
  const gFuel = Math.max(0, f - (timeBearing > 0 ? t * (f / timeBearing) : 0));
  const gWash = Math.max(0, w - (timeBearing > 0 ? t * (w / timeBearing) : 0));
  const gInsp = i;
  const gSum = gFuel + gWash + gInsp;
  if (gSum <= 0) return 0;
  return roundMoneyValue(
    net * (gFuel / gSum) * shares.fuel +
    net * (gWash / gSum) * shares.wash +
    net * (gInsp / gSum) * shares.insp
  );
}

function workerNetPayout(request) {
  const completed = canonicalBookingStatus(request.status) === 'completed' || request.payment_status === 'captured';
  // Once a job is finished its pay is frozen — read the locked amount and never
  // recompute (so later rate changes / admin fee edits can't move it).
  if (completed) {
    const locked = frozenWorkerPayout(request);
    if (locked != null) return roundMoneyValue(locked);
  }
  let payout = 0;
  if (completed) {
    const fees = feeSummary(request);
    payout += workerMileagePay(request) + workerTimePay(request) + workerWashDetourPay(request);
    payout += workerFeeShareSplit(fees.fuel, fees.wash, fees.inspection, frozenTimeCharge(request), effectiveFeeShares(request));
  } else if (isCanceledAfterKeys(request) && request.payment_status === 'cancellation_fee_paid') {
    // Cancellation-after-keys: 50% of the base cancellation fee collected (no split).
    const cancelGross = Number(request.cancellation_fee ?? request.cancellation_fee_amount ?? 0);
    if (cancelGross > 0) {
      const stripe = roundMoneyValue(cancelGross * PAYMENT_RECOVERY_RATE + PAYMENT_RECOVERY_FIXED);
      payout += Math.max(0, cancelGross - stripe) * WORKER_SERVICE_FEE_SHARE;
    }
    // Post-pickup cancels: pay the aborted trip through — mileage at the rate the
    // customer was charged (100%), time at your per-minute rate — like a real job.
    const cc = cancelCostsFromNotes(request);
    if (cc) {
      payout += Math.max(0, cc.mileageCost) + roundMoneyValue(Math.max(0, cc.mins) * workerTimeRate());
    }
  }
  return roundMoneyValue(Math.max(0, payout));
}

// Estimated take-home for an OPEN/upcoming job (workerNetPayout only pays out once
// completed). Same components, computed from the job's expected fees + time + miles,
// for the "you'll make ~$X" line in the Jobs tab.
function workerEstimatedPayout(request) {
  const fees = feeSummary(request);
  let payout = workerFeeShareSplit(fees.fuel, fees.wash, fees.inspection, frozenTimeCharge(request), effectiveFeeShares(request));
  payout += workerMileagePay(request) + workerTimePay(request) + workerWashDetourPay(request);
  return roundMoneyValue(Math.max(0, payout));
}

// Rough total minutes to complete, for the Jobs-tab time estimate. This is the
// worker's real elapsed time (NOT the customer's billed service minutes):
//   10 min to drive to the destination
// +  5 min to find the car
// +  GPS time out to the gas station / car wash / both, and the time to go back
// + 10 min only if the customer added Vehicle Add-Ons
const EST_TO_DESTINATION_MIN = 10;
const EST_FIND_CAR_MIN = 5;
const EST_QUICK_CARE_MIN = 10;
// Round-trip driving miles to the gas station. Prefer the real one-way distance
// captured at booking ([station_miles] note, doubled); fall back to the extra
// detour miles for older jobs that don't carry it.
function workerStationDriveMiles(request) {
  if (!serviceNeedsFuel(request)) return 0;
  const m = String(request?.notes || '').match(/\[station_miles (\d+(?:\.\d+)?)\]/);
  if (m) return Number(m[1]) * 2;
  return Number(request.gas_station_extra_miles) || 0;
}
// Round-trip wash drive for the estimate: prefer the real captured spot coords
// (workerWashDetourMiles, available once the car's spot is known mid-job), else the
// booking-time [wash_miles] note (one-way → doubled) so upcoming jobs still show it.
function workerWashDriveMiles(request) {
  if (!serviceNeedsWash(request)) return 0;
  const live = workerWashDetourMiles(request);
  if (live > 0) return live;
  const m = String(request?.notes || '').match(/\[wash_miles (\d+(?:\.\d+)?)\]/);
  return m ? Number(m[1]) * 2 : 0;
}
function workerEstimatedMinutes(request) {
  // Driving the service legs at ~30 mph: the round trip out to the gas station
  // (and back) plus the round trip to the car wash.
  const detourMiles = workerStationDriveMiles(request) + workerWashDriveMiles(request);
  const driveLegs = (detourMiles / 30) * 60;
  const quickCare = request.quick_inspection ? EST_QUICK_CARE_MIN : 0;
  return Math.round(EST_TO_DESTINATION_MIN + EST_FIND_CAR_MIN + driveLegs + quickCare);
}

// ── Earnings calculator (Earnings tab) ────────────────────────────────────────
// A what-if estimator: type a hypothetical job, see take-home + time. Pure math
// against the same constants the real payout uses — no job, no network.
function wcalcNum(id, dflt = 0) {
  const n = Number(document.getElementById(id)?.value);
  return Number.isFinite(n) ? n : dflt;
}
function runWorkerPayCalc() {
  const out = document.getElementById('wcalc-output');
  if (!out) return;
  const service = document.getElementById('wcalc-service')?.value || 'fuel';
  const needsFuel = service === 'fuel' || service === 'both';
  const needsWash = service === 'wash' || service === 'both';
  const quick = !!document.getElementById('wcalc-quick')?.checked;

  // Show only the inputs that apply to the chosen service (fuel vs wash vs both).
  const setCalcVis = (id, show) => {
    const lbl = document.getElementById(id)?.closest('label');
    if (lbl) lbl.style.display = show ? '' : 'none';
  };
  setCalcVis('wcalc-gallons', needsFuel);
  setCalcVis('wcalc-station-miles', needsFuel);
  setCalcVis('wcalc-wash-miles', needsWash);

  const gallons = wcalcNum('wcalc-gallons');
  const stationMiles = wcalcNum('wcalc-station-miles');
  const washMiles = wcalcNum('wcalc-wash-miles');

  let fuelFee = needsFuel ? BASE_FUEL_SERVICE_FEE : 0;
  let washFee = needsWash ? BASE_WASH_SERVICE_FEE : 0;
  const inspFee = quick ? BASE_QUICK_INSPECTION_FEE : 0;
  // Fuel + Wash combo earns the bundled fees + bundle shares (when the bundle beats
  // the two fees apart); otherwise the standard fees + per-fee shares.
  const calcBundleSum = WORKER_BUNDLE.fuelFee + WORKER_BUNDLE.washFee;
  const calcBundleActive = needsFuel && needsWash && calcBundleSum > 0 && calcBundleSum < (fuelFee + washFee);
  let calcShares = WORKER_FEE_SHARES;
  if (calcBundleActive) {
    fuelFee = WORKER_BUNDLE.fuelFee;
    washFee = WORKER_BUNDLE.washFee;
    calcShares = { fuel: WORKER_BUNDLE.fuelShare, wash: WORKER_BUNDLE.washShare, insp: WORKER_FEE_SHARES.insp };
  }
  // Per-type fee shares (no time folded into these base fees), matching real payout.
  const feeShare = workerFeeShareSplit(fuelFee, washFee, inspFee, 0, calcShares);
  const serviceMin = (needsFuel ? TIME_COMP.fuelBaseMin + TIME_COMP.fuelPerGallonMin * gallons : 0) + (needsWash ? TIME_COMP.washMin : 0);
  const rate = workerTimeRate();
  const timePay = roundMoneyValue(serviceMin * rate);
  const mileagePay = needsFuel ? roundMoneyValue(stationMiles * WORKER_MILEAGE_RATE) : 0;
  // Driver is paid on EVERY wash detour mile — the customer's first 5 free miles
  // are a customer discount the company absorbs, not unpaid driving.
  const washDetourPay = needsWash ? roundMoneyValue(washMiles * TIME_COMP.washDetourRate) : 0;
  const payout = roundMoneyValue(feeShare + timePay + mileagePay + washDetourPay);
  // Drive legs only count for the services actually in the job (fixes a stale
  // hidden-field value inflating the estimate after switching service type).
  const driveMiles = (needsFuel ? stationMiles : 0) + (needsWash ? washMiles : 0);
  const minutes = Math.round(EST_TO_DESTINATION_MIN + EST_FIND_CAR_MIN + (driveMiles / 30) * 60 + (quick ? EST_QUICK_CARE_MIN : 0));
  // Per-minute + annualized take-home (40 hrs/wk) so the driver can gauge the rate.
  const rateLine = minutes > 0
    ? `≈ ${money(payout / minutes)}/min · ~$${Math.round((payout / minutes) * 60 * 40 * 52).toLocaleString()}/yr at 40 hrs/wk`
    : '';

  const row = (label, val, strong) => `<div class="wcalc-row${strong ? ' wcalc-row-total' : ''}"><span>${label}</span><span>${money(val)}</span></div>`;
  out.innerHTML = `
    ${feeShare > 0 ? row('Service fee share (net card)', feeShare) : ''}
    ${mileagePay > 0 ? row(`Station mileage (${stationMiles} mi × ${money(WORKER_MILEAGE_RATE)})`, mileagePay) : ''}
    ${timePay > 0 ? row(`Service time (${serviceMin.toFixed(1)} min × ${money(rate)})`, timePay) : ''}
    ${washDetourPay > 0 ? row(`Wash detour (${washMiles} mi × ${money(TIME_COMP.washDetourRate)})`, washDetourPay) : ''}
    ${row('Estimated take-home', payout, true)}
    ${rateLine ? `<p class="wcalc-note" style="margin:.25rem 0 0;font-size:.82rem;color:#60716d">${rateLine}</p>` : ''}
    <p class="wcalc-time"><strong>Time to complete:</strong> ~${minutes} min</p>
  `;
}
['input', 'change'].forEach((evt) => document.addEventListener(evt, (event) => {
  if ((event.target?.id || '').startsWith('wcalc-')) runWorkerPayCalc();
}));
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', runWorkerPayCalc);
else runWorkerPayCalc();

// The customer's time charge, FROZEN at booking ([time_charge X.XX] in notes). Used
// at completion so the customer pays the locked amount — never recomputed, so later
// company/employee rate changes don't move the customer's price.
function frozenTimeCharge(request) {
  const m = String(request?.notes || '').match(/\[time_charge (\d+(?:\.\d+)?)\]/);
  return m ? Number(m[1]) : 0;
}

// The worker's payout LOCKED into the booking notes at completion
// ([worker_payout X.XX]). Read it back so a later rate change OR an admin
// lowering the customer's fee never moves what a driver already earned on a
// finished job. Returns null for jobs completed before this existed (those fall
// back to the live calc).
function frozenWorkerPayout(request) {
  const all = String(request?.notes || '').match(/\[worker_payout (\d+(?:\.\d+)?)\]/g);
  if (!all || !all.length) return null;
  const n = Number((all[all.length - 1].match(/[\d.]+/) || [])[0]);
  return Number.isFinite(n) ? n : null;
}

// Compute the worker's pay at THIS driver's current rate and append the lock tag
// to the job's notes, to be saved at completion. `baseNotes` defaults to the
// job's current notes; the live calc runs against notes that don't yet carry the
// tag, so there's no circular read-back.
function appendWorkerPayoutNote(request, baseNotes) {
  const notes = baseNotes != null ? baseNotes : (request.notes || '');
  if (/\[worker_payout /.test(notes)) return notes; // already locked — don't double-stamp
  const payout = workerNetPayout({ ...request, status: 'completed', notes });
  const tag = `[worker_payout ${roundMoneyValue(payout).toFixed(2)}]`;
  return notes ? `${notes}\n${tag}` : tag;
}

function transactionPricingSummary(request, receiptTotals = { fuel: 0, wash: 0 }) {
  // A service is chargeable if it was actually performed (has a receipt) or
  // admin/worker explicitly chose to charge the fee anyway for an
  // unable_to_complete service. Fuel/wash cost is never charged without a receipt.
  // Use the fee FROZEN on the booking (so a later Settings change can't re-price an
  // existing job); fall back to the current default for older rows.
  const frozenFee = (value, dflt) => { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : dflt; };
  const fuelBase = serviceNeedsFuel(request) && (Number(receiptTotals.fuel || 0) > 0 || serviceUnableFeeCharged(request, 'fuel')) ? frozenFee(request.base_fuel_service_fee, BASE_FUEL_SERVICE_FEE) : 0;
  const washBase = serviceNeedsWash(request) && (Number(receiptTotals.wash || 0) > 0 || serviceUnableFeeCharged(request, 'wash')) ? frozenFee(request.base_car_wash_service_fee, BASE_WASH_SERVICE_FEE) : 0;
  const inspection = request.quick_inspection ? frozenFee(request.base_inspection_fee, BASE_QUICK_INSPECTION_FEE) : 0;
  // Carry the locked time charge only when a service was actually performed.
  const timeCharge = (fuelBase || washBase) ? frozenTimeCharge(request) : 0;
  const netTarget = roundMoneyValue(Number(receiptTotals.fuel || 0) + Number(receiptTotals.wash || 0) + fuelBase + washBase + inspection + timeCharge);
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

  // Fold the locked time charge into the displayed service fee (fuel side, or wash
  // when there's no fuel) so the fee lines still sum to the total.
  const fuelTime = fuelBase ? timeCharge : 0;
  const washTime = (!fuelBase && washBase) ? timeCharge : 0;
  return {
    fuel: roundMoneyValue(fuelBase + fuelRecovery + fuelTime),
    wash: roundMoneyValue(washBase + washRecovery + washTime),
    fuelBase,
    washBase,
    inspection,
    recovery,
    netTarget,
    grossBeforeRounding: netTarget > 0 ? (netTarget + PAYMENT_RECOVERY_FIXED) / (1 - PAYMENT_RECOVERY_RATE) : 0,
    total: roundedTotal,
  };
}

function finalTotalFromSavedReceipts(request, receiptTotals = receiptTotalsFromNotes(request)) {
  const total = transactionPricingSummary(request, receiptTotals).total;
  // Apply any promo discount (service-fees only, computed + stored at booking).
  const discount = Math.max(0, Number(request.promo_discount) || 0);
  return Math.max(0, Math.round((total - discount) * 100) / 100);
}

// Builds the internal pricing-audit fields (admin/internal only â€” never
// shown to the customer) to save alongside final_total.
function pricingAuditFields(request, receiptTotals = receiptTotalsFromNotes(request)) {
  const fees = transactionPricingSummary(request, receiptTotals);
  return {
    base_fuel_service_fee: fees.fuelBase || null,
    base_car_wash_service_fee: fees.washBase || null,
    base_inspection_fee: fees.inspection || null,
    payment_operating_recovery_amount: fees.recovery,
    displayed_fuel_service_fee: fees.fuel || null,
    displayed_car_wash_service_fee: fees.wash || null,
    displayed_inspection_fee: fees.inspection || null,
    actual_fuel_receipt_amount: receiptTotals.fuel || null,
    actual_car_wash_receipt_amount: receiptTotals.wash || null,
    net_target_amount: fees.netTarget,
    gross_total_before_rounding: roundMoneyValue(fees.grossBeforeRounding),
    rounded_customer_total: fees.total,
  };
}

function photoTimestampNote(stage, timestamp) {
  return stage === 'dropoff'
    ? `[dropoff_time ${timestamp}] Drop-off photos uploaded at ${formatDateTime(timestamp)}.`
    : `[pickup_time ${timestamp}] Pickup photos uploaded at ${formatDateTime(timestamp)}.`;
}

function normalizeTroubleCode(value) {
  const code = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

  if (/^P\d{3}$/.test(code)) {
    return `P0${code.slice(1)}`;
  }

  return code;
}

function troubleCodeDetails(code) {
  const normalized = normalizeTroubleCode(code);
  const library = {
    P0300: {
      summary: 'Random or multiple cylinder misfire detected.',
      fixes: 'Check spark plugs, ignition coils, vacuum leaks, fuel delivery, and compression.',
    },
    P0301: {
      summary: 'Misfire detected in cylinder 1.',
      fixes: 'Check cylinder 1 spark plug, ignition coil, injector, wiring, compression, and vacuum leaks.',
    },
    P0302: {
      summary: 'Misfire detected in cylinder 2.',
      fixes: 'Check cylinder 2 spark plug, ignition coil, injector, wiring, compression, and vacuum leaks.',
    },
    P0303: {
      summary: 'Misfire detected in cylinder 3.',
      fixes: 'Check cylinder 3 spark plug, ignition coil, injector, wiring, compression, and vacuum leaks.',
    },
    P0304: {
      summary: "Your car's computer detected a misfire in cylinder number 4.",
      fixes: 'Check the cylinder 4 spark plug, ignition coil, fuel injector, wiring, compression, and vacuum leaks. Exact fixes depend on the vehicle year, make, model, and engine.',
    },
    P0420: {
      summary: "The vehicle's computer detected catalyst system efficiency below the expected threshold on bank 1.",
      fixes: 'Possible causes include a worn catalytic converter, exhaust leak, oxygen sensor issue, engine misfire, or fuel mixture problem. Confirm with a scanner and vehicle-specific diagnostics before replacing parts.',
    },
    P0430: {
      summary: "The vehicle's computer detected catalyst system efficiency below the expected threshold on bank 2.",
      fixes: 'Possible causes include a worn catalytic converter, exhaust leak, oxygen sensor issue, engine misfire, or fuel mixture problem. Confirm with a scanner and vehicle-specific diagnostics before replacing parts.',
    },
    P0455: {
      summary: "The vehicle's computer detected a large evaporative emissions system leak.",
      fixes: 'Check that the gas cap is tight and inspect the EVAP hoses, purge valve, vent valve, and charcoal canister.',
    },
  };

  return library[normalized] || {
    summary: normalized ? 'Trouble code recorded. Use a verified OBD-II lookup before giving repair advice.' : 'No trouble code entered.',
    fixes: 'Confirm the code with a scanner and vehicle-specific service information.',
  };
}

function setWorkerStatus(message) {
  if (workerProfileStatus) {
    workerProfileStatus.textContent = message;
  }
}

function setScheduleStatus(message) {
  if (workerScheduleStatus) {
    workerScheduleStatus.textContent = message;
  }
}

function setWorkerPasswordStatus(message) {
  if (workerPasswordStatus) {
    workerPasswordStatus.textContent = message;
  }
}

async function passwordFields(password) {
  const values = new Uint8Array(16);
  crypto.getRandomValues(values);
  const salt = Array.from(values, (v) => v.toString(16).padStart(2, '0')).join('');
  const bytes = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return {
    worker_password_salt: salt,
    worker_password_hash: hash,
    password_updated_at: new Date().toISOString(),
  };
}

function applyWorkerPhotoZoom() {
  // CSS vars are only used by the boundary editor preview.
  // The display frame uses object-fit: cover / object-position: center.
  const zoom = String(workerProfilePhotoZoom || 1);
  const positionX = `${workerProfilePhotoPosition.x || 0}%`;
  const positionY = `${workerProfilePhotoPosition.y || 0}%`;
  if (workerPhotoBoundaryImage) {
    workerPhotoBoundaryImage.style.setProperty('--profile-photo-zoom', zoom);
    workerPhotoBoundaryImage.style.setProperty('--profile-photo-x', positionX);
    workerPhotoBoundaryImage.style.setProperty('--profile-photo-y', positionY);
  }
  if (workerPhotoDisplayZoom) workerPhotoDisplayZoom.value = zoom;
}

// displayUrl â€” shown in the circular avatar (cropped version).
// modalUrl   â€” shown when the user clicks to enlarge (original version); defaults to displayUrl.
function showWorkerPhoto(displayUrl, modalUrl, zoom = workerProfilePhotoZoom, position = workerProfilePhotoPosition) {
  // Support legacy 3-arg call: showWorkerPhoto(url, zoom, position)
  if (typeof modalUrl === 'number' || (modalUrl && typeof modalUrl === 'object' && 'x' in modalUrl)) {
    position = zoom;
    zoom = modalUrl;
    modalUrl = displayUrl;
  }
  workerProfilePhotoZoom = Number(zoom || 1);
  workerProfilePhotoPosition = {
    x: Number(position?.x || 0),
    y: Number(position?.y || 0),
  };
  const hasPhoto = Boolean(displayUrl);
  if (workerProfilePhotoPreview && workerProfilePhotoPlaceholder) {
    workerProfilePhotoPreview.hidden = !hasPhoto;
    workerProfilePhotoPlaceholder.hidden = hasPhoto;
    workerProfilePhotoPreview.style.display = hasPhoto ? '' : 'none';
    workerProfilePhotoPlaceholder.style.display = hasPhoto ? 'none' : '';
    if (hasPhoto) {
      workerProfilePhotoPreview.src = displayUrl;
    } else {
      workerProfilePhotoPreview.removeAttribute('src');
    }
  }
  if (workerDashboardPhoto && workerDashboardPhotoPlaceholder) {
    workerDashboardPhoto.hidden = !hasPhoto;
    workerDashboardPhotoPlaceholder.hidden = hasPhoto;
    workerDashboardPhoto.style.display = hasPhoto ? '' : 'none';
    workerDashboardPhotoPlaceholder.style.display = hasPhoto ? 'none' : '';
    if (hasPhoto) {
      workerDashboardPhoto.src = displayUrl;
    } else {
      workerDashboardPhoto.removeAttribute('src');
    }
  }
  // Profile frame click-to-enlarge opens the original (modal) URL.
  const frame = document.querySelector('.worker-profile-photo-frame');
  if (frame) {
    if (hasPhoto) {
      frame.dataset.openWorkerPhoto = 'true';
      frame.dataset.photoUrl = modalUrl || displayUrl;
      frame.dataset.photoName = currentEmployee?.full_name || '';
      frame.classList.add('worker-photo-clickable');
      if (!frame.getAttribute('tabindex')) frame.setAttribute('tabindex', '0');
    } else {
      delete frame.dataset.openWorkerPhoto;
      delete frame.dataset.photoUrl;
      frame.classList.remove('worker-photo-clickable');
      frame.removeAttribute('tabindex');
    }
  }
  applyWorkerPhotoZoom();
}

function currentWorkerPhotoPositionFromEmployee(employee = currentEmployee) {
  return {
    x: Number(employee?.photo_position_x || 0),
    y: Number(employee?.photo_position_y || 0),
  };
}

function showWorkerBoundaryPreview(photoUrl) {
  if (!workerPhotoBoundaryPanel || !workerPhotoBoundaryImage) return;

  if (!photoUrl) {
    workerPhotoBoundaryPanel.hidden = true;
    workerPhotoBoundaryImage.removeAttribute('src');
    return;
  }

  workerPhotoBoundaryImage.crossOrigin = 'anonymous';
  workerPhotoBoundaryImage.src = photoUrl;
  workerPhotoBoundaryPanel.hidden = false;
  applyWorkerPhotoZoom();
}

function clearWorkerBoundaryPreview() {
  if (workerBoundaryPreviewUrl) {
    URL.revokeObjectURL(workerBoundaryPreviewUrl);
  }
  workerBoundaryPreviewUrl = '';
  showWorkerBoundaryPreview('');
}

function localDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function monthLabel(date) {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

async function ensureWorkerProfile() {
  // The session token identifies the worker, so load THIS worker's own profile
  // (incl. their phone) through a token-gated RPC instead of the anon-readable
  // employees_public view. See worker_my_profile + migration 202606271830.
  const { data: profile, error } = await workerDb.rpc('worker_my_profile', {
    p_token: SESSION_WORKER_TOKEN,
  });

  if (error) throw error;

  if (profile && profile.id) {
    return {
      photo_url: '',
      photo_zoom: 1,
      photo_position_x: 0,
      photo_position_y: 0,
      started_at: '',
      ...profile,
    };
  }

  // Worker not found in the database. Workers must be created by an admin before first login.
  // Direct INSERT is blocked by RLS â€” throw a clear error so the user sees a helpful message.
  const insertError = new Error(
    `Worker profile for "${SESSION_WORKER_NAME}" not found. Ask your admin to create your worker profile first.`
  );
  const inserted = null;

  if (insertError) throw insertError;
  return {
    photo_url: '',
    photo_zoom: 1,
    photo_position_x: 0,
    photo_position_y: 0,
    started_at: '',
    ...inserted,
  };
}

function renderWorkerDaysGrid(workdays = []) {
  if (!workerDaysGrid) return;

  const workdayMap = new Map(workdays.map((day) => [Number(day.dayOfWeek), day]));

  workerDaysGrid.innerHTML = workerDayOptions.map(({ dayOfWeek, label }) => {
    const savedDay = workdayMap.get(dayOfWeek);
    const enabled = savedDay ? 'checked' : '';
    const startsAt = savedDay?.startsAt || '09:00';
    const endsAt = savedDay?.endsAt || '17:00';

    return `
      <div class="worker-day-row" data-day-of-week="${dayOfWeek}">
        <span class="worker-day-handle" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="15" cy="18" r="1.4"/></svg>
        </span>
        <label class="worker-day-toggle">
          <input class="worker-day-enabled" type="checkbox" data-day-of-week="${dayOfWeek}" ${enabled}>
          <span class="worker-day-name">${label.slice(0, 3)}</span>
        </label>
        <div class="worker-day-copy-actions">
          <button class="button worker-copy-day" type="button">Copy</button>
          <button class="button worker-paste-day" type="button" ${copiedWorkerDaySchedule ? '' : 'disabled'}>Paste</button>
        </div>
        <div class="worker-day-times">
          <input class="worker-day-start" type="time" data-day-of-week="${dayOfWeek}" value="${startsAt}" aria-label="${label} start time">
          <span class="worker-day-dash" aria-hidden="true">&ndash;</span>
          <input class="worker-day-end" type="time" data-day-of-week="${dayOfWeek}" value="${endsAt}" aria-label="${label} end time">
        </div>
      </div>
    `;
  }).join('');
}

function selectedWorkdaysFromForm() {
  if (!workerDaysGrid) return [];

  return Array.from(workerDaysGrid.querySelectorAll('.worker-day-enabled:checked'))
    .map((checkbox) => {
      const dayOfWeek = Number(checkbox.dataset.dayOfWeek);
      const row = workerDaysGrid.querySelector(`.worker-day-row[data-day-of-week="${dayOfWeek}"]`);
      return {
        dayOfWeek,
        startsAt: row?.querySelector('.worker-day-start')?.value || '09:00',
        endsAt: row?.querySelector('.worker-day-end')?.value || '17:00',
      };
    })
    .filter((day) => day.startsAt && day.endsAt);
}

function refreshWorkerPasteButtons() {
  workerDaysGrid?.querySelectorAll('.worker-paste-day').forEach((button) => {
    button.disabled = !copiedWorkerDaySchedule;
  });
}

function setWorkerDayAvailability(dayOfWeek, enabled) {
  const row = workerDaysGrid?.querySelector(`.worker-day-row[data-day-of-week="${dayOfWeek}"]`);
  const checkbox = row?.querySelector('.worker-day-enabled');
  if (!row || !checkbox) return false;
  checkbox.checked = enabled;
  row.classList.toggle('is-unavailable', !enabled);
  return true;
}

function copyMondayScheduleToAllDays() {
  const monday = workerDaysGrid?.querySelector('.worker-day-row[data-day-of-week="1"]');
  if (!monday || !workerDaysGrid) return false;
  const startsAt = monday.querySelector('.worker-day-start')?.value || '09:00';
  const endsAt = monday.querySelector('.worker-day-end')?.value || '17:00';
  const enabled = Boolean(monday.querySelector('.worker-day-enabled')?.checked);
  workerDaysGrid.querySelectorAll('.worker-day-row').forEach((row) => {
    const startInput = row.querySelector('.worker-day-start');
    const endInput = row.querySelector('.worker-day-end');
    const checkbox = row.querySelector('.worker-day-enabled');
    if (startInput) startInput.value = startsAt;
    if (endInput) endInput.value = endsAt;
    if (checkbox) checkbox.checked = enabled;
    row.classList.toggle('is-unavailable', !enabled);
  });
  return true;
}

function setWorkerCopyMode(mode) {
  if (!workerDaysGrid) return;
  workerDaysGrid.classList.toggle('paste-ready', mode === 'paste');
  workerDaysGrid.classList.toggle('copy-ready', mode === 'copy');
}

function updateWorkerDaysOffSummary() {
  if (!workerDaysOffSummary) return;

  const daysOff = Array.from(selectedWorkerDaysOff).sort();
  workerDaysOffSummary.textContent = daysOff.length
    ? `Days marked unbookable: ${daysOff.join(', ')}`
    : 'No days off selected.';
}

function renderWorkerDaysOffCalendar() {
  if (!workerDaysOffCalendar) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastBookableDate = new Date(today);
  lastBookableDate.setMonth(lastBookableDate.getMonth() + 3);
  const monthCount = ((lastBookableDate.getFullYear() - startMonth.getFullYear()) * 12)
    + lastBookableDate.getMonth()
    - startMonth.getMonth()
    + 1;

  workerDaysOffCalendar.innerHTML = Array.from({ length: monthCount }, (_, index) => {
    const monthDate = new Date(startMonth.getFullYear(), startMonth.getMonth() + index, 1);
    const firstDayOffset = monthDate.getDay();
    const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
    const blankDays = Array.from({ length: firstDayOffset }, () => '<span class="calendar-empty"></span>').join('');
    const dayButtons = Array.from({ length: daysInMonth }, (_, dayIndex) => {
      const dayDate = new Date(monthDate.getFullYear(), monthDate.getMonth(), dayIndex + 1);
      const value = localDateValue(dayDate);
      const isPast = dayDate < today;
      const isOutsideWindow = dayDate > lastBookableDate;
      const classes = ['calendar-day'];
      if (selectedWorkerDaysOff.has(value)) classes.push('day-off');

      return `
        <button type="button" class="${classes.join(' ')}" data-day-off="${value}" ${isPast || isOutsideWindow ? 'disabled' : ''}>
          ${dayIndex + 1}
        </button>
      `;
    }).join('');

    return `
      <section class="worker-calendar-month">
        <h4>${monthLabel(monthDate)}</h4>
        <div class="calendar-weekdays">
          <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
        </div>
        <div class="calendar-days">${blankDays}${dayButtons}</div>
      </section>
    `;
  }).join('');

  updateWorkerDaysOffSummary();
}

let workerAvailabilityRows = [];

function workerTimeToMinutes(t) {
  const [h, m] = String(t || '00:00').slice(0, 5).split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

// Today's availability as a 24-hour timeline bar (desktop dashboard aside).
function renderWorkerAvailabilitySnapshot() {
  const container = document.querySelector('#worker-availability-snapshot');
  if (!container) return;
  const today = new Date();
  const todayRow = workerAvailabilityRows.find((r) => Number(r.day_of_week) === today.getDay());
  const dateLabel = today.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  let fill = '';
  if (todayRow && todayRow.starts_at && todayRow.ends_at) {
    const startMin = workerTimeToMinutes(todayRow.starts_at);
    const endMin = workerTimeToMinutes(todayRow.ends_at);
    if (endMin > startMin) {
      fill = `<span class="worker-avail-fill" style="left:${(startMin / 1440) * 100}%;width:${((endMin - startMin) / 1440) * 100}%"></span>`;
    }
  }
  container.innerHTML = `
    <p class="worker-avail-date">Today &middot; ${escapeHtml(dateLabel)}</p>
    <div class="worker-avail-bar">${fill}</div>
    <div class="worker-avail-axis"><span>12 AM</span><span>6 AM</span><span>12 PM</span><span>6 PM</span><span>12 AM</span></div>
    <div class="worker-avail-legend">
      <span><span class="worker-avail-key is-on"></span>Available</span>
      <span><span class="worker-avail-key is-off"></span>Unavailable</span>
    </div>
    ${!todayRow ? '<p class="field-help" style="margin-top:10px">Not scheduled to work today.</p>' : ''}
  `;
}

async function loadWorkerSchedule() {
  if (!currentEmployee) return;

  const { data: availability, error: availabilityError } = await workerDb
    .from('employee_availability')
    .select('day_of_week,starts_at,ends_at,work_location')
    .eq('employee_id', currentEmployee.id);

  if (availabilityError) {
    console.warn('Could not load worker availability:', availabilityError);
    workerAvailabilityRows = [];
    renderWorkerDaysGrid([]);
  } else {
    const rows = availability || [];
    workerAvailabilityRows = rows;
    renderWorkerDaysGrid(rows.map((row) => ({
      dayOfWeek: row.day_of_week,
      startsAt: String(row.starts_at || '09:00').slice(0, 5),
      endsAt: String(row.ends_at || '17:00').slice(0, 5),
    })));
  }

  renderWorkerAvailabilitySnapshot();

  const { data: daysOff, error: daysOffError } = await workerDb
    .from('employee_days_off')
    .select('day_off')
    .eq('employee_id', currentEmployee.id);

  if (daysOffError) {
    console.warn('Could not load worker days off:', daysOffError);
  } else {
    selectedWorkerDaysOff = new Set((daysOff || []).map((item) => item.day_off));
  }

  renderWorkerDaysOffCalendar();
}

// ── Worker change requests (schedule + job → admin approval) ──────────────────
async function loadWorkerChangeRequests() {
  const list = document.querySelector('#worker-change-requests-list');
  if (!list) return;
  const { data, error } = await workerDb.rpc('worker_list_change_requests', { p_token: SESSION_WORKER_TOKEN });
  if (error) {
    console.warn('Could not load change requests:', error);
    list.innerHTML = '<p class="field-help">Could not load your requests. Make sure the change-request migration has run.</p>';
    return;
  }
  renderWorkerChangeRequestsList(data || []);
}

function workerChangeStatusBadge(status) {
  const cls = { pending: 'is-pending', approved: 'is-approved', rejected: 'is-rejected' }[status] || '';
  const label = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' }[status] || status;
  return `<span class="wcr-badge ${cls}">${escapeHtml(label)}</span>`;
}

function renderWorkerChangeRequestsList(requests) {
  const list = document.querySelector('#worker-change-requests-list');
  if (!list) return;
  if (!requests.length) {
    list.innerHTML = '<p class="field-help">No change requests yet.</p>';
    return;
  }
  list.innerHTML = requests.map((r) => {
    const when = r.created_at ? new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    const kindLabel = r.kind === 'job' ? 'Job change' : 'Schedule change';
    const sub = r.requested_changes && r.requested_changes.type
      ? ` · ${escapeHtml(String(r.requested_changes.type).replace(/_/g, ' '))}` : '';
    return `
      <div class="wcr-item">
        <div class="wcr-item-head">
          <strong>${escapeHtml(kindLabel)}${sub}</strong>
          ${workerChangeStatusBadge(r.status)}
        </div>
        ${r.details ? `<p class="wcr-item-details">${escapeHtml(r.details)}</p>` : ''}
        ${r.admin_note ? `<p class="wcr-item-note"><strong>Admin:</strong> ${escapeHtml(r.admin_note)}</p>` : ''}
        <p class="wcr-item-meta">${escapeHtml(when)}</p>
      </div>`;
  }).join('');
}

// Show the date picker only for time-off requests.
function syncWorkerScheduleDateVisibility() {
  const typeEl = document.querySelector('#wcr-schedule-type');
  const dateRow = document.querySelector('#wcr-schedule-date-row');
  if (dateRow) dateRow.hidden = (typeEl?.value || 'time_off') !== 'time_off';
}

async function submitWorkerScheduleChangeRequest() {
  const typeEl = document.querySelector('#wcr-schedule-type');
  const dateEl = document.querySelector('#wcr-schedule-date');
  const detailsEl = document.querySelector('#wcr-schedule-details');
  const status = document.querySelector('#wcr-schedule-status');
  const submit = document.querySelector('#wcr-schedule-submit');
  const details = (detailsEl?.value || '').trim();
  if (!details) {
    if (status) status.textContent = 'Add a few details about the change you need.';
    return;
  }
  const requestedChanges = { type: typeEl?.value || 'other' };
  if (requestedChanges.type === 'time_off' && dateEl?.value) requestedChanges.date = dateEl.value;
  if (submit) submit.disabled = true;
  try {
    const { error } = await workerDb.rpc('worker_submit_change_request', {
      p_token: SESSION_WORKER_TOKEN,
      p_kind: 'schedule',
      p_details: details,
      p_service_request_id: null,
      p_requested_changes: requestedChanges,
    });
    if (error) throw error;
    if (detailsEl) detailsEl.value = '';
    if (dateEl) dateEl.value = '';
    if (status) status.textContent = 'Request sent to your admin.';
    await loadWorkerChangeRequests();
  } catch (err) {
    console.error('Schedule change request failed:', err);
    if (status) status.textContent = `Could not submit: ${err.message || 'try again.'}`;
  } finally {
    if (submit) submit.disabled = false;
  }
}

function openWorkerJobChangeModal(requestId, customerName) {
  const modal = document.querySelector('#worker-jobchange-modal');
  const overlay = document.querySelector('#worker-jobchange-overlay');
  if (!modal) return;
  modal.dataset.requestId = requestId;
  const subtitle = document.querySelector('#wcr-job-subtitle');
  const status = document.querySelector('#wcr-job-status');
  const details = document.querySelector('#wcr-job-details');
  if (subtitle) subtitle.textContent = customerName ? `For ${customerName}` : '';
  if (status) status.textContent = '';
  if (details) details.value = '';
  modal.hidden = false;
  if (overlay) overlay.classList.add('active');
}

function closeWorkerJobChangeModal() {
  const modal = document.querySelector('#worker-jobchange-modal');
  const overlay = document.querySelector('#worker-jobchange-overlay');
  if (modal) modal.hidden = true;
  if (overlay) overlay.classList.remove('active');
}

async function submitWorkerJobChangeRequest() {
  const modal = document.querySelector('#worker-jobchange-modal');
  const typeEl = document.querySelector('#wcr-job-type');
  const detailsEl = document.querySelector('#wcr-job-details');
  const status = document.querySelector('#wcr-job-status');
  const submit = document.querySelector('#wcr-job-submit');
  const requestId = modal?.dataset.requestId;
  const details = (detailsEl?.value || '').trim();
  if (!requestId) return;
  if (!details) {
    if (status) status.textContent = 'Add a few details for your admin.';
    return;
  }
  if (submit) submit.disabled = true;
  try {
    const { error } = await workerDb.rpc('worker_submit_change_request', {
      p_token: SESSION_WORKER_TOKEN,
      p_kind: 'job',
      p_details: details,
      p_service_request_id: requestId,
      p_requested_changes: { type: typeEl?.value || 'other' },
    });
    if (error) throw error;
    if (status) status.textContent = 'Sent to your admin.';
    await loadWorkerChangeRequests();
    setTimeout(closeWorkerJobChangeModal, 700);
  } catch (err) {
    console.error('Job change request failed:', err);
    if (status) status.textContent = `Could not submit: ${err.message || 'try again.'}`;
  } finally {
    if (submit) submit.disabled = false;
  }
}

async function loadWorkerProfile() {
  try {
    currentEmployee = await ensureWorkerProfile();
    localStorage.setItem(`shiftfuel_worker_id_${SESSION_WORKER_NAME}`, currentEmployee.id);
    const workerName = currentEmployee.full_name || SESSION_WORKER_NAME;
    sessionStorage.setItem('shiftfuel_worker', workerName);

    if (workerPortalHeading) workerPortalHeading.textContent = workerName;
    if (workerDashboardName) workerDashboardName.textContent = workerName;
    const profileStatusBadge = document.querySelector('#worker-profile-status-badge');
    if (profileStatusBadge) profileStatusBadge.hidden = currentEmployee.active === false;
    const verifiedBadge = document.querySelector('#worker-verified-badge');
    if (verifiedBadge) verifiedBadge.hidden = !currentEmployee.background_verified;
    const headerName = document.querySelector('#worker-header-name');
    if (headerName) headerName.textContent = workerName;
    const avatarInitial = (workerName.trim().charAt(0) || 'W').toUpperCase();
    const avatarPhoto = currentEmployee.cropped_photo_url || currentEmployee.photo_url || '';
    const headerAvatar = document.querySelector('#worker-header-avatar');
    if (headerAvatar) { headerAvatar.textContent = avatarInitial; applyAvatarPhoto(headerAvatar, avatarPhoto); }
    const mobileAvatar = document.querySelector('#worker-mobile-avatar-initial');
    if (mobileAvatar) mobileAvatar.textContent = avatarInitial;
    applyAvatarPhoto(document.querySelector('#worker-mobile-avatar-btn'), avatarPhoto);
    const panelName = document.getElementById('worker-panel-name');
    if (panelName) panelName.textContent = workerName;
    updateWorkerStatusBadge();
    const panelPhone = document.getElementById('worker-panel-phone');
    if (panelPhone) panelPhone.textContent = currentEmployee.phone ? formatPhone(currentEmployee.phone) : 'Not provided';
    if (workerProfileName) workerProfileName.value = workerName;
    if (workerProfileUsername) workerProfileUsername.value = currentEmployee.username || '';
    if (workerProfilePhone) workerProfilePhone.value = formatPhone(currentEmployee.phone || '');
    if (workerProfileStarted) workerProfileStarted.value = currentEmployee.started_at || '';
    if (workerDashboardPhone) workerDashboardPhone.textContent = currentEmployee.phone ? formatPhone(currentEmployee.phone) : 'Not provided';
    if (workerWorkingSince) workerWorkingSince.textContent = currentEmployee.started_at ? formatDate(currentEmployee.started_at) : 'Today';

    workerProfilePhotoZoom = Number(currentEmployee.photo_zoom || 1);
    workerProfilePhotoPosition = currentWorkerPhotoPositionFromEmployee();
    showWorkerPhoto(
      currentEmployee.cropped_photo_url || currentEmployee.photo_url || '',
      currentEmployee.original_photo_url || currentEmployee.photo_url || '',
      workerProfilePhotoZoom, workerProfilePhotoPosition
    );
    resetWorkerPhotoCrop();
    setWorkerStatus('');
    if (sessionStorage.getItem('shiftfuel_worker_must_change_pw') === 'true') {
      openPasswordModal(true);
    }
    await loadWorkerPayRates();
    await loadWorkerSchedule();
    await loadWorkerJobs();
    startWorkerJobsPoll();
    startWorkerHeartbeat();
    await loadWorkerReviews();
  } catch (error) {
    console.error('Could not load worker profile:', error);
    setWorkerStatus('Could not load worker profile. Run supabase-operational-upgrades.sql in Supabase.');
  }
}

async function uploadWorkerPhoto(file) {
  const safeName = (file.name || 'profile.jpg').replace(/[^a-z0-9.-]/gi, '-').toLowerCase();
  const path = `workers/${currentEmployee.id}/${Date.now()}-${safeName || 'profile.jpg'}`;

  const { error } = await workerDb.storage.from(PHOTO_BUCKET).upload(path, file, { upsert: false });
  if (error) throw error;

  const { data } = workerDb.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  return data?.publicUrl || path;
}

function storagePathFromUrl(url) {
  if (!url) return null;
  // Extract the path after "/object/public/<bucket>/"
  const marker = `/object/public/${PHOTO_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length).split('?')[0]);
}

async function deleteOldWorkerPhotos(oldOriginalUrl, oldCroppedUrl) {
  const paths = [...new Set([
    storagePathFromUrl(oldOriginalUrl),
    storagePathFromUrl(oldCroppedUrl),
  ])].filter(Boolean);
  if (!paths.length) return;
  const { error } = await workerDb.storage.from(PHOTO_BUCKET).remove(paths);
  if (error) console.warn('Could not delete old profile photos:', error.message);
}

function resetWorkerPhotoCrop() {
  if (workerCropImageUrl) {
    URL.revokeObjectURL(workerCropImageUrl);
  }
  if (workerCroppedPreviewUrl) {
    URL.revokeObjectURL(workerCroppedPreviewUrl);
  }

  workerCropImageUrl = '';
  workerCroppedPreviewUrl = '';
  workerCroppedPhotoBlob = null;
  workerCropOffset = { x: 0, y: 0 };
  workerCropDrag = null;

  if (workerPhotoCropPanel) workerPhotoCropPanel.hidden = true;
  if (workerPhotoCropImage) {
    workerPhotoCropImage.removeAttribute('src');
    workerPhotoCropImage.style.removeProperty('--crop-zoom');
    workerPhotoCropImage.style.removeProperty('--crop-x');
    workerPhotoCropImage.style.removeProperty('--crop-y');
  }
  if (workerPhotoCropPreview) {
    workerPhotoCropPreview.removeAttribute('src');
    workerPhotoCropPreview.style.removeProperty('--crop-zoom');
    workerPhotoCropPreview.style.removeProperty('--crop-x');
    workerPhotoCropPreview.style.removeProperty('--crop-y');
  }
  if (workerPhotoCropZoom) workerPhotoCropZoom.value = '1';
  if (workerPhotoCropStatus) workerPhotoCropStatus.textContent = '';
}

function updateWorkerCropPreview() {
  if (!workerPhotoCropImage) return;
  const zoom = workerPhotoCropZoom?.value || '1';
  workerPhotoCropImage.style.setProperty('--crop-zoom', zoom);
  workerPhotoCropImage.style.setProperty('--crop-x', `${workerCropOffset.x}px`);
  workerPhotoCropImage.style.setProperty('--crop-y', `${workerCropOffset.y}px`);

  if (workerPhotoCropPreview) {
    const editorSize = workerPhotoCropImage.getBoundingClientRect().width || 280;
    const previewSize = workerPhotoCropPreview.getBoundingClientRect().width || editorSize;
    const offsetScale = previewSize / editorSize;
    workerPhotoCropPreview.style.setProperty('--crop-zoom', zoom);
    workerPhotoCropPreview.style.setProperty('--crop-x', `${workerCropOffset.x * offsetScale}px`);
    workerPhotoCropPreview.style.setProperty('--crop-y', `${workerCropOffset.y * offsetScale}px`);
  }
}

function openWorkerPhotoCrop(file) {
  resetWorkerPhotoCrop();

  if (!file || !file.type.startsWith('image/')) {
    if (workerPhotoCropStatus) workerPhotoCropStatus.textContent = 'Choose an image file for the worker photo.';
    return;
  }

  workerCropImageUrl = URL.createObjectURL(file);
  workerCropOffset = { x: 0, y: 0 };
  if (workerPhotoCropImage) {
    workerPhotoCropImage.src = workerCropImageUrl;
    workerPhotoCropImage.onload = () => updateWorkerCropPreview();
  }
  if (workerPhotoCropPreview) {
    workerPhotoCropPreview.src = workerCropImageUrl;
  }
  if (workerPhotoCropPanel) workerPhotoCropPanel.hidden = false;
  if (workerPhotoCropStatus) workerPhotoCropStatus.textContent = 'Adjust the crop, then use the cropped photo before saving.';
}

async function makeCroppedWorkerPhoto() {
  if (!workerPhotoCropImage?.complete || !workerProfilePhoto?.files?.[0]) {
    return null;
  }

  const source = workerPhotoCropImage;
  const size = 600;
  const zoom = Number(workerPhotoCropZoom?.value || 1);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  const naturalWidth = source.naturalWidth;
  const naturalHeight = source.naturalHeight;
  const frameSize = workerPhotoCropImage.getBoundingClientRect().width || 280;
  const baseScale = Math.max(frameSize / naturalWidth, frameSize / naturalHeight);
  const displayScale = baseScale * zoom;
  const outputScale = size / frameSize;
  const displayWidth = naturalWidth * displayScale;
  const displayHeight = naturalHeight * displayScale;
  const drawnWidth = displayWidth * outputScale;
  const drawnHeight = displayHeight * outputScale;
  const dx = ((frameSize - displayWidth) / 2 + workerCropOffset.x) * outputScale;
  const dy = ((frameSize - displayHeight) / 2 + workerCropOffset.y) * outputScale;

  context.drawImage(source, 0, 0, naturalWidth, naturalHeight, dx, dy, drawnWidth, drawnHeight);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve(null);
        return;
      }

      resolve(new File([blob], 'worker-profile-cropped.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.9);
  });
}

async function saveWorkerAvailability() {
  const workdays = selectedWorkdaysFromForm();
  if (!currentEmployee || !workdays.length) {
    setScheduleStatus('Choose at least one workday before saving.');
    return;
  }

  const workLocation = currentEmployee?.home_location || DEFAULT_WORK_LOCATION;
  const { error } = await workerDb.rpc('worker_save_availability', {
    p_token: SESSION_WORKER_TOKEN,
    p_workdays: workdays.map((day) => ({
      day_of_week: day.dayOfWeek,
      starts_at: day.startsAt,
      ends_at: day.endsAt,
    })),
    p_location: workLocation,
  });
  if (error) throw error;

  currentEmployee.home_location = workLocation;
  setScheduleStatus('Work days and shift times saved.');
}

async function saveWorkerDaysOff() {
  if (!currentEmployee) return;

  const { error } = await workerDb.rpc('worker_save_days_off', {
    p_token: SESSION_WORKER_TOKEN,
    p_days_off: Array.from(selectedWorkerDaysOff).sort(),
  });
  if (error) throw error;

  setScheduleStatus('Days off saved and marked unbookable.');
}

function updateWorkerStatCards(requests) {
  const todayEl = document.querySelector('#worker-stat-jobs-today');
  const completedEl = document.querySelector('#worker-stat-jobs-completed');
  if (!todayEl && !completedEl && !workerCurrentJobsToday && !workerHeroSubtitle) return;

  const today = new Date().toISOString().slice(0, 10);
  const jobsToday = requests.filter((r) => r.service_date === today && workerOpenStatuses.includes(r.status)).length;
  if (todayEl) {
    todayEl.textContent = jobsToday;
  }
  if (workerCurrentJobsToday) {
    workerCurrentJobsToday.textContent = jobsToday;
  }
  if (workerHeroSubtitle) {
    workerHeroSubtitle.textContent = `You have ${jobsToday} ${jobsToday === 1 ? 'job' : 'jobs'} scheduled today.`;
  }
  if (completedEl) {
    completedEl.textContent = requests.filter((r) => canonicalBookingStatus(r.status) === 'completed').length;
  }
}

// Compact review item for the Profile "Recent Reviews" card.
function renderProfileReview(review) {
  const name = review.customer_name || 'Customer';
  const initial = escapeHtml((name.trim().charAt(0) || 'C').toUpperCase());
  const rounded = Math.max(0, Math.min(5, Math.round(Number(review.rating) || 0)));
  const stars = '★'.repeat(rounded) + '☆'.repeat(5 - rounded);
  return `
    <div class="worker-review-item">
      <span class="worker-avatar worker-avatar-sm" aria-hidden="true">${initial}</span>
      <div class="worker-review-body">
        <div class="worker-review-top">
          <strong>${escapeHtml(name)}</strong>
          <span class="worker-review-stars" aria-label="${rounded} out of 5 stars">${stars}</span>
        </div>
        <span class="worker-review-time">${escapeHtml(formatDateTime(review.submitted_at))}</span>
        <p class="worker-review-comment">${escapeHtml(review.comments || 'No comments provided.')}</p>
      </div>
    </div>`;
}

async function loadWorkerReviews() {
  if (!workerReviewList || !currentEmployee) return;

  workerReviewList.innerHTML = '<div class="empty-state"><p>Loading reviews...</p></div>';

  const { data: requests, error: requestError } = await workerDb
    .rpc('worker_list_my_requests', { p_token: SESSION_WORKER_TOKEN })
    .select('id,customer_name,vehicle_year,vehicle_make,vehicle_model,status,service_date,desired_return_time,updated_at,payment_status');

  if (requestError) {
    console.warn('Could not load assigned requests:', requestError);
    workerReviewList.innerHTML = '<div class="empty-state"><p>Could not load assigned requests.</p></div>';
    return;
  }

  updateWorkerStatCards(requests || []);
  updateWorkerOnTimeRate(requests || []);
  updateWorkerRecentUpdates(requests || []);

  const requestMap = new Map((requests || []).map((request) => [request.id, request]));
  const requestIds = Array.from(requestMap.keys());

  if (!requestIds.length) {
    workerReviewList.innerHTML = '<div class="empty-state"><p>No assigned reviews yet.</p></div>';
    return;
  }

  const { data: reviews, error: reviewError } = await workerDb
    .from('service_reviews')
    .select('id,service_request_id,rating,comments,customer_name,submitted_at')
    .in('service_request_id', requestIds)
    .order('submitted_at', { ascending: false });

  if (reviewError) {
    console.warn('Could not load worker reviews:', reviewError);
    workerReviewList.innerHTML = '<div class="empty-state"><p>Could not load reviews. Run supabase-service-reviews.sql in Supabase.</p></div>';
    return;
  }

  const ratingStatEl = document.querySelector('#worker-stat-rating');
  const averageRating = reviews?.length
    ? (reviews.reduce((sum, r) => sum + Number(r.rating || 0), 0) / reviews.length).toFixed(1)
    : '-';
  if (ratingStatEl) ratingStatEl.textContent = averageRating;
  if (workerCurrentRating) workerCurrentRating.textContent = averageRating;

  if (!reviews?.length) {
    workerReviewList.innerHTML = '<div class="empty-state"><p>No reviews for this worker yet.</p></div>';
    return;
  }

  workerReviewList.innerHTML = reviews.map((review) => {
    const request = requestMap.get(review.service_request_id) || {};
    return `
      <article class="request-card">
        <div class="request-card-header">
          <div>
            <p class="eyebrow">${escapeHtml(formatDateTime(review.submitted_at))}</p>
            <h3>${escapeHtml(review.rating)} / 5 rating</h3>
          </div>
          <span class="status-pill">${escapeHtml(request.vehicle_make || 'Review')}</span>
        </div>
        <div class="request-details">
          <p><strong>Customer:</strong> ${escapeHtml(review.customer_name || request.customer_name || 'Unknown')}</p>
          <p><strong>Vehicle:</strong> ${escapeHtml([request.vehicle_year, request.vehicle_make, request.vehicle_model].filter(Boolean).join(' ') || 'Not listed')}</p>
          <p><strong>Comments:</strong> ${escapeHtml(review.comments || 'No comments provided.')}</p>
        </div>
      </article>
    `;
  }).join('');

  // Surface rating + the latest few reviews on the Profile tab.
  const profileRatingRow = document.querySelector('#worker-profile-rating-row');
  const profileRating = document.querySelector('#worker-profile-rating');
  const profileReviewCount = document.querySelector('#worker-profile-review-count');
  const profileReviewsCard = document.querySelector('#worker-profile-reviews-card');
  const profileReviews = document.querySelector('#worker-profile-reviews');
  if (profileRating) profileRating.textContent = averageRating;
  if (profileReviewCount) profileReviewCount.textContent = `${reviews.length} review${reviews.length === 1 ? '' : 's'}`;
  if (profileRatingRow) profileRatingRow.hidden = false;
  if (profileReviews) profileReviews.innerHTML = reviews.slice(0, 3).map(renderProfileReview).join('');
  if (profileReviewsCard) profileReviewsCard.hidden = false;
  const dashReviews = document.querySelector('#worker-dash-reviews');
  if (dashReviews) dashReviews.innerHTML = reviews.slice(0, 2).map(renderProfileReview).join('');
}

function workerFormatAddress(request) {
  if (request.address_street) {
    return [request.address_street, request.address_apt, request.address_city, request.address_state, request.address_zip].filter(Boolean).join(', ');
  }
  return request.hospital || 'Not provided';
}

function workerFormatService(request) {
  const parts = [request.service_label || request.service_type];
  if (request.fuel_type) parts.push(`Fuel: ${request.fuel_type}`);
  if (request.estimated_fuel_range) parts.push(`Est. range: ${request.estimated_fuel_range}`);
  if (request.wash_package_label) parts.push(`Wash: ${request.wash_package_label}`);
  if (request.quick_inspection) parts.push('Vehicle add-ons');
  if (request.service_date) parts.push(request.service_date);
  if (request.desired_return_time) parts.push(`Return by: ${request.desired_return_time}`);
  return parts.filter(Boolean).join(' | ');
}

let expandedWorkerJobId = null;
// Tracks whether we've already auto-opened the active job's full card once, so
// the background poll (and later reloads) never re-expand it after a worker has
// deliberately collapsed it.
let hasAutoExpandedCurrentJob = false;

// Jobs the worker has tapped "Start — open map" on this session. Used to flip the
// Accepted step from "Start" to "Key received" instantly, before the first GPS
// fix lands. The persistent/synced source of truth is live_tracking_enabled
// (set server-side once a location uploads), so the flip survives reloads too.
const workerStartedJobIds = new Set();
function workerHasStarted(request) {
  return workerStartedJobIds.has(request.id) || request.live_tracking_enabled === true;
}

function workerQueueInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

function workerJobNextActionLabel(request, mode) {
  if (mode === 'available') return 'Claim job';
  if (!isWorkerOpenStatus(request.status)) return 'View Summary';
  return 'Continue';
}

// Maps an internal status to a coloured status-badge modifier class so the
// pill colour matches the workflow phase (open / in progress / complete / etc).
function workerStatusBadgeClass(status) {
  if (canonicalBookingStatus(status) === 'completed') return 'status-pill-complete';
  if (['cancelled_pending_key_return', 'customer_canceled', 'canceled', 'cancelled', 'denied', 'unable_to_complete', 'auto_reversed', 'closed_no_charge'].includes(status)) return 'status-pill-cancelled';
  if (['payment_issue', 'authorization_too_low', 'pending_customer_payment'].includes(status)) return 'status-pill-payment';
  if (['pending', 'request_received'].includes(status)) return 'status-pill-open';
  return 'status-pill-progress';
}

function workerStatusBadge(request) {
  const canonicalStatus = canonicalBookingStatus(request.status);
  return `<span class="status-pill ${workerStatusBadgeClass(canonicalStatus)}">${escapeHtml(workerStatusLabels[canonicalStatus] || canonicalStatus || '')}</span>`;
}

function workerVehicleSummary(request) {
  const base = [request.vehicle_year, request.vehicle_make, request.vehicle_model].filter(Boolean).join(' ');
  return request.vehicle_color ? `${base} · ${request.vehicle_color}` : base;
}

function workerReturnByLabel(request) {
  const time = String(request.desired_return_time || '').slice(0, 5);
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h)) return '';
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = ((h + 11) % 12) + 1;
  return `Return by ${hour12}:${String(m || 0).padStart(2, '0')} ${period}`;
}

// Available request card (spec: cards, not a table). Shows service, vehicle,
// location, return time, estimated fee, status badge, and a single Accept button.
function renderWorkerAvailableCard(request) {
  const estPayout = workerEstimatedPayout(request);
  const estMinutes = workerEstimatedMinutes(request);
  const returnBy = workerReturnByLabel(request);
  const service = request.service_label || request.service_type || 'Service';
  const initial = escapeHtml((service.trim().charAt(0) || 'S').toUpperCase());
  return `
    <article class="worker-card worker-available-card">
      <div class="worker-job-head">
        <span class="worker-avatar" aria-hidden="true">${initial}</span>
        <div class="worker-job-head-main">
          <h4 class="worker-current-job-name">${escapeHtml(service)}</h4>
          <p class="worker-card-vehicle">${escapeHtml(workerVehicleSummary(request) || 'Vehicle on file')}</p>
        </div>
        <div class="worker-job-head-meta">
          <span class="worker-open-flag"><span class="worker-open-badge-dot"></span>Open</span>
        </div>
      </div>
      <div class="worker-job-estrow">
        <div class="worker-est-stat">
          <span class="worker-est-stat-label">You'll earn (est.)</span>
          <span class="worker-est-stat-value">${money(estPayout)}</span>
        </div>
        <div class="worker-est-stat">
          <span class="worker-est-stat-label">Time to complete</span>
          <span class="worker-est-stat-value">~${estMinutes} min</span>
        </div>
      </div>
      <div class="worker-job-facts">
        ${workerFactRow(WK_ICONS.pin, 'Service address', escapeHtml(workerFormatAddress(request)))}
        ${returnBy ? workerFactRow(WK_ICONS.clock, 'When', escapeHtml(returnBy)) : ''}
      </div>
      <button class="button primary worker-card-action claim-worker-job" data-id="${escapeHtml(request.id)}" type="button">Accept Request</button>
    </article>
  `;
}

// Compact card for an assigned (non-current) job in Today's Schedule. Tapping
// the card expands the full job card with its workflow actions.
function renderWorkerCompactJobCard(request, mode) {
  const isExpanded = expandedWorkerJobId === request.id;
  return `
    <article class="worker-card worker-schedule-card${isExpanded ? ' is-expanded' : ''}">
      <button class="worker-card-summary worker-row-toggle" data-id="${escapeHtml(request.id)}" type="button" aria-expanded="${isExpanded}">
        <span class="worker-card-summary-main">
          <span class="worker-card-time">${escapeHtml(formatWorkerJobTime(request) || 'Today')}</span>
          <strong>${escapeHtml(request.customer_name || 'Customer')}</strong>
          <span class="worker-card-sub">${escapeHtml(workerVehicleSummary(request))}</span>
          <span class="worker-card-sub">${escapeHtml(request.service_label || request.service_type || '')}</span>
        </span>
        <span class="worker-card-summary-side">
          ${workerStatusBadge(request)}
          <span class="worker-card-chevron" aria-hidden="true">${isExpanded ? '&#9650;' : '&#9660;'}</span>
        </span>
      </button>
      ${isExpanded ? `<div class="worker-card-expanded">${renderWorkerJobCard(request, mode)}</div>` : ''}
    </article>
  `;
}

// Card-list dispatcher. Keeps the original name so every caller keeps working,
// but renders stacked cards instead of a table (spec: no tables anywhere).
function renderWorkerJobTable(requests, mode) {
  if (mode === 'available') {
    return `<div class="worker-card-list">${requests.map((request) => renderWorkerAvailableCard(request)).join('')}</div>`;
  }
  return `<div class="worker-card-list">${requests.map((request) => renderWorkerCompactJobCard(request, mode)).join('')}</div>`;
}

// Large "Current Job" card — always expanded, leads the dashboard. Surfaces the
// key facts up top, then the workflow's single next-action button, then a small
// secondary row (call customer / view full details).
// Inline icons for the iconographic job-card detail rows (mockup style).
const WK_ICONS = {
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  car: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13l1.8-4.6A2 2 0 0 1 6.7 7h10.6a2 2 0 0 1 1.9 1.4L21 13v5a1 1 0 0 1-1 1h-1.2a1 1 0 0 1-1-1v-1H6.2v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><circle cx="7.5" cy="16" r="1"/><circle cx="16.5" cy="16" r="1"/></svg>',
  key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="3.4"/><path d="M10.4 10.4 19 19m-3-3 2 2m-4-4 2 2"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/></svg>',
};

// One iconographic detail row. `value` is expected pre-escaped by the caller.
function workerFactRow(icon, label, value) {
  return `
    <div class="worker-fact-row">
      <span class="worker-fact-icon">${icon}</span>
      <div class="worker-fact-text">
        <span class="worker-fact-label">${escapeHtml(label)}</span>
        <span class="worker-fact-value">${value}</span>
      </div>
    </div>`;
}

// The six high-level phases every job passes through, shown as a pinned
// progress rail at the top of the wizard card. Short labels keep the rail
// readable on a phone; the active phase's full name is shown above it.
const WORKER_WIZARD_PHASES = [
  { short: 'Accept', full: 'Request accepted' },
  { short: 'Key', full: 'Key received' },
  { short: 'Pickup', full: 'Vehicle picked up' },
  { short: 'Service', full: 'Service in progress' },
  { short: 'Return', full: 'Vehicle returned' },
  { short: 'Done', full: 'Complete' },
];

// Horizontal "Step N of 6" progress rail pinned at the top of the wizard so the
// worker always sees where they are without scrolling. Reuses the same phase
// math as the vertical stepper (workerProgressStepForStatus).
function renderWorkerHorizontalStepper(request) {
  let current = workerProgressStepForStatus(request.status);
  if (current < 1) current = 1; // request_received → about to become step 1
  const phase = WORKER_WIZARD_PHASES[Math.min(current, 6) - 1];
  return `
    <div class="worker-wizard-progress">
      <div class="worker-wizard-progress-head">
        <span class="worker-wizard-step-count">Step ${current} of 6</span>
        <span class="worker-wizard-step-phase">${escapeHtml(phase.full)}</span>
      </div>
      <ol class="worker-hstepper" aria-label="Job progress">
        ${WORKER_WIZARD_PHASES.map((p, index) => {
          const stepNumber = index + 1;
          const state = stepNumber < current ? 'done' : stepNumber === current ? 'active' : 'upcoming';
          return `
            <li class="worker-hstep is-${state}">
              <span class="worker-hstep-dot">${state === 'done' ? '&#10003;' : stepNumber}</span>
              <span class="worker-hstep-label">${escapeHtml(p.short)}</span>
            </li>`;
        }).join('')}
      </ol>
    </div>`;
}

// Desired return time as a friendly clock label ("2:30 PM"), no "Return by".
function workerReturnTimeOnly(request) {
  const time = String(request.desired_return_time || '').slice(0, 5);
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h)) return '';
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = ((h + 11) % 12) + 1;
  return `${hour12}:${String(m || 0).padStart(2, '0')} ${period}`;
}

// Earliest pickup/drop-off time as a friendly clock label, or '' when flexible.
function workerPickupTimeOnly(request) {
  const time = String(request.desired_pickup_time || '').slice(0, 5);
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h)) return '';
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = ((h + 11) % 12) + 1;
  return `${hour12}:${String(m || 0).padStart(2, '0')} ${period}`;
}

// Clean, single-line job reference block shown on the active-job card. Each row is
// a small uppercase label + value. The service shows as "Fuel — <type>" and/or
// "Car wash — <package>", fuel and wash on their own lines when both apply.
function renderWorkerJobPlainDetails(request) {
  const parking = [request.parking_location, request.parking_spot ? `spot ${request.parking_spot}` : '']
    .filter(Boolean).join(', ');
  const vehicle = [request.vehicle_year, request.vehicle_make, request.vehicle_model, request.vehicle_color]
    .filter(Boolean).join(' ');
  const vehicleLine = [vehicle, request.license_plate ? `Plate ${request.license_plate}` : '']
    .filter(Boolean).join(' · ');
  const returnTime = workerReturnTimeOnly(request);
  const pickupTime = workerPickupTimeOnly(request);
  const serviceLines = [];
  if (serviceNeedsFuel(request)) serviceLines.push(`Fuel — ${request.fuel_type || 'Regular'}`);
  if (serviceNeedsWash(request)) serviceLines.push(`Car wash — ${request.wash_package_label || 'Selected wash'}`);

  // Gas station only matters for fuel jobs: the chosen station (flagged when the
  // customer paid the preference surcharge), or the default closest station.
  let gasStation = '';
  if (serviceNeedsFuel(request)) {
    if (request.gas_station_name) {
      gasStation = request.gas_station_name
        + (request.gas_station_address ? ` — ${request.gas_station_address}` : '')
        + (Number(request.gas_station_surcharge) > 0 ? ' (customer preferred)' : '');
    } else {
      gasStation = 'Closest station to the vehicle';
    }
  }

  const row = (label, value) => value
    ? `<div class="wjp-row"><span class="wjp-label">${label}</span><span class="wjp-value">${value}</span></div>`
    : '';

  return `
    <div class="worker-job-plain">
      ${row('Customer', escapeHtml(request.customer_name || 'Customer'))}
      ${row('Service address', escapeHtml(workerFormatAddress(request)))}
      ${row('Parking', escapeHtml(parking || 'Not provided'))}
      ${row('Key handoff', escapeHtml(request.key_handoff_details || 'Not provided'))}
      ${pickupTime ? row('Pickup time', escapeHtml(pickupTime)) : ''}
      ${row('Return by', escapeHtml(returnTime))}
      ${row('Vehicle', escapeHtml(vehicleLine || 'On file'))}
      ${row('Service', serviceLines.map(escapeHtml).join('<br>') || escapeHtml(request.service_label || request.service_type || ''))}
      ${row('Gas station', escapeHtml(gasStation))}
    </div>`;
}

// One-step-at-a-time wizard card for an active job. A clean plain-text details
// block sits up top (no name header / no progress rail — the worker knows who
// they are and that they accepted the job), then the single current step
// (renderWorkerJobActions) leads the action. The status/action engine and every
// action panel are reused unchanged; only the presentation is the wizard.
function renderWorkerCurrentJobCard(request) {
  const phone = request.customer_phone ? normalizePhone(request.customer_phone) : '';
  return `
    <article class="worker-card worker-current-job-card worker-wizard-card" data-current-job-id="${escapeHtml(request.id)}">
      ${renderWorkerJobPlainDetails(request)}

      <div class="worker-wizard-step">
        ${renderWorkerJobActions(request)}
      </div>

      <div class="worker-secondary-actions">
        ${phone ? `<a class="button secondary worker-secondary-btn" href="tel:${escapeHtml(phone)}">Call customer</a>` : ''}
        <button class="button secondary worker-secondary-btn worker-request-job-change" data-id="${escapeHtml(request.id)}" data-customer="${escapeHtml(request.customer_name || 'this job')}" type="button">Request a change</button>
      </div>
    </article>
  `;
}

// Mirror today's claimed jobs (already time-ordered) onto the Dashboard, each
// with its full guided baby-step card, so the worker lands straight on
// "what to do next" without digging into the Jobs tab. Reuses the same card +
// document-delegated handlers, so no job/GPS/push logic is duplicated.
function renderWorkerDashboardToday(focusJobs, upcomingJobs) {
  const container = document.querySelector('#worker-dashboard-today');
  if (!container) return;
  focusJobs = focusJobs || [];
  upcomingJobs = upcomingJobs || [];
  if (!focusJobs.length && !upcomingJobs.length) {
    container.innerHTML = '<div class="worker-state-card worker-state-empty"><h3>No jobs scheduled today</h3><p>You’re clear for now. New accepted jobs will appear here with the next action first.</p></div>';
    return;
  }
  const focusHtml = focusJobs.length
    ? focusJobs.map(renderWorkerCurrentJobCard).join('')
    : '<div class="worker-state-card worker-state-empty"><h3>No jobs scheduled today</h3><p>Your upcoming accepted jobs are below. Today’s action card will appear here when it is time to work.</p></div>';
  const upcomingHtml = upcomingJobs.length ? `
    <details class="worker-upcoming-block worker-upcoming-accordion">
      <summary class="worker-upcoming-summary">
        <span>Upcoming Jobs</span>
        <strong>${upcomingJobs.length}</strong>
      </summary>
      <div class="worker-upcoming-list">
        ${upcomingJobs.map(renderWorkerUpcomingRow).join('')}
      </div>
    </details>` : '';
  container.innerHTML = focusHtml + upcomingHtml;
}

// Quiet, action-free row for a claimed job you can't start yet (one job at a time).
function renderWorkerUpcomingRow(request) {
  const initial = escapeHtml(((request.customer_name || 'C').trim().charAt(0) || 'C').toUpperCase());
  const today = new Date().toISOString().slice(0, 10);
  const day = request.service_date && request.service_date !== today ? workerFormatScheduleDate(request.service_date) : '';
  const returnBy = workerReturnByLabel(request);
  const when = [day, returnBy].filter(Boolean).join(' · ');
  const sub = [workerVehicleSummary(request), request.service_label || request.service_type]
    .filter(Boolean).map(escapeHtml).join(' &middot; ');
  const address = workerFormatAddress(request);
  return `
    <article class="worker-card worker-upcoming-row">
      <span class="worker-avatar worker-avatar-sm" aria-hidden="true">${initial}</span>
      <div class="worker-upcoming-main">
        <strong>${escapeHtml(request.customer_name || 'Customer')}</strong>
        <span class="worker-card-sub">${sub}</span>
        ${address ? `<span class="worker-upcoming-addr">${WK_ICONS.pin}<span>${escapeHtml(address)}</span></span>` : ''}
      </div>
      ${when ? `<span class="worker-upcoming-when">${escapeHtml(when)}</span>` : ''}
    </article>`;
}

// Today's Schedule strip on the Today's Job tab — a quick count of the day's
// work by bucket. Accepted = jobs you're actively working; Upcoming = open jobs
// you can still claim; Completed = done today; Cancelled = cancelled/return-required.
function renderWorkerTodayCounts(counts) {
  const container = document.querySelector('#worker-today-counts');
  if (!container) return;
  const cells = [
    { label: 'Accepted', value: counts.accepted, cls: 'is-accepted', action: 'focus' },
    { label: 'Upcoming', value: counts.upcoming, cls: 'is-upcoming', action: 'upcoming' },
    { label: 'Completed', value: counts.completed, cls: 'is-completed', action: 'earnings' },
    { label: 'Cancelled', value: counts.cancelled, cls: 'is-cancelled', action: 'focus' },
  ];
  // A tile with a count > 0 is a button that jumps to the matching content. A
  // zero-count tile is a dimmed, non-interactive div (nothing to jump to).
  container.innerHTML = cells.map((c) => {
    const inner = `
      <span class="worker-count-value">${c.value}</span>
      <span class="worker-count-label">${c.label}</span>`;
    return c.value > 0
      ? `<button type="button" class="worker-count-cell ${c.cls}" data-count-action="${c.action}">${inner}</button>`
      : `<div class="worker-count-cell ${c.cls} is-empty" aria-disabled="true">${inner}</div>`;
  }).join('');
}

// Earnings tab: completed jobs with their net take-home (service fees minus
// Stripe processing), plus a running total for the day.
function renderWorkerEarnings(completed) {
  const container = document.querySelector('#worker-earnings-list');
  if (!container) return;
  if (!completed.length) {
    container.innerHTML = '<div class="worker-state-card worker-state-empty"><h3>No payouts added yet today</h3><p>Completed jobs and today’s payout totals will show here.</p></div>';
    return;
  }
  const total = completed.reduce((sum, job) => sum + workerNetPayout(job), 0);
  container.innerHTML = `
    <div class="worker-earnings-summary">
      <span class="worker-earnings-total-label">Today's earnings</span>
      <span class="worker-earnings-total">${money(total)}</span>
      <span class="worker-earnings-sub">${completed.length} job${completed.length === 1 ? '' : 's'} completed &middot; net of card processing</span>
    </div>
    <div class="worker-card-list">
      ${completed.map((job) => `
        <article class="worker-card worker-earnings-row">
          <div class="worker-card-summary-main">
            <strong>${escapeHtml(job.customer_name || 'Customer')}</strong>
            <span class="worker-card-sub">${escapeHtml(job.service_label || job.service_type || '')}${job.updated_at ? ` &middot; ${escapeHtml(workerFormatClockTime(job.updated_at))}` : ''}</span>
            ${workerMileagePay(job) > 0 ? `<span class="worker-card-sub worker-mileage-note">Includes ${money(workerMileagePay(job))} station mileage</span>` : ''}
          </div>
          <span class="worker-earnings-amount">${money(workerNetPayout(job))}</span>
        </article>
      `).join('')}
    </div>
  `;
}

// When a job finished, for the earnings/history buckets. Completion bumps
// updated_at, so it's the reliable timestamp; service_date is the last resort.
function workerJobCompletedAt(job) {
  return job.completed_at || job.updated_at || job.service_date || null;
}

// Desktop-only earnings breakdown: today / this week / this month / all-time,
// each summing the locked per-job payout. The phone keeps its lean Today card;
// the computer view is where a worker reviews their money. `history` is every
// completed job (loadWorkerCompletedHistory).
function renderWorkerEarningsBreakdown(history) {
  const container = document.querySelector('#worker-earnings-breakdown');
  if (!container) return;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay()); // back to Sunday
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const buckets = { today: { sum: 0, n: 0 }, week: { sum: 0, n: 0 }, month: { sum: 0, n: 0 }, all: { sum: 0, n: 0 } };
  history.forEach((job) => {
    const pay = workerNetPayout(job);
    const stamp = workerJobCompletedAt(job);
    const when = stamp ? new Date(stamp) : null;
    buckets.all.sum += pay; buckets.all.n += 1;
    if (when && when >= startOfMonth) { buckets.month.sum += pay; buckets.month.n += 1; }
    if (when && when >= startOfWeek) { buckets.week.sum += pay; buckets.week.n += 1; }
    if (when && when >= startOfToday) { buckets.today.sum += pay; buckets.today.n += 1; }
  });

  const tile = (label, b, lead) => `
    <div class="worker-earn-tile${lead ? ' worker-earn-tile-lead' : ''}">
      <span class="worker-earn-tile-label">${label}</span>
      <span class="worker-earn-tile-value">${money(b.sum)}</span>
      <span class="worker-earn-tile-sub">${b.n} job${b.n === 1 ? '' : 's'}</span>
    </div>`;

  container.innerHTML = `
    <div class="worker-earn-tiles">
      ${tile('Today', buckets.today, true)}
      ${tile('This week', buckets.week)}
      ${tile('This month', buckets.month)}
      ${tile('All time', buckets.all)}
    </div>
    <p class="worker-earn-foot">Net of card processing &middot; each job's pay locks in when it completes.</p>
  `;
}

// Desktop-only completed-job history table (read-only): date, customer/service,
// and the locked payout for each finished job, most recent first.
function renderWorkerJobHistory(history) {
  const container = document.querySelector('#worker-job-history');
  if (!container) return;
  if (!history.length) {
    container.innerHTML = '<div class="worker-state-card worker-state-empty"><p>No completed jobs yet.</p></div>';
    return;
  }
  const LIMIT = 25;
  const rows = history.slice(0, LIMIT).map((job) => {
    const stamp = workerJobCompletedAt(job);
    const dateStr = stamp ? new Date(stamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
    return `
      <tr>
        <td class="worker-hist-date">${escapeHtml(dateStr)}</td>
        <td class="worker-hist-job">
          <strong>${escapeHtml(job.customer_name || 'Customer')}</strong>
          <span class="worker-hist-service">${escapeHtml(job.service_label || job.service_type || '')}</span>
        </td>
        <td class="worker-hist-pay">${money(workerNetPayout(job))}</td>
      </tr>`;
  }).join('');
  container.innerHTML = `
    <table class="worker-hist-table">
      <thead><tr><th>Date</th><th>Job</th><th>Your pay</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${history.length > LIMIT ? `<p class="worker-earn-foot">Showing the ${LIMIT} most recent of ${history.length} completed jobs.</p>` : ''}
  `;
}

// Desktop-only "Upcoming" agenda: claimed jobs dated AFTER today, grouped by
// day, so the worker sees the week ahead. Today's work already lives in the
// Today's Jobs card, so this is forward-only to avoid duplicating it. `jobs` is
// the pendingAccepted list (claimed but not yet started).
function renderWorkerUpcomingSchedule(jobs) {
  const container = document.querySelector('#worker-upcoming-schedule');
  if (!container) return;
  const today = new Date().toISOString().slice(0, 10);
  const future = (jobs || [])
    .filter((job) => job.service_date && job.service_date > today)
    .sort((a, b) => {
      const aKey = `${a.service_date}T${String(a.desired_return_time || '').slice(0, 5)}`;
      const bKey = `${b.service_date}T${String(b.desired_return_time || '').slice(0, 5)}`;
      return aKey.localeCompare(bKey);
    });
  if (!future.length) {
    container.innerHTML = '<div class="worker-state-card worker-state-empty"><h3>No upcoming jobs</h3><p>Future accepted jobs will appear here by service date.</p></div>';
    return;
  }

  // Group by service_date, preserving the sorted order.
  const groups = [];
  future.forEach((job) => {
    let group = groups.find((g) => g.date === job.service_date);
    if (!group) { group = { date: job.service_date, jobs: [] }; groups.push(group); }
    group.jobs.push(job);
  });

  container.innerHTML = groups.map((group) => {
    const rows = group.jobs.map((job) => {
      const vehicle = [job.vehicle_year, job.vehicle_make, job.vehicle_model].filter(Boolean).join(' ');
      const time = job.desired_return_time ? workerFormatScheduleTime(job.desired_return_time) : '';
      return `
        <div class="worker-upcoming-row">
          <span class="worker-upcoming-time">${escapeHtml(time || '—')}</span>
          <div class="worker-upcoming-meta">
            <strong>${escapeHtml(job.customer_name || 'Customer')}</strong>
            <span class="worker-upcoming-sub">${escapeHtml(vehicle || job.service_label || job.service_type || '')}</span>
          </div>
        </div>`;
    }).join('');
    return `
      <div class="worker-upcoming-group">
        <h3 class="worker-upcoming-date">${escapeHtml(workerFormatScheduleDate(group.date))}</h3>
        ${rows}
      </div>`;
  }).join('');
}

// "Tomorrow" / "Mon, Jun 30" header for an upcoming date (YYYY-MM-DD).
function workerFormatScheduleDate(ymd) {
  const d = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 86400000);
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// "2:30 PM" from an HH:MM[:SS] time string.
function workerFormatScheduleTime(hms) {
  const d = new Date(`2000-01-01T${String(hms).slice(0, 8)}`);
  if (Number.isNaN(d.getTime())) return String(hms).slice(0, 5);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// Completed-today summary card: customer, service, completed time, amount charged.
function renderWorkerCompletedCard(request) {
  const when = workerFormatClockTime(request.completed_at || request.updated_at);
  const amount = Number(request.final_total || 0);
  return `
    <article class="worker-card worker-completed-card">
      <div class="worker-card-summary-main">
        <strong>${escapeHtml(request.customer_name || 'Customer')}</strong>
        <span class="worker-card-sub">${escapeHtml(request.service_label || request.service_type || '')}</span>
      </div>
      <div class="worker-completed-meta">
        ${when ? `<span class="worker-card-time">${escapeHtml(when)}</span>` : ''}
        ${amount > 0 ? `<span class="worker-completed-amount">${money(amount)}</span>` : ''}
      </div>
    </article>
  `;
}

function workerProgressStepForStatus(status) {
  const canonical = canonicalBookingStatus(status);
  if (canonical === 'completed') return 6;
  if (canonical === 'cancelled') return 0;
  if (canonical === 'returning') return 5;
  if (canonical === 'in_service') return 4;
  if (canonical === 'en_route') return 3;
  if (canonical === 'assigned') return 1;
  if (canonical === 'new') return 0;
  const returnPhase = ['returned_location_pending', 'return_location_recorded', 'return_photos_needed', 'vehicle_returned', 'inspection_needed', 'inspection_recorded', 'final_payment_processed', 'awaiting_key_return', 'keys_returned', 'return_requested', 'customer_return_requested', 'cancelled_pending_key_return', 'payment_issue', 'authorization_too_low', 'pending_customer_payment'];
  if (returnPhase.includes(status)) return 5;
  const servicePhase = ['service_in_progress', 'fueling_in_progress', 'car_wash_in_progress', 'partial_service_complete', 'fueling_complete', 'car_wash_complete', 'fuel_receipt_uploaded', 'wash_receipt_uploaded', 'service_complete', 'receipts_recorded'];
  if (servicePhase.includes(status)) return 4;
  if (status === 'vehicle_picked_up') return 3;
  if (status === 'key_received') return 2;
  if (status === 'accepted') return 1;
  return 0;
}

function updateWorkerProgressTimeline(myJobs) {
  const line = document.querySelector('.worker-progress-line');
  if (!line) return;
  const spans = Array.from(line.querySelectorAll('.worker-progress-step'));

  const activeJobs = myJobs.filter((job) => isWorkerOpenStatus(job.status) && !['pending', 'request_received'].includes(job.status));
  const activeJob = activeJobs.slice().sort((a, b) => {
    const aKey = `${a.service_date || ''}T${String(a.desired_return_time || '').slice(0, 5)}`;
    const bKey = `${b.service_date || ''}T${String(b.desired_return_time || '').slice(0, 5)}`;
    return aKey.localeCompare(bKey);
  })[0];

  const step = activeJob ? workerProgressStepForStatus(activeJob.status) : 0;
  spans.forEach((span, index) => {
    const stepNumber = index + 1;
    span.classList.remove('complete', 'active');
    if (stepNumber < step) span.classList.add('complete');
    else if (stepNumber === step) span.classList.add('active');
  });

  const jobLabel = document.querySelector('#worker-progress-job-label');
  if (jobLabel) {
    if (activeJob) {
      const vehicle = [activeJob.vehicle_year, activeJob.vehicle_make, activeJob.vehicle_model].filter(Boolean).join(' ');
      jobLabel.textContent = vehicle || activeJob.customer_name || 'Active job';
      jobLabel.dataset.jobId = activeJob.id;
      jobLabel.hidden = false;
    } else {
      jobLabel.hidden = true;
      delete jobLabel.dataset.jobId;
    }
  }
}

function workerUpdateDescription(job) {
  if (job.payment_status === 'captured') return 'Job completed — payout added';
  if (canonicalBookingStatus(job.status) === 'completed') return 'Job completed - payout added';
  return workerStatusLabels[canonicalBookingStatus(job.status)] || job.status || 'Status updated';
}

function workerFormatClockTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function updateWorkerRecentUpdates(myJobs) {
  const list = document.querySelector('.worker-update-list');
  if (!list) return;

  const recent = myJobs
    .filter((job) => job.updated_at)
    .slice()
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .slice(0, 3);

  if (!recent.length) {
    list.innerHTML = '<li class="field-help">No recent activity yet.</li>';
    return;
  }

  list.innerHTML = recent.map((job) => {
    const vehicle = [job.vehicle_year, job.vehicle_make, job.vehicle_model].filter(Boolean).join(' ');
    const description = workerUpdateDescription(job);
    return `
      <li>
        <span>${escapeHtml(description.charAt(0))}</span>
        <strong>${escapeHtml(description)}</strong>
        <small>${escapeHtml(job.customer_name || 'Customer')}${vehicle ? ` &middot; ${escapeHtml(vehicle)}` : ''} &middot; ${escapeHtml(workerFormatClockTime(job.updated_at))}</small>
      </li>
    `;
  }).join('');
}

function updateWorkerOnTimeRate(myJobs) {
  const targets = [document.querySelector('#worker-stat-ontime'), document.querySelector('#worker-current-ontime')].filter(Boolean);
  if (!targets.length) return;

  const completed = myJobs.filter((job) => canonicalBookingStatus(job.status) === 'completed' && job.service_date && job.desired_return_time && job.updated_at);
  if (!completed.length) {
    targets.forEach((el) => { el.textContent = '—'; });
    return;
  }

  const onTimeCount = completed.filter((job) => {
    const deadline = new Date(`${job.service_date}T${String(job.desired_return_time).slice(0, 5)}`);
    const actual = new Date(job.updated_at);
    return actual <= deadline;
  }).length;

  const rate = Math.round((onTimeCount / completed.length) * 100);
  targets.forEach((el) => { el.textContent = `${rate}%`; });
}

// Vertical status tracker for the job-details card. The active step is the phase
// the worker is in right now; earlier steps are marked done.
function renderWorkerVerticalStepper(request) {
  const steps = ['Request accepted', 'Key received', 'Vehicle picked up', 'Service in progress', 'Vehicle returned', 'Complete'];
  const current = workerProgressStepForStatus(request.status);
  return `
    <ol class="worker-vstepper">
      ${steps.map((label, index) => {
        const stepNumber = index + 1;
        const state = stepNumber < current ? 'done' : stepNumber === current ? 'active' : 'upcoming';
        return `
          <li class="worker-vstep is-${state}">
            <span class="worker-vstep-dot">${state === 'done' ? '&#10003;' : stepNumber}</span>
            <span class="worker-vstep-label">${label}</span>
          </li>`;
      }).join('')}
    </ol>
  `;
}

// The read-only reference block (customer / address / service / vehicle / etc.)
// shared by the full job card and the current-job "View full details" panel.
function renderWorkerJobInfoBlock(request, mode) {
  const receiptTotals = receiptTotalsFromNotes(request);
  const workerReceiptTotal = receiptTotals.fuel + receiptTotals.wash;
  return `
    <div class="request-details">
      <p><strong>Customer:</strong> ${escapeHtml(request.customer_name || 'Customer')}</p>
      <p><strong>Phone:</strong> ${request.customer_phone ? escapeHtml(formatPhone(request.customer_phone)) : 'Not provided'}</p>
      <p class="worker-job-address-line"><strong>Service address:</strong> <span class="worker-job-address-value">${escapeHtml(workerFormatAddress(request))}</span></p>
      <p><strong>Parking:</strong> ${[request.parking_location, request.parking_spot ? `spot ${request.parking_spot}` : ''].filter(Boolean).map(escapeHtml).join(', ') || 'Not provided'}</p>
      ${(mode === 'mine' && request.key_handoff_details) ? `<p><strong>Key handoff:</strong> ${escapeHtml(request.key_handoff_details)}</p>` : ''}
      <p><strong>Service:</strong> ${escapeHtml(workerFormatService(request))}</p>
      ${String(request.service_type || '').includes('fuel') ? `<p><strong>Gas station:</strong> ${request.gas_station_name ? `${escapeHtml(request.gas_station_name)}${request.gas_station_address ? ` — ${escapeHtml(request.gas_station_address)}` : ''}${Number(request.gas_station_surcharge) > 0 ? ' <span class="worker-station-pref">(customer preferred)</span>' : ''}` : 'Closest station to the vehicle'}</p>` : ''}
      <p><strong>Vehicle:</strong> ${escapeHtml([request.vehicle_year, request.vehicle_make, request.vehicle_model, request.vehicle_color].filter(Boolean).join(' '))}${request.license_plate ? ` | Plate: ${escapeHtml(request.license_plate)}` : ''}</p>
      ${request.return_parking_location ? `<p><strong>Car location:</strong> ${escapeHtml(request.return_parking_location)}</p>` : ''}
      ${(receiptTotals.fuel || receiptTotals.wash) ? `<p><strong>Receipts entered:</strong> Fuel ${money(receiptTotals.fuel)} | Car wash ${money(receiptTotals.wash)} | Total ${money(workerReceiptTotal)}</p>` : ''}
    </div>
  `;
}

function renderWorkerJobCard(request, mode) {
  const hasReturnRequest = hasCustomerReturnRequestAlert(request);

  return `
    <article class="request-card worker-job-card${mode === 'available' ? ' worker-job-available' : ''}">
      ${mode === 'available' ? `
        <div class="worker-open-badge">
          <span class="worker-open-badge-dot"></span>
          Open &mdash; available for any worker to claim
        </div>
      ` : ''}
      <div class="request-card-header">
        <div>
          <p class="eyebrow">${escapeHtml(formatWorkerJobTime(request))}</p>
          <h3>${escapeHtml(request.customer_name || 'Customer')}</h3>
        </div>
        <span class="status-pill">${escapeHtml(workerStatusLabels[canonicalBookingStatus(request.status)] || canonicalBookingStatus(request.status) || '')}</span>
      </div>
      ${(mode === 'mine' && request.assigned_worker_name && !request.assigned_employee_id) ? `
        <p class="field-help" style="color:#b35900">âš  Assigned by name only â€” worker ID missing.</p>
      ` : ''}
      ${hasReturnRequest ? `
        <div class="return-request-banner">
          <h4>Customer requested vehicle return.</h4>
          <p class="field-help">Return vehicle as soon as safely possible.</p>
        </div>
      ` : ''}
      ${mode === 'mine' ? renderWorkerVerticalStepper(request) : ''}
      <details class="worker-job-details"${mode === 'available' ? ' open' : ''}>
        <summary>Job details</summary>
        ${renderWorkerJobInfoBlock(request, mode)}
      </details>
      ${mode === 'available' ? `
        <button class="button primary claim-worker-job" data-id="${escapeHtml(request.id)}" type="button">Claim job</button>
      ` : renderWorkerJobActions(request)}
    </article>
  `;
}

function workerPrimaryStatusButton(request, label, status) {
  return `<button class="button primary worker-update-status" data-id="${escapeHtml(request.id)}" data-status="${escapeHtml(status)}" type="button">${escapeHtml(label)}</button>`;
}

function workerOpenFuelCardButton() {
  return `<button class="button secondary worker-open-fuel-card" type="button">Open virtual card</button>`;
}

// In-app navigation to the gas station for the fuel service drive. No
// worker-start-nav class here — that's the en-route gate; this only opens the map
// (data-route-map), so it never re-runs the "started"/GPS-start logic.
function workerNavStationButton(request, primary = false) {
  return `<button class="button ${primary ? 'primary' : 'secondary'}" data-route-map data-route-dest="station" data-id="${escapeHtml(request.id)}" type="button">Navigate to gas station</button>`;
}

// In-app navigation back to the car's exact pickup spot for the return drive (mirror
// of the station button). data-route-dest="return" → arriving auto-marks the vehicle
// returned. Routes to the captured pickup_coords spot, falling back to the address.
function workerNavReturnButton(request, primary = false) {
  return `<button class="button ${primary ? 'primary' : 'secondary'}" data-route-map data-route-dest="return" data-id="${escapeHtml(request.id)}" type="button">Navigate back to drop the car</button>`;
}

// In-app navigation to the car wash (The Car Spa). data-route-dest="wash" → arriving
// auto-starts the service, same as the gas-station leg.
function workerNavWashButton(request, primary = false) {
  return `<button class="button ${primary ? 'primary' : 'secondary'}" data-route-map data-route-dest="wash" data-id="${escapeHtml(request.id)}" type="button">Navigate to car wash</button>`;
}

// Navigation back to where the worker met the customer (handoff_coords), so they can
// return the keys at the same spot. Only shown once that spot was captured.
function workerNavHandoffButton(request) {
  const hasKeyPickup = Number.isFinite(Number(request.key_pickup_lat))
    || /\[(handoff_coords|key_pickup_location) /.test(String(request.notes || ''));
  if (!hasKeyPickup) return '';
  return `<button class="button secondary" data-route-map data-route-dest="handoff" data-id="${escapeHtml(request.id)}" type="button">Navigate to meet the customer</button>`;
}

// No "Back" in the worker card by design: once a job starts it can't be undone, so
// the status-rewind helpers were removed entirely. The only way to release a job is
// "Send back to open pool", and only before it's accepted/started.

function filePicker(label, className, extraAttributes = '', accept = 'image/*') {
  return `
    <label class="file-button-control">
      <span>${escapeHtml(label)}</span>
      <input class="${className}" ${extraAttributes} type="file" accept="${accept}" capture="environment">
      <span class="button primary file-button-text">Take photo</span>
      <span class="selected-file-name">No photo yet</span>
    </label>
  `;
}

// Inspection now happens at pickup; it's detected by its note (the status no
// longer carries it). Mirrors how receipts/coords are read from notes.
function hasInspectionRecorded(request) {
  return /Quick inspection recorded/i.test(String(request?.notes || ''));
}

function renderWorkerJobActions(request) {
  const actions = [];
  let activePanel = '';
  let nextAction = '';
  const cleanStatus = canonicalBookingStatus(request.status);
  // Defer a return-request while the worker is actively mid-service — they finish
  // and record the in-progress service first; the cancel surfaces once it's done.
  const hasReturnRequest = isActiveCustomerReturnWorkflow(request) && !workerCancelDeferredMidService(request);

  if (hasReturnRequest) {
    const returnBanner = `
      <div class="return-request-banner">
        <h4>Customer requested vehicle return.</h4>
        <p class="field-help">Return vehicle as soon as safely possible.</p>
      </div>
    `;
    if (!hasPickupPhotoSet(request)) {
      nextAction = 'Upload pickup photos if you reached the vehicle, or bypass them if you never got to the car.';
      activePanel = returnBanner + renderWorkerPhotoPanel(request, 'pickup') + renderWorkerPickupBypassPanel(request);
    } else if (request.status === 'fueling_complete') {
      nextAction = `Finish recording the fuel receipt, then return the vehicle.`;
      activePanel = returnBanner + renderWorkerReceiptPanel(request, 'fuel');
    } else if (request.status === 'car_wash_complete') {
      nextAction = `Finish recording the car wash receipt, then return the vehicle.`;
      activePanel = returnBanner + renderWorkerReceiptPanel(request, 'wash');
    } else if (hasPickupPhotoSet(request) && !hasDropoffPhotoSet(request) && request.status !== 'vehicle_returned') {
      nextAction = 'Pickup photos were taken. Record where the vehicle was returned, then upload return photos.';
      activePanel = returnBanner + (request.return_parking_location
        ? renderWorkerPhotoPanel(request, 'dropoff')
        : renderWorkerReturnLocationPanel(request));
    } else if (request.status === 'vehicle_returned' || hasDropoffPhotoSet(request)) {
      nextAction = 'Confirm saved totals, then proceed to key return. The return charge is processed when keys are marked returned.';
      activePanel = returnBanner + renderWorkerCompletePanel(request);
    } else {
      nextAction = 'Return vehicle as soon as safely possible.';
      activePanel = returnBanner + (request.return_parking_location
        ? renderWorkerPhotoPanel(request, 'dropoff')
        : renderWorkerReturnLocationPanel(request));
    }
  } else if (cleanStatus === 'new') {
    nextAction = 'Accept the request to begin service.';
    actions.push(workerPrimaryStatusButton(request, 'Accept request', 'assigned'));
  } else if (cleanStatus === 'assigned') {
    if (!workerHasStarted(request)) {
      // Phase 1 — before starting: one clear action (Start). Tapping it opens the
      // route map AND begins sharing location, which the customer sees as "on the
      // way". Key received only appears after they've started.
      nextAction = 'Tap Start to open the route to the vehicle. Can\'t make it? Send the job back to the open pool.';
      actions.push(`<button class="button primary worker-start-nav" data-route-map data-id="${escapeHtml(request.id)}" type="button">Start — open map</button>`);
      actions.push(`<button class="button danger worker-release-job" data-id="${escapeHtml(request.id)}" type="button">Send back to open pool</button>`);
    } else {
      // Phase 2 — en route: the customer can see you're on the way. Now the main
      // action is confirming the key/handoff. Map stays reachable via "Open map".
      nextAction = 'You\'re on the way — the customer can see you\'re en route. When you have the key/handoff, tap Key received.';
      actions.push(`<button class="button primary worker-update-status" data-id="${escapeHtml(request.id)}" data-status="en_route" type="button">Key received</button>`);
      actions.push(`<button class="button secondary worker-start-nav" data-route-map data-id="${escapeHtml(request.id)}" type="button">Open map</button>`);
      actions.push(`<button class="button danger worker-release-job" data-id="${escapeHtml(request.id)}" type="button">Send back to open pool</button>`);
    }
  } else if (cleanStatus === 'en_route') {
    nextAction = 'Upload the pickup photo set below.';
    activePanel = renderWorkerPhotoPanel(request, 'pickup');
  } else if (cleanStatus === 'in_service') {
    // Gateway: worker confirms they are beginning the service.
    // The customer tracker advances to "Service in progress" after this click.
    if (request.quick_inspection && !hasInspectionRecorded(request)) {
      // Inspection happens at pickup now (before driving to any service). Once it's
      // recorded, this branch falls through to the first service drive.
      nextAction = 'Inspect the vehicle at pickup before driving to service.';
      activePanel = renderWorkerInspectionPanel(request);
    } else if (serviceNeedsWash(request)) {
      // Car wash first (covers wash-only AND fuel+wash combos).
      nextAction = 'Drive to the car wash — service starts automatically when you arrive.';
      actions.push(workerNavWashButton(request, true));
      actions.push(`<button class="button secondary worker-update-status" data-id="${escapeHtml(request.id)}" data-status="in_service" type="button">Start service</button>`);
    } else if (serviceNeedsFuel(request)) {
      // Fuel-only job: drive to the gas station.
      nextAction = 'Drive to the gas station — service starts automatically when you arrive.';
      actions.push(workerNavStationButton(request, true));
      actions.push(`<button class="button secondary worker-update-status" data-id="${escapeHtml(request.id)}" data-status="in_service" type="button">Start service</button>`);
    } else {
      nextAction = 'Start the requested service.';
      actions.push(workerPrimaryStatusButton(request, 'Start service', 'in_service'));
    }
  } else if (cleanStatus === 'returning') {
    nextAction = request.return_parking_location ? 'Upload the return photo set.' : 'Record where the vehicle was returned before return photos.';
    activePanel = request.return_parking_location ? renderWorkerPhotoPanel(request, 'dropoff') : renderWorkerReturnLocationPanel(request);
  } else if (request.status === 'service_in_progress') {
    // One service at a time: car wash first for combo jobs, then fuel.
    if (serviceNeedsWash(request) && !serviceDoneOrUnable(request, 'wash')) {
      nextAction = 'Complete the car wash.';
      actions.push(workerOpenFuelCardButton());
      actions.push(workerPrimaryStatusButton(request, `Wash complete â€” ${request.wash_package_label || 'selected wash'}`, 'car_wash_complete'));
      actions.push(workerServiceUnableButton(request, 'wash'));
      actions.push(workerNavWashButton(request));
    } else if (serviceNeedsFuel(request) && !serviceDoneOrUnable(request, 'fuel')) {
      nextAction = 'Complete the fuel service.';
      actions.push(workerOpenFuelCardButton());
      actions.push(workerPrimaryStatusButton(request, `Fuel complete â€” ${request.fuel_type || 'fuel'}`, 'fueling_complete'));
      actions.push(workerServiceUnableButton(request, 'fuel'));
      actions.push(workerNavStationButton(request));
    }
  } else if (request.status === 'fueling_complete') {
    nextAction = `Upload the fuel receipt and enter the total for ${request.fuel_type || 'the selected fuel type'}.`;
    activePanel = renderWorkerReceiptPanel(request, 'fuel');
    actions.push(workerServiceUnableButton(request, 'fuel'));
  } else if (request.status === 'car_wash_complete') {
    nextAction = `Upload the car wash receipt and enter the total for ${request.wash_package_label || 'the selected wash'}.`;
    activePanel = renderWorkerReceiptPanel(request, 'wash');
    actions.push(workerServiceUnableButton(request, 'wash'));
  } else if (request.status === 'fuel_receipt_uploaded' && serviceNeedsWash(request) && !serviceDoneOrUnable(request, 'wash')) {
    nextAction = 'Drive to the car wash and complete it.';
    actions.push(workerOpenFuelCardButton());
    actions.push(workerPrimaryStatusButton(request, `Wash complete â€” ${request.wash_package_label || 'selected wash'}`, 'car_wash_complete'));
    actions.push(workerServiceUnableButton(request, 'wash'));
    actions.push(workerNavWashButton(request));
  } else if (request.status === 'wash_receipt_uploaded' && serviceNeedsFuel(request) && !serviceDoneOrUnable(request, 'fuel')) {
    nextAction = 'Drive to the gas station and complete the fuel service.';
    actions.push(workerOpenFuelCardButton());
    actions.push(workerPrimaryStatusButton(request, `Fuel complete â€” ${request.fuel_type || 'fuel'}`, 'fueling_complete'));
    actions.push(workerServiceUnableButton(request, 'fuel'));
    actions.push(workerNavStationButton(request));
  } else if (request.status === 'receipts_recorded' || request.status === 'service_complete') {
    // Service + receipt entry done — drive the car back. Same for fuel, car wash,
    // OR combo: the worker always drove the vehicle to a facility (gas station /
    // The Car Spa), so it always needs the navigated return. Nav auto-marks
    // arrival at the service address; the manual button stays as a fallback.
    // ('service_complete' is only reachable by jobs created before this change.)
    nextAction = 'Drive the vehicle back to the service address — it marks returned automatically when you arrive.';
    actions.push(workerNavReturnButton(request, true));
    actions.push(`<button class="button secondary worker-update-status" data-id="${escapeHtml(request.id)}" data-status="returned_location_pending" type="button">I'm back at the service address</button>`);
  } else if (request.status === 'returned_location_pending') {
    nextAction = 'Record where the vehicle was returned before return photos.';
    activePanel = renderWorkerReturnLocationPanel(request);
  } else if (request.status === 'return_location_recorded') {
    nextAction = 'Upload the return photo set.';
    actions.push(workerPrimaryStatusButton(request, 'Return photos', 'return_photos_needed'));
  } else if (request.status === 'return_photos_needed') {
    nextAction = 'Upload the return photo set below.';
    activePanel = renderWorkerPhotoPanel(request, 'dropoff');
  } else if (request.status === 'vehicle_returned') {
    // Car is back → drive to meet the customer for keys (auto-opens after the last
    // return photo). The final step confirms totals, documents who got the keys,
    // and captures payment + completes — all in one.
    nextAction = 'Return the keys to the customer, then capture payment to finish.';
    activePanel = renderWorkerFinalKeysPanel(request);
  } else if (request.status === 'inspection_needed') {
    nextAction = 'Complete the vehicle inspection below.';
    activePanel = renderWorkerInspectionPanel(request);
  } else if (request.status === 'inspection_recorded') {
    nextAction = 'Confirm the saved totals, then capture the final payment automatically.';
    activePanel = renderWorkerCompletePanel(request);
  } else if (request.status === 'awaiting_key_return') {
    nextAction = 'Return the customer\'s keys and document who received them.';
    const handoffNav = workerNavHandoffButton(request);
    if (handoffNav) actions.push(handoffNav);
    activePanel = renderWorkerKeysReturnedPanel(request);
  } else if (request.status === 'payment_issue' || request.status === 'authorization_too_low') {
    nextAction = 'The customer is updating their payment method. No action needed from you right now.';
  } else if (request.status === 'cancelled_pending_key_return') {
    nextAction = 'Customer cancelled this request. Return the key/vehicle before closing this request.';
    actions.push(`<button class="button primary confirm-cancellation-return" data-id="${escapeHtml(request.id)}" type="button">Confirm Key/Vehicle Returned</button>`);
  }

  // No Back buttons anywhere — the job flow is strictly forward. Backing into an
  // already-completed step used to strand the worker with no way to continue.

  // The labelled "Next action" box is dropped on steps that already have a button
  // or an input panel (the action speaks for itself). It only survives as a plain
  // fallback message for passive statuses with nothing else to show, so a step is
  // never blank.
  const showNote = nextAction && !actions.length && !activePanel;
  const hasAction = Boolean(activePanel) || actions.length > 0;
  return `
    <div class="worker-job-actions-area">
      ${activePanel}
      <div class="guided-step">
        ${showNote ? `<p class="next-action-label">${escapeHtml(nextAction)}</p>` : ''}
        ${actions.length ? `<div class="admin-button-row">${actions.join('')}</div>` : ''}
      </div>
      ${renderWorkerServiceUnablePanel(request)}
    </div>
    ${hasAction ? `<p class="worker-desktop-act-note"><span aria-hidden="true">&#128241;</span> Open the ShiftFuel app on your phone to act on this job — the computer view is read-only.</p>` : ''}
  `;
}

function workerServiceUnableButton(request, type) {
  const label = type === 'fuel' ? "Can't complete fuel" : "Can't complete wash";
  return `<button class="button danger show-service-unable" data-id="${escapeHtml(request.id)}" data-service-type="${escapeHtml(type)}" type="button">${label}</button>`;
}

const WORKER_DENY_REASON_OPTIONS = [
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

function workerDenyReasonOptionsHtml() {
  return `<option value="">â€” Select a reason â€”</option>` +
    WORKER_DENY_REASON_OPTIONS.map(r => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('');
}

function renderWorkerServiceUnablePanel(request) {
  return `
    <div class="service-unable-panel" data-service-unable-for="${escapeHtml(request.id)}" hidden>
      <h4>Reason service cannot be completed</h4>
      <p class="field-help service-unable-label"></p>
      <label>
        Reason
        <select class="service-unable-reason">
          ${workerDenyReasonOptionsHtml()}
        </select>
      </label>
      <label class="service-unable-other-wrap" style="display:none">
        Describe the reason
        <textarea class="service-unable-other" rows="2" placeholder="Describe the service issue."></textarea>
      </label>
      <label class="checkbox-label">
        <input class="service-unable-charge-fee" type="checkbox">
        <span>Charge the service fee anyway (e.g. work was attempted). No fuel/wash cost is ever charged when there's no receipt â€” leave unchecked to waive the fee entirely.</span>
      </label>
      <div class="admin-button-row">
        <button class="button danger save-service-unable" data-id="${escapeHtml(request.id)}" type="button">Save reason</button>
        <button class="button secondary cancel-service-unable" type="button">Keep service active</button>
      </div>
    </div>
  `;
}

function renderWorkerPhotoPanel(request, stage = 'pickup') {
  const isDropoff = stage === 'dropoff';
  const heading = isDropoff ? 'Upload return photos' : 'Upload pickup photos';
  const help = isDropoff
    ? 'Take each photo as prompted — all four sides after return, then the odometer and ending fuel gauge. Do not reuse pickup photos.'
    : 'Take each photo as prompted — all four sides at pickup, then the odometer and fuel gauge — before moving the vehicle.';
  const nextStatus = isDropoff ? 'returning' : 'in_service';
  const prefix = isDropoff ? 'dropoff' : 'pickup';

  // One tile at a time, walking around the vehicle: front-driver → front-passenger
  // → rear-passenger → rear-driver, then odometer and fuel gauge.
  const steps = [
    { label: 'Driver side front',    type: `${prefix}_driver_front` },
    { label: 'Passenger side front', type: `${prefix}_passenger_front` },
    { label: 'Passenger side rear',  type: `${prefix}_passenger_rear` },
    { label: 'Driver side rear',     type: `${prefix}_driver_rear` },
    { label: `${isDropoff ? 'Return' : 'Pickup'} odometer`,   type: `${prefix}_odometer` },
    { label: `${isDropoff ? 'Ending' : 'Pickup'} fuel gauge`, type: isDropoff ? 'dropoff_fuel_gauge' : 'pickup_fuel_gauge' },
  ];
  // Return photos run in reverse of pickup: start at the fuel gauge, end at driver
  // side front (the worker walks the car the opposite way on the way out).
  if (isDropoff) steps.reverse();

  const stepsHtml = steps.map((s, i) => `
    <div class="photo-wizard-step${i === 0 ? ' is-current' : ''}" data-step="${i}" data-step-label="${escapeHtml(s.label)}">
      <p class="photo-wizard-step-label">${escapeHtml(s.label)}</p>
      ${filePicker(s.label, 'photo-file required-photo', `data-photo-type="${s.type}"`)}
      <span class="photo-wizard-done-tag">Photo added &#10003; <button type="button" class="photo-wizard-retake">Retake</button></span>
    </div>`).join('');

  return `
    <div class="photo-panel photo-wizard" data-panel-for="${escapeHtml(request.id)}" data-next-status="${nextStatus}" data-photo-stage="${stage}">
      <h4>${heading}</h4>
      <p class="field-help">${help}</p>
      <p class="photo-wizard-progress" data-photo-progress>Photo 1 of ${steps.length} &middot; ${escapeHtml(steps[0].label)}</p>
      <div class="photo-wizard-steps">
        ${stepsHtml}
      </div>
      <p class="field-help duplicate-photo-warning" data-warning-for="${escapeHtml(request.id)}"></p>
      <button class="button primary upload-action-button upload-photo-set" data-id="${escapeHtml(request.id)}" type="button" hidden>Upload all photos</button>
    </div>
  `;
}

// Advance the photo wizard: mark each tile with a chosen file as done, surface the
// first still-empty tile as current, and reveal the Upload button only once every
// tile has a photo. Files stay staged until that final batch upload.
function advanceWorkerPhotoWizard(panel) {
  const steps = Array.from(panel.querySelectorAll('.photo-wizard-step'));
  if (!steps.length) return;
  const total = steps.length;
  const hasFile = (step) => !!step.querySelector('.required-photo')?.files?.[0];
  steps.forEach((step) => {
    step.classList.toggle('is-done', hasFile(step));
    step.classList.remove('is-current');
  });
  const nextStep = steps.find((step) => !hasFile(step));
  const progress = panel.querySelector('[data-photo-progress]');
  const uploadBtn = panel.querySelector('.upload-photo-set');
  if (nextStep) {
    nextStep.classList.add('is-current');
    if (progress) progress.textContent = `Photo ${steps.indexOf(nextStep) + 1} of ${total} · ${nextStep.dataset.stepLabel || ''}`;
    if (uploadBtn) uploadBtn.hidden = true;
  } else {
    if (progress) progress.textContent = `All ${total} photos added — tap Upload to continue.`;
    if (uploadBtn) uploadBtn.hidden = false;
  }
}

function renderWorkerPickupBypassPanel(request) {
  return `
    <div class="return-request-banner pickup-bypass-panel" data-bypass-pickup-for="${escapeHtml(request.id)}">
      <h4>Cannot take pickup photos?</h4>
      <p class="field-help">Use this only if you never reached the vehicle. The request will move to key return without pickup or return photos.</p>
      <button class="button secondary bypass-pickup-photos" data-id="${escapeHtml(request.id)}" type="button">Bypass pickup photos - never reached vehicle</button>
      <p class="pickup-bypass-status form-status"></p>
    </div>
  `;
}

function renderWorkerReceiptPanel(request, mode = 'all') {
  const isFuelMode = mode === 'fuel';
  const isWashMode = mode === 'wash';
  const receiptTotals = receiptTotalsFromNotes(request);
  // If more services remain after this receipt, stage to the intermediate upload status.
  // If this is the last service, go straight to receipts_recorded (drive the car back).
  // There is no separate "confirm receipts" gate here — the single confirmation happens
  // once at the very end, together with Complete & Capture Payment.
  const nextStatus = isFuelMode
    ? serviceNeedsWash(request) && !serviceDoneOrUnable(request, 'wash') ? 'fuel_receipt_uploaded' : 'receipts_recorded'
    : isWashMode
      ? serviceNeedsFuel(request) && !serviceDoneOrUnable(request, 'fuel') ? 'wash_receipt_uploaded' : 'receipts_recorded'
      : 'receipts_recorded';

  return `
    <div class="receipt-panel" data-receipt-for="${escapeHtml(request.id)}">
      <h4>Record receipt and total</h4>
      <p class="field-help">Upload the receipt and enter the service total. Convenience fees are added automatically.</p>
      <div class="admin-money-grid">
        ${serviceNeedsFuel(request) && (isFuelMode || mode === 'all') ? filePicker('Fuel receipt upload', 'fuel-receipt-file', '', 'image/*,application/pdf') : ''}
        ${serviceNeedsFuel(request) && (isFuelMode || mode === 'all') ? `<label>Fuel receipt amount
          <input class="fuel-receipt-total" type="number" min="0" step="0.01" value="${receiptTotals.fuel || ''}" placeholder="50.00">
        </label>` : ''}
        ${serviceNeedsWash(request) && (isWashMode || mode === 'all') ? filePicker('Car wash receipt upload', 'wash-receipt-file', '', 'image/*,application/pdf') : ''}
        ${serviceNeedsWash(request) && (isWashMode || mode === 'all') ? `<label>Car wash receipt amount
          <input class="wash-receipt-total" type="number" min="0" step="0.01" value="${receiptTotals.wash || ''}" placeholder="50.00">
        </label>` : ''}
      </div>
      <button class="button primary save-final-total" data-id="${escapeHtml(request.id)}" data-receipt-mode="${mode}" data-next-status="${nextStatus}" type="button">Save receipt and total</button>
    </div>
  `;
}

function renderWorkerReturnLocationPanel(request) {
  const customerParking = [request.parking_location, request.parking_spot ? `spot ${request.parking_spot}` : ''].filter(Boolean).join(', ');
  const returnLocation = request.return_parking_location || customerParking;

  return `
    <div class="return-location-panel" data-return-for="${escapeHtml(request.id)}">
      <h4>Car Location</h4>
      <p class="field-help">Record exactly where you left the vehicle after service.</p>
      <div class="field-grid">
        <label>
          <input class="return-parking-location" type="text" value="${escapeHtml(returnLocation)}" placeholder="Example: Lot F, space F-19">
        </label>
      </div>
        <button class="button primary save-return-location" data-id="${escapeHtml(request.id)}" type="button">Record return location</button>
    </div>
  `;
}

function renderWorkerInspectionPanel(request) {
  const psiGuide = psiGuideForRequest(request);
  const frontPsi = psiGuide?.front || '';
  const rearPsi = psiGuide?.rear || '';
  const guideText = psiGuide
    ? `Recommended PSI for ${request.vehicle_year || ''} ${request.vehicle_make || ''} ${request.vehicle_model || ''}: front ${frontPsi}, rear ${rearPsi}. Confirm against the door-jamb sticker if available.`
    : `No PSI guide found yet for ${request.vehicle_year || ''} ${request.vehicle_make || ''} ${request.vehicle_model || ''}. Enter the door-jamb sticker pressure if available.`;

  const suggested = frontPsi !== '' ? String(frontPsi) : '';
  const echoInit = suggested || '—';
  const TOTAL_STEPS = 6;
  // One tire step: the pressure the worker set + a live echo of the confirmed
  // door-jamb number so they can match each tire to spec. Shown one at a time
  // (like the pickup-photo flow) — fill it, tap Next, the following tire appears.
  const tireStep = (idx, label, cls) => `
    <div class="inspection-step" data-step="${idx}" hidden>
      <p class="inspection-step-count">Step ${idx + 1} of ${TOTAL_STEPS}</p>
      <label>${label} — pressure set (PSI)
        <input class="${cls}" type="number" min="0" step="1" inputmode="numeric" placeholder="${escapeHtml(suggested || '35')}">
      </label>
      <p class="field-help inspection-doorjamb-ref">Door-jamb target: <strong class="doorjamb-echo">${escapeHtml(echoInit)}</strong> PSI</p>
      <div class="inspection-step-nav">
        <button class="button secondary inspection-back" type="button">Back</button>
        <button class="button primary inspection-next" type="button">Next</button>
      </div>
    </div>`;

  return `
    <div class="inspection-panel" data-inspection-for="${escapeHtml(request.id)}" data-step-current="0">
      <h4>Quick vehicle inspection</h4>
      <p class="field-help psi-guide-note">${escapeHtml(guideText.replace(/\s+/g, ' ').trim())}</p>

      <div class="inspection-step" data-step="0">
        <p class="inspection-step-count">Step 1 of ${TOTAL_STEPS}</p>
        <label>Confirm door-jamb PSI (read it off the driver-door sticker)
          <input class="inspection-doorjamb" type="number" min="0" step="1" inputmode="numeric" value="${escapeHtml(suggested)}" placeholder="35">
        </label>
        <div class="inspection-step-nav">
          <button class="button primary inspection-next" type="button">Start tires</button>
        </div>
      </div>

      ${tireStep(1, 'Driver front tire', 'inspection-tire-df')}
      ${tireStep(2, 'Passenger front tire', 'inspection-tire-pf')}
      ${tireStep(3, 'Passenger rear tire', 'inspection-tire-pr')}
      ${tireStep(4, 'Driver rear tire', 'inspection-tire-dr')}

      <div class="inspection-step" data-step="5" hidden>
        <p class="inspection-step-count">Step 6 of ${TOTAL_STEPS}</p>
        <label>Diagnosis code
          <input class="inspection-trouble-code" type="text" placeholder="P0304">
        </label>
        <div class="trouble-code-output" aria-live="polite">
          <p class="field-help">Type a code to preview what the customer will see.</p>
        </div>
        <label class="checkbox-label">
          <input class="inspection-washer-fluid" type="checkbox">
          <span>Checked / filled windshield washer fluid</span>
        </label>
        <div class="inspection-step-nav">
          <button class="button secondary inspection-back" type="button">Back</button>
          <button class="button primary save-inspection" data-id="${escapeHtml(request.id)}" type="button">Save inspection details</button>
        </div>
      </div>
    </div>
  `;
}

// Walk the quick-inspection wizard one field per screen: door-jamb PSI, then each
// tire, then the diagnosis code. A pressure reading is required before leaving a
// PSI step so an inspection can't be saved half-empty.
function advanceInspectionStep(button) {
  const panel = button.closest('.inspection-panel');
  if (!panel) return;
  const steps = Array.from(panel.querySelectorAll('.inspection-step'));
  if (!steps.length) return;
  const current = Number(panel.dataset.stepCurrent || 0);
  const goingNext = button.classList.contains('inspection-next');

  if (goingNext) {
    const psiInput = steps[current]?.querySelector(
      '.inspection-doorjamb, .inspection-tire-df, .inspection-tire-pf, .inspection-tire-pr, .inspection-tire-dr'
    );
    if (psiInput && !(Number(psiInput.value) > 0)) {
      alert('Enter the PSI reading for this step before continuing.');
      psiInput.focus();
      return;
    }
  }

  const next = goingNext
    ? Math.min(current + 1, steps.length - 1)
    : Math.max(current - 1, 0);
  steps.forEach((step, idx) => { step.hidden = idx !== next; });
  panel.dataset.stepCurrent = String(next);
  const focusTarget = steps[next]?.querySelector('input:not([type="checkbox"])');
  if (focusTarget) focusTarget.focus();
}

// Receipt-confirmation panel shown at service_complete.
// Worker reviews totals and clicks "Receipts recorded" â†’ advances to receipts_recorded.
// Does NOT capture payment â€” that happens later at vehicle_returned/inspection_recorded.
function renderWorkerCompletePanel(request) {
  const receiptTotals = receiptTotalsFromNotes(request);
  const workerReceiptTotal = receiptTotals.fuel + receiptTotals.wash;
  const hasReceiptTotals = workerReceiptTotal > 0;
  const isReturnWorkflow = hasCustomerReturnRequestAlert(request);
  const needsPaymentCapture = request.payment_intent_id && request.payment_status !== 'captured' && !isReturnWorkflow;
  const primaryClass = needsPaymentCapture ? 'send-to-customer-payment' : 'complete-request';
  const primaryLabel = isReturnWorkflow
    ? hasReceiptTotals ? 'Confirm totals & proceed to key return' : 'Proceed to key return'
    : needsPaymentCapture ? 'Complete & Capture Payment' : 'Complete request';
  const returnWorkflowHelp = hasReceiptTotals
    ? 'Customer requested vehicle return. Confirm the saved receipt totals here; the return charge is processed when keys are marked returned.'
    : 'Customer requested vehicle return. No receipts are recorded; the $15 cancellation/service amount is processed when keys are marked returned.';

  return `
    <div class="complete-panel" data-complete-for="${escapeHtml(request.id)}">
      <h4>Confirm before completing</h4>
      ${isReturnWorkflow ? `<p class="field-help">${returnWorkflowHelp}</p>` : ''}
      <div class="request-details">
        ${serviceNeedsFuel(request) ? `<p><strong>Fuel receipt total:</strong> ${money(receiptTotals.fuel)}</p>` : ''}
        ${serviceNeedsWash(request) ? `<p><strong>Car wash receipt total:</strong> ${money(receiptTotals.wash)}</p>` : ''}
        <p><strong>Receipt total entered:</strong> ${money(workerReceiptTotal)}</p>
      </div>
      <label class="checkbox-label">
        <input class="confirm-complete-totals" type="checkbox">
        <span>I confirm the saved receipt totals are correct.</span>
      </label>
      <div class="admin-button-row">
        <button class="button primary ${primaryClass}" data-id="${escapeHtml(request.id)}" type="button">${primaryLabel}</button>
        ${serviceNeedsFuel(request) ? `<button class="button secondary show-total-edit" data-id="${escapeHtml(request.id)}" data-edit-total="fuel" type="button">Fuel Incorrect</button>` : ''}
        ${serviceNeedsWash(request) ? `<button class="button secondary show-total-edit" data-id="${escapeHtml(request.id)}" data-edit-total="wash" type="button">Car Wash Incorrect</button>` : ''}
      </div>
      <div class="total-edit-panel" data-total-edit-for="${escapeHtml(request.id)}" hidden></div>
    </div>
  `;
}

function renderWorkerKeysReturnedPanel(request) {
  const customerName = escapeHtml(request.customer_name || 'Customer');
  return `
    <div class="keys-returned-panel" data-keys-for="${escapeHtml(request.id)}">
      <h4>Keys returned</h4>
      <p class="field-help">Document who the customer's keys were returned to.</p>
      <label>
        Keys returned to
        <select class="key-returned-to-type">
          <option value="">Select recipient</option>
          <option value="customer">Customer â€” ${customerName}</option>
          <option value="other">Other person or location</option>
        </select>
      </label>
      <label class="key-returned-other-wrap" hidden>
        Person or location
        <input class="key-returned-other-name" type="text" placeholder="e.g. Security desk, Front desk, Ashley Smith">
      </label>
      <div class="admin-button-row">
        <button class="button primary worker-submit-keys-returned" data-id="${escapeHtml(request.id)}" type="button">Keys returned</button>
      </div>
      <p class="keys-returned-status form-status"></p>
    </div>
  `;
}

// Final step of a normal job: at the key hand-off, confirm the receipt totals,
// document who got the keys, and capture payment — all together. Carries the
// .complete-panel class so the existing capture validation/handlers work on it.
function renderWorkerFinalKeysPanel(request) {
  const receiptTotals = receiptTotalsFromNotes(request);
  const customerName = escapeHtml(request.customer_name || 'Customer');
  return `
    <div class="complete-panel keys-final-panel" data-complete-for="${escapeHtml(request.id)}" data-keys-for="${escapeHtml(request.id)}">
      <h4>Return keys &amp; finish</h4>
      <p class="field-help">Confirm the totals, note who got the keys, then capture payment to complete the job.</p>
      <div class="request-details">
        ${serviceNeedsFuel(request) ? `<p><strong>Fuel receipt total:</strong> ${money(receiptTotals.fuel)}</p>` : ''}
        ${serviceNeedsWash(request) ? `<p><strong>Car wash receipt total:</strong> ${money(receiptTotals.wash)}</p>` : ''}
      </div>
      <label class="checkbox-label">
        <input class="confirm-complete-totals" type="checkbox">
        <span>I confirm the saved receipt totals are correct.</span>
      </label>
      <label>Keys returned to
        <select class="key-returned-to-type">
          <option value="">Select recipient</option>
          <option value="customer">Customer - ${customerName}</option>
          <option value="other">Other person or location</option>
        </select>
      </label>
      <label class="key-returned-other-wrap" hidden>
        Person or location
        <input class="key-returned-other-name" type="text" placeholder="e.g. Security desk, Front desk, Ashley Smith">
      </label>
      <div class="admin-button-row">
        <button class="button primary worker-keys-capture" data-id="${escapeHtml(request.id)}" type="button">Capture payment &amp; finish</button>
        ${serviceNeedsFuel(request) ? `<button class="button secondary show-total-edit" data-id="${escapeHtml(request.id)}" data-edit-total="fuel" type="button">Fuel Incorrect</button>` : ''}
        ${serviceNeedsWash(request) ? `<button class="button secondary show-total-edit" data-id="${escapeHtml(request.id)}" data-edit-total="wash" type="button">Car Wash Incorrect</button>` : ''}
      </div>
      <div class="total-edit-panel" data-total-edit-for="${escapeHtml(request.id)}" hidden></div>
      <p class="keys-returned-status form-status"></p>
    </div>
  `;
}

// Final "Keys returned" action: document the recipient, then run the existing,
// tested capture (or no-capture) path which validates totals + inspection and
// completes the job.
async function workerKeysCapture(button) {
  const id = button.dataset.id;
  const request = allWorkerJobs.find((item) => item.id === id);
  const panel = button.closest('.keys-final-panel');
  if (!request || !panel) return;
  const type = panel.querySelector('.key-returned-to-type')?.value;
  const otherName = (panel.querySelector('.key-returned-other-name')?.value || '').trim();
  if (!type) { alert('Select who the keys were returned to.'); return; }
  if (type === 'other' && !otherName) { alert('Enter who or where the keys were returned to.'); return; }
  const recipient = type === 'customer' ? `the customer (${request.customer_name || 'customer'})` : otherName;
  if (!/\[keys_returned\b/.test(String(request.notes || ''))) {
    const note = `[keys_returned] Keys returned to ${recipient}.`;
    request.notes = request.notes ? `${request.notes}\n${note}` : note;
  }
  const needsCapture = request.payment_intent_id && request.payment_status !== 'captured';
  if (needsCapture) await sendWorkerToCustomerPayment(button);
  else await completeWorkerRequest(button);
}

function renderWorkerTotalEditForm(request, type) {
  const receiptTotals = receiptTotalsFromNotes(request);
  const label = type === 'fuel' ? 'Fuel total' : 'Car wash total';
  const currentValue = type === 'fuel' ? receiptTotals.fuel : receiptTotals.wash;

  return `
    <div class="admin-money-grid">
      <label>${label}
        <input class="edit-service-total-value" type="number" min="0" step="0.01" value="${currentValue || ''}" placeholder="50.00">
      </label>
    </div>
    <button class="button primary save-total-edit" data-id="${escapeHtml(request.id)}" data-edit-total="${escapeHtml(type)}" type="button">Update ${escapeHtml(label)}</button>
  `;
}

// ── Background auto-refresh ───────────────────────────────────────────────────
// Polls every 20s so status changes (e.g. a customer cancelling mid-job) surface
// on the worker's screen without a manual reload, and the freshest GPS-relevant
// status is reflected. It re-renders ONLY when something actually changed, and
// never while the worker is mid-input, so it can't wipe unsaved work or collapse a
// panel they're using. GPS is unaffected: the location watch persists across
// re-renders and only stops once a status reaches the key-returned/terminal set.
let lastWorkerJobsSignature = '';
let workerJobsPollTimer = null;

function workerJobsSignature(jobs) {
  return (jobs || [])
    .map((j) => `${j.id}:${j.status}:${j.payment_status || ''}:${normalizeId(j.assigned_employee_id) || ''}`)
    .sort()
    .join('|');
}

function isWorkerInteracting() {
  const el = document.activeElement;
  // Don't refresh while the worker is typing/selecting in any field.
  return !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

// True if any field in the job list has been changed but not yet saved, so a
// silent re-render won't wipe the worker's in-progress entry even if they've
// tapped away from the field (blurred) without saving.
function hasUnsavedWorkerInput() {
  // Check both surfaces a job card can render on — the Jobs-tab list and the
  // Today's Job dashboard — so the poll never wipes in-progress input on either.
  const containers = [workerJobList, document.querySelector('#worker-dashboard-today')].filter(Boolean);
  if (!containers.length) return false;
  const fields = containers.flatMap((c) => Array.from(c.querySelectorAll('input, textarea, select')));
  for (const el of fields) {
    if (el.type === 'file') {
      if (el.files && el.files.length) return true;
      continue;
    }
    if (el.type === 'checkbox' || el.type === 'radio') {
      if (el.checked !== el.defaultChecked) return true;
      continue;
    }
    if (el.tagName === 'SELECT') {
      if ([...el.options].some((o) => o.selected !== o.defaultSelected)) return true;
      continue;
    }
    if ((el.value || '') !== (el.defaultValue || '')) return true;
  }
  return false;
}

let lastWorkerCancelAlertIds = new Set();

async function pollWorkerJobs() {
  if (!workerJobList || !currentEmployee) return;
  try {
    const { data, error } = await workerDb
      .rpc('worker_list_open_requests', { p_token: SESSION_WORKER_TOKEN });
    if (error) return;
    const jobs = (data || []).filter((job) => isWorkerOpenStatus(job.status));

    // A customer cancellation / return request on one of THIS worker's jobs must
    // reach them right away — even mid-entry, since the job is being aborted so a
    // half-filled field no longer matters. Track which of my jobs are in that
    // state; a newly-cancelled one forces a refresh past the unsaved-input guard.
    const myCancelAlertIds = new Set(
      jobs
        .filter((j) => normalizeId(j.assigned_employee_id) === normalizeId(currentEmployee.id))
        .filter((j) => hasCustomerReturnRequestAlert(j) || j.status === 'cancelled_pending_key_return')
        .map((j) => j.id)
    );
    const newlyCancelled = [...myCancelAlertIds].some((id) => !lastWorkerCancelAlertIds.has(id));
    lastWorkerCancelAlertIds = myCancelAlertIds;

    if (workerJobsSignature(jobs) === lastWorkerJobsSignature) return; // nothing changed

    // Benign changes still defer while the worker is actively editing, so a silent
    // re-render never wipes an in-progress entry. A cancellation overrides that.
    if (!newlyCancelled && (isWorkerInteracting() || hasUnsavedWorkerInput())) return;

    await loadWorkerJobs(true);
  } catch (_) {
    // Transient network error — try again on the next tick.
  }
}

function startWorkerJobsPoll() {
  if (workerJobsPollTimer) return;
  workerJobsPollTimer = setInterval(pollWorkerJobs, 20000);
  // Refresh immediately when the worker returns to the app. iOS standalone PWAs
  // FREEZE setInterval while the app is backgrounded/locked, and they don't
  // reliably fire `visibilitychange` on resume from the lock screen — so a change
  // made elsewhere (e.g. a customer cancelling on the website) could sit unseen
  // until a full reload. `pageshow` (incl. bfcache restore) and window `focus`
  // fire dependably when the PWA regains the foreground, so we listen to all
  // three and poll once on resume to catch anything missed while suspended.
  const refreshOnResume = () => { if (!document.hidden) pollWorkerJobs(); };
  document.addEventListener('visibilitychange', refreshOnResume);
  window.addEventListener('pageshow', refreshOnResume);
  window.addEventListener('focus', refreshOnResume);
}

async function loadWorkerJobs(silent = false) {
  if (!workerJobList || !currentEmployee) return;

  // Silent refresh (used by the background poll) skips the "Loading…" placeholder
  // so it never flashes or clears the list mid-job.
  if (!silent) {
    workerJobList.innerHTML = '<div class="empty-state"><p>Loading jobs...</p></div>';
  }

  const { data, error } = await workerDb
    .rpc('worker_list_open_requests', { p_token: SESSION_WORKER_TOKEN });

  if (error) {
    console.error('Could not load worker jobs:', error);
    if (!silent) {
      workerJobList.innerHTML = '<div class="empty-state"><p>Could not load jobs. Please refresh or contact an admin.</p></div>';
    }
    return;
  }

  const jobs = (data || []).filter((job) => isWorkerOpenStatus(job.status));
  allWorkerJobs = jobs;
  lastWorkerJobsSignature = workerJobsSignature(jobs);

  const myJobs = jobs.filter(workerJobBelongsToCurrentEmployee);

  if (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    console.log('[worker jobs]', {
      currentEmployeeId: currentEmployee.id,
      currentEmployeeName: currentEmployee.full_name,
      loadedJobCount: jobs.length,
      myJobCount: myJobs.length,
      statusesLoaded: workerOpenStatuses,
    });
  }

  const workerZone = currentEmployee.home_location || DEFAULT_WORK_LOCATION;
  const availableJobs = jobs.filter((job) => {
    return !normalizeId(job.assigned_employee_id)
      && !workerJobHasAssignedFallback(job)
      && !myJobs.includes(job)
      && job.status === 'request_received';
  });

  const cancelledReturnJobs = myJobs.filter((job) => job.status === 'cancelled_pending_key_return');
  const claimedJobs = myJobs
    .filter((job) => job.status !== 'cancelled_pending_key_return')
    .slice()
    .sort((a, b) => {
      const aKey = `${a.service_date || '9999'}T${String(a.desired_return_time || '').slice(0, 5)}`;
      const bKey = `${b.service_date || '9999'}T${String(b.desired_return_time || '').slice(0, 5)}`;
      return aKey.localeCompare(bKey);
    });

  // Account inactive — admin must reactivate. Hide all available work (spec).
  if (currentEmployee.active === false) {
    workerJobList.innerHTML = `
      <div class="worker-state-card worker-state-inactive">
        <h3>Account inactive</h3>
        <p>Your worker account is inactive. Please contact admin to be reactivated.</p>
      </div>`;
    updateWorkerProgressTimeline([]);
    return;
  }

  // Completed today comes from a separate source — the open-requests RPC excludes
  // completed jobs, so this card would otherwise always be empty.
  const completedToday = await loadWorkerCompletedToday();
  const today = new Date().toISOString().slice(0, 10);

  const profileIncomplete = !currentEmployee.phone;

  // "Current Job" = the claimed job actually underway (key received or beyond).
  // Everything else claimed is the day's schedule. Lead with the one job the
  // worker is acting on, then upcoming, then new work, then completed.
  // One-job-at-a-time model:
  //  • activeJobs       = jobs in progress (key received+) — you're holding the car/keys.
  //  • cancelledReturn  = cancelled jobs still awaiting the car/key handback.
  //  • pendingAccepted  = jobs you've accepted but NOT started yet (status 'accepted').
  // While you have a job needing action you can't start or claim another, so the
  // dashboard shows ONE focus card with actions and the rest as a quiet Upcoming list.
  const todayClaimedJobs = claimedJobs.filter((job) => job.service_date === today);
  const futureClaimedJobs = claimedJobs.filter((job) => job.service_date && job.service_date > today);
  const todayCancelledReturnJobs = cancelledReturnJobs.filter((job) => job.service_date === today);
  const activeJobs = todayClaimedJobs.filter((job) => workerProgressStepForStatus(job.status) >= 2);
  const pendingAccepted = todayClaimedJobs.filter((job) => workerProgressStepForStatus(job.status) < 2);
  const needsAction = [...todayCancelledReturnJobs, ...activeJobs];
  const hasActiveJob = needsAction.length > 0;
  const hasBlockingActiveJob = cancelledReturnJobs.length > 0
    || claimedJobs.some((job) => workerProgressStepForStatus(job.status) >= 2);
  const focusJobs = hasActiveJob ? needsAction : pendingAccepted.slice(0, 1);
  const upcomingJobs = [
    ...(hasActiveJob ? pendingAccepted : pendingAccepted.slice(1)),
    ...futureClaimedJobs,
  ];

  workerJobList.innerHTML = `
    ${profileIncomplete ? `
      <div class="worker-state-card worker-state-warning">
        <h3>Complete your worker profile</h3>
        <p>Complete your worker profile before accepting jobs.</p>
        <button class="button primary worker-complete-profile-btn" type="button">Complete Profile</button>
      </div>
    ` : ''}
    <section class="worker-jobs-section">
      <h3>Available jobs to claim${(!hasBlockingActiveJob && availableJobs.length) ? ` (${availableJobs.length})` : ''}</h3>
      ${hasBlockingActiveJob
        ? `<div class="worker-state-card worker-state-empty"><p>Finish your current job before claiming another.</p></div>`
        : (availableJobs.length
          ? renderWorkerJobTable(availableJobs, 'available')
          : `<div class="worker-state-card worker-state-empty">
              <p>No available requests right now.</p>
              <button class="button secondary worker-refresh-inline" type="button" aria-label="Refresh worker dashboard">Refresh</button>
            </div>`)}
    </section>
  `;

  renderWorkerDashboardToday(focusJobs, upcomingJobs);
  renderWorkerUpcomingSchedule(claimedJobs);
  renderWorkerEarnings(completedToday);
  renderWorkerTodayCounts({
    // The job you're handling now (the focus card) counts as Accepted — unless it's
    // a cancellation, which is counted under Cancelled instead. Other claimed jobs
    // waiting behind it are Upcoming.
    accepted: focusJobs.filter((job) => job.status !== 'cancelled_pending_key_return').length,
    upcoming: upcomingJobs.length,
    completed: completedToday.length,
    cancelled: todayCancelledReturnJobs.length,
  });
  updateWorkerProgressTimeline(myJobs);

  // Desktop-only earnings breakdown + job history. Skip the extra fetch on the
  // phone, where these sections are hidden anyway.
  if (window.matchMedia && window.matchMedia('(min-width: 761px)').matches) {
    loadWorkerCompletedHistory().then((history) => {
      renderWorkerEarningsBreakdown(history);
      renderWorkerJobHistory(history);
    });
  }
}

// Completed-today jobs for this worker. Uses worker_list_my_requests (which
// includes completed jobs) and keeps only those completed today.
async function loadWorkerCompletedToday() {
  if (!currentEmployee) return [];
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await workerDb
    .rpc('worker_list_my_requests', { p_token: SESSION_WORKER_TOKEN })
    .select('id,customer_name,service_type,service_label,status,final_total,updated_at,service_date,fuel_convenience_fee,wash_convenience_fee,quick_inspection,quick_inspection_fee');
  if (error) {
    console.warn('Could not load completed-today jobs:', error);
    return [];
  }
  return (data || [])
    .filter((r) => canonicalBookingStatus(r.status) === 'completed' && (String(r.updated_at || '').slice(0, 10) === today || r.service_date === today))
    .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
}

// Every completed job for this worker (not just today), for the desktop earnings
// breakdown + history table. Pulls `notes` so the locked [worker_payout] tag is
// honored, plus the fee/mileage/gallon fields the live fallback needs for older
// jobs that predate the lock.
async function loadWorkerCompletedHistory() {
  if (!currentEmployee) return [];
  const { data, error } = await workerDb
    .rpc('worker_list_my_requests', { p_token: SESSION_WORKER_TOKEN })
    .select('id,customer_name,service_type,service_label,status,payment_status,final_total,updated_at,service_date,notes,fuel_convenience_fee,wash_convenience_fee,quick_inspection,quick_inspection_fee,gas_station_extra_miles,selected_fuel_gallons,estimated_gallons,authorization_fuel_gallons');
  if (error) {
    console.warn('Could not load worker job history:', error);
    return [];
  }
  return (data || [])
    .filter((r) => canonicalBookingStatus(r.status) === 'completed' || r.payment_status === 'captured')
    .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
}

async function claimWorkerJob(requestId) {
  if (!currentEmployee) return;
  const request = allWorkerJobs.find((item) => item.id === requestId);

  const { error } = await workerDb.rpc('worker_claim_request', {
    p_token: SESSION_WORKER_TOKEN,
    p_request_id: requestId,
    p_data: {
      assigned_worker_name: currentEmployee.full_name,
      assigned_worker_phone: currentEmployee.phone ? normalizePhone(currentEmployee.phone) : null,
      assigned_worker_photo_url: currentEmployee.cropped_photo_url || currentEmployee.photo_url || null,
      assigned_worker_original_photo_url: currentEmployee.original_photo_url || null,
      status: canonicalBookingStatus(request?.status) === 'new' ? 'assigned' : canonicalBookingStatus(request?.status || 'assigned'),
    },
  });

  if (error) throw error;

  await loadWorkerJobs();
  await loadWorkerReviews();
}

// One-shot current GPS fix for the worker. Uses a cached reading when available
// (e.g. the Key-received gate just took one), so it resolves fast.
function workerCurrentCoords() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 12000 }
    );
  });
}

// Stamp a [<tag> lat,lon] note onto the request once, capturing a meaningful spot
// (e.g. handoff_coords where the worker met the customer for keys). Falls back to
// the last streamed position if a fresh fix isn't available.
async function workerSaveSpotNote(request, tag) {
  if (!request || String(request.notes || '').includes(`[${tag} `)) return;
  const fix = await workerCurrentCoords();
  const lat = fix?.lat ?? Number(request.last_latitude);
  const lon = fix?.lon ?? Number(request.last_longitude);
  if (!(Number.isFinite(lat) && Number.isFinite(lon) && (lat || lon))) return;
  const note = `[${tag} ${lat.toFixed(6)},${lon.toFixed(6)}]`;
  const notes = request.notes ? `${request.notes}\n${note}` : note;
  try {
    await workerDb.rpc('worker_update_request', { p_token: SESSION_WORKER_TOKEN, p_request_id: request.id, p_data: { notes } });
  } catch (err) { console.warn('Could not save spot note:', err); }
}

function routeCoordTagForAction(action) {
  return {
    key_pickup: { noteTag: 'key_pickup_location', latKey: 'key_pickup_lat', lngKey: 'key_pickup_lng' },
    vehicle_pickup: { noteTag: 'vehicle_pickup_location', latKey: 'vehicle_pickup_lat', lngKey: 'vehicle_pickup_lng' },
    service_start: { noteTag: 'service_start_location', latKey: 'service_start_lat', lngKey: 'service_start_lng' },
    vehicle_return: { noteTag: 'vehicle_return_location', latKey: 'vehicle_return_lat', lngKey: 'vehicle_return_lng' },
    key_return: { noteTag: 'key_return_location', latKey: 'key_return_lat', lngKey: 'key_return_lng' },
  }[action] || null;
}

function appendRouteCoordNote(notes, noteTag, coords) {
  const current = String(notes || '');
  if (!noteTag || current.includes(`[${noteTag} `) || !coords) return current;
  const note = `[${noteTag} ${coords.lat.toFixed(6)},${coords.lon.toFixed(6)}]`;
  return current ? `${current}\n${note}` : note;
}

async function workerCoordsForRequest(request) {
  const fix = await workerCurrentCoords();
  const lat = fix?.lat ?? Number(request?.last_latitude);
  const lon = fix?.lon ?? Number(request?.last_longitude);
  return Number.isFinite(lat) && Number.isFinite(lon) && (lat || lon) ? { lat, lon } : null;
}

function routeCoordUpdatePayload(action, coords) {
  const meta = routeCoordTagForAction(action);
  if (!meta || !coords) return {};
  return {
    [meta.latKey]: Number(coords.lat.toFixed(6)),
    [meta.lngKey]: Number(coords.lon.toFixed(6)),
  };
}

function hasRouteCoordPayload(pData) {
  return [
    'key_pickup_lat', 'key_pickup_lng',
    'vehicle_pickup_lat', 'vehicle_pickup_lng',
    'service_start_lat', 'service_start_lng',
    'vehicle_return_lat', 'vehicle_return_lng',
    'key_return_lat', 'key_return_lng',
  ].some((key) => Object.prototype.hasOwnProperty.call(pData || {}, key));
}

async function workerUpdateRequestWithCoordinateFallback(id, pData) {
  let { error } = await workerDb.rpc('worker_update_request', {
    p_token: SESSION_WORKER_TOKEN,
    p_request_id: id,
    p_data: pData,
  });

  if (error && /key_pickup_|vehicle_pickup_|service_start_|vehicle_return_|key_return_|schema cache|column/i.test(String(error.message || ''))) {
    const retryData = { ...pData };
    [
      'key_pickup_lat', 'key_pickup_lng',
      'vehicle_pickup_lat', 'vehicle_pickup_lng',
      'service_start_lat', 'service_start_lng',
      'vehicle_return_lat', 'vehicle_return_lng',
      'key_return_lat', 'key_return_lng',
    ].forEach((key) => delete retryData[key]);
    ({ error } = await workerDb.rpc('worker_update_request', {
      p_token: SESSION_WORKER_TOKEN,
      p_request_id: id,
      p_data: retryData,
    }));
  }

  if (error) throw error;

  if (hasRouteCoordPayload(pData)) {
    try {
      const { error: coordErr } = await workerDb.rpc('worker_set_route_coordinates', {
        p_token: SESSION_WORKER_TOKEN,
        p_request_id: id,
        p_data: pData,
      });
      if (coordErr) console.warn('Could not save route coordinate columns:', coordErr);
    } catch (coordErr) {
      console.warn('Could not save route coordinate columns:', coordErr);
    }
  }
}

// Persist an explicit destination coordinate onto the request notes once (e.g. the
// gas station the in-app navigator resolved — including the nearest one for "closest
// station" jobs — so the customer's "heading to the station" ETA has a target).
async function workerSaveCoordsNote(requestId, tag, lat, lon) {
  lat = Number(lat); lon = Number(lon);
  if (!(Number.isFinite(lat) && Number.isFinite(lon) && (lat || lon))) return;
  const request = allWorkerJobs.find((j) => j.id === requestId);
  if (!request || String(request.notes || '').includes(`[${tag} `)) return;
  const note = `[${tag} ${lat.toFixed(6)},${lon.toFixed(6)}]`;
  const notes = request.notes ? `${request.notes}\n${note}` : note;
  try {
    await workerDb.rpc('worker_update_request', { p_token: SESSION_WORKER_TOKEN, p_request_id: requestId, p_data: { notes } });
    request.notes = notes; // keep the local copy in sync so we don't re-save
  } catch (err) { console.warn('Could not save destination note:', err); }
}
window.ShiftFuelSaveDest = function (requestId, tag, dest) {
  if (dest) workerSaveCoordsNote(requestId, tag, dest.lat, dest.lon);
};

async function updateWorkerJobStatus(id, status, options = {}) {
  const request = allWorkerJobs.find((item) => item.id === id);
  const pData = { status: canonicalBookingStatus(status) };
  if (options.coordAction && request) {
    const meta = routeCoordTagForAction(options.coordAction);
    const coords = await workerCoordsForRequest(request);
    if (meta && coords) {
      pData.notes = appendRouteCoordNote(request.notes, meta.noteTag, coords);
      Object.assign(pData, routeCoordUpdatePayload(options.coordAction, coords));
    }
  }

  await workerUpdateRequestWithCoordinateFallback(id, pData);
  await loadWorkerJobs();

  // After receipts are confirmed on a fuel job, take the worker straight into
  // navigation back to the service address; arriving there auto-marks the vehicle
  // returned (mirror of the pickup→station auto-open). One-time on this transition.
  if (status === 'receipts_recorded') {
    const job = allWorkerJobs.find((item) => item.id === id);
    if (job && (serviceNeedsFuel(job) || serviceNeedsWash(job)) && window.ShiftFuelRouteMap?.open) {
      window.ShiftFuelRouteMap.open(job, 'return');
    }
  }
}

// Called by the in-app navigator when the worker reaches the destination on an
// auto-advance leg — so they don't have to tap once they're already there. Each
// case is guarded to its status so reopening the map later can't mis-fire.
window.ShiftFuelOnNavArrive = function (requestId, destType) {
  const job = allWorkerJobs.find((j) => j.id === requestId);
  if (!job) return;
  if ((destType === 'station' || destType === 'wash') && ['vehicle_picked_up', 'wash_receipt_uploaded', 'fuel_receipt_uploaded'].includes(job.status)) {
    updateWorkerJobStatus(requestId, 'service_in_progress', { coordAction: 'service_start' }).catch((err) => console.warn('Auto-start service failed:', err));
  } else if (destType === 'return' && job.status === 'receipts_recorded') {
    updateWorkerJobStatus(requestId, 'returned_location_pending', { coordAction: 'vehicle_return' }).catch((err) => console.warn('Auto-mark returned failed:', err));
  }
};

// Called when the worker taps the nav screen's bottom button — the single exit on
// every leg. Maps the leg to its forward transition. 'handoff' just closes the map
// (the keys-returned panel is already on the card to document who got the keys).
window.ShiftFuelOnNavAction = function (requestId, destType) {
  const job = allWorkerJobs.find((j) => j.id === requestId);
  if (!job) return;
  if (destType === 'address' && canonicalBookingStatus(job.status) === 'assigned') {
    updateWorkerJobStatus(requestId, 'en_route', { coordAction: 'key_pickup' }).catch((err) => console.warn('Key received failed:', err));
  } else if (destType === 'wash' || destType === 'station') {
    if (['vehicle_picked_up', 'wash_receipt_uploaded', 'fuel_receipt_uploaded'].includes(job.status)) {
      updateWorkerJobStatus(requestId, 'service_in_progress', { coordAction: 'service_start' }).catch((err) => console.warn('Start service failed:', err));
    }
  } else if (destType === 'return' && job.status === 'receipts_recorded') {
    updateWorkerJobStatus(requestId, 'returned_location_pending', { coordAction: 'vehicle_return' }).catch((err) => console.warn('Vehicle returned failed:', err));
  }
};

async function saveWorkerServiceUnable(button) {
  const id = button.dataset.id;
  const panel = button.closest('.service-unable-panel');
  const request = allWorkerJobs.find((item) => item.id === id);
  const type = panel?.dataset.serviceType;
  const selected = panel?.querySelector('.service-unable-reason')?.value.trim();
  const custom   = panel?.querySelector('.service-unable-other')?.value.trim();
  const reason   = selected === 'Other' ? (custom || '') : selected;

  if (!request || !type) return;

  if (!selected) {
    alert('Select a reason before saving.');
    return;
  }
  if (selected === 'Other' && !custom) {
    alert('Describe the reason when "Other" is selected.');
    return;
  }

  const label = type === 'fuel' ? 'Fuel' : 'Car wash';
  const timestamp = new Date().toISOString();
  const nextStatus = nextStatusAfterServiceUnable(request, type);
  const chargeFeeAnyway = panel?.querySelector('.service-unable-charge-fee')?.checked || false;
  const receiptTotals = receiptTotalsFromNotes(request);
  const note = `[service_unable ${type}] ${label} could not be completed: ${reason}`
    + (chargeFeeAnyway ? `\n[service_unable_fee_charged ${type}]` : '');
  const notes = request.notes ? `${request.notes}\n${note}` : note;
  const finalTotal = finalTotalFromSavedReceipts({ ...request, notes }, receiptTotals);

  button.disabled = true;
  button.textContent = 'Saving...';

  const { error } = await workerDb.rpc('worker_update_request', {
    p_token: SESSION_WORKER_TOKEN,
    p_request_id: id,
    p_data: { status: canonicalBookingStatus(nextStatus), final_total: finalTotal, notes, ...pricingAuditFields({ ...request, notes }, receiptTotals) },
  });

  if (error) throw error;
  await loadWorkerJobs();
}

async function uploadWorkerJobPhotoFile(requestId, photoType, file) {
  const extension = file.name.split('.').pop() || 'jpg';
  const path = `${requestId}/${Date.now()}-${photoType}.${extension}`;

  const { error: uploadError } = await workerDb.storage.from(PHOTO_BUCKET).upload(path, file, { upsert: false });
  if (uploadError) throw uploadError;

  const { data: publicUrlData } = workerDb.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  const imageUrl = publicUrlData?.publicUrl || path;

  const { error: insertError } = await workerDb.from('photos').insert({
    service_request_id: requestId,
    photo_type: photoType,
    image_url: imageUrl,
    storage_bucket: PHOTO_BUCKET,
    storage_path: path,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });

  if (insertError) throw insertError;
}

function selectedFilesHaveDuplicates(inputs) {
  const seen = new Set();

  for (const input of inputs) {
    const file = input.files[0];
    if (!file) continue;

    const signature = `${file.name}-${file.size}-${file.lastModified}`;
    if (seen.has(signature)) {
      return true;
    }

    seen.add(signature);
  }

  return false;
}

async function uploadWorkerPhotoSet(button) {
  const id = button.dataset.id;
  const panel = button.closest('.photo-panel');
  const request = allWorkerJobs.find((item) => item.id === id);
  const inputs = Array.from(panel.querySelectorAll('.required-photo'));
  const missing = inputs.some((input) => !input.files[0]);

  if (!request) return;

  if (missing) {
    alert('Upload every required photo before moving forward.');
    return;
  }

  if (selectedFilesHaveDuplicates(inputs)) {
    const warning = panel.querySelector('.duplicate-photo-warning');
    if (warning) {
      warning.textContent = 'One photo appears to be reused. Please upload a different photo for each required angle.';
    }
    alert('One photo appears to be reused. Please upload a different photo for each required angle.');
    return;
  }

  button.disabled = true;
  button.textContent = 'Uploading...';

  for (const input of inputs) {
    await uploadWorkerJobPhotoFile(id, input.dataset.photoType, input.files[0]);
  }

  const timestamp = new Date().toISOString();
  const note = photoTimestampNote(panel.dataset.photoStage, timestamp);
  let notes = request.notes ? `${request.notes}\n${note}` : note;
  const routeCoordData = {};
  // Capture the car's exact spot from the worker's live GPS at pickup (they're
  // standing at the car). The return drive + the customer's "car coming back" ETA
  // target this spot — the geocoded address could be the building front, not the
  // car parked in the back of the lot.
  if (panel.dataset.photoStage === 'pickup') {
    const coords = await workerCoordsForRequest(request);
    if (coords) {
      if (!/\[pickup_coords /.test(notes)) notes += `\n[pickup_coords ${coords.lat.toFixed(6)},${coords.lon.toFixed(6)}]`;
      notes = appendRouteCoordNote(notes, 'vehicle_pickup_location', coords);
      Object.assign(routeCoordData, routeCoordUpdatePayload('vehicle_pickup', coords));
    }
  } else if (panel.dataset.photoStage === 'dropoff') {
    const coords = await workerCoordsForRequest(request);
    if (coords) {
      notes = appendRouteCoordNote(notes, 'vehicle_return_location', coords);
      Object.assign(routeCoordData, routeCoordUpdatePayload('vehicle_return', coords));
    }
  }
  const nextStatus = panel.dataset.nextStatus;
  await workerUpdateRequestWithCoordinateFallback(id, { status: canonicalBookingStatus(nextStatus), notes, ...routeCoordData });
  await loadWorkerJobs();

  const updated = allWorkerJobs.find((item) => item.id === id) || request;
  // Pickup photos done → drive to the first service. BUT if an inspection is due,
  // it happens first (the card shows it); the service nav opens after the
  // inspection is saved (see saveWorkerInspection).
  if (panel.dataset.photoStage === 'pickup' && window.ShiftFuelRouteMap?.open
      && !(updated.quick_inspection && !hasInspectionRecorded(updated))) {
    // Car wash first (covers combos); fall back to the gas station for fuel-only.
    if (serviceNeedsWash(updated)) window.ShiftFuelRouteMap.open(updated, 'wash');
    else if (serviceNeedsFuel(updated)) window.ShiftFuelRouteMap.open(updated, 'station');
  }
  // Return (drop-off) photos done → drive to where we met the customer to hand the
  // keys back. The "Keys returned" leg's button captures payment + completes.
  if (panel.dataset.photoStage === 'dropoff' && updated.status === 'vehicle_returned' && window.ShiftFuelRouteMap?.open) {
    window.ShiftFuelRouteMap.open(updated, 'handoff');
  }
}

async function saveWorkerFinalTotal(button) {
  const id = button.dataset.id;
  const request = allWorkerJobs.find((item) => item.id === id);
  const panel = button.closest('.receipt-panel');
  const receiptMode = button.dataset.receiptMode || 'all';

  if (!request) return;

  const savedTotals = receiptTotalsFromNotes(request);
  const fuelReceipt = panel.querySelector('.fuel-receipt-total')?.value || savedTotals.fuel || 0;
  const washReceipt = panel.querySelector('.wash-receipt-total')?.value || savedTotals.wash || 0;
  const fuelReceiptFile = panel.querySelector('.fuel-receipt-file')?.files[0];
  const washReceiptFile = panel.querySelector('.wash-receipt-file')?.files[0];

  if ((receiptMode === 'fuel' || receiptMode === 'all') && serviceNeedsFuel(request) && (!fuelReceiptFile || !numberFromInput(fuelReceipt))) {
    alert('Upload the fuel receipt and enter the fuel total.');
    return;
  }

  if ((receiptMode === 'wash' || receiptMode === 'all') && serviceNeedsWash(request) && (!washReceiptFile || !numberFromInput(washReceipt))) {
    alert('Upload the car wash receipt and enter the car wash total.');
    return;
  }

  const newReceiptTotals = {
    fuel: receiptMode === 'fuel' || receiptMode === 'all' ? numberFromInput(fuelReceipt) : savedTotals.fuel,
    wash: receiptMode === 'wash' || receiptMode === 'all' ? numberFromInput(washReceipt) : savedTotals.wash,
  };
  const fees = transactionPricingSummary(request, newReceiptTotals);
  const finalTotal = finalTotalFromSavedReceipts(request, newReceiptTotals);
  const serviceNote = receiptMode === 'fuel'
    ? `Fuel receipt recorded: ${money(newReceiptTotals.fuel)}.`
    : receiptMode === 'wash'
      ? `Car wash receipt recorded: ${money(newReceiptTotals.wash)}.`
      : `Receipt totals recorded: fuel ${money(newReceiptTotals.fuel)}, wash ${money(newReceiptTotals.wash)}.`;
  const note = `${serviceNote} [receipt_totals fuel=${newReceiptTotals.fuel.toFixed(2)} wash=${newReceiptTotals.wash.toFixed(2)}] Service totals: fuel ${money(fees.fuel)}, car wash ${money(fees.wash)}, inspection ${money(fees.inspection)}. Payment/operating recovery ${money(fees.recovery)}. Final total ${money(finalTotal)}.`;
  const notes = request.notes ? `${request.notes}\n${note}` : note;

  button.disabled = true;
  button.textContent = 'Saving...';

  if (fuelReceiptFile) {
    await uploadWorkerJobPhotoFile(id, 'fuel_receipt', fuelReceiptFile);
  }

  if (washReceiptFile) {
    await uploadWorkerJobPhotoFile(id, 'wash_receipt', washReceiptFile);
  }

  const updates = { final_total: finalTotal, notes, ...pricingAuditFields(request, newReceiptTotals) };
  if (button.dataset.nextStatus) {
    updates.status = canonicalBookingStatus(button.dataset.nextStatus);
  }

  const { error } = await workerDb.rpc('worker_update_request', {
    p_token: SESSION_WORKER_TOKEN,
    p_request_id: id,
    p_data: updates,
  });

  if (error) throw error;
  await loadWorkerJobs();

  // Receipt recorded → auto-open the next nav leg (mirrors pickup→wash): a wash
  // receipt drives to the gas station; the final receipt drives the car back.
  const newStatus = updates.status;
  const updatedJob = allWorkerJobs.find((item) => item.id === id);
  // If a return-request was deferred during this service, DON'T auto-open the next
  // service leg now that it's recorded — let the cancel/return workflow surface so
  // the worker returns the vehicle instead of starting the next service.
  const cancelNowPending = updatedJob && isActiveCustomerReturnWorkflow(updatedJob);
  if (updatedJob && !cancelNowPending && window.ShiftFuelRouteMap?.open) {
    if (newStatus === 'wash_receipt_uploaded' && serviceNeedsFuel(updatedJob)) {
      window.ShiftFuelRouteMap.open(updatedJob, 'station');
    } else if (newStatus === 'fuel_receipt_uploaded' && serviceNeedsWash(updatedJob)) {
      window.ShiftFuelRouteMap.open(updatedJob, 'wash');
    } else if (newStatus === 'receipts_recorded') {
      // Final receipt in → drive the car back, for fuel, wash, OR combo.
      window.ShiftFuelRouteMap.open(updatedJob, 'return');
    }
  }
}

async function saveWorkerReturnLocation(button) {
  const id = button.dataset.id;
  const panel = button.closest('.return-location-panel');
  const request = allWorkerJobs.find((item) => item.id === id);
  const returnParkingLocation = panel.querySelector('.return-parking-location').value.trim();

  if (!returnParkingLocation) {
    alert('Enter the vehicle return location before saving.');
    return;
  }

  const { error } = await workerDb.rpc('worker_update_request', {
    p_token: SESSION_WORKER_TOKEN,
    p_request_id: id,
    p_data: {
      return_parking_location: returnParkingLocation,
      return_parking_spot: null,
      return_parking_map_url: null,
      // Skip the old "Return photos" gateway tap — go straight into the photo wizard.
      status: 'in_service',
    },
  });

  if (error) throw error;

  console.log('Return location saved — advancing straight to the return-photo wizard.');
  await loadWorkerJobs();
}

async function bypassWorkerPickupPhotos(button) {
  const id = button.dataset.id;
  const request = allWorkerJobs.find((item) => item.id === id);
  const panel = button.closest('.pickup-bypass-panel');
  const statusEl = panel?.querySelector('.pickup-bypass-status');

  if (!request) return;

  button.disabled = true;
  button.textContent = 'Saving...';
  if (statusEl) statusEl.textContent = '';

  const timestamp = new Date().toISOString();
  const note = `[pickup_photos_bypassed ${timestamp}] Worker never reached the vehicle; pickup and return photos were not available before customer return.`;
  const notes = request.notes ? `${request.notes}\n${note}` : note;

  const { error } = await workerDb.rpc('worker_update_request', {
    p_token: SESSION_WORKER_TOKEN,
    p_request_id: id,
    p_data: { status: 'in_service', notes, updated_at: timestamp },
  });

  if (error) {
    console.error('[pickup bypass] Failed to bypass pickup photos:', error);
    button.disabled = false;
    button.textContent = 'Bypass pickup photos - never reached vehicle';
    if (statusEl) statusEl.textContent = 'Could not bypass pickup photos. Please try again.';
    return;
  }

  await loadWorkerJobs();
  await loadWorkerReviews();
}

async function saveWorkerInspection(button) {
  const id = button.dataset.id;
  const request = allWorkerJobs.find((item) => item.id === id);
  const panel = button.closest('.inspection-panel');
  const code = normalizeTroubleCode(panel.querySelector('.inspection-trouble-code').value);
  const codeDetails = troubleCodeDetails(code);

  if (!request) return;

  const doorjamb = panel.querySelector('.inspection-doorjamb')?.value || 'not recorded';
  const tire = (cls) => panel.querySelector(cls)?.value || 'not recorded';
  const df = tire('.inspection-tire-df');
  const pf = tire('.inspection-tire-pf');
  const pr = tire('.inspection-tire-pr');
  const dr = tire('.inspection-tire-dr');
  const washerDone = panel.querySelector('.inspection-washer-fluid')?.checked;
  const psiGuide = psiGuideForRequest(request);
  const guideNote = psiGuide
    ? ` Recommended: front ${psiGuide.front}, rear ${psiGuide.rear}.`
    : '';
  const note = [
    `Quick inspection recorded for ${request.vehicle_year || ''} ${request.vehicle_make || ''} ${request.vehicle_model || ''}.`.replace(/\s+/g, ' ').trim(),
    `Tire pressure set (door-jamb ${doorjamb}): driver front ${df}, passenger front ${pf}, passenger rear ${pr}, driver rear ${dr}.${guideNote}`,
    `Windshield washer fluid: ${washerDone ? 'checked/filled' : 'not topped off'}.`,
    `Trouble code ${code || 'none'}: ${codeDetails.summary} Possible fixes: ${codeDetails.fixes}`,
  ].join(' ');
  const notes = request.notes ? `${request.notes}\n${note}` : note;

  // Inspection is a pickup step now — record the note and stay at vehicle_picked_up
  // so the card falls through to the first service drive. (Old jobs that reached the
  // legacy inspection_needed status still advance to inspection_recorded.)
  const pData = { notes };
  if (request.status === 'inspection_needed') pData.status = 'in_progress';

  const { error } = await workerDb.rpc('worker_update_request', {
    p_token: SESSION_WORKER_TOKEN,
    p_request_id: id,
    p_data: pData,
  });

  if (error) throw error;
  await loadWorkerJobs();

  // Inspection done at pickup → drive to the first service (wash first for combos,
  // else the gas station). Mirrors the pickup-photos auto-open.
  const updated = allWorkerJobs.find((item) => item.id === id) || request;
  if (updated.status === 'vehicle_picked_up' && window.ShiftFuelRouteMap?.open) {
    if (serviceNeedsWash(updated)) window.ShiftFuelRouteMap.open(updated, 'wash');
    else if (serviceNeedsFuel(updated)) window.ShiftFuelRouteMap.open(updated, 'station');
  }
}

async function saveWorkerTotalEdit(button) {
  const id = button.dataset.id;
  const type = button.dataset.editTotal;
  const request = allWorkerJobs.find((item) => item.id === id);
  const panel = button.closest('.total-edit-panel');
  const value = numberFromInput(panel.querySelector('.edit-service-total-value')?.value);

  if (!request) return;

  if (!value) {
    alert(`Enter the corrected ${type === 'fuel' ? 'fuel' : 'car wash'} total.`);
    return;
  }

  const receiptTotals = receiptTotalsFromNotes(request);
  const newReceiptTotals = {
    fuel: type === 'fuel' ? value : receiptTotals.fuel,
    wash: type === 'wash' ? value : receiptTotals.wash,
  };
  const fees = transactionPricingSummary(request, newReceiptTotals);
  const finalTotal = finalTotalFromSavedReceipts(request, newReceiptTotals);
  const note = `Corrected ${type === 'fuel' ? 'fuel' : 'car wash'} total: ${money(value)}. [receipt_totals fuel=${newReceiptTotals.fuel.toFixed(2)} wash=${newReceiptTotals.wash.toFixed(2)}] Service totals: fuel ${money(fees.fuel)}, car wash ${money(fees.wash)}, inspection ${money(fees.inspection)}. Payment/operating recovery ${money(fees.recovery)}. Final total ${money(finalTotal)}.`;
  const notes = request.notes ? `${request.notes}\n${note}` : note;

  const { error } = await workerDb.rpc('worker_update_request', {
    p_token: SESSION_WORKER_TOKEN,
    p_request_id: id,
    p_data: { final_total: finalTotal, notes, ...pricingAuditFields(request, newReceiptTotals) },
  });

  if (error) throw error;
  await loadWorkerJobs();
}

function workerCompleteValidation(button) {
  const id = button.dataset.id;
  const request = allWorkerJobs.find((item) => item.id === id);
  const panel = button.closest('.complete-panel');
  const confirmed = panel?.querySelector('.confirm-complete-totals')?.checked;

  if (!request) return null;

  const receiptTotals = receiptTotalsFromNotes(request);
  const isReturnWorkflow = hasCustomerReturnRequestAlert(request);
  // A service marked unable_to_complete has no receipt by definition â€” only
  // require a receipt for services that were actually performed.
  const hasReceipts = (serviceNeedsFuel(request) ? (receiptTotals.fuel > 0 || serviceUnable(request, 'fuel')) : true)
    && (serviceNeedsWash(request) ? (receiptTotals.wash > 0 || serviceUnable(request, 'wash')) : true);

  if (!hasReceipts && !isReturnWorkflow) {
    alert('Save the receipt total before completing this request.');
    return null;
  }
  if (!confirmed) {
    alert('Check the confirmation box after verifying the saved totals.');
    return null;
  }
  if (request.quick_inspection && !hasInspectionRecorded(request) && !isReturnWorkflow) {
    alert('Complete the vehicle add-ons before completing this request.');
    return null;
  }

  return { id, request, receiptTotals };
}

// Worker completes a pre-authorized request â€” captures the Stripe payment automatically.
async function sendWorkerToCustomerPayment(button) {
  const validated = workerCompleteValidation(button);
  if (!validated) return;
  const { id, request, receiptTotals } = validated;

  button.disabled = true;
  button.textContent = 'Capturing payment...';

  const finalTotal = finalTotalFromSavedReceipts(request, receiptTotals);

  // Lock the worker's pay into the notes NOW (computed at this driver's current
  // rate), so a later rate change or admin fee edit never moves it.
  const notesWithPayout = appendWorkerPayoutNote(request);

  // Save the final total first so the capture endpoint can read it.
  const { error: updateErr } = await workerDb.rpc('worker_update_request', {
    p_token: SESSION_WORKER_TOKEN,
    p_request_id: id,
    p_data: { final_total: finalTotal, notes: notesWithPayout, ...pricingAuditFields(request, receiptTotals) },
  });

  if (updateErr) {
    console.error('[complete] Failed to save final total before capture:', updateErr);
    button.disabled = false;
    button.textContent = 'Complete & Capture Payment';
    alert('Could not save the final total. Please try again.');
    return;
  }

  // Capture the pre-authorized Stripe payment server-side.
  try {
    const res = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'worker_capture', worker_token: SESSION_WORKER_TOKEN, request_id: id }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      button.disabled = false;
      button.textContent = 'Complete & Capture Payment';
      if (data.capture_failed) {
        // PI expired or amount mismatch â€” customer has been flagged to re-pay.
        alert(`Payment capture issue: ${data.error}\n\nThe customer's tracking page will prompt them to update their payment method.`);
      } else {
        alert(`Could not capture payment: ${data.error || 'Unknown error. Please try again.'}`);
      }
      await loadWorkerJobs();
      await loadWorkerReviews();
      return;
    }

    console.log('[complete] Payment captured â€” request marked complete:', id);
  } catch (err) {
    console.error('[complete] worker-capture network error:', err);
    button.disabled = false;
    button.textContent = 'Complete & Capture Payment';
    alert('Network error capturing payment. Please check your connection and try again.');
    return;
  }

  await loadWorkerJobs();
  await loadWorkerReviews();
}

// Worker completes a no-payment/cash request directly (no Stripe capture).
async function completeWorkerRequest(button) {
  const validated = workerCompleteValidation(button);
  if (!validated) return;
  const { id, request, receiptTotals } = validated;

  button.disabled = true;
  button.textContent = 'Saving...';

  const finalTotal = finalTotalFromSavedReceipts(request, receiptTotals);
  const isReturnWorkflow = hasCustomerReturnRequestAlert(request);
  const returnConfirmNote = isReturnWorkflow
    ? `[return_totals_confirmed] Worker confirmed return-request totals before key return. Fuel ${money(receiptTotals.fuel)}, car wash ${money(receiptTotals.wash)}, final calculated total ${money(finalTotal)}.`
    : '';
  const notes = returnConfirmNote
    ? request.notes ? `${request.notes}\n${returnConfirmNote}` : returnConfirmNote
    : request.notes;
  const timestamp = new Date().toISOString();
  const updates = {
    status: isReturnWorkflow ? 'in_progress' : 'completed',
    final_total: finalTotal,
    updated_at: timestamp,
    ...pricingAuditFields(request, receiptTotals),
  };
  if (!isReturnWorkflow) updates.completed_at = timestamp;
  // Lock the worker's pay at this driver's current rate (frozen for the finished job).
  updates.notes = appendWorkerPayoutNote(request, notes);

  let { error: updateErr } = await workerDb.rpc('worker_update_request', {
    p_token: SESSION_WORKER_TOKEN,
    p_request_id: id,
    p_data: updates,
  });

  if (updateErr && /completed_at|schema cache|column/i.test(String(updateErr.message || ''))) {
    delete updates.completed_at;
    ({ error: updateErr } = await workerDb.rpc('worker_update_request', {
      p_token: SESSION_WORKER_TOKEN,
      p_request_id: id,
      p_data: updates,
    }));
  }

  if (updateErr) {
    console.error('[complete] Failed to save completion:', updateErr);
    button.disabled = false;
    button.textContent = 'Complete request';
    alert('Could not update the request. Please try again.');
    return;
  }

  console.log(isReturnWorkflow
    ? 'Request remains in progress - return workflow will close after keys are returned.'
    : 'Request completed - no payment hold to capture.');

  await loadWorkerJobs();
  await loadWorkerReviews();
}

async function submitWorkerKeysReturned(button) {
  const id = button.dataset.id;
  const request = allWorkerJobs.find(r => r.id === id);
  if (!request) return;

  const panel = button.closest('.keys-returned-panel');
  const toType = panel?.querySelector('.key-returned-to-type')?.value;
  const otherName = panel?.querySelector('.key-returned-other-name')?.value?.trim();
  const statusEl = panel?.querySelector('.keys-returned-status');

  if (!toType) {
    if (statusEl) statusEl.textContent = 'Select who the keys were returned to.';
    return;
  }
  if (toType === 'other' && !otherName) {
    if (statusEl) statusEl.textContent = 'Enter the name or location keys were returned to.';
    return;
  }

  const toName = toType === 'customer' ? (request.customer_name || 'Customer') : otherName;

  button.disabled = true;
  button.textContent = 'Saving...';
  if (statusEl) statusEl.textContent = '';
  const keyReturnCoords = await workerCoordsForRequest(request);

  try {
    const res = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'mark_keys_returned',
        request_id: id,
        caller_token: SESSION_WORKER_TOKEN,
        key_returned_to_type: toType,
        key_returned_to_name_or_location: toName,
        key_returned_by: currentEmployee?.full_name || 'Worker',
        key_return_lat: keyReturnCoords?.lat ?? null,
        key_return_lng: keyReturnCoords?.lon ?? null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (/not awaiting key return/i.test(String(data.error || ''))) {
        if (statusEl) statusEl.textContent = 'Keys already recorded. Refreshing...';
        allWorkerJobs = allWorkerJobs.filter((job) => job.id !== id);
        button.closest('.worker-current-job-card, .worker-schedule-card, .worker-job-card, .request-card')?.remove();
        await loadWorkerJobs();
        await loadWorkerReviews();
        return;
      }
      button.disabled = false;
      button.textContent = 'Keys returned';
      if (statusEl) statusEl.textContent = `Error: ${data.error || 'Could not save. Please try again.'}`;
      return;
    }
    allWorkerJobs = allWorkerJobs.filter((job) => job.id !== id);
    button.closest('.worker-current-job-card, .worker-schedule-card, .worker-job-card, .request-card')?.remove();
    await loadWorkerJobs();
    await loadWorkerReviews();
  } catch (err) {
    button.disabled = false;
    button.textContent = 'Keys returned';
    if (statusEl) statusEl.textContent = 'Network error. Please try again.';
  }
}

// Delegated on document (not just #worker-job-list) because the same job cards
// now render on the Today's Job dashboard too — both surfaces must respond.
document.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;

  try {
    if (button.classList.contains('worker-refresh-inline')) {
      button.disabled = true;
      button.textContent = 'Refreshing...';
      await loadWorkerProfile();
      return;
    }

    if (button.classList.contains('worker-complete-profile-btn')) {
      document.querySelector('#open-edit-profile-btn')?.click();
      return;
    }

    if (button.classList.contains('worker-row-toggle')) {
      const id = button.dataset.id;
      expandedWorkerJobId = expandedWorkerJobId === id ? null : id;
      await loadWorkerJobs();
      return;
    }

    // Retake a photo already added in the wizard — reopen that tile's file picker.
    if (button.classList.contains('photo-wizard-retake')) {
      button.closest('.photo-wizard-step')?.querySelector('.required-photo')?.click();
      return;
    }

    // Today's Schedule tiles: jump to the matching content. (Zero-count tiles are
    // rendered as inert divs, so only the tappable ones reach here.)
    if (button.classList.contains('worker-count-cell')) {
      const action = button.dataset.countAction;
      if (action === 'earnings') {
        if (typeof switchWorkerTab === 'function') switchWorkerTab('earnings');
      } else if (action === 'upcoming') {
        const el = document.querySelector('.worker-upcoming-block') || document.querySelector('#worker-dashboard-today');
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        document.querySelector('#worker-dashboard-today')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }

    if (button.classList.contains('worker-open-fuel-card')) {
      if (typeof switchWorkerTab === 'function') switchWorkerTab('earnings');
      setTimeout(() => {
        const card = document.getElementById('worker-fuelcard-card');
        card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card?.classList.add('is-highlighted');
        setTimeout(() => card?.classList.remove('is-highlighted'), 1400);
      }, 80);
      return;
    }

    // "Start — open map": let the route-map + GPS listeners (separate handlers) do
    // their thing, but also flag the job as started so the Accepted step flips to
    // "Key received" right away. Re-render after this click cycle so the map opens
    // and GPS starts first. No preventDefault — those other listeners must run.
    if (button.classList.contains('worker-start-nav')) {
      if (button.dataset.id) {
        workerStartedJobIds.add(button.dataset.id);
        updateWorkerJobStatus(button.dataset.id, 'en_route').catch((err) => console.warn('Could not mark job en route:', err));
        setTimeout(() => { loadWorkerJobs(); }, 0);
      }
      return;
    }

    if (button.classList.contains('claim-worker-job')) {
      button.disabled = true;
      button.textContent = 'Claiming...';
      await claimWorkerJob(button.dataset.id);
      return;
    }

    if (button.classList.contains('worker-release-job')) {
      if (!confirm('Send this job back to the open pool? You will be unassigned and another worker can pick it up.')) return;
      button.disabled = true;
      try {
        const { error } = await workerDb.rpc('worker_release_request', {
          p_token: SESSION_WORKER_TOKEN,
          p_request_id: button.dataset.id,
        });
        if (error) throw error;
        await loadWorkerJobs();
      } catch (err) {
        console.error('Release job failed:', err);
        button.disabled = false;
        alert('Could not release the job. Please try again.');
      }
      return;
    }

    if (button.classList.contains('worker-update-status')) {
      // If this button is inside a receipt-confirm panel, require the checkbox first.
      const confirmPanel = button.closest('.complete-panel');
      if (confirmPanel && button.dataset.status === 'receipts_recorded') {
        const confirmed = confirmPanel.querySelector('.confirm-complete-totals')?.checked;
        if (!confirmed) {
          alert('Check the confirmation box after verifying the saved totals.');
          return;
        }
      }
      button.disabled = true;
      // Capture where the worker met the customer for keys, so they can navigate
      // back to the same spot to return the keys at the end.
      if (button.dataset.status === 'key_received' || button.dataset.status === 'en_route') {
        await workerSaveSpotNote(allWorkerJobs.find((j) => j.id === button.dataset.id), 'handoff_coords');
      }
      const coordAction = {
        key_received: 'key_pickup',
        en_route: 'key_pickup',
        service_in_progress: 'service_start',
        in_service: 'service_start',
        returned_location_pending: 'vehicle_return',
        returning: 'vehicle_return',
      }[button.dataset.status];
      await updateWorkerJobStatus(button.dataset.id, button.dataset.status, coordAction ? { coordAction } : {});
      return;
    }

    if (button.classList.contains('confirm-cancellation-return')) {
      if (!confirm('Confirm the key/vehicle has been returned to the customer? This will close out the cancelled request.')) return;
      button.disabled = true;
      button.textContent = 'Confirming...';
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'worker_confirm_cancellation_return', worker_token: SESSION_WORKER_TOKEN, request_id: button.dataset.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        button.disabled = false;
        button.textContent = 'Confirm Key/Vehicle Returned';
        alert(data.error || 'Could not confirm the return. Please try again.');
        return;
      }
      await loadWorkerJobs();
      return;
    }

    if (button.classList.contains('upload-photo-set')) {
      await uploadWorkerPhotoSet(button);
      return;
    }

    if (button.classList.contains('save-final-total')) {
      await saveWorkerFinalTotal(button);
      return;
    }

    if (button.classList.contains('save-return-location')) {
      await saveWorkerReturnLocation(button);
      return;
    }

    if (button.classList.contains('bypass-pickup-photos')) {
      await bypassWorkerPickupPhotos(button);
      return;
    }

    if (button.classList.contains('inspection-next') || button.classList.contains('inspection-back')) {
      advanceInspectionStep(button);
      return;
    }

    if (button.classList.contains('save-inspection')) {
      await saveWorkerInspection(button);
      return;
    }

    if (button.classList.contains('show-total-edit')) {
      const request = allWorkerJobs.find((item) => item.id === button.dataset.id);
      // Scope to the button's own panel so it works on the dashboard card too (not
      // just the Jobs-tab list) — the edit panel is a sibling inside .complete-panel.
      const completePanel = button.closest('.complete-panel');
      const panel = completePanel?.querySelector(`[data-total-edit-for="${button.dataset.id}"]`)
        || document.querySelector(`[data-total-edit-for="${button.dataset.id}"]`);
      const checkbox = completePanel?.querySelector('.confirm-complete-totals');

      if (checkbox) checkbox.checked = false;
      if (panel && request) {
        panel.innerHTML = renderWorkerTotalEditForm(request, button.dataset.editTotal);
        panel.hidden = false;
      }
      return;
    }

    if (button.classList.contains('save-total-edit')) {
      await saveWorkerTotalEdit(button);
      return;
    }

    if (button.classList.contains('show-service-unable')) {
      const panel = document.querySelector(`[data-service-unable-for="${button.dataset.id}"]`);
      if (panel) {
        const serviceType = button.dataset.serviceType;
        panel.dataset.serviceType = serviceType;
        const label = panel.querySelector('.service-unable-label');
        if (label) {
          label.textContent = serviceType === 'fuel'
            ? 'Explain why fuel cannot be completed. The rest of the request will keep moving.'
            : 'Explain why the car wash cannot be completed. The rest of the request will keep moving.';
        }
        panel.hidden = false;
        panel.querySelector('.service-unable-reason')?.focus();
      }
      return;
    }

    if (button.classList.contains('cancel-service-unable')) {
      const panel = button.closest('.service-unable-panel');
      if (panel) {
        panel.hidden = true;
        const sel = panel.querySelector('.service-unable-reason');
        if (sel) sel.value = '';
        const otherWrap = panel.querySelector('.service-unable-other-wrap');
        if (otherWrap) otherWrap.style.display = 'none';
        const otherTa = panel.querySelector('.service-unable-other');
        if (otherTa) otherTa.value = '';
      }
      return;
    }

    if (button.classList.contains('save-service-unable')) {
      await saveWorkerServiceUnable(button);
      return;
    }

    if (button.classList.contains('worker-keys-capture')) {
      await workerKeysCapture(button);
      return;
    }

    if (button.classList.contains('send-to-customer-payment')) {
      await sendWorkerToCustomerPayment(button);
      return;
    }

    if (button.classList.contains('complete-request')) {
      await completeWorkerRequest(button);
      return;
    }

    if (button.classList.contains('worker-submit-keys-returned')) {
      await submitWorkerKeysReturned(button);
      return;
    }
  } catch (error) {
    console.error('Worker job action failed:', error);
    alert('Something went wrong. Check the console for details.');
    button.disabled = false;
  }
});

document.addEventListener('change', (event) => {
  if (event.target.matches('input[type="file"]')) {
    const control = event.target.closest('.file-button-control');
    const label = control?.querySelector('.selected-file-name');
    if (label) {
      label.textContent = event.target.files?.[0]?.name || 'No file chosen';
    }
  }

  // One-at-a-time photo wizard: when a required photo is added, advance to the
  // next tile (and reveal Upload once they're all in).
  if (event.target.matches('.required-photo')) {
    const wizard = event.target.closest('.photo-wizard');
    if (wizard) advanceWorkerPhotoWizard(wizard);
  }

  if (event.target.matches('.service-unable-reason')) {
    const panel = event.target.closest('.service-unable-panel');
    const otherWrap = panel?.querySelector('.service-unable-other-wrap');
    if (otherWrap) {
      otherWrap.style.display = event.target.value === 'Other' ? 'block' : 'none';
    }
  }

  if (event.target.matches('.key-returned-to-type')) {
    const panel = event.target.closest('.keys-returned-panel, .keys-final-panel');
    const otherWrap = panel?.querySelector('.key-returned-other-wrap');
    const otherInput = panel?.querySelector('.key-returned-other-name');
    const isOther = event.target.value === 'other';
    if (otherWrap) otherWrap.hidden = !isOther;
    if (otherInput) {
      otherInput.required = isOther;
      if (!isOther) otherInput.value = '';
    }
  }
});

document.addEventListener('input', (event) => {
  if (!event.target.classList.contains('inspection-trouble-code')) return;

  const code = normalizeTroubleCode(event.target.value);
  const details = troubleCodeDetails(code);
  const output = event.target.closest('.inspection-panel')?.querySelector('.trouble-code-output');
  if (output) {
    output.innerHTML = `
      <p><strong>${escapeHtml(code || 'No code entered')}:</strong> ${escapeHtml(details.summary)}</p>
      <p class="field-help">Possible fixes: ${escapeHtml(details.fixes)}</p>
    `;
  }
});

// Live-echo the confirmed door-jamb PSI next to every tire as the worker types it.
document.addEventListener('input', (event) => {
  if (!event.target.classList.contains('inspection-doorjamb')) return;
  const panel = event.target.closest('.inspection-panel');
  if (!panel) return;
  const value = event.target.value.trim() || '—';
  panel.querySelectorAll('.doorjamb-echo').forEach((el) => { el.textContent = value; });
});

workerProfileForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!currentEmployee) {
    setWorkerStatus('Worker profile is still loading. Try again in a moment.');
    return;
  }

  setWorkerStatus('Saving worker profile...');

  try {
    const file = workerProfilePhoto?.files?.[0];
    const photoZoom = Number(workerPhotoDisplayZoom?.value || workerProfilePhotoZoom || 1);
    const photoPositionX = Number(workerProfilePhotoPosition.x || 0);
    const photoPositionY = Number(workerProfilePhotoPosition.y || 0);
    const fullName = workerProfileName?.value.trim() || currentEmployee.full_name;
    const username = (workerProfileUsername?.value || '').trim();
    const phoneInputValue = workerProfilePhone?.value.trim() || null;
    const phone = phoneInputValue ? normalizePhone(phoneInputValue) : null;
    const homeLocation = currentEmployee.home_location || DEFAULT_WORK_LOCATION;

    if (phoneInputValue && !window.ShiftFuelPhone?.isValid(phoneInputValue)) {
      setWorkerStatus(window.ShiftFuelPhone?.validationMessage || 'Enter a valid 10-digit phone number.');
      return;
    }

    // Check for phone duplicate before uploading photo.
    if (phone) {
      const cleanNew = phone.replace(/\D/g, '');
      const cleanCurrent = (currentEmployee.phone || '').replace(/\D/g, '');
      if (cleanNew !== cleanCurrent) {
        const { data: phoneCheck, error: phoneCheckError } = await workerDb
          .from('employees_public')
          .select('id,full_name')
          .eq('active', true)
          .neq('id', currentEmployee.id);
        if (phoneCheckError) throw phoneCheckError;
        if ((phoneCheck || []).some((employee) => normalizePhone(employee.phone) === cleanNew)) {
          setWorkerStatus('That phone number is already used by another worker. Please use a different number.');
          return;
        }
      }
    }

    // Resolve photo URLs: upload new original if file selected; use canvas-cropped blob for
    // cropped_photo_url; for edit-framing with no new file, regenerate crop from boundary editor.
    let originalPhotoUrl = currentEmployee.original_photo_url || currentEmployee.photo_url || null;
    let croppedPhotoUrl  = currentEmployee.cropped_photo_url  || currentEmployee.photo_url || null;

    if (file) {
      // Delete old storage files before uploading new ones
      await deleteOldWorkerPhotos(
        currentEmployee.original_photo_url || currentEmployee.photo_url,
        currentEmployee.cropped_photo_url  || currentEmployee.photo_url,
      );
      originalPhotoUrl = await uploadWorkerPhoto(file);
      if (workerCroppedPhotoBlob) {
        croppedPhotoUrl = await uploadWorkerPhoto(workerCroppedPhotoBlob);
      } else {
        croppedPhotoUrl = originalPhotoUrl;
      }
    } else if (workerPhotoBoundaryImage?.naturalWidth && workerPhotoBoundaryImage.getAttribute('src')) {
      // Edit framing only â€” regenerate crop without re-uploading original.
      // Delete old cropped file only (original stays the same)
      await deleteOldWorkerPhotos(null, currentEmployee.cropped_photo_url);
      const croppedFile = await window.ShiftFuelPhoto?.cropToBlobFromBoundaryEditor(
        workerPhotoBoundaryImage, workerProfilePhotoZoom, workerProfilePhotoPosition.x, workerProfilePhotoPosition.y
      );
      if (croppedFile) croppedPhotoUrl = await uploadWorkerPhoto(croppedFile);
    }

    const photoUrl = croppedPhotoUrl || originalPhotoUrl; // backward-compat

    const employeeUpdates = {
      full_name: fullName,
      username: username || null,
      phone,
      home_location: homeLocation,
      photo_url: photoUrl,
      original_photo_url: originalPhotoUrl,
      cropped_photo_url: croppedPhotoUrl,
      photo_zoom: photoZoom,
      photo_position_x: photoPositionX,
      photo_position_y: photoPositionY,
      profile_updated_at: new Date().toISOString(),
    };

    const { data: rpcRows, error } = await workerDb.rpc('worker_update_profile', {
      p_token: SESSION_WORKER_TOKEN,
      p_data: employeeUpdates,
    });

    if (error) throw error;
    const data = (rpcRows || [])[0] || { ...currentEmployee, ...employeeUpdates };

    currentEmployee = data;
    sessionStorage.setItem('shiftfuel_worker', currentEmployee.full_name);
    if (workerPortalHeading) workerPortalHeading.textContent = currentEmployee.full_name;
    workerProfileForm.reset();
    if (workerProfileName) workerProfileName.value = currentEmployee.full_name;
    if (workerProfileUsername) workerProfileUsername.value = currentEmployee.username || '';
    if (workerProfilePhone) workerProfilePhone.value = formatPhone(currentEmployee.phone || '');
    if (workerProfileStarted) workerProfileStarted.value = currentEmployee.started_at || '';
    currentEmployee.photo_position_x = photoPositionX;
    currentEmployee.photo_position_y = photoPositionY;
    showWorkerPhoto(
      currentEmployee.cropped_photo_url || currentEmployee.photo_url || '',
      currentEmployee.original_photo_url || currentEmployee.photo_url || '',
      currentEmployee.photo_zoom || 1, currentWorkerPhotoPositionFromEmployee()
    );
    clearWorkerBoundaryPreview();
    resetWorkerPhotoCrop();
    setWorkerStatus('Worker profile saved.');
  } catch (error) {
    console.error('Worker profile save failed:', error);
    const msg = String(error.message || '');
    if (error.code === '23505' || /employees_username|duplicate key|already exists/i.test(msg)) {
      setWorkerStatus('That username is already taken. Please choose a different one.');
      workerProfileUsername?.focus();
      return;
    }
    setWorkerStatus(`Could not save worker profile: ${msg || 'Make sure employee profile columns and storage are set up.'}`);
  }
});

workerProfilePhoto?.addEventListener('change', () => {
  const file = workerProfilePhoto.files?.[0];
  if (file) {
    if (workerCroppedPreviewUrl) {
      URL.revokeObjectURL(workerCroppedPreviewUrl);
    }
    if (workerBoundaryPreviewUrl) {
      URL.revokeObjectURL(workerBoundaryPreviewUrl);
    }
    workerCroppedPreviewUrl = URL.createObjectURL(file);
    workerBoundaryPreviewUrl = URL.createObjectURL(file);
    workerProfilePhotoZoom = 1;
    workerProfilePhotoPosition = { x: 0, y: 0 };
    showWorkerPhoto(workerCroppedPreviewUrl, workerProfilePhotoZoom, workerProfilePhotoPosition);
    showWorkerBoundaryPreview(workerBoundaryPreviewUrl);
    setWorkerStatus('Profile photo selected. Save the worker profile to upload it.');
  } else {
    resetWorkerPhotoCrop();
    clearWorkerBoundaryPreview();
    showWorkerPhoto(currentEmployee?.photo_url || '');
  }
});

workerPhotoDisplayZoom?.addEventListener('input', () => {
  workerProfilePhotoZoom = Number(workerPhotoDisplayZoom.value || 1);
  applyWorkerPhotoZoom();
  setWorkerStatus('Profile photo zoom updated. Save the worker profile to keep it.');
});

workerPhotoBoundaryPreview?.addEventListener('pointerdown', (event) => {
  if (workerPhotoBoundaryPanel?.hidden || !workerPhotoBoundaryImage?.getAttribute('src')) return;

  workerPhotoDisplayDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    originalX: Number(workerProfilePhotoPosition.x || 0),
    originalY: Number(workerProfilePhotoPosition.y || 0),
  };
  workerPhotoBoundaryPreview.setPointerCapture(event.pointerId);
  workerPhotoBoundaryPreview.classList.add('is-dragging');
});

workerPhotoBoundaryPreview?.addEventListener('pointermove', (event) => {
  if (!workerPhotoDisplayDrag || workerPhotoDisplayDrag.pointerId !== event.pointerId) return;

  const size = workerPhotoBoundaryPreview.getBoundingClientRect().width || 320;
  const deltaX = ((event.clientX - workerPhotoDisplayDrag.startX) / size) * 100;
  const deltaY = ((event.clientY - workerPhotoDisplayDrag.startY) / size) * 100;

  workerProfilePhotoPosition = {
    x: Math.max(-50, Math.min(50, workerPhotoDisplayDrag.originalX + deltaX)),
    y: Math.max(-50, Math.min(50, workerPhotoDisplayDrag.originalY + deltaY)),
  };
  applyWorkerPhotoZoom();
  setWorkerStatus('Profile photo position updated. Save the worker profile to keep it.');
});

function endWorkerPhotoDisplayDrag(event) {
  if (!workerPhotoDisplayDrag || workerPhotoDisplayDrag.pointerId !== event.pointerId) return;

  workerPhotoBoundaryPreview?.releasePointerCapture(event.pointerId);
  workerPhotoBoundaryPreview?.classList.remove('is-dragging');
  workerPhotoDisplayDrag = null;
}

workerPhotoBoundaryPreview?.addEventListener('pointerup', endWorkerPhotoDisplayDrag);
workerPhotoBoundaryPreview?.addEventListener('pointercancel', endWorkerPhotoDisplayDrag);

editWorkerPhoto?.addEventListener('click', () => {
  const actionsPanel = document.querySelector('#worker-photo-editor-actions');
  const editFramingBtn = document.querySelector('#edit-worker-framing');
  if (actionsPanel) {
    // Toggle the options panel; disable "Edit framing" if no photo exists yet
    if (editFramingBtn) editFramingBtn.disabled = !currentEmployee?.photo_url;
    actionsPanel.hidden = !actionsPanel.hidden;
  } else {
    // Fallback: open file picker directly
    if (workerProfilePhoto) workerProfilePhoto.value = '';
    workerProfilePhoto?.click();
  }
});

document.querySelector('#upload-new-worker-photo')?.addEventListener('click', () => {
  document.querySelector('#worker-photo-editor-actions').hidden = true;
  if (workerProfilePhoto) workerProfilePhoto.value = '';
  workerProfilePhoto?.click();
});

document.querySelector('#edit-worker-framing')?.addEventListener('click', () => {
  document.querySelector('#worker-photo-editor-actions').hidden = true;
  const sourceUrl = currentEmployee?.original_photo_url || currentEmployee?.photo_url;
  if (!sourceUrl) return;
  // Load original (uncropped) photo for framing. workerCroppedPhotoBlob stays null so no re-upload of original.
  workerProfilePhotoZoom = Number(currentEmployee.photo_zoom || 1);
  workerProfilePhotoPosition = currentWorkerPhotoPositionFromEmployee();
  if (workerBoundaryPreviewUrl) { URL.revokeObjectURL(workerBoundaryPreviewUrl); workerBoundaryPreviewUrl = ''; }
  showWorkerBoundaryPreview(sourceUrl);
  setWorkerStatus('Adjust zoom and position, then save the worker profile.');
});

// Clicking the profile photo frame opens the large modal view.
// The frame gets data-open-worker-photo set dynamically by showWorkerPhoto(),
// so the global delegation in photo-utils.js handles the click automatically.

workerPhotoCropChoose?.addEventListener('click', () => {
  if (workerProfilePhoto) workerProfilePhoto.value = '';
  workerProfilePhoto?.click();
});

workerPhotoCropUse?.addEventListener('click', async () => {
  if (workerPhotoCropStatus) workerPhotoCropStatus.textContent = 'Preparing cropped photo...';
  workerCroppedPhotoBlob = await makeCroppedWorkerPhoto();

  if (!workerCroppedPhotoBlob) {
    if (workerPhotoCropStatus) workerPhotoCropStatus.textContent = 'Could not crop this image. Choose another photo.';
    return;
  }

  if (workerCroppedPreviewUrl) {
    URL.revokeObjectURL(workerCroppedPreviewUrl);
  }
  workerCroppedPreviewUrl = URL.createObjectURL(workerCroppedPhotoBlob);
  showWorkerPhoto(workerCroppedPreviewUrl);
  if (workerPhotoCropPanel) workerPhotoCropPanel.hidden = true;
  if (workerPhotoCropStatus) workerPhotoCropStatus.textContent = 'Cropped photo ready. Save the profile to upload it.';
  setWorkerStatus('Cropped photo ready. Save the worker profile to upload it.');
});

workerPhotoCropCancel?.addEventListener('click', () => {
  if (workerProfilePhoto) workerProfilePhoto.value = '';
  resetWorkerPhotoCrop();
  showWorkerPhoto(currentEmployee?.photo_url || '');
});

workerPhotoCropZoom?.addEventListener('input', () => {
  updateWorkerCropPreview();
  workerCroppedPhotoBlob = null;
  if (workerPhotoCropStatus) workerPhotoCropStatus.textContent = 'Crop changed. Use the cropped photo again before saving.';
});

workerPhotoCropImage?.addEventListener('pointerdown', (event) => {
  if (!workerCropImageUrl) return;
  workerCropDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    originX: workerCropOffset.x,
    originY: workerCropOffset.y,
  };
  workerPhotoCropImage.setPointerCapture(event.pointerId);
  workerPhotoCropImage.classList.add('is-dragging');
});

workerPhotoCropImage?.addEventListener('pointermove', (event) => {
  if (!workerCropDrag || workerCropDrag.pointerId !== event.pointerId) return;

  workerCropOffset = {
    x: workerCropDrag.originX + event.clientX - workerCropDrag.startX,
    y: workerCropDrag.originY + event.clientY - workerCropDrag.startY,
  };

  updateWorkerCropPreview();
  workerCroppedPhotoBlob = null;
  if (workerPhotoCropStatus) workerPhotoCropStatus.textContent = 'Crop moved. Use the cropped photo again before saving.';
});

function endWorkerCropDrag(event) {
  if (!workerCropDrag || workerCropDrag.pointerId !== event.pointerId) return;
  workerPhotoCropImage?.releasePointerCapture(event.pointerId);
  workerPhotoCropImage?.classList.remove('is-dragging');
  workerCropDrag = null;
}

workerPhotoCropImage?.addEventListener('pointerup', endWorkerCropDrag);
workerPhotoCropImage?.addEventListener('pointercancel', endWorkerCropDrag);

let passwordModalForced = false;

function openPasswordModal(forced = false) {
  passwordModalForced = forced;
  if (!workerPasswordModal) return;
  workerPasswordModal.removeAttribute('hidden');
  if (workerPasswordModalClose) workerPasswordModalClose.hidden = forced;
  if (forced) setWorkerPasswordStatus('You must set a new password before continuing.');
  wpcCurrent?.focus();
}

function closePasswordModal() {
  if (passwordModalForced) return;
  workerPasswordModal?.setAttribute('hidden', '');
  workerPasswordChangeForm?.reset();
  setWorkerPasswordStatus('');
}

openChangePasswordBtn?.addEventListener('click', () => openPasswordModal(false));
workerPasswordModalClose?.addEventListener('click', closePasswordModal);
workerPasswordModal?.addEventListener('click', (event) => {
  if (event.target === workerPasswordModal) closePasswordModal();
});

function toggleWorkerPanel(sectionId, show) {
  const overlay = document.getElementById(sectionId);
  if (!overlay) return;
  const shouldShow = show ?? overlay.hidden;
  overlay.hidden = !shouldShow;
}

document.querySelector('#open-schedule-btn')?.addEventListener('click', () => {
  document.querySelector('[data-tab-view="schedule"]')?.click();
});

document.querySelector('#open-edit-profile-btn')?.addEventListener('click', () => toggleWorkerPanel('worker-account', true));
document.querySelector('#close-worker-account')?.addEventListener('click', () => toggleWorkerPanel('worker-account', false));

document.querySelector('#worker-reviews-trigger')?.addEventListener('click', () => toggleWorkerPanel('worker-reviews-section', true));
document.querySelector('#close-worker-reviews')?.addEventListener('click', () => toggleWorkerPanel('worker-reviews-section', false));

['worker-reviews-section', 'worker-account', 'worker-legal-modal'].forEach((id) => {
  const overlay = document.getElementById(id);
  overlay?.addEventListener('click', (event) => {
    if (event.target === overlay) toggleWorkerPanel(id, false);
  });
});

// Legal documents open in a worker-styled modal instead of navigating to the
// public marketing site. Content is fetched from the existing legal pages
// (their .legal-card block) so there's a single source of truth.
const WORKER_LEGAL_TITLES = {
  'privacy.html': 'Privacy Policy',
  'terms.html': 'Terms of Service',
  'liability-waiver.html': 'Liability Waiver',
};
async function openWorkerLegal(page) {
  const content = document.querySelector('#worker-legal-content');
  if (!content) return;
  const title = document.querySelector('#worker-legal-title');
  if (title) title.textContent = WORKER_LEGAL_TITLES[page] || 'Legal';
  content.innerHTML = '<p class="field-help">Loading…</p>';
  toggleWorkerPanel('worker-legal-modal', true);
  try {
    const html = await (await fetch(page)).text();
    const card = new DOMParser().parseFromString(html, 'text/html').querySelector('.legal-card');
    content.innerHTML = card ? card.innerHTML : '<p class="field-help">Could not load this document.</p>';
  } catch (_) {
    content.innerHTML = '<p class="field-help">Could not load this document. Check your connection and try again.</p>';
  }
}
document.querySelectorAll('.worker-legal-link').forEach((btn) => {
  btn.addEventListener('click', () => openWorkerLegal(btn.dataset.legal));
});
document.querySelector('#close-worker-legal')?.addEventListener('click', () => toggleWorkerPanel('worker-legal-modal', false));

workerPasswordChangeForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const currentPw = wpcCurrent?.value || '';
  const newPw = wpcNew?.value || '';
  const confirmPw = wpcConfirm?.value || '';

  if (newPw.length < 10) {
    setWorkerPasswordStatus('New password must be at least 10 characters.');
    return;
  }

  if (newPw !== confirmPw) {
    setWorkerPasswordStatus('Passwords do not match.');
    return;
  }

  setWorkerPasswordStatus('Updating password...');

  try {
    const { error } = await workerDb.rpc('worker_change_password_secure', {
      p_token: SESSION_WORKER_TOKEN,
      p_current_password: currentPw,
      p_new_password: newPw,
    });

    if (error) throw error;

    sessionStorage.removeItem('shiftfuel_worker_must_change_pw');
    passwordModalForced = false;
    workerPasswordChangeForm.reset();
    setWorkerPasswordStatus('Password updated successfully.');
    setTimeout(() => closePasswordModal(), 1500);
  } catch (err) {
    const msg = err?.message || '';
    if (msg.includes('INVALID_CURRENT_PASSWORD')) {
      setWorkerPasswordStatus('Current password is incorrect.');
    } else if (msg.includes('PASSWORD_TOO_SHORT')) {
      setWorkerPasswordStatus('New password must be at least 10 characters.');
    } else {
      console.error('Worker password update failed:', err);
      setWorkerPasswordStatus('Could not update password. Contact your admin.');
    }
  }
});

workerDaysGrid?.addEventListener('click', (event) => {
  const copyButton = event.target.closest('.worker-copy-day');
  const pasteButton = event.target.closest('.worker-paste-day');
  if (!copyButton && !pasteButton) return;

  const row = event.target.closest('.worker-day-row');
  const checkbox = row?.querySelector('.worker-day-enabled');
  const startInput = row?.querySelector('.worker-day-start');
  const endInput = row?.querySelector('.worker-day-end');

  if (copyButton) {
    copiedWorkerDaySchedule = {
      startsAt: startInput?.value || '09:00',
      endsAt: endInput?.value || '17:00',
      enabled: Boolean(checkbox?.checked),
    };
    refreshWorkerPasteButtons();
    setWorkerCopyMode('paste');
    setScheduleStatus(`Copied ${copiedWorkerDaySchedule.startsAt} to ${copiedWorkerDaySchedule.endsAt}.`);
    return;
  }

  if (pasteButton && copiedWorkerDaySchedule) {
    if (startInput) startInput.value = copiedWorkerDaySchedule.startsAt;
    if (endInput) endInput.value = copiedWorkerDaySchedule.endsAt;
    if (checkbox) checkbox.checked = copiedWorkerDaySchedule.enabled;
    const pastedSchedule = copiedWorkerDaySchedule;
    copiedWorkerDaySchedule = null;
    refreshWorkerPasteButtons();
    setWorkerCopyMode('copy');
    setScheduleStatus(`Pasted ${pastedSchedule.startsAt} to ${pastedSchedule.endsAt}. Copy another day to paste again.`);
  }
});

document.querySelector('#worker-available-today')?.addEventListener('click', () => {
  if (setWorkerDayAvailability(new Date().getDay(), true)) {
    setScheduleStatus('Marked today available. Save availability to keep this change.');
  }
});

document.querySelector('#worker-unavailable-today')?.addEventListener('click', () => {
  if (setWorkerDayAvailability(new Date().getDay(), false)) {
    setScheduleStatus('Marked today unavailable. Save availability to keep this change.');
  }
});

document.querySelector('#worker-copy-monday-all')?.addEventListener('click', () => {
  if (copyMondayScheduleToAllDays()) {
    setScheduleStatus('Copied Monday to all days. Save availability to keep this change.');
  }
});

workerDaysOffCalendar?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-day-off]');
  if (!button || button.disabled) return;

  const dayOff = button.dataset.dayOff;
  if (selectedWorkerDaysOff.has(dayOff)) {
    selectedWorkerDaysOff.delete(dayOff);
  } else {
    selectedWorkerDaysOff.add(dayOff);
  }

  renderWorkerDaysOffCalendar();
});

// Availability: Work Days and the Days Off calendar are both shown stacked (no
// tabs) — nothing to toggle.

workerScheduleForm?.addEventListener('submit', (event) => event.preventDefault());

saveWorkdaysButton?.addEventListener('click', () => {
  saveWorkerAvailability().catch((error) => {
    console.error('Worker availability save failed:', error);
    setScheduleStatus('Could not save availability. Check Supabase setup.');
  });
});

saveDaysOffButton?.addEventListener('click', () => {
  saveWorkerDaysOff().catch((error) => {
    console.error('Worker days off save failed:', error);
    setScheduleStatus('Could not save days off. Check Supabase setup.');
  });
});

renderWorkerDaysGrid([]);
renderWorkerDaysOffCalendar();
window.ShiftFuelPhoto?.initPhotoModal();
loadVehiclePsiGuides().finally(loadWorkerProfile);

// ============================================================
// merged from worker-cancelled-status-polish.js
// (runs after worker.js to patch generated worker job panels)
// ============================================================
// Worker portal visual polish and safety fixes.
// Loaded after worker.js so it can patch generated worker job panels.
(() => {
  if (!document.body?.classList.contains('worker-portal-page')) return;

  const style = document.createElement('style');
  style.textContent = `
    .status-pill.status-pill-cancelled,
    .guided-step.guided-step-cancelled {
      background: #fff1f2 !important;
      border-color: rgba(190, 18, 60, 0.35) !important;
      color: #9f1239 !important;
    }
    .guided-step.guided-step-cancelled h4,
    .guided-step.guided-step-cancelled .eyebrow,
    .guided-step.guided-step-cancelled .next-action-label {
      color: #9f1239 !important;
    }

    .worker-portal-page .checkbox-label {
      display: grid !important;
      grid-template-columns: 22px 1fr !important;
      align-items: start !important;
      gap: 10px !important;
      margin: 14px 0 !important;
      line-height: 1.45 !important;
    }
    .worker-portal-page .checkbox-label input[type="checkbox"] {
      width: 18px !important;
      height: 18px !important;
      min-width: 18px !important;
      min-height: 18px !important;
      max-width: 18px !important;
      max-height: 18px !important;
      margin: 3px 0 0 !important;
      padding: 0 !important;
      appearance: auto !important;
      -webkit-appearance: checkbox !important;
      accent-color: #073233;
      transform: none !important;
      box-shadow: none !important;
    }
    .worker-portal-page .checkbox-label span {
      display: block !important;
      width: auto !important;
    }
    .worker-portal-page .service-unable-charge-fee:disabled + span {
      color: #667674 !important;
    }
  `;
  document.head.appendChild(style);

  const textFixes = [
    [/â€”/g, '—'],
    [/â†’/g, '→'],
    [/âš\s*/g, '⚠ '],
  ];

  function fixTextNode(node) {
    let next = node.nodeValue;
    textFixes.forEach(([bad, good]) => { next = next.replace(bad, good); });
    if (next !== node.nodeValue) node.nodeValue = next;
  }

  function cleanupBrokenCharacters(root = document.body) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) fixTextNode(node);
  }

  function normalized(value) {
    return String(value || '').trim().toLowerCase();
  }

  function selectedReason(panel) {
    return normalized(panel?.querySelector('.service-unable-reason')?.value || '');
  }

  function isCustomerCancellationReason(reason) {
    const value = normalized(reason);
    return value.includes('customer requested cancellation')
      || value.includes('customer requested cancel')
      || value.includes('customer cancelled')
      || value.includes('customer canceled');
  }

  function serviceUnableReason(request, type) {
    const notes = String(request?.notes || '');
    const matches = Array.from(notes.matchAll(new RegExp(`\\[service_unable ${type}\\] [^:]+: ([^\\n]+)`, 'g')));
    return matches.length ? matches[matches.length - 1][1].trim() : '';
  }

  if (typeof serviceUnableFeeCharged === 'function') {
    const originalServiceUnableFeeCharged = serviceUnableFeeCharged;
    serviceUnableFeeCharged = function patchedServiceUnableFeeCharged(request, type) {
      if (isCustomerCancellationReason(serviceUnableReason(request, type))) return false;
      return originalServiceUnableFeeCharged(request, type);
    };
  }

  function applyServiceUnableFeeRules(panel) {
    if (!panel) return;
    const feeBox = panel.querySelector('.service-unable-charge-fee');
    if (!feeBox) return;

    const mustWaive = isCustomerCancellationReason(selectedReason(panel));

    if (mustWaive) {
      feeBox.checked = false;
      feeBox.disabled = true;
      const text = feeBox.closest('.checkbox-label')?.querySelector('span');
      if (text) {
        text.textContent = 'Service fee waived because the customer cancelled this service. No fuel/wash cost is charged without a receipt.';
      }
    } else {
      feeBox.disabled = false;
      const text = feeBox.closest('.checkbox-label')?.querySelector('span');
      if (text && text.textContent.includes('Service fee waived because')) {
        text.textContent = "Charge the service fee anyway (e.g. work was attempted). No fuel/wash cost is ever charged when there's no receipt — leave unchecked to waive the fee entirely.";
      }
    }
  }

  function applyServiceUnableFeeRulesEverywhere() {
    document.querySelectorAll('.service-unable-panel').forEach(applyServiceUnableFeeRules);
  }

  function polishKeyReturnPanels() {
    document.querySelectorAll('.keys-returned-panel').forEach((panel) => {
      const select = panel.querySelector('.key-returned-to-type');
      const otherWrap = panel.querySelector('.key-returned-other-wrap');
      if (!select || select.dataset.keyReturnPolished) return;
      select.dataset.keyReturnPolished = '1';
      const customerOption = Array.from(select.options).find((option) => option.value === 'customer');
      if (customerOption) {
        customerOption.textContent = customerOption.textContent.replace('Customer —', 'Customer -').replace('Customer –', 'Customer -');
      }
      select.addEventListener('change', () => {
        if (otherWrap) otherWrap.hidden = select.value !== 'other';
      });
    });
  }

  // After capturing payment, keep the job open for the worker until keys are documented returned.
  if (typeof sendWorkerToCustomerPayment === 'function') {
    const originalSendWorkerToCustomerPayment = sendWorkerToCustomerPayment;
    sendWorkerToCustomerPayment = async function patchedSendWorkerToCustomerPayment(button) {
      const id = button?.dataset?.id;
      const request = Array.isArray(allWorkerJobs) ? allWorkerJobs.find((item) => item.id === id) : null;
      await originalSendWorkerToCustomerPayment(button);

      // If the capture succeeded, worker.js reloads jobs. Move the row back into the worker queue as Awaiting key return.
      if (id && request && request.status !== 'awaiting_key_return' && !hasKeysReturnedRecorded(request)) {
        const timestamp = new Date().toISOString();
        const note = `[payment_captured_key_return_needed ${timestamp}] Final payment captured. Worker must return keys before the request is marked complete.`;
        const notes = request.notes ? `${request.notes}\n${note}` : note;
        // NOTE: supabase rpc() is thenable but has no .catch — it resolves to
        // { error }. Chaining .catch threw "catch is not a function" and surfaced a
        // false "Worker job action failed" even though the job completed.
        const { error: keyReturnError } = await workerDb.rpc('worker_update_request', {
          p_token: SESSION_WORKER_TOKEN,
          p_request_id: id,
          p_data: { status: 'in_service', notes, updated_at: timestamp },
        });
        if (keyReturnError) console.warn('Could not move captured job to key return step:', keyReturnError);
        await loadWorkerJobs().catch(() => {});
      }
    };
  }

  if (typeof completeWorkerRequest === 'function') {
    const originalCompleteWorkerRequest = completeWorkerRequest;
    completeWorkerRequest = async function patchedCompleteWorkerRequest(button) {
      const id = button?.dataset?.id;
      const request = Array.isArray(allWorkerJobs) ? allWorkerJobs.find((item) => item.id === id) : null;
      await originalCompleteWorkerRequest(button);

      if (id && request && request.status !== 'awaiting_key_return' && !hasKeysReturnedRecorded(request)) {
        const timestamp = new Date().toISOString();
        const note = `[totals_confirmed_key_return_needed ${timestamp}] Worker confirmed final totals. Keys must be returned before the request is marked complete.`;
        const notes = request.notes ? `${request.notes}\n${note}` : note;
        const { error: keyReturnError } = await workerDb.rpc('worker_update_request', {
          p_token: SESSION_WORKER_TOKEN,
          p_request_id: id,
          p_data: { status: 'in_service', notes, updated_at: timestamp },
        });
        if (keyReturnError) console.warn('Could not move completed job to key return step:', keyReturnError);
        await loadWorkerJobs().catch(() => {});
      }
    };
  }

  function applyCancelledStatusPolish() {
    cleanupBrokenCharacters();
    applyServiceUnableFeeRulesEverywhere();
    polishKeyReturnPanels();

    document.querySelectorAll('.status-pill').forEach((pill) => {
      const text = pill.textContent.trim().toLowerCase();
      const isCancelled = text.includes('cancellation received')
        || text.includes('cancelled')
        || text.includes('canceled');
      pill.classList.toggle('status-pill-cancelled', isCancelled);
    });

    document.querySelectorAll('.guided-step').forEach((panel) => {
      const text = panel.textContent.trim().toLowerCase();
      const isCancelled = text.includes('cancellation received')
        || text.includes('customer cancelled')
        || text.includes('customer canceled');
      panel.classList.toggle('guided-step-cancelled', isCancelled);
    });
  }

  document.addEventListener('change', (event) => {
    if (event.target.matches('.service-unable-reason')) {
      applyServiceUnableFeeRules(event.target.closest('.service-unable-panel'));
    }
  }, true);

  document.addEventListener('click', (event) => {
    const button = event.target.closest('.save-service-unable');
    if (!button) return;
    const panel = button.closest('.service-unable-panel');
    if (isCustomerCancellationReason(selectedReason(panel))) {
      const feeBox = panel?.querySelector('.service-unable-charge-fee');
      if (feeBox) {
        feeBox.checked = false;
        feeBox.disabled = true;
      }
    }
  }, true);

  document.addEventListener('DOMContentLoaded', applyCancelledStatusPolish);

  // All of the elements this polish touches (.status-pill, .guided-step,
  // .service-unable-panel, .keys-returned-panel) only ever render inside the
  // job list, which gets fully replaced on every refresh. Watching that
  // container instead of the whole document avoids re-scanning the entire
  // page (including unrelated things like typing in inputs) on every change.
  let observerTarget = null;
  const observer = new MutationObserver(applyCancelledStatusPolish);

  function attachObserver() {
    const jobList = document.querySelector('#worker-job-list');
    const target = jobList || document.body;
    if (target === observerTarget) return;
    observer.disconnect();
    observer.observe(target, { childList: true, subtree: true });
    observerTarget = target;
  }

  attachObserver();
  document.addEventListener('DOMContentLoaded', attachObserver);
})();

// ============================================================
// Uber-style worker job-card redesign (presentation only).
// Reshapes the existing job card so the CURRENT ACTION is
// unmistakable: one big labeled "what's next" callout + a
// full-width, tall action button, with the header / progress
// stepper / details quieted down around it. No job logic, GPS,
// or push wiring is touched — this is pure CSS over the classes
// worker.js already renders.
// ============================================================
(() => {
  if (!document.body?.classList.contains('worker-portal-page')) return;
  const style = document.createElement('style');
  style.id = 'worker-card-redesign-style';
  style.textContent = `
    /* Card: calmer, roomier container so the action stands out. */
    .worker-portal-page .worker-job-card {
      border-radius: 18px !important;
      padding: 18px !important;
      box-shadow: 0 8px 24px rgba(13,59,59,.07) !important;
    }
    .worker-portal-page .worker-job-card .request-card-header { align-items: center !important; }
    .worker-portal-page .worker-job-card .request-card-header h3 {
      font-size: 1.25rem !important;
      margin: 2px 0 0 !important;
    }
    .worker-portal-page .worker-job-card .request-card-header .eyebrow {
      font-size: .72rem !important; letter-spacing: .06em !important;
    }
    .worker-portal-page .worker-job-card .status-pill {
      font-weight: 700 !important; border-radius: 999px !important;
    }

    /* Progress stepper: compact + quiet — it's context, not the focus. */
    .worker-portal-page .worker-vstepper { margin: 14px 0 !important; }
    .worker-portal-page .worker-vstep { padding: 4px 0 !important; }
    .worker-portal-page .worker-vstep-dot {
      width: 22px !important; height: 22px !important; font-size: .72rem !important;
    }
    .worker-portal-page .worker-vstep.is-upcoming { opacity: .5 !important; }

    /* "Job details": a clean, quiet, obviously-tappable disclosure row. */
    .worker-portal-page .worker-job-details > summary {
      padding: 12px 14px !important;
      border-radius: 12px !important;
      background: rgba(7,50,51,.04) !important;
      font-weight: 700 !important;
      cursor: pointer !important;
    }

    /* ── The hero: the guided-step action panel ── */
    .worker-portal-page .guided-step {
      margin-top: 16px !important;
      padding: 18px !important;
      border-radius: 16px !important;
      border: 1px solid rgba(7,50,51,.12) !important;
      background: linear-gradient(180deg, #ffffff, #f1f7f3) !important;
    }
    .worker-portal-page .guided-step .eyebrow {
      font-size: .7rem !important; letter-spacing: .08em !important;
      text-transform: uppercase !important; color: #5b6b67 !important;
      margin: 0 0 2px !important;
    }
    .worker-portal-page .guided-step h4 {
      font-size: 1.15rem !important; font-weight: 800 !important;
      color: #073233 !important; margin: 0 0 10px !important;
    }
    /* The "do this now" instruction, as a labeled callout — the thing the
       worker's eye should land on. */
    .worker-portal-page .guided-step .next-action-label {
      font-size: 1rem !important; line-height: 1.5 !important; color: #1c2b28 !important;
      background: #ffffff !important;
      border-left: 4px solid #16a34a !important;
      border-radius: 0 10px 10px 0 !important;
      padding: 12px 14px !important; margin: 0 0 16px !important;
    }
    .worker-portal-page .guided-step .next-action-label strong {
      display: block !important; font-size: .7rem !important;
      text-transform: uppercase !important; letter-spacing: .06em !important;
      color: #16a34a !important; margin-bottom: 3px !important;
    }

    /* The big action: stacked, full-width, tall — Uber's one-obvious-tap. */
    .worker-portal-page .guided-step .admin-button-row {
      display: flex !important; flex-direction: column !important;
      gap: 10px !important; margin: 0 !important;
    }
    .worker-portal-page .guided-step .admin-button-row .button {
      width: 100% !important; min-height: 56px !important;
      font-size: 1.05rem !important; font-weight: 800 !important;
      border-radius: 14px !important;
      display: inline-flex !important; align-items: center !important; justify-content: center !important;
    }
    .worker-portal-page .guided-step .admin-button-row .button.primary {
      order: 1 !important;
      background: #073233 !important;
      box-shadow: 0 6px 16px rgba(7,50,51,.22) !important;
    }
    .worker-portal-page .guided-step .admin-button-row .button.primary:active { transform: translateY(1px); }
    /* Back / secondary: present but visibly quieter, always below the primary. */
    .worker-portal-page .guided-step .admin-button-row .button.secondary {
      order: 2 !important; min-height: 46px !important;
      font-size: .95rem !important; font-weight: 700 !important;
      background: transparent !important;
      border: 1px solid rgba(7,50,51,.2) !important;
      color: #073233 !important; box-shadow: none !important;
    }
    .worker-portal-page .guided-step .admin-button-row .button.danger { order: 3 !important; }
  `;
  document.head.appendChild(style);
})();

// ── Payouts & fuel card (worker self-service: Phase 2/3) ─────────────────────
// Lets a worker onboard their Stripe Connect (direct-deposit) account and view
// the virtual fuel/car-wash card their admin issued. Both read straight from
// the serverless functions using the worker session token.
(function () {
  const token = sessionStorage.getItem('shiftfuel_worker_token') || '';
  if (!token) return;

  async function callApi(path, action, extra) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, caller_token: token, ...(extra || {}) }),
    });
    let data = {};
    try { data = await res.json(); } catch { /* ignore */ }
    return { ok: res.ok, data };
  }

  function fmtCardNumber(number, last4) {
    if (number) return number.replace(/(.{4})/g, '$1 ').trim();
    return `•••• •••• •••• ${last4 || '••••'}`;
  }

  function walletHelpHtml(hasFullNumber) {
    return `
      <div class="worker-wallet-help" hidden>
        <strong>Add to Apple Wallet</strong>
        <ol>
          <li>Open the Apple Wallet app.</li>
          <li>Tap <strong>+</strong>, then choose <strong>Debit or Credit Card</strong>.</li>
          <li>Choose <strong>Enter Card Details Manually</strong>.</li>
          <li>Use the virtual card number, expiration, and CVC shown above.</li>
        </ol>
        <p class="field-help">${hasFullNumber ? 'Apple may ask for verification before the card can be used for tap-to-pay.' : 'Full card details are not available right now, so add-to-wallet may need to wait until Stripe returns the full virtual card details.'}</p>
      </div>
    `;
  }

  async function refreshConnect() {
    const status = document.getElementById('worker-connect-status');
    const help = document.getElementById('worker-connect-help');
    const btn = document.getElementById('worker-connect-btn');
    if (!status || !help || !btn) return;
    try {
      const { data } = await callApi('/api/payouts', 'connect_status', {});
      if (data.ready) {
        status.textContent = 'Active';
        status.className = 'worker-payout-status is-ready';
        help.textContent = 'Your bank is connected. Payouts arrive by direct deposit.';
        btn.hidden = false; btn.textContent = 'Manage payout account';
      } else if (data.account_id) {
        status.textContent = 'Finish setup';
        status.className = 'worker-payout-status is-pending';
        help.textContent = 'You started setup but haven’t finished. Tap below to complete it.';
        btn.hidden = false; btn.textContent = 'Finish payout setup';
      } else {
        status.textContent = 'Not set up';
        status.className = 'worker-payout-status is-pending';
        help.textContent = 'Set up your bank to get paid by direct deposit.';
        btn.hidden = false; btn.textContent = 'Set up payout account';
      }
    } catch {
      status.textContent = 'Unavailable';
      status.className = 'worker-payout-status is-pending';
    }
  }

  async function startOnboarding(btn) {
    const original = btn.textContent;
    btn.disabled = true; btn.textContent = 'Opening…';
    try {
      const { data } = await callApi('/api/payouts', 'connect_onboarding_link', {});
      if (data.url) { window.location.href = data.url; return; }
      window.alert(data.error || 'Could not start payout setup. Please try again.');
    } catch {
      window.alert('Could not start payout setup. Please try again.');
    }
    btn.disabled = false; btn.textContent = original;
  }

  async function refreshFuelCard() {
    const status = document.getElementById('worker-fuelcard-status');
    const body = document.getElementById('worker-fuelcard-body');
    if (!status || !body) return;
    try {
      const { data } = await callApi('/api/fuel-cards', 'card_details', {});
      const v = data.virtual || (data.has_card ? data : { has_card: false });
      const p = data.physical || { has_card: false };

      if (!v.has_card && !p.has_card) {
        status.textContent = 'Not issued';
        status.className = 'worker-payout-status is-pending';
        body.innerHTML = '<p class="field-help">Your fuel &amp; car-wash card will appear here once your admin issues it.</p>';
        return;
      }

      const anyActive = (v.has_card && v.status === 'active') || (p.has_card && p.status === 'active');
      status.textContent = anyActive ? 'Active' : 'Pending';
      status.className = 'worker-payout-status ' + (anyActive ? 'is-ready' : 'is-pending');

      let html = '';
      if (v.has_card) {
        const frozen = v.status !== 'active';
        const exp = `${String(v.exp_month || '').padStart(2, '0')}/${String(v.exp_year || '').slice(-2)}`;
        html += `
          <div class="worker-fuel-card-visual${frozen ? ' is-frozen' : ''}">
            <div class="wfc-brand">ShiftFuel · Virtual · Fuel &amp; Wash</div>
            <div class="wfc-number">${fmtCardNumber(v.number, v.last4)}</div>
            <div class="wfc-row"><span>Exp ${exp}</span>${v.cvc ? `<span>CVC ${v.cvc}</span>` : ''}</div>
          </div>
          <p class="field-help">Online &amp; in-app fuel/car-wash only${v.per_transaction_cap ? `, up to $${v.per_transaction_cap} per transaction` : ''}.${v.number ? ' <strong>Test card — sandbox only.</strong>' : ''}${frozen ? ' <strong>Frozen.</strong>' : ''}</p>
          <button class="button secondary worker-wallet-help-toggle" type="button">Add to Apple Wallet</button>
          ${walletHelpHtml(Boolean(v.number && v.cvc))}`;
      }
      if (p.has_card) {
        const active = p.status === 'active';
        html += `
          <div class="worker-phys-card-row">
            <div>
              <strong>Physical card (tap at the pump)</strong>
              <p class="field-help">•••• ${p.last4 || '••••'} · ${active ? 'Active — ready to tap or insert.' : 'On the way — activate it when it arrives.'}</p>
            </div>
            ${active ? '' : '<button class="button primary worker-phys-activate-self" type="button">Activate card</button>'}
          </div>`;
      }
      body.innerHTML = html;
    } catch {
      status.textContent = 'Unavailable';
      status.className = 'worker-payout-status is-pending';
    }
  }

  async function activatePhysical(btn) {
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = 'Activating…';
    const { ok, data } = await callApi('/api/fuel-cards', 'activate_physical_card', {});
    if (ok && data.status === 'active') {
      refreshFuelCard();
    } else {
      btn.disabled = false;
      btn.textContent = original;
      window.alert(data.error || 'Could not activate the card. Please try again.');
    }
  }

  function init() {
    const btn = document.getElementById('worker-connect-btn');
    if (!btn) return; // earnings markup not present
    btn.addEventListener('click', () => startOnboarding(btn));
    const fuelBody = document.getElementById('worker-fuelcard-body');
    if (fuelBody) {
      fuelBody.addEventListener('click', (e) => {
        const act = e.target.closest('.worker-phys-activate-self');
        if (act) activatePhysical(act);
        const wallet = e.target.closest('.worker-wallet-help-toggle');
        if (wallet) {
          const panel = fuelBody.querySelector('.worker-wallet-help');
          if (panel) {
            panel.hidden = !panel.hidden;
            wallet.textContent = panel.hidden ? 'Add to Apple Wallet' : 'Hide Apple Wallet steps';
          }
        }
      });
    }
    refreshConnect();
    refreshFuelCard();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
