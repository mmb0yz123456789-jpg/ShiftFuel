const db = window.ShiftFuelSupabase;
const requestList = document.querySelector('#request-list');
const totalRequests = document.querySelector('#total-requests');
const openRequests = document.querySelector('#open-requests');
const completeRequests = document.querySelector('#complete-requests');
const deniedRequests = document.querySelector('#denied-requests');
const showOpen = document.querySelector('#show-open');
const showComplete = document.querySelector('#show-complete');
const showDenied = document.querySelector('#show-denied');
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
const workerProfileSelect = document.querySelector('#worker-profile-select');

const PHOTO_BUCKET = 'service-photos';
const DEFAULT_WORKER_NAME = 'Mark Urban';
const DEFAULT_WORK_LOCATION = 'ChristianaCare - 4755 Ogletown Stanton Rd, Newark, DE 19718';
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
let selectedScheduleEmployeeId = '';
let currentView = 'open';

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

function requestCardDetails(request) {
  const fees = feeSummary(request);
  const receiptTotals = receiptTotalsFromNotes(request);

  return `
    <div class="request-details">
      <p><strong>Customer:</strong> ${escapeHtml(request.customer_name)} | ${escapeHtml(request.customer_phone)} | ${escapeHtml(request.customer_email || '')}</p>
      <p><strong>Vehicle:</strong> ${escapeHtml(request.vehicle_year)} ${escapeHtml(request.vehicle_make)} ${escapeHtml(request.vehicle_model)}, ${escapeHtml(request.vehicle_color)} | Plate: ${escapeHtml(request.license_plate)}</p>
      <p><strong>Service:</strong> ${escapeHtml(request.service_label || request.service_type)} ${request.wash_package_label ? `| Wash: ${escapeHtml(request.wash_package_label)}` : ''} ${request.fuel_type ? `| Fuel: ${escapeHtml(request.fuel_type)}` : ''}</p>
      <p><strong>Pickup parking:</strong> ${escapeHtml(request.parking_location)}, spot ${escapeHtml(request.parking_spot)}</p>
      ${request.return_parking_location ? `<p><strong>Return parking:</strong> ${escapeHtml(request.return_parking_location)}, spot ${escapeHtml(request.return_parking_spot)}</p>` : ''}
      <p><strong>Service date/time:</strong> ${escapeHtml(request.service_date || '')} ${escapeHtml(request.desired_return_time || '')}</p>
      <p><strong>Estimated total:</strong> ${money(request.estimated_total)} | <strong>Final total:</strong> ${request.final_total == null ? 'Not recorded' : money(request.final_total)}</p>
      ${request.cancellation_reason ? `<p><strong>Reason:</strong> ${escapeHtml(request.cancellation_reason)}</p>` : ''}
      ${(receiptTotals.fuel || receiptTotals.wash) ? `<p><strong>Receipt totals:</strong> Fuel ${money(receiptTotals.fuel)} | Car wash ${money(receiptTotals.wash)}</p>` : ''}
      <p><strong>Fees used:</strong> Fuel convenience ${money(fees.fuel)} | Wash convenience ${money(fees.wash)} | Inspection ${money(fees.inspection)}</p>
      ${request.notes ? `<p><strong>Notes:</strong> ${escapeHtml(request.notes)}</p>` : ''}
    </div>
  `;
}

function renderWorkerAssignment(request) {
  if (request.status === 'request_received' || !isOpen(request)) {
    return '';
  }

  const assignedName = request.assigned_worker_name || '';
  const assignedPhone = request.assigned_worker_phone || '';
  const assignedPhoto = request.assigned_worker_photo_url || '';
  const selectedId = request.assigned_employee_id || '';

  return `
    <section class="worker-assignment-panel">
      <div>
        <p class="eyebrow">Assigned worker</p>
        <h4>${assignedName ? escapeHtml(assignedName) : 'Choose who is working on this car'}</h4>
        ${assignedPhone ? `<p class="field-help">Customer contact: ${escapeHtml(assignedPhone)}</p>` : '<p class="field-help">Assign a worker after accepting the request.</p>'}
      </div>
      ${assignedPhoto ? `<img class="worker-avatar" src="${escapeHtml(assignedPhoto)}" alt="${escapeHtml(assignedName)}">` : '<div class="worker-avatar worker-avatar-placeholder">No photo</div>'}
      <label class="worker-select-label">
        Worker
        <select class="assign-worker-select" data-id="${escapeHtml(request.id)}">
          <option value="">Select worker</option>
          ${allEmployees.map((employee) => `
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
    return `
      <div class="admin-button-row">
        <button class="button secondary edit-request" data-id="${request.id}" type="button">Edit / reopen</button>
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

  return `
    <div class="inspection-panel" data-inspection-for="${request.id}">
      <h4>Quick inspection details</h4>
      <p class="field-help">Record tire pressure before and after service. Trouble-code explanations are starter guidance and should be confirmed against the vehicle's year, make, model, and engine.</p>
      <div class="admin-money-grid">
        <label>Driver front PSI before
          <input class="inspection-df-before" type="number" min="0" step="1">
        </label>
        <label>Driver front PSI after
          <input class="inspection-df-after" type="number" min="0" step="1">
        </label>
        <label>Driver rear PSI before
          <input class="inspection-dr-before" type="number" min="0" step="1">
        </label>
        <label>Driver rear PSI after
          <input class="inspection-dr-after" type="number" min="0" step="1">
        </label>
        <label>Passenger front PSI before
          <input class="inspection-pf-before" type="number" min="0" step="1">
        </label>
        <label>Passenger front PSI after
          <input class="inspection-pf-after" type="number" min="0" step="1">
        </label>
        <label>Passenger rear PSI before
          <input class="inspection-pr-before" type="number" min="0" step="1">
        </label>
        <label>Passenger rear PSI after
          <input class="inspection-pr-after" type="number" min="0" step="1">
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
  const returnParkingLocation = request.return_parking_location || request.parking_location || '';
  const returnParkingSpot = request.return_parking_spot || request.parking_spot || '';
  const returnParkingMapUrl = request.return_parking_map_url || request.parking_map_url || '';

  return `
    <div class="return-location-panel" data-return-for="${request.id}">
      <h4>Record return/drop-off location before drop-off photos</h4>
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
  return `
    <div class="admin-edit-panel" data-edit-for="${request.id}" hidden>
      <h4>Edit request</h4>
      <div class="field-grid">
        <label>Pickup parking lot / garage
          <input class="edit-parking-location" type="text" value="${escapeHtml(request.parking_location || '')}">
        </label>
        <label>Pickup parking spot
          <input class="edit-parking-spot" type="text" value="${escapeHtml(request.parking_spot || '')}">
        </label>
        <label>Service date
          <input class="edit-service-date" type="date" value="${escapeHtml(request.service_date || '')}">
        </label>
        <label>Desired return time
          <input class="edit-return-time" type="time" value="${escapeHtml(String(request.desired_return_time || '').slice(0,5))}">
        </label>
      </div>
      <label>Admin notes
        <textarea class="edit-notes" rows="3">${escapeHtml(request.notes || '')}</textarea>
      </label>
      <div class="admin-button-row">
        <button class="button primary save-edit" data-id="${request.id}" type="button">Save changes</button>
        ${!isOpen(request) ? `<button class="button secondary update-status" data-id="${request.id}" data-status="accepted" type="button">Reopen as accepted</button>` : ''}
      </div>
    </div>
  `;
}

function renderRequests() {
  const filtered = allRequests.filter((request) => {
    if (currentView === 'open') return isOpen(request);
    if (currentView === 'complete') return request.status === 'complete';
    if (currentView === 'closed') return closedStatuses.includes(request.status);
    return true;
  });

  const openCount = allRequests.filter(isOpen).length;
  const completeCount = allRequests.filter((request) => request.status === 'complete').length;
  const closedCount = allRequests.filter((request) => closedStatuses.includes(request.status)).length;

  totalRequests.textContent = openCount + completeCount;
  openRequests.textContent = openCount;
  completeRequests.textContent = completeCount;
  deniedRequests.textContent = closedCount;

  [showOpen, showComplete, showDenied].forEach((button) => button?.classList.remove('active'));
  if (currentView === 'open') showOpen?.classList.add('active');
  if (currentView === 'complete') showComplete?.classList.add('active');
  if (currentView === 'closed') showDenied?.classList.add('active');

  if (filtered.length === 0) {
    requestList.innerHTML = '<div class="empty-state"><p>No requests in this view.</p></div>';
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
    .select('id')
    .eq('full_name', fullName)
    .limit(1);

  if (error) throw error;

  if (data?.length) {
    return;
  }

  const { error: insertError } = await db
    .from('employees')
    .insert({
      employee_code: employeeCode,
      full_name: fullName,
      active: true,
      home_location: DEFAULT_WORK_LOCATION,
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
      .select('id,employee_code,full_name,phone,email,photo_url,home_location,started_at,active')
      .eq('active', true)
      .order('full_name', { ascending: true });

    if (error) {
      console.warn('Full employee profile load failed, trying basic employee fields:', error);
      const fallback = await db
        .from('employees')
        .select('id,employee_code,full_name,phone,email,home_location,active')
        .eq('active', true)
        .order('full_name', { ascending: true });

      data = fallback.data;
      error = fallback.error;
    }

    if (error) throw error;

    allEmployees = (data || []).map(normalizeEmployee);
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
    workerProfileList.innerHTML = '<div class="empty-state"><p>Select a worker to edit their profile.</p></div>';
    return;
  }

  workerProfileList.innerHTML = `
    <article class="request-card worker-profile-card ${employee.id === selectedScheduleEmployeeId ? 'active-worker-profile' : ''}" data-worker-id="${escapeHtml(employee.id)}">
      <div class="request-card-header">
        <div>
          <p class="eyebrow">Worker profile</p>
          <h3>${escapeHtml(employee.full_name)}</h3>
        </div>
        ${employee.photo_url ? `<img class="worker-avatar" src="${escapeHtml(employee.photo_url)}" alt="${escapeHtml(employee.full_name)}">` : '<div class="worker-avatar worker-avatar-placeholder">No photo</div>'}
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
        <label>Work location
          <select class="admin-worker-location">
            <option value="">Select workplace</option>
            <option ${employee.home_location === DEFAULT_WORK_LOCATION ? 'selected' : ''}>${escapeHtml(DEFAULT_WORK_LOCATION)}</option>
          </select>
        </label>
        <label>Started
          <input class="admin-worker-started" type="date" value="${escapeHtml(employee.started_at || '')}">
        </label>
        <label>Profile photo
          <input class="admin-worker-photo" type="file" accept="image/*">
        </label>
        <label>New portal password
          <input class="admin-worker-password" type="text" placeholder="Leave blank unless resetting">
        </label>
      </div>
      <div class="admin-button-row">
        <button class="button primary save-worker-profile" data-id="${escapeHtml(employee.id)}" type="button" ${String(employee.id).startsWith('local-') ? 'disabled' : ''}>Save worker profile</button>
        <button class="button secondary reset-worker-password" data-id="${escapeHtml(employee.id)}" type="button" ${String(employee.id).startsWith('local-') ? 'disabled' : ''}>Reset password</button>
        <button class="button danger delete-worker-profile" data-id="${escapeHtml(employee.id)}" type="button" ${String(employee.id).startsWith('local-') ? 'disabled' : ''}>Delete worker</button>
      </div>
      <p class="field-help admin-worker-status">${String(employee.id).startsWith('local-') ? 'Run the Supabase worker upgrade before saving this worker.' : ''}</p>
    </article>
  `;
}

function renderWorkerSelect() {
  const existingSelection = selectedScheduleEmployeeId || workerSelect.value;
  const options = `
    <option value="">Select worker</option>
    ${allEmployees.map((employee) => `
      <option value="${escapeHtml(employee.id)}" ${employee.id === existingSelection ? 'selected' : ''}>${escapeHtml(employee.full_name)} (${escapeHtml(employee.employee_code)})</option>
    `).join('')}
  `;

  if (workerSelect) workerSelect.innerHTML = options;
  if (workerProfileSelect) workerProfileSelect.innerHTML = options;

  if (existingSelection && allEmployees.some((employee) => employee.id === existingSelection)) {
    selectedScheduleEmployeeId = existingSelection;
  } else {
    selectedScheduleEmployeeId = '';
  }

  if (workerSelect) workerSelect.value = selectedScheduleEmployeeId || '';
  if (workerProfileSelect) workerProfileSelect.value = selectedScheduleEmployeeId || '';
}

function syncSelectedWorker(employeeId) {
  if (!employeeId || !allEmployees.some((employee) => employee.id === employeeId)) {
    return false;
  }

  selectedScheduleEmployeeId = employeeId;
  if (workerSelect) workerSelect.value = employeeId;
  if (workerProfileSelect) workerProfileSelect.value = employeeId;
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

async function uploadAdminWorkerPhoto(employeeId, file) {
  const safeName = file.name.replace(/[^a-z0-9.-]/gi, '-').toLowerCase();
  const path = `workers/${employeeId}/${Date.now()}-${safeName || 'profile.jpg'}`;

  const { error } = await db.storage.from(PHOTO_BUCKET).upload(path, file, { upsert: false });
  if (error) throw error;

  const { data } = db.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  return data?.publicUrl || path;
}

async function mergeEmployeeByPhoneIfNeeded(employeeId, phone) {
  if (!phone) return employeeId;

  const { data, error } = await db
    .from('employees')
    .select('id,employee_code,full_name,phone,email,photo_url,home_location,started_at,active')
    .eq('phone', phone)
    .neq('id', employeeId)
    .limit(1);

  if (error) throw error;

  const existing = data?.[0];
  if (!existing) return employeeId;

  const confirmed = window.confirm(`That phone number already belongs to ${existing.full_name} (${existing.employee_code}). Move this worker profile into that existing employee ID?`);
  if (!confirmed) {
    throw new Error('Phone number already belongs to another worker.');
  }

  await db
    .from('service_requests')
    .update({
      assigned_employee_id: existing.id,
      assigned_worker_name: existing.full_name,
      assigned_worker_phone: existing.phone || null,
      assigned_worker_photo_url: existing.photo_url || null,
      updated_at: new Date().toISOString(),
    })
    .eq('assigned_employee_id', employeeId);

  await db
    .from('employees')
    .update({ active: false, profile_updated_at: new Date().toISOString() })
    .eq('id', employeeId);

  return existing.id;
}

async function saveAdminWorkerProfile(button) {
  const card = button.closest('.worker-profile-card');
  const employeeId = button.dataset.id;
  const existingEmployee = allEmployees.find((employee) => employee.id === employeeId);
  const status = card?.querySelector('.admin-worker-status');
  const file = card?.querySelector('.admin-worker-photo')?.files?.[0];

  if (status) status.textContent = 'Saving worker profile...';

  const photoUrl = file ? await uploadAdminWorkerPhoto(employeeId, file) : existingEmployee?.photo_url || null;
  const phone = card?.querySelector('.admin-worker-phone')?.value.trim() || null;
  const targetEmployeeId = await mergeEmployeeByPhoneIfNeeded(employeeId, phone);

  if (targetEmployeeId !== employeeId) {
    selectedScheduleEmployeeId = targetEmployeeId;
    await loadEmployees();
    await loadRequests();
    if (status) status.textContent = 'Worker merged into existing employee ID.';
    return;
  }

  const updates = {
    full_name: card?.querySelector('.admin-worker-name')?.value.trim() || existingEmployee?.full_name || DEFAULT_WORKER_NAME,
    phone,
    home_location: card?.querySelector('.admin-worker-location')?.value || existingEmployee?.home_location || DEFAULT_WORK_LOCATION,
    started_at: card?.querySelector('.admin-worker-started')?.value || null,
    photo_url: photoUrl,
    profile_updated_at: new Date().toISOString(),
  };
  const password = card?.querySelector('.admin-worker-password')?.value.trim();

  if (password) {
    Object.assign(updates, await passwordFields(password));
  }

  const { data, error } = await db
    .from('employees')
    .update(updates)
    .eq('id', employeeId)
    .select('id,employee_code,full_name,phone,email,photo_url,home_location,started_at,active')
    .single();

  if (error) throw error;

  await db
    .from('service_requests')
    .update({
      assigned_worker_name: data.full_name,
      assigned_worker_phone: data.phone || null,
      assigned_worker_photo_url: data.photo_url || null,
      updated_at: new Date().toISOString(),
    })
    .eq('assigned_employee_id', employeeId);

  allEmployees = allEmployees.map((employee) => employee.id === employeeId ? data : employee);
  selectedScheduleEmployeeId = employeeId;
  if (workerLocation && employeeId === selectedScheduleEmployeeId) {
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

  const { error } = await db
    .from('employees')
    .update(await passwordFields(password))
    .eq('id', employeeId);

  if (error) throw error;

  if (passwordInput) passwordInput.value = password;
  if (status) status.textContent = `Password reset. Give this password to the worker: ${password}`;
}

async function deleteAdminWorkerProfile(button) {
  const employeeId = button.dataset.id;
  const employee = allEmployees.find((item) => item.id === employeeId);

  if (!employee || String(employeeId).startsWith('local-')) {
    return;
  }

  const confirmed = window.confirm(`Delete ${employee.full_name} from active workers? Past requests will keep their saved worker history.`);
  if (!confirmed) return;

  const { error } = await db
    .from('employees')
    .update({
      active: false,
      profile_updated_at: new Date().toISOString(),
    })
    .eq('id', employeeId);

  if (error) throw error;

  allEmployees = allEmployees.filter((item) => item.id !== employeeId);

  if (selectedScheduleEmployeeId === employeeId) {
    selectedScheduleEmployeeId = '';
    selectedWorkerDaysOff = new Set();
    renderWorkerDaysGrid([]);
    renderWorkerDaysOffCalendar();
    if (workerLocation) workerLocation.value = DEFAULT_WORK_LOCATION;
    if (workerScheduleStatus) workerScheduleStatus.textContent = '';
  }

  renderWorkerSelect();
  if (workerSelect) workerSelect.value = '';
  if (workerProfileSelect) workerProfileSelect.value = '';
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
  renderRequests();
}

function renderReviews(reviews, requestMap = new Map()) {
  if (!reviewList) {
    return;
  }

  if (!reviews.length) {
    reviewList.innerHTML = '<div class="empty-state"><p>No reviews saved yet.</p></div>';
    return;
  }

  reviewList.innerHTML = reviews.map((review) => {
    const request = requestMap.get(review.service_request_id) || {};

    return `
      <article class="request-card">
        <div class="request-card-header">
          <div>
            <p class="eyebrow">${escapeHtml(review.service_request_id)}</p>
            <h3>${escapeHtml(review.rating)} / 5 rating</h3>
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

  renderReviews(reviews, requestMap);
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
      </div>
    </article>
  `).join('');
}

async function loadApplicants() {
  if (!applicantList) {
    return;
  }

  applicantList.innerHTML = '<div class="empty-state"><p>Loading applicants...</p></div>';

  const { data, error } = await db
    .from('applicants')
    .select('id,name,email,phone,availability,notes,status,created_at')
    .neq('status', 'hired')
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('Could not load applicants:', error);
    applicantList.innerHTML = '<div class="empty-state"><p>Could not load applicants. Run supabase-operational-upgrades.sql in Supabase.</p></div>';
    return;
  }

  renderApplicants(data || []);
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
    const { error } = await db
      .from('employees')
      .update({
        full_name: applicant.name,
        email: applicant.email || null,
        phone,
        active: true,
        home_location: DEFAULT_WORK_LOCATION,
        ...passwordUpdate,
        profile_updated_at: new Date().toISOString(),
      })
      .eq('id', employee.id);

    if (error) throw error;
  } else {
    const randomSuffix = Array.from(crypto.getRandomValues(new Uint8Array(3)), (value) => value.toString(16).padStart(2, '0')).join('').toUpperCase();
    const employeeCode = `EMP-${randomSuffix}`;
    const { error } = await db
      .from('employees')
      .insert({
        employee_code: employeeCode,
        full_name: applicant.name,
        email: applicant.email || null,
        phone,
        active: true,
        home_location: DEFAULT_WORK_LOCATION,
        ...passwordUpdate,
      });

    if (error) throw error;
  }

  const { error: statusError } = await db
    .from('applicants')
    .update({ status: 'hired' })
    .eq('id', applicantId);

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

  const { error } = await db
    .from('applicants')
    .update({ status: select.value })
    .eq('id', select.dataset.id);

  if (error) {
    console.error('Applicant status update failed:', error);
    alert('Could not update applicant status. Check the console.');
  }
});

workerProfileList?.addEventListener('click', async (event) => {
  const button = event.target.closest('.save-worker-profile');
  const deleteButton = event.target.closest('.delete-worker-profile');
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

  if (deleteButton) {
    deleteButton.disabled = true;

    try {
      await deleteAdminWorkerProfile(deleteButton);
    } catch (error) {
      console.error('Worker delete failed:', error);
      const status = deleteButton.closest('.worker-profile-card')?.querySelector('.admin-worker-status');
      if (status) {
        status.textContent = 'Could not delete worker. Check Supabase setup.';
      }
      deleteButton.disabled = false;
    }
    return;
  }

  if (!button) return;

  button.disabled = true;

  try {
    await saveAdminWorkerProfile(button);
  } catch (error) {
    console.error('Worker profile save failed:', error);
    const status = button.closest('.worker-profile-card')?.querySelector('.admin-worker-status');
    if (status) {
      status.textContent = `Could not save worker profile: ${error.message || 'Check Supabase setup.'}`;
    }
  } finally {
    button.disabled = false;
  }
});

async function handleWorkerSelection(employeeId, shouldScroll = false) {
  if (!employeeId) {
    selectedScheduleEmployeeId = '';
    if (workerSelect) workerSelect.value = '';
    if (workerProfileSelect) workerProfileSelect.value = '';
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

workerProfileSelect?.addEventListener('input', () => {
  handleWorkerSelection(workerProfileSelect.value);
});

workerProfileSelect?.addEventListener('change', () => {
  handleWorkerSelection(workerProfileSelect.value);
});

async function updateRequestStatus(id, status) {
  const updates = { status, updated_at: new Date().toISOString() };
  const { error } = await db.from('service_requests').update(updates).eq('id', id);
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
        assigned_worker_photo_url: employee.photo_url || null,
        updated_at: new Date().toISOString(),
      }
    : {
        assigned_employee_id: null,
        assigned_worker_name: null,
        assigned_worker_phone: null,
        assigned_worker_photo_url: null,
        updated_at: new Date().toISOString(),
      };

  const { error } = await db
    .from('service_requests')
    .update(updates)
    .eq('id', requestId);

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
  const returnParkingSpot = panel.querySelector('.return-parking-spot').value.trim();
  const returnParkingMapUrl = panel.querySelector('.return-parking-map-url').value.trim();

  if (!returnParkingLocation || !returnParkingSpot) {
    alert('Add the return parking lot/garage and spot before saving.');
    return;
  }

  const { error } = await db
    .from('service_requests')
    .update({
      return_parking_location: returnParkingLocation,
      return_parking_spot: returnParkingSpot,
      return_parking_map_url: returnParkingMapUrl || null,
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
  const note = [
    `Quick inspection recorded for ${request.vehicle_year || ''} ${request.vehicle_make || ''} ${request.vehicle_model || ''}.`.replace(/\s+/g, ' ').trim(),
    `Tire PSI before/after: driver front ${values.dfBefore}/${values.dfAfter}, driver rear ${values.drBefore}/${values.drAfter}, passenger front ${values.pfBefore}/${values.pfAfter}, passenger rear ${values.prBefore}/${values.prAfter}.`,
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

  const { error } = await db
    .from('service_requests')
    .update({
      parking_location: panel.querySelector('.edit-parking-location').value.trim(),
      parking_spot: panel.querySelector('.edit-parking-spot').value.trim(),
      service_date: panel.querySelector('.edit-service-date').value || null,
      desired_return_time: panel.querySelector('.edit-return-time').value || null,
      notes: panel.querySelector('.edit-notes').value.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw error;
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

  if (photoType.startsWith('dropoff') && (!request.return_parking_location || !request.return_parking_spot)) {
    alert('Record the return/drop-off location before uploading drop-off photos.');
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

requestList.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;

  try {
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

showOpen?.addEventListener('click', () => { currentView = 'open'; renderRequests(); });
showComplete?.addEventListener('click', () => { currentView = 'complete'; renderRequests(); });
showDenied?.addEventListener('click', () => { currentView = 'closed'; renderRequests(); });

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
    const { error } = await db
      .from('employees')
      .update({ active: true, home_location: schedule.workerLocation })
      .eq('id', employeeId);

    if (error) throw error;
    return employeeId;
  } else {
    const { data, error } = await db
      .from('employees')
      .insert({
        full_name: schedule.workerName,
        active: true,
        home_location: schedule.workerLocation,
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  }
}

async function saveWorkerAvailabilityToSupabase(schedule) {
  const employeeId = schedule.employeeId || await upsertWorker(schedule);

  const { error: deleteAvailabilityError } = await db.from('employee_availability').delete().eq('employee_id', employeeId);
  if (deleteAvailabilityError) throw deleteAvailabilityError;

  const availabilityRows = schedule.workdays.map((workday) => ({
    employee_id: employeeId,
    day_of_week: workday.dayOfWeek,
    starts_at: workday.startsAt,
    ends_at: workday.endsAt,
    work_location: schedule.workerLocation,
  }));

  if (availabilityRows.length) {
    const { error: availabilityError } = await db.from('employee_availability').insert(availabilityRows);
    if (availabilityError) throw availabilityError;
  }

  const { data: updatedEmployee, error: employeeError } = await db
    .from('employees')
    .update({ home_location: schedule.workerLocation, profile_updated_at: new Date().toISOString() })
    .eq('id', employeeId)
    .select('id,employee_code,full_name,phone,email,photo_url,home_location,started_at,active')
    .single();

  if (employeeError) throw employeeError;
  allEmployees = allEmployees.map((employee) => employee.id === employeeId ? updatedEmployee : employee);
  renderWorkerSelect();
  renderWorkerProfiles();
}

async function saveWorkerDaysOffToSupabase(schedule) {
  const employeeId = schedule.employeeId || await upsertWorker(schedule);

  const { error: deleteDaysOffError } = await db.from('employee_days_off').delete().eq('employee_id', employeeId);
  if (deleteDaysOffError) throw deleteDaysOffError;

  const dayOffRows = schedule.daysOff.map((dayOff) => ({
    employee_id: employeeId,
    day_off: dayOff,
  }));

  if (dayOffRows.length) {
    const { error: daysOffError } = await db.from('employee_days_off').insert(dayOffRows);
    if (daysOffError) throw daysOffError;
  }
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

loadEmployees().then(loadRequests);
loadReviews();
loadApplicants();
