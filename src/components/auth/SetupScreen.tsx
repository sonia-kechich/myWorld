import { useState } from 'react';
import QRCode from 'react-qr-code';
import { useVault } from '../../auth/VaultProvider';
import { MIN_PASSWORD_LENGTH } from '../../auth/constants';
import { VaultError, type SetupSession } from '../../auth/vaultService';

type Step = 'password' | 'authenticator' | 'verify';

const STEP_ORDER: Step[] = ['password', 'authenticator', 'verify'];

export default function SetupScreen() {
  const { beginSetup, completeSetup, startupError } = useVault();

  const [step, setStep] = useState<Step>('password');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [session, setSession] = useState<SetupSession | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const stepIndex = STEP_ORDER.indexOf(step);

  const handlePassword = async () => {
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(
        `Use at least ${MIN_PASSWORD_LENGTH} characters, and make it something only you know.`,
      );
      return;
    }

    if (password !== confirm) {
      setError('Those two passwords do not match.');
      return;
    }

    setBusy(true);

    try {
      const started = await beginSetup(password);
      setSession(started);
      setStep('authenticator');
    } catch (cause) {
      setError(cause instanceof VaultError ? cause.message : 'Setup could not start.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    if (!session) return;

    setError(null);
    setBusy(true);

    try {
      await completeSetup(session, code);
    } catch (cause) {
      setError(
        cause instanceof VaultError ? cause.message : 'That code could not be verified.',
      );
    } finally {
      setBusy(false);
    }
  };

  const copyKey = async () => {
    if (!session) return;

    try {
      await navigator.clipboard.writeText(session.profile.secret);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="screen auth-screen">
      <div className="auth-head">
        <div className="auth-progress">
          {STEP_ORDER.map((item, index) => (
            <span
              key={item}
              className={`auth-dot${index <= stepIndex ? ' on' : ''}`}
            />
          ))}
        </div>
        <div className="auth-title">
          {step === 'password'
            ? 'Create your vault'
            : step === 'authenticator'
              ? 'Add your authenticator'
              : 'Confirm it works'}
        </div>
        <div className="auth-sub">
          {step === 'password'
            ? 'Everything you write here is encrypted on this device. Nobody else can read it.'
            : step === 'authenticator'
              ? 'One extra layer, so a stolen device alone is not enough.'
              : 'Enter the 6-digit code your authenticator is showing.'}
        </div>
      </div>

      <div className="auth-body">
        {startupError ? <div className="auth-error">{startupError}</div> : null}

        {step === 'password' ? (
          <>
            <label className="auth-label" htmlFor="setup-password">
              Password
            </label>
            <input
              id="setup-password"
              className="auth-input"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Something only you know"
            />

            <label className="auth-label" htmlFor="setup-confirm">
              Repeat password
            </label>
            <input
              id="setup-confirm"
              className="auth-input"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              placeholder="Type it once more"
            />

            <p className="auth-note">
              There is no reset link. If you forget this password, the vault cannot be
              opened again.
            </p>
          </>
        ) : null}

        {step === 'authenticator' && session ? (
          <>
            <p className="auth-note">
              Install an authenticator app (Google Authenticator, Microsoft
              Authenticator, 2FAS) and scan this code. It is drawn on your device,
              nothing is sent anywhere.
            </p>

            <div className="qr-frame">
              <QRCode
                value={session.profile.uri}
                size={176}
                bgColor="#f4f2ff"
                fgColor="#14121f"
                level="M"
              />
            </div>

            <div className="auth-label">Or type this setup key</div>
            <div className="setup-key">{session.profile.secret}</div>

            <button className="auth-link" type="button" onClick={copyKey}>
              {copied ? 'Copied' : 'Copy setup key'}
            </button>

            <p className="auth-note">
              Save this key somewhere safe. If you ever lose your device, this key is
              how you get back in.
            </p>
          </>
        ) : null}

        {step === 'verify' ? (
          <>
            <label className="auth-label" htmlFor="setup-code">
              6-digit code
            </label>
            <input
              id="setup-code"
              className="auth-input auth-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              placeholder="000000"
            />

            <p className="auth-note">
              Your vault is only created once this code is accepted.
            </p>
          </>
        ) : null}

        {error ? <div className="auth-error">{error}</div> : null}
      </div>

      <div className="auth-foot">
        {step === 'password' ? (
          <button
            className="auth-primary"
            type="button"
            onClick={handlePassword}
            disabled={busy}
          >
            {busy ? 'Deriving your key…' : 'Continue'}
          </button>
        ) : null}

        {step === 'authenticator' ? (
          <button
            className="auth-primary"
            type="button"
            onClick={() => setStep('verify')}
          >
            I have added it
          </button>
        ) : null}

        {step === 'verify' ? (
          <button
            className="auth-primary"
            type="button"
            onClick={handleVerify}
            disabled={busy || code.length !== 6}
          >
            {busy ? 'Creating your vault…' : 'Create my vault'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
