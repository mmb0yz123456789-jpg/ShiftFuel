# App Organization Placeholder

This folder is reserved for a future frontend organization pass. No runtime files
have been moved here yet.

Current app behavior still depends on the root-level static HTML, CSS, and JS
files. Do not move those files into this folder until the matching HTML script
paths, stylesheet paths, asset paths, service worker paths, and Vercel rewrites
are updated and tested together.

Proposed future grouping:

- `pages/` - landing, legal, hiring, and general public pages
- `booking/` - booking flow UI and helpers
- `customer/` - account, returning customer, saved vehicle/address UI
- `tracking/` - vehicle tracking UI and live location scripts
- `admin/` - admin portal pages, scripts, and styles
- `worker/` - worker portal pages, scripts, and styles
- `shared/` - shared browser utilities, assets, icons, and styles

