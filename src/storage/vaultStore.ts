import { decryptJson, encryptJson } from '../crypto/aesgcm';
import type { EncryptedEnvelope } from '../crypto/envelope';
import {
  getRecord,
  listRecords,
  putRecord,
  putRecords,
  replaceRecords,
  deleteRecord,
  type RecordKind,
  type StoredRecord,
  type UnreadableRecord,
} from './records';

export interface VaultItem<T> {
  id: string;
  value: T;
  createdAt: number;
  updatedAt: number;
}

export interface StoreEntry<T = unknown> {
  kind: RecordKind;
  id: string;
  value: T;
  createdAt?: number;
  updatedAt?: number;
}

export interface VaultExport<T = unknown> {
  /** The records that could be read. */
  entries: StoreEntry<T>[];
  /** The records that are in the store but cannot be read. */
  unreadable: UnreadableRecord[];
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
export class VaultStore {
  constructor(private readonly key: CryptoKey) {}

  static aad(kind: RecordKind, id: string): string {
    return `myworld|${kind}|${id}|v1`;
  }

  async put<T>(kind: RecordKind, id: string, value: T): Promise<void> {
    const existing = await getRecord(kind, id);
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
    const record = await getRecord(kind, id);
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
    await deleteRecord(kind, id);
  }

  /** Raw (still encrypted) records, used for backups. */
  async exportRaw(): Promise<StoredRecord[]> {
    return listRecords();
  }

  /**
   * Every readable record with its content decrypted. Records that cannot be
   * read are not part of the result, they are named in `unreadable` so the
   * caller can tell the user that they are missing.
   */
  async exportValues<T = unknown>(
    kinds?: RecordKind[],
  ): Promise<VaultExport<T>> {
    const records = await listRecords();
    const entries: StoreEntry<T>[] = [];
    const unreadable: UnreadableRecord[] = [];

    for (const record of records) {
      if (kinds && !kinds.includes(record.kind)) continue;

      try {
        const value = await decryptJson<T>(
          this.key,
          record.envelope,
          VaultStore.aad(record.kind, record.id),
        );

        entries.push({
          kind: record.kind,
          id: record.id,
          value,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        });
      } catch {
        // A damaged record cannot be read. It is named so that nobody thinks
        // the vault holds less than it does.
        unreadable.push({ kind: record.kind, id: record.id });
      }
    }

    return { entries, unreadable };
  }

  /**
   * Writes many records at once. The encryption happens first, the write
   * itself is a single transaction, so the store is never half written.
   */
  async putMany(entries: StoreEntry[]): Promise<void> {
    const prepared = await this.seal(entries);
    await putRecords(prepared);
  }

  /**
   * Replaces the whole store with the given records in one transaction.
   */
  async replaceAll(entries: StoreEntry[]): Promise<void> {
    const prepared = await this.seal(entries);
    await replaceRecords(prepared);
  }

  private async seal(entries: StoreEntry[]): Promise<StoredRecord[]> {
    const now = Date.now();
    const prepared: StoredRecord[] = [];

    for (const entry of entries) {
      const existing = await getRecord(entry.kind, entry.id);
      const envelope = await encryptJson(
        this.key,
        entry.value,
        VaultStore.aad(entry.kind, entry.id),
      );

      prepared.push({
        id: entry.id,
        kind: entry.kind,
        envelope,
        createdAt: entry.createdAt ?? existing?.createdAt ?? now,
        updatedAt: entry.updatedAt ?? now,
      });
    }

    return prepared;
  }

  /** Raw (still encrypted) record, used by tests to inspect what is at rest. */
  async readRaw(kind: RecordKind, id: string): Promise<StoredRecord | null> {
    return getRecord(kind, id);
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
