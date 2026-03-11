import assert from "node:assert/strict";
import test from "node:test";
import { __testOnly, commandReplacePartDefsJson } from "../src/coreBridge";
import type { Rot } from "../src/types";

type CoreGridPt = { x: number; y: number };
type CorePartDef = {
  id: string;
  name: string;
  pins: Array<{ name: string; pos: CoreGridPt }>;
  occupied: CoreGridPt[];
};

type CoreState = {
  schema_version: number;
  board: { grid_pitch_mm: number; width: number; height: number };
  part_defs: CorePartDef[];
  part_insts: Array<{
    id: string;
    def_id: string;
    at: CoreGridPt;
    rot: Rot;
    refdes: string;
    net_assign: Record<string, string>;
  }>;
  nets: Array<{ id: string; name: string }>;
  wires: Array<{ id: string; net_id: string; path: CoreGridPt[] }>;
};

const PART_DEF_ID = "11111111-1111-1111-1111-111111111111";
const PART_ID = "22222222-2222-2222-2222-222222222222";
const NET_ID = "33333333-3333-3333-3333-333333333333";

function baseState(): CoreState {
  const state = JSON.parse(__testOnly.fallbackCreateEmptyProjectJson()) as CoreState;
  state.board = { grid_pitch_mm: 2.54, width: 64, height: 40 };
  state.part_defs = [
    {
      id: PART_DEF_ID,
      name: "Test Part",
      pins: [{ name: "1", pos: { x: 0, y: 0 } }],
      occupied: [{ x: 0, y: 0 }]
    }
  ];
  state.part_insts = [
    {
      id: PART_ID,
      def_id: PART_DEF_ID,
      at: { x: 0, y: 0 },
      rot: "Deg0",
      refdes: "U1",
      net_assign: { "1": NET_ID }
    }
  ];
  state.nets = [{ id: NET_ID, name: "N-1" }];
  state.wires = [];
  return state;
}

test("fallback ReplacePartDefs accepts valid update", () => {
  const state = baseState();
  const cmd = commandReplacePartDefsJson([
    {
      id: PART_DEF_ID,
      name: "Updated Part",
      pins: [
        { name: "1", pos: { x: 0, y: 0 } },
        { name: "2", pos: { x: 1, y: 0 } }
      ],
      occupied: [
        { x: 0, y: 0 },
        { x: 1, y: 0 }
      ]
    }
  ]);

  const next = JSON.parse(__testOnly.fallbackApplyCommandJson(JSON.stringify(state), cmd)) as CoreState;
  assert.equal(next.part_defs[0].name, "Updated Part");
  assert.equal(next.part_defs[0].pins.length, 2);
});

test("fallback ReplacePartDefs rejects duplicate part names", () => {
  const state = baseState();
  const cmd = commandReplacePartDefsJson([
    {
      id: "44444444-4444-4444-4444-444444444444",
      name: "Dup",
      pins: [{ name: "1", pos: { x: 0, y: 0 } }],
      occupied: [{ x: 0, y: 0 }]
    },
    {
      id: "55555555-5555-5555-5555-555555555555",
      name: "Dup",
      pins: [{ name: "1", pos: { x: 0, y: 0 } }],
      occupied: [{ x: 0, y: 0 }]
    }
  ]);

  assert.throws(
    () => __testOnly.fallbackApplyCommandJson(JSON.stringify(state), cmd),
    /duplicate part definition name/
  );
});

test("fallback ReplacePartDefs rejects invalid assigned pin after update", () => {
  const state = baseState();
  const cmd = commandReplacePartDefsJson([
    {
      id: PART_DEF_ID,
      name: "Test Part",
      pins: [{ name: "2", pos: { x: 0, y: 0 } }],
      occupied: [{ x: 0, y: 0 }]
    }
  ]);

  assert.throws(
    () => __testOnly.fallbackApplyCommandJson(JSON.stringify(state), cmd),
    /assigned pin not found/
  );
});

test("fallback ReplacePartDefs rejects updates that create part collisions", () => {
  const state = baseState();
  state.part_insts.push({
    id: "66666666-6666-6666-6666-666666666666",
    def_id: PART_DEF_ID,
    at: { x: 1, y: 0 },
    rot: "Deg0",
    refdes: "U2",
    net_assign: {}
  });

  const cmd = commandReplacePartDefsJson([
    {
      id: PART_DEF_ID,
      name: "Test Part",
      pins: [{ name: "1", pos: { x: 0, y: 0 } }],
      occupied: [
        { x: 0, y: 0 },
        { x: 1, y: 0 }
      ]
    }
  ]);

  assert.throws(
    () => __testOnly.fallbackApplyCommandJson(JSON.stringify(state), cmd),
    /part-part occupancy collision/
  );
});
