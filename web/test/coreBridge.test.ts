import assert from "node:assert/strict";
import test from "node:test";
import {
  __resetCoreRuntimeForTest,
  applyCoreCommandJson,
  commandAssignNetColorJson,
  commandReplacePartDefsJson,
  detectCoreBridgeMode
} from "../src/coreBridge";
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
  nets: Array<{ id: string; name: string; color?: string | null }>;
  wires: Array<{ id: string; net_id: string; path: CoreGridPt[] }>;
};

const PART_DEF_ID = "11111111-1111-1111-1111-111111111111";
const PART_ID = "22222222-2222-2222-2222-222222222222";
const NET_ID = "33333333-3333-3333-3333-333333333333";

function baseState(): CoreState {
  return {
    schema_version: 1,
    board: { grid_pitch_mm: 2.54, width: 64, height: 40 },
    part_defs: [
      {
        id: PART_DEF_ID,
        name: "Test Part",
        pins: [{ name: "1", pos: { x: 0, y: 0 } }],
        occupied: [{ x: 0, y: 0 }]
      }
    ],
    part_insts: [
      {
        id: PART_ID,
        def_id: PART_DEF_ID,
        at: { x: 0, y: 0 },
        rot: "Deg0",
        refdes: "U1",
        net_assign: { "1": NET_ID }
      }
    ],
    nets: [{ id: NET_ID, name: "N-1", color: null }],
    wires: []
  };
}

test("bridge mode is fallback when wasm package is unavailable in test runtime", async () => {
  __resetCoreRuntimeForTest();
  const mode = await detectCoreBridgeMode();
  assert.equal(mode, "fallback");
});

test("bridge can disable fallback via env", async () => {
  const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process
    ?.env;
  if (!env) {
    return;
  }
  const previous = env.UNIUNI_CORE_DISABLE_FALLBACK;
  env.UNIUNI_CORE_DISABLE_FALLBACK = "1";
  __resetCoreRuntimeForTest();
  try {
    await assert.rejects(detectCoreBridgeMode(), /fallback/i);
  } finally {
    if (previous === undefined) {
      delete env.UNIUNI_CORE_DISABLE_FALLBACK;
    } else {
      env.UNIUNI_CORE_DISABLE_FALLBACK = previous;
    }
    __resetCoreRuntimeForTest();
  }
});

test("bridge ReplacePartDefs accepts valid update", async () => {
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

  const nextJson = await applyCoreCommandJson(JSON.stringify(state), cmd);
  const next = JSON.parse(nextJson) as CoreState;
  assert.equal(next.part_defs[0].name, "Updated Part");
  assert.equal(next.part_defs[0].pins.length, 2);
  assert.equal(next.part_insts.length, 1);
  assert.deepEqual(next.part_insts[0].net_assign, { "1": NET_ID });
});

test("bridge ReplacePartDefs rejects duplicate part names", async () => {
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

  await assert.rejects(
    applyCoreCommandJson(JSON.stringify(state), cmd),
    /duplicate part definition name/
  );
});

test("bridge ReplacePartDefs rejects invalid assigned pin after update", async () => {
  const state = baseState();
  const cmd = commandReplacePartDefsJson([
    {
      id: PART_DEF_ID,
      name: "Test Part",
      pins: [{ name: "2", pos: { x: 0, y: 0 } }],
      occupied: [{ x: 0, y: 0 }]
    }
  ]);

  await assert.rejects(
    applyCoreCommandJson(JSON.stringify(state), cmd),
    /assigned pin not found/
  );
});

test("bridge ReplacePartDefs rejects updates that create part collisions", async () => {
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

  await assert.rejects(
    applyCoreCommandJson(JSON.stringify(state), cmd),
    /part-part occupancy collision/
  );
});

test("bridge AssignNetColor can set and clear net color", async () => {
  const state = baseState();
  const withColorJson = await applyCoreCommandJson(
    JSON.stringify(state),
    commandAssignNetColorJson(NET_ID, "#00cc88")
  );
  const withColor = JSON.parse(withColorJson) as CoreState;
  assert.equal(withColor.nets[0].color, "#00cc88");

  const clearedJson = await applyCoreCommandJson(
    withColorJson,
    commandAssignNetColorJson(NET_ID, null)
  );
  const cleared = JSON.parse(clearedJson) as CoreState;
  assert.equal(cleared.nets[0].color, null);
});

test("bridge AssignNetColor rejects invalid color format", async () => {
  const state = baseState();
  await assert.rejects(
    applyCoreCommandJson(JSON.stringify(state), commandAssignNetColorJson(NET_ID, "red")),
    /#RRGGBB/
  );
});
