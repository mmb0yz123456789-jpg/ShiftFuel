// Optional live GPS tracking for active worker jobs.
// Uses the worker phone GPS. Stops automatically when the job is returned/closed.
(() => {
  if (!document.body?.classList.contains('worker-portal-page')) return;

  // Tracking window = the whole time the worker holds the customer's key/vehicle:
  // from key pickup through service AND the return trip, until the key/vehicle is
  // physically handed back. 'accepted' stays eligible only so the key-received gate
  // can start GPS within the tap gesture (shouldTrack() excludes it from auto-start).
  const ACTIVE_FROM_STATUSES = new Set([
    'accepted', 'key_received',
    'pickup_vehicle_photo_uploaded', 'pickup_odometer_photo_uploaded', 'pickup_fuel_gauge_photo_uploaded',
    'vehicle_picked_up', 'service_in_progress',
    'fueling_in_progress', 'car_wash_in_progress', 'partial_service_complete',
    'fueling_complete', 'car_wash_complete', 'fuel_and_wash_complete',
    'fuel_receipt_uploaded', 'wash_receipt_uploaded',
    'service_complete', 'receipts_recorded',
    // Return trip — keep tracking until the key/vehicle is returned.
    'returned_location_pending', 'return_location_recorded', 'return_photos_needed',
    'dropoff_vehicle_photo_uploaded', 'dropoff_odometer_photo_uploaded', 'dropoff_fuel_gauge_photo_uploaded',
    'vehicle_returned', 'inspection_needed', 'inspection_recorded', 'final_payment_processed',
    'awaiting_key_return',
    // Payment waits that happen before the key is returned.
    'pending_customer_payment', 'payment_issue', 'authorization_too_low',
    // Cancellation / return that still requires handing the key/vehicle back.
    'cancelled_pending_key_return', 'return_requested', 'customer_return_requested',
  ]);

  // GPS turns OFF only once the key/vehicle is back, or the job is otherwise terminal.
  const STOP_STATUSES = new Set([
    'keys_returned', 'complete', 'completed', 'finalized',
    'canceled_return_completed',
    'denied', 'customer_canceled', 'canceled', 'cancelled',
    'unable_to_complete', 'auto_reversed', 'closed_no_charge',
  ]);

  // Movement-aware cadence: send often while the worker is moving, and back off
  // to an occasional heartbeat while stopped — never track more than needed.
  const MOVING_UPDATE_MS = 15000;   // ~10–20s while driving
  const STOPPED_UPDATE_MS = 45000;  // ~30–60s while parked/stopped
  const MOVING_SPEED_MPS = 0.7;     // ≈1.5 mph — above this counts as moving
  const MIN_DISTANCE_METERS = 25;
  const activeWatches = new Map();
  const blockedRequests = new Set();

  // ── Screen wake lock ────────────────────────────────────────────────────────
  // Keep the worker's screen on while any job is being tracked, so iOS Auto-Lock
  // can't dim/lock the phone mid-drive — which would suspend the page and silently
  // stop GPS. Supported on iOS 16.4+ as an installed PWA (same bar as push).
  // Released the instant no job is being tracked, so the screen returns to normal.
  let wakeLock = null;

  async function acquireWakeLock() {
    if (wakeLock || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      // The OS can drop the lock on its own (e.g. tab hidden). Clear our handle so
      // a later visibility change re-acquires it instead of assuming we still hold one.
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch (err) {
      // Not fatal — tracking still works, the screen just isn't pinned on.
      console.warn('Screen wake lock unavailable:', err && err.message ? err.message : err);
      wakeLock = null;
    }
  }

  async function releaseWakeLock() {
    if (!wakeLock) return;
    try { await wakeLock.release(); } catch (_) {}
    wakeLock = null;
  }

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

  // Tracking is mandatory from key pickup onward. 'accepted' stays eligible (so the
  // key-received gate can start GPS within the tap gesture) but must not by itself
  // render the panel or trigger auto-resume until the key is actually received.
  function shouldTrack(job) {
    return isEligibleForGps(job) && job.status !== 'accepted';
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
    if (activeWatches.size === 0) releaseWakeLock(); // no jobs left — let the screen sleep again

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
      const speed = Number.isFinite(position.coords.speed) ? position.coords.speed : null;
      const isMoving = (speed != null && speed >= MOVING_SPEED_MPS) || moved >= MIN_DISTANCE_METERS;
      const minInterval = isMoving ? MOVING_UPDATE_MS : STOPPED_UPDATE_MS;
      const elapsed = Date.now() - active.lastSentAt;
      if (active.sending || (active.lastPoint && elapsed < minInterval)) return;

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
      if (error.code === 1) {
        // Permission denied/revoked. Stop and mark blocked so auto-resume does not loop;
        // the worker must re-enable location and tap Resume to continue.
        blockedRequests.add(requestId);
        setStatus(requestId, 'Location permission is off. Turn it on and tap Resume to keep tracking.', true);
        stopGps(requestId, 'GPS tracking stopped because location permission is off.');
      } else {
        // Transient signal loss (position unavailable/timeout). Keep the watch alive so
        // tracking stays on and resumes automatically when the signal returns.
        setStatus(requestId, 'GPS signal is weak right now — still trying to track…', true);
      }
    }, {
      enableHighAccuracy: true,
      maximumAge: 10000,
      timeout: 15000,
    });

    active.watchId = watchId;
    activeWatches.set(requestId, active);
    acquireWakeLock(); // keep the screen on for the duration of the drive
    refreshGpsPanels();
  }

  function panelHtml(request) {
    const active = activeWatches.has(request.id);
    return `
      <section class="gps-tracking-panel${active ? ' is-tracking' : ''}" data-request-id="${request.id}">
        <h4>Live GPS tracking</h4>
        <p class="field-help">Required — your phone GPS stays on until the key/vehicle is returned.</p>
        <div class="admin-button-row" ${active ? 'hidden' : ''}>
          <button class="button primary start-gps-tracking" data-request-id="${request.id}" type="button">Resume GPS tracking</button>
        </div>
        <p class="gps-tracking-status field-help">${active ? 'GPS tracking is active for this request.' : 'GPS tracking is required — tap Resume if it does not start automatically.'}</p>
      </section>
    `;
  }

  function refreshGpsPanels() {
    document.querySelectorAll('.worker-job-card:not(.worker-job-available)').forEach((card) => {
      const requestId = card.querySelector('[data-id]')?.dataset.id;
      const request = requestId ? findRequest(requestId) : null;
      const existing = card.querySelector('.gps-tracking-panel');

      if (!shouldTrack(request)) {
        if (existing) existing.remove();
        if (requestId && STOP_STATUSES.has(request?.status)) stopGps(requestId, 'GPS tracking stopped because this request is no longer active.');
        return;
      }

      if (!existing) {
        const guided = card.querySelector('.guided-step');
        if (guided) guided.insertAdjacentHTML('afterend', panelHtml(request));
        else card.insertAdjacentHTML('beforeend', panelHtml(request));
      } else {
        const row = existing.querySelector('.admin-button-row');
        if (row) row.hidden = activeWatches.has(request.id);
      }

      // Mandatory tracking: keep GPS on for the whole active job. Resume it if it is not
      // running (page reload, navigation, transient drop). Permission was granted at
      // "Key received", so this does not re-prompt. Skip requests blocked by a denial.
      if (!activeWatches.has(request.id) && !blockedRequests.has(request.id)) startGps(request.id);
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
    // iOS only reliably grants a screen wake lock inside a user gesture, and drops
    // it whenever the app backgrounds. So treat every tap as a chance to (re)arm it
    // while a job is being tracked. acquireWakeLock() is a no-op if already held.
    if (activeWatches.size > 0) acquireWakeLock();

    const start = event.target.closest('.start-gps-tracking');
    if (start) {
      event.preventDefault();
      // Manual resume overrides a prior denial block (e.g., worker re-enabled location).
      blockedRequests.delete(start.dataset.requestId);
      startGps(start.dataset.requestId);
      return;
    }

    // Mandatory GPS gate on "Key received": the worker cannot advance the job to
    // key_received unless they grant location access. Runs in the capture phase so
    // it can block worker.js's status-update handler until permission is granted.
    const keyBtn = event.target.closest('.worker-update-status');
    if (keyBtn && keyBtn.dataset.status === 'key_received' && keyBtn.dataset.id) {
      // Second pass after permission was granted — let worker.js handle the update.
      if (keyBtn.dataset.gpsCleared === '1') return;

      // Block the status change until location permission is confirmed.
      event.preventDefault();
      event.stopImmediatePropagation();

      const requestId = keyBtn.dataset.id;

      if (!navigator.geolocation) {
        setStatus(requestId, 'Location is required to mark Key received, but this device/browser has no GPS.', true);
        alert('Location access is required to mark Key received, but GPS is not available on this device/browser.');
        return;
      }

      const originalLabel = keyBtn.textContent;
      keyBtn.disabled = true;
      keyBtn.textContent = 'Checking location...';
      setStatus(requestId, 'Requesting location permission to start tracking...');

      // Grab the wake lock NOW, while we still have the tap's user activation — iOS
      // rejects wakeLock.request() outside a gesture, so acquiring it later inside
      // the async GPS callback silently failed and the screen kept dimming.
      acquireWakeLock();

      navigator.geolocation.getCurrentPosition(
        () => {
          // Permission granted: start tracking, then re-dispatch so the status advances.
          blockedRequests.delete(requestId);
          startGps(requestId);
          keyBtn.dataset.gpsCleared = '1';
          keyBtn.disabled = false;
          keyBtn.textContent = originalLabel;
          keyBtn.click();
        },
        (error) => {
          keyBtn.disabled = false;
          keyBtn.textContent = originalLabel;
          const denied = error.code === 1;
          setStatus(requestId, denied
            ? 'Location permission denied. It is required to mark Key received.'
            : 'Could not get your location. It is required to mark Key received.', true);
          alert(denied
            ? 'Location access was denied. You must allow location to mark Key received. Turn on location for this site in your browser settings, then try again.'
            : 'Could not get your location. Make sure location is enabled, then try again to mark Key received.');
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
      return;
    }

    // Only stop GPS the instant the worker takes an action that returns the key/
    // vehicle or completes the job — NOT when sending to customer payment, since the
    // key still hasn't been handed back at that point.
    const statusButton = event.target.closest('.worker-update-status, .complete-request, .worker-submit-keys-returned, .confirm-cancellation-return');
    if (statusButton?.dataset?.id) {
      const nextStatus = statusButton.dataset.status || '';
      const isKeyReturnOrComplete = statusButton.matches('.complete-request, .worker-submit-keys-returned, .confirm-cancellation-return');
      if (STOP_STATUSES.has(nextStatus) || isKeyReturnOrComplete) {
        setTimeout(() => stopGps(statusButton.dataset.id, 'GPS tracking stopped because the key/vehicle was returned or the job is complete.'), 500);
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

  // iOS releases the wake lock whenever the app is backgrounded, so re-acquire it
  // when the worker comes back to a screen that still has an active job.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && activeWatches.size > 0) acquireWakeLock();
  });

  window.addEventListener('beforeunload', () => {
    for (const requestId of Array.from(activeWatches.keys())) {
      const active = activeWatches.get(requestId);
      if (active?.watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(active.watchId);
    }
    releaseWakeLock();
  });
})();
