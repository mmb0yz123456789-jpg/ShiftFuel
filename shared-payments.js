/**
 * shared-payments.js — payment-related pure helpers shared by client and server.
 *
 * `receiptTotalsFromNotes` is the important one: it parses the worker-recorded
 * receipt totals out of a request's free-text notes and MUST return the same
 * numbers on the customer/admin UI (client) and in the charge logic
 * (api/payments.js). It previously existed as separate copies in admin.js,
 * worker.js, track.js and api/payments.js — a client/server drift risk on money.
 *
 * It accepts either a raw notes string (server call style) or a request object
 * (client call style), so no existing call site has to change.
 *
 * UMD-style: browser global (window.SF.*) and CommonJS require.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SF = Object.assign(root.SF || {}, api);
})(typeof self !== 'undefined' ? self : this, function () {
  function receiptTotalsFromNotes(notesOrRequest) {
    const notes = typeof notesOrRequest === 'string'
      ? notesOrRequest
      : (notesOrRequest && notesOrRequest.notes) || '';
    const matches = Array.from(String(notes || '').matchAll(/\[receipt_totals fuel=([0-9.]+) wash=([0-9.]+)\]/g));
    const latest = matches.at(-1);

    return {
      fuel: latest ? Number(latest[1]) || 0 : 0,
      wash: latest ? Number(latest[2]) || 0 : 0,
    };
  }

  function requestNeedsFuel(request) {
    return String(request.service_type || '').includes('fuel');
  }

  function requestNeedsWash(request) {
    return String(request.service_type || '').includes('wash');
  }

  // Cancellation status categorization — the single source of truth for BOTH the
  // server's cancel/charge decision (api/payments.js) and the customer-facing
  // "can I cancel + what's the fee story" copy (track.js). Previously two parallel
  // lists that had to be kept in sync by hand.
  function cancellationOutcomeForStatus(status) {
    const noFeeStatuses = ['pending', 'request_received', 'accepted'];
    const flatFeeStatuses = ['key_received'];
    // Worker has the vehicle and is en route to the service but HASN'T started it
    // yet — still cancelable (fee + costs).
    const feePlusCostsStatuses = [
      'vehicle_picked_up',
      'pickup_vehicle_photo_uploaded', 'pickup_odometer_photo_uploaded', 'pickup_fuel_gauge_photo_uploaded',
    ];
    // Service is actually underway (or done): once "Start service" is tapped it can't
    // be cancelled — the worker finishes it and the customer is charged.
    const serviceStartedBlocked = [
      'fueling_in_progress', 'car_wash_in_progress', 'service_in_progress', 'partial_service_complete',
      'fueling_complete', 'fuel_receipt_uploaded', 'car_wash_complete', 'wash_receipt_uploaded',
      'car_wash_after_fuel_in_progress', 'fueling_after_wash_in_progress',
      'wash_receipt_after_fuel_uploaded', 'fuel_receipt_after_wash_uploaded',
      'service_complete', 'receipts_recorded',
    ];
    const blockedMessages = {
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

    if (blockedMessages[status]) {
      return { cancelable: false, message: blockedMessages[status] };
    }
    if (serviceStartedBlocked.includes(status)) {
      return { cancelable: false, message: "Your specialist has already started the service, so it can't be cancelled now. They'll finish it and you'll be charged for the completed service." };
    }
    if (noFeeStatuses.includes(status)) {
      return { cancelable: true, tier: 'none', requiresKeyReturn: false, returnType: null, newStatus: 'cancelled' };
    }
    if (flatFeeStatuses.includes(status)) {
      return { cancelable: true, tier: 'flat_fee', requiresKeyReturn: true, returnType: 'key', newStatus: 'cancelled_pending_key_return' };
    }
    if (feePlusCostsStatuses.includes(status)) {
      return { cancelable: true, tier: 'fee_plus_costs', requiresKeyReturn: true, returnType: 'vehicle', newStatus: 'cancelled_pending_key_return' };
    }
    return { cancelable: false, message: 'This request cannot be cancelled from Track right now. Please contact ShiftFuel.' };
  }

  // Core return-request charge math (base fee + receipts, grossed up for the card
  // fee only when receipts exist). One source of truth for the admin display
  // (returnRequestChargeSummary) and the server charge (returnRequestChargeFromNotes),
  // so what the customer/admin sees always equals what's charged. `fee`,
  // `recoveryFixed` and `recoveryRate` are passed in (no hard-coded constants).
  function returnRequestCharge(receiptTotals, { fee, recoveryFixed, recoveryRate }) {
    const r = (v) => Math.round((Number(v) || 0) * 100) / 100;
    const rawFuel = Number(receiptTotals && receiptTotals.fuel) || 0;
    const rawWash = Number(receiptTotals && receiptTotals.wash) || 0;
    const hasReceipts = rawFuel > 0 || rawWash > 0;
    const subtotal = r(rawFuel + rawWash + fee);
    const total = hasReceipts ? Math.ceil((subtotal + recoveryFixed) / (1 - recoveryRate)) : fee;
    const recovery = r(total - subtotal);
    return { fuel: r(rawFuel), wash: r(rawWash), cancellationFee: fee, recovery, subtotal, total, hasReceipts };
  }

  return {
    receiptTotalsFromNotes, requestNeedsFuel, requestNeedsWash,
    cancellationOutcomeForStatus, returnRequestCharge,
  };
});
