import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Indexed PNG, stored DEFLATE: deterministic, no image libraries required.
// Each grid cell is 8 pixels. Rectangles use exclusive right/bottom edges.
function u32(n) { return [n >>> 24, n >>> 16 & 255, n >>> 8 & 255, n & 255]; }
function chunk(type, bytes) {
  const body = [...Array.from(type, c => c.charCodeAt(0)), ...bytes];
  let crc = 0xffffffff;
  for (const b of body) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return [...u32(bytes.length), ...body, ...u32((crc ^ 0xffffffff) >>> 0)];
}
const palette = [
  [0, 0, 0], [43, 53, 61], [180, 190, 194], [223, 208, 162],
  [123, 74, 48], [52, 123, 88], [199, 129, 52], [61, 112, 163],
  [108, 148, 185], [225, 230, 226], [193, 72, 51], [104, 113, 119]
];
function canvas(w, h) {
  const pixels = new Uint8Array(w * h);
  function rect(x0, y0, x1, y1, c) {
    for (let y = Math.max(0, y0); y < Math.min(h, y1); y++)
      for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) pixels[y * w + x] = c;
  }
  function disc(cx, cy, r, c) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) pixels[y * w + x] = c;
  }
  function pin(x, y, first = false) {
    disc(x * 8 + 4, y * 8 + 4, 2, 2);
    rect(x * 8 + 4, y * 8 + 4, x * 8 + 5, y * 8 + 5, first ? 10 : 1);
  }
  function png() {
    const rows = [];
    for (let y = 0; y < h; y++) rows.push(0, ...pixels.subarray(y * w, (y + 1) * w));
    let a = 1, b = 0;
    for (const byte of rows) { a = (a + byte) % 65521; b = (b + a) % 65521; }
    const n = rows.length;
    const z = [0x78, 0x01, 1, n & 255, n >>> 8, (~n) & 255, (~n >>> 8) & 255, ...rows, ...u32((b * 65536 + a) >>> 0)];
    return Uint8Array.from([
      137, 80, 78, 71, 13, 10, 26, 10,
      ...chunk("IHDR", [...u32(w), ...u32(h), 8, 3, 0, 0, 0]),
      ...chunk("PLTE", palette.flat()), ...chunk("tRNS", [0, ...palette.slice(1).map(() => 255)]),
      ...chunk("IDAT", z), ...chunk("IEND", [])
    ]);
  }
  return { rect, disc, pin, png };
}

function leadPart(kind, pitch) {
  const w = (pitch + 1) * 8, h = kind === "capacitor" ? 16 : 8;
  const c = canvas(w, h);
  const { rect, pin } = c;
  if (kind === "capacitor") {
    rect(3, 6, 6, 13, 2); rect(w - 6, 6, w - 3, 13, 2);
    rect(1, 1, w - 1, 9, 1); rect(2, 2, w - 2, 8, 7);
    rect(3, 2, w - 3, 4, 8);
    pin(0, 1); pin(pitch, 1);
  } else {
    rect(4, 3, w - 3, 6, 2);
    const left = w / 2 - 6, right = w / 2 + 6;
    rect(left, 1, right, 7, 1);
    rect(left + 1, 2, right - 1, 6, kind === "resistor" ? 3 : kind === "inductor" ? 5 : 11);
    if (kind === "resistor") {
      rect(left + 2, 1, left + 4, 7, 4);
      rect(left + 5, 1, left + 7, 7, 1);
      rect(right - 3, 1, right - 2, 7, 6);
    } else if (kind === "inductor") {
      for (let x = left + 2; x < right - 1; x += 3) rect(x, 2, x + 1, 6, 6);
    } else {
      // K is the right lead: light cathode band.
      rect(right - 4, 1, right - 2, 7, 9);
    }
    pin(0, 0); pin(pitch, 0);
  }
  return c.png();
}

function transistor(pkg) {
  const dimensions = { "to-18": [3, 3], "to-39": [5, 5], "to-126": [5, 2], "to-247": [7, 3] };
  const [w, h] = dimensions[pkg];
  const c = canvas(w * 8, h * 8);
  const { rect, disc, pin } = c;
  if (pkg === "to-18" || pkg === "to-39") {
    const big = pkg === "to-39", center = big ? 20 : 12, radius = big ? 16 : 9;
    disc(center, center, radius, 1); disc(center, center, radius - 1, 2);
    disc(center, center, radius - 3, 11);
    rect(center - radius, center - 1, center - radius + 4, center + 2, 2);
    const pins = big ? [[1, 2], [2, 3], [3, 2]] : [[0, 1], [1, 2], [2, 1]];
    pins.forEach(([x, y], i) => pin(x, y, i === 0));
  } else {
    const big = pkg === "to-247";
    // Standing package, seen from above: tab, thin body, then bent leads.
    rect(1, 1, w * 8 - 1, 5, 2);
    rect(2, 5, w * 8 - 2, big ? 13 : 9, 1);
    rect(3, 5, w * 8 - 3, 7, 11);
    const xs = big ? [1, 3, 5] : [1, 2, 3], y = big ? 2 : 1;
    for (const [i, x] of xs.entries()) {
      rect(x * 8 + 3, big ? 13 : 9, x * 8 + 6, y * 8 + 5, 2);
      pin(x, y, i === 0);
    }
  }
  return c.png();
}

export function genericArtwork() {
  const images = {};
  for (const kind of ["resistor", "capacitor", "inductor", "diode"])
    for (const pitch of [2, 3, 4, 5, 6]) images[`${kind}-${pitch}-grid`] = leadPart(kind, pitch);
  for (const pkg of ["to-18", "to-39", "to-126", "to-247"])
    images[`transistor-${pkg}`] = transistor(pkg);
  return images;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [name, png] of Object.entries(genericArtwork()))
    await writeFile(new URL(`../web/src/assets/parts/${name}.png`, import.meta.url), png);
}
