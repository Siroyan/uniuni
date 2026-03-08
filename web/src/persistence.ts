const DB_NAME = "uniuni-db";
const DB_VERSION = 1;
const STORE_NAME = "project_snapshots";
const SNAPSHOT_KEY = "active_project";

export type PersistedSnapshot = {
  schemaVersion: number;
  coreStateJson: string;
  selectedNetId: string | null;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
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

export async function loadSnapshot(): Promise<PersistedSnapshot | null> {
  const db = await openDb();
  try {
    return await new Promise<PersistedSnapshot | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(SNAPSHOT_KEY);
      req.onsuccess = () => resolve((req.result as PersistedSnapshot | undefined) ?? null);
      req.onerror = () => reject(req.error ?? new Error("failed to read snapshot"));
    });
  } finally {
    db.close();
  }
}

export async function saveSnapshot(snapshot: PersistedSnapshot): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("failed to save snapshot"));
      tx.objectStore(STORE_NAME).put(snapshot, SNAPSHOT_KEY);
    });
  } finally {
    db.close();
  }
}
