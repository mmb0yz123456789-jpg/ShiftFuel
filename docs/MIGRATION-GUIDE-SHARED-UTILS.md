# Shared Utilities — Status

> **Superseded (2026-07).** The original plan here was an ESM `src/shared/*` module
> set consumed via `import`. That never worked at runtime: the site loads its big
> files as **classic scripts** (`<script src="admin.js">`) and `api/*` uses
> **CommonJS**, so neither could `import` an ESM module without a bundler (there is
> none) or converting every file to `type="module"` (which would break the
> codebase's pervasive global-scope coupling and inline handlers). The ESM modules
> were unused and have been deleted.

## The pattern that shipped

Shared code lives in **UMD-style plain-JS files at the repo root**. Each attaches
to a browser global **and** exports for CommonJS, so the *same file* is consumed by
the browser (`<script src>` before the page's main file) and by `api/*` via
`require`:

```js
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api; // api/*
  root.SF = Object.assign(root.SF || {}, api);                               // browser
})(typeof self !== 'undefined' ? self : this, function () {
  /* ... */ return { /* exports */ };
});
```

| File | Contents | Consumers |
| --- | --- | --- |
| `shared-status.js` | `canonicalBookingStatus`, `STATUS_MAP`, `BOOKING_STATUSES`, `OPEN/IN_PROGRESS/TERMINAL/CLOSED` sets | admin, worker, track, booking-flow |
| `shared-payments.js` | `receiptTotalsFromNotes` (client **and** `api/payments.js`), `requestNeedsFuel/Wash` | admin, worker, track, api/payments |
| `shared-format.js` | `formatCurrency`, `escapeHtml` | admin, worker, track |
| `vehicle-psi.js` | `FALLBACK_PSI_GUIDES` door-jamb PSI table | admin, worker |
| `api/_utils.js` (CommonJS) | `getStripe`, `cleanPhone`, `roundMoney`, saved address/vehicle keys | server only |

Client files bind the shared functions to their existing local names
(`const money = window.SF.formatCurrency;`) so call sites didn't change.

## Notable decisions

- **`key_received` → `en_route`** ("In Progress") everywhere — the worker holding
  the key is underway. This matched admin's existing mapping; worker/track/booking
  moved to it. It also fixed a bug where combo statuses (`fuel_and_wash_complete`,
  etc.) previously fell through to "new" on those surfaces.
- **`statusLabels` were intentionally NOT shared** — user-facing copy legitimately
  differs per surface.

## Done (previously deferred)

- `customer-account.js` now uses shared `canonicalBookingStatus`; its granular
  labels are preserved because `statusLabel()` prefers the raw-status label
  (`statusLabels[raw] || statusLabels[canonical]`). `canonicalBookingStatus` has
  one definition app-wide.
- **Cancellation SSOT:** `cancellationOutcomeForStatus` (status→cancelable/tier/
  message) and `returnRequestCharge` (base fee + receipts, grossed up for the card
  fee) live in `shared-payments.js`, shared by `api/payments.js` (charge/decision),
  `track.js` (can-cancel + confirmation copy) and `admin.js` (charge display).

## Still per-surface (deliberate)

- `cancellationChargeForTier` stays in `api/payments.js` — it is server-only (no
  client copy, so no drift risk).
- `roundMoneyValue` (admin/worker/track) and booking-flow's `formatMoney` /
  `serviceNeedsFuel/Wash` (bookingState-based) are left as-is.
- Per-surface cancellation **copy** (blocked messages, modal text) stays local,
  like `statusLabels` — only the categorization/charge math is shared.
