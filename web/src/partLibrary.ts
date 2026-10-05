import type { PartDef } from "./types";
import { isPartCategory } from "./partCategories";

const DB_NAME = "uniuni-db";
const STORE_NAME = "part_library";
const KEY = "default_library";
const ASSET_PREFIX = "asset:";
export const BUILT_IN_CATALOG_VERSION = 6;

type PersistedPartDef = Omit<PartDef, "imageDataUrl"> & {
  imageDataUrl?: string | null;
  imageAssetId?: string | null;
};

type LibrarySnapshotV1 = {
  schemaVersion: 1;
  partDefs: PartDef[];
};

type LibrarySnapshotV2 = {
  schemaVersion: 2;
  partDefs: PersistedPartDef[];
  builtInCatalogVersion?: number;
};

type LibrarySnapshot = LibrarySnapshotV1 | LibrarySnapshotV2;

export type LoadedPartLibrary = {
  partDefs: PartDef[];
  builtInCatalogVersion: number;
};

function openDb(version?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = typeof version === "number" ? indexedDB.open(DB_NAME, version) : indexedDB.open(DB_NAME);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("failed to open indexeddb"));
  });
}

async function openDbEnsuringStore(): Promise<IDBDatabase> {
  const db = await openDb();
  if (db.objectStoreNames.contains(STORE_NAME)) {
    return db;
  }
  const nextVersion = db.version + 1;
  db.close();
  return openDb(nextVersion);
}

function assetKey(assetId: string): string {
  return `${ASSET_PREFIX}${assetId}`;
}

function isDataUrl(value: string): boolean {
  return value.startsWith("data:");
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

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const match = /^data:([^,]*),(.*)$/s.exec(dataUrl);
  if (!match) throw new Error("failed to decode image data");
  const metadata = match[1];
  const mime = metadata.split(";")[0] || "text/plain";
  const bytes = metadata.split(";").includes("base64")
    ? Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(match[2]));
  return new Blob([bytes], { type: mime });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        resolve(result);
      } else {
        reject(new Error("failed to encode image data"));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("failed to encode image data"));
    reader.readAsDataURL(blob);
  });
}

function loadRawSnapshot(db: IDBDatabase): Promise<LibrarySnapshot | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(KEY);
    req.onsuccess = () => resolve((req.result as LibrarySnapshot | undefined) ?? null);
    req.onerror = () => reject(req.error ?? new Error("failed to load part library"));
  });
}

function loadAssetBlobs(db: IDBDatabase, assetIds: string[]): Promise<Map<string, Blob>> {
  return new Promise((resolve, reject) => {
    const assets = new Map<string, Blob>();
    if (assetIds.length === 0) {
      resolve(assets);
      return;
    }

    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    let pending = assetIds.length;

    for (const id of assetIds) {
      const req = store.get(assetKey(id));
      req.onsuccess = () => {
        const value = req.result;
        if (value instanceof Blob) {
          assets.set(id, value);
        }
        pending -= 1;
        if (pending === 0) {
          resolve(assets);
        }
      };
      req.onerror = () => reject(req.error ?? new Error("failed to load image asset"));
    }
  });
}

async function expandSnapshotV2(db: IDBDatabase, snapshot: LibrarySnapshotV2): Promise<PartDef[]> {
  const assetIds = Array.from(
    new Set(
      snapshot.partDefs
        .map((def) => def.imageAssetId)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    )
  );
  const assetBlobs = await loadAssetBlobs(db, assetIds);
  const dataUrlCache = new Map<string, string>();

  for (const [id, blob] of assetBlobs.entries()) {
    dataUrlCache.set(id, await blobToDataUrl(blob));
  }

  return snapshot.partDefs.map((def) => ({
    id: def.id,
    name: def.name,
    ...(isPartCategory(def.category) ? { category: def.category } : {}),
    pins: def.pins,
    occupied: def.occupied,
    imageScale: def.imageScale,
    imageOffsetX: def.imageOffsetX,
    imageOffsetY: def.imageOffsetY,
    ...(def.imagePixelated === true ? { imagePixelated: true } : {}),
    imageDataUrl:
      typeof def.imageDataUrl === "string"
        ? def.imageDataUrl
        : typeof def.imageAssetId === "string"
          ? (dataUrlCache.get(def.imageAssetId) ?? null)
          : null
  }));
}

async function preparePersistedPartDefs(
  partDefs: PartDef[]
): Promise<{
  persistedDefs: PersistedPartDef[];
  assetBlobs: Map<string, Blob>;
  usedAssetIds: Set<string>;
}> {
  const assetBlobs = new Map<string, Blob>();
  const usedAssetIds = new Set<string>();
  const persistedDefs: PersistedPartDef[] = [];

  for (const def of partDefs) {
    if (!def.imageDataUrl || !isDataUrl(def.imageDataUrl)) {
      persistedDefs.push({
        ...def,
        imageDataUrl: def.imageDataUrl ?? null,
        imageAssetId: null
      });
      continue;
    }

    const assetId = await toAssetId(def.imageDataUrl);
    usedAssetIds.add(assetId);
    if (!assetBlobs.has(assetId)) {
      assetBlobs.set(assetId, await dataUrlToBlob(def.imageDataUrl));
    }
    persistedDefs.push({
      ...def,
      imageDataUrl: null,
      imageAssetId: assetId
    });
  }

  return { persistedDefs, assetBlobs, usedAssetIds };
}

function saveSnapshotAndAssets(
  db: IDBDatabase,
  snapshot: LibrarySnapshotV2,
  assets: Map<string, Blob>
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("failed to save part library"));
    const store = tx.objectStore(STORE_NAME);
    store.put(snapshot, KEY);
    for (const [id, blob] of assets.entries()) {
      store.put(blob, assetKey(id));
    }
  });
}

function cleanupUnusedAssets(db: IDBDatabase, usedAssetIds: Set<string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("failed to cleanup part library assets"));
    const store = tx.objectStore(STORE_NAME);
    const req = store.openKeyCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      const key = cursor.key;
      if (typeof key === "string" && key.startsWith(ASSET_PREFIX)) {
        const id = key.slice(ASSET_PREFIX.length);
        if (!usedAssetIds.has(id)) {
          store.delete(key);
        }
      }
      cursor.continue();
    };
    req.onerror = () => reject(req.error ?? new Error("failed to iterate part library assets"));
  });
}

export async function loadPartLibraryWithVersion(): Promise<LoadedPartLibrary | null> {
  const db = await openDbEnsuringStore();
  try {
    const snapshot = await loadRawSnapshot(db);
    if (!snapshot) return null;

    let partDefs: PartDef[];
    let migrationNeeded = false;
    const builtInCatalogVersion = snapshot.schemaVersion === 2
      && Number.isInteger(snapshot.builtInCatalogVersion)
      && (snapshot.builtInCatalogVersion ?? 0) >= 0
      ? snapshot.builtInCatalogVersion ?? 0
      : 0;

    if (snapshot.schemaVersion === 1) {
      partDefs = snapshot.partDefs;
      migrationNeeded = true;
    } else {
      partDefs = await expandSnapshotV2(db, snapshot);
      migrationNeeded = snapshot.partDefs.some(
        (def) => typeof def.imageDataUrl === "string" && isDataUrl(def.imageDataUrl)
      );
    }

    if (migrationNeeded) {
      const { persistedDefs, assetBlobs, usedAssetIds } = await preparePersistedPartDefs(partDefs);
      await saveSnapshotAndAssets(
        db,
        {
          schemaVersion: 2,
          partDefs: persistedDefs,
          builtInCatalogVersion
        },
        assetBlobs
      );
      await cleanupUnusedAssets(db, usedAssetIds);
    }

    return { partDefs, builtInCatalogVersion };
  } finally {
    db.close();
  }
}

export async function loadPartLibrary(): Promise<PartDef[] | null> {
  return (await loadPartLibraryWithVersion())?.partDefs ?? null;
}

export async function savePartLibrary(partDefs: PartDef[]): Promise<void> {
  const db = await openDbEnsuringStore();
  try {
    const { persistedDefs, assetBlobs, usedAssetIds } = await preparePersistedPartDefs(partDefs);

    await saveSnapshotAndAssets(
      db,
      {
        schemaVersion: 2,
        partDefs: persistedDefs,
        builtInCatalogVersion: BUILT_IN_CATALOG_VERSION
      },
      assetBlobs
    );
    await cleanupUnusedAssets(db, usedAssetIds);
  } finally {
    db.close();
  }
}
