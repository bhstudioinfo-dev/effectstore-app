# Publish Audit 09 — OBS Production Readiness

## Confirmed implementation

- `OBSService.connect()` uses `obs-websocket-js`, records the last host/port/password and retries every five seconds after close/failure.
- On `Identified`, it calls `ensureEffectPlayerSource()` and `ensureGiftMenuOverlaySourceUrl()`.
- `ensureEffectPlayerSource()` creates scene `EffectStore` and browser input `effect_player` at 1080×1920/30 fps or updates its URL.
- `/api/obs/setup-gift-menu` creates/updates `gift_menu_overlay` (or legacy `gift_menu`) using layout export dimensions and 60 fps.
- `/api/obs/repair-sources` recreates missing effect_player/gift menu sources.
- `/api/system/status` reports connection and source existence.

This is a real self-healing/repair foundation. The UI method `repairOBSSources()` presents “Khôi phục nguồn OBS” semantics. It is not a full scene/profile reconciliation system.

## Readiness matrix

| Concern | State |
|---|---|
| WebSocket connect/reconnect | implemented |
| password handling | plaintext in global `OBSSettings`; API GET returns it |
| source create/update | implemented |
| missing source repair | implemented |
| renamed source repair | creates canonical replacement; old renamed source remains |
| duplicate prevention | name-based in fixed `EffectStore` scene |
| scene selection | hardcoded `EffectStore`; user cannot choose target |
| browser URLs | loopback with static overlay token |
| dimensions | effect 1080×1920; menu derives export size |
| refresh/cache | menu URL timestamp + refreshnocache; static pages no-store |
| source visibility | effect_player stays present; video DOM becomes transparent |
| OBS restart | reconnect then ensure sources |
| app restart | reconnect and update canonical URLs |
| multiple profiles | not modeled |
| multiple scenes | canonical sources only in `EffectStore` |

## Break scenarios

- User changes OBS WebSocket port/password without saving settings.
- User renames/moves canonical sources; repair creates new sources in `EffectStore`, possibly duplicating visual output.
- User deletes `EffectStore` or source while playback is active.
- Port 9000/9001 is unavailable or OBS cannot reach loopback.
- Static overlay token in source URL is stale after JWT secret/config reset.
- User expects playback in their current scene but has not added/nested the `EffectStore` scene.
- Multiple Windows users/profiles or multiple OBS instances are not selectable.
- OBS CEF cache/media codec behaves differently from Electron.
- `OBSSettings` is a single unscoped document, so a shared backend lets one user overwrite all users’ OBS configuration.

## Inconsistencies

- Backend startup connects using environment defaults; saved `OBSSettings` is loaded only through settings routes, not automatically applied at boot.
- `setup-effect`, `triggerOBSEffect` and per-effect routes remain, although active mapping types target `effect_player`.
- Effect-player URL is updated with `overlay:true`, but source sizing is not repaired if an existing source has wrong width/height.
- `repair-sources` checks names/existence, not input kind, scene transform, URL correctness, audio routing, dimensions or visibility.

## Readiness

**PARTIAL / P1.** Source auto-creation and reconnect are meaningful, but real customer recovery requires: user-scoped encrypted OBS settings, startup loading, canonical setting validation/repair, current-scene onboarding, renamed/duplicate reporting, and manual tests across OBS restart/profile/scene/source deletion.

