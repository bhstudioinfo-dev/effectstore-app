# Danh sách lỗi phải sửa trước khi phát hành

Tổng cộng:

- **5 lỗi P0:** phải sửa trước khi cho bất kỳ khách hàng nào cài.
- **12 lỗi P1:** phải sửa trước khi bắt đầu bán.

## P0 — Nghiêm trọng nhất

### P0-01 — Khách hàng ở máy khác chưa dùng được cửa hàng

Hiện sản phẩm và file video nằm trên máy đang chạy phần máy chủ. Khách hàng ở máy khác không tự nhận được sản phẩm mới.

Ảnh hưởng: Không thể vận hành cửa hàng thật cho nhiều khách.

Các phần liên quan:

- `desktop/backend-manager.js`
- `backend/config/dataPaths.js`
- `backend/routes/effects.js`

Cách xử lý: tạo máy chủ online trung tâm, cơ sở dữ liệu thật và kho file riêng tư trên mạng.

Kiểm tra bắt buộc: admin đăng sản phẩm trên máy A; máy B và C thấy sản phẩm mà không cài lại ứng dụng.

### P0-02 — Bộ cài phụ thuộc MongoDB bên ngoài

Ứng dụng mặc định tìm MongoDB trên máy khách. Máy Windows bình thường không có sẵn MongoDB.

Ảnh hưởng: khách cài xong nhưng không dùng được.

Cách xử lý: ứng dụng khách kết nối dịch vụ online đã chuẩn bị sẵn; không bắt khách nhập địa chỉ MongoDB.

### P0-03 — Quà TikTok thật cần được xác nhận trên hệ thống thật

Lỗi thiếu địa chỉ video giữa `tiktokService.js`, `effectQueue.js` và `playbackManager.js` đã được sửa trong code Giai đoạn A.

Hệ thống hiện tự kiểm tra lại quyền sở hữu, thời lượng, file cá nhân và tạo địa chỉ phát ngay trước khi chạy. Quà combo chưa kết thúc cũng được bỏ qua.

Trạng thái: **ĐÃ SỬA CODE VÀ ĐẠT KIỂM TRA TỰ ĐỘNG — CHƯA KIỂM TRA TIKTOK/OBS THẬT**.

Lỗi P0 này chỉ được đóng sau khi kiểm tra thật thành công.

Kiểm tra bắt buộc:

- Hiệu ứng mua.
- Hiệu ứng cá nhân.
- Một hiệu ứng.
- Nhóm nhiều hiệu ứng.
- Ba quà gửi nhanh.
- Quà combo/lặp.
- Mất và kết nối lại OBS.

### P0-04 — Có thể lấy file hiệu ứng đầy đủ qua bản xem trước

Khi admin tải video lên, hệ thống lưu một bản xem trước không mã hóa. Bản này là bản sao toàn bộ file tải lên.

Ảnh hưởng: người chưa mua có thể lấy video đầy đủ.

Cách xử lý: tạo một video xem trước riêng, ngắn hoặc có dấu nhận diện; file bán phải luôn được bảo vệ.

### P0-05 — Chưa có bộ cài thật để phát hành

Chưa có bằng chứng về:

- Ký số ứng dụng.
- Cài trên máy Windows sạch.
- Gỡ cài đặt an toàn.
- Tự cập nhật.
- Quay lại bản cũ.
- Kiểm tra phần mềm diệt virus.

Ảnh hưởng: khách có thể không cài được, bị cảnh báo nguy hiểm hoặc mất dữ liệu.

## P1 — Phải sửa trước khi bán

### P1-01 — Quà combo cần kiểm tra bằng dữ liệu thật

Code hiện đã bỏ qua thông báo combo trung gian và bài kiểm tra tự động đã đạt. Vẫn cần xác nhận với quà TikTok thật.

### P1-02 — Giới hạn các gói còn chưa thống nhất

Free vẫn có thể tải thử 5 tài nguyên menu. Một số tính năng kiểm tra gói Pro nhưng bỏ sót Studio. Nhiều yêu cầu cùng lúc có thể vượt giới hạn.

### P1-03 — Mật khẩu OBS lưu chưa an toàn

Mật khẩu đang được lưu dạng chữ thường và dùng chung trong cơ sở dữ liệu.

### P1-04 — Giao diện có nguy cơ bị lấy mã đăng nhập

Mã đăng nhập nằm trong `localStorage`. Giao diện tải thư viện từ Internet và cầu nối Electron cho phép gọi tên kênh bất kỳ.

### P1-05 — Dữ liệu thời gian thực chưa tách theo từng khách

Máy chủ đang gửi nhiều sự kiện WebSocket cho toàn bộ kết nối thay vì tách rõ từng người dùng.

### P1-06 — Trang admin trả quá nhiều dữ liệu

Danh sách người dùng có thể bao gồm mã mật khẩu đã băm, danh sách thiết bị và khóa cấp phép. Admin cũng có thể nhập tên gói không hợp lệ.

### P1-07 — Xóa dữ liệu có thể để lại dữ liệu rác

Xóa người dùng hoặc sản phẩm không dọn đầy đủ đơn hàng, mapping, thiết kế, log và file liên quan. Xóa sản phẩm có thể làm người đã mua không dùng được nữa.

### P1-08 — Duyệt thanh toán chưa phải một thao tác an toàn hoàn chỉnh

Cấp quyền sản phẩm và đổi trạng thái thanh toán là nhiều bước riêng. Nếu hệ thống dừng ở giữa, dữ liệu có thể không khớp.

### P1-09 — Hiệu ứng cá nhân có thể tồn tại trên tài khoản nhưng mất file

Đổi máy hoặc xóa file làm dữ liệu máy chủ và file thật không còn khớp.

### P1-10 — Chưa chứng minh Menu Designer giống OBS

Chưa có kiểm tra hình ảnh cho từng loại vật thể, cỡ màn hình, font, viền và chuyển động.

### P1-11 — Khách có thể thấy lỗi tiếng Anh hoặc mã kỹ thuật

Cần chuyển mọi lỗi thành câu tiếng Việt dễ hiểu và có hướng dẫn xử lý.

### P1-12 — Thiếu chính sách pháp lý và hỗ trợ

Thiếu điều khoản sử dụng, quyền riêng tư, hoàn tiền, hủy thuê bao, bản quyền và quy trình hỗ trợ.

## Những việc chưa cần làm ngay

Chưa nên ưu tiên:

- Thêm nền tảng livestream mới.
- Thêm tài khoản nhóm Studio.
- Thêm nhiều widget.
- Thêm tính năng dành cho agency.

Hãy sửa P0 và P1 trước.
