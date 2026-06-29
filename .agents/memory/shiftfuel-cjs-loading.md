---
name: ShiftFuel CJS API loading
description: How the shiftfuel-api CJS modules are loaded at runtime without bundling in the ESM api-server
---

The shiftfuel-api folder at `artifacts/api-server/shiftfuel-api/` contains vanilla CommonJS serverless functions ported from Vercel.

**The rule:** The folder must contain `{"type":"commonjs"}` in its own `package.json`. Without it, Node.js inherits the parent package's `"type": "module"` and `module.exports` throws "module is not defined in ES module scope".

**Why:** esbuild bundles `src/` into an ESM output (`dist/index.mjs`). The shiftfuel-api CJS files must NOT be bundled — they must be loaded at runtime via `createRequire`. The `package.json` override forces Node to treat them as CJS regardless of the parent package type.

**How to apply:** 
- `artifacts/api-server/src/routes/shiftfuel.ts` loads them using `createRequire(import.meta.url)` and `path.resolve(_dirname, "..", "shiftfuel-api")` (from `dist/` up to artifact root).
- The esbuild build does NOT need to copy or externalize these files — they live at the root alongside `dist/`.
- Any new CJS modules added to shiftfuel-api automatically work; no build changes needed.
- For production deployment, ensure the shiftfuel-api folder is included alongside dist/ in the deployed artifact.
