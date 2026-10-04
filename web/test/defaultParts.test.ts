import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { addBuiltInArtwork, addMissingPinHeaders, defaultPartDefs, pinHeaderPartDefs } from "../src/defaultParts";

test("all seven built-in drawings match their footprints and source PNGs", () => {
  assert.equal(defaultPartDefs.length, 7);
  for (const def of defaultPartDefs) {
    assert.equal(def.imagePixelated, true);
    assert.match(def.imageDataUrl ?? "", /^data:image\/png;base64,/);
    const encoded = (def.imageDataUrl ?? "").split(",")[1];
    const bytes = Buffer.from(encoded, "base64");
    const asset = def.name.toLowerCase().replaceAll(" ", "-");
    assert.deepEqual(bytes, readFileSync(new URL(`../src/assets/parts/${asset}.png`, import.meta.url)));
    assert.equal(bytes.readUInt32BE(16), (Math.max(...def.occupied.map((pt) => pt.x)) - Math.min(...def.occupied.map((pt) => pt.x)) + 1) * 8);
    assert.equal(bytes.readUInt32BE(20), (Math.max(...def.occupied.map((pt) => pt.y)) - Math.min(...def.occupied.map((pt) => pt.y)) + 1) * 8);
  }
});

test("art migration only fills unmodified built-ins without existing images", () => {
  const legacy = defaultPartDefs.map((def) => ({ ...def, imageDataUrl: null, imagePixelated: false }));
  const customizedImage = { ...legacy[0], imageDataUrl: "data:image/png;base64,Y3VzdG9t" };
  const customizedFootprint = { ...legacy[1], occupied: [{ x: 4, y: 4 }] };
  const renamed = { ...legacy[2], name: "My Coil" };
  const existing = [customizedImage, customizedFootprint, renamed, ...legacy.slice(3, 6)];
  const migrated = addBuiltInArtwork(existing);

  assert.equal(migrated[0], customizedImage);
  assert.equal(migrated[1], customizedFootprint);
  assert.equal(migrated[2], renamed);
  assert.ok(migrated.slice(3).every((def) => def.imageDataUrl?.startsWith("data:image/png;base64,") && def.imagePixelated));
  assert.equal(migrated.length, existing.length);
  assert.equal(addBuiltInArtwork(migrated), migrated);
});

test("pin header footprints use numbered 2.54 mm grid points", () => {
  assert.deepEqual(pinHeaderPartDefs.map((def) => [def.name, def.pins.length]), [
    ["Pin Header 1x2", 2],
    ["Pin Header 1x3", 3],
    ["Pin Header 1x4", 4],
    ["Pin Header 2x3", 6]
  ]);
  for (const def of pinHeaderPartDefs) {
    assert.deepEqual(def.pins.map((pin) => pin.name),
      Array.from({ length: def.pins.length }, (_, index) => String(index + 1)));
    assert.deepEqual(def.occupied, def.pins.map((pin) => pin.pos));
  }
  assert.deepEqual(pinHeaderPartDefs[3].pins.map((pin) => pin.pos), [
    { x: 0, y: 0 }, { x: 1, y: 0 },
    { x: 0, y: 1 }, { x: 1, y: 1 },
    { x: 0, y: 2 }, { x: 1, y: 2 }
  ]);
});

test("catalog update keeps customized parts and avoids duplicate names", () => {
  const customized = { ...pinHeaderPartDefs[0], name: "My Header" };
  const sameName = { ...pinHeaderPartDefs[1], id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa" };
  const existing = [customized, sameName];
  const merged = addMissingPinHeaders(existing);

  assert.equal(merged[0], customized);
  assert.equal(merged[1], sameName);
  assert.deepEqual(merged.slice(2).map((def) => def.name), ["Pin Header 1x4", "Pin Header 2x3"]);
  assert.equal(addMissingPinHeaders(merged), merged);
});
