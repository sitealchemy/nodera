/**
 * Builds the custom font used by the visual-fidelity fixture.
 *
 * The fixture has to be repeatable and offline: the real Manus page pulls its
 * typefaces from Google Fonts, and a comparison that depends on a CDN is a
 * comparison that fails for reasons unrelated to the conversion. So the
 * fixture ships a font of its own.
 *
 * It is a deliberately minimal TrueType file — every printable ASCII
 * character maps to the same filled rectangle, with a distinctive advance
 * width. That makes it obvious at a glance whether the face actually loaded:
 * if it did, the text is a row of blocks; if it fell back, it is letters.
 *
 *   node scripts/makeFidelityFont.mjs
 *
 * Committed output: e2e/fixtures/fidelity/assets/fonts/nodera-blocks.ttf
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const UNITS_PER_EM = 1000;
const ADVANCE = 760; // Wide on purpose, so a fallback measures differently.
const ASCENDER = 800;
const DESCENDER = -200;

const FIRST_CHAR = 0x20;
const LAST_CHAR = 0x7e;
/** Glyph 0 is .notdef; printable ASCII occupies 1..n. */
const NUM_GLYPHS = LAST_CHAR - FIRST_CHAR + 2;

const u8 = (value) => {
  const b = Buffer.alloc(1);
  b.writeUInt8(value);
  return b;
};
const u16 = (value) => {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(value & 0xffff);
  return b;
};
const i16 = (value) => {
  const b = Buffer.alloc(2);
  b.writeInt16BE(value);
  return b;
};
const u32 = (value) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(value >>> 0);
  return b;
};
const cat = (...parts) => Buffer.concat(parts);
const pad4 = (buffer) =>
  buffer.length % 4 === 0 ? buffer : cat(buffer, Buffer.alloc(4 - (buffer.length % 4)));

/** A single filled rectangle, as one closed contour of four on-curve points. */
function rectangleGlyph() {
  const xs = [90, 90, ADVANCE - 90, ADVANCE - 90];
  const ys = [0, ASCENDER - 60, ASCENDER - 60, 0];

  const header = cat(
    i16(1), // numberOfContours
    i16(Math.min(...xs)),
    i16(Math.min(...ys)),
    i16(Math.max(...xs)),
    i16(Math.max(...ys)),
  );
  const contours = u16(xs.length - 1);
  const instructions = u16(0);
  // 0x01 = on-curve. No short-vector flags, so every delta is a signed int16.
  const flags = cat(...xs.map(() => u8(0x01)));

  let previousX = 0;
  const xCoords = cat(
    ...xs.map((x) => {
      const delta = x - previousX;
      previousX = x;
      return i16(delta);
    }),
  );
  let previousY = 0;
  const yCoords = cat(
    ...ys.map((y) => {
      const delta = y - previousY;
      previousY = y;
      return i16(delta);
    }),
  );

  return pad4(cat(header, contours, instructions, flags, xCoords, yCoords));
}

function buildGlyfAndLoca() {
  const glyph = rectangleGlyph();
  const offsets = [0];
  const parts = [];

  // .notdef is empty: two equal offsets, no data.
  for (let index = 1; index < NUM_GLYPHS; index += 1) {
    parts.push(glyph);
    offsets.push(offsets[offsets.length - 1] + glyph.length);
  }
  // loca holds numGlyphs + 1 offsets; the first is .notdef's zero-length entry.
  const locaOffsets = [0, ...offsets];

  return {
    glyf: parts.length > 0 ? cat(...parts) : Buffer.alloc(0),
    loca: cat(...locaOffsets.map(u32)),
  };
}

/**
 * cmap format 4 with one contiguous ASCII segment.
 *
 * Every character gets its own glyph index (char - 0x20 + 1) so a single
 * idDelta covers the whole range; all those glyphs happen to hold identical
 * outlines, which keeps the file small without needing a glyphIdArray.
 */
function buildCmap() {
  const segments = [
    { start: FIRST_CHAR, end: LAST_CHAR, delta: (1 - FIRST_CHAR) & 0xffff },
    { start: 0xffff, end: 0xffff, delta: 1 },
  ];
  const segCount = segments.length;
  const searchRange = 2 * 2 ** Math.floor(Math.log2(segCount));

  const subtable = cat(
    u16(4), // format
    u16(16 + segCount * 8), // length
    u16(0), // language
    u16(segCount * 2),
    u16(searchRange),
    u16(Math.log2(searchRange / 2)),
    u16(segCount * 2 - searchRange),
    ...segments.map((segment) => u16(segment.end)),
    u16(0), // reservedPad
    ...segments.map((segment) => u16(segment.start)),
    ...segments.map((segment) => u16(segment.delta)),
    ...segments.map(() => u16(0)), // idRangeOffset
  );

  return cat(
    u16(0), // version
    u16(1), // numTables
    u16(3), // platformID: Windows
    u16(1), // encodingID: Unicode BMP
    u32(12), // offset to the subtable
    subtable,
  );
}

function buildName() {
  const strings = [
    [1, 'Nodera Blocks'],
    [2, 'Regular'],
    [3, 'Nodera Blocks fidelity fixture'],
    [4, 'Nodera Blocks'],
    [5, 'Version 1.000'],
    [6, 'NoderaBlocks-Regular'],
  ];

  let offset = 0;
  const records = [];
  const data = [];
  strings.forEach(([nameId, text]) => {
    const encoded = Buffer.from(text, 'utf16le').swap16();
    records.push(
      cat(
        u16(3), // platformID: Windows
        u16(1), // encodingID: Unicode BMP
        u16(0x0409), // language: en-US
        u16(nameId),
        u16(encoded.length),
        u16(offset),
      ),
    );
    data.push(encoded);
    offset += encoded.length;
  });

  return cat(
    u16(0), // format
    u16(records.length),
    u16(6 + records.length * 12), // stringOffset
    ...records,
    ...data,
  );
}

function buildOs2() {
  return cat(
    u16(4), // version
    i16(ADVANCE), // xAvgCharWidth
    u16(400), // usWeightClass
    u16(5), // usWidthClass
    u16(0), // fsType: installable
    i16(650), i16(700), i16(0), i16(140), // subscript
    i16(650), i16(700), i16(0), i16(480), // superscript
    i16(50), i16(300), // strikeout
    i16(0), // sFamilyClass
    Buffer.from([2, 0, 5, 0, 0, 0, 0, 0, 0, 0]), // panose
    u32(1), u32(0), u32(0), u32(0), // ulUnicodeRange 1..4
    Buffer.from('NDRA', 'ascii'), // achVendID
    u16(0x0040), // fsSelection: regular
    u16(FIRST_CHAR),
    u16(LAST_CHAR),
    i16(ASCENDER), i16(DESCENDER), i16(0), // sTypo*
    u16(ASCENDER), u16(-DESCENDER), // usWin*
    u32(1), u32(0), // ulCodePageRange 1..2
    i16(500), i16(ASCENDER - 60), // sxHeight, sCapHeight
    u16(0), u16(FIRST_CHAR), u16(1), // usDefaultChar, usBreakChar, usMaxContext
  );
}

function buildHead() {
  return cat(
    u32(0x00010000), // version
    u32(0x00010000), // fontRevision
    u32(0), // checkSumAdjustment, filled in once the file is assembled
    u32(0x5f0f3cf5), // magicNumber
    u16(0x000b), // flags
    u16(UNITS_PER_EM),
    u32(0), u32(0), // created
    u32(0), u32(0), // modified
    i16(90), i16(0), i16(ADVANCE - 90), i16(ASCENDER - 60), // bounding box
    u16(0), // macStyle
    u16(8), // lowestRecPPEM
    i16(2), // fontDirectionHint
    i16(1), // indexToLocFormat: long
    i16(0), // glyphDataFormat
  );
}

function buildHhea() {
  return cat(
    u32(0x00010000), // version
    i16(ASCENDER),
    i16(DESCENDER),
    i16(90), // lineGap
    u16(ADVANCE), // advanceWidthMax
    i16(90), // minLeftSideBearing
    i16(90), // minRightSideBearing
    i16(ADVANCE - 90), // xMaxExtent
    i16(1), i16(0), i16(0), // caret
    i16(0), i16(0), i16(0), i16(0), // reserved
    i16(0), // metricDataFormat
    u16(NUM_GLYPHS), // numberOfHMetrics
  );
}

function buildMaxp() {
  return cat(
    u32(0x00010000), // version
    u16(NUM_GLYPHS),
    u16(4), // maxPoints
    u16(1), // maxContours
    u16(0), u16(0), // composite
    u16(2), // maxZones
    u16(0), u16(0), u16(0), u16(0), u16(0), u16(0), u16(0), u16(0), u16(0),
  );
}

const buildHmtx = () =>
  cat(...Array.from({ length: NUM_GLYPHS }, () => cat(u16(ADVANCE), i16(90))));
const buildPost = () =>
  cat(u32(0x00030000), u32(0), i16(0), i16(0), u32(0), u32(0), u32(0), u32(0), u32(0));

/** The sfnt checksum: the sum of every uint32, modulo 2^32. */
function checksum(buffer) {
  const padded = pad4(buffer);
  let sum = 0;
  for (let offset = 0; offset < padded.length; offset += 4) {
    sum = (sum + padded.readUInt32BE(offset)) >>> 0;
  }
  return sum;
}

function assemble(tables) {
  // The table directory is sorted by tag; the data that follows need not be.
  const entries = [...tables].sort((a, b) => (a.tag < b.tag ? -1 : 1));
  const numTables = entries.length;
  const searchRange = 16 * 2 ** Math.floor(Math.log2(numTables));

  const header = cat(
    u32(0x00010000),
    u16(numTables),
    u16(searchRange),
    u16(Math.log2(searchRange / 16)),
    u16(numTables * 16 - searchRange),
  );

  let offset = header.length + numTables * 16;
  const directory = [];
  const body = [];
  entries.forEach((table) => {
    const padded = pad4(table.data);
    directory.push(
      cat(Buffer.from(table.tag, 'ascii'), u32(checksum(table.data)), u32(offset), u32(table.data.length)),
    );
    body.push(padded);
    offset += padded.length;
  });

  const file = cat(header, ...directory, ...body);

  // head.checkSumAdjustment makes the whole file sum to a fixed magic value,
  // which is how a reader tells a complete font from a truncated one.
  const headEntry = entries.findIndex((table) => table.tag === 'head');
  const headOffset = file.readUInt32BE(header.length + headEntry * 16 + 8);
  file.writeUInt32BE((0xb1b0afba - checksum(file)) >>> 0, headOffset + 8);
  return file;
}

const { glyf, loca } = buildGlyfAndLoca();
const font = assemble([
  { tag: 'OS/2', data: buildOs2() },
  { tag: 'cmap', data: buildCmap() },
  { tag: 'glyf', data: glyf },
  { tag: 'head', data: buildHead() },
  { tag: 'hhea', data: buildHhea() },
  { tag: 'hmtx', data: buildHmtx() },
  { tag: 'loca', data: loca },
  { tag: 'maxp', data: buildMaxp() },
  { tag: 'name', data: buildName() },
  { tag: 'post', data: buildPost() },
]);

const target = resolve(
  import.meta.dirname,
  '../e2e/fixtures/fidelity/assets/fonts/nodera-blocks.ttf',
);
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, font);
console.log(`wrote ${target} (${font.length} bytes, ${NUM_GLYPHS} glyphs)`);
