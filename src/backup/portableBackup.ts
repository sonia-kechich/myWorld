import { base64ToBytes, bytesToBase64 } from '../crypto/base64';
import { decryptBytes, encryptBytes } from '../crypto/aesgcm';
import { createSalt, DEFAULT_KDF_ITERATIONS, deriveVaultKey } from '../crypto/keys';
import type { RecordKind } from '../storage/records';

/**
 * The portable backup is the file the user takes away from the device. It
 * holds nothing but ciphertext plus the parameters needed to open it, and it
 * is protected by a password the user picks for the backup itself, not by the
 * vault password.
 */
export const PORTABLE_FORMAT = 'myworld-export';
export const PORTABLE_FORMAT_VERSION = 1;
export const PORTABLE_SCHEMA_VERSION = 1;
export const PORTABLE_FILE_EXTENSION = '.myworld';

/** Refuse anything that is not a plausible backup before it reaches memory. */
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;

/** Upper bound for a single text field inside a record. */
export const MAX_TEXT_LENGTH = 100_000;

export type PortableErrorCode =
  | 'not-a-backup'
  | 'unsupported-version'
  | 'too-large'
  | 'malformed'
  | 'wrong-password'
  | 'corrupt'
  | 'invalid-record'
  | 'duplicate-ids';

export class PortableBackupError extends Error {
  readonly code: PortableErrorCode;
  readonly details: string[];

  constructor(code: PortableErrorCode, message: string, details: string[] = []) {
    super(message);
    this.name = 'PortableBackupError';
    this.code = code;
    this.details = details;
  }
}

export interface PortableKdf {
  name: 'PBKDF2';
  hash: 'SHA-256';
  iterations: number;
  /** Unique random salt of this backup. */
  salt: string;
}

export interface PortableRecord {
  id: string;
  kind: RecordKind;
  createdAt: number;
  updatedAt: number;
  /** Unique random nonce of this record. */
  iv: string;
  /** Ciphertext, the tag is appended by AES-GCM. */
  ct: string;
}

export interface PortableManifest {
  schemaVersion: number;
  recordCount: number;
  exportedAt: number;
  kinds: RecordKind[];
}

export interface PortableBackup {
  format: typeof PORTABLE_FORMAT;
  formatVersion: number;
  schemaVersion: number;
  createdAt: number;
  app: { name: string; version: string };
  kdf: PortableKdf;
  manifest: { iv: string; ct: string };
  records: PortableRecord[];
}

export interface PortablePlainRecord {
  id: string;
  kind: RecordKind;
  createdAt: number;
  updatedAt: number;
  value: unknown;
}

export interface PortableOptions {
  iterations?: number;
  now?: () => number;
  appVersion?: string;
}

/** Binds a ciphertext to the record it belongs to. */
export function portableAad(kind: RecordKind, id: string): string {
  return `myworld-export|${kind}|${id}|v1`;
}

export const MANIFEST_AAD = 'myworld-export|manifest|v1';

export async function buildPortableBackup(
  records: PortablePlainRecord[],
  password: string,
  options: PortableOptions = {},
): Promise<PortableBackup> {
  const iterations = options.iterations ?? DEFAULT_KDF_ITERATIONS;
  const now = options.now ?? (() => Date.now());
  const salt = createSalt();
  const key = await deriveVaultKey(password, salt, iterations);

  const exportedAt = now();
  const kinds = Array.from(new Set(records.map((record) => record.kind))).sort();

  const encrypted: PortableRecord[] = [];

  for (const record of records) {
    const { iv, ciphertext } = await encryptBytes(
      key,
      new TextEncoder().encode(JSON.stringify(record)),
      portableAad(record.kind, record.id),
    );

    encrypted.push({
      id: record.id,
      kind: record.kind,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      iv: bytesToBase64(iv),
      ct: bytesToBase64(ciphertext),
    });
  }

  const manifest: PortableManifest = {
    schemaVersion: PORTABLE_SCHEMA_VERSION,
    recordCount: encrypted.length,
    exportedAt,
    kinds,
  };

  const sealedManifest = await encryptBytes(
    key,
    new TextEncoder().encode(JSON.stringify(manifest)),
    MANIFEST_AAD,
  );

  return {
    format: PORTABLE_FORMAT,
    formatVersion: PORTABLE_FORMAT_VERSION,
    schemaVersion: PORTABLE_SCHEMA_VERSION,
    createdAt: exportedAt,
    app: { name: 'myWorld', version: options.appVersion ?? '1.0.0' },
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations,
      salt: bytesToBase64(salt),
    },
    manifest: {
      iv: bytesToBase64(sealedManifest.iv),
      ct: bytesToBase64(sealedManifest.ciphertext),
    },
    records: encrypted,
  };
}

export function serializePortableBackup(backup: PortableBackup): string {
  return JSON.stringify(backup, null, 2);
}

export function portableBackupFileName(exportedAt: number = Date.now()): string {
  const stamp = new Date(exportedAt).toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `myworld-backup-${stamp}${PORTABLE_FILE_EXTENSION}`;
}

const RECORD_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,199}$/;

const KNOWN_KINDS: RecordKind[] = [
  'settings',
  'progress',
  'reflect',
  'game',
  'quote',
  'entry',
  'legacy',
  'backup',
];

function isRecordKind(value: unknown): value is RecordKind {
  return typeof value === 'string' && KNOWN_KINDS.includes(value as RecordKind);
}

/**
 * Checks the shape of a file without opening it. Everything that can be
 * checked before a password is needed is checked here, so a broken file is
 * refused before any work is done.
 */
export function parsePortableBackup(text: string): PortableBackup {
  if (text.length > MAX_BACKUP_BYTES) {
    throw new PortableBackupError(
      'too-large',
      'That backup is too large to be a myWorld backup.',
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new PortableBackupError('not-a-backup', 'That file is not a myWorld backup.');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new PortableBackupError('not-a-backup', 'That file is not a myWorld backup.');
  }

  const candidate = parsed as Partial<PortableBackup>;

  if (candidate.format !== PORTABLE_FORMAT) {
    throw new PortableBackupError('not-a-backup', 'That file is not a myWorld backup.');
  }

  if (candidate.formatVersion !== PORTABLE_FORMAT_VERSION) {
    throw new PortableBackupError(
      'unsupported-version',
      'That backup was made by a different version of myWorld and cannot be restored.',
    );
  }

  const kdf = candidate.kdf;

  if (
    !kdf ||
    kdf.name !== 'PBKDF2' ||
    kdf.hash !== 'SHA-256' ||
    typeof kdf.iterations !== 'number' ||
    !Number.isInteger(kdf.iterations) ||
    kdf.iterations < 1_000 ||
    kdf.iterations > 5_000_000 ||
    typeof kdf.salt !== 'string' ||
    kdf.salt.length === 0
  ) {
    throw new PortableBackupError(
      'malformed',
      'That backup has invalid key derivation parameters.',
    );
  }

  if (
    !candidate.manifest ||
    typeof candidate.manifest.iv !== 'string' ||
    typeof candidate.manifest.ct !== 'string'
  ) {
    throw new PortableBackupError('malformed', 'That backup is missing its manifest.');
  }

  if (!Array.isArray(candidate.records)) {
    throw new PortableBackupError('malformed', 'That backup is missing its records.');
  }

  if (candidate.records.length > 50_000) {
    throw new PortableBackupError('too-large', 'That backup holds too many records.');
  }

  const seen = new Set<string>();
  const records: PortableRecord[] = [];

  for (const entry of candidate.records) {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      typeof entry.id !== 'string' ||
      !RECORD_ID_PATTERN.test(entry.id) ||
      !isRecordKind(entry.kind) ||
      typeof entry.createdAt !== 'number' ||
      typeof entry.updatedAt !== 'number' ||
      typeof entry.iv !== 'string' ||
      typeof entry.ct !== 'string' ||
      entry.iv.length === 0 ||
      entry.ct.length === 0
    ) {
      throw new PortableBackupError(
        'malformed',
        'That backup contains a record that cannot be read.',
      );
    }

    if (seen.has(entry.id)) {
      throw new PortableBackupError(
        'duplicate-ids',
        `That backup contains the record "${entry.id}" more than once.`,
      );
    }

    seen.add(entry.id);
    records.push({
      id: entry.id,
      kind: entry.kind,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      iv: entry.iv,
      ct: entry.ct,
    });
  }

  return {
    format: PORTABLE_FORMAT,
    formatVersion: PORTABLE_FORMAT_VERSION,
    schemaVersion:
      typeof candidate.schemaVersion === 'number' ? candidate.schemaVersion : 0,
    createdAt: typeof candidate.createdAt === 'number' ? candidate.createdAt : 0,
    app: {
      name: typeof candidate.app?.name === 'string' ? candidate.app.name : 'myWorld',
      version: typeof candidate.app?.version === 'string' ? candidate.app.version : '1.0.0',
    },
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: kdf.iterations,
      salt: kdf.salt,
    },
    manifest: { iv: candidate.manifest.iv, ct: candidate.manifest.ct },
    records,
  };
}

/**
 * Opens the backup: derives the key from the password, checks the manifest
 * and decrypts every record. A failure of the manifest means the password is
 * wrong, a failure of a record means the file was damaged after it was made.
 */
export async function decryptPortableBackup(
  backup: PortableBackup,
  password: string,
): Promise<{ manifest: PortableManifest; records: PortablePlainRecord[] }> {
  const salt = base64ToBytes(backup.kdf.salt);

  let key: CryptoKey;
  try {
    key = await deriveVaultKey(password, salt, backup.kdf.iterations);
  } catch {
    throw new PortableBackupError(
      'wrong-password',
      'That backup could not be opened with this password.',
    );
  }

  let manifest: PortableManifest;

  try {
    const plaintext = await decryptBytes(
      key,
      base64ToBytes(backup.manifest.iv),
      base64ToBytes(backup.manifest.ct),
      MANIFEST_AAD,
    );
    manifest = JSON.parse(new TextDecoder().decode(plaintext)) as PortableManifest;
  } catch {
    throw new PortableBackupError(
      'wrong-password',
      'That password is not right for this backup.',
    );
  }

  if (
    !manifest ||
    manifest.schemaVersion !== PORTABLE_SCHEMA_VERSION ||
    manifest.recordCount !== backup.records.length
  ) {
    throw new PortableBackupError(
      'unsupported-version',
      'That backup was made by a different version of myWorld and cannot be restored.',
    );
  }

  const records: PortablePlainRecord[] = [];

  for (const record of backup.records) {
    let plaintext: Uint8Array;

    try {
      plaintext = await decryptBytes(
        key,
        base64ToBytes(record.iv),
        base64ToBytes(record.ct),
        portableAad(record.kind, record.id),
      );
    } catch {
      throw new PortableBackupError(
        'corrupt',
        `That backup is damaged, the record "${record.id}" could not be read.`,
      );
    }

    let parsed: PortablePlainRecord;

    try {
      parsed = JSON.parse(new TextDecoder().decode(plaintext)) as PortablePlainRecord;
    } catch {
      throw new PortableBackupError(
        'corrupt',
        `That backup is damaged, the record "${record.id}" is not readable.`,
      );
    }

    if (
      !parsed ||
      parsed.id !== record.id ||
      parsed.kind !== record.kind ||
      typeof parsed.createdAt !== 'number' ||
      typeof parsed.updatedAt !== 'number'
    ) {
      throw new PortableBackupError(
        'corrupt',
        `That backup is damaged, the record "${record.id}" does not match its envelope.`,
      );
    }

    records.push(parsed);
  }

  return { manifest, records };
}
