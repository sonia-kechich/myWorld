# myWorld — Security notes (Stage 3)

This document describes how the vault protects your words, what it does **not**
protect against, and where the limits of a purely local design are.

Everything in myWorld lives on your device. There is no account, no server, no
telemetry. The app makes no `fetch`, `XMLHttpRequest` or `sendBeacon` call — a
test asserts this for the setup flow.

---

## 1. What is protected

| Data | Protection |
| --- | --- |
| Quotes, reflect messages, mood counters, XP, game count, settings | AES-256-GCM, sealed with the vault key, stored in IndexedDB |
| Vault configuration (salt, KDF parameters, label) | Public on purpose: it holds no secret |
| Authenticator secret (the TOTP seed) | AES-256-GCM, sealed with the vault key |
| Password verifier | AES-256-GCM, sealed with the vault key |
| Lockout counters, migration stamp | Plaintext on purpose: no secret, needed before the key exists |
| Backup file | Only ciphertext. Without the password it cannot be read |

The password itself is **never stored**. A sealed marker (`VerifierPayload`)
plays the role of a verifier: decrypting it with the derived key proves the
password was correct, and the ciphertext is authenticated, so a wrong password
cannot produce a false positive.

## 2. Keys and encryption

| Parameter | Value |
| --- | --- |
| Key derivation | PBKDF2, HMAC-SHA-256 |
| Iterations | 600 000 (OWASP 2023 recommendation for PBKDF2-SHA-256) |
| Salt | 16 random bytes per vault, stored in the vault config |
| Encryption | AES-256-GCM, 12 byte random IV per record, 128 bit tag |
| Additional data | `myworld\|<kind>\|<id>\|v1` |

The additional authenticated data binds every ciphertext to its record id and
kind. A record that is copied to another id, or moved to another kind, fails to
authenticate and is reported as damaged instead of being shown.

Every write uses a fresh IV, so writing the same value twice produces different
ciphertext. The key lives in memory only while the vault is unlocked, and
`lock()` drops the reference immediately.

## 3. The authenticator (second factor)

- TOTP, SHA-1, 6 digits, 30 second steps (the parameters every authenticator
  app supports).
- The setup QR code is drawn **on your device** with `react-qr-code`. No QR
  service, no third party API, no image request.
- A code is accepted within a 30 second tolerance around the current time.
- **Replay protection:** the time step of the last accepted code is stored
  inside the encrypted verifier, so it cannot be edited. A code from a step
  that was already used is refused ("That code was already used").
- **Expiry:** a code that was correct a moment ago but has rotated is reported
  as expired, which is a different message than "wrong code" on purpose.
- The code that creates the vault is not burned: the vault is created unlocked,
  and the owner may lock it again inside the same 30 second window. That code
  is still only good for one unlock, because the first unlock records it.

## 4. Recovery

Your **setup key** (the 32 character secret shown under the QR code) is your
recovery key. If you lose your phone you install your authenticator again,
type the setup key and your password, and you are back in.

The password is still required for recovery. There is no bypass, no default
code, no master password and no "forgot password" path, because a reset link
would have to travel through a server that does not exist.

**If you lose both the password and the setup key, the data is gone.** The
only remaining action is the explicitly labelled *Erase the vault*, which
deletes the database and cannot be undone. It is offered in two places (the
lock screen and the vault settings) and always asks for a confirmation first.

## 5. Rate limiting and lockout

Five wrong attempts in a row lock the vault for 30 seconds. Every further
failure doubles the wait, up to 15 minutes. The counter is stored in the
database in plaintext, so it survives a reload and cannot be reset by
reloading the page.

**Limitation:** this is a client-side control. It slows down a shared device
or a casual attempt; it does not stop an attacker who can run their own code
in the browser, clear the database, or patch the application. The real
protection for that case is the password plus the second factor, not the
timer. The same applies to the auto lock: it is a convenience for a device
left unattended, not a hardware lock.

Auto lock can be set to 1, 5 (default), 15 or 30 minutes, or switched off. The
choice is stored encrypted with the rest of the settings.

## 6. Storage and backups

- Database: `myworld`, version 2, with a `meta` store (vault config, lockout,
  migration stamp, whether the starter quotes were written) and a `records`
  store (the encrypted payloads).
- Every record is stored under the key **`[kind, id]`**, the kind and the id
  together. Version 1 of the database was keyed by the id alone, which let a
  record of one kind take the place of a record of another kind — a crafted
  backup with a quote that carries the id `settings` could overwrite the
  settings and lock the user out of their own vault. Version 2 moves the rows
  of version 1 into the compound key when the app is opened for the first
  time. Nothing else changes: the values, the AAD and the backup format stay
  the same, so the existing ciphertexts keep working.
- A backup is a file with the extension `.myworld`. It holds **only the user's
  content** — quotes, reflect messages, mood counters, XP, game count and
  settings — sealed with a password the user chooses **for the backup itself**.
- The backup password is *not* the vault password. The app never reuses the
  vault password for an export and never puts the vault key, the sealed
  authenticator or the TOTP seed into a backup. A backup that was copied
  around cannot be used to unlock the vault.
- Backup format (`myworld-export`, format version 1):

  | Part | Content |
  | --- | --- |
  | `kdf` | PBKDF2, HMAC-SHA-256, 600 000 iterations, 16 random bytes salt |
  | `manifest` | AES-256-GCM sealed, holds the record count, the kinds and the time of the export |
  | `records[]` | one AES-256-GCM ciphertext per record, 12 random bytes IV each |
  | AAD | `myworld-export\|<kind>\|<id>\|v1` and `myworld-export\|manifest\|v1` |

- The manifest is the first thing that is opened. If it fails, the password is
  wrong (or the file is damaged) and nothing is written. If the manifest opens
  but a record fails, the file was damaged after it was made. The additional
  data binds a ciphertext to its id and kind, so a record cannot be moved to
  another id or another kind without breaking the authentication.
- A restore is **all or nothing**: every record is checked (shape, kind, text
  length, timestamps, duplicates) before the first byte is written. One bad
  record refuses the whole file, and the vault keeps exactly what it had.
- Two ways to restore, both shown with a preview of what is in the file:
  - *Merge* — the newer record of the two wins, the vault keeps everything else.
  - *Replace* — the backup becomes the content of the vault. Before that
    happens, an encrypted copy of the current content is written **inside** the
    vault (`backup:latest`), so the replace can be taken back with *Put back
    the copy from the last restore*.
- The export is produced in the browser and handed to the browser as a
  download. It is not uploaded anywhere.
- A record that cannot be read (damaged ciphertext, or a record that does not
  belong to the vault key) is **not** in a backup. It is never dropped
  silently: it is named in the export, in the plan of a restore and in the
  result of a replace, so the user is told that the file does not hold
  everything. A *merge* leaves such a record where it is, a *replace* removes
  it, and how many were removed is reported.

### What a backup does not contain

The TOTP seed, the vault key, the password verifier, the vault password, the
backup password, the lockout counter and the recovery copy. A backup is a
container for content, not a second copy of the vault.


## 7. Migration from the old, unprotected version

The previous version of myWorld kept quotes, reflections and XP in
`localStorage` in plaintext. On the first unlock after this update:

1. everything the old version held is collected while it is still there,
2. an **encrypted copy of all of it** (the records, the raw `localStorage`
   values and the text that is not valid JSON) is written into the vault as
   `legacy:copy`, and that copy is read back to confirm it is there,
3. the plaintext records are sealed with the vault key and read back one by one
   to check that they arrived unchanged,
4. the old `localStorage` values are converted into sealed records,
5. only then are the plaintext sources deleted,
6. the applied version is stamped, so the migration never runs twice.

The order matters: the plaintext is only removed once the encrypted copy is
verified. If a step fails, the plaintext source stays where it was and the
migration can simply be run again. A copy that is already there is kept and
not overwritten, so a second run cannot empty it.

Nothing is thrown away on the way:

- text in the old `localStorage` that is not valid JSON is kept as it was,
  encrypted, in the copy,
- a record whose kind this version does not know is sealed under its own kind
  instead of being dropped,
- a row of the store that is neither a sealed record nor a record this version
  understands is kept in the copy and then removed, so no plaintext is left
  behind.

The copy stays inside the vault (encrypted, never part of a backup) until the
user erases it in the vault settings, where the button says what it does.

If you started from a fresh install there is nothing to migrate.

## 8. Content Security Policy

The production build injects a CSP into `index.html`:

```
default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none';
form-action 'none'; script-src 'self'; style-src 'self' 'unsafe-inline';
font-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'
```

No inline scripts, no `eval`, no foreign origin of any kind, fonts included:
the two fonts are part of the bundle (`src/assets/fonts/`), so the page never
asks a font host for anything. The dev server keeps its own setup, because hot
reloading needs inline scripts and a websocket.

## 9. Known limitations

- **JavaScript in the browser is trusted.** A malicious extension, an injected
  script, or a compromised dependency can read the key and the plaintext while
  the vault is open. The CSP and the absence of any network call reduce the
  surface, they do not remove it.
- **A key in memory while unlocked.** The vault key is held in memory between
  unlock and lock. Closing the tab or locking the vault ends that.
- **Clipboard and screen.** The setup key can be copied to the clipboard, and
  the code is visible on screen. A screenshot of the setup screen is as good
  as the key itself.
- **Physical access.** The database is encrypted, but the browser profile and
  the operating system account are not protected by myWorld. Use a device
  lock.
- **No sync, no multi device.** There is no cloud copy. Backups are manual.
- **Storage can be evicted.** When the vault is unlocked the app asks the
  browser for persistent storage (`src/storage/persistence.ts`), but the
  browser may refuse. It can then clear the whole database when the device is
  low on space, or the user can clear the site data. A backup file is the only
  copy that survives that.
- **Rate limiting is advisory**, see section 5.
- **The TOTP seed is the weak link** if an attacker can read the setup screen
  or the file system before it is sealed.

## 10. How this is tested

- `npm test` runs the whole suite (135 tests at the time of writing), `npm run
  lint` runs ESLint (TypeScript and React hooks) and `npm run typecheck` runs
  `tsc`. All three, plus the production build, run in CI on every push
  (`.github/workflows/ci.yml`):
  - crypto: key derivation, envelope format, tamper detection, AAD binding
  - authenticator: valid, wrong, expired, replayed codes
  - vault service: setup, unlock, wrong password, wrong code, lockout, recovery
    key, erase
  - storage: encrypted CRUD, corrupt records, records moved to another id,
    migration (the plaintext source stays where it was when a step fails, text
    that is not valid JSON is kept, a kind that is unknown is sealed under its
    own name, a copy that is already there is not overwritten), the encrypted
    copy of the old data, the key of a record (a record of one kind stays away
    from a record of another kind, the rows of the first database version are
    moved into the compound key)
  - backup: the portable format (round trip, wrong password, damaged file,
    moved record, duplicate ids, wrong version, too large), the import plan
    and the preview
  - import and restore: merge, replace, the recovery copy, undo, a wrong
    password changes nothing, a crafted backup cannot take the place of the
    settings or of the progress, a record that cannot be read is named and
    reported when a replace removes it
  - inactivity: the auto lock timer
  - hooks: the starter quotes are written once (removing them does not bring
    them back), two quotes added in the same moment get different ids, a quote
    that cannot be read is left out; the mood is counted from the messages and
    not from stored counters, a reflection that cannot be shown is left out,
    and a very long list of messages still gets a next id
  - settings: a failed auto lock change is reported, one button closes the
    session
  - app: no app content before the vault exists, setup flow, QR drawn locally,
    no network calls, lock and unlock, data survives a lock
  - offline: `index.html`, the font CSS and the CSP point at no other origin;
    the request for persistent storage is made once, a refusal is not an error
  - journey: the whole flow from the first run through a backup, a lock, a
    merge, a replace and the undo — plus the check that content of a backup is
    shown as text and never as markup, and that a broken record is named
