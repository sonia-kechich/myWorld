import { decryptJson, encryptJson } from '../crypto/aesgcm';
import type { EncryptedEnvelope } from '../crypto/envelope';
import {
  getRecord,
  listRecords,
  putRecord,
  deleteRecord,
  type RecordKind,
  type StoredRecord,
} from './records';

export interface VaultItem<T> {
  id: string;
  value: T;
  createdAt: number;
  updatedAt: number;
}

export interface VaultList<T> {
  items: VaultItem<T>[];
  /** Ids of records that could not be decrypted (wrong key or altered data). */
  corruptIds: string[];
}

/**
 * Encrypted view over the local record store. Every value is sealed with
 * AES-256-GCM under the vault key, and the additional authenticated data
 * binds the ciphertext to its kind and id, so a record cannot be moved or
 * swapped without breaking authentication.
 */
export class VaultStore {  constructor(private readonly key: CryptoKey) {}

  static aad(kind: RecordKind, id: string): string {
    return `myworld|${kind}|${id}|v1`;
  }

  async put<T>(kind: RecordKind, id: string, value: T): Promise<void> {
    const existing = await getRecord(id);
    const envelope = await encryptJson(this.key, value, VaultStore.aad(kind, id));
    const now = Date.now();

    await putRecord({
      id,
      kind,
      envelope,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  }

  async get<T>(kind: RecordKind, id: string): Promise<T | null> {
    const record = await getRecord(id);
    if (!record) return null;

    const value = await decryptJson<T>(
      this.key,
      record.envelope,
      VaultStore.aad(kind, id),
    );
    return value;
  }

  async list<T>(kind: RecordKind): Promise<VaultList<T>> {
    const records = await listRecords(kind);
    const items: VaultItem<T>[] = [];
    const corruptIds: string[] = [];

    for (const record of records) {
      try {
        const value = await decryptJson<T>(
          this.key,
          record.envelope,
          VaultStore.aad(kind, record.id),
        );
        items.push({
          id: record.id,
          value,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        });
      } catch {
        corruptIds.push(record.id);
      }
    }

    items.sort((a, b) => a.createdAt - b.createdAt);
    return { items, corruptIds };
  }

  async remove(kind: RecordKind, id: string): Promise<void> {
    const record = await getRecord(id);
    if (record && record.kind !== kind) {
      throw new Error(`Record ${id} does not belong to ${kind}`);
    }
    await deleteRecord(id);
  }

  /** Raw (still encrypted) records, used for backups. */
  async exportRaw(): Promise<StoredRecord[]> {
    return listRecords();
  }

  /** Raw (still encrypted) record, used by tests to inspect what is at rest. */
  async readRaw(id: string): Promise<StoredRecord | null> {
    return getRecord(id);
  }

  /** Restores a raw record without touching it, used by the import flow. */
  async writeRaw(record: StoredRecord): Promise<void> {
    await putRecord(record);
  }

  static isEnvelopeLike(value: unknown): value is { envelope: EncryptedEnvelope } {
    return (
      typeof value === 'object' &&
      value !== null &&
      'envelope' in value &&
      typeof (value as { envelope: unknown }).envelope === 'object'
    );
  }
}

/**
 * Starts a store operation without letting a failure become an unhandled
 * rejection. The screen keeps whatever it already shows, the vault stays
 * closed, and nothing is written to the console.
 */
export function writeQuietly(operation: Promise<unknown>): void {
  void operation.catch(() => undefined);
}
