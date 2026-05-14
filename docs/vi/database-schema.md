# 🗄️ CẤU TRÚC DỮ LIỆU (DATABASE_SCHEMA)

## 👤 Người dùng (User)
Lưu trữ thông tin cá nhân, mật khẩu, gói thành viên (Free/Pro/Business), danh sách hiệu ứng đã mua và số tiền đã chi tiêu. Mỗi tài khoản được gắn với một mã máy (Machine ID) để bảo mật.

## 🎬 Hiệu ứng (Effect)
Chứa thông tin về tên hiệu ứng, giá bán, thời lượng, tệp tin video đã mã hóa, và các chỉ số thống kê (lượt dùng, đánh giá).

## 🔗 Liên kết quà tặng (GiftMapping)
Bản ghi kết nối giữa một món quà TikTok cụ thể và một hiệu ứng video. Đây là trái tim của hệ thống tự động hóa.

## 🎁 Menu quà tặng (GiftMenu)
Lưu trữ các thiết kế bảng quà tặng mà người dùng đã tạo trong công cụ thiết kế.

## 💰 Thanh toán (Payment)
Theo dõi lịch sử nạp tiền, trạng thái giao dịch (Đang chờ/Thành công/Đã hủy) và ảnh bằng chứng chuyển khoản.

## 📋 Quy tắc và Giới hạn
- **Gói thành viên**: Quyết định số lượng máy được đăng nhập và số lượng món quà có thể cài đặt hiệu ứng.
- **Quyền Admin**: Tài khoản `admin@effectstore.vn` có toàn quyền quản lý hệ thống, duyệt nạp tiền và thêm hiệu ứng mới.
