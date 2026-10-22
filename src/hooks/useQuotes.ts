import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Quote, QuoteReminder, RepeatOption } from '../types';
import { writeQuietly, type VaultStore } from '../storage/vaultStore';
import { getMeta, setMeta } from '../storage/records';
import { SEED_META } from '../auth/vaultConfig';

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

const REPEAT_OPTIONS: RepeatOption[] = ['daily', 'weekdays', 'weekends', 'once'];

interface SeedStamp {
  quotes: true;
  seededAt: number;
}

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

/** The number of a record id like `quote:12`, when it has one. */
function numberOfRecordId(id: string): number | null {
  const match = /^quote:(\d+)$/.exec(id);
  if (!match) return null;

  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : null;
}

function readReminder(value: unknown): QuoteReminder | null {
  if (typeof value !== 'object' || value === null) return null;

  const candidate = value as Partial<QuoteReminder>;
  if (typeof candidate.time !== 'string') return null;
  if (!REPEAT_OPTIONS.includes(candidate.repeat as RepeatOption)) return null;

  return { time: candidate.time, repeat: candidate.repeat as RepeatOption };
}

/**
 * Reads a quote out of the store. The record id is the truth, so a quote that
 * was written with the id of another record cannot be confused with it. A
 * value that does not add up is not shown at all.
 */
function readQuote(id: string, value: unknown): Quote | null {
  if (typeof value !== 'object' || value === null) return null;

  const candidate = value as Partial<Quote>;
  if (typeof candidate.text !== 'string') return null;

  const number = numberOfRecordId(id);
  if (number === null && !Number.isSafeInteger(candidate.id)) return null;

  return {
    id: number ?? (candidate.id as number),
    text: candidate.text,
    reminder: readReminder(candidate.reminder),
    active: candidate.active === true,
  };
}

/**
 * The id of a new quote. It is always bigger than the ids that are in use, so
 * two quotes that are added in the same millisecond cannot get the same id
 * and overwrite each other.
 */
function nextQuoteId(quotes: Quote[]): number {
  let highest = 0;

  for (const quote of quotes) {
    if (quote.id > highest) highest = quote.id;
  }

  return Math.max(Date.now(), highest + 1);
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

        const seeded = await getMeta<SeedStamp>(SEED_META);

        if (items.length === 0 && !seeded) {
          // The first time the vault is used, the two quotes it starts with
          // are written. They are written once and once only: quotes the user
          // removes stay removed.
          for (const seed of SEED_QUOTES) {
            await store.put('quote', recordId(seed.id), seed);
          }

          if (!cancelled) apply(SEED_QUOTES);
          await setMeta(SEED_META, { quotes: true, seededAt: Date.now() });
          return;
        }

        const loaded = items
          .map((item) => readQuote(item.id, item.value))
          .filter((quote): quote is Quote => quote !== null);

        if (!cancelled) apply(loaded);

        if (!seeded) {
          await setMeta(SEED_META, { quotes: true, seededAt: Date.now() });
        }
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
        id: nextQuoteId(quotesRef.current),
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
