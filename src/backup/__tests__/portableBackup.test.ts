import { describe, expect, it } from 'vitest';
import {
  buildPortableBackup,
  decryptPortableBackup,
  parsePortableBackup,
  PORTABLE_FORMAT,
  PortableBackupError,
  portableBackupFileName,
  serializePortableBackup,
  type PortablePlainRecord,
} from '../portableBackup';
import { buildImportPlan } from '../importPlan';

const BACKUP_PASSWORD = 'the backup password of the user';

function records(): PortablePlainRecord[] {
  return [
    {
      id: 'quote:1',
      kind: 'quote',
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
      value: {
        id: 1,
        text: 'the sky is quiet tonight',
        reminder: null,
        active: false,
        createdAt: 1_700_000_000_000,
      },
    },
    {
      id: 'progress',
      kind: 'progress',
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_100_000,
      value: { xp: 120 },
    },
  ];
}

async function build(overrides: Partial<Parameters<typeof buildPortableBackup>[2]> = {}) {
  return buildPortableBackup(records(), BACKUP_PASSWORD, {
    iterations: 1_000,
    now: () => 1_700_000_500_000,
    ...overrides,
  });
}

describe('portable backup', () => {
  it('keeps the records through a full round trip', async () => {
    const backup = await build();
    const parsed = parsePortableBackup(serializePortableBackup(backup));
    const opened = await decryptPortableBackup(parsed, BACKUP_PASSWORD);

    expect(opened.manifest.recordCount).toBe(2);
    expect(opened.manifest.kinds).toEqual(['progress', 'quote']);
    expect(opened.records).toEqual(records());
  });

  it('never writes the content in the clear', async () => {
    const backup = await build();
    const text = serializePortableBackup(backup);

    expect(text).not.toContain('the sky is quiet tonight');
    expect(text).not.toContain('120');
    expect(text).toContain(PORTABLE_FORMAT);
  });

  it('refuses a file that is not a backup', () => {
    expect(() => parsePortableBackup('hello there')).toThrowError(PortableBackupError);
    expect(() => parsePortableBackup('hello there')).toThrowError(/not a myWorld backup/i);

    expect(() => parsePortableBackup('{"format":"something-else"}')).toThrowError(
      /not a myWorld backup/i,
    );
  });

  it('refuses a backup of another version', async () => {
    const backup = await build();
    const changed = { ...backup, formatVersion: 2 };

    expect(() => parsePortableBackup(JSON.stringify(changed))).toThrowError(
      /different version/i,
    );
  });

  it('refuses a file that is too large', () => {
    const big = 'x'.repeat(10 * 1024 * 1024 + 1);

    expect(() => parsePortableBackup(big)).toThrowError(/too large/i);
  });

  it('refuses a record that cannot be read', async () => {
    const backup = await build();
    const broken = {
      ...backup,
      records: [{ ...backup.records[0], id: 'not a valid id!' }],
    };

    expect(() => parsePortableBackup(JSON.stringify(broken))).toThrowError(
      /cannot be read/i,
    );
  });

  it('refuses the same record twice', async () => {
    const backup = await build();
    const doubled = { ...backup, records: [backup.records[0], backup.records[0]] };

    expect(() => parsePortableBackup(JSON.stringify(doubled))).toThrowError(
      /more than once/i,
    );
  });

  it('refuses key derivation settings that make no sense', async () => {
    const backup = await build();
    const broken = { ...backup, kdf: { ...backup.kdf, iterations: 1 } };

    expect(() => parsePortableBackup(JSON.stringify(broken))).toThrowError(
      /key derivation/i,
    );
  });

  it('says the password is wrong when the manifest cannot be opened', async () => {
    const backup = await build();

    await expect(
      decryptPortableBackup(backup, 'a different password entirely'),
    ).rejects.toThrowError(/password/i);
  });

  it('says the file is damaged when a record was changed', async () => {
    const backup = await build();
    const record = backup.records[0]!;
    const ct = record.ct.slice(0, -4) + (record.ct.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    const damaged = {
      ...backup,
      records: [{ ...record, ct }, backup.records[1]!],
    };

    await expect(decryptPortableBackup(damaged, BACKUP_PASSWORD)).rejects.toThrowError(
      /damaged/i,
    );
  });

  it('does not let a record be moved to another name', async () => {
    const backup = await build();
    const record = backup.records[0]!;
    const moved = {
      ...backup,
      records: [{ ...record, id: 'quote:2' }, backup.records[1]!],
    };

    await expect(decryptPortableBackup(moved, BACKUP_PASSWORD)).rejects.toThrowError(
      /damaged/i,
    );
  });

  it('gives the file a readable name', () => {
    const name = portableBackupFileName(Date.UTC(2026, 0, 2, 3, 4, 5));

    expect(name).toBe('myworld-backup-2026-01-02-03-04-05.myworld');
  });
});

describe('import plan', () => {
  it('refuses the whole backup when one record is broken', async () => {
    const broken = records();
    const progress = broken[1]!;
    broken[1] = { ...progress, value: { xp: 'a lot' } };

    expect(() =>
      buildImportPlan(broken, {
        createdAt: 1_700_000_500_000,
        existingIds: [],
        existingCount: 0,
      }),
    ).toThrowError(PortableBackupError);
  });

  it('says which records are broken', async () => {
    const broken = records();
    const progress = broken[1]!;
    broken[1] = { ...progress, value: { xp: 'a lot' } };

    try {
      buildImportPlan(broken, {
        createdAt: 1_700_000_500_000,
        existingIds: [],
        existingCount: 0,
      });
      throw new Error('expected the plan to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(PortableBackupError);
      expect((error as PortableBackupError).code).toBe('invalid-record');
      expect((error as PortableBackupError).details.join(' ')).toContain('progress');
    }
  });

  it('refuses a record with a timestamp from the future', () => {
    const wrong = records();
    const quote = wrong[0]!;
    wrong[0] = { ...quote, updatedAt: Date.now() + 10 * 24 * 60 * 60 * 1000 };

    expect(() =>
      buildImportPlan(wrong, {
        createdAt: 1_700_000_500_000,
        existingIds: [],
        existingCount: 0,
      }),
    ).toThrowError(PortableBackupError);
  });

  it('counts what is in the backup and what is already there', () => {
    const plan = buildImportPlan(records(), {
      createdAt: 1_700_000_500_000,
      existingIds: ['quote:1'],
      existingCount: 4,
    });

    expect(plan.recordCount).toBe(2);
    expect(plan.existingCount).toBe(4);
    expect(plan.kinds).toEqual([
      { kind: 'progress', count: 1 },
      { kind: 'quote', count: 1 },
    ]);
    expect(plan.conflictingIds).toEqual(['quote:1']);
    expect(plan.records[0]!.summary).toContain('the sky is quiet tonight');
  });
});
