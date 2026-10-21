export const DB_NAME = 'myworld';
export const DB_VERSION = 1;

export const STORE_META = 'meta';
export const STORE_RECORDS = 'records';

export const INDEX_KIND = 'kind';

export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

export function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('Transaction aborted'));
    transaction.onerror = () => reject(transaction.error ?? new Error('Transaction failed'));
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('IndexedDB is unavailable in this environment'));
      return;
    }

    const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'name' });
      }

      if (!db.objectStoreNames.contains(STORE_RECORDS)) {
        const records = db.createObjectStore(STORE_RECORDS, { keyPath: 'id' });
        records.createIndex(INDEX_KIND, 'kind', { unique: false });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };

    request.onerror = () =>
      reject(request.error ?? new Error('Could not open the local database'));
    request.onblocked = () =>
      reject(new Error('The local database is locked by another open tab'));
  });
}

export function openDatabase(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = open().catch((error: unknown) => {
      dbPromise = null;
      throw error;
    });
  }

  return dbPromise;
}

export async function closeDatabase(): Promise<void> {
  const pending = dbPromise;
  dbPromise = null;

  if (!pending) return;

  try {
    (await pending).close();
  } catch {
    // The database was already closed.
  }
}

export async function deleteDatabase(): Promise<void> {
  await closeDatabase();

  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(request.error ?? new Error('Could not delete the local database'));
    request.onblocked = () => resolve();
  });
}
