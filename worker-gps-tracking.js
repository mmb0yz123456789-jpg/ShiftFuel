// Optional live GPS tracking for active worker jobs.
// Uses the worker phone GPS. Stops automatically when the job is returned/closed.
(() => {
  if (!document.body?.classList.contains('worker-portal-page')) return;

  const ACTIVE_FROM_STATUSES = new Set([
    'accepted', 'key_received', 'vehicle_picked_up', 'service_in_progress',
    'fueling_in_progress', 'car_wash_in_progress', 'partial_service_complete',
    'fueling_complete', 'car_wash_complete', 'fuel_receipt_uploaded', 'wash_receipt_uploaded',
    'service_complete', 'receipts_recorded',
  ]);

  const STOP_STATUSES = new Set([
    'returned_location_pending', 'return_location_recorded', 'return_photos_needed',
    'vehicle_returned', 'inspection_needed', 'inspection_recorded', 'final_payment_processed',
    'awaiting_key_return', 'keys_returned', 'complete', 'completed', 'finalized',
    'denied', 'customer_canceled', 'canceled', 'cancelled', 'unable_to_complete',
    'auto_reversed', 'closed_no_charge', 'canceled_return_completed',
  ]);

  const MIN_UPDATE_MS = 15000;
  const MIN_DISTANCE_METERS = 25;
  const activeWatches = new Map();

  function db() {
    return window.ShiftFuelSupabase;
  }

  function getWorkerId() {
    try {
      if (typeof currentEmployee !== 'undefined' && currentEmployee?.id) return currentEmployee.id;
    } catch (_) {}
    return sessionStorage.getItem('shiftfuel_worker_id') || '';
  }

  function getWorkerToken() {
    try {
      if (typeof SESSION_WORKER_TOKEN !== 'undefined') return SESSION_WORKER_TOKEN || '';
    } catch (_) {}
    return sessionStorage.getItem('shiftfuel_worker_token') || '';
  }

  function getJobs() {
    try {
      if (typeof allWorkerJobs !== 'undefined' && Array.isArray(allWorkerJobs)) return allWorkerJobs;
    } catch (_) {}
    return [];
  }

  function findRequest(id) {
    return getJobs().find((job) => job.id === id) || null;
  }

  function belongsToCurrentWorker(job) {
    try {
      if (typeof workerJobBelongsToCurrentEmployee === 'function') return workerJobBelongsToCurrentEmployee(job);
    } catch (_) {}
    return job?.assigned_employee_id === getWorkerId();
  }

  function isEligibleForGps(job) {
    return Boolean(job)
      && belongsToCurrentWorker(job)
      && ACTIVE_FROM_STATUSES.has(job.status)
      && !STOP_STATUSES.has(job.status);
  }

  function distanceMeters(a, b) {
    if (!a || !b) return Infinity;
    const earth = 6371000;
    const toRad = (deg) => deg * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * earth * Math.asin(Math.sqrt(h));
  }

  function statusEl(requestId) {
    return document.querySelector(`.gps-tracking-panel[data-request-id="${CSS.escape(requestId)}"] .gps-tracking-status`);
  }

  function setStatus(requestId, message, isError = false) {
    const el = statusEl(requestId);
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('gps-error', Boolean(isError));
  }

  async function sendLocation(requestId, position) {
    const workerId = getWorkerId();
    if (!workerId) throw new Error('Worker profile not loaded yet.');
    const coords = position.coords;
    const { error } = await db().rpc('worker_upsert_request_location', {
      p_token: getWorkerToken(),
      p_request_id: requestId,
      p_worker_id: workerId,
      p_latitude: coords.latitude,
      p_longitude: coords.longitude,
      p_accuracy: coords.accuracy ?? null,
      p_heading: Number.isFinite(coords.heading) ? coords.heading : null,
      p_speed: Number.isFinite(coords.speed) ? coords.speed : null,
      p_created_at: new Date(position.timestamp || Date.now()).toISOString(),
    });
    if (error) throw error;
  }

  async function stopGps(requestId, reason = 'GPS tracking stopped.') {
    const active = activeWatches.get(requestId);
    if (active?.watchId != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(active.watchId);
    }
    activeWatches.delete(requestId);

    const workerId = getWorkerId();
    if (workerId && db()) {
      try {
        await db().rpc('worker_stop_request_location', {
          p_token: getWorkerToken(),
          p_request_id: requestId,
          p_worker_id: workerId,
        });
      } catch (error) {
        console.warn('Could not stop GPS location in Supabase:', error);
      }
    }

    refreshGpsPanels();
    setStatus(requestId, reason);
  }

  function startGps(requestId) {
    const request = findRequest(requestId);
    if (!isEligibleForGps(request)) {
      setStatus(requestId, 'GPS tracking is only available for active assigned requests.', true);
      return;
    }
    if (!navigator.geolocation) {
      setStatus(requestId, 'GPS is not supported on this device/browser.', true);
      return;
    }
    if (activeWatches.has(requestId)) {
      setStatus(requestId, 'GPS tracking is already active for this request.');
      return;
    }

    setStatus(requestId, 'Requesting location permission...');
    const active = { watchId: null, lastSentAt: 0, lastPoint: null, sending: false };
    const watchId = navigator.geolocation.watchPosition(async (position) => {
      const point = { lat: position.coords.latitude, lng: position.coords.longitude };
      const moved = distanceMeters(active.lastPoint, point);
      const elapsed = Date.now() - active.lastSentAt;
      if (active.sending || (active.lastPoint && elapsed < MIN_UPDATE_MS && moved < MIN_DISTANCE_METERS)) return;

      active.sending = true;
      try {
        await sendLocation(requestId, position);
        active.lastSentAt = Date.now();
        active.lastPoint = point;
        const accuracy = position.coords.accuracy ? ` Accuracy about ${Math.round(position.coords.accuracy)} ft/meters depending on device settings.` : '';
        setStatus(requestId, `GPS tracking is active. Last update ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.${accuracy}`);
      } catch (error) {
        console.error('GPS update failed:', error);
        setStatus(requestId, 'Could not save GPS location. Confirm the Supabase GPS SQL has been run.', true);
      } finally {
        active.sending = false;
      }
    }, (error) => {
      console.warn('GPS permission/update error:', error);
      setStatus(requestId, error.code === 1 ? 'Location permission was denied.' : 'Could not get GPS location from this device.', true);
      stopGps(requestId, 'GPS tracking stopped.');
    }, {
      enableHighAccuracy: true,
      maximumAge: 10000,
      timeout: 15000,
    });

    active.watchId = watchId;
    activeWatches.set(requestId, active);
    refreshGpsPanels();
  }

  function panelHtml(request) {
    const active = activeWatches.has(request.id);
    return `
      <section class="gps-tracking-panel" data-request-id="${request.id}">
        <h4>Live GPS tracking</h4>
        <p class="field-help">Optional. Uses your phone GPS for this active request only. Tracking stops when the vehicle is returned, completed, or stopped.</p>
        <div class="admin-button-row">
          <button class="button primary start-gps-tracking" data-request-id="${request.id}" type="button" ${active ? 'hidden' : ''}>Start GPS Tracking</button>
          <button class="button secondary stop-gps-tracking" data-request-id="${request.id}" type="button" ${active ? '' : 'hidden'}>Stop GPS Tracking</button>
        </div>
        <p class="gps-tracking-status field-help">${active ? 'GPS tracking is active for this request. Tracking stops when the request is completed or stopped.' : 'GPS tracking is off.'}</p>
      </section>
    `;
  }

  function refreshGpsPanels() {
    document.querySelectorAll('.worker-job-card:not(.worker-job-available)').forEach((card) => {
      const requestId = card.querySelector('[data-id]')?.dataset.id;
      const request = requestId ? findRequest(requestId) : null;
      const existing = card.querySelector('.gps-tracking-panel');

      if (!isEligibleForGps(request)) {
        if (existing) existing.remove();
        if (requestId && STOP_STATUSES.has(request?.status)) stopGps(requestId, 'GPS tracking stopped because this request is no longer active.');
        return;
      }

      if (!existing) {
        const guided = card.querySelector('.guided-step');
        if (guided) guided.insertAdjacentHTML('afterend', panelHtml(request));
        else card.insertAdjacentHTML('beforeend', panelHtml(request));
      } else {
        existing.querySelector('.start-gps-tracking').hidden = activeWatches.has(request.id);
        existing.querySelector('.stop-gps-tracking').hidden = !activeWatches.has(request.id);
      }
    });
  }

  function ensureStyles() {
    if (document.querySelector('#worker-gps-tracking-style')) return;
    const style = document.createElement('style');
    style.id = 'worker-gps-tracking-style';
    style.textContent = `
      .gps-tracking-panel {
        margin: 14px 0;
        padding: 16px;
        border: 1px solid rgba(13,59,59,.12);
        border-radius: var(--sf-radius-sm, 14px);
        background: linear-gradient(180deg, #fff, rgba(234,242,234,.75));
      }
      .gps-tracking-panel h4 { margin: 0 0 6px; color: var(--sf-teal-dark, #0d3b3b); }
      .gps-tracking-status { margin-bottom: 0; }
      .gps-tracking-status.gps-error { color: #b42318; font-weight: 800; }
    `;
    document.head.appendChild(style);
  }

  document.addEventListener('click', (event) => {
    const start = event.target.closest('.start-gps-tracking');
    if (start) {
      event.preventDefault();
      startGps(start.dataset.requestId);
      return;
    }

    const stop = event.target.closest('.stop-gps-tracking');
    if (stop) {
      event.preventDefault();
      stopGps(stop.dataset.requestId, 'GPS tracking stopped by worker.');
      return;
    }

    const statusButton = event.target.closest('.worker-update-status, .complete-request, .send-to-customer-payment, .worker-submit-keys-returned, .confirm-cancellation-return');
    if (statusButton?.dataset?.id) {
      const nextStatus = statusButton.dataset.status || '';
      if (!nextStatus || STOP_STATUSES.has(nextStatus) || statusButton.matches('.complete-request, .send-to-customer-payment, .worker-submit-keys-returned, .confirm-cancellation-return')) {
        setTimeout(() => stopGps(statusButton.dataset.id, 'GPS tracking stopped because the request is being returned or completed.'), 500);
      }
    }
  }, true);

  function start() {
    ensureStyles();
    refreshGpsPanels();
    const list = document.querySelector('#worker-job-list');
    if (list) new MutationObserver(() => setTimeout(refreshGpsPanels, 0)).observe(list, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  window.addEventListener('beforeunload', () => {
    for (const requestId of Array.from(activeWatches.keys())) {
      const active = activeWatches.get(requestId);
      if (active?.watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(active.watchId);
    }
  });
})();
