import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

/**
 * Handles the Android back button. Returning true means the app dealt with the
 * press itself, false means the app should be closed.
 */
export type BackHandler = () => boolean;

let handler: BackHandler | null = null;

/** Sets the handler that runs when the back button is pressed. */
export function setBackHandler(next: BackHandler | null): void {
  handler = next;
}

/**
 * Starts listening for the Android back button. On the web there is no back
 * button, so nothing happens there.
 *
 * The listener has to exist for the whole life of the app: without one, the
 * native side swallows the press and the app cannot be closed with it.
 */
export function installBackButton(): () => void {
  if (!Capacitor.isNativePlatform()) {
    return () => {};
  }

  const listener = App.addListener('backButton', () => {
    if (handler?.()) return;
    void App.exitApp();
  });

  return () => {
    void listener.then((handle) => handle.remove());
  };
}
