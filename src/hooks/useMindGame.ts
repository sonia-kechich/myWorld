import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { REFLECTION_QUESTIONS } from '../data';
import type { GamePhase } from '../types';
import { writeQuietly, type VaultStore } from '../storage/vaultStore';

export interface UseMindGameResult {
  phase: GamePhase;
  question: string;
  doneCount: number;
  complete: () => void;
  next: () => void;
}

export function useMindGame(
  store: VaultStore | null,
  onReflectionDone?: () => void,
): UseMindGameResult {
  const [phase, setPhase] = useState<GamePhase>('q');
  const [index, setIndex] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const doneCountRef = useRef(0);
  const previous = useRef(-1);

  useEffect(() => {
    if (!store) return;

    let cancelled = false;

    const load = async () => {
      try {
        const saved = await store.get<{ doneCount?: number }>('game', 'game');

        if (cancelled || !saved || typeof saved.doneCount !== 'number') return;

        doneCountRef.current = saved.doneCount;
        setDoneCount(saved.doneCount);
      } catch {
        // Nothing could be read, most likely because the vault was locked
        // again while it was loading.
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [store]);

  const pickNext = useCallback(() => {
    let next = index;
    while (next === previous.current && REFLECTION_QUESTIONS.length > 1) {
      next = Math.floor(Math.random() * REFLECTION_QUESTIONS.length);
    }
    previous.current = index;
    setIndex(next);
  }, [index]);

  const complete = useCallback(() => {
    setPhase('done');
    const next = doneCountRef.current + 1;
    doneCountRef.current = next;
    setDoneCount(next);
    if (store) writeQuietly(store.put('game', 'game', { doneCount: next }));
    onReflectionDone?.();
  }, [store, onReflectionDone]);

  const next = useCallback(() => {
    pickNext();
    setPhase('q');
  }, [pickNext]);

  const question = REFLECTION_QUESTIONS[index] ?? REFLECTION_QUESTIONS[0] ?? '';

  return useMemo(
    () => ({ phase, question, doneCount, complete, next }),
    [phase, question, doneCount, complete, next],
  );
}
