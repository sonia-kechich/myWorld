# myWorld — Privacy audit

Date of the audit: 21 October 2026 (Stage 3).
Scope: the whole `src/` folder, `index.html`, the production build and the test
suite of this repository.

The short version: **myWorld has no account, no server and no analytics. Your
words never leave the device unless you carry them out yourself with a backup
file.**

---

## 1. What leaves the device

| Request | When | What is sent |
| --- | --- | --- |
| none | — | — |

The app makes **no request to any server**. The two fonts (Cormorant Garamond
and Karla) are part of the bundle: the `@font-face` rules in
`src/styles/fonts.css` point at `.woff2` files in `src/assets/fonts/`, so the
browser loads them from the app itself. There is no `<link>` to a font host
any more, and no script or stylesheet is loaded from anywhere else.

Checked and confirmed by reading the code and by the tests
(`src/__tests__/app.test.tsx`, "never talks to the network", and
`src/__tests__/offline.test.ts`, which fails if `index.html`, the font CSS or
the CSP ever points at another origin):

- no `fetch()`,
- no `XMLHttpRequest`,
- no `navigator.sendBeacon()`,
- no `WebSocket`, no `EventSource`,
- no analytics, no error reporting, no crash reporting, no telemetry,
- no service worker, no push messages, no background sync,
- no fonts or scripts loaded from a CDN,
- no third party script of any kind.

The production build adds a Content Security Policy that only allows this
origin (and `data:` images, see `docs/SECURITY.md`, section 8).
`connect-src 'self'` means the app itself cannot talk to a server at all.

**The one way data leaves the device:** the backup file. It is created in the
browser, handed to the browser as a download, and never uploaded. Where the
user puts that file afterwards is their decision, not the app's.

## 2. What is stored on the device

### IndexedDB, database `myworld`

| Store | Content | Plaintext? |
| --- | --- | --- |
| `meta` → `vault` | salt, KDF parameters, label, the sealed authenticator, the sealed verifier | the parameters are public on purpose, the two sealed parts are ciphertext |
| `meta` → `lockout` | failed attempts, until when the vault is locked | yes, it must be readable before the key exists, it holds no secret |
| `meta` → `migration` | the version stamp of the migration | yes, no secret |
| `records` | every record of the user | no, each one is sealed with AES-256-GCM under the vault key |

Records hold: settings, XP, reflect messages and mood counters, the mind game
counter and the quotes. The record id and its kind are used as additional
authenticated data, so they are visible in the database but bound to the
ciphertext.

### `localStorage`

The current version of myWorld **does not use `localStorage`**. The only keys
it ever touches are the three of the old, unprotected version
(`myworld.quotes`, `myworld.reflections`, `myworld.xp`), and only during the
one time migration, which deletes them only after the encrypted copy of the
old data is written and verified. If a step of the migration fails, the
plaintext stays where it was and the migration is tried again on the next
unlock.

### Persistent storage

When the vault is unlocked the app calls `navigator.storage.persist()`
(`src/storage/persistence.ts`). That asks the browser to keep the database
instead of clearing it when the device runs low on space. The call sends
nothing anywhere and a browser that says no changes nothing that the app does.

### Cookies, caches, service worker storage

None. The app never sets a cookie and never writes to the Cache API.

## 3. What is never stored, anywhere

- the vault password,
- the backup password,
- the vault key (it only lives in memory between unlock and lock),
- the TOTP secret in plaintext (it is sealed with the vault key; it is never
  written to a backup),
- a one time code after it was used (only the time step of the last used code
  is kept, sealed inside the verifier),
- the recovery copy and the copy of the old version in a backup file (they are
  internal kinds and never leave the vault).

## 4. Logs, console and crash reports

There is not a single `console.*` call in `src/`. A failed write is swallowed
on purpose (`writeQuietly` in `src/storage/vaultStore.ts`) so that a message
can never end up in a log, a crash report or a support screenshot. The
password, the setup key and the codes are never put into an error message
either; the errors carry a code and a text for the user.

## 5. Tracking of the user

None. There is no identifier, no install id, no device id, no "first seen"
date, no profile. The only data that exists is the data the user wrote, on
the device the user chose.

## 6. Deleting your data

- *Erase the vault* in the settings and on the lock screen deletes the whole
  IndexedDB database. It asks for a confirmation first.
- The copy of the old version can be erased on its own (*Erase the copy of the
  old version*).
- A backup file only disappears when the user deletes it, or when the device
  is wiped. myWorld cannot delete a file it does not own.

## 7. What the tests prove

- `src/__tests__/app.test.tsx` — the setup flow makes no network call at all.
- `src/__tests__/offline.test.ts` — `index.html`, the font CSS and the CSP
  point at no other origin.
- `src/__tests__/journey.test.tsx` — the whole flow, from the first run to a
  backup, a lock, a merge, a replace and the undo.
- `src/auth/__tests__/importRestore.test.ts` — a backup contains no
  authenticator secret, no recovery copy and no content in the clear.
- `src/backup/__tests__/portableBackup.test.ts` — the file is ciphertext, the
  manifest is authenticated, a record cannot be moved to another id, a wrong
  password and a damaged file are told apart.
- `src/storage/__tests__/persistence.test.ts` — the request for persistent
  storage is made once, is not repeated when the browser already keeps the
  data, and a browser without the API or with a refusal is not an error.

## 8. Known gaps

- A browser can still clear the storage when the device is low on space. The
  app asks for persistent storage, but the browser may refuse (private windows
  do), and a user who clears the site data deletes the vault on purpose.
- A browser extension with access to the page can read everything while the
  vault is open. No web app can prevent that.
- A backup file is only as safe as the place the user puts it. myWorld
  encrypts it, but a file on a shared computer is still a file on a shared
  computer.
