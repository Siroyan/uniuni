import type { GridPt, PartDef } from "./types";
import { builtInPartArt } from "./builtInPartArt";

function pinHeader(id: string, name: string, positions: GridPt[], art: string): PartDef {
  return {
    id,
    name,
    pins: positions.map((pos, index) => ({ name: String(index + 1), pos })),
    occupied: positions.map((pos) => ({ ...pos })),
    imageDataUrl: art,
    imagePixelated: true,
    imageScale: 1,
    imageOffsetX: 0,
    imageOffsetY: 0
  };
}

export const pinHeaderPartDefs: PartDef[] = [
  pinHeader(
    "f12e08b7-3b0d-4c07-b9d4-c2cc5b5821fc",
    "Pin Header 1x2",
    [{ x: 0, y: 0 }, { x: 0, y: 1 }],
    builtInPartArt["pin-header-1x2"]
  ),
  pinHeader(
    "d8d8ecff-4098-4230-8768-517ea384f76a",
    "Pin Header 1x3",
    [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }],
    builtInPartArt["pin-header-1x3"]
  ),
  pinHeader(
    "0e57e4a2-1c56-4bdc-aa52-d73c778c6949",
    "Pin Header 1x4",
    [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 }],
    builtInPartArt["pin-header-1x4"]
  ),
  pinHeader(
    "f172bd98-959e-442f-a948-37bd1ebd2fe3",
    "Pin Header 2x3",
    [
      { x: 0, y: 0 }, { x: 1, y: 0 },
      { x: 0, y: 1 }, { x: 1, y: 1 },
      { x: 0, y: 2 }, { x: 1, y: 2 }
    ],
    builtInPartArt["pin-header-2x3"]
  )
];

function occupiedRectangle(width: number, height: number): GridPt[] {
  return Array.from({ length: width * height }, (_, index) => ({
    x: index % width,
    y: Math.floor(index / width)
  }));
}

export const additionalPartDefs: PartDef[] = [
  {
    id: "a9bf042c-20cf-429a-97e3-14aaac011571",
    name: "Diode Axial",
    pins: [
      { name: "A", pos: { x: 0, y: 0 } },
      { name: "K", pos: { x: 2, y: 0 } }
    ],
    occupied: occupiedRectangle(3, 1),
    imageDataUrl: builtInPartArt["diode-axial"],
    imagePixelated: true,
    imageScale: 1,
    imageOffsetX: 0,
    imageOffsetY: 0
  },
  {
    id: "25da8655-cbdc-4221-b7c3-6c13bde21d75",
    name: "LED 5mm",
    pins: [
      { name: "A", pos: { x: 0, y: 1 } },
      { name: "K", pos: { x: 1, y: 1 } }
    ],
    occupied: occupiedRectangle(2, 2),
    imageDataUrl: builtInPartArt["led-5mm"],
    imagePixelated: true,
    imageScale: 1,
    imageOffsetX: 0,
    imageOffsetY: 0
  },
  {
    id: "8acc092b-3960-46cb-b0f2-0995cc01a107",
    name: "Transistor TO-92",
    pins: [
      { name: "1", pos: { x: 0, y: 1 } },
      { name: "2", pos: { x: 1, y: 1 } },
      { name: "3", pos: { x: 2, y: 1 } }
    ],
    occupied: occupiedRectangle(3, 2),
    imageDataUrl: builtInPartArt["transistor-to-92"],
    imagePixelated: true,
    imageScale: 1,
    imageOffsetX: 0,
    imageOffsetY: 0
  },
  {
    id: "ac18d4fc-a392-4a23-9783-787704df3e09",
    name: "DIP-8 IC",
    pins: [
      { name: "1", pos: { x: 0, y: 0 } },
      { name: "2", pos: { x: 0, y: 1 } },
      { name: "3", pos: { x: 0, y: 2 } },
      { name: "4", pos: { x: 0, y: 3 } },
      { name: "5", pos: { x: 3, y: 3 } },
      { name: "6", pos: { x: 3, y: 2 } },
      { name: "7", pos: { x: 3, y: 1 } },
      { name: "8", pos: { x: 3, y: 0 } }
    ],
    occupied: occupiedRectangle(4, 4),
    imageDataUrl: builtInPartArt["dip-8-ic"],
    imagePixelated: true,
    imageScale: 1,
    imageOffsetX: 0,
    imageOffsetY: 0
  },
  {
    id: "53000741-8a21-48a3-92c3-22fdb3769ff5",
    name: "Terminal Block 2P",
    pins: [
      { name: "1", pos: { x: 0, y: 1 } },
      { name: "2", pos: { x: 2, y: 1 } }
    ],
    occupied: occupiedRectangle(3, 2),
    imageDataUrl: builtInPartArt["terminal-block-2p"],
    imagePixelated: true,
    imageScale: 1,
    imageOffsetX: 0,
    imageOffsetY: 0
  },
  {
    id: "fb6a0559-572f-4f65-a3e9-3f6f8029aa26",
    name: "Push Button 2P",
    pins: [
      { name: "1", pos: { x: 0, y: 1 } },
      { name: "2", pos: { x: 2, y: 1 } }
    ],
    occupied: occupiedRectangle(3, 3),
    imageDataUrl: builtInPartArt["push-button-2p"],
    imagePixelated: true,
    imageScale: 1,
    imageOffsetX: 0,
    imageOffsetY: 0
  }
];

export const defaultPartDefs: PartDef[] = [
  {
    id: "ad7ecaa0-4c74-4a0f-a7ba-a0f1fa0f12a1",
    name: "Resistor Axial",
    pins: [
      { name: "1", pos: { x: 0, y: 0 } },
      { name: "2", pos: { x: 2, y: 0 } }
    ],
    occupied: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
    imageDataUrl: builtInPartArt["resistor-axial"],
    imagePixelated: true,
    imageScale: 1,
    imageOffsetX: 0,
    imageOffsetY: 0
  },
  {
    id: "f222f718-6ff6-42a6-b2ba-4c62090d8ca5",
    name: "Capacitor Radial",
    pins: [
      { name: "1", pos: { x: 0, y: 0 } },
      { name: "2", pos: { x: 1, y: 0 } }
    ],
    occupied: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
    imageDataUrl: builtInPartArt["capacitor-radial"],
    imagePixelated: true,
    imageScale: 1,
    imageOffsetX: 0,
    imageOffsetY: 0
  },
  {
    id: "01d260e9-ea3a-488f-9e8a-031ca0d679ce",
    name: "Inductor Axial",
    pins: [
      { name: "1", pos: { x: 0, y: 0 } },
      { name: "2", pos: { x: 3, y: 0 } }
    ],
    occupied: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }],
    imageDataUrl: builtInPartArt["inductor-axial"],
    imagePixelated: true,
    imageScale: 1,
    imageOffsetX: 0,
    imageOffsetY: 0
  },
  ...pinHeaderPartDefs,
  ...additionalPartDefs
];

export function addBuiltInArtwork(existing: PartDef[]): PartDef[] {
  const canonicalById = new Map(defaultPartDefs.map((def) => [def.id, def]));
  let changed = false;
  const updated = existing.map((def) => {
    const canonical = canonicalById.get(def.id);
    if (!canonical || def.imageDataUrl || def.name !== canonical.name
      || JSON.stringify(def.pins) !== JSON.stringify(canonical.pins)
      || JSON.stringify(def.occupied) !== JSON.stringify(canonical.occupied)) return def;
    changed = true;
    return { ...def, imageDataUrl: canonical.imageDataUrl, imagePixelated: true };
  });
  return changed ? updated : existing;
}

export function addMissingPinHeaders(existing: PartDef[]): PartDef[] {
  return appendMissingParts(existing, pinHeaderPartDefs);
}

export function addMissingAdditionalParts(existing: PartDef[]): PartDef[] {
  return appendMissingParts(existing, additionalPartDefs);
}

function appendMissingParts(existing: PartDef[], candidates: PartDef[]): PartDef[] {
  const ids = new Set(existing.map((def) => def.id));
  const names = new Set(existing.map((def) => def.name));
  const added = candidates.filter((def) => !ids.has(def.id) && !names.has(def.name));
  return added.length > 0 ? [...existing, ...added] : existing;
}
