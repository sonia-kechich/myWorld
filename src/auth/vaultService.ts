import { DecryptionError, decryptJson, encryptJson } from '../crypto/aesgcm';
import { base64ToBytes } from '../crypto/base64';
import {
  constantTimeEqual,
  createSalt,
  DEFAULT_KDF_ITERATIONS,
  deriveVaultKey,
  hasSubtleCrypto,
  serializeKdf,
} from '../crypto/keys';
import { getMeta, setMeta, listRecords, deleteRecord, putRecord } from '../storage/records';
import { deleteDatabase } from '../storage/db';
import { VaultStore } from '../storage/vaultStore';
import { buildVaultFile, type VaultFile } from '../backup/vaultFile';
import {
  checkAuthenticatorCode,
  createAuthenticatorProfile,
  normalizeSecret,
  type AuthenticatorProfile,
  type CodeFailure,
} from './authenticator';
import {
  DEFAULT_AUTO_LOCK_MINUTES,
  MIN_PASSWORD_LENGTH,
  VAULT_ISSUER,
  VAULT_LABEL,
} from './constants';
import {
  clearLockout,
  INITIAL_LOCKOUT,
  isLocked,
  registerFailure,
  remainingLockMs,
  type LockoutState,
} from './lockout';
import {
  AUTHENTICATOR_AAD,
  LOCKOUT_META,
  parseVaultConfig,
  VAULT_CONFIG_META,
  VAULT_CONFIG_VERSION,
  VERIFIER_AAD,
  VERIFIER_MARKER,
  type VaultConfig,
  type VerifierPayload,
} from './vaultConfig';

export type VaultStatus = 'unconfigured' | 'locked' | 'unlocked';

export type VaultErrorCode =
  | 'weak-password'
  | 'incorrect-password'
  | 'incorrect-recovery-key'
  | 'bad-code-format'
  | 'invalid-code'
  | 'expired-code'
  | 'replayed-code'
  | 'locked-out'
  | 'not-configured'
  | 'corrupt-vault'
  | 'no-key'
  | 'unsupported-environment';

export class VaultError extends Error {
  readonly code: VaultErrorCode;
  readonly retryAfterMs: number | null;

  constructor(code: VaultErrorCode, message: string, retryAfterMs: number | null = null) {
    super(message);
    this.name = 'VaultError';
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

export interface SetupSession {
  key: CryptoKey;
  salt: Uint8Array;
  iterations: number;
  profile: AuthenticatorProfile;
}

export interface VaultServiceOptions {
  kdfIterations?: number;
  now?: () => number;
}

const CODE_FAILURE_MESSAGES: Record<CodeFailure, string> = {
  format: 'Enter the 6-digit code from your authenticator.',
  invalid: 'That code is not valid. Check the code and try again.',
  expired: 'That code has expired. Open your authenticator for the current code.',
  replayed: 'That code was already used. Wait for the next one.',
};

function codeError(reason: CodeFailure): VaultError {
  const code: VaultErrorCode =
    reason === 'format'
      ? 'bad-code-format'
      : reason === 'expired'
        ? 'expired-code'
        : reason === 'replayed'
          ? 'replayed-code'
          : 'invalid-code';

  return new VaultError(code, CODE_FAILURE_MESSAGES[reason]);
}

/**
 * Owns the vault lifecycle: first run setup, unlocking, locking and the
 * destructive reset. The derived key only ever lives in memory; nothing
 * readable is written to disk.
 */
export class VaultService {
  private key: CryptoKey | null = null;
  private readonly kdfIterations: number;
  private readonly now: () => number;

  constructor(options: VaultServiceOptions = {}) {
    this.kdfIterations = options.kdfIterations ?? DEFAULT_KDF_ITERATIONS;
    this.now = options.now ?? (() => Date.now());
  }

  get isUnlocked(): boolean {
    return this.key !== null;
  }

  async getStatus(): Promise<VaultStatus> {
    if (this.key) return 'unlocked';
    const config = await getMeta(VAULT_CONFIG_META);
    return config ? 'locked' : 'unconfigured';
  }

  async isConfigured(): Promise<boolean> {
    return (await getMeta(VAULT_CONFIG_META)) !== null;
  }

  async beginSetup(password: string): Promise<SetupSession> {
    if (!hasSubtleCrypto()) {
      throw new VaultError(
        'unsupported-environment',
        'This browser cannot do the encryption myWorld needs. Open myWorld over https:// or from localhost.',
      );
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new VaultError(
        'weak-password',
        `Use at least ${MIN_PASSWORD_LENGTH} characters, and make it something only you know.`,
      );
    }

    const salt = createSalt();
    const key = await deriveVaultKey(password, salt, this.kdfIterations);
    const profile = createAuthenticatorProfile(VAULT_LABEL, VAULT_ISSUER);

    return { key, salt, iterations: this.kdfIterations, profile };
  }

  async completeSetup(session: SetupSession, code: string): Promise<void> {
    const result = await checkAuthenticatorCode({
      secret: session.profile.secret,
      token: code,
      now: this.now(),
    });

    if (!result.valid) throw codeError(result.reason);

    // The setup code is not burned here: the vault is created unlocked, and the
    // owner may lock it again inside the same 30 second window. The code is
    // still only good for one unlock, because the first unlock records it.
    const verifier = await encryptJson<VerifierPayload>(
      session.key,
      { marker: VERIFIER_MARKER, lastUsedTimeStep: null },
      VERIFIER_AAD,
    );

    const config: VaultConfig = {
      name: VAULT_CONFIG_META,
      version: VAULT_CONFIG_VERSION,
      createdAt: this.now(),
      kdf: serializeKdf(
        { name: 'PBKDF2', hash: 'SHA-256', iterations: session.iterations },
        session.salt,
      ),
      authenticator: {
        label: session.profile.label,
        issuer: session.profile.issuer,
        secret: await encryptJson<string>(
          session.key,
          session.profile.secret,
          AUTHENTICATOR_AAD,
        ),
      },
      verifier,
    };

    await setMeta(VAULT_CONFIG_META, config);
    await setMeta(LOCKOUT_META, clearLockout());
    this.key = session.key;

    await this.store().put('settings', 'settings', {
      schemaVersion: 1,
      autoLockMinutes: DEFAULT_AUTO_LOCK_MINUTES,
    });
  }

  async unlock(password: string, code: string): Promise<void> {
    const { config, key } = await this.derive(password);
    const payload = await this.readVerifier(key, config);
    const secret = await this.readSecret(key, config);

    const result = await checkAuthenticatorCode({
      secret,
      token: code,
      lastUsedTimeStep: payload.lastUsedTimeStep,
      now: this.now(),
    });

    if (!result.valid) {
      await this.registerFailure();
      throw codeError(result.reason);
    }

    await this.finishUnlock(key, config, result.timeStep);
  }

  /**
   * Documented recovery path: the setup key shown during setup is the
   * authenticator secret itself, so it can re-enrol the device. The password
   * is still required, this is not a bypass of the second factor.
   */
  async unlockWithRecoveryKey(password: string, recoveryKey: string): Promise<void> {
    const { config, key } = await this.derive(password);
    await this.readVerifier(key, config);
    const secret = await this.readSecret(key, config);

    if (!constantTimeEqual(normalizeSecret(recoveryKey), normalizeSecret(secret))) {
      await this.registerFailure();
      throw new VaultError(
        'incorrect-recovery-key',
        'That setup key does not match this vault.',
      );
    }

    await this.finishUnlock(key, config, null);
  }

  lock(): void {
    this.key = null;
  }

  async resetVault(): Promise<void> {
    this.key = null;
    await deleteDatabase();
  }

  store(): VaultStore {
    if (!this.key) {
      throw new VaultError('no-key', 'The vault is locked.');
    }
    return new VaultStore(this.key);
  }

  async readLockoutState(): Promise<LockoutState> {
    return (await getMeta<LockoutState>(LOCKOUT_META)) ?? INITIAL_LOCKOUT;
  }

  async readLockoutRemaining(): Promise<number> {
    const state = await this.readLockoutState();
    return remainingLockMs(state, this.now());
  }

  async readConfig(): Promise<VaultConfig | null> {
    const raw = await getMeta(VAULT_CONFIG_META);
    if (!raw) return null;
    return parseVaultConfig(raw);
  }

  /**
   * Builds a portable backup. The file only ever contains ciphertext plus the
   * key derivation parameters, so it stays unreadable without the password.
   */
  async exportBackup(): Promise<VaultFile> {
    const config = await this.readConfig();
    if (!config) {
      throw new VaultError(
        'not-configured',
        'There is no vault on this device yet. Create one to continue.',
      );
    }

    const records = await listRecords();
    return buildVaultFile(
      config.kdf,
      config.verifier,
      {
        label: config.authenticator.label,
        issuer: config.authenticator.issuer,
        secret: config.authenticator.secret,
      },
      records,
      this.now(),
    );
  }

  /**
   * Restores a backup. The backup replaces the vault on this device: the
   * password is checked against the file, every record is decrypted to prove
   * the file is intact, and only then is anything written.
   */
  async importBackup(file: VaultFile, password: string): Promise<number> {
    const salt = base64ToBytes(file.kdf.salt);
    const key = await deriveVaultKey(password, salt, file.kdf.iterations);

    try {
      const payload = await decryptJson<VerifierPayload>(key, file.verifier, VERIFIER_AAD);
      if (payload?.marker !== VERIFIER_MARKER) throw new Error('bad marker');
    } catch {
      throw new VaultError(
        'incorrect-password',
        'That password is not right for this backup.',
      );
    }

    for (const record of file.records) {
      try {
        await decryptJson(key, record.envelope, VaultStore.aad(record.kind, record.id));
      } catch {
        throw new VaultError(
          'corrupt-vault',
          'That backup is damaged and cannot be restored.',
        );
      }
    }

    for (const record of await listRecords()) {
      await deleteRecord(record.id);
    }

    for (const record of file.records) {
      await putRecord(record);
    }

    const config: VaultConfig = {
      name: VAULT_CONFIG_META,
      version: VAULT_CONFIG_VERSION,
      createdAt: file.exportedAt,
      kdf: file.kdf,
      authenticator: {
        label: file.authenticator.label,
        issuer: file.authenticator.issuer,
        secret: file.authenticator.secret,
      },
      verifier: file.verifier,
    };

    await setMeta(VAULT_CONFIG_META, config);
    await setMeta(LOCKOUT_META, clearLockout());
    this.key = key;

    return file.records.length;
  }

  private async derive(
    password: string,
  ): Promise<{ config: VaultConfig; key: CryptoKey }> {
    const raw = await getMeta(VAULT_CONFIG_META);
    if (!raw) {
      throw new VaultError(
        'not-configured',
        'There is no vault on this device yet. Create one to continue.',
      );
    }

    const config = parseVaultConfig(raw);
    const lockout = await this.readLockoutState();
    const now = this.now();

    if (isLocked(lockout, now)) {
      const remaining = remainingLockMs(lockout, now);
      throw new VaultError(
        'locked-out',
        `Too many attempts. Try again in ${Math.ceil(remaining / 1000)} seconds.`,
        remaining,
      );
    }

    const salt = base64ToBytes(config.kdf.salt);
    const key = await deriveVaultKey(password, salt, config.kdf.iterations);

    return { config, key };
  }

  private async readVerifier(
    key: CryptoKey,
    config: VaultConfig,
  ): Promise<VerifierPayload> {
    let payload: VerifierPayload;

    try {
      payload = await decryptJson<VerifierPayload>(key, config.verifier, VERIFIER_AAD);
    } catch (error) {
      if (error instanceof DecryptionError) {
        await this.registerFailure();
        throw new VaultError('incorrect-password', 'That password is not right.');
      }
      throw error;
    }

    if (payload?.marker !== VERIFIER_MARKER) {
      await this.registerFailure();
      throw new VaultError('incorrect-password', 'That password is not right.');
    }

    return payload;
  }

  private async readSecret(key: CryptoKey, config: VaultConfig): Promise<string> {
    try {
      const secret = await decryptJson<string>(
        key,
        config.authenticator.secret,
        AUTHENTICATOR_AAD,
      );
      if (typeof secret !== 'string' || secret.length === 0) {
        throw new Error('empty secret');
      }
      return secret;
    } catch {
      throw new VaultError(
        'corrupt-vault',
        'The authenticator data on this device is damaged and cannot be read.',
      );
    }
  }

  private async registerFailure(): Promise<void> {
    const state = await this.readLockoutState();
    await setMeta(LOCKOUT_META, registerFailure(state, this.now()));
  }

  private async finishUnlock(
    key: CryptoKey,
    config: VaultConfig,
    timeStep: number | null,
  ): Promise<void> {
    if (timeStep !== null) {
      config.verifier = await encryptJson<VerifierPayload>(
        key,
        { marker: VERIFIER_MARKER, lastUsedTimeStep: timeStep },
        VERIFIER_AAD,
      );
      await setMeta(VAULT_CONFIG_META, config);
    }

    await setMeta(LOCKOUT_META, clearLockout());
    this.key = key;
  }
}

export const vaultService = new VaultService();
