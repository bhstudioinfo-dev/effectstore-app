# Tính năng sản phẩm và giao diện

## Mục lục

- Điều hướng và dashboard
- Tài khoản
- Cửa hàng và thư viện
- Gán hiệu ứng
- TTS và tương tác
- Live Control và Soundboard
- Pricing và entitlement UX
- Admin
- Settings và vận hành

## Điều hướng và dashboard

SPA chính có sidebar: Cửa hàng, Hiệu ứng của tôi, Gán hiệu ứng, Thiết kế bảng quà, Trang quản trị (admin), Cài đặt. Header có logo LiveFlow, tìm kiếm, giỏ hàng và thông báo. Dashboard hiển thị trạng thái TikTok, OBS, launcher, banner, thống kê mua/chi/đã dùng/tiết kiệm, Hot Trends, lý do chọn sản phẩm và CTA.

`switchView()` điều khiển view và `body[data-current-view]`. Khi thêm UI theo view, đảm bảo không làm sidebar phải cuộn bất tiện và không che nội dung ở độ phân giải thấp.

## Tài khoản

- Initial admin setup khi database chưa có admin.
- Đăng ký email/password với tên hiển thị và số điện thoại.
- Profile hỗ trợ thông tin chăm sóc khách hàng trong `supportProfile`, consent và timestamps.
- Đăng nhập, logout, session restore bằng JWT.
- Device tracking/limit theo plan và machine ID.
- Profile card hiển thị tên, vai trò và gói.
- Admin có quyền quản trị riêng qua `isAdmin` và middleware.

Không hiển thị ObjectId thay cho tên tài khoản nếu `User.name` có dữ liệu. Khi join/payment trả user chưa populate, backend cần resolve tên/email rõ ràng và vẫn giữ ID làm metadata kỹ thuật.

## Cửa hàng và thư viện

- Catalog effect: tất cả, miễn phí, biến hình, quà tặng, phông nền, hoạt ảnh, PK, meme, tym đôi và mẫu menu quà.
- Tìm kiếm, filter category, Hot/Trending, Flash Sale, thumbnails/video preview và effect detail.
- Cart: add/remove, trạng thái “đã thêm vào giỏ”, cart count và checkout.
- Effect 0đ: acquisition trực tiếp, không tạo QR; vẫn ghi ownership/acquisition để admin thống kê.
- Effect đã sở hữu:
  - Visual effect: nút xem/chạy thử theo luồng hiện tại.
  - Menu/template designer product: nút “Mở thiết kế”, không phải “Đã sử dụng”.
- Chọn/mở template chỉ import vào editor; không tự đổi overlay đang chạy.
- “Lưu & Xuất” mới cập nhật OBS active layout.
- Personal effects: chọn video từ máy, tối ưu/đăng ký local metadata và dùng trong mapping/control.

## Gán hiệu ứng

- Kết nối TikTok bằng username/room flow: Chuẩn bị → Kết nối → Ngắt.
- Gift library hiển thị icon, tên và coins.
- Effect library gồm effect sở hữu, personal effect và challenge wheel phù hợp.
- Mapping một gift tới:
  - một effect;
  - nhóm effect random/sequential;
  - challenge wheel;
  - effect và wheel.
- Điều kiện: min/max/exact quantity, cooldown, cooldown action, active toggle.
- Audio mỗi mapping: bật/tắt và volume.
- Test mapping dùng cùng central queue với live playback.
- Status: effect đang chạy, thời gian còn lại, hàng chờ.
- Logs gift và statistics gifts/likes/chats/viewers.

## TTS và tương tác

- Kịch bản thoại quà với biến `{username}`, `{quantity}`, `{giftName}`.
- Chào follow/share và template câu thoại.
- TTS threshold cho đọc bình luận người tặng.
- TTS queue tránh đọc chồng.
- Voice/speed/pitch/volume được lưu local tùy implementation hiện hành.
- Âm thanh báo quà là một luồng khác Soundboard.

TTS có phụ thuộc browser speech/Google audio ở một số nhánh; luôn xử lý lỗi mạng, autoplay và queue.

## Live Control và Soundboard

Live Control nằm bên phải view Gán hiệu ứng, gồm hai card tách biệt:

### Nút hiệu ứng

- Mặc định 10 slot, tăng tối đa 20.
- Chọn effect đã sở hữu/personal.
- Click hoặc global hotkey để trigger.
- Dùng central effect queue; không phát chồng.
- Badge đếm ngược khi đang chạy và “Đang chờ” khi trong queue.
- Gift menu fade khi effect chạy và hiện lại khi queue trống.

### Soundboard

- Mặc định 10 slot, tăng tối đa 20.
- Chọn từ thư viện sound local hoặc tải từ máy.
- Hỗ trợ mp3, wav, ogg, m4a, aac; giới hạn 30 MB/file.
- Electron sao chép file vào `userData/soundboard` và lưu `library.json`; không phụ thuộc file gốc.
- Một sound có thể gán nhiều nút; button ID khác sound library ID.
- Click/global hotkey phát ngay; volume riêng từng nút.
- Tối đa 3 sound đồng thời; sound thứ tư dừng sound cũ nhất.
- Nút Stop dừng toàn bộ sound.
- OBS nhận âm qua Desktop Audio mặc định.

IPC: `control-deck:choose-sound`, `control-deck:list-sounds`, `control-deck:set-hotkeys`. Khi IPC mới không phản hồi, restart toàn app.

## Pricing và entitlement UX

Tên UI ↔ key backend:

- Miễn phí ↔ `free`.
- Basic ↔ `pro`.
- Pro ↔ `business`.
- Studio ↔ `studio`.
- Admin ↔ `admin`.

Nguyên tắc UX: Free phải dùng lâu dài và trải nghiệm core; cho thử tùy chỉnh bảng nâng cao trong designer, chỉ chặn save/export khi dùng tính năng vượt gói với lý do cụ thể và CTA nhẹ nhàng. Không chặn kéo bảng vào canvas chỉ vì là bảng Basic.

## Admin

- Dashboard stats, users và subscription assignment.
- Payment review modal: danh sách pending, tên/email/ID, order, amount, timestamp, proof, approve/reject và reason.
- Effect acquisition statistics: miễn phí/có phí, người mua, số lần dùng.
- Upload/edit/delete effects, timeline/composite metadata, fake uses.
- Manage Trending/Hot Trends: homepage phải chỉ render danh sách admin đã chọn, không tự bù đủ 5 item.
- Flash sale configuration.
- Banner manager.
- Gift coin/icon manager.
- Custom effect requests.
- Database backup/restore và diagnostic/operations.

## Settings và vận hành

- OBS host/port/password.
- TikTok saved settings.
- TTS/preferences.
- Auto-launch Windows.
- Database setup/update, backup/restore.
- Repair OBS sources.
- Open operation directories và create diagnostic report.
- Clear app data là destructive; phải xác nhận rõ và không xóa ngoài userData có chủ đích.

