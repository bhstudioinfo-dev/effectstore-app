# LIVEFLOW SYSTEM PRESERVATION & CRITICAL ARCHITECTURE RULES

> **LƯU Ý BẮT BUỘC CHO TẤT CẢ CÁC PHIÊN LÀM VIỆC CỦA AI:**
> Đọc kỹ tài liệu này trước khi chỉnh sửa bất kỳ phần nào của dự án để đảm bảo không làm mất, xóa nhầm hoặc phá vỡ các luồng xử lý cốt lõi đã được tối ưu hóa.

---

## 1. BẢO VỆ TÀI NGUYÊN VIDEO & PREVIEW (DRM & ASSETS)

- **TUYỆT ĐỐI KHÔNG XÓA FILE PREVIEW:**
  - File preview `.webm` trong thư mục `uploads/previews/${effectId}.webm` là tài nguyên tĩnh dùng để phát xem trước tức thì (<1ms) khi người dùng rê chuột vào thẻ hiệu ứng ở Cửa hàng.
  - Khi mã hóa sang file `.enc` trong `backend/routes/effects.js` (hoặc các dịch vụ liên quan), **phải sao chép ra file tạm để mã hóa, không được dùng lệnh `fs.unlink` làm mất file preview `.webm`**.
- **BẢO TOÀN ÂM THANH KHI ENCODE:**
  - Mọi hàm chuyển đổi FFmpeg sang WebM VP9 phải bao gồm `-map 0:v:0 -map 0:a? -c:a libopus -b:a 128k` để giữ trọn vẹn âm thanh gốc của hiệu ứng khi xuất ra OBS.
- **THỜI LƯỢNG CHÍNH XÁC (DURATION):**
  - Thời lượng video phải được đọc từ FFmpeg stderr parser theo định dạng giây thực tế (ví dụ: `19.3s`), không được gán cứng `5.0s`.
  - Các sản phẩm mẫu bảng quà (`category === 'menu_template'`) không hiển thị badge thời lượng giây trên thẻ Cửa hàng.

---

## 2. KIẾN TRÚC MÁY CHỦ & CLOUD (DATABASE & RUNTIME)

- **KẾT NỐI TRỰC TIẾP MONGODB ATLAS:**
  - Hệ thống chạy cơ sở dữ liệu phân tán trên MongoDB Atlas Cloud (`MONGODB_URI`).
  - Mọi thao tác: Đăng ký, Đăng nhập, Tạo hiệu ứng, Mua hàng, Duyệt đơn đều tương tác trực tiếp với MongoDB Atlas.
- **TRIỆT ĐỂ NGẮT DỊCH VỤ RENDER CŨ:**
  - Tuyệt đối không thêm lại hoặc fallback về domain `https://effectstore-app.onrender.com`.
  - Biến `cloudApiUrl` / `CLOUD_API_URL` khi không dùng thì để chuỗi rỗng `''`, không được gán URL Render cũ làm fallback gây nghẽn mạng (timeout 6-10s).

---

## 3. DUYỆT ĐƠN HÀNG ADMIN (NON-BLOCKING APPROVAL)

- **KHÔNG KHÓA GIAO DIỆN KHI DUYỆT ĐƠN:**
  - Trong `desktop/renderer/js/home.js`, hàm `approvePayment` và `rejectPayment` **tuyệt đối không gọi `this.showAppLoadingOverlay(...)`**.
  - Chỉ dùng trạng thái spinner trực tiếp trên nút bấm (`button.innerHTML = '⏳ Đang duyệt...'`) để Admin có thể thao tác đa nhiệm và duyệt liên tục nhiều đơn hàng mà không bị đơ app.
  - Sau khi duyệt thành công, tự động làm mới danh sách chờ trong nền.

---

## 4. KÍCH HOẠT OBS & ĐỒNG BỘ PHIÊN LÀM VIỆC (OBS ISOLATION)

- **CÁCH LY TÀI KHOẢN KHI ĐĂNG XUẤT / ĐĂNG NHẬP:**
  - Khi người dùng đăng xuất (`logout()`), hệ thống phải gọi `POST /api/tiktok/gift-menu-overlay-clear` để dọn sạch overlay bảng quà của tài khoản cũ trên OBS, tránh lưu cache sang tài khoản mới.
- **PHÁT OBS TỨC THÌ (PREVIEW EFFECT PLAYER):**
  - Tuyến `POST /api/obs/preview-effect-player` xử lý trực tiếp quyền sở hữu trong bộ nhớ và gửi lệnh phát trong ~0.1s.

---

## 5. BẢO VỆ TRƯỚC KHI ĐÓNG GÓI PHÁT HÀNH (PRODUCTION PACKAGING)

- Khi build file cài đặt `.exe`:
  - Áp dụng Bytenode để biên dịch toàn bộ file `.js` sang mã máy nhị phân `.jsc`.
  - Không để lộ JWT secret hay database credentials dạng plain-text.
  - Chạy `npm test` để đảm bảo 100% tất cả test suites đều pass trước khi đóng gói.
