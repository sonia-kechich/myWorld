import { describe, expect, it } from 'vitest';
import { DecryptionError, decryptJson, encryptJson } from '../aesgcm';
import { base64ToBytes, bytesToBase64, bytesToUtf8, isBase64, utf8ToBytes } from '../base64';
import { createEnvelope, isEnvelope, parseEnvelope } from '../envelope';
import { constantTimeEqual, createSalt, deriveVaultKey } from '../keys';

const AAD = 'myworld|quote|quote:1|v1';

async function key(): Promise<CryptoKey> {
  return deriveVaultKey('test password', createSalt(), 1000);
}

describe('base64', () => {
  it('round trips bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255]);
    const encoded = bytesToBase64(bytes);

    expect(isBase64(encoded)).toBe(true);
    expect(Array.from(base64ToBytes(encoded))).toEqual(Array.from(bytes));
  });

  it('round trips a payload larger than one chunk', () => {
    const bytes = new Uint8Array(200_000).map((_, index) => index % 256);
    const encoded = bytesToBase64(bytes);

    expect(encoded.length).toBeGreaterThan(200_000);
    expect(base64ToBytes(encoded).length).toBe(bytes.length);
    expect(base64ToBytes(encoded)[199_999]).toBe(bytes[199_999]);
  });

  it('round trips text', () => {
    const text = 'I am becoming who I\'m meant to be. ✦';
    expect(bytesToUtf8(utf8ToBytes(text))).toBe(text);
  });
});

describe('envelope', () => {
  it('rejects values that are not envelopes', () => {
    expect(isEnvelope({ v: 1, alg: 'AES-256-GCM', iv: 'aaaa', ct: 'bbbb' })).toBe(true);
    expect(isEnvelope({ v: 2, alg: 'AES-256-GCM', iv: 'aaaa', ct: 'bbbb' })).toBe(false);
    expect(isEnvelope({ v: 1, alg: 'AES-128-CBC', iv: 'aaaa', ct: 'bbbb' })).toBe(false);
    expect(isEnvelope({ v: 1, alg: 'AES-256-GCM', iv: 'not base64', ct: 'bbbb' })).toBe(false);
    expect(isEnvelope(null)).toBe(false);
    expect(() => parseEnvelope({ v: 1 })).toThrow();
  });

  it('keeps the version and algorithm of a created envelope', () => {
    const envelope = createEnvelope(new Uint8Array(12), new Uint8Array(16));
    expect(envelope.v).toBe(1);
    expect(envelope.alg).toBe('AES-256-GCM');
  });
});

describe('aes-gcm', () => {
  it('round trips a value', async () => {
    const vaultKey = await key();
    const value = { text: 'Every hard moment is building me.', id: 7 };

    const envelope = await encryptJson(vaultKey, value, AAD);
    const restored = await decryptJson<typeof value>(vaultKey, envelope, AAD);

    expect(restored).toEqual(value);
  });

  it('uses a fresh nonce for every encryption', async () => {
    const vaultKey = await key();
    const value = { text: 'same every time' };

    const first = await encryptJson(vaultKey, value, AAD);
    const second = await encryptJson(vaultKey, value, AAD);

    expect(first.iv).not.toBe(second.iv);
    expect(first.ct).not.toBe(second.ct);
  });

  it('refuses to open a tampered ciphertext', async () => {
    const vaultKey = await key();
    const envelope = await encryptJson(vaultKey, { text: 'private' }, AAD);

    const bytes = base64ToBytes(envelope.ct);
    bytes[0] = (bytes[0] ?? 0) ^ 0xff;
    const tampered = { ...envelope, ct: bytesToBase64(bytes) };

    await expect(decryptJson(vaultKey, tampered, AAD)).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it('refuses to open a record with the wrong key', async () => {
    const envelope = await encryptJson(await key(), { text: 'private' }, AAD);
    const otherKey = await key();

    await expect(decryptJson(otherKey, envelope, AAD)).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it('binds the ciphertext to its record', async () => {
    const vaultKey = await key();
    const envelope = await encryptJson(vaultKey, { text: 'private' }, AAD);

    await expect(
      decryptJson(vaultKey, envelope, 'myworld|quote|quote:2|v1'),
    ).rejects.toBeInstanceOf(DecryptionError);
  });
});

describe('key derivation', () => {
  it('produces the same key for the same password and salt', async () => {
    const salt = createSalt();
    const envelope = await encryptJson(
      await deriveVaultKey('same password', salt, 1000),
      { text: 'private' },
      AAD,
    );

    const restored = await decryptJson<{ text: string }>(
      await deriveVaultKey('same password', salt, 1000),
      envelope,
      AAD,
    );

    expect(restored.text).toBe('private');
  });

  it('produces a different key for a different salt', async () => {
    const envelope = await encryptJson(
      await deriveVaultKey('same password', createSalt(), 1000),
      { text: 'private' },
      AAD,
    );

    await expect(
      decryptJson(
        await deriveVaultKey('same password', createSalt(), 1000),
        envelope,
        AAD,
      ),
    ).rejects.toBeInstanceOf(DecryptionError);
  });

  it('uses a unique salt every time', () => {
    expect(bytesToBase64(createSalt())).not.toBe(bytesToBase64(createSalt()));
  });

  it('compares strings without leaking the first difference', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'ab')).toBe(false);
  });
});
