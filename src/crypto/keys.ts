import { bytesToBase64 } from './base64';

export const KDF_NAME = 'PBKDF2';
export const KDF_HASH = 'SHA-256';
export const DEFAULT_KDF_ITERATIONS = 600_000;
export const SALT_BYTES = 16;
export const KEY_BITS = 256;

export interface KdfParams {
  name: typeof KDF_NAME;
  hash: typeof KDF_HASH;
  iterations: number;
}

export function getCrypto(): Crypto {
  const candidate = globalThis.crypto;

  if (!candidate || !candidate.getRandomValues) {
    throw new Error('Web Crypto is unavailable in this environment');
  }

  return candidate;
}

export function hasSubtleCrypto(): boolean {
  return Boolean(globalThis.crypto?.subtle);
}

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  getCrypto().getRandomValues(bytes);
  return bytes;
}

export function createSalt(): Uint8Array {
  return randomBytes(SALT_BYTES);
}

export function serializeKdf(params: KdfParams, salt: Uint8Array): {
  name: typeof KDF_NAME;
  hash: typeof KDF_HASH;
  iterations: number;
  salt: string;
} {
  return {
    name: params.name,
    hash: params.hash,
    iterations: params.iterations,
    salt: bytesToBase64(salt),
  };
}

export async function deriveVaultKey(
  password: string,
  salt: Uint8Array,
  iterations: number = DEFAULT_KDF_ITERATIONS,
): Promise<CryptoKey> {
  if (!hasSubtleCrypto()) {
    throw new Error(
      'Web Crypto (crypto.subtle) is unavailable. Open myWorld over https:// or from localhost.',
    );
  }

  const material = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return globalThis.crypto.subtle.deriveKey(
    {
      name: KDF_NAME,
      hash: KDF_HASH,
      salt: salt as BufferSource,
      iterations,
    },
    material,
    { name: 'AES-GCM', length: KEY_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Length-independent, constant-time-ish string comparison used to compare the
 * authenticator secret with a user supplied recovery key. Length is compared
 * first because the secret length is not a secret.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return mismatch === 0;
}
