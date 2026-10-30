import assert from "node:assert/strict";
import test from "node:test";
import { addMissingModules, defaultPartDefs, modulePartDefs } from "../src/defaultParts";
import { applyCoreCommandJson, commandAddPartInstJson, commandRotatePartInstJson, createInitialCoreStateJson, extractViewStateFromCoreJson } from "../src/coreBridge";
import { absolutePins } from "../src/parts";

const [power, can] = modulePartDefs;

test("DC-DC CN1/CN2 pin numbering follows the manual top view", () => {
  assert.deepEqual(power.pins.map(({ name, pos }) => [name, pos.x, pos.y]), [
    ["CN1.1 PG", 0, 0], ["CN1.2 CTRL", 0, 1], ["CN1.3 GND", 0, 2],
    ["CN1.4 GND", 0, 3], ["CN1.5 VIN", 0, 4], ["CN1.6 VIN", 0, 5],
    ["CN2.1 VOUT", 10, 5], ["CN2.2 VOUT", 10, 4], ["CN2.3 VOUT", 10, 3],
    ["CN2.4 GND", 10, 2], ["CN2.5 GND", 10, 1], ["CN2.6 GND", 10, 0]
  ]);
  assert.equal(power.occupied.length, 104);
  assert.deepEqual([Math.min(...power.occupied.map((p) => p.x)), Math.max(...power.occupied.map((p) => p.x)),
    Math.min(...power.occupied.map((p) => p.y)), Math.max(...power.occupied.map((p) => p.y))], [-1, 11, -1, 6]);
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
  // The DC-DC body overhangs its first pin and cannot sit at board (0,0).
  await assert.rejects(applyCoreCommandJson(initial, commandAddPartInstJson(power.id, { x: 0, y: 0 }, "Deg0", "U1")));
  const placed = await applyCoreCommandJson(initial, commandAddPartInstJson(power.id, { x: 3, y: 3 }, "Deg0", "U1"));
  await assert.rejects(applyCoreCommandJson(placed, commandAddPartInstJson(can.id, { x: 4, y: 4 }, "Deg0", "U2")));
  const withCan = await applyCoreCommandJson(placed, commandAddPartInstJson(can.id, { x: 4, y: 13 }, "Deg0", "U2"));
  const inst = extractViewStateFromCoreJson(withCan).parts.find((p) => p.defId === can.id)!;
  const rotated = await applyCoreCommandJson(withCan, commandRotatePartInstJson(inst.id, "Deg90"));
  const turned = extractViewStateFromCoreJson(rotated).parts.find((p) => p.id === inst.id)!;
  assert.deepEqual(absolutePins(can, turned), Array.from({ length: 11 }, (_, y) => ({ x: 4, y: 13 + y })));
});
