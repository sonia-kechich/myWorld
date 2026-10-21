import { useRef, useState } from 'react';
import { useVault } from '../../auth/VaultProvider';
import { AUTO_LOCK_OPTIONS } from '../../auth/constants';
import { VaultError } from '../../auth/vaultService';
import { downloadVaultFile, readVaultFile } from '../../backup/downloadVault';
import { parseVaultFile, type VaultFile } from '../../backup/vaultFile';
import ScreenHeader from '../ScreenHeader';

interface SettingsScreenProps {
  onBack: () => void;
}

export default function SettingsScreen({ onBack }: SettingsScreenProps) {
  const {
    autoLockMinutes,
    saveAutoLockMinutes,
    lock,
    logout,
    exportBackup,
    importBackup,
    resetVault,
  } = useVault();

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingFile, setPendingFile] = useState<VaultFile | null>(null);
  const [importPassword, setImportPassword] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    setError(null);
    setMessage(null);
    setBusy(true);

    try {
      const file = await exportBackup();
      downloadVaultFile(file);
      setMessage('Backup saved. It stays encrypted without your password.');
    } catch (cause) {
      setError(
        cause instanceof VaultError ? cause.message : 'The backup could not be created.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handlePickFile = async (file: File | undefined) => {
    setError(null);
    setMessage(null);

    if (!file) return;

    try {
      setPendingFile(await readVaultFile(file));
      setImportPassword('');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'That file could not be read.',
      );
    }
  };

  const handleImport = async () => {
    if (!pendingFile) return;

    setError(null);
    setMessage(null);
    setBusy(true);

    try {
      const count = await importBackup(pendingFile, importPassword);
      setPendingFile(null);
      setImportPassword('');
      setMessage(`Backup restored with ${count} encrypted records.`);
    } catch (cause) {
      setError(
        cause instanceof VaultError ? cause.message : 'The backup could not be restored.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    setError(null);
    setMessage(null);
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

  return (
    <div className="screen">
      <ScreenHeader title="Vault" subtitle="your private space" onBack={onBack} />

      <div className="set-body">
        <section className="set-group">
          <div className="set-label">Auto lock</div>
          <p className="set-note">
            myWorld locks itself after a while without any input. Your data stays
            encrypted either way.
          </p>
          <select
            className="set-select"
            value={autoLockMinutes}
            onChange={(event) => {
              const minutes = Number(event.target.value);
              void saveAutoLockMinutes(minutes);
            }}
            aria-label="Auto lock"
          >
            {AUTO_LOCK_OPTIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes === 0 ? 'Never' : `After ${minutes} minute${minutes === 1 ? '' : 's'}`}
              </option>
            ))}
          </select>
        </section>

        <section className="set-group">
          <div className="set-label">Session</div>
          <button className="set-btn" type="button" onClick={lock}>
            Lock now
          </button>
          <button className="set-btn" type="button" onClick={logout}>
            Log out
          </button>
          <p className="set-note">
            Logging out ends this session and forgets the key in memory. Nothing is
            deleted, and unlocking again brings everything back.
          </p>
        </section>

        <section className="set-group">
          <div className="set-label">Backup</div>
          <p className="set-note">
            A backup holds your vault as ciphertext. Without the password it cannot be
            read.
          </p>
          <button className="set-btn" type="button" onClick={handleExport} disabled={busy}>
            Export backup
          </button>

          <input
            ref={fileInput}
            className="set-file"
            type="file"
            accept=".myworld,application/json"
            onChange={(event) => {
              void handlePickFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          <button
            className="set-btn"
            type="button"
            onClick={() => fileInput.current?.click()}
          >
            Restore from backup
          </button>

          {pendingFile ? (
            <div className="set-import">
              <p className="set-note">
                This backup replaces the vault on this device. Enter the password that
                was used when it was made.
              </p>
              <input
                className="set-select"
                type="password"
                autoComplete="current-password"
                value={importPassword}
                onChange={(event) => setImportPassword(event.target.value)}
                placeholder="Password of that backup"
                aria-label="Password of that backup"
              />
              <div className="set-row">
                <button
                  className="set-btn set-btn-accent"
                  type="button"
                  onClick={handleImport}
                  disabled={busy || importPassword.length === 0}
                >
                  Restore
                </button>
                <button
                  className="set-btn"
                  type="button"
                  onClick={() => {
                    setPendingFile(null);
                    setImportPassword('');
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </section>

        {message ? <div className="set-ok">{message}</div> : null}
        {error ? <div className="set-error">{error}</div> : null}

        <section className="set-group set-group-danger">
          <div className="set-label">Erase</div>
          {confirmReset ? (
            <>
              <p className="set-note">
                Every quote, reflection and the vault itself is removed from this
                device. This cannot be undone.
              </p>
              <div className="set-row">
                <button
                  className="set-btn set-btn-danger"
                  type="button"
                  onClick={handleReset}
                  disabled={busy}
                >
                  Erase everything
                </button>
                <button
                  className="set-btn"
                  type="button"
                  onClick={() => setConfirmReset(false)}
                >
                  Keep it
                </button>
              </div>
            </>
          ) : (
            <button
              className="set-btn set-btn-quiet"
              type="button"
              onClick={() => setConfirmReset(true)}
            >
              Erase the vault
            </button>
          )}
        </section>
      </div>
    </div>
  );
}

export { parseVaultFile };
