import { useCallback, useMemo, useState } from 'react';
import { LEVEL_NAMES, MAX_XP, XP_PER_LEVEL } from '../data';

export interface UseXpResult {
  xp: number;
  level: number;
  levelName: string;
  progress: number;
  addXp: (amount: number) => void;
}

export function useXp(): UseXpResult {
  const [xp, setXp] = useState(35);

  const addXp = useCallback((amount: number) => {
    setXp((current) => Math.min(current + amount, MAX_XP));
  }, []);

  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const progress = xp % XP_PER_LEVEL;
  const levelName =
    LEVEL_NAMES[Math.min(level - 1, LEVEL_NAMES.length - 1)] ?? LEVEL_NAMES[0];

  return useMemo(
    () => ({ xp, level, levelName, progress, addXp }),
    [xp, level, levelName, progress, addXp],
  );
}
