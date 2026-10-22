import {
  deleteRawEntry,
  getMeta,
  getRecord,
  isRecordKind,
  listRawEntries,
  putRawEntry,
  setMeta,
  type RecordKind,
} from './records';
import { VaultStore } from './vaultStore';
import { LEGACY_COPY_ID } from '../auth/vaultConfig';

export const MIGRATION_VERSION = 1;
export const MIGRATION_META = 'migration';

export interface LegacyRecord {
  id: string;
  /**
   * The kind as the old version wrote it. It can be a kind this version does
   * not know, such a record is kept instead of being thrown away.
   */
  kind: string;
  value: unknown;
}

export interface MigrationReport {
  fromVersion: number;
  toVersion: number;
  migratedRecords: number;
  migratedStorageKeys: number;
  skipped: number;
  /** Whether an encrypted copy of the old data was kept inside the vault. */
  keptLegacyCopy: boolean;
  /** Kinds of the old records that this version does not know. */
  unknownKinds: string[];
}

export interface LegacyCopy {
  capturedAt: number;
  records: Array<{ id: string; kind: string; value: unknown }>;
  storage: Record<string, unknown>;
  /** The old local storage values that could not be read as JSON. */
  storageRaw: Record<string, string>;
  /** Rows that were in the store but are not records this version knows. */
  garbage: Array<{ id: string; kind: string; value: unknown }>;
}

interface MigrationStamp {
  version: number;
  migratedAt: number;
}

interface LegacyStorageEntry {
  key: string;
  /** The parsed value, when the text was valid JSON. */
  value: unknown;
  /** The text as the old version wrote it. */
  raw: string;
  readable: boolean;
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
    candidate.id.length > 0 &&
    typeof candidate.kind === 'string' &&
    candidate.kind.length > 0 &&
    'value' in candidate &&
    !('envelope' in candidate)
  );
}

function readLegacyStorage(): LegacyStorageEntry[] {
  if (typeof localStorage === 'undefined') return [];

  const found: LegacyStorageEntry[] = [];

  for (const key of LEGACY_STORAGE_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw === null) continue;

    try {
      found.push({ key, value: JSON.parse(raw), raw, readable: true });
    } catch {
      found.push({ key, value: null, raw, readable: false });
    }
  }

  return found;
}

/**
 * Brings a database that was written before the vault existed up to date:
 * legacy plaintext records are sealed with the vault key, legacy localStorage
 * state is converted into sealed records and the plaintext source is removed.
 *
 * The order of the steps is what keeps the data safe. The encrypted copy of
 * the old data is written and read back before anything is changed, the
 * plaintext source is only removed once that copy is there and everything has
 * been sealed. A step that fails leaves the old data where it was, so the
 * migration can simply be run again.
 *
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
      keptLegacyCopy: await hasLegacyCopy(store),
      unknownKinds: [],
    };
  }

  let migratedRecords = 0;
  let migratedStorageKeys = 0;
  let skipped = 0;

  // 1. Everything the old version held is collected while it is still there.
  const legacyRecords: LegacyCopy['records'] = [];
  const garbage: LegacyCopy['garbage'] = [];
  const garbageKeys: Array<{ kind: string; id: string }> = [];
  const unknownKinds = new Set<string>();

  for (const entry of await listRawEntries()) {
    if (typeof entry === 'object' && entry !== null && 'envelope' in entry) {
      continue;
    }

    if (!isLegacyRecord(entry)) {
      skipped += 1;

      // The row is not something this version understands. It is kept in the
      // copy and removed afterwards, so no plaintext is left behind.
      if (typeof entry === 'object' && entry !== null) {
        const candidate = entry as { id?: unknown; kind?: unknown; value?: unknown };
        const id = typeof candidate.id === 'string' ? candidate.id : '';
        const kind = typeof candidate.kind === 'string' ? candidate.kind : '';

        garbage.push({ id, kind, value: 'value' in candidate ? candidate.value : null });
        garbageKeys.push({ kind, id });
      }

      continue;
    }

    legacyRecords.push({ id: entry.id, kind: entry.kind, value: entry.value });

    if (!isRecordKind(entry.kind)) {
      unknownKinds.add(entry.kind);
    }
  }

  const storage = readLegacyStorage();
  const legacyStorage: Record<string, unknown> = {};
  const legacyStorageRaw: Record<string, string> = {};

  for (const entry of storage) {
    if (entry.readable) {
      legacyStorage[entry.key] = entry.value;
    } else {
      // The text is kept as it was, so nothing of the old version is lost.
      legacyStorageRaw[entry.key] = entry.raw;
      skipped += 1;
    }
  }

  // 2. The encrypted copy of the old data is written and read back before
  // anything is changed. Without it the old data would be gone for good if one
  // of the steps below failed. A copy that is already there is kept, it was
  // written before the old data was touched.
  const hasOldData =
    legacyRecords.length > 0 ||
    garbage.length > 0 ||
    Object.keys(legacyStorage).length > 0 ||
    Object.keys(legacyStorageRaw).length > 0;

  const existingCopy = await store.get<LegacyCopy>('legacy', LEGACY_COPY_ID);
  let keptLegacyCopy = existingCopy !== null;
  let copyCapturedAt: number | null = null;

  if (hasOldData && !keptLegacyCopy) {
    const copy: LegacyCopy = {
      capturedAt: Date.now(),
      records: legacyRecords,
      storage: legacyStorage,
      storageRaw: legacyStorageRaw,
      garbage,
    };

    await store.put('legacy', LEGACY_COPY_ID, copy);

    const written = await store.get<LegacyCopy>('legacy', LEGACY_COPY_ID);
    if (!written || written.capturedAt !== copy.capturedAt) {
      throw new Error('Migration failed: the copy of the old data was not written');
    }

    keptLegacyCopy = true;
    copyCapturedAt = copy.capturedAt;
  }

  // 3. The plaintext records are sealed with the vault key and read back one
  // by one. A kind this version does not know is sealed under its own name,
  // so the record survives and no plaintext is left behind.
  for (const record of legacyRecords) {
    const kind = record.kind as RecordKind;

    await store.put(kind, record.id, record.value);

    const written = await getRecord(kind, record.id);
    if (!written) {
      throw new Error(`Migration failed: record ${record.id} was not written`);
    }

    const restored = await store.get(kind, record.id);
    if (JSON.stringify(restored) !== JSON.stringify(record.value)) {
      throw new Error(`Migration failed: record ${record.id} did not round-trip`);
    }

    migratedRecords += 1;
  }

  // 4. The copy must still be there, nothing may have overwritten it.
  if (copyCapturedAt !== null) {
    const copy = await store.get<LegacyCopy>('legacy', LEGACY_COPY_ID);
    if (!copy || copy.capturedAt !== copyCapturedAt) {
      throw new Error('Migration failed: the copy of the old data was overwritten');
    }

    // Rows that could not be understood are now in the copy, so they can go.
    for (const row of garbageKeys) {
      await deleteRawEntry(row.kind, row.id);
    }
  }

  // 5. The old local storage becomes sealed records.
  for (const { key, value, readable } of storage) {
    if (!readable) continue;

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
  }

  // 6. Only now the plaintext source is removed. Everything of it is inside
  // the vault, in the sealed records and in the copy.
  for (const { key } of storage) {
    localStorage.removeItem(key);
  }

  // 7. The applied version is stamped, so the migration never runs twice.
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
    keptLegacyCopy,
    unknownKinds: Array.from(unknownKinds),
  };
}

async function hasLegacyCopy(store: VaultStore): Promise<boolean> {
  const copy = await store.get<LegacyCopy>('legacy', LEGACY_COPY_ID);
  return copy !== null;
}

/** Test helper: writes a legacy plaintext record straight into the store. */
export async function writeLegacyRecord(
  id: string,
  kind: string,
  value: unknown,
): Promise<void> {
  await putRawEntry({ id, kind, value });
}
