import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { addBuiltInArtwork, addMissingAdditionalParts, addMissingNextParts, addMissingPinHeaders, additionalPartDefs, correctBuiltInArtwork, defaultPartDefs, nextPartDefs, pinHeaderPartDefs } from "../src/defaultParts";

test("all 19 built-in drawings match their footprints and source PNGs", () => {
  assert.equal(defaultPartDefs.length, 19);
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

test("six new footprints follow the hole grid and pin order", () => {
  assert.deepEqual(nextPartDefs.map((def) => [def.name, def.pins.length]), [
    ["Capacitor Electrolytic", 2], ["TO-220 3-pin", 3], ["DIP-14 IC", 14],
    ["Slide Switch SPDT", 3], ["Terminal Block 3P", 3], ["Trimmer 3P Inline", 3]
  ]);
  assert.deepEqual(nextPartDefs[0].pins.map((pin) => [pin.name, pin.pos.x, pin.pos.y]), [["+", 0, 1], ["-", 1, 1]]);
  assert.deepEqual(nextPartDefs[1].pins.map((pin) => [pin.pos.x, pin.pos.y]), [[1, 2], [2, 2], [3, 2]]);
  assert.deepEqual(nextPartDefs[2].pins.map((pin) => [pin.name, pin.pos.x, pin.pos.y]), [
    ...Array.from({ length: 7 }, (_, y) => [String(y + 1), 0, y]),
    ...Array.from({ length: 7 }, (_, index) => [String(index + 8), 3, 6 - index])
  ]);
  assert.deepEqual(nextPartDefs[3].pins.map((pin) => [pin.name, pin.pos.x, pin.pos.y]), [["1", 0, 1], ["C", 1, 1], ["2", 2, 1]]);
  assert.deepEqual(nextPartDefs[4].pins.map((pin) => [pin.pos.x, pin.pos.y]), [[0, 1], [2, 1], [4, 1]]);
  assert.deepEqual(nextPartDefs[5].pins.map((pin) => [pin.pos.x, pin.pos.y]), [[0, 2], [1, 2], [2, 2]]);
  assert.equal(addMissingNextParts(defaultPartDefs.slice(0, 13)).length, 19);
  assert.equal(addMissingNextParts(defaultPartDefs), defaultPartDefs);
});

test("v4 artwork correction replaces the 1x2 sketch and old radial art without touching custom parts", () => {
  const correctedRadial = "data:image/png;base64," + readFileSync(new URL("../src/assets/parts/capacitor-radial.png", import.meta.url)).toString("base64");
  const cap = defaultPartDefs[1];
  const header = pinHeaderPartDefs[0];
  const oldCap = { ...cap, imageDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAICAYAAADwdn+XAAAAe0lEQVR42mNkwAKK7Qz+YxPvPXSBEV2MBZvmnil+KGIvd5+GMf+jG8KCrrnUXxKb5QyCOnIMpVgMYcGmGMlGgoDlxoPncP/OjvMkShOyHpb1Ow9hKLh0+ROmrstXGPR0+RgYGBgYkPUwYgtEdyVurDbvvPcVIyYYKY1GANN1MojLEkX8AAAAAElFTkSuQmCC" };
  const customCap = { ...cap, imageDataUrl: header.imageDataUrl };
  const changedHeader = { ...header, imageDataUrl: cap.imageDataUrl, imageScale: 1.5 };
  const changedFootprint = { ...header, occupied: [{ x: 2, y: 2 }] };
  const corrected = correctBuiltInArtwork([oldCap, customCap, changedHeader, changedFootprint]);
  assert.equal(corrected[0].imageDataUrl, correctedRadial);
  assert.equal(corrected[1], customCap);
  assert.equal(corrected[2].imageDataUrl, header.imageDataUrl);
  assert.equal(corrected[2].imageScale, 1);
  assert.equal(corrected[3], changedFootprint);
  assert.equal(correctBuiltInArtwork(corrected), corrected);
});

test("additional part pins follow the intended 2.54 mm hole patterns", () => {
  assert.deepEqual(additionalPartDefs.map((def) => [def.name, def.pins.length]), [
    ["Diode Axial", 2],
    ["LED 5mm", 2],
    ["Transistor TO-92", 3],
    ["DIP-8 IC", 8],
    ["Terminal Block 2P", 2],
    ["Push Button 2P", 2]
  ]);
  assert.deepEqual(additionalPartDefs[0].pins.map((pin) => [pin.name, pin.pos.x, pin.pos.y]), [["A", 0, 0], ["K", 2, 0]]);
  assert.deepEqual(additionalPartDefs[1].pins.map((pin) => [pin.name, pin.pos.x, pin.pos.y]), [["A", 0, 1], ["K", 1, 1]]);
  assert.deepEqual(additionalPartDefs[3].pins.map((pin) => [pin.name, pin.pos.x, pin.pos.y]), [
    ["1", 0, 0], ["2", 0, 1], ["3", 0, 2], ["4", 0, 3],
    ["5", 3, 3], ["6", 3, 2], ["7", 3, 1], ["8", 3, 0]
  ]);
  assert.deepEqual(additionalPartDefs[4].pins.map((pin) => [pin.pos.x, pin.pos.y]), [[0, 1], [2, 1]]);
  assert.deepEqual(additionalPartDefs[5].pins.map((pin) => [pin.pos.x, pin.pos.y]), [[0, 1], [2, 1]]);
});

test("new catalog parts append once without replacing matching names or IDs", () => {
  const customized = { ...additionalPartDefs[0], name: "My Diode" };
  const sameName = { ...additionalPartDefs[1], id: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb" };
  const existing = [...defaultPartDefs.slice(0, 7), customized, sameName];
  const merged = addMissingAdditionalParts(existing);

  assert.equal(merged[7], customized);
  assert.equal(merged[8], sameName);
  assert.deepEqual(merged.slice(9).map((def) => def.name), [
    "Transistor TO-92", "DIP-8 IC", "Terminal Block 2P", "Push Button 2P"
  ]);
  assert.equal(addMissingAdditionalParts(merged), merged);
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
