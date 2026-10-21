import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deleteDatabase } from '../../storage/db';
import { listRawEntries } from '../../storage/records';
import { parseVaultFile, serializeVaultFile, VaultFileError } from '../vaultFile';
import { VaultError, VaultService } from '../../auth/vaultService';
import { createClock, createTestVault, resetVaultState, TEST_PASSWORD } from '../../test/helpers';

beforeEach(async () => {
  await resetVaultState();
});

afterEach(async () => {
  await deleteDatabase();
});

describe('backup file', () => {
  it('refuses a file that is not a myWorld backup', () => {
    expect(() => parseVaultFile('not json')).toThrow(VaultFileError);
    expect(() => parseVaultFile('{"format":"something-else"}')).toThrow(VaultFileError);
    expect(() => parseVaultFile('{"format":"myworld-vault","version":99}')).toThrow(
      VaultFileError,
    );
  });

  it('survives a round trip through text', async () => {
    const { service } = await createTestVault();
    const file = await service.exportBackup();

    const parsed = parseVaultFile(serializeVaultFile(file));

    expect(parsed.format).toBe('myworld-vault');
    expect(parsed.kdf.iterations).toBe(file.kdf.iterations);
    expect(parsed.records.length).toBe(file.records.length);
  });
});

describe('export', () => {
  it('only ever contains ciphertext', async () => {
    const clock = createClock();
    const { service } = await createTestVault(TEST_PASSWORD, 1000, clock);

    await service.store().put('quote', 'quote:1', { id: 1, text: 'a private quote' });

    const file = await service.exportBackup();
    const serialised = JSON.stringify(file);

    expect(serialised).not.toContain('a private quote');
    expect(file.records.length).toBeGreaterThan(0);
  });
});

describe('import', () => {
  it('restores a backup into an empty device', async () => {
    const clock = createClock();
    const source = await createTestVault(TEST_PASSWORD, 1000, clock);
    await source.service.store().put('quote', 'quote:1', {
      id: 1,
      text: 'a private quote',
    });

    const file = await source.service.exportBackup();

    await deleteDatabase();

    const target = new VaultService({ kdfIterations: 1000 });
    const count = await target.importBackup(file, TEST_PASSWORD);

    expect(count).toBe(file.records.length);
    expect(await target.store().get<{ text: string }>('quote', 'quote:1')).toEqual({
      id: 1,
      text: 'a private quote',
    });
  });

  it('refuses a backup that belongs to another password', async () => {
    const clock = createClock();
    const source = await createTestVault(TEST_PASSWORD, 1000, clock);
    const file = await source.service.exportBackup();

    await deleteDatabase();

    const target = new VaultService({ kdfIterations: 1000 });

    await expect(target.importBackup(file, 'a different password')).rejects.toMatchObject(
      { code: 'incorrect-password' },
    );
  });

  it('refuses a backup whose records were tampered with', async () => {
    const clock = createClock();
    const source = await createTestVault(TEST_PASSWORD, 1000, clock);
    await source.service.store().put('quote', 'quote:1', { id: 1, text: 'private' });

    const file = await source.service.exportBackup();
    const damaged = {
      ...file,
      records: file.records.map((record) => ({
        ...record,
        envelope: { ...record.envelope, ct: record.envelope.ct.replace(/^./, 'A') },
      })),
    };

    await deleteDatabase();

    const target = new VaultService({ kdfIterations: 1000 });

    await expect(target.importBackup(damaged, TEST_PASSWORD)).rejects.toMatchObject({
      code: 'corrupt-vault',
    });
  });

  it('leaves the device untouched when the import fails', async () => {
    const clock = createClock();
    const source = await createTestVault(TEST_PASSWORD, 1000, clock);
    const file = await source.service.exportBackup();

    await deleteDatabase();

    const target = new VaultService({ kdfIterations: 1000 });

    await expect(target.importBackup(file, 'a different password')).rejects.toBeInstanceOf(
      VaultError,
    );

    expect(await listRawEntries()).toEqual([]);
  });
});
