import { useCallback, useMemo, useRef, useState } from 'react';
import { REFLECTION_QUESTIONS } from '../data';
import type { GamePhase } from '../types';

export interface UseMindGameResult {
  phase: GamePhase;
  question: string;
  doneCount: number;
  complete: () => void;
  next: () => void;
}

export function useMindGame(onReflectionDone?: () => void): UseMindGameResult {
  const [phase, setPhase] = useState<GamePhase>('q');
  const [index, setIndex] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const previous = useRef(-1);

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
    setDoneCount((current) => current + 1);
    onReflectionDone?.();
  }, [onReflectionDone]);

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
