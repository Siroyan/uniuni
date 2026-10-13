import { deflateSync } from "node:zlib";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Top view of a standing resistor with leads in adjacent 2.54 mm holes.
// One board hole occupies 8 pixels; lead centers are (4, 4) and (12, 4).
const width = 16;
const height = 8;
const pixels = Buffer.alloc(width * height * 4);
const colors = {
  edge: [59, 47, 39, 255],
  body: [214, 178, 111, 255],
  light: [242, 213, 153, 255],
  band: [146, 59, 39, 255],
  metal: [144, 158, 164, 255],
  lead: [213, 160, 74, 255]
};

function dot(x, y, color) {
  if (x < 0 || x >= width || y < 0 || y >= height) return;
  pixels.set(color, (y * width + x) * 4);
}

for (let x = 7; x <= 12; x += 1) {
  dot(x, 3, colors.metal);
  dot(x, 4, colors.metal);
}
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < 8; x += 1) {
    const radiusSquared = (x - 3.5) ** 2 + (y - 3.5) ** 2;
    if (radiusSquared <= 12.5) dot(x, y, colors.edge);
    if (radiusSquared <= 8.5) dot(x, y, colors.body);
    if (radiusSquared <= 4.5 && y <= 3) dot(x, y, colors.light);
  }
}
for (const y of [2, 3, 4, 5]) dot(2, y, colors.band);
dot(4, 4, colors.metal);
for (let y = 2; y <= 6; y += 1) {
  for (let x = 10; x <= 14; x += 1) {
    if ((x - 12) ** 2 + (y - 4) ** 2 <= 4) dot(x, y, colors.edge);
  }
}
dot(12, 4, colors.lead);

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([size, body, checksum]);
}

const header = Buffer.alloc(13);
header.writeUInt32BE(width, 0);
header.writeUInt32BE(height, 4);
header[8] = 8;
header[9] = 6;
const rows = Buffer.alloc(height * (1 + width * 4));
for (let y = 0; y < height; y += 1) {
  pixels.copy(rows, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
}
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", header),
  chunk("IDAT", deflateSync(rows, { level: 9 })),
  chunk("IEND", Buffer.alloc(0))
]);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await writeFile(path.join(root, "web/src/assets/parts/resistor-vertical-2-pin.png"), png);
