# Publish Audit 05 — Purchased Effect Security

## What protection is real

- `encrypt-video.js` encrypts uploaded commercial media with AES-256-CBC; production configuration requires a nontrivial encryption password.
- Catalog responses remove filesystem paths and issue short-lived JWT stream URLs.
- `effectAccessToken.verifyEffectAccessToken()` binds token to effect ID, user ID and allowed purpose.
- Library/test/live effect-player routes call `resolveEffectForUser()` for ownership.
- `/uploads/previews` and `/uploads/effects` are explicitly blocked before the general `/uploads` static route.
- Stream responses set `Cache-Control: private, no-store`.
- Admin routes use server-derived JWT/admin middleware.

These controls prevent casual unauthenticated direct access to the encrypted file and stop cross-user library playback by changing an ID.

## Findings

| Severity | Weakness | Evidence and impact |
|---|---|---|
| CRITICAL | Catalog “preview” is a clear copy of the full uploaded file | `routes/effects.js` admin upload copies `effectFile.path` directly to `previewsDir` and `streamEffectById()` serves that clear file before encrypted fallback. `sanitizeEffectForCatalog()` gives every authenticated user a `catalog-preview` token. If the uploaded file is the sold effect, any registered account can capture the complete WebM stream without purchase. |
| HIGH | Protection terminates in a renderer-visible HTTP URL | `effectLibraryService.addProtectedMediaUrl()` and effect-player payloads place bearer-like query tokens in URLs. A local user can inspect network traffic or instrument the renderer/OBS. No client-side DRM can prevent determined capture. |
| HIGH | Static overlay tokens never expire | `networkSecurity.getOverlayAccessToken()` is a deterministic HMAC embedded in OBS source URLs. A leaked URL remains valid until `JWT_SECRET` changes. |
| HIGH | Local custom effects are unauthenticated | `desktop/main.js.startLocalServer()` serves `/custom-effects` on loopback without a token. This matches user ownership/local-only requirements but any local process/browser can read them. |
| MEDIUM | Legacy OBS purpose bypasses ownership | `authorizeEffectStream()` excludes `legacy-obs-effect` from ownership resolution. Access needs a signed token plus one-time OBS trigger page token, limiting remote abuse, but this rollback path expands attack surface. |
| MEDIUM | Absolute media paths are stored in MongoDB | `Effect.previewFilePath`, `encryptedFilePath`, `thumbFilePath` leak host layout to DB readers/admin responses unless sanitized. Catalog sanitizes them; admin effect responses do not. |
| MEDIUM | No key rotation/product keys | One application encryption password protects all files; no key ID, per-product key, revocation, or re-encryption plan exists. |
| MEDIUM | No integrity/authentication on ciphertext | AES-CBC provides confidentiality but no authenticated tag. There is no media checksum/manifest validation. |
| LOW | Browser/disk cache cannot be proven absent | `no-store` is set, but OBS/Electron/OS buffers and user capture are not audited. No claim of memory-only decryption can be made. |

## Direct URL and cross-user checks

- `/api/stream/effect/:effectId` requires a signed token; **CONFIRMED**.
- Library/test/live purposes re-check current ownership; **CONFIRMED**.
- Catalog purpose requires only an active catalog item, by design; coupled to the full clear preview this is the critical leak.
- Token default lifetime is five minutes (catalog ten minutes); **CONFIRMED**.
- No raw encrypted path is returned in the customer catalog; **CONFIRMED**.
- Admin can access/upload/delete all products; expected but no audit log exists.

## Planned versus implemented

Private object storage, encrypted client cache, per-product keys, signed manifests, device-bound sessions, checksum/version validation and remote revocation appear only in `COMMERCIAL_CLOUD_ROADMAP.md`. They are **MISSING**, not partially deployed.

## Required release treatment

Before paid release, separate a deliberately limited preview asset from the purchased payload; never copy the sale file as the public/authenticated preview. Commercial bytes should remain ciphertext outside the authorized local streaming process, with short-lived user/device/product sessions and integrity validation. Avoid claiming absolute DRM; the realistic target is preventing easy raw-file copying.

