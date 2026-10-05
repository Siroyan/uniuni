import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { addBuiltInArtwork, addMissingAdditionalParts, addMissingNewestParts, addMissingNextParts, addMissingPinHeaders, addMissingXhConnectors, additionalPartDefs, correctBuiltInArtwork, defaultPartDefs, newestPartDefs, nextPartDefs, pinHeaderPartDefs, updateBuiltInTopViews, xhConnectorPartDefs } from "../src/defaultParts";
import { categorizeParts, partCategory } from "../src/partCategories";
import { legacyTopViewArt } from "../src/legacyTopViewArt";
import type { PartDef } from "../src/types";

test("all 37 built-in drawings match their footprints and source PNGs", () => {
  assert.equal(defaultPartDefs.length, 37);
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

test("XH top and side connectors cover the housing envelope around the 2.50 mm pin row", () => {
  assert.equal(xhConnectorPartDefs.length, 10);
  for (const pins of [2, 3, 4, 5, 6]) {
    for (const orientation of ["Top", "Side"] as const) {
      const def = xhConnectorPartDefs.find((candidate) => candidate.name === `XH Connector ${pins}P ${orientation}`)!;
      const rows = orientation === "Top" ? 3 : 6;
      assert.equal(def.category, "connector");
      assert.deepEqual(def.pins.map((pin) => [pin.name, pin.pos.x, pin.pos.y]),
        Array.from({ length: pins }, (_, index) => [String(index + 1), index + 1, 1]));
      assert.equal(def.occupied.length, (pins + 2) * rows);
      assert.deepEqual([
        Math.min(...def.occupied.map((cell) => cell.x)),
        Math.max(...def.occupied.map((cell) => cell.x)),
        Math.min(...def.occupied.map((cell) => cell.y)),
        Math.max(...def.occupied.map((cell) => cell.y))
      ], [0, pins + 1, 0, rows - 1]);
      // The side housing reaches 9.20 mm ahead of the pin row; row 5 is needed.
      if (orientation === "Side") assert.ok(def.occupied.some((cell) => cell.y === 5));
    }
  }
  const oldCatalog = defaultPartDefs.slice(0, 27);
  const migrated = addMissingXhConnectors(oldCatalog);
  assert.equal(migrated.length, 37);
  assert.equal(addMissingXhConnectors(migrated), migrated);
  const edited = { ...xhConnectorPartDefs[0], imageDataUrl: null };
  const withEdited = addMissingXhConnectors([...oldCatalog, edited]);
  assert.equal(withEdited.length, 37);
  assert.equal(withEdited[27], edited);
});

test("6.3 mm electrolytic can centers 2.5 mm leads in a 4x3 hole envelope", () => {
  const cap = nextPartDefs[0];
  assert.deepEqual(cap.pins.map((pin) => [pin.name, pin.pos.x, pin.pos.y]), [["+", 1, 1], ["-", 2, 1]]);
  assert.equal(cap.occupied.length, 12);
  assert.equal((cap.pins[0].pos.x + cap.pins[1].pos.x) / 2, 1.5);
  assert.equal((Math.min(...cap.occupied.map((pt) => pt.x)) + Math.max(...cap.occupied.map((pt) => pt.x))) / 2, 1.5);
  assert.equal(cap.pins[0].pos.y, 1);
  assert.equal((Math.min(...cap.occupied.map((pt) => pt.y)) + Math.max(...cap.occupied.map((pt) => pt.y))) / 2, 1);
  assert.deepEqual(additionalPartDefs[1].occupied.map((pt) => pt.y).sort(), [0, 0, 1, 1, 2, 2]);
  assert.equal(newestPartDefs[2].occupied.length, 6);
  assert.equal(newestPartDefs[3].occupied.length, 12);
});

test("top-view migration moves placed stock parts without moving their pins and preserves blocked or edited footprints", () => {
  const cap = nextPartDefs[0];
  const oldCap: PartDef = {
    ...cap,
    pins: [{ name: "+", pos: { x: 0, y: 1 } }, { name: "-", pos: { x: 1, y: 1 } }],
    occupied: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
    imageDataUrl: legacyTopViewArt["capacitor-electrolytic"]
  };
  const led = additionalPartDefs[1];
  const oldLed = { ...led, occupied: oldCap.occupied, imageDataUrl: legacyTopViewArt["led-5mm"] };
  const transistor = additionalPartDefs[2];
  const oldTransistor = { ...transistor, imageDataUrl: legacyTopViewArt["transistor-to-92"] };
  const customCap = { ...oldCap, imageDataUrl: "data:image/png;base64,Y3VzdG9t" };
  const originalArt = updateBuiltInTopViews([oldTransistor, customCap], null);
  assert.equal(originalArt.partDefs[0].imageDataUrl, transistor.imageDataUrl);
  assert.equal(originalArt.partDefs[1], customCap);

  const snapshot = (atX: number, rot = "Deg0"): string => JSON.stringify({
    schema_version: 1,
    board: { width: 20, height: 20, grid_pitch_mm: 2.54 },
    part_defs: [oldCap],
    part_insts: [{ id: "f1ab17a9-c2b1-4d37-862f-eb0ed93f53b5", def_id: cap.id,
      at: { x: atX, y: 5 }, rot, refdes: "C1", net_assign: {} }],
    nets: [], wires: []
  });
  const placed = updateBuiltInTopViews([oldCap], snapshot(5));
  assert.deepEqual(placed.partDefs[0].pins, cap.pins);
  assert.deepEqual(placed.partDefs[0].occupied, cap.occupied);
  const moved = JSON.parse(placed.coreStateJson!);
  assert.deepEqual(moved.part_insts[0].at, { x: 4, y: 5 });
  assert.deepEqual(moved.part_defs[0].pins, cap.pins);
  assert.deepEqual(moved.part_insts[0].at.x + moved.part_defs[0].pins[0].pos.x, 5);
  const rotated = updateBuiltInTopViews([oldCap], snapshot(5, "Deg90"));
  assert.deepEqual(JSON.parse(rotated.coreStateJson!).part_insts[0].at, { x: 5, y: 4 });
  assert.deepEqual(JSON.parse(updateBuiltInTopViews([oldCap], snapshot(1)).coreStateJson!).part_insts[0].at,
    { x: 0, y: 5 });
  const librarySavedFirst = updateBuiltInTopViews([cap], snapshot(5));
  assert.equal(librarySavedFirst.partDefs[0], cap);
  assert.deepEqual(JSON.parse(librarySavedFirst.coreStateJson!).part_insts[0].at, { x: 4, y: 5 });
  const projectSavedFirst = updateBuiltInTopViews([oldCap], placed.coreStateJson);
  assert.deepEqual(projectSavedFirst.partDefs[0].pins, cap.pins);
  assert.equal(projectSavedFirst.coreStateJson, placed.coreStateJson);

  const blocked = updateBuiltInTopViews([oldCap], snapshot(0));
  assert.equal(blocked.partDefs[0], oldCap);
  assert.equal(blocked.coreStateJson, snapshot(0));
  assert.deepEqual(blocked.blockedNames, [cap.name]);
  const blockedAfterLibrarySave = updateBuiltInTopViews([cap], snapshot(0));
  assert.deepEqual(blockedAfterLibrarySave.partDefs[0].pins, oldCap.pins);
  assert.equal(blockedAfterLibrarySave.partDefs[0].imageDataUrl, oldCap.imageDataUrl);
  const upgraded = updateBuiltInTopViews([oldCap, oldLed], null);
  assert.deepEqual(upgraded.partDefs[0].pins, cap.pins);
  assert.deepEqual(upgraded.partDefs[1].occupied, led.occupied);
  assert.equal(updateBuiltInTopViews(upgraded.partDefs, null).partDefs, upgraded.partDefs);
});

test("eight newest parts have 2.54 mm hole patterns and categories", () => {
  assert.deepEqual(newestPartDefs.map((def) => [def.name, def.pins.length, partCategory(def)]), [
    ["Capacitor Ceramic Disc", 2, "passive"], ["Fuse Axial", 2, "other"],
    ["Photoresistor Radial", 2, "passive"], ["RGB LED 4-pin", 4, "semiconductor"],
    ["DIP-16 IC", 16, "ic"], ["Pin Header 2x5", 10, "connector"],
    ["Buzzer 2P", 2, "other"], ["Terminal Block 4P", 4, "connector"]
  ]);
  assert.deepEqual(newestPartDefs[4].pins.map((pin) => [pin.name, pin.pos.x, pin.pos.y]), [
    ...Array.from({ length: 8 }, (_, y) => [String(y + 1), 0, y]),
    ...Array.from({ length: 8 }, (_, index) => [String(index + 9), 3, 7 - index])
  ]);
  assert.deepEqual(newestPartDefs[5].pins.map((pin) => [pin.pos.x, pin.pos.y]),
    Array.from({ length: 10 }, (_, index) => [index % 2, Math.floor(index / 2)]));
  assert.deepEqual(newestPartDefs[7].pins.map((pin) => [pin.pos.x, pin.pos.y]), [[0, 1], [2, 1], [4, 1], [6, 1]]);
  const existing = defaultPartDefs.slice(0, 19);
  const merged = addMissingNewestParts(existing);
  assert.equal(merged.length, 27);
  assert.equal(addMissingNewestParts(merged), merged);
});

test("category migration keeps user choices and assigns old built-ins", () => {
  const older: PartDef[] = defaultPartDefs.slice(0, 19).map((def) => ({ ...def, category: undefined }));
  older[0].category = "other";
  const custom = { ...older[0], id: "99999999-9999-4999-9999-999999999999", category: undefined };
  const categorized = categorizeParts([...older, custom]);
  assert.equal(categorized[0].category, "other");
  assert.equal(categorized[1].category, "passive");
  assert.equal(categorized[3].category, "connector");
  assert.equal(categorized.at(-1)?.category, "other");
  assert.equal(categorizeParts(categorized), categorized);
});

test("six new footprints follow the hole grid and pin order", () => {
  assert.deepEqual(nextPartDefs.map((def) => [def.name, def.pins.length]), [
    ["Capacitor Electrolytic", 2], ["TO-220 3-pin", 3], ["DIP-14 IC", 14],
    ["Slide Switch SPDT", 3], ["Terminal Block 3P", 3], ["Trimmer 3P Inline", 3]
  ]);
  assert.deepEqual(nextPartDefs[0].pins.map((pin) => [pin.name, pin.pos.x, pin.pos.y]), [["+", 1, 1], ["-", 2, 1]]);
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
