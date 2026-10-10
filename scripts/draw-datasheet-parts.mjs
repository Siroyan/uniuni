import { deflateSync } from "node:zlib";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Top-view pixel art at eight pixels per 2.54 mm board hole.
// Dimensions and terminal locations are taken from the three supplied PDFs.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const color = {
  edge: [39, 55, 70, 255], blue: [67, 91, 110, 255], blueLight: [105, 132, 147, 255],
  blueDark: [45, 68, 83, 255], white: [224, 230, 221, 255], silver: [172, 187, 187, 255],
  gold: [216, 150, 58, 255], red: [197, 83, 54, 255],
  greenEdge: [71, 93, 35, 255], green: [160, 189, 55, 255], greenLight: [211, 225, 103, 255],
  pcb: [63, 118, 94, 255], pcbLight: [104, 160, 126, 255], trace: [187, 145, 84, 255]
};

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([size, body, checksum]);
}

function canvas(width, height) {
  const pixels = Buffer.alloc(width * height * 4);
  function rect(x0, y0, x1, y1, fill) {
    for (let y = Math.max(0, y0); y < Math.min(height, y1); y++) {
      for (let x = Math.max(0, x0); x < Math.min(width, x1); x++) {
        pixels.set(fill, (y * width + x) * 4);
      }
    }
  }
  function disc(cx, cy, radius, fill) {
    for (let y = Math.max(0, Math.ceil(cy - radius)); y <= Math.min(height - 1, Math.floor(cy + radius)); y++) {
      for (let x = Math.max(0, Math.ceil(cx - radius)); x <= Math.min(width - 1, Math.floor(cx + radius)); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) rect(x, y, x + 1, y + 1, fill);
      }
    }
  }
  function png() {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = 6;
    const rows = Buffer.alloc(height * (1 + width * 4));
    for (let y = 0; y < height; y++) pixels.copy(rows, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
    return Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", header), chunk("IDAT", deflateSync(rows, { level: 9 })), chunk("IEND", Buffer.alloc(0))
    ]);
  }
  return { rect, disc, png };
}

function relay() {
  const c = canvas(48, 24);
  const { rect, disc } = c;
  rect(1, 0, 48, 24, color.edge);
  rect(2, 1, 47, 23, color.blue);
  rect(3, 2, 46, 4, color.blueLight);
  rect(3, 20, 46, 22, color.blueDark);
  rect(8, 7, 42, 18, color.blueDark);
  rect(10, 9, 40, 16, color.blue);
  rect(19, 10, 32, 11, color.silver);
  rect(19, 14, 32, 15, color.silver);
  rect(5, 16, 9, 20, color.silver); // pin-1 end mark
  for (const x of [4, 20, 28, 36]) {
    for (const y of [4, 20]) {
      disc(x, y, 2, color.edge);
      disc(x, y, 1, color.gold);
    }
  }
  disc(4, 20, 1, color.red);
  return c.png();
}

function led() {
  const c = canvas(16, 24);
  const { rect, disc } = c;
  disc(8, 12, 6, color.greenEdge); // 3.85 mm flange
  disc(8, 12, 5, color.green);
  disc(8, 12, 4, color.greenLight); // 2.85 mm lens
  rect(5, 8, 8, 10, color.white);
  rect(13, 9, 15, 16, color.greenEdge); // cathode flat
  disc(4, 12, 1, color.gold);
  disc(12, 12, 1, color.gold);
  rect(2, 18, 6, 19, color.red); // anode marker
  return c.png();
}

function adapter() {
  const c = canvas(32, 16);
  const { rect, disc } = c;
  rect(0, 0, 32, 16, color.edge);
  rect(1, 1, 31, 15, color.pcb);
  rect(2, 2, 30, 3, color.pcbLight);
  // Three SOT-23 landing pads. The right pair of through holes shares pad 3.
  rect(4, 3, 12, 5, color.trace);
  rect(4, 11, 12, 13, color.trace);
  rect(19, 7, 29, 9, color.trace);
  rect(27, 4, 29, 12, color.trace);
  rect(10, 3, 14, 6, color.silver);
  rect(10, 10, 14, 13, color.silver);
  rect(18, 7, 22, 10, color.silver);
  for (const x of [4, 28]) {
    for (const y of [4, 12]) {
      disc(x, y, 3, color.gold);
      disc(x, y, 1, color.edge);
    }
  }
  return c.png();
}

for (const [name, bytes] of [
  ["az8462-3", relay()], ["osg8ha3z74a", led()],
  ["sot-23-3-to-dip-4-adapter", adapter()]
]) {
  await writeFile(path.join(root, "web/src/assets/parts", `${name}.png`), bytes);
}
