import type { EncryptedEnvelope } from '../crypto/envelope';
import { isEnvelope } from '../crypto/envelope';

export const VAULT_CONFIG_META = 'vault';
export const VAULT_CONFIG_VERSION = 1;
export const LOCKOUT_META = 'lockout';

export const VERIFIER_MARKER = 'myworld.vault.verifier.v1';
export const VERIFIER_AAD = 'myworld|verifier|v1';
export const AUTHENTICATOR_AAD = 'myworld|authenticator|v1';

export interface VaultKdf {
  name: 'PBKDF2';
  hash: 'SHA-256';
  iterations: number;
  salt: string;
}

export interface VaultConfig {
  name: typeof VAULT_CONFIG_META;
  version: number;
  createdAt: number;
  kdf: VaultKdf;
  authenticator: {
    label: string;
    issuer: string;
    /** The TOTP secret, sealed under the vault key. */
    secret: EncryptedEnvelope;
  };
  /**
   * Known plaintext sealed under the vault key. It proves the password is
   * correct and carries the replay counter of the authenticator, so both
   * are protected against tampering.
   */
  verifier: EncryptedEnvelope;
}

export interface VerifierPayload {
  marker: string;
  lastUsedTimeStep: number | null;
}

export class VaultConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VaultConfigError';
  }
}

export function parseVaultConfig(value: unknown): VaultConfig {
  if (typeof value !== 'object' || value === null) {
    throw new VaultConfigError('Vault configuration is missing');
  }

  const candidate = value as Partial<VaultConfig>;

  if (candidate.name !== VAULT_CONFIG_META || candidate.version !== VAULT_CONFIG_VERSION) {
    throw new VaultConfigError('Vault configuration has an unsupported version');
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
    throw new VaultConfigError('Vault configuration has invalid key derivation parameters');
  }

  const authenticator = candidate.authenticator;
  if (!authenticator || !isEnvelope(authenticator.secret)) {
    throw new VaultConfigError('Vault configuration has no authenticator secret');
  }

  if (!isEnvelope(candidate.verifier)) {
    throw new VaultConfigError('Vault configuration has no password verifier');
  }

  return {
    name: VAULT_CONFIG_META,
    version: candidate.version,
    createdAt: typeof candidate.createdAt === 'number' ? candidate.createdAt : 0,
    kdf: {
      name: kdf.name,
      hash: kdf.hash,
      iterations: kdf.iterations,
      salt: kdf.salt,
    },
    authenticator: {
      label: authenticator.label,
      issuer: authenticator.issuer,
      secret: authenticator.secret,
    },
    verifier: candidate.verifier,
  };
}
