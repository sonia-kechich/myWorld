import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReflectMessage, ReflectMode } from '../types';
import { writeQuietly, type VaultStore } from '../storage/vaultStore';

const GREETING: ReflectMessage = {
  id: 0,
  text: "I'm here. What's on your mind?",
  mode: 'pos',
};

interface ReflectState {
  mode: ReflectMode;
  messages: ReflectMessage[];
  posCount: number;
  totalCount: number;
}

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

export function useReflect(
  store: VaultStore | null,
  onMessageSent?: () => void,
): UseReflectResult {
  const [mode, setModeState] = useState<ReflectMode>('pos');
  const [messages, setMessages] = useState<ReflectMessage[]>([GREETING]);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const [moodPercent, setMoodPercent] = useState(50);

  const stateRef = useRef<ReflectState>({
    mode: 'pos',
    messages: [],
    posCount: 1,
    totalCount: 1,
  });

  const nextId = useRef(1);
  const timers = useRef<number[]>([]);

  useEffect(
    () => () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
      timers.current = [];
    },
    [],
  );

  const persist = useCallback(() => {
    const state = stateRef.current;

    if (!store) return;

    writeQuietly(
      store.put('reflect', 'reflect', {
        mode: state.mode,
        messages: state.messages,
        posCount: state.posCount,
        totalCount: state.totalCount,
      }),
    );
  }, [store]);

  useEffect(() => {
    if (!store) return;

    let cancelled = false;

    const load = async () => {
      try {
        const saved = await store.get<ReflectState>('reflect', 'reflect');

        if (cancelled || !saved) return;

        const savedMessages = Array.isArray(saved.messages) ? saved.messages : [];
        const mode = saved.mode === 'neg' ? 'neg' : 'pos';
        const posCount =
          typeof saved.posCount === 'number' ? saved.posCount : 1;
        const totalCount =
          typeof saved.totalCount === 'number' ? saved.totalCount : 1;

        stateRef.current = { mode, messages: savedMessages, posCount, totalCount };

        if (savedMessages.length > 0) {
          nextId.current =
            Math.max(...savedMessages.map((message) => message.id)) + 1;
          setMessages([GREETING, ...savedMessages]);
        }

        setModeState(mode);
        setMoodPercent(Math.round((posCount / totalCount) * 100));
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

  const setMode = useCallback(
    (next: ReflectMode) => {
      stateRef.current = { ...stateRef.current, mode: next };
      setModeState(next);
      persist();
    },
    [persist],
  );

  const send = useCallback(() => {
    const text = draft.trim();
    if (!text) return;

    setDraft('');

    const message: ReflectMessage = {
      id: nextId.current++,
      text,
      mode: stateRef.current.mode,
    };

    const messages = [...stateRef.current.messages, message];
    const totalCount = stateRef.current.totalCount + 1;
    const posCount =
      stateRef.current.posCount + (stateRef.current.mode === 'pos' ? 1 : 0);

    stateRef.current = {
      ...stateRef.current,
      messages,
      posCount,
      totalCount,
    };

    setMessages([GREETING, ...messages]);
    setMoodPercent(Math.round((posCount / totalCount) * 100));
    persist();
    onMessageSent?.();

    setTyping(false);
    const show = window.setTimeout(() => setTyping(true), 180);
    const hide = window.setTimeout(
      () => setTyping(false),
      180 + 1100 + Math.random() * 600,
    );
    timers.current.push(show, hide);
  }, [draft, onMessageSent, persist]);

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
