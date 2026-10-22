import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestPersistentStorage } from '../persistence';

function stubStorage(storage: Partial<StorageManager> | undefined) {
  Object.defineProperty(navigator, 'storage', {
    value: storage,
    configurable: true,
  });
}

afterEach(() => {
  Object.defineProperty(navigator, 'storage', {
    value: undefined,
    configurable: true,
  });
});

describe('persistent storage', () => {
  it('asks the browser to keep the vault and reports a yes', async () => {
    const persist = vi.fn(async () => true);
    stubStorage({ persisted: async () => false, persist });

    await expect(requestPersistentStorage()).resolves.toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('does not ask again when the browser already keeps the data', async () => {
    const persist = vi.fn(async () => false);
    stubStorage({ persisted: async () => true, persist });

    await expect(requestPersistentStorage()).resolves.toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it('says no when the browser declines', async () => {
    stubStorage({ persisted: async () => false, persist: async () => false });

    await expect(requestPersistentStorage()).resolves.toBe(false);
  });

  it('says no when the browser has no storage API', async () => {
    stubStorage(undefined);

    await expect(requestPersistentStorage()).resolves.toBe(false);
  });

  it('says no when the browser throws', async () => {
    stubStorage({
      persist: async () => {
        throw new Error('the storage manager is not available here');
      },
    });

    await expect(requestPersistentStorage()).resolves.toBe(false);
  });
});
