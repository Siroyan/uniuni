import type { GridPt, PartDef } from "./types";

function pinHeader(id: string, name: string, positions: GridPt[]): PartDef {
  return {
    id,
    name,
    pins: positions.map((pos, index) => ({ name: String(index + 1), pos })),
    occupied: positions.map((pos) => ({ ...pos })),
    imageDataUrl: null,
    imageScale: 1,
    imageOffsetX: 0,
    imageOffsetY: 0
  };
}

export const pinHeaderPartDefs: PartDef[] = [
  pinHeader(
    "f12e08b7-3b0d-4c07-b9d4-c2cc5b5821fc",
    "Pin Header 1x2",
    [{ x: 0, y: 0 }, { x: 0, y: 1 }]
  ),
  pinHeader(
    "d8d8ecff-4098-4230-8768-517ea384f76a",
    "Pin Header 1x3",
    [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }]
  ),
  pinHeader(
    "0e57e4a2-1c56-4bdc-aa52-d73c778c6949",
    "Pin Header 1x4",
    [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 }]
  ),
  pinHeader(
    "f172bd98-959e-442f-a948-37bd1ebd2fe3",
    "Pin Header 2x3",
    [
      { x: 0, y: 0 }, { x: 1, y: 0 },
      { x: 0, y: 1 }, { x: 1, y: 1 },
      { x: 0, y: 2 }, { x: 1, y: 2 }
    ]
  )
];

export function addMissingPinHeaders(existing: PartDef[]): PartDef[] {
  const ids = new Set(existing.map((def) => def.id));
  const names = new Set(existing.map((def) => def.name));
  const added = pinHeaderPartDefs.filter((def) => !ids.has(def.id) && !names.has(def.name));
  return added.length > 0 ? [...existing, ...added] : existing;
}
