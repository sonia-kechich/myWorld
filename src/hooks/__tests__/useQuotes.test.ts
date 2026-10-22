import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { SEED_META } from '../../auth/vaultConfig';
import { createSalt, deriveVaultKey } from '../../crypto/keys';
import { deleteDatabase } from '../../storage/db';
import { getMeta } from '../../storage/records';
import { VaultStore } from '../../storage/vaultStore';
import { useQuotes } from '../useQuotes';

let store: VaultStore;

beforeEach(async () => {
  await deleteDatabase();

  const key = await deriveVaultKey('test password', createSalt(), 1000);
  store = new VaultStore(key);
});

afterEach(async () => {
  await deleteDatabase();
});

describe('the quotes', () => {
  it('writes the quotes the app starts with', async () => {
    const { result } = renderHook(() => useQuotes(store));

    await waitFor(() => {
      expect(result.current.quotes).toHaveLength(2);
    });

    const { items } = await store.list('quote');
    expect(items).toHaveLength(2);
  });

  it('does not bring the quotes back when the user removes them', async () => {
    const { result } = renderHook(() => useQuotes(store));

    await waitFor(() => {
      expect(result.current.quotes).toHaveLength(2);
    });

    await waitFor(async () => {
      expect(await getMeta(SEED_META)).not.toBeNull();
    });

    await act(async () => {
      for (const quote of [...result.current.quotes]) {
        result.current.deleteQuote(quote.id);
      }
    });

    await waitFor(async () => {
      const { items } = await store.list('quote');
      expect(items).toHaveLength(0);
    });

    // The vault is opened again, the quotes stay away.
    const again = renderHook(() => useQuotes(store));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const { items } = await store.list('quote');
    expect(items).toHaveLength(0);
    expect(again.result.current.quotes).toHaveLength(0);
  });

  it('gives two quotes that are added in the same moment different ids', async () => {
    const { result } = renderHook(() => useQuotes(store));

    await waitFor(() => {
      expect(result.current.quotes).toHaveLength(2);
    });

    await act(async () => {
      result.current.addQuote('the first one');
      result.current.addQuote('the second one');
    });

    const ids = result.current.quotes.map((quote) => quote.id);
    expect(new Set(ids).size).toBe(ids.length);

    await waitFor(async () => {
      const { items } = await store.list('quote');
      expect(items).toHaveLength(4);
    });
  });

  it('does not show a quote whose value is broken', async () => {
    await store.put('quote', 'quote:1', {
      id: 1,
      text: 'a good quote',
      reminder: null,
      active: false,
    });
    await store.put('quote', 'quote:99', { text: 42 });

    const { result } = renderHook(() => useQuotes(store));

    await waitFor(() => {
      expect(result.current.quotes).toHaveLength(1);
    });

    expect(result.current.quotes[0]?.text).toBe('a good quote');

    // The record is left alone, the app only leaves it out of the list.
    const { items } = await store.list('quote');
    expect(items).toHaveLength(2);
  });
});
