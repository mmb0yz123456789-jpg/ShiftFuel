const workerDb = window.ShiftFuelSupabase;
const workerProfileForm = document.querySelector('#worker-profile-form');
const workerProfileName = document.querySelector('#worker-profile-name');
const workerProfilePhone = document.querySelector('#worker-profile-phone');
const workerProfileLocation = document.querySelector('#worker-profile-location');
const workerProfileStarted = document.querySelector('#worker-profile-started');
const workerProfilePhoto = document.querySelector('#worker-profile-photo');
const workerProfileStatus = document.querySelector('#worker-profile-status');
const workerPasswordForm = document.querySelector('#worker-password-form');
const workerNewPassword = document.querySelector('#worker-new-password');
const workerConfirmPassword = document.querySelector('#worker-confirm-password');
const workerPasswordStatus = document.querySelector('#worker-password-status');
const workerProfilePhotoPreview = document.querySelector('#worker-profile-photo-preview');
const workerProfilePhotoPlaceholder = document.querySelector('#worker-profile-photo-placeholder');
const workerPortalHeading = document.querySelector('#worker-portal-heading');
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

const SESSION_WORKER_NAME = sessionStorage.getItem('shiftfuel_worker') || 'Mark Urban';
const SESSION_WORKER_ID = sessionStorage.getItem('shiftfuel_worker_id') || '';
const DEFAULT_WORK_LOCATION = 'ChristianaCare - 4755 Ogletown Stanton Rd, Newark, DE 19718';
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

const workerOpenStatuses = [
  'request_received',
  'accepted',
  'key_received',
  'vehicle_picked_up',
  'fueling_complete',
  'car_wash_complete',
  'fuel_receipt_uploaded',
  'wash_receipt_uploaded',
  'receipts_recorded',
  'returned_location_pending',
  'return_location_recorded',
  'return_photos_needed',
  'vehicle_returned',
  'inspection_needed',
  'inspection_recorded',
];

const workerStatusLabels = {
  request_received: 'Request received',
  accepted: 'Accepted',
  key_received: 'Key received',
  vehicle_picked_up: 'Vehicle picked up',
  fueling_complete: 'Fueling complete',
  fuel_receipt_uploaded: 'Fuel receipt uploaded',
  car_wash_complete: 'Car wash complete',
  wash_receipt_uploaded: 'Wash receipt uploaded',
  receipts_recorded: 'Receipts recorded',
  returned_location_pending: 'Returned',
  return_location_recorded: 'Return location recorded',
  return_photos_needed: 'Return photos needed',
  vehicle_returned: 'Vehicle returned',
  inspection_needed: 'Vehicle inspection needed',
  inspection_recorded: 'Inspection recorded',
  complete: 'Complete',
  unable_to_complete: 'Unable to complete',
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

function feeSummary(request) {
  return {
    fuel: serviceNeedsFuel(request) ? savedFeeOrDefault(request.fuel_convenience_fee, 15) : 0,
    wash: serviceNeedsWash(request) ? savedFeeOrDefault(request.wash_convenience_fee, 15) : 0,
    inspection: request.quick_inspection ? savedFeeOrDefault(request.quick_inspection_fee, 5) : 0,
  };
}

function finalTotalFromSavedReceipts(request, receiptTotals = receiptTotalsFromNotes(request)) {
  const fees = feeSummary(request);
  const fuelFee = serviceNeedsFuel(request) && receiptTotals.fuel > 0 ? fees.fuel : 0;
  const washFee = serviceNeedsWash(request) && receiptTotals.wash > 0 ? fees.wash : 0;
  return receiptTotals.fuel + receiptTotals.wash + fuelFee + washFee + fees.inspection;
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

function showWorkerPhoto(photoUrl) {
  if (workerProfilePhotoPreview && workerProfilePhotoPlaceholder) {
    workerProfilePhotoPreview.hidden = !photoUrl;
    workerProfilePhotoPlaceholder.hidden = Boolean(photoUrl);

    if (photoUrl) {
      workerProfilePhotoPreview.src = photoUrl;
    }
  }
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
      .from('employees')
      .select('id,employee_code,full_name,phone,photo_url,home_location,started_at')
      .eq('id', storedEmployeeId)
      .limit(1);

    if (storedError) {
      const fallback = await workerDb
        .from('employees')
        .select('id,full_name,phone,home_location')
        .eq('id', storedEmployeeId)
        .limit(1);

      stored = fallback.data;
      storedError = fallback.error;
    }

    if (!storedError && stored?.length) {
      return {
        photo_url: '',
        started_at: '',
        ...stored[0],
      };
    }
  }

  let { data, error } = await workerDb
    .from('employees')
    .select('id,employee_code,full_name,phone,photo_url,home_location,started_at')
    .eq('full_name', SESSION_WORKER_NAME)
    .limit(1);

  if (error) {
    const fallback = await workerDb
      .from('employees')
      .select('id,full_name,phone,home_location')
      .eq('full_name', SESSION_WORKER_NAME)
      .limit(1);

    data = fallback.data;
    error = fallback.error;
  }

  if (error) throw error;

  if (data?.length) {
    return {
      photo_url: '',
      started_at: '',
      ...data[0],
    };
  }

  let { data: inserted, error: insertError } = await workerDb
    .from('employees')
    .insert({
      employee_code: `EMP-${SESSION_WORKER_NAME.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'WORKER'}`,
      full_name: SESSION_WORKER_NAME,
      active: true,
      home_location: DEFAULT_WORK_LOCATION,
    })
    .select('id,employee_code,full_name,phone,photo_url,home_location,started_at')
    .single();

  if (insertError) {
    const fallback = await workerDb
      .from('employees')
      .insert({
        employee_code: `EMP-${SESSION_WORKER_NAME.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'WORKER'}`,
        full_name: SESSION_WORKER_NAME,
        active: true,
        home_location: DEFAULT_WORK_LOCATION,
      })
      .select('id,full_name,phone,home_location')
      .single();

    inserted = fallback.data;
    insertError = fallback.error;
  }

  if (insertError) throw insertError;
  return {
    photo_url: '',
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
          <button class="button worker-copy-day" type="button">Copy</button>
          <button class="button worker-paste-day" type="button" ${copiedWorkerDaySchedule ? '' : 'disabled'}>Paste</button>
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
        startsAt: row?.querySelector('.worker-day-start')?.value || '07:00',
        endsAt: row?.querySelector('.worker-day-end')?.value || '22:00',
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

async function loadWorkerSchedule() {
  if (!currentEmployee) return;

  const { data: availability, error: availabilityError } = await workerDb
    .from('employee_availability')
    .select('day_of_week,starts_at,ends_at,work_location')
    .eq('employee_id', currentEmployee.id);

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

    const location = rows.find((row) => row.work_location)?.work_location || currentEmployee.home_location || DEFAULT_WORK_LOCATION;
    if (workerLocation) workerLocation.value = location;
    if (workerProfileLocation) workerProfileLocation.value = location;
  }

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
    if (workerProfileName) workerProfileName.value = workerName;
    if (workerProfilePhone) workerProfilePhone.value = currentEmployee.phone || '';
    if (workerProfileLocation) workerProfileLocation.value = currentEmployee.home_location || DEFAULT_WORK_LOCATION;
    if (workerProfileStarted) workerProfileStarted.value = currentEmployee.started_at || '';
    if (workerLocation) workerLocation.value = currentEmployee.home_location || DEFAULT_WORK_LOCATION;

    showWorkerPhoto(currentEmployee.photo_url || '');
    setWorkerStatus('');
    await loadWorkerSchedule();
    await loadWorkerJobs();
    await loadWorkerReviews();
  } catch (error) {
    console.error('Could not load worker profile:', error);
    setWorkerStatus('Could not load worker profile. Run supabase-operational-upgrades.sql in Supabase.');
  }
}

async function uploadWorkerPhoto(file) {
  const safeName = file.name.replace(/[^a-z0-9.-]/gi, '-').toLowerCase();
  const path = `workers/${currentEmployee.id}/${Date.now()}-${safeName || 'profile.jpg'}`;

  const { error } = await workerDb.storage.from(PHOTO_BUCKET).upload(path, file, { upsert: false });
  if (error) throw error;

  const { data } = workerDb.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  return data?.publicUrl || path;
}

async function saveWorkerAvailability() {
  const workdays = selectedWorkdaysFromForm();
  if (!currentEmployee || !workdays.length) {
    setScheduleStatus('Choose at least one workday before saving.');
    return;
  }

  const workLocation = workerLocation?.value || DEFAULT_WORK_LOCATION;
  const { error: deleteError } = await workerDb
    .from('employee_availability')
    .delete()
    .eq('employee_id', currentEmployee.id);

  if (deleteError) throw deleteError;

  const { error: insertError } = await workerDb.from('employee_availability').insert(workdays.map((day) => ({
    employee_id: currentEmployee.id,
    day_of_week: day.dayOfWeek,
    starts_at: day.startsAt,
    ends_at: day.endsAt,
    work_location: workLocation,
  })));

  if (insertError) throw insertError;

  await workerDb
    .from('employees')
    .update({ home_location: workLocation, profile_updated_at: new Date().toISOString() })
    .eq('id', currentEmployee.id);

  currentEmployee.home_location = workLocation;
  if (workerProfileLocation) workerProfileLocation.value = workLocation;
  setScheduleStatus('Work days and shift times saved.');
}

async function saveWorkerDaysOff() {
  if (!currentEmployee) return;

  const { error: deleteError } = await workerDb
    .from('employee_days_off')
    .delete()
    .eq('employee_id', currentEmployee.id);

  if (deleteError) throw deleteError;

  const rows = Array.from(selectedWorkerDaysOff).sort().map((dayOff) => ({
    employee_id: currentEmployee.id,
    day_off: dayOff,
  }));

  if (rows.length) {
    const { error: insertError } = await workerDb.from('employee_days_off').insert(rows);
    if (insertError) throw insertError;
  }

  setScheduleStatus('Days off saved and marked unbookable.');
}

async function loadWorkerReviews() {
  if (!workerReviewList || !currentEmployee) return;

  workerReviewList.innerHTML = '<div class="empty-state"><p>Loading reviews...</p></div>';

  const { data: requests, error: requestError } = await workerDb
    .from('service_requests')
    .select('id,customer_name,vehicle_year,vehicle_make,vehicle_model')
    .eq('assigned_employee_id', currentEmployee.id);

  if (requestError) {
    console.warn('Could not load assigned requests:', requestError);
    workerReviewList.innerHTML = '<div class="empty-state"><p>Could not load assigned requests.</p></div>';
    return;
  }

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
}

function renderWorkerJobCard(request, mode) {
  const receiptTotals = receiptTotalsFromNotes(request);
  const workerReceiptTotal = receiptTotals.fuel + receiptTotals.wash;

  return `
    <article class="request-card worker-job-card">
      <div class="request-card-header">
        <div>
          <p class="eyebrow">${escapeHtml(formatWorkerJobTime(request))}</p>
          <h3>${escapeHtml(request.customer_name || 'Customer')}</h3>
        </div>
        <span class="status-pill">${escapeHtml(request.status || '')}</span>
      </div>
      <div class="request-details">
        <p><strong>Customer:</strong> ${escapeHtml(request.customer_name || 'Customer')} | ${escapeHtml(request.customer_phone || '')} | ${escapeHtml(request.customer_email || '')}</p>
        <p><strong>Vehicle:</strong> ${escapeHtml([request.vehicle_year, request.vehicle_make, request.vehicle_model].filter(Boolean).join(' ') || 'Not listed')}${request.vehicle_color ? `, ${escapeHtml(request.vehicle_color)}` : ''} ${request.license_plate ? `| Plate: ${escapeHtml(request.license_plate)}` : ''}</p>
        <p><strong>Service:</strong> ${escapeHtml(request.service_label || request.service_type || 'Service')} ${request.fuel_type ? `| Fuel: ${escapeHtml(request.fuel_type)}` : ''} ${request.wash_package_label ? `| Wash: ${escapeHtml(request.wash_package_label)}` : ''}</p>
        <p><strong>Pickup parking:</strong> ${escapeHtml(request.parking_location || '')}, spot ${escapeHtml(request.parking_spot || '')}</p>
        ${request.return_parking_location ? `<p><strong>Return parking:</strong> ${escapeHtml(request.return_parking_location)}, spot ${escapeHtml(request.return_parking_spot || '')}</p>` : ''}
        <p><strong>Service date/time:</strong> ${escapeHtml(request.service_date || '')} ${escapeHtml(request.desired_return_time || '')}</p>
        ${(receiptTotals.fuel || receiptTotals.wash) ? `<p><strong>Receipt totals entered:</strong> Fuel ${money(receiptTotals.fuel)} | Car wash ${money(receiptTotals.wash)} | Total ${money(workerReceiptTotal)}</p>` : ''}
      </div>
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

function workerBackButton(request) {
  const previousStatus = workerBackStatusFor(request);
  return previousStatus
    ? `<button class="button secondary worker-update-status" data-id="${escapeHtml(request.id)}" data-status="${escapeHtml(previousStatus)}" type="button">Back</button>`
    : '';
}

function workerStepInstruction(text) {
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

function renderWorkerJobActions(request) {
  const actions = [];
  let activePanel = '';

  if (request.status === 'request_received') {
    actions.push(workerPrimaryStatusButton(request, 'Accept', 'accepted'));
  } else if (request.status === 'accepted') {
    actions.push(workerPrimaryStatusButton(request, 'Key received', 'key_received'));
  } else if (request.status === 'key_received') {
    actions.push(workerStepInstruction('Upload the pickup photo set below.'));
    activePanel = renderWorkerPhotoPanel(request, 'pickup');
  } else if (request.status === 'vehicle_picked_up') {
    if (serviceNeedsFuel(request) && !serviceDoneOrUnable(request, 'fuel')) {
      actions.push(workerPrimaryStatusButton(request, `Fuel - ${request.fuel_type || 'fuel type not listed'}`, 'fueling_complete'));
      actions.push(workerServiceUnableButton(request, 'fuel'));
    }
    if (serviceNeedsWash(request) && !serviceDoneOrUnable(request, 'wash')) {
      actions.push(workerPrimaryStatusButton(request, `Car wash - ${request.wash_package_label || 'selected wash'}`, 'car_wash_complete'));
      actions.push(workerServiceUnableButton(request, 'wash'));
    }
  } else if (request.status === 'fueling_complete') {
    actions.push(workerStepInstruction(`Upload the fuel receipt and enter the total for ${request.fuel_type || 'the selected fuel type'}.`));
    activePanel = renderWorkerReceiptPanel(request, 'fuel');
    actions.push(workerServiceUnableButton(request, 'fuel'));
  } else if (request.status === 'car_wash_complete') {
    actions.push(workerStepInstruction(`Upload the car wash receipt and enter the total for ${request.wash_package_label || 'the selected wash'}.`));
    activePanel = renderWorkerReceiptPanel(request, 'wash');
    actions.push(workerServiceUnableButton(request, 'wash'));
  } else if (request.status === 'fuel_receipt_uploaded' && serviceNeedsWash(request) && !serviceDoneOrUnable(request, 'wash')) {
    actions.push(workerPrimaryStatusButton(request, `Car wash - ${request.wash_package_label || 'selected wash'}`, 'car_wash_complete'));
    actions.push(workerServiceUnableButton(request, 'wash'));
  } else if (request.status === 'wash_receipt_uploaded' && serviceNeedsFuel(request) && !serviceDoneOrUnable(request, 'fuel')) {
    actions.push(workerPrimaryStatusButton(request, `Fuel - ${request.fuel_type || 'fuel type not listed'}`, 'fueling_complete'));
    actions.push(workerServiceUnableButton(request, 'fuel'));
  } else if (request.status === 'receipts_recorded') {
    actions.push(workerPrimaryStatusButton(request, 'Returned', 'returned_location_pending'));
  } else if (request.status === 'returned_location_pending') {
    actions.push(workerStepInstruction('Record where the vehicle was returned before return photos.'));
    activePanel = renderWorkerReturnLocationPanel(request);
  } else if (request.status === 'return_location_recorded') {
    actions.push(workerPrimaryStatusButton(request, 'Return photos', 'return_photos_needed'));
  } else if (request.status === 'return_photos_needed') {
    actions.push(workerStepInstruction('Upload the return photo set below.'));
    activePanel = renderWorkerPhotoPanel(request, 'dropoff');
  } else if (request.status === 'vehicle_returned') {
    if (request.quick_inspection) {
      actions.push(workerPrimaryStatusButton(request, 'Vehicle inspection', 'inspection_needed'));
    } else {
      actions.push(workerStepInstruction('Confirm the saved totals before completing.'));
      activePanel = renderWorkerCompletePanel(request);
    }
  } else if (request.status === 'inspection_needed') {
    actions.push(workerStepInstruction('Complete the vehicle inspection below.'));
    activePanel = renderWorkerInspectionPanel(request);
  } else if (request.status === 'inspection_recorded') {
    actions.push(workerStepInstruction('Confirm the saved totals before completing.'));
    activePanel = renderWorkerCompletePanel(request);
  }

  const back = workerBackButton(request);
  if (back) actions.push(back);

  return `
    <div class="guided-step">
      <p class="eyebrow">Next step</p>
      <h4>${escapeHtml(workerStatusLabels[request.status] || request.status)}</h4>
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

function renderWorkerServiceUnablePanel(request) {
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

function renderWorkerPhotoPanel(request, stage = 'pickup') {
  const isDropoff = stage === 'dropoff';
  const heading = isDropoff ? 'Upload return photos' : 'Upload pickup photos';
  const help = isDropoff
    ? 'Upload all four sides after return plus the return odometer and ending fuel gauge. Do not reuse pickup photos.'
    : 'Upload all four sides at pickup plus the pickup odometer before moving the vehicle.';
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
        ${isDropoff ? filePicker('Ending fuel gauge photo', 'photo-file required-photo', 'data-photo-type="dropoff_fuel_gauge"') : ''}
      </div>
      <p class="field-help duplicate-photo-warning" data-warning-for="${escapeHtml(request.id)}"></p>
      <button class="button primary upload-action-button upload-photo-set" data-id="${escapeHtml(request.id)}" type="button">Upload photo set</button>
    </div>
  `;
}

function renderWorkerReceiptPanel(request, mode = 'all') {
  const isFuelMode = mode === 'fuel';
  const isWashMode = mode === 'wash';
  const receiptTotals = receiptTotalsFromNotes(request);
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
  const returnParkingLocation = request.return_parking_location || request.parking_location || '';
  const returnParkingSpot = request.return_parking_spot || request.parking_spot || '';
  const returnParkingMapUrl = request.return_parking_map_url || request.parking_map_url || '';

  return `
    <div class="return-location-panel" data-return-for="${escapeHtml(request.id)}">
      <h4>Record return/drop-off location</h4>
      <p class="field-help">These fields start with the pickup location. Change them only if the vehicle was returned somewhere different.</p>
      <div class="field-grid">
        <label>Return parking lot / garage
          <input class="return-parking-location" type="text" value="${escapeHtml(returnParkingLocation)}" placeholder="Garage B, Level 3">
        </label>
        <label>Return parking spot
          <input class="return-parking-spot" type="text" value="${escapeHtml(returnParkingSpot)}" placeholder="B3-142">
        </label>
        <label>Return Google Maps link
          <input class="return-parking-map-url" type="url" value="${escapeHtml(returnParkingMapUrl)}" placeholder="Paste map link">
        </label>
      </div>
      <button class="button primary save-return-location" data-id="${escapeHtml(request.id)}" type="button">Save return location</button>
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
        <label>Trouble code
          <input class="inspection-trouble-code" type="text" placeholder="P0304">
        </label>
      </div>
      <div class="trouble-code-output" aria-live="polite">
        <p class="field-help">Type a code to preview what the customer will see.</p>
      </div>
      <button class="button primary save-inspection" data-id="${escapeHtml(request.id)}" type="button">Save inspection details</button>
    </div>
  `;
}

function renderWorkerCompletePanel(request) {
  const receiptTotals = receiptTotalsFromNotes(request);
  const workerReceiptTotal = receiptTotals.fuel + receiptTotals.wash;

  return `
    <div class="complete-panel" data-complete-for="${escapeHtml(request.id)}">
      <h4>Confirm before completing</h4>
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
        <button class="button primary complete-request" data-id="${escapeHtml(request.id)}" type="button">Complete request</button>
        ${serviceNeedsFuel(request) ? `<button class="button secondary show-total-edit" data-id="${escapeHtml(request.id)}" data-edit-total="fuel" type="button">Fuel Incorrect</button>` : ''}
        ${serviceNeedsWash(request) ? `<button class="button secondary show-total-edit" data-id="${escapeHtml(request.id)}" data-edit-total="wash" type="button">Car Wash Incorrect</button>` : ''}
      </div>
      <div class="total-edit-panel" data-total-edit-for="${escapeHtml(request.id)}" hidden></div>
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

async function loadWorkerJobs() {
  if (!workerJobList || !currentEmployee) return;

  workerJobList.innerHTML = '<div class="empty-state"><p>Loading jobs...</p></div>';

  const { data, error } = await workerDb
    .from('service_requests')
    .select('id,customer_name,customer_phone,customer_email,vehicle_year,vehicle_make,vehicle_model,vehicle_color,license_plate,service_type,service_label,hospital,parking_location,parking_spot,service_date,desired_return_time,status,assigned_employee_id,fuel_type,wash_package_label,quick_inspection,fuel_convenience_fee,wash_convenience_fee,quick_inspection_fee,final_total,notes,return_parking_location,return_parking_spot,return_parking_map_url')
    .in('status', workerOpenStatuses)
    .order('service_date', { ascending: true });

  if (error) {
    console.warn('Could not load worker jobs:', error);
    workerJobList.innerHTML = '<div class="empty-state"><p>Could not load jobs.</p></div>';
    return;
  }

  const jobs = data || [];
  allWorkerJobs = jobs;
  const myJobs = jobs.filter((job) => job.assigned_employee_id === currentEmployee.id);
  const workerZone = currentEmployee.home_location || DEFAULT_WORK_LOCATION;
  const availableJobs = jobs.filter((job) => {
    return !job.assigned_employee_id
      && ['request_received', 'accepted'].includes(job.status)
      && (!job.hospital || !workerZone || job.hospital === workerZone);
  });

  if (!myJobs.length && !availableJobs.length) {
    workerJobList.innerHTML = '<div class="empty-state"><p>No jobs available right now.</p></div>';
    return;
  }

  workerJobList.innerHTML = `
    ${myJobs.length ? '<h3>Assigned to me</h3>' : ''}
    ${myJobs.map((job) => renderWorkerJobCard(job, 'mine')).join('')}
    ${availableJobs.length ? '<h3>Available to claim</h3>' : ''}
    ${availableJobs.map((job) => renderWorkerJobCard(job, 'available')).join('')}
  `;
}

async function claimWorkerJob(requestId) {
  if (!currentEmployee) return;
  const request = allWorkerJobs.find((item) => item.id === requestId);

  const { error } = await workerDb
    .from('service_requests')
    .update({
      assigned_employee_id: currentEmployee.id,
      assigned_worker_name: currentEmployee.full_name,
      assigned_worker_phone: currentEmployee.phone || null,
      assigned_worker_photo_url: currentEmployee.photo_url || null,
      status: request?.status === 'request_received' ? 'accepted' : request?.status || 'accepted',
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .is('assigned_employee_id', null);

  if (error) throw error;

  await loadWorkerJobs();
  await loadWorkerReviews();
}

async function updateWorkerJobStatus(id, status) {
  const { error } = await workerDb
    .from('service_requests')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('assigned_employee_id', currentEmployee.id);

  if (error) throw error;
  await loadWorkerJobs();
}

async function saveWorkerServiceUnable(button) {
  const id = button.dataset.id;
  const panel = button.closest('.service-unable-panel');
  const request = allWorkerJobs.find((item) => item.id === id);
  const type = panel?.dataset.serviceType;
  const reason = panel?.querySelector('.service-unable-reason')?.value.trim();

  if (!request || !type) return;

  if (!reason) {
    alert('Add a reason before saving.');
    return;
  }

  const label = type === 'fuel' ? 'Fuel' : 'Car wash';
  const timestamp = new Date().toISOString();
  const nextStatus = nextStatusAfterServiceUnable(request, type);
  const receiptTotals = receiptTotalsFromNotes(request);
  const finalTotal = finalTotalFromSavedReceipts(request, receiptTotals);
  const note = `[service_unable ${type}] ${label} could not be completed: ${reason}`;
  const notes = request.notes ? `${request.notes}\n${note}` : note;

  button.disabled = true;
  button.textContent = 'Saving...';

  const { error } = await workerDb
    .from('service_requests')
    .update({
      status: nextStatus,
      final_total: finalTotal,
      notes,
      updated_at: timestamp,
    })
    .eq('id', id)
    .eq('assigned_employee_id', currentEmployee.id);

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
  const { error } = await workerDb
    .from('service_requests')
    .update({ status: panel.dataset.nextStatus, notes, updated_at: timestamp })
    .eq('id', id)
    .eq('assigned_employee_id', currentEmployee.id);

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
  const fees = feeSummary(request);
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
    await uploadWorkerJobPhotoFile(id, 'fuel_receipt', fuelReceiptFile);
  }

  if (washReceiptFile) {
    await uploadWorkerJobPhotoFile(id, 'wash_receipt', washReceiptFile);
  }

  const updates = { final_total: finalTotal, notes, updated_at: new Date().toISOString() };
  if (button.dataset.nextStatus) {
    updates.status = button.dataset.nextStatus;
  }

  const { error } = await workerDb
    .from('service_requests')
    .update(updates)
    .eq('id', id)
    .eq('assigned_employee_id', currentEmployee.id);

  if (error) throw error;
  await loadWorkerJobs();
}

async function saveWorkerReturnLocation(button) {
  const id = button.dataset.id;
  const panel = button.closest('.return-location-panel');
  const returnParkingLocation = panel.querySelector('.return-parking-location').value.trim();
  const returnParkingSpot = panel.querySelector('.return-parking-spot').value.trim();
  const returnParkingMapUrl = panel.querySelector('.return-parking-map-url').value.trim();

  if (!returnParkingLocation || !returnParkingSpot) {
    alert('Add the return parking lot/garage and spot before saving.');
    return;
  }

  const { error } = await workerDb
    .from('service_requests')
    .update({
      return_parking_location: returnParkingLocation,
      return_parking_spot: returnParkingSpot,
      return_parking_map_url: returnParkingMapUrl || null,
      status: 'return_location_recorded',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('assigned_employee_id', currentEmployee.id);

  if (error) throw error;
  await loadWorkerJobs();
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

  const { error } = await workerDb
    .from('service_requests')
    .update({ notes, status: 'inspection_recorded', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('assigned_employee_id', currentEmployee.id);

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
  const fees = feeSummary(request);
  const finalTotal = finalTotalFromSavedReceipts(request, newReceiptTotals);
  const note = `Corrected ${type === 'fuel' ? 'fuel' : 'car wash'} total: ${money(value)}. [receipt_totals fuel=${newReceiptTotals.fuel.toFixed(2)} wash=${newReceiptTotals.wash.toFixed(2)}] Fees: fuel convenience ${money(fees.fuel)}, wash convenience ${money(fees.wash)}, inspection ${money(fees.inspection)}. Final total ${money(finalTotal)}.`;
  const notes = request.notes ? `${request.notes}\n${note}` : note;

  const { error } = await workerDb
    .from('service_requests')
    .update({ final_total: finalTotal, notes, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('assigned_employee_id', currentEmployee.id);

  if (error) throw error;
  await loadWorkerJobs();
}

async function completeWorkerRequest(button) {
  const id = button.dataset.id;
  const request = allWorkerJobs.find((item) => item.id === id);
  const panel = button.closest('.complete-panel');
  const confirmed = panel.querySelector('.confirm-complete-totals')?.checked;

  if (!request) return;

  if (request.final_total == null) {
    alert('Save the receipt total before completing this request.');
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

  await updateWorkerJobStatus(id, 'complete');
  await loadWorkerReviews();
}

workerProfilePhoto?.addEventListener('change', () => {
  const file = workerProfilePhoto.files?.[0];
  showWorkerPhoto(file ? URL.createObjectURL(file) : currentEmployee?.photo_url || '');
});

workerJobList?.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;

  try {
    if (button.classList.contains('claim-worker-job')) {
      button.disabled = true;
      button.textContent = 'Claiming...';
      await claimWorkerJob(button.dataset.id);
      return;
    }

    if (button.classList.contains('worker-update-status')) {
      button.disabled = true;
      await updateWorkerJobStatus(button.dataset.id, button.dataset.status);
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
        panel.querySelector('.service-unable-reason').value = '';
      }
      return;
    }

    if (button.classList.contains('save-service-unable')) {
      await saveWorkerServiceUnable(button);
      return;
    }

    if (button.classList.contains('complete-request')) {
      await completeWorkerRequest(button);
    }
  } catch (error) {
    console.error('Worker job action failed:', error);
    alert('Something went wrong. Check the console for details.');
    button.disabled = false;
  }
});

workerJobList?.addEventListener('change', (event) => {
  if (event.target.matches('input[type="file"]')) {
    const control = event.target.closest('.file-button-control');
    const label = control?.querySelector('.selected-file-name');
    if (label) {
      label.textContent = event.target.files?.[0]?.name || 'No file chosen';
    }
  }
});

workerJobList?.addEventListener('input', (event) => {
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
    const photoUrl = file ? await uploadWorkerPhoto(file) : currentEmployee.photo_url || null;
    const fullName = workerProfileName?.value.trim() || currentEmployee.full_name;
    const phone = workerProfilePhone?.value.trim() || null;
    const homeLocation = workerProfileLocation?.value || currentEmployee.home_location || DEFAULT_WORK_LOCATION;

    const { data, error } = await workerDb
      .from('employees')
      .update({
        full_name: fullName,
        phone,
        home_location: homeLocation,
        photo_url: photoUrl,
        profile_updated_at: new Date().toISOString(),
      })
      .eq('id', currentEmployee.id)
      .select('id,employee_code,full_name,phone,photo_url,home_location,started_at')
      .single();

    if (error) throw error;

    await workerDb
      .from('service_requests')
      .update({
        assigned_worker_name: data.full_name,
        assigned_worker_phone: data.phone || null,
        assigned_worker_photo_url: data.photo_url || null,
        updated_at: new Date().toISOString(),
      })
      .eq('assigned_employee_id', currentEmployee.id);

    currentEmployee = data;
    sessionStorage.setItem('shiftfuel_worker', currentEmployee.full_name);
    if (workerPortalHeading) workerPortalHeading.textContent = currentEmployee.full_name;
    workerProfileForm.reset();
    if (workerProfileName) workerProfileName.value = currentEmployee.full_name;
    if (workerProfilePhone) workerProfilePhone.value = currentEmployee.phone || '';
    if (workerProfileLocation) workerProfileLocation.value = currentEmployee.home_location || DEFAULT_WORK_LOCATION;
    if (workerProfileStarted) workerProfileStarted.value = currentEmployee.started_at || '';
    if (workerLocation) workerLocation.value = currentEmployee.home_location || DEFAULT_WORK_LOCATION;
    showWorkerPhoto(currentEmployee.photo_url || '');
    setWorkerStatus('Worker profile saved.');
  } catch (error) {
    console.error('Worker profile save failed:', error);
    setWorkerStatus(`Could not save worker profile: ${error.message || 'Make sure employee profile columns and storage are set up.'}`);
  }
});

workerPasswordForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!currentEmployee) {
    setWorkerPasswordStatus('Worker profile is still loading.');
    return;
  }

  const password = workerNewPassword?.value || '';
  const confirmation = workerConfirmPassword?.value || '';

  if (password.length < 8) {
    setWorkerPasswordStatus('Use at least 8 characters.');
    return;
  }

  if (password !== confirmation) {
    setWorkerPasswordStatus('Passwords do not match.');
    return;
  }

  setWorkerPasswordStatus('Updating password...');

  try {
    const { error } = await workerDb
      .from('employees')
      .update(await passwordFields(password))
      .eq('id', currentEmployee.id);

    if (error) throw error;

    workerPasswordForm.reset();
    setWorkerPasswordStatus('Password updated.');
  } catch (error) {
    console.error('Worker password update failed:', error);
    setWorkerPasswordStatus('Could not update password. Ask admin to reset it.');
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
      startsAt: startInput?.value || '07:00',
      endsAt: endInput?.value || '22:00',
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
loadVehiclePsiGuides().finally(loadWorkerProfile);
