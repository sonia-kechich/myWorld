import { webcrypto } from 'node:crypto';
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest runs without globals, so the testing library cannot clean up on its own.
afterEach(() => {
  cleanup();
});

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
    writable: true,
  });
}

if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = (value: unknown) =>
    JSON.parse(JSON.stringify(value)) as unknown;
}
