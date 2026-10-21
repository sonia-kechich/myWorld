import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSalt, deriveVaultKey } from '../../crypto/keys';
import { deleteDatabase } from '../db';
import { getMeta, listRawEntries } from '../records';
import { migrateVault, MIGRATION_META, writeLegacyRecord } from '../migrate';
import { VaultStore } from '../vaultStore';

let store: VaultStore;

beforeEach(async () => {
  await deleteDatabase();
  localStorage.clear();

  const key = await deriveVaultKey('test password', createSalt(), 1000);
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
});
