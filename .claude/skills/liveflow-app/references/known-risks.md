# Rủi ro, nợ kỹ thuật và giới hạn

## Mục lục

- Rủi ro kiến trúc
- Các đường legacy/partial
- Rủi ro UI/runtime
- Quy tắc đánh giá lỗi

## Rủi ro kiến trúc

- `home.js` và `gift-menu-designer.js` là monolith; tránh refactor lớn trong bugfix.
- State mutation trực tiếp và inspector rerender có thể làm mất focus/scroll.
- Shared renderer/CSS tồn tại hai bản; dễ drift app/OBS.
- `items` và `exportedItems` có thể diverge.
- Overlay còn polling; rebuild DOM có thể reset CSS loop.
- History deep-clone toàn items, tốn RAM với nhiều video.
- Nhiều media/GIF/WebM có thể gây lag; giữ upload optimization và giới hạn.

## Các đường legacy/partial

Xác minh lại trước khi dùng:

- `backend/obs-controller.js` timeline/webcam engine không phải active playback chính.
- `backend/obs-auto-setup.js` là helper legacy.
- Electron `renderer/overlay.html`/8081 có phần legacy; backend 9000 overlays là active OBS path.
- `License` model có thể dormant.
- Separate `frontend/overlay/goal-board-*` có thể không phải path active cho designer unified overlay.
- Sepay webhook/automation có thể chưa production complete; manual approval là fallback.
- Marketplace template monetization/ownership từng partial; đọc route/UI hiện tại.
- Một số docs feature matrix được tạo trước các commit gần đây và có thể đã lỗi thời.

## Rủi ro UI/runtime

- Mojibake tiếng Việt từng xuất hiện khi encoding sai. Luôn đọc/ghi UTF-8 và chạy localization validator.
- Thumbnail upload lỗi 500 không nên làm hỏng chức năng chính; có fallback icon và log nguyên nhân.
- OBS Browser Source cache có thể hiển thị bản cũ.
- Source transform/scale OBS có thể khiến viền mỏng dù renderer đúng; phân biệt CSS border với OBS scaling.
- Opacity áp vào wrapper sẽ làm mất cả border/content; cần pseudo-layer/background riêng.
- `overflow:hidden` dễ cắt tên đội/timer/label khi thu hẹp chiều cao.
- Toggle ratio không được dùng default aspect ratio để viết lại size hiện hành.
- Click locked layer phải pass through.
- Slider update không nên gọi full load/save/rebuild mỗi input event.
- Local Soundboard IPC không hoạt động nếu chỉ Ctrl+R sau thay main/preload.

## Quy tắc đánh giá lỗi

Phân loại trước khi sửa:

1. **Data**: field không lưu/load/export.
2. **Render contract**: HTML khác app/OBS.
3. **CSS**: selector, radius, border, opacity, overflow.
4. **Geometry**: logical/stage/export scale, lock ratio, content scale.
5. **Runtime**: polling, WebSocket, queue, stale source/cache.
6. **Access**: auth, ownership, entitlement, user/session scope.
7. **Electron lifecycle**: renderer reload nhưng main/preload cũ.

Không sửa nhiều lớp cùng lúc khi chưa xác định lớp lỗi. Dùng payload/log/network và DOM computed style làm bằng chứng.

