/**
 * ShiftFuel Shared Payment Utilities
 * Single source of truth for cancellation logic and payment calculations
 */

// Cancellation base fee
export const CANCELLATION_BASE_FEE = 15;

// Payment recovery constants (Stripe fee recovery)
export const RETURN_RECOVERY_RATE = 0.029; // 2.9%
export const RETURN_RECOVERY_FIXED = 0.30; // $0.30

// Payment recovery constants (for customer-facing calculations)
export const PAYMENT_RECOVERY_RATE = 0.029; // 2.9%
export const PAYMENT_RECOVERY_FIXED = 0.30; // $0.30

// Base service fees
export const BASE_FUEL_SERVICE_FEE = 15;
export const BASE_WASH_SERVICE_FEE = 15;
export const BASE_QUICK_INSPECTION_FEE = 5;

// No-fee cancellation statuses (cancel before key handoff)
const NO_FEE_STATUSES = ['pending', 'request_received', 'accepted'];

// Flat-fee cancellation statuses (key received but vehicle not picked up)
const FLAT_FEE_STATUSES = ['key_received'];

// Fee-plus-costs statuses (vehicle picked up, service started)
const FEE_PLUS_COSTS_STATUSES = [
  'vehicle_picked_up',
  'pickup_vehicle_photo_uploaded',
  'pickup_odometer_photo_uploaded',
  'pickup_fuel_gauge_photo_uploaded',
];

// Service-started blocked statuses (cannot cancel once service begins)
const SERVICE_STARTED_BLOCKED_STATUSES = [
  'fueling_in_progress',
  'car_wash_in_progress',
  'service_in_progress',
  'partial_service_complete',
  'fueling_complete',
  'car_wash_complete',
  'fuel_receipt_uploaded',
  'wash_receipt_uploaded',
  'car_wash_after_fuel_in_progress',
  'fueling_after_wash_in_progress',
  'wash_receipt_after_fuel_uploaded',
  'fuel_receipt_after_wash_uploaded',
  'service_complete',
  'receipts_recorded',
];

// Return/vehicle-returned blocked statuses
const RETURN_BLOCKED_MESSAGES = {
  vehicle_returned: 'This request can no longer be cancelled because the vehicle has already been returned.',
  returned_location_pending: 'This request can no longer be cancelled because the vehicle has already been returned.',
  return_location_recorded: 'This request can no longer be cancelled because the vehicle has already been returned.',
  return_photos_needed: 'This request can no longer be cancelled because the vehicle has already been returned.',
  dropoff_vehicle_photo_uploaded: 'This request can no longer be cancelled because the vehicle has already been returned.',
  dropoff_odometer_photo_uploaded: 'This request can no longer be cancelled because the vehicle has already been returned.',
  inspection_needed: 'This request can no longer be cancelled because the vehicle has already been returned.',
  inspection_recorded: 'This request can no longer be cancelled because the vehicle has already been returned.',
  awaiting_key_return: 'This request can no longer be cancelled because the vehicle has already been returned.',
  keys_returned: 'This request can no longer be cancelled because the vehicle has already been returned.',
  final_payment_processed: 'This request can no longer be cancelled because the vehicle has already been returned.',
  complete: 'This request is already complete.',
  denied: 'This request has already been denied.',
  cancelled: 'This request has already been cancelled.',
  cancelled_pending_key_return: 'This request has already been cancelled.',
  customer_canceled: 'This request has already been cancelled.',
  canceled: 'This request has already been cancelled.',
  canceled_return_completed: 'This request has already been cancelled.',
  customer_return_requested: 'This request has already been cancelled.',
  return_requested: 'This request has already been cancelled.',
};

/**
 * Determine cancellation outcome for a given status
 * @param {string} status - Current booking status
 * @returns {Object} Cancellation outcome with cancelable flag, tier, and message
 */
export function cancellationOutcomeForStatus(status) {
  // Check if status is in return-blocked messages
  if (RETURN_BLOCKED_MESSAGES[status]) {
    return { cancelable: false, message: RETURN_BLOCKED_MESSAGES[status] };
  }

  // Check if service has started (cannot cancel)
  if (SERVICE_STARTED_BLOCKED_STATUSES.includes(status)) {
    return {
      cancelable: false,
      message: "Your specialist has already started the service, so it can't be cancelled now. They'll finish it and you'll be charged for the completed service.",
    };
  }

  // No-fee tier: canceled before key handoff
  if (NO_FEE_STATUSES.includes(status)) {
    return {
      cancelable: true,
      tier: 'none',
      requiresKeyReturn: false,
      returnType: null,
      newStatus: 'cancelled',
    };
  }

  // Flat-fee tier: key received but vehicle not yet picked up
  if (FLAT_FEE_STATUSES.includes(status)) {
    return {
      cancelable: true,
      tier: 'flat_fee',
      requiresKeyReturn: true,
      returnType: 'key',
      newStatus: 'cancelled_pending_key_return',
    };
  }

  // Fee-plus-costs tier: vehicle picked up or service started
  if (FEE_PLUS_COSTS_STATUSES.includes(status)) {
    return {
      cancelable: true,
      tier: 'fee_plus_costs',
      requiresKeyReturn: true,
      returnType: 'vehicle',
      newStatus: 'cancelled_pending_key_return',
    };
  }

  // Default: cannot cancel
  return { cancelable: false, message: 'This request cannot be cancelled from Track right now. Please contact ShiftFuel.' };
}

/**
 * Calculate cancellation charge for a given tier
 * @param {string} tier - Cancellation tier ('none'|'flat_fee'|'fee_plus_costs')
 * @param {Object} receiptTotals - Receipt totals {fuel, wash}
 * @returns {Object} Charge breakdown
 */
export function cancellationChargeForTier(tier, receiptTotals = { fuel: 0, wash: 0 }, recoverable = { mileage: 0, time: 0 }) {
  if (tier === 'none') {
    return { feeAmount: 0, mileageCost: 0, timeCost: 0, stripeFee: 0, receiptTotal: 0, totalCharged: 0 };
  }

  if (tier === 'flat_fee') {
    // Keys received but no driving yet — flat base fee only, nothing to recover.
    return {
      feeAmount: CANCELLATION_BASE_FEE,
      mileageCost: 0,
      timeCost: 0,
      stripeFee: 0,
      receiptTotal: 0,
      totalCharged: CANCELLATION_BASE_FEE,
    };
  }

  // fee_plus_costs tier: vehicle picked up / en route. On top of the base fee, recover
  // the real sunk cost of the aborted trip — the detour miles already driven and the
  // time already spent — then gross up for the Stripe fee like a normal charge.
  const receiptTotal = roundMoney((receiptTotals.fuel || 0) + (receiptTotals.wash || 0));
  const mileageCost = roundMoney(Math.max(0, (recoverable && recoverable.mileage) || 0));
  const timeCost = roundMoney(Math.max(0, (recoverable && recoverable.time) || 0));
  const subtotal = roundMoney(CANCELLATION_BASE_FEE + receiptTotal + mileageCost + timeCost);
  const totalCharged = Math.ceil((subtotal + RETURN_RECOVERY_FIXED) / (1 - RETURN_RECOVERY_RATE));
  const stripeFee = roundMoney(totalCharged - subtotal);

  return {
    feeAmount: CANCELLATION_BASE_FEE,
    mileageCost,
    timeCost,
    stripeFee,
    receiptTotal,
    totalCharged,
  };
}

/**
 * Round money to 2 decimal places
 * @param {number} value
 * @returns {number}
 */
export function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/**
 * Parse receipt totals from request notes
 * @param {string} notes - Request notes field
 * @returns {Object} {fuel, wash}
 */
export function receiptTotalsFromNotes(notes) {
  const matches = Array.from(String(notes || '').matchAll(/\[receipt_totals fuel=([0-9.]+) wash=([0-9.]+)\]/g));
  const latest = matches.at(-1);

  return {
    fuel: latest ? Number(latest[1]) || 0 : 0,
    wash: latest ? Number(latest[2]) || 0 : 0,
  };
}

/**
 * Calculate transaction pricing summary
 * @param {Object} request - Service request object
 * @param {Object} receiptTotals - Receipt totals {fuel, wash}
 * @returns {Object} Pricing breakdown
 */
export function transactionPricingSummary(request, receiptTotals = { fuel: 0, wash: 0 }) {
  const fuelBase = requestNeedsFuel(request) && (Number(receiptTotals.fuel || 0) > 0 || serviceUnableFeeCharged(request, 'fuel'))
    ? BASE_FUEL_SERVICE_FEE
    : 0;
  const washBase = requestNeedsWash(request) && (Number(receiptTotals.wash || 0) > 0 || serviceUnableFeeCharged(request, 'wash'))
    ? BASE_WASH_SERVICE_FEE
    : 0;
  const inspection = request.quick_inspection ? BASE_QUICK_INSPECTION_FEE : 0;
  const netTarget = roundMoney(Number(receiptTotals.fuel || 0) + Number(receiptTotals.wash || 0) + fuelBase + washBase + inspection);
  const roundedTotal = netTarget > 0
    ? Math.ceil((netTarget + PAYMENT_RECOVERY_FIXED) / (1 - PAYMENT_RECOVERY_RATE))
    : 0;
  const recovery = roundMoney(roundedTotal - netTarget);

  let fuelRecovery = 0;
  let washRecovery = 0;

  if (fuelBase && washBase) {
    // Recovery is calculated once on the whole transaction, then split proportionally
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
    fuel: roundMoney(fuelBase + fuelRecovery),
    wash: roundMoney(washBase + washRecovery),
    inspection,
    recovery,
    total: roundedTotal,
  };
}

/**
 * Check if service needs fuel
 * @param {Object} request - Service request
 * @returns {boolean}
 */
export function requestNeedsFuel(request) {
  return String(request.service_type || '').includes('fuel');
}

/**
 * Check if service needs wash
 * @param {Object} request - Service request
 * @returns {boolean}
 */
export function requestNeedsWash(request) {
  return String(request.service_type || '').includes('wash');
}

/**
 * Check if service unable fee was charged
 * @param {Object} request - Service request
 * @param {string} type - 'fuel' or 'wash'
 * @returns {boolean}
 */
export function serviceUnableFeeCharged(request, type) {
  const notes = String(request.notes || '');
  return new RegExp(`\\[service_unable_fee_charged ${type}\\]`).test(notes);
}

/**
 * Calculate final total from saved receipts
 * @param {Object} request - Service request
 * @param {Object} receiptTotals - Receipt totals {fuel, wash}
 * @returns {number} Final total
 */
export function finalTotalFromSavedReceipts(request, receiptTotals) {
  const fees = transactionPricingSummary(request, receiptTotals);
  return fees.total;
}

/**
 * Parse service unable reasons from notes
 * @param {Object} request - Service request
 * @returns {Object} {fuel, wash} reasons
 */
export function serviceUnableReasonsFromNotes(request) {
  const notes = String(request.notes || '');
  const reasons = { fuel: '', wash: '' };

  for (const match of notes.matchAll(new RegExp(`\\[service_unable (fuel|wash)\\] [^:]+: ([^\\n]+)`, 'g'))) {
    reasons[match[1]] = match[2];
  }

  return reasons;
}