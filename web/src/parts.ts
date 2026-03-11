import type { Board, GridPt, PartDef, PartInst, Rot, Wire } from "./types";

export function rotateRelative(pt: GridPt, rot: Rot): GridPt {
  switch (rot) {
    case "Deg0":
      return pt;
    case "Deg90":
      return { x: -pt.y, y: pt.x };
    case "Deg180":
      return { x: -pt.x, y: -pt.y };
    case "Deg270":
      return { x: pt.y, y: -pt.x };
  }
}

export function absoluteOccupied(def: PartDef, inst: PartInst): GridPt[] {
  return def.occupied.map((rel) => {
    const turned = rotateRelative(rel, inst.rot);
    return { x: inst.at.x + turned.x, y: inst.at.y + turned.y };
  });
}

export function absolutePins(def: PartDef, inst: PartInst): GridPt[] {
  return def.pins.map((pin) => {
    const turned = rotateRelative(pin.pos, inst.rot);
    return { x: inst.at.x + turned.x, y: inst.at.y + turned.y };
  });
}

export function isInsideBoard(board: Board, pt: GridPt): boolean {
  return pt.x >= 0 && pt.y >= 0 && pt.x < board.width && pt.y < board.height;
}

export function canPlacePart(
  board: Board,
  parts: PartInst[],
  defsById: Map<string, PartDef>,
  candidate: PartInst,
  ignoreId?: string
): boolean {
  const candidateDef = defsById.get(candidate.defId);
  if (!candidateDef) return false;

  const occupiedCandidate = absoluteOccupied(candidateDef, candidate);
  if (!occupiedCandidate.every((pt) => isInsideBoard(board, pt))) {
    return false;
  }

  for (const existing of parts) {
    if (existing.id === ignoreId) continue;
    const existingDef = defsById.get(existing.defId);
    if (!existingDef) continue;
    const occupiedExisting = absoluteOccupied(existingDef, existing);
    for (const pt of occupiedCandidate) {
      if (occupiedExisting.some((other) => other.x === pt.x && other.y === pt.y)) {
        return false;
      }
    }
  }

  return true;
}

export function findPartAtGrid(
  pt: GridPt,
  parts: PartInst[],
  defsById: Map<string, PartDef>
): string | null {
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const part = parts[i];
    const def = defsById.get(part.defId);
    if (!def) continue;
    const occupied = absoluteOccupied(def, part);
    if (occupied.some((cell) => cell.x === pt.x && cell.y === pt.y)) {
      return part.id;
    }
  }
  return null;
}

function findPartPinAtGrid(
  pt: GridPt,
  parts: PartInst[],
  defsById: Map<string, PartDef>
): string | null {
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const part = parts[i];
    const def = defsById.get(part.defId);
    if (!def) continue;
    const pins = absolutePins(def, part);
    if (pins.some((pin) => pin.x === pt.x && pin.y === pt.y)) {
      return part.id;
    }
  }
  return null;
}

export type HitCandidate =
  | { kind: "part"; partId: string; source: "pin" | "occupied" }
  | { kind: "wire"; wireId: string };

export function hitCandidateKey(candidate: HitCandidate): string {
  return candidate.kind === "part" ? `part:${candidate.partId}` : `wire:${candidate.wireId}`;
}

export function buildHitCandidates(
  pt: GridPt,
  parts: PartInst[],
  wires: Wire[],
  defsById: Map<string, PartDef>
): HitCandidate[] {
  const candidates: HitCandidate[] = [];
  const pinPartId = findPartPinAtGrid(pt, parts, defsById);
  if (pinPartId) {
    candidates.push({ kind: "part", partId: pinPartId, source: "pin" });
  }

  for (let i = wires.length - 1; i >= 0; i -= 1) {
    const wire = wires[i];
    if (wire.path.some((node) => node.x === pt.x && node.y === pt.y)) {
      candidates.push({ kind: "wire", wireId: wire.id });
    }
  }

  const occupiedPartId = findPartAtGrid(pt, parts, defsById);
  if (occupiedPartId && occupiedPartId !== pinPartId) {
    candidates.push({ kind: "part", partId: occupiedPartId, source: "occupied" });
  }
  return candidates;
}

export function nextHitCandidateIndex(
  candidates: HitCandidate[],
  currentKey: string | null,
  reverse = false
): number {
  if (candidates.length === 0) return -1;
  const currentIndex = currentKey
    ? candidates.findIndex((candidate) => hitCandidateKey(candidate) === currentKey)
    : -1;

  if (reverse) {
    if (currentIndex < 0) return candidates.length - 1;
    return currentIndex === 0 ? candidates.length - 1 : currentIndex - 1;
  }

  if (currentIndex < 0) return 0;
  return (currentIndex + 1) % candidates.length;
}

export function nextRot(rot: Rot): Rot {
  switch (rot) {
    case "Deg0":
      return "Deg90";
    case "Deg90":
      return "Deg180";
    case "Deg180":
      return "Deg270";
    case "Deg270":
      return "Deg0";
  }
}
