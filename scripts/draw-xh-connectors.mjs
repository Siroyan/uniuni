import { deflateSync } from "node:zlib";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// JST XH BnB-XH-A and SnB-XH-A outlines from KiCad's Connector_JST footprints.
// Pin 1 is at (0, 0) mm; each following pin is 2.50 mm farther along X.
// One board hole is 2.54 mm and eight sprite pixels; the 2.50 mm pitch is
// represented on the app's 2.54 mm grid for these universal-board parts.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const colors = {
  edge: [43, 65, 78, 255],
  plastic: [232, 237, 226, 255],
  light: [251, 252, 246, 255],
  shade: [183, 199, 195, 255],
  cavity: [64, 82, 91, 255],
  cavityDark: [35, 50, 59, 255],
  metal: [150, 165, 168, 255],
  gold: [213, 159, 68, 255],
  mark: [199, 77, 65, 255]
};

function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, body, checksum]);
}

function encodePng(width, height, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    pixels.copy(rows, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(rows, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function drawConnector(pins, orientation) {
  const width = (pins + 2) * 8;
  const height = orientation === "top" ? 24 : 48;
  const pixels = Buffer.alloc(width * height * 4);
  const rect = (left, top, right, bottom, color) => {
    for (let y = Math.max(0, top); y < Math.min(height, bottom); y += 1) {
      for (let x = Math.max(0, left); x < Math.min(width, right); x += 1) {
        const index = (y * width + x) * 4;
        for (let channel = 0; channel < 4; channel += 1) pixels[index + channel] = color[channel];
      }
    }
  };
  // The actual top housings are x=-2.45..(pins-1)*2.50+2.45,
  // y=-2.35..3.40 mm; side housings are y=-2.30..9.20 mm.
  const left = 4;
  const right = width - 4;
  if (orientation === "top") {
    rect(left, 4, right, 23, colors.edge);
    rect(left + 1, 5, right - 1, 22, colors.plastic);
    rect(left + 2, 6, right - 2, 8, colors.light);
    rect(left + 1, 20, right - 1, 22, colors.shade);
    rect(left + 4, 8, right - 4, 20, colors.shade);
    rect(left + 5, 9, right - 5, 19, colors.cavity);
    rect(left + 5, 9, right - 5, 11, colors.cavityDark);
    for (let index = 0; index < pins; index += 1) {
      const x = 12 + index * 8;
      rect(x - 2, 10, x + 2, 15, colors.metal);
      rect(x - 1, 11, x + 1, 14, colors.gold);
    }
    rect(left + 1, 5, left + 3, 7, colors.mark);
    rect(Math.floor(width / 2) - 2, 4, Math.floor(width / 2) + 2, 7, colors.shade);
  } else {
    rect(left, 4, right, 41, colors.edge);
    rect(left + 1, 5, right - 1, 40, colors.plastic);
    rect(left + 2, 6, right - 2, 9, colors.light);
    rect(left + 1, 38, right - 1, 40, colors.shade);
    rect(left + 4, 19, right - 4, 38, colors.shade);
    rect(left + 5, 21, right - 5, 37, colors.cavityDark);
    for (let index = 0; index < pins; index += 1) {
      const x = 12 + index * 8;
      // Board solder pins coincide with the hole centers at (x, 12).
      rect(x - 2, 10, x + 2, 15, colors.metal);
      rect(x - 1, 11, x + 1, 14, colors.gold);
      // Mating contacts are visible inside the side-facing opening.
      rect(x - 2, 23, x + 2, 35, colors.cavity);
      rect(x - 1, 27, x + 1, 34, colors.metal);
      rect(x - 1, 32, x + 1, 35, colors.gold);
    }
    rect(left + 1, 5, left + 3, 7, colors.mark);
    rect(left + 2, 16, right - 2, 18, colors.shade);
  }
  return encodePng(width, height, pixels);
}

for (const pins of [2, 3, 4, 5, 6]) {
  for (const orientation of ["top", "side"]) {
    const name = `xh-connector-${pins}p-${orientation}`;
    await writeFile(path.join(root, "web/src/assets/parts", `${name}.png`), drawConnector(pins, orientation));
  }
}
