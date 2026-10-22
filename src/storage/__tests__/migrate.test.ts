import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSalt, deriveVaultKey } from '../../crypto/keys';
import { deleteDatabase } from '../db';
import { getMeta, listRawEntries, putRawEntry } from '../records';
import { migrateVault, MIGRATION_META, writeLegacyRecord } from '../migrate';
import { VaultStore } from '../vaultStore';
import { LEGACY_COPY_ID } from '../../auth/vaultConfig';
import type { RecordKind } from '../records';

let key: CryptoKey;
let store: VaultStore;

/** A store whose copy of the old data cannot be written. */
class FailingCopyStore extends VaultStore {
  async put<T>(kind: RecordKind, id: string, value: T): Promise<void> {
    if (kind === 'legacy' && id === LEGACY_COPY_ID) {
      throw new Error('there is no space left');
    }
    await super.put(kind, id, value);
  }
}

/** A store whose records cannot be sealed. */
class FailingRecordStore extends VaultStore {
  async put<T>(kind: RecordKind, id: string, value: T): Promise<void> {
    if (kind === 'quote') {
      throw new Error('the write was rejected');
    }
    await super.put(kind, id, value);
  }
}

beforeEach(async () => {
  await deleteDatabase();
  localStorage.clear();

  key = await deriveVaultKey('test password', createSalt(), 1000);
  store = new VaultStore(key);
});

afterEach(async () => {
  await deleteDatabase();
  localStorage.clear();
});

describe('migration', () => {
  it('seals a legacy plaintext record', async () => {
    await writeLegacyRecord('quote:1', 'quote', { id: 1, text: 'an old quote' });

    const report = await migrateVault(store);

    expect(report.migratedRecords).toBe(1);
    expect(report.toVersion).toBe(1);

    const restored = await store.get<{ text: string }>('quote', 'quote:1');
    expect(restored?.text).toBe('an old quote');

    const raw = JSON.stringify(await listRawEntries());
    expect(raw).not.toContain('an old quote');
  });

  it('moves legacy local storage into the vault and clears the source', async () => {
    localStorage.setItem(
      'myworld.quotes',
      JSON.stringify([{ id: 1, text: 'from local storage' }]),
    );

    const report = await migrateVault(store);

    expect(report.migratedStorageKeys).toBe(1);
    expect(localStorage.getItem('myworld.quotes')).toBeNull();

    const restored = await store.get<{ text: string }>('quote', 'quote:1');
    expect(restored?.text).toBe('from local storage');
  });

  it('moves legacy progress into the vault', async () => {
    localStorage.setItem('myworld.xp', JSON.stringify(120));

    await migrateVault(store);

    const restored = await store.get<{ xp: number }>('progress', 'progress');
    expect(restored?.xp).toBe(120);
  });

  it('runs only once', async () => {
    await writeLegacyRecord('quote:1', 'quote', { id: 1, text: 'an old quote' });

    const first = await migrateVault(store);
    const second = await migrateVault(store);

    expect(first.migratedRecords).toBe(1);
    expect(second.migratedRecords).toBe(0);
    expect(second.fromVersion).toBe(1);
  });

  it('stamps the applied version', async () => {
    await migrateVault(store);

    const stamp = await getMeta<{ version: number }>(MIGRATION_META);
    expect(stamp?.version).toBe(1);
  });

  it('leaves already encrypted records alone', async () => {
    await store.put('quote', 'quote:1', { id: 1, text: 'already sealed' });

    const report = await migrateVault(store);

    expect(report.migratedRecords).toBe(0);
    expect((await store.get<{ text: string }>('quote', 'quote:1'))?.text).toBe(
      'already sealed',
    );
  });

  it('keeps an encrypted copy of the old data before the source is removed', async () => {
    await writeLegacyRecord('quote:1', 'quote', { id: 1, text: 'an old quote' });
    localStorage.setItem(
      'myworld.quotes',
      JSON.stringify([{ id: 2, text: 'from local storage' }]),
    );

    const report = await migrateVault(store);

    expect(report.keptLegacyCopy).toBe(true);

    const copy = await store.get<{
      capturedAt: number;
      records: Array<{ id: string; value: { text: string } }>;
      storage: Record<string, unknown>;
    }>('legacy', LEGACY_COPY_ID);

    expect(copy).not.toBeNull();
    expect(copy?.records[0]?.value.text).toBe('an old quote');
    expect(JSON.stringify(copy?.storage)).toContain('from local storage');

    // the copy is sealed like everything else
    const raw = JSON.stringify(await listRawEntries());
    expect(raw).not.toContain('an old quote');
    expect(raw).not.toContain('from local storage');
  });

  it('says when there was nothing old to keep', async () => {
    const report = await migrateVault(store);

    expect(report.keptLegacyCopy).toBe(false);
    expect(await store.get('legacy', LEGACY_COPY_ID)).toBeNull();
  });

  it('keeps the local storage when the copy of the old data cannot be written', async () => {
    localStorage.setItem(
      'myworld.quotes',
      JSON.stringify([{ id: 1, text: 'from local storage' }]),
    );

    const failing = new FailingCopyStore(key);

    await expect(migrateVault(failing)).rejects.toThrow();

    // the plaintext source is still there, the migration can be run again
    expect(localStorage.getItem('myworld.quotes')).not.toBeNull();
    expect(await getMeta<{ version: number }>(MIGRATION_META)).toBeNull();
  });

  it('keeps the local storage when a record cannot be sealed', async () => {
    localStorage.setItem(
      'myworld.quotes',
      JSON.stringify([{ id: 1, text: 'from local storage' }]),
    );

    const failing = new FailingRecordStore(key);

    await expect(migrateVault(failing)).rejects.toThrow();

    expect(localStorage.getItem('myworld.quotes')).not.toBeNull();
  });

  it('keeps old text that is not valid json', async () => {
    localStorage.setItem('myworld.quotes', 'this is not json');

    const report = await migrateVault(store);

    expect(report.skipped).toBe(1);
    expect(localStorage.getItem('myworld.quotes')).toBeNull();

    const copy = await store.get<{
      storageRaw: Record<string, string>;
    }>('legacy', LEGACY_COPY_ID);

    expect(copy?.storageRaw['myworld.quotes']).toBe('this is not json');
  });

  it('seals a record of a kind it does not know', async () => {
    await writeLegacyRecord('old:1', 'oldkind', { id: 1, text: 'from an old kind' });

    const report = await migrateVault(store);

    expect(report.unknownKinds).toEqual(['oldkind']);
    expect(report.migratedRecords).toBe(1);

    const restored = await store.get<{ text: string }>(
      'oldkind' as RecordKind,
      'old:1',
    );
    expect(restored?.text).toBe('from an old kind');

    // the record is sealed, no plaintext is left at rest
    const raw = JSON.stringify(await listRawEntries());
    expect(raw).not.toContain('from an old kind');
  });

  it('does not overwrite a copy of the old data that is already there', async () => {
    await store.put('legacy', LEGACY_COPY_ID, {
      capturedAt: 1000,
      records: [{ id: 'quote:1', kind: 'quote', value: { text: 'the first copy' } }],
      storage: { 'myworld.quotes': [{ id: 1, text: 'from local storage' }] },
      storageRaw: {},
      garbage: [],
    });

    localStorage.setItem(
      'myworld.quotes',
      JSON.stringify([{ id: 2, text: 'from local storage' }]),
    );

    const report = await migrateVault(store);

    expect(report.keptLegacyCopy).toBe(true);

    const copy = await store.get<{
      capturedAt: number;
      records: Array<{ value: { text: string } }>;
    }>('legacy', LEGACY_COPY_ID);

    expect(copy?.capturedAt).toBe(1000);
    expect(copy?.records[0]?.value.text).toBe('the first copy');
  });

  it('keeps a row it cannot understand in the copy and removes it', async () => {
    await putRawEntry({ kind: 'quote', id: '', value: { text: 'a broken row' } });

    const report = await migrateVault(store);

    expect(report.skipped).toBe(1);

    const copy = await store.get<{
      garbage: Array<{ id: string; kind: string; value: { text: string } }>;
    }>('legacy', LEGACY_COPY_ID);

    expect(copy?.garbage[0]?.value.text).toBe('a broken row');

    const raw = JSON.stringify(await listRawEntries());
    expect(raw).not.toContain('a broken row');
  });
});
