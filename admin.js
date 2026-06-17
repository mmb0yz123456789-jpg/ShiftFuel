const db = window.ShiftFuelSupabase;
const requestList = document.querySelector('#request-list');
const openRequests = document.querySelector('#open-requests');
const completeRequests = document.querySelector('#complete-requests');
const deniedRequests = document.querySelector('#denied-requests');
const totalReviewsEl = document.querySelector('#total-reviews');
const totalApplicantsEl = document.querySelector('#total-applicants');
const showOpen = document.querySelector('#show-open');
const showComplete = document.querySelector('#show-complete');
const showDenied = document.querySelector('#show-denied');
const showReviews = document.querySelector('#show-reviews');
const showApplicants = document.querySelector('#show-applicants');
const findTicketsBtn = document.querySelector('#find-tickets-btn');
const findTicketsModal = document.querySelector('#find-tickets-modal');
const closeFindTicketsBtn = document.querySelector('#close-find-tickets');
const findTicketsSearch = document.querySelector('#find-tickets-search');
const findTicketsResults = document.querySelector('#find-tickets-results');
const reviewAverageDisplay = document.querySelector('#review-average-display');
const starFilterButtons = document.querySelector('.star-filter-buttons');
const adminAvgRating = document.querySelector('#admin-avg-rating');
const adminCompletedCount = document.querySelector('#admin-completed-count');
const requestQueueHeading = document.querySelector('#request-queue-heading');
const requestQueueEyebrow = document.querySelector('#request-queue-eyebrow');
const showAllTimeBtn = document.querySelector('#show-all-time-btn');
const ticketDetailModal = document.querySelector('#ticket-detail-modal');
const closeTicketDetailBtn = document.querySelector('#close-ticket-detail');
const ticketDetailBody = document.querySelector('#ticket-detail-body');
const adminPageTabs = document.querySelectorAll('.admin-page-tab');
const workerCountBadge = document.querySelector('#worker-count-badge');
const findTicketsGoBtn = document.querySelector('#find-tickets-go');
const findTicketsSortBar = document.querySelector('#find-tickets-sort-bar');
const findTicketsSortSelect = document.querySelector('#find-tickets-sort');
const findTicketsResultCount = document.querySelector('#find-tickets-result-count');
const workerScheduleForm = document.querySelector('#worker-schedule-form');
const workerScheduleStatus = document.querySelector('#worker-schedule-status');
const workerSelect = document.querySelector('#worker-select');
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
const reviewList = document.querySelector('#review-list');
const applicantList = document.querySelector('#applicant-list');
const workerProfileList = document.querySelector('#worker-profile-list');
const workerProfileSelectActive = document.querySelector('#worker-profile-select-active');
const workerProfileSelectInactive = document.querySelector('#worker-profile-select-inactive');

const PHOTO_BUCKET = 'service-photos';
const DEFAULT_WORKER_NAME = 'Mark Urban';
const SERVICE_CENTERS = [
  'ShiftFuel - 132 Christiana Mall, Newark, DE 19702',
];
const DEFAULT_WORK_LOCATION = SERVICE_CENTERS[0];
const workerDayOptions = [
  { dayOfWeek: 1, label: 'Monday' },
  { dayOfWeek: 2, label: 'Tuesday' },
  { dayOfWeek: 3, label: 'Wednesday' },
  { dayOfWeek: 4, label: 'Thursday' },
  { dayOfWeek: 5, label: 'Friday' },
  { dayOfWeek: 6, label: 'Saturday' },
  { dayOfWeek: 0, label: 'Sunday' },
];
let selectedWorkerDaysOff = new Set();
let copiedWorkerDaySchedule = null;
let allRequests = [];
let allEmployees = [];
let allReviews = [];
let allReviewRequestMap = new Map();
let allApplicantsList = [];
let selectedScheduleEmployeeId = '';
let currentView = 'open';
let currentAdminTab = 'requests';
let currentPageTab = 'dashboard';
let currentReviewFilter = null;
let showAllTime = false;
let lastSearchResults = [];
let vehiclePsiGuides = [];

function adminToken() {
  return sessionStorage.getItem('shiftfuel_admin_token');
}

// Admin profile photo editor state (mirrors worker.js)
let adminPhotoZoom = 1;
let adminPhotoPosition = { x: 0, y: 0 };
let adminPhotoDisplayDrag = null;
let adminBoundaryPreviewUrl = '';
let adminCroppedPreviewUrl = '';
let adminCroppedPhotoBlob = null;
let adminPhotoDeleted = false; // true when admin clicks "Delete photo"

const terminalStatuses = ['complete', 'denied', 'customer_canceled', 'unable_to_complete'];
const closedStatuses = ['denied', 'customer_canceled', 'unable_to_complete'];

const statusLabels = {
  request_received: 'Request received',
  accepted: 'Accepted',
  key_received: 'Key received',
  pickup_vehicle_photo_uploaded: 'Pickup vehicle photo uploaded',
  pickup_odometer_photo_uploaded: 'Pickup odometer photo uploaded',
  pickup_fuel_gauge_photo_uploaded: 'Pickup fuel gauge photo uploaded',
  vehicle_picked_up: 'Vehicle picked up',
  fueling_in_progress: 'Fueling in progress',
  fueling_complete: 'Fueling complete',
  fuel_receipt_uploaded: 'Fuel receipt uploaded',
  car_wash_in_progress: 'Car wash in progress',
  car_wash_complete: 'Car wash complete',
  fuel_and_wash_complete: 'Fuel and wash complete',
  receipts_recorded: 'Receipts recorded',
  returned_location_pending: 'Returned',
  return_photos_needed: 'Return photos needed',
  inspection_needed: 'Vehicle inspection needed',
  inspection_recorded: 'Inspection recorded',
  wash_receipt_uploaded: 'Wash receipt uploaded',
  return_location_recorded: 'Return location recorded',
  dropoff_vehicle_photo_uploaded: 'Drop-off vehicle photo uploaded',
  dropoff_odometer_photo_uploaded: 'Drop-off odometer photo uploaded',
  dropoff_fuel_gauge_photo_uploaded: 'Drop-off fuel gauge photo uploaded',
  vehicle_returned: 'Vehicle returned',
  complete: 'Complete',
  denied: 'Denied',
  customer_canceled: 'Canceled by customer',
  unable_to_complete: 'Unable to complete',
};

const applicantStatusLabels = {
  new: 'New',
  contacted: 'Contacted',
  interviewing: 'Interviewing',
  hired: 'Hired',
  declined: 'Declined',
};

function updateHeroStats() {
  if (adminAvgRating && allReviews.length) {
    const avg = (allReviews.reduce((s, r) => s + Number(r.rating), 0) / allReviews.length).toFixed(1);
    adminAvgRating.textContent = `★ ${avg}`;
  } else if (adminAvgRating) {
    adminAvgRating.textContent = '—';
  }
  const completeCount = allRequests.filter((r) => r.status === 'complete').length;
  if (adminCompletedCount) adminCompletedCount.textContent = completeCount;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
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

  const exact = guides.find((guide) => {
    return normalizeVehicleText(guide.make) === make
      && normalizeVehicleText(guide.model) === model;
  });

  const partial = exact || guides.find((guide) => {
    const guideModel = normalizeVehicleText(guide.model);
    return normalizeVehicleText(guide.make) === make
      && (model.includes(guideModel) || guideModel.includes(model));
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
  const { data, error } = await db
    .from('vehicle_psi_guides')
    .select('make,model,front_psi,rear_psi,source');

  if (error) {
    console.warn('Using built-in PSI guide until vehicle_psi_guides is added:', error);
    vehiclePsiGuides = fallbackPsiGuides;
    return;
  }

  vehiclePsiGuides = data?.length ? data : fallbackPsiGuides;
}

function randomPassword(length = 12) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#';
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join('');
}

function randomSalt() {
  const values = new Uint8Array(16);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function passwordFields(password) {
  const salt = randomSalt();
  return {
    worker_password_salt: salt,
    worker_password_hash: await sha256Hex(`${salt}:${password}`),
    password_updated_at: new Date().toISOString(),
  };
}

function formatDateTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function numberFromInput(value) {
  return Number(String(value || '').replace(/[^0-9.\-]/g, '')) || 0;
}

function savedFeeOrDefault(value, fallback) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : fallback;
}

function isOpen(request) {
  return !terminalStatuses.includes(request.status);
}

function serviceNeedsFuel(request) {
  return String(request.service_type || '').includes('fuel');
}

function serviceNeedsWash(request) {
  return String(request.service_type || '').includes('wash');
}

function serviceWorkComplete(request) {
  if (serviceNeedsFuel(request) && serviceNeedsWash(request)) {
    return request.status === 'fuel_and_wash_complete' || request.status === 'receipts_recorded' || request.status === 'return_location_recorded' || request.status === 'vehicle_returned' || request.status === 'inspection_recorded';
  }

  if (serviceNeedsFuel(request)) {
    return request.status === 'fueling_complete' || request.status === 'receipts_recorded' || request.status === 'return_location_recorded' || request.status === 'vehicle_returned' || request.status === 'inspection_recorded';
  }

  if (serviceNeedsWash(request)) {
    return request.status === 'car_wash_complete' || request.status === 'receipts_recorded' || request.status === 'return_location_recorded' || request.status === 'vehicle_returned' || request.status === 'inspection_recorded';
  }

  return request.status === 'vehicle_picked_up' || request.status === 'receipts_recorded' || request.status === 'return_location_recorded' || request.status === 'vehicle_returned' || request.status === 'inspection_recorded';
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

function serviceDoneOrUnable(request, type) {
  const receiptTotals = receiptTotalsFromNotes(request);
  return serviceUnable(request, type) || Number(receiptTotals[type] || 0) > 0;
}

function nextStatusAfterServiceUnable(request, type) {
  const fuelDone = type === 'fuel' || !serviceNeedsFuel(request) || serviceDoneOrUnable(request, 'fuel');
  const washDone = type === 'wash' || !serviceNeedsWash(request) || serviceDoneOrUnable(request, 'wash');

  if (fuelDone && washDone) {
    return 'receipts_recorded';
  }

  return type === 'fuel' ? 'fuel_receipt_uploaded' : 'wash_receipt_uploaded';
}

function photoTimestampNote(stage, timestamp) {
  return stage === 'dropoff'
    ? `[dropoff_time ${timestamp}] Drop-off photos uploaded at ${formatDateTime(timestamp)}.`
    : `[pickup_time ${timestamp}] Pickup photos uploaded at ${formatDateTime(timestamp)}.`;
}

function finalTotalFromSavedReceipts(request, receiptTotals = receiptTotalsFromNotes(request)) {
  const fees = feeSummary(request);
  const fuelFee = serviceNeedsFuel(request) && receiptTotals.fuel > 0 ? fees.fuel : 0;
  const washFee = serviceNeedsWash(request) && receiptTotals.wash > 0 ? fees.wash : 0;
  return receiptTotals.fuel + receiptTotals.wash + fuelFee + washFee + fees.inspection;
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
      summary: "Random or multiple cylinder misfire detected.",
      fixes: "Check spark plugs, ignition coils, vacuum leaks, fuel delivery, and compression.",
    },
    P0301: {
      summary: "Misfire detected in cylinder 1.",
      fixes: "Check cylinder 1 spark plug, ignition coil, injector, wiring, compression, and vacuum leaks.",
    },
    P0302: {
      summary: "Misfire detected in cylinder 2.",
      fixes: "Check cylinder 2 spark plug, ignition coil, injector, wiring, compression, and vacuum leaks.",
    },
    P0303: {
      summary: "Misfire detected in cylinder 3.",
      fixes: "Check cylinder 3 spark plug, ignition coil, injector, wiring, compression, and vacuum leaks.",
    },
    P0304: {
      summary: "Your car's computer detected a misfire in cylinder number 4.",
      fixes: "Check the cylinder 4 spark plug, ignition coil, fuel injector, wiring, compression, and vacuum leaks. Exact fixes depend on the vehicle year, make, model, and engine.",
    },
    P0420: {
      summary: "The vehicle's computer detected catalyst system efficiency below the expected threshold on bank 1.",
      fixes: "Possible causes include a worn catalytic converter, exhaust leak, oxygen sensor issue, engine misfire, or fuel mixture problem. Confirm with a scanner and vehicle-specific diagnostics before replacing parts.",
    },
    P0430: {
      summary: "The vehicle's computer detected catalyst system efficiency below the expected threshold on bank 2.",
      fixes: "Possible causes include a worn catalytic converter, exhaust leak, oxygen sensor issue, engine misfire, or fuel mixture problem. Confirm with a scanner and vehicle-specific diagnostics before replacing parts.",
    },
    P0455: {
      summary: "The vehicle's computer detected a large evaporative emissions system leak.",
      fixes: "Check that the gas cap is tight and inspect the EVAP hoses, purge valve, vent valve, and charcoal canister.",
    },
  };

  return library[normalized] || {
    summary: normalized ? "Trouble code recorded. Use a verified OBD-II lookup before giving repair advice." : "No trouble code entered.",
    fixes: "Confirm the code with a scanner and vehicle-specific service information.",
  };
}

function finalTotalFromParts(request, fuelReceipt, washReceipt) {
  const fuelConvenience = serviceNeedsFuel(request) ? savedFeeOrDefault(request.fuel_convenience_fee, 15) : 0;
  const washConvenience = serviceNeedsWash(request) ? savedFeeOrDefault(request.wash_convenience_fee, 15) : 0;
  const inspection = request.quick_inspection ? savedFeeOrDefault(request.quick_inspection_fee, 5) : 0;
  return numberFromInput(fuelReceipt) + numberFromInput(washReceipt) + fuelConvenience + washConvenience + inspection;
}

function feeSummary(request) {
  return {
    fuel: serviceNeedsFuel(request) ? savedFeeOrDefault(request.fuel_convenience_fee, 15) : 0,
    wash: serviceNeedsWash(request) ? savedFeeOrDefault(request.wash_convenience_fee, 15) : 0,
    inspection: request.quick_inspection ? savedFeeOrDefault(request.quick_inspection_fee, 5) : 0,
  };
}

function adminFormatAddress(request) {
  if (request.address_street) {
    return [request.address_street, request.address_apt, request.address_city, request.address_state, request.address_zip].filter(Boolean).join(', ');
  }
  return request.hospital || 'Not provided';
}

function adminFormatService(request) {
  const parts = [request.service_label || request.service_type];
  if (request.fuel_type) parts.push(`Fuel: ${request.fuel_type}`);
  if (request.estimated_fuel_range) parts.push(`Est. range: ${request.estimated_fuel_range}`);
  if (request.wash_package_label) parts.push(`Wash: ${request.wash_package_label}`);
  if (request.quick_inspection) parts.push('Quick inspection');
  if (request.service_date) parts.push(request.service_date);
  if (request.desired_return_time) parts.push(`Return by: ${request.desired_return_time}`);
  return parts.filter(Boolean).join(' | ');
}

function requestCardDetails(request) {
  const fees = feeSummary(request);
  const receiptTotals = receiptTotalsFromNotes(request);
  const hasPayment = request.estimated_total != null || request.final_total != null || receiptTotals.fuel || receiptTotals.wash;

  return `
    <div class="request-details">
      <p><strong>Customer:</strong> ${escapeHtml(request.customer_name || '')}</p>
      <p><strong>Phone:</strong> ${escapeHtml(request.customer_phone || 'Not provided')}${request.customer_email ? ` | ${escapeHtml(request.customer_email)}` : ''}</p>
      <p><strong>Service address:</strong> ${escapeHtml(adminFormatAddress(request))}</p>
      <p><strong>Parking:</strong> ${[request.parking_location, request.parking_spot ? `spot ${request.parking_spot}` : ''].filter(Boolean).map(escapeHtml).join(', ') || 'Not provided'}</p>
      ${request.key_handoff_details ? `<p><strong>Key handoff:</strong> ${escapeHtml(request.key_handoff_details)}</p>` : ''}
      <p><strong>Service:</strong> ${escapeHtml(adminFormatService(request))}</p>
      <p><strong>Vehicle:</strong> ${escapeHtml([request.vehicle_year, request.vehicle_make, request.vehicle_model, request.vehicle_color].filter(Boolean).join(' '))}${request.license_plate ? ` | Plate: ${escapeHtml(request.license_plate)}` : ''}</p>
      ${request.return_parking_location ? `<p><strong>Vehicle return location:</strong> ${escapeHtml(request.return_parking_location)}</p>` : ''}
      ${request.cancellation_reason ? `<p><strong>Cancellation reason:</strong> ${escapeHtml(request.cancellation_reason)}</p>` : ''}
      ${(request.notes && isOpen(request)) ? `<p><strong>Notes:</strong> ${escapeHtml(request.notes)}</p>` : ''}
      ${hasPayment ? `<hr class="details-divider">` : ''}
      ${hasPayment ? `<p><strong>Estimated total:</strong> ${money(request.estimated_total)} | <strong>Final total:</strong> ${request.final_total == null ? 'Not recorded' : money(request.final_total)}</p>` : ''}
      ${(receiptTotals.fuel || receiptTotals.wash) ? `<p><strong>Receipt totals:</strong> Fuel ${money(receiptTotals.fuel)} | Car wash ${money(receiptTotals.wash)}</p>` : ''}
      ${hasPayment ? `<p><strong>Fees:</strong> Fuel convenience ${money(fees.fuel)} | Wash convenience ${money(fees.wash)} | Inspection ${money(fees.inspection)}</p>` : ''}
      ${request.payment_intent_id ? `<p><strong>Payment authorization:</strong> ${request.payment_status === 'captured' ? `Captured ${money(request.final_total)}` : `Authorized (${request.payment_status || 'authorized'})`}</p>` : ''}
      ${(request.payment_intent_id && request.payment_status !== 'captured') ? `
        <button class="button primary charge-customer-btn" data-request-id="${escapeHtml(request.id)}" data-final-total="${escapeHtml(String(request.final_total ?? ''))}">
          Charge customer${request.final_total != null ? ` ${money(request.final_total)}` : ''}
        </button>` : ''}
    </div>
  `;
}

function renderWorkerAssignment(request) {
  if (request.status === 'request_received' || !isOpen(request)) {
    return '';
  }

  const assignedName = request.assigned_worker_name || '';
  const assignedPhone = request.assigned_worker_phone || '';
  const selectedId = request.assigned_employee_id || '';
  const assignedEmployee = allEmployees.find((e) => e.id === selectedId);
  // Use live employee photo (current after profile updates); fall back to snapshot on request row.
  const croppedUrl  = assignedEmployee?.cropped_photo_url  || assignedEmployee?.photo_url || request.assigned_worker_photo_url || '';
  const originalUrl = assignedEmployee?.original_photo_url || assignedEmployee?.photo_url || request.assigned_worker_original_photo_url || '';

  const photoFrame = window.ShiftFuelPhoto
    ? window.ShiftFuelPhoto.renderPhotoFrame(
        { photo_url: croppedUrl, cropped_photo_url: croppedUrl, original_photo_url: originalUrl, name: assignedName },
        { clickable: true }
      )
    : (croppedUrl
        ? `<div class="worker-profile-photo-frame"><img class="worker-profile-photo" src="${escapeHtml(croppedUrl)}" alt="${escapeHtml(assignedName)}"></div>`
        : `<div class="worker-profile-photo-frame"><div class="worker-profile-photo-placeholder">No photo</div></div>`);

  return `
    <section class="worker-assignment-panel">
      <div>
        <p class="eyebrow">Assigned worker</p>
        <h4>${assignedName ? escapeHtml(assignedName) : 'Choose who is working on this car'}</h4>
        ${assignedPhone ? `<p class="field-help">Customer contact: ${escapeHtml(assignedPhone)}</p>` : '<p class="field-help">Assign a worker after accepting the request.</p>'}
      </div>
      ${photoFrame}
      <label class="worker-select-label">
        Worker
        <select class="assign-worker-select" data-id="${escapeHtml(request.id)}">
          <option value="">Select worker</option>
          ${allEmployees.filter((e) => e.active).map((employee) => `
            <option value="${escapeHtml(employee.id)}" ${employee.id === selectedId ? 'selected' : ''}>${escapeHtml(employee.full_name)} (${escapeHtml(employee.employee_code)})</option>
          `).join('')}
        </select>
      </label>
    </section>
  `;
}

function primaryStatusButton(request, label, status) {
  return `<button class="button primary update-status" data-id="${request.id}" data-status="${status}" type="button">${label}</button>`;
}

function backStatusFor(request) {
  const map = {
    accepted: 'request_received',
    key_received: 'accepted',
    vehicle_picked_up: 'key_received',
    fueling_complete: 'vehicle_picked_up',
    car_wash_complete: 'vehicle_picked_up',
    fuel_receipt_uploaded: 'fueling_complete',
    wash_receipt_uploaded: 'car_wash_complete',
    receipts_recorded: serviceNeedsFuel(request) && serviceNeedsWash(request)
      ? 'fuel_receipt_uploaded'
      : serviceNeedsFuel(request)
        ? 'fueling_complete'
        : 'car_wash_complete',
    returned_location_pending: 'receipts_recorded',
    return_location_recorded: 'returned_location_pending',
    return_photos_needed: 'return_location_recorded',
    vehicle_returned: 'return_photos_needed',
    inspection_needed: 'vehicle_returned',
    inspection_recorded: 'inspection_needed',
  };

  return map[request.status] || '';
}

function backButton(request) {
  const previousStatus = backStatusFor(request);

  if (!previousStatus) {
    return '';
  }

  return `<button class="button secondary update-status" data-id="${request.id}" data-status="${previousStatus}" type="button">Back</button>`;
}

function stepInstruction(text) {
  return `<span class="workflow-step-note">${escapeHtml(text)}</span>`;
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

function renderActions(request) {
  if (!isOpen(request)) {
    const isComplete = request.status === 'complete';
    const label = isComplete ? 'Edit' : 'Edit / reopen';
    return `
      <div class="admin-button-row">
        <button class="button secondary edit-request" data-id="${request.id}" type="button">${label}</button>
      </div>
      ${renderEditPanel(request)}
    `;
  }

  const actions = [];
  let activePanel = '';

  if (request.status === 'request_received') {
    actions.push(primaryStatusButton(request, 'Accept', 'accepted'));
  } else if (request.status === 'accepted') {
    actions.push(primaryStatusButton(request, 'Key received', 'key_received'));
  } else if (request.status === 'key_received') {
    actions.push(stepInstruction('Upload the pickup photo set below.'));
    activePanel = renderPhotoPanel(request, 'pickup');
  } else if (request.status === 'vehicle_picked_up') {
    if (serviceNeedsFuel(request) && !serviceDoneOrUnable(request, 'fuel')) {
      actions.push(primaryStatusButton(request, `Fuel - ${request.fuel_type || 'fuel type not listed'}`, 'fueling_complete'));
      actions.push(serviceUnableButton(request, 'fuel'));
    }
    if (serviceNeedsWash(request) && !serviceDoneOrUnable(request, 'wash')) {
      actions.push(primaryStatusButton(request, `Car wash - ${request.wash_package_label || 'selected wash'}`, 'car_wash_complete'));
      actions.push(serviceUnableButton(request, 'wash'));
    }
  } else if (request.status === 'fueling_complete') {
    actions.push(stepInstruction(`Upload the fuel receipt and enter the fuel total for ${request.fuel_type || 'the selected fuel type'}.`));
    activePanel = renderReceiptPanel(request, 'fuel');
    actions.push(serviceUnableButton(request, 'fuel'));
  } else if (request.status === 'car_wash_complete') {
    actions.push(stepInstruction(`Upload the car wash receipt and enter the total for ${request.wash_package_label || 'the selected wash'}.`));
    activePanel = renderReceiptPanel(request, 'wash');
    actions.push(serviceUnableButton(request, 'wash'));
  } else if (request.status === 'fuel_receipt_uploaded' && serviceNeedsWash(request) && !serviceDoneOrUnable(request, 'wash')) {
    actions.push(primaryStatusButton(request, `Car wash - ${request.wash_package_label || 'selected wash'}`, 'car_wash_complete'));
    actions.push(serviceUnableButton(request, 'wash'));
  } else if (request.status === 'wash_receipt_uploaded' && serviceNeedsFuel(request) && !serviceDoneOrUnable(request, 'fuel')) {
    actions.push(primaryStatusButton(request, `Fuel - ${request.fuel_type || 'fuel type not listed'}`, 'fueling_complete'));
    actions.push(serviceUnableButton(request, 'fuel'));
  } else if (request.status === 'receipts_recorded') {
    actions.push(primaryStatusButton(request, 'Returned', 'returned_location_pending'));
  } else if (request.status === 'returned_location_pending') {
    actions.push(stepInstruction('Record the return parking location after the vehicle is back.'));
    activePanel = renderReturnLocationPanel(request);
  } else if (request.status === 'return_location_recorded') {
    actions.push(primaryStatusButton(request, 'Return photos', 'return_photos_needed'));
  } else if (request.status === 'return_photos_needed') {
    actions.push(stepInstruction('Upload the return photo set below.'));
    activePanel = renderPhotoPanel(request, 'dropoff');
  } else if (request.status === 'vehicle_returned') {
    if (request.quick_inspection) {
      actions.push(primaryStatusButton(request, 'Vehicle inspection', 'inspection_needed'));
    } else {
      actions.push(stepInstruction('Confirm the saved totals before completing.'));
      activePanel = renderCompletePanel(request);
    }
  } else if (request.status === 'inspection_needed') {
      actions.push(stepInstruction('Complete the vehicle inspection below.'));
      activePanel = renderInspectionPanel(request);
  } else if (request.status === 'inspection_recorded') {
    actions.push(stepInstruction('Confirm the saved totals before completing.'));
    activePanel = renderCompletePanel(request);
  }

  const back = backButton(request);
  if (back) {
    actions.push(back);
  }
  actions.push(`<button class="button danger show-deny-reason" data-id="${escapeHtml(request.id)}" type="button">Deny</button>`);
  actions.push(`<button class="button secondary edit-request" data-id="${request.id}" type="button">Edit</button>`);

  return `
    <div class="guided-step">
      <p class="eyebrow">Next step</p>
      <h4>${escapeHtml(statusLabels[request.status] || request.status)}</h4>
      <div class="admin-button-row">${actions.join('')}</div>
    </div>
    ${activePanel}
    ${renderDenyReasonPanel(request)}
    ${renderServiceUnablePanel(request)}
    ${renderEditPanel(request)}
  `;
}

function renderDenyReasonPanel(request) {
  return `
    <div class="deny-reason-panel" data-deny-for="${escapeHtml(request.id)}" hidden>
      <h4>Reason for denial</h4>
      <p class="field-help">Add why this request is being denied. This keeps the record clear for admin and tracking.</p>
      <label>
        Reason
        <textarea class="deny-reason" rows="3" placeholder="Example: Outside service area, duplicate test request, unavailable time slot."></textarea>
      </label>
      <div class="admin-button-row">
        <button class="button danger save-deny-reason" data-id="${escapeHtml(request.id)}" type="button">Deny request</button>
        <button class="button secondary cancel-deny-reason" type="button">Keep request open</button>
      </div>
    </div>
  `;
}

function serviceUnableButton(request, type) {
  const label = type === 'fuel' ? 'Fuel unable' : 'Car wash unable';
  return `<button class="button danger show-service-unable" data-id="${escapeHtml(request.id)}" data-service-type="${escapeHtml(type)}" type="button">${label}</button>`;
}

function renderServiceUnablePanel(request) {
  return `
    <div class="service-unable-panel" data-service-unable-for="${escapeHtml(request.id)}" hidden>
      <h4>Reason service cannot be completed</h4>
      <p class="field-help service-unable-label"></p>
      <label>
        Reason
        <textarea class="service-unable-reason" rows="3" placeholder="Example: Car wash closed at this location, fuel pump unavailable, customer vehicle issue."></textarea>
      </label>
      <div class="admin-button-row">
        <button class="button danger save-service-unable" data-id="${escapeHtml(request.id)}" type="button">Save reason</button>
        <button class="button secondary cancel-service-unable" type="button">Keep service active</button>
      </div>
    </div>
  `;
}

function renderInspectionPanel(request) {
  if (!request.quick_inspection) {
    return '';
  }

  const psiGuide = psiGuideForRequest(request);
  const frontPsi = psiGuide?.front || '';
  const rearPsi = psiGuide?.rear || '';
  const guideText = psiGuide
    ? `Recommended PSI for ${request.vehicle_year || ''} ${request.vehicle_make || ''} ${request.vehicle_model || ''}: front ${frontPsi}, rear ${rearPsi}. Confirm against the door-jamb sticker if available.`
    : `No PSI guide found yet for ${request.vehicle_year || ''} ${request.vehicle_make || ''} ${request.vehicle_model || ''}. Enter the door-jamb sticker pressure if available.`;

  return `
    <div class="inspection-panel" data-inspection-for="${request.id}">
      <h4>Quick inspection details</h4>
      <p class="field-help">Record tire pressure before and after service. Trouble-code explanations are starter guidance and should be confirmed against the vehicle's year, make, model, and engine.</p>
      <p class="field-help psi-guide-note">${escapeHtml(guideText.replace(/\s+/g, ' ').trim())}</p>
      <div class="admin-money-grid">
        <label>Driver front PSI before
          <input class="inspection-df-before" type="number" min="0" step="1">
        </label>
        <label>Driver front PSI after
          <input class="inspection-df-after" type="number" min="0" step="1" value="${escapeHtml(frontPsi)}">
        </label>
        <label>Driver rear PSI before
          <input class="inspection-dr-before" type="number" min="0" step="1">
        </label>
        <label>Driver rear PSI after
          <input class="inspection-dr-after" type="number" min="0" step="1" value="${escapeHtml(rearPsi)}">
        </label>
        <label>Passenger front PSI before
          <input class="inspection-pf-before" type="number" min="0" step="1">
        </label>
        <label>Passenger front PSI after
          <input class="inspection-pf-after" type="number" min="0" step="1" value="${escapeHtml(frontPsi)}">
        </label>
        <label>Passenger rear PSI before
          <input class="inspection-pr-before" type="number" min="0" step="1">
        </label>
        <label>Passenger rear PSI after
          <input class="inspection-pr-after" type="number" min="0" step="1" value="${escapeHtml(rearPsi)}">
        </label>
      </div>
      <label>Trouble code
        <input class="inspection-trouble-code" type="text" placeholder="Example: P0304">
      </label>
      <div class="trouble-code-output" aria-live="polite">
        <p class="field-help">Type a code to preview what the customer will see.</p>
      </div>
      <button class="button primary save-inspection" data-id="${request.id}" type="button">Save inspection details</button>
    </div>
  `;
}

function renderPhotoPanel(request, stage = 'pickup') {
  const isDropoff = stage === 'dropoff';
  const heading = isDropoff ? 'Upload return photos' : 'Upload pickup photos';
  const help = isDropoff
    ? 'Upload all four sides after return plus the return odometer and ending fuel gauge. Do not reuse the pickup photos.'
    : 'Upload all four sides at pickup plus the pickup odometer before moving the vehicle.';
  const nextStatus = isDropoff ? 'vehicle_returned' : 'vehicle_picked_up';
  const prefix = isDropoff ? 'dropoff' : 'pickup';

  return `
    <div class="photo-panel" data-panel-for="${request.id}" data-next-status="${nextStatus}" data-photo-stage="${stage}">
      <h4>${heading}</h4>
      <p class="field-help">${help}</p>
      <div class="field-grid">
        ${filePicker('Driver side front', 'photo-file required-photo', `data-photo-type="${prefix}_driver_front"`)}
        ${filePicker('Passenger side front', 'photo-file required-photo', `data-photo-type="${prefix}_passenger_front"`)}
        ${filePicker('Driver side rear', 'photo-file required-photo', `data-photo-type="${prefix}_driver_rear"`)}
        ${filePicker('Passenger side rear', 'photo-file required-photo', `data-photo-type="${prefix}_passenger_rear"`)}
        ${filePicker(`${isDropoff ? 'Return' : 'Pickup'} odometer photo`, 'photo-file required-photo', `data-photo-type="${prefix}_odometer"`)}
        ${isDropoff ? filePicker('Ending fuel gauge photo', 'photo-file required-photo', 'data-photo-type="dropoff_fuel_gauge"') : ''}
      </div>
      <p class="field-help duplicate-photo-warning" data-warning-for="${request.id}"></p>
      <button class="button primary upload-action-button upload-photo-set" data-id="${request.id}" type="button">Upload photo set</button>
    </div>
  `;
}

function renderReceiptPanel(request, mode = 'all') {
  const isFuelMode = mode === 'fuel';
  const isWashMode = mode === 'wash';
  const receiptTotals = receiptTotalsFromNotes(request);
  const nextStatus = isFuelMode
    ? serviceNeedsWash(request) && !serviceDoneOrUnable(request, 'wash') ? 'fuel_receipt_uploaded' : 'receipts_recorded'
    : isWashMode
      ? serviceNeedsFuel(request) && !serviceDoneOrUnable(request, 'fuel') ? 'wash_receipt_uploaded' : 'receipts_recorded'
      : 'receipts_recorded';
  const help = isFuelMode
    ? 'Upload the fuel receipt and enter the fuel total. The app will keep this total for final confirmation.'
    : isWashMode
      ? 'Upload the car wash receipt and enter the car wash total. The app will keep this total for final confirmation.'
      : 'Upload each receipt and enter each total. The app adds the correct convenience fees.';

  return `
    <div class="receipt-panel" data-receipt-for="${request.id}">
      <h4>Record receipts and final total</h4>
      <p class="field-help">${help}</p>
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
      <button class="button primary save-final-total" data-id="${request.id}" data-receipt-mode="${mode}" data-next-status="${nextStatus}" type="button">Save receipt and total</button>
    </div>
  `;
}

function renderReturnLocationPanel(request) {
  const returnLocation = request.return_parking_location || '';

  return `
    <div class="return-location-panel" data-return-for="${request.id}">
      <h4>Vehicle Return Location</h4>
      <p class="field-help">Record exactly where the vehicle was left after service.</p>
      <div class="field-grid">
        <label>Vehicle return location
          <input class="return-parking-location" type="text" value="${escapeHtml(returnLocation)}" placeholder="Example: Returned to Lot F, space F-19">
        </label>
      </div>
      <button class="button primary save-return-location" data-id="${request.id}" type="button">Save return location</button>
    </div>
  `;
}

function renderCompletePanel(request) {
  const fees = feeSummary(request);
  const receiptTotals = receiptTotalsFromNotes(request);
  const expectedFinalTotal = finalTotalFromSavedReceipts(request, receiptTotals);

  return `
    <div class="complete-panel" data-complete-for="${request.id}">
      <h4>Confirm before completing</h4>
      <p class="field-help">Please confirm these saved totals are correct before completing.</p>
      <div class="request-details">
        ${serviceNeedsFuel(request) ? `<p><strong>Fuel:</strong> ${money(receiptTotals.fuel)} receipt + ${money(fees.fuel)} convenience fee.</p>` : ''}
        ${serviceNeedsWash(request) ? `<p><strong>Car wash:</strong> ${money(receiptTotals.wash)} receipt + ${money(fees.wash)} convenience fee.</p>` : ''}
        ${request.quick_inspection ? `<p><strong>Quick inspection:</strong> ${money(fees.inspection)}</p>` : ''}
        <p><strong>Final total currently saved:</strong> ${request.final_total == null ? 'Not recorded' : money(request.final_total)}</p>
        <p><strong>Expected total from saved receipts:</strong> ${money(expectedFinalTotal)}</p>
      </div>
      <label class="checkbox-label">
        <input class="confirm-complete-totals" type="checkbox">
        <span>I confirm the saved receipt totals and convenience fees are correct.</span>
      </label>
      <div class="admin-button-row">
        <button class="button primary complete-request" data-id="${request.id}" type="button">Complete request</button>
        ${serviceNeedsFuel(request) ? `<button class="button secondary show-total-edit" data-id="${request.id}" data-edit-total="fuel" type="button">Fuel Incorrect</button>` : ''}
        ${serviceNeedsWash(request) ? `<button class="button secondary show-total-edit" data-id="${request.id}" data-edit-total="wash" type="button">Car Wash Incorrect</button>` : ''}
      </div>
      <p class="field-help">Editing a total requires you to confirm the totals again before completing.</p>
      <div class="total-edit-panel" data-total-edit-for="${request.id}" hidden></div>
    </div>
  `;
}

function renderTotalEditForm(request, type) {
  const receiptTotals = receiptTotalsFromNotes(request);
  const label = type === 'fuel' ? 'Fuel total' : 'Car wash total';
  const currentValue = type === 'fuel' ? receiptTotals.fuel : receiptTotals.wash;

  return `
    <div class="admin-money-grid">
      <label>${label}
        <input class="edit-service-total-value" type="number" min="0" step="0.01" value="${currentValue || ''}" placeholder="50.00">
      </label>
    </div>
    <button class="button primary save-total-edit" data-id="${request.id}" data-edit-total="${type}" type="button">Update ${type === 'fuel' ? 'fuel' : 'car wash'} total</button>
  `;
}

function renderEditPanel(request) {
  const canReopen = !isOpen(request) && request.status !== 'complete';
  return `
    <div class="admin-edit-panel" data-edit-for="${request.id}" hidden>
      <h4>Edit request</h4>

      <p class="edit-section-label">Customer</p>
      <div class="field-grid">
        <label>Customer name
          <input class="edit-customer-name" type="text" value="${escapeHtml(request.customer_name || '')}">
        </label>
        <label>Phone
          <input class="edit-customer-phone" type="tel" value="${escapeHtml(request.customer_phone || '')}">
        </label>
        <label>Email
          <input class="edit-customer-email" type="email" value="${escapeHtml(request.customer_email || '')}">
        </label>
      </div>

      <p class="edit-section-label">Service address</p>
      <div class="field-grid">
        <label>Street address
          <input class="edit-address-street" type="text" value="${escapeHtml(request.address_street || '')}">
        </label>
        <label>Apt / suite
          <input class="edit-address-apt" type="text" value="${escapeHtml(request.address_apt || '')}">
        </label>
        <label>City
          <input class="edit-address-city" type="text" value="${escapeHtml(request.address_city || '')}">
        </label>
        <label>State
          <input class="edit-address-state" type="text" value="${escapeHtml(request.address_state || '')}">
        </label>
        <label>ZIP
          <input class="edit-address-zip" type="text" value="${escapeHtml(request.address_zip || '')}">
        </label>
        <label>Parking lot / garage
          <input class="edit-parking-location" type="text" value="${escapeHtml(request.parking_location || '')}">
        </label>
        <label>Parking spot
          <input class="edit-parking-spot" type="text" value="${escapeHtml(request.parking_spot || '')}">
        </label>
        <label>Key handoff details
          <input class="edit-key-handoff" type="text" value="${escapeHtml(request.key_handoff_details || '')}">
        </label>
      </div>

      <p class="edit-section-label">Vehicle</p>
      <div class="field-grid">
        <label>Year
          <input class="edit-vehicle-year" type="text" value="${escapeHtml(request.vehicle_year || '')}">
        </label>
        <label>Make
          <input class="edit-vehicle-make" type="text" value="${escapeHtml(request.vehicle_make || '')}">
        </label>
        <label>Model
          <input class="edit-vehicle-model" type="text" value="${escapeHtml(request.vehicle_model || '')}">
        </label>
        <label>Color
          <input class="edit-vehicle-color" type="text" value="${escapeHtml(request.vehicle_color || '')}">
        </label>
        <label>License plate
          <input class="edit-license-plate" type="text" value="${escapeHtml(request.license_plate || '')}">
        </label>
      </div>

      <p class="edit-section-label">Service</p>
      <div class="field-grid">
        <label>Service date
          <input class="edit-service-date" type="date" value="${escapeHtml(request.service_date || '')}">
        </label>
        <label>Desired return time
          <input class="edit-return-time" type="time" value="${escapeHtml(String(request.desired_return_time || '').slice(0,5))}">
        </label>
        <label>Fuel type
          <input class="edit-fuel-type" type="text" value="${escapeHtml(request.fuel_type || '')}">
        </label>
        <label>Vehicle return location
          <input class="edit-return-location" type="text" value="${escapeHtml(request.return_parking_location || '')}">
        </label>
      </div>

      <p class="edit-section-label">Payment <span class="edit-admin-badge">Admin only</span></p>
      <div class="field-grid">
        <label>Estimated total ($)
          <input class="edit-estimated-total" type="number" min="0" step="0.01" value="${escapeHtml(request.estimated_total != null ? String(request.estimated_total) : '')}">
        </label>
        <label>Final total ($)
          <input class="edit-final-total" type="number" min="0" step="0.01" value="${escapeHtml(request.final_total != null ? String(request.final_total) : '')}">
        </label>
      </div>

      <label>Admin notes
        <textarea class="edit-notes" rows="3">${escapeHtml(request.notes || '')}</textarea>
      </label>

      <div class="admin-button-row">
        <button class="button primary save-edit" data-id="${request.id}" type="button">Save changes</button>
        ${canReopen ? `<button class="button secondary update-status" data-id="${request.id}" data-status="accepted" type="button">Reopen as accepted</button>` : ''}
      </div>
      <p class="edit-save-status field-help" data-status-for="${request.id}"></p>
    </div>
  `;
}

function renderRequests() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const filtered = allRequests.filter((request) => {
    if (currentView === 'open') return isOpen(request);
    if (currentView === 'complete') {
      if (!showAllTime && request.status === 'complete') {
        return (request.updated_at || request.created_at) >= sevenDaysAgo;
      }
      return request.status === 'complete';
    }
    if (currentView === 'closed') {
      if (!showAllTime && closedStatuses.includes(request.status)) {
        return (request.updated_at || request.created_at) >= sevenDaysAgo;
      }
      return closedStatuses.includes(request.status);
    }
    return true;
  });

  const openCount = allRequests.filter(isOpen).length;
  const completeCount = allRequests.filter((r) => r.status === 'complete').length;
  const closedCount = allRequests.filter((r) => closedStatuses.includes(r.status)).length;

  if (openRequests) openRequests.textContent = openCount;
  if (completeRequests) completeRequests.textContent = completeCount;
  if (deniedRequests) deniedRequests.textContent = closedCount;

  // Update hero completed count
  if (adminCompletedCount) adminCompletedCount.textContent = completeCount;

  // Update heading and show-all button
  const headings = { open: 'Open requests', complete: 'Completed requests', closed: 'Closed requests' };
  if (requestQueueHeading) requestQueueHeading.textContent = headings[currentView] || 'Requests';
  if (requestQueueEyebrow) requestQueueEyebrow.textContent = currentView === 'open' ? 'Queue' : 'History';

  const needsShowAll = (currentView === 'complete' || currentView === 'closed') && !showAllTime;
  if (showAllTimeBtn) showAllTimeBtn.style.display = needsShowAll ? '' : 'none';

  // Summary card active state
  [showOpen, showComplete, showDenied].forEach((btn) => btn?.classList.remove('active'));
  if (currentView === 'open') showOpen?.classList.add('active');
  if (currentView === 'complete') showComplete?.classList.add('active');
  if (currentView === 'closed') showDenied?.classList.add('active');

  if (filtered.length === 0) {
    const msg = needsShowAll
      ? '<div class="empty-state"><p>No requests in the last 7 days. <button class="button secondary inline-show-all" type="button">Show all time</button></p></div>'
      : '<div class="empty-state"><p>No requests in this view.</p></div>';
    requestList.innerHTML = msg;
    return;
  }

  requestList.innerHTML = filtered.map((request) => `
    <article class="request-card" data-request-id="${request.id}">
      <div class="request-card-header">
        <div>
          <p class="eyebrow">${escapeHtml(request.id)}</p>
          <h3>${escapeHtml(request.customer_name || 'Customer')}</h3>
        </div>
        <span class="status-pill">${escapeHtml(statusLabels[request.status] || request.status)}</span>
      </div>
      ${requestCardDetails(request)}
      ${renderWorkerAssignment(request)}
      ${renderActions(request)}
    </article>
  `).join('');
}

async function ensureEmployee(fullName) {
  const codePrefix = fullName.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'WORKER';
  const employeeCode = `EMP-${codePrefix}`;
  const { data, error } = await db
    .from('employees')
    .select('id,active')
    .eq('full_name', fullName)
    .limit(1);

  if (error) throw error;

  const existing = data?.[0];

  if (existing) {
    // Re-activate if they were accidentally deactivated.
    if (!existing.active) {
      console.warn(`ensureEmployee: "${fullName}" (${existing.id}) was inactive — re-activating.`);
      const { error } = await db.rpc('admin_update_employee', {
        p_token: adminToken(),
        p_employee_id: existing.id,
        p_data: { active: true, profile_updated_at: new Date().toISOString() },
      });
      if (error) throw error;
    }
    return;
  }

  const { error: insertError } = await db.rpc('admin_insert_employee', {
    p_token: adminToken(),
    p_data: {
      employee_code: employeeCode,
      full_name: fullName,
      active: true,
      home_location: DEFAULT_WORK_LOCATION,
    },
  });

  if (insertError) throw insertError;
}

function normalizeEmployee(employee) {
  return {
    id: employee.id,
    employee_code: employee.employee_code || `EMP-${String(employee.id || '').replaceAll('-', '').slice(0, 6).toUpperCase()}`,
    full_name: employee.full_name || employee.name || DEFAULT_WORKER_NAME,
    phone: employee.phone || '',
    email: employee.email || '',
    photo_url: employee.photo_url || '',
    original_photo_url: employee.original_photo_url || '',
    cropped_photo_url: employee.cropped_photo_url || '',
    photo_zoom: Number(employee.photo_zoom || 1),
    photo_position_x: Number(employee.photo_position_x || 0),
    photo_position_y: Number(employee.photo_position_y || 0),
    home_location: employee.home_location || DEFAULT_WORK_LOCATION,
    started_at: employee.started_at || '',
    active: employee.active !== false,
  };
}

async function loadEmployees() {
  try {
    await ensureEmployee(DEFAULT_WORKER_NAME);
    await ensureEmployee('Test Worker');

    let { data, error } = await db
      .from('employees')
      .select('id,employee_code,full_name,phone,email,photo_url,original_photo_url,cropped_photo_url,photo_zoom,photo_position_x,photo_position_y,home_location,started_at,active')
      .order('full_name', { ascending: true });

    if (error) {
      console.warn('Full employee profile load failed, trying basic employee fields:', error);
      const fallback = await db
        .from('employees')
        .select('id,employee_code,full_name,phone,email,home_location,active')
        .order('full_name', { ascending: true });

      data = fallback.data;
      error = fallback.error;
    }

    if (error) throw error;

    allEmployees = (data || []).map(normalizeEmployee);

    if (selectedScheduleEmployeeId && !allEmployees.some((e) => e.id === selectedScheduleEmployeeId)) {
      console.warn(`Worker ID ${selectedScheduleEmployeeId} not found in employees table. Clearing selection.`);
      selectedScheduleEmployeeId = '';
    }

    if (workerCountBadge) workerCountBadge.textContent = allEmployees.filter((e) => e.active).length;
    renderWorkerSelect();
    renderWorkerProfiles();
  } catch (error) {
    console.warn('Could not load employees:', error);
    allEmployees = [
      normalizeEmployee({ id: 'local-mark-urban', full_name: DEFAULT_WORKER_NAME }),
      normalizeEmployee({ id: 'local-test-worker', full_name: 'Test Worker' }),
    ];
    renderWorkerSelect();
    renderWorkerProfiles();
    renderWorkerDaysGrid(workerDayOptions.map(({ dayOfWeek }) => ({
      dayOfWeek,
      startsAt: '07:00',
      endsAt: '22:00',
    })));
    selectedWorkerDaysOff = new Set();
    renderWorkerDaysOffCalendar();
    if (workerScheduleStatus) {
      workerScheduleStatus.textContent = 'Showing local fallback workers. Run supabase-operational-upgrades.sql so worker profiles and availability save live.';
    }
  }
}

function renderWorkerProfiles() {
  if (!workerProfileList) return;

  if (!allEmployees.length) {
    workerProfileList.innerHTML = '<div class="empty-state"><p>No workers found. Run supabase-operational-upgrades.sql in Supabase.</p></div>';
    return;
  }

  if (!selectedScheduleEmployeeId) {
    workerProfileList.innerHTML = '<div class="empty-state"><p>Select a worker to view or edit their profile.</p></div>';
    return;
  }

  const employee = allEmployees.find((item) => item.id === selectedScheduleEmployeeId);

  if (!employee) {
    console.warn(`renderWorkerProfiles: "${selectedScheduleEmployeeId}" not found in allEmployees. Clearing selection.`);
    selectedScheduleEmployeeId = '';
    if (workerSelect) workerSelect.value = '';
    if (workerProfileSelectActive) workerProfileSelectActive.value = '';
    if (workerProfileSelectInactive) workerProfileSelectInactive.value = '';
    workerProfileList.innerHTML = '<div class="empty-state"><p>Select a worker to view or edit their profile.</p></div>';
    return;
  }

  const isLocal = String(employee.id).startsWith('local-');
  const statusLabel = employee.active ? 'Active' : 'Inactive';
  const statusClass = employee.active ? 'status-pill status-active' : 'status-pill status-inactive';

  // Reset photo editor state for newly rendered card
  adminPhotoZoom = Number(employee.photo_zoom || 1);
  adminPhotoPosition = { x: Number(employee.photo_position_x || 0), y: Number(employee.photo_position_y || 0) };
  adminCroppedPhotoBlob = null;
  adminPhotoDeleted = false;
  if (adminCroppedPreviewUrl) { URL.revokeObjectURL(adminCroppedPreviewUrl); adminCroppedPreviewUrl = ''; }
  if (adminBoundaryPreviewUrl) { URL.revokeObjectURL(adminBoundaryPreviewUrl); adminBoundaryPreviewUrl = ''; }

  workerProfileList.innerHTML = `
    <article class="request-card worker-profile-card" data-worker-id="${escapeHtml(employee.id)}">
      <div class="request-card-header">
        <div>
          <p class="eyebrow">Worker profile</p>
          <h3>${escapeHtml(employee.full_name)}</h3>
          <span class="${statusClass}">${statusLabel}</span>
        </div>
      </div>

      <div class="worker-profile-preview">
        ${(() => {
          const displayUrl  = employee.cropped_photo_url  || employee.photo_url || '';
          const modalUrl    = employee.original_photo_url || employee.cropped_photo_url || employee.photo_url || '';
          const clickAttrs  = displayUrl ? `data-open-worker-photo="true" tabindex="0" role="button" aria-label="View larger photo" data-photo-url="${escapeHtml(modalUrl)}" data-photo-name="${escapeHtml(employee.full_name)}"` : '';
          return `
        <div class="worker-profile-photo-frame ${displayUrl ? 'worker-photo-clickable' : ''}"
             id="admin-photo-frame" ${clickAttrs}>
          ${displayUrl
            ? `<img id="admin-photo-preview" class="worker-profile-photo" src="${escapeHtml(displayUrl)}" alt="${escapeHtml(employee.full_name)}">`
            : `<img id="admin-photo-preview" class="worker-profile-photo" style="display:none" alt="${escapeHtml(employee.full_name)}">`}
          <div id="admin-photo-placeholder" class="worker-profile-photo-placeholder" ${displayUrl ? 'style="display:none"' : ''}>No photo</div>
        </div>`;
        })()}
      </div>

      <div class="profile-photo-actions">
        <span>Profile photo</span>
        <button id="admin-edit-photo" class="button secondary" type="button" ${isLocal ? 'disabled' : ''}>Edit profile photo</button>
        <input id="admin-photo-file" class="visually-hidden-file" type="file" accept="image/*">
      </div>
      <div id="admin-photo-editor-actions" class="worker-photo-editor-actions" hidden>
        <button id="admin-upload-new-photo" class="button secondary" type="button">Upload new photo</button>
        <button id="admin-edit-framing" class="button secondary" type="button" ${employee.photo_url ? '' : 'disabled'}>Edit current framing</button>
        <button id="admin-delete-photo" class="button danger" type="button" ${employee.photo_url ? '' : 'disabled'}>Delete photo</button>
      </div>
      <div id="admin-photo-boundary-panel" class="photo-boundary-panel" hidden>
        <p class="eyebrow">Profile picture boundary</p>
        <div id="admin-photo-boundary-preview" class="photo-boundary-preview">
          <img id="admin-photo-boundary-image" alt="Selected profile photo">
          <span class="photo-boundary-overlay" aria-hidden="true"></span>
        </div>
        <label>Preview zoom
          <input id="admin-photo-zoom-slider" class="admin-photo-zoom-slider" type="range" min="1" max="2.5" step="0.05" value="${adminPhotoZoom}">
        </label>
        <p class="field-help">The uploaded photo stays whole. The clear circle shows what customers will see.</p>
        <p class="field-help">Zoom in, then drag the photo to center it inside the circle.</p>
      </div>

      <div class="field-grid">
        <label>Name
          <input class="admin-worker-name" type="text" value="${escapeHtml(employee.full_name || '')}">
        </label>
        <label>Employee ID
          <input class="admin-worker-code" type="text" value="${escapeHtml(employee.employee_code || '')}" readonly>
        </label>
        <label>Phone
          <input class="admin-worker-phone" type="tel" value="${escapeHtml(employee.phone || '')}">
        </label>
        <label>Email
          <input class="admin-worker-email" type="email" value="${escapeHtml(employee.email || '')}">
        </label>
        <label>Work location
          <select class="admin-worker-location">
            <option value="">Select service center</option>
            ${SERVICE_CENTERS.map(loc => `<option value="${escapeHtml(loc)}" ${employee.home_location === loc ? 'selected' : ''}>${escapeHtml(loc)}</option>`).join('')}
          </select>
        </label>
        <label>Started
          <input class="admin-worker-started" type="date" value="${escapeHtml(employee.started_at || '')}">
        </label>
        <label>New portal password
          <input class="admin-worker-password" type="text" placeholder="Leave blank unless resetting">
        </label>
      </div>
      <div class="admin-button-row">
        <button class="button primary save-worker-profile" data-id="${escapeHtml(employee.id)}" type="button" ${isLocal ? 'disabled' : ''}>Save worker profile</button>
        <button class="button secondary reset-worker-password" data-id="${escapeHtml(employee.id)}" type="button" ${isLocal ? 'disabled' : ''}>Reset password</button>
        ${employee.active
          ? `<button class="button danger deactivate-worker-profile" data-id="${escapeHtml(employee.id)}" type="button" ${isLocal ? 'disabled' : ''}>Deactivate worker</button>`
          : `<button class="button primary reactivate-worker-profile" data-id="${escapeHtml(employee.id)}" type="button" ${isLocal ? 'disabled' : ''}>Reactivate worker</button>
             <button class="button danger permanently-delete-worker" data-id="${escapeHtml(employee.id)}" type="button" ${isLocal ? 'disabled' : ''}>Permanently delete worker</button>`
        }
      </div>
      <p class="field-help admin-worker-status">${isLocal ? 'Run the Supabase worker upgrade before saving this worker.' : ''}</p>
    </article>
  `;

  // Wire up photo editor after DOM is written
  wireAdminPhotoEditor();
}

function applyAdminPhotoZoom() {
  // CSS vars are only needed by the boundary editor preview image.
  // The display frame uses object-fit: cover / object-position: center.
  const boundaryImage = document.querySelector('#admin-photo-boundary-image');
  const zoomSlider = document.querySelector('#admin-photo-zoom-slider');
  const zoomVal = String(adminPhotoZoom);
  const posX = `${adminPhotoPosition.x}%`;
  const posY = `${adminPhotoPosition.y}%`;

  if (boundaryImage) {
    boundaryImage.style.setProperty('--profile-photo-zoom', zoomVal);
    boundaryImage.style.setProperty('--profile-photo-x', posX);
    boundaryImage.style.setProperty('--profile-photo-y', posY);
  }
  if (zoomSlider) zoomSlider.value = zoomVal;
}

function showAdminPhotoPreview(photoUrl) {
  const frame = document.querySelector('#admin-photo-frame');
  const preview = document.querySelector('#admin-photo-preview');
  const placeholder = document.querySelector('#admin-photo-placeholder');
  if (!preview || !placeholder) return;
  if (photoUrl) {
    preview.src = photoUrl;
    preview.style.display = '';
    placeholder.style.display = 'none';
    // Keep the click-to-enlarge pointing at whatever is currently displayed.
    if (frame) {
      frame.dataset.openWorkerPhoto = 'true';
      frame.dataset.photoUrl = photoUrl;
      frame.classList.add('worker-photo-clickable');
      if (!frame.getAttribute('tabindex')) frame.setAttribute('tabindex', '0');
    }
  } else {
    preview.removeAttribute('src');
    preview.style.display = 'none';
    placeholder.style.display = '';
    if (frame) {
      delete frame.dataset.openWorkerPhoto;
      delete frame.dataset.photoUrl;
      frame.classList.remove('worker-photo-clickable');
      frame.removeAttribute('tabindex');
    }
  }
  applyAdminPhotoZoom();
}

function wireAdminPhotoEditor() {
  const editBtn = document.querySelector('#admin-edit-photo');
  const fileInput = document.querySelector('#admin-photo-file');
  const actionsPanel = document.querySelector('#admin-photo-editor-actions');
  const boundaryPanel = document.querySelector('#admin-photo-boundary-panel');
  const boundaryPreview = document.querySelector('#admin-photo-boundary-preview');
  const boundaryImage = document.querySelector('#admin-photo-boundary-image');
  const zoomSlider = document.querySelector('#admin-photo-zoom-slider');

  editBtn?.addEventListener('click', () => {
    if (actionsPanel) actionsPanel.hidden = !actionsPanel.hidden;
  });

  document.querySelector('#admin-upload-new-photo')?.addEventListener('click', () => {
    if (actionsPanel) actionsPanel.hidden = true;
    if (fileInput) fileInput.value = '';
    fileInput?.click();
  });

  document.querySelector('#admin-edit-framing')?.addEventListener('click', () => {
    if (actionsPanel) actionsPanel.hidden = true;
    const employee = allEmployees.find((e) => e.id === selectedScheduleEmployeeId);
    const sourceUrl = employee?.original_photo_url || employee?.photo_url;
    if (!sourceUrl) return;
    // Load the original (uncropped) photo for framing. adminCroppedPhotoBlob = null → no re-upload of original.
    adminPhotoZoom = Number(employee.photo_zoom || 1);
    adminPhotoPosition = { x: Number(employee.photo_position_x || 0), y: Number(employee.photo_position_y || 0) };
    if (adminBoundaryPreviewUrl) { URL.revokeObjectURL(adminBoundaryPreviewUrl); adminBoundaryPreviewUrl = ''; }
    if (boundaryImage) { boundaryImage.crossOrigin = 'anonymous'; boundaryImage.src = sourceUrl; }
    if (boundaryPanel) boundaryPanel.hidden = false;
    applyAdminPhotoZoom();
    const status = document.querySelector('.admin-worker-status');
    if (status) status.textContent = 'Adjust zoom and position, then save.';
  });

  document.querySelector('#admin-delete-photo')?.addEventListener('click', () => {
    if (actionsPanel) actionsPanel.hidden = true;
    adminPhotoDeleted = true;
    adminCroppedPhotoBlob = null;
    adminPhotoZoom = 1;
    adminPhotoPosition = { x: 0, y: 0 };
    if (adminCroppedPreviewUrl) { URL.revokeObjectURL(adminCroppedPreviewUrl); adminCroppedPreviewUrl = ''; }
    if (adminBoundaryPreviewUrl) { URL.revokeObjectURL(adminBoundaryPreviewUrl); adminBoundaryPreviewUrl = ''; }
    showAdminPhotoPreview('');
    if (boundaryPanel) boundaryPanel.hidden = true;
    if (boundaryImage) boundaryImage.removeAttribute('src');
    applyAdminPhotoZoom();
    const status = document.querySelector('.admin-worker-status');
    if (status) status.textContent = 'Photo will be deleted when you save.';
  });

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (adminCroppedPreviewUrl) URL.revokeObjectURL(adminCroppedPreviewUrl);
    if (adminBoundaryPreviewUrl) URL.revokeObjectURL(adminBoundaryPreviewUrl);
    adminCroppedPreviewUrl = URL.createObjectURL(file);
    adminBoundaryPreviewUrl = URL.createObjectURL(file);
    adminCroppedPhotoBlob = file;
    adminPhotoDeleted = false;
    adminPhotoZoom = 1;
    adminPhotoPosition = { x: 0, y: 0 };
    showAdminPhotoPreview(adminCroppedPreviewUrl);
    if (boundaryImage) { boundaryImage.crossOrigin = 'anonymous'; boundaryImage.src = adminBoundaryPreviewUrl; }
    if (boundaryPanel) boundaryPanel.hidden = false;
    applyAdminPhotoZoom();
    const status = document.querySelector('.admin-worker-status');
    if (status) status.textContent = 'Photo selected. Adjust framing, then save.';
  });

  zoomSlider?.addEventListener('input', () => {
    adminPhotoZoom = Number(zoomSlider.value || 1);
    applyAdminPhotoZoom();
  });

  boundaryPreview?.addEventListener('pointerdown', (event) => {
    if (boundaryPanel?.hidden || !boundaryImage?.getAttribute('src')) return;
    adminPhotoDisplayDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originalX: adminPhotoPosition.x,
      originalY: adminPhotoPosition.y,
    };
    boundaryPreview.setPointerCapture(event.pointerId);
    boundaryPreview.classList.add('is-dragging');
  });

  boundaryPreview?.addEventListener('pointermove', (event) => {
    if (!adminPhotoDisplayDrag || adminPhotoDisplayDrag.pointerId !== event.pointerId) return;
    const size = boundaryPreview.getBoundingClientRect().width || 320;
    adminPhotoPosition = {
      x: Math.max(-50, Math.min(50, adminPhotoDisplayDrag.originalX + ((event.clientX - adminPhotoDisplayDrag.startX) / size) * 100)),
      y: Math.max(-50, Math.min(50, adminPhotoDisplayDrag.originalY + ((event.clientY - adminPhotoDisplayDrag.startY) / size) * 100)),
    };
    applyAdminPhotoZoom();
  });

  const endDrag = (event) => {
    if (!adminPhotoDisplayDrag || adminPhotoDisplayDrag.pointerId !== event.pointerId) return;
    boundaryPreview?.releasePointerCapture(event.pointerId);
    boundaryPreview?.classList.remove('is-dragging');
    adminPhotoDisplayDrag = null;
  };
  boundaryPreview?.addEventListener('pointerup', endDrag);
  boundaryPreview?.addEventListener('pointercancel', endDrag);
}

function renderWorkerSelect() {
  const sel = selectedScheduleEmployeeId || workerSelect?.value;
  const activeEmployees = allEmployees.filter((e) => e.active);
  const inactiveEmployees = allEmployees.filter((e) => !e.active);

  const toOption = (e) => `<option value="${escapeHtml(e.id)}" ${e.id === sel ? 'selected' : ''}>${escapeHtml(e.full_name)} (${escapeHtml(e.employee_code)})</option>`;

  // Schedule section: active workers only
  if (workerSelect) {
    workerSelect.innerHTML = `<option value="">Select worker</option>${activeEmployees.map(toOption).join('')}`;
  }

  // Profile active dropdown
  if (workerProfileSelectActive) {
    workerProfileSelectActive.innerHTML = `<option value="">Select active worker</option>${activeEmployees.map(toOption).join('')}`;
  }

  // Profile inactive dropdown
  if (workerProfileSelectInactive) {
    workerProfileSelectInactive.innerHTML = `<option value="">Select inactive worker</option>${inactiveEmployees.map(toOption).join('')}`;
  }

  if (sel && allEmployees.some((e) => e.id === sel)) {
    selectedScheduleEmployeeId = sel;
  } else {
    selectedScheduleEmployeeId = '';
  }

  if (workerSelect) workerSelect.value = selectedScheduleEmployeeId || '';
  if (workerProfileSelectActive) workerProfileSelectActive.value = selectedScheduleEmployeeId || '';
  if (workerProfileSelectInactive) workerProfileSelectInactive.value = selectedScheduleEmployeeId || '';
}

function syncSelectedWorker(employeeId) {
  if (!employeeId || !allEmployees.some((employee) => employee.id === employeeId)) {
    return false;
  }

  selectedScheduleEmployeeId = employeeId;
  if (workerSelect) workerSelect.value = employeeId;
  if (workerProfileSelectActive) workerProfileSelectActive.value = employeeId;
  if (workerProfileSelectInactive) workerProfileSelectInactive.value = employeeId;
  renderWorkerProfiles();
  return true;
}

async function loadAdminWorkerSchedule(employeeId) {
  const employee = allEmployees.find((item) => item.id === employeeId);
  if (!employee) return;

  syncSelectedWorker(employeeId);
  if (workerLocation) workerLocation.value = employee.home_location || DEFAULT_WORK_LOCATION;

  if (String(employeeId).startsWith('local-')) {
    renderWorkerDaysGrid(workerDayOptions.map(({ dayOfWeek }) => ({
      dayOfWeek,
      startsAt: '07:00',
      endsAt: '22:00',
    })));
    selectedWorkerDaysOff = new Set();
    renderWorkerDaysOffCalendar();
    renderWorkerProfiles();
    if (workerScheduleStatus) {
      workerScheduleStatus.textContent = 'This is a local fallback worker. Run supabase-operational-upgrades.sql before saving availability.';
    }
    return;
  }

  const { data: availability, error: availabilityError } = await db
    .from('employee_availability')
    .select('day_of_week,starts_at,ends_at,work_location')
    .eq('employee_id', employeeId);

  if (availabilityError) {
    console.warn('Could not load worker availability:', availabilityError);
    renderWorkerDaysGrid([]);
  } else {
    const rows = availability || [];
    renderWorkerDaysGrid(rows.map((row) => ({
      dayOfWeek: row.day_of_week,
      startsAt: String(row.starts_at || '07:00').slice(0, 5),
      endsAt: String(row.ends_at || '22:00').slice(0, 5),
    })));

    const location = rows.find((row) => row.work_location)?.work_location || employee.home_location || DEFAULT_WORK_LOCATION;
    if (workerLocation) workerLocation.value = location;
  }

  const { data: daysOff, error: daysOffError } = await db
    .from('employee_days_off')
    .select('day_off')
    .eq('employee_id', employeeId);

  if (daysOffError) {
    console.warn('Could not load worker days off:', daysOffError);
  } else {
    selectedWorkerDaysOff = new Set((daysOff || []).map((item) => item.day_off));
  }

  renderWorkerDaysOffCalendar();
  renderWorkerProfiles();
}

async function uploadAdminWorkerPhoto(employeeId, blob) {
  const safeName = (blob.name || 'profile.jpg').replace(/[^a-z0-9.-]/gi, '-').toLowerCase();
  const path = `workers/${employeeId}/${Date.now()}-${safeName}`;

  const { error } = await db.storage.from(PHOTO_BUCKET).upload(path, blob, { upsert: false });
  if (error) throw error;

  const { data } = db.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  return data?.publicUrl || path;
}

async function validateUniqueWorkerPhone(employeeId, phone) {
  if (!phone) return;

  const { data, error } = await db
    .from('employees')
    .select('id,full_name,employee_code')
    .eq('phone', phone)
    .eq('active', true)
    .neq('id', employeeId)
    .limit(1);

  if (error) throw error;

  const conflict = data?.[0];
  if (conflict) {
    throw new Error(`Phone number is already used by ${conflict.full_name} (${conflict.employee_code}).`);
  }
}

async function saveAdminWorkerProfile(button) {
  const card = button.closest('.worker-profile-card');
  const employeeId = button.dataset.id;
  const existingEmployee = allEmployees.find((employee) => employee.id === employeeId);
  const status = card?.querySelector('.admin-worker-status');

  if (status) status.textContent = 'Saving worker profile...';

  // Validate phone uniqueness BEFORE uploading photo so a conflict never orphans an upload.
  const phone = card?.querySelector('.admin-worker-phone')?.value.trim() || null;
  await validateUniqueWorkerPhone(employeeId, phone);

  // Resolve photo URLs: delete → clear both; new upload → upload original + canvas-crop;
  // edit framing only → canvas-crop to refresh cropped_photo_url; else keep existing.
  let originalPhotoUrl = existingEmployee?.original_photo_url || existingEmployee?.photo_url || null;
  let croppedPhotoUrl  = existingEmployee?.cropped_photo_url  || existingEmployee?.photo_url || null;
  const boundaryImage  = document.querySelector('#admin-photo-boundary-image');

  if (adminPhotoDeleted) {
    originalPhotoUrl = null;
    croppedPhotoUrl  = null;
    adminPhotoZoom   = 1;
    adminPhotoPosition = { x: 0, y: 0 };
  } else if (adminCroppedPhotoBlob) {
    // New photo uploaded — upload original then generate cropped version.
    originalPhotoUrl = await uploadAdminWorkerPhoto(employeeId, adminCroppedPhotoBlob);
    const croppedFile = boundaryImage?.naturalWidth
      ? await window.ShiftFuelPhoto?.cropToBlobFromBoundaryEditor(boundaryImage, adminPhotoZoom, adminPhotoPosition.x, adminPhotoPosition.y)
      : null;
    croppedPhotoUrl = croppedFile
      ? await uploadAdminWorkerPhoto(employeeId, croppedFile)
      : originalPhotoUrl;
  } else if (boundaryImage?.naturalWidth && boundaryImage.getAttribute('src')) {
    // Edit framing — regenerate crop from boundary editor without re-uploading original.
    const croppedFile = await window.ShiftFuelPhoto?.cropToBlobFromBoundaryEditor(boundaryImage, adminPhotoZoom, adminPhotoPosition.x, adminPhotoPosition.y);
    if (croppedFile) croppedPhotoUrl = await uploadAdminWorkerPhoto(employeeId, croppedFile);
  }

  const photoUrl = croppedPhotoUrl || originalPhotoUrl; // backward-compat photo_url = cropped version

  const updates = {
    full_name: card?.querySelector('.admin-worker-name')?.value.trim() || existingEmployee?.full_name || DEFAULT_WORKER_NAME,
    phone,
    email: card?.querySelector('.admin-worker-email')?.value.trim() || existingEmployee?.email || null,
    home_location: card?.querySelector('.admin-worker-location')?.value || existingEmployee?.home_location || DEFAULT_WORK_LOCATION,
    started_at: card?.querySelector('.admin-worker-started')?.value || null,
    photo_url: photoUrl,
    original_photo_url: originalPhotoUrl,
    cropped_photo_url: croppedPhotoUrl,
    photo_zoom: adminPhotoZoom,
    photo_position_x: adminPhotoPosition.x,
    photo_position_y: adminPhotoPosition.y,
    profile_updated_at: new Date().toISOString(),
  };
  const password = card?.querySelector('.admin-worker-password')?.value.trim();

  if (password) {
    Object.assign(updates, await passwordFields(password));
  }

  const { data: rpcRows, error } = await db.rpc('admin_update_employee', {
    p_token: adminToken(),
    p_employee_id: employeeId,
    p_data: updates,
  });

  if (error) {
    console.warn(`saveAdminWorkerProfile: DB update failed for employee ${employeeId}:`, error);
    throw error;
  }

  // admin_update_employee also syncs employee_availability.work_location when home_location changes.
  const data = (rpcRows || [])[0];

  // Propagate name/phone/photo to open service requests (non-fatal).
  const { error: srError } = await db
    .from('service_requests')
    .update({
      assigned_worker_name: data.full_name,
      assigned_worker_phone: data.phone || null,
      assigned_worker_photo_url: data.cropped_photo_url || data.photo_url || null,
      assigned_worker_original_photo_url: data.original_photo_url || null,
      updated_at: new Date().toISOString(),
    })
    .eq('assigned_employee_id', employeeId);

  if (srError) {
    console.warn(`saveAdminWorkerProfile: could not update service_requests for employee ${employeeId}:`, srError);
  }

  // Normalize the returned row so photo_zoom/position defaults are always numbers.
  allEmployees = allEmployees.map((employee) => employee.id === employeeId ? normalizeEmployee(data) : employee);
  selectedScheduleEmployeeId = employeeId;
  if (workerLocation) {
    workerLocation.value = data.home_location || DEFAULT_WORK_LOCATION;
  }
  renderWorkerSelect();
  renderWorkerProfiles();
  renderRequests();
  if (status) status.textContent = 'Worker profile saved.';
}

async function resetAdminWorkerPassword(button) {
  const card = button.closest('.worker-profile-card');
  const employeeId = button.dataset.id;
  const status = card?.querySelector('.admin-worker-status');
  const passwordInput = card?.querySelector('.admin-worker-password');
  const password = passwordInput?.value.trim() || randomPassword();

  if (status) status.textContent = 'Resetting worker password...';

  const { error } = await db.rpc('admin_update_employee', {
    p_token: adminToken(),
    p_employee_id: employeeId,
    p_data: await passwordFields(password),
  });

  if (error) throw error;

  if (passwordInput) passwordInput.value = password;
  if (status) status.textContent = `Password reset. Give this password to the worker: ${password}`;
}

async function deactivateAdminWorkerProfile(button) {
  const employeeId = button.dataset.id;
  const employee = allEmployees.find((item) => item.id === employeeId);

  if (!employee || String(employeeId).startsWith('local-')) return;

  const confirmed = window.confirm(`Deactivate ${employee.full_name}? They will no longer appear in the worker schedule or assignment dropdowns. You can reactivate them at any time.`);
  if (!confirmed) return;

  const { error } = await db.rpc('admin_update_employee', {
    p_token: adminToken(),
    p_employee_id: employeeId,
    p_data: { active: false, profile_updated_at: new Date().toISOString() },
  });

  if (error) throw error;

  // Update in-memory record — keep them in allEmployees so the profile dropdown still shows them.
  allEmployees = allEmployees.map((e) => e.id === employeeId ? { ...e, active: false } : e);

  renderWorkerSelect();
  renderWorkerProfiles();
  renderRequests();
}

async function reactivateAdminWorkerProfile(button) {
  const employeeId = button.dataset.id;
  const employee = allEmployees.find((item) => item.id === employeeId);
  const card = button.closest('.worker-profile-card');
  const status = card?.querySelector('.admin-worker-status');

  if (!employee || String(employeeId).startsWith('local-')) return;

  if (status) status.textContent = 'Checking phone number...';

  // Block reactivation if another active worker already has this phone.
  await validateUniqueWorkerPhone(employeeId, employee.phone || null);

  const { error } = await db.rpc('admin_update_employee', {
    p_token: adminToken(),
    p_employee_id: employeeId,
    p_data: { active: true, profile_updated_at: new Date().toISOString() },
  });

  if (error) throw error;

  allEmployees = allEmployees.map((e) => e.id === employeeId ? { ...e, active: true } : e);

  renderWorkerSelect();
  renderWorkerProfiles();
  renderRequests();
  if (status) status.textContent = 'Worker reactivated.';
}


async function permanentlyDeleteInactiveWorker(button) {
  const employeeId = button.dataset.id;
  const employee = allEmployees.find((item) => item.id === employeeId);
  const card = button.closest('.worker-profile-card');
  const status = card?.querySelector('.admin-worker-status');

  if (!employee || String(employeeId).startsWith('local-')) return;

  if (employee.active) {
    throw new Error('Active workers cannot be permanently deleted. Deactivate first.');
  }

  const confirmation = window.prompt(
    `This will permanently delete ${employee.full_name} and all related records.\n\nCompleted service requests will keep the worker name/phone/photo as text but lose the live link.\n\nType DELETE to confirm.`
  );
  if (confirmation !== 'DELETE') {
    if (status) status.textContent = 'Permanent delete cancelled.';
    return;
  }

  if (status) status.textContent = 'Deleting worker...';

  // Clear DB records (service_requests assignment + availability + days_off + employee row).
  const { error: deleteError } = await db.rpc('admin_delete_employee', {
    p_token: adminToken(),
    p_employee_id: employeeId,
  });
  if (deleteError) throw deleteError;

  // Attempt to delete storage files under service-photos/workers/{employeeId}/.
  try {
    const { data: storageFiles } = await db.storage
      .from('service-photos')
      .list(`workers/${employeeId}`);
    if (storageFiles?.length) {
      const paths = storageFiles.map((f) => `workers/${employeeId}/${f.name}`);
      await db.storage.from('service-photos').remove(paths);
    }
  } catch (storageErr) {
    console.warn('Could not remove worker storage files (non-fatal):', storageErr);
  }

  // Remove from in-memory list and clear selection.
  allEmployees = allEmployees.filter((e) => e.id !== employeeId);
  selectedScheduleEmployeeId = '';
  if (workerSelect) workerSelect.value = '';
  if (workerProfileSelectActive) workerProfileSelectActive.value = '';
  if (workerProfileSelectInactive) workerProfileSelectInactive.value = '';

  renderWorkerSelect();
  renderWorkerProfiles();
  renderRequests();
}

async function loadRequests() {
  requestList.innerHTML = '<div class="empty-state"><p>Loading requests...</p></div>';
  const { data, error } = await db
    .from('service_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    requestList.innerHTML = '<div class="empty-state"><p>Could not load requests. Check the console.</p></div>';
    return;
  }

  allRequests = data || [];
  updateHeroStats();
  renderRequests();
}

function renderReviews(reviews, requestMap = new Map(), starFilter = null) {
  if (!reviewList) return;

  // Update average rating display (from all reviews, not filtered)
  if (reviewAverageDisplay) {
    if (reviews.length) {
      const avg = (reviews.reduce((s, r) => s + Number(r.rating), 0) / reviews.length).toFixed(1);
      reviewAverageDisplay.textContent = `Avg: ${avg} / 5`;
    } else {
      reviewAverageDisplay.textContent = '';
    }
  }

  // Update star filter button active state
  if (starFilterButtons) {
    starFilterButtons.querySelectorAll('.star-filter-btn').forEach((btn) => {
      const btnStars = btn.dataset.stars === '' ? null : Number(btn.dataset.stars);
      btn.classList.toggle('active', btnStars === starFilter);
    });
  }

  const filtered = starFilter ? reviews.filter((r) => Number(r.rating) === starFilter) : reviews;

  if (!filtered.length) {
    reviewList.innerHTML = '<div class="empty-state"><p>No reviews in this view.</p></div>';
    return;
  }

  reviewList.innerHTML = filtered.map((review) => {
    const request = requestMap.get(review.service_request_id) || {};
    const stars = '★'.repeat(Math.max(0, Math.min(5, Number(review.rating))));

    return `
      <article class="request-card">
        <div class="request-card-header">
          <div>
            <p class="eyebrow">${escapeHtml(review.service_request_id)}</p>
            <h3><span class="review-stars">${stars}</span> ${escapeHtml(String(review.rating))} / 5</h3>
          </div>
          <span class="status-pill">${escapeHtml(formatDateTime(review.submitted_at))}</span>
        </div>
        <div class="request-details">
          <p><strong>Worker:</strong> ${escapeHtml(request.assigned_worker_name || 'Not assigned')}</p>
          <p><strong>Customer:</strong> ${escapeHtml(review.customer_name || 'Unknown')} ${review.customer_phone ? `| ${escapeHtml(review.customer_phone)}` : ''} ${review.customer_email ? `| ${escapeHtml(review.customer_email)}` : ''}</p>
          ${review.comments ? `<p><strong>Comments:</strong> ${escapeHtml(review.comments)}</p>` : '<p><strong>Comments:</strong> No comments provided.</p>'}
        </div>
      </article>
    `;
  }).join('');
}

async function loadReviews() {
  if (!reviewList) {
    return;
  }

  reviewList.innerHTML = '<div class="empty-state"><p>Loading reviews...</p></div>';

  const { data, error } = await db
    .from('service_reviews')
    .select('id,service_request_id,rating,comments,customer_name,customer_phone,customer_email,submitted_at')
    .order('submitted_at', { ascending: false });

  if (error) {
    console.warn('Could not load reviews:', error);
    reviewList.innerHTML = '<div class="empty-state"><p>Could not load reviews. Run supabase-service-reviews.sql in Supabase.</p></div>';
    return;
  }

  const reviews = data || [];
  const requestIds = reviews.map((review) => review.service_request_id).filter(Boolean);
  let requestMap = new Map();

  if (requestIds.length) {
    const { data: requests, error: requestError } = await db
      .from('service_requests')
      .select('id,assigned_worker_name')
      .in('id', requestIds);

    if (!requestError) {
      requestMap = new Map((requests || []).map((request) => [request.id, request]));
    }
  }

  allReviews = reviews;
  allReviewRequestMap = requestMap;
  if (totalReviewsEl) totalReviewsEl.textContent = allReviews.length;
  updateHeroStats();
  renderReviews(allReviews, allReviewRequestMap, currentReviewFilter);
}

function renderApplicants(applicants) {
  if (!applicantList) {
    return;
  }

  if (!applicants.length) {
    applicantList.innerHTML = '<div class="empty-state"><p>No applicants submitted yet.</p></div>';
    return;
  }

  applicantList.innerHTML = applicants.map((applicant) => `
    <article class="request-card" data-applicant-id="${escapeHtml(applicant.id)}">
      <div class="request-card-header">
        <div>
          <p class="eyebrow">${escapeHtml(formatDateTime(applicant.created_at))}</p>
          <h3>${escapeHtml(applicant.name || 'Applicant')}</h3>
        </div>
        <label class="applicant-status-control">
          Status
          <select class="applicant-status-select" data-id="${escapeHtml(applicant.id)}">
            ${['new', 'contacted', 'interviewing', 'hired', 'declined'].map((status) => `
              <option value="${status}" ${applicant.status === status ? 'selected' : ''}>${applicantStatusLabels[status] || status}</option>
            `).join('')}
          </select>
        </label>
      </div>
      <div class="request-details">
        <p><strong>Phone:</strong> ${escapeHtml(applicant.phone || 'Not provided')}</p>
        <p><strong>Email:</strong> ${escapeHtml(applicant.email || 'Not provided')}</p>
        <p><strong>Availability:</strong> ${escapeHtml(applicant.availability || 'Not provided')}</p>
        <p><strong>Notes:</strong> ${escapeHtml(applicant.notes || 'No notes provided.')}</p>
        <p><strong>Resume:</strong> ${applicant.resume_url ? `<a href="${escapeHtml(applicant.resume_url)}" target="_blank" rel="noopener">Open resume</a>` : 'Not uploaded'}</p>
      </div>
    </article>
  `).join('');
}

async function loadApplicants() {
  if (!applicantList) {
    return;
  }

  applicantList.innerHTML = '<div class="empty-state"><p>Loading applicants...</p></div>';

  let { data, error } = await db
    .from('applicants')
    .select('id,name,email,phone,availability,notes,resume_url,resume_storage_path,status,created_at')
    .neq('status', 'hired')
    .order('created_at', { ascending: false });

  if (error?.code === 'PGRST204') {
    ({ data, error } = await db
      .from('applicants')
      .select('id,name,email,phone,availability,notes,status,created_at')
      .neq('status', 'hired')
      .order('created_at', { ascending: false }));
  }

  if (error) {
    console.warn('Could not load applicants:', error);
    applicantList.innerHTML = '<div class="empty-state"><p>Could not load applicants. Run supabase-operational-upgrades.sql in Supabase.</p></div>';
    return;
  }

  allApplicantsList = data || [];
  if (totalApplicantsEl) totalApplicantsEl.textContent = allApplicantsList.length;
  renderApplicants(allApplicantsList);
}

async function hireApplicant(applicantId) {
  const { data: applicant, error: applicantError } = await db
    .from('applicants')
    .select('id,name,email,phone,availability,notes')
    .eq('id', applicantId)
    .single();

  if (applicantError) throw applicantError;

  const generatedPassword = randomPassword();
  const passwordUpdate = await passwordFields(generatedPassword);
  const phone = applicant.phone || null;
  let employee = null;

  if (!phone) {
    throw new Error('Applicant needs a phone number before hiring.');
  }

  if (phone) {
    const { data: existingByPhone, error: phoneError } = await db
      .from('employees')
      .select('id')
      .eq('phone', phone)
      .limit(1);

    if (phoneError) throw phoneError;
    employee = existingByPhone?.[0] || null;
  }

  if (employee) {
    const { error } = await db.rpc('admin_update_employee', {
      p_token: adminToken(),
      p_employee_id: employee.id,
      p_data: {
        full_name: applicant.name,
        email: applicant.email || null,
        phone,
        active: true,
        home_location: DEFAULT_WORK_LOCATION,
        ...passwordUpdate,
        profile_updated_at: new Date().toISOString(),
      },
    });
    if (error) throw error;
  } else {
    const randomSuffix = Array.from(crypto.getRandomValues(new Uint8Array(3)), (value) => value.toString(16).padStart(2, '0')).join('').toUpperCase();
    const { error } = await db.rpc('admin_insert_employee', {
      p_token: adminToken(),
      p_data: {
        employee_code: `EMP-${randomSuffix}`,
        full_name: applicant.name,
        email: applicant.email || null,
        phone,
        active: true,
        home_location: DEFAULT_WORK_LOCATION,
        ...passwordUpdate,
      },
    });
    if (error) throw error;
  }

  const { error: statusError } = await db.rpc('admin_update_applicant', {
    p_token: adminToken(),
    p_applicant_id: applicantId,
    p_data: { status: 'hired' },
  });

  if (statusError) throw statusError;

  applicantList?.querySelector(`[data-applicant-id="${applicantId}"]`)?.remove();
  await loadEmployees();
  await loadApplicants();
  alert(`Applicant hired. Temporary worker password: ${generatedPassword}`);
}

applicantList?.addEventListener('change', async (event) => {
  if (!event.target.classList.contains('applicant-status-select')) {
    return;
  }

  const select = event.target;

  if (select.value === 'hired') {
    try {
      await hireApplicant(select.dataset.id);
    } catch (error) {
      console.error('Applicant hire failed:', error);
      alert('Could not hire applicant. Make sure phone numbers are unique and worker password columns exist.');
    }
    return;
  }

  const { error } = await db.rpc('admin_update_applicant', {
    p_token: adminToken(),
    p_applicant_id: select.dataset.id,
    p_data: { status: select.value },
  });

  if (error) {
    console.error('Applicant status update failed:', error);
    alert('Could not update applicant status. Check the console.');
  }
});

workerProfileList?.addEventListener('click', async (event) => {
  const saveButton = event.target.closest('.save-worker-profile');
  const deactivateButton = event.target.closest('.deactivate-worker-profile');
  const reactivateButton = event.target.closest('.reactivate-worker-profile');
  const permanentDeleteButton = event.target.closest('.permanently-delete-worker');
  const resetPasswordButton = event.target.closest('.reset-worker-password');

  if (resetPasswordButton) {
    resetPasswordButton.disabled = true;
    try {
      await resetAdminWorkerPassword(resetPasswordButton);
    } catch (error) {
      console.error('Worker password reset failed:', error);
      const status = resetPasswordButton.closest('.worker-profile-card')?.querySelector('.admin-worker-status');
      if (status) status.textContent = 'Could not reset worker password.';
    } finally {
      resetPasswordButton.disabled = false;
    }
    return;
  }

  if (deactivateButton) {
    deactivateButton.disabled = true;
    try {
      await deactivateAdminWorkerProfile(deactivateButton);
    } catch (error) {
      console.error('Worker deactivate failed:', error);
      const status = deactivateButton.closest('.worker-profile-card')?.querySelector('.admin-worker-status');
      if (status) status.textContent = `Could not deactivate worker: ${error.message}`;
      deactivateButton.disabled = false;
    }
    return;
  }

  if (reactivateButton) {
    reactivateButton.disabled = true;
    try {
      await reactivateAdminWorkerProfile(reactivateButton);
    } catch (error) {
      console.error('Worker reactivate failed:', error);
      const status = reactivateButton.closest('.worker-profile-card')?.querySelector('.admin-worker-status');
      if (status) status.textContent = `Could not reactivate worker: ${error.message}`;
      reactivateButton.disabled = false;
    }
    return;
  }

  if (permanentDeleteButton) {
    permanentDeleteButton.disabled = true;
    try {
      await permanentlyDeleteInactiveWorker(permanentDeleteButton);
    } catch (error) {
      console.error('Worker permanent delete failed:', error);
      const status = permanentDeleteButton.closest('.worker-profile-card')?.querySelector('.admin-worker-status');
      if (status) status.textContent = `Could not delete worker: ${error.message}`;
      permanentDeleteButton.disabled = false;
    }
    return;
  }

  if (!saveButton) return;

  saveButton.disabled = true;
  try {
    await saveAdminWorkerProfile(saveButton);
  } catch (error) {
    console.error('Worker profile save failed:', error);
    const status = saveButton.closest('.worker-profile-card')?.querySelector('.admin-worker-status');
    if (status) status.textContent = `Could not save: ${error.message || 'Check Supabase setup.'}`;
  } finally {
    saveButton.disabled = false;
  }
});

async function handleWorkerSelection(employeeId, shouldScroll = false) {
  if (!employeeId) {
    selectedScheduleEmployeeId = '';
    if (workerSelect) workerSelect.value = '';
    if (workerProfileSelectActive) workerProfileSelectActive.value = '';
    if (workerProfileSelectInactive) workerProfileSelectInactive.value = '';
    renderWorkerProfiles();
    return;
  }

  if (!syncSelectedWorker(employeeId)) return;
  await loadAdminWorkerSchedule(employeeId);

  if (shouldScroll) {
    document.querySelector(`[data-worker-id="${employeeId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

workerSelect?.addEventListener('change', () => {
  handleWorkerSelection(workerSelect.value, true);
});

workerProfileSelectActive?.addEventListener('change', () => {
  if (workerProfileSelectActive.value) {
    if (workerProfileSelectInactive) workerProfileSelectInactive.value = '';
    handleWorkerSelection(workerProfileSelectActive.value);
  }
});

workerProfileSelectInactive?.addEventListener('change', () => {
  if (workerProfileSelectInactive.value) {
    if (workerProfileSelectActive) workerProfileSelectActive.value = '';
    handleWorkerSelection(workerProfileSelectInactive.value);
  }
});

async function updateRequestStatus(id, status) {
  const { error } = await db.rpc('admin_update_request', {
    p_token: adminToken(),
    p_request_id: id,
    p_data: { status },
  });
  if (error) throw error;
  await loadRequests();
}

async function updateWorkerAssignment(requestId, employeeId) {
  const employee = allEmployees.find((item) => item.id === employeeId);
  const updates = employee
    ? {
        assigned_employee_id: employee.id,
        assigned_worker_name: employee.full_name,
        assigned_worker_phone: employee.phone || null,
        assigned_worker_photo_url: employee.cropped_photo_url || employee.photo_url || null,
        assigned_worker_original_photo_url: employee.original_photo_url || null,
      }
    : {
        assigned_employee_id: null,
        assigned_worker_name: null,
        assigned_worker_phone: null,
        assigned_worker_photo_url: null,
      };

  const { error } = await db.rpc('admin_update_request', {
    p_token: adminToken(),
    p_request_id: requestId,
    p_data: updates,
  });

  if (error) throw error;

  await loadRequests();
}

async function uploadPhotoFile(requestId, photoType, file) {
  const extension = file.name.split('.').pop() || 'jpg';
  const path = `${requestId}/${Date.now()}-${photoType}.${extension}`;

  const { error: uploadError } = await db.storage.from(PHOTO_BUCKET).upload(path, file, { upsert: false });
  if (uploadError) throw uploadError;

  const { data: publicUrlData } = db.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  const imageUrl = publicUrlData?.publicUrl || path;

  const { error: insertError } = await db.from('photos').insert({
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

async function saveFinalTotal(button) {
  const id = button.dataset.id;
  const request = allRequests.find((item) => item.id === id);
  const panel = button.closest('.receipt-panel');
  const receiptMode = button.dataset.receiptMode || 'all';
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

  const fees = feeSummary(request);
  const newReceiptTotals = {
    fuel: receiptMode === 'fuel' || receiptMode === 'all' ? numberFromInput(fuelReceipt) : savedTotals.fuel,
    wash: receiptMode === 'wash' || receiptMode === 'all' ? numberFromInput(washReceipt) : savedTotals.wash,
  };
  const finalTotal = finalTotalFromSavedReceipts(request, newReceiptTotals);

  const serviceNote = receiptMode === 'fuel'
    ? `Fuel receipt recorded: ${money(newReceiptTotals.fuel)}.`
    : receiptMode === 'wash'
      ? `Car wash receipt recorded: ${money(newReceiptTotals.wash)}.`
      : `Receipt totals recorded: fuel ${money(newReceiptTotals.fuel)}, wash ${money(newReceiptTotals.wash)}.`;
  const note = `${serviceNote} [receipt_totals fuel=${newReceiptTotals.fuel.toFixed(2)} wash=${newReceiptTotals.wash.toFixed(2)}] Fees: fuel convenience ${money(fees.fuel)}, wash convenience ${money(fees.wash)}, inspection ${money(fees.inspection)}. Final total ${money(finalTotal)}.`;
  const notes = request.notes ? `${request.notes}\n${note}` : note;

  button.disabled = true;
  button.textContent = 'Saving...';

  if (fuelReceiptFile) {
    await uploadPhotoFile(id, 'fuel_receipt', fuelReceiptFile);
  }

  if (washReceiptFile) {
    await uploadPhotoFile(id, 'wash_receipt', washReceiptFile);
  }

  const updates = { final_total: finalTotal, notes, updated_at: new Date().toISOString() };

  if (button.dataset.nextStatus) {
    updates.status = button.dataset.nextStatus;
  }

  const { error } = await db
    .from('service_requests')
    .update(updates)
    .eq('id', id);

  if (error) throw error;
  await loadRequests();
}

async function saveServiceUnable(button) {
  const id = button.dataset.id;
  const panel = button.closest('.service-unable-panel');
  const request = allRequests.find((item) => item.id === id);
  const type = panel?.dataset.serviceType;
  const reason = panel?.querySelector('.service-unable-reason')?.value.trim();

  if (!request || !type) return;

  if (!reason) {
    alert('Add a reason before saving.');
    return;
  }

  const label = type === 'fuel' ? 'Fuel' : 'Car wash';
  const receiptTotals = receiptTotalsFromNotes(request);
  const finalTotal = finalTotalFromSavedReceipts(request, receiptTotals);
  const note = `[service_unable ${type}] ${label} could not be completed: ${reason}`;
  const notes = request.notes ? `${request.notes}\n${note}` : note;

  button.disabled = true;
  button.textContent = 'Saving...';

  const { error } = await db
    .from('service_requests')
    .update({
      status: nextStatusAfterServiceUnable(request, type),
      final_total: finalTotal,
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw error;
  await loadRequests();
}

async function saveDenyReason(button) {
  const id = button.dataset.id;
  const panel = button.closest('.deny-reason-panel');
  const request = allRequests.find((item) => item.id === id);
  const reason = panel?.querySelector('.deny-reason')?.value.trim();

  if (!request) return;

  if (!reason) {
    alert('Add a reason before denying this request.');
    return;
  }

  button.disabled = true;
  button.textContent = 'Denying...';

  const note = `Admin denial reason: ${reason}`;
  const notes = request.notes ? `${request.notes}\n${note}` : note;
  const updates = {
    status: 'denied',
    cancellation_reason: reason,
    notes,
    updated_at: new Date().toISOString(),
  };

  let { error } = await db
    .from('service_requests')
    .update(updates)
    .eq('id', id);

  if (error?.code === 'PGRST204' && String(error.message || '').includes("'cancellation_reason'")) {
    delete updates.cancellation_reason;
    ({ error } = await db
      .from('service_requests')
      .update(updates)
      .eq('id', id));
  }

  if (error) throw error;
  await loadRequests();
}

async function saveTotalEdit(button) {
  const id = button.dataset.id;
  const type = button.dataset.editTotal;
  const request = allRequests.find((item) => item.id === id);
  const panel = button.closest('.total-edit-panel');
  const value = numberFromInput(panel.querySelector('.edit-service-total-value')?.value);

  if (!value) {
    alert(`Enter the corrected ${type === 'fuel' ? 'fuel' : 'car wash'} total.`);
    return;
  }

  const receiptTotals = receiptTotalsFromNotes(request);
  const newReceiptTotals = {
    fuel: type === 'fuel' ? value : receiptTotals.fuel,
    wash: type === 'wash' ? value : receiptTotals.wash,
  };
  const fees = feeSummary(request);
  const finalTotal = finalTotalFromSavedReceipts(request, newReceiptTotals);
  const note = `Corrected ${type === 'fuel' ? 'fuel' : 'car wash'} total: ${money(value)}. [receipt_totals fuel=${newReceiptTotals.fuel.toFixed(2)} wash=${newReceiptTotals.wash.toFixed(2)}] Fees: fuel convenience ${money(fees.fuel)}, wash convenience ${money(fees.wash)}, inspection ${money(fees.inspection)}. Final total ${money(finalTotal)}.`;
  const notes = request.notes ? `${request.notes}\n${note}` : note;

  button.disabled = true;
  button.textContent = 'Updating...';

  const { error } = await db
    .from('service_requests')
    .update({ final_total: finalTotal, notes, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
  await loadRequests();
}

async function saveReturnLocation(button) {
  const id = button.dataset.id;
  const panel = button.closest('.return-location-panel');
  const returnParkingLocation = panel.querySelector('.return-parking-location').value.trim();

  if (!returnParkingLocation) {
    alert('Enter the vehicle return location before saving.');
    return;
  }

  const { error } = await db
    .from('service_requests')
    .update({
      return_parking_location: returnParkingLocation,
      return_parking_spot: null,
      return_parking_map_url: null,
      status: 'return_location_recorded',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw error;
  await loadRequests();
}

async function saveInspection(button) {
  const id = button.dataset.id;
  const request = allRequests.find((item) => item.id === id);
  const panel = button.closest('.inspection-panel');
  const code = normalizeTroubleCode(panel.querySelector('.inspection-trouble-code').value);
  const codeDetails = troubleCodeDetails(code);
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

  const { error } = await db
    .from('service_requests')
    .update({ notes, status: 'inspection_recorded', updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
  await loadRequests();
}

async function completeRequest(button) {
  const id = button.dataset.id;
  const request = allRequests.find((item) => item.id === id);
  const panel = button.closest('.complete-panel');
  const confirmed = panel.querySelector('.confirm-complete-totals')?.checked;

  if (request.final_total == null) {
    alert('Save the final total before completing this request.');
    return;
  }

  if (!confirmed) {
    alert('Check the confirmation box after verifying the saved totals.');
    return;
  }

  if (request.quick_inspection && request.status !== 'inspection_recorded') {
    alert('Complete the quick inspection before completing this request.');
    return;
  }

  await updateRequestStatus(id, 'complete');
}

async function saveEdit(button) {
  const id = button.dataset.id;
  const panel = button.closest('.admin-edit-panel');
  const statusEl = panel.querySelector('.edit-save-status');

  const val = (cls) => panel.querySelector(cls)?.value?.trim() ?? '';
  const numVal = (cls) => { const v = val(cls); return v === '' ? null : Number(v); };

  const updates = {
    customer_name: val('.edit-customer-name') || null,
    customer_phone: val('.edit-customer-phone') || null,
    customer_email: val('.edit-customer-email') || null,
    address_street: val('.edit-address-street') || null,
    address_apt: val('.edit-address-apt') || null,
    address_city: val('.edit-address-city') || null,
    address_state: val('.edit-address-state') || null,
    address_zip: val('.edit-address-zip') || null,
    parking_location: val('.edit-parking-location') || null,
    parking_spot: val('.edit-parking-spot') || null,
    key_handoff_details: val('.edit-key-handoff') || null,
    vehicle_year: val('.edit-vehicle-year') || null,
    vehicle_make: val('.edit-vehicle-make') || null,
    vehicle_model: val('.edit-vehicle-model') || null,
    vehicle_color: val('.edit-vehicle-color') || null,
    license_plate: val('.edit-license-plate') || null,
    service_date: val('.edit-service-date') || null,
    desired_return_time: val('.edit-return-time') || null,
    fuel_type: val('.edit-fuel-type') || null,
    return_parking_location: val('.edit-return-location') || null,
    estimated_total: numVal('.edit-estimated-total'),
    final_total: numVal('.edit-final-total'),
    notes: val('.edit-notes') || null,
  };

  const { error } = await db.rpc('admin_update_request', {
    p_token: adminToken(),
    p_request_id: id,
    p_data: updates,
  });

  if (error) throw error;
  if (statusEl) { statusEl.textContent = 'Saved.'; setTimeout(() => { statusEl.textContent = ''; }, 2500); }
  await loadRequests();
}

function nextStatusForPhoto(photoType) {
  return {
    pickup_vehicle: 'pickup_vehicle_photo_uploaded',
    pickup_odometer: 'pickup_odometer_photo_uploaded',
    pickup_fuel_gauge: 'pickup_fuel_gauge_photo_uploaded',
    fuel_receipt: 'fuel_receipt_uploaded',
    wash_receipt: 'wash_receipt_uploaded',
    dropoff_vehicle: 'dropoff_vehicle_photo_uploaded',
    dropoff_odometer: 'dropoff_odometer_photo_uploaded',
    dropoff_fuel_gauge: 'dropoff_fuel_gauge_photo_uploaded',
  }[photoType] || 'accepted';
}

async function uploadPhoto(button) {
  const id = button.dataset.id;
  const request = allRequests.find((item) => item.id === id);
  const panel = button.closest('.photo-panel');
  const photoType = panel.querySelector('.photo-type').value;
  const fileInput = panel.querySelector('.photo-file');
  const file = fileInput.files[0];

  if (!file) {
    alert('Choose a photo first.');
    return;
  }

  if (photoType.startsWith('dropoff') && !request.return_parking_location) {
    alert('Record the vehicle return location before uploading drop-off photos.');
    return;
  }

  button.disabled = true;
  button.textContent = 'Uploading...';

  const extension = file.name.split('.').pop() || 'jpg';
  const path = `${id}/${Date.now()}-${photoType}.${extension}`;

  const { error: uploadError } = await db.storage.from(PHOTO_BUCKET).upload(path, file, { upsert: false });
  if (uploadError) throw uploadError;

  const { data: publicUrlData } = db.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  const imageUrl = publicUrlData?.publicUrl || path;

  const { error: insertError } = await db.from('photos').insert({
    service_request_id: id,
    photo_type: photoType,
    image_url: imageUrl,
    storage_bucket: PHOTO_BUCKET,
    storage_path: path,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });

  if (insertError) throw insertError;

  await updateRequestStatus(id, nextStatusForPhoto(photoType));
}

async function uploadPhotoSet(button) {
  const id = button.dataset.id;
  const request = allRequests.find((item) => item.id === id);
  const panel = button.closest('.photo-panel');
  const inputs = Array.from(panel.querySelectorAll('.required-photo'));
  const missing = inputs.filter((input) => !input.files[0]);
  const warning = panel.querySelector('.duplicate-photo-warning');
  const stage = panel.dataset.photoStage || 'pickup';

  if (missing.length > 0) {
    alert('Upload all four vehicle sides and the odometer before moving to the next step.');
    return;
  }

  if (selectedFilesHaveDuplicates(inputs)) {
    const message = 'It looks like the same photo was selected more than once. Please use a different photo for each side and the odometer.';
    if (warning) warning.textContent = message;
    alert(message);
    return;
  }

  button.disabled = true;
  button.textContent = 'Uploading...';

  for (const input of inputs) {
    await uploadPhotoFile(id, input.dataset.photoType, input.files[0]);
  }

  const timestamp = new Date().toISOString();
  const note = photoTimestampNote(stage, timestamp);
  const notes = request.notes ? `${request.notes}\n${note}` : note;
  const { error } = await db
    .from('service_requests')
    .update({ status: panel.dataset.nextStatus, notes, updated_at: timestamp })
    .eq('id', id);

  if (error) throw error;
  await loadRequests();
}

async function chargeCustomer(button) {
  const requestId = button.dataset.requestId;
  const request = allRequests.find(r => r.id === requestId);
  if (!request) return;

  if (request.final_total == null) {
    alert('Save the final total before charging the customer.');
    return;
  }

  const amountCents = Math.round(request.final_total * 100);
  const confirmed = confirm(`Charge customer ${money(request.final_total)}? This cannot be undone.`);
  if (!confirmed) return;

  button.disabled = true;
  button.textContent = 'Charging…';

  const res = await fetch('/api/capture-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payment_intent_id: request.payment_intent_id, amount_cents: amountCents }),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || 'Capture failed');

  await db.rpc('admin_update_request', {
    p_token: adminToken(),
    p_request_id: requestId,
    p_data: { payment_status: 'captured' },
  });

  await loadRequests();
}

requestList.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;

  try {
    if (button.classList.contains('inline-show-all')) {
      showAllTime = true;
      renderRequests();
      return;
    }

    if (button.classList.contains('update-status')) {
      await updateRequestStatus(button.dataset.id, button.dataset.status);
      return;
    }

    if (button.classList.contains('show-photo-panel')) {
      const panel = requestList.querySelector(`[data-panel-for="${button.dataset.id}"]`);
      panel.hidden = !panel.hidden;
      return;
    }

    if (button.classList.contains('show-receipt-panel')) {
      const panel = requestList.querySelector(`[data-receipt-for="${button.dataset.id}"]`);
      panel.hidden = !panel.hidden;
      return;
    }

    if (button.classList.contains('show-inspection-panel')) {
      const panel = requestList.querySelector(`[data-inspection-for="${button.dataset.id}"]`);
      panel.hidden = !panel.hidden;
      return;
    }

    if (button.classList.contains('show-return-location')) {
      const panel = requestList.querySelector(`[data-return-for="${button.dataset.id}"]`);
      panel.hidden = !panel.hidden;
      return;
    }

    if (button.classList.contains('edit-request')) {
      const panel = requestList.querySelector(`[data-edit-for="${button.dataset.id}"]`);
      panel.hidden = !panel.hidden;
      return;
    }

    if (button.classList.contains('save-final-total')) {
      await saveFinalTotal(button);
      return;
    }

    if (button.classList.contains('show-service-unable')) {
      const panel = requestList.querySelector(`[data-service-unable-for="${button.dataset.id}"]`);
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
        panel.querySelector('.service-unable-reason').value = '';
      }
      return;
    }

    if (button.classList.contains('save-service-unable')) {
      await saveServiceUnable(button);
      return;
    }

    if (button.classList.contains('show-deny-reason')) {
      const panel = requestList.querySelector(`[data-deny-for="${button.dataset.id}"]`);
      if (panel) {
        panel.hidden = false;
        panel.querySelector('.deny-reason')?.focus();
      }
      return;
    }

    if (button.classList.contains('cancel-deny-reason')) {
      const panel = button.closest('.deny-reason-panel');
      if (panel) {
        panel.hidden = true;
        panel.querySelector('.deny-reason').value = '';
      }
      return;
    }

    if (button.classList.contains('save-deny-reason')) {
      await saveDenyReason(button);
      return;
    }

    if (button.classList.contains('save-return-location')) {
      await saveReturnLocation(button);
      return;
    }

    if (button.classList.contains('save-inspection')) {
      await saveInspection(button);
      return;
    }

    if (button.classList.contains('save-edit')) {
      await saveEdit(button);
      return;
    }

    if (button.classList.contains('complete-request')) {
      await completeRequest(button);
      return;
    }

    if (button.classList.contains('show-total-edit')) {
      const request = allRequests.find((item) => item.id === button.dataset.id);
      const panel = requestList.querySelector(`[data-total-edit-for="${button.dataset.id}"]`);
      const checkbox = button.closest('.complete-panel')?.querySelector('.confirm-complete-totals');

      if (checkbox) {
        checkbox.checked = false;
      }

      panel.innerHTML = renderTotalEditForm(request, button.dataset.editTotal);
      panel.hidden = false;
      return;
    }

    if (button.classList.contains('save-total-edit')) {
      await saveTotalEdit(button);
      return;
    }

    if (button.classList.contains('upload-photo')) {
      await uploadPhoto(button);
      return;
    }

    if (button.classList.contains('upload-photo-set')) {
      await uploadPhotoSet(button);
      return;
    }

    if (button.classList.contains('charge-customer-btn')) {
      await chargeCustomer(button);
      return;
    }
  } catch (error) {
    console.error(error);
    alert('Something went wrong. Check the console for details.');
    button.disabled = false;
  }
});

requestList.addEventListener('change', (event) => {
  if (event.target.classList.contains('assign-worker-select')) {
    updateWorkerAssignment(event.target.dataset.id, event.target.value).catch((error) => {
      console.error('Worker assignment failed:', error);
      alert('Could not assign worker. Run supabase-operational-upgrades.sql so worker assignment columns exist.');
    });
    return;
  }

  if (event.target.matches('input[type="file"]')) {
    const control = event.target.closest('.file-button-control');
    const fileName = control?.querySelector('.selected-file-name');

    if (fileName) {
      fileName.textContent = event.target.files[0]?.name || 'No file chosen';
    }
  }

  if (!event.target.classList.contains('required-photo')) {
    return;
  }

  const panel = event.target.closest('.photo-panel');
  const inputs = Array.from(panel.querySelectorAll('.required-photo'));
  const warning = panel.querySelector('.duplicate-photo-warning');

  if (!warning) {
    return;
  }

  warning.textContent = selectedFilesHaveDuplicates(inputs)
    ? 'Warning: the same file appears to be selected more than once.'
    : '';
});

requestList.addEventListener('input', (event) => {
  if (!event.target.classList.contains('inspection-trouble-code')) {
    return;
  }

  const panel = event.target.closest('.inspection-panel');
  const output = panel?.querySelector('.trouble-code-output');
  const code = normalizeTroubleCode(event.target.value);
  const details = troubleCodeDetails(code);

  if (!output) {
    return;
  }

  output.innerHTML = code
    ? `
      <p><strong>${escapeHtml(code)}:</strong> ${escapeHtml(details.summary)}</p>
      <p><strong>Possible fixes:</strong> ${escapeHtml(details.fixes)}</p>
    `
    : '<p class="field-help">Type a code to preview what the customer will see.</p>';
});

showOpen?.addEventListener('click', () => {
  currentView = 'open';
  showAllTime = false;
  switchAdminTab('requests');
  renderRequests();
});
showComplete?.addEventListener('click', () => {
  currentView = 'complete';
  showAllTime = false;
  switchAdminTab('requests');
  renderRequests();
});
showDenied?.addEventListener('click', () => {
  currentView = 'closed';
  showAllTime = false;
  switchAdminTab('requests');
  renderRequests();
});
showReviews?.addEventListener('click', () => switchAdminTab('reviews'));
showApplicants?.addEventListener('click', () => switchAdminTab('applicants'));

showAllTimeBtn?.addEventListener('click', () => {
  showAllTime = true;
  if (showAllTimeBtn) showAllTimeBtn.style.display = 'none';
  renderRequests();
});

function switchPageTab(page) {
  currentPageTab = page;
  adminPageTabs.forEach((btn) => btn.classList.toggle('active', btn.dataset.page === page));
  document.querySelectorAll('[data-page-section]').forEach((el) => {
    el.hidden = el.dataset.pageSection !== page;
  });
}

function switchAdminTab(tab) {
  currentAdminTab = tab;
  // Only affect panels in the dashboard page
  document.querySelectorAll('[data-tab-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.tabPanel !== tab;
  });
  // Update summary card active state
  [showOpen, showComplete, showDenied].forEach((btn) => btn?.classList.remove('active'));
  showReviews?.classList.toggle('active', tab === 'reviews');
  showApplicants?.classList.toggle('active', tab === 'applicants');
}

adminPageTabs.forEach((btn) => {
  btn.addEventListener('click', () => switchPageTab(btn.dataset.page));
});

// Find Tickets modal
findTicketsBtn?.addEventListener('click', openFindTicketsModal);
closeFindTicketsBtn?.addEventListener('click', closeFindTicketsModal);
findTicketsModal?.addEventListener('click', (e) => { if (e.target === findTicketsModal) closeFindTicketsModal(); });

function openFindTicketsModal() {
  if (!findTicketsModal) return;
  findTicketsModal.hidden = false;
  document.body.style.overflow = 'hidden';
  if (findTicketsSearch) { findTicketsSearch.value = ''; findTicketsSearch.focus(); }
  if (findTicketsResults) findTicketsResults.innerHTML = '<p class="find-tickets-empty">Enter a name, phone number, or email to search.</p>';
  if (findTicketsSortBar) findTicketsSortBar.hidden = true;
  lastSearchResults = [];
}

function closeFindTicketsModal() {
  if (!findTicketsModal) return;
  findTicketsModal.hidden = true;
  document.body.style.overflow = '';
}

function normalizePhone(s) {
  return String(s || '').replace(/\D/g, '');
}

function fuzzyMatch(haystack, needle) {
  if (!haystack || !needle) return false;
  const h = String(haystack).toLowerCase();
  const n = needle.toLowerCase();
  // Exact substring
  if (h.includes(n)) return true;
  // Allow up to 1 character difference for strings longer than 4 chars
  if (n.length > 4) {
    for (let i = 0; i <= h.length - n.length + 1; i++) {
      let mismatches = 0;
      for (let j = 0; j < n.length; j++) {
        if (h[i + j] !== n[j]) mismatches++;
        if (mismatches > 1) break;
      }
      if (mismatches <= 1) return true;
    }
  }
  return false;
}

function ticketMatchesQuery(r, q) {
  const qDigits = normalizePhone(q);
  if (qDigits.length >= 7) {
    const phoneDigits = normalizePhone(r.customer_phone);
    if (phoneDigits.includes(qDigits) || qDigits.includes(phoneDigits.slice(-qDigits.length))) return true;
  }
  return fuzzyMatch(r.customer_name, q) || fuzzyMatch(r.customer_email, q);
}

function runFindTicketsSearch() {
  if (!findTicketsResults) return;
  const q = findTicketsSearch?.value?.trim() ?? '';
  if (!q) {
    findTicketsResults.innerHTML = '<p class="find-tickets-empty">Enter a name, phone number, or email to search.</p>';
    if (findTicketsSortBar) findTicketsSortBar.hidden = true;
    return;
  }
  const results = allRequests.filter((r) => ticketMatchesQuery(r, q));
  lastSearchResults = results;
  const sortOrder = findTicketsSortSelect?.value || 'newest';
  renderSearchResults(results, sortOrder);
}

function renderSearchResults(results, sortOrder = 'newest') {
  if (!findTicketsResults) return;

  const sorted = [...results].sort((a, b) => {
    const da = a.service_date || a.created_at || '';
    const db = b.service_date || b.created_at || '';
    return sortOrder === 'newest' ? db.localeCompare(da) : da.localeCompare(db);
  });

  if (findTicketsSortBar) findTicketsSortBar.hidden = false;
  if (findTicketsResultCount) {
    findTicketsResultCount.textContent = sorted.length === 1 ? '1 result' : `${sorted.length} results`;
  }

  if (!sorted.length) {
    findTicketsResults.innerHTML = '<p class="find-tickets-empty">No matching tickets found.</p>';
    return;
  }

  findTicketsResults.innerHTML = sorted.map((r) => `
    <button class="find-ticket-result" data-request-id="${escapeHtml(r.id)}">
      <div class="find-ticket-result-header">
        <span class="find-ticket-name">${escapeHtml(r.customer_name || 'Customer')}</span>
        <span class="status-pill">${escapeHtml(statusLabels[r.status] || r.status)}</span>
      </div>
      <span class="find-ticket-meta">${escapeHtml(r.customer_phone || 'No phone')} &middot; ${escapeHtml(r.customer_email || 'No email')}</span>
      <span class="find-ticket-meta">
        ${escapeHtml(r.service_date || 'Date not set')}
        ${r.vehicle_year || r.vehicle_make || r.vehicle_model
          ? ' &middot; ' + escapeHtml([r.vehicle_year, r.vehicle_make, r.vehicle_model].filter(Boolean).join(' '))
          : ''}
      </span>
    </button>
  `).join('');
}

// Trigger search on Enter key
findTicketsSearch?.addEventListener('keydown', (e) => { if (e.key === 'Enter') runFindTicketsSearch(); });
findTicketsGoBtn?.addEventListener('click', runFindTicketsSearch);
findTicketsSortSelect?.addEventListener('change', () => {
  renderSearchResults(lastSearchResults, findTicketsSortSelect.value);
});

findTicketsResults?.addEventListener('click', (e) => {
  const btn = e.target.closest('.find-ticket-result');
  if (!btn) return;
  const requestId = btn.dataset.requestId;
  const request = allRequests.find((r) => r.id === requestId);
  if (!request) return;
  closeFindTicketsModal();
  openTicketDetailModal(request);
});

closeTicketDetailBtn?.addEventListener('click', closeTicketDetailModal);
ticketDetailModal?.addEventListener('click', (e) => { if (e.target === ticketDetailModal) closeTicketDetailModal(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!ticketDetailModal?.hidden) closeTicketDetailModal();
    else if (!findTicketsModal?.hidden) closeFindTicketsModal();
  }
});

function closeTicketDetailModal() {
  if (!ticketDetailModal) return;
  ticketDetailModal.hidden = true;
  document.body.style.overflow = '';
}

async function openTicketDetailModal(request) {
  if (!ticketDetailModal || !ticketDetailBody) return;
  const title = document.querySelector('#ticket-detail-title');
  if (title) title.textContent = `${request.customer_name || 'Ticket'} — ${escapeHtml(request.service_date || request.id.slice(0, 8))}`;
  ticketDetailBody.innerHTML = '<p class="field-help">Loading...</p>';
  ticketDetailModal.hidden = false;
  document.body.style.overflow = 'hidden';

  const photos = await loadTicketPhotos(request.id);
  const photosHtml = photos.length
    ? `<div class="ticket-detail-section">
        <p class="edit-section-label">Photos (${photos.length})</p>
        <div class="ticket-photos-grid">
          ${photos.map((p) => {
            const thumb = p.thumbnail_url || p.image_url;
            const full = p.original_url || p.image_url;
            const label = (p.photo_type || '').replace(/_/g, ' ');
            return `<div class="photo-proof-card photo-proof-loaded" role="button" tabindex="0"
              data-lightbox-src="${escapeHtml(full)}" data-lightbox-label="${escapeHtml(label)}">
              <img src="${escapeHtml(thumb)}" alt="${escapeHtml(label)}" loading="lazy">
              <span>${escapeHtml(label)}</span>
            </div>`;
          }).join('')}
        </div>
      </div>`
    : '<p class="field-help" style="margin-top:12px">No photos attached to this ticket.</p>';

  ticketDetailBody.innerHTML = `
    <div class="request-card-header" style="margin-bottom:6px">
      <div>
        <p class="eyebrow">${escapeHtml(request.id)}</p>
        <h3 style="margin:0">${escapeHtml(request.customer_name || 'Customer')}</h3>
      </div>
      <span class="status-pill">${escapeHtml(statusLabels[request.status] || request.status)}</span>
    </div>
    ${requestCardDetails(request)}
    ${photosHtml}
    <div class="ticket-detail-edit-section" style="margin-top:18px">
      <div class="admin-button-row">
        <button class="button secondary toggle-ticket-edit" type="button">Edit request</button>
        <button class="button secondary close-ticket-detail-inner" type="button">Close</button>
      </div>
      <div class="ticket-inline-edit" hidden>
        ${renderEditPanel(request)}
      </div>
    </div>
  `;
  // Show the inner edit panel (without extra hidden wrapper)
  const innerEdit = ticketDetailBody.querySelector('.ticket-inline-edit .admin-edit-panel');
  if (innerEdit) innerEdit.hidden = false;
}

async function loadTicketPhotos(requestId) {
  const { data, error } = await db
    .from('photos')
    .select('photo_type,image_url,thumbnail_url,original_url,created_at')
    .eq('service_request_id', requestId)
    .order('created_at', { ascending: true });
  if (error) { console.warn('Could not load ticket photos:', error); return []; }
  return data || [];
}

ticketDetailBody?.addEventListener('click', async (e) => {
  const button = e.target.closest('button');
  if (!button) return;

  if (button.classList.contains('close-ticket-detail-inner')) {
    closeTicketDetailModal();
    return;
  }

  if (button.classList.contains('toggle-ticket-edit')) {
    const editSection = ticketDetailBody.querySelector('.ticket-inline-edit');
    if (editSection) {
      editSection.hidden = !editSection.hidden;
      button.textContent = editSection.hidden ? 'Edit request' : 'Hide edit form';
    }
    return;
  }

  if (button.classList.contains('save-edit')) {
    button.disabled = true;
    try {
      await saveEdit(button);
      // Refresh the detail view with updated request
      const id = button.dataset.id;
      const updated = allRequests.find((r) => r.id === id);
      if (updated) await openTicketDetailModal(updated);
    } catch (err) {
      console.error('Edit save failed:', err);
      const statusEl = button.closest('.admin-edit-panel')?.querySelector('.edit-save-status');
      if (statusEl) statusEl.textContent = `Save failed: ${err.message || 'Check console'}`;
    } finally {
      button.disabled = false;
    }
    return;
  }

  if (button.classList.contains('update-status')) {
    button.disabled = true;
    try {
      await updateRequestStatus(button.dataset.id, button.dataset.status);
      const updated = allRequests.find((r) => r.id === button.dataset.id);
      if (updated) await openTicketDetailModal(updated);
    } catch (err) {
      console.error('Status update failed:', err);
    } finally {
      button.disabled = false;
    }
    return;
  }
});

// Star filter for reviews
starFilterButtons?.addEventListener('click', (e) => {
  const btn = e.target.closest('.star-filter-btn');
  if (!btn) return;
  currentReviewFilter = btn.dataset.stars === '' ? null : Number(btn.dataset.stars);
  renderReviews(allReviews, allReviewRequestMap, currentReviewFilter);
});

function daysOffFromText(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
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

function renderWorkerDaysGrid(workdays = []) {
  if (!workerDaysGrid) return;

  const workdayMap = new Map(
    workdays.map((day) => [Number(day.dayOfWeek), day])
  );

  workerDaysGrid.innerHTML = workerDayOptions
    .map(({ dayOfWeek, label }) => {
      const savedDay = workdayMap.get(dayOfWeek);
      const enabled = savedDay ? 'checked' : '';
      const startsAt = savedDay?.startsAt || '07:00';
      const endsAt = savedDay?.endsAt || '22:00';

      return `
        <div class="worker-day-row" data-day-of-week="${dayOfWeek}">
          <label class="checkbox-label worker-day-toggle">
            <input class="worker-day-enabled" type="checkbox" data-day-of-week="${dayOfWeek}" ${enabled}>
            <span>${label}</span>
          </label>
          <label>Start
            <input class="worker-day-start" type="time" data-day-of-week="${dayOfWeek}" value="${startsAt}">
          </label>
          <label>End
            <input class="worker-day-end" type="time" data-day-of-week="${dayOfWeek}" value="${endsAt}">
          </label>
          <div class="worker-day-copy-actions">
            <button class="button worker-copy-day" type="button" data-day-of-week="${dayOfWeek}">Copy</button>
            <button class="button worker-paste-day" type="button" data-day-of-week="${dayOfWeek}" ${copiedWorkerDaySchedule ? '' : 'disabled'}>Paste</button>
          </div>
        </div>
      `;
    })
    .join('');
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

function normalizeSavedWorkdays(savedSchedule) {
  if (Array.isArray(savedSchedule?.workdays) && savedSchedule.workdays.length) {
    return savedSchedule.workdays.map((day) => ({
      dayOfWeek: Number(day.dayOfWeek),
      startsAt: day.startsAt || '07:00',
      endsAt: day.endsAt || '22:00',
    }));
  }

  const startsAt = savedSchedule?.startsAt || '07:00';
  const endsAt = savedSchedule?.endsAt || '22:00';

  return workerDayOptions.map(({ dayOfWeek }) => ({
    dayOfWeek,
    startsAt,
    endsAt,
  }));
}

function selectedWorkdaysFromForm() {
  if (!workerDaysGrid) return [];

  return Array.from(workerDaysGrid.querySelectorAll('.worker-day-enabled:checked'))
    .map((checkbox) => {
      const dayOfWeek = Number(checkbox.dataset.dayOfWeek);
      const row = workerDaysGrid.querySelector(`.worker-day-row[data-day-of-week="${dayOfWeek}"]`);

      return {
        dayOfWeek,
        startsAt: row?.querySelector('.worker-day-start')?.value || '07:00',
        endsAt: row?.querySelector('.worker-day-end')?.value || '22:00',
      };
    })
    .filter((day) => day.startsAt && day.endsAt);
}

function selectedDaysOffFromSchedule(savedSchedule) {
  if (Array.isArray(savedSchedule?.daysOff)) {
    return savedSchedule.daysOff;
  }

  return daysOffFromText(savedSchedule?.daysOff);
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

  const months = Array.from({ length: monthCount }, (_, index) => {
    const monthDate = new Date(startMonth.getFullYear(), startMonth.getMonth() + index, 1);
    const firstDayOffset = monthDate.getDay();
    const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
    const blankDays = Array.from({ length: firstDayOffset }, () => '<span class="calendar-empty"></span>').join('');
    const dayButtons = Array.from({ length: daysInMonth }, (_, dayIndex) => {
      const dayDate = new Date(monthDate.getFullYear(), monthDate.getMonth(), dayIndex + 1);
      const value = localDateValue(dayDate);
      const isPast = dayDate < today;
      const isOutsideWindow = dayDate > lastBookableDate;
      const isDayOff = selectedWorkerDaysOff.has(value);
      const classes = ['calendar-day'];

      if (isDayOff) classes.push('day-off');

      return `
        <button
          type="button"
          class="${classes.join(' ')}"
          data-day-off="${value}"
          ${isPast || isOutsideWindow ? 'disabled' : ''}
        >${dayIndex + 1}</button>
      `;
    }).join('');

    return `
      <section class="worker-calendar-month">
        <h4>${monthLabel(monthDate)}</h4>
        <div class="calendar-weekdays">
          <span>Sun</span>
          <span>Mon</span>
          <span>Tue</span>
          <span>Wed</span>
          <span>Thu</span>
          <span>Fri</span>
          <span>Sat</span>
        </div>
        <div class="calendar-days">${blankDays}${dayButtons}</div>
      </section>
    `;
  }).join('');

  workerDaysOffCalendar.innerHTML = months;
  updateWorkerDaysOffSummary();
}

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

workerDaysGrid?.addEventListener('click', (event) => {
  const copyButton = event.target.closest('.worker-copy-day');
  const pasteButton = event.target.closest('.worker-paste-day');

  if (!copyButton && !pasteButton) return;

  const button = copyButton || pasteButton;
  const row = button.closest('.worker-day-row');
  if (!row) return;

  const checkbox = row.querySelector('.worker-day-enabled');
  const startInput = row.querySelector('.worker-day-start');
  const endInput = row.querySelector('.worker-day-end');

  if (copyButton) {
    copiedWorkerDaySchedule = {
      startsAt: startInput?.value || '07:00',
      endsAt: endInput?.value || '22:00',
      enabled: Boolean(checkbox?.checked),
    };

    refreshWorkerPasteButtons();
    setWorkerCopyMode('paste');

    if (workerScheduleStatus) {
      workerScheduleStatus.textContent = `Copied ${copiedWorkerDaySchedule.startsAt} to ${copiedWorkerDaySchedule.endsAt}.`;
    }
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

    if (workerScheduleStatus) {
      workerScheduleStatus.textContent = `Pasted ${pastedSchedule.startsAt} to ${pastedSchedule.endsAt}. Copy another day to paste again.`;
    }
  }
});

function setWorkerPanel(panel, isOpen) {
  if (!panel) return;
  panel.hidden = !isOpen;
}

function baseWorkerSchedule() {
  const employee = allEmployees.find((item) => item.id === selectedScheduleEmployeeId);

  return {
    employeeId: selectedScheduleEmployeeId,
    workerName: employee?.full_name || DEFAULT_WORKER_NAME,
    workerLocation: document.querySelector('#worker-location')?.value.trim() || employee?.home_location || DEFAULT_WORK_LOCATION,
    workdays: selectedWorkdaysFromForm(),
    daysOff: Array.from(selectedWorkerDaysOff).sort(),
    savedAt: new Date().toISOString(),
  };
}

function buildWorkerSchedule(updates) {
  return {
    ...baseWorkerSchedule(),
    ...updates,
    savedAt: new Date().toISOString(),
  };
}

function persistLocalWorkerSchedule(schedule) {
  localStorage.setItem('shiftfuel_worker_schedule', JSON.stringify(schedule));
}

function validateWorkerBase(schedule) {
  if (!schedule.employeeId || !schedule.workerName || !schedule.workerLocation) {
    if (workerScheduleStatus) {
      workerScheduleStatus.textContent = 'Choose a worker and work location before saving.';
    }
    return false;
  }

  if (String(schedule.employeeId).startsWith('local-')) {
    if (workerScheduleStatus) {
      workerScheduleStatus.textContent = 'Run supabase-operational-upgrades.sql before saving worker availability.';
    }
    return false;
  }

  return true;
}

async function upsertWorker(schedule) {
  const { data: existing, error: existingError } = await db
    .from('employees')
    .select('id')
    .eq('full_name', schedule.workerName)
    .limit(1);

  if (existingError) throw existingError;

  if (existing?.length) {
    const employeeId = existing[0].id;
    const { error } = await db.rpc('admin_update_employee', {
      p_token: adminToken(),
      p_employee_id: employeeId,
      p_data: { active: true, home_location: schedule.workerLocation },
    });
    if (error) throw error;
    return employeeId;
  } else {
    const codePrefix = schedule.workerName.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'WORKER';
    const { data, error } = await db.rpc('admin_insert_employee', {
      p_token: adminToken(),
      p_data: {
        employee_code: `EMP-${codePrefix}`,
        full_name: schedule.workerName,
        active: true,
        home_location: schedule.workerLocation,
      },
    });
    if (error) throw error;
    return (data || [])[0]?.id;
  }
}

async function saveWorkerAvailabilityToSupabase(schedule) {
  const employeeId = schedule.employeeId || await upsertWorker(schedule);

  const { error } = await db.rpc('admin_save_availability', {
    p_token: adminToken(),
    p_employee_id: employeeId,
    p_workdays: schedule.workdays.map((day) => ({
      day_of_week: day.dayOfWeek,
      starts_at: day.startsAt,
      ends_at: day.endsAt,
    })),
    p_location: schedule.workerLocation,
  });
  if (error) throw error;

  allEmployees = allEmployees.map((e) => e.id === employeeId
    ? { ...e, home_location: schedule.workerLocation }
    : e);
  renderWorkerSelect();
  renderWorkerProfiles();
}

async function saveWorkerDaysOffToSupabase(schedule) {
  const employeeId = schedule.employeeId || await upsertWorker(schedule);

  const { error } = await db.rpc('admin_save_days_off', {
    p_token: adminToken(),
    p_employee_id: employeeId,
    p_days_off: schedule.daysOff,
  });
  if (error) throw error;
}

openWorkdaysPanel?.addEventListener('click', () => {
  setWorkerPanel(workdaysPanel, true);
  setWorkerPanel(daysOffPanel, false);
});

closeWorkdaysPanel?.addEventListener('click', () => {
  setWorkerPanel(workdaysPanel, false);
});

openDaysOffPanel?.addEventListener('click', () => {
  setWorkerPanel(daysOffPanel, true);
  setWorkerPanel(workdaysPanel, false);
});

closeDaysOffPanel?.addEventListener('click', () => {
  setWorkerPanel(daysOffPanel, false);
});

workerScheduleForm?.addEventListener('submit', (event) => {
  event.preventDefault();
});

saveWorkdaysButton?.addEventListener('click', async () => {
  const schedule = buildWorkerSchedule({
    workdays: selectedWorkdaysFromForm(),
  });

  if (!validateWorkerBase(schedule) || !schedule.workdays.length) {
    if (workerScheduleStatus) {
      workerScheduleStatus.textContent = 'Choose a worker, location, and at least one workday before saving.';
    }
    return;
  }

  persistLocalWorkerSchedule(schedule);

  try {
    await saveWorkerAvailabilityToSupabase(schedule);

    if (workerScheduleStatus) {
      workerScheduleStatus.textContent = 'Work days and shift times saved.';
    }
  } catch (error) {
    console.warn('Worker availability Supabase save skipped:', error);

    if (workerScheduleStatus) {
      workerScheduleStatus.textContent = 'Work days saved locally. Run supabase-operational-upgrades.sql so customer availability updates from Supabase.';
    }
  }
});

saveDaysOffButton?.addEventListener('click', async () => {
  const schedule = buildWorkerSchedule({
    daysOff: Array.from(selectedWorkerDaysOff).sort(),
  });

  if (!validateWorkerBase(schedule)) return;

  persistLocalWorkerSchedule(schedule);

  try {
    await saveWorkerDaysOffToSupabase(schedule);

    if (workerScheduleStatus) {
      workerScheduleStatus.textContent = 'Days off saved and marked unbookable.';
    }
  } catch (error) {
    console.warn('Worker days off Supabase save skipped:', error);

    if (workerScheduleStatus) {
      workerScheduleStatus.textContent = 'Days off saved locally. Run supabase-operational-upgrades.sql so customer availability updates from Supabase.';
    }
  }
});

renderWorkerDaysGrid(workerDayOptions.map(({ dayOfWeek }) => ({
  dayOfWeek,
  startsAt: '07:00',
  endsAt: '22:00',
})));
renderWorkerDaysOffCalendar();

window.ShiftFuelPhoto?.initPhotoModal();
loadVehiclePsiGuides().finally(() => {
  loadEmployees().then(loadRequests);
});
loadReviews();
loadApplicants();
