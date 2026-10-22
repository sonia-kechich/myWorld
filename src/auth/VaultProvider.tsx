import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { hasSubtleCrypto } from '../crypto/keys';
import { migrateVault } from '../storage/migrate';
import { requestPersistentStorage } from '../storage/persistence';
import type { VaultStore } from '../storage/vaultStore';
import {
  parsePortableBackup,
  type PortableBackup,
} from '../backup/portableBackup';
import type { ImportMode, ImportPlan } from '../backup/importPlan';
import { DEFAULT_AUTO_LOCK_MINUTES } from './constants';
import { createInactivityTimer } from './inactivity';
import {
  vaultService,
  type ImportResult,
  type PortableExport,
  type SetupSession,
} from './vaultService';
import { LEGACY_COPY_ID } from './vaultService';

export type VaultPhase = 'checking' | 'unconfigured' | 'locked' | 'unlocked';

export interface VaultContextValue {
  phase: VaultPhase;
  store: VaultStore | null;
  startupError: string | null;
  autoLockMinutes: number;
  beginSetup: (password: string) => Promise<SetupSession>;
  completeSetup: (session: SetupSession, code: string) => Promise<void>;
  unlock: (password: string, code: string) => Promise<void>;
  unlockWithRecoveryKey: (password: string, key: string) => Promise<void>;
  lock: () => void;
  resetVault: () => Promise<void>;
  saveAutoLockMinutes: (minutes: number) => Promise<void>;
  readLockoutRemaining: () => Promise<number>;
  exportPortable: (password: string) => Promise<PortableExport>;
  prepareImport: (backup: PortableBackup, password: string) => Promise<ImportPlan>;
  applyImport: (plan: ImportPlan, mode: ImportMode) => Promise<ImportResult>;
  undoLastImport: () => Promise<number>;
  hasLegacyCopy: () => Promise<boolean>;
  eraseLegacyCopy: () => Promise<void>;
}

const VaultContext = createContext<VaultContextValue | null>(null);

export function useVault(): VaultContextValue {
  const value = useContext(VaultContext);

  if (!value) {
    throw new Error('useVault must be used inside a VaultProvider');
  }

  return value;
}

interface SettingsRecord {
  schemaVersion: number;
  autoLockMinutes: number;
}

export function VaultProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<VaultPhase>('checking');
  const [store, setStore] = useState<VaultStore | null>(null);
  const [autoLockMinutes, setAutoLockMinutes] = useState(DEFAULT_AUTO_LOCK_MINUTES);
  const [startupError, setStartupError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const detect = async () => {
      if (!hasSubtleCrypto()) {
        if (cancelled) return;
        setStartupError(
          'This browser cannot do the encryption myWorld needs. Open myWorld over https:// or from localhost.',
        );
      }

      try {
        const status = await vaultService.getStatus();
        if (cancelled) return;

        setPhase(status === 'unconfigured' ? 'unconfigured' : 'locked');
      } catch {
        // The vault could not be read at all. The app says so instead of
        // staying on the loading screen for ever.
        if (cancelled) return;

        setStartupError(
          'Your vault could not be opened. Reload the page and try again.',
        );
        setPhase('locked');
      }
    };

    void detect();

    return () => {
      cancelled = true;
    };
  }, []);

  const openStore = useCallback(async () => {
    const next = vaultService.store();

    // A single damaged record must never keep the vault closed for good. The
    // migration is plain and is tried again on the next unlock.
    try {
      await migrateVault(next);
    } catch {
      // The store is opened anyway, the data is still where it was.
    }

    let minutes = DEFAULT_AUTO_LOCK_MINUTES;

    try {
      const settings = await next.get<SettingsRecord>('settings', 'settings');
      if (Number.isFinite(settings?.autoLockMinutes)) {
        minutes = settings?.autoLockMinutes ?? DEFAULT_AUTO_LOCK_MINUTES;
      }
    } catch {
      // The settings are damaged, the default lock time is used instead.
    }

    setAutoLockMinutes(minutes);
    setStore(next);
    setPhase('unlocked');

    // Ask the browser to keep the database, so it is not cleared when the
    // device runs low on space. A refusal changes nothing that the app does.
    void requestPersistentStorage();
  }, []);

  const beginSetup = useCallback(
    (password: string) => vaultService.beginSetup(password),
    [],
  );

  const completeSetup = useCallback(
    async (session: SetupSession, code: string) => {
      await vaultService.completeSetup(session, code);
      await openStore();
    },
    [openStore],
  );

  const unlock = useCallback(
    async (password: string, code: string) => {
      await vaultService.unlock(password, code);
      await openStore();
    },
    [openStore],
  );

  const unlockWithRecoveryKey = useCallback(
    async (password: string, key: string) => {
      await vaultService.unlockWithRecoveryKey(password, key);
      await openStore();
    },
    [openStore],
  );

  const lock = useCallback(() => {
    vaultService.lock();
    setStore(null);
    setPhase('locked');
  }, []);

  const resetVault = useCallback(async () => {
    await vaultService.resetVault();
    setStore(null);
    setPhase('unconfigured');
  }, []);

  const saveAutoLockMinutes = useCallback(
    async (minutes: number) => {
      if (!store) {
        setAutoLockMinutes(minutes);
        return;
      }

      let settings: SettingsRecord = {
        schemaVersion: 1,
        autoLockMinutes: minutes,
      };

      try {
        const stored = await store.get<SettingsRecord>('settings', 'settings');
        if (stored) settings = stored;
      } catch {
        // The settings are damaged, they are written again from scratch.
      }

      await store.put('settings', 'settings', {
        ...settings,
        autoLockMinutes: minutes,
      });

      // The new time is only shown once it is really written, so the screen
      // never promises something that did not happen.
      setAutoLockMinutes(minutes);
    },
    [store],
  );

  const exportPortable = useCallback(
    (password: string) => vaultService.exportPortable(password),
    [],
  );

  const readLockoutRemaining = useCallback(
    () => vaultService.readLockoutRemaining(),
    [],
  );

  const prepareImport = useCallback(
    (backup: PortableBackup, password: string) =>
      vaultService.prepareImport(backup, password),
    [],
  );

  const applyImport = useCallback(
    async (plan: ImportPlan, mode: ImportMode) => {
      const result = await vaultService.applyImport(plan, mode);
      await openStore();
      return result;
    },
    [openStore],
  );

  const undoLastImport = useCallback(async () => {
    const count = await vaultService.undoLastImport();
    await openStore();
    return count;
  }, [openStore]);

  const hasLegacyCopy = useCallback(async () => {
    if (!store) return false;
    const copy = await store.get('legacy', LEGACY_COPY_ID);
    return copy !== null;
  }, [store]);

  const eraseLegacyCopy = useCallback(async () => {
    if (!store) return;
    await store.remove('legacy', LEGACY_COPY_ID);
  }, [store]);

  useEffect(() => {
    if (phase !== 'unlocked' || autoLockMinutes <= 0) return;

    const timeoutMs = autoLockMinutes * 60_000;

    const timer = createInactivityTimer({
      timeoutMs,
      onTimeout: lock,
    });

    const onActivity = () => timer.touch();

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;

      if (Date.now() - timer.lastActivity >= timeoutMs) {
        lock();
        return;
      }

      timer.arm();
    };

    window.addEventListener('pointerdown', onActivity);
    window.addEventListener('keydown', onActivity);
    window.addEventListener('wheel', onActivity);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      timer.dispose();
      window.removeEventListener('pointerdown', onActivity);
      window.removeEventListener('keydown', onActivity);
      window.removeEventListener('wheel', onActivity);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [phase, autoLockMinutes, lock]);

  const value = useMemo<VaultContextValue>(
    () => ({
      phase,
      store,
      startupError,
      autoLockMinutes,
      beginSetup,
      completeSetup,
      unlock,
      unlockWithRecoveryKey,
      lock,
      resetVault,
      saveAutoLockMinutes,
      readLockoutRemaining,
      exportPortable,
      prepareImport,
      applyImport,
      undoLastImport,
      hasLegacyCopy,
      eraseLegacyCopy,
    }),
    [
      phase,
      store,
      startupError,
      autoLockMinutes,
      beginSetup,
      completeSetup,
      unlock,
      unlockWithRecoveryKey,
      lock,
      resetVault,
      saveAutoLockMinutes,
      readLockoutRemaining,
      exportPortable,
      prepareImport,
      applyImport,
      undoLastImport,
      hasLegacyCopy,
      eraseLegacyCopy,
    ],
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export { parsePortableBackup };
