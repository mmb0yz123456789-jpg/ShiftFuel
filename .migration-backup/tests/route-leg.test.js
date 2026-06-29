const assert = require('node:assert/strict');
const { getCurrentRouteLeg } = require('../route-leg.js');

const worker = { lat: 39.74, lon: -75.55 };
const base = {
  id: 'req_1',
  address_lat: 39.7401,
  address_lon: -75.5501,
  vehicle_pickup_lat: 39.741,
  vehicle_pickup_lng: -75.551,
  key_pickup_lat: 39.742,
  key_pickup_lng: -75.552,
  car_wash_lat: 39.743,
  car_wash_lng: -75.553,
  fuel_station_lat: 39.744,
  fuel_station_lng: -75.554,
};

function leg(overrides) {
  return getCurrentRouteLeg({ ...base, ...overrides }, worker);
}

assert.equal(leg({ service_type: 'wash', status: 'key_received' }).destinationType, 'vehicle_pickup');
assert.equal(leg({ service_type: 'wash', status: 'vehicle_picked_up' }).destinationType, 'wash');
assert.equal(leg({
  service_type: 'wash',
  status: 'car_wash_complete',
  notes: '[receipt_totals fuel=0.00 wash=20.00]',
}).destinationType, 'return');
assert.equal(leg({ service_type: 'wash', status: 'vehicle_returned' }).destinationType, 'handoff');

assert.equal(leg({ service_type: 'fuel', status: 'vehicle_picked_up' }).destinationType, 'station');
assert.equal(leg({
  service_type: 'fuel',
  status: 'fueling_complete',
  notes: '[receipt_totals fuel=40.00 wash=0.00]',
}).destinationType, 'return');

assert.equal(leg({ service_type: 'fuel_wash', status: 'vehicle_picked_up' }).destinationType, 'wash');
assert.equal(leg({
  service_type: 'fuel_wash',
  status: 'wash_receipt_uploaded',
  notes: '[receipt_totals fuel=0.00 wash=20.00]',
}).destinationType, 'station');
assert.equal(leg({
  service_type: 'fuel_wash',
  status: 'fueling_complete',
  notes: '[receipt_totals fuel=40.00 wash=20.00]',
}).destinationType, 'return');

assert.equal(leg({ service_type: 'fuel_wash', status: 'complete' }).shouldShowMap, false);

console.log('route-leg tests passed');
