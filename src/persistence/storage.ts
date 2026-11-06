// Tiny typed IndexedDB key-value wrapper with a localStorage fallback.
const DB = 'kl-economic-empire';
const STORE = 'saves';

export type SlotId = 'recovery' | 'autosave' | 'slot1' | 'slot2' | 'slot3';
export const SLOTS: SlotId[] = ['autosave', 'slot1', 'slot2', 'slot3'];

// One shared connection: opening a new one per call leaked a connection on every save and read.
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => {
      const db = req.result;
      // Another tab upgrading the database, or the browser closing it, drops this connection; reopen next time.
      db.onversionchange = () => { db.close(); dbPromise = null; };
      db.onclose = () => { dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { dbPromise = null; reject(req.error); };
    req.onblocked = () => { dbPromise = null; reject(new Error('IndexedDB open blocked')); };
  });
  return dbPromise;
}

async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result as T);
    tx.onerror = () => reject(tx.error);
    // An aborted transaction fires neither complete nor (always) error; without this the promise never settled.
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

const hasIdb = () => typeof indexedDB !== 'undefined';

export async function writeSlot(slot: SlotId, json: string): Promise<void> {
  if (hasIdb()) {
    try {
      await idb('readwrite', (s) => s.put(json, slot));
      return;
    } catch {
      /* fall through */
    }
  }
  localStorage.setItem(`${DB}:${slot}`, json);
}

export async function readSlot(slot: SlotId): Promise<string | null> {
  if (slot === 'recovery') {
    try { return sessionStorage.getItem('kl-session-recovery'); } catch { return null; }
  }
  if (hasIdb()) {
    try {
      const v = await idb<string | undefined>('readonly', (s) => s.get(slot));
      if (v) return v;
    } catch {
      /* fall through */
    }
  }
  try {
    return localStorage.getItem(`${DB}:${slot}`);
  } catch {
    return null;
  }
}

export async function deleteSlot(slot: SlotId): Promise<void> {
  if (hasIdb()) await idb('readwrite', (s) => s.delete(slot)).catch(() => undefined);
  try {
    localStorage.removeItem(`${DB}:${slot}`);
  } catch {
    /* ignore */
  }
}
