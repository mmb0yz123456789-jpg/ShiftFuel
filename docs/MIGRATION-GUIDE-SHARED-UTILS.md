# ShiftFuel Shared Utilities Migration Guide

This guide explains how to integrate the new shared utilities into existing code to eliminate duplication and ensure consistency.

## Overview

We've created three shared utility modules in `src/shared/`:

1. **status-utils.js** - Status mapping, labels, and canonical status conversion
2. **payment-utils.js** - Cancellation logic, pricing calculations, receipt parsing
3. **photo-utils.js** - Photo validation, compression, and path generation

## Migration Steps

### Step 1: Update admin.js

#### Replace `canonicalBookingStatus()`

**Before (lines 137-191):**
```javascript
function canonicalBookingStatus(status) {
  const value = String(status || 'new').toLowerCase();
  if (BOOKING_STATUSES.includes(value)) return value;
  // ... 54 more lines of mapping logic
}
```

**After:**
```javascript
import { canonicalBookingStatus, BOOKING_STATUSES, STATUS_LABELS } from '../src/shared/status-utils.js';

// Remove the old function (lines 137-191)
// Remove BOOKING_STATUSES array (lines 127-135)
// Remove statusLabels object (lines 569-624)
```

#### Replace `receiptTotalsFromNotes()`

**Before (lines 988-996):**
```javascript
function receiptTotalsFromNotes(request) {
  const matches = Array.from(String(request.notes || '').matchAll(/\[receipt_totals fuel=([0-9.]+) wash=([0-9.]+)\]/g));
  const latest = matches.at(-1);
  return {
    fuel: latest ? Number(latest[1]) || 0 : 0,
    wash: latest ? Number(latest[2]) || 0 : 0,
  };
}
```

**After:**
```javascript
import { receiptTotalsFromNotes } from '../src/shared/payment-utils.js';

// Remove the old function (lines 988-996)
```

#### Replace `serviceNeedsFuel()` and `serviceNeedsWash()`

**Before (lines 968-974):**
```javascript
function serviceNeedsFuel(request) {
  return String(request.service_type || '').includes('fuel');
}

function serviceNeedsWash(request) {
  return String(request.service_type || '').includes('wash');
}
```

**After:**
```javascript
import { requestNeedsFuel, requestNeedsWash } from '../src/shared/payment-utils.js';

// Remove the old functions (lines 968-974)
// Update all call sites:
//   serviceNeedsFuel(request) → requestNeedsFuel(request)
//   serviceNeedsWash(request) → requestNeedsWash(request)
```

#### Replace `terminalStatuses` and `closedStatuses`

**Before (lines 562-564):**
```javascript
const terminalStatuses = ['completed', 'cancelled'];
const closedStatuses = ['cancelled'];
```

**After:**
```javascript
import { TERMINAL_STATUSES, CLOSED_STATUSES } from '../src/shared/status-utils.js';

// Replace references:
//   terminalStatuses → TERMINAL_STATUSES
//   closedStatuses → CLOSED_STATUSES
```

#### Replace `cancellationOutcomeForStatus()` and `cancellationChargeForTier()`

**Before (lines 1414-1495):**
```javascript
const CANCELLATION_BASE_FEE = 15;
// ... 81 lines of cancellation logic
```

**After:**
```javascript
import { 
  cancellationOutcomeForStatus, 
  cancellationChargeForTier,
  CANCELLATION_BASE_FEE 
} from '../src/shared/payment-utils.js';

// Remove the old functions (lines 1414-1495)
// Remove CANCELLATION_BASE_FEE constant (line 998)
```

#### Replace `escapeHtml()` and `money()`

**Before (lines 645-656):**
```javascript
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&')
    .replaceAll('<', '<')
    .replaceAll('>', '>')
    .replaceAll('"', '"')
    .replaceAll("'", '&#039;');
}

function money(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
}
```

**After:**
```javascript
import { escapeHtml, formatCurrency } from '../src/shared/utils.js';

// Replace all money() calls with formatCurrency()
// Note: You'll need to create src/shared/utils.js first (see Step 4)
```

---

### Step 2: Update worker.js

#### Replace `canonicalBookingStatus()`

Worker.js has its own copy of `canonicalBookingStatus()`. Replace it:

```javascript
import { canonicalBookingStatus } from '../src/shared/status-utils.js';

// Find and remove the worker.js version (around line 2720-2737)
```

#### Replace `receiptTotalsFromNotes()`

```javascript
import { receiptTotalsFromNotes, transactionPricingSummary, finalTotalFromSavedReceipts } from '../src/shared/payment-utils.js';

// Remove worker.js version (around line 688-696 in track.js, similar in worker.js)
// Update imports in worker.js functions:
//   - saveWorkerFinalTotal()
//   - saveWorkerTotalEdit()
//   - workerCompleteValidation()
```

#### Replace `serviceNeedsFuel()` and `serviceNeedsWash()`

```javascript
import { requestNeedsFuel, requestNeedsWash } from '../src/shared/payment-utils.js';

// Update all call sites:
//   serviceNeedsFuel(request) → requestNeedsFuel(request)
//   serviceNeedsWash(request) → requestNeedsWash(request)
```

#### Replace `serviceUnableFeeCharged()`

```javascript
import { serviceUnableFeeCharged } from '../src/shared/payment-utils.js';

// Remove worker.js version and update call sites
```

---

### Step 3: Update track.js

#### Replace `canonicalBookingStatus()`

**Before (lines 99-110):**
```javascript
function canonicalBookingStatus(status) {
  const value = String(status || "new").toLowerCase();
  if (BOOKING_STATUSES.includes(value)) return value;
  // ... 11 more lines
}
```

**After:**
```javascript
import { canonicalBookingStatus } from '../src/shared/status-utils.js';

// Remove the old function (lines 99-110)
// Remove BOOKING_STATUSES (line 97)
```

#### Replace `receiptTotalsFromNotes()`

**Before (lines 688-696):**
```javascript
function receiptTotalsFromNotes(request) {
  const matches = Array.from(String(request.notes || "").matchAll(/\[receipt_totals fuel=([0-9.]+) wash=([0-9.]+)\]/g));
  const latest = matches.at(-1);
  return {
    fuel: latest ? Number(latest[1]) || 0 : 0,
    wash: latest ? Number(latest[2]) || 0 : 0,
  };
}
```

**After:**
```javascript
import { receiptTotalsFromNotes } from '../src/shared/payment-utils.js';

// Remove the old function (lines 688-696)
```

#### Replace `serviceNeedsFuel()` and `serviceNeedsWash()`

**Before (lines 680-686):**
```javascript
function requestNeedsFuel(request) {
  return String(request.service_type || "").includes("fuel");
}

function requestNeedsWash(request) {
  return String(request.service_type || "").includes("wash");
}
```

**After:**
```javascript
import { requestNeedsFuel, requestNeedsWash } from '../src/shared/payment-utils.js';

// Remove the old functions (lines 680-686)
// Update all call sites:
//   requestNeedsFuel(request) → requestNeedsFuel(request)
//   requestNeedsWash(request) → requestNeedsWash(request)
```

#### Replace `transactionPricingSummary()`

**Before (lines 716-750):**
```javascript
function transactionPricingSummary(request, receiptTotals = { fuel: 0, wash: 0 }) {
  // ... 34 lines of pricing logic
}
```

**After:**
```javascript
import { transactionPricingSummary } from '../src/shared/payment-utils.js';

// Remove the old function (lines 716-750)
```

#### Replace `terminalStatuses` and `closedStatuses`

**Before (lines 112-113):**
```javascript
const terminalStatuses = ["completed", "cancelled"];
const closedStatuses = ["cancelled"];
```

**After:**
```javascript
import { TERMINAL_STATUSES, CLOSED_STATUSES } from '../src/shared/status-utils.js';

// Replace references:
//   terminalStatuses → TERMINAL_STATUSES
//   closedStatuses → CLOSED_STATUSES
```

#### Replace `cancellationOutcomeForStatus()` and related constants

**Before (lines 422-476):**
```javascript
const CANCELLATION_BASE_FEE = 15;
// ... 54 lines of cancellation logic
```

**After:**
```javascript
import { 
  cancellationOutcomeForStatus, 
  canCustomerCancel 
} from '../src/shared/payment-utils.js';

// Remove CANCELLATION_BASE_FEE (line 698)
// Remove CANCELLATION_MODAL_COPY (lines 424-429)
// Remove CANCELLATION_MODAL_COPY_SERVICE_STARTED (line 430)
// Remove CANCELLATION_SERVICE_STARTED_STATUSES (lines 433-436)
// Remove CANCELLATION_SERVICE_STARTED_BLOCKED_MSG (line 439)
// Remove CANCELLATION_BLOCKED_MESSAGES (lines 440-462)
// Remove cancellationModalTextForStatus() (lines 464-468)
// Remove canCustomerCancel() (lines 470-476)
```

---

### Step 4: Update booking-flow.js

#### Replace `canonicalBookingStatus()`

Find and remove the booking-flow.js version, then import from shared utils.

#### Replace `receiptTotalsFromNotes()`

```javascript
import { receiptTotalsFromNotes } from '../src/shared/payment-utils.js';
```

#### Replace `serviceNeedsFuel()` and `serviceNeedsWash()`

```javascript
import { requestNeedsFuel, requestNeedsWash } from '../src/shared/payment-utils.js';
```

---

### Step 5: Update api/payments.js

#### Replace `cancellationOutcomeForStatus()` and `cancellationChargeForTier()`

**Before (lines 1414-1495):**
```javascript
const CANCELLATION_BASE_FEE = 15;
// ... 81 lines
```

**After:**
```javascript
import { 
  cancellationOutcomeForStatus, 
  cancellationChargeForTier,
  CANCELLATION_BASE_FEE 
} from '../../src/shared/payment-utils.js';

// Remove the old functions and constant
```

#### Replace `receiptTotalsFromNotes()`

**Before (around line 1525):**
```javascript
const receiptTotals = receiptTotalsFromNotes(request.notes);
```

**After:**
```javascript
import { receiptTotalsFromNotes } from '../../src/shared/payment-utils.js';

// Remove the inline function if it exists
```

---

### Step 6: Create src/shared/utils.js (General Utilities)

Create this file to consolidate common utilities:

```javascript
/**
 * ShiftFuel Shared General Utilities
 */

/**
 * Escape HTML special characters
 * @param {string} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&')
    .replaceAll('<', '<')
    .replaceAll('>', '>')
    .replaceAll('"', '"')
    .replaceAll("'", '&#039;');
}

/**
 * Format currency in USD
 * @param {number} value
 * @returns {string}
 */
export function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value || 0));
}

/**
 * Format phone number as (XXX) XXX-XXXX
 * @param {string} raw - Raw phone digits
 * @returns {string}
 */
export function formatPhone(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === '1') return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  return '';
}

/**
 * Clean phone number to digits only
 * @param {string} value
 * @returns {string}
 */
export function cleanPhone(value) {
  return String(value || '').replace(/\D/g, '');
}

/**
 * Format time as HH:MM AM/PM
 * @param {string} isoOrTime - ISO time string or HH:MM format
 * @returns {string}
 */
export function formatTimeShort(isoOrTime) {
  if (!isoOrTime) return '';
  try {
    const d = new Date(isoOrTime);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch { return ''; }
}

/**
 * Format timestamp for display
 * @param {string} iso - ISO timestamp
 * @returns {string}
 */
export function formatTimestamp(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

/**
 * Convert number input value to number
 * @param {string} value
 * @returns {number}
 */
export function numberFromInput(value) {
  return Number(String(value || '').replace(/[^0-9.\-]/g, '')) || 0;
}
```

---

## Testing Checklist

After migration, verify:

- [ ] All status labels display correctly in admin, worker, and customer portals
- [ ] Cancellation fees match what's shown in the UI
- [ ] Receipt totals parse correctly from notes
- [ ] Photo uploads validate correctly (test with files >5MB, wrong types)
- [ ] No console errors about missing functions
- [ ] All booking flows work end-to-end
- [ ] Worker job actions work correctly
- [ ] Customer tracking page shows correct statuses

## Rollback Plan

If issues arise:

1. Keep old functions in place (don't delete immediately)
2. Comment out imports from shared utils
3. Revert to old functions
4. Debug shared utils independently

## Benefits

After migration:

- **Single source of truth** for status mapping
- **Consistent cancellation logic** across all portals
- **Reduced code duplication** (~500 lines removed)
- **Easier maintenance** - fix bugs once, not 4 times
- **Better testability** - test shared utils in isolation

## Next Steps

1. Migrate admin.js (highest impact, most duplication)
2. Migrate worker.js
3. Migrate track.js
4. Migrate booking-flow.js
5. Migrate api/payments.js
6. Delete old duplicate functions
7. Add unit tests for shared utils