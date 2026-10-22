/**
 * Asks the browser to keep the vault.
 *
 * A browser may clear an origin's storage when the device runs low on space.
 * The vault is encrypted, but a cleared database is still a vault the user
 * cannot open any more. `navigator.storage.persist()` asks for the protection
 * the browser offers (on Android and in most desktop browsers that is the
 * "persistent" storage class).
 *
 * A browser that does not know the API, or says no, is not an error: the app
 * works the same, only its data can be cleared under storage pressure.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;

  const storage = navigator.storage;
  if (!storage || typeof storage.persist !== 'function') return false;

  try {
    if (
      typeof storage.persisted === 'function' &&
      (await storage.persisted())
    ) {
      return true;
    }

    return await storage.persist();
  } catch {
    return false;
  }
}
