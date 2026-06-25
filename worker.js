const workerDb = window.ShiftFuelSupabase;

const workerProfileForm = document.querySelector('#worker-profile-form');
const workerProfileName = document.querySelector('#worker-profile-name');
const workerProfileUsername = document.querySelector('#worker-profile-username');
const workerProfilePhone = document.querySelector('#worker-profile-phone');
const workerProfileLocation = document.querySelector('#worker-profile-location');
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
const workerCurrentLocation = document.querySelector('#worker-current-location');
const workerCurrentJobsToday = document.querySelector('#worker-current-jobs-today');
const workerCurrentRating = document.querySelector('#worker-current-rating');
const workerWorkingSince = document.querySelector('#worker-working-since');
const workerDashboardName = document.querySelector('#worker-dashboard-name');
const workerDashboardLocation = document.querySelector('#worker-dashboard-location');
const workerDashboardPhone = document.querySelector('#worker-dashboard-phone');
const workerScheduleForm = document.querySelector('#worker-schedule-form');
const workerScheduleStatus = document.querySelector('#worker-schedule-status');
const workerLocation = document.querySelector('#worker-location');
const workerDaysGrid = document.querySelector('#worker-days-grid');
const workerDaysOffCalendar = document.querySelector('#worker-days-off-calendar');
const workerDaysOffSummary = document.querySelector('#worker-days-off-summary');
const openWorkdaysPanel = document.querySelector('#open-workdays-panel');
const closeWorkdaysPanel = document.querySelector('#close-workdays-panel');
const workdaysPanel = document.querySelector('#workdays-panel');
const saveWorkdaysButton = document.querySelector('#save-workdays');
const openDaysOffPanel = document.querySelector('#open-days-off-panel');
const closeDaysOffPanel = document.querySelector('#close-days-off-panel');
const daysOffPanel = document.querySelector('#days-off-panel');
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
  }
  if (workerPresenceLabel) workerPresenceLabel.textContent = onBreak ? 'On break' : 'Online';
  if (workerBreakToggle) {
    workerBreakToggle.hidden = false;
    workerBreakToggle.textContent = onBreak ? 'End break' : 'Take a break';
  }
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

workerBreakToggle?.addEventListener('click', () => {
  workerPresenceStatus = workerPresenceStatus === 'on_break' ? 'online' : 'on_break';
  renderPresenceControls();
  sendWorkerHeartbeat();
});

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
document.querySelector('#worker-header-signout')?.addEventListener('click', () => {
  document.querySelector('#worker-signout-btn')?.click();
});

// Profile panel (mobile avatar button)
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
workerProfilePanelOverlay?.addEventListener('click', closeWorkerProfilePanel);
document.querySelector('#panel-signout')?.addEventListener('click', () => {
  closeWorkerProfilePanel();
  document.querySelector('#worker-signout-btn')?.click();
});
document.querySelector('#panel-change-password')?.addEventListener('click', () => {
  closeWorkerProfilePanel();
  document.querySelector('#open-change-password-btn')?.click();
});
document.querySelector('#panel-edit-profile')?.addEventListener('click', () => {
  closeWorkerProfilePanel();
  document.querySelector('#open-edit-profile-btn')?.click();
});
document.querySelector('#panel-enable-alerts')?.addEventListener('click', () => {
  closeWorkerProfilePanel();
  document.querySelector('#worker-enable-alerts')?.click();
});
document.querySelector('#panel-break-toggle')?.addEventListener('click', () => {
  closeWorkerProfilePanel();
  document.querySelector('#worker-break-toggle')?.click();
});

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

// Populate work location dropdowns from the shared SERVICE_CENTERS list.
function populateLocationSelects() {
  const options = SERVICE_CENTERS.map(loc =>
    `<option value="${loc}">${loc}</option>`
  ).join('');
  [workerLocation, workerProfileLocation].forEach(sel => {
    if (!sel) return;
    sel.innerHTML = `<option value="">Select service center</option>${options}`;
  });
}
populateLocationSelects();
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

// Unified active/open status list â€” keep in sync with admin.js, track.js,
// and the SQL active-status list in supabase-production-rls-lockdown.sql
// (worker_list_open_requests). The RPC filters server-side too, but the
// client keeps this guard so stale SQL cannot show closed requests.
const workerOpenStatuses = [
  'pending',
  'request_received',
  'accepted',
  'key_received',
  'vehicle_picked_up',
  'service_in_progress',
  'fueling_in_progress',
  'car_wash_in_progress',
  'partial_service_complete',
  'fueling_complete',
  'car_wash_complete',
  'fuel_receipt_uploaded',
  'wash_receipt_uploaded',
  'service_complete',
  'receipts_recorded',
  'returned_location_pending',
  'return_location_recorded',
  'return_photos_needed',
  'vehicle_returned',
  'inspection_needed',
  'inspection_recorded',
  'final_payment_processed',
  'awaiting_key_return',
  'keys_returned',
  'return_requested',
  'customer_return_requested',
  'cancelled_pending_key_return',
  'payment_issue',
  'authorization_too_low',
  'pending_customer_payment',
];

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeId(value) {
  return String(value || '').trim().toLowerCase();
}

function isWorkerOpenStatus(status) {
  return workerOpenStatuses.includes(String(status || ''));
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

function isActiveCustomerReturnWorkflow(request) {
  return hasCustomerReturnRequestAlert(request)
    && !['awaiting_key_return', 'keys_returned', 'complete', 'canceled_return_completed'].includes(request?.status);
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
  let digits = normalizePhone(value);
  if (digits.length === 11 && digits[0] === '1') digits = digits.slice(1);
  if (digits.length !== 10) return value || '';
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function attachPhoneInputFormatting(input) {
  if (!input || input.dataset.phoneFormatBound) return;
  input.dataset.phoneFormatBound = '1';
  input.addEventListener('input', () => {
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

attachPhoneInputFormatting(workerProfilePhone);

// Friendly labels for every status â€” keep in sync with admin.js and track.js.
// Raw database status strings must never be shown to a worker.
const workerStatusLabels = {
  pending: 'Request received',
  request_received: 'Request received',
  accepted: 'Accepted',
  key_received: 'Key received',
  vehicle_picked_up: 'Vehicle picked up',
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

const fallbackPsiGuides = [
  { make: 'Toyota', model: 'Camry', front_psi: 35, rear_psi: 35 },
  { make: 'Toyota', model: 'Corolla', front_psi: 32, rear_psi: 32 },
  { make: 'Honda', model: 'Civic', front_psi: 32, rear_psi: 32 },
  { make: 'Honda', model: 'Accord', front_psi: 32, rear_psi: 32 },
  { make: 'Nissan', model: 'Altima', front_psi: 33, rear_psi: 33 },
  { make: 'Hyundai', model: 'Elantra', front_psi: 33, rear_psi: 33 },
  { make: 'Hyundai', model: 'Sonata', front_psi: 34, rear_psi: 34 },
  { make: 'Ford', model: 'F-150', front_psi: 35, rear_psi: 35 },
  { make: 'Chevrolet', model: 'Silverado', front_psi: 35, rear_psi: 35 },
  { make: 'Subaru', model: 'Outback', front_psi: 35, rear_psi: 33 },
];

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
const BASE_FUEL_SERVICE_FEE = 15;
const BASE_WASH_SERVICE_FEE = 15;
const BASE_QUICK_INSPECTION_FEE = 5;

// Worker pay model:
//   - 50% of the service fees (fuel + wash + inspection), net of card processing.
//   - $0.725 per extra round-trip mile driven to a customer-chosen gas station
//     (IRS standard mileage rate); the company keeps the remaining $0.025/mile
//     of the $0.75/mile customer surcharge.
const WORKER_SERVICE_FEE_SHARE = 0.5;
const WORKER_MILEAGE_RATE = 0.725;

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

// Did the customer cancel after the worker already had the keys? Those workers
// are owed half the cancellation fee actually collected (no mileage — they never
// drove to a station).
function isCanceledAfterKeys(request) {
  const canceled = !!request.canceled_at || /cancel/i.test(String(request.status || ''));
  return canceled && !!request.key_received_at;
}

// Worker's estimated take-home for a job: 50% of the service fees (fuel + wash +
// inspection) net of Stripe processing (2.9% + $0.30), plus full mileage pay for
// any extra driving to a chosen station. A customer-cancel-after-keys pays 50% of
// the cancellation fee actually collected (no mileage). Never negative.
function workerNetPayout(request) {
  const completed = request.status === 'complete' || request.payment_status === 'captured';
  let gross = 0;
  let mileage = 0;
  if (completed) {
    const fees = feeSummary(request);
    gross = fees.fuel + fees.wash + fees.inspection;
    mileage = workerMileagePay(request);
  } else if (isCanceledAfterKeys(request) && request.payment_status === 'cancellation_fee_paid') {
    gross = Number(request.cancellation_fee ?? request.cancellation_fee_amount ?? 0);
  }
  let payout = mileage;
  if (gross > 0) {
    const stripe = roundMoneyValue(gross * PAYMENT_RECOVERY_RATE + PAYMENT_RECOVERY_FIXED);
    payout += Math.max(0, gross - stripe) * WORKER_SERVICE_FEE_SHARE;
  }
  return roundMoneyValue(Math.max(0, payout));
}

function transactionPricingSummary(request, receiptTotals = { fuel: 0, wash: 0 }) {
  // A service is chargeable if it was actually performed (has a receipt) or
  // admin/worker explicitly chose to charge the fee anyway for an
  // unable_to_complete service. Fuel/wash cost is never charged without a receipt.
  const fuelBase = serviceNeedsFuel(request) && (Number(receiptTotals.fuel || 0) > 0 || serviceUnableFeeCharged(request, 'fuel')) ? BASE_FUEL_SERVICE_FEE : 0;
  const washBase = serviceNeedsWash(request) && (Number(receiptTotals.wash || 0) > 0 || serviceUnableFeeCharged(request, 'wash')) ? BASE_WASH_SERVICE_FEE : 0;
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
  return transactionPricingSummary(request, receiptTotals).total;
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
  const storedEmployeeId = SESSION_WORKER_ID || localStorage.getItem(`shiftfuel_worker_id_${SESSION_WORKER_NAME}`);

  if (storedEmployeeId) {
    let { data: stored, error: storedError } = await workerDb
      .from('employees_public')
      .select('id,employee_code,full_name,phone,photo_url,original_photo_url,cropped_photo_url,photo_zoom,photo_position_x,photo_position_y,home_location,started_at,active,background_verified')
      .eq('id', storedEmployeeId)
      .limit(1);

    if (storedError) {
      const fallback = await workerDb
        .from('employees_public')
        .select('id,employee_code,full_name,phone,photo_url,original_photo_url,cropped_photo_url,home_location,started_at,active')
        .eq('id', storedEmployeeId)
        .limit(1);

      stored = fallback.data;
      storedError = fallback.error;
    }

    if (!storedError && stored?.length) {
      return {
        photo_url: '',
        photo_zoom: 1,
        photo_position_x: 0,
        photo_position_y: 0,
        started_at: '',
        ...stored[0],
      };
    }
  }

  let { data, error } = await workerDb
    .from('employees_public')
    .select('id,employee_code,full_name,phone,photo_url,original_photo_url,cropped_photo_url,photo_zoom,photo_position_x,photo_position_y,home_location,started_at,active')
    .eq('full_name', SESSION_WORKER_NAME)
    .limit(1);

  if (error) {
    const fallback = await workerDb
      .from('employees_public')
      .select('id,employee_code,full_name,phone,photo_url,original_photo_url,cropped_photo_url,home_location,started_at,active')
      .eq('full_name', SESSION_WORKER_NAME)
      .limit(1);

    data = fallback.data;
    error = fallback.error;
  }

  if (error) throw error;

  if (data?.length) {
    return {
      photo_url: '',
      photo_zoom: 1,
      photo_position_x: 0,
      photo_position_y: 0,
      started_at: '',
      ...data[0],
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

    const scheduleLocation = rows.find((row) => row.work_location)?.work_location || currentEmployee.home_location || DEFAULT_WORK_LOCATION;
    if (workerLocation) workerLocation.value = scheduleLocation;
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
    const headerAvatar = document.querySelector('#worker-header-avatar');
    if (headerAvatar) headerAvatar.textContent = (workerName.trim().charAt(0) || 'W').toUpperCase();
    const mobileAvatar = document.querySelector('#worker-mobile-avatar-initial');
    if (mobileAvatar) mobileAvatar.textContent = (workerName.trim().charAt(0) || 'W').toUpperCase();
    const panelName = document.getElementById('worker-panel-name');
    if (panelName) panelName.textContent = workerName;
    const panelLocation = document.getElementById('worker-panel-location');
    if (panelLocation) panelLocation.textContent = currentEmployee.home_location || '—';
    const panelPhone = document.getElementById('worker-panel-phone');
    if (panelPhone) panelPhone.textContent = currentEmployee.phone ? formatPhone(currentEmployee.phone) : 'Not provided';
    if (workerProfileName) workerProfileName.value = workerName;
    if (workerProfileUsername) workerProfileUsername.value = currentEmployee.username || '';
    if (workerProfilePhone) workerProfilePhone.value = formatPhone(currentEmployee.phone || '');
    if (workerProfileLocation) workerProfileLocation.value = currentEmployee.home_location || DEFAULT_WORK_LOCATION;
    if (workerProfileStarted) workerProfileStarted.value = currentEmployee.started_at || '';
    if (workerLocation) workerLocation.value = currentEmployee.home_location || DEFAULT_WORK_LOCATION;
    if (workerCurrentLocation) workerCurrentLocation.textContent = currentEmployee.home_location || DEFAULT_WORK_LOCATION;
    if (workerDashboardLocation) workerDashboardLocation.textContent = currentEmployee.home_location || DEFAULT_WORK_LOCATION;
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

  const workLocation = workerLocation?.value || DEFAULT_WORK_LOCATION;
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
  if (workerProfileLocation) workerProfileLocation.value = workLocation;
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
    completedEl.textContent = requests.filter((r) => r.status === 'complete').length;
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

// Build a turn-by-turn directions URL that opens the driver's native maps app
// (Apple Maps on iOS, Google Maps elsewhere). Prefers exact coordinates and
// falls back to the address text.
function mapsNavUrl({ lat, lon, address } = {}) {
  const nLat = Number(lat);
  const nLon = Number(lon);
  const hasCoords = Number.isFinite(nLat) && Number.isFinite(nLon) && (nLat !== 0 || nLon !== 0);
  const dest = hasCoords ? `${nLat},${nLon}` : String(address || '').trim();
  if (!dest) return '';
  const encoded = encodeURIComponent(dest);
  const isIOS = /iPad|iPhone|iPod/.test((typeof navigator !== 'undefined' && navigator.userAgent) || '');
  return isIOS
    ? `https://maps.apple.com/?daddr=${encoded}`
    : `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;
}

// "Navigate ›" link markup, or empty string when there's no usable destination.
function workerNavLink(dest, label = 'Navigate') {
  const url = mapsNavUrl(dest);
  return url ? ` <a class="worker-nav-link" href="${url}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)} ›</a>` : '';
}

function workerFormatService(request) {
  const parts = [request.service_label || request.service_type];
  if (request.fuel_type) parts.push(`Fuel: ${request.fuel_type}`);
  if (request.estimated_fuel_range) parts.push(`Est. range: ${request.estimated_fuel_range}`);
  if (request.wash_package_label) parts.push(`Wash: ${request.wash_package_label}`);
  if (request.quick_inspection) parts.push('Quick inspection');
  if (request.service_date) parts.push(request.service_date);
  if (request.desired_return_time) parts.push(`Return by: ${request.desired_return_time}`);
  return parts.filter(Boolean).join(' | ');
}

let expandedWorkerJobId = null;
// Tracks whether we've already auto-opened the active job's full card once, so
// the background poll (and later reloads) never re-expand it after a worker has
// deliberately collapsed it.
let hasAutoExpandedCurrentJob = false;

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
  if (status === 'complete' || status === 'keys_returned' || status === 'canceled_return_completed') return 'status-pill-complete';
  if (['cancelled_pending_key_return', 'customer_canceled', 'canceled', 'cancelled', 'denied', 'unable_to_complete', 'auto_reversed', 'closed_no_charge'].includes(status)) return 'status-pill-cancelled';
  if (['payment_issue', 'authorization_too_low', 'pending_customer_payment'].includes(status)) return 'status-pill-payment';
  if (['pending', 'request_received'].includes(status)) return 'status-pill-open';
  return 'status-pill-progress';
}

function workerStatusBadge(request) {
  return `<span class="status-pill ${workerStatusBadgeClass(request.status)}">${escapeHtml(workerStatusLabels[request.status] || request.status || '')}</span>`;
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
  const estPayout = workerNetPayout(request);
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
          ${estPayout > 0 ? `<span class="worker-est-fee">${money(estPayout)}</span>` : ''}
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

// One-step-at-a-time wizard card for an active job. The screen is dominated by
// the single current step (renderWorkerJobActions). The job's reference facts —
// address, parking, key handoff, vehicle, etc. — are tucked behind "Job details"
// so nothing competes with "what to do right now". The status/action engine and
// every action panel are reused unchanged; only the presentation is the wizard.
function renderWorkerCurrentJobCard(request) {
  const keyHandoff = request.key_handoff_details ? escapeHtml(request.key_handoff_details) : 'Not provided';
  const parking = [request.parking_location, request.parking_spot ? `spot ${request.parking_spot}` : ''].filter(Boolean).map(escapeHtml).join(', ') || 'Not provided';
  const returnBy = workerReturnByLabel(request);
  const phone = request.customer_phone ? normalizePhone(request.customer_phone) : '';
  const name = request.customer_name || 'Customer';
  const initial = escapeHtml((name.trim().charAt(0) || 'C').toUpperCase());
  const vehicleLine = [workerVehicleSummary(request) || 'Vehicle on file', request.service_label || request.service_type]
    .filter(Boolean).map(escapeHtml).join(' &middot; ');
  const isExpanded = expandedWorkerJobId === request.id;
  return `
    <article class="worker-card worker-current-job-card worker-wizard-card" data-current-job-id="${escapeHtml(request.id)}">
      <header class="worker-wizard-head">
        <span class="worker-avatar" aria-hidden="true">${initial}</span>
        <div class="worker-wizard-head-main">
          <h3 class="worker-current-job-name">${escapeHtml(name)}</h3>
          <p class="worker-card-vehicle">${vehicleLine}</p>
        </div>
        ${workerStatusBadge(request)}
      </header>

      ${renderWorkerHorizontalStepper(request)}

      <div class="worker-wizard-step">
        ${renderWorkerJobActions(request)}
      </div>

      <div class="worker-secondary-actions">
        ${phone ? `<a class="button secondary worker-secondary-btn" href="tel:${escapeHtml(phone)}">Call customer</a>` : ''}
        <button class="button secondary worker-secondary-btn worker-row-toggle" data-id="${escapeHtml(request.id)}" type="button" aria-expanded="${isExpanded}">${isExpanded ? 'Hide job details' : 'View job details'}</button>
      </div>
      ${isExpanded ? `
        <div class="worker-card-expanded">
          <div class="worker-job-facts worker-wizard-facts">
            ${workerFactRow(WK_ICONS.pin, 'Service address', `<span class="worker-job-address-value">${escapeHtml(workerFormatAddress(request))}</span>`)}
            ${workerFactRow(WK_ICONS.car, 'Parking', parking)}
            ${workerFactRow(WK_ICONS.key, 'Key handoff', keyHandoff)}
            ${returnBy ? workerFactRow(WK_ICONS.clock, 'Desired return', escapeHtml(returnBy)) : ''}
          </div>
          ${renderWorkerVerticalStepper(request)}
          ${renderWorkerJobInfoBlock(request, 'mine')}
        </div>
      ` : ''}
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
    container.innerHTML = '<div class="worker-state-card worker-state-empty"><p>No jobs scheduled today. You’re all caught up.</p></div>';
    return;
  }
  const focusHtml = focusJobs.map(renderWorkerCurrentJobCard).join('');
  const upcomingHtml = upcomingJobs.length ? `
    <div class="worker-upcoming-block">
      <h3 class="worker-upcoming-heading">Upcoming &middot; ${upcomingJobs.length}</h3>
      ${upcomingJobs.map(renderWorkerUpcomingRow).join('')}
    </div>` : '';
  container.innerHTML = focusHtml + upcomingHtml;
}

// Quiet, action-free row for a claimed job you can't start yet (one job at a time).
function renderWorkerUpcomingRow(request) {
  const initial = escapeHtml(((request.customer_name || 'C').trim().charAt(0) || 'C').toUpperCase());
  const when = workerReturnByLabel(request);
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
    { label: 'Accepted', value: counts.accepted, cls: 'is-accepted' },
    { label: 'Upcoming', value: counts.upcoming, cls: 'is-upcoming' },
    { label: 'Completed', value: counts.completed, cls: 'is-completed' },
    { label: 'Cancelled', value: counts.cancelled, cls: 'is-cancelled' },
  ];
  container.innerHTML = cells.map((c) => `
    <div class="worker-count-cell ${c.cls}">
      <span class="worker-count-value">${c.value}</span>
      <span class="worker-count-label">${c.label}</span>
    </div>`).join('');
}

// Earnings tab: completed jobs with their net take-home (service fees minus
// Stripe processing), plus a running total for the day.
function renderWorkerEarnings(completed) {
  const container = document.querySelector('#worker-earnings-list');
  if (!container) return;
  if (!completed.length) {
    container.innerHTML = '<div class="worker-state-card worker-state-empty"><p>No completed jobs yet today.</p></div>';
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
  if (status === 'complete') return 6;
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
  if (job.payment_status === 'captured') return 'Payment received';
  if (job.status === 'complete') return 'Job completed';
  return workerStatusLabels[job.status] || job.status || 'Status updated';
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

  const completed = myJobs.filter((job) => job.status === 'complete' && job.service_date && job.desired_return_time && job.updated_at);
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
      <p class="worker-job-address-line"><strong>Service address:</strong> <span class="worker-job-address-value">${escapeHtml(workerFormatAddress(request))}</span>${workerNavLink({ lat: request.address_lat, lon: request.address_lon, address: workerFormatAddress(request) })}</p>
      <p><strong>Parking:</strong> ${[request.parking_location, request.parking_spot ? `spot ${request.parking_spot}` : ''].filter(Boolean).map(escapeHtml).join(', ') || 'Not provided'}</p>
      ${(mode === 'mine' && request.key_handoff_details) ? `<p><strong>Key handoff:</strong> ${escapeHtml(request.key_handoff_details)}</p>` : ''}
      <p><strong>Service:</strong> ${escapeHtml(workerFormatService(request))}</p>
      ${String(request.service_type || '').includes('fuel') ? `<p><strong>Gas station:</strong> ${request.gas_station_name ? `${escapeHtml(request.gas_station_name)}${request.gas_station_address ? ` — ${escapeHtml(request.gas_station_address)}` : ''}${Number(request.gas_station_surcharge) > 0 ? ' <span class="worker-station-pref">(customer preferred)</span>' : ''}${workerNavLink({ lat: request.gas_station_lat, lon: request.gas_station_lon, address: request.gas_station_address || request.gas_station_name })}` : 'Closest station to the vehicle'}</p>` : ''}
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
        <span class="status-pill">${escapeHtml(workerStatusLabels[request.status] || request.status || '')}</span>
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

function workerBackStatusFor(request) {
  const map = {
    accepted:                'request_received',
    key_received:            'accepted',
    vehicle_picked_up:       'key_received',
    service_in_progress:     'vehicle_picked_up',
    fueling_complete:        'service_in_progress',
    car_wash_complete:       'service_in_progress',
    fuel_receipt_uploaded:   'fueling_complete',
    wash_receipt_uploaded:   'car_wash_complete',
    service_complete:        'service_in_progress',
    receipts_recorded:       'service_complete',
    returned_location_pending: 'receipts_recorded',
    return_location_recorded:  'returned_location_pending',
    return_photos_needed:      'return_location_recorded',
    vehicle_returned:          'return_photos_needed',
    inspection_needed:         'vehicle_returned',
    inspection_recorded:       'inspection_needed',
  };

  return map[request.status] || '';
}

function workerBackButton(request) {
  const previousStatus = workerBackStatusFor(request);
  return previousStatus
    ? `<button class="button secondary worker-update-status" data-id="${escapeHtml(request.id)}" data-status="${escapeHtml(previousStatus)}" type="button">Back</button>`
    : '';
}

function filePicker(label, className, extraAttributes = '', accept = 'image/*') {
  return `
    <label class="file-button-control">
      <span>${escapeHtml(label)}</span>
      <input class="${className}" ${extraAttributes} type="file" accept="${accept}">
      <span class="button primary file-button-text">Choose file</span>
      <span class="selected-file-name">No file chosen</span>
    </label>
  `;
}

function renderWorkerJobActions(request) {
  const actions = [];
  let activePanel = '';
  let nextAction = '';
  const hasReturnRequest = isActiveCustomerReturnWorkflow(request);

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
  } else if (request.status === 'request_received') {
    nextAction = 'Accept the request to begin service.';
    actions.push(workerPrimaryStatusButton(request, 'Accept request', 'accepted'));
  } else if (request.status === 'accepted') {
    nextAction = 'Tap Start to map the route to the vehicle, then confirm the keys/handoff are received. Can\'t make it? Send the job back to the open pool.';
    actions.push(`<button class="button primary worker-start-nav" data-route-map data-id="${escapeHtml(request.id)}" type="button">Start — open map</button>`);
    actions.push(`<button class="button secondary worker-update-status" data-id="${escapeHtml(request.id)}" data-status="key_received" type="button">Key received</button>`);
    actions.push(`<button class="button danger worker-release-job" data-id="${escapeHtml(request.id)}" type="button">Send back to open pool</button>`);
  } else if (request.status === 'key_received') {
    nextAction = 'Upload the pickup photo set below.';
    activePanel = renderWorkerPhotoPanel(request, 'pickup');
  } else if (request.status === 'vehicle_picked_up') {
    // Gateway: worker confirms they are beginning the service.
    // The customer tracker advances to "Service in progress" after this click.
    nextAction = 'Start the requested service.';
    actions.push(workerPrimaryStatusButton(request, 'Start service', 'service_in_progress'));
  } else if (request.status === 'service_in_progress') {
    // Worker performs the actual service. Show fuel/wash action buttons.
    nextAction = 'Complete the requested fuel or cleaning service.';
    if (serviceNeedsFuel(request) && !serviceDoneOrUnable(request, 'fuel')) {
      actions.push(workerPrimaryStatusButton(request, `Fuel complete â€” ${request.fuel_type || 'fuel'}`, 'fueling_complete'));
      actions.push(workerServiceUnableButton(request, 'fuel'));
    }
    if (serviceNeedsWash(request) && !serviceDoneOrUnable(request, 'wash')) {
      actions.push(workerPrimaryStatusButton(request, `Wash complete â€” ${request.wash_package_label || 'selected wash'}`, 'car_wash_complete'));
      actions.push(workerServiceUnableButton(request, 'wash'));
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
    nextAction = 'Complete the car wash service.';
    actions.push(workerPrimaryStatusButton(request, `Wash complete â€” ${request.wash_package_label || 'selected wash'}`, 'car_wash_complete'));
    actions.push(workerServiceUnableButton(request, 'wash'));
  } else if (request.status === 'wash_receipt_uploaded' && serviceNeedsFuel(request) && !serviceDoneOrUnable(request, 'fuel')) {
    nextAction = 'Complete the fuel service.';
    actions.push(workerPrimaryStatusButton(request, `Fuel complete â€” ${request.fuel_type || 'fuel'}`, 'fueling_complete'));
    actions.push(workerServiceUnableButton(request, 'fuel'));
  } else if (request.status === 'service_complete') {
    // All service and receipt entry done. Worker reviews totals and confirms before returning vehicle.
    nextAction = 'Review the receipt totals below, then confirm to continue.';
    activePanel = renderWorkerReceiptConfirmPanel(request);
  } else if (request.status === 'receipts_recorded') {
    nextAction = 'Mark the vehicle as returned once it is back.';
    actions.push(workerPrimaryStatusButton(request, 'Vehicle returned', 'returned_location_pending'));
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
    if (request.quick_inspection) {
      nextAction = 'Complete inspection if selected, otherwise process final payment.';
      actions.push(workerPrimaryStatusButton(request, 'Vehicle inspection', 'inspection_needed'));
    } else {
      nextAction = 'Confirm the saved totals, then capture the final payment automatically.';
      activePanel = renderWorkerCompletePanel(request);
    }
  } else if (request.status === 'inspection_needed') {
    nextAction = 'Complete the vehicle inspection below.';
    activePanel = renderWorkerInspectionPanel(request);
  } else if (request.status === 'inspection_recorded') {
    nextAction = 'Confirm the saved totals, then capture the final payment automatically.';
    activePanel = renderWorkerCompletePanel(request);
  } else if (request.status === 'awaiting_key_return') {
    nextAction = 'Return the customer\'s keys and document who received them.';
    activePanel = renderWorkerKeysReturnedPanel(request);
  } else if (request.status === 'payment_issue' || request.status === 'authorization_too_low') {
    nextAction = 'The customer is updating their payment method. No action needed from you right now.';
  } else if (request.status === 'cancelled_pending_key_return') {
    nextAction = 'Customer cancelled this request. Return the key/vehicle before closing this request.';
    actions.push(`<button class="button primary confirm-cancellation-return" data-id="${escapeHtml(request.id)}" type="button">Confirm Key/Vehicle Returned</button>`);
  }

  const back = workerBackButton(request);
  if (back) actions.push(back);

  return `
    <div class="guided-step">
      <p class="eyebrow">Current status</p>
      <h4>${escapeHtml(workerStatusLabels[request.status] || request.status)}</h4>
      ${nextAction ? `<p class="next-action-label"><strong>Next action:</strong> ${escapeHtml(nextAction)}</p>` : ''}
      <div class="admin-button-row">${actions.join('')}</div>
    </div>
    ${activePanel}
    ${renderWorkerServiceUnablePanel(request)}
  `;
}

function workerServiceUnableButton(request, type) {
  const label = type === 'fuel' ? 'Fuel unable' : 'Car wash unable';
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
    ? 'Upload all four sides after return plus the return odometer and ending fuel gauge. Do not reuse pickup photos.'
    : 'Upload all four sides at pickup plus the pickup odometer and pickup fuel gauge before moving the vehicle.';
  const nextStatus = isDropoff ? 'vehicle_returned' : 'vehicle_picked_up';
  const prefix = isDropoff ? 'dropoff' : 'pickup';

  return `
    <div class="photo-panel" data-panel-for="${escapeHtml(request.id)}" data-next-status="${nextStatus}" data-photo-stage="${stage}">
      <h4>${heading}</h4>
      <p class="field-help">${help}</p>
      <div class="field-grid">
        ${filePicker('Driver side front', 'photo-file required-photo', `data-photo-type="${prefix}_driver_front"`)}
        ${filePicker('Passenger side front', 'photo-file required-photo', `data-photo-type="${prefix}_passenger_front"`)}
        ${filePicker('Driver side rear', 'photo-file required-photo', `data-photo-type="${prefix}_driver_rear"`)}
        ${filePicker('Passenger side rear', 'photo-file required-photo', `data-photo-type="${prefix}_passenger_rear"`)}
        ${filePicker(`${isDropoff ? 'Return' : 'Pickup'} odometer photo`, 'photo-file required-photo', `data-photo-type="${prefix}_odometer"`)}
        ${filePicker(`${isDropoff ? 'Ending' : 'Pickup'} fuel gauge photo`, 'photo-file required-photo', `data-photo-type="${isDropoff ? 'dropoff_fuel_gauge' : 'pickup_fuel_gauge'}"`, )}
      </div>
      <p class="field-help duplicate-photo-warning" data-warning-for="${escapeHtml(request.id)}"></p>
      <button class="button primary upload-action-button upload-photo-set" data-id="${escapeHtml(request.id)}" type="button">Upload photo set</button>
    </div>
  `;
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
  // If this is the last service, advance to service_complete so the worker confirms totals
  // before the request is marked receipts_recorded.
  const nextStatus = isFuelMode
    ? serviceNeedsWash(request) && !serviceDoneOrUnable(request, 'wash') ? 'fuel_receipt_uploaded' : 'service_complete'
    : isWashMode
      ? serviceNeedsFuel(request) && !serviceDoneOrUnable(request, 'fuel') ? 'wash_receipt_uploaded' : 'service_complete'
      : 'service_complete';

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

  return `
    <div class="inspection-panel" data-inspection-for="${escapeHtml(request.id)}">
      <h4>Quick vehicle inspection</h4>
      <p class="field-help psi-guide-note">${escapeHtml(guideText.replace(/\s+/g, ' ').trim())}</p>
      <div class="field-grid">
        <label>Driver front PSI before
          <input class="inspection-df-before" type="number" min="0" step="1" placeholder="32">
        </label>
        <label>Driver front PSI after
          <input class="inspection-df-after" type="number" min="0" step="1" value="${escapeHtml(frontPsi)}" placeholder="35">
        </label>
        <label>Driver rear PSI before
          <input class="inspection-dr-before" type="number" min="0" step="1" placeholder="32">
        </label>
        <label>Driver rear PSI after
          <input class="inspection-dr-after" type="number" min="0" step="1" value="${escapeHtml(rearPsi)}" placeholder="35">
        </label>
        <label>Passenger front PSI before
          <input class="inspection-pf-before" type="number" min="0" step="1" placeholder="32">
        </label>
        <label>Passenger front PSI after
          <input class="inspection-pf-after" type="number" min="0" step="1" value="${escapeHtml(frontPsi)}" placeholder="35">
        </label>
        <label>Passenger rear PSI before
          <input class="inspection-pr-before" type="number" min="0" step="1" placeholder="32">
        </label>
        <label>Passenger rear PSI after
          <input class="inspection-pr-after" type="number" min="0" step="1" value="${escapeHtml(rearPsi)}" placeholder="35">
        </label>
      </div>
      <label>Trouble code
        <input class="inspection-trouble-code" type="text" placeholder="P0304">
      </label>
      <div class="trouble-code-output" aria-live="polite">
        <p class="field-help">Type a code to preview what the customer will see.</p>
      </div>
      <button class="button primary save-inspection" data-id="${escapeHtml(request.id)}" type="button">Save inspection details</button>
    </div>
  `;
}

// Receipt-confirmation panel shown at service_complete.
// Worker reviews totals and clicks "Receipts recorded" â†’ advances to receipts_recorded.
// Does NOT capture payment â€” that happens later at vehicle_returned/inspection_recorded.
function renderWorkerReceiptConfirmPanel(request) {
  const receiptTotals = receiptTotalsFromNotes(request);
  const workerReceiptTotal = receiptTotals.fuel + receiptTotals.wash;

  return `
    <div class="complete-panel" data-complete-for="${escapeHtml(request.id)}">
      <h4>Confirm receipt totals</h4>
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
        <button class="button primary worker-update-status" data-id="${escapeHtml(request.id)}" data-status="receipts_recorded" type="button">Receipts recorded</button>
        ${serviceNeedsFuel(request) ? `<button class="button secondary show-total-edit" data-id="${escapeHtml(request.id)}" data-edit-total="fuel" type="button">Fuel Incorrect</button>` : ''}
        ${serviceNeedsWash(request) ? `<button class="button secondary show-total-edit" data-id="${escapeHtml(request.id)}" data-edit-total="wash" type="button">Car Wash Incorrect</button>` : ''}
      </div>
      <div class="total-edit-panel" data-total-edit-for="${escapeHtml(request.id)}" hidden></div>
    </div>
  `;
}

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
  if (!workerJobList) return false;
  const fields = workerJobList.querySelectorAll('input, textarea, select');
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
  const activeJobs = claimedJobs.filter((job) => workerProgressStepForStatus(job.status) >= 2);
  const pendingAccepted = claimedJobs.filter((job) => workerProgressStepForStatus(job.status) < 2);
  const needsAction = [...cancelledReturnJobs, ...activeJobs];
  const hasActiveJob = needsAction.length > 0;
  const focusJobs = hasActiveJob ? needsAction : pendingAccepted.slice(0, 1);
  const upcomingJobs = hasActiveJob ? pendingAccepted : pendingAccepted.slice(1);

  workerJobList.innerHTML = `
    ${profileIncomplete ? `
      <div class="worker-state-card worker-state-warning">
        <h3>Complete your worker profile</h3>
        <p>Complete your worker profile before accepting jobs.</p>
        <button class="button primary worker-complete-profile-btn" type="button">Complete Profile</button>
      </div>
    ` : ''}
    <section class="worker-jobs-section">
      <h3>Available to Claim${(!hasActiveJob && availableJobs.length) ? ` (${availableJobs.length})` : ''}</h3>
      ${hasActiveJob
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
  renderWorkerEarnings(completedToday);
  renderWorkerTodayCounts({
    // The job you're handling now (the focus card) counts as Accepted — unless it's
    // a cancellation, which is counted under Cancelled instead. Other claimed jobs
    // waiting behind it are Upcoming.
    accepted: focusJobs.filter((job) => job.status !== 'cancelled_pending_key_return').length,
    upcoming: upcomingJobs.length,
    completed: completedToday.length,
    cancelled: cancelledReturnJobs.length,
  });
  updateWorkerProgressTimeline(myJobs);
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
    .filter((r) => r.status === 'complete' && (String(r.updated_at || '').slice(0, 10) === today || r.service_date === today))
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
      assigned_worker_phone: currentEmployee.phone ? formatPhone(currentEmployee.phone) : null,
      assigned_worker_photo_url: currentEmployee.cropped_photo_url || currentEmployee.photo_url || null,
      assigned_worker_original_photo_url: currentEmployee.original_photo_url || null,
      status: request?.status === 'request_received' ? 'accepted' : request?.status || 'accepted',
    },
  });

  if (error) throw error;

  await loadWorkerJobs();
  await loadWorkerReviews();
}

async function updateWorkerJobStatus(id, status) {
  const { error } = await workerDb.rpc('worker_update_request', {
    p_token: SESSION_WORKER_TOKEN,
    p_request_id: id,
    p_data: { status },
  });

  if (error) throw error;
  await loadWorkerJobs();
}

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
    p_data: { status: nextStatus, final_total: finalTotal, notes, ...pricingAuditFields({ ...request, notes }, receiptTotals) },
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
  const notes = request.notes ? `${request.notes}\n${note}` : note;
  const nextStatus = panel.dataset.nextStatus;
  const { error } = await workerDb.rpc('worker_update_request', {
    p_token: SESSION_WORKER_TOKEN,
    p_request_id: id,
    p_data: { status: nextStatus, notes },
  });

  if (error) throw error;
  await loadWorkerJobs();
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
    updates.status = button.dataset.nextStatus;
  }

  const { error } = await workerDb.rpc('worker_update_request', {
    p_token: SESSION_WORKER_TOKEN,
    p_request_id: id,
    p_data: updates,
  });

  if (error) throw error;
  await loadWorkerJobs();
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
      status: 'return_location_recorded',
    },
  });

  if (error) throw error;

  console.log('Vehicle Returned clicked â€” location saved, advancing workflow only. No payment capture here.');
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
    p_data: { status: 'awaiting_key_return', notes, updated_at: timestamp },
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

  const values = {
    dfBefore: panel.querySelector('.inspection-df-before').value || 'not recorded',
    dfAfter: panel.querySelector('.inspection-df-after').value || 'not recorded',
    drBefore: panel.querySelector('.inspection-dr-before').value || 'not recorded',
    drAfter: panel.querySelector('.inspection-dr-after').value || 'not recorded',
    pfBefore: panel.querySelector('.inspection-pf-before').value || 'not recorded',
    pfAfter: panel.querySelector('.inspection-pf-after').value || 'not recorded',
    prBefore: panel.querySelector('.inspection-pr-before').value || 'not recorded',
    prAfter: panel.querySelector('.inspection-pr-after').value || 'not recorded',
  };
  const psiGuide = psiGuideForRequest(request);
  const guideNote = psiGuide
    ? ` Recommended PSI used: front ${psiGuide.front}, rear ${psiGuide.rear}.`
    : '';
  const note = [
    `Quick inspection recorded for ${request.vehicle_year || ''} ${request.vehicle_make || ''} ${request.vehicle_model || ''}.`.replace(/\s+/g, ' ').trim(),
    `Tire PSI before/after: driver front ${values.dfBefore}/${values.dfAfter}, driver rear ${values.drBefore}/${values.drAfter}, passenger front ${values.pfBefore}/${values.pfAfter}, passenger rear ${values.prBefore}/${values.prAfter}.${guideNote}`,
    `Trouble code ${code || 'none'}: ${codeDetails.summary} Possible fixes: ${codeDetails.fixes}`,
  ].join(' ');
  const notes = request.notes ? `${request.notes}\n${note}` : note;

  const { error } = await workerDb.rpc('worker_update_request', {
    p_token: SESSION_WORKER_TOKEN,
    p_request_id: id,
    p_data: { notes, status: 'inspection_recorded' },
  });

  if (error) throw error;
  await loadWorkerJobs();
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
  if (request.quick_inspection && request.status !== 'inspection_recorded' && !isReturnWorkflow) {
    alert('Complete the quick inspection before completing this request.');
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

  // Save the final total first so the capture endpoint can read it.
  const { error: updateErr } = await workerDb.rpc('worker_update_request', {
    p_token: SESSION_WORKER_TOKEN,
    p_request_id: id,
    p_data: { final_total: finalTotal, ...pricingAuditFields(request, receiptTotals) },
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
    status: isReturnWorkflow ? 'awaiting_key_return' : 'complete',
    final_total: finalTotal,
    updated_at: timestamp,
    ...pricingAuditFields(request, receiptTotals),
  };
  if (!isReturnWorkflow) updates.completed_at = timestamp;
  if (returnConfirmNote) updates.notes = notes;

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
    ? 'Request moved to awaiting_key_return - return workflow will close after keys are returned.'
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
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      button.disabled = false;
      button.textContent = 'Keys returned';
      if (statusEl) statusEl.textContent = `Error: ${data.error || 'Could not save. Please try again.'}`;
      return;
    }
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
      await updateWorkerJobStatus(button.dataset.id, button.dataset.status);
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

    if (button.classList.contains('save-inspection')) {
      await saveWorkerInspection(button);
      return;
    }

    if (button.classList.contains('show-total-edit')) {
      const request = allWorkerJobs.find((item) => item.id === button.dataset.id);
      const panel = workerJobList.querySelector(`[data-total-edit-for="${button.dataset.id}"]`);
      const checkbox = button.closest('.complete-panel')?.querySelector('.confirm-complete-totals');

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
      const panel = workerJobList.querySelector(`[data-service-unable-for="${button.dataset.id}"]`);
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

  if (event.target.matches('.service-unable-reason')) {
    const panel = event.target.closest('.service-unable-panel');
    const otherWrap = panel?.querySelector('.service-unable-other-wrap');
    if (otherWrap) {
      otherWrap.style.display = event.target.value === 'Other' ? 'block' : 'none';
    }
  }

  if (event.target.matches('.key-returned-to-type')) {
    const panel = event.target.closest('.keys-returned-panel');
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
    const phone = phoneInputValue ? formatPhone(phoneInputValue) : null;
    const homeLocation = workerProfileLocation?.value || currentEmployee.home_location || DEFAULT_WORK_LOCATION;

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
    if (workerProfileLocation) workerProfileLocation.value = currentEmployee.home_location || DEFAULT_WORK_LOCATION;
    if (workerProfileStarted) workerProfileStarted.value = currentEmployee.started_at || '';
    if (workerLocation) workerLocation.value = currentEmployee.home_location || DEFAULT_WORK_LOCATION;
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

openWorkdaysPanel?.addEventListener('click', () => {
  if (workdaysPanel) workdaysPanel.hidden = false;
  if (daysOffPanel) daysOffPanel.hidden = true;
});

closeWorkdaysPanel?.addEventListener('click', () => {
  if (workdaysPanel) workdaysPanel.hidden = true;
});

openDaysOffPanel?.addEventListener('click', () => {
  if (daysOffPanel) daysOffPanel.hidden = false;
  if (workdaysPanel) workdaysPanel.hidden = true;
});

closeDaysOffPanel?.addEventListener('click', () => {
  if (daysOffPanel) daysOffPanel.hidden = true;
});

workerScheduleForm?.addEventListener('submit', (event) => event.preventDefault());

saveWorkdaysButton?.addEventListener('click', () => {
  saveWorkerAvailability().catch((error) => {
    console.error('Worker availability save failed:', error);
    setScheduleStatus('Could not save work days. Check Supabase setup.');
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
      if (id && request && request.status !== 'awaiting_key_return') {
        const timestamp = new Date().toISOString();
        const note = `[payment_captured_key_return_needed ${timestamp}] Final payment captured. Worker must return keys before the request is marked complete.`;
        const notes = request.notes ? `${request.notes}\n${note}` : note;
        await workerDb.rpc('worker_update_request', {
          p_token: SESSION_WORKER_TOKEN,
          p_request_id: id,
          p_data: { status: 'awaiting_key_return', notes, updated_at: timestamp },
        }).catch((error) => console.warn('Could not move captured job to key return step:', error));
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

      if (id && request && request.status !== 'awaiting_key_return') {
        const timestamp = new Date().toISOString();
        const note = `[totals_confirmed_key_return_needed ${timestamp}] Worker confirmed final totals. Keys must be returned before the request is marked complete.`;
        const notes = request.notes ? `${request.notes}\n${note}` : note;
        await workerDb.rpc('worker_update_request', {
          p_token: SESSION_WORKER_TOKEN,
          p_request_id: id,
          p_data: { status: 'awaiting_key_return', notes, updated_at: timestamp },
        }).catch((error) => console.warn('Could not move completed job to key return step:', error));
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
