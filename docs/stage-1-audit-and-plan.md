# myWorld — Stage 1: Audit & Local-First Architecture Plan

> **Historical document.** This was written before Stage 2 and describes the
> app as it was then: no persistence, no vault, no tests, no lint. It is kept
> as the record of that audit and of the plan that followed it. For the current
> state of the app read `docs/SECURITY.md`, `docs/PRIVACY-AUDIT.md` and
> `docs/MOBILE-PACKAGING.md`.

Status: **review requested — nothing implemented yet**
Branch: `feat/stage-1-local-first` (baseline `main` @ `4c35664`)
Scope: audit of the real source, assessment of the Vault-Note reference, and a staged plan for password-gated, encrypted, device-only storage.

---

## 1. Audit of the current project

### 1.1 Shape of the codebase

| Area | Files | Notes |
| --- | --- | --- |
| Entry | `index.html`, `src/main.tsx` | Vite + React 18 + TS, `StrictMode`, `data-theme="dark"` hardcoded |
| Shell | `src/App.tsx` | Owns screen routing (`home`/`reflect`/`quotes`/`game`) and all state hooks |
| Screens | `src/components/{home,reflect,quotes,game}/*` | Pure presentational, props in / events out |
| State | `src/hooks/{useXp,useQuotes,useReflect,useMindGame}.ts` | All state is **React `useState` only** |
| Types | `src/types.ts` | `ScreenId`, `ReflectMode`, `RepeatOption`, `QuoteReminder`, `Quote`, `ReflectMessage`, `GamePhase` |
| Static data | `src/data.ts` | Level names, 10 reflection questions, repeat options, XP constants |
| Styles | `src/styles/{index,home,reflect,quotes,game}.css` | 1:1 port of the original `<style>` block |
| Legacy | `html.html` | Original single-file app, retained as the design source of truth |

Installed dependencies (`npm ls --depth=0`): **react 18.3.1, react-dom 18.3.1** (runtime) and **@types/react, @types/react-dom, @vitejs/plugin-react, typescript 5.9.3, vite 5.4.21** (dev). Nothing else. No test runner, no lint config, no CI.

### 1.2 Persistence — the headline finding

**There is none.** A grep across `src/` for `localStorage|sessionStorage|indexedDB|fetch(|XMLHttpRequest|document.cookie|CryptoKey|crypto.subtle|navigator.clipboard` returns **zero matches**.

Consequences:

- Every write is memory-only. A page reload discards **all** quotes, XP, reflect messages, and the session reflection count.
- The original `html.html` behaved identically (globals in a `<script>` block, no storage API), so nothing was lost in the React migration — **the migration is behaviour-complete**, including the absence of persistence.
- This is a functional gap rather than a regression, but it is exactly the gap Stage 2+ must close, and it means **there is no existing user data to preserve or migrate**.

### 1.3 Data flow (current)

```
App.tsx
 ├─ useXp()          xp:number (seed 35)         → level/progress derived, +5/+10/+15 events
 ├─ useQuotes()      quotes:Quote[] (2 hardcoded seeds) → add/delete/saveReminder/toggleReminder
 ├─ useReflect()     mode, messages:ReflectMessage[], typing, draft, mood counters
 └─ useMindGame()    phase, question index, doneCount
        │
        └──> screen components (Reflect / Quotes / Mind Game / Home)
```

All four hooks are instantiated **in `App.tsx`**, so state survives navigation between screens (React unmounts the screen component but not the hook). XP awards are wired through `useCallback` callbacks so that the *same* hook API keeps working once a persistence layer is added.

### 1.4 Entity inventory (what must eventually be stored)

| Entity | Current source | Type | Sensitivity | Notes |
| --- | --- | --- | --- | --- |
| `xp` | `useXp.ts` | `number` | low | Level/progress derived at render time |
| `quotes` | `useQuotes.ts` | `Quote[]` | **high** | Free text the user wrote; contains `reminder{time,repeat}` and `active` |
| `reflect messages` | `useReflect.ts` | `ReflectMessage[]` | **highest** | Self-talk text + sentiment (`pos`/`neg`) per message |
| `reflect mode` | `useReflect.ts` | `ReflectMode` | low | UI preference; also determines the mood metric |
| `mood counters` | `useReflect.ts` | two `ref`s + `moodPercent` | low | Derived metric (`pos/total`), currently seeded to a display of 50% |
| `game doneCount` | `useMindGame.ts` | `number` | low | "reflections this session" — session-scoped by nature |
| `question index` | `useMindGame.ts` | `number` + `prev` ref | none | Ephemeral; deliberately random, not worth persisting |
| seed quotes | `useQuotes.ts` | constant | n/a | "I am becoming who I'm meant to be." / "Every hard moment is building me." — source-code constants, not user data |
| greeting message | `useReflect.ts` | constant | n/a | "I'm here. What's on your mind?" |

### 1.5 Existing plaintext data

There is **no plaintext data at rest**. Every private string in the app currently lives only in RAM and dies with the tab. The only literal private-ish strings in the repo are the two seed quotes and the greeting, both plain TypeScript constants in `src/hooks/useQuotes.ts` and `src/hooks/useReflect.ts`.

Implication for the migration plan: there is nothing to decrypt-and-import, so **no plaintext→ciphertext conversion of existing user data is required**. What *is* required is a safe path for the moment persistence is switched on — see §5.1. The migration risk is therefore entirely about *future* writes, not about a legacy store.

### 1.6 Theme, navigation, design surface

- Dark-only by construction: `index.html` sets `data-theme="dark"`, and `src/styles/index.css` defines variables **only** under `[data-theme='dark']`. There is no light palette, no theme switcher, and no `prefers-color-scheme` handling.
- Navigation is a single `ScreenId` union in `App.tsx`; screens are conditionally rendered, each with a `fadeUp` entry animation.
- Design tokens: `--bg/--bg2/--phone/--s1/--s2/--b1/--b2/--tx/--tx2/--tx3/--acc/--acc2/--blue/--rose/--green/--gold`, one transition curve `--t`, fonts Cormorant Garamond + Karla, and 7 keyframe animations (`fadeUp`, `bubbleIn`, `slideIn`, `slideR`, `pulse`, `breathe`, `qFade`).

### 1.7 Design preservation — verified, not assumed

I captured both the legacy `html.html` and the React build in headless Chromium at 520×900 @2x, through 7 interaction states (home, reflect, reflect-with-message, quotes, quotes-with-reminder-picker, mind-game, mind-game-done), then pixel-diffed them:

| Screen | Diff inside phone | Diff full frame |
| --- | --- | --- |
| home | **0.000 %** | 0.016 % |
| reflect | **0.000 %** | 0.015 % |
| reflect-sent | **0.000 %** | 0.018 % |
| quotes | **0.000 %** | 0.018 % |
| quotes-picker | **0.000 %** | 0.020 % |
| mind-game | **0.000 %** | 0.016 % |
| mind-game-done | 0.460 % | 0.102 % |

Full-frame residue is the randomly-positioned star field (a different random seed per load) outside the phone. The `mind-game-done` residue is **antialiasing-level variance on the "Next question →" glyph edges** — a DOM audit of that screen shows identical element geometry (button rect `176.69, 538.5, 166.63×44`, text rect `209.69, 551.5, 100.63×18`), identical computed font/size/weight/style/colour, and identical animation names. It is text rasterisation, not a styling difference.

**Conclusion: layout, colours, icons, typography, animations and responsive behaviour are preserved.** The verification harness (Playwright + pixelmatch) was removed afterwards to keep the dependency tree minimal, per your constraint; the scripts are recoverable from the temp folder if you want a permanent visual-regression gate before Stage 2.

### 1.8 Risks / gaps in the current code

| # | Risk | Impact | Severity |
| --- | --- | --- | --- |
| R1 | No persistence at all | All user content lost on reload | High (functional) |
| R2 | No persistence → **no encryption, no access control, no backup** | The stated product goals are unimplemented | High (scope) |
| R3 | XP awards live in the hook, not the store | Any persistence layer must intercept the award path, or XP will drift | Medium |
| R4 | `useReflect` keeps counters in `useRef` (not state) | A store-backed refactor must convert these to state or persist the derived metric | Low |
| R5 | `useMindGame` deliberately randomises the question | Persisting the question would remove intended randomness — keep it ephemeral | Low |
| R6 | `tsconfig` has `noUncheckedIndexedAccess` + `strict` | New crypto/storage code must be written to that standard (already the case) | Low |
| R7 | No tests, no lint | Crypto code without tests is the highest-risk area in this project | Medium |
| R8 | External Google Fonts request | Every load leaks the user's IP/UA to Google; conflicts with "private entries never leave the device" in spirit | Medium |
| R9 | `crypto.subtle` requires a secure context | A future static build opened over plain `http://` (e.g. LAN IP) has **no** `crypto.subtle` → the vault must detect and report this | Medium |

---

## 2. Reference project assessment — byrishi/Vault-Note

Inspected: `README.md`, `SECURITY.md`, `LICENSE`, `package.json`, `vite.config.ts`, `index.html`, `App.tsx`, `types.ts`, `metadata.json`, `components/WriteEncrypt.tsx`, `components/DecryptView.tsx`, `services/cryptoService.ts`, and the full repository tree.

### 2.1 Facts

- **License:** Apache-2.0 (`LICENSE`, 6 693 bytes) — reuse permitted with attribution/notice. `BRANDING.md` states the branding/logo must not be reused.
- **Stack:** Vite + React 19 + TypeScript. Runtime dependencies: **react, react-dom only** (no crypto, no storage library). Consistent with "no unnecessary dependencies".
- **Crypto used:** `crypto.subtle` AES-GCM, 256-bit key, 96-bit random IV, `{ iv, ciphertext, version: 1 }` JSON envelope.
- **Storage used:** `localStorage` for **theme only**. **No IndexedDB.** Notes are never persisted — they exist in React state and leave only via a downloaded `.vault` file.
- **`SECURITY.md`** is a 265-byte vulnerability-disclosure policy. It contains **no threat model, no crypto rationale, no key-management guidance** — it is not a security specification.
- **External calls:** `index.html` loads `https://cdn.tailwindcss.com` (Tailwind Play CDN — executes remote JS at runtime), an `esm.sh` importmap for React, and Google Fonts. `App.tsx` links to an external status page. `vite.config.ts` shows a `GEMINI_API_KEY` define that was sanitised for the open-source release, i.e. the upstream product did have a vendor AI integration.

### 2.2 What to adopt (good patterns)

1. **AES-GCM with a fresh 96-bit random IV per encryption**, IV stored alongside ciphertext. Correct primitive, correct IV length, correct fresh-IV discipline.
2. **Version field inside the envelope** (`version: 1`) — the right instinct for future migrations.
3. **Self-contained encrypted file format** (`.vault`) with a JSON envelope, drag-and-drop import, and clear "this key is unrecoverable" UX.
4. **Zero runtime dependencies** for the crypto layer — Web Crypto primitives only.
5. **UI honesty about key custody** (their "Your Key, Your Responsibility" panel).

### 2.3 What must NOT be copied

1. **There is no passphrase.** The README advertises "zero-knowledge passphrase-based access", but `cryptoService.ts` has **no KDF at all**: `generateKey()` returns 32 random bytes from `getRandomValues`, displayed to the user as the "Decryption Key". Nothing is ever derived from a password. **Claim and implementation disagree** — this is precisely the gap myWorld must *not* inherit, since myWorld's requirement is explicitly password-based.
2. **`bufferToBase64` uses `String.fromCharCode(...bytes)`** — spread on a large array overflows the call stack (≈100 KB+ payload crashes it). myWorld must chunk the conversion.
3. **`importKey('raw', …, true, …)`** — the key is *extractable*, so any script in the page can export it. A password-derived key must be imported/derived with `extractable: false`.
4. **No AAD.** Ciphertext is not bound to a record identity or version, so ciphertext can be swapped between records and still decrypt. For a multi-record vault, bind AAD (record id + schema version).
5. **No key rotation, no re-encryption path, no migration logic** despite writing `version: 1`.
6. **No IndexedDB.** The reference does not solve local persistence at all — it is a reference for *envelope format and export UX*, not for storage.
7. **Runtime CDN scripts.** `cdn.tailwindcss.com` + `esm.sh` execute third-party JavaScript on every load, which breaks the "everything stays on your device" property. myWorld loads only a Google Fonts stylesheet today and should not regress from there.
8. **Tailwind + CDN + `esm.sh` importmap** are inconsistent with the existing myWorld design system (hand-written CSS variables, Cormorant Garamond/Karla). Adopting them would be a redesign.

### 2.4 Verdict

Use Vault-Note as a **reference for envelope shape, IV discipline and import/export UX only**. Implement the crypto layer independently against the Web Crypto spec, with a real KDF and AAD. Copying the service would import its missing-KDF defect, its extractable key, its unbounded base64 helper and its non-amplifying storage model. Apache-2.0 permits reuse with notice; I recommend a fresh ~150-line implementation, with attribution in a `docs/` note if any code is reused.

---

## 3. MDN guidance applied

### IndexedDB

- Asynchronous, transactional, structured-clone values; same-origin only; available in workers.
- Schema changes go through `onupgradeneeded` with a version number — this is the migration hook for both schema and data migrations.
- **Storage quotas and eviction are browser-controlled.** IndexedDB data *can* be evicted under storage pressure. For a vault this is a genuine data-loss vector → the plan requests `navigator.storage.persist()` and prompts the user to export backups.
- Web Storage (localStorage) is unsuitable for structured records and, more importantly, is a plain string store that makes accidental plaintext leakage easy. It will be used only for a tiny non-sensitive "vault configured" flag if at all.

### Web Crypto

- `crypto.subtle` **only exists in a secure context** (HTTPS or `localhost`). On `http://` non-localhost origins it is `undefined`. The vault must feature-detect and fail closed with a clear message; this also constrains deployment (static hosting over HTTPS, or local-only use).
- Available in workers → PBKDF2 key derivation can be moved off the UI thread (optional; a 600k-iteration PBKDF2 is ~200–600 ms and would visibly jank the unlock button otherwise).
- `CryptoKey` with `extractable: false` is the correct target for a password-derived key; `deriveKey` with `Pbkdf2Params` → `deriveKey` with `AesGcmParams` is the intended chain.
- MDN's own warning applies: Web Crypto is low-level and easy to misuse; the plan therefore treats the crypto module as the one part that gets dedicated tests and review.

---

## 4. Proposed architecture

Adapting your suggested responsibilities to the real project layout. New folders sit beside the existing `components/`, `hooks/` and `styles/` trees; **no existing UI file needs to change in Stage 1**.

```
src/
├── auth/                       NEW  — vault lifecycle & local authenticator
│   ├── vaultSession.ts              session state machine: unconfigured | locked | unlocked
│   ├── vaultConfig.ts               on-disk vault metadata types (kdf params, salt, verifier)
│   ├── authenticator.ts             local TOTP-style code issue/verify (HMAC-SHA-1, RFC 6238)
│   └── useVault.ts                  React binding for the session
├── crypto/                     NEW  — key derivation & authenticated encryption
│   ├── base64.ts                    chunked ArrayBuffer ⇄ base64 (no spread overflow)
│   ├── keys.ts                      PBKDF2 deriveKey (SHA-256), random salt, verifier
│   ├── aesgcm.ts                    encrypt/decrypt JSON payloads with AAD
│   └── envelope.ts                  versioned envelope type + encode/decode
├── storage/                    NEW  — IndexedDB persistence
│   ├── db.ts                        open/upgrade, versioned schema
│   ├── schema.ts                    object stores + record types
│   └── repositories.ts              typed CRUD for xp / quotes / entries / settings
├── backup/                     NEW  — versioned encrypted import/export
│   ├── exportVault.ts               build + download `.myworld` encrypted file
│   ├── importVault.ts               validate → decrypt → preview → apply
│   └── migrations.ts                data-migration chain for older envelope/schema versions
├── components/auth/            NEW  — lock / setup / authenticator UI (uses existing CSS tokens)
├── components/…                KEPT — unchanged
├── hooks/                      KEPT — same public API, now backed by the store
│   ├── useXp.ts, useQuotes.ts, useReflect.ts, useMindGame.ts
└── styles/                     KEPT — plus one new sheet for the lock screen
```

### 4.1 Crypto design

| Concern | Decision |
| --- | --- |
| KDF | PBKDF2-HMAC-SHA-256, 600 000 iterations (OWASP 2023 guidance), 16-byte random salt, `extractable: false` |
| Cipher | AES-GCM, 256-bit, fresh 96-bit IV per record, 128-bit tag |
| AAD | `recordId ‖ schemaVersion ‖ storeName` — binds ciphertext to its slot, defeating record swapping |
| Verifier | Decrypt a known-plaintext challenge rather than storing a password hash (avoids an offline password-verifier oracle) |
| Envelope | `{ v: 1, alg: 'AES-GCM', kdf: 'PBKDF2-SHA256', iterations, salt, iv, ct }` — self-describing, forward-migratable |
| Authenticator code | Local TOTP (RFC 6238): HMAC-SHA-1, 30 s step, 6 digits, secret stored encrypted under the vault key |
| RNG | `crypto.getRandomValues` / `crypto.randomUUID` only |

### 4.2 Storage design

Database `myworld`, version 1:

| Object store | Key | Contents | Encryption |
| --- | --- | --- | --- |
| `meta` | `name` | vault config: kdf params, salt, verifier, authenticator secret, createdAt, schemaVersion | metadata mostly plaintext (kdf params, salt, verifier are not secret); authenticator secret encrypted |
| `records` | `recordId` (uuid) | `{ kind: 'quote' | 'entry' | 'settings', ct, iv, createdAt, updatedAt }` | **always encrypted** |
| `blobs` (optional, later) | `id` | large payloads | encrypted, chunked if needed |

All writes go through `repositories.ts`, which encrypts on the way in and decrypts on the way out. React never sees ciphertext.

### 4.3 State integration (minimal churn)

The existing hooks keep their public signatures; only their internals change:

- `useQuotes()` → loads from `records` store on unlock, writes through `recordsRepo` on mutation.
- `useXp()` → xp persisted as a `settings` record; the award callbacks stay the same.
- `useReflect()` → messages persisted as `entry` records; mode and mood counters persisted alongside.
- `useMindGame()` → **deliberately stays ephemeral** except `doneCount`, which may be session-scoped.

Components under `src/components/` need **no changes** — they receive plain props exactly as today. That is how "design preserved" is guaranteed through the refactor.

### 4.4 Enforcing "private entries never leave the device"

Add a strict CSP to `index.html` (headers in `vite.config.ts` for dev/preview):

```
default-src 'self';
script-src 'self';
style-src 'self' https://fonts.googleapis.com;
font-src https://fonts.gstatic.com;
img-src 'self' data: blob:;
connect-src 'self';
object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'
```

`connect-src 'self'` makes any accidental `fetch()`/`XHR`/`WebSocket` to a third party fail loudly in the console rather than silently exfiltrate. Optionally self-host the two fonts to remove the Google request entirely (see open question Q5).

---

## 5. Safety, data-loss risks, and delivery

### 5.1 Data-loss risks to control

| Risk | Mitigation |
| --- | --- |
| L1 — First encrypted write destroys the only copy of a record | Write→read-back→decrypt→verify→**then** delete the plaintext copy, inside one transaction; keep a plaintext backup until the first successful verified export |
| L2 — Half-migrated database after a crash mid-migration | Migrations are idempotent, version-stamped, and guarded by a `migrations` log in `meta`; re-running a completed migration is a no-op |
| L3 — Browser evicts IndexedDB under storage pressure | Request `navigator.storage.persist()`; show a "backup your vault" prompt; treat export as the user's safety net |
| L4 — User forgets the password | No recovery path by design (zero-knowledge). The UI must say so clearly at setup — Vault-Note's "your key is unrecoverable" panel is the right pattern |
| L5 — Wrong password silently decrypts to garbage | AES-GCM authentication failure must surface as an explicit "wrong password" error, never as empty data |
| L6 — Structured-clone rejects non-serialisable values | Store only plain JSON-safe records; never persist `CryptoKey`, `Date` (use ISO strings), functions or class instances |
| L7 — Storage API unavailable / private mode | Feature-detect `indexedDB` and `crypto.subtle`; fail closed with a clear screen, never silently fall back to unencrypted storage |
| L8 | *(Current behaviour, to be changed deliberately)* Refresh loses everything | Persistence is enabled only after the vault is unlocked, so the pre-vault experience stays exactly as today |

### 5.2 Rollback point (done)

- `git init` in `C:\Users\sonia\OneDrive\Desktop\myWord v1`.
- `main` @ **`4c35664`** — pristine baseline: the React+TS migration, unmodified.
- `feat/stage-1-local-first` — created from that commit and checked out; **all Stage 1+ work happens here**.
- `main` is never touched again, so `git checkout main` restores the exact current state at any time.
- `html.html` is committed so the legacy design reference travels with the repo.

### 5.3 Dependencies actually needed

**Runtime: none.** Web Crypto (`PBKDF2`, `AES-GCM`, `HMAC`) and IndexedDB are platform APIs. No `idb`, no `crypto-js`, no auth library — this mirrors the reference project's discipline and keeps the bundle at ~50 kB gzipped.

**Dev (optional, recommended):**

| Package | Why | Alternative |
| --- | --- | --- |
| `vitest` (+ `@vitest/coverage-v8`) | Crypto/storage correctness needs a runner | Node 22's built-in `node:test` — **zero dependencies**, and `globalThis.crypto` (WebCrypto) is already available in Node 22, so the crypto module is testable with no extra packages |
| `fake-indexeddb` | Only needed to test IndexedDB paths outside a browser | Exercise the DB in the real browser via a Playwright smoke test instead |

**Recommendation:** start with Node's built-in test runner (`node --test`) — zero new dependencies — and add `fake-indexeddb` only if IDB unit tests are wanted later.

### 5.4 Security limitations of a purely local authenticator (must be disclosed in-product)

1. **It is not a true second factor.** The authenticator secret and the verifier live in the same browser profile as the vault. Anyone who can read the profile (malware, a stolen device, a devtools console) can extract the secret and mint valid codes forever. A server-side TOTP keeps the secret off the client; a local one cannot.
2. **It does not defend against device compromise.** The local code raises the cost of casual access (shoulder-surfing, a curious family member, an unlocked laptop), not a determined attacker with the device.
3. **It depends on the device clock.** Local TOTP has no server time to sync against; clock drift or timezone changes can make valid codes fail.
4. **Rate-limiting is voluntary.** Without a server, brute-force protection is only what the client enforces — trivially bypassed by an attacker who can patch the app. Only meaningful protection comes from PBKDF2's work factor on the password.
5. **No revocation.** Losing the device means losing the vault (unless the user exports); you cannot remotely revoke a local authenticator.
6. **XSS is still game over.** Any script injected into the origin can call `crypto.subtle` with the unlocked key and read plaintext. CSP (`script-src 'self'`, no inline scripts, no CDN) is the real mitigation — which is why §4.4 matters, and why the reference project's CDN-script pattern is unacceptable here.
7. **It cannot distinguish "the user" from "anyone holding the device"** — a local authenticator proves knowledge, not identity. Treat it as a session-lock speed bump, not authentication.

---

## 6. Staged implementation plan (file by file)

Nothing below has been executed. Each stage is a separate commit on `feat/stage-1-local-first`.

### Stage A — Foundations, no behaviour change
| File | Action | Purpose |
| --- | --- | --- |
| `src/crypto/base64.ts` | new | chunked ArrayBuffer ⇄ base64, UTF-8 safe |
| `src/crypto/envelope.ts` | new | `Envelope` type, `v1` encode/decode, forward-compatible parse |
| `src/crypto/keys.ts` | new | `deriveVaultKey` (PBKDF2-SHA256, 600k), `randomSalt`, verifier challenge |
| `src/crypto/aesgcm.ts` | new | `encryptRecord` / `decryptRecord` with AAD binding |
| `src/storage/db.ts` | new | open/upgrade `myworld` DB, version handling |
| `src/storage/schema.ts` | new | store definitions + record types |
| `src/storage/repositories.ts` | new | typed CRUD (`xp`, `quotes`, `entries`, `settings`) |
| `src/crypto/__tests__/*.test.ts` | new | KDF, AAD swap-rejection, IV uniqueness, round-trip, wrong-password error |
| `src/App.tsx` | **no change** | verify existing behaviour still passes |

### Stage B — Vault lifecycle + authenticator
| File | Action |
| --- | --- |
| `src/auth/vaultConfig.ts` | new — vault metadata types + defaults |
| `src/auth/vaultSession.ts` | new — `unconfigured → locked → unlocked` machine |
| `src/auth/authenticator.ts` | new — local TOTP issue/verify |
| `src/auth/useVault.ts` | new — React binding |
| `src/components/auth/SetupScreen.tsx` | new — create vault (password + confirm) |
| `src/components/auth/LockScreen.tsx` | new — unlock + authenticator code |
| `src/styles/auth.css` | new — uses only existing tokens |
| `src/App.tsx` | modified — gate the existing screens behind the session; **screens themselves untouched** |

### Stage C — Data migration into the vault
| File | Action |
| --- | --- |
| `src/storage/migrate.ts` | new — version-stamped, idempotent migration runner |
| `src/hooks/useQuotes.ts` | modified — read/write through `recordsRepo` |
| `src/hooks/useXp.ts` | modified — persist xp via `settings` record |
| `src/hooks/useReflect.ts` | modified — persist messages/mode/counters |
| `src/hooks/useMindGame.ts` | modified — persist `doneCount` only |
| `src/components/*` | **no change** |

### Stage D — Encrypted export / import
| File | Action |
| --- | --- |
| `src/backup/migrations.ts` | new — envelope/data migration chain |
| `src/backup/exportVault.ts` | new — encrypted `.myworld` file, version-stamped envelope |
| `src/backup/importVault.ts` | new — validate → decrypt → preview → apply (replace or merge) |
| `src/components/quotes/*` / new `src/components/settings/*` | new — export/import entry point, styled with existing tokens |

### Stage E — Hardening & documentation
| File | Action |
| --- | --- |
| `index.html`, `vite.config.ts` | CSP headers, meta theme colour |
| `src/styles/index.css` | self-host fonts (optional, Q5) |
| `docs/SECURITY.md` | threat model, KDF parameters, recovery story, known limitations (§5.4) |
| `README.md` | local-first architecture, offline usage, backup discipline |

---

## 7. Open questions before Stage A

1. **Q1 — Password or random vault key?** Vault-Note uses a random key and never a password, so it does not answer this. Password-based (PBKDF2) is what you asked for and gives human-memorable access; the cost is that a weak password is weak. Recommendation: password + PBKDF2, with an explicit strength warning.
2. **Q2 — Is the authenticator code required at every unlock, or optional/secondary?** It adds friction and a clock dependency (Q4 in §5.4). Recommendation: required on first unlock of a session, optional afterwards.
3. **Q3 — Should the authenticator be TOTP-style (6-digit, 30 s) or a simple longer code?** Recommendation: TOTP, but confirm.
4. **Q4 — Deployment target?** `crypto.subtle` requires HTTPS/localhost. Is myWorld a local-only app (opened from `localhost` / installed PWA), or a static HTTPS host? This decides whether we need a service worker for true offline use.
5. **Q5 — Self-host the two Google fonts?** Keeps the design identical but removes the only external request, so "nothing leaves the device" becomes literally true. Recommend yes; needs the woff2 files fetched once at build time.
6. **Q6 — Should the two seed quotes remain visible before the vault is set up?** They are currently constants; I propose they stay visible on first run and become encrypted user data only once the user edits them.
7. **Q7 — Should Reflect messages be persisted at all?** They are the most sensitive content. Persistence is what makes them useful long-term, but it also puts them at rest. Recommendation: persist, encrypted, with a per-entry "delete" affordance.
8. **Q8 — Import conflict policy:** replace the whole vault, or merge by record id? Recommendation: offer both, defaulting to merge with a preview.

---

## 8. Current state of the repository

```
main                    4c35664  pristine baseline (React+TS migration, unmodified)
feat/stage-1-local-first *         checked out, == main; Stage A+ work lands here
```

No authentication, encryption, storage, import or export has been implemented. The application behaves exactly as it did before this audit — same design, same in-memory behaviour, same dark-only theme.
