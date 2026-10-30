import assert from "node:assert/strict";
import test from "node:test";
import { addMissingWaveshareBuck, defaultPartDefs, waveshareBuckPartDef as buck } from "../src/defaultParts";
import { applyCoreCommandJson, commandAddPartInstJson, commandCommitWireJson, createInitialCoreStateJson, runCoreDrcJson } from "../src/coreBridge";

test("Waveshare 29035 wired model maps the four input and six output terminals to the perimeter", () => {
  assert.deepEqual(buck.pins.map(({ name, pos }) => [name, pos.x, pos.y]), [
    ["VIN+1", 0, 1], ["VIN+2", 0, 2], ["VIN-1", 0, 4], ["VIN-2", 0, 5],
    ["VOUT+1", 13, 1], ["VOUT+2", 13, 2], ["VOUT+3", 13, 3],
    ["GND1", 13, 4], ["GND2", 13, 5], ["GND3", 13, 6]
  ]);
  assert.match(buck.name, /Wired$/);
  assert.equal(buck.category, "other");
  assert.equal(buck.occupied.length, 98);
  assert.ok(14 * 2.54 >= 33 && 7 * 2.54 >= 16);
});

test("v12 migration preserves custom IDs/names and appends the Waveshare module once", () => {
  const v11 = defaultPartDefs.slice(0, 43);
  const updated = addMissingWaveshareBuck(v11);
  assert.equal(updated.length, 44);
  assert.equal(updated.at(-1), buck);
  assert.equal(addMissingWaveshareBuck(updated), updated);
  const edited = { ...buck, name: "My supply", imageDataUrl: null };
  const customized = [...v11, edited];
  assert.equal(addMissingWaveshareBuck(customized), customized);
  const sameName = [...v11, { ...buck, id: "12345678-1234-4234-8234-123456789012" }];
  assert.equal(addMissingWaveshareBuck(sameName), sameName);
});

test("wired perimeter connection can route out of the module without crossing its body", async () => {
  const initial = await createInitialCoreStateJson({ width: 30, height: 20, gridPitchMm: 2.54 }, [buck]);
  const placed = await applyCoreCommandJson(initial, commandAddPartInstJson(buck.id, { x: 3, y: 3 }, "Deg0", "U1"));
  const wired = await applyCoreCommandJson(placed, commandCommitWireJson("33333333-3333-4333-8333-333333333333", [
    { x: 3, y: 4 }, { x: 2, y: 4 }
  ]));
  assert.deepEqual(JSON.parse(await runCoreDrcJson(wired)), []);
});
