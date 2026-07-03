# Phase 2B — Store / My Effects Preview Migration

## Scope

Only Store and My Effects OBS preview playback was migrated to the shared `effect_player`. Gift Mapping Test, TikTok live gifts, `live_mapping`, the production mapping queue, Menu Designer, pricing, payment, and admin flows remain on their existing paths.

## Files changed

- `backend/public/effect-player-overlay.html`
- `backend/routes/obs.js`
- `backend/routes/effects.js`
- `backend/services/obsService.js`
- `backend/server.js`
- `desktop/renderer/js/home.js`
- `docs/PHASE2B_PREVIEW_EFFECT_PLAYER_MIGRATION.md`

## Old preview flow

```text
Store / My Effects button
  -> POST /api/obs/trigger
  -> production effectQueue
  -> triggerOBSEffect()
  -> create/update effect_<effectId>
  -> toggle the per-effect OBS source
```

Custom effects previously opened an in-app video modal instead of using OBS.

## New preview flow

```text
Xem thử trên OBS
  -> POST /api/obs/preview-effect-player (authenticated)
  -> verify queue is idle
  -> verify effect ownership/admin access
  -> resolve purchased or custom effect metadata and duration
  -> ensure effect_player exists
  -> wait for the effect_player WebSocket readiness handshake
  -> broadcast effect_player_play_request
  -> effect_player loads one video
  -> ended or duration timeout clears the video
  -> overlay reports finished/failed and remains transparent
```

The preview route never calls `/api/obs/trigger`, `effectQueue.add()`, or `triggerOBSEffect()`. It therefore does not create or toggle an `effect_<effectId>` source.

## API

### `POST /api/obs/preview-effect-player`

Authenticated request:

```json
{ "effectId": "..." }
```

The WebSocket payload uses `playbackType: "preview_effect"`, a protected/local `effectUrl`, and a normalized millisecond `duration`.

### `GET /api/obs/effect-player-media/:effectId?token=...`

Purchased media is served through a five-minute signed backend URL. The payload does not expose a filesystem path. The handler reuses the existing encrypted/plain effect streaming implementation.

Custom effects use their local `127.0.0.1:8080/custom-effects/...` URL because those files exist only on the customer's computer.

## Queue safety

Preview is blocked with HTTP 409 while the production mapping queue is queued or playing. The UI displays: `Đang có hiệu ứng khác chạy, vui lòng thử lại sau.` Preview is not inserted into or allowed to interrupt the mapping queue.

## WebSocket completion events

- `effect_player_play_finished`: emitted on natural end or duration timeout.
- `effect_player_play_failed`: emitted when media loading or autoplay fails.

## What remains old

- Gift Mapping Test and real TikTok gift playback still use `effectQueue` and `triggerOBSEffect()`.
- Existing per-effect OBS source setup and playback code is retained for later migration/rollback.
- Existing `effect_<id>` sources are not deleted.
- Menu Designer and `gift_menu_overlay` are unchanged.

## Test checklist

- [ ] App starts and authenticates.
- [ ] OBS connects and `effect_player` exists.
- [ ] Store owned-effect button says `Xem thử trên OBS`.
- [ ] My Effects button says `Xem thử trên OBS`.
- [ ] Purchased preview plays from beginning to end through `effect_player`.
- [ ] Custom local preview plays through `effect_player`.
- [ ] Preview clears on video end and duration timeout.
- [ ] Preview failure leaves the overlay transparent.
- [ ] Preview creates no new `effect_<id>` source.
- [ ] Preview is blocked while the mapping queue is active.
- [ ] Gift Mapping Test still uses the old production queue path.
- [ ] TikTok live triggers remain unchanged.
- [ ] Menu Designer remains unchanged.

## Automated verification completed

- Changed backend and renderer JavaScript passes `node --check`.
- The inline overlay script compiles successfully.
- The protected streaming handler is exported and reusable by the signed route.
- Backend entitlement tests pass.
- Static flow inspection confirms active Store/My Effects preview calls only `/api/obs/preview-effect-player`.
- Static flow inspection confirms Gift Mapping/TikTok continue to call the existing production queue and `triggerOBSEffect()` paths.

Checks requiring a running OBS instance and local custom-effect server remain in the manual checklist above.
