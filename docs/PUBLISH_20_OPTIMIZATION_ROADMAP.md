# Lộ trình sửa ứng dụng trước khi phát hành

## Nguyên tắc

Làm lần lượt từng giai đoạn. Không làm bộ cài hoặc thêm tính năng mới khi các lỗi nền tảng chưa được sửa.

## Giai đoạn A — Sửa lỗi hiện tại

Mục tiêu và trạng thái:

- Đã sửa code cho quà TikTok thật không phát hiệu ứng đơn.
- Đã sửa code để bỏ qua thông báo trung gian của quà combo/lặp.
- Đã kiểm tra file hiệu ứng cá nhân trước khi xem thử, kiểm tra mapping hoặc phát.
- Toàn bộ bộ kiểm tra tự động hiện đã đạt.
- Làm rõ cách hoạt động của thời gian chờ giữa hai lần phát.
- Kiểm tra lại toàn bộ tiếng Việt.
- Việc còn lại để hoàn thành Giai đoạn A: kiểm tra trực tiếp với TikTok Live và OBS.

Các file có thể cần sửa:

- `backend/services/tiktokService.js`
- `backend/services/effectQueue.js`
- `backend/services/playbackManager.js`
- `backend/services/effectLibraryService.js`
- `desktop/main.js`
- các file kiểm tra trong `backend/tests`

Kiểm tra bằng tay:

- Quà thật trên TikTok.
- Hiệu ứng mua và hiệu ứng cá nhân.
- Một hiệu ứng và nhóm hiệu ứng.
- Ba quà gửi liên tục.
- Quà combo.
- Tắt và mở lại OBS.

Kiểm tra tự động:

- Dữ liệu quà thật tạo đúng địa chỉ video.
- Hàng chờ không chạy chồng.
- File lỗi không làm hàng chờ bị treo.
- Không còn tiếng Việt bị hỏng.

Tên commit gợi ý:

`fix: sửa Gift Mapping live và hiệu ứng cá nhân`

Điểm quay lại:

Nhánh `backup-before-publish-audit`, commit `885ad0b`.

## Giai đoạn B — Hoàn thành hệ thống effect_player

Mục tiêu: sau khi hệ thống mới chạy ổn định, loại bỏ đường phát OBS cũ.

Chỉ thực hiện khi Giai đoạn A đã kiểm tra thật thành công.

Không xóa code cũ trước khi:

- Quà thật chạy ổn định.
- Hiệu ứng mua chạy ổn định.
- Hiệu ứng cá nhân chạy ổn định.
- Mất kết nối không làm treo hàng chờ.

## Giai đoạn C — Xây dựng cửa hàng online thật

Mục tiêu:

- Tài khoản và quyền mua nằm ở máy chủ online.
- File sản phẩm nằm trong kho riêng tư trên mạng.
- Sản phẩm mới xuất hiện trên mọi máy mà không cần cài lại app.
- Có phiên bản sản phẩm và kiểm tra file.

Đây là giai đoạn lớn và rủi ro cao. Phải làm trước trên môi trường thử nghiệm.

## Giai đoạn D — Hoàn thiện giới hạn các gói

Mục tiêu: mọi quy tắc Free, Basic, Pro và Studio đều được kiểm tra ở máy chủ, không chỉ ẩn nút trên giao diện.

Cần kiểm tra:

- Giới hạn mapping.
- Hiệu ứng cá nhân.
- Thiết kế.
- Tài nguyên menu.
- Bảng mục tiêu.
- Bình luận.
- TTS.
- Số thiết bị.
- Hết hạn và hạ gói.

## Giai đoạn E — Làm OBS tự phục hồi tốt hơn

Mục tiêu:

- Mỗi người có cài đặt OBS riêng.
- Mật khẩu được mã hóa.
- Tự phát hiện nguồn sai tên, sai loại hoặc sai địa chỉ.
- Hướng dẫn khách đưa cảnh EffectStore vào cảnh livestream.

## Giai đoạn F — Tăng cường bảo mật

Mục tiêu:

- Không lộ file hiệu ứng đầy đủ.
- Không tải thư viện giao diện từ Internet nếu không cần.
- Cầu nối Electron chỉ cho phép các thao tác đã định sẵn.
- Sự kiện thời gian thực được tách theo từng người.
- Không trả lỗi nội bộ cho khách.
- Có nhật ký các thao tác quan trọng.

## Giai đoạn G — Chuẩn bị bộ cài Windows

Chỉ làm sau khi các giai đoạn trên đạt yêu cầu.

Cần:

- Biểu tượng chính thức.
- Tên công ty phát hành.
- Chứng thư ký số.
- Bộ cài.
- Tự cập nhật.
- Quay lại bản cũ.
- Kiểm tra trên máy Windows sạch.
- Kiểm tra phần mềm diệt virus.

## Giai đoạn H — Thử nghiệm kín

Cho 5–20 người dùng thử có kiểm soát.

Theo dõi:

- Lỗi.
- Bộ nhớ và CPU.
- OBS.
- TikTok.
- Mạng yếu.
- Dung lượng file.
- Khả năng tự xử lý của người mới.

Chưa thu tiền và chưa cam kết dịch vụ ở giai đoạn này.

## Giai đoạn I — Phát hành có thu phí

Chỉ thực hiện khi:

- Không còn lỗi P0/P1.
- Đã kiểm tra bảo mật.
- Đã kiểm tra sao lưu và khôi phục.
- Đã có chính sách pháp lý.
- Đã có hỗ trợ khách hàng.
- Bộ cài đã ký số.
- Có theo dõi máy chủ thật.

## Việc tiếp theo duy nhất

**Thực hiện Giai đoạn A — sửa lỗi hiện tại. Không bắt đầu xây cloud, xóa hệ thống OBS cũ hoặc làm bộ cài trước khi Giai đoạn A được kiểm tra thành công.**
