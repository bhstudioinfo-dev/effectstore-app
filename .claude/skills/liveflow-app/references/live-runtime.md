# TikTok, queue, OBS và overlay runtime

## Mục lục

- TikTok connector
- Mapping resolution
- Central effect queue
- Effect player
- Gift menu overlay
- OBS integration
- Audio
- Realtime events
- Debug checklist

## TikTok connector

`tiktokService.js` quản lý kết nối TikTok Live, stats, gifts/chats/follows/shares và reconnect. Routes `/api/tiktok/prepare`, `/connect`, `/disconnect`, `/stats` phục vụ UI. Gift config cung cấp coins/icon/name.

Live events phải gắn đúng user/session để không dùng mapping của tài khoản khác. Khi reconnect hoặc chuyển user, dọn listeners/state cũ.

## Mapping resolution

`GiftMapping` hỗ trợ legacy `effectId` và mảng `effects`, random/sequential, quantity conditions, cooldown, audio, wheel và active state. Mapping advanced bị entitlement gate ở backend.

Flow gift:

1. Normalize giftId/name/count/repeat.
2. Tìm mapping active của user/session.
3. Kiểm quantity/cooldown.
4. Resolve effect/group/wheel.
5. Log acquisition/use và update widgets nếu liên quan.
6. Add visual effect vào queue.

## Central effect queue

`effectQueue.js` + `playbackManager.js` là nguồn duy nhất cho visual playback active.

Nguồn trigger gồm:

- `preview_effect`: click preview/Live Control.
- `test_mapping`: nút Test.
- `live_mapping`: gift TikTok/simulated live.

Queue FIFO tránh overlap. Playback manager resolve media/token/duration, broadcast started, chờ duration/safety timeout, broadcast finished và dequeue item kế tiếp. Queue status phục vụ countdown UI.

Không broadcast `PLAY_EFFECT` trực tiếp từ route mới nếu có thể enqueue.

## Effect player

OBS Browser Source tải `effect-player-overlay.html`, nhận WebSocket event, fetch media từ `/api/obs/effect-player-media/:effectId` hoặc secured stream endpoint và phát video alpha. Audio options theo payload/mapping.

Effect files marketplace được bảo vệ bằng encrypted storage/access token. Personal effect local có đường serve riêng; xác minh overlay nào có quyền truy cập trước khi thay URL.

## Gift menu overlay

`gift-menu-overlay.html` tải public active layout endpoint, ưu tiên `exportedItems`, poll signature và nhận progress WebSocket. Khi effect playback bắt đầu, overlay fade ẩn; khi effect cuối kết thúc/queue empty, fade hiện lại. `preview_effect`, `test_mapping`, `live_mapping` đều có thể cần fade theo product behavior hiện tại.

Không reload toàn layout cho thay đổi style nhỏ/runtime progress nếu có thể update DOM; reload làm reset loop animation.

## OBS integration

`obsService.js` kết nối obs-websocket và quản lý sources. `routes/obs.js`:

- trả overlay URLs;
- setup/update effect Browser Source;
- setup/update gift menu Browser Source;
- trigger/preview effect;
- list/repair sources.

Tên source thường gồm `effect_player` và `gift_menu` legacy. Không đổi nếu không migrate OBS scene hiện có.

Khi app preview đúng nhưng OBS sai:

- Browser Source dimensions khác transform scene. Kiểm source width/height trước.
- Refresh cache/source sau export.
- Kiểm endpoint trả layout mới.
- So `exportedItems`, không chỉ `items`.
- Kiểm backend renderer/CSS đã đồng bộ desktop.

## Audio

Ba hệ audio khác nhau:

1. Audio nằm trong effect video, điều khiển bởi mapping/control volume.
2. TTS/notification audio chạy renderer.
3. Soundboard local chạy `Audio` trong Electron renderer.

Soundboard không đi qua visual effect queue và có thể chạy tối đa ba sound. Visual effect vẫn tối đa một. Để lên stream, OBS Desktop Audio phải capture đúng output device.

## Realtime events

Tên cụ thể phải kiểm `server.js`/services, các nhóm quan trọng:

- `PLAY_EFFECT`, `STOP_EFFECT`, queue/status.
- `effect_playback_started`, `effect_playback_finished`, `effect_queue_empty`.
- `gift_menu_progress_update`.
- TikTok status/stats/gift/chat/follow/share.
- Challenge wheel trigger/update.

Backend WebSocket giới hạn client/payload và bind loopback theo security config.

## Debug checklist

### Không xuất hiện OBS

1. Backend 9000 và WS 9001 reachable.
2. OBS WebSocket connected.
3. Browser source visible, URL đúng và source size đúng.
4. Active layout mirror có items/exportedItems.
5. Overlay console/network không 401/404/500.
6. Queue không kẹt busy.

### Animation giật/loop không mượt

1. Tránh rerender/recreate DOM mỗi poll/slider.
2. Dùng linear animation và keyframe endpoint tương đương.
3. Không animate property gây layout nếu transform/opacity đủ.
4. Kiểm app và OBS FPS/browser source hardware acceleration.
5. Đồng bộ duration/speed unit giữa inspector, CSS variable và overlay.

### Soundboard không mở/phát

1. Restart Electron sau thay đổi main/preload.
2. IPC handlers đã register.
3. File tồn tại trong `userData/soundboard` và `library.json`.
4. Local server 8080 trả URL.
5. Format/size hợp lệ và autoplay policy.
6. OBS Desktop Audio capture đúng device.

