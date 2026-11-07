import type { PartDef } from "./types";
import { builtInPartArt } from "./builtInPartArt";

const rectangle = (width: number, height: number) =>
  Array.from({ length: width * height }, (_, i) => ({ x: i % width, y: Math.floor(i / width) }));

// Stable IDs: the family and pitch are encoded explicitly, never derived from display names.
const families = [
  { name: "Resistor", art: "resistor", prefix: "R", category: "passive", height: 1 },
  { name: "Capacitor", art: "capacitor", prefix: "C", category: "passive", height: 2 },
  { name: "Inductor", art: "inductor", prefix: "L", category: "passive", height: 1 },
  { name: "Diode", art: "diode", prefix: "D", category: "semiconductor", height: 1 }
] as const;

export const leadSpacingPartDefs: PartDef[] = families.flatMap((family, familyIndex) =>
  [2, 3, 4, 5, 6].map((pitch) => ({
    id: `b7a15000-000${familyIndex + 1}-4000-8000-00000000000${pitch}`,
    name: `${family.name} ${pitch}-grid`,
    category: family.category,
    pins: [family.name === "Diode" ? "A" : "1", family.name === "Diode" ? "K" : "2"]
      .map((name, i) => ({ name, pos: { x: i * pitch, y: family.height - 1 } })),
    occupied: rectangle(pitch + 1, family.height),
    imageDataUrl: builtInPartArt[`${family.art}-${pitch}-grid` as keyof typeof builtInPartArt],
    imagePixelated: true, imageScale: 1, imageOffsetX: 0, imageOffsetY: 0
  }))
);

// Integer perfboard approximations, including bent leads; see doc/parts/generic-parts.md.
const packages = [
  { name: "TO-18", width: 3, height: 3, pins: [[0, 1], [1, 2], [2, 1]] },
  { name: "TO-39", width: 5, height: 5, pins: [[1, 2], [2, 3], [3, 2]] },
  { name: "TO-126", width: 5, height: 2, pins: [[1, 1], [2, 1], [3, 1]] },
  { name: "TO-247", width: 7, height: 3, pins: [[1, 2], [3, 2], [5, 2]] }
] as const;

export const transistorPackagePartDefs: PartDef[] = packages.map((pkg, index) => ({
  id: `b7a15000-0005-4000-8000-00000000000${index + 1}`,
  name: `Transistor ${pkg.name}`,
  category: "semiconductor",
  pins: pkg.pins.map(([x, y], i) => ({ name: String(i + 1), pos: { x, y } })),
  occupied: rectangle(pkg.width, pkg.height),
  imageDataUrl: builtInPartArt[`transistor-${pkg.name.toLowerCase()}`],
  imagePixelated: true, imageScale: 1, imageOffsetX: 0, imageOffsetY: 0
}));

export const genericPartDefs = [...leadSpacingPartDefs, ...transistorPackagePartDefs];

export const genericRefdesPrefixes: Record<string, string> = Object.fromEntries([
  ...leadSpacingPartDefs.map((def, i) => [def.id, families[Math.floor(i / 5)].prefix]),
  ...transistorPackagePartDefs.map((def) => [def.id, "Q"])
]);

/** Called only when upgrading a catalog older than v15; never overwrite user definitions. */
export function addMissingGenericParts(existing: PartDef[]): PartDef[] {
  const ids = new Set(existing.map((def) => def.id));
  const names = new Set(existing.map((def) => def.name));
  const missing = genericPartDefs.filter((def) => !ids.has(def.id) && !names.has(def.name));
  return missing.length ? [...existing, ...missing] : existing;
}
