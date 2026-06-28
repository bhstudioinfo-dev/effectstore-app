# Full Feature Matrix - BH Studio / EffectStore

Generated from source inspection on 2026-06-28. Scope inspected: root app files, `backend/`, `desktop/`, `frontend/overlay/`, `admin/`, and existing docs. Dependency internals and binary/media assets were not treated as feature code.

Status terms:

- **Working**: code path, visible UI, and matching backend/API path are present.
- **Partially working**: feature is present but has route drift, missing validation, fragile runtime coupling, or incomplete behavior.
- **Unfinished**: visible or referenced, but important implementation is missing.
- **Dormant**: code/model/helper exists but is not wired into the active app path.
- **Hidden**: code exists but UI is admin-only, conditionally hidden, or not exposed.
- **Unknown runtime**: code exists, but depends on external OBS/TikTok/payment/browser runtime not verified here.

## Feature Matrix

| Feature | Module | Exists in Code | Visible UI | Working Status | Related Files |
|---|---|---:|---:|---|---|
| Email/password registration | Authentication | Yes | Yes | Working | `backend/routes/auth.js`, `backend/models/User.js`, `desktop/renderer/index.html`, `desktop/renderer/js/home.js` |
| Email/password login | Authentication | Yes | Yes | Working | `backend/routes/auth.js`, `backend/middleware/auth.js`, `desktop/renderer/index.html`, `desktop/renderer/js/home.js` |
| JWT session restore | Authentication | Yes | Yes | Working | `backend/routes/auth.js`, `backend/middleware/auth.js`, `desktop/renderer/js/home.js` |
| Admin auto-bootstrap | Authentication | Yes | Hidden | Working but risky | `backend/routes/auth.js`, `backend/models/User.js` |
| Machine/device id login limits | Authentication | Yes | Hidden | Partially working | `backend/routes/auth.js`, `desktop/main.js`, `desktop/renderer/preload.js`, `desktop/renderer/js/home.js` |
| Admin role gating | Authentication | Yes | Hidden | Working | `backend/middleware/auth.js`, `backend/routes/admin.js`, `backend/routes/effects.js`, `desktop/renderer/js/home.js` |
| User profile card and plan badge | Authentication | Yes | Yes | Working | `desktop/renderer/index.html`, `desktop/renderer/js/home.js`, `backend/models/User.js` |
| Account/settings profile summary | Authentication | Yes | Yes | Working | `desktop/renderer/index.html`, `desktop/renderer/js/home.js` |
| Effect catalog/store grid | Store | Yes | Yes | Working | `backend/routes/effects.js`, `backend/models/Effect.js`, `desktop/renderer/index.html`, `desktop/renderer/js/home.js` |
| Category filtering | Store | Yes | Yes | Working | `desktop/renderer/index.html`, `desktop/renderer/js/home.js`, `backend/routes/effects.js` |
| Search effects | Store | Yes | Yes | Working | `desktop/renderer/index.html`, `desktop/renderer/js/home.js`, `backend/routes/effects.js` |
| Trending effects carousel/list | Store | Yes | Yes | Working | `backend/routes/effects.js`, `desktop/renderer/js/home.js` |
| Flash sale cards/timers | Store | Yes | Yes | Partially working | `backend/models/Effect.js`, `backend/routes/effects.js`, `desktop/renderer/index.html`, `desktop/renderer/js/home.js` |
| Effect detail modal | Store | Yes | Yes | Working | `desktop/renderer/index.html`, `desktop/renderer/js/home.js`, `backend/routes/effects.js` |
| Cart sidebar | Store | Yes | Yes | Working | `desktop/renderer/index.html`, `desktop/renderer/js/home.js` |
| Add/remove cart item | Store | Yes | Yes | Working | `desktop/renderer/js/home.js` |
| Pending payment state in UI | Store | Yes | Yes | Partially working | `desktop/renderer/js/home.js`, `backend/routes/payment.js` |
| Public banner display | Store | Yes | Yes | Working | `backend/routes/banner.js`, `backend/models/Banner.js`, `desktop/renderer/js/home.js` |
| Premium CTA card | Store | Yes | Yes | Working UI only | `desktop/renderer/index.html`, `desktop/renderer/js/home.js` |
| Marketplace priced effects | Marketplace | Yes | Yes | Working | `backend/models/Effect.js`, `backend/routes/effects.js`, `desktop/renderer/js/home.js` |
| Marketplace purchases through cart | Marketplace | Yes | Yes | Partially working | `backend/routes/payment.js`, `backend/models/Payment.js`, `backend/models/User.js`, `desktop/renderer/js/home.js` |
| Owned effect license/ownership | Marketplace | Yes | Yes | Partially working | `backend/models/User.js`, `backend/routes/effects.js`, `backend/routes/payment.js`, `desktop/renderer/js/home.js` |
| Effect preview video streaming | Marketplace | Yes | Yes | Working, fragile | `backend/routes/effects.js`, `backend/utils/encrypt-video.js`, `desktop/renderer/js/home.js` |
| Encrypted effect storage/DRM | Marketplace | Yes | Hidden | Partially working | `backend/utils/encrypt-video.js`, `backend/routes/effects.js`, `backend/effects/encrypted/` |
| Template marketplace for menu layouts | Marketplace | Partial | Yes | Unfinished | `desktop/renderer/js/gift-menu-designer.js`, `backend/routes/tiktok.js`, `backend/models/GiftMenuLayout.js` |
| Premium template price tags | Marketplace | Yes | Yes | Visible but not enforced | `desktop/renderer/js/gift-menu-designer.js` |
| Template buy/use action | Marketplace | Partial | Yes | Partially broken | `desktop/renderer/js/gift-menu-designer.js`; missing `window.app.buyOrUseMenuTemplate` in `home.js` |
| Gift library | Gift Mapping | Yes | Yes | Working | `backend/routes/tiktok.js`, `backend/assets/gift-icons/`, `backend/models/GiftConfig.js`, `desktop/renderer/js/home.js`, `desktop/renderer/gift-mapping.html` |
| Live TikTok gift catalog sync | Gift Mapping | Yes | Hidden | Unknown runtime | `backend/services/tiktokService.js`, `backend/routes/tiktok.js`, `backend/server.js` |
| Map gift to effect | Gift Mapping | Yes | Yes | Working | `backend/routes/tiktok.js`, `backend/models/GiftMapping.js`, `desktop/renderer/js/home.js`, `desktop/renderer/gift-mapping.html` |
| Mapping limits by subscription | Gift Mapping | Yes | Hidden | Working | `backend/routes/tiktok.js`, `backend/models/User.js` |
| Toggle mapping active/inactive | Gift Mapping | Yes | Yes | Working | `backend/routes/tiktok.js`, `desktop/renderer/js/home.js`, `desktop/renderer/gift-mapping.html` |
| Delete mapping | Gift Mapping | Yes | Yes | Working | `backend/routes/tiktok.js`, `desktop/renderer/js/home.js`, `desktop/renderer/gift-mapping.html` |
| Test mapping trigger | Gift Mapping | Yes | Yes | Working if OBS connected | `backend/routes/tiktok.js`, `backend/routes/obs.js`, `backend/services/effectQueue.js`, `desktop/renderer/js/home.js` |
| Simulate gift trigger | Gift Mapping | Yes | Hidden/API only | Working if OBS connected | `backend/routes/tiktok.js` |
| Gift trigger logs | Gift Mapping | Yes | Yes | Partially working | `backend/models/GiftLog.js`, `backend/routes/tiktok.js`, `desktop/renderer/js/home.js`, `desktop/renderer/gift-mapping.html` |
| Standalone gift mapping page | Gift Mapping | Yes | Standalone | Working/legacy | `desktop/renderer/gift-mapping.html`, `backend/routes/tiktok.js` |
| OBS WebSocket connection | OBS Engine | Yes | Settings/status | Unknown runtime | `backend/services/obsService.js`, `backend/server.js`, `backend/routes/settings.js`, `desktop/renderer/js/home.js` |
| OBS settings save | OBS Engine | Yes | Yes | Working, risky storage | `backend/routes/settings.js`, `backend/models/OBSSettings.js`, `desktop/renderer/index.html`, `desktop/renderer/js/home.js` |
| OBS system status card | OBS Engine | Yes | Yes | Working | `backend/server.js`, `backend/services/obsService.js`, `desktop/renderer/js/home.js` |
| OBS source listing | OBS Engine | Yes | Hidden/admin tooling | Working if OBS connected | `backend/routes/obs.js`, `desktop/renderer/js/home.js` |
| Setup effect Browser Source | OBS Engine | Yes | Hidden behind trigger/setup | Working if OBS connected | `backend/routes/obs.js`, `backend/services/obsService.js`, `desktop/renderer/js/home.js` |
| Trigger effect in OBS | OBS Engine | Yes | Yes | Working if OBS connected | `backend/routes/obs.js`, `backend/services/effectQueue.js`, `backend/services/obsService.js`, `desktop/renderer/js/home.js` |
| Sequential effect queue | OBS Engine | Yes | Hidden | Working | `backend/services/effectQueue.js`, `backend/routes/obs.js` |
| Duplicate/stacked trigger endpoint | OBS Engine | Referenced only | Hidden | Broken | `desktop/renderer/js/home.js`; missing `/api/obs/trigger-with-duplicate` |
| Timeline/composite editor | OBS Engine | Yes | Yes | Partially working | `desktop/renderer/index.html`, `desktop/renderer/js/home.js`, `backend/routes/effects.js`, `backend/models/Effect.js` |
| Timeline runtime playback | OBS Engine | Dormant | No | Dormant/unfinished | `backend/obs-controller.js`; active `obsService.js` does not consume `Effect.timeline` |
| Webcam auto-detect/layer animation | OBS Engine | Dormant | No | Dormant | `backend/obs-controller.js` |
| Legacy OBS media source setup | OBS Engine | Dormant | No | Dormant | `backend/obs-auto-setup.js` |
| Electron local overlay server | OBS Engine | Yes | Hidden/OBS URL | Dormant/legacy | `desktop/main.js`, `desktop/renderer/overlay.html` |
| TikTok prepare endpoint | TikTok Connector | Yes | Yes | Working | `backend/routes/tiktok.js`, `desktop/renderer/js/home.js`, `desktop/renderer/gift-mapping.html` |
| TikTok connect/disconnect | TikTok Connector | Yes | Yes | Unknown runtime | `backend/routes/tiktok.js`, `backend/services/tiktokService.js`, `desktop/renderer/js/home.js`, `desktop/renderer/gift-mapping.html` |
| Live stats for gifts/likes/chats/viewers | TikTok Connector | Yes | Yes | Unknown runtime | `backend/services/tiktokService.js`, `backend/routes/tiktok.js`, `backend/server.js`, `desktop/renderer/js/home.js` |
| TikTok WebSocket broadcasts | TikTok Connector | Yes | Hidden | Working if backend live | `backend/server.js`, `backend/services/tiktokService.js`, `desktop/renderer/js/home.js`, `desktop/renderer/gift-mapping.html` |
| TikTok auto reconnect | TikTok Connector | Partial | Settings checkbox | Unfinished/partial | `backend/services/tiktokService.js`, `desktop/renderer/index.html`, `desktop/renderer/js/home.js` |
| TikTok username saved setting | TikTok Connector | Yes | Yes | Working local-only | `desktop/renderer/index.html`, `desktop/renderer/js/home.js` |
| Comment event listener | Comment Reader | Yes | Hidden/live path | Unknown runtime | `backend/services/tiktokService.js`, `desktop/renderer/js/home.js` |
| Comment reader UI/list | Comment Reader | Partial | No dedicated UI | Unfinished | `desktop/renderer/js/home.js`, `backend/services/tiktokService.js` |
| Read donor comment after large gift | Comment Reader | Yes | Hidden | Partially working | `desktop/renderer/js/home.js` |
| Chat counter | Comment Reader | Yes | Yes | Unknown runtime | `backend/services/tiktokService.js`, `desktop/renderer/js/home.js`, `desktop/renderer/gift-mapping.html` |
| Gift thank-you TTS | TTS | Yes | Yes | Partially working | `desktop/renderer/js/home.js`, `desktop/renderer/index.html` |
| Follow/share TTS | TTS | Yes | Yes | Partially working | `desktop/renderer/js/home.js`, `desktop/renderer/index.html` |
| TTS threshold for donor comments | TTS | Yes | Yes | Working local-only | `desktop/renderer/js/home.js`, `desktop/renderer/index.html` |
| TTS queue | TTS | Yes | Hidden | Working local-only | `desktop/renderer/js/home.js` |
| TTS voice selection | TTS | Partial | Mostly hidden/missing visible select | Partially broken | `desktop/renderer/js/home.js`, `desktop/renderer/index.html` |
| TTS volume setting | TTS | Partial | No clear UI | Hidden/partial | `desktop/renderer/js/home.js` |
| Google Translate TTS audio playback | TTS | Yes | Hidden | Fragile external dependency | `desktop/renderer/js/home.js` |
| Integrated admin dashboard | Admin Dashboard | Yes | Admin only | Working | `desktop/renderer/index.html`, `desktop/renderer/js/home.js`, `backend/routes/admin.js`, `backend/routes/payment.js` |
| Admin stats/revenue cards | Admin Dashboard | Yes | Admin only | Working | `backend/routes/admin.js`, `desktop/renderer/js/home.js` |
| Admin payment approvals | Admin Dashboard | Yes | Admin only | Working | `backend/routes/payment.js`, `backend/models/Payment.js`, `desktop/renderer/js/home.js` |
| Admin payment rejection | Admin Dashboard | Yes | Admin only | Working | `backend/routes/payment.js`, `desktop/renderer/js/home.js` |
| Admin user list | Admin Dashboard | Yes | Admin only | Working | `backend/routes/admin.js`, `backend/models/User.js`, `desktop/renderer/js/home.js` |
| Admin subscription assignment | Admin Dashboard | Yes | Admin only | Working | `backend/routes/admin.js`, `desktop/renderer/js/home.js` |
| Admin user delete | Admin Dashboard | Yes | Admin only | Working | `backend/routes/admin.js`, `desktop/renderer/js/home.js` |
| Admin effect upload | Admin Dashboard | Yes | Admin only | Working | `backend/routes/effects.js`, `desktop/renderer/index.html`, `desktop/renderer/js/home.js` |
| Admin effect edit/delete | Admin Dashboard | Yes | Admin only | Working | `backend/routes/effects.js`, `desktop/renderer/js/home.js` |
| Admin fake uses | Admin Dashboard | Yes | Admin only | Working | `backend/routes/effects.js`, `desktop/renderer/js/home.js` |
| Admin trending management | Admin Dashboard | Yes | Admin only | Working | `backend/routes/effects.js`, `desktop/renderer/js/home.js` |
| Admin flash sale management | Admin Dashboard | Yes | Admin only | Working/partial | `backend/routes/effects.js`, `desktop/renderer/index.html`, `desktop/renderer/js/home.js` |
| Admin custom effect requests | Admin Dashboard | Yes | Admin only | Working | `backend/routes/admin.js`, `backend/models/EffectRequest.js`, `desktop/renderer/js/home.js` |
| Admin gift coins manager | Admin Dashboard | Yes | Standalone/admin | Working | `backend/routes/admin.js`, `backend/models/GiftConfig.js`, `desktop/renderer/gift-coins-manager.html` |
| Admin gift icon manager | Admin Dashboard | Yes | Standalone/admin | Working | `backend/routes/admin.js`, `backend/assets/gift-icons/`, `desktop/renderer/gift-coins-manager.html` |
| Admin banner manager | Admin Dashboard | Yes | Standalone/admin | Working | `backend/routes/banner.js`, `backend/models/Banner.js`, `desktop/renderer/admin-banner.html` |
| Standalone admin dashboard | Admin Dashboard | Yes | Standalone | Legacy/partial | `desktop/renderer/admin.html`, `admin/index.html`, `backend/routes/admin.js`, `backend/routes/payment.js` |
| Pricing modal | Subscription | Yes | Yes | Working UI | `desktop/renderer/index.html`, `desktop/renderer/js/home.js` |
| Pro/Business subscription purchase | Subscription | Yes | Yes | Partially working | `desktop/renderer/js/home.js`, `backend/routes/payment.js`, `backend/models/User.js` |
| Studio/contact plan | Subscription | Yes | Yes | Contact-only | `desktop/renderer/index.html`, `desktop/renderer/js/home.js` |
| Subscription expiry downgrade | Subscription | Yes | Hidden | Working | `backend/routes/auth.js`, `backend/models/User.js` |
| Subscription device limits | Subscription | Yes | Hidden | Working | `backend/routes/auth.js`, `desktop/main.js`, `desktop/renderer/js/home.js` |
| Subscription mapping limits | Subscription | Yes | Hidden | Working | `backend/routes/tiktok.js` |
| Premium feature gating in UI | Subscription | Partial | Partial | Incomplete | `desktop/renderer/index.html`, `desktop/renderer/js/home.js`, `desktop/renderer/js/gift-menu-designer.js` |
| Gift Menu Designer canvas | Menu Designer | Yes | Yes | Working | `desktop/renderer/js/gift-menu-designer.js`, `desktop/renderer/styles/gift-menu-designer.css`, `desktop/renderer/index.html` |
| Drag/drop gift to canvas | Menu Designer | Yes | Yes | Working | `desktop/renderer/js/gift-menu-designer.js` |
| Move/resize/rotate items | Menu Designer | Yes | Yes | Working | `desktop/renderer/js/gift-menu-designer.js`, `desktop/renderer/styles/gift-menu-designer.css` |
| Multi-select items | Menu Designer | Yes | Yes | Partially working | `desktop/renderer/js/gift-menu-designer.js` |
| Undo/redo history | Menu Designer | Yes | Yes | Working | `desktop/renderer/js/gift-menu-designer.js` |
| Layer panel | Menu Designer | Yes | Yes | Working | `desktop/renderer/js/gift-menu-designer.js` |
| Lock/hide layers | Menu Designer | Yes | Yes | Working | `desktop/renderer/js/gift-menu-designer.js` |
| Group movement | Menu Designer | Partial | Partial | Partially working | `desktop/renderer/js/gift-menu-designer.js` |
| Group creation/scaling | Menu Designer | Partial | No | Unfinished | `desktop/renderer/js/gift-menu-designer.js` |
| Aspect ratio modes 9:16/16:9/1:1 | Menu Designer | Yes | Yes | Working | `desktop/renderer/js/gift-menu-designer.js` |
| Zoom/pan canvas | Menu Designer | Yes | Yes | Working | `desktop/renderer/js/gift-menu-designer.js` |
| Alignment/distribution tools | Menu Designer | Yes | Yes | Working/partial | `desktop/renderer/js/gift-menu-designer.js` |
| Save layout | Menu Designer | Yes | Yes | Working | `backend/routes/tiktok.js`, `backend/models/GiftMenuLayout.js`, `desktop/renderer/js/gift-menu-designer.js` |
| Multiple layouts/my library | Menu Designer | Yes | Yes | Working | `backend/routes/tiktok.js`, `desktop/renderer/js/gift-menu-designer.js` |
| Activate layout | Menu Designer | Yes | Yes | Working | `backend/routes/tiktok.js`, `desktop/renderer/js/gift-menu-designer.js` |
| Delete/rename layout | Menu Designer | Yes | Yes | Partially working | `desktop/renderer/js/gift-menu-designer.js`, `backend/routes/tiktok.js` |
| Built-in templates | Menu Designer | Yes | Yes | Working | `desktop/renderer/js/gift-menu-designer.js` |
| Template publishing | Menu Designer | Partial | Admin only | Partially working | `desktop/renderer/js/gift-menu-designer.js`, `backend/routes/tiktok.js`, `backend/models/GiftMenuLayout.js` |
| Asset library tab | Menu Designer | Yes | Yes | Unfinished | `desktop/renderer/js/gift-menu-designer.js`, `backend/routes/tiktok.js` |
| Upload custom goal asset | Menu Designer | Partial | Yes | Broken/stubbed | `desktop/renderer/js/gift-menu-designer.js`, `backend/routes/tiktok.js` |
| Text layer/widget | Menu Designer | Yes | Yes | Working | `desktop/renderer/js/gift-menu-designer.js`, `backend/public/gift-menu-overlay.html` |
| Aura/animation effects for gift icons | Menu Designer | Yes | Yes | Working | `desktop/renderer/js/gift-menu-designer.js`, `desktop/renderer/styles/gift-menu-designer.css`, `backend/public/gift-menu-renderer.css` |
| Goal bar widget | Menu Designer | Yes | Yes | Working | `desktop/renderer/js/gift-menu-designer.js`, `frontend/overlay/goal-board-overlay.js`, `backend/public/gift-menu-overlay.html` |
| Goal circle widget | Menu Designer | Yes | Yes | Partially working | `desktop/renderer/js/gift-menu-designer.js`, `backend/public/gift-menu-overlay.html` |
| Boss bar widget | Menu Designer | Yes | Yes | Working | `desktop/renderer/js/gift-menu-designer.js`, `frontend/overlay/goal-board-overlay.js` |
| Combo widget | Menu Designer | Yes | Yes | Working | `desktop/renderer/js/gift-menu-designer.js`, `frontend/overlay/goal-board-overlay.js` |
| Mystery chest widget | Menu Designer | Yes | Yes | Working | `desktop/renderer/js/gift-menu-designer.js`, `frontend/overlay/goal-board-overlay.js` |
| Goal list widget | Menu Designer | Yes | Yes | Working | `desktop/renderer/js/gift-menu-designer.js`, `frontend/overlay/goal-board-overlay.js` |
| Top contributors leaderboard widget | Menu Designer | Yes | Yes | Partially working | `desktop/renderer/js/gift-menu-designer.js`, `frontend/overlay/goal-board-overlay.js`, `backend/services/tiktokService.js` |
| Podium leaderboard widget | Menu Designer | Yes | Yes | Partially working | `desktop/renderer/js/gift-menu-designer.js`, `frontend/overlay/goal-board-overlay.js`, `backend/services/tiktokService.js` |
| Simulated gift progress in designer | Menu Designer | Yes | Yes | Working local/designer | `desktop/renderer/js/gift-menu-designer.js` |
| Reset goal widget progress | Menu Designer | Yes | Yes | Working local/designer | `desktop/renderer/js/gift-menu-designer.js` |
| Save and export gift menu to OBS | Overlay Export | Yes | Yes | Working if OBS connected; overlay auth risk | `desktop/renderer/js/gift-menu-designer.js`, `backend/routes/obs.js`, `backend/public/gift-menu-overlay.html`, `backend/routes/tiktok.js` |
| Backend gift menu overlay | Overlay Export | Yes | OBS/browser source | Partially working | `backend/public/gift-menu-overlay.html`, `backend/public/gift-menu-renderer.css`, `backend/routes/tiktok.js` |
| Active layout JSON mirror | Overlay Export | Yes | Hidden | Working but fragile | `backend/routes/tiktok.js`, `backend/uploads/gift-menu-layout.json` |
| Effect Browser Source overlay | Overlay Export | Yes | OBS/browser source | Working if OBS connected | `backend/routes/obs.js`, `backend/routes/effects.js`, `backend/services/obsService.js` |
| Goal board separate overlay | Overlay Export | Partial | Hidden/OBS URL only | Partially broken | `frontend/overlay/goal-board-overlay.html`, `frontend/overlay/goal-board-overlay.js`, `backend/routes/tiktok.js` |
| Goal board live progress WebSocket | Overlay Export | Partial | Hidden | Partially working | `backend/services/tiktokService.js`, `backend/server.js`, `frontend/overlay/goal-board-overlay.js` |
| Legacy Electron icon overlay | Overlay Export | Yes | Hidden/standalone | Dormant/legacy | `desktop/main.js`, `desktop/renderer/overlay.html` |
| Owned effects library | Effect Library | Yes | Yes | Working | `backend/routes/effects.js`, `backend/models/User.js`, `desktop/renderer/index.html`, `desktop/renderer/js/home.js` |
| Admin all-effects library | Effect Library | Yes | Admin only | Working | `backend/routes/effects.js`, `desktop/renderer/js/home.js` |
| Trigger owned effect from library | Effect Library | Yes | Yes | Working if OBS connected | `desktop/renderer/js/home.js`, `backend/routes/obs.js` |
| Test try effect before purchase | Effect Library | Yes | Yes | Working if OBS connected | `desktop/renderer/js/home.js`, `backend/routes/obs.js` |
| Effect duration detection | Effect Library | Yes | Hidden | Working if ffprobe exists | `backend/routes/effects.js` |
| Effect thumbnails | Effect Library | Yes | Yes | Working | `backend/routes/effects.js`, `backend/uploads/thumbs/`, `desktop/renderer/js/home.js` |
| Custom effect request/contact | Custom User Uploads | Yes | Yes | Working | `backend/server.js`, `backend/routes/admin.js`, `backend/models/EffectRequest.js`, `desktop/renderer/index.html`, `desktop/renderer/js/home.js` |
| User custom effect upload | Custom User Uploads | No | No | Missing | No user-facing upload route; admin upload only in `backend/routes/effects.js` |
| Admin custom effect upload | Custom User Uploads | Yes | Admin only | Working | `backend/routes/effects.js`, `desktop/renderer/index.html`, `desktop/renderer/js/home.js` |
| Custom uploaded menu/goal assets | Custom User Uploads | Partial | Yes | Broken/stubbed | `desktop/renderer/js/gift-menu-designer.js`, `backend/routes/tiktok.js` |
| Payment QR generation | Payment System | Yes | Yes | Working | `backend/routes/payment.js`, `desktop/renderer/js/home.js` |
| Payment proof upload | Payment System | Yes | Yes | Working | `backend/routes/payment.js`, `desktop/renderer/js/home.js` |
| Payment status polling | Payment System | Yes | Yes | Working | `backend/routes/payment.js`, `desktop/renderer/js/home.js` |
| Sepay webhook endpoint | Payment System | Yes | Hidden/API | Stub/no-op | `backend/routes/payment.js`, `desktop/renderer/js/home.js` |
| Manual admin payment approval | Payment System | Yes | Admin only | Working | `backend/routes/payment.js`, `desktop/renderer/js/home.js`, `desktop/renderer/admin.html` |
| Payment rejection reason | Payment System | Partial | Admin only | Partially working | `backend/routes/payment.js`, `desktop/renderer/js/home.js`, `desktop/renderer/admin.html` |
| Payment proof image review | Payment System | Yes | Admin standalone | Working/partial | `backend/routes/payment.js`, `desktop/renderer/admin.html`, `backend/routes/admin.js` |
| Hardcoded bank transfer details | Payment System | Yes | Yes | Working but risky | `backend/routes/payment.js` |
| Basic/Pro/Business pricing copy | Premium Features | Yes | Yes | Working UI | `desktop/renderer/index.html`, `desktop/renderer/js/home.js` |
| Premium subscription unlock for mapping limits | Premium Features | Yes | Hidden | Working | `backend/routes/tiktok.js`, `backend/routes/payment.js`, `backend/routes/admin.js` |
| Premium subscription unlock for device limits | Premium Features | Yes | Hidden | Working | `backend/routes/auth.js`, `backend/routes/payment.js`, `backend/routes/admin.js` |
| Business plan all-effect access in UI | Premium Features | Yes | Hidden behavior | Partially working | `desktop/renderer/js/home.js` |
| Premium Menu Designer widgets/templates | Premium Features | Partial | Yes | Not enforced | `desktop/renderer/js/gift-menu-designer.js` |
| Premium marketplace effect flags | Premium Features | Yes | Yes | Working | `backend/models/Effect.js`, `desktop/renderer/js/home.js` |
| License keys | Premium Features | Model only | No | Dormant | `backend/models/License.js`, `backend/models/User.js` |
| Auto-start at OS login | Premium Features | Partial | Settings checkbox | Partially working | `desktop/main.js`, `desktop/renderer/index.html`, `desktop/renderer/js/home.js` |
| Sound alert setting | Premium Features | Partial | Yes | Local-only/unclear use | `desktop/renderer/index.html`, `desktop/renderer/js/home.js` |
| Hotkeys for effect slots | Premium Features | Yes | No clear UI | Dormant/hidden | `desktop/main.js` |
| Local `.eff` save/load IPC | Premium Features | Yes | No clear UI | Dormant/hidden | `desktop/main.js` |

## Dormant Features

| Feature | Why Dormant | Related Files |
|---|---|---|
| License key system | `License` model exists, but no active route or UI uses it. | `backend/models/License.js`, `backend/models/User.js` |
| OBS timeline/webcam animation engine | Rich controller exists, but active OBS trigger path uses `obsService.triggerOBSEffect` and does not call `obs-controller.js`. | `backend/obs-controller.js`, `backend/services/obsService.js` |
| OBS auto media-source setup | Separate helper exists but is not mounted in active routes. | `backend/obs-auto-setup.js` |
| Electron local overlay | Local 8080/8081 overlay exists, but active OBS source flow uses backend 9000 browser sources. | `desktop/main.js`, `desktop/renderer/overlay.html` |
| Hotkey slots | IPC and global shortcuts exist, but no current visible hotkey mapping UI was found. | `desktop/main.js` |
| Local `.eff` file save/load | IPC exists, but no clear visible UI path uses it. | `desktop/main.js` |
| Maintenance scripts | One-off sync/restore scripts exist outside runtime. | `backend/sync_user_effects.js`, `backend/find_chao_effect.js`, `backend/restore_chao_effect.js`, `backend/update_chao_effect.js`, `scratch/*.js` |

## Unfinished Features

| Feature | Unfinished Evidence | Related Files |
|---|---|---|
| User custom effect upload | User can request custom effects, but actual upload/create is admin-only. | `desktop/renderer/index.html`, `desktop/renderer/js/home.js`, `backend/routes/effects.js`, `backend/routes/admin.js` |
| Goal board asset upload | UI accepts assets, backend route returns `{ asset: null }`. | `desktop/renderer/js/gift-menu-designer.js`, `backend/routes/tiktok.js` |
| Goal board templates API | UI loads templates, backend returns empty mock `customTemplates`. | `desktop/renderer/js/gift-menu-designer.js`, `backend/routes/tiktok.js` |
| Separate goal board overlay route | Overlay fetches `/api/tiktok/goal-board/layout`, but current backend route list does not implement that path. | `frontend/overlay/goal-board-overlay.js`, `backend/routes/tiktok.js` |
| Template monetization/ownership | Template price/isPremium metadata exists, but purchase/ownership gate is missing. | `desktop/renderer/js/gift-menu-designer.js`, `backend/models/GiftMenuLayout.js` |
| `buyOrUseMenuTemplate` integration | Designer calls `window.app.buyOrUseMenuTemplate`, but no matching `home.js` function found. | `desktop/renderer/js/gift-menu-designer.js`, `desktop/renderer/js/home.js` |
| Group creation/scaling in designer | Group metadata/movement exists, but no complete group creation/scaling workflow. | `desktop/renderer/js/gift-menu-designer.js` |
| TTS voice/volume controls | Code references selected voices and volume, but visible controls are incomplete or not clearly wired. | `desktop/renderer/js/home.js`, `desktop/renderer/index.html` |
| TikTok auto reconnect setting | Backend reconnects after disconnect, frontend setting is local-only. | `backend/services/tiktokService.js`, `desktop/renderer/js/home.js` |

## Hidden Features

| Feature | Hidden/Conditional Surface | Related Files |
|---|---|---|
| Admin nav/dashboard | Hidden unless authenticated user is admin. | `desktop/renderer/index.html`, `desktop/renderer/js/home.js`, `backend/routes/auth.js` |
| Admin publish layout to store | Button hidden unless `GiftMenuDesigner.isAdmin`. | `desktop/renderer/js/gift-menu-designer.js` |
| OBS setup internals | Mostly executed through trigger/export buttons, not shown directly. | `backend/routes/obs.js`, `backend/services/obsService.js` |
| DRM/encrypted effect files | Backend-only storage/streaming. | `backend/utils/encrypt-video.js`, `backend/routes/effects.js` |
| Device/subscription enforcement | Applied during login/mapping, not surfaced as a management UI except plan badges. | `backend/routes/auth.js`, `backend/routes/tiktok.js` |
| Sepay webhook | API endpoint only; no full automation. | `backend/routes/payment.js` |
| Gift catalog live sync | WebSocket event and backend state, but only visible indirectly through gift library refresh. | `backend/services/tiktokService.js`, `backend/server.js` |

## Partially Broken / High-Risk Features

| Feature | Issue | Related Files |
|---|---|---|
| Gift menu overlay auth | Overlay fetches `/api/tiktok/gift-menu-layout` without token, while route uses `authMiddleware`. This can break OBS rendering unless auth is bypassed elsewhere. | `backend/public/gift-menu-overlay.html`, `backend/routes/tiktok.js` |
| OBS duplicate trigger | Frontend can choose `/api/obs/trigger-with-duplicate`, but no backend route exists. | `desktop/renderer/js/home.js`, `backend/routes/obs.js` |
| Payment automation | Webhook is no-op; approval remains manual. | `backend/routes/payment.js`, `desktop/renderer/js/home.js` |
| Payment proof review split | Integrated admin and standalone admin use different route patterns; current backend supports some but not every legacy call. | `desktop/renderer/js/home.js`, `desktop/renderer/admin.html`, `backend/routes/payment.js`, `backend/routes/admin.js` |
| Effect timeline runtime | Timeline save/edit exists, but active OBS trigger does not run timeline keyframes. | `desktop/renderer/js/home.js`, `backend/routes/effects.js`, `backend/obs-controller.js`, `backend/services/obsService.js` |
| Goal board overlay | Renderer and TikTok service have live-progress code, but route coverage is incomplete. | `frontend/overlay/goal-board-overlay.js`, `backend/services/tiktokService.js`, `backend/routes/tiktok.js` |
| Menu Designer premium templates | Premium tags and prices render, but ownership/subscription validation is missing. | `desktop/renderer/js/gift-menu-designer.js`, `backend/routes/tiktok.js` |
| TTS playback | Uses Google Translate TTS audio URL from renderer, which may be rate-limited/CORS/network fragile. | `desktop/renderer/js/home.js` |
| Encrypted range streaming | AES-CBC range reads may be fragile because byte ranges are not block-aligned. | `backend/utils/encrypt-video.js`, `backend/routes/effects.js` |
| Electron security posture | `nodeIntegration: true`, `contextIsolation: false`, `webSecurity: false`, and DevTools opened by default. | `desktop/main.js` |

