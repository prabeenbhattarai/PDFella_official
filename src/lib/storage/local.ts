/**
 * Minimal IndexedDB key-value store for browser-only state: the landing-page →
 * editor file hand-off and the editor auto-save. Nothing here leaves the device.
 * Every call is wrapped so private-mode / blocked storage degrades gracefully.
 */
const DB = "pdfella";
const STORE = "kv";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  try {
    const db = await open();
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).finally(() => db.close());
  } catch {
    return undefined;
  }
}

export const local = {
  get: <T>(key: string) => tx<T>("readonly", (s) => s.get(key) as IDBRequest<T>),
  set: (key: string, value: unknown) => tx("readwrite", (s) => s.put(value, key)),
  del: (key: string) => tx("readwrite", (s) => s.delete(key)),
};

export interface HandoffFile { name: string; type: string; bytes: Uint8Array }

/** Files dropped on a marketing page, picked up by /editor or a tool workspace. */
export const handoff = {
  put: (files: HandoffFile[]) => local.set("handoff", { files, at: Date.now() }),
  async take(): Promise<HandoffFile[] | null> {
    const v = await local.get<{ files: HandoffFile[]; at: number }>("handoff");
    await local.del("handoff");
    // Stale hand-offs (e.g. abandoned tab) are ignored after 10 minutes.
    if (!v || Date.now() - v.at > 10 * 60_000) return null;
    return v.files;
  },
};
