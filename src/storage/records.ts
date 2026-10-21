import type { EncryptedEnvelope } from '../crypto/envelope';
import {
  openDatabase,
  requestToPromise,
  STORE_META,
  STORE_RECORDS,
  transactionDone,
} from './db';

export type RecordKind =
  | 'settings'
  | 'progress'
  | 'reflect'
  | 'game'
  | 'quote'
  | 'entry';

export interface StoredRecord {
  id: string;
  kind: RecordKind;
  envelope: EncryptedEnvelope;
  createdAt: number;
  updatedAt: number;
}

export interface MetaRecord {
  name: string;
  value: unknown;
  updatedAt: number;
}

export async function getMeta<T>(name: string): Promise<T | null> {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_META, 'readonly');
  const record = await requestToPromise(
    transaction.objectStore(STORE_META).get(name) as IDBRequest<
      MetaRecord | undefined
    >,
  );
  await transactionDone(transaction);

  if (!record) return null;
  return record.value as T;
}

export async function setMeta(name: string, value: unknown): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_META, 'readwrite');
  transaction.objectStore(STORE_META).put({
    name,
    value,
    updatedAt: Date.now(),
  } satisfies MetaRecord);
  await transactionDone(transaction);
}

export async function deleteMeta(name: string): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_META, 'readwrite');
  transaction.objectStore(STORE_META).delete(name);
  await transactionDone(transaction);
}

export async function putRecord(record: StoredRecord): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_RECORDS, 'readwrite');
  transaction.objectStore(STORE_RECORDS).put(record);
  await transactionDone(transaction);
}

export async function getRecord(id: string): Promise<StoredRecord | null> {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_RECORDS, 'readonly');
  const record = await requestToPromise(
    transaction.objectStore(STORE_RECORDS).get(id) as IDBRequest<
      StoredRecord | undefined
    >,
  );
  await transactionDone(transaction);

  return record ?? null;
}

export async function listRecords(kind?: RecordKind): Promise<StoredRecord[]> {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_RECORDS, 'readonly');
  const store = transaction.objectStore(STORE_RECORDS);

  const records = kind
    ? await requestToPromise(
        store.index('kind').getAll(kind) as IDBRequest<StoredRecord[]>,
      )
    : await requestToPromise(store.getAll() as IDBRequest<StoredRecord[]>);

  await transactionDone(transaction);
  return records;
}

/**
 * Reads every raw entry of the record store, including legacy plaintext
 * records written before the vault existed. Used by the migration routine.
 */
export async function listRawEntries(): Promise<unknown[]> {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_RECORDS, 'readonly');
  const entries = await requestToPromise(
    transaction.objectStore(STORE_RECORDS).getAll() as IDBRequest<unknown[]>,
  );
  await transactionDone(transaction);
  return entries;
}

/**
 * Writes an arbitrary entry into the record store, bypassing the encrypted
 * shape. Only used to seed legacy plaintext records for the migration path.
 */
export async function putRawEntry(entry: unknown): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_RECORDS, 'readwrite');
  transaction.objectStore(STORE_RECORDS).put(entry);
  await transactionDone(transaction);
}

export async function deleteRecord(id: string): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_RECORDS, 'readwrite');
  transaction.objectStore(STORE_RECORDS).delete(id);
  await transactionDone(transaction);
}
