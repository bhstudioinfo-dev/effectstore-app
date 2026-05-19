# API Flow

## Runtime
- HTTP API: `http://localhost:9000/api`.
- Backend WebSocket: `ws://localhost:9001`, broadcasts JSON `{ event, data }`.
- Electron local overlay: `http://localhost:8080/overlay`, WS `ws://localhost:8081`.
- Auth: `Authorization: Bearer <token>` unless marked public.

## Common Response Shape
Most JSON routes return:
```json
{ "success": true }
```
with resource fields such as `user`, `effects`, `payment`, `mappings`, `stats`, or `error`/`message` on failure. Some streaming/OBS HTML routes return non-JSON responses.

## Auth APIs
- `POST /api/auth/register` public. Body: `email`, `password`, optional `name`, `phone`, `machineId`. Response: token and user summary.
- `POST /api/auth/login` public. Body: `email`, `password`, optional `machineId`. Response: token, user summary, subscription, purchased effects.
- `GET /api/auth/me` auth. Response: current user summary.

## Effect APIs
- `GET /api/effects` public. Query: optional `category`, `search`. Response: active effects.
- `GET /api/effects/trending` public. Response: top 5 active effects by `uses`.
- `GET /api/effects/item/:id` public. Response: one effect.
- `GET /api/user/effects` auth. Response: owned effects or all active effects for admins.
- `GET /api/stream/effect/:effectId` public. Response: video stream or JSON error.
- `POST /api/effects` admin. Multipart fields include metadata plus `effectFile`, optional `thumb`.
- `POST /api/effects/:id/update` admin. Multipart update for metadata/thumb.
- `DELETE /api/effects/:id` admin.
- `GET /api/effects/:id/timeline` auth.
- `PUT /api/effects/:id/timeline` auth. Body: `timeline` or `config`, optional `isComposite`.

## Payment APIs
- `POST /api/payment/create-qr` public. Body: `amount`, `effectIds`, `userId`, `userName`. Response includes VietQR URL, `orderId`, bank info.
- `POST /api/payment/confirm` public multipart. Body: `userId`, `effectIds`, `amount`, optional `noProof`, `orderId`, optional file `proof`.
- `GET /api/payment/status/:orderId` public.
- `GET /api/payment/admin/payments` admin.
- `POST /api/payment/admin/approve` admin. Body: `paymentId`.
- `POST /api/payment/admin/reject` admin. Body: `paymentId`.

## Admin APIs
- `GET /api/admin/dashboard` admin. Stats plus recent payments.
- `GET /api/admin/stats` admin.
- `GET /api/admin/users` admin.
- `PUT /api/admin/users/:userId/subscription` admin. Body: `plan`, `durationDays`.
- `DELETE /api/admin/users/:userId` admin.
- `POST /api/admin/effect-requests` public. Body: `name`, `phone`, `description`.
- `GET /api/admin/effect-requests` admin.
- `GET /api/admin/effects` admin.
- `GET /api/admin/gift-coins` admin.
- `PUT /api/admin/gift-coins/:giftId` admin. Body: `coins`.
- `POST /api/admin/gift-coins/bulk-update` admin. Body: `updates`.
- `GET /api/admin/gift-icons` admin. Lists files from `backend/assets/gift-icons`.

## Banner APIs
Mounted at both `/api/banner` and `/api/admin/banner`:
- `GET /api/banner` public. Active banner metadata.
- `POST /api/banner` or `/api/admin/banner` admin multipart. Field: `banner`.
- `DELETE /api/banner` or `/api/admin/banner` admin.

## TikTok APIs
- `POST /api/tiktok/connect` auth. Body: `roomId`; starts TikTok client for `req.userId`.
- `POST /api/tiktok/disconnect` public.
- `GET /api/tiktok/stats` public.
- `GET /api/tiktok/mappings` auth.
- `POST /api/tiktok/map-gift` auth. Body: `giftId`, `effectId`, `giftName`, `effectName`, `giftIcon`.
- `DELETE /api/tiktok/mappings/:id` auth.
- `PUT /api/tiktok/mappings/:id/toggle` auth.
- `POST /api/tiktok/test-trigger` auth. Body: `mappingId`.
- `GET /api/tiktok/logs` auth. Query: optional `limit`.
- `DELETE /api/tiktok/logs` auth.
- `POST /api/tiktok/simulate-gift` auth. Body: `giftId`, optional `userName`.
- `GET /api/tiktok/gifts-library` public.

## OBS APIs
- `GET /api/obs/effect/:id` public. Returns HTML for OBS Browser Source.
- `POST /api/obs/setup-effect` auth. Body: `effectId`; creates browser source if absent.
- `POST /api/obs/trigger` public. Body: `effectId`, optional `duration`; queues effect.
- `GET /api/obs/sources` auth. Returns OBS input list and webcam flags.

## Settings APIs
- `GET /api/settings/obs` auth. Returns or creates OBS settings.
- `POST /api/settings/obs` auth. Body: `host`, `port`, `password`; saves and reconnects OBS.

## System Status
- `GET /api/system/status` public. Response includes `tiktok.connected`, `obs.connected`, `launcher.connected`.

## External Integrations
- OBS WebSocket: controlled by `backend/services/obsService.js`.
- TikTok Live Connector: events handled by `backend/services/tiktokService.js`.
- VietQR: generated as `https://img.vietqr.io/image/...`.

## Known API Mismatches
Frontend code references these missing or mismatched APIs:
- `/api/effect-requests` is called by `home.js`; implemented route is `/api/admin/effect-requests`.
- `PUT /api/admin/effect-requests/:id` is called by admin UIs; backend does not implement it.
- `GET /api/admin/payments/:id` is called by `desktop/renderer/admin.html`; backend only lists payments under `/api/payment/admin/payments`.
- `/api/tiktok/prepare` and `/api/tiktok/available-effects` are called by renderer pages; backend does not implement them.
- Gift icon upload/add/delete/reset routes are called by `gift-coins-manager.html`; backend only implements list and coin updates.
- `/api/payment/sepay-webhook` is called in `home.js`; backend does not implement it.
