import JSZip from "jszip";
import type { PartDef } from "./types";
import { validateProjectStateJson } from "./projectStateValidation";

type PersistedPartDef = Omit<PartDef, "imageDataUrl"> & {
  imageDataUrl?: string | null;
  imageAssetId?: string | null;
  imageAssetMime?: string | null;
};

type PackagePartLibraryV1 = {
  schemaVersion: 1;
  partDefs: PartDef[];
};

type PackagePartLibraryV2 = {
  schemaVersion: 2;
  partDefs: PersistedPartDef[];
};

type PackagePartLibrary = PackagePartLibraryV1 | PackagePartLibraryV2;

function isDataUrl(value: string): boolean {
  return value.startsWith("data:");
}

function parseDataUrl(dataUrl: string): { mime: string; base64: string } {
  const match = dataUrl.match(/^data:([^;,]+)?;base64,(.+)$/);
  if (!match) {
    throw new Error("invalid data url");
  }
  return {
    mime: match[1] || "application/octet-stream",
    base64: match[2]
  };
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  return `data:${mime};base64,${bytesToBase64(bytes)}`;
}

async function toAssetId(dataUrl: string): Promise<string> {
  const bytes = new TextEncoder().encode(dataUrl);
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hash = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return `sha256-${hash.slice(0, 24)}`;
  }
  let hash = 2166136261;
  for (const ch of dataUrl) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv-${(hash >>> 0).toString(16)}`;
}

async function encodePartLibrary(partDefs: PartDef[]): Promise<{
  snapshot: PackagePartLibraryV2;
  assets: Map<string, { bytes: Uint8Array; mime: string }>;
}> {
  const assets = new Map<string, { bytes: Uint8Array; mime: string }>();
  const persistedDefs: PersistedPartDef[] = [];

  for (const def of partDefs) {
    if (!def.imageDataUrl || !isDataUrl(def.imageDataUrl)) {
      persistedDefs.push({
        ...def,
        imageDataUrl: def.imageDataUrl ?? null,
        imageAssetId: null,
        imageAssetMime: null
      });
      continue;
    }

    const { mime, base64 } = parseDataUrl(def.imageDataUrl);
    const assetId = await toAssetId(def.imageDataUrl);
    if (!assets.has(assetId)) {
      assets.set(assetId, { bytes: base64ToBytes(base64), mime });
    }

    persistedDefs.push({
      ...def,
      imageDataUrl: null,
      imageAssetId: assetId,
      imageAssetMime: mime
    });
  }

  return {
    snapshot: {
      schemaVersion: 2,
      partDefs: persistedDefs
    },
    assets
  };
}

async function decodePartLibraryFromZip(zip: JSZip): Promise<PartDef[] | null> {
  const file = zip.file("part-library.json");
  if (!file) return null;

  const text = await file.async("string");
  const parsed = JSON.parse(text) as PackagePartLibrary;

  if (parsed.schemaVersion === 1) {
    return parsed.partDefs;
  }

  const restored: PartDef[] = [];
  for (const def of parsed.partDefs) {
    let imageDataUrl: string | null = null;

    if (typeof def.imageDataUrl === "string") {
      imageDataUrl = def.imageDataUrl;
    } else if (typeof def.imageAssetId === "string" && def.imageAssetId.length > 0) {
      const assetFile = zip.file(`assets/${def.imageAssetId}`);
      if (assetFile) {
        const bytes = await assetFile.async("uint8array");
        const mime = typeof def.imageAssetMime === "string" ? def.imageAssetMime : "application/octet-stream";
        imageDataUrl = bytesToDataUrl(bytes, mime);
      }
    }

    restored.push({
      id: def.id,
      name: def.name,
      pins: def.pins,
      occupied: def.occupied,
      imageScale: def.imageScale,
      imageOffsetX: def.imageOffsetX,
      imageOffsetY: def.imageOffsetY,
      imagePixelated: def.imagePixelated === true,
      imageDataUrl
    });
  }

  return restored;
}

export async function buildProjectZip(coreStateJson: string, partDefs: PartDef[]): Promise<Blob> {
  validateProjectStateJson(coreStateJson);
  const coreDefs = (JSON.parse(coreStateJson) as { part_defs: Array<Pick<PartDef, "id" | "name" | "pins" | "occupied">> }).part_defs;
  const geometry = (def: Pick<PartDef, "id" | "name" | "pins" | "occupied">): string => JSON.stringify([def.id, def.name, def.pins, def.occupied]);
  if (coreDefs.length !== partDefs.length || coreDefs.some((def, index) => geometry(def) !== geometry(partDefs[index]))) {
    throw new Error("project and part library do not match");
  }
  const zip = new JSZip();
  const { snapshot, assets } = await encodePartLibrary(partDefs);

  zip.file("project.json", coreStateJson);
  zip.file("part-library.json", JSON.stringify(snapshot, null, 2));
  for (const [assetId, asset] of assets.entries()) {
    zip.file(`assets/${assetId}`, asset.bytes);
  }

  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

export async function parseProjectZip(file: Blob): Promise<{
  coreStateJson: string;
  partDefs: PartDef[] | null;
}> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const projectFile = zip.file("project.json");
  if (!projectFile) {
    throw new Error("invalid project zip: missing project.json");
  }

  const coreStateJson = await projectFile.async("string");
  validateProjectStateJson(coreStateJson);
  const partDefs = await decodePartLibraryFromZip(zip);

  return {
    coreStateJson,
    partDefs
  };
}
