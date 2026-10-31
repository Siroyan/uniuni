import { readFile, writeFile } from "node:fs/promises";
import { deflateSync, inflateSync } from "node:zlib";

// Keep the v12 stock drawing at its original pin origin; add a transparent third row
// for the new 3x3 Occupied Area rather than stretching the 3x2 switch illustration.
const legacyFile = new URL("../web/src/legacyTopViewArt.ts", import.meta.url);
const match = (await readFile(legacyFile, "utf8")).match(/"slide-switch-spdt": "data:image\/png;base64,([^"]+)"/);
if (!match) throw new Error("missing legacy SPDT artwork");
const source = Buffer.from(match[1], "base64");
if (source.readUInt32BE(16) !== 24 || source.readUInt32BE(20) !== 16) throw new Error("unexpected legacy SPDT dimensions");
const compressed = [];
for (let offset = 8; offset < source.length;) {
  const size = source.readUInt32BE(offset);
  if (source.toString("ascii", offset + 4, offset + 8) === "IDAT") compressed.push(source.subarray(offset + 8, offset + 8 + size));
  offset += size + 12;
}
const rows = inflateSync(Buffer.concat(compressed));
const stride = 1 + 24 * 4;
if (rows.length !== stride * 16) throw new Error("unexpected SPDT rows");
if (source[24] !== 8 || source[25] !== 6 || source[28] !== 0) throw new Error("expected noninterlaced RGBA8 PNG");
const padded = Buffer.alloc(stride * 24);
function paeth(a, b, c) {
  const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c);
  return da <= db && da <= dc ? a : db <= dc ? b : c;
}
for (let y = 0; y < 16; y++) {
  const filter = rows[y * stride];
  if (filter > 4) throw new Error("invalid PNG filter");
  for (let x = 0; x < 24 * 4; x++) {
    const at = y * stride + 1 + x;
    const a = x >= 4 ? padded[at - 4] : 0;
    const b = y > 0 ? padded[at - stride] : 0;
    const c = y > 0 && x >= 4 ? padded[at - stride - 4] : 0;
    const prediction = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter];
    padded[at] = (rows[at] + prediction) & 255;
  }
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const length = Buffer.alloc(4), checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, body, checksum]);
}
const header = Buffer.from(source.subarray(16, 29));
header.writeUInt32BE(24, 4);
await writeFile(new URL("../web/src/assets/parts/slide-switch-spdt.png", import.meta.url), Buffer.concat([
  source.subarray(0, 8), chunk("IHDR", header), chunk("IDAT", deflateSync(padded, { level: 9 })), chunk("IEND", Buffer.alloc(0))
]));
