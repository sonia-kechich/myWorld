import { BASE_LOCKOUT_MS, MAX_LOCKOUT_MS, MAX_UNLOCK_FAILURES } from './constants';

export interface LockoutState {
  /** Consecutive failed unlock attempts. */
  failures: number;
  /** Timestamp (ms) until which unlock attempts are refused. */
  lockedUntil: number | null;
}

export const INITIAL_LOCKOUT: LockoutState = { failures: 0, lockedUntil: null };

export function clearLockout(): LockoutState {
  return { failures: 0, lockedUntil: null };
}

export function registerFailure(state: LockoutState, now: number): LockoutState {
  const failures = state.failures + 1;

  if (failures < MAX_UNLOCK_FAILURES) {
    return { failures, lockedUntil: null };
  }

  const oversteps = failures - MAX_UNLOCK_FAILURES;
  const duration = Math.min(BASE_LOCKOUT_MS * 2 ** oversteps, MAX_LOCKOUT_MS);

  return { failures, lockedUntil: now + duration };
}

export function isLocked(state: LockoutState, now: number): boolean {
  return state.lockedUntil !== null && state.lockedUntil > now;
}

export function remainingLockMs(state: LockoutState, now: number): number {
  if (state.lockedUntil === null) return 0;
  return Math.max(0, state.lockedUntil - now);
}
