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
  | 'entry'
  /** Encrypted copy of the data of the old, unprotected version. */
  | 'legacy'
  /** Encrypted copy of the vault taken before a restore, used to undo it. */
  | 'backup';

export const RECORD_KINDS: readonly RecordKind[] = [
  'settings',
  'progress',
  'reflect',
  'game',
  'quote',
  'entry',
  'legacy',
  'backup',
];

/** Tells whether a value is a kind the app knows. */
export function isRecordKind(value: unknown): value is RecordKind {
  return typeof value === 'string' && RECORD_KINDS.includes(value as RecordKind);
}

/**
 * A record that is in the store but cannot be read, because its ciphertext
 * was damaged or does not belong to the key. It is named so the user can be
 * told that it is missing from a backup.
 */
export interface UnreadableRecord {
  kind: RecordKind;
  id: string;
}

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

export async function getRecord(
  kind: RecordKind,
  id: string,
): Promise<StoredRecord | null> {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_RECORDS, 'readonly');
  const record = await requestToPromise(
    transaction.objectStore(STORE_RECORDS).get([kind, id]) as IDBRequest<
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

export async function deleteRecord(kind: RecordKind, id: string): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_RECORDS, 'readwrite');
  transaction.objectStore(STORE_RECORDS).delete([kind, id]);
  await transactionDone(transaction);
}

/**
 * Removes a row of the record store by its raw key. Used by the migration for
 * rows that could not be understood, whatever kind they carry.
 */
export async function deleteRawEntry(kind: string, id: string): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_RECORDS, 'readwrite');
  transaction.objectStore(STORE_RECORDS).delete([kind, id]);
  await transactionDone(transaction);
}

/**
 * Writes many records in a single transaction. Either every record lands or
 * none of them do, so an interrupted write can never leave half a restore
 * behind.
 */
export async function putRecords(records: StoredRecord[]): Promise<void> {
  if (records.length === 0) return;

  const db = await openDatabase();
  const transaction = db.transaction(STORE_RECORDS, 'readwrite');
  const store = transaction.objectStore(STORE_RECORDS);

  for (const record of records) {
    store.put(record);
  }

  await transactionDone(transaction);
}

/**
 * Replaces the whole record store in a single transaction. The clear and the
 * new records belong to the same transaction, so a failure leaves the old
 * records untouched.
 */
export async function replaceRecords(records: StoredRecord[]): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_RECORDS, 'readwrite');
  const store = transaction.objectStore(STORE_RECORDS);

  store.clear();

  for (const record of records) {
    store.put(record);
  }

  await transactionDone(transaction);
}
