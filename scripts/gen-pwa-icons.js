// Build-time helper: rasterize the role brand SVGs into the PNG icon sets the PWA
// manifests reference. iOS ignores SVG for home-screen icons, so worker/admin need
// real PNGs to show a distinct installed-app icon.
//
// The customer PNGs (pwa-icon-192/512.png, apple-touch-icon.png) already exist and
// are not regenerated here.
//
// Run (sharp is a build-only dep, intentionally not in package.json):
//   npm install --no-save sharp
//   node scripts/gen-pwa-icons.js
//
// Outputs to the repo root:
//   pwa-icon-worker-192.png  pwa-icon-worker-512.png  apple-touch-icon-worker.png
//   pwa-icon-admin-192.png   pwa-icon-admin-512.png   apple-touch-icon-admin.png

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const REPO = path.resolve(__dirname, '..');
const roles = [
  { role: 'worker', svg: 'icon-worker.svg', bg: '#0b3d5c' },
  { role: 'admin', svg: 'icon-admin.svg', bg: '#1a1f3d' },
];
const hex = (h) => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16), alpha: 1 });

(async () => {
  for (const { role, svg, bg } of roles) {
    const buf = fs.readFileSync(path.join(REPO, svg));
    const bgc = hex(bg);
    const outs = [
      [`pwa-icon-${role}-512.png`, 512],
      [`pwa-icon-${role}-192.png`, 192],
      [`apple-touch-icon-${role}.png`, 180], // iOS home-screen icon (opaque; iOS masks corners)
    ];
    for (const [name, size] of outs) {
      // Flatten onto the brand colour so there are NO transparent corners — safe for
      // both Android maskable icons and iOS apple-touch icons.
      await sharp(buf, { density: 384 })
        .resize(size, size, { fit: 'contain', background: bgc })
        .flatten({ background: bgc })
        .png({ compressionLevel: 9 })
        .toFile(path.join(REPO, name));
      console.log(`wrote ${name} (${size}px)`);
    }
  }
  console.log('done');
})().catch((e) => { console.error(e); process.exit(1); });
