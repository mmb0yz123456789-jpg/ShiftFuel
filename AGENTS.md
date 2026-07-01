# Repository Guidelines

## Project Structure & Module Organization

ShiftFuel is a static frontend with Vercel serverless APIs, Supabase migrations, and Stripe/Supabase integrations. Runtime pages and assets currently live at the repository root, including `index.html`, `book.html`, `track.html`, `worker.html`, `admin.html`, companion `.js` files, and shared CSS such as `styles.css`, `mobile-polish.css`, and `worker-app.css`. Keep these paths stable unless HTML references, service worker paths, and Vercel rewrites are updated together.

Serverless functions are in `api/`. Shared browser utilities are in `src/shared/`. Supabase migrations belong in `supabase/migrations/`; `archive/sql/` and `supabase/shared/legacy-patches/` are historical references. The `app/` directory contains planning READMEs, not active runtime files.

## Build, Test, and Development Commands

- `npm install`: install JavaScript dependencies.
- `node tests/route-leg.test.js`: run the current Node assertion test for route-leg behavior.
- `npm run test:e2e`: run Playwright end-to-end tests when a Playwright config is present.
- `npm run test:e2e:desktop`: run the desktop Chrome Playwright project.
- `npm run test:e2e:mobile`: run mobile Chrome and mobile Safari Playwright projects.

This project has no separate build step; Vercel serves static files and functions directly.

## Coding Style & Naming Conventions

Use plain JavaScript, HTML, and CSS consistent with the existing files. Prefer `const`/`let`, descriptive camelCase names for variables and functions, and kebab-case filenames for pages, stylesheets, and small modules such as `route-leg.js` or `track-live-location.js`. Keep indentation at two spaces in JSON and align with the surrounding style in HTML, CSS, and JS. There is no configured formatter or linter, so keep edits focused and avoid unrelated churn in large root files.

## Testing Guidelines

Place focused tests under `tests/` using `*.test.js` naming. The current unit-style test uses Node's built-in `assert` module. For UI changes, run the relevant Playwright command if configuration is available, and manually verify the affected page flow when tests do not cover it. Add or update tests when changing shared routing, payment, status, booking, admin, or worker behavior.

## Commit & Pull Request Guidelines

Recent commits use short release-style subjects such as `DEV 0.6`. Keep commit messages concise and outcome-oriented. Pull requests should include a brief summary, impacted pages or APIs, test results, linked issue or task context when available, and screenshots or recordings for visible UI changes.

## Security & Configuration Tips

Do not commit `.env*`, `.vercel/`, service keys, Stripe secrets, or production Supabase credentials. Database changes should be added as timestamped files in `supabase/migrations/`, not as root-level SQL patches.
