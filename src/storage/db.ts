export const DB_NAME = 'myworld';
export const DB_VERSION = 2;

export const STORE_META = 'meta';
export const STORE_RECORDS = 'records';

export const INDEX_KIND = 'kind';

/**
 * The record store is keyed by the kind and the id of a record together.
 * The first version was keyed by the id alone, which let a record of one kind
 * take the place of a record of another kind. With both parts of the key a
 * quote that carries the id "settings" can never overwrite the settings.
 */
export const RECORD_KEY_PATH: readonly string[] = ['kind', 'id'];

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

/** Creates the record store with the key of the current version. */
function createRecordStore(db: IDBDatabase): IDBObjectStore {
  const records = db.createObjectStore(STORE_RECORDS, {
    keyPath: [...RECORD_KEY_PATH],
  });
  records.createIndex(INDEX_KIND, 'kind', { unique: false });
  return records;
}

function hasCompoundKey(keyPath: string | string[] | null): boolean {
  return (
    Array.isArray(keyPath) &&
    keyPath.length === RECORD_KEY_PATH.length &&
    keyPath.every((part, index) => part === RECORD_KEY_PATH[index])
  );
}

/**
 * Brings a row of the first version into the shape the compound key needs.
 * A row without a usable kind is kept as a legacy record instead of being
 * thrown away.
 */
function moveRecordRow(row: unknown): Record<string, unknown> | null {
  if (typeof row !== 'object' || row === null) return null;

  const record = { ...(row as Record<string, unknown>) };
  const id = typeof record.id === 'string' ? record.id : String(record.id ?? '');
  const kind =
    typeof record.kind === 'string' && record.kind.length > 0
      ? record.kind
      : 'legacy';

  return { ...record, id, kind };
}

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
        createRecordStore(db);
        return;
      }

      const legacy = request.transaction?.objectStore(STORE_RECORDS);
      if (!legacy || hasCompoundKey(legacy.keyPath)) return;

      // The store of the first version was keyed by the id alone. Its rows
      // are moved into a store that is keyed by the kind and the id together,
      // so no record can change its kind by being moved.
      const rows = legacy.getAll();

      rows.onsuccess = () => {
        db.deleteObjectStore(STORE_RECORDS);
        const records = createRecordStore(db);

        for (const row of rows.result) {
          const moved = moveRecordRow(row);
          if (!moved) continue;

          const put = records.put(moved);
          // A row that cannot be moved is skipped rather than letting the
          // whole upgrade fail and the app stop opening.
          put.onerror = (event) => event.preventDefault();
        }
      };
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
