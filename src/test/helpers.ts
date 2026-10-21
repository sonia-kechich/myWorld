import { generate } from 'otplib';
import { deleteDatabase } from '../storage/db';
import { vaultService, VaultService, type SetupSession } from '../auth/vaultService';

export const TEST_PASSWORD = 'a very long test password';
export const TEST_ITERATIONS = 1000;

/** A fixed moment in time so TOTP codes are deterministic inside tests. */
export const FIXED_NOW = Math.floor(Date.now() / 1000 / 30) * 30;

export interface TestClock {
  now: () => number;
  advance: (seconds: number) => void;
  epoch: () => number;
}

export function createClock(start: number = FIXED_NOW): TestClock {
  let current = start;

  return {
    now: () => current * 1000,
    epoch: () => current,
    advance: (seconds: number) => {
      current += seconds;
    },
  };
}

export async function generateCode(secret: string, epoch?: number): Promise<string> {
  return generate({ secret, epoch: epoch ?? FIXED_NOW });
}

export interface TestVault {
  service: VaultService;
  session: SetupSession;
  secret: string;
  clock: TestClock;
}

export async function createTestVault(
  password: string = TEST_PASSWORD,
  iterations: number = TEST_ITERATIONS,
  clock: TestClock = createClock(),
): Promise<TestVault> {
  const service = new VaultService({
    kdfIterations: iterations,
    now: clock.now,
  });

  const session = await service.beginSetup(password);
  await service.completeSetup(
    session,
    await generateCode(session.profile.secret, clock.epoch()),
  );

  return { service, session, secret: session.profile.secret, clock };
}

/** Removes the database and forgets the in memory key between tests. */
export async function resetVaultState(): Promise<void> {
  vaultService.lock();
  await deleteDatabase();
  localStorage.clear();
}
