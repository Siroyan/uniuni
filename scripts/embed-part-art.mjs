import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const names = [
  "resistor-axial",
  "capacitor-radial",
  "inductor-axial",
  "pin-header-1x2",
  "pin-header-1x3",
  "pin-header-1x4",
  "pin-header-2x3",
  "diode-axial",
  "led-5mm",
  "transistor-to-92",
  "dip-8-ic",
  "terminal-block-2p",
  "push-button-2p",
  "capacitor-electrolytic",
  "to-220-3-pin",
  "dip-14-ic",
  "slide-switch-spdt",
  "terminal-block-3p",
  "trimmer-3p-inline",
  "capacitor-ceramic-disc",
  "fuse-axial",
  "photoresistor-radial",
  "rgb-led-4-pin",
  "dip-16-ic",
  "pin-header-2x5",
  "buzzer-2p",
  "terminal-block-4p",
  "xh-connector-2p-top",
  "xh-connector-2p-side",
  "xh-connector-3p-top",
  "xh-connector-3p-side",
  "xh-connector-4p-top",
  "xh-connector-4p-side",
  "xh-connector-5p-top",
  "xh-connector-5p-side",
  "xh-connector-6p-top",
  "xh-connector-6p-side",
  "az8462-3",
  "osg8ha3z74a",
  "sot-23-3-to-dip-4-adapter"
];

const entries = await Promise.all(names.map(async (name) => {
  const bytes = await readFile(path.join(root, "web/src/assets/parts", `${name}.png`));
  return `  "${name}": "data:image/png;base64,${bytes.toString("base64")}"`;
}));

const content = [
  "// Generated from web/src/assets/parts/*.png by scripts/embed-part-art.mjs.",
  "export const builtInPartArt = {",
  entries.join(",\n"),
  "} as const;",
  ""
].join("\n");
await writeFile(path.join(root, "web/src/builtInPartArt.ts"), content);
