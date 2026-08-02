---
name: liveflow-app
description: Hiểu, chẩn đoán, sửa đổi và phát triển ứng dụng desktop LiveFlow trong repo effectstore-app. Dùng khi làm việc với Electron UI, cửa hàng hiệu ứng, tài khoản và gói dịch vụ, thanh toán/admin, TikTok Live gift mapping, TTS, Live Control/Soundboard, OBS WebSocket và Browser Source, hàng đợi hiệu ứng, Gift Menu Designer, bảng mục tiêu/PK/Talent/Top Supporters, shared renderer, MongoDB models, REST API, đóng gói Windows hoặc kiểm thử phát hành.
---

# LiveFlow App

Làm việc từ mã nguồn hiện tại; tài liệu cũ chỉ là dữ liệu đối chiếu. Tên sản phẩm hiện tại là **LiveFlow** dù nhiều tên kỹ thuật cũ vẫn dùng `EffectStore`, `effectstore`, `gift_menu` hoặc `BH Studio`.

## Quy trình bắt buộc

1. Đọc [architecture.md](references/architecture.md) trước khi thay đổi luồng xuyên desktop/backend/OBS.
2. Chọn reference theo phạm vi:
   - UI, tài khoản, cửa hàng, thanh toán, admin, TTS, Soundboard: [product-features.md](references/product-features.md).
   - Designer/widget/layer/resize/render: [designer-widgets.md](references/designer-widgets.md).
   - TikTok, mapping, queue, OBS, overlay: [live-runtime.md](references/live-runtime.md).
   - API, model, gói và quyền: [backend-data.md](references/backend-data.md).
   - Build, test, an toàn và chẩn đoán: [engineering-guide.md](references/engineering-guide.md).
   - Trạng thái chưa hoàn thiện/rủi ro: [known-risks.md](references/known-risks.md).
3. Tìm implementation bằng `rg`; không đoán từ tên hoặc tài liệu.
4. Kiểm tra working tree trước khi sửa. Không hoàn tác thay đổi người dùng.
5. Sửa nhỏ nhất có thể và giữ tương thích dữ liệu đã lưu.
6. Nếu sửa render, so sánh preview trong app với OBS ở cùng payload, không so theo vị trí/kích thước source OBS.
7. Chạy kiểm tra phù hợp trong [engineering-guide.md](references/engineering-guide.md).

## Nguồn sự thật

Ưu tiên theo thứ tự:

1. Mã nguồn đang chạy.
2. Tests và cấu hình quyền gói.
3. Schema/model và route đang mount trong `backend/server.js`.
4. Bộ reference của skill này.
5. Tài liệu khác trong `docs/`.

Khi code và tài liệu mâu thuẫn, mô tả mâu thuẫn và theo code; không âm thầm biến giả định thành tính năng.

## Guardrails quan trọng

- Không commit hoặc ghi đè `backend/uploads/gift-menu-layout.json` và `backend/uploads/goal-board-layout.json`; đây là mirror/runtime state.
- Không đưa `.env`, Mongo URI, JWT secret, OBS password, thông tin ngân hàng hoặc file minh chứng thật vào output/commit.
- Không thay schema, route path, auth, payment hoặc entitlement nếu người dùng chưa yêu cầu rõ.
- `desktop/renderer/js/shared-render-engine.js` và `backend/public/shared-render-engine.js` là hai bản cùng contract; thay đổi render thường phải đồng bộ cả hai.
- CSS preview và OBS cũng có cặp tương ứng: `desktop/renderer/styles/gift-menu-designer.css` và `backend/public/gift-menu-renderer.css`.
- Mở/chọn layout/template chỉ để chỉnh sửa; chỉ `Lưu & Xuất`/activate rõ ràng mới thay overlay OBS.
- Layer bị khóa không được bắt pointer, drag hoặc che layer bên dưới.
- Thay đổi opacity nền không được làm mờ nội dung/viền nếu control chỉ ghi “độ mờ nền”.
- Bật/tắt khóa tỷ lệ phải giữ nguyên kích thước và bố cục hiện tại; chỉ ảnh hưởng lần resize kế tiếp.
- Với widget mở khóa tỷ lệ, resize khung không được scale/biến dạng chữ và nội dung nếu contract của widget là responsive/reflow.
- Không tạo playback song song ngoài queue. Trigger thủ công, test mapping và TikTok live phải dùng chung queue khi phát lên effect player.
- Sửa `desktop/main.js` hoặc `desktop/preload.js` cần thoát hoàn toàn và mở lại Electron; `Ctrl+R` chỉ reload renderer.

## Mẫu xử lý task

### Lỗi app khác OBS

1. Lấy cùng layout/item payload.
2. Xác định branch render bằng `item.type` và biến thể (`barStyle`, `contribStyle`, v.v.).
3. So sánh hai shared render engine, hai CSS và wrapper scale.
4. Tách lỗi nội dung/render khỏi transform của OBS source.
5. Sửa contract chung trước; tránh CSS vá riêng theo ảnh nếu không cần.

### Tính năng Designer mới

1. Thêm default/contract vào `item-registry.js` nếu là item type hoặc field bền vững.
2. Thêm inspector/state mutation trong designer hoặc inspector engine.
3. Persist qua `items` và `exportedItems`.
4. Render giống nhau trong app và OBS.
5. Kiểm tra save/load, undo/redo, duplicate, layer lock, resize lock/unlock và export.
6. Cập nhật entitlement nếu tính năng có gate.

### Tính năng commerce/gói

1. Kiểm tra `backend/config/planEntitlements.js` trước.
2. Enforce ở backend; UI chỉ giải thích và hỗ trợ trải nghiệm.
3. Free được thử chỉnh các bảng nâng cao khi chủ đích sản phẩm cho phép; chặn tại save/export bằng lý do cụ thể.
4. Effect giá 0 vẫn phải đi qua acquisition/ownership để thống kê, nhưng không tạo QR thanh toán.

### Tính năng live/audio

1. Phân biệt audio gắn với mapping/effect và Soundboard thủ công.
2. Giữ giới hạn hiệu năng: một visual effect qua queue; Soundboard tối đa ba sound đồng thời.
3. Soundboard lưu file cục bộ trong Electron userData, không phụ thuộc đường dẫn file gốc.
4. OBS nghe Soundboard qua Desktop Audio trừ khi kiến trúc routing audio được thay đổi rõ ràng.

