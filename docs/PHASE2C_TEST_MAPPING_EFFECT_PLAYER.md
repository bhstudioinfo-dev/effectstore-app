# Phase 2C — Gift Mapping Test on effect_player

## Scope

Only the Gift Mapping **Test** button was migrated. Real TikTok live gifts, simulated live gifts, and other production mapping playback remain on the legacy per-effect OBS source path.

## Files changed

- `backend/services/effectQueue.js`
- `backend/routes/tiktok.js`
- `backend/routes/obs.js`
- `backend/server.js`
- `backend/public/effect-player-overlay.html`
- `docs/PHASE2C_TEST_MAPPING_EFFECT_PLAYER.md`

The Gift Mapping frontend was intentionally not changed; it still calls `POST /api/tiktok/test-trigger` and keeps the same Test button UI.

## Old Test flow

```text
Gift Mapping Test
  -> POST /api/tiktok/test-trigger
  -> effectQueue.add(positional item)
  -> triggerOBSEffect()
  -> create/use effect_<effectId>
  -> duration timer advances queue
```

## New Test flow

```text
Gift Mapping Test
  -> POST /api/tiktok/test-trigger
  -> resolve ownership, media URL, and duration
  -> ensure effect_player is connected
  -> effectQueue.add({ playbackType: "test_mapping", ... })
  -> queue broadcasts effect_player_play_request
  -> effect_player plays and clears media
  -> effect_player_play_finished returns matching requestId
  -> queue advances to the next item
```

A safety timeout of `duration + 3 seconds` prevents a disconnected overlay from deadlocking the queue. Normal completion is driven by the overlay finish event, not by the timeout.

## Queue changes

Queue items now normalize to:

```js
{
  effectId,
  effectName,
  effectUrl,
  duration,
  playbackType,
  priority,
  createdAt,
  giftData
}
```

- Object-form queue input supports `test_mapping`.
- The playback router also recognizes `preview_effect`; current Store/My Effects previews continue using their Phase 2B direct player route and are not moved into the mapping queue.
- Existing positional callers default to `live_mapping`.
- `test_mapping` routes to `effect_player`.
- `live_mapping` continues to call `triggerOBSEffect()`.
- A unique internal `requestId` prevents unrelated preview or stale completion events from advancing the queue.
- Multiple Test clicks remain FIFO and cannot overlap.

## Protected media

Purchased Test playback uses the existing signed `effect-player-media` route with the additional `effect-player-test-mapping` token purpose. Custom effect playback continues to use the user-owned local media URL.

## Hybrid architecture after Phase 2C

| Flow | Playback architecture |
| --- | --- |
| Store preview | `effect_player` |
| My Effects preview | `effect_player` |
| Gift Mapping Test | `effect_player` through queue |
| Real TikTok live gift | legacy `effect_<id>` through `triggerOBSEffect()` |
| Simulated live gift | legacy `effect_<id>` through `triggerOBSEffect()` |
| Gift Menu Designer | unchanged `gift_menu_overlay` |

Old per-effect sources and playback code are retained. No cleanup or live migration occurs in this phase.

## Debug logs

```text
[QUEUE] playbackType=test_mapping → effect_player
[QUEUE] waiting for effect_player finish
[QUEUE] effect_player finished
```

Live items explicitly log their legacy routing as well.

## Test checklist

- [ ] App starts and OBS connects.
- [ ] `effect_player` exists and reports ready.
- [ ] Store preview still works through `effect_player`.
- [ ] My Effects preview still works through `effect_player`.
- [ ] Gift Mapping Test plays through `effect_player`.
- [ ] Test creates no new `effect_<id>` source.
- [ ] Three rapid Test clicks play serially in FIFO order.
- [ ] Natural video end advances the queue.
- [ ] Failed media and safety timeout do not deadlock the queue.
- [ ] Real TikTok gifts still call legacy `triggerOBSEffect()`.
- [ ] Real TikTok gifts still use `effect_<id>` sources.
- [ ] Menu Designer is unchanged.
- [ ] Pricing and Admin are unchanged.

## Automated verification

JavaScript syntax, overlay script compilation, backend tests, queue event completion, FIFO Test ordering, and legacy live routing are covered by the Phase 2C verification run. A real OBS/TikTok smoke test remains required before release.
