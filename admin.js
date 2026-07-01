const db = window.ShiftFuelSupabase;

const requestList = document.querySelector('#request-list');
const allRequestsCountEl = document.querySelector('#all-requests-count');
const openRequests = document.querySelector('#open-requests');
const inProgressRequestsCountEl = document.querySelector('#inprogress-requests');
const completeRequests = document.querySelector('#complete-requests');
const deniedRequests = document.querySelector('#denied-requests');
const totalReviewsEl = document.querySelector('#total-reviews');
const totalApplicantsEl = document.querySelector('#total-applicants');
const showAll = document.querySelector('#show-all');
const showOpen = document.querySelector('#show-open');
const showInProgress = document.querySelector('#show-inprogress');
const showComplete = document.querySelector('#show-complete');
const showDenied = document.querySelector('#show-denied');
const showReviews = document.querySelector('#show-reviews');
const showApplicants = document.querySelector('#show-applicants');
const heroFindTicketsBtn = document.querySelector('#hero-find-tickets-btn');
const heroAvgRatingBtn = document.querySelector('#hero-avg-rating-btn');
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
const statOpenRequests = document.querySelector('#stat-open-requests');
const statInProgress = document.querySelector('#stat-in-progress');
const statCompletedToday = document.querySelector('#stat-completed-today');
const statCompletedLabel = document.querySelector('#stat-completed-label');
const statActiveWorkers = document.querySelector('#stat-active-workers');
const statNetRevenue = document.querySelector('#stat-net-revenue');
const statRevenueLabel = document.querySelector('#stat-revenue-label');
const dashboardRangeSelect = document.querySelector('#dashboard-range');
const dashboardFiltersBtn = document.querySelector('#dashboard-filters-btn');
const dashboardFiltersPanel = document.querySelector('#dashboard-filters-panel');
const filterSearchInput = document.querySelector('#filter-search');
const filterServiceTypeSelect = document.querySelector('#filter-service-type');
const filterStatusSelect = document.querySelector('#filter-status');
const filterWorkerSelect = document.querySelector('#filter-worker');
const filterPaymentSelect = document.querySelector('#filter-payment');
const filterSortSelect = document.querySelector('#filter-sort');
const filterClearBtn = document.querySelector('#filter-clear-btn');
const workerSnapshotOnline = document.querySelector('#worker-snapshot-online');
const workerSnapshotOnBreak = document.querySelector('#worker-snapshot-onbreak');
const workerSnapshotBusy = document.querySelector('#worker-snapshot-busy');
const workerSnapshotOffline = document.querySelector('#worker-snapshot-offline');
const adminSideRefreshBtn = document.querySelector('#admin-side-refresh-btn');
const findTicketsGoBtn = document.querySelector('#find-tickets-go');
const findTicketsSortBar = document.querySelector('#find-tickets-sort-bar');
const findTicketsSortSelect = document.querySelector('#find-tickets-sort');
const findTicketsResultCount = document.querySelector('#find-tickets-result-count');
const workerScheduleForm = document.querySelector('#worker-schedule-form');
const workerScheduleStatus = document.querySelector('#worker-schedule-status');
const workerSelect = document.querySelector('#worker-select');
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
const reviewList = document.querySelector('#reviews-list');
const applicantList = document.querySelector('#applicants-list');
const workerProfileList = document.querySelector('#admin-worker-profile-list');
const adminRefreshBtn = document.querySelector('#admin-refresh-btn');
const adminReviewsRefreshBtn = document.querySelector('#admin-reviews-refresh-btn');

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
// Per-employee weekly availability for the inline Workers-tab editor, keyed by
// employee id. Populated when a worker row is expanded; the admin schedule grid
// is rendered straight from it (the old #worker-days-grid form lives only in the
// worker portal, so admin needs its own card-scoped copy).
let adminCardAvailability = {};
// Count of pending worker change requests, surfaced in "Needs your attention".
let pendingChangeRequestCount = 0;
// Last-loaded admin change requests, so the approve handler can read a request's
// kind/date for auto-applying a day off.
let adminChangeRequestsList = [];
let currentView = 'open';
let currentAdminTab = 'requests';
let currentPageTab = 'dashboard';
let currentReviewFilter = null;
let showAllTime = false;
let lastSearchResults = [];
let vehiclePsiGuides = [];
let expandedRequestId = null;
let expandedSummaryId = null;
let dashboardRange = 'today';
let customRange = { start: '', end: '' };
let queueFilters = { search: '', serviceType: '', status: '', worker: '', payment: '', sort: 'newest' };
const BOOKING_STATUSES = [
  'new',
  'assigned',
  'en_route',
  'in_service',
  'returning',
  'completed',
  'cancelled',
];

function canonicalBookingStatus(status) {
  const value = String(status || 'new').toLowerCase();
  if (BOOKING_STATUSES.includes(value)) return value;
  if (['pending', 'request_received', 'pending_customer_info'].includes(value)) return 'new';
  if (['accepted', 'key_received'].includes(value)) return 'assigned';
  if (['vehicle_picked_up', 'pickup_vehicle_photo_uploaded', 'pickup_odometer_photo_uploaded', 'pickup_fuel_gauge_photo_uploaded'].includes(value)) return 'en_route';
  if ([
    'in_progress',
    'service_in_progress',
    'fueling_in_progress',
    'car_wash_in_progress',
    'car_wash_after_fuel_in_progress',
    'fueling_after_wash_in_progress',
    'partial_service_complete',
    'fueling_complete',
    'car_wash_complete',
    'fuel_receipt_uploaded',
    'wash_receipt_uploaded',
    'fuel_receipt_after_wash_uploaded',
    'wash_receipt_after_fuel_uploaded',
    'fuel_and_wash_complete',
    'service_complete',
    'receipts_recorded',
    'inspection_needed',
    'inspection_recorded',
    'payment_issue',
    'authorization_too_low',
    'pending_customer_payment',
  ].includes(value)) return 'in_service';
  if ([
    'returned_location_pending',
    'return_location_recorded',
    'return_photos_needed',
    'dropoff_vehicle_photo_uploaded',
    'dropoff_odometer_photo_uploaded',
    'dropoff_fuel_gauge_photo_uploaded',
    'vehicle_returned',
    'final_payment_processed',
    'awaiting_key_return',
    'return_requested',
    'customer_return_requested',
  ].includes(value)) return 'returning';
  if (['complete', 'keys_returned', 'finalized'].includes(value)) return 'completed';
  if ([
    'denied',
    'customer_canceled',
    'canceled',
    'cancelled_pending_key_return',
    'unable_to_complete',
    'auto_reversed',
    'closed_no_charge',
    'canceled_return_completed',
  ].includes(value)) return 'cancelled';
  return 'new';
}

const OPEN_REQUEST_STATUSES = ['new', 'assigned'];
const IN_PROGRESS_REQUEST_STATUSES = ['en_route', 'in_service', 'returning'];

function adminAuthToken() {
  return sessionStorage.getItem('shiftfuel_admin_token');
}

function adminSignOut() {
  sessionStorage.removeItem('shiftfuel_admin_token');
  sessionStorage.removeItem('shiftfuel_admin_name');
  window.location.href = '/admin/login';
}
document.querySelector('#admin-signout-btn')?.addEventListener('click', adminSignOut);
document.querySelector('#admin-settings-logout-btn')?.addEventListener('click', adminSignOut);

(function initAdminIdentity() {
  const raw = sessionStorage.getItem('shiftfuel_admin_name') || '';
  const displayName = raw
    ? raw.charAt(0).toUpperCase() + raw.slice(1)
    : 'Admin';
  const initials = raw
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase())
    .filter(Boolean)
    .join('')
    .slice(0, 2) || 'A';

  const h = new Date().getHours();
  const greeting = h < 12 ? 'Good morning,' : h < 17 ? 'Good afternoon,' : 'Good evening,';

  const greetingEl = document.querySelector('#admin-greeting');
  const nameEl = document.querySelector('#admin-portal-name');
  const avatarEl = document.querySelector('#admin-avatar-initials');
  const headerNameEl = document.querySelector('#admin-header-name');

  if (greetingEl) greetingEl.textContent = greeting;
  // The hero title stays "Admin Dashboard" (set in HTML); the admin's own name
  // lives in the top-bar (#admin-header-name) + avatar, not the page title.
  if (nameEl && !nameEl.dataset.staticTitle) { /* intentionally left as the static title */ }
  if (avatarEl) avatarEl.textContent = initials;
  if (headerNameEl) headerNameEl.textContent = displayName;
  const menuInitialsEl = document.querySelector('#admin-menu-initials');
  const menuNameEl = document.querySelector('#admin-menu-name');
  if (menuInitialsEl) menuInitialsEl.textContent = initials;
  if (menuNameEl) menuNameEl.textContent = displayName || 'Admin';
})();

// Service date helpers — used by booking form and admin create-request form.
function localDateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function maxDateString() {
  const d = new Date();
  d.setMonth(d.getMonth() + 3);
  return localDateString(d);
}

let CR_WASH_PACKAGES = [
  { value: 'buff-shine', label: 'Buff & Shine', price: 27 },
  { value: 'shine-protect', label: 'Shine & Protect', price: 20 },
  { value: 'shine', label: 'Shine', price: 16 },
  { value: 'double-wash', label: 'Double Wash', price: 12 },
];
const CR_FUEL_ESTIMATE_RANGES = [
  { value: '5', gallons: 5 },
  { value: '10', gallons: 10 },
  { value: '15', gallons: 15 },
  { value: '20', gallons: 20 },
  { value: '25', gallons: 25 },
  { value: '30', gallons: 30 },
];
const CR_AVG_FUEL_PRICES = { Regular: 3.792, 'Mid-grade': 4.411, Premium: 4.701, Diesel: 4.967 };
let CR_FEES = { fuelConvenience: 15, washConvenience: 15, quickInspection: 5 };
const slotHoldingStatuses = new Set([
  'assigned',
  'en_route',
  'in_service',
  'returning',
]);

function crNormalizeTimeSlot(value) {
  return String(value || '').slice(0, 5);
}

function crMinutesFromSlot(value) {
  const [hour, minute] = crNormalizeTimeSlot(value).split(':').map(Number);
  return (hour || 0) * 60 + (minute || 0);
}

function crFormatTimeLabel(value) {
  const [hourText, minute] = crNormalizeTimeSlot(value).split(':');
  const hour = Number(hourText);
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute || '00'} ${period}`;
}

function crTimeSlots(startHour, endHour) {
  const slots = [];
  for (let hour = startHour; hour <= endHour; hour += 1) {
    for (const minute of ['00', '30']) {
      if (hour === endHour && minute === '30') continue;
      slots.push(`${String(hour).padStart(2, '0')}:${minute}`);
    }
  }
  return slots;
}

function crFutureSlotsForDate(slots, dateValue) {
  if (dateValue !== localDateString(new Date())) return slots;
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return slots.filter((slot) => crMinutesFromSlot(slot) > nowMinutes);
}

function crServiceNeedsWash() {
  const value = document.getElementById('cr-service-type')?.value || '';
  return value === 'car-wash' || value === 'car-wash-fuel';
}

function crServiceNeedsFuel() {
  const value = document.getElementById('cr-service-type')?.value || '';
  return value === 'fuel' || value === 'car-wash-fuel';
}

function crIsMissingRpcError(error) {
  const message = String(error?.message || '').toLowerCase();
  return ['PGRST202', 'PGRST204', '42883'].includes(error?.code)
    || message.includes('could not find the function')
    || (message.includes('function') && message.includes('does not exist'));
}

async function crLoadWorkerAvailabilitySlots(dateValue) {
  if (!dateValue || !db) return null;
  const { data, error } = await db.rpc('public_worker_availability_slots', {
    p_service_date: dateValue,
    p_hospital: '',
  });
  if (!error) {
    return (data || []).map((row) => crNormalizeTimeSlot(row.slot)).filter(Boolean);
  }
  if (!crIsMissingRpcError(error)) {
    console.warn('Admin create request worker availability lookup blocked:', error);
    return [];
  }
  console.warn('Worker availability RPC unavailable for admin create request:', error);
  return null;
}

function crFillReturnSelect(select, slots, bookedSlots, placeholder) {
  const currentValue = select.value;
  select.innerHTML = '';
  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = placeholder;
  select.append(blank);

  slots.forEach((slot) => {
    const option = document.createElement('option');
    option.value = slot;
    option.textContent = crFormatTimeLabel(slot);
    if (bookedSlots.has(slot)) {
      option.disabled = true;
      option.textContent += ' - booked';
    }
    select.append(option);
  });

  if (slots.includes(currentValue) && !bookedSlots.has(currentValue)) {
    select.value = currentValue;
  }
}

async function refreshAdminCreateReturnTimes() {
  const dateValue = document.getElementById('cr-service-date')?.value || '';
  const timeSelect = document.getElementById('cr-return-time');
  const help = document.getElementById('cr-time-help');
  if (!timeSelect) return;

  if (!dateValue) {
    timeSelect.innerHTML = '<option value="">Select a date first</option>';
    if (help) help.textContent = 'Choose a service date to load available return times.';
    return;
  }

  const needsWash = crServiceNeedsWash();
  let slots = crFutureSlotsForDate(crTimeSlots(needsWash ? 9 : 7, needsWash ? 18 : 22), dateValue);
  const availabilitySlots = await crLoadWorkerAvailabilitySlots(dateValue);
  if (Array.isArray(availabilitySlots)) {
    slots = slots.filter((slot) => availabilitySlots.includes(slot));
  }

  let bookedSlots = new Set();
  try {
    const { data, error } = await db.rpc('public_booked_return_slots', { p_service_date: dateValue });
    if (error) throw error;
    bookedSlots = new Set((data || [])
      .filter((row) => slotHoldingStatuses.has(canonicalBookingStatus(row.status)))
      .map((row) => crNormalizeTimeSlot(row.desired_return_time))
      .filter(Boolean));
  } catch (error) {
    console.warn('Admin create request booked slot lookup failed:', error);
  }

  const placeholder = needsWash
    ? (slots.length ? 'Select car wash return time' : 'No car wash times left today')
    : (slots.length ? 'Select return time' : 'No return times left today');
  crFillReturnSelect(timeSelect, slots, bookedSlots, placeholder);
  if (help) {
    const availabilitySuffix = Array.isArray(availabilitySlots) && availabilitySlots.length === 0
      ? ' No worker availability is saved for this date.'
      : '';
    help.textContent = needsWash
      ? (slots.length ? `Car wash service selected. Return times are limited to 9:00 AM through 6:00 PM.${availabilitySuffix}` : `No more car wash return times are available today. Choose tomorrow or another future date.${availabilitySuffix}`)
      : (slots.length ? `Choose the time you want the vehicle returned.${availabilitySuffix}` : `No more return times are available today. Choose tomorrow or another future date.${availabilitySuffix}`);
  }
}

function updateAdminCreateServiceControls() {
  const needsFuel = crServiceNeedsFuel();
  const needsWash = crServiceNeedsWash();

  const fuelFields = document.getElementById('cr-fuel-fields');
  const washFields = document.getElementById('cr-wash-fields');

  if (fuelFields) {
    fuelFields.classList.toggle('cr-hidden', !needsFuel);
    fuelFields.querySelectorAll('select,input').forEach((el) => {
      el.disabled = !needsFuel;
      if (!needsFuel) el.value = '';
    });
  }

  if (washFields) {
    washFields.classList.toggle('cr-hidden', !needsWash);
    washFields.querySelectorAll('select,input').forEach((el) => {
      el.disabled = !needsWash;
      if (!needsWash) el.value = '';
    });
  }

  refreshAdminCreateReturnTimes();
}

function initServiceDateInput() {
  const host = document.getElementById('cr-service-date-picker');
  if (!host || !window.ShiftFuelDatePicker) return;
  ShiftFuelDatePicker.attach(host, { min: localDateString(new Date()), max: maxDateString(), onChange: refreshAdminCreateReturnTimes });
}

initServiceDateInput();
updateAdminCreateServiceControls();
document.getElementById('cr-service-type')?.addEventListener('change', updateAdminCreateServiceControls);
document.getElementById('cr-service-date')?.addEventListener('change', refreshAdminCreateReturnTimes);

// ── Create Request vehicle dropdowns (mirrors booking-flow.js) ────────────────

const CR_VEHICLE_POPULAR_MAKES = ['Chevrolet', 'Ford', 'Honda', 'Hyundai', 'Jeep', 'Kia', 'Nissan', 'Subaru', 'Tesla', 'Toyota'];
const CR_VEHICLE_OTHER_MAKES = ['Acura', 'Alfa Romeo', 'Audi', 'BMW', 'Buick', 'Cadillac', 'Chrysler', 'Dodge', 'Fiat', 'Genesis', 'GMC', 'Infiniti', 'Jaguar', 'Land Rover', 'Lexus', 'Lincoln', 'Mazda', 'Mercedes-Benz', 'Mini', 'Mitsubishi', 'Porsche', 'Ram', 'Volkswagen', 'Volvo'];
const CR_VEHICLE_FALLBACK_MODELS = {
  Acura: ['ILX', 'Integra', 'MDX', 'RDX', 'TLX'],
  Audi: ['A3', 'A4', 'A5', 'A6', 'Q3', 'Q5', 'Q7'],
  BMW: ['3 Series', '4 Series', '5 Series', 'X1', 'X3', 'X5'],
  Buick: ['Encore', 'Encore GX', 'Enclave', 'Envision'],
  Cadillac: ['CT4', 'CT5', 'Escalade', 'XT4', 'XT5', 'XT6'],
  Chevrolet: ['Blazer', 'Colorado', 'Equinox', 'Malibu', 'Silverado', 'Suburban', 'Tahoe', 'Trailblazer', 'Traverse'],
  Chrysler: ['300', 'Pacifica', 'Voyager'],
  Dodge: ['Challenger', 'Charger', 'Durango', 'Hornet'],
  Ford: ['Bronco', 'Escape', 'Explorer', 'F-150', 'Fusion', 'Maverick', 'Mustang', 'Ranger'],
  Genesis: ['G70', 'G80', 'GV70', 'GV80'],
  GMC: ['Acadia', 'Canyon', 'Sierra', 'Terrain', 'Yukon'],
  Honda: ['Accord', 'Civic', 'CR-V', 'HR-V', 'Odyssey', 'Passport', 'Pilot', 'Ridgeline'],
  Hyundai: ['Elantra', 'Kona', 'Palisade', 'Santa Fe', 'Sonata', 'Tucson'],
  Infiniti: ['Q50', 'QX50', 'QX55', 'QX60', 'QX80'],
  Jeep: ['Cherokee', 'Compass', 'Gladiator', 'Grand Cherokee', 'Renegade', 'Wrangler'],
  Kia: ['Carnival', 'Forte', 'K5', 'Seltos', 'Sorento', 'Soul', 'Sportage', 'Telluride'],
  Lexus: ['ES', 'GX', 'IS', 'NX', 'RX', 'TX'],
  Lincoln: ['Aviator', 'Corsair', 'Nautilus', 'Navigator'],
  Mazda: ['CX-30', 'CX-5', 'CX-50', 'CX-9', 'Mazda3', 'Mazda6', 'MX-5 Miata'],
  'Mercedes-Benz': ['C-Class', 'E-Class', 'GLA', 'GLC', 'GLE', 'S-Class'],
  Mini: ['Clubman', 'Convertible', 'Cooper', 'Countryman'],
  Mitsubishi: ['Eclipse Cross', 'Mirage', 'Outlander', 'Outlander Sport'],
  Nissan: ['Altima', 'Frontier', 'Kicks', 'Maxima', 'Murano', 'Pathfinder', 'Rogue', 'Sentra', 'Versa'],
  Ram: ['1500', '2500', '3500', 'ProMaster'],
  Subaru: ['Ascent', 'Crosstrek', 'Forester', 'Impreza', 'Legacy', 'Outback'],
  Tesla: ['Model 3', 'Model S', 'Model X', 'Model Y'],
  Toyota: ['4Runner', 'Camry', 'Corolla', 'Highlander', 'Prius', 'RAV4', 'Sienna', 'Tacoma', 'Tundra'],
  Volkswagen: ['Atlas', 'Golf', 'ID.4', 'Jetta', 'Passat', 'Taos', 'Tiguan'],
  Volvo: ['S60', 'S90', 'V60', 'XC40', 'XC60', 'XC90'],
};

function crPopulateYearOptions(select) {
  const maxYear = new Date().getFullYear() + 1;
  let html = '<option value="">Select year</option>';
  for (let year = maxYear; year >= 1980; year -= 1) html += `<option value="${year}">${year}</option>`;
  select.innerHTML = html;
}

function crPopulateMakeOptions(select) {
  const popular = CR_VEHICLE_POPULAR_MAKES.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');
  const other = CR_VEHICLE_OTHER_MAKES
    .filter((m) => !CR_VEHICLE_POPULAR_MAKES.includes(m))
    .sort((a, b) => a.localeCompare(b))
    .map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`)
    .join('');
  select.innerHTML = `
    <option value="">Select make</option>
    <optgroup label="Most common makes">${popular}</optgroup>
    <optgroup label="Other makes">${other}</optgroup>`;
}

async function crLoadModelOptions(yearSelect, makeSelect, modelSelect) {
  if (!modelSelect) return;
  const year = yearSelect?.value || '';
  const make = makeSelect?.value || '';

  if (!year || !make) {
    modelSelect.innerHTML = '<option value="">Select year and make first</option>';
    modelSelect.disabled = true;
    return;
  }

  modelSelect.innerHTML = '<option value="">Loading models…</option>';
  modelSelect.disabled = true;

  try {
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(make)}/modelyear/${year}/vehicletype/car?format=json`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const models = [...new Set((data.Results || []).map((row) => row.Model_Name).filter(Boolean))].sort((a, b) => a.localeCompare(b));
      if (models.length) {
        modelSelect.innerHTML = `<option value="">Select model</option>${models.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('')}`;
        modelSelect.disabled = false;
        return;
      }
    }
  } catch (error) {
    console.warn('Could not load vehicle models from NHTSA:', error);
  }

  const fallback = CR_VEHICLE_FALLBACK_MODELS[make] || [];
  modelSelect.innerHTML = `<option value="">${fallback.length ? 'Select model' : 'No models found'}</option>${fallback.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('')}`;
  modelSelect.disabled = fallback.length === 0;
}

(function initCreateRequestVehicleDropdowns() {
  const yearSelect = document.getElementById('cr-vehicle-year');
  const makeSelect = document.getElementById('cr-vehicle-make');
  const modelSelect = document.getElementById('cr-vehicle-model');
  if (!yearSelect || !makeSelect || !modelSelect) return;

  crPopulateYearOptions(yearSelect);
  crPopulateMakeOptions(makeSelect);

  yearSelect.addEventListener('change', () => crLoadModelOptions(yearSelect, makeSelect, modelSelect));
  makeSelect.addEventListener('change', () => crLoadModelOptions(yearSelect, makeSelect, modelSelect));
})();

// Admin profile photo editor state (mirrors worker.js)
let adminPhotoZoom = 1;
let adminPhotoPosition = { x: 0, y: 0 };
let adminPhotoDisplayDrag = null;
let adminBoundaryPreviewUrl = '';
let adminCroppedPreviewUrl = '';
let adminCroppedPhotoBlob = null;
let adminPhotoDeleted = false; // true when admin clicks "Delete photo"

// Unified terminal/closed status list — keep in sync with worker.js, track.js,
// and the SQL terminal-status list in supabase-production-rls-lockdown.sql.
const terminalStatuses = ['completed', 'cancelled'];
const closedStatuses = ['cancelled'];

// Friendly labels for every status — keep in sync with worker.js and track.js.
// Raw database status strings must never be shown to a user; this map is the
// single source of truth for that translation.
const statusLabels = {
  new: 'New',
  assigned: 'Assigned',
  en_route: 'En route',
  in_service: 'In service',
  returning: 'Returning',
  completed: 'Completed',
  cancelled: 'Cancelled',
  pending: 'Request received',
  request_received: 'Request received',
  accepted: 'Accepted',
  key_received: 'Key received',
  pickup_vehicle_photo_uploaded: 'Pickup vehicle photo uploaded',
  pickup_odometer_photo_uploaded: 'Pickup odometer photo uploaded',
  pickup_fuel_gauge_photo_uploaded: 'Pickup fuel gauge photo uploaded',
  vehicle_picked_up: 'Vehicle picked up',
  in_progress: 'In service',
  service_in_progress: 'Service in progress',
  fueling_in_progress: 'Fueling in progress',
  fueling_complete: 'Fueling complete',
  fuel_receipt_uploaded: 'Fuel receipt recorded',
  car_wash_in_progress: 'Car wash in progress',
  car_wash_complete: 'Vehicle cleaning complete',
  fuel_and_wash_complete: 'Fuel and wash complete',
  partial_service_complete: 'Partial service complete',
  service_complete: 'Service complete',
  receipts_recorded: 'Receipts recorded',
  returned_location_pending: 'Vehicle return location needed',
  return_photos_needed: 'Return photos needed',
  inspection_needed: 'Quick inspection needed',
  inspection_recorded: 'Quick inspection complete',
  wash_receipt_uploaded: 'Car wash receipt recorded',
  return_location_recorded: 'Return location recorded',
  dropoff_vehicle_photo_uploaded: 'Drop-off vehicle photo uploaded',
  dropoff_odometer_photo_uploaded: 'Drop-off odometer photo uploaded',
  dropoff_fuel_gauge_photo_uploaded: 'Drop-off fuel gauge photo uploaded',
  vehicle_returned: 'Vehicle returned',
  final_payment_processed: 'Final payment processed',
  awaiting_key_return: 'Awaiting key return',
  keys_returned: 'Keys returned',
  complete: 'Complete',
  denied: 'Denied',
  customer_canceled: 'Canceled by customer',
  canceled: 'Canceled',
  unable_to_complete: 'Unable to complete',
  auto_reversed: 'Missed — auto-reversed',
  closed_no_charge: 'Closed — no charge',
  pending_customer_info: 'Awaiting customer info',
  pending_customer_payment: 'Awaiting customer payment',
  return_requested: 'Return requested',
  customer_return_requested: 'Return requested',
  cancelled_pending_key_return: 'Cancellation received - awaiting key/vehicle return',
  canceled_return_completed: 'Return completed',
  payment_issue: 'Payment issue',
  authorization_too_low: 'Authorization issue',
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
  const completeCount = allRequests.filter((r) => canonicalBookingStatus(r.status) === 'completed').length;
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

const PAYMENT_STATUS_LABELS = {
  not_started:            'Not started',
  authorized:             'Authorized (hold on card)',
  captured:               'Captured (charged)',
  voided:                 'Authorization released — customer was not charged',
  authorization_released: 'Authorization released — customer was not charged',
  refunded:               'Refunded',
  auto_reversed:          'Auto-reversed (missed service)',
  payment_release_failed: 'Hold release failed — check Stripe',
  capture_failed:         'Capture failed — customer must repay',
};

const CLOSED_STATUSES = ['cancelled'];

function paymentStatusLabel(request) {
  const label = PAYMENT_STATUS_LABELS[request.payment_status] || request.payment_status || 'Unknown';
  const amount = request.payment_status === 'captured' && request.final_total != null
    ? ` — ${money(request.final_total)}`
    : request.payment_status === 'authorized' && request.estimated_total != null
    ? ` — ${money(request.estimated_total)} estimated hold`
    : '';
  return `${label}${amount}`;
}

function bookingStatusLabel(status) {
  const canonicalStatus = canonicalBookingStatus(status);
  return statusLabels[canonicalStatus] || canonicalStatus || 'Status pending';
}

function formatTimestamp(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// Common door-jamb PSI by make/model — a STARTING suggestion only (matched on
// make+model, not year/trim); the worker/admin confirms the real number off the
// door-jamb sticker. Keep in sync with worker.js.
const fallbackPsiGuides = [
  { make: 'Toyota', model: 'Camry', front_psi: 35, rear_psi: 35 },
  { make: 'Toyota', model: 'Corolla', front_psi: 32, rear_psi: 32 },
  { make: 'Toyota', model: 'RAV4', front_psi: 35, rear_psi: 35 },
  { make: 'Toyota', model: 'Highlander', front_psi: 35, rear_psi: 35 },
  { make: 'Toyota', model: 'Tacoma', front_psi: 30, rear_psi: 35 },
  { make: 'Toyota', model: 'Tundra', front_psi: 35, rear_psi: 35 },
  { make: 'Toyota', model: '4Runner', front_psi: 32, rear_psi: 32 },
  { make: 'Toyota', model: 'Prius', front_psi: 35, rear_psi: 33 },
  { make: 'Toyota', model: 'Sienna', front_psi: 36, rear_psi: 36 },
  { make: 'Honda', model: 'Civic', front_psi: 32, rear_psi: 32 },
  { make: 'Honda', model: 'Accord', front_psi: 32, rear_psi: 32 },
  { make: 'Honda', model: 'CR-V', front_psi: 32, rear_psi: 32 },
  { make: 'Honda', model: 'Pilot', front_psi: 35, rear_psi: 35 },
  { make: 'Honda', model: 'Odyssey', front_psi: 35, rear_psi: 35 },
  { make: 'Honda', model: 'HR-V', front_psi: 33, rear_psi: 33 },
  { make: 'Honda', model: 'Passport', front_psi: 35, rear_psi: 35 },
  { make: 'Nissan', model: 'Altima', front_psi: 32, rear_psi: 32 },
  { make: 'Nissan', model: 'Rogue', front_psi: 33, rear_psi: 33 },
  { make: 'Nissan', model: 'Sentra', front_psi: 33, rear_psi: 33 },
  { make: 'Nissan', model: 'Murano', front_psi: 35, rear_psi: 35 },
  { make: 'Nissan', model: 'Pathfinder', front_psi: 35, rear_psi: 35 },
  { make: 'Nissan', model: 'Frontier', front_psi: 32, rear_psi: 32 },
  { make: 'Nissan', model: 'Kicks', front_psi: 33, rear_psi: 33 },
  { make: 'Hyundai', model: 'Elantra', front_psi: 33, rear_psi: 33 },
  { make: 'Hyundai', model: 'Sonata', front_psi: 34, rear_psi: 34 },
  { make: 'Hyundai', model: 'Tucson', front_psi: 35, rear_psi: 33 },
  { make: 'Hyundai', model: 'Santa Fe', front_psi: 35, rear_psi: 35 },
  { make: 'Hyundai', model: 'Kona', front_psi: 33, rear_psi: 33 },
  { make: 'Hyundai', model: 'Palisade', front_psi: 35, rear_psi: 35 },
  { make: 'Kia', model: 'Forte', front_psi: 33, rear_psi: 33 },
  { make: 'Kia', model: 'K5', front_psi: 35, rear_psi: 35 },
  { make: 'Kia', model: 'Sportage', front_psi: 35, rear_psi: 33 },
  { make: 'Kia', model: 'Sorento', front_psi: 35, rear_psi: 35 },
  { make: 'Kia', model: 'Soul', front_psi: 33, rear_psi: 33 },
  { make: 'Kia', model: 'Telluride', front_psi: 35, rear_psi: 35 },
  { make: 'Ford', model: 'F-150', front_psi: 35, rear_psi: 35 },
  { make: 'Ford', model: 'Escape', front_psi: 35, rear_psi: 35 },
  { make: 'Ford', model: 'Explorer', front_psi: 35, rear_psi: 35 },
  { make: 'Ford', model: 'Edge', front_psi: 34, rear_psi: 34 },
  { make: 'Ford', model: 'Mustang', front_psi: 32, rear_psi: 30 },
  { make: 'Ford', model: 'Ranger', front_psi: 35, rear_psi: 35 },
  { make: 'Ford', model: 'Bronco', front_psi: 38, rear_psi: 38 },
  { make: 'Chevrolet', model: 'Silverado', front_psi: 35, rear_psi: 35 },
  { make: 'Chevrolet', model: 'Equinox', front_psi: 35, rear_psi: 35 },
  { make: 'Chevrolet', model: 'Malibu', front_psi: 35, rear_psi: 35 },
  { make: 'Chevrolet', model: 'Traverse', front_psi: 35, rear_psi: 35 },
  { make: 'Chevrolet', model: 'Tahoe', front_psi: 35, rear_psi: 35 },
  { make: 'Chevrolet', model: 'Trailblazer', front_psi: 33, rear_psi: 33 },
  { make: 'GMC', model: 'Sierra', front_psi: 35, rear_psi: 35 },
  { make: 'GMC', model: 'Terrain', front_psi: 35, rear_psi: 35 },
  { make: 'GMC', model: 'Acadia', front_psi: 35, rear_psi: 35 },
  { make: 'GMC', model: 'Yukon', front_psi: 35, rear_psi: 35 },
  { make: 'Jeep', model: 'Wrangler', front_psi: 37, rear_psi: 37 },
  { make: 'Jeep', model: 'Grand Cherokee', front_psi: 36, rear_psi: 36 },
  { make: 'Jeep', model: 'Cherokee', front_psi: 34, rear_psi: 34 },
  { make: 'Jeep', model: 'Compass', front_psi: 33, rear_psi: 33 },
  { make: 'Jeep', model: 'Gladiator', front_psi: 37, rear_psi: 37 },
  { make: 'Ram', model: '1500', front_psi: 35, rear_psi: 35 },
  { make: 'Dodge', model: 'Charger', front_psi: 35, rear_psi: 32 },
  { make: 'Dodge', model: 'Durango', front_psi: 36, rear_psi: 36 },
  { make: 'Chrysler', model: 'Pacifica', front_psi: 36, rear_psi: 36 },
  { make: 'Subaru', model: 'Outback', front_psi: 35, rear_psi: 33 },
  { make: 'Subaru', model: 'Forester', front_psi: 32, rear_psi: 30 },
  { make: 'Subaru', model: 'Crosstrek', front_psi: 33, rear_psi: 32 },
  { make: 'Subaru', model: 'Impreza', front_psi: 33, rear_psi: 32 },
  { make: 'Subaru', model: 'Ascent', front_psi: 35, rear_psi: 35 },
  { make: 'Mazda', model: 'CX-5', front_psi: 34, rear_psi: 34 },
  { make: 'Mazda', model: 'Mazda3', front_psi: 36, rear_psi: 35 },
  { make: 'Mazda', model: 'CX-9', front_psi: 35, rear_psi: 35 },
  { make: 'Mazda', model: 'CX-30', front_psi: 34, rear_psi: 34 },
  { make: 'Volkswagen', model: 'Jetta', front_psi: 36, rear_psi: 36 },
  { make: 'Volkswagen', model: 'Tiguan', front_psi: 33, rear_psi: 36 },
  { make: 'Volkswagen', model: 'Atlas', front_psi: 38, rear_psi: 41 },
  { make: 'Tesla', model: 'Model 3', front_psi: 42, rear_psi: 42 },
  { make: 'Tesla', model: 'Model Y', front_psi: 42, rear_psi: 42 },
  { make: 'Tesla', model: 'Model S', front_psi: 42, rear_psi: 42 },
  { make: 'Tesla', model: 'Model X', front_psi: 40, rear_psi: 40 },
  { make: 'Lexus', model: 'RX', front_psi: 33, rear_psi: 33 },
  { make: 'Lexus', model: 'ES', front_psi: 35, rear_psi: 35 },
  { make: 'Lexus', model: 'NX', front_psi: 33, rear_psi: 33 },
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

// Password reset modal helpers
const workerPwResetModal = document.querySelector('#worker-pw-reset-modal');
const workerPwResetValue = document.querySelector('#worker-pw-reset-value');
const copyWorkerPwBtn = document.querySelector('#copy-worker-pw');
const copyPwStatus = document.querySelector('#copy-pw-status');
const closeWorkerPwReset = document.querySelector('#close-worker-pw-reset');

function showTempPasswordModal(tempPassword) {
  if (!workerPwResetModal || !workerPwResetValue) return;
  workerPwResetValue.textContent = tempPassword;
  if (copyPwStatus) copyPwStatus.textContent = '';
  workerPwResetModal.removeAttribute('hidden');
}

closeWorkerPwReset?.addEventListener('click', () => {
  workerPwResetModal?.setAttribute('hidden', '');
  if (workerPwResetValue) workerPwResetValue.textContent = '';
});

copyWorkerPwBtn?.addEventListener('click', async () => {
  const pw = workerPwResetValue?.textContent || '';
  try {
    await navigator.clipboard.writeText(pw);
    if (copyPwStatus) copyPwStatus.textContent = 'Copied.';
  } catch {
    if (copyPwStatus) copyPwStatus.textContent = 'Could not copy — copy the password manually.';
  }
});

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
  return !terminalStatuses.includes(canonicalBookingStatus(request.status));
}

function dashboardRangeBounds(range) {
  const now = new Date();
  if (range === 'today') {
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const end = new Date(now); end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  if (range === 'week') {
    const start = new Date(now);
    const dayIndex = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - dayIndex);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  if (range === 'month') {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
    };
  }
  if (range === 'custom') {
    const start = customRange.start ? new Date(customRange.start + 'T00:00:00') : null;
    const end = customRange.end ? new Date(customRange.end + 'T23:59:59') : null;
    return { start, end };
  }
  return { start: null, end: null }; // 'all'
}

function isInDashboardRange(request, range) {
  const { start, end } = dashboardRangeBounds(range);
  if (!start && !end) return true;
  // Filter by the SCHEDULED service date (what the customer booked for), not the
  // submission date — so "Today" shows everything happening today, regardless of
  // when it was created. Falls back to created_at for requests with no date.
  const stamp = request.service_date
    ? new Date(request.service_date + 'T12:00:00')
    : new Date(request.updated_at || request.created_at);
  if (start && stamp < start) return false;
  if (end && stamp > end) return false;
  return true;
}

function isToday(value) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

function getFilteredRequests(requests, filter) {
  switch (filter) {
    case 'open':
      return requests.filter((r) => OPEN_REQUEST_STATUSES.includes(canonicalBookingStatus(r.status)));
    case 'in_progress':
      return requests.filter((r) => IN_PROGRESS_REQUEST_STATUSES.includes(canonicalBookingStatus(r.status)));
    case 'completed_today':
      return requests.filter((r) => canonicalBookingStatus(r.status) === 'completed' && isToday(r.completed_at));
    case 'cancelled':
      return requests.filter((r) => canonicalBookingStatus(r.status) === 'cancelled');
    default:
      return requests;
  }
}

function normalizeRequestFilter(filter) {
  const value = String(filter || 'all');
  if (value === 'unassigned') return 'open';
  if (value === 'inprogress') return 'in_progress';
  if (value === 'complete') return 'completed_today';
  if (value === 'closed') return 'cancelled';
  return value;
}

function formatShortDate(value) {
  if (!value) return '';
  const d = new Date(value + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function dashboardRangeLabel(range) {
  if (range === 'custom') {
    if (customRange.start && customRange.end) return `${formatShortDate(customRange.start)} – ${formatShortDate(customRange.end)}`;
    if (customRange.start) return `From ${formatShortDate(customRange.start)}`;
    if (customRange.end) return `Until ${formatShortDate(customRange.end)}`;
    return 'Custom range';
  }
  return { today: 'Today', week: 'This Week', month: 'This Month', all: 'All Time' }[range] || 'Today';
}

function serviceNeedsFuel(request) {
  return String(request.service_type || '').includes('fuel');
}

function serviceNeedsWash(request) {
  return String(request.service_type || '').includes('wash');
}

const POST_SERVICE_STATUSES = new Set([
  'service_complete', 'receipts_recorded', 'returned_location_pending',
  'return_location_recorded', 'return_photos_needed', 'vehicle_returned',
  'inspection_needed', 'inspection_recorded', 'final_payment_processed',
  'awaiting_key_return', 'keys_returned', 'pending_customer_payment',
  'payment_issue', 'authorization_too_low', 'complete',
]);

function serviceWorkComplete(request) {
  return POST_SERVICE_STATUSES.has(request.status);
}

function receiptTotalsFromNotes(request) {
  const matches = Array.from(String(request.notes || '').matchAll(/\[receipt_totals fuel=([0-9.]+) wash=([0-9.]+)\]/g));
  const latest = matches.at(-1);

  return {
    fuel: latest ? Number(latest[1]) || 0 : 0,
    wash: latest ? Number(latest[2]) || 0 : 0,
  };
}

const RETURN_CANCELLATION_FEE = 15;
const RETURN_RECOVERY_RATE = 0.029;
const RETURN_RECOVERY_FIXED = 0.30;
let BASE_FUEL_SERVICE_FEE = 15;
let BASE_WASH_SERVICE_FEE = 15;
let BASE_QUICK_INSPECTION_FEE = 5;

function roundMoneyValue(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

// ── Worker payout (must mirror workerNetPayout in worker.js) ─────────────────
const WORKER_SERVICE_FEE_SHARE = 0.5;   // fallback / cancellation-fee share
let WORKER_MILEAGE_RATE = 0.725;        // worker per-mile detour pay; set from settings (wash_detour_rate)
// Independent worker share per service-fee type (admin-editable, from settings).
// Default 0.5 each so payout is unchanged until the admin sets different values.
let ADMIN_FEE_SHARES = { fuel: 0.5, wash: 0.5, insp: 0.5 };
// Mirror of worker.js WORKER_BUNDLE — per-leg bundled fees + worker shares.
let ADMIN_BUNDLE = { fuelFee: 0, washFee: 0, fuelShare: 0.5, washShare: 0.5 };

// Effective per-fee shares for a job (mirror of worker.js effectiveFeeShares): a
// Fuel + Wash combo earns the bundle shares when a bundle is configured + cheaper.
function adminEffectiveFeeShares(request) {
  const both = serviceNeedsFuel(request) && serviceNeedsWash(request);
  const bundleSum = ADMIN_BUNDLE.fuelFee + ADMIN_BUNDLE.washFee;
  const fullSum = BASE_FUEL_SERVICE_FEE + BASE_WASH_SERVICE_FEE;
  if (both && bundleSum > 0 && bundleSum < fullSum) {
    return { fuel: ADMIN_BUNDLE.fuelShare, wash: ADMIN_BUNDLE.washShare, insp: ADMIN_FEE_SHARES.insp };
  }
  return ADMIN_FEE_SHARES;
}

// Mirror of workerFeeShareSplit in worker.js — worker's cut of the service fees
// with an independent share per fee type. Card + folded service-time removed first,
// then the net is split by each fee's time-stripped gross. Equal shares == old math.
function adminFeeShareSplit(fuelFee, washFee, inspFee, timeCharge, shares = ADMIN_FEE_SHARES) {
  const f = Number(fuelFee) || 0;
  const w = Number(washFee) || 0;
  const i = Number(inspFee) || 0;
  const t = Number(timeCharge) || 0;
  const totalFee = f + w + i;
  if (totalFee <= 0) return 0;
  const gross = Math.max(0, totalFee - t);
  if (gross <= 0) return 0;
  const stripe = roundMoneyValue(gross * RETURN_RECOVERY_RATE + RETURN_RECOVERY_FIXED);
  const net = Math.max(0, gross - stripe);
  if (net <= 0) return 0;
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

// Did the customer cancel after the worker already had the keys? Those workers
// are owed half the cancellation fee actually collected (no mileage — they never
// drove to a station).
function isCanceledAfterKeys(request) {
  const canceled = !!request.canceled_at || /cancel/i.test(String(request.status || ''));
  return canceled && !!request.key_received_at;
}

function workerMileagePay(request) {
  const miles = Number(request.gas_station_extra_miles) || 0;
  return miles > 0 ? roundMoneyValue(miles * WORKER_MILEAGE_RATE) : 0;
}

// ── Time-based pay (mirror of worker.js, for the Payroll fallback when a job has
// no frozen [worker_payout] yet). New completions read the frozen value; this
// keeps the live calc correct for the window before the freeze existed. ──
const ADMIN_TIME_COMP = { companyRatePerMin: 0.50, fuelBaseMin: 3, fuelPerGallonMin: 0.5, washMin: 20, washDetourFreeMiles: 5, washDetourRate: 0.725 };
function adminFrozenTimeCharge(request) {
  const m = String(request?.notes || '').match(/\[time_charge (\d+(?:\.\d+)?)\]/);
  return m ? Number(m[1]) : 0;
}
function adminNoteCoords(request, tag) {
  const m = String(request?.notes || '').match(new RegExp('\\[' + tag + ' (-?\\d+(?:\\.\\d+)?),(-?\\d+(?:\\.\\d+)?)\\]'));
  if (!m) return null;
  const lat = Number(m[1]), lon = Number(m[2]);
  return (Number.isFinite(lat) && Number.isFinite(lon)) ? { lat, lon } : null;
}
function adminHaversineMiles(a, b) {
  if (!a || !b) return 0;
  const R = 3958.8, toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function adminJobNeedsFuel(r) { return /fuel/.test(String(r.service_type || '')); }
function adminJobNeedsWash(r) { return /wash/.test(String(r.service_type || '')); }
function adminServiceMinutes(r) {
  let m = 0;
  if (adminJobNeedsFuel(r)) m += ADMIN_TIME_COMP.fuelBaseMin + ADMIN_TIME_COMP.fuelPerGallonMin * Number(r.selected_fuel_gallons || r.estimated_gallons || r.authorization_fuel_gallons || 0);
  if (adminJobNeedsWash(r)) m += ADMIN_TIME_COMP.washMin;
  return m;
}
// The assigned worker's per-minute rate, capped at the company rate (defaults to it).
function adminWorkerTimeRate(request) {
  const company = ADMIN_TIME_COMP.companyRatePerMin;
  const emp = (allEmployees || []).find((e) => String(e.id) === String(request.assigned_employee_id));
  const rate = Number(emp?.time_rate_per_min);
  return Number.isFinite(rate) && rate > 0 ? Math.min(rate, company) : company;
}
function adminWorkerTimePay(request) {
  return roundMoneyValue(adminServiceMinutes(request) * adminWorkerTimeRate(request));
}
function adminWorkerWashDetourPay(request) {
  if (!adminJobNeedsWash(request)) return 0;
  const car = adminNoteCoords(request, 'pickup_coords');
  const wash = adminNoteCoords(request, 'wash_dest_coords');
  if (!car || !wash) return 0;
  const miles = adminHaversineMiles(car, wash) * 2 * 1.3; // round trip + road factor
  return roundMoneyValue(miles * ADMIN_TIME_COMP.washDetourRate); // paid on all miles (free allowance is customer-side)
}

// What a worker earned on a single request. Completed/captured jobs pay 50% of
// service fees (net of Stripe) plus station mileage; a customer-cancel-after-keys
// pays 50% of the cancellation fee actually collected (net of Stripe), no
// mileage; anything else hasn't earned yet.
// The worker's pay locked into notes at completion ([worker_payout X.XX]) — read
// back so later rate changes or admin fee edits never move a finished job's pay.
function frozenWorkerPayout(request) {
  const all = String(request?.notes || '').match(/\[worker_payout (\d+(?:\.\d+)?)\]/g);
  if (!all || !all.length) return null;
  const n = Number((all[all.length - 1].match(/[\d.]+/) || [])[0]);
  return Number.isFinite(n) ? n : null;
}

// Payroll + the Company-Net tile call this several times per request (earning
// filter, per-worker loop, companyNetBreakdown). It parses the notes each time, so
// memoize per request object. Safe because allRequests is REPLACED on every load
// (fresh objects ⇒ the cache auto-invalidates); a completed job's pay is frozen.
const _workerPayoutCache = new WeakMap();
function workerPayoutForRequest(request) {
  if (!request || typeof request !== 'object') return 0;
  const cached = _workerPayoutCache.get(request);
  if (cached !== undefined) return cached;
  const result = computeWorkerPayoutForRequest(request);
  _workerPayoutCache.set(request, result);
  return result;
}
function computeWorkerPayoutForRequest(request) {
  const completed = canonicalBookingStatus(request.status) === 'completed' || request.payment_status === 'captured';
  if (completed) {
    const locked = frozenWorkerPayout(request);
    if (locked != null) return roundMoneyValue(locked);
  }
  let payout = 0;
  if (completed) {
    const receipts = receiptTotalsFromNotes(request);
    const hasReceipts = Number(receipts.fuel || 0) > 0 || Number(receipts.wash || 0) > 0;
    const fees = hasReceipts ? feeSummary(request, receipts) : feeSummary(request);
    // Time pay (minutes at the worker's rate) + car-wash detour mileage + station mileage.
    payout += workerMileagePay(request) + adminWorkerTimePay(request) + adminWorkerWashDetourPay(request);
    // Per-type service-fee share (time folded out so it's paid once). Mirrors worker.js.
    payout += adminFeeShareSplit(fees.fuel, fees.wash, fees.inspection, adminFrozenTimeCharge(request), adminEffectiveFeeShares(request));
  } else if (isCanceledAfterKeys(request) && request.payment_status === 'cancellation_fee_paid') {
    // 50% of the cancellation fee the company actually collected (no per-type split).
    const cancelGross = Number(request.cancellation_fee ?? request.cancellation_fee_amount ?? 0);
    if (cancelGross > 0) {
      const stripe = roundMoneyValue(cancelGross * RETURN_RECOVERY_RATE + RETURN_RECOVERY_FIXED);
      payout += Math.max(0, cancelGross - stripe) * WORKER_SERVICE_FEE_SHARE;
    }
  } else {
    return 0;
  }
  return roundMoneyValue(Math.max(0, payout));
}

function estimatePricingSummary({ needsFuel, needsWash, fuelAmount = 0, washAmount = 0, quickInspection = false }) {
  const fuelBase = needsFuel ? BASE_FUEL_SERVICE_FEE : 0;
  const washBase = needsWash ? BASE_WASH_SERVICE_FEE : 0;
  const inspection = quickInspection ? BASE_QUICK_INSPECTION_FEE : 0;
  const netTarget = roundMoneyValue(fuelAmount + washAmount + fuelBase + washBase + inspection);
  const roundedTotal = netTarget > 0
    ? Math.ceil((netTarget + RETURN_RECOVERY_FIXED) / (1 - RETURN_RECOVERY_RATE))
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
    fuel: roundMoneyValue(fuelBase + fuelRecovery),
    wash: roundMoneyValue(washBase + washRecovery),
    inspection,
    recovery,
    total: roundedTotal,
  };
}

function returnRequestChargeSummary(request) {
  const receiptTotals = receiptTotalsFromNotes(request);
  const hasReceipts = receiptTotals.fuel > 0 || receiptTotals.wash > 0;
  const subtotal = roundMoneyValue(receiptTotals.fuel + receiptTotals.wash + RETURN_CANCELLATION_FEE);
  const total = hasReceipts
    ? Math.ceil((subtotal + RETURN_RECOVERY_FIXED) / (1 - RETURN_RECOVERY_RATE))
    : RETURN_CANCELLATION_FEE;
  const recovery = roundMoneyValue(total - subtotal);

  return {
    fuel: roundMoneyValue(receiptTotals.fuel),
    wash: roundMoneyValue(receiptTotals.wash),
    cancellationFee: RETURN_CANCELLATION_FEE,
    recovery,
    subtotal,
    total,
    hasReceipts,
  };
}

function transactionPricingSummary(request, receiptTotals = { fuel: 0, wash: 0 }) {
  const needsFuel = serviceNeedsFuel(request);
  const needsWash = serviceNeedsWash(request);
  // A service is chargeable if it was actually performed (has a receipt) or
  // admin explicitly chose to charge the fee anyway for an unable_to_complete
  // service. Fuel/wash cost itself is never charged without a receipt.
  const fuelBase = needsFuel && (Number(receiptTotals.fuel || 0) > 0 || serviceUnableFeeCharged(request, 'fuel')) ? BASE_FUEL_SERVICE_FEE : 0;
  const washBase = needsWash && (Number(receiptTotals.wash || 0) > 0 || serviceUnableFeeCharged(request, 'wash')) ? BASE_WASH_SERVICE_FEE : 0;
  const inspection = request.quick_inspection ? BASE_QUICK_INSPECTION_FEE : 0;
  const netTarget = roundMoneyValue(Number(receiptTotals.fuel || 0) + Number(receiptTotals.wash || 0) + fuelBase + washBase + inspection);
  const roundedTotal = netTarget > 0
    ? Math.ceil((netTarget + RETURN_RECOVERY_FIXED) / (1 - RETURN_RECOVERY_RATE))
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
  } else if (needsFuel && !needsWash) {
    fuelRecovery = recovery;
  } else if (needsWash) {
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
    grossBeforeRounding: netTarget > 0 ? (netTarget + RETURN_RECOVERY_FIXED) / (1 - RETURN_RECOVERY_RATE) : 0,
    total: roundedTotal,
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

// True only if admin explicitly chose to charge the service fee for an
// unable_to_complete service (default is to waive it entirely).
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
    return 'service_complete';
  }

  return type === 'fuel' ? 'fuel_receipt_uploaded' : 'wash_receipt_uploaded';
}

function photoTimestampNote(stage, timestamp) {
  return stage === 'dropoff'
    ? `[dropoff_time ${timestamp}] Drop-off photos uploaded at ${formatDateTime(timestamp)}.`
    : `[pickup_time ${timestamp}] Pickup photos uploaded at ${formatDateTime(timestamp)}.`;
}

function finalTotalFromSavedReceipts(request, receiptTotals = receiptTotalsFromNotes(request)) {
  const total = transactionPricingSummary(request, receiptTotals).total;
  // Apply any promo discount (service-fees only, computed + stored at booking).
  const discount = Math.max(0, Number(request.promo_discount) || 0);
  return Math.max(0, Math.round((total - discount) * 100) / 100);
}

// Builds the internal pricing-audit fields (admin/internal only — never
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

// Admin/internal-only pricing breakdown — never shown to the customer.
// Reads from the saved audit columns (set whenever final_total is saved);
// falls back to "Not recorded" before the first receipt is entered.
function renderPricingAuditDetails(request) {
  const row = (label, value) => `<p><strong>${escapeHtml(label)}:</strong> ${value == null ? 'Not recorded' : money(value)}</p>`;
  return `
    <details class="pricing-audit-details">
      <summary>Pricing audit (admin only)</summary>
      ${request.base_fuel_service_fee != null || request.base_car_wash_service_fee != null || request.base_inspection_fee != null ? `
        <p><strong>Base fees:</strong> Fuel ${request.base_fuel_service_fee != null ? money(request.base_fuel_service_fee) : '—'} | Car wash ${request.base_car_wash_service_fee != null ? money(request.base_car_wash_service_fee) : '—'} | Inspection ${request.base_inspection_fee != null ? money(request.base_inspection_fee) : '—'}</p>
      ` : ''}
      ${row('Payment/operating recovery', request.payment_operating_recovery_amount)}
      ${row('Net target (before recovery)', request.net_target_amount)}
      ${row('Gross total before rounding', request.gross_total_before_rounding)}
      ${row('Rounded customer total', request.rounded_customer_total)}
      ${row('Authorized amount', request.authorized_amount)}
      ${row('Captured amount', request.captured_amount)}
    </details>
  `;
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
  return transactionPricingSummary(request, {
    fuel: numberFromInput(fuelReceipt),
    wash: numberFromInput(washReceipt),
  }).total;
}

function feeSummary(request, receiptTotals = null) {
  if (receiptTotals) {
    return transactionPricingSummary(request, receiptTotals);
  }
  return {
    fuel: serviceNeedsFuel(request) ? savedFeeOrDefault(request.fuel_convenience_fee, BASE_FUEL_SERVICE_FEE) : 0,
    wash: serviceNeedsWash(request) ? savedFeeOrDefault(request.wash_convenience_fee, BASE_WASH_SERVICE_FEE) : 0,
    inspection: request.quick_inspection ? savedFeeOrDefault(request.quick_inspection_fee, BASE_QUICK_INSPECTION_FEE) : 0,
    recovery: 0,
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
  if (request.quick_inspection) parts.push('Vehicle add-ons');
  if (request.service_date) parts.push(request.service_date);
  if (request.desired_pickup_time) parts.push(`Available from: ${String(request.desired_pickup_time).slice(0, 5)}`);
  if (request.desired_return_time) parts.push(`Return by: ${request.desired_return_time}`);
  return parts.filter(Boolean).join(' | ');
}

function hasCustomerReturnRequestAlert(request) {
  return !!request?.return_requested_at
    || request?.status === 'return_requested'
    || request?.status === 'customer_return_requested'
    || String(request?.notes || '').includes('[customer_return_requested]');
}

const QUEUE_SERVICE_LABELS = { fuel: 'Fuel Concierge', 'car-wash': 'Car Wash', 'car-wash-fuel': 'Car Wash + Fuel' };

function queueServiceLabel(request) {
  return request.service_label || QUEUE_SERVICE_LABELS[request.service_type] || request.service_type || 'Service';
}

function queueStatusBucket(request) {
  if (closedStatuses.includes(canonicalBookingStatus(request.status))) return { label: 'Closed', cls: 'status-pill-denied' };
  if (canonicalBookingStatus(request.status) === 'completed') return { label: 'Completed', cls: 'status-pill-complete' };
  if (OPEN_REQUEST_STATUSES.includes(canonicalBookingStatus(request.status))) return { label: 'Open', cls: 'status-pill-open' };
  return { label: 'In Progress', cls: 'status-pill-progress' };
}

function queueNextActionLabel(bucket) {
  if (bucket.label === 'Open') return 'Assign Worker';
  if (bucket.label === 'Completed') return 'View Summary';
  if (bucket.label === 'Closed') return 'Edit / Reopen';
  return 'View Details';
}

function queueDateTime(request) {
  if (request.service_date) {
    return `${escapeHtml(request.service_date)}${request.desired_return_time ? ` &middot; ${escapeHtml(request.desired_return_time)}` : ''}`;
  }
  return escapeHtml(formatTimestamp(request.created_at));
}

function queueInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

function requestCardDetails(request) {
  const receiptTotals = receiptTotalsFromNotes(request);
  const hasReceipts = Number(receiptTotals.fuel || 0) > 0 || Number(receiptTotals.wash || 0) > 0;
  const fees = hasReceipts ? feeSummary(request, receiptTotals) : feeSummary(request);
  const hasPayment = request.estimated_total != null || request.final_total != null || receiptTotals.fuel || receiptTotals.wash;
  const hasReturnRequest = hasCustomerReturnRequestAlert(request);

  return `
    <div class="request-details">
      ${hasReturnRequest ? `
        <div class="return-request-banner">
          <h4>Customer requested vehicle return.</h4>
          <p class="field-help">Review service progress, completed receipts, and fees before closing.</p>
        </div>
      ` : ''}
      <p><strong>Customer:</strong> ${escapeHtml(request.customer_name || '')}</p>
      <p><strong>Phone:</strong> ${request.customer_phone ? escapeHtml(formatPhone(request.customer_phone)) : 'Not provided'}${request.customer_email ? ` | ${escapeHtml(request.customer_email)}` : ''}</p>
      <p><strong>Service address:</strong> ${escapeHtml(adminFormatAddress(request))}</p>
      <p><strong>Parking:</strong> ${[request.parking_location, request.parking_spot ? `spot ${request.parking_spot}` : ''].filter(Boolean).map(escapeHtml).join(', ') || 'Not provided'}</p>
      ${request.key_handoff_details ? `<p><strong>Key handoff:</strong> ${escapeHtml(request.key_handoff_details)}</p>` : ''}
      <p><strong>Service:</strong> ${escapeHtml(adminFormatService(request))}</p>
      ${String(request.service_type || '').includes('fuel') ? `<p><strong>Gas station:</strong> ${request.gas_station_name ? `${escapeHtml(request.gas_station_name)}${request.gas_station_address ? ` — ${escapeHtml(request.gas_station_address)}` : ''}${Number(request.gas_station_surcharge) > 0 ? ` | Distance surcharge: ${money(request.gas_station_surcharge)}` : ' | Closest (free)'}` : 'Closest available — none recorded'}</p>` : ''}
      <p><strong>Vehicle:</strong> ${escapeHtml([request.vehicle_year, request.vehicle_make, request.vehicle_model, request.vehicle_color].filter(Boolean).join(' '))}${request.license_plate ? ` | Plate: ${escapeHtml(request.license_plate)}` : ''}</p>
      ${request.return_parking_location ? `<p><strong>Car location:</strong> ${escapeHtml(request.return_parking_location)}</p>` : ''}
      ${request.cancellation_reason ? `<p><strong>Cancellation reason:</strong> ${escapeHtml(request.cancellation_reason)}</p>` : ''}
      ${(request.notes && isOpen(request)) ? `<p><strong>Notes:</strong> ${escapeHtml(request.notes)}</p>` : ''}
      ${hasPayment ? `<hr class="details-divider">` : ''}
      ${hasPayment ? `<p><strong>Estimated total:</strong> ${money(request.estimated_total)} | <strong>Final total:</strong> ${request.final_total == null ? 'Not recorded' : money(request.final_total)}</p>` : ''}
      ${(receiptTotals.fuel || receiptTotals.wash) ? `<p><strong>Receipt totals:</strong> Fuel ${money(receiptTotals.fuel)} | Car wash ${money(receiptTotals.wash)}</p>` : ''}
      ${hasPayment ? `<p><strong>Service fees:</strong> Fuel service ${money(fees.fuel)} | Car wash service ${money(fees.wash)} | Vehicle add-ons ${money(fees.inspection)}</p>` : ''}
      ${(canonicalBookingStatus(request.status) === 'completed' || request.payment_status === 'captured') ? `<p><strong>Driver pay${frozenWorkerPayout(request) != null ? ' (locked)' : ''}:</strong> ${money(workerPayoutForRequest(request))}${request.assigned_worker_name ? ` &rarr; ${escapeHtml(request.assigned_worker_name)}` : ''}${frozenWorkerPayout(request) != null ? '' : ' <span class="field-help" style="display:inline">(live — not yet locked)</span>'}</p>` : ''}
      ${hasPayment ? renderPricingAuditDetails(request) : ''}
      ${request.payment_intent_id ? `<hr class="details-divider">
      <p><strong>Payment status:</strong> ${paymentStatusLabel(request)}</p>
      ${request.auto_reversed_at ? `<p><strong>Auto-reversed:</strong> ${formatTimestamp(request.auto_reversed_at)} — service was not completed on the scheduled date.</p>` : ''}
      ${(CLOSED_STATUSES.includes(canonicalBookingStatus(request.status)) && request.payment_status === 'payment_release_failed') ? `
        <div class="admin-warning-banner">
          ⚠️ Payment hold could not be released automatically. Go to the Stripe dashboard and cancel this PaymentIntent manually.
          <div class="admin-button-row" style="margin-top:8px">
            <button class="button danger retry-release-hold" data-id="${escapeHtml(request.id)}" data-pi="${escapeHtml(request.payment_intent_id)}" type="button">Retry hold release</button>
          </div>
        </div>` : ''}
      ${(CLOSED_STATUSES.includes(canonicalBookingStatus(request.status)) && request.payment_status === 'authorized') ? `
        <div class="admin-warning-banner">
          ⚠️ This request was closed but the card authorization was not released. Release it now.
          <div class="admin-button-row" style="margin-top:8px">
            <button class="button danger retry-release-hold" data-id="${escapeHtml(request.id)}" data-pi="${escapeHtml(request.payment_intent_id)}" type="button">Release card hold</button>
          </div>
        </div>` : ''}` : ''}
      ${(request.payment_intent_id && request.payment_status === 'captured') ? `
        <div class="admin-button-row">
          <button class="button edit-total-charge-btn" data-request-id="${escapeHtml(request.id)}">
            Edit Total Charge
          </button>
        </div>
        <div class="edit-total-charge-panel" id="edit-total-panel-${escapeHtml(request.id)}" hidden></div>` : ''}
    </div>
  `;
}

function renderCompletedSummary(request) {
  const receiptTotals = receiptTotalsFromNotes(request);
  const fees = feeSummary(request, receiptTotals);
  const vehicle = [request.vehicle_year, request.vehicle_make, request.vehicle_model, request.vehicle_color].filter(Boolean).join(' ');
  const dateStr = request.service_date || formatTimestamp(request.updated_at || request.created_at);

  const feeRows = [
    receiptTotals.fuel  ? `<div class="summary-kv"><span>Fuel receipt</span><strong>${money(receiptTotals.fuel)}</strong></div>` : '',
    receiptTotals.wash  ? `<div class="summary-kv"><span>Wash receipt</span><strong>${money(receiptTotals.wash)}</strong></div>` : '',
    fees.fuel           ? `<div class="summary-kv"><span>Fuel service fee</span><strong>${money(fees.fuel)}</strong></div>` : '',
    fees.wash           ? `<div class="summary-kv"><span>Wash service fee</span><strong>${money(fees.wash)}</strong></div>` : '',
    fees.inspection     ? `<div class="summary-kv"><span>Add-ons fee</span><strong>${money(fees.inspection)}</strong></div>` : '',
    request.final_total != null
      ? `<div class="summary-kv summary-kv--total"><span>Final total</span><strong>${money(request.final_total)}</strong></div>`
      : '',
  ].filter(Boolean).join('');

  return `
    <div class="completed-summary-card">
      <div class="completed-summary-header">
        <div class="completed-summary-title">
          <strong>${escapeHtml(request.customer_name || 'Customer')}</strong>
          <span class="completed-summary-id field-help">${escapeHtml(String(request.id).slice(0, 8))}</span>
        </div>
        <span class="status-pill status-pill-complete">Completed</span>
      </div>
      <div class="completed-summary-cols">
        <div class="completed-summary-col">
          <p class="summary-section-label">Service</p>
          <p>${escapeHtml(adminFormatService(request))}</p>
          <p class="summary-section-label">Vehicle</p>
          <p>${escapeHtml(vehicle) || '—'}${request.license_plate ? ` · ${escapeHtml(request.license_plate)}` : ''}</p>
          <p class="summary-section-label">Address</p>
          <p>${escapeHtml(adminFormatAddress(request))}</p>
        </div>
        <div class="completed-summary-col">
          <p class="summary-section-label">Worker</p>
          <p>${escapeHtml(request.assigned_worker_name || '—')}</p>
          <p class="summary-section-label">Date</p>
          <p>${escapeHtml(dateStr)}</p>
          <p class="summary-section-label">Payment</p>
          <p>${paymentStatusLabel(request)}</p>
        </div>
        ${feeRows ? `<div class="completed-summary-col">${feeRows}</div>` : ''}
      </div>
      <div class="admin-button-row" style="margin-top:12px">
        <button class="button secondary edit-request" data-id="${escapeHtml(request.id)}" type="button">Edit</button>
      </div>
      ${renderEditPanel(request)}
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
        ${assignedPhone ? `<p class="field-help">Worker phone: ${escapeHtml(formatPhone(assignedPhone))}</p>` : '<p class="field-help">Assign a worker after accepting the request.</p>'}
        ${(assignedName && !selectedId) ? `<p class="field-help" style="color:#b35900">⚠ Assigned by name only — worker ID missing.</p>` : ''}
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
    const isComplete = canonicalBookingStatus(request.status) === 'completed';
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
  let nextAction = '';
  const hasReturnRequest = hasCustomerReturnRequestAlert(request);
  const cleanStatus = canonicalBookingStatus(request.status);

  if (hasReturnRequest && request.status !== 'canceled_return_completed') {
    nextAction = 'Customer requested return after service started. Review completed receipts before charging or waiving fees.';
    activePanel = renderReturnRequestPanel(request);
  } else if (cleanStatus === 'new') {
    nextAction = 'Review the request and accept it to begin service.';
    actions.push(primaryStatusButton(request, 'Assign / Accept', 'assigned'));
  } else if (cleanStatus === 'assigned') {
    nextAction = 'Worker assigned and waiting to start pickup.';
    actions.push(primaryStatusButton(request, 'Mark en route', 'en_route'));
  } else if (cleanStatus === 'en_route') {
    nextAction = 'Upload the pickup photo set below.';
    activePanel = renderPhotoPanel(request, 'pickup');
  } else if (cleanStatus === 'in_service') {
    nextAction = 'Vehicle is being serviced. Move to returning when service work is done.';
    if (serviceNeedsFuel(request) && !serviceDoneOrUnable(request, 'fuel')) {
      actions.push(primaryStatusButton(request, `Fuel - ${request.fuel_type || 'fuel type not listed'}`, 'in_service'));
      actions.push(serviceUnableButton(request, 'fuel'));
    }
    if (serviceNeedsWash(request) && !serviceDoneOrUnable(request, 'wash')) {
      actions.push(primaryStatusButton(request, `Car wash - ${request.wash_package_label || 'selected wash'}`, 'in_service'));
      actions.push(serviceUnableButton(request, 'wash'));
    }
    actions.push(primaryStatusButton(request, 'Service done - returning', 'returning'));
  } else if (cleanStatus === 'returning') {
    if (!request.return_parking_location) {
      nextAction = 'Record the return parking location after the vehicle is back.';
      activePanel = renderReturnLocationPanel(request);
    } else if (!/\[dropoff_time/.test(String(request.notes || ''))) {
      nextAction = 'Upload the return photo set below.';
      activePanel = renderPhotoPanel(request, 'dropoff');
    } else {
      nextAction = 'Confirm the saved totals, then capture the final payment automatically.';
      activePanel = renderCompletePanel(request);
    }
  } else if (request.status === 'fueling_complete') {
    nextAction = `Upload the fuel receipt and enter the fuel total for ${request.fuel_type || 'the selected fuel type'}.`;
    activePanel = renderReceiptPanel(request, 'fuel');
    actions.push(serviceUnableButton(request, 'fuel'));
  } else if (request.status === 'car_wash_complete') {
    nextAction = `Upload the car wash receipt and enter the total for ${request.wash_package_label || 'the selected wash'}.`;
    activePanel = renderReceiptPanel(request, 'wash');
    actions.push(serviceUnableButton(request, 'wash'));
  } else if (request.status === 'fuel_receipt_uploaded' && serviceNeedsWash(request) && !serviceDoneOrUnable(request, 'wash')) {
    nextAction = 'Complete the car wash service.';
    actions.push(primaryStatusButton(request, `Car wash - ${request.wash_package_label || 'selected wash'}`, 'car_wash_complete'));
    actions.push(serviceUnableButton(request, 'wash'));
  } else if (request.status === 'wash_receipt_uploaded' && serviceNeedsFuel(request) && !serviceDoneOrUnable(request, 'fuel')) {
    nextAction = 'Complete the fuel service.';
    actions.push(primaryStatusButton(request, `Fuel - ${request.fuel_type || 'fuel type not listed'}`, 'fueling_complete'));
    actions.push(serviceUnableButton(request, 'fuel'));
  } else if (request.status === 'receipts_recorded') {
    nextAction = 'Mark the vehicle as returned once it is back.';
    actions.push(primaryStatusButton(request, 'Returned', 'returned_location_pending'));
  } else if (request.status === 'returned_location_pending') {
    nextAction = 'Record the return parking location after the vehicle is back.';
    activePanel = renderReturnLocationPanel(request);
  } else if (request.status === 'return_location_recorded') {
    nextAction = 'Upload the return photo set.';
    actions.push(primaryStatusButton(request, 'Return photos', 'return_photos_needed'));
  } else if (request.status === 'return_photos_needed') {
    nextAction = 'Upload the return photo set below.';
    activePanel = renderPhotoPanel(request, 'dropoff');
  } else if (request.status === 'vehicle_returned') {
    if (request.quick_inspection) {
      nextAction = 'Complete inspection if selected, otherwise process final payment.';
      actions.push(primaryStatusButton(request, 'Vehicle inspection', 'inspection_needed'));
    } else {
      nextAction = 'Confirm the saved totals, then capture the final payment automatically.';
      activePanel = renderCompletePanel(request);
    }
  } else if (request.status === 'inspection_needed') {
      nextAction = 'Complete the vehicle inspection below.';
      activePanel = renderInspectionPanel(request);
  } else if (request.status === 'inspection_recorded') {
    nextAction = 'Confirm the saved totals, then capture the final payment automatically.';
    activePanel = renderCompletePanel(request);
  } else if (request.status === 'pending_customer_payment') {
    nextAction = 'Automatic payment capture failed. Waiting for the customer to update their payment method from the Request Tracker.';
    if (request.payment_status === 'captured') {
      actions.push(`<button class="button primary proceed-to-key-return" data-id="${request.id}" type="button">Proceed to key return (payment received)</button>`);
    }
  } else if (request.status === 'payment_issue' || request.status === 'authorization_too_low') {
    nextAction = 'Automatic payment capture failed. The customer has been shown an action-required payment update on their tracking page.';
    activePanel = renderPaymentIssuePanel(request);
  } else if (request.status === 'awaiting_key_return') {
    nextAction = 'Return the customer\'s keys and document who received them.';
    activePanel = renderKeysReturnedPanel(request);
  } else if (request.status === 'cancelled_pending_key_return') {
    const returnsVehicle = cancellationReturnsVehicle(request);
    nextAction = returnsVehicle
      ? 'Customer canceled after pickup. Confirm the vehicle was returned to close this request.'
      : 'Customer canceled after key handoff. Confirm the key was returned to close this request.';
    activePanel = renderCancellationReturnPanel(request, returnsVehicle);
  } else if (request.status === 'return_requested' || request.status === 'customer_return_requested') {
    nextAction = 'Decide whether to waive the fee, charge the $15 cancellation/service fee, or continue normal service.';
    activePanel = renderReturnRequestPanel(request);
  }

  const back = backButton(request);
  if (back) {
    actions.push(back);
  }
  actions.push(`<button class="button danger show-deny-reason" data-id="${escapeHtml(request.id)}" type="button">Deny</button>`);
  actions.push(`<button class="button secondary edit-request" data-id="${request.id}" type="button">Edit</button>`);

  return `
    <div class="guided-step">
      <p class="eyebrow">Current status</p>
      <h4>${escapeHtml(bookingStatusLabel(request.status))}</h4>
      ${nextAction ? `<p class="next-action-label"><strong>Next action:</strong> ${escapeHtml(nextAction)}</p>` : ''}
      <div class="admin-button-row">${actions.join('')}</div>
    </div>
    ${activePanel}
    ${renderDenyReasonPanel(request)}
    ${renderServiceUnablePanel(request)}
    ${renderEditPanel(request)}
  `;
}

// A canceled request needs a VEHICLE return (vs just a key) when the vehicle was
// picked up. Prefer the explicit fields; fall back to pickup evidence.
function cancellationReturnsVehicle(request) {
  if (request.vehicle_return_required === true) return true;
  if (request.key_return_required === true) return false;
  return Boolean(request.vehicle_picked_up_at) || /\[pickup_time/.test(String(request.notes || ''));
}

function renderLastKnownLocation(request) {
  const lat = Number(request.last_latitude);
  const lng = Number(request.last_longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return `<p class="field-help">No live location recorded for this request.</p>`;
  }
  const when = request.last_location_at
    ? new Date(request.last_location_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '';
  const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  return `
    <p class="field-help">Last known worker location${when ? ` (updated ${escapeHtml(when)})` : ''}:</p>
    <a class="button secondary" href="${url}" target="_blank" rel="noopener">Open last location in Google Maps</a>
  `;
}

function renderCancellationReturnPanel(request, returnsVehicle) {
  const item = returnsVehicle ? 'vehicle' : 'key';
  return `
    <div class="admin-edit-panel cancellation-return-panel">
      <h4>${returnsVehicle ? 'Vehicle' : 'Key'} return pending</h4>
      <p class="field-help">This canceled request stays open until the ${item} is back with the customer. Confirming closes it and stops live tracking.</p>
      ${renderLastKnownLocation(request)}
      <div class="admin-button-row">
        <button class="button primary admin-confirm-cancellation-return" data-id="${escapeHtml(request.id)}" data-return-type="${item}" type="button">
          Confirm ${item} returned &amp; close
        </button>
      </div>
      <p class="cancellation-return-error form-error"></p>
    </div>
  `;
}

async function confirmCancellationReturn(button) {
  const id = button.dataset.id;
  const item = button.dataset.returnType || 'key';
  const panel = button.closest('.cancellation-return-panel');
  const errEl = panel?.querySelector('.cancellation-return-error');
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Closing…';
  if (errEl) errEl.textContent = '';
  try {
    const res = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'worker_confirm_cancellation_return', request_id: id, caller_token: adminAuthToken() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Could not confirm the ${item} return.`);
    await loadRequests();
  } catch (err) {
    button.disabled = false;
    button.textContent = original;
    if (errEl) errEl.textContent = err.message || 'Something went wrong. Please try again.';
  }
}

document.addEventListener('click', (event) => {
  const btn = event.target.closest('.admin-confirm-cancellation-return');
  if (btn) {
    event.preventDefault();
    confirmCancellationReturn(btn);
  }
});

const DENY_REASON_OPTIONS = [
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

function denyReasonOptionsHtml() {
  return `<option value="">— Select a reason —</option>` +
    DENY_REASON_OPTIONS.map(r => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('');
}

function renderDenyReasonPanel(request) {
  return `
    <div class="deny-reason-panel" data-deny-for="${escapeHtml(request.id)}" hidden>
      <h4>Reason for denial</h4>
      <p class="field-help">Select why this request is being denied. This keeps the record clear for admin and tracking.</p>
      <label>
        Reason
        <select class="deny-reason-select">
          ${denyReasonOptionsHtml()}
        </select>
      </label>
      <label class="deny-reason-other-wrap" hidden>
        Describe the reason
        <textarea class="deny-reason-other" rows="2" placeholder="Describe the reason for denial."></textarea>
      </label>
      <div class="admin-button-row">
        <button class="button danger save-deny-reason" data-id="${escapeHtml(request.id)}" type="button">Deny request</button>
        <button class="button secondary cancel-deny-reason" type="button">Keep request open</button>
      </div>
      <p class="deny-reason-error form-error"></p>
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
        <select class="service-unable-reason">
          ${denyReasonOptionsHtml()}
        </select>
      </label>
      <label class="service-unable-other-wrap" hidden>
        Describe the reason
        <textarea class="service-unable-other" rows="2" placeholder="Describe the service issue."></textarea>
      </label>
      <label class="checkbox-label">
        <input class="service-unable-charge-fee" type="checkbox">
        <span>Charge the service fee anyway (e.g. work was attempted). No fuel/wash cost is ever charged when there's no receipt — leave unchecked to waive the fee entirely.</span>
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

  const suggested = frontPsi !== '' ? String(frontPsi) : '';
  const echoInit = suggested || '—';
  const tireRow = (label, cls) => `
    <div class="inspection-tire-row">
      <label>${label} — pressure set (PSI)
        <input class="${cls}" type="number" min="0" step="1" placeholder="${escapeHtml(suggested || '35')}">
      </label>
      <p class="field-help inspection-doorjamb-ref">Door-jamb target: <strong class="doorjamb-echo">${escapeHtml(echoInit)}</strong> PSI</p>
    </div>`;

  return `
    <div class="inspection-panel" data-inspection-for="${request.id}">
      <h4>Quick inspection details</h4>
      <p class="field-help">Confirm the door-jamb PSI, set each tire to it, and note any trouble code. Trouble-code explanations are starter guidance and should be confirmed against the vehicle's year, make, model, and engine.</p>
      <p class="field-help psi-guide-note">${escapeHtml(guideText.replace(/\s+/g, ' ').trim())}</p>
      <label>Confirm door-jamb PSI (read it off the driver-door sticker)
        <input class="inspection-doorjamb" type="number" min="0" step="1" value="${escapeHtml(suggested)}" placeholder="35">
      </label>
      ${tireRow('Driver front tire', 'inspection-tire-df')}
      ${tireRow('Passenger front tire', 'inspection-tire-pf')}
      ${tireRow('Passenger rear tire', 'inspection-tire-pr')}
      ${tireRow('Driver rear tire', 'inspection-tire-dr')}
      <label>Diagnosis code
        <input class="inspection-trouble-code" type="text" placeholder="Example: P0304">
      </label>
      <div class="trouble-code-output" aria-live="polite">
        <p class="field-help">Type a code to preview what the customer will see.</p>
      </div>
      <label class="checkbox-label">
        <input class="inspection-washer-fluid" type="checkbox">
        <span>Checked / filled windshield washer fluid</span>
      </label>
      <button class="button primary save-inspection" data-id="${request.id}" type="button">Save inspection details</button>
    </div>
  `;
}

function renderPhotoPanel(request, stage = 'pickup') {
  const isDropoff = stage === 'dropoff';
  const heading = isDropoff ? 'Upload return photos' : 'Upload pickup photos';
  const help = isDropoff
    ? 'Upload all four sides after return plus the return odometer and ending fuel gauge. Do not reuse the pickup photos.'
    : 'Upload all four sides at pickup plus the pickup odometer and pickup fuel gauge before moving the vehicle.';
  const nextStatus = isDropoff ? 'returning' : 'in_service';
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
        ${filePicker(`${isDropoff ? 'Ending' : 'Pickup'} fuel gauge photo`, 'photo-file required-photo', `data-photo-type="${isDropoff ? 'dropoff_fuel_gauge' : 'pickup_fuel_gauge'}"`)}
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
      : 'Upload each receipt and enter each total. The app adds the correct service totals.';

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
  const customerParking = [request.parking_location, request.parking_spot ? `spot ${request.parking_spot}` : ''].filter(Boolean).join(', ');
  const returnLocation = request.return_parking_location || customerParking;

  return `
    <div class="return-location-panel" data-return-for="${request.id}">
      <h4>Car Location</h4>
      <p class="field-help">Record exactly where the vehicle was left after service.</p>
      <div class="field-grid">
        <label>
          <input class="return-parking-location" type="text" value="${escapeHtml(returnLocation)}" placeholder="Example: Lot F, space F-19">
        </label>
      </div>
      <button class="button primary save-return-location" data-id="${request.id}" type="button">Save return location</button>
    </div>
  `;
}

function renderCompletePanel(request) {
  const receiptTotals = receiptTotalsFromNotes(request);
  const fees = feeSummary(request, receiptTotals);
  const expectedFinalTotal = finalTotalFromSavedReceipts(request, receiptTotals);
  const alreadyCaptured = request.payment_status === 'captured';
  const hasPi = !!request.payment_intent_id;

  let primaryBtn;
  if (alreadyCaptured) {
    primaryBtn = `<button class="button primary proceed-to-key-return" data-id="${request.id}" type="button">Complete request</button>`;
  } else if (hasPi) {
    primaryBtn = `<button class="button primary capture-and-proceed" data-id="${request.id}" type="button">Capture payment &amp; complete</button>`;
  } else {
    primaryBtn = `<button class="button primary proceed-to-key-return" data-id="${request.id}" type="button">Complete request (no payment)</button>`;
  }

  return `
    <div class="complete-panel" data-complete-for="${request.id}">
      <h4>Confirm before ${hasPi && !alreadyCaptured ? 'capturing payment' : 'completing'}</h4>
      <p class="field-help">Confirm these totals are correct before ${hasPi && !alreadyCaptured ? 'capturing the payment' : 'completing the request'}.</p>
      <div class="request-details">
        ${serviceNeedsFuel(request) ? `<p><strong>Fuel:</strong> ${money(receiptTotals.fuel)} receipt + ${money(fees.fuel)} service.</p>` : ''}
        ${serviceNeedsWash(request) ? `<p><strong>Car wash:</strong> ${money(receiptTotals.wash)} receipt + ${money(fees.wash)} service.</p>` : ''}
        ${request.quick_inspection ? `<p><strong>Vehicle add-ons:</strong> ${money(fees.inspection)}</p>` : ''}
        <p><strong>Final total currently saved:</strong> ${request.final_total == null ? 'Not recorded' : money(request.final_total)}</p>
        <p><strong>Expected total from saved receipts:</strong> ${money(expectedFinalTotal)}</p>
        ${request.return_parking_location ? `<p><strong>Return location:</strong> ${escapeHtml(request.return_parking_location)}</p>` : ''}
        ${alreadyCaptured ? `<p class="field-help" style="color:#1a7a3a">✓ Payment already captured.</p>` : ''}
      </div>
      <label class="checkbox-label">
        <input class="confirm-complete-totals" type="checkbox">
        <span>I confirm the saved receipt totals and service totals are correct.</span>
      </label>
      <div class="admin-button-row">
        ${primaryBtn}
        ${serviceNeedsFuel(request) ? `<button class="button secondary show-total-edit" data-id="${request.id}" data-edit-total="fuel" type="button">Fuel Incorrect</button>` : ''}
        ${serviceNeedsWash(request) ? `<button class="button secondary show-total-edit" data-id="${request.id}" data-edit-total="wash" type="button">Car Wash Incorrect</button>` : ''}
      </div>
      <p class="field-help">Editing a total requires you to confirm the totals again before proceeding.</p>
      <div class="total-edit-panel" data-total-edit-for="${request.id}" hidden></div>
    </div>
  `;
}

function renderPaymentIssuePanel(request) {
  const finalTotal = request.final_total != null ? money(request.final_total) : 'Not recorded';
  return `
    <div class="return-request-banner" data-payment-issue-for="${escapeHtml(request.id)}">
      <h4>⚡ Automatic payment capture failed</h4>
      <p class="field-help">Final total: ${finalTotal}. The customer has automatically been shown an action-required payment update on their tracking page.</p>
      <div class="admin-button-row">
        ${request.payment_intent_id ? `<button class="button primary retry-payment-capture" data-id="${escapeHtml(request.id)}" type="button">Retry payment capture</button>` : ''}
        <button class="button secondary send-to-customer-payment" data-id="${escapeHtml(request.id)}" type="button">Send to Customer for Payment</button>
      </div>
      <p class="payment-issue-status form-status"></p>
    </div>
  `;
}

function renderKeysReturnedPanel(request) {
  const customerName = escapeHtml(request.customer_name || 'Customer');
  return `
    <div class="keys-returned-panel" data-keys-for="${escapeHtml(request.id)}">
      <h4>Keys returned</h4>
      <p class="field-help">Document who the customer's keys were returned to.</p>
      <label>
        Keys returned to
        <select class="key-returned-to-type">
          <option value="">Select recipient</option>
          <option value="customer">Customer — ${customerName}</option>
          <option value="other">Other person or location</option>
        </select>
      </label>
      <label class="key-returned-other-wrap" hidden>
        Person or location
        <input class="key-returned-other-name" type="text" placeholder="e.g. Security desk, Front desk, Ashley Smith">
      </label>
      <div class="admin-button-row">
        <button class="button primary admin-submit-keys-returned" data-id="${escapeHtml(request.id)}" type="button">Keys returned</button>
      </div>
      <p class="keys-returned-status form-status"></p>
    </div>
  `;
}

function renderReturnRequestPanel(request) {
  const requestedAt = request.return_requested_at
    ? new Date(request.return_requested_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
    : '';
  const charge = returnRequestChargeSummary(request);
  const receiptLine = charge.hasReceipts
    ? `Completed receipts: fuel ${money(charge.fuel)}, car wash ${money(charge.wash)}.`
    : 'No completed receipts recorded yet.';
  const chargeSummary = `
      <div class="return-charge-summary">
        <p><strong>Charge amount if approved:</strong> ${money(charge.total)}</p>
        <p class="field-help">${receiptLine} Includes ${money(charge.cancellationFee)} cancellation/service fee, ${money(charge.recovery)} payment/operating recovery, rounded up to the nearest whole dollar.</p>
      </div>`;
  return `
    <div class="return-request-banner">
      <h4>⚠ Customer requested vehicle return.</h4>
      <p class="field-help">${requestedAt ? `Requested ${escapeHtml(requestedAt)}. ` : ''}Review service progress, completed receipts, and fees before closing.</p>
      ${chargeSummary}
      <div class="admin-button-row">
        <button class="button secondary waive-return-fee" data-id="${escapeHtml(request.id)}" type="button">Waive fee &amp; release hold</button>
        <button class="button primary charge-return-fee" data-id="${escapeHtml(request.id)}" type="button">Charge ${money(charge.total)} cancellation/service amount</button>
        <button class="button secondary continue-return-service" data-id="${escapeHtml(request.id)}" type="button">Continue normal service</button>
      </div>
      <p class="return-request-status form-status"></p>
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
          <input class="edit-customer-phone" type="tel" value="${escapeHtml(formatPhone(request.customer_phone || ''))}">
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
        <label>Car location
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
        ${canReopen ? `<button class="button secondary update-status" data-id="${request.id}" data-status="assigned" type="button">Reopen as assigned</button>` : ''}
      </div>
      <p class="edit-save-status field-help" data-status-for="${request.id}"></p>
    </div>
  `;
}

function updateDashboardStatCards() {
  const openCount = getFilteredRequests(allRequests, 'open').length;
  const inProgressCount = getFilteredRequests(allRequests, 'in_progress').length;
  const completedCount = getFilteredRequests(allRequests, 'completed_today').length;
  const activeWorkerCount = allEmployees.filter((e) => e.active).length;
  // Company NET for the active range — the same formula as the Payroll tab so the
  // tile and Payroll agree (service fees + cancellation fees − worker payouts).
  const { companyNet } = companyNetBreakdown((r) => isInDashboardRange(r, dashboardRange));

  const rangeLabel = dashboardRangeLabel(dashboardRange);
  if (statCompletedLabel) statCompletedLabel.textContent = 'Completed Today';
  if (statRevenueLabel) statRevenueLabel.textContent = `Company Net ${rangeLabel}`;

  if (statOpenRequests) statOpenRequests.textContent = openCount;
  if (statInProgress) statInProgress.textContent = inProgressCount;
  if (statCompletedToday) statCompletedToday.textContent = completedCount;
  if (statActiveWorkers) statActiveWorkers.textContent = activeWorkerCount;
  if (statNetRevenue) statNetRevenue.textContent = money(companyNet);
  // Worker Snapshot — derive live presence from the heartbeat (last_seen_at +
  // presence_status) plus current job assignments. A worker counts as "live"
  // only if they pinged within the freshness window; otherwise they age out to
  // Offline. Counts are mutually exclusive and sum to the active-worker count.
  const PRESENCE_FRESH_MS = 2 * 60 * 1000;
  const nowMs = Date.now();
  const activeEmployees = allEmployees.filter((e) => e.active);
  const isLive = (e) => e.last_seen_at && (nowMs - new Date(e.last_seen_at).getTime()) < PRESENCE_FRESH_MS;
  const busyWorkerKeys = new Set(
    allRequests
      .filter((r) => isOpen(r) && (r.assigned_employee_id || r.assigned_worker_name))
      .flatMap((r) => [r.assigned_employee_id, r.assigned_worker_name].filter(Boolean))
  );
  const isBusy = (e) => busyWorkerKeys.has(e.id) || busyWorkerKeys.has(e.full_name);

  const liveEmployees = activeEmployees.filter(isLive);
  const onBreakCount = liveEmployees.filter((e) => e.presence_status === 'on_break').length;
  const busyCount = liveEmployees.filter((e) => e.presence_status !== 'on_break' && isBusy(e)).length;
  const onlineCount = liveEmployees.filter((e) => e.presence_status !== 'on_break' && !isBusy(e)).length;
  const offlineCount = Math.max(0, activeEmployees.length - liveEmployees.length);

  if (workerSnapshotOnline) workerSnapshotOnline.textContent = onlineCount;
  if (workerSnapshotOnBreak) workerSnapshotOnBreak.textContent = onBreakCount;
  if (workerSnapshotBusy) workerSnapshotBusy.textContent = busyCount;
  if (workerSnapshotOffline) workerSnapshotOffline.textContent = offlineCount;
}

function matchesQueueFilters(request) {
  // Service type
  if (queueFilters.serviceType && request.service_type !== queueFilters.serviceType) return false;

  // Specific status
  if (queueFilters.status && request.status !== queueFilters.status) return false;

  // Worker (specific worker, or unassigned)
  if (queueFilters.worker) {
    const assigned = Boolean(request.assigned_employee_id || request.assigned_worker_name);
    if (queueFilters.worker === '__unassigned') {
      if (assigned) return false;
    } else {
      const emp = allEmployees.find((e) => e.id === queueFilters.worker);
      const matchById = request.assigned_employee_id === queueFilters.worker;
      const matchByName = emp && request.assigned_worker_name === emp.full_name;
      if (!matchById && !matchByName) return false;
    }
  }

  // Payment status
  if (queueFilters.payment) {
    const ps = request.payment_status || 'not_started';
    if (queueFilters.payment === 'attention') {
      if (!['payment_release_failed', 'capture_failed'].includes(ps)) return false;
    } else if (ps !== queueFilters.payment) {
      return false;
    }
  }

  // Free-text search across name / email / phone / plate / vehicle / ticket id
  if (queueFilters.search) {
    const q = queueFilters.search.trim().toLowerCase();
    const digits = q.replace(/[^0-9]/g, '');
    const hay = [
      request.customer_name, request.customer_email, request.license_plate,
      request.vehicle_make, request.vehicle_model, request.service_label, request.id,
    ].filter(Boolean).join(' ').toLowerCase();
    const phoneDigits = String(request.customer_phone || '').replace(/[^0-9]/g, '');
    const textMatch = hay.includes(q);
    const phoneMatch = digits.length >= 3 && phoneDigits.includes(digits);
    if (!textMatch && !phoneMatch) return false;
  }

  return true;
}

function sortFilteredRequests(list) {
  const by = queueFilters.sort || 'newest';
  return list.slice().sort((a, b) => {
    if (by === 'name') {
      return String(a.customer_name || '').localeCompare(String(b.customer_name || ''));
    }
    if (by === 'service-date') {
      // Soonest service date first; rows with no date sink to the bottom.
      const ad = a.service_date || '9999-12-31';
      const bd = b.service_date || '9999-12-31';
      return ad.localeCompare(bd);
    }
    const at = new Date(a.created_at || 0).getTime();
    const bt = new Date(b.created_at || 0).getTime();
    return by === 'oldest' ? at - bt : bt - at;
  });
}

function renderRequests() {
  const filtered = allRequests.filter((request) => {
    if (!matchesQueueFilters(request)) return false;
    // The date range is a global filter — it applies to EVERY view (All, Open,
    // In Progress, Completed, Closed). "All time" shows everything.
    if (!isInDashboardRange(request, dashboardRange)) return false;
    // A specific status filter is authoritative — it overrides the bucket tab so
    // e.g. "Complete" still shows even while the Open view is active.
    if (queueFilters.status) return true;
    if (currentView === 'all') return true;
    if (currentView === 'open') return OPEN_REQUEST_STATUSES.includes(canonicalBookingStatus(request.status));
    if (currentView === 'in_progress') return IN_PROGRESS_REQUEST_STATUSES.includes(canonicalBookingStatus(request.status));
    if (currentView === 'completed_today') return canonicalBookingStatus(request.status) === 'completed' && isToday(request.completed_at);
    if (currentView === 'cancelled') return canonicalBookingStatus(request.status) === 'cancelled';
    return true;
  });

  const sortedFiltered = sortFilteredRequests(filtered);

  // Bucket-tab counts are scoped to the active date range so they match the list.
  const inRange = allRequests.filter((r) => isInDashboardRange(r, dashboardRange));
  const allCount = inRange.length;
  const openCount = getFilteredRequests(inRange, 'open').length;
  const inProgressCount = getFilteredRequests(inRange, 'in_progress').length;
  const completeCount = getFilteredRequests(allRequests, 'completed_today').length;
  const closedCount = getFilteredRequests(inRange, 'cancelled').length;

  if (allRequestsCountEl) allRequestsCountEl.textContent = allCount;
  if (openRequests) openRequests.textContent = openCount;
  if (inProgressRequestsCountEl) inProgressRequestsCountEl.textContent = inProgressCount;
  if (completeRequests) completeRequests.textContent = completeCount;
  if (deniedRequests) deniedRequests.textContent = closedCount;

  // Hero "Completed all-time" stays all-time regardless of the date range.
  if (adminCompletedCount) adminCompletedCount.textContent = allRequests.filter((r) => canonicalBookingStatus(r.status) === 'completed').length;

  updateDashboardStatCards();

  // Update heading and show-all button
  const headings = { all: 'All requests', open: 'Open requests', in_progress: 'In progress requests', completed_today: 'Completed today', cancelled: 'Cancelled requests' };
  if (requestQueueHeading) requestQueueHeading.textContent = headings[currentView] || 'Requests';
  if (requestQueueEyebrow) requestQueueEyebrow.textContent = (currentView === 'completed_today' || currentView === 'cancelled') ? 'History' : 'Queue';

  // The date range dropdown ("All time" shows everything) replaces the old
  // standalone "Show all time" button.
  if (showAllTimeBtn) showAllTimeBtn.style.display = 'none';

  // Summary card active state
  [showAll, showOpen, showInProgress, showComplete, showDenied].forEach((btn) => btn?.classList.remove('active'));
  if (currentView === 'all') showAll?.classList.add('active');
  if (currentView === 'open') showOpen?.classList.add('active');
  if (currentView === 'in_progress') showInProgress?.classList.add('active');
  if (currentView === 'completed_today') showComplete?.classList.add('active');
  if (currentView === 'cancelled') showDenied?.classList.add('active');

  if (sortedFiltered.length === 0) {
    const hasActiveFilters = Boolean(queueFilters.search || queueFilters.serviceType || queueFilters.worker || queueFilters.payment);
    const msg = hasActiveFilters
      ? '<div class="empty-state"><p>No requests match your filters. <button class="button secondary inline-clear-filters" type="button">Clear filters</button></p></div>'
      : (dashboardRange !== 'all')
        ? `<div class="empty-state"><p>No requests in <strong>${escapeHtml(dashboardRangeLabel(dashboardRange))}</strong>. <button class="button secondary inline-range-all" type="button">Show all time</button></p></div>`
        : '<div class="empty-state"><p>No requests in this view.</p></div>';
    requestList.innerHTML = msg;
    return;
  }

  requestList.innerHTML = `
    <table class="admin-requests-table">
      <thead>
        <tr>
          <th>Customer</th>
          <th>Service Type</th>
          <th>Status</th>
          <th>Worker</th>
          <th>Date &amp; Time</th>
          <th>Next Action</th>
        </tr>
      </thead>
      <tbody>
        ${sortedFiltered.map((request) => {
          const bucket = queueStatusBucket(request);
          const isExpanded = expandedRequestId === request.id;
          const isSummaryExpanded = expandedSummaryId === request.id;
          const isCompleted = bucket.label === 'Completed';
          const actionBtnClass = isCompleted ? 'queue-summary-toggle' : 'queue-row-toggle';
          const rows = [`
            <tr class="queue-row${isExpanded || isSummaryExpanded ? ' is-expanded' : ''}" data-request-id="${request.id}">
              <td data-label="Customer">
                <div class="queue-customer-cell">
                  <span class="queue-avatar">${escapeHtml(queueInitials(request.customer_name))}</span>
                  <div>
                    <strong>${escapeHtml(request.customer_name || 'Customer')}</strong>
                    <span class="field-help">${escapeHtml(request.customer_email || '')}</span>
                  </div>
                </div>
              </td>
              <td data-label="Service">${escapeHtml(queueServiceLabel(request))}</td>
              <td data-label="Status"><span class="status-pill ${bucket.cls}">${escapeHtml(bucket.label)}</span></td>
              <td data-label="Worker">${request.assigned_worker_name ? escapeHtml(request.assigned_worker_name) : '<span class="field-help">Unassigned</span>'}</td>
              <td data-label="Date">${queueDateTime(request)}</td>
              <td data-label="Action">
                <div class="queue-next-action-cell">
                  <button class="button secondary ${actionBtnClass}" data-id="${request.id}" type="button">${queueNextActionLabel(bucket)}</button>
                  <button class="queue-row-kebab queue-row-toggle" data-id="${request.id}" type="button" aria-label="More">&#8942;</button>
                </div>
              </td>
            </tr>
          `];
          if (isExpanded) {
            rows.push(`
              <tr class="queue-row-detail">
                <td colspan="6">
                  <article class="request-card" data-request-id="${request.id}">
                    <div class="request-card-header">
                      <div>
                        <p class="eyebrow">${escapeHtml(request.id)}</p>
                        <h3>${escapeHtml(request.customer_name || 'Customer')}</h3>
                      </div>
                      <span class="status-pill">${escapeHtml(bookingStatusLabel(request.status))}</span>
                    </div>
                    ${requestCardDetails(request)}
                    ${renderWorkerAssignment(request)}
                    ${renderActions(request)}
                  </article>
                </td>
              </tr>
            `);
          }
          if (isSummaryExpanded) {
            rows.push(`
              <tr class="queue-row-summary">
                <td colspan="6">
                  ${renderCompletedSummary(request)}
                </td>
              </tr>
            `);
          }
          return rows.join('');
        }).join('')}
      </tbody>
    </table>
  `;
}

async function ensureEmployee(fullName) {
  const codePrefix = fullName.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'WORKER';
  const employeeCode = `EMP-${codePrefix}`;
  const { data, error } = await db.rpc('admin_list_employees', { p_token: adminAuthToken() });

  if (error) throw error;

  const existing = (data || []).find((employee) => employee.full_name === fullName);

  if (existing) {
    // Re-activate if they were accidentally deactivated.
    if (!existing.active) {
      console.warn(`ensureEmployee: "${fullName}" (${existing.id}) was inactive — re-activating.`);
      const { error } = await db.rpc('admin_update_employee', {
        p_token: adminAuthToken(),
        p_employee_id: existing.id,
        p_data: { active: true, profile_updated_at: new Date().toISOString() },
      });
      if (error) throw error;
    }
    return;
  }

  const { error: insertError } = await db.rpc('admin_insert_employee', {
    p_token: adminAuthToken(),
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
    last_seen_at: employee.last_seen_at || null,
    presence_status: employee.presence_status || 'offline',
    background_verified: employee.background_verified === true,
    stripe_connect_account_id: employee.stripe_connect_account_id || '',
    stripe_connect_ready: employee.stripe_connect_ready === true,
    stripe_card_id: employee.stripe_card_id || '',
    stripe_card_last4: employee.stripe_card_last4 || '',
    stripe_card_status: employee.stripe_card_status || '',
    stripe_phys_card_id: employee.stripe_phys_card_id || '',
    stripe_phys_card_last4: employee.stripe_phys_card_last4 || '',
    stripe_phys_card_status: employee.stripe_phys_card_status || '',
  };
}

async function loadEmployees() {
  try {
    // Worker profiles (incl. email/phone) load through a token-gated RPC so that
    // worker contact PII is never readable via the public anon key / the
    // employees_public view. See admin_list_employees + migration 202606271820.
    let { data, error } = await db.rpc('admin_list_employees', { p_token: adminAuthToken() });

    if (error) throw error;

    allEmployees = (data || []).map(normalizeEmployee);

    if (selectedScheduleEmployeeId && !allEmployees.some((e) => e.id === selectedScheduleEmployeeId)) {
      console.warn(`Worker ID ${selectedScheduleEmployeeId} not found in employees table. Clearing selection.`);
      selectedScheduleEmployeeId = '';
    }

    if (workerCountBadge) workerCountBadge.textContent = allEmployees.filter((e) => e.active).length;
    renderWorkerSelect();
    renderWorkerProfiles();
    loadAdminChangeRequests();
    populateFilterWorkers();
    updateDashboardStatCards();
  } catch (error) {
    console.error('Could not load employees:', error);
    allEmployees = [];
    renderWorkerSelect();
    renderWorkerProfiles();
    if (workerScheduleStatus) {
      workerScheduleStatus.textContent = `Could not load workers: ${error.message || error}. Refresh to try again.`;
    }
  }
}

// Live presence for a worker, using the SAME rules as the Worker Snapshot
// counts: fresh heartbeat → on_break / busy (has an open assigned job) / online;
// stale or no heartbeat → offline. Only meaningful for active workers.
const WORKER_PRESENCE_FRESH_MS = 2 * 60 * 1000;
const WORKER_PRESENCE_LABELS = { online: 'Online', on_break: 'On Break', busy: 'Busy', offline: 'Offline' };
let workerPresenceFilter = null; // null = show all

function workerBusyKeys() {
  return new Set(
    allRequests
      .filter((r) => isOpen(r) && (r.assigned_employee_id || r.assigned_worker_name))
      .flatMap((r) => [r.assigned_employee_id, r.assigned_worker_name].filter(Boolean))
  );
}

function workerPresenceCategory(employee, busyKeys) {
  const keys = busyKeys || workerBusyKeys();
  const live = employee.last_seen_at
    && (Date.now() - new Date(employee.last_seen_at).getTime()) < WORKER_PRESENCE_FRESH_MS;
  if (!live) return 'offline';
  if (employee.presence_status === 'on_break') return 'on_break';
  if (keys.has(employee.id) || keys.has(employee.full_name)) return 'busy';
  return 'online';
}

// ── Worker change requests (admin approval queue, in the Workers tab) ─────────
async function loadAdminChangeRequests() {
  const container = document.querySelector('#admin-change-requests');
  if (!container) return;
  const { data, error } = await db.rpc('admin_list_change_requests', { p_token: adminAuthToken(), p_status: null });
  if (error) {
    if (!/does not exist/i.test(error.message || '')) {
      console.warn('Could not load change requests:', error);
    }
    container.innerHTML = '';
    pendingChangeRequestCount = 0;
    if (typeof renderActionNeeded === 'function') renderActionNeeded();
    return;
  }
  renderAdminChangeRequests(data || []);
}

function adminChangeStatusBadge(status) {
  const cls = { pending: 'is-pending', approved: 'is-approved', rejected: 'is-rejected' }[status] || '';
  const label = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' }[status] || status;
  return `<span class="wcr-badge ${cls}">${escapeHtml(label)}</span>`;
}

function renderAdminChangeRequests(requests) {
  const container = document.querySelector('#admin-change-requests');
  adminChangeRequestsList = requests;
  const pending = requests.filter((r) => r.status === 'pending');
  // Keep the dashboard "Needs your attention" badge in sync with the queue.
  pendingChangeRequestCount = pending.length;
  if (typeof renderActionNeeded === 'function') renderActionNeeded();
  if (!container) return;
  if (!requests.length) { container.innerHTML = ''; return; }
  container.innerHTML = `
    <div class="admin-change-requests-card">
      <div class="worker-card-heading">
        <h3>Change requests${pending.length ? ` <span class="acr-count">${pending.length} pending</span>` : ''}</h3>
      </div>
      <div class="acr-list">
        ${requests.map((r) => renderAdminChangeRequestRow(r)).join('')}
      </div>
    </div>`;
}

function renderAdminChangeRequestRow(r) {
  const when = r.created_at ? new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
  const kindLabel = r.kind === 'job' ? 'Job change' : 'Schedule change';
  const sub = r.requested_changes && r.requested_changes.type
    ? ` · ${escapeHtml(String(r.requested_changes.type).replace(/_/g, ' '))}` : '';
  const jobCtx = r.kind === 'job' && r.customer_name
    ? `<p class="acr-ctx">${escapeHtml(r.customer_name)}${r.service_label ? ` · ${escapeHtml(r.service_label)}` : ''}${r.service_date ? ` · ${escapeHtml(r.service_date)}` : ''}${r.desired_return_time ? ` · back by ${escapeHtml(String(r.desired_return_time).slice(0, 5))}` : ''}</p>`
    : '';
  const isPending = r.status === 'pending';
  return `
    <div class="acr-item" data-request-id="${escapeHtml(r.id)}">
      <div class="acr-item-head">
        <div>
          <strong>${escapeHtml(r.employee_name || 'Worker')}</strong>
          <span class="acr-kind">${escapeHtml(kindLabel)}${sub}</span>
        </div>
        ${adminChangeStatusBadge(r.status)}
      </div>
      ${jobCtx}
      ${r.details ? `<p class="acr-details">${escapeHtml(r.details)}</p>` : ''}
      ${r.admin_note ? `<p class="acr-note"><strong>Note:</strong> ${escapeHtml(r.admin_note)}</p>` : ''}
      <p class="acr-meta">${escapeHtml(when)}</p>
      ${isPending ? `
        <div class="acr-actions">
          <input type="text" class="acr-note-input" placeholder="Optional note to the worker">
          <button class="button primary acr-approve" data-id="${escapeHtml(r.id)}" type="button">Approve</button>
          <button class="button danger acr-reject" data-id="${escapeHtml(r.id)}" type="button">Reject</button>
        </div>` : ''}
    </div>`;
}

async function resolveAdminChangeRequest(id, status, note) {
  const { error } = await db.rpc('admin_resolve_change_request', {
    p_token: adminAuthToken(),
    p_request_id: id,
    p_status: status,
    p_admin_note: note || null,
  });
  if (error) throw error;
  await loadAdminChangeRequests();
}

document.querySelector('#admin-change-requests')?.addEventListener('click', async (event) => {
  const approve = event.target.closest('.acr-approve');
  const reject = event.target.closest('.acr-reject');
  const btn = approve || reject;
  if (!btn) return;
  const item = btn.closest('.acr-item');
  let note = item?.querySelector('.acr-note-input')?.value.trim() || '';
  btn.disabled = true;
  try {
    // Auto-apply: approving a dated time-off request marks that day off for the
    // worker. Fail-soft — if the RPC isn't deployed, the approval still proceeds.
    if (approve) {
      const req = adminChangeRequestsList.find((x) => x.id === btn.dataset.id);
      const rc = req?.requested_changes || {};
      if (req?.kind === 'schedule' && rc.type === 'time_off' && rc.date) {
        const { error: dayErr } = await db.rpc('admin_add_day_off', {
          p_token: adminAuthToken(), p_employee_id: req.employee_id, p_day: rc.date,
        });
        if (dayErr) console.warn('Auto-apply day off failed:', dayErr);
        else note = note ? `${note} (Day off ${rc.date} applied.)` : `Day off ${rc.date} applied.`;
      }
    }
    await resolveAdminChangeRequest(btn.dataset.id, approve ? 'approved' : 'rejected', note);
  } catch (err) {
    console.error('Could not resolve change request:', err);
    alert(`Could not update the request: ${err.message || 'try again.'}`);
    btn.disabled = false;
  }
});

function renderWorkerProfiles() {
  if (!workerProfileList) return;

  if (!allEmployees.length) {
    workerProfileList.innerHTML = '<div class="empty-state"><p>No workers found. Run supabase-operational-upgrades.sql in Supabase.</p></div>';
    return;
  }

  let employees = allEmployees;
  let banner = '';
  if (workerPresenceFilter) {
    const busyKeys = workerBusyKeys();
    employees = allEmployees.filter((e) => e.active && workerPresenceCategory(e, busyKeys) === workerPresenceFilter);
    banner = `
      <div class="worker-filter-banner">
        <span>Showing <strong>${WORKER_PRESENCE_LABELS[workerPresenceFilter]}</strong> workers (${employees.length})</span>
        <button class="button secondary worker-filter-clear" type="button">Show all</button>
      </div>`;
  }

  if (!employees.length) {
    workerProfileList.innerHTML = `${banner}<div class="empty-state"><p>No ${WORKER_PRESENCE_LABELS[workerPresenceFilter] || ''} workers right now.</p></div>`;
    return;
  }

  workerProfileList.innerHTML = `
    ${banner}
    <table class="admin-requests-table">
      <thead>
        <tr><th>Name</th><th>Employee ID</th><th>Phone</th><th>Status</th><th></th></tr>
      </thead>
      <tbody>
        ${employees.map((employee) => renderWorkerProfileRow(employee)).join('')}
      </tbody>
    </table>
  `;
  collapseWorkerSectionsForMobile();
  wireAdminPhotoEditor();
}

function collapseWorkerSectionsForMobile() {
  if (!window.matchMedia('(max-width: 760px)').matches) return;
  workerProfileList?.querySelectorAll('.admin-worker-mobile-section').forEach((section) => {
    section.open = section.classList.contains('admin-worker-profile-section');
  });
}

function renderWorkerProfileRow(employee) {
  const isExpanded = selectedScheduleEmployeeId === employee.id;
  const statusLabel = employee.active ? 'Active' : 'Inactive';
  const rowStatusClass = employee.active ? 'status-pill-complete' : 'status-pill-denied';
  const rows = [`
    <tr class="queue-row${isExpanded ? ' is-expanded' : ''}" data-worker-id="${escapeHtml(employee.id)}">
      <td data-label="Name"><strong>${escapeHtml(employee.full_name || '')}</strong>${employee.username ? `<div class="field-help">@${escapeHtml(employee.username)}</div>` : ''}</td>
      <td data-label="Employee ID">${escapeHtml(employee.employee_code || '')}</td>
      <td data-label="Phone">${employee.phone ? escapeHtml(formatPhone(employee.phone)) : '<span class="field-help">Not provided</span>'}</td>
      <td data-label="Status"><span class="status-pill ${rowStatusClass}">${escapeHtml(statusLabel)}</span></td>
      <td data-label="Action">
        <div class="queue-next-action-cell">
          <button class="button secondary worker-row-toggle" data-id="${escapeHtml(employee.id)}" type="button">${isExpanded ? 'Close' : 'Edit'}</button>
        </div>
      </td>
    </tr>
  `];
  if (isExpanded) {
    rows.push(`<tr class="queue-row-detail"><td colspan="5">${renderWorkerProfileCard(employee)}</td></tr>`);
  }
  return rows.join('');
}

function renderWorkerProfileCard(employee) {
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

  return `
    <article class="request-card worker-profile-card" data-worker-id="${escapeHtml(employee.id)}">
      <div class="request-card-header">
        <div>
          <p class="eyebrow">Worker profile</p>
          <h3>${escapeHtml(employee.full_name)}</h3>
          <span class="${statusClass}">${statusLabel}</span>
          <p class="field-help" style="margin-top:6px">
            Worker ID (constant): <code>${escapeHtml(employee.id)}</code><br>
            Login username: ${employee.username ? `<strong>@${escapeHtml(employee.username)}</strong>` : '<em>not set — worker logs in by phone</em>'}
          </p>
        </div>
      </div>

      <details class="admin-worker-mobile-section admin-worker-profile-section" open>
        <summary>Profile</summary>
        <div class="admin-worker-mobile-section-body">
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
          <input class="admin-worker-phone" type="tel" value="${escapeHtml(formatPhone(employee.phone || ''))}">
        </label>
        <label>Email
          <input class="admin-worker-email" type="email" value="${escapeHtml(employee.email || '')}">
        </label>
        <label>Started
          <input class="admin-worker-started" type="date" value="${escapeHtml(employee.started_at || '')}">
        </label>
        <label>Time pay rate ($/min)
          <input class="admin-worker-time-rate" type="number" step="0.01" min="0" placeholder="$${adminCompanyTimeRatePerMin.toFixed(2)} (company rate)" value="${employee.time_rate_per_min != null ? Number(employee.time_rate_per_min) : ''}">
          <span class="field-help">Currently earns <strong>$${(employee.time_rate_per_min != null ? Number(employee.time_rate_per_min) : adminCompanyTimeRatePerMin).toFixed(2)}/min</strong>${employee.time_rate_per_min != null ? '' : ' (company rate)'}</span>
        </label>
      </div>
      <div class="admin-button-row">
        <button class="button primary save-worker-profile" data-id="${escapeHtml(employee.id)}" type="button" ${isLocal ? 'disabled' : ''}>Save worker profile</button>
        <button class="button secondary reset-worker-password" data-id="${escapeHtml(employee.id)}" type="button" ${isLocal ? 'disabled' : ''}>Create new portal password</button>
        <button class="button secondary toggle-worker-verified" data-id="${escapeHtml(employee.id)}" data-verified="${employee.background_verified ? '1' : '0'}" type="button" ${isLocal ? 'disabled' : ''}>${employee.background_verified ? 'Remove verification' : 'Mark background-verified (override)'}</button>
        ${employee.active
          ? `<button class="button danger deactivate-worker-profile" data-id="${escapeHtml(employee.id)}" type="button" ${isLocal ? 'disabled' : ''}>Deactivate worker</button>`
          : `<button class="button primary reactivate-worker-profile" data-id="${escapeHtml(employee.id)}" type="button" ${isLocal ? 'disabled' : ''}>Reactivate worker</button>
             <button class="button danger permanently-delete-worker" data-id="${escapeHtml(employee.id)}" type="button" ${isLocal ? 'disabled' : ''}>Permanently delete worker</button>`
        }
      </div>
      <p class="field-help admin-worker-status">${isLocal ? 'Run the Supabase worker upgrade before saving this worker.' : ''}</p>
        </div>
      </details>

      <details class="admin-worker-mobile-section" open>
        <summary>Payouts &amp; fuel card</summary>
        <div class="admin-worker-mobile-section-body admin-stripe-block" data-worker-id="${escapeHtml(employee.id)}">
        <div class="admin-stripe-row">
          <div class="admin-stripe-info">
            <strong>Direct deposit (Stripe Connect)</strong>
            <p class="field-help">${employee.stripe_connect_ready
              ? 'Onboarded — ready to receive payouts.'
              : employee.stripe_connect_account_id
                ? 'Account created — worker must finish onboarding in their app.'
                : 'No payout account yet. Send the worker their setup link, or they can start it from their Earnings tab.'}</p>
          </div>
          <button class="button secondary worker-connect-link" data-id="${escapeHtml(employee.id)}" type="button" ${isLocal ? 'disabled' : ''}>Copy payout setup link</button>
        </div>
        <div class="admin-stripe-row">
          <div class="admin-stripe-info">
            <strong>Fuel card</strong>
            <p class="field-help">${employee.stripe_card_id
              ? `Issued · •••• ${escapeHtml(employee.stripe_card_last4 || '')} · ${escapeHtml(employee.stripe_card_status || 'active')}`
              : 'Virtual card, fuel &amp; car-wash merchants only, $150 per-transaction cap.'}</p>
          </div>
          ${employee.stripe_card_id
            ? `<button class="button secondary worker-card-toggle" data-id="${escapeHtml(employee.id)}" data-status="${escapeHtml(employee.stripe_card_status || 'active')}" type="button" ${isLocal ? 'disabled' : ''}>${employee.stripe_card_status === 'inactive' ? 'Unfreeze card' : 'Freeze card'}</button>`
            : `<button class="button primary worker-issue-card" data-id="${escapeHtml(employee.id)}" type="button" ${isLocal ? 'disabled' : ''}>Issue virtual card</button>`}
        </div>
        <div class="admin-stripe-row">
          <div class="admin-stripe-info">
            <strong>Physical card (tap at the pump)</strong>
            <p class="field-help">${employee.stripe_phys_card_id
              ? (employee.stripe_phys_card_status === 'active'
                  ? `Active · •••• ${escapeHtml(employee.stripe_phys_card_last4 || '')} — ready to tap/insert.`
                  : `Ordered · •••• ${escapeHtml(employee.stripe_phys_card_last4 || '')} — activate once it arrives.`)
              : 'Real card mailed to the company address. Same fuel/wash + $150 cap. No app needed.'}</p>
          </div>
          ${!employee.stripe_phys_card_id
            ? `<button class="button primary worker-order-phys" data-id="${escapeHtml(employee.id)}" type="button" ${isLocal ? 'disabled' : ''}>Order physical card</button>`
            : (employee.stripe_phys_card_status === 'active'
                ? `<button class="button secondary worker-phys-toggle" data-id="${escapeHtml(employee.id)}" data-status="active" type="button" ${isLocal ? 'disabled' : ''}>Freeze card</button>`
                : `<button class="button primary worker-phys-activate" data-id="${escapeHtml(employee.id)}" type="button" ${isLocal ? 'disabled' : ''}>Activate card</button>`)}
        </div>
        <p class="field-help admin-stripe-status" data-worker-id="${escapeHtml(employee.id)}"></p>
        </div>
      </details>

      <details class="admin-worker-mobile-section" open>
        <summary>Weekly schedule</summary>
        <div class="admin-worker-mobile-section-body admin-sched-block">
        <p class="field-help">Set the days and hours this worker is available. The booking site uses this to decide who can cover a time slot.</p>
        <div class="admin-sched-grid" data-worker-id="${escapeHtml(employee.id)}">
          ${isLocal
            ? '<p class="field-help">Run the Supabase worker upgrade before editing this worker\'s schedule.</p>'
            : renderAdminCardScheduleRows(employee.id)}
        </div>
        ${isLocal ? '' : `<div class="admin-button-row"><button class="button primary save-worker-schedule" data-id="${escapeHtml(employee.id)}" type="button">Save schedule</button></div>`}
        <p class="field-help admin-sched-status" data-worker-id="${escapeHtml(employee.id)}"></p>
      </div>
    </article>
  `;
}

// 7 day rows (Sun–Sat) for the inline admin schedule editor, prefilled from the
// employee's cached availability (adminCardAvailability). Days with no saved row
// render unchecked at the 9–5 default.
function renderAdminCardScheduleRows(employeeId) {
  const saved = adminCardAvailability[employeeId];
  const map = new Map((saved || []).map((day) => [Number(day.dayOfWeek), day]));
  return workerDayOptions
    .map(({ dayOfWeek, label }) => {
      const day = map.get(dayOfWeek);
      const enabled = day ? 'checked' : '';
      const startsAt = day?.startsAt || '09:00';
      const endsAt = day?.endsAt || '17:00';
      return `
        <div class="admin-sched-row" data-day-of-week="${dayOfWeek}">
          <label class="checkbox-label admin-sched-toggle">
            <input class="admin-sched-enabled" type="checkbox" data-day-of-week="${dayOfWeek}" ${enabled}>
            <span>${label}</span>
          </label>
          <label class="admin-sched-time">Start
            <input class="admin-sched-start" type="time" data-day-of-week="${dayOfWeek}" value="${startsAt}">
          </label>
          <label class="admin-sched-time">End
            <input class="admin-sched-end" type="time" data-day-of-week="${dayOfWeek}" value="${endsAt}">
          </label>
        </div>`;
    })
    .join('');
}

// Fetch one employee's saved availability into the card cache, then re-render the
// open card so the grid reflects it.
async function loadAdminCardAvailability(employeeId) {
  try {
    const { data, error } = await db
      .from('employee_availability')
      .select('day_of_week,starts_at,ends_at')
      .eq('employee_id', employeeId);
    if (error) throw error;
    adminCardAvailability[employeeId] = (data || []).map((row) => ({
      dayOfWeek: Number(row.day_of_week),
      startsAt: String(row.starts_at || '09:00').slice(0, 5),
      endsAt: String(row.ends_at || '17:00').slice(0, 5),
    }));
  } catch (err) {
    console.warn('Could not load worker availability for admin card:', err);
    adminCardAvailability[employeeId] = adminCardAvailability[employeeId] || [];
  }
  if (selectedScheduleEmployeeId === employeeId) renderWorkerProfiles();
}

// Read the inline schedule grid and persist it via admin_save_availability.
// Work location is no longer a UI field, so it silently rides on the employee's
// stored home_location (see the work-location-removed decision).
async function saveAdminCardSchedule(button) {
  const employeeId = button.dataset.id;
  const block = button.closest('.admin-sched-block');
  const status = block?.querySelector('.admin-sched-status');
  const grid = block?.querySelector('.admin-sched-grid');
  if (!grid) return;

  const workdays = Array.from(grid.querySelectorAll('.admin-sched-enabled:checked'))
    .map((checkbox) => {
      const dayOfWeek = Number(checkbox.dataset.dayOfWeek);
      const row = grid.querySelector(`.admin-sched-row[data-day-of-week="${dayOfWeek}"]`);
      return {
        dayOfWeek,
        startsAt: row?.querySelector('.admin-sched-start')?.value || '09:00',
        endsAt: row?.querySelector('.admin-sched-end')?.value || '17:00',
      };
    })
    .filter((day) => day.startsAt && day.endsAt);

  const invalid = workdays.find((day) => day.startsAt >= day.endsAt);
  if (invalid) {
    if (status) status.textContent = 'Each working day needs an end time later than its start time.';
    return;
  }

  const employee = allEmployees.find((e) => e.id === employeeId);
  const location = employee?.home_location || DEFAULT_WORK_LOCATION;
  const { error } = await db.rpc('admin_save_availability', {
    p_token: adminAuthToken(),
    p_employee_id: employeeId,
    p_workdays: workdays.map((day) => ({
      day_of_week: day.dayOfWeek,
      starts_at: day.startsAt,
      ends_at: day.endsAt,
    })),
    p_location: location,
  });
  if (error) throw error;

  adminCardAvailability[employeeId] = workdays;
  if (status) status.textContent = `Schedule saved · ${workdays.length} working day${workdays.length === 1 ? '' : 's'}.`;
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

  const toOption = (e) => `<option value="${escapeHtml(e.id)}" ${e.id === sel ? 'selected' : ''}>${escapeHtml(e.full_name)} (${escapeHtml(e.employee_code)})</option>`;

  // Schedule section: active workers only
  if (workerSelect) {
    workerSelect.innerHTML = `<option value="">Select worker</option>${activeEmployees.map(toOption).join('')}`;
  }

  if (sel && allEmployees.some((e) => e.id === sel)) {
    selectedScheduleEmployeeId = sel;
  } else {
    selectedScheduleEmployeeId = '';
  }

  if (workerSelect) workerSelect.value = selectedScheduleEmployeeId || '';
}

// (Removed: the old "Select worker" dropdown schedule loader — syncSelectedWorker
// / loadAdminWorkerSchedule. Schedule editing now lives inline in each Workers-tab
// employee card; see loadAdminCardAvailability / saveAdminCardSchedule.)

async function uploadAdminWorkerPhoto(employeeId, blob) {
  const safeName = (blob.name || 'profile.jpg').replace(/[^a-z0-9.-]/gi, '-').toLowerCase();
  const path = `workers/${employeeId}/${Date.now()}-${safeName}`;

  const { error } = await db.storage.from(PHOTO_BUCKET).upload(path, blob, { upsert: false });
  if (error) throw error;

  const { data } = db.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  return data?.publicUrl || path;
}

function adminStoragePathFromUrl(url) {
  if (!url) return null;
  const marker = `/object/public/${PHOTO_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length).split('?')[0]);
}

async function deleteOldAdminWorkerPhotos(oldOriginalUrl, oldCroppedUrl) {
  const paths = [...new Set([
    adminStoragePathFromUrl(oldOriginalUrl),
    adminStoragePathFromUrl(oldCroppedUrl),
  ])].filter(Boolean);
  if (!paths.length) return;
  const { error } = await db.storage.from(PHOTO_BUCKET).remove(paths);
  if (error) console.warn('Could not delete old worker profile photos:', error.message);
}

async function validateUniqueWorkerPhone(employeeId, phone) {
  if (!phone) return;
  const phoneDigits = normalizePhone(phone);

  const conflict = allEmployees.find((employee) => (
    employee.id !== employeeId
    && employee.active
    && normalizePhone(employee.phone) === phoneDigits
  ));
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
  const phoneInputValue = card?.querySelector('.admin-worker-phone')?.value.trim() || null;
  const phone = phoneInputValue ? formatPhone(phoneInputValue) : null;
  await validateUniqueWorkerPhone(employeeId, phone);

  // Resolve photo URLs: delete → clear both; new upload → upload original + canvas-crop;
  // edit framing only → canvas-crop to refresh cropped_photo_url; else keep existing.
  let originalPhotoUrl = existingEmployee?.original_photo_url || existingEmployee?.photo_url || null;
  let croppedPhotoUrl  = existingEmployee?.cropped_photo_url  || existingEmployee?.photo_url || null;
  const boundaryImage  = document.querySelector('#admin-photo-boundary-image');

  if (adminPhotoDeleted) {
    // Delete both old files from storage
    await deleteOldAdminWorkerPhotos(existingEmployee?.original_photo_url, existingEmployee?.cropped_photo_url || existingEmployee?.photo_url);
    originalPhotoUrl = null;
    croppedPhotoUrl  = null;
    adminPhotoZoom   = 1;
    adminPhotoPosition = { x: 0, y: 0 };
  } else if (adminCroppedPhotoBlob) {
    // New photo uploaded — delete old files then upload original + cropped.
    await deleteOldAdminWorkerPhotos(existingEmployee?.original_photo_url, existingEmployee?.cropped_photo_url || existingEmployee?.photo_url);
    originalPhotoUrl = await uploadAdminWorkerPhoto(employeeId, adminCroppedPhotoBlob);
    const croppedFile = boundaryImage?.naturalWidth
      ? await window.ShiftFuelPhoto?.cropToBlobFromBoundaryEditor(boundaryImage, adminPhotoZoom, adminPhotoPosition.x, adminPhotoPosition.y)
      : null;
    croppedPhotoUrl = croppedFile
      ? await uploadAdminWorkerPhoto(employeeId, croppedFile)
      : originalPhotoUrl;
  } else if (boundaryImage?.naturalWidth && boundaryImage.getAttribute('src')) {
    // Edit framing only — delete old cropped file, regenerate crop, keep original.
    await deleteOldAdminWorkerPhotos(null, existingEmployee?.cropped_photo_url);
    const croppedFile = await window.ShiftFuelPhoto?.cropToBlobFromBoundaryEditor(boundaryImage, adminPhotoZoom, adminPhotoPosition.x, adminPhotoPosition.y);
    if (croppedFile) croppedPhotoUrl = await uploadAdminWorkerPhoto(employeeId, croppedFile);
  }

  const photoUrl = croppedPhotoUrl || originalPhotoUrl; // backward-compat photo_url = cropped version

  const updates = {
    full_name: card?.querySelector('.admin-worker-name')?.value.trim() || existingEmployee?.full_name || DEFAULT_WORKER_NAME,
    phone,
    email: card?.querySelector('.admin-worker-email')?.value.trim() || existingEmployee?.email || null,
    home_location: existingEmployee?.home_location || DEFAULT_WORK_LOCATION, // work location dropped from UI; keep the column populated with a default

    started_at: card?.querySelector('.admin-worker-started')?.value || null,
    photo_url: photoUrl,
    original_photo_url: originalPhotoUrl,
    cropped_photo_url: croppedPhotoUrl,
    photo_zoom: adminPhotoZoom,
    photo_position_x: adminPhotoPosition.x,
    photo_position_y: adminPhotoPosition.y,
    profile_updated_at: new Date().toISOString(),
  };
  const { data: rpcRows, error } = await db.rpc('admin_update_employee', {
    p_token: adminAuthToken(),
    p_employee_id: employeeId,
    p_data: updates,
  });

  if (error) {
    console.warn(`saveAdminWorkerProfile: DB update failed for employee ${employeeId}:`, error);
    throw error;
  }

  // Per-employee time pay rate (blank = use the company rate). Saved via its own RPC
  // so it works regardless of admin_update_employee's field whitelist.
  const timeRateRaw = card?.querySelector('.admin-worker-time-rate')?.value;
  let timeRate = timeRateRaw != null && String(timeRateRaw).trim() !== '' ? Number(timeRateRaw) : null;
  let capped = false;
  // Cap the per-employee rate at the company rate — a worker can't earn more per
  // minute than the company charges.
  if (Number.isFinite(timeRate) && timeRate > adminCompanyTimeRatePerMin) {
    timeRate = adminCompanyTimeRatePerMin;
    const rateInput = card?.querySelector('.admin-worker-time-rate');
    if (rateInput) rateInput.value = adminCompanyTimeRatePerMin;
    capped = true;
  }
  // db.rpc returns the error in the result (it doesn't throw), so check it and
  // surface a clear message instead of failing silently (handled at the end so the
  // generic "saved" message can't overwrite it).
  const { error: rateErr } = await db.rpc('admin_set_employee_time_rate', { p_token: adminAuthToken(), p_employee_id: employeeId, p_rate: Number.isFinite(timeRate) ? timeRate : null });
  if (rateErr) console.warn('Could not save employee time rate:', rateErr);

  // admin_update_employee also syncs employee_availability.work_location when
  // home_location changes, and cascades name/phone/photo to any open
  // service_requests assigned to this employee (server-side, in the RPC).
  const data = (rpcRows || [])[0];

  // Normalize the returned row so photo_zoom/position defaults are always numbers.
  const savedEmployee = normalizeEmployee(data);
  // admin_update_employee doesn't return time_rate_per_min (it's saved by the
  // separate RPC above), so apply the value we just saved — otherwise the card
  // refreshes from the stale row and snaps back to the company-rate placeholder
  // even though the rate persisted.
  if (!rateErr) savedEmployee.time_rate_per_min = Number.isFinite(timeRate) ? timeRate : null;
  allEmployees = allEmployees.map((employee) => employee.id === employeeId ? savedEmployee : employee);
  selectedScheduleEmployeeId = employeeId;
  renderWorkerSelect();
  renderWorkerProfiles();
  renderRequests();
  if (status) {
    if (rateErr) {
      status.textContent = 'Worker saved — but the time pay rate did NOT save. Run the time-based-pay SQL migration (202606261200_time_based_comp.sql) in Supabase, then try again.';
    } else if (capped) {
      status.textContent = `Worker saved. Time pay rate capped at the company rate ($${adminCompanyTimeRatePerMin.toFixed(2)}/min) — a worker can't earn more per minute than the company charges.`;
    } else {
      status.textContent = 'Worker profile saved.';
    }
  }
}

async function resetAdminWorkerPassword(button) {
  const card = button.closest('.worker-profile-card');
  const employeeId = button.dataset.id;
  const status = card?.querySelector('.admin-worker-status');

  if (status) status.textContent = 'Generating new password...';

  const { data: tempPassword, error } = await db.rpc('admin_reset_worker_password', {
    p_token: adminAuthToken(),
    p_employee_id: employeeId,
  });

  if (error) throw error;

  if (status) status.textContent = 'Password reset. Worker must change it on next login.';
  showTempPasswordModal(tempPassword);
}

async function deactivateAdminWorkerProfile(button) {
  const employeeId = button.dataset.id;
  const employee = allEmployees.find((item) => item.id === employeeId);

  if (!employee || String(employeeId).startsWith('local-')) return;

  const confirmed = window.confirm(`Deactivate ${employee.full_name}? They will no longer appear in the worker schedule or assignment dropdowns. You can reactivate them at any time.`);
  if (!confirmed) return;

  const { error } = await db.rpc('admin_update_employee', {
    p_token: adminAuthToken(),
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
    p_token: adminAuthToken(),
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
    p_token: adminAuthToken(),
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

  renderWorkerSelect();
  renderWorkerProfiles();
  renderRequests();
}

async function loadRequests() {
  requestList.innerHTML = '<div class="empty-state"><p>Loading requests...</p></div>';
  const { data, error } = await db.rpc('admin_list_requests', { p_token: adminAuthToken() });

  if (error) {
    console.error(error);
    requestList.innerHTML = '<div class="empty-state"><p>Could not load requests. Check the console.</p></div>';
    return;
  }

  allRequests = data || [];
  lastAdminRequestsSignature = adminRequestsSignature(allRequests);
  updateHeroStats();
  populateFilterStatuses();
  updateCancellationBadge();
  // The Active Workers and Revenue stat cards inject custom tables that aren't
  // driven by currentView — re-render them so a refresh doesn't revert to the
  // default queue.
  if (activeStatCard === 'workers') openWorkersPanel();
  else renderRequests();
  renderActionNeeded();
}

// ── Customer-cancellation alert: badge + 20s polling ───────────────────────
// A customer cancelling (or requesting a return mid-service) needs admin
// action — key/vehicle still held, or a fee decision pending. The badge surfaces
// the count, and the poll keeps the queue fresh without a manual refresh.
const CANCELLATION_ALERT_STATUSES = ['cancelled_pending_key_return', 'return_requested', 'customer_return_requested'];

function isCancellationAlert(request) {
  // Only OPEN tickets need attention. Once a ticket is closed/terminal (key
  // returned, cancellation completed, denied, etc.) it no longer alerts — even
  // though the return-request marker (return_requested_at / notes) stays on the
  // row.
  if (!request || !isOpen(request)) return false;
  return hasCustomerReturnRequestAlert(request)
    || CANCELLATION_ALERT_STATUSES.includes(request.status);
}

function updateCancellationBadge() {
  const badge = document.querySelector('#cancellation-alert-badge');
  if (!badge) return;
  const count = (allRequests || []).filter(isCancellationAlert).length;
  if (!count) {
    badge.hidden = true;
    return;
  }
  badge.hidden = false;
  badge.textContent = `⚠️ ${count} cancellation${count === 1 ? '' : 's'} need attention`;
}

let lastAdminRequestsSignature = '';

function adminRequestsSignature(requests) {
  return (requests || [])
    .map((r) => `${r.id}:${r.status}:${r.payment_status || ''}:${r.assigned_employee_id || ''}`)
    .sort()
    .join('|');
}

function isAdminInteracting() {
  const el = document.activeElement;
  return !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

// True if any field in the request list changed but isn't saved yet, so a silent
// re-render won't wipe an in-progress entry (e.g. a receipt total being typed).
function hasUnsavedAdminInput() {
  if (!requestList) return false;
  for (const el of requestList.querySelectorAll('input, textarea, select')) {
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

async function pollAdminRequests() {
  if (!requestList || !adminAuthToken()) return;
  if (isAdminInteracting() || hasUnsavedAdminInput()) return;
  // Leave the custom stat-card tables (workers/revenue) alone — they aren't
  // queue-driven and a re-render would revert them.
  if (activeStatCard === 'workers' || activeStatCard === 'revenue') return;
  try {
    const { data, error } = await db.rpc('admin_list_requests', { p_token: adminAuthToken() });
    if (error) return;
    const requests = data || [];
    if (adminRequestsSignature(requests) === lastAdminRequestsSignature) return; // nothing changed
    allRequests = requests;
    lastAdminRequestsSignature = adminRequestsSignature(requests);
    updateHeroStats();
    populateFilterStatuses();
    updateCancellationBadge();
    renderRequests();
  } catch (_) {
    // Transient network error — try again on the next tick.
  }
}

setInterval(pollAdminRequests, 20000);

// Refresh just the worker presence columns and recompute the snapshot so
// Online / On Break / Busy / Offline stay live without reloading (and
// re-rendering) the whole worker-management UI. Recomputing each tick also
// ages stale heartbeats out to Offline.
async function pollWorkerPresence() {
  if (!adminAuthToken() || !allEmployees.length) return;
  try {
    const { data, error } = await db.rpc('admin_list_employees', { p_token: adminAuthToken() });
    if (error || !Array.isArray(data)) return;
    const byId = new Map(data.map((e) => [e.id, e]));
    allEmployees = allEmployees.map((e) => {
      const p = byId.get(e.id);
      return p ? { ...e, last_seen_at: p.last_seen_at || null, presence_status: p.presence_status || 'offline' } : e;
    });
    updateDashboardStatCards();
  } catch (_) {
    // Transient network error — try again next tick.
  }
}

setInterval(pollWorkerPresence, 30000);

document.querySelector('#cancellation-alert-badge')?.addEventListener('click', () => {
  setActiveStatCard(null);
  currentView = 'in_progress';
  showAllTime = false;
  // Flagged tickets may be from earlier days; the date range is a global queue
  // filter, so widen it to All time or the badge would hide older open ones.
  dashboardRange = 'all';
  if (dashboardRangeSelect) dashboardRangeSelect.value = 'all';
  updateDashboardStatCards();
  switchAdminTab('requests');
  renderRequests();
  document.querySelector('#request-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

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
      const value = btn.dataset.stars;
      const btnStars = (!value || value === 'all') ? null : Number(value);
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
          <p><strong>Customer:</strong> ${escapeHtml(review.customer_name || 'Unknown')} ${review.customer_phone ? `| ${escapeHtml(formatPhone(review.customer_phone))}` : ''} ${review.customer_email ? `| ${escapeHtml(review.customer_email)}` : ''}</p>
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
      .rpc('admin_list_requests', { p_token: adminAuthToken() })
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
          <h3>${escapeHtml(applicant.name || 'Applicant')} ${checkrBadge(applicant)}</h3>
        </div>
        <label class="applicant-status-control">
          Status
          <select class="applicant-status-select" data-id="${escapeHtml(applicant.id)}">
            ${['new', 'interviewing', 'hired', 'declined'].map((status) => `
              <option value="${status}" ${applicant.status === status ? 'selected' : ''}>${applicantStatusLabels[status] || status}</option>
            `).join('')}
          </select>
        </label>
      </div>
      <div class="request-details">
        <p><strong>Phone:</strong> ${applicant.phone ? escapeHtml(formatPhone(applicant.phone)) : 'Not provided'}</p>
        <p><strong>Email:</strong> ${escapeHtml(applicant.email || 'Not provided')}</p>
        <p><strong>Availability:</strong> ${escapeHtml(applicant.availability || 'Not provided')}</p>
        <p><strong>Notes:</strong> ${escapeHtml(applicant.notes || 'No notes provided.')}</p>
        <p><strong>Resume:</strong> ${applicant.resume_url ? `<a href="${escapeHtml(applicant.resume_url)}" target="_blank" rel="noopener">Open resume</a>` : 'Not uploaded'}</p>
        ${checkrAction(applicant)}
      </div>
    </article>
  `).join('');
}

// Background-check status badge shown next to the applicant name.
function checkrBadge(applicant) {
  switch (applicant.checkr_status) {
    case 'clear':    return '<span class="checkr-badge checkr-clear">&#10003; Background clear</span>';
    case 'consider': return '<span class="checkr-badge checkr-consider">&#10007; Needs review</span>';
    case 'pending':  return '<span class="checkr-badge checkr-pending">&#9203; Check in progress</span>';
    case 'suspended':
    case 'dispute':
    case 'canceled': return `<span class="checkr-badge checkr-consider">Check ${escapeHtml(applicant.checkr_status)}</span>`;
    default:         return '';
  }
}

// "Send background check" appears once the applicant reaches Interviewing and no
// check has been started yet. It's an explicit click (not auto-fired on the
// status change) so a Checkr report — which costs money — is never sent by accident.
function checkrAction(applicant) {
  const started = applicant.checkr_status && applicant.checkr_status !== 'none';
  if (applicant.status === 'interviewing' && !started) {
    return `<p><button class="button secondary checkr-start-btn" type="button" data-id="${escapeHtml(applicant.id)}">Send background check</button></p>`;
  }
  return '';
}

async function loadApplicants() {
  if (!applicantList) {
    return;
  }

  applicantList.innerHTML = '<div class="empty-state"><p>Loading applicants...</p></div>';

  let { data, error } = await db
    .rpc('admin_list_applicants', { p_token: adminAuthToken() })
    .select('id,name,email,phone,availability,notes,resume_url,resume_storage_path,status,created_at,checkr_status,checkr_completed_at')
    .neq('status', 'hired');

  if (error?.code === 'PGRST204') {
    ({ data, error } = await db
      .rpc('admin_list_applicants', { p_token: adminAuthToken() })
      .select('id,name,email,phone,availability,notes,status,created_at')
      .neq('status', 'hired'));
  }

  if (error) {
    console.warn('Could not load applicants:', error);
    applicantList.innerHTML = '<div class="empty-state"><p>Could not load applicants. Run supabase-production-rls-lockdown.sql in Supabase.</p></div>';
    return;
  }

  allApplicantsList = data || [];
  if (totalApplicantsEl) totalApplicantsEl.textContent = allApplicantsList.length;
  renderApplicants(allApplicantsList);
  renderActionNeeded();
}

async function hireApplicant(applicantId) {
  const applicant = allApplicantsList.find((item) => item.id === applicantId);
  if (!applicant) throw new Error('Applicant not found. Reload the applicants list and try again.');

  const phone = applicant.phone || null;
  let employeeId = null;

  if (!phone) {
    throw new Error('Applicant needs a phone number before hiring.');
  }

  // Look up an existing employee by phone through a token-gated RPC (phone is no
  // longer readable via the anon employees_public view). See admin_employee_id_by_phone.
  const { data: existingId, error: phoneError } = await db.rpc('admin_employee_id_by_phone', {
    p_token: adminAuthToken(),
    p_phone: phone,
  });

  if (phoneError) throw phoneError;
  const employee = existingId ? { id: existingId } : null;

  if (employee) {
    const { error } = await db.rpc('admin_update_employee', {
      p_token: adminAuthToken(),
      p_employee_id: employee.id,
      p_data: {
        full_name: applicant.name,
        email: applicant.email || null,
        phone,
        active: true,
        home_location: DEFAULT_WORK_LOCATION,
        profile_updated_at: new Date().toISOString(),
      },
    });
    if (error) throw error;
    employeeId = employee.id;
  } else {
    const randomSuffix = Array.from(crypto.getRandomValues(new Uint8Array(3)), (value) => value.toString(16).padStart(2, '0')).join('').toUpperCase();
    const { data: newRows, error } = await db.rpc('admin_insert_employee', {
      p_token: adminAuthToken(),
      p_data: {
        employee_code: `EMP-${randomSuffix}`,
        full_name: applicant.name,
        email: applicant.email || null,
        phone,
        active: true,
        home_location: DEFAULT_WORK_LOCATION,
      },
    });
    if (error) throw error;
    employeeId = newRows?.[0]?.id;
    if (!employeeId) throw new Error('Employee creation failed — could not get new employee ID.');
  }

  // Generate a server-side temporary password and show it once to the admin.
  const { data: tempPassword, error: pwError } = await db.rpc('admin_reset_worker_password', {
    p_token: adminAuthToken(),
    p_employee_id: employeeId,
  });
  if (pwError) throw pwError;

  const { error: statusError } = await db.rpc('admin_update_applicant', {
    p_token: adminAuthToken(),
    p_applicant_id: applicantId,
    p_data: { status: 'hired' },
  });

  if (statusError) throw statusError;

  applicantList?.querySelector(`[data-applicant-id="${applicantId}"]`)?.remove();
  await loadEmployees();
  await loadApplicants();
  showTempPasswordModal(tempPassword);
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
      const detail = error?.message || error?.details || String(error);
      alert(`Could not hire applicant: ${detail}`);
    }
    return;
  }

  // Declining removes the application entirely — confirm first since it's permanent.
  if (select.value === 'declined') {
    const applicant = allApplicantsList.find((item) => item.id === select.dataset.id);
    const who = applicant?.name || 'this applicant';
    if (!confirm(`Decline and permanently delete the application for ${who}? This cannot be undone.`)) {
      loadApplicants(); // revert the dropdown back to its saved status
      return;
    }

    const { error: deleteError } = await db.rpc('admin_delete_applicant', {
      p_token: adminAuthToken(),
      p_applicant_id: select.dataset.id,
    });

    if (deleteError) {
      console.error('Applicant delete failed:', deleteError);
      alert('Could not delete the declined application. Check the console.');
      loadApplicants();
      return;
    }

    applicantList?.querySelector(`[data-applicant-id="${select.dataset.id}"]`)?.remove();
    await loadApplicants();
    return;
  }

  const { error } = await db.rpc('admin_update_applicant', {
    p_token: adminAuthToken(),
    p_applicant_id: select.dataset.id,
    p_data: { status: select.value },
  });

  if (error) {
    console.error('Applicant status update failed:', error);
    alert('Could not update applicant status. Check the console.');
    return;
  }

  // Re-render so the "Send background check" button appears/disappears with the
  // new stage (e.g. it shows once the applicant reaches Interviewing).
  loadApplicants();
});

// Send a Checkr background-check invitation for an applicant at the Interviewing
// stage. Checkr emails the candidate; the result returns via /api/checkr-webhook.
applicantList?.addEventListener('click', async (event) => {
  const btn = event.target.closest('.checkr-start-btn');
  if (!btn) return;

  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = 'Sending…';

  try {
    const response = await fetch('/api/checkr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'invite', admin_token: adminAuthToken(), applicant_id: btn.dataset.id }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Request failed');
    await loadApplicants();
  } catch (err) {
    alert(`Could not start the background check: ${err.message}`);
    btn.disabled = false;
    btn.textContent = originalText;
  }
});

workerProfileList?.addEventListener('click', async (event) => {
  const toggleButton = event.target.closest('.worker-row-toggle');
  if (toggleButton) {
    const id = toggleButton.dataset.id;
    const opening = selectedScheduleEmployeeId !== id;
    selectedScheduleEmployeeId = opening ? id : '';
    renderWorkerProfiles();
    // Pull this worker's saved availability into the inline schedule grid.
    if (opening && !String(id).startsWith('local-')) {
      loadAdminCardAvailability(id);
    }
    return;
  }

  const saveScheduleButton = event.target.closest('.save-worker-schedule');
  if (saveScheduleButton) {
    saveScheduleButton.disabled = true;
    try {
      await saveAdminCardSchedule(saveScheduleButton);
    } catch (error) {
      console.error('Worker schedule save failed:', error);
      const status = saveScheduleButton.closest('.admin-sched-block')?.querySelector('.admin-sched-status');
      if (status) status.textContent = `Could not save schedule: ${error.message || 'Check Supabase setup.'}`;
    } finally {
      saveScheduleButton.disabled = false;
    }
    return;
  }

  const verifyButton = event.target.closest('.toggle-worker-verified');
  if (verifyButton) {
    const next = verifyButton.dataset.verified !== '1';
    verifyButton.disabled = true;
    const { error } = await db.rpc('admin_set_worker_verified', {
      p_token: adminAuthToken(),
      p_employee_id: verifyButton.dataset.id,
      p_verified: next,
    });
    if (error) {
      console.error('Worker verification update failed:', error);
      alert('Could not update verification. Make sure the worker-verification migration has run in Supabase.');
      verifyButton.disabled = false;
      return;
    }
    allEmployees = allEmployees.map((e) => e.id === verifyButton.dataset.id ? { ...e, background_verified: next } : e);
    renderWorkerProfiles();
    return;
  }

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

async function updateRequestStatus(id, status) {
  const request = allRequests.find(r => r.id === id);
  const canonicalStatus = canonicalBookingStatus(status);
  const payload = { status: canonicalStatus };
  if (canonicalStatus === 'completed') payload.completed_at = new Date().toISOString();

  let { error } = await db.rpc('admin_update_request', {
    p_token: adminAuthToken(),
    p_request_id: id,
    p_data: payload,
  });

  if (error && canonicalStatus === 'completed' && /completed_at|schema cache|column/i.test(String(error.message || ''))) {
    delete payload.completed_at;
    ({ error } = await db.rpc('admin_update_request', {
      p_token: adminAuthToken(),
      p_request_id: id,
      p_data: payload,
    }));
  }

  if (error) throw error;

  if (canonicalStatus === 'assigned' && request) {
    const date = request.service_date
      ? new Date(request.service_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : '';
  }

  await loadRequests();
}

async function updateWorkerAssignment(requestId, employeeId) {
  const employee = allEmployees.find((item) => item.id === employeeId);
  const request = allRequests.find(r => r.id === requestId);
  const updates = employee
    ? {
        assigned_employee_id: employee.id,
        assigned_worker_name: employee.full_name,
        assigned_worker_phone: employee.phone ? formatPhone(employee.phone) : null,
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
    p_token: adminAuthToken(),
    p_request_id: requestId,
    p_data: updates,
  });

  if (error) throw error;

  // Push the newly-assigned worker (fire-and-forget; server verifies + guards).
  if (employee) {
    fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'notify', event: 'assigned', request_id: requestId, admin_token: adminAuthToken() }),
    }).catch(() => {});
  }

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

  const newReceiptTotals = {
    fuel: receiptMode === 'fuel' || receiptMode === 'all' ? numberFromInput(fuelReceipt) : savedTotals.fuel,
    wash: receiptMode === 'wash' || receiptMode === 'all' ? numberFromInput(washReceipt) : savedTotals.wash,
  };
  const fees = feeSummary(request, newReceiptTotals);
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
    await uploadPhotoFile(id, 'fuel_receipt', fuelReceiptFile);
  }

  if (washReceiptFile) {
    await uploadPhotoFile(id, 'wash_receipt', washReceiptFile);
  }

  const rpcData = { final_total: finalTotal, notes, ...pricingAuditFields(request, newReceiptTotals) };
  if (button.dataset.nextStatus) {
    rpcData.status = canonicalBookingStatus(button.dataset.nextStatus);
  }

  const { error } = await db.rpc('admin_update_request', {
    p_token: adminAuthToken(),
    p_request_id: id,
    p_data: rpcData,
  });

  if (error) throw error;
  await loadRequests();
}

async function saveServiceUnable(button) {
  const id = button.dataset.id;
  const panel = button.closest('.service-unable-panel');
  const request = allRequests.find((item) => item.id === id);
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
  const chargeFeeAnyway = panel?.querySelector('.service-unable-charge-fee')?.checked || false;
  const receiptTotals = receiptTotalsFromNotes(request);
  const note = `[service_unable ${type}] ${label} could not be completed: ${reason}`
    + (chargeFeeAnyway ? `\n[service_unable_fee_charged ${type}]` : '');
  const notes = request.notes ? `${request.notes}\n${note}` : note;
  // notes already include the fee-charged marker, so recompute final total
  // against a request object that reflects it (string concat above keeps
  // request.notes stale until the next render — pass updated notes through).
  const finalTotal = finalTotalFromSavedReceipts({ ...request, notes }, receiptTotals);

  button.disabled = true;
  button.textContent = 'Saving...';

  const { error } = await db.rpc('admin_update_request', {
    p_token: adminAuthToken(),
    p_request_id: id,
    p_data: { status: canonicalBookingStatus(nextStatusAfterServiceUnable(request, type)), final_total: finalTotal, notes, ...pricingAuditFields({ ...request, notes }, receiptTotals) },
  });

  if (error) throw error;
  const nextStatus = nextStatusAfterServiceUnable(request, type);
  if (closedStatuses.includes(nextStatus)) {
    await voidPaymentHold(request);
  }
  await loadRequests();
}

async function voidPaymentHold(request) {
  const skipRelease = ['voided', 'authorization_released', 'refunded', 'auto_reversed', 'payment_release_failed', 'captured', 'not_started', null, undefined];
  if (!request?.payment_intent_id || skipRelease.includes(request.payment_status)) return;
  try {
    await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel_payment', payment_intent_id: request.payment_intent_id, request_id: request.id, caller_token: adminAuthToken() }),
    });
    // cancel_payment updates payment_status in DB itself; no second write needed.
  } catch (err) {
    console.error('Failed to void payment hold:', err.message);
  }
}

async function retryReleaseHold(button) {
  const id = button.dataset.id;
  const pi = button.dataset.pi;
  const request = allRequests.find(r => r.id === id);
  if (!request) return;

  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = 'Releasing...';

  const banner = button.closest('.admin-warning-banner');

  function showInlineError(msg) {
    button.disabled = false;
    button.textContent = originalText;
    if (banner) {
      let errEl = banner.querySelector('.release-hold-error');
      if (!errEl) {
        errEl = document.createElement('p');
        errEl.className = 'release-hold-error form-error';
        errEl.style.marginTop = '6px';
        banner.appendChild(errEl);
      }
      errEl.textContent = msg;
    }
  }

  try {
    const res = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel_payment', payment_intent_id: pi, request_id: id, caller_token: adminAuthToken() }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      await loadRequests();
    } else if (res.status === 401 || res.status === 403) {
      showInlineError('Session expired. Redirecting to login…');
      setTimeout(() => { window.location.href = '/admin/login'; }, 1500);
    } else {
      showInlineError(`Could not release hold: ${data.error || 'Unknown error. Check Stripe dashboard directly.'}`);
    }
  } catch (err) {
    showInlineError('Network error. Please try again or release the hold manually in Stripe.');
  }
}

// ── Action Needed (dashboard "what needs attention now") ──────────────────────
// Scans the loaded requests + applicants for workflow/payment issues and renders
// a card per issue. The whole section hides when nothing needs attention.
const ACTION_PAYMENT_ISSUE_STATUSES = ['payment_issue', 'authorization_too_low', 'pending_customer_payment'];
const ACTION_PAYMENT_ISSUE_PAYMENT_STATUSES = ['payment_release_failed', 'payment_issue', 'authorization_too_low', 'declined', 'failed'];
const ACTION_RESOLVED_APPLICANT = new Set(['approved', 'hired', 'rejected', 'denied', 'declined', 'archived', 'closed']);

function actionTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

function buildActionNeededItems() {
  const items = [];
  const today = actionTodayStr();

  for (const r of allRequests || []) {
    const who = `${r.customer_name || 'Customer'} · ${queueServiceLabel(r)}`;

    if (ACTION_PAYMENT_ISSUE_STATUSES.includes(r.status)
        || ACTION_PAYMENT_ISSUE_PAYMENT_STATUSES.includes(r.payment_status)) {
      items.push({ kind: 'payment', title: 'Payment issue', who, requestId: r.id,
        detail: 'A payment or authorization on this request needs attention.' });
      continue;
    }
    if (r.status === 'cancelled_pending_key_return') {
      const vehiclePending = cancellationReturnsVehicle(r);
      items.push({ kind: 'cancel',
        title: vehiclePending ? 'Cancellation — Vehicle Not Returned' : 'Cancellation — Key Not Returned',
        who, requestId: r.id,
        detail: vehiclePending
          ? 'Customer canceled after pickup. Confirm the vehicle was returned before closing.'
          : 'Customer canceled after key handoff. Confirm the key was returned before closing.' });
      continue;
    }
    if (r.status === 'vehicle_picked_up' && r.service_date && r.service_date < today) {
      items.push({ kind: 'stuck', title: 'Vehicle picked up, not returned', who, requestId: r.id,
        detail: `Marked picked up on ${r.service_date} but never returned.` });
      continue;
    }
    if (r.assigned_employee_id && canonicalBookingStatus(r.status) === 'new') {
      items.push({ kind: 'unaccepted', title: 'Worker has not accepted', who, requestId: r.id,
        detail: 'A worker is assigned but has not accepted this request yet.' });
      continue;
    }
    if (!r.assigned_employee_id && canonicalBookingStatus(r.status) === 'new' && r.service_date && r.service_date <= today) {
      items.push({ kind: 'needs-worker', title: 'Request needs a worker', who, requestId: r.id,
        detail: r.service_date < today ? `Unassigned since ${r.service_date}.` : 'Scheduled for today and still unassigned.' });
      continue;
    }
  }

  const pendingApplicants = (allApplicantsList || []).filter((a) => !ACTION_RESOLVED_APPLICANT.has(String(a.status || '').toLowerCase()));
  if (pendingApplicants.length) {
    items.push({ kind: 'applicant', action: 'applicants',
      title: 'Applicant waiting for review',
      who: pendingApplicants.length === 1 ? (pendingApplicants[0].full_name || 'New applicant') : `${pendingApplicants.length} applicants`,
      detail: 'A worker application is waiting for your review.' });
  }

  if (pendingChangeRequestCount > 0) {
    items.push({ kind: 'change-request', action: 'change-requests',
      title: 'Worker change request waiting',
      who: pendingChangeRequestCount === 1 ? '1 request' : `${pendingChangeRequestCount} requests`,
      detail: 'A worker is requesting a schedule or job change. Review it in the Workers tab.' });
  }

  return items;
}

function renderActionNeeded() {
  const section = document.querySelector('#action-needed-section');
  const list = document.querySelector('#action-needed-list');
  const count = document.querySelector('#action-needed-count');
  if (!section || !list) return;

  const items = buildActionNeededItems();
  if (!items.length) {
    section.hidden = true;
    list.innerHTML = '';
    if (count) count.textContent = '';
    return;
  }

  section.hidden = false;
  if (count) count.textContent = String(items.length);
  list.innerHTML = items.map((it) => {
    const btn = it.action === 'applicants'
      ? '<button class="button secondary action-needed-btn" data-action-applicants="1" type="button">Review applicants</button>'
      : it.action === 'change-requests'
        ? '<button class="button secondary action-needed-btn" data-action-change-requests="1" type="button">Review requests</button>'
        : `<button class="button secondary action-needed-btn" data-action-request="${escapeHtml(it.requestId)}" type="button">View request</button>`;
    return `
      <div class="action-needed-card action-needed-${it.kind}">
        <div class="action-needed-info">
          <strong class="action-needed-title">${escapeHtml(it.title)}</strong>
          <span class="action-needed-who">${escapeHtml(it.who)}</span>
          <span class="action-needed-detail">${escapeHtml(it.detail)}</span>
        </div>
        ${btn}
      </div>`;
  }).join('');
}

function openRequestFromAction(id) {
  if (!id) return;
  currentView = 'all';
  expandedRequestId = id;
  expandedSummaryId = null;
  switchPageTab('dashboard');
  renderRequests();
  setTimeout(() => {
    document.querySelector(`[data-request-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 60);
}

// Collapse/expand the "Needs your attention" panel (starts collapsed to save space).
const actionNeededToggle = document.querySelector('#action-needed-toggle');
actionNeededToggle?.addEventListener('click', () => {
  const section = document.querySelector('#action-needed-section');
  if (!section) return;
  const collapsed = section.classList.toggle('is-collapsed');
  actionNeededToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
});
actionNeededToggle?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); actionNeededToggle.click(); }
});

document.querySelector('#action-needed-list')?.addEventListener('click', (event) => {
  const reqBtn = event.target.closest('[data-action-request]');
  if (reqBtn) { openRequestFromAction(reqBtn.dataset.actionRequest); return; }
  const appBtn = event.target.closest('[data-action-applicants]');
  if (appBtn) {
    switchPageTab('dashboard');
    document.querySelector('[data-tab-panel="applicants"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  const crBtn = event.target.closest('[data-action-change-requests]');
  if (crBtn) {
    switchPageTab('workers');
    setTimeout(() => document.querySelector('#admin-change-requests')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }
});

// "View Worker" in the Active Workers drilldown → open that worker on the Workers tab.
requestList?.addEventListener('click', (event) => {
  const btn = event.target.closest('.workers-view-worker');
  if (!btn) return;
  switchPageTab('workers');
  setTimeout(() => {
    document.querySelector(`#admin-worker-profile-list [data-worker-id="${btn.dataset.id}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 80);
});

// Worker Snapshot rows (Online / On Break / Busy / Offline) → open the Workers
// tab filtered to that presence. switchPageTab clears the filter first, so we set
// it afterwards and re-render.
document.querySelector('.worker-snapshot-list')?.addEventListener('click', (event) => {
  const row = event.target.closest('li[data-presence]');
  if (!row) return;
  switchPageTab('workers');
  workerPresenceFilter = row.dataset.presence;
  renderWorkerProfiles();
  document.querySelector('#admin-worker-profile-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

document.querySelector('.worker-snapshot-list')?.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const row = event.target.closest('li[data-presence]');
  if (!row) return;
  event.preventDefault();
  row.click();
});

// "Show all" in the Workers presence-filter banner clears the filter.
workerProfileList?.addEventListener('click', (event) => {
  if (event.target.closest('.worker-filter-clear')) {
    workerPresenceFilter = null;
    renderWorkerProfiles();
  }
});

// ── Incomplete authorizations (dashboard card) ────────────────────────────────
function formatHoldAge(iso) {
  const created = new Date(iso).getTime();
  if (!Number.isFinite(created)) return '';
  const mins = Math.max(0, Math.round((Date.now() - created) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m ago`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h ago`;
}

const PENDING_AUTH_REASON_LABELS = {
  booking_failed: 'Booking failed after authorization',
  abandoned: 'Customer left before booking',
};

async function loadPendingAuthorizations() {
  const section = document.querySelector('#pending-auth-section');
  const list = document.querySelector('#pending-auth-list');
  if (!section || !list) return;

  try {
    const res = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'admin_list_pending_authorizations', caller_token: adminAuthToken() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Don't surface a scary error on the dashboard for this backstop feature;
      // just hide the card. (e.g. table not migrated yet.)
      section.hidden = true;
      return;
    }
    const rows = data.authorizations || [];
    if (!rows.length) {
      section.hidden = true;
      list.innerHTML = '';
      return;
    }
    section.hidden = false;
    list.innerHTML = rows.map((row) => {
      const pi = escapeHtml(row.payment_intent_id);
      const amount = money((Number(row.amount_cents) || 0) / 100);
      const who = escapeHtml(row.customer_name || 'Unknown customer');
      const email = row.customer_email ? ` · ${escapeHtml(row.customer_email)}` : '';
      const svc = row.service_label ? `<span class="pending-auth-svc">${escapeHtml(row.service_label)}</span>` : '';
      const reason = row.reason && PENDING_AUTH_REASON_LABELS[row.reason]
        ? `<span class="pending-auth-reason">${escapeHtml(PENDING_AUTH_REASON_LABELS[row.reason])}</span>` : '';
      return `
        <div class="pending-auth-row" data-pi="${pi}">
          <div class="pending-auth-info">
            <strong>${amount} hold</strong> — ${who}${email}
            <div class="pending-auth-meta">${svc}<span class="pending-auth-age">${escapeHtml(formatHoldAge(row.created_at))}</span>${reason}</div>
          </div>
          <button class="button danger pending-auth-void-btn" data-pi="${pi}" type="button">Void hold</button>
        </div>`;
    }).join('');
  } catch (err) {
    console.warn('[pending-auth] load failed:', err.message);
    section.hidden = true;
  }
}

async function voidPendingAuthorization(button) {
  const pi = button.dataset.pi;
  if (!pi) return;
  if (!window.confirm('Void this card hold now? This releases the customer’s authorization immediately and cannot be undone.')) return;
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = 'Voiding…';
  try {
    const res = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'admin_void_authorization', payment_intent_id: pi, caller_token: adminAuthToken() }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      await loadPendingAuthorizations();
    } else if (res.status === 401 || res.status === 403) {
      window.location.href = '/admin/login';
    } else {
      button.disabled = false;
      button.textContent = originalText;
      alert(`Could not void hold: ${data.error || 'Unknown error. Check Stripe directly.'}`);
    }
  } catch (err) {
    button.disabled = false;
    button.textContent = originalText;
    alert('Network error. Please try again or void the hold in Stripe.');
  }
}

document.querySelector('#pending-auth-refresh-btn')?.addEventListener('click', loadPendingAuthorizations);
document.querySelector('#pending-auth-list')?.addEventListener('click', (event) => {
  const button = event.target.closest('.pending-auth-void-btn');
  if (button) voidPendingAuthorization(button);
});

// ── Authorizations needing customer action (advance / saved-card bookings) ─────
const REAUTH_ERROR_LABELS = {
  card_declined: 'Card declined',
  authentication_required: 'Bank authentication required',
  no_saved_card: 'No saved card on file',
  invalid_amount: 'Invalid amount',
};
function reauthErrorLabel(code) {
  if (!code) return '';
  return REAUTH_ERROR_LABELS[code] || String(code).replace(/^unexpected_status:/, 'Unexpected status: ');
}

async function loadReauthNeeded() {
  const section = document.querySelector('#reauth-needed-section');
  const list = document.querySelector('#reauth-needed-list');
  if (!section || !list) return;

  try {
    const res = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'admin_list_reauth_needed', caller_token: adminAuthToken() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Backstop card — hide quietly (e.g. table not migrated yet).
      section.hidden = true;
      return;
    }
    const rows = data.requests || [];
    if (!rows.length) {
      section.hidden = true;
      list.innerHTML = '';
      return;
    }
    section.hidden = false;
    list.innerHTML = rows.map((row) => {
      const amount = money(Number(row.estimated_total) || 0);
      const who = escapeHtml(row.customer_name || 'Unknown customer');
      const email = row.customer_email ? ` · ${escapeHtml(row.customer_email)}` : '';
      const svc = row.service_label ? `<span class="pending-auth-svc">${escapeHtml(row.service_label)}</span>` : '';
      const date = row.service_date ? `<span class="pending-auth-age">Service ${escapeHtml(row.service_date)}</span>` : '';
      const errLabel = reauthErrorLabel(row.auth_error);
      const reason = errLabel ? `<span class="pending-auth-reason">${escapeHtml(errLabel)}</span>` : '';
      return `
        <div class="pending-auth-row" data-request-id="${escapeHtml(row.id)}">
          <div class="pending-auth-info">
            <strong>${amount}</strong> — ${who}${email}
            <div class="pending-auth-meta">${svc}${date}${reason}</div>
          </div>
          <button class="button secondary reauth-retry-btn" data-request-id="${escapeHtml(row.id)}" type="button">Retry now</button>
        </div>`;
    }).join('');
  } catch (err) {
    console.warn('[reauth-needed] load failed:', err.message);
    section.hidden = true;
  }
}

document.querySelector('#reauth-needed-refresh-btn')?.addEventListener('click', loadReauthNeeded);
document.querySelector('#reauth-needed-list')?.addEventListener('click', (event) => {
  const button = event.target.closest('.reauth-retry-btn');
  if (button) retryScheduledAuth(button);
});

async function retryScheduledAuth(button) {
  const requestId = button.dataset.requestId;
  if (!requestId) return;
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = 'Retrying…';
  try {
    const res = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'admin_retry_scheduled_auth', request_id: requestId, caller_token: adminAuthToken() }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      await loadReauthNeeded();
    } else if (res.status === 401 || res.status === 403) {
      window.location.href = '/admin/login';
    } else {
      button.disabled = false;
      button.textContent = originalText;
      alert(`Could not authorize: ${data.error || 'Unknown error. The customer may need to re-authorize.'}`);
    }
  } catch (err) {
    button.disabled = false;
    button.textContent = originalText;
    alert('Network error. Please try again.');
  }
}

async function saveDenyReason(button) {
  const id = button.dataset.id;
  const panel = button.closest('.deny-reason-panel');
  const request = allRequests.find((item) => item.id === id);
  const selected = panel?.querySelector('.deny-reason-select')?.value.trim();
  const custom   = panel?.querySelector('.deny-reason-other')?.value.trim();
  const reason   = selected === 'Other' ? (custom || '') : selected;
  const errorEl  = panel?.querySelector('.deny-reason-error');
  const originalText = button.textContent;

  function showInlineError(msg) {
    button.disabled = false;
    button.textContent = originalText;
    if (errorEl) errorEl.textContent = msg;
  }

  if (!request) return;

  if (!selected) {
    showInlineError('Select a denial reason before denying this request.');
    return;
  }
  if (selected === 'Other' && !custom) {
    showInlineError('Describe the reason when "Other" is selected.');
    return;
  }

  if (!adminAuthToken()) {
    showInlineError('Your admin session expired. Please log in again.');
    setTimeout(() => { window.location.href = '/admin/login'; }, 1500);
    return;
  }

  button.disabled = true;
  button.textContent = 'Denying...';
  if (errorEl) errorEl.textContent = '';

  const timestamp = new Date().toISOString();
  const note = `[denied ${timestamp}] Admin denial reason: ${reason}`;
  let notes = request.notes ? `${request.notes}\n${note}` : note;

  // Handle payment reversal before changing status.
  // /api/payments updates payment_status in the DB itself for cancel_payment/refund;
  // we just need to know the resulting payment_status so we can log it in notes here.
  let paymentStatus = request.payment_status;
  let holdReleaseWarning = null;
  let sessionExpired = false;
  const skipRelease = ['voided', 'authorization_released', 'refunded', 'auto_reversed', 'payment_release_failed', 'not_started', null, undefined];

  if (request.payment_intent_id && !skipRelease.includes(request.payment_status)) {
    if (request.payment_status === 'captured') {
      // Issue a full refund for already-captured payments.
      try {
        const res = await fetch('/api/payments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'refund', payment_intent_id: request.payment_intent_id, request_id: request.id, caller_token: adminAuthToken() }),
        });
        if (res.ok) {
          paymentStatus = 'refunded';
        } else if (res.status === 401 || res.status === 403) {
          sessionExpired = true;
        } else {
          const data = await res.json().catch(() => ({}));
          console.error('[deny] Failed to refund captured payment:', data.error);
          notes += `\n[payment_refund_failed ${timestamp}] Refund failed on denial — admin must manually refund via Stripe. Error: ${data.error || 'unknown'}`;
          holdReleaseWarning = 'The refund could not be processed automatically. Check Stripe and refund manually.';
        }
      } catch (err) {
        console.error('[deny] Error refunding captured payment:', err.message);
        notes += `\n[payment_refund_failed ${timestamp}] Refund failed on denial (network error) — admin must manually refund via Stripe.`;
        holdReleaseWarning = 'The refund could not be processed automatically (network error). Check Stripe and refund manually.';
      }
    } else {
      // Authorized/uncaptured — release the hold.
      try {
        const res = await fetch('/api/payments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'cancel_payment', payment_intent_id: request.payment_intent_id, request_id: request.id, caller_token: adminAuthToken() }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          paymentStatus = data.payment_status || 'voided';
        } else if (res.status === 401 || res.status === 403) {
          sessionExpired = true;
        } else {
          // API already set payment_release_failed in the DB; mirror it here for the notes.
          paymentStatus = 'payment_release_failed';
          console.error('[deny] Failed to release hold:', data.error);
          notes += `\n[payment_release_failed ${timestamp}] Card hold could not be released automatically. Admin must cancel the Stripe PaymentIntent manually. Error: ${data.error || 'unknown'}`;
          holdReleaseWarning = 'The card hold could not be released automatically. Check Stripe and release it manually.';
        }
      } catch (err) {
        paymentStatus = 'payment_release_failed';
        console.error('[deny] Network error releasing hold:', err.message);
        notes += `\n[payment_release_failed ${timestamp}] Card hold release failed (network error). Admin must cancel the Stripe PaymentIntent manually.`;
        holdReleaseWarning = 'The card hold could not be released automatically (network error). Check Stripe and release it manually.';
      }
    }
  }

  if (sessionExpired) {
    showInlineError('Your admin session expired. Please log in again.');
    setTimeout(() => { window.location.href = '/admin/login'; }, 1500);
    return;
  }

  // Deny the request regardless of whether the payment release/refund succeeded —
  // a failed Stripe call must never block the denial itself.
  const { error } = await db.rpc('admin_update_request', {
    p_token: adminAuthToken(),
    p_request_id: id,
    p_data: {
      status: 'cancelled',
      cancellation_reason: reason,
      notes,
      ...(paymentStatus !== request.payment_status ? { payment_status: paymentStatus } : {}),
    },
  });

  if (error) {
    console.error('[deny] admin_update_request failed:', error);
    showInlineError(`Could not deny the request: ${error.message || 'Database error'}. Please try again.`);
    return;
  }

  if (holdReleaseWarning) {
    alert(`Request denied. ${holdReleaseWarning}`);
  }

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
  const fees = feeSummary(request, newReceiptTotals);
  const finalTotal = finalTotalFromSavedReceipts(request, newReceiptTotals);
  const note = `Corrected ${type === 'fuel' ? 'fuel' : 'car wash'} total: ${money(value)}. [receipt_totals fuel=${newReceiptTotals.fuel.toFixed(2)} wash=${newReceiptTotals.wash.toFixed(2)}] Service totals: fuel ${money(fees.fuel)}, car wash ${money(fees.wash)}, inspection ${money(fees.inspection)}. Payment/operating recovery ${money(fees.recovery)}. Final total ${money(finalTotal)}.`;
  const notes = request.notes ? `${request.notes}\n${note}` : note;

  button.disabled = true;
  button.textContent = 'Updating...';

  const { error } = await db.rpc('admin_update_request', {
    p_token: adminAuthToken(),
    p_request_id: id,
    p_data: { final_total: finalTotal, notes, ...pricingAuditFields(request, newReceiptTotals) },
  });

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

  const { error } = await db.rpc('admin_update_request', {
    p_token: adminAuthToken(),
    p_request_id: id,
    p_data: { return_parking_location: returnParkingLocation, status: 'in_service' },
  });

  if (error) throw error;
  await loadRequests();
}

async function saveInspection(button) {
  const id = button.dataset.id;
  const request = allRequests.find((item) => item.id === id);
  const panel = button.closest('.inspection-panel');
  const code = normalizeTroubleCode(panel.querySelector('.inspection-trouble-code').value);
  const codeDetails = troubleCodeDetails(code);
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

  const { error } = await db.rpc('admin_update_request', {
    p_token: adminAuthToken(),
    p_request_id: id,
    p_data: { notes, status: 'in_service' },
  });

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

  // Only allow direct completion when payment is already captured (or no payment).
  if (request.payment_intent_id && request.payment_status !== 'captured') {
    alert('Payment has not been captured yet. Use "Capture payment & complete" instead.');
    return;
  }

  button.disabled = true;
  button.textContent = 'Saving...';
  try {
    await updateRequestStatus(id, 'completed');
  } catch (err) {
    console.error('[complete] Failed:', err.message);
    button.disabled = false;
    button.textContent = button.dataset.originalText || 'Complete request';
    alert('Could not update the request. Please try again.');
  }
}

async function captureAndProceed(button) {
  const id = button.dataset.id;
  const request = allRequests.find(r => r.id === id);
  if (!request) return;

  const panel = button.closest('.complete-panel');
  const confirmed = panel?.querySelector('.confirm-complete-totals')?.checked;

  if (request.final_total == null) {
    alert('Save the final total before capturing payment.');
    return;
  }
  if (!confirmed) {
    alert('Check the confirmation box after verifying the saved totals.');
    return;
  }

  button.disabled = true;
  button.textContent = 'Processing payment...';

  try {
    const res = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'capture_payment',
        payment_intent_id: request.payment_intent_id,
        request_id: id,
        amount_cents: Math.round((request.final_total || 0) * 100),
        caller_token: adminAuthToken(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      button.disabled = false;
      button.textContent = 'Capture payment & complete';
      alert(`Could not capture payment: ${data.error || 'Unknown error. Please try again.'}`);
      return;
    }
    await loadRequests();
  } catch (err) {
    button.disabled = false;
    button.textContent = 'Capture payment & complete';
    alert('Network error. Please try again.');
  }
}

// Retries an automatic capture that already failed once (status = payment_issue /
// authorization_too_low). Totals were already confirmed before the first attempt,
// so this does not require re-checking the confirm-totals checkbox.
async function retryPaymentCapture(button) {
  const id = button.dataset.id;
  const request = allRequests.find(r => r.id === id);
  if (!request) return;

  const panel = button.closest('[data-payment-issue-for]');
  const statusEl = panel?.querySelector('.payment-issue-status');

  if (request.final_total == null) {
    if (statusEl) statusEl.textContent = 'Save the final total before retrying the capture.';
    return;
  }

  button.disabled = true;
  button.textContent = 'Retrying...';
  if (statusEl) statusEl.textContent = '';

  try {
    const res = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'capture_payment',
        payment_intent_id: request.payment_intent_id,
        request_id: id,
        amount_cents: Math.round((request.final_total || 0) * 100),
        caller_token: adminAuthToken(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      button.disabled = false;
      button.textContent = 'Retry payment capture';
      if (statusEl) statusEl.textContent = `Could not capture payment: ${data.error || 'Unknown error. Please try again.'}`;
      return;
    }
    await loadRequests();
  } catch (err) {
    button.disabled = false;
    button.textContent = 'Retry payment capture';
    if (statusEl) statusEl.textContent = 'Network error. Please try again.';
  }
}

async function proceedToKeyReturn(button) {
  const id = button.dataset.id;
  const request = allRequests.find(r => r.id === id);
  if (!request) return;

  const panel = button.closest('.complete-panel');
  const confirmed = panel?.querySelector('.confirm-complete-totals')?.checked;

  if (panel && !confirmed) {
    alert('Check the confirmation box after verifying the saved totals.');
    return;
  }

  button.disabled = true;
  button.textContent = 'Saving...';
  try {
    await updateRequestStatus(id, 'completed');
  } catch (err) {
    button.disabled = false;
    button.textContent = button.textContent.includes('no payment') ? 'Complete request (no payment)' : 'Complete request';
    alert('Could not update the request. Please try again.');
  }
}

async function resolveReturnRequest(button, decision) {
  const id = button.dataset.id;
  const panel = button.closest('.return-request-banner');
  const statusEl = panel?.querySelector('.return-request-status');
  const allButtons = panel?.querySelectorAll('button') || [];

  allButtons.forEach((b) => { b.disabled = true; });
  if (statusEl) statusEl.textContent = 'Processing...';

  try {
    const res = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'resolve_return_request',
        request_id: id,
        caller_token: adminAuthToken(),
        decision,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      allButtons.forEach((b) => { b.disabled = false; });
      if (statusEl) statusEl.textContent = `Error: ${data.error || 'Could not process. Please try again.'}`;
      return;
    }
    await loadRequests();
  } catch (err) {
    allButtons.forEach((b) => { b.disabled = false; });
    if (statusEl) statusEl.textContent = 'Network error. Please try again.';
  }
}

async function submitAdminKeysReturned(button) {
  const id = button.dataset.id;
  const request = allRequests.find(r => r.id === id);
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
        caller_token: adminAuthToken(),
        key_returned_to_type: toType,
        key_returned_to_name_or_location: toName,
        key_returned_by: 'Admin',
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      button.disabled = false;
      button.textContent = 'Keys returned';
      if (statusEl) statusEl.textContent = `Error: ${data.error || 'Could not save. Please try again.'}`;
      return;
    }
    await loadRequests();
  } catch (err) {
    button.disabled = false;
    button.textContent = 'Keys returned';
    if (statusEl) statusEl.textContent = 'Network error. Please try again.';
  }
}

// Failure-recovery only: used when automatic payment capture has already
// failed (status = payment_issue / authorization_too_low). Puts the request
// in front of the customer's Confirm-and-Pay card on the tracking page.
async function sendToCustomerPayment(button) {
  const id = button.dataset.id;
  const request = allRequests.find((item) => item.id === id);
  if (!request) return;

  const panel = button.closest('[data-payment-issue-for]');
  const statusEl = panel?.querySelector('.payment-issue-status');

  if (request.final_total == null) {
    if (statusEl) statusEl.textContent = 'Save the final total before sending to the customer.';
    else alert('Save the final total before sending to the customer.');
    return;
  }

  button.disabled = true;
  button.textContent = 'Sending...';
  if (statusEl) statusEl.textContent = '';

  try {
    const { error } = await db.rpc('admin_update_request', {
      p_token: adminAuthToken(),
      p_request_id: id,
      p_data: { status: 'in_service' },
    });
    if (error) throw error;

    await loadRequests();
  } catch (err) {
    console.error('[sendToCustomerPayment] Failed:', err.message);
    button.disabled = false;
    button.textContent = 'Send to Customer for Payment';
    if (statusEl) statusEl.textContent = 'Could not update the request. Please try again.';
    else alert('Could not update the request. Please try again.');
  }
}

async function saveEdit(button) {
  const id = button.dataset.id;
  const panel = button.closest('.admin-edit-panel');
  const statusEl = panel.querySelector('.edit-save-status');

  const val = (cls) => panel.querySelector(cls)?.value?.trim() ?? '';

  // Only add a key to the payload when the field has a non-empty value.
  // The RPC CASE checks key presence — omitting a key leaves the column unchanged.
  // Sending an empty string for a typed column (date, time, numeric) causes a 400.
  const updates = {};

  const setText  = (key, cls) => { const v = val(cls); if (v !== '') updates[key] = v; };
  const setOrNull = (key, cls) => { updates[key] = val(cls) || null; }; // nullable text — always include
  const setPhone = (key, cls) => { const v = val(cls); updates[key] = v ? formatPhone(v) : null; };
  const setNum   = (key, cls) => { const v = val(cls); if (v !== '') { const n = Number(v); if (!isNaN(n)) updates[key] = n; } };
  const setDate  = (key, cls) => { const v = val(cls); if (v !== '') updates[key] = v; };
  const setTime  = (key, cls) => { const v = val(cls); if (v !== '') updates[key] = v; };

  // Text fields — always include (nullable columns, empty string means clear)
  setOrNull('customer_name',          '.edit-customer-name');
  setPhone('customer_phone',          '.edit-customer-phone');
  setOrNull('customer_email',         '.edit-customer-email');
  setOrNull('address_street',         '.edit-address-street');
  setOrNull('address_apt',            '.edit-address-apt');
  setOrNull('address_city',           '.edit-address-city');
  setOrNull('address_state',          '.edit-address-state');
  setOrNull('address_zip',            '.edit-address-zip');
  setOrNull('parking_location',       '.edit-parking-location');
  setOrNull('parking_spot',           '.edit-parking-spot');
  setOrNull('key_handoff_details',    '.edit-key-handoff');
  setOrNull('vehicle_year',           '.edit-vehicle-year');
  setOrNull('vehicle_make',           '.edit-vehicle-make');
  setOrNull('vehicle_model',          '.edit-vehicle-model');
  setOrNull('vehicle_color',          '.edit-vehicle-color');
  setOrNull('license_plate',          '.edit-license-plate');
  setOrNull('fuel_type',              '.edit-fuel-type');
  setOrNull('return_parking_location','.edit-return-location');
  setOrNull('notes',                  '.edit-notes');

  // Typed fields — only include when non-empty to avoid cast errors
  setDate('service_date',        '.edit-service-date');
  setTime('desired_return_time', '.edit-return-time');
  setNum('estimated_total',      '.edit-estimated-total');
  setNum('final_total',          '.edit-final-total');

  // Lower-only rule: the final total may be reduced (goodwill / partial refund)
  // but never raised above what the customer authorized — you can't capture more
  // than the hold, and raising it would also unfairly inflate the worker payout.
  if (updates.final_total != null) {
    const req = allRequests.find((r) => r.id === id);
    const ceiling = Number(req?.authorized_amount ?? req?.estimated_total ?? req?.final_total);
    if (Number.isFinite(ceiling) && Number(updates.final_total) > ceiling + 0.001) {
      if (statusEl) statusEl.textContent = `Final total can't exceed the authorized ${money(ceiling)}. You can only lower it.`;
      else alert(`Final total can't exceed the authorized ${money(ceiling)}. You can only lower it.`);
      return;
    }
  }

  if (Object.keys(updates).length === 0) {
    if (statusEl) statusEl.textContent = 'No changes to save.';
    return;
  }

  button.disabled = true;
  button.textContent = 'Saving...';

  const { error } = await db.rpc('admin_update_request', {
    p_token: adminAuthToken(),
    p_request_id: id,
    p_data: updates,
  });

  button.disabled = false;
  button.textContent = 'Save changes';

  if (error) {
    console.error('[saveEdit] admin_update_request failed:', error.message, '| payload:', JSON.stringify(updates));
    if (statusEl) statusEl.textContent = `Save failed: ${error.message || 'Unknown error'}`;
    return;
  }

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
  }[photoType] || 'assigned';
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
  const { error } = await db.rpc('admin_update_request', {
    p_token: adminAuthToken(),
    p_request_id: id,
    p_data: { status: canonicalBookingStatus(panel.dataset.nextStatus), notes },
  });

  if (error) throw error;
  await loadRequests();
}

function renderEditTotalPanel(request) {
  const receiptTotals = receiptTotalsFromNotes(request);
  const fees = feeSummary(request, receiptTotals);
  return `
    <div class="edit-total-charge-form" data-request-id="${escapeHtml(request.id)}">
      <h4 class="edit-total-charge-title">Change Charged Amount</h4>
      <p class="edit-total-charge-desc">Current charged total: <strong>${money(request.final_total)}</strong></p>
      <div class="admin-money-grid">
        ${serviceNeedsFuel(request) ? `
          <label>Fuel receipt total
            <input class="etc-fuel-receipt" type="number" min="0" step="0.01" value="${receiptTotals.fuel || ''}" placeholder="0.00">
          </label>
          <label>Fuel service fee
            <input class="etc-fuel-fee" type="number" min="0" step="0.01" value="${fees.fuel}" placeholder="${fees.fuel}">
          </label>` : ''}
        ${serviceNeedsWash(request) ? `
          <label>Car wash receipt total
            <input class="etc-wash-receipt" type="number" min="0" step="0.01" value="${receiptTotals.wash || ''}" placeholder="0.00">
          </label>
          <label>Car wash service fee
            <input class="etc-wash-fee" type="number" min="0" step="0.01" value="${fees.wash}" placeholder="${fees.wash}">
          </label>` : ''}
        ${request.quick_inspection ? `
          <label>Add-ons fee
            <input class="etc-inspection-fee" type="number" min="0" step="0.01" value="${fees.inspection}" placeholder="${fees.inspection}">
          </label>` : ''}
      </div>
      <p class="etc-new-total-preview">New total: <strong class="etc-new-total-amount">${money(request.final_total)}</strong></p>
      <div class="admin-button-row">
        <button class="button primary save-edit-total-btn" data-request-id="${escapeHtml(request.id)}" type="button">Save adjustment</button>
        <button class="button cancel-edit-total-btn" data-request-id="${escapeHtml(request.id)}" type="button">Cancel</button>
      </div>
    </div>
  `;
}

function editTotalChargeOpen(button) {
  const requestId = button.dataset.requestId;
  const request = allRequests.find(r => r.id === requestId);
  if (!request) return;
  const panel = document.getElementById(`edit-total-panel-${requestId}`);
  if (!panel) return;

  if (!panel.hidden) {
    panel.hidden = true;
    panel.innerHTML = '';
    return;
  }

  panel.innerHTML = renderEditTotalPanel(request);
  panel.hidden = false;

  // Live recalculate as inputs change
  panel.addEventListener('input', () => recalcEditTotal(panel, request));
}

function recalcEditTotal(panel, request) {
  const fuelReceipt  = parseFloat(panel.querySelector('.etc-fuel-receipt')?.value)  || 0;
  const fuelFee      = parseFloat(panel.querySelector('.etc-fuel-fee')?.value)       || 0;
  const washReceipt  = parseFloat(panel.querySelector('.etc-wash-receipt')?.value)   || 0;
  const washFee      = parseFloat(panel.querySelector('.etc-wash-fee')?.value)       || 0;
  const inspFee      = parseFloat(panel.querySelector('.etc-inspection-fee')?.value) || 0;
  const newTotal = fuelReceipt + fuelFee + washReceipt + washFee + inspFee;
  const el = panel.querySelector('.etc-new-total-amount');
  if (el) el.textContent = money(newTotal);
}

async function saveEditTotalCharge(button) {
  const requestId = button.dataset.requestId;
  const request = allRequests.find(r => r.id === requestId);
  if (!request) return;

  const panel = document.getElementById(`edit-total-panel-${requestId}`);
  if (!panel) return;

  const fuelReceipt  = parseFloat(panel.querySelector('.etc-fuel-receipt')?.value)  || 0;
  const fuelFee      = parseFloat(panel.querySelector('.etc-fuel-fee')?.value)       || 0;
  const washReceipt  = parseFloat(panel.querySelector('.etc-wash-receipt')?.value)   || 0;
  const washFee      = parseFloat(panel.querySelector('.etc-wash-fee')?.value)       || 0;
  const inspFee      = parseFloat(panel.querySelector('.etc-inspection-fee')?.value) || 0;
  const newTotal = fuelReceipt + fuelFee + washReceipt + washFee + inspFee;

  if (newTotal <= 0) {
    alert('New total must be greater than zero.');
    return;
  }

  const oldTotal = request.final_total || 0;
  const diff = newTotal - oldTotal;

  const diffDisplay = diff === 0
    ? 'No change in total.'
    : diff < 0
      ? `Issue a partial refund of ${money(Math.abs(diff))} (${money(oldTotal)} → ${money(newTotal)}).`
      : `New total ${money(newTotal)} is higher than original ${money(oldTotal)}. Only a refund or downward adjustment can be processed via this tool — contact your payment provider to collect additional funds separately.`;

  const confirmed = confirm(`${diffDisplay}\n\nSave adjustment?`);
  if (!confirmed) return;

  button.disabled = true;
  button.textContent = 'Saving...';

  // If new total is lower, issue partial refund for the difference
  if (diff < 0 && request.payment_intent_id) {
    const refundCents = Math.round(Math.abs(diff) * 100);
    const res = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'refund', payment_intent_id: request.payment_intent_id, request_id: request.id, amount_cents: refundCents, caller_token: adminAuthToken() }),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      button.disabled = false;
      button.textContent = 'Save adjustment';
      alert(`Refund failed: ${result.error || 'Unknown error'}. No changes saved.`);
      return;
    }
  }

  const timestamp = new Date().toISOString();
  const adjustNote = `[payment_adjustment ${timestamp}] Total changed from ${money(oldTotal)} to ${money(newTotal)}. Fuel: ${money(fuelReceipt)} + fee ${money(fuelFee)}, Wash: ${money(washReceipt)} + fee ${money(washFee)}, Add-ons fee: ${money(inspFee)}.`;
  const notes = request.notes ? `${request.notes}\n${adjustNote}` : adjustNote;
  const newPaymentStatus = diff < 0 ? 'refunded' : 'captured';

  const { error } = await db.rpc('admin_update_request', {
    p_token: adminAuthToken(),
    p_request_id: requestId,
    p_data: { final_total: newTotal, payment_status: newPaymentStatus, notes },
  });

  if (error) throw error;

  panel.hidden = true;
  panel.innerHTML = '';
  await loadRequests();
}

requestList.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;

  try {
    if (button.classList.contains('queue-summary-toggle')) {
      const id = button.dataset.id;
      expandedSummaryId = expandedSummaryId === id ? null : id;
      expandedRequestId = null;
      renderRequests();
      return;
    }

    if (button.classList.contains('queue-row-toggle')) {
      const id = button.dataset.id;
      expandedRequestId = expandedRequestId === id ? null : id;
      expandedSummaryId = null;
      renderRequests();
      return;
    }

    if (button.classList.contains('inline-show-all')) {
      showAllTime = true;
      renderRequests();
      return;
    }

    if (button.classList.contains('inline-range-all')) {
      dashboardRange = 'all';
      if (dashboardRangeSelect) dashboardRangeSelect.value = 'all';
      if (customRangeInputs) customRangeInputs.hidden = true;
      applyDashboardRange();
      return;
    }

    if (button.classList.contains('inline-clear-filters')) {
      clearQueueFilters();
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
        panel.querySelector('.deny-reason-select')?.focus();
      }
      return;
    }

    if (button.classList.contains('cancel-deny-reason')) {
      const panel = button.closest('.deny-reason-panel');
      if (panel) {
        panel.hidden = true;
        const sel = panel.querySelector('.deny-reason-select');
        if (sel) sel.value = '';
        const otherWrap = panel.querySelector('.deny-reason-other-wrap');
        if (otherWrap) otherWrap.hidden = true;
        const errorEl = panel.querySelector('.deny-reason-error');
        if (errorEl) errorEl.textContent = '';
      }
      return;
    }

    if (button.classList.contains('save-deny-reason')) {
      await saveDenyReason(button);
      return;
    }

    if (button.classList.contains('retry-release-hold')) {
      await retryReleaseHold(button);
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

    if (button.classList.contains('capture-and-proceed')) {
      await captureAndProceed(button);
      return;
    }

    if (button.classList.contains('retry-payment-capture')) {
      await retryPaymentCapture(button);
      return;
    }

    if (button.classList.contains('proceed-to-key-return')) {
      await proceedToKeyReturn(button);
      return;
    }

    if (button.classList.contains('admin-submit-keys-returned')) {
      await submitAdminKeysReturned(button);
      return;
    }

    if (button.classList.contains('waive-return-fee')) {
      await resolveReturnRequest(button, 'waive');
      return;
    }

    if (button.classList.contains('charge-return-fee')) {
      await resolveReturnRequest(button, 'charge_fee');
      return;
    }

    if (button.classList.contains('continue-return-service')) {
      await resolveReturnRequest(button, 'continue_service');
      return;
    }

    if (button.classList.contains('send-to-customer-payment')) {
      await sendToCustomerPayment(button);
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

    if (button.classList.contains('edit-total-charge-btn')) {
      editTotalChargeOpen(button);
      return;
    }

    if (button.classList.contains('save-edit-total-btn')) {
      await saveEditTotalCharge(button);
      return;
    }

    if (button.classList.contains('cancel-edit-total-btn')) {
      const panel = document.getElementById(`edit-total-panel-${button.dataset.requestId}`);
      if (panel) { panel.hidden = true; panel.innerHTML = ''; }
      return;
    }
  } catch (error) {
    console.error(error);
    alert('Something went wrong. Check the console for details.');
    button.disabled = false;
  }
});

requestList.addEventListener('change', (event) => {
  if (event.target.classList.contains('deny-reason-select')) {
    const panel = event.target.closest('.deny-reason-panel');
    const otherWrap = panel?.querySelector('.deny-reason-other-wrap');
    if (otherWrap) otherWrap.hidden = event.target.value !== 'Other';
    return;
  }
  if (event.target.classList.contains('service-unable-reason')) {
    const panel = event.target.closest('.service-unable-panel');
    const otherWrap = panel?.querySelector('.service-unable-other-wrap');
    if (otherWrap) otherWrap.hidden = event.target.value !== 'Other';
    return;
  }
  if (event.target.classList.contains('key-returned-to-type')) {
    const panel = event.target.closest('.keys-returned-panel');
    const otherWrap = panel?.querySelector('.key-returned-other-wrap');
    const otherInput = panel?.querySelector('.key-returned-other-name');
    const isOther = event.target.value === 'other';
    if (otherWrap) otherWrap.hidden = !isOther;
    if (otherInput) {
      otherInput.required = isOther;
      if (!isOther) otherInput.value = '';
    }
    return;
  }
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

// Live-echo the confirmed door-jamb PSI next to every tire as it's typed.
requestList.addEventListener('input', (event) => {
  if (!event.target.classList.contains('inspection-doorjamb')) return;
  const panel = event.target.closest('.inspection-panel');
  if (!panel) return;
  const value = event.target.value.trim() || '—';
  panel.querySelectorAll('.doorjamb-echo').forEach((el) => { el.textContent = value; });
});

showAll?.addEventListener('click', () => {
  setActiveStatCard(null);
  currentView = 'all';
  showAllTime = false;
  switchAdminTab('requests');
  renderRequests();
});
showOpen?.addEventListener('click', () => {
  setActiveStatCard(null);
  currentView = 'open';
  showAllTime = false;
  switchAdminTab('requests');
  renderRequests();
});
showInProgress?.addEventListener('click', () => {
  setActiveStatCard(null);
  currentView = 'in_progress';
  showAllTime = false;
  switchAdminTab('requests');
  renderRequests();
});
showComplete?.addEventListener('click', () => {
  setActiveStatCard(null);
  currentView = 'completed_today';
  showAllTime = false;
  switchAdminTab('requests');
  renderRequests();
});
showDenied?.addEventListener('click', () => {
  setActiveStatCard(null);
  currentView = 'cancelled';
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

const customRangeInputs = document.querySelector('#custom-range-inputs');
const customRangeStart = document.querySelector('#custom-range-start');
const customRangeEnd = document.querySelector('#custom-range-end');

function applyDashboardRange() {
  // History views (Completed/Closed) are date-scoped, so re-render the queue too.
  updateDashboardStatCards();
  renderRequests();
}

dashboardRangeSelect?.addEventListener('change', () => {
  dashboardRange = dashboardRangeSelect.value;
  if (customRangeInputs) customRangeInputs.hidden = dashboardRange !== 'custom';
  // For a brand-new custom selection with no dates yet, behave like "all" until
  // the user picks dates (handled by dashboardRangeBounds returning nulls).
  applyDashboardRange();
});

const customRangeApply = document.querySelector('#custom-range-apply');

// Custom range only takes effect when the user clicks Apply — this avoids
// half-finished filtering while they're still picking the start/end dates.
customRangeApply?.addEventListener('click', () => {
  customRange.start = customRangeStart?.value || '';
  customRange.end = customRangeEnd?.value || '';
  dashboardRange = 'custom';
  applyDashboardRange();
});

// Pressing Enter in either date field applies too.
[customRangeStart, customRangeEnd].forEach((el) => {
  el?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); customRangeApply?.click(); }
  });
});

dashboardFiltersBtn?.addEventListener('click', () => {
  if (!dashboardFiltersPanel) return;
  dashboardFiltersPanel.hidden = !dashboardFiltersPanel.hidden;
  dashboardFiltersBtn.setAttribute('aria-expanded', String(!dashboardFiltersPanel.hidden));
});

document.addEventListener('click', (event) => {
  if (!dashboardFiltersPanel || dashboardFiltersPanel.hidden) return;
  if (event.target.closest('.admin-filters-wrap')) return;
  dashboardFiltersPanel.hidden = true;
  dashboardFiltersBtn?.setAttribute('aria-expanded', 'false');
});

function activeFilterCount() {
  return [queueFilters.search, queueFilters.serviceType, queueFilters.status, queueFilters.worker, queueFilters.payment]
    .filter(Boolean).length;
}

function updateFiltersButtonState() {
  const count = activeFilterCount();
  dashboardFiltersBtn?.classList.toggle('has-active-filters', count > 0);
  // Show the active-filter count right in the button label.
  if (dashboardFiltersBtn) {
    let badge = dashboardFiltersBtn.querySelector('.filter-count-badge');
    if (count > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'filter-count-badge';
        dashboardFiltersBtn.appendChild(badge);
      }
      badge.textContent = count;
    } else if (badge) {
      badge.remove();
    }
  }
}

// Populate the Worker filter dropdown from the active employee list.
function populateFilterWorkers() {
  if (!filterWorkerSelect) return;
  const current = filterWorkerSelect.value;
  const active = allEmployees
    .filter((e) => e.active)
    .sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || '')));
  filterWorkerSelect.innerHTML =
    '<option value="">Any worker</option>' +
    '<option value="__unassigned">Unassigned</option>' +
    active.map((e) => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.full_name)}</option>`).join('');
  if ([...filterWorkerSelect.options].some((o) => o.value === current)) filterWorkerSelect.value = current;
}

// Populate the Status filter with only the statuses present in the current data,
// labelled with their friendly names and sorted alphabetically by label.
function populateFilterStatuses() {
  if (!filterStatusSelect) return;
  const current = filterStatusSelect.value;
  const present = [...new Set(allRequests.map((r) => r.status).filter(Boolean))]
    .map((s) => ({ value: s, label: statusLabels[s] || s }))
    .sort((a, b) => a.label.localeCompare(b.label));
  filterStatusSelect.innerHTML =
    '<option value="">Any status</option>' +
    present.map((s) => `<option value="${escapeHtml(s.value)}">${escapeHtml(s.label)}</option>`).join('');
  if ([...filterStatusSelect.options].some((o) => o.value === current)) filterStatusSelect.value = current;
}

filterSearchInput?.addEventListener('input', () => {
  queueFilters.search = filterSearchInput.value;
  updateFiltersButtonState();
  renderRequests();
});

filterServiceTypeSelect?.addEventListener('change', () => {
  queueFilters.serviceType = filterServiceTypeSelect.value;
  updateFiltersButtonState();
  renderRequests();
});

filterStatusSelect?.addEventListener('change', () => {
  queueFilters.status = filterStatusSelect.value;
  updateFiltersButtonState();
  renderRequests();
});

filterWorkerSelect?.addEventListener('change', () => {
  queueFilters.worker = filterWorkerSelect.value;
  updateFiltersButtonState();
  renderRequests();
});

filterPaymentSelect?.addEventListener('change', () => {
  queueFilters.payment = filterPaymentSelect.value;
  updateFiltersButtonState();
  renderRequests();
});

filterSortSelect?.addEventListener('change', () => {
  queueFilters.sort = filterSortSelect.value;
  renderRequests();
});

function clearQueueFilters() {
  queueFilters = { search: '', serviceType: '', status: '', worker: '', payment: '', sort: queueFilters.sort || 'newest' };
  if (filterSearchInput) filterSearchInput.value = '';
  if (filterServiceTypeSelect) filterServiceTypeSelect.value = '';
  if (filterStatusSelect) filterStatusSelect.value = '';
  if (filterWorkerSelect) filterWorkerSelect.value = '';
  if (filterPaymentSelect) filterPaymentSelect.value = '';
  updateFiltersButtonState();
  renderRequests();
}

filterClearBtn?.addEventListener('click', () => {
  clearQueueFilters();
  if (dashboardFiltersPanel) dashboardFiltersPanel.hidden = true;
  dashboardFiltersBtn?.setAttribute('aria-expanded', 'false');
});

// ── Payroll tab ─────────────────────────────────────────────────────────────
let payrollRange = 'week';

function payrollRequestDate(request) {
  return new Date(request.completed_at || request.canceled_at || request.updated_at || request.created_at);
}

// Company-net breakdown for a set of requests (those matching `inRange`). Single
// source of truth so the dashboard "Company Net" tile and the Payroll tab always
// agree: service fees (captured) + cancellation fees collected − worker payouts.
function companyNetBreakdown(inRange) {
  const reqs = allRequests || [];
  const serviceFeeRevenue = reqs
    .filter((r) => r.payment_status === 'captured' && inRange(r))
    .reduce((s, r) => s + Number(r.displayed_fuel_service_fee || 0) + Number(r.displayed_car_wash_service_fee || 0) + Number(r.displayed_inspection_fee || 0), 0);
  const cancellationRevenue = reqs
    .filter((r) => r.payment_status === 'cancellation_fee_paid' && inRange(r))
    .reduce((s, r) => s + Number(r.cancellation_fee ?? r.cancellation_fee_amount ?? 0), 0);
  const workerPayouts = reqs
    .filter((r) => inRange(r))
    .reduce((s, r) => s + workerPayoutForRequest(r), 0);
  const companyNet = roundMoneyValue(serviceFeeRevenue + cancellationRevenue - workerPayouts);
  return { serviceFeeRevenue, cancellationRevenue, workerPayouts, companyNet };
}

function renderPayroll() {
  const container = document.getElementById('payroll-content');
  if (!container) return;
  const { start, end } = dashboardRangeBounds(payrollRange);
  const inRange = (r) => {
    const d = payrollRequestDate(r);
    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  };

  // Requests that earned a worker something this period.
  const earning = (allRequests || []).filter((r) => inRange(r) && workerPayoutForRequest(r) > 0);

  const byWorker = new Map();
  for (const r of earning) {
    const key = r.assigned_employee_id || r.assigned_worker_name;
    if (!key) continue;
    const name = r.assigned_worker_name
      || (allEmployees || []).find((e) => e.id === r.assigned_employee_id)?.full_name
      || (allEmployees || []).find((e) => e.id === r.assigned_employee_id)?.name
      || 'Unknown worker';
    const entry = byWorker.get(key) || { key, employeeId: r.assigned_employee_id || null, name, jobs: 0, mileage: 0, total: 0, drivenMiles: 0 };
    entry.jobs += 1;
    entry.mileage += workerMileagePay(r);
    entry.total += workerPayoutForRequest(r);
    entry.drivenMiles += Number(r.driven_miles) || 0; // GPS-verified actual miles (audit, not pay)
    byWorker.set(key, entry);
  }
  const rows = [...byWorker.values()].sort((a, b) => b.total - a.total);

  // Summary figures come from the shared helper so this tab and the dashboard
  // "Company Net" tile can never drift. (Cancellation fees are collected on jobs
  // that aren't "captured", so they're counted separately or company net is
  // understated while the worker's cut is still subtracted.)
  const { serviceFeeRevenue, cancellationRevenue, workerPayouts, companyNet } = companyNetBreakdown(inRange);
  const rangeLabel = dashboardRangeLabel(payrollRange);

  // ── Payout tracker state for this period ──────────────────────────────────
  const { key: periodKey, label: periodLabel } = payrollPeriodMeta(payrollRange);
  const payouts = payrollPayoutsByKey[periodKey];
  const payoutsReady = Array.isArray(payouts);
  if (!payoutsReady && !payrollPayoutsLoading[periodKey]) loadPayrollPayouts(periodKey);
  const paidByKey = new Map();
  if (payoutsReady) {
    for (const p of payouts) {
      if (p.status !== 'paid') continue;
      paidByKey.set(p.employee_id || p.worker_name, p);
    }
  }
  const paidCount = rows.filter((e) => paidByKey.has(e.key)).length;
  const outstanding = roundMoneyValue(
    rows.filter((e) => !paidByKey.has(e.key)).reduce((s, e) => s + e.total, 0)
  );

  const statusCell = (e) => {
    if (!payoutsReady) return '<span class="field-help" style="display:inline">…</span>';
    const paid = paidByKey.get(e.key);
    if (paid) {
      const when = paid.paid_at ? new Date(paid.paid_at).toLocaleDateString() : '';
      const ref = paid.reference ? ` · ${escapeHtml(paid.reference)}` : '';
      return `<span class="payout-paid-badge" title="${escapeHtml(payoutMethodLabel(paid.method))}${ref}">Paid · ${escapeHtml(payoutMethodLabel(paid.method))}${when ? ' · ' + escapeHtml(when) : ''}</span> <button type="button" class="payout-undo-link" data-void-payout="${escapeHtml(paid.id)}">Undo</button>`;
    }
    const emp = e.employeeId ? (allEmployees || []).find((x) => x.id === e.employeeId) : null;
    const stripeReady = !!(emp && emp.stripe_connect_ready);
    const stripeBtn = stripeReady
      ? `<button type="button" class="button primary payout-stripe-btn" data-stripe-pay-employee="${escapeHtml(e.employeeId)}" data-name="${escapeHtml(e.name)}" data-amount="${roundMoneyValue(e.total)}">Pay via Stripe</button> `
      : '';
    return `${stripeBtn}<button type="button" class="button secondary payout-pay-btn" data-pay-employee="${escapeHtml(e.key)}" data-employee-id="${escapeHtml(e.employeeId || '')}" data-name="${escapeHtml(e.name)}" data-amount="${roundMoneyValue(e.total)}">Mark paid</button>`;
  };
  const payrollCards = rows.map((e) => `
    <article class="payroll-worker-card">
      <div class="payroll-worker-card-head">
        <strong>${escapeHtml(e.name)}</strong>
        <span>${e.jobs} job${e.jobs === 1 ? '' : 's'}</span>
        </div>
      </details>
      <dl>
        <div><dt>Station mileage</dt><dd>${money(roundMoneyValue(e.mileage))}</dd></div>
        <div><dt>Driven (GPS)</dt><dd>${e.drivenMiles ? e.drivenMiles.toFixed(1) + ' mi' : 'None'}</dd></div>
        <div><dt>Earnings</dt><dd>${money(roundMoneyValue(e.total))}</dd></div>
      </dl>
      <div class="payroll-payment-cell">${statusCell(e)}</div>
    </article>
  `).join('');

  container.innerHTML = `
    <div class="payroll-summary-grid">
      <div class="payroll-summary-card"><span class="payroll-summary-label">Service fee revenue</span><span class="payroll-summary-value">${money(roundMoneyValue(serviceFeeRevenue))}</span></div>
      <div class="payroll-summary-card"><span class="payroll-summary-label">Cancellation fees</span><span class="payroll-summary-value">${money(roundMoneyValue(cancellationRevenue))}</span></div>
      <div class="payroll-summary-card"><span class="payroll-summary-label">Worker payouts</span><span class="payroll-summary-value">− ${money(roundMoneyValue(workerPayouts))}</span></div>
      <div class="payroll-summary-card payroll-summary-card--net"><span class="payroll-summary-label">Company net · ${escapeHtml(rangeLabel)}</span><span class="payroll-summary-value">${money(companyNet)}</span></div>
    </div>
    <p class="field-help">Company net = service fees + cancellation fees − worker payouts. Shown before Stripe processing fees; excludes fuel/wash cost (pass-through to the customer) and the per-mile surcharge margin.</p>
    ${rows.length ? `
      <p class="payroll-paid-summary">${payoutsReady ? `${paidCount}/${rows.length} workers paid · ${money(outstanding)} outstanding` : 'Loading payment status…'}</p>
      <table class="payroll-table">
        <thead><tr><th>Worker</th><th>Jobs</th><th>Station mileage</th><th>Driven (GPS)</th><th>Earnings</th><th>Payment</th></tr></thead>
        <tbody>
          ${rows.map((e) => `<tr><td>${escapeHtml(e.name)}</td><td>${e.jobs}</td><td>${money(roundMoneyValue(e.mileage))}</td><td>${e.drivenMiles ? e.drivenMiles.toFixed(1) + ' mi' : '—'}</td><td><strong>${money(roundMoneyValue(e.total))}</strong></td><td class="payroll-payment-cell">${statusCell(e)}</td></tr>`).join('')}
        </tbody>
      </table>
      <div class="payroll-card-list">${payrollCards}</div>
    ` : `<div class="worker-state-card"><p>No worker earnings in this period yet.</p></div>`}
  `;
}

document.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-payroll-range]');
  if (!btn) return;
  payrollRange = btn.dataset.payrollRange;
  document.querySelectorAll('[data-payroll-range]').forEach((b) => b.classList.toggle('active', b === btn));
  renderPayroll();
});

// ── Payout tracker (Phase 1: record who's been paid each period) ─────────────
// Earnings are computed in renderPayroll; this layer records the *payment* of
// those earnings into the worker_payouts ledger so the admin can see who is
// still outstanding. Stripe Connect (Phase 2) will write into the same ledger.
let payrollPayoutsByKey = {};
const payrollPayoutsLoading = {};

const PAYOUT_METHOD_LABELS = {
  manual: 'Manual',
  zelle: 'Zelle',
  venmo: 'Venmo',
  cash: 'Cash',
  bank: 'Bank',
  stripe_connect: 'Stripe',
};
function payoutMethodLabel(method) {
  return PAYOUT_METHOD_LABELS[method] || method || 'Manual';
}

// A stable key for the visible period so payments scope to exactly what's shown.
function payrollPeriodMeta(range) {
  const { start } = dashboardRangeBounds(range);
  const key = `${range}:${start ? start.toISOString().slice(0, 10) : 'all'}`;
  return { key, label: dashboardRangeLabel(range) };
}

async function loadPayrollPayouts(periodKey) {
  if (payrollPayoutsLoading[periodKey]) return;
  payrollPayoutsLoading[periodKey] = true;
  try {
    const { data, error } = await db.rpc('admin_list_payouts', {
      p_token: adminAuthToken(),
      p_period_key: periodKey,
    });
    if (error) throw error;
    payrollPayoutsByKey[periodKey] = data || [];
  } catch (err) {
    console.warn('Could not load payouts:', err?.message || err);
    payrollPayoutsByKey[periodKey] = payrollPayoutsByKey[periodKey] || [];
  } finally {
    payrollPayoutsLoading[periodKey] = false;
    renderPayroll();
  }
}

async function recordPayout(opts) {
  const { error } = await db.rpc('admin_record_payout', {
    p_token: adminAuthToken(),
    p_employee_id: opts.employeeId || null,
    p_worker_name: opts.name || null,
    p_period_key: opts.periodKey,
    p_period_label: opts.periodLabel || null,
    p_amount: Number(opts.amount) || 0,
    p_method: opts.method || 'manual',
    p_reference: opts.reference || null,
    p_notes: null,
  });
  if (error) throw error;
  delete payrollPayoutsByKey[opts.periodKey];
  loadPayrollPayouts(opts.periodKey);
}

async function voidPayout(id) {
  if (!window.confirm('Undo this recorded payment? The worker will show as unpaid again for this period.')) return;
  const { key } = payrollPeriodMeta(payrollRange);
  const { error } = await db.rpc('admin_void_payout', { p_token: adminAuthToken(), p_payout_id: id });
  if (error) {
    window.alert('Could not undo the payment: ' + (error.message || error));
    return;
  }
  delete payrollPayoutsByKey[key];
  loadPayrollPayouts(key);
}

// Phase 2: transfer a worker's pay through Stripe Connect. The serverless
// function both moves the money and records it into worker_payouts, so we just
// reload the ledger afterwards.
async function payViaStripe(opts) {
  if (!window.confirm(`Send ${money(roundMoneyValue(opts.amount))} to ${opts.name} via Stripe direct deposit?`)) return;
  const meta = payrollPeriodMeta(payrollRange);
  try {
    const res = await fetch('/api/payouts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'connect_transfer',
        caller_token: adminAuthToken(),
        employee_id: opts.employeeId,
        amount: Number(opts.amount),
        period_key: meta.key,
        period_label: meta.label,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      window.alert(data.error || 'Stripe payout failed.');
      return;
    }
    if (data.ledger_warning) {
      window.alert('Payment sent, but recording it failed: ' + data.ledger_warning);
    }
    delete payrollPayoutsByKey[meta.key];
    loadPayrollPayouts(meta.key);
  } catch (err) {
    window.alert('Stripe payout failed: ' + (err.message || err));
  }
}

// Lazily-built "record payment" modal, reused across clicks.
let payoutModalEls = null;
function ensurePayoutModal() {
  if (payoutModalEls) return payoutModalEls;
  const backdrop = document.createElement('div');
  backdrop.className = 'sf-payout-modal-backdrop';
  backdrop.hidden = true;
  backdrop.innerHTML = `
    <div class="sf-payout-modal" role="dialog" aria-modal="true" aria-labelledby="payout-modal-title">
      <h3 id="payout-modal-title">Record payment</h3>
      <p class="sf-payout-modal-sub"></p>
      <label>Amount paid
        <input type="number" id="payout-amount" step="0.01" min="0" inputmode="decimal">
      </label>
      <label>Method
        <select id="payout-method">
          <option value="manual">Manual / Other</option>
          <option value="zelle">Zelle</option>
          <option value="venmo">Venmo</option>
          <option value="cash">Cash</option>
          <option value="bank">Bank transfer / Direct deposit</option>
        </select>
      </label>
      <label>Reference <span class="field-help" style="display:inline">optional</span>
        <input type="text" id="payout-reference" placeholder="e.g. Zelle confirmation #" autocomplete="off">
      </label>
      <p class="form-status" id="payout-modal-status"></p>
      <div class="sf-payout-modal-actions">
        <button type="button" class="button secondary" id="payout-cancel">Cancel</button>
        <button type="button" class="button primary" id="payout-confirm">Record payment</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);

  const els = {
    backdrop,
    sub: backdrop.querySelector('.sf-payout-modal-sub'),
    amount: backdrop.querySelector('#payout-amount'),
    method: backdrop.querySelector('#payout-method'),
    reference: backdrop.querySelector('#payout-reference'),
    status: backdrop.querySelector('#payout-modal-status'),
    confirm: backdrop.querySelector('#payout-confirm'),
    cancel: backdrop.querySelector('#payout-cancel'),
  };

  const close = () => { backdrop.hidden = true; els.current = null; };
  els.cancel.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  els.confirm.addEventListener('click', async () => {
    if (!els.current) return;
    els.confirm.disabled = true;
    els.status.textContent = 'Saving…';
    try {
      await recordPayout({
        ...els.current,
        amount: els.amount.value,
        method: els.method.value,
        reference: els.reference.value.trim(),
      });
      close();
    } catch (err) {
      els.status.textContent = 'Could not record payment: ' + (err.message || err);
    } finally {
      els.confirm.disabled = false;
    }
  });

  payoutModalEls = els;
  return els;
}

function openPayoutModal(opts) {
  const els = ensurePayoutModal();
  els.current = opts;
  els.sub.innerHTML = `Paying <strong>${escapeHtml(opts.name)}</strong> for ${escapeHtml(opts.periodLabel || 'this period')}.`;
  els.amount.value = Number(opts.amount) || 0;
  els.method.value = 'manual';
  els.reference.value = '';
  els.status.textContent = '';
  els.backdrop.hidden = false;
  els.amount.focus();
}

document.addEventListener('click', (event) => {
  const payBtn = event.target.closest('[data-pay-employee]');
  if (payBtn) {
    const meta = payrollPeriodMeta(payrollRange);
    openPayoutModal({
      key: payBtn.dataset.payEmployee,
      employeeId: payBtn.dataset.employeeId || null,
      name: payBtn.dataset.name,
      amount: payBtn.dataset.amount,
      periodKey: meta.key,
      periodLabel: meta.label,
    });
    return;
  }
  const stripeBtn = event.target.closest('[data-stripe-pay-employee]');
  if (stripeBtn) {
    payViaStripe({
      employeeId: stripeBtn.dataset.stripePayEmployee,
      name: stripeBtn.dataset.name,
      amount: stripeBtn.dataset.amount,
    });
    return;
  }
  const voidBtn = event.target.closest('[data-void-payout]');
  if (voidBtn) voidPayout(voidBtn.dataset.voidPayout);
});

// ── Admin Stripe controls on worker profiles (Connect link, fuel card) ───────
function setStripeStatus(id, msg, isError) {
  const el = document.querySelector(`.admin-stripe-status[data-worker-id="${(window.CSS && CSS.escape) ? CSS.escape(id) : id}"]`);
  if (el) { el.textContent = msg; el.style.color = isError ? 'var(--sf-danger)' : ''; }
}

async function postStaffApi(path, payload) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caller_token: adminAuthToken(), ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && !data.error, data };
}

document.addEventListener('click', async (event) => {
  const linkBtn = event.target.closest('.worker-connect-link');
  if (linkBtn) {
    const id = linkBtn.dataset.id;
    linkBtn.disabled = true;
    setStripeStatus(id, 'Generating link…');
    const { ok, data } = await postStaffApi('/api/payouts', { action: 'connect_onboarding_link', employee_id: id });
    if (!ok || !data.url) {
      setStripeStatus(id, data.error || 'Could not generate the setup link.', true);
    } else {
      try {
        await navigator.clipboard.writeText(data.url);
        setStripeStatus(id, 'Setup link copied — send it to the worker to finish onboarding.');
      } catch {
        setStripeStatus(id, 'Setup link: ' + data.url);
      }
    }
    linkBtn.disabled = false;
    return;
  }

  const issueBtn = event.target.closest('.worker-issue-card');
  if (issueBtn) {
    const id = issueBtn.dataset.id;
    if (!window.confirm('Issue a virtual fuel & car-wash card for this worker? (Fuel/wash merchants only, $150 per transaction.)')) return;
    issueBtn.disabled = true;
    setStripeStatus(id, 'Issuing card…');
    const { ok, data } = await postStaffApi('/api/fuel-cards', { action: 'issue_card', employee_id: id });
    if (!ok) {
      setStripeStatus(id, data.error || 'Could not issue the card.', true);
      issueBtn.disabled = false;
    } else {
      setStripeStatus(id, `Card issued · •••• ${data.last4 || ''}.`);
      loadEmployees();
    }
    return;
  }

  const toggleBtn = event.target.closest('.worker-card-toggle');
  if (toggleBtn) {
    const id = toggleBtn.dataset.id;
    const next = toggleBtn.dataset.status === 'inactive' ? 'active' : 'inactive';
    toggleBtn.disabled = true;
    setStripeStatus(id, next === 'inactive' ? 'Freezing card…' : 'Unfreezing card…');
    const { ok, data } = await postStaffApi('/api/fuel-cards', { action: 'set_card_status', employee_id: id, which: 'virtual', status: next });
    if (!ok) {
      setStripeStatus(id, data.error || 'Could not update the card.', true);
      toggleBtn.disabled = false;
    } else {
      setStripeStatus(id, data.status === 'inactive' ? 'Card frozen.' : 'Card active.');
      loadEmployees();
    }
    return;
  }

  const orderPhysBtn = event.target.closest('.worker-order-phys');
  if (orderPhysBtn) {
    const id = orderPhysBtn.dataset.id;
    if (!window.confirm('Order a physical fuel & car-wash card mailed to the company address? (Same $150 per-transaction cap.)')) return;
    orderPhysBtn.disabled = true;
    setStripeStatus(id, 'Ordering physical card…');
    const { ok, data } = await postStaffApi('/api/fuel-cards', { action: 'order_physical_card', employee_id: id });
    if (!ok) {
      setStripeStatus(id, data.error || 'Could not order the card.', true);
      orderPhysBtn.disabled = false;
    } else {
      setStripeStatus(id, `Physical card ordered · •••• ${data.last4 || ''}. Activate it once it arrives.`);
      loadEmployees();
    }
    return;
  }

  const physActivateBtn = event.target.closest('.worker-phys-activate');
  if (physActivateBtn) {
    const id = physActivateBtn.dataset.id;
    physActivateBtn.disabled = true;
    setStripeStatus(id, 'Activating card…');
    const { ok, data } = await postStaffApi('/api/fuel-cards', { action: 'activate_physical_card', employee_id: id });
    if (!ok) {
      setStripeStatus(id, data.error || 'Could not activate the card.', true);
      physActivateBtn.disabled = false;
    } else {
      setStripeStatus(id, 'Physical card active — ready to tap at the pump.');
      loadEmployees();
    }
    return;
  }

  const physToggleBtn = event.target.closest('.worker-phys-toggle');
  if (physToggleBtn) {
    const id = physToggleBtn.dataset.id;
    const next = physToggleBtn.dataset.status === 'inactive' ? 'active' : 'inactive';
    physToggleBtn.disabled = true;
    setStripeStatus(id, next === 'inactive' ? 'Freezing card…' : 'Unfreezing card…');
    const { ok, data } = await postStaffApi('/api/fuel-cards', { action: 'set_card_status', employee_id: id, which: 'physical', status: next });
    if (!ok) {
      setStripeStatus(id, data.error || 'Could not update the card.', true);
      physToggleBtn.disabled = false;
    } else {
      setStripeStatus(id, data.status === 'inactive' ? 'Physical card frozen.' : 'Physical card active.');
      loadEmployees();
    }
    return;
  }
});

function switchPageTab(page) {
  currentPageTab = page;
  // Expose the active page so CSS can hide the dashboard-only sidebar/shortcuts
  // on mobile when viewing a non-dashboard tab (they're the persistent right
  // rail on desktop, but stack onto every tab on phones).
  document.body.dataset.adminPage = page;
  adminPageTabs.forEach((btn) => btn.classList.toggle('active', btn.dataset.page === page));
  document.querySelectorAll('[data-page-section]').forEach((el) => {
    const belongs = el.dataset.pageSection.split(' ').includes(page);
    if (!belongs) {
      el.hidden = true;
    } else if (!el.hasAttribute('data-conditional')) {
      // Conditional "needs attention" sections decide their own visibility from
      // data (renderActionNeeded / loadPendingAuthorizations / loadReauthNeeded);
      // don't force them visible just because the page matches — that left them
      // showing an empty card when nothing actually needed attention.
      el.hidden = false;
    }
  });
  // Recompute the data-driven sections for the page we're entering.
  renderActionNeeded();
  if (page === 'dashboard') {
    loadPendingAuthorizations();
    loadReauthNeeded();
  }
  if (page === 'requests') {
    currentView = 'all';
    switchAdminTab('requests');
  }
  if (page === 'dashboard') {
    currentView = 'open';
    switchAdminTab('requests');
  }
  if (page === 'services') {
    Promise.all([loadFuelPricesForAdmin(), loadServicePricing()]).then(([fuelData, pricingData]) => {
      showPricingPendingBanner(fuelData, pricingData);
    });
  }
  if (page === 'workers') {
    // Normal navigation to Workers shows everyone; the snapshot rows set a filter
    // AFTER calling switchPageTab, so their filter still wins.
    workerPresenceFilter = null;
    renderWorkerProfiles();
  }
  if (page === 'settings') {
    setTimeout(() => window._saOpenEditor?.(), 80);
  }
  if (page === 'payroll') {
    renderPayroll();
  }
  if (page === 'services') {
    loadPromos();
  }
  renderRequests();
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
document.querySelectorAll('[data-page-action]').forEach((btn) => {
  btn.addEventListener('click', () => {
    switchPageTab(btn.dataset.pageAction);
    if (btn.dataset.requestView) {
      currentView = normalizeRequestFilter(btn.dataset.requestView);
      renderRequests();
    }
  });
});
adminRefreshBtn?.addEventListener('click', () => refreshAdminView(adminRefreshBtn));
adminSideRefreshBtn?.addEventListener('click', () => refreshAdminView(adminSideRefreshBtn));
adminReviewsRefreshBtn?.addEventListener('click', () => refreshAdminView(adminReviewsRefreshBtn));

// ── Dashboard stat card drilldown ────────────────────────────────────────────

// ── Stat card inline filtering ────────────────────────────────────────────────

let activeStatCard = null;

function setActiveStatCard(cardId) {
  document.querySelectorAll('.admin-stat-card--clickable').forEach((c) => c.classList.remove('stat-card--active'));
  if (cardId) document.getElementById(`stat-card-${cardId}`)?.classList.add('stat-card--active');
  activeStatCard = cardId;
  // Stat cards render into the requests panel — make sure it's the visible tab
  // (the user may have switched to reviews/applicants first).
  if (cardId) switchAdminTab('requests');
  // When a stat tile drives the view, the tiles ARE the navigation — hide the
  // All/Open/In Progress/Completed/Closed sub-tabs so only that subset shows.
  const queueTabs = document.querySelector('.admin-request-tabs');
  if (queueTabs) queueTabs.classList.toggle('cr-hidden', !!cardId);
  // The Workers / Revenue drilldowns aren't requests, so the request toolbar
  // (Search Requests / date / filters / refresh) doesn't belong over them.
  const queueSection = document.querySelector('.admin-queue-section');
  if (queueSection) queueSection.classList.toggle('stat-drilldown', cardId === 'workers' || cardId === 'revenue');
}

function statCardNav(view, cardId) {
  setActiveStatCard(cardId);
  currentView = normalizeRequestFilter(view);
  if (currentView === 'completed_today') showAllTime = false;
  renderRequests();
  requestList?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function openWorkersPanel() {
  setActiveStatCard('workers');

  const active = allEmployees.filter((e) => e.active);
  const busy   = new Set(
    allRequests
      .filter((r) => isOpen(r) && (r.assigned_employee_id || r.assigned_worker_name))
      .map((r) => r.assigned_employee_id || r.assigned_worker_name)
  );

  if (!requestList) return;

  if (!active.length) {
    requestList.innerHTML = '<div class="empty-state"><p>No active workers right now.</p></div>';
  } else {
    const rows = active.map((e) => {
      const isBusy = busy.has(e.id) || busy.has(e.full_name);
      const statusLabel = isBusy ? 'Busy' : 'Available';
      const statusClass = isBusy ? 'status-pill-progress' : 'status-pill-complete';
      return `<tr class="queue-row" data-worker-id="${escapeHtml(e.id)}">
        <td data-label="Name">
          <div class="queue-customer-cell">
            <span class="queue-avatar">${escapeHtml(queueInitials(e.full_name))}</span>
            <div>
              <strong>${escapeHtml(e.full_name)}</strong>
              <span class="field-help">${escapeHtml(e.employee_code || '')}</span>
            </div>
          </div>
        </td>
        <td data-label="Phone">${e.phone ? escapeHtml(formatPhone(e.phone)) : '<span class="field-help">Not provided</span>'}</td>
        <td data-label="Status"><span class="status-pill ${statusClass}">${statusLabel}</span></td>
        <td data-label="Action">
          <div class="queue-next-action-cell">
            <button class="button secondary workers-view-worker" data-id="${escapeHtml(e.id)}" type="button">View Worker</button>
          </div>
        </td>
      </tr>`;
    }).join('');
    requestList.innerHTML = `
      <table class="admin-requests-table">
        <thead><tr><th>Name</th><th>Phone</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  if (requestQueueHeading) requestQueueHeading.textContent = 'Active Workers';
  if (requestQueueEyebrow) requestQueueEyebrow.textContent = 'Workers';
  if (showAllTimeBtn) showAllTimeBtn.style.display = 'none';
  requestList?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// The request queue now lives only on the Requests page, so a stat tile must jump
// there first (then filter / drill down). Navigation sits here in the click path —
// NOT inside statCardNav/openWorkersPanel, which also run on Refresh and must not
// yank the user to another page.
const goRequestsThen = (fn) => { switchPageTab('requests'); fn(); };
document.getElementById('stat-card-open')?.addEventListener('click', () => goRequestsThen(() => statCardNav('open', 'open')));
document.getElementById('stat-card-open')?.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goRequestsThen(() => statCardNav('open', 'open')); } });
document.getElementById('stat-card-inprogress')?.addEventListener('click', () => goRequestsThen(() => statCardNav('in_progress', 'inprogress')));
document.getElementById('stat-card-inprogress')?.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goRequestsThen(() => statCardNav('in_progress', 'inprogress')); } });
document.getElementById('stat-card-completed')?.addEventListener('click', () => goRequestsThen(() => statCardNav('completed_today', 'completed')));
document.getElementById('stat-card-completed')?.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goRequestsThen(() => statCardNav('completed_today', 'completed')); } });
document.getElementById('stat-card-workers')?.addEventListener('click', () => goRequestsThen(openWorkersPanel));
document.getElementById('stat-card-workers')?.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goRequestsThen(openWorkersPanel); } });
// The tile shows Company Net, so it opens the Payroll tab (full breakdown) rather
// than the gross service-fee drilldown.
document.getElementById('stat-card-revenue')?.addEventListener('click', () => switchPageTab('payroll'));
document.getElementById('stat-card-revenue')?.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchPageTab('payroll'); } });

// Find Tickets modal
heroFindTicketsBtn?.addEventListener('click', openFindTicketsModal);
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

heroAvgRatingBtn?.addEventListener('click', () => switchAdminTab('reviews'));

function normalizePhone(s) {
  return String(s || '').replace(/\D/g, '');
}

function formatPhone(value) {
  let digits = normalizePhone(value);
  if (digits.length === 11 && digits[0] === '1') digits = digits.slice(1);
  if (digits.length !== 10) return value || '';
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// Reformats a phone <input> live as the admin types, preserving cursor
// position by digit count. Safe to call more than once on the same element.
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

document.addEventListener('focusin', (event) => {
  if (event.target.matches('input[type="tel"], .edit-customer-phone, .admin-worker-phone')) {
    attachPhoneInputFormatting(event.target);
  }
});

document.querySelectorAll('input[type="tel"], .edit-customer-phone, .admin-worker-phone')
  .forEach(attachPhoneInputFormatting);

async function refreshAdminView(button = null) {
  const originalHTML = button?.innerHTML;
  if (button) {
    button.disabled = true;
    button.innerHTML = 'Refreshing&hellip;';
  }

  try {
    if (currentPageTab === 'workers') {
      await loadEmployees();
      await loadRequests();
      return;
    }

    await Promise.all([
      loadEmployees(),
      loadRequests(),
      loadReviews(),
      loadApplicants(),
      loadPendingAuthorizations(),
      loadReauthNeeded(),
    ]);
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = originalHTML;
    }
  }
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
  return fuzzyMatch(r.customer_name, q)
    || fuzzyMatch(r.customer_email, q)
    || fuzzyMatch(r.license_plate, q)
    || fuzzyMatch(r.vehicle_plate, q)
    || (q.length >= 6 && String(r.id || '').toLowerCase().includes(q.toLowerCase()));
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
        <span class="status-pill">${escapeHtml(bookingStatusLabel(r.status))}</span>
      </div>
      <span class="find-ticket-meta">${r.customer_phone ? escapeHtml(formatPhone(r.customer_phone)) : 'No phone'} &middot; ${escapeHtml(r.customer_email || 'No email')}</span>
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

// ── "Find" page: inline unified search (requests + people) ───────────────────
function workerMatchesFind(e, q) {
  const n = q.toLowerCase();
  const digits = q.replace(/\D/g, '');
  return (e.full_name || '').toLowerCase().includes(n)
    || (e.email || '').toLowerCase().includes(n)
    || (e.employee_code || '').toLowerCase().includes(n)
    || (digits.length >= 3 && (e.phone || '').replace(/\D/g, '').includes(digits));
}
function runAdminFind() {
  const input = document.getElementById('admin-find-input');
  const out = document.getElementById('admin-find-results');
  if (!input || !out) return;
  const q = input.value.trim();
  if (!q) { out.hidden = true; out.innerHTML = ''; return; }
  const workers = (allEmployees || []).filter((w) => workerMatchesFind(w, q)).slice(0, 10);
  const reqs = (allRequests || []).filter((r) => ticketMatchesQuery(r, q)).slice(0, 30);
  const workerRows = workers.map((w) => `
    <button class="admin-find-result" data-find-worker="${escapeHtml(w.id)}" type="button">
      <div class="find-ticket-result-header">
        <span class="find-ticket-name">${escapeHtml(w.full_name || 'Worker')}</span>
        <span class="status-pill ${w.active ? 'status-pill-complete' : 'status-pill-denied'}">${w.active ? 'Active' : 'Inactive'}</span>
      </div>
      <span class="find-ticket-meta">Worker · ${w.phone ? escapeHtml(formatPhone(w.phone)) : 'No phone'}${w.email ? ' · ' + escapeHtml(w.email) : ''}</span>
    </button>`).join('');
  const reqRows = reqs.map((r) => `
    <button class="admin-find-result" data-find-request="${escapeHtml(r.id)}" type="button">
      <div class="find-ticket-result-header">
        <span class="find-ticket-name">${escapeHtml(r.customer_name || 'Customer')}</span>
        <span class="status-pill">${escapeHtml(bookingStatusLabel(r.status))}</span>
      </div>
      <span class="find-ticket-meta">${r.customer_phone ? escapeHtml(formatPhone(r.customer_phone)) : 'No phone'}${r.customer_email ? ' · ' + escapeHtml(r.customer_email) : ''}</span>
      <span class="find-ticket-meta">${escapeHtml(r.service_date || 'Date not set')}${[r.vehicle_year, r.vehicle_make, r.vehicle_model].filter(Boolean).length ? ' · ' + escapeHtml([r.vehicle_year, r.vehicle_make, r.vehicle_model].filter(Boolean).join(' ')) : ''}</span>
    </button>`).join('');
  out.hidden = false;
  out.innerHTML = (workers.length ? `<p class="admin-find-group">People</p>${workerRows}` : '')
    + (reqs.length ? `<p class="admin-find-group">Requests</p>${reqRows}` : '')
    + ((!workers.length && !reqs.length) ? '<p class="find-tickets-empty">No matching requests or people.</p>' : '');
}
document.getElementById('admin-find-input')?.addEventListener('input', runAdminFind);
document.querySelectorAll('[data-find-filter]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const input = document.getElementById('admin-find-input');
    if (!input) return;
    input.value = btn.dataset.findFilter || '';
    runAdminFind();
    input.focus();
  });
});
document.getElementById('admin-find-results')?.addEventListener('click', (event) => {
  const wbtn = event.target.closest('[data-find-worker]');
  if (wbtn) {
    const id = wbtn.dataset.findWorker;
    selectedScheduleEmployeeId = id;
    switchPageTab('workers');
    setTimeout(() => document.querySelector(`#admin-worker-profile-list [data-worker-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
    return;
  }
  const rbtn = event.target.closest('[data-find-request]');
  if (rbtn) {
    const r = (allRequests || []).find((x) => x.id === rbtn.dataset.findRequest);
    if (r) openTicketDetailModal(r);
  }
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

// Public Mapbox token (same pk.* token the maps already ship in the browser).
// The Static Images request runs from the admin page on our allowed domain, so
// the token's Referer restriction is satisfied with no server proxy.
const MAPBOX_STATIC_TOKEN = window.SHIFTFUEL_CONFIG?.mapboxPublicToken || window.SHIFTFUEL_MAPBOX_TOKEN || 'pk.eyJ1IjoibW1iMHl6MTIiLCJhIjoiY21xcXZiaGU4MGxubjJvcHpidnhidG55cyJ9.Ciss2gT76eC3Zt92_qhtGA';

// Build a Mapbox Static Images URL from a stored GeoJSON LineString (driven_route):
// a road map with the snapped route drawn in teal + green "A" start / red "B" end
// pins, auto-framed to fit. Returns null if the geometry isn't usable.
function routeStaticMapUrl(geojson, { width = 640, height = 320 } = {}) {
  const coords = geojson && geojson.type === 'LineString' && Array.isArray(geojson.coordinates)
    ? geojson.coordinates
    : null;
  if (!coords || coords.length < 2) return null;

  // Round to 5 decimals (~1 m) and cap point count so the URL stays well under
  // Mapbox's ~8KB static-image limit even for a long trip.
  const round5 = (n) => Math.round(Number(n) * 1e5) / 1e5;
  let pts = coords
    .filter((c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]))
    .map((c) => [round5(c[0]), round5(c[1])]);
  if (pts.length < 2) return null;
  const MAX = 100;
  if (pts.length > MAX) {
    const step = (pts.length - 1) / (MAX - 1);
    const sampled = [];
    for (let i = 0; i < MAX; i++) sampled.push(pts[Math.round(i * step)]);
    sampled[sampled.length - 1] = pts[pts.length - 1];
    pts = sampled;
  }

  const line = { type: 'Feature', properties: { stroke: '#0d9488', 'stroke-width': 4, 'stroke-opacity': 0.9 }, geometry: { type: 'LineString', coordinates: pts } };
  const [sLon, sLat] = pts[0];
  const [eLon, eLat] = pts[pts.length - 1];
  const overlay = [
    `geojson(${encodeURIComponent(JSON.stringify(line))})`,
    `pin-s-a+1f7a45(${sLon},${sLat})`,
    `pin-s-b+d9534f(${eLon},${eLat})`,
  ].join(',');

  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${overlay}/auto/${width}x${height}@2x`
    + `?padding=36&access_token=${MAPBOX_STATIC_TOKEN}`;
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
      <span class="status-pill">${escapeHtml(bookingStatusLabel(request.status))}</span>
    </div>
    ${requestCardDetails(request)}
    ${request.driven_miles ? (() => {
      const mapUrl = routeStaticMapUrl(request.driven_route);
      return `<div class="ticket-route-proof">
        <p class="field-help" style="margin:10px 0 8px">GPS-verified drive: <strong>${Number(request.driven_miles).toFixed(1)} mi</strong> actually driven for this job (proof-of-service).</p>
        ${mapUrl ? `<img class="ticket-route-map" src="${escapeHtml(mapUrl)}" alt="Route the worker drove for this job" loading="lazy" onerror="this.remove()">` : ''}
      </div>`;
    })() : ''}
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
  // Token-gated so the photos table can stay locked to anon (no enumeration).
  const { data, error } = await db.rpc('staff_request_photos', {
    p_token: adminAuthToken(),
    p_request_id: requestId,
  });
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
  const starsValue = btn.dataset.stars;
  currentReviewFilter = (!starsValue || starsValue === 'all') ? null : Number(starsValue);
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
    const startsAt = savedDay?.startsAt || '09:00';
    const endsAt = savedDay?.endsAt || '17:00';

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
      startsAt: day.startsAt || '09:00',
      endsAt: day.endsAt || '17:00',
    }));
  }

  const startsAt = savedSchedule?.startsAt || '09:00';
  const endsAt = savedSchedule?.endsAt || '17:00';

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
        startsAt: row?.querySelector('.worker-day-start')?.value || '09:00',
        endsAt: row?.querySelector('.worker-day-end')?.value || '17:00',
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
      startsAt: startInput?.value || '09:00',
      endsAt: endInput?.value || '17:00',
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
    workerLocation: employee?.home_location || DEFAULT_WORK_LOCATION,
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
  const existing = allEmployees.filter((employee) => employee.full_name === schedule.workerName);

  if (existing?.length) {
    const employeeId = existing[0].id;
    const { error } = await db.rpc('admin_update_employee', {
      p_token: adminAuthToken(),
      p_employee_id: employeeId,
      p_data: { active: true, home_location: schedule.workerLocation },
    });
    if (error) throw error;
    return employeeId;
  } else {
    const codePrefix = schedule.workerName.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'WORKER';
    const { data, error } = await db.rpc('admin_insert_employee', {
      p_token: adminAuthToken(),
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
    p_token: adminAuthToken(),
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
    p_token: adminAuthToken(),
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
  startsAt: '09:00',
  endsAt: '17:00',
})));
renderWorkerDaysOffCalendar();

window.ShiftFuelPhoto?.initPhotoModal();
loadVehiclePsiGuides().finally(() => {
  loadEmployees().then(loadRequests);
});
loadReviews();
loadApplicants();
loadPendingAuthorizations();
loadReauthNeeded();

// ── Create Request tab ────────────────────────────────────────────────────────

document.querySelector('#admin-create-request-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const form = event.target;
  const statusEl = document.querySelector('#cr-status');
  const submitBtn = form.querySelector('[type="submit"]');

  const val = (id) => (document.getElementById(id)?.value || '').trim();
  const serviceTypeValue = val('cr-service-type');
  const needsFuel = serviceTypeValue === 'fuel' || serviceTypeValue === 'car-wash-fuel';
  const needsWash = serviceTypeValue === 'car-wash' || serviceTypeValue === 'car-wash-fuel';
  const washPackageLabel = val('cr-car-wash-package');
  const fuelTypeValue = val('cr-fuel-type') || 'Regular';
  const quickInspection = !!document.getElementById('cr-inspection')?.checked;
  const pricing = estimatePricingSummary({
    needsFuel,
    needsWash,
    fuelAmount: 0,
    washAmount: 0,
    quickInspection,
  });
  const estimatedTotal = pricing.total;

  const data = {
    customer_name:       val('cr-customer-name'),
    customer_phone:      formatPhone(val('cr-customer-phone')),
    customer_email:      val('cr-customer-email'),
    address_street:      val('cr-address-street'),
    address_apt:         val('cr-address-unit'),
    address_city:        val('cr-address-city'),
    address_state:       val('cr-address-state'),
    address_zip:         val('cr-address-zip'),
    service_type:        serviceTypeValue,
    service_label:       serviceTypeValue ? (serviceTypeValue === 'fuel' ? 'Fuel only' : serviceTypeValue === 'car-wash' ? 'Car wash only' : 'Car wash + Fuel') : '',
    service_date:        new Date().toISOString().slice(0, 10),
    desired_return_time: val('cr-desired-return-time'),
    fuel_type:           needsFuel ? fuelTypeValue : '',
    fuel_convenience_fee: needsFuel ? pricing.fuel : 0,
    wash_package_label:  needsWash ? washPackageLabel : '',
    wash_convenience_fee: needsWash ? pricing.wash : 0,
    quick_inspection:    quickInspection,
    quick_inspection_fee: pricing.inspection,
    estimated_total:     estimatedTotal || null,
    vehicle_year:        val('cr-vehicle-year'),
    vehicle_make:        val('cr-vehicle-make'),
    vehicle_model:       val('cr-vehicle-model'),
    vehicle_color:       val('cr-vehicle-color'),
    license_plate:       val('cr-license-plate'),
    notes:               val('cr-notes'),
  };

  if (!data.customer_name || !data.customer_phone || !data.customer_email) {
    if (statusEl) statusEl.textContent = 'Customer name, phone, and email are required.';
    return;
  }

  if (statusEl) statusEl.textContent = 'Creating request…';
  submitBtn.disabled = true;

  try {
    const { data: result, error } = await db.rpc('admin_create_request', {
      p_token: adminAuthToken(),
      p_data: data,
    });

    if (error) throw error;

    form.reset();
    updateAdminCreateServiceControls();
    if (statusEl) {
      const id = result?.id ? ` (ID: ${result.id})` : '';
      statusEl.textContent = `Request created${id}. The customer will see it on the Track page.`;
    }
    loadRequests();
  } catch (err) {
    console.error('admin_create_request error:', err);
    if (statusEl) statusEl.textContent = `Could not create request: ${err.message || err}`;
  } finally {
    submitBtn.disabled = false;
  }
});

// ── Services page — fuel + service pricing ─────────────────────────────────

const SERVICE_PRICING_FIELDS = [
  { id: 'fp-regular', label: 'Regular fuel ($/gal)', step: '0.001' },
  { id: 'fp-midgrade', label: 'Mid-grade fuel ($/gal)', step: '0.001' },
  { id: 'fp-premium', label: 'Premium fuel ($/gal)', step: '0.001' },
  { id: 'fp-diesel', label: 'Diesel ($/gal)', step: '0.001' },
  { id: 'sp-fuel-fee', label: 'Fuel concierge service fee ($)', step: '0.01' },
  { id: 'sp-wash-fee', label: 'Car wash service fee ($)', step: '0.01' },
  { id: 'sp-inspection-fee', label: 'Vehicle add-ons fee ($)', step: '0.01' },
  { id: 'sp-per-mile-rate', label: 'Gas station distance surcharge ($/extra round-trip mile)', step: '0.01' },
  { id: 'sp-wash-buff-shine', label: 'Buff & Shine package ($)', step: '0.01' },
  { id: 'sp-wash-shine-protect', label: 'Shine & Protect package ($)', step: '0.01' },
  { id: 'sp-wash-shine', label: 'Shine package ($)', step: '0.01' },
  { id: 'sp-wash-double', label: 'Double Wash package ($)', step: '0.01' },
];

function renderServicesSettingsList() {
  const list = document.querySelector('#services-settings-list');
  if (!list || list.dataset.rendered) return;
  const chevron = '<svg class="svc-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  list.innerHTML = `
    <p class="tbp-intro" style="margin-bottom:12px">Each service is its own section. Tags show who each amount touches: <span class="tbp-tag tbp-tag-customer">customer pays</span> = on the customer's bill · <span class="tbp-tag tbp-tag-worker">worker earns</span> = paid to the driver.</p>

    <details class="svc-acc">
      <summary class="svc-acc-head"><span>⛽ Fuel</span>${chevron}</summary>
      <div class="svc-acc-body">
            <div class="pricing-group-grid">
              <label>Regular ($/gal)<input id="fp-regular" type="number" step="0.001" min="0"></label>
              <label>Mid-grade ($/gal)<input id="fp-midgrade" type="number" step="0.001" min="0"></label>
              <label>Premium ($/gal)<input id="fp-premium" type="number" step="0.001" min="0"></label>
              <label>Diesel ($/gal)<input id="fp-diesel" type="number" step="0.001" min="0"></label>
            </div>
            <div class="pricing-group-grid">
              <label>Fuel service fee ($) <span class="tbp-tag tbp-tag-customer">customer pays</span><input id="sp-fuel-fee" type="number" step="0.01" min="0"></label>
              <label>Fuel-fee worker share (%) <span class="tbp-tag tbp-tag-worker">worker earns</span><input id="sp-fuel-share" type="number" step="1" min="0" max="100"><span class="tbp-hint">Driver's cut of the fuel service fee (net of card).</span></label>
              <label>Fuel time — base (min)<input id="sp-fuel-time-base" type="number" step="0.1" min="0"><span class="tbp-hint">Flat minutes per fuel stop (billed via the time rate below).</span></label>
              <label>Fuel time — per gallon (min)<input id="sp-fuel-time-per-gal" type="number" step="0.1" min="0"><span class="tbp-hint">Extra minutes per gallon — e.g. 10 gal × 0.5 = +5 min.</span></label>
            </div>
          </div>
        </details>

        <details class="svc-acc">
          <summary class="svc-acc-head"><span>🚿 Car wash</span>${chevron}</summary>
          <div class="svc-acc-body">
            <div class="pricing-group-grid">
              <label>Buff &amp; Shine ($)<input id="sp-wash-buff-shine" type="number" step="0.01" min="0"></label>
              <label>Shine &amp; Protect ($)<input id="sp-wash-shine-protect" type="number" step="0.01" min="0"></label>
              <label>Shine ($)<input id="sp-wash-shine" type="number" step="0.01" min="0"></label>
              <label>Double Wash ($)<input id="sp-wash-double" type="number" step="0.01" min="0"></label>
            </div>
            <div class="pricing-group-grid">
              <label>Car wash service fee ($) <span class="tbp-tag tbp-tag-customer">customer pays</span><input id="sp-wash-fee" type="number" step="0.01" min="0"></label>
              <label>Wash-fee worker share (%) <span class="tbp-tag tbp-tag-worker">worker earns</span><input id="sp-wash-share" type="number" step="1" min="0" max="100"><span class="tbp-hint">Driver's cut of the car-wash service fee (net of card).</span></label>
              <label>Car wash time (min)<input id="sp-wash-time" type="number" step="1" min="0"><span class="tbp-hint">Flat minutes for a car wash (billed via the time rate).</span></label>
              <label>Wash detour free miles<input id="sp-wash-detour-free" type="number" step="0.5" min="0"><span class="tbp-hint">First N round-trip wash miles are free to the customer (the driver is still paid for every mile).</span></label>
            </div>
          </div>
        </details>

        <details class="svc-acc">
          <summary class="svc-acc-head"><span>🎁 Fuel + Wash bundle</span>${chevron}</summary>
          <div class="svc-acc-body">
            <p class="tbp-intro" style="margin-bottom:4px">When a customer books fuel <em>and</em> a wash, they pay these two bundled fees instead of the full fuel + wash fees, and the driver earns the bundle shares below. Set both fees to $0 to turn the bundle off.</p>
            <div class="pricing-group-grid">
              <label>Bundle fuel fee ($) <span class="tbp-tag tbp-tag-customer">customer pays</span><input id="sp-bundle-fuel-fee" type="number" step="0.01" min="0"><span class="tbp-hint">The fuel leg's price inside the combo.</span></label>
              <label>Bundle fuel — worker share (%) <span class="tbp-tag tbp-tag-worker">worker earns</span><input id="sp-bundle-fuel-share" type="number" step="1" min="0" max="100"><span class="tbp-hint">Driver's cut of the bundle fuel fee (net of card).</span></label>
              <label>Bundle wash fee ($) <span class="tbp-tag tbp-tag-customer">customer pays</span><input id="sp-bundle-wash-fee" type="number" step="0.01" min="0"><span class="tbp-hint">The wash leg's price inside the combo.</span></label>
              <label>Bundle wash — worker share (%) <span class="tbp-tag tbp-tag-worker">worker earns</span><input id="sp-bundle-wash-share" type="number" step="1" min="0" max="100"><span class="tbp-hint">Driver's cut of the bundle wash fee (net of card).</span></label>
            </div>
            <div id="sp-bundle-savings" class="bundle-savings-preview" aria-live="polite"></div>
          </div>
        </details>

        <details class="svc-acc">
          <summary class="svc-acc-head"><span>🔍 Quick care</span>${chevron}</summary>
          <div class="svc-acc-body">
            <div class="pricing-group-grid">
              <label>Quick care fee ($) <span class="tbp-tag tbp-tag-customer">customer pays</span><input id="sp-inspection-fee" type="number" step="0.01" min="0"></label>
              <label>Quick-care worker share (%) <span class="tbp-tag tbp-tag-worker">worker earns</span><input id="sp-quick-share" type="number" step="1" min="0" max="100"><span class="tbp-hint">Driver's cut of the quick-care fee (net of card).</span></label>
            </div>
          </div>
        </details>

        <details class="svc-acc">
          <summary class="svc-acc-head"><span>🚗 Distance &amp; mileage</span>${chevron}</summary>
          <div class="svc-acc-body">
            <div class="pricing-group-grid">
              <label>Gas station distance surcharge ($/extra round-trip mile) <span class="tbp-tag tbp-tag-customer">customer pays</span><input id="sp-per-mile-rate" type="number" step="0.01" min="0"><span class="tbp-hint">Per mile charged to the customer for a farther-than-closest gas station AND for the car-wash detour past the free miles.</span></label>
              <label>Worker mileage pay ($/mile) <span class="tbp-tag tbp-tag-worker">worker earns</span><input id="sp-wash-detour-rate" type="number" step="0.001" min="0"><span class="tbp-hint">Paid to the driver per detour mile — covers BOTH gas-station mileage and the car-wash detour. (3 decimals OK, e.g. 0.725.)</span></label>
            </div>
          </div>
        </details>

        <details class="svc-acc">
          <summary class="svc-acc-head"><span>⏱ Service time</span>${chevron}</summary>
          <div class="svc-acc-body">
            <div class="pricing-group-grid">
              <label>Company time rate ($/min) <span class="tbp-tag tbp-tag-customer">customer pays</span><input id="sp-time-rate" type="number" step="0.01" min="0"><span class="tbp-hint">Charged to the customer per service-minute (fuel + wash time above). Set $0 to turn time pricing off. Each worker's own per-minute pay is set on the Workers tab.</span></label>
            </div>
          </div>
        </details>

    <div class="pricing-effective-date-row">
      <div id="pricing-pending-banner" class="pricing-pending-banner" hidden></div>
      <label class="pricing-effective-label">
        Effective date
        <span class="pricing-effective-hint">Leave blank to apply immediately</span>
        <input id="sp-effective-date" type="datetime-local">
      </label>
    </div>

    <div class="pricing-save-row">
      <button class="button primary" type="submit">Save service pricing</button>
      <p id="services-settings-status" class="form-status" role="status"></p>
    </div>

    <details class="pricing-sim" id="pricing-sim">
      <summary><strong>Pricing &amp; payout simulator</strong></summary>
      <p class="field-help">Simulator only estimates pricing and payouts. It does not affect live bookings.</p>
      <p class="field-help">A sandbox to see what a job would cost the customer, what the worker earns, and how long it takes. It uses the rates above (edit them to test scenarios) and the numbers you type here — no live Mapbox or booking data.</p>
      <div class="pricing-sim-inputs">
        <label>Service
          <select id="sim-service"><option value="fuel">Fuel only</option><option value="wash">Wash only</option><option value="both">Fuel + Wash</option></select>
        </label>
        <label>Gallons
          <select id="sim-gallons">
            <option value="10" selected>10</option>
            <option value="15">15</option>
            <option value="20">20</option>
            <option value="30">30</option>
            <option value="40">40</option>
          </select>
        </label>
        <label>Price / gallon ($)<input id="sim-fuel-price" type="number" min="0" step="0.01" value="3.79"></label>
        <label>Wash package
          <select id="sim-wash-pkg">
            <option value="sp-wash-buff-shine">Buff &amp; Shine</option>
            <option value="sp-wash-shine-protect">Shine &amp; Protect</option>
            <option value="sp-wash-shine">Shine</option>
            <option value="sp-wash-double">Double Wash</option>
          </select>
        </label>
        <label>Gas station round-trip miles<input id="sim-station-miles" type="number" min="0" step="0.1" value="0"><span class="tbp-hint">Extra round-trip distance to the customer's chosen (non-nearest) station. Drives the customer surcharge AND worker mileage pay.</span></label>
        <label>Car wash round-trip miles<input id="sim-wash-miles" type="number" min="0" step="0.1" value="0"><span class="tbp-hint">Round-trip wash detour. Worker is paid on ALL of it; the customer is billed (at the surcharge rate) only for miles past the free allowance below.</span></label>
        <label class="sim-check"><input id="sim-quick" type="checkbox"> Vehicle add-ons</label>
      </div>
      <p class="field-help" style="margin:.6rem 0 .2rem"><strong>Rates</strong> — pre-filled from your saved settings. Change them here to test "what-if" scenarios; this sandbox never touches your saved pricing.</p>
      <div class="pricing-sim-inputs">
        <label>Fuel service fee ($)<input id="sim-fuel-fee" type="number" min="0" step="0.01"></label>
        <label>Wash service fee ($)<input id="sim-wash-fee" type="number" min="0" step="0.01"></label>
        <label>Quick care fee ($)<input id="sim-insp-fee" type="number" min="0" step="0.01"></label>
        <label>Company rate ($/min)<input id="sim-company-rate" type="number" min="0" step="0.01"></label>
        <label>Worker pay rate ($/min)<input id="sim-worker-rate" type="number" min="0" step="0.01" value="0.50"></label>
        <label>Worker fuel-fee share (%)<input id="sim-fuel-share" type="number" min="0" max="100" step="1" value="50"><span class="tbp-hint">Driver's cut of the fuel service fee (net of card).</span></label>
        <label>Worker wash-fee share (%)<input id="sim-wash-share" type="number" min="0" max="100" step="1" value="50"><span class="tbp-hint">Driver's cut of the car-wash service fee (net of card).</span></label>
        <label>Worker quick-care share (%)<input id="sim-insp-share" type="number" min="0" max="100" step="1" value="50"><span class="tbp-hint">Driver's cut of the quick-care fee (net of card).</span></label>
        <label>Distance surcharge — customer ($/mile)<input id="sim-per-mile" type="number" min="0" step="0.01"><span class="tbp-hint">Charged to the customer for gas-station choice AND wash detour past the free miles.</span></label>
        <label>Worker mileage pay ($/mile)<input id="sim-worker-mile" type="number" min="0" step="0.001"></label>
      </div>
      <p class="field-help" style="margin:.6rem 0 .2rem"><strong>Annual planner</strong> — enter your expected yearly job mix. Each service type is costed with its own time + distance (jobs differ, so no single job is extrapolated), then blended into a yearly projection. Add a company target to get a recommended fee. Uses the rates above; a planning estimate, not a guarantee.</p>
      <table class="pricing-mix-table">
        <thead><tr><th>Service</th><th>Jobs / yr</th><th>Avg gallons</th><th>Gas detour mi</th><th>Wash detour mi</th></tr></thead>
        <tbody>
          <tr><th scope="row">Fuel only</th><td><input id="mix-fuel-jobs" type="number" min="0" step="10" value="0"></td><td><input id="mix-fuel-gal" type="number" min="0" step="1" value="10"></td><td><input id="mix-fuel-sta" type="number" min="0" step="0.1" value="0"></td><td class="mix-na">—</td></tr>
          <tr><th scope="row">Wash only</th><td><input id="mix-wash-jobs" type="number" min="0" step="10" value="0"></td><td class="mix-na">—</td><td class="mix-na">—</td><td><input id="mix-wash-wash" type="number" min="0" step="0.1" value="0"></td></tr>
          <tr><th scope="row">Fuel + Wash</th><td><input id="mix-both-jobs" type="number" min="0" step="10" value="0"></td><td><input id="mix-both-gal" type="number" min="0" step="1" value="10"></td><td><input id="mix-both-sta" type="number" min="0" step="0.1" value="0"></td><td><input id="mix-both-wash" type="number" min="0" step="0.1" value="0"></td></tr>
        </tbody>
      </table>
      <div class="pricing-sim-inputs">
        <label>Target company net ($/year)<input id="mix-target-year" type="number" min="0" step="1000" placeholder="e.g. 120000"></label>
      </div>
      <div class="pricing-sim-goal" id="sim-goal-output"></div>
      <div class="pricing-sim-output" id="sim-output"></div>
    </details>
  `;
  list.dataset.rendered = '1';
  runPricingSimulator();
}

// Reads the live pricing-form rates + the simulator's scenario inputs and renders a
// full customer / worker / company breakdown. Pure math — no network, no real data.
function simNum(id, dflt = 0) {
  const el = document.getElementById(id);
  // An empty field must fall back to the default — Number('') is 0, which would
  // silently zero a fee/rate and make the whole simulator read $0.
  if (!el || el.value === '' || el.value == null) return dflt;
  const n = Number(el.value);
  return Number.isFinite(n) ? n : dflt;
}
function runPricingSimulator() {
  const out = document.getElementById('sim-output');
  if (!out) return;
  const service = document.getElementById('sim-service')?.value || 'fuel';
  const needsFuel = service === 'fuel' || service === 'both';
  const needsWash = service === 'wash' || service === 'both';
  const quick = !!document.getElementById('sim-quick')?.checked;

  // Show only the inputs that apply to the chosen service: fuel-only hides the
  // wash fields, wash-only hides the fuel fields, both shows everything.
  const setSimVis = (id, show) => {
    const lbl = document.getElementById(id)?.closest('label');
    if (lbl) lbl.style.display = show ? '' : 'none';
  };
  setSimVis('sim-gallons', needsFuel);
  setSimVis('sim-fuel-price', needsFuel);
  setSimVis('sim-station-miles', needsFuel);
  setSimVis('sim-per-mile', needsFuel || needsWash); // surcharge rate now drives gas AND wash distance
  setSimVis('sim-fuel-fee', needsFuel);
  setSimVis('sim-fuel-share', needsFuel);
  setSimVis('sim-wash-pkg', needsWash);
  setSimVis('sim-wash-miles', needsWash);
  setSimVis('sim-wash-fee', needsWash);
  setSimVis('sim-wash-share', needsWash);
  setSimVis('sim-insp-fee', quick);
  setSimVis('sim-insp-share', quick);

  const gallons = simNum('sim-gallons');
  const pricePerGallon = simNum('sim-fuel-price');
  const stationMiles = simNum('sim-station-miles');
  const washMiles = simNum('sim-wash-miles');
  const workerRateRaw = simNum('sim-worker-rate');

  // Rates come from the simulator's own editable inputs (pre-filled from saved
  // settings), so the sandbox is self-contained and a blank settings form can't
  // zero it out. Defaults fall back to the loaded pricing constants.
  let fuelFee = needsFuel ? simNum('sim-fuel-fee', BASE_FUEL_SERVICE_FEE) : 0;
  let washFee = needsWash ? simNum('sim-wash-fee', BASE_WASH_SERVICE_FEE) : 0;
  const inspFee = quick ? simNum('sim-insp-fee', BASE_QUICK_INSPECTION_FEE) : 0;
  // Fuel + Wash bundle, per leg (from the Services form; 0/0 = off). Keep the raw,
  // ungated fuel/wash fees so the annual mix-planner can cost each job type on its
  // own (its "both" rows apply the bundle per-row). The single-scenario sim below
  // uses the bundle leg fees + bundle worker shares when both services are on.
  const simBundleFuelFee = simNum('sp-bundle-fuel-fee', 0);
  const simBundleWashFee = simNum('sp-bundle-wash-fee', 0);
  const simBundleFuelShare = simNum('sp-bundle-fuel-share', 50) / 100;
  const simBundleWashShare = simNum('sp-bundle-wash-share', 50) / 100;
  const simBundleSum = simBundleFuelFee + simBundleWashFee;
  const rawFuelFee = simNum('sim-fuel-fee', BASE_FUEL_SERVICE_FEE);
  const rawWashFee = simNum('sim-wash-fee', BASE_WASH_SERVICE_FEE);
  const simBundleFull = fuelFee + washFee;
  const simBundleActive = needsFuel && needsWash && simBundleSum > 0 && simBundleSum < simBundleFull;
  if (simBundleActive) {
    fuelFee = simBundleFuelFee;
    washFee = simBundleWashFee;
  }
  const washPrice = needsWash ? simNum(document.getElementById('sim-wash-pkg')?.value || 'sp-wash-buff-shine', 0) : 0;
  const companyRate = simNum('sim-company-rate', adminCompanyTimeRatePerMin);
  // Time params still come from the Time-Based Pay settings (rarely changed).
  const fuelBaseMin = simNum('sp-fuel-time-base', 3);
  const fuelPerGalMin = simNum('sp-fuel-time-per-gal', 0.5);
  const washTimeMin = simNum('sp-wash-time', 20);
  const washDetourFree = simNum('sp-wash-detour-free', 5);
  // One worker per-mile rate drives gas-station mileage AND wash detour.
  const washDetourRate = simNum('sim-worker-mile', WORKER_MILEAGE_RATE);
  const perMileRate = simNum('sim-per-mile', 0.75);

  // ── Customer side ──
  const fuelCost = needsFuel ? roundMoneyValue(gallons * pricePerGallon) : 0;
  const serviceMin = (needsFuel ? fuelBaseMin + fuelPerGalMin * gallons : 0) + (needsWash ? washTimeMin : 0);
  const timeCharge = roundMoneyValue(serviceMin * companyRate);
  // Customer distance charges — both at the same surcharge rate (S). Gas: extra
  // round-trip miles for a farther-than-nearest station. Wash: the wash detour
  // beyond the first 5 free miles (the company eats the first 5).
  const stationSurcharge = needsFuel ? roundMoneyValue(stationMiles * perMileRate) : 0;
  const washSurcharge = needsWash ? roundMoneyValue(Math.max(0, washMiles - washDetourFree) * perMileRate) : 0;
  const netTarget = roundMoneyValue(fuelCost + washPrice + fuelFee + washFee + inspFee + stationSurcharge + washSurcharge + timeCharge);
  const customerTotal = netTarget > 0 ? Math.ceil((netTarget + RETURN_RECOVERY_FIXED) / (1 - RETURN_RECOVERY_RATE)) : 0;
  const cardRecovery = roundMoneyValue(customerTotal - netTarget);

  // ── Worker side ──
  const workerRate = companyRate > 0 ? Math.min(workerRateRaw, companyRate) : workerRateRaw;
  // Each service fee can pay the driver an independent share. Card processing is
  // one per-transaction cost, so apportion it across the fee lines by amount,
  // then apply that line's own worker share to its net (same split logic as the
  // customer-side recovery). At 50/50/50 this matches the old single-share math.
  // A live bundle swaps in the per-leg bundle worker shares for fuel + wash. Keep
  // the raw (non-bundle) shares too — the mix planner applies the bundle per "both"
  // row itself, so it can't use a scenario-wide override.
  const rawFuelSharePct = simNum('sim-fuel-share', 50) / 100;
  const rawWashSharePct = simNum('sim-wash-share', 50) / 100;
  const fuelSharePct = simBundleActive ? simBundleFuelShare : rawFuelSharePct;
  const washSharePct = simBundleActive ? simBundleWashShare : rawWashSharePct;
  const inspSharePct = simNum('sim-insp-share', 50) / 100;
  const feeGross = fuelFee + washFee + inspFee;
  const feeStripe = feeGross > 0 ? roundMoneyValue(feeGross * RETURN_RECOVERY_RATE + RETURN_RECOVERY_FIXED) : 0;
  const netOf = (fee) => (feeGross > 0 ? Math.max(0, fee - feeStripe * (fee / feeGross)) : 0);
  const fuelFeeShare = roundMoneyValue(netOf(fuelFee) * fuelSharePct);
  const washFeeShare = roundMoneyValue(netOf(washFee) * washSharePct);
  const inspFeeShare = roundMoneyValue(netOf(inspFee) * inspSharePct);
  const feeShare = roundMoneyValue(fuelFeeShare + washFeeShare + inspFeeShare);
  const mileagePay = needsFuel ? roundMoneyValue(stationMiles * washDetourRate) : 0;
  const timePay = roundMoneyValue(serviceMin * workerRate);
  // Worker is paid on EVERY wash detour mile (incl. the customer's free 5) — the
  // free allowance is a customer discount the company absorbs, not unpaid driving.
  const washDetourPay = needsWash ? roundMoneyValue(washMiles * washDetourRate) : 0;
  const workerPay = roundMoneyValue(feeShare + mileagePay + timePay + washDetourPay);

  // ── Company keeps (service revenue minus worker pay; fuel/wash cost is pass-through) ──
  const companyNet = roundMoneyValue(fuelFee + washFee + inspFee + timeCharge + stationSurcharge + washSurcharge - workerPay);

  // ── Time to complete ── drive legs only count for the services actually in the job.
  const driveMiles = (needsFuel ? stationMiles : 0) + (needsWash ? washMiles : 0);
  const minutes = Math.round(10 + 5 + (driveMiles / 30) * 60 + (quick ? 10 : 0));

  // Per-minute rate for THIS job, plus a rough full-time year = that rate held for
  // 40 hrs/wk × 52 wks of back-to-back jobs like this one. (The Annual planner below
  // is the accurate version — it blends your real job mix instead of one job.)
  const MIN_PER_FULLTIME_YEAR = 40 * 52 * 60; // 124,800 minutes
  const rateLine = (amount) => {
    if (minutes <= 0) return '';
    const perMin = amount / minutes;
    const yearly = `~$${Math.round(perMin * MIN_PER_FULLTIME_YEAR).toLocaleString()}`;
    return `≈ ${money(perMin)}/min · ${yearly}/yr at 40 hrs/wk`;
  };

  const row = (label, val, strong) => `<div class="sim-row${strong ? ' sim-row-total' : ''}"><span>${label}</span><span>${money(val)}</span></div>`;
  const note = (txt) => `<p class="sim-note">${txt}</p>`;
  const serviceRevenue = roundMoneyValue(fuelFee + washFee + inspFee + timeCharge + stationSurcharge + washSurcharge);
  out.innerHTML = `
    <div class="sim-cols">
      <div class="sim-card sim-card-customer">
        <h5>Customer pays</h5>
        ${note('Every line on the customer\'s bill. Fuel/wash cost is a pass-through (you reimburse the station); the fees + time + surcharge are your revenue.')}
        ${needsFuel ? row(`Fuel (${gallons} gal × ${money(pricePerGallon)})`, fuelCost) : ''}
        ${needsWash ? row('Wash package', washPrice) : ''}
        ${needsFuel ? row('Fuel service fee', fuelFee) : ''}
        ${needsWash ? row('Wash service fee', washFee) : ''}
        ${quick ? row('Vehicle add-ons', inspFee) : ''}
        ${timeCharge > 0 ? row(`Service time (${serviceMin.toFixed(1)} min × ${money(companyRate)})`, timeCharge) : ''}
        ${stationSurcharge > 0 ? row('Gas station distance', stationSurcharge) : ''}
        ${washSurcharge > 0 ? row(`Car wash distance (past ${washDetourFree} free mi)`, washSurcharge) : ''}
        ${row('Card processing recovery', cardRecovery)}
        ${row('Total', customerTotal, true)}
      </div>
      <div class="sim-card sim-card-worker">
        <h5>Worker earns</h5>
        ${note('What the driver takes home for this job.')}
        ${fuelFeeShare > 0 ? row(`Fuel fee share (${Math.round(fuelSharePct * 100)}%, net card)`, fuelFeeShare) : ''}
        ${washFeeShare > 0 ? row(`Wash fee share (${Math.round(washSharePct * 100)}%, net card)`, washFeeShare) : ''}
        ${inspFeeShare > 0 ? row(`Quick-care fee share (${Math.round(inspSharePct * 100)}%, net card)`, inspFeeShare) : ''}
        ${feeShare > 0 ? note(`Each fee pays its own share of (fee − its slice of the ${money(feeStripe)} card cost). Fees ${money(feeGross)} total.`) : ''}
        ${timePay > 0 ? row('Service time', timePay) + note(`${serviceMin.toFixed(1)} service-minutes × ${money(workerRate)}/min (this driver's rate).`) : ''}
        ${mileagePay > 0 ? row('Station mileage', mileagePay) + note(`${stationMiles} extra round-trip mi × ${money(washDetourRate)}/mi.`) : ''}
        ${washDetourPay > 0 ? row('Wash detour', washDetourPay) + note(`${washMiles} round-trip wash detour mi × ${money(washDetourRate)}/mi — paid on every mile (the customer's free ${washDetourFree} mi don't reduce the driver's pay).`) : ''}
        ${row('Take-home', workerPay, true)}
        ${minutes > 0 ? note(rateLine(workerPay)) : ''}
        ${workerRateRaw > companyRate && companyRate > 0 ? note(`Heads up: worker rate capped at the company rate (${money(companyRate)}/min).`) : ''}
      </div>
      <div class="sim-card sim-card-company">
        <h5>Company keeps</h5>
        ${note('Your margin after paying the driver.')}
        ${row('Service revenue', serviceRevenue)}
        ${note(`The fees + time charge + distance surcharges you collect (service fees${timeCharge > 0 ? ' + service time' : ''}${stationSurcharge > 0 ? ' + gas distance' : ''}${washSurcharge > 0 ? ' + wash distance' : ''}). Fuel/wash cost isn't here — it's reimbursed, not revenue.`)}
        ${row('Less worker pay', -workerPay)}
        ${row('Net margin', companyNet, true)}
        ${minutes > 0 ? note(rateLine(companyNet)) : ''}
        ${note(companyNet < 0 ? '⚠️ Negative — you would lose money on this job. Raise a fee or lower the pay rate.' : 'This is what the company keeps after the driver is paid.')}
      </div>
    </div>
    <p class="sim-time"><strong>Worker time to complete:</strong> ~${minutes} min</p>
  `;

  // ── Annual planner: blend the expected job mix into a yearly projection, and
  // optionally recommend a service-fee scale to hit a company-net target. Each
  // service type is costed with its OWN time + distance, so jobs aren't treated
  // as one uniform ~N-min job. ──
  const goalOut = document.getElementById('sim-goal-output');
  if (goalOut) {
    // Per-job company net + worker pay for one service type at a given fee scale.
    const jobEconomics = (nF, nW, gal, staMi, washMi, scale) => {
      let fF = (nF ? rawFuelFee : 0) * scale;
      let wF = (nW ? rawWashFee : 0) * scale;
      let fShare = rawFuelSharePct;
      let wShare = rawWashSharePct;
      // Fuel + Wash combo: bundle leg fees + bundle worker shares (scaled with the
      // goal-seek so the discount % holds as fees move). Mirrors booking/worker.
      if (nF && nW) {
        const bf = simBundleFuelFee * scale;
        const bw = simBundleWashFee * scale;
        if ((bf + bw) > 0 && (bf + bw) < (fF + wF)) {
          fF = bf; wF = bw;
          fShare = simBundleFuelShare; wShare = simBundleWashShare;
        }
      }
      const sMin = (nF ? fuelBaseMin + fuelPerGalMin * gal : 0) + (nW ? washTimeMin : 0);
      const tCharge = roundMoneyValue(sMin * companyRate);
      const staSur = nF ? roundMoneyValue(staMi * perMileRate) : 0;
      const washSur = nW ? roundMoneyValue(Math.max(0, washMi - washDetourFree) * perMileRate) : 0;
      const tot = fF + wF;
      const stripe = tot > 0 ? roundMoneyValue(tot * RETURN_RECOVERY_RATE + RETURN_RECOVERY_FIXED) : 0;
      const netOf = (fee) => (tot > 0 ? Math.max(0, fee - stripe * (fee / tot)) : 0);
      const feeShareW = roundMoneyValue(netOf(fF) * fShare + netOf(wF) * wShare);
      const workerPay = roundMoneyValue(feeShareW + sMin * workerRate + (nF ? staMi * washDetourRate : 0) + (nW ? washMi * washDetourRate : 0));
      const serviceRev = roundMoneyValue(fF + wF + tCharge + staSur + washSur);
      return { companyNet: roundMoneyValue(serviceRev - workerPay), workerPay };
    };

    const mix = [
      { nF: true,  nW: false, jobs: simNum('mix-fuel-jobs', 0), gal: simNum('mix-fuel-gal', 0), sta: simNum('mix-fuel-sta', 0), wash: 0 },
      { nF: false, nW: true,  jobs: simNum('mix-wash-jobs', 0), gal: 0,                         sta: 0,                         wash: simNum('mix-wash-wash', 0) },
      { nF: true,  nW: true,  jobs: simNum('mix-both-jobs', 0), gal: simNum('mix-both-gal', 0), sta: simNum('mix-both-sta', 0), wash: simNum('mix-both-wash', 0) },
    ];
    const totalJobs = mix.reduce((s, m) => s + (m.jobs > 0 ? m.jobs : 0), 0);

    if (totalJobs <= 0) {
      goalOut.innerHTML = note('Enter how many jobs of each type you expect per year to see the yearly projection.');
    } else {
      const annualAt = (scale) => {
        let co = 0, wo = 0;
        for (const m of mix) {
          if (m.jobs <= 0) continue;
          const e = jobEconomics(m.nF, m.nW, m.gal, m.sta, m.wash, scale);
          co += e.companyNet * m.jobs;
          wo += e.workerPay * m.jobs;
        }
        return { company: roundMoneyValue(co), worker: roundMoneyValue(wo) };
      };
      const base = annualAt(1);
      const goalRow = (label, val, strong) => `<div class="sim-row${strong ? ' sim-row-total' : ''}"><span>${label}</span><span>${val}</span></div>`;
      const yr = (n) => `$${Math.round(n).toLocaleString()}`;

      let out = `<div class="sim-card sim-card-company" style="margin-top:.5rem">
        <h5>Projected year — ${totalJobs.toLocaleString()} jobs</h5>
        ${note('Blended across your job mix at the current rates.')}
        ${goalRow('Company net', `${yr(base.company)}/yr`, true)}
        ${goalRow('Worker pay (all drivers)', `${yr(base.worker)}/yr`)}`;

      const targetYear = simNum('mix-target-year', 0);
      if (targetYear > 0) {
        const a1 = base.company;
        const slope = annualAt(2).company - a1; // company $/yr per unit of fee scale
        let scale = slope > 0 ? 1 + (targetYear - a1) / slope : 1;
        if (!Number.isFinite(scale) || scale < 0) scale = 0;
        const rec = annualAt(scale);
        const alreadyMet = a1 >= targetYear;
        out += `<hr style="border:0;border-top:1px solid var(--admin-line,#e5e7eb);margin:10px 0">
          <h5>To net ${yr(targetYear)}/yr</h5>
          ${note(alreadyMet ? 'Your current pricing already clears this target — you could lower fees.' : 'Recommended fees to close the gap (scales the fuel + wash service fees together):')}
          ${goalRow('Recommended fuel service fee', `${money(roundMoneyValue(fuelFee * scale))} <span style="color:#60716d">(now ${money(fuelFee)})</span>`)}
          ${goalRow('Recommended wash service fee', `${money(roundMoneyValue(washFee * scale))} <span style="color:#60716d">(now ${money(washFee)})</span>`)}
          ${goalRow('Company net', `${yr(rec.company)}/yr`, true)}
          ${goalRow('Worker pay (all drivers)', `${yr(rec.worker)}/yr`)}
          ${note('Set these fuel/wash fees in the groups above to apply.')}`;
      } else {
        out += note('Add a target company net to get a recommended fee.');
      }
      out += '</div>';
      goalOut.innerHTML = out;
    }
  }
}

// Recompute the simulator whenever a scenario input or a pricing-form rate changes.
['input', 'change'].forEach((evt) => document.addEventListener(evt, (event) => {
  const id = event.target?.id || '';
  if (id.startsWith('sim-') || id.startsWith('sp-') || id.startsWith('mix-')) runPricingSimulator();
  if (id === 'sp-fuel-fee' || id === 'sp-wash-fee' || id.startsWith('sp-bundle-')) updateBundleSavingsPreview();
}));

// Gather the time-comp pricing params for admin_update_service_pricing. Falls back
// to your defaults so a blank field never zeroes a rate by accident.
function timeCompPricingParams() {
  const num = (id) => Number(document.getElementById(id)?.value);
  const v = (id, dflt) => (Number.isFinite(num(id)) ? num(id) : dflt);
  return {
    p_time_rate_per_min: v('sp-time-rate', 0),
    p_fuel_time_base_min: v('sp-fuel-time-base', 3),
    p_fuel_time_per_gallon_min: v('sp-fuel-time-per-gal', 0.5),
    p_wash_time_min: v('sp-wash-time', 20),
    p_wash_detour_free_miles: v('sp-wash-detour-free', 5),
    p_wash_detour_rate: v('sp-wash-detour-rate', 0.725),
    // Worker service-fee shares: form stores whole percents, DB stores fractions.
    p_fuel_fee_share: v('sp-fuel-share', 50) / 100,
    p_wash_fee_share: v('sp-wash-share', 50) / 100,
    p_quick_care_fee_share: v('sp-quick-share', 50) / 100,
    // Fuel + Wash bundle, per leg (0/0 fees = off). Keep combined = sum for any
    // legacy reader. Shares: form stores whole percents, DB stores fractions.
    p_bundle_fuel_service_fee: v('sp-bundle-fuel-fee', 0),
    p_bundle_wash_service_fee: v('sp-bundle-wash-fee', 0),
    p_bundle_fuel_fee_share: v('sp-bundle-fuel-share', 50) / 100,
    p_bundle_wash_fee_share: v('sp-bundle-wash-share', 50) / 100,
    p_combined_service_fee: v('sp-bundle-fuel-fee', 0) + v('sp-bundle-wash-fee', 0),
  };
}

// Live breakdown + "Save X%" preview in the Bundle accordion, so the admin sees the
// combined customer price, the saving, and each leg's worker cut as they tune the
// fields. Same active-bundle math as booking-flow.js updateBundleBadges.
function updateBundleSavingsPreview() {
  const out = document.getElementById('sp-bundle-savings');
  if (!out) return;
  const num = (id) => Number(document.getElementById(id)?.value);
  const val = (id) => (Number.isFinite(num(id)) ? num(id) : 0);
  const fuel = val('sp-fuel-fee');
  const wash = val('sp-wash-fee');
  const bFuel = val('sp-bundle-fuel-fee');
  const bWash = val('sp-bundle-wash-fee');
  const bFuelShare = val('sp-bundle-fuel-share');
  const bWashShare = val('sp-bundle-wash-share');
  const combined = roundMoneyValue(bFuel + bWash);
  const full = fuel + wash;
  if (combined <= 0) {
    out.innerHTML = `<p class="sim-note">Bundle off — customers booking both pay the full ${money(full)} (fuel ${money(fuel)} + wash ${money(wash)}).</p>`;
    return;
  }
  const breakdown = `<p class="sim-note">Combined customer price <strong>${money(combined)}</strong> = bundle fuel ${money(bFuel)} (driver ${Math.round(bFuelShare)}%) + bundle wash ${money(bWash)} (driver ${Math.round(bWashShare)}%).</p>`;
  if (combined >= full) {
    out.innerHTML = `${breakdown}<p class="sim-note">⚠️ ${money(combined)} is not below the separate fees (${money(full)}), so there's no saving and the bundle won't apply. Lower a leg to discount.</p>`;
    return;
  }
  const pct = Math.round((1 - combined / full) * 100);
  out.innerHTML = `<div class="bundle-savings-badge">Customers save ${pct}%</div>
    ${breakdown}
    <p class="sim-note">Booking both = ${money(combined)} instead of ${money(full)} (saves ${money(roundMoneyValue(full - combined))}). The "Save ${pct}%" badge shows on the Fuel + Car Wash option.</p>`;
}

function showPricingPendingBanner(fuelData, pricingData) {
  const banner = document.getElementById('pricing-pending-banner');
  if (!banner) return;

  const effectiveAt = fuelData?.prices_effective_at || pricingData?.prices_effective_at;
  const hasPending = (fuelData?.pending_prices || pricingData?.pending_prices) && effectiveAt;

  if (!hasPending) {
    banner.hidden = true;
    return;
  }

  const when = new Date(effectiveAt).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
  banner.hidden = false;
  banner.innerHTML = `
    <span class="pricing-pending-icon">⏰</span>
    <span>Price update scheduled for <strong>${when}</strong>. Current prices remain active until then.</span>
    <button type="button" class="pricing-pending-cancel" id="cancel-pending-prices">Cancel scheduled update</button>
  `;

  document.getElementById('cancel-pending-prices')?.addEventListener('click', async () => {
    try {
      await Promise.all([
        db.rpc('admin_update_fuel_prices', {
          p_token: adminAuthToken(),
          p_regular: Number(document.getElementById('fp-regular')?.value || 0),
          p_midgrade: Number(document.getElementById('fp-midgrade')?.value || 0),
          p_premium: Number(document.getElementById('fp-premium')?.value || 0),
          p_diesel: Number(document.getElementById('fp-diesel')?.value || 0),
          p_effective_at: null,
        }),
        db.rpc('admin_update_service_pricing', {
          p_token: adminAuthToken(),
          p_fuel_service_fee: Number(document.getElementById('sp-fuel-fee')?.value || 0),
          p_wash_service_fee: Number(document.getElementById('sp-wash-fee')?.value || 0),
          p_quick_inspection_fee: Number(document.getElementById('sp-inspection-fee')?.value || 0),
          p_wash_buff_shine_price: Number(document.getElementById('sp-wash-buff-shine')?.value || 0),
          p_wash_shine_protect_price: Number(document.getElementById('sp-wash-shine-protect')?.value || 0),
          p_wash_shine_price: Number(document.getElementById('sp-wash-shine')?.value || 0),
          p_wash_double_wash_price: Number(document.getElementById('sp-wash-double')?.value || 0),
          p_effective_at: null,
          p_per_mile_rate: Number(document.getElementById('sp-per-mile-rate')?.value || 0.75),
          ...timeCompPricingParams(),
        }),
      ]);
      banner.hidden = true;
      const statusEl = document.getElementById('services-settings-status');
      if (statusEl) statusEl.textContent = 'Scheduled update cancelled. Current prices remain active.';
    } catch (err) {
      console.error('Cancel pending prices failed:', err);
    }
  });
}

async function loadFuelPricesForAdmin() {
  renderServicesSettingsList();
  try {
    const { data, error } = await db.rpc('public_get_fuel_prices');
    if (error || !data) return;
    const v = (id) => document.getElementById(id);
    if (v('fp-regular')) v('fp-regular').value = Number(data.regular_price).toFixed(3);
    if (v('fp-midgrade')) v('fp-midgrade').value = Number(data.midgrade_price).toFixed(3);
    if (v('fp-premium')) v('fp-premium').value = Number(data.premium_price).toFixed(3);
    if (v('fp-diesel')) v('fp-diesel').value = Number(data.diesel_price).toFixed(3);
    return data;
  } catch {
    // Non-fatal — form stays blank.
  }
}

let adminCompanyTimeRatePerMin = 0.50; // company $/min cap for employee rates
function applyServicePricing(data) {
  if (!data) return;
  BASE_FUEL_SERVICE_FEE = Number(data.fuel_service_fee);
  BASE_WASH_SERVICE_FEE = Number(data.wash_service_fee);
  BASE_QUICK_INSPECTION_FEE = Number(data.quick_inspection_fee);
  if (data.time_rate_per_min != null) adminCompanyTimeRatePerMin = Number(data.time_rate_per_min);
  // Keep the payroll-fallback payout mirror in sync with live settings (frozen
  // [worker_payout] jobs are unaffected). The single wash_detour_rate drives both
  // the gas-station mileage and the wash detour, matching worker.js.
  if (data.time_rate_per_min != null) ADMIN_TIME_COMP.companyRatePerMin = Number(data.time_rate_per_min);
  if (data.fuel_time_base_min != null) ADMIN_TIME_COMP.fuelBaseMin = Number(data.fuel_time_base_min);
  if (data.fuel_time_per_gallon_min != null) ADMIN_TIME_COMP.fuelPerGallonMin = Number(data.fuel_time_per_gallon_min);
  if (data.wash_time_min != null) ADMIN_TIME_COMP.washMin = Number(data.wash_time_min);
  if (data.wash_detour_free_miles != null) ADMIN_TIME_COMP.washDetourFreeMiles = Number(data.wash_detour_free_miles);
  if (data.wash_detour_rate != null) {
    ADMIN_TIME_COMP.washDetourRate = Number(data.wash_detour_rate);
    WORKER_MILEAGE_RATE = Number(data.wash_detour_rate);
  }
  if (data.fuel_fee_share != null) ADMIN_FEE_SHARES.fuel = Number(data.fuel_fee_share);
  if (data.wash_fee_share != null) ADMIN_FEE_SHARES.wash = Number(data.wash_fee_share);
  if (data.quick_care_fee_share != null) ADMIN_FEE_SHARES.insp = Number(data.quick_care_fee_share);
  if (data.bundle_fuel_service_fee != null) ADMIN_BUNDLE.fuelFee = Number(data.bundle_fuel_service_fee);
  if (data.bundle_wash_service_fee != null) ADMIN_BUNDLE.washFee = Number(data.bundle_wash_service_fee);
  if (data.bundle_fuel_fee_share != null) ADMIN_BUNDLE.fuelShare = Number(data.bundle_fuel_fee_share);
  if (data.bundle_wash_fee_share != null) ADMIN_BUNDLE.washShare = Number(data.bundle_wash_fee_share);
  CR_FEES = {
    fuelConvenience: Number(data.fuel_service_fee),
    washConvenience: Number(data.wash_service_fee),
    quickInspection: Number(data.quick_inspection_fee),
  };
  CR_WASH_PACKAGES = [
    { value: 'buff-shine', label: 'Buff & Shine', price: Number(data.wash_buff_shine_price) },
    { value: 'shine-protect', label: 'Shine & Protect', price: Number(data.wash_shine_protect_price) },
    { value: 'shine', label: 'Shine', price: Number(data.wash_shine_price) },
    { value: 'double-wash', label: 'Double Wash', price: Number(data.wash_double_wash_price) },
  ];
}

async function loadServicePricing() {
  renderServicesSettingsList();
  try {
    const { data, error } = await db.rpc('public_get_service_pricing');
    if (error || !data) return;
    applyServicePricing(data);

    const v = (id) => document.getElementById(id);
    if (v('sp-fuel-fee')) v('sp-fuel-fee').value = Number(data.fuel_service_fee).toFixed(2);
    if (v('sp-wash-fee')) v('sp-wash-fee').value = Number(data.wash_service_fee).toFixed(2);
    if (v('sp-inspection-fee')) v('sp-inspection-fee').value = Number(data.quick_inspection_fee).toFixed(2);
    if (v('sp-per-mile-rate')) v('sp-per-mile-rate').value = Number(data.per_mile_rate ?? 0.75).toFixed(2);
    if (v('sp-time-rate')) v('sp-time-rate').value = Number(data.time_rate_per_min ?? 0.50).toFixed(2);
    if (v('sp-fuel-time-base')) v('sp-fuel-time-base').value = Number(data.fuel_time_base_min ?? 3);
    if (v('sp-fuel-time-per-gal')) v('sp-fuel-time-per-gal').value = Number(data.fuel_time_per_gallon_min ?? 0.5);
    if (v('sp-wash-time')) v('sp-wash-time').value = Number(data.wash_time_min ?? 20);
    if (v('sp-wash-detour-free')) v('sp-wash-detour-free').value = Number(data.wash_detour_free_miles ?? 5);
    if (v('sp-wash-detour-rate')) v('sp-wash-detour-rate').value = Number(data.wash_detour_rate ?? 0.725).toFixed(3);
    if (v('sp-fuel-share')) v('sp-fuel-share').value = Math.round(Number(data.fuel_fee_share ?? 0.5) * 100);
    if (v('sp-wash-share')) v('sp-wash-share').value = Math.round(Number(data.wash_fee_share ?? 0.5) * 100);
    if (v('sp-quick-share')) v('sp-quick-share').value = Math.round(Number(data.quick_care_fee_share ?? 0.5) * 100);
    if (v('sp-bundle-fuel-fee')) v('sp-bundle-fuel-fee').value = Number(data.bundle_fuel_service_fee ?? 0).toFixed(2);
    if (v('sp-bundle-wash-fee')) v('sp-bundle-wash-fee').value = Number(data.bundle_wash_service_fee ?? 0).toFixed(2);
    if (v('sp-bundle-fuel-share')) v('sp-bundle-fuel-share').value = Math.round(Number(data.bundle_fuel_fee_share ?? 0.5) * 100);
    if (v('sp-bundle-wash-share')) v('sp-bundle-wash-share').value = Math.round(Number(data.bundle_wash_fee_share ?? 0.5) * 100);
    if (v('sp-wash-buff-shine')) v('sp-wash-buff-shine').value = Number(data.wash_buff_shine_price).toFixed(2);
    if (v('sp-wash-shine-protect')) v('sp-wash-shine-protect').value = Number(data.wash_shine_protect_price).toFixed(2);
    if (v('sp-wash-shine')) v('sp-wash-shine').value = Number(data.wash_shine_price).toFixed(2);
    if (v('sp-wash-double')) v('sp-wash-double').value = Number(data.wash_double_wash_price).toFixed(2);

    // Seed the payout simulator's editable rate inputs with the saved settings,
    // then recompute it (its first render ran before this data arrived).
    if (v('sim-fuel-fee')) v('sim-fuel-fee').value = Number(data.fuel_service_fee).toFixed(2);
    if (v('sim-wash-fee')) v('sim-wash-fee').value = Number(data.wash_service_fee).toFixed(2);
    if (v('sim-insp-fee')) v('sim-insp-fee').value = Number(data.quick_inspection_fee).toFixed(2);
    if (v('sim-company-rate')) v('sim-company-rate').value = Number(data.time_rate_per_min ?? 0.50).toFixed(2);
    if (v('sim-per-mile')) v('sim-per-mile').value = Number(data.per_mile_rate ?? 0.75).toFixed(2);
    if (v('sim-worker-mile')) v('sim-worker-mile').value = Number(data.wash_detour_rate ?? 0.725).toFixed(3);
    if (v('sim-fuel-share')) v('sim-fuel-share').value = Math.round(Number(data.fuel_fee_share ?? 0.5) * 100);
    if (v('sim-wash-share')) v('sim-wash-share').value = Math.round(Number(data.wash_fee_share ?? 0.5) * 100);
    if (v('sim-insp-share')) v('sim-insp-share').value = Math.round(Number(data.quick_care_fee_share ?? 0.5) * 100);
    if (typeof runPricingSimulator === 'function') runPricingSimulator();
    if (typeof updateBundleSavingsPreview === 'function') updateBundleSavingsPreview();
    return data;
  } catch {
    // Non-fatal — form keeps its defaults.
  }
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

document.querySelector('#admin-password-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const statusEl = document.querySelector('#admin-password-status');
  const submitBtn = event.target.querySelector('[type="submit"]');

  const currentPassword = document.querySelector('#admin-current-password')?.value || '';
  const newPassword = document.querySelector('#admin-new-password')?.value || '';
  const confirmPassword = document.querySelector('#admin-confirm-password')?.value || '';

  if (newPassword.length < 8) {
    if (statusEl) statusEl.textContent = 'New password must be at least 8 characters.';
    return;
  }
  if (newPassword !== confirmPassword) {
    if (statusEl) statusEl.textContent = 'New password and confirmation do not match.';
    return;
  }

  if (statusEl) statusEl.textContent = 'Updating password...';
  if (submitBtn) submitBtn.disabled = true;

  try {
    const [currentHash, newHash] = await Promise.all([sha256Hex(currentPassword), sha256Hex(newPassword)]);

    const { error } = await db.rpc('admin_change_password', {
      p_token: adminAuthToken(),
      p_current_password_hash: currentHash,
      p_new_password_hash: newHash,
    });

    if (error) throw error;

    event.target.reset();
    if (statusEl) statusEl.textContent = 'Password updated.';
  } catch (err) {
    const msg = err?.message || '';
    if (msg.includes('INVALID_CURRENT_PASSWORD')) {
      if (statusEl) statusEl.textContent = 'Current password is incorrect.';
    } else {
      console.error('Admin password change failed:', err);
      if (statusEl) statusEl.textContent = `Could not update password: ${msg || err}`;
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

// ── Admin Change Username ────────────────────────────────────────────
// (Removed the legacy #admin-username-form handler: that form was never rendered,
// and it called admin_change_username with the obsolete p_current_password_hash
// param — broken since migration 202606261900 switched it to verify the current
// USERNAME. The live username change is #account-username-form below.)

// ── Services Pricing Form Submit ─────────────────────────────────────
document.querySelector('#services-settings-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const statusEl = document.getElementById('services-settings-status');
  const submitBtn = event.target.querySelector('[type="submit"]');

  if (statusEl) statusEl.textContent = 'Saving...';
  if (submitBtn) submitBtn.disabled = true;

  try {
    const val = (id) => parseFloat(document.getElementById(id)?.value || '0');
    const effectiveDateRaw = document.getElementById('sp-effective-date')?.value;
    const effectiveAt = effectiveDateRaw ? new Date(effectiveDateRaw).toISOString() : null;
    const isScheduled = effectiveAt && new Date(effectiveDateRaw) > new Date();

    const [fuelResult, pricingResult] = await Promise.all([
      db.rpc('admin_update_fuel_prices', {
        p_token: adminAuthToken(),
        p_regular: val('fp-regular'),
        p_midgrade: val('fp-midgrade'),
        p_premium: val('fp-premium'),
        p_diesel: val('fp-diesel'),
        p_service_area: null,
        p_effective_at: effectiveAt,
      }),
      db.rpc('admin_update_service_pricing', {
        p_token: adminAuthToken(),
        p_fuel_service_fee: val('sp-fuel-fee'),
        p_wash_service_fee: val('sp-wash-fee'),
        p_quick_inspection_fee: val('sp-inspection-fee'),
        p_wash_buff_shine_price: val('sp-wash-buff-shine'),
        p_wash_shine_protect_price: val('sp-wash-shine-protect'),
        p_wash_shine_price: val('sp-wash-shine'),
        p_wash_double_wash_price: val('sp-wash-double'),
        p_effective_at: effectiveAt,
        p_per_mile_rate: val('sp-per-mile-rate'),
        ...timeCompPricingParams(),
      }),
    ]);

    if (fuelResult.error) throw fuelResult.error;
    if (pricingResult.error) throw pricingResult.error;

    if (!isScheduled) applyServicePricing(pricingResult.data);

    const dateInput = document.getElementById('sp-effective-date');
    if (dateInput) dateInput.value = '';

    if (isScheduled) {
      const when = new Date(effectiveDateRaw).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
      });
      if (statusEl) statusEl.textContent = `Price update scheduled for ${when}.`;
      showPricingPendingBanner(fuelResult.data, pricingResult.data);
    } else {
      if (statusEl) statusEl.textContent = 'Prices updated successfully.';
      const banner = document.getElementById('pricing-pending-banner');
      if (banner) banner.hidden = true;
    }
  } catch (err) {
    console.error('Service pricing save failed:', err);
    if (statusEl) statusEl.textContent = `Could not save: ${err.message || err}`;
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

document.addEventListener('toggle', (event) => {
  const detail = event.target;
  if (!(detail instanceof HTMLDetailsElement)) return;
  if (!detail.classList.contains('svc-acc') || !detail.open) return;
  if (!window.matchMedia('(max-width: 760px)').matches) return;
  const servicesSection = detail.closest('[data-page-section="services"], #services-settings-list');
  if (!servicesSection) return;
  servicesSection.querySelectorAll('details.svc-acc[open]').forEach((item) => {
    if (item !== detail && !item.contains(detail)) item.open = false;
  });
}, true);

// ====================== ADMIN MOBILE MENU ======================
const avatarBtn = document.getElementById('admin-avatar-btn');
const mobileMenu = document.getElementById('admin-mobile-menu');
const menuClose = document.getElementById('admin-menu-close');
const menuOverlay = document.querySelector('.admin-menu-overlay');
const menuLogout = document.getElementById('admin-menu-logout');

function openAdminMenu() {
  if (!mobileMenu) return;
  // Mark the current active page in the menu
  const currentPage = document.body.dataset.adminPage || 'dashboard';
  document.querySelectorAll('.admin-menu-item[data-page]').forEach(item => {
    item.classList.toggle('is-active', item.dataset.page === currentPage);
  });
  mobileMenu.removeAttribute('hidden');
  document.body.style.overflow = 'hidden';
}

function closeAdminMenu() {
  if (mobileMenu) {
    mobileMenu.setAttribute('hidden', '');
    document.body.style.overflow = '';
  }
}

// Open account modal from avatar button (desktop); fall back to mobile menu on small screens
if (avatarBtn) avatarBtn.addEventListener('click', () => {
  const modal = document.getElementById('admin-account-modal');
  if (modal) {
    modal.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
  } else {
    openAdminMenu();
  }
});

const accountModal = document.getElementById('admin-account-modal');
const closeAccountModal = document.getElementById('close-account-modal');

function _closeAccountModal() {
  if (accountModal) {
    accountModal.setAttribute('hidden', '');
    document.body.style.overflow = '';
  }
}

if (closeAccountModal) closeAccountModal.addEventListener('click', _closeAccountModal);
if (accountModal) accountModal.addEventListener('click', (e) => {
  if (e.target === accountModal) _closeAccountModal();
});

// Accordion toggles
function setupAccordion(toggleId, bodyId) {
  const btn = document.getElementById(toggleId);
  const body = document.getElementById(bodyId);
  if (!btn || !body) return;
  btn.addEventListener('click', () => {
    const open = !body.hidden;
    body.hidden = open;
    btn.setAttribute('aria-expanded', String(!open));
  });
}
setupAccordion('acc-username-toggle', 'acc-username-body');
setupAccordion('acc-password-toggle', 'acc-password-body');

document.getElementById('account-modal-logout')?.addEventListener('click', () => {
  _closeAccountModal();
  adminSignOut();
});

document.querySelector('#account-username-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const statusEl = document.getElementById('account-username-status');
  const submitBtn = e.target.querySelector('[type="submit"]');
  const currentUsername = (document.getElementById('account-current-username')?.value || '').trim();
  const newUsername = (document.getElementById('account-new-name')?.value || '').trim();

  if (!currentUsername) {
    if (statusEl) statusEl.textContent = 'Enter your current username.';
    return;
  }
  if (newUsername.length < 3) {
    if (statusEl) statusEl.textContent = 'New name must be at least 3 characters.';
    return;
  }
  if (statusEl) statusEl.textContent = 'Updating name...';
  if (submitBtn) submitBtn.disabled = true;
  try {
    // Hash both names the same way the login + new name are hashed (lowercased),
    // so the current-username check matches the stored admin_username_hash.
    const [currentHash, newHash] = await Promise.all([sha256Hex(currentUsername.toLowerCase()), sha256Hex(newUsername.toLowerCase())]);
    const { error } = await db.rpc('admin_change_username', { p_token: adminAuthToken(), p_current_username_hash: currentHash, p_new_username_hash: newHash });
    if (error) throw error;
    e.target.reset();
    if (statusEl) statusEl.textContent = 'Name updated.';
  } catch (err) {
    const msg = err?.message || '';
    if (statusEl) statusEl.textContent = msg.includes('INVALID_CURRENT_USERNAME') ? 'Current username is incorrect.' : `Could not update name: ${msg || err}`;
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

document.querySelector('#account-password-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const statusEl = document.getElementById('account-password-status');
  const submitBtn = e.target.querySelector('[type="submit"]');
  const currentPassword = document.getElementById('account-current-pw')?.value || '';
  const newPassword = document.getElementById('account-new-pw')?.value || '';

  if (newPassword.length < 8) {
    if (statusEl) statusEl.textContent = 'New password must be at least 8 characters.';
    return;
  }
  if (statusEl) statusEl.textContent = 'Updating password...';
  if (submitBtn) submitBtn.disabled = true;
  try {
    const [currentHash, newHash] = await Promise.all([sha256Hex(currentPassword), sha256Hex(newPassword)]);
    const { error } = await db.rpc('admin_change_password', { p_token: adminAuthToken(), p_current_password_hash: currentHash, p_new_password_hash: newHash });
    if (error) throw error;
    e.target.reset();
    if (statusEl) statusEl.textContent = 'Password updated.';
  } catch (err) {
    const msg = err?.message || '';
    if (statusEl) statusEl.textContent = msg.includes('INVALID_CURRENT_PASSWORD') ? 'Current password is incorrect.' : `Could not update password: ${msg || err}`;
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});
if (menuClose) menuClose.addEventListener('click', closeAdminMenu);
if (menuOverlay) menuOverlay.addEventListener('click', closeAdminMenu);

if (menuLogout) {
  menuLogout.addEventListener('click', () => {
    if (confirm('Sign out of Admin Portal?')) {
      adminSignOut();
    }
  });
}

// Menu navigation
document.querySelectorAll('.admin-menu-item').forEach(item => {
  item.addEventListener('click', () => {
    const page = item.dataset.page;
    if (page) {
      switchPageTab(page);
      closeAdminMenu();
    }
  });
});

// Close menu on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && mobileMenu && !mobileMenu.hasAttribute('hidden')) {
    closeAdminMenu();
  }
  if (e.key === 'Escape' && accountModal && !accountModal.hasAttribute('hidden')) {
    _closeAccountModal();
  }
});

// Called here to avoid temporal dead zone
loadServicePricing();

// ── Promo codes (Promos tab) ─────────────────────────────────────────────────
const promosList = document.querySelector('#promos-list');
const promoForm = document.querySelector('#promo-form');
const promoNewBtn = document.querySelector('#promo-new-btn');
const promoCancelBtn = document.querySelector('#promo-cancel-btn');
const promoFormStatus = document.querySelector('#promo-form-status');

async function promoApi(payload) {
  const res = await fetch('/api/promos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, admin_token: adminAuthToken() }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function promoDiscountLabel(p) {
  if (p.discount_type === 'free_addon') return 'Free add-on';
  return p.discount_type === 'percent' ? `${Number(p.discount_value)}% off` : `${money(p.discount_value)} off`;
}
function promoAudienceLabel(a) {
  return {
    everyone: 'Everyone',
    account: 'My Account',
    guest: 'Guests',
    inactive: 'Inactive',
    specific: 'Specific customer',
    new: 'New customers',
    returning: 'Returning customers',
    all: 'All customers',
  }[a || 'everyone'] || 'Everyone';
}
function promoAppliesLabel(a) {
  return {
    total: 'whole total',
    wash_and_fees: 'service fees + wash',
    fuel_service: 'fuel service fee',
    wash_service: 'car wash service fee',
    inspection: 'inspection fee',
    service_fees: 'service fees',
  }[a || 'service_fees'] || 'service fees';
}

async function loadPromos() {
  if (!promosList || !adminAuthToken()) return;
  promosList.innerHTML = '<div class="empty-state"><p>Loading promo codes…</p></div>';
  try {
    const data = await promoApi({ action: 'list' });
    renderPromosList(data.promos || []);
  } catch (err) {
    promosList.innerHTML = `<div class="empty-state"><p>Could not load promo codes.</p><p class="field-help">Make sure the promo_codes migration has been run in Supabase. (${escapeHtml(err.message)})</p></div>`;
  }
}

function renderPromosList(promos) {
  if (!promos.length) {
    promosList.innerHTML = '<div class="empty-state"><p>No promo codes yet. Create one with “+ New code”.</p></div>';
    return;
  }
  promosList._promos = promos;
  promosList.innerHTML = promos.map((p) => {
    const limits = [];
    const targetAudience = p.target_audience || (p.audience === 'all' ? 'everyone' : p.audience);
    const services = Array.isArray(p.eligible_services) && p.eligible_services.length ? p.eligible_services : ['all'];
    if (Number(p.min_order_amount) > 0) limits.push(`min ${money(p.min_order_amount)}`);
    if (p.starts_at) limits.push(`starts ${new Date(p.starts_at).toLocaleDateString()}`);
    if (Number(p.per_customer_limit) > 0) limits.push(`${p.per_customer_limit}/customer`);
    limits.push(p.max_redemptions != null ? `${p.redemption_count}/${p.max_redemptions} used` : `${p.redemption_count} used`);
    if (p.expires_at) limits.push(`exp ${new Date(p.expires_at).toLocaleDateString()}`);
    return `
      <div class="promo-card ${p.active ? '' : 'is-inactive'}" data-promo-id="${escapeHtml(p.id)}">
        <div class="promo-card-main">
          <div class="promo-card-tags">
            <span class="promo-card-code">${escapeHtml(p.code)}</span>
            <span class="promo-card-badge">${escapeHtml(promoDiscountLabel(p))} ${escapeHtml(promoAppliesLabel(p.applies_to))}</span>
            <span class="promo-card-badge promo-card-audience">${escapeHtml(promoAudienceLabel(targetAudience))}</span>
            <span class="promo-card-badge">${escapeHtml(services.includes('all') ? 'All services' : services.join(', '))}</span>
            ${p.active ? '' : '<span class="promo-card-badge promo-card-off">Inactive</span>'}
          </div>
          ${p.name ? `<p class="promo-card-desc"><strong>${escapeHtml(p.name)}</strong></p>` : ''}
          ${p.description ? `<p class="promo-card-desc">${escapeHtml(p.description)}</p>` : ''}
          <p class="promo-card-meta">${escapeHtml(limits.join(' · '))}</p>
        </div>
        <div class="promo-card-actions">
          <button type="button" class="button secondary" data-promo-edit>Edit</button>
          <button type="button" class="button secondary" data-promo-toggle>${p.active ? 'Disable' : 'Enable'}</button>
          <button type="button" class="button danger" data-promo-delete>Delete</button>
        </div>
      </div>`;
  }).join('');
}

function openPromoForm(promo) {
  if (!promoForm) return;
  promoForm.hidden = false;
  if (promoFormStatus) promoFormStatus.textContent = '';
  const g = (id) => document.querySelector(id);
  g('#promo-id').value = promo?.id || '';
  g('#promo-code').value = promo?.code || '';
  g('#promo-name').value = promo?.name || '';
  g('#promo-description').value = promo?.description || '';
  g('#promo-discount-type').value = promo?.discount_type || 'percent';
  g('#promo-discount-value').value = promo?.discount_value ?? '';
  g('#promo-applies-to').value = promo?.applies_to || 'service_fees';
  g('#promo-audience').value = promo?.target_audience || (promo?.audience === 'all' ? 'everyone' : promo?.audience) || 'everyone';
  const selectedServices = Array.isArray(promo?.eligible_services) && promo.eligible_services.length ? promo.eligible_services : ['all'];
  [...g('#promo-eligible-services').options].forEach((option) => { option.selected = selectedServices.includes(option.value); });
  g('#promo-inactive-days').value = promo?.inactive_days_threshold || '';
  g('#promo-specific-customer-id').value = promo?.specific_customer_id || '';
  g('#promo-specific-phone').value = promo?.specific_customer_phone || '';
  g('#promo-specific-email').value = promo?.specific_customer_email || '';
  g('#promo-min-order').value = promo?.min_order_amount || '';
  g('#promo-per-customer').value = promo?.per_customer_limit ?? 1;
  g('#promo-max-redemptions').value = promo?.max_redemptions ?? '';
  g('#promo-starts').value = promo?.starts_at ? String(promo.starts_at).slice(0, 10) : '';
  g('#promo-expires').value = promo?.expires_at ? String(promo.expires_at).slice(0, 10) : '';
  g('#promo-active').checked = promo ? !!promo.active : true;
  promoForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

promoNewBtn?.addEventListener('click', () => openPromoForm(null));
promoCancelBtn?.addEventListener('click', () => { if (promoForm) promoForm.hidden = true; });

promoForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const g = (id) => document.querySelector(id);
  const promo = {
    id: g('#promo-id').value || undefined,
    code: g('#promo-code').value,
    name: g('#promo-name').value,
    description: g('#promo-description').value,
    discount_type: g('#promo-discount-type').value,
    discount_value: g('#promo-discount-value').value,
    applies_to: g('#promo-applies-to').value,
    target_audience: g('#promo-audience').value,
    eligible_services: [...g('#promo-eligible-services').selectedOptions].map((option) => option.value),
    inactive_days_threshold: g('#promo-inactive-days').value,
    specific_customer_id: g('#promo-specific-customer-id').value,
    specific_customer_phone: g('#promo-specific-phone').value,
    specific_customer_email: g('#promo-specific-email').value,
    min_order_amount: g('#promo-min-order').value,
    per_customer_limit: g('#promo-per-customer').value,
    max_redemptions: g('#promo-max-redemptions').value,
    starts_at: g('#promo-starts').value || null,
    expires_at: g('#promo-expires').value || null,
    active: g('#promo-active').checked,
  };
  if (promoFormStatus) promoFormStatus.textContent = 'Saving…';
  try {
    await promoApi({ action: 'save', promo });
    if (promoFormStatus) promoFormStatus.textContent = '';
    promoForm.hidden = true;
    loadPromos();
  } catch (err) {
    if (promoFormStatus) promoFormStatus.textContent = err.message;
  }
});

promosList?.addEventListener('click', async (e) => {
  const card = e.target.closest('[data-promo-id]');
  if (!card) return;
  const id = card.dataset.promoId;
  const promo = (promosList._promos || []).find((p) => p.id === id);
  if (e.target.closest('[data-promo-edit]')) { openPromoForm(promo); return; }
  if (e.target.closest('[data-promo-toggle]')) {
    try { await promoApi({ action: 'toggle', id, active: !(promo && promo.active) }); loadPromos(); } catch (err) { alert(err.message); }
    return;
  }
  if (e.target.closest('[data-promo-delete]')) {
    if (!confirm(`Delete promo code ${promo?.code || ''}? This cannot be undone.`)) return;
    try { await promoApi({ action: 'delete', id }); loadPromos(); } catch (err) { alert(err.message); }
    return;
  }
});
