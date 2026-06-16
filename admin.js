const db = window.ShiftFuelSupabase;
const requestList = document.querySelector('#request-list');
const totalRequests = document.querySelector('#total-requests');
const openRequests = document.querySelector('#open-requests');
const completeRequests = document.querySelector('#complete-requests');
const deniedRequests = document.querySelector('#denied-requests');
const showOpen = document.querySelector('#show-open');
const showComplete = document.querySelector('#show-complete');
const showDenied = document.querySelector('#show-denied');

const PHOTO_BUCKET = 'service-photos';
let allRequests = [];
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
  fuel_receipt_uploaded: 'Fuel receipt uploaded',
  car_wash_in_progress: 'Car wash in progress',
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

function numberFromInput(value) {
  return Number(String(value || '').replace(/[^0-9.\-]/g, '')) || 0;
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

function finalTotalFromParts(request, fuelReceipt, washReceipt) {
  const fuelConvenience = serviceNeedsFuel(request) ? Number(request.fuel_convenience_fee ?? 15) : 0;
  const washConvenience = serviceNeedsWash(request) ? Number(request.wash_convenience_fee ?? 15) : 0;
  const inspection = request.quick_inspection ? Number(request.quick_inspection_fee ?? 5) : 0;
  return numberFromInput(fuelReceipt) + numberFromInput(washReceipt) + fuelConvenience + washConvenience + inspection;
}

function requestCardDetails(request) {
  return `
    <div class="request-details">
      <p><strong>Customer:</strong> ${escapeHtml(request.customer_name)} | ${escapeHtml(request.customer_phone)} | ${escapeHtml(request.customer_email || '')}</p>
      <p><strong>Vehicle:</strong> ${escapeHtml(request.vehicle_year)} ${escapeHtml(request.vehicle_make)} ${escapeHtml(request.vehicle_model)}, ${escapeHtml(request.vehicle_color)} | Plate: ${escapeHtml(request.license_plate)}</p>
      <p><strong>Service:</strong> ${escapeHtml(request.service_label || request.service_type)} ${request.wash_package_label ? `| Wash: ${escapeHtml(request.wash_package_label)}` : ''} ${request.fuel_type ? `| Fuel: ${escapeHtml(request.fuel_type)}` : ''}</p>
      <p><strong>Pickup parking:</strong> ${escapeHtml(request.parking_location)}, spot ${escapeHtml(request.parking_spot)}</p>
      ${request.return_parking_location ? `<p><strong>Return parking:</strong> ${escapeHtml(request.return_parking_location)}, spot ${escapeHtml(request.return_parking_spot)}</p>` : ''}
      <p><strong>Service date/time:</strong> ${escapeHtml(request.service_date || '')} ${escapeHtml(request.desired_return_time || '')}</p>
      <p><strong>Estimated total:</strong> ${money(request.estimated_total)} | <strong>Final total:</strong> ${request.final_total == null ? 'Not recorded' : money(request.final_total)}</p>
      <p><strong>Fees saved:</strong> Fuel convenience ${money(request.fuel_convenience_fee)} | Wash convenience ${money(request.wash_convenience_fee)} | Inspection ${money(request.quick_inspection_fee)}</p>
      ${request.notes ? `<p><strong>Notes:</strong> ${escapeHtml(request.notes)}</p>` : ''}
    </div>
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

  return `
    <div class="admin-button-row">
      <button class="button primary update-status" data-id="${request.id}" data-status="accepted" type="button">Accept</button>
      <button class="button primary update-status" data-id="${request.id}" data-status="key_received" type="button">Key received</button>
      <button class="button primary update-status" data-id="${request.id}" data-status="vehicle_picked_up" type="button">Vehicle picked up</button>
      ${serviceNeedsFuel(request) ? `<button class="button primary update-status" data-id="${request.id}" data-status="fueling_in_progress" type="button">Fueling</button>` : ''}
      ${serviceNeedsWash(request) ? `<button class="button primary update-status" data-id="${request.id}" data-status="car_wash_in_progress" type="button">Car wash</button>` : ''}
      <button class="button secondary show-photo-panel" data-id="${request.id}" type="button">Upload photos</button>
      <button class="button secondary show-receipt-panel" data-id="${request.id}" type="button">Record receipts/final total</button>
      <button class="button secondary show-return-location" data-id="${request.id}" type="button">Record return location</button>
      <button class="button primary update-status" data-id="${request.id}" data-status="vehicle_returned" type="button">Vehicle returned</button>
      <button class="button primary update-status" data-id="${request.id}" data-status="complete" type="button">Complete</button>
      <button class="button danger update-status" data-id="${request.id}" data-status="unable_to_complete" type="button">Unable</button>
      <button class="button danger update-status" data-id="${request.id}" data-status="denied" type="button">Deny</button>
      <button class="button secondary edit-request" data-id="${request.id}" type="button">Edit</button>
    </div>
    ${renderPhotoPanel(request)}
    ${renderReceiptPanel(request)}
    ${renderReturnLocationPanel(request)}
    ${renderEditPanel(request)}
  `;
}

function renderPhotoPanel(request) {
  return `
    <div class="photo-panel" data-panel-for="${request.id}" hidden>
      <h4>Upload proof photos</h4>
      <p class="field-help">Use pickup photo types before service. Use drop-off photo types only after recording the return location.</p>
      <label>Photo type
        <select class="photo-type">
          <option value="pickup_vehicle">Pickup - vehicle exterior</option>
          <option value="pickup_odometer">Pickup - odometer</option>
          <option value="pickup_fuel_gauge">Pickup - fuel gauge</option>
          <option value="fuel_receipt">Fuel receipt</option>
          <option value="wash_receipt">Wash receipt</option>
          <option value="dropoff_vehicle">Drop-off - vehicle exterior</option>
          <option value="dropoff_odometer">Drop-off - odometer</option>
          <option value="dropoff_fuel_gauge">Drop-off - fuel gauge</option>
        </select>
      </label>
      <label>Photo file
        <input class="photo-file" type="file" accept="image/*">
      </label>
      <button class="button primary upload-photo" data-id="${request.id}" type="button">Upload selected photo</button>
    </div>
  `;
}

function renderReceiptPanel(request) {
  return `
    <div class="receipt-panel" data-receipt-for="${request.id}" hidden>
      <h4>Record receipts and final total</h4>
      <p class="field-help">For car wash + gas, enter both receipt amounts. The app adds both convenience fees. Example: $50 fuel + $50 wash + $15 fuel fee + $15 wash fee = $130.</p>
      <div class="admin-money-grid">
        <label>Fuel receipt amount
          <input class="fuel-receipt-total" type="number" min="0" step="0.01" placeholder="50.00">
        </label>
        <label>Wash receipt amount
          <input class="wash-receipt-total" type="number" min="0" step="0.01" placeholder="50.00">
        </label>
      </div>
      <button class="button primary save-final-total" data-id="${request.id}" type="button">Save final total</button>
    </div>
  `;
}

function renderReturnLocationPanel(request) {
  return `
    <div class="return-location-panel" data-return-for="${request.id}" hidden>
      <h4>Record return/drop-off location before drop-off photos</h4>
      <div class="field-grid">
        <label>Return parking lot / garage
          <input class="return-parking-location" type="text" value="${escapeHtml(request.return_parking_location || '')}" placeholder="Garage B, Level 3">
        </label>
        <label>Return parking spot
          <input class="return-parking-spot" type="text" value="${escapeHtml(request.return_parking_spot || '')}" placeholder="B3-142">
        </label>
        <label>Return Google Maps link
          <input class="return-parking-map-url" type="url" value="${escapeHtml(request.return_parking_map_url || '')}" placeholder="Paste map link">
        </label>
      </div>
      <button class="button primary save-return-location" data-id="${request.id}" type="button">Save return location</button>
    </div>
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

  totalRequests.textContent = allRequests.length;
  openRequests.textContent = allRequests.filter(isOpen).length;
  completeRequests.textContent = allRequests.filter((request) => request.status === 'complete').length;
  deniedRequests.textContent = allRequests.filter((request) => closedStatuses.includes(request.status)).length;

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
      ${renderActions(request)}
    </article>
  `).join('');
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

async function updateRequestStatus(id, status) {
  const updates = { status, updated_at: new Date().toISOString() };
  const { error } = await db.from('service_requests').update(updates).eq('id', id);
  if (error) throw error;
  await loadRequests();
}

async function saveFinalTotal(button) {
  const id = button.dataset.id;
  const request = allRequests.find((item) => item.id === id);
  const panel = button.closest('.receipt-panel');
  const fuelReceipt = panel.querySelector('.fuel-receipt-total').value;
  const washReceipt = panel.querySelector('.wash-receipt-total').value;
  const finalTotal = finalTotalFromParts(request, fuelReceipt, washReceipt);

  const note = `Receipt totals recorded: fuel ${money(fuelReceipt)}, wash ${money(washReceipt)}. Final total ${money(finalTotal)}.`;
  const notes = request.notes ? `${request.notes}\n${note}` : note;

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

    if (button.classList.contains('save-return-location')) {
      await saveReturnLocation(button);
      return;
    }

    if (button.classList.contains('save-edit')) {
      await saveEdit(button);
      return;
    }

    if (button.classList.contains('upload-photo')) {
      await uploadPhoto(button);
    }
  } catch (error) {
    console.error(error);
    alert('Something went wrong. Check the console for details.');
    button.disabled = false;
  }
});

showOpen?.addEventListener('click', () => { currentView = 'open'; renderRequests(); });
showComplete?.addEventListener('click', () => { currentView = 'complete'; renderRequests(); });
showDenied?.addEventListener('click', () => { currentView = 'closed'; renderRequests(); });

loadRequests();
