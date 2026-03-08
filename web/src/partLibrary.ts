import type { PartDef } from "./types";

const DB_NAME = "uniuni-db";
const DB_VERSION = 2;
const STORE_NAME = "part_library";
const KEY = "default_library";

type LibrarySnapshot = {
  schemaVersion: number;
  partDefs: PartDef[];
};

function openDb(version = DB_VERSION): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, version);
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

export async function loadPartLibrary(): Promise<PartDef[] | null> {
  const db = await openDbEnsuringStore();
  try {
    return await new Promise<PartDef[] | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(KEY);
      req.onsuccess = () => {
        const snapshot = req.result as LibrarySnapshot | undefined;
        resolve(snapshot?.partDefs ?? null);
      };
      req.onerror = () => reject(req.error ?? new Error("failed to load part library"));
    });
  } finally {
    db.close();
  }
}

export async function savePartLibrary(partDefs: PartDef[]): Promise<void> {
  const db = await openDbEnsuringStore();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("failed to save part library"));
      tx.objectStore(STORE_NAME).put({ schemaVersion: 1, partDefs } satisfies LibrarySnapshot, KEY);
    });
  } finally {
    db.close();
  }
}
