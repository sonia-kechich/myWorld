import { base64ToBytes, bytesToBase64, isBase64 } from './base64';

export const ENVELOPE_VERSION = 1;
export const ENVELOPE_ALGORITHM = 'AES-256-GCM';

export interface EncryptedEnvelope {
  /** Envelope format version, for future migrations. */
  v: number;
  /** Algorithm identifier, so a stored envelope can be re-interpreted safely. */
  alg: string;
  /** Base64 initialisation vector (12 random bytes for GCM). */
  iv: string;
  /** Base64 ciphertext with the appended 128-bit GCM tag. */
  ct: string;
}

export class EnvelopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvelopeError';
  }
}

export function createEnvelope(iv: Uint8Array, ciphertext: Uint8Array): EncryptedEnvelope {
  return {
    v: ENVELOPE_VERSION,
    alg: ENVELOPE_ALGORITHM,
    iv: bytesToBase64(iv),
    ct: bytesToBase64(ciphertext),
  };
}

export function isEnvelope(value: unknown): value is EncryptedEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<EncryptedEnvelope>;
  return (
    candidate.v === ENVELOPE_VERSION &&
    candidate.alg === ENVELOPE_ALGORITHM &&
    isBase64(candidate.iv) &&
    isBase64(candidate.ct)
  );
}

export function parseEnvelope(value: unknown): EncryptedEnvelope {
  if (!isEnvelope(value)) {
    throw new EnvelopeError('Stored value is not a valid encrypted envelope');
  }

  // Reject base64 that decodes to nothing: an empty iv/ct means a broken record.
  if (base64ToBytes(value.iv).length === 0) {
    throw new EnvelopeError('Stored envelope has an empty initialisation vector');
  }

  return { v: value.v, alg: value.alg, iv: value.iv, ct: value.ct };
}
