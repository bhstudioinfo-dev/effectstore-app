# Publish Audit 07 — Custom Effect Audit

## Exact flow

```text
home.js openPersonalEffectUpload()
→ IPC custom-effects:choose-files
→ extension and 500 MB limit
→ IPC custom-effects:save
→ ffmpeg VP9 WebM, 720×1280, 30 fps, max 15 s, no audio
→ thumbnail PNG + metadata.json in userData/custom-effects/custom-UUID
→ duration parsed from ffmpeg stderr
→ POST /api/user/custom-effects/register
→ User.customEffects metadata (localId/name/machineId/duration)
→ GET /api/user/effects and /api/tiktok/available-effects
→ local URL http://127.0.0.1:8080/custom-effects/.../effect.webm
→ preview/test/live through effect_player
```

## Validation matrix

| Check | Current behavior |
|---|---|
| accepted input | `.mp4`, `.mov`, `.avi`, `.webm` in Electron dialog/extension check |
| maximum size | 500 MB; >200 MB warning |
| MIME/magic validation | MISSING; extension plus ffmpeg decode only |
| codec support | whatever bundled ffmpeg can decode; output forced VP9 WebM |
| duration | parsed from ffmpeg diagnostic output after conversion, clamped to 15 s |
| duplicate filename | harmless; storage uses generated local ID |
| duplicate requested ID | `mkdirSync(... recursive:false)` fails rather than overwrite |
| thumbnail | generated from output; save fails/cleans directory if generation fails |
| broken file | ffmpeg failure cleans newly created directory |
| effect plan limit | backend register enforces 5/100/unlimited |
| local ownership | metadata belongs to authenticated user but bytes are machine-local |
| cross-user access | backend ownership enforced; local 8080 static route itself is unauthenticated |
| delete | removes local directory then server metadata/mappings; partial failure can desync |
| uninstall | NSIS preserves app data, so custom effects should remain |
| device/reinstall | no cloud restore; ID metadata may remain in DB without bytes |

## Why some custom effects cannot preview

Code-supported likely causes, in priority order:

1. **Known real-live regression:** real single mappings omit `effectUrl` and are rejected before playback. This affects purchased and custom single mappings.
2. **Port 8080 unavailable:** `startLocalServer()` has no `error` listener or recovery. If occupied, custom URLs fail while metadata still exists.
3. **Machine mismatch/stale DB metadata:** `User.customEffects.machineId` is stored but `resolveEffectForUser()` does not compare it to the current token machine. A second device can receive a valid-looking local URL for bytes that do not exist.
4. **Missing local directory/file:** the backend validates metadata ownership, not local file existence; the OBS player discovers failure only while loading.
5. **Duration recovery failure:** `readCustomEffects()` attempts to recover invalid duration and writes metadata, but entries with unreadable/missing metadata return `null`; register/queue rejects invalid duration.
6. **Loopback host separation:** OBS browser source must reach the same Windows host’s 8080 server. Firewall is unlikely for loopback but port/service lifecycle matters.
7. **Conversion compatibility/performance:** VP9 alpha output at 720×1280 may be expensive; source with unsupported codec fails conversion. Alpha is preserved only if source includes it.

There is no evidence that arbitrary original WebM is served: all accepted inputs are transcoded. No manual failing sample was supplied, so a specific codec root cause is **NOT VERIFIED**.

## Data integrity risks

- Save is local first, register second; if registration fails, UI attempts deletion, but a crash between steps leaves orphan bytes.
- Delete is local first and remote second; API failure leaves metadata pointing to deleted bytes.
- Server limit checks are not atomic across simultaneous registrations.
- Changing plan below the current count does not disable/delete excess effects; policy is undefined.

## Production readiness

**PARTIAL / P1.** The local-only product rule is implemented and clearly explained in UI, but machine enforcement, health checks, reconciliation, magic validation, atomic cleanup and end-to-end preview tests are required.

