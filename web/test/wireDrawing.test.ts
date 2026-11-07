import assert from "node:assert/strict";
import test from "node:test";
import { ARDUINO_BOARD } from "../src/boardPresets";
import { extendWireDraft } from "../src/wireDrawing";

const board = { width: 20, height: 20, gridPitchMm: 2.54 };

test("straight draft extensions include every grid point in all four directions", () => {
  const start = [{ x: 5, y: 5 }];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    assert.deepEqual(extendWireDraft(start, { x: 5 + dx * 4, y: 5 + dy * 4 }, board),
      Array.from({ length: 5 }, (_, i) => ({ x: 5 + dx * i, y: 5 + dy * i })));
  }
  assert.deepEqual(start, [{ x: 5, y: 5 }]);
  const corner = extendWireDraft(start, { x: 8, y: 5 }, board);
  assert.deepEqual(extendWireDraft(corner, { x: 8, y: 7 }, board),
    [...corner, { x: 8, y: 6 }, { x: 8, y: 7 }]);
});

test("duplicate, diagonal, out-of-board, and missing-hole segments leave the draft intact", () => {
  const start = [{ x: 3, y: 18 }];
  assert.equal(extendWireDraft(start, start[0], board), start);
  assert.equal(extendWireDraft(start, { x: 6, y: 17 }, board), start);
  assert.equal(extendWireDraft(start, { x: 20, y: 18 }, board), start);
  // Both endpoints exist, but Arduino has no hole at (4,18).
  assert.equal(extendWireDraft(start, { x: 5, y: 18 }, ARDUINO_BOARD), start);
  const empty: typeof start = [];
  assert.equal(extendWireDraft(empty, { x: 4, y: 18 }, ARDUINO_BOARD), empty);
  assert.deepEqual(extendWireDraft(empty, { x: 3, y: 18 }, ARDUINO_BOARD), start);
});
