/**
 * shared-pricing-sim.js — pure pricing math for the admin pricing simulator and
 * annual planner (admin.js `runPricingSimulator`). Extracted so the money logic
 * is testable in isolation (see tests/pricing-sim.test.js). No DOM, no globals —
 * every input is passed in; every output is returned.
 *
 * UMD-style: browser global (window.SF.*) and CommonJS require.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SF = Object.assign(root.SF || {}, api);
})(typeof self !== 'undefined' ? self : this, function () {
  const r = (value) => Math.round((Number(value) || 0) * 100) / 100;

  // One booking scenario → every customer/worker/company line the sim renders.
  function simScenario(i) {
    const {
      needsFuel, needsWash, quick,
      gallons, pricePerGallon, stationMiles, washMiles, workerRateRaw,
      fuelFee, washFee, inspFee, washPrice, companyRate,
      fuelBaseMin, fuelPerGalMin, washTimeMin, washDetourFree, washDetourRate, perMileRate,
      fuelSharePct, washSharePct, inspSharePct,
      recoveryFixed, recoveryRate,
    } = i;

    // ── Customer side ──
    const fuelCost = needsFuel ? r(gallons * pricePerGallon) : 0;
    const serviceMin = (needsFuel ? fuelBaseMin + fuelPerGalMin * gallons : 0) + (needsWash ? washTimeMin : 0);
    const timeCharge = r(serviceMin * companyRate);
    const stationSurcharge = needsFuel ? r(stationMiles * perMileRate) : 0;
    const washSurcharge = needsWash ? r(Math.max(0, washMiles - washDetourFree) * perMileRate) : 0;
    const netTarget = r(fuelCost + washPrice + fuelFee + washFee + inspFee + stationSurcharge + washSurcharge + timeCharge);
    const customerTotal = netTarget > 0 ? Math.ceil((netTarget + recoveryFixed) / (1 - recoveryRate)) : 0;
    const cardRecovery = r(customerTotal - netTarget);

    // ── Worker side ──
    const workerRate = companyRate > 0 ? Math.min(workerRateRaw, companyRate) : workerRateRaw;
    const feeGross = fuelFee + washFee + inspFee;
    const feeStripe = feeGross > 0 ? r(feeGross * recoveryRate + recoveryFixed) : 0;
    const netOf = (fee) => (feeGross > 0 ? Math.max(0, fee - feeStripe * (fee / feeGross)) : 0);
    const fuelFeeShare = r(netOf(fuelFee) * fuelSharePct);
    const washFeeShare = r(netOf(washFee) * washSharePct);
    const inspFeeShare = r(netOf(inspFee) * inspSharePct);
    const feeShare = r(fuelFeeShare + washFeeShare + inspFeeShare);
    const mileagePay = needsFuel ? r(stationMiles * washDetourRate) : 0;
    const timePay = r(serviceMin * workerRate);
    const washDetourPay = needsWash ? r(washMiles * washDetourRate) : 0;
    const workerPay = r(feeShare + mileagePay + timePay + washDetourPay);

    // ── Company keeps ──
    const companyNet = r(fuelFee + washFee + inspFee + timeCharge + stationSurcharge + washSurcharge - workerPay);
    const serviceRevenue = r(fuelFee + washFee + inspFee + timeCharge + stationSurcharge + washSurcharge);

    // ── Time to complete ──
    const driveMiles = (needsFuel ? stationMiles : 0) + (needsWash ? washMiles : 0);
    const minutes = Math.round(10 + 5 + (driveMiles / 30) * 60 + (quick ? 10 : 0));

    return {
      fuelCost, serviceMin, timeCharge, stationSurcharge, washSurcharge, netTarget,
      customerTotal, cardRecovery, workerRate, feeGross, feeStripe,
      fuelFeeShare, washFeeShare, inspFeeShare, feeShare, mileagePay, timePay, washDetourPay,
      workerPay, companyNet, serviceRevenue, driveMiles, minutes,
    };
  }

  // Per-job company-net + worker-pay for the annual planner, at a fee `scale`.
  function simJobEconomics(i) {
    const {
      nF, nW, gal, staMi, washMi, scale,
      rawFuelFee, rawWashFee, rawFuelSharePct, rawWashSharePct,
      simBundleFuelFee, simBundleWashFee, simBundleFuelShare, simBundleWashShare,
      fuelBaseMin, fuelPerGalMin, washTimeMin, companyRate, perMileRate, washDetourFree,
      workerRate, washDetourRate, recoveryRate, recoveryFixed,
    } = i;

    let fF = (nF ? rawFuelFee : 0) * scale;
    let wF = (nW ? rawWashFee : 0) * scale;
    let fShare = rawFuelSharePct;
    let wShare = rawWashSharePct;
    if (nF && nW) {
      const bf = simBundleFuelFee * scale;
      const bw = simBundleWashFee * scale;
      if ((bf + bw) > 0 && (bf + bw) < (fF + wF)) {
        fF = bf; wF = bw;
        fShare = simBundleFuelShare; wShare = simBundleWashShare;
      }
    }
    const sMin = (nF ? fuelBaseMin + fuelPerGalMin * gal : 0) + (nW ? washTimeMin : 0);
    const tCharge = r(sMin * companyRate);
    const staSur = nF ? r(staMi * perMileRate) : 0;
    const washSur = nW ? r(Math.max(0, washMi - washDetourFree) * perMileRate) : 0;
    const tot = fF + wF;
    const stripe = tot > 0 ? r(tot * recoveryRate + recoveryFixed) : 0;
    const netOf = (fee) => (tot > 0 ? Math.max(0, fee - stripe * (fee / tot)) : 0);
    const feeShareW = r(netOf(fF) * fShare + netOf(wF) * wShare);
    const workerPay = r(feeShareW + sMin * workerRate + (nF ? staMi * washDetourRate : 0) + (nW ? washMi * washDetourRate : 0));
    const serviceRev = r(fF + wF + tCharge + staSur + washSur);
    return { companyNet: r(serviceRev - workerPay), workerPay };
  }

  return { simScenario, simJobEconomics };
});
