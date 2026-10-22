import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.myworld.app',
  appName: 'myWorld',
  webDir: 'dist',
  android: {
    // The vault lives in the WebView, so the app must never mix secure and
    // insecure content and must never load a remote page as the app itself.
    allowMixedContent: false,
    // Same dark background as the web app, so the launch window never flashes white.
    backgroundColor: '#12121f',
    // The app draws its own phone frame; pinch zoom would only break the layout.
    zoomEnabled: false,
  },
  server: {
    // Serves the bundled assets from https://localhost, which keeps the WebView
    // a secure context (WebCrypto and IndexedDB need one).
    androidScheme: 'https',
  },
};

export default config;
