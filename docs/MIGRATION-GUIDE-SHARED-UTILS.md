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

## Still per-surface (deliberate, follow-up candidates)

- `customer-account.js` keeps its own hybrid `canonicalBookingStatus` (returns the
  raw status when it has a label for it); unifying it would change customer copy.
- `roundMoneyValue` (admin/worker/track) and booking-flow's `formatMoney` /
  `serviceNeedsFuel/Wash` (bookingState-based) are left as-is.
- The **cancellation-charge math** (`cancellationOutcomeForStatus`,
  `cancellationChargeForTier`, `transactionPricingSummary`) is duplicated between
  the client (preview) and `api/payments.js` (the real charge). Unifying it is
  worthwhile but higher-risk and deserves its own dedicated verification pass.
