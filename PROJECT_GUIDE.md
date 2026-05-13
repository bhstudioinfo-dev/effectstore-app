# 📘 SIÊU TÀI LIỆU HƯỚNG DẪN DỰ ÁN EFFECTSTORE
*(Tài liệu chuẩn để AI và Người dùng nắm bắt logic dự án trước khi xây dựng tính năng mới)*

---

## 🚀 1. LUỒNG VẬN HÀNH CỐT LÕI (THE CORE FLOW)
Đây là quy trình quan trọng nhất, biến món quà TikTok thành hiệu ứng trên OBS:

1. **Bước 1 (Lắng nghe):** `backend/services/tiktokService.js` kết nối với phòng live và bắt sự kiện quà tặng.
2. **Bước 2 (Phân phối):** `backend/server.js` nhận dữ liệu quà, tra cứu trong Database để tìm hiệu ứng tương ứng.
3. **Bước 3 (Xếp hàng):** `backend/services/effectQueue.js` đưa hiệu ứng vào danh sách chờ (Queue) để phát lần lượt (Sequential Playback).
4. **Bước 4 (Hiển thị):** `backend/services/obsService.js` gửi tín hiệu tới `desktop/renderer/overlay.html` (trang này được nhúng vào OBS) để phát video hiệu ứng.

---

## 📁 2. CHI TIẾT CÁC TỆP TIN QUAN TRỌNG

### A. FRONTEND (Giao diện người dùng) - `desktop/renderer/`
*   **`index.html`**: Chứa toàn bộ cấu trúc giao diện (HTML). Tất cả các Tab (Cửa hàng, Mapping, Cài đặt, Admin) đều nằm chung trong file này và được ẩn/hiện bằng CSS.
*   **`js/home.js`**: **BỘ NÃO GIAO DIỆN**.
    *   Xử lý tất cả click chuột, cập nhật số dư, hiển thị thông báo.
    *   Điều khiển việc chuyển đổi giữa các Tab.
    *   Chứa logic Nút Test (giả lập quà tặng).
*   **`js/gift-menu-designer.js`**: Module riêng cho công cụ thiết kế Menu quà tặng (kéo thả, tùy chỉnh Aura/Hiệu ứng).
*   **`styles/main.css`**: Định nghĩa phong cách "Premium Pro" (Glassmorphism, Neon, Blur).

### B. BACKEND (Xử lý hệ thống) - `backend/`
*   **`server.js`**: Entry point của server. Nơi khởi tạo kết nối Database (MongoDB) và WebSocket (Port 9001).
*   **`services/tiktokService.js`**: Quản lý kết nối với TikTok Live.
*   **`services/obsService.js`**: Quản lý kết nối với OBS và điều khiển các Browser Source.
*   **`routes/payment.js`**: Xử lý logic nạp tiền và quét mã QR tự động.
*   **`routes/effects.js`**: Quản lý kho video hiệu ứng (Upload, Stream video đã mã hóa để bảo mật).

---

## 🛠️ 3. QUY TẮC PHÁT TRIỂN (RULES FOR BUILDING)
*Khi thêm tính năng mới, PHẢI tuân thủ các quy tắc kỹ thuật sau để tránh lỗi hệ thống:*

### 🌐 A. Kết nối API & Bảo mật (Fix lỗi 401/403)
1.  **Không viết cứng địa chỉ:** Tuyệt đối không dùng `localhost:9000` hay `127.0.0.1:9000` trực tiếp. Luôn dùng `${this.API_URL}`.
2.  **Cú pháp chuẩn:** Luôn dùng Template Literals (dấu huyền) cho mọi đường dẫn API: `` fetch(`${this.API_URL}/api/...`) `` để tránh lỗi dấu nháy.
3.  **Token xác thực:** Mọi yêu cầu lên route `/api/admin/` hoặc `/api/user/` phải đính kèm Header `Authorization: Bearer ${this.authToken}`.
4.  **Bảo mật Video:** Hiệu ứng video phải được stream qua API (`/api/effects/stream/:id`) để tránh bị người dùng tải trực tiếp file gốc.

### 🎬 B. Xử lý Video & Media (Fix lỗi AbortError)
1.  **Bắt lỗi Play():** Các lệnh `video.play()` phải luôn có `.catch(e => {})` để tránh lỗi ngắt quãng khi người dùng di chuột nhanh.
2.  **Trạng thái chuẩn:** Luôn đặt `muted = true` trước khi gọi `play()` để đảm bảo trình duyệt không chặn tự động phát.
3.  **Dọn dẹp:** Khi `pause()` video, hãy đặt `currentTime = 0` để reset trạng thái cho lần xem sau.
4.  **Hàng đợi (Queue):** Tuyệt đối không được bỏ qua `effectQueue.js` khi hiển thị hiệu ứng trên OBS để tránh video bị chồng chéo.

### 🔄 C. Bảo trì & Vận hành
1.  **Electron Cache:** Sau khi sửa code JS (`home.js`), phải đóng hẳn App và mở lại hoặc nhấn `Ctrl + R` để nạp lại cache. Code JS trong Electron không tự cập nhật như web.
2.  **Tính Module:** Nếu tính năng mới quá lớn, hãy tạo file JS riêng trong `renderer/js/` thay vì viết thêm vào `home.js`.
3.  **Cấu hình:** Không được Hardcode dữ liệu. Luôn lấy Username, Token từ `localStorage` hoặc Database.

### ✨ D. Giao diện (UI/UX)
1.  **Glassmorphism:** Giữ đúng phong cách "Premium Pro": Nền `rgba` mờ, `backdrop-filter: blur()`, bo góc 16px.
2.  **Thông báo:** Dùng `this.showNotification(type, message)` thay vì `alert()`.


---

## 📝 4. CÁC ĐẦU MỤC CÔNG VIỆC THƯỜNG GẶP
*   **Thêm Tab mới:** Thêm một thẻ `<section>` trong `index.html` và thêm ID vào logic chuyển Tab trong `home.js`.
*   **Sửa lỗi kết nối TikTok:** Kiểm tra `backend/services/tiktokService.js`.
*   **Chỉnh sửa hiển thị trên OBS:** Chỉnh sửa file `desktop/renderer/overlay.html`.
*   **Quản lý Banner/Khuyến mãi:** Xem `backend/routes/banner.js` và phần Admin trong `index.html`.

---
*Tài liệu này là "Nguồn sự thật duy nhất" (Single Source of Truth). Hãy đọc kỹ trước khi bắt đầu bất kỳ tác vụ nào.*
