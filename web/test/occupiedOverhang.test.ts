import assert from "node:assert/strict";
import test from "node:test";
import { applyCoreCommandJson, commandAddPartInstJson, commandMoveRotatePartInstJson, commandResizeBoardJson, createInitialCoreStateJson, extractViewStateFromCoreJson, runCoreDrcJson } from "../src/coreBridge";
import { defaultPartDefs, updateBuiltInTopViews } from "../src/defaultParts";
import { legacyTopViewArt } from "../src/legacyTopViewArt";
import { canPlacePart } from "../src/parts";
import { buildProjectZip, parseProjectZip } from "../src/projectPackage";
import { validateProjectStateJson } from "../src/projectStateValidation";
import type { PartInst, Rot } from "../src/types";

const spdt = defaultPartDefs.find((def) => def.name === "Slide Switch SPDT")!;
const board = { width: 3, height: 3, gridPitchMm: 2.54 };

test("3x3 SPDT overhangs all four edges through move/rotation and ZIP round-trip", async () => {
  assert.equal(spdt.occupied.length, 9);
  let json = await createInitialCoreStateJson(board, [spdt]);
  json = await applyCoreCommandJson(json, commandAddPartInstJson(spdt.id, { x: 0, y: -1 }, "Deg0", "SW1"));
  const id = extractViewStateFromCoreJson(json).parts[0].id;
  for (const [x, y, rot] of [[0, -1, "Deg0"], [1, 0, "Deg90"], [2, 3, "Deg180"], [1, 2, "Deg270"]] as Array<[number, number, Rot]>) {
    const candidate: PartInst = { id, defId: spdt.id, at: { x, y }, rot, refdes: "SW1", netAssign: {} };
    assert.equal(canPlacePart(board, [], new Map([[spdt.id, spdt]]), candidate), true);
    json = await applyCoreCommandJson(json, commandMoveRotatePartInstJson(id, candidate.at, rot));
    validateProjectStateJson(json);
    assert.deepEqual(JSON.parse(await runCoreDrcJson(json)), []);
    const restored = await parseProjectZip(await buildProjectZip(json, [spdt]));
    assert.deepEqual(extractViewStateFromCoreJson(restored.coreStateJson).parts[0], candidate);
  }
  await assert.rejects(applyCoreCommandJson(json, commandMoveRotatePartInstJson(id, { x: -1, y: -1 }, "Deg0")));
});

test("pins outside occupancy remain bounded and off-board body collisions remain errors", async () => {
  const def = { ...spdt, pins: [{ name: "1", pos: { x: 0, y: 0 } }], occupied: [{ x: -1, y: -1 }] };
  let json = await createInitialCoreStateJson(board, [def]);
  json = await applyCoreCommandJson(json, commandAddPartInstJson(def.id, { x: 0, y: 0 }, "Deg0", "SW1"));
  json = await applyCoreCommandJson(json, commandResizeBoardJson(1, 1));
  assert.deepEqual(JSON.parse(await runCoreDrcJson(json)), []);
  await assert.rejects(applyCoreCommandJson(json, commandAddPartInstJson(def.id, { x: 0, y: 0 }, "Deg0", "SW2")));
  const invalid = JSON.parse(json);
  invalid.part_insts[0].at.x = -1;
  assert.throws(() => validateProjectStateJson(JSON.stringify(invalid)), /pin outside board/);
  assert.ok(JSON.parse(await runCoreDrcJson(JSON.stringify(invalid))).some((issue: { code: string }) => issue.code === "PART_COLLISION"));
});

test("SPDT migration preserves pins/custom art and defers a footprint that would collide", () => {
  const old = { ...spdt, occupied: spdt.occupied.filter((pt) => pt.y < 2), imageDataUrl: legacyTopViewArt["slide-switch-spdt"] };
  const migrated = updateBuiltInTopViews([old], null).partDefs[0];
  assert.deepEqual(migrated.pins, old.pins);
  assert.deepEqual(migrated.occupied, spdt.occupied);
  assert.equal(migrated.imageDataUrl, spdt.imageDataUrl);
  const custom = { ...old, imageDataUrl: null, imageScale: 1.5 };
  const customResult = updateBuiltInTopViews([custom], null).partDefs[0];
  assert.equal(customResult.imageDataUrl, null);
  assert.equal(customResult.imageScale, 1.5);
  assert.deepEqual(customResult.occupied, spdt.occupied);
  const edited = { ...old, occupied: [{ x: 0, y: 0 }] };
  assert.equal(updateBuiltInTopViews([edited], null).partDefs[0], edited);
  const other = { ...spdt, id: "12345678-1234-4234-8234-123456789012", name: "Other", pins: [{ name: "1", pos: { x: 0, y: 0 } }], occupied: [{ x: 0, y: 0 }] };
  const state = JSON.stringify({ schema_version: 1, board: { width: 3, height: 3, grid_pitch_mm: 2.54 }, part_defs: [old, other],
    part_insts: [
      { id: "33333333-3333-4333-8333-333333333333", def_id: old.id, at: { x: 0, y: 0 }, rot: "Deg0", refdes: "SW1", net_assign: {} },
      { id: "44444444-4444-4444-8444-444444444444", def_id: other.id, at: { x: 0, y: 2 }, rot: "Deg0", refdes: "U1", net_assign: {} }
    ], nets: [], wires: [] });
  const blocked = updateBuiltInTopViews([old, other], state);
  assert.equal(blocked.partDefs[0], old);
  assert.equal(blocked.coreStateJson, state);
  assert.deepEqual(blocked.blockedNames, [spdt.name]);
  const librarySavedFirst = updateBuiltInTopViews([spdt, other], state);
  assert.deepEqual(librarySavedFirst.partDefs[0].occupied, old.occupied);
  assert.equal(librarySavedFirst.partDefs[0].imageDataUrl, old.imageDataUrl);
  assert.equal(librarySavedFirst.coreStateJson, state);
});

test("Arduino holes constrain pins while body cells may cover hole-free positions", async () => {
  const def = { ...spdt, pins: [{ name: "1", pos: { x: 0, y: 0 } }], occupied: [{ x: 0, y: 0 }, { x: 0, y: -1 }] };
  const board = { width: 21, height: 20, gridPitchMm: 2.54, profile: "arduino-uprotoshield-i" as const };
  const initial = await createInitialCoreStateJson(board, [def]);
  const placed = await applyCoreCommandJson(initial, commandAddPartInstJson(def.id, { x: 0, y: 3 }, "Deg0", "SW1"));
  validateProjectStateJson(placed);
  assert.deepEqual(JSON.parse(await runCoreDrcJson(placed)), []);
  await assert.rejects(applyCoreCommandJson(initial, commandAddPartInstJson(def.id, { x: 0, y: 2 }, "Deg0", "SW1")));
});
