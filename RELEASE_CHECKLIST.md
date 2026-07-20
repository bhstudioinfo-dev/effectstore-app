# EffectStore release checklist

## Công cụ vận hành admin

- [ ] Trong Cài đặt admin, kiểm tra danh sách backup và các nút mở thư mục dữ liệu, log, backup.
- [ ] Tạo báo cáo chẩn đoán và xác nhận MongoDB URI, bearer token cùng các secret được thay bằng `[REDACTED]`.
- [ ] Xác nhận gỡ cài đặt không tự xóa dữ liệu ứng dụng.

## Trước khi build

- [ ] Hoàn thành các tài sản thương hiệu trong `BRAND_ASSETS_TODO.md` trước bản phát hành chính thức.
- [ ] Sao lưu MongoDB và kiểm tra khả năng khôi phục bản sao lưu.
- [ ] Thiết lập `JWT_SECRET` riêng, tối thiểu 32 ký tự.
- [ ] Kiểm tra `MONGODB_URI`, cấu hình ngân hàng và webhook secret.
- [ ] Giữ `API_HOST` và `WS_HOST` ở `127.0.0.1` nếu không cần truy cập từ mạng ngoài.
- [ ] Nếu mở mạng ngoài, cấu hình chính xác `CORS_ALLOWED_ORIGINS`.
- [ ] Chạy `npm test` trong thư mục `backend`.
- [ ] Chạy `npm run release:check` từ thư mục gốc.
- [ ] Chạy `npm run build:verify` để kiểm tra artifact unpacked không ký.
- [ ] Hoàn thành màn hình thiết lập MongoDB lần đầu và xác nhận trạng thái database là Connected.
- [ ] Không sửa trực tiếp `backend-config.json`; các secret trong file này được mã hóa bằng Windows safeStorage.
- [ ] Xác nhận desktop tự khởi động backend tại `127.0.0.1:9000` và tự dừng backend khi thoát.
- [ ] Kiểm tra dữ liệu runtime tại `%APPDATA%/effectstore-desktop/backend-data`.
- [ ] Kiểm tra log backend tại `%APPDATA%/effectstore-desktop/logs/backend.log`.
- [ ] Mở app lần thứ hai và xác nhận chỉ instance đầu tiên tiếp tục chạy.
- [ ] Kiểm tra OBS WebSocket và TikTok Live bằng tài khoản thử nghiệm.

## Smoke test bản build

- [ ] Đăng ký, đăng nhập và đăng xuất thành công.
- [ ] User không truy cập được màn hình hoặc API admin.
- [ ] Tạo đơn, tải bằng chứng và kiểm tra trạng thái thanh toán.
- [ ] Admin duyệt một đơn thử; effect chỉ được cấp một lần.
- [ ] Kết nối/ngắt TikTok không tự reconnect ngoài ý muốn.
- [ ] Gift mapping kích hoạt đúng effect và queue tiếp tục sau effect lỗi.
- [ ] OBS Browser Source nhận Gift Menu, Goal Board và Effect Player.
- [ ] Thử mất OBS/TikTok/WebSocket rồi kết nối lại.
- [ ] Kiểm tra loading, empty state và thông báo lỗi tiếng Việt.

## Phát hành và rollback

- [ ] Tạo database backup mới qua API admin trước khi nâng cấp bản production.
- [ ] Xác nhận file `.esbackup` xuất hiện trong `%APPDATA%/effectstore-desktop/backend-data/backups`.
- [ ] Restore chỉ dùng chế độ merge và phải tạo safety backup tự động trước khi chạy.
- [ ] Giữ nguyên `backend-config.json` khi cần phục hồi `.esbackup`; khóa giải mã được bảo vệ bằng safeStorage của máy hiện tại.
- [ ] Không xem `.esbackup` là bản backup đa máy nếu chưa có quy trình chuyển khóa được phê duyệt.
- [ ] Ghi lại phiên bản ứng dụng, commit và thời điểm phát hành.
- [ ] Lưu installer/bản build ổn định gần nhất.
- [ ] Không chạy migration hoặc xóa dữ liệu nếu chưa có bản sao lưu.
- [ ] Sau phát hành, kiểm tra `/api/system/status`, RAM, CPU và log lỗi.
- [ ] Nếu smoke test thất bại, dừng bản mới, khôi phục build cũ và chỉ phục hồi database khi dữ liệu đã thay đổi không tương thích.

## Ghi chú Windows

- Build installer có thể cần bật Windows Developer Mode hoặc chạy terminal có quyền tạo symbolic link để giải nén bộ công cụ ký mã.
- `build:verify` tắt bước chỉnh sửa/ký executable và chỉ dùng để xác minh nội dung đóng gói.
- Bản phát hành chính thức nên sử dụng chứng thư code-signing; không phân phối artifact kiểm thử như bản production.
