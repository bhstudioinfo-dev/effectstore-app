# Phase 1 Gift Mapping Cleanup

Date: 2026-07-02

Source of truth used for this phase:

- [docs/GIFT_MAPPING_CURRENT_SYSTEM_AUDIT.md](/D:/effectstore-app/docs/GIFT_MAPPING_CURRENT_SYSTEM_AUDIT.md)

Scope completed in this phase:

- isolate legacy Gift Mapping page
- remove duplicate Gift Mapping test logic
- unify effect picker source
- route Gift Mapping playback through one backend queue authority
- centralize duration resolution for purchased + custom effects
- harden direct OBS trigger route

Not included in this phase:

- pricing/admin/payment changes
- installer work
- cloud migration
- single shared `effect_player` OBS source migration

## What changed

### 1. Canonical Gift Mapping UI stays in `home.js`

Updated:

- [desktop/renderer/js/home.js](/D:/effectstore-app/desktop/renderer/js/home.js)

Result:

- `loadEffectsForMapping()` now loads from `GET /api/tiktok/available-effects`
- purchased effects and custom uploaded effects now come from one normalized backend list
- only one active `testMapping()` remains in the main renderer
- `openGiftMapping()` now routes to the in-app `gift-mapping` view instead of the old standalone page

### 2. Legacy standalone page was isolated

Updated:

- [desktop/renderer/gift-mapping.html](/D:/effectstore-app/desktop/renderer/gift-mapping.html)

Result:

- old page no longer contains live Gift Mapping logic
- duplicate `testTrigger()` logic is effectively removed from active use
- page now acts only as a compatibility redirect/notice

### 3. Effect library resolution is now shared

Already introduced and now wired into Gift Mapping:

- [backend/services/effectLibraryService.js](/D:/effectstore-app/backend/services/effectLibraryService.js)

Used by:

- [backend/routes/tiktok.js](/D:/effectstore-app/backend/routes/tiktok.js)
- [backend/services/tiktokService.js](/D:/effectstore-app/backend/services/tiktokService.js)

Shared DTO shape:

```js
{
  id,
  type,
  name,
  fileUrl,
  previewUrl,
  thumbUrl,
  duration,
  ownerId,
  isCustom,
  isOwned
}
```

### 4. Gift Mapping routes now resolve ownership + duration centrally

Updated:

- [backend/routes/tiktok.js](/D:/effectstore-app/backend/routes/tiktok.js)

Applied changes:

- `GET /api/tiktok/available-effects`
  - requires auth
  - returns unified purchased + custom effect list for the current user

- `POST /api/tiktok/map-gift`
  - validates `effectId` through `resolveEffectForUser()`
  - prevents mapping effects not owned by the current user

- `POST /api/tiktok/test-trigger`
  - uses `resolveEffectForUser()`
  - uses `resolveEffectDurationForUser()`
  - enqueues directly through backend queue instead of internal HTTP loopback to `/api/obs/trigger`

- `POST /api/tiktok/simulate-gift`
  - same ownership and duration resolution path
  - same backend queue path

### 5. Live TikTok gift flow now uses the same duration authority

Updated:

- [backend/services/tiktokService.js](/D:/effectstore-app/backend/services/tiktokService.js)

Result:

- real TikTok gift events now use `resolveEffectDurationForUser()`
- purchased effects and custom effects share the same duration lookup rule

### 6. Queue authority is now documented and reinforced

Updated:

- [backend/services/effectQueue.js](/D:/effectstore-app/backend/services/effectQueue.js)
- [desktop/main.js](/D:/effectstore-app/desktop/main.js)

Result:

- backend queue remains the canonical Gift Mapping / OBS playback queue
- desktop-local queue remains only for legacy local preview overlay behavior
- comments were added in `desktop/main.js` to reduce future accidental reuse

### 7. Direct OBS trigger route hardened

Updated:

- [backend/routes/obs.js](/D:/effectstore-app/backend/routes/obs.js)
- [desktop/renderer/js/home.js](/D:/effectstore-app/desktop/renderer/js/home.js)

Result:

- `POST /api/obs/trigger` now requires auth
- frontend helper `triggerOBSEffect()` now sends bearer auth
- Gift Mapping test flow no longer depends on this route

## Current flow after cleanup

### Create mapping

1. Main UI loads unified effect list from `/api/tiktok/available-effects`
2. User selects gift + effect
3. `POST /api/tiktok/map-gift`
4. Backend validates ownership with `resolveEffectForUser()`
5. Mapping saved in `GiftMapping`

### Test mapping

1. Main UI calls `POST /api/tiktok/test-trigger`
2. Backend loads mapping
3. Backend validates effect ownership
4. Backend resolves duration centrally
5. Backend pushes item into `backend/services/effectQueue.js`
6. Queue triggers OBS playback

### Real TikTok gift

1. TikTok event received in `tiktokService`
2. Mapping resolved by `userId + giftId + isActive`
3. Duration resolved centrally
4. Effect pushed into same backend queue
5. OBS playback triggered

## Risks intentionally left for next phase

- OBS still uses per-effect browser sources and tokenized one-shot URLs
- legacy desktop navigation entries for `gift-mapping.html` still exist for compatibility
- no single `effect_player` source migration yet
- no countdown/status overlay improvements yet
- no queue-status UI yet

## Quick verification done

Syntax check passed for:

- `backend/routes/tiktok.js`
- `backend/routes/obs.js`
- `backend/services/tiktokService.js`
- `desktop/renderer/js/home.js`

Command used:

```bash
node --check <file>
```

## Recommended next implementation phase

1. migrate OBS playback to one `effect_player` browser source
2. remove old per-source visibility replay behavior completely
3. add queue state + countdown UI
4. add status feedback for queued / playing / done
5. clean remaining compatibility navigation after confirming no callers need the old page
