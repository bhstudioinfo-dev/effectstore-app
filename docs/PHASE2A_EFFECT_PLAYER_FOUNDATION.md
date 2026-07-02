# Phase 2A — Effect Player Architecture Foundation

## Scope

This phase prepares an unused shared `effect_player` browser source. It does not migrate Store previews, My Effects previews, Gift Mapping, TikTok gift triggers, the queue, or existing per-effect OBS playback.

## New files

- `backend/public/effect-player-overlay.html`: transparent full-screen browser source, WebSocket readiness signal, and a console-only future request listener.
- `docs/PHASE2A_EFFECT_PLAYER_FOUNDATION.md`: implementation and verification record.

## OBS foundation

- `OBSService.ensureEffectPlayerSource()` checks the `EffectStore` scene for `effect_player`.
- If missing, it safely creates a 1080×1920 browser source at `http://localhost:9000/effect-player-overlay.html`.
- If present, it changes nothing.
- It runs after OBS emits `Identified`.
- Existing `gift_menu_overlay` and `effect_<id>` sources remain untouched.

## WebSocket events

- `effect_player_ready`: overlay readiness signal.
- `effect_player_play_request`: reserved future playback request.
- `effect_player_play_finished`: reserved future completion signal.

No event is connected to production media, the queue, or existing OBS playback in Phase 2A.

## Debug route

`POST /api/debug/test-effect-player` broadcasts `effect_player_play_request` with `effectId: "test"` and `effectName: "TEST EFFECT"`. The overlay only logs `Future playback request received`.

## Diagnostic status

`GET /api/system/status` includes `obs.sources.gift_menu` and `obs.sources.effect_player`. The existing OBS status card displays READY/MISSING while OBS is connected. The `gift_menu` diagnostic label represents the existing `gift_menu_overlay` source.

## Files modified

- `backend/services/obsService.js`
- `backend/server.js`
- `desktop/renderer/index.html`
- `desktop/renderer/js/home.js`

## Zero-regression checklist

- [x] Store preview code still uses the existing per-effect path.
- [x] My Effects preview code still uses the existing per-effect path.
- [x] Gift Mapping test and live trigger code still use the existing queue and `triggerOBSEffect`.
- [x] TikTok live gift routing was not modified.
- [x] Existing `effect_<id>` OBS source creation was not modified or removed.
- [x] Existing source visibility and refresh behavior was not modified.
- [x] Gift Menu Designer and `gift_menu_overlay` code was not modified.
- [x] `effect_player` contains no media, autoplay, or controls.
- [x] The debug event listener performs only the required console log.

Automated verification completed: changed JavaScript files pass `node --check`, backend entitlement tests pass, missing-source creation and existing-source no-op behavior pass with a mocked OBS connection. Final visual checks with a real OBS instance remain part of the manual release smoke test.

## Deferred work

Playback migration, player media loading, queue integration, source cleanup, and production event routing are intentionally deferred.
