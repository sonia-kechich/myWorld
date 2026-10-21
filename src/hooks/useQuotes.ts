import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Quote, QuoteReminder } from '../types';
import { writeQuietly, type VaultStore } from '../storage/vaultStore';

const SEED_QUOTES: Quote[] = [
  {
    id: 1,
    text: "I am becoming who I'm meant to be.",
    reminder: null,
    active: false,
  },
  {
    id: 2,
    text: 'Every hard moment is building me.',
    reminder: null,
    active: false,
  },
];

export interface UseQuotesResult {
  quotes: Quote[];
  addQuote: (text: string) => void;
  deleteQuote: (id: number) => void;
  saveReminder: (id: number, reminder: QuoteReminder) => void;
  toggleReminder: (id: number) => void;
}

function recordId(id: number): string {
  return `quote:${id}`;
}

export function useQuotes(
  store: VaultStore | null,
  onQuoteAdded?: () => void,
): UseQuotesResult {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const quotesRef = useRef<Quote[]>([]);

  const apply = useCallback((next: Quote[]) => {
    quotesRef.current = next;
    setQuotes(next);
  }, []);

  useEffect(() => {
    if (!store) return;

    let cancelled = false;

    const load = async () => {
      try {
        const { items } = await store.list<Quote>('quote');

        if (cancelled) return;

        if (items.length === 0) {
          for (const seed of SEED_QUOTES) {
            await store.put('quote', recordId(seed.id), seed);
          }
          if (!cancelled) apply(SEED_QUOTES);
          return;
        }

        apply(items.map((item) => item.value));
      } catch {
        // Nothing could be read, most likely because the vault was locked
        // again while it was loading.
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [store, apply]);

  const addQuote = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const quote: Quote = {
        id: Date.now(),
        text: trimmed,
        reminder: null,
        active: false,
      };

      apply([...quotesRef.current, quote]);
      if (store) writeQuietly(store.put('quote', recordId(quote.id), quote));
      onQuoteAdded?.();
    },
    [store, apply, onQuoteAdded],
  );

  const deleteQuote = useCallback(
    (id: number) => {
      apply(quotesRef.current.filter((quote) => quote.id !== id));
      if (store) writeQuietly(store.remove('quote', recordId(id)));
    },
    [store, apply],
  );

  const update = useCallback(
    (id: number, change: (quote: Quote) => Quote) => {
      const next = quotesRef.current.map((quote) =>
        quote.id === id ? change(quote) : quote,
      );

      apply(next);

      const updated = next.find((quote) => quote.id === id);
      if (updated && store) {
        writeQuietly(store.put('quote', recordId(id), updated));
      }
    },
    [store, apply],
  );

  const saveReminder = useCallback(
    (id: number, reminder: QuoteReminder) => {
      update(id, (quote) => ({ ...quote, reminder, active: true }));
    },
    [update],
  );

  const toggleReminder = useCallback(
    (id: number) => {
      update(id, (quote) => ({ ...quote, active: !quote.active }));
    },
    [update],
  );

  return useMemo(
    () => ({ quotes, addQuote, deleteQuote, saveReminder, toggleReminder }),
    [quotes, addQuote, deleteQuote, saveReminder, toggleReminder],
  );
}
