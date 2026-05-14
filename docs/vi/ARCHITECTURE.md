# 🏗️ KIẾN TRÚC HỆ THỐNG (ARCHITECTURE)

## 📁 Cấu trúc thư mục chính
- `/backend`: Mã nguồn xử lý máy chủ.
  - `/models`: Cấu trúc dữ liệu (Database).
  - `/routes`: Các cổng kết nối API.
  - `/services`: Logic xử lý cốt lõi (Kết nối TikTok, OBS, Hàng đợi).
- `/desktop`: Ứng dụng máy tính (Electron).
  - `/renderer`: Giao diện người dùng (HTML/CSS/JS).
- `/effects`: Kho chứa các video hiệu ứng đã được mã hóa bảo mật.

## 🔄 Luồng vận hành chính
1. **Giao diện (App)** gửi yêu cầu đến **Máy chủ (Backend)** để lấy dữ liệu.
2. **Máy chủ** kết nối với **TikTok** để theo dõi các sự kiện quà tặng.
3. Khi có quà, **Máy chủ** kiểm tra trong **Cơ sở dữ liệu** để tìm hiệu ứng tương ứng.
4. **Máy chủ** gửi lệnh đến phần mềm **OBS Studio** để phát hiệu ứng lên livestream.

## 🧠 Quản lý trạng thái
- Hệ thống sử dụng cơ chế **Hàng đợi (Queue)** để đảm bảo khi nhiều người tặng quà cùng lúc, các hiệu ứng sẽ được phát lần lượt, không bị đè lên nhau.
- Thông tin người dùng và số dư được cập nhật liên tục thông qua API.

## 🔐 Bảo mật và Xác thực
- **Đăng nhập**: Sử dụng Token (JWT) để xác thực người dùng.
- **Giới hạn thiết bị**: Mỗi gói tài khoản (Free/Pro/Business) sẽ có giới hạn số lượng máy tính được đăng nhập cùng lúc.
- **Bảo mật video**: Các file hiệu ứng được mã hóa, người dùng không thể tải trực tiếp file gốc từ thư mục ứng dụng.

## 🎨 Quy chuẩn thiết kế
- Ứng dụng tuân theo phong cách **"Premium Pro"**: Giao diện tối, hiệu ứng mờ kính (Glassmorphism), màu sắc hài hòa và các hiệu ứng chuyển động mượt mà.
