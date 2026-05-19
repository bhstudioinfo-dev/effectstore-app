# Current Progress

## Completed
- Local backend server runs from `backend/server.js` with MongoDB, static uploads/assets, REST routes, and WebSocket broadcasts.
- Electron desktop shell runs from `desktop/main.js` and loads `desktop/renderer/index.html`.
- Auth, JWT, device limits, and basic admin detection are implemented.
- Effect catalog, admin upload/update/delete, thumbnail/preview storage, encrypted video storage, and streaming are implemented.
- Payment QR creation, payment confirmation, admin list/approve/reject, and user entitlement updates are implemented.
- TikTok Live connection, stats broadcast, gift mapping, simulated/test triggers, logs, and gift library are implemented.
- OBS connection, browser source generation, source listing, effect trigger queue, and settings persistence are implemented.
- Banner upload/delete and public active banner lookup are implemented.
- Documentation memory files have been generated in root `docs/`.

## In Progress / Partially Implemented
- TTS is present in frontend logic but should be verified against actual implemented voice provider before extension.
- Timeline editor stores keyframes, but primary OBS trigger path does not clearly execute effect timelines.
- Admin banner and gift coins standalone pages exist, but some controls call missing backend endpoints.
- Older `admin/index.html` and `desktop/renderer/admin.html` appear partially out of sync with current API routes.

## Known Issues To Address Next
- Fix frontend/backend endpoint mismatches listed in `docs/API_FLOW.md` and `docs/KNOWN_BUGS.md`.
- Normalize auth usage in standalone pages; several pages use old `x-machine-id` headers or omit Bearer tokens for protected routes.
- Decide whether Electron local overlay on ports `8080/8081` is legacy or should be integrated with backend OBS flow on `9000/9001`.
- Harden secrets: remove insecure defaults for JWT, OBS password, encryption password, and admin password from production use.
- Add real tests; current `npm test` scripts only echo success.

## Next Priorities
1. API contract cleanup: implement missing endpoints or update frontend calls.
2. Security pass: secrets, admin bootstrapping, plaintext OBS password, public trigger/stream endpoints.
3. Data integrity pass: fix `GiftConfig` upsert requiring `giftName`, `GiftLog.effectId` ref mismatch, and `hasAdminUI` field usage without schema.
4. UI consolidation: reduce inline styles and duplicated standalone page logic.
5. Verification baseline: add smoke tests for auth, effects, payment approval, TikTok mapping, and OBS trigger route.
