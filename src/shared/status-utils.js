/**
 * ShiftFuel Shared Status Utilities
 * Single source of truth for status mapping across all portals (customer, worker, admin, tracking)
 */

// Canonical booking statuses (the 7 core states)
export const BOOKING_STATUSES = [
  'new',
  'assigned',
  'en_route',
  'in_service',
  'returning',
  'completed',
  'cancelled',
];

// All possible database status values mapped to canonical states
export const STATUS_MAP = {
  // Core statuses
  'new': 'new',
  'assigned': 'assigned',
  'en_route': 'en_route',
  'in_service': 'in_service',
  'returning': 'returning',
  'completed': 'completed',
  'cancelled': 'cancelled',

  // Aliases for 'new'
  'pending': 'new',
  'request_received': 'new',
  'pending_customer_info': 'new',

  // Aliases for 'assigned'
  'accepted': 'assigned',
  'key_received': 'assigned',

  // Aliases for 'en_route'
  'vehicle_picked_up': 'en_route',
  'pickup_vehicle_photo_uploaded': 'en_route',
  'pickup_odometer_photo_uploaded': 'en_route',
  'pickup_fuel_gauge_photo_uploaded': 'en_route',

  // Aliases for 'in_service'
  'in_progress': 'in_service',
  'service_in_progress': 'in_service',
  'fueling_in_progress': 'in_service',
  'car_wash_in_progress': 'in_service',
  'car_wash_after_fuel_in_progress': 'in_service',
  'fueling_after_wash_in_progress': 'in_service',
  'partial_service_complete': 'in_service',
  'fueling_complete': 'in_service',
  'car_wash_complete': 'in_service',
  'fuel_receipt_uploaded': 'in_service',
  'wash_receipt_uploaded': 'in_service',
  'fuel_receipt_after_wash_uploaded': 'in_service',
  'wash_receipt_after_fuel_uploaded': 'in_service',
  'fuel_and_wash_complete': 'in_service',
  'service_complete': 'in_service',
  'receipts_recorded': 'in_service',
  'inspection_needed': 'in_service',
  'inspection_recorded': 'in_service',
  'payment_issue': 'in_service',
  'authorization_too_low': 'in_service',
  'pending_customer_payment': 'in_service',

  // Aliases for 'returning'
  'returned_location_pending': 'returning',
  'return_location_recorded': 'returning',
  'return_photos_needed': 'returning',
  'dropoff_vehicle_photo_uploaded': 'returning',
  'dropoff_odometer_photo_uploaded': 'returning',
  'dropoff_fuel_gauge_photo_uploaded': 'returning',
  'vehicle_returned': 'returning',
  'final_payment_processed': 'returning',
  'awaiting_key_return': 'returning',
  'return_requested': 'returning',
  'customer_return_requested': 'returning',

  // Aliases for 'completed'
  'complete': 'completed',
  'keys_returned': 'completed',
  'finalized': 'completed',

  // Aliases for 'cancelled'
  'denied': 'cancelled',
  'customer_canceled': 'cancelled',
  'canceled': 'cancelled',
  'cancelled_pending_key_return': 'cancelled',
  'unable_to_complete': 'cancelled',
  'auto_reversed': 'cancelled',
  'closed_no_charge': 'cancelled',
  'canceled_return_completed': 'cancelled',
};

// Terminal statuses (no further action possible)
export const TERMINAL_STATUSES = ['completed', 'cancelled'];

// Closed statuses (for display filtering)
export const CLOSED_STATUSES = ['cancelled'];

// Statuses that hold a return time slot
export const SLOT_HOLDING_STATUSES = new Set([
  'accepted',
  'key_received',
  'vehicle_picked_up',
  'service_in_progress',
  'fueling_complete',
  'fuel_receipt_uploaded',
  'car_wash_complete',
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
  'payment_issue',
  'authorization_too_low',
  'pending_customer_payment',
]);

// Friendly labels for all statuses (single source of truth)
export const STATUS_LABELS = {
  new: 'New',
  assigned: 'Assigned',
  en_route: 'En route',
  in_service: 'In service',
  returning: 'Returning',
  completed: 'Completed',
  cancelled: 'Cancelled',

  // Detailed labels for non-canonical statuses
  pending: 'Request received',
  request_received: 'Request received',
  accepted: 'Accepted',
  key_received: 'Key received',
  vehicle_picked_up: 'Vehicle picked up',
  pickup_vehicle_photo_uploaded: 'Vehicle picked up',
  pickup_odometer_photo_uploaded: 'Vehicle picked up',
  pickup_fuel_gauge_photo_uploaded: 'Vehicle picked up',
  in_progress: 'In service',
  service_in_progress: 'Service in progress',
  fueling_in_progress: 'Service in progress',
  car_wash_in_progress: 'Service in progress',
  car_wash_after_fuel_in_progress: 'Service in progress',
  fueling_after_wash_in_progress: 'Service in progress',
  partial_service_complete: 'Partial service complete',
  fueling_complete: 'Fueling complete',
  car_wash_complete: 'Vehicle cleaning complete',
  fuel_receipt_uploaded: 'Fuel receipt recorded',
  wash_receipt_uploaded: 'Car wash receipt recorded',
  fuel_receipt_after_wash_uploaded: 'Fuel receipt recorded',
  wash_receipt_after_fuel_uploaded: 'Car wash receipt recorded',
  fuel_and_wash_complete: 'Fuel and wash complete',
  service_complete: 'Service complete',
  receipts_recorded: 'Receipts recorded',
  returned_location_pending: 'Vehicle return location needed',
  return_location_recorded: 'Return location recorded',
  return_photos_needed: 'Return photos needed',
  dropoff_vehicle_photo_uploaded: 'Vehicle returned',
  dropoff_odometer_photo_uploaded: 'Vehicle returned',
  dropoff_fuel_gauge_photo_uploaded: 'Vehicle returned',
  vehicle_returned: 'Vehicle returned',
  inspection_needed: 'Quick inspection needed',
  inspection_recorded: 'Quick inspection complete',
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
  pending_customer_info: 'Complete your booking',
  pending_customer_payment: 'Awaiting customer payment',
  return_requested: 'Return requested',
  customer_return_requested: 'Return requested',
  cancelled_pending_key_return: 'Cancellation received — awaiting key/vehicle return',
  canceled_return_completed: 'Return completed',
  payment_issue: 'Payment issue',
  authorization_too_low: 'Authorization issue',
};

/**
 * Convert any database status to canonical booking status
 * @param {string} status - Raw database status value
 * @returns {string} Canonical status (new|assigned|en_route|in_service|returning|completed|cancelled)
 */
export function canonicalBookingStatus(status) {
  const value = String(status || 'new').toLowerCase();
  return STATUS_MAP[value] || 'new';
}

/**
 * Get friendly display label for a status
 * @param {string} status - Raw database status value
 * @returns {string} Human-readable status label
 */
export function bookingStatusLabel(status) {
  const canonical = canonicalBookingStatus(status);
  return STATUS_LABELS[canonical] || STATUS_LABELS[status] || 'Status pending';
}

/**
 * Check if a status is terminal (no further action)
 * @param {string} status - Raw database status value
 * @returns {boolean}
 */
export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.includes(canonicalBookingStatus(status));
}

/**
 * Check if a status is closed (for filtering)
 * @param {string} status - Raw database status value
 * @returns {boolean}
 */
export function isClosedStatus(status) {
  return CLOSED_STATUSES.includes(canonicalBookingStatus(status));
}

/**
 * Check if a status holds a return time slot
 * @param {string} status - Raw database status value
 * @returns {boolean}
 */
export function isSlotHoldingStatus(status) {
  return SLOT_HOLDING_STATUSES.has(status);
}

// Open request statuses (for admin dashboard)
export const OPEN_REQUEST_STATUSES = ['new', 'assigned'];

// In-progress request statuses (for admin dashboard)
export const IN_PROGRESS_REQUEST_STATUSES = ['en_route', 'in_service', 'returning'];