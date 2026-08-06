# Cloud effect streaming

Customer installations are online-only for purchased cloud effects.

## Security boundary

- The central server owns `ENCRYPTION_PASSWORD`, encrypted object storage, and
  the decrypted streaming operation.
- Electron and its local backend never receive the central encryption
  password.
- The local backend keeps the current cloud user token in process memory only.
  It is not written to `backend-config.json`, logs, diagnostics, or MongoDB.
- Catalog entries do not receive a video preview URL unless the account
  already owns the effect or is an administrator.
- The central server rechecks ownership before streaming library playback.
- Responses use `Cache-Control: private, no-store`.

## Runtime flow

1. Login or an authenticated `/api/auth` response is proxied to the cloud.
2. The local backend mirrors non-secret user metadata and retains the bearer
   token in RAM for the running session.
3. OBS, TikTok, or the desktop requests a protected local effect URL.
4. The local backend validates its local capability token.
5. In cloud mode it requests the matching central stream using either:
   - an RS256 catalog capability issued by the central server; or
   - the in-memory user session for owned playback.
6. The central server validates the token and entitlement, decrypts the asset,
   and streams it over HTTPS.
7. The local backend pipes the response without caching cloud media.

After an app/backend restart, the customer may need to sign in again before
playing purchased effects. Custom effects stored on the user's own computer
are unaffected.

## Deployment requirements

- `CLOUD_API_URL` must use HTTPS.
- Configure `ENCRYPTION_PASSWORD` only on the central server.
- Configure the RS256 keys according to `CLOUD_JWT_KEY_MIGRATION.md`.
- Do not configure `LIVEFLOW_SHARED_ENCRYPTION_PASSWORD` on customer builds.
- Keep the object-storage bucket private.

## Required smoke tests

- Owned effect plays through desktop, OBS, and a real TikTok gift.
- Unowned effect returns 403 and has no full-video preview URL.
- Logout/restart removes usable in-memory access until the next login.
- Invalid/expired RS256 and local capability tokens fail.
- Cloud outage produces a controlled playback error and does not fall back to
  an old shared-key cache.
- Installer resources contain neither the private JWT key nor the central
  encryption password.
