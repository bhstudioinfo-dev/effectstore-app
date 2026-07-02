# Gift Mapping Current System Audit

Audit date: 2026-07-02

Scope: current local worktree in `D:\effectstore-app`, including uncommitted changes already present in the repo.

This document is inspection-only. It describes the system as it exists now and does not propose code changes inside the application codebase itself.

## 1. Current Architecture

Gift Mapping currently spans five layers:

1. Desktop renderer UI
   - Main in-app mapping UI: `desktop/renderer/js/home.js`
   - Legacy/standalone mapping page: `desktop/renderer/gift-mapping.html`
   - Container view in main shell: `desktop/renderer/index.html`

2. Desktop main process
   - Custom uploaded effect file storage and local static serving
   - File: `desktop/main.js`

3. Backend API
   - Mapping APIs and TikTok trigger APIs: `backend/routes/tiktok.js`
   - Effect library and custom effect registration APIs: `backend/routes/effects.js`
   - OBS playback APIs: `backend/routes/obs.js`

4. Backend services
   - Real TikTok live event handling: `backend/services/tiktokService.js`
   - OBS playback control: `backend/services/obsService.js`
   - Sequential playback queue: `backend/services/effectQueue.js`

5. Database models
   - Mappings: `backend/models/GiftMapping.js`
   - Effects: `backend/models/Effect.js`
   - Users, purchased/custom ownership: `backend/models/User.js`
   - Trigger logs: `backend/models/GiftLog.js`

## 2. Gift Mapping System

### Where mappings are created

Main app flow:

- UI selection and submit: `desktop/renderer/js/home.js`
  - `loadGifts()`
  - `loadEffectsForMapping()`
  - `selectGift()`
  - `selectEffect()`
  - `createMapping()`

Legacy standalone page:

- `desktop/renderer/gift-mapping.html`
  - `loadGifts()`
  - `loadEffects()`
  - `selectGift()`
  - `selectEffect()`
  - `createMapping()`

### Where mappings are saved

- API route: `POST /api/tiktok/map-gift`
- File: `backend/routes/tiktok.js`
- Persistence model: `backend/models/GiftMapping.js`

### Database schema

`GiftMapping` fields:

- `userId: String`
- `sessionId: String`
- `giftId: String`
- `giftName: String`
- `giftIcon: String`
- `effectId: String`
- `effectName: String`
- `isActive: Boolean`
- `createdAt: Date`
- `updatedAt: Date`

Notes:

- `effectId` is string-based, not ObjectId-only. This allows both purchased DB effects and custom local effect ids such as `custom-...`.
- Mapping is one-per-user-per-gift in current route behavior because `map-gift` updates existing mapping by `{ userId, giftId }`.

### Mapping API routes

File: `backend/routes/tiktok.js`

- `GET /api/tiktok/mappings`
- `POST /api/tiktok/map-gift`
- `DELETE /api/tiktok/mappings/:id`
- `PUT /api/tiktok/mappings/:id/toggle`
- `POST /api/tiktok/test-trigger`
- `POST /api/tiktok/simulate-gift`
- `GET /api/tiktok/gifts-library`
- `GET /api/tiktok/available-effects`

### How gift -> effect link works

Data link is purely by mapping record:

- incoming gift event provides `giftId`
- system loads `GiftMapping` by `userId + giftId + isActive`
- mapping returns `effectId`
- `effectId` can be:
  - purchased effect `_id` from `Effect` collection
  - custom local id like `custom-172...`

### How test mapping currently works

There are currently two UI implementations and both contain duplicate logic from older and newer iterations.

Main app renderer:

- File: `desktop/renderer/js/home.js`
- Two `testMapping()` definitions exist in the same class.
- Because JavaScript uses the later definition, the later function is the active one.
- Active flow now:
  - button click -> `POST /api/tiktok/test-trigger`
  - backend route validates mapping
  - backend forwards to `POST /api/obs/trigger`
  - OBS route pushes into backend `effectQueue`
  - queue calls `obsService.triggerOBSEffect()`
  - UI uses returned `duration` for countdown on the button

Legacy standalone mapping page:

- File: `desktop/renderer/gift-mapping.html`
- Two `testTrigger()` functions also exist.
- The later definition is the active one.
- Active flow is also `POST /api/tiktok/test-trigger`.

### Current limitations

- Duplicate `testMapping()` in `home.js`
- Duplicate `testTrigger()` in `gift-mapping.html`
- Main and legacy mapping UIs do not share one common frontend module
- Mapping stores `effectName` snapshot instead of resolving live display metadata from library
- Mapping has no per-mapping duration field persisted
- Mapping has no effect type discriminator beyond string shape of `effectId`

## 3. Purchased Effects Library

### Where purchased effects are stored

Database ownership is stored on `User`:

- File: `backend/models/User.js`
- Field: `purchasedEffects[]`
  - `effectId: ObjectId ref Effect`
  - `purchasedAt`
  - `licenseKey`

### How ownership is checked

Primary ownership route:

- `GET /api/user/effects`
- File: `backend/routes/effects.js`

Behavior:

- Loads current `User`
- `populate('purchasedEffects.effectId')`
- For admin users:
  - returns all active effects
  - `libraryType: 'admin_all'`
- For normal users:
  - returns populated purchased effect objects only
  - `libraryType: 'purchased'`

### How effect list is loaded in frontend

Main library:

- File: `desktop/renderer/js/home.js`
- Function: `loadOwnedEffects()`

Flow:

1. `GET /api/user/effects`
2. If admin, `this.effects = all active effects`
3. Else, `this.ownedEffects = purchased effects`
4. Then `loadPersonalEffects()` merges local custom effects into `ownedEffects`

### How purchased effects appear in Gift Mapping picker

Main app mapping picker:

- File: `desktop/renderer/js/home.js`
- Function: `loadEffectsForMapping()`

Current logic:

- calls `loadPersonalEffects()`
- `baseEffects = admin ? this.effects : this.ownedEffects`
- custom effects are prepended and de-duplicated
- result renders into `#effects-mapping-grid`

Legacy standalone mapping page:

- File: `desktop/renderer/gift-mapping.html`
- Function: `loadEffects()`
- Calls `GET /api/tiktok/available-effects`
- This only loads purchased/store effects from `Effect` collection, not custom local effects

### Effect fields currently used

Effect collection fields from `backend/models/Effect.js`:

- `_id`
- `name`
- `category`
- `price`
- `originalPrice`
- `description`
- `icon`
- `fileUrl`
- `previewUrl`
- `thumbUrl`
- `thumbFilePath`
- `duration`
- `previewFilePath`
- `encryptedFilePath`
- `fileSize`
- `uses`
- `isActive`
- `isTrending`
- `isFlashSale`
- `flashSalePrice`
- `flashSaleEndsAt`
- `timeline`
- `isComposite`

Frontend picker/display relies mostly on:

- `id` or `_id`
- `name`
- `icon`
- `previewUrl`
- `thumbUrl`
- `duration`
- `isCustom`

## 4. Custom Uploaded Effects

### Current upload UI

File: `desktop/renderer/js/home.js`

Functions:

- `openPersonalEffectUpload()`
- `choosePersonalEffectFiles()`
- `savePersonalEffect()`
- `deletePersonalEffect()`
- `loadPersonalEffects()`

Current UX:

- upload entry point is in "Hiệu ứng của tôi"
- user chooses a local video file
- file is converted locally to WebM VP9 in the desktop process
- effect is then merged into the owned library and mapping picker

### Backend upload route

There is no backend media upload route for custom effect bytes.

Current split is:

- desktop local file save through Electron IPC
  - `custom-effects:list`
  - `custom-effects:choose-files`
  - `custom-effects:save`
  - `custom-effects:delete`
- backend only stores lightweight metadata/ownership
  - `POST /api/user/custom-effects/register`
  - `DELETE /api/user/custom-effects/:localId`

### Where custom files are stored

File storage is local on the machine, not MongoDB and not backend uploads:

- File: `desktop/main.js`
- Root: `app.getPath('userData')/custom-effects`
- Per effect directory:
  - `effect.webm`
  - `thumbnail.png`
  - `metadata.json`

### Current custom effect metadata

`metadata.json` currently contains fields such as:

- `id`
- `name`
- `icon`
- `createdAt`
- `sourceName`
- `originalBytes`
- `optimizedBytes`
- `duration`
- `maxDurationSeconds`
- `format`
- `width`
- `height`
- `fps`
- `note`

### Database model for custom effects

Custom effects are not stored in a dedicated collection.

They are stored under `User.customEffects[]`:

- `localId`
- `name`
- `machineId`
- `duration`
- `createdAt`

### Why custom effects do or do not appear in Gift Mapping picker

Main app picker:

- They do appear, if all conditions hold:
  - local folder exists in desktop user data
  - `metadata.json` exists
  - user is logged in
  - `currentUser.customEffects` contains matching `localId`
- File path: `desktop/renderer/js/home.js`
- Function: `loadPersonalEffects()`

Legacy standalone picker:

- They do not appear
- `gift-mapping.html` uses `GET /api/tiktok/available-effects`
- that route reads only `Effect` collection, not Electron local custom effects

### Current plan limits

Custom effect limit is implemented in backend metadata registration:

- File: `backend/routes/effects.js`
- Route: `POST /api/user/custom-effects/register`
- Uses `getEntitlements(user).customEffects`

Important behavior:

- backend limit applies to registration count
- local Electron desktop save still depends on frontend sequence
- current flow registers first, then saves file locally

## 5. OBS Playback

### Current playback method

Primary OBS playback stack:

- route: `POST /api/obs/trigger`
- queue: `backend/services/effectQueue.js`
- OBS control: `backend/services/obsService.js`
- browser source content: `GET /api/obs/effect/:id`

### Whether it creates separate OBS sources per effect

Yes.

Current source naming:

- `effect_<effectId>`

File:

- `backend/services/obsService.js`

This means every effect id gets its own OBS browser source under scene `EffectStore`.

### Whether it toggles source visibility

Yes.

Current pattern in `obsService.triggerOBSEffect()`:

1. create/update browser source URL
2. `SetSceneItemEnabled(..., true)`
3. refresh browser source
4. after timeout, `SetSceneItemEnabled(..., false)`
5. newer local worktree also resets source URL to an idle transparent URL

### Why manually turning the eye icon back on can cause replay

Historical behavior:

- browser source URL itself pointed directly to a replayable effect page
- if source stayed bound to a playable page, manually re-enabling visibility could cause the page/video to replay or show stale frame state depending on browser source reload behavior

Current local worktree mitigation:

- `backend/services/obsService.js` now creates one-shot trigger tokens
- `backend/routes/obs.js` only plays if a valid trigger token is consumed once
- after timeout, source URL is reset to `?idle=1`
- if user manually re-enables the source after playback, route returns transparent blank HTML

So in the current local worktree, the manual replay issue is partially addressed by tokenized one-shot playback plus idle URL reset.

### Current effect trigger flow

Purchased effect path:

1. trigger route receives effect id
2. queue enqueues `{ effectId, duration }`
3. queue processes sequentially
4. OBS service updates `effect_<id>` browser source
5. browser source loads `/api/obs/effect/:id?...`
6. effect page loads `/api/stream/effect/:effectId`
7. video plays and source is hidden after duration

Custom effect path:

1. trigger route receives `custom-...`
2. queue enqueues it the same way
3. OBS effect page detects custom id
4. page video source becomes `http://127.0.0.1:8080/custom-effects/<id>/effect.webm`
5. source is hidden after duration

## 6. Effect Queue

### Whether a queue already exists

Yes, on backend.

- File: `backend/services/effectQueue.js`
- Class-like singleton with:
  - `queue`
  - `isProcessing`
  - `broadcastFn`

There is also a separate desktop-local array queue in `desktop/main.js`:

- `let effectQueue = []`

That desktop queue is for the older local overlay trigger server and is not the main backend OBS playback queue used by Gift Mapping test/live routes.

### Queue behavior

Current backend queue behavior:

- serial only
- no overlap by design
- next item waits `durationMs` after previous trigger
- no cancellation
- no dedupe
- no priority
- no queue status API

### How duration is handled

In queue service:

- `duration < 100` is treated as seconds and multiplied by 1000
- otherwise treated as milliseconds

This means callers are inconsistent but tolerated.

Purchased effects:

- usually use `Effect.duration`

Custom effects:

- current system is mixed:
  - local desktop metadata now stores `duration`
  - `User.customEffects` now has `duration`
  - main frontend syncs duration back to backend after local save
  - however some server paths still fall back to `15` if they do not look up custom metadata

### How repeated gifts are handled

Real TikTok gifts:

- `tiktokService` normalizes `repeatCount`
- mapping resolution still results in one queue item per gift event callback
- queue payload includes `giftData`
- no batching or stacking at queue layer

Logs:

- `GiftLog` has `repeatCount` field
- current mapping trigger paths shown in inspected files do not consistently persist repeat count into logs for every path

## 7. TikTok Live Event Flow

### Where gift events are received

- File: `backend/services/tiktokService.js`
- Source: `TikTokLiveClient`
- Event handler: `this.tiktokClient.on('gift', async (data) => { ... })`

### How event resolves mapping

Real live path:

1. gift event received
2. normalize/update live catalog
3. `GiftMapping.findOne({ userId: currentLiveUserId, giftId: data.giftId, isActive: true })`
4. if mapping exists:
   - load effect if purchased
   - custom effect is detected by `effectId.startsWith('custom-')`
   - enqueue into backend effect queue
5. if no mapping:
   - raw gift is broadcast to websocket clients

### How effect is triggered

Real live:

- `tiktokService` -> `effectQueue.add()` -> `obsService.triggerOBSEffect()`

Test mapping:

- UI -> `POST /api/tiktok/test-trigger` -> `POST /api/obs/trigger` -> `effectQueue.add()` -> `obsService.triggerOBSEffect()`

Conclusion:

- test mapping and real live are similar in the lower playback path
- they are not the exact same top-level path because test bypasses `TikTokLiveClient` and manually inserts into queue through route chain

## 8. Current Bugs / Gaps

### A. Custom effects missing from Gift Mapping

- Main app `home.js` picker does include them after local Electron merge.
- Legacy `gift-mapping.html` picker does not include them because it only loads `/api/tiktok/available-effects`.
- Result: behavior differs by UI entry point.

### B. Possible overlapping / queue visibility gaps

- Backend queue is serial, so overlap is prevented at queue level.
- But there is no queue state UI, no remaining-time API, and no explicit lock state visible in renderer.
- Multiple independent trigger entry points still exist, including old desktop local trigger paths.

### C. OBS replay issue

- Historically possible because one source per effect could replay if the browser source was re-enabled manually.
- Current local worktree contains a mitigation:
  - one-shot trigger token
  - idle transparent URL after timeout
- This is not yet a unified single effect player design; it is a hardening of the existing per-effect-source design.

### D. Missing / inconsistent duration

- Purchased effect duration is generally read from `Effect.duration`.
- Custom effect duration is still inconsistent across paths:
  - desktop metadata has `duration`
  - backend `User.customEffects` has `duration`
  - `test-trigger` and `simulate-gift` still use `effect?.duration || 15` and do not currently resolve custom duration from `User.customEffects`
  - `tiktokService` live path also still uses `15` for custom when no DB `Effect` exists in the inspected code
- Result: countdown and live playback can be wrong for custom effects.

### E. Missing queue state

- No dedicated queue status endpoint in backend
- No current item / time-left reporting from backend queue
- Desktop `main.js` has a local `/api/status`, but that is for desktop-local overlay service, not backend OBS queue state

### F. Missing status UI

- Main mapping UI only shows per-button temporary countdown for test
- No queue panel
- No “currently playing”, “queued next”, or “OBS source state” UI

### G. Bypass / integrity risks

- `backend/routes/obs.js` `POST /trigger` has no auth middleware
- any local caller that can hit backend can enqueue arbitrary `effectId`
- `GET /api/tiktok/available-effects` is public and store-effect-only
- main and legacy UIs do not share one canonical picker implementation
- duplicate functions in frontend increase risk of old behavior silently overriding new behavior

### H. Data ownership / synchronization gaps

- custom effect bytes live only on machine local storage
- backend only knows metadata
- if metadata exists but local file is deleted, mapping still exists but playback will fail
- if local file exists but backend metadata is absent, main UI filters it out

## 9. Files Involved

### Database / Models

- `backend/models/GiftMapping.js`
- `backend/models/GiftLog.js`
- `backend/models/Effect.js`
- `backend/models/User.js`

### Backend Routes

- `backend/routes/tiktok.js`
- `backend/routes/effects.js`
- `backend/routes/obs.js`
- `backend/routes/auth.js`
- `backend/routes/payment.js`

### Backend Services

- `backend/services/tiktokService.js`
- `backend/services/effectQueue.js`
- `backend/services/obsService.js`
- `backend/server.js`

### Desktop / Electron

- `desktop/main.js`
- `desktop/preload.js`

### Frontend / Renderer

- `desktop/renderer/js/home.js`
- `desktop/renderer/gift-mapping.html`
- `desktop/renderer/index.html`

## 10. Current Flow Diagrams

### Main app mapping creation

```text
Renderer home.js
  -> user selects gift
  -> user selects effect
  -> POST /api/tiktok/map-gift
  -> GiftMapping create/update in MongoDB
```

### Test mapping flow

```text
Renderer home.js or gift-mapping.html
  -> POST /api/tiktok/test-trigger
  -> backend validates mapping + custom ownership
  -> POST /api/obs/trigger
  -> backend/services/effectQueue.add()
  -> backend/services/obsService.triggerOBSEffect()
  -> OBS browser source loads /api/obs/effect/:id
  -> video plays
  -> source disabled after duration
```

### Real TikTok gift flow

```text
TikTokLiveClient gift event
  -> tiktokService resolves mapping by userId + giftId
  -> effectQueue.add(effectId, duration, giftData)
  -> effectQueue broadcasts gift payload to websocket clients
  -> obsService.triggerOBSEffect()
  -> OBS browser source playback
  -> GiftLog write
```

### Custom effect upload flow

```text
Renderer home.js
  -> Electron IPC custom-effects:choose-files
  -> Electron IPC custom-effects:save
  -> local file saved to userData/custom-effects/<id>/
  -> POST /api/user/custom-effects/register
  -> User.customEffects[] metadata updated
  -> loadPersonalEffects() merges local + backend registration
```

## 11. Recommended Fix Plan

The safest implementation path, based on current structure, is:

### Phase 1: Unify library data model

- Create one canonical effect DTO for both purchased and custom effects
- Ensure both main UI and standalone mapping page use the same source of truth
- Return a unified picker list with fields:
  - `id`
  - `type`
  - `name`
  - `previewUrl`
  - `thumbUrl`
  - `duration`
  - `isOwned`
  - `isCustom`

### Phase 2: Unify duration resolution

- Resolve duration from one backend helper for:
  - purchased effect
  - custom local effect metadata mirrored into `User.customEffects`
- Use same resolver in:
  - `test-trigger`
  - `simulate-gift`
  - live TikTok gift path
  - direct effect trigger path if retained

### Phase 3: Move to one OBS effect player source

- Replace `effect_<effectId>` per-effect browser sources with one reusable browser source
- Browser source receives payload for current item only
- Avoid per-effect source sprawl in OBS scene
- Manual eye-toggle behavior becomes predictable because source state is centralized

### Phase 4: Central queue ownership

- Keep one backend queue as the only authority
- Remove or isolate old desktop-local trigger queue from Gift Mapping path
- Add queue state:
  - current item
  - remaining time
  - pending items
  - last completed item

### Phase 5: Status and countdown UI

- Add queue/status API
- Show current playback and queued playback in Gift Mapping UI
- Let test button read backend-resolved duration
- Expose OBS connection + queue state in UI

### Phase 6: Gift menu coordination

- If Gift Menu overlay needs fade out/in around effect playback, do it through queue lifecycle hooks
- Avoid letting gift menu and effect playback manage timing independently

### Phase 7: Route hardening

- Add auth/authorization to routes that enqueue playback
- Keep custom effect ownership validation centralized
- Ensure deleted local custom effect invalidates stale mappings gracefully

## 12. Summary

Current system is already close to a usable hybrid model:

- purchased effects are DB-backed
- custom effects are machine-local with user metadata mirrored in MongoDB
- backend queue exists and serializes OBS playback
- real TikTok gifts and test mapping both reach the queue-driven OBS path

The biggest remaining problems are not missing architecture. They are inconsistency:

- two frontend mapping UIs
- duplicate frontend test functions
- custom effects not unified in all pickers
- custom duration not resolved consistently
- per-effect OBS source model instead of one central effect player
- limited queue/state visibility

This makes the system workable, but fragile under maintenance and easy to regress when one UI path is updated and the other is not.
