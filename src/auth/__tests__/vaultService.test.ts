import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VAULT_CONFIG_META, LOCKOUT_META, VERIFIER_MARKER } from '../vaultConfig';
import { VaultError, VaultService } from '../vaultService';
import { getMeta } from '../../storage/records';
import { deleteDatabase } from '../../storage/db';
import {
  createClock,
  createTestVault,
  FIXED_NOW,
  generateCode,
  resetVaultState,
  TEST_PASSWORD,
} from '../../test/helpers';

async function expectVaultError(
  action: () => Promise<unknown>,
  code: string,
): Promise<VaultError> {
  try {
    await action();
  } catch (error) {
    expect(error).toBeInstanceOf(VaultError);
    expect((error as VaultError).code).toBe(code);
    return error as VaultError;
  }

  throw new Error(`Expected the vault to fail with ${code}`);
}

beforeEach(async () => {
  await resetVaultState();
});

afterEach(async () => {
  await deleteDatabase();
});

describe('first run setup', () => {
  it('refuses a password that is too short', async () => {
    const service = new VaultService({ kdfIterations: 1000 });

    await expectVaultError(() => service.beginSetup('short'), 'weak-password');
  });

  it('does not create a vault when the code is wrong', async () => {
    const service = new VaultService({
      kdfIterations: 1000,
      now: () => FIXED_NOW * 1000,
    });

    const session = await service.beginSetup(TEST_PASSWORD);

    await expectVaultError(
      () => service.completeSetup(session, '000000'),
      'invalid-code',
    );

    expect(await service.getStatus()).toBe('unconfigured');
    expect(await getMeta(VAULT_CONFIG_META)).toBeNull();
  });

  it('creates the vault once the code is accepted', async () => {
    const service = new VaultService({
      kdfIterations: 1000,
      now: () => FIXED_NOW * 1000,
    });

    const session = await service.beginSetup(TEST_PASSWORD);
    await service.completeSetup(session, await generateCode(session.profile.secret));

    expect(await service.getStatus()).toBe('unlocked');
    expect(await service.isConfigured()).toBe(true);
  });

  it('keeps the authenticator secret encrypted on disk', async () => {
    const { service, session, secret } = await createTestVault();

    const raw = await getMeta(VAULT_CONFIG_META);
    const serialised = JSON.stringify(raw);

    expect(serialised).not.toContain(secret);
    expect(serialised).not.toContain(VERIFIER_MARKER);
    expect(service.isUnlocked).toBe(true);
    expect(session.profile.uri).toContain(secret);
  });

  it('never writes the code that was used', async () => {
    const service = new VaultService({
      kdfIterations: 1000,
      now: () => FIXED_NOW * 1000,
    });

    const session = await service.beginSetup(TEST_PASSWORD);
    const code = await generateCode(session.profile.secret);
    await service.completeSetup(session, code);

    const stored = JSON.stringify(await getMeta(VAULT_CONFIG_META));
    expect(stored).not.toContain(code);
  });
});

describe('unlocking', () => {
  it('opens the vault with the password and a current code', async () => {
    const clock = createClock();
    const { service, secret } = await createTestVault(TEST_PASSWORD, 1000, clock);
    service.lock();

    expect(await service.getStatus()).toBe('locked');

    clock.advance(30);
    await service.unlock(TEST_PASSWORD, await generateCode(secret, clock.epoch()));

    expect(await service.getStatus()).toBe('unlocked');
  });

  it('refuses a wrong password', async () => {
    const clock = createClock();
    const { service, secret } = await createTestVault(TEST_PASSWORD, 1000, clock);
    service.lock();

    clock.advance(30);
    const code = await generateCode(secret, clock.epoch());

    await expectVaultError(
      () => service.unlock('not my password', code),
      'incorrect-password',
    );

    expect(await service.getStatus()).toBe('locked');
  });

  it('counts a failed attempt', async () => {
    const clock = createClock();
    const { service, secret } = await createTestVault(TEST_PASSWORD, 1000, clock);
    service.lock();

    clock.advance(30);
    const code = await generateCode(secret, clock.epoch());

    await expectVaultError(
      () => service.unlock('not my password', code),
      'incorrect-password',
    );

    const lockout = await getMeta<{ failures: number }>(LOCKOUT_META);
    expect(lockout?.failures).toBe(1);
  });

  it('refuses a wrong code', async () => {
    const { service } = await createTestVault();
    service.lock();

    await expectVaultError(() => service.unlock(TEST_PASSWORD, '000000'), 'invalid-code');
  });

  it('refuses an expired code', async () => {
    const clock = createClock();
    const { service, secret } = await createTestVault(TEST_PASSWORD, 1000, clock);
    service.lock();

    const old = await generateCode(secret, clock.epoch() - 120);

    await expectVaultError(() => service.unlock(TEST_PASSWORD, old), 'expired-code');
  });

  it('refuses a code that was already used', async () => {
    const clock = createClock();
    const { service, secret } = await createTestVault(TEST_PASSWORD, 1000, clock);
    service.lock();

    clock.advance(30);
    const code = await generateCode(secret, clock.epoch());

    await service.unlock(TEST_PASSWORD, code);
    service.lock();

    await expectVaultError(() => service.unlock(TEST_PASSWORD, code), 'replayed-code');
  });

  it('lets the setup code open the vault once, and never again', async () => {
    const clock = createClock();
    const { service, secret } = await createTestVault(TEST_PASSWORD, 1000, clock);
    service.lock();

    const code = await generateCode(secret, clock.epoch());

    await service.unlock(TEST_PASSWORD, code);
    service.lock();

    await expectVaultError(() => service.unlock(TEST_PASSWORD, code), 'replayed-code');
  });

  it('clears the failure counter after a good attempt', async () => {
    const clock = createClock();
    const { service, secret } = await createTestVault(TEST_PASSWORD, 1000, clock);
    service.lock();

    clock.advance(30);
    const wrong = await generateCode(secret, clock.epoch());

    await expectVaultError(
      () => service.unlock('not my password', wrong),
      'incorrect-password',
    );

    clock.advance(30);
    const good = await generateCode(secret, clock.epoch());
    await service.unlock(TEST_PASSWORD, good);

    const lockout = await getMeta<{ failures: number }>(LOCKOUT_META);
    expect(lockout?.failures).toBe(0);
  });

  it('locks the vault and forgets the key', async () => {
    const { service } = await createTestVault();

    expect(service.isUnlocked).toBe(true);

    service.lock();

    expect(service.isUnlocked).toBe(false);
    expect(() => service.store()).toThrow(VaultError);
  });
});

describe('rate limiting', () => {
  it('refuses attempts while the vault is cooling down', async () => {
    const clock = createClock();
    const { service, secret } = await createTestVault(TEST_PASSWORD, 1000, clock);
    service.lock();

    const code = await generateCode(secret, clock.epoch());

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expectVaultError(
        () => service.unlock('not my password', code),
        'incorrect-password',
      );
    }

    const error = await expectVaultError(
      () => service.unlock(TEST_PASSWORD, code),
      'locked-out',
    );

    expect(error.retryAfterMs).toBeGreaterThan(0);
    expect(await service.getStatus()).toBe('locked');
  });
});

describe('recovery', () => {
  it('opens the vault with the setup key and the password', async () => {
    const { service, secret } = await createTestVault();
    service.lock();

    await service.unlockWithRecoveryKey(TEST_PASSWORD, secret);

    expect(await service.getStatus()).toBe('unlocked');
  });

  it('accepts a setup key that was copied with spaces', async () => {
    const { service, secret } = await createTestVault();
    service.lock();

    const spaced = secret
      .split('')
      .join(' ')
      .toLowerCase();
    await service.unlockWithRecoveryKey(TEST_PASSWORD, spaced);

    expect(await service.getStatus()).toBe('unlocked');
  });

  it('refuses a setup key that does not belong to this vault', async () => {
    const { service } = await createTestVault();
    service.lock();

    await expectVaultError(
      () => service.unlockWithRecoveryKey(TEST_PASSWORD, 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
      'incorrect-recovery-key',
    );
  });

  it('still needs the password', async () => {
    const { service, secret } = await createTestVault();
    service.lock();

    await expectVaultError(
      () => service.unlockWithRecoveryKey('not my password', secret),
      'incorrect-password',
    );
  });
});

describe('erasing', () => {
  it('removes the vault from the device', async () => {
    const { service } = await createTestVault();

    await service.resetVault();

    expect(service.isUnlocked).toBe(false);
    expect(await service.getStatus()).toBe('unconfigured');
    expect(await getMeta(VAULT_CONFIG_META)).toBeNull();
  });
});
