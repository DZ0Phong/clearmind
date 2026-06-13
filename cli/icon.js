"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const ASSETS_DIR = path.join(__dirname, "assets");
const PNG_FILE = path.join(ASSETS_DIR, "icon.png");
// Larger PNG for Windows toast notifications. ToastImageAndText02 (the old
// template) crops to a small circle; ToastGeneric appLogoOverride can show
// the full icon up to 256×256 pixels. The crisp big version lives here.
const PNG_LARGE_FILE = path.join(ASSETS_DIR, "icon-256.png");
const ICO_FILE = path.join(ASSETS_DIR, "icon.ico");

// Diagonal 3-stop gradient — pulled verbatim from public/favicon.svg so
// the tray icon and the favicon look identical. Earlier the tray was a
// flat #6366f1 indigo block; users complained it "looked basic / dead"
// next to the colorful favicons in Windows 11 taskbar. The gradient adds
// real depth + halftone variety at 16×16 without busting recognizability.
//
// Stops (in SVG order): #a5b4fc indigo-300 (TL bright), #6366f1 indigo-500
// (midbody), #3730a3 indigo-800 (BR deep). Linear from top-left → bottom-
// right; we sample by `(x+y) / (W+H)` so it scales to any output size.
const GRAD = [
  { t: 0.0, r: 0xa5, g: 0xb4, b: 0xfc },
  { t: 0.55, r: 0x63, g: 0x66, b: 0xf1 },
  { t: 1.0, r: 0x37, g: 0x30, b: 0xa3 },
];
const FG = { r: 0xff, g: 0xff, b: 0xff, a: 0xff };

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function sampleGrad(t) {
  // Three-stop piecewise linear interpolation along the gradient.
  if (t <= GRAD[0].t) return { r: GRAD[0].r, g: GRAD[0].g, b: GRAD[0].b };
  if (t >= GRAD[GRAD.length - 1].t)
    return {
      r: GRAD[GRAD.length - 1].r,
      g: GRAD[GRAD.length - 1].g,
      b: GRAD[GRAD.length - 1].b,
    };
  for (let i = 1; i < GRAD.length; i++) {
    if (t <= GRAD[i].t) {
      const a = GRAD[i - 1];
      const b = GRAD[i];
      const f = (t - a.t) / (b.t - a.t);
      return { r: lerp(a.r, b.r, f), g: lerp(a.g, b.g, f), b: lerp(a.b, b.b, f) };
    }
  }
  return { r: GRAD[GRAD.length - 1].r, g: GRAD[GRAD.length - 1].g, b: GRAD[GRAD.length - 1].b };
}

// --- PNG plumbing ---

let crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let v = 0xffffffff;
  for (let i = 0; i < buf.length; i++) v = crcTable[(v ^ buf[i]) & 0xff] ^ (v >>> 8);
  return (v ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, c]);
}

function encodePng(W, H, pixels) {
  const stride = 1 + W * 4;
  const raw = Buffer.alloc(H * stride);
  for (let y = 0; y < H; y++) {
    raw[y * stride] = 0; // filter: none
    for (let x = 0; x < W; x++) {
      const src = (y * W + x) * 4;
      const dst = y * stride + 1 + x * 4;
      raw[dst]     = pixels[src];
      raw[dst + 1] = pixels[src + 1];
      raw[dst + 2] = pixels[src + 2];
      raw[dst + 3] = pixels[src + 3];
    }
  }
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(W, 0);
  ihdrData.writeUInt32BE(H, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 6;  // color type RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdrData),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- Geometry ---

function isInRoundedRect(x, y, W, H, radius) {
  if (x < 0 || y < 0 || x >= W || y >= H) return false;
  // Corner zones
  if (x < radius && y < radius) {
    return Math.hypot(radius - x, radius - y) <= radius;
  }
  if (x >= W - radius && y < radius) {
    return Math.hypot(x - (W - radius), radius - y) <= radius;
  }
  if (x < radius && y >= H - radius) {
    return Math.hypot(radius - x, y - (H - radius)) <= radius;
  }
  if (x >= W - radius && y >= H - radius) {
    return Math.hypot(x - (W - radius), y - (H - radius)) <= radius;
  }
  return true;
}

function isInPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersect = ((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function starPoints(size) {
  const cx = size / 2;
  const cy = size / 2;
  // Ratios picked from public/favicon.svg:
  //   outer top (16, 4)         → distance = 12 / 32 = 0.375 of size
  //   inner upper-right (18.4, 13.6) → sqrt(2.4² + 2.4²) / 32 ≈ 0.106
  // The original star is bolder than a pure ratio (the SVG arms are
  // visible), so we bump the inner radius a touch to keep the cross-shape
  // legible at 16 px.
  const outerR = size * 0.42;
  const innerR = size * 0.16;
  const points = [];
  for (let i = 0; i < 8; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI / 4);
    const rad = i % 2 === 0 ? outerR : innerR;
    points.push([cx + rad * Math.cos(angle), cy + rad * Math.sin(angle)]);
  }
  return points;
}

// Two small "sparkle" satellites positioned in the dim quadrants of the
// gradient so they catch the eye without crowding the central star.
// Placed at ~75% of half-diagonal — close enough to read as one cluster.
function sparklePoints(size) {
  // BR satellite (in deep indigo zone) — small 4-point.
  const br = { cx: size * 0.78, cy: size * 0.78, r: size * 0.08 };
  // TL satellite (in light indigo zone) — even smaller dot.
  const tl = { cx: size * 0.24, cy: size * 0.24, r: size * 0.05 };
  return [br, tl];
}

function isInSparkle(x, y, sp) {
  // Diamond rather than circle — sparkles read crisper at low res because
  // diamonds align with the pixel grid on the cardinal axes.
  const dx = Math.abs(x - sp.cx);
  const dy = Math.abs(y - sp.cy);
  return dx + dy <= sp.r;
}

function drawIcon(size) {
  const radius = Math.max(2, Math.round((size * 7) / 32));
  const star = starPoints(size);
  const sparkles = sparklePoints(size);
  // Highlight band — 1 row tall at the very top inside the rounded rect,
  // tinted slightly lighter than the gradient top stop. Gives the icon a
  // "glass" sheen at 32+ px without affecting the silhouette at 16 px.
  const highlightAtY = Math.max(1, Math.round(size * 0.04));
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const cx = x + 0.5,
        cy = y + 0.5;
      if (!isInRoundedRect(cx, cy, size, size, radius)) {
        pixels[i] = 0;
        pixels[i + 1] = 0;
        pixels[i + 2] = 0;
        pixels[i + 3] = 0;
        continue;
      }

      // Star always wins — it's the primary mark.
      if (isInPolygon(cx, cy, star)) {
        pixels[i] = FG.r;
        pixels[i + 1] = FG.g;
        pixels[i + 2] = FG.b;
        pixels[i + 3] = FG.a;
        continue;
      }

      // Sparkles next — pure white, soft accent in dim quadrants.
      let isSparkle = false;
      for (const sp of sparkles) {
        if (isInSparkle(cx, cy, sp)) {
          isSparkle = true;
          break;
        }
      }
      if (isSparkle) {
        // 85% opacity so they read as secondary, not co-equal with the star.
        pixels[i] = 0xff;
        pixels[i + 1] = 0xff;
        pixels[i + 2] = 0xff;
        pixels[i + 3] = 0xd9;
        continue;
      }

      // Body — diagonal 3-stop gradient sampled by (x+y)/(W+H).
      const t = (x + y) / (size + size - 2);
      const c = sampleGrad(t);
      let r = c.r,
        g = c.g,
        b = c.b;

      // Top-edge highlight — mix in 25% white on the very first row inside
      // the rounded rect. Adds the "glass dome" feel users associate with
      // polished app icons. Skipped at 16 px because a 1-row band swallows
      // half the readable area; preserved at 32 px and up.
      if (size >= 24 && y <= highlightAtY) {
        r = Math.min(255, r + Math.round((255 - r) * 0.3));
        g = Math.min(255, g + Math.round((255 - g) * 0.3));
        b = Math.min(255, b + Math.round((255 - b) * 0.3));
      }

      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      pixels[i + 3] = 0xff;
    }
  }
  return encodePng(size, size, pixels);
}

// --- ICO container (multi-size) ---

function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  const entries = [];
  let offset = 6 + images.length * 16;
  for (const img of images) {
    const e = Buffer.alloc(16);
    e[0] = img.size === 256 ? 0 : img.size;  // width
    e[1] = img.size === 256 ? 0 : img.size;  // height
    e[2] = 0;                                // palette
    e[3] = 0;                                // reserved
    e.writeUInt16LE(1, 4);                   // color planes
    e.writeUInt16LE(32, 6);                  // bpp
    e.writeUInt32LE(img.png.length, 8);      // image size
    e.writeUInt32LE(offset, 12);             // image offset
    entries.push(e);
    offset += img.png.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

function ensureIcons({ force = false } = {}) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
  if (force || !fs.existsSync(PNG_FILE)) {
    fs.writeFileSync(PNG_FILE, drawIcon(32));
  }
  if (force || !fs.existsSync(PNG_LARGE_FILE)) {
    fs.writeFileSync(PNG_LARGE_FILE, drawIcon(256));
  }
  if (force || !fs.existsSync(ICO_FILE)) {
    fs.writeFileSync(ICO_FILE, buildIco([
      { size: 16, png: drawIcon(16) },
      { size: 32, png: drawIcon(32) },
    ]));
  }
}

function readIconBase64() {
  ensureIcons();
  if (process.platform === "win32") {
    return fs.readFileSync(ICO_FILE).toString("base64");
  }
  return fs.readFileSync(PNG_FILE).toString("base64");
}

module.exports = {
  ensureIcons,
  readIconBase64,
  drawIcon,
  buildIco,
  ICO_FILE,
  PNG_FILE,
  PNG_LARGE_FILE,
};
