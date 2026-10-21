import { useCallback, useMemo, useState } from 'react';
import type { Quote, QuoteReminder } from '../types';

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

export function useQuotes(onQuoteAdded?: () => void): UseQuotesResult {
  const [quotes, setQuotes] = useState<Quote[]>(SEED_QUOTES);

  const addQuote = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setQuotes((current) => [
        ...current,
        {
          id: Date.now(),
          text: trimmed,
          reminder: null,
          active: false,
        },
      ]);
      onQuoteAdded?.();
    },
    [onQuoteAdded],
  );

  const deleteQuote = useCallback((id: number) => {
    setQuotes((current) => current.filter((quote) => quote.id !== id));
  }, []);

  const saveReminder = useCallback((id: number, reminder: QuoteReminder) => {
    setQuotes((current) =>
      current.map((quote) =>
        quote.id === id ? { ...quote, reminder, active: true } : quote,
      ),
    );
  }, []);

  const toggleReminder = useCallback((id: number) => {
    setQuotes((current) =>
      current.map((quote) =>
        quote.id === id ? { ...quote, active: !quote.active } : quote,
      ),
    );
  }, []);

  return useMemo(
    () => ({ quotes, addQuote, deleteQuote, saveReminder, toggleReminder }),
    [quotes, addQuote, deleteQuote, saveReminder, toggleReminder],
  );
}
