import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHitCandidates,
  hitCandidateKey,
  nextHitCandidateIndex
} from "../src/parts";
import type { HitCandidate } from "../src/parts";
import type { PartDef, PartInst, Wire } from "../src/types";

const PART_DEF: PartDef = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Test Part",
  pins: [
    { name: "1", pos: { x: 0, y: 0 } },
    { name: "2", pos: { x: 2, y: 0 } }
  ],
  occupied: [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 0 }
  ],
  imageScale: 1,
  imageOffsetX: 0,
  imageOffsetY: 0
};

const PARTS: PartInst[] = [
  {
    id: "part-a",
    defId: PART_DEF.id,
    at: { x: 10, y: 10 },
    rot: "Deg0",
    refdes: "U1",
    netAssign: {}
  }
];

test("buildHitCandidates prioritizes pin over wire on shared point", () => {
  const wires: Wire[] = [
    {
      id: "wire-a",
      netId: "net-1",
      path: [
        { x: 10, y: 10 },
        { x: 11, y: 10 }
      ]
    }
  ];
  const defsById = new Map<string, PartDef>([[PART_DEF.id, PART_DEF]]);
  const candidates = buildHitCandidates({ x: 10, y: 10 }, PARTS, wires, defsById);
  assert.deepEqual(candidates.map((candidate) => hitCandidateKey(candidate)), [
    "part:part-a",
    "wire:wire-a"
  ]);
  assert.equal(candidates[0]?.kind, "part");
  assert.equal(candidates[0]?.kind === "part" ? candidates[0].source : "", "pin");
});

test("buildHitCandidates prioritizes wire over occupied cell when point is not a pin", () => {
  const wires: Wire[] = [
    {
      id: "wire-b",
      netId: "net-1",
      path: [
        { x: 11, y: 10 },
        { x: 12, y: 10 }
      ]
    }
  ];
  const defsById = new Map<string, PartDef>([[PART_DEF.id, PART_DEF]]);
  const candidates = buildHitCandidates({ x: 11, y: 10 }, PARTS, wires, defsById);
  assert.deepEqual(candidates.map((candidate) => hitCandidateKey(candidate)), [
    "wire:wire-b",
    "part:part-a"
  ]);
  assert.equal(candidates[1]?.kind, "part");
  assert.equal(candidates[1]?.kind === "part" ? candidates[1].source : "", "occupied");
});

test("nextHitCandidateIndex cycles forward and backward", () => {
  const candidates: HitCandidate[] = [
    { kind: "part", partId: "p1", source: "pin" as const },
    { kind: "wire", wireId: "w1" },
    { kind: "part", partId: "p2", source: "occupied" as const }
  ];
  assert.equal(nextHitCandidateIndex(candidates, null, false), 0);
  assert.equal(nextHitCandidateIndex(candidates, "part:p1", false), 1);
  assert.equal(nextHitCandidateIndex(candidates, "part:p2", false), 0);

  assert.equal(nextHitCandidateIndex(candidates, null, true), 2);
  assert.equal(nextHitCandidateIndex(candidates, "part:p1", true), 2);
  assert.equal(nextHitCandidateIndex(candidates, "wire:w1", true), 0);
});
