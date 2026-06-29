(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ShiftFuelRouteLeg = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const COMPLETE_STATUSES = new Set([
    'complete',
    'completed',
    'keys_returned',
    'canceled_return_completed',
    'denied',
    'customer_canceled',
    'canceled',
    'cancelled',
    'unable_to_complete',
    'auto_reversed',
    'closed_no_charge',
  ]);

  function serviceNeedsFuel(request) {
    return String(request?.service_type || '').includes('fuel');
  }

  function serviceNeedsWash(request) {
    return String(request?.service_type || '').includes('wash');
  }

  function receiptTotalsFromNotes(request) {
    const matches = Array.from(String(request?.notes || '').matchAll(/\[receipt_totals fuel=([0-9.]+) wash=([0-9.]+)\]/g));
    const latest = matches.at(-1);
    return {
      fuel: latest ? Number(latest[1]) || 0 : 0,
      wash: latest ? Number(latest[2]) || 0 : 0,
    };
  }

  function serviceUnable(request, type) {
    return new RegExp(`\\[service_unable ${type}\\]`).test(String(request?.notes || ''));
  }

  function serviceDoneOrUnable(request, type) {
    const totals = receiptTotalsFromNotes(request);
    return serviceUnable(request, type) || Number(totals[type] || 0) > 0;
  }

  function realNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) && n !== 0 ? n : null;
  }

  function normalizeCoord(coord, label) {
    if (!coord) return null;
    const lat = realNumber(coord.lat ?? coord.latitude);
    const lon = realNumber(coord.lon ?? coord.lng ?? coord.longitude);
    return lat != null && lon != null ? { lat, lon, label: coord.label || label } : null;
  }

  function coordFromColumns(request, latKeys, lonKeys, label) {
    for (const latKey of latKeys) {
      const lat = realNumber(request?.[latKey]);
      if (lat == null) continue;
      for (const lonKey of lonKeys) {
        const lon = realNumber(request?.[lonKey]);
        if (lon != null) return { lat, lon, label };
      }
    }
    return null;
  }

  function coordFromNotes(request, tags, label) {
    const notes = String(request?.notes || '');
    for (const tag of tags) {
      const m = notes.match(new RegExp('\\[' + tag + ' (-?\\d+(?:\\.\\d+)?),(-?\\d+(?:\\.\\d+)?)\\]'));
      if (!m) continue;
      const lat = realNumber(m[1]);
      const lon = realNumber(m[2]);
      if (lat != null && lon != null) return { lat, lon, label };
    }
    return null;
  }

  function addressDestination(request) {
    const label = [request?.address_street, request?.address_apt, request?.address_city, request?.address_state, request?.address_zip]
      .filter(Boolean)
      .join(', ') || request?.hospital || 'Service address';
    return coordFromColumns(request, ['address_lat'], ['address_lon', 'address_lng'], label);
  }

  function keyPickupDestination(request) {
    return coordFromColumns(request, ['key_pickup_lat'], ['key_pickup_lng', 'key_pickup_lon'], 'Key pickup')
      || coordFromNotes(request, ['key_pickup_location', 'handoff_coords'], 'Key pickup')
      || addressDestination(request);
  }

  function vehiclePickupDestination(request) {
    return coordFromColumns(request, ['vehicle_pickup_lat'], ['vehicle_pickup_lng', 'vehicle_pickup_lon'], "Vehicle's spot")
      || coordFromNotes(request, ['vehicle_pickup_location', 'pickup_coords'], "Vehicle's spot")
      || addressDestination(request);
  }

  function fuelDestination(request) {
    return coordFromColumns(request, ['fuel_station_lat', 'gas_station_lat'], ['fuel_station_lng', 'fuel_station_lon', 'gas_station_lng', 'gas_station_lon'], request?.gas_station_name || 'Gas station')
      || coordFromNotes(request, ['fuel_station_location', 'fuel_dest_coords'], request?.gas_station_name || 'Gas station');
  }

  function washDestination(request) {
    return coordFromColumns(request, ['car_wash_lat', 'wash_lat'], ['car_wash_lng', 'car_wash_lon', 'wash_lng', 'wash_lon'], request?.car_wash_name || 'Car wash')
      || coordFromNotes(request, ['car_wash_location', 'wash_dest_coords'], request?.car_wash_name || 'Car wash');
  }

  function leg(destinationType, destination, destinationLabel, buttonLabel, nextStatus, origin) {
    return {
      origin: normalizeCoord(origin, 'Current worker location'),
      destination: normalizeCoord(destination, destinationLabel),
      destinationType,
      destinationLabel,
      routeMode: 'driving',
      shouldShowMap: true,
      shouldRecalculate: true,
      buttonLabel,
      nextStatus,
    };
  }

  function getCurrentRouteLeg(request, workerLocation) {
    if (!request || COMPLETE_STATUSES.has(request.status)) {
      return {
        origin: normalizeCoord(workerLocation, 'Current worker location'),
        destination: null,
        destinationType: null,
        destinationLabel: '',
        routeMode: 'driving',
        shouldShowMap: false,
        shouldRecalculate: false,
        buttonLabel: '',
        nextStatus: null,
      };
    }

    const status = request.status;
    const needsFuel = serviceNeedsFuel(request);
    const needsWash = serviceNeedsWash(request);
    const fuelDone = !needsFuel || serviceDoneOrUnable(request, 'fuel');
    const washDone = !needsWash || serviceDoneOrUnable(request, 'wash');

    if (status === 'accepted' || status === 'request_received') {
      return leg('address', addressDestination(request), 'Service address', 'Key received', 'key_received', workerLocation);
    }
    if (status === 'key_received') {
      return leg('vehicle_pickup', vehiclePickupDestination(request), "Vehicle's spot", '', null, workerLocation);
    }
    if (status === 'vehicle_picked_up') {
      if (needsWash && !washDone) return leg('wash', washDestination(request), 'Car wash', 'Start service', 'service_in_progress', workerLocation);
      if (needsFuel && !fuelDone) return leg('station', fuelDestination(request), 'Gas station', 'Start service', 'service_in_progress', workerLocation);
    }
    if (['service_in_progress', 'car_wash_in_progress', 'fueling_in_progress'].includes(status)) {
      if (needsWash && !washDone) return leg('wash', washDestination(request), 'Car wash', '', null, workerLocation);
      if (needsFuel && !fuelDone) return leg('station', fuelDestination(request), 'Gas station', '', null, workerLocation);
    }
    if (['car_wash_complete', 'wash_receipt_uploaded'].includes(status)) {
      if (needsFuel && !fuelDone) return leg('station', fuelDestination(request), 'Gas station', 'Start service', 'service_in_progress', workerLocation);
      return leg('return', vehiclePickupDestination(request), "Vehicle's spot", "I'm back at the service address", 'returned_location_pending', workerLocation);
    }
    if (['fueling_complete', 'fuel_receipt_uploaded'].includes(status)) {
      if (needsWash && !washDone) return leg('wash', washDestination(request), 'Car wash', 'Start service', 'service_in_progress', workerLocation);
      return leg('return', vehiclePickupDestination(request), "Vehicle's spot", "I'm back at the service address", 'returned_location_pending', workerLocation);
    }
    if (['receipts_recorded', 'service_complete'].includes(status)) {
      return leg('return', vehiclePickupDestination(request), "Vehicle's spot", "I'm back at the service address", 'returned_location_pending', workerLocation);
    }
    if (['returned_location_pending', 'return_location_recorded', 'return_photos_needed'].includes(status)) {
      return leg('return', vehiclePickupDestination(request), "Vehicle's spot", '', null, workerLocation);
    }
    if (['vehicle_returned', 'awaiting_key_return', 'cancelled_pending_key_return'].includes(status)) {
      return leg('handoff', keyPickupDestination(request), 'Key pickup', 'Keys returned', null, workerLocation);
    }

    return {
      origin: normalizeCoord(workerLocation, 'Current worker location'),
      destination: null,
      destinationType: null,
      destinationLabel: '',
      routeMode: 'driving',
      shouldShowMap: false,
      shouldRecalculate: false,
      buttonLabel: '',
      nextStatus: null,
    };
  }

  return {
    getCurrentRouteLeg,
    serviceNeedsFuel,
    serviceNeedsWash,
    serviceDoneOrUnable,
  };
});
