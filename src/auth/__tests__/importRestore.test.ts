import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { base64ToBytes, bytesToBase64 } from '../../crypto/base64';
import { deleteDatabase } from '../../storage/db';
import { getRecord, putRawEntry } from '../../storage/records';
import {
  buildPortableBackup,
  PortableBackupError,
} from '../../backup/portableBackup';
import { LEGACY_COPY_ID, RECOVERY_COPY_ID } from '../vaultConfig';
import { createTestVault, resetVaultState } from '../../test/helpers';

const BACKUP_PASSWORD = 'a backup password that is long enough';

const QUOTE = {
  id: 1,
  text: 'a quiet line to keep',
  reminder: null,
  active: false,
  createdAt: 1_700_000_000_000,
};

async function putQuote(
  service: Awaited<ReturnType<typeof createTestVault>>['service'],
  id: string,
  text: string,
  updatedAt: number,
): Promise<void> {
  await service.store().putMany([
    {
      kind: 'quote',
      id,
      value: { ...QUOTE, id: 1, text },
      createdAt: 1_700_000_000_000,
      updatedAt,
    },
  ]);
}

/** Damages a record so that it can no longer be read. */
async function damageQuote(
  service: Awaited<ReturnType<typeof createTestVault>>['service'],
  id: string,
): Promise<void> {
  const record = await service.store().readRaw('quote', id);
  expect(record).not.toBeNull();

  const bytes = base64ToBytes(record?.envelope.ct ?? '');
  bytes[0] = (bytes[0] ?? 0) ^ 0xff;

  await putRawEntry({
    ...record,
    envelope: { ...record?.envelope, ct: bytesToBase64(bytes) },
  });
}
beforeEach(async () => {
  await resetVaultState();
});

afterEach(async () => {
  await deleteDatabase();
});

describe('portable export', () => {
  it('does not carry the authenticator secret or the recovery copy', async () => {
    const vault = await createTestVault();
    const store = vault.service.store();

    await putQuote(vault.service, 'quote:1', 'a quiet line to keep', 1_700_000_000_000);
    await store.put('legacy', LEGACY_COPY_ID, { capturedAt: 1, records: [], storage: {} });
    await store.put('backup', RECOVERY_COPY_ID, { createdAt: 1, records: [] });

    const { backup } = await vault.service.exportPortable(BACKUP_PASSWORD, {
      iterations: 1_000,
    });

    const text = JSON.stringify(backup);

    expect(text).not.toContain(vault.secret);
    expect(text).not.toContain('a quiet line to keep');

    const kinds = backup.records.map((record) => record.kind);

    expect(kinds).toContain('quote');
    expect(kinds).not.toContain('legacy');
    expect(kinds).not.toContain('backup');
  });

  it('is opened with the backup password and not with the vault password', async () => {
    const vault = await createTestVault();
    const { backup } = await vault.service.exportPortable(BACKUP_PASSWORD, {
      iterations: 1_000,
    });

    await expect(
      vault.service.prepareImport(backup, 'the vault password is different'),
    ).rejects.toThrowError(PortableBackupError);
  });

  it('names the records it could not read', async () => {
    const vault = await createTestVault();

    await putQuote(vault.service, 'quote:1', 'a quiet line to keep', 1_700_000_000_000);
    await damageQuote(vault.service, 'quote:1');

    const { backup, unreadable } = await vault.service.exportPortable(
      BACKUP_PASSWORD,
      { iterations: 1_000 },
    );

    expect(unreadable).toEqual([{ kind: 'quote', id: 'quote:1' }]);

    // the record that cannot be read is not in the backup
    const plan = await vault.service.prepareImport(backup, BACKUP_PASSWORD);
    expect(plan.records.some((record) => record.id === 'quote:1')).toBe(false);
  });
});

describe('restore', () => {
  it('brings the records into another vault', async () => {
    const source = await createTestVault();
    await putQuote(source.service, 'quote:1', 'a quiet line to keep', 1_700_000_000_000);

    const { backup } = await source.service.exportPortable(BACKUP_PASSWORD, {
      iterations: 1_000,
    });

    await resetVaultState();

    const target = await createTestVault();
    const plan = await target.service.prepareImport(backup, BACKUP_PASSWORD);

    expect(plan.records.filter((record) => record.kind === 'quote')).toHaveLength(1);
    expect(plan.existingCount).toBe(1);

    const result = await target.service.applyImport(plan, 'merge');

    expect(result.imported).toBe(1);
    expect(result.kept).toBe(1);

    const restored = await target.service
      .store()
      .get<typeof QUOTE>('quote', 'quote:1');

    expect(restored?.text).toBe('a quiet line to keep');
  });

  it('keeps the record that is newer', async () => {
    const source = await createTestVault();
    await putQuote(source.service, 'quote:1', 'the older line', 1_700_000_000_000);

    const { backup } = await source.service.exportPortable(BACKUP_PASSWORD, {
      iterations: 1_000,
    });

    await resetVaultState();

    const target = await createTestVault();
    await putQuote(target.service, 'quote:1', 'the newer line', 1_700_000_900_000);

    const plan = await target.service.prepareImport(backup, BACKUP_PASSWORD);
    const result = await target.service.applyImport(plan, 'merge');

    expect(result.imported).toBe(0);
    expect(result.kept).toBe(2);

    const kept = await target.service.store().get<typeof QUOTE>('quote', 'quote:1');
    expect(kept?.text).toBe('the newer line');
  });

  it('takes the record of the backup when it is newer', async () => {
    const source = await createTestVault();
    await putQuote(source.service, 'quote:1', 'the newer line', 1_700_000_900_000);

    const { backup } = await source.service.exportPortable(BACKUP_PASSWORD, {
      iterations: 1_000,
    });

    await resetVaultState();

    const target = await createTestVault();
    await putQuote(target.service, 'quote:1', 'the older line', 1_700_000_000_000);

    const plan = await target.service.prepareImport(backup, BACKUP_PASSWORD);
    const result = await target.service.applyImport(plan, 'merge');

    expect(result.imported).toBe(1);
    expect(result.kept).toBe(1);

    const taken = await target.service.store().get<typeof QUOTE>('quote', 'quote:1');
    expect(taken?.text).toBe('the newer line');
  });

  it('replaces everything and can put the old content back', async () => {
    const source = await createTestVault();
    await putQuote(source.service, 'quote:1', 'from the backup', 1_700_000_000_000);

    const { backup } = await source.service.exportPortable(BACKUP_PASSWORD, {
      iterations: 1_000,
    });

    await resetVaultState();

    const target = await createTestVault();
    await putQuote(target.service, 'quote:9', 'from before the restore', 1_700_000_000_000);

    const plan = await target.service.prepareImport(backup, BACKUP_PASSWORD);
    const result = await target.service.applyImport(plan, 'replace');

    expect(result.replaced).toBe(2);
    expect(result.recoveryCopy).toBe(true);

    const store = target.service.store();

    expect(await store.get('quote', 'quote:9')).toBeNull();
    expect((await store.get<typeof QUOTE>('quote', 'quote:1'))?.text).toBe('from the backup');
    expect(await store.get('backup', RECOVERY_COPY_ID)).not.toBeNull();

    const undone = await target.service.undoLastImport();

    expect(undone).toBe(2);
    expect((await store.get<typeof QUOTE>('quote', 'quote:9'))?.text).toBe(
      'from before the restore',
    );
    expect(await store.get('quote', 'quote:1')).toBeNull();
  });

  it('keeps the copy of the old version when the vault is replaced', async () => {
    const source = await createTestVault();
    await putQuote(source.service, 'quote:1', 'from the backup', 1_700_000_000_000);

    const { backup } = await source.service.exportPortable(BACKUP_PASSWORD, {
      iterations: 1_000,
    });

    await resetVaultState();

    const target = await createTestVault();
    await target.service
      .store()
      .put('legacy', LEGACY_COPY_ID, { capturedAt: 1, records: [], storage: {} });

    const plan = await target.service.prepareImport(backup, BACKUP_PASSWORD);
    await target.service.applyImport(plan, 'replace');

    expect(await target.service.store().get('legacy', LEGACY_COPY_ID)).not.toBeNull();
  });

  it('says when there is nothing to put back', async () => {
    const vault = await createTestVault();

    await expect(vault.service.undoLastImport()).rejects.toThrowError(
      /no recovery copy/i,
    );
  });

  it('changes nothing when the password of the backup is wrong', async () => {
    const source = await createTestVault();
    await putQuote(source.service, 'quote:1', 'from the backup', 1_700_000_000_000);

    const { backup } = await source.service.exportPortable(BACKUP_PASSWORD, {
      iterations: 1_000,
    });

    await resetVaultState();

    const target = await createTestVault();
    await putQuote(target.service, 'quote:9', 'still here', 1_700_000_000_000);

    await expect(
      target.service.prepareImport(backup, 'the wrong password'),
    ).rejects.toThrowError(PortableBackupError);

    expect(
      (await target.service.store().get<typeof QUOTE>('quote', 'quote:9'))?.text,
    ).toBe('still here');
  });

  it('refuses to start when the vault is locked', async () => {
    const vault = await createTestVault();
    vault.service.lock();

    await expect(
      vault.service.exportPortable(BACKUP_PASSWORD, { iterations: 1_000 }),
    ).rejects.toThrowError(/locked/i);
  });

  it('says that a record that cannot be read is removed by a replace', async () => {
    const source = await createTestVault();
    await putQuote(source.service, 'quote:1', 'from the backup', 1_700_000_000_000);

    const { backup } = await source.service.exportPortable(BACKUP_PASSWORD, {
      iterations: 1_000,
    });

    await resetVaultState();

    const target = await createTestVault();
    await putQuote(target.service, 'quote:9', 'from before the restore', 1_700_000_000_000);
    await damageQuote(target.service, 'quote:9');

    const plan = await target.service.prepareImport(backup, BACKUP_PASSWORD);

    expect(plan.unreadable).toEqual([{ kind: 'quote', id: 'quote:9' }]);

    const { entries } = await target.service.store().exportValues();
    expect(plan.existingCount).toBe(entries.length + plan.unreadable.length);

    const result = await target.service.applyImport(plan, 'replace');

    expect(result.unreadableRemoved).toBe(1);
    expect(await target.service.store().get('quote', 'quote:9')).toBeNull();
  });

  it('keeps a record that cannot be read when the backup is merged', async () => {
    const source = await createTestVault();
    await putQuote(source.service, 'quote:1', 'from the backup', 1_700_000_000_000);

    const { backup } = await source.service.exportPortable(BACKUP_PASSWORD, {
      iterations: 1_000,
    });

    await resetVaultState();

    const target = await createTestVault();
    await putQuote(target.service, 'quote:9', 'from before the restore', 1_700_000_000_000);
    await damageQuote(target.service, 'quote:9');

    const plan = await target.service.prepareImport(backup, BACKUP_PASSWORD);
    const result = await target.service.applyImport(plan, 'merge');

    expect(result.unreadableRemoved).toBe(0);

    // the damaged record is still there, it was not thrown away
    expect(await getRecord('quote', 'quote:9')).not.toBeNull();
  });
});

describe('a crafted backup', () => {
  it('does not take the place of the settings', async () => {
    const vault = await createTestVault();
    const store = vault.service.store();

    const before = await store.get<{ autoLockMinutes: number }>(
      'settings',
      'settings',
    );
    expect(before).not.toBeNull();

    const crafted = await buildPortableBackup(
      [
        {
          id: 'settings',
          kind: 'quote',
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_000_000,
          value: {
            id: 1,
            text: 'a quote that carries the id of the settings',
            reminder: null,
            active: false,
          },
        },
      ],
      BACKUP_PASSWORD,
      { iterations: 1_000 },
    );

    const plan = await vault.service.prepareImport(crafted, BACKUP_PASSWORD);
    await vault.service.applyImport(plan, 'merge');

    const after = await store.get<{ autoLockMinutes: number }>(
      'settings',
      'settings',
    );

    expect(after).not.toBeNull();
    expect(after?.autoLockMinutes).toBe(before?.autoLockMinutes);
    expect(await store.get('quote', 'settings')).not.toBeNull();
  });

  it('does not take the place of the progress', async () => {
    const vault = await createTestVault();
    const store = vault.service.store();

    await store.put('progress', 'progress', { xp: 120 });

    const crafted = await buildPortableBackup(
      [
        {
          id: 'progress',
          kind: 'quote',
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_000_000,
          value: {
            id: 1,
            text: 'a quote that carries the id of the progress',
            reminder: null,
            active: false,
          },
        },
      ],
      BACKUP_PASSWORD,
      { iterations: 1_000 },
    );

    const plan = await vault.service.prepareImport(crafted, BACKUP_PASSWORD);
    await vault.service.applyImport(plan, 'merge');

    expect((await store.get<{ xp: number }>('progress', 'progress'))?.xp).toBe(120);
  });
});
