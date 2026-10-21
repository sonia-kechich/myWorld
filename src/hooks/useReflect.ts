import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReflectMessage, ReflectMode } from '../types';

const GREETING: ReflectMessage = {
  id: 0,
  text: "I'm here. What's on your mind?",
  mode: 'pos',
};

export interface UseReflectResult {
  mode: ReflectMode;
  setMode: (mode: ReflectMode) => void;
  messages: ReflectMessage[];
  typing: boolean;
  draft: string;
  setDraft: (value: string) => void;
  send: () => void;
  moodPercent: number;
}

export function useReflect(onMessageSent?: () => void): UseReflectResult {
  const [mode, setMode] = useState<ReflectMode>('pos');
  const [messages, setMessages] = useState<ReflectMessage[]>([GREETING]);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const [moodPercent, setMoodPercent] = useState(50);

  const posCount = useRef(1);
  const totalCount = useRef(1);
  const nextId = useRef(1);
  const timers = useRef<number[]>([]);

  useEffect(
    () => () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
      timers.current = [];
    },
    [],
  );

  const send = useCallback(() => {
    const text = draft.trim();
    if (!text) return;

    setDraft('');
    setMessages((current) => [
      ...current,
      { id: nextId.current++, text, mode },
    ]);

    totalCount.current += 1;
    if (mode === 'pos') posCount.current += 1;
    setMoodPercent(
      Math.round((posCount.current / totalCount.current) * 100),
    );

    onMessageSent?.();

    setTyping(false);
    const show = window.setTimeout(() => setTyping(true), 180);
    const hide = window.setTimeout(
      () => setTyping(false),
      180 + 1100 + Math.random() * 600,
    );
    timers.current.push(show, hide);
  }, [draft, mode, onMessageSent]);

  return useMemo(
    () => ({
      mode,
      setMode,
      messages,
      typing,
      draft,
      setDraft,
      send,
      moodPercent,
    }),
    [mode, messages, typing, draft, send, moodPercent],
  );
}
