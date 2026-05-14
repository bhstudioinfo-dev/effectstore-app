# 🤖 QUY TẮC PHÁT TRIỂN (AGENT_RULES)

## ⚠️ QUY TẮC QUAN TRỌNG
1. **Không sửa code lan man**: Chỉ thay đổi những file liên quan trực tiếp đến tác vụ được giao.
2. **Giữ vững cấu trúc**: Tuân thủ cách tổ chức code hiện tại, không tự ý thay đổi cách hoạt động của các dịch vụ cốt lõi.
3. **Tránh trùng lặp**: Luôn kiểm tra các hàm có sẵn (như định dạng tiền tệ, hiển thị thông báo) trước khi viết mới.
4. **Bảo mật dữ liệu**: Tuyệt đối không để lộ mật khẩu, khóa bí mật trong mã nguồn. Sử dụng biến môi trường (`.env`).
5. **Đúng chuẩn thiết kế**: Luôn dùng bảng màu và phong cách "Premium Pro" đã định nghĩa.

## 🛠️ Quy trình làm việc
- **Kiểm tra**: Sau khi sửa giao diện, cần khởi động lại ứng dụng để xóa bộ nhớ đệm (Cache).
- **Xử lý lỗi**: Mọi kết nối đến máy chủ đều phải có phương án xử lý khi gặp lỗi mạng.
- **Thứ tự hiển thị**: Phải sử dụng hệ thống Hàng đợi (Queue) khi kích hoạt hiệu ứng để tránh chồng chéo hình ảnh.

## 📦 Thư viện bổ sung
- Hạn chế tối đa việc cài đặt thêm các thư viện mới nếu không thực sự cần thiết. Ưu tiên sử dụng những gì hệ thống đang có sẵn.
