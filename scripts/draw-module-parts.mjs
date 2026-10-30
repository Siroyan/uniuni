import { deflateSync } from "node:zlib";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Top-view pixel art at eight pixels per 2.54 mm board hole.
// Sources and projection assumptions: doc/parts/power-can-modules.md
// and doc/parts/waveshare-buck-module.md.
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

// The DC-DC footprint starts at (-1,-1); pin (0,0) is pixel (12,12).
function powerModule() {
  const c = canvas(104, 64);
  const { rect, disc } = c;
  rect(7, 7, 97, 57, color.greenEdge);
  rect(8, 8, 96, 56, color.pcb);
  rect(9, 9, 95, 10, color.pcbLight);
  // U1 / inductor assembly in the top-view position from the manual.
  rect(31, 16, 62, 42, color.edge);
  rect(33, 18, 60, 40, color.blueDark);
  rect(35, 19, 58, 21, color.blue);
  // Input ceramics at left, four output ceramics at right.
  for (const y of [25, 39]) {
    rect(18, y, 28, y + 11, color.silver);
    rect(20, y + 2, 26, y + 9, [174, 155, 107, 255]);
    for (const x of [67, 79]) {
      rect(x, y - 8, x + 10, y + 3, color.silver);
      rect(x + 2, y - 6, x + 8, y + 1, [174, 155, 107, 255]);
    }
  }
  for (const x of [33, 44, 55]) {
    rect(x, 47, x + 7, 51, color.silver);
    rect(x + 1, 48, x + 6, 50, color.edge);
  }
  for (const x of [12, 92]) for (let y = 12; y <= 52; y += 8) {
    disc(x, y, 3, color.gold);
    disc(x, y, 1, color.edge);
  }
  rect(11, 11, 14, 14, color.red); // CN1.1 PG, top-left.
  return c.png();
}

function verticalCanModule() {
  const c = canvas(88, 16);
  const { rect, disc } = c;
  // A thin PCB edge seen from above, rather than a flattened face of the PCB.
  rect(0, 2, 88, 8, color.greenEdge);
  rect(1, 3, 87, 7, color.pcb);
  rect(1, 3, 87, 4, color.pcbLight);
  // Projected component thickness on the positive-Y side.
  rect(22, 7, 57, 12, color.edge);
  rect(24, 8, 55, 11, color.blueDark);
  rect(62, 7, 73, 13, color.silver); // crystal edge
  rect(4, 7, 17, 13, color.edge); // termination switch edge
  rect(7, 9, 12, 14, color.white);
  for (let x = 4; x <= 84; x += 8) {
    disc(x, 4, 2, color.gold);
    rect(x, 3, x + 1, 6, color.silver);
  }
  rect(3, 3, 6, 6, color.red); // J1.1 SCK.
  return c.png();
}

await writeFile(path.join(root, "web/src/assets/parts/ae-mymgk00506ersr-5v0.png"), powerModule());
await writeFile(path.join(root, "web/src/assets/parts/mcp25625-breakout-vertical.png"), verticalCanModule());

// Bare Waveshare 29035: rounded wire connection locations, not a direct-fit header.
function waveshareBuck() {
  const c = canvas(112, 56);
  const { rect, disc } = c;
  const black = [30, 34, 38, 255], gray = [107, 110, 109, 255];
  rect(4, 3, 108, 53, color.edge);
  rect(5, 4, 107, 52, black);
  rect(5, 4, 107, 5, color.silver);
  rect(5, 51, 107, 52, color.silver);
  // Protection diode, MP9447 controller, and output inductor from the top photo.
  rect(30, 7, 52, 15, color.silver);
  rect(33, 8, 49, 14, black);
  rect(35, 20, 49, 33, color.edge);
  rect(37, 21, 47, 32, color.blueDark);
  rect(61, 11, 95, 43, color.silver);
  rect(62, 12, 94, 42, gray);
  // "100" inductor marking.
  rect(70, 23, 71, 32, black);
  for (const x of [75, 83]) {
    rect(x, 23, x + 5, 32, black);
    rect(x + 1, 24, x + 4, 31, gray);
  }
  for (const [x, y] of [[24, 20], [24, 32], [33, 40], [44, 40], [56, 45], [70, 45], [84, 45]]) {
    rect(x, y, x + 7, y + 6, color.silver);
    rect(x + 1, y + 1, x + 6, y + 5, [174, 155, 107, 255]);
  }
  // Ten through holes and adjacent castellations, with CAD-grid-rounded spacing.
  for (const [x, rows] of [[12, [12, 20, 36, 44]], [100, [12, 20, 28, 36, 44, 52]]]) {
    for (const y of rows) {
      rect(x === 12 ? 4 : 105, y - 2, x === 12 ? 8 : 108, y + 3, color.gold);
      disc(x, y, 3, color.gold);
      disc(x, y, 1, black);
      const edgeX = x === 12 ? 4 : 108;
      disc(edgeX, y, 3, color.gold);
      disc(edgeX, y, 1, black);
    }
  }
  rect(3, 11, 6, 14, color.red); // Upper VIN+ castellated wire connection.
  return c.png();
}
await writeFile(path.join(root, "web/src/assets/parts/waveshare-dc5-36-to-dc3v3-5-wired.png"), waveshareBuck());
