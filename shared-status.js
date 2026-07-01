/**
 * shared-status.js — single source of truth for booking-status logic.
 *
 * Canonicalizes the many raw database status strings into the 7 core buckets and
 * exposes the request-bucket sets used by the admin dashboard. Previously each of
 * admin.js / worker.js / track.js / booking-flow.js kept its own copy, and they
 * had drifted (notably `key_received`, and worker/track/booking-flow were missing
 * several combo statuses that then fell through to "new").
 *
 * `key_received` canonicalizes to `en_route` ("In Progress") — the worker has the
 * customer's key and the job is underway. (Product decision, 2026-07.)
 *
 * UMD-style: works as a browser global (window.SF.*) and as a CommonJS require.
 * Labels are intentionally NOT shared here — each surface keeps its own
 * statusLabels map because the user-facing copy legitimately differs.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SF = Object.assign(root.SF || {}, api);
})(typeof self !== 'undefined' ? self : this, function () {
  // Canonical booking statuses (the 7 core states).
  const BOOKING_STATUSES = [
    'new',
    'assigned',
    'en_route',
    'in_service',
    'returning',
    'completed',
    'cancelled',
  ];

  // Every raw database status value mapped to a canonical state.
  const STATUS_MAP = {
    // Core
    new: 'new',
    assigned: 'assigned',
    en_route: 'en_route',
    in_service: 'in_service',
    returning: 'returning',
    completed: 'completed',
    cancelled: 'cancelled',

    // → new
    pending: 'new',
    request_received: 'new',
    pending_customer_info: 'new',

    // → assigned (claimed, no key yet)
    accepted: 'assigned',

    // → en_route (key in hand / vehicle pickup underway)
    key_received: 'en_route',
    vehicle_picked_up: 'en_route',
    pickup_vehicle_photo_uploaded: 'en_route',
    pickup_odometer_photo_uploaded: 'en_route',
    pickup_fuel_gauge_photo_uploaded: 'en_route',

    // → in_service
    in_progress: 'in_service',
    service_in_progress: 'in_service',
    fueling_in_progress: 'in_service',
    car_wash_in_progress: 'in_service',
    car_wash_after_fuel_in_progress: 'in_service',
    fueling_after_wash_in_progress: 'in_service',
    partial_service_complete: 'in_service',
    fueling_complete: 'in_service',
    car_wash_complete: 'in_service',
    fuel_receipt_uploaded: 'in_service',
    wash_receipt_uploaded: 'in_service',
    fuel_receipt_after_wash_uploaded: 'in_service',
    wash_receipt_after_fuel_uploaded: 'in_service',
    fuel_and_wash_complete: 'in_service',
    service_complete: 'in_service',
    receipts_recorded: 'in_service',
    inspection_needed: 'in_service',
    inspection_recorded: 'in_service',
    payment_issue: 'in_service',
    authorization_too_low: 'in_service',
    pending_customer_payment: 'in_service',

    // → returning
    returned_location_pending: 'returning',
    return_location_recorded: 'returning',
    return_photos_needed: 'returning',
    dropoff_vehicle_photo_uploaded: 'returning',
    dropoff_odometer_photo_uploaded: 'returning',
    dropoff_fuel_gauge_photo_uploaded: 'returning',
    vehicle_returned: 'returning',
    final_payment_processed: 'returning',
    awaiting_key_return: 'returning',
    return_requested: 'returning',
    customer_return_requested: 'returning',

    // → completed
    complete: 'completed',
    keys_returned: 'completed',
    finalized: 'completed',

    // → cancelled
    denied: 'cancelled',
    customer_canceled: 'cancelled',
    canceled: 'cancelled',
    cancelled_pending_key_return: 'cancelled',
    unable_to_complete: 'cancelled',
    auto_reversed: 'cancelled',
    closed_no_charge: 'cancelled',
    canceled_return_completed: 'cancelled',
  };

  function canonicalBookingStatus(status) {
    const value = String(status || 'new').toLowerCase();
    return STATUS_MAP[value] || 'new';
  }

  // Admin dashboard bucket sets.
  const OPEN_REQUEST_STATUSES = ['new', 'assigned'];
  const IN_PROGRESS_REQUEST_STATUSES = ['en_route', 'in_service', 'returning'];
  const TERMINAL_STATUSES = ['completed', 'cancelled'];
  const CLOSED_STATUSES = ['cancelled'];

  return {
    BOOKING_STATUSES,
    STATUS_MAP,
    canonicalBookingStatus,
    OPEN_REQUEST_STATUSES,
    IN_PROGRESS_REQUEST_STATUSES,
    TERMINAL_STATUSES,
    CLOSED_STATUSES,
  };
});
