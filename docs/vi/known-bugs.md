# 🐛 DANH SÁCH LỖI VÀ TỒN ĐỌNG (KNOWN_BUGS)

## 🐞 Các lỗi đang tồn tại
- **Lỗi ngắt quãng video**: Khi chuyển tab quá nhanh hoặc kích hoạt liên tục, đôi khi video sẽ báo lỗi ngắt quãng. Hiện tại đã được xử lý tạm thời để không gây treo ứng dụng.
- **Kết nối WebSocket**: Đôi khi backend không nhận diện được ngay lập tức nếu OBS vừa khởi động lại, cần phải chờ vài giây hoặc nhấn kết nối thủ công.
- **Tràn giao diện**: Trên các màn hình có độ phân giải thấp, danh sách quà tặng trong trình thiết kế có thể bị tràn ra ngoài khung hình.

## 🛠️ Các giải pháp tạm thời
- **Xóa bộ nhớ đệm**: Người dùng cần nhấn `Ctrl + R` để cập nhật các thay đổi mới nhất về mã nguồn giao diện.
- **Số lượt dùng giả**: Hệ thống cho phép cài đặt số lượt dùng ảo để tăng độ uy tín cho hiệu ứng trong giai đoạn marketing.
- **Tài khoản Admin cứng**: Email `admin@effectstore.vn` được cấp các quyền đặc biệt trực tiếp trong code để quản trị hệ thống.

## ⚠️ Các phần chưa ổn định
- **Lưu trữ thiết kế**: Các thiết kế quá phức tạp đôi khi gặp lỗi nhỏ khi lưu và tải lại từ máy chủ.
- **Kết nối lại TikTok**: Cơ chế thử lại sau 15 giây có thể tạo ra các kết nối trùng lặp nếu đường truyền mạng cực kỳ kém.

## 🔇 Các cảnh báo được bỏ qua
- Một số cảnh báo về thư viện cũ (như `punycode`) được giữ nguyên vì đây là lỗi từ bên phía nhà cung cấp thư viện, không ảnh hưởng đến chức năng ứng dụng.
