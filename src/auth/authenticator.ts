import { generateSecret, generateURI, verify } from 'otplib';
import {
  TOTP_ALGORITHM,
  TOTP_DIGITS,
  TOTP_EXPIRY_LOOKBACK_SECONDS,
  TOTP_PERIOD,
  TOTP_TOLERANCE_SECONDS,
} from './constants';

export interface AuthenticatorProfile {
  /** Base32 shared secret, also shown to the user as the manual setup key. */
  secret: string;
  /** otpauth://totp/ provisioning URI encoded in the QR code. */
  uri: string;
  label: string;
  issuer: string;
}

export type CodeFailure = 'format' | 'invalid' | 'expired' | 'replayed';

export type CodeResult =
  | { valid: true; timeStep: number }
  | { valid: false; reason: CodeFailure };

export interface CodeCheck {
  secret: string;
  token: string;
  /** Highest time step that has already been consumed, for replay protection. */
  lastUsedTimeStep?: number | null;
  now?: number;
}

/** Strips the spaces and dashes people add when copying a setup key. */
export function normalizeSecret(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase();
}

export function createAuthenticatorProfile(
  label: string,
  issuer: string,
): AuthenticatorProfile {
  const secret = generateSecret();
  const uri = generateURI({
    issuer,
    label,
    secret,
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
  });

  return { secret, uri, label, issuer };
}

/**
 * Verifies a 6 digit code against the authenticator secret.
 *
 * The matched time step is returned so the caller can store it and reject a
 * replayed code later on. Codes that were correct in the recent past are
 * reported as expired, codes that never matched are reported as invalid.
 */
export async function checkAuthenticatorCode({
  secret,
  token,
  lastUsedTimeStep = null,
  now = Date.now(),
}: CodeCheck): Promise<CodeResult> {
  const trimmed = token.trim();

  if (!new RegExp(`^\\d{${TOTP_DIGITS}}$`).test(trimmed)) {
    return { valid: false, reason: 'format' };
  }

  const epoch = Math.floor(now / 1000);
  const currentTimeStep = Math.floor(epoch / TOTP_PERIOD);

  try {
    const result = await verify({
      secret,
      token: trimmed,
      digits: TOTP_DIGITS,
      period: TOTP_PERIOD,
      algorithm: TOTP_ALGORITHM,
      epochTolerance: TOTP_TOLERANCE_SECONDS,
      epoch,
    });

    if (result.valid) {
      // The matched step is the current step plus the reported offset.
      const timeStep = currentTimeStep + result.delta;

      if (lastUsedTimeStep !== null && timeStep <= lastUsedTimeStep) {
        return { valid: false, reason: 'replayed' };
      }
      return { valid: true, timeStep };
    }

    const wide = await verify({
      secret,
      token: trimmed,
      digits: TOTP_DIGITS,
      period: TOTP_PERIOD,
      algorithm: TOTP_ALGORITHM,
      epochTolerance: TOTP_EXPIRY_LOOKBACK_SECONDS,
      epoch,
    });

    if (wide.valid) {
      const timeStep = currentTimeStep + wide.delta;

      // The very step that was consumed before is a replay, anything else
      // that was correct recently simply rotated away.
      if (lastUsedTimeStep !== null && timeStep === lastUsedTimeStep) {
        return { valid: false, reason: 'replayed' };
      }
      return { valid: false, reason: 'expired' };
    }

    return { valid: false, reason: 'invalid' };
  } catch {
    return { valid: false, reason: 'invalid' };
  }
}
