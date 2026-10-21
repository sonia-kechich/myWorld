import { base64ToBytes, bytesToUtf8, utf8ToBytes } from './base64';
import { createEnvelope, parseEnvelope, type EncryptedEnvelope } from './envelope';
import { randomBytes } from './keys';

export const IV_BYTES = 12;
export const TAG_BITS = 128;

export class DecryptionError extends Error {
  constructor(message = 'Decryption failed: the data was altered or the key is wrong') {
    super(message);
    this.name = 'DecryptionError';
  }
}

export function randomIv(): Uint8Array {
  return randomBytes(IV_BYTES);
}

export async function encryptBytes(
  key: CryptoKey,
  plaintext: Uint8Array,
  aad: string,
): Promise<{ iv: Uint8Array; ciphertext: Uint8Array }> {
  const iv = randomIv();
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as BufferSource,
      additionalData: utf8ToBytes(aad) as BufferSource,
      tagLength: TAG_BITS,
    },
    key,
    plaintext as BufferSource,
  );

  return { iv, ciphertext: new Uint8Array(ciphertext) };
}

export async function decryptBytes(
  key: CryptoKey,
  iv: Uint8Array,
  ciphertext: Uint8Array,
  aad: string,
): Promise<Uint8Array> {
  try {
    const plaintext = await globalThis.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv as BufferSource,
        additionalData: utf8ToBytes(aad) as BufferSource,
        tagLength: TAG_BITS,
      },
      key,
      ciphertext as BufferSource,
    );

    return new Uint8Array(plaintext);
  } catch {
    throw new DecryptionError();
  }
}

export async function encryptJson<T>(
  key: CryptoKey,
  value: T,
  aad: string,
): Promise<EncryptedEnvelope> {
  const plaintext = utf8ToBytes(JSON.stringify(value));
  const { iv, ciphertext } = await encryptBytes(key, plaintext, aad);
  return createEnvelope(iv, ciphertext);
}

export async function decryptJson<T>(
  key: CryptoKey,
  envelope: EncryptedEnvelope,
  aad: string,
): Promise<T> {
  const parsed = parseEnvelope(envelope);
  const plaintext = await decryptBytes(
    key,
    base64ToBytes(parsed.iv),
    base64ToBytes(parsed.ct),
    aad,
  );

  try {
    return JSON.parse(bytesToUtf8(plaintext)) as T;
  } catch {
    throw new DecryptionError('Decryption failed: the record is not valid JSON');
  }
}
