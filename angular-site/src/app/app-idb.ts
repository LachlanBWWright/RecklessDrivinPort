/**
 * IndexedDB persistence helpers for custom resources.dat.
 *
 * The game is compiled with Emscripten ASYNCIFY, which makes calling callMain()
 * a second time unsafe (the ASYNCIFY state machine is not designed to be re-entered).
 * We therefore restart by reloading the page, persisting the custom bytes in IndexedDB
 * so the preRun hook can inject them into MEMFS before the game's main() runs.
 */

const IDB_NAME  = 'reckless-drivin';
const IDB_STORE = 'custom-resources';
const IDB_KEY   = 'resources-dat';

function openCustomResourcesDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror  = () => reject(req.error);
  });
}

export async function saveCustomResourcesDb(bytes: Uint8Array, name: string): Promise<void> {
  const db = await openCustomResourcesDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put({ bytes, name }, IDB_KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror    = () => { db.close(); reject(tx.error); };
  });
}

export function loadCustomResourcesDb(): Promise<{ bytes: Uint8Array; name: string } | null> {
  return new Promise((resolve) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) { db.close(); resolve(null); return; }
      const tx = db.transaction(IDB_STORE, 'readonly');
      const getReq = tx.objectStore(IDB_STORE).get(IDB_KEY);
      getReq.onsuccess = () => { db.close(); resolve((getReq.result as { bytes: Uint8Array; name: string }) ?? null); };
      getReq.onerror   = () => { db.close(); resolve(null); };
    };
    req.onerror = () => resolve(null);
  });
}

export function clearCustomResourcesDb(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) { db.close(); resolve(); return; }
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(IDB_KEY);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror    = () => { db.close(); resolve(); };
    };
    req.onerror = () => resolve();
  });
}
