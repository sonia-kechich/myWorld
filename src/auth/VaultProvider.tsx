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
import type { VaultStore } from '../storage/vaultStore';
import { parseVaultFile, type VaultFile } from '../backup/vaultFile';
import { DEFAULT_AUTO_LOCK_MINUTES } from './constants';
import { createInactivityTimer } from './inactivity';
import { vaultService, type SetupSession } from './vaultService';

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
  logout: () => void;
  resetVault: () => Promise<void>;
  saveAutoLockMinutes: (minutes: number) => Promise<void>;
  readLockoutRemaining: () => Promise<number>;
  exportBackup: () => Promise<VaultFile>;
  importBackup: (file: VaultFile, password: string) => Promise<number>;
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

      const status = await vaultService.getStatus();
      if (cancelled) return;

      setPhase(status === 'unconfigured' ? 'unconfigured' : 'locked');
    };

    void detect();

    return () => {
      cancelled = true;
    };
  }, []);

  const openStore = useCallback(async () => {
    const next = vaultService.store();

    await migrateVault(next);

    const settings = await next.get<SettingsRecord>('settings', 'settings');
    setAutoLockMinutes(settings?.autoLockMinutes ?? DEFAULT_AUTO_LOCK_MINUTES);
    setStore(next);
    setPhase('unlocked');
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

  const logout = useCallback(() => {
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
      setAutoLockMinutes(minutes);

      if (!store) return;

      const settings =
        (await store.get<SettingsRecord>('settings', 'settings')) ??
        ({ schemaVersion: 1, autoLockMinutes: minutes } satisfies SettingsRecord);

      await store.put('settings', 'settings', {
        ...settings,
        autoLockMinutes: minutes,
      });
    },
    [store],
  );

  const exportBackup = useCallback(() => vaultService.exportBackup(), []);

  const readLockoutRemaining = useCallback(
    () => vaultService.readLockoutRemaining(),
    [],
  );

  const importBackup = useCallback(async (file: VaultFile, password: string) => {
    const count = await vaultService.importBackup(file, password);
    await openStore();
    return count;
  }, [openStore]);

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
      logout,
      resetVault,
      saveAutoLockMinutes,
      readLockoutRemaining,
      exportBackup,
      importBackup,
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
      logout,
      resetVault,
      saveAutoLockMinutes,
      readLockoutRemaining,
      exportBackup,
      importBackup,
    ],
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export { parseVaultFile };
