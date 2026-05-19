# Known Bugs

## Existing Bugs / Mismatches
- `home.js` submits custom effect requests to `/api/effect-requests`, but backend implements `POST /api/admin/effect-requests`.
- Admin UIs call `PUT /api/admin/effect-requests/:id`; backend has no status update route.
- `desktop/renderer/admin.html` calls `GET /api/admin/payments/:id`; backend only implements `GET /api/payment/admin/payments`.
- Gift mapping standalone page calls `/api/tiktok/available-effects`; backend has no such route.
- Renderer calls `/api/tiktok/prepare`; backend has no such route.
- Gift coins manager calls gift icon upload/add/delete/reset endpoints; backend only implements list plus coin update/bulk update.
- `home.js` calls `/api/payment/sepay-webhook`; backend has no route for it.
- Some standalone pages call protected endpoints without `Authorization: Bearer <token>` and instead use `x-machine-id`, which current middleware ignores.
- `GiftLog.effectId` is a `String`, but routes attempt `.populate('effectId')`.
- `GiftConfig.giftName` is required, but coin update routes upsert with only `giftId` and `coins`.
- `User.hasAdminUI` is used in auth/admin logic but is not defined in `UserSchema`.

## Temporary Hacks / Risky Defaults
- Admin auto-creation uses hardcoded email `admin@effectstore.vn` and default password `admin123` unless overridden.
- JWT default secret is `your-secret-key`.
- OBS default password is `obs123`.
- Encryption password has a hardcoded fallback in `backend/utils/encrypt-video.js`.
- Bank transfer information is hardcoded in `backend/routes/payment.js`.
- Electron opens DevTools on startup in `desktop/main.js`.
- Public `/api/obs/trigger` can queue OBS effects without auth.
- `/api/stream/effect/:effectId` is public and token in `/api/obs/effect/:id` is generated but not validated by the stream route.

## Ignored Warnings / Stability Risks
- Current npm test scripts are placeholders that always pass.
- README and existing docs contain encoding/mojibake artifacts.
- Several renderer files contain large inline style/script blocks, increasing regression risk.
- Video range decryption over AES-CBC may be fragile because range offsets are not block-aligned.
- `tiktokService` reconnect timer can recreate clients if not carefully controlled.
- File paths stored in Mongo may break if the project is moved.

## Unstable Modules
- Timeline/composite effects: timeline persistence exists, but runtime integration is unclear.
- Standalone admin/gift mapping/gift coin pages: API calls need reconciliation with backend routes.
