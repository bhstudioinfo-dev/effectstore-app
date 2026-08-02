# Kiến trúc LiveFlow

## Mục lục

- Tổng quan
- Runtime và cổng
- Cây trách nhiệm
- Luồng khởi động
- Luồng dữ liệu chính
- Persistence
- Branding và legacy naming

## Tổng quan

LiveFlow là ứng dụng Windows Electron phục vụ livestream đa nền tảng về mặt sản phẩm, nhưng connector live hiện tại tập trung TikTok Live. Hệ thống gồm:

- Electron desktop: cửa sổ, file picker, media local, global hotkeys, auto-launch, quản lý backend đóng gói.
- Renderer HTML/CSS/JavaScript: SPA chính, đăng nhập, cửa hàng, mapping, designer, admin, settings, Live Control.
- Express/MongoDB backend: auth, catalog, entitlement, payment, layout, mappings, TikTok, OBS.
- OBS WebSocket: tạo/cập nhật Browser Sources và theo dõi kết nối.
- Browser overlays: effect player và gift menu renderer.
- WebSocket runtime: thống kê live, progress widget, queue/playback events.

Không dùng frontend framework hay state manager. `EffectStoreApp` trong `desktop/renderer/js/home.js` là controller/state chính. `GiftMenuDesigner` là controller riêng và rất lớn.

## Runtime và cổng

- Backend HTTP/API mặc định: `127.0.0.1:9000`.
- Backend realtime WebSocket mặc định: `127.0.0.1:9001`.
- Electron local media/legacy overlay server: `127.0.0.1:8080`.
- Electron local WebSocket legacy/control: `127.0.0.1:8081`.
- OBS WebSocket mặc định: `localhost:4455`.

Xác minh constant trong source trước khi thay đổi. Backend 9000/9001 là đường active cho API, gift menu và effect playback; local 8080 phục vụ personal effects và Soundboard.

## Cây trách nhiệm

| Khu vực | File chính |
|---|---|
| Electron lifecycle/IPC/local media | `desktop/main.js`, `desktop/preload.js` |
| Packaged backend lifecycle | `desktop/backend-manager.js` |
| SPA UI/state | `desktop/renderer/index.html`, `desktop/renderer/js/home.js`, `desktop/renderer/styles/main.css` |
| Designer | `desktop/renderer/js/gift-menu-designer.js` |
| Coordinate/registry/inspector | `coordinate-engine.js`, `item-registry.js`, `inspector-engine.js` |
| Preview renderer | `desktop/renderer/js/shared-render-engine.js` |
| Backend entry | `backend/index.js`, `backend/server.js` |
| API | `backend/routes/*.js` |
| MongoDB | `backend/models/*.js` |
| Entitlements | `backend/config/planEntitlements.js` |
| TikTok | `backend/services/tiktokService.js`, `backend/routes/tiktok.js` |
| Queue/playback | `effectQueue.js`, `playbackManager.js` |
| OBS | `obsService.js`, `routes/obs.js` |
| OBS effect player | `backend/public/effect-player-overlay.html` |
| OBS gift menu | `gift-menu-overlay.html`, backend shared renderer/CSS |
| Separate goal overlay (legacy/partial) | `frontend/overlay/*` |

## Luồng khởi động

1. `desktop/main.js` tạo app directories trong Electron `userData`.
2. `backend-manager.js` khởi động backend ở dev hoặc packaged resource.
3. Electron tạo BrowserWindow với `desktop/preload.js`.
4. Renderer tạo `EffectStoreApp`, kiểm tra database setup và initial admin.
5. Khôi phục auth token, machine ID, profile và entitlement.
6. Load banner, effects, owned effects, cart, status, mapping và các module theo view.
7. Kết nối WebSocket realtime khi cần.

Main/preload chỉ được nạp khi khởi động Electron. Renderer có thể reload bằng Ctrl+R, vì vậy IPC mới có thể xuất hiện UI nhưng báo `No handler registered` cho tới khi restart app.

## Luồng dữ liệu chính

### Auth

Renderer → `/api/auth/register|login|me` → JWT → localStorage → request Authorization Bearer. Machine ID do Electron/renderer tạo và backend dùng giới hạn thiết bị.

### Gift live

TikTok connector → normalize event → mapping lookup → queue → playback manager → WebSocket `PLAY_EFFECT` → effect-player Browser Source. Đồng thời cập nhật thống kê, log và widget progress.

### Designer

Library/template/asset → item object → canvas preview → save MongoDB → build `exportedItems` → mirror active layout JSON → gift-menu Browser Source fetch/poll → OBS render.

### Payment

Cart/subscription → free claim hoặc QR/manual payment → Payment pending → proof/admin review → grant ownership/subscription → refresh user/library/statistics.

## Persistence

- MongoDB: users, effects, mappings, layouts, payments, configs, state.
- Electron userData: database config/secret, personal effects, Soundboard, hotkeys và diagnostics.
- localStorage renderer: JWT/session, cart, UI preferences, Live Control deck, một số fallback designer/settings.
- Runtime mirrors under backend uploads: active layout for overlay. Không coi đây là source fixture.
- Encrypted effect media: `backend/effects/encrypted` hoặc runtime data path khi packaged.

## Branding và legacy naming

UI/product: LiveFlow. Logo assets ở `desktop/renderer/assets/images/`.

Các tên legacy được giữ để tương thích:

- package/app IDs: `effectstore`.
- class: `EffectStoreApp`.
- source/URLs: `gift_menu`, `effect_player`.
- docs/comment cũ: EffectStore hoặc BH Studio.

Không đổi hàng loạt legacy identifiers chỉ để đồng nhất branding; đây có thể là persistence/API/source names.

