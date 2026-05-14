# 🌐 LUỒNG KẾT NỐI API (API_FLOW)

## 🔐 Bảo mật kết nối
Mọi yêu cầu trao đổi dữ liệu giữa ứng dụng và máy chủ đều được bảo mật bằng mã xác thực (Token). Chỉ những người dùng đã đăng nhập hợp lệ mới có thể truy cập các tính năng của mình.

## 🛣️ Các cổng kết nối chính

### 1. Hệ thống Tài khoản
- Xử lý đăng ký, đăng nhập và kiểm tra thông tin cá nhân.
- Tự động kiểm tra giới hạn thiết bị khi đăng nhập máy mới.

### 2. Quản lý Hiệu ứng
- Lấy danh sách hiệu ứng từ cửa hàng.
- Tải lên hiệu ứng mới (dành cho Admin).
- Truy xuất luồng video đã mã hóa để hiển thị lên livestream.

### 3. Tương tác TikTok
- Gửi lệnh kết nối tới phòng livestream.
- Lưu trữ và cập nhật các cài đặt liên kết quà tặng - hiệu ứng.

### 4. Điều khiển OBS
- Kích hoạt hiển thị hiệu ứng trên phần mềm OBS.
- Kiểm tra trạng thái kết nối của hệ thống (TikTok, OBS, Launcher).

## 🔌 Tích hợp bên ngoài
- **TikTok**: Nhận dữ liệu quà tặng thời gian thực.
- **VietQR**: Tạo mã QR thanh toán tự động để nạp tiền vào tài khoản.
- **Google TTS**: Chuyển đổi văn bản thành giọng nói tiếng Việt để đọc tên người tặng quà.
