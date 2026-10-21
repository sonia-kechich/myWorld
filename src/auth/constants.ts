export const TOTP_DIGITS = 6;
export const TOTP_PERIOD = 30;
export const TOTP_ALGORITHM = 'sha1';

/**
 * Seconds of clock drift tolerated on either side of the current time step.
 * One period (30s) keeps a code usable right after it rotates while still
 * rejecting codes that are far too old.
 */
export const TOTP_TOLERANCE_SECONDS = 30;

/**
 * Wider window used only to tell "this code was correct but has expired"
 * apart from "this code was never correct".
 */
export const TOTP_EXPIRY_LOOKBACK_SECONDS = 300;

export const DEFAULT_AUTO_LOCK_MINUTES = 5;

/** Minutes of inactivity before the vault locks itself. 0 means never. */
export const AUTO_LOCK_OPTIONS = [1, 5, 15, 30, 0] as const;

export const MAX_UNLOCK_FAILURES = 5;
export const BASE_LOCKOUT_MS = 30_000;
export const MAX_LOCKOUT_MS = 15 * 60_000;

export const MIN_PASSWORD_LENGTH = 10;

export const VAULT_LABEL = 'myWorld';
export const VAULT_ISSUER = 'myWorld';
