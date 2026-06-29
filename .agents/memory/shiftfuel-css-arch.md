---
name: ShiftFuel CSS architecture
description: Load order and role of each CSS file in the ShiftFuel public/ folder.
---

## CSS load order (each page loads what it needs, in this order)

1. `styles.css` — design tokens + base components
2. `layout-width-polish.css` — desktop width constraints
3. `track-redesign.css` / `worker-app.css` / `admin-dashboard-polish.css` — per-portal overrides
4. `mobile-polish.css` — shared phone fixes (breakpoint ≤ 760px)
5. `mobile-ux.css` — **final override layer** for mobile UX improvements, loaded last

**Why:** mobile-ux.css uses `!important` extensively because it must override specificity from earlier files. It is purely presentational (no JS, auth, DB, or payment logic). Always load it last.

**How to apply:** When adding phone-specific improvements, add rules to mobile-ux.css under `body.{page-class}` selectors so they stay scoped.
