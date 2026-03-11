import assert from "node:assert/strict";
import test from "node:test";
import { IDBKeyRange as fakeIDBKeyRange, indexedDB as fakeIndexedDB } from "fake-indexeddb";
import { loadPartLibrary, savePartLibrary } from "../src/partLibrary";
import type { PartDef } from "../src/types";

const DB_NAME = "uniuni-db";
const STORE_NAME = "part_library";
const SNAPSHOT_KEY = "default_library";

class FileReaderMock {
  public result: string | ArrayBuffer | null = null;
  public error: DOMException | null = null;
  public onload: ((ev: unknown) => void) | null = null;
  public onerror: ((ev: unknown) => void) | null = null;

  readAsDataURL(blob: Blob): void {
    void (async () => {
      try {
        const buffer = Buffer.from(await blob.arrayBuffer());
        const mime = blob.type || "application/octet-stream";
        this.result = `data:${mime};base64,${buffer.toString("base64")}`;
        this.onload?.({ target: this });
      } catch (err) {
        this.error = err instanceof DOMException ? err : new DOMException(String(err));
        this.onerror?.({ target: this });
      }
    })();
  }
}

globalThis.indexedDB = fakeIndexedDB as unknown as IDBFactory;
globalThis.IDBKeyRange = fakeIDBKeyRange as unknown as typeof IDBKeyRange;
globalThis.FileReader = FileReaderMock as unknown as typeof FileReader;

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("failed to delete database"));
    req.onblocked = () => reject(new Error("database deletion blocked"));
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("failed to open db"));
  });
}

function listLibraryKeys(): Promise<string[]> {
  return new Promise(async (resolve, reject) => {
    const db = await openDb();
    const keys: string[] = [];
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).openKeyCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve(keys);
          return;
        }
        if (typeof cursor.key === "string") {
          keys.push(cursor.key);
        }
        cursor.continue();
      };
      req.onerror = () => reject(req.error ?? new Error("failed to list keys"));
    } finally {
      db.close();
    }
  });
}

function loadRawSnapshot(): Promise<unknown> {
  return new Promise(async (resolve, reject) => {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(SNAPSHOT_KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("failed to load raw snapshot"));
    } finally {
      db.close();
    }
  });
}

function saveRawSnapshot(snapshot: unknown): Promise<void> {
  return new Promise(async (resolve, reject) => {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("failed to save raw snapshot"));
      tx.objectStore(STORE_NAME).put(snapshot, SNAPSHOT_KEY);
    } finally {
      db.close();
    }
  });
}

const SAME_IMAGE_DATA_URL = "data:text/plain;base64,SGVsbG8=";

function buildPartDefs(imageDataUrl: string | null): PartDef[] {
  return [
    {
      id: "11111111-1111-1111-1111-111111111111",
      name: "Part A",
      pins: [{ name: "1", pos: { x: 0, y: 0 } }],
      occupied: [{ x: 0, y: 0 }],
      imageDataUrl,
      imageScale: 1,
      imageOffsetX: 0,
      imageOffsetY: 0
    },
    {
      id: "22222222-2222-2222-2222-222222222222",
      name: "Part B",
      pins: [{ name: "1", pos: { x: 0, y: 0 } }],
      occupied: [{ x: 0, y: 0 }],
      imageDataUrl,
      imageScale: 1,
      imageOffsetX: 0,
      imageOffsetY: 0
    }
  ];
}

test.beforeEach(async () => {
  await deleteDatabase(DB_NAME);
});

test("save/load persists image assets and deduplicates shared image blobs", async () => {
  await savePartLibrary(buildPartDefs(SAME_IMAGE_DATA_URL));

  const raw = (await loadRawSnapshot()) as {
    schemaVersion: number;
    partDefs: Array<{ imageAssetId?: string | null; imageDataUrl?: string | null }>;
  };
  assert.equal(raw.schemaVersion, 2);
  assert.equal(raw.partDefs.length, 2);
  assert.equal(raw.partDefs[0].imageDataUrl, null);
  assert.equal(raw.partDefs[1].imageDataUrl, null);
  assert.ok(raw.partDefs[0].imageAssetId);
  assert.equal(raw.partDefs[0].imageAssetId, raw.partDefs[1].imageAssetId);

  const keys = await listLibraryKeys();
  assert.equal(keys.filter((k) => k.startsWith("asset:")).length, 1);

  const loaded = await loadPartLibrary();
  assert.ok(loaded);
  assert.equal(loaded?.length, 2);
  assert.ok(loaded?.every((def) => typeof def.imageDataUrl === "string"));
  assert.equal(loaded?.[0].imageDataUrl, loaded?.[1].imageDataUrl);
});

test("save removes unreferenced image assets on subsequent updates", async () => {
  await savePartLibrary(buildPartDefs(SAME_IMAGE_DATA_URL));
  await savePartLibrary(buildPartDefs(null));

  const keys = await listLibraryKeys();
  assert.equal(keys.filter((k) => k.startsWith("asset:")).length, 0);

  const loaded = await loadPartLibrary();
  assert.ok(loaded);
  assert.ok(loaded?.every((def) => def.imageDataUrl === null));
});

test("load keeps compatibility with legacy schemaVersion 1 library snapshot", async () => {
  await saveRawSnapshot({
    schemaVersion: 1,
    partDefs: buildPartDefs(SAME_IMAGE_DATA_URL)
  });

  const loaded = await loadPartLibrary();
  assert.ok(loaded);
  assert.equal(loaded?.length, 2);
  assert.equal(loaded?.[0].imageDataUrl, SAME_IMAGE_DATA_URL);
  assert.equal(loaded?.[1].imageDataUrl, SAME_IMAGE_DATA_URL);
});
