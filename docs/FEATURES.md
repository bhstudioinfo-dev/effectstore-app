# Features

## Authentication and Account State
- How it works: users register/login with email/password. JWT is stored in `localStorage`; `/api/auth/me` restores sessions.
- Related files: `backend/routes/auth.js`, `backend/middleware/auth.js`, `backend/models/User.js`, `desktop/renderer/js/home.js`.
- Endpoints: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`.
- Important logic: device limits by subscription, expired subscriptions downgrade to `free`, hardcoded admin email receives admin privileges.

## Effect Store Catalog
- How it works: active effects are loaded from Mongo, filtered by category/search, and rendered as cards with preview, price, flash sale flags, and cart actions.
- Related files: `backend/routes/effects.js`, `backend/models/Effect.js`, `desktop/renderer/index.html`, `desktop/renderer/js/home.js`, `desktop/renderer/styles/main.css`.
- Endpoints: `GET /api/effects`, `GET /api/effects/trending`, `GET /api/effects/item/:id`.
- Important logic: list query uses `{ isActive: true }`, optional `category`, regex `search`, and sort by `uses`.

## User Owned Effects
- How it works: authenticated users load purchased effects from `User.purchasedEffects`; admins receive all active effects.
- Related files: `backend/routes/effects.js`, `backend/models/User.js`, `desktop/renderer/js/home.js`.
- Endpoints: `GET /api/user/effects`.
- Important logic: `purchasedEffects.effectId` is populated; response includes `libraryType`.

## Admin Effect Management
- How it works: admins upload effect metadata, media file, and thumbnail. Video is copied to previews and encrypted into `backend/effects/encrypted`.
- Related files: `backend/routes/effects.js`, `backend/utils/encrypt-video.js`, `backend/models/Effect.js`, `desktop/renderer/js/home.js`.
- Endpoints: `POST /api/effects`, `POST /api/effects/:id/update`, `DELETE /api/effects/:id`, `GET/PUT /api/effects/:id/timeline`.
- Important logic: `ffprobe` is spawned for duration fallback; encrypted files use AES-256-CBC; delete removes preview/encrypted files if present.

## Encrypted Effect Streaming
- How it works: OBS/browser previews request `/api/stream/effect/:effectId`; backend resolves a preview file or encrypted file and streams it.
- Related files: `backend/routes/effects.js`, `backend/utils/encrypt-video.js`.
- Endpoints: `GET /api/stream/effect/:effectId`.
- Important logic: fallback lookup tries stored path, `previewUrl`/`fileUrl` basename, preview directory by id prefix, then encrypted path. Encrypted streaming has partial range support.

## Payment and Purchase Approval
- How it works: frontend creates a VietQR image URL, user confirms payment/proof, admin approves/rejects.
- Related files: `backend/routes/payment.js`, `backend/models/Payment.js`, `backend/models/User.js`, `desktop/renderer/js/home.js`.
- Endpoints: `POST /api/payment/create-qr`, `POST /api/payment/confirm`, `GET /api/payment/status/:orderId`, `GET /api/payment/admin/payments`, `POST /api/payment/admin/approve`, `POST /api/payment/admin/reject`.
- Important logic: approval grants effects or activates `SUBSCRIPTION_PRO`/`SUBSCRIPTION_BUSINESS`; `totalSpent` increments.

## Admin Dashboard
- How it works: admin views aggregate stats, recent payments, users, effects, custom requests, gift coin configs, and gift icons.
- Related files: `backend/routes/admin.js`, `desktop/renderer/js/home.js`, `desktop/renderer/admin.html`, `desktop/renderer/gift-coins-manager.html`.
- Endpoints: `GET /api/admin/dashboard`, `GET /api/admin/stats`, `GET /api/admin/users`, `PUT /api/admin/users/:userId/subscription`, `DELETE /api/admin/users/:userId`, `GET /api/admin/effects`, `GET /api/admin/gift-coins`, `PUT /api/admin/gift-coins/:giftId`, `POST /api/admin/gift-coins/bulk-update`, `GET /api/admin/gift-icons`.
- Important logic: revenue is aggregated from approved payments; user subscription expiration is set by duration days.

## Custom Effect Requests
- How it works: users submit name/phone/description; admins list requests.
- Related files: `backend/routes/admin.js`, `backend/models/EffectRequest.js`, `desktop/renderer/js/home.js`, `desktop/renderer/admin.html`.
- Endpoints actually implemented: `POST /api/admin/effect-requests`, `GET /api/admin/effect-requests`.
- Important logic: `server.js` mounts `admin.js` only under `/api/admin`; frontend also calls `/api/effect-requests`, which is not implemented.

## Banner Management
- How it works: public route returns active banner; admin route uploads/replaces/deletes current banner image.
- Related files: `backend/routes/banner.js`, `backend/models/Banner.js`, `desktop/renderer/admin-banner.html`, `desktop/renderer/js/home.js`.
- Endpoints: `GET /api/banner`, `POST /api/banner`, `DELETE /api/banner`, also mounted as `POST/DELETE /api/admin/banner`.
- Important logic: one active banner is maintained; old file is deleted when replaced.

## TikTok Live Connection
- How it works: backend connects to TikTok Live by room/user id, listens for gift/like/chat/viewer events, broadcasts stats, and queues mapped effects.
- Related files: `backend/routes/tiktok.js`, `backend/services/tiktokService.js`, `backend/services/effectQueue.js`, `desktop/renderer/js/home.js`.
- Endpoints: `POST /api/tiktok/connect`, `POST /api/tiktok/disconnect`, `GET /api/tiktok/stats`.
- Important logic: reconnect after disconnect uses 15-second retry; current live user id scopes gift mapping lookup.

## Gift Mapping
- How it works: users map a TikTok gift id to an effect id; test/simulate routes trigger OBS manually and write logs.
- Related files: `backend/routes/tiktok.js`, `backend/models/GiftMapping.js`, `backend/models/GiftLog.js`, `desktop/renderer/js/home.js`, `desktop/renderer/gift-mapping.html`.
- Endpoints: `GET /api/tiktok/mappings`, `POST /api/tiktok/map-gift`, `PUT /api/tiktok/mappings/:id/toggle`, `DELETE /api/tiktok/mappings/:id`, `POST /api/tiktok/test-trigger`, `POST /api/tiktok/simulate-gift`, `GET/DELETE /api/tiktok/logs`, `GET /api/tiktok/gifts-library`.
- Important logic: mapping count is plan-limited; gift library is hardcoded plus `GiftConfig` coin overrides.

## OBS Automation
- How it works: backend connects to OBS WebSocket, creates/updates browser sources, refreshes them, toggles visibility, and hides after duration.
- Related files: `backend/routes/obs.js`, `backend/services/obsService.js`, `backend/services/effectQueue.js`.
- Endpoints: `GET /api/obs/effect/:id`, `POST /api/obs/setup-effect`, `POST /api/obs/trigger`, `GET /api/obs/sources`.
- Important logic: OBS scene name is `EffectStore`; browser source URL points back to `/api/obs/effect/:id`.

## Effect Timeline Editor
- How it works: admin/user can store keyframes on an effect and mark it composite.
- Related files: `backend/routes/effects.js`, `backend/models/Effect.js`, `desktop/renderer/js/home.js`, `backend/obs-controller.js`.
- Endpoints: `GET /api/effects/:id/timeline`, `PUT /api/effects/:id/timeline`.
- Important logic: `home.js` stores keyframes; `obs-controller.js` contains a separate timeline runner, but the primary `obsService.js` trigger path does not appear to use `Effect.timeline`.

## TTS Controls
- How it works: frontend stores TTS settings in `localStorage` and queues speech/audio locally.
- Related files: `desktop/renderer/js/home.js`, `docs/systems/tts.md`.
- Endpoints: no dedicated backend endpoint found.
- Important logic: TTS is renderer-local state; verify actual voice provider before changing because docs mention external voice integration but code is mixed/local.

## Desktop Local Overlay
- How it works: Electron main process starts a local Express server and WebSocket server; `desktop/renderer/overlay.html` shows simple icon effects from local IPC triggers.
- Related files: `desktop/main.js`, `desktop/renderer/overlay.html`.
- Endpoints: `GET http://localhost:8080/overlay`, `GET /api/trigger/:effectId`, `GET /api/status`, WS `ws://localhost:8081`.
- Important logic: this overlay is separate from backend OBS Browser Source flow on port `9000`.
