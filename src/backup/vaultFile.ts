import type { EncryptedEnvelope } from '../crypto/envelope';
import { isEnvelope } from '../crypto/envelope';
import type { StoredRecord } from '../storage/records';
import type { VaultKdf } from '../auth/vaultConfig';

export const VAULT_FILE_FORMAT = 'myworld-vault';
export const VAULT_FILE_VERSION = 1;
export const VAULT_FILE_EXTENSION = '.myworld';

export interface VaultFile {
  format: typeof VAULT_FILE_FORMAT;
  version: number;
  exportedAt: number;
  /** Key derivation parameters of the exported vault, needed to re-derive the key. */
  kdf: VaultKdf;
  /** Encrypted password verifier of the exported vault. */
  verifier: EncryptedEnvelope;
  /** Encrypted authenticator secret of the exported vault. */
  authenticator: {
    label: string;
    issuer: string;
    secret: EncryptedEnvelope;
  };
  /** Every record of the vault, still encrypted. */
  records: StoredRecord[];
}

export class VaultFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VaultFileError';
  }
}

export function buildVaultFile(
  kdf: VaultKdf,
  verifier: EncryptedEnvelope,
  authenticator: VaultFile['authenticator'],
  records: StoredRecord[],
  exportedAt: number = Date.now(),
): VaultFile {
  return {
    format: VAULT_FILE_FORMAT,
    version: VAULT_FILE_VERSION,
    exportedAt,
    kdf,
    verifier,
    authenticator,
    records,
  };
}

export function serializeVaultFile(file: VaultFile): string {
  return JSON.stringify(file, null, 2);
}

export function parseVaultFile(text: string): VaultFile {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new VaultFileError('That file is not a myWorld backup.');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new VaultFileError('That file is not a myWorld backup.');
  }

  const candidate = parsed as Partial<VaultFile>;

  if (candidate.format !== VAULT_FILE_FORMAT) {
    throw new VaultFileError('That file is not a myWorld backup.');
  }

  if (candidate.version !== VAULT_FILE_VERSION) {
    throw new VaultFileError('That backup was made by a different version of myWorld.');
  }

  const kdf = candidate.kdf;
  if (
    !kdf ||
    kdf.name !== 'PBKDF2' ||
    kdf.hash !== 'SHA-256' ||
    typeof kdf.iterations !== 'number' ||
    kdf.iterations <= 0 ||
    typeof kdf.salt !== 'string'
  ) {
    throw new VaultFileError('That backup has invalid key derivation parameters.');
  }

  if (!isEnvelope(candidate.verifier)) {
    throw new VaultFileError('That backup is missing its password verifier.');
  }

  const authenticator = candidate.authenticator;
  if (!authenticator || !isEnvelope(authenticator.secret)) {
    throw new VaultFileError('That backup is missing its authenticator.');
  }

  if (!Array.isArray(candidate.records)) {
    throw new VaultFileError('That backup is missing its records.');
  }

  for (const record of candidate.records) {
    if (
      typeof record !== 'object' ||
      record === null ||
      typeof record.id !== 'string' ||
      typeof record.kind !== 'string' ||
      !isEnvelope(record.envelope)
    ) {
      throw new VaultFileError('That backup contains a record that cannot be read.');
    }
  }

  return {
    format: VAULT_FILE_FORMAT,
    version: candidate.version,
    exportedAt: typeof candidate.exportedAt === 'number' ? candidate.exportedAt : 0,
    kdf: {
      name: kdf.name,
      hash: kdf.hash,
      iterations: kdf.iterations,
      salt: kdf.salt,
    },
    verifier: candidate.verifier,
    authenticator: {
      label: authenticator.label,
      issuer: authenticator.issuer,
      secret: authenticator.secret,
    },
    records: candidate.records,
  };
}

export function vaultFileName(exportedAt: number = Date.now()): string {
  const stamp = new Date(exportedAt).toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `myworld-backup-${stamp}${VAULT_FILE_EXTENSION}`;
}
