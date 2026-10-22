import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createSalt, deriveVaultKey } from '../../crypto/keys';
import { deleteDatabase } from '../../storage/db';
import { VaultStore } from '../../storage/vaultStore';
import { nextMessageId, useReflect } from '../useReflect';

let store: VaultStore;

beforeEach(async () => {
  await deleteDatabase();

  const key = await deriveVaultKey('test password', createSalt(), 1000);
  store = new VaultStore(key);
});

afterEach(async () => {
  await deleteDatabase();
});

describe('the reflections', () => {
  it('counts the mood from the messages and not from what was written down', async () => {
    await store.put('reflect', 'reflect', {
      mode: 'pos',
      messages: [
        { id: 1, text: 'a good day', mode: 'pos' },
        { id: 2, text: 'a hard day', mode: 'neg' },
      ],
      posCount: 999,
      totalCount: 0,
    });

    const { result } = renderHook(() => useReflect(store));

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(3);
    });

    // The greeting counts as one good message: two out of three.
    expect(result.current.moodPercent).toBe(67);
  });

  it('leaves out a message that cannot be shown', async () => {
    await store.put('reflect', 'reflect', {
      mode: 'pos',
      messages: [
        { id: 3, text: 'a good day', mode: 'pos' },
        { id: 'not a number', text: 'a broken day', mode: 'pos' },
      ],
    });

    const { result } = renderHook(() => useReflect(store));

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2);
    });

    await act(async () => {
      result.current.setDraft('a new thought');
    });

    await act(async () => {
      result.current.send();
    });

    const last = result.current.messages[result.current.messages.length - 1];
    expect(last?.id).toBe(4);
  });

  it('gives the next message of a very long list an id that is not in use', () => {
    const messages = Array.from({ length: 200000 }, (_, index) => ({
      id: index + 1,
      text: 'a thought',
      mode: 'pos' as const,
    }));

    expect(nextMessageId(messages)).toBe(200001);
  });
});
