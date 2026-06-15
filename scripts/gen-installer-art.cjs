"use strict";
// Generates the NSIS installer wizard images (header + sidebar) in the
// Clearmind brand — the diagonal indigo gradient + a white 8-point star,
// same mark as the app icon / favicon / tray (see cli/icon.js). Outputs
// uncompressed 24-bit BMPs (what NSIS expects) to src-tauri/installer/.
// Regenerate:  node scripts/gen-installer-art.cjs
const fs = require("node:fs");
const path = require("node:path");

const GRAD = [
  { t: 0.0, r: 0xa5, g: 0xb4, b: 0xfc },
  { t: 0.55, r: 0x63, g: 0x66, b: 0xf1 },
  { t: 1.0, r: 0x37, g: 0x30, b: 0xa3 },
];
const lerp = (a, b, t) => Math.round(a + (b - a) * t);
function grad(t) {
  if (t <= GRAD[0].t) return GRAD[0];
  const last = GRAD[GRAD.length - 1];
  if (t >= last.t) return last;
  for (let i = 1; i < GRAD.length; i++) {
    if (t <= GRAD[i].t) {
      const a = GRAD[i - 1], b = GRAD[i], f = (t - a.t) / (b.t - a.t);
      return { r: lerp(a.r, b.r, f), g: lerp(a.g, b.g, f), b: lerp(a.b, b.b, f) };
    }
  }
  return last;
}
function starPoly(cx, cy, outerR, innerR) {
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 4;
    const rad = i % 2 === 0 ? outerR : innerR;
    pts.push([cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)]);
  }
  return pts;
}
function inPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (((yi > py) !== (yj > py)) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}
function render(W, H, scx, scy, sr) {
  const px = Buffer.alloc(W * H * 3); // RGB
  const star = starPoly(scx, scy, sr, sr * 0.4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      if (inPoly(x + 0.5, y + 0.5, star)) {
        px[i] = 255; px[i + 1] = 255; px[i + 2] = 255;
      } else {
        const c = grad((x + y) / (W + H - 2));
        px[i] = c.r; px[i + 1] = c.g; px[i + 2] = c.b;
      }
    }
  }
  return px;
}
function bmp(W, H, rgb) {
  const rowSize = Math.floor((24 * W + 31) / 32) * 4; // padded to 4 bytes
  const buf = Buffer.alloc(54 + rowSize * H);
  buf.write("BM", 0);
  buf.writeUInt32LE(buf.length, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(W, 18);
  buf.writeInt32LE(H, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  for (let row = 0; row < H; row++) {
    const y = H - 1 - row; // BMP rows are bottom-up
    let p = 54 + row * rowSize;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      buf[p++] = rgb[i + 2]; // B
      buf[p++] = rgb[i + 1]; // G
      buf[p++] = rgb[i];     // R
    }
  }
  return buf;
}

const dir = path.join(__dirname, "..", "src-tauri", "installer");
fs.mkdirSync(dir, { recursive: true });
// Welcome/finish sidebar (164x314): big star in the upper third.
fs.writeFileSync(path.join(dir, "sidebar.bmp"), bmp(164, 314, render(164, 314, 82, 104, 54)));
// Top banner header (150x57): small star on the right.
fs.writeFileSync(path.join(dir, "header.bmp"), bmp(150, 57, render(150, 57, 124, 28, 19)));
console.log("wrote src-tauri/installer/{sidebar,header}.bmp");
