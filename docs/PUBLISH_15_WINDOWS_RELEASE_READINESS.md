# Publish Audit 15 — Windows Release Readiness

Audit only; no installer was built.

## Packaging state

`desktop/package.json` uses Electron 28 and electron-builder/NSIS. It includes renderer/assets, backend manager/diagnostics/preload, ffmpeg unpacking, the backend as `extraResources`, and goal overlay resources. Runtime uploads, tests, scripts and `.env` are excluded. NSIS preserves app data on uninstall.

## Checklist

| Item | State |
|---|---|
| packaged backend | configured and backend-manager tests pass |
| production secrets | generated/protected in `backend-config.json`; remote service secrets not provisioned |
| development URLs | hardcoded loopback is intentional for local runtime; central API split missing |
| MongoDB | external dependency; local default, not bundled |
| native modules | ffmpeg static unpack configured; clean-machine verification missing |
| writable paths | `userData` backend/custom/logs paths implemented |
| bundled static files | configured; actual build not verified |
| icon | `desktop/assets/icon.ico` missing; release validator warns |
| name/version | EffectStore 1.0.0; root/desktop/backend aligned |
| publisher | generic EffectStore; no verified legal publisher identity |
| code signing | MISSING |
| installer | NSIS configured, not built/tested |
| uninstall | preserves app data; removal behavior not manually verified |
| custom preservation | under userData, expected preserved |
| auto-update | NOT IMPLEMENTED |
| rollback | Git/release process only; no customer rollback |
| crash logs | main-error and backend log; no crash reporter |
| first run | DB URI + admin bootstrap UI exists |
| firewall | loopback servers; external Mongo/TikTok; instructions missing |
| OBS instructions | partial UI/docs, no packaged onboarding proof |
| minimum Windows | not declared |
| architecture | default electron-builder target, no explicit x64/arm64/ia32 matrix |
| antivirus | no signing/reputation/test evidence |

## Development-only assumptions

- Local MongoDB default makes first-run unusable on a normal customer machine unless a URI is supplied.
- Effects/templates/media in the repository are development/admin-machine assets, not a distribution service.
- Remote cdnjs dependencies can make icons/scripts unavailable offline.
- One-off backend scripts and legacy admin pages are in the repository; backend resource filter does not explicitly exclude every manual script outside `scripts/`.
- Backend dependencies are copied wholesale; package size/license/native compatibility must be verified.
- `desktop/main.js` starts 8080/8081 legacy servers even though production mapping uses 9000/9001.

## Release gates

Central production architecture, signed media distribution, live mapping regression fix, preview security fix, production Mongo/API configuration, application icon/branding, code signing, auto-update/rollback, clean Windows VM install, OBS/TikTok smoke test and antivirus scan are mandatory before public distribution.

**Status: NOT READY / P0.**

