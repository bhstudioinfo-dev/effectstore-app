# Pre-Phase 2 Hardening

Date: 2026-07-02

This phase prepares Gift Mapping and the OBS effect queue for the future single
`effect_player` migration. It does not change the current per-effect OBS source
architecture.

## Completed

### Queue status API

Added:

```http
GET /api/queue/status
```

Response:

```json
{
  "status": "idle",
  "currentEffectId": null,
  "currentEffectName": null,
  "remainingMs": 0,
  "queueLength": 0,
  "nextEffectName": null
}
```

Possible status values:

- `idle`
- `queued`
- `playing`

Queue state is owned by:

- `backend/services/effectQueue.js`

The API route is registered in:

- `backend/server.js`

### Legacy Gift Mapping page removed

Removed:

- `desktop/renderer/gift-mapping.html`

Removed navigation entries from:

- `desktop/main.js`

The only canonical Gift Mapping UI is now:

- `desktop/renderer/js/home.js`

### Desktop queue deprecated and isolated

The desktop-local preview queue is not part of Gift Mapping playback.

Changes in `desktop/main.js`:

- renamed queue state to `legacyPreviewQueue`
- renamed current state to `legacyCurrentEffect`
- renamed trigger function to `triggerLegacyPreviewEffect`
- moved HTTP endpoints under `/legacy-preview/api/*`
- renamed IPC handler to `legacy-preview:trigger-effect`
- added a large deprecation boundary comment

The production Gift Mapping queue remains:

- `backend/services/effectQueue.js`

### Silent duration fallback removed

Removed runtime duration fallbacks from:

- `backend/services/effectLibraryService.js`
- `backend/services/effectQueue.js`
- `backend/services/obsService.js`
- `backend/routes/obs.js`
- `backend/routes/tiktok.js`
- `backend/routes/effects.js`
- `desktop/renderer/js/home.js`

New behavior:

1. Resolve normalized effect metadata.
2. If duration is missing, re-read the raw user custom-effect record or Effect
   document.
3. If duration is still invalid, skip the effect.
4. Return or broadcast a warning.
5. Do not enqueue an artificial 15-second wait.

Custom effect upload now converts the local video first, reads the generated
metadata duration, and only then registers the effect with the backend.

If backend registration fails after conversion, the newly generated local
effect is removed.

### Duration schema hardening

Duration is now required and must be greater than zero in:

- `backend/models/Effect.js`
- `backend/models/User.js` custom effect records

This prevents newly created records from silently receiving a default duration.

## Warning behavior

HTTP trigger routes return status `422` when duration metadata cannot be
resolved.

Real TikTok gift flow broadcasts:

```text
effect_warning
```

The main renderer displays this as a warning notification.

## Phase 2 readiness

The following foundations are now ready for the single-player migration:

- observable queue state
- explicit current and next effect metadata
- reliable remaining-time calculation
- one canonical Gift Mapping UI
- one authoritative production queue
- no silent duration-based queue stalls

The actual OBS `effect_player` migration has not started.
