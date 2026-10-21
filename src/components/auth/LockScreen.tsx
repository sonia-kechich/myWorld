import { useEffect, useState } from 'react';
import { useVault } from '../../auth/VaultProvider';
import { VaultError } from '../../auth/vaultService';

export default function LockScreen() {
  const { unlock, unlockWithRecoveryKey, resetVault, startupError, readLockoutRemaining } =
    useVault();

  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (remaining <= 0) return;

    const timer = window.setInterval(() => {
      setRemaining((current) => Math.max(0, current - 1000));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [remaining]);

  const handleUnlock = async () => {
    setError(null);
    setBusy(true);

    try {
      if (useRecovery) {
        await unlockWithRecoveryKey(password, recoveryKey);
      } else {
        await unlock(password, code);
      }
    } catch (cause) {
      setError(
        cause instanceof VaultError ? cause.message : 'The vault could not be opened.',
      );
      setRemaining(await readLockoutRemaining());
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    setError(null);
    setBusy(true);

    try {
      await resetVault();
    } catch (cause) {
      setError(
        cause instanceof VaultError ? cause.message : 'The vault could not be erased.',
      );
    } finally {
      setBusy(false);
      setConfirmReset(false);
    }
  };

  const seconds = Math.ceil(remaining / 1000);

  return (
    <div className="screen auth-screen">
      <div className="auth-head">
        <div className="auth-title">myWorld</div>
        <div className="auth-sub">Locked. Your words are still encrypted.</div>
      </div>

      <div className="auth-body">
        {startupError ? <div className="auth-error">{startupError}</div> : null}

        <label className="auth-label" htmlFor="lock-password">
          Password
        </label>
        <input
          id="lock-password"
          className="auth-input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Your vault password"
        />

        {useRecovery ? (
          <>
            <label className="auth-label" htmlFor="lock-recovery">
              Setup key
            </label>
            <input
              id="lock-recovery"
              className="auth-input"
              type="text"
              autoComplete="off"
              value={recoveryKey}
              onChange={(event) => setRecoveryKey(event.target.value)}
              placeholder="The key you saved at setup"
            />
            <p className="auth-note">
              Your setup key is the key to the authenticator. With it you can put your
              app back on a new phone. Your password is still required.
            </p>
          </>
        ) : (
          <>
            <label className="auth-label" htmlFor="lock-code">
              6-digit code
            </label>
            <input
              id="lock-code"
              className="auth-input auth-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              placeholder="000000"
            />
          </>
        )}

        {error ? <div className="auth-error">{error}</div> : null}

        {remaining > 0 ? (
          <div className="auth-error">
            Too many attempts. Try again in {seconds} second{seconds === 1 ? '' : 's'}.
          </div>
        ) : null}
      </div>

      <div className="auth-foot">
        <button
          className="auth-primary"
          type="button"
          onClick={handleUnlock}
          disabled={busy || remaining > 0}
        >
          {busy ? 'Opening…' : 'Unlock'}
        </button>

        <button
          className="auth-link"
          type="button"
          onClick={() => {
            setUseRecovery((current) => !current);
            setError(null);
          }}
        >
          {useRecovery ? 'Use my 6-digit code' : 'Lost your authenticator? Use your setup key'}
        </button>

        {confirmReset ? (
          <div className="auth-danger">
            <p className="auth-note">
              This erases the vault on this device, including every quote and
              reflection. It cannot be undone.
            </p>
            <div className="auth-danger-row">
              <button
                className="auth-danger-btn"
                type="button"
                onClick={handleReset}
                disabled={busy}
              >
                Erase everything
              </button>
              <button
                className="auth-link"
                type="button"
                onClick={() => setConfirmReset(false)}
              >
                Keep it
              </button>
            </div>
          </div>
        ) : (
          <button
            className="auth-link auth-link-quiet"
            type="button"
            onClick={() => setConfirmReset(true)}
          >
            Lost both? Erase the vault
          </button>
        )}
      </div>
    </div>
  );
}
