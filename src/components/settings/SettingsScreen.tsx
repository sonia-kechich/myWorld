import { useEffect, useRef, useState } from 'react';
import { useVault } from '../../auth/VaultProvider';
import { AUTO_LOCK_OPTIONS, MIN_PASSWORD_LENGTH } from '../../auth/constants';
import { VaultError } from '../../auth/vaultService';
import { savePortableBackup, readBackupFile } from '../../backup/downloadBackup';
import { PortableBackupError, type PortableBackup } from '../../backup/portableBackup';
import { KIND_LABELS, type ImportMode, type ImportPlan } from '../../backup/importPlan';
import type { UnreadableRecord } from '../../storage/records';
import ScreenHeader from '../ScreenHeader';

interface SettingsScreenProps {
  onBack: () => void;
}

const PREVIEW_LIMIT = 8;

function describeUnreadable(record: UnreadableRecord): string {
  return `${KIND_LABELS[record.kind]} “${record.id}”`;
}

function countText(count: number, what: string): string {
  return `${count} ${what}${count === 1 ? '' : 's'}`;
}

export default function SettingsScreen({ onBack }: SettingsScreenProps) {
  const {
    autoLockMinutes,
    saveAutoLockMinutes,
    lock,
    exportPortable,
    prepareImport,
    applyImport,
    undoLastImport,
    hasLegacyCopy,
    eraseLegacyCopy,
    resetVault,
  } = useVault();

  const [message, setMessage] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const [exportPassword, setExportPassword] = useState('');
  const [exportRepeat, setExportRepeat] = useState('');

  const [pendingBackup, setPendingBackup] = useState<PortableBackup | null>(null);
  const [importPassword, setImportPassword] = useState('');
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [mode, setMode] = useState<ImportMode>('merge');
  const [confirmReplace, setConfirmReplace] = useState(false);

  const [legacyCopy, setLegacyCopy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const clearError = () => {
    setError(null);
    setErrorDetails([]);
  };

  const fail = (text: string, details: string[] = []) => {
    setError(text);
    setErrorDetails(details);
  };

  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const present = await hasLegacyCopy();
        if (!cancelled) setLegacyCopy(present);
      } catch {
        // The copy cannot be read, the button that erases it stays hidden.
      }
    };

    void check();

    return () => {
      cancelled = true;
    };
  }, [hasLegacyCopy]);

  const handleExport = async () => {
    clearError();
    setMessage(null);
    setWarning(null);

    if (exportPassword.length < MIN_PASSWORD_LENGTH) {
      fail(
        `Use at least ${MIN_PASSWORD_LENGTH} characters for the backup password.`,
      );
      return;
    }

    if (exportPassword !== exportRepeat) {
      fail('Those two backup passwords do not match.');
      return;
    }

    setBusy(true);

    try {
      const { backup, unreadable } = await exportPortable(exportPassword);
      const name = await savePortableBackup(backup);

      setExportPassword('');
      setExportRepeat('');
      setMessage(`Backup saved as ${name}. It is encrypted with your backup password.`);

      if (unreadable.length > 0) {
        setWarning(
          `${countText(unreadable.length, 'record')} of the vault could not be read and ${
            unreadable.length === 1 ? 'is' : 'are'
          } not in this backup: ${unreadable.map(describeUnreadable).join(', ')}.`,
        );
      }
    } catch (cause) {
      fail(
        cause instanceof VaultError
          ? cause.message
          : 'The backup could not be created. Nothing was saved.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handlePickFile = async (file: File | undefined) => {
    clearError();
    setMessage(null);
    setWarning(null);
    setPlan(null);
    setConfirmReplace(false);

    if (!file) return;

    try {
      const backup = await readBackupFile(file);
      setPendingBackup(backup);
      setImportPassword('');
    } catch (cause) {
      setPendingBackup(null);
      fail(
        cause instanceof PortableBackupError
          ? cause.message
          : 'That file could not be read.',
      );
    }
  };

  const handleOpenBackup = async () => {
    if (!pendingBackup) return;

    clearError();
    setMessage(null);
    setWarning(null);
    setBusy(true);

    try {
      const prepared = await prepareImport(pendingBackup, importPassword);
      setPlan(prepared);
      setMode('merge');
      setConfirmReplace(false);
    } catch (cause) {
      if (cause instanceof PortableBackupError) {
        fail(cause.message, cause.details);
      } else {
        fail('That backup could not be opened.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async () => {
    if (!plan) return;

    clearError();
    setMessage(null);
    setWarning(null);
    setBusy(true);

    try {
      const result = await applyImport(plan, mode);

      setPlan(null);
      setPendingBackup(null);
      setImportPassword('');
      setConfirmReplace(false);

      setMessage(
        mode === 'replace'
          ? `Restored ${result.imported} records. A copy of the previous content is kept, so this can be undone.`
          : `Merged ${result.imported} records into the vault${
              result.kept > 0 ? `, ${result.kept} newer records were kept` : ''
            }.`,
      );

      if (result.unreadableRemoved > 0) {
        setWarning(
          `${countText(result.unreadableRemoved, 'record')} of the vault could not be read and ${
            result.unreadableRemoved === 1 ? 'was' : 'were'
          } removed with the rest. No copy of them could be kept.`,
        );
      }
    } catch (cause) {
      fail(
        cause instanceof VaultError
          ? cause.message
          : 'That backup could not be restored. Nothing was changed.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleUndo = async () => {
    clearError();
    setMessage(null);
    setWarning(null);
    setBusy(true);

    try {
      const count = await undoLastImport();
      setMessage(`Put back ${count} records from before the last restore.`);
    } catch (cause) {
      fail(
        cause instanceof VaultError
          ? cause.message
          : 'The recovery copy could not be restored.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleEraseLegacy = async () => {
    clearError();
    setMessage(null);
    setWarning(null);
    setBusy(true);

    try {
      await eraseLegacyCopy();
      setLegacyCopy(false);
      setMessage('The copy of the old version was erased.');
    } catch (cause) {
      fail(
        cause instanceof VaultError
          ? cause.message
          : 'The copy could not be erased.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    clearError();
    setMessage(null);
    setBusy(true);

    try {
      await resetVault();
    } catch (cause) {
      fail(
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
        {message ? <div className="set-ok">{message}</div> : null}
        {warning ? <div className="set-warn">{warning}</div> : null}
        {error ? <div className="set-error">{error}</div> : null}
        {errorDetails.length > 0 ? (
          <ul className="set-error-list">
            {errorDetails.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        ) : null}

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
              void saveAutoLockMinutes(minutes).catch(() => {
                fail('The auto lock time could not be saved.');
              });
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
          <p className="set-note">
            Locking forgets the key in memory and closes the app. Nothing is
            deleted, and unlocking again with your password and your code brings
            everything back.
          </p>
        </section>

        <section className="set-group">
          <div className="set-label">Save a backup</div>
          <p className="set-note">
            A backup holds your quotes, reflections and progress, encrypted with a
            password you choose here. It is not your vault password, and without it
            the file cannot be opened. Nothing is uploaded, the file stays on this
            device.
          </p>

          <input
            className="set-select"
            type="password"
            autoComplete="new-password"
            value={exportPassword}
            onChange={(event) => setExportPassword(event.target.value)}
            placeholder="Backup password"
            aria-label="Backup password"
          />
          <input
            className="set-select"
            type="password"
            autoComplete="new-password"
            value={exportRepeat}
            onChange={(event) => setExportRepeat(event.target.value)}
            placeholder="Repeat backup password"
            aria-label="Repeat backup password"
          />

          <button
            className="set-btn set-btn-accent"
            type="button"
            onClick={handleExport}
            disabled={busy}
          >
            Save encrypted backup
          </button>
        </section>

        <section className="set-group">
          <div className="set-label">Restore a backup</div>
          <p className="set-note">
            Pick a myWorld backup file. You will see what is in it before anything is
            changed, and you can choose to merge it or to replace what is here.
          </p>

          <input
            ref={fileInput}
            className="set-file"
            type="file"
            accept=".myworld,application/json"
            aria-label="Backup file"
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
            Choose a backup file
          </button>

          {pendingBackup && !plan ? (
            <div className="set-import">
              <p className="set-note">
                This backup was made on{' '}
                {new Date(pendingBackup.createdAt).toLocaleString()}. Enter the
                backup password to see what is inside.
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
                  onClick={handleOpenBackup}
                  disabled={busy || importPassword.length === 0}
                >
                  Open backup
                </button>
                <button
                  className="set-btn"
                  type="button"
                  onClick={() => {
                    setPendingBackup(null);
                    setImportPassword('');
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {plan ? (
            <div className="set-import">
              <p className="set-note">
                {plan.recordCount} record{plan.recordCount === 1 ? '' : 's'} in this
                backup:{' '}
                {plan.kinds
                  .map((entry) => `${entry.count} ${KIND_LABELS[entry.kind].toLowerCase()}`)
                  .join(', ')}
                . The vault holds {plan.existingCount} record
                {plan.existingCount === 1 ? '' : 's'} right now.
              </p>

              {plan.unreadable.length > 0 ? (
                <p className="set-note set-note-warn">
                  {countText(plan.unreadable.length, 'record')} of the vault cannot be
                  read: {plan.unreadable.map(describeUnreadable).join(', ')}. They are
                  not in this backup and a replace would remove them.
                </p>
              ) : null}

              <div className="set-preview">
                {plan.records.slice(0, PREVIEW_LIMIT).map((record) => (
                  <div className="set-preview-row" key={record.id}>
                    <span className="set-preview-kind">
                      {KIND_LABELS[record.kind]}
                    </span>
                    <span className="set-preview-text">{record.summary}</span>
                  </div>
                ))}
                {plan.records.length > PREVIEW_LIMIT ? (
                  <div className="set-preview-row">
                    <span className="set-preview-text">
                      …and {plan.records.length - PREVIEW_LIMIT} more
                    </span>
                  </div>
                ) : null}
              </div>

              <div className="set-choice">
                <label className="set-choice-row">
                  <input
                    type="radio"
                    name="restore-mode"
                    checked={mode === 'merge'}
                    onChange={() => {
                      setMode('merge');
                      setConfirmReplace(false);
                    }}
                  />
                  <span>
                    <strong>Merge</strong>
                    <span className="set-note">
                      Keep what is here and add what is in the backup. Newer records win.
                    </span>
                  </span>
                </label>

                <label className="set-choice-row">
                  <input
                    type="radio"
                    name="restore-mode"
                    checked={mode === 'replace'}
                    onChange={() => {
                      setMode('replace');
                      setConfirmReplace(false);
                    }}
                  />
                  <span>
                    <strong>Replace everything</strong>
                    <span className="set-note">
                      The backup becomes the content of the vault. What is here now is
                      removed, a copy of it is kept so you can undo this.
                    </span>
                  </span>
                </label>
              </div>

              {mode === 'replace' && !confirmReplace ? (
                <>
                  <p className="set-note set-note-warn">
                    This removes {plan.existingCount} record
                    {plan.existingCount === 1 ? '' : 's'} from this device. A copy is
                    kept inside the vault, but the safest thing is to save a backup
                    first.
                    {plan.unreadable.length > 0
                      ? ` ${countText(
                          plan.unreadable.length,
                          'record',
                        )} of them cannot be read, so no copy of them can be kept.`
                      : ''}
                  </p>
                  <button
                    className="set-btn set-btn-danger"
                    type="button"
                    onClick={() => setConfirmReplace(true)}
                  >
                    I understand, replace everything
                  </button>
                </>
              ) : (
                <div className="set-row">
                  <button
                    className="set-btn set-btn-accent"
                    type="button"
                    onClick={handleRestore}
                    disabled={busy}
                  >
                    {mode === 'replace' ? 'Replace the vault' : 'Merge into the vault'}
                  </button>
                  <button
                    className="set-btn"
                    type="button"
                    onClick={() => {
                      setPlan(null);
                      setPendingBackup(null);
                      setImportPassword('');
                      setConfirmReplace(false);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </section>

        <section className="set-group">
          <div className="set-label">Recovery</div>
          <p className="set-note">
            myWorld has no cloud account and no remote recovery. If this device is
            lost and no backup was saved, the data is gone. Keep a backup somewhere
            safe.
          </p>
          <button className="set-btn" type="button" onClick={handleUndo} disabled={busy}>
            Put back the copy from the last restore
          </button>
          {legacyCopy ? (
            <>
              <p className="set-note">
                A copy of the data from the old, unprotected version is kept inside the
                vault, so you can still go back to it. It is encrypted like everything
                else.
              </p>
              <button
                className="set-btn set-btn-quiet"
                type="button"
                onClick={handleEraseLegacy}
                disabled={busy}
              >
                Erase the copy of the old version
              </button>
            </>
          ) : null}
        </section>

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
