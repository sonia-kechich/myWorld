import { describe, expect, it } from 'vitest';
import {
  checkAuthenticatorCode,
  createAuthenticatorProfile,
  normalizeSecret,
} from '../authenticator';
import { generateCode, FIXED_NOW } from '../../test/helpers';

describe('authenticator profile', () => {
  it('creates a base32 secret', () => {
    const profile = createAuthenticatorProfile('myWorld', 'myWorld');

    expect(profile.secret).toMatch(/^[A-Z2-7]+$/);
    expect(profile.secret.length).toBeGreaterThanOrEqual(32);
  });

  it('creates a different secret every time', () => {
    const first = createAuthenticatorProfile('myWorld', 'myWorld');
    const second = createAuthenticatorProfile('myWorld', 'myWorld');

    expect(first.secret).not.toBe(second.secret);
  });

  it('builds a provisioning URI an authenticator app understands', () => {
    const profile = createAuthenticatorProfile('myWorld', 'myWorld');

    expect(profile.uri.startsWith('otpauth://totp/')).toBe(true);
    expect(profile.uri).toContain(`secret=${profile.secret}`);
    expect(profile.uri).toContain('issuer=myWorld');
    expect(profile.uri).toContain('myWorld');
  });

  it('normalises a setup key that was copied with spaces or dashes', () => {
    expect(normalizeSecret('abcd efgh ijkl')).toBe('ABCDEFGHIJKL');
    expect(normalizeSecret('abcd-efgh-ijkl')).toBe('ABCDEFGHIJKL');
  });
});

describe('code check', () => {
  it('accepts the current code', async () => {
    const profile = createAuthenticatorProfile('myWorld', 'myWorld');
    const code = await generateCode(profile.secret);

    const result = await checkAuthenticatorCode({
      secret: profile.secret,
      token: code,
      now: FIXED_NOW * 1000,
    });

    expect(result.valid).toBe(true);
  });

  it('rejects a code that was never correct', async () => {
    const profile = createAuthenticatorProfile('myWorld', 'myWorld');

    const result = await checkAuthenticatorCode({
      secret: profile.secret,
      token: '000000',
      now: FIXED_NOW * 1000,
    });

    expect(result).toEqual({ valid: false, reason: 'invalid' });
  });

  it('rejects a code that is not six digits', async () => {
    const profile = createAuthenticatorProfile('myWorld', 'myWorld');

    const result = await checkAuthenticatorCode({
      secret: profile.secret,
      token: '12345',
      now: FIXED_NOW * 1000,
    });

    expect(result).toEqual({ valid: false, reason: 'format' });
  });

  it('reports a code that has expired', async () => {
    const profile = createAuthenticatorProfile('myWorld', 'myWorld');
    const old = await generateCode(profile.secret, FIXED_NOW - 300);

    const result = await checkAuthenticatorCode({
      secret: profile.secret,
      token: old,
      now: FIXED_NOW * 1000,
    });

    expect(result).toEqual({ valid: false, reason: 'expired' });
  });

  it('reports a code that was already used', async () => {
    const profile = createAuthenticatorProfile('myWorld', 'myWorld');
    const code = await generateCode(profile.secret);

    const first = await checkAuthenticatorCode({
      secret: profile.secret,
      token: code,
      now: FIXED_NOW * 1000,
    });

    expect(first.valid).toBe(true);

    const timeStep = first.valid ? first.timeStep : 0;

    const second = await checkAuthenticatorCode({
      secret: profile.secret,
      token: code,
      lastUsedTimeStep: timeStep,
      now: FIXED_NOW * 1000,
    });

    expect(second).toEqual({ valid: false, reason: 'replayed' });
  });

  it('accepts a code from the previous step', async () => {
    const profile = createAuthenticatorProfile('myWorld', 'myWorld');
    const previous = await generateCode(profile.secret, FIXED_NOW - 30);

    const result = await checkAuthenticatorCode({
      secret: profile.secret,
      token: previous,
      now: FIXED_NOW * 1000,
    });

    expect(result.valid).toBe(true);
  });

  it('never keeps the code it checked', async () => {
    const profile = createAuthenticatorProfile('myWorld', 'myWorld');
    const code = await generateCode(profile.secret);

    await checkAuthenticatorCode({
      secret: profile.secret,
      token: code,
      now: FIXED_NOW * 1000,
    });

    expect(JSON.stringify(localStorage)).not.toContain(code);
  });
});
