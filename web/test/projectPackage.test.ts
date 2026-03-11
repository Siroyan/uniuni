import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { buildProjectZip, parseProjectZip } from "../src/projectPackage";
import type { PartDef } from "../src/types";

const DATA_URL = "data:text/plain;base64,SGVsbG8=";

const PART_DEFS: PartDef[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    name: "A",
    pins: [{ name: "1", pos: { x: 0, y: 0 } }],
    occupied: [{ x: 0, y: 0 }],
    imageDataUrl: DATA_URL,
    imageScale: 1,
    imageOffsetX: 0,
    imageOffsetY: 0
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    name: "B",
    pins: [{ name: "1", pos: { x: 0, y: 0 } }],
    occupied: [{ x: 0, y: 0 }],
    imageDataUrl: DATA_URL,
    imageScale: 1,
    imageOffsetX: 0,
    imageOffsetY: 0
  }
];

test("buildProjectZip packages project.json + deduplicated assets", async () => {
  const coreStateJson = JSON.stringify({ schema_version: 1, board: { width: 64, height: 40, grid_pitch_mm: 2.54 } });
  const blob = await buildProjectZip(coreStateJson, PART_DEFS);

  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  assert.ok(zip.file("project.json"));
  assert.ok(zip.file("part-library.json"));

  const assetKeys = Object.keys(zip.files).filter(
    (name) => name.startsWith("assets/") && !name.endsWith("/")
  );
  assert.equal(assetKeys.length, 1);

  const parsed = await parseProjectZip(new File([blob], "project.zip", { type: "application/zip" }));
  assert.equal(parsed.coreStateJson, coreStateJson);
  assert.ok(parsed.partDefs);
  assert.equal(parsed.partDefs?.length, 2);
  assert.equal(parsed.partDefs?.[0].imageDataUrl, DATA_URL);
  assert.equal(parsed.partDefs?.[1].imageDataUrl, DATA_URL);
});

test("parseProjectZip rejects zip without project.json", async () => {
  const zip = new JSZip();
  zip.file("dummy.txt", "x");
  const blob = await zip.generateAsync({ type: "blob" });

  await assert.rejects(
    parseProjectZip(new File([blob], "broken.zip", { type: "application/zip" })),
    /missing project\.json/
  );
});

test("parseProjectZip can read legacy part-library schemaVersion 1", async () => {
  const zip = new JSZip();
  const coreStateJson = JSON.stringify({ schema_version: 1 });
  zip.file("project.json", coreStateJson);
  zip.file(
    "part-library.json",
    JSON.stringify({
      schemaVersion: 1,
      partDefs: PART_DEFS
    })
  );
  const blob = await zip.generateAsync({ type: "blob" });

  const parsed = await parseProjectZip(new File([blob], "legacy.zip", { type: "application/zip" }));
  assert.equal(parsed.coreStateJson, coreStateJson);
  assert.ok(parsed.partDefs);
  assert.equal(parsed.partDefs?.[0].imageDataUrl, DATA_URL);
});
