import assert from "node:assert/strict";
import test from "node:test";
import { addMissingModules, defaultPartDefs, modulePartDefs, updateBuiltInTopViews } from "../src/defaultParts";
import { applyCoreCommandJson, commandAddPartInstJson, commandRotatePartInstJson, createInitialCoreStateJson, extractViewStateFromCoreJson } from "../src/coreBridge";
import { absolutePins } from "../src/parts";
import { legacyTopViewArt } from "../src/legacyTopViewArt";
import { inflateSync } from "node:zlib";

const [power, can] = modulePartDefs;

test("DC-DC CN1/CN2 pin numbering follows the manual top view", () => {
  assert.deepEqual(power.pins.map(({ name, pos }) => [name, pos.x, pos.y]), [
    ["CN1.1 PG", 0, 0], ["CN1.2 CTRL", 0, 1], ["CN1.3 GND", 0, 2],
    ["CN1.4 GND", 0, 3], ["CN1.5 VIN", 0, 4], ["CN1.6 VIN", 0, 5],
    ["CN2.1 VOUT", 10, 5], ["CN2.2 VOUT", 10, 4], ["CN2.3 VOUT", 10, 3],
    ["CN2.4 GND", 10, 2], ["CN2.5 GND", 10, 1], ["CN2.6 GND", 10, 0]
  ]);
  assert.equal(power.occupied.length, 66);
  assert.deepEqual([Math.min(...power.occupied.map((p) => p.x)), Math.max(...power.occupied.map((p) => p.x)),
    Math.min(...power.occupied.map((p) => p.y)), Math.max(...power.occupied.map((p) => p.y))], [0, 10, 0, 5]);
});

test("MCP25625 rev2023.05 stands on a single 2.54mm 11-pin row", () => {
  assert.deepEqual(can.pins.map(({ name, pos }) => [name, pos.x, pos.y]), [
    ["SCK", 0, 0], ["SO", 1, 0], ["SI", 2, 0], ["CS", 3, 0], ["INT", 4, 0],
    ["RESET", 5, 0], ["V_IO", 6, 0], ["V_DDA", 7, 0], ["GND", 8, 0], ["CANH", 9, 0], ["CANL", 10, 0]
  ]);
  assert.equal(can.occupied.length, 22);
  assert.equal(Math.max(...can.occupied.map((p) => p.y)), 1);
});

test("module catalog migration appends once and preserves user definitions by ID or name", () => {
  const old = defaultPartDefs.slice(0, 41);
  const added = addMissingModules(old);
  assert.equal(added.length, 43);
  assert.equal(addMissingModules(added), added);
  const edited = { ...power, name: "My power module", imageDataUrl: null };
  const sameName = { ...can, id: "12345678-1234-4234-8234-123456789012" };
  const customized = [...old, edited, sameName];
  assert.equal(addMissingModules(customized), customized);
});

test("module placement rejects body overlap and preserves pin row under rotation", async () => {
  const initial = await createInitialCoreStateJson({ width: 30, height: 30, gridPitchMm: 2.54 }, modulePartDefs);
  // The reduced body and its pins fit when placed at board (0,0).
  await applyCoreCommandJson(initial, commandAddPartInstJson(power.id, { x: 0, y: 0 }, "Deg0", "U1"));
  const placed = await applyCoreCommandJson(initial, commandAddPartInstJson(power.id, { x: 3, y: 3 }, "Deg0", "U1"));
  await assert.rejects(applyCoreCommandJson(placed, commandAddPartInstJson(can.id, { x: 4, y: 4 }, "Deg0", "U2")));
  const withCan = await applyCoreCommandJson(placed, commandAddPartInstJson(can.id, { x: 4, y: 13 }, "Deg0", "U2"));
  const inst = extractViewStateFromCoreJson(withCan).parts.find((p) => p.defId === can.id)!;
  const rotated = await applyCoreCommandJson(withCan, commandRotatePartInstJson(inst.id, "Deg90"));
  const turned = extractViewStateFromCoreJson(rotated).parts.find((p) => p.id === inst.id)!;
  assert.deepEqual(absolutePins(can, turned), Array.from({ length: 11 }, (_, y) => ({ x: 4, y: 13 + y })));
});

test("DC-DC artwork trims exactly one cell on each edge without rescaling", () => {
  const pixels = (url: string) => {
    const png = Buffer.from(url.split(",")[1], "base64");
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
    const chunks: Buffer[] = [];
    for (let i = 8; i < png.length;) {
      const size = png.readUInt32BE(i);
      if (png.toString("ascii", i + 4, i + 8) === "IDAT") chunks.push(png.subarray(i + 8, i + 8 + size));
      i += size + 12;
    }
    return { width, height, rows: inflateSync(Buffer.concat(chunks)) };
  };
  const old = pixels(legacyTopViewArt["ae-mymgk00506ersr-5v0"]);
  const current = pixels(power.imageDataUrl!);
  assert.deepEqual([old.width, old.height, current.width, current.height], [104, 64, 88, 48]);
  for (let y = 0; y < current.height; y++) {
    const oldStart = (y + 8) * (1 + old.width * 4) + 1 + 8 * 4;
    const newStart = y * (1 + current.width * 4) + 1;
    assert.equal(old.rows[(y + 8) * (1 + old.width * 4)], 0);
    assert.equal(current.rows[y * (1 + current.width * 4)], 0);
    assert.deepEqual(current.rows.subarray(newStart, newStart + 88 * 4), old.rows.subarray(oldStart, oldStart + 88 * 4));
  }
});

test("DC-DC occupied migration preserves placed pins, wires, custom artwork, and edited footprints", () => {
  const old = { ...power,
    occupied: Array.from({ length: 104 }, (_, i) => ({ x: i % 13 - 1, y: Math.floor(i / 13) - 1 })),
    imageDataUrl: legacyTopViewArt["ae-mymgk00506ersr-5v0"] };
  for (const rot of ["Deg0", "Deg90", "Deg180", "Deg270"] as const) {
    const part = { id: "33333333-3333-4333-8333-333333333333", def_id: power.id, at: { x: 15, y: 15 }, rot, refdes: "U1", net_assign: {} };
    const wires = [{ id: "44444444-4444-4444-8444-444444444444", net_id: "55555555-5555-4555-8555-555555555555", path: [{ x: 15, y: 15 }, { x: 14, y: 15 }] }];
    const state = JSON.stringify({ schema_version: 1, board: { width: 64, height: 40, grid_pitch_mm: 2.54 }, part_defs: [old], part_insts: [part],
      nets: [{ id: wires[0].net_id, name: "VIN" }], wires });
    const result = updateBuiltInTopViews([old], state);
    const updated = JSON.parse(result.coreStateJson!);
    assert.deepEqual(result.partDefs[0].occupied, power.occupied);
    assert.equal(result.partDefs[0].imageDataUrl, power.imageDataUrl);
    assert.deepEqual(updated.part_insts[0], part);
    assert.deepEqual(updated.wires, wires);
    assert.deepEqual(updated.part_defs[0].pins, old.pins);
    assert.deepEqual(updated.part_defs[0].occupied, power.occupied);
    assert.deepEqual(result.blockedNames, []);
    assert.equal(updateBuiltInTopViews(result.partDefs, result.coreStateJson).partDefs, result.partDefs);
    const librarySavedFirst = updateBuiltInTopViews([power], state);
    assert.deepEqual(JSON.parse(librarySavedFirst.coreStateJson!).part_defs[0].occupied, power.occupied);
  }
  const custom = { ...old, imageDataUrl: null, imageScale: 1.5, imageOffsetX: 2 };
  const migrated = updateBuiltInTopViews([custom], null).partDefs[0];
  assert.deepEqual(migrated.occupied, power.occupied);
  assert.equal(migrated.imageDataUrl, null);
  assert.equal(migrated.imageScale, 1.5);
  assert.equal(migrated.imageOffsetX, 2);
  const edited = { ...old, occupied: [{ x: 0, y: 0 }] };
  assert.equal(updateBuiltInTopViews([edited], null).partDefs[0], edited);
});
