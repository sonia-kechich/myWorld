import {
  getMeta,
  getRecord,
  listRawEntries,
  putRawEntry,
  setMeta,
  type RecordKind,
} from './records';
import { VaultStore } from './vaultStore';

export const MIGRATION_VERSION = 1;
export const MIGRATION_META = 'migration';

export interface LegacyRecord {
  id: string;
  kind: RecordKind;
  value: unknown;
}

export interface MigrationReport {
  fromVersion: number;
  toVersion: number;
  migratedRecords: number;
  migratedStorageKeys: number;
  skipped: number;
}

interface MigrationStamp {
  version: number;
  migratedAt: number;
}

const LEGACY_STORAGE_KEYS: readonly string[] = [
  'myworld.quotes',
  'myworld.reflections',
  'myworld.xp',
];

function isLegacyRecord(value: unknown): value is LegacyRecord {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<LegacyRecord>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.kind === 'string' &&
    'value' in candidate &&
    !('envelope' in candidate)
  );
}

function readLegacyStorage(): Array<{ key: string; value: unknown }> {
  if (typeof localStorage === 'undefined') return [];

  const found: Array<{ key: string; value: unknown }> = [];

  for (const key of LEGACY_STORAGE_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw === null) continue;

    try {
      found.push({ key, value: JSON.parse(raw) });
    } catch {
      found.push({ key, value: null });
    }
  }

  return found;
}

/**
 * Brings a database that was written before the vault existed up to date:
 * legacy plaintext records are sealed with the vault key, legacy localStorage
 * state is converted into sealed records and the plaintext source is removed.
 * The routine is idempotent and stamps the applied version in the meta store.
 */
export async function migrateVault(store: VaultStore): Promise<MigrationReport> {
  const stamp = await getMeta<MigrationStamp>(MIGRATION_META);
  const fromVersion = stamp?.version ?? 0;

  if (fromVersion >= MIGRATION_VERSION) {
    return {
      fromVersion,
      toVersion: fromVersion,
      migratedRecords: 0,
      migratedStorageKeys: 0,
      skipped: 0,
    };
  }

  let migratedRecords = 0;
  let skipped = 0;

  for (const entry of await listRawEntries()) {
    if (typeof entry === 'object' && entry !== null && 'envelope' in entry) {
      continue;
    }

    if (!isLegacyRecord(entry)) {
      skipped += 1;
      continue;
    }

    const legacy = entry;
    await store.put(legacy.kind, legacy.id, legacy.value);

    const written = await getRecord(legacy.id);
    if (!written) {
      throw new Error(`Migration failed: record ${legacy.id} was not written`);
    }

    const restored = await store.get(legacy.kind, legacy.id);
    if (JSON.stringify(restored) !== JSON.stringify(legacy.value)) {
      throw new Error(`Migration failed: record ${legacy.id} did not round-trip`);
    }

    migratedRecords += 1;
  }

  let migratedStorageKeys = 0;

  for (const { key, value } of readLegacyStorage()) {
    if (value === null) {
      localStorage.removeItem(key);
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item !== 'object' || item === null) continue;
        const record = item as { id?: unknown };
        const id =
          typeof record.id === 'number'
            ? `quote:${record.id}`
            : `entry:${String(record.id)}`;
        const kind: RecordKind = key === 'myworld.reflections' ? 'entry' : 'quote';
        await store.put(kind, id, item);
        migratedStorageKeys += 1;
      }
    } else if (key === 'myworld.xp' && typeof value === 'number') {
      await store.put('progress', 'progress', { xp: value });
      migratedStorageKeys += 1;
    }

    localStorage.removeItem(key);
  }

  await setMeta(MIGRATION_META, {
    version: MIGRATION_VERSION,
    migratedAt: Date.now(),
  } satisfies MigrationStamp);

  return {
    fromVersion,
    toVersion: MIGRATION_VERSION,
    migratedRecords,
    migratedStorageKeys,
    skipped,
  };
}

/** Test helper: writes a legacy plaintext record straight into the store. */
export async function writeLegacyRecord(
  id: string,
  kind: RecordKind,
  value: unknown,
): Promise<void> {
  await putRawEntry({ id, kind, value });
}
