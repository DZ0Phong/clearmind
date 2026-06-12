"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const ASSETS_DIR = path.join(__dirname, "assets");
const PNG_FILE = path.join(ASSETS_DIR, "icon.png");
const ICO_FILE = path.join(ASSETS_DIR, "icon.ico");

// Indigo brand color from public/favicon.svg gradient mid-stop.
const BG = { r: 0x63, g: 0x66, b: 0xf1, a: 0xff };
const FG = { r: 0xff, g: 0xff, b: 0xff, a: 0xff };

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

function drawIcon(size) {
  const radius = Math.max(2, Math.round(size * 7 / 32));
  const star = starPoints(size);
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const cx = x + 0.5, cy = y + 0.5;
      if (!isInRoundedRect(cx, cy, size, size, radius)) {
        pixels[i] = 0; pixels[i + 1] = 0; pixels[i + 2] = 0; pixels[i + 3] = 0;
        continue;
      }
      if (isInPolygon(cx, cy, star)) {
        pixels[i] = FG.r; pixels[i + 1] = FG.g; pixels[i + 2] = FG.b; pixels[i + 3] = FG.a;
      } else {
        pixels[i] = BG.r; pixels[i + 1] = BG.g; pixels[i + 2] = BG.b; pixels[i + 3] = BG.a;
      }
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

module.exports = { ensureIcons, readIconBase64, drawIcon, buildIco, ICO_FILE, PNG_FILE };
