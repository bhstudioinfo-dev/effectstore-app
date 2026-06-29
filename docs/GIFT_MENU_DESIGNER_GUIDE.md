# Gift Menu Designer - Tài liệu Kiến trúc & Chức năng hệ thống
Tài liệu này ghi nhận toàn bộ các chức năng đã xây dựng, tối ưu hóa và nguyên lý vận hành của module **Gift Menu Designer** thuộc hệ thống **EffectStore App**.

---

## 1. Tổng quan & Tính năng cốt lõi (Features)
**Gift Menu Designer** là một bộ biên tập trực quan (WYSIWYG Canvas Editor) cho phép các Streamer thiết kế thực đơn quà tặng độc đáo, bảng mục tiêu (Goal board), bảng vinh danh (Contributors list), boss thử thách (Boss HP Challenge) và xuất bản chúng trực tiếp lên OBS Studio dưới dạng Overlay nguồn trình duyệt (Browser Source).

### Các Widget/Template được hỗ trợ:
1. **Danh sách quà tặng (Gift Stack Group)**: 
   * Gom nhiều phần quà vào một nhóm chung.
   * Hỗ trợ cuộn tự động (Marquee Scroll) lặp vòng vô hạn (infinite loop) theo cả chiều dọc (Vertical) và ngang (Horizontal).
   * Viền phát sáng động (Glow, Running light, Dashing march, Breathing) với các hiệu ứng hạt/năng lượng.
2. **Thanh mục tiêu (Goal Bar)**: Bảng tiến trình quà tặng dạng ngang cổ điển kèm hiệu ứng neon và tùy chỉnh màu sắc tự do.
3. **Mục tiêu vòng tròn (Goal Circle)**: Tiến trình tròn 3D hiển thị phần trăm trực quan kèm icon/quà tặng ở tâm.
4. **Boss HP Challenge (BossHP Bar)**: Thanh máu Boss cực lớn, tự động tụt máu dựa trên lượng quà được donate để tăng tương tác livestream.
5. **Rương bí ẩn (Mystery Chest)**: Tiến trình tích lũy mở rương báu.
6. **Bảng vinh danh (Top Contributors & Podium)**: Top 3 (dạng bục podium) hoặc Top danh sách người tặng quà nhiều nhất.
7. **Nhóm tổ hợp (Combo Widget)**: Hiển thị cấp độ combo nhân vật/multiplier khi được gửi quà liên tục.
8. **Danh sách mục tiêu (Goal List)**: Bảng cuộn đa mục tiêu hiển thị nhiều loại quà khác nhau cùng lúc.
9. **Widget Văn bản (Text)**: Thêm chữ tự do với các tùy chỉnh kích thước, màu sắc, font chữ và đổ bóng.
10. **Tài nguyên Media (Video/Image)**: Chèn ảnh hoặc video `.webm` làm hình nền hoặc hiệu ứng chuyển động.

---

## 2. Các phím tắt & Thao tác nhanh trên Canvas (Keyboard Shortcuts)
* **Delete / Backspace**: Xóa Layer đang chọn trên Canvas.
* **Ctrl + D**: Nhân bản nhanh (Duplicate) Layer đang chọn kèm tọa độ lệch nhẹ (offset) 15px.
* **Ctrl + Z / Ctrl + Y**: Undo / Redo các thao tác chỉnh sửa (di chuyển vị trí, thay đổi kích thước, căn lề...).
* **Thêm Chữ nhanh**: Bổ sung nút **"Thêm chữ"** trực tiếp trên Toolbar thiết kế của Canvas.

---

## 3. Kiến trúc luồng dữ liệu (Data & Rendering Flow)

```mermaid
graph TD
    A[Canvas Editor (gift-menu-designer.js)] -- 1. Lưu thiết kế --> B[Backend Server - Database]
    B -- 2. Trả về Layout JSON --> C[OBS Overlay client (gift-menu-overlay.html)]
    D[TikTok Live Stream Events / Test Button] -- 3. Đẩy sự kiện quà tặng --> B
    B -- 4. Cập nhật currentCount / savedAt --> C
```

1. **gift-menu-designer.js**: Nơi Streamer kéo thả thiết kế, thay đổi thuộc tính. Dữ liệu sau khi thiết kế sẽ được lưu xuống database thông qua API `/api/tiktok/save-gift-menu`.
2. **gift-menu-overlay.html**: Chạy độc lập trên OBS Studio dưới dạng Browser Source. File này định kỳ truy vấn API `/api/tiktok/gift-menu-overlay-layout` để lấy cấu hình thiết kế mới nhất.
3. **shared-render-engine.js**: Bộ thư viện render chung được chia sẻ giữa Designer (Electron app) và Overlay (OBS Client), giúp đảm bảo tỷ lệ hiển thị, giao diện và hiệu ứng khớp nhau 100%.

---

## 4. Giải pháp Tối ưu hóa Hiển thị (Crucial Performance Optimizations)

Để đảm bảo hiệu ứng livestream không bao giờ bị giật lag khi streamer nhận được quà liên tiếp dồn dập, chúng tôi đã triển khai hai cơ chế tối ưu hóa DOM nâng cao:

### A. Ký số trạng thái (State Signature Caching)
* **Vấn đề cũ**: Mỗi khi nhận được donate mới, timestamp `savedAt` của layout thay đổi, khiến OBS Overlay tiến hành xóa toàn bộ DOM và tạo lại từ đầu. Việc này làm tắt đột ngột các CSS Animation đang chạy (ví dụ: nhóm quà đang cuộn marquee) và reset về đầu.
* **Giải pháp tối ưu**:
  * Mỗi phần tử HTML (Widget) khi được vẽ ra sẽ mang một thuộc tính `data-state-signature`. Chữ ký này là chuỗi JSON mã hóa toàn bộ dữ liệu cấu hình, tọa độ và tiến trình hiện tại của riêng widget đó.
  * Trong mỗi chu kỳ render, nếu chữ ký cũ và chữ ký mới trùng nhau hoàn toàn (nghĩa là widget đó không liên quan đến đợt donate này), hệ thống sẽ **bỏ qua hoàn toàn**, không chỉnh sửa bất kỳ thuộc tính hay cấu trúc DOM nào của nó.

### B. Định vị DOM không xáo trộn (In-place DOM Positioning via insertBefore)
* **Vấn đề cũ**: Lệnh `appendChild` khi được gọi để xếp lớp z-index sẽ nhấc các thẻ HTML được cập nhật đặt lại xuống cuối danh sách con của DOM. Hành động này làm đảo lộn thứ tự DOM con và kích hoạt reset CSS Animation cho toàn bộ các phần tử anh em xung quanh nó.
* **Giải pháp tối ưu**:
  * Thay thế hoàn toàn bằng thuật toán đối chiếu vị trí index (`root.children[renderIndex] === el`).
  * Nếu phần tử đó nằm sai trật tự (ví dụ: thay đổi z-index ở designer), nó mới được sắp xếp lại bằng `insertBefore()`. 
  * Nếu phần tử nằm đúng trật tự (trường hợp nhận donate thông thường), trình duyệt sẽ giữ nguyên kết cấu DOM, duy trì CSS Animation chạy vô hạn tuần hoàn mượt mà 100%.

---

## 5. Danh sách các file liên quan trong Dự án

| Tên file | Vị trí | Chức năng |
| :--- | :--- | :--- |
| **gift-menu-designer.js** | `desktop/renderer/js/gift-menu-designer.js` | Quản lý logic bộ thiết kế menu trực quan, phím tắt và gửi dữ liệu test. |
| **gift-menu-overlay.html** | `backend/public/gift-menu-overlay.html` | Client chạy trên nguồn trình duyệt OBS Studio, định kỳ đồng bộ cấu hình hiển thị livestream. |
| **shared-render-engine.js** | `desktop/renderer/js/shared-render-engine.js` <br> `backend/public/shared-render-engine.js` | Trái tim bộ dựng hình dùng chung (render layout, widgets, boss challenge, marquee scrolling...). |
| **index.html** | `desktop/renderer/index.html` | File HTML chính của ứng dụng Electron, nạp designer js với mã hóa UTF-8. |
