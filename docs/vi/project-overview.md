# 📘 TỔNG QUAN DỰ ÁN (PROJECT_OVERVIEW)

## 🚀 Mục tiêu ứng dụng
EffectStore là nền tảng tự động hóa và tăng tương tác dành cho các nhà sáng tạo nội dung trên TikTok. Ứng dụng giúp streamer nâng tầm buổi livestream bằng cách tự động kích hoạt các hiệu ứng hình ảnh trên OBS Studio khi nhận được quà tặng từ người xem.

## 👥 Đối tượng người dùng
- **TikTok Streamers**: Những người muốn tăng tương tác và doanh thu thông qua các hiệu ứng thú vị.
- **Nhà sáng tạo nội dung**: Cần các công cụ hỗ trợ hình ảnh chuyên nghiệp và tự động.
- **Đại lý (Agencies)**: Quản lý nhiều streamer và cần một hệ thống quản lý quà tặng - hiệu ứng tập trung.

## 💼 Logic kinh doanh (Business Logic)
- **Kiếm tiền**: Streamer mua hiệu ứng từ "Cửa hàng" bằng hệ thống điểm tích lũy.
- **Tự động hóa**: Lắng nghe sự kiện TikTok Live trong thời gian thực.
- **Phát hiệu ứng tuần tự**: Đảm bảo các hiệu ứng không bị chồng chéo khi nhận nhiều quà cùng lúc.
- **Tương tác**: Sử dụng giọng nói AI (TTS) để thông báo tên người tặng quà.
- **Bảo mật**: Bảo vệ tài sản video bằng công nghệ mã hóa (DRM).

## ✨ Các tính năng chính
- **Cửa hàng hiệu ứng**: Duyệt và mua các hiệu ứng video (định dạng WebM).
- **Tích hợp TikTok**: Kết nối phòng live, theo dõi quà tặng, lượt thích, lượt theo dõi.
- **Điều khiển OBS**: Tự động hiển thị hiệu ứng lên OBS thông qua Browser Source.
- **Thiết kế Menu quà tặng**: Công cụ kéo thả để tạo bảng danh sách quà tặng tùy chỉnh.
- **Hệ thống giọng nói AI**: Tự động đọc tên người tặng và lời nhắn.
- **Bảng điều khiển Admin**: Quản lý hiệu ứng, banner và các giao dịch của người dùng.
- **Thanh toán VietQR**: Tích hợp quét mã QR để nạp tiền tự động.

## 💻 Công nghệ sử dụng
- **Giao diện**: Electron (Ứng dụng máy tính), HTML, CSS, JavaScript.
- **Máy chủ**: Node.js, Express.js.
- **Cơ sở dữ liệu**: MongoDB.
- **Kết nối**: WebSocket, OBS WebSocket.
- **Dịch vụ bên thứ ba**: TikTok Live Connector, VietQR, Google TTS.
