// A tiny IndexedDB wrapper (browser only) for the offline data cache and the scan outbox.
const NAME = "chillchain";

let opening: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!opening)
    opening = new Promise((res, rej) => {
      const r = indexedDB.open(NAME, 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore("kv");
        r.result.createObjectStore("outbox", { keyPath: "id" });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => {
        opening = null;
        rej(r.error);
      };
    });
  return opening;
}

async function run<T>(
  store: "kv" | "outbox",
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => res(req.result as T);
    tx.onerror = tx.onabort = () => rej(tx.error ?? req.error);
  });
}

/** String key-value storage, shaped like the persister's AsyncStorage. */
export const kv = {
  getItem: (k: string) =>
    run<string | undefined>("kv", "readonly", (s) => s.get(k)).then((v) => v ?? null),
  setItem: (k: string, v: string) => run<void>("kv", "readwrite", (s) => s.put(v, k)),
  removeItem: (k: string) => run<void>("kv", "readwrite", (s) => s.delete(k)),
};

/** Records kept by id (the outbox). */
export const records = {
  all: <T>() => run<T[]>("outbox", "readonly", (s) => s.getAll()),
  put: <T extends { id: string }>(v: T) => run<void>("outbox", "readwrite", (s) => s.put(v)),
  remove: (id: string) => run<void>("outbox", "readwrite", (s) => s.delete(id)),
};
