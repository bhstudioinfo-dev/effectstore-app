# Publish Audit 01 — Full Project Structure

Audit date: 2026-07-23. Mode: documentation only.

## Evidence convention

- **CONFIRMED BY CODE** means verified in the current checkout.
- **DOCUMENTATION OUTDATED** means an existing document describes an older implementation.
- **NOT VERIFIED** means no runtime/manual proof was available.

## Important tree

```text
effectstore-app/
├─ package.json                 root scripts and release gates
├─ scripts/                     localization/release validators
├─ admin/                       legacy standalone admin page
├─ backend/
│  ├─ index.js, server.js       backend entry and composition root
│  ├─ config/                   security, network, plans, runtime paths
│  ├─ middleware/               JWT/admin auth and in-memory rate limits
│  ├─ models/                   12 active Mongoose models
│  ├─ routes/                   auth/admin/effects/payment/OBS/TikTok/settings/banner
│  ├─ services/                 queue, playback, OBS, TikTok, media access, backup/migration
│  ├─ public/                   effect_player and gift-menu OBS pages
│  ├─ assets/                   bundled gift icons, sounds, frames
│  ├─ effects/encrypted/        local encrypted commercial media
│  ├─ uploads/                  local previews, thumbnails, layouts and assets
│  ├─ tests/                    node-based automated checks
│  └─ obs-controller.js,
│     obs-auto-setup.js         legacy/unwired OBS implementations
├─ desktop/
│  ├─ main.js                   Electron lifecycle, local media server, IPC
│  ├─ backend-manager.js        packaged backend child lifecycle/config
│  ├─ preload.js                renderer bridge
│  ├─ diagnostics.js            diagnostic redaction
│  ├─ package.json              electron-builder/NSIS configuration
│  ├─ renderer/index.html       main application shell
│  ├─ renderer/js/home.js       main UI controller
│  ├─ renderer/js/gift-menu-designer.js
│  ├─ renderer/js/{item-registry,coordinate-engine,
│  │  inspector-engine,shared-render-engine}.js
│  └─ renderer/styles/          application/designer styles
├─ frontend/overlay/            separate goal-board OBS overlay
├─ effects/                     sample/development media
├─ scratch/                     one-off patch scripts; not production
└─ docs/                        reference and publish-audit documentation
```

Dependency internals (`node_modules`) and binary font/media files were inventoried but are not expanded here.

## Entry points and ownership

| File/module | Role and dependencies | State | Risk | Production |
|---|---|---|---|---|
| `package.json` | Dispatches desktop/backend, test and release checks | active | medium | required |
| `desktop/main.js` | Electron `app`, `BrowserWindow`, IPC, ffmpeg, ports 8080/8081 | active + legacy local overlay | high | required |
| `desktop/backend-manager.js` | Starts `backend/server.js`, writes encrypted config/logs under Electron `userData` | active | high | required |
| `desktop/preload.js` | Exposes `getMachineId` and generic `electronAPI.invoke` | active | high | required but over-broad |
| `desktop/renderer/index.html` | Main UI and pricing; loads CDN assets plus local controllers | active | high | required |
| `desktop/renderer/js/home.js` | Auth/store/payment/admin/TikTok/OBS/TTS/mapping controller | active monolith | high | required |
| `desktop/renderer/js/gift-menu-designer.js` | Designer state, interaction, save/export | active monolith | high | required |
| `item-registry.js`, `coordinate-engine.js`, `inspector-engine.js`, `shared-render-engine.js` | Extracted designer contracts/engines | active with fallbacks | medium | required |
| `backend/index.js` | Loads environment then `server.js` | active | low | start script only |
| `backend/server.js` | Express/Mongo/WebSocket/service composition, ports 9000/9001 | active | critical | required |
| `backend/public/effect-player-overlay.html` | Single OBS effect source and completion handshake | active | high | required |
| `backend/public/gift-menu-overlay.html` | OBS menu renderer and queue fade behavior | active | high | required |
| `backend/public/shared-render-engine.js` | Browser-source copy of render engine | active duplicate artifact | high | required |
| `frontend/overlay/*` | Goal-board overlay | active but overlaps gift-menu goal widgets | medium | conditional |
| `backend/obs-controller.js`, `obs-auto-setup.js` | Alternate older source/timeline automation | legacy/unwired from `server.js` | high | no |
| `admin/index.html` | Root legacy admin UI | legacy | medium | no |
| `desktop/renderer/admin*.html`, `gift-coins-manager.html` | Standalone admin utilities | active/legacy mixed | high | conditional |
| `scratch/*.js` | Historical patch programs | unused operational residue | high | no |
| `backend/find_*`, `restore_*`, `update_*`, `sync_user_effects.js` | one-off database scripts | experimental/manual | high | no |

## Backend map

- Models: `User`, `Effect`, `Payment`, `GiftMapping`, `GiftMenuLayout`, `GiftLog`, `GiftConfig`, `EffectRequest`, `Banner`, `OBSSettings`, `License`, `SystemState`, plus `ChallengeWheel`.
- Routes: `auth.js`, `admin.js`, `effects.js`, `payment.js`, `tiktok.js`, `obs.js`, `settings.js`, `banner.js`.
- Services: `tiktokService`, `obsService`, `effectQueue`, `playbackManager`, `effectLibraryService`, `effectAccessToken`, `paymentService`, `databaseBackupService`, `schemaMigrationService`, `eventBus`.
- Middleware: `authMiddleware` reloads the user and rejects inactive accounts; `adminMiddleware` uses the server-derived admin flag; `createRateLimiter` is process-local.

## Storage and configuration

- Electron-owned writable data: `app.getPath('userData')`; custom effects are in `userData/custom-effects`, backend runtime data in `userData/backend-data`, logs in `userData/logs`.
- Development backend data defaults to the repository through `config/dataPaths.js`.
- Packaged backend configuration is `userData/backend-config.json`; secrets use Electron `safeStorage`.
- `.env` exists for development and is excluded by the build filter and Git tracking check. Secret values were not copied into this audit.
- `backend/uploads/temp` is payment/upload staging; `uploads/previews` contains clear WebM previews; `effects/encrypted` contains encrypted originals.
- No formal cache manifest/version directory exists.

## Build files

`desktop/package.json` configures Electron 28, electron-builder 24, NSIS x64-default behavior, backend `extraResources`, ffmpeg `asarUnpack`, and preserved app data on uninstall. `desktop/assets/icon.ico` is missing. No code-signing, publisher certificate, auto-update provider, minimum Windows version, or explicit architecture matrix is configured.

## Documentation reconciliation

- **DOCUMENTATION OUTDATED:** `PROJECT_MASTER_ANALYSIS.md` says insecure Electron flags and no migrations. Current `createWindow()` uses `nodeIntegration:false`, `contextIsolation:true`, `webSecurity:true`; `schemaMigrationService.runSchemaMigrations()` exists.
- **DOCUMENTATION OUTDATED:** old structure docs omit `ChallengeWheel`, `SystemState`, extracted designer engines, backend manager, diagnostics, backup service and protected effect-player routes.
- **CODE INCONSISTENT:** two local servers/queues remain: production backend 9000/9001 and deprecated desktop preview 8080/8081.

