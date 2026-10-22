# myWorld — Offline use and mobile packaging

Date: 21 October 2026 (Stage 3).

This document describes what myWorld needs to work without a network, and how
to wrap the production build into an Android app with Capacitor. It is a
description of a setup, not a claim that an Android build was produced and
tested on a device in this repository — see section 6.

---

## 1. The app is a static bundle

`npm run build` writes a plain `dist/` folder: one `index.html`, one
JavaScript file, one CSS file. There is no server, no API and no database
process. The whole app state lives in the browser:

| What | Where | Survives a reload |
| --- | --- | --- |
| the vault (settings, XP, reflect, game, quotes) | IndexedDB `myworld` | yes |
| the vault configuration and the sealed authenticator | IndexedDB `myworld` → `meta` | yes |
| the key while the vault is unlocked | memory only | no, on purpose |

Because everything is local, the app works with the device in flight mode.
The fonts are part of the bundle as well (`src/assets/fonts/`), so a page load
makes no request to any server at all.

There is no service worker, so there is no offline *installation* of the web
app. The Capacitor route below is the way to get an installable app.

## 2. What the app needs from its environment

| Requirement | Why | Where it comes from |
| --- | --- | --- |
| `crypto.subtle` (WebCrypto) | the key derivation and the encryption | a **secure context**: `https://`, `http://localhost` or the Capacitor scheme |
| `crypto.getRandomValues` | salts, IVs, nonces | every modern browser |
| IndexedDB | the encrypted records | every modern browser and the Android WebView |
| `Blob`, `URL.createObjectURL`, `File.text()` | the backup file | every modern browser and the Android WebView (see section 4) |

If WebCrypto is missing, myWorld refuses to run and says so instead of
falling back to something weaker. `src/crypto/keys.ts` holds the check
(`hasSubtleCrypto`).

## 3. Android with Capacitor

### 3.1 What you need

- Node 20 or newer,
- Android Studio with the Android SDK (API 34 or newer),
- JDK 17,
- a USB connected device or an emulator.

### 3.2 Steps

The native shell is part of this repository: `android/`,
`capacitor.config.ts` and the Capacitor packages in `package.json`.

```bash
# 1. install and build the web app
npm ci
npm run build

# 2. after every change of the web app
npm run build
npx cap sync android      # copies dist and the plugins into the Android project
npx cap open android      # build and run from Android Studio
```

`capacitor.config.ts` holds the settings that matter:

- `appId: 'com.myworld.app'` and `appName: 'myWorld'`,
- `webDir: 'dist'`, so the built bundle is what the app loads,
- `android.allowMixedContent: false` and `server.androidScheme: 'https'`, so
  the WebView is a secure context and never mixes secure and insecure content,
- `android.backgroundColor: '#12121f'`, so the launch window matches the app,
- `android.zoomEnabled: false`, because the app draws its own phone frame.

### 3.3 The secure context

Capacitor serves the bundled files from `https://localhost` (Android) with a
local scheme handler. That is a secure context, so `crypto.subtle` and
IndexedDB behave exactly as they do in the browser. Nothing in the code has to
change for the encryption to work.

Do **not** change the scheme to plain `http://` on a non-local host: that
would remove `crypto.subtle` and myWorld would refuse to start.

### 3.4 Keep the data out of the cloud backup

Android copies the app data into the user's cloud backup by default. That
would carry the encrypted vault (and the sealed authenticator) to another
device without the user ever asking for it. In
`android/app/src/main/AndroidManifest.xml`:

```xml
<application
    android:allowBackup="false"
    android:fullBackupContent="false"
    ... >
```

The vault is encrypted either way, but "no cloud copy" is the promise myWorld
makes, and the promise should also hold at the operating system level.

### 3.5 The screen

The design is a dark, single column app. The manifest should keep the dark
background (`#12121f`, the `theme-color` in `index.html`), the app should not
be allowed to rotate into a layout that the design was not drawn for, and the
status bar should be transparent over the dark background.

## 4. The download on Android

A browser downloads the backup from a `blob:` URL. The Android WebView does not
do that on its own, so `savePortableBackup` in `src/backup/downloadBackup.ts`
takes a different path on a device:

1. The file is written with `@capacitor/filesystem` into the app's own cache
   folder. Only the app can read that folder, and the previous backup is
   removed first.
2. The file is handed to the system share sheet with `@capacitor/share`, so the
   user decides where it goes.

On Android the file is named `myworld-backup-<date>.json`. The content is the
same `.myworld` format, but Android only offers `.json` files to other apps and
to the file picker.

**Reading** a backup needs none of this: the `<input type="file">` opens the
system picker and the app reads the file with `File.text()`, which is supported
in the WebView.

The share sheet itself has not been tried on a real device (see section 6).

## 5. Testing on a device

- `npm run dev` — the app in the desktop browser, with the hot reload.
- `npm run build && npx cap copy android && npx cap open android` — the app on
  the device or the emulator.
- The test suite (`npm test`) runs in jsdom and covers the logic, not the
  native shell. A device pass should check at least:
  - the setup flow and the QR code,
  - a lock and an unlock,
  - a quote that survives a lock,
  - the export through the share sheet and the import of that file.

## 6. What was verified here, and what was not

Verified in this repository:

- the production build succeeds and the bundle makes no network call at all
  (`npm test` asserts the setup flow makes no network call, and
  `src/__tests__/offline.test.ts` fails if `index.html`, the font CSS or the
  CSP points at another origin),
- the fonts and the Capacitor plugins are part of the bundle,
- the Content Security Policy is in the built `index.html`,
- the whole flow (setup, quote, backup, lock, unlock, merge, replace, undo)
  is covered by the automated tests in jsdom.

**Not** verified here: a build of the Android app, the behaviour of the
Capacitor WebView, the share sheet on a device, the file picker on a device and
the Android cloud backup settings. Those need the Android SDK and a device,
and they are listed here as the work that is still open, not as something that
has been done.
