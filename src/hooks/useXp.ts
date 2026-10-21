import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LEVEL_NAMES, MAX_XP, XP_PER_LEVEL } from '../data';
import { writeQuietly, type VaultStore } from '../storage/vaultStore';

const DEFAULT_XP = 35;

export interface UseXpResult {
  xp: number;
  level: number;
  levelName: string;
  progress: number;
  addXp: (amount: number) => void;
}

export function useXp(store: VaultStore | null): UseXpResult {
  const [xp, setXp] = useState(DEFAULT_XP);
  const xpRef = useRef(DEFAULT_XP);

  useEffect(() => {
    if (!store) return;

    let cancelled = false;

    const load = async () => {
      try {
        const saved = await store.get<{ xp?: number }>('progress', 'progress');

        if (cancelled) return;

        if (saved && typeof saved.xp === 'number') {
          xpRef.current = saved.xp;
          setXp(saved.xp);
          return;
        }

        await store.put('progress', 'progress', { xp: DEFAULT_XP });
      } catch {
        // The record could not be read, most likely because the vault was
        // locked again while it was loading. The default is good enough.
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [store]);

  const addXp = useCallback(
    (amount: number) => {
      const next = Math.min(xpRef.current + amount, MAX_XP);
      xpRef.current = next;
      setXp(next);
      if (store) writeQuietly(store.put('progress', 'progress', { xp: next }));
    },
    [store],
  );

  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const progress = xp % XP_PER_LEVEL;
  const levelName =
    LEVEL_NAMES[Math.min(level - 1, LEVEL_NAMES.length - 1)] ?? LEVEL_NAMES[0];

  return useMemo(
    () => ({ xp, level, levelName, progress, addXp }),
    [xp, level, levelName, progress, addXp],
  );
}
