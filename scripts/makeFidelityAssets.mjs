/**
 * Builds the images used by the visual-fidelity fixture.
 *
 * Generated rather than downloaded, for the same reason as the font: the
 * fixture has to render identically on any machine, with no network. Each
 * image is a deterministic pattern, chosen so a misplaced or wrongly scaled
 * one is obvious in a screenshot instead of merging into the background.
 *
 *   node scripts/makeFidelityAssets.mjs
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let c = index;
  for (let bit = 0; bit < 8; bit += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Encodes RGB pixels as a PNG. `paint(x, y)` returns [r, g, b]. */
function png(width, height, paint) {
  const raw = Buffer.alloc(height * (1 + width * 3));
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0; // filter: none, so the bytes stay inspectable
    offset += 1;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint(x, y);
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      offset += 3;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const mix = (a, b, t) => Math.round(a + (b - a) * Math.min(1, Math.max(0, t)));

/** Diagonal stripes over a vertical gradient: scale and crop are both visible. */
const striped = (from, to, stripe) => (x, y) => {
  const t = y / 420;
  const base = [mix(from[0], to[0], t), mix(from[1], to[1], t), mix(from[2], to[2], t)];
  if ((x + y) % 64 < 10) return stripe;
  // A ring every 120px, so object-fit cropping shows up as a cut circle.
  const dx = x - 400;
  const dy = y - 210;
  const radius = Math.sqrt(dx * dx + dy * dy);
  if (Math.abs(radius - 150) < 4) return stripe;
  return base;
};

const targets = [
  {
    name: 'hero-las.png',
    width: 800,
    height: 420,
    paint: striped([28, 64, 48], [120, 158, 112], [238, 230, 210]),
  },
  {
    name: 'domek.png',
    width: 640,
    height: 420,
    paint: striped([74, 52, 36], [196, 160, 112], [252, 248, 238]),
  },
  {
    name: 'wnetrze.png',
    width: 640,
    height: 420,
    paint: striped([40, 40, 62], [150, 140, 180], [250, 244, 232]),
  },
  {
    name: 'tlo-lesne.png',
    width: 480,
    height: 480,
    // A coarse checker for the CSS background, so a lost background-size or
    // background-position shifts the pattern visibly.
    paint: (x, y) =>
      (Math.floor(x / 60) + Math.floor(y / 60)) % 2 === 0 ? [22, 50, 38] : [32, 70, 52],
  },
];

const directory = resolve(import.meta.dirname, '../e2e/fixtures/fidelity/assets/images');
mkdirSync(directory, { recursive: true });

targets.forEach(({ name, width, height, paint }) => {
  const data = png(width, height, paint);
  writeFileSync(resolve(directory, name), data);
  console.log(`wrote ${name} (${width}×${height}, ${data.length} bytes)`);
});

// An SVG referenced through <img src>, which the converter has to collect as
// an asset rather than treat as markup to rewrite.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120" role="img" aria-label="Znak trzech drzew">
  <circle cx="60" cy="60" r="56" fill="none" stroke="#ad4d31" stroke-width="4"/>
  <path d="M60 18 L84 70 H36 Z" fill="#193b2c"/>
  <path d="M60 44 L94 96 H26 Z" fill="#42624c"/>
  <rect x="56" y="92" width="8" height="18" fill="#ad4d31"/>
</svg>
`;
writeFileSync(resolve(directory, 'znak.svg'), svg, 'utf8');
console.log('wrote znak.svg');
