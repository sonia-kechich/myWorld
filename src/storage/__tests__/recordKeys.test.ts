import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSalt, deriveVaultKey } from '../../crypto/keys';
import {
  DB_NAME,
  deleteDatabase,
  INDEX_KIND,
  openDatabase,
  STORE_RECORDS,
} from '../db';
import { getRecord, listRecords } from '../records';
import { migrateVault } from '../migrate';
import { VaultStore } from '../vaultStore';

let store: VaultStore;

/**
 * Writes a database in the shape of the first version, where the records were
 * keyed by their id alone.
 */
async function createFirstVersionDatabase(rows: unknown[]): Promise<void> {
  await deleteDatabase();

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      const records = db.createObjectStore(STORE_RECORDS, { keyPath: 'id' });
      records.createIndex(INDEX_KIND, 'kind', { unique: false });
    };

    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(STORE_RECORDS, 'readwrite');
      const records = transaction.objectStore(STORE_RECORDS);

      for (const row of rows) {
        records.put(row);
      }

      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    };

    request.onerror = () => reject(request.error);
  });
}

beforeEach(async () => {
  await deleteDatabase();

  const key = await deriveVaultKey('test password', createSalt(), 1000);
  store = new VaultStore(key);
});

afterEach(async () => {
  await deleteDatabase();
});

describe('the key of a record', () => {
  it('keeps a record of one kind away from a record of another kind', async () => {
    await store.put('settings', 'settings', { autoLockMinutes: 5 });
    await store.put('quote', 'settings', { id: 1, text: 'a quote' });

    const settings = await store.get<{ autoLockMinutes: number }>(
      'settings',
      'settings',
    );
    const quote = await store.get<{ text: string }>('quote', 'settings');

    expect(settings?.autoLockMinutes).toBe(5);
    expect(quote?.text).toBe('a quote');
    expect(await listRecords()).toHaveLength(2);
  });

  it('does not let a record of another kind take the place of a record', async () => {
    await store.put('settings', 'settings', { autoLockMinutes: 5 });
    await store.put('quote', 'settings', { id: 1, text: 'a quote' });

    await store.remove('quote', 'settings');

    expect(await store.get('settings', 'settings')).not.toBeNull();
    expect(await store.get('quote', 'settings')).toBeNull();
  });
});

describe('the first version of the database', () => {
  it('keeps every record when the store is moved to the compound key', async () => {
    await createFirstVersionDatabase([
      { id: 'quote:1', kind: 'quote', envelope: { iv: 'a', ct: 'b' }, createdAt: 1, updatedAt: 2 },
      { id: 'settings', kind: 'settings', envelope: { iv: 'c', ct: 'd' }, createdAt: 3, updatedAt: 4 },
    ]);

    const moved = await getRecord('quote', 'quote:1');
    const settings = await getRecord('settings', 'settings');

    expect(moved?.id).toBe('quote:1');
    expect(moved?.kind).toBe('quote');
    expect(settings?.kind).toBe('settings');
    expect(await listRecords()).toHaveLength(2);
  });

  it('seals a legacy plaintext record after the move', async () => {
    await createFirstVersionDatabase([
      { id: 'quote:1', kind: 'quote', value: { id: 1, text: 'an old quote' } },
    ]);

    const report = await migrateVault(store);

    expect(report.migratedRecords).toBe(1);
    expect((await store.get<{ text: string }>('quote', 'quote:1'))?.text).toBe(
      'an old quote',
    );
  });

  it('opens the store of the current version without touching the rows', async () => {
    await store.put('quote', 'quote:1', { id: 1, text: 'a quote' });

    const db = await openDatabase();
    const transaction = db.transaction(STORE_RECORDS, 'readonly');
    const rows = await new Promise<unknown[]>((resolve, reject) => {
      const request = transaction.objectStore(STORE_RECORDS).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    expect(rows).toHaveLength(1);
  });
});
