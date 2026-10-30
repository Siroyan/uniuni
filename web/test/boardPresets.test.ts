import assert from "node:assert/strict";
import test from "node:test";
import { ARDUINO_BOARD, ARDUINO_HOLES, ARDUINO_OUTLINE, isBoardPoint } from "../src/boardPresets";
import { applyCoreCommandJson, commandResizeBoardJson, commandCommitWireJson, createInitialCoreStateJson, extractViewStateFromCoreJson } from "../src/coreBridge";
import { validateProjectStateJson } from "../src/projectStateValidation";
import { buildProjectZip, parseProjectZip } from "../src/projectPackage";

test("PDF layout has 369 unique holes, including 10 half-pitch DIGITAL holes", () => {
  assert.equal(ARDUINO_HOLES.length, 369);
  assert.equal(new Set(ARDUINO_HOLES.map((p) => `${p.x},${p.y}`)).size, 369);
  assert.equal(ARDUINO_HOLES.filter((p) => isBoardPoint(ARDUINO_BOARD, p)).length, 359);
  assert.equal(isBoardPoint(ARDUINO_BOARD, { x: 4, y: 17 }), true);
  assert.equal(isBoardPoint(ARDUINO_BOARD, { x: 4, y: 18 }), false);
  const xs = ARDUINO_OUTLINE.map((p) => p.x), ys = ARDUINO_OUTLINE.map((p) => p.y);
  assert.ok(Math.abs((Math.max(...xs) - Math.min(...xs)) * 2.54 - 68) < 1e-8);
  assert.ok(Math.abs((Math.max(...ys) - Math.min(...ys)) * 2.54 - 52) < 1e-8);
});

test("profile survives core round-trip and rejects paths through absent holes", async () => {
  const initial = await createInitialCoreStateJson({ width: 64, height: 40, gridPitchMm: 2.54 }, []);
  const cmd = commandResizeBoardJson(21, 20, ARDUINO_BOARD.profile);
  const state = await applyCoreCommandJson(initial, cmd);
  assert.equal(extractViewStateFromCoreJson(state).board.profile, ARDUINO_BOARD.profile);
  validateProjectStateJson(state);
  const netId = "33333333-3333-3333-3333-333333333333";
  await assert.rejects(applyCoreCommandJson(state, commandCommitWireJson(netId, [{ x: 19, y: 4 }, { x: 20, y: 4 }])), /outside board/);
  const valid = await applyCoreCommandJson(state, commandCommitWireJson(netId, [{ x: 19, y: 5 }, { x: 20, y: 5 }]));
  validateProjectStateJson(valid);
  const restored = await parseProjectZip(await buildProjectZip(valid, []));
  assert.equal(extractViewStateFromCoreJson(restored.coreStateJson).board.profile, ARDUINO_BOARD.profile);
  await assert.rejects(applyCoreCommandJson(state, commandResizeBoardJson(22, 20, ARDUINO_BOARD.profile)), /21x20/);
  const malformed = JSON.parse(valid);
  malformed.wires[0].path = [{ x: 19, y: 4 }, { x: 20, y: 4 }];
  assert.throws(() => validateProjectStateJson(JSON.stringify(malformed)), /outside board/);
  const custom = await applyCoreCommandJson(state, commandResizeBoardJson(21, 20));
  assert.equal(extractViewStateFromCoreJson(custom).board.profile, undefined);
  assert.equal(isBoardPoint(extractViewStateFromCoreJson(custom).board, { x: 20, y: 4 }), true);
});
