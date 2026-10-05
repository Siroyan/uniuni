import type { GridPt, PartDef, Rot } from "./types";
import { builtInPartArt } from "./builtInPartArt";
import { partCategory } from "./partCategories";
import { legacyTopViewArt } from "./legacyTopViewArt";
import { rotateRelative } from "./parts";
import { validateProjectStateJson } from "./projectStateValidation";

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
    occupied: occupiedRectangle(2, 3),
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

export const nextPartDefs: PartDef[] = [
  {
    id: "77750a90-4823-4cdf-bfea-a3b36e7872a8",
    name: "Capacitor Electrolytic",
    pins: [{ name: "+", pos: { x: 1, y: 1 } }, { name: "-", pos: { x: 2, y: 1 } }],
    occupied: occupiedRectangle(4, 3),
    imageDataUrl: builtInPartArt["capacitor-electrolytic"],
    imagePixelated: true, imageScale: 1, imageOffsetX: 0, imageOffsetY: 0
  },
  {
    id: "5ed6e5ed-ba33-45d5-aa04-4fe27f9f9ff1",
    name: "TO-220 3-pin",
    pins: [
      { name: "1", pos: { x: 1, y: 2 } },
      { name: "2", pos: { x: 2, y: 2 } },
      { name: "3", pos: { x: 3, y: 2 } }
    ],
    occupied: occupiedRectangle(5, 3),
    imageDataUrl: builtInPartArt["to-220-3-pin"],
    imagePixelated: true, imageScale: 1, imageOffsetX: 0, imageOffsetY: 0
  },
  {
    id: "9429852c-4b26-483b-b302-844d11d3b6e8",
    name: "DIP-14 IC",
    pins: [
      ...Array.from({ length: 7 }, (_, y) => ({ name: String(y + 1), pos: { x: 0, y } })),
      ...Array.from({ length: 7 }, (_, index) => ({ name: String(index + 8), pos: { x: 3, y: 6 - index } }))
    ],
    occupied: occupiedRectangle(4, 7),
    imageDataUrl: builtInPartArt["dip-14-ic"],
    imagePixelated: true, imageScale: 1, imageOffsetX: 0, imageOffsetY: 0
  },
  {
    id: "4bb91cd4-5cee-4cc1-97b4-e75305b5f101",
    name: "Slide Switch SPDT",
    pins: [
      { name: "1", pos: { x: 0, y: 1 } },
      { name: "C", pos: { x: 1, y: 1 } },
      { name: "2", pos: { x: 2, y: 1 } }
    ],
    occupied: occupiedRectangle(3, 2),
    imageDataUrl: builtInPartArt["slide-switch-spdt"],
    imagePixelated: true, imageScale: 1, imageOffsetX: 0, imageOffsetY: 0
  },
  {
    id: "cf3f301b-1aef-407a-8335-dbd07b0a833c",
    name: "Terminal Block 3P",
    pins: [
      { name: "1", pos: { x: 0, y: 1 } },
      { name: "2", pos: { x: 2, y: 1 } },
      { name: "3", pos: { x: 4, y: 1 } }
    ],
    occupied: occupiedRectangle(5, 2),
    imageDataUrl: builtInPartArt["terminal-block-3p"],
    imagePixelated: true, imageScale: 1, imageOffsetX: 0, imageOffsetY: 0
  },
  {
    id: "28adb8b0-79cf-4e9f-8ad5-6b71855fefc1",
    name: "Trimmer 3P Inline",
    pins: [
      { name: "1", pos: { x: 0, y: 2 } },
      { name: "2", pos: { x: 1, y: 2 } },
      { name: "3", pos: { x: 2, y: 2 } }
    ],
    occupied: occupiedRectangle(3, 3),
    imageDataUrl: builtInPartArt["trimmer-3p-inline"],
    imagePixelated: true, imageScale: 1, imageOffsetX: 0, imageOffsetY: 0
  }
];

function illustratedPart(
  id: string, name: string, pins: PartDef["pins"], width: number, height: number, imageDataUrl: string
): PartDef {
  return {
    id, name, pins, occupied: occupiedRectangle(width, height), imageDataUrl,
    imagePixelated: true, imageScale: 1, imageOffsetX: 0, imageOffsetY: 0
  };
}

export const newestPartDefs: PartDef[] = [
  illustratedPart(
    "799559c3-a49b-4905-9b85-777aa4a982c8", "Capacitor Ceramic Disc",
    [{ name: "1", pos: { x: 0, y: 1 } }, { name: "2", pos: { x: 1, y: 1 } }],
    2, 2, builtInPartArt["capacitor-ceramic-disc"]
  ),
  illustratedPart(
    "3ef2adda-02f1-4d21-b0ad-f817993c004e", "Fuse Axial",
    [{ name: "1", pos: { x: 0, y: 0 } }, { name: "2", pos: { x: 3, y: 0 } }],
    4, 1, builtInPartArt["fuse-axial"]
  ),
  illustratedPart(
    "97c4076e-3a81-4a7a-8db7-f187e0157358", "Photoresistor Radial",
    [{ name: "1", pos: { x: 0, y: 1 } }, { name: "2", pos: { x: 1, y: 1 } }],
    2, 3, builtInPartArt["photoresistor-radial"]
  ),
  illustratedPart(
    "008e51b2-6271-4c03-9dac-dc235fe15175", "RGB LED 4-pin",
    Array.from({ length: 4 }, (_, x) => ({ name: String(x + 1), pos: { x, y: 1 } })),
    4, 3, builtInPartArt["rgb-led-4-pin"]
  ),
  illustratedPart(
    "6a69eb4c-d4a1-4121-b5fd-44a0a34ea986", "DIP-16 IC",
    [
      ...Array.from({ length: 8 }, (_, y) => ({ name: String(y + 1), pos: { x: 0, y } })),
      ...Array.from({ length: 8 }, (_, index) => ({ name: String(index + 9), pos: { x: 3, y: 7 - index } }))
    ],
    4, 8, builtInPartArt["dip-16-ic"]
  ),
  pinHeader(
    "3b359d03-cea0-4e3c-a187-fe737dd8d800", "Pin Header 2x5",
    Array.from({ length: 10 }, (_, index) => ({ x: index % 2, y: Math.floor(index / 2) })),
    builtInPartArt["pin-header-2x5"]
  ),
  illustratedPart(
    "78bdfa3c-df5d-4247-bbc9-9feeb9f0a96b", "Buzzer 2P",
    [{ name: "+", pos: { x: 0, y: 2 } }, { name: "-", pos: { x: 2, y: 2 } }],
    3, 3, builtInPartArt["buzzer-2p"]
  ),
  illustratedPart(
    "1b69aec3-cc03-4b3a-9b78-d6f72fdb3adb", "Terminal Block 4P",
    [0, 2, 4, 6].map((x, index) => ({ name: String(index + 1), pos: { x, y: 1 } })),
    7, 2, builtInPartArt["terminal-block-4p"]
  )
].map((def) => ({ ...def, category: partCategory(def) }));

const xhConnectorIds = [
  ["67a6a59b-26fe-5457-bc09-cedc0e59bc2d", "d49f4a2e-2ef2-5d96-99c0-bfc12f054d75"],
  ["b9b383f2-18b6-5f2a-bc4c-f10e502b533b", "85ffdcfa-bd4d-5df7-8903-36c97eeddb54"],
  ["30902d35-1270-5582-b839-a783827fb455", "dde28fcc-7b06-5b3f-8f75-359c1918a98a"],
  ["cd106528-d815-513b-ae86-759b09f9ee1a", "ca000452-17d1-595b-91aa-d918e931c734"],
  ["4eb85419-a82d-5e5e-8888-a98c6355b3ff", "21e3a7ae-2575-5e8b-b61d-f2183aa16602"]
] as const;

function xhConnector(pins: number, orientation: "Top" | "Side", id: string): PartDef {
  const artName = `xh-connector-${pins}p-${orientation.toLowerCase()}` as keyof typeof builtInPartArt;
  return {
    ...illustratedPart(
      id,
      `XH Connector ${pins}P ${orientation}`,
      Array.from({ length: pins }, (_, index) => ({ name: String(index + 1), pos: { x: index + 1, y: 1 } })),
      pins + 2,
      orientation === "Top" ? 3 : 6,
      builtInPartArt[artName]
    ),
    category: "connector"
  };
}

export const xhConnectorPartDefs: PartDef[] = xhConnectorIds.flatMap(([topId, sideId], index) => [
  xhConnector(index + 2, "Top", topId),
  xhConnector(index + 2, "Side", sideId)
]);

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
  ...additionalPartDefs,
  ...nextPartDefs,
  ...newestPartDefs,
  ...xhConnectorPartDefs
].map((def) => ({ ...def, category: partCategory(def) }));

const topViewArtById: Record<string, string> = {
  "77750a90-4823-4cdf-bfea-a3b36e7872a8": "capacitor-electrolytic",
  "25da8655-cbdc-4221-b7c3-6c13bde21d75": "led-5mm",
  "8acc092b-3960-46cb-b0f2-0995cc01a107": "transistor-to-92",
  "5ed6e5ed-ba33-45d5-aa04-4fe27f9f9ff1": "to-220-3-pin",
  "799559c3-a49b-4905-9b85-777aa4a982c8": "capacitor-ceramic-disc",
  "97c4076e-3a81-4a7a-8db7-f187e0157358": "photoresistor-radial",
  "008e51b2-6271-4c03-9dac-dc235fe15175": "rgb-led-4-pin"
};

const oldTopViewFootprints: Record<string, Pick<PartDef, "pins" | "occupied">> = {
  "77750a90-4823-4cdf-bfea-a3b36e7872a8": {
    pins: [{ name: "+", pos: { x: 0, y: 1 } }, { name: "-", pos: { x: 1, y: 1 } }],
    occupied: occupiedRectangle(2, 2)
  },
  "25da8655-cbdc-4221-b7c3-6c13bde21d75": {
    pins: [{ name: "A", pos: { x: 0, y: 1 } }, { name: "K", pos: { x: 1, y: 1 } }],
    occupied: occupiedRectangle(2, 2)
  },
  "97c4076e-3a81-4a7a-8db7-f187e0157358": {
    pins: [{ name: "1", pos: { x: 0, y: 1 } }, { name: "2", pos: { x: 1, y: 1 } }],
    occupied: occupiedRectangle(2, 2)
  },
  "008e51b2-6271-4c03-9dac-dc235fe15175": {
    pins: Array.from({ length: 4 }, (_, x) => ({ name: String(x + 1), pos: { x, y: 1 } })),
    occupied: occupiedRectangle(4, 2)
  }
};

type SavedTopViewState = {
  part_defs: Array<Pick<PartDef, "id" | "name" | "pins" | "occupied">>;
  part_insts: Array<{ def_id: string; at: GridPt; rot: Rot }>;
};

type TopViewUpdate = { partDefs: PartDef[]; coreStateJson: string | null; blockedNames: string[] };

/** Upgrade untouched stock art and shift placed instances only when their pins and board occupancy stay valid. */
export function updateBuiltInTopViews(existing: PartDef[], coreStateJson: string | null): TopViewUpdate {
  const canonicalById = new Map(defaultPartDefs.map((def) => [def.id, def]));
  let stateJson = coreStateJson;
  let validSavedState = false;
  if (stateJson) {
    try {
      validateProjectStateJson(stateJson);
      validSavedState = true;
    } catch {
      // The restore path below will start a fresh project for invalid snapshots.
    }
  }
  const blockedNames: string[] = [];
  const updated = existing.map((def) => {
    const name = topViewArtById[def.id];
    const canonical = canonicalById.get(def.id);
    if (!name || !canonical || def.name !== canonical.name
      || (def.imageScale ?? 1) !== 1 || (def.imageOffsetX ?? 0) !== 0 || (def.imageOffsetY ?? 0) !== 0) return def;
    const oldFootprint = oldTopViewFootprints[def.id] ?? canonical;
    const matchesFootprint = (candidate: Pick<PartDef, "pins" | "occupied">, reference: Pick<PartDef, "pins" | "occupied">): boolean =>
      JSON.stringify(candidate.pins) === JSON.stringify(reference.pins)
      && JSON.stringify(candidate.occupied) === JSON.stringify(reference.occupied);
    const hasOldStock = def.imageDataUrl === legacyTopViewArt[name] && matchesFootprint(def, oldFootprint);
    const hasNewStock = def.imageDataUrl === canonical.imageDataUrl && matchesFootprint(def, canonical);
    if (!hasOldStock && !hasNewStock) return def;
    if (oldTopViewFootprints[def.id] && validSavedState && stateJson) {
      const candidate = JSON.parse(stateJson) as SavedTopViewState;
      const placed = candidate.part_insts.filter((inst) => inst.def_id === def.id);
      if (placed.length > 0) {
        const coreDef = candidate.part_defs.find((item) => item.id === def.id);
        if (!coreDef || (!matchesFootprint(coreDef, oldFootprint) && !matchesFootprint(coreDef, canonical))) {
          blockedNames.push(def.name);
          return def;
        }
        if (matchesFootprint(coreDef, oldFootprint)) {
          const firstOldPin = oldFootprint.pins[0];
          const firstNewPin = canonical.pins.find((pin) => pin.name === firstOldPin.name);
          if (!firstNewPin) return def;
          const originShift = {
            x: firstOldPin.pos.x - firstNewPin.pos.x,
            y: firstOldPin.pos.y - firstNewPin.pos.y
          };
          for (const inst of placed) {
            const shift = rotateRelative(originShift, inst.rot);
            inst.at = { x: inst.at.x + shift.x, y: inst.at.y + shift.y };
          }
          coreDef.pins = canonical.pins;
          coreDef.occupied = canonical.occupied;
          const candidateJson = JSON.stringify(candidate);
          try {
            validateProjectStateJson(candidateJson);
            stateJson = candidateJson;
          } catch {
            blockedNames.push(def.name);
            if (hasOldStock) return def;
            return { ...def, pins: oldFootprint.pins, occupied: oldFootprint.occupied,
              imageDataUrl: legacyTopViewArt[name] };
          }
        }
      }
    }
    if (hasNewStock) return def;
    return {
      ...def,
      pins: canonical.pins.map((pin) => ({ name: pin.name, pos: { ...pin.pos } })),
      occupied: canonical.occupied.map((cell) => ({ ...cell })),
      imageDataUrl: canonical.imageDataUrl,
      imagePixelated: true
    };
  });
  const changed = updated.some((def, index) => def !== existing[index]);
  return { partDefs: changed ? updated : existing, coreStateJson: stateJson, blockedNames };
}

const oldRadialCapacitorArt = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAICAYAAADwdn+XAAAAe0lEQVR42mNkwAKK7Qz+YxPvPXSBEV2MBZvmnil+KGIvd5+GMf+jG8KCrrnUXxKb5QyCOnIMpVgMYcGmGMlGgoDlxoPncP/OjvMkShOyHpb1Ow9hKLh0+ROmrstXGPR0+RgYGBgYkPUwYgtEdyVurDbvvPcVIyYYKY1GANN1MojLEkX8AAAAAElFTkSuQmCC";

/** Update only unchanged stock footprints. The 1x2 header is explicitly replaced, including user artwork. */
export function correctBuiltInArtwork(existing: PartDef[]): PartDef[] {
  const targets = [defaultPartDefs[1], pinHeaderPartDefs[0]];
  let changed = false;
  const updated = existing.map((def) => {
    const canonical = targets.find((candidate) => candidate.id === def.id);
    if (!canonical || def.name !== canonical.name
      || JSON.stringify(def.pins) !== JSON.stringify(canonical.pins)
      || JSON.stringify(def.occupied) !== JSON.stringify(canonical.occupied)) return def;
    if (canonical.name === "Capacitor Radial" && def.imageDataUrl !== oldRadialCapacitorArt && def.imageDataUrl != null) return def;
    if (def.imageDataUrl === canonical.imageDataUrl && def.imagePixelated === true
      && def.imageScale === 1 && def.imageOffsetX === 0 && def.imageOffsetY === 0) return def;
    changed = true;
    return { ...def, imageDataUrl: canonical.imageDataUrl, imagePixelated: true,
      imageScale: 1, imageOffsetX: 0, imageOffsetY: 0 };
  });
  return changed ? updated : existing;
}

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

export function addMissingNextParts(existing: PartDef[]): PartDef[] {
  return appendMissingParts(existing, nextPartDefs);
}

export function addMissingNewestParts(existing: PartDef[]): PartDef[] {
  return appendMissingParts(existing, newestPartDefs);
}

export function addMissingXhConnectors(existing: PartDef[]): PartDef[] {
  return appendMissingParts(existing, xhConnectorPartDefs);
}

function appendMissingParts(existing: PartDef[], candidates: PartDef[]): PartDef[] {
  const ids = new Set(existing.map((def) => def.id));
  const names = new Set(existing.map((def) => def.name));
  const added = candidates.filter((def) => !ids.has(def.id) && !names.has(def.name));
  return added.length > 0 ? [...existing, ...added] : existing;
}
