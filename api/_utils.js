/**
 * /api/_utils.js
 *
 * Small, domain-agnostic helpers shared across the Vercel serverless functions.
 * These were previously copy-pasted into payments.js, create-authorized-booking.js,
 * fuel-cards.js and payouts.js — keep the single copy here and require it.
 */

const Stripe = require('stripe');

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not configured');
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

function cleanPhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

// ── Saved-vehicle / saved-address normalization keys ──────────────────────────
// Used to dedupe/match a customer's saved vehicles and addresses regardless of
// spacing, case, or punctuation. Must stay identical everywhere they're compared.

function savedVehiclePlateKey(value) {
  return String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '');
}

function savedVehicleColorKey(value) {
  return String(value || '').trim().toLowerCase();
}

function savedAddressTextKey(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function savedAddressStateKey(value) {
  return String(value || '').trim().toUpperCase();
}

function savedAddressZipKey(value) {
  return String(value || '').replace(/\D/g, '');
}

module.exports = {
  getStripe,
  cleanPhone,
  roundMoney,
  savedVehiclePlateKey,
  savedVehicleColorKey,
  savedAddressTextKey,
  savedAddressStateKey,
  savedAddressZipKey,
};
