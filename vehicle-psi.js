/**
 * vehicle-psi.js — shared door-jamb PSI reference table.
 *
 * Common door-jamb PSI by make/model — a STARTING suggestion only (matched on
 * make+model, not year/trim). The worker/admin always confirms the real number
 * off the door-jamb sticker; these just pre-fill a sensible default.
 *
 * Single source of truth for admin.js and worker.js (previously copy-pasted into
 * both). UMD-style: works as a browser global (window.SF.FALLBACK_PSI_GUIDES) and
 * as a CommonJS require.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SF = Object.assign(root.SF || {}, api);
})(typeof self !== 'undefined' ? self : this, function () {
  const FALLBACK_PSI_GUIDES = [
    // Toyota
    { make: 'Toyota', model: 'Camry', front_psi: 35, rear_psi: 35 },
    { make: 'Toyota', model: 'Corolla', front_psi: 32, rear_psi: 32 },
    { make: 'Toyota', model: 'RAV4', front_psi: 35, rear_psi: 35 },
    { make: 'Toyota', model: 'Highlander', front_psi: 35, rear_psi: 35 },
    { make: 'Toyota', model: 'Tacoma', front_psi: 30, rear_psi: 35 },
    { make: 'Toyota', model: 'Tundra', front_psi: 35, rear_psi: 35 },
    { make: 'Toyota', model: '4Runner', front_psi: 32, rear_psi: 32 },
    { make: 'Toyota', model: 'Prius', front_psi: 35, rear_psi: 33 },
    { make: 'Toyota', model: 'Sienna', front_psi: 36, rear_psi: 36 },
    // Honda
    { make: 'Honda', model: 'Civic', front_psi: 32, rear_psi: 32 },
    { make: 'Honda', model: 'Accord', front_psi: 32, rear_psi: 32 },
    { make: 'Honda', model: 'CR-V', front_psi: 32, rear_psi: 32 },
    { make: 'Honda', model: 'Pilot', front_psi: 35, rear_psi: 35 },
    { make: 'Honda', model: 'Odyssey', front_psi: 35, rear_psi: 35 },
    { make: 'Honda', model: 'HR-V', front_psi: 33, rear_psi: 33 },
    { make: 'Honda', model: 'Passport', front_psi: 35, rear_psi: 35 },
    // Nissan
    { make: 'Nissan', model: 'Altima', front_psi: 32, rear_psi: 32 },
    { make: 'Nissan', model: 'Rogue', front_psi: 33, rear_psi: 33 },
    { make: 'Nissan', model: 'Sentra', front_psi: 33, rear_psi: 33 },
    { make: 'Nissan', model: 'Murano', front_psi: 35, rear_psi: 35 },
    { make: 'Nissan', model: 'Pathfinder', front_psi: 35, rear_psi: 35 },
    { make: 'Nissan', model: 'Frontier', front_psi: 32, rear_psi: 32 },
    { make: 'Nissan', model: 'Kicks', front_psi: 33, rear_psi: 33 },
    // Hyundai / Kia
    { make: 'Hyundai', model: 'Elantra', front_psi: 33, rear_psi: 33 },
    { make: 'Hyundai', model: 'Sonata', front_psi: 34, rear_psi: 34 },
    { make: 'Hyundai', model: 'Tucson', front_psi: 35, rear_psi: 33 },
    { make: 'Hyundai', model: 'Santa Fe', front_psi: 35, rear_psi: 35 },
    { make: 'Hyundai', model: 'Kona', front_psi: 33, rear_psi: 33 },
    { make: 'Hyundai', model: 'Palisade', front_psi: 35, rear_psi: 35 },
    { make: 'Kia', model: 'Forte', front_psi: 33, rear_psi: 33 },
    { make: 'Kia', model: 'K5', front_psi: 35, rear_psi: 35 },
    { make: 'Kia', model: 'Sportage', front_psi: 35, rear_psi: 33 },
    { make: 'Kia', model: 'Sorento', front_psi: 35, rear_psi: 35 },
    { make: 'Kia', model: 'Soul', front_psi: 33, rear_psi: 33 },
    { make: 'Kia', model: 'Telluride', front_psi: 35, rear_psi: 35 },
    // Ford
    { make: 'Ford', model: 'F-150', front_psi: 35, rear_psi: 35 },
    { make: 'Ford', model: 'Escape', front_psi: 35, rear_psi: 35 },
    { make: 'Ford', model: 'Explorer', front_psi: 35, rear_psi: 35 },
    { make: 'Ford', model: 'Edge', front_psi: 34, rear_psi: 34 },
    { make: 'Ford', model: 'Mustang', front_psi: 32, rear_psi: 30 },
    { make: 'Ford', model: 'Ranger', front_psi: 35, rear_psi: 35 },
    { make: 'Ford', model: 'Bronco', front_psi: 38, rear_psi: 38 },
    // Chevrolet / GMC
    { make: 'Chevrolet', model: 'Silverado', front_psi: 35, rear_psi: 35 },
    { make: 'Chevrolet', model: 'Equinox', front_psi: 35, rear_psi: 35 },
    { make: 'Chevrolet', model: 'Malibu', front_psi: 35, rear_psi: 35 },
    { make: 'Chevrolet', model: 'Traverse', front_psi: 35, rear_psi: 35 },
    { make: 'Chevrolet', model: 'Tahoe', front_psi: 35, rear_psi: 35 },
    { make: 'Chevrolet', model: 'Trailblazer', front_psi: 33, rear_psi: 33 },
    { make: 'GMC', model: 'Sierra', front_psi: 35, rear_psi: 35 },
    { make: 'GMC', model: 'Terrain', front_psi: 35, rear_psi: 35 },
    { make: 'GMC', model: 'Acadia', front_psi: 35, rear_psi: 35 },
    { make: 'GMC', model: 'Yukon', front_psi: 35, rear_psi: 35 },
    // Jeep / Ram / Dodge / Chrysler
    { make: 'Jeep', model: 'Wrangler', front_psi: 37, rear_psi: 37 },
    { make: 'Jeep', model: 'Grand Cherokee', front_psi: 36, rear_psi: 36 },
    { make: 'Jeep', model: 'Cherokee', front_psi: 34, rear_psi: 34 },
    { make: 'Jeep', model: 'Compass', front_psi: 33, rear_psi: 33 },
    { make: 'Jeep', model: 'Gladiator', front_psi: 37, rear_psi: 37 },
    { make: 'Ram', model: '1500', front_psi: 35, rear_psi: 35 },
    { make: 'Dodge', model: 'Charger', front_psi: 35, rear_psi: 32 },
    { make: 'Dodge', model: 'Durango', front_psi: 36, rear_psi: 36 },
    { make: 'Chrysler', model: 'Pacifica', front_psi: 36, rear_psi: 36 },
    // Subaru
    { make: 'Subaru', model: 'Outback', front_psi: 35, rear_psi: 33 },
    { make: 'Subaru', model: 'Forester', front_psi: 32, rear_psi: 30 },
    { make: 'Subaru', model: 'Crosstrek', front_psi: 33, rear_psi: 32 },
    { make: 'Subaru', model: 'Impreza', front_psi: 33, rear_psi: 32 },
    { make: 'Subaru', model: 'Ascent', front_psi: 35, rear_psi: 35 },
    // Mazda / VW
    { make: 'Mazda', model: 'CX-5', front_psi: 34, rear_psi: 34 },
    { make: 'Mazda', model: 'Mazda3', front_psi: 36, rear_psi: 35 },
    { make: 'Mazda', model: 'CX-9', front_psi: 35, rear_psi: 35 },
    { make: 'Mazda', model: 'CX-30', front_psi: 34, rear_psi: 34 },
    { make: 'Volkswagen', model: 'Jetta', front_psi: 36, rear_psi: 36 },
    { make: 'Volkswagen', model: 'Tiguan', front_psi: 33, rear_psi: 36 },
    { make: 'Volkswagen', model: 'Atlas', front_psi: 38, rear_psi: 41 },
    // Tesla / Lexus
    { make: 'Tesla', model: 'Model 3', front_psi: 42, rear_psi: 42 },
    { make: 'Tesla', model: 'Model Y', front_psi: 42, rear_psi: 42 },
    { make: 'Tesla', model: 'Model S', front_psi: 42, rear_psi: 42 },
    { make: 'Tesla', model: 'Model X', front_psi: 40, rear_psi: 40 },
    { make: 'Lexus', model: 'RX', front_psi: 33, rear_psi: 33 },
    { make: 'Lexus', model: 'ES', front_psi: 35, rear_psi: 35 },
    { make: 'Lexus', model: 'NX', front_psi: 33, rear_psi: 33 },
  ];

  return { FALLBACK_PSI_GUIDES };
});
