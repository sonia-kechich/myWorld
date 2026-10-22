import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DecryptionError } from '../../crypto/aesgcm';
import { base64ToBytes, bytesToBase64 } from '../../crypto/base64';
import { createSalt, deriveVaultKey } from '../../crypto/keys';
import { deleteDatabase, openDatabase, STORE_RECORDS } from '../db';
import { getRecord, listRawEntries, putRawEntry } from '../records';
import { VaultStore } from '../vaultStore';

let store: VaultStore;

beforeEach(async () => {
  await deleteDatabase();

  const key = await deriveVaultKey('test password', createSalt(), 1000);
  store = new VaultStore(key);
});

afterEach(async () => {
  await deleteDatabase();
});

describe('vault store', () => {
  it('keeps a value through a round trip', async () => {
    await store.put('quote', 'quote:1', { id: 1, text: 'Every hard moment is building me.' });

    const restored = await store.get<{ id: number; text: string }>('quote', 'quote:1');

    expect(restored).toEqual({ id: 1, text: 'Every hard moment is building me.' });
  });

  it('never leaves the text readable on disk', async () => {
    const text = 'a very private thought';
    await store.put('entry', 'entry:1', { text });

    const raw = await listRawEntries();
    const serialised = JSON.stringify(raw);

    expect(serialised).not.toContain(text);
    expect(serialised).toContain('"ct"');
  });

  it('lists the records of one kind only', async () => {
    await store.put('quote', 'quote:1', { id: 1 });
    await store.put('quote', 'quote:2', { id: 2 });
    await store.put('entry', 'entry:1', { id: 3 });

    const { items, corruptIds } = await store.list<{ id: number }>('quote');

    expect(items.map((item) => item.value.id)).toEqual([1, 2]);
    expect(corruptIds).toEqual([]);
  });

  it('removes a record', async () => {
    await store.put('quote', 'quote:1', { id: 1 });
    await store.remove('quote', 'quote:1');

    expect(await store.get('quote', 'quote:1')).toBeNull();
  });

  it('refuses to open a record that was moved to another id', async () => {
    await store.put('quote', 'quote:1', { id: 1 });

    const record = await getRecord('quote', 'quote:1');
    expect(record).not.toBeNull();

    const db = await openDatabase();
    const transaction = db.transaction(STORE_RECORDS, 'readwrite');
    transaction.objectStore(STORE_RECORDS).put({ ...record, id: 'quote:2' });
    await new Promise((resolve) => {
      transaction.oncomplete = () => resolve(null);
    });

    await expect(store.get('quote', 'quote:2')).rejects.toBeInstanceOf(DecryptionError);
  });

  it('reports a record whose ciphertext was damaged', async () => {
    await store.put('quote', 'quote:1', { id: 1 });
    await store.put('quote', 'quote:2', { id: 2 });

    const record = await getRecord('quote', 'quote:1');
    expect(record).not.toBeNull();

    const bytes = base64ToBytes(record?.envelope.ct ?? '');
    bytes[0] = (bytes[0] ?? 0) ^ 0xff;

    await putRawEntry({
      ...record,
      envelope: { ...record?.envelope, ct: bytesToBase64(bytes) },
    });

    const { items, corruptIds } = await store.list<{ id: number }>('quote');

    expect(items.map((item) => item.value.id)).toEqual([2]);
    expect(corruptIds).toEqual(['quote:1']);
  });

  it('keeps the creation time of a record it overwrites', async () => {
    await store.put('quote', 'quote:1', { id: 1, text: 'first' });
    const first = await getRecord('quote', 'quote:1');

    await new Promise((resolve) => setTimeout(resolve, 5));
    await store.put('quote', 'quote:1', { id: 1, text: 'second' });
    const second = await getRecord('quote', 'quote:1');

    expect(second?.createdAt).toBe(first?.createdAt);
    expect(second?.updatedAt).toBeGreaterThanOrEqual(first?.updatedAt ?? 0);
  });
});
