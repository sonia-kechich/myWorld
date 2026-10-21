# myWorld — Security notes (Stage 2)

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

- Database: `myworld`, version 1, with a `meta` store (vault config, lockout,
  migration stamp) and a `records` store (the encrypted payloads).
- Backups are files with the extension `.myworld`. They contain the KDF
  parameters, the sealed verifier, the sealed authenticator and the still
  encrypted records — never plaintext.
- Importing verifies the password, decrypts every record, and only then
  replaces the vault on the device. A damaged file is refused and the device
  keeps its current vault.
- The export is produced in the browser and handed to the browser as a
  download. It is not uploaded anywhere.

## 7. Migration from the old, unprotected version

The previous version of myWorld kept quotes, reflections and XP in
`localStorage` in plaintext. On the first unlock after this update:

1. plaintext records are sealed with the vault key,
2. the old `localStorage` values are converted into sealed records,
3. the plaintext sources are deleted,
4. the applied version is stamped, so the migration never runs twice.

If you started from a fresh install there is nothing to migrate.

## 8. Content Security Policy

The production build injects a CSP into `index.html`:

```
default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none';
form-action 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'
https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com;
img-src 'self' data:; connect-src 'self'; manifest-src 'self'
```

No inline scripts, no `eval`, no connections to any origin other than the font
host that the original design already used. The dev server keeps its own setup,
because hot reloading needs inline scripts and a websocket.

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
- **Rate limiting is advisory**, see section 5.
- **The TOTP seed is the weak link** if an attacker can read the setup screen
  or the file system before it is sealed.

## 10. How this is tested

- `npm test` runs the whole suite (75 tests at the time of writing):
  - crypto: key derivation, envelope format, tamper detection, AAD binding
  - authenticator: valid, wrong, expired, replayed codes
  - vault service: setup, unlock, wrong password, wrong code, lockout, recovery
    key, erase
  - storage: encrypted CRUD, corrupt records, records moved to another id,
    migration
  - backup: export, import, wrong password, damaged file
  - inactivity: the auto lock timer
  - app: no app content before the vault exists, setup flow, QR drawn locally,
    no network calls, lock and unlock, data survives a lock
