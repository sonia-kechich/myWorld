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

/** A message that can be shown. */
function isReflectMessage(value: unknown): value is ReflectMessage {
  if (typeof value !== 'object' || value === null) return false;

  const candidate = value as Partial<ReflectMessage>;

  return (
    typeof candidate.id === 'number' &&
    Number.isSafeInteger(candidate.id) &&
    candidate.id >= 0 &&
    typeof candidate.text === 'string' &&
    (candidate.mode === 'pos' || candidate.mode === 'neg')
  );
}

/**
 * The id of the next message. The ids are counted with a loop, a long list of
 * messages must not blow the stack, and only ids that are real numbers count.
 */
export function nextMessageId(messages: ReflectMessage[]): number {
  let highest = 0;

  for (const message of messages) {
    if (message.id > highest) highest = message.id;
  }

  return highest + 1;
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
        const messages = savedMessages.filter(isReflectMessage);
        const mode = saved.mode === 'neg' ? 'neg' : 'pos';

        // The counters are counted from the messages, so they always match
        // what is on the screen. The greeting counts as one positive message.
        const posCount =
          1 + messages.filter((message) => message.mode === 'pos').length;
        const totalCount = 1 + messages.length;

        stateRef.current = { mode, messages, posCount, totalCount };

        nextId.current = nextMessageId(messages);

        if (messages.length > 0) {
          setMessages([GREETING, ...messages]);
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
    [mode, messages, typing, draft, setMode, send, moodPercent],
  );
}
