# Publish Audit 06 — Gift Mapping Production Audit

## Current architecture

```text
TikTokLiveClient 'gift'
→ TikTokService.connect() listener
→ process goal/menu progress
→ GiftMapping.find({currentLiveUserId,giftId,isActive})
→ quantity filter + cooldown
→ resolveEffectForUser / resolveEffectDurationForUser
→ EffectQueue.add()
→ PlaybackManager.play()
→ effect_player_play_request over authenticated WebSocket
→ effect-player-overlay video
→ matching requestId finished/failed (or duration + 3 s safety timeout)
→ queue advances
```

Queue authority for mapping playback is `backend/services/effectQueue.js`; `playbackManager.js` owns current playback. Desktop ports 8080/8081 contain a deprecated preview queue and are not called by Gift Mapping. **CONFIRMED BY CODE.**

## Paths

| Path | Current route | Architecture | Result |
|---|---|---|---|
| purchased/custom preview | `POST /api/obs/preview-effect-player` | direct effect_player, only when queue idle | code-complete; manual OBS not verified |
| test mapping | `POST /api/tiktok/test-trigger` | queue `test_mapping` → effect_player | code-complete; manual OBS not verified |
| simulated gift | `POST /api/tiktok/simulate-gift` | queue `live_mapping` → effect_player | single/group payload builds URL or resolves group |
| real live group mapping | `TikTokService.connect()` | group item resolved in `PlaybackManager.play` | code path complete |
| real live single mapping | same listener | queue accepts a server-resolvable item; PlaybackManager rechecks and builds the URL | fixed in code; real OBS/TikTok not verified |

### Regression and Phase A correction

The original audit confirmed that `tiktokService.js` passed `effectId`, `duration` and `userId` without `effectUrl`, while `EffectQueue.add()` rejected that live item. Phase A now permits an item that can be resolved securely by `userId` and `effectId`; `PlaybackManager.play()` rechecks ownership and duration and builds the URL immediately before playback. The reliability test now contains this exact missing-URL payload. Real OBS/TikTok verification remains outstanding.

## Queue behavior

- States: idle/queued/playing; current/next metadata and remaining time are exposed by unauthenticated `GET /api/queue/status`.
- Ordering: priority descending, then creation time. Live priority 100 can move ahead of tests priority 0; within equal priority creation order is preserved.
- Overlap: `PlaybackManager.current` prevents concurrent playback.
- Completion: request IDs reject stale/unrelated finish events; safety timeout prevents deadlock.
- Max length: environment-controlled, clamped 10–2000, default 500.
- Persistence: none. Restart loses queue, cooldowns, sequential indices and current state.
- Failure: failed player events advance; missing URL/duration is rejected; OBS loss during playback relies on timeout.
- Stale cleanup: completed item is cleared; no persisted stale queue. Recent event keys expire lazily after five minutes.

## Quantity, repeats and cooldown

- Exact/min/max quantity filters use `data.repeatCount`.
- The media mapping listener now ignores `giftType === 1 && repeatEnd === false`, matching goal/menu behavior. Automated cases cover intermediate/final events; real connector verification remains outstanding.
- Event de-duplication depends on `eventKey`, `giftData.eventId` or `msgId`; normalized TikTok data does not guarantee either, so repeat notifications may not dedupe.
- `cooldownAction:'ignore'` skips in-cooldown mappings. Any other value labelled “queue” does not defer until cooldown ends; it proceeds immediately. UI semantics and code differ.
- Quantity affects eligibility/log display, not number of repeated playbacks.

## Ownership and media

`map-gift` validates selected IDs through `resolveEffectForUser`; test/live resolution rechecks ownership. Purchased and custom items are returned together by `getUserAvailableEffects()` and `/available-effects`. Custom URLs point to loopback 8080. Missing local custom bytes are not detectable from Mongo metadata before player load.

## Remaining legacy code

- `OBSService.triggerOBSEffect()`
- `effect_<id>` source creation, visibility toggling and `/api/obs/effect/:id`
- `/api/obs/setup-effect`
- `/api/obs/trigger` and renderer references to nonexistent `/trigger-with-duplicate`
- desktop `legacyPreviewQueue`, hotkeys, tray trigger and ports 8080/8081

`PlaybackManager` routes `live_mapping`, `test_mapping`, and `preview_effect` to effect_player; it calls `triggerOBSEffect()` only for other playback types.

## Phase reconciliation

- **DOCUMENTATION OUTDATED:** Phase 2A–2C and the audit brief’s “possibly still old” note describe the historical hybrid state.
- **CONFIRMED BY CODE:** Phase 2D routing exists.
- **CODE INCONSISTENT:** Phase 2D document says the real single-effect branch builds a URL; current code does not.

## Before Phase 2E cleanup

1. Correct and regression-test real single purchased and custom live payloads.
2. Add streak/repeat-end fixtures from real connector data.
3. Define cooldown “queue” semantics.
4. Real OBS/TikTok smoke tests: three rapid gifts, disconnect/reconnect, failed custom file, purchased file.
5. Only then remove legacy per-effect routes/sources and desktop preview triggers, retaining a rollback commit.
