# Phase 2D — Live Gift Mapping Playback on effect_player

## Scope

Phase 2D migrates real TikTok gift playback and simulated gift playback from the old per-effect OBS source path to the unified `effect_player` browser source.

This phase does **not** delete legacy OBS code or old `effect_<id>` sources. Cleanup is intentionally left for Phase 2E.

## Files changed

- `backend/services/effectQueue.js`
- `backend/services/tiktokService.js`
- `backend/routes/tiktok.js`
- `backend/routes/obs.js`
- `backend/server.js`
- `backend/public/effect-player-overlay.html`
- `backend/public/gift-menu-overlay.html`
- `desktop/renderer/js/home.js`
- `docs/PHASE2D_LIVE_MAPPING_EFFECT_PLAYER.md`

## Old live gift flow

```text
TikTok gift event
  -> find active GiftMapping
  -> resolve duration
  -> effectQueue.add(effectId, duration, giftData, effectName)
  -> playbackType defaults to live_mapping
  -> queue calls obsService.triggerOBSEffect()
  -> OBS toggles/refreshes per-effect source effect_<id>
```

## New live gift flow

```text
TikTok gift event
  -> find active GiftMapping
  -> verify user owns effect
  -> resolve effect duration
  -> ensure OBS + effect_player are ready
  -> build effect_player media URL
  -> effectQueue.add({
       playbackType: "live_mapping",
       effectId,
       effectName,
       effectUrl,
       duration,
       giftData,
       priority: 100
     })
  -> queue broadcasts effect_player_play_request
  -> effect_player plays media
  -> effect_player_play_finished / failed advances queue
```

`live_mapping` no longer calls `triggerOBSEffect()`.

## Simulated gift flow

```text
POST /api/tiktok/simulate-gift
  -> find active mapping for current user
  -> verify ownership
  -> resolve duration
  -> ensure OBS + effect_player are ready
  -> enqueue playbackType: "live_mapping"
  -> giftData.simulated = true
```

Simulated gifts now use the same effect_player route as real live gifts.

## Queue changes

`live_mapping`, `test_mapping`, and `preview_effect` are all routed to `effect_player`.

Queue status now includes:

```js
{
  status,
  currentPlaybackType,
  currentEffectId,
  currentEffectName,
  remainingMs,
  queueLength,
  nextPlaybackType,
  nextEffectName
}
```

The queue emits:

- `effect_playback_started`
- `effect_playback_finished`
- `effect_queue_empty`

Playback completion is driven by matching `requestId` from the overlay. A safety timeout of `duration + 3 seconds` prevents deadlock.

## Gift menu fade behavior

`backend/public/gift-menu-overlay.html` now listens for playback events.

When `live_mapping` or `test_mapping` starts:

```text
gift_menu opacity -> 0
```

When the current effect finishes and the queue is empty:

```text
gift_menu opacity -> 1
```

CSS transition:

```css
opacity 0.4s ease
```

If the overlay reconnects, it queries `/api/queue/status` and defaults visible unless a mapping playback is actively running.

## Protected media behavior

Purchased effects use signed effect_player media URLs:

```text
/api/obs/effect-player-media/:effectId?token=...
```

Allowed token purposes:

- `effect-player-preview`
- `effect-player-test-mapping`
- `effect-player-live-mapping`

Custom uploaded effects continue to use local custom-effect URLs from the user's machine.

Ownership is checked before enqueue:

- purchased effect must belong to the user
- custom effect must belong to the user
- mappings cannot play another user's custom effect

## Remaining legacy code

Legacy per-effect OBS source code remains in place for Phase 2E cleanup.

After Phase 2D, Gift Mapping playback should not call the legacy path:

- Store Preview → `effect_player`
- My Effects Preview → `effect_player`
- Gift Mapping Test → `effect_player`
- Real TikTok Live Gift → `effect_player`
- Simulated Live Gift → `effect_player`

## Error handling

- Missing effect ownership: skip and emit `effect_warning`
- Missing duration: skip and emit `effect_warning`
- Missing media URL: queue rejects item
- OBS disconnected: live/simulate path rejects or skips with warning
- effect_player not ready: live/simulate path rejects or skips with warning
- Failed media playback: overlay emits failed event and queue continues
- No silent duration fallback is used

## Test checklist

- [ ] App starts.
- [ ] OBS connects.
- [ ] `effect_player` exists and ready.
- [ ] Store preview still works.
- [ ] My Effects preview still works.
- [ ] Gift Mapping Test still works.
- [ ] Simulate gift uses `effect_player`.
- [ ] Real TikTok gift uses `effect_player`.
- [ ] No new `effect_<id>` source is created by live gift.
- [ ] Three rapid live gifts play serially.
- [ ] Purchased effect live mapping works.
- [ ] Custom effect live mapping works.
- [ ] Gift menu fades out during live/test mapping.
- [ ] Gift menu fades back in after effect finishes / queue empty.
- [ ] Queue does not deadlock on failed media.
- [ ] Pricing/Admin/Menu Designer unchanged.
