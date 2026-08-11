/** Minimal IndexedDB key/value store used when the app runs in a browser instead of Electron. */
const DB_NAME = "inkwell-store";
const STORE = "kv";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

export const idbGet = <T>(key: string) => tx<T | undefined>("readonly", (s) => s.get(key));
export const idbSet = (key: string, value: unknown) =>
  tx<unknown>("readwrite", (s) => s.put(value, key));
export const idbDel = (key: string) => tx<unknown>("readwrite", (s) => s.delete(key));
