# Backend, API, dữ liệu và quyền gói

## Mục lục

- Route mounts
- API theo module
- Models
- Entitlements
- Payment/ownership
- Security và data paths

## Route mounts

`backend/server.js` mount:

- `/api` → effects routes.
- `/api/auth` → auth/profile/setup.
- `/api/admin` → admin/users/stats/requests/config.
- `/api/obs` → overlay/setup/trigger/repair.
- `/api/tiktok` → live/mapping/gifts/layout/widgets.
- `/api/payment` → checkout/free claim/status/admin review.
- `/api/settings` → OBS settings.
- `/api/banner` và `/api/admin/banner` → banner.

Static: `/uploads`, `/assets`, `/overlay`, public overlay pages. Xác minh middleware/auth của từng endpoint trước khi gọi từ OBS Browser Source vì OBS không có renderer JWT mặc định.

## API theo module

### Auth

`GET setup-status`, `POST setup-admin`, `POST register`, `POST login`, `GET me`, `PUT profile`, `POST logout`.

### Effects/store

`GET /api/effects`, trending, item detail, user effects, register/delete custom local effect, secured stream, admin create/update/delete và timeline get/update.

### Payment

Create QR, claim-free, confirm proof, poll status, Sepay webhook, admin list/proof/approve/reject. Sepay automation cần xem implementation hiện tại; manual review là đường an toàn chính.

### TikTok/mapping

Connect lifecycle, usage TTS, stats, mappings CRUD/toggle/audio/test, available effects, gifts library, logs, simulate gift và challenge wheels CRUD/test.

### Layout/designer

Layouts list/active/save/create/activate/delete, templates list/detail/use/publish, public overlay layout, goal assets/templates/upload.

### OBS

Overlay URLs, effect media, preview, setup effect, setup gift menu, trigger, sources và repair.

## Models

- `User`: email/password hash, name, phone, supportProfile, consent, subscription/expiry/devices, purchasedEffects, customEffects, spend/use/admin/status.
- `Effect`: catalog/pricing/media paths/duration/uses/trending/flash sale/timeline/composite.
- `GiftMapping`: user/session, gift, effect(s), wheel, playback mode, quantity, cooldown, audio, active.
- `GiftMenuLayout`: owner/name/version/aspect/canvas/safe area/export size/items/exportedItems/active/template/product type/pricing.
- `ChallengeWheel`: owner/template, segments, duration/auto-hide/no-repeat/presentation.
- `Payment`: user/order/effect IDs/proof/amount/status/review.
- `GiftConfig`: giftId/name/coins/status.
- `GiftLog`: gift/user/effect/session/repeat/timestamp.
- `OBSSettings`: host/port/password.
- `Banner`, `EffectRequest`, `SystemState`.
- `License`: legacy/dormant unless route wiring is added.

Đọc schema thật trước migration; docs cũ có thể thiếu fields mới.

## Entitlements

Nguồn sự thật: `backend/config/planEntitlements.js`.

| Backend key | UI | Devices | Mappings | Custom effects | Layouts | Menu assets | Goal trackers | Designer |
|---|---|---:|---:|---:|---:|---:|---:|---|
| free | Miễn phí | 1 | 5 | 5 | 1 | 0 | 1 | lite |
| basic | Basic | 1 | 30 | 100 | 2 | 20 | 10 | basic |
| pro | Pro | 1 | ∞ | ∞ | ∞ | ∞ | ∞ | advanced |
| studio | Studio | ∞ | ∞ | ∞ | ∞ | ∞ | ∞ | studio |
| admin | Admin | ∞ | ∞ | ∞ | ∞ | ∞ | ∞ | studio |

`business` là giá trị legacy chỉ giữ để đọc tài khoản/đơn hàng lịch sử. Đây không phải gói đang bán và tuyệt đối không được dùng như alias để cấp thêm quyền cho Pro. Bốn gói hiện hành duy nhất là Free, Basic, Pro và Studio.

Comments/TTS per session: Free 20 comments/10 TTS; các gói trả phí không giới hạn. Mapping automation advanced từ Pro. Free Talent tối đa 3 thí sinh.

Goal circle được miễn phí. Các widget nâng cao có thể thử và lưu bản nháp trong editor; entitlement chỉ chặn lúc xuất/phát lên OBS. Advanced layers (locked/hidden persisted), custom assets, colors/effects/animations được validate theo designer level.

Quy tắc Designer hiện hành: thao tác **Lưu** là lưu bản nháp vào thư viện và chỉ bị giới hạn theo số layout của gói; không được loại bỏ hay chặn các tính năng đang dùng thử. Thao tác **Lưu & Xuất/OBS** mới là ranh giới chặn entitlement và phải trả về lý do cụ thể cùng gói Basic được đề xuất. Free lưu tối đa 1 bản nháp, Basic 2, Pro/Studio không giới hạn.

Backend phải enforce mọi limit. UI đọc response `{upgradeRequired, code:'PLAN_LIMIT', feature, currentPlan, recommendedPlan, message}` và hiển thị đúng lý do.

## Payment/ownership

- Quy trình production hiện tại là duyệt thủ công: khách tạo QR, gửi minh chứng, Admin đăng nhập app và approve/reject. Chỉ thao tác approve của Admin mới cấp gói/sản phẩm.
- Khi `CLOUD_API_URL` được cấu hình, toàn bộ `/api/payment/*` phải proxy lên cloud, bao gồm `/admin/payments`, `/admin/proof`, `/admin/approve` và `/admin/reject`. Không được cho các route Admin payment rơi về MongoDB local.
- Auto-approval mặc định bị tắt. Không được suy luận rằng có webhook secret là được tự động cấp quyền; chỉ bật khi `PAYMENT_AUTO_APPROVAL_ENABLED=true` sau một dự án nâng cấp và kiểm thử riêng.
- Giá 0: `/claim-free`, grant ownership và ghi acquisition.
- Có phí: create order/QR → proof/pending → admin approve/reject → ownership/subscription.
- Effect đã mua sở hữu vĩnh viễn theo copy sản phẩm; subscription mở giới hạn/công cụ, không xóa effect đã mua khi hết hạn.
- Gói Pro/Studio không tự động sở hữu template, Goal Board hay Challenge Wheel trả phí. Khách vẫn phải mua đúng sản phẩm Store; chỉ admin và tài khoản `business` legacy giữ quyền bundle lịch sử.
- Không tạo đơn `SUBSCRIPTION_BUSINESS` mới. Đơn lịch sử vẫn có thể được xử lý để bảo toàn dữ liệu cũ.
- Template/design product ownership phải phân biệt với việc “đang active”.
- Admin stats cần tính cả acquisition miễn phí và trả phí, cùng usage.

## Security và data paths

- Auth/admin middleware bắt buộc cho routes quản trị.
- Rate limit auth/API và security headers.
- Network mặc định loopback; không tự bind public LAN khi chưa có threat model.
- Secrets/config packaged lưu qua Electron safeStorage/backend manager.
- Media upload validate extension, MIME, size và filename; không tin client path.
- Encrypted effect streaming dùng token ngắn hạn; không expose plaintext path.
- Runtime directories lấy qua `backend/config/dataPaths.js`, không hardcode repo paths cho packaged app.
