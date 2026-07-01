const assert = require('node:assert/strict');
const { simScenario, simJobEconomics } = require('../shared-pricing-sim.js');

// Fuel-only baseline — values hand-computed from the pricing rules.
// 10 gal @ $3.50, $15 fuel fee, 2 station-miles @ $0.75, no wash, no time pay.
const fuelOnly = simScenario({
  needsFuel: true, needsWash: false, quick: false,
  gallons: 10, pricePerGallon: 3.5, stationMiles: 2, washMiles: 0, workerRateRaw: 0,
  fuelFee: 15, washFee: 0, inspFee: 0, washPrice: 0, companyRate: 0,
  fuelBaseMin: 3, fuelPerGalMin: 0.5, washTimeMin: 20, washDetourFree: 5,
  washDetourRate: 0.725, perMileRate: 0.75,
  fuelSharePct: 0.5, washSharePct: 0.5, inspSharePct: 0.5,
  recoveryFixed: 0.3, recoveryRate: 0.029,
});
assert.equal(fuelOnly.fuelCost, 35);
assert.equal(fuelOnly.stationSurcharge, 1.5);
assert.equal(fuelOnly.serviceMin, 8);
assert.equal(fuelOnly.feeStripe, 0.74);      // round(15*0.029 + 0.30)
assert.equal(fuelOnly.customerTotal, 54);    // ceil((51.5 + 0.30) / (1 - 0.029))
assert.equal(fuelOnly.cardRecovery, 2.5);
assert.equal(fuelOnly.workerPay, 8.58);      // 7.13 fee share + 1.45 mileage
assert.equal(fuelOnly.companyNet, 7.92);
assert.equal(fuelOnly.minutes, 19);

// Invariants that must always hold.
assert.equal(fuelOnly.companyNet, Math.round((fuelOnly.serviceRevenue - fuelOnly.workerPay) * 100) / 100);
assert.ok(fuelOnly.customerTotal >= fuelOnly.netTarget, 'customer total covers the net target');

// simJobEconomics with the same inputs (companyRate 0) must match the scenario's
// worker/company numbers.
const econ = simJobEconomics({
  nF: true, nW: false, gal: 10, staMi: 2, washMi: 0, scale: 1,
  rawFuelFee: 15, rawWashFee: 0, rawFuelSharePct: 0.5, rawWashSharePct: 0.5,
  simBundleFuelFee: 0, simBundleWashFee: 0, simBundleFuelShare: 0.5, simBundleWashShare: 0.5,
  fuelBaseMin: 3, fuelPerGalMin: 0.5, washTimeMin: 20, companyRate: 0, perMileRate: 0.75, washDetourFree: 5,
  workerRate: 0, washDetourRate: 0.725, recoveryRate: 0.029, recoveryFixed: 0.3,
});
assert.equal(econ.workerPay, 8.58);
assert.equal(econ.companyNet, 7.92);

// A fee `scale` of 0 zeroes the fees (goal-seek edge).
const zeroed = simJobEconomics({
  nF: true, nW: false, gal: 10, staMi: 2, washMi: 0, scale: 0,
  rawFuelFee: 15, rawWashFee: 0, rawFuelSharePct: 0.5, rawWashSharePct: 0.5,
  simBundleFuelFee: 0, simBundleWashFee: 0, simBundleFuelShare: 0.5, simBundleWashShare: 0.5,
  fuelBaseMin: 3, fuelPerGalMin: 0.5, washTimeMin: 20, companyRate: 0, perMileRate: 0.75, washDetourFree: 5,
  workerRate: 0, washDetourRate: 0.725, recoveryRate: 0.029, recoveryFixed: 0.3,
});
assert.equal(zeroed.workerPay, 1.45);        // no fee share; still paid the 2 mi @ $0.725
assert.equal(zeroed.companyNet, 0.05);       // station surcharge 1.5 - mileage 1.45

console.log('pricing-sim tests passed');
