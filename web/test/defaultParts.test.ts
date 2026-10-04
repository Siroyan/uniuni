import assert from "node:assert/strict";
import test from "node:test";
import { addMissingPinHeaders, pinHeaderPartDefs } from "../src/defaultParts";

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
