import type { PartCategory, PartDef } from "./types";

export const PART_CATEGORIES: ReadonlyArray<{ id: PartCategory; label: string }> = [
  { id: "passive", label: "受動部品" },
  { id: "semiconductor", label: "半導体" },
  { id: "ic", label: "IC" },
  { id: "connector", label: "コネクタ" },
  { id: "switch", label: "スイッチ" },
  { id: "other", label: "その他" }
];

const builtInCategoryById: Record<string, PartCategory> = {
  "ad7ecaa0-4c74-4a0f-a7ba-a0f1fa0f12a1": "passive", // Resistor Axial
  "f222f718-6ff6-42a6-b2ba-4c62090d8ca5": "passive", // Capacitor Radial
  "01d260e9-ea3a-488f-9e8a-031ca0d679ce": "passive", // Inductor Axial
  "f12e08b7-3b0d-4c07-b9d4-c2cc5b5821fc": "connector",
  "d8d8ecff-4098-4230-8768-517ea384f76a": "connector",
  "0e57e4a2-1c56-4bdc-aa52-d73c778c6949": "connector",
  "f172bd98-959e-442f-a948-37bd1ebd2fe3": "connector",
  "a9bf042c-20cf-429a-97e3-14aaac011571": "semiconductor", // Diode Axial
  "25da8655-cbdc-4221-b7c3-6c13bde21d75": "semiconductor", // LED 5mm
  "8acc092b-3960-46cb-b0f2-0995cc01a107": "semiconductor", // Transistor TO-92
  "ac18d4fc-a392-4a23-9783-787704df3e09": "ic", // DIP-8 IC
  "53000741-8a21-48a3-92c3-22fdb3769ff5": "connector", // Terminal Block 2P
  "fb6a0559-572f-4f65-a3e9-3f6f8029aa26": "switch", // Push Button 2P
  "77750a90-4823-4cdf-bfea-a3b36e7872a8": "passive", // Capacitor Electrolytic
  "5ed6e5ed-ba33-45d5-aa04-4fe27f9f9ff1": "semiconductor", // TO-220 3-pin
  "9429852c-4b26-483b-b302-844d11d3b6e8": "ic", // DIP-14 IC
  "4bb91cd4-5cee-4cc1-97b4-e75305b5f101": "switch", // Slide Switch SPDT
  "cf3f301b-1aef-407a-8335-dbd07b0a833c": "connector", // Terminal Block 3P
  "28adb8b0-79cf-4e9f-8ad5-6b71855fefc1": "passive", // Trimmer 3P Inline
  "799559c3-a49b-4905-9b85-777aa4a982c8": "passive", // Capacitor Ceramic Disc
  "3ef2adda-02f1-4d21-b0ad-f817993c004e": "other", // Fuse Axial
  "97c4076e-3a81-4a7a-8db7-f187e0157358": "passive", // Photoresistor Radial
  "008e51b2-6271-4c03-9dac-dc235fe15175": "semiconductor", // RGB LED 4-pin
  "6a69eb4c-d4a1-4121-b5fd-44a0a34ea986": "ic", // DIP-16 IC
  "3b359d03-cea0-4e3c-a187-fe737dd8d800": "connector", // Pin Header 2x5
  "78bdfa3c-df5d-4247-bbc9-9feeb9f0a96b": "other", // Buzzer 2P
  "1b69aec3-cc03-4b3a-9b78-d6f72fdb3adb": "connector", // Terminal Block 4P
  "67a6a59b-26fe-5457-bc09-cedc0e59bc2d": "connector", // XH Connector 2P Top
  "d49f4a2e-2ef2-5d96-99c0-bfc12f054d75": "connector", // XH Connector 2P Side
  "b9b383f2-18b6-5f2a-bc4c-f10e502b533b": "connector", // XH Connector 3P Top
  "85ffdcfa-bd4d-5df7-8903-36c97eeddb54": "connector", // XH Connector 3P Side
  "30902d35-1270-5582-b839-a783827fb455": "connector", // XH Connector 4P Top
  "dde28fcc-7b06-5b3f-8f75-359c1918a98a": "connector", // XH Connector 4P Side
  "cd106528-d815-513b-ae86-759b09f9ee1a": "connector", // XH Connector 5P Top
  "ca000452-17d1-595b-91aa-d918e931c734": "connector", // XH Connector 5P Side
  "4eb85419-a82d-5e5e-8888-a98c6355b3ff": "connector", // XH Connector 6P Top
  "21e3a7ae-2575-5e8b-b61d-f2183aa16602": "connector" // XH Connector 6P Side
};

export function isPartCategory(value: unknown): value is PartCategory {
  return PART_CATEGORIES.some((category) => category.id === value);
}

export function partCategory(def: Pick<PartDef, "id" | "category">): PartCategory {
  return isPartCategory(def.category) ? def.category : builtInCategoryById[def.id] ?? "other";
}

/** Add category metadata to old library entries without changing user assigned categories. */
export function categorizeParts(existing: PartDef[]): PartDef[] {
  let changed = false;
  const categorized = existing.map((def) => {
    if (isPartCategory(def.category)) return def;
    changed = true;
    return { ...def, category: partCategory(def) };
  });
  return changed ? categorized : existing;
}
