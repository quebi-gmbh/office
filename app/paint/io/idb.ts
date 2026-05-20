/**
 * Minimal IndexedDB Promise wrapper — ~40 lines, no external dependency.
 *
 * Opens one DB, one store. Exposes get/put/delete.
 * All methods return null and log a warning if IndexedDB is unavailable
 * (e.g. Safari private browsing, restrictive browser settings).
 */

export interface IdbStore {
  get<T>(key: string): Promise<T | null>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  available: boolean;
}

const NOOP_STORE: IdbStore = {
  available: false,
  async get() { return null; },
  async put() {},
  async delete() {},
};

export async function openStore(dbName: string, storeName: string): Promise<IdbStore> {
  if (typeof indexedDB === "undefined") return NOOP_STORE;

  return new Promise<IdbStore>((resolve) => {
    try {
      const req = indexedDB.open(dbName, 1);

      req.onupgradeneeded = () => {
        req.result.createObjectStore(storeName);
      };

      req.onsuccess = () => {
        const db = req.result;

        function tx(mode: IDBTransactionMode) {
          return db.transaction(storeName, mode).objectStore(storeName);
        }

        function wrap<T>(r: IDBRequest<T>): Promise<T> {
          return new Promise((res, rej) => {
            r.onsuccess = () => res(r.result);
            r.onerror = () => rej(r.error);
          });
        }

        resolve({
          available: true,
          get: <T>(key: string) => wrap<T | null>(tx("readonly").get(key) as IDBRequest<T | null>),
          put: <T>(key: string, value: T) => wrap(tx("readwrite").put(value, key)).then(() => undefined),
          delete: (key: string) => wrap(tx("readwrite").delete(key)).then(() => undefined),
        });
      };

      req.onerror = () => {
        console.warn("IndexedDB unavailable:", req.error);
        resolve(NOOP_STORE);
      };
    } catch (e) {
      console.warn("IndexedDB open threw:", e);
      resolve(NOOP_STORE);
    }
  });
}
