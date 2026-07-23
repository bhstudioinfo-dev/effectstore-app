# Publish Audit 02 — Application Runtime Flow

## Exact startup

```text
EffectStore.exe / electron .
→ desktop/main.js obtains single-instance lock
→ app.whenReady()
→ startManagedBackend()
→ existing http://127.0.0.1:9000 health check OR child utilityProcess.fork backend/server.js
→ backend validates JWT secret, creates runtime directories, starts Mongo connection
→ backend starts WebSocket :9001, connects OBS, mounts routes, listens HTTP :9000
→ Electron polls /api/system/status (backend readiness, then up to 5 s for DB)
→ createWindow() loads renderer/index.html
→ renderer constructs EffectStoreApp and restores localStorage token
→ GET /api/auth/me
→ UI loads marketplace/library/status; TikTok connects only on user action
→ active menu layout is fetched by designer/overlay routes when those views run
```

Evidence: `desktop/main.js` functions `getManagedBackendOptions`, `waitForDatabaseConnection`, `createWindow`; `desktop/backend-manager.js` functions `backendHealthCheck`, `startManagedBackend`; `backend/server.js`; `home.js` methods `init`, `checkAuth`, `loadEffects`, `connectWebSocket`.

## Processes and ports

| Owner | Port | Purpose |
|---|---:|---|
| backend child | 9000 | Express API, static media and OBS pages |
| backend child | 9001 | authenticated user/overlay WebSocket |
| Electron main | 8080 | deprecated local preview plus unauthenticated custom-effect static files |
| Electron main | 8081 | deprecated local preview WebSocket |
| OBS | 4455 default | OBS WebSocket |
| MongoDB | URI-defined | database; local default 27017 |

All listeners bind loopback by default except a configured MongoDB service. **CONFIRMED BY CODE.**

## Startup and recovery behavior

- Duplicate app: `app.requestSingleInstanceLock()` quits the second process and focuses the first.
- Existing backend: `startManagedBackend()` accepts any reachable service whose `/api/system/status` responds; it does not authenticate the service or verify its app version.
- Backend timeout: child gets 15 seconds to become HTTP-reachable. MongoDB readiness is not required for `listen()`.
- Mongo unavailable: Express/WebSocket/OBS still start; `/api/system/status` returns 503. Electron still opens the renderer after displaying only a backend-start exception (not a DB-readiness exception). The UI presents database setup.
- Port 9000 occupied: if a foreign service passes neither status parsing nor health semantics, child startup eventually fails; if it imitates the status route it may be trusted. Port 9001 failure is logged and WebSocket is disabled while HTTP continues.
- OBS closed: `obsService.connect()` fails and starts a five-second interval reconnect. UI/API remains available; playback routes return 503 or live processing skips.
- TikTok connection failure: `TikTokService.connect()` reports failure and schedules reconnect while `lastRoomId` remains. Attempts back off through its reconnect state. Manual smoke test is **NOT VERIFIED**.
- Internet unavailable: local app/backend/OBS can start, but TikTok, payment QR image, remote CDN scripts/styles and any remote Mongo URI fail. The main HTML depends on cdnjs for CryptoJS and Font Awesome.
- Token expiry: `/api/auth/me` returns 401; `home.js.checkAuth()` removes `localStorage.token` and shows login. WebSocket reconnect loops every three seconds with the expired token until UI state changes.
- Close during playback: `before-quit` sends SIGTERM and backend performs graceful shutdown; queue is memory-only and is lost. The OBS effect_player may retain its last DOM until its own timeout or browser source closes.
- Backend crash: no supervisor restart is implemented after the child exits. `main-error.log` covers Electron exceptions, while backend stdout/stderr goes to rotated `logs/backend.log`.

## Authentication restore and initialization gaps

The renderer stores a seven-day JWT in `localStorage` (`home.js` login/register/checkAuth). No refresh token exists. Startup does not automatically reconnect TikTok from saved username; settings preserve a flag but current `init()` behavior requires user flow confirmation. OBS connects in the backend before renderer auth and uses environment defaults rather than the database `OBSSettings` record until a settings save/reconnect.

## Shutdown

Electron closes 8080/8081 and unregisters shortcuts on `window-all-closed`. `before-quit` waits up to five seconds for the managed backend. Backend `gracefulShutdown()` closes heartbeat, clients, WebSocket, OBS, TikTok, HTTP and Mongoose, with a ten-second force exit. If Electron reused an already-running backend, it owns no child and does not stop it.

## Documentation reconciliation

- **DOCUMENTATION OUTDATED:** older docs say Electron starts without the backend; `desktop/backend-manager.js` now bundles and starts it.
- **DOCUMENTATION OUTDATED:** older docs claim permissive BrowserWindow security.
- **CODE INCONSISTENT:** a DB-independent HTTP “healthy” state lets the window open even though almost every customer feature requires MongoDB.
- **RELEASE BLOCKER:** default packaged configuration points to local MongoDB. The installer does not bundle MongoDB and no production cloud service is configured.

